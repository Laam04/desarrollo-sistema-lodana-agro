import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const units = await prisma.unit.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  return NextResponse.json(units)
}

export async function POST(request: Request) {
  const body = await request.json()
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : ''
  if (!name || name.length > 60) return NextResponse.json({ error: 'Escribe un nombre de unidad.' }, { status: 400 })
  const existing = await prisma.unit.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
  const unit = existing ? await prisma.unit.update({ where: { id: existing.id }, data: { active: true } }) : await prisma.unit.create({ data: { name } })
  return NextResponse.json(unit, { status: existing ? 200 : 201 })
}
