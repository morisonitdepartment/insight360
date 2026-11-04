import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { STORYLINE } from '@/data/seed'
import { CLIENT } from '@/config/client'
import { T } from '@/config/terms'

export interface DemoStep {
  title: string
  description: string
  path: string
  /** Optional data-tour target to highlight */
  target?: string
}

interface GuidedDemoValue {
  active: boolean
  stepIndex: number
  steps: DemoStep[]
  start: () => void
  stop: () => void
  next: () => void
  prev: () => void
  goTo: (i: number) => void
}

const GuidedDemoContext = createContext<GuidedDemoValue | null>(null)

export function buildDemoSteps(): DemoStep[] {
  return [
    {
      title: 'Executive Dashboard',
      description: 'Organisation health at a glance: the overall experience score, KPI cards with period variance, and the critical findings that need attention.',
      path: '/performance/executive',
      target: 'kpi-overall',
    },
    {
      title: 'Portfolio Performance',
      description: `All ${CLIENT.snapshot.outlets} ${T.outlets} ranked with risk ratings. Filter by segment or risk to isolate the ${T.outlets} that require intervention.`,
      path: '/performance/outlets?risk=Critical',
      target: 'outlet-table',
    },
    {
      title: `${T.Outlet} Drill-Down`,
      description: `${STORYLINE.outletName} scored ${STORYLINE.mainAuditScore.toFixed(1)}% at its latest main audit: service delays, cleanliness gaps, no upselling and one critical food-safety observation.`,
      path: `/performance/outlets/${STORYLINE.outletId}`,
      target: 'outlet-score',
    },
    {
      title: 'Visit Evidence',
      description: 'The visit report presents the weighted questionnaire results, the shopper narrative and the photographic evidence behind every failed standard.',
      path: `/reports/visits/${STORYLINE.mainAuditVisitId}#evidence`,
      target: 'evidence-gallery',
    },
    {
      title: 'Critical Alert',
      description: 'The critical hygiene failure automatically raised an alert with a 12-hour escalation target, an owner and a full audit trail.',
      path: `/quality/alerts?alert=${STORYLINE.alertId}`,
      target: 'alert-detail',
    },
    {
      title: 'Corrective Action',
      description: 'A CAPA record captures root cause, immediate, corrective and preventive actions, the owner, target date and closure evidence awaiting verification.',
      path: `/quality/corrective-actions?action=${STORYLINE.actionId}`,
      target: 'capa-detail',
    },
    {
      title: 'Follow-Up Improvement',
      description: `The follow-up visit re-assessed the same standards: the score improved from ${STORYLINE.mainAuditScore.toFixed(1)}% to ${STORYLINE.followUpScore.toFixed(1)}%, and the trend line shows the recovery.`,
      path: `/performance/outlets/${STORYLINE.outletId}#comparison`,
      target: 'outlet-comparison',
    },
    {
      title: 'Management Reporting',
      description: 'Main audit reports, follow-up summaries and quarterly packs bring trends, gaps, risks and recommendations together for the board.',
      path: '/reports/management',
      target: 'reports-list',
    },
  ]
}

export function GuidedDemoProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  // The steps quote the storyline outlet and its scores, which the seed fills in
  // when the dataset is generated — after this provider has mounted. Build them
  // when the tour starts, by which time the data has loaded.
  const [steps, setSteps] = useState<DemoStep[]>(() => buildDemoSteps())

  const start = useCallback(() => {
    setSteps(buildDemoSteps())
    setStepIndex(0)
    setActive(true)
  }, [])
  const stop = useCallback(() => setActive(false), [])
  const next = useCallback(() => setStepIndex((i) => Math.min(steps.length - 1, i + 1)), [steps.length])
  const prev = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), [])
  const goTo = useCallback((i: number) => setStepIndex(Math.max(0, Math.min(steps.length - 1, i))), [steps.length])

  const value = useMemo(() => ({ active, stepIndex, steps, start, stop, next, prev, goTo }), [active, stepIndex, steps, start, stop, next, prev, goTo])
  return <GuidedDemoContext.Provider value={value}>{children}</GuidedDemoContext.Provider>
}

export function useGuidedDemo(): GuidedDemoValue {
  const ctx = useContext(GuidedDemoContext)
  if (!ctx) throw new Error('useGuidedDemo must be used within GuidedDemoProvider')
  return ctx
}
