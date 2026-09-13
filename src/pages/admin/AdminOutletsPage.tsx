import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Activity, Building2, Download, ExternalLink, Pencil, Plus, Store, Tags, Ticket, Wrench } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import type { EntSubcategory, FnbSubcategory, Outlet, OutletStatus, Segment, Subcategory } from '@/types'
import { logExport, upsertOutlet } from '@/services/actions'
import { PageHeader } from '@/components/ui/PageHeader'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { FilterBar, applyFilters, matchesSearch, type FilterDef } from '@/components/ui/FilterBar'
import { RiskBadge, ScoreBadge, SegmentBadge, StatusBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Field, Input, Select } from '@/components/ui/Form'
import { exportCsv } from '@/utils/export'
import { fmtDate } from '@/utils/format'

const FNB_SUBCATEGORIES: FnbSubcategory[] = ['Fine Dining', 'Casual Dining', 'Café', 'Fast Casual', 'Food Court']
const ENT_SUBCATEGORIES: EntSubcategory[] = ['Indoor Entertainment', 'Family Entertainment', 'Attraction', 'Cinema', 'Recreation']
const OUTLET_STATUSES: OutletStatus[] = ['Active', 'Under Renovation', 'Seasonal']

interface OutletForm {
  name: string
  code: string
  brandId: string
  subcategory: string
  location: string
  region: string
  manager: string
  status: OutletStatus
  openingHours: string
  targetScore: string
}

/** Suggests the next free code for a segment, e.g. FB-031 / EN-021. */
function suggestCode(outlets: Outlet[], segment: Segment): string {
  const prefix = segment === 'F&B' ? 'FB' : 'EN'
  const max = outlets.reduce((m, o) => {
    const match = /^([A-Z]+)-(\d+)$/.exec(o.code)
    if (!match || match[1] !== prefix) return m
    return Math.max(m, Number(match[2]))
  }, 0)
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

function emptyForm(): OutletForm {
  return { name: '', code: '', brandId: '', subcategory: '', location: '', region: '', manager: '', status: 'Active', openingHours: '11:00 – 00:00', targetScore: '88' }
}

function formFrom(o: Outlet): OutletForm {
  return { name: o.name, code: o.code, brandId: o.brandId, subcategory: o.subcategory, location: o.location, region: o.region, manager: o.manager, status: o.status, openingHours: o.openingHours, targetScore: String(o.targetScore) }
}

export default function AdminOutletsPage() {
  useDocumentTitle('Outlets')
  const navigate = useNavigate()
  const now = useNow()
  const { can } = useAuth()
  const { data, dispatch, scopedOutlets } = useData()
  const canManage = can('admin.outlets')

  const brandById = useMemo(() => new Map(data.brands.map((b) => [b.id, b])), [data.brands])
  const regions = useMemo(() => Array.from(new Set(data.outlets.map((o) => o.region))).sort(), [data.outlets])
  const subcategories = useMemo(() => Array.from(new Set(data.outlets.map((o) => o.subcategory))).sort(), [data.outlets])

  // ── Filters ──
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const filterDefs: FilterDef[] = useMemo(
    () => [
      { key: 'segment', label: 'Segment', options: [{ value: 'F&B', label: 'F&B' }, { value: 'Entertainment', label: 'Entertainment' }] },
      { key: 'subcategory', label: 'Subcategory', options: subcategories.map((s) => ({ value: s, label: s })) },
      { key: 'brand', label: 'Brand', options: data.brands.map((b) => ({ value: b.id, label: b.name })) },
      { key: 'region', label: 'Region', options: regions.map((r) => ({ value: r, label: r })) },
      { key: 'status', label: 'Status', options: OUTLET_STATUSES.map((s) => ({ value: s, label: s })) },
    ],
    [subcategories, data.brands, regions],
  )

  const rows = useMemo(() => {
    const list = applyFilters(scopedOutlets, filters, {
      segment: (o) => o.segment,
      subcategory: (o) => o.subcategory,
      brand: (o) => o.brandId,
      region: (o) => o.region,
      status: (o) => o.status,
    })
    return [...matchesSearch(list, search, (o) => [o.code, o.name, o.brand, o.location, o.manager, o.region])].sort((a, b) => a.code.localeCompare(b.code))
  }, [scopedOutlets, filters, search])

  // ── KPIs ──
  const kpi = useMemo(() => {
    const fnb = scopedOutlets.filter((o) => o.segment === 'F&B').length
    const ent = scopedOutlets.length - fnb
    const active = scopedOutlets.filter((o) => o.status === 'Active').length
    const paused = scopedOutlets.length - active
    const brands = new Set(scopedOutlets.map((o) => o.brandId)).size
    return { total: scopedOutlets.length, fnb, ent, active, paused, brands }
  }, [scopedOutlets])

  // ── Form state ──
  const [editing, setEditing] = useState<{ outlet: Outlet | null } | null>(null)
  const [form, setForm] = useState<OutletForm>(emptyForm)
  const [errors, setErrors] = useState<Partial<Record<keyof OutletForm, string>>>({})
  const [busy, setBusy] = useState(false)

  const selectedBrand = form.brandId ? brandById.get(form.brandId) : undefined
  const segment: Segment | null = selectedBrand?.segment ?? null
  const subcategoryOptions: Subcategory[] = segment === 'Entertainment' ? ENT_SUBCATEGORIES : segment === 'F&B' ? FNB_SUBCATEGORIES : []

  const openCreate = () => {
    setForm(emptyForm())
    setErrors({})
    setEditing({ outlet: null })
  }
  const openEdit = (o: Outlet) => {
    setForm(formFrom(o))
    setErrors({})
    setEditing({ outlet: o })
  }
  const closeForm = () => setEditing(null)

  const setBrand = (brandId: string) => {
    const b = brandById.get(brandId)
    setForm((f) => {
      const seg = b?.segment
      const subOk = seg && (seg === 'F&B' ? FNB_SUBCATEGORIES : ENT_SUBCATEGORIES).includes(f.subcategory as never)
      const code = editing?.outlet ? f.code : seg ? suggestCode(data.outlets, seg) : f.code
      const hours = editing?.outlet ? f.openingHours : seg === 'Entertainment' ? '10:00 – 23:00' : '11:00 – 00:00'
      return { ...f, brandId, subcategory: subOk ? f.subcategory : '', code, openingHours: hours }
    })
  }

  const validate = (): boolean => {
    const e: Partial<Record<keyof OutletForm, string>> = {}
    if (!form.name.trim()) e.name = 'Outlet name is required.'
    if (!form.code.trim()) e.code = 'Code is required.'
    else if (data.outlets.some((o) => o.code.toLowerCase() === form.code.trim().toLowerCase() && o.id !== editing?.outlet?.id)) e.code = 'This code is already in use.'
    if (!form.brandId) e.brandId = 'Select a brand.'
    if (!form.subcategory) e.subcategory = 'Select a subcategory.'
    if (!form.location.trim()) e.location = 'Location is required.'
    if (!form.region) e.region = 'Select a region.'
    const target = Number(form.targetScore)
    if (!Number.isFinite(target) || target < 50 || target > 100) e.targetScore = 'Target must be between 50 and 100.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!canManage || !editing) return
    if (!validate()) return
    const brand = brandById.get(form.brandId)
    if (!brand) return
    const base = editing.outlet
    const outlet: Outlet = {
      id: base?.id ?? `out-${Date.now().toString(36)}`,
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      brandId: brand.id,
      brand: brand.name,
      segment: brand.segment,
      subcategory: form.subcategory as Subcategory,
      location: form.location.trim(),
      region: form.region,
      manager: form.manager.trim(),
      status: form.status,
      openingHours: form.openingHours.trim(),
      targetScore: Number(form.targetScore),
      annualVisits: base?.annualVisits ?? 4,
      mapX: base?.mapX ?? 50,
      mapY: base?.mapY ?? 50,
      mainAuditsCompleted: base?.mainAuditsCompleted ?? 0,
      followUpsCompleted: base?.followUpsCompleted ?? 0,
      lastAudit: base?.lastAudit ?? null,
      nextAudit: base?.nextAudit ?? null,
      overallScore: base?.overallScore ?? null,
      previousScore: base?.previousScore ?? null,
      riskRating: base?.riskRating ?? 'Not Assessed',
      openIssues: base?.openIssues ?? 0,
      criticalFindings: base?.criticalFindings ?? 0,
      categoryScores: base?.categoryScores ?? null,
      rank: base?.rank ?? null,
    }
    setBusy(true)
    try {
      await dispatch((d, ctx) => upsertOutlet(d, ctx, outlet))
      toast.success(base ? `${outlet.name} updated` : `${outlet.name} created as ${outlet.code}`)
      closeForm()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save outlet')
    } finally {
      setBusy(false)
    }
  }

  const doExport = () => {
    if (!rows.length) {
      toast.error('Nothing to export for the current filters.')
      return
    }
    const out = rows.map((o) => ({
      Code: o.code,
      Outlet: o.name,
      Brand: o.brand,
      Segment: o.segment,
      Subcategory: o.subcategory,
      Location: o.location,
      Region: o.region,
      Manager: o.manager,
      Status: o.status,
      'Opening Hours': o.openingHours,
      'Target Score': o.targetScore,
      'Annual Visits': o.annualVisits,
      'Overall Score': o.overallScore ?? '',
      Risk: o.riskRating,
      'Open Issues': o.openIssues,
      'Critical Findings': o.criticalFindings,
      'Last Audit': o.lastAudit ?? '',
      'Next Audit': o.nextAudit ?? '',
    }))
    exportCsv(out, `insight360-outlets-${fmtDate(now, 'yyyyMMdd')}`)
    void dispatch((d, ctx) => logExport(d, ctx, `Outlets (${out.length} rows)`, 'CSV')).then(() => toast.success(`Exported ${out.length} outlets to CSV`))
  }

  // ── Columns ──
  const columns: Column<Outlet>[] = useMemo(
    () => [
      { key: 'code', header: 'Code', render: (o) => <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{o.code}</span>, width: '84px' },
      { key: 'name', header: 'Outlet', render: (o) => <span className="font-medium text-slate-900 dark:text-white">{o.name}</span> },
      { key: 'brand', header: 'Brand' },
      { key: 'segment', header: 'Segment', render: (o) => <SegmentBadge segment={o.segment} /> },
      { key: 'subcategory', header: 'Subcategory' },
      { key: 'location', header: 'Location' },
      { key: 'region', header: 'Region' },
      { key: 'manager', header: 'Manager' },
      { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
      { key: 'openingHours', header: 'Opening hours', render: (o) => <span className="whitespace-nowrap text-xs tabular-nums">{o.openingHours}</span>, sortable: false },
      { key: 'targetScore', header: 'Target', align: 'right', render: (o) => <span className="tabular-nums">{o.targetScore}%</span> },
      { key: 'annualVisits', header: 'Visits / yr', align: 'right' },
      { key: 'overallScore', header: 'Score', render: (o) => <ScoreBadge score={o.overallScore} />, sortValue: (o) => o.overallScore },
      { key: 'riskRating', header: 'Risk', render: (o) => <RiskBadge risk={o.riskRating} /> },
      {
        key: 'actions',
        header: <span className="sr-only">Actions</span>,
        sortable: false,
        align: 'right',
        render: (o) => (
          <div className="flex items-center justify-end gap-1">
            {canManage && (
              <button type="button" className="btn-ghost btn-sm" aria-label={`Edit ${o.name}`} onClick={(e) => { e.stopPropagation(); openEdit(o) }}>
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
            <button type="button" className="btn-ghost btn-sm" aria-label={`Open performance for ${o.name}`} onClick={(e) => { e.stopPropagation(); navigate(`/performance/outlets/${o.id}`) }}>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage],
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Outlets"
        subtitle="Master data for the 50-outlet portfolio"
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={doExport}>
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </button>
            {canManage && (
              <button type="button" className="btn-primary" onClick={openCreate}>
                <Plus className="h-4 w-4" aria-hidden /> New outlet
              </button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard compact label="Total outlets" value={kpi.total} icon={Building2} tone="accent" sub="In portfolio" />
        <KpiCard compact label="F&B" value={kpi.fnb} icon={Store} sub={`${kpi.total ? Math.round((kpi.fnb / kpi.total) * 100) : 0}% of portfolio`} />
        <KpiCard compact label="Entertainment" value={kpi.ent} icon={Ticket} sub={`${kpi.total ? Math.round((kpi.ent / kpi.total) * 100) : 0}% of portfolio`} />
        <KpiCard compact label="Active" value={kpi.active} icon={Activity} tone="good" sub="Trading normally" />
        <KpiCard compact label="Renovation / seasonal" value={kpi.paused} icon={Wrench} tone={kpi.paused ? 'warn' : 'default'} sub="Temporarily paused" />
        <KpiCard compact label="Brands" value={kpi.brands} icon={Tags} sub="Distinct brands" />
      </div>

      <FilterBar search={search} onSearch={setSearch} searchPlaceholder="Search code, name, brand, location, manager…" filters={filterDefs} values={filters} onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={() => { setFilters({}); setSearch('') }} resultCount={rows.length} />

      <Card>
        <DataTable columns={columns} rows={rows} rowKey={(o) => o.id} onRowClick={(o) => navigate(`/performance/outlets/${o.id}`)} pageSize={15} initialSort={{ key: 'code', dir: 'asc' }} caption="Outlet master data" emptyTitle="No outlets match" emptyMessage="Adjust the filters or create a new outlet." />
      </Card>

      <Modal
        open={editing !== null}
        onClose={closeForm}
        title={editing?.outlet ? `Edit ${editing.outlet.code}` : 'New outlet'}
        description={editing?.outlet ? 'Changes apply immediately to master data. Derived performance fields are preserved.' : 'Brand determines the segment and the suggested outlet code.'}
        size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={closeForm} disabled={busy}>
              Cancel
            </button>
            <button type="submit" form="outlet-form" className="btn-primary" disabled={busy || !canManage}>
              {busy ? 'Saving…' : editing?.outlet ? 'Save changes' : 'Create outlet'}
            </button>
          </>
        }
      >
        <form id="outlet-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <Field label="Brand" required error={errors.brandId} htmlFor="outlet-brand">
            <Select id="outlet-brand" value={form.brandId} onChange={(e) => setBrand(e.target.value)} invalid={!!errors.brandId}>
              <option value="">Select brand…</option>
              {data.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.segment}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Segment" hint="Derived from the selected brand.">
            <div className="flex h-[38px] items-center">{segment ? <SegmentBadge segment={segment} size="md" /> : <span className="text-xs text-slate-400">—</span>}</div>
          </Field>
          <Field label="Outlet name" required error={errors.name} htmlFor="outlet-name" className="sm:col-span-2">
            <Input id="outlet-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={selectedBrand ? `${selectedBrand.name} – Location` : 'Brand – Location'} invalid={!!errors.name} />
          </Field>
          <Field label="Code" required error={errors.code} hint={segment && !editing?.outlet ? `Suggested: ${suggestCode(data.outlets, segment)}` : undefined} htmlFor="outlet-code">
            <Input id="outlet-code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="FB-031" className="font-mono uppercase" invalid={!!errors.code} />
          </Field>
          <Field label="Subcategory" required error={errors.subcategory} htmlFor="outlet-sub">
            <Select id="outlet-sub" value={form.subcategory} onChange={(e) => setForm((f) => ({ ...f, subcategory: e.target.value }))} disabled={!segment} invalid={!!errors.subcategory}>
              <option value="">{segment ? 'Select subcategory…' : 'Select a brand first'}</option>
              {subcategoryOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Location" required error={errors.location} htmlFor="outlet-location">
            <Input id="outlet-location" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Lusail Marina" invalid={!!errors.location} />
          </Field>
          <Field label="Region" required error={errors.region} htmlFor="outlet-region">
            <Select id="outlet-region" value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} invalid={!!errors.region}>
              <option value="">Select region…</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Outlet manager" htmlFor="outlet-manager">
            <Input id="outlet-manager" value={form.manager} onChange={(e) => setForm((f) => ({ ...f, manager: e.target.value }))} placeholder="Full name" />
          </Field>
          <Field label="Status" htmlFor="outlet-status">
            <Select id="outlet-status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as OutletStatus }))}>
              {OUTLET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Opening hours" htmlFor="outlet-hours">
            <Input id="outlet-hours" value={form.openingHours} onChange={(e) => setForm((f) => ({ ...f, openingHours: e.target.value }))} placeholder="11:00 – 00:00" />
          </Field>
          <Field label="Target score (%)" error={errors.targetScore} htmlFor="outlet-target" hint="Brand standard the outlet is benchmarked against.">
            <Input id="outlet-target" type="number" min={50} max={100} step={1} value={form.targetScore} onChange={(e) => setForm((f) => ({ ...f, targetScore: e.target.value }))} invalid={!!errors.targetScore} />
          </Field>
        </form>
      </Modal>
    </div>
  )
}
