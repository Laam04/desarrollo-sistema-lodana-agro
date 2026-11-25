import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ProductionError, productionError, readBody, requireProfile } from '@/lib/production-api'
import { cleanName, normalizeCatalogName } from '@/lib/production-validation'

export async function GET() {
  try {
    await requireProfile(['production', 'admin'])
    return NextResponse.json(await prisma.zone.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 500,
    }))
  } catch (error) {
    return productionError(error, 'No se pudieron consultar las zonas.')
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireProfile(['production', 'admin'])
    const body = await readBody(request)
    const name = cleanName(body.name)
    const normalizedName = normalizeCatalogName(name)
    if (!normalizedName || name.length > 120) throw new ProductionError('Ingresa un nombre de zona de hasta 120 caracteres.')
    const zone = await prisma.zone.upsert({
      where: { normalizedName }, update: {}, create: { name, normalizedName }, select: { id: true, name: true },
    })
    await prisma.auditLog.create({
      data: { entity: 'Zone', entityId: zone.id, action: 'CREATE', actor, afterJson: { name: zone.name } },
    }).catch(() => {})
    return NextResponse.json(zone)
  } catch (error) {
    return productionError(error, 'No se pudo guardar la zona.')
  }
}
