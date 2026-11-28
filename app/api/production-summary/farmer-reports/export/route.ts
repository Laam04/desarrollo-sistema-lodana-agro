import { ProductionError, productionError, requireProfile } from '@/lib/production-api'
import {
  buildFarmerImpactReport,
  buildFarmerReportCsv,
  buildFarmerReportPdf,
} from '@/lib/farmer-impact-report'

export async function GET(request: Request) {
  try {
    await requireProfile(['production', 'admin'])
    const params = new URL(request.url).searchParams
    const from = params.get('from')?.trim() ?? ''
    const to = params.get('to')?.trim() ?? ''
    const format = (params.get('format') ?? 'pdf').toLowerCase()
    const cadenceParam = params.get('cadence')
    const cadence =
      cadenceParam === 'WEEKLY' || cadenceParam === 'MONTHLY' || cadenceParam === 'CUSTOM'
        ? cadenceParam
        : undefined

    if (format !== 'pdf' && format !== 'csv') {
      throw new ProductionError('Formato no admitido. Usa pdf o csv.', 400)
    }

    const report = await buildFarmerImpactReport({
      from,
      to,
      cadence,
      automatic: cadence !== 'CUSTOM',
    })

    const fileBase = `lodana-agricultor-${report.cadence.toLowerCase()}-${report.period.from}_${report.period.to}`

    if (format === 'csv') {
      const csv = buildFarmerReportCsv(report)
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileBase}.csv"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    const pdf = buildFarmerReportPdf(report)
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileBase}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return productionError(error, 'No se pudo exportar el reporte del agricultor.')
  }
}
