'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Leaf, PackageCheck, Search, Settings, ArrowRight, X, ShieldCheck } from 'lucide-react'
import { productionFetch } from '@/lib/production-client'

type Profile = 'production' | 'reception' | 'queries' | 'admin'

const profiles = [
  { id: 'production' as const, title: 'Producción agrícola', description: 'Registra y consulta cosechas, lotes, mermas y costos de producción.', icon: Leaf, color: 'green' },
  { id: 'reception' as const, title: 'Agro Market', description: 'Gestiona la entrada de productos y movimientos de Agro Market.', icon: PackageCheck, color: 'amber' },
  { id: 'queries' as const, title: 'Consultas y reportes', description: 'Explora estadísticas públicas o ingresa con PIN al centro de reportes automáticos.', icon: Search, color: 'blue' },
]

export function ProfileSelector() {
  const [selected, setSelected] = useState<Profile | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pinRef = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!selected || !dialog) return
    dialog.showModal()
    pinRef.current?.focus()
    return () => dialog.close()
  }, [selected])

  const selectedProfile = selected === 'admin' ? { title: 'Administración', icon: ShieldCheck, color: 'violet' } : profiles.find((profile) => profile.id === selected)

  function openPin(profile: Profile) {
    setSelected(profile)
    setPin('')
    setError('')
  }

  function changePin(value: string) {
    if (submitting.current) return
    const next = value.slice(0, 4)
    setPin(next)
    setError('')
    if (next.length === 4) void submitPin(next)
  }

  async function submitPin(value: string) {
    if (!selected || value.length !== 4 || submitting.current) return
    submitting.current = true
    setLoading(true)
    setError('')
    try {
      await productionFetch('/api/profile-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: selected, pin: value }) })
      window.location.assign(
        selected === 'admin'
          ? '/administracion'
          : selected === 'production'
            ? '/lodana'
            : selected === 'queries'
              ? '/reportes'
              : '/agro-market',
      )
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo iniciar sesión.')
      setPin('')
      setLoading(false)
      submitting.current = false
      pinRef.current?.focus()
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f8f4] px-5 py-8 text-[#20352b] dark:bg-[#101713] dark:text-[#edf4ee] sm:px-8 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-2xl bg-[#2c6048] text-white shadow-sm"><Leaf /></div><div><p className="text-xl font-semibold tracking-tight">Lodana Agro</p><p className="text-xs text-muted-foreground">Gestión agrícola</p></div></div>
          <button type="button" aria-label="Administración" onClick={() => openPin('admin')} className="rounded-xl p-2.5 text-muted-foreground transition hover:bg-white hover:text-[#2c6048] dark:hover:bg-[#1b2920]"><Settings aria-hidden="true" /></button>
        </header>
        <section className="flex flex-1 flex-col justify-center py-12"><div className="mx-auto max-w-2xl text-center"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2c6048]">Bienvenido</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">Selecciona un espacio de trabajo</h1><p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">Elige el área a la que deseas ingresar para comenzar a trabajar con la información de tu operación agrícola.</p></div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">{profiles.map(({ id, title, description, icon: Icon, color }) => <article key={id} className="group rounded-3xl border border-[#dfe8df] bg-white/90 p-6 shadow-[0_10px_30px_rgba(35,78,52,0.05)] transition hover:-translate-y-1 hover:border-[#b7d3bc] hover:shadow-[0_18px_40px_rgba(35,78,52,0.1)] dark:border-[#293b30] dark:bg-[#18221c]"><div className={`flex size-12 items-center justify-center rounded-2xl ${color === 'green' ? 'bg-[#e2f0e5] text-[#2c6048]' : color === 'amber' ? 'bg-[#f7eddf] text-[#a66c27]' : 'bg-[#e5edf5] text-[#50749a]'}`}><Icon aria-hidden="true" /></div><h2 className="mt-6 text-lg font-semibold">{title}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{description}</p>{id === 'queries' ? <div className="mt-6 flex flex-wrap gap-2"><Link href="/consultas" className="inline-flex items-center gap-2 rounded-xl bg-[#2c6048] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#234d39]">Ver estadísticas <ArrowRight className="size-4" aria-hidden="true" /></Link><button type="button" onClick={() => openPin('queries')} className="inline-flex items-center gap-2 rounded-xl border border-[#cfdcd1] px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-[#eef5ef] dark:border-[#34453a] dark:hover:bg-[#223027]">Reportes</button></div> : <button type="button" onClick={() => openPin(id)} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#2c6048] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#234d39]">Ingresar <ArrowRight className="size-4" aria-hidden="true" /></button>}</article>)}</div>
        </section>
        <footer className="text-center text-xs text-muted-foreground">Lodana Agro · Acceso por perfiles</footer>
      </div>
      {selected && selectedProfile && (
        <dialog
          ref={dialogRef}
          aria-labelledby="pin-title"
          onCancel={(event) => { event.preventDefault(); if (!loading) setSelected(null) }}
          className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl border border-border bg-background p-6 text-foreground shadow-2xl backdrop:bg-black/40"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex size-10 items-center justify-center rounded-xl bg-[#e2f0e5] text-[#2c6048]"><selectedProfile.icon /></div>
              <h2 id="pin-title" className="mt-4 text-xl font-semibold">{selectedProfile.title}</h2>
              <p id="pin-help" className="mt-1 text-sm text-muted-foreground">Ingresa tu PIN de 4 caracteres para iniciar sesión.</p>
            </div>
            <button type="button" aria-label="Cerrar" disabled={loading} onClick={() => setSelected(null)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-50"><X /></button>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void submitPin(pin) }} className="mt-6">
            <label htmlFor="profile-pin" className="text-sm font-medium">PIN de acceso</label>
            <input
              id="profile-pin"
              ref={pinRef}
              required
              type="password"
              autoComplete="one-time-code"
              minLength={4}
              maxLength={4}
              readOnly={loading}
              aria-describedby={error ? 'pin-help pin-error' : 'pin-help'}
              aria-invalid={Boolean(error)}
              value={pin}
              onChange={(event) => changePin(event.target.value)}
              className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-center text-2xl tracking-[0.35em] outline-none ring-offset-background focus:ring-2 focus:ring-[#2c6048]"
              placeholder="••••"
            />
            {error && <p id="pin-error" role="alert" className="mt-2 text-center text-sm text-destructive">{error}</p>}
            {loading && <p role="status" className="mt-3 text-center text-sm text-muted-foreground">Validando PIN…</p>}
          </form>
        </dialog>
      )}
    </main>
  )
}
