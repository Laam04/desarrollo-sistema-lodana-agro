import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma, runSerializable } from '@/lib/prisma'
import { isRecord, ProductionError, productionError, readBody, requireProfile } from '@/lib/production-api'
import { activeHarvest, committedStock } from '@/lib/production-stock'
import { cleanName, normalizeCatalogName, parseSurface } from '@/lib/production-validation'
import { receivableStatuses } from '@/lib/shipment-status'
import { moveToTrash, retireIfExpired } from '@/lib/trash'

const cropInclude = {
  unit: true,
  varieties: { where: { deletedAt: null }, orderBy: { name: 'asc' } },
  productionAreas: { where: { deletedAt: null }, orderBy: { name: 'asc' } },
} satisfies Prisma.CropInclude

type Crop = Prisma.CropGetPayload<{ include: typeof cropInclude }>
type CatalogName = { name: string; normalizedName: string }
type AreaDraft = CatalogName & {
  id?: string; type: 'LOT' | 'ZONE'; surface: number | null; surfaceUnit: string | null
}

function catalogName(value: unknown): CatalogName {
  const name = cleanName(value)
  const normalizedName = normalizeCatalogName(name)
  if (!normalizedName || name.length > 120) throw new ProductionError('Usa nombres de hasta 120 caracteres.')
  return { name, normalizedName }
}

function catalogRows(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > 100) throw new ProductionError(`Indica hasta 100 ${label} por cultivo.`)
  return value
}

function varietyDrafts(value: unknown) {
  const rows = catalogRows(value, 'variedades').map((item) => catalogName(isRecord(item) ? item.name : item))
  return [...new Map(rows.map((row) => [row.normalizedName, row])).values()]
}

function areaDrafts(body: Record<string, unknown>): AreaDraft[] | undefined {
  if (body.productionAreas === undefined && body.lots === undefined && body.zones === undefined) return undefined
  const rows = body.productionAreas === undefined
    ? [
        ...catalogRows(body.lots ?? [], 'lotes').map((item) => ({ ...(isRecord(item) ? item : { name: item }), type: 'LOT' })),
        ...catalogRows(body.zones ?? [], 'zonas').map((item) => ({ ...(isRecord(item) ? item : { name: item }), type: 'ZONE' })),
      ]
    : catalogRows(body.productionAreas, 'áreas')
  if (rows.length > 100) throw new ProductionError('Indica hasta 100 áreas por cultivo.')

  const names = new Set<string>()
  const ids = new Set<string>()
  return rows.map((value) => {
    const item = isRecord(value) ? value : { name: value }
    const name = catalogName(item.name)
    const id = typeof item.id === 'string' && item.id ? item.id : undefined
    const type = item.type === 'ZONE' ? 'ZONE' : 'LOT'
    const surface = item.surface == null || item.surface === '' || type === 'ZONE' ? null : parseSurface(item.surface)
    if (type === 'LOT' && item.surface != null && item.surface !== '' && surface === null) {
      throw new ProductionError('Indica una superficie válida de hasta dos decimales.')
    }
    if (names.has(name.normalizedName) || (id && ids.has(id))) throw new ProductionError('Cada área debe tener un nombre diferente.')
    names.add(name.normalizedName)
    if (id) ids.add(id)
    return {
      ...name, id, type, surface,
      surfaceUnit: type === 'LOT' ? cleanName(item.surfaceUnit).slice(0, 24) || 'ha' : null,
    }
  })
}

async function syncVarieties(tx: Prisma.TransactionClient, cropId: string, rows: CatalogName[]) {
  const existing = await tx.variety.findMany({ where: { cropId } })
  const byName = new Map(existing.map((row) => [row.normalizedName, row]))
  const activeIds: string[] = []
  for (const row of rows) {
    let prior = byName.get(row.normalizedName) ?? existing.find((item) => normalizeCatalogName(item.name) === row.normalizedName)
    if (prior?.deletedAt) {
      if (await retireIfExpired(tx, 'variety', prior)) prior = undefined
      else throw new ProductionError('Una variedad está en la papelera. Restáurala antes de utilizarla.', 409)
    }
    if (prior) {
      if (!prior.active || prior.name !== row.name || prior.normalizedName !== row.normalizedName) {
        await tx.variety.update({ where: { id: prior.id }, data: { ...row, active: true } })
      }
      activeIds.push(prior.id)
    } else {
      activeIds.push((await tx.variety.create({ data: { ...row, cropId } })).id)
    }
  }
  await tx.variety.updateMany({ where: { cropId, active: true, deletedAt: null, id: { notIn: activeIds } }, data: { active: false } })
}

async function syncAreas(tx: Prisma.TransactionClient, cropId: string, rows: AreaDraft[]) {
  const existing = await tx.productionArea.findMany({ where: { cropId } })
  const byName = new Map(existing.map((row) => [row.normalizedName, row]))
  const byId = new Map(existing.map((row) => [row.id, row]))
  const activeIds: string[] = []
  for (const { id, ...row } of rows) {
    let matching = byName.get(row.normalizedName) ?? existing.find((item) => normalizeCatalogName(item.name) === row.normalizedName)
    let prior = id ? byId.get(id) : matching
    if (id && !prior) throw new ProductionError('Una de las áreas no pertenece a este cultivo.')
    if (matching?.deletedAt && (await retireIfExpired(tx, 'productionArea', matching))) {
      if (prior?.id === matching.id) prior = undefined
      matching = undefined
    }
    if (prior?.deletedAt || matching?.deletedAt) throw new ProductionError('Un lote o zona está en la papelera.', 409)
    if (matching && prior?.id !== matching.id) throw new ProductionError('Ya existe un área con ese nombre.', 409)
    const zone = await tx.zone.upsert({
      where: { normalizedName: row.normalizedName }, update: {},
      create: { name: row.name, normalizedName: row.normalizedName },
    })
    if (prior) {
      await tx.productionArea.update({ where: { id: prior.id }, data: { ...row, zoneId: zone.id, active: true } })
      activeIds.push(prior.id)
    } else {
      activeIds.push((await tx.productionArea.create({ data: { ...row, cropId, zoneId: zone.id } })).id)
    }
  }
  await tx.productionArea.updateMany({ where: { cropId, active: true, deletedAt: null, id: { notIn: activeIds } }, data: { active: false } })
}

async function linkZones(tx: Prisma.TransactionClient, cropId: string, zoneIds: string[], replace: boolean) {
  const zones = await tx.zone.findMany({ where: { id: { in: zoneIds } } })
  if (zones.length !== zoneIds.length) throw new ProductionError('Una de las zonas ya no está disponible.')
  const areaIds: string[] = []
  for (const { id: zoneId, name, normalizedName } of zones) {
    let prior = await tx.productionArea.findFirst({
      where: { cropId, OR: [{ zoneId }, { normalizedName }] },
    })
    if (prior?.deletedAt) {
      if (await retireIfExpired(tx, 'productionArea', prior)) prior = null
      else throw new ProductionError('El vínculo con esta zona está en la papelera.', 409)
    }
    const area = prior
      ? await tx.productionArea.update({ where: { id: prior.id }, data: { zoneId, active: true } })
      : await tx.productionArea.create({ data: { cropId, zoneId, name, normalizedName, type: 'ZONE' } })
    areaIds.push(area.id)
  }
  if (replace) await tx.productionArea.updateMany({
    where: { cropId, active: true, deletedAt: null, id: { notIn: areaIds } }, data: { active: false },
  })
}

async function validateUnit(tx: Prisma.TransactionClient, unitId: string | null) {
  if (!unitId || !await tx.unit.findFirst({ where: { id: unitId, active: true, deletedAt: null } })) {
    throw new ProductionError('Selecciona una unidad de medida activa.')
  }
}

async function assertNoOpenCropDependencies(tx: Prisma.TransactionClient, cropId: string, forDelete: boolean) {
  if (await tx.shipmentItem.count({
    where: { cropId, deletedAt: null, shipment: { deletedAt: null, status: { in: receivableStatuses } } },
  })) {
    throw new ProductionError(
      forDelete
        ? 'No puedes eliminar un cultivo con envíos en tránsito o con recepción pendiente.'
        : 'No puedes desactivar un cultivo con envíos en tránsito o con recepción pendiente.',
      409,
    )
  }

  if (forDelete) {
    const [activeHarvestCount, activeShipmentCount, activeCostCount] = await Promise.all([
      tx.harvest.count({ where: { ...activeHarvest, cropId } }),
      tx.shipmentItem.count({ where: { cropId, deletedAt: null, shipment: { deletedAt: null, status: { not: 'CANCELLED' } } } }),
      tx.costAllocation.count({ where: { cropId, deletedAt: null, cost: { deletedAt: null } } }),
    ])
    if (activeHarvestCount || activeShipmentCount || activeCostCount) {
      throw new ProductionError(
        'Este cultivo tiene cosechas, envíos o costos registrados. Desactívalo en lugar de moverlo a la papelera.',
        409,
      )
    }
    return
  }

  const harvests = await tx.harvest.findMany({
    where: { ...activeHarvest, cropId },
    select: { id: true, quantity: true },
  })
  const committed = await committedStock(tx, harvests.map((h) => h.id))
  if (harvests.some((h) => h.quantity.gt(committed.get(h.id) ?? 0))) {
    throw new ProductionError('Este cultivo tiene existencias disponibles para envío. Despacha o ajusta el saldo antes de desactivarlo.', 409)
  }
}

export async function GET(request: Request) {
  try {
    await requireProfile(['production', 'admin'])
    const includeInactive = new URL(request.url).searchParams.get('includeInactive') === 'true'
    const children = { deletedAt: null, active: includeInactive ? undefined : true }
    const crops = await prisma.crop.findMany({
      where: children,
      include: {
        ...cropInclude,
        varieties: { ...cropInclude.varieties, where: children },
        productionAreas: { ...cropInclude.productionAreas, where: children },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 500,
    })
    return NextResponse.json(crops)
  } catch (error) {
    return productionError(error, 'No se pudieron consultar los cultivos.')
  }
}

async function save(request: Request, update: boolean) {
  try {
    const actor = await requireProfile(['production', 'admin'])
    const body = await readBody(request)
    const id = typeof body.id === 'string' ? body.id : ''
    if (update && !id) throw new ProductionError('Indica el cultivo que quieres modificar.')
    const varieties = body.varieties === undefined ? undefined : varietyDrafts(body.varieties)
    const areas = areaDrafts(body)
    const zoneIds = body.zoneIds === undefined ? undefined : [...new Set(catalogRows(body.zoneIds, 'zonas').map((zid) => {
      if (typeof zid !== 'string' || !zid) throw new ProductionError('Selecciona una zona válida.')
      return zid
    }))]
    const isStatusToggle = update && typeof body.active === 'boolean' && body.name === undefined
    if (isStatusToggle && (varieties !== undefined || areas !== undefined || zoneIds !== undefined || body.unitId !== undefined)) {
      throw new ProductionError('Envía solo el identificador y el estado para activar o desactivar el cultivo.')
    }
    if (!isStatusToggle) {
      if (zoneIds && !zoneIds.length) throw new ProductionError('Vincula al menos una zona al cultivo.')
      if (!zoneIds && ((!update && !areas?.length) || (areas && !areas.length) || body.hasProductionAreas === false)) {
        throw new ProductionError('Vincula al menos una zona al cultivo.')
      }
    }

    const result = await runSerializable(async (tx) => {
      const before = update ? await tx.crop.findFirst({ where: { id, deletedAt: null }, include: cropInclude }) : null
      if (update && !before) throw new ProductionError('El cultivo no existe o está en la papelera.', 404)
      if (before && isStatusToggle) {
        if (body.active === true) await validateUnit(tx, before.unitId)
        else if (before.active) await assertNoOpenCropDependencies(tx, id, false)
        const crop = await tx.crop.update({ where: { id }, data: { active: body.active as boolean }, include: cropInclude })
        await tx.auditLog.create({
          data: {
            entity: 'Crop', entityId: id, action: body.active ? 'ACTIVATE' : 'DEACTIVATE', actor,
            beforeJson: { active: before.active }, afterJson: { active: crop.active },
          },
        })
        return { crop, created: false }
      }

      const name = catalogName(body.name ?? before?.name)
      const unitId = typeof body.unitId === 'string' ? body.unitId : before?.unitId ?? null
      await validateUnit(tx, unitId)
      let duplicate = await tx.crop.findUnique({ where: { normalizedName: name.normalizedName } })
      if (!update && duplicate?.deletedAt && (await retireIfExpired(tx, 'crop', duplicate))) {
        duplicate = null
      }
      if (!update && duplicate?.active && !duplicate.deletedAt && zoneIds) {
        if (duplicate.unitId !== unitId) throw new ProductionError('Usa la unidad registrada del cultivo para agregarle nuevas zonas.', 409)
        await linkZones(tx, duplicate.id, zoneIds, false)
        const crop = await tx.crop.update({ where: { id: duplicate.id }, data: { hasProductionAreas: true }, include: cropInclude })
        return { crop, created: false }
      }
      if (duplicate && duplicate.id !== before?.id && (update || duplicate.active || duplicate.deletedAt)) {
        throw new ProductionError(duplicate.deletedAt ? 'Este cultivo está en la papelera.' : 'Ya existe un cultivo con ese nombre.', 409)
      }
      const existing = before ?? duplicate
      const hasVarieties = typeof body.hasVarieties === 'boolean' ? body.hasVarieties : varieties ? varieties.length > 0 : existing?.hasVarieties ?? false
      const hasProductionAreas = zoneIds || areas ? true : existing?.hasProductionAreas ?? false
      const data = {
        ...name, unitId, hasVarieties, hasProductionAreas,
        active: before?.active ?? true,
        tracksSurface: typeof body.tracksSurface === 'boolean' ? body.tracksSurface : existing?.tracksSurface ?? false,
        hasOtherDetails: typeof body.hasOtherDetails === 'boolean' ? body.hasOtherDetails : existing?.hasOtherDetails ?? false,
      }
      const saved = existing ? await tx.crop.update({ where: { id: existing.id }, data })
        : await tx.crop.create({ data })
      if (varieties !== undefined || body.hasVarieties === false) await syncVarieties(tx, saved.id, hasVarieties ? varieties ?? [] : [])
      if (zoneIds) await linkZones(tx, saved.id, zoneIds, true)
      else if (areas) await syncAreas(tx, saved.id, areas)
      const crop = await tx.crop.findUniqueOrThrow({ where: { id: saved.id }, include: cropInclude })
      await tx.auditLog.create({
        data: {
          entity: 'Crop', entityId: crop.id, action: existing ? 'UPDATE' : 'CREATE', actor,
          beforeJson: before ? { name: before.name, unitId: before.unitId, active: before.active } : undefined,
          afterJson: { name: crop.name, unitId: crop.unitId, active: crop.active },
        },
      })
      return { crop, created: !existing }
    })
    return NextResponse.json(result.crop, { status: result.created ? 201 : 200 })
  } catch (error) {
    return productionError(error, 'No se pudo guardar el cultivo.')
  }
}

export function POST(request: Request) { return save(request, false) }
export function PATCH(request: Request) { return save(request, true) }

export async function DELETE(request: Request) {
  try {
    const actor = await requireProfile(['production', 'admin'])
    const { id, confirmName } = await readBody(request)
    if (typeof id !== 'string' || !id || typeof confirmName !== 'string') {
      throw new ProductionError('Indica el cultivo y escribe su nombre para confirmar.')
    }
    const entry = await runSerializable(async (tx) => {
      const crop: Crop | null = await tx.crop.findFirst({ where: { id, deletedAt: null }, include: cropInclude })
      if (!crop) throw new ProductionError('El cultivo no existe o está en la papelera.', 404)
      if (confirmName.trim() !== crop.name) throw new ProductionError('El nombre de confirmación no coincide.')
      await assertNoOpenCropDependencies(tx, id, true)

      const group = await moveToTrash(tx, 'crop', id, undefined, actor)
      for (const variety of crop.varieties) await moveToTrash(tx, 'variety', variety.id, group.groupId, actor)
      for (const area of crop.productionAreas) await moveToTrash(tx, 'productionArea', area.id, group.groupId, actor)
      await tx.auditLog.create({
        data: { entity: 'Crop', entityId: id, action: 'TRASH', actor, beforeJson: { name: crop.name } },
      })
      return group
    })
    return NextResponse.json({ success: true, groupId: entry.groupId, message: 'El cultivo se movió a la papelera.' })
  } catch (error) {
    return productionError(error, 'No se pudo mover el cultivo a la papelera.')
  }
}
