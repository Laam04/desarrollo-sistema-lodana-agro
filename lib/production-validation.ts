
import { prisma } from '@/lib/prisma'

export function cleanName(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ')
    : ''
}

export function normalizeName(value: string): string {
  return cleanName(value).toLocaleLowerCase('es-EC')
}

export function parsePositiveDecimal(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null

  const date = new Date(`${value}T12:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function validateCropReferences(
  body: Record<string, unknown>,
  cropId: string
) {
  const crop = await prisma.crop.findFirst({
    where: {
  id: cropId,
  active: true,
  deletedAt: null,
},
include: {
  varieties: {
    where: {
      active: true,
      deletedAt: null,
    },
  },
  productionAreas: {
    where: {
      active: true,
      deletedAt: null,
    },
  },
},
  })

  if (!crop) {
    return { error: 'El cultivo no existe o está inactivo.' as const }
  }

  const varietyId =
    typeof body.varietyId === 'string' && body.varietyId
      ? body.varietyId
      : null

  const productionAreaId =
    typeof body.productionAreaId === 'string' && body.productionAreaId
      ? body.productionAreaId
      : null

  if (varietyId && !crop.varieties.some((item) => item.id === varietyId)) {
    return {
      error: 'La variedad no pertenece al cultivo seleccionado o está inactiva.' as const,
    }
  }

  if (
    productionAreaId &&
    !crop.productionAreas.some((item) => item.id === productionAreaId)
  ) {
    return {
      error: 'El lote o zona no pertenece al cultivo seleccionado o está inactivo.' as const,
    }
  }

  return { crop, varietyId, productionAreaId }
}

export async function validateUnit(unitId: unknown) {
  const id = typeof unitId === 'string' ? unitId : ''

  if (!id) return null

  return prisma.unit.findFirst({
    where: {
      id,
      active: true,
      deletedAt: null,
    },
  })
}
