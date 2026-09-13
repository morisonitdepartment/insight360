import type { Role } from '@/types'

/**
 * Permission keys. Each navigation item, route and action maps to one of these.
 * The matrix below is the single source of truth for demo mode; in live mode the
 * same matrix is mirrored by Supabase RLS policies (see supabase/migrations).
 */
export const PERMISSIONS = {
  // Overview & performance
  'dashboard.executive': 'View executive dashboard',
  'dashboard.overview': 'View overview',
  'analytics.view': 'View KPI analytics, benchmarking and trends',
  'outlets.view': 'View outlet performance',
  'outlets.compare': 'Compare outlets',
  // Operations
  'visits.view': 'View visits',
  'visits.create': 'Create visits',
  'visits.assign': 'Assign / reassign shoppers',
  'visits.review': 'Review, approve or reject visits',
  'visits.conduct': 'Conduct assessment (questionnaire)',
  'calendar.view': 'View audit calendar',
  'shoppers.view': 'View mystery shoppers',
  'shoppers.manage': 'Manage mystery shoppers & training',
  // Quality
  'findings.view': 'View findings & issues',
  'findings.comment': 'Comment on findings',
  'actions.view': 'View corrective actions',
  'actions.manage': 'Create / update corrective actions',
  'alerts.view': 'View alerts & escalations',
  'alerts.manage': 'Acknowledge / resolve alerts',
  'alerts.configure': 'Configure alert rules',
  // Reports & evidence
  'reports.visit': 'View visit reports',
  'reports.management': 'View management reports',
  'reports.build': 'Use report builder',
  'reports.export': 'Export data',
  'evidence.view': 'View evidence library',
  'evidence.upload': 'Upload evidence',
  // Administration
  'admin.outlets': 'Manage outlets',
  'admin.users': 'Manage users',
  'admin.stakeholders': 'Manage client stakeholder accounts',
  'admin.roles': 'View roles & permissions',
  'admin.roles.edit': 'Edit role permissions',
  'admin.templates': 'Manage audit templates',
  'admin.kpi': 'Configure KPIs & scoring',
  'admin.notifications': 'Configure notification rules',
  'admin.settings': 'System settings',
  'admin.logs': 'Inspect activity logs',
} as const

export type Permission = keyof typeof PERMISSIONS

const ALL = Object.keys(PERMISSIONS) as Permission[]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: ALL,
  client_admin: [
    'dashboard.executive',
    'dashboard.overview',
    'analytics.view',
    'outlets.view',
    'outlets.compare',
    'visits.view',
    'visits.review',
    'calendar.view',
    'shoppers.view',
    'findings.view',
    'findings.comment',
    'actions.view',
    'actions.manage',
    'alerts.view',
    'alerts.manage',
    'reports.visit',
    'reports.management',
    'reports.build',
    'reports.export',
    'evidence.view',
    'admin.outlets',
    'admin.stakeholders',
    'admin.roles',
    'admin.logs',
  ],
  ops_manager: [
    'dashboard.overview',
    'dashboard.executive',
    'analytics.view',
    'outlets.view',
    'outlets.compare',
    'visits.view',
    'calendar.view',
    'findings.view',
    'findings.comment',
    'actions.view',
    'actions.manage',
    'alerts.view',
    'alerts.manage',
    'reports.visit',
    'reports.management',
    'reports.export',
    'evidence.view',
  ],
  shopper: ['dashboard.overview', 'visits.view', 'visits.conduct', 'calendar.view', 'evidence.upload', 'evidence.view'],
  analyst: [
    'dashboard.overview',
    'dashboard.executive',
    'analytics.view',
    'outlets.view',
    'outlets.compare',
    'visits.view',
    'calendar.view',
    'shoppers.view',
    'findings.view',
    'actions.view',
    'alerts.view',
    'reports.visit',
    'reports.management',
    'reports.build',
    'reports.export',
    'evidence.view',
  ],
  executive: [
    'dashboard.overview',
    'dashboard.executive',
    'analytics.view',
    'outlets.view',
    'outlets.compare',
    'findings.view',
    'actions.view',
    'alerts.view',
    'reports.visit',
    'reports.management',
  ],
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  client_admin: 'Client Admin',
  ops_manager: 'Operations Manager',
  shopper: 'Mystery Shopper',
  analyst: 'Analyst',
  executive: 'Executive',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin: 'Full platform administration: users, templates, scoring, alerts, approvals and system settings.',
  client_admin: 'Client-side administrator with full visibility across authorised outlets and stakeholder management.',
  ops_manager: 'Regional / operations manager restricted to assigned outlets; manages corrective actions.',
  shopper: 'Auditor conducting assigned mystery-shopping visits and submitting evidence-based assessments.',
  analyst: 'Analytics and reporting specialist with read access to all performance data and exports.',
  executive: 'Read-only executive visibility: dashboard, rankings, risks, trends, alerts and reports.',
}

export function hasPermission(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role].includes(permission)
}

export function hasAnyPermission(role: Role | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p))
}

/** Roles that are read-only across the platform (no mutations at all). */
export const READ_ONLY_ROLES: Role[] = ['executive', 'analyst']
