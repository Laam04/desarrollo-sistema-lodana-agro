import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma, runSerializable } from '@/lib/prisma'
import { isRecord, ProductionError, productionError, readBody, requireProfile } from '@/lib/production-api'
import { historyQuery } from '@/lib/production-history'
import { cleanName, normalizeCatalogName, parseDate, parseDecimal, parsePositiveDecimal } from '@/lib/production-validation'
import { cleanReceiptImageName, defaultReceiptFileName, parseReceiptImageDataUrl } from '@/lib/receipt-image'
import { moveToTrash, retireIfExpired } from '@/lib/trash'

const costSelect = {
  id: true,
  date: true,
  description: true,
  categoryId: true,
  subcategoryId: true,
  amountUsd: true,
  notes: true,
  receiptImageName: true,
  applicationType: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  category: true,
  subcategory: true,
  allocations: { where: { deletedAt: null }, include: { crop: true } },
} satisfies Prisma.CostSelect

function serializeCost<T extends { id: string; receiptImageName: string | null; updatedAt: Date }>(row: T) {
  const hasReceiptImage = Boolean(row.receiptImageName)
  return {
    ...row,
    hasReceiptImage,
    receiptImageUrl: hasReceiptImage ? `/api/costs/${row.id}/receipt?v=${row.updatedAt.getTime()}` : null,
  }
}

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
    await requireProfile(['production', 'admin'])
    const { date, search, take, skip, result } = historyQuery(request, 100)
    const rows = await prisma.cost.findMany({
      where: {
        deletedAt: null, date,
        OR: search ? [
          { description: search }, { category: { name: search } }, { notes: search },
          { allocations: { some: { deletedAt: null, crop: { name: search } } } },
        ] : undefined,
      },
      select: costSelect,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take, skip,
    })
    return NextResponse.json(result(rows.map(serializeCost)))
  } catch (error) {
    return productionError(error, 'No se pudieron consultar los costos.')
  }
}

async function save(request: Request, update: boolean) {
  try {
    const actor = await requireProfile(['production', 'admin'])
    const body = await readBody(request, 2 * 1024 * 1024)
    const id = typeof body.id === 'string' ? body.id : ''
    const date = parseDate(body.date)
    const description = cleanName(body.description)
    const categoryName = cleanName(body.category)
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId : ''
    const amountUsd = parsePositiveDecimal(body.amountUsd)
    if (!date || !description || description.length > 200 || (!categoryId && !categoryName) || categoryName.length > 120 ||
        !amountUsd || (update && !id)) {
      throw new ProductionError('Completa la fecha, descripción, categoría e importe positivo de hasta dos decimales.')
    }
    const explicit = body.allocations === undefined ? undefined : readAllocations(body.allocations)
    const cropIds: unknown = body.cropIds
    if (cropIds !== undefined && (!Array.isArray(cropIds) || !cropIds.length || cropIds.length > 100 ||
      !cropIds.every((cid) => typeof cid === 'string' && cid) || new Set(cropIds).size !== cropIds.length || explicit)) {
      throw new ProductionError('Selecciona entre 1 y 100 cultivos distintos.')
    }
    const selected: string[] | undefined = Array.isArray(cropIds) ? cropIds : undefined
    const applicationType = body.applicationType || (explicit?.length || selected?.length ? 'CROP' : 'GENERAL')
    if (applicationType !== 'CROP' && applicationType !== 'GENERAL') throw new ProductionError('Selecciona una aplicación válida.')

    let receiptPatch: { receiptImage: string | null; receiptImageName: string | null } | undefined
    if (body.receiptImage !== undefined) {
      if (body.receiptImage === null || body.receiptImage === '') {
        receiptPatch = { receiptImage: null, receiptImageName: null }
      } else {
        const parsedReceipt = parseReceiptImageDataUrl(body.receiptImage)
        if (!parsedReceipt) {
          throw new ProductionError('La foto de la factura debe ser una imagen JPG, PNG o WebP válida (máximo 1 MB).', 400)
        }
        receiptPatch = {
          receiptImage: parsedReceipt.dataUrl,
          receiptImageName: cleanReceiptImageName(body.receiptImageName) ?? defaultReceiptFileName(parsedReceipt.mime),
        }
      }
    }

    const row = await runSerializable(async (tx) => {
      const before = update ? await tx.cost.findFirst({ where: { id, deletedAt: null }, select: costSelect }) : null
      if (update && !before) throw new ProductionError('El costo no existe o está en la papelera.', 404)
      const unchanged = selected && before && selected.length === before.allocations.length &&
        selected.every((cid) => before.allocations.some((item) => item.cropId === cid)) &&
        (before.amountUsd.eq(amountUsd) || before.allocations.every((item) => item.percent !== null && item.amountUsd === null))
      const allocations = explicit ?? (selected && !unchanged ? selected.map((cropId, index) => ({
        cropId,
        amountUsd: null,
        percent: new Prisma.Decimal(Math.floor(1_000_000 / selected.length) + (index < 1_000_000 % selected.length ? 1 : 0)).div(10_000),
      })) : undefined)
      if (applicationType === 'GENERAL' && selected) throw new ProductionError('Los costos generales no se asignan a cultivos.')
      const next = allocations ?? (applicationType === 'CROP' ? before?.allocations ?? [] : [])
      if (applicationType === 'CROP' && !next.length) throw new ProductionError('Selecciona el cultivo al que se aplica el costo.')
      if (applicationType === 'GENERAL' && next.length) throw new ProductionError('Los costos generales no se asignan a cultivos.')
      if (allocations || !before?.amountUsd.eq(amountUsd)) validateTotals(next, amountUsd)

      if (allocations?.length) {
        const ids = allocations.map((item) => item.cropId).filter((cid): cid is string => Boolean(cid))
        const previous = new Set(before?.allocations.map((item) => item.cropId))
        const newIds = ids.filter((cid) => !previous.has(cid))
        if (await tx.crop.count({ where: { id: { in: newIds }, active: true, deletedAt: null } }) !== newIds.length) {
          throw new ProductionError('Uno de los cultivos no existe o está inactivo.')
        }
      }

      const normalizedName = normalizeCatalogName(categoryName)
      let category = null
      if (categoryId) {
        category = await tx.costCategory.findFirst({
          where: { id: categoryId, deletedAt: null, ...(before?.categoryId === categoryId ? {} : { active: true }) },
        })
      } else {
        const allCategories = await tx.costCategory.findMany()
        let existingCat =
          allCategories.find((item) => item.normalizedName === normalizedName) ??
          allCategories.find((item) => normalizeCatalogName(item.name) === normalizedName) ??
          null
        if (existingCat?.deletedAt) {
          if (await retireIfExpired(tx, 'costCategory', existingCat)) existingCat = null
          else throw new ProductionError('La categoría está en la papelera.', 409)
        }
        category = existingCat
          ? await tx.costCategory.update({ where: { id: existingCat.id }, data: { active: true } })
          : await tx.costCategory.create({ data: { name: categoryName, normalizedName } })
      }
      if (!category || category.deletedAt) throw new ProductionError('Selecciona una categoría activa.', 409)
      const data = {
        date, description, categoryId: category.id, amountUsd, applicationType,
        notes: cleanName(body.notes).slice(0, 2000) || null,
        ...(receiptPatch ?? {}),
      }
      let saved
      if (!before) {
        saved = await tx.cost.create({ data: { ...data, allocations: { create: next } }, select: costSelect })
      } else {
        const changeAllocations = allocations !== undefined || applicationType === 'GENERAL'
        if (changeAllocations) {
          await tx.costAllocation.updateMany({ where: { costId: id, deletedAt: null }, data: { deletedAt: new Date() } })
        }
        saved = await tx.cost.update({
          where: { id },
          data: {
            ...data,
            subcategoryId: before.categoryId === category.id ? before.subcategoryId : null,
            allocations: changeAllocations ? { create: next } : undefined,
          },
          select: costSelect,
        })
      }
      await tx.auditLog.create({
        data: {
          entity: 'Cost', entityId: saved.id, action: before ? 'UPDATE' : 'CREATE', actor,
          beforeJson: before
            ? {
                amountUsd: before.amountUsd.toString(),
                description: before.description,
                hasReceiptImage: Boolean(before.receiptImageName),
              }
            : undefined,
          afterJson: {
            amountUsd: saved.amountUsd.toString(),
            description: saved.description,
            hasReceiptImage: Boolean(saved.receiptImageName),
          },
        },
      })
      return serializeCost(saved)
    })
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
    const actor = await requireProfile(['production', 'admin'])
    const { id } = await readBody(request)
    if (typeof id !== 'string' || !id) throw new ProductionError('Indica el costo que quieres eliminar.')
    const result = await runSerializable(async (tx) => {
      const cost = await tx.cost.findFirst({ where: { id, deletedAt: null }, include: { allocations: { where: { deletedAt: null } } } })
      if (!cost) throw new ProductionError('El costo no existe o está en la papelera.', 404)
      const entry = await moveToTrash(tx, 'cost', id, undefined, actor)
      for (const allocation of cost.allocations) {
        await moveToTrash(tx, 'costAllocation', allocation.id, entry.groupId, actor)
      }
      await tx.auditLog.create({
        data: { entity: 'Cost', entityId: id, action: 'TRASH', actor, beforeJson: { amountUsd: cost.amountUsd.toString(), description: cost.description } },
      })
      return entry
    })
    return NextResponse.json(result)
  } catch (error) {
    return productionError(error, 'No se pudo mover el costo a la papelera.')
  }
}
