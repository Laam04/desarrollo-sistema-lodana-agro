import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cleanName, parseDate, parsePositiveDecimal, validateCropReferences, validateUnit } from '@/lib/production-validation'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json() as Record<string, unknown>
  const date = parseDate(body.date), quantity = parsePositiveDecimal(body.quantity), cropId = typeof body.cropId === 'string' ? body.cropId : '', reason = cleanName(body.reason)
  if (!date || !quantity || !cropId || !reason) return NextResponse.json({ error: 'Completa fecha, cultivo, cantidad y motivo.' }, { status: 400 })
  const refs = await validateCropReferences(body, cropId)
  if ('error' in refs) return NextResponse.json({ error: refs.error }, { status: 400 })
  const unit = await validateUnit(body.unitId || refs.crop.unitId)
  if (!unit) return NextResponse.json({ error: 'Selecciona una unidad activa.' }, { status: 400 })
  const normalizedName = reason.toLocaleLowerCase('es-EC')
  const reasonRow = await prisma.lossReason.upsert({ where: { normalizedName }, update: { name: reason, active: true }, create: { name: reason, normalizedName } })
  const row = await prisma.loss.update({ where: { id }, data: { date, cropId, varietyId: refs.varietyId, lotId: refs.lotId, quantity, unitId: unit.id, reasonId: reasonRow.id, notes: cleanName(body.notes) || null }, include: { crop: true, variety: true, lot: true, unit: true, reason: true } })
  return NextResponse.json(row)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await prisma.loss.update({ where: { id }, data: { status: 'VOID' } })
  return NextResponse.json({ id: row.id, status: row.status })
}
