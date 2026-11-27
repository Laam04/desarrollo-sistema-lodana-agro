const RECEIPT_DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/

export const MAX_RECEIPT_DATA_URL_LENGTH = 1_600_000

export type ParsedReceiptImage = {
  dataUrl: string
  mime: 'image/jpeg' | 'image/png' | 'image/webp'
  bytes: Buffer
}

function matchesImageSignature(mime: ParsedReceiptImage['mime'], bytes: Buffer): boolean {
  if (bytes.length < 12) return false
  if (mime === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (mime === 'image/png') {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    )
  }
  return (
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  )
}

export function parseReceiptImageDataUrl(input: unknown): ParsedReceiptImage | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > MAX_RECEIPT_DATA_URL_LENGTH) return null
  const match = RECEIPT_DATA_URL_RE.exec(trimmed)
  if (!match) return null
  const mime = match[1] as ParsedReceiptImage['mime']
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.length || !matchesImageSignature(mime, bytes)) return null
  return { dataUrl: trimmed, mime, bytes }
}

export function cleanReceiptImageName(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const clean = input
    .replace(/[\r\n\t\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return clean || null
}

export function defaultReceiptFileName(mime: ParsedReceiptImage['mime']): string {
  if (mime === 'image/png') return 'factura.png'
  if (mime === 'image/webp') return 'factura.webp'
  return 'factura.jpg'
}
