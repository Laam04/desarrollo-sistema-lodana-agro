export const farmSupplier = 'Finca Lodana'

export const sheetColumns = [
  'Fecha', 'N° Recibo / Lote', 'Productor / Proveedor', 'Producto',
  'Cantidad', 'Unidad', 'Precio Unitario ($)', 'Valor Total ($)',
]

const farmDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function marketDay(date = new Date()) {
  return farmDay.format(date)
}

export function isValidIsoDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const year = Number(day.slice(0, 4))
  if (year < 2000 || year > 2100) return false
  const parsed = new Date(day + 'T00:00:00Z')
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day
}

export function marketWeek(day: string) {
  const safeDay = isValidIsoDay(day) ? day : marketDay()
  const start = new Date(safeDay + 'T00:00:00Z')
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
}

export function markupPercent(price: string, base: string | null) {
  const sale = cents(price)
  const cost = base === null ? null : cents(base)
  if (sale === null || sale <= 0 || cost === null || cost <= 0) return null
  // Cálculo exacto a centésimas de porcentaje con redondeo half-up
  const diff = BigInt(sale - cost)
  const denom = BigInt(cost)
  const sign = diff < BigInt(0) ? BigInt(-1) : BigInt(1)
  const scaled = ((diff < BigInt(0) ? -diff : diff) * BigInt(10000) + denom / BigInt(2)) / denom
  return Number(sign * scaled) / 100
}

export function formatMarkup(value: number | null) {
  return value === null ? '—' : units(value) + '%'
}

export function receiptCode(number: number) {
  return 'REC-' + String(number).padStart(3, '0')
}

export type ShipmentProduct = {
  id: string
  crop: { name: string }
  variety: { name: string } | null
  productionArea: { name: string } | null
  unit: { name: string }
  quantity: string
  receivedQuantity: string
  pendingQuantity: string
  estimatedUnitPrice: string | null
  notes: string | null
}

export type MarketShipment = {
  id: string
  code: string
  date: string
  status: string
  notes: string | null
  items: ShipmentProduct[]
}

export type MarketReceipt = {
  id: string
  receiptNumber: number
  receivedAt: string
  notes: string | null
  items: { id: string; shipmentItemId: string; receivedQuantity: string; customerUnitPrice: string | null; notes: string | null }[]
}

export type MarketShipmentDetail = MarketShipment & { receptions: MarketReceipt[] }

export type StockRow = {
  id: string
  receiptNumber: number
  receivedAt: string
  shipmentCode: string
  crop: string
  variety: string | null
  area: string | null
  unit: string
  productionUnitPrice: string | null
  customerUnitPrice: string | null
  available: string
}

export type SaleRow = {
  id: string
  date: string
  updatedAt: string
  quantity: string
  unitPrice: string
  total: string
  product: Omit<StockRow, 'available'>
}

export type PageResult<T> = { rows: T[]; hasNext: boolean }

export type SalesDay = PageResult<SaleRow> & { totals: { total: string; count: number }; from: string; to: string }

export type MarketSalesSummary = {
  from: string
  to: string
  total: string
  profit: string | null
  count: number
  missingCost: number
  days: { date: string; total: string; count: number }[]
}

const ecAmount = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' })
const ecQuantity = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 })

export function usd(amount: string | number | null) {
  return amount === null ? '—' : ecAmount.format(Number(amount))
}

export function units(amount: string | number) {
  return ecQuantity.format(Number(amount))
}

export function decimalInput(value: string) {
  return value.trim().replace(',', '.')
}

export function cents(value: string) {
  const normalized = decimalInput(value)
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(normalized)) return null
  const [whole, frac = ''] = normalized.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}

export function salesValue(quantity: string, price: string) {
  const count = cents(quantity)
  const unitPrice = cents(price)
  if (count === null || unitPrice === null) return null
  const subtotal = (BigInt(count) * BigInt(unitPrice) + BigInt(50)) / BigInt(100)
  return subtotal < BigInt('100000000000000') ? Number(subtotal) / 100 : null
}
