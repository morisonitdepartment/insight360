import { addDays, addHours, addMinutes, format, subDays } from 'date-fns'
import type {
  ActivityLog,
  Alert,
  AlertStatus,
  AnswerValue,
  Brand,
  CapaStatus,
  CategoryKey,
  CategoryScores,
  Comment,
  CorrectiveAction,
  Dataset,
  Evidence,
  EvidenceType,
  Finding,
  FindingStatus,
  JourneyType,
  ManagementReport,
  Notification,
  Outlet,
  Question,
  Role,
  Section,
  Severity,
  Shopper,
  ShopperProfileType,
  ShopperTrainingRecord,
  User,
  Visit,
  VisitAnswer,
  VisitStatus,
  VisitType,
} from '@/types'
import { Rng, hashString } from '@/utils/prng'
import { CATEGORY_KEYS, DEFAULT_THRESHOLDS, computeVisitScores, scoreQuestion } from '@/utils/scoring'
import { buildTemplates } from './templates'
import { BRAND_DEFS, IMPROVEMENT_OBSERVATIONS, IPS, MANAGER_NAMES, MAP_BY_LOCATION, NARRATIVE_OPENERS, POSITIVE_OBSERVATIONS, REGION_BY_LOCATION, ROOT_CAUSES, SHOPPER_NAMES } from './lists'
import { DEFAULT_KPI_CONFIG, DEFAULT_NOTIFICATION_RULES, DEFAULT_ORGANIZATION, TRAINING_MODULES } from './defaults'
import { SCENARIOS } from './scenarios'
import { deriveOutlets } from '@/services/derive'

const iso = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm:ss")
const dayIso = (d: Date) => format(d, 'yyyy-MM-dd')

/** Fixed "today" for the demo storyline. */
export const DEMO_NOW = new Date(2026, 8, 13, 10, 0, 0)

const STORYLINE_OUTLET_KEY = 'br-04:Al Wakrah' // Urban Fork – Al Wakrah
export const STORYLINE = {
  outletId: 'out-012',
  mainAuditVisitId: '',
  followUpVisitId: '',
  findingId: '',
  alertId: '',
  actionId: '',
}

type Tier = 'top' | 'mid' | 'needs' | 'critical'

interface OutletProfile {
  tier: Tier
  base: number
  catBias: Record<CategoryKey, number>
  k: number // schedule bucket order
}

const CLEAN_TAGS = new Set(['cleanliness', 'hygiene', 'washroom'])
const VISIT_ORDER: VisitType[] = ['Main Audit 1', 'Follow-up 1', 'Main Audit 2', 'Follow-up 2']

export function generateDataset(): Dataset {
  const rng = new Rng(20260913)
  const now = DEMO_NOW
  const { templates, sections, questions, tags } = buildTemplates()
  const kpiConfig = DEFAULT_KPI_CONFIG
  const thresholds = DEFAULT_THRESHOLDS
  const questionsBySection = new Map<string, Question[]>()
  for (const q of questions) {
    const arr = questionsBySection.get(q.sectionId) ?? []
    arr.push(q)
    questionsBySection.set(q.sectionId, arr)
  }
  const sectionsByTemplate = new Map<string, Section[]>()
  for (const s of sections) {
    const arr = sectionsByTemplate.get(s.templateId) ?? []
    arr.push(s)
    sectionsByTemplate.set(s.templateId, arr)
  }

  // ───────────────────────────── Brands & Outlets ─────────────────────────────
  const brands: Brand[] = BRAND_DEFS.map((b) => ({ id: b.id, name: b.name, segment: b.segment, outletCount: b.locations.length }))
  const outletsBase: Outlet[] = []
  let fb = 0
  let en = 0
  let idx = 0
  for (const b of BRAND_DEFS) {
    for (const loc of b.locations) {
      idx++
      const code = b.segment === 'F&B' ? `FB-${String(++fb).padStart(3, '0')}` : `EN-${String(++en).padStart(3, '0')}`
      const [mx, my] = MAP_BY_LOCATION[loc] ?? [50, 50]
      outletsBase.push({
        id: `out-${String(idx).padStart(3, '0')}`,
        code,
        name: `${b.name} – ${loc}`,
        brandId: b.id,
        brand: b.name,
        segment: b.segment,
        subcategory: b.subcategory,
        location: loc,
        region: REGION_BY_LOCATION[loc] ?? 'Central Doha',
        manager: MANAGER_NAMES[(idx - 1) % MANAGER_NAMES.length],
        status: idx === 27 ? 'Under Renovation' : idx === 44 ? 'Seasonal' : 'Active',
        openingHours: b.segment === 'F&B' ? (b.subcategory === 'Café' ? '07:00 – 23:00' : '11:00 – 00:00') : '10:00 – 23:00',
        targetScore: b.subcategory === 'Fine Dining' ? 92 : b.segment === 'Entertainment' ? 90 : 88,
        annualVisits: 4,
        mapX: mx + rng.range(-2, 2),
        mapY: my + rng.range(-2, 2),
        mainAuditsCompleted: 0,
        followUpsCompleted: 0,
        lastAudit: null,
        nextAudit: null,
        overallScore: null,
        previousScore: null,
        riskRating: 'Not Assessed',
        openIssues: 0,
        criticalFindings: 0,
        categoryScores: null,
        rank: null,
      })
    }
  }
  const storylineOutlet = outletsBase.find((o) => `${o.brandId}:${o.location}` === STORYLINE_OUTLET_KEY)!
  STORYLINE.outletId = storylineOutlet.id

  // ───────────────────────────── Outlet quality profiles ─────────────────────
  const others = outletsBase.filter((o) => o.id !== storylineOutlet.id)
  const tierOrder = rng.shuffle(others)
  const profiles = new Map<string, OutletProfile>()
  const topBases = [95.8, 95.1, 94.4, 93.7, 93.2]
  const criticalBases = [66.9, 69.4]
  const needsBases = [72.4, 74.1, 75.8, 77.3, 78.9]
  const midCount = tierOrder.length - topBases.length - criticalBases.length - needsBases.length
  const mkBias = (segment: string): Record<CategoryKey, number> => ({
    customer_experience: (segment === 'Entertainment' ? 2.4 : -1.8) + rng.normal(0, 1.6),
    service_speed: -2.2 + rng.normal(0, 2.4),
    operational_compliance: 3.1 + rng.normal(0, 1.5),
    product_environment: 1.4 + rng.normal(0, 2.0),
    upselling_sales: -9.5 + rng.normal(0, 3.0),
    safety_entertainment: 5.6 + rng.normal(0, 1.2),
  })
  let ti = 0
  for (const b of topBases) profiles.set(tierOrder[ti++].id, { tier: 'top', base: b, catBias: mkBias(tierOrder[ti - 1].segment), k: 0 })
  for (const b of criticalBases) profiles.set(tierOrder[ti++].id, { tier: 'critical', base: b, catBias: mkBias(tierOrder[ti - 1].segment), k: 0 })
  for (const b of needsBases) profiles.set(tierOrder[ti++].id, { tier: 'needs', base: b, catBias: mkBias(tierOrder[ti - 1].segment), k: 0 })
  for (let i = 0; i < midCount; i++) {
    const o = tierOrder[ti++]
    const base = 85.4 + (i / (midCount - 1)) * 7.4 + rng.normal(0, 0.4)
    profiles.set(o.id, { tier: 'mid', base, catBias: mkBias(o.segment), k: 0 })
  }
  profiles.set(storylineOutlet.id, { tier: 'critical', base: 68.2, catBias: mkBias('F&B'), k: 0 })

  // Schedule bucket order (k): storyline first, then shuffled
  const kOrder = [storylineOutlet, ...rng.shuffle(others)]
  kOrder.forEach((o, k) => {
    profiles.get(o.id)!.k = k
  })

  // Repeated-cleanliness outlets (7 mid-tier outlets, deterministic)
  const repeatedCleanOutlets = new Set(
    tierOrder
      .filter((o) => profiles.get(o.id)!.tier === 'mid' && profiles.get(o.id)!.k >= 4 && profiles.get(o.id)!.k < 46)
      .slice(0, 7)
      .map((o) => o.id),
  )

  // ───────────────────────────── Users ─────────────────────────────
  const regionOutlets = (regions: string[]) => outletsBase.filter((o) => regions.includes(o.region)).map((o) => o.id)
  const users: User[] = [
    mkUser('usr-001', 'Adam Reynolds', 'admin@insight360.demo', 'super_admin', 'Platform Administrator', [], '2026-09-13T08:42:00'),
    mkUser('usr-002', 'Fatima Al-Kuwari', 'clientadmin@insight360.demo', 'client_admin', 'Head of Customer Experience', [], '2026-09-12T17:05:00'),
    mkUser('usr-003', 'Rajesh Menon', 'manager@insight360.demo', 'ops_manager', 'Regional Operations Manager – South & Al Rayyan', regionOutlets(['South', 'Al Rayyan']), '2026-09-13T07:58:00'),
    mkUser('usr-004', 'Sara Al-Naimi', 'shopper@insight360.demo', 'shopper', 'Senior Mystery Shopper', [], '2026-09-13T09:31:00', 'shp-001'),
    mkUser('usr-005', 'Priya Nair', 'analyst@insight360.demo', 'analyst', 'Customer Experience Analyst', [], '2026-09-12T14:20:00'),
    mkUser('usr-006', 'Khalid Al-Mansoori', 'executive@insight360.demo', 'executive', 'Chief Operating Officer', [], '2026-09-11T19:12:00'),
    mkUser('usr-007', 'Omar Saleh', 'omar.saleh@insight360.demo', 'super_admin', 'Programme Manager & QA Reviewer', [], '2026-09-13T09:05:00'),
    mkUser('usr-008', 'Layla Haddad', 'layla.haddad@demo-group.example', 'ops_manager', 'Regional Manager – North', regionOutlets(['North']), '2026-09-10T11:44:00'),
    mkUser('usr-009', 'Daniel Okoro', 'daniel.okoro@demo-group.example', 'ops_manager', 'Regional Manager – Lusail & West Bay', regionOutlets(['Lusail', 'West Bay & Pearl']), '2026-09-12T08:15:00'),
    mkUser('usr-010', 'Aisha Al-Thani', 'aisha.althani@demo-group.example', 'executive', 'Chief Executive Officer', [], '2026-09-08T16:30:00'),
    mkUser('usr-011', 'Marco Bellini', 'marco.bellini@demo-group.example', 'client_admin', 'Director of F&B Operations', [], '2026-09-12T10:02:00'),
    mkUser('usr-012', 'Elena Petrova', 'elena.petrova@insight360.demo', 'analyst', 'Insights Analyst', [], '2026-09-09T13:47:00'),
    mkUser('usr-013', 'James Whitfield', 'james.whitfield@insight360.demo', 'shopper', 'Mystery Shopper', [], '2026-09-12T20:11:00', 'shp-002'),
    mkUser('usr-014', 'Amira Khalil', 'amira.khalil@insight360.demo', 'shopper', 'Mystery Shopper', [], '2026-09-13T08:05:00', 'shp-003'),
    mkUser('usr-015', 'Arjun Pillai', 'arjun.pillai@insight360.demo', 'shopper', 'Mystery Shopper', [], '2026-09-11T21:40:00', 'shp-004'),
    mkUser('usr-016', 'Isabella Cruz', 'isabella.cruz@insight360.demo', 'shopper', 'Mystery Shopper', [], '2026-09-10T18:22:00', 'shp-005'),
    mkUser('usr-017', 'Tariq Mahmoud', 'tariq.mahmoud@demo-group.example', 'executive', 'Director of Entertainment', [], '2026-09-07T12:00:00'),
    { ...mkUser('usr-018', 'Hana Yamamoto', 'hana.yamamoto@insight360.demo', 'analyst', 'Analyst (contract ended)', [], '2026-06-30T17:00:00'), status: 'inactive' },
    { ...mkUser('usr-019', 'Grace Adeyemi', 'grace.adeyemi@demo-group.example', 'client_admin', 'Quality & Compliance Manager', [], null), status: 'invited' },
  ]
  const userName = (id: string | null) => users.find((u) => u.id === id)?.name ?? 'System'

  // ───────────────────────────── Shoppers ─────────────────────────────
  const profileTypes: ShopperProfileType[] = ['Individual', 'Family', 'Tourist', 'Young Adult', 'Professional', 'Parent']
  const shoppers: Shopper[] = SHOPPER_NAMES.map((s, i) => {
    const id = `shp-${String(i + 1).padStart(3, '0')}`
    const cats: Shopper['assignedCategories'] = i % 5 === 0 ? ['F&B'] : i % 5 === 1 ? ['Entertainment'] : ['F&B', 'Entertainment']
    const training: ShopperTrainingRecord[] = TRAINING_MODULES.map((m, mi) => {
      const roll = rng.next()
      const status = i === 21 && mi === 1 ? 'Expired' : i === 22 && mi > 3 ? 'Not Started' : roll < 0.06 ? 'In Progress' : roll < 0.1 ? 'Expired' : 'Completed'
      const completedAt = status === 'Completed' || status === 'Expired' ? iso(subDays(now, status === 'Expired' ? rng.int(380, 420) : rng.int(20, 300))) : null
      return {
        moduleId: m.id,
        status,
        completedAt,
        expiresAt: completedAt ? iso(addDays(new Date(completedAt), m.validityMonths * 30)) : null,
        score: status === 'Completed' ? rng.int(82, 100) : null,
      }
    })
    const allDone = training.every((t) => t.status === 'Completed')
    const anyExpired = training.some((t) => t.status === 'Expired')
    return {
      id,
      code: `MS-${String(101 + i)}`,
      name: s.name,
      gender: s.gender,
      ageRange: rng.pick(['18-24', '25-34', '25-34', '35-44', '35-44', '45-54', '55+'] as const),
      nationality: s.nationality,
      profileType: profileTypes[i % profileTypes.length],
      languages: s.languages,
      experienceYears: rng.int(1, 9),
      assignedCategories: cats,
      availability: i === 20 ? 'Unavailable' : i % 7 === 3 ? 'Limited' : 'Available',
      trainingStatus: allDone ? 'Completed' : anyExpired ? 'Expired' : 'In Progress',
      certificationStatus: allDone ? 'Certified' : anyExpired ? 'Expired' : 'Pending',
      completedVisits: 0,
      avgReportQuality: Math.round(rng.range(3.7, 4.9) * 10) / 10,
      onTimeSubmissionPct: 0,
      status: i === 20 ? 'On Leave' : i === 23 ? 'Inactive' : 'Active',
      training,
      email: `${s.name.toLowerCase().replace(/[^a-z]+/g, '.')}@insight360.demo`,
      phone: `+974 ${rng.int(3000, 7999)} ${rng.int(1000, 9999)}`,
    }
  })
  const activeShoppers = shoppers.filter((s) => s.status === 'Active')
  const pickShopper = (segment: 'F&B' | 'Entertainment', exclude: string | null) => {
    const pool = activeShoppers.filter((s) => s.assignedCategories.includes(segment) && s.id !== exclude && s.id !== 'shp-001')
    return rng.pick(pool).id
  }

  // ───────────────────────────── Visits ─────────────────────────────
  const visits: Visit[] = []
  const answers: VisitAnswer[] = []
  const evidence: Evidence[] = []
  const findings: Finding[] = []
  const alerts: Alert[] = []
  const correctiveActions: CorrectiveAction[] = []
  const logs: ActivityLog[] = []
  const comments: Comment[] = []
  let visitSeq = 0
  let evSeq = 0
  let findSeq = 0

  const templateFor = (o: Outlet, type: VisitType): string => {
    if (type.startsWith('Follow')) return 'tpl-followup'
    const k = profiles.get(o.id)!.k
    // A slice of the first main-audit cycle is run remotely through social channels.
    if (type === 'Main Audit 1' && k % 7 === 3 && o.id !== storylineOutlet.id) return 'tpl-social'
    if (o.segment === 'Entertainment') return 'tpl-ent'
    if (o.subcategory === 'Food Court' || o.subcategory === 'Fast Casual') return type === 'Main Audit 2' ? 'tpl-fb-take' : 'tpl-fb-dine'
    if (o.subcategory === 'Casual Dining' && type === 'Main Audit 2' && k % 3 === 0 && o.id !== storylineOutlet.id) return 'tpl-fb-del'
    return 'tpl-fb-dine'
  }
  const journeyFor = (tpl: string, o: Outlet): JourneyType => {
    const t = templates.find((x) => x.id === tpl)!
    if (t.isFollowUp) return o.segment === 'Entertainment' ? 'Entertainment Ticketing' : 'In-store / Dine-in'
    return t.journey
  }
  const applicableSections = (tplId: string, segment: 'F&B' | 'Entertainment') =>
    (sectionsByTemplate.get(tplId) ?? []).filter((s) => s.applicableTo === 'all' || s.applicableTo.includes(segment))

  const tierTraj = (tier: Tier): number[] => (tier === 'critical' || tier === 'needs' ? [-1.5, -0.5, 0, 2.0] : [-4.5, -2.5, 0, 1.5])

  // Designated critical failures (outlet k → visit type → question tag)
  const criticalPlan: { k: number; type: VisitType; tag: string; open: boolean }[] = [
    { k: 0, type: 'Main Audit 2', tag: 'food_safety', open: true }, // storyline
    { k: 6, type: 'Main Audit 2', tag: 'safety_briefing', open: true },
    { k: 9, type: 'Main Audit 2', tag: 'staff_safety', open: true },
    { k: 13, type: 'Main Audit 2', tag: 'food_safety', open: true },
    { k: 20, type: 'Main Audit 2', tag: 'safety_briefing', open: true },
    { k: 47, type: 'Main Audit 2', tag: 'food_safety', open: true },
    { k: 2, type: 'Follow-up 2', tag: 'staff_safety', open: true },
    { k: 11, type: 'Main Audit 1', tag: 'food_safety', open: false },
    { k: 18, type: 'Main Audit 1', tag: 'safety_briefing', open: false },
    { k: 25, type: 'Follow-up 1', tag: 'food_safety', open: false },
    { k: 31, type: 'Main Audit 1', tag: 'staff_safety', open: false },
    { k: 40, type: 'Follow-up 1', tag: 'food_safety', open: false },
  ]

  interface VisitPlan {
    outlet: Outlet
    type: VisitType
    status: VisitStatus
    scheduled: Date
    visit: Date | null
    target: number | null
  }

  const plans: VisitPlan[] = []
  for (const o of outletsBase) {
    const p = profiles.get(o.id)!
    const k = p.k
    const traj = tierTraj(p.tier)
    const ma1 = addDays(new Date(2025, 9, 1), Math.round(k * 1.78))
    const fu1 = addDays(ma1, 92 + rng.int(-4, 4))
    let ma2: Date
    let ma2Status: VisitStatus = 'Approved'
    if (k < 4) ma2 = addDays(new Date(2026, 6, 5), k * 3)
    else if (k < 46) ma2 = addDays(new Date(2026, 3, 15), Math.round((k - 4) * 2.7))
    else {
      ma2 = addDays(new Date(2026, 7, 28), (k - 46) * 3)
      ma2Status = k % 2 === 0 ? 'Submitted' : 'Under Review'
    }
    let fu2: Date
    let fu2Status: VisitStatus
    if (k < 4) {
      fu2 = addDays(new Date(2026, 8, 2), k * 2)
      fu2Status = k === 0 ? 'Under Review' : 'Submitted'
    } else if (k < 16) {
      fu2 = addDays(new Date(2026, 8, 8), Math.floor((k - 4) / 2.4))
      fu2Status = k < 12 ? 'In Progress' : 'Draft'
    } else if (k < 36) {
      fu2 = addDays(new Date(2026, 8, 14), Math.round((k - 16) * 1.45))
      fu2Status = 'Assigned'
    } else {
      fu2 = addDays(new Date(2026, 9, 13), Math.round((k - 36) * 2.8))
      fu2Status = 'Planned'
    }
    const isStory = o.id === storylineOutlet.id
    const targets = isStory ? [71.4, 74.0, 68.2, 83.1] : traj.map((d) => p.base + d + rng.normal(0, p.tier === 'top' ? 0.6 : 1.1))
    plans.push({ outlet: o, type: 'Main Audit 1', status: 'Closed', scheduled: ma1, visit: ma1, target: targets[0] })
    plans.push({ outlet: o, type: 'Follow-up 1', status: 'Closed', scheduled: fu1, visit: fu1, target: targets[1] })
    plans.push({ outlet: o, type: 'Main Audit 2', status: ma2Status, scheduled: ma2, visit: ma2, target: targets[2] })
    const fu2Scored = fu2Status === 'Submitted' || fu2Status === 'Under Review'
    const fu2Visited = fu2Scored || fu2Status === 'In Progress' || fu2Status === 'Draft'
    plans.push({ outlet: o, type: 'Follow-up 2', status: fu2Status, scheduled: fu2, visit: fu2Visited ? fu2 : null, target: fu2Scored ? targets[3] : null })
  }
  plans.sort((a, b) => a.scheduled.getTime() - b.scheduled.getTime() || a.outlet.id.localeCompare(b.outlet.id))

  const shopperLastByOutlet = new Map<string, string>()
  const storyShopper = 'shp-001'

  for (const plan of plans) {
    const o = plan.outlet
    const p = profiles.get(o.id)!
    visitSeq++
    const id = `vis-${String(visitSeq).padStart(4, '0')}`
    const code = `MS-${format(plan.scheduled, 'yy')}-${String(visitSeq).padStart(4, '0')}`
    const tplId = templateFor(o, plan.type)
    const journey = journeyFor(tplId, o)
    const isStory = o.id === storylineOutlet.id
    const scored = plan.target !== null
    const visited = plan.visit !== null

    // Shopper assignment
    let shopperId: string | null = null
    if (plan.status !== 'Planned') {
      const forceStory = isStory && (plan.type === 'Main Audit 2' || plan.type === 'Follow-up 2')
      const forceDemoShopper = forceStory || (p.k === 4 && plan.type === 'Follow-up 2') || ((p.k === 16 || p.k === 17) && plan.type === 'Follow-up 2') || ((p.k === 22 || p.k === 30 || p.k === 38 || p.k === 44 || p.k === 8) && plan.type === 'Main Audit 2') || ((p.k === 5 || p.k === 33 || p.k === 41) && plan.type === 'Follow-up 1')
      shopperId = forceDemoShopper ? storyShopper : pickShopper(o.segment, shopperLastByOutlet.get(o.id) ?? null)
      shopperLastByOutlet.set(o.id, shopperId)
    }

    // Timestamps
    let visitStart: Date | null = null
    let visitEnd: Date | null = null
    let deadline: Date | null = null
    let submittedAt: Date | null = null
    let reviewedAt: Date | null = null
    if (visited) {
      const startHour = o.segment === 'F&B' && o.subcategory === 'Café' ? rng.int(8, 19) : rng.int(12, 20)
      visitStart = addMinutes(new Date(plan.visit!.getFullYear(), plan.visit!.getMonth(), plan.visit!.getDate(), startHour, 0), rng.int(0, 55))
      const durationMin = o.segment === 'Entertainment' ? rng.int(75, 150) : rng.int(45, 110)
      if (plan.status === 'In Progress') {
        // visit started today / yesterday, not finished
        visitStart = addMinutes(new Date(2026, 8, p.k < 8 ? 13 : 12, rng.int(9, 18), 0), rng.int(0, 55))
        if (visitStart > now) visitStart = addMinutes(now, -rng.int(20, 90))
        deadline = addHours(visitStart, 48)
      } else {
        visitEnd = addMinutes(visitStart, durationMin)
        deadline = addHours(visitEnd, 48)
        if (plan.status === 'Draft') {
          // two drafts due today
          if (p.k === 12 || p.k === 13) {
            visitEnd = new Date(2026, 8, 11, 17 + (p.k - 12), 30)
            visitStart = addMinutes(visitEnd, -durationMin)
            deadline = addHours(visitEnd, 48)
          }
        }
      }
      if (scored) {
        const roll = rng.next()
        const hrs = isStory && plan.type === 'Follow-up 2' ? 17.4 : roll < 0.7 ? rng.range(6, 30) : roll < 0.92 ? rng.range(30, 47) : rng.range(49, 70)
        submittedAt = addMinutes(visitEnd!, Math.round(hrs * 60))
        if (plan.status === 'Approved' || plan.status === 'Closed' || plan.status === 'Under Review') {
          reviewedAt = addMinutes(submittedAt, rng.int(4 * 60, 40 * 60))
          if (reviewedAt > now) reviewedAt = addMinutes(now, -rng.int(30, 300))
        }
      }
    }
    // Submission is graded against a 24h target inside a 48h contractual maximum.
    const targetAt = visitEnd ? addHours(visitEnd, DEFAULT_ORGANIZATION.reportingTargetHours) : null
    const slaStatus: Visit['slaStatus'] = !deadline
      ? 'Pending'
      : submittedAt
        ? targetAt && submittedAt <= targetAt
          ? 'Within Target'
          : submittedAt <= deadline
            ? 'Within SLA'
            : 'Breached'
        : deadline < now
          ? 'Breached'
          : addHours(now, 12) > deadline
            ? 'At Risk'
            : 'Pending'

    const reviewerId = reviewedAt ? (rng.bool(0.7) ? 'usr-007' : 'usr-001') : null
    const approvalHistory: Visit['approvalHistory'] = []
    if (submittedAt) approvalHistory.push({ at: iso(submittedAt), by: shoppers.find((s) => s.id === shopperId)?.name ?? 'Shopper', action: 'Submitted' })
    if (plan.status === 'Under Review' && reviewedAt) approvalHistory.push({ at: iso(reviewedAt), by: userName(reviewerId), action: 'Review Started' })
    if ((plan.status === 'Approved' || plan.status === 'Closed') && reviewedAt) {
      approvalHistory.push({ at: iso(addMinutes(reviewedAt, -rng.int(30, 240))), by: userName(reviewerId), action: 'Review Started' })
      approvalHistory.push({ at: iso(reviewedAt), by: userName(reviewerId), action: 'Approved', comment: rng.pick(['Report verified against evidence. Approved.', 'Scores validated; narrative complete.', 'Approved. Findings raised for follow-up.', 'Approved after minor narrative clarification.']) })
    }
    if (plan.status === 'Closed' && reviewedAt) approvalHistory.push({ at: iso(addDays(reviewedAt, rng.int(20, 60))), by: 'Omar Saleh', action: 'Closed', comment: 'Cycle closed after follow-up verification.' })

    // Scenario-based assessment. Deterministic per visit so the demo stays stable.
    const scenarioId = (() => {
      if (tplId === 'tpl-social') return 'scn-08'
      if (isStory && plan.type === 'Main Audit 2') return 'scn-02'
      if (isStory && plan.type === 'Follow-up 2') return 'scn-04'
      if (o.segment === 'Entertainment' && p.k % 4 === 1) return 'scn-07'
      const rotation = ['scn-01', 'scn-01', 'scn-02', 'scn-03', 'scn-04', 'scn-01', 'scn-05', 'scn-06']
      return rotation[(p.k + VISIT_ORDER.indexOf(plan.type)) % rotation.length]
    })()

    const visit: Visit = {
      id,
      code,
      outletId: o.id,
      type: plan.type,
      journey,
      templateId: tplId,
      shopperId,
      scheduledDate: dayIso(plan.scheduled),
      visitDate: visited ? dayIso(plan.visit!) : null,
      visitStart: visitStart ? iso(visitStart) : null,
      visitEnd: visitEnd ? iso(visitEnd) : null,
      submissionDeadline: deadline ? iso(deadline) : null,
      submittedAt: submittedAt ? iso(submittedAt) : null,
      status: plan.status,
      score: null,
      categoryScores: null,
      risk: null,
      reportStatus:
        plan.status === 'Approved' ? 'Approved' : plan.status === 'Closed' ? 'Published' : scored ? 'Pending Review' : plan.status === 'Draft' || plan.status === 'In Progress' ? 'Draft' : 'Not Started',
      slaStatus,
      reviewerId,
      reviewedAt: reviewedAt ? iso(reviewedAt) : null,
      reviewerComment: approvalHistory.find((h) => h.action === 'Approved')?.comment ?? null,
      approvalHistory,
      narrative: null,
      criticalCount: 0,
      spend: visited ? (tplId === 'tpl-social' ? null : o.segment === 'F&B' ? rng.int(85, 420) : rng.int(120, 650)) : null,
      partySize: scenarioId === 'scn-07' ? rng.int(4, 6) : rng.pick([1, 1, 2, 2, 2, 3, 4]),
      scenarioId,
      progress: 0,
    }
    if (isStory && plan.type === 'Main Audit 2') STORYLINE.mainAuditVisitId = id
    if (isStory && plan.type === 'Follow-up 2') STORYLINE.followUpVisitId = id

    // ── Answers ──
    const secs = applicableSections(tplId, o.segment)
    if (scored || plan.status === 'In Progress' || plan.status === 'Draft') {
      const target = plan.target ?? p.base
      // Category targets, normalised so the KPI-weighted mean equals the visit target
      const rawCat = {} as CategoryScores
      for (const key of CATEGORY_KEYS) rawCat[key] = target + p.catBias[key] + rng.normal(0, 1.5)
      if (isStory && plan.type === 'Main Audit 2') {
        rawCat.service_speed = 60
        rawCat.product_environment = 64
        rawCat.upselling_sales = 35
        rawCat.safety_entertainment = 60
        rawCat.customer_experience = 82
        rawCat.operational_compliance = 88
      }
      if (isStory && plan.type === 'Follow-up 2') {
        rawCat.service_speed = 82
        rawCat.product_environment = 84
        rawCat.upselling_sales = 68
        rawCat.safety_entertainment = 96
        rawCat.customer_experience = 84
        rawCat.operational_compliance = 88
      }
      const wsum = kpiConfig.reduce((a, k) => a + k.weight, 0)
      const mean = kpiConfig.reduce((a, k) => a + rawCat[k.key] * k.weight, 0) / wsum
      const shift = target - mean
      for (const key of CATEGORY_KEYS) rawCat[key] = Math.max(35, Math.min(99.5, rawCat[key] + shift))

      const forced = new Map<string, 'fail' | 'pass' | AnswerValue>()
      const plannedCrit = criticalPlan.find((c) => c.k === p.k && c.type === plan.type)
      if (plannedCrit) {
        const critTag = o.segment === 'F&B' ? 'food_safety' : plannedCrit.tag === 'food_safety' ? 'safety_briefing' : plannedCrit.tag
        forced.set(critTag, 'fail')
      }
      if (isStory && plan.type === 'Main Audit 2') {
        forced.set('greet_30s', false)
        forced.set('time_greet', 2.5)
        forced.set('time_order', 9)
        forced.set('time_receive', 27)
        forced.set('cleanliness', 2)
        forced.set('hygiene', 3)
        forced.set('washroom', 2)
        forced.set('upsell', false)
        forced.set('cross_sell', false)
        forced.set('promotions', true)
        forced.set('order_accuracy', 'fail')
        forced.set('food_safety', 'fail')
        forced.set('problem_solving', 'Resolved after escalation')
      }
      if (isStory && plan.type === 'Follow-up 2') {
        forced.set('greet_30s', true)
        forced.set('time_greet', 0.5)
        forced.set('time_order', 4)
        forced.set('time_receive', 12)
        forced.set('cleanliness', 4)
        forced.set('hygiene', 4)
        forced.set('washroom', 4)
        forced.set('upsell', true)
        forced.set('cross_sell', false)
        forced.set('promotions', true)
        forced.set('order_accuracy', 'pass')
        forced.set('food_safety', 'pass')
        forced.set('hand_hygiene', true)
      }
      if (repeatedCleanOutlets.has(o.id) && (plan.type === 'Follow-up 1' || plan.type === 'Main Audit 2')) {
        forced.set('cleanliness', 2)
      }

      const partial = !scored
      const progressTarget = plan.status === 'In Progress' ? rng.int(20, 70) : rng.int(80, 95)
      const totalQ = secs.reduce((a, s) => a + (questionsBySection.get(s.id)?.length ?? 0), 0)
      const answerLimit = partial ? Math.round((progressTarget / 100) * totalQ) : totalQ
      let answered = 0
      const visitAnswers: VisitAnswer[] = []
      for (const s of secs) {
        const qs = questionsBySection.get(s.id) ?? []
        const sectionT = Math.max(0.3, Math.min(0.995, (rawCat[s.category] + rng.normal(0, 1.2)) / 100))
        for (const q of qs) {
          if (answered >= answerLimit) break
          answered++
          const tag = tags.get(q.id)
          const f = tag ? forced.get(tag) : undefined
          const { value, na } = genAnswer(q, sectionT, rng, f)
          const comment = mkComment(q, value, na, tag, rng, isStory && plan.type === 'Main Audit 2')
          visitAnswers.push({ id: `${id}-${q.id}`, visitId: id, questionId: q.id, value, na, comment, evidenceIds: [], score: scoreQuestion(q, value, na) })
        }
      }

      // Calibrate to target for scored visits (small adaptive steps, keep best state)
      if (scored) {
        const qMap = new Map(questions.map((q) => [q.id, q]))
        let best: { diff: number; values: Map<string, AnswerValue> } | null = null
        for (let iter = 0; iter < 24; iter++) {
          const res = computeVisitScores(questions, secs, visitAnswers, kpiConfig, thresholds)
          const diff = target - (res.overall ?? target)
          if (best === null || Math.abs(diff) < Math.abs(best.diff)) best = { diff, values: new Map(visitAnswers.map((a) => [a.questionId, a.value])) }
          if (Math.abs(diff) < 0.3) break
          const big = Math.abs(diff) >= 3
          const adjustable = visitAnswers.filter((a) => {
            const q = qMap.get(a.questionId)!
            const tag = tags.get(q.id)
            if (tag && forced.has(tag)) return false
            if (a.na || q.critical) return false
            if (q.type === 'rating_5' || q.type === 'rating_10') return diff > 0 ? Number(a.value) < (q.type === 'rating_5' ? 5 : 10) : Number(a.value) > 1
            if (big && (q.type === 'yes_no' || q.type === 'pass_fail') && q.weight <= 2) return diff > 0 ? a.value === false : a.value === true
            return false
          })
          if (!adjustable.length) break
          const n = Math.abs(diff) < 1.5 ? 1 : Math.min(adjustable.length, Math.ceil(Math.abs(diff) / 2.5))
          for (const a of rng.shuffle(adjustable).slice(0, n)) {
            const q = qMap.get(a.questionId)!
            if (q.type === 'rating_5' || q.type === 'rating_10') a.value = Number(a.value) + (diff > 0 ? 1 : -1)
            else a.value = diff > 0
            a.score = scoreQuestion(q, a.value, a.na)
          }
        }
        if (best) {
          for (const a of visitAnswers) {
            const v = best.values.get(a.questionId)
            if (v !== undefined && v !== a.value) {
              a.value = v
              a.score = scoreQuestion(qMap.get(a.questionId)!, a.value, a.na)
            }
          }
        }
      }

      // Evidence
      const qMap2 = new Map(questions.map((q) => [q.id, q]))
      const evidenceCount = { n: 0 }
      const addEvidence = (type: EvidenceType, title: string, description: string, questionId: string | null, category: CategoryKey) => {
        evSeq++
        const eid = `ev-${String(evSeq).padStart(4, '0')}`
        const capturedAt = visitStart ? addMinutes(visitStart, rng.int(3, 95)) : now
        evidence.push({
          id: eid,
          visitId: id,
          outletId: o.id,
          category,
          questionId,
          type,
          title,
          description,
          capturedAt: iso(capturedAt),
          uploadedAt: iso(addMinutes(submittedAt ?? capturedAt, submittedAt ? -rng.int(5, 120) : rng.int(2, 30))),
          uploadedBy: shoppers.find((s) => s.id === shopperId)?.name ?? 'Shopper',
          visualSeed: hashString(eid),
          fileName: `${type === 'Video' ? 'VID' : type === 'Photo' ? 'IMG' : type.toUpperCase().slice(0, 3)}_${format(capturedAt, 'yyyyMMdd_HHmm')}_${String(evSeq).padStart(4, '0')}.${type === 'Video' ? 'mp4' : type === 'Document' ? 'pdf' : 'jpg'}`,
          sizeKb: type === 'Video' ? rng.int(8000, 42000) : type === 'Document' ? rng.int(120, 900) : rng.int(380, 2600),
        })
        evidenceCount.n++
        return eid
      }
      for (const a of visitAnswers) {
        const q = qMap2.get(a.questionId)!
        const sec = secs.find((s) => s.id === q.sectionId)!
        if (a.na) continue
        const failed = a.score !== null && a.score < 0.5
        const wantsEvidence = q.type === 'photo' || q.type === 'video' || (q.evidenceRequired && (failed || rng.bool(0.55)))
        if (!wantsEvidence) continue
        const type: EvidenceType = q.type === 'video' || (q.critical && failed && o.segment === 'Entertainment') ? 'Video' : tags.get(q.id) === 'billing' ? 'Receipt' : sec.code === 'G' ? 'Screenshot' : 'Photo'
        const eid = addEvidence(type, evidenceTitle(q, failed, tags.get(q.id)), failed ? `Evidence of non-compliance: ${q.text}` : `Evidence captured for: ${q.text}`, q.id, sec.category)
        a.evidenceIds.push(eid)
      }
      if (visited) {
        addEvidence('Receipt', 'Purchase receipt', `Receipt for QAR ${visit.spend} — ${journey} scenario`, null, 'operational_compliance')
        if (o.segment === 'Entertainment' && rng.bool(0.4)) addEvidence('Photo', 'Entrance & ticketing area', 'Wide shot of reception and ticket counter on arrival', null, 'safety_entertainment')
        if (rng.bool(0.3)) addEvidence('Document', 'Shopper scenario notes', 'Scanned handwritten timing notes captured during the visit', null, 'customer_experience')
      }

      answers.push(...visitAnswers)
      const res = computeVisitScores(questions, secs, visitAnswers, kpiConfig, thresholds)
      visit.progress = scored ? 100 : res.progress
      if (scored) {
        visit.score = Math.round((res.overall ?? 0) * 10) / 10
        visit.categoryScores = res.categoryScores ? Object.fromEntries(CATEGORY_KEYS.map((k) => [k, Math.round(res.categoryScores![k] * 10) / 10])) as CategoryScores : null
        visit.risk = res.risk === 'Not Assessed' ? null : res.risk
        visit.criticalCount = res.criticalFailures.length
        visit.narrative = mkNarrative(rng, o, visitAnswers, qMap2, tags, isStory && plan.type === 'Main Audit 2', isStory && plan.type === 'Follow-up 2')

        // ── Findings ──
        const failedAnswers = visitAnswers
          .filter((a) => a.score !== null && a.score < 0.5 && !a.na)
          .map((a) => ({ a, q: qMap2.get(a.questionId)! }))
          .sort((x, y) => Number(y.q.critical) - Number(x.q.critical) || y.q.weight - x.q.weight || (x.a.score ?? 0) - (y.a.score ?? 0))
        const isRecent = plan.type === 'Follow-up 2' || (plan.type === 'Main Audit 2' && (plan.status !== 'Approved' || plan.visit!.getTime() >= new Date(2026, 5, 1).getTime()))
        let count = 0
        for (const { a, q } of failedAnswers) {
          const tag = tags.get(q.id)
          const severity: Severity = q.critical ? 'Critical' : q.weight >= 4 ? 'High' : q.weight === 3 ? 'Medium' : 'Low'
          const forceFinding = tag === 'cleanliness' && repeatedCleanOutlets.has(o.id) && (plan.type === 'Follow-up 1' || plan.type === 'Main Audit 2')
          if (!q.critical && !forceFinding) {
            if (count >= 4) continue
            if (!isRecent && !rng.bool(0.42)) continue
            if (isRecent && severity === 'Low' && !rng.bool(0.5)) continue
          }
          count++
          findSeq++
          const fid = `fnd-${String(findSeq).padStart(4, '0')}`
          const repeated = !!tag && CLEAN_TAGS.has(tag) && repeatedCleanOutlets.has(o.id) && plan.type === 'Main Audit 2' && tag === 'cleanliness'
          const status: FindingStatus = q.critical
            ? plannedCrit?.open
              ? isStory
                ? 'In Progress'
                : rng.bool(0.5)
                  ? 'Open'
                  : 'In Progress'
              : 'Closed'
            : isRecent
              ? rng.bool(0.7)
                ? 'Open'
                : 'In Progress'
              : rng.bool(0.6)
                ? 'Closed'
                : rng.bool(0.5)
                  ? 'Verified'
                  : 'Resolved'
          const sec = secs.find((s) => s.id === q.sectionId)!
          findings.push({
            id: fid,
            code: `F-${format(plan.visit!, 'yyMM')}-${String(findSeq).padStart(3, '0')}`,
            visitId: id,
            outletId: o.id,
            questionId: q.id,
            category: sec.category,
            title: findingTitle(q, a, tag),
            description: findingDescription(q, a, tag, isStory && plan.type === 'Main Audit 2'),
            severity,
            status,
            createdAt: iso(addMinutes(submittedAt ?? visitEnd ?? now, rng.int(30, 600))),
            repeated,
            correctiveActionId: null,
            alertId: null,
          })
          if (isStory && q.critical && plan.type === 'Main Audit 2') STORYLINE.findingId = fid
        }
        if (isStory && plan.type === 'Main Audit 2') {
          // ensure repeated flag for the story cleanliness finding
          const cf = findings.find((f) => f.visitId === id && f.title.toLowerCase().includes('clean'))
          if (cf) cf.repeated = true
        }
      }
    }
    visits.push(visit)
  }

  // ───────────────────────────── Reconcile open finding counts ─────────────────────────
  // Targets: 7 critical open, 18 high open, 31 medium open.
  reconcileOpen(findings, 'Critical', 7, rng)
  reconcileOpen(findings, 'High', 18, rng)
  reconcileOpen(findings, 'Medium', 31, rng)
  reconcileOpen(findings, 'Low', 12, rng)

  // ───────────────────────────── Alerts ─────────────────────────────
  const outletById = new Map(outletsBase.map((o) => [o.id, o]))
  const visitById = new Map(visits.map((v) => [v.id, v]))
  let alertSeq = 0
  const mkAlert = (partial: Omit<Alert, 'id' | 'code' | 'history'> & { history?: Alert['history'] }): Alert => {
    alertSeq++
    const id = `alr-${String(alertSeq).padStart(3, '0')}`
    const a: Alert = { ...partial, id, code: `AL-${String(alertSeq).padStart(4, '0')}`, history: partial.history ?? [] }
    a.history.unshift({ at: a.createdAt, by: 'Alert Engine', action: 'Created', note: `Rule triggered: ${a.type}` })
    if (a.acknowledgedAt) a.history.push({ at: a.acknowledgedAt, by: userName(a.ownerId), action: 'Acknowledged' })
    if (a.status === 'Investigating' || a.status === 'Action Required') a.history.push({ at: iso(addHours(new Date(a.acknowledgedAt ?? a.createdAt), rng.int(2, 20))), by: userName(a.ownerId), action: a.status, note: a.status === 'Action Required' ? 'Corrective action requested from outlet manager.' : 'Investigation opened with outlet management.' })
    if (a.resolvedAt) a.history.push({ at: a.resolvedAt, by: userName(a.ownerId), action: 'Resolved', note: 'Verified during follow-up assessment.' })
    if (a.status === 'Closed' && a.resolvedAt) a.history.push({ at: iso(addDays(new Date(a.resolvedAt), 2)), by: 'Omar Saleh', action: 'Closed' })
    alerts.push(a)
    return a
  }
  const ownerForOutlet = (outletId: string) => users.find((u) => u.role === 'ops_manager' && u.outletIds.includes(outletId))?.id ?? 'usr-002'

  for (const f of findings.filter((x) => x.severity === 'Critical')) {
    const v = visitById.get(f.visitId)!
    const o = outletById.get(f.outletId)!
    const open = f.status === 'Open' || f.status === 'In Progress'
    const created = new Date(f.createdAt)
    const isStory = f.id === STORYLINE.findingId
    const status: AlertStatus = !open ? (rng.bool(0.5) ? 'Closed' : 'Resolved') : isStory ? 'Investigating' : f.status === 'Open' ? (rng.bool(0.5) ? 'New' : 'Acknowledged') : rng.bool(0.5) ? 'Investigating' : 'Action Required'
    const ack = status === 'New' ? null : iso(addHours(created, rng.int(1, 9)))
    const alert = mkAlert({
      severity: 'Critical',
      type: f.title.toLowerCase().includes('food') || f.title.toLowerCase().includes('hygiene') ? 'Food Hygiene Failure' : f.title.toLowerCase().includes('exit') ? 'Unauthorized Safety Procedure' : 'CRITICAL SAFETY BREACH',
      outletId: o.id,
      visitId: v.id,
      findingId: f.id,
      title: `${f.title} — ${o.name}`,
      description: f.description,
      createdAt: iso(created),
      escalationDue: iso(addHours(created, 12)),
      ownerId: ownerForOutlet(o.id),
      status,
      acknowledgedAt: ack,
      resolvedAt: open ? null : iso(addDays(created, rng.int(5, 30))),
    })
    f.alertId = alert.id
    if (isStory) STORYLINE.alertId = alert.id
  }
  // Score below 70%
  const derivedTmp = deriveOutlets(outletsBase, visits, findings, thresholds)
  for (const o of derivedTmp.filter((x) => x.overallScore !== null && x.overallScore < 70)) {
    const latest = visits.filter((v) => v.outletId === o.id && (v.status === 'Approved' || v.status === 'Closed')).sort((a, b) => (b.visitDate ?? '').localeCompare(a.visitDate ?? ''))[0]
    const created = new Date(latest.reviewedAt ?? latest.submittedAt ?? latest.visitEnd!)
    mkAlert({
      severity: 'High',
      type: 'Outlet Score Below 70%',
      outletId: o.id,
      visitId: latest.id,
      findingId: null,
      title: `Outlet score ${o.overallScore!.toFixed(1)}% below intervention threshold — ${o.name}`,
      description: `${latest.type} at ${o.name} scored ${o.overallScore!.toFixed(1)}%, below the 70% critical threshold. Immediate management intervention and a follow-up assessment are required.`,
      createdAt: iso(created),
      escalationDue: iso(addHours(created, 24)),
      ownerId: ownerForOutlet(o.id),
      status: o.id === STORYLINE.outletId ? 'Action Required' : 'Investigating',
      acknowledgedAt: iso(addHours(created, rng.int(1, 6))),
      resolvedAt: null,
    })
  }
  // Repeated findings
  for (const f of findings.filter((x) => x.repeated).slice(0, 3)) {
    const o = outletById.get(f.outletId)!
    const created = new Date(f.createdAt)
    mkAlert({
      severity: 'High',
      type: 'Repeated Finding',
      outletId: o.id,
      visitId: f.visitId,
      findingId: f.id,
      title: `Repeated cleanliness finding across two consecutive assessments — ${o.name}`,
      description: `Cleanliness standards failed in both the previous follow-up and the latest main audit at ${o.name}. Root-cause analysis required.`,
      createdAt: iso(created),
      escalationDue: iso(addHours(created, 48)),
      ownerId: ownerForOutlet(o.id),
      status: rng.bool(0.5) ? 'Acknowledged' : 'Investigating',
      acknowledgedAt: iso(addHours(created, rng.int(2, 10))),
      resolvedAt: null,
    })
  }
  // Billing
  for (const f of findings.filter((x) => x.title.toLowerCase().includes('billing')).slice(0, 2)) {
    const o = outletById.get(f.outletId)!
    const created = new Date(f.createdAt)
    const open = f.status === 'Open' || f.status === 'In Progress'
    mkAlert({
      severity: 'High',
      type: 'Incorrect Billing',
      outletId: o.id,
      visitId: f.visitId,
      findingId: f.id,
      title: `Billing discrepancy identified — ${o.name}`,
      description: f.description,
      createdAt: iso(created),
      escalationDue: iso(addHours(created, 24)),
      ownerId: ownerForOutlet(o.id),
      status: open ? 'Acknowledged' : 'Resolved',
      acknowledgedAt: iso(addHours(created, 3)),
      resolvedAt: open ? null : iso(addDays(created, 9)),
    })
  }
  // Queue time
  for (const f of findings.filter((x) => x.title.toLowerCase().includes('queue')).slice(0, 2)) {
    const o = outletById.get(f.outletId)!
    const created = new Date(f.createdAt)
    mkAlert({
      severity: 'Medium',
      type: 'Queue Time Threshold Exceeded',
      outletId: o.id,
      visitId: f.visitId,
      findingId: f.id,
      title: `Queue waiting time exceeded standard — ${o.name}`,
      description: f.description,
      createdAt: iso(created),
      escalationDue: iso(addHours(created, 48)),
      ownerId: ownerForOutlet(o.id),
      status: rng.bool(0.5) ? 'New' : 'Acknowledged',
      acknowledgedAt: rng.bool(0.5) ? iso(addHours(created, 5)) : null,
      resolvedAt: null,
    })
  }
  // SLA breaches
  for (const v of visits.filter((x) => x.slaStatus === 'Breached' && x.submittedAt).sort((a, b) => b.submittedAt!.localeCompare(a.submittedAt!)).slice(0, 3)) {
    const o = outletById.get(v.outletId)!
    const created = new Date(v.submittedAt!)
    const resolved = created < subDays(now, 20)
    mkAlert({
      severity: 'Medium',
      type: 'Report SLA Breach',
      outletId: o.id,
      visitId: v.id,
      findingId: null,
      title: `Report submitted after 48-hour SLA — ${v.code}`,
      description: `The report for ${v.type} at ${o.name} was submitted ${Math.round((created.getTime() - new Date(v.visitEnd!).getTime()) / 3600000)} hours after visit completion, exceeding the 48-hour reporting SLA.`,
      createdAt: iso(created),
      escalationDue: iso(addHours(created, 24)),
      ownerId: 'usr-007',
      status: resolved ? 'Closed' : 'New',
      acknowledgedAt: resolved ? iso(addHours(created, 2)) : null,
      resolvedAt: resolved ? iso(addDays(created, 1)) : null,
    })
  }
  // Severe complaint
  const complaint = findings.find((x) => x.title.toLowerCase().includes('not resolved') && x.status !== 'Open')
  if (complaint) {
    const o = outletById.get(complaint.outletId)!
    const created = new Date(complaint.createdAt)
    mkAlert({
      severity: 'High',
      type: 'Severe Customer Complaint',
      outletId: o.id,
      visitId: complaint.visitId,
      findingId: complaint.id,
      title: `Guest issue ignored by staff — ${o.name}`,
      description: complaint.description,
      createdAt: iso(created),
      escalationDue: iso(addHours(created, 24)),
      ownerId: ownerForOutlet(o.id),
      status: 'Resolved',
      acknowledgedAt: iso(addHours(created, 4)),
      resolvedAt: iso(addDays(created, 12)),
    })
  }
  alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  // ───────────────────────────── Corrective actions ─────────────────────────────
  let capaSeq = 0
  const openCritical = findings.filter((f) => f.severity === 'Critical' && (f.status === 'Open' || f.status === 'In Progress'))
  const openHigh = findings.filter((f) => f.severity === 'High' && (f.status === 'Open' || f.status === 'In Progress'))
  const closedFindings = findings.filter((f) => f.status === 'Closed' || f.status === 'Verified' || f.status === 'Resolved')
  const openStatusPlan: CapaStatus[] = ['In Progress', 'In Progress', 'Assigned', 'Awaiting Evidence', 'Overdue', 'Open']
  const highStatusPlan: CapaStatus[] = ['In Progress', 'In Progress', 'In Progress', 'In Progress', 'In Progress', 'Assigned', 'Assigned', 'Assigned', 'Awaiting Evidence', 'Awaiting Evidence', 'Awaiting Verification', 'Awaiting Verification', 'Overdue', 'Overdue', 'Overdue']
  const mkCapa = (f: Finding, status: CapaStatus, closed: boolean): CorrectiveAction => {
    capaSeq++
    const id = `cap-${String(capaSeq).padStart(3, '0')}`
    const o = outletById.get(f.outletId)!
    const created = addHours(new Date(f.createdAt), rng.int(4, 48))
    const isStory = f.id === STORYLINE.findingId
    const targetDays = f.severity === 'Critical' ? 7 : f.severity === 'High' ? 14 : 30
    let target = addDays(created, targetDays)
    if (status === 'Overdue') target = subDays(now, rng.int(2, 12))
    if (status === 'Awaiting Verification' || status === 'Awaiting Evidence') target = addDays(now, rng.int(1, 6))
    if (status === 'In Progress' || status === 'Assigned' || status === 'Open') target = addDays(now, rng.int(3, 21))
    const closureDate = closed ? addDays(created, rng.int(3, targetDays + 5)) : null
    const priority = f.severity === 'Critical' ? 'Critical' : f.severity === 'High' ? 'High' : f.severity === 'Medium' ? 'Medium' : 'Low'
    const ownerId = ownerForOutlet(o.id)
    const history: CorrectiveAction['history'] = [{ at: iso(created), by: 'Fatima Al-Kuwari', action: 'Created', note: `Raised from finding ${f.code}` }]
    if (status !== 'Open') history.push({ at: iso(addHours(created, rng.int(2, 24))), by: 'Fatima Al-Kuwari', action: 'Assigned', note: `Assigned to ${userName(ownerId)}` })
    if (status === 'In Progress' || status === 'Awaiting Evidence' || status === 'Awaiting Verification' || closed) history.push({ at: iso(addDays(created, rng.int(1, 4))), by: userName(ownerId), action: 'In Progress', note: 'Immediate action implemented; corrective plan agreed with outlet manager.' })
    if (status === 'Awaiting Verification' || closed) history.push({ at: iso(addDays(created, rng.int(4, 9))), by: userName(ownerId), action: 'Evidence Submitted', note: 'Closure evidence uploaded for verification.' })
    if (closed && closureDate) history.push({ at: iso(closureDate), by: 'Omar Saleh', action: 'Closed', note: 'Verified effective during follow-up assessment.' })
    const capa: CorrectiveAction = {
      id,
      code: `CA-${format(created, 'yyMM')}-${String(capaSeq).padStart(3, '0')}`,
      findingId: f.id,
      outletId: o.id,
      category: f.category,
      title: f.title,
      description: f.description,
      rootCause: isStory ? 'Chiller unit in the cold-prep area failed on the afternoon shift; supervisor stored raw poultry on the pass uncovered while awaiting maintenance, contrary to the food-safety SOP.' : rng.pick(ROOT_CAUSES),
      immediateAction: isStory ? 'Raw items removed and discarded; pass sanitised; back-up chiller deployed within 2 hours; shift supervisor re-briefed on the SOP.' : rng.pick(['Issue rectified on the day by the duty manager.', 'Staff re-briefed at the next shift handover.', 'Area cleaned and re-inspected by the supervisor.', 'Temporary signage and supervision put in place.']),
      correctiveAction: isStory ? 'Replace chiller unit; introduce twice-daily temperature log with supervisor sign-off; re-train all kitchen staff on cold-chain and cross-contamination controls.' : rng.pick(['Re-train all front-line staff on the relevant SOP and record attendance.', 'Update the cleaning checklist with hourly supervisor verification.', 'Adjust shift roster to align staffing with peak footfall.', 'Schedule preventive maintenance and replace worn equipment.', 'Refresh sales-behaviour training with role-play sessions.']),
      preventiveAction: isStory ? 'Add cold-chain compliance to the weekly outlet self-audit; escalate any equipment fault to maintenance within 30 minutes via the facilities app.' : rng.pick(['Add the control to the weekly outlet self-audit checklist.', 'Include the standard in the new-starter induction programme.', 'Introduce monthly spot checks by the regional manager.', 'Add automated reminder in the shift briefing template.']),
      ownerId,
      ownerName: userName(ownerId),
      priority,
      createdAt: iso(created),
      targetDate: dayIso(target),
      evidenceIds: status === 'Awaiting Verification' || closed ? evidence.filter((e) => e.visitId === f.visitId).slice(0, 2).map((e) => e.id) : [],
      status: closed ? 'Closed' : status,
      reviewerId: closed || status === 'Awaiting Verification' ? 'usr-007' : null,
      closureDate: closureDate ? dayIso(closureDate) : null,
      verificationNote: closed ? 'Effectiveness verified during the follow-up assessment; no recurrence observed.' : null,
      history,
    }
    correctiveActions.push(capa)
    f.correctiveActionId = id
    if (isStory) STORYLINE.actionId = id
    return capa
  }
  openCritical.forEach((f, i) => mkCapa(f, f.id === STORYLINE.findingId ? 'Awaiting Verification' : openStatusPlan[i % openStatusPlan.length], false))
  openHigh.slice(0, 15).forEach((f, i) => mkCapa(f, highStatusPlan[i % highStatusPlan.length], false))
  rng.shuffle(closedFindings)
    .sort((a, b) => Number(b.severity === 'Critical') - Number(a.severity === 'Critical'))
    .slice(0, 100)
    .forEach((f) => mkCapa(f, 'Closed', true))
  correctiveActions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  // ───────────────────────────── Comments ─────────────────────────────
  if (STORYLINE.findingId) {
    comments.push(
      { id: 'cmt-001', entityType: 'visit', entityId: STORYLINE.mainAuditVisitId, userId: 'usr-007', userName: 'Omar Saleh', text: 'Evidence reviewed. Critical food-safety failure confirmed from photo IMG evidence; alert escalated to regional manager within the 12-hour target.', createdAt: '2026-07-06T11:20:00' },
      { id: 'cmt-002', entityType: 'finding', entityId: STORYLINE.findingId, userId: 'usr-003', userName: 'Rajesh Menon', text: 'Outlet manager confirmed the chiller failure. Back-up unit installed the same evening; formal CAPA raised.', createdAt: '2026-07-06T15:42:00' },
      { id: 'cmt-003', entityType: 'corrective_action', entityId: STORYLINE.actionId, userId: 'usr-003', userName: 'Rajesh Menon', text: 'Replacement chiller commissioned 18 Jul. Temperature logs attached for the first two weeks. Requesting verification at Follow-up 2.', createdAt: '2026-08-02T09:15:00' },
      { id: 'cmt-004', entityType: 'visit', entityId: STORYLINE.followUpVisitId, userId: 'usr-004', userName: 'Sara Al-Naimi', text: 'Follow-up completed. Cold-prep area compliant, temperature log visible and signed. Service timing much improved.', createdAt: '2026-09-03T12:05:00' },
    )
  }

  // ───────────────────────────── Notifications ─────────────────────────────
  const notifications: Notification[] = []
  const storyAlert = alerts.find((a) => a.id === STORYLINE.alertId)
  const pushN = (n: Omit<Notification, 'id'>) => notifications.push({ ...n, id: `ntf-${String(notifications.length + 1).padStart(3, '0')}` })
  const newestCritical = alerts.filter((a) => a.severity === 'Critical' && a.status === 'New')[0]
  if (newestCritical) pushN({ type: 'critical_issue', title: 'Critical safety finding requires acknowledgement', message: newestCritical.title, createdAt: newestCritical.createdAt, read: false, link: `/quality/alerts?alert=${newestCritical.id}`, severity: 'Critical', audience: ['super_admin', 'client_admin', 'ops_manager', 'executive'] })
  const awaiting = visits.filter((v) => v.status === 'Submitted' || v.status === 'Under Review').sort((a, b) => b.submittedAt!.localeCompare(a.submittedAt!))
  awaiting.slice(0, 3).forEach((v) => pushN({ type: 'approval_required', title: 'Report awaiting approval', message: `${v.code} · ${outletById.get(v.outletId)!.name} · ${v.type}`, createdAt: v.submittedAt!, read: false, link: `/operations/visits/${v.id}`, severity: 'Info', audience: ['super_admin', 'client_admin'] }))
  const overdueCapas = correctiveActions.filter((c) => c.status === 'Overdue')
  overdueCapas.slice(0, 2).forEach((c) => pushN({ type: 'action_overdue', title: 'Corrective action overdue', message: `${c.code} · ${c.title} · ${outletById.get(c.outletId)!.name}`, createdAt: iso(addDays(new Date(c.targetDate), 1)), read: false, link: `/quality/corrective-actions?action=${c.id}`, severity: 'High', audience: ['super_admin', 'client_admin', 'ops_manager'] }))
  const dueToday = visits.filter((v) => v.status === 'Draft' && v.submissionDeadline && v.submissionDeadline.startsWith('2026-09-13'))
  dueToday.forEach((v) => pushN({ type: 'report_overdue', title: 'Report due today', message: `${v.code} · ${outletById.get(v.outletId)!.name} · submission due ${format(new Date(v.submissionDeadline!), 'HH:mm')}`, createdAt: '2026-09-13T06:00:00', read: false, link: `/operations/visits/${v.id}`, severity: 'Medium', audience: ['super_admin', 'shopper'] }))
  if (storyAlert) pushN({ type: 'escalation', title: 'Escalation approaching for critical alert', message: `${storyAlert.code} · ${outletById.get(storyAlert.outletId)!.name} · corrective action awaiting verification`, createdAt: '2026-09-12T16:30:00', read: true, link: `/quality/alerts?alert=${storyAlert.id}`, severity: 'High', audience: ['super_admin', 'client_admin', 'ops_manager'] })
  const shopperVisits = visits.filter((v) => v.shopperId === 'shp-001' && v.status === 'Assigned').sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
  shopperVisits.slice(0, 2).forEach((v, i) => pushN({ type: i === 0 ? 'visit_due' : 'assignment', title: i === 0 ? 'Upcoming visit' : 'New visit assigned', message: `${v.code} · ${outletById.get(v.outletId)!.name} · scheduled ${format(new Date(v.scheduledDate), 'dd MMM')}`, createdAt: i === 0 ? '2026-09-13T07:00:00' : '2026-09-11T10:12:00', read: i !== 0, link: `/operations/visits/${v.id}`, severity: 'Info', audience: ['shopper'] }))
  const recentSubmitted = visits.filter((v) => v.submittedAt && v.submittedAt > '2026-09-05').sort((a, b) => b.submittedAt!.localeCompare(a.submittedAt!))
  recentSubmitted.slice(0, 2).forEach((v) => pushN({ type: 'report_submitted', title: 'Report submitted', message: `${v.code} · ${outletById.get(v.outletId)!.name} · score ${v.score?.toFixed(1)}%`, createdAt: v.submittedAt!, read: true, link: `/operations/visits/${v.id}`, severity: 'Info', audience: ['super_admin', 'client_admin', 'analyst'] }))
  notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  // ───────────────────────────── Activity logs ─────────────────────────────
  let logSeq = 0
  const pushLog = (timestamp: string, userId: string, action: string, module: string, recordId: string, result: ActivityLog['result'] = 'Success', details?: string) => {
    logSeq++
    logs.push({ id: `log-${String(logSeq).padStart(5, '0')}`, timestamp, userId, userName: userName(userId), action, module, recordId, ip: IPS[hashString(userId + timestamp) % IPS.length], result, details })
  }
  const shopperUserId = (shopperId: string | null) => users.find((u) => u.shopperId === shopperId)?.id ?? 'usr-013'
  for (const v of visits) {
    if (v.visitStart && v.visitStart > '2026-06-01') pushLog(v.visitStart, shopperUserId(v.shopperId), 'Visit started', 'Visits', v.code)
    if (v.status === 'Draft') pushLog(iso(addMinutes(new Date(v.visitEnd!), rng.int(30, 300))), shopperUserId(v.shopperId), 'Draft saved', 'Visits', v.code)
    if (v.submittedAt && v.submittedAt > '2026-06-01') {
      pushLog(iso(addMinutes(new Date(v.submittedAt), -rng.int(10, 60))), shopperUserId(v.shopperId), 'Evidence uploaded', 'Evidence', v.code, 'Success', `${evidence.filter((e) => e.visitId === v.id).length} files`)
      pushLog(v.submittedAt, shopperUserId(v.shopperId), 'Report submitted', 'Visits', v.code)
    }
    if (v.reviewedAt && v.reviewedAt > '2026-06-01' && (v.status === 'Approved' || v.status === 'Closed')) pushLog(v.reviewedAt, v.reviewerId ?? 'usr-007', 'Reviewer approved', 'Reviews', v.code, 'Success', `Score ${v.score?.toFixed(1)}%`)
    if (v.status === 'Assigned' && v.shopperId) pushLog(iso(subDays(new Date(v.scheduledDate), rng.int(5, 20))), 'usr-001', 'Shopper assigned', 'Assignments', v.code, 'Success', shoppers.find((s) => s.id === v.shopperId)?.name)
  }
  for (const a of alerts) pushLog(a.createdAt, 'usr-001', 'Alert created', 'Alerts', a.code, 'Success', `${a.severity} · ${a.type}`)
  for (const c of correctiveActions.filter((x) => x.createdAt > '2026-05-01')) {
    pushLog(c.createdAt, 'usr-002', 'Corrective action created', 'Corrective Actions', c.code)
    if (c.status === 'Closed' && c.closureDate) pushLog(`${c.closureDate}T16:${String(rng.int(10, 59))}:00`, 'usr-007', 'Corrective action closed', 'Corrective Actions', c.code)
  }
  for (const u of users.filter((x) => x.lastLogin)) pushLog(u.lastLogin!, u.id, 'User logged in', 'Authentication', u.id)
  pushLog('2026-09-12T15:20:00', 'usr-001', 'Role modified', 'Users', 'usr-019', 'Success', 'client_admin → invited stakeholder')
  pushLog('2026-09-12T15:18:00', 'usr-001', 'User created', 'Users', 'usr-019', 'Success', 'Grace Adeyemi')
  pushLog('2026-09-10T09:02:00', 'usr-001', 'Audit template updated', 'Templates', 'FOLLOW-UP', 'Success', 'Version 2.1 activated')
  pushLog('2026-09-09T11:47:00', 'usr-004', 'Access denied', 'Reports', '/reports/management', 'Denied', 'Role shopper lacks reports.management')
  pushLog('2026-09-08T08:30:00', 'usr-002', 'KPI weights reviewed', 'KPI Configuration', 'kpi-config', 'Success', 'No change (total 100%)')
  pushLog('2026-09-07T22:14:00', 'usr-013', 'Login failed', 'Authentication', 'usr-013', 'Failed', 'Invalid password (2nd attempt)')
  logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  // ───────────────────────────── Shopper stats ─────────────────────────────
  for (const s of shoppers) {
    const sv = visits.filter((v) => v.shopperId === s.id && v.submittedAt)
    s.completedVisits = sv.length
    const within = sv.filter((v) => v.slaStatus === 'Within SLA' || v.slaStatus === 'Within Target').length
    s.onTimeSubmissionPct = sv.length ? Math.round((within / sv.length) * 1000) / 10 : 0
  }

  // ───────────────────────────── Management reports ─────────────────────────────
  const reports: ManagementReport[] = [
    { id: 'rep-001', code: 'RPT-2026-001', title: 'Main Audit 1 — Portfolio Report', type: 'Main Audit Report', period: 'Oct – Dec 2025', generatedAt: '2026-01-12T10:00:00', generatedBy: 'Omar Saleh', status: 'Published', scope: 'All 50 outlets', outletIds: [], summary: 'Baseline assessment across 50 F&B and entertainment outlets. Portfolio average 83.2%; upselling and service speed identified as primary gaps.', pages: 46 },
    { id: 'rep-002', code: 'RPT-2026-002', title: 'Follow-up 1 — Summary Report', type: 'Follow-up Report', period: 'Jan – Mar 2026', generatedAt: '2026-04-09T14:30:00', generatedBy: 'Omar Saleh', status: 'Published', scope: 'All 50 outlets', outletIds: [], summary: 'Verification of corrective actions raised at Main Audit 1. 78% of actions verified effective; average score improved 2.1 points.', pages: 28 },
    { id: 'rep-003', code: 'RPT-2026-003', title: 'Q1 2026 Quarterly Performance', type: 'Quarterly Performance', period: 'Jan – Mar 2026', generatedAt: '2026-04-15T09:00:00', generatedBy: 'Priya Nair', status: 'Published', scope: 'All brands', outletIds: [], summary: 'Quarterly KPI performance, brand ranking and trend analysis.', pages: 22 },
    { id: 'rep-004', code: 'RPT-2026-004', title: 'Q2 2026 Quarterly Performance', type: 'Quarterly Performance', period: 'Apr – Jun 2026', generatedAt: '2026-07-10T09:00:00', generatedBy: 'Priya Nair', status: 'Published', scope: 'All brands', outletIds: [], summary: 'Quarterly KPI performance, brand ranking and trend analysis.', pages: 24 },
    { id: 'rep-005', code: 'RPT-2026-005', title: 'Main Audit 2 — Portfolio Report', type: 'Main Audit Report', period: 'Apr – Aug 2026', generatedAt: '2026-08-28T16:45:00', generatedBy: 'Omar Saleh', status: 'Final', scope: '46 approved visits', outletIds: [], summary: 'Second main audit cycle. Portfolio average 87.4%; 7 critical findings escalated; three outlets below 70%.', pages: 52 },
    { id: 'rep-006', code: 'RPT-2026-006', title: 'Risk & Compliance Review — August 2026', type: 'Risk & Compliance', period: 'Aug 2026', generatedAt: '2026-09-02T11:15:00', generatedBy: 'Fatima Al-Kuwari', status: 'Final', scope: 'All outlets', outletIds: [], summary: 'Critical and high-risk findings, escalation SLA performance and safety compliance by segment.', pages: 18 },
    { id: 'rep-007', code: 'RPT-2026-007', title: 'Corrective Action Status — September 2026', type: 'Corrective Action', period: 'Sep 2026', generatedAt: '2026-09-11T08:20:00', generatedBy: 'Fatima Al-Kuwari', status: 'Final', scope: 'Open & closed actions', outletIds: [], summary: 'CAPA closure rate 82%, overdue actions by outlet and owner, verification backlog.', pages: 14 },
    { id: 'rep-008', code: 'RPT-2026-008', title: `Outlet Performance — ${storylineOutlet.name}`, type: 'Outlet Performance', period: 'Oct 2025 – Sep 2026', generatedAt: '2026-09-10T13:00:00', generatedBy: 'Rajesh Menon', status: 'Draft', scope: storylineOutlet.name, outletIds: [storylineOutlet.id], summary: 'Main Audit 2 critical finding, corrective action progress and Follow-up 2 verification (pending approval).', pages: 12 },
    { id: 'rep-009', code: 'RPT-2026-009', title: '12-Month Trend Analysis', type: 'Trend Analysis', period: 'Oct 2025 – Sep 2026', generatedAt: '2026-09-12T10:30:00', generatedBy: 'Priya Nair', status: 'Final', scope: 'All outlets', outletIds: [], summary: 'Monthly KPI trends, improvement after corrective actions, F&B vs Entertainment comparison.', pages: 20 },
    { id: 'rep-010', code: 'RPT-2026-010', title: 'Executive Summary — September 2026', type: 'Executive Summary', period: 'Sep 2026', generatedAt: '2026-09-13T08:00:00', generatedBy: 'Omar Saleh', status: 'Draft', scope: 'Board pack', outletIds: [], summary: 'Organisation health, top and bottom outlets, critical risks, corrective action status and recommendations.', pages: 8 },
    { id: 'rep-011', code: 'RPT-2026-011', title: 'Follow-up 2 — Interim Summary', type: 'Follow-up Report', period: 'Sep – Nov 2026', generatedAt: '2026-09-13T09:30:00', generatedBy: 'Omar Saleh', status: 'Draft', scope: 'In-progress cycle', outletIds: [], summary: 'Early verification results from the second follow-up cycle (4 submitted, 12 in progress).', pages: 6 },
  ]

  const outlets = deriveOutlets(outletsBase, visits, findings, thresholds)

  return {
    organization: DEFAULT_ORGANIZATION,
    brands,
    outlets,
    users,
    shoppers,
    trainingModules: TRAINING_MODULES,
    templates,
    scenarios: SCENARIOS,
    sections,
    questions,
    visits,
    answers,
    evidence,
    findings,
    alerts,
    correctiveActions,
    comments,
    notifications,
    activityLogs: logs,
    kpiConfig,
    thresholds,
    reports,
    notificationRules: DEFAULT_NOTIFICATION_RULES,
  }
}

// ───────────────────────────── helpers ─────────────────────────────

/**
 * A dataset containing configuration only — no outlets, visits, findings, reports or evidence.
 *
 * This mirrors exactly what Live Mode looks like on day one: migrations 0001-0004 seed the
 * organisation, roles, permissions, KPI weightings, score thresholds, training modules,
 * notification rules, assessment templates and the scenario library, and nothing else.
 *
 * Used to preview a day-one system and to exercise every empty state before go-live.
 * The demo sign-in accounts are retained, because without a user record nobody could log in.
 */
export function emptyDataset(): Dataset {
  const { templates, sections, questions } = buildTemplates()
  return {
    organization: DEFAULT_ORGANIZATION,
    brands: [],
    outlets: [],
    users: [
      mkUser('usr-001', 'Adam Reynolds', 'admin@insight360.demo', 'super_admin', 'Platform Administrator', [], null),
      mkUser('usr-002', 'Fatima Al-Kuwari', 'clientadmin@insight360.demo', 'client_admin', 'Head of Customer Experience', [], null),
      mkUser('usr-003', 'Rajesh Menon', 'manager@insight360.demo', 'ops_manager', 'Regional Operations Manager', [], null),
      mkUser('usr-004', 'Sara Al-Naimi', 'shopper@insight360.demo', 'shopper', 'Senior Mystery Shopper', [], null, 'shp-001'),
      mkUser('usr-005', 'Priya Nair', 'analyst@insight360.demo', 'analyst', 'Customer Experience Analyst', [], null),
      mkUser('usr-006', 'Khalid Al-Mansoori', 'executive@insight360.demo', 'executive', 'Chief Operating Officer', [], null),
    ],
    shoppers: [],
    trainingModules: TRAINING_MODULES,
    templates,
    scenarios: SCENARIOS,
    sections,
    questions,
    visits: [],
    answers: [],
    evidence: [],
    findings: [],
    alerts: [],
    correctiveActions: [],
    comments: [],
    notifications: [],
    activityLogs: [],
    kpiConfig: DEFAULT_KPI_CONFIG,
    thresholds: DEFAULT_THRESHOLDS,
    reports: [],
    notificationRules: DEFAULT_NOTIFICATION_RULES,
  }
}

function mkUser(id: string, name: string, email: string, role: Role, title: string, outletIds: string[], lastLogin: string | null, shopperId?: string): User {
  return {
    id,
    name,
    email,
    role,
    status: 'active',
    title,
    outletIds,
    brandIds: [],
    lastLogin,
    mfaEnabled: role === 'super_admin' || role === 'client_admin' || role === 'executive',
    createdAt: '2025-09-15T09:00:00',
    shopperId,
  }
}

function genAnswer(q: Question, t: number, rng: Rng, forced?: 'fail' | 'pass' | AnswerValue): { value: AnswerValue; na: boolean } {
  if (forced !== undefined) {
    if (forced === 'fail') {
      switch (q.type) {
        case 'yes_no':
        case 'pass_fail':
          return { value: false, na: false }
        case 'rating_5':
          return { value: rng.int(1, 2), na: false }
        case 'rating_10':
          return { value: rng.int(2, 4), na: false }
        case 'time':
        case 'numeric':
          return { value: Math.round((q.threshold ?? 5) * rng.range(1.7, 2.4)), na: false }
        case 'multiple_choice':
          return { value: q.options?.[q.options.length - 1] ?? null, na: false }
        default:
          return { value: 'Non-compliance observed.', na: false }
      }
    }
    if (forced === 'pass') {
      switch (q.type) {
        case 'yes_no':
        case 'pass_fail':
          return { value: true, na: false }
        case 'rating_5':
          return { value: rng.int(4, 5), na: false }
        case 'rating_10':
          return { value: rng.int(8, 10), na: false }
        case 'time':
        case 'numeric':
          return { value: Math.round((q.threshold ?? 5) * rng.range(0.4, 0.9)), na: false }
        case 'multiple_choice':
          return { value: q.options?.[0] ?? null, na: false }
        default:
          return { value: 'Compliant.', na: false }
      }
    }
    return { value: forced, na: false }
  }
  if (q.allowNA && rng.bool(0.1)) return { value: null, na: true }
  switch (q.type) {
    case 'yes_no':
    case 'pass_fail': {
      const p = q.critical ? 0.995 : Math.max(0.03, Math.min(0.99, t * 1.03))
      return { value: rng.bool(p), na: false }
    }
    case 'rating_5':
      return { value: Math.max(1, Math.min(5, Math.round(1 + 4 * t + rng.normal(0, 0.55)))), na: false }
    case 'rating_10':
      return { value: Math.max(1, Math.min(10, Math.round(1 + 9 * t + rng.normal(0, 1)))), na: false }
    case 'multiple_choice': {
      const n = q.options?.length ?? 2
      const i = Math.max(0, Math.min(n - 1, Math.round((1 - t) * (n - 1) + rng.normal(0, 0.45))))
      return { value: q.options?.[i] ?? null, na: false }
    }
    case 'time':
    case 'numeric': {
      const th = q.threshold ?? 5
      const ok = rng.bool(Math.min(0.97, t * 1.02))
      const v = ok ? th * rng.range(0.3, 0.98) : th * rng.range(1.15, 1.95)
      return { value: Math.round(v * 10) / 10, na: false }
    }
    case 'text':
      return { value: rng.pick(POSITIVE_OBSERVATIONS), na: false }
    case 'photo':
    case 'video':
    default:
      return { value: null, na: false }
  }
}

function mkComment(q: Question, value: AnswerValue, na: boolean, tag: string | undefined, rng: Rng, story: boolean): string {
  if (na) return 'Not applicable to this scenario.'
  const s = scoreQuestion(q, value, na)
  const failed = s !== null && s < 0.5
  if (story && tag === 'food_safety') return 'Uncovered raw poultry observed on the pass beside plated ready-to-eat dishes; chiller display read 11°C. Photographed at 19:42. Duty supervisor informed on departure.'
  if (story && tag === 'time_receive') return 'Main course arrived 27 minutes after order confirmation; no proactive update from the server. Kitchen appeared understaffed for the covers.'
  if (story && tag === 'cleanliness') return 'Table surface had visible residue and crumbs on seating; wiped only after I pointed it out.'
  if (story && tag === 'upsell') return 'No suggestion of starters, sides, desserts or beverages at any point of the order.'
  if (story && tag === 'washroom') return 'Washroom floor wet with no signage; soap dispenser empty; last check on the log was 3 hours earlier.'
  if (!failed) {
    if (q.commentRequired || rng.bool(0.25)) return rng.pick(POSITIVE_OBSERVATIONS)
    return ''
  }
  if (q.commentRequired || rng.bool(0.7)) {
    if (tag === 'upsell' || tag === 'cross_sell') return 'No upselling or cross-selling attempt was made during the order.'
    if (tag === 'cleanliness') return 'Table showed visible residue; not wiped before seating.'
    if (tag === 'washroom') return 'Washroom lacked hand soap and floor was wet without signage.'
    if (tag === 'time_receive') return `Order received after ${value} minutes, above the 15-minute standard.`
    if (tag === 'time_queue') return `Queue waited ${value} minutes with no acknowledgement or wait-time communication.`
    if (tag === 'billing') return 'Receipt included an item that was not ordered (overcharge). Corrected only after being raised.'
    if (tag === 'safety_briefing') return 'No safety briefing delivered before the activity started; guests were directed straight to the equipment.'
    if (tag === 'staff_safety') return 'Staff member observed operating without the required safety harness / procedure.'
    if (tag === 'food_safety') return 'Uncovered food stored at room temperature next to the prep area.'
    return rng.pick(IMPROVEMENT_OBSERVATIONS)
  }
  return ''
}

function evidenceTitle(q: Question, failed: boolean, tag?: string): string {
  if (tag === 'food_safety') return failed ? 'Food-safety hazard on the pass' : 'Food preparation area'
  if (tag === 'billing') return 'Receipt'
  if (tag === 'cleanliness') return failed ? 'Table condition on arrival' : 'Table setting on arrival'
  if (tag === 'washroom') return failed ? 'Washroom condition' : 'Washroom check'
  if (tag === 'safety_briefing') return failed ? 'Activity start without briefing' : 'Safety briefing in progress'
  if (tag === 'equipment') return failed ? 'Equipment wear' : 'Equipment condition'
  const short = q.text.replace(/\?$/, '').replace(/^(Was|Did|Were|Is)\s+/i, '')
  return short.length > 44 ? `${short.slice(0, 42)}…` : short
}

function findingTitle(q: Question, a: VisitAnswer, tag?: string): string {
  switch (tag) {
    case 'food_safety':
      return 'Critical food-safety hazard observed'
    case 'safety_briefing':
      return 'Safety briefing not delivered before activity'
    case 'staff_safety':
      return 'Staff non-compliance with safety procedure'
    case 'time_receive':
      return `Service delay: order received after ${a.value} minutes`
    case 'time_order':
      return `Order-taking delay: ${a.value} minutes to take order`
    case 'time_queue':
      return `Queue waiting time ${a.value} minutes exceeds standard`
    case 'time_greet':
      return `Greeting delayed: ${a.value} minutes to first acknowledgement`
    case 'cleanliness':
      return 'Cleanliness: table / activity area not clean on arrival'
    case 'hygiene':
      return 'Hygiene: floors, seating or shared surfaces below standard'
    case 'washroom':
      return 'Washroom cleanliness and supplies below standard'
    case 'upsell':
      return 'No upselling attempt made'
    case 'cross_sell':
      return 'No cross-selling of complementary items'
    case 'billing':
      return 'Billing inaccuracy on receipt'
    case 'order_accuracy':
      return 'Order delivered incorrectly'
    case 'problem_solving':
      return a.value === 'Not resolved / ignored' ? 'Guest issue not resolved / ignored' : 'Guest issue only partially resolved'
    case 'greet_30s':
      return 'Guest not acknowledged within 30 seconds'
    case 'temperature':
      return 'Food not served at the correct temperature'
    case 'equipment':
      return 'Equipment condition below standard'
    case 'social_response':
      return 'Social-media enquiry not answered within 2 hours'
    case 'delivery_time':
      return 'Delivery outside the promised time window'
    case 'hand_hygiene':
      return 'Hand-hygiene / glove practice not followed'
    default: {
      const t = q.text.replace(/\?$/, '')
      return `Standard not met: ${t.charAt(0).toLowerCase()}${t.slice(1)}`
    }
  }
}

function findingDescription(q: Question, a: VisitAnswer, tag: string | undefined, story: boolean): string {
  if (story && tag === 'food_safety') return 'Uncovered raw poultry stored on the pass beside plated ready-to-eat dishes; chiller display reading 11°C. Immediate cross-contamination risk. Photographic evidence captured at 19:42 and duty supervisor informed on departure.'
  if (a.comment) return a.comment
  const valueText = typeof a.value === 'boolean' ? (a.value ? 'Yes' : 'No') : String(a.value ?? '—')
  return `${q.text} — recorded response: ${valueText}. ${q.guidance ? `Standard: ${q.guidance}` : ''}`.trim()
}

function mkNarrative(rng: Rng, o: Outlet, answers: VisitAnswer[], qMap: Map<string, Question>, tags: Map<string, string>, storyMain: boolean, storyFollow: boolean): string {
  if (storyMain) {
    return `${NARRATIVE_OPENERS[0]} I was seated after a 6-minute wait but not acknowledged for the first 2 minutes. Ordering took 9 minutes and the main course arrived 27 minutes after confirmation with no update from the server. The table had visible residue on arrival and the washroom floor was wet with no signage. No upselling or promotions were offered. Critically, while passing the open kitchen I observed uncovered raw poultry stored on the pass next to plated dishes with the chiller reading 11°C; I photographed the hazard and informed the duty supervisor before leaving. Billing was accurate and the farewell was courteous.`
  }
  if (storyFollow) {
    return `${NARRATIVE_OPENERS[2]} Marked improvement since the July audit: greeted within 30 seconds, order taken in 4 minutes and the main course served in 12. The table and washroom were clean and the cleaning log was signed hourly. The cold-prep area was compliant with a visible temperature log signed by the supervisor. The server suggested a starter and a dessert, although no beverage pairing was offered. Overall the corrective actions appear embedded in daily operation.`
  }
  const failed = answers.filter((a) => a.score !== null && a.score < 0.5 && !a.na).map((a) => qMap.get(a.questionId)!)
  const passed = answers.filter((a) => a.score !== null && a.score >= 0.9 && !a.na).map((a) => qMap.get(a.questionId)!)
  const opener = rng.pick(NARRATIVE_OPENERS)
  const pos = passed.length ? rng.pick(POSITIVE_OBSERVATIONS) : 'Service standards were broadly met.'
  const neg = failed.length ? failed.slice(0, 2).map((q) => (tags.get(q.id) ? findingTitle(q, { value: null } as VisitAnswer, tags.get(q.id)).toLowerCase() : `${q.text.replace(/\?$/, '').toLowerCase()} was not met`)).join('; ') : ''
  const closing = o.segment === 'Entertainment' ? 'Safety procedures and staff engagement were observed throughout the activity.' : 'The overall experience was consistent with the brand promise.'
  return `${opener} ${pos} ${neg ? `Areas for attention: ${neg}.` : ''} ${closing}`.replace(/\s+/g, ' ').trim()
}

function reconcileOpen(findings: Finding[], severity: Severity, target: number, rng: Rng) {
  const list = findings.filter((f) => f.severity === severity)
  const open = list.filter((f) => f.status === 'Open' || f.status === 'In Progress')
  if (open.length > target) {
    // close the oldest extras
    const extras = [...open].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, open.length - target)
    for (const f of extras) f.status = rng.bool(0.6) ? 'Closed' : 'Verified'
  } else if (open.length < target) {
    const closed = list.filter((f) => f.status !== 'Open' && f.status !== 'In Progress').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, target - open.length)
    for (const f of closed) f.status = rng.bool(0.7) ? 'Open' : 'In Progress'
  }
}
