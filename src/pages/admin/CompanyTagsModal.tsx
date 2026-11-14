import { useState } from 'react'
import toast from 'react-hot-toast'
import { useData } from '@/contexts/DataContext'
import { upsertBrand } from '@/services/actions'
import { parseTags } from '@/services/groups'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Form'
import { BrandMark } from '@/components/ui/BrandMark'
import { T } from '@/config/terms'

/**
 * Tags on each company. Every branch of a company inherits its tags, so tagging
 * Pizza Hut "QSR" puts every Pizza Hut branch under "QSR" in the top-bar selector
 * without touching the branches one by one.
 */
export function CompanyTagsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, dispatch } = useData()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const value = (id: string) => draft[id] ?? (data.brands.find((b) => b.id === id)?.tags ?? []).join(', ')

  const save = async () => {
    setBusy(true)
    try {
      for (const b of data.brands) {
        if (draft[b.id] === undefined) continue
        const tags = parseTags(draft[b.id])
        if (tags.join('|') === (b.tags ?? []).join('|')) continue
        await dispatch((d, ctx) => upsertBrand(d, ctx, { ...(d.brands.find((x) => x.id === b.id) ?? b), tags }))
      }
      toast.success('Company tags saved')
      setDraft({})
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the tags')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Companies & tags"
      description={`Tags group ${T.outlets} for the selector at the top of every page. A company's tags apply to all of its branches; separate several with commas.`}
      size="md"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Save tags'}
          </button>
        </>
      }
    >
      <ul className="divide-y divide-slate-100 dark:divide-navy-800">
        {[...data.brands]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((b) => {
            const branches = data.outlets.filter((o) => o.brandId === b.id).length
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                <BrandMark brandName={b.name} size="md" />
                <div className="min-w-[140px] flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{b.name}</p>
                  <p className="text-xs text-slate-500">
                    {branches} branch{branches === 1 ? '' : 'es'} · {b.segment}
                  </p>
                </div>
                <Input
                  className="!w-full sm:!w-64"
                  value={value(b.id)}
                  onChange={(e) => setDraft((d) => ({ ...d, [b.id]: e.target.value }))}
                  placeholder="e.g. QSR, Franchise A"
                  aria-label={`Tags for ${b.name}`}
                  disabled={busy}
                />
              </li>
            )
          })}
      </ul>
    </Modal>
  )
}
