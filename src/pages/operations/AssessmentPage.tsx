import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AlertOctagon, AlertTriangle, Camera, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Info, Lock, MessageSquare, Save, Send, Video, X } from 'lucide-react'
import { useData } from '@/contexts/DataContext'
import { useAuth } from '@/contexts/AuthContext'
import { useDocumentTitle, useNow } from '@/hooks'
import { Badge, SegmentBadge, StatusBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Form'
import { ProgressBar } from '@/components/ui/Misc'
import { EmptyState } from '@/components/ui/States'
import { EvidenceVisual } from '@/components/ui/EvidenceThumb'
import { addEvidence, getVisitQuestions, getVisitSections, saveDraft, startVisit, submitVisit } from '@/services/actions'
import { computeVisitScores, isQuestionAnswered, scoreQuestion } from '@/utils/scoring'
import { fmtDateTime } from '@/utils/format'
import type { AnswerValue, Question, VisitAnswer } from '@/types'
import { cn } from '@/utils/cn'

const TYPE_LABEL: Record<Question['type'], string> = {
  yes_no: 'Yes / No',
  rating_5: '1–5 rating',
  rating_10: '1–10 rating',
  pass_fail: 'Pass / Fail',
  multiple_choice: 'Multiple choice',
  text: 'Comment',
  numeric: 'Numeric',
  time: 'Time (minutes)',
  photo: 'Photo required',
  video: 'Video required',
}

export default function AssessmentPage() {
  const { id } = useParams()
  const { data, dispatch, uploadEvidence } = useData()
  const { user, role } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const visit = useMemo(() => data.visits.find((v) => v.id === id), [data.visits, id])
  const outlet = useMemo(() => data.outlets.find((o) => o.id === visit?.outletId), [data.outlets, visit])
  useDocumentTitle(visit ? `Assessment ${visit.code}` : 'Assessment')

  const sections = useMemo(() => (visit ? getVisitSections(data, visit) : []), [data, visit])
  const questions = useMemo(() => (visit ? getVisitQuestions(data, visit) : []), [data, visit])
  const questionsBySection = useMemo(() => {
    const m = new Map<string, Question[]>()
    for (const q of questions) m.set(q.sectionId, [...(m.get(q.sectionId) ?? []), q])
    return m
  }, [questions])

  const [answers, setAnswers] = useState<Record<string, VisitAnswer>>({})
  const [step, setStep] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [validation, setValidation] = useState<{ open: boolean; issues: { q: Question; reason: string }[] }>({ open: false, issues: [] })
  const [submitOpen, setSubmitOpen] = useState(false)
  const [narrative, setNarrative] = useState('')
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const initialised = useRef<string | null>(null)

  useEffect(() => {
    if (!visit || initialised.current === visit.id) return
    const existing = data.answers.filter((a) => a.visitId === visit.id)
    setAnswers(Object.fromEntries(existing.map((a) => [a.questionId, a])))
    setNarrative(visit.narrative ?? '')
    initialised.current = visit.id
  }, [visit, data.answers])

  const locked = !!visit && (visit.status === 'Approved' || visit.status === 'Closed' || visit.status === 'Submitted' || visit.status === 'Under Review')
  const ownVisit = !!visit && (role !== 'shopper' || visit.shopperId === user?.shopperId)

  const answerList = useMemo(() => Object.values(answers), [answers])
  const result = useMemo(() => computeVisitScores(questions, sections, answerList, data.kpiConfig, data.thresholds), [questions, sections, answerList, data.kpiConfig, data.thresholds])

  const setAnswer = useCallback(
    (q: Question, patch: Partial<VisitAnswer>) => {
      if (locked || !visit) return
      setAnswers((prev) => {
        const cur = prev[q.id] ?? { id: `${visit.id}-${q.id}`, visitId: visit.id, questionId: q.id, value: null, na: false, comment: '', evidenceIds: [], score: null }
        const next = { ...cur, ...patch }
        next.score = scoreQuestion(q, next.value, next.na)
        return { ...prev, [q.id]: next }
      })
      setDirty(true)
    },
    [locked, visit],
  )

  const persistDraft = async (silent = false) => {
    if (!visit) return
    setSaving(true)
    try {
      if (visit.status === 'Assigned' || visit.status === 'Planned') await dispatch((d, ctx) => startVisit(d, ctx, visit.id))
      await dispatch((d, ctx) => saveDraft(d, ctx, visit.id, Object.values(answers)))
      setDirty(false)
      if (!silent) toast.success('Draft saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save draft')
    } finally {
      setSaving(false)
    }
  }

  const validate = () => {
    const issues: { q: Question; reason: string }[] = []
    for (const q of questions) {
      const a = answers[q.id]
      const scorable = q.weight > 0 && q.type !== 'text' && q.type !== 'photo' && q.type !== 'video'
      if (a?.na && q.allowNA) continue
      if (scorable && !isQuestionAnswered(q, a)) issues.push({ q, reason: 'Answer required' })
      if ((q.type === 'photo' || q.type === 'video') && !(a?.evidenceIds.length)) issues.push({ q, reason: `${q.type === 'photo' ? 'Photo' : 'Video'} evidence required` })
      if (q.evidenceRequired && q.type !== 'photo' && q.type !== 'video' && a && a.score !== null && a.score < 0.5 && !a.evidenceIds.length) issues.push({ q, reason: 'Evidence required for a failed standard' })
      if (q.commentRequired && isQuestionAnswered(q, a) && !(a?.comment?.trim())) issues.push({ q, reason: 'Comment required' })
      if (q.critical && a && a.score !== null && a.score < 0.5 && !(a.comment?.trim())) issues.push({ q, reason: 'Critical failure must be described' })
    }
    return issues
  }

  const onSubmitClick = () => {
    const issues = validate()
    if (issues.length) {
      setValidation({ open: true, issues })
      return
    }
    setSubmitOpen(true)
  }

  const doSubmit = async () => {
    if (!visit) return
    setSaving(true)
    try {
      await dispatch((d, ctx) => submitVisit(d, ctx, visit.id, Object.values(answers), narrative.trim() || 'No narrative provided.'))
      toast.success('Assessment submitted for review')
      setSubmitOpen(false)
      navigate(`/operations/visits/${visit.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submission failed')
    } finally {
      setSaving(false)
    }
  }

  const attachEvidence = async (q: Question, file: File | null) => {
    if (!visit || !outlet || !user) return
    setUploadingFor(q.id)
    try {
      const sec = sections.find((s) => s.id === q.sectionId)!
      const ev = await uploadEvidence(file, { visitId: visit.id, outletId: outlet.id, category: sec.category, questionId: q.id, type: q.type === 'video' ? 'Video' : sec.code === 'G' ? 'Screenshot' : 'Photo', title: q.text.replace(/\?$/, '').slice(0, 60), description: `Captured during ${visit.type} for question ${q.code}`, uploadedBy: user.name })
      const cur = answers[q.id] ?? { id: `${visit.id}-${q.id}`, visitId: visit.id, questionId: q.id, value: null, na: false, comment: '', evidenceIds: [], score: null }
      const nextAnswer: VisitAnswer = { ...cur, evidenceIds: [...cur.evidenceIds, ev.id] }
      const nextAnswers = { ...answers, [q.id]: nextAnswer }
      setAnswers(nextAnswers)
      await dispatch((d, ctx) => addEvidence(d, ctx, ev, { visitId: visit.id, questionId: q.id, answers: Object.values(nextAnswers) }))
      toast.success(`${ev.type} attached`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploadingFor(null)
    }
  }

  if (!visit || !outlet) return <EmptyState title="Visit not found" action={<Link to="/operations/visits" className="btn-secondary">Back to visits</Link>} />
  if (!ownVisit) return <EmptyState title="Not your assignment" message="You can only complete visits assigned to you." action={<Link to="/operations/visits" className="btn-secondary">Back to visits</Link>} />

  const section = sections[step]
  const sectionQuestions = section ? (questionsBySection.get(section.id) ?? []) : []
  const sectionAnswered = sectionQuestions.filter((q) => isQuestionAnswered(q, answers[q.id])).length
  const template = data.templates.find((t) => t.id === visit.templateId)

  return (
    <div className="mx-auto max-w-3xl pb-28">
      {/* Header */}
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">{visit.type} · {template?.name}</p>
            <h1 className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-white leading-tight">{outlet.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono">{visit.code}</span> · <SegmentBadge segment={outlet.segment} size="xs" /> {outlet.subcategory} · {visit.journey}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={visit.status} />
            <span className="text-[11px] text-slate-500 flex items-center gap-1"><Clock className="h-3 w-3" /> {visit.visitStart ? `Started ${fmtDateTime(visit.visitStart)}` : `Scheduled ${visit.scheduledDate}`}</span>
            {visit.submissionDeadline && <span className="text-[11px] text-slate-500">Submission due {fmtDateTime(visit.submissionDeadline)}</span>}
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Assessment progress · {result.answeredMandatory}/{result.totalMandatory} mandatory questions</span>
            <span className="font-semibold text-slate-700 dark:text-slate-200">{result.progress}%</span>
          </div>
          <ProgressBar value={result.progress} tone="accent" />
        </div>
        {locked && (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-navy-800 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
            <Lock className="h-3.5 w-3.5" /> This assessment has been {visit.status === 'Approved' || visit.status === 'Closed' ? 'approved and can no longer be modified' : 'submitted and is awaiting review'}.
            {visit.score !== null && role !== 'shopper' && <Link to={`/reports/visits/${visit.id}`} className="link ml-auto">Open report</Link>}
          </p>
        )}
        {visit.status === 'Rejected' && visit.reviewerComment && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> Returned by reviewer: {visit.reviewerComment}
          </p>
        )}
      </div>

      {/* Section stepper */}
      <nav aria-label="Sections" className="mt-4 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {sections.map((s, i) => {
          const qs = questionsBySection.get(s.id) ?? []
          const done = qs.filter((q) => isQuestionAnswered(q, answers[q.id])).length
          const complete = qs.length > 0 && done === qs.length
          return (
            <button key={s.id} type="button" onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined} className={cn('flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors', i === step ? 'border-navy-800 bg-navy-800 text-white dark:border-teal-500 dark:bg-teal-600' : complete ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-slate-300 bg-white text-slate-600 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-300')}>
              <span className="font-semibold">{s.code}</span>
              <span className="hidden sm:inline">{s.title}</span>
              {complete && <Check className="h-3 w-3" aria-hidden />}
              <span className="opacity-70">{done}/{qs.length}</span>
            </button>
          )
        })}
      </nav>

      {/* Section */}
      {section && (
        <section className="mt-4" aria-labelledby="section-title">
          <div className="mb-3">
            <h2 id="section-title" className="text-base font-semibold text-slate-900 dark:text-white">
              Section {section.code} · {section.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{section.description} · {sectionAnswered}/{sectionQuestions.length} answered</p>
          </div>
          <ol className="space-y-3">
            {sectionQuestions.map((q, qi) => (
              <QuestionCard key={q.id} index={qi + 1} q={q} answer={answers[q.id]} locked={locked} onChange={(patch) => setAnswer(q, patch)} onAttach={(file) => void attachEvidence(q, file)} uploading={uploadingFor === q.id} evidence={data.evidence.filter((e) => answers[q.id]?.evidenceIds.includes(e.id))} />
            ))}
          </ol>
        </section>
      )}

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-navy-800 dark:bg-navy-900/95 no-print lg:left-64">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <button type="button" className="btn-secondary" aria-label="Previous section" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Previous</span>
          </button>
          {!locked && (
            <button type="button" className="btn-secondary" aria-label={saving ? 'Saving draft' : 'Save draft'} onClick={() => void persistDraft()} disabled={saving}>
              <Save className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">{saving ? 'Saving…' : 'Save Draft'}</span>
              {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="Unsaved changes" />}
            </button>
          )}
          <span className="ml-auto text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
            Section {step + 1} of {sections.length}
            {role !== 'shopper' && result.overall !== null && <span className="ml-2 font-semibold text-slate-700 dark:text-slate-200">· Live score {result.overall.toFixed(1)}%</span>}
            {result.criticalFailures.length > 0 && <span className="ml-2 inline-flex items-center gap-1 font-semibold text-red-600"><AlertOctagon className="h-3 w-3" /> {result.criticalFailures.length} critical</span>}
          </span>
          {step < sections.length - 1 ? (
            <button type="button" className="btn-primary" onClick={() => setStep((s) => Math.min(sections.length - 1, s + 1))}>
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            !locked && (
              <button type="button" className="btn-accent" onClick={onSubmitClick} disabled={saving}>
                <Send className="h-4 w-4" /> Submit Visit
              </button>
            )
          )}
        </div>
      </div>

      {/* Validation modal */}
      <Modal open={validation.open} onClose={() => setValidation({ open: false, issues: [] })} title="Assessment incomplete" description={`${validation.issues.length} item${validation.issues.length === 1 ? '' : 's'} must be resolved before submission`} size="md" footer={<button type="button" className="btn-primary" onClick={() => setValidation({ open: false, issues: [] })}>Review answers</button>}>
        <ul className="space-y-2">
          {validation.issues.map(({ q, reason }) => (
            <li key={`${q.id}-${reason}`}>
              <button
                type="button"
                className="flex w-full items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10"
                onClick={() => {
                  setStep(sections.findIndex((s) => s.id === q.sectionId))
                  setValidation({ open: false, issues: [] })
                  setTimeout(() => document.getElementById(`q-${q.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
                }}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  <span className="font-medium text-slate-800 dark:text-slate-100">{q.code} · {q.text}</span>
                  <span className="block text-xs text-amber-800 dark:text-amber-300">{reason}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      {/* Submit modal */}
      <Modal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title="Submit assessment"
        description="Add your shopper narrative. The visit end time and submission timestamp are recorded automatically."
        size="md"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setSubmitOpen(false)} disabled={saving}>Cancel</button>
            <button type="button" className="btn-accent" onClick={() => void doSubmit()} disabled={saving || narrative.trim().length < 40}>
              <Send className="h-4 w-4" /> {saving ? 'Submitting…' : 'Confirm submission'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-slate-50 dark:bg-navy-800 p-3"><p className="text-slate-500">Questions answered</p><p className="text-lg font-semibold">{result.answeredMandatory}/{result.totalMandatory}</p></div>
            <div className="rounded-lg bg-slate-50 dark:bg-navy-800 p-3"><p className="text-slate-500">Evidence attached</p><p className="text-lg font-semibold">{answerList.reduce((a, x) => a + x.evidenceIds.length, 0)}</p></div>
            <div className="rounded-lg bg-slate-50 dark:bg-navy-800 p-3"><p className="text-slate-500">Critical failures</p><p className={cn('text-lg font-semibold', result.criticalFailures.length ? 'text-red-600' : '')}>{result.criticalFailures.length}</p></div>
            <div className="rounded-lg bg-slate-50 dark:bg-navy-800 p-3"><p className="text-slate-500">Submission time</p><p className="text-sm font-semibold">{fmtDateTime(now)}</p></div>
          </div>
          <label className="label" htmlFor="narrative">Shopper narrative (minimum 40 characters)</label>
          <Textarea id="narrative" rows={6} value={narrative} onChange={(e) => setNarrative(e.target.value)} placeholder="Describe the journey chronologically: arrival, greeting, ordering, service, environment, departure. Mention timings and any notable positive or negative observations." />
          <p className="text-xs text-slate-500">{narrative.trim().length} characters</p>
          {result.criticalFailures.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300">
              <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" /> Submitting will raise {result.criticalFailures.length} critical finding{result.criticalFailures.length === 1 ? '' : 's'} and immediate alerts to management.
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}

function QuestionCard({ index, q, answer, locked, onChange, onAttach, uploading, evidence }: { index: number; q: Question; answer: VisitAnswer | undefined; locked: boolean; onChange: (patch: Partial<VisitAnswer>) => void; onAttach: (file: File | null) => void; uploading: boolean; evidence: { id: string; type: 'Photo' | 'Video' | 'Receipt' | 'Screenshot' | 'Document'; visualSeed: number; title: string }[] }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const value = answer?.value ?? null
  const na = answer?.na ?? false
  const score = answer?.score ?? null
  const failed = score !== null && score < 0.5
  const answered = isQuestionAnswered(q, answer)
  const disabled = locked || na

  const btn = (active: boolean, tone: 'good' | 'bad' | 'neutral' = 'neutral') =>
    cn(
      'min-h-[44px] flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50',
      active
        ? tone === 'good'
          ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200'
          : tone === 'bad'
            ? 'border-red-500 bg-red-50 text-red-800 dark:bg-red-500/15 dark:text-red-200'
            : 'border-navy-800 bg-navy-800 text-white dark:border-teal-500 dark:bg-teal-600'
        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-200',
    )

  const set = (v: AnswerValue) => onChange({ value: v })

  return (
    <li id={`q-${q.id}`} className={cn('card p-4 sm:p-5', q.critical && failed && 'border-red-300 dark:border-red-500/50', answered && !failed && 'border-l-4 border-l-emerald-400')}>
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-navy-800 dark:text-slate-300">{index}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900 dark:text-white leading-snug">{q.text}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="slate" size="xs">{TYPE_LABEL[q.type]}</Badge>
            <Badge tone="slate" size="xs">Weight {q.weight}</Badge>
            {q.critical && <Badge tone="red" size="xs" icon={AlertOctagon}>Critical</Badge>}
            {q.evidenceRequired && <Badge tone="blue" size="xs" icon={Camera}>Evidence required</Badge>}
            {q.commentRequired && <Badge tone="blue" size="xs" icon={MessageSquare}>Comment required</Badge>}
            {q.allowNA && !locked && (
              <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                <input type="checkbox" checked={na} onChange={(e) => onChange({ na: e.target.checked, value: e.target.checked ? null : value })} className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600" /> N/A
              </label>
            )}
          </div>
          {q.guidance && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {q.guidance}
            </p>
          )}

          <div className="mt-3">
            {q.type === 'yes_no' && (
              <div className="flex gap-2" role="group" aria-label={q.text}>
                <button type="button" disabled={disabled} onClick={() => set(true)} className={btn(value === true, 'good')} aria-pressed={value === true}><CheckCircle2 className="mr-1 inline h-4 w-4" />Yes</button>
                <button type="button" disabled={disabled} onClick={() => set(false)} className={btn(value === false, 'bad')} aria-pressed={value === false}><X className="mr-1 inline h-4 w-4" />No</button>
              </div>
            )}
            {q.type === 'pass_fail' && (
              <div className="flex gap-2" role="group" aria-label={q.text}>
                <button type="button" disabled={disabled} onClick={() => set(true)} className={btn(value === true, 'good')} aria-pressed={value === true}>Pass</button>
                <button type="button" disabled={disabled} onClick={() => set(false)} className={btn(value === false, 'bad')} aria-pressed={value === false}>Fail</button>
              </div>
            )}
            {(q.type === 'rating_5' || q.type === 'rating_10') && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={q.text}>
                {Array.from({ length: q.type === 'rating_5' ? 5 : 10 }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" disabled={disabled} onClick={() => set(n)} aria-pressed={value === n} className={cn('h-11 min-w-[44px] flex-1 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50', value === n ? 'border-navy-800 bg-navy-800 text-white dark:border-teal-500 dark:bg-teal-600' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-200')}>
                    {n}
                  </button>
                ))}
                <span className="basis-full text-[11px] text-slate-400 flex justify-between"><span>Poor</span><span>Excellent</span></span>
              </div>
            )}
            {q.type === 'multiple_choice' && (
              <div className="space-y-1.5" role="radiogroup" aria-label={q.text}>
                {(q.options ?? []).map((opt) => (
                  <label key={opt} className={cn('flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm', value === opt ? 'border-navy-800 bg-navy-50 dark:border-teal-500 dark:bg-teal-500/10' : 'border-slate-300 dark:border-navy-700', disabled && 'opacity-50 cursor-not-allowed')}>
                    <input type="radio" name={q.id} disabled={disabled} checked={value === opt} onChange={() => set(opt)} className="h-4 w-4 text-teal-600" />
                    <span className="text-slate-800 dark:text-slate-100">{opt}</span>
                  </label>
                ))}
              </div>
            )}
            {(q.type === 'time' || q.type === 'numeric') && (
              <div className="flex items-center gap-2">
                <input type="number" inputMode="decimal" min={0} step={0.5} disabled={disabled} value={value === null ? '' : String(value)} onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))} className="input !w-32 text-lg font-semibold tabular-nums" aria-label={`${q.text} value`} />
                <span className="text-sm text-slate-500">{q.type === 'time' ? 'minutes' : ''}</span>
                {q.threshold !== undefined && <span className={cn('ml-auto text-xs font-medium', failed ? 'text-red-600' : score === 1 ? 'text-emerald-600' : 'text-slate-500')}>Standard ≤ {q.threshold} min{typeof value === 'number' ? (value <= q.threshold ? ' · within standard' : ` · exceeded by ${(value - q.threshold).toFixed(1)}`) : ''}</span>}
              </div>
            )}
            {q.type === 'text' && <Textarea disabled={disabled} rows={3} value={typeof value === 'string' ? value : ''} onChange={(e) => set(e.target.value)} placeholder="Enter your observation…" />}
            {(q.type === 'photo' || q.type === 'video') && !locked && (
              <p className="text-xs text-slate-500">{q.type === 'photo' ? 'Capture or upload a photo' : 'Record or upload a short video'} using the button below.</p>
            )}
          </div>

          {/* Evidence + comment */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!locked && (
              <>
                <input ref={fileRef} type="file" accept={q.type === 'video' ? 'video/*' : 'image/*'} capture="environment" className="hidden" onChange={(e) => { onAttach(e.target.files?.[0] ?? null); e.target.value = '' }} />
                <button type="button" className="btn-secondary btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {q.type === 'video' ? <Video className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />} {uploading ? 'Attaching…' : q.type === 'video' ? 'Add video' : 'Add photo'}
                </button>
                <button type="button" className="btn-ghost btn-sm" disabled={uploading} onClick={() => onAttach(null)} title="Demo: attach a sample capture without a file">
                  Attach sample
                </button>
              </>
            )}
            {evidence.map((e) => (
              <span key={e.id} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-navy-700 p-0.5 pr-2 text-[11px] text-slate-600 dark:text-slate-300">
                <EvidenceVisual type={e.type} seed={e.visualSeed} className="h-7 w-10 rounded" />
                {e.type}
              </span>
            ))}
          </div>
          <div className="mt-3">
            <label className="label" htmlFor={`c-${q.id}`}>
              Comment {q.commentRequired && <span className="text-red-600">*</span>}
              {failed && !q.commentRequired && <span className="ml-1 text-amber-600">(recommended for a failed standard)</span>}
            </label>
            <Textarea id={`c-${q.id}`} rows={2} disabled={locked} value={answer?.comment ?? ''} onChange={(e) => onChange({ comment: e.target.value })} placeholder="Describe what you observed…" className="!min-h-[56px]" />
          </div>
        </div>
      </div>
    </li>
  )
}
