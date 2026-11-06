import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const units = await prisma.unit.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  return NextResponse.json(units)
}

export async function POST(request: Request) {
  const body = await request.json()
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 60) return NextResponse.json({ error: 'Escribe un nombre de unidad.' }, { status: 400 })
  const unit = await prisma.unit.upsert({ where: { name }, update: { active: true }, create: { name } })
  return NextResponse.json(unit, { status: 201 })
}
