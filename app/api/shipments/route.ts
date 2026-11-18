import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { currentActor, productionError, readBody } from '@/lib/production-api'
import { historyQuery } from '@/lib/production-history'
import { saveShipment, shipmentDraft, shipmentInclude } from '@/lib/shipments'

export async function GET(request: Request) {
  try {
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
    const draft = shipmentDraft(await readBody(request), true)
    const actor = await currentActor()
    const result = await prisma.$transaction((tx) => saveShipment(tx, draft, actor), {
      isolationLevel: 'Serializable',
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return productionError(error, 'No se pudo registrar el envío.')
  }
}
