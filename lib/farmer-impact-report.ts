import { prisma } from '@/lib/prisma'
import { ProductionError } from '@/lib/production-api'
import { InstitutionalPdfBuilder } from '@/lib/pdf-builder'
import { getInstitutionConfig } from '@/lib/system-config'
import {
  closedMonthsInLookback,
  closedWeeksInLookback,
  ecuadorDateRangeToUtc,
  ecuadorToday,
  formatPeriodLabel,
  isFullCalendarMonthRange,
  previousEquivalentPeriod,
  validateReportDateRange,
} from '@/lib/report-periods'
import {
  computeFarmerImpactModel,
  round2,
  surfaceToHectares,
  type FarmerImpactReportPayload,
  type PreviousPeriodSnapshot,
  type RawCostSummary,
  type RawDeliveryRow,
  type RawHarvestRow,
  type RawLossRow,
  type RawMarketRotationRow,
} from '@/lib/farmer-impact-model'

export type AutomaticPeriodOption = {
  id: string
  cadence: 'WEEKLY' | 'MONTHLY'
  from: string
  to: string
  label: string
}

export function getFarmerAutomaticPeriods(now = new Date()): {
  weekly: AutomaticPeriodOption[]
  monthly: AutomaticPeriodOption[]
  today: string
} {
  const weekly = closedWeeksInLookback(now, 4)
    .toReversed()
    .map((w) => ({
      id: `WEEKLY:${w.from}:${w.to}`,
      cadence: 'WEEKLY' as const,
      from: w.from,
      to: w.to,
      label: w.label,
    }))

  const monthly = closedMonthsInLookback(now, 6)
    .toReversed()
    .map((m) => ({
      id: `MONTHLY:${m.from}:${m.to}`,
      cadence: 'MONTHLY' as const,
      from: m.from,
      to: m.to,
      label: m.label,
    }))

  return { weekly, monthly, today: ecuadorToday(now) }
}

async function queryFarmerPeriodRaw(from: string, to: string) {
  const { dateStart, dateEndExclusive, ecStart, ecEndExclusive } = ecuadorDateRangeToUtc(from, to)

  const [harvestRows, lossRows, shipmentItems, receptionItemsInPeriod, costRows, saleRows] =
    await Promise.all([
      prisma.harvest.findMany({
        where: { deletedAt: null, status: 'ACTIVE', date: { gte: dateStart, lt: dateEndExclusive } },
        include: {
          crop: { select: { name: true } },
          unit: { select: { name: true } },
          productionArea: {
            select: {
              id: true,
              name: true,
              surface: true,
              surfaceUnit: true,
              zone: { select: { name: true } },
            },
          },
          losses: {
            where: { deletedAt: null, status: 'ACTIVE', affectsHarvest: true, date: { lt: dateEndExclusive } },
            select: { quantity: true },
          },
        },
      }),
      prisma.loss.findMany({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          date: { gte: dateStart, lt: dateEndExclusive },
          harvest: { deletedAt: null, status: 'ACTIVE' },
        },
        include: {
          reason: { select: { name: true } },
          harvest: {
            select: {
              estimatedUnitPrice: true,
              crop: { select: { name: true } },
              unit: { select: { name: true } },
            },
          },
        },
      }),
      prisma.shipmentItem.findMany({
        where: {
          deletedAt: null,
          shipment: {
            deletedAt: null,
            status: { not: 'CANCELLED' },
            date: { gte: dateStart, lt: dateEndExclusive },
          },
        },
        include: {
          crop: { select: { name: true } },
          unit: { select: { name: true } },
          shipment: { select: { status: true } },
          receptionItems: {
            where: {
              deletedAt: null,
              parentItemId: null,
              reception: { deletedAt: null, receivedAt: { lt: ecEndExclusive } },
            },
            select: {
              receivedQuantity: true,
              reception: { select: { receivedAt: true, closesWithDifferences: true } },
            },
          },
        },
      }),
      prisma.receptionItem.findMany({
        where: {
          deletedAt: null,
          parentItemId: null,
          reception: {
            deletedAt: null,
            receivedAt: { gte: ecStart, lt: ecEndExclusive },
            shipment: { deletedAt: null, status: { not: 'CANCELLED' } },
          },
          shipmentItem: { deletedAt: null },
        },
        include: {
          shipmentItem: {
            select: {
              estimatedUnitPrice: true,
              crop: { select: { name: true } },
              unit: { select: { name: true } },
            },
          },
        },
      }),
      prisma.cost.findMany({
        where: { deletedAt: null, date: { gte: dateStart, lt: dateEndExclusive } },
        include: {
          category: { select: { name: true } },
          allocations: {
            where: { deletedAt: null },
            include: { crop: { select: { name: true } } },
          },
        },
      }),
      prisma.marketSale.findMany({
        where: {
          cancelledAt: null,
          date: { gte: dateStart, lt: dateEndExclusive },
          receptionItem: {
            deletedAt: null,
            reception: {
              deletedAt: null,
              shipment: { deletedAt: null, status: { not: 'CANCELLED' } },
            },
            shipmentItem: { deletedAt: null },
          },
        },
        include: {
          receptionItem: {
            select: {
              saleUnitId: true,
              saleQuantity: true,
              convertedFromQty: true,
              shipmentItem: {
                select: {
                  crop: { select: { name: true } },
                  unit: { select: { name: true } },
                },
              },
            },
          },
        },
      }),
    ])

  const harvests: RawHarvestRow[] = harvestRows.map((h) => {
    const qty = h.quantity.toNumber()
    const deducted = h.losses.reduce((sum, l) => sum + l.quantity.toNumber(), 0)
    return {
      crop: h.crop.name,
      unit: h.unit.name,
      zone: h.productionArea?.zone?.name ?? h.productionArea?.name ?? null,
      areaId: h.productionArea?.id ?? null,
      surfaceHa: surfaceToHectares(
        h.productionArea?.surface ? h.productionArea.surface.toNumber() : null,
        h.productionArea?.surfaceUnit ?? null,
      ),
      quantity: qty,
      useful: Math.max(0, qty - deducted),
      estimatedUnitPrice: h.estimatedUnitPrice ? h.estimatedUnitPrice.toNumber() : null,
    }
  })

  const losses: RawLossRow[] = lossRows.map((l) => ({
    crop: l.harvest.crop.name,
    unit: l.harvest.unit.name,
    reason: l.reason.name,
    quantity: l.quantity.toNumber(),
    affectsHarvest: l.affectsHarvest,
    harvestEstimatedPrice: l.harvest.estimatedUnitPrice
      ? l.harvest.estimatedUnitPrice.toNumber()
      : null,
  }))

  // Entregas: cada recepción se contabiliza exactamente una vez en el período en que Agro Market la recibió
  const deliveries: RawDeliveryRow[] = shipmentItems.map((si) => {
    const receivedInPeriod = si.receptionItems
      .filter((r) => r.reception.receivedAt >= ecStart && r.reception.receivedAt < ecEndExclusive)
      .reduce((sum, r) => sum + r.receivedQuantity.toNumber(), 0)
    const closedWithDiff =
      si.shipment.status === 'RECEIVED_WITH_DIFFERENCES' ||
      si.receptionItems.some((r) => r.reception.closesWithDifferences)
    const pendingReception =
      si.shipment.status === 'IN_TRANSIT' || si.shipment.status === 'PARTIALLY_RECEIVED'
    return {
      crop: si.crop.name,
      unit: si.unit.name,
      shippedQty: si.quantity.toNumber(),
      receivedQty: receivedInPeriod,
      closedWithDiff,
      pendingReception,
      farmUnitPrice: si.estimatedUnitPrice ? si.estimatedUnitPrice.toNumber() : null,
    }
  })

  // Recepciones confirmadas en este período que provienen de envíos despachados en un período anterior
  const shippedItemIds = new Set(shipmentItems.map((si) => si.id))
  for (const ri of receptionItemsInPeriod) {
    if (shippedItemIds.has(ri.shipmentItemId)) continue
    deliveries.push({
      crop: ri.shipmentItem.crop.name,
      unit: ri.shipmentItem.unit.name,
      shippedQty: 0,
      receivedQty: ri.receivedQuantity.toNumber(),
      closedWithDiff: false,
      pendingReception: false,
      farmUnitPrice: ri.shipmentItem.estimatedUnitPrice
        ? ri.shipmentItem.estimatedUnitPrice.toNumber()
        : null,
    })
  }

  // Señal de rotación en Agro Market convertida siempre a la unidad original en que entregó el agricultor
  const marketRotations: RawMarketRotationRow[] = []
  for (const s of saleRows) {
    const ri = s.receptionItem
    const baseUnit = ri.shipmentItem.unit.name
    let farmUnitQty = s.quantity.toNumber()
    if (ri.saleUnitId) {
      const saleQty = ri.saleQuantity ? ri.saleQuantity.toNumber() : 0
      const convFrom = ri.convertedFromQty ? ri.convertedFromQty.toNumber() : 0
      if (saleQty > 0 && convFrom > 0) {
        farmUnitQty = round2(farmUnitQty * (convFrom / saleQty))
      } else {
        continue
      }
    }
    marketRotations.push({
      crop: ri.shipmentItem.crop.name,
      unit: baseUnit,
      soldQty: farmUnitQty,
    })
  }

  let totalUsd = 0
  let directUsd = 0
  let generalUsd = 0
  const catMap = new Map<string, { category: string; amountUsd: number; count: number }>()
  const directCropMap = new Map<string, number>()

  for (const c of costRows) {
    const amount = c.amountUsd.toNumber()
    totalUsd += amount
    const isGeneral = c.applicationType === 'GENERAL' || c.allocations.length === 0
    if (isGeneral) generalUsd += amount
    else directUsd += amount

    const cat = catMap.get(c.category.name) ?? { category: c.category.name, amountUsd: 0, count: 0 }
    cat.amountUsd += amount
    cat.count += 1
    catMap.set(c.category.name, cat)

    if (!isGeneral) {
      for (const alloc of c.allocations) {
        if (!alloc.crop) continue
        const share =
          alloc.amountUsd !== null
            ? alloc.amountUsd.toNumber()
            : alloc.percent !== null
              ? round2(amount * (alloc.percent.toNumber() / 100))
              : 0
        directCropMap.set(alloc.crop.name, (directCropMap.get(alloc.crop.name) ?? 0) + share)
      }
    }
  }

  const costs: RawCostSummary = {
    totalUsd: round2(totalUsd),
    directUsd: round2(directUsd),
    generalUsd: round2(generalUsd),
    recordCount: costRows.length,
    byCategory: [...catMap.values()].toSorted((a, b) => b.amountUsd - a.amountUsd),
    directByCrop: [...directCropMap.entries()].map(([crop, amountUsd]) => ({
      crop,
      amountUsd: round2(amountUsd),
    })),
  }

  return { harvests, losses, deliveries, marketRotations, costs }
}

export async function buildFarmerImpactReport(params: {
  from: string
  to: string
  cadence?: 'WEEKLY' | 'MONTHLY' | 'CUSTOM'
  automatic?: boolean
  now?: Date
}): Promise<FarmerImpactReportPayload> {
  const validation = validateReportDateRange(params.from, params.to)
  if (!validation.ok) throw new ProductionError(validation.error, 400)

  const now = params.now ?? new Date()
  if (params.to > ecuadorToday(now)) {
    throw new ProductionError('No puedes consultar fechas futuras.', 400)
  }
  const cadence =
    params.cadence ?? (isFullCalendarMonthRange(params.from, params.to) ? 'MONTHLY' : 'CUSTOM')
  const automatic = params.automatic ?? cadence !== 'CUSTOM'

  const periodLabel = formatPeriodLabel(params.from, params.to, cadence)
  const prev = previousEquivalentPeriod(params.from, params.to, now)

  const [institution, currRaw, prevRaw] = await Promise.all([
    getInstitutionConfig(),
    queryFarmerPeriodRaw(params.from, params.to),
    prev.comparable ? queryFarmerPeriodRaw(prev.from, prev.to) : null,
  ])

  let previousSnapshot: PreviousPeriodSnapshot | null = null
  if (prev.comparable && prevRaw) {
    const prevModel = computeFarmerImpactModel({
      period: {
        from: prev.from,
        to: prev.to,
        label: prev.label,
        previousFrom: null,
        previousTo: null,
        previousLabel: null,
        comparable: false,
      },
      cadence,
      automatic,
      institution,
      generatedAt: now.toISOString(),
      ...prevRaw,
    })
    previousSnapshot = {
      byUnit: new Map(
        prevModel.units.map((u) => [
          u.unit,
          { harvested: u.harvested, useful: u.useful, losses: u.losses },
        ]),
      ),
      deliveredToMarketUsd: prevModel.economics.deliveredToMarketUsd,
      farmCostsUsd: prevModel.economics.farmCostsUsd,
    }
  }

  return computeFarmerImpactModel({
    period: {
      from: params.from,
      to: params.to,
      label: periodLabel,
      previousFrom: prev.comparable ? prev.from : null,
      previousTo: prev.comparable ? prev.to : null,
      previousLabel: prev.comparable ? prev.label : null,
      comparable: prev.comparable,
    },
    cadence,
    automatic,
    institution,
    generatedAt: now.toISOString(),
    ...currRaw,
    previous: previousSnapshot,
    comparisonNote: prev.reason,
  })
}

const numFmt = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 })
const usdFmt = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' })
const ecDateTime = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function buildFarmerReportPdf(report: FarmerImpactReportPayload): Buffer {
  const inst = report.institution
  const title =
    report.cadence === 'WEEKLY'
      ? 'Reporte Semanal de Productividad e Impacto del Agricultor'
      : report.cadence === 'MONTHLY'
        ? 'Reporte Mensual de Productividad e Impacto del Agricultor'
        : 'Reporte de Productividad e Impacto del Agricultor'

  const pdf = new InstitutionalPdfBuilder({
    runningLeft: `${inst.organizationName} · ${title}`,
    runningRight: report.period.label,
    footerLeft: `${inst.organizationName} · ${inst.universityName}`,
  })

  const gen = new Date(report.generatedAt)
  const generatedLabel = Number.isNaN(gen.getTime())
    ? report.generatedAt
    : `${ecDateTime.format(gen)} (Ecuador)`

  pdf.addInstitutionalHeader({
    organization: inst.organizationName,
    university: inst.universityName,
    scope: `${inst.farmName} (ventas a ${inst.marketName})`,
    title,
    periodLabel: `${report.period.label} (${report.period.from} al ${report.period.to})`,
    generatedAt: generatedLabel,
    triggerLabel: report.automatic ? 'Cierre automático programado' : 'Consulta personalizada',
    filtersLabel: 'Perfil: Producción agrícola (Finca)',
  })

  if (report.recommendations.length > 0) {
    pdf.addBulletBox(
      'Recomendaciones prácticas para el agricultor',
      report.recommendations.map((r) => `${r.title}: ${r.detail}`),
      'info',
    )
  }

  pdf.addTable({
    title: 'Balance económico del agricultor (Finca hacia Agro Market)',
    subtitle: 'Ingresos valorados a precio de entrega de finca frente a costos de producción.',
    columns: [
      { key: 'metric', label: 'Concepto' },
      { key: 'amount', label: 'Monto (USD)', align: 'right' },
      { key: 'note', label: 'Detalle' },
    ],
    rows: [
      {
        metric: 'Entregado y recibido por Agro Market',
        amount: usdFmt.format(report.economics.deliveredToMarketUsd),
        note: 'Cantidades recibidas conforme × precio de finca',
      },
      {
        metric: 'Gastos totales de finca',
        amount: usdFmt.format(report.economics.farmCostsUsd),
        note: `Directos: ${usdFmt.format(report.economics.directCostsUsd)} · Generales: ${usdFmt.format(report.economics.generalCostsUsd)}`,
      },
      {
        metric: 'Balance estimado de finca',
        amount: usdFmt.format(report.economics.estimatedBalanceUsd),
        note: 'Entregado a Agro Market menos gastos registrados',
      },
      {
        metric: 'Impacto estimado por pérdidas en campo',
        amount:
          report.economics.estimatedFieldLossUsd !== null
            ? usdFmt.format(report.economics.estimatedFieldLossUsd)
            : 'Sin precio de ref.',
        note: 'Dinero estimado dejado de vender por mermas',
      },
      {
        metric: 'Diferencias en entregas a Agro Market',
        amount: usdFmt.format(report.economics.deliveryDifferenceUsd),
        note: `En tránsito pendiente: ${usdFmt.format(report.economics.inTransitValueUsd)}`,
      },
    ],
  })

  if (report.beforeAfter.length > 0) {
    pdf.addTable({
      title: 'Evolución de impacto (Antes vs. Ahora)',
      subtitle: report.period.previousLabel ? `Frente a ${report.period.previousLabel}` : undefined,
      columns: [
        { key: 'label', label: 'Indicador' },
        { key: 'previous', label: 'Período anterior', align: 'right' },
        { key: 'current', label: 'Período actual', align: 'right' },
        { key: 'delta', label: 'Variación', align: 'right' },
      ],
      rows: report.beforeAfter.map((item) => ({
        label: item.label,
        previous: item.previous,
        current: item.current,
        delta:
          item.deltaPct === null
            ? 'No comparable'
            : `${item.deltaPct > 0 ? '+' : ''}${numFmt.format(item.deltaPct)}%`,
      })),
    })
  }

  if (report.crops.length > 0) {
    pdf.addTable({
      title: 'Productividad y entregas por cultivo',
      columns: [
        { key: 'crop', label: 'Cultivo' },
        { key: 'unit', label: 'Unidad' },
        { key: 'useful', label: 'Útil', align: 'right' },
        { key: 'losses', label: 'Pérdidas', align: 'right' },
        { key: 'received', label: 'Recibido AM', align: 'right' },
        { key: 'deliveredUsd', label: 'Valor finca', align: 'right' },
      ],
      rows: report.crops.map((c) => ({
        crop: c.crop,
        unit: c.unit,
        useful: numFmt.format(c.useful),
        losses: `${numFmt.format(c.losses)} (${numFmt.format(c.lossRatePct ?? 0)}%)`,
        received: numFmt.format(c.received),
        deliveredUsd: usdFmt.format(c.deliveredValueUsd),
      })),
    })
  }

  if (report.zoneYields.length > 0) {
    pdf.addTable({
      title: 'Productividad por zona (rendimiento por hectárea)',
      columns: [
        { key: 'zone', label: 'Zona / Lote' },
        { key: 'crop', label: 'Cultivo' },
        { key: 'surface', label: 'Superficie (ha)', align: 'right' },
        { key: 'useful', label: 'Producción útil', align: 'right' },
        { key: 'yield', label: 'Rendimiento / ha', align: 'right' },
      ],
      rows: report.zoneYields.map((z) => ({
        zone: z.zone,
        crop: z.crop,
        surface: numFmt.format(z.surfaceHa),
        useful: `${numFmt.format(z.useful)} ${z.unit}`,
        yield: `${numFmt.format(z.yieldPerHa)} ${z.unit}/ha`,
      })),
    })
  }

  pdf.addBulletBox('Alcance y criterios de cálculo', report.limitations, 'warning')
  return pdf.build()
}

function csvCell(value: string | number | null): string {
  if (value === null) return ''
  let text = String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildFarmerReportCsv(report: FarmerImpactReportPayload): string {
  const lines: string[] = [
    ['Institución', report.institution.universityName].map(csvCell).join(','),
    ['Sistema', `${report.institution.organizationName} - ${report.institution.farmName}`].map(csvCell).join(','),
    ['Período', `${report.period.label} (${report.period.from} al ${report.period.to})`].map(csvCell).join(','),
    '',
    ['RESUMEN ECONÓMICO DEL AGRICULTOR', 'USD'].map(csvCell).join(','),
    ['Entregado y recibido por Agro Market', report.economics.deliveredToMarketUsd].map(csvCell).join(','),
    ['Gastos totales de finca', report.economics.farmCostsUsd].map(csvCell).join(','),
    ['Balance estimado de finca', report.economics.estimatedBalanceUsd].map(csvCell).join(','),
    ['Impacto estimado por pérdidas en campo', report.economics.estimatedFieldLossUsd ?? ''].map(csvCell).join(','),
    ['Diferencias en entregas a Agro Market', report.economics.deliveryDifferenceUsd].map(csvCell).join(','),
    '',
    ['CULTIVO', 'UNIDAD', 'COSECHADO', 'ÚTIL', 'PÉRDIDAS', 'RECIBIDO AGRO MARKET', 'VALOR FINCA (USD)', 'GASTO DIRECTO (USD)', 'MOTIVO PRINCIPAL'].map(csvCell).join(','),
    ...report.crops.map((c) =>
      [
        c.crop,
        c.unit,
        c.harvested,
        c.useful,
        c.losses,
        c.received,
        c.deliveredValueUsd,
        c.directCostsUsd,
        c.topReason ?? '',
      ]
        .map(csvCell)
        .join(','),
    ),
  ]

  if (report.zoneYields.length > 0) {
    lines.push(
      '',
      ['ZONA / LOTE', 'CULTIVO', 'SUPERFICIE (HA)', 'ÚTIL', 'UNIDAD', 'RENDIMIENTO POR HA'].map(csvCell).join(','),
      ...report.zoneYields.map((z) =>
        [z.zone, z.crop, z.surfaceHa, z.useful, z.unit, z.yieldPerHa].map(csvCell).join(','),
      ),
    )
  }

  return `\uFEFF${lines.join('\r\n')}\r\n`
}
