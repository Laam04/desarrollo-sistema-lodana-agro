import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { allProfiles, profileCatalog } from '@/lib/profile-access'
import { getSystemConfig } from '@/lib/system-config'
import { isProfile } from '@/lib/profile-session'
import { shipmentStatusLabels } from '@/lib/shipment-status'
import { ecuadorToday } from '@/lib/report-periods'
import { isValidIsoDay } from '@/lib/market-data'

export type IntegrityCheck = {
  id: string
  severity: 'ok' | 'warning' | 'error'
  title: string
  description: string
  count: number
  samples: string[]
}

export async function getAdminOverview() {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000)
  const lockoutCutoff = new Date(now.getTime() - 15 * 60 * 1000)
  const today = ecuadorToday(now)
  const currentMonthStart = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`)

  const [
    activeCrops,
    inactiveCrops,
    activeUnits,
    activeZones,
    totalHarvests,
    recentHarvests,
    activeLosses,
    monthCostsAgg,
    shipmentsByStatus,
    activeSales30d,
    cancelledSales30d,
    recoverableTrash,
    activeSessions,
    lockedAttempts,
    disabledProfiles,
    reportsSummary,
    lastAutomationRun,
    recentAudit,
    config,
  ] = await Promise.all([
    prisma.crop.count({ where: { deletedAt: null, active: true } }),
    prisma.crop.count({ where: { deletedAt: null, active: false } }),
    prisma.unit.count({ where: { deletedAt: null, active: true } }),
    prisma.zone.count(),
    prisma.harvest.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    prisma.harvest.count({ where: { deletedAt: null, status: 'ACTIVE', date: { gte: thirtyDaysAgo } } }),
    prisma.loss.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    prisma.cost.aggregate({
      where: { deletedAt: null, date: { gte: currentMonthStart } },
      _sum: { amountUsd: true },
      _count: true,
    }),
    prisma.shipment.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.marketSale.aggregate({
      where: { cancelledAt: null, date: { gte: thirtyDaysAgo } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.marketSale.count({ where: { cancelledAt: { not: null }, date: { gte: thirtyDaysAgo } } }),
    prisma.trashEntry.count({ where: { restoredAt: null, purgeAt: { gt: now } } }),
    prisma.profileSession.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
    prisma.profileLoginAttempt.count({ where: { windowStart: { gt: lockoutCutoff }, attempts: { gte: 10 } } }),
    prisma.profileAccessConfig.count({ where: { enabled: false } }),
    prisma.generatedReport.groupBy({
      by: ['trigger', 'status'],
      _count: { _all: true },
    }),
    prisma.reportAutomationRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: {
        id: true,
        entity: true,
        entityId: true,
        action: true,
        actor: true,
        createdAt: true,
      },
    }),
    getSystemConfig(),
  ])

  const statusCount = (codes: string[]) =>
    shipmentsByStatus
      .filter((row) => codes.includes(row.status))
      .reduce((sum, row) => sum + row._count._all, 0)

  const pendingShipments = statusCount(['IN_TRANSIT', 'ACTIVE'])
  const partialShipments = statusCount(['PARTIALLY_RECEIVED'])
  const receivedShipments = statusCount(['RECEIVED'])
  const diffShipments = statusCount(['RECEIVED_WITH_DIFFERENCES'])
  const cancelledShipments = statusCount(['CANCELLED'])

  let totalReports = 0
  let autoReports = 0
  let manualReports = 0
  let failedReports = 0
  for (const row of reportsSummary) {
    totalReports += row._count._all
    if (row.trigger === 'AUTOMATIC') autoReports += row._count._all
    if (row.trigger === 'MANUAL') manualReports += row._count._all
    if (row.status === 'FAILED') failedReports += row._count._all
  }

  return {
    generatedAt: now.toISOString(),
    ecuadorDate: today,
    institution: config.institution,
    kpis: {
      crops: { active: activeCrops, inactive: inactiveCrops, units: activeUnits, zones: activeZones },
      harvests: { total: totalHarvests, last30Days: recentHarvests, activeLosses },
      costs: {
        currentMonthUsd: monthCostsAgg._sum.amountUsd?.toNumber() ?? 0,
        currentMonthCount: monthCostsAgg._count,
      },
      shipments: {
        pending: pendingShipments,
        partial: partialShipments,
        received: receivedShipments,
        withDifferences: diffShipments,
        cancelled: cancelledShipments,
      },
      market: {
        sales30dUsd: activeSales30d._sum.total?.toNumber() ?? 0,
        sales30dCount: activeSales30d._count,
        cancelled30dCount: cancelledSales30d,
      },
      trash: { recoverable: recoverableTrash },
      security: {
        totalProfiles: allProfiles.length,
        disabledProfiles,
        activeSessions,
        lockedClients: lockedAttempts,
      },
      reports: {
        total: totalReports,
        automatic: autoReports,
        manual: manualReports,
        failed: failedReports,
        autoWeeklyEnabled: config.reporting.autoWeeklyEnabled,
        autoMonthlyEnabled: config.reporting.autoMonthlyEnabled,
        lastRun: lastAutomationRun
          ? {
              id: lastAutomationRun.id,
              source: lastAutomationRun.source,
              status: lastAutomationRun.status,
              createdCount: lastAutomationRun.createdCount,
              failedCount: lastAutomationRun.failedCount,
              startedAt: lastAutomationRun.startedAt.toISOString(),
            }
          : null,
      },
    },
    modules: [
      {
        id: 'lodana',
        name: 'Producción agrícola',
        href: '/lodana',
        status: activeCrops > 0 ? 'Operativo' : 'Sin cultivos activos',
        detail: `${activeCrops} cultivos activos · ${totalHarvests} cosechas`,
      },
      {
        id: 'agro-market',
        name: 'Agro Market',
        href: '/agro-market',
        status: pendingShipments + partialShipments > 0 ? 'Con recepciones pendientes' : 'Al día',
        detail: `${pendingShipments} en tránsito · ${partialShipments} parciales · ${activeSales30d._count} ventas (30d)`,
      },
      {
        id: 'reportes',
        name: 'Reportes automáticos',
        href: '/reportes',
        status: failedReports > 0 ? 'Requiere atención' : 'Operativo',
        detail: `${totalReports} generados (${autoReports} automáticos, ${manualReports} manuales)`,
      },
      {
        id: 'consultas',
        name: 'Consultas públicas',
        href: '/consultas',
        status: 'Publicado',
        detail: 'Series mensuales cerradas con umbral de privacidad (≥3 registros)',
      },
    ],
    recentActivity: recentAudit.map((row) => ({
      ...row,
      actorLabel: row.actor && isProfile(row.actor) ? profileCatalog[row.actor].label : (row.actor ?? 'Sistema'),
      createdAt: row.createdAt.toISOString(),
    })),
  }
}

export async function getAdminOperations() {
  const now = new Date()
  const staleCutoff = new Date(now.getTime() - 14 * 86_400_000)

  const [
    pendingShipmentsRaw,
    diffShipmentsRaw,
    cancelledShipmentsRaw,
    cancelledSalesRaw,
    trashEntriesRaw,
    overAllocatedHarvests,
    overSoldReceptions,
    overReceivedShipments,
    invalidCostAllocations,
    unclassifiedLossesCount,
    staleShipments,
  ] = await Promise.all([
    prisma.shipment.findMany({
      where: { deletedAt: null, status: { in: ['IN_TRANSIT', 'ACTIVE', 'PARTIALLY_RECEIVED'] } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 40,
      include: {
        items: {
          where: { deletedAt: null },
          include: {
            crop: { select: { name: true } },
            variety: { select: { name: true } },
            unit: { select: { name: true } },
            receptionItems: {
              where: { deletedAt: null, reception: { deletedAt: null } },
              select: { receivedQuantity: true },
            },
          },
        },
        receptions: {
          where: { deletedAt: null },
          select: { id: true, receiptNumber: true, receivedAt: true },
          orderBy: { receivedAt: 'desc' },
        },
      },
    }),
    prisma.shipment.findMany({
      where: { deletedAt: null, status: 'RECEIVED_WITH_DIFFERENCES' },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 40,
      include: {
        items: {
          where: { deletedAt: null },
          include: {
            crop: { select: { name: true } },
            variety: { select: { name: true } },
            unit: { select: { name: true } },
            receptionItems: {
              where: { deletedAt: null, reception: { deletedAt: null } },
              select: { receivedQuantity: true },
            },
          },
        },
      },
    }),
    prisma.shipment.findMany({
      where: { deletedAt: null, status: 'CANCELLED' },
      orderBy: { updatedAt: 'desc' },
      take: 25,
      select: { id: true, code: true, date: true, notes: true, createdBy: true, updatedAt: true },
    }),
    prisma.marketSale.findMany({
      where: { cancelledAt: { not: null } },
      orderBy: { cancelledAt: 'desc' },
      take: 25,
      include: {
        receptionItem: {
          select: {
            reception: { select: { receiptNumber: true } },
            shipmentItem: { select: { crop: { select: { name: true } }, unit: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.trashEntry.findMany({
      where: { restoredAt: null, purgeAt: { gt: now } },
      orderBy: { deletedAt: 'desc' },
      take: 40,
    }),
    // Integrity check 1: Harvests where affecting losses + shipment allocations exceed harvested quantity
    prisma.$queryRaw<{ id: string; crop: string; excess: Prisma.Decimal }[]>`
      SELECT h.id, c.name AS crop,
        (COALESCE(l.lost, 0) + COALESCE(a.allocated, 0) - h.quantity) AS excess
      FROM "Harvest" h
      JOIN "Crop" c ON c.id = h."cropId"
      LEFT JOIN (
        SELECT "harvestId", SUM(quantity) AS lost
        FROM "Loss"
        WHERE "deletedAt" IS NULL AND status = 'ACTIVE' AND "affectsHarvest" IS TRUE
        GROUP BY "harvestId"
      ) l ON l."harvestId" = h.id
      LEFT JOIN (
        SELECT sa."harvestId", SUM(sa.quantity) AS allocated
        FROM "ShipmentAllocation" sa
        JOIN "ShipmentItem" si ON si.id = sa."shipmentItemId"
        JOIN "Shipment" s ON s.id = si."shipmentId"
        WHERE sa."deletedAt" IS NULL AND si."deletedAt" IS NULL AND s."deletedAt" IS NULL AND s.status <> 'CANCELLED'
        GROUP BY sa."harvestId"
      ) a ON a."harvestId" = h.id
      WHERE h."deletedAt" IS NULL AND h.status = 'ACTIVE'
        AND (COALESCE(l.lost, 0) + COALESCE(a.allocated, 0)) > h.quantity
      LIMIT 10
    `,
    // Integrity check 2: Reception items sold beyond received quantity
    prisma.$queryRaw<{ id: string; receiptNumber: number; excess: Prisma.Decimal }[]>`
      SELECT ri.id, r."receiptNumber", (COALESCE(v.sold, 0) - ri."receivedQuantity") AS excess
      FROM "ReceptionItem" ri
      JOIN "Reception" r ON r.id = ri."receptionId"
      LEFT JOIN (
        SELECT "receptionItemId", SUM(quantity) AS sold
        FROM "MarketSale"
        WHERE "cancelledAt" IS NULL
        GROUP BY "receptionItemId"
      ) v ON v."receptionItemId" = ri.id
      WHERE ri."deletedAt" IS NULL AND r."deletedAt" IS NULL
        AND COALESCE(v.sold, 0) > ri."receivedQuantity"
      LIMIT 10
    `,
    // Integrity check 3: Shipment items received beyond shipped quantity
    prisma.$queryRaw<{ code: string; crop: string; excess: Prisma.Decimal }[]>`
      SELECT s.code, c.name AS crop, (COALESCE(r.received, 0) - si.quantity) AS excess
      FROM "ShipmentItem" si
      JOIN "Shipment" s ON s.id = si."shipmentId"
      JOIN "Crop" c ON c.id = si."cropId"
      LEFT JOIN (
        SELECT ri."shipmentItemId", SUM(ri."receivedQuantity") AS received
        FROM "ReceptionItem" ri
        JOIN "Reception" rec ON rec.id = ri."receptionId"
        WHERE ri."deletedAt" IS NULL AND rec."deletedAt" IS NULL
        GROUP BY ri."shipmentItemId"
      ) r ON r."shipmentItemId" = si.id
      WHERE si."deletedAt" IS NULL AND s."deletedAt" IS NULL AND s.status <> 'CANCELLED'
        AND COALESCE(r.received, 0) > si.quantity
      LIMIT 10
    `,
    // Integrity check 4: Cost allocation consistency
    prisma.$queryRaw<{ id: string; description: string; issue: string }[]>`
      SELECT c.id, c.description,
        CASE
          WHEN c."applicationType" = 'GENERAL' AND COUNT(ca.id) > 0 THEN 'Costo general con asignaciones activas'
          WHEN c."applicationType" = 'CROP' AND COUNT(ca.id) = 0 THEN 'Costo por cultivo sin asignaciones'
          WHEN c."applicationType" = 'CROP' AND COUNT(ca.percent) = COUNT(ca.id) AND ABS(COALESCE(SUM(ca.percent), 0) - 100) > 0.01 THEN 'Porcentajes no suman 100%'
          WHEN c."applicationType" = 'CROP' AND COUNT(ca."amountUsd") = COUNT(ca.id) AND ABS(COALESCE(SUM(ca."amountUsd"), 0) - c."amountUsd") > 0.01 THEN 'Montos asignados no coinciden con total'
          ELSE NULL
        END AS issue
      FROM "Cost" c
      LEFT JOIN "CostAllocation" ca ON ca."costId" = c.id AND ca."deletedAt" IS NULL
      WHERE c."deletedAt" IS NULL
      GROUP BY c.id, c.description, c."applicationType", c."amountUsd"
      HAVING (
        (c."applicationType" = 'GENERAL' AND COUNT(ca.id) > 0) OR
        (c."applicationType" = 'CROP' AND COUNT(ca.id) = 0) OR
        (c."applicationType" = 'CROP' AND COUNT(ca.percent) = COUNT(ca.id) AND ABS(COALESCE(SUM(ca.percent), 0) - 100) > 0.01) OR
        (c."applicationType" = 'CROP' AND COUNT(ca."amountUsd") = COUNT(ca.id) AND ABS(COALESCE(SUM(ca."amountUsd"), 0) - c."amountUsd") > 0.01)
      )
      LIMIT 10
    `,
    prisma.loss.count({ where: { deletedAt: null, status: 'ACTIVE', affectsHarvest: null } }),
    prisma.shipment.findMany({
      where: {
        deletedAt: null,
        status: { in: ['IN_TRANSIT', 'ACTIVE', 'PARTIALLY_RECEIVED'] },
        date: { lt: staleCutoff },
      },
      select: { code: true, date: true, status: true },
      orderBy: { date: 'asc' },
      take: 10,
    }),
  ])

  const formatShipment = (shipment: typeof pendingShipmentsRaw[number]) => ({
    id: shipment.id,
    code: shipment.code,
    date: shipment.date.toISOString().slice(0, 10),
    status: shipment.status,
    statusLabel: shipmentStatusLabels[shipment.status] ?? shipment.status,
    createdBy: shipment.createdBy,
    notes: shipment.notes,
    receiptCount: 'receptions' in shipment ? shipment.receptions.length : undefined,
    items: shipment.items.map((item) => {
      const sent = item.quantity.toNumber()
      const received = item.receptionItems.reduce((s, r) => s + r.receivedQuantity.toNumber(), 0)
      return {
        id: item.id,
        crop: item.crop.name,
        variety: item.variety?.name ?? null,
        unit: item.unit.name,
        sent,
        received,
        difference: Math.max(0, Math.round((sent - received) * 100) / 100),
      }
    }),
  })

  const integrityChecks: IntegrityCheck[] = [
    {
      id: 'harvest-stock',
      severity: overAllocatedHarvests.length > 0 ? 'error' : 'ok',
      title: 'Consistencia de saldo en cosechas',
      description: 'Verifica que mermas aplicables más despachos asignados no excedan la cantidad cosechada.',
      count: overAllocatedHarvests.length,
      samples: overAllocatedHarvests.map((row) => `${row.crop} (${row.id.slice(-6)}): exceso ${row.excess.toFixed(2)}`),
    },
    {
      id: 'reception-sales-stock',
      severity: overSoldReceptions.length > 0 ? 'error' : 'ok',
      title: 'Consistencia de existencias en Agro Market',
      description: 'Verifica que las ventas activas por recibo no superen la cantidad recibida.',
      count: overSoldReceptions.length,
      samples: overSoldReceptions.map((row) => `REC-${String(row.receiptNumber).padStart(3, '0')}: exceso ${row.excess.toFixed(2)}`),
    },
    {
      id: 'shipment-reception-qty',
      severity: overReceivedShipments.length > 0 ? 'error' : 'ok',
      title: 'Consistencia entre despachos y recepciones',
      description: 'Verifica que la suma recibida por línea de despacho no supere la cantidad despachada.',
      count: overReceivedShipments.length,
      samples: overReceivedShipments.map((row) => `${row.code} · ${row.crop}: exceso ${row.excess.toFixed(2)}`),
    },
    {
      id: 'cost-allocations',
      severity: invalidCostAllocations.length > 0 ? 'error' : 'ok',
      title: 'Integridad de asignaciones de costos',
      description: 'Verifica que costos generales no tengan cultivos asignados y que costos por cultivo cuadren al 100%.',
      count: invalidCostAllocations.length,
      samples: invalidCostAllocations.map((row) => `${row.description}: ${row.issue}`),
    },
    {
      id: 'unclassified-losses',
      severity: unclassifiedLossesCount > 0 ? 'warning' : 'ok',
      title: 'Mermas sin clasificación de descuento',
      description: 'Identifica mermas históricas sin definir si afectan existencias de cosecha.',
      count: unclassifiedLossesCount,
      samples: unclassifiedLossesCount > 0 ? [`${unclassifiedLossesCount} registros sin clasificar`] : [],
    },
    {
      id: 'stale-shipments',
      severity: staleShipments.length > 0 ? 'warning' : 'ok',
      title: 'Despachos pendientes mayores a 14 días',
      description: 'Envíos en tránsito o con recepción parcial sin cerrar tras dos semanas.',
      count: staleShipments.length,
      samples: staleShipments.map((s) => `${s.code} (${s.date.toISOString().slice(0, 10)})`),
    },
  ]

  return {
    pendingShipments: pendingShipmentsRaw.map(formatShipment),
    differenceShipments: diffShipmentsRaw.map((shipment) => ({
      id: shipment.id,
      code: shipment.code,
      date: shipment.date.toISOString().slice(0, 10),
      status: shipment.status,
      statusLabel: shipmentStatusLabels[shipment.status] ?? shipment.status,
      notes: shipment.notes,
      items: shipment.items.map((item) => {
        const sent = item.quantity.toNumber()
        const received = item.receptionItems.reduce((s, r) => s + r.receivedQuantity.toNumber(), 0)
        return {
          id: item.id,
          crop: item.crop.name,
          variety: item.variety?.name ?? null,
          unit: item.unit.name,
          sent,
          received,
          difference: Math.max(0, Math.round((sent - received) * 100) / 100),
        }
      }),
    })),
    cancelledShipments: cancelledShipmentsRaw.map((row) => ({
      ...row,
      date: row.date.toISOString().slice(0, 10),
      updatedAt: row.updatedAt.toISOString(),
    })),
    cancelledSales: cancelledSalesRaw.map((row) => ({
      id: row.id,
      date: row.date.toISOString().slice(0, 10),
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      receiptNumber: row.receptionItem.reception.receiptNumber,
      crop: row.receptionItem.shipmentItem.crop.name,
      unit: row.receptionItem.shipmentItem.unit.name,
      quantity: row.quantity.toNumber(),
      totalUsd: row.total.toNumber(),
      createdBy: row.createdBy,
    })),
    trashEntries: trashEntriesRaw.map((row) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      groupId: row.groupId,
      deletedBy: row.deletedBy,
      deletedAt: row.deletedAt.toISOString(),
      purgeAt: row.purgeAt.toISOString(),
    })),
    integrityChecks,
  }
}

export async function getAdminAuditLogs(params: URLSearchParams) {
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(10, Number.parseInt(params.get('pageSize') ?? '30', 10) || 30))
  const entity = params.get('entity')?.trim() || undefined
  const action = params.get('action')?.trim() || undefined
  const actor = params.get('actor')?.trim() || undefined
  const q = params.get('q')?.trim() || undefined
  const from = params.get('from')?.trim() || undefined
  const to = params.get('to')?.trim() || undefined

  const where: Prisma.AuditLogWhereInput = {}
  if (entity) where.entity = entity
  if (action) where.action = action
  if (actor) where.actor = actor
  if (from && isValidIsoDay(from)) {
    where.createdAt = { ...(where.createdAt as Prisma.DateTimeFilter | undefined), gte: new Date(`${from}T05:00:00.000Z`) }
  }
  if (to && isValidIsoDay(to)) {
    const end = new Date(`${to}T05:00:00.000Z`)
    end.setUTCDate(end.getUTCDate() + 1)
    where.createdAt = { ...(where.createdAt as Prisma.DateTimeFilter | undefined), lt: end }
  }
  if (q) {
    where.OR = [
      { entity: { contains: q, mode: 'insensitive' } },
      { entityId: { contains: q, mode: 'insensitive' } },
      { action: { contains: q, mode: 'insensitive' } },
      { actor: { contains: q, mode: 'insensitive' } },
    ]
  }

  const [rows, total, distinctEntities, distinctActions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
      skip: (page - 1) * pageSize,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } }),
    prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
  ])

  const hasNext = rows.length > pageSize
  const pageRows = hasNext ? rows.slice(0, pageSize) : rows

  return {
    page,
    pageSize,
    total,
    hasNext,
    entities: distinctEntities.map((r) => r.entity),
    actions: distinctActions.map((r) => r.action),
    rows: pageRows.map((row) => ({
      id: row.id,
      entity: row.entity,
      entityId: row.entityId,
      action: row.action,
      actor: row.actor ?? 'system',
      actorLabel: row.actor && isProfile(row.actor) ? profileCatalog[row.actor].label : (row.actor ?? 'Sistema'),
      beforeJson: row.beforeJson,
      afterJson: row.afterJson,
      createdAt: row.createdAt.toISOString(),
    })),
  }
}
