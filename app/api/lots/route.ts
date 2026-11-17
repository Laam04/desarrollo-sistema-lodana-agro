import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cleanName, normalizeName } from '@/lib/production-validation'

export async function GET() {
  const rows = await prisma.productionArea.findMany({
    where: { active: true },
    include: { crop: true },
    orderBy: [{ crop: { name: 'asc' } }, { name: 'asc' }],
  })

  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const cropId = typeof body.cropId === 'string' ? body.cropId : ''
    const name = cleanName(body.name)
    const normalizedName = normalizeName(name)

    const surface =
      body.surface === '' || body.surface == null
        ? null
        : Number(body.surface)

    if (!cropId || !name || name.length > 120) {
      return NextResponse.json(
        { error: 'Cultivo y nombre del lote son obligatorios.' },
        { status: 400 }
      )
    }

    if (
      surface !== null &&
      (!Number.isFinite(surface) || surface <= 0)
    ) {
      return NextResponse.json(
        { error: 'La superficie debe ser un número positivo.' },
        { status: 400 }
      )
    }

    const crop = await prisma.crop.findFirst({
      where: { id: cropId, active: true },
    })

    if (!crop) {
      return NextResponse.json(
        { error: 'El cultivo no existe o está inactivo.' },
        { status: 400 }
      )
    }

    const lot = await prisma.productionArea.upsert({
      where: {
        cropId_normalizedName: { cropId, normalizedName },
      },
      update: {
        name,
        type: 'LOT',
        surface,
        surfaceUnit:
          typeof body.surfaceUnit === 'string' ? body.surfaceUnit : 'ha',
        notes: cleanName(body.notes) || null,
        active: true,
      },
      create: {
        cropId,
        name,
        normalizedName,
        type: 'LOT',
        surface,
        surfaceUnit:
          typeof body.surfaceUnit === 'string' ? body.surfaceUnit : 'ha',
        notes: cleanName(body.notes) || null,
      },
    })

    return NextResponse.json(lot, { status: 201 })
  } catch (error) {
    console.error('Error al registrar lote:', error)
    return NextResponse.json(
      { error: 'No se pudo registrar el lote.' },
      { status: 500 }
    )
  }
}