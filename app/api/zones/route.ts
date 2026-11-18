import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ProductionError, productionError, readBody } from '@/lib/production-api'
import { cleanName, normalizeCatalogName } from '@/lib/production-validation'

export async function GET() {
  try {
    return NextResponse.json(await prisma.zone.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }))
  } catch (error) {
    return productionError(error, 'No se pudieron consultar las zonas.')
  }
}

export async function POST(request: Request) {
  try {
    const body = await readBody(request)
    const name = cleanName(body.name)
    const normalizedName = normalizeCatalogName(name)
    if (!normalizedName || name.length > 120) throw new ProductionError('Ingresa un nombre de zona de hasta 120 caracteres.')
    const zone = await prisma.zone.upsert({
      where: { normalizedName }, update: {}, create: { name, normalizedName }, select: { id: true, name: true },
    })
    return NextResponse.json(zone)
  } catch (error) {
    return productionError(error, 'No se pudo guardar la zona.')
  }
}
