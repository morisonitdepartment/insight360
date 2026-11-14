import { differenceInMinutes, isValid, parseISO } from 'date-fns'
import { AlertTriangle, CheckCircle2, MapPin, ShieldQuestion } from 'lucide-react'
import { useData } from '@/contexts/DataContext'
import { getVisitSections } from '@/services/actions'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { fmtDateTime } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { Evidence, Visit } from '@/types'

/** How far from the recorded time in a proof photo may be taken before the reviewer is warned. */
const MAX_HOURS_FROM_TIME_IN = 3

type Tone = 'good' | 'warn' | 'bad'

/**
 * Proof of visit, checked against what the camera recorded.
 *
 * The briefs want the exterior photo to show the date, time and place. Each
 * proof photo is compared with the visit: taken on the visit day, near the time
 * the shopper says they walked in, and where. It never blocks anything — a
 * photo can lose its camera data innocently — it tells the reviewer what to
 * look at before approving.
 */
export function ProofOfVisitCheck({ visit }: { visit: Visit }) {
  const { data } = useData()
  const proof = getVisitSections(data, visit).find((s) => s.code === 'PRF')
  if (!proof) return null
  const questions = data.questions.filter((q) => q.sectionId === proof.id).sort((a, b) => a.order - b.order)
  // The mandatory photos — arrival, departure, counter, food. A bill photo is optional (N/A allowed).
  const photoQs = questions.filter((q) => (q.type === 'photo' || q.type === 'video') && !q.allowNA)
  if (!photoQs.length) return null
  const answers = new Map(data.answers.filter((a) => a.visitId === visit.id).map((a) => [a.questionId, a]))
  const timeInQ = questions.find((q) => q.type === 'clock' && q.required) ?? questions.find((q) => q.type === 'clock')
  const timeInRaw = timeInQ ? answers.get(timeInQ.id)?.value : null
  const timeIn = typeof timeInRaw === 'string' && visit.visitDate ? parseISO(`${visit.visitDate}T${timeInRaw.length === 5 ? `${timeInRaw}:00` : timeInRaw}`) : null

  const rows = photoQs.flatMap((q) => {
    const ids = answers.get(q.id)?.evidenceIds ?? []
    const evs = ids.map((id) => data.evidence.find((e) => e.id === id)).filter((e): e is Evidence => !!e)
    if (!evs.length) return [{ key: q.id, label: q.text, ev: null as Evidence | null }]
    return evs.map((ev, i) => ({ key: ev.id, label: evs.length > 1 ? `${q.text} (${i + 1})` : q.text, ev }))
  })

  const judge = (ev: Evidence | null): { tone: Tone; text: string } => {
    if (!ev) return { tone: 'warn', text: 'No photo attached yet.' }
    const taken = ev.photoTakenAt ? parseISO(ev.photoTakenAt) : null
    if (!taken || !isValid(taken)) {
      return { tone: 'warn', text: 'No camera date in the file — it may be a screenshot, or a photo forwarded through a messaging app. Check the stamp drawn on the picture.' }
    }
    if (visit.visitDate && ev.photoTakenAt!.slice(0, 10) !== visit.visitDate) {
      return { tone: 'bad', text: `Taken ${fmtDateTime(taken)} — not on the visit day.` }
    }
    if (timeIn && isValid(timeIn)) {
      const hours = Math.abs(differenceInMinutes(taken, timeIn)) / 60
      if (hours > MAX_HOURS_FROM_TIME_IN) {
        return { tone: 'warn', text: `Taken ${fmtDateTime(taken)}, ${hours.toFixed(1)} h from the recorded time in (${String(timeInRaw)}).` }
      }
    }
    return { tone: 'good', text: `Taken ${fmtDateTime(taken)}, during the visit.` }
  }

  const judged = rows.map((r) => ({ ...r, verdict: judge(r.ev) }))
  const worst: Tone = judged.some((r) => r.verdict.tone === 'bad') ? 'bad' : judged.some((r) => r.verdict.tone === 'warn') ? 'warn' : 'good'

  return (
    <Card>
      <CardHeader
        title="Proof-of-visit check"
        subtitle="When and where the camera says each proof photo was taken"
        actions={
          <span className={cn('text-xs font-semibold', worst === 'good' ? 'text-emerald-600' : worst === 'warn' ? 'text-amber-600' : 'text-red-600')}>
            {worst === 'good' ? 'All consistent' : worst === 'warn' ? 'Check before approving' : 'Does not match the visit'}
          </span>
        }
      />
      <CardBody className="space-y-3">
        {judged.map(({ key, label, ev, verdict }) => {
          const Icon = verdict.tone === 'good' ? CheckCircle2 : verdict.tone === 'bad' ? AlertTriangle : ShieldQuestion
          const hasGps = ev && typeof ev.latitude === 'number' && typeof ev.longitude === 'number'
          return (
            <div key={key} className="flex items-start gap-2.5 text-sm">
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', verdict.tone === 'good' ? 'text-emerald-600' : verdict.tone === 'warn' ? 'text-amber-600' : 'text-red-600')} aria-hidden />
              <div className="min-w-0">
                <p className="font-medium text-slate-800 dark:text-slate-100">{label}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">{verdict.text}</p>
                {ev && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <MapPin className="h-3 w-3" aria-hidden />
                    {hasGps ? (
                      <a className="link" href={`https://www.google.com/maps?q=${ev.latitude},${ev.longitude}`} target="_blank" rel="noreferrer">
                        {ev.latitude!.toFixed(5)}, {ev.longitude!.toFixed(5)} · open map
                      </a>
                    ) : (
                      'No location in the file (the phone may not record it, or it was removed).'
                    )}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </CardBody>
    </Card>
  )
}
