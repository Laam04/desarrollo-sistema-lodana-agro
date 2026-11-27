import { ProductionError, productionError, readBody, requireProfile } from '@/lib/production-api'
import { buildReportPayload, isReportType } from '@/lib/report-generator'
import { buildReportCsv, buildReportPdf, reportDownloadFilename } from '@/lib/report-export'
import { isFullCalendarMonthRange } from '@/lib/report-periods'

export async function POST(request: Request) {
  try {
    await requireProfile(['queries', 'admin'])
    const body = await readBody(request, 32 * 1024)
    const format = typeof body.format === 'string' ? body.format.toLowerCase() : 'pdf'
    if (format !== 'pdf' && format !== 'csv') {
      throw new ProductionError('Formato de exportación no admitido. Usa pdf o csv.', 400)
    }

    const type = body.type
    const from = typeof body.from === 'string' ? body.from.trim() : ''
    const to = typeof body.to === 'string' ? body.to.trim() : ''
    const cropId = typeof body.cropId === 'string' && body.cropId.trim() ? body.cropId.trim() : null
    const unitId = typeof body.unitId === 'string' && body.unitId.trim() ? body.unitId.trim() : null
    const cadence = body.cadence === 'WEEKLY' || body.cadence === 'MONTHLY' || body.cadence === 'CUSTOM'
      ? body.cadence
      : isFullCalendarMonthRange(from, to)
        ? 'MONTHLY'
        : 'CUSTOM'

    if (!isReportType(type)) {
      throw new ProductionError('Selecciona un tipo de reporte válido.', 400)
    }

    const payload = await buildReportPayload({ type, from, to, cadence, cropId, unitId })
    const meta = { trigger: 'MANUAL', generatedAt: payload.generatedAt }

    if (format === 'csv') {
      const csv = buildReportCsv(payload, meta)
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${reportDownloadFilename(payload, 'csv')}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    const pdfBuffer = buildReportPdf(payload, meta)
    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${reportDownloadFilename(payload, 'pdf')}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return productionError(error, 'No se pudo exportar la vista previa del reporte.')
  }
}
