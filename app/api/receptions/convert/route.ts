import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma, runSerializable } from '@/lib/prisma'
import { ProductionError, productionError, readBody, requireProfile } from '@/lib/production-api'
import { cleanName, normalizeName, parsePositiveDecimal } from '@/lib/production-validation'

export async function POST(request: Request) {
  try {
    const actor = await requireProfile(['reception', 'admin'])
    const body = await readBody(request)
    const receptionItemId = typeof body.receptionItemId === 'string' ? body.receptionItemId : ''
    const targetUnitId = typeof body.targetUnitId === 'string' ? body.targetUnitId : ''
    const targetUnitName = cleanName(body.targetUnitName)
    const targetQuantity = parsePositiveDecimal(body.targetQuantity)
    const customerUnitPrice =
      body.customerUnitPrice === undefined || body.customerUnitPrice === null || body.customerUnitPrice === ''
        ? null
        : parsePositiveDecimal(body.customerUnitPrice)
    const notes = cleanName(body.notes).slice(0, 500)

    if (!receptionItemId || (!targetUnitId && !targetUnitName) || !targetQuantity) {
      throw new ProductionError('Selecciona el producto recibido, la nueva unidad y la cantidad equivalente.')
    }
    if (body.customerUnitPrice != null && body.customerUnitPrice !== '' && customerUnitPrice === null) {
      throw new ProductionError('El precio referencial debe ser positivo de hasta dos decimales.')
    }

    const result = await runSerializable(async (tx) => {
      const source = await tx.receptionItem.findFirst({
        where: {
          id: receptionItemId,
          deletedAt: null,
          reception: { deletedAt: null, shipment: { deletedAt: null, status: { not: 'CANCELLED' } } },
          shipmentItem: { deletedAt: null },
        },
        include: {
          reception: { select: { id: true, receiptNumber: true } },
          shipmentItem: { include: { crop: true, variety: true, productionArea: true, unit: true } },
          saleUnit: true,
        },
      })
      if (!source) {
        throw new ProductionError('El producto recibido no existe o ya no está disponible.', 404)
      }

      let targetUnit = targetUnitId
        ? await tx.unit.findFirst({ where: { id: targetUnitId, deletedAt: null }, select: { id: true, name: true } })
        : null
      if (!targetUnit && targetUnitName) {
        const allUnits = await tx.unit.findMany({ where: { deletedAt: null }, select: { id: true, name: true } })
        targetUnit = allUnits.find((u) => normalizeName(u.name) === normalizeName(targetUnitName)) ?? null
        if (!targetUnit) {
          targetUnit = await tx.unit.create({
            data: { name: targetUnitName.toLowerCase().slice(0, 40), active: true },
            select: { id: true, name: true },
          })
        }
      }
      if (!targetUnit) {
        throw new ProductionError('Selecciona o escribe una unidad destino válida.')
      }

      const currentUnitId = source.saleUnitId ?? source.shipmentItem.unitId
      const currentUnitName = source.saleUnit?.name ?? source.shipmentItem.unit.name
      if (targetUnit.id === currentUnitId) {
        throw new ProductionError(`El producto ya está en «${currentUnitName}». Elige una unidad distinta.`)
      }

      const [soldAgg, convertedAgg] = await Promise.all([
        tx.marketSale.aggregate({
          where: { receptionItemId: source.id, cancelledAt: null },
          _sum: { quantity: true },
        }),
        tx.receptionItem.aggregate({
          where: { parentItemId: source.id, deletedAt: null },
          _sum: { convertedFromQty: true },
        }),
      ])

      const effectiveTotal = source.saleQuantity ?? source.receivedQuantity
      const sold = soldAgg._sum.quantity ?? new Prisma.Decimal(0)
      const convertedOut = convertedAgg._sum.convertedFromQty ?? new Prisma.Decimal(0)
      const available = effectiveTotal.minus(sold).minus(convertedOut)
      if (available.lte(0)) {
        throw new ProductionError('Este producto ya no tiene saldo disponible para cambiar de presentación.', 409)
      }

      const sourceUnitCost = source.saleUnitCost ?? source.shipmentItem.estimatedUnitPrice
      const newUnitCost =
        sourceUnitCost && sourceUnitCost.gt(0)
          ? sourceUnitCost.mul(available).div(targetQuantity).toDecimalPlaces(4)
          : null

      const conversionNote =
        notes || `Cambio de presentación: ${available.toFixed(2)} ${currentUnitName} → ${targetQuantity.toFixed(2)} ${targetUnit.name}`

      const created = await tx.receptionItem.create({
        data: {
          receptionId: source.receptionId,
          shipmentItemId: source.shipmentItemId,
          parentItemId: source.id,
          receivedQuantity: new Prisma.Decimal(0),
          convertedFromQty: available,
          saleUnitId: targetUnit.id,
          saleQuantity: new Prisma.Decimal(targetQuantity),
          saleUnitCost: newUnitCost,
          customerUnitPrice: customerUnitPrice === null ? null : new Prisma.Decimal(customerUnitPrice),
          notes: conversionNote.slice(0, 2000),
        },
        include: {
          saleUnit: true,
        },
      })

      await tx.auditLog.create({
        data: {
          entity: 'ReceptionItem',
          entityId: created.id,
          action: 'CONVERT_UNIT',
          actor,
          beforeJson: {
            sourceItemId: source.id,
            receiptNumber: source.reception.receiptNumber,
            crop: source.shipmentItem.crop.name,
            quantity: available.toFixed(2),
            unit: currentUnitName,
            unitCost: sourceUnitCost ? sourceUnitCost.toFixed(4) : null,
          },
          afterJson: {
            newItemId: created.id,
            quantity: created.saleQuantity?.toFixed(2) ?? null,
            unit: targetUnit.name,
            unitCost: newUnitCost ? newUnitCost.toFixed(4) : null,
          },
        },
      })

      return {
        id: created.id,
        crop: source.shipmentItem.crop.name,
        fromQuantity: available.toFixed(2),
        fromUnit: currentUnitName,
        toQuantity: targetQuantity.toFixed(2),
        toUnit: targetUnit.name,
        newUnitCost: newUnitCost ? newUnitCost.toFixed(2) : null,
      }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return productionError(error, 'No se pudo cambiar la presentación del producto.')
  }
}
