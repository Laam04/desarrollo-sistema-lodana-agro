import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { moveToTrash } from '@/lib/trash'
import {
  cleanName,
  normalizeName,
  parseDate,
  parsePositiveDecimal,
} from '@/lib/production-validation'

const lossInclude = {
  harvest: {
    include: {
      crop: true,
      variety: {
        where: { deletedAt: null },
      },
      productionArea: {
        where: { deletedAt: null },
      },
      unit: true,
    },
  },
  reason: true,
}

export async function GET() {
  try {
    const rows = await prisma.loss.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        harvest: {
          is: {
            deletedAt: null,
          },
        },
      },
      include: lossInclude,
      orderBy: { date: 'desc' },
      take: 100,
    })

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error al consultar mermas:', error)

    return NextResponse.json(
      { error: 'No se pudieron consultar las mermas.' },
      { status: 500 },
    )
  }
}


export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>

    const date = parseDate(body.date)
    const harvestId =
      typeof body.harvestId === 'string' ? body.harvestId : ''
    const quantity = parsePositiveDecimal(body.quantity)
    const reasonName = cleanName(body.reason)
    const affectsHarvest = body.affectsHarvest

    if (
      !date ||
      !harvestId ||
      !quantity ||
      !reasonName ||
      typeof affectsHarvest !== 'boolean'
    ) {
      return NextResponse.json(
        {
          error:
            'Selecciona una cosecha, indica fecha, cantidad, motivo y si la merma afecta a la producción útil.',
        },
        { status: 400 },
      )
    }

    const row = await prisma.$transaction(async (tx) => {
      const harvest = await tx.harvest.findFirst({
        where: {
          id: harvestId,
          status: 'ACTIVE',
          deletedAt: null,
        },
      })

      if (!harvest) {
        throw new Error('La cosecha seleccionada no existe o está inactiva.')
      }

      if (affectsHarvest) {
        const [allocations, previousLosses] = await Promise.all([
          tx.shipmentAllocation.aggregate({
            where: {
              harvestId,
              deletedAt: null,
              shipmentItem: {
                deletedAt: null,
                shipment: {
                  deletedAt: null,
                  status: { not: 'CANCELLED' },
                },
              },
            },
            _sum: { quantity: true },
          }),

          tx.loss.aggregate({
            where: {
              harvestId,
              status: 'ACTIVE',
              deletedAt: null,
              affectsHarvest: true,
            },
            _sum: { quantity: true },
          }),
        ])

        const harvested = Number(harvest.quantity)
        const alreadyShipped = Number(
          allocations._sum.quantity ?? 0,
        )
        const previousLossesTotal = Number(
          previousLosses._sum.quantity ?? 0,
        )

        const available =
          harvested - alreadyShipped - previousLossesTotal

        if (quantity > available) {
          throw new Error(
            `Cantidad superior a la producción útil disponible. Disponible: ${Math.max(0, available)}.`,
          )
        }
      }

      const normalizedName = normalizeName(reasonName)

      const existingReason = await tx.lossReason.findUnique({
        where: { normalizedName },
      })

      if (existingReason?.deletedAt) {
        throw new Error('LOSS_REASON_IN_TRASH')
      }

      const reason = existingReason
        ? await tx.lossReason.update({
            where: { id: existingReason.id },
            data: { name: reasonName, active: true },
          })
        : await tx.lossReason.create({
            data: { name: reasonName, normalizedName },
          })

      return tx.loss.create({
        data: {
          harvestId,
          date,
          quantity,
          affectsHarvest,
          reasonId: reason.id,
          notes: cleanName(body.notes) || null,
        },
        include: lossInclude,
      })
    })

    return NextResponse.json(row, { status: 201 })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'No se pudo registrar la merma.'

    if (message === 'LOSS_REASON_IN_TRASH') {
      return NextResponse.json(
        {
          error:
            'Este motivo de merma está en la papelera. Restáuralo antes de utilizarlo nuevamente.',
        },
        { status: 409 },
      )
    }

    if (
      message.includes('no existe') ||
      message.includes('disponible')
    ) {
      return NextResponse.json({ error: message }, { status: 400 })
    }

    console.error('Error al registrar merma:', error)

    return NextResponse.json(
      { error: 'No se pudo registrar la merma.' },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json()
    const id = typeof body.id === 'string' ? body.id : ''

    if (!id) {
      return NextResponse.json(
        { error: 'Falta el identificador de la merma.' },
        { status: 400 },
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const loss = await tx.loss.findUnique({
        where: { id },
      })

      if (!loss) {
        return { type: 'NOT_FOUND' as const }
      }

      if (loss.deletedAt) {
        return { type: 'ALREADY_DELETED' as const }
      }

      const groupId = `loss-${loss.id}-${Date.now()}`

      await moveToTrash(tx, 'loss', loss.id, groupId)

      return { type: 'DELETED' as const, groupId }
    })

    if (result.type === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'La merma no existe.' },
        { status: 404 },
      )
    }

    if (result.type === 'ALREADY_DELETED') {
      return NextResponse.json(
        { error: 'La merma ya está en la papelera.' },
        { status: 409 },
      )
    }

    return NextResponse.json({
      success: true,
      message: 'La merma se movió a la papelera.',
      groupId: result.groupId,
    })
  } catch (error) {
    console.error('Error al mover la merma a la papelera:', error)

    return NextResponse.json(
      { error: 'No se pudo mover la merma a la papelera.' },
      { status: 500 },
    )
  }
}