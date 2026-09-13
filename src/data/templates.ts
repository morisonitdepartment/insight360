import type { AuditTemplate, CategoryKey, JourneyType, Question, QuestionType, Section, Segment } from '@/types'

/**
 * Assessment template blueprints. Sections are defined once and instantiated per template so
 * every template owns its own section/question ids (editable independently in the builder).
 */

interface QuestionBlueprint {
  text: string
  type: QuestionType
  weight?: number
  critical?: boolean
  evidence?: boolean
  comment?: boolean
  na?: boolean
  guidance?: string
  options?: string[]
  threshold?: number
  /** Storyline tag used by the demo data generator */
  tag?: string
}

interface SectionBlueprint {
  code: string
  title: string
  category: CategoryKey
  description: string
  applicableTo: Segment[] | 'all'
  questions: QuestionBlueprint[]
}

const GREETING: SectionBlueprint = {
  code: 'A',
  title: 'Greeting & Customer Engagement',
  category: 'customer_experience',
  description: 'First impressions, acknowledgement and engagement quality.',
  applicableTo: 'all',
  questions: [
    { text: 'Was the guest acknowledged within 30 seconds of arrival?', type: 'yes_no', weight: 3, guidance: 'Start timing at the moment you cross the entrance threshold.', tag: 'greet_30s' },
    { text: 'Was eye contact established during the greeting?', type: 'yes_no', weight: 2 },
    { text: 'Did staff welcome the guest professionally and warmly?', type: 'rating_5', weight: 3, guidance: '1 = no greeting, 5 = warm, personalised welcome.' },
    { text: 'Did staff demonstrate confident product / service knowledge?', type: 'rating_5', weight: 3, comment: true },
    { text: 'Was staff communication polite, clear and confident?', type: 'rating_5', weight: 2 },
    { text: 'Was the guest thanked and invited to return at departure?', type: 'yes_no', weight: 2 },
  ],
}

const SPEED: SectionBlueprint = {
  code: 'B',
  title: 'Service Speed & Responsiveness',
  category: 'service_speed',
  description: 'Measured waiting and response times in minutes.',
  applicableTo: 'all',
  questions: [
    { text: 'Time to greeting (minutes)', type: 'time', weight: 2, threshold: 1, guidance: 'Enter actual measured minutes. Standard: within 1 minute.', tag: 'time_greet' },
    { text: 'Time to take order / process request (minutes)', type: 'time', weight: 3, threshold: 5, guidance: 'Standard: within 5 minutes of being seated / joining the queue.', tag: 'time_order' },
    { text: 'Time to receive item / service (minutes)', type: 'time', weight: 4, threshold: 15, guidance: 'Standard: within 15 minutes of order confirmation.', tag: 'time_receive' },
    { text: 'Queue waiting time before service (minutes)', type: 'time', weight: 3, threshold: 8, guidance: 'Standard: 8 minutes maximum queue time.', tag: 'time_queue' },
    { text: 'Was a specific request handled promptly and correctly?', type: 'rating_5', weight: 2, comment: true, guidance: 'Make one reasonable request (e.g. extra napkins, seating change).' },
    { text: 'Time to settle the bill / complete checkout (minutes)', type: 'time', weight: 2, threshold: 5, na: true },
  ],
}

const STAFF: SectionBlueprint = {
  code: 'C',
  title: 'Staff Attitude & Professionalism',
  category: 'customer_experience',
  description: 'Appearance, courtesy, ownership and problem solving.',
  applicableTo: 'all',
  questions: [
    { text: 'Overall staff appearance was neat and well-groomed', type: 'rating_5', weight: 2 },
    { text: 'Staff wore the complete, clean brand uniform', type: 'yes_no', weight: 2, evidence: false },
    { text: 'Staff wore a visible name badge', type: 'yes_no', weight: 1 },
    { text: 'Courtesy and respect shown throughout the interaction', type: 'rating_5', weight: 3 },
    { text: 'Quality of verbal communication (clarity, tone, language)', type: 'rating_5', weight: 2 },
    { text: 'Did staff take ownership of the guest experience?', type: 'rating_5', weight: 3, comment: true },
    { text: 'Problem-solving: how was a minor issue handled?', type: 'multiple_choice', weight: 3, options: ['Resolved immediately with empathy', 'Resolved after escalation', 'Partially resolved', 'Not resolved / ignored'], comment: true, guidance: 'Raise one minor issue (e.g. missing cutlery, wrong table) and observe the response.', tag: 'problem_solving' },
  ],
}

const COMPLIANCE: SectionBlueprint = {
  code: 'D',
  title: 'Operational Compliance',
  category: 'operational_compliance',
  description: 'SOP adherence, accuracy and process compliance.',
  applicableTo: 'all',
  questions: [
    { text: 'Standard operating procedure followed at every touchpoint', type: 'rating_5', weight: 3 },
    { text: 'Order / booking delivered exactly as requested (order accuracy)', type: 'pass_fail', weight: 4, critical: false, comment: true, tag: 'order_accuracy' },
    { text: 'Billing accuracy: receipt matched items and prices', type: 'pass_fail', weight: 4, evidence: true, guidance: 'Photograph the receipt. Any overcharge is a High finding.', tag: 'billing' },
    { text: 'Receipt / confirmation offered without prompting', type: 'yes_no', weight: 1 },
    { text: 'Payment options and process compliant (card, cash, digital wallet)', type: 'yes_no', weight: 2 },
    { text: 'Menu / price display accurate and up to date', type: 'yes_no', weight: 2, na: true },
  ],
}

const UPSELL: SectionBlueprint = {
  code: 'D2',
  title: 'Upselling & Sales Behaviour',
  category: 'upselling_sales',
  description: 'Suggestive selling, cross-selling and promotion awareness.',
  applicableTo: 'all',
  questions: [
    { text: 'Did staff attempt a relevant upsell (e.g. larger size, premium option)?', type: 'yes_no', weight: 3, tag: 'upsell' },
    { text: 'Did staff cross-sell a complementary item or add-on?', type: 'yes_no', weight: 3, tag: 'cross_sell' },
    { text: 'Were current promotions or loyalty programmes mentioned?', type: 'yes_no', weight: 2, tag: 'promotions' },
    { text: 'Quality of the sales approach (natural vs. pushy)', type: 'rating_5', weight: 2, na: true },
  ],
}

const PRODUCT_FNB: SectionBlueprint = {
  code: 'E',
  title: 'Product & Environment',
  category: 'product_environment',
  description: 'Food quality, presentation, cleanliness, ambience and facilities.',
  applicableTo: ['F&B'],
  questions: [
    { text: 'Food & beverage quality (taste, freshness)', type: 'rating_5', weight: 4, evidence: true },
    { text: 'Food served at the correct temperature', type: 'yes_no', weight: 3, tag: 'temperature' },
    { text: 'Presentation matched brand standard', type: 'rating_5', weight: 2, evidence: true },
    { text: 'Table / counter cleanliness on arrival', type: 'rating_5', weight: 3, evidence: true, tag: 'cleanliness' },
    { text: 'General floor, seating and surface hygiene', type: 'rating_5', weight: 3, tag: 'hygiene' },
    { text: 'Ambience appropriate to brand (noise, temperature, comfort)', type: 'rating_5', weight: 2 },
    { text: 'Lighting level appropriate and all fixtures working', type: 'yes_no', weight: 1 },
    { text: 'Music / audio at an appropriate level', type: 'yes_no', weight: 1, na: true },
    { text: 'Facility condition (furniture, fixtures, signage)', type: 'rating_5', weight: 2 },
    { text: 'Washroom cleanliness and supplies', type: 'rating_5', weight: 3, evidence: true, comment: true, tag: 'washroom' },
  ],
}

const PRODUCT_ENT: SectionBlueprint = {
  code: 'E',
  title: 'Product & Environment',
  category: 'product_environment',
  description: 'Attraction quality, cleanliness, ambience and facility condition.',
  applicableTo: ['Entertainment'],
  questions: [
    { text: 'Quality of the core experience / attraction', type: 'rating_5', weight: 4 },
    { text: 'Value for money relative to price paid', type: 'rating_5', weight: 2 },
    { text: 'Cleanliness of activity areas', type: 'rating_5', weight: 3, evidence: true, tag: 'cleanliness' },
    { text: 'General hygiene (surfaces, shared equipment, seating)', type: 'rating_5', weight: 3, tag: 'hygiene' },
    { text: 'Ambience (lighting, sound, theming) matched brand standard', type: 'rating_5', weight: 2 },
    { text: 'Facility condition (furniture, fixtures, signage)', type: 'rating_5', weight: 2 },
    { text: 'F&B kiosk / concession quality (if used)', type: 'rating_5', weight: 1, na: true },
    { text: 'Washroom cleanliness and supplies', type: 'rating_5', weight: 3, evidence: true, comment: true, tag: 'washroom' },
  ],
}

const FOOD_SAFETY: SectionBlueprint = {
  code: 'F',
  title: 'Food Safety & Hygiene Compliance',
  category: 'safety_entertainment',
  description: 'Critical food-safety observations. Failures generate critical findings.',
  applicableTo: ['F&B'],
  questions: [
    { text: 'No visible food-safety hazard observed (cross-contamination, uncovered food, pests)', type: 'pass_fail', weight: 4, critical: true, evidence: true, comment: true, guidance: 'CRITICAL. Any observed hazard must be photographed and described.', tag: 'food_safety' },
    { text: 'Staff observed following hand-hygiene / glove practice', type: 'yes_no', weight: 3, na: true, tag: 'hand_hygiene' },
    { text: 'Allergen information available on request', type: 'yes_no', weight: 2 },
    { text: 'Emergency exits visible and unobstructed', type: 'pass_fail', weight: 2, critical: true, evidence: true },
  ],
}

const ENTERTAINMENT: SectionBlueprint = {
  code: 'F',
  title: 'Entertainment Operations & Safety',
  category: 'safety_entertainment',
  description: 'Ticketing, reception, onboarding, safety briefing and crowd management.',
  applicableTo: ['Entertainment'],
  questions: [
    { text: 'Ticketing process was efficient and accurate', type: 'rating_5', weight: 2 },
    { text: 'Reception staff explained the experience and rules clearly', type: 'rating_5', weight: 2 },
    { text: 'Guest onboarding / registration completed correctly', type: 'yes_no', weight: 2 },
    { text: 'Safety briefing delivered before the activity', type: 'pass_fail', weight: 4, critical: true, evidence: true, comment: true, guidance: 'CRITICAL. A missing or incomplete safety briefing is a critical finding.', tag: 'safety_briefing' },
    { text: 'Staff complied with safety procedures throughout', type: 'pass_fail', weight: 4, critical: true, comment: true, tag: 'staff_safety' },
    { text: 'Queue management was orderly and communicated', type: 'rating_5', weight: 2 },
    { text: 'Crowd / capacity management appeared controlled', type: 'rating_5', weight: 2 },
    { text: 'Equipment condition (visible wear, damage, maintenance)', type: 'rating_5', weight: 3, evidence: true, tag: 'equipment' },
    { text: 'Safety signage present, legible and correctly placed', type: 'yes_no', weight: 2, evidence: true },
    { text: 'Staff could explain emergency / evacuation procedure when asked', type: 'yes_no', weight: 3, comment: true },
  ],
}

const DIGITAL: SectionBlueprint = {
  code: 'G',
  title: 'Digital Experience',
  category: 'customer_experience',
  description: 'Website, mobile, social media, digital booking, ordering and payment.',
  applicableTo: 'all',
  questions: [
    { text: 'Website information accurate (hours, menu / activities, location)', type: 'rating_5', weight: 2, evidence: true },
    { text: 'Mobile experience usable and fast', type: 'rating_5', weight: 2 },
    { text: 'Social-media enquiry answered within 2 hours', type: 'yes_no', weight: 3, guidance: 'Send a DM asking about availability or allergens; record response time.', tag: 'social_response' },
    { text: 'Social-media response was helpful and on-brand', type: 'rating_5', weight: 2, na: true },
    { text: 'Digital booking / reservation completed successfully', type: 'pass_fail', weight: 3, na: true, evidence: true },
    { text: 'Online ordering flow worked end-to-end', type: 'pass_fail', weight: 3, na: true, evidence: true },
    { text: 'Digital payment accepted without issues', type: 'yes_no', weight: 2 },
    { text: 'Digital confirmation received (email / SMS / app)', type: 'yes_no', weight: 1 },
  ],
}

const SOCIAL: SectionBlueprint = {
  code: 'S',
  title: 'Social Media Interaction',
  category: 'customer_experience',
  description: 'Enquiry, complaint handling and brand tone across the outlet’s social channels.',
  applicableTo: 'all',
  questions: [
    { text: 'Social-media enquiry answered within 2 hours', type: 'yes_no', weight: 4, evidence: true, guidance: 'Send a direct message asking about availability, hours or allergens. Screenshot the timestamps.', tag: 'social_response' },
    { text: 'Time to first social-media response (minutes)', type: 'time', weight: 3, threshold: 120, guidance: 'Standard: first substantive reply within 120 minutes.', tag: 'social_time' },
    { text: 'Response was helpful, accurate and on-brand', type: 'rating_5', weight: 3, comment: true, tag: 'social_quality' },
    { text: 'Complaint raised on social media was acknowledged publicly', type: 'yes_no', weight: 3, evidence: true, tag: 'social_complaint' },
    { text: 'Complaint moved to a private channel and given a named owner', type: 'yes_no', weight: 3, na: true },
    { text: 'A remedy or next step was offered rather than a generic reply', type: 'rating_5', weight: 3, comment: true },
    { text: 'Profile information current (hours, location, contact, menu link)', type: 'rating_5', weight: 2, evidence: true },
    { text: 'Recent reviews and comments receive replies', type: 'rating_5', weight: 2, na: true },
    { text: 'Booking or ordering request via social channel handled correctly', type: 'pass_fail', weight: 3, na: true, evidence: true },
    { text: 'Tone consistent with brand guidelines throughout', type: 'rating_5', weight: 2 },
  ],
}

const DELIVERY: SectionBlueprint = {
  code: 'H',
  title: 'Delivery & Packaging',
  category: 'product_environment',
  description: 'Delivery handover, packaging integrity and temperature.',
  applicableTo: ['F&B'],
  questions: [
    { text: 'Delivery arrived within the promised time window', type: 'yes_no', weight: 4, tag: 'delivery_time' },
    { text: 'Rider / courier was courteous and presentable', type: 'rating_5', weight: 2 },
    { text: 'Packaging sealed, intact and branded', type: 'rating_5', weight: 3, evidence: true },
    { text: 'Food temperature acceptable on arrival', type: 'yes_no', weight: 3, tag: 'temperature' },
    { text: 'Order complete with cutlery / condiments as requested', type: 'pass_fail', weight: 3 },
  ],
}

interface TemplateBlueprint {
  id: string
  code: string
  name: string
  description: string
  segment: Segment | 'Both'
  journey: JourneyType
  isFollowUp: boolean
  sections: SectionBlueprint[]
}

const TEMPLATE_BLUEPRINTS: TemplateBlueprint[] = [
  {
    id: 'tpl-fb-dine',
    code: 'FB-DINE',
    name: 'F&B Dine-In Assessment',
    description: 'Full in-store dine-in customer journey for restaurants, cafés and food courts.',
    segment: 'F&B',
    journey: 'In-store / Dine-in',
    isFollowUp: false,
    sections: [GREETING, SPEED, STAFF, COMPLIANCE, UPSELL, PRODUCT_FNB, FOOD_SAFETY],
  },
  {
    id: 'tpl-fb-take',
    code: 'FB-TAKE',
    name: 'F&B Takeaway Assessment',
    description: 'Counter / takeaway journey with emphasis on speed, accuracy and packaging.',
    segment: 'F&B',
    journey: 'Takeaway',
    isFollowUp: false,
    sections: [GREETING, SPEED, STAFF, COMPLIANCE, UPSELL, PRODUCT_FNB, FOOD_SAFETY],
  },
  {
    id: 'tpl-fb-del',
    code: 'FB-DEL',
    name: 'F&B Delivery Assessment',
    description: 'Online ordering, delivery handover, packaging and product integrity.',
    segment: 'F&B',
    journey: 'Delivery',
    isFollowUp: false,
    sections: [DIGITAL, SPEED, COMPLIANCE, UPSELL, DELIVERY, FOOD_SAFETY],
  },
  {
    id: 'tpl-ent',
    code: 'ENT-MAIN',
    name: 'Entertainment Experience Assessment',
    description: 'Ticketing, reception, onboarding, safety briefing, activity and facility assessment.',
    segment: 'Entertainment',
    journey: 'Entertainment Ticketing',
    isFollowUp: false,
    sections: [GREETING, SPEED, STAFF, COMPLIANCE, UPSELL, PRODUCT_ENT, ENTERTAINMENT],
  },
  {
    id: 'tpl-digital',
    code: 'DIGITAL',
    name: 'Digital Experience Assessment',
    description: 'Website, mobile, social-media responsiveness, digital booking and payment.',
    segment: 'Both',
    journey: 'Digital Interaction',
    isFollowUp: false,
    sections: [DIGITAL, UPSELL],
  },
  {
    id: 'tpl-social',
    code: 'SOCIAL',
    name: 'Social Media Interaction Assessment',
    description: 'Remote assessment of enquiry response time, complaint handling, brand tone and profile accuracy across social channels.',
    segment: 'Both',
    journey: 'Social Media Interaction',
    isFollowUp: false,
    sections: [SOCIAL, COMPLIANCE],
  },
  {
    id: 'tpl-followup',
    code: 'FOLLOW-UP',
    name: 'Follow-Up Audit',
    description: 'Verification visit re-assessing prior findings and core standards across all categories.',
    segment: 'Both',
    journey: 'In-store / Dine-in',
    isFollowUp: true,
    sections: [GREETING, SPEED, STAFF, COMPLIANCE, UPSELL, PRODUCT_FNB, PRODUCT_ENT, FOOD_SAFETY, ENTERTAINMENT],
  },
]

export interface TemplateBundle {
  templates: AuditTemplate[]
  sections: Section[]
  questions: Question[]
  /** questionId → storyline tag */
  tags: Map<string, string>
}

export function buildTemplates(): TemplateBundle {
  const templates: AuditTemplate[] = []
  const sections: Section[] = []
  const questions: Question[] = []
  const tags = new Map<string, string>()

  for (const t of TEMPLATE_BLUEPRINTS) {
    const sectionIds: string[] = []
    let qCount = 0
    t.sections.forEach((s, si) => {
      const suffix = s.applicableTo === 'all' ? s.code : `${s.code}${s.applicableTo[0] === 'F&B' ? 'F' : 'E'}`
      const sid = `${t.id}-${suffix}`
      sectionIds.push(sid)
      sections.push({
        id: sid,
        templateId: t.id,
        code: s.code,
        title: s.title,
        category: s.category,
        description: s.description,
        order: si + 1,
        applicableTo: s.applicableTo,
      })
      s.questions.forEach((q, qi) => {
        const qid = `${sid}-${String(qi + 1).padStart(2, '0')}`
        qCount++
        questions.push({
          id: qid,
          sectionId: sid,
          code: `${s.code}.${qi + 1}`,
          text: q.text,
          type: q.type,
          weight: q.weight ?? 1,
          critical: q.critical ?? false,
          evidenceRequired: q.evidence ?? false,
          commentRequired: q.comment ?? false,
          allowNA: q.na ?? false,
          guidance: q.guidance ?? '',
          options: q.options,
          threshold: q.threshold,
          order: qi + 1,
        })
        if (q.tag) tags.set(qid, q.tag)
      })
    })
    templates.push({
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description,
      segment: t.segment,
      journey: t.journey,
      version: t.isFollowUp ? '2.1' : '3.0',
      status: 'Active',
      sectionIds,
      questionCount: qCount,
      createdAt: '2025-09-01T09:00:00',
      updatedAt: '2026-03-14T14:20:00',
      isFollowUp: t.isFollowUp,
    })
  }
  return { templates, sections, questions, tags }
}
