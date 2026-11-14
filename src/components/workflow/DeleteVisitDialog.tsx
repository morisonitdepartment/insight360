import { useState } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle } from 'lucide-react'
import { useData } from '@/contexts/DataContext'
import { Modal } from '@/components/ui/Modal'
import { Field, Input } from '@/components/ui/Form'
import type { Visit } from '@/types'

/**
 * Super Admin only: permanently delete a visit booked by mistake.
 *
 * The administrator types the visit code to confirm, because the delete takes
 * the shopper's answers and photos with it and cannot be undone.
 */
export function DeleteVisitDialog({ visit, onClose, onDeleted }: { visit: Visit; onClose: () => void; onDeleted?: () => void }) {
  const { data, deleteVisit } = useData()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  const answers = data?.answers.filter((a) => a.visitId === visit.id).length ?? 0
  const photos = data?.evidence.filter((e) => e.visitId === visit.id).length ?? 0
  const findings = data?.findings.filter((f) => f.visitId === visit.id).length ?? 0
  const outlet = data?.outlets.find((o) => o.id === visit.outletId)
  const matches = typed.trim().toUpperCase() === visit.code.toUpperCase()

  const onDelete = async () => {
    if (!matches) return
    setBusy(true)
    try {
      await deleteVisit(visit.id)
      toast.success(`${visit.code} deleted`)
      onDeleted?.()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the visit')
      setBusy(false)
    }
  }

  const lost = [
    answers ? `${answers} answer${answers === 1 ? '' : 's'}` : null,
    photos ? `${photos} photo${photos === 1 ? '' : 's'}` : null,
    findings ? `${findings} finding${findings === 1 ? '' : 's'} with their actions and alerts` : null,
  ].filter(Boolean)

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      size="sm"
      title={
        <span className="inline-flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden />
          Delete visit {visit.code}
        </span>
      }
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={() => void onDelete()} disabled={busy || !matches}>
            {busy ? 'Deleting…' : 'Delete visit'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
        <p>
          <b className="text-slate-900 dark:text-white">{outlet?.name ?? 'Outlet'}</b> · {visit.type} · {visit.status}
        </p>
        <p>
          This permanently deletes the visit{lost.length ? <> and everything recorded on it: {lost.join(', ')}.</> : '.'} It cannot be undone. The
          activity log keeps a record that you deleted it.
        </p>
        <Field label={`Type ${visit.code} to confirm`} htmlFor="delete-visit-code">
          <Input id="delete-visit-code" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={visit.code} autoComplete="off" disabled={busy} />
        </Field>
      </div>
    </Modal>
  )
}
