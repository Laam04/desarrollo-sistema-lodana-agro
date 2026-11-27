import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { productionError, requireProfile } from '@/lib/production-api'
import { parseReceiptImageDataUrl } from '@/lib/receipt-image'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireProfile(['production', 'admin'])
    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Factura no encontrada.' }, { status: 404 })
    }

    const cost = await prisma.cost.findFirst({
      where: { id, deletedAt: null },
      select: { receiptImage: true, receiptImageName: true },
    })

    if (!cost?.receiptImage) {
      return NextResponse.json({ error: 'Este gasto no tiene foto de factura.' }, { status: 404 })
    }

    const parsed = parseReceiptImageDataUrl(cost.receiptImage)
    if (!parsed) {
      return NextResponse.json({ error: 'La imagen de la factura no es válida.' }, { status: 404 })
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
    return productionError(error, 'No se pudo cargar la foto de la factura.')
  }
}
