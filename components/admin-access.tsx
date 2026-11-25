'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { KeyRound, LockOpen, LogOut, RotateCcw, Shield, ShieldAlert, ShieldCheck, Users } from 'lucide-react'
import { productionFetch } from '@/lib/production-client'
import { MarketDialog, MarketError, marketUi } from '@/components/market-ui'

type ProfileItem = {
  profile: 'production' | 'reception' | 'queries' | 'admin'
  label: string
  description: string
  homePath: string
  permissions: string[]
  canDisable: boolean
  enabled: boolean
  credentialSource: 'database' | 'environment' | 'unconfigured'
  activeSessions: number
  lockedClients: number
  recentFailedAttempts: number
  updatedAt: string | null
  updatedBy: string | null
}

type AccessResponse = {
  profiles: ProfileItem[]
  lockouts: {
    profile: string
    profileLabel: string
    clientKey: string
    attempts: number
    locked: boolean
    windowStart: string
    unlocksAt: string
  }[]
  activeSessions: {
    sessionRef: string
    profile: string
    profileLabel: string
    createdAt: string
    expiresAt: string
  }[]
  recentEvents: {
    id: string
    entity: string
    entityId: string
    action: string
    actor: string | null
    afterJson: Record<string, unknown> | null
    createdAt: string
  }[]
}

const dtFmt = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dtFmt.format(d)
}

export function AdminAccessPanel() {
  const { data, error, isLoading, mutate } = useSWR<AccessResponse>('/api/admin/access', productionFetch)
  const [busyKey, setBusyKey] = useState('')
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [pinModal, setPinModal] = useState<ProfileItem | null>(null)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [confirmAction, setConfirmAction] = useState<{
    title: string
    description: string
    actionLabel: string
    danger?: boolean
    payload: Record<string, unknown>
  } | null>(null)

  async function runPatch(payload: Record<string, unknown>, successText: string) {
    setBusyKey(String(payload.action) + String(payload.profile))
    setFeedback(null)
    try {
      await productionFetch('/api/admin/access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      await mutate()
      setFeedback({ kind: 'ok', text: successText })
      return true
    } catch (err) {
      setFeedback({ kind: 'error', text: err instanceof Error ? err.message : 'No se pudo aplicar el cambio.' })
      return false
    } finally {
      setBusyKey('')
    }
  }

  async function submitPin() {
    if (!pinModal) return
    if (newPin.length < 4 || newPin.length > 64) {
      setPinError('El PIN debe tener entre 4 y 64 caracteres.')
      return
    }
    if (newPin !== confirmPin) {
      setPinError('Los PIN ingresados no coinciden.')
      return
    }
    setPinError('')
    const ok = await runPatch(
      { action: 'update_pin', profile: pinModal.profile, pin: newPin },
      `PIN actualizado de forma segura para ${pinModal.label}. Las sesiones anteriores fueron revocadas.`,
    )
    if (ok) {
      setPinModal(null)
      setNewPin('')
      setConfirmPin('')
    }
  }

  if (error) return <MarketError message={error.message} retry={() => mutate()} />
  if (isLoading || !data) {
    return <div className={`${marketUi.panel} p-6 text-sm text-muted-foreground`}>Cargando gestión de perfiles y accesos…</div>
  }

  return (
    <div className="grid gap-6">
      {feedback && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Perfiles y permisos */}
      <section className="grid gap-4 lg:grid-cols-2">
        {data.profiles.map((item) => (
          <article key={item.profile} className={`${marketUi.panel} flex flex-col justify-between p-5`}>
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-[#2c6048] dark:bg-[#234634] dark:text-[#c9e7d0]">
                    {item.profile === 'admin' ? <ShieldCheck className="size-5" /> : <Shield className="size-5" />}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold">{item.label}</h3>
                    <p className="text-xs text-muted-foreground">Ruta base: {item.homePath}</p>
                  </div>
                </div>

                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    item.enabled
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                      : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200'
                  }`}
                >
                  {item.enabled ? 'Habilitado' : 'Deshabilitado'}
                </span>
              </div>

              <p className="mt-3 text-sm text-muted-foreground">{item.description}</p>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-muted/40 p-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Credencial</p>
                  <p className="mt-0.5 font-semibold">
                    {item.credentialSource === 'database'
                      ? 'PIN gestionado (hash)'
                      : item.credentialSource === 'environment'
                        ? 'Variable de entorno'
                        : 'Sin configurar'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Sesiones activas</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{item.activeSessions}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Bloqueos (15m)</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{item.lockedClients}</p>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Permisos asociados</p>
                <ul className="mt-2 grid gap-1 text-xs text-muted-foreground">
                  {item.permissions.map((perm) => (
                    <li key={perm} className="flex items-start gap-2">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#2c6048] dark:bg-[#a8d5b3]" />
                      <span>{perm}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
              <button
                type="button"
                className={marketUi.primary}
                disabled={Boolean(busyKey)}
                onClick={() => {
                  setPinModal(item)
                  setNewPin('')
                  setConfirmPin('')
                  setPinError('')
                }}
              >
                <KeyRound className="size-4" />
                Actualizar PIN
              </button>

              {item.credentialSource === 'database' && (
                <button
                  type="button"
                  className={marketUi.button}
                  disabled={Boolean(busyKey)}
                  onClick={() =>
                    setConfirmAction({
                      title: `Restablecer PIN de ${item.label}`,
                      description: 'Se eliminará el PIN personalizado en base de datos y volverá a usarse la clave configurada en variables de entorno.',
                      actionLabel: 'Restablecer',
                      payload: { action: 'reset_pin', profile: item.profile },
                    })
                  }
                >
                  <RotateCcw className="size-4" />
                  Usar PIN de entorno
                </button>
              )}

              {item.canDisable && (
                <button
                  type="button"
                  className={marketUi.button}
                  disabled={Boolean(busyKey)}
                  onClick={() =>
                    setConfirmAction({
                      title: item.enabled ? `Deshabilitar ${item.label}` : `Habilitar ${item.label}`,
                      description: item.enabled
                        ? 'Al deshabilitar este perfil se revocarán sus sesiones activas y no podrá iniciar sesión hasta volver a habilitarlo.'
                        : 'El perfil volverá a tener acceso con su PIN vigente.',
                      actionLabel: item.enabled ? 'Deshabilitar' : 'Habilitar',
                      danger: item.enabled,
                      payload: { action: 'toggle_enabled', profile: item.profile, enabled: !item.enabled },
                    })
                  }
                >
                  {item.enabled ? 'Deshabilitar perfil' : 'Habilitar perfil'}
                </button>
              )}

              {item.activeSessions > 0 && (
                <button
                  type="button"
                  className={marketUi.button}
                  disabled={Boolean(busyKey)}
                  onClick={() =>
                    setConfirmAction({
                      title: `Revocar sesiones de ${item.label}`,
                      description:
                        item.profile === 'admin'
                          ? 'Se cerrarán todas las demás sesiones de Administración, manteniendo tu sesión actual.'
                          : 'Se cerrarán todas las sesiones activas de este perfil en todos los dispositivos.',
                      actionLabel: 'Revocar sesiones',
                      danger: true,
                      payload: { action: 'revoke_sessions', profile: item.profile },
                    })
                  }
                >
                  <LogOut className="size-4" />
                  Revocar sesiones
                </button>
              )}
            </div>
          </article>
        ))}
      </section>

      {/* Bloqueos por intentos fallidos + Sesiones activas */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className={marketUi.panel}>
          <div className={marketUi.header}>
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-[#2c6048] dark:text-[#a8d5b3]" />
              <h3 className="text-base font-semibold">Intentos fallidos y bloqueos (ventana de 15 min)</h3>
            </div>
          </div>
          <div className="p-4">
            {data.lockouts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No existen intentos fallidos ni clientes bloqueados actualmente.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={marketUi.tableHead}>
                      <th className="px-3 py-2">Perfil</th>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2 text-right">Intentos</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lockouts.map((row) => (
                      <tr key={`${row.profile}-${row.clientKey}`} className={marketUi.row}>
                        <td className="px-3 py-2 font-medium">{row.profileLabel}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.clientKey.slice(0, 10)}…</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.attempts} / 10</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.locked ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200'}`}>
                            {row.locked ? 'Bloqueado' : 'En observación'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#2c6048] hover:underline dark:text-[#a8d5b3]"
                            disabled={Boolean(busyKey)}
                            onClick={() =>
                              runPatch(
                                { action: 'clear_lockouts', profile: row.profile, clientKey: row.clientKey },
                                `Bloqueo liberado para ${row.profileLabel}.`,
                              )
                            }
                          >
                            <LockOpen className="size-3.5" />
                            Desbloquear
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className={marketUi.panel}>
          <div className={marketUi.header}>
            <div className="flex items-center gap-2">
              <Users className="size-4 text-[#2c6048] dark:text-[#a8d5b3]" />
              <h3 className="text-base font-semibold">Sesiones activas ({data.activeSessions.length})</h3>
            </div>
          </div>
          <div className="p-4">
            {data.activeSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay sesiones vigentes registradas.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={marketUi.tableHead}>
                      <th className="px-3 py-2">Perfil</th>
                      <th className="px-3 py-2">Referencia</th>
                      <th className="px-3 py-2">Inicio</th>
                      <th className="px-3 py-2">Expira</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.activeSessions.map((s) => (
                      <tr key={s.sessionRef + s.createdAt} className={marketUi.row}>
                        <td className="px-3 py-2 font-medium">{s.profileLabel}</td>
                        <td className="px-3 py-2 font-mono text-xs">{s.sessionRef}…</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{fmtTime(s.createdAt)}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{fmtTime(s.expiresAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Eventos recientes de acceso */}
      <section className={marketUi.panel}>
        <div className={marketUi.header}>
          <h3 className="text-base font-semibold">Eventos recientes de acceso y seguridad</h3>
        </div>
        <div className="overflow-x-auto p-4">
          {data.recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no existen eventos de acceso registrados.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className={marketUi.tableHead}>
                  <th className="px-3 py-2">Fecha y hora</th>
                  <th className="px-3 py-2">Acción</th>
                  <th className="px-3 py-2">Perfil afectado</th>
                  <th className="px-3 py-2">Ejecutado por</th>
                </tr>
              </thead>
              <tbody>
                {data.recentEvents.map((ev) => (
                  <tr key={ev.id} className={marketUi.row}>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmtTime(ev.createdAt)}</td>
                    <td className="px-3 py-2 font-medium">{ev.action}</td>
                    <td className="px-3 py-2">{ev.entityId}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{ev.actor ?? 'Sistema'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {pinModal && (
        <MarketDialog
          title={`Actualizar PIN · ${pinModal.label}`}
          action="Guardar nuevo PIN"
          busy={Boolean(busyKey)}
          onCancel={() => setPinModal(null)}
          onConfirm={submitPin}
        >
          <p className="text-xs text-muted-foreground">
            El nuevo PIN se almacena con hash criptográfico (scrypt + salt único). Nunca se guarda ni muestra en texto plano.
          </p>
          <label className="grid gap-1">
            <span className="text-xs font-medium">Nuevo PIN (4 a 64 caracteres)</span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              className={marketUi.input}
              placeholder="••••"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium">Confirmar nuevo PIN</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              className={marketUi.input}
              placeholder="••••"
            />
          </label>
          {pinError && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{pinError}</p>}
        </MarketDialog>
      )}

      {confirmAction && (
        <MarketDialog
          title={confirmAction.title}
          action={confirmAction.actionLabel}
          danger={confirmAction.danger}
          busy={Boolean(busyKey)}
          onCancel={() => setConfirmAction(null)}
          onConfirm={async () => {
            const ok = await runPatch(confirmAction.payload, 'Cambio de acceso aplicado y registrado en auditoría.')
            if (ok) setConfirmAction(null)
          }}
        >
          <p className="text-sm text-muted-foreground">{confirmAction.description}</p>
        </MarketDialog>
      )}
    </div>
  )
}
