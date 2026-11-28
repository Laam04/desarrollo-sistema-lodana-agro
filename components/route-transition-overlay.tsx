'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { BrandSignature, DualRingEmblem } from '@/components/brand-loader'

const TRANSITION_START_EVENT = 'lodana:transition-start'
const TRANSITION_HIDE_EVENT = 'lodana:transition-hide'
const CLIENT_MIN_MS = 200
const FADE_OUT_MS = 160
const MAX_LOCK_MS = 4000

type Phase = 'idle' | 'visible' | 'fading'

type StartDetail = {
  label?: string
  autoHide?: boolean
}

export function triggerBrandTransition(label?: string, options?: { autoHide?: boolean }) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<StartDetail>(TRANSITION_START_EVENT, {
      detail: { label, autoHide: options?.autoHide },
    }),
  )
}

export function hideBrandTransition() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TRANSITION_HIDE_EVENT))
}

export function navigateWithTransition(
  url: string,
  options?: { replace?: boolean; label?: string },
) {
  if (typeof window === 'undefined') return
  triggerBrandTransition(options?.label ?? '')
  window.requestAnimationFrame(() => {
    if (options?.replace) {
      window.location.replace(url)
    } else {
      window.location.assign(url)
    }
  })
}

export function RouteTransitionOverlay() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const routeKey = `${pathname}?${searchParams.toString()}`

  const [phase, setPhase] = useState<Phase>('idle')
  const [autoDismissMs, setAutoDismissMs] = useState<number | null>(null)
  const [label, setLabel] = useState('')

  const shownAtRef = useRef(0)
  const lastRouteRef = useRef(routeKey)

  // Temporizador dedicado para cerrar suavemente (seguro en React 19 Strict Mode)
  useEffect(() => {
    if (phase !== 'visible') return
    const wait =
      autoDismissMs !== null
        ? Math.max(0, autoDismissMs - (Date.now() - shownAtRef.current))
        : MAX_LOCK_MS
    const timer = window.setTimeout(() => {
      setPhase('fading')
    }, wait)
    return () => window.clearTimeout(timer)
  }, [phase, autoDismissMs])

  // Temporizador dedicado para desmontar tras el fade-out
  useEffect(() => {
    if (phase !== 'fading') return
    const timer = window.setTimeout(() => {
      setPhase('idle')
      setAutoDismissMs(null)
    }, FADE_OUT_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  // Cuando cambia la ruta o sección en navegación cliente, inicia el cierre suave
  useEffect(() => {
    if (lastRouteRef.current !== routeKey) {
      lastRouteRef.current = routeKey
      if (phase === 'visible') {
        setAutoDismissMs(CLIENT_MIN_MS)
      }
    }
  }, [routeKey, phase])

  // Escuchar enlaces internos, atrás/adelante y eventos manuales
  useEffect(() => {
    function openOverlay(nextLabel: string, autoHide: boolean) {
      shownAtRef.current = Date.now()
      setLabel(nextLabel)
      setAutoDismissMs(autoHide ? CLIENT_MIN_MS : null)
      setPhase('visible')
    }

    function onCustomStart(event: Event) {
      const detail = (event as CustomEvent<StartDetail>).detail
      openOverlay(detail?.label ?? '', Boolean(detail?.autoHide))
    }

    function onCustomHide() {
      setPhase((current) => (current === 'idle' ? 'idle' : 'fading'))
    }

    function onDocumentClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      const target = event.target as HTMLElement | null
      const anchor = target?.closest('a')
      if (!anchor) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return

      const rawHref = anchor.getAttribute('href')
      if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
        return
      }

      let dest: URL
      try {
        dest = new URL(anchor.href, window.location.href)
      } catch {
        return
      }
      if (dest.origin !== window.location.origin) return
      if (dest.pathname.startsWith('/api/')) return

      const currentUrl = new URL(window.location.href)
      if (dest.pathname === currentUrl.pathname && dest.search === currentUrl.search) {
        return
      }

      openOverlay('', false)
    }

    function onPopState() {
      openOverlay('', true)
    }

    window.addEventListener(TRANSITION_START_EVENT, onCustomStart)
    window.addEventListener(TRANSITION_HIDE_EVENT, onCustomHide)
    document.addEventListener('click', onDocumentClick, true)
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener(TRANSITION_START_EVENT, onCustomStart)
      window.removeEventListener(TRANSITION_HIDE_EVENT, onCustomHide)
      document.removeEventListener('click', onDocumentClick, true)
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  if (phase === 'idle') return null

  const isVisible = phase === 'visible'

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label || 'Cambiando de pantalla'}
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-[#f4f7f3]/78 backdrop-blur-md transition-opacity duration-150 dark:bg-[#0b100e]/82 ${
        isVisible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <div
        className={`flex flex-col items-center px-6 text-center transition-transform duration-150 ${
          isVisible ? 'scale-100' : 'scale-95'
        }`}
      >
        <DualRingEmblem />
        <div className="mt-5">
          <BrandSignature />
        </div>
        {label && (
          <p className="mt-1.5 text-xs font-medium text-muted-foreground sm:text-sm">{label}</p>
        )}
      </div>
    </div>
  )
}
