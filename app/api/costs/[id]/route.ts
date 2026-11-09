import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cleanName, parseDate, parsePositiveDecimal } from '@/lib/production-validation'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json() as Record<string, unknown>
  const date = parseDate(body.date), description = cleanName(body.description), categoryName = cleanName(body.category), amountUsd = parsePositiveDecimal(body.amountUsd)
  if (!date || !description || !categoryName || !amountUsd) return NextResponse.json({ error: 'Completa fecha, descripción, categoría e importe.' }, { status: 400 })
  const categoryKey = categoryName.toLocaleLowerCase('es-EC')
  const category = await prisma.costCategory.upsert({ where: { normalizedName: categoryKey }, update: { name: categoryName, active: true }, create: { name: categoryName, normalizedName: categoryKey } })
  const allocations = Array.isArray(body.allocations) ? body.allocations : []
  const allocationData = allocations.map((item) => ({ cropId: typeof item?.cropId === 'string' ? item.cropId : null, amountUsd: item?.amountUsd == null ? null : Number(item.amountUsd), percent: item?.percent == null ? null : Number(item.percent) })).filter((item) => item.cropId || item.amountUsd || item.percent)
  const amounts = allocationData.reduce((sum, item) => sum + Number(item.amountUsd || 0), 0), percents = allocationData.reduce((sum, item) => sum + Number(item.percent || 0), 0)
  if (allocationData.length && amounts && Math.abs(amounts - amountUsd) > 0.01) return NextResponse.json({ error: 'Las asignaciones monetarias deben coincidir con el importe.' }, { status: 400 })
  if (allocationData.length && !amounts && Math.abs(percents - 100) > 0.0001) return NextResponse.json({ error: 'Las asignaciones deben sumar 100%.' }, { status: 400 })
  const row = await prisma.$transaction(async (tx) => { await tx.costAllocation.deleteMany({ where: { costId: id } }); return tx.cost.update({ where: { id }, data: { date, description, categoryId: category.id, amountUsd, notes: cleanName(body.notes) || null, allocations: { create: allocationData } }, include: { category: true, allocations: { include: { crop: true } } } }) })
  return NextResponse.json(row)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await prisma.cost.update({ where: { id }, data: { active: false } })
  return NextResponse.json({ id: row.id, active: row.active })
}
