import { addHours, format } from 'date-fns'
import type {
  ActivityLog,
  Alert,
  AlertStatus,
  AuditTemplate,
  CapaStatus,
  Comment,
  CorrectiveAction,
  Dataset,
  Evidence,
  Finding,
  JourneyType,
  KpiConfig,
  ManagementReport,
  Notification,
  NotificationRule,
  OrganizationSettings,
  Outlet,
  Question,
  Role,
  Section,
  Shopper,
  TrainingStatus,
  User,
  Visit,
  VisitAnswer,
  VisitType,
} from '@/types'
import type { DatasetPatch } from '@/repositories/types'
import { CATEGORY_KEYS, computeVisitScores } from '@/utils/scoring'

/**
 * Pure action reducers. Each returns a DatasetPatch (only the collections that changed) so the
 * DataContext can apply it in memory and hand the same patch to the repository for persistence.
 */

export interface ActionContext {
  user: User
  now: Date
}

const iso = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm:ss")
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`

/** Reports are due within 24 to 48 hours, so grade the 24h target band separately. */
function gradeSla(submittedAt: Date, visitEnd: string, deadline: string, targetHours: number): Visit['slaStatus'] {
  if (submittedAt > new Date(deadline)) return 'Breached'
  return submittedAt <= addHours(new Date(visitEnd), targetHours) ? 'Within Target' : 'Within SLA'
}

function withLog(data: Dataset, ctx: ActionContext, action: string, module: string, recordId: string, details?: string, result: ActivityLog['result'] = 'Success'): ActivityLog[] {
  const entry: ActivityLog = {
    id: uid('log'),
    timestamp: iso(ctx.now),
    userId: ctx.user.id,
    userName: ctx.user.name,
    action,
    module,
    recordId,
    ip: '10.20.4.15',
    result,
    details,
  }
  return [entry, ...data.activityLogs]
}

function replace<T extends { id: string }>(list: T[], item: T): T[] {
  return list.map((x) => (x.id === item.id ? item : x))
}

export function getVisitSections(data: Dataset, visit: Visit): Section[] {
  const outlet = data.outlets.find((o) => o.id === visit.outletId)
  const segment = outlet?.segment ?? 'F&B'
  return data.sections.filter((s) => s.templateId === visit.templateId && (s.applicableTo === 'all' || s.applicableTo.includes(segment))).sort((a, b) => a.order - b.order)
}

export function getVisitQuestions(data: Dataset, visit: Visit): Question[] {
  const sectionIds = new Set(getVisitSections(data, visit).map((s) => s.id))
  return data.questions.filter((q) => sectionIds.has(q.sectionId)).sort((a, b) => a.order - b.order)
}

// ───────────────────────────── Visits ─────────────────────────────

export function startVisit(data: Dataset, ctx: ActionContext, visitId: string): DatasetPatch {
  const v = data.visits.find((x) => x.id === visitId)
  if (!v) return {}
  const updated: Visit = {
    ...v,
    status: 'In Progress',
    visitDate: format(ctx.now, 'yyyy-MM-dd'),
    visitStart: v.visitStart ?? iso(ctx.now),
    submissionDeadline: v.submissionDeadline ?? iso(addHours(ctx.now, data.organization.reportingSlaHours)),
    reportStatus: 'Draft',
    slaStatus: 'Pending',
  }
  return { visits: replace(data.visits, updated), activityLogs: withLog(data, ctx, 'Visit started', 'Visits', v.code) }
}

export function saveDraft(data: Dataset, ctx: ActionContext, visitId: string, answers: VisitAnswer[]): DatasetPatch {
  const v = data.visits.find((x) => x.id === visitId)
  if (!v) return {}
  const others = data.answers.filter((a) => a.visitId !== visitId)
  const res = computeVisitScores(getVisitQuestions(data, v), getVisitSections(data, v), answers, data.kpiConfig, data.thresholds)
  const updated: Visit = {
    ...v,
    status: v.status === 'Assigned' || v.status === 'Planned' ? 'In Progress' : v.status === 'Rejected' ? 'Draft' : v.status,
    progress: res.progress,
    visitStart: v.visitStart ?? iso(ctx.now),
    visitDate: v.visitDate ?? format(ctx.now, 'yyyy-MM-dd'),
    reportStatus: 'Draft',
  }
  if (updated.status === 'In Progress' && res.progress >= 80) updated.status = 'Draft'
  return { visits: replace(data.visits, updated), answers: [...others, ...answers], activityLogs: withLog(data, ctx, 'Draft saved', 'Visits', v.code, `${res.progress}% complete`) }
}

export function submitVisit(data: Dataset, ctx: ActionContext, visitId: string, answers: VisitAnswer[], narrative: string): DatasetPatch {
  const v = data.visits.find((x) => x.id === visitId)
  if (!v) return {}
  const outlet = data.outlets.find((o) => o.id === v.outletId)!
  const questions = getVisitQuestions(data, v)
  const sections = getVisitSections(data, v)
  const res = computeVisitScores(questions, sections, answers, data.kpiConfig, data.thresholds)
  const visitEnd = v.visitEnd ?? iso(ctx.now)
  const deadline = v.submissionDeadline ?? iso(addHours(new Date(visitEnd), data.organization.reportingSlaHours))
  const updated: Visit = {
    ...v,
    status: 'Submitted',
    visitEnd,
    submissionDeadline: deadline,
    submittedAt: iso(ctx.now),
    score: res.overall !== null ? Math.round(res.overall * 10) / 10 : null,
    categoryScores: res.categoryScores ? (Object.fromEntries(CATEGORY_KEYS.map((k) => [k, Math.round(res.categoryScores![k] * 10) / 10])) as Visit['categoryScores']) : null,
    risk: res.risk === 'Not Assessed' ? null : res.risk,
    reportStatus: 'Pending Review',
    slaStatus: gradeSla(ctx.now, visitEnd, deadline, data.organization.reportingTargetHours),
    narrative,
    criticalCount: res.criticalFailures.length,
    progress: 100,
    approvalHistory: [...v.approvalHistory, { at: iso(ctx.now), by: ctx.user.name, action: 'Submitted' }],
  }

  // Critical findings + alerts + notifications
  const findings: Finding[] = [...data.findings]
  const alerts: Alert[] = [...data.alerts]
  const notifications: Notification[] = [...data.notifications]
  for (const qid of res.criticalFailures) {
    const q = questions.find((x) => x.id === qid)!
    const sec = sections.find((s) => s.id === q.sectionId)!
    const a = answers.find((x) => x.questionId === qid)
    const fid = uid('fnd')
    const aid = uid('alr')
    findings.unshift({
      id: fid,
      code: `F-${format(ctx.now, 'yyMM')}-${fid.slice(-4).toUpperCase()}`,
      visitId: v.id,
      outletId: v.outletId,
      questionId: qid,
      category: sec.category,
      title: `Critical: ${q.text.replace(/\?$/, '')}`,
      description: a?.comment || `Critical question failed during ${v.type}.`,
      severity: 'Critical',
      status: 'Open',
      createdAt: iso(ctx.now),
      repeated: false,
      correctiveActionId: null,
      alertId: aid,
    })
    alerts.unshift({
      id: aid,
      code: `AL-${aid.slice(-4).toUpperCase()}`,
      severity: 'Critical',
      type: sec.category === 'safety_entertainment' ? (outlet.segment === 'F&B' ? 'Food Hygiene Failure' : 'CRITICAL SAFETY BREACH') : 'CRITICAL SAFETY BREACH',
      outletId: v.outletId,
      visitId: v.id,
      findingId: fid,
      title: `Critical: ${q.text.replace(/\?$/, '')} — ${outlet.name}`,
      description: a?.comment || q.text,
      createdAt: iso(ctx.now),
      escalationDue: iso(addHours(ctx.now, 12)),
      ownerId: data.users.find((u) => u.role === 'ops_manager' && u.outletIds.includes(v.outletId))?.id ?? 'usr-002',
      status: 'New',
      acknowledgedAt: null,
      resolvedAt: null,
      history: [{ at: iso(ctx.now), by: 'Alert Engine', action: 'Created', note: 'Critical question failed on submission' }],
    })
    notifications.unshift({
      id: uid('ntf'),
      type: 'critical_issue',
      title: 'Critical finding submitted',
      message: `${outlet.name} · ${q.text.replace(/\?$/, '')}`,
      createdAt: iso(ctx.now),
      read: false,
      link: `/quality/alerts?alert=${aid}`,
      severity: 'Critical',
      audience: ['super_admin', 'client_admin', 'ops_manager', 'executive'],
    })
  }
  notifications.unshift({
    id: uid('ntf'),
    type: 'approval_required',
    title: 'Report awaiting approval',
    message: `${v.code} · ${outlet.name} · ${v.type}`,
    createdAt: iso(ctx.now),
    read: false,
    link: `/operations/visits/${v.id}`,
    severity: 'Info',
    audience: ['super_admin', 'client_admin'],
  })
  return {
    visits: replace(data.visits, updated),
    answers: [...data.answers.filter((a) => a.visitId !== visitId), ...answers],
    findings,
    alerts,
    notifications,
    activityLogs: withLog(data, ctx, 'Report submitted', 'Visits', v.code, `Score ${updated.score?.toFixed(1)}% · ${res.criticalFailures.length} critical`),
  }
}

export function startReview(data: Dataset, ctx: ActionContext, visitId: string): DatasetPatch {
  const v = data.visits.find((x) => x.id === visitId)
  if (!v) return {}
  const updated: Visit = { ...v, status: 'Under Review', reviewerId: ctx.user.id, approvalHistory: [...v.approvalHistory, { at: iso(ctx.now), by: ctx.user.name, action: 'Review Started' }] }
  return { visits: replace(data.visits, updated), activityLogs: withLog(data, ctx, 'Review started', 'Reviews', v.code) }
}

export function approveVisit(data: Dataset, ctx: ActionContext, visitId: string, comment: string): DatasetPatch {
  const v = data.visits.find((x) => x.id === visitId)
  if (!v) return {}
  const updated: Visit = {
    ...v,
    status: 'Approved',
    reportStatus: 'Approved',
    reviewerId: ctx.user.id,
    reviewedAt: iso(ctx.now),
    reviewerComment: comment || 'Approved.',
    approvalHistory: [...v.approvalHistory, { at: iso(ctx.now), by: ctx.user.name, action: 'Approved', comment: comment || undefined }],
  }
  const outlet = data.outlets.find((o) => o.id === v.outletId)
  const alerts = [...data.alerts]
  const notifications = [...data.notifications]
  if (updated.score !== null && updated.score < 70) {
    const aid = uid('alr')
    alerts.unshift({
      id: aid,
      code: `AL-${aid.slice(-4).toUpperCase()}`,
      severity: 'High',
      type: 'Outlet Score Below 70%',
      outletId: v.outletId,
      visitId: v.id,
      findingId: null,
      title: `Outlet score ${updated.score.toFixed(1)}% below intervention threshold — ${outlet?.name ?? ''}`,
      description: `${v.type} approved with a score of ${updated.score.toFixed(1)}%, below the 70% critical threshold.`,
      createdAt: iso(ctx.now),
      escalationDue: iso(addHours(ctx.now, 24)),
      ownerId: data.users.find((u) => u.role === 'ops_manager' && u.outletIds.includes(v.outletId))?.id ?? 'usr-002',
      status: 'New',
      acknowledgedAt: null,
      resolvedAt: null,
      history: [{ at: iso(ctx.now), by: 'Alert Engine', action: 'Created', note: 'Rule: Outlet score below 70%' }],
    })
  }
  notifications.unshift({
    id: uid('ntf'),
    type: 'report_submitted',
    title: 'Report approved',
    message: `${v.code} · ${outlet?.name ?? ''} · ${updated.score?.toFixed(1)}%`,
    createdAt: iso(ctx.now),
    read: false,
    link: `/reports/visits/${v.id}`,
    severity: 'Info',
    audience: ['shopper', 'ops_manager', 'analyst'],
  })
  return { visits: replace(data.visits, updated), alerts, notifications, activityLogs: withLog(data, ctx, 'Reviewer approved', 'Reviews', v.code, `Score ${updated.score?.toFixed(1)}%`) }
}

export function rejectVisit(data: Dataset, ctx: ActionContext, visitId: string, reason: string): DatasetPatch {
  const v = data.visits.find((x) => x.id === visitId)
  if (!v) return {}
  const updated: Visit = {
    ...v,
    status: 'Rejected',
    reportStatus: 'Rejected',
    reviewerId: ctx.user.id,
    reviewedAt: iso(ctx.now),
    reviewerComment: reason,
    approvalHistory: [...v.approvalHistory, { at: iso(ctx.now), by: ctx.user.name, action: 'Rejected', comment: reason }],
  }
  const notifications: Notification[] = [
    { id: uid('ntf'), type: 'report_submitted', title: 'Report returned for revision', message: `${v.code} · ${reason}`, createdAt: iso(ctx.now), read: false, link: `/operations/visits/${v.id}`, severity: 'Medium', audience: ['shopper'] },
    ...data.notifications,
  ]
  return { visits: replace(data.visits, updated), notifications, activityLogs: withLog(data, ctx, 'Reviewer rejected', 'Reviews', v.code, reason) }
}

export function assignShopper(data: Dataset, ctx: ActionContext, visitId: string, shopperId: string): DatasetPatch {
  const v = data.visits.find((x) => x.id === visitId)
  if (!v) return {}
  const shopper = data.shoppers.find((s) => s.id === shopperId)
  const updated: Visit = { ...v, shopperId, status: v.status === 'Planned' ? 'Assigned' : v.status }
  const notifications: Notification[] = [
    { id: uid('ntf'), type: 'assignment', title: 'New visit assigned', message: `${v.code} · ${data.outlets.find((o) => o.id === v.outletId)?.name ?? ''} · ${v.scheduledDate}`, createdAt: iso(ctx.now), read: false, link: `/operations/visits/${v.id}`, severity: 'Info', audience: ['shopper'] },
    ...data.notifications,
  ]
  return { visits: replace(data.visits, updated), notifications, activityLogs: withLog(data, ctx, v.shopperId ? 'Shopper reassigned' : 'Shopper assigned', 'Assignments', v.code, shopper?.name) }
}

export interface NewVisitInput {
  outletId: string
  type: VisitType
  journey: JourneyType
  templateId: string
  scheduledDate: string
  shopperId: string | null
  scenarioId?: string | null
}

export function createVisit(data: Dataset, ctx: ActionContext, input: NewVisitInput): DatasetPatch {
  const seq = data.visits.length + 1
  const id = uid('vis')
  const visit: Visit = {
    id,
    code: `MS-${format(ctx.now, 'yy')}-${String(seq).padStart(4, '0')}`,
    outletId: input.outletId,
    type: input.type,
    journey: input.journey,
    templateId: input.templateId,
    shopperId: input.shopperId,
    scheduledDate: input.scheduledDate,
    visitDate: null,
    visitStart: null,
    visitEnd: null,
    submissionDeadline: null,
    submittedAt: null,
    status: input.shopperId ? 'Assigned' : 'Planned',
    score: null,
    categoryScores: null,
    risk: null,
    reportStatus: 'Not Started',
    slaStatus: 'Pending',
    reviewerId: null,
    reviewedAt: null,
    reviewerComment: null,
    approvalHistory: [],
    narrative: null,
    criticalCount: 0,
    spend: null,
    partySize: 2,
    scenarioId: input.scenarioId ?? 'scn-01',
    progress: 0,
  }
  return { visits: [visit, ...data.visits], activityLogs: withLog(data, ctx, 'Audit created', 'Visits', visit.code, `${input.type} · ${input.scheduledDate}`) }
}

// ───────────────────────────── Evidence ─────────────────────────────

export function addEvidence(data: Dataset, ctx: ActionContext, ev: Evidence, answerLink?: { visitId: string; questionId: string; answers: VisitAnswer[] }): DatasetPatch {
  const patch: DatasetPatch = { evidence: [ev, ...data.evidence], activityLogs: withLog(data, ctx, 'Evidence uploaded', 'Evidence', ev.id, ev.fileName) }
  if (answerLink) {
    const others = data.answers.filter((a) => a.visitId !== answerLink.visitId)
    patch.answers = [...others, ...answerLink.answers]
  }
  return patch
}

// ───────────────────────────── Alerts ─────────────────────────────

export function updateAlert(data: Dataset, ctx: ActionContext, alertId: string, status: AlertStatus, note?: string): DatasetPatch {
  const a = data.alerts.find((x) => x.id === alertId)
  if (!a) return {}
  const updated: Alert = {
    ...a,
    status,
    ownerId: a.ownerId ?? ctx.user.id,
    acknowledgedAt: a.acknowledgedAt ?? (status !== 'New' ? iso(ctx.now) : null),
    resolvedAt: status === 'Resolved' || status === 'Closed' ? (a.resolvedAt ?? iso(ctx.now)) : a.resolvedAt,
    history: [...a.history, { at: iso(ctx.now), by: ctx.user.name, action: status, note }],
  }
  let findings = data.findings
  if ((status === 'Resolved' || status === 'Closed') && a.findingId) {
    findings = data.findings.map((f) => (f.id === a.findingId && (f.status === 'Open' || f.status === 'In Progress') ? { ...f, status: 'Resolved' } : f))
  }
  return { alerts: replace(data.alerts, updated), findings, activityLogs: withLog(data, ctx, `Alert ${status.toLowerCase()}`, 'Alerts', a.code, note) }
}

export function assignAlertOwner(data: Dataset, ctx: ActionContext, alertId: string, ownerId: string): DatasetPatch {
  const a = data.alerts.find((x) => x.id === alertId)
  if (!a) return {}
  const owner = data.users.find((u) => u.id === ownerId)
  const updated: Alert = { ...a, ownerId, history: [...a.history, { at: iso(ctx.now), by: ctx.user.name, action: 'Owner assigned', note: owner?.name }] }
  return { alerts: replace(data.alerts, updated), activityLogs: withLog(data, ctx, 'Alert owner assigned', 'Alerts', a.code, owner?.name) }
}

// ───────────────────────────── Corrective actions ─────────────────────────────

export interface NewCapaInput {
  findingId: string
  title: string
  description: string
  rootCause: string
  immediateAction: string
  correctiveAction: string
  preventiveAction: string
  ownerId: string
  priority: CorrectiveAction['priority']
  targetDate: string
}

export function createCorrectiveAction(data: Dataset, ctx: ActionContext, input: NewCapaInput): DatasetPatch {
  const f = data.findings.find((x) => x.id === input.findingId)
  if (!f) return {}
  const id = uid('cap')
  const owner = data.users.find((u) => u.id === input.ownerId)
  const capa: CorrectiveAction = {
    id,
    code: `CA-${format(ctx.now, 'yyMM')}-${id.slice(-4).toUpperCase()}`,
    findingId: f.id,
    outletId: f.outletId,
    category: f.category,
    title: input.title,
    description: input.description,
    rootCause: input.rootCause,
    immediateAction: input.immediateAction,
    correctiveAction: input.correctiveAction,
    preventiveAction: input.preventiveAction,
    ownerId: input.ownerId,
    ownerName: owner?.name ?? 'Unassigned',
    priority: input.priority,
    createdAt: iso(ctx.now),
    targetDate: input.targetDate,
    evidenceIds: [],
    status: 'Assigned',
    reviewerId: null,
    closureDate: null,
    verificationNote: null,
    history: [
      { at: iso(ctx.now), by: ctx.user.name, action: 'Created', note: `Raised from finding ${f.code}` },
      { at: iso(ctx.now), by: ctx.user.name, action: 'Assigned', note: `Assigned to ${owner?.name ?? 'owner'}` },
    ],
  }
  const findings = data.findings.map((x) => (x.id === f.id ? { ...x, correctiveActionId: id, status: x.status === 'Open' ? 'In Progress' : x.status } : x))
  const alerts = f.alertId ? data.alerts.map((a) => (a.id === f.alertId && (a.status === 'New' || a.status === 'Acknowledged') ? { ...a, status: 'Action Required' as AlertStatus, history: [...a.history, { at: iso(ctx.now), by: ctx.user.name, action: 'Action Required', note: `Corrective action ${capa.code} raised` }] } : a)) : data.alerts
  const notifications: Notification[] = [
    { id: uid('ntf'), type: 'assignment', title: 'Corrective action assigned', message: `${capa.code} · ${capa.title}`, createdAt: iso(ctx.now), read: false, link: `/quality/corrective-actions?action=${id}`, severity: 'Info', audience: ['ops_manager', 'client_admin'] },
    ...data.notifications,
  ]
  return { correctiveActions: [capa, ...data.correctiveActions], findings, alerts, notifications, activityLogs: withLog(data, ctx, 'Corrective action created', 'Corrective Actions', capa.code, capa.title) }
}

export function updateCorrectiveAction(data: Dataset, ctx: ActionContext, id: string, patch: Partial<CorrectiveAction>, note?: string): DatasetPatch {
  const c = data.correctiveActions.find((x) => x.id === id)
  if (!c) return {}
  const status: CapaStatus = patch.status ?? c.status
  const updated: CorrectiveAction = {
    ...c,
    ...patch,
    ownerName: patch.ownerId ? (data.users.find((u) => u.id === patch.ownerId)?.name ?? c.ownerName) : c.ownerName,
    closureDate: status === 'Closed' ? (c.closureDate ?? format(ctx.now, 'yyyy-MM-dd')) : c.closureDate,
    reviewerId: status === 'Closed' ? ctx.user.id : c.reviewerId,
    verificationNote: status === 'Closed' ? (patch.verificationNote ?? note ?? c.verificationNote ?? 'Verified and closed.') : c.verificationNote,
    history: [...c.history, { at: iso(ctx.now), by: ctx.user.name, action: patch.status ? patch.status : 'Updated', note }],
  }
  let findings = data.findings
  let alerts = data.alerts
  if (status === 'Closed') {
    findings = data.findings.map((f) => (f.id === c.findingId ? { ...f, status: 'Closed' } : f))
    const f = data.findings.find((x) => x.id === c.findingId)
    if (f?.alertId) alerts = data.alerts.map((a) => (a.id === f.alertId && a.status !== 'Closed' ? { ...a, status: 'Resolved' as AlertStatus, resolvedAt: a.resolvedAt ?? iso(ctx.now), history: [...a.history, { at: iso(ctx.now), by: ctx.user.name, action: 'Resolved', note: `Corrective action ${c.code} closed` }] } : a))
  }
  return { correctiveActions: replace(data.correctiveActions, updated), findings, alerts, activityLogs: withLog(data, ctx, status === 'Closed' ? 'Corrective action closed' : 'Corrective action updated', 'Corrective Actions', c.code, note ?? patch.status) }
}

export function updateFinding(data: Dataset, ctx: ActionContext, id: string, patch: Partial<Finding>): DatasetPatch {
  const f = data.findings.find((x) => x.id === id)
  if (!f) return {}
  return { findings: replace(data.findings, { ...f, ...patch }), activityLogs: withLog(data, ctx, 'Finding updated', 'Findings', f.code, patch.status) }
}

// ───────────────────────────── Comments & notifications ─────────────────────────────

export function addComment(data: Dataset, ctx: ActionContext, entityType: Comment['entityType'], entityId: string, text: string): DatasetPatch {
  const c: Comment = { id: uid('cmt'), entityType, entityId, userId: ctx.user.id, userName: ctx.user.name, text, createdAt: iso(ctx.now) }
  return { comments: [...data.comments, c], activityLogs: withLog(data, ctx, 'Comment added', 'Comments', entityId) }
}

export function markNotificationRead(data: Dataset, id: string | 'all'): DatasetPatch {
  return { notifications: data.notifications.map((n) => (id === 'all' || n.id === id ? { ...n, read: true } : n)) }
}

// ───────────────────────────── Users ─────────────────────────────

export interface NewUserInput {
  name: string
  email: string
  role: Role
  title: string
  outletIds: string[]
}

export function createUser(data: Dataset, ctx: ActionContext, input: NewUserInput): DatasetPatch {
  const id = uid('usr')
  const user: User = { id, name: input.name, email: input.email, role: input.role, status: 'invited', title: input.title, outletIds: input.outletIds, brandIds: [], lastLogin: null, mfaEnabled: false, createdAt: iso(ctx.now) }
  return { users: [...data.users, user], activityLogs: withLog(data, ctx, 'User created', 'Users', id, `${input.name} · ${input.role}`) }
}

export function updateUser(data: Dataset, ctx: ActionContext, id: string, patch: Partial<User>): DatasetPatch {
  const u = data.users.find((x) => x.id === id)
  if (!u) return {}
  const action = patch.role && patch.role !== u.role ? 'Role modified' : patch.status ? (patch.status === 'active' ? 'User reactivated' : 'User deactivated') : 'User updated'
  return { users: replace(data.users, { ...u, ...patch }), activityLogs: withLog(data, ctx, action, 'Users', id, patch.role ? `${u.role} → ${patch.role}` : patch.status) }
}

export function resetPassword(data: Dataset, ctx: ActionContext, id: string): DatasetPatch {
  return { activityLogs: withLog(data, ctx, 'Password reset issued', 'Users', id, 'Temporary credential sent to user email (demo)') }
}

// ───────────────────────────── Configuration ─────────────────────────────

export function updateKpiConfig(data: Dataset, ctx: ActionContext, config: KpiConfig[]): DatasetPatch {
  return { kpiConfig: config, activityLogs: withLog(data, ctx, 'KPI configuration updated', 'KPI Configuration', 'kpi-config', config.map((k) => `${k.name} ${k.weight}%`).join(', ')) }
}

export function updateNotificationRule(data: Dataset, ctx: ActionContext, id: string, patch: Partial<NotificationRule>): DatasetPatch {
  const r = data.notificationRules.find((x) => x.id === id)
  if (!r) return {}
  return { notificationRules: replace(data.notificationRules, { ...r, ...patch }), activityLogs: withLog(data, ctx, 'Notification rule updated', 'Notification Rules', id, patch.enabled === undefined ? undefined : patch.enabled ? 'Enabled' : 'Disabled') }
}

export function updateOrganization(data: Dataset, ctx: ActionContext, patch: Partial<OrganizationSettings>): DatasetPatch {
  return { organization: { ...data.organization, ...patch }, activityLogs: withLog(data, ctx, 'System settings updated', 'System Settings', 'organization') }
}

export function upsertOutlet(data: Dataset, ctx: ActionContext, outlet: Outlet): DatasetPatch {
  const exists = data.outlets.some((o) => o.id === outlet.id)
  return { outlets: exists ? replace(data.outlets, outlet) : [...data.outlets, outlet], activityLogs: withLog(data, ctx, exists ? 'Outlet updated' : 'Outlet created', 'Outlets', outlet.code, outlet.name) }
}

export function updateShopperTraining(data: Dataset, ctx: ActionContext, shopperId: string, moduleId: string, status: TrainingStatus): DatasetPatch {
  const s = data.shoppers.find((x) => x.id === shopperId)
  if (!s) return {}
  const training = s.training.map((t) => (t.moduleId === moduleId ? { ...t, status, completedAt: status === 'Completed' ? iso(ctx.now) : t.completedAt, score: status === 'Completed' ? (t.score ?? 90) : t.score } : t))
  const allDone = training.every((t) => t.status === 'Completed')
  const anyExpired = training.some((t) => t.status === 'Expired')
  const updated: Shopper = { ...s, training, trainingStatus: allDone ? 'Completed' : anyExpired ? 'Expired' : 'In Progress', certificationStatus: allDone ? 'Certified' : anyExpired ? 'Expired' : 'Pending' }
  return { shoppers: replace(data.shoppers, updated), activityLogs: withLog(data, ctx, 'Training status updated', 'Shoppers', s.code, `${moduleId} → ${status}`) }
}

export function updateShopper(data: Dataset, ctx: ActionContext, id: string, patch: Partial<Shopper>): DatasetPatch {
  const s = data.shoppers.find((x) => x.id === id)
  if (!s) return {}
  return { shoppers: replace(data.shoppers, { ...s, ...patch }), activityLogs: withLog(data, ctx, 'Shopper updated', 'Shoppers', s.code) }
}

// ───────────────────────────── Templates ─────────────────────────────

export function cloneTemplate(data: Dataset, ctx: ActionContext, templateId: string): DatasetPatch {
  const t = data.templates.find((x) => x.id === templateId)
  if (!t) return {}
  const newId = uid('tpl')
  const sectionMap = new Map<string, string>()
  const sections: Section[] = data.sections.filter((s) => s.templateId === templateId).map((s) => {
    const sid = uid('sec')
    sectionMap.set(s.id, sid)
    return { ...s, id: sid, templateId: newId }
  })
  const questions: Question[] = data.questions.filter((q) => sectionMap.has(q.sectionId)).map((q) => ({ ...q, id: uid('q'), sectionId: sectionMap.get(q.sectionId)! }))
  const template: AuditTemplate = { ...t, id: newId, code: `${t.code}-COPY`, name: `${t.name} (Copy)`, status: 'Draft', version: '1.0', sectionIds: sections.map((s) => s.id), createdAt: iso(ctx.now), updatedAt: iso(ctx.now) }
  return { templates: [...data.templates, template], sections: [...data.sections, ...sections], questions: [...data.questions, ...questions], activityLogs: withLog(data, ctx, 'Template cloned', 'Templates', template.code, `from ${t.code}`) }
}

export function createTemplate(data: Dataset, ctx: ActionContext, input: Pick<AuditTemplate, 'name' | 'code' | 'description' | 'segment' | 'journey' | 'isFollowUp'>): DatasetPatch {
  const id = uid('tpl')
  const template: AuditTemplate = { ...input, id, version: '1.0', status: 'Draft', sectionIds: [], questionCount: 0, createdAt: iso(ctx.now), updatedAt: iso(ctx.now) }
  return { templates: [...data.templates, template], activityLogs: withLog(data, ctx, 'Template created', 'Templates', template.code) }
}

export function updateTemplate(data: Dataset, ctx: ActionContext, id: string, patch: Partial<AuditTemplate>): DatasetPatch {
  const t = data.templates.find((x) => x.id === id)
  if (!t) return {}
  return { templates: replace(data.templates, { ...t, ...patch, updatedAt: iso(ctx.now) }), activityLogs: withLog(data, ctx, patch.status ? `Template ${patch.status.toLowerCase()}` : 'Template updated', 'Templates', t.code) }
}

export function upsertSection(data: Dataset, ctx: ActionContext, section: Section): DatasetPatch {
  const exists = data.sections.some((s) => s.id === section.id)
  const sections = exists ? replace(data.sections, section) : [...data.sections, section]
  const templates = data.templates.map((t) => (t.id === section.templateId ? { ...t, sectionIds: exists ? t.sectionIds : [...t.sectionIds, section.id], updatedAt: iso(ctx.now) } : t))
  return { sections, templates, activityLogs: withLog(data, ctx, exists ? 'Section updated' : 'Section created', 'Templates', section.id, section.title) }
}

export function deleteSection(data: Dataset, ctx: ActionContext, sectionId: string): DatasetPatch {
  const s = data.sections.find((x) => x.id === sectionId)
  if (!s) return {}
  const questions = data.questions.filter((q) => q.sectionId !== sectionId)
  const templates = data.templates.map((t) => (t.id === s.templateId ? { ...t, sectionIds: t.sectionIds.filter((x) => x !== sectionId), questionCount: questions.filter((q) => data.sections.some((sec) => sec.id === q.sectionId && sec.templateId === t.id)).length, updatedAt: iso(ctx.now) } : t))
  return { sections: data.sections.filter((x) => x.id !== sectionId), questions, templates, activityLogs: withLog(data, ctx, 'Section deleted', 'Templates', sectionId, s.title) }
}

export function upsertQuestion(data: Dataset, ctx: ActionContext, question: Question): DatasetPatch {
  const exists = data.questions.some((q) => q.id === question.id)
  const questions = exists ? replace(data.questions, question) : [...data.questions, question]
  const section = data.sections.find((s) => s.id === question.sectionId)
  const templates = data.templates.map((t) => (t.id === section?.templateId ? { ...t, questionCount: questions.filter((q) => data.sections.some((sec) => sec.id === q.sectionId && sec.templateId === t.id)).length, updatedAt: iso(ctx.now) } : t))
  return { questions, templates, activityLogs: withLog(data, ctx, exists ? 'Question updated' : 'Question created', 'Templates', question.code, question.text.slice(0, 60)) }
}

export function deleteQuestion(data: Dataset, ctx: ActionContext, questionId: string): DatasetPatch {
  const q = data.questions.find((x) => x.id === questionId)
  if (!q) return {}
  const questions = data.questions.filter((x) => x.id !== questionId)
  const section = data.sections.find((s) => s.id === q.sectionId)
  const templates = data.templates.map((t) => (t.id === section?.templateId ? { ...t, questionCount: questions.filter((x) => data.sections.some((sec) => sec.id === x.sectionId && sec.templateId === t.id)).length, updatedAt: iso(ctx.now) } : t))
  return { questions, templates, activityLogs: withLog(data, ctx, 'Question deleted', 'Templates', q.code) }
}

// ───────────────────────────── Reports ─────────────────────────────

export function createReport(data: Dataset, ctx: ActionContext, report: Omit<ManagementReport, 'id' | 'code' | 'generatedAt' | 'generatedBy'>): DatasetPatch {
  const id = uid('rep')
  const r: ManagementReport = { ...report, id, code: `RPT-${format(ctx.now, 'yyyy')}-${String(data.reports.length + 1).padStart(3, '0')}`, generatedAt: iso(ctx.now), generatedBy: ctx.user.name }
  return { reports: [r, ...data.reports], activityLogs: withLog(data, ctx, 'Report generated', 'Reports', r.code, r.title) }
}

export function logExport(data: Dataset, ctx: ActionContext, what: string, format_: string): DatasetPatch {
  return { activityLogs: withLog(data, ctx, 'Data exported', 'Exports', what, format_) }
}

export function logAccessDenied(data: Dataset, ctx: ActionContext, path: string): DatasetPatch {
  return { activityLogs: withLog(data, ctx, 'Access denied', 'Authorization', path, `Role ${ctx.user.role} lacks permission`, 'Denied') }
}
