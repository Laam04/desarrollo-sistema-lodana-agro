import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cleanName, parseDate, parsePositiveDecimal } from '@/lib/production-validation'

export async function GET() {
  return NextResponse.json(
    await prisma.cost.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        category: true,
        subcategory: true,
        allocations: {
          where: {
            deletedAt: null,
          },
          include: {
            crop: true,
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
      take: 100,
    })
  )
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>
  const date = parseDate(body.date)
  const description = cleanName(body.description)
  const categoryName = cleanName(body.category)
  const amountUsd = parsePositiveDecimal(body.amountUsd)
  if (!date || !description || !categoryName || !amountUsd) return NextResponse.json({ error: 'Completa fecha, descripción, categoría e importe positivo.' }, { status: 400 })
  const categoryKey = categoryName.toLocaleLowerCase('es-EC')
const existingCategory = await prisma.costCategory.findUnique({
  where: { normalizedName: categoryKey },
})

if (existingCategory?.deletedAt) {
  return NextResponse.json(
    { error: 'Esta categoría está en la papelera. Restáurala antes de utilizarla.' },
    { status: 409 }
  )
}

const category = await prisma.costCategory.upsert({
  where: { normalizedName: categoryKey },
  update: { active: true },
  create: {
    name: categoryName,
    normalizedName: categoryKey,
  },
})
  const allocations = Array.isArray(body.allocations) ? body.allocations : []
  const allocationData = allocations.map((item) => ({ cropId: typeof item?.cropId === 'string' ? item.cropId : null, amountUsd: item?.amountUsd == null ? null : Number(item.amountUsd), percent: item?.percent == null ? null : Number(item.percent) })).filter((item) => item.cropId || item.amountUsd || item.percent)
  const cropIds = [
  ...new Set(
    allocationData
      .map((item) => item.cropId)
      .filter((id): id is string => Boolean(id))
  ),
]

if (cropIds.length) {
  const validCrops = await prisma.crop.findMany({
    where: {
      id: { in: cropIds },
      deletedAt: null,
      active: true,
    },
    select: { id: true },
  })

  if (validCrops.length !== cropIds.length) {
    return NextResponse.json(
      { error: 'Uno o más cultivos están inactivos o en la papelera.' },
      { status: 400 }
    )
  }
}
  const amounts = allocationData.filter((item) => item.amountUsd != null).reduce((sum, item) => sum + Number(item.amountUsd), 0)
  const percents = allocationData.filter((item) => item.percent != null).reduce((sum, item) => sum + Number(item.percent), 0)
  if (allocationData.length && amounts && Math.abs(amounts - amountUsd) > 0.01) return NextResponse.json({ error: 'Las asignaciones monetarias deben coincidir con el total.' }, { status: 400 })
  if (allocationData.length && !amounts && Math.abs(percents - 100) > 0.0001) return NextResponse.json({ error: 'Las asignaciones porcentuales deben sumar 100%.' }, { status: 400 })
  const row = await prisma.cost.create({ data: { date, description, categoryId: category.id, amountUsd, notes: cleanName(body.notes) || null, applicationType: cleanName(body.applicationType) || 'GENERAL', allocations: { create: allocationData } }, include: { category: true, allocations: true } })
  return NextResponse.json(row, { status: 201 })
}
