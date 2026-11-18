import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ProductionError, productionError, readBody } from '@/lib/production-api'
import { cleanName, normalizeCatalogName, parseSurface } from '@/lib/production-validation'

export async function GET(request: Request) {
  try {
    const cropId = new URL(request.url).searchParams.get('cropId')
    const areas = await prisma.productionArea.findMany({
      where: { active: true, deletedAt: null, crop: { active: true, deletedAt: null }, cropId: cropId || undefined },
      include: { crop: true },
      orderBy: [{ crop: { name: 'asc' } }, { name: 'asc' }],
    })
    return NextResponse.json(areas)
  } catch (error) {
    return productionError(error, 'No se pudieron consultar las áreas productivas.')
  }
}

async function save(request: Request, update: boolean) {
  try {
    const body = await readBody(request)
    const id = typeof body.id === 'string' ? body.id : ''
    const name = cleanName(body.name)
    const normalizedName = normalizeCatalogName(name)
    if (!normalizedName || name.length > 120 || (update && !id)) throw new ProductionError('Indica el nombre del lote o zona.')
    if (body.type !== undefined && body.type !== 'LOT' && body.type !== 'ZONE') throw new ProductionError('El tipo de área debe ser lote o zona.')
    const surface = body.surface == null || body.surface === '' ? null : parseSurface(body.surface)
    if (body.surface != null && body.surface !== '' && surface === null) throw new ProductionError('Indica una superficie válida de hasta dos decimales.')

    const result = await prisma.$transaction(async (tx) => {
      const existing = update ? await tx.productionArea.findFirst({ where: { id, deletedAt: null } }) : null
      if (update && !existing) throw new ProductionError('Área productiva no encontrada.', 404)
      const cropId = existing?.cropId ?? (typeof body.cropId === 'string' ? body.cropId : '')
      if (!await tx.crop.findFirst({ where: { id: cropId, active: true, deletedAt: null } })) {
        throw new ProductionError('Selecciona un cultivo activo.')
      }
      const siblings = await tx.productionArea.findMany({ where: { cropId } })
      const duplicate = siblings.find((area) => area.id !== id && normalizeCatalogName(area.name) === normalizedName)
      if (duplicate?.deletedAt) throw new ProductionError('Esta área está en la papelera.', 409)
      if (update && duplicate) throw new ProductionError('Ya existe un área con ese nombre en este cultivo.', 409)

      const previous = existing ?? duplicate
      const type = body.type === 'ZONE' || body.type === 'LOT' ? body.type : previous?.type ?? 'LOT'
      const data = {
        name, normalizedName, type,
        surface: type === 'ZONE' ? null : body.surface === undefined ? previous?.surface : surface,
        surfaceUnit: type === 'ZONE' ? null : cleanName(body.surfaceUnit).slice(0, 24) || previous?.surfaceUnit || 'ha',
        notes: body.notes === undefined ? previous?.notes : cleanName(body.notes).slice(0, 2000) || null,
        active: update ? previous?.active : true,
      }
      const area = previous ? await tx.productionArea.update({ where: { id: previous.id }, data })
        : await tx.productionArea.create({ data: { ...data, cropId } })
      if (!update) await tx.crop.update({ where: { id: cropId }, data: { hasProductionAreas: true } })
      return { area, created: !previous }
    }, { isolationLevel: 'Serializable' })
    return NextResponse.json(result.area, { status: result.created ? 201 : 200 })
  } catch (error) {
    return productionError(error, 'No se pudo guardar el área productiva.')
  }
}

export function POST(request: Request) { return save(request, false) }
export function PATCH(request: Request) { return save(request, true) }

export async function DELETE(request: Request) {
  try {
    const { id } = await readBody(request)
    if (typeof id !== 'string' || !id) throw new ProductionError('Indica el área que quieres desactivar.')
    const result = await prisma.productionArea.updateMany({
      where: { id, deletedAt: null }, data: { active: false },
    })
    if (!result.count) throw new ProductionError('Área productiva no encontrada.', 404)
    return NextResponse.json({ message: 'Área productiva desactivada.' })
  } catch (error) {
    return productionError(error, 'No se pudo desactivar el área productiva.')
  }
}
