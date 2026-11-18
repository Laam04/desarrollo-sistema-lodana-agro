import { Prisma } from '@prisma/client'

type StockReader = Pick<Prisma.TransactionClient, 'harvest' | 'shipmentAllocation' | 'loss'>

export const activeHarvest = { status: 'ACTIVE', deletedAt: null } satisfies Prisma.HarvestWhereInput
export const activeLoss = { status: 'ACTIVE', deletedAt: null } satisfies Prisma.LossWhereInput
export const stockAllocation = {
  deletedAt: null,
  shipmentItem: { deletedAt: null, shipment: { deletedAt: null, status: { not: 'CANCELLED' } } },
} satisfies Prisma.ShipmentAllocationWhereInput

export const shipmentStock = {
  ...activeHarvest,
  crop: { active: true, deletedAt: null },
  unit: { active: true, deletedAt: null },
} satisfies Prisma.HarvestWhereInput

export async function committedStock(db: StockReader, harvestIds: string[], excludeShipmentId?: string, excludeLossId?: string) {
  if (!harvestIds.length) return new Map<string, Prisma.Decimal>()
  const harvestId = { in: harvestIds }
  const [allocations, losses] = await Promise.all([
    db.shipmentAllocation.groupBy({
      by: ['harvestId'],
      where: {
        ...stockAllocation,
        harvestId,
        shipmentItem: { ...stockAllocation.shipmentItem, shipmentId: excludeShipmentId ? { not: excludeShipmentId } : undefined },
      },
      _sum: { quantity: true },
    }),
    db.loss.groupBy({
      by: ['harvestId'],
      where: { ...activeLoss, harvestId, affectsHarvest: true, id: excludeLossId ? { not: excludeLossId } : undefined },
      _sum: { quantity: true },
    }),
  ])
  const totals = new Map<string, Prisma.Decimal>()
  for (const row of [...allocations, ...losses]) {
    totals.set(row.harvestId, (totals.get(row.harvestId) ?? new Prisma.Decimal(0)).plus(row._sum.quantity ?? 0))
  }
  return totals
}

export function endOfDay(date: Date) {
  const end = new Date(date)
  end.setUTCHours(23, 59, 59, 999)
  return end
}
