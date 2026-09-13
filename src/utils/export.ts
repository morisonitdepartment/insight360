/**
 * Export helpers — CSV (native), Excel (xlsx, lazy-loaded) and PDF (jspdf + html2canvas, lazy-loaded).
 */

export type ExportRow = Record<string, string | number | boolean | null | undefined>

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(rows: ExportRow[], columns?: string[]): string {
  if (!rows.length) return ''
  const cols = columns ?? Object.keys(rows[0])
  const header = cols.map(escapeCsv).join(',')
  const body = rows.map((r) => cols.map((c) => escapeCsv(r[c])).join(',')).join('\r\n')
  return `﻿${header}\r\n${body}`
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function exportCsv(rows: ExportRow[], filename: string, columns?: string[]): void {
  const csv = toCsv(rows, columns)
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename.endsWith('.csv') ? filename : `${filename}.csv`)
}

export async function exportExcel(sheets: { name: string; rows: ExportRow[] }[], filename: string): Promise<void> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  sheets.forEach((s) => {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ Note: 'No data' }])
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  })
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  downloadBlob(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`,
  )
}

export function exportJson(data: unknown, filename: string): void {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename.endsWith('.json') ? filename : `${filename}.json`)
}

/**
 * Renders a DOM element to a multi-page A4 PDF. Uses html2canvas + jsPDF loaded on demand so
 * they never affect initial bundle size.
 */
export async function exportElementToPdf(element: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  const isDark = document.documentElement.classList.contains('dark')
  if (isDark) document.documentElement.classList.remove('dark')
  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: Math.max(element.scrollWidth, 900),
    })
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 8
    const imgWidth = pageWidth - margin * 2
    const pxPerMm = canvas.width / imgWidth
    const pageHeightPx = Math.floor((pageHeight - margin * 2) * pxPerMm)

    let offset = 0
    let first = true
    while (offset < canvas.height) {
      const sliceHeight = Math.min(pageHeightPx, canvas.height - offset)
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = sliceHeight
      const ctx = slice.getContext('2d')
      if (!ctx) break
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, slice.width, slice.height)
      ctx.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
      if (!first) pdf.addPage()
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgWidth, sliceHeight / pxPerMm)
      first = false
      offset += sliceHeight
    }
    pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
  } finally {
    if (isDark) document.documentElement.classList.add('dark')
  }
}

export function printPage(): void {
  window.print()
}
