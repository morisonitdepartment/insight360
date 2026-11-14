import { useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarDays } from 'lucide-react'
import { useData } from '@/contexts/DataContext'
import { useNow } from '@/hooks'
import { changeVisitDate } from '@/services/actions'
import { Modal } from '@/components/ui/Modal'
import { Field, Input, Textarea } from '@/components/ui/Form'
import { fmtDate } from '@/utils/format'
import type { Visit } from '@/types'

/**
 * Super Admin: correct the date of a visit. Once the visit has taken place this
 * is the visit date (a shopper who enters the form the next day leaves it dated
 * the day of entry); before that it is the booked date. A visit that has taken
 * place cannot be dated in the future.
 */
export function ChangeVisitDateDialog({ visit, onClose }: { visit: Visit; onClose: () => void }) {
  const { dispatch } = useData()
  const now = useNow()
  const happened = visit.visitDate !== null
  const current = visit.visitDate ?? visit.scheduledDate
  const [date, setDate] = useState(current)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const today = fmtDate(now, 'yyyy-MM-dd')
  const future = happened && date > today
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date !== current && !future && reason.trim().length > 0

  const onSave = async () => {
    if (!valid) return
    setBusy(true)
    try {
      await dispatch((d, ctx) => changeVisitDate(d, ctx, visit.id, date, reason.trim()))
      toast.success(`${visit.code} ${happened ? 'visit' : 'booked'} date set to ${fmtDate(date)}`)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change the date')
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      size="sm"
      title={
        <span className="inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-teal-600" aria-hidden />
          Change the {happened ? 'visit' : 'booked'} date of {visit.code}
        </span>
      }
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={() => void onSave()} disabled={busy || !valid}>
            {busy ? 'Saving…' : 'Change date'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
        <p>
          {happened
            ? 'The day the visit actually took place. Answers, times, photos and the score stay as they are; dashboards and reports place the visit on the new date.'
            : 'The day the visit is booked for. The shopper sees the new date in their assignments.'}
        </p>
        <p className="text-xs text-slate-500">
          Now: <b className="text-slate-800 dark:text-slate-100">{fmtDate(current)}</b>
          {happened && visit.scheduledDate !== visit.visitDate && <> · booked for {fmtDate(visit.scheduledDate)}</>}
        </p>
        <Field label={happened ? 'Visit date' : 'Booked date'} htmlFor="visit-date" required error={future ? 'A visit that has taken place cannot be dated in the future.' : undefined}>
          <Input id="visit-date" type="date" value={date} max={happened ? today : undefined} onChange={(e) => setDate(e.target.value)} disabled={busy} invalid={future} />
        </Field>
        <Field label="Reason" htmlFor="visit-date-reason" required>
          <Textarea id="visit-date-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Visit took place on the 13th; the form was filled in the next day." disabled={busy} />
        </Field>
        <p className="text-xs text-slate-500">The change and the reason are kept in the visit's approval history and the activity log.</p>
      </div>
    </Modal>
  )
}
