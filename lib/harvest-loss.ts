import { Prisma } from '@prisma/client'
import { ProductionError } from '@/lib/production-api'
import { activeHarvest, committedStock } from '@/lib/production-stock'
import { cleanName, normalizeName, parseDate, parsePositiveDecimal } from '@/lib/production-validation'

export const lossInclude = {
  harvest: { include: { crop: true, variety: true, productionArea: true, unit: true } },
  reason: true,
} satisfies Prisma.LossInclude

export function lossDraft(body: Record<string, unknown>) {
  const date = parseDate(body.date)
  const quantity = parsePositiveDecimal(body.quantity)
  const reason = cleanName(body.reason)
  const { affectsHarvest } = body
  if (!date || !quantity || !reason || reason.length > 120 || typeof affectsHarvest !== 'boolean') {
    throw new ProductionError('Indica fecha, cantidad positiva (hasta dos decimales), motivo y si la merma descuenta del inventario.')
  }
  return { date, quantity, reason, affectsHarvest, notes: cleanName(body.notes).slice(0, 2000) || null }
}

export async function saveLoss(
  tx: Prisma.TransactionClient,
  harvestId: string,
  draft: ReturnType<typeof lossDraft>,
  actor: string | null,
  id?: string,
) {
  const harvest = await tx.harvest.findFirst({ where: { id: harvestId, ...activeHarvest } })
  if (!harvest) throw new ProductionError('La cosecha no existe o está inactiva.', 404)
  if (draft.date.toISOString().slice(0, 10) < harvest.date.toISOString().slice(0, 10)) {
    throw new ProductionError('La fecha de la merma debe ser igual o posterior a la fecha de la cosecha.')
  }
  if (draft.affectsHarvest) {
    const committed = await committedStock(tx, [harvestId], undefined, id)
    const available = Prisma.Decimal.max(0, harvest.quantity.minus(committed.get(harvestId) ?? 0))
    if (available.lt(draft.quantity)) {
      throw new ProductionError(`La merma supera la producción útil disponible de ${available.toFixed(2)}.`, 409)
    }
  }

  const normalizedName = normalizeName(draft.reason)
  const reason = await tx.lossReason.upsert({
    where: { normalizedName },
    update: { active: true },
    create: { name: draft.reason, normalizedName },
  })
  if (reason.deletedAt) throw new ProductionError('El motivo de merma está en la papelera.', 409)

  const { date, quantity, affectsHarvest, notes } = draft
  const data = { harvestId, date, quantity, affectsHarvest, notes, reasonId: reason.id }
  return id
    ? tx.loss.update({ where: { id }, data, include: lossInclude })
    : tx.loss.create({ data: { ...data, createdBy: actor }, include: lossInclude })
}
