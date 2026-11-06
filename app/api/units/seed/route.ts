import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST() {
  const units = await prisma.$transaction(['racimos', 'kilogramos', 'quintales', 'cajas', 'unidades'].map((name) => prisma.unit.upsert({ where: { name }, update: {}, create: { name } })))
  return NextResponse.json(units)
}
