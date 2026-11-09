import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cleanName, parseDate, parsePositiveDecimal, validateCropReferences, validateUnit } from '@/lib/production-validation'

export async function GET() {
  return NextResponse.json(await prisma.shipment.findMany({ where: { status: 'ACTIVE' }, include: { crop: true, variety: true, lot: true, unit: true }, orderBy: { date: 'desc' }, take: 100 }))
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>
  const date = parseDate(body.date)
  const cropId = typeof body.cropId === 'string' ? body.cropId : ''
  const quantity = parsePositiveDecimal(body.quantity)
  const unitPrice = parsePositiveDecimal(body.unitPrice)
  const marketQuantity = body.marketQuantity == null || body.marketQuantity === '' ? null : Number(body.marketQuantity)
  if (!date || !cropId || !quantity || !unitPrice || (marketQuantity != null && (!Number.isFinite(marketQuantity) || marketQuantity < 0 || marketQuantity > quantity))) return NextResponse.json({ error: 'Fecha, cultivo, cantidades válidas y precio positivo son obligatorios.' }, { status: 400 })
  const refs = await validateCropReferences(body, cropId)
  if ('error' in refs) return NextResponse.json({ error: refs.error }, { status: 400 })
  const unit = await validateUnit(body.unitId || refs.crop.unitId)
  if (!unit) return NextResponse.json({ error: 'Selecciona una unidad activa.' }, { status: 400 })
  const row = await prisma.shipment.create({ data: { date, cropId, varietyId: refs.varietyId, lotId: refs.lotId, quantity, marketQuantity, unitId: unit.id, unitPrice, totalAmount: quantity * unitPrice, notes: cleanName(body.notes) || null }, include: { crop: true, variety: true, lot: true, unit: true } })
  return NextResponse.json(row, { status: 201 })
}
