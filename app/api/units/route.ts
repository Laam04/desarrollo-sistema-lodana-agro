
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cleanName, normalizeName } from '@/lib/production-validation'

export async function GET() {
  try {
    const units = await prisma.unit.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(units)
  } catch (error) {
    console.error('Error consultando unidades:', error)
    return NextResponse.json(
      { error: 'No se pudieron consultar las unidades.' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = cleanName(body.name)

    if (!name || name.length > 60) {
      return NextResponse.json(
        { error: 'Escribe un nombre de unidad válido.' },
        { status: 400 }
      )
    }

    const existing = await prisma.unit.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
      },
    })

    if (existing) {
      const unit = await prisma.unit.update({
        where: { id: existing.id },
        data: { active: true, name },
      })

      return NextResponse.json(unit)
    }

    const unit = await prisma.unit.create({
      data: { name },
    })

    return NextResponse.json(unit, { status: 201 })
  } catch (error) {
    console.error('Error creando unidad:', error)
    return NextResponse.json(
      { error: 'No se pudo registrar la unidad.' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const id = typeof body.id === 'string' ? body.id : ''
    const name = cleanName(body.name)

    if (!id || !name || name.length > 60) {
      return NextResponse.json(
        { error: 'Identificador y nombre de unidad son obligatorios.' },
        { status: 400 }
      )
    }

    const duplicate = await prisma.unit.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        NOT: { id },
      },
    })

    if (duplicate) {
      return NextResponse.json(
        { error: 'Ya existe una unidad con ese nombre.' },
        { status: 409 }
      )
    }

    const unit = await prisma.unit.update({
      where: { id },
      data: { name },
    })

    return NextResponse.json(unit)
  } catch (error) {
    console.error('Error actualizando unidad:', error)
    return NextResponse.json(
      { error: 'No se pudo actualizar la unidad.' },
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
        { error: 'Identificador de unidad obligatorio.' },
        { status: 400 }
      )
    }

    await prisma.unit.update({
      where: { id },
      data: { active: false },
    })

    return NextResponse.json({ message: 'Unidad desactivada.' })
  } catch (error) {
    console.error('Error desactivando unidad:', error)
    return NextResponse.json(
      { error: 'No se pudo desactivar la unidad.' },
      { status: 500 }
    )
  }
}
