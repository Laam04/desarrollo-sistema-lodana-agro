import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ProductionError, productionError, readBody, requireProfile } from '@/lib/production-api'
import {
  buildReportPayload,
  extractReportSummary,
  isReportType,
  REPORT_TYPE_META,
} from '@/lib/report-generator'
import { getPendingScheduledPeriods } from '@/lib/report-automation'
import { getReportingConfig } from '@/lib/system-config'
import { isFullCalendarMonthRange } from '@/lib/report-periods'

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } as const

export async function GET(request: Request) {
  try {
    const actor = await requireProfile(['queries', 'admin'])
    const params = new URL(request.url).searchParams
    const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
    const pageSize = Math.min(50, Math.max(5, Number.parseInt(params.get('pageSize') ?? '20', 10) || 20))
    const type = params.get('type')?.trim() || undefined
    const trigger = params.get('trigger')?.trim() || undefined
    const status = params.get('status')?.trim() || undefined
    const q = params.get('q')?.trim() || undefined

    const where: Prisma.GeneratedReportWhereInput = {}
    if (type && isReportType(type)) where.type = type
    if (trigger === 'AUTOMATIC' || trigger === 'MANUAL') where.trigger = trigger
    if (status === 'READY' || status === 'FAILED' || status === 'GENERATING') where.status = status
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { periodLabel: { contains: q, mode: 'insensitive' } },
        { generatedBy: { contains: q, mode: 'insensitive' } },
      ]
    }

    const [rows, total, crops, units, pendingInfo, recentRuns, reportingConfig] = await Promise.all([
      prisma.generatedReport.findMany({
        where,
        orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }],
        take: pageSize + 1,
        skip: (page - 1) * pageSize,
        select: {
          id: true,
          type: true,
          title: true,
          trigger: true,
          cadence: true,
          status: true,
          periodFrom: true,
          periodTo: true,
          periodLabel: true,
          filtersJson: true,
          summaryJson: true,
          errorMessage: true,
          attempts: true,
          generatedBy: true,
          generatedAt: true,
        },
      }),
      prisma.generatedReport.count({ where }),
      prisma.crop.findMany({
        where: { deletedAt: null },
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        select: { id: true, name: true, active: true },
      }),
      prisma.unit.findMany({
        where: { deletedAt: null },
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        select: { id: true, name: true, active: true },
      }),
      getPendingScheduledPeriods(),
      prisma.reportAutomationRun.findMany({
        orderBy: { startedAt: 'desc' },
        take: 10,
      }),
      getReportingConfig(),
    ])

    const hasNext = rows.length > pageSize
    const pageRows = hasNext ? rows.slice(0, pageSize) : rows

    return NextResponse.json(
      {
        actor,
        page,
        pageSize,
        total,
        hasNext,
        rows: pageRows.map((row) => ({
          ...row,
          generatedAt: row.generatedAt.toISOString(),
        })),
        catalogs: { crops, units },
        automation: {
          config: reportingConfig,
          pendingCount: pendingInfo.pending.length,
          pendingPeriods: pendingInfo.pending,
          existingReady: pendingInfo.existingReady,
          recentRuns: recentRuns.map((r) => ({
            ...r,
            startedAt: r.startedAt.toISOString(),
            finishedAt: r.finishedAt?.toISOString() ?? null,
          })),
        },
      },
      { headers },
    )
  } catch (error) {
    return productionError(error, 'No se pudo consultar el centro de reportes.')
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireProfile(['queries', 'admin'])
    const body = await readBody(request, 32 * 1024)

    const type = body.type
    const from = typeof body.from === 'string' ? body.from.trim() : ''
    const to = typeof body.to === 'string' ? body.to.trim() : ''
    const cropId = typeof body.cropId === 'string' && body.cropId.trim() ? body.cropId.trim() : null
    const unitId = typeof body.unitId === 'string' && body.unitId.trim() ? body.unitId.trim() : null
    const save = body.save !== false
    const cadenceInput = body.cadence === 'WEEKLY' || body.cadence === 'MONTHLY' || body.cadence === 'CUSTOM'
      ? body.cadence
      : isFullCalendarMonthRange(from, to)
        ? 'MONTHLY'
        : 'CUSTOM'

    if (!isReportType(type)) {
      throw new ProductionError('Selecciona un tipo de reporte válido.', 400)
    }

    const payload = await buildReportPayload({
      type,
      from,
      to,
      cadence: cadenceInput,
      cropId,
      unitId,
    })

    if (!save) {
      return NextResponse.json({ saved: false, payload }, { headers })
    }

    const summary = extractReportSummary(payload)
    const created = await prisma.$transaction(async (tx) => {
      const report = await tx.generatedReport.create({
        data: {
          type,
          title: REPORT_TYPE_META[type].label,
          trigger: 'MANUAL',
          cadence: cadenceInput,
          status: 'READY',
          periodFrom: from,
          periodTo: to,
          periodLabel: payload.period.label,
          filtersJson: payload.filters as unknown as Prisma.InputJsonValue,
          summaryJson: summary as unknown as Prisma.InputJsonValue,
          payloadJson: payload as unknown as Prisma.InputJsonValue,
          attempts: 1,
          generatedBy: actor,
        },
      })

      await tx.auditLog.create({
        data: {
          entity: 'GeneratedReport',
          entityId: report.id,
          action: 'GENERATE_MANUAL',
          actor,
          afterJson: {
            type,
            periodFrom: from,
            periodTo: to,
            filters: payload.filters,
          },
        },
      })

      return report
    })

    return NextResponse.json(
      {
        saved: true,
        report: {
          id: created.id,
          type: created.type,
          title: created.title,
          trigger: created.trigger,
          cadence: created.cadence,
          status: created.status,
          periodFrom: created.periodFrom,
          periodTo: created.periodTo,
          periodLabel: created.periodLabel,
          filtersJson: created.filtersJson,
          summaryJson: created.summaryJson,
          generatedBy: created.generatedBy,
          generatedAt: created.generatedAt.toISOString(),
        },
        payload,
      },
      { status: 201, headers },
    )
  } catch (error) {
    return productionError(error, 'No se pudo generar el reporte.')
  }
}
