import { Prisma, PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export async function runSerializable<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { maxRetries?: number; timeout?: number },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3
  const timeout = options?.timeout ?? 15_000
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: 'Serializable', timeout })
    } catch (error) {
      const isSerializationFailure =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
      if (!isSerializationFailure || attempt >= maxRetries) throw error
      const delayMs = 25 * 2 ** attempt + Math.floor(Math.random() * 25)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}
