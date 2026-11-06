import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  const body = await request.json()
  const cropId = typeof body.cropId === 'string' ? body.cropId : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!cropId || !name || name.length > 120) return NextResponse.json({ error: 'Cultivo y nombre del lote son obligatorios.' }, { status: 400 })
  const surface = body.surface === '' || body.surface == null ? null : Number(body.surface)
  if (surface !== null && (!Number.isFinite(surface) || surface < 0)) return NextResponse.json({ error: 'La superficie debe ser un número positivo o desconocido.' }, { status: 400 })
  const lot = await prisma.lot.create({ data: { cropId, name, surface, surfaceUnit: surface === null ? null : (typeof body.surfaceUnit === 'string' ? body.surfaceUnit : 'ha') } })
  return NextResponse.json(lot, { status: 201 })
}
