const numFmt = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 })
const usdFmt = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' })

export function safePercentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export function formatPct(value: number | null): string {
  if (value === null) return 'No comparable'
  const sign = value > 0 ? '+' : ''
  return `${sign}${numFmt.format(value)}%`
}

export type UnitMetricSummary = {
  unit: string
  harvested: number
  useful: number
  losses: number
  affectingLosses: number
  statisticalLosses: number
  unclassifiedLosses: number
  harvestCount: number
  previousHarvested?: number | null
  previousUseful?: number | null
  previousLosses?: number | null
}

export type CropUnitBreakdown = {
  crop: string
  unit: string
  harvested: number
  useful: number
  losses: number
  harvestCount: number
  previousHarvested?: number | null
}

export type CostSummaryForInsights = {
  totalUsd: number
  directUsd: number
  generalUsd: number
  recordCount: number
  previousTotalUsd?: number | null
  topCategory?: { name: string; amountUsd: number } | null
}

export type ShipmentUnitSummary = {
  unit: string
  shipped: number
  received: number
  difference: number
}

export type ShipmentCountsForInsights = {
  total: number
  pending: number
  partial: number
  received: number
  withDifferences: number
  cancelled: number
}

export type MarketSummaryForInsights = {
  totalSalesUsd: number
  salesCount: number
  cancelledCount: number
  grossProfitUsd: number | null
  missingCostCount: number
  previousTotalSalesUsd?: number | null
  byUnit: { unit: string; quantity: number; totalUsd: number }[]
  topProduct?: { label: string; totalUsd: number } | null
}

export type SeasonalityInsightInput = {
  crop: string
  unit: string
  completeYears: number
  higherMonths: number[]
  lowerMonths: number[]
  forecastAvailable: boolean
  consecutiveMonths: number
  forecastTrend: number | null
}

export type DeterministicInsights = {
  observations: string[]
  limitations: string[]
}

const monthNames = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function buildDeterministicInsights(input: {
  periodLabel: string
  comparable: boolean
  comparisonReason?: string | null
  productionByUnit?: UnitMetricSummary[]
  cropBreakdown?: CropUnitBreakdown[]
  costs?: CostSummaryForInsights
  shipmentsByUnit?: ShipmentUnitSummary[]
  shipmentCounts?: ShipmentCountsForInsights
  market?: MarketSummaryForInsights
  analyticsSeries?: SeasonalityInsightInput[]
  hasMultipleUnits?: boolean
}): DeterministicInsights {
  const observations: string[] = []
  const limitations: string[] = []

  const units = input.productionByUnit ?? []
  if (input.productionByUnit) {
    if (units.length === 0) {
      observations.push(`No se registraron cosechas ni mermas activas durante ${input.periodLabel}.`)
    } else {
      if (units.length > 1 || input.hasMultipleUnits) {
        limitations.push(
          'Los volúmenes físicos se presentan desagregados por unidad de medida; no se suman cantidades expresadas en unidades incompatibles.',
        )
      }

      for (const u of units) {
        const lossRatio = u.harvested > 0 ? Math.round((u.affectingLosses / u.harvested) * 1000) / 10 : null
        const baseText = `En ${u.unit}, se registraron ${numFmt.format(u.harvested)} ${u.unit} cosechados (${u.harvestCount} cosechas) y ${numFmt.format(u.useful)} ${u.unit} de producción útil`
        const lossText = u.losses > 0
          ? `, junto con ${numFmt.format(u.losses)} ${u.unit} en mermas registradas${lossRatio !== null ? ` (${numFmt.format(lossRatio)}% descontado de la cosecha de origen)` : ''}.`
          : ', sin mermas registradas en el período.'
        observations.push(baseText + lossText)

        if (u.unclassifiedLosses > 0) {
          limitations.push(
            `En ${u.unit} existen ${numFmt.format(u.unclassifiedLosses)} ${u.unit} de mermas sin clasificar respecto a si descuentan de la cosecha de origen.`,
          )
        }

        if (input.comparable && u.previousHarvested !== undefined) {
          const pct = safePercentChange(u.harvested, u.previousHarvested)
          if (pct !== null) {
            const dir = pct > 0 ? 'un incremento' : pct < 0 ? 'una disminución' : 'estabilidad'
            observations.push(
              `La producción cosechada en ${u.unit} mostró ${dir} de ${formatPct(pct)} frente al período anterior comparable (${numFmt.format(u.previousHarvested ?? 0)} ${u.unit}). Esta variación es descriptiva y no permite atribuir causas sin evidencia adicional.`,
            )
          } else if (u.previousHarvested === null || u.previousHarvested === 0) {
            limitations.push(
              `No se calculó variación porcentual de producción en ${u.unit} porque el período anterior comparable no registra volumen positivo.`,
            )
          }
        }
      }

      // Cultivo con mayor volumen por cada unidad (nunca mezclando unidades)
      if (input.cropBreakdown && input.cropBreakdown.length > 0) {
        const byUnit = new Map<string, CropUnitBreakdown[]>()
        for (const row of input.cropBreakdown) {
          const list = byUnit.get(row.unit) ?? []
          list.push(row)
          byUnit.set(row.unit, list)
        }
        for (const [unit, rows] of byUnit) {
          const sorted = rows.filter((r) => r.harvested > 0).toSorted((a, b) => b.harvested - a.harvested)
          if (sorted.length > 1) {
            const top = sorted[0]
            const unitTotal = sorted.reduce((s, r) => s + r.harvested, 0)
            const share = unitTotal > 0 ? Math.round((top.harvested / unitTotal) * 1000) / 10 : null
            observations.push(
              `Dentro de la unidad ${unit}, ${top.crop} concentró el mayor volumen cosechado (${numFmt.format(top.harvested)} ${unit}${share !== null ? `, ${numFmt.format(share)}% de esa unidad` : ''}).`,
            )
          }
        }
      }
    }
  }

  if (input.costs) {
    if (input.costs.recordCount === 0) {
      observations.push(`No se registraron costos de producción durante ${input.periodLabel}.`)
    } else {
      const pctGeneral = input.costs.totalUsd > 0
        ? Math.round((input.costs.generalUsd / input.costs.totalUsd) * 1000) / 10
        : 0
      observations.push(
        `Los costos de producción registrados sumaron ${usdFmt.format(input.costs.totalUsd)} (${input.costs.recordCount} registros): ${usdFmt.format(input.costs.directUsd)} asignados a cultivos y ${usdFmt.format(input.costs.generalUsd)} en gastos generales (${numFmt.format(pctGeneral)}%).`,
      )
      if (input.costs.topCategory) {
        observations.push(
          `La categoría de costo con mayor monto fue ${input.costs.topCategory.name} con ${usdFmt.format(input.costs.topCategory.amountUsd)}.`,
        )
      }
      if (input.comparable && input.costs.previousTotalUsd !== undefined) {
        const pct = safePercentChange(input.costs.totalUsd, input.costs.previousTotalUsd)
        if (pct !== null) {
          observations.push(
            `El total de costos registrados presentó una variación de ${formatPct(pct)} frente al período anterior comparable (${usdFmt.format(input.costs.previousTotalUsd ?? 0)}).`,
          )
        }
      }
      if (input.costs.generalUsd > 0) {
        limitations.push(
          'Los costos unitarios por cultivo consideran únicamente los costos asignados directamente a cada cultivo y excluyen los gastos generales no prorrateados.',
        )
      }
    }
  }

  if (input.shipmentCounts) {
    const sc = input.shipmentCounts
    if (sc.total === 0) {
      observations.push(`No se registraron despachos hacia Agro Market en ${input.periodLabel}.`)
    } else {
      observations.push(
        `Se registraron ${sc.total} despachos activos hacia Agro Market: ${sc.received} recibidos completos, ${sc.partial} con recepción parcial, ${sc.pending} en tránsito y ${sc.withDifferences} cerrados con diferencias${sc.cancelled > 0 ? ` (además de ${sc.cancelled} cancelados)` : ''}.`,
      )
      if (sc.pending > 0 || sc.partial > 0) {
        observations.push(
          `Existen ${sc.pending + sc.partial} despachos con saldo pendiente de recepción en Agro Market al corte del reporte.`,
        )
      }
    }
  }

  if (input.shipmentsByUnit) {
    for (const s of input.shipmentsByUnit) {
      if (s.difference > 0) {
        observations.push(
          `En ${s.unit}, se despacharon ${numFmt.format(s.shipped)} ${s.unit} y se recibieron ${numFmt.format(s.received)} ${s.unit}, con una diferencia acumulada de ${numFmt.format(s.difference)} ${s.unit} entre envío y recepción.`,
        )
      }
    }
  }

  if (input.market) {
    const m = input.market
    if (m.salesCount === 0) {
      observations.push(`No se registraron ventas activas en Agro Market durante ${input.periodLabel}.`)
    } else {
      const marginText = m.grossProfitUsd !== null
        ? ` y una ganancia bruta estimada de ${usdFmt.format(m.grossProfitUsd)}`
        : ''
      observations.push(
        `Agro Market registró ${m.salesCount} ventas activas por un total de ${usdFmt.format(m.totalSalesUsd)}${marginText}${m.cancelledCount > 0 ? ` (${m.cancelledCount} ventas anuladas excluidas del total)` : ''}.`,
      )
      if (m.topProduct) {
        observations.push(
          `El producto con mayor facturación en Agro Market fue ${m.topProduct.label} (${usdFmt.format(m.topProduct.totalUsd)}).`,
        )
      }
      if (input.comparable && m.previousTotalSalesUsd !== undefined) {
        const pct = safePercentChange(m.totalSalesUsd, m.previousTotalSalesUsd)
        if (pct !== null) {
          observations.push(
            `El monto vendido en Agro Market varió en ${formatPct(pct)} respecto al período anterior comparable (${usdFmt.format(m.previousTotalSalesUsd ?? 0)}).`,
          )
        }
      }
      limitations.push(
        'La ganancia bruta estimada utiliza el precio de referencia de Producción como costo base y no equivale a utilidad neta ni descuenta gastos operativos de comercialización.',
      )
      if (m.missingCostCount > 0) {
        limitations.push(
          `${m.missingCostCount} ventas del período no cuentan con precio de referencia de Producción registrado, por lo que quedan excluidas del cálculo de ganancia bruta estimada.`,
        )
      }
    }
  }

  if (input.analyticsSeries && input.analyticsSeries.length > 0) {
    const withSeasonality = input.analyticsSeries.filter((s) => s.completeYears >= 2 && (s.higherMonths.length > 0 || s.lowerMonths.length > 0))
    const withForecast = input.analyticsSeries.filter((s) => s.forecastAvailable)

    for (const s of withSeasonality.slice(0, 3)) {
      const high = s.higherMonths.map((m) => monthNames[m - 1]).join(', ')
      const low = s.lowerMonths.map((m) => monthNames[m - 1]).join(', ')
      observations.push(
        `Estacionalidad observada en ${s.crop} (${s.unit}, ${s.completeYears} años calendario completos):${high ? ` meses históricamente altos en ${high}` : ''}${high && low ? ';' : ''}${low ? ` meses bajos en ${low}` : ''}.`,
      )
    }

    for (const s of withForecast.slice(0, 3)) {
      if (s.forecastTrend !== null) {
        const trendLabel = s.forecastTrend > 0
          ? `tendencia interanual positiva (+${numFmt.format(s.forecastTrend)} ${s.unit}/año)`
          : s.forecastTrend < 0
            ? `tendencia interanual negativa (${numFmt.format(s.forecastTrend)} ${s.unit}/año)`
            : 'tendencia interanual estable'
        observations.push(
          `Previsión habilitada para ${s.crop} (${s.unit}, ${s.consecutiveMonths} meses cerrados consecutivos) con ${trendLabel}.`,
        )
      }
    }

    if (withSeasonality.length === 0) {
      limitations.push(
        'No se identificaron patrones estacionales consolidados: se requieren al menos 2 años calendario completos con consistencia interanual por cultivo y unidad.',
      )
    }
    if (withForecast.length === 0) {
      limitations.push(
        'No se emitieron previsiones estadísticas: el modelo exige 24 meses calendario cerrados consecutivos con registros por cultivo y unidad.',
      )
    }
  }

  if (!input.comparable && input.comparisonReason) {
    limitations.push(input.comparisonReason)
  }

  limitations.push(
    'El análisis de impacto presentado es descriptivo y se basa exclusivamente en registros históricos del sistema; no constituye una evaluación causal.',
  )

  return {
    observations: [...new Set(observations)],
    limitations: [...new Set(limitations)],
  }
}
