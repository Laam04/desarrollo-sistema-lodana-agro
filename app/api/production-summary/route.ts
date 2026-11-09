import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const [harvests, losses, costs, shipments] = await Promise.all([
    prisma.harvest.aggregate({ where: { status: 'ACTIVE' }, _count: true, _sum: { quantity: true } }),
    prisma.loss.aggregate({ where: { status: 'ACTIVE' }, _count: true, _sum: { quantity: true } }),
    prisma.cost.aggregate({ _count: true, _sum: { amountUsd: true } }),
    prisma.shipment.aggregate({ where: { status: 'ACTIVE' }, _count: true, _sum: { quantity: true, marketQuantity: true, totalAmount: true } }),
  ])
  return NextResponse.json({ harvests, losses, costs, shipments })
}
