import { FacivitecMark } from '@/components/brand-logo'

export function DualRingEmblem({ compact = false }: { compact?: boolean }) {
  const wrapClass = compact ? 'size-24' : 'size-32 sm:size-36'
  const markClass = compact ? 'size-12' : 'size-16 sm:size-[72px]'

  return (
    <div className={`relative flex items-center justify-center ${wrapClass}`}>
      {/* Resplandores ambientales duales (verde + índigo) */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-3 top-2 size-16 rounded-full bg-[#079341]/18 blur-2xl dark:bg-[#1acc72]/20"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-3 bottom-2 size-16 rounded-full bg-[#2a2361]/18 blur-2xl dark:bg-[#8b95f6]/22"
      />

      {/* Dos arcos ultra finos girando en sentidos opuestos */}
      <svg
        viewBox="0 0 120 120"
        aria-hidden
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        {/* Pista exterior muy sutil */}
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          className="text-[#079341]/15 dark:text-[#1acc72]/15"
        />
        {/* Pista interior muy sutil */}
        <circle
          cx="60"
          cy="60"
          r="45"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          className="text-[#2a2361]/15 dark:text-[#8b95f6]/15"
        />

        {/* Arco exterior: Verde Esmeralda FACIVITEC (sentido horario) */}
        <g className="animate-brand-ring-cw">
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray="108 232"
            className="stroke-[#079341] dark:stroke-[#1acc72]"
          />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeDasharray="18 322"
            strokeDashoffset="-170"
            className="stroke-[#079341]/60 dark:stroke-[#1acc72]/70"
          />
        </g>

        {/* Arco interior: Índigo Luminoso FACIVITEC (sentido antihorario) */}
        <g className="animate-brand-ring-ccw">
          <circle
            cx="60"
            cy="60"
            r="45"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="86 197"
            className="stroke-[#2a2361] dark:stroke-[#8b95f6]"
          />
          <circle
            cx="60"
            cy="60"
            r="45"
            fill="none"
            strokeWidth="1.1"
            strokeLinecap="round"
            strokeDasharray="14 269"
            strokeDashoffset="-142"
            className="stroke-[#2a2361]/55 dark:stroke-[#a6b2fa]/70"
          />
        </g>
      </svg>

      {/* Medallón central con isotipo FACIVITEC */}
      <div className="animate-brand-breathe relative flex items-center justify-center rounded-full bg-white/80 p-3 shadow-[0_8px_30px_rgba(7,147,65,0.12)] backdrop-blur-sm dark:bg-[#131b19]/85 dark:shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
        <FacivitecMark framed={false} className={markClass} alt="FACIVITEC" />
      </div>
    </div>
  )
}

export function BrandSignature({ compact = false }: { compact?: boolean }) {
  return (
    <p
      className={`flex items-center justify-center gap-2 font-semibold tracking-wide ${
        compact ? 'text-xs' : 'text-sm sm:text-base'
      }`}
    >
      <span className="tracking-[0.12em]">
        <span className="text-[#079341] dark:text-[#1acc72]">FACI</span>
        <span className="text-[#2a2361] dark:text-[#a6b2fa]">VITEC</span>
      </span>
      <span className="text-muted-foreground/60" aria-hidden>
        ·
      </span>
      <span className="text-foreground/90">Lodana Agro</span>
    </p>
  )
}

export function BrandLoader({
  variant = 'section',
  message = 'Cargando…',
  subtitle,
}: {
  variant?: 'screen' | 'section'
  message?: string
  subtitle?: string
}) {
  if (variant === 'screen') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen flex-col items-center justify-center bg-[#f4f7f3]/85 px-6 py-12 text-[#20302b] backdrop-blur-md dark:bg-[#0d1311]/88 dark:text-[#edf2ed]"
      >
        <div className="flex flex-col items-center text-center">
          <DualRingEmblem />
          <div className="mt-6">
            <BrandSignature />
          </div>
          {message && (
            <p className="mt-2 text-xs font-medium text-muted-foreground sm:text-sm">{message}</p>
          )}
          {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground/80">{subtitle}</p>}
        </div>
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center rounded-2xl border-2 border-[#d5e3d7] bg-white/85 px-6 py-10 text-center shadow-sm backdrop-blur-sm dark:border-[#2d3b32] dark:bg-[#161f1b]/85"
    >
      <DualRingEmblem compact />
      <div className="mt-4">
        <BrandSignature compact />
      </div>
      {message && <p className="mt-1.5 text-sm font-medium text-muted-foreground">{message}</p>}
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground/80">{subtitle}</p>}
    </div>
  )
}
