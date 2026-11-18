import assert from 'node:assert/strict'
import test from 'node:test'
import { buildForecast, describeSeasonality, monthsBetween, shiftMonth } from '../lib/analytics-model.ts'

const monthly = (count, start = '2022-01') =>
  Array.from({ length: count }, (_, index) => ({
    month: shiftMonth(start, index),
    quantity: 100 + 4 * (index % 12) + 12 * Math.floor(index / 12),
  }))

test('series densa distingue meses sin datos y exige 24 meses consecutivos cerrados', () => {
  const rows = monthly(24)
  const insufficient = buildForecast(rows.slice(1), '2023-12')
  assert.equal(insufficient.consecutiveMonths, 23)
  assert.deepEqual(insufficient.estimates, [])

  const gap = buildForecast(rows.filter((_, index) => index !== 12), '2023-12')
  assert.equal(gap.observedMonths, 23)
  assert.equal(gap.consecutiveMonths, 11)
  assert.deepEqual(gap.estimates, [])

  const withZero = rows.map((row, index) => index === 12 ? { ...row, quantity: 0 } : row)
  assert.equal(buildForecast(withZero, '2023-12').consecutiveMonths, 24)
  assert.equal(buildForecast(rows, '2024-01').consecutiveMonths, 0)
})

test('usa un ciclo anual y una tendencia suavizada para seis meses', () => {
  const result = buildForecast(monthly(24), '2023-12')
  assert.equal(result.trend, 12)
  assert.deepEqual(result.estimates.map((point) => point.month), monthsBetween('2024-01', '2024-06'))
  assert.equal(result.estimates[0].value, 0.7 * 112 + 0.3 * 100 + 12)
  assert.ok(result.estimates.every((point) => point.low === null && point.high === null))
})

test('genera un rango retrospectivo solo cuando su horizonte tiene suficientes pruebas', () => {
  const result = buildForecast(monthly(29), '2024-05')
  assert.equal(result.estimates[0].low, null)
  const checked = buildForecast(monthly(35), '2024-11')
  for (const point of checked.estimates) {
    assert.ok(point.low !== null && point.low <= point.value)
    assert.ok(point.high !== null && point.high >= point.value)
  }
})

test('los meses altos y bajos requieren coincidencia entre años completos', () => {
  const partial = describeSeasonality(monthly(24, '2022-04'))
  assert.equal(partial.years.length, 1)
  assert.deepEqual(partial.higher, [])
  const dense = describeSeasonality(monthly(24))
  assert.equal(dense.years.length, 2)
  assert.ok(dense.higher.includes(12))
  assert.ok(dense.lower.includes(1))
  assert.ok(dense.typical.includes(6))
})

