
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const entries = await prisma.trashEntry.findMany({
      where: {
        restoredAt: null,
        purgeAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        deletedAt: 'desc',
      },
    })

    const groups = new Map<string, typeof entries>()

    for (const entry of entries) {
      const group = groups.get(entry.groupId) ?? []
      group.push(entry)
      groups.set(entry.groupId, group)
    }

    const result = Array.from(groups.entries()).map(
      ([groupId, items]) => ({
        groupId,
        deletedAt: items[0].deletedAt,
        purgeAt: items.reduce(
          (earliest, item) =>
            item.purgeAt < earliest ? item.purgeAt : earliest,
          items[0].purgeAt,
        ),
        items: items.map((item) => ({
          id: item.id,
          entityType: item.entityType,
          entityId: item.entityId,
          deletedAt: item.deletedAt,
          purgeAt: item.purgeAt,
          snapshot: item.snapshotJson,
        })),
      }),
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error al consultar la papelera:', error)

    return NextResponse.json(
      { error: 'No se pudo consultar la papelera.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (!body.entryId && !body.groupId) {
      return NextResponse.json(
        { error: 'Debes indicar el registro o grupo que deseas restaurar.' },
        { status: 400 },
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const now = new Date()

      const selected = await tx.trashEntry.findFirst({
        where: {
          ...(body.entryId ? { id: body.entryId } : {}),
          ...(body.groupId ? { groupId: body.groupId } : {}),
          restoredAt: null,
          purgeAt: { gt: now },
        },
      })

      if (!selected) {
        return { type: 'NOT_FOUND' as const }
      }

      const entries = body.groupId
        ? await tx.trashEntry.findMany({
            where: {
              groupId: body.groupId,
              restoredAt: null,
              purgeAt: { gt: now },
            },
          })
        : [selected]

      const delegates: Record<string, string> = {
        crop: 'crop',
        variety: 'variety',
        productionArea: 'productionArea',
        unit: 'unit',
        harvest: 'harvest',
        loss: 'loss',
        lossReason: 'lossReason',
        costCategory: 'costCategory',
        costSubcategory: 'costSubcategory',
        cost: 'cost',
        costAllocation: 'costAllocation',
        shipment: 'shipment',
        shipmentItem: 'shipmentItem',
        shipmentAllocation: 'shipmentAllocation',
        reception: 'reception',
        receptionItem: 'receptionItem',
      }

      const restored = new Set<string>()

      async function restoreEntry(entry: (typeof entries)[number]) {
        const key = `${entry.entityType}:${entry.entityId}`

        if (restored.has(key)) return

        const delegateName = delegates[entry.entityType]

        if (!delegateName) {
          throw new Error(`Tipo de registro no compatible: ${entry.entityType}`)
        }

        const delegate = (tx as any)[delegateName]

        const record = await delegate.findUnique({
          where: { id: entry.entityId },
        })

        if (!record) {
          throw new Error(
            `No se encontró el registro ${entry.entityType}:${entry.entityId}`,
          )
        }

        // Las variedades y áreas productivas necesitan que su cultivo esté activo.
        if (
          ['variety', 'productionArea'].includes(entry.entityType) &&
          record.cropId
        ) {
          const crop = await tx.crop.findUnique({
            where: { id: record.cropId },
          })

          if (crop?.deletedAt) {
            const parentEntry = await tx.trashEntry.findFirst({
              where: {
                entityType: 'crop',
                entityId: crop.id,
                restoredAt: null,
                purgeAt: { gt: now },
              },
            })

            if (!parentEntry) {
              throw new Error(
                'No se puede restaurar el registro porque su cultivo no está disponible en la papelera.',
              )
            }

            await restoreEntry(parentEntry as (typeof entries)[number])
          }
        }

        await delegate.update({
          where: { id: entry.entityId },
          data: { deletedAt: null },
        })

        await tx.trashEntry.update({
          where: { id: entry.id },
          data: {
            restoredAt: now,
          },
        })

        restored.add(key)
      }

      // Primero se restauran los cultivos y después sus dependencias.
      const orderedEntries = [...entries].sort((a, b) => {
        if (a.entityType === 'crop') return -1
        if (b.entityType === 'crop') return 1
        return 0
      })

      for (const entry of orderedEntries) {
        await restoreEntry(entry)
      }

      return {
        type: 'RESTORED' as const,
        count: restored.size,
      }
    })

    if (result.type === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'El registro no existe en la papelera o ya expiró.' },
        { status: 404 },
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
      {
        error:
          error instanceof Error
            ? error.message
            : 'No se pudieron restaurar los registros.',
      },
      { status: 409 },
    )
  }
}
