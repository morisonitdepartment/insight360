/* Sanity check for the seeded demo dataset: prints reconciliation counts. Run: npx tsx scripts/check-seed.ts */
import { generateDataset, STORYLINE } from '../src/data/seed'

const t0 = Date.now()
const d = generateDataset()
const ms = Date.now() - t0

const count = <T,>(arr: T[], fn: (x: T) => boolean) => arr.filter(fn).length
const byStatus = (arr: { status: string }[]) => Object.fromEntries([...new Set(arr.map((a) => a.status))].map((s) => [s, count(arr, (a) => a.status === s)]))

console.log(`generated in ${ms}ms`)
console.log('outlets', d.outlets.length, 'visits', d.visits.length, 'answers', d.answers.length, 'evidence', d.evidence.length)
console.log('findings', d.findings.length, 'alerts', d.alerts.length, 'capas', d.correctiveActions.length, 'logs', d.activityLogs.length)
console.log('visit statuses', byStatus(d.visits))
console.log('finding statuses', byStatus(d.findings))
const open = d.findings.filter((f) => f.status === 'Open' || f.status === 'In Progress')
console.log('open by severity', byStatus(open.map((f) => ({ status: f.severity }))))
console.log('alert statuses', byStatus(d.alerts), 'alert severities', byStatus(d.alerts.map((a) => ({ status: a.severity }))))
console.log('capa statuses', byStatus(d.correctiveActions))
const closed = count(d.correctiveActions, (c) => c.status === 'Closed')
console.log('capa closure rate', ((closed / d.correctiveActions.length) * 100).toFixed(1))
const scored = d.outlets.filter((o) => o.overallScore !== null)
console.log('org score', (scored.reduce((a, o) => a + (o.overallScore ?? 0), 0) / scored.length).toFixed(2))
console.log('risk', byStatus(d.outlets.map((o) => ({ status: o.riskRating }))))
console.log('below 70', d.outlets.filter((o) => (o.overallScore ?? 100) < 70).map((o) => `${o.name} ${o.overallScore}`))
console.log('top5', [...scored].sort((a, b) => b.overallScore! - a.overallScore!).slice(0, 5).map((o) => `${o.name} ${o.overallScore}`))
console.log('storyline', STORYLINE)
const so = d.outlets.find((o) => o.id === STORYLINE.outletId)!
console.log('story outlet', so.name, so.overallScore, so.riskRating, so.rank, so.categoryScores)
console.log('story visits', d.visits.filter((v) => v.outletId === so.id).map((v) => `${v.type} ${v.status} ${v.score} ${v.risk} crit=${v.criticalCount} sla=${v.slaStatus}`))
console.log('sla', byStatus(d.visits.map((v) => ({ status: v.slaStatus }))))
console.log('shp-001 visits', d.visits.filter((v) => v.shopperId === 'shp-001').map((v) => `${v.type} ${v.status}`))
console.log('manager outlets', d.users.find((u) => u.id === 'usr-003')?.outletIds.length)
// monthly trend
const months: Record<string, number[]> = {}
for (const v of d.visits) if (v.score !== null && v.visitDate) (months[v.visitDate.slice(0, 7)] ??= []).push(v.score)
console.log('monthly', Object.entries(months).sort().map(([m, s]) => `${m}:${(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1)}(${s.length})`).join(' '))
const seg = (s: string) => scored.filter((o) => o.segment === s)
const catAvg = (list: typeof scored, k: keyof NonNullable<(typeof scored)[0]['categoryScores']>) => (list.reduce((a, o) => a + (o.categoryScores?.[k] ?? 0), 0) / list.length).toFixed(1)
console.log('F&B CX', catAvg(seg('F&B'), 'customer_experience'), 'ENT CX', catAvg(seg('Entertainment'), 'customer_experience'))
console.log('upsell', catAvg(scored, 'upselling_sales'), 'safety', catAvg(scored, 'safety_entertainment'), 'compliance', catAvg(scored, 'operational_compliance'), 'cx', catAvg(scored, 'customer_experience'), 'env', catAvg(scored, 'product_environment'), 'speed', catAvg(scored, 'service_speed'))
console.log('repeated findings', count(d.findings, (f) => f.repeated))
console.log('visit score errors vs target sample', d.visits.filter((v) => v.score !== null).slice(0, 6).map((v) => v.score))
console.log('in-progress progress', d.visits.filter((v) => v.status === 'In Progress' || v.status === 'Draft').map((v) => `${v.status}:${v.progress}%`).join(' '))
console.log('due today', d.visits.filter((v) => v.submissionDeadline?.startsWith('2026-09-13')).map((v) => `${v.code} ${v.status}`))
