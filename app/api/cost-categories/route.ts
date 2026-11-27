import { NextResponse } from 'next/server'
import { prisma, runSerializable } from '@/lib/prisma'
import { ProductionError, productionError, readBody, requireProfile } from '@/lib/production-api'
import { cleanName, normalizeName } from '@/lib/production-validation'
import { retireIfExpired } from '@/lib/trash'

export async function GET(request: Request) {
  try {
    await requireProfile(['production', 'admin'])
    const all = new URL(request.url).searchParams.get('includeInactive') === 'true'
    return NextResponse.json(await prisma.costCategory.findMany({
      where: { deletedAt: null, ...(all ? {} : { active: true }) },
      select: { id: true, name: true, active: true },
      orderBy: { name: 'asc' },
      take: 500,
    }))
  } catch (error) {
    return productionError(error, 'No se pudieron consultar las categorías.')
  }
}

async function save(request: Request, update: boolean) {
  try {
    const actor = await requireProfile(['production', 'admin'])
    const { id, name: input, active } = await readBody(request)
    const name = cleanName(input)
    if (!name || name.length > 120 || (update && (typeof id !== 'string' || !id))) {
      throw new ProductionError('Ingresa un nombre de categoría de hasta 120 caracteres.')
    }
    const normalizedName = normalizeName(name)
    const category = await runSerializable(async (tx) => {
      let existing = await tx.costCategory.findUnique({ where: { normalizedName } })
      if (existing?.deletedAt) {
        if (await retireIfExpired(tx, 'costCategory', existing)) existing = null
        else throw new ProductionError('La categoría está en la papelera.', 409)
      }
      if (!update) {
        const saved = await tx.costCategory.upsert({
          where: { normalizedName }, create: { name, normalizedName }, update: { active: true },
        })
        await tx.auditLog.create({
          data: { entity: 'CostCategory', entityId: saved.id, action: 'CREATE', actor, afterJson: { name: saved.name } },
        })
        return saved
      }
      if (existing && existing.id !== id) throw new ProductionError('Ya existe una categoría con ese nombre.', 409)
      const original = typeof id === 'string' ? await tx.costCategory.findFirst({ where: { id, deletedAt: null } }) : null
      if (!original) throw new ProductionError('Categoría no encontrada.', 404)
      const saved = await tx.costCategory.update({
        where: { id: original.id },
        data: { name, normalizedName, active: typeof active === 'boolean' ? active : original.active },
      })
      await tx.auditLog.create({
        data: {
          entity: 'CostCategory', entityId: saved.id, action: 'UPDATE', actor,
          beforeJson: { name: original.name, active: original.active },
          afterJson: { name: saved.name, active: saved.active },
        },
      })
      return saved
    })
    return NextResponse.json(category)
  } catch (error) {
    return productionError(error, 'No se pudo guardar la categoría.')
  }
}

export function POST(request: Request) { return save(request, false) }
export function PATCH(request: Request) { return save(request, true) }
