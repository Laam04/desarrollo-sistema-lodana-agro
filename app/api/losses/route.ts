import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { currentActor, ProductionError, productionError, readBody } from '@/lib/production-api'
import { historyQuery } from '@/lib/production-history'
import { activeHarvest, activeLoss } from '@/lib/production-stock'
import { lossDraft, lossInclude, saveLoss } from '@/lib/harvest-loss'
import { moveToTrash } from '@/lib/trash'

export async function GET(request: Request) {
  try {
    const { cropId, date, search, take, skip, result } = historyQuery(request, 100)
    const rows = await prisma.loss.findMany({
      where: {
        ...activeLoss, date, harvest: { ...activeHarvest, cropId },
        OR: search ? [{ notes: search }, { reason: { name: search } }, { harvest: { crop: { name: search } } }] : undefined,
      },
      include: lossInclude,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take, skip,
    })
    return NextResponse.json(result(rows))
  } catch (error) {
    return productionError(error, 'No se pudieron consultar las mermas.')
  }
}

async function save(request: Request, update: boolean) {
  try {
    const body = await readBody(request)
    const { id, harvestId } = body
    if (typeof harvestId !== 'string' || !harvestId || (update && (typeof id !== 'string' || !id))) {
      throw new ProductionError('Selecciona una cosecha e indica la merma que quieres guardar.')
    }
    const draft = lossDraft(body)
    const actor = await currentActor()
    const row = await prisma.$transaction(async (tx) => {
      const targetId = update && typeof id === 'string' ? id : undefined
      if (targetId && !(await tx.loss.findFirst({ where: { id: targetId, ...activeLoss } }))) {
        throw new ProductionError('La merma no existe o está en la papelera.', 404)
      }
      return saveLoss(tx, harvestId, draft, actor, targetId)
    }, { isolationLevel: 'Serializable' })
    return NextResponse.json(row, { status: update ? 200 : 201 })
  } catch (error) {
    return productionError(error, 'No se pudo guardar la merma.')
  }
}

export function POST(request: Request) {
  return save(request, false)
}

export function PATCH(request: Request) {
  return save(request, true)
}

export async function DELETE(request: Request) {
  try {
    const { id } = await readBody(request)
    if (typeof id !== 'string' || !id) throw new ProductionError('Indica la merma que quieres eliminar.')
    const actor = await currentActor()
    const result = await prisma.$transaction(async (tx) => {
      if (!(await tx.loss.findFirst({ where: { id, ...activeLoss } }))) {
        throw new ProductionError('La merma no existe o está en la papelera.', 404)
      }
      return moveToTrash(tx, 'loss', id, undefined, actor)
    }, { isolationLevel: 'Serializable' })
    return NextResponse.json(result)
  } catch (error) {
    return productionError(error, 'No se pudo mover la merma a la papelera.')
  }
}
