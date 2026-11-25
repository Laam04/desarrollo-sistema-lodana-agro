export const REPORT_TIMEZONE = 'America/Guayaquil'

const ecuadorDayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function shiftMonthLocal(month: string, offset: number): string {
  const [year, num] = month.split('-').map(Number)
  return new Date(Date.UTC(year, num - 1 + offset, 1)).toISOString().slice(0, 7)
}

function isValidIsoDayLocal(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const year = Number(day.slice(0, 4))
  if (year < 2000 || year > 2100) return false
  const parsed = new Date(`${day}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day
}

const monthFormatter = new Intl.DateTimeFormat('es-EC', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const shortDayFormatter = new Intl.DateTimeFormat('es-EC', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
})

export function ecuadorToday(now = new Date()): string {
  return ecuadorDayFmt.format(now)
}

export function addDays(isoDay: string, delta: number): string {
  const date = new Date(`${isoDay}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

export function daysBetweenInclusive(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00.000Z`).getTime()
  const end = new Date(`${to}T00:00:00.000Z`).getTime()
  return Math.floor((end - start) / 86_400_000) + 1
}

export function isValidMonthKey(month: string): boolean {
  return /^20\d{2}-(0[1-9]|1[0-2])$/.test(month)
}

export function monthBoundaries(month: string): { from: string; to: string; label: string } {
  const nextMonth = shiftMonthLocal(month, 1)
  const from = `${month}-01`
  const to = addDays(`${nextMonth}-01`, -1)
  const rawLabel = monthFormatter.format(new Date(`${from}T00:00:00.000Z`))
  const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1)
  return { from, to, label }
}

export function isFullCalendarMonthRange(from: string, to: string): boolean {
  if (!isValidIsoDayLocal(from) || !isValidIsoDayLocal(to) || from > to) return false
  if (!from.endsWith('-01')) return false
  const expectedTo = monthBoundaries(to.slice(0, 7)).to
  return to === expectedTo
}

export function formatIsoDayShort(isoDay: string): string {
  if (!isValidIsoDayLocal(isoDay)) return isoDay
  return shortDayFormatter.format(new Date(`${isoDay}T00:00:00.000Z`))
}

export function formatPeriodLabel(from: string, to: string, cadence: 'WEEKLY' | 'MONTHLY' | 'CUSTOM'): string {
  if (cadence === 'MONTHLY' && isFullCalendarMonthRange(from, to) && from.slice(0, 7) === to.slice(0, 7)) {
    return monthBoundaries(from.slice(0, 7)).label
  }
  if (cadence === 'WEEKLY') {
    return `Semana ${formatIsoDayShort(from)} – ${formatIsoDayShort(to)}`
  }
  if (isFullCalendarMonthRange(from, to)) {
    const startLabel = monthBoundaries(from.slice(0, 7)).label
    const endLabel = monthBoundaries(to.slice(0, 7)).label
    return from.slice(0, 7) === to.slice(0, 7) ? startLabel : `${startLabel} – ${endLabel}`
  }
  return `${formatIsoDayShort(from)} – ${formatIsoDayShort(to)}`
}

/**
 * Devuelve la semana calendario cerrada inmediatamente anterior (lunes a domingo)
 * respecto a la fecha actual en America/Guayaquil.
 */
export function lastClosedWeek(now = new Date()): { from: string; to: string; label: string; key: string } {
  const today = ecuadorToday(now)
  const date = new Date(`${today}T00:00:00.000Z`)
  const offsetFromMonday = (date.getUTCDay() + 6) % 7
  const currentMonday = addDays(today, -offsetFromMonday)
  const prevMonday = addDays(currentMonday, -7)
  const prevSunday = addDays(currentMonday, -1)
  return {
    from: prevMonday,
    to: prevSunday,
    label: formatPeriodLabel(prevMonday, prevSunday, 'WEEKLY'),
    key: `${prevMonday}..${prevSunday}`,
  }
}

/**
 * Devuelve hasta `count` semanas cerradas consecutivas (lunes a domingo) en orden cronológico.
 */
export function closedWeeksInLookback(
  now = new Date(),
  count = 4,
): { from: string; to: string; label: string; key: string }[] {
  const latest = lastClosedWeek(now)
  const weeks: { from: string; to: string; label: string; key: string }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const from = addDays(latest.from, -7 * i)
    const to = addDays(from, 6)
    weeks.push({
      from,
      to,
      label: formatPeriodLabel(from, to, 'WEEKLY'),
      key: `${from}..${to}`,
    })
  }
  return weeks
}

/**
 * Devuelve el mes calendario cerrado inmediatamente anterior en America/Guayaquil.
 */
export function lastClosedMonth(now = new Date()): { month: string; from: string; to: string; label: string; key: string } {
  const today = ecuadorToday(now)
  const currentMonth = today.slice(0, 7)
  const closed = shiftMonthLocal(currentMonth, -1)
  const bounds = monthBoundaries(closed)
  return { month: closed, ...bounds, key: closed }
}

/**
 * Devuelve hasta `count` meses calendario cerrados en orden cronológico.
 */
export function closedMonthsInLookback(
  now = new Date(),
  count = 6,
): { month: string; from: string; to: string; label: string; key: string }[] {
  const latest = lastClosedMonth(now)
  const months: { month: string; from: string; to: string; label: string; key: string }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const month = shiftMonthLocal(latest.month, -i)
    if (month < '2000-01') continue
    const bounds = monthBoundaries(month)
    months.push({ month, ...bounds, key: month })
  }
  return months
}

/**
 * Determina el rango anterior equivalente para comparaciones válidas.
 * Devuelve null si el periodo incluye la fecha actual (periodo abierto / cobertura incompleta).
 */
export function previousEquivalentPeriod(
  from: string,
  to: string,
  now = new Date(),
): { from: string; to: string; label: string; comparable: boolean; reason: string | null } {
  const today = ecuadorToday(now)
  if (to >= today) {
    return {
      from: '',
      to: '',
      label: '',
      comparable: false,
      reason: 'El período seleccionado aún está abierto; las variaciones comparativas se omiten para evitar comparaciones con cobertura incompleta.',
    }
  }

  if (isFullCalendarMonthRange(from, to)) {
    const fromMonth = from.slice(0, 7)
    const toMonth = to.slice(0, 7)
    const [fy, fm] = fromMonth.split('-').map(Number)
    const [ty, tm] = toMonth.split('-').map(Number)
    const span = (ty - fy) * 12 + (tm - fm) + 1
    const prevFromMonth = shiftMonthLocal(fromMonth, -span)
    const prevToMonth = shiftMonthLocal(fromMonth, -1)
    if (prevFromMonth < '2000-01') {
      return {
        from: '',
        to: '',
        label: '',
        comparable: false,
        reason: 'El período anterior queda fuera del rango histórico admitido.',
      }
    }
    const prevFrom = `${prevFromMonth}-01`
    const prevTo = monthBoundaries(prevToMonth).to
    return {
      from: prevFrom,
      to: prevTo,
      label: formatPeriodLabel(prevFrom, prevTo, span === 1 ? 'MONTHLY' : 'CUSTOM'),
      comparable: true,
      reason: null,
    }
  }

  const days = daysBetweenInclusive(from, to)
  const prevTo = addDays(from, -1)
  const prevFrom = addDays(from, -days)
  if (prevFrom < '2000-01-01') {
    return {
      from: '',
      to: '',
      label: '',
      comparable: false,
      reason: 'El período anterior queda fuera del rango histórico admitido.',
    }
  }
  return {
    from: prevFrom,
    to: prevTo,
    label: formatPeriodLabel(prevFrom, prevTo, days === 7 ? 'WEEKLY' : 'CUSTOM'),
    comparable: true,
    reason: null,
  }
}

export function ecuadorDateRangeToUtc(from: string, to: string) {
  // Fechas de negocio tipo @db.Date / UTC midnight (Harvest, Loss, Cost, Shipment, MarketSale)
  const dateStart = new Date(`${from}T00:00:00.000Z`)
  const dateEndExclusive = new Date(`${addDays(to, 1)}T00:00:00.000Z`)
  // Timestamps con hora real en America/Guayaquil (UTC-5 sin horario de verano): Reception.receivedAt
  const ecStart = new Date(`${from}T05:00:00.000Z`)
  const ecEndExclusive = new Date(`${addDays(to, 1)}T05:00:00.000Z`)
  return { dateStart, dateEndExclusive, ecStart, ecEndExclusive }
}

export function buildAutomaticDedupeKey(type: 'WEEKLY_OPERATIONAL' | 'CONSOLIDATED_IMPACT', periodKey: string): string {
  return `AUTO:${type}:${periodKey}`
}

export function validateReportDateRange(from: string, to: string): { ok: true } | { ok: false; error: string } {
  if (!isValidIsoDayLocal(from) || !isValidIsoDayLocal(to)) {
    return { ok: false, error: 'Indica fechas válidas en formato AAAA-MM-DD entre 2000 y 2100.' }
  }
  if (from > to) {
    return { ok: false, error: 'La fecha inicial no puede ser posterior a la fecha final.' }
  }
  if (daysBetweenInclusive(from, to) > 366 * 5) {
    return { ok: false, error: 'El rango máximo permitido por reporte es de 5 años.' }
  }
  return { ok: true }
}
