import test from 'node:test'
import assert from 'node:assert/strict'
import { computeFarmerImpactModel, surfaceToHectares } from '../lib/farmer-impact-model.ts'

test('surfaceToHectares convierte ha y m2 correctamente', () => {
  assert.equal(surfaceToHectares(4.5, 'ha'), 4.5)
  assert.equal(surfaceToHectares(5000, 'm2'), 0.5)
  assert.equal(surfaceToHectares(0, 'ha'), null)
  assert.equal(surfaceToHectares(null, 'ha'), null)
})

test('computeFarmerImpactModel calcula ventas a Agro Market a precio de finca, impacto de pérdidas, rendimiento por ha y Antes vs Ahora', () => {
  const report = computeFarmerImpactModel({
    period: {
      from: '2026-10-01',
      to: '2026-10-31',
      label: 'Octubre de 2026',
      previousFrom: '2026-09-01',
      previousTo: '2026-09-30',
      previousLabel: 'Septiembre de 2026',
      comparable: true,
    },
    cadence: 'MONTHLY',
    automatic: true,
    institution: {
      organizationName: 'Lodana Agro',
      universityName: 'ULEAM',
      farmName: 'Finca Experimental Lodana',
      marketName: 'Agro Market',
      location: 'Lodana, Manabí',
    },
    generatedAt: '2026-11-01T05:15:00.000Z',
    harvests: [
      {
        crop: 'Banano',
        unit: 'racimos',
        zone: 'Zona Norte',
        areaId: 'area-1',
        surfaceHa: 4,
        quantity: 100,
        useful: 88,
        estimatedUnitPrice: 6,
      },
    ],
    losses: [
      {
        crop: 'Banano',
        unit: 'racimos',
        reason: 'Plaga o enfermedad',
        quantity: 12,
        affectsHarvest: true,
        harvestEstimatedPrice: 6,
      },
    ],
    deliveries: [
      {
        crop: 'Banano',
        unit: 'racimos',
        shippedQty: 80,
        receivedQty: 75,
        closedWithDiff: true,
        pendingReception: false,
        farmUnitPrice: 6,
      },
    ],
    marketRotations: [{ crop: 'Banano', unit: 'racimos', soldQty: 65 }],
    costs: {
      totalUsd: 300,
      directUsd: 200,
      generalUsd: 100,
      recordCount: 3,
      byCategory: [{ category: 'Insumos', amountUsd: 200, count: 2 }],
      directByCrop: [{ crop: 'Banano', amountUsd: 200 }],
    },
    previous: {
      byUnit: new Map([['racimos', { harvested: 80, useful: 70, losses: 10 }]]),
      deliveredToMarketUsd: 360,
      farmCostsUsd: 250,
    },
  })

  // Ingreso de finca = 75 recibidos * $6 = $450 (NO usa precio minorista de Agro Market)
  assert.equal(report.economics.deliveredToMarketUsd, 450)
  assert.equal(report.economics.farmCostsUsd, 300)
  assert.equal(report.economics.estimatedBalanceUsd, 150)
  // Pérdidas en campo = 12 * $6 = $72
  assert.equal(report.economics.estimatedFieldLossUsd, 72)
  // Diferencia en entrega = (80 - 75) * $6 = $30
  assert.equal(report.economics.deliveryDifferenceUsd, 30)
  // Rendimiento por hectárea = 88 útiles / 4 ha = 22 racimos/ha
  assert.equal(report.zoneYields.length, 1)
  assert.equal(report.zoneYields[0].yieldPerHa, 22)
  // Señal de demanda en Agro Market = 65 / 75 = 86.7%
  assert.equal(report.crops[0].marketRotationPct, 86.7)
  // Antes vs Ahora y recomendaciones generadas
  assert.ok(report.beforeAfter.length >= 4)
  assert.ok(report.recommendations.some((r) => r.title.includes('Plaga o enfermedad')))
  assert.ok(report.recommendations.some((r) => r.title.includes('diferencias')))
  assert.ok(report.whatsappText.includes('Entregado a Agro Market:'))
  assert.ok(report.whatsappText.includes('450'))
})

test('computeFarmerImpactModel ignora rotaciones de tienda sin cosecha ni entrega del agricultor (sin filas fantasma)', () => {
  const report = computeFarmerImpactModel({
    period: {
      from: '2026-10-01',
      to: '2026-10-31',
      label: 'Octubre de 2026',
      previousFrom: null,
      previousTo: null,
      previousLabel: null,
      comparable: false,
    },
    cadence: 'MONTHLY',
    automatic: true,
    institution: {
      organizationName: 'Lodana Agro',
      universityName: 'ULEAM',
      farmName: 'Finca Experimental Lodana',
      marketName: 'Agro Market',
      location: 'Lodana, Manabí',
    },
    generatedAt: '2026-11-01T05:15:00.000Z',
    harvests: [
      {
        crop: 'Plátano',
        unit: 'racimos',
        zone: 'Zona A',
        areaId: 'area-a',
        surfaceHa: 2,
        quantity: 40,
        useful: 40,
        estimatedUnitPrice: 5,
      },
    ],
    losses: [],
    deliveries: [
      {
        crop: 'Plátano',
        unit: 'racimos',
        shippedQty: 40,
        receivedQty: 40,
        closedWithDiff: false,
        pendingReception: false,
        farmUnitPrice: 5,
      },
    ],
    marketRotations: [
      { crop: 'Plátano', unit: 'racimos', soldQty: 20 },
      { crop: 'Plátano', unit: 'libras', soldQty: 150 },
      { crop: 'Tomate', unit: 'kg', soldQty: 30 },
    ],
    costs: {
      totalUsd: 100,
      directUsd: 100,
      generalUsd: 0,
      recordCount: 1,
      byCategory: [{ category: 'Insumos', amountUsd: 100, count: 1 }],
      directByCrop: [{ crop: 'Plátano', amountUsd: 100 }],
    },
    previous: null,
  })

  assert.equal(report.crops.length, 1)
  assert.equal(report.units.length, 1)
  assert.equal(report.crops[0].crop, 'Plátano')
  assert.equal(report.crops[0].unit, 'racimos')
  assert.equal(report.crops[0].marketRotationPct, 50)
})

test('computeFarmerImpactModel evita duplicar gasto directo en cultivos con múltiples unidades y maneja recepciones de envíos anteriores', () => {
  const report = computeFarmerImpactModel({
    period: {
      from: '2026-10-01',
      to: '2026-10-31',
      label: 'Octubre de 2026',
      previousFrom: null,
      previousTo: null,
      previousLabel: null,
      comparable: false,
    },
    cadence: 'MONTHLY',
    automatic: true,
    institution: {
      organizationName: 'Lodana Agro',
      universityName: 'ULEAM',
      farmName: 'Finca Experimental Lodana',
      marketName: 'Agro Market',
      location: 'Lodana, Manabí',
    },
    generatedAt: '2026-11-01T05:15:00.000Z',
    harvests: [
      {
        crop: 'Banano',
        unit: 'racimos',
        zone: 'Zona 1',
        areaId: 'area-1',
        surfaceHa: 3,
        quantity: 50,
        useful: 50,
        estimatedUnitPrice: 6,
      },
      {
        crop: 'Banano',
        unit: 'kg',
        zone: 'Zona 1',
        areaId: 'area-1',
        surfaceHa: 3,
        quantity: 200,
        useful: 200,
        estimatedUnitPrice: 0.5,
      },
    ],
    losses: [],
    deliveries: [
      // Envío de un período anterior recibido en el período actual: shippedQty = 0, receivedQty = 15
      {
        crop: 'Banano',
        unit: 'racimos',
        shippedQty: 0,
        receivedQty: 15,
        closedWithDiff: false,
        pendingReception: false,
        farmUnitPrice: 4,
      },
    ],
    marketRotations: [],
    costs: {
      totalUsd: 180,
      directUsd: 180,
      generalUsd: 0,
      recordCount: 2,
      byCategory: [{ category: 'Insumos', amountUsd: 180, count: 2 }],
      directByCrop: [{ crop: 'Banano', amountUsd: 180 }],
    },
    previous: null,
  })

  // Ambos registros de Banano deben dejar directCostsUsd en null para no duplicar $180
  assert.equal(report.crops.length, 2)
  assert.equal(report.crops[0].directCostsUsd, null)
  assert.equal(report.crops[1].directCostsUsd, null)
  assert.ok(report.limitations.some((l) => l.includes('más de una unidad de medida')))

  // Recepción de envío anterior suma $60 sin inflar enviados ni diferencias de entrega
  assert.equal(report.economics.deliveredToMarketUsd, 60)
  assert.equal(report.economics.deliveryDifferenceUsd, 0)
  const racimosRow = report.crops.find((c) => c.unit === 'racimos')
  assert.equal(racimosRow?.shipped, 0)
  assert.equal(racimosRow?.received, 15)
})
