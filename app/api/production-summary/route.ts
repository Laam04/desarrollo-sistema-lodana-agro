import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cropId = searchParams.get('cropId') || undefined
  const from = searchParams.get('from') ? new Date(`${searchParams.get('from')}T00:00:00.000Z`) : undefined
  const to = searchParams.get('to') ? new Date(`${searchParams.get('to')}T23:59:59.999Z`) : undefined
  const date = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined
  const [harvests, losses, costs, shipments] = await Promise.all([
    prisma.harvest.aggregate({ where: { status: 'ACTIVE', cropId, ...(date ? { date } : {}) }, _count: true, _sum: { quantity: true } }),
    prisma.loss.aggregate({ where: { status: 'ACTIVE', cropId, ...(date ? { date } : {}) }, _count: true, _sum: { quantity: true } }),
    prisma.cost.aggregate({ where: { active: true, ...(date ? { date } : {}) }, _count: true, _sum: { amountUsd: true } }),
    prisma.shipment.aggregate({ where: { status: 'ACTIVE', cropId, ...(date ? { date } : {}) }, _count: true, _sum: { quantity: true, marketQuantity: true, totalAmount: true } }),
  ])
  return NextResponse.json({ harvests, losses, costs, shipments })
}
