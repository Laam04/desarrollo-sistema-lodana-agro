import { Prisma } from '@prisma/client'
import { ProductionError } from '@/lib/production-api'
import { endOfDay } from '@/lib/production-stock'
import { parseDate } from '@/lib/production-validation'

export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, '\\$&')
}

export function historyQuery(request: Request, legacyLimit: number) {
  const params = new URL(request.url).searchParams
  const from = parseDate(params.get('from'))
  const to = parseDate(params.get('to'))
  if ((params.get('from') && !from) || (params.get('to') && !to) || (from && to && from > to)) {
    throw new ProductionError('Indica un rango de fechas válido.')
  }
  from?.setUTCHours(0, 0, 0, 0)

  const page = params.has('page') ? Number(params.get('page')) : null
  if (page !== null && (!Number.isSafeInteger(page) || page < 1 || page > 100000)) {
    throw new ProductionError('La página solicitada no es válida.')
  }
  const pageSize = 25
  const rawTerm = params.get('q')?.trim().slice(0, 120) || ''
  return {
    page,
    take: page ? pageSize + 1 : legacyLimit,
    skip: page ? (page - 1) * pageSize : undefined,
    cropId: params.get('cropId') || undefined,
    date: from || to ? { gte: from ?? undefined, lte: to ? endOfDay(to) : undefined } : undefined,
    search: rawTerm ? { contains: rawTerm, mode: Prisma.QueryMode.insensitive } : undefined,
    likePattern: rawTerm ? `%${escapeLikePattern(rawTerm)}%` : null,
    result<T>(rows: T[]) {
      return page ? { rows: rows.slice(0, pageSize), hasNext: rows.length > pageSize } : rows
    },
  }
}
