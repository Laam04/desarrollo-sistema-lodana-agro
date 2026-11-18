import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import {
  cleanName,
  parseDate,
  parsePositiveDecimal,
} from '@/lib/production-validation'

const shipmentInclude = {
  items: {
    where: { deletedAt: null },
    include: {
      crop: true,
      variety: true,
      productionArea: true,
      unit: true,
      allocations: {
        where: { deletedAt: null },
        include: {
          harvest: true,
        },
      },
    },
  },
  receptions: {
    where: { deletedAt: null },
    include: {
      items: {
        where: { deletedAt: null },
      },
    },
  },
}

type ShipmentLine = {
  cropId: string
  varietyId?: string | null
  productionAreaId?: string | null
  quantity: unknown
  unitId?: string | null
  unitPrice?: unknown
  notes?: unknown
}

export async function GET() {
  const rows = await prisma.shipment.findMany({where: {
      deletedAt: null,
    },
    include: shipmentInclude,
    orderBy: { date: 'desc' },
    take: 100,
  })

  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    const date = parseDate(body.date)

    // Compatibilidad temporal con el formulario anterior de un solo cultivo.
    const items: ShipmentLine[] = Array.isArray(body.items)
      ? body.items as ShipmentLine[]
      : [{
          cropId: typeof body.cropId === 'string' ? body.cropId : '',
          varietyId: typeof body.varietyId === 'string' ? body.varietyId : null,
          productionAreaId:
            typeof body.productionAreaId === 'string'
              ? body.productionAreaId
              : typeof body.lotId === 'string'
                ? body.lotId
                : null,
          quantity: body.quantity,
          unitId: typeof body.unitId === 'string' ? body.unitId : null,
          unitPrice: body.unitPrice,
          notes: body.notes,
        }]

    if (!date || items.length === 0) {
      return NextResponse.json(
        { error: 'Indica una fecha y al menos un producto para el envío.' },
        { status: 400 }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.create({
        data: {
          code: `ENV-${randomUUID().slice(0, 8).toUpperCase()}`,
          date,
          notes: cleanName(body.notes) || null,
        },
      })

      for (const item of items) {
        const cropId = item.cropId
        const quantity = parsePositiveDecimal(item.quantity)
        const unitPrice = parsePositiveDecimal(item.unitPrice)

        if (!cropId || !quantity || !unitPrice) {
          throw new Error(
            'Cada producto debe tener cultivo, cantidad y precio unitario positivos.'
          )
        }

        const crop = await tx.crop.findFirst({
          where: { id: cropId, active: true, deletedAt: null },
include: {
  varieties: { where: { active: true, deletedAt: null } },
  productionAreas: { where: { active: true, deletedAt: null } },
},
        })

        if (!crop) {
          throw new Error('Uno de los cultivos no existe o está inactivo.')
        }

        const varietyId = item.varietyId || null
        const productionAreaId = item.productionAreaId || null

        if (
          varietyId &&
          !crop.varieties.some((variety) => variety.id === varietyId)
        ) {
          throw new Error('Una variedad no pertenece al cultivo seleccionado o está inactiva.')
        }

        if (
          productionAreaId &&
          !crop.productionAreas.some((area) => area.id === productionAreaId)
        ) {
          throw new Error('Un lote o zona no pertenece al cultivo seleccionado o está inactivo.')
        }

        const unitId = item.unitId || crop.unitId

if (!unitId) {
  throw new Error(`El cultivo ${crop.name} no tiene una unidad configurada.`)
}

const unit = await tx.unit.findFirst({
where: { id: unitId, active: true, deletedAt: null },
})

        if (!unit) {
          throw new Error('Una unidad seleccionada no existe o está inactiva.')
        }

        const harvests = await tx.harvest.findMany({
  where: {
  cropId,
  varietyId,
  productionAreaId,
  unitId: unit.id,
  status: 'ACTIVE',
  deletedAt: null,
  crop: {
    deletedAt: null,
  },
},
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        })

        let remaining = quantity
        const allocations: { harvestId: string; quantity: number }[] = []

        for (const harvest of harvests) {
          if (remaining <= 0) break

                    const [previousAllocations, previousLosses] = await Promise.all([
            tx.shipmentAllocation.aggregate({
              where: {
                harvestId: harvest.id,
                deletedAt: null,
                shipmentItem: {
                  deletedAt: null,
                  shipment: {
                    deletedAt: null,
                    status: { not: 'CANCELLED' },
                  },
                },
              },
              _sum: { quantity: true },
            }),

            tx.loss.aggregate({
              where: {
                harvestId: harvest.id,
                status: 'ACTIVE',
                deletedAt: null,
                affectsHarvest: true,
              },
              _sum: { quantity: true },
            }),
          ])

          const available =
            Number(harvest.quantity) -
            Number(previousAllocations._sum.quantity ?? 0) -
            Number(previousLosses._sum.quantity ?? 0)
          if (available <= 0) continue

          const allocated = Math.min(available, remaining)

          allocations.push({
            harvestId: harvest.id,
            quantity: allocated,
          })

          remaining -= allocated
        }

        if (remaining > 0.000001) {
          throw new Error(
            `Existencias insuficientes para ${crop.name}. Faltan ${remaining.toFixed(2)} ${unit.name}.`
          )
        }

        const itemRow = await tx.shipmentItem.create({
          data: {
            shipmentId: shipment.id,
            cropId,
            varietyId,
            productionAreaId,
            quantity,
            unitId: unit.id,
            estimatedUnitPrice: unitPrice,
            estimatedTotalAmount: quantity * unitPrice,
            notes: cleanName(item.notes) || null,
          },
        })

        await tx.shipmentAllocation.createMany({
          data: allocations.map((allocation) => ({
            shipmentItemId: itemRow.id,
            harvestId: allocation.harvestId,
            quantity: allocation.quantity,
          })),
        })
      }

            return tx.shipment.findUniqueOrThrow({
        where: { id: shipment.id },
        include: shipmentInclude,
      })
    }, {
      isolationLevel: 'Serializable',
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo registrar el envío.'
      if (
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'P2034'
) {
  return NextResponse.json(
    { error: 'El inventario cambió mientras se procesaba el envío. Inténtalo nuevamente.' },
    { status: 409 }
  )
}
    if (
      message.includes('no existe') ||
      message.includes('inactivo') ||
      message.includes('pertenece') ||
      message.includes('positivos') ||
      message.includes('insuficientes')
    ) {
      return NextResponse.json({ error: message }, { status: 400 })
    }

    console.error('Error al registrar envío:', error)

    return NextResponse.json(
      { error: 'No se pudo registrar el envío.' },
      { status: 500 }
    )
  }
}