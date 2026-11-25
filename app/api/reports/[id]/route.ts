import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ProductionError, productionError, requireProfile } from '@/lib/production-api'
import { retryFailedReport } from '@/lib/report-automation'

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } as const

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireProfile(['queries', 'admin'])
    const { id } = await context.params
    const report = await prisma.generatedReport.findUnique({ where: { id } })
    if (!report) throw new ProductionError('El reporte solicitado no existe.', 404)

    return NextResponse.json(
      {
        ...report,
        generatedAt: report.generatedAt.toISOString(),
        updatedAt: report.updatedAt.toISOString(),
      },
      { headers },
    )
  } catch (error) {
    return productionError(error, 'No se pudo consultar el detalle del reporte.')
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireProfile(['admin'])
    const { id } = await context.params
    const updated = await retryFailedReport(id, actor)
    if (!updated) throw new ProductionError('El reporte solicitado no existe.', 404)

    return NextResponse.json(
      {
        ...updated,
        generatedAt: updated.generatedAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
      { headers },
    )
  } catch (error) {
    return productionError(error, 'No se pudo reintentar la generación del reporte.')
  }
}
