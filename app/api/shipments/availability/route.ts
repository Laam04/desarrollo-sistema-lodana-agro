import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')

    let dateFilter = {}

    if (dateParam) {
      const date = new Date(`${dateParam}T00:00:00`)

      if (Number.isNaN(date.getTime())) {
        return NextResponse.json(
          { error: 'La fecha indicada no es válida.' },
          { status: 400 },
        )
      }

      const nextDate = new Date(date)
      nextDate.setDate(nextDate.getDate() + 1)

      dateFilter = {
        date: {
          gte: date,
          lt: nextDate,
        },
      }
    }

    const harvests = await prisma.harvest.findMany({
      where: {
        ...dateFilter,
        status: 'ACTIVE',
        deletedAt: null,
        crop: {
          is: {
            active: true,
            deletedAt: null,
          },
        },
        unit: {
          is: {
            active: true,
            deletedAt: null,
          },
        },
      },
      include: {
        crop: true,
        variety: true,
        productionArea: true,
        unit: true,
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    })

    const availability = await Promise.all(
      harvests.map(async (harvest) => {
        const [allocations, losses] = await Promise.all([
          prisma.shipmentAllocation.aggregate({
            where: {
              harvestId: harvest.id,
              deletedAt: null,
              shipmentItem: {
                is: {
                  deletedAt: null,
                  shipment: {
                    is: {
                      deletedAt: null,
                      status: { not: 'CANCELLED' },
                    },
                  },
                },
              },
            },
            _sum: { quantity: true },
          }),
          prisma.loss.aggregate({
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
          Number(allocations._sum.quantity ?? 0) -
          Number(losses._sum.quantity ?? 0)

        return {
          harvestId: harvest.id,
          cropId: harvest.cropId,
          cropName: harvest.crop.name,
          varietyId: harvest.varietyId,
          varietyName: harvest.variety?.name ?? null,
          productionAreaId: harvest.productionAreaId,
          productionAreaName: harvest.productionArea?.name ?? null,
          unitId: harvest.unitId,
          unitName: harvest.unit.name,
          available: Math.max(0, available),
        }
      }),
    )

    const grouped = new Map<string, {
      cropId: string
      cropName: string
      varietyId: string | null
      varietyName: string | null
      productionAreaId: string | null
      productionAreaName: string | null
      unitId: string
      unitName: string
      available: number
    }>()

    for (const item of availability) {
      const key = [
        item.cropId,
        item.varietyId ?? '',
        item.productionAreaId ?? '',
        item.unitId,
      ].join('|')

      const current = grouped.get(key)

      if (current) {
        current.available += item.available
      } else {
        grouped.set(key, {
          cropId: item.cropId,
          cropName: item.cropName,
          varietyId: item.varietyId,
          varietyName: item.varietyName,
          productionAreaId: item.productionAreaId,
          productionAreaName: item.productionAreaName,
          unitId: item.unitId,
          unitName: item.unitName,
          available: item.available,
        })
      }
    }

    return NextResponse.json(Array.from(grouped.values()))
  } catch (error) {
    console.error('Error al consultar existencias:', error)

    return NextResponse.json(
      { error: 'No se pudieron consultar las existencias disponibles.' },
      { status: 500 },
    )
  }
}
