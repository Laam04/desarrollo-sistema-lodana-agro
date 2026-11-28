type MarkSize = 'xs' | 'sm' | 'md' | 'lg'

const boxSizes: Record<MarkSize, string> = {
  xs: 'size-8 rounded-xl p-1',
  sm: 'size-10 rounded-xl p-1.5',
  md: 'size-11 rounded-2xl p-1.5',
  lg: 'size-16 rounded-2xl p-2.5',
}

export function FacivitecMark({
  size = 'md',
  framed = true,
  glow = false,
  className = '',
  alt = 'FACIVITEC',
}: {
  size?: MarkSize
  framed?: boolean
  glow?: boolean
  className?: string
  alt?: string
}) {
  const images = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/facivitec-mark.png"
        alt={alt}
        width={499}
        height={646}
        decoding="async"
        className="h-full w-full object-contain dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/facivitec-mark-dark.png"
        alt={alt}
        width={499}
        height={646}
        decoding="async"
        className="hidden h-full w-full object-contain dark:block"
      />
    </>
  )

  if (!framed) {
    return (
      <span className={`relative inline-flex shrink-0 items-center justify-center ${className}`}>
        {images}
      </span>
    )
  }

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center border border-[#cfe0d2] bg-white shadow-sm dark:border-[#2d4537] dark:bg-[#14201a] ${boxSizes[size]} ${className}`}
    >
      {glow && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-1 rounded-[inherit] bg-emerald-500/15 blur-md dark:bg-emerald-400/20"
        />
      )}
      <span className="relative flex h-full w-full items-center justify-center">{images}</span>
    </span>
  )
}

export function FacivitecHorizontal({
  className = 'h-10 w-auto',
  alt = 'FACIVITEC · Facultad Ciencias de la Vida y Tecnologías',
}: {
  className?: string
  alt?: string
}) {
  return (
    <span className="inline-flex items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/facivitec-horizontal.png"
        alt={alt}
        width={1100}
        height={260}
        decoding="async"
        className={`object-contain dark:hidden ${className}`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/facivitec-horizontal-dark.png"
        alt={alt}
        width={1100}
        height={260}
        decoding="async"
        className={`hidden object-contain dark:block ${className}`}
      />
    </span>
  )
}
