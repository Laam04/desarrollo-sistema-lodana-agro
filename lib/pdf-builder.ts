/**
 * Generador PDF 1.4 vectorial sin dependencias externas para reportes institucionales
 * de Lodana Agro (ULEAM). Soporta codificación WinAnsi (español completo), paginación
 * automática, encabezados repetidos en tablas, tarjetas KPI y gráficos vectoriales.
 */
import type { ReportPayload } from '@/lib/report-generator'

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN_X = 42
const CONTENT_W = PAGE_W - MARGIN_X * 2
const TOP_Y = PAGE_H - 46
const BOTTOM_Y = 52

type Rgb = [number, number, number]

const COLORS = {
  brand: [0.173, 0.376, 0.282] as Rgb,       // #2c6048
  brandDark: [0.125, 0.259, 0.196] as Rgb,   // #204232
  brandSoft: [0.945, 0.973, 0.953] as Rgb,   // #f1f8f3
  border: [0.82, 0.88, 0.84] as Rgb,         // #d1e0d6
  rowAlt: [0.968, 0.984, 0.972] as Rgb,      // #f7fbf8
  text: [0.12, 0.18, 0.16] as Rgb,           // #1f2e29
  muted: [0.40, 0.47, 0.44] as Rgb,          // #667870
  white: [1, 1, 1] as Rgb,
  amberBg: [0.996, 0.965, 0.914] as Rgb,
  amberBorder: [0.91, 0.76, 0.52] as Rgb,
  series: {
    green: [0.086, 0.506, 0.365] as Rgb,
    blue: [0.212, 0.522, 0.722] as Rgb,
    amber: [0.702, 0.392, 0.129] as Rgb,
    purple: [0.569, 0.408, 0.737] as Rgb,
    gray: [0.451, 0.502, 0.580] as Rgb,
  },
}

const WINANSI_SPECIAL: Record<number, number> = {
  0x20ac: 0x80, // €
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85, // …
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91, // ‘
  0x2019: 0x92, // ’
  0x201c: 0x93, // “
  0x201d: 0x94, // ”
  0x2022: 0x95, // •
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
}

function encodePdfText(input: string): string {
  const clean = input.replace(/\r?\n/g, ' ').replace(/\t/g, ' ')
  let out = ''
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i)
    let byte = 0x3f // '?'
    if (code >= 0x20 && code <= 0x7e) {
      byte = code
    } else if (code >= 0xa0 && code <= 0xff) {
      byte = code
    } else if (WINANSI_SPECIAL[code] !== undefined) {
      byte = WINANSI_SPECIAL[code]
    }
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) {
      out += '\\' + String.fromCharCode(byte)
    } else if (byte < 0x20 || byte > 0x7e) {
      out += '\\' + byte.toString(8).padStart(3, '0')
    } else {
      out += String.fromCharCode(byte)
    }
  }
  return out
}

function charWidthFactor(ch: string, bold: boolean): number {
  const factor = bold ? 1.04 : 1.0
  if ('ilI.,;:\'"|!¡'.includes(ch)) return 0.28 * factor
  if ('fjrt()[]/\\-–'.includes(ch)) return 0.35 * factor
  if ('mwMW@%—'.includes(ch)) return 0.85 * factor
  if (ch >= 'A' && ch <= 'Z') return 0.68 * factor
  if (ch >= '0' && ch <= '9') return 0.56 * factor
  if (ch === ' ') return 0.28 * factor
  return 0.54 * factor
}

function measureText(text: string, size: number, bold = false): number {
  let width = 0
  for (let i = 0; i < text.length; i++) {
    width += charWidthFactor(text[i], bold) * size
  }
  return width
}

function wrapText(text: string, maxWidth: number, size: number, bold = false): string[] {
  const normalized = text.trim().replace(/\s+/g, ' ')
  if (!normalized) return ['']
  const words = normalized.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (measureText(candidate, size, bold) <= maxWidth) {
      current = candidate
    } else {
      if (current) lines.push(current)
      if (measureText(word, size, bold) <= maxWidth) {
        current = word
      } else {
        // Cortar palabra muy larga de forma segura
        let chunk = ''
        for (const ch of word) {
          if (measureText(chunk + ch, size, bold) > maxWidth && chunk) {
            lines.push(chunk)
            chunk = ch
          } else {
            chunk += ch
          }
        }
        current = chunk
      }
    }
  }
  if (current) lines.push(current)
  return lines
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}

export class InstitutionalPdfBuilder {
  private pages: string[][] = []
  private y = TOP_Y
  private runningHeader: { left: string; right: string }
  private footerLeft: string

  constructor(options: { runningLeft: string; runningRight: string; footerLeft: string }) {
    this.runningHeader = { left: options.runningLeft, right: options.runningRight }
    this.footerLeft = options.footerLeft
    this.startNewPage(true)
  }

  private current(): string[] {
    return this.pages[this.pages.length - 1]
  }

  private startNewPage(isFirst = false) {
    const cmds: string[] = []
    this.pages.push(cmds)
    this.y = TOP_Y

    if (!isFirst) {
      this.drawRect(MARGIN_X, TOP_Y - 16, CONTENT_W, 18, COLORS.brandSoft)
      this.drawText(this.runningHeader.left, MARGIN_X + 6, TOP_Y - 11, 8, true, COLORS.brandDark)
      const rightW = measureText(this.runningHeader.right, 8, false)
      this.drawText(this.runningHeader.right, MARGIN_X + CONTENT_W - rightW - 6, TOP_Y - 11, 8, false, COLORS.muted)
      this.y = TOP_Y - 30
    }
  }

  private ensureSpace(needed: number) {
    if (this.y - needed < BOTTOM_Y) {
      this.startNewPage(false)
    }
  }

  private setFill(c: Rgb) {
    this.current().push(`${fmt(c[0])} ${fmt(c[1])} ${fmt(c[2])} rg`)
  }

  private setStroke(c: Rgb) {
    this.current().push(`${fmt(c[0])} ${fmt(c[1])} ${fmt(c[2])} RG`)
  }

  private drawRect(x: number, y: number, w: number, h: number, fill?: Rgb, stroke?: Rgb, lineWidth = 0.6) {
    if (fill) this.setFill(fill)
    if (stroke) {
      this.setStroke(stroke)
      this.current().push(`${fmt(lineWidth)} w`)
    }
    const op = fill && stroke ? 'B' : fill ? 'f' : 'S'
    this.current().push(`${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)} re ${op}`)
  }

  private drawLine(x1: number, y1: number, x2: number, y2: number, color: Rgb, width = 0.6) {
    this.setStroke(color)
    this.current().push(`${fmt(width)} w ${fmt(x1)} ${fmt(y1)} m ${fmt(x2)} ${fmt(y2)} l S`)
  }

  private drawText(text: string, x: number, y: number, size: number, bold: boolean, color: Rgb) {
    const font = bold ? 'F2' : 'F1'
    this.setFill(color)
    this.current().push(`BT /${font} ${fmt(size)} Tf 1 0 0 1 ${fmt(x)} ${fmt(y)} Tm (${encodePdfText(text)}) Tj ET`)
  }

  addInstitutionalHeader(meta: {
    organization: string
    university: string
    scope: string
    title: string
    periodLabel: string
    generatedAt: string
    triggerLabel: string
    filtersLabel: string
  }) {
    const titleLines = wrapText(meta.title, CONTENT_W - 24, 15, true)
    const bannerH = 54 + titleLines.length * 18
    this.drawRect(MARGIN_X, this.y - bannerH, CONTENT_W, bannerH, COLORS.brand)
    this.drawText(meta.university.toUpperCase(), MARGIN_X + 12, this.y - 16, 8, true, [0.82, 0.93, 0.86])
    this.drawText(`${meta.organization}  ·  ${meta.scope}`, MARGIN_X + 12, this.y - 29, 9.5, false, COLORS.white)

    let ty = this.y - 48
    for (const line of titleLines) {
      this.drawText(line, MARGIN_X + 12, ty, 14.5, true, COLORS.white)
      ty -= 18
    }
    this.y -= bannerH + 8

    // Caja de metadatos del informe
    const filterLines = wrapText(`Filtros: ${meta.filtersLabel}`, CONTENT_W - 20, 8.5, false)
    const metaH = 34 + filterLines.length * 11
    this.drawRect(MARGIN_X, this.y - metaH, CONTENT_W, metaH, COLORS.brandSoft, COLORS.border, 0.6)
    this.drawText(`Período analizado: ${meta.periodLabel}`, MARGIN_X + 10, this.y - 14, 9, true, COLORS.brandDark)
    this.drawText(`Generado: ${meta.generatedAt}   ·   Origen: ${meta.triggerLabel}`, MARGIN_X + 10, this.y - 26, 8.5, false, COLORS.muted)
    let fy = this.y - 38
    for (const line of filterLines) {
      this.drawText(line, MARGIN_X + 10, fy, 8.5, false, COLORS.text)
      fy -= 11
    }
    this.y -= metaH + 14
  }

  addSectionTitle(title: string, subtitle?: string) {
    const subLines = subtitle ? wrapText(subtitle, CONTENT_W, 8.5, false) : []
    this.ensureSpace(26 + subLines.length * 11)
    this.drawRect(MARGIN_X, this.y - 12, 3.5, 13, COLORS.brand)
    this.drawText(title, MARGIN_X + 9, this.y - 10, 11.5, true, COLORS.brandDark)
    this.y -= 17
    for (const line of subLines) {
      this.drawText(line, MARGIN_X + 9, this.y - 7, 8.5, false, COLORS.muted)
      this.y -= 11
    }
    this.y -= 4
  }

  addKpiGrid(kpis: { label: string; value: string; detail?: string }[]) {
    if (kpis.length === 0) return
    const cols = Math.min(4, Math.max(2, kpis.length))
    const gap = 8
    const cardW = (CONTENT_W - gap * (cols - 1)) / cols
    const cardH = 54

    for (let i = 0; i < kpis.length; i += cols) {
      this.ensureSpace(cardH + 10)
      const slice = kpis.slice(i, i + cols)
      slice.forEach((kpi, idx) => {
        const x = MARGIN_X + idx * (cardW + gap)
        this.drawRect(x, this.y - cardH, cardW, cardH, COLORS.white, COLORS.border, 0.7)
        this.drawRect(x, this.y - 3, cardW, 3, COLORS.brand)
        const labelLines = wrapText(kpi.label, cardW - 14, 7.5, true).slice(0, 2)
        this.drawText(labelLines[0], x + 7, this.y - 14, 7.5, true, COLORS.muted)
        const valText = wrapText(kpi.value, cardW - 14, 11.5, true)[0] ?? kpi.value
        this.drawText(valText, x + 7, this.y - 31, 11.5, true, COLORS.brandDark)
        if (kpi.detail) {
          const det = wrapText(kpi.detail, cardW - 14, 7, false)[0] ?? ''
          this.drawText(det, x + 7, this.y - 44, 7, false, COLORS.muted)
        }
      })
      this.y -= cardH + 10
    }
    this.y -= 4
  }

  addChart(chart: {
    title: string
    unit: string
    kind: 'line' | 'bar'
    labels: string[]
    series: { label: string; color: keyof typeof COLORS.series; values: (number | null)[] }[]
  }) {
    const chartH = 165
    this.ensureSpace(chartH + 28)
    this.addSectionTitle(`${chart.title}`, `Unidad: ${chart.unit}`)

    const boxX = MARGIN_X
    const boxY = this.y - chartH
    this.drawRect(boxX, boxY, CONTENT_W, chartH, COLORS.white, COLORS.border, 0.6)

    // Leyenda superior
    let lx = boxX + 10
    const ly = this.y - 14
    for (const s of chart.series) {
      const col = COLORS.series[s.color] ?? COLORS.brand
      this.drawRect(lx, ly - 1, 8, 6, col)
      this.drawText(s.label, lx + 11, ly - 1, 7.5, false, COLORS.text)
      lx += measureText(s.label, 7.5, false) + 24
    }

    const plotLeft = boxX + 48
    const plotRight = boxX + CONTENT_W - 14
    const plotTop = this.y - 28
    const plotBottom = boxY + 26
    const plotW = plotRight - plotLeft
    const plotH = plotTop - plotBottom

    const allVals = chart.series.flatMap((s) => s.values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)))
    const maxVal = Math.max(1, ...allVals)
    const ticks = 4

    for (let t = 0; t <= ticks; t++) {
      const ratio = t / ticks
      const gy = plotBottom + plotH * ratio
      this.drawLine(plotLeft, gy, plotRight, gy, [0.9, 0.93, 0.91], 0.5)
      const valLabel = new Intl.NumberFormat('es-EC', { notation: 'compact', maximumFractionDigits: 1 }).format(maxVal * ratio)
      const w = measureText(valLabel, 7, false)
      this.drawText(valLabel, plotLeft - w - 5, gy - 2.5, 7, false, COLORS.muted)
    }

    const count = chart.labels.length
    if (count > 0) {
      if (chart.kind === 'bar' || count <= 2) {
        const groupW = plotW / count
        const sCount = Math.max(1, chart.series.length)
        const barW = Math.min(22, (groupW * 0.72) / sCount)
        const totalBarsW = barW * sCount + (sCount - 1) * 2
        chart.labels.forEach((label, idx) => {
          const groupStart = plotLeft + idx * groupW + (groupW - totalBarsW) / 2
          chart.series.forEach((s, si) => {
            const v = s.values[idx]
            if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return
            const bh = (v / maxVal) * plotH
            const col = COLORS.series[s.color] ?? COLORS.brand
            this.drawRect(groupStart + si * (barW + 2), plotBottom, barW, bh, col)
          })
          const lbl = label.length > 12 ? label.slice(0, 12) : label
          const lw = measureText(lbl, 7, false)
          this.drawText(lbl, plotLeft + idx * groupW + (groupW - lw) / 2, boxY + 12, 7, false, COLORS.muted)
        })
      } else {
        const stepX = plotW / (count - 1)
        const labelEvery = Math.max(1, Math.ceil(count / 8))
        chart.series.forEach((s) => {
          const col = COLORS.series[s.color] ?? COLORS.brand
          this.setStroke(col)
          this.current().push('1.4 w')
          let started = false
          s.values.forEach((v, idx) => {
            if (typeof v !== 'number' || !Number.isFinite(v)) {
              started = false
              return
            }
            const px = plotLeft + idx * stepX
            const py = plotBottom + (v / maxVal) * plotH
            this.current().push(`${fmt(px)} ${fmt(py)} ${started ? 'l' : 'm'}`)
            started = true
          })
          if (started) this.current().push('S')
        })
        chart.labels.forEach((label, idx) => {
          if (idx % labelEvery !== 0 && idx !== count - 1) return
          const lbl = label.length > 10 ? label.slice(0, 10) : label
          const lw = measureText(lbl, 7, false)
          const px = Math.min(plotRight - lw, Math.max(plotLeft, plotLeft + idx * stepX - lw / 2))
          this.drawText(lbl, px, boxY + 12, 7, false, COLORS.muted)
        })
      }
    }

    this.y = boxY - 12
  }

  addTable(table: {
    title: string
    subtitle?: string
    columns: { key: string; label: string; align?: 'left' | 'right' }[]
    rows: Record<string, string | number | null>[]
    emptyMessage?: string
  }) {
    this.addSectionTitle(table.title, table.subtitle)

    if (table.rows.length === 0) {
      this.ensureSpace(26)
      this.drawRect(MARGIN_X, this.y - 22, CONTENT_W, 22, COLORS.rowAlt, COLORS.border, 0.5)
      this.drawText(table.emptyMessage ?? 'Sin registros en este período.', MARGIN_X + 8, this.y - 14, 8.5, false, COLORS.muted)
      this.y -= 30
      return
    }

    // Asignación proporcional de anchos de columna (primera columna más amplia para nombres/descripciones)
    const colCount = table.columns.length
    const weights = table.columns.map((c, idx) => {
      if (idx === 0) return colCount <= 3 ? 2.2 : 1.9
      if (c.align === 'right') return 1.0
      return 1.35
    })
    const weightSum = weights.reduce((s, w) => s + w, 0)
    const colWidths = weights.map((w) => (CONTENT_W * w) / weightSum)
    const colXs: number[] = []
    let accX = MARGIN_X
    for (const w of colWidths) {
      colXs.push(accX)
      accX += w
    }

    const drawHeader = () => {
      const h = 20
      this.drawRect(MARGIN_X, this.y - h, CONTENT_W, h, COLORS.brand)
      table.columns.forEach((col, i) => {
        const text = wrapText(col.label, colWidths[i] - 8, 8, true)[0] ?? col.label
        const tw = measureText(text, 8, true)
        const tx = col.align === 'right' ? colXs[i] + colWidths[i] - tw - 5 : colXs[i] + 5
        this.drawText(text, tx, this.y - 13, 8, true, COLORS.white)
      })
      this.y -= h
    }

    this.ensureSpace(44)
    drawHeader()

    table.rows.forEach((row, rowIdx) => {
      const cellLines = table.columns.map((col, i) => {
        const raw = row[col.key]
        const text = raw === null || raw === undefined || raw === '' ? '—' : String(raw)
        return wrapText(text, colWidths[i] - 10, 8, false).slice(0, 3)
      })
      const maxLines = Math.max(1, ...cellLines.map((l) => l.length))
      const rowH = maxLines * 10 + 7

      if (this.y - rowH < BOTTOM_Y) {
        this.startNewPage(false)
        drawHeader()
      }

      const bg = rowIdx % 2 === 1 ? COLORS.rowAlt : COLORS.white
      this.drawRect(MARGIN_X, this.y - rowH, CONTENT_W, rowH, bg, COLORS.border, 0.35)

      table.columns.forEach((col, i) => {
        const lines = cellLines[i]
        lines.forEach((line, li) => {
          const tw = measureText(line, 8, false)
          const tx = col.align === 'right' ? colXs[i] + colWidths[i] - tw - 5 : colXs[i] + 5
          const ty = this.y - 11 - li * 10
          this.drawText(line, tx, ty, 8, false, COLORS.text)
        })
      })

      this.y -= rowH
    })

    this.y -= 12
  }

  addBulletBox(title: string, items: string[], variant: 'info' | 'warning' = 'info') {
    if (items.length === 0) return
    this.addSectionTitle(title)
    const fill = variant === 'warning' ? COLORS.amberBg : COLORS.brandSoft
    const border = variant === 'warning' ? COLORS.amberBorder : COLORS.border

    for (const item of items) {
      const lines = wrapText(`• ${item}`, CONTENT_W - 18, 8.5, false)
      const h = lines.length * 11 + 8
      this.ensureSpace(h + 4)
      this.drawRect(MARGIN_X, this.y - h, CONTENT_W, h, fill, border, 0.5)
      let ty = this.y - 12
      for (const line of lines) {
        this.drawText(line, MARGIN_X + 9, ty, 8.5, false, COLORS.text)
        ty -= 11
      }
      this.y -= h + 4
    }
    this.y -= 6
  }

  build(): Buffer {
    const totalPages = this.pages.length
    // Añadir pie de página y numeración a todas las páginas
    this.pages.forEach((cmds, index) => {
      const pageNum = index + 1
      const rightLabel = `Página ${pageNum} de ${totalPages}`
      const rw = measureText(rightLabel, 8, false)
      cmds.push(
        `${fmt(COLORS.border[0])} ${fmt(COLORS.border[1])} ${fmt(COLORS.border[2])} RG 0.5 w ${fmt(MARGIN_X)} 38 m ${fmt(MARGIN_X + CONTENT_W)} 38 l S`,
      )
      cmds.push(
        `${fmt(COLORS.muted[0])} ${fmt(COLORS.muted[1])} ${fmt(COLORS.muted[2])} rg BT /F1 8 Tf 1 0 0 1 ${fmt(MARGIN_X)} 25 Tm (${encodePdfText(this.footerLeft)}) Tj ET`,
      )
      cmds.push(
        `${fmt(COLORS.muted[0])} ${fmt(COLORS.muted[1])} ${fmt(COLORS.muted[2])} rg BT /F1 8 Tf 1 0 0 1 ${fmt(MARGIN_X + CONTENT_W - rw)} 25 Tm (${encodePdfText(rightLabel)}) Tj ET`,
      )
    })

    // Objetos PDF:
    // 1: Catalog, 2: Pages, 3: Helvetica, 4: Helvetica-Bold
    // Para cada página i: Page obj = 5 + i*2, Content obj = 6 + i*2
    const objects: string[] = []
    const pageObjectIds = this.pages.map((_, i) => 5 + i * 2)

    objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
    objects.push(
      `2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${totalPages} >>\nendobj\n`,
    )
    objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n')
    objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n')

    this.pages.forEach((cmds, i) => {
      const pageId = 5 + i * 2
      const contentId = 6 + i * 2
      const stream = cmds.join('\n')
      const streamLen = Buffer.byteLength(stream, 'latin1')
      objects.push(
        `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(PAGE_W)} ${fmt(PAGE_H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
      )
      objects.push(`${contentId} 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}\nendstream\nendobj\n`)
    })

    const header = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
    const chunks: string[] = [header]
    const offsets: number[] = [0]
    let cursor = Buffer.byteLength(header, 'latin1')

    for (const obj of objects) {
      offsets.push(cursor)
      chunks.push(obj)
      cursor += Buffer.byteLength(obj, 'latin1')
    }

    const xrefStart = cursor
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    for (let i = 1; i < offsets.length; i++) {
      xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
    }
    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
    chunks.push(xref, trailer)

    return Buffer.from(chunks.join(''), 'latin1')
  }
}

const ecDateTime = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const exportMonthNames = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function formatGeneratedAt(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : `${ecDateTime.format(d)} (Ecuador)`
}

function filtersSummary(payload: ReportPayload): string {
  const parts: string[] = []
  parts.push(payload.filters.cropName ? `Cultivo: ${payload.filters.cropName}` : 'Cultivo: Todos')
  parts.push(payload.filters.unitName ? `Unidad: ${payload.filters.unitName}` : 'Unidad: Todas (desagregadas)')
  return parts.join(' · ')
}

export function buildReportPdf(
  payload: ReportPayload,
  meta?: { trigger?: string; generatedAt?: string },
): Buffer {
  const triggerLabel = meta?.trigger === 'AUTOMATIC' ? 'Generación automática' : 'Generación manual'
  const generatedLabel = formatGeneratedAt(meta?.generatedAt ?? payload.generatedAt)
  const inst = payload.institution

  const pdf = new InstitutionalPdfBuilder({
    runningLeft: `${inst.organizationName} · ${payload.title}`,
    runningRight: payload.period.label,
    footerLeft: `${inst.organizationName} · ${inst.universityName}`,
  })

  pdf.addInstitutionalHeader({
    organization: inst.organizationName,
    university: inst.universityName,
    scope: payload.scope,
    title: payload.title,
    periodLabel: payload.period.label,
    generatedAt: generatedLabel,
    triggerLabel,
    filtersLabel: filtersSummary(payload),
  })

  pdf.addSectionTitle('Indicadores principales')
  pdf.addKpiGrid(payload.kpis)

  for (const chart of payload.charts) {
    pdf.addChart(chart)
  }

  for (const table of payload.tables) {
    pdf.addTable(table)
  }

  if (payload.seasonality && payload.seasonality.length > 0) {
    pdf.addTable({
      title: 'Comportamiento estacional (series con años calendario completos)',
      subtitle: 'Requiere al menos 2 años calendario completos con consistencia interanual.',
      columns: [
        { key: 'crop', label: 'Cultivo' },
        { key: 'unit', label: 'Unidad' },
        { key: 'years', label: 'Años completos', align: 'right' },
        { key: 'higher', label: 'Meses altos' },
        { key: 'lower', label: 'Meses bajos' },
      ],
      rows: payload.seasonality.map((s) => ({
        crop: s.crop,
        unit: s.unit,
        years: s.completeYears,
        higher: s.higherMonths.length ? s.higherMonths.map((m) => exportMonthNames[m - 1]).join(', ') : 'Sin patrón definido',
        lower: s.lowerMonths.length ? s.lowerMonths.map((m) => exportMonthNames[m - 1]).join(', ') : 'Sin patrón definido',
      })),
    })
  }

  if (payload.forecasts && payload.forecasts.length > 0) {
    const activeForecasts = payload.forecasts.filter((f) => f.estimates.length > 0)
    if (activeForecasts.length > 0) {
      const numFmt = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 })
      pdf.addTable({
        title: 'Previsiones de producción (6 meses)',
        subtitle: 'Emitidas únicamente cuando existen 24 meses calendario cerrados consecutivos por cultivo y unidad.',
        columns: [
          { key: 'crop', label: 'Cultivo (unidad)' },
          { key: 'month', label: 'Mes estimado' },
          { key: 'value', label: 'Estimación', align: 'right' },
          { key: 'range', label: 'Rango retrospectivo', align: 'right' },
        ],
        rows: activeForecasts.flatMap((f) =>
          f.estimates.map((e) => ({
            crop: `${f.crop} (${f.unit})`,
            month: e.month,
            value: `${numFmt.format(e.value)} ${f.unit}`,
            range: e.low !== null && e.high !== null
              ? `${numFmt.format(e.low)} – ${numFmt.format(e.high)}`
              : 'Sin rango (<6 pruebas)',
          })),
        ),
      })
    }
  }

  pdf.addBulletBox('Observaciones automáticas (análisis descriptivo)', payload.observations, 'info')
  pdf.addBulletBox('Limitaciones y alcance metodológico', payload.limitations, 'warning')

  return pdf.build()
}

function csvCell(value: string): string {
  const safe = !/^-?\d+(?:[.,]\d+)?%?$/.test(value) && /^[\s\uFEFF]*[=+\-@|]|^[\t\r\n]/.test(value)
    ? `'${value}`
    : value
  return `"${safe.replaceAll('"', '""')}"`
}

export function buildReportCsv(
  payload: ReportPayload,
  meta?: { trigger?: string; generatedAt?: string },
): string {
  const rows: string[][] = [
    ['Sistema', payload.institution.organizationName],
    ['Institución', payload.institution.universityName],
    ['Ámbito', payload.scope],
    ['Reporte', payload.title],
    ['Período', `${payload.period.label} (${payload.period.from} a ${payload.period.to})`],
    ['Origen', meta?.trigger === 'AUTOMATIC' ? 'Automático' : 'Manual'],
    ['Fecha de generación', formatGeneratedAt(meta?.generatedAt ?? payload.generatedAt)],
    ['Filtros', filtersSummary(payload)],
    [],
    ['INDICADORES PRINCIPALES'],
    ['Indicador', 'Valor', 'Detalle'],
    ...payload.kpis.map((k) => [k.label, k.value, k.detail ?? '']),
    [],
  ]

  for (const table of payload.tables) {
    rows.push([table.title.toUpperCase()])
    rows.push(table.columns.map((c) => c.label))
    if (table.rows.length === 0) {
      rows.push([table.emptyMessage ?? 'Sin registros'])
    } else {
      for (const r of table.rows) {
        rows.push(
          table.columns.map((c) => {
            const val = r[c.key]
            return val === null || val === undefined ? '' : String(val)
          }),
        )
      }
    }
    rows.push([])
  }

  rows.push(['OBSERVACIONES AUTOMÁTICAS'])
  for (const obs of payload.observations) rows.push([obs])
  rows.push([])
  rows.push(['LIMITACIONES METODOLÓGICAS'])
  for (const lim of payload.limitations) rows.push([lim])

  return '\uFEFF' + rows.map((line) => line.map(csvCell).join(';')).join('\r\n')
}

export function reportDownloadFilename(payload: ReportPayload, ext: 'pdf' | 'csv'): string {
  const slug = payload.type.toLowerCase().replaceAll('_', '-')
  return `lodana-${slug}-${payload.period.from}_${payload.period.to}.${ext}`
}
