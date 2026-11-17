import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
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
      variety: true,
      productionArea: true,
      unit: true,
    },
  },
  reason: true,
}

export async function GET() {
  const rows = await prisma.loss.findMany({
    where: { status: 'ACTIVE' },
    include: lossInclude,
    orderBy: { date: 'desc' },
    take: 100,
  })

  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>

    const date = parseDate(body.date)
    const harvestId =
      typeof body.harvestId === 'string' ? body.harvestId : ''
    const quantity = parsePositiveDecimal(body.quantity)
    const reasonName = cleanName(body.reason)

    if (!date || !harvestId || !quantity || !reasonName) {
      return NextResponse.json(
        { error: 'Selecciona una cosecha e indica fecha, cantidad y motivo.' },
        { status: 400 }
      )
    }

    const row = await prisma.$transaction(async (tx) => {
      const harvest = await tx.harvest.findFirst({
        where: { id: harvestId, status: 'ACTIVE' },
      })

      if (!harvest) {
        throw new Error('La cosecha seleccionada no existe o está inactiva.')
      }

      const [losses, allocations] = await Promise.all([
        tx.loss.aggregate({
          where: { harvestId, status: 'ACTIVE' },
          _sum: { quantity: true },
        }),
        tx.shipmentAllocation.aggregate({
          where: { harvestId },
          _sum: { quantity: true },
        }),
      ])

      const harvested = Number(harvest.quantity)
      const alreadyLost = Number(losses._sum.quantity ?? 0)
      const alreadyShipped = Number(allocations._sum.quantity ?? 0)
      const available = harvested - alreadyLost - alreadyShipped

      if (quantity > available) {
        throw new Error(
          `Cantidad superior a la disponible. Existencias de esta cosecha: ${Math.max(0, available)} ${harvest.unitId ? '' : ''}.`
        )
      }

      const normalizedName = normalizeName(reasonName)

      const reason = await tx.lossReason.upsert({
        where: { normalizedName },
        update: { name: reasonName, active: true },
        create: { name: reasonName, normalizedName },
      })

      return tx.loss.create({
        data: {
          harvestId,
          date,
          quantity,
          reasonId: reason.id,
          notes: cleanName(body.notes) || null,
        },
        include: lossInclude,
      })
    })

    return NextResponse.json(row, { status: 201 })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo registrar la merma.'

    if (
      message.includes('no existe') ||
      message.includes('disponible')
    ) {
      return NextResponse.json({ error: message }, { status: 400 })
    }

    console.error('Error al registrar merma:', error)

    return NextResponse.json(
      { error: 'No se pudo registrar la merma.' },
      { status: 500 }
    )
  }
}