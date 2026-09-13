import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import { EmptyState } from './States'

export interface Column<T> {
  key: string
  header: ReactNode
  render?: (row: T) => ReactNode
  /** Value used for sorting (defaults to row[key]) */
  sortValue?: (row: T) => string | number | null | undefined
  sortable?: boolean
  className?: string
  headerClassName?: string
  width?: string
  align?: 'left' | 'right' | 'center'
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  emptyTitle?: string
  emptyMessage?: string
  pageSize?: number
  dense?: boolean
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  rowClassName?: (row: T) => string | undefined
  selectedKey?: string | null
  stickyHeader?: boolean
  caption?: string
  footer?: ReactNode
  maxHeight?: string
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, emptyTitle = 'No records', emptyMessage = 'Try adjusting the filters.', pageSize = 15, dense = false, initialSort, rowClassName, selectedKey, stickyHeader = true, caption, footer, maxHeight }: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null)
  const [page, setPage] = useState(1)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    const getter = col.sortValue ?? ((r: T) => (r as Record<string, unknown>)[col.key] as string | number | null | undefined)
    return [...rows].sort((a, b) => {
      const va = getter(a)
      const vb = getter(b)
      if (va === vb) return 0
      if (va === null || va === undefined) return 1
      if (vb === null || vb === undefined) return -1
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort, columns])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pageRows = pageSize > 0 ? sorted.slice((safePage - 1) * pageSize, safePage * pageSize) : sorted

  const toggleSort = (key: string) => {
    setSort((s) => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }))
    setPage(1)
  }

  if (!rows.length) return <EmptyState title={emptyTitle} message={emptyMessage} />

  return (
    <div className="flex flex-col">
      <div className="table-wrap" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
        <table className="table">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
            <tr>
              {columns.map((c) => {
                const sortable = c.sortable !== false
                const active = sort?.key === c.key
                return (
                  <th key={c.key} scope="col" style={c.width ? { width: c.width } : undefined} className={cn(c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.headerClassName)} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {sortable ? (
                      <button type="button" onClick={() => toggleSort(c.key)} className={cn('inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-white', c.align === 'right' && 'flex-row-reverse')}>
                        {c.header}
                        {active ? sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden /> : <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const k = rowKey(row)
              const clickable = !!onRowClick
              return (
                <tr
                  key={k}
                  onClick={clickable ? () => onRowClick(row) : undefined}
                  onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row) } } : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  className={cn(clickable && 'cursor-pointer focus-visible:bg-teal-50 dark:focus-visible:bg-navy-800', selectedKey === k && 'bg-teal-50/70 dark:bg-teal-500/10', rowClassName?.(row))}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn(dense && '!py-2', c.align === 'right' && 'text-right tabular-nums', c.align === 'center' && 'text-center', c.className)}>
                      {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {footer}
      {pageSize > 0 && sorted.length > pageSize && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 dark:border-navy-800 px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
          <span>
            Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 tabular-nums">
              Page {safePage} / {pageCount}
            </span>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount} aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
