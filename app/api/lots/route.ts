import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const clean = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''

export async function POST(request: Request) {
  const body = await request.json()
  const cropId = typeof body.cropId === 'string' ? body.cropId : ''
  const name = clean(body.name)
  const normalizedName = name.toLocaleLowerCase('es-EC')
  const surface = body.surface === '' || body.surface == null ? null : Number(body.surface)
  if (!cropId || !name || name.length > 120) return NextResponse.json({ error: 'Cultivo y nombre del lote son obligatorios.' }, { status: 400 })
  if (surface !== null && (!Number.isFinite(surface) || surface < 0)) return NextResponse.json({ error: 'La superficie debe ser un número positivo o desconocido.' }, { status: 400 })
  const crop = await prisma.crop.findFirst({ where: { id: cropId, active: true } })
  if (!crop) return NextResponse.json({ error: 'El cultivo no existe o está inactivo.' }, { status: 400 })
  const lot = await prisma.lot.upsert({ where: { cropId_normalizedName: { cropId, normalizedName } }, update: { name, surface, surfaceUnit: typeof body.surfaceUnit === 'string' ? body.surfaceUnit : 'ha', notes: clean(body.notes) || null, active: true }, create: { cropId, name, normalizedName, surface, surfaceUnit: typeof body.surfaceUnit === 'string' ? body.surfaceUnit : 'ha', notes: clean(body.notes) || null } })
  return NextResponse.json(lot, { status: 201 })
}
