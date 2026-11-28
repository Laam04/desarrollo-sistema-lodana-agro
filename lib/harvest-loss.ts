import { Prisma } from '@prisma/client'
import { ProductionError } from '@/lib/production-api'
import { activeHarvest, committedStock } from '@/lib/production-stock'
import { cleanName, normalizeCatalogName, parseDate, parsePositiveDecimal } from '@/lib/production-validation'
import { cleanReceiptImageName, defaultReceiptFileName, parseReceiptImageDataUrl } from '@/lib/receipt-image'
import { retireIfExpired } from '@/lib/trash'

export const lossInclude = {
  harvest: { include: { crop: true, variety: true, productionArea: true, unit: true } },
  reason: true,
} satisfies Prisma.LossInclude

export const lossSelect = {
  id: true,
  harvestId: true,
  date: true,
  quantity: true,
  affectsHarvest: true,
  reasonId: true,
  notes: true,
  evidenceImageName: true,
  status: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  ...lossInclude,
} satisfies Prisma.LossSelect

export function serializeLoss<T extends { id: string; evidenceImageName: string | null; updatedAt: Date }>(row: T) {
  const hasEvidenceImage = Boolean(row.evidenceImageName)
  return {
    ...row,
    hasEvidenceImage,
    evidenceImageUrl: hasEvidenceImage ? `/api/losses/${row.id}/photo?v=${row.updatedAt.getTime()}` : null,
  }
}

export function lossDraft(body: Record<string, unknown>) {
  const date = parseDate(body.date)
  const quantity = parsePositiveDecimal(body.quantity)
  const reason = cleanName(body.reason)
  const { affectsHarvest } = body
  if (!date || !quantity || !reason || reason.length > 120 || typeof affectsHarvest !== 'boolean') {
    throw new ProductionError('Indica fecha, cantidad positiva (hasta dos decimales), motivo y si la merma descuenta del inventario.')
  }
  let evidenceImagePatch: { evidenceImage: string | null; evidenceImageName: string | null } | undefined
  if (body.evidenceImage !== undefined) {
    if (body.evidenceImage === null || body.evidenceImage === '') {
      evidenceImagePatch = { evidenceImage: null, evidenceImageName: null }
    } else {
      const parsedImage = parseReceiptImageDataUrl(body.evidenceImage)
      if (!parsedImage) {
        throw new ProductionError('La foto del daño debe ser una imagen JPG, PNG o WebP válida (máximo 1 MB).', 400)
      }
      evidenceImagePatch = {
        evidenceImage: parsedImage.dataUrl,
        evidenceImageName:
          cleanReceiptImageName(body.evidenceImageName) ?? defaultReceiptFileName(parsedImage.mime),
      }
    }
  }
  return {
    date,
    quantity,
    reason,
    affectsHarvest,
    notes: cleanName(body.notes).slice(0, 2000) || null,
    evidenceImagePatch,
  }
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

  const normalizedName = normalizeCatalogName(draft.reason)
  const allReasons = await tx.lossReason.findMany()
  let existingReason =
    allReasons.find((item) => item.normalizedName === normalizedName) ??
    allReasons.find((item) => normalizeCatalogName(item.name) === normalizedName) ??
    null
  if (existingReason?.deletedAt) {
    if (await retireIfExpired(tx, 'lossReason', existingReason)) existingReason = null
    else throw new ProductionError('El motivo de merma está en la papelera.', 409)
  }
  const reason = existingReason
    ? await tx.lossReason.update({ where: { id: existingReason.id }, data: { active: true } })
    : await tx.lossReason.create({ data: { name: draft.reason, normalizedName } })

  const { date, quantity, affectsHarvest, notes, evidenceImagePatch } = draft
  const data = {
    harvestId,
    date,
    quantity,
    affectsHarvest,
    notes,
    reasonId: reason.id,
    ...(evidenceImagePatch ?? {}),
  }
  const saved = id
    ? await tx.loss.update({ where: { id }, data, select: lossSelect })
    : await tx.loss.create({ data: { ...data, createdBy: actor }, select: lossSelect })
  return serializeLoss(saved)
}
