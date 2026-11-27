import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getReportingConfig } from '@/lib/system-config'
import { buildReportPayload, extractReportSummary, REPORT_TYPE_META, type ReportType } from '@/lib/report-generator'
import {
  buildAutomaticDedupeKey,
  closedMonthsInLookback,
  closedWeeksInLookback,
  ecuadorToday,
  isValidMonthKey,
  monthBoundaries,
  formatPeriodLabel,
} from '@/lib/report-periods'
import { isValidIsoDay, marketWeek } from '@/lib/market-data'
import { ProductionError } from '@/lib/production-api'

export type ScheduledPeriodCandidate = {
  dedupeKey: string
  type: 'WEEKLY_OPERATIONAL' | 'CONSOLIDATED_IMPACT'
  cadence: 'WEEKLY' | 'MONTHLY'
  from: string
  to: string
  label: string
  periodKey: string
}

export async function getPendingScheduledPeriods(now = new Date()): Promise<{
  candidates: ScheduledPeriodCandidate[]
  pending: (ScheduledPeriodCandidate & { existingStatus: 'MISSING' | 'FAILED'; existingId: string | null })[]
  existingReady: number
}> {
  const cfg = await getReportingConfig()
  const candidates: ScheduledPeriodCandidate[] = []

  if (cfg.autoWeeklyEnabled) {
    for (const w of closedWeeksInLookback(now, cfg.maxBackfillWeeks)) {
      candidates.push({
        dedupeKey: buildAutomaticDedupeKey('WEEKLY_OPERATIONAL', w.key),
        type: 'WEEKLY_OPERATIONAL',
        cadence: 'WEEKLY',
        from: w.from,
        to: w.to,
        label: w.label,
        periodKey: w.key,
      })
    }
  }

  if (cfg.autoMonthlyEnabled) {
    for (const m of closedMonthsInLookback(now, cfg.maxBackfillMonths)) {
      candidates.push({
        dedupeKey: buildAutomaticDedupeKey('CONSOLIDATED_IMPACT', m.key),
        type: 'CONSOLIDATED_IMPACT',
        cadence: 'MONTHLY',
        from: m.from,
        to: m.to,
        label: m.label,
        periodKey: m.key,
      })
    }
  }

  if (candidates.length === 0) {
    return { candidates: [], pending: [], existingReady: 0 }
  }

  const existing = await prisma.generatedReport.findMany({
    where: { dedupeKey: { in: candidates.map((c) => c.dedupeKey) } },
    select: { id: true, dedupeKey: true, status: true },
  })
  const byKey = new Map(existing.map((e) => [e.dedupeKey!, e]))

  const pending: (ScheduledPeriodCandidate & { existingStatus: 'MISSING' | 'FAILED'; existingId: string | null })[] = []
  let existingReady = 0

  for (const c of candidates) {
    const found = byKey.get(c.dedupeKey)
    if (!found) {
      pending.push({ ...c, existingStatus: 'MISSING', existingId: null })
    } else if (found.status === 'FAILED') {
      pending.push({ ...c, existingStatus: 'FAILED', existingId: found.id })
    } else {
      existingReady += 1
    }
  }

  return { candidates, pending, existingReady }
}

export type AutomationRunResult = {
  runId: string
  source: string
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED'
  checkedPeriods: number
  createdCount: number
  skippedCount: number
  failedCount: number
  items: {
    dedupeKey: string
    type: ReportType
    periodLabel: string
    outcome: 'CREATED' | 'RETRIED' | 'SKIPPED_DUPLICATE' | 'SKIPPED_EMPTY' | 'FAILED'
    reportId?: string
    error?: string
  }[]
}

export async function runScheduledReports(options: {
  source: 'CRON_ENDPOINT' | 'CLI_SCRIPT' | 'ADMIN_MANUAL' | 'AUTO_CATCHUP'
  actor: string
  now?: Date
  targetMonth?: string
  targetWeekDay?: string
}): Promise<AutomationRunResult> {
  const now = options.now ?? new Date()
  const cfg = await getReportingConfig()
  if (options.targetMonth && options.targetWeekDay) throw new ProductionError('Selecciona un cierre semanal o mensual por ejecución.')

  let candidates: ScheduledPeriodCandidate[] = []

  if (options.targetMonth && isValidMonthKey(options.targetMonth)) {
    const b = monthBoundaries(options.targetMonth)
    candidates.push({
      dedupeKey: buildAutomaticDedupeKey('CONSOLIDATED_IMPACT', options.targetMonth),
      type: 'CONSOLIDATED_IMPACT',
      cadence: 'MONTHLY',
      from: b.from,
      to: b.to,
      label: b.label,
      periodKey: options.targetMonth,
    })
  } else if (options.targetWeekDay && isValidIsoDay(options.targetWeekDay)) {
    const w = marketWeek(options.targetWeekDay)
    const key = `${w.from}..${w.to}`
    candidates.push({
      dedupeKey: buildAutomaticDedupeKey('WEEKLY_OPERATIONAL', key),
      type: 'WEEKLY_OPERATIONAL',
      cadence: 'WEEKLY',
      from: w.from,
      to: w.to,
      label: formatPeriodLabel(w.from, w.to, 'WEEKLY'),
      periodKey: key,
    })
  } else {
    const discovery = await getPendingScheduledPeriods(now)
    candidates = discovery.candidates
  }
  if (candidates.some((candidate) => candidate.to >= ecuadorToday(now) || candidate.to >= ecuadorToday())) {
    throw new ProductionError('Selecciona un período que ya haya cerrado en Ecuador.')
  }

  const run = await prisma.reportAutomationRun.create({
    data: {
      source: options.source,
      status: 'RUNNING',
      checkedPeriods: candidates.length,
    },
  })

  const items: AutomationRunResult['items'] = []
  let createdCount = 0
  let skippedCount = 0
  let failedCount = 0

  for (const candidate of candidates) {
    const existing = await prisma.generatedReport.findUnique({
      where: { dedupeKey: candidate.dedupeKey },
      select: { id: true, status: true },
    })

    if (existing && existing.status === 'READY') {
      skippedCount += 1
      items.push({
        dedupeKey: candidate.dedupeKey,
        type: candidate.type,
        periodLabel: candidate.label,
        outcome: 'SKIPPED_DUPLICATE',
        reportId: existing.id,
      })
      continue
    }

    try {
      const payload = await buildReportPayload({
        type: candidate.type,
        from: candidate.from,
        to: candidate.to,
        cadence: candidate.cadence,
        now,
      })

      if (!payload.hasData && !cfg.includeEmptyAutoPeriods && !options.targetMonth && !options.targetWeekDay) {
        skippedCount += 1
        items.push({
          dedupeKey: candidate.dedupeKey,
          type: candidate.type,
          periodLabel: candidate.label,
          outcome: 'SKIPPED_EMPTY',
        })
        continue
      }

      const summary = extractReportSummary(payload)

      let savedId: string
      if (existing) {
        const updated = await prisma.generatedReport.updateMany({
          where: { id: existing.id, status: 'FAILED' },
          data: {
            status: 'READY',
            title: REPORT_TYPE_META[candidate.type].label,
            periodLabel: payload.period.label,
            summaryJson: summary as unknown as Prisma.InputJsonValue,
            payloadJson: payload as unknown as Prisma.InputJsonValue,
            errorMessage: null,
            attempts: { increment: 1 },
            generatedBy: options.actor,
            generatedAt: now,
          },
        })
        if (updated.count === 0) {
          skippedCount += 1
          items.push({ dedupeKey: candidate.dedupeKey, type: candidate.type, periodLabel: candidate.label, outcome: 'SKIPPED_DUPLICATE', reportId: existing.id })
          continue
        }
        savedId = existing.id
      } else {
        try {
          const created = await prisma.generatedReport.create({
            data: {
              dedupeKey: candidate.dedupeKey,
              type: candidate.type,
              title: REPORT_TYPE_META[candidate.type].label,
              trigger: 'AUTOMATIC',
              cadence: candidate.cadence,
              status: 'READY',
              periodFrom: candidate.from,
              periodTo: candidate.to,
              periodLabel: payload.period.label,
              filtersJson: payload.filters as unknown as Prisma.InputJsonValue,
              summaryJson: summary as unknown as Prisma.InputJsonValue,
              payloadJson: payload as unknown as Prisma.InputJsonValue,
              attempts: 1,
              generatedBy: options.actor,
              generatedAt: now,
            },
            select: { id: true },
          })
          savedId = created.id
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            skippedCount += 1
            items.push({
              dedupeKey: candidate.dedupeKey,
              type: candidate.type,
              periodLabel: candidate.label,
              outcome: 'SKIPPED_DUPLICATE',
            })
            continue
          }
          throw err
        }
      }

      createdCount += 1
      items.push({
        dedupeKey: candidate.dedupeKey,
        type: candidate.type,
        periodLabel: candidate.label,
        outcome: existing ? 'RETRIED' : 'CREATED',
        reportId: savedId,
      })
    } catch (error) {
      failedCount += 1
      const message = error instanceof Error ? error.message : 'Error desconocido al generar el reporte.'
      if (existing) {
        await prisma.generatedReport.updateMany({
          where: { id: existing.id, status: 'FAILED' },
          data: {
            status: 'FAILED',
            errorMessage: message.slice(0, 500),
            attempts: { increment: 1 },
            generatedBy: options.actor,
          },
        }).catch(() => {})
      } else {
        await prisma.generatedReport.create({
          data: {
            dedupeKey: candidate.dedupeKey,
            type: candidate.type,
            title: REPORT_TYPE_META[candidate.type].label,
            trigger: 'AUTOMATIC',
            cadence: candidate.cadence,
            status: 'FAILED',
            periodFrom: candidate.from,
            periodTo: candidate.to,
            periodLabel: candidate.label,
            errorMessage: message.slice(0, 500),
            attempts: 1,
            generatedBy: options.actor,
            generatedAt: now,
          },
        }).catch(() => {})
      }

      items.push({
        dedupeKey: candidate.dedupeKey,
        type: candidate.type,
        periodLabel: candidate.label,
        outcome: 'FAILED',
        error: message,
      })
    }
  }

  const status: 'SUCCESS' | 'PARTIAL' | 'FAILED' =
    failedCount === 0 ? 'SUCCESS' : createdCount > 0 ? 'PARTIAL' : 'FAILED'

  await prisma.$transaction([
    prisma.reportAutomationRun.update({
      where: { id: run.id },
      data: {
        status,
        checkedPeriods: candidates.length,
        createdCount,
        skippedCount,
        failedCount,
        detailsJson: items as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    }),
    prisma.auditLog.create({
      data: {
        entity: 'ReportAutomationRun',
        entityId: run.id,
        action: 'RUN_SCHEDULED_REPORTS',
        actor: options.actor,
        afterJson: {
          source: options.source,
          status,
          checkedPeriods: candidates.length,
          createdCount,
          skippedCount,
          failedCount,
        },
      },
    }),
  ])

  return {
    runId: run.id,
    source: options.source,
    status,
    checkedPeriods: candidates.length,
    createdCount,
    skippedCount,
    failedCount,
    items,
  }
}

export async function retryFailedReport(reportId: string, actor: string) {
  const existing = await prisma.generatedReport.findUnique({ where: { id: reportId } })
  if (!existing || existing.status !== 'FAILED') return existing

  const filters = (existing.filtersJson as { cropId?: string | null; unitId?: string | null } | null) ?? {}
  const now = new Date()

  try {
    const payload = await buildReportPayload({
      type: existing.type as ReportType,
      from: existing.periodFrom,
      to: existing.periodTo,
      cadence: existing.cadence as 'WEEKLY' | 'MONTHLY' | 'CUSTOM',
      cropId: filters.cropId ?? null,
      unitId: filters.unitId ?? null,
      now,
    })

    await prisma.generatedReport.updateMany({
      where: { id: existing.id, status: 'FAILED' },
      data: {
        status: 'READY',
        periodLabel: payload.period.label,
        summaryJson: extractReportSummary(payload) as unknown as Prisma.InputJsonValue,
        payloadJson: payload as unknown as Prisma.InputJsonValue,
        errorMessage: null,
        attempts: { increment: 1 },
        generatedBy: actor,
        generatedAt: now,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al reintentar el reporte.'
    await prisma.generatedReport.updateMany({
      where: { id: existing.id, status: 'FAILED' },
      data: {
        status: 'FAILED',
        errorMessage: message.slice(0, 500),
        attempts: { increment: 1 },
      },
    })
  }
  return prisma.generatedReport.findUnique({ where: { id: existing.id } })
}
