import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
const clean = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; const name = clean((await request.json()).name); if (!name) return NextResponse.json({ error: 'La variedad es obligatoria.' }, { status: 400 }); return NextResponse.json(await prisma.variety.update({ where: { id }, data: { name, normalizedName: name.toLocaleLowerCase('es-EC') } })) }
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; return NextResponse.json(await prisma.variety.update({ where: { id }, data: { active: false } })) }
