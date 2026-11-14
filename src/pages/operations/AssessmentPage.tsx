import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { AlertOctagon, AlertTriangle, Camera, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, ClipboardList, Info, Lock, MessageSquare, Save, Send, Target, Trash2, Upload, Video, X } from 'lucide-react'
import { useData } from '@/contexts/DataContext'
import { useAuth } from '@/contexts/AuthContext'
import { useDocumentTitle, useNow } from '@/hooks'
import { Badge, SegmentBadge, StatusBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Form'
import { ProgressBar } from '@/components/ui/Misc'
import { EmptyState } from '@/components/ui/States'
import { EvidencePreviewModal, EvidenceVisual } from '@/components/ui/EvidenceThumb'
import { addEvidence, getVisitQuestions, getVisitSections, removeEvidence, renameEvidence, saveDraft, startVisit, submitVisit } from '@/services/actions'
import { clockOrderProblem, computeVisitScores, deriveTimedAnswers, isQuestionAnswered, naAllowed, naNeedsReason, naSelectable, ratingScale, scoreQuestion, visibleQuestions } from '@/utils/scoring'
import { timingChainText } from '@/utils/sequence'
import { fmtDateTime } from '@/utils/format'
import type { AnswerValue, Evidence, Question, VisitAnswer } from '@/types'
import { cn } from '@/utils/cn'

/** Idle time before a draft saves itself. Short enough to survive a dropped page. */
const AUTOSAVE_MS = 2500

const TYPE_LABEL: Record<Question['type'], string> = {
  yes_no: 'Yes / No',
  rating_5: '1–5 rating',
  rating_10: '1–10 rating',
  pass_fail: 'Pass / Fail',
  multiple_choice: 'Multiple choice',
  // Not "Comment": every question already has a comment box, and a text question
  // whose own answer is the record ("Items ordered") read as if it were optional.
  text: 'Written answer',
  numeric: 'Numeric',
  time: 'Time (minutes)',
  clock: 'Clock time',
  photo: 'Photo required',
  video: 'Video required',
}

export default function AssessmentPage() {
  const { id } = useParams()
  const { data, dispatch, uploadEvidence, deleteEvidenceFile } = useData()
  const { user, role } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const visit = useMemo(() => data.visits.find((v) => v.id === id), [data.visits, id])
  const outlet = useMemo(() => data.outlets.find((o) => o.id === visit?.outletId), [data.outlets, visit])
  useDocumentTitle(visit ? `Assessment ${visit.code}` : 'Assessment')

  const sections = useMemo(() => (visit ? getVisitSections(data, visit) : []), [data, visit])
  const questions = useMemo(() => (visit ? getVisitQuestions(data, visit) : []), [data, visit])

  const [answers, setAnswers] = useState<Record<string, VisitAnswer>>({})
  const [step, setStep] = useState(0)
  // Moving to another section starts it at the top: the stepper and the stage
  // title, not wherever the last section's Next button happened to leave the page.
  const goToStep = (next: number) => {
    setStep(next)
    setTimeout(() => document.getElementById('assessment-sections')?.scrollIntoView({ block: 'start' }), 0)
  }
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [validation, setValidation] = useState<{ open: boolean; issues: { q: Question; reason: string }[] }>({ open: false, issues: [] })
  const [submitOpen, setSubmitOpen] = useState(false)
  const [narrative, setNarrative] = useState('')
  const [occupancy, setOccupancy] = useState<string>('')
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [uploadNote, setUploadNote] = useState<string | null>(null)
  const [briefingOpen, setBriefingOpen] = useState(false)
  const initialised = useRef<string | null>(null)

  const scenario = useMemo(() => (visit?.scenarioId ? data.scenarios.find((s) => s.id === visit.scenarioId) ?? null : null), [data.scenarios, visit])

  useEffect(() => {
    if (!visit || initialised.current === visit.id) return
    const existing = data.answers.filter((a) => a.visitId === visit.id)
    setAnswers(Object.fromEntries(existing.map((a) => [a.questionId, a])))
    setNarrative(visit.narrative ?? '')
    setOccupancy(visit.occupancy === null || visit.occupancy === undefined ? '' : String(visit.occupancy))
    setBriefingOpen(visit.status === 'Assigned' || visit.status === 'In Progress')
    initialised.current = visit.id
  }, [visit, data.answers])

  const locked = !!visit && (visit.status === 'Approved' || visit.status === 'Closed' || visit.status === 'Submitted' || visit.status === 'Under Review')
  const ownVisit = !!visit && (role !== 'shopper' || visit.shopperId === user?.shopperId)

  const answerList = useMemo(() => Object.values(answers), [answers])
  // Gated questions appear only once their parent has the gating answer, so the
  // stepper, the validation and the live score all see the same questionnaire.
  const visible = useMemo(() => visibleQuestions(questions, answerList), [questions, answerList])
  /** Calculated durations whose two clock times are in an impossible order. */
  const clockProblems = useMemo(() => {
    const out: Record<string, string> = {}
    for (const q of visible) {
      const p = clockOrderProblem(q, questions, answerList)
      if (p) out[q.id] = p
    }
    return out
  }, [visible, questions, answerList])
  const questionsBySection = useMemo(() => {
    const m = new Map<string, Question[]>()
    for (const q of visible) m.set(q.sectionId, [...(m.get(q.sectionId) ?? []), q])
    return m
  }, [visible])
  const result = useMemo(() => computeVisitScores(questions, sections, answerList, data.kpiConfig, data.thresholds), [questions, sections, answerList, data.kpiConfig, data.thresholds])

  const setAnswer = useCallback(
    (q: Question, patch: Partial<VisitAnswer>) => {
      if (locked || !visit) return
      setAnswers((prev) => {
        const cur = prev[q.id] ?? { id: `${visit.id}-${q.id}`, visitId: visit.id, questionId: q.id, value: null, na: false, comment: '', evidenceIds: [], score: null }
        const next = { ...cur, ...patch }
        next.score = scoreQuestion(q, next.value, next.na)
        const merged = { ...prev, [q.id]: next }
        // A clock stamp is only ever raw material: entering one settles every
        // duration measured from or to it, so the shopper never types a minute.
        if (q.type === 'clock') {
          for (const d of deriveTimedAnswers(questions, Object.values(merged), visit.id)) merged[d.questionId] = d
        }
        return merged
      })
      setDirty(true)
    },
    [locked, visit, questions],
  )

  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const persistDraft = async (silent = false) => {
    if (!visit) return
    setSaving(true)
    try {
      if (visit.status === 'Assigned' || visit.status === 'Planned') await dispatch((d, ctx) => startVisit(d, ctx, visit.id))
      await dispatch((d, ctx) => saveDraft(d, ctx, visit.id, Object.values(answers), { log: !silent }))
      setDirty(false)
      setSavedAt(new Date())
      if (!silent) toast.success('Draft saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save draft')
    } finally {
      setSaving(false)
    }
  }

  const removeAttachment = async (evidenceId: string) => {
    try {
      // The file first: if that fails the record stays, pointing at something real,
      // rather than leaving an orphaned photograph nobody can see or remove.
      await deleteEvidenceFile(evidenceId)
      await dispatch((d, ctx) => removeEvidence(d, ctx, evidenceId))
      setAnswers((prev) => {
        const next: Record<string, VisitAnswer> = {}
        for (const [qid, a] of Object.entries(prev)) next[qid] = a.evidenceIds.includes(evidenceId) ? { ...a, evidenceIds: a.evidenceIds.filter((x) => x !== evidenceId) } : a
        return next
      })
      toast.success('Photo deleted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the photo')
    }
  }

  const renameAttachment = async (evidenceId: string, title: string) => {
    try {
      await dispatch((d, ctx) => renameEvidence(d, ctx, evidenceId, title))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not rename the photo')
    }
  }

  /**
   * Autosave, and a warning before the tab closes with work in it.
   *
   * persistDraft has carried a `silent` flag since it was written, but nothing
   * ever passed it: a draft was only ever written when the shopper pressed Save
   * Draft. Answers live in React state until then, so closing the tab, following
   * a link or letting a phone drop the page discarded them — and the only hint
   * anything was unsaved was a six-pixel amber dot on the button. A shopper
   * filling in 150 to 260 questions over a two-hour meal cannot be asked to
   * remember a button.
   *
   * The ref keeps the timer pointed at the current answers without making the
   * effect depend on a function that is rebuilt on every render.
   */
  const draftRef = useRef(persistDraft)
  // Updated after each render rather than during it, so the timer always calls the
  // latest closure (and its latest answers) without the effect depending on it.
  useEffect(() => {
    draftRef.current = persistDraft
  })
  useEffect(() => {
    if (!dirty || locked || !ownVisit || !visit) return
    const t = setTimeout(() => void draftRef.current(true), AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [dirty, locked, ownVisit, visit, answers])

  useEffect(() => {
    if (!dirty) return
    // preventDefault is what asks the browser to confirm; the message is the
    // browser's own and cannot be set.
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const validate = () => {
    const issues: { q: Question; reason: string }[] = []
    for (const q of visible) {
      const a = answers[q.id]
      const scorable = q.weight > 0 && q.type !== 'text' && q.type !== 'photo' && q.type !== 'video'
      if (a?.na && naAllowed(q)) {
        if (naNeedsReason(q) && !(a.comment?.trim())) issues.push({ q, reason: 'Say in the comment why this is N/A' })
        continue
      }
      if ((scorable || q.required) && !isQuestionAnswered(q, a)) issues.push({ q, reason: clockProblems[q.id] ?? (q.derivedFrom ? 'Record both clock times this duration is measured between' : 'Answer required') })
      if ((q.type === 'photo' || q.type === 'video') && !(a?.evidenceIds.length)) issues.push({ q, reason: `${q.type === 'photo' ? 'Photo' : 'Video'} evidence required` })
      if (q.evidenceRequired && q.type !== 'photo' && q.type !== 'video' && a && a.score !== null && a.score < 0.5 && !a.evidenceIds.length) issues.push({ q, reason: 'Evidence required for a failed standard' })
      if (q.commentRequired && isQuestionAnswered(q, a) && !(a?.comment?.trim())) issues.push({ q, reason: 'Comment required' })
      // The brief's rule: a No, a Fail or a bottom-half rating has to be explained.
      if (q.commentOnFail && a && a.score !== null && a.score < 0.5 && !(a.comment?.trim())) issues.push({ q, reason: 'This answer falls below standard and must be explained' })
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
      const occ = occupancy.trim() === '' ? null : Math.max(0, Math.min(100, Math.round(Number(occupancy))))
      await dispatch((d, ctx) =>
        submitVisit(d, ctx, visit.id, Object.values(answers), narrative.trim() || 'No narrative provided.', {
          occupancy: Number.isFinite(occ as number) ? occ : null,
        }),
      )
      toast.success('Assessment submitted for review')
      setSubmitOpen(false)
      navigate(`/operations/visits/${visit.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submission failed')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Attach one or more files to a question. Several photos can be picked at once
   * from the gallery; they upload one after another and each is saved as soon as
   * it lands, so a failure part-way loses nothing already attached. The answer is
   * carried forward between files: reading `answers` again would start every file
   * from the same stale copy and keep only the last one.
   */
  const attachEvidence = async (q: Question, files: (File | null)[]) => {
    if (!visit || !outlet || !user || !files.length) return
    setUploadingFor(q.id)
    const sec = sections.find((s) => s.id === q.sectionId)!
    let current = { ...answers }
    let attached = 0
    const failed: string[] = []
    try {
      for (const [i, file] of files.entries()) {
        if (files.length > 1) setUploadNote(`${i + 1} of ${files.length}`)
        try {
          const ev = await uploadEvidence(file, { visitId: visit.id, outletId: outlet.id, category: sec.category, questionId: q.id, type: q.type === 'video' ? 'Video' : sec.code === 'G' ? 'Screenshot' : 'Photo', title: q.text.replace(/\?$/, '').slice(0, 60), description: `Captured during ${visit.type} for question ${q.code}`, uploadedBy: user.name })
          const cur = current[q.id] ?? { id: `${visit.id}-${q.id}`, visitId: visit.id, questionId: q.id, value: null, na: false, comment: '', evidenceIds: [], score: null }
          current = { ...current, [q.id]: { ...cur, evidenceIds: [...cur.evidenceIds, ev.id] } }
          setAnswers(current)
          const snapshot = Object.values(current)
          await dispatch((d, ctx) => addEvidence(d, ctx, ev, { visitId: visit.id, questionId: q.id, answers: snapshot }))
          attached++
          // A proof photo should carry the camera's own date and time; tell the shopper now, not the reviewer later.
          if (sec.code === 'PRF' && q.type === 'photo' && !q.allowNA && !ev.photoTakenAt) {
            toast(`${file?.name ?? 'This photo'} has no camera date and time inside it, so the reviewer cannot confirm when it was taken. Use Take photo, or upload the original from the camera roll, not a screenshot or a forwarded copy.`, { icon: '⚠️', duration: 9000 })
          }
        } catch (e) {
          failed.push(`${file?.name ?? 'File'}: ${e instanceof Error ? e.message : 'upload failed'}`)
        }
      }
      if (attached) toast.success(attached === 1 ? `${q.type === 'video' ? 'Video' : 'Photo'} attached` : `${attached} ${q.type === 'video' ? 'videos' : 'photos'} attached`)
      for (const f of failed) toast.error(f)
    } finally {
      setUploadingFor(null)
      setUploadNote(null)
    }
  }

  if (!visit || !outlet) return <EmptyState title="Visit not found" action={<Link to="/operations/visits" className="btn-secondary">Back to visits</Link>} />
  if (!ownVisit) return <EmptyState title="Not your assignment" message="You can only complete visits assigned to you." action={<Link to="/operations/visits" className="btn-secondary">Back to visits</Link>} />

  const section = sections[step]
  const sectionQuestions = section ? (questionsBySection.get(section.id) ?? []) : []
  const sectionAnswered = sectionQuestions.filter((q) => isQuestionAnswered(q, answers[q.id])).length
  const template = data.templates.find((t) => t.id === visit.templateId)
  const timingSummary = timingChainText(template?.sequence?.timingChain, result.kpiScores)

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
        {(visit.status === 'Draft' || visit.status === 'In Progress') && visit.approvalHistory.at(-1)?.action === 'Reopened' && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> Reopened by {visit.approvalHistory.at(-1)!.by} for changes: {visit.approvalHistory.at(-1)!.comment}
          </p>
        )}
        {visit.status === 'Rejected' && visit.reviewerComment && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> Returned by reviewer: {visit.reviewerComment}
          </p>
        )}
      </div>

      {/* Scenario briefing */}
      {scenario && (
        <section className="card mt-4 overflow-hidden" aria-labelledby="scenario-briefing-title">
          <h2 id="scenario-briefing-title" className="sr-only">Scenario briefing</h2>
          <button
            type="button"
            onClick={() => setBriefingOpen((o) => !o)}
            aria-expanded={briefingOpen}
            aria-controls="scenario-briefing-body"
            className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-navy-800/60 sm:p-5"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
              <ClipboardList className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">Scenario briefing</span>
              <span className="mt-0.5 block text-sm font-semibold text-slate-900 dark:text-white leading-snug">{scenario.name}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge tone="teal" size="xs">{scenario.type}</Badge>
                <Badge tone="slate" size="xs" className="font-mono">{scenario.code}</Badge>
              </span>
            </span>
            <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform', briefingOpen && 'rotate-180')} aria-hidden />
          </button>
          <div id="scenario-briefing-body" hidden={!briefingOpen} className="border-t border-slate-200 px-4 py-4 dark:border-navy-800 sm:px-5">
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{scenario.description}</p>
            <p className="section-title mt-4 mb-2">Your instructions</p>
            <ol className="space-y-2">
              {scenario.instructions.map((ins, i) => (
                <li key={ins} className="flex gap-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-800 text-[10px] font-semibold text-white dark:bg-teal-600">{i + 1}</span>
                  <span className="min-w-0">{ins}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50/70 p-3 dark:border-teal-500/30 dark:bg-teal-500/10">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-teal-800 dark:text-teal-300">
                <Target className="h-3.5 w-3.5" aria-hidden /> What good looks like
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{scenario.expectedOutcome}</p>
            </div>
          </div>
        </section>
      )}

      {/* Section stepper */}
      <nav id="assessment-sections" aria-label="Sections" className="mt-4 scroll-mt-20 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {sections.map((s, i) => {
          const qs = questionsBySection.get(s.id) ?? []
          const done = qs.filter((q) => isQuestionAnswered(q, answers[q.id])).length
          const complete = qs.length > 0 && done === qs.length
          return (
            <button key={s.id} type="button" onClick={() => goToStep(i)} aria-current={i === step ? 'step' : undefined} className={cn('flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors', i === step ? 'border-navy-800 bg-navy-800 text-white dark:border-teal-500 dark:bg-teal-600' : complete ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-slate-300 bg-white text-slate-600 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-300')}>
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
            <h2 id="section-title" className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
              {section.stageWeight !== undefined ? `Stage ${step + 1} · ${section.title}` : `Section ${section.code} · ${section.title}`}
              {section.stageWeight !== undefined && (
                <Badge tone={section.stageWeight === 0 ? 'slate' : 'teal'} size="xs">
                  {section.stageWeight === 0 ? 'unweighted' : `weight ${section.stageWeight}%`}
                </Badge>
              )}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{section.description} · {sectionAnswered}/{sectionQuestions.length} answered</p>
          </div>
          <ol className="space-y-3">
            {sectionQuestions.map((q, qi) => (
              <QuestionCard key={q.id} index={qi + 1} q={q} answer={answers[q.id]} clockProblem={clockProblems[q.id]} locked={locked} onChange={(patch) => setAnswer(q, patch)} onAttach={(files) => void attachEvidence(q, files)} uploading={uploadingFor === q.id} uploadNote={uploadingFor === q.id ? uploadNote : null} evidence={data.evidence.filter((e) => answers[q.id]?.evidenceIds.includes(e.id))} onRename={(id, title) => void renameAttachment(id, title)} onDelete={(id) => void removeAttachment(id)} />
            ))}
          </ol>
        </section>
      )}

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-navy-800 dark:bg-navy-900/95 no-print lg:left-64">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <button type="button" className="btn-secondary" aria-label="Previous section" onClick={() => goToStep(Math.max(0, step - 1))} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Previous</span>
          </button>
          {!locked && (
            <button type="button" className="btn-secondary" aria-label={saving ? 'Saving draft' : 'Save draft'} onClick={() => void persistDraft()} disabled={saving}>
              <Save className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">{saving ? 'Saving…' : 'Save Draft'}</span>
              {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="Unsaved changes" />}
            </button>
          )}
          {/* Say it in words. The dot alone left a shopper unable to tell whether
              two hours of answers were safely written down. */}
          {!locked && (
            <span className={cn('text-xs font-medium whitespace-nowrap', saving ? 'text-slate-500' : dirty ? 'text-amber-600' : 'text-emerald-600')} aria-live="polite">
              {saving ? 'Saving…' : dirty ? 'Unsaved' : savedAt ? `Saved ${format(savedAt, 'HH:mm')}` : 'Saved'}
            </span>
          )}
          <span className="ml-auto text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
            Section {step + 1} of {sections.length}
            {role !== 'shopper' && result.overall !== null && <span className="ml-2 font-semibold text-slate-700 dark:text-slate-200">· Live score {result.overall.toFixed(1)}%</span>}
            {timingSummary && <span className="ml-2 inline-flex items-center gap-1 tabular-nums"><Clock className="h-3 w-3" aria-hidden /> {timingSummary}</span>}
            {result.criticalFailures.length > 0 && <span className="ml-2 inline-flex items-center gap-1 font-semibold text-red-600"><AlertOctagon className="h-3 w-3" /> {result.criticalFailures.length} critical</span>}
          </span>
          {step < sections.length - 1 ? (
            <button type="button" className="btn-primary" onClick={() => goToStep(Math.min(sections.length - 1, step + 1))}>
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
        description="Record how busy the outlet was and add your shopper narrative. The visit end time and submission timestamp are recorded automatically."
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
          <div>
            <label className="label" htmlFor="occupancy">Occupancy on arrival (%)</label>
            <div className="flex items-center gap-2">
              <input
                id="occupancy"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={occupancy}
                onChange={(e) => setOccupancy(e.target.value)}
                className="input !w-28 text-lg font-semibold tabular-nums"
              />
              <p className="text-xs text-slate-500">
                Roughly what share of seats or service points were in use when you arrived. Every timing in the visit is read against it.
              </p>
            </div>
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

type Attached = Evidence

function QuestionCard({ index, q, answer, clockProblem, locked, onChange, onAttach, uploading, uploadNote, evidence, onRename, onDelete }: { index: number; q: Question; answer: VisitAnswer | undefined; clockProblem?: string; locked: boolean; onChange: (patch: Partial<VisitAnswer>) => void; onAttach: (files: (File | null)[]) => void; uploading: boolean; uploadNote?: string | null; evidence: Attached[]; onRename: (id: string, title: string) => void; onDelete: (id: string) => void }) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const isVideo = q.type === 'video'
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
            <Badge tone="slate" size="xs">{q.type === 'rating_10' && ratingScale(q).min === 0 ? '0–10 rating' : TYPE_LABEL[q.type]}</Badge>
            {q.required && <Badge tone="blue" size="xs">Required</Badge>}
            <Badge tone="slate" size="xs">Weight {q.weight}</Badge>
            {q.critical && <Badge tone="red" size="xs" icon={AlertOctagon}>Critical</Badge>}
            {q.evidenceRequired && <Badge tone="blue" size="xs" icon={Camera}>Evidence required</Badge>}
            {q.commentRequired && <Badge tone="blue" size="xs" icon={MessageSquare}>Comment required</Badge>}
            {!q.commentRequired && q.commentOnFail && <Badge tone="slate" size="xs" icon={MessageSquare}>Explain if below standard</Badge>}
            {naSelectable(q) && !locked && (
              <label className={cn('ml-auto inline-flex min-h-[32px] cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium', na ? 'border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200' : 'border-slate-300 text-slate-600 dark:border-navy-700 dark:text-slate-300')}>
                <input type="checkbox" checked={na} onChange={(e) => onChange({ na: e.target.checked, value: e.target.checked ? null : value })} className="h-4 w-4 rounded border-slate-300 text-teal-600" /> N/A
              </label>
            )}
            {locked && na && <Badge tone="slate" size="xs">N/A</Badge>}
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
                {Array.from({ length: ratingScale(q).max - ratingScale(q).min + 1 }, (_, i) => i + ratingScale(q).min).map((n) => (
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
            {q.type === 'clock' && (
              <div className="flex items-center gap-2">
                <input type="time" disabled={disabled} value={typeof value === 'string' ? value : ''} onChange={(e) => set(e.target.value === '' ? null : e.target.value)} className="input !w-36 text-lg font-semibold tabular-nums" aria-label={q.text} />
                <span className="text-sm text-slate-500">24-hour clock</span>
              </div>
            )}
            {q.type === 'time' && q.derivedFrom && (
              <div className="flex flex-wrap items-center gap-2">
                <output className={cn('input !w-36 flex items-center text-lg font-semibold tabular-nums', value === null && 'text-slate-400')} aria-label={q.text}>
                  {value === null ? '—' : `${Number(value).toFixed(0)} min`}
                </output>
                {clockProblem ? (
                  <span role="alert" className="basis-full text-xs font-medium text-red-600 dark:text-red-400">{clockProblem}</span>
                ) : (
                  <span className="text-xs text-slate-500">{na ? 'Not applicable — one of its clock times is N/A' : value === null ? 'Calculated once both clock times are recorded' : 'Calculated from the clock times'}</span>
                )}
                {q.threshold !== undefined && <span className={cn('ml-auto text-xs font-medium', failed ? 'text-red-600' : score === 1 ? 'text-emerald-600' : 'text-slate-500')}>Standard ≤ {q.threshold} min{typeof value === 'number' ? (value <= q.threshold ? ' · within standard' : ` · exceeded by ${(value - q.threshold).toFixed(0)}`) : ''}</span>}
              </div>
            )}
            {((q.type === 'time' && !q.derivedFrom) || q.type === 'numeric') && (
              <div className="flex items-center gap-2">
                <input type="number" inputMode="decimal" min={0} step={0.5} disabled={disabled} value={value === null ? '' : String(value)} onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))} className="input !w-32 text-lg font-semibold tabular-nums" aria-label={`${q.text} value`} />
                <span className="text-sm text-slate-500">{q.type === 'time' ? 'minutes' : ''}</span>
                {q.threshold !== undefined && <span className={cn('ml-auto text-xs font-medium', failed ? 'text-red-600' : score === 1 ? 'text-emerald-600' : 'text-slate-500')}>Standard ≤ {q.threshold} min{typeof value === 'number' ? (value <= q.threshold ? ' · within standard' : ` · exceeded by ${(value - q.threshold).toFixed(1)}`) : ''}</span>}
              </div>
            )}
            {q.type === 'text' && <Textarea disabled={disabled} rows={3} value={typeof value === 'string' ? value : ''} onChange={(e) => set(e.target.value)} placeholder="Enter your observation…" />}
            {(q.type === 'photo' || q.type === 'video') && !locked && (
              <p className="text-xs text-slate-500">{isVideo ? 'Record a short video, or upload one you have already taken' : 'Take a photo, or upload one you have already taken'}, using the buttons below.</p>
            )}
          </div>

          {/* Evidence + comment */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!locked && (
              <>
                {/* Two ways in, and only two. `capture` opens the camera straight
                    away on a phone; the same input without it offers the gallery
                    and the files, which is the one a shopper needs when the photo
                    was taken earlier or is being filed from a laptop. */}
                <input ref={cameraRef} type="file" accept={isVideo ? 'video/*' : 'image/*'} capture="environment" className="hidden" onChange={(e) => { onAttach(Array.from(e.target.files ?? []).slice(0, 1)); e.target.value = '' }} />
                {/* The gallery picker takes several at once; the camera is one shot at a time. */}
                <input ref={uploadRef} type="file" accept={isVideo ? 'video/*' : 'image/*'} multiple className="hidden" onChange={(e) => { onAttach(Array.from(e.target.files ?? [])); e.target.value = '' }} />
                <button type="button" className="btn-secondary btn-sm" disabled={uploading} onClick={() => cameraRef.current?.click()}>
                  {isVideo ? <Video className="h-3.5 w-3.5" aria-hidden /> : <Camera className="h-3.5 w-3.5" aria-hidden />} {uploading ? `Attaching${uploadNote ? ` ${uploadNote}` : ''}…` : isVideo ? 'Record video' : 'Take photo'}
                </button>
                <button type="button" className="btn-secondary btn-sm" disabled={uploading} onClick={() => uploadRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" aria-hidden /> {isVideo ? 'Upload videos' : 'Upload photos'}
                </button>
              </>
            )}
            {evidence.map((e) => (
              <Attachment key={e.id} ev={e} locked={locked} onRename={(title) => onRename(e.id, title)} onDelete={() => onDelete(e.id)} />
            ))}
          </div>
          {/* A written-answer question is its own comment; a second box under it read as a repeated question.
              Kept when an old visit already holds a comment there, so nothing saved disappears. */}
          {(q.type !== 'text' || !!answer?.comment?.trim() || (na && naNeedsReason(q))) && (
            <div className="mt-3">
              <label className="label" htmlFor={`c-${q.id}`}>
                Comment {(q.commentRequired || (q.commentOnFail && failed) || (na && naNeedsReason(q))) && <span className="text-red-600">*</span>}
                {na && naNeedsReason(q) && <span className="ml-1 text-red-600">(required — say why this is N/A)</span>}
                {failed && !q.commentRequired && <span className={cn('ml-1', q.commentOnFail ? 'text-red-600' : 'text-amber-600')}>{q.commentOnFail ? '(required — this answer is below standard)' : '(recommended for a failed standard)'}</span>}
              </label>
              <Textarea id={`c-${q.id}`} rows={2} disabled={locked} value={answer?.comment ?? ''} onChange={(e) => onChange({ comment: e.target.value })} placeholder={na ? 'Why is this not applicable?' : 'Describe what you observed…'} className="!min-h-[56px]" />
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

/**
 * One attached photograph: its picture, its name and a way to remove it.
 *
 * The name matters more than it looks. Until now a photograph was titled after
 * the question it hung from, so a visit arrived at the reviewer carrying four
 * files called "Exterior arrival photograph" and nothing to tell them apart. A
 * shopper can now say what it actually shows — "Bill", "Main course as served",
 * "Cracked plate" — and that is the caption the report and the evidence library
 * both read.
 */
function Attachment({ ev, locked, onRename, onDelete }: { ev: Attached; locked: boolean; onRename: (title: string) => void; onDelete: () => void }) {
  const [name, setName] = useState(ev.title)
  const [confirming, setConfirming] = useState(false)
  const [viewing, setViewing] = useState(false)
  // Follow the stored title when it changes under us — a rename that came back
  // from the repository, or a different photograph reusing this row.
  const committed = useRef(ev.title)
  useEffect(() => {
    committed.current = ev.title
    setName(ev.title)
  }, [ev.title])

  const commit = () => {
    const next = name.trim()
    if (!next || next === committed.current) {
      setName(committed.current)
      return
    }
    committed.current = next
    onRename(next)
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-navy-700 p-0.5 pr-1 text-[11px] text-slate-600 dark:text-slate-300">
      {/* The photograph itself, large enough on a phone to see it is the right
          one, and a tap away from full size. */}
      <button type="button" onClick={() => setViewing(true)} className="shrink-0 rounded focus-visible:ring-2 focus-visible:ring-teal-500" aria-label={`View ${ev.title}`} title="View full size">
        <EvidenceVisual type={ev.type} seed={ev.visualSeed} label={ev.title} className="h-12 w-16 rounded" compact evidence={ev} />
      </button>
      <EvidencePreviewModal evidence={viewing ? ev : null} onClose={() => setViewing(false)} />
      {locked ? (
        <span className="max-w-[10rem] truncate px-1" title={ev.title}>{ev.title}</span>
      ) : (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setName(committed.current)
              e.currentTarget.blur()
            }
          }}
          aria-label="Photo name"
          placeholder="Name this photo"
          className="w-28 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] hover:border-slate-300 focus:border-teal-500 focus:bg-white focus:outline-none dark:hover:border-navy-600 dark:focus:bg-navy-900"
        />
      )}
      {!locked &&
        (confirming ? (
          <>
            <button type="button" className="rounded px-1 font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950" onClick={onDelete}>
              Delete
            </button>
            <button type="button" className="rounded px-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-navy-800" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </>
        ) : (
          <button type="button" aria-label={`Delete ${ev.title}`} title="Delete this photo" className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" onClick={() => setConfirming(true)}>
            <Trash2 className="h-3 w-3" aria-hidden />
          </button>
        ))}
    </span>
  )
}
