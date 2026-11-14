import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { ImageUp, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { updateOrganization, upsertBrand } from '@/services/actions'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { BrandMark } from '@/components/ui/BrandMark'
import { CLIENT_BRAND } from '@/config/client'
import { prepareLogo } from '@/utils/logos'
import type { Brand } from '@/types'

/**
 * Logos — the organisation's and each company's.
 *
 * Whatever is uploaded here is used everywhere the mark appears: the sidebar,
 * every outlet line (visits, assignments, calendar, outlet records), the visit
 * report page, and the covers of the PDF reports. Removing one goes back to the
 * built-in mark, or the company's initials.
 */
export function LogoSettings() {
  const { can } = useAuth()
  const { data, dispatch } = useData()
  const [busy, setBusy] = useState<string | null>(null)
  const canOrg = can('admin.settings')
  const canBrands = can('admin.outlets')

  const run = async (key: string, work: () => Promise<void>, done: string) => {
    setBusy(key)
    try {
      await work()
      toast.success(done)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the logo')
    } finally {
      setBusy(null)
    }
  }

  const setOrgLogo = (file: File | null) =>
    run('org', async () => {
      const logo = file ? await prepareLogo(file) : null
      await dispatch((d, ctx) => updateOrganization(d, ctx, { logo }))
    }, file ? 'Organisation logo updated' : 'Organisation logo removed')

  const setBrandLogo = (brand: Brand, file: File | null) =>
    run(brand.id, async () => {
      const logo = file ? await prepareLogo(file) : null
      await dispatch((d, ctx) => upsertBrand(d, ctx, { ...(d.brands.find((b) => b.id === brand.id) ?? brand), logo }))
    }, file ? `${brand.name} logo updated` : `${brand.name} logo removed`)

  return (
    <Card className="lg:col-span-3">
      <CardHeader
        title="Logos"
        subtitle="Upload the organisation's logo and each company's. They appear across the platform and on the PDF report covers. PNG with a transparent background works best."
      />
      <CardBody className="divide-y divide-slate-100 dark:divide-navy-800">
        <LogoRow
          name={data.organization.name || CLIENT_BRAND.name}
          caption="Organisation · sidebar, report pages and every PDF cover"
          preview={
            <span className="inline-flex h-12 w-24 items-center justify-center rounded-lg bg-white p-1.5 ring-1 ring-black/5">
              <img src={data.organization.logo || CLIENT_BRAND.logo} alt="" className="max-h-full max-w-full object-contain" />
            </span>
          }
          uploaded={!!data.organization.logo}
          editable={canOrg}
          busy={busy === 'org'}
          onPick={(f) => void setOrgLogo(f)}
          onRemove={() => void setOrgLogo(null)}
        />
        {data.brands.map((b) => (
          <LogoRow
            key={b.id}
            name={b.name}
            caption={`Company · every ${b.name} branch, its visits and its reports`}
            preview={<BrandMark brandName={b.name} size="lg" />}
            uploaded={!!b.logo}
            editable={canBrands}
            busy={busy === b.id}
            onPick={(f) => void setBrandLogo(b, f)}
            onRemove={() => void setBrandLogo(b, null)}
          />
        ))}
      </CardBody>
    </Card>
  )
}

function LogoRow(props: {
  name: string
  caption: string
  preview: React.ReactNode
  uploaded: boolean
  editable: boolean
  busy: boolean
  onPick: (file: File) => void
  onRemove: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
      {props.preview}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{props.name}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {props.caption}
          {!props.uploaded && ' · using the default'}
        </p>
      </div>
      {props.editable && (
        <div className="flex items-center gap-2">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) props.onPick(f)
            }}
          />
          <button type="button" className="btn-secondary btn-sm" disabled={props.busy} onClick={() => input.current?.click()}>
            <ImageUp className="h-3.5 w-3.5" aria-hidden /> {props.busy ? 'Saving…' : props.uploaded ? 'Replace' : 'Upload logo'}
          </button>
          {props.uploaded && (
            <button type="button" className="btn-ghost btn-sm text-red-600 dark:text-red-400" disabled={props.busy} onClick={props.onRemove} aria-label={`Remove the ${props.name} logo`}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
            </button>
          )}
        </div>
      )}
    </div>
  )
}
