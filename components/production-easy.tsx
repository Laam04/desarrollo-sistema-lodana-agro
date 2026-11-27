'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  ArrowLeft,
  Ban,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Image as ImageIcon,
  Inbox,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Plus,
  PlusCircle,
  Search,
  Sprout,
  Trash2,
  TrendingDown,
  TriangleAlert,
  Truck,
  Wallet,
  Wheat,
  X,
} from 'lucide-react'
import {
  createRequestId,
  formatDate,
  invalidateProduction,
  productionFetch,
  today,
} from '@/lib/production-client'
import {
  cents as parseCents,
  receiptCode,
} from '@/lib/market-data'
import { editableShipmentStatuses, shipmentStatusLabels } from '@/lib/shipment-status'
import { ReceiptPhotoField, ReceiptPhotoModal } from '@/components/receipt-photo-field'

/* ───────────────────────── Tipos ───────────────────────── */

type Crop = {
  id: string
  name: string
  unit?: { id: string; name: string } | null
  varieties?: { id: string; name: string }[]
  productionAreas?: { id: string; name: string; type: 'LOT' | 'ZONE' }[]
}

type Unit = { id: string; name: string }
type CostCategory = { id: string; name: string; active: boolean }

type Availability = {
  cropId: string
  cropName: string
  varietyId: string | null
  varietyName: string | null
  productionAreaId: string | null
  productionAreaName: string | null
  unitId: string
  unitName?: string
  available: number | string
  estimatedUnitPrice: string | null
}

type ShipmentLine = {
  uid: string
  cropId: string
  cropName: string
  varietyId: string
  varietyName: string
  productionAreaId: string
  productionAreaName: string
  unitId: string
  unitName: string
  quantity: string
  unitPrice: string
  notes?: string | null
}

type Quantity = string | number

type LossDetails = {
  id: string
  date: string
  quantity: Quantity
  affectsHarvest: boolean | null
  reason?: { name: string }
}

type ShipmentProduct = {
  id: string
  cropId: string
  varietyId: string | null
  productionAreaId: string | null
  unitId: string
  quantity: Quantity
  estimatedUnitPrice: Quantity | null
  estimatedTotalAmount: Quantity | null
  crop?: Crop
  variety?: { name: string } | null
  productionArea?: { name: string } | null
  unit?: Unit
  notes?: string | null
}

type HistoryRow = {
  id: string
  date: string
  notes?: string | null
  cropId?: string
  unitId?: string
  varietyId?: string | null
  productionAreaId?: string | null
  crop?: Crop
  variety?: { name: string } | null
  productionArea?: { name: string } | null
  unit?: Unit
  quantity?: Quantity
  estimatedUnitPrice?: Quantity | null
  losses?: LossDetails[]
  harvest?: HistoryRow
  harvestId?: string
  reason?: { name: string }
  affectsHarvest?: boolean | null
  hasEvidenceImage?: boolean
  evidenceImageName?: string | null
  evidenceImageUrl?: string | null
  description?: string
  category?: { id: string; name: string }
  amountUsd?: Quantity
  applicationType?: string
  hasReceiptImage?: boolean
  receiptImageName?: string | null
  receiptImageUrl?: string | null
  allocations?: { cropId: string | null; crop: Crop | null; amountUsd: Quantity | null }[]
  code?: string
  status?: string
  hasNoteImage?: boolean
  noteImageName?: string | null
  noteImageUrl?: string | null
  items?: ShipmentProduct[]
  receptions?: {
    receiptNumber?: number
    items: { shipmentItemId: string; receivedQuantity: Quantity }[]
  }[]
}

type HistoryPage = { rows: HistoryRow[]; hasNext: boolean }
type TrashGroup = { groupId: string }

export type EasySectionId = 'cosechas' | 'mermas' | 'envios' | 'costos'

/* ───────────────────────── Utilidades ───────────────────────── */

const fetcher = productionFetch
const currency = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' })
const longDateFmt = new Intl.DateTimeFormat('es-EC', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const monthYearFmt = new Intl.DateTimeFormat('es-EC', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const shortDayFmt = new Intl.DateTimeFormat('es-EC', {
  weekday: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

const calendarWeekdays = [
  { short: 'Lun', full: 'Lunes' },
  { short: 'Mar', full: 'Martes' },
  { short: 'Mié', full: 'Miércoles' },
  { short: 'Jue', full: 'Jueves' },
  { short: 'Vie', full: 'Viernes' },
  { short: 'Sáb', full: 'Sábado' },
  { short: 'Dom', full: 'Domingo' },
] as const

function parseIsoParts(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

function toIsoDate(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day))
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function shiftIsoDays(iso: string, deltaDays: number): string {
  const parts = parseIsoParts(iso)
  if (!parts) return iso
  return toIsoDate(parts.year, parts.month, parts.day + deltaDays)
}

function formatLongSpanishDate(iso: string): string {
  const parts = parseIsoParts(iso)
  if (!parts) return '—'
  const text = longDateFmt.format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function formatAmount(value: unknown) {
  return currency.format(Number(value ?? 0))
}

function readableDate(iso: string) {
  if (!iso) return '—'
  const current = today()
  if (iso === current) return 'hoy'
  const parts = parseIsoParts(iso)
  if (!parts) return formatDate(iso)
  return longDateFmt.format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)))
}

function stockKey(
  cropId: string,
  varietyId?: string | null,
  productionAreaId?: string | null,
  unitId?: string | null,
) {
  return [cropId, varietyId ?? '', productionAreaId ?? '', unitId ?? ''].join('|')
}

function shipmentSubtotal(quantityStr: string, priceStr: string) {
  const q = parseCents(quantityStr)
  const p = parseCents(priceStr)
  if (q === null || p === null || q < 0 || p < 0) return 0
  return Number((BigInt(q) * BigInt(p) + BigInt(50)) / BigInt(100)) / 100
}

let easyLineSeq = 0
function nextUid() {
  easyLineSeq += 1
  return `easy-line-${easyLineSeq}`
}

const commonLossReasons = [
  'Producto dañado',
  'Plaga o enfermedad',
  'Exceso de maduración',
  'Daño en transporte',
  'Clima o lluvia',
] as const

const CUSTOM_EXPENSES_STORAGE_KEY = 'lodana-custom-expenses'

const quickFarmExpenses = [
  {
    label: 'Insecticida',
    description: 'Compra de insecticida',
    categoryHint: 'insumos',
    application: 'CROP' as const,
  },
  {
    label: 'Fungicida / herbicida',
    description: 'Compra de fungicida o herbicida',
    categoryHint: 'insumos',
    application: 'CROP' as const,
  },
  {
    label: 'Abono / fertilizante',
    description: 'Compra de abono o fertilizante',
    categoryHint: 'insumos',
    application: 'CROP' as const,
  },
  {
    label: 'Semillas / plántulas',
    description: 'Compra de semillas o plántulas',
    categoryHint: 'insumos',
    application: 'CROP' as const,
  },
  {
    label: 'Fumigación / plagas',
    description: 'Aplicación de insecticida / fumigación',
    categoryHint: 'mano de obra',
    application: 'CROP' as const,
  },
  {
    label: 'Jornales',
    description: 'Pago de jornales',
    categoryHint: 'mano de obra',
    application: 'CROP' as const,
  },
  {
    label: 'Transporte / combustible',
    description: 'Transporte o combustible',
    categoryHint: 'transporte',
    application: 'GENERAL' as const,
  },
  {
    label: 'Riego / mantenimiento',
    description: 'Mantenimiento o sistema de riego',
    categoryHint: 'mantenimiento',
    application: 'GENERAL' as const,
  },
] as const

const categoryExamples: Record<string, string> = {
  insumos: 'insecticidas, fungicidas, herbicidas, abonos, semillas',
  'mano de obra': 'jornales, fumigación, poda, cosecha',
  transporte: 'flete, gasolina, diésel',
  mantenimiento: 'riego, bombas, herramientas, invernadero',
  'servicios básicos': 'luz, agua de riego',
  'servicios basicos': 'luz, agua de riego',
}

/* ───────────────────── Estilos de campo (grandes y claros) ───────────────────── */

const ui = {
  card: 'rounded-2xl border-2 border-[#d5e3d7] bg-white p-5 shadow-sm dark:border-[#2d3b32] dark:bg-[#18211c] sm:p-6',
  stepBox: 'grid gap-3 rounded-2xl border border-[#dce8de] bg-[#f7fbf7] p-4 dark:border-[#2d3b32] dark:bg-[#141d18] sm:p-5',
  input:
    'min-h-12 w-full min-w-0 rounded-xl border-2 border-[#c7d8ca] bg-white px-4 py-3 text-base text-foreground shadow-sm transition placeholder:text-muted-foreground/70 focus:border-[#2c6048] focus:outline-none focus:ring-2 focus:ring-[#2c6048]/25 dark:border-[#34453a] dark:bg-[#111814]',
  btnPrimary:
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#2c6048] px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#234d39] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2c6048]/40 disabled:cursor-not-allowed disabled:opacity-55',
  btnOutline:
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-[#c7d8ca] bg-white px-4 py-2.5 text-base font-semibold text-foreground transition hover:bg-[#eef5ef] disabled:opacity-50 dark:border-[#34453a] dark:bg-[#141d18] dark:hover:bg-[#223027]',
  btnDanger:
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-55',
  btnSmall:
    'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#c7d8ca] bg-background px-3.5 py-2 text-sm font-semibold transition hover:bg-muted disabled:opacity-50 dark:border-[#34453a]',
}

/* ───────────────────── Componentes de apoyo ───────────────────── */

function StepHeading({ number, title, hint }: { number: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#2c6048] text-sm font-bold text-white shadow-sm">
        {number}
      </span>
      <div>
        <h3 className="text-base font-semibold leading-snug sm:text-lg">{title}</h3>
        {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}

function QuickDatePicker({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const todayStr = today()
  const todayParts = parseIsoParts(todayStr) ?? { year: 2026, month: 1, day: 1 }
  const initialParts = parseIsoParts(value) ?? todayParts

  const [calendarOpen, setCalendarOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState({
    year: initialParts.year,
    month: initialParts.month,
  })

  const prevValueRef = useRef(value)
  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value
      const parts = parseIsoParts(value)
      if (parts) {
        setViewMonth({ year: parts.year, month: parts.month })
      }
      if (value === todayStr) {
        setCalendarOpen(false)
      }
    }
  }, [value, todayStr])

  const isCustomDate = Boolean(value && value !== todayStr)
  const isTodaySelected = !isCustomDate && !calendarOpen
  const isOtherActive = isCustomDate || calendarOpen

  const yesterdayStr = shiftIsoDays(todayStr, -1)
  const twoDaysAgoStr = shiftIsoDays(todayStr, -2)

  const canGoNextMonth =
    viewMonth.year < todayParts.year ||
    (viewMonth.year === todayParts.year && viewMonth.month < todayParts.month)

  const monthHeadingRaw = monthYearFmt.format(
    new Date(Date.UTC(viewMonth.year, viewMonth.month - 1, 1)),
  )
  const monthHeading = (
    monthHeadingRaw.charAt(0).toUpperCase() + monthHeadingRaw.slice(1)
  ).replace(' de ', ' ')

  const firstWeekdayIndex =
    (new Date(Date.UTC(viewMonth.year, viewMonth.month - 1, 1)).getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(viewMonth.year, viewMonth.month, 0)).getUTCDate()

  function pickDate(iso: string) {
    onChange(iso)
    setCalendarOpen(false)
  }

  function goPrevMonth() {
    setViewMonth((prev) =>
      prev.month === 1
        ? { year: prev.year - 1, month: 12 }
        : { year: prev.year, month: prev.month - 1 },
    )
  }

  function goNextMonth() {
    if (!canGoNextMonth) return
    setViewMonth((prev) =>
      prev.month === 12
        ? { year: prev.year + 1, month: 1 }
        : { year: prev.year, month: prev.month + 1 },
    )
  }

  function formatShortcutSub(iso: string) {
    const parts = parseIsoParts(iso)
    if (!parts) return ''
    return shortDayFmt
      .format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)))
      .replace(',', '')
  }

  return (
    <div className="grid gap-3">
      <div role="group" aria-label="Elegir fecha" className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          aria-pressed={isTodaySelected}
          onClick={() => {
            setCalendarOpen(false)
            onChange(todayStr)
          }}
          className={`inline-flex min-h-13 items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-base font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2c6048]/40 ${
            isTodaySelected
              ? 'border-[#2c6048] bg-[#2c6048] text-white shadow-sm'
              : 'border-[#c7d8ca] bg-white text-foreground hover:border-[#2c6048] hover:bg-[#eef5ef] dark:border-[#34453a] dark:bg-[#18211c]'
          }`}
        >
          {isTodaySelected && <Check className="size-5 shrink-0" aria-hidden />}
          Hoy
        </button>

        <button
          type="button"
          aria-pressed={isOtherActive}
          aria-expanded={calendarOpen}
          onClick={() => {
            const parts = parseIsoParts(value) ?? todayParts
            setViewMonth({ year: parts.year, month: parts.month })
            setCalendarOpen((open) => (isCustomDate ? !open : true))
          }}
          className={`inline-flex min-h-13 items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-base font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2c6048]/40 ${
            isOtherActive
              ? 'border-[#2c6048] bg-[#2c6048] text-white shadow-sm'
              : 'border-[#c7d8ca] bg-white text-foreground hover:border-[#2c6048] hover:bg-[#eef5ef] dark:border-[#34453a] dark:bg-[#18211c]'
          }`}
        >
          <CalendarDays className="size-5 shrink-0" aria-hidden />
          Otra fecha
        </button>
      </div>

      {isCustomDate && !calendarOpen && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[#b7d3bc] bg-white px-4 py-3 dark:border-[#2d4537] dark:bg-[#18211c]">
          <div className="flex items-center gap-2.5">
            <CalendarDays className="size-5 shrink-0 text-[#2c6048] dark:text-[#a8d5b3]" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Fecha elegida
              </p>
              <p className="text-base font-bold text-foreground">{formatLongSpanishDate(value)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const parts = parseIsoParts(value) ?? todayParts
              setViewMonth({ year: parts.year, month: parts.month })
              setCalendarOpen(true)
            }}
            className={ui.btnSmall}
          >
            Cambiar día
          </button>
        </div>
      )}

      {calendarOpen && (
        <div
          role="region"
          aria-label="Calendario para elegir fecha"
          className="grid gap-4 rounded-2xl border-2 border-[#b7d3bc] bg-white p-4 shadow-sm dark:border-[#2d4537] dark:bg-[#18211c] sm:p-5"
        >
          {/* Accesos rápidos para días recientes */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Ayer', iso: yesterdayStr },
              { label: 'Hace 2 días', iso: twoDaysAgoStr },
            ].map((shortcut) => {
              const selected = value === shortcut.iso
              return (
                <button
                  key={shortcut.iso}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => pickDate(shortcut.iso)}
                  className={`flex min-h-12 flex-col items-center justify-center rounded-xl border-2 px-3 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2c6048]/40 ${
                    selected
                      ? 'border-[#2c6048] bg-[#2c6048] text-white shadow-sm'
                      : 'border-[#d5e3d7] bg-[#f7fbf7] text-foreground hover:border-[#2c6048] hover:bg-[#eef5ef] dark:border-[#34453a] dark:bg-[#141d18]'
                  }`}
                >
                  <span className="text-sm font-bold leading-tight">{shortcut.label}</span>
                  <span
                    className={`text-xs capitalize ${
                      selected ? 'text-emerald-100' : 'text-muted-foreground'
                    }`}
                  >
                    {formatShortcutSub(shortcut.iso)}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Navegación de mes */}
          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
            <button
              type="button"
              aria-label="Mes anterior"
              onClick={goPrevMonth}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border-2 border-[#c7d8ca] bg-white text-foreground transition hover:border-[#2c6048] hover:bg-[#eef5ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2c6048]/40 dark:border-[#34453a] dark:bg-[#141d18]"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>

            <p aria-live="polite" className="text-center text-lg font-bold text-foreground">
              {monthHeading}
            </p>

            <button
              type="button"
              aria-label="Mes siguiente"
              disabled={!canGoNextMonth}
              onClick={goNextMonth}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border-2 border-[#c7d8ca] bg-white text-foreground transition hover:border-[#2c6048] hover:bg-[#eef5ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2c6048]/40 disabled:cursor-not-allowed disabled:opacity-35 dark:border-[#34453a] dark:bg-[#141d18]"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>

          {/* Días de la semana (lunes a domingo) */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {calendarWeekdays.map((day) => (
              <span
                key={day.short}
                title={day.full}
                className="py-1 text-xs font-bold uppercase tracking-wide text-muted-foreground sm:text-sm"
              >
                {day.short}
              </span>
            ))}

            {/* Espacios iniciales del mes */}
            {Array.from({ length: firstWeekdayIndex }).map((_, i) => (
              <span key={`empty-${i}`} aria-hidden />
            ))}

            {/* Días del mes */}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((dayNum) => {
              const iso = toIsoDate(viewMonth.year, viewMonth.month, dayNum)
              const isFuture = iso > todayStr
              const isSelected = iso === value
              const isCurrentDay = iso === todayStr

              return (
                <button
                  key={iso}
                  type="button"
                  disabled={isFuture}
                  aria-pressed={isSelected}
                  aria-current={isCurrentDay ? 'date' : undefined}
                  aria-label={`${formatLongSpanishDate(iso)}${isCurrentDay ? ' (hoy)' : ''}`}
                  onClick={() => pickDate(iso)}
                  className={`relative flex min-h-11 items-center justify-center rounded-xl text-base font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2c6048]/50 sm:min-h-12 ${
                    isSelected
                      ? 'bg-[#2c6048] font-bold text-white shadow-sm ring-2 ring-[#2c6048]/30'
                      : isFuture
                        ? 'cursor-not-allowed text-muted-foreground/35'
                        : isCurrentDay
                          ? 'border-2 border-[#2c6048] bg-[#eef5ef] font-bold text-[#1f4834] hover:bg-[#dcece0] dark:bg-[#1e3528] dark:text-[#d5f0dc]'
                          : 'text-foreground hover:bg-[#eef5ef] dark:hover:bg-[#223027]'
                  }`}
                >
                  {dayNum}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
            <span>Toca un día para seleccionarlo. Los días futuros no están disponibles.</span>
            <button
              type="button"
              onClick={() => setCalendarOpen(false)}
              className="font-bold text-[#2c6048] underline underline-offset-2 dark:text-[#a8d5b3]"
            >
              Cerrar calendario
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function EasyToast({
  notice,
  onClose,
}: {
  notice: { kind: 'success' | 'error'; text: string } | null
  onClose: () => void
}) {
  if (!notice) return null
  const ok = notice.kind === 'success'
  return (
    <div
      role={ok ? 'status' : 'alert'}
      className="fixed right-4 top-4 z-[60] w-[calc(100%-2rem)] max-w-md"
    >
      <div
        className={`flex items-start gap-3 rounded-2xl border-2 bg-background p-4 shadow-xl ${
          ok
            ? 'border-emerald-500 dark:border-emerald-600'
            : 'border-red-400 dark:border-red-700'
        }`}
      >
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
            ok
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
          }`}
        >
          {ok ? <CheckCircle2 className="size-5" /> : <TriangleAlert className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">{ok ? '¡Guardado!' : 'Revisa este aviso'}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{notice.text}</p>
        </div>
        <button
          type="button"
          aria-label="Cerrar aviso"
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
        >
          <X className="size-5" />
        </button>
      </div>
    </div>
  )
}

function NaturalConfirmModal({
  open,
  title,
  tone = 'primary',
  confirmLabel,
  cancelLabel = 'Volver a revisar',
  busy = false,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean
  title: string
  tone?: 'primary' | 'danger'
  confirmLabel: string
  cancelLabel?: string
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    dialog.showModal()
    return () => dialog.close()
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg bg-transparent p-0 text-foreground backdrop:bg-black/55 backdrop:backdrop-blur-sm"
    >
      <div className="overflow-hidden rounded-2xl border-2 border-[#d5e3d7] bg-background shadow-2xl dark:border-[#2d3b32]">
        <div className="flex items-start gap-3 p-5 sm:p-6">
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${
              tone === 'danger'
                ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
            }`}
          >
            {tone === 'danger' ? (
              <TriangleAlert className="size-6" />
            ) : (
              <CheckCircle2 className="size-6" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-semibold leading-tight">{title}</h3>
            <div className="mt-3 text-base leading-relaxed text-foreground">{children}</div>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2.5 border-t border-border bg-muted/20 p-4 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={onClose} className={ui.btnOutline}>
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={tone === 'danger' ? ui.btnDanger : ui.btnPrimary}
          >
            {busy && <Loader2 className="size-5 animate-spin" />}
            {busy ? 'Guardando…' : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}

/* ───────────────────── Pantalla de Inicio (Modo Fácil) ───────────────────── */

export function ProductionEasyHome() {
  const todayStr = today()
  const todayPretty = longDateFmt.format(new Date(`${todayStr}T00:00:00Z`))

  const { data: todayHarvests } = useSWR<HistoryPage>(
    `/api/harvests?${new URLSearchParams({ page: '1', from: todayStr, to: todayStr })}`,
    fetcher,
  )
  const { data: todayCosts } = useSWR<HistoryPage>(
    `/api/costs?${new URLSearchParams({ page: '1', from: todayStr, to: todayStr })}`,
    fetcher,
  )
  const { data: availability = [] } = useSWR<Availability[]>(
    `/api/shipments/availability?${new URLSearchParams({ asOf: todayStr })}`,
    fetcher,
  )
  const { data: trash = [] } = useSWR<TrashGroup[]>('/api/trash', fetcher)

  const readyToShipCount = availability.filter((item) => Number(item.available) > 0).length
  const harvestsTodayCount = todayHarvests?.rows.length ?? 0
  const costsTodayCount = todayCosts?.rows.length ?? 0

  const mainActions = [
    {
      href: '/lodana?seccion=cosechas',
      title: 'Anotar cosecha',
      subtitle: 'Registra lo que cosechaste en la finca.',
      badge: harvestsTodayCount > 0 ? `${harvestsTodayCount} hoy` : 'Diario',
      icon: Wheat,
      accent: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
      border: 'hover:border-emerald-600',
    },
    {
      href: '/lodana?seccion=mermas',
      title: 'Reportar daño o pérdida',
      subtitle: 'Anota producto dañado, plagas o pérdidas.',
      badge: 'Rápido',
      icon: TrendingDown,
      accent: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
      border: 'hover:border-amber-600',
    },
    {
      href: '/lodana?seccion=envios',
      title: 'Enviar a Agro Market',
      subtitle: 'Manda tu cosecha lista para la venta.',
      badge: readyToShipCount > 0 ? `${readyToShipCount} listo(s)` : 'Sin stock hoy',
      icon: Truck,
      accent: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
      border: 'hover:border-sky-600',
    },
    {
      href: '/lodana?seccion=costos',
      title: 'Anotar gasto',
      subtitle: 'Insumos, abonos, jornales o pagos de la finca.',
      badge: costsTodayCount > 0 ? `${costsTodayCount} hoy` : 'Finca o cultivo',
      icon: DollarSign,
      accent: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
      border: 'hover:border-violet-600',
    },
  ] as const

  const secondaryActions = [
    {
      href: '/lodana?seccion=resumen',
      title: 'Ver cómo va la finca',
      subtitle: 'Gráficas y totales por mes',
      icon: BarChart3,
    },
    {
      href: '/lodana?seccion=cultivos',
      title: 'Mis cultivos y zonas',
      subtitle: 'Agregar o editar cultivos, zonas y unidades',
      icon: Sprout,
    },
    {
      href: '/lodana?seccion=papelera',
      title: 'Borrados recientes',
      subtitle:
        trash.length > 0
          ? `${trash.length} registro(s) disponibles para recuperar`
          : 'Recupera registros borrados hasta por 60 días',
      icon: Trash2,
    },
  ] as const

  return (
    <div className="grid gap-4 sm:gap-6">
      {/* Encabezado compacto pensado para teléfono */}
      <section className="rounded-2xl border-2 border-[#cfe0d2] bg-gradient-to-br from-white via-[#f3f9f4] to-[#e2f0e5] p-4 shadow-sm dark:border-[#2d3b32] dark:from-[#18211c] dark:via-[#17241d] dark:to-[#1d3428] sm:rounded-3xl sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold capitalize text-[#2c6048] dark:text-[#a8d5b3] sm:text-sm">
              {todayPretty}
            </p>
            <h2 className="mt-0.5 text-2xl font-bold tracking-tight sm:text-3xl">
              ¿Qué vas a hacer hoy?
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-[#c7d8ca] bg-white/90 px-3 py-1 text-xs font-semibold text-foreground dark:border-[#34453a] dark:bg-[#141d18]">
              {harvestsTodayCount} cosecha(s) hoy
            </span>
            <span className="rounded-full border border-[#c7d8ca] bg-white/90 px-3 py-1 text-xs font-semibold text-foreground dark:border-[#34453a] dark:bg-[#141d18]">
              {readyToShipCount} listo(s) para enviar
            </span>
          </div>
        </div>
      </section>

      {/* 4 acciones diarias esenciales visibles de inmediato */}
      <section aria-label="Acciones diarias" className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {mainActions.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={`group flex items-center gap-3.5 rounded-2xl border-2 border-[#d5e3d7] bg-white p-4 shadow-sm transition active:scale-[0.99] hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2c6048] dark:border-[#2d3b32] dark:bg-[#18211c] sm:items-start sm:gap-4 sm:rounded-3xl sm:p-6 ${item.border}`}
            >
              <span
                className={`flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-sm transition group-hover:scale-105 sm:size-14 ${item.accent}`}
              >
                <Icon className="size-6 sm:size-7" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-bold leading-tight sm:text-xl">{item.title}</h3>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                    {item.badge}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-snug text-muted-foreground sm:text-base">
                  {item.subtitle}
                </p>
              </div>
              <ChevronRight
                className="size-5 shrink-0 text-muted-foreground/70 transition group-hover:translate-x-0.5 group-hover:text-[#2c6048]"
                aria-hidden
              />
            </Link>
          )
        })}
      </section>

      {/* Opciones secundarias */}
      <section aria-label="Otras opciones" className="grid gap-2.5 sm:gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:text-sm">
          Resultados y configuración de la finca
        </h3>
        <div className="grid gap-2.5 md:grid-cols-3 sm:gap-3">
          {secondaryActions.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className="flex items-center gap-3.5 rounded-2xl border border-[#d5e3d7] bg-white p-3.5 transition active:scale-[0.99] hover:border-[#2c6048] hover:bg-[#f7fbf7] dark:border-[#2d3b32] dark:bg-[#18211c] dark:hover:bg-[#1f2c24] sm:p-4"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#e4f0e7] text-[#24523b] dark:bg-[#234634] dark:text-[#c9e7d0]">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold leading-tight">{item.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.subtitle}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}

/* ───────────────────── Flujos guiados (Modo Fácil) ───────────────────── */

export function ProductionEasySection({
  section,
  preselectedHarvestId,
}: {
  section: EasySectionId
  preselectedHarvestId?: string | null
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'register' | 'history'>('register')
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  // Fecha compartida
  const [date, setDate] = useState(today)

  // Edición compartida
  const [editingRecord, setEditingRecord] = useState<HistoryRow | null>(null)
  const [recordToDelete, setRecordToDelete] = useState<HistoryRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Cosechas
  const [cropId, setCropId] = useState('')
  const [varietyId, setVarietyId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [estimatedPrice, setEstimatedPrice] = useState('')
  const [notes, setNotes] = useState('')
  const [showOptional, setShowOptional] = useState(false)

  // Mermas (Pérdidas)
  const [harvestSearch, setHarvestSearch] = useState('')
  const deferredHarvestSearch = useDeferredValue(harvestSearch)
  const [selectedHarvest, setSelectedHarvest] = useState<HistoryRow | null>(null)
  const [lossQuantity, setLossQuantity] = useState('')
  const [lossReason, setLossReason] = useState('')
  const [affectsHarvest, setAffectsHarvest] = useState<'true' | 'false' | ''>('true')
  const [lossPhotoAction, setLossPhotoAction] = useState<'keep' | 'replace' | 'remove'>('keep')
  const [lossPhotoDataUrl, setLossPhotoDataUrl] = useState<string | null>(null)
  const [lossPhotoName, setLossPhotoName] = useState<string | null>(null)

  // Envíos
  const [editingShipmentId, setEditingShipmentId] = useState<string | null>(null)
  const [editingShipmentCode, setEditingShipmentCode] = useState('')
  const [shipmentLines, setShipmentLines] = useState<ShipmentLine[]>([])
  const [shipmentNotes, setShipmentNotes] = useState('')
  const [shipmentPhotoAction, setShipmentPhotoAction] = useState<'keep' | 'replace' | 'remove'>('keep')
  const [shipmentPhotoDataUrl, setShipmentPhotoDataUrl] = useState<string | null>(null)
  const [shipmentPhotoName, setShipmentPhotoName] = useState<string | null>(null)
  const [shipmentToCancel, setShipmentToCancel] = useState<HistoryRow | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const shipmentReplayRef = useRef<{ draft: string; id: string } | null>(null)

  // Costos (Gastos)
  const [costDescription, setCostDescription] = useState('')
  const [costAmount, setCostAmount] = useState('')
  const [costCategoryId, setCostCategoryId] = useState('')
  const [customExpenses, setCustomExpenses] = useState<string[]>([])
  const [showNewExpense, setShowNewExpense] = useState(false)
  const [newExpenseName, setNewExpenseName] = useState('')
  const newExpenseInputRef = useRef<HTMLInputElement>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [costApplication, setCostApplication] = useState<'GENERAL' | 'CROP'>('GENERAL')
  const [costCropIds, setCostCropIds] = useState<string[]>([])
  const [costReceiptAction, setCostReceiptAction] = useState<'keep' | 'replace' | 'remove'>('keep')
  const [costReceiptDataUrl, setCostReceiptDataUrl] = useState<string | null>(null)
  const [costReceiptName, setCostReceiptName] = useState<string | null>(null)
  const [viewingReceipt, setViewingReceipt] = useState<{
    url: string
    title: string
    fileName?: string | null
    heading?: string
  } | null>(null)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CUSTOM_EXPENSES_STORAGE_KEY)
      if (!raw) return
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const clean = parsed
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter((item) => item.length > 0 && item.length <= 120)
        setCustomExpenses(clean.slice(0, 30))
      }
    } catch {
      // Ignora restricciones o datos inválidos en almacenamiento local
    }
  }, [])

  useEffect(() => {
    if (showNewExpense) {
      newExpenseInputRef.current?.focus()
    }
  }, [showNewExpense])

  function saveCustomExpenses(next: string[]) {
    setCustomExpenses(next)
    try {
      window.localStorage.setItem(CUSTOM_EXPENSES_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Ignora restricciones de almacenamiento local
    }
  }

  function handleAddCustomExpense(rawName: string) {
    const clean = rawName.trim().slice(0, 120)
    if (!clean) return
    const normalized = clean.toLowerCase()
    const alreadyExists =
      quickFarmExpenses.some(
        (preset) =>
          preset.label.toLowerCase() === normalized ||
          preset.description.toLowerCase() === normalized,
      ) || customExpenses.some((item) => item.toLowerCase() === normalized)

    if (!alreadyExists) {
      saveCustomExpenses([...customExpenses, clean].slice(0, 30))
    }
    setCostDescription(clean)
    setNewExpenseName('')
    setShowNewExpense(false)
    setNotice({
      kind: 'success',
      text: alreadyExists
        ? `Se seleccionó «${clean}».`
        : `Se añadió «${clean}» como opción rápida de gasto.`,
    })
  }

  function handleRemoveCustomExpense(name: string) {
    saveCustomExpenses(customExpenses.filter((item) => item !== name))
  }

  // Confirmación
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Historial
  const [historyPage, setHistoryPage] = useState(1)
  const [historySearch, setHistorySearch] = useState('')
  const deferredHistorySearch = useDeferredValue(historySearch)
  const [historyCropId, setHistoryCropId] = useState('')
  const [historyFrom, setHistoryFrom] = useState('')
  const [historyTo, setHistoryTo] = useState('')
  const [showHistoryFilters, setShowHistoryFilters] = useState(false)

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), notice.kind === 'error' ? 7000 : 5000)
    return () => clearTimeout(t)
  }, [notice])

  // Catálogos
  const { data: crops = [] } = useSWR<Crop[]>('/api/crops', fetcher)
  const { data: units = [] } = useSWR<Unit[]>(
    section === 'cosechas' ? '/api/units' : null,
    fetcher,
  )
  const { data: categories = [], mutate: mutateCategories } = useSWR<CostCategory[]>(
    section === 'costos' ? '/api/cost-categories?includeInactive=true' : null,
    fetcher,
  )
  const activeCategories = categories.filter(
    (c) => c.active || c.id === editingRecord?.category?.id,
  )

  // Cosechas recientes para vincular merma
  const { data: harvestChoices } = useSWR<HistoryPage>(
    section === 'mermas'
      ? `/api/harvests?${new URLSearchParams({ page: '1', q: deferredHarvestSearch })}`
      : null,
    fetcher,
  )

  // Preselección si viene desde el botón "Reportar daño" en una cosecha
  useEffect(() => {
    if (section !== 'mermas' || !preselectedHarvestId || selectedHarvest) return
    const match = harvestChoices?.rows.find((row) => row.id === preselectedHarvestId)
    if (match) setSelectedHarvest(match)
  }, [section, preselectedHarvestId, harvestChoices, selectedHarvest])

  // Disponibilidad de envíos
  const {
    data: availability = [],
    isLoading: availabilityLoading,
    error: availabilityError,
    mutate: mutateAvailability,
  } = useSWR<Availability[]>(
    section === 'envios' && date
      ? `/api/shipments/availability?${new URLSearchParams({
          asOf: date,
          ...(editingShipmentId ? { editShipmentId: editingShipmentId } : {}),
        })}`
      : null,
    fetcher,
  )

  const availableStock = availability.filter((item) => Number(item.available) > 0)
  const stockByKey = useMemo(() => {
    const map = new Map<string, Availability>()
    for (const item of availability) {
      map.set(stockKey(item.cropId, item.varietyId, item.productionAreaId, item.unitId), item)
    }
    return map
  }, [availability])

  // Historial de la sección actual
  const endpoint =
    section === 'cosechas'
      ? '/api/harvests'
      : section === 'mermas'
        ? '/api/losses'
        : section === 'envios'
          ? '/api/shipments'
          : '/api/costs'

  const historyParams = new URLSearchParams({
    page: String(historyPage),
    from: historyFrom,
    to: historyTo,
    cropId: section === 'cosechas' || section === 'mermas' ? historyCropId : '',
    q: deferredHistorySearch,
  })
  const {
    data: history,
    isLoading: historyLoading,
    error: historyError,
    mutate: mutateHistory,
  } = useSWR<HistoryPage>(
    tab === 'history' ? `${endpoint}?${historyParams}` : null,
    fetcher,
  )

  const selectedCrop =
    crops.find((c) => c.id === cropId) ??
    (editingRecord?.crop?.id === cropId ? editingRecord?.crop : undefined)

  const activeUnitName =
    units.find((u) => u.id === (unitId || selectedCrop?.unit?.id))?.name ??
    selectedCrop?.unit?.name ??
    editingRecord?.unit?.name ??
    ''

  const hasLockedHarvestRefs =
    section === 'cosechas' && Boolean(editingRecord && (editingRecord.losses?.length ?? 0) > 0)

  function refreshAll(alsoTrash = false) {
    const targets =
      section === 'cosechas' || section === 'mermas'
        ? ['/api/harvests', '/api/losses', '/api/shipments/availability', '/api/production-summary']
        : section === 'envios'
          ? ['/api/shipments', '/api/shipments/availability', '/api/production-summary']
          : ['/api/costs', '/api/production-summary']
    if (alsoTrash) targets.push('/api/trash')
    void invalidateProduction(...targets)
  }

  function resetAllForms() {
    setEditingRecord(null)
    setDate(today())
    setCropId('')
    setVarietyId('')
    setAreaId('')
    setUnitId('')
    setQuantity('')
    setEstimatedPrice('')
    setNotes('')
    setShowOptional(false)
    setSelectedHarvest(null)
    setLossQuantity('')
    setLossReason('')
    setAffectsHarvest('true')
    setLossPhotoAction('keep')
    setLossPhotoDataUrl(null)
    setLossPhotoName(null)
    setEditingShipmentId(null)
    setEditingShipmentCode('')
    setShipmentLines([])
    setShipmentNotes('')
    setShipmentPhotoAction('keep')
    setShipmentPhotoDataUrl(null)
    setShipmentPhotoName(null)
    setCostDescription('')
    setCostAmount('')
    setCostCategoryId('')
    setShowNewExpense(false)
    setNewExpenseName('')
    setCostApplication('GENERAL')
    setCostCropIds([])
    setCostReceiptAction('keep')
    setCostReceiptDataUrl(null)
    setCostReceiptName(null)
  }

  function selectCrop(crop: Crop) {
    setCropId(crop.id)
    setVarietyId('')
    setUnitId(crop.unit?.id ?? '')
    const areas = crop.productionAreas ?? []
    setAreaId(areas.length === 1 ? areas[0].id : '')
  }

  function startEditRow(row: HistoryRow) {
    setEditingRecord(row)
    setDate(String(row.date).slice(0, 10))
    setNotes(row.notes ?? '')
    setShowOptional(
      Boolean(
        row.notes ||
          row.estimatedUnitPrice ||
          row.hasReceiptImage ||
          row.hasNoteImage ||
          row.hasEvidenceImage,
      ),
    )

    if (section === 'cosechas') {
      setCropId(row.cropId ?? '')
      setVarietyId(row.varietyId ?? '')
      setAreaId(row.productionAreaId ?? '')
      setUnitId(row.unitId ?? '')
      setQuantity(String(row.quantity ?? ''))
      setEstimatedPrice(row.estimatedUnitPrice != null ? String(row.estimatedUnitPrice) : '')
    } else if (section === 'mermas') {
      setSelectedHarvest(row.harvest ?? null)
      setLossQuantity(String(row.quantity ?? ''))
      setLossReason(row.reason?.name ?? '')
      setAffectsHarvest(
        typeof row.affectsHarvest === 'boolean' ? (row.affectsHarvest ? 'true' : 'false') : 'true',
      )
      setLossPhotoAction('keep')
      setLossPhotoDataUrl(null)
      setLossPhotoName(row.evidenceImageName ?? null)
    } else if (section === 'costos') {
      setCostDescription(row.description ?? '')
      setCostAmount(String(row.amountUsd ?? ''))
      setCostCategoryId(row.category?.id ?? '')
      const isCropCost = row.applicationType === 'CROP' || Boolean(row.allocations?.length)
      setCostApplication(isCropCost ? 'CROP' : 'GENERAL')
      setCostCropIds(row.allocations?.flatMap((a) => (a.cropId ? [a.cropId] : [])) ?? [])
      setCostReceiptAction('keep')
      setCostReceiptDataUrl(null)
      setCostReceiptName(row.receiptImageName ?? null)
    } else if (section === 'envios') {
      setEditingShipmentId(row.id)
      setEditingShipmentCode(row.code ?? '')
      setShipmentNotes(row.notes ?? '')
      setShipmentPhotoAction('keep')
      setShipmentPhotoDataUrl(null)
      setShipmentPhotoName(row.noteImageName ?? null)
      setShipmentLines(
        (row.items ?? []).map((item) => ({
          uid: nextUid(),
          cropId: item.cropId,
          cropName: item.crop?.name ?? 'Cultivo',
          varietyId: item.varietyId ?? '',
          varietyName: item.variety?.name ?? '',
          productionAreaId: item.productionAreaId ?? '',
          productionAreaName: item.productionArea?.name ?? '',
          unitId: item.unitId || item.unit?.id || '',
          unitName: item.unit?.name ?? '',
          quantity: String(item.quantity),
          unitPrice: item.estimatedUnitPrice != null ? String(item.estimatedUnitPrice) : '',
          notes: item.notes,
        })),
      )
    }

    setTab('register')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /* ---------- Envíos helpers ---------- */

  function addStockToShipment(item: Availability) {
    const key = stockKey(item.cropId, item.varietyId, item.productionAreaId, item.unitId)
    setShipmentLines((prev) => {
      if (
        prev.some(
          (line) =>
            stockKey(line.cropId, line.varietyId, line.productionAreaId, line.unitId) === key,
        )
      ) {
        return prev
      }
      return [
        ...prev,
        {
          uid: nextUid(),
          cropId: item.cropId,
          cropName: item.cropName,
          varietyId: item.varietyId ?? '',
          varietyName: item.varietyName ?? '',
          productionAreaId: item.productionAreaId ?? '',
          productionAreaName: item.productionAreaName ?? '',
          unitId: item.unitId,
          unitName: item.unitName ?? '',
          quantity: String(item.available),
          unitPrice: item.estimatedUnitPrice ?? '',
        },
      ]
    })
  }

  function addAllAvailableToShipment() {
    if (!availableStock.length) {
      setNotice({ kind: 'error', text: 'No hay producto disponible para enviar en esta fecha.' })
      return
    }
    const lines: ShipmentLine[] = availableStock.slice(0, 100).map((item) => ({
      uid: nextUid(),
      cropId: item.cropId,
      cropName: item.cropName,
      varietyId: item.varietyId ?? '',
      varietyName: item.varietyName ?? '',
      productionAreaId: item.productionAreaId ?? '',
      productionAreaName: item.productionAreaName ?? '',
      unitId: item.unitId,
      unitName: item.unitName ?? '',
      quantity: String(item.available),
      unitPrice: item.estimatedUnitPrice ?? '',
    }))
    setShipmentLines(lines)
    const missingPrices = lines.some((l) => !l.unitPrice)
    setNotice({
      kind: missingPrices ? 'error' : 'success',
      text: missingPrices
        ? 'Se agregaron los productos disponibles. Completa el precio en los que falte.'
        : 'Listo: se agregaron todos los productos disponibles. Revisa y confirma abajo.',
    })
  }

  const shipmentValidation = useMemo(() => {
    const total = shipmentLines.reduce(
      (sum, line) => sum + shipmentSubtotal(line.quantity, line.unitPrice),
      0,
    )
    const lineErrors = shipmentLines.map((line) => {
      const key = stockKey(line.cropId, line.varietyId, line.productionAreaId, line.unitId)
      const avail = Number(stockByKey.get(key)?.available ?? 0)
      const q = Number(line.quantity)
      const p = Number(line.unitPrice)
      if (!Number.isFinite(q) || q <= 0) return { type: 'qty' as const, avail }
      if (!availabilityLoading && q > avail + 0.0001) return { type: 'exceeds' as const, avail }
      if (!Number.isFinite(p) || p <= 0) return { type: 'price' as const, avail }
      return { type: null, avail }
    })
    const hasError = lineErrors.some((e) => e.type !== null)
    return {
      total,
      lineErrors,
      canSubmit:
        shipmentLines.length > 0 && !hasError && !availabilityLoading && !availabilityError && Boolean(date),
    }
  }, [shipmentLines, stockByKey, availabilityLoading, availabilityError, date])

  /* ---------- Crear categoría rápida en gastos ---------- */

  async function handleCreateCategory() {
    const clean = newCategoryName.trim()
    if (!clean || savingCategory) return
    setSavingCategory(true)
    try {
      const created = await productionFetch<CostCategory>('/api/cost-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean }),
      })
      setCostCategoryId(created.id)
      setNewCategoryName('')
      setShowNewCategory(false)
      void mutateCategories()
      setNotice({ kind: 'success', text: `Se creó la categoría «${created.name}».` })
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'No se pudo crear la categoría.',
      })
    } finally {
      setSavingCategory(false)
    }
  }

  /* ---------- Validación previa a abrir confirmación ---------- */

  function handleFormSubmit(event: FormEvent) {
    event.preventDefault()
    setNotice(null)

    if (section === 'cosechas') {
      if (!cropId) return setNotice({ kind: 'error', text: 'Primero toca el cultivo que cosechaste.' })
      if (!areaId && !(editingRecord && !editingRecord.productionAreaId)) {
        return setNotice({ kind: 'error', text: 'Toca la zona donde se cosechó.' })
      }
      if (!quantity || Number(quantity) <= 0) {
        return setNotice({ kind: 'error', text: 'Escribe cuánta cantidad cosechaste.' })
      }
      if (!(unitId || selectedCrop?.unit?.id)) {
        return setNotice({ kind: 'error', text: 'Selecciona la unidad de medida.' })
      }
    } else if (section === 'mermas') {
      if (!selectedHarvest) {
        return setNotice({ kind: 'error', text: 'Elige de qué cosecha se perdió el producto.' })
      }
      if (!lossQuantity || Number(lossQuantity) <= 0) {
        return setNotice({ kind: 'error', text: 'Escribe cuánta cantidad se dañó o perdió.' })
      }
      if (!lossReason.trim()) {
        return setNotice({ kind: 'error', text: 'Indica el motivo de la pérdida.' })
      }
      if (!affectsHarvest) {
        return setNotice({
          kind: 'error',
          text: 'Indica si esta pérdida se descuenta de lo cosechado.',
        })
      }
    } else if (section === 'envios') {
      if (!shipmentLines.length) {
        return setNotice({
          kind: 'error',
          text: 'Agrega al menos un producto de la lista de disponibles.',
        })
      }
      if (!shipmentValidation.canSubmit) {
        return setNotice({
          kind: 'error',
          text: 'Revisa que cada producto tenga cantidad disponible y precio válido.',
        })
      }
    } else if (section === 'costos') {
      if (!costDescription.trim()) {
        return setNotice({ kind: 'error', text: 'Escribe en qué se gastó el dinero.' })
      }
      if (!costAmount || Number(costAmount) <= 0) {
        return setNotice({ kind: 'error', text: 'Escribe cuánto costó en dólares.' })
      }
      if (!costCategoryId) {
        return setNotice({ kind: 'error', text: 'Toca un tipo de gasto (categoría).' })
      }
      if (costApplication === 'CROP' && !costCropIds.length) {
        return setNotice({ kind: 'error', text: 'Toca al menos un cultivo para este gasto.' })
      }
    }

    setConfirmOpen(true)
  }

  /* ---------- Guardar en el servidor (mismas APIs) ---------- */

  async function confirmSave() {
    if (saving) return
    setSaving(true)
    setNotice(null)

    try {
      if (section === 'cosechas') {
        const payload: Record<string, unknown> = {
          ...(editingRecord ? { id: editingRecord.id } : {}),
          date,
          cropId,
          varietyId: varietyId || '',
          productionAreaId: areaId || '',
          unitId: unitId || selectedCrop?.unit?.id || '',
          quantity,
          estimatedUnitPrice: estimatedPrice || '',
          notes,
        }
        await productionFetch('/api/harvests', {
          method: editingRecord ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        setNotice({
          kind: 'success',
          text: editingRecord
            ? 'Los cambios de la cosecha se guardaron correctamente.'
            : 'Cosecha guardada. Ya quedó disponible para enviar a Agro Market.',
        })
      } else if (section === 'mermas') {
        const payload: Record<string, unknown> = {
          ...(editingRecord ? { id: editingRecord.id } : {}),
          date,
          harvestId: selectedHarvest!.id,
          quantity: lossQuantity,
          reason: lossReason.trim(),
          affectsHarvest: affectsHarvest === 'true',
          ...(lossPhotoAction === 'replace' && lossPhotoDataUrl
            ? { evidenceImage: lossPhotoDataUrl, evidenceImageName: lossPhotoName }
            : lossPhotoAction === 'remove'
              ? { evidenceImage: null, evidenceImageName: null }
              : {}),
          notes,
        }
        await productionFetch('/api/losses', {
          method: editingRecord ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        setNotice({
          kind: 'success',
          text: editingRecord
            ? 'Pérdida actualizada correctamente.'
            : 'Pérdida registrada correctamente.',
        })
      } else if (section === 'envios') {
        const wasEditing = Boolean(editingShipmentId)
        const items = shipmentLines.map((line) => ({
          cropId: line.cropId,
          varietyId: line.varietyId || null,
          productionAreaId: line.productionAreaId || null,
          unitId: line.unitId || null,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          notes: line.notes ?? null,
        }))
        const draftBody: Record<string, unknown> = {
          date,
          notes: shipmentNotes,
          items,
          ...(shipmentPhotoAction === 'replace' && shipmentPhotoDataUrl
            ? { noteImage: shipmentPhotoDataUrl, noteImageName: shipmentPhotoName }
            : shipmentPhotoAction === 'remove'
              ? { noteImage: null, noteImageName: null }
              : {}),
        }
        const snapshot = JSON.stringify(draftBody)
        if (!wasEditing && shipmentReplayRef.current?.draft !== snapshot) {
          shipmentReplayRef.current = { draft: snapshot, id: createRequestId() }
        }
        const saved = await productionFetch<{ code?: string }>(
          wasEditing ? `/api/shipments/${editingShipmentId}` : '/api/shipments',
          {
            method: wasEditing ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              wasEditing
                ? draftBody
                : { ...draftBody, requestId: shipmentReplayRef.current!.id },
            ),
          },
        )
        shipmentReplayRef.current = null
        setNotice({
          kind: 'success',
          text: wasEditing
            ? 'Envío actualizado correctamente.'
            : `Envío ${saved.code ?? ''} registrado. Agro Market ya puede recibirlo.`,
        })
      } else {
        const payload: Record<string, unknown> = {
          ...(editingRecord ? { id: editingRecord.id } : {}),
          date,
          description: costDescription.trim(),
          categoryId: costCategoryId,
          amountUsd: costAmount,
          applicationType: costApplication,
          ...(costApplication === 'CROP' ? { cropIds: costCropIds } : {}),
          ...(costReceiptAction === 'replace' && costReceiptDataUrl
            ? { receiptImage: costReceiptDataUrl, receiptImageName: costReceiptName }
            : costReceiptAction === 'remove'
              ? { receiptImage: null, receiptImageName: null }
              : {}),
          notes,
        }
        await productionFetch('/api/costs', {
          method: editingRecord ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        setNotice({
          kind: 'success',
          text: editingRecord ? 'Gasto actualizado correctamente.' : 'Gasto guardado correctamente.',
        })
      }

      setConfirmOpen(false)
      resetAllForms()
      refreshAll()
    } catch (err) {
      setConfirmOpen(false)
      if (section === 'envios') void mutateAvailability()
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'No se pudo guardar el registro.',
      })
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!recordToDelete || deleting) return
    setDeleting(true)
    try {
      await productionFetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordToDelete.id }),
      })
      if (editingRecord?.id === recordToDelete.id) resetAllForms()
      setRecordToDelete(null)
      setNotice({
        kind: 'success',
        text: 'Registro borrado. Puedes recuperarlo en «Borrados recientes» durante 60 días.',
      })
      refreshAll(true)
    } catch (err) {
      setRecordToDelete(null)
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'No se pudo borrar el registro.',
      })
    } finally {
      setDeleting(false)
    }
  }

  async function confirmCancelShipment() {
    if (!shipmentToCancel || cancelling) return
    setCancelling(true)
    try {
      await productionFetch(`/api/shipments/${shipmentToCancel.id}`, { method: 'DELETE' })
      if (editingShipmentId === shipmentToCancel.id) resetAllForms()
      setShipmentToCancel(null)
      setNotice({
        kind: 'success',
        text: 'Envío cancelado. El producto volvió a quedar disponible para enviar.',
      })
      refreshAll()
    } catch (err) {
      setShipmentToCancel(null)
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'No se pudo cancelar el envío.',
      })
    } finally {
      setCancelling(false)
    }
  }

  /* ---------- Metadata visual por sección ---------- */

  const sectionMeta = {
    cosechas: {
      title: editingRecord ? 'Corregir cosecha' : 'Anotar cosecha',
      historyLabel: 'Ver cosechas anotadas',
      saveLabel: editingRecord ? 'Guardar cambios' : 'Revisar y guardar cosecha',
      confirmTitle: editingRecord ? '¿Guardar los cambios?' : '¿Guardar esta cosecha?',
      confirmBtn: editingRecord ? 'Sí, guardar cambios' : 'Sí, guardar cosecha',
      icon: Wheat,
    },
    mermas: {
      title: editingRecord ? 'Corregir pérdida' : 'Reportar daño o pérdida',
      historyLabel: 'Ver pérdidas reportadas',
      saveLabel: editingRecord ? 'Guardar cambios' : 'Revisar y reportar pérdida',
      confirmTitle: editingRecord ? '¿Guardar los cambios?' : '¿Reportar esta pérdida?',
      confirmBtn: editingRecord ? 'Sí, guardar cambios' : 'Sí, reportar pérdida',
      icon: TrendingDown,
    },
    envios: {
      title: editingShipmentId ? `Corregir envío ${editingShipmentCode}` : 'Enviar a Agro Market',
      historyLabel: 'Ver envíos realizados',
      saveLabel: editingShipmentId ? 'Guardar cambios del envío' : 'Revisar y confirmar envío',
      confirmTitle: editingShipmentId ? '¿Guardar cambios del envío?' : '¿Confirmar este envío?',
      confirmBtn: editingShipmentId ? 'Sí, guardar cambios' : 'Sí, enviar a Agro Market',
      icon: Truck,
    },
    costos: {
      title: editingRecord ? 'Corregir gasto' : 'Anotar gasto',
      historyLabel: 'Ver gastos anotados',
      saveLabel: editingRecord ? 'Guardar cambios' : 'Revisar y guardar gasto',
      confirmTitle: editingRecord ? '¿Guardar los cambios?' : '¿Guardar este gasto?',
      confirmBtn: editingRecord ? 'Sí, guardar cambios' : 'Sí, guardar gasto',
      icon: Wallet,
    },
  }[section]

  const HeaderIcon = sectionMeta.icon
  const selectedCategoryName =
    activeCategories.find((c) => c.id === costCategoryId)?.name ?? editingRecord?.category?.name ?? ''

  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <EasyToast notice={notice} onClose={() => setNotice(null)} />

      {/* Barra superior: volver + selector Registrar / Historial */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/lodana" prefetch={false} className={ui.btnOutline}>
          <ArrowLeft className="size-5" />
          Volver al inicio
        </Link>

        <div
          role="tablist"
          aria-label="Cambiar entre registrar y ver historial"
          className="grid w-full grid-cols-2 gap-1.5 rounded-2xl border-2 border-[#d5e3d7] bg-white p-1.5 dark:border-[#2d3b32] dark:bg-[#18211c] sm:w-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'register'}
            onClick={() => setTab('register')}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition sm:text-base ${
              tab === 'register'
                ? 'bg-[#2c6048] text-white shadow-sm'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <PlusCircle className="size-4" />
            {editingRecord || editingShipmentId ? 'Editando' : 'Registrar'}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'history'}
            onClick={() => setTab('history')}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition sm:text-base ${
              tab === 'history'
                ? 'bg-[#2c6048] text-white shadow-sm'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <ClipboardList className="size-4" />
            Ver historial
          </button>
        </div>
      </div>

      {/* ─────────── PESTAÑA: REGISTRAR ─────────── */}
      {tab === 'register' && (
        <form onSubmit={handleFormSubmit} className={ui.card}>
          <div className="mb-5 flex items-center gap-3 border-b border-border/70 pb-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#e4f0e7] text-[#24523b] dark:bg-[#234634] dark:text-[#c9e7d0]">
              <HeaderIcon className="size-6" />
            </span>
            <div>
              <h2 className="text-2xl font-bold leading-tight">{sectionMeta.title}</h2>
              <p className="text-sm text-muted-foreground">
                Sigue los pasos numerados. Al final verás un resumen antes de guardar.
              </p>
            </div>
          </div>

          {(editingRecord || editingShipmentId) && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              <span>Estás corrigiendo un registro guardado anteriormente.</span>
              <button
                type="button"
                onClick={resetAllForms}
                className="font-bold underline underline-offset-2"
              >
                Cancelar corrección
              </button>
            </div>
          )}

          <div className="grid gap-5">
            {/* PASO 1: FECHA (en todas las secciones) */}
            <div className={ui.stepBox}>
              <StepHeading
                number={1}
                title={
                  section === 'cosechas'
                    ? 'Fecha de la cosecha'
                    : section === 'mermas'
                      ? 'Fecha del daño o pérdida'
                      : section === 'envios'
                        ? 'Fecha del envío'
                        : 'Fecha del gasto'
                }
                hint="Por defecto se guarda con la fecha de hoy. Toca «Otra fecha» solo si fue otro día."
              />
              <QuickDatePicker value={date} onChange={setDate} />
            </div>

            {/* ── COSECHAS ── */}
            {section === 'cosechas' && (
              <>
                <div className={ui.stepBox}>
                  <StepHeading
                    number={2}
                    title="¿Qué cultivo cosechaste?"
                    hint={
                      hasLockedHarvestRefs
                        ? 'Esta cosecha ya tiene pérdidas registradas; solo puedes cambiar fecha, cantidad, precio o nota.'
                        : 'Toca el cultivo. Su unidad de medida se pondrá sola.'
                    }
                  />
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {crops.map((crop) => {
                      const active = cropId === crop.id
                      return (
                        <button
                          key={crop.id}
                          type="button"
                          aria-pressed={active}
                          disabled={hasLockedHarvestRefs}
                          onClick={() => selectCrop(crop)}
                          className={`flex min-h-16 flex-col items-start justify-center rounded-2xl border-2 px-4 py-3 text-left transition disabled:opacity-60 ${
                            active
                              ? 'border-[#2c6048] bg-[#2c6048] text-white shadow-sm'
                              : 'border-[#c7d8ca] bg-white text-foreground hover:border-[#2c6048] hover:bg-[#eef5ef] dark:border-[#34453a] dark:bg-[#18211c]'
                          }`}
                        >
                          <span className="flex w-full items-center justify-between gap-1 text-base font-bold">
                            <span className="truncate">{crop.name}</span>
                            {active && <Check className="size-4 shrink-0" />}
                          </span>
                          {crop.unit?.name && (
                            <span
                              className={`mt-0.5 text-xs ${
                                active ? 'text-emerald-100' : 'text-muted-foreground'
                              }`}
                            >
                              en {crop.unit.name}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {selectedCrop && (
                  <div className={ui.stepBox}>
                    <StepHeading
                      number={3}
                      title="¿En qué zona de la finca?"
                      hint="Toca el lugar donde se cosechó."
                    />
                    {(selectedCrop.productionAreas?.length ?? 0) === 0 ? (
                      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        Este cultivo todavía no tiene zonas asignadas. Agrégale una en{' '}
                        <Link href="/lodana?seccion=cultivos" className="font-bold underline">
                          Mis cultivos y zonas
                        </Link>
                        .
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2.5">
                        {selectedCrop.productionAreas?.map((area) => {
                          const active = areaId === area.id
                          return (
                            <button
                              key={area.id}
                              type="button"
                              aria-pressed={active}
                              disabled={hasLockedHarvestRefs}
                              onClick={() => setAreaId(area.id)}
                              className={`inline-flex min-h-12 items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-base font-semibold transition disabled:opacity-60 ${
                                active
                                  ? 'border-[#2c6048] bg-[#2c6048] text-white shadow-sm'
                                  : 'border-[#c7d8ca] bg-white text-foreground hover:border-[#2c6048] hover:bg-[#eef5ef] dark:border-[#34453a] dark:bg-[#18211c]'
                              }`}
                            >
                              <MapPin className="size-4" />
                              {area.name}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {(selectedCrop.varieties?.length ?? 0) > 0 && (
                      <div className="mt-2 grid gap-2 border-t border-border/60 pt-3">
                        <p className="text-sm font-semibold text-muted-foreground">
                          Variedad (opcional):
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            aria-pressed={varietyId === ''}
                            disabled={hasLockedHarvestRefs}
                            onClick={() => setVarietyId('')}
                            className={`min-h-10 rounded-xl border-2 px-3.5 py-1.5 text-sm font-semibold transition ${
                              varietyId === ''
                                ? 'border-[#2c6048] bg-[#e4f0e7] text-[#1f4834] dark:bg-[#234634] dark:text-[#d5f0dc]'
                                : 'border-[#c7d8ca] bg-white text-muted-foreground dark:border-[#34453a] dark:bg-[#18211c]'
                            }`}
                          >
                            Sin especificar
                          </button>
                          {selectedCrop.varieties?.map((v) => {
                            const active = varietyId === v.id
                            return (
                              <button
                                key={v.id}
                                type="button"
                                aria-pressed={active}
                                disabled={hasLockedHarvestRefs}
                                onClick={() => setVarietyId(v.id)}
                                className={`min-h-10 rounded-xl border-2 px-3.5 py-1.5 text-sm font-semibold transition ${
                                  active
                                    ? 'border-[#2c6048] bg-[#2c6048] text-white'
                                    : 'border-[#c7d8ca] bg-white text-foreground hover:border-[#2c6048] dark:border-[#34453a] dark:bg-[#18211c]'
                                }`}
                              >
                                {v.name}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className={ui.stepBox}>
                  <StepHeading
                    number={selectedCrop ? 4 : 3}
                    title="Cantidad cosechada"
                    hint={
                      selectedCrop
                        ? `Indica cuántos ${activeUnitName || 'unidades'} de ${selectedCrop.name} se cosecharon.`
                        : 'Primero selecciona un cultivo arriba para ver su unidad de medida.'
                    }
                  />
                  <div className="flex flex-wrap items-stretch gap-2.5 sm:flex-nowrap">
                    <button
                      type="button"
                      aria-label="Restar 1"
                      onClick={() => {
                        const current = Number(quantity || 0)
                        const next = Math.max(0, Math.round((current - 1) * 100) / 100)
                        setQuantity(next > 0 ? String(next) : '')
                      }}
                      className="flex min-h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-[#c7d8ca] bg-white text-2xl font-bold text-foreground transition hover:bg-[#eef5ef] dark:border-[#34453a] dark:bg-[#18211c]"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      required
                      aria-label="Cantidad cosechada"
                      placeholder="Ej. 25"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className={`${ui.input} flex-1 text-center text-2xl font-bold`}
                    />
                    <button
                      type="button"
                      aria-label="Sumar 1"
                      onClick={() => {
                        const current = Number(quantity || 0)
                        const next = Math.round((current + 1) * 100) / 100
                        setQuantity(String(next))
                      }}
                      className="flex min-h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-[#c7d8ca] bg-white text-2xl font-bold text-foreground transition hover:bg-[#eef5ef] dark:border-[#34453a] dark:bg-[#18211c]"
                    >
                      +
                    </button>
                    {activeUnitName && (
                      <span className="flex min-h-12 shrink-0 items-center justify-center rounded-xl border-2 border-[#c7d8ca] bg-[#e4f0e7] px-4 text-base font-bold text-[#1f4834] dark:border-[#34453a] dark:bg-[#234634] dark:text-[#d5f0dc]">
                        {activeUnitName}
                      </span>
                    )}
                  </div>
                  {Number(quantity) > 0 && Number(estimatedPrice) > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Valor referencial estimado:{' '}
                      <strong className="text-foreground">
                        {formatAmount(shipmentSubtotal(quantity, estimatedPrice))}
                      </strong>
                    </p>
                  )}
                </div>

                {/* Opcionales colapsados */}
                <div className="rounded-2xl border border-dashed border-[#b8ceb9] p-4 dark:border-[#34453a]">
                  <button
                    type="button"
                    aria-expanded={showOptional}
                    onClick={() => setShowOptional((v) => !v)}
                    className="flex w-full items-center justify-between text-left text-base font-semibold text-[#24523b] dark:text-[#a8d5b3]"
                  >
                    <span>+ Agregar precio estimado, cambiar unidad o nota (opcional)</span>
                    <ChevronDown
                      className={`size-5 transition-transform ${showOptional ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {showOptional && (
                    <div className="mt-4 grid gap-4">
                      <label className="grid gap-1.5 text-sm font-semibold">
                        ¿A cuánto se vende hoy cada {activeUnitName || 'unidad'}? (USD, opcional)
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0.01"
                          step="0.01"
                          placeholder="Ej. 4.50"
                          value={estimatedPrice}
                          onChange={(e) => setEstimatedPrice(e.target.value)}
                          className={ui.input}
                        />
                      </label>
                      {!hasLockedHarvestRefs && (
                        <label className="grid gap-1.5 text-sm font-semibold">
                          Unidad de medida
                          <select
                            value={unitId || selectedCrop?.unit?.id || ''}
                            onChange={(e) => setUnitId(e.target.value)}
                            className={ui.input}
                          >
                            <option value="">Seleccionar unidad</option>
                            {units.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label className="grid gap-1.5 text-sm font-semibold">
                        Nota o comentario (opcional)
                        <textarea
                          rows={2}
                          maxLength={2000}
                          placeholder="Ej. fruta muy buena, lluvia en la tarde"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className={ui.input}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── MERMAS / PÉRDIDAS ── */}
            {section === 'mermas' && (
              <>
                <div className={ui.stepBox}>
                  <StepHeading
                    number={2}
                    title="¿De qué cosecha se dañó o perdió?"
                    hint="Toca la cosecha correspondiente de la lista."
                  />
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="search"
                      placeholder="Buscar por cultivo o zona (ej. Banano)…"
                      value={harvestSearch}
                      onChange={(e) => setHarvestSearch(e.target.value)}
                      className={`${ui.input} pl-11`}
                    />
                  </div>
                  <div className="grid max-h-60 gap-2 overflow-y-auto pr-1">
                    {selectedHarvest &&
                      !(harvestChoices?.rows ?? []).some((r) => r.id === selectedHarvest.id) && (
                        <button
                          type="button"
                          onClick={() => setSelectedHarvest(selectedHarvest)}
                          className="flex items-center justify-between gap-3 rounded-xl border-2 border-[#2c6048] bg-[#2c6048] px-4 py-3 text-left text-white"
                        >
                          <span className="font-bold">
                            {selectedHarvest.crop?.name} · {formatDate(selectedHarvest.date)}
                          </span>
                          <span className="text-sm font-semibold">
                            {selectedHarvest.quantity} {selectedHarvest.unit?.name}
                          </span>
                        </button>
                      )}
                    {(harvestChoices?.rows ?? []).slice(0, 12).map((row) => {
                      const active = selectedHarvest?.id === row.id
                      return (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => setSelectedHarvest(row)}
                          className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 px-4 py-3 text-left transition ${
                            active
                              ? 'border-[#2c6048] bg-[#2c6048] text-white shadow-sm'
                              : 'border-[#c7d8ca] bg-white hover:border-[#2c6048] hover:bg-[#eef5ef] dark:border-[#34453a] dark:bg-[#18211c]'
                          }`}
                        >
                          <div>
                            <p className="text-base font-bold">
                              {row.crop?.name || 'Cultivo'}
                              {row.variety?.name ? ` (${row.variety.name})` : ''}
                            </p>
                            <p
                              className={`text-xs ${
                                active ? 'text-emerald-100' : 'text-muted-foreground'
                              }`}
                            >
                              {row.productionArea?.name || 'Sin zona'} · {formatDate(row.date)}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-sm font-bold ${
                              active
                                ? 'bg-white/20 text-white'
                                : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                            }`}
                          >
                            {Number(row.quantity ?? 0).toFixed(2)} {row.unit?.name || ''}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className={ui.stepBox}>
                  <StepHeading
                    number={3}
                    title="¿Cuánto se perdió y por qué?"
                    hint="Toca un motivo rápido o escríbelo con tus palabras."
                  />
                  <div className="flex items-stretch gap-3">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      required
                      placeholder="Cantidad perdida (ej. 3)"
                      value={lossQuantity}
                      onChange={(e) => setLossQuantity(e.target.value)}
                      className={`${ui.input} text-2xl font-bold`}
                    />
                    {selectedHarvest?.unit?.name && (
                      <span className="flex shrink-0 items-center rounded-xl border-2 border-[#c7d8ca] bg-amber-50 px-4 text-base font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        {selectedHarvest.unit.name}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {commonLossReasons.map((reason) => {
                      const active = lossReason.trim().toLowerCase() === reason.toLowerCase()
                      return (
                        <button
                          key={reason}
                          type="button"
                          onClick={() => setLossReason(reason)}
                          className={`min-h-10 rounded-full border-2 px-3.5 py-1.5 text-sm font-semibold transition ${
                            active
                              ? 'border-[#2c6048] bg-[#2c6048] text-white'
                              : 'border-[#c7d8ca] bg-white text-foreground hover:border-[#2c6048] dark:border-[#34453a] dark:bg-[#18211c]'
                          }`}
                        >
                          {reason}
                        </button>
                      )
                    })}
                  </div>

                  <input
                    required
                    maxLength={120}
                    placeholder="Motivo (ej. fruta golpeada o plaga)"
                    value={lossReason}
                    onChange={(e) => setLossReason(e.target.value)}
                    className={ui.input}
                  />
                </div>

                <div className={ui.stepBox}>
                  <StepHeading
                    number={4}
                    title="¿Se descuenta de lo que ya cosechaste?"
                    hint="Elige si esto reduce el producto disponible para enviar a Agro Market."
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setAffectsHarvest('true')}
                      className={`rounded-2xl border-2 p-4 text-left transition ${
                        affectsHarvest === 'true'
                          ? 'border-[#2c6048] bg-[#e4f0e7] dark:bg-[#234634]'
                          : 'border-[#c7d8ca] bg-white hover:border-[#2c6048] dark:border-[#34453a] dark:bg-[#18211c]'
                      }`}
                    >
                      <p className="text-base font-bold">Sí, se dañó parte de lo cosechado</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Se resta de lo que tienes listo para enviar a Agro Market.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAffectsHarvest('false')}
                      className={`rounded-2xl border-2 p-4 text-left transition ${
                        affectsHarvest === 'false'
                          ? 'border-[#2c6048] bg-[#e4f0e7] dark:bg-[#234634]'
                          : 'border-[#c7d8ca] bg-white hover:border-[#2c6048] dark:border-[#34453a] dark:bg-[#18211c]'
                      }`}
                    >
                      <p className="text-base font-bold">No, se perdió antes de guardar</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Solo queda anotado como pérdida; no cambia tu producto disponible.
                      </p>
                    </button>
                  </div>
                </div>

                {(() => {
                  const activeLossPhoto =
                    lossPhotoAction === 'replace'
                      ? lossPhotoDataUrl
                      : lossPhotoAction === 'remove'
                        ? null
                        : editingRecord?.evidenceImageUrl ?? null
                  const hasAttachedLossPhoto = Boolean(activeLossPhoto)
                  return (
                    <div className="rounded-2xl border border-dashed border-[#b8ceb9] p-4 dark:border-[#34453a]">
                      <button
                        type="button"
                        aria-expanded={showOptional}
                        onClick={() => setShowOptional((v) => !v)}
                        className="flex w-full items-center justify-between gap-2 text-left text-base font-semibold text-[#24523b] dark:text-[#a8d5b3]"
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span>+ Agregar nota o foto del daño (opcional)</span>
                          {hasAttachedLossPhoto && (
                            <span className="rounded-full bg-[#e4f0e7] px-2.5 py-0.5 text-xs font-bold text-[#1f4834] dark:bg-[#234634] dark:text-[#d5f0dc]">
                              Foto adjunta
                            </span>
                          )}
                        </span>
                        <ChevronDown
                          className={`size-5 shrink-0 transition-transform ${showOptional ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {showOptional && (
                        <div className="mt-4 grid gap-4">
                          <div className="grid gap-1.5">
                            <span className="text-sm font-semibold">
                              Foto o imagen del daño o pérdida (opcional)
                            </span>
                            <ReceiptPhotoField
                              previewUrl={activeLossPhoto}
                              fileName={
                                lossPhotoAction === 'replace'
                                  ? lossPhotoName
                                  : lossPhotoAction === 'remove'
                                    ? null
                                    : editingRecord?.evidenceImageName ?? null
                              }
                              helperText="Opcional: toma una foto con tu teléfono o sube una imagen como evidencia del daño o pérdida."
                              onChange={(next) => {
                                if (next) {
                                  setLossPhotoAction('replace')
                                  setLossPhotoDataUrl(next.dataUrl)
                                  setLossPhotoName(next.name)
                                } else {
                                  setLossPhotoAction('remove')
                                  setLossPhotoDataUrl(null)
                                  setLossPhotoName(null)
                                }
                              }}
                              onError={(msg) => setNotice({ kind: 'error', text: msg })}
                            />
                          </div>
                          <label className="grid gap-1.5 text-sm font-semibold">
                            Nota o detalle (opcional)
                            <textarea
                              rows={2}
                              maxLength={2000}
                              placeholder="Ej. daño por lluvia fuerte en la noche"
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                              className={ui.input}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </>
            )}

            {/* ── ENVÍOS A AGRO MARKET ── */}
            {section === 'envios' && (
              <>
                <div className={ui.stepBox}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <StepHeading
                      number={2}
                      title="Producto listo para enviar"
                      hint="Toca «+ Agregar» en los productos que vas a mandar hoy."
                    />
                    <button
                      type="button"
                      disabled={
                        availabilityLoading ||
                        Boolean(availabilityError) ||
                        availableStock.length === 0
                      }
                      onClick={addAllAvailableToShipment}
                      className={ui.btnPrimary}
                    >
                      <Plus className="size-5" />
                      Enviar todo lo disponible
                    </button>
                  </div>

                  {availabilityError ? (
                    <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                      {availabilityError.message}
                    </p>
                  ) : availabilityLoading ? (
                    <p className="text-sm text-muted-foreground">Buscando producto disponible…</p>
                  ) : availableStock.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-4 text-center text-base text-muted-foreground">
                      No hay producto disponible para enviar en esta fecha. Primero anota una
                      cosecha.
                    </p>
                  ) : (
                    <div className="grid max-h-72 gap-2.5 overflow-y-auto pr-1">
                      {availableStock.map((item) => {
                        const key = stockKey(
                          item.cropId,
                          item.varietyId,
                          item.productionAreaId,
                          item.unitId,
                        )
                        const added = shipmentLines.some(
                          (l) =>
                            stockKey(l.cropId, l.varietyId, l.productionAreaId, l.unitId) === key,
                        )
                        return (
                          <div
                            key={key}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#c7d8ca] bg-white p-3.5 dark:border-[#34453a] dark:bg-[#18211c]"
                          >
                            <div className="min-w-0">
                              <p className="text-base font-bold">
                                {item.cropName}
                                {item.varietyName ? ` · ${item.varietyName}` : ''}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {item.productionAreaName || 'Sin zona'} · Disponible:{' '}
                                <strong className="text-emerald-800 dark:text-emerald-300">
                                  {Number(item.available).toFixed(2)} {item.unitName}
                                </strong>
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={added}
                              onClick={() => addStockToShipment(item)}
                              className={
                                added
                                  ? 'inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                                  : 'inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#2c6048] px-4 py-2 text-sm font-bold text-white hover:bg-[#234d39]'
                              }
                            >
                              {added ? (
                                <>
                                  <Check className="size-4" /> Agregado
                                </>
                              ) : (
                                <>
                                  <Plus className="size-4" /> Agregar
                                </>
                              )}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className={ui.stepBox}>
                  <StepHeading
                    number={3}
                    title={`Productos en este envío (${shipmentLines.length})`}
                    hint="Revisa o ajusta la cantidad y el precio de cada producto."
                  />

                  {shipmentLines.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-5 text-center text-base text-muted-foreground">
                      Todavía no agregaste productos. Toca <strong>+ Agregar</strong> arriba.
                    </p>
                  ) : (
                    <div className="grid gap-3">
                      {shipmentLines.map((line, index) => {
                        const err = shipmentValidation.lineErrors[index]
                        const subtotal = shipmentSubtotal(line.quantity, line.unitPrice)
                        const stockMatch = stockByKey.get(
                          stockKey(line.cropId, line.varietyId, line.productionAreaId, line.unitId),
                        )
                        const suggestedPrice = stockMatch?.estimatedUnitPrice
                        return (
                          <div
                            key={line.uid}
                            className={`grid gap-3 rounded-2xl border-2 bg-white p-4 dark:bg-[#18211c] ${
                              err?.type === 'exceeds'
                                ? 'border-red-400 dark:border-red-700'
                                : 'border-[#c7d8ca] dark:border-[#34453a]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-lg font-bold">
                                  {line.cropName}
                                  {line.varietyName ? ` · ${line.varietyName}` : ''}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {line.productionAreaName || 'Sin zona'} · Máximo disponible:{' '}
                                  <strong>
                                    {err.avail.toFixed(2)} {line.unitName}
                                  </strong>
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setShipmentLines((prev) =>
                                    prev.filter((_, i) => i !== index),
                                  )
                                }
                                className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300"
                              >
                                <Trash2 className="size-4" /> Quitar
                              </button>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="grid gap-1 text-sm font-semibold">
                                Cantidad a enviar ({line.unitName || 'unidad'})
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min="0.01"
                                  step="0.01"
                                  required
                                  value={line.quantity}
                                  onChange={(e) =>
                                    setShipmentLines((prev) =>
                                      prev.map((item, i) =>
                                        i === index ? { ...item, quantity: e.target.value } : item,
                                      ),
                                    )
                                  }
                                  className={ui.input}
                                />
                              </label>
                              <label className="grid gap-1 text-sm font-semibold">
                                Precio por {line.unitName || 'unidad'} (USD)
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min="0.01"
                                  step="0.01"
                                  required
                                  placeholder={suggestedPrice ? `Estimado: ${suggestedPrice}` : 'Ej. 5.00'}
                                  value={line.unitPrice}
                                  onChange={(e) =>
                                    setShipmentLines((prev) =>
                                      prev.map((item, i) =>
                                        i === index ? { ...item, unitPrice: e.target.value } : item,
                                      ),
                                    )
                                  }
                                  className={ui.input}
                                />
                              </label>
                            </div>

                            {err.type === 'exceeds' && (
                              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
                                <span>
                                  Solo tienes{' '}
                                  <strong>
                                    {err.avail.toFixed(2)} {line.unitName}
                                  </strong>{' '}
                                  disponibles.
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setShipmentLines((prev) =>
                                      prev.map((item, i) =>
                                        i === index
                                          ? { ...item, quantity: String(err.avail) }
                                          : item,
                                      ),
                                    )
                                  }
                                  className="rounded-lg bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700"
                                >
                                  Usar máximo ({err.avail.toFixed(2)})
                                </button>
                              </div>
                            )}

                            <div className="flex items-center justify-between border-t border-border/60 pt-2 text-sm">
                              <span className="text-muted-foreground">Subtotal de este producto</span>
                              <strong className="text-base">{formatAmount(subtotal)}</strong>
                            </div>
                          </div>
                        )
                      })}

                      <div className="flex items-center justify-between rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                        <div>
                          <p className="text-sm text-muted-foreground">Total estimado del envío</p>
                          <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-200">
                            {formatAmount(shipmentValidation.total)}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-3.5 py-1.5 text-sm font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                          {shipmentLines.length} producto(s)
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {(() => {
                  const activeShipmentPhoto =
                    shipmentPhotoAction === 'replace'
                      ? shipmentPhotoDataUrl
                      : shipmentPhotoAction === 'remove'
                        ? null
                        : editingRecord?.noteImageUrl ?? null
                  const hasAttachedShipmentPhoto = Boolean(activeShipmentPhoto)
                  return (
                    <div className="rounded-2xl border border-dashed border-[#b8ceb9] p-4 dark:border-[#34453a]">
                      <button
                        type="button"
                        aria-expanded={showOptional}
                        onClick={() => setShowOptional((v) => !v)}
                        className="flex w-full items-center justify-between gap-2 text-left text-base font-semibold text-[#24523b] dark:text-[#a8d5b3]"
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span>+ Agregar nota o foto para Agro Market (opcional)</span>
                          {hasAttachedShipmentPhoto && (
                            <span className="rounded-full bg-[#e4f0e7] px-2.5 py-0.5 text-xs font-bold text-[#1f4834] dark:bg-[#234634] dark:text-[#d5f0dc]">
                              Foto adjunta
                            </span>
                          )}
                        </span>
                        <ChevronDown
                          className={`size-5 shrink-0 transition-transform ${showOptional ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {showOptional && (
                        <div className="mt-4 grid gap-4">
                          <div className="grid gap-1.5">
                            <span className="text-sm font-semibold">
                              Foto o imagen del envío (opcional)
                            </span>
                            <ReceiptPhotoField
                              previewUrl={activeShipmentPhoto}
                              fileName={
                                shipmentPhotoAction === 'replace'
                                  ? shipmentPhotoName
                                  : shipmentPhotoAction === 'remove'
                                    ? null
                                    : editingRecord?.noteImageName ?? null
                              }
                              helperText="Opcional: toma una foto con tu teléfono o sube una imagen de la carga o guía para Agro Market."
                              onChange={(next) => {
                                if (next) {
                                  setShipmentPhotoAction('replace')
                                  setShipmentPhotoDataUrl(next.dataUrl)
                                  setShipmentPhotoName(next.name)
                                } else {
                                  setShipmentPhotoAction('remove')
                                  setShipmentPhotoDataUrl(null)
                                  setShipmentPhotoName(null)
                                }
                              }}
                              onError={(msg) => setNotice({ kind: 'error', text: msg })}
                            />
                          </div>
                          <label className="grid gap-1.5 text-sm font-semibold">
                            Nota para Agro Market (opcional)
                            <textarea
                              rows={2}
                              maxLength={2000}
                              placeholder="Ej. llega en camioneta a las 9 de la mañana"
                              value={shipmentNotes}
                              onChange={(e) => setShipmentNotes(e.target.value)}
                              className={ui.input}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </>
            )}

            {/* ── COSTOS / GASTOS ── */}
            {section === 'costos' && (
              <>
                <div className={ui.stepBox}>
                  <StepHeading
                    number={2}
                    title="¿En qué se gastó y cuánto costó?"
                    hint="Toca una opción frecuente, añade una nueva si no aparece en la lista o escríbela directamente."
                  />
                  <div className="flex flex-wrap gap-2">
                    {quickFarmExpenses.map((preset) => {
                      const active =
                        costDescription.trim().toLowerCase() === preset.description.toLowerCase()
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            setCostDescription(preset.description)
                            const matchedCat = activeCategories.find(
                              (c) => c.name.trim().toLowerCase() === preset.categoryHint,
                            )
                            if (matchedCat) setCostCategoryId(matchedCat.id)
                            setCostApplication(preset.application)
                          }}
                          className={`min-h-10 rounded-full border-2 px-3.5 py-1.5 text-sm font-semibold transition ${
                            active
                              ? 'border-[#2c6048] bg-[#2c6048] text-white'
                              : 'border-[#c7d8ca] bg-white text-foreground hover:border-[#2c6048] hover:bg-[#eef5ef] dark:border-[#34453a] dark:bg-[#18211c]'
                          }`}
                        >
                          {preset.label}
                        </button>
                      )
                    })}

                    {customExpenses.map((item) => {
                      const active =
                        costDescription.trim().toLowerCase() === item.trim().toLowerCase()
                      return (
                        <span
                          key={item}
                          className={`inline-flex min-h-10 items-center overflow-hidden rounded-full border-2 text-sm font-semibold transition ${
                            active
                              ? 'border-[#2c6048] bg-[#2c6048] text-white'
                              : 'border-[#c7d8ca] bg-white text-foreground hover:border-[#2c6048] dark:border-[#34453a] dark:bg-[#18211c]'
                          }`}
                        >
                          <button
                            type="button"
                            aria-pressed={active}
                            onClick={() => setCostDescription(item)}
                            className="px-3.5 py-1.5 text-left"
                          >
                            {item}
                          </button>
                          <button
                            type="button"
                            aria-label={`Quitar opción rápida ${item}`}
                            title={`Quitar ${item}`}
                            onClick={() => handleRemoveCustomExpense(item)}
                            className={`flex h-full items-center pr-2.5 pl-1 transition ${
                              active
                                ? 'text-emerald-100 hover:text-white'
                                : 'text-muted-foreground hover:text-red-600'
                            }`}
                          >
                            <X className="size-3.5" aria-hidden />
                          </button>
                        </span>
                      )
                    })}

                    <button
                      type="button"
                      aria-expanded={showNewExpense}
                      onClick={() => setShowNewExpense((v) => !v)}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border-2 border-dashed border-[#2c6048] bg-white px-3.5 py-1.5 text-sm font-semibold text-[#2c6048] transition hover:bg-[#eef5ef] dark:bg-[#18211c] dark:text-[#a8d5b3]"
                    >
                      <Plus className="size-4" aria-hidden />
                      Añadir otro gasto
                    </button>
                  </div>

                  {showNewExpense && (
                    <div className="grid gap-2 rounded-xl border-2 border-[#b7d3bc] bg-white p-3.5 dark:border-[#2d4537] dark:bg-[#18211c]">
                      <p className="text-sm font-semibold text-foreground">
                        Añadir un gasto que no está en la lista
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <input
                          ref={newExpenseInputRef}
                          type="text"
                          maxLength={120}
                          placeholder="Ej. Cajas plásticas, manguera, alquiler de tractor"
                          aria-label="Nombre del nuevo gasto"
                          value={newExpenseName}
                          onChange={(e) => setNewExpenseName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleAddCustomExpense(newExpenseName)
                            }
                          }}
                          className={`${ui.input} min-w-44 flex-1`}
                        />
                        <button
                          type="button"
                          disabled={!newExpenseName.trim()}
                          onClick={() => handleAddCustomExpense(newExpenseName)}
                          className={ui.btnPrimary}
                        >
                          <Plus className="size-4" aria-hidden />
                          Agregar
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Se seleccionará ahora y quedará guardado como botón rápido para próximas veces.
                      </p>
                    </div>
                  )}

                  <label className="grid gap-1.5 text-sm font-semibold">
                    Descripción del gasto
                    <input
                      required
                      maxLength={200}
                      placeholder="Ej. compra de insecticida, cajas, manguera o pago de jornal"
                      value={costDescription}
                      onChange={(e) => setCostDescription(e.target.value)}
                      className={ui.input}
                    />
                  </label>
                  {costDescription.trim().length >= 3 &&
                    !quickFarmExpenses.some(
                      (p) =>
                        p.description.toLowerCase() === costDescription.trim().toLowerCase() ||
                        p.label.toLowerCase() === costDescription.trim().toLowerCase(),
                    ) &&
                    !customExpenses.some(
                      (item) => item.toLowerCase() === costDescription.trim().toLowerCase(),
                    ) && (
                      <button
                        type="button"
                        onClick={() => handleAddCustomExpense(costDescription)}
                        className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-[#2c6048] underline underline-offset-2 hover:text-[#1f4834] dark:text-[#a8d5b3]"
                      >
                        <Plus className="size-3.5" aria-hidden />
                        Guardar «{costDescription.trim()}» como opción rápida
                      </button>
                    )}
                  <label className="grid gap-1.5 text-sm font-semibold">
                    Monto pagado (USD)
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground">
                        $
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                        required
                        placeholder="0.00"
                        value={costAmount}
                        onChange={(e) => setCostAmount(e.target.value)}
                        className={`${ui.input} pl-9 text-2xl font-bold`}
                      />
                    </div>
                  </label>
                </div>

                <div className={ui.stepBox}>
                  <StepHeading
                    number={3}
                    title="¿Qué tipo de gasto es?"
                    hint="Toca una categoría (por ejemplo, Insumos incluye insecticidas, fungicidas, abonos y semillas) o crea una nueva."
                  />
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {activeCategories.map((cat) => {
                      const active = costCategoryId === cat.id
                      const example = categoryExamples[cat.name.trim().toLowerCase()]
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setCostCategoryId(cat.id)}
                          className={`flex min-h-14 flex-col items-start justify-center rounded-xl border-2 px-4 py-2.5 text-left transition ${
                            active
                              ? 'border-[#2c6048] bg-[#2c6048] text-white shadow-sm'
                              : 'border-[#c7d8ca] bg-white text-foreground hover:border-[#2c6048] hover:bg-[#eef5ef] dark:border-[#34453a] dark:bg-[#18211c]'
                          }`}
                        >
                          <span className="text-base font-bold">{cat.name}</span>
                          {example && (
                            <span
                              className={`mt-0.5 text-xs ${
                                active ? 'text-emerald-100' : 'text-muted-foreground'
                              }`}
                            >
                              {example}
                            </span>
                          )}
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => setShowNewCategory((v) => !v)}
                      className="inline-flex min-h-14 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[#2c6048] px-4 py-2 text-sm font-semibold text-[#2c6048] hover:bg-[#eef5ef] dark:text-[#a8d5b3]"
                    >
                      <Plus className="size-4" />
                      Otra categoría (ej. Insecticidas)
                    </button>
                  </div>
                  {showNewCategory && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        maxLength={120}
                        placeholder="Ej. Insecticidas, Herbicidas, Empaques"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void handleCreateCategory()
                          }
                        }}
                        className={`${ui.input} min-w-44 flex-1`}
                      />
                      <button
                        type="button"
                        disabled={!newCategoryName.trim() || savingCategory}
                        onClick={() => void handleCreateCategory()}
                        className={ui.btnPrimary}
                      >
                        {savingCategory ? 'Creando…' : 'Agregar'}
                      </button>
                    </div>
                  )}
                </div>

                <div className={ui.stepBox}>
                  <StepHeading
                    number={4}
                    title="¿Para qué fue este gasto?"
                    hint="Elige si fue para toda la finca o para cultivos específicos."
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setCostApplication('GENERAL')}
                      className={`rounded-2xl border-2 p-4 text-left transition ${
                        costApplication === 'GENERAL'
                          ? 'border-[#2c6048] bg-[#e4f0e7] dark:bg-[#234634]'
                          : 'border-[#c7d8ca] bg-white hover:border-[#2c6048] dark:border-[#34453a] dark:bg-[#18211c]'
                      }`}
                    >
                      <p className="text-base font-bold">Para toda la finca</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Gasto general (agua, luz, transporte, mantenimiento, herramientas).
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCostApplication('CROP')}
                      className={`rounded-2xl border-2 p-4 text-left transition ${
                        costApplication === 'CROP'
                          ? 'border-[#2c6048] bg-[#e4f0e7] dark:bg-[#234634]'
                          : 'border-[#c7d8ca] bg-white hover:border-[#2c6048] dark:border-[#34453a] dark:bg-[#18211c]'
                      }`}
                    >
                      <p className="text-base font-bold">Solo para ciertos cultivos</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Insecticidas, fungicidas, herbicidas, abonos, semillas o jornales de uno o
                        varios cultivos.
                      </p>
                    </button>
                  </div>

                  {costApplication === 'CROP' && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {crops.map((crop) => {
                        const checked = costCropIds.includes(crop.id)
                        return (
                          <button
                            key={crop.id}
                            type="button"
                            onClick={() =>
                              setCostCropIds((prev) =>
                                checked ? prev.filter((id) => id !== crop.id) : [...prev, crop.id],
                              )
                            }
                            className={`inline-flex min-h-11 items-center gap-2 rounded-xl border-2 px-4 py-2 text-base font-semibold transition ${
                              checked
                                ? 'border-[#2c6048] bg-[#2c6048] text-white'
                                : 'border-[#c7d8ca] bg-white text-foreground hover:border-[#2c6048] dark:border-[#34453a] dark:bg-[#18211c]'
                            }`}
                          >
                            {checked && <Check className="size-4" />}
                            {crop.name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {(() => {
                  const activeReceiptPreview =
                    costReceiptAction === 'replace'
                      ? costReceiptDataUrl
                      : costReceiptAction === 'remove'
                        ? null
                        : editingRecord?.receiptImageUrl ?? null
                  const hasAttachedReceipt = Boolean(activeReceiptPreview)
                  return (
                    <div className="rounded-2xl border border-dashed border-[#b8ceb9] p-4 dark:border-[#34453a]">
                      <button
                        type="button"
                        aria-expanded={showOptional}
                        onClick={() => setShowOptional((v) => !v)}
                        className="flex w-full items-center justify-between gap-2 text-left text-base font-semibold text-[#24523b] dark:text-[#a8d5b3]"
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span>+ Agregar nota o foto de factura (opcional)</span>
                          {hasAttachedReceipt && (
                            <span className="rounded-full bg-[#e4f0e7] px-2.5 py-0.5 text-xs font-bold text-[#1f4834] dark:bg-[#234634] dark:text-[#d5f0dc]">
                              Foto adjunta
                            </span>
                          )}
                        </span>
                        <ChevronDown
                          className={`size-5 shrink-0 transition-transform ${showOptional ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {showOptional && (
                        <div className="mt-4 grid gap-4">
                          <div className="grid gap-1.5">
                            <span className="text-sm font-semibold">
                              Foto o imagen de la factura (opcional)
                            </span>
                            <ReceiptPhotoField
                              previewUrl={activeReceiptPreview}
                              fileName={
                                costReceiptAction === 'replace'
                                  ? costReceiptName
                                  : costReceiptAction === 'remove'
                                    ? null
                                    : editingRecord?.receiptImageName ?? null
                              }
                              onChange={(next) => {
                                if (next) {
                                  setCostReceiptAction('replace')
                                  setCostReceiptDataUrl(next.dataUrl)
                                  setCostReceiptName(next.name)
                                } else {
                                  setCostReceiptAction('remove')
                                  setCostReceiptDataUrl(null)
                                  setCostReceiptName(null)
                                }
                              }}
                              onError={(msg) => setNotice({ kind: 'error', text: msg })}
                            />
                          </div>
                          <label className="grid gap-1.5 text-sm font-semibold">
                            Nota o número de factura (opcional)
                            <textarea
                              rows={2}
                              maxLength={2000}
                              placeholder="Ej. factura #123 en almacén agrícola"
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                              className={ui.input}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </>
            )}

            {/* Botón principal de guardar */}
            <button
              type="submit"
              disabled={saving || (section === 'envios' && !shipmentValidation.canSubmit)}
              className={`${ui.btnPrimary} min-h-14 w-full text-lg`}
            >
              {saving && <Loader2 className="size-5 animate-spin" />}
              {sectionMeta.saveLabel}
            </button>
          </div>
        </form>
      )}

      {/* ─────────── PESTAÑA: VER HISTORIAL ─────────── */}
      {tab === 'history' && (
        <section className={ui.card}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{sectionMeta.historyLabel}</h2>
              <p className="text-sm text-muted-foreground">
                Página {historyPage} · {history?.rows.length ?? 0} registro(s)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowHistoryFilters((v) => !v)}
              className={ui.btnSmall}
            >
              <CalendarDays className="size-4" />
              {showHistoryFilters ? 'Ocultar fechas' : 'Filtrar por fecha'}
            </button>
          </div>

          <div className="mb-4 grid gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Buscar por cultivo, zona, código o descripción…"
                value={historySearch}
                onChange={(e) => {
                  setHistoryPage(1)
                  setHistorySearch(e.target.value)
                }}
                className={`${ui.input} pl-11`}
              />
            </div>

            {(section === 'cosechas' || section === 'mermas') && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setHistoryPage(1)
                    setHistoryCropId('')
                  }}
                  className={`min-h-10 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
                    historyCropId === ''
                      ? 'border-[#2c6048] bg-[#2c6048] text-white'
                      : 'border-[#c7d8ca] bg-white dark:border-[#34453a] dark:bg-[#141d18]'
                  }`}
                >
                  Todos
                </button>
                {crops.map((crop) => (
                  <button
                    key={crop.id}
                    type="button"
                    onClick={() => {
                      setHistoryPage(1)
                      setHistoryCropId(crop.id)
                    }}
                    className={`min-h-10 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
                      historyCropId === crop.id
                        ? 'border-[#2c6048] bg-[#2c6048] text-white'
                        : 'border-[#c7d8ca] bg-white dark:border-[#34453a] dark:bg-[#141d18]'
                    }`}
                  >
                    {crop.name}
                  </button>
                ))}
              </div>
            )}

            {showHistoryFilters && (
              <div className="grid gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium">
                  Desde
                  <input
                    type="date"
                    value={historyFrom}
                    onChange={(e) => {
                      setHistoryPage(1)
                      setHistoryFrom(e.target.value)
                    }}
                    className={ui.input}
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Hasta
                  <input
                    type="date"
                    value={historyTo}
                    min={historyFrom || undefined}
                    onChange={(e) => {
                      setHistoryPage(1)
                      setHistoryTo(e.target.value)
                    }}
                    className={ui.input}
                  />
                </label>
              </div>
            )}
          </div>

          {historyError && (
            <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
              {historyError.message}{' '}
              <button type="button" className="font-bold underline" onClick={() => void mutateHistory()}>
                Reintentar
              </button>
            </div>
          )}

          {historyLoading ? (
            <div className="grid gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          ) : !(history?.rows.length) ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border py-12 text-center">
              <Inbox className="size-8 text-muted-foreground" />
              <p className="text-base font-semibold">No hay registros para mostrar</p>
              <button type="button" onClick={() => setTab('register')} className={ui.btnPrimary}>
                Registrar el primero
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {history.rows.map((row) => {
                const isShipment = section === 'envios'
                const canModifyShipment =
                  isShipment &&
                  editableShipmentStatuses.includes(row.status ?? '') &&
                  (row.receptions?.length ?? 0) === 0
                const receipts =
                  row.receptions?.flatMap((r) =>
                    r.receiptNumber === undefined ? [] : [receiptCode(r.receiptNumber)],
                  ) ?? []

                return (
                  <article
                    key={row.id}
                    className="rounded-2xl border border-[#d5e3d7] bg-[#fafdfa] p-4 dark:border-[#2d3b32] dark:bg-[#141d18]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-lg font-bold">
                          {section === 'cosechas' &&
                            `${row.crop?.name ?? 'Cultivo'} — ${Number(row.quantity ?? 0).toFixed(2)} ${row.unit?.name ?? ''}`}
                          {section === 'mermas' &&
                            `${row.harvest?.crop?.name ?? 'Cultivo'} — -${Number(row.quantity ?? 0).toFixed(2)} ${row.harvest?.unit?.name ?? ''}`}
                          {section === 'envios' && (row.code || 'Envío')}
                          {section === 'costos' &&
                            `${row.description || 'Gasto'} — ${formatAmount(row.amountUsd)}`}
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {formatDate(row.date)}
                          {section === 'cosechas' &&
                            ` · ${row.productionArea?.name || 'Sin zona'}${row.variety?.name ? ` · ${row.variety.name}` : ''}`}
                          {section === 'mermas' &&
                            ` · ${row.reason?.name || 'Sin motivo'} · ${row.affectsHarvest ? 'Descuenta cosecha' : 'Solo anotación'}`}
                          {section === 'envios' &&
                            ` · ${shipmentStatusLabels[row.status ?? ''] ?? 'Registrado'}${receipts.length ? ` · ${receipts.join(', ')}` : ''}`}
                          {section === 'costos' &&
                            ` · ${row.category?.name || 'Sin categoría'} · ${row.allocations?.length ? row.allocations.map((a) => a.crop?.name).filter(Boolean).join(', ') : 'Toda la finca'}`}
                        </p>
                      </div>
                    </div>

                    {section === 'envios' && (row.items?.length ?? 0) > 0 && (
                      <ul className="mt-2.5 grid gap-1.5 text-sm">
                        {row.items?.map((item) => (
                          <li
                            key={item.id}
                            className="flex flex-wrap justify-between gap-2 rounded-lg bg-white px-3 py-1.5 dark:bg-[#18211c]"
                          >
                            <span>
                              {item.crop?.name}
                              {item.variety?.name ? ` (${item.variety.name})` : ''}
                            </span>
                            <strong>
                              {Number(item.quantity).toFixed(2)} {item.unit?.name}
                            </strong>
                          </li>
                        ))}
                      </ul>
                    )}

                    {row.notes && (
                      <p className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                        {row.notes}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-border/60 pt-3">
                      {section === 'mermas' && row.hasEvidenceImage && row.evidenceImageUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setViewingReceipt({
                              url: row.evidenceImageUrl!,
                              title: `${row.harvest?.crop?.name || 'Pérdida'} · ${formatDate(row.date)}`,
                              fileName: row.evidenceImageName,
                              heading: 'Foto del daño o pérdida',
                            })
                          }
                          className={ui.btnSmall}
                        >
                          <ImageIcon className="size-4" aria-hidden />
                          Ver foto
                        </button>
                      )}
                      {section === 'envios' && row.hasNoteImage && row.noteImageUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setViewingReceipt({
                              url: row.noteImageUrl!,
                              title: `${row.code || 'Envío'} · ${formatDate(row.date)}`,
                              fileName: row.noteImageName,
                              heading: 'Foto del envío para Agro Market',
                            })
                          }
                          className={ui.btnSmall}
                        >
                          <ImageIcon className="size-4" aria-hidden />
                          Ver foto
                        </button>
                      )}
                      {section === 'costos' && row.hasReceiptImage && row.receiptImageUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setViewingReceipt({
                              url: row.receiptImageUrl!,
                              title: `${row.description || 'Gasto'} · ${formatDate(row.date)}`,
                              fileName: row.receiptImageName,
                            })
                          }
                          className={ui.btnSmall}
                        >
                          <ImageIcon className="size-4" aria-hidden />
                          Ver factura
                        </button>
                      )}
                      {section === 'cosechas' && (
                        <button
                          type="button"
                          onClick={() => router.push(`/lodana?seccion=mermas&cosecha=${row.id}`)}
                          className={ui.btnSmall}
                        >
                          <TrendingDown className="size-4" />
                          Reportar daño
                        </button>
                      )}
                      {(!isShipment || canModifyShipment) && (
                        <button
                          type="button"
                          onClick={() => startEditRow(row)}
                          className={ui.btnSmall}
                        >
                          <Pencil className="size-4" />
                          Corregir
                        </button>
                      )}
                      {!isShipment && (
                        <button
                          type="button"
                          onClick={() => setRecordToDelete(row)}
                          className={`${ui.btnSmall} text-red-700 dark:text-red-300`}
                        >
                          <Trash2 className="size-4" />
                          Borrar
                        </button>
                      )}
                      {canModifyShipment && (
                        <button
                          type="button"
                          onClick={() => setShipmentToCancel(row)}
                          className={`${ui.btnSmall} text-red-700 dark:text-red-300`}
                        >
                          <Ban className="size-4" />
                          Cancelar envío
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          {(historyPage > 1 || history?.hasNext) && (
            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={historyPage <= 1 || historyLoading}
                onClick={() => setHistoryPage((p) => p - 1)}
                className={ui.btnOutline}
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={!history?.hasNext || historyLoading}
                onClick={() => setHistoryPage((p) => p + 1)}
                className={ui.btnOutline}
              >
                Siguiente
              </button>
            </div>
          )}
        </section>
      )}

      {/* Confirmación en lenguaje natural */}
      <NaturalConfirmModal
        open={confirmOpen}
        title={sectionMeta.confirmTitle}
        confirmLabel={sectionMeta.confirmBtn}
        busy={saving}
        onConfirm={() => void confirmSave()}
        onClose={() => setConfirmOpen(false)}
      >
        {section === 'cosechas' && (
          <p>
            Vas a guardar{' '}
            <strong>
              {quantity} {activeUnitName}
            </strong>{' '}
            de <strong>{selectedCrop?.name}</strong>
            {varietyId &&
              selectedCrop?.varieties?.find((v) => v.id === varietyId)?.name &&
              ` (${selectedCrop.varieties.find((v) => v.id === varietyId)?.name})`}
            {areaId &&
              selectedCrop?.productionAreas?.find((a) => a.id === areaId)?.name && (
                <>
                  {' '}
                  en <strong>{selectedCrop.productionAreas.find((a) => a.id === areaId)?.name}</strong>
                </>
              )}{' '}
            con fecha <strong>{readableDate(date)}</strong>
            {estimatedPrice ? ` (precio estimado ${formatAmount(estimatedPrice)})` : ''}.
          </p>
        )}

        {section === 'mermas' && (
          <p>
            Vas a reportar una pérdida de{' '}
            <strong>
              {lossQuantity} {selectedHarvest?.unit?.name ?? ''}
            </strong>{' '}
            de <strong>{selectedHarvest?.crop?.name}</strong> por motivo{' '}
            <strong>«{lossReason.trim()}»</strong> con fecha <strong>{readableDate(date)}</strong>.{' '}
            {affectsHarvest === 'true'
              ? 'Esta cantidad se descontará del producto disponible para enviar.'
              : 'Quedará anotada sin restar el producto disponible.'}
          </p>
        )}

        {section === 'envios' && (
          <div className="grid gap-3">
            <p>
              Vas a enviar <strong>{shipmentLines.length} producto(s)</strong> a{' '}
              <strong>Agro Market</strong> con fecha <strong>{readableDate(date)}</strong>:
            </p>
            <ul className="grid gap-1.5 rounded-xl bg-muted/40 p-3 text-sm">
              {shipmentLines.map((line) => (
                <li key={line.uid} className="flex justify-between gap-2">
                  <span>
                    {line.cropName}
                    {line.varietyName ? ` (${line.varietyName})` : ''}
                  </span>
                  <strong>
                    {Number(line.quantity).toFixed(2)} {line.unitName} ·{' '}
                    {formatAmount(shipmentSubtotal(line.quantity, line.unitPrice))}
                  </strong>
                </li>
              ))}
            </ul>
            <p className="text-right text-base font-bold text-emerald-800 dark:text-emerald-300">
              Total estimado: {formatAmount(shipmentValidation.total)}
            </p>
          </div>
        )}

        {section === 'costos' && (
          <p>
            Vas a guardar un gasto de <strong>{formatAmount(costAmount)}</strong> en{' '}
            <strong>{selectedCategoryName || 'la categoría elegida'}</strong> ({costDescription.trim()}
            ) con fecha <strong>{readableDate(date)}</strong>, aplicado a{' '}
            <strong>
              {costApplication === 'GENERAL'
                ? 'toda la finca'
                : costCropIds
                    .map((id) => crops.find((c) => c.id === id)?.name)
                    .filter(Boolean)
                    .join(', ')}
            </strong>
            {(costReceiptAction === 'replace' && costReceiptDataUrl) ||
            (costReceiptAction === 'keep' && editingRecord?.hasReceiptImage)
              ? ', con foto de factura adjunta'
              : ''}
            .
          </p>
        )}
      </NaturalConfirmModal>

      <ReceiptPhotoModal receipt={viewingReceipt} onClose={() => setViewingReceipt(null)} />

      {/* Confirmación de borrado (con tranquilidad de papelera) */}
      <NaturalConfirmModal
        open={recordToDelete !== null}
        title="¿Borrar este registro?"
        tone="danger"
        confirmLabel="Sí, borrar"
        cancelLabel="No, volver"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => setRecordToDelete(null)}
      >
        <p>
          El registro pasará a <strong>Borrados recientes</strong>. Si cambias de opinión, podrás
          recuperarlo durante los próximos 60 días.
        </p>
      </NaturalConfirmModal>

      {/* Confirmación de cancelar envío */}
      <NaturalConfirmModal
        open={shipmentToCancel !== null}
        title="¿Cancelar este envío?"
        tone="danger"
        confirmLabel="Sí, cancelar envío"
        cancelLabel="No, volver"
        busy={cancelling}
        onConfirm={() => void confirmCancelShipment()}
        onClose={() => setShipmentToCancel(null)}
      >
        <p>
          Se cancelará el envío <strong>{shipmentToCancel?.code}</strong> y el producto volverá a
          estar disponible para enviarlo después.
        </p>
      </NaturalConfirmModal>
    </div>
  )
}
