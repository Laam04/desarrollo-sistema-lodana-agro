import { POST as restore } from './restore/route'

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

export const POST = restore
