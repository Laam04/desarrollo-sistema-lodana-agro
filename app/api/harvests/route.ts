import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cleanName, parseDate, parsePositiveDecimal, validateCropReferences, validateUnit } from '@/lib/production-validation'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cropId = searchParams.get('cropId') || undefined
  const rows = await prisma.harvest.findMany({ where: { status: 'ACTIVE', cropId }, include: { crop: true, variety: true, lot: true, unit: true }, orderBy: { date: 'desc' }, take: 100 })
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>
  const date = parseDate(body.date)
  const cropId = typeof body.cropId === 'string' ? body.cropId : ''
  const quantity = parsePositiveDecimal(body.quantity)
  if (!date || !quantity || !cropId) return NextResponse.json({ error: 'Fecha, cultivo y cantidad positiva son obligatorios.' }, { status: 400 })
  const refs = await validateCropReferences(body, cropId)
  if ('error' in refs) return NextResponse.json({ error: refs.error }, { status: 400 })
  const unit = await validateUnit(body.unitId || refs.crop.unitId)
  if (!unit) return NextResponse.json({ error: 'Selecciona una unidad activa.' }, { status: 400 })
  const row = await prisma.harvest.create({ data: { date, cropId, varietyId: refs.varietyId, lotId: refs.lotId, quantity, unitId: unit.id, notes: cleanName(body.notes) || null }, include: { crop: true, variety: true, lot: true, unit: true } })
  return NextResponse.json(row, { status: 201 })
}
