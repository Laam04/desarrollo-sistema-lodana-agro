import { NextResponse } from 'next/server'
import { prisma, runSerializable } from '@/lib/prisma'
import { ProductionError, productionError, readBody, requireProfile } from '@/lib/production-api'
import { historyQuery } from '@/lib/production-history'
import { activeHarvest, activeLoss } from '@/lib/production-stock'
import { lossDraft, lossSelect, saveLoss, serializeLoss } from '@/lib/harvest-loss'
import { moveToTrash } from '@/lib/trash'

export async function GET(request: Request) {
  try {
    await requireProfile(['production', 'admin'])
    const { cropId, date, search, take, skip, result } = historyQuery(request, 100)
    const rows = await prisma.loss.findMany({
      where: {
        ...activeLoss, date, harvest: { ...activeHarvest, cropId },
        OR: search ? [{ notes: search }, { reason: { name: search } }, { harvest: { crop: { name: search } } }] : undefined,
      },
      select: lossSelect,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take, skip,
    })
    return NextResponse.json(result(rows.map(serializeLoss)))
  } catch (error) {
    return productionError(error, 'No se pudieron consultar las mermas.')
  }
}

async function save(request: Request, update: boolean) {
  try {
    const actor = await requireProfile(['production', 'admin'])
    const body = await readBody(request, 2 * 1024 * 1024)
    const { id, harvestId } = body
    if (typeof harvestId !== 'string' || !harvestId || (update && (typeof id !== 'string' || !id))) {
      throw new ProductionError('Selecciona una cosecha e indica la merma que quieres guardar.')
    }
    const draft = lossDraft(body)
    const row = await runSerializable(async (tx) => {
      const targetId = update && typeof id === 'string' ? id : undefined
      const before = targetId ? await tx.loss.findFirst({ where: { id: targetId, ...activeLoss }, select: { harvestId: true, quantity: true, affectsHarvest: true, evidenceImageName: true } }) : null
      if (targetId && !before) {
        throw new ProductionError('La merma no existe o está en la papelera.', 404)
      }
      if (before && before.harvestId !== harvestId) {
        throw new ProductionError('No puedes reasignar una merma a una cosecha distinta.', 409)
      }
      const saved = await saveLoss(tx, harvestId, draft, actor, targetId)
      await tx.auditLog.create({
        data: {
          entity: 'Loss', entityId: saved.id, action: before ? 'UPDATE' : 'CREATE', actor,
          beforeJson: before
            ? {
                harvestId: before.harvestId,
                quantity: before.quantity.toString(),
                affectsHarvest: before.affectsHarvest,
                hasEvidenceImage: Boolean(before.evidenceImageName),
              }
            : undefined,
          afterJson: {
            harvestId: saved.harvestId,
            quantity: saved.quantity.toString(),
            affectsHarvest: saved.affectsHarvest,
            hasEvidenceImage: saved.hasEvidenceImage,
          },
        },
      })
      return saved
    })
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
    const actor = await requireProfile(['production', 'admin'])
    const { id } = await readBody(request)
    if (typeof id !== 'string' || !id) throw new ProductionError('Indica la merma que quieres eliminar.')
    const result = await runSerializable(async (tx) => {
      const loss = await tx.loss.findFirst({ where: { id, ...activeLoss } })
      if (!loss) throw new ProductionError('La merma no existe o está en la papelera.', 404)
      const entry = await moveToTrash(tx, 'loss', id, undefined, actor)
      await tx.auditLog.create({
        data: { entity: 'Loss', entityId: id, action: 'TRASH', actor, beforeJson: { quantity: loss.quantity.toString() } },
      })
      return entry
    })
    return NextResponse.json(result)
  } catch (error) {
    return productionError(error, 'No se pudo mover la merma a la papelera.')
  }
}
