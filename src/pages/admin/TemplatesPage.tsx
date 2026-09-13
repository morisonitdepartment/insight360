import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  AlertOctagon,
  Camera,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Copy,
  Eye,
  FilePlus2,
  Image as ImageIcon,
  Layers,
  ListChecks,
  MessageSquareText,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Save,
  ScrollText,
  Trash2,
  Video,
  Weight as WeightIcon,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import type { AuditTemplate, CategoryKey, JourneyType, Question, QuestionType, Section, Segment } from '@/types'
import {
  cloneTemplate,
  createTemplate,
  deleteQuestion,
  deleteSection,
  updateTemplate,
  upsertQuestion,
  upsertSection,
} from '@/services/actions'
import { CATEGORY_KEYS, CATEGORY_LABELS, CATEGORY_SHORT } from '@/utils/scoring'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge, RiskBadge, SegmentBadge, StatusBadge } from '@/components/ui/Badge'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { Field, Input, Select, Textarea, Toggle } from '@/components/ui/Form'
import { EmptyState } from '@/components/ui/States'
import { Divider, ProgressBar, Stat } from '@/components/ui/Misc'
import { fmtDateTime, truncate } from '@/utils/format'
import { cn } from '@/utils/cn'

// ───────────────────────────── Constants ─────────────────────────────

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  yes_no: 'Yes / No',
  rating_5: '1–5 rating',
  rating_10: '1–10 rating',
  pass_fail: 'Pass / Fail',
  multiple_choice: 'Multiple choice',
  text: 'Text',
  numeric: 'Numeric',
  time: 'Time (min)',
  photo: 'Photo required',
  video: 'Video required',
}

const QUESTION_TYPES = Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]

const JOURNEYS: JourneyType[] = [
  'In-store / Dine-in',
  'Social Media Interaction',
  'Takeaway',
  'Delivery',
  'Entertainment Ticketing',
  'Reception',
  'Guest Onboarding',
  'Safety Briefing',
  'Digital Interaction',
]

type ApplicableChoice = 'all' | 'F&B' | 'Entertainment'

const APPLICABLE_LABELS: Record<ApplicableChoice, string> = {
  all: 'All segments',
  'F&B': 'F&B only',
  Entertainment: 'Entertainment only',
}

const toApplicable = (v: Segment[] | 'all'): ApplicableChoice => (v === 'all' ? 'all' : v[0] === 'Entertainment' ? 'Entertainment' : 'F&B')
const fromApplicable = (v: ApplicableChoice): Segment[] | 'all' => (v === 'all' ? 'all' : [v])

// ───────────────────────────── Form models ─────────────────────────────

interface TemplateForm {
  name: string
  code: string
  description: string
  segment: AuditTemplate['segment']
  journey: JourneyType
  isFollowUp: boolean
}

interface HeaderForm {
  name: string
  code: string
  version: string
  description: string
}

interface SectionForm {
  id: string | null
  code: string
  title: string
  category: CategoryKey
  description: string
  applicableTo: ApplicableChoice
}

interface QuestionForm {
  id: string | null
  sectionId: string
  text: string
  type: QuestionType
  weight: string
  critical: boolean
  evidenceRequired: boolean
  commentRequired: boolean
  allowNA: boolean
  guidance: string
  options: string
  threshold: string
}

const EMPTY_SECTION: SectionForm = { id: null, code: '', title: '', category: 'customer_experience', description: '', applicableTo: 'all' }
const emptyQuestion = (sectionId: string): QuestionForm => ({
  id: null,
  sectionId,
  text: '',
  type: 'yes_no',
  weight: '2',
  critical: false,
  evidenceRequired: false,
  commentRequired: false,
  allowNA: false,
  guidance: '',
  options: '',
  threshold: '',
})

// ───────────────────────────── Read-only preview controls ─────────────────────────────

function PreviewControl({ q }: { q: Question }) {
  const pill = 'rounded-md border border-slate-200 dark:border-navy-700 bg-slate-50 dark:bg-navy-800/60 px-3 py-1 text-xs text-slate-500 dark:text-slate-400'
  switch (q.type) {
    case 'yes_no':
    case 'pass_fail': {
      const opts = q.type === 'yes_no' ? ['Yes', 'No'] : ['Pass', 'Fail']
      return (
        <div className="flex flex-wrap gap-2" role="group" aria-label={q.text}>
          {opts.map((o) => (
            <span key={o} className={pill}>
              <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border border-slate-300 dark:border-navy-600 align-middle" aria-hidden />
              {o}
            </span>
          ))}
        </div>
      )
    }
    case 'rating_5':
    case 'rating_10': {
      const n = q.type === 'rating_5' ? 5 : 10
      return (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={q.text}>
          {Array.from({ length: n }, (_, i) => (
            <span key={i} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 dark:border-navy-700 bg-slate-50 dark:bg-navy-800/60 text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {i + 1}
            </span>
          ))}
        </div>
      )
    }
    case 'multiple_choice':
      return (
        <Select disabled value="" aria-label={q.text} onChange={() => undefined} className="max-w-md">
          <option value="">Select an option…</option>
          {(q.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      )
    case 'text':
      return <Textarea disabled placeholder="Shopper narrative…" aria-label={q.text} className="max-w-xl" />
    case 'numeric':
    case 'time':
      return (
        <div className="flex items-center gap-2">
          <Input disabled type="number" placeholder="0" aria-label={q.text} className="!w-28" />
          <span className="text-xs text-slate-500 dark:text-slate-400">{q.type === 'time' ? 'minutes' : 'value'}{q.threshold ? ` · standard ≤ ${q.threshold}` : ''}</span>
        </div>
      )
    case 'photo':
    case 'video':
      return (
        <div className="flex max-w-md items-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-navy-700 px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
          {q.type === 'photo' ? <Camera className="h-4 w-4" aria-hidden /> : <Video className="h-4 w-4" aria-hidden />}
          {q.type === 'photo' ? 'Photo capture required' : 'Video capture required'}
        </div>
      )
    default:
      return null
  }
}

// ───────────────────────────── Page ─────────────────────────────

export default function TemplatesPage() {
  useDocumentTitle('Audit Templates')
  const now = useNow()
  const { can } = useAuth()
  const { data, dispatch } = useData()
  const [params, setParams] = useSearchParams()

  const canEdit = can('admin.templates')

  // ── Selection (deep link ?template=) ──
  const paramId = params.get('template')
  const selected = useMemo(() => data.templates.find((t) => t.id === paramId) ?? data.templates[0] ?? null, [data.templates, paramId])

  const select = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params)
      if (id) next.set('template', id)
      else next.delete('template')
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  // After a create / clone the new id is generated inside the reducer — pick it up by code.
  const [pendingCode, setPendingCode] = useState<string | null>(null)
  useEffect(() => {
    if (!pendingCode) return
    const t = data.templates.find((x) => x.code === pendingCode)
    if (t) {
      select(t.id)
      setPendingCode(null)
    }
  }, [pendingCode, data.templates, select])

  // ── Derived structure for the selected template ──
  const sections = useMemo(
    () => (selected ? data.sections.filter((s) => s.templateId === selected.id).sort((a, b) => a.order - b.order) : []),
    [data.sections, selected],
  )
  const questionsBySection = useMemo(() => {
    const map = new Map<string, Question[]>()
    for (const s of sections) map.set(s.id, data.questions.filter((q) => q.sectionId === s.id).sort((a, b) => a.order - b.order))
    return map
  }, [sections, data.questions])

  const templateQuestions = useMemo(() => sections.flatMap((s) => questionsBySection.get(s.id) ?? []), [sections, questionsBySection])

  const summary = useMemo(() => {
    const totalWeight = templateQuestions.reduce((a, q) => a + q.weight, 0)
    const perCategory = CATEGORY_KEYS.map((key) => {
      const secIds = new Set(sections.filter((s) => s.category === key).map((s) => s.id))
      const qs = templateQuestions.filter((q) => secIds.has(q.sectionId))
      return { key, label: CATEGORY_LABELS[key], short: CATEGORY_SHORT[key], sections: secIds.size, questions: qs.length, weight: qs.reduce((a, q) => a + q.weight, 0) }
    }).filter((c) => c.sections > 0)
    return {
      totalWeight,
      perCategory,
      questions: templateQuestions.length,
      critical: templateQuestions.filter((q) => q.critical).length,
      evidence: templateQuestions.filter((q) => q.evidenceRequired).length,
      comment: templateQuestions.filter((q) => q.commentRequired).length,
    }
  }, [sections, templateQuestions])

  const countsFor = useCallback(
    (t: AuditTemplate) => {
      const secIds = new Set(data.sections.filter((s) => s.templateId === t.id).map((s) => s.id))
      return { sections: secIds.size, questions: data.questions.filter((q) => secIds.has(q.sectionId)).length }
    },
    [data.sections, data.questions],
  )

  // ── Local UI state ──
  const [busy, setBusy] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [createOpen, setCreateOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [sectionForm, setSectionForm] = useState<SectionForm | null>(null)
  const [questionForm, setQuestionForm] = useState<QuestionForm | null>(null)
  const [confirmSection, setConfirmSection] = useState<Section | null>(null)
  const [confirmQuestion, setConfirmQuestion] = useState<Question | null>(null)
  const [templateForm, setTemplateForm] = useState<TemplateForm>({ name: '', code: '', description: '', segment: 'Both', journey: 'In-store / Dine-in', isFollowUp: false })
  const [header, setHeader] = useState<HeaderForm>({ name: '', code: '', version: '', description: '' })

  // Re-seed the editable header whenever the persisted template metadata changes.
  const selId = selected?.id
  const selName = selected?.name ?? ''
  const selCode = selected?.code ?? ''
  const selVersion = selected?.version ?? ''
  const selDescription = selected?.description ?? ''
  useEffect(() => {
    if (!selId) return
    setHeader({ name: selName, code: selCode, version: selVersion, description: selDescription })
  }, [selId, selName, selCode, selVersion, selDescription])

  const headerDirty = !!selected && (header.name !== selected.name || header.code !== selected.code || header.version !== selected.version || header.description !== selected.description)

  const run = async (label: string, recipe: Parameters<typeof dispatch>[0], after?: () => void) => {
    setBusy(true)
    try {
      await dispatch(recipe)
      toast.success(label)
      after?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  // ── Template-level actions ──
  const submitCreateTemplate = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!canEdit) return
    const name = templateForm.name.trim()
    const code = templateForm.code.trim().toUpperCase()
    if (!name || !code) {
      toast.error('Template name and code are required.')
      return
    }
    if (data.templates.some((t) => t.code.toUpperCase() === code)) {
      toast.error('That template code is already in use.')
      return
    }
    setPendingCode(code)
    await run(`Template ${code} created`, (d, ctx) => createTemplate(d, ctx, { name, code, description: templateForm.description.trim(), segment: templateForm.segment, journey: templateForm.journey, isFollowUp: templateForm.isFollowUp }), () => setCreateOpen(false))
  }

  const doClone = async (t: AuditTemplate) => {
    if (!canEdit) return
    setPendingCode(`${t.code}-COPY`)
    await run(`${t.name} cloned as a draft`, (d, ctx) => cloneTemplate(d, ctx, t.id))
  }

  const toggleStatus = async (t: AuditTemplate) => {
    if (!canEdit) return
    const status: AuditTemplate['status'] = t.status === 'Active' ? 'Inactive' : 'Active'
    await run(`${t.name} ${status === 'Active' ? 'activated' : 'deactivated'}`, (d, ctx) => updateTemplate(d, ctx, t.id, { status }))
  }

  const saveHeader = async () => {
    if (!selected || !canEdit || !headerDirty) return
    if (!header.name.trim() || !header.code.trim()) {
      toast.error('Name and code cannot be empty.')
      return
    }
    await run('Template details saved', (d, ctx) => updateTemplate(d, ctx, selected.id, { name: header.name.trim(), code: header.code.trim().toUpperCase(), version: header.version.trim() || '1.0', description: header.description.trim() }))
  }

  // ── Section actions ──
  const openNewSection = () => {
    if (!selected) return
    setSectionForm({ ...EMPTY_SECTION, code: String.fromCharCode(65 + Math.min(25, sections.length)) })
  }
  const openEditSection = (s: Section) => setSectionForm({ id: s.id, code: s.code, title: s.title, category: s.category, description: s.description, applicableTo: toApplicable(s.applicableTo) })

  const submitSection = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!sectionForm || !selected || !canEdit) return
    const code = sectionForm.code.trim().toUpperCase()
    const title = sectionForm.title.trim()
    if (!code || !title) {
      toast.error('Section code and title are required.')
      return
    }
    const existing = sectionForm.id ? sections.find((s) => s.id === sectionForm.id) : undefined
    const section: Section = {
      id: sectionForm.id ?? `sec-${Date.now()}`,
      templateId: selected.id,
      code,
      title,
      category: sectionForm.category,
      description: sectionForm.description.trim(),
      order: existing?.order ?? (sections.length ? Math.max(...sections.map((s) => s.order)) + 1 : 1),
      applicableTo: fromApplicable(sectionForm.applicableTo),
    }
    await run(existing ? `Section ${code} updated` : `Section ${code} added`, (d, ctx) => upsertSection(d, ctx, section), () => setSectionForm(null))
  }

  const moveSection = async (s: Section, dir: -1 | 1) => {
    if (!canEdit) return
    const i = sections.findIndex((x) => x.id === s.id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= sections.length) return
    const other = sections[j]
    const sameOrder = other.order === s.order
    const a: Section = { ...s, order: sameOrder ? j + 1 : other.order }
    const b: Section = { ...other, order: sameOrder ? i + 1 : s.order }
    setBusy(true)
    try {
      await dispatch((d, ctx) => upsertSection(d, ctx, a))
      await dispatch((d, ctx) => upsertSection(d, ctx, b))
      toast.success(`Section ${s.code} moved ${dir === -1 ? 'up' : 'down'}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reorder failed')
    } finally {
      setBusy(false)
    }
  }

  const removeSection = async () => {
    if (!confirmSection || !canEdit) return
    const s = confirmSection
    await run(`Section ${s.code} deleted`, (d, ctx) => deleteSection(d, ctx, s.id), () => setConfirmSection(null))
  }

  // ── Question actions ──
  const openNewQuestion = (s: Section) => setQuestionForm(emptyQuestion(s.id))
  const openEditQuestion = (q: Question) =>
    setQuestionForm({
      id: q.id,
      sectionId: q.sectionId,
      text: q.text,
      type: q.type,
      weight: String(q.weight),
      critical: q.critical,
      evidenceRequired: q.evidenceRequired,
      commentRequired: q.commentRequired,
      allowNA: q.allowNA,
      guidance: q.guidance,
      options: (q.options ?? []).join(', '),
      threshold: q.threshold === undefined ? '' : String(q.threshold),
    })

  const submitQuestion = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!questionForm || !canEdit) return
    const section = sections.find((s) => s.id === questionForm.sectionId)
    if (!section) return
    const text = questionForm.text.trim()
    if (!text) {
      toast.error('Question text is required.')
      return
    }
    const options = questionForm.type === 'multiple_choice' ? questionForm.options.split(',').map((o) => o.trim()).filter(Boolean) : undefined
    if (questionForm.type === 'multiple_choice' && (!options || options.length < 2)) {
      toast.error('Provide at least two options, ordered best → worst.')
      return
    }
    const siblings = questionsBySection.get(section.id) ?? []
    const existing = questionForm.id ? siblings.find((q) => q.id === questionForm.id) : undefined
    const weight = Math.max(0, Math.min(10, Math.round(Number(questionForm.weight) || 0)))
    const thresholdNum = Number(questionForm.threshold)
    const question: Question = {
      id: questionForm.id ?? `q-${Date.now()}`,
      sectionId: section.id,
      code: existing?.code ?? `${section.code}.${siblings.length + 1}`,
      text,
      type: questionForm.type,
      weight,
      critical: questionForm.critical,
      evidenceRequired: questionForm.evidenceRequired,
      commentRequired: questionForm.commentRequired,
      allowNA: questionForm.allowNA,
      guidance: questionForm.guidance.trim(),
      options,
      threshold: (questionForm.type === 'time' || questionForm.type === 'numeric') && questionForm.threshold !== '' && Number.isFinite(thresholdNum) ? thresholdNum : undefined,
      order: existing?.order ?? (siblings.length ? Math.max(...siblings.map((q) => q.order)) + 1 : 1),
    }
    await run(existing ? `Question ${question.code} updated` : `Question ${question.code} added`, (d, ctx) => upsertQuestion(d, ctx, question), () => setQuestionForm(null))
  }

  const removeQuestion = async () => {
    if (!confirmQuestion || !canEdit) return
    const q = confirmQuestion
    await run(`Question ${q.code} deleted`, (d, ctx) => deleteQuestion(d, ctx, q.id), () => setConfirmQuestion(null))
  }

  // ── Question table columns ──
  const questionColumns = useMemo<Column<Question>[]>(
    () => {
      const base: Column<Question>[] = [
        { key: 'code', header: 'Code', width: '76px', render: (q) => <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{q.code}</span> },
        {
          key: 'text',
          header: 'Question',
          render: (q) => (
            <span className="block min-w-[220px] text-slate-800 dark:text-slate-100">{q.text}</span>
          ),
        },
        { key: 'type', header: 'Type', render: (q) => <Badge tone="slate">{QUESTION_TYPE_LABELS[q.type]}</Badge>, sortValue: (q) => QUESTION_TYPE_LABELS[q.type] },
        { key: 'weight', header: 'Weight', align: 'right', width: '72px', render: (q) => <span className="tabular-nums">{q.weight}</span>, sortValue: (q) => q.weight },
        {
          key: 'critical',
          header: 'Critical',
          align: 'center',
          width: '92px',
          render: (q) => (q.critical ? <Badge tone="red" icon={AlertOctagon}>Critical</Badge> : <span className="text-slate-300 dark:text-navy-600">—</span>),
          sortValue: (q) => (q.critical ? 1 : 0),
        },
        {
          key: 'evidence',
          header: 'Evidence',
          align: 'center',
          width: '80px',
          render: (q) =>
            q.evidenceRequired ? (
              <span title="Evidence required" className="inline-flex text-teal-600 dark:text-teal-400">
                <ImageIcon className="h-4 w-4" aria-hidden />
                <span className="sr-only">Evidence required</span>
              </span>
            ) : (
              <span className="text-slate-300 dark:text-navy-600">—</span>
            ),
          sortValue: (q) => (q.evidenceRequired ? 1 : 0),
        },
        {
          key: 'comment',
          header: 'Comment',
          align: 'center',
          width: '80px',
          render: (q) =>
            q.commentRequired ? (
              <span title="Comment required" className="inline-flex text-teal-600 dark:text-teal-400">
                <MessageSquareText className="h-4 w-4" aria-hidden />
                <span className="sr-only">Comment required</span>
              </span>
            ) : (
              <span className="text-slate-300 dark:text-navy-600">—</span>
            ),
          sortValue: (q) => (q.commentRequired ? 1 : 0),
        },
        {
          key: 'na',
          header: 'N/A',
          align: 'center',
          width: '72px',
          render: (q) => (q.allowNA ? <Badge tone="slate" size="xs">Allowed</Badge> : <span className="text-slate-300 dark:text-navy-600">—</span>),
          sortValue: (q) => (q.allowNA ? 1 : 0),
        },
        {
          key: 'guidance',
          header: 'Guidance',
          render: (q) =>
            q.guidance ? (
              <span className="block max-w-[220px] text-xs text-slate-500 dark:text-slate-400" title={q.guidance}>
                {truncate(q.guidance, 52)}
              </span>
            ) : (
              <span className="text-slate-300 dark:text-navy-600">—</span>
            ),
        },
      ]
      if (!canEdit) return base
      return [
        ...base,
        {
          key: 'actions',
          header: <span className="sr-only">Actions</span>,
          sortable: false,
          align: 'right',
          width: '96px',
          render: (q) => (
            <div className="flex justify-end gap-1">
              <button type="button" className="btn-ghost btn-sm" onClick={() => openEditQuestion(q)} disabled={busy} aria-label={`Edit question ${q.code}`} title="Edit question">
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button type="button" className="btn-ghost btn-sm text-red-600 dark:text-red-400" onClick={() => setConfirmQuestion(q)} disabled={busy} aria-label={`Delete question ${q.code}`} title="Delete question">
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ),
        },
      ]
    },
    [canEdit, busy],
  )

  const sectionWeight = (sectionId: string) => (questionsBySection.get(sectionId) ?? []).reduce((a, q) => a + q.weight, 0)

  // ───────────────────────────── Render ─────────────────────────────

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit Templates"
        subtitle="Questionnaire builder — sections, weighted questions, critical checks and evidence rules"
        badge={selected ? <StatusBadge status={selected.status} /> : undefined}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => setPreviewOpen(true)} disabled={!selected}>
              <Eye className="h-4 w-4" aria-hidden /> Preview
            </button>
            {canEdit && (
              <button type="button" className="btn-primary" onClick={() => { setTemplateForm({ name: '', code: '', description: '', segment: 'Both', journey: 'In-store / Dine-in', isFollowUp: false }); setCreateOpen(true) }}>
                <FilePlus2 className="h-4 w-4" aria-hidden /> New template
              </button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* ── Template list ── */}
        <div className="space-y-3">
          <Card>
            <CardHeader title="Templates" subtitle={`${data.templates.length} questionnaires`} />
            <div className="max-h-[70vh] space-y-2 overflow-y-auto px-3 pb-3">
              {data.templates.length === 0 && <EmptyState title="No templates" message="Create the first audit template to begin." />}
              {data.templates.map((t) => {
                const counts = countsFor(t)
                const active = selected?.id === t.id
                return (
                  <article
                    key={t.id}
                    className={cn(
                      'rounded-lg border p-3 transition-colors',
                      active ? 'border-teal-500/70 bg-teal-50/60 dark:border-teal-500/50 dark:bg-teal-500/10' : 'border-slate-200 bg-white hover:border-slate-300 dark:border-navy-800 dark:bg-navy-900 dark:hover:border-navy-700',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{t.name}</h3>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-mono">{t.code}</span>
                          <span>v{t.version}</span>
                          {t.isFollowUp && <Badge tone="violet" size="xs">Follow-up</Badge>}
                        </p>
                      </div>
                      <StatusBadge status={t.status} size="xs" />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <SegmentBadge segment={t.segment} size="xs" />
                      <Badge tone="navy" size="xs">{t.journey}</Badge>
                    </div>
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Layers className="h-3 w-3" aria-hidden /> {counts.sections} section{counts.sections === 1 ? '' : 's'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ListChecks className="h-3 w-3" aria-hidden /> {counts.questions} question{counts.questions === 1 ? '' : 's'}
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Updated {fmtDateTime(t.updatedAt)}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <button type="button" className="btn-secondary btn-sm" onClick={() => select(t.id)} disabled={active}>
                        <ClipboardList className="h-3.5 w-3.5" aria-hidden /> Open
                      </button>
                      {canEdit && (
                        <>
                          <button type="button" className="btn-ghost btn-sm" onClick={() => void doClone(t)} disabled={busy} title="Create an editable draft copy">
                            <Copy className="h-3.5 w-3.5" aria-hidden /> Clone
                          </button>
                          <button type="button" className="btn-ghost btn-sm" onClick={() => void toggleStatus(t)} disabled={busy}>
                            {t.status === 'Active' ? <PowerOff className="h-3.5 w-3.5" aria-hidden /> : <Power className="h-3.5 w-3.5" aria-hidden />}
                            {t.status === 'Active' ? 'Deactivate' : 'Activate'}
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </Card>
        </div>

        {/* ── Builder ── */}
        {!selected ? (
          <Card padded>
            <EmptyState title="No template selected" message="Select or create an audit template to open the builder." icon={ScrollText} />
          </Card>
        ) : (
          <div className="space-y-5">
            {/* Header / metadata */}
            <Card>
              <CardHeader
                title="Template details"
                subtitle={`${selected.journey} · ${selected.segment} · created ${fmtDateTime(selected.createdAt)}`}
                actions={
                  canEdit ? (
                    <button type="button" className="btn-primary btn-sm" onClick={() => void saveHeader()} disabled={busy || !headerDirty}>
                      <Save className="h-3.5 w-3.5" aria-hidden /> Save
                    </button>
                  ) : (
                    <Badge tone="slate">Read only</Badge>
                  )
                }
              />
              <CardBody className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Template name" className="sm:col-span-2" htmlFor="tpl-name">
                    <Input id="tpl-name" value={header.name} onChange={(e) => setHeader((h) => ({ ...h, name: e.target.value }))} disabled={!canEdit} />
                  </Field>
                  <Field label="Code" htmlFor="tpl-code">
                    <Input id="tpl-code" value={header.code} onChange={(e) => setHeader((h) => ({ ...h, code: e.target.value }))} disabled={!canEdit} className="font-mono" />
                  </Field>
                  <Field label="Version" htmlFor="tpl-version" hint="Increment after structural changes">
                    <Input id="tpl-version" value={header.version} onChange={(e) => setHeader((h) => ({ ...h, version: e.target.value }))} disabled={!canEdit} />
                  </Field>
                </div>
                <Field label="Description" htmlFor="tpl-desc">
                  <Textarea id="tpl-desc" value={header.description} onChange={(e) => setHeader((h) => ({ ...h, description: e.target.value }))} disabled={!canEdit} />
                </Field>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Sections" value={sections.length} />
                  <Stat label="Questions" value={summary.questions} />
                  <Stat label="Total weight" value={summary.totalWeight} sub="Sum of question weights" />
                  <Stat label="Critical checks" value={summary.critical} sub={summary.critical ? 'Force Critical risk on failure' : 'None defined'} />
                </div>
              </CardBody>
            </Card>

            {/* Sections */}
            <Card>
              <CardHeader
                title="Sections & questions"
                subtitle="Ordered as the shopper will see them"
                actions={
                  canEdit ? (
                    <button type="button" className="btn-secondary btn-sm" onClick={openNewSection} disabled={busy}>
                      <Plus className="h-3.5 w-3.5" aria-hidden /> Add section
                    </button>
                  ) : undefined
                }
              />
              <div className="space-y-3 px-3 pb-4">
                {sections.length === 0 && (
                  <EmptyState title="No sections yet" message={canEdit ? 'Add the first section to start building the questionnaire.' : 'This template has no sections.'} icon={Layers} />
                )}
                {sections.map((s, i) => {
                  const qs = questionsBySection.get(s.id) ?? []
                  const isOpen = !collapsed[s.id]
                  return (
                    <section key={s.id} className="rounded-lg border border-slate-200 dark:border-navy-800">
                      <header className="flex flex-wrap items-start justify-between gap-2 bg-slate-50/80 dark:bg-navy-800/40 px-3 py-2.5 rounded-t-lg">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-start gap-2 text-left"
                          aria-expanded={isOpen}
                          onClick={() => setCollapsed((c) => ({ ...c, [s.id]: isOpen }))}
                        >
                          {isOpen ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">{s.code}</span>
                              <span className="text-sm font-semibold text-slate-900 dark:text-white">{s.title}</span>
                              <Badge tone="teal" size="xs">{CATEGORY_LABELS[s.category]}</Badge>
                              <Badge tone={s.applicableTo === 'all' ? 'slate' : 'navy'} size="xs">{APPLICABLE_LABELS[toApplicable(s.applicableTo)]}</Badge>
                            </span>
                            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{s.description}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500 dark:text-slate-400">
                              <span className="inline-flex items-center gap-1">
                                <ListChecks className="h-3 w-3" aria-hidden /> {qs.length} question{qs.length === 1 ? '' : 's'}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <WeightIcon className="h-3 w-3" aria-hidden /> weight {sectionWeight(s.id)}
                              </span>
                            </span>
                          </span>
                        </button>
                        {canEdit && (
                          <div className="flex shrink-0 items-center gap-1">
                            <button type="button" className="btn-ghost btn-sm" onClick={() => void moveSection(s, -1)} disabled={busy || i === 0} aria-label={`Move section ${s.code} up`} title="Move up">
                              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                            </button>
                            <button type="button" className="btn-ghost btn-sm" onClick={() => void moveSection(s, 1)} disabled={busy || i === sections.length - 1} aria-label={`Move section ${s.code} down`} title="Move down">
                              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                            </button>
                            <button type="button" className="btn-ghost btn-sm" onClick={() => openEditSection(s)} disabled={busy} aria-label={`Edit section ${s.code}`} title="Edit section">
                              <Pencil className="h-3.5 w-3.5" aria-hidden />
                            </button>
                            <button type="button" className="btn-ghost btn-sm text-red-600 dark:text-red-400" onClick={() => setConfirmSection(s)} disabled={busy} aria-label={`Delete section ${s.code}`} title="Delete section">
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </div>
                        )}
                      </header>
                      {isOpen && (
                        <div className="p-2">
                          {qs.length === 0 ? (
                            <EmptyState title="No questions" message={canEdit ? 'Add the first question to this section.' : 'This section is empty.'} icon={ListChecks} />
                          ) : (
                            <DataTable columns={questionColumns} rows={qs} rowKey={(q) => q.id} pageSize={0} dense stickyHeader={false} caption={`Questions in section ${s.code}`} />
                          )}
                          {canEdit && (
                            <div className="px-2 pt-2">
                              <button type="button" className="btn-ghost btn-sm" onClick={() => openNewQuestion(s)} disabled={busy}>
                                <Plus className="h-3.5 w-3.5" aria-hidden /> Add question to {s.code}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>
            </Card>

            {/* Summary + thresholds */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader title="Template summary" subtitle="Weight distribution across KPI categories" />
                <CardBody className="space-y-4">
                  {summary.perCategory.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Add sections to see the weight distribution.</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {summary.perCategory.map((c) => {
                        const share = summary.totalWeight ? (c.weight / summary.totalWeight) * 100 : 0
                        return (
                          <li key={c.key}>
                            <div className="flex items-baseline justify-between gap-2 text-xs">
                              <span className="truncate text-slate-700 dark:text-slate-200">
                                <span className="sm:hidden">{c.short}</span>
                                <span className="hidden sm:inline">{c.label}</span>
                              </span>
                              <span className="tabular-nums text-slate-500 dark:text-slate-400">
                                {c.weight} · {share.toFixed(0)}% · {c.questions}Q
                              </span>
                            </div>
                            <ProgressBar value={share} tone="accent" size="sm" className="mt-1" label={`${c.label} weight share`} />
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  <Divider />
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Stat label="Questions" value={summary.questions} />
                    <Stat label="Total weight" value={summary.totalWeight} />
                    <Stat label="Critical" value={summary.critical} />
                    <Stat label="Evidence req." value={summary.evidence} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {summary.comment} question{summary.comment === 1 ? '' : 's'} require a written comment. Question weight drives the section score; section weight drives the category score.
                  </p>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Score ranges" subtitle="Applied to every visit scored with this template" />
                <div className="table-wrap">
                  <table className="table">
                    <caption className="sr-only">Risk rating score ranges</caption>
                    <thead>
                      <tr>
                        <th scope="col">Rating</th>
                        <th scope="col">Range</th>
                        <th scope="col">Meaning</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.thresholds.map((t) => (
                        <tr key={t.label}>
                          <td>
                            <RiskBadge risk={t.label} />
                          </td>
                          <td className="tabular-nums whitespace-nowrap">
                            {t.min.toFixed(0)}–{t.max.toFixed(t.max % 1 ? 2 : 0)}%
                          </td>
                          <td className="text-xs text-slate-500 dark:text-slate-400">{t.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-slate-100 dark:border-navy-800 px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                  Ranges are read-only here — they are configured under{' '}
                  <Link to="/admin/kpi" className="link">
                    KPI Configuration
                  </Link>
                  . A failed critical question forces a Critical rating regardless of the numeric score.
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* ── New template modal ── */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New audit template"
        description="The template is created as a Draft with no sections. Add sections and questions, then activate it."
        size="md"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" form="template-form" className="btn-primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create template'}
            </button>
          </>
        }
      >
        <form id="template-form" onSubmit={submitCreateTemplate} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Template name" required className="sm:col-span-2" htmlFor="new-tpl-name">
              <Input id="new-tpl-name" value={templateForm.name} onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. F&B Dine-in Experience" autoComplete="off" />
            </Field>
            <Field label="Code" required htmlFor="new-tpl-code" hint="Unique, uppercase">
              <Input id="new-tpl-code" value={templateForm.code} onChange={(e) => setTemplateForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="FB-DINE-2" className="font-mono" autoComplete="off" />
            </Field>
          </div>
          <Field label="Description" htmlFor="new-tpl-desc">
            <Textarea id="new-tpl-desc" value={templateForm.description} onChange={(e) => setTemplateForm((f) => ({ ...f, description: e.target.value }))} placeholder="What journey does this questionnaire cover?" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Segment" htmlFor="new-tpl-segment">
              <Select id="new-tpl-segment" value={templateForm.segment} onChange={(e) => setTemplateForm((f) => ({ ...f, segment: e.target.value as AuditTemplate['segment'] }))}>
                <option value="F&B">F&amp;B</option>
                <option value="Entertainment">Entertainment</option>
                <option value="Both">Both</option>
              </Select>
            </Field>
            <Field label="Customer journey" htmlFor="new-tpl-journey">
              <Select id="new-tpl-journey" value={templateForm.journey} onChange={(e) => setTemplateForm((f) => ({ ...f, journey: e.target.value as JourneyType }))}>
                {JOURNEYS.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Toggle checked={templateForm.isFollowUp} onChange={(v) => setTemplateForm((f) => ({ ...f, isFollowUp: v }))} label="Follow-up template" description="Shorter re-assessment used to verify corrective actions." />
        </form>
      </Modal>

      {/* ── Section modal ── */}
      <Modal
        open={sectionForm !== null}
        onClose={() => setSectionForm(null)}
        title={sectionForm?.id ? `Edit section ${sectionForm.code}` : 'Add section'}
        description="Sections group questions under one KPI category and can be limited to a segment."
        size="md"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setSectionForm(null)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" form="section-form" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : sectionForm?.id ? 'Save section' : 'Add section'}
            </button>
          </>
        }
      >
        {sectionForm && (
          <form id="section-form" onSubmit={submitSection} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <Field label="Code" required htmlFor="sec-code">
                <Input id="sec-code" value={sectionForm.code} onChange={(e) => setSectionForm((f) => (f ? { ...f, code: e.target.value.toUpperCase() } : f))} className="font-mono" autoComplete="off" />
              </Field>
              <Field label="Title" required className="sm:col-span-3" htmlFor="sec-title">
                <Input id="sec-title" value={sectionForm.title} onChange={(e) => setSectionForm((f) => (f ? { ...f, title: e.target.value } : f))} placeholder="e.g. Greeting & Customer Engagement" autoComplete="off" />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="KPI category" required htmlFor="sec-cat" hint="Determines which KPI weight the section feeds">
                <Select id="sec-cat" value={sectionForm.category} onChange={(e) => setSectionForm((f) => (f ? { ...f, category: e.target.value as CategoryKey } : f))}>
                  {CATEGORY_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {CATEGORY_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Applicable to" htmlFor="sec-applicable">
                <Select id="sec-applicable" value={sectionForm.applicableTo} onChange={(e) => setSectionForm((f) => (f ? { ...f, applicableTo: e.target.value as ApplicableChoice } : f))}>
                  <option value="all">All segments</option>
                  <option value="F&B">F&amp;B</option>
                  <option value="Entertainment">Entertainment</option>
                </Select>
              </Field>
            </div>
            <Field label="Description" htmlFor="sec-desc">
              <Textarea id="sec-desc" value={sectionForm.description} onChange={(e) => setSectionForm((f) => (f ? { ...f, description: e.target.value } : f))} placeholder="What does this section assess?" />
            </Field>
          </form>
        )}
      </Modal>

      {/* ── Question modal ── */}
      <Modal
        open={questionForm !== null}
        onClose={() => setQuestionForm(null)}
        title={questionForm?.id ? 'Edit question' : 'Add question'}
        description="Weight drives the section score. Critical questions force a Critical risk rating when failed."
        size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setQuestionForm(null)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" form="question-form" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : questionForm?.id ? 'Save question' : 'Add question'}
            </button>
          </>
        }
      >
        {questionForm && (
          <form id="question-form" onSubmit={submitQuestion} className="space-y-4" noValidate>
            <Field label="Question text" required htmlFor="q-text">
              <Textarea id="q-text" value={questionForm.text} onChange={(e) => setQuestionForm((f) => (f ? { ...f, text: e.target.value } : f))} placeholder="e.g. Was the guest acknowledged within 30 seconds of arrival?" />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Answer type" htmlFor="q-type">
                <Select id="q-type" value={questionForm.type} onChange={(e) => setQuestionForm((f) => (f ? { ...f, type: e.target.value as QuestionType } : f))}>
                  {QUESTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {QUESTION_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Weight" htmlFor="q-weight" hint="0–10 (0 = informational)">
                <Input id="q-weight" type="number" min={0} max={10} step={1} value={questionForm.weight} onChange={(e) => setQuestionForm((f) => (f ? { ...f, weight: e.target.value } : f))} />
              </Field>
              {(questionForm.type === 'time' || questionForm.type === 'numeric') && (
                <Field label={questionForm.type === 'time' ? 'Standard (minutes)' : 'Threshold'} htmlFor="q-threshold" hint="Above this the question starts to fail">
                  <Input id="q-threshold" type="number" min={0} step={1} value={questionForm.threshold} onChange={(e) => setQuestionForm((f) => (f ? { ...f, threshold: e.target.value } : f))} />
                </Field>
              )}
            </div>
            {questionForm.type === 'multiple_choice' && (
              <Field label="Options" required htmlFor="q-options" hint="Comma separated, ordered best → worst (the first option scores 100%)">
                <Textarea id="q-options" value={questionForm.options} onChange={(e) => setQuestionForm((f) => (f ? { ...f, options: e.target.value } : f))} placeholder="Resolved immediately with empathy, Resolved after escalation, Partially resolved, Not resolved" />
              </Field>
            )}
            <Field label="Shopper guidance" htmlFor="q-guidance" hint="Shown under the question during the visit">
              <Textarea id="q-guidance" value={questionForm.guidance} onChange={(e) => setQuestionForm((f) => (f ? { ...f, guidance: e.target.value } : f))} />
            </Field>
            <Divider />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Toggle checked={questionForm.critical} onChange={(v) => setQuestionForm((f) => (f ? { ...f, critical: v } : f))} label="Critical question" description="Failure forces Critical risk and raises an immediate alert." />
              <Toggle checked={questionForm.evidenceRequired} onChange={(v) => setQuestionForm((f) => (f ? { ...f, evidenceRequired: v } : f))} label="Evidence required" description="Shopper must attach a photo, receipt or document." />
              <Toggle checked={questionForm.commentRequired} onChange={(v) => setQuestionForm((f) => (f ? { ...f, commentRequired: v } : f))} label="Comment required" description="A written observation must accompany the answer." />
              <Toggle checked={questionForm.allowNA} onChange={(v) => setQuestionForm((f) => (f ? { ...f, allowNA: v } : f))} label="Allow N/A" description="Excluded from scoring when marked not applicable." />
            </div>
          </form>
        )}
      </Modal>

      {/* ── Preview modal ── */}
      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={selected ? `Preview — ${selected.name}` : 'Preview'}
        description="Read-only rendering of the questionnaire exactly as the mystery shopper will see it."
        size="lg"
        footer={
          <button type="button" className="btn-secondary" onClick={() => setPreviewOpen(false)}>
            Close preview
          </button>
        }
      >
        {selected && (
          <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 dark:border-navy-800 bg-slate-50 dark:bg-navy-800/40 px-4 py-3">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                {selected.name}
                <Badge tone="navy" size="xs">v{selected.version}</Badge>
                <StatusBadge status={selected.status} size="xs" />
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{selected.description}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {sections.length} sections · {summary.questions} questions · {selected.journey}
              </p>
            </div>
            {sections.length === 0 && <EmptyState title="Nothing to preview" message="This template has no sections yet." icon={Layers} />}
            {sections.map((s, si) => {
              const qs = questionsBySection.get(s.id) ?? []
              return (
                <section key={s.id} className="space-y-3">
                  <header className="border-b border-slate-200 dark:border-navy-800 pb-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {si + 1}. {s.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{s.description}</p>
                  </header>
                  {qs.length === 0 && <p className="text-xs text-slate-500 dark:text-slate-400">No questions in this section.</p>}
                  {qs.map((q) => (
                    <div key={q.id} className="rounded-lg border border-slate-200 dark:border-navy-800 px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm text-slate-800 dark:text-slate-100">
                          <span className="mr-2 font-mono text-[11px] text-slate-400">{q.code}</span>
                          {q.text}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {q.critical && <Badge tone="red" icon={AlertOctagon} size="xs">Critical</Badge>}
                          {q.evidenceRequired && <Badge tone="teal" size="xs">Evidence</Badge>}
                          {q.commentRequired && <Badge tone="amber" size="xs">Comment</Badge>}
                        </div>
                      </div>
                      {q.guidance && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{q.guidance}</p>}
                      <div className="mt-2.5">
                        <PreviewControl q={q} />
                      </div>
                      {q.commentRequired && <Textarea disabled className="mt-2 max-w-xl" placeholder="Comment (required)…" aria-label={`Comment for ${q.code}`} />}
                      {q.allowNA && (
                        <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                          <input type="checkbox" disabled className="h-3.5 w-3.5 rounded border-slate-300 dark:border-navy-600 dark:bg-navy-800" /> Not applicable
                        </label>
                      )}
                    </div>
                  ))}
                </section>
              )
            })}
          </div>
        )}
      </Modal>

      {/* ── Confirmations ── */}
      <ConfirmDialog
        open={confirmSection !== null}
        title="Delete section"
        message={
          <>
            Section <strong>{confirmSection?.code}</strong> — {confirmSection?.title} and its{' '}
            {confirmSection ? (questionsBySection.get(confirmSection.id) ?? []).length : 0} question(s) will be permanently removed from this template. Completed visits keep their historic answers.
          </>
        }
        confirmLabel="Delete section"
        tone="danger"
        busy={busy}
        onConfirm={removeSection}
        onCancel={() => setConfirmSection(null)}
      />

      <ConfirmDialog
        open={confirmQuestion !== null}
        title="Delete question"
        message={
          <>
            Question <strong>{confirmQuestion?.code}</strong> — “{confirmQuestion ? truncate(confirmQuestion.text, 90) : ''}” will be removed from this template.
          </>
        }
        confirmLabel="Delete question"
        tone="danger"
        busy={busy}
        onConfirm={removeQuestion}
        onCancel={() => setConfirmQuestion(null)}
      />

      <p className="sr-only" aria-live="polite">
        {selected ? `${selected.name} loaded with ${sections.length} sections as at ${fmtDateTime(now)}` : 'No template selected'}
      </p>
    </div>
  )
}
