import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const clean = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
const uniqueNames = (value: unknown) => Array.isArray(value) ? [...new Map(value.map(clean).filter(Boolean).map((name) => [name.toLocaleLowerCase('es-EC'), name])).values()] : []

export async function GET() {
  const crops = await prisma.crop.findMany({ where: { active: true }, include: { unit: true, varieties: { where: { active: true } }, lots: { where: { active: true } }, zones: { where: { active: true } } }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json(crops)
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>
  const name = clean(body.name)
  const normalizedName = name.toLocaleLowerCase('es-EC')
  if (!name || name.length > 120) return NextResponse.json({ error: 'El nombre del cultivo es obligatorio.' }, { status: 400 })
  if (await prisma.crop.findUnique({ where: { normalizedName } })) return NextResponse.json({ error: 'Ese cultivo ya existe en el catálogo.' }, { status: 409 })
  const varietyNames = uniqueNames(body.varieties)
  const zoneNames = uniqueNames(body.zones)
  const lotDrafts = Array.isArray(body.lots) ? body.lots.filter((item) => item && typeof item.name === 'string').map((item) => ({ name: clean(item.name), normalizedName: clean(item.name).toLocaleLowerCase('es-EC'), surface: item.surface === '' || item.surface == null ? null : Number(item.surface), surfaceUnit: 'ha', notes: clean(item.notes) || null })).filter((item) => item.name && (item.surface == null || Number.isFinite(item.surface))) : []
  const uniqueLots = [...new Map(lotDrafts.map((lot) => [lot.normalizedName, lot])).values()]
  const unitId = typeof body.unitId === 'string' && body.unitId ? body.unitId : null
  const crop = await prisma.$transaction(async (tx) => tx.crop.create({ data: { name, normalizedName, hasVarieties: body.hasVarieties === true, hasLots: body.hasLots === true, tracksSurface: body.tracksSurface === true, hasOtherDetails: body.hasOtherDetails === true, unitId, varieties: { create: varietyNames.map((name) => ({ name, normalizedName: name.toLocaleLowerCase('es-EC') })) }, zones: { create: zoneNames.map((name) => ({ name, normalizedName: name.toLocaleLowerCase('es-EC') })) }, lots: { create: uniqueLots.map((lot) => ({ name: lot.name, normalizedName: lot.normalizedName, surface: lot.surface, surfaceUnit: lot.surfaceUnit, notes: lot.notes })) } }, include: { unit: true, varieties: true, zones: true, lots: true } }))
  return NextResponse.json(crop, { status: 201 })
}
