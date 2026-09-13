import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  AlertOctagon,
  Building2,
  ClipboardList,
  Database,
  FileJson,
  FileSpreadsheet,
  FileText,
  Gauge,
  History,
  Image as ImageIcon,
  ListChecks,
  Package,
  Printer,
  ScrollText,
  Shield,
  Users as UsersIcon,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import { ROLE_LABELS } from '@/config/permissions'
import { logExport } from '@/services/actions'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/States'
import { exportCsv, exportExcel, exportJson, printPage, type ExportRow } from '@/utils/export'
import { CATEGORY_KEYS, CATEGORY_LABELS } from '@/utils/scoring'
import { fmtDate, fmtDateTime, fmtNumber } from '@/utils/format'
import type { CategoryScores } from '@/types'

type Format = 'CSV' | 'Excel' | 'JSON'

interface ExportDataset {
  key: string
  title: string
  description: string
  icon: LucideIcon
  /** Excel sheet name (max 31 chars) */
  sheet: string
  rows: ExportRow[]
}

function flattenCategories(cs: CategoryScores | null): ExportRow {
  const out: ExportRow = {}
  CATEGORY_KEYS.forEach((k) => {
    out[CATEGORY_LABELS[k]] = cs ? cs[k] : null
  })
  return out
}

export default function ExportsPage() {
  useDocumentTitle('Exports')
  const now = useNow()
  const { can } = useAuth()
  const { data, dispatch, scopedOutlets, scopedVisits, scopedOutletIds } = useData()
  const [busy, setBusy] = useState<string | null>(null)

  const stamp = fmtDate(now, 'yyyyMMdd')

  const datasets = useMemo<ExportDataset[]>(() => {
    const outletById = new Map(data.outlets.map((o) => [o.id, o]))
    const shopperById = new Map(data.shoppers.map((s) => [s.id, s]))
    const questionById = new Map(data.questions.map((q) => [q.id, q]))
    const sectionById = new Map(data.sections.map((s) => [s.id, s]))
    const visitIds = new Set(scopedVisits.map((v) => v.id))
    const findingById = new Map(data.findings.map((f) => [f.id, f]))
    const userById = new Map(data.users.map((u) => [u.id, u]))

    const inScope = (outletId: string) => scopedOutletIds.size === 0 || scopedOutletIds.has(outletId)

    const list: ExportDataset[] = [
      {
        key: 'outlets',
        title: 'Outlets',
        description: 'Outlet master data with derived performance: latest score, trend, risk rating, rank, open issues and category breakdown.',
        icon: Building2,
        sheet: 'Outlets',
        rows: scopedOutlets.map((o) => ({
          Code: o.code,
          Name: o.name,
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
          'Main Audits Completed': o.mainAuditsCompleted,
          'Follow-ups Completed': o.followUpsCompleted,
          'Last Audit': o.lastAudit ?? '',
          'Next Audit': o.nextAudit ?? '',
          'Overall Score': o.overallScore,
          'Previous Score': o.previousScore,
          'Score Change': o.overallScore !== null && o.previousScore !== null ? Math.round((o.overallScore - o.previousScore) * 10) / 10 : null,
          'Risk Rating': o.riskRating,
          Rank: o.rank,
          'Open Issues': o.openIssues,
          'Critical Findings': o.criticalFindings,
          ...flattenCategories(o.categoryScores),
        })),
      },
      {
        key: 'visits',
        title: 'Visits',
        description: 'Every assessment in scope with outlet and shopper names, workflow status, SLA outcome and category scores.',
        icon: ClipboardList,
        sheet: 'Visits',
        rows: scopedVisits.map((v) => ({
          Code: v.code,
          Outlet: outletById.get(v.outletId)?.name ?? v.outletId,
          'Outlet Code': outletById.get(v.outletId)?.code ?? '',
          Type: v.type,
          Journey: v.journey,
          Shopper: v.shopperId ? (shopperById.get(v.shopperId)?.name ?? v.shopperId) : 'Unassigned',
          'Scheduled Date': v.scheduledDate,
          'Visit Date': v.visitDate ?? '',
          'Submitted At': v.submittedAt ?? '',
          'Submission Deadline': v.submissionDeadline ?? '',
          Status: v.status,
          'Report Status': v.reportStatus,
          'SLA Status': v.slaStatus,
          Score: v.score,
          Risk: v.risk ?? '',
          'Critical Findings': v.criticalCount,
          Progress: v.progress,
          'Party Size': v.partySize,
          Spend: v.spend,
          Reviewer: v.reviewerId ? (userById.get(v.reviewerId)?.name ?? v.reviewerId) : '',
          'Reviewed At': v.reviewedAt ?? '',
          ...flattenCategories(v.categoryScores),
        })),
      },
      {
        key: 'answers',
        title: 'Visit answers',
        description: 'Question-level responses joined with the questionnaire: section, KPI category, question code and text, score and comments.',
        icon: ListChecks,
        sheet: 'Visit answers',
        rows: data.answers
          .filter((a) => visitIds.has(a.visitId))
          .map((a) => {
            const q = questionById.get(a.questionId)
            const sec = q ? sectionById.get(q.sectionId) : undefined
            const v = scopedVisits.find((x) => x.id === a.visitId)
            return {
              Visit: v?.code ?? a.visitId,
              Outlet: v ? (outletById.get(v.outletId)?.name ?? v.outletId) : '',
              Section: sec?.title ?? '',
              Category: sec ? CATEGORY_LABELS[sec.category] : '',
              'Question Code': q?.code ?? a.questionId,
              Question: q?.text ?? '',
              'Question Type': q?.type ?? '',
              Critical: q?.critical ?? false,
              Weight: q?.weight ?? null,
              Answer: a.na ? 'N/A' : a.value === null ? '' : typeof a.value === 'boolean' ? (a.value ? 'Yes' : 'No') : a.value,
              'Not Applicable': a.na,
              Score: a.score,
              Comment: a.comment,
              'Evidence Count': a.evidenceIds.length,
            }
          }),
      },
      {
        key: 'findings',
        title: 'Findings',
        description: 'Issues raised from assessments with severity, status, repeat flag and links to the originating visit and corrective action.',
        icon: AlertOctagon,
        sheet: 'Findings',
        rows: data.findings
          .filter((f) => inScope(f.outletId))
          .map((f) => ({
            Code: f.code,
            Outlet: outletById.get(f.outletId)?.name ?? f.outletId,
            Visit: data.visits.find((v) => v.id === f.visitId)?.code ?? f.visitId,
            Category: CATEGORY_LABELS[f.category],
            Title: f.title,
            Description: f.description,
            Severity: f.severity,
            Status: f.status,
            Repeated: f.repeated,
            'Created At': f.createdAt,
            'Corrective Action': f.correctiveActionId ? (data.correctiveActions.find((c) => c.id === f.correctiveActionId)?.code ?? f.correctiveActionId) : '',
            Alert: f.alertId ? (data.alerts.find((al) => al.id === f.alertId)?.code ?? f.alertId) : '',
          })),
      },
      {
        key: 'alerts',
        title: 'Alerts',
        description: 'Escalation queue with owner, severity, escalation deadline and acknowledgement / resolution timestamps.',
        icon: Shield,
        sheet: 'Alerts',
        rows: data.alerts
          .filter((a) => inScope(a.outletId))
          .map((a) => ({
            Code: a.code,
            Type: a.type,
            Severity: a.severity,
            Outlet: outletById.get(a.outletId)?.name ?? a.outletId,
            Title: a.title,
            Description: a.description,
            Status: a.status,
            Owner: a.ownerId ? (userById.get(a.ownerId)?.name ?? a.ownerId) : 'Unassigned',
            'Created At': a.createdAt,
            'Escalation Due': a.escalationDue,
            'Acknowledged At': a.acknowledgedAt ?? '',
            'Resolved At': a.resolvedAt ?? '',
            'History Entries': a.history.length,
          })),
      },
      {
        key: 'actions',
        title: 'Corrective actions',
        description: 'CAPA register: root cause, containment, corrective and preventive actions, owner, target date and audit-trail depth.',
        icon: Wrench,
        sheet: 'Corrective actions',
        rows: data.correctiveActions
          .filter((c) => inScope(c.outletId))
          .map((c) => ({
            Code: c.code,
            Outlet: outletById.get(c.outletId)?.name ?? c.outletId,
            Finding: findingById.get(c.findingId)?.code ?? c.findingId,
            Category: CATEGORY_LABELS[c.category],
            Title: c.title,
            Description: c.description,
            'Root Cause': c.rootCause,
            'Immediate Action': c.immediateAction,
            'Corrective Action': c.correctiveAction,
            'Preventive Action': c.preventiveAction,
            Owner: c.ownerName,
            Priority: c.priority,
            Status: c.status,
            'Created At': c.createdAt,
            'Target Date': c.targetDate,
            'Closure Date': c.closureDate ?? '',
            'Verification Note': c.verificationNote ?? '',
            'Evidence Count': c.evidenceIds.length,
            'History Entries': c.history.length,
          })),
      },
      {
        key: 'evidence',
        title: 'Evidence index',
        description: 'Catalogue of captured photos, videos, receipts and documents with capture time, uploader, file name and size.',
        icon: ImageIcon,
        sheet: 'Evidence index',
        rows: data.evidence
          .filter((e) => inScope(e.outletId))
          .map((e) => ({
            'Evidence ID': e.id,
            Visit: data.visits.find((v) => v.id === e.visitId)?.code ?? e.visitId,
            Outlet: outletById.get(e.outletId)?.name ?? e.outletId,
            Category: CATEGORY_LABELS[e.category],
            Type: e.type,
            Title: e.title,
            Description: e.description,
            Question: e.questionId ? (questionById.get(e.questionId)?.code ?? e.questionId) : '',
            'Captured At': e.capturedAt,
            'Uploaded At': e.uploadedAt,
            'Uploaded By': e.uploadedBy,
            'File Name': e.fileName,
            'Size (KB)': e.sizeKb,
          })),
      },
    ]

    if (can('shoppers.view')) {
      list.push({
        key: 'shoppers',
        title: 'Shoppers',
        description: 'Mystery-shopper panel with profile, languages, availability, training and certification status and quality metrics.',
        icon: UsersIcon,
        sheet: 'Shoppers',
        rows: data.shoppers.map((s) => ({
          Code: s.code,
          Name: s.name,
          Email: s.email,
          Phone: s.phone,
          Gender: s.gender,
          'Age Range': s.ageRange,
          Nationality: s.nationality,
          'Profile Type': s.profileType,
          Languages: s.languages.join('; '),
          'Experience (years)': s.experienceYears,
          'Assigned Categories': s.assignedCategories.join('; '),
          Availability: s.availability,
          'Training Status': s.trainingStatus,
          'Certification Status': s.certificationStatus,
          'Completed Visits': s.completedVisits,
          'Avg Report Quality': s.avgReportQuality,
          'On-time Submission %': s.onTimeSubmissionPct,
          Status: s.status,
        })),
      })
    }

    if (can('admin.users')) {
      list.push({
        key: 'users',
        title: 'Users',
        description: 'Platform accounts with role, outlet authorisation, MFA enrolment and last sign-in.',
        icon: Shield,
        sheet: 'Users',
        rows: data.users.map((u) => ({
          Name: u.name,
          Email: u.email,
          Title: u.title,
          Role: ROLE_LABELS[u.role],
          Status: u.status,
          'Authorised Outlets': u.outletIds.length ? u.outletIds.map((id) => outletById.get(id)?.code ?? id).join('; ') : 'All',
          Brands: u.brandIds.length ? u.brandIds.map((id) => data.brands.find((b) => b.id === id)?.name ?? id).join('; ') : 'All',
          'MFA Enabled': u.mfaEnabled,
          'Last Login': u.lastLogin ?? 'Never',
          'Created At': u.createdAt,
        })),
      })
    }

    if (can('admin.logs')) {
      list.push({
        key: 'activity',
        title: 'Activity logs',
        description: 'Immutable audit trail of user and system actions with module, record, IP address and outcome.',
        icon: ScrollText,
        sheet: 'Activity logs',
        rows: data.activityLogs.map((l) => ({
          Timestamp: l.timestamp,
          User: l.userName,
          Action: l.action,
          Module: l.module,
          'Record ID': l.recordId,
          IP: l.ip,
          Result: l.result,
          Details: l.details ?? '',
        })),
      })
    }

    list.push({
      key: 'kpi',
      title: 'KPI configuration',
      description: 'Scoring model: category weights, targets, critical thresholds, data source and applicability.',
      icon: Gauge,
      sheet: 'KPI configuration',
      rows: data.kpiConfig.map((k) => ({
        Key: k.key,
        Name: k.name,
        Description: k.description,
        'Weight %': k.weight,
        'Target %': k.target,
        'Critical Threshold %': k.criticalThreshold,
        'Data Source': k.dataSource,
        'Applicable To': k.applicableTo === 'all' ? 'All segments' : k.applicableTo.join('; '),
      })),
    })

    return list
  }, [data, scopedOutlets, scopedVisits, scopedOutletIds, can])

  const totalRecords = datasets.reduce((sum, d) => sum + d.rows.length, 0)

  const log = async (what: string, format: string) => {
    try {
      await dispatch((d, ctx) => logExport(d, ctx, what, format))
    } catch {
      /* the file has already been produced — logging is best-effort */
    }
  }

  const runExport = async (ds: ExportDataset, fmt: Format) => {
    if (!ds.rows.length) {
      toast.error(`There is no ${ds.title.toLowerCase()} data in your scope to export.`)
      return
    }
    const id = `${ds.key}:${fmt}`
    setBusy(id)
    try {
      const filename = `insight360-${ds.key}-${stamp}`
      if (fmt === 'CSV') exportCsv(ds.rows, filename)
      else if (fmt === 'JSON') exportJson({ dataset: ds.title, generatedAt: fmtDateTime(now), rowCount: ds.rows.length, rows: ds.rows }, filename)
      else await exportExcel([{ name: ds.sheet, rows: ds.rows }], filename)
      await log(`${ds.title} (${ds.rows.length} rows)`, fmt)
      toast.success(`${ds.title} exported — ${fmtNumber(ds.rows.length)} rows (${fmt})`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(null)
    }
  }

  const exportPack = async () => {
    setBusy('pack')
    try {
      await exportExcel(
        datasets.map((d) => ({ name: d.sheet, rows: d.rows })),
        `insight360-data-pack-${stamp}`,
      )
      await log(`Full data pack (${datasets.length} sheets, ${totalRecords} rows)`, 'Excel')
      toast.success(`Data pack exported — ${datasets.length} sheets, ${fmtNumber(totalRecords)} rows`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(null)
    }
  }

  const printSummary = async () => {
    setBusy('print')
    try {
      printPage()
      await log(`Export summary (${datasets.length} datasets)`, 'Print')
      toast.success('Print dialog opened for the export summary')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open the print dialog')
    } finally {
      setBusy(null)
    }
  }

  const recentExports = useMemo(
    () => data.activityLogs.filter((l) => l.module === 'Exports').sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 12),
    [data.activityLogs],
  )

  return (
    <div className="space-y-5">
      <div className="no-print space-y-5">
        <PageHeader
          title="Exports"
          subtitle="Download datasets for offline analysis"
          badge={<Badge tone="teal" icon={Database}>{fmtNumber(totalRecords)} records in scope</Badge>}
          actions={
            <>
              <button type="button" className="btn-secondary" onClick={printSummary} disabled={busy !== null}>
                <Printer className="h-4 w-4" aria-hidden /> Print-friendly summary
              </button>
              <button type="button" className="btn-primary" onClick={exportPack} disabled={busy !== null}>
                <Package className="h-4 w-4" aria-hidden /> {busy === 'pack' ? 'Building…' : 'Full data pack (Excel)'}
              </button>
            </>
          }
        />

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Exports respect your outlet authorisation — {fmtNumber(scopedOutlets.length)} outlet{scopedOutlets.length === 1 ? '' : 's'} and {fmtNumber(scopedVisits.length)} visit
          {scopedVisits.length === 1 ? '' : 's'} are included. CSV is UTF-8 with a byte-order mark so Excel opens it cleanly; Excel files contain one sheet per dataset.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {datasets.map((ds) => {
            const Icon = ds.icon
            const empty = ds.rows.length === 0
            return (
              <Card key={ds.key} className="flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{ds.title}</h3>
                      <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">{fmtNumber(ds.rows.length)} rows</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{ds.description}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-navy-800">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => void runExport(ds, 'CSV')} disabled={busy !== null || empty}>
                    <FileText className="h-3.5 w-3.5" aria-hidden /> CSV
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => void runExport(ds, 'Excel')} disabled={busy !== null || empty}>
                    <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> {busy === `${ds.key}:Excel` ? 'Building…' : 'Excel'}
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => void runExport(ds, 'JSON')} disabled={busy !== null || empty}>
                    <FileJson className="h-3.5 w-3.5" aria-hidden /> JSON
                  </button>
                  {empty && <span className="self-center text-[11px] text-slate-400">Nothing in scope</span>}
                </div>
              </Card>
            )
          })}
        </div>

        <Card>
          <CardHeader title="Recent exports" subtitle="Read from the activity log — every download is recorded" />
          <CardBody className="p-0">
            {recentExports.length === 0 ? (
              <EmptyState title="No exports yet" message="Downloads you generate from this page will be listed here." icon={History} />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-navy-800">
                {recentExports.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5">
                    <time className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400" dateTime={l.timestamp}>
                      {fmtDateTime(l.timestamp)}
                    </time>
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-100">{l.userName}</span>
                    <span className="text-xs text-slate-600 dark:text-slate-300">{l.recordId}</span>
                    {l.details && (
                      <Badge tone="slate" size="xs">
                        {l.details}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ── Print-only compact summary ── */}
      <section className="hidden print:block print-area">
        <h1 className="text-xl font-semibold text-slate-900">INSIGHT360 — Export summary</h1>
        <p className="mt-1 text-sm text-slate-600">
          {data.organization.name} · {data.organization.engagementName} · generated {fmtDateTime(now)}
        </p>
        <table className="mt-4 w-full border-collapse text-sm">
          <caption className="sr-only">Record counts per exportable dataset</caption>
          <thead>
            <tr>
              <th className="border-b border-slate-300 py-1.5 text-left font-semibold text-slate-700">Dataset</th>
              <th className="border-b border-slate-300 py-1.5 text-right font-semibold text-slate-700">Records</th>
              <th className="border-b border-slate-300 py-1.5 text-left font-semibold text-slate-700">Contents</th>
            </tr>
          </thead>
          <tbody>
            {datasets.map((ds) => (
              <tr key={ds.key}>
                <td className="border-b border-slate-200 py-1.5 pr-3 align-top font-medium text-slate-800">{ds.title}</td>
                <td className="border-b border-slate-200 py-1.5 pr-3 text-right align-top tabular-nums text-slate-800">{fmtNumber(ds.rows.length)}</td>
                <td className="border-b border-slate-200 py-1.5 align-top text-xs text-slate-600">{ds.description}</td>
              </tr>
            ))}
            <tr>
              <td className="py-1.5 pr-3 font-semibold text-slate-900">Total</td>
              <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-slate-900">{fmtNumber(totalRecords)}</td>
              <td className="py-1.5 text-xs text-slate-600">
                {fmtNumber(scopedOutlets.length)} outlets · {fmtNumber(scopedVisits.length)} visits within your authorisation
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  )
}
