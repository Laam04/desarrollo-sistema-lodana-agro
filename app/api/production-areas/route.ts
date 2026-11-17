
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  cleanName,
  normalizeName,
} from '@/lib/production-validation'

const productionAreaModel =
  (prisma as any).productionArea ?? (prisma as any).productionAreas

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const cropId = searchParams.get('cropId')

    const areas = await productionAreaModel.findMany({
      where: {
  active: true,
  deletedAt: null,
  crop: {
    deletedAt: null,
  },
  ...(cropId ? { cropId } : {}),
},
      include: { crop: true },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(areas)
  } catch (error) {
    console.error('Error consultando áreas:', error)
    return NextResponse.json(
      { error: 'No se pudieron consultar las áreas productivas.' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const cropId = typeof body.cropId === 'string' ? body.cropId : ''
    const name = cleanName(body.name)
    const normalizedName = normalizeName(name)
    const type = body.type === 'ZONE' ? 'ZONE' : 'LOT'

    const surface =
      body.surface === '' || body.surface == null
        ? null
        : Number(body.surface)

    if (!cropId || !name || name.length > 120) {
      return NextResponse.json(
        { error: 'Cultivo y nombre del área son obligatorios.' },
        { status: 400 }
      )
    }

    if (
      surface !== null &&
      (!Number.isFinite(surface) || surface < 0)
    ) {
      return NextResponse.json(
        { error: 'La superficie debe ser un número válido.' },
        { status: 400 }
      )
    }

    const crop = await prisma.crop.findFirst({
  where: {
    id: cropId,
    active: true,
    deletedAt: null,
  },
})

    if (!crop) {
      return NextResponse.json(
        { error: 'El cultivo no existe o está inactivo.' },
        { status: 400 }
      )
    }

    const existing = await productionAreaModel.findFirst({
      where: { cropId, normalizedName },
    })

    if (existing?.deletedAt) {
      return NextResponse.json(
        {
          error:
            'Esta área está en la papelera. Restáurala antes de registrarla nuevamente.',
        },
        { status: 409 }
      )
    }

    const data = {
      name,
      type,
      surface: type === 'LOT' ? surface : null,
      surfaceUnit: cleanName(body.surfaceUnit) || 'ha',
      notes: cleanName(body.notes) || null,
      active: true,
    }

    const area = existing
      ? await productionAreaModel.update({
          where: { id: existing.id },
          data,
        })
      : await productionAreaModel.create({
          data: {
            cropId,
            normalizedName,
            ...data,
          },
        })

    return NextResponse.json(area, {
      status: existing ? 200 : 201,
    })
  } catch (error) {
    console.error('Error registrando área:', error)
    return NextResponse.json(
      { error: 'No se pudo registrar el área productiva.' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const id = typeof body.id === 'string' ? body.id : ''
    const name = cleanName(body.name)

    if (!id || !name || name.length > 120) {
      return NextResponse.json(
        { error: 'Identificador y nombre del área son obligatorios.' },
        { status: 400 }
      )
    }

    const existing = await productionAreaModel.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Área productiva no encontrada.' },
        { status: 404 }
      )
    }

    const normalizedName = normalizeName(name)

    const duplicate = await productionAreaModel.findFirst({
      where: {
  cropId: existing.cropId,
  normalizedName,
  deletedAt: null,
  NOT: { id },
},
    })

    if (duplicate) {
      return NextResponse.json(
        { error: 'Ya existe un área con ese nombre para este cultivo.' },
        { status: 409 }
      )
    }

    const area = await productionAreaModel.update({
      where: { id },
      data: {
        name,
        normalizedName,
        ...(body.type === 'LOT' || body.type === 'ZONE'
          ? { type: body.type }
          : {}),
        ...(body.surface !== undefined
          ? {
              surface:
                body.surface === null || body.surface === ''
                  ? null
                  : Number(body.surface),
            }
          : {}),
        ...(body.notes !== undefined
          ? { notes: cleanName(body.notes) || null }
          : {}),
      },
    })

    return NextResponse.json(area)
  } catch (error) {
    console.error('Error actualizando área:', error)
    return NextResponse.json(
      { error: 'No se pudo actualizar el área productiva.' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json()
    const id = typeof body.id === 'string' ? body.id : ''

    if (!id) {
      return NextResponse.json(
        { error: 'Identificador de área obligatorio.' },
        { status: 400 }
      )
    }

    await productionAreaModel.update({
      where: { id },
      data: { active: false },
    })

    return NextResponse.json({
      message: 'Área productiva desactivada.',
    })
  } catch (error) {
    console.error('Error desactivando área:', error)
    return NextResponse.json(
      { error: 'No se pudo desactivar el área productiva.' },
      { status: 500 }
    )
  }
}
