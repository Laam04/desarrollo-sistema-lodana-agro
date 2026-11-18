
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const [
      harvests,
      losses,
      affectingLosses,
      costs,
      shipments,
      shipmentItems,
    ] = await Promise.all([
      prisma.harvest.aggregate({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
        },
        _count: true,
        _sum: { quantity: true },
      }),
      prisma.loss.aggregate({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
        },
        _count: true,
        _sum: { quantity: true },
      }),
      prisma.loss.aggregate({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          affectsHarvest: true,
        },
        _count: true,
        _sum: { quantity: true },
      }),
      prisma.cost.aggregate({
        where: {
          deletedAt: null,
        },
        _count: true,
        _sum: { amountUsd: true },
      }),
      prisma.shipment.aggregate({
        where: {
          deletedAt: null,
          status: { not: 'CANCELLED' },
        },
        _count: true,
      }),
      prisma.shipmentItem.aggregate({
        where: {
          deletedAt: null,
          shipment: {
            deletedAt: null,
            status: { not: 'CANCELLED' },
          },
        },
        _sum: {
          quantity: true,
          estimatedTotalAmount: true,
        },
      }),
    ])

    const usefulProduction = Math.max(
      0,
      Number(harvests._sum.quantity ?? 0) -
        Number(affectingLosses._sum.quantity ?? 0),
    )

    return NextResponse.json({
      harvests,
      losses,
      affectingLosses,
      usefulProduction,
      costs,
      shipments: {
        _count: shipments._count,
        _sum: {
          quantity: shipmentItems._sum.quantity,
          estimatedTotalAmount:
            shipmentItems._sum.estimatedTotalAmount,
        },
      },
    })
  } catch (error) {
    console.error('Error al generar resumen:', error)
    return NextResponse.json(
      { error: 'No se pudo generar el resumen.' },
      { status: 500 },
    )
  }
}
