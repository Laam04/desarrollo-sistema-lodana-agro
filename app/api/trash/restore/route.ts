import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { currentActor, ProductionError, productionError, readBody } from '@/lib/production-api'
import { restoreTrash } from '@/lib/trash'

export async function POST(request: Request) {
  try {
    const { entryId, groupId } = await readBody(request)
    const selector = typeof groupId === 'string' && groupId ? { groupId }
      : typeof entryId === 'string' && entryId ? { id: entryId } : null
    if (!selector) throw new ProductionError('Indica el registro o grupo que quieres restaurar.')

    const actor = await currentActor()
    const restoredCount = await prisma.$transaction((tx) => restoreTrash(tx, selector, actor), {
      isolationLevel: 'Serializable',
    })
    return NextResponse.json({ success: true, restoredCount })
  } catch (error) {
    return productionError(error, 'No se pudieron restaurar los registros.')
  }
}
