import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const asNames = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))] : []

export async function GET() {
  const crops = await prisma.crop.findMany({ include: { unit: true, varieties: { where: { active: true } }, lots: { where: { active: true } }, zones: { where: { active: true } } }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json(crops)
}

export async function POST(request: Request) {
  const body = await request.json()
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 120) return NextResponse.json({ error: 'El nombre del cultivo es obligatorio.' }, { status: 400 })
  const varietyNames = asNames(body.varieties)
  const zoneNames = asNames(body.zones)
  const unitId = typeof body.unitId === 'string' && body.unitId ? body.unitId : null
  const crop = await prisma.crop.create({ data: { name, hasVarieties: body.hasVarieties === true, hasLots: body.hasLots === true, tracksSurface: body.tracksSurface === true, hasOtherDetails: body.hasOtherDetails === true, unitId, varieties: { create: varietyNames.map((name) => ({ name })) }, zones: { create: zoneNames.map((name) => ({ name })) } }, include: { unit: true, varieties: true, zones: true, lots: true } })
  return NextResponse.json(crop, { status: 201 })
}
