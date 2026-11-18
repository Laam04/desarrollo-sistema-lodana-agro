import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { currentActor, isRecord, ProductionError, productionError, readBody } from '@/lib/production-api'
import { historyQuery } from '@/lib/production-history'
import { cleanName, normalizeName, parseDate, parseDecimal, parsePositiveDecimal } from '@/lib/production-validation'
import { moveToTrash } from '@/lib/trash'

const costInclude = {
  category: true,
  subcategory: true,
  allocations: { where: { deletedAt: null }, include: { crop: true } },
} satisfies Prisma.CostInclude

type Allocation = { cropId: string | null; amountUsd: Prisma.Decimal | null; percent: Prisma.Decimal | null }

function readAllocations(rows: unknown): Allocation[] {
  if (!Array.isArray(rows) || rows.length > 100) throw new ProductionError('Las asignaciones del costo no son válidas.')
  const seen = new Set<string>()
  return rows.map((row: unknown) => {
    if (!isRecord(row) || typeof row.cropId !== 'string' || !row.cropId || seen.has(row.cropId)) {
      throw new ProductionError('Selecciona un cultivo diferente para cada asignación.')
    }
    const amount = parsePositiveDecimal(row.amountUsd)
    const percent = parseDecimal(row.percent, 3, 4)
    if ((amount === null) === (percent === null) || (percent !== null && percent > 100) ||
        (amount === null && row.amountUsd != null) || (percent === null && row.percent != null)) {
      throw new ProductionError('Indica un importe positivo o un porcentaje de hasta 100% para cada asignación.')
    }
    seen.add(row.cropId)
    return {
      cropId: row.cropId,
      amountUsd: amount === null ? null : new Prisma.Decimal(amount),
      percent: percent === null ? null : new Prisma.Decimal(percent),
    }
  })
}

function validateTotals(rows: Allocation[], amount: number) {
  if (!rows.length) return
  const monetary = rows.every((row) => row.amountUsd !== null && row.percent === null)
  const percentages = rows.every((row) => row.percent !== null && row.amountUsd === null)
  if (!monetary && !percentages) throw new ProductionError('Usa el mismo tipo de asignación para todos los cultivos.')
  const total = rows.reduce((sum, row) => sum.plus((monetary ? row.amountUsd : row.percent) ?? 0), new Prisma.Decimal(0))
  if (!total.eq(monetary ? amount : 100)) {
    throw new ProductionError(monetary ? 'Las asignaciones deben coincidir con el importe total.' : 'Los porcentajes deben sumar 100%.')
  }
}

export async function GET(request: Request) {
  try {
    const { date, search, take, skip, result } = historyQuery(request, 100)
    const rows = await prisma.cost.findMany({
      where: {
        deletedAt: null, date,
        OR: search ? [
          { description: search }, { category: { name: search } }, { notes: search },
          { allocations: { some: { deletedAt: null, crop: { name: search } } } },
        ] : undefined,
      },
      include: costInclude,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take, skip,
    })
    return NextResponse.json(result(rows))
  } catch (error) {
    return productionError(error, 'No se pudieron consultar los costos.')
  }
}

async function save(request: Request, update: boolean) {
  try {
    const body = await readBody(request)
    const id = typeof body.id === 'string' ? body.id : ''
    const date = parseDate(body.date)
    const description = cleanName(body.description)
    const categoryName = cleanName(body.category)
    const amountUsd = parsePositiveDecimal(body.amountUsd)
    if (!date || !description || description.length > 200 || !categoryName || categoryName.length > 120 ||
        !amountUsd || (update && !id)) {
      throw new ProductionError('Completa la fecha, descripción, categoría e importe positivo de hasta dos decimales.')
    }
    const allocations = body.allocations === undefined ? undefined : readAllocations(body.allocations)
    const applicationType = body.applicationType || (allocations?.length ? 'CROP' : 'GENERAL')
    if (applicationType !== 'CROP' && applicationType !== 'GENERAL') throw new ProductionError('Selecciona una aplicación válida.')

    const row = await prisma.$transaction(async (tx) => {
      const before = update ? await tx.cost.findFirst({ where: { id, deletedAt: null }, include: costInclude }) : null
      if (update && !before) throw new ProductionError('El costo no existe o está en la papelera.', 404)
      const next = allocations ?? (applicationType === 'CROP' ? before?.allocations ?? [] : [])
      if (applicationType === 'CROP' && !next.length) throw new ProductionError('Selecciona el cultivo al que se aplica el costo.')
      if (applicationType === 'GENERAL' && next.length) throw new ProductionError('Los costos generales no se asignan a cultivos.')
      if (allocations || !before?.amountUsd.eq(amountUsd)) validateTotals(next, amountUsd)

      if (allocations?.length) {
        const ids = allocations.map((item) => item.cropId).filter((id): id is string => Boolean(id))
        const previous = new Set(before?.allocations.map((item) => item.cropId))
        const newIds = ids.filter((id) => !previous.has(id))
        if (await tx.crop.count({ where: { id: { in: newIds }, active: true, deletedAt: null } }) !== newIds.length) {
          throw new ProductionError('Uno de los cultivos no existe o está inactivo.')
        }
      }

      const normalizedName = normalizeName(categoryName)
      const category = await tx.costCategory.upsert({
        where: { normalizedName }, update: { active: true }, create: { name: categoryName, normalizedName },
      })
      if (category.deletedAt) throw new ProductionError('Esta categoría está en la papelera.', 409)
      const data = {
        date, description, categoryId: category.id, amountUsd, applicationType,
        notes: cleanName(body.notes).slice(0, 2000) || null,
      }
      if (!before) return tx.cost.create({ data: { ...data, allocations: { create: next } }, include: costInclude })
      const changeAllocations = allocations !== undefined || applicationType === 'GENERAL'
      if (changeAllocations) {
        await tx.costAllocation.updateMany({ where: { costId: id, deletedAt: null }, data: { deletedAt: new Date() } })
      }
      return tx.cost.update({
        where: { id },
        data: {
          ...data,
          subcategoryId: before.categoryId === category.id ? before.subcategoryId : null,
          allocations: changeAllocations ? { create: next } : undefined,
        },
        include: costInclude,
      })
    }, { isolationLevel: 'Serializable' })
    return NextResponse.json(row, { status: update ? 200 : 201 })
  } catch (error) {
    return productionError(error, 'No se pudo guardar el costo.')
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
    const { id } = await readBody(request)
    if (typeof id !== 'string' || !id) throw new ProductionError('Indica el costo que quieres eliminar.')
    const actor = await currentActor()
    const result = await prisma.$transaction(async (tx) => {
      if (!(await tx.cost.findFirst({ where: { id, deletedAt: null } }))) {
        throw new ProductionError('El costo no existe o está en la papelera.', 404)
      }
      return moveToTrash(tx, 'cost', id, undefined, actor)
    }, { isolationLevel: 'Serializable' })
    return NextResponse.json(result)
  } catch (error) {
    return productionError(error, 'No se pudo mover el costo a la papelera.')
  }
}
