import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cleanName, parseDate, parsePositiveDecimal, validateCropReferences, validateUnit } from '@/lib/production-validation'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json() as Record<string, unknown>
  const date = parseDate(body.date), quantity = parsePositiveDecimal(body.quantity), unitPrice = parsePositiveDecimal(body.unitPrice), cropId = typeof body.cropId === 'string' ? body.cropId : ''
  const marketQuantity = body.marketQuantity == null || body.marketQuantity === '' ? null : Number(body.marketQuantity)
  if (!date || !quantity || !unitPrice || !cropId || (marketQuantity != null && (!Number.isFinite(marketQuantity) || marketQuantity < 0 || marketQuantity > quantity))) return NextResponse.json({ error: 'Revisa fecha, cantidades y precio.' }, { status: 400 })
  const refs = await validateCropReferences(body, cropId)
  if ('error' in refs) return NextResponse.json({ error: refs.error }, { status: 400 })
  const unit = await validateUnit(body.unitId || refs.crop.unitId)
  if (!unit) return NextResponse.json({ error: 'Selecciona una unidad activa.' }, { status: 400 })
  const row = await prisma.shipment.update({ where: { id }, data: { date, cropId, varietyId: refs.varietyId, lotId: refs.lotId, quantity, marketQuantity, unitId: unit.id, unitPrice, totalAmount: quantity * unitPrice, recipient: cleanName(body.recipient) || null, notes: cleanName(body.notes) || null }, include: { crop: true, variety: true, lot: true, unit: true } })
  return NextResponse.json(row)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await prisma.shipment.update({ where: { id }, data: { status: 'VOID' } })
  return NextResponse.json({ id: row.id, status: row.status })
}
