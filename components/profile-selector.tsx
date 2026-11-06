'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Leaf, PackageCheck, Search, Settings, ArrowRight, X, ShieldCheck } from 'lucide-react'

type Profile = 'production' | 'reception' | 'queries' | 'admin'

const profiles = [
  { id: 'production' as const, title: 'Producción agrícola', description: 'Registra y consulta cosechas, lotes, mermas y costos de producción.', icon: Leaf, color: 'green' },
  { id: 'reception' as const, title: 'Agro Market', description: 'Gestiona la entrada de productos y movimientos de Agro Market.', icon: PackageCheck, color: 'amber' },
  { id: 'queries' as const, title: 'Consultas', description: 'Consulta información operativa de Lodana y Agro Market.', icon: Search, color: 'blue' },
]

export function ProfileSelector() {
  const router = useRouter()
  const [selected, setSelected] = useState<Profile | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const selectedProfile = selected === 'admin' ? { title: 'Administración', icon: ShieldCheck, color: 'violet' } : profiles.find((profile) => profile.id === selected)

  function openPin(profile: Profile) {
    setSelected(profile)
    setPin('')
    setError('')
  }

  async function submitPin(event: React.FormEvent) {
    event.preventDefault()
    if (!selected || pin.length !== 4) return setError('Introduce un PIN de 4 dígitos.')
    setLoading(true)
    setError('')
    const response = await fetch('/api/profile-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: selected, pin }) })
    setLoading(false)
    if (!response.ok) return setError('El PIN no es correcto. Inténtalo de nuevo.')
    router.push(selected === 'admin' ? '/administracion' : selected === 'production' ? '/lodana' : selected === 'reception' ? '/agro-market' : '/consultas')
  }

  return (
    <main className="min-h-screen bg-[#f6f8f4] px-5 py-8 text-[#20352b] dark:bg-[#101713] dark:text-[#edf4ee] sm:px-8 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-2xl bg-[#2c6048] text-white shadow-sm"><Leaf /></div><div><p className="text-xl font-semibold tracking-tight">Lodana Agro</p><p className="text-xs text-muted-foreground">Gestión agrícola</p></div></div>
          <button aria-label="Administración" onClick={() => openPin('admin')} className="rounded-xl p-2.5 text-muted-foreground transition hover:bg-white hover:text-[#2c6048] dark:hover:bg-[#1b2920]"><Settings /></button>
        </header>
        <section className="flex flex-1 flex-col justify-center py-12"><div className="mx-auto max-w-2xl text-center"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2c6048]">Bienvenido</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">Selecciona un espacio de trabajo</h1><p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">Elige el área a la que deseas ingresar para comenzar a trabajar con la información de tu operación agrícola.</p></div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">{profiles.map(({ id, title, description, icon: Icon, color }) => <article key={id} className="group rounded-3xl border border-[#dfe8df] bg-white/90 p-6 shadow-[0_10px_30px_rgba(35,78,52,0.05)] transition hover:-translate-y-1 hover:border-[#b7d3bc] hover:shadow-[0_18px_40px_rgba(35,78,52,0.1)] dark:border-[#293b30] dark:bg-[#18221c]"><div className={`flex size-12 items-center justify-center rounded-2xl ${color === 'green' ? 'bg-[#e2f0e5] text-[#2c6048]' : color === 'amber' ? 'bg-[#f7eddf] text-[#a66c27]' : 'bg-[#e5edf5] text-[#50749a]'}`}><Icon /></div><h2 className="mt-6 text-lg font-semibold">{title}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{description}</p><button onClick={() => openPin(id)} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#2c6048] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#234d39]">Ingresar <ArrowRight className="size-4" /></button></article>)}</div>
        </section>
        <footer className="text-center text-xs text-muted-foreground">Lodana Agro · Acceso por perfiles</footer>
      </div>
      {selected && selectedProfile && <div role="dialog" aria-modal="true" aria-labelledby="pin-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-5"><div className="w-full max-w-sm rounded-3xl border border-border bg-background p-6 shadow-2xl"><div className="flex items-start justify-between"><div><div className="flex size-10 items-center justify-center rounded-xl bg-[#e2f0e5] text-[#2c6048]"><selectedProfile.icon /></div><h2 id="pin-title" className="mt-4 text-xl font-semibold">{selectedProfile.title}</h2><p className="mt-1 text-sm text-muted-foreground">Introduce tu PIN para continuar.</p></div><button aria-label="Cerrar" onClick={() => setSelected(null)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X /></button></div><form onSubmit={submitPin} className="mt-6"><label htmlFor="profile-pin" className="text-sm font-medium">PIN de acceso</label><input id="profile-pin" autoFocus inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none ring-offset-background focus:ring-2 focus:ring-[#2c6048]" placeholder="••••" /><p className="mt-2 min-h-5 text-center text-sm text-destructive">{error}</p><button disabled={loading} className="mt-3 w-full rounded-xl bg-[#2c6048] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{loading ? 'Validando…' : 'Continuar'}</button></form><p className="mt-4 text-center text-[11px] text-muted-foreground">Los PIN de prueba deben sustituirse por autenticación segura antes de producción.</p></div></div>}
    </main>
  )
}
