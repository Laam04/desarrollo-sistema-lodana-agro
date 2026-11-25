import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { productionError, requireProfile } from '@/lib/production-api'
import { productionTrashTypes } from '@/lib/trash'

export async function GET(request: Request) {
  try {
    const actor = await requireProfile(['production', 'admin'])
    const params = new URL(request.url).searchParams
    const rawLimit = Number(params.get('limit') ?? 200)
    const take = Number.isSafeInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 500 ? rawLimit : 200

    const entries = await prisma.trashEntry.findMany({
      where: {
        restoredAt: null,
        purgeAt: { gt: new Date() },
        ...(actor === 'admin' ? {} : { entityType: { in: [...productionTrashTypes] } }),
      },
      orderBy: { deletedAt: 'desc' },
      take,
    })

    const groups = new Map<string, typeof entries>()
    for (const entry of entries) {
      const group = groups.get(entry.groupId) ?? []
      group.push(entry)
      groups.set(entry.groupId, group)
    }

    const result = Array.from(groups.entries()).map(([groupId, items]) => ({
      groupId,
      deletedAt: items[0].deletedAt,
      purgeAt: items.reduce(
        (earliest, item) => (item.purgeAt < earliest ? item.purgeAt : earliest),
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
    }))

    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return productionError(error, 'No se pudo consultar la papelera.')
  }
}
