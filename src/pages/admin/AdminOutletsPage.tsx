import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Activity, Building2, Download, ExternalLink, Pencil, Plus, Store, Tags, Ticket, Wrench } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import type { Brand, EntSubcategory, FnbSubcategory, Outlet, OutletStatus, Segment, Subcategory } from '@/types'
import { logExport, upsertBrand, upsertOutlet } from '@/services/actions'
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
  const { data, dispatch, authorizedOutlets: scopedOutlets } = useData()
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
  // Brands had no creation path anywhere in the app, so a real portfolio could
  // never get its first outlet. Created here, where the need actually arises.
  const [brandModal, setBrandModal] = useState(false)
  const [brandForm, setBrandForm] = useState<{ name: string; segment: Segment }>({ name: '', segment: 'F&B' })
  const [brandError, setBrandError] = useState('')

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

  const setBrand = (brandId: string, known?: Brand) => {
    // `known` covers the just-created brand: dispatch has not re-rendered yet, so
    // it is not in brandById, and without it the segment would come back empty.
    const b = known ?? brandById.get(brandId)
    setForm((f) => {
      const seg = b?.segment
      const subOk = seg && (seg === 'F&B' ? FNB_SUBCATEGORIES : ENT_SUBCATEGORIES).includes(f.subcategory as never)
      const code = editing?.outlet ? f.code : seg ? suggestCode(data.outlets, seg) : f.code
      const hours = editing?.outlet ? f.openingHours : seg === 'Entertainment' ? '10:00 – 23:00' : '11:00 – 00:00'
      return { ...f, brandId, subcategory: subOk ? f.subcategory : '', code, openingHours: hours }
    })
  }

  const submitBrand = async (ev: FormEvent) => {
    ev.preventDefault()
    const name = brandForm.name.trim()
    if (!name) {
      setBrandError('Brand name is required.')
      return
    }
    if (data.brands.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
      setBrandError('That brand already exists.')
      return
    }
    const brand: Brand = { id: `brd-${Date.now().toString(36)}`, name, segment: brandForm.segment, outletCount: 0 }
    setBusy(true)
    try {
      await dispatch((d, ctx) => upsertBrand(d, ctx, brand))
      // Select it immediately: the only reason to be here is to use it.
      setBrand(brand.id, brand)
      toast.success(`${name} added`)
      setBrandModal(false)
      setBrandForm({ name: '', segment: 'F&B' })
      setBrandError('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the brand')
    } finally {
      setBusy(false)
    }
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
        subtitle={
          // Was hardcoded to the demo's 50. A real portfolio grows from nothing,
          // and a heading that contradicts the count beside it reads as a bug.
          scopedOutlets.length === 0
            ? 'Master data — no outlets yet'
            : `Master data for the ${scopedOutlets.length}-outlet portfolio`
        }
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
          <Field
            label="Brand"
            required
            error={errors.brandId}
            htmlFor="outlet-brand"
            hint={data.brands.length === 0 ? 'No brands yet — add your first one.' : undefined}
          >
            <div className="flex gap-2">
              <Select id="outlet-brand" value={form.brandId} onChange={(e) => setBrand(e.target.value)} invalid={!!errors.brandId} className="min-w-0 flex-1">
                <option value="">{data.brands.length ? 'Select brand…' : 'No brands yet'}</option>
                {data.brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {b.segment}
                  </option>
                ))}
              </Select>
              <button type="button" className="btn-secondary shrink-0 px-3" onClick={() => setBrandModal(true)} title="Add a brand">
                <Plus className="h-4 w-4" aria-hidden />
                <span className="sr-only">Add a brand</span>
              </button>
            </div>
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
          {/* Free text with suggestions, not a fixed list. The options were derived
              from the regions of existing outlets, so on an empty portfolio the
              dropdown was empty and could never be filled — the first outlet was
              impossible to create. Typing also lets each client use their own
              geography instead of one baked into the product. */}
          <Field
            label="Region"
            required
            error={errors.region}
            htmlFor="outlet-region"
            hint={regions.length ? 'Pick an existing region or type a new one.' : 'Type a region, e.g. Doha Central.'}
          >
            <Input
              id="outlet-region"
              list="outlet-regions"
              value={form.region}
              onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
              placeholder="e.g. Doha Central"
              invalid={!!errors.region}
              autoComplete="off"
            />
            <datalist id="outlet-regions">
              {regions.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
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

      {/* ── New brand ──
          Sits above the outlet dialog rather than replacing it, so the outlet
          being filled in is not lost. The segment lives on the brand, which is
          why it is asked for here and derived there. */}
      <Modal
        open={brandModal}
        onClose={() => { setBrandModal(false); setBrandError('') }}
        title="Add a brand"
        description="Every outlet belongs to a brand, and the brand sets its segment."
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => { setBrandModal(false); setBrandError('') }} disabled={busy}>
              Cancel
            </button>
            <button type="submit" form="brand-form" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Add brand'}
            </button>
          </>
        }
      >
        <form id="brand-form" onSubmit={submitBrand} className="space-y-4" noValidate>
          <Field label="Brand name" required error={brandError} htmlFor="brand-name">
            <Input
              id="brand-name"
              value={brandForm.name}
              onChange={(e) => { setBrandForm((f) => ({ ...f, name: e.target.value })); setBrandError('') }}
              placeholder="e.g. Urban Fork"
              invalid={!!brandError}
              autoComplete="off"
            />
          </Field>
          <Field label="Segment" required htmlFor="brand-segment" hint="Determines which subcategories its outlets may use.">
            <Select id="brand-segment" value={brandForm.segment} onChange={(e) => setBrandForm((f) => ({ ...f, segment: e.target.value as Segment }))}>
              <option value="F&B">F&amp;B</option>
              <option value="Entertainment">Entertainment</option>
            </Select>
          </Field>
        </form>
      </Modal>
    </div>
  )
}
