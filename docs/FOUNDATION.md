# INSIGHT360 — Foundation Guide for Page Development

This document describes the shared foundation every page is built on. Read it fully before writing a page. **Do not modify foundation files** (types, contexts, services, ui components) — if something is missing, implement it locally inside your page file.

## Stack & conventions

- React 19 + TypeScript 6 (`strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly` → **no TS enums, use `import type`** for types).
- Tailwind 3 with `darkMode: 'class'`. Every colour must have a dark variant (`dark:`). Palette: `navy-*`, `teal-*`, slate, amber for warnings, red only for critical.
- Path alias `@/` → `src/`.
- Pages are default-exported components in `src/pages/<group>/<Name>Page.tsx` and are lazy-loaded by `src/App.tsx`.
- Icons: `lucide-react`. Charts: `recharts` via the wrappers in `@/components/charts`. Toasts: `react-hot-toast` (`import toast from 'react-hot-toast'`).
- Dates are ISO strings (`yyyy-MM-ddTHH:mm:ss` or `yyyy-MM-dd`). Use helpers from `@/utils/format`.
- **Never use random values in render.** All data comes from the dataset.
- Do not communicate status by colour alone — use `StatusBadge`/`RiskBadge`/`SeverityBadge` (icon + text).
- Keep everything responsive (grid `sm:`/`lg:` breakpoints, tables inside `.table-wrap`).

## Domain types — `src/types/index.ts`

Key entities: `User`, `Outlet`, `Brand`, `Shopper`, `AuditTemplate`, `Section`, `Question`, `Visit`, `VisitAnswer`, `Evidence`, `Finding`, `Alert`, `CorrectiveAction`, `Comment`, `Notification`, `ActivityLog`, `KpiConfig`, `ManagementReport`, `NotificationRule`, `OrganizationSettings`, `Dataset`.

- `CategoryKey` = `'customer_experience' | 'service_speed' | 'operational_compliance' | 'product_environment' | 'upselling_sales' | 'safety_entertainment'`. Labels: `CATEGORY_LABELS` / `CATEGORY_SHORT` / `CATEGORY_KEYS` from `@/utils/scoring`.
- `Visit.status`: Planned | Assigned | In Progress | Draft | Submitted | Under Review | Approved | Rejected | Closed. `Visit.type`: 'Main Audit 1' | 'Follow-up 1' | 'Main Audit 2' | 'Follow-up 2'. `Visit.score` is null until submitted. `Visit.categoryScores: Record<CategoryKey, number> | null`.
- `Outlet` has derived fields already computed: `overallScore`, `previousScore`, `riskRating` ('Excellent'|'Good'|'Needs Improvement'|'Critical'|'Not Assessed'), `rank`, `openIssues`, `criticalFindings`, `categoryScores`, `lastAudit`, `nextAudit`, `mainAuditsCompleted`, `followUpsCompleted`, `mapX/mapY` (0–100 grid for map-style cards).
- `Finding.status`: Open | In Progress | Resolved | Closed | Verified; `severity`: Critical | High | Medium | Low; `repeated: boolean`; `correctiveActionId`, `alertId`.
- `Alert.status`: New | Acknowledged | Investigating | Action Required | Resolved | Closed; has `history[]`, `escalationDue`, `ownerId`.
- `CorrectiveAction.status`: Open | Assigned | In Progress | Awaiting Evidence | Awaiting Verification | Closed | Overdue; fields rootCause / immediateAction / correctiveAction / preventiveAction / ownerId / ownerName / priority / targetDate / evidenceIds / closureDate / history[].
- `Evidence.type`: Photo | Video | Receipt | Screenshot | Document; `visualSeed` drives the placeholder SVG.

## Contexts / hooks

```ts
import { useAuth } from '@/contexts/AuthContext'
// { user, role, can(permission), scopedOutletIds, signOut }
import { useData } from '@/contexts/DataContext'
// { data: Dataset, dispatch(recipe), uploadEvidence(file|null, meta), resetDemo(),
//   scopedOutlets: Outlet[], scopedVisits: Visit[], scopedOutletIds: Set<string> }
// ALWAYS use scopedOutlets / scopedVisits (not data.outlets / data.visits) for lists so ops managers
// only see assigned outlets and shoppers only see their own visits. Use data.* for lookups by id.
import { useFilters } from '@/contexts/FilterContext'   // { period, periodMonths, outletScope }
import { useNow, useDocumentTitle, useDebounce, useMediaQuery, usePagination } from '@/hooks'
// useNow() returns the fixed demo date (2026-09-13 10:00) in demo mode — use it for all "today" logic.
```

### Mutations — `dispatch` + reducers from `@/services/actions`

```ts
const { dispatch } = useData()
await dispatch((d, ctx) => approveVisit(d, ctx, visitId, comment))
```
Available reducers (all `(data, ctx, ...args) => DatasetPatch`): `startVisit`, `saveDraft(visitId, answers)`, `submitVisit(visitId, answers, narrative)`, `startReview`, `approveVisit(visitId, comment)`, `rejectVisit(visitId, reason)`, `assignShopper(visitId, shopperId)`, `createVisit(input: NewVisitInput)`, `addEvidence(evidence, answerLink?)`, `updateAlert(alertId, status, note?)`, `assignAlertOwner(alertId, ownerId)`, `createCorrectiveAction(input: NewCapaInput)`, `updateCorrectiveAction(id, patch, note?)`, `updateFinding(id, patch)`, `addComment(entityType, entityId, text)`, `markNotificationRead(data, id|'all')` (no ctx), `createUser(input: NewUserInput)`, `updateUser(id, patch)`, `resetPassword(id)`, `updateKpiConfig(list)`, `updateNotificationRule(id, patch)`, `updateOrganization(patch)`, `upsertOutlet(outlet)`, `updateShopperTraining(shopperId, moduleId, status)`, `updateShopper(id, patch)`, `cloneTemplate(id)`, `createTemplate(input)`, `updateTemplate(id, patch)`, `upsertSection(section)`, `deleteSection(id)`, `upsertQuestion(question)`, `deleteQuestion(id)`, `createReport(report)`, `logExport(what, format)`.
Helpers: `getVisitSections(data, visit)`, `getVisitQuestions(data, visit)`.
Wrap dispatch calls with `toast.success(...)` / `toast.error(...)`. Read-only roles (`executive`, `analyst`) must not see mutation buttons — check `can('...')` from `@/config/permissions` keys.

### Analytics selectors — `@/services/analytics`

`kpiSummary(data, outlets)`, `monthlyTrend(visits, findings, actions, now, months)`, `rankedOutlets(outlets)`, `mainVsFollowUp(visits)`, `segmentComparison(outlets)`, `categoryAverages(outlets)`, `brandScores(outlets)`, `benchmarksFor(outlet, outlets)`, `percentile(outlet, outlets)`, `slaStats(visits, now)`, `capaStats(actions, now)`, `heatmapRows(outlets)`, `generateInsights(data, outlets, now)`, `outletVisitHistory(visits, outletId)`, `latestCompletedVisit(visits, outletId)`, `categoryScoresToRadar(cs, label)`, `scopeOutlets(outlets, scopedIds, outletScope)`.
Visit predicates from `@/services/derive`: `isCompleted`, `isScored`, `isAwaitingApproval`, `isInProgress`, `isMainAudit`, `isFollowUp`, `isOpenFinding`.
Scoring: `computeVisitScores(questions, sections, answers, kpiConfig, thresholds)` → `{ overall, categoryScores, sectionScores, criticalFailures, risk, progress, answeredMandatory, totalMandatory }`; `scoreQuestion(q, value, na)`; `isQuestionAnswered(q, answer)`; `riskFromScore(score)`.

## UI components

```ts
import { Card, CardHeader, CardBody } from '@/components/ui/Card'          // Card props: className, padded, tour
import { KpiCard } from '@/components/ui/KpiCard'                          // label, value, delta, deltaSuffix, invertDelta, sub, icon, tone ('default'|'good'|'warn'|'critical'|'accent'), onClick, tour, compact
import { Badge, StatusBadge, RiskBadge, SeverityBadge, ScoreBadge, SegmentBadge, scoreTextClass, scoreBarClass } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'         // columns[{key, header, render?, sortValue?, sortable?, align?, width?, className?}], rows, rowKey, onRowClick, pageSize (0 = no paging), dense, initialSort, rowClassName, selectedKey, emptyTitle, emptyMessage, maxHeight
import { Modal, ConfirmDialog, Drawer } from '@/components/ui/Modal'       // Modal{open,onClose,title,description,children,footer,size}; ConfirmDialog{open,title,message,confirmLabel,tone,onConfirm,onCancel,busy}; Drawer{open,onClose,title,subtitle,children,footer,width,tour}
import { EmptyState, LoadingState, ErrorState, Skeleton } from '@/components/ui/States'
import { Field, Input, Select, Textarea, Checkbox, Toggle, SegmentedControl } from '@/components/ui/Form'
import { PageHeader } from '@/components/ui/PageHeader'                    // title, subtitle, actions, badge
import { Avatar, ProgressBar, Tabs, Timeline, Stat, DescriptionList, Divider, AutomatedLabel } from '@/components/ui/Misc'
import { EvidenceVisual, EvidenceCard, EvidencePreviewModal, evidenceIcon } from '@/components/ui/EvidenceThumb'
import { FilterBar, applyFilters, matchesSearch, type FilterDef } from '@/components/ui/FilterBar'
import { ChartCard, TrendChart, RadarCompareChart, HBarChart, GroupedBarChart, DonutChart, Heatmap, HeatLegend, Sparkline, CHART_COLORS, SERIES_COLORS, scoreColor } from '@/components/charts'
import { exportCsv, exportExcel, exportElementToPdf, printPage, exportJson } from '@/utils/export'
import { fmtDate, fmtDateTime, fmtPct, fmtScore, fmtDelta, fmtNumber, fmtCurrency, relativeTime, daysBetween, hoursBetween, avg, round, riskFromScore, truncate } from '@/utils/format'
import { cn } from '@/utils/cn'
```

CSS utility classes available (see `src/index.css`): `card`, `card-header`, `card-title`, `card-subtitle`, `card-body`, `btn-primary`, `btn-accent`, `btn-secondary`, `btn-ghost`, `btn-danger`, `btn-sm`, `input`, `select`, `label`, `table-wrap`, `table`, `page-title`, `page-subtitle`, `section-title`, `link`, `tab`, `tab-active`, `kbd`, `no-print`, `print-area`.

### FilterBar usage pattern

```tsx
const [search, setSearch] = useState('')
const [filters, setFilters] = useState<Record<string, string>>({})
const rows = useMemo(() => matchesSearch(applyFilters(scopedVisits, filters, { status: v => v.status, type: v => v.type }), search, v => [v.code, outletName(v.outletId)]), [...])
<FilterBar search={search} onSearch={setSearch} filters={[{ key: 'status', label: 'Status', options: [...] }]} values={filters} onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))} onReset={() => { setFilters({}); setSearch('') }} resultCount={rows.length} />
```

Query-string deep links: use `useSearchParams()` from react-router; e.g. `/quality/alerts?alert=<id>` opens that alert's drawer; `/quality/corrective-actions?action=<id>`; `/quality/findings?finding=<id>` and `?repeated=1`; `/performance/outlets?risk=Critical`; `/admin/users?user=<id>`; `/reports/management?report=<id>`.

Guided-demo anchors (`data-tour` attributes) that must exist: `outlet-table` (outlets page table card), `alert-detail` (alert drawer/panel), `capa-detail` (corrective action drawer/panel), `reports-list` (management reports list card). Add via `tour="..."` prop on Card/ChartCard/Drawer, or `data-tour` on an element.

Routes (for links): `/operations/visits/:id` (visit detail), `/operations/visits/:id/audit` (questionnaire), `/reports/visits/:id` (visit report), `/performance/outlets/:id` (outlet detail), `/operations/shoppers/:id`, `/quality/alerts?alert=`, `/quality/corrective-actions?action=`, `/quality/findings?finding=`, `/evidence?visit=<id>`.

Storyline ids: `import { STORYLINE } from '@/data/seed'` → `{ outletId, mainAuditVisitId, followUpVisitId, findingId, alertId, actionId }` (populated once the dataset is generated, which happens before any page renders).
