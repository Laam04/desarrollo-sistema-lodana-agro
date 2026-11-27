import { prisma } from '@/lib/prisma'
import { isProfile, profilePins, sameValue, type Profile } from '@/lib/profile-session'
import { ProductionError } from '@/lib/production-api'
import { hashPin, isValidPin, verifyPinHash } from '@/lib/pin-crypto'

export { hashPin, isValidPin, verifyPinHash }

const localPins: Record<Profile, string> = {
  production: '1234',
  reception: '2345',
  queries: '3456',
  admin: '9999',
}

export const allProfiles: readonly Profile[] = ['production', 'reception', 'queries', 'admin']

export type ProfileMetadata = {
  profile: Profile
  label: string
  description: string
  homePath: string
  permissions: readonly string[]
  canDisable: boolean
}

export const profileCatalog: Record<Profile, ProfileMetadata> = {
  production: {
    profile: 'production',
    label: 'Producción agrícola',
    description: 'Operación de la Finca Experimental Lodana: cosechas, mermas, costos, despachos y catálogo agrícola.',
    homePath: '/lodana',
    permissions: [
      'Gestionar cultivos, variedades, zonas, áreas y unidades de medida',
      'Registrar, editar y enviar a papelera cosechas, mermas y costos',
      'Crear despachos hacia Agro Market y consultar disponibilidad',
      'Consultar el resumen analítico interno de producción',
      'Restaurar registros desde la papelera (60 días)',
    ],
    canDisable: true,
  },
  reception: {
    profile: 'reception',
    label: 'Agro Market',
    description: 'Recepción de despachos provenientes de Lodana y gestión comercial de ventas.',
    homePath: '/agro-market',
    permissions: [
      'Consultar envíos pendientes e historial de recepciones',
      'Confirmar recepciones totales, parciales o con diferencias',
      'Registrar, editar y anular ventas de Agro Market',
      'Consultar resúmenes semanales y exportar hojas de ventas en CSV',
    ],
    canDisable: true,
  },
  queries: {
    profile: 'queries',
    label: 'Consultas y reportes',
    description: 'Consulta de estadísticas públicas y centro de reportes internos de productividad.',
    homePath: '/reportes',
    permissions: [
      'Consultar estadísticas agregadas en /consultas',
      'Generar vistas previas y reportes manuales en /reportes',
      'Consultar historial de reportes automáticos y manuales',
      'Descargar reportes en formatos PDF y CSV',
    ],
    canDisable: true,
  },
  admin: {
    profile: 'admin',
    label: 'Administración',
    description: 'Supervisión centralizada, seguridad de accesos, auditoría, configuración y automatización.',
    homePath: '/administracion',
    permissions: [
      'Acceso integral a Producción agrícola, Agro Market, Reportes y Consultas',
      'Panel administrativo de supervisión e integridad operativa',
      'Gestión de perfiles, credenciales (PIN), sesiones activas y bloqueos',
      'Consulta de auditoría del sistema (solo lectura)',
      'Configuración institucional y ejecución de reportes automáticos',
    ],
    canDisable: false,
  },
}

export function envPinForProfile(profile: Profile): string | undefined {
  const configured = process.env[profilePins[profile]]
  if (configured !== undefined) return isValidPin(configured) ? configured : undefined
  if (process.env.NODE_ENV !== 'production') return localPins[profile]
  return undefined
}

export async function isProfileEnabled(profile: Profile): Promise<boolean> {
  if (profile === 'admin') return true
  const config = await prisma.profileAccessConfig.findUnique({
    where: { profile },
    select: { enabled: true },
  })
  return config ? config.enabled : true
}

export async function verifyProfileCredentials(
  profile: Profile,
  pin: string,
): Promise<{ ok: boolean; disabled: boolean; configured: boolean }> {
  const config = await prisma.profileAccessConfig.findUnique({
    where: { profile },
    select: { enabled: true, pinHash: true },
  })
  if (profile !== 'admin' && config && !config.enabled) {
    return { ok: false, disabled: true, configured: true }
  }
  if (config?.pinHash) {
    return { ok: verifyPinHash(pin, config.pinHash), disabled: false, configured: true }
  }
  const expected = envPinForProfile(profile)
  if (!expected) {
    return { ok: false, disabled: false, configured: false }
  }
  return { ok: sameValue(pin, expected), disabled: false, configured: true }
}

export type ProfileAccessOverview = {
  profile: Profile
  label: string
  description: string
  homePath: string
  permissions: readonly string[]
  canDisable: boolean
  enabled: boolean
  credentialSource: 'database' | 'environment' | 'unconfigured'
  activeSessions: number
  lockedClients: number
  recentFailedAttempts: number
  updatedAt: string | null
  updatedBy: string | null
}

export async function getAccessOverview() {
  const now = new Date()
  const lockoutCutoff = new Date(now.getTime() - 15 * 60 * 1000)

  const [configs, sessions, attempts, recentAccessAudit] = await Promise.all([
    prisma.profileAccessConfig.findMany(),
    prisma.profileSession.findMany({
      where: { revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      select: { jti: true, profile: true, createdAt: true, expiresAt: true },
    }),
    prisma.profileLoginAttempt.findMany({
      where: { windowStart: { gt: lockoutCutoff } },
      orderBy: { windowStart: 'desc' },
    }),
    prisma.auditLog.findMany({
      where: {
        entity: { in: ['ProfileAccessConfig', 'ProfileSession', 'ProfileLoginAttempt', 'Auth'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        entity: true,
        entityId: true,
        action: true,
        actor: true,
        afterJson: true,
        createdAt: true,
      },
    }),
  ])

  const configByProfile = new Map(configs.map((row) => [row.profile, row]))

  const profiles: ProfileAccessOverview[] = allProfiles.map((profile) => {
    const meta = profileCatalog[profile]
    const cfg = configByProfile.get(profile)
    const profileSessions = sessions.filter((s) => s.profile === profile)
    const profileAttempts = attempts.filter((a) => a.profile === profile)
    const envConfigured = Boolean(envPinForProfile(profile))
    const credentialSource = cfg?.pinHash
      ? 'database'
      : envConfigured
        ? 'environment'
        : 'unconfigured'

    return {
      ...meta,
      enabled: profile === 'admin' ? true : (cfg?.enabled ?? true),
      credentialSource,
      activeSessions: profileSessions.length,
      lockedClients: profileAttempts.filter((a) => a.attempts >= 10).length,
      recentFailedAttempts: profileAttempts.reduce((sum, a) => sum + a.attempts, 0),
      updatedAt: cfg?.updatedAt.toISOString() ?? null,
      updatedBy: cfg?.updatedBy ?? null,
    }
  })

  const lockouts = attempts
    .filter((a) => a.attempts > 0)
    .map((a) => ({
      profile: a.profile,
      profileLabel: isProfile(a.profile) ? profileCatalog[a.profile].label : a.profile,
      clientKey: a.clientKey,
      attempts: a.attempts,
      locked: a.attempts >= 10,
      windowStart: a.windowStart.toISOString(),
      unlocksAt: new Date(a.windowStart.getTime() + 15 * 60 * 1000).toISOString(),
    }))

  const activeSessions = sessions.map((s) => ({
    sessionRef: s.jti.slice(0, 8),
    profile: s.profile,
    profileLabel: isProfile(s.profile) ? profileCatalog[s.profile].label : s.profile,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
  }))

  return {
    profiles,
    lockouts,
    activeSessions,
    recentEvents: recentAccessAudit.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
  }
}

export async function setProfileEnabled(profile: Profile, enabled: boolean, actor: Profile) {
  if (profile === 'admin' && !enabled) {
    throw new ProductionError('No se puede deshabilitar el perfil de Administración.', 400)
  }

  return prisma.$transaction(async (tx) => {
    const before = await tx.profileAccessConfig.findUnique({
      where: { profile },
      select: { profile: true, enabled: true, pinHash: true },
    })

    const updated = await tx.profileAccessConfig.upsert({
      where: { profile },
      create: { profile, enabled, updatedBy: actor },
      update: { enabled, updatedBy: actor },
      select: { profile: true, enabled: true, updatedAt: true },
    })

    let revokedCount = 0
    if (!enabled) {
      const revoked = await tx.profileSession.updateMany({
        where: { profile, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      revokedCount = revoked.count
    }

    await tx.auditLog.create({
      data: {
        entity: 'ProfileAccessConfig',
        entityId: profile,
        action: enabled ? 'ENABLE_PROFILE' : 'DISABLE_PROFILE',
        actor,
        beforeJson: { enabled: before ? before.enabled : true },
        afterJson: { enabled, revokedSessions: revokedCount },
      },
    })

    return { profile: updated.profile, enabled: updated.enabled, revokedSessions: revokedCount }
  })
}

export async function updateProfilePin(
  profile: Profile,
  newPin: string | null,
  actor: Profile,
  currentAdminJti?: string,
) {
  if (newPin !== null && !isValidPin(newPin)) {
    throw new ProductionError('El PIN debe tener exactamente 4 caracteres.', 400)
  }
  if (newPin === null && !envPinForProfile(profile)) {
    throw new ProductionError(
      'No existe una clave de entorno configurada para este perfil; no se puede restablecer sin definir un nuevo PIN.',
      400,
    )
  }

  const pinHash = newPin === null ? null : hashPin(newPin)

  return prisma.$transaction(async (tx) => {
    const before = await tx.profileAccessConfig.findUnique({
      where: { profile },
      select: { pinHash: true },
    })

    await tx.profileAccessConfig.upsert({
      where: { profile },
      create: { profile, enabled: true, pinHash, updatedBy: actor },
      update: { pinHash, updatedBy: actor },
    })

    const revoked = await tx.profileSession.updateMany({
      where: {
        profile,
        revokedAt: null,
        ...(profile === 'admin' && currentAdminJti ? { jti: { not: currentAdminJti } } : {}),
      },
      data: { revokedAt: new Date() },
    })

    await tx.profileLoginAttempt.deleteMany({ where: { profile } })

    await tx.auditLog.create({
      data: {
        entity: 'ProfileAccessConfig',
        entityId: profile,
        action: newPin === null ? 'RESET_PIN_TO_ENV' : 'UPDATE_PIN',
        actor,
        beforeJson: { credentialSource: before?.pinHash ? 'database' : 'environment' },
        afterJson: {
          credentialSource: newPin === null ? 'environment' : 'database',
          revokedSessions: revoked.count,
        },
      },
    })

    return {
      profile,
      credentialSource: newPin === null ? 'environment' : 'database',
      revokedSessions: revoked.count,
    }
  })
}

export async function revokeSessionsForProfile(
  profile: Profile,
  actor: Profile,
  keepJti?: string,
) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.profileSession.updateMany({
      where: {
        profile,
        revokedAt: null,
        ...(profile === 'admin' && keepJti ? { jti: { not: keepJti } } : {}),
      },
      data: { revokedAt: new Date() },
    })

    await tx.auditLog.create({
      data: {
        entity: 'ProfileSession',
        entityId: profile,
        action: 'REVOKE_SESSIONS',
        actor,
        afterJson: { revokedSessions: result.count },
      },
    })

    return { profile, revokedSessions: result.count }
  })
}

export async function clearLockoutsForProfile(profile: Profile, actor: Profile, clientKey?: string) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.profileLoginAttempt.deleteMany({
      where: {
        profile,
        ...(clientKey ? { clientKey } : {}),
      },
    })

    await tx.auditLog.create({
      data: {
        entity: 'ProfileLoginAttempt',
        entityId: clientKey ? `${profile}:${clientKey}` : profile,
        action: 'CLEAR_LOCKOUT',
        actor,
        afterJson: { clearedRecords: result.count },
      },
    })

    return { profile, clearedRecords: result.count }
  })
}
