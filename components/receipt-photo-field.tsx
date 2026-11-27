'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, ExternalLink, ImagePlus, Loader2, Trash2, X } from 'lucide-react'

const MAX_RAW_FILE_BYTES = 12 * 1024 * 1024
const MAX_DIMENSION = 1400
const MAX_ENCODED_CHARS = 1_450_000

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'))
      img.src = objectUrl
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export async function prepareReceiptImageFile(
  file: File,
): Promise<{ dataUrl: string; name: string }> {
  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('Selecciona un archivo de imagen válido (JPG, PNG o WebP).')
  }
  if (file.type === 'image/svg+xml') {
    throw new Error('Usa una foto o imagen JPG, PNG o WebP.')
  }
  if (file.size > MAX_RAW_FILE_BYTES) {
    throw new Error('La imagen es demasiado grande (máximo 12 MB).')
  }

  const img = await loadImageElement(file)
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  if (!srcW || !srcH) {
    throw new Error('La imagen seleccionada está vacía o dañada.')
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(srcW, srcH))
  const width = Math.max(1, Math.round(srcW * scale))
  const height = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Tu navegador no pudo procesar la imagen.')
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)

  let dataUrl = canvas.toDataURL('image/jpeg', 0.8)
  if (dataUrl.length > MAX_ENCODED_CHARS) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.62)
  }
  if (dataUrl.length > MAX_ENCODED_CHARS) {
    throw new Error('La foto sigue siendo muy pesada. Prueba con una imagen más pequeña.')
  }

  const baseName = file.name.replace(/\.[^.]+$/, '').trim() || 'factura'
  return {
    dataUrl,
    name: `${baseName.slice(0, 100)}.jpg`,
  }
}

export function ReceiptPhotoField({
  previewUrl,
  fileName,
  onChange,
  onError,
  compact = false,
  helperText = 'Opcional: toma una foto con tu teléfono o sube una imagen de la factura o comprobante.',
}: {
  previewUrl: string | null
  fileName: string | null
  onChange: (next: { dataUrl: string; name: string } | null) => void
  onError?: (message: string) => void
  compact?: boolean
  helperText?: string
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)
  const [localError, setLocalError] = useState('')

  async function handleFileChange(file: File | undefined) {
    if (!file) return
    setLocalError('')
    setProcessing(true)
    try {
      const prepared = await prepareReceiptImageFile(file)
      onChange(prepared)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo cargar la imagen.'
      setLocalError(msg)
      onError?.(msg)
    } finally {
      setProcessing(false)
      if (cameraInputRef.current) cameraInputRef.current.value = ''
      if (galleryInputRef.current) galleryInputRef.current.value = ''
    }
  }

  const btnCls = compact
    ? 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3.5 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50'
    : 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-[#c7d8ca] bg-white px-4 py-2.5 text-base font-semibold text-foreground transition hover:border-[#2c6048] hover:bg-[#eef5ef] disabled:opacity-50 dark:border-[#34453a] dark:bg-[#18211c]'

  return (
    <div className="grid gap-2.5">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Tomar foto de la factura"
        className="sr-only"
        onChange={(e) => void handleFileChange(e.target.files?.[0])}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        aria-label="Subir imagen de la factura"
        className="sr-only"
        onChange={(e) => void handleFileChange(e.target.files?.[0])}
      />

      {!previewUrl ? (
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={processing}
              onClick={() => cameraInputRef.current?.click()}
              className={btnCls}
            >
              {processing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Camera className="size-4 shrink-0 text-[#2c6048] dark:text-[#a8d5b3]" aria-hidden />
              )}
              Tomar foto
            </button>
            <button
              type="button"
              disabled={processing}
              onClick={() => galleryInputRef.current?.click()}
              className={btnCls}
            >
              <ImagePlus className="size-4 shrink-0 text-[#2c6048] dark:text-[#a8d5b3]" aria-hidden />
              Subir imagen
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {helperText}
          </p>
        </div>
      ) : (
        <div className="grid gap-2.5 rounded-xl border border-[#c7d8ca] bg-white p-3 dark:border-[#34453a] dark:bg-[#141d18]">
          <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={fileName ? `Vista previa de ${fileName}` : 'Vista previa de factura'}
              className="mx-auto max-h-56 w-full object-contain"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="truncate text-xs font-medium text-muted-foreground">
              {fileName || 'Foto de factura adjunta'}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={processing}
                onClick={() => galleryInputRef.current?.click()}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#c7d8ca] bg-background px-3 py-1.5 text-xs font-semibold transition hover:bg-muted dark:border-[#34453a]"
              >
                <ImagePlus className="size-3.5" aria-hidden />
                Cambiar
              </button>
              <button
                type="button"
                disabled={processing}
                onClick={() => onChange(null)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
              >
                <Trash2 className="size-3.5" aria-hidden />
                Quitar
              </button>
            </div>
          </div>
        </div>
      )}

      {localError && (
        <p role="alert" className="text-xs font-medium text-red-700 dark:text-red-300">
          {localError}
        </p>
      )}
    </div>
  )
}

export function ReceiptPhotoModal({
  receipt,
  onClose,
}: {
  receipt: { url: string; title: string; fileName?: string | null; heading?: string } | null
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!receipt || !dialog) return
    dialog.showModal()
    return () => dialog.close()
  }, [receipt])

  if (!receipt) return null

  return (
    <dialog
      ref={dialogRef}
      aria-label={`Factura de ${receipt.title}`}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="m-auto w-[calc(100%-1.5rem)] max-w-2xl bg-transparent p-0 text-foreground backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold">{receipt.heading || 'Foto de factura'}</h3>
            <p className="truncate text-xs text-muted-foreground">{receipt.title}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <a
              href={receipt.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              Abrir
            </a>
            <button
              type="button"
              aria-label="Cerrar vista de factura"
              onClick={onClose}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
        <div className="max-h-[75vh] overflow-auto bg-muted/30 p-3 sm:p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={receipt.url}
            alt={`Factura de ${receipt.title}`}
            className="mx-auto max-h-[68vh] w-auto rounded-lg object-contain"
          />
        </div>
      </div>
    </dialog>
  )
}
