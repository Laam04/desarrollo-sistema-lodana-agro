import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { productionError } from '@/lib/production-api'
import { activeHarvest, activeLoss } from '@/lib/production-stock'
import { receivableStatuses } from '@/lib/shipment-status'

type UnitTotals = {
  unitId: string
  unitName: string
  harvested: Prisma.Decimal
  losses: Prisma.Decimal
  useful: Prisma.Decimal
  shipped: Prisma.Decimal
}

export async function GET() {
  try {
    const summary = await prisma.$transaction(async (tx) => {
      const [harvestCount, lossCount, costs, shipmentStatuses, units] = await Promise.all([
        tx.harvest.count({ where: activeHarvest }),
        tx.loss.count({ where: { ...activeLoss, harvest: activeHarvest } }),
        tx.cost.aggregate({ where: { deletedAt: null }, _count: true, _sum: { amountUsd: true } }),
        tx.shipment.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
        tx.$queryRaw<UnitTotals[]>`
          WITH movement AS (
            SELECT "unitId", SUM(quantity) AS harvested, 0::numeric AS losses,
                   0::numeric AS deducted, 0::numeric AS shipped
            FROM "Harvest" WHERE status = 'ACTIVE' AND "deletedAt" IS NULL
            GROUP BY "unitId"
            UNION ALL
            SELECT h."unitId", 0, SUM(l.quantity),
                   SUM(CASE WHEN l."affectsHarvest" IS TRUE THEN l.quantity ELSE 0 END), 0
            FROM "Loss" l JOIN "Harvest" h ON h.id = l."harvestId"
            WHERE l.status = 'ACTIVE' AND l."deletedAt" IS NULL
              AND h.status = 'ACTIVE' AND h."deletedAt" IS NULL
            GROUP BY h."unitId"
            UNION ALL
            SELECT i."unitId", 0, 0, 0, SUM(i.quantity)
            FROM "ShipmentItem" i JOIN "Shipment" s ON s.id = i."shipmentId"
            WHERE i."deletedAt" IS NULL AND s."deletedAt" IS NULL AND s.status <> 'CANCELLED'
            GROUP BY i."unitId"
          )
          SELECT m."unitId", u.name AS "unitName", SUM(harvested) AS harvested, SUM(losses) AS losses,
                 GREATEST(0, SUM(harvested) - SUM(deducted)) AS useful, SUM(shipped) AS shipped
          FROM movement m JOIN "Unit" u ON u.id = m."unitId"
          GROUP BY m."unitId", u.name
          ORDER BY u.name, m."unitId"
        `,
      ])
      const statuses = new Map(shipmentStatuses.map(({ status, _count }) => [status, _count]))
      return {
        harvests: { _count: harvestCount },
        losses: { _count: lossCount },
        costs,
        shipments: {
          _count: shipmentStatuses.reduce((count, row) => count + (row.status === 'CANCELLED' ? 0 : row._count), 0),
          pending: receivableStatuses.reduce((count, status) => count + (statuses.get(status) ?? 0), 0),
          received: statuses.get('RECEIVED') ?? 0,
        },
        units,
      }
    }, { isolationLevel: 'RepeatableRead' })
    return NextResponse.json(summary)
  } catch (error) {
    return productionError(error, 'No se pudo generar el resumen.')
  }
}
