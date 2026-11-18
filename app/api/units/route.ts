import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ProductionError, productionError, readBody } from '@/lib/production-api'
import { cleanName } from '@/lib/production-validation'
import { activeHarvest, committedStock } from '@/lib/production-stock'
import { editableShipmentStatuses } from '@/lib/shipment-status'

export async function GET(request: Request) {
  try {
    const includeInactive = new URL(request.url).searchParams.get('includeInactive') === 'true'
    const units = await prisma.unit.findMany({
      where: { deletedAt: null, active: includeInactive ? undefined : true },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(units)
  } catch (error) {
    return productionError(error, 'No se pudieron consultar las unidades.')
  }
}

async function save(request: Request, update: boolean) {
  try {
    const body = await readBody(request)
    const name = cleanName(body.name)
    const id = typeof body.id === 'string' ? body.id : ''
    if (!name || name.length > 60 || (update && !id)) throw new ProductionError('Indica un nombre de unidad de hasta 60 caracteres.')
    const result = await prisma.$transaction(async (tx) => {
      const existing = update ? await tx.unit.findUnique({ where: { id } }) : null
      if (update && (!existing || existing.deletedAt)) throw new ProductionError('Unidad no encontrada.', 404)
      const duplicate = await tx.unit.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, id: update ? { not: id } : undefined },
      })
      if (duplicate?.deletedAt) throw new ProductionError('Esta unidad está en la papelera.', 409)
      if (update && duplicate) throw new ProductionError('Ya existe una unidad con ese nombre.', 409)
      if (existing) {
        const unit = await tx.unit.update({
          where: { id }, data: { name, active: body.active === true ? true : existing.active },
        })
        return { unit, created: false }
      }
      if (duplicate) {
        const unit = await tx.unit.update({ where: { id: duplicate.id }, data: { active: true } })
        return { unit, created: false }
      }
      return { unit: await tx.unit.create({ data: { name } }), created: true }
    }, { isolationLevel: 'Serializable' })
    return NextResponse.json(result.unit, { status: result.created ? 201 : 200 })
  } catch (error) {
    return productionError(error, 'No se pudo guardar la unidad.')
  }
}

export function POST(request: Request) { return save(request, false) }
export function PATCH(request: Request) { return save(request, true) }

export async function DELETE(request: Request) {
  try {
    const { id } = await readBody(request)
    if (typeof id !== 'string' || !id) throw new ProductionError('Indica la unidad que quieres desactivar.')
    await prisma.$transaction(async (tx) => {
      const unit = await tx.unit.findFirst({ where: { id, deletedAt: null } })
      if (!unit) throw new ProductionError('Unidad no encontrada.', 404)
      if (!unit.active) return
      if (await tx.crop.count({ where: { unitId: id, active: true, deletedAt: null } })) {
        throw new ProductionError('Cambia la unidad de los cultivos activos que la usan antes de desactivarla.', 409)
      }
      if (await tx.shipmentItem.count({
        where: { unitId: id, deletedAt: null, shipment: { deletedAt: null, status: { in: editableShipmentStatuses } } },
      })) {
        throw new ProductionError('Esta unidad está en uso en un envío que todavía puede cancelarse.', 409)
      }
      const harvests = await tx.harvest.findMany({
        where: { ...activeHarvest, unitId: id }, select: { id: true, quantity: true },
      })
      const committed = await committedStock(tx, harvests.map((harvest) => harvest.id))
      if (harvests.some((harvest) => harvest.quantity.gt(committed.get(harvest.id) ?? 0))) {
        throw new ProductionError('Esta unidad tiene existencias disponibles para envío.', 409)
      }
      await tx.unit.update({ where: { id }, data: { active: false } })
    }, { isolationLevel: 'Serializable' })
    return NextResponse.json({ message: 'Unidad desactivada.' })
  } catch (error) {
    return productionError(error, 'No se pudo desactivar la unidad.')
  }
}
