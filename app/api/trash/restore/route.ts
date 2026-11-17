
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const RESTORABLE_TYPES = ['crop', 'variety', 'productionArea'] as const

type RestorableType = (typeof RESTORABLE_TYPES)[number]

const RESTORE_ORDER: Record<RestorableType, number> = {
  crop: 1,
  variety: 2,
  productionArea: 3,
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.entryId && !body.groupId) {
      return NextResponse.json(
        { error: 'Se requiere el identificador del registro o del grupo.' },
        { status: 400 },
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const now = new Date()

      const entries = await tx.trashEntry.findMany({
        where: body.groupId
          ? {
              groupId: body.groupId,
              restoredAt: null,
              purgeAt: { gt: now },
            }
          : {
              id: body.entryId,
              restoredAt: null,
              purgeAt: { gt: now },
            },
      })

      if (entries.length === 0) {
        return { type: 'NOT_FOUND' as const }
      }

      const selected = entries[0]

      if (
        !RESTORABLE_TYPES.includes(selected.entityType as RestorableType) ||
        entries.some(
          (entry) =>
            !RESTORABLE_TYPES.includes(entry.entityType as RestorableType),
        )
      ) {
        return { type: 'UNSUPPORTED' as const }
      }

      const toRestore = new Map(
        entries.map((entry) => [entry.entityType + ':' + entry.entityId, entry]),
      )

      // Si se restaura una variedad o área individual,
      // también se recupera su cultivo si está eliminado.
      if (!body.groupId && selected.entityType !== 'crop') {
        const model = (tx as any)[selected.entityType]
        const record = await model.findUnique({
          where: { id: selected.entityId },
        })

        if (!record) {
          return { type: 'RECORD_MISSING' as const }
        }

        const crop = await tx.crop.findUnique({
          where: { id: record.cropId },
        })

        if (!crop) {
          return { type: 'PARENT_MISSING' as const }
        }

        if (crop.deletedAt) {
          const cropEntry = await tx.trashEntry.findFirst({
            where: {
              entityType: 'crop',
              entityId: crop.id,
              restoredAt: null,
              purgeAt: { gt: now },
            },
          })

          if (!cropEntry) {
            return { type: 'PARENT_MISSING' as const }
          }

          toRestore.set('crop:' + crop.id, cropEntry)
        }
      }

      const orderedEntries = [...toRestore.values()].sort(
        (a, b) =>
          RESTORE_ORDER[a.entityType as RestorableType] -
          RESTORE_ORDER[b.entityType as RestorableType],
      )

      for (const entry of orderedEntries) {
        const model = (tx as any)[entry.entityType]

        const record = await model.findUnique({
          where: { id: entry.entityId },
        })

        if (!record) {
          return { type: 'RECORD_MISSING' as const }
        }

        await model.update({
          where: { id: entry.entityId },
          data: { deletedAt: null },
        })

        await tx.trashEntry.updateMany({
          where: {
            entityType: entry.entityType,
            entityId: entry.entityId,
            restoredAt: null,
          },
          data: {
            restoredAt: now,
          },
        })
      }

      return {
        type: 'RESTORED' as const,
        count: orderedEntries.length,
      }
    })

    if (result.type === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'El registro no existe en la papelera o ya venció.' },
        { status: 404 },
      )
    }

    if (result.type === 'UNSUPPORTED') {
      return NextResponse.json(
        { error: 'El grupo contiene tipos de registros aún no habilitados para restauración.' },
        { status: 400 },
      )
    }

    if (result.type === 'RECORD_MISSING') {
      return NextResponse.json(
        { error: 'No se encontró uno de los registros que se desea restaurar.' },
        { status: 404 },
      )
    }

    if (result.type === 'PARENT_MISSING') {
      return NextResponse.json(
        { error: 'No se puede restaurar el registro porque su cultivo no está disponible en la papelera.' },
        { status: 409 },
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Restauración completada correctamente.',
      restoredCount: result.count,
    })
  } catch (error) {
    console.error('Error al restaurar registros:', error)

    return NextResponse.json(
      { error: 'No se pudieron restaurar los registros. Comprueba si existe algún conflicto.' },
      { status: 500 },
    )
  }
}
