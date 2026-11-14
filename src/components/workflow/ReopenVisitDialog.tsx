import { useState } from 'react'
import toast from 'react-hot-toast'
import { RotateCcw } from 'lucide-react'
import { useData } from '@/contexts/DataContext'
import { reopenVisit } from '@/services/actions'
import { Modal } from '@/components/ui/Modal'
import { Field, Textarea } from '@/components/ui/Form'
import type { Visit } from '@/types'

/**
 * Super Admin: send a submitted or approved visit back to the shopper as a
 * Draft, with the reason, so a mistake is corrected and the visit re-submitted
 * rather than deleted.
 */
export function ReopenVisitDialog({ visit, shopperName, onClose }: { visit: Visit; shopperName: string | null; onClose: () => void }) {
  const { dispatch } = useData()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const approved = visit.status === 'Approved' || visit.status === 'Closed'
  const who = shopperName ?? 'the shopper'

  const onReopen = async () => {
    const text = reason.trim()
    if (!text) return
    setBusy(true)
    try {
      await dispatch((d, ctx) => reopenVisit(d, ctx, visit.id, text))
      toast.success(`${visit.code} reopened — back with ${who}`)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reopen the visit')
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
          <RotateCcw className="h-4 w-4 text-amber-600" aria-hidden />
          Reopen {visit.code} for changes
        </span>
      }
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={() => void onReopen()} disabled={busy || !reason.trim()}>
            {busy ? 'Reopening…' : 'Reopen visit'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
        <p>
          The visit goes back to <b className="text-slate-900 dark:text-white">{who}</b> as a Draft. Answers and photos stay; {who} can change them, add more
          and submit again, and it then goes to the reviewer for approval as before.
        </p>
        {approved && <p className="text-amber-700 dark:text-amber-300">The approved report is withdrawn from the dashboards until the visit is approved again.</p>}
        <Field label="What needs changing" htmlFor="reopen-reason" required>
          <Textarea id="reopen-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The seated time is wrong — please correct it." disabled={busy} />
        </Field>
        <p className="text-xs text-slate-500">{who} is notified with this reason, and it is kept in the visit's approval history.</p>
      </div>
    </Modal>
  )
}
