import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ProductionError, productionError } from '@/lib/production-api'
import { committedStock, endOfDay, shipmentStock } from '@/lib/production-stock'
import { parseDate } from '@/lib/production-validation'
import { productKey } from '@/lib/shipments'
import { editableShipmentStatuses } from '@/lib/shipment-status'

type Availability = {
  cropId: string
  cropName: string
  varietyId: string | null
  varietyName: string | null
  productionAreaId: string | null
  productionAreaName: string | null
  unitId: string
  unitName: string
  available: Prisma.Decimal
  estimatedValue: Prisma.Decimal
  missingPrice: boolean
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const dateParam = params.get('asOf') ?? params.get('date')
    const date = parseDate(dateParam)
    if (dateParam !== null && !date) throw new ProductionError('La fecha indicada no es válida.')
    const exactDate = !params.has('asOf') && date
    const start = exactDate ? new Date(exactDate) : undefined
    start?.setUTCHours(0, 0, 0, 0)

    const result = await prisma.$transaction(async (tx) => {
      const shipmentId = params.get('editShipmentId')
      const editable = shipmentId ? await tx.shipment.findFirst({
        where: { id: shipmentId, deletedAt: null, status: { in: editableShipmentStatuses }, receptions: { none: { deletedAt: null } } },
        select: { id: true },
      }) : null

      const harvests = await tx.harvest.findMany({
        where: { ...shipmentStock, date: date ? { gte: start, lte: endOfDay(date) } : undefined },
        include: { crop: true, variety: true, productionArea: true, unit: true },
        orderBy: [{ crop: { name: 'asc' } }, { date: 'asc' }, { id: 'asc' }],
      })
      const committed = await committedStock(tx, harvests.map((harvest) => harvest.id), editable?.id)
      const grouped = new Map<string, Availability>()
      for (const harvest of harvests) {
        const key = productKey(harvest)
        const available = Prisma.Decimal.max(0, harvest.quantity.minus(committed.get(harvest.id) ?? 0))
        let stock = grouped.get(key)
        if (!stock) {
          stock = {
            cropId: harvest.cropId,
            cropName: harvest.crop.name,
            varietyId: harvest.varietyId,
            varietyName: harvest.variety?.name ?? null,
            productionAreaId: harvest.productionAreaId,
            productionAreaName: harvest.productionArea?.name ?? null,
            unitId: harvest.unitId,
            unitName: harvest.unit.name,
            available: new Prisma.Decimal(0),
            estimatedValue: new Prisma.Decimal(0),
            missingPrice: false,
          }
          grouped.set(key, stock)
        }

        if (available.gt(0)) {
          stock.available = stock.available.plus(available)
          if (harvest.estimatedUnitPrice?.gt(0)) {
            stock.estimatedValue = stock.estimatedValue.plus(available.mul(harvest.estimatedUnitPrice))
          } else {
            stock.missingPrice = true
          }
        }
      }

      return [...grouped.values()].map(({ estimatedValue, missingPrice, available, ...product }) => ({
        ...product,
        available: available.toNumber(),
        estimatedUnitPrice: !missingPrice && available.gt(0)
          ? estimatedValue.div(available).toFixed(2)
          : null,
      }))
    }, { isolationLevel: 'RepeatableRead' })
    return NextResponse.json(result)
  } catch (error) {
    return productionError(error, 'No se pudieron consultar las existencias disponibles.')
  }
}
