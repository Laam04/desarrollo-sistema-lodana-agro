export const farmSupplier = 'Finca Lodana'

export const paymentLabels = { CASH: 'Efectivo', TRANSFER: 'Transferencia' } as const
export type Payment = keyof typeof paymentLabels

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
  items: { id: string; shipmentItemId: string; receivedQuantity: string; notes: string | null }[]
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
  available: string
}

export type SaleRow = {
  id: string
  date: string
  updatedAt: string
  payment: Payment
  quantity: string
  unitPrice: string
  total: string
  product: Omit<StockRow, 'available'>
}

export type PageResult<T> = { rows: T[]; hasNext: boolean }

export type SalesDay = PageResult<SaleRow> & { totals: Record<Payment, string> & { total: string } }

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
  return Math.round(Number(normalized) * 100)
}

export function salesValue(quantity: string, price: string) {
  const count = cents(quantity)
  const unitPrice = cents(price)
  if (count === null || unitPrice === null) return null
  const subtotal = (BigInt(count) * BigInt(unitPrice) + BigInt(50)) / BigInt(100)
  return subtotal < BigInt('100000000000000') ? Number(subtotal) / 100 : null
}
