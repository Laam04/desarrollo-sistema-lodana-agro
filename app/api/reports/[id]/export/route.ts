import { prisma } from '@/lib/prisma'
import { ProductionError, productionError, requireProfile } from '@/lib/production-api'
import { type ReportPayload } from '@/lib/report-generator'
import { buildReportCsv, buildReportPdf, reportDownloadFilename } from '@/lib/report-export'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireProfile(['queries', 'admin'])
    const { id } = await context.params
    const format = new URL(request.url).searchParams.get('format')?.toLowerCase() ?? 'pdf'

    if (format !== 'pdf' && format !== 'csv') {
      throw new ProductionError('Formato de exportación no admitido. Usa pdf o csv.', 400)
    }

    const report = await prisma.generatedReport.findUnique({ where: { id } })
    if (!report) throw new ProductionError('El reporte solicitado no existe.', 404)
    if (report.status !== 'READY' || !report.payloadJson) {
      throw new ProductionError('El reporte no se encuentra listo para exportación.', 409)
    }

    const payload = report.payloadJson as unknown as ReportPayload
    const meta = { trigger: report.trigger, generatedAt: report.generatedAt.toISOString() }

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
    return productionError(error, 'No se pudo exportar el reporte.')
  }
}
