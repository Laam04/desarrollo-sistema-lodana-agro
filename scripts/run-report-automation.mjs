#!/usr/bin/env node
/**
 * Ejecutor independiente de generación automática de reportes (Lodana Agro).
 *
 * Compatible con:
 *   - Programador de tareas de Windows (Task Scheduler)
 *   - Cron de Linux / macOS
 *   - Ejecución manual o de prueba:
 *       node scripts/run-report-automation.mjs
 *       node scripts/run-report-automation.mjs --as-of=2026-12-01
 *       node scripts/run-report-automation.mjs --month=2026-10
 *       node scripts/run-report-automation.mjs --week=2026-11-16
 *
 * Requiere que la aplicación esté corriendo (APP_ORIGIN) o se puede invocar
 * directamente contra el endpoint seguro /api/cron/reports usando CRON_SECRET.
 */

try {
  process.loadEnvFile(new URL('../.env', import.meta.url))
} catch {
  // Usa variables de entorno ya cargadas en el sistema
}

function argValue(prefix) {
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length).trim() : ''
}

const origin = (argValue('--origin=') || process.env.APP_ORIGIN || 'http://localhost:3000').replace(/\/$/, '')
const secret = process.env.CRON_SECRET?.trim() || process.env.LODANA_CRON_SECRET?.trim()

if (!secret || secret.length < 32) {
  console.error('Configura CRON_SECRET con un mínimo de 32 caracteres en .env o en las variables de entorno.')
  process.exit(1)
}

const params = new URLSearchParams()
const asOf = argValue('--as-of=')
const month = argValue('--month=')
const week = argValue('--week=')

if (asOf) params.set('asOf', asOf)
if (month) params.set('targetMonth', month)
if (week) params.set('targetWeekDay', week)

const url = `${origin}/api/cron/reports${params.toString() ? `?${params.toString()}` : ''}`

try {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: 'application/json',
    },
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    console.error(`Fallo HTTP ${response.status}:`, data?.error ?? data ?? 'Sin detalle')
    process.exit(1)
  }

  console.log(JSON.stringify(data, null, 2))
} catch (error) {
  console.error('No se pudo conectar con', url, error instanceof Error ? error.message : error)
  process.exit(1)
}
