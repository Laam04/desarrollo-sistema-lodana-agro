import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma, runSerializable } from '@/lib/prisma'
import { ProductionError, productionError, readBody, requireProfile } from '@/lib/production-api'
import { historyQuery } from '@/lib/production-history'
import { matchesShipmentDraft, saveShipment, shipmentDraft, shipmentInclude } from '@/lib/shipments'

export async function GET(request: Request) {
  try {
    await requireProfile(['production', 'admin'])
    const { date, search, skip, take, result } = historyQuery(request, 100)
    const rows = await prisma.shipment.findMany({
      where: {
        deletedAt: null, date,
        OR: search ? [
          { code: search }, { notes: search },
          { items: { some: { deletedAt: null, OR: [{ crop: { name: search } }, { variety: { name: search } }, { productionArea: { name: search } }] } } },
        ] : undefined,
      },
      include: shipmentInclude,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take, skip,
    })
    return NextResponse.json(result(rows))
  } catch (error) {
    return productionError(error, 'No se pudieron consultar los envíos.')
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireProfile(['production', 'admin'])
    const draft = shipmentDraft(await readBody(request), true)
    try {
      const { shipment, created } = await runSerializable((tx) => saveShipment(tx, draft, actor))
      return NextResponse.json(shipment, { status: created ? 201 : 200 })
    } catch (error) {
      if (draft.requestId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await prisma.shipment.findUnique({ where: { requestId: draft.requestId }, include: shipmentInclude })
        if (existing) {
          if (!matchesShipmentDraft(existing, draft, actor)) {
            throw new ProductionError('La clave de solicitud ya corresponde a otro envío.', 409)
          }
          return NextResponse.json(existing, { status: 200 })
        }
      }
      throw error
    }
  } catch (error) {
    return productionError(error, 'No se pudo registrar el envío.')
  }
}
