import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { moveToTrash } from '@/lib/trash'

function cleanName(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ')
    : ''
}

function normalizeName(value: string): string {
  return cleanName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}
type AreaDraft = {
  name: string
  normalizedName: string
  type: 'LOT' | 'ZONE'
  surface: number | null
  surfaceUnit: string | null
  notes: string | null
}

function uniqueNames(value: unknown): { name: string; normalizedName: string }[] {
  if (!Array.isArray(value)) return []

  const result = new Map<string, { name: string; normalizedName: string }>()

  for (const item of value) {
    const name = cleanName(typeof item === 'string' ? item : item?.name)
    const normalized = normalizeName(name)

    if (name && normalized && !result.has(normalized)) {
      result.set(normalized, { name, normalizedName: normalized })
    }
  }

  return [...result.values()]
}

function getAreaDrafts(body: any): AreaDraft[] {
  let source: any[] = []

  if (Array.isArray(body.productionAreas)) {
    source = body.productionAreas
  } else {
    if (Array.isArray(body.lots)) {
source.push(...body.lots.map((item: any) => ({ ...item, type: 'LOT' })))    }
    if (Array.isArray(body.zones)) {
source.push(...body.zones.map((item: any) => ({ ...item, type: 'ZONE' })))    }
  }

  const result = new Map<string, AreaDraft>()

  for (const item of source) {
    const name = cleanName(typeof item === 'string' ? item : item?.name)
    const normalized = normalizeName(name)
    if (!name || !normalized) continue

    const type = item?.type === 'ZONE' ? 'ZONE' : 'LOT'
    const parsedSurface =
      item?.surface === '' || item?.surface == null
        ? null
        : Number(item.surface)

    result.set(normalized, {
      name,
      normalizedName: normalized,
      type,
      surface:
        parsedSurface !== null && Number.isFinite(parsedSurface)
          ? parsedSurface
          : null,
      surfaceUnit: cleanName(item?.surfaceUnit) || null,
      notes: cleanName(item?.notes) || null,
    })
  }

  return [...result.values()]
}

async function syncVarieties(
  tx: Prisma.TransactionClient,
  cropId: string,
  varieties: { name: string; normalizedName: string }[],
) {
  await tx.variety.updateMany({
    where: { cropId },
    data: { active: false },
  })

  for (const variety of varieties) {
    const existing = await tx.variety.findFirst({
      where: { cropId, normalizedName: variety.normalizedName },
    })

    if (existing) {
      await tx.variety.update({
        where: { id: existing.id },
        data: { name: variety.name, active: true },
      })
    } else {
      await tx.variety.create({
        data: {
          cropId,
          name: variety.name,
          normalizedName: variety.normalizedName,
          active: true,
        },
      })
    }
  }
}

async function syncProductionAreas(
  tx: Prisma.TransactionClient,
  cropId: string,
  areas: AreaDraft[],
) {
  await tx.productionArea.updateMany({
    where: { cropId },
    data: { active: false },
  })

  for (const area of areas) {
    const existing = await tx.productionArea.findFirst({
      where: { cropId, normalizedName: area.normalizedName },
    })

    const data = {
      name: area.name,
      type: area.type,
      surface: area.surface,
      surfaceUnit: area.surfaceUnit,
      notes: area.notes,
      active: true,
    }

    if (existing) {
      await tx.productionArea.update({
        where: { id: existing.id },
        data,
      })
    } else {
      await tx.productionArea.create({
        data: {
          cropId,
          normalizedName: area.normalizedName,
          ...data,
        },
      })
    }
  }
}

function getCatalogData(body: any, existing?: any) {
  const name = cleanName(body.name ?? existing?.name)
  const normalizedName = normalizeName(name)
  const unitId = body.unitId ?? existing?.unitId

  return {
    name,
    normalizedName,
    unitId,
    hasVarieties:
      typeof body.hasVarieties === 'boolean'
        ? body.hasVarieties
        : existing?.hasVarieties ?? false,
    hasProductionAreas:
      typeof body.hasProductionAreas === 'boolean'
        ? body.hasProductionAreas
        : existing?.hasProductionAreas ?? false,
    tracksSurface:
      typeof body.tracksSurface === 'boolean'
        ? body.tracksSurface
        : existing?.tracksSurface ?? false,
    hasOtherDetails:
      typeof body.hasOtherDetails === 'boolean'
        ? body.hasOtherDetails
        : existing?.hasOtherDetails ?? false,
  }
}

async function validateUnit(unitId: string | null | undefined) {
  if (!unitId) return false

  const unit = await prisma.unit.findFirst({
    where: { id: unitId, active: true },
  })

  return Boolean(unit)
}

const cropInclude = {
  unit: true,
  varieties: true,
  productionAreas: true,
}

export async function GET(request: NextRequest) {
  try {
    const includeInactive =
      request.nextUrl.searchParams.get('includeInactive') === 'true'

    const crops = await prisma.crop.findMany({
      where: includeInactive ? {} : { active: true },
      include: {
        unit: true,
        varieties: {
          where: includeInactive ? {} : { active: true },
          orderBy: { name: 'asc' },
        },
        productionAreas: {
          where: includeInactive ? {} : { active: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(crops)
  } catch (error) {
    console.error('Error al consultar cultivos:', error)
    return NextResponse.json(
      { error: 'No se pudieron consultar los cultivos.' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = getCatalogData(body)

    if (!data.name || !data.normalizedName) {
      return NextResponse.json(
        { error: 'El nombre del cultivo es obligatorio.' },
        { status: 400 },
      )
    }

    if (!(await validateUnit(data.unitId))) {
      return NextResponse.json(
        { error: 'Selecciona una unidad de medida activa.' },
        { status: 400 },
      )
    }

    const existing = await prisma.crop.findUnique({
      where: { normalizedName: data.normalizedName },
    })

if (existing?.active) {
  return NextResponse.json(
    { error: 'Ya existe un cultivo con ese nombre.' },
    { status: 409 },
  )
}

    const varieties = uniqueNames(body.varieties)
    const areas = getAreaDrafts(body)

    const crop = await prisma.$transaction(async (tx) => {
      let savedCrop

      if (existing) {
        savedCrop = await tx.crop.update({
          where: { id: existing.id },
          data: { ...data, active: existing.active },
        })
      } else {
        savedCrop = await tx.crop.create({
          data: { ...data, active: true },
        })
      }

      if (Array.isArray(body.varieties)) {
        await syncVarieties(tx, savedCrop.id, varieties)
      }

      if (
        Array.isArray(body.productionAreas) ||
        Array.isArray(body.lots) ||
        Array.isArray(body.zones)
      ) {
        await syncProductionAreas(tx, savedCrop.id, areas)
      }

      return tx.crop.findUnique({
        where: { id: savedCrop.id },
        include: cropInclude,
      })
    })

    return NextResponse.json(crop, { status: existing ? 200 : 201 })
  } catch (error) {
    console.error('Error al guardar cultivo:', error)
    return NextResponse.json(
      { error: 'No se pudo guardar el cultivo.' },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.id) {
      return NextResponse.json(
        { error: 'Falta el identificador del cultivo.' },
        { status: 400 },
      )
    }

    const existing = await prisma.crop.findUnique({
      where: { id: body.id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'El cultivo no existe.' },
        { status: 404 },
      )
    }
    // Permite reactivar o desactivar sin modificar el catálogo.
    if (typeof body.active === 'boolean' && body.name === undefined) {
      const crop = await prisma.crop.update({
        where: { id: body.id },
        data: { active: body.active },
        include: cropInclude,
      })

      return NextResponse.json(crop)
    }

    const data = getCatalogData(body, existing)

    if (!data.name || !data.normalizedName) {
      return NextResponse.json(
        { error: 'El nombre del cultivo es obligatorio.' },
        { status: 400 },
      )
    }

    const duplicate = await prisma.crop.findUnique({
      where: { normalizedName: data.normalizedName },
    })

    if (duplicate && duplicate.id !== existing.id) {
      return NextResponse.json(
        { error: 'Ya existe otro cultivo con ese nombre.' },
        { status: 409 },
      )
    }

    if (!(await validateUnit(data.unitId))) {
      return NextResponse.json(
        { error: 'Selecciona una unidad de medida activa.' },
        { status: 400 },
      )
    }

    const varieties = uniqueNames(body.varieties)
    const areas = getAreaDrafts(body)

    const crop = await prisma.$transaction(async (tx) => {
      await tx.crop.update({
        where: { id: body.id },
        data: { ...data, active: existing.active },
      })

      if (Array.isArray(body.varieties)) {
        await syncVarieties(tx, body.id, varieties)
      }

      if (
        Array.isArray(body.productionAreas) ||
        Array.isArray(body.lots) ||
        Array.isArray(body.zones)
      ) {
        await syncProductionAreas(tx, body.id, areas)
      }

      return tx.crop.findUnique({
        where: { id: body.id },
        include: cropInclude,
      })
    })

    return NextResponse.json(crop)
  } catch (error) {
    console.error('Error al actualizar cultivo:', error)
    return NextResponse.json(
      { error: 'No se pudo actualizar el cultivo.' },
      { status: 500 },
    )
  }
}



export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.id || typeof body.confirmName !== 'string') {
      return NextResponse.json(
        { error: 'Se requiere el identificador y la confirmación del cultivo.' },
        { status: 400 },
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const crop = await tx.crop.findUnique({
        where: { id: body.id },
      })

      if (!crop) {
        return { type: 'NOT_FOUND' as const }
      }

      if (body.confirmName.trim() !== crop.name) {
        return { type: 'INVALID_CONFIRMATION' as const }
      }

      const groupId = `crop-${crop.id}-${Date.now()}`

      const [varieties, areas] = await Promise.all([
        tx.variety.findMany({
          where: {
            cropId: crop.id,
            deletedAt: null,
          },
          select: { id: true },
        }),
        tx.productionArea.findMany({
          where: {
            cropId: crop.id,
            deletedAt: null,
          },
          select: { id: true },
        }),
      ])

      for (const variety of varieties) {
        await moveToTrash(
          tx,
          'variety',
          variety.id,
          groupId,
        )
      }

      for (const area of areas) {
        await moveToTrash(
          tx,
          'productionArea',
          area.id,
          groupId,
        )
      }

      await moveToTrash(
        tx,
        'crop',
        crop.id,
        groupId,
      )

      return {
        type: 'DELETED' as const,
        groupId,
      }
    })

    if (result.type === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'El cultivo no existe o ya está en la papelera.' },
        { status: 404 },
      )
    }

    if (result.type === 'INVALID_CONFIRMATION') {
      return NextResponse.json(
        { error: 'El nombre de confirmación no coincide.' },
        { status: 400 },
      )
    }

    return NextResponse.json({
      success: true,
      message: 'El cultivo se movió a la papelera.',
      groupId: result.groupId,
    })
  } catch (error) {
    console.error('Error al mover el cultivo a la papelera:', error)

    return NextResponse.json(
      { error: 'No se pudo mover el cultivo a la papelera.' },
      { status: 500 },
    )
  }
}


