const numFmt = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 })
const usdFmt = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' })

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function safePctChange(current: number, previous: number | null): number | null {
  if (previous === null || !Number.isFinite(previous) || previous <= 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export function surfaceToHectares(surface: number | null, surfaceUnit: string | null): number | null {
  if (surface === null || !Number.isFinite(surface) || surface <= 0) return null
  const unit = (surfaceUnit ?? 'ha').trim().toLowerCase()
  if (unit === 'ha' || unit === 'hectarea' || unit === 'hectáreas' || unit === 'hectareas') {
    return surface
  }
  if (unit === 'm2' || unit === 'm²' || unit === 'metros2') {
    return surface / 10_000
  }
  return null
}

export type FarmerUnitProductivity = {
  unit: string
  harvested: number
  useful: number
  losses: number
  affectingLosses: number
  harvestCount: number
  lossRatePct: number | null
  shipped: number
  received: number
  deliveryDiff: number
  soldInMarket: number
  marketRotationPct: number | null
}

export type FarmerCropBreakdown = {
  crop: string
  unit: string
  harvested: number
  useful: number
  losses: number
  lossRatePct: number | null
  shipped: number
  received: number
  soldInMarket: number
  deliveredValueUsd: number
  directCostsUsd: number | null
  estimatedLossUsd: number | null
  topReason: string | null
  marketRotationPct: number | null
}

export type FarmerZoneYield = {
  zone: string
  crop: string
  unit: string
  surfaceHa: number
  harvested: number
  useful: number
  losses: number
  yieldPerHa: number
}

export type FarmerLossCause = {
  crop: string
  unit: string
  reason: string
  quantity: number
  estimatedUsd: number | null
  lossRatePct: number | null
}

export type FarmerCostCategory = {
  category: string
  amountUsd: number
  count: number
  sharePct: number
}

export type FarmerBeforeAfter = {
  label: string
  current: string
  previous: string
  deltaPct: number | null
  favorable: boolean | null
}

export type FarmerRecommendation = {
  priority: 'high' | 'medium' | 'info'
  title: string
  detail: string
}

export type FarmerEconomics = {
  /** Ingreso real del agricultor: recibido conforme por Agro Market × precio de finca */
  deliveredToMarketUsd: number
  /** Valor de envíos aún en tránsito o pendientes de recepción a precio de finca */
  inTransitValueUsd: number
  /** Gastos registrados de la finca (directos + generales) */
  farmCostsUsd: number
  directCostsUsd: number
  generalCostsUsd: number
  /** Balance estimado del agricultor: entregas recibidas ($) − gastos de finca ($) */
  estimatedBalanceUsd: number
  /** Valor económico estimado dejado de percibir por mermas en campo */
  estimatedFieldLossUsd: number | null
  /** Porcentaje de volumen perdido que contaba con precio de referencia */
  pricedFieldLossPct: number | null
  /** Valor económico estimado por diferencias entre enviado y recibido en Agro Market */
  deliveryDifferenceUsd: number
  /** Líneas de entrega sin precio unitario de finca */
  unpricedDeliveryLines: number
}

export type FarmerImpactReportPayload = {
  version: 1
  cadence: 'WEEKLY' | 'MONTHLY' | 'CUSTOM'
  automatic: boolean
  period: {
    from: string
    to: string
    label: string
    previousFrom: string | null
    previousTo: string | null
    previousLabel: string | null
    comparable: boolean
  }
  institution: {
    organizationName: string
    universityName: string
    farmName: string
    marketName: string
    location: string
  }
  generatedAt: string
  hasData: boolean
  economics: FarmerEconomics
  units: FarmerUnitProductivity[]
  crops: FarmerCropBreakdown[]
  zoneYields: FarmerZoneYield[]
  topLossCauses: FarmerLossCause[]
  costCategories: FarmerCostCategory[]
  beforeAfter: FarmerBeforeAfter[]
  recommendations: FarmerRecommendation[]
  limitations: string[]
  whatsappText: string
}

export type RawHarvestRow = {
  crop: string
  unit: string
  zone: string | null
  areaId: string | null
  surfaceHa: number | null
  quantity: number
  useful: number
  estimatedUnitPrice: number | null
}

export type RawLossRow = {
  crop: string
  unit: string
  reason: string
  quantity: number
  affectsHarvest: boolean | null
  harvestEstimatedPrice: number | null
}

export type RawDeliveryRow = {
  crop: string
  unit: string
  shippedQty: number
  receivedQty: number
  closedWithDiff: boolean
  pendingReception: boolean
  farmUnitPrice: number | null
}

export type RawMarketRotationRow = {
  crop: string
  unit: string
  soldQty: number
}

export type RawCostSummary = {
  totalUsd: number
  directUsd: number
  generalUsd: number
  recordCount: number
  byCategory: { category: string; amountUsd: number; count: number }[]
  directByCrop: { crop: string; amountUsd: number }[]
}

export type PreviousPeriodSnapshot = {
  byUnit: Map<string, { harvested: number; useful: number; losses: number }>
  deliveredToMarketUsd: number
  farmCostsUsd: number
}

export function computeFarmerImpactModel(input: {
  period: FarmerImpactReportPayload['period']
  cadence: 'WEEKLY' | 'MONTHLY' | 'CUSTOM'
  automatic: boolean
  institution: FarmerImpactReportPayload['institution']
  generatedAt: string
  harvests: RawHarvestRow[]
  losses: RawLossRow[]
  deliveries: RawDeliveryRow[]
  marketRotations: RawMarketRotationRow[]
  costs: RawCostSummary
  previous?: PreviousPeriodSnapshot | null
  comparisonNote?: string | null
}): FarmerImpactReportPayload {
  // 1. Precio promedio de finca por cultivo+unidad como respaldo para valorar pérdidas sin precio propio
  const priceAcc = new Map<string, { weighted: number; qty: number }>()
  for (const h of input.harvests) {
    if (h.estimatedUnitPrice && h.estimatedUnitPrice > 0 && h.quantity > 0) {
      const k = `${h.crop}||${h.unit}`
      const cur = priceAcc.get(k) ?? { weighted: 0, qty: 0 }
      cur.weighted += h.estimatedUnitPrice * h.quantity
      cur.qty += h.quantity
      priceAcc.set(k, cur)
    }
  }
  for (const d of input.deliveries) {
    if (d.farmUnitPrice && d.farmUnitPrice > 0 && d.shippedQty > 0) {
      const k = `${d.crop}||${d.unit}`
      const cur = priceAcc.get(k) ?? { weighted: 0, qty: 0 }
      cur.weighted += d.farmUnitPrice * d.shippedQty
      cur.qty += d.shippedQty
      priceAcc.set(k, cur)
    }
  }
  const avgFarmPrice = new Map<string, number>()
  for (const [k, v] of priceAcc) {
    if (v.qty > 0) avgFarmPrice.set(k, v.weighted / v.qty)
  }

  // 2. Agregación por unidad y por cultivo+unidad
  const unitMap = new Map<string, FarmerUnitProductivity>()
  const cropMap = new Map<
    string,
    {
      crop: string
      unit: string
      harvested: number
      useful: number
      losses: number
      shipped: number
      received: number
      soldInMarket: number
      deliveredValueUsd: number
      estimatedLossUsd: number
      hasLossPrice: boolean
      reasons: Map<string, number>
    }
  >()
  const zoneAreaMap = new Map<
    string,
    { zone: string; crop: string; unit: string; surfaceHa: number; harvested: number; useful: number; losses: number }
  >()

  const getUnit = (unit: string) => {
    let entry = unitMap.get(unit)
    if (!entry) {
      entry = {
        unit,
        harvested: 0,
        useful: 0,
        losses: 0,
        affectingLosses: 0,
        harvestCount: 0,
        lossRatePct: null,
        shipped: 0,
        received: 0,
        deliveryDiff: 0,
        soldInMarket: 0,
        marketRotationPct: null,
      }
      unitMap.set(unit, entry)
    }
    return entry
  }

  const getCrop = (crop: string, unit: string) => {
    const key = `${crop}||${unit}`
    let entry = cropMap.get(key)
    if (!entry) {
      entry = {
        crop,
        unit,
        harvested: 0,
        useful: 0,
        losses: 0,
        shipped: 0,
        received: 0,
        soldInMarket: 0,
        deliveredValueUsd: 0,
        estimatedLossUsd: 0,
        hasLossPrice: false,
        reasons: new Map(),
      }
      cropMap.set(key, entry)
    }
    return entry
  }

  for (const h of input.harvests) {
    const u = getUnit(h.unit)
    u.harvested += h.quantity
    u.useful += h.useful
    u.harvestCount += 1

    const c = getCrop(h.crop, h.unit)
    c.harvested += h.quantity
    c.useful += h.useful

    if (h.zone && h.areaId && h.surfaceHa && h.surfaceHa > 0) {
      const zKey = `${h.areaId}||${h.crop}||${h.unit}`
      const z = zoneAreaMap.get(zKey) ?? {
        zone: h.zone,
        crop: h.crop,
        unit: h.unit,
        surfaceHa: h.surfaceHa,
        harvested: 0,
        useful: 0,
        losses: 0,
      }
      z.harvested += h.quantity
      z.useful += h.useful
      z.losses += Math.max(0, h.quantity - h.useful)
      zoneAreaMap.set(zKey, z)
    }
  }

  // 3. Pérdidas en campo + valor económico dejado de percibir
  let totalLossQty = 0
  let pricedLossQty = 0
  let totalFieldLossUsd = 0
  const lossCauseMap = new Map<
    string,
    { crop: string; unit: string; reason: string; quantity: number; estimatedUsd: number; hasPrice: boolean }
  >()

  for (const l of input.losses) {
    if (l.quantity <= 0) continue
    const u = getUnit(l.unit)
    u.losses += l.quantity
    if (l.affectsHarvest === true) u.affectingLosses += l.quantity

    const c = getCrop(l.crop, l.unit)
    c.losses += l.quantity
    c.reasons.set(l.reason, (c.reasons.get(l.reason) ?? 0) + l.quantity)

    const fallbackPrice = avgFarmPrice.get(`${l.crop}||${l.unit}`) ?? null
    const unitPrice =
      l.harvestEstimatedPrice && l.harvestEstimatedPrice > 0
        ? l.harvestEstimatedPrice
        : fallbackPrice

    totalLossQty += l.quantity
    const lossUsd = unitPrice ? round2(l.quantity * unitPrice) : 0
    if (unitPrice) {
      pricedLossQty += l.quantity
      totalFieldLossUsd += lossUsd
      c.estimatedLossUsd += lossUsd
      c.hasLossPrice = true
    }

    const lcKey = `${l.crop}||${l.unit}||${l.reason}`
    const lc = lossCauseMap.get(lcKey) ?? {
      crop: l.crop,
      unit: l.unit,
      reason: l.reason,
      quantity: 0,
      estimatedUsd: 0,
      hasPrice: false,
    }
    lc.quantity += l.quantity
    if (unitPrice) {
      lc.estimatedUsd += lossUsd
      lc.hasPrice = true
    }
    lossCauseMap.set(lcKey, lc)
  }

  // 4. Entregas del agricultor a Agro Market (ingreso real del agricultor + diferencias)
  let deliveredToMarketUsd = 0
  let inTransitValueUsd = 0
  let deliveryDifferenceUsd = 0
  let unpricedDeliveryLines = 0
  let closedDiffLines = 0
  let pendingLines = 0

  for (const d of input.deliveries) {
    const u = getUnit(d.unit)
    u.shipped += d.shippedQty
    u.received += d.receivedQty

    const c = getCrop(d.crop, d.unit)
    c.shipped += d.shippedQty
    c.received += d.receivedQty

    const diffQty = Math.max(0, round2(d.shippedQty - d.receivedQty))
    if (d.closedWithDiff && diffQty > 0) {
      u.deliveryDiff += diffQty
      closedDiffLines += 1
    } else if (d.pendingReception && diffQty > 0) {
      pendingLines += 1
    }

    const unitPrice =
      d.farmUnitPrice && d.farmUnitPrice > 0
        ? d.farmUnitPrice
        : (avgFarmPrice.get(`${d.crop}||${d.unit}`) ?? null)

    if (!unitPrice) {
      unpricedDeliveryLines += 1
      continue
    }

    const receivedUsd = round2(d.receivedQty * unitPrice)
    deliveredToMarketUsd += receivedUsd
    c.deliveredValueUsd += receivedUsd

    if (diffQty > 0) {
      if (d.closedWithDiff) {
        deliveryDifferenceUsd += round2(diffQty * unitPrice)
      } else if (d.pendingReception) {
        inTransitValueUsd += round2(diffQty * unitPrice)
      }
    }
  }

  // 5. Señal de demanda / rotación en Agro Market (NO se suma al dinero del agricultor ni crea filas fantasma)
  for (const r of input.marketRotations) {
    const u = unitMap.get(r.unit)
    if (u) u.soldInMarket += r.soldQty
    const c = cropMap.get(`${r.crop}||${r.unit}`)
    if (c) c.soldInMarket += r.soldQty
  }

  // Finalizar unidades
  const units: FarmerUnitProductivity[] = [...unitMap.values()]
    .map((u) => {
      const lossBase = u.affectingLosses > 0 ? u.affectingLosses : u.losses
      return {
        ...u,
        harvested: round2(u.harvested),
        useful: round2(u.useful),
        losses: round2(u.losses),
        affectingLosses: round2(u.affectingLosses),
        shipped: round2(u.shipped),
        received: round2(u.received),
        deliveryDiff: round2(u.deliveryDiff),
        soldInMarket: round2(u.soldInMarket),
        lossRatePct: u.harvested > 0 && lossBase > 0 ? Math.round((lossBase / u.harvested) * 1000) / 10 : 0,
        marketRotationPct:
          u.received > 0 ? Math.min(100, Math.round((u.soldInMarket / u.received) * 1000) / 10) : null,
      }
    })
    .toSorted((a, b) => b.harvested - a.harvested || a.unit.localeCompare(b.unit, 'es-EC'))

  // Finalizar cultivos (no duplicar gasto directo cuando un mismo cultivo usa varias unidades incompatibles)
  const directCostsByCrop = new Map(input.costs.directByCrop.map((c) => [c.crop, c.amountUsd]))
  const unitCountByCrop = new Map<string, number>()
  for (const c of cropMap.values()) {
    unitCountByCrop.set(c.crop, (unitCountByCrop.get(c.crop) ?? 0) + 1)
  }
  const hasMultiUnitDirectCost = [...unitCountByCrop.entries()].some(
    ([crop, count]) => count > 1 && (directCostsByCrop.get(crop) ?? 0) > 0,
  )

  const crops: FarmerCropBreakdown[] = [...cropMap.values()]
    .map((c) => {
      const topReasonEntry = [...c.reasons.entries()].toSorted((a, b) => b[1] - a[1])[0]
      const unitCount = unitCountByCrop.get(c.crop) ?? 1
      return {
        crop: c.crop,
        unit: c.unit,
        harvested: round2(c.harvested),
        useful: round2(c.useful),
        losses: round2(c.losses),
        lossRatePct: c.harvested > 0 && c.losses > 0 ? Math.round((c.losses / c.harvested) * 1000) / 10 : 0,
        shipped: round2(c.shipped),
        received: round2(c.received),
        soldInMarket: round2(c.soldInMarket),
        deliveredValueUsd: round2(c.deliveredValueUsd),
        directCostsUsd: unitCount === 1 ? round2(directCostsByCrop.get(c.crop) ?? 0) : null,
        estimatedLossUsd: c.hasLossPrice ? round2(c.estimatedLossUsd) : null,
        topReason: topReasonEntry?.[0] ?? null,
        marketRotationPct:
          c.received > 0 ? Math.min(100, Math.round((c.soldInMarket / c.received) * 1000) / 10) : null,
      }
    })
    .toSorted(
      (a, b) =>
        b.deliveredValueUsd - a.deliveredValueUsd ||
        b.harvested - a.harvested ||
        a.crop.localeCompare(b.crop, 'es-EC'),
    )

  // Finalizar rendimiento por zona / hectárea
  const zoneYields: FarmerZoneYield[] = [...zoneAreaMap.values()]
    .map((z) => ({
      zone: z.zone,
      crop: z.crop,
      unit: z.unit,
      surfaceHa: round2(z.surfaceHa),
      harvested: round2(z.harvested),
      useful: round2(z.useful),
      losses: round2(z.losses),
      yieldPerHa: round2(z.useful / z.surfaceHa),
    }))
    .toSorted((a, b) => b.yieldPerHa - a.yieldPerHa || b.useful - a.useful)
    .slice(0, 12)

  // Finalizar causas de pérdida
  const cropHarvestLookup = new Map(crops.map((c) => [`${c.crop}||${c.unit}`, c.harvested]))
  const topLossCauses: FarmerLossCause[] = [...lossCauseMap.values()]
    .map((lc) => {
      const hQty = cropHarvestLookup.get(`${lc.crop}||${lc.unit}`) ?? 0
      return {
        crop: lc.crop,
        unit: lc.unit,
        reason: lc.reason,
        quantity: round2(lc.quantity),
        estimatedUsd: lc.hasPrice ? round2(lc.estimatedUsd) : null,
        lossRatePct: hQty > 0 ? Math.round((lc.quantity / hQty) * 1000) / 10 : null,
      }
    })
    .toSorted(
      (a, b) =>
        (b.estimatedUsd ?? -1) - (a.estimatedUsd ?? -1) ||
        b.quantity - a.quantity,
    )
    .slice(0, 6)

  // Categorías de gasto
  const costCategories: FarmerCostCategory[] = input.costs.byCategory
    .slice(0, 8)
    .map((cat) => ({
      category: cat.category,
      amountUsd: round2(cat.amountUsd),
      count: cat.count,
      sharePct:
        input.costs.totalUsd > 0 ? Math.round((cat.amountUsd / input.costs.totalUsd) * 1000) / 10 : 0,
    }))

  const economics: FarmerEconomics = {
    deliveredToMarketUsd: round2(deliveredToMarketUsd),
    inTransitValueUsd: round2(inTransitValueUsd),
    farmCostsUsd: round2(input.costs.totalUsd),
    directCostsUsd: round2(input.costs.directUsd),
    generalCostsUsd: round2(input.costs.generalUsd),
    estimatedBalanceUsd: round2(deliveredToMarketUsd - input.costs.totalUsd),
    estimatedFieldLossUsd: pricedLossQty > 0 ? round2(totalFieldLossUsd) : null,
    pricedFieldLossPct: totalLossQty > 0 ? Math.round((pricedLossQty / totalLossQty) * 1000) / 10 : null,
    deliveryDifferenceUsd: round2(deliveryDifferenceUsd),
    unpricedDeliveryLines,
  }

  // 6. Comparativa Antes vs. Ahora
  const beforeAfter: FarmerBeforeAfter[] = []
  if (input.period.comparable && input.previous) {
    const prev = input.previous
    if (economics.deliveredToMarketUsd > 0 || prev.deliveredToMarketUsd > 0) {
      const delta = safePctChange(economics.deliveredToMarketUsd, prev.deliveredToMarketUsd)
      beforeAfter.push({
        label: 'Entregado a Agro Market ($)',
        current: usdFmt.format(economics.deliveredToMarketUsd),
        previous: usdFmt.format(prev.deliveredToMarketUsd),
        deltaPct: delta,
        favorable: delta === null ? null : delta >= 0,
      })
    }

    if (economics.farmCostsUsd > 0 || prev.farmCostsUsd > 0) {
      const delta = safePctChange(economics.farmCostsUsd, prev.farmCostsUsd)
      beforeAfter.push({
        label: 'Gastos de finca ($)',
        current: usdFmt.format(economics.farmCostsUsd),
        previous: usdFmt.format(prev.farmCostsUsd),
        deltaPct: delta,
        favorable: delta === null ? null : delta <= 0,
      })
    }

    for (const u of units.slice(0, 2)) {
      const pu = prev.byUnit.get(u.unit)
      if (pu && (u.useful > 0 || pu.useful > 0)) {
        const delta = safePctChange(u.useful, pu.useful)
        beforeAfter.push({
          label: `Producción útil (${u.unit})`,
          current: `${numFmt.format(u.useful)} ${u.unit}`,
          previous: `${numFmt.format(pu.useful)} ${u.unit}`,
          deltaPct: delta,
          favorable: delta === null ? null : delta >= 0,
        })
      }
      if (pu && (u.losses > 0 || pu.losses > 0)) {
        const delta = safePctChange(u.losses, pu.losses)
        beforeAfter.push({
          label: `Pérdidas (${u.unit})`,
          current: `${numFmt.format(u.losses)} ${u.unit}`,
          previous: `${numFmt.format(pu.losses)} ${u.unit}`,
          deltaPct: delta,
          favorable: delta === null ? null : delta <= 0,
        })
      }
    }
  }

  // 7. Recomendaciones prácticas deterministas para el agricultor
  const recommendations: FarmerRecommendation[] = []

  const topCause = topLossCauses[0]
  if (topCause) {
    const highImpact = (topCause.lossRatePct ?? 0) >= 10 || (topCause.estimatedUsd ?? 0) >= 80
    const usdPart =
      topCause.estimatedUsd !== null
        ? ` (aprox. ${usdFmt.format(topCause.estimatedUsd)} dejados de vender a Agro Market)`
        : ''
    const pctPart =
      topCause.lossRatePct !== null
        ? ` (${numFmt.format(topCause.lossRatePct)} % de lo cosechado)`
        : ''
    recommendations.push({
      priority: highImpact ? 'high' : 'medium',
      title: `Atender «${topCause.reason}» en ${topCause.crop}`,
      detail: `Principal pérdida del período: ${numFmt.format(topCause.quantity)} ${topCause.unit}${pctPart}${usdPart}.`,
    })
  } else if (units.some((u) => u.harvested > 0)) {
    recommendations.push({
      priority: 'info',
      title: 'Pérdidas en cero durante el período',
      detail: 'Toda la cosecha registrada se aprovechó sin mermas reportadas.',
    })
  }

  if (closedDiffLines > 0 && economics.deliveryDifferenceUsd > 0) {
    recommendations.push({
      priority: 'high',
      title: `Revisar diferencias en entregas a Agro Market (${usdFmt.format(economics.deliveryDifferenceUsd)})`,
      detail: `Se cerraron ${closedDiffLines} línea(s) de envío con menos producto recibido que despachado. Verifica pesaje y embalaje antes del despacho.`,
    })
  } else if (pendingLines > 0 && economics.inTransitValueUsd > 0) {
    recommendations.push({
      priority: 'info',
      title: `Entregas pendientes de confirmación (${usdFmt.format(economics.inTransitValueUsd)})`,
      detail: `Tienes ${pendingLines} línea(s) enviadas a Agro Market aún sin recepción completa; al confirmarse se sumarán a tu ingreso de finca.`,
    })
  }

  if (input.period.comparable && input.previous && economics.farmCostsUsd > 0) {
    const costDelta = safePctChange(economics.farmCostsUsd, input.previous.farmCostsUsd)
    if (costDelta !== null && costDelta >= 15) {
      const topCat = costCategories[0]
      recommendations.push({
        priority: 'medium',
        title: `Los gastos de finca subieron ${numFmt.format(costDelta)} %`,
        detail: `Pasaron de ${usdFmt.format(input.previous.farmCostsUsd)} a ${usdFmt.format(economics.farmCostsUsd)}${topCat ? `, concentrados en ${topCat.category} (${usdFmt.format(topCat.amountUsd)})` : ''}.`,
      })
    }
  } else if (costCategories[0] && costCategories[0].sharePct >= 45) {
    const topCat = costCategories[0]
    recommendations.push({
      priority: 'info',
      title: `Mayor gasto en ${topCat.category} (${numFmt.format(topCat.sharePct)} %)`,
      detail: `Sumó ${usdFmt.format(topCat.amountUsd)} de ${usdFmt.format(economics.farmCostsUsd)} gastados en el período.`,
    })
  }

  const highDemandCrop = crops.find((c) => c.received > 0 && (c.marketRotationPct ?? 0) >= 80)
  if (highDemandCrop) {
    recommendations.push({
      priority: 'info',
      title: `Alta demanda de ${highDemandCrop.crop} en Agro Market`,
      detail: `Agro Market ya colocó el ${numFmt.format(highDemandCrop.marketRotationPct ?? 0)} % de lo entregado (${numFmt.format(highDemandCrop.soldInMarket)} de ${numFmt.format(highDemandCrop.received)} ${highDemandCrop.unit}). Conviene priorizar próximos despachos.`,
    })
  }

  if (zoneYields.length > 0) {
    const bestZone = zoneYields[0]
    recommendations.push({
      priority: 'info',
      title: `Mejor rendimiento por hectárea en ${bestZone.zone}`,
      detail: `${bestZone.crop} alcanzó ${numFmt.format(bestZone.yieldPerHa)} ${bestZone.unit}/ha en ${numFmt.format(bestZone.surfaceHa)} ha útiles.`,
    })
  }

  // 8. Alcances y limitaciones transparentes
  const limitations: string[] = [
    'El ingreso de finca se calcula con lo recibido conforme por Agro Market multiplicado por el precio de entrega de Producción (no incluye el margen minorista de reventa de Agro Market).',
    'El balance estimado compara entregas recibidas frente a gastos registrados en el mismo período; no incluye el valor del stock aún disponible en finca ni cuentas por cobrar anteriores.',
  ]
  if (economics.unpricedDeliveryLines > 0) {
    limitations.push(
      `${economics.unpricedDeliveryLines} línea(s) de envío no tenían precio de finca registrado y no pudieron valorizarse en dólares.`,
    )
  }
  if (economics.pricedFieldLossPct !== null && economics.pricedFieldLossPct < 100) {
    limitations.push(
      `El valor económico de pérdidas cubre el ${numFmt.format(economics.pricedFieldLossPct)} % del volumen perdido (solo registros con precio estimado de referencia).`,
    )
  }
  if (hasMultiUnitDirectCost) {
    limitations.push(
      'Para cultivos registrados en más de una unidad de medida dentro del período, el gasto directo se incluye en el total de finca y se omite por fila para evitar duplicarlo entre unidades.',
    )
  }
  if (!input.period.comparable && input.comparisonNote) {
    limitations.push(input.comparisonNote)
  }

  // 9. Resumen corto listo para WhatsApp
  const waLines: string[] = [
    `REPORTE DEL AGRICULTOR - ${input.institution.organizationName}`,
    `Período: ${input.period.label} (${input.period.from} al ${input.period.to})`,
    '',
    `Entregado a Agro Market: ${usdFmt.format(economics.deliveredToMarketUsd)}`,
    `Gastos de finca: ${usdFmt.format(economics.farmCostsUsd)}`,
    `Balance estimado de finca: ${usdFmt.format(economics.estimatedBalanceUsd)}`,
  ]
  if (economics.estimatedFieldLossUsd !== null && economics.estimatedFieldLossUsd > 0) {
    waLines.push(`Impacto estimado por pérdidas en campo: ${usdFmt.format(economics.estimatedFieldLossUsd)}`)
  }
  if (units.length > 0) {
    waLines.push('', 'Producción útil:')
    for (const u of units.slice(0, 4)) {
      waLines.push(`- ${numFmt.format(u.useful)} ${u.unit} (cosechado: ${numFmt.format(u.harvested)}, mermas: ${numFmt.format(u.losses)})`)
    }
  }
  if (recommendations.length > 0) {
    waLines.push('', 'Recomendaciones clave:')
    for (const rec of recommendations.slice(0, 3)) {
      waLines.push(`- ${rec.title}: ${rec.detail}`)
    }
  }

  const hasData =
    input.harvests.length > 0 ||
    input.losses.length > 0 ||
    input.deliveries.length > 0 ||
    input.costs.recordCount > 0

  return {
    version: 1,
    cadence: input.cadence,
    automatic: input.automatic,
    period: input.period,
    institution: input.institution,
    generatedAt: input.generatedAt,
    hasData,
    economics,
    units,
    crops,
    zoneYields,
    topLossCauses,
    costCategories,
    beforeAfter,
    recommendations: recommendations.slice(0, 5),
    limitations,
    whatsappText: waLines.join('\n'),
  }
}
