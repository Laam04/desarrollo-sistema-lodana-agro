import { NextResponse } from 'next/server'
import { runSerializable } from '@/lib/prisma'
import { ProductionError, productionError, readBody, requireProfile } from '@/lib/production-api'
import { productionTrashTypes, restoreTrash } from '@/lib/trash'

export async function POST(request: Request) {
  try {
    const actor = await requireProfile(['production', 'admin'])
    const { entryId, groupId } = await readBody(request)
    const selector = typeof groupId === 'string' && groupId ? { groupId }
      : typeof entryId === 'string' && entryId ? { id: entryId } : null
    if (!selector) throw new ProductionError('Indica el registro o grupo que quieres restaurar.')

    const allowedTypes = actor === 'admin' ? undefined : productionTrashTypes
    const restoredCount = await runSerializable((tx) => restoreTrash(tx, selector, actor, allowedTypes))
    return NextResponse.json({ success: true, restoredCount })
  } catch (error) {
    return productionError(error, 'No se pudieron restaurar los registros.')
  }
}
