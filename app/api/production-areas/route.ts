import { NextResponse } from 'next/server'
import { prisma, runSerializable } from '@/lib/prisma'
import { ProductionError, productionError, readBody, requireProfile } from '@/lib/production-api'
import { cleanName, normalizeCatalogName, parseSurface } from '@/lib/production-validation'
import { retireIfExpired } from '@/lib/trash'

export async function GET(request: Request) {
  try {
    await requireProfile(['production', 'admin'])
    const cropId = new URL(request.url).searchParams.get('cropId')
    const areas = await prisma.productionArea.findMany({
      where: { active: true, deletedAt: null, crop: { active: true, deletedAt: null }, cropId: cropId || undefined },
      include: { crop: true },
      orderBy: [{ crop: { name: 'asc' } }, { name: 'asc' }],
      take: 500,
    })
    return NextResponse.json(areas)
  } catch (error) {
    return productionError(error, 'No se pudieron consultar las áreas productivas.')
  }
}

async function save(request: Request, update: boolean) {
  try {
    const actor = await requireProfile(['production', 'admin'])
    const body = await readBody(request)
    const id = typeof body.id === 'string' ? body.id : ''
    const name = cleanName(body.name)
    const normalizedName = normalizeCatalogName(name)
    if (!normalizedName || name.length > 120 || (update && !id)) throw new ProductionError('Indica el nombre del lote o zona.')
    if (body.type !== undefined && body.type !== 'LOT' && body.type !== 'ZONE') throw new ProductionError('El tipo de área debe ser lote o zona.')
    const surface = body.surface == null || body.surface === '' ? null : parseSurface(body.surface)
    if (body.surface != null && body.surface !== '' && surface === null) throw new ProductionError('Indica una superficie válida de hasta dos decimales.')

    const result = await runSerializable(async (tx) => {
      const existing = update ? await tx.productionArea.findFirst({ where: { id, deletedAt: null } }) : null
      if (update && !existing) throw new ProductionError('Área productiva no encontrada.', 404)
      const cropId = existing?.cropId ?? (typeof body.cropId === 'string' ? body.cropId : '')
      if (!await tx.crop.findFirst({ where: { id: cropId, active: true, deletedAt: null } })) {
        throw new ProductionError('Selecciona un cultivo activo.')
      }
      const siblings = await tx.productionArea.findMany({ where: { cropId } })
      let duplicate = siblings.find((area) => area.id !== id && normalizeCatalogName(area.name) === normalizedName)
      if (duplicate?.deletedAt) {
        if (await retireIfExpired(tx, 'productionArea', duplicate)) duplicate = undefined
        else throw new ProductionError('Esta área está en la papelera.', 409)
      }
      if (duplicate && (update || duplicate.active)) {
        throw new ProductionError('Ya existe un área activa con ese nombre en este cultivo.', 409)
      }

      const previous = existing ?? duplicate
      const type = body.type === 'ZONE' || body.type === 'LOT' ? body.type : previous?.type ?? 'LOT'
      const zone = await tx.zone.upsert({
        where: { normalizedName }, update: {}, create: { name, normalizedName },
      })
      const data = {
        name, normalizedName, type, zoneId: zone.id,
        surface: type === 'ZONE' ? null : body.surface === undefined ? previous?.surface : surface,
        surfaceUnit: type === 'ZONE' ? null : cleanName(body.surfaceUnit).slice(0, 24) || previous?.surfaceUnit || 'ha',
        active: update ? previous?.active : true,
      }
      const area = previous ? await tx.productionArea.update({ where: { id: previous.id }, data })
        : await tx.productionArea.create({ data: { ...data, cropId } })
      if (!update) await tx.crop.update({ where: { id: cropId }, data: { hasProductionAreas: true } })
      await tx.auditLog.create({
        data: { entity: 'ProductionArea', entityId: area.id, action: previous ? 'UPDATE' : 'CREATE', actor, afterJson: { name: area.name, type: area.type, cropId } },
      })
      return { area, created: !previous }
    })
    return NextResponse.json(result.area, { status: result.created ? 201 : 200 })
  } catch (error) {
    return productionError(error, 'No se pudo guardar el área productiva.')
  }
}

export function POST(request: Request) { return save(request, false) }
export function PATCH(request: Request) { return save(request, true) }

export async function DELETE(request: Request) {
  try {
    const actor = await requireProfile(['production', 'admin'])
    const { id } = await readBody(request)
    if (typeof id !== 'string' || !id) throw new ProductionError('Indica el área que quieres desactivar.')
    await runSerializable(async (tx) => {
      const area = await tx.productionArea.findFirst({ where: { id, deletedAt: null }, include: { crop: true } })
      if (!area) throw new ProductionError('Área productiva no encontrada.', 404)
      if (!area.active) return
      if (area.crop.active && !await tx.productionArea.count({
        where: { cropId: area.cropId, active: true, deletedAt: null, id: { not: id } },
      })) throw new ProductionError('Vincula otra zona antes de retirar la última del cultivo.', 409)
      await tx.productionArea.update({ where: { id }, data: { active: false } })
      await tx.auditLog.create({
        data: { entity: 'ProductionArea', entityId: id, action: 'DEACTIVATE', actor, beforeJson: { name: area.name, active: true }, afterJson: { active: false } },
      })
    })
    return NextResponse.json({ message: 'Área productiva desactivada.' })
  } catch (error) {
    return productionError(error, 'No se pudo desactivar el área productiva.')
  }
}
