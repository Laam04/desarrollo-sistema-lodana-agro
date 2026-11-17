
import { Prisma, PrismaClient } from '@prisma/client'

type Transaction = Prisma.TransactionClient

const RETENTION_DAYS = 60

export async function moveToTrash(
  tx: Transaction,
  entityType: string,
  entityId: string,
  groupId?: string,
  deletedBy?: string | null,
) {
  const model = (tx as any)[entityType]

  if (!model) {
    throw new Error(`Tipo de registro no válido: ${entityType}`)
  }

  const record = await model.findUnique({
    where: { id: entityId },
  })

  if (!record) {
    throw new Error('El registro no existe.')
  }

  if (record.deletedAt) {
    throw new Error('El registro ya está en la papelera.')
  }

  const now = new Date()
  const purgeAt = new Date(now)
  purgeAt.setDate(purgeAt.getDate() + RETENTION_DAYS)

  const group = groupId || crypto.randomUUID()

  await model.update({
    where: { id: entityId },
    data: { deletedAt: now },
  })

  await (tx as any).trashEntry.create({
    data: {
      entityType,
      entityId,
      groupId: group,
      deletedAt: now,
      purgeAt,
      deletedBy: deletedBy || null,
      snapshotJson: JSON.parse(JSON.stringify(record)),
    },
  })

  return { id: entityId, groupId: group, deletedAt: now, purgeAt }
}
