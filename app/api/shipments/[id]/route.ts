import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { currentActor, productionError, readBody } from '@/lib/production-api'
import { assertShipmentEditable, findShipment, saveShipment, shipmentDraft } from '@/lib/shipments'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const draft = shipmentDraft(await readBody(request), false)
    const actor = await currentActor()
    const result = await prisma.$transaction((tx) => saveShipment(tx, draft, actor, id), {
      isolationLevel: 'Serializable',
    })
    return NextResponse.json(result)
  } catch (error) {
    return productionError(error, 'No se pudo editar el envío.')
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const actor = await currentActor()
    const result = await prisma.$transaction(async (tx) => {
      const shipment = await findShipment(tx, id)
      if (shipment.status === 'CANCELLED') return { id, status: shipment.status }
      assertShipmentEditable(shipment)

      const updated = await tx.shipment.update({
        where: { id }, data: { status: 'CANCELLED' }, select: { id: true, status: true },
      })
      await tx.auditLog.create({
        data: {
          entity: 'Shipment', entityId: id, action: 'CANCEL', actor,
          beforeJson: { status: shipment.status }, afterJson: { status: updated.status },
        },
      })
      return updated
    }, { isolationLevel: 'Serializable' })
    return NextResponse.json(result)
  } catch (error) {
    return productionError(error, 'No se pudo cancelar el envío.')
  }
}
