import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma, runSerializable } from '@/lib/prisma'
import { ProductionError, productionError, readBody, requireProfile } from '@/lib/production-api'
import { marketDay } from '@/lib/market-data'
import { cleanName, normalizeName, parseDate, parsePositiveDecimal } from '@/lib/production-validation'

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

function parseNumericCell(raw: string | undefined): number | null {
  if (!raw) return null
  const normalized = raw.replace(/\$/g, '').replace(/\s+/g, '').replace(',', '.')
  return parsePositiveDecimal(normalized)
}

export async function GET() {
  try {
    await requireProfile(['reception', 'production', 'admin'])
    const [rows, crops, units] = await Promise.all([
      prisma.marketReferencePrice.findMany({
        where: { crop: { deletedAt: null }, unit: { deletedAt: null } },
        include: {
          crop: { select: { id: true, name: true, active: true, unit: { select: { id: true, name: true } } } },
          unit: { select: { id: true, name: true } },
        },
        orderBy: [{ crop: { name: 'asc' } }, { unit: { name: 'asc' } }],
      }),
      prisma.crop.findMany({
        where: { active: true, deletedAt: null },
        select: { id: true, name: true, unitId: true, unit: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.unit.findMany({
        where: { active: true, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ])

    return NextResponse.json({
      rows: rows.map((row) => ({
        id: row.id,
        cropId: row.cropId,
        cropName: row.crop.name,
        unitId: row.unitId,
        unitName: row.unit.name,
        priceUsd: row.priceUsd.toFixed(2),
        minPriceUsd: row.minPriceUsd ? row.minPriceUsd.toFixed(2) : null,
        maxPriceUsd: row.maxPriceUsd ? row.maxPriceUsd.toFixed(2) : null,
        marketName: row.marketName,
        source: row.source,
        effectiveDate: row.effectiveDate.toISOString().slice(0, 10),
        notes: row.notes,
        updatedBy: row.updatedBy,
        updatedAt: row.updatedAt.toISOString(),
      })),
      crops,
      units,
    })
  } catch (error) {
    return productionError(error, 'No se pudieron consultar los precios de referencia del mercado.')
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireProfile(['reception', 'admin'])
    const body = await readBody(request)
    const cropId = typeof body.cropId === 'string' ? body.cropId : ''
    const unitIdInput = typeof body.unitId === 'string' ? body.unitId : ''
    const unitNameInput = cleanName(body.unitName)
    const priceUsd = parsePositiveDecimal(body.priceUsd)
    const minPriceUsd =
      body.minPriceUsd === undefined || body.minPriceUsd === null || body.minPriceUsd === ''
        ? null
        : parsePositiveDecimal(body.minPriceUsd)
    const maxPriceUsd =
      body.maxPriceUsd === undefined || body.maxPriceUsd === null || body.maxPriceUsd === ''
        ? null
        : parsePositiveDecimal(body.maxPriceUsd)
    const effectiveDate = parseDate(body.effectiveDate ?? marketDay())
    const marketName = cleanName(body.marketName).slice(0, 120) || 'Mercado local (Manabí)'
    const source = cleanName(body.source).slice(0, 120) || 'Referencia SIPA-MAG / mercado local'
    const notes = cleanName(body.notes).slice(0, 500) || null

    if (!cropId || (!unitIdInput && !unitNameInput) || !priceUsd || !effectiveDate) {
      throw new ProductionError('Selecciona cultivo, unidad, precio de mercado positivo y fecha válida.')
    }
    if ((body.minPriceUsd && minPriceUsd === null) || (body.maxPriceUsd && maxPriceUsd === null)) {
      throw new ProductionError('Los precios mínimo y máximo deben ser valores positivos de hasta dos decimales.')
    }
    if (minPriceUsd !== null && maxPriceUsd !== null && minPriceUsd > maxPriceUsd) {
      throw new ProductionError('El precio mínimo no puede superar al precio máximo.')
    }

    const saved = await runSerializable(async (tx) => {
      const crop = await tx.crop.findFirst({ where: { id: cropId, deletedAt: null }, select: { id: true, name: true } })
      if (!crop) throw new ProductionError('El cultivo seleccionado no existe.', 404)

      let unit = unitIdInput
        ? await tx.unit.findFirst({ where: { id: unitIdInput, deletedAt: null }, select: { id: true, name: true } })
        : null
      if (!unit && unitNameInput) {
        const lower = unitNameInput.toLowerCase()
        const existingUnits = await tx.unit.findMany({ where: { deletedAt: null }, select: { id: true, name: true } })
        unit = existingUnits.find((u) => normalizeName(u.name) === normalizeName(lower)) ?? null
        if (!unit) {
          unit = await tx.unit.create({
            data: { name: lower.slice(0, 40), active: true },
            select: { id: true, name: true },
          })
        }
      }
      if (!unit) throw new ProductionError('Selecciona o escribe una unidad válida.', 400)

      const before = await tx.marketReferencePrice.findUnique({
        where: { cropId_unitId: { cropId: crop.id, unitId: unit.id } },
      })

      const record = await tx.marketReferencePrice.upsert({
        where: { cropId_unitId: { cropId: crop.id, unitId: unit.id } },
        create: {
          cropId: crop.id,
          unitId: unit.id,
          priceUsd: new Prisma.Decimal(priceUsd),
          minPriceUsd: minPriceUsd === null ? null : new Prisma.Decimal(minPriceUsd),
          maxPriceUsd: maxPriceUsd === null ? null : new Prisma.Decimal(maxPriceUsd),
          marketName,
          source,
          effectiveDate,
          notes,
          updatedBy: actor,
        },
        update: {
          priceUsd: new Prisma.Decimal(priceUsd),
          minPriceUsd: minPriceUsd === null ? null : new Prisma.Decimal(minPriceUsd),
          maxPriceUsd: maxPriceUsd === null ? null : new Prisma.Decimal(maxPriceUsd),
          marketName,
          source,
          effectiveDate,
          notes,
          updatedBy: actor,
        },
        include: {
          crop: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true } },
        },
      })

      await tx.auditLog.create({
        data: {
          entity: 'MarketReferencePrice',
          entityId: record.id,
          action: before ? 'UPDATE' : 'CREATE',
          actor,
          beforeJson: before
            ? { priceUsd: before.priceUsd.toFixed(2), marketName: before.marketName, source: before.source }
            : undefined,
          afterJson: {
            crop: crop.name,
            unit: unit.name,
            priceUsd: record.priceUsd.toFixed(2),
            marketName: record.marketName,
            source: record.source,
          },
        },
      })

      return record
    })

    return NextResponse.json(
      {
        id: saved.id,
        cropId: saved.cropId,
        cropName: saved.crop.name,
        unitId: saved.unitId,
        unitName: saved.unit.name,
        priceUsd: saved.priceUsd.toFixed(2),
        minPriceUsd: saved.minPriceUsd ? saved.minPriceUsd.toFixed(2) : null,
        maxPriceUsd: saved.maxPriceUsd ? saved.maxPriceUsd.toFixed(2) : null,
        marketName: saved.marketName,
        source: saved.source,
        effectiveDate: saved.effectiveDate.toISOString().slice(0, 10),
        notes: saved.notes,
        updatedBy: saved.updatedBy,
        updatedAt: saved.updatedAt.toISOString(),
      },
      { status: 201 },
    )
  } catch (error) {
    return productionError(error, 'No se pudo guardar el precio de referencia del mercado.')
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await requireProfile(['reception', 'admin'])
    const body = await readBody(request, 512 * 1024)
    const csv = typeof body.csv === 'string' ? body.csv : ''
    if (!csv.trim()) {
      throw new ProductionError('Pega o sube un archivo CSV con los precios de mercado.')
    }

    const rawLines = csv
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)

    if (!rawLines.length || rawLines.length > 500) {
      throw new ProductionError('El archivo CSV debe tener entre 1 y 500 filas.')
    }

    const delimiter = rawLines[0].includes(';') && !rawLines[0].includes(',') ? ';' : ','
    const firstCells = parseCsvLine(rawLines[0], delimiter).map((c) => normalizeName(c))
    const hasHeader =
      firstCells.some((c) => c.includes('cultivo') || c.includes('producto')) &&
      firstCells.some((c) => c.includes('precio'))

    const dataLines = hasHeader ? rawLines.slice(1) : rawLines
    const defaultDate = parseDate(marketDay())!

    const summary = await runSerializable(async (tx) => {
      const crops = await tx.crop.findMany({ where: { deletedAt: null }, select: { id: true, name: true, normalizedName: true } })
      const units = await tx.unit.findMany({ where: { deletedAt: null }, select: { id: true, name: true } })
      const cropByNorm = new Map(crops.map((c) => [c.normalizedName, c]))
      const unitByNorm = new Map(units.map((u) => [normalizeName(u.name), u]))

      let imported = 0
      const errors: string[] = []

      for (let i = 0; i < dataLines.length; i++) {
        const lineNo = hasHeader ? i + 2 : i + 1
        const cells = parseCsvLine(dataLines[i], delimiter)
        const cropRaw = cleanName(cells[0])
        const unitRaw = cleanName(cells[1])
        const price = parseNumericCell(cells[2])
        const minPrice = parseNumericCell(cells[3])
        const maxPrice = parseNumericCell(cells[4])
        const marketName = cleanName(cells[5]).slice(0, 120) || 'Mercado local (Manabí)'
        const source = cleanName(cells[6]).slice(0, 120) || 'Importación CSV (SIPA-MAG)'
        const dateVal = cells[7] ? parseDate(cells[7]) : defaultDate

        if (!cropRaw || !unitRaw || !price || !dateVal) {
          errors.push(`Fila ${lineNo}: faltan datos válidos (cultivo, unidad y precio positivo).`)
          continue
        }

        const crop = cropByNorm.get(normalizeName(cropRaw))
        if (!crop) {
          errors.push(`Fila ${lineNo}: cultivo «${cropRaw}» no encontrado en el catálogo.`)
          continue
        }

        let unit = unitByNorm.get(normalizeName(unitRaw))
        if (!unit) {
          const createdUnit = await tx.unit.create({
            data: { name: unitRaw.toLowerCase().slice(0, 40), active: true },
            select: { id: true, name: true },
          })
          unit = createdUnit
          unitByNorm.set(normalizeName(createdUnit.name), createdUnit)
        }

        await tx.marketReferencePrice.upsert({
          where: { cropId_unitId: { cropId: crop.id, unitId: unit.id } },
          create: {
            cropId: crop.id,
            unitId: unit.id,
            priceUsd: new Prisma.Decimal(price),
            minPriceUsd: minPrice === null ? null : new Prisma.Decimal(minPrice),
            maxPriceUsd: maxPrice === null ? null : new Prisma.Decimal(maxPrice),
            marketName,
            source,
            effectiveDate: dateVal,
            updatedBy: actor,
          },
          update: {
            priceUsd: new Prisma.Decimal(price),
            minPriceUsd: minPrice === null ? null : new Prisma.Decimal(minPrice),
            maxPriceUsd: maxPrice === null ? null : new Prisma.Decimal(maxPrice),
            marketName,
            source,
            effectiveDate: dateVal,
            updatedBy: actor,
          },
        })
        imported++
      }

      if (imported > 0) {
        await tx.auditLog.create({
          data: {
            entity: 'MarketReferencePrice',
            entityId: 'bulk-csv',
            action: 'IMPORT_CSV',
            actor,
            afterJson: { imported, skipped: errors.length },
          },
        })
      }

      return { imported, skipped: errors.length, errors: errors.slice(0, 15) }
    })

    return NextResponse.json(summary)
  } catch (error) {
    return productionError(error, 'No se pudo importar el CSV de precios de mercado.')
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireProfile(['reception', 'admin'])
    const body = await readBody(request)
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) throw new ProductionError('Indica el precio de referencia que deseas eliminar.')

    await runSerializable(async (tx) => {
      const existing = await tx.marketReferencePrice.findUnique({
        where: { id },
        include: { crop: { select: { name: true } }, unit: { select: { name: true } } },
      })
      if (!existing) throw new ProductionError('El precio de referencia ya no existe.', 404)
      await tx.marketReferencePrice.delete({ where: { id } })
      await tx.auditLog.create({
        data: {
          entity: 'MarketReferencePrice',
          entityId: id,
          action: 'DELETE',
          actor,
          beforeJson: {
            crop: existing.crop.name,
            unit: existing.unit.name,
            priceUsd: existing.priceUsd.toFixed(2),
          },
        },
      })
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return productionError(error, 'No se pudo eliminar el precio de referencia.')
  }
}
