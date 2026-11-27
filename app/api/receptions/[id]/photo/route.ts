import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { productionError, requireProfile } from '@/lib/production-api'
import { parseReceiptImageDataUrl } from '@/lib/receipt-image'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireProfile(['reception', 'admin'])
    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Foto de envío no encontrada.' }, { status: 404 })
    }

    const shipment = await prisma.shipment.findFirst({
      where: { id, deletedAt: null },
      select: { noteImage: true },
    })
    if (!shipment?.noteImage) {
      return NextResponse.json({ error: 'Este envío no tiene foto adjunta.' }, { status: 404 })
    }

    const parsed = parseReceiptImageDataUrl(shipment.noteImage)
    if (!parsed) {
      return NextResponse.json({ error: 'La imagen adjunta no es válida.' }, { status: 404 })
    }

    return new NextResponse(new Uint8Array(parsed.bytes), {
      status: 200,
      headers: {
        'Content-Type': parsed.mime,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return productionError(error, 'No se pudo cargar la foto del envío.')
  }
}
