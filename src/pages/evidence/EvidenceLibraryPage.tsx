import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Download, ExternalLink, Images, LayoutGrid, ListOrdered, Table2, UploadCloud, X } from 'lucide-react'
import type { CategoryKey, Evidence, EvidenceType, Question, Visit } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow, usePagination } from '@/hooks'
import { addEvidence, getVisitQuestions, logExport } from '@/services/actions'
import { CATEGORY_KEYS, CATEGORY_LABELS, CATEGORY_SHORT } from '@/utils/scoring'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge, type Tone } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { Field, Input, Select, SegmentedControl, Textarea } from '@/components/ui/Form'
import { EmptyState } from '@/components/ui/States'
import { EvidenceCard, EvidencePreviewModal, EvidenceVisual, evidenceIcon } from '@/components/ui/EvidenceThumb'
import { FilterBar, applyFilters, matchesSearch, type FilterDef } from '@/components/ui/FilterBar'
import { exportCsv, type ExportRow } from '@/utils/export'
import { fmtDate, fmtDateTime, truncate } from '@/utils/format'
import { cn } from '@/utils/cn'

// ───────────────────────────── Local helpers ─────────────────────────────

const EVIDENCE_TYPES: EvidenceType[] = ['Photo', 'Video', 'Receipt', 'Screenshot', 'Document']
const VISIT_TYPES: Visit['type'][] = ['Main Audit 1', 'Follow-up 1', 'Main Audit 2', 'Follow-up 2']
const UPLOAD_CLOSED_STATUSES: Visit['status'][] = ['Approved', 'Closed']
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf']
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const GALLERY_PAGE_SIZE = 24

type ViewMode = 'gallery' | 'timeline' | 'table'

const TYPE_TONE: Record<EvidenceType, Tone> = {
  Photo: 'teal',
  Video: 'violet',
  Receipt: 'amber',
  Screenshot: 'blue',
  Document: 'slate',
}

type EvidenceRow = Evidence & {
  outletName: string
  outletCode: string
  visitCode: string
  visitType: string
  questionText: string
  capturedDay: string
}

interface UploadDraft {
  visitId: string
  questionId: string
  category: CategoryKey
  type: EvidenceType
  title: string
  description: string
}

function TypeBadge({ type, size = 'sm' }: { type: EvidenceType; size?: 'xs' | 'sm' }) {
  return (
    <Badge tone={TYPE_TONE[type]} icon={evidenceIcon(type)} size={size}>
      {type}
    </Badge>
  )
}

/** Validate a selected file client-side before handing it to the repository. */
function validateFile(file: File | null): string | null {
  if (!file) return null
  if (!ALLOWED_MIME.includes(file.type)) return `Unsupported file type "${file.type || 'unknown'}". Allowed: JPEG, PNG, WebP, MP4 or PDF.`
  if (file.size > MAX_UPLOAD_BYTES) return `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 50 MB.`
  return null
}

function typeFromFile(file: File, current: EvidenceType): EvidenceType {
  if (file.type.startsWith('video/')) return 'Video'
  if (file.type === 'application/pdf') return current === 'Receipt' ? 'Receipt' : 'Document'
  if (file.type.startsWith('image/') && (current === 'Video' || current === 'Document')) return 'Photo'
  return current
}

// ───────────────────────────── Page ─────────────────────────────

export default function EvidenceLibraryPage() {
  useDocumentTitle('Evidence Library')
  const { can, role, user } = useAuth()
  const { data, dispatch, uploadEvidence, scopedOutletIds, scopedVisits } = useData()
  const now = useNow()
  const [searchParams, setSearchParams] = useSearchParams()

  const canUpload = can('evidence.upload')
  const visitParam = searchParams.get('visit')

  const [view, setView] = useState<ViewMode>('gallery')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    const outlet = searchParams.get('outlet')
    if (outlet) init.outlet = outlet
    return init
  })
  const [preview, setPreview] = useState<EvidenceRow | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // ── Lookups ──
  const outletById = useMemo(() => new Map(data.outlets.map((o) => [o.id, o])), [data.outlets])
  const visitById = useMemo(() => new Map(data.visits.map((v) => [v.id, v])), [data.visits])
  const questionById = useMemo(() => new Map(data.questions.map((q) => [q.id, q])), [data.questions])
  const sectionById = useMemo(() => new Map(data.sections.map((s) => [s.id, s])), [data.sections])
  const scopedVisitIds = useMemo(() => new Set(scopedVisits.map((v) => v.id)), [scopedVisits])

  const pinnedVisit = visitParam ? (visitById.get(visitParam) ?? null) : null

  // ── Scoped evidence (outlets for managers, own visits for shoppers) ──
  const scopedEvidence = useMemo<EvidenceRow[]>(
    () =>
      data.evidence
        .filter((e) => scopedOutletIds.has(e.outletId) && (role !== 'shopper' || scopedVisitIds.has(e.visitId)))
        .map((e) => {
          const outlet = outletById.get(e.outletId)
          const visit = visitById.get(e.visitId)
          const question = e.questionId ? questionById.get(e.questionId) : undefined
          return {
            ...e,
            outletName: outlet?.name ?? 'Unknown outlet',
            outletCode: outlet?.code ?? '',
            visitCode: visit?.code ?? '—',
            visitType: visit?.type ?? '',
            questionText: question?.text ?? '',
            capturedDay: e.capturedAt.slice(0, 10),
          }
        })
        .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)),
    [data.evidence, scopedOutletIds, scopedVisitIds, role, outletById, visitById, questionById],
  )

  const typeCounts = useMemo(() => {
    const counts: Record<EvidenceType, number> = { Photo: 0, Video: 0, Receipt: 0, Screenshot: 0, Document: 0 }
    scopedEvidence.forEach((e) => {
      counts[e.type] += 1
    })
    return counts
  }, [scopedEvidence])

  // ── Filters ──
  const filterDefs = useMemo<FilterDef[]>(() => {
    const outlets = [...new Map(scopedEvidence.map((e) => [e.outletId, e.outletName])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
    const uploaders = [...new Set(scopedEvidence.map((e) => e.uploadedBy))].sort((a, b) => a.localeCompare(b))
    return [
      { key: 'type', label: 'Type', options: EVIDENCE_TYPES.map((t) => ({ value: t, label: t })), allLabel: 'All types' },
      { key: 'outlet', label: 'Outlet', options: outlets.map(([id, name]) => ({ value: id, label: name })), allLabel: 'All outlets' },
      { key: 'category', label: 'Category', options: CATEGORY_KEYS.map((k) => ({ value: k, label: CATEGORY_LABELS[k] })), allLabel: 'All categories' },
      { key: 'visitType', label: 'Visit type', options: VISIT_TYPES.map((t) => ({ value: t, label: t })), allLabel: 'All visit types' },
      { key: 'uploadedBy', label: 'Uploaded by', options: uploaders.map((u) => ({ value: u, label: u })), allLabel: 'All uploaders' },
    ]
  }, [scopedEvidence])

  const rows = useMemo(() => {
    let list = scopedEvidence
    if (visitParam) list = list.filter((e) => e.visitId === visitParam)
    list = applyFilters(list, filters, {
      type: (e) => e.type,
      outlet: (e) => e.outletId,
      category: (e) => e.category,
      visitType: (e) => e.visitType,
      uploadedBy: (e) => e.uploadedBy,
    })
    const from = filters.from
    const to = filters.to
    if (from) list = list.filter((e) => e.capturedDay >= from)
    if (to) list = list.filter((e) => e.capturedDay <= to)
    return matchesSearch(list, search, (e) => [e.title, e.description, e.fileName, e.visitCode, e.outletName, e.id])
  }, [scopedEvidence, visitParam, filters, search])

  const setFilter = useCallback((k: string, v: string) => setFilters((f) => ({ ...f, [k]: v })), [])
  const resetFilters = useCallback(() => {
    setFilters({})
    setSearch('')
  }, [])

  const clearVisitParam = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('visit')
        return next
      },
      { replace: true },
    )
  }, [setSearchParams])

  // ── Gallery paging ──
  const gallery = usePagination(rows, GALLERY_PAGE_SIZE)

  // ── Timeline grouping (by captured date, desc) ──
  const timelineGroups = useMemo(() => {
    const map = new Map<string, EvidenceRow[]>()
    rows.forEach((e) => {
      const list = map.get(e.capturedDay)
      if (list) list.push(e)
      else map.set(e.capturedDay, [e])
    })
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [rows])

  // ── Export ──
  const doExport = async () => {
    if (!rows.length) return
    const csvRows: ExportRow[] = rows.map((e) => ({
      'Evidence ID': e.id,
      Visit: e.visitCode,
      Outlet: e.outletName,
      'Outlet Code': e.outletCode,
      Category: CATEGORY_LABELS[e.category],
      Question: e.questionText,
      Type: e.type,
      Title: e.title,
      Description: e.description,
      'Captured At': e.capturedAt,
      'Uploaded At': e.uploadedAt,
      'Uploaded By': e.uploadedBy,
      'File Name': e.fileName,
      'Size (KB)': e.sizeKb,
    }))
    exportCsv(csvRows, `insight360-evidence-${format(now, 'yyyyMMdd')}`)
    try {
      await dispatch((d, ctx) => logExport(d, ctx, 'Evidence library', 'CSV'))
      toast.success(`Exported ${rows.length.toLocaleString()} evidence records`)
    } catch {
      toast.error('Export was downloaded but could not be logged')
    }
  }

  // ── Upload ──
  const submitUpload = async (file: File | null, draft: UploadDraft) => {
    if (!user) return
    const visit = visitById.get(draft.visitId)
    if (!visit) {
      toast.error('Select a visit first')
      return
    }
    setBusy(true)
    try {
      const ev = await uploadEvidence(file, {
        visitId: visit.id,
        outletId: visit.outletId,
        category: draft.category,
        questionId: draft.questionId || null,
        type: draft.type,
        title: draft.title.trim(),
        description: draft.description.trim(),
        uploadedBy: user.name,
      })
      await dispatch((d, ctx) => addEvidence(d, ctx, ev))
      toast.success(`Evidence "${ev.title}" uploaded to ${visit.code}`)
      setUploadOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  // ── Table columns ──
  const columns = useMemo<Column<EvidenceRow>[]>(
    () => [
      { key: 'id', header: 'Evidence ID', render: (e) => <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{e.id}</span>, width: '130px' },
      {
        key: 'visitCode',
        header: 'Visit',
        render: (e) => (
          <Link to={`/operations/visits/${e.visitId}`} className="link font-medium" onClick={(ev) => ev.stopPropagation()}>
            {e.visitCode}
          </Link>
        ),
      },
      {
        key: 'outletName',
        header: 'Outlet',
        render: (e) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-800 dark:text-slate-100">{e.outletName}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{e.outletCode}</p>
          </div>
        ),
      },
      { key: 'category', header: 'Category', render: (e) => <span title={CATEGORY_LABELS[e.category]}>{CATEGORY_SHORT[e.category]}</span>, sortValue: (e) => CATEGORY_LABELS[e.category] },
      { key: 'questionText', header: 'Question', render: (e) => <span title={e.questionText || undefined} className="text-slate-600 dark:text-slate-300">{e.questionText ? truncate(e.questionText, 48) : '—'}</span> },
      { key: 'capturedAt', header: 'Captured', render: (e) => <span className="whitespace-nowrap tabular-nums">{fmtDate(e.capturedAt)}</span> },
      { key: 'uploadedAt', header: 'Uploaded', render: (e) => <span className="whitespace-nowrap tabular-nums">{fmtDate(e.uploadedAt)}</span> },
      { key: 'uploadedBy', header: 'Uploaded by' },
      { key: 'type', header: 'Type', render: (e) => <TypeBadge type={e.type} /> },
      { key: 'description', header: 'Description', render: (e) => <span title={e.description} className="text-slate-600 dark:text-slate-300">{truncate(e.description, 60)}</span>, sortable: false },
    ],
    [],
  )

  const subtitle = `${scopedEvidence.length.toLocaleString()} items · ${EVIDENCE_TYPES.map((t) => `${typeCounts[t].toLocaleString()} ${t}`).join(' · ')}`

  const previewContext = preview
    ? {
        outlet: `${preview.outletName}${preview.outletCode ? ` (${preview.outletCode})` : ''}`,
        visit: `${preview.visitCode}${preview.visitType ? ` · ${preview.visitType}` : ''}`,
        question: preview.questionText || undefined,
      }
    : undefined

  return (
    <div className="space-y-5">
      <PageHeader
        title="Evidence Library"
        subtitle={subtitle}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => void doExport()} disabled={!rows.length}>
              <Download className="h-4 w-4" /> Export CSV
            </button>
            {canUpload && (
              <button type="button" className="btn-primary" onClick={() => setUploadOpen(true)}>
                <UploadCloud className="h-4 w-4" /> Upload evidence
              </button>
            )}
          </>
        }
      />

      <FilterBar search={search} onSearch={setSearch} searchPlaceholder="Search title, description or file…" filters={filterDefs} values={filters} onChange={setFilter} onReset={resetFilters} resultCount={rows.length}>
        <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="sr-only sm:not-sr-only whitespace-nowrap">Captured from</span>
          <Input type="date" value={filters.from ?? ''} max={filters.to || undefined} onChange={(e) => setFilter('from', e.target.value)} className="!w-auto !py-1.5 text-xs" aria-label="Captured from" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="sr-only sm:not-sr-only whitespace-nowrap">to</span>
          <Input type="date" value={filters.to ?? ''} min={filters.from || undefined} onChange={(e) => setFilter('to', e.target.value)} className="!w-auto !py-1.5 text-xs" aria-label="Captured to" />
        </label>
      </FilterBar>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-navy-800">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl<ViewMode>
              ariaLabel="View mode"
              value={view}
              onChange={setView}
              options={[
                { value: 'gallery', label: <span className="inline-flex items-center gap-1.5"><LayoutGrid className="h-3.5 w-3.5" aria-hidden /> Gallery</span> },
                { value: 'timeline', label: <span className="inline-flex items-center gap-1.5"><ListOrdered className="h-3.5 w-3.5" aria-hidden /> Timeline</span> },
                { value: 'table', label: <span className="inline-flex items-center gap-1.5"><Table2 className="h-3.5 w-3.5" aria-hidden /> Table</span> },
              ]}
            />
            {visitParam && (
              <span className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 py-0.5 pl-2 pr-1 text-xs font-medium text-teal-800 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300">
                Visit {pinnedVisit?.code ?? visitParam}
                {pinnedVisit && (
                  <Link to={`/operations/visits/${pinnedVisit.id}`} className="ml-0.5 rounded p-0.5 hover:bg-teal-100 dark:hover:bg-teal-500/20" aria-label={`Open visit ${pinnedVisit.code}`}>
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </Link>
                )}
                <button type="button" onClick={clearVisitParam} className="rounded p-0.5 hover:bg-teal-100 dark:hover:bg-teal-500/20" aria-label="Remove visit filter">
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {view === 'gallery' && rows.length > 0
              ? `Showing ${((gallery.page - 1) * GALLERY_PAGE_SIZE + 1).toLocaleString()}–${Math.min(gallery.page * GALLERY_PAGE_SIZE, rows.length).toLocaleString()} of ${rows.length.toLocaleString()}`
              : `${rows.length.toLocaleString()} ${rows.length === 1 ? 'item' : 'items'}`}
          </p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Images}
            title="No evidence matches"
            message={visitParam || Object.values(filters).some(Boolean) || search ? 'Try clearing the filters or the visit chip.' : 'Evidence captured during visits will appear here.'}
            action={
              canUpload ? (
                <button type="button" className="btn-primary btn-sm" onClick={() => setUploadOpen(true)}>
                  <UploadCloud className="h-4 w-4" /> Upload evidence
                </button>
              ) : undefined
            }
          />
        ) : view === 'gallery' ? (
          <div className="p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {gallery.slice.map((e) => (
                <EvidenceCard key={e.id} evidence={e} meta={`${e.outletName} · ${e.visitCode}`} selected={preview?.id === e.id} onClick={() => setPreview(e)} />
              ))}
            </div>
            {gallery.pageCount > 1 && (
              <nav className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400" aria-label="Gallery pagination">
                <span className="tabular-nums">
                  Page {gallery.page} / {gallery.pageCount}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => gallery.setPage((p) => Math.max(1, p - 1))} disabled={gallery.page <= 1}>
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => gallery.setPage((p) => Math.min(gallery.pageCount, p + 1))} disabled={gallery.page >= gallery.pageCount}>
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </nav>
            )}
          </div>
        ) : view === 'timeline' ? (
          <div className="divide-y divide-slate-200 dark:divide-navy-800">
            {timelineGroups.map(([day, items]) => (
              <section key={day} className="px-4 py-4">
                <header className="mb-3 flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-navy-50 text-navy-700 dark:bg-navy-800 dark:text-teal-300">
                    <CalendarDays className="h-4 w-4" aria-hidden />
                  </span>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{fmtDate(day, 'EEEE, dd MMM yyyy')}</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    · {items.length} {items.length === 1 ? 'item' : 'items'}
                  </span>
                </header>
                <ol className="relative ml-3.5 space-y-2 border-l border-slate-200 pl-5 dark:border-navy-700">
                  {items.map((e) => (
                    <li key={e.id} className="relative">
                      <span className="absolute -left-[26px] top-4 h-2.5 w-2.5 rounded-full border-2 border-white bg-teal-500 dark:border-navy-900" aria-hidden />
                      <button
                        type="button"
                        onClick={() => setPreview(e)}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-lg border border-transparent p-2 text-left transition-colors hover:border-slate-200 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-teal-500 dark:hover:border-navy-700 dark:hover:bg-navy-800/60',
                          preview?.id === e.id && 'border-teal-300 bg-teal-50/60 dark:border-teal-500/40 dark:bg-teal-500/10',
                        )}
                      >
                        <EvidenceVisual type={e.type} seed={e.visualSeed} label={e.title} className="h-16 w-24 shrink-0 rounded" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{e.title}</p>
                            <TypeBadge type={e.type} size="xs" />
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-300">
                            {e.outletName} · <span className="font-medium">{e.visitCode}</span>
                            {e.visitType && <span className="text-slate-400 dark:text-slate-500"> · {e.visitType}</span>}
                          </p>
                          {e.questionText && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{truncate(e.questionText, 110)}</p>}
                          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                            Captured {fmtDateTime(e.capturedAt)} · Uploaded by {e.uploadedBy} {fmtDateTime(e.uploadedAt)}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(e) => e.id} onRowClick={(e) => setPreview(e)} selectedKey={preview?.id ?? null} pageSize={20} dense initialSort={{ key: 'capturedAt', dir: 'desc' }} caption="Evidence records" emptyTitle="No evidence" />
        )}
      </Card>

      <p className="text-[11px] text-slate-400 dark:text-slate-500">Demo mode renders neutral generated placeholders; no real photographs are stored. Live mode serves originals from Supabase Storage via signed URLs.</p>

      <EvidencePreviewModal evidence={preview} onClose={() => setPreview(null)} context={previewContext} />

      {canUpload && uploadOpen && (
        <UploadEvidenceModal
          onClose={() => !busy && setUploadOpen(false)}
          busy={busy}
          visits={scopedVisits}
          outletName={(id) => outletById.get(id)?.name ?? 'Unknown outlet'}
          questionsFor={(visit) => getVisitQuestions(data, visit)}
          categoryFor={(q) => sectionById.get(q.sectionId)?.category ?? 'customer_experience'}
          initialVisitId={pinnedVisit && !UPLOAD_CLOSED_STATUSES.includes(pinnedVisit.status) ? pinnedVisit.id : ''}
          onSubmit={submitUpload}
        />
      )}
    </div>
  )
}

// ───────────────────────────── Upload modal ─────────────────────────────

/** Mounted only while open, so every opening starts from a clean draft. */
function UploadEvidenceModal({
  onClose,
  busy,
  visits,
  outletName,
  questionsFor,
  categoryFor,
  initialVisitId,
  onSubmit,
}: {
  onClose: () => void
  busy: boolean
  visits: Visit[]
  outletName: (outletId: string) => string
  questionsFor: (visit: Visit) => Question[]
  categoryFor: (q: Question) => CategoryKey
  initialVisitId: string
  onSubmit: (file: File | null, draft: UploadDraft) => Promise<void>
}) {
  const eligible = useMemo(() => visits.filter((v) => !UPLOAD_CLOSED_STATUSES.includes(v.status)).sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate)), [visits])
  const [draft, setDraft] = useState<UploadDraft>({ visitId: initialVisitId, questionId: '', category: 'customer_experience', type: 'Photo', title: '', description: '' })
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const selectedVisit = useMemo(() => eligible.find((v) => v.id === draft.visitId) ?? null, [eligible, draft.visitId])
  const questions = useMemo(() => (selectedVisit ? questionsFor(selectedVisit) : []), [selectedVisit, questionsFor])

  const patch = (p: Partial<UploadDraft>) => setDraft((d) => ({ ...d, ...p }))

  const onFileChange = (f: File | null) => {
    const err = validateFile(f)
    setFileError(err)
    if (err) {
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setFile(f)
    if (f) {
      patch({ type: typeFromFile(f, draft.type), title: draft.title || f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') })
    }
  }

  const onQuestionChange = (questionId: string) => {
    const q = questions.find((x) => x.id === questionId)
    patch({ questionId, ...(q ? { category: categoryFor(q) } : {}) })
  }

  const valid = !!draft.visitId && !!draft.title.trim() && !fileError

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid || busy) return
    void onSubmit(file, draft)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload evidence"
      description="Attach a photo, video, receipt, screenshot or document to an open visit."
      size="md"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="evidence-upload-form" className="btn-primary" disabled={busy || !valid}>
            <UploadCloud className="h-4 w-4" /> {busy ? 'Uploading…' : 'Upload'}
          </button>
        </>
      }
    >
      <form id="evidence-upload-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Visit" required htmlFor="ev-visit" className="sm:col-span-2" hint={eligible.length ? undefined : 'No open visits are available in your scope.'}>
          <Select id="ev-visit" value={draft.visitId} onChange={(e) => patch({ visitId: e.target.value, questionId: '' })} required disabled={!eligible.length}>
            <option value="">Select visit…</option>
            {eligible.map((v) => (
              <option key={v.id} value={v.id}>
                {v.code} · {outletName(v.outletId)} · {v.type} · {v.status}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Linked question" htmlFor="ev-question" className="sm:col-span-2" hint="Optional — selecting a question sets the category automatically.">
          <Select id="ev-question" value={draft.questionId} onChange={(e) => onQuestionChange(e.target.value)} disabled={!selectedVisit}>
            <option value="">No specific question</option>
            {questions.map((q) => (
              <option key={q.id} value={q.id}>
                {q.code} · {truncate(q.text, 70)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" required htmlFor="ev-category">
          <Select id="ev-category" value={draft.category} onChange={(e) => patch({ category: e.target.value as CategoryKey })}>
            {CATEGORY_KEYS.map((k) => (
              <option key={k} value={k}>
                {CATEGORY_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type" required htmlFor="ev-type">
          <Select id="ev-type" value={draft.type} onChange={(e) => patch({ type: e.target.value as EvidenceType })}>
            {EVIDENCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title" required htmlFor="ev-title" className="sm:col-span-2">
          <Input id="ev-title" value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder="e.g. Entrance signage at arrival" maxLength={120} required />
        </Field>
        <Field label="Description" htmlFor="ev-desc" className="sm:col-span-2">
          <Textarea id="ev-desc" value={draft.description} onChange={(e) => patch({ description: e.target.value })} placeholder="What does this evidence show?" maxLength={600} />
        </Field>
        <Field label="File" htmlFor="ev-file" className="sm:col-span-2" error={fileError ?? undefined} hint={file ? `${file.name} · ${(file.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 0 })} KB` : 'JPEG, PNG, WebP, MP4 or PDF · up to 50 MB. Leave empty to register a demo placeholder.'}>
          <input
            id="ev-file"
            ref={fileRef}
            type="file"
            accept="image/*,video/*,.pdf"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-navy-800 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-navy-700 dark:text-slate-300 dark:file:bg-teal-600 dark:hover:file:bg-teal-500"
          />
        </Field>
      </form>
    </Modal>
  )
}
