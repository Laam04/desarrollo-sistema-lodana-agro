import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cleanName, parseDate, parsePositiveDecimal, validateCropReferences, validateUnit } from '@/lib/production-validation'

async function getReason(name: string) {
  const normalizedName = name.toLocaleLowerCase('es-EC')
  return prisma.lossReason.upsert({ where: { normalizedName }, update: { active: true }, create: { name, normalizedName } })
}

export async function GET() {
  return NextResponse.json(await prisma.loss.findMany({ where: { status: 'ACTIVE' }, include: { crop: true, variety: true, lot: true, unit: true, reason: true }, orderBy: { date: 'desc' }, take: 100 }))
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>
  const date = parseDate(body.date)
  const cropId = typeof body.cropId === 'string' ? body.cropId : ''
  const quantity = parsePositiveDecimal(body.quantity)
  const reasonName = cleanName(body.reason)
  if (!date || !cropId || !quantity || !reasonName) return NextResponse.json({ error: 'Completa fecha, cultivo, cantidad positiva y motivo.' }, { status: 400 })
  const refs = await validateCropReferences(body, cropId)
  if ('error' in refs) return NextResponse.json({ error: refs.error }, { status: 400 })
  const unit = await validateUnit(body.unitId || refs.crop.unitId)
  if (!unit) return NextResponse.json({ error: 'Selecciona una unidad activa.' }, { status: 400 })
  const reason = await getReason(reasonName)
  const row = await prisma.loss.create({ data: { date, cropId, varietyId: refs.varietyId, lotId: refs.lotId, quantity, unitId: unit.id, reasonId: reason.id, notes: cleanName(body.notes) || null }, include: { crop: true, variety: true, lot: true, unit: true, reason: true } })
  return NextResponse.json(row, { status: 201 })
}
