import { useState } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle } from 'lucide-react'
import { useData } from '@/contexts/DataContext'
import { removeEvidence } from '@/services/actions'
import { Modal } from '@/components/ui/Modal'
import { Field, Textarea } from '@/components/ui/Form'
import { EvidenceVisual } from '@/components/ui/EvidenceThumb'
import type { Evidence } from '@/types'

/**
 * Super Admin only: permanently delete one uploaded photo (or video, receipt…),
 * at any stage of the visit, approved and published included. A reason is
 * required: it goes into the visit's approval history and the activity log.
 * Answers and the score stay as they are.
 */
export function DeletePhotoDialog({ evidence, onClose, onDeleted }: { evidence: Evidence; onClose: () => void; onDeleted?: () => void }) {
  const { data, dispatch, deleteEvidenceFile } = useData()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const visit = data.visits.find((v) => v.id === evidence.visitId)
  const outlet = data.outlets.find((o) => o.id === evidence.outletId)
  const question = evidence.questionId ? data.questions.find((q) => q.id === evidence.questionId) : undefined
  const valid = reason.trim().length > 0
  const kind = evidence.type === 'Photo' ? 'photo' : evidence.type.toLowerCase()

  const onDelete = async () => {
    if (!valid) return
    setBusy(true)
    try {
      // The file first: if that fails the record stays, pointing at something real.
      await deleteEvidenceFile(evidence.id)
      await dispatch((d, ctx) => removeEvidence(d, ctx, evidence.id, reason.trim()))
      toast.success(`${evidence.title || 'The ' + kind} deleted`)
      onDeleted?.()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Could not delete the ${kind}`)
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
          <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden />
          Delete this {kind}?
        </span>
      }
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Keep it
          </button>
          <button type="button" className="btn-danger" onClick={() => void onDelete()} disabled={busy || !valid}>
            {busy ? 'Deleting…' : `Delete ${kind}`}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
        <div className="flex gap-3">
          <EvidenceVisual type={evidence.type} seed={evidence.visualSeed} label={evidence.title} className="h-20 w-28 shrink-0 rounded" compact evidence={evidence} />
          <div className="min-w-0 text-xs">
            <p className="truncate font-medium text-slate-800 dark:text-slate-100">{evidence.title || evidence.type}</p>
            {visit && <p className="text-slate-500">{[visit.code, visit.status, outlet?.name].filter(Boolean).join(' · ')}</p>}
            {question && <p className="mt-0.5 line-clamp-2 text-slate-500">{question.code} · {question.text}</p>}
          </div>
        </div>
        <p>
          The file is removed for good and cannot be brought back. It disappears from the question, the report, its PDF and the Evidence Library. Answers and the score do not change.
        </p>
        <Field label="Reason" htmlFor="photo-delete-reason" required>
          <Textarea id="photo-delete-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Shows a customer's face; wrong outlet; duplicate." disabled={busy} />
        </Field>
        <p className="text-xs text-slate-500">The deletion and the reason are kept in the visit's approval history and the activity log.</p>
      </div>
    </Modal>
  )
}
