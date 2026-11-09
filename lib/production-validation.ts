import { prisma } from '@/lib/prisma'

export function cleanName(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

export function parsePositiveDecimal(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function parseDate(value: unknown) {
  if (typeof value !== 'string' || !value) return null
  const date = new Date(`${value}T12:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function validateCropReferences(body: Record<string, unknown>, cropId: string) {
  const crop = await prisma.crop.findFirst({ where: { id: cropId, active: true }, include: { varieties: { where: { active: true } }, lots: { where: { active: true } }, unit: true } })
  if (!crop) return { error: 'El cultivo no existe o está inactivo.' as const }
  const varietyId = typeof body.varietyId === 'string' && body.varietyId ? body.varietyId : null
  const lotId = typeof body.lotId === 'string' && body.lotId ? body.lotId : null
  if (varietyId && !crop.varieties.some((item) => item.id === varietyId)) return { error: 'La variedad no pertenece al cultivo seleccionado.' as const }
  if (lotId && !crop.lots.some((item) => item.id === lotId)) return { error: 'El lote no pertenece al cultivo seleccionado.' as const }
  return { crop, varietyId, lotId }
}

export async function validateUnit(unitId: unknown) {
  const id = typeof unitId === 'string' ? unitId : ''
  if (!id) return null
  return prisma.unit.findFirst({ where: { id, active: true } })
}
