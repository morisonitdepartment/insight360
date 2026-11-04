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
/**
 * Reports are built as documents, not photographed.
 *
 * The screenshot exporter that used to live here rendered the page with
 * html2canvas and sliced the bitmap across A4 pages: unsearchable text, tables
 * cut mid-row, and megabytes per report. See `src/utils/pdf.ts` and
 * `src/services/reportPdf.ts` for what replaced it.
 */
export function printPage(): void {
  window.print()
}
