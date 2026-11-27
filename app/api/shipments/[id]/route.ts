import { NextResponse } from 'next/server'
import { runSerializable } from '@/lib/prisma'
import { productionError, readBody, requireProfile } from '@/lib/production-api'
import { assertShipmentEditable, findShipment, saveShipment, shipmentDraft } from '@/lib/shipments'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const actor = await requireProfile(['production', 'admin'])
    const { id } = await params
    const draft = shipmentDraft(await readBody(request, 2 * 1024 * 1024), false)
    const { shipment } = await runSerializable((tx) => saveShipment(tx, draft, actor, id))
    return NextResponse.json(shipment)
  } catch (error) {
    return productionError(error, 'No se pudo editar el envío.')
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const actor = await requireProfile(['production', 'admin'])
    const { id } = await params
    const result = await runSerializable(async (tx) => {
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
    })
    return NextResponse.json(result)
  } catch (error) {
    return productionError(error, 'No se pudo cancelar el envío.')
  }
}
