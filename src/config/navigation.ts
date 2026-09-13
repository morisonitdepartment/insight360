import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  UserCheck,
  Users,
  Gauge,
  Store,
  BarChart3,
  Scale,
  TrendingUp,
  AlertTriangle,
  Wrench,
  BellRing,
  FileText,
  FileBarChart,
  FilePlus2,
  Download,
  Images,
  Building2,
  UserCog,
  ShieldCheck,
  ListChecks,
  SlidersHorizontal,
  BellDot,
  Settings,
  History,
  GitCompare,
} from 'lucide-react'
import type { Permission } from './permissions'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  permission: Permission
  /** Additional permissions any of which grants access */
  anyOf?: Permission[]
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const NAVIGATION: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ label: 'Overview', path: '/', icon: LayoutDashboard, permission: 'dashboard.overview' }],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Visits', path: '/operations/visits', icon: ClipboardList, permission: 'visits.view' },
      { label: 'Audit Calendar', path: '/operations/calendar', icon: CalendarDays, permission: 'calendar.view' },
      { label: 'Assignments', path: '/operations/assignments', icon: UserCheck, permission: 'visits.assign' },
      { label: 'Mystery Shoppers', path: '/operations/shoppers', icon: Users, permission: 'shoppers.view' },
    ],
  },
  {
    title: 'Performance',
    items: [
      { label: 'Executive Dashboard', path: '/performance/executive', icon: Gauge, permission: 'dashboard.executive' },
      { label: 'Outlet Performance', path: '/performance/outlets', icon: Store, permission: 'outlets.view' },
      { label: 'Outlet Comparison', path: '/performance/compare', icon: GitCompare, permission: 'outlets.compare' },
      { label: 'KPI Analytics', path: '/performance/kpi', icon: BarChart3, permission: 'analytics.view' },
      { label: 'Benchmarking', path: '/performance/benchmarking', icon: Scale, permission: 'analytics.view' },
      { label: 'Trend Analysis', path: '/performance/trends', icon: TrendingUp, permission: 'analytics.view' },
    ],
  },
  {
    title: 'Quality',
    items: [
      { label: 'Findings & Issues', path: '/quality/findings', icon: AlertTriangle, permission: 'findings.view' },
      { label: 'Corrective Actions', path: '/quality/corrective-actions', icon: Wrench, permission: 'actions.view' },
      { label: 'Alerts & Escalations', path: '/quality/alerts', icon: BellRing, permission: 'alerts.view' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { label: 'Visit Reports', path: '/reports/visits', icon: FileText, permission: 'reports.visit' },
      { label: 'Management Reports', path: '/reports/management', icon: FileBarChart, permission: 'reports.management' },
      { label: 'Report Builder', path: '/reports/builder', icon: FilePlus2, permission: 'reports.build' },
      { label: 'Exports', path: '/reports/exports', icon: Download, permission: 'reports.export' },
    ],
  },
  {
    title: 'Evidence',
    items: [{ label: 'Evidence Library', path: '/evidence', icon: Images, permission: 'evidence.view' }],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Outlets', path: '/admin/outlets', icon: Building2, permission: 'admin.outlets' },
      { label: 'Users', path: '/admin/users', icon: UserCog, permission: 'admin.users', anyOf: ['admin.stakeholders'] },
      { label: 'Roles & Permissions', path: '/admin/roles', icon: ShieldCheck, permission: 'admin.roles' },
      { label: 'Audit Templates', path: '/admin/templates', icon: ListChecks, permission: 'admin.templates' },
      { label: 'KPI Configuration', path: '/admin/kpi', icon: SlidersHorizontal, permission: 'admin.kpi' },
      { label: 'Notification Rules', path: '/admin/notifications', icon: BellDot, permission: 'admin.notifications' },
      { label: 'System Settings', path: '/admin/settings', icon: Settings, permission: 'admin.settings' },
      { label: 'Activity Logs', path: '/admin/activity', icon: History, permission: 'admin.logs' },
    ],
  },
]

/** Human-readable labels for breadcrumb segments */
export const ROUTE_LABELS: Record<string, string> = {
  '': 'Overview',
  operations: 'Operations',
  visits: 'Visits',
  calendar: 'Audit Calendar',
  assignments: 'Assignments',
  shoppers: 'Mystery Shoppers',
  performance: 'Performance',
  executive: 'Executive Dashboard',
  outlets: 'Outlets',
  compare: 'Outlet Comparison',
  kpi: 'KPI Analytics',
  benchmarking: 'Benchmarking',
  trends: 'Trend Analysis',
  quality: 'Quality',
  findings: 'Findings & Issues',
  'corrective-actions': 'Corrective Actions',
  alerts: 'Alerts & Escalations',
  reports: 'Reports',
  management: 'Management Reports',
  builder: 'Report Builder',
  exports: 'Exports',
  evidence: 'Evidence Library',
  admin: 'Administration',
  users: 'Users',
  roles: 'Roles & Permissions',
  templates: 'Audit Templates',
  notifications: 'Notification Rules',
  settings: 'System Settings',
  activity: 'Activity Logs',
  audit: 'Assessment',
  profile: 'My Profile',
  report: 'Visit Report',
}
