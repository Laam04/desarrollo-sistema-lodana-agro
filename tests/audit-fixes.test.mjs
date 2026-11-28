import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildForecast,
  describeSeasonality,
  formatChartAxisLabel,
  formatChartDetailLabel,
  isDayBucket,
  isMonthBucket,
  shiftMonth,
} from '../lib/analytics-model.ts'
import { normalizeCatalogName, parseDate } from '../lib/production-validation.ts'
import { cents, decimalInput, isValidIsoDay, marketWeek, markupPercent, salesValue, suggestRetailSalePrice } from '../lib/market-data.ts'
import { createSession, parseSession, readSession } from '../lib/profile-session.ts'

test('parseDate acota fechas al rango 2000-2100 y rechaza años inválidos', () => {
  assert.equal(parseDate('0001-01-01'), null)
  assert.equal(parseDate('1999-12-31'), null)
  assert.equal(parseDate('9999-12-31'), null)
  assert.equal(parseDate('2026-02-30'), null)
  assert.ok(parseDate('2026-11-19') instanceof Date)
})

test('marketWeek valida entradas mal formadas sin lanzar RangeError', () => {
  assert.equal(isValidIsoDay('9999-12-31'), false)
  assert.equal(isValidIsoDay('no-es-fecha'), false)
  assert.deepEqual(marketWeek('2026-11-19'), { from: '2026-11-16', to: '2026-11-22' })
  const fallback = marketWeek('fecha-invalida')
  assert.match(fallback.from, /^\d{4}-\d{2}-\d{2}$/)
  assert.match(fallback.to, /^\d{4}-\d{2}-\d{2}$/)
})

test('cents, salesValue y markupPercent evitan errores de punto flotante', () => {
  assert.equal(cents('1.15'), 115)
  assert.equal(cents('19.99'), 1999)
  assert.equal(salesValue('1.15', '0.10'), 0.12)
  assert.equal(markupPercent('8.50', '6.50'), 30.77)
  assert.equal(markupPercent('10.00', '0'), null)
})

test('suggestRetailSalePrice usa la referencia de recepción y el costo de producción', () => {
  assert.deepEqual(
    suggestRetailSalePrice('6.00', '7.20'),
    { price: '7.20', reason: 'referencia anotada en recepción' },
  )
  assert.deepEqual(
    suggestRetailSalePrice('7.00', '7.20'),
    { price: '8.05', reason: 'costo de producción + 15%' },
  )
  assert.deepEqual(
    suggestRetailSalePrice('10.00', null),
    { price: '11.50', reason: 'costo de producción + 15%' },
  )
  assert.equal(suggestRetailSalePrice(null, null), null)
})

test('buildForecast descarta meses futuros y deduplica meses repetidos', () => {
  const rows = Array.from({ length: 24 }, (_, i) => ({
    month: shiftMonth('2024-01', i),
    quantity: 100 + i,
  }))
  const noisy = [
    ...rows,
    { month: '2025-12', quantity: 123 }, // duplicado
    { month: '2026-01', quantity: 999 }, // posterior a lastClosed
  ]
  const result = buildForecast(noisy, '2025-12')
  assert.equal(result.observedMonths, 24)
  assert.equal(result.consecutiveMonths, 24)
  assert.ok(result.history.every((p) => p.month <= '2025-12'))
})

test('describeSeasonality ignora duplicados, NaN y no infla threshold con años en cero', () => {
  const mkYear = (year, scale = 1) =>
    Array.from({ length: 12 }, (_, m) => ({
      month: `${year}-${String(m + 1).padStart(2, '0')}`,
      quantity: scale * (m === 11 ? 200 : m === 0 ? 40 : 100),
    }))
  const data = [
    ...mkYear(2022, 1),
    ...mkYear(2023, 1),
    ...mkYear(2024, 0), // año completo en cero no debe impedir consenso de 2022 y 2023
    { month: '2025-01', quantity: Number.NaN },
    ...Array.from({ length: 12 }, () => ({ month: '2025-02', quantity: 50 })), // duplicados mismo mes
  ]
  const s = describeSeasonality(data)
  assert.equal(s.years.length, 3)
  assert.ok(s.higher.includes(12))
  assert.ok(s.lower.includes(1))
})

test('createSession y parseSession firman con jti único y soportan rotación de clave', () => {
  const prevSecret = process.env.LODANA_SESSION_SECRET
  const prevOld = process.env.LODANA_SESSION_SECRET_PREVIOUS
  try {
    process.env.LODANA_SESSION_SECRET = 'a'.repeat(40)
    const created = createSession('admin')
    assert.ok(created)
    assert.match(created.jti, /^[0-9a-f]{32}$/)
    assert.equal(readSession(created.token), 'admin')

    // Rotación de clave: la clave anterior sigue validando sesiones vigentes
    process.env.LODANA_SESSION_SECRET_PREVIOUS = 'a'.repeat(40)
    process.env.LODANA_SESSION_SECRET = 'b'.repeat(40)
    const parsed = parseSession(created.token)
    assert.equal(parsed?.profile, 'admin')
    assert.equal(parsed?.jti, created.jti)

    // Token manipulado falla
    assert.equal(readSession(created.token.replace('admin', 'production')), null)
  } finally {
    if (prevSecret === undefined) delete process.env.LODANA_SESSION_SECRET
    else process.env.LODANA_SESSION_SECRET = prevSecret
    if (prevOld === undefined) delete process.env.LODANA_SESSION_SECRET_PREVIOUS
    else process.env.LODANA_SESSION_SECRET_PREVIOUS = prevOld
  }
})

test('formatChartAxisLabel y formatChartDetailLabel soportan meses, días y etiquetas categóricas sin RangeError', () => {
  assert.equal(isMonthBucket('2026-10'), true)
  assert.equal(isMonthBucket('2026-10-15'), false)
  assert.equal(isDayBucket('2026-10-15'), true)
  assert.equal(isDayBucket('2026-02-30'), false)
  assert.equal(isDayBucket('racimos'), false)

  assert.match(formatChartAxisLabel('2026-10'), /oct/i)
  assert.match(formatChartDetailLabel('2026-10'), /octubre/i)
  assert.match(formatChartAxisLabel('2026-10-15'), /15/)
  assert.equal(formatChartDetailLabel('2026-10-15'), '15/10/2026')
  assert.equal(formatChartAxisLabel('racimos'), 'racimos')
  assert.equal(formatChartDetailLabel('cajas'), 'cajas')
  assert.equal(formatChartDetailLabel('2026-02-30'), '2026-02-30')
})

test('decimalInput y normalizeCatalogName soportan coma decimal ecuatoriana y tildes', () => {
  assert.equal(decimalInput(' 1,50 '), '1.50')
  assert.equal(cents('1,50'), 150)
  assert.equal(salesValue('2,5', '1,20'), 3)
  assert.deepEqual(suggestRetailSalePrice('2,00', '2,10'), {
    price: '2.30',
    reason: 'costo de producción + 15%',
  })
  assert.equal(normalizeCatalogName('Logística'), normalizeCatalogName('logistica'))
  assert.equal(normalizeCatalogName('Daño por lluvia'), normalizeCatalogName('dano por lluvia'))
})
