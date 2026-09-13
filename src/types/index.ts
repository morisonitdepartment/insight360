// ─────────────────────────────────────────────────────────────────────────────
// INSIGHT360 — Domain model
// All enumerations are string-literal unions (no TS enums — erasableSyntaxOnly).
// ─────────────────────────────────────────────────────────────────────────────

export type Role =
  | 'super_admin'
  | 'client_admin'
  | 'ops_manager'
  | 'shopper'
  | 'analyst'
  | 'executive'

export type UserStatus = 'active' | 'inactive' | 'invited'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  status: UserStatus
  title: string
  /** Authorised outlet ids. Empty array = all outlets (subject to role). */
  outletIds: string[]
  brandIds: string[]
  lastLogin: string | null
  mfaEnabled: boolean
  createdAt: string
  /** Linked shopper profile for role = shopper */
  shopperId?: string
}

export type Segment = 'F&B' | 'Entertainment'

export type FnbSubcategory = 'Fine Dining' | 'Casual Dining' | 'Café' | 'Fast Casual' | 'Food Court'
export type EntSubcategory =
  | 'Indoor Entertainment'
  | 'Family Entertainment'
  | 'Attraction'
  | 'Cinema'
  | 'Recreation'
export type Subcategory = FnbSubcategory | EntSubcategory

export type RiskRating = 'Excellent' | 'Good' | 'Needs Improvement' | 'Critical'

export type OutletStatus = 'Active' | 'Under Renovation' | 'Seasonal'

export interface Brand {
  id: string
  name: string
  segment: Segment
  outletCount: number
}

/** KPI categories that drive weighted scoring */
export type CategoryKey =
  | 'customer_experience'
  | 'service_speed'
  | 'operational_compliance'
  | 'product_environment'
  | 'upselling_sales'
  | 'safety_entertainment'

export type CategoryScores = Record<CategoryKey, number>

export interface Outlet {
  id: string
  code: string
  name: string
  brandId: string
  brand: string
  segment: Segment
  subcategory: Subcategory
  location: string
  region: string
  manager: string
  status: OutletStatus
  openingHours: string
  targetScore: number
  annualVisits: number
  /** Map-style coordinates for the location card (synthetic, relative 0-100 grid) */
  mapX: number
  mapY: number
  // ── Derived (computed by the data layer from visits / findings) ──
  mainAuditsCompleted: number
  followUpsCompleted: number
  lastAudit: string | null
  nextAudit: string | null
  overallScore: number | null
  previousScore: number | null
  riskRating: RiskRating | 'Not Assessed'
  openIssues: number
  criticalFindings: number
  categoryScores: CategoryScores | null
  rank: number | null
}

export type ShopperProfileType = 'Individual' | 'Family' | 'Tourist' | 'Young Adult' | 'Professional' | 'Parent'
export type TrainingStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Expired'
export type CertificationStatus = 'Certified' | 'Pending' | 'Expired'
export type ShopperStatus = 'Active' | 'On Leave' | 'Inactive'

export interface TrainingModule {
  id: string
  name: string
  validityMonths: number
}

export interface ShopperTrainingRecord {
  moduleId: string
  status: TrainingStatus
  completedAt: string | null
  expiresAt: string | null
  score: number | null
}

export interface Shopper {
  id: string
  code: string
  name: string
  gender: 'Female' | 'Male'
  ageRange: '18-24' | '25-34' | '35-44' | '45-54' | '55+'
  nationality: string
  profileType: ShopperProfileType
  languages: string[]
  experienceYears: number
  assignedCategories: Segment[]
  availability: 'Available' | 'Limited' | 'Unavailable'
  trainingStatus: TrainingStatus
  certificationStatus: CertificationStatus
  completedVisits: number
  avgReportQuality: number
  onTimeSubmissionPct: number
  status: ShopperStatus
  training: ShopperTrainingRecord[]
  email: string
  phone: string
}

export type VisitType = 'Main Audit 1' | 'Follow-up 1' | 'Main Audit 2' | 'Follow-up 2'

export type VisitStatus =
  | 'Planned'
  | 'Assigned'
  | 'In Progress'
  | 'Draft'
  | 'Submitted'
  | 'Under Review'
  | 'Approved'
  | 'Rejected'
  | 'Closed'

export type JourneyType =
  | 'In-store / Dine-in'
  | 'Social Media Interaction'
  | 'Takeaway'
  | 'Delivery'
  | 'Entertainment Ticketing'
  | 'Reception'
  | 'Guest Onboarding'
  | 'Safety Briefing'
  | 'Digital Interaction'

export type ReportStatus = 'Not Started' | 'Draft' | 'Pending Review' | 'Approved' | 'Rejected' | 'Published'
export type SlaStatus = 'Within SLA' | 'At Risk' | 'Breached' | 'Pending'

export interface ApprovalEvent {
  at: string
  by: string
  action: 'Submitted' | 'Review Started' | 'Approved' | 'Rejected' | 'Reopened' | 'Closed'
  comment?: string
}

export interface Visit {
  id: string
  code: string
  outletId: string
  type: VisitType
  journey: JourneyType
  templateId: string
  shopperId: string | null
  scheduledDate: string
  visitDate: string | null
  visitStart: string | null
  visitEnd: string | null
  submissionDeadline: string | null
  submittedAt: string | null
  status: VisitStatus
  score: number | null
  categoryScores: CategoryScores | null
  risk: RiskRating | null
  reportStatus: ReportStatus
  slaStatus: SlaStatus
  reviewerId: string | null
  reviewedAt: string | null
  reviewerComment: string | null
  approvalHistory: ApprovalEvent[]
  narrative: string | null
  criticalCount: number
  spend: number | null
  partySize: number
  /** Percentage of mandatory questions answered (draft progress) */
  progress: number
}

export type QuestionType =
  | 'yes_no'
  | 'rating_5'
  | 'rating_10'
  | 'pass_fail'
  | 'multiple_choice'
  | 'text'
  | 'numeric'
  | 'time'
  | 'photo'
  | 'video'

export interface Question {
  id: string
  sectionId: string
  code: string
  text: string
  type: QuestionType
  weight: number
  critical: boolean
  evidenceRequired: boolean
  commentRequired: boolean
  allowNA: boolean
  guidance: string
  options?: string[]
  /** For time/numeric: threshold above which the question fails (minutes) */
  threshold?: number
  order: number
}

export interface Section {
  id: string
  templateId: string
  code: string
  title: string
  category: CategoryKey
  description: string
  order: number
  applicableTo: Segment[] | 'all'
}

export type TemplateStatus = 'Active' | 'Inactive' | 'Draft'

export interface AuditTemplate {
  id: string
  name: string
  code: string
  description: string
  segment: Segment | 'Both'
  journey: JourneyType
  version: string
  status: TemplateStatus
  sectionIds: string[]
  questionCount: number
  createdAt: string
  updatedAt: string
  isFollowUp: boolean
}

export type AnswerValue = string | number | boolean | null

export interface VisitAnswer {
  id: string
  visitId: string
  questionId: string
  value: AnswerValue
  na: boolean
  comment: string
  evidenceIds: string[]
  /** Computed score 0..1 for the question (null if NA / unanswered) */
  score: number | null
}

export type EvidenceType = 'Photo' | 'Video' | 'Receipt' | 'Screenshot' | 'Document'

export interface Evidence {
  id: string
  visitId: string
  outletId: string
  category: CategoryKey
  questionId: string | null
  type: EvidenceType
  title: string
  description: string
  capturedAt: string
  uploadedAt: string
  uploadedBy: string
  /** Placeholder visual seed (rendered as internal SVG) */
  visualSeed: number
  fileName: string
  sizeKb: number
}

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low'
export type FindingStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed' | 'Verified'

export interface Finding {
  id: string
  code: string
  visitId: string
  outletId: string
  questionId: string | null
  category: CategoryKey
  title: string
  description: string
  severity: Severity
  status: FindingStatus
  createdAt: string
  repeated: boolean
  correctiveActionId: string | null
  alertId: string | null
}

export type AlertStatus = 'New' | 'Acknowledged' | 'Investigating' | 'Action Required' | 'Resolved' | 'Closed'

export interface Alert {
  id: string
  code: string
  severity: Severity
  type: string
  outletId: string
  visitId: string | null
  findingId: string | null
  title: string
  description: string
  createdAt: string
  escalationDue: string
  ownerId: string | null
  status: AlertStatus
  acknowledgedAt: string | null
  resolvedAt: string | null
  history: { at: string; by: string; action: string; note?: string }[]
}

export type CapaStatus =
  | 'Open'
  | 'Assigned'
  | 'In Progress'
  | 'Awaiting Evidence'
  | 'Awaiting Verification'
  | 'Closed'
  | 'Overdue'

export type Priority = 'Critical' | 'High' | 'Medium' | 'Low'

export interface CorrectiveAction {
  id: string
  code: string
  findingId: string
  outletId: string
  category: CategoryKey
  title: string
  description: string
  rootCause: string
  immediateAction: string
  correctiveAction: string
  preventiveAction: string
  ownerId: string | null
  ownerName: string
  priority: Priority
  createdAt: string
  targetDate: string
  evidenceIds: string[]
  status: CapaStatus
  reviewerId: string | null
  closureDate: string | null
  verificationNote: string | null
  history: { at: string; by: string; action: string; note?: string }[]
}

export interface Comment {
  id: string
  entityType: 'visit' | 'finding' | 'corrective_action' | 'alert'
  entityId: string
  userId: string
  userName: string
  text: string
  createdAt: string
}

export type NotificationType =
  | 'critical_issue'
  | 'visit_due'
  | 'report_submitted'
  | 'report_overdue'
  | 'action_overdue'
  | 'approval_required'
  | 'assignment'
  | 'escalation'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  createdAt: string
  read: boolean
  link: string
  severity: Severity | 'Info'
  /** Roles who should see this notification */
  audience: Role[]
}

export interface ActivityLog {
  id: string
  timestamp: string
  userId: string
  userName: string
  action: string
  module: string
  recordId: string
  ip: string
  result: 'Success' | 'Failed' | 'Denied'
  details?: string
}

export interface KpiConfig {
  key: CategoryKey
  name: string
  description: string
  weight: number
  target: number
  criticalThreshold: number
  dataSource: string
  applicableTo: Segment[] | 'all'
}

export interface ScoreThreshold {
  label: RiskRating
  min: number
  max: number
  description: string
}

export type ReportType =
  | 'Executive Summary'
  | 'Main Audit Report'
  | 'Follow-up Report'
  | 'Quarterly Performance'
  | 'Outlet Performance'
  | 'Risk & Compliance'
  | 'Corrective Action'
  | 'Trend Analysis'

export interface ManagementReport {
  id: string
  code: string
  title: string
  type: ReportType
  period: string
  generatedAt: string
  generatedBy: string
  status: 'Draft' | 'Final' | 'Published'
  scope: string
  outletIds: string[]
  summary: string
  pages: number
}

export interface NotificationRule {
  id: string
  name: string
  trigger: string
  channel: ('In-app' | 'Email' | 'SMS')[]
  recipients: Role[]
  severity: Severity | 'Info'
  enabled: boolean
  escalationHours: number | null
}

export interface OrganizationSettings {
  name: string
  engagementName: string
  engagementStart: string
  engagementEnd: string
  reportingSlaHours: number
  escalationSlaHours: number
  timezone: string
  currency: string
  locale: string
}

/** The complete dataset served by a repository (demo or live). */
export interface Dataset {
  organization: OrganizationSettings
  brands: Brand[]
  outlets: Outlet[]
  users: User[]
  shoppers: Shopper[]
  trainingModules: TrainingModule[]
  templates: AuditTemplate[]
  sections: Section[]
  questions: Question[]
  visits: Visit[]
  answers: VisitAnswer[]
  evidence: Evidence[]
  findings: Finding[]
  alerts: Alert[]
  correctiveActions: CorrectiveAction[]
  comments: Comment[]
  notifications: Notification[]
  activityLogs: ActivityLog[]
  kpiConfig: KpiConfig[]
  thresholds: ScoreThreshold[]
  reports: ManagementReport[]
  notificationRules: NotificationRule[]
}

export type CollectionKey = keyof Omit<Dataset, 'organization' | 'thresholds'>
