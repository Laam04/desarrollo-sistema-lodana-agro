import { prisma } from '@/lib/prisma'
import { isRecord, ProductionError } from '@/lib/production-api'
import { type Profile } from '@/lib/profile-session'

export type InstitutionConfig = {
  organizationName: string
  universityName: string
  farmName: string
  marketName: string
  location: string
}

export type ReportingConfig = {
  autoWeeklyEnabled: boolean
  autoMonthlyEnabled: boolean
  maxBackfillWeeks: number
  maxBackfillMonths: number
  includeEmptyAutoPeriods: boolean
  timezone: 'America/Guayaquil'
}

export type SystemConfigBundle = {
  institution: InstitutionConfig
  reporting: ReportingConfig
}

export const defaultInstitutionConfig: InstitutionConfig = {
  organizationName: 'Lodana Agro',
  universityName: 'Universidad Laica Eloy Alfaro de Manabí (ULEAM)',
  farmName: 'Finca Experimental Lodana',
  marketName: 'Agro Market',
  location: 'Manabí, Ecuador',
}

export const defaultReportingConfig: ReportingConfig = {
  autoWeeklyEnabled: true,
  autoMonthlyEnabled: true,
  maxBackfillWeeks: 4,
  maxBackfillMonths: 6,
  includeEmptyAutoPeriods: false,
  timezone: 'America/Guayaquil',
}

function cleanText(value: unknown, fallback: string, maxLen = 140): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed) return fallback
  return trimmed.slice(0, maxLen)
}

function parseInstitution(raw: unknown): InstitutionConfig {
  if (!isRecord(raw)) return { ...defaultInstitutionConfig }
  return {
    organizationName: cleanText(raw.organizationName, defaultInstitutionConfig.organizationName, 80),
    universityName: cleanText(raw.universityName, defaultInstitutionConfig.universityName, 140),
    farmName: cleanText(raw.farmName, defaultInstitutionConfig.farmName, 100),
    marketName: cleanText(raw.marketName, defaultInstitutionConfig.marketName, 100),
    location: cleanText(raw.location, defaultInstitutionConfig.location, 100),
  }
}

function parseReporting(raw: unknown): ReportingConfig {
  if (!isRecord(raw)) return { ...defaultReportingConfig }
  const weeks = typeof raw.maxBackfillWeeks === 'number' && Number.isInteger(raw.maxBackfillWeeks)
    ? Math.min(26, Math.max(1, raw.maxBackfillWeeks))
    : defaultReportingConfig.maxBackfillWeeks
  const months = typeof raw.maxBackfillMonths === 'number' && Number.isInteger(raw.maxBackfillMonths)
    ? Math.min(24, Math.max(1, raw.maxBackfillMonths))
    : defaultReportingConfig.maxBackfillMonths

  return {
    autoWeeklyEnabled: typeof raw.autoWeeklyEnabled === 'boolean'
      ? raw.autoWeeklyEnabled
      : defaultReportingConfig.autoWeeklyEnabled,
    autoMonthlyEnabled: typeof raw.autoMonthlyEnabled === 'boolean'
      ? raw.autoMonthlyEnabled
      : defaultReportingConfig.autoMonthlyEnabled,
    maxBackfillWeeks: weeks,
    maxBackfillMonths: months,
    includeEmptyAutoPeriods: typeof raw.includeEmptyAutoPeriods === 'boolean'
      ? raw.includeEmptyAutoPeriods
      : defaultReportingConfig.includeEmptyAutoPeriods,
    timezone: 'America/Guayaquil',
  }
}

export async function getSystemConfig(): Promise<SystemConfigBundle> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: ['institution', 'reporting'] } },
  })
  const byKey = new Map(rows.map((row) => [row.key, row.value]))
  return {
    institution: parseInstitution(byKey.get('institution')),
    reporting: parseReporting(byKey.get('reporting')),
  }
}

export async function getInstitutionConfig(): Promise<InstitutionConfig> {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'institution' } })
  return parseInstitution(row?.value)
}

export async function getReportingConfig(): Promise<ReportingConfig> {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'reporting' } })
  return parseReporting(row?.value)
}

export async function saveSystemConfig(
  patch: { institution?: unknown; reporting?: unknown },
  actor: Profile,
): Promise<SystemConfigBundle> {
  const current = await getSystemConfig()
  const nextInstitution = patch.institution !== undefined
    ? validateInstitutionInput(patch.institution, current.institution)
    : current.institution
  const nextReporting = patch.reporting !== undefined
    ? validateReportingInput(patch.reporting, current.reporting)
    : current.reporting

  await prisma.$transaction(async (tx) => {
    if (patch.institution !== undefined) {
      await tx.systemSetting.upsert({
        where: { key: 'institution' },
        create: { key: 'institution', value: nextInstitution, updatedBy: actor },
        update: { value: nextInstitution, updatedBy: actor },
      })
      await tx.auditLog.create({
        data: {
          entity: 'SystemSetting',
          entityId: 'institution',
          action: 'UPDATE',
          actor,
          beforeJson: current.institution,
          afterJson: nextInstitution,
        },
      })
    }

    if (patch.reporting !== undefined) {
      await tx.systemSetting.upsert({
        where: { key: 'reporting' },
        create: { key: 'reporting', value: nextReporting, updatedBy: actor },
        update: { value: nextReporting, updatedBy: actor },
      })
      await tx.auditLog.create({
        data: {
          entity: 'SystemSetting',
          entityId: 'reporting',
          action: 'UPDATE',
          actor,
          beforeJson: current.reporting,
          afterJson: nextReporting,
        },
      })
    }
  })

  return { institution: nextInstitution, reporting: nextReporting }
}

function validateInstitutionInput(raw: unknown, current: InstitutionConfig): InstitutionConfig {
  if (!isRecord(raw)) throw new ProductionError('La configuración institucional no es válida.')
  const organizationName = cleanText(raw.organizationName, '', 80)
  const universityName = cleanText(raw.universityName, '', 140)
  const farmName = cleanText(raw.farmName, '', 100)
  const marketName = cleanText(raw.marketName, '', 100)
  const location = cleanText(raw.location, '', 100)

  if (!organizationName || !universityName || !farmName || !marketName) {
    throw new ProductionError('Completa el nombre del sistema, institución, finca y mercado.')
  }

  return {
    organizationName,
    universityName,
    farmName,
    marketName,
    location: location || current.location,
  }
}

function validateReportingInput(raw: unknown, current: ReportingConfig): ReportingConfig {
  if (!isRecord(raw)) throw new ProductionError('La configuración de reportes no es válida.')
  const maxBackfillWeeks = raw.maxBackfillWeeks === undefined
    ? current.maxBackfillWeeks
    : Number(raw.maxBackfillWeeks)
  const maxBackfillMonths = raw.maxBackfillMonths === undefined
    ? current.maxBackfillMonths
    : Number(raw.maxBackfillMonths)

  if (!Number.isInteger(maxBackfillWeeks) || maxBackfillWeeks < 1 || maxBackfillWeeks > 26) {
    throw new ProductionError('La ventana de recuperación semanal debe estar entre 1 y 26 semanas.')
  }
  if (!Number.isInteger(maxBackfillMonths) || maxBackfillMonths < 1 || maxBackfillMonths > 24) {
    throw new ProductionError('La ventana de recuperación mensual debe estar entre 1 y 24 meses.')
  }

  return {
    autoWeeklyEnabled: typeof raw.autoWeeklyEnabled === 'boolean'
      ? raw.autoWeeklyEnabled
      : current.autoWeeklyEnabled,
    autoMonthlyEnabled: typeof raw.autoMonthlyEnabled === 'boolean'
      ? raw.autoMonthlyEnabled
      : current.autoMonthlyEnabled,
    maxBackfillWeeks,
    maxBackfillMonths,
    includeEmptyAutoPeriods: typeof raw.includeEmptyAutoPeriods === 'boolean'
      ? raw.includeEmptyAutoPeriods
      : current.includeEmptyAutoPeriods,
    timezone: 'America/Guayaquil',
  }
}
