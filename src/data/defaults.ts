import type { KpiConfig, NotificationRule, OrganizationSettings, TrainingModule } from '@/types'
import { CLIENT_BRAND } from '@/config/client'

export const DEFAULT_ORGANIZATION: OrganizationSettings = {
  name: CLIENT_BRAND.name,
  engagementName: 'Mystery Shopping Programme 2025/26',
  engagementStart: '2025-10-01',
  engagementEnd: '2026-11-30',
  reportingSlaHours: 48,
  reportingTargetHours: 24,
  escalationSlaHours: 24,
  timezone: 'Asia/Qatar (GMT+3)',
  currency: 'QAR',
  locale: 'en-QA',
}

export const DEFAULT_KPI_CONFIG: KpiConfig[] = [
  {
    key: 'customer_experience',
    name: 'Customer Experience',
    description: 'Greeting, engagement, staff attitude, professionalism and digital touchpoints.',
    weight: 25,
    target: 90,
    criticalThreshold: 70,
    dataSource: 'Sections A, C, G',
    applicableTo: 'all',
  },
  {
    key: 'service_speed',
    name: 'Service Speed',
    description: 'Measured greeting, ordering, delivery and queue times against service standards.',
    weight: 15,
    target: 88,
    criticalThreshold: 65,
    dataSource: 'Section B (time measurements)',
    applicableTo: 'all',
  },
  {
    key: 'operational_compliance',
    name: 'Operational Compliance',
    description: 'SOP adherence, order and billing accuracy, payment and process compliance.',
    weight: 20,
    target: 92,
    criticalThreshold: 75,
    dataSource: 'Section D',
    applicableTo: 'all',
  },
  {
    key: 'product_environment',
    name: 'Product & Environment',
    description: 'Product quality, presentation, cleanliness, hygiene, ambience and facility condition.',
    weight: 20,
    target: 90,
    criticalThreshold: 70,
    dataSource: 'Sections E, H',
    applicableTo: 'all',
  },
  {
    key: 'upselling_sales',
    name: 'Upselling & Sales',
    description: 'Suggestive selling, cross-selling and promotion awareness.',
    weight: 10,
    target: 80,
    criticalThreshold: 50,
    dataSource: 'Section D2',
    applicableTo: 'all',
  },
  {
    key: 'safety_entertainment',
    name: 'Safety & Entertainment Compliance',
    description: 'Food-safety compliance (F&B) and ticketing, onboarding, safety briefing and equipment (Entertainment).',
    weight: 10,
    target: 95,
    criticalThreshold: 80,
    dataSource: 'Section F',
    applicableTo: 'all',
  },
]

export const TRAINING_MODULES: TrainingModule[] = [
  { id: 'trn-01', name: 'Mystery Shopping Ethics', validityMonths: 12 },
  { id: 'trn-02', name: 'Scenario Briefing', validityMonths: 6 },
  { id: 'trn-03', name: 'Evidence Collection', validityMonths: 12 },
  { id: 'trn-04', name: 'F&B Assessment', validityMonths: 12 },
  { id: 'trn-05', name: 'Entertainment Safety Assessment', validityMonths: 12 },
  { id: 'trn-06', name: 'Report Writing', validityMonths: 12 },
  { id: 'trn-07', name: 'Confidentiality', validityMonths: 12 },
]

export const DEFAULT_NOTIFICATION_RULES: NotificationRule[] = [
  { id: 'nr-01', name: 'Critical safety breach', trigger: 'Critical question failed (safety)', channel: ['In-app', 'Email', 'SMS'], recipients: ['super_admin', 'client_admin', 'ops_manager', 'executive'], severity: 'Critical', enabled: true, escalationHours: 12 },
  { id: 'nr-02', name: 'Food hygiene failure', trigger: 'Critical question failed (food safety)', channel: ['In-app', 'Email', 'SMS'], recipients: ['super_admin', 'client_admin', 'ops_manager'], severity: 'Critical', enabled: true, escalationHours: 12 },
  { id: 'nr-03', name: 'Severe customer complaint', trigger: 'Problem-solving answered "Not resolved / ignored"', channel: ['In-app', 'Email'], recipients: ['client_admin', 'ops_manager'], severity: 'High', enabled: true, escalationHours: 24 },
  { id: 'nr-04', name: 'Incorrect billing', trigger: 'Billing accuracy failed', channel: ['In-app', 'Email'], recipients: ['client_admin', 'ops_manager'], severity: 'High', enabled: true, escalationHours: 24 },
  { id: 'nr-05', name: 'Queue time threshold exceeded', trigger: 'Queue waiting time > 2x standard', channel: ['In-app'], recipients: ['ops_manager'], severity: 'Medium', enabled: true, escalationHours: 48 },
  { id: 'nr-06', name: 'Outlet score below 70%', trigger: 'Approved visit score < 70', channel: ['In-app', 'Email'], recipients: ['super_admin', 'client_admin', 'ops_manager', 'executive'], severity: 'High', enabled: true, escalationHours: 24 },
  { id: 'nr-07', name: 'Repeated finding', trigger: 'Same finding in two consecutive assessments', channel: ['In-app', 'Email'], recipients: ['client_admin', 'ops_manager'], severity: 'High', enabled: true, escalationHours: 48 },
  { id: 'nr-08', name: 'Report SLA breach', trigger: 'Report submitted > 48h after visit', channel: ['In-app'], recipients: ['super_admin'], severity: 'Medium', enabled: true, escalationHours: null },
  { id: 'nr-09', name: 'Approval required', trigger: 'Report submitted for review', channel: ['In-app', 'Email'], recipients: ['super_admin', 'client_admin'], severity: 'Info', enabled: true, escalationHours: null },
  { id: 'nr-10', name: 'Corrective action overdue', trigger: 'Target date passed without closure', channel: ['In-app', 'Email'], recipients: ['client_admin', 'ops_manager'], severity: 'High', enabled: true, escalationHours: null },
  { id: 'nr-11', name: 'Shopper assignment', trigger: 'Visit assigned to shopper', channel: ['In-app', 'Email'], recipients: ['shopper'], severity: 'Info', enabled: true, escalationHours: null },
  { id: 'nr-12', name: 'Visit due reminder', trigger: '24h before scheduled visit', channel: ['In-app', 'SMS'], recipients: ['shopper'], severity: 'Info', enabled: false, escalationHours: null },
]
