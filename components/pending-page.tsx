'use client'

import Link from 'next/link'
import { ArrowLeft, CircleDashed } from 'lucide-react'

export function PendingPage({ title, description }: { title: string; description: string }) {
  return (
    <main className="min-h-screen bg-[#f7f8f5] px-6 py-12 text-[#20302b] dark:bg-[#111715] dark:text-[#edf2ed] sm:px-10">
      <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-[#e4f0e7] text-[#2c6048] dark:bg-[#234634] dark:text-[#c9e7d0]"><CircleDashed /></div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-[#2c6048]">Módulo Lodana Agro</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">{description}</p>
        <Link href="/" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#2c6048] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#234d39]"><ArrowLeft />Volver al inicio</Link>
      </div>
    </main>
  )
}
