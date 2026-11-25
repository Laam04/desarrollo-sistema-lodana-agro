import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAutomaticDedupeKey,
  closedMonthsInLookback,
  closedWeeksInLookback,
  ecuadorToday,
  lastClosedMonth,
  lastClosedWeek,
  previousEquivalentPeriod,
  validateReportDateRange,
} from '../lib/report-periods.ts'
import { buildDeterministicInsights, safePercentChange } from '../lib/report-insights.ts'
import { buildReportCsv, buildReportPdf } from '../lib/pdf-builder.ts'
import { hashPin, isValidPin, verifyPinHash } from '../lib/pin-crypto.ts'

test('hashPin y verifyPinHash protegen credenciales con scrypt y salt único', () => {
  assert.equal(isValidPin('123'), false)
  assert.equal(isValidPin('1234\n'), false)
  assert.equal(isValidPin('482910'), true)

  const h1 = hashPin('482910')
  const h2 = hashPin('482910')
  assert.notEqual(h1, h2)
  assert.match(h1, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/)
  assert.equal(verifyPinHash('482910', h1), true)
  assert.equal(verifyPinHash('999999', h1), false)
  assert.equal(verifyPinHash('482910', 'invalid-hash'), false)
})

test('periodos cerrados en America/Guayaquil respetan lunes-domingo y meses calendario', () => {
  // 2026-11-23T03:00:00Z corresponde a 2026-11-22 22:00 en Ecuador (domingo)
  const sundayNightEc = new Date('2026-11-23T03:00:00.000Z')
  assert.equal(ecuadorToday(sundayNightEc), '2026-11-22')
  // La semana cerrada anterior a domingo 22/11/2026 es lunes 09/11 al domingo 15/11
  const weekOnSunday = lastClosedWeek(sundayNightEc)
  assert.equal(weekOnSunday.from, '2026-11-09')
  assert.equal(weekOnSunday.to, '2026-11-15')

  // 2026-11-23T06:00:00Z corresponde a 2026-11-23 01:00 en Ecuador (lunes)
  const mondayMorningEc = new Date('2026-11-23T06:00:00.000Z')
  assert.equal(ecuadorToday(mondayMorningEc), '2026-11-23')
  // Ahora sí se cerró la semana lunes 16/11 al domingo 22/11
  const weekOnMonday = lastClosedWeek(mondayMorningEc)
  assert.equal(weekOnMonday.from, '2026-11-16')
  assert.equal(weekOnMonday.to, '2026-11-22')

  // Mes calendario cerrado en noviembre 2026 es octubre 2026
  const closedMonth = lastClosedMonth(mondayMorningEc)
  assert.equal(closedMonth.month, '2026-10')
  assert.equal(closedMonth.from, '2026-10-01')
  assert.equal(closedMonth.to, '2026-10-31')

  // Recuperación de períodos pendientes (lookback)
  const pendingWeeks = closedWeeksInLookback(mondayMorningEc, 4)
  assert.equal(pendingWeeks.length, 4)
  assert.equal(pendingWeeks[3].from, '2026-11-16')
  assert.equal(pendingWeeks[0].from, '2026-10-26')

  const pendingMonths = closedMonthsInLookback(mondayMorningEc, 3)
  assert.deepEqual(pendingMonths.map((m) => m.month), ['2026-08', '2026-09', '2026-10'])

  // Claves de deduplicación deterministas
  assert.equal(
    buildAutomaticDedupeKey('CONSOLIDATED_IMPACT', '2026-10'),
    'AUTO:CONSOLIDATED_IMPACT:2026-10',
  )
  assert.equal(
    buildAutomaticDedupeKey('WEEKLY_OPERATIONAL', '2026-11-16..2026-11-22'),
    'AUTO:WEEKLY_OPERATIONAL:2026-11-16..2026-11-22',
  )
})

test('previousEquivalentPeriod impide comparar períodos abiertos o rangos inválidos', () => {
  const now = new Date('2026-11-23T15:00:00.000Z')
  const open = previousEquivalentPeriod('2026-11-01', '2026-11-30', now)
  assert.equal(open.comparable, false)
  assert.ok(open.reason && open.reason.includes('abierto'))

  const closed = previousEquivalentPeriod('2026-10-01', '2026-10-31', now)
  assert.equal(closed.comparable, true)
  assert.equal(closed.from, '2026-09-01')
  assert.equal(closed.to, '2026-09-30')

  assert.equal(validateReportDateRange('2026-11-10', '2026-11-01').ok, false)
  assert.equal(validateReportDateRange('1999-01-01', '2026-01-01').ok, false)
  assert.equal(validateReportDateRange('2026-01-01', '2026-01-31').ok, true)
})

test('safePercentChange nunca divide entre cero y observaciones respetan reglas de negocio', () => {
  assert.equal(safePercentChange(100, 0), null)
  assert.equal(safePercentChange(100, null), null)
  assert.equal(safePercentChange(125, 100), 25)
  assert.equal(safePercentChange(80, 100), -20)

  // Período sin datos
  const empty = buildDeterministicInsights({
    periodLabel: 'Octubre 2026',
    comparable: true,
    productionByUnit: [],
    costs: { totalUsd: 0, directUsd: 0, generalUsd: 0, recordCount: 0 },
    market: { totalSalesUsd: 0, salesCount: 0, cancelledCount: 0, grossProfitUsd: null, missingCostCount: 0, byUnit: [] },
  })
  assert.ok(empty.observations.some((o) => o.includes('No se registraron cosechas')))
  assert.ok(empty.limitations.some((l) => l.includes('no constituye una evaluación causal')))

  // Unidades incompatibles: advierte separación explícita y no mezcla rankings
  const multiUnit = buildDeterministicInsights({
    periodLabel: 'Octubre 2026',
    comparable: true,
    productionByUnit: [
      {
        unit: 'kilogramos',
        harvested: 500,
        useful: 460,
        losses: 40,
        affectingLosses: 40,
        statisticalLosses: 0,
        unclassifiedLosses: 0,
        harvestCount: 4,
        previousHarvested: 400,
      },
      {
        unit: 'racimos',
        harvested: 120,
        useful: 120,
        losses: 0,
        affectingLosses: 0,
        statisticalLosses: 0,
        unclassifiedLosses: 0,
        harvestCount: 3,
        previousHarvested: 0,
      },
    ],
    market: {
      totalSalesUsd: 650,
      salesCount: 10,
      cancelledCount: 1,
      grossProfitUsd: 180,
      missingCostCount: 2,
      byUnit: [{ unit: 'kilogramos', quantity: 200, totalUsd: 650 }],
    },
  })
  assert.ok(multiUnit.limitations.some((l) => l.includes('unidades incompatibles')))
  assert.ok(multiUnit.limitations.some((l) => l.includes('no equivale a utilidad neta')))
  assert.ok(multiUnit.limitations.some((l) => l.includes('2 ventas del período no cuentan con precio')))
  assert.ok(multiUnit.observations.some((o) => o.includes('no permite atribuir causas')))
})

test('exportación PDF multipágina y CSV protegen fórmulas e incluyen identificación institucional', () => {
  const payload = {
    version: 1,
    type: 'CONSOLIDATED_IMPACT',
    title: 'Reporte consolidado de productividad y análisis de impacto',
    scope: 'Finca Experimental Lodana y Agro Market',
    cadence: 'MONTHLY',
    period: {
      from: '2026-10-01',
      to: '2026-10-31',
      label: 'Octubre 2026',
      previousFrom: '2026-09-01',
      previousTo: '2026-09-30',
      previousLabel: 'Septiembre 2026',
      comparable: true,
    },
    filters: { cropId: null, cropName: null, unitId: null, unitName: null },
    institution: {
      organizationName: 'Lodana Agro',
      universityName: 'Universidad Laica Eloy Alfaro de Manabí (ULEAM)',
      farmName: 'Finca Experimental Lodana',
      marketName: 'Agro Market',
      location: 'Manabí, Ecuador',
    },
    generatedAt: '2026-11-01T05:15:00.000Z',
    hasData: true,
    kpis: [
      { label: 'Cosechas registradas', value: '24', detail: '2 unidades' },
      { label: 'Costos totales', value: '$1.250,00', detail: 'Producción' },
      { label: 'Ventas Agro Market', value: '$2.410,50', detail: 'Ganancia bruta est.: $520,00' },
    ],
    charts: [
      {
        title: 'Evolución de producción (kilogramos)',
        unit: 'kilogramos',
        kind: 'line',
        labels: ['2026-10-01', '2026-10-10', '2026-10-20', '2026-10-30'],
        series: [
          { label: 'Cosechado', color: 'green', values: [120, 180, 150, 210] },
          { label: 'Útil', color: 'blue', values: [110, 175, 140, 200] },
        ],
      },
    ],
    tables: [
      {
        title: 'Tabla extensa de prueba de paginación',
        columns: [
          { key: 'crop', label: 'Cultivo' },
          { key: 'unit', label: 'Unidad' },
          { key: 'qty', label: 'Cantidad', align: 'right' },
        ],
        // 45 filas fuerzan distribución en múltiples páginas
        rows: Array.from({ length: 45 }, (_, i) => ({
          crop: i === 0 ? '=SUM(A1:A2) Maíz' : `Cultivo ${i + 1} · Caña y Piña`,
          unit: 'kilogramos',
          qty: `${100 + i},50`,
        })),
      },
    ],
    observations: ['Observación de prueba con acentos: producción, maíz, caña y análisis.'],
    limitations: ['El análisis es descriptivo y no implica causalidad.'],
  }

  const pdfBuffer = buildReportPdf(payload, { trigger: 'AUTOMATIC', generatedAt: payload.generatedAt })
  const pdfText = pdfBuffer.toString('latin1')
  assert.ok(pdfText.startsWith('%PDF-1.4'))
  assert.ok(pdfText.includes('%%EOF'))
  assert.ok(pdfText.includes('/BaseFont /Helvetica'))
  assert.ok(pdfText.includes('/Encoding /WinAnsiEncoding'))
  assert.ok(pdfText.includes('Lodana Agro'))
  // Verifica que generó múltiples páginas
  const pageCountMatch = /\/Count (\d+)/.exec(pdfText)
  assert.ok(pageCountMatch && Number(pageCountMatch[1]) >= 2, 'El PDF extenso debe distribuirse en múltiples páginas')
  assert.ok(pdfText.includes(`P\\341gina 1 de ${pageCountMatch[1]}`))

  const csv = buildReportCsv(payload, { trigger: 'AUTOMATIC', generatedAt: payload.generatedAt })
  assert.ok(csv.startsWith('\uFEFF'))
  assert.ok(csv.includes('Universidad Laica Eloy Alfaro de Manabí'))
  // Protección contra inyección de fórmulas en CSV
  assert.ok(csv.includes(`"'=SUM(A1:A2) Maíz"`))
})
