import crypto from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'

try {
  process.loadEnvFile(new URL('../.env', import.meta.url))
} catch {
  // Usa variables de entorno ya cargadas (ej. CI o Neon en despliegue)
}

const prisma = new PrismaClient()
const shouldReset = process.argv.includes('--reset')

function shiftMonth(month, offset) {
  const [year, num] = month.split('-').map(Number)
  return new Date(Date.UTC(year, num - 1 + offset, 1)).toISOString().slice(0, 7)
}

function utcDate(isoDay) {
  return new Date(`${isoDay}T00:00:00.000Z`)
}

function ecTimestamp(isoDay, hh = 15, mm = 0) {
  return new Date(`${isoDay}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00.000Z`)
}

function addDays(isoDay, delta) {
  const d = new Date(`${isoDay}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

function dec(val) {
  return new Prisma.Decimal(Number(val).toFixed(2))
}

function dec4(val) {
  return new Prisma.Decimal(Number(val).toFixed(4))
}

async function resetDatabase() {
  await prisma.$transaction([
    prisma.generatedReport.deleteMany(),
    prisma.reportAutomationRun.deleteMany(),
    prisma.systemSetting.deleteMany(),
    prisma.profileAccessConfig.deleteMany(),
    prisma.marketSale.deleteMany(),
    prisma.receptionItem.deleteMany(),
    prisma.reception.deleteMany(),
    prisma.shipmentAllocation.deleteMany(),
    prisma.shipmentItem.deleteMany(),
    prisma.shipment.deleteMany(),
    prisma.costAllocation.deleteMany(),
    prisma.cost.deleteMany(),
    prisma.costSubcategory.deleteMany(),
    prisma.costCategory.deleteMany(),
    prisma.loss.deleteMany(),
    prisma.lossReason.deleteMany(),
    prisma.harvest.deleteMany(),
    prisma.productionArea.deleteMany(),
    prisma.variety.deleteMany(),
    prisma.crop.deleteMany(),
    prisma.zone.deleteMany(),
    prisma.unit.deleteMany(),
    prisma.trashEntry.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.profileSession.deleteMany(),
    prisma.profileLoginAttempt.deleteMany(),
  ])
  await prisma.$executeRawUnsafe('ALTER SEQUENCE "Reception_receiptNumber_seq" RESTART WITH 1')
}

async function main() {
  if (shouldReset) {
    console.log('Reiniciando base de datos para simulación completa...')
    await resetDatabase()
  } else {
    const existingCrops = await prisma.crop.count()
    if (existingCrops > 0) {
      console.log(`La base ya contiene ${existingCrops} cultivos. Usa --reset para regenerar los datos de simulación.`)
      return
    }
  }

  // 1. Configuración institucional y de reportes persistente
  await prisma.systemSetting.createMany({
    data: [
      {
        key: 'institution',
        value: {
          organizationName: 'Lodana Agro',
          universityName: 'Universidad Laica Eloy Alfaro de Manabí (ULEAM)',
          farmName: 'Finca Experimental Lodana',
          marketName: 'Agro Market',
          location: 'Lodana, Santa Ana · Manabí, Ecuador',
        },
        updatedBy: 'admin',
      },
      {
        key: 'reporting',
        value: {
          autoWeeklyEnabled: true,
          autoMonthlyEnabled: true,
          maxBackfillWeeks: 4,
          maxBackfillMonths: 6,
          includeEmptyAutoPeriods: false,
          timezone: 'America/Guayaquil',
        },
        updatedBy: 'admin',
      },
    ],
  })

  // 2. Unidades de medida
  const unitNames = ['racimos', 'quintales', 'cajas', 'kilogramos', 'sacos', 'unidades']
  const units = {}
  for (const name of unitNames) {
    units[name] = await prisma.unit.create({ data: { name } })
  }

  // 3. Zonas compartidas
  const zoneDefs = [
    { name: 'Zona Norte', normalizedName: 'zona norte' },
    { name: 'Zona Sur', normalizedName: 'zona sur' },
    { name: 'Lote Central', normalizedName: 'lote central' },
    { name: 'Invernadero 1', normalizedName: 'invernadero 1' },
    { name: 'Invernadero 2', normalizedName: 'invernadero 2' },
    { name: 'Parcela Experimental', normalizedName: 'parcela experimental' },
  ]
  const zones = {}
  for (const def of zoneDefs) {
    zones[def.name] = await prisma.zone.create({ data: def })
  }

  // 4. Cultivos, variedades y áreas de producción (7 activos + 1 inactivo histórico)
  const banano = await prisma.crop.create({
    data: {
      name: 'Banano',
      normalizedName: 'banano',
      unitId: units.racimos.id,
      hasVarieties: true,
      hasProductionAreas: true,
      tracksSurface: true,
      varieties: {
        create: [
          { name: 'Cavendish', normalizedName: 'cavendish' },
          { name: 'Orito', normalizedName: 'orito' },
          { name: 'Seda', normalizedName: 'seda' },
        ],
      },
      productionAreas: {
        create: [
          {
            name: 'Zona Norte',
            normalizedName: 'zona norte',
            type: 'ZONE',
            zoneId: zones['Zona Norte'].id,
            surface: dec(4.5),
            surfaceUnit: 'ha',
            notes: 'Plantación tecnificada con riego por microaspersión',
          },
          {
            name: 'Zona Sur',
            normalizedName: 'zona sur',
            type: 'ZONE',
            zoneId: zones['Zona Sur'].id,
            surface: dec(3.2),
            surfaceUnit: 'ha',
            notes: 'Lote de renovación productiva',
          },
        ],
      },
    },
    include: { varieties: true, productionAreas: true },
  })

  const cacao = await prisma.crop.create({
    data: {
      name: 'Cacao',
      normalizedName: 'cacao',
      unitId: units.quintales.id,
      hasVarieties: true,
      hasProductionAreas: true,
      tracksSurface: true,
      varieties: {
        create: [
          { name: 'CCN-51', normalizedName: 'ccn-51' },
          { name: 'Nacional Arriba', normalizedName: 'nacional arriba' },
        ],
      },
      productionAreas: {
        create: [
          {
            name: 'Zona Norte',
            normalizedName: 'zona norte',
            type: 'ZONE',
            zoneId: zones['Zona Norte'].id,
            surface: dec(6.0),
            surfaceUnit: 'ha',
            notes: 'Sistema agroforestal con sombra regulada',
          },
          {
            name: 'Lote Central',
            normalizedName: 'lote central',
            type: 'LOT',
            zoneId: zones['Lote Central'].id,
            surface: dec(3.8),
            surfaceUnit: 'ha',
            notes: 'Clones de alta productividad ULEAM',
          },
        ],
      },
    },
    include: { varieties: true, productionAreas: true },
  })

  const tomate = await prisma.crop.create({
    data: {
      name: 'Tomate',
      normalizedName: 'tomate',
      unitId: units.cajas.id,
      hasVarieties: true,
      hasProductionAreas: true,
      tracksSurface: true,
      varieties: {
        create: [
          { name: 'Riñón', normalizedName: 'rinon' },
          { name: 'Cherry', normalizedName: 'cherry' },
        ],
      },
      productionAreas: {
        create: [
          {
            name: 'Invernadero 1',
            normalizedName: 'invernadero 1',
            type: 'ZONE',
            zoneId: zones['Invernadero 1'].id,
            surface: dec(0.45),
            surfaceUnit: 'ha',
            notes: 'Cultivo protegido con fertirriego',
          },
          {
            name: 'Invernadero 2',
            normalizedName: 'invernadero 2',
            type: 'ZONE',
            zoneId: zones['Invernadero 2'].id,
            surface: dec(0.35),
            surfaceUnit: 'ha',
            notes: 'Módulo hortícola experimental',
          },
        ],
      },
    },
    include: { varieties: true, productionAreas: true },
  })

  const limon = await prisma.crop.create({
    data: {
      name: 'Limón Tahití',
      normalizedName: 'limon tahiti',
      unitId: units.sacos.id,
      hasVarieties: false,
      hasProductionAreas: true,
      tracksSurface: true,
      productionAreas: {
        create: [
          {
            name: 'Lote Central',
            normalizedName: 'lote central',
            type: 'LOT',
            zoneId: zones['Lote Central'].id,
            surface: dec(2.2),
            surfaceUnit: 'ha',
          },
          {
            name: 'Parcela Experimental',
            normalizedName: 'parcela experimental',
            type: 'LOT',
            zoneId: zones['Parcela Experimental'].id,
            surface: dec(1.4),
            surfaceUnit: 'ha',
          },
        ],
      },
    },
    include: { varieties: true, productionAreas: true },
  })

  const pimiento = await prisma.crop.create({
    data: {
      name: 'Pimiento',
      normalizedName: 'pimiento',
      unitId: units.kilogramos.id,
      hasVarieties: true,
      hasProductionAreas: true,
      tracksSurface: false,
      varieties: {
        create: [
          { name: 'Nathalie', normalizedName: 'nathalie' },
          { name: 'Quetzal', normalizedName: 'quetzal' },
        ],
      },
      productionAreas: {
        create: [
          {
            name: 'Invernadero 2',
            normalizedName: 'invernadero 2',
            type: 'ZONE',
            zoneId: zones['Invernadero 2'].id,
            surface: dec(0.25),
            surfaceUnit: 'ha',
          },
        ],
      },
    },
    include: { varieties: true, productionAreas: true },
  })

  const yuca = await prisma.crop.create({
    data: {
      name: 'Yuca',
      normalizedName: 'yuca',
      unitId: units.quintales.id,
      hasVarieties: false,
      hasProductionAreas: true,
      tracksSurface: true,
      productionAreas: {
        create: [
          {
            name: 'Parcela Experimental',
            normalizedName: 'parcela experimental',
            type: 'LOT',
            zoneId: zones['Parcela Experimental'].id,
            surface: dec(1.8),
            surfaceUnit: 'ha',
          },
        ],
      },
    },
    include: { varieties: true, productionAreas: true },
  })

  // Plátano: se mantiene con 2 cosechas/mes en meses cerrados para demostrar el umbral de privacidad k >= 3 en /consultas
  const platano = await prisma.crop.create({
    data: {
      name: 'Plátano',
      normalizedName: 'platano',
      unitId: units.racimos.id,
      hasVarieties: true,
      hasProductionAreas: true,
      tracksSurface: true,
      varieties: {
        create: [
          { name: 'Barraganete', normalizedName: 'barraganete' },
          { name: 'Dominico', normalizedName: 'dominico' },
        ],
      },
      productionAreas: {
        create: [
          {
            name: 'Zona Sur',
            normalizedName: 'zona sur',
            type: 'ZONE',
            zoneId: zones['Zona Sur'].id,
            surface: dec(2.5),
            surfaceUnit: 'ha',
          },
        ],
      },
    },
    include: { varieties: true, productionAreas: true },
  })

  // Cultivo inactivo histórico (para demostrar catálogo activo/inactivo y KPI administrativo)
  await prisma.crop.create({
    data: {
      name: 'Maracuyá',
      normalizedName: 'maracuya',
      unitId: units.kilogramos.id,
      hasVarieties: false,
      hasProductionAreas: true,
      tracksSurface: true,
      active: false,
      productionAreas: {
        create: [
          {
            name: 'Parcela Experimental',
            normalizedName: 'parcela experimental',
            type: 'LOT',
            zoneId: zones['Parcela Experimental'].id,
            surface: dec(0.9),
            surfaceUnit: 'ha',
            active: false,
            notes: 'Ciclo experimental finalizado',
          },
        ],
      },
    },
  })

  // 5. Motivos de merma
  const reasonDefs = [
    { name: 'Plaga', normalizedName: 'plaga' },
    { name: 'Humedad', normalizedName: 'humedad' },
    { name: 'Daño en transporte', normalizedName: 'dano en transporte' },
    { name: 'Madurez excesiva', normalizedName: 'madurez excesiva' },
    { name: 'Golpe de sol', normalizedName: 'golpe de sol' },
    { name: 'Selección de calidad', normalizedName: 'seleccion de calidad' },
  ]
  const reasons = {}
  for (const def of reasonDefs) {
    reasons[def.name] = await prisma.lossReason.create({ data: def })
  }

  // 6. Categorías y subcategorías de costos
  const categoryTree = [
    {
      name: 'Insumos',
      normalizedName: 'insumos',
      subs: [
        { name: 'Fertilizantes', normalizedName: 'fertilizantes' },
        { name: 'Fitosanitarios', normalizedName: 'fitosanitarios' },
        { name: 'Semillas y plántulas', normalizedName: 'semillas y plantulas' },
        { name: 'Sustratos', normalizedName: 'sustratos' },
      ],
    },
    {
      name: 'Mano de obra',
      normalizedName: 'mano de obra',
      subs: [
        { name: 'Jornales de cosecha', normalizedName: 'jornales de cosecha' },
        { name: 'Control fitosanitario', normalizedName: 'control fitosanitario' },
        { name: 'Poda y deshije', normalizedName: 'poda y deshije' },
      ],
    },
    {
      name: 'Transporte',
      normalizedName: 'transporte',
      subs: [
        { name: 'Flete a Agro Market', normalizedName: 'flete a agro market' },
        { name: 'Combustible', normalizedName: 'combustible' },
      ],
    },
    {
      name: 'Mantenimiento',
      normalizedName: 'mantenimiento',
      subs: [
        { name: 'Sistema de riego', normalizedName: 'sistema de riego' },
        { name: 'Infraestructura de invernadero', normalizedName: 'infraestructura de invernadero' },
        { name: 'Maquinaria agrícola', normalizedName: 'maquinaria agricola' },
      ],
    },
    {
      name: 'Servicios básicos',
      normalizedName: 'servicios basicos',
      subs: [
        { name: 'Energía eléctrica', normalizedName: 'energia electrica' },
        { name: 'Agua de riego', normalizedName: 'agua de riego' },
      ],
    },
  ]

  const categories = {}
  const subcats = {}
  for (const catDef of categoryTree) {
    const created = await prisma.costCategory.create({
      data: {
        name: catDef.name,
        normalizedName: catDef.normalizedName,
        subcategories: { create: catDef.subs },
      },
      include: { subcategories: true },
    })
    categories[catDef.name] = created
    for (const sub of created.subcategories) {
      subcats[sub.name] = sub
    }
  }

  // 7. Serie histórica: 36 meses cerrados consecutivos (2 años calendario completos para estacionalidad + pronósticos de 6 meses con bandas de confianza)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date())
  const currentMonth = today.slice(0, 7)

  const bananoSeasonal = [0.85, 0.89, 1.03, 1.18, 1.25, 1.14, 0.99, 0.88, 0.84, 0.93, 1.08, 1.17]
  const cacaoSeasonal = [0.82, 0.86, 0.96, 1.12, 1.26, 1.22, 1.05, 0.90, 0.85, 0.98, 1.14, 1.19]
  const tomateSeasonal = [0.94, 0.92, 1.02, 1.08, 1.15, 1.12, 1.04, 0.96, 0.90, 0.95, 1.06, 1.10]

  let shipmentSeq = 1
  const nextShipCode = (prefix = 'ENV-2026') => `${prefix}-${String(shipmentSeq++).padStart(4, '0')}`

  for (let offset = -36; offset <= -1; offset++) {
    const month = shiftMonth(currentMonth, offset)
    const yearTag = month.slice(0, 4)
    const monthIdx = Number(month.slice(5, 7)) - 1
    const trendStep = offset + 36 // 0..35
    const fBanano = bananoSeasonal[monthIdx]
    const fCacao = cacaoSeasonal[monthIdx]
    const fTomate = tomateSeasonal[monthIdx]

    // --- Banano: 4 cosechas/mes (30 meses -> estacionalidad + pronóstico + k >= 3) ---
    const bananoHarvests = []
    for (let i = 0; i < 4; i++) {
      const day = String(3 + i * 6).padStart(2, '0')
      const qty = 34 * fBanano + trendStep * 0.52 + (i % 3) * 2.5
      const h = await prisma.harvest.create({
        data: {
          date: utcDate(`${month}-${day}`),
          cropId: banano.id,
          varietyId: banano.varieties[i % 3].id,
          productionAreaId: banano.productionAreas[i % 2].id,
          quantity: dec(qty),
          unitId: units.racimos.id,
          estimatedUnitPrice: dec(6.5 + (trendStep > 18 ? 0.3 : 0)),
          notes: `Corte programado ${month} #${i + 1}`,
          createdBy: 'production',
        },
      })
      bananoHarvests.push(h)
    }

    // Mermas Banano: 3 aplicables en meses pares (cumple k >= 3 en consultas públicas)
    if (trendStep % 2 === 0) {
      const bananoReasons = [reasons.Plaga.id, reasons.Humedad.id, reasons['Madurez excesiva'].id]
      for (let i = 0; i < 3; i++) {
        const day = String(5 + i * 6).padStart(2, '0')
        await prisma.loss.create({
          data: {
            harvestId: bananoHarvests[i].id,
            date: utcDate(`${month}-${day}`),
            quantity: dec(2.0 + (i % 2) * 0.5),
            affectsHarvest: true,
            reasonId: bananoReasons[i],
            notes: `Merma controlada en empaque ${month}`,
            createdBy: 'production',
          },
        })
      }
    }

    // --- Cacao: 4 cosechas/mes (30 meses -> estacionalidad + pronóstico + k >= 3) ---
    const cacaoHarvests = []
    for (let i = 0; i < 4; i++) {
      const day = String(4 + i * 6).padStart(2, '0')
      const qty = 15 * fCacao + trendStep * 0.28 + (i % 2) * 1.4
      const h = await prisma.harvest.create({
        data: {
          date: utcDate(`${month}-${day}`),
          cropId: cacao.id,
          varietyId: cacao.varieties[i % 2].id,
          productionAreaId: cacao.productionAreas[i % 2].id,
          quantity: dec(qty),
          unitId: units.quintales.id,
          estimatedUnitPrice: dec(96.0 + (trendStep > 20 ? 4.0 : 0)),
          notes: `Cosecha y secado ${month} lote #${i + 1}`,
          createdBy: 'production',
        },
      })
      cacaoHarvests.push(h)
    }

    // Mermas Cacao en meses recientes (últimos 10 meses)
    if (offset >= -10) {
      await prisma.loss.create({
        data: {
          harvestId: cacaoHarvests[1].id,
          date: utcDate(`${month}-12`),
          quantity: dec(0.75),
          affectsHarvest: true,
          reasonId: reasons.Humedad.id,
          notes: 'Merma por humedad en secado solar',
          createdBy: 'production',
        },
      })
    }

    // --- Tomate: 4 cosechas/mes en los 36 meses (habilita estacionalidad + pronóstico con bandas en cajas) ---
    const tomateHarvests = []
    for (let i = 0; i < 4; i++) {
      const day = String(5 + i * 6).padStart(2, '0')
      const qty = 22 * fTomate + trendStep * 0.30 + (i % 2) * 2
      const h = await prisma.harvest.create({
        data: {
          date: utcDate(`${month}-${day}`),
          cropId: tomate.id,
          varietyId: tomate.varieties[i % 2].id,
          productionAreaId: tomate.productionAreas[i % 2].id,
          quantity: dec(qty),
          unitId: units.cajas.id,
          estimatedUnitPrice: dec(11.5),
          notes: `Recolección invernadero ${month} #${i + 1}`,
          createdBy: 'production',
        },
      })
      tomateHarvests.push(h)
    }

    // Mermas Tomate: 1 aplicable + 1 estadística en últimos 8 meses
    if (offset >= -8) {
      await prisma.loss.create({
        data: {
          harvestId: tomateHarvests[0].id,
          date: utcDate(`${month}-07`),
          quantity: dec(1.5),
          affectsHarvest: true,
          reasonId: reasons['Madurez excesiva'].id,
          notes: 'Descarte postcosecha en clasificación',
          createdBy: 'production',
        },
      })
      await prisma.loss.create({
        data: {
          harvestId: tomateHarvests[2].id,
          date: utcDate(`${month}-19`),
          quantity: dec(1.0),
          affectsHarvest: false,
          reasonId: reasons['Selección de calidad'].id,
          notes: 'Registro estadístico de fruta fuera de calibre en campo',
          createdBy: 'production',
        },
      })
    }

    // --- Limón Tahití: 3 cosechas/mes en los últimos 14 meses ---
    const limonHarvests = []
    if (offset >= -14) {
      for (let i = 0; i < 3; i++) {
        const day = String(6 + i * 8).padStart(2, '0')
        const qty = 16 * (0.92 + (monthIdx % 4) * 0.06) + (i % 2) * 2
        const h = await prisma.harvest.create({
          data: {
            date: utcDate(`${month}-${day}`),
            cropId: limon.id,
            productionAreaId: limon.productionAreas[i % 2].id,
            quantity: dec(qty),
            unitId: units.sacos.id,
            estimatedUnitPrice: dec(14.0),
            notes: `Recolección cítricos ${month} #${i + 1}`,
            createdBy: 'production',
          },
        })
        limonHarvests.push(h)
      }
    }

    // --- Pimiento: 3 cosechas/mes en los últimos 8 meses ---
    const pimientoHarvests = []
    if (offset >= -8) {
      for (let i = 0; i < 3; i++) {
        const day = String(7 + i * 7).padStart(2, '0')
        const qty = 65 + (offset + 8) * 3.5 + i * 4
        const h = await prisma.harvest.create({
          data: {
            date: utcDate(`${month}-${day}`),
            cropId: pimiento.id,
            varietyId: pimiento.varieties[i % 2].id,
            productionAreaId: pimiento.productionAreas[0].id,
            quantity: dec(qty),
            unitId: units.kilogramos.id,
            estimatedUnitPrice: dec(1.35),
            notes: `Corte invernadero 2 · ${month}`,
            createdBy: 'production',
          },
        })
        pimientoHarvests.push(h)
      }
    }

    // --- Yuca: 3 cosechas/mes en los últimos 6 meses ---
    if (offset >= -6) {
      for (let i = 0; i < 3; i++) {
        const day = String(9 + i * 7).padStart(2, '0')
        await prisma.harvest.create({
          data: {
            date: utcDate(`${month}-${day}`),
            cropId: yuca.id,
            productionAreaId: yuca.productionAreas[0].id,
            quantity: dec(12 + i * 1.5),
            unitId: units.quintales.id,
            estimatedUnitPrice: dec(22.0),
            notes: `Arranque parcela experimental ${month}`,
            createdBy: 'production',
          },
        })
      }
    }

    // --- Plátano: solo 2 cosechas/mes en últimos 6 meses (verifica supresión pública k < 3) ---
    if (offset >= -6) {
      for (let i = 0; i < 2; i++) {
        await prisma.harvest.create({
          data: {
            date: utcDate(`${month}-${String(10 + i * 9).padStart(2, '0')}`),
            cropId: platano.id,
            varietyId: platano.varieties[i % 2].id,
            productionAreaId: platano.productionAreas[0].id,
            quantity: dec(18 + i * 2),
            unitId: units.racimos.id,
            estimatedUnitPrice: dec(5.2),
            createdBy: 'production',
          },
        })
      }
    }

    // --- Costos mensuales (4 registros por mes: porcentual, monto directo y general) ---
    const insumoUsd = 420 + (trendStep % 5) * 28
    await prisma.cost.create({
      data: {
        date: utcDate(`${month}-08`),
        description: `Plan de fertilización y bioinsumos ${month}`,
        categoryId: categories.Insumos.id,
        subcategoryId: trendStep % 2 === 0 ? subcats.Fertilizantes.id : subcats.Fitosanitarios.id,
        amountUsd: dec(insumoUsd),
        applicationType: 'CROP',
        notes: 'Aplicación programada por hectárea',
        allocations: {
          create: [
            { cropId: banano.id, percent: dec4(45) },
            { cropId: cacao.id, percent: dec4(35) },
            { cropId: tomate.id, percent: dec4(20) },
          ],
        },
      },
    })

    const laborBanano = 260 + (monthIdx % 3) * 15
    const laborCacao = 210 + (monthIdx % 2) * 20
    const laborTomate = 140
    const laborTotal = laborBanano + laborCacao + laborTomate
    await prisma.cost.create({
      data: {
        date: utcDate(`${month}-16`),
        description: `Jornales de cosecha y manejo cultural ${month}`,
        categoryId: categories['Mano de obra'].id,
        subcategoryId: subcats['Jornales de cosecha'].id,
        amountUsd: dec(laborTotal),
        applicationType: 'CROP',
        notes: 'Cuadrillas de campo asignadas por cultivo',
        allocations: {
          create: [
            { cropId: banano.id, amountUsd: dec(laborBanano) },
            { cropId: cacao.id, amountUsd: dec(laborCacao) },
            { cropId: tomate.id, amountUsd: dec(laborTomate) },
          ],
        },
      },
    })

    const transportUsd = 135 + (offset >= -8 ? 35 : 0)
    await prisma.cost.create({
      data: {
        date: utcDate(`${month}-22`),
        description: `Transporte interno y despacho a Agro Market ${month}`,
        categoryId: categories.Transporte.id,
        subcategoryId: subcats['Flete a Agro Market'].id,
        amountUsd: dec(transportUsd),
        applicationType: 'CROP',
        allocations: {
          create: [
            { cropId: banano.id, percent: dec4(55) },
            { cropId: tomate.id, percent: dec4(45) },
          ],
        },
      },
    })

    const generalUsd = 195 + (monthIdx % 4) * 22
    await prisma.cost.create({
      data: {
        date: utcDate(`${month}-25`),
        description:
          trendStep % 2 === 0
            ? `Mantenimiento preventivo de sistema de riego ${month}`
            : `Servicios básicos y bombeo general de finca ${month}`,
        categoryId: trendStep % 2 === 0 ? categories.Mantenimiento.id : categories['Servicios básicos'].id,
        subcategoryId:
          trendStep % 2 === 0 ? subcats['Sistema de riego'].id : subcats['Energía eléctrica'].id,
        amountUsd: dec(generalUsd),
        applicationType: 'GENERAL',
        notes: 'Gasto general operativo de Finca Experimental Lodana',
      },
    })

    // --- Últimos 8 meses cerrados: Despachos + Recepciones + Ventas Agro Market ---
    if (offset >= -8) {
      // 3 despachos completos de Banano + Tomate por mes (cumple k >= 3 en consultas públicas)
      for (let s = 0; s < 3; s++) {
        const srcBanano = bananoHarvests[s]
        const srcTomate = tomateHarvests[s]
        const shipDay = String(7 + s * 7).padStart(2, '0')
        const bananoQty = 20
        const tomateQty = 14
        const paymentMethod = s % 2 === 0 ? 'CASH' : 'TRANSFER'

        const shipment = await prisma.shipment.create({
          data: {
            code: nextShipCode(`ENV-${yearTag}`),
            date: utcDate(`${month}-${shipDay}`),
            status: 'RECEIVED',
            notes: `Despacho comercial ${month} #${s + 1}`,
            createdBy: 'production',
            items: {
              create: [
                {
                  cropId: banano.id,
                  varietyId: srcBanano.varietyId,
                  productionAreaId: srcBanano.productionAreaId,
                  unitId: units.racimos.id,
                  quantity: dec(bananoQty),
                  estimatedUnitPrice: dec(6.8),
                  estimatedTotalAmount: dec(bananoQty * 6.8),
                  allocations: { create: [{ harvestId: srcBanano.id, quantity: dec(bananoQty) }] },
                },
                {
                  cropId: tomate.id,
                  varietyId: srcTomate.varietyId,
                  productionAreaId: srcTomate.productionAreaId,
                  unitId: units.cajas.id,
                  quantity: dec(tomateQty),
                  estimatedUnitPrice: dec(11.5),
                  estimatedTotalAmount: dec(tomateQty * 11.5),
                  allocations: { create: [{ harvestId: srcTomate.id, quantity: dec(tomateQty) }] },
                },
              ],
            },
          },
          include: { items: true },
        })

        const recItemsCreate = shipment.items.map((si) => ({
          shipmentItemId: si.id,
          receivedQuantity: si.quantity,
          customerUnitPrice: si.cropId === banano.id ? dec(9.0) : dec(15.5),
        }))

        const reception = await prisma.reception.create({
          data: {
            shipmentId: shipment.id,
            receivedAt: ecTimestamp(`${month}-${shipDay}`, 15, 30),
            receivedBy: 'reception',
            notes: 'Recepción conforme en Agro Market',
            items: { create: recItemsCreate },
          },
          include: { items: { include: { shipmentItem: true } } },
        })

        for (const ri of reception.items) {
          const isBanano = ri.shipmentItem.cropId === banano.id
          const soldQty = isBanano ? 18 : 13
          const unitPrice = isBanano ? 9.0 : 15.5
          await prisma.marketSale.create({
            data: {
              receptionItemId: ri.id,
              date: utcDate(`${month}-${shipDay}`),
              quantity: dec(soldQty),
              unitPrice: dec(unitPrice),
              total: dec(soldQty * unitPrice),
              payment: paymentMethod,
              createdBy: 'reception',
            },
          })
        }
      }

      // Despachos adicionales de Limón y Pimiento en los últimos 5 meses cerrados
      if (offset >= -5 && limonHarvests.length >= 2 && pimientoHarvests.length >= 2) {
        const shipDay = '18'
        const srcLimon = limonHarvests[1]
        const srcPim = pimientoHarvests[1]
        const ship = await prisma.shipment.create({
          data: {
            code: nextShipCode(`ENV-${yearTag}`),
            date: utcDate(`${month}-${shipDay}`),
            status: 'RECEIVED',
            notes: `Despacho cítricos y hortalizas ${month}`,
            createdBy: 'production',
            items: {
              create: [
                {
                  cropId: limon.id,
                  productionAreaId: srcLimon.productionAreaId,
                  unitId: units.sacos.id,
                  quantity: dec(10),
                  estimatedUnitPrice: dec(14.0),
                  estimatedTotalAmount: dec(140.0),
                  allocations: { create: [{ harvestId: srcLimon.id, quantity: dec(10) }] },
                },
                {
                  cropId: pimiento.id,
                  varietyId: srcPim.varietyId,
                  productionAreaId: srcPim.productionAreaId,
                  unitId: units.kilogramos.id,
                  quantity: dec(45),
                  estimatedUnitPrice: dec(1.35),
                  estimatedTotalAmount: dec(60.75),
                  allocations: { create: [{ harvestId: srcPim.id, quantity: dec(45) }] },
                },
              ],
            },
          },
          include: { items: true },
        })

        const rec = await prisma.reception.create({
          data: {
            shipmentId: ship.id,
            receivedAt: ecTimestamp(`${month}-${shipDay}`, 16, 0),
            receivedBy: 'reception',
            notes: 'Recepción completa',
            items: {
              create: ship.items.map((si) => ({
                shipmentItemId: si.id,
                receivedQuantity: si.quantity,
                customerUnitPrice: si.cropId === limon.id ? dec(18.5) : dec(2.1),
              })),
            },
          },
          include: { items: { include: { shipmentItem: true } } },
        })

        for (const ri of rec.items) {
          const isLimon = ri.shipmentItem.cropId === limon.id
          const qty = isLimon ? 9 : 40
          const price = isLimon ? 18.5 : 2.1
          await prisma.marketSale.create({
            data: {
              receptionItemId: ri.id,
              date: utcDate(`${month}-19`),
              quantity: dec(qty),
              unitPrice: dec(price),
              total: dec(qty * price),
              payment: isLimon ? 'TRANSFER' : 'CASH',
              createdBy: 'reception',
            },
          })
        }
      }

      // En el mes cerrado anterior (offset === -1): 1 despacho con diferencias + 1 cancelado + 1 venta anulada
      if (offset === -1) {
        const srcTom = tomateHarvests[3]
        const diffShip = await prisma.shipment.create({
          data: {
            code: nextShipCode(`ENV-${yearTag}`),
            date: utcDate(`${month}-24`),
            status: 'RECEIVED_WITH_DIFFERENCES',
            notes: 'Cierre con 2 cajas averiadas durante el traslado',
            createdBy: 'production',
            items: {
              create: [
                {
                  cropId: tomate.id,
                  varietyId: srcTom.varietyId,
                  productionAreaId: srcTom.productionAreaId,
                  unitId: units.cajas.id,
                  quantity: dec(12),
                  estimatedUnitPrice: dec(11.5),
                  estimatedTotalAmount: dec(138.0),
                  allocations: { create: [{ harvestId: srcTom.id, quantity: dec(12) }] },
                },
              ],
            },
          },
          include: { items: true },
        })

        const diffRec = await prisma.reception.create({
          data: {
            shipmentId: diffShip.id,
            receivedAt: ecTimestamp(`${month}-24`, 16, 45),
            receivedBy: 'reception',
            closesWithDifferences: true,
            notes: 'Se recibieron 10 de 12 cajas; 2 dañadas en transporte',
            items: {
              create: [
                {
                  shipmentItemId: diffShip.items[0].id,
                  receivedQuantity: dec(10),
                  customerUnitPrice: dec(15.5),
                  notes: 'Diferencia documentada al cierre',
                },
              ],
            },
          },
          include: { items: true },
        })

        await prisma.marketSale.create({
          data: {
            receptionItemId: diffRec.items[0].id,
            date: utcDate(`${month}-25`),
            quantity: dec(8),
            unitPrice: dec(15.5),
            total: dec(124.0),
            payment: 'CASH',
            createdBy: 'reception',
          },
        })

        // Envío cancelado histórico (sin recepciones)
        const srcBan3 = bananoHarvests[3]
        await prisma.shipment.create({
          data: {
            code: nextShipCode(`ENV-${yearTag}`),
            date: utcDate(`${month}-26`),
            status: 'CANCELLED',
            notes: 'Cancelado por reprogramación de ruta de transporte',
            createdBy: 'production',
            items: {
              create: [
                {
                  cropId: banano.id,
                  varietyId: srcBan3.varietyId,
                  productionAreaId: srcBan3.productionAreaId,
                  unitId: units.racimos.id,
                  quantity: dec(15),
                  estimatedUnitPrice: dec(6.8),
                  estimatedTotalAmount: dec(102.0),
                  allocations: { create: [{ harvestId: srcBan3.id, quantity: dec(15) }] },
                },
              ],
            },
          },
        })
      }
    }
  }

  // 8. OPERACIÓN DETALLADA DEL MES ACTUAL (cubre semanas cerradas recientes + semana actual en vivo)
  const dayAgo = (n) => addDays(today, -n)
  const clampMonthDay = (n) => {
    const d = dayAgo(n)
    return d.startsWith(currentMonth) ? d : `${currentMonth}-01`
  }

  // Cosechas del mes actual (con amplio saldo disponible para seguir probando)
  const curH1 = await prisma.harvest.create({
    data: {
      date: utcDate(clampMonthDay(18)),
      cropId: banano.id,
      varietyId: banano.varieties[0].id,
      productionAreaId: banano.productionAreas[0].id,
      quantity: dec(95),
      unitId: units.racimos.id,
      estimatedUnitPrice: dec(6.8),
      notes: 'Primera cosecha del mes · Zona Norte',
      createdBy: 'production',
    },
  })

  const curH2 = await prisma.harvest.create({
    data: {
      date: utcDate(clampMonthDay(14)),
      cropId: tomate.id,
      varietyId: tomate.varieties[0].id,
      productionAreaId: tomate.productionAreas[0].id,
      quantity: dec(58),
      unitId: units.cajas.id,
      estimatedUnitPrice: dec(11.8),
      notes: 'Cosecha de tomate riñón · Invernadero 1',
      createdBy: 'production',
    },
  })

  const curH3 = await prisma.harvest.create({
    data: {
      date: utcDate(clampMonthDay(11)),
      cropId: cacao.id,
      varietyId: cacao.varieties[0].id,
      productionAreaId: cacao.productionAreas[0].id,
      quantity: dec(26.5),
      unitId: units.quintales.id,
      estimatedUnitPrice: dec(102.0),
      notes: 'Lote CCN-51 seco al 7% de humedad',
      createdBy: 'production',
    },
  })

  const curH4 = await prisma.harvest.create({
    data: {
      date: utcDate(clampMonthDay(8)),
      cropId: banano.id,
      varietyId: banano.varieties[1].id,
      productionAreaId: banano.productionAreas[1].id,
      quantity: dec(110),
      unitId: units.racimos.id,
      estimatedUnitPrice: dec(7.1),
      notes: 'Corte de banano Orito para comercialización semanal',
      createdBy: 'production',
    },
  })

  const curH5 = await prisma.harvest.create({
    data: {
      date: utcDate(clampMonthDay(7)),
      cropId: limon.id,
      productionAreaId: limon.productionAreas[0].id,
      quantity: dec(38),
      unitId: units.sacos.id,
      estimatedUnitPrice: dec(14.5),
      notes: 'Recolección Limón Tahití calibre comercial',
      createdBy: 'production',
    },
  })

  const curH6 = await prisma.harvest.create({
    data: {
      date: utcDate(clampMonthDay(6)),
      cropId: pimiento.id,
      varietyId: pimiento.varieties[0].id,
      productionAreaId: pimiento.productionAreas[0].id,
      quantity: dec(145),
      unitId: units.kilogramos.id,
      estimatedUnitPrice: dec(1.4),
      notes: 'Corte de pimiento Nathalie en Invernadero 2',
      createdBy: 'production',
    },
  })

  const curH7 = await prisma.harvest.create({
    data: {
      date: utcDate(clampMonthDay(4)),
      cropId: tomate.id,
      varietyId: tomate.varieties[1].id,
      productionAreaId: tomate.productionAreas[1].id,
      quantity: dec(44),
      unitId: units.cajas.id,
      estimatedUnitPrice: dec(13.2),
      notes: 'Cosecha de tomate Cherry para Agro Market',
      createdBy: 'production',
    },
  })

  const curH8 = await prisma.harvest.create({
    data: {
      date: utcDate(clampMonthDay(2)),
      cropId: platano.id,
      varietyId: platano.varieties[0].id,
      productionAreaId: platano.productionAreas[0].id,
      quantity: dec(42),
      unitId: units.racimos.id,
      estimatedUnitPrice: dec(5.5),
      notes: 'Plátano Barraganete disponible en bodega de finca',
      createdBy: 'production',
    },
  })

  const curH9 = await prisma.harvest.create({
    data: {
      date: utcDate(clampMonthDay(1)),
      cropId: yuca.id,
      productionAreaId: yuca.productionAreas[0].id,
      quantity: dec(24),
      unitId: units.quintales.id,
      estimatedUnitPrice: dec(23.0),
      notes: 'Yuca recién cosechada lista para despacho',
      createdBy: 'production',
    },
  })

  const curH10 = await prisma.harvest.create({
    data: {
      date: utcDate(today),
      cropId: banano.id,
      varietyId: banano.varieties[0].id,
      productionAreaId: banano.productionAreas[0].id,
      quantity: dec(85),
      unitId: units.racimos.id,
      estimatedUnitPrice: dec(6.9),
      notes: 'Cosecha de hoy lista para despachar',
      createdBy: 'production',
    },
  })

  // Mermas del mes actual (aplicables + estadísticas, todas clasificadas)
  await prisma.loss.createMany({
    data: [
      {
        harvestId: curH1.id,
        date: utcDate(clampMonthDay(16)),
        quantity: dec(4.0),
        affectsHarvest: true,
        reasonId: reasons.Plaga.id,
        notes: 'Afectación localizada por cochinilla en borde de lote',
        createdBy: 'production',
      },
      {
        harvestId: curH2.id,
        date: utcDate(clampMonthDay(12)),
        quantity: dec(2.5),
        affectsHarvest: true,
        reasonId: reasons['Madurez excesiva'].id,
        notes: 'Fruta sobremadura separada en clasificación',
        createdBy: 'production',
      },
      {
        harvestId: curH5.id,
        date: utcDate(clampMonthDay(6)),
        quantity: dec(1.5),
        affectsHarvest: true,
        reasonId: reasons['Golpe de sol'].id,
        notes: 'Fruta con daño superficial descartada',
        createdBy: 'production',
      },
      {
        harvestId: curH6.id,
        date: utcDate(clampMonthDay(5)),
        quantity: dec(6.0),
        affectsHarvest: false,
        reasonId: reasons['Selección de calidad'].id,
        notes: 'Descarte estadístico de pimiento fuera de calibre antes de pesaje',
        createdBy: 'production',
      },
    ],
  })

  // Costos del mes actual (para que el KPI de costos del mes en Administración sea realista)
  await prisma.cost.create({
    data: {
      date: utcDate(clampMonthDay(17)),
      description: 'Compra de fertilizante foliar y abono orgánico',
      categoryId: categories.Insumos.id,
      subcategoryId: subcats.Fertilizantes.id,
      amountUsd: dec(485.0),
      applicationType: 'CROP',
      notes: 'Factura proveedor agrícola Manabí',
      allocations: {
        create: [
          { cropId: banano.id, percent: dec4(50) },
          { cropId: cacao.id, percent: dec4(30) },
          { cropId: tomate.id, percent: dec4(20) },
        ],
      },
    },
  })

  await prisma.cost.create({
    data: {
      date: utcDate(clampMonthDay(10)),
      description: 'Jornales de cosecha y limpieza de canales',
      categoryId: categories['Mano de obra'].id,
      subcategoryId: subcats['Jornales de cosecha'].id,
      amountUsd: dec(620.0),
      applicationType: 'CROP',
      allocations: {
        create: [
          { cropId: banano.id, amountUsd: dec(260.0) },
          { cropId: cacao.id, amountUsd: dec(200.0) },
          { cropId: limon.id, amountUsd: dec(160.0) },
        ],
      },
    },
  })

  await prisma.cost.create({
    data: {
      date: utcDate(clampMonthDay(6)),
      description: 'Flete semanal Finca Lodana → Agro Market',
      categoryId: categories.Transporte.id,
      subcategoryId: subcats['Flete a Agro Market'].id,
      amountUsd: dec(180.0),
      applicationType: 'CROP',
      allocations: {
        create: [
          { cropId: banano.id, percent: dec4(40) },
          { cropId: tomate.id, percent: dec4(35) },
          { cropId: pimiento.id, percent: dec4(25) },
        ],
      },
    },
  })

  await prisma.cost.create({
    data: {
      date: utcDate(clampMonthDay(4)),
      description: 'Repuestos y revisión de electrobombas de riego',
      categoryId: categories.Mantenimiento.id,
      subcategoryId: subcats['Sistema de riego'].id,
      amountUsd: dec(245.5),
      applicationType: 'GENERAL',
      notes: 'Mantenimiento preventivo mensual de finca',
    },
  })

  await prisma.cost.create({
    data: {
      date: utcDate(clampMonthDay(2)),
      description: 'Planilla eléctrica de bodegas e invernaderos',
      categoryId: categories['Servicios básicos'].id,
      subcategoryId: subcats['Energía eléctrica'].id,
      amountUsd: dec(168.75),
      applicationType: 'GENERAL',
    },
  })

  // Despacho 1 del mes (semana cerrada anterior): RECEIVED completo con ventas múltiples + 1 venta anulada
  const weekPrevDay1 = clampMonthDay(7) // ~17 nov (semana cerrada 16-22 nov)
  const weekPrevDay2 = clampMonthDay(5) // ~19 nov
  const weekPrevDay3 = clampMonthDay(3) // ~21 nov

  const curShip1 = await prisma.shipment.create({
    data: {
      code: nextShipCode('ENV-2026'),
      date: utcDate(weekPrevDay1),
      status: 'RECEIVED',
      notes: 'Despacho semanal principal hacia Agro Market',
      createdBy: 'production',
      items: {
        create: [
          {
            cropId: banano.id,
            varietyId: curH4.varietyId,
            productionAreaId: curH4.productionAreaId,
            unitId: units.racimos.id,
            quantity: dec(40),
            estimatedUnitPrice: dec(7.1),
            estimatedTotalAmount: dec(284.0),
            allocations: { create: [{ harvestId: curH4.id, quantity: dec(40) }] },
          },
          {
            cropId: tomate.id,
            varietyId: curH2.varietyId,
            productionAreaId: curH2.productionAreaId,
            unitId: units.cajas.id,
            quantity: dec(24),
            estimatedUnitPrice: dec(11.8),
            estimatedTotalAmount: dec(283.2),
            allocations: { create: [{ harvestId: curH2.id, quantity: dec(24) }] },
          },
          {
            cropId: limon.id,
            productionAreaId: curH5.productionAreaId,
            unitId: units.sacos.id,
            quantity: dec(14),
            estimatedUnitPrice: dec(14.5),
            estimatedTotalAmount: dec(203.0),
            allocations: { create: [{ harvestId: curH5.id, quantity: dec(14) }] },
          },
        ],
      },
    },
    include: { items: true },
  })

  const curRec1 = await prisma.reception.create({
    data: {
      shipmentId: curShip1.id,
      receivedAt: ecTimestamp(weekPrevDay1, 15, 20),
      receivedBy: 'reception',
      notes: 'Recepción total sin novedades',
      items: {
        create: [
          { shipmentItemId: curShip1.items[0].id, receivedQuantity: dec(40), customerUnitPrice: dec(9.5) },
          { shipmentItemId: curShip1.items[1].id, receivedQuantity: dec(24), customerUnitPrice: dec(16.0) },
          { shipmentItemId: curShip1.items[2].id, receivedQuantity: dec(14), customerUnitPrice: dec(19.5) },
        ],
      },
    },
    include: { items: true },
  })

  // Ventas sobre curRec1 (semana pasada + algunas de esta semana, dejando saldo disponible!)
  await prisma.marketSale.createMany({
    data: [
      {
        receptionItemId: curRec1.items[0].id,
        date: utcDate(weekPrevDay1),
        quantity: dec(14),
        unitPrice: dec(9.5),
        total: dec(133.0),
        payment: 'CASH',
        createdBy: 'reception',
      },
      {
        receptionItemId: curRec1.items[0].id,
        date: utcDate(weekPrevDay2),
        quantity: dec(12),
        unitPrice: dec(9.5),
        total: dec(114.0),
        payment: 'TRANSFER',
        createdBy: 'reception',
      },
      // Venta anulada (devuelve saldo al recibo)
      {
        receptionItemId: curRec1.items[0].id,
        date: utcDate(weekPrevDay2),
        quantity: dec(5),
        unitPrice: dec(9.5),
        total: dec(47.5),
        payment: 'CASH',
        createdBy: 'reception',
        cancelledAt: ecTimestamp(weekPrevDay2, 18, 15),
      },
      {
        receptionItemId: curRec1.items[1].id,
        date: utcDate(weekPrevDay1),
        quantity: dec(10),
        unitPrice: dec(16.0),
        total: dec(160.0),
        payment: 'TRANSFER',
        createdBy: 'reception',
      },
      {
        receptionItemId: curRec1.items[1].id,
        date: utcDate(weekPrevDay3),
        quantity: dec(8),
        unitPrice: dec(16.0),
        total: dec(128.0),
        payment: 'CASH',
        createdBy: 'reception',
      },
      {
        receptionItemId: curRec1.items[2].id,
        date: utcDate(weekPrevDay2),
        quantity: dec(9),
        unitPrice: dec(19.5),
        total: dec(175.5),
        payment: 'TRANSFER',
        createdBy: 'reception',
      },
      {
        receptionItemId: curRec1.items[2].id,
        date: utcDate(dayAgo(1)),
        quantity: dec(3),
        unitPrice: dec(19.5),
        total: dec(58.5),
        payment: 'CASH',
        createdBy: 'reception',
      },
    ],
  })

  // Despacho 2 del mes (semana pasada): RECEIVED con Pimiento + Plátano
  const curShip2 = await prisma.shipment.create({
    data: {
      code: nextShipCode('ENV-2026'),
      date: utcDate(weekPrevDay2),
      status: 'RECEIVED',
      notes: 'Despacho de hortalizas frescas',
      createdBy: 'production',
      items: {
        create: [
          {
            cropId: pimiento.id,
            varietyId: curH6.varietyId,
            productionAreaId: curH6.productionAreaId,
            unitId: units.kilogramos.id,
            quantity: dec(70),
            estimatedUnitPrice: dec(1.4),
            estimatedTotalAmount: dec(98.0),
            allocations: { create: [{ harvestId: curH6.id, quantity: dec(70) }] },
          },
          {
            cropId: banano.id,
            varietyId: curH1.varietyId,
            productionAreaId: curH1.productionAreaId,
            unitId: units.racimos.id,
            quantity: dec(25),
            estimatedUnitPrice: dec(6.8),
            estimatedTotalAmount: dec(170.0),
            allocations: { create: [{ harvestId: curH1.id, quantity: dec(25) }] },
          },
        ],
      },
    },
    include: { items: true },
  })

  const curRec2 = await prisma.reception.create({
    data: {
      shipmentId: curShip2.id,
      receivedAt: ecTimestamp(weekPrevDay2, 16, 10),
      receivedBy: 'reception',
      notes: 'Recibido en óptimas condiciones',
      items: {
        create: [
          { shipmentItemId: curShip2.items[0].id, receivedQuantity: dec(70), customerUnitPrice: dec(2.25) },
          { shipmentItemId: curShip2.items[1].id, receivedQuantity: dec(25), customerUnitPrice: dec(9.0) },
        ],
      },
    },
    include: { items: true },
  })

  await prisma.marketSale.createMany({
    data: [
      {
        receptionItemId: curRec2.items[0].id,
        date: utcDate(weekPrevDay3),
        quantity: dec(35),
        unitPrice: dec(2.25),
        total: dec(78.75),
        payment: 'CASH',
        createdBy: 'reception',
      },
      {
        receptionItemId: curRec2.items[0].id,
        date: utcDate(today),
        quantity: dec(18),
        unitPrice: dec(2.25),
        total: dec(40.5),
        payment: 'TRANSFER',
        createdBy: 'reception',
      },
      {
        receptionItemId: curRec2.items[1].id,
        date: utcDate(dayAgo(1)),
        quantity: dec(12),
        unitPrice: dec(9.0),
        total: dec(108.0),
        payment: 'CASH',
        createdBy: 'reception',
      },
      // Segunda venta anulada reciente
      {
        receptionItemId: curRec2.items[0].id,
        date: utcDate(dayAgo(1)),
        quantity: dec(10),
        unitPrice: dec(2.25),
        total: dec(22.5),
        payment: 'TRANSFER',
        createdBy: 'reception',
        cancelledAt: ecTimestamp(dayAgo(1), 19, 0),
      },
    ],
  })

  // Despacho 3 del mes: RECEIVED_WITH_DIFFERENCES (Tomate Cherry)
  const diffShipCur = await prisma.shipment.create({
    data: {
      code: 'ENV-2026-DIF-01',
      date: utcDate(clampMonthDay(3)),
      status: 'RECEIVED_WITH_DIFFERENCES',
      notes: 'Entrega cerrada con faltante de 2 cajas por aplastamiento en carga',
      createdBy: 'production',
      items: {
        create: [
          {
            cropId: tomate.id,
            varietyId: curH7.varietyId,
            productionAreaId: curH7.productionAreaId,
            unitId: units.cajas.id,
            quantity: dec(18),
            estimatedUnitPrice: dec(13.2),
            estimatedTotalAmount: dec(237.6),
            allocations: { create: [{ harvestId: curH7.id, quantity: dec(18) }] },
          },
        ],
      },
    },
    include: { items: true },
  })

  const diffRecCur = await prisma.reception.create({
    data: {
      shipmentId: diffShipCur.id,
      receivedAt: ecTimestamp(clampMonthDay(3), 16, 20),
      receivedBy: 'reception',
      closesWithDifferences: true,
      notes: 'Se confirman 16 cajas aptas para venta al público',
      items: {
        create: [
          {
            shipmentItemId: diffShipCur.items[0].id,
            receivedQuantity: dec(16),
            customerUnitPrice: dec(18.0),
            notes: '2 cajas rechazadas por daño en transporte',
          },
        ],
      },
    },
    include: { items: true },
  })

  await prisma.marketSale.create({
    data: {
      receptionItemId: diffRecCur.items[0].id,
      date: utcDate(dayAgo(1)),
      quantity: dec(9),
      unitPrice: dec(18.0),
      total: dec(162.0),
      payment: 'TRANSFER',
      createdBy: 'reception',
    },
  })

  // Despacho 4 del mes: PARTIALLY_RECEIVED (reciente -> listo para completar recepción y seguir vendiendo hoy)
  const partialShip = await prisma.shipment.create({
    data: {
      code: 'ENV-2026-PARC-01',
      date: utcDate(dayAgo(2)),
      status: 'PARTIALLY_RECEIVED',
      notes: 'Entrega dividida en dos viajes por capacidad de camioneta',
      createdBy: 'production',
      items: {
        create: [
          {
            cropId: banano.id,
            varietyId: curH4.varietyId,
            productionAreaId: curH4.productionAreaId,
            unitId: units.racimos.id,
            quantity: dec(45),
            estimatedUnitPrice: dec(7.1),
            estimatedTotalAmount: dec(319.5),
            allocations: { create: [{ harvestId: curH4.id, quantity: dec(45) }] },
          },
          {
            cropId: tomate.id,
            varietyId: curH2.varietyId,
            productionAreaId: curH2.productionAreaId,
            unitId: units.cajas.id,
            quantity: dec(20),
            estimatedUnitPrice: dec(11.8),
            estimatedTotalAmount: dec(236.0),
            allocations: { create: [{ harvestId: curH2.id, quantity: dec(20) }] },
          },
        ],
      },
    },
    include: { items: true },
  })

  const partialRec = await prisma.reception.create({
    data: {
      shipmentId: partialShip.id,
      receivedAt: ecTimestamp(dayAgo(2), 15, 45),
      receivedBy: 'reception',
      notes: 'Primer viaje recibido; resta segundo viaje',
      items: {
        create: [
          { shipmentItemId: partialShip.items[0].id, receivedQuantity: dec(25), customerUnitPrice: dec(9.5) },
          { shipmentItemId: partialShip.items[1].id, receivedQuantity: dec(12), customerUnitPrice: dec(16.0) },
        ],
      },
    },
    include: { items: true },
  })

  await prisma.marketSale.createMany({
    data: [
      {
        receptionItemId: partialRec.items[0].id,
        date: utcDate(today),
        quantity: dec(8),
        unitPrice: dec(9.5),
        total: dec(76.0),
        payment: 'CASH',
        createdBy: 'reception',
      },
      {
        receptionItemId: partialRec.items[1].id,
        date: utcDate(today),
        quantity: dec(5),
        unitPrice: dec(16.0),
        total: dec(80.0),
        payment: 'TRANSFER',
        createdBy: 'reception',
      },
    ],
  })

  // Despachos 5 y 6 del mes: IN_TRANSIT (listos para recibir en Agro Market!)
  await prisma.shipment.create({
    data: {
      code: 'ENV-2026-PEND-01',
      date: utcDate(dayAgo(1)),
      status: 'IN_TRANSIT',
      notes: 'Despacho fresco en ruta hacia Agro Market',
      createdBy: 'production',
      items: {
        create: [
          {
            cropId: banano.id,
            varietyId: curH1.varietyId,
            productionAreaId: curH1.productionAreaId,
            unitId: units.racimos.id,
            quantity: dec(30),
            estimatedUnitPrice: dec(6.8),
            estimatedTotalAmount: dec(204.0),
            allocations: { create: [{ harvestId: curH1.id, quantity: dec(30) }] },
          },
          {
            cropId: tomate.id,
            varietyId: curH7.varietyId,
            productionAreaId: curH7.productionAreaId,
            unitId: units.cajas.id,
            quantity: dec(16),
            estimatedUnitPrice: dec(13.2),
            estimatedTotalAmount: dec(211.2),
            allocations: { create: [{ harvestId: curH7.id, quantity: dec(16) }] },
          },
        ],
      },
    },
  })

  await prisma.shipment.create({
    data: {
      code: 'ENV-2026-PEND-02',
      date: utcDate(today),
      status: 'IN_TRANSIT',
      notes: 'Despacho de hoy: cítricos, pimiento y plátano',
      createdBy: 'production',
      items: {
        create: [
          {
            cropId: limon.id,
            productionAreaId: curH5.productionAreaId,
            unitId: units.sacos.id,
            quantity: dec(12),
            estimatedUnitPrice: dec(14.5),
            estimatedTotalAmount: dec(174.0),
            allocations: { create: [{ harvestId: curH5.id, quantity: dec(12) }] },
          },
          {
            cropId: pimiento.id,
            varietyId: curH6.varietyId,
            productionAreaId: curH6.productionAreaId,
            unitId: units.kilogramos.id,
            quantity: dec(40),
            estimatedUnitPrice: dec(1.4),
            estimatedTotalAmount: dec(56.0),
            allocations: { create: [{ harvestId: curH6.id, quantity: dec(40) }] },
          },
          {
            cropId: platano.id,
            varietyId: curH8.varietyId,
            productionAreaId: curH8.productionAreaId,
            unitId: units.racimos.id,
            quantity: dec(18),
            estimatedUnitPrice: dec(5.5),
            estimatedTotalAmount: dec(99.0),
            allocations: { create: [{ harvestId: curH8.id, quantity: dec(18) }] },
          },
        ],
      },
    },
  })

  // Despacho 7 del mes: CANCELLED (reciente)
  await prisma.shipment.create({
    data: {
      code: 'ENV-2026-CANC-01',
      date: utcDate(dayAgo(4)),
      status: 'CANCELLED',
      notes: 'Anulado antes de salida por ajuste de pedido en punto de venta',
      createdBy: 'production',
      items: {
        create: [
          {
            cropId: yuca.id,
            productionAreaId: curH9.productionAreaId,
            unitId: units.quintales.id,
            quantity: dec(10),
            estimatedUnitPrice: dec(23.0),
            estimatedTotalAmount: dec(230.0),
            allocations: { create: [{ harvestId: curH9.id, quantity: dec(10) }] },
          },
        ],
      },
    },
  })

  // 9. Papelera recuperable (3 elementos restaurables con vigencia de 60 días)
  const trashDeletedAt = ecTimestamp(dayAgo(1), 17, 30)
  const trashPurgeAt = new Date(trashDeletedAt)
  trashPurgeAt.setUTCDate(trashPurgeAt.getUTCDate() + 60)

  const trashedHarvest = await prisma.harvest.create({
    data: {
      date: utcDate(dayAgo(3)),
      cropId: platano.id,
      varietyId: platano.varieties[1].id,
      productionAreaId: platano.productionAreas[0].id,
      quantity: dec(15),
      unitId: units.racimos.id,
      estimatedUnitPrice: dec(5.5),
      notes: 'Registro duplicado enviado a papelera',
      createdBy: 'production',
      deletedAt: trashDeletedAt,
    },
  })

  const trashedCost = await prisma.cost.create({
    data: {
      date: utcDate(dayAgo(2)),
      description: 'Borrador de compra de herramientas menores',
      categoryId: categories.Mantenimiento.id,
      subcategoryId: subcats['Maquinaria agrícola'].id,
      amountUsd: dec(95.0),
      applicationType: 'GENERAL',
      notes: 'Cotización descartada',
      deletedAt: trashDeletedAt,
    },
  })

  const trashedLoss = await prisma.loss.create({
    data: {
      harvestId: curH8.id,
      date: utcDate(dayAgo(1)),
      quantity: dec(2.0),
      affectsHarvest: true,
      reasonId: reasons['Daño en transporte'].id,
      notes: 'Merma registrada por error (restaurable)',
      createdBy: 'production',
      deletedAt: trashDeletedAt,
    },
  })

  await prisma.trashEntry.createMany({
    data: [
      {
        entityType: 'harvest',
        entityId: trashedHarvest.id,
        groupId: crypto.randomUUID(),
        deletedAt: trashDeletedAt,
        purgeAt: trashPurgeAt,
        deletedBy: 'production',
        snapshotJson: JSON.parse(JSON.stringify(trashedHarvest)),
      },
      {
        entityType: 'cost',
        entityId: trashedCost.id,
        groupId: crypto.randomUUID(),
        deletedAt: trashDeletedAt,
        purgeAt: trashPurgeAt,
        deletedBy: 'production',
        snapshotJson: JSON.parse(JSON.stringify(trashedCost)),
      },
      {
        entityType: 'loss',
        entityId: trashedLoss.id,
        groupId: crypto.randomUUID(),
        deletedAt: trashDeletedAt,
        purgeAt: trashPurgeAt,
        deletedBy: 'production',
        snapshotJson: JSON.parse(JSON.stringify(trashedLoss)),
      },
    ],
  })

  // 10. Auditoría realista (para poblar Administración → Resumen y Auditoría)
  const auditEntries = [
    {
      entity: 'SystemSetting',
      entityId: 'institution',
      action: 'UPDATE',
      actor: 'admin',
      afterJson: { organizationName: 'Lodana Agro', farmName: 'Finca Experimental Lodana' },
      createdAt: ecTimestamp(dayAgo(12), 14, 10),
    },
    {
      entity: 'SystemSetting',
      entityId: 'reporting',
      action: 'UPDATE',
      actor: 'admin',
      afterJson: { autoWeeklyEnabled: true, autoMonthlyEnabled: true, maxBackfillMonths: 6 },
      createdAt: ecTimestamp(dayAgo(12), 14, 15),
    },
    {
      entity: 'Harvest',
      entityId: curH4.id,
      action: 'CREATE',
      actor: 'production',
      afterJson: { crop: 'Banano', variety: 'Orito', quantity: '110.00', unit: 'racimos' },
      createdAt: ecTimestamp(dayAgo(8), 13, 25),
    },
    {
      entity: 'Harvest',
      entityId: curH5.id,
      action: 'CREATE',
      actor: 'production',
      afterJson: { crop: 'Limón Tahití', quantity: '38.00', unit: 'sacos' },
      createdAt: ecTimestamp(dayAgo(7), 14, 0),
    },
    {
      entity: 'Shipment',
      entityId: curShip1.id,
      action: 'CREATE',
      actor: 'production',
      afterJson: { code: curShip1.code, itemsCount: 3, status: 'IN_TRANSIT' },
      createdAt: ecTimestamp(dayAgo(7), 14, 45),
    },
    {
      entity: 'Reception',
      entityId: curRec1.id,
      action: 'RECEIVE',
      actor: 'reception',
      afterJson: { shipmentCode: curShip1.code, receiptNumber: curRec1.receiptNumber, closesWithDifferences: false },
      createdAt: ecTimestamp(dayAgo(7), 15, 20),
    },
    {
      entity: 'Cost',
      entityId: trashedCost.id,
      action: 'TRASH',
      actor: 'production',
      afterJson: { description: trashedCost.description, amountUsd: '95.00' },
      createdAt: ecTimestamp(dayAgo(1), 17, 30),
    },
    {
      entity: 'Harvest',
      entityId: trashedHarvest.id,
      action: 'TRASH',
      actor: 'production',
      afterJson: { crop: 'Plátano', quantity: '15.00', reason: 'Registro duplicado' },
      createdAt: ecTimestamp(dayAgo(1), 17, 32),
    },
    {
      entity: 'Shipment',
      entityId: diffShipCur.id,
      action: 'CLOSE_WITH_DIFFERENCES',
      actor: 'reception',
      afterJson: { code: diffShipCur.code, sent: '18.00', received: '16.00' },
      createdAt: ecTimestamp(dayAgo(3), 16, 20),
    },
    {
      entity: 'Shipment',
      entityId: partialShip.id,
      action: 'CREATE',
      actor: 'production',
      afterJson: { code: partialShip.code, itemsCount: 2, status: 'IN_TRANSIT' },
      createdAt: ecTimestamp(dayAgo(2), 14, 15),
    },
    {
      entity: 'Reception',
      entityId: partialRec.id,
      action: 'RECEIVE_PARTIAL',
      actor: 'reception',
      afterJson: { shipmentCode: partialShip.code, receiptNumber: partialRec.receiptNumber },
      createdAt: ecTimestamp(dayAgo(2), 15, 45),
    },
    {
      entity: 'MarketSale',
      entityId: curRec2.items[0].id,
      action: 'CANCEL',
      actor: 'reception',
      afterJson: { crop: 'Pimiento', quantity: '10.00', totalUsd: '22.50' },
      createdAt: ecTimestamp(dayAgo(1), 19, 0),
    },
    {
      entity: 'Harvest',
      entityId: curH10.id,
      action: 'CREATE',
      actor: 'production',
      afterJson: { crop: 'Banano', variety: 'Cavendish', quantity: '85.00', unit: 'racimos' },
      createdAt: ecTimestamp(today, 13, 30),
    },
    {
      entity: 'Shipment',
      entityId: 'ENV-2026-PEND-02',
      action: 'CREATE',
      actor: 'production',
      afterJson: { code: 'ENV-2026-PEND-02', itemsCount: 3, status: 'IN_TRANSIT' },
      createdAt: ecTimestamp(today, 14, 15),
    },
    {
      entity: 'MarketSale',
      entityId: partialRec.items[0].id,
      action: 'CREATE',
      actor: 'reception',
      afterJson: { crop: 'Banano · Orito', quantity: '8.00', totalUsd: '76.00', payment: 'CASH' },
      createdAt: ecTimestamp(today, 16, 5),
    },
    {
      entity: 'MarketSale',
      entityId: partialRec.items[1].id,
      action: 'CREATE',
      actor: 'reception',
      afterJson: { crop: 'Tomate · Riñón', quantity: '5.00', totalUsd: '80.00', payment: 'TRANSFER' },
      createdAt: ecTimestamp(today, 16, 40),
    },
  ]

  await prisma.auditLog.createMany({ data: auditEntries })

  console.log('Base de datos poblada correctamente con datos completos de simulación.')
}

main()
  .catch((error) => {
    console.error('Error al poblar la base de datos de simulación:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
