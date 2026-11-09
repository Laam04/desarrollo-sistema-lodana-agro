import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; return NextResponse.json(await prisma.unit.update({ where: { id }, data: { active: false } })) }
