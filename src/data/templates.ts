import type { AuditTemplate, Question, Section, Segment, ServiceSequence } from '@/types'
import { CLIENT } from '@/config/client'
import { CRITICAL_FAILURES_DINING, PROBLEM_SOLVING_OPTIONS, type SectionBlueprint, type TemplateBlueprint, isConditionalStage, stage } from './templateKit'
import { BENNIGANS_TEMPLATE } from './bennigans'
import { PIZZAHUT_TEMPLATE } from './pizzahut'
import { SHEBESTAN_TEMPLATE } from './shebestan'

/**
 * Assessment template blueprints. Sections are defined once and instantiated per template so
 * every template owns its own section/question ids (editable independently in the builder).
 */

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
    // commentOnFail, not comment: an obstructed exit is a critical finding and has
    // to be described, but a clear one needs no words. (`comment` would also skip an
    // rng.bool draw in the seed generator and shift every score after it.)
    { text: 'Emergency exits visible and unobstructed', type: 'pass_fail', weight: 2, critical: true, evidence: true, commentOnFail: true },
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


// ─────────────────────────────────────────────────────────────────────────────
// Service sequence templates
//
// A service sequence is the chronological journey a guest takes through one
// service model — full-service dine-in, casual dining, counter order — broken
// into stages. Each stage is a section with a KPI name and a weight; the weights
// sum to 100 and drive the visit score directly. Questions inside a stage are
// the evaluation criteria, mapped onto the template's main KPIs.
//
// The three templates below are reusable: a brand names one by code in its
// client profile and every visit to that brand, main audit or follow-up, uses
// it. Brand-specific cues live in guidance text and a few questions, never in
// the stage weights.
//
// Every template still maps each stage to one of the six KPI categories, so the
// cross-concept dashboards (heatmap, radar, category trend) stay populated.
// ─────────────────────────────────────────────────────────────────────────────

/** Closing stage on every sequence: unweighted, feeds CSAT and NPS only. */
const OVERALL_EXPERIENCE: SectionBlueprint = stage('OVR', 'Overall Experience', 'Guest Satisfaction', 0, 'customer_experience', 'Overall satisfaction, likelihood to recommend and the shopper’s own words. Not weighted; feeds CSAT and NPS.', [
  { text: 'Overall, how satisfied were you with this visit? (1-10)', type: 'rating_10', weight: 0, kpi: ['csat'], guidance: 'Your honest overall impression as a guest. 1 = extremely dissatisfied, 10 = extremely satisfied.' },
  { text: 'How likely are you to recommend this restaurant to a friend or colleague? (1-10)', type: 'rating_10', weight: 0, kpi: ['nps'], guidance: 'Net Promoter question. 9-10 promoter, 7-8 passive, 1-6 detractor.' },
  { text: 'What was the single best moment of the visit?', type: 'text', weight: 0 },
  { text: 'What one change would most improve the experience?', type: 'text', weight: 0 },
])

// ── FSR_DINE_IN · full-service restaurant · dine-in ─────────────────────────

const FSR_STAGES: SectionBlueprint[] = [
  stage('ARR', 'Arrival & Exterior', 'Arrival & First Impression', 5, 'product_environment', 'Frontage, signage, entrance and the first impression before any staff contact.', [
    { text: 'Was the exterior (frontage, windows, entrance) clean and well maintained?', type: 'yes_no', weight: 2 },
    { text: 'Was signage lit, legible and in good repair?', type: 'yes_no', weight: 1 },
    { text: 'Overall first impression on entering', type: 'rating_5', weight: 3, guidance: '1 = unwelcoming or neglected, 5 = immaculate and inviting.' },
    { text: 'Was the entrance area free of obstructions and clutter?', type: 'rating_5', weight: 1 },
    { text: 'Décor and ambience true to the concept (tilework, brass and woodwork clean and lit; music and lighting suited to a Persian dining room)', type: 'rating_5', weight: 2 },
    { text: 'Photograph of the exterior and entrance', type: 'photo', weight: 0, evidence: true, guidance: 'One wide shot taken before entering.' },
  ]),
  stage('GRT', 'Reception & Greeting', 'Greeting & Reception', 10, 'customer_experience', 'Acknowledgement on arrival, warmth of the welcome and how any wait was handled.', [
    { text: 'Were you acknowledged within 30 seconds of entering?', type: 'yes_no', weight: 3, guidance: 'Start timing as you cross the threshold. A nod or eye contact counts; being ignored does not.', tag: 'greet_30s', kpi: ['service'] },
    { text: 'Time to first greeting (minutes)', type: 'time', weight: 2, threshold: 1, guidance: 'Standard: within 1 minute of arrival.', tag: 'time_greet' },
    { text: 'Warmth and professionalism of the welcome', type: 'rating_5', weight: 3, guidance: 'The brand promise is Persian hospitality: 1 = no greeting, 5 = warm, personal, by name if known.', kpi: ['service'] },
    { text: 'Did the host make eye contact and smile?', type: 'yes_no', weight: 1 },
    { text: 'If there was a wait, was the expected time communicated?', type: 'yes_no', weight: 1, na: true, guidance: 'N/A when seated straight away.' },
  ]),
  stage('SEA', 'Seating', 'Seating Experience', 5, 'customer_experience', 'Escort to the table, table readiness and the welcome ritual at the table.', [
    { text: 'Were you escorted to the table rather than pointed towards it?', type: 'yes_no', weight: 2 },
    { text: 'Table cleanliness on arrival', type: 'rating_5', weight: 3, evidence: true, guidance: 'Surface, seating and under-table. Photograph any residue.', tag: 'cleanliness', kpi: ['cleanliness'] },
    { text: 'Was the table fully set (cutlery, glassware, napkins) before you sat down?', type: 'yes_no', weight: 2 },
    { text: 'Was a seating preference honoured when requested?', type: 'yes_no', weight: 1, na: true, guidance: 'N/A when no preference was expressed.' },
    { text: 'Was the welcome offered at the table (fresh bread, sabzi herb platter, water) without asking?', type: 'yes_no', weight: 2, guidance: 'Persian dining standard: warm taftoon or sangak and a fresh-herb platter arrive unprompted.' },
    { text: 'Quality of the bread and herb platter (bread warm, herbs fresh and chilled)', type: 'rating_5', weight: 1, na: true, guidance: 'N/A when none was served.' },
  ]),
  stage('ORD', 'Order Taking', 'Order Taking & Product Knowledge', 15, 'customer_experience', 'Listening, menu and product knowledge, recommendations, special requests and order confirmation.', [
    { text: 'Time from being seated to the order being taken (minutes)', type: 'time', weight: 3, threshold: 5, guidance: 'Standard: within 5 minutes of seating.', tag: 'time_order' },
    { text: 'Did the server listen without interrupting or asking you to repeat yourself?', type: 'yes_no', weight: 2, kpi: ['service'] },
    { text: 'Product knowledge: could the server answer a direct question about a dish?', type: 'rating_5', weight: 3, comment: true, guidance: 'Ask the difference between joojeh and koobideh kebab, how the tahdig is made, or what is in the ash-e reshteh. 1 = could not answer, 5 = confident and accurate.', kpi: ['product_knowledge'] },
    { text: 'Did the server explain a dish or daily special when asked?', type: 'yes_no', weight: 2, na: true, kpi: ['product_knowledge'] },
    { text: 'Did the server introduce the house specialities (kebab platters, saffron rice dishes, tahdig) unprompted?', type: 'yes_no', weight: 1, kpi: ['product_knowledge'] },
    { text: 'Quality of the recommendation offered', type: 'rating_5', weight: 2, na: true, guidance: 'N/A when no recommendation was requested or offered.', kpi: ['product_knowledge', 'service'] },
    { key: 'ord_special', text: 'Did you make a special request (allergen, substitution, cooking preference)?', type: 'yes_no', weight: 0, guidance: 'Informational — gates the next question. Make one reasonable request per visit where the scenario allows.' },
    { text: 'Was the special request handled correctly?', type: 'yes_no', weight: 3, comment: true, when: { key: 'ord_special', equals: true }, kpi: ['order_accuracy'] },
    { text: 'Was the order repeated back and confirmed?', type: 'yes_no', weight: 2, kpi: ['order_accuracy'] },
  ]),
  stage('UPS', 'Suggestive Selling', 'Upselling Performance', 5, 'upselling_sales', 'Whether the server grew the order naturally: starters, premium options, beverages and desserts.', [
    { text: 'Did the server suggest a starter (mast-o-khiar, soup, mezze) or a premium platter?', type: 'yes_no', weight: 3, tag: 'upsell', kpi: ['upselling'] },
    { text: 'Did the server suggest a complementary item (beverage, extra tahdig, dessert, Persian tea)?', type: 'yes_no', weight: 3, tag: 'cross_sell', kpi: ['upselling'] },
    { text: 'Were current promotions or set menus mentioned?', type: 'yes_no', weight: 1, tag: 'promotions', kpi: ['upselling'] },
    { text: 'Quality of the sales approach (natural vs. pushy)', type: 'rating_5', weight: 2, na: true, guidance: 'N/A when no suggestion was made at all.', kpi: ['upselling'] },
  ]),
  stage('BEV', 'Beverage Service', 'Beverage Service', 5, 'service_speed', 'Speed, accuracy and quality of drinks, and attentiveness to refills.', [
    { text: 'Time from order to the first beverage arriving (minutes)', type: 'time', weight: 2, threshold: 5, guidance: 'Standard: within 5 minutes of ordering.' },
    { text: 'Was the correct beverage served, as ordered?', type: 'yes_no', weight: 2 },
    { text: 'Beverage quality (temperature, presentation, taste)', type: 'rating_5', weight: 2 },
    { text: 'Was a refill or second drink offered without prompting?', type: 'yes_no', weight: 1, na: true },
  ]),
  stage('FSV', 'Food Service', 'Speed & Accuracy', 10, 'service_speed', 'Time to the main course, accuracy of what arrived and communication about any delay.', [
    { text: 'Time from order confirmation to the main course arriving (minutes)', type: 'time', weight: 4, threshold: 15, guidance: 'Standard: within 15 minutes of order confirmation.', tag: 'time_receive', kpi: ['food_delivery_time'] },
    { text: 'Was every item delivered exactly as ordered?', type: 'pass_fail', weight: 4, comment: true, tag: 'order_accuracy', kpi: ['order_accuracy'] },
    { text: 'Were courses served in the correct sequence and not rushed?', type: 'yes_no', weight: 1, na: true },
    { text: 'If the wait exceeded the standard, was a delay communicated proactively?', type: 'yes_no', weight: 1, na: true, guidance: 'N/A when the main course arrived within standard.' },
  ]),
  stage('FOOD', 'Food Evaluation', 'Food Quality', 20, 'product_environment', 'Taste, temperature, freshness, presentation, portion and ingredient quality of what was served.', [
    { text: 'Taste and seasoning', type: 'rating_5', weight: 4, kpi: ['food_quality'] },
    { text: 'Was the food served at the correct temperature?', type: 'yes_no', weight: 3, tag: 'temperature', kpi: ['food_quality'] },
    { text: 'Freshness of ingredients', type: 'rating_5', weight: 3, kpi: ['food_quality'] },
    { text: 'Presentation against brand standard', type: 'rating_5', weight: 3, evidence: true, guidance: 'Photograph the main course as served.', kpi: ['food_quality'] },
    { text: 'Portion size relative to menu and price', type: 'rating_5', weight: 2, kpi: ['food_quality'] },
    { text: 'Kebab cooked to the requested doneness, juicy, with visible charcoal char', type: 'rating_5', weight: 2, na: true, guidance: 'N/A when no grilled item was ordered.', kpi: ['food_quality'] },
    { text: 'Saffron rice: fluffy with separate grains, served hot, saffron and garnish (barberry, pistachio) as pictured on the menu', type: 'rating_5', weight: 2, na: true, guidance: 'N/A when no rice dish was ordered.', kpi: ['food_quality'] },
    { text: 'Overall quality of ingredients', type: 'rating_5', weight: 3, kpi: ['food_quality'] },
    { text: 'Food safe to eat: no raw or spoiled items, no foreign object', type: 'pass_fail', weight: 4, critical: true, evidence: true, comment: true, guidance: 'CRITICAL. Any undercooked, spoiled or contaminated item must be photographed and described.', tag: 'food_integrity' },
  ]),
  stage('TBL', 'Table Maintenance', 'Table Service', 10, 'customer_experience', 'Attentiveness during the meal: check-backs, clearing, refills and handling a small issue.', [
    { text: 'Did the server check back within a few minutes of the food arriving?', type: 'yes_no', weight: 3, tag: 'check_back', kpi: ['service'] },
    { text: 'Were finished plates cleared promptly?', type: 'yes_no', weight: 2 },
    { text: 'Were water and drinks topped up without asking?', type: 'yes_no', weight: 1, na: true },
    { text: 'Attentiveness throughout the meal', type: 'rating_5', weight: 3, guidance: '1 = had to seek out staff, 5 = anticipated needs.', kpi: ['service'] },
    { text: 'Problem-solving: how was a minor issue handled?', type: 'multiple_choice', weight: 3, options: PROBLEM_SOLVING_OPTIONS, comment: true, guidance: 'Raise one minor issue (e.g. missing cutlery, a cold side) and observe the response.', tag: 'problem_solving', kpi: ['service'] },
  ]),
  stage('CLN', 'Cleanliness', 'Cleanliness & Hygiene', 5, 'safety_entertainment', 'Hygiene of the dining room, washrooms and any visible food-handling.', [
    { text: 'No visible food-safety hazard observed (cross-contamination, uncovered food, pests)', type: 'pass_fail', weight: 4, critical: true, evidence: true, comment: true, guidance: 'CRITICAL. Any observed hazard must be photographed and described.', tag: 'food_safety', kpi: ['cleanliness'] },
    { text: 'Floors, seating and surfaces clean throughout the visit', type: 'rating_5', weight: 3, tag: 'hygiene', kpi: ['cleanliness'] },
    { text: 'Washroom cleanliness and supplies', type: 'rating_5', weight: 3, evidence: true, comment: true, tag: 'washroom', kpi: ['cleanliness'] },
    { text: 'Staff observed following hand-hygiene practice', type: 'yes_no', weight: 2, na: true, tag: 'hand_hygiene', kpi: ['cleanliness'] },
  ]),
  stage('BIL', 'Billing & Payment', 'Billing Experience', 5, 'operational_compliance', 'Promptness and accuracy of the bill, professionalism of payment handling, change and receipt.', [
    { text: 'Time from requesting the bill to it arriving (minutes)', type: 'time', weight: 2, threshold: 5, guidance: 'Standard: within 5 minutes of the request.' },
    { text: 'Bill accurate: items and prices matched what was ordered', type: 'pass_fail', weight: 4, evidence: true, comment: true, guidance: 'Photograph the receipt. Any overcharge is a High finding.', tag: 'billing', kpi: ['bill_accuracy'] },
    { text: 'Payment handled professionally and discreetly', type: 'rating_5', weight: 2 },
    { key: 'bil_cash', text: 'Did you pay in cash?', type: 'yes_no', weight: 0, guidance: 'Informational — gates the change question.' },
    { text: 'Was the correct change returned?', type: 'yes_no', weight: 2, when: { key: 'bil_cash', equals: true }, kpi: ['bill_accuracy'] },
    { text: 'Was a receipt provided without prompting?', type: 'yes_no', weight: 1 },
  ]),
  stage('DEP', 'Departure', 'Departure Experience', 5, 'customer_experience', 'The farewell and the last impression on leaving.', [
    { text: 'Were you thanked on leaving?', type: 'yes_no', weight: 2 },
    { text: 'Were you invited to return?', type: 'yes_no', weight: 1 },
    { text: 'Warmth of the farewell', type: 'rating_5', weight: 2, guidance: '1 = ignored on the way out, 5 = personal farewell at the door.' },
    { text: 'Was a closing gesture offered (Persian tea in a glass, a sweet, a warm goodbye at the door)?', type: 'yes_no', weight: 1, na: true },
    { text: 'Was the exit route clear and the entrance area still presentable?', type: 'yes_no', weight: 1 },
  ]),
  OVERALL_EXPERIENCE,
]

const FSR_SEQUENCE: ServiceSequence = {
  industry: 'Food & Beverage',
  serviceModel: 'Full Service Restaurant',
  visitMode: 'Dine-in',
  mainKpis: [
    { key: 'food_quality', label: 'Food Quality Score', kind: 'weighted' },
    { key: 'service', label: 'Service Score', kind: 'weighted' },
    { key: 'order_accuracy', label: 'Order Accuracy', kind: 'weighted' },
    { key: 'food_delivery_time', label: 'Food Delivery Time', kind: 'timing' },
    { key: 'product_knowledge', label: 'Product Knowledge Score', kind: 'weighted' },
    { key: 'upselling', label: 'Upselling Rate', kind: 'weighted' },
    { key: 'cleanliness', label: 'Cleanliness Score', kind: 'weighted' },
    { key: 'bill_accuracy', label: 'Bill Accuracy', kind: 'weighted' },
    { key: 'csat', label: 'Customer Satisfaction (CSAT)', kind: 'satisfaction' },
    { key: 'nps', label: 'Net Promoter Score (NPS)', kind: 'satisfaction' },
  ],
  criticalFailures: CRITICAL_FAILURES_DINING,
}

// ── CASUAL_DINING · casual dining · dine-in ─────────────────────────────────

const CASUAL_STAGES: SectionBlueprint[] = [
  stage('ARR', 'Arrival', 'First Impression', 5, 'product_environment', 'Exterior, entrance and the first impression on walking in.', [
    { text: 'Was the exterior and entrance clean and well maintained?', type: 'yes_no', weight: 2 },
    { text: 'Was signage and exterior lighting working and in good repair?', type: 'yes_no', weight: 1 },
    { text: 'Overall first impression on entering', type: 'rating_5', weight: 3, guidance: '1 = unwelcoming or neglected, 5 = lively, clean and inviting.' },
    { text: 'Pub-style interior in good order (woodwork, brass door furniture, memorabilia, lighting)', type: 'rating_5', weight: 1 },
    { text: 'Photograph of the exterior and entrance', type: 'photo', weight: 0, evidence: true },
  ]),
  stage('HST', 'Host / Reception', 'Reception Score', 5, 'customer_experience', 'Acknowledgement at the host stand and the welcome.', [
    { text: 'Were you acknowledged within 30 seconds of entering?', type: 'yes_no', weight: 3, guidance: 'Start timing as you cross the threshold.', tag: 'greet_30s' },
    { text: 'Time to first greeting (minutes)', type: 'time', weight: 2, threshold: 1, guidance: 'Standard: within 1 minute of arrival.', tag: 'time_greet' },
    { text: 'Warmth and energy of the host welcome', type: 'rating_5', weight: 3, guidance: 'The brand promise is that a warm welcome comes first — you should feel welcomed like part of the family. 1 = no greeting, 5 = warm, upbeat welcome.' },
  ]),
  stage('SEA', 'Seating', 'Seating Experience', 5, 'customer_experience', 'Escort to the table, table readiness and menus.', [
    { text: 'Were you escorted to the table?', type: 'yes_no', weight: 2 },
    { text: 'Table cleanliness on arrival', type: 'rating_5', weight: 3, evidence: true, guidance: 'Surface, seating and condiments. Photograph any residue.', tag: 'cleanliness', kpi: ['cleanliness'] },
    { text: 'Were menus presented and specials pointed out when seated?', type: 'yes_no', weight: 2 },
  ]),
  stage('SRV', 'Server Greeting', 'Server Engagement', 10, 'customer_experience', 'How quickly the server arrived and how they engaged with the table.', [
    { text: 'Time from being seated to the server greeting the table (minutes)', type: 'time', weight: 3, threshold: 3, guidance: 'Standard: within 3 minutes of seating.' },
    { text: 'Did the server introduce themself by name?', type: 'yes_no', weight: 2, kpi: ['server_engagement'] },
    { text: 'Warmth and friendliness of the server', type: 'rating_5', weight: 3, guidance: '1 = transactional, 5 = genuinely friendly and personal.', kpi: ['server_engagement'] },
    { text: 'Engagement with the table (conversation, reading the party, pace)', type: 'rating_5', weight: 3, kpi: ['server_engagement'] },
  ]),
  stage('MPK', 'Menu & Product Knowledge', 'Product Knowledge Score', 10, 'customer_experience', 'How well the server knows the menu, signature items and allergens.', [
    { text: 'Menu and product knowledge when questioned', type: 'rating_5', weight: 3, comment: true, guidance: 'Ask what is in a dish and how it is prepared. 1 = could not answer, 5 = confident and accurate.', kpi: ['product_knowledge'] },
    { text: 'Could the server describe a signature item (Monte Cristo, Premium Buffalo Wings, a steak cut) when asked?', type: 'yes_no', weight: 2, kpi: ['product_knowledge'] },
    { text: 'Was the current set offer (e.g. Business Lunch) explained correctly when asked?', type: 'yes_no', weight: 1, na: true, guidance: 'N/A outside the offer hours.', kpi: ['product_knowledge'] },
    { text: 'Was an allergen question answered correctly or checked with the kitchen?', type: 'yes_no', weight: 2, na: true, guidance: 'N/A when no allergen question was asked.', kpi: ['product_knowledge'] },
    { text: 'Quality of the recommendation offered', type: 'rating_5', weight: 2, na: true, kpi: ['product_knowledge'] },
  ]),
  stage('UPS', 'Suggestive Selling', 'Sales & Upselling', 10, 'upselling_sales', 'Appetisers, premium options, beverages and desserts suggested naturally.', [
    { text: 'Did the server suggest an appetiser (wings, nachos) or a premium option (steak upgrade)?', type: 'yes_no', weight: 3, tag: 'upsell', kpi: ['upselling'] },
    { text: 'Did the server suggest a complementary item (beverage, side, signature dessert)?', type: 'yes_no', weight: 3, tag: 'cross_sell', kpi: ['upselling'] },
    { text: 'Were current promotions or set menus (e.g. Business Lunch, Signature Business Lunch) mentioned?', type: 'yes_no', weight: 2, tag: 'promotions', kpi: ['upselling'] },
    { text: 'Quality of the sales approach (natural vs. pushy)', type: 'rating_5', weight: 2, na: true, guidance: 'N/A when no suggestion was made at all.', kpi: ['upselling'] },
  ]),
  stage('ORD', 'Order Taking', 'Order Accuracy', 10, 'operational_compliance', 'Promptness of order taking, confirmation and whether the order arrived as placed.', [
    { text: 'Time from seating to the order being taken (minutes)', type: 'time', weight: 2, threshold: 5, guidance: 'Standard: within 5 minutes of seating.', tag: 'time_order' },
    { text: 'Was the order repeated back and confirmed?', type: 'yes_no', weight: 2, kpi: ['order_accuracy'] },
    { key: 'ord_special', text: 'Did you make a special request (substitution, cooking preference, allergen)?', type: 'yes_no', weight: 0, guidance: 'Informational — gates the next question.' },
    { text: 'Was the special request honoured as agreed?', type: 'yes_no', weight: 3, comment: true, when: { key: 'ord_special', equals: true }, kpi: ['order_accuracy'] },
    { text: 'Was every item delivered exactly as ordered?', type: 'pass_fail', weight: 4, comment: true, tag: 'order_accuracy', kpi: ['order_accuracy'] },
  ]),
  stage('BEV', 'Beverage Service', 'Beverage Service', 5, 'service_speed', 'Speed and accuracy of drinks and attentiveness to refills.', [
    { text: 'Time from order to the first beverage arriving (minutes)', type: 'time', weight: 2, threshold: 5, guidance: 'Standard: within 5 minutes of ordering.', kpi: ['beverage_service'] },
    { text: 'Was the correct beverage served, as ordered?', type: 'yes_no', weight: 2, kpi: ['beverage_service'] },
    { text: 'Beverage quality (temperature, presentation, taste)', type: 'rating_5', weight: 2, kpi: ['beverage_service'] },
    { text: 'Was a refill offered without prompting?', type: 'yes_no', weight: 2, na: true, guidance: 'N/A for bottled drinks with no refill offer in the concept.', kpi: ['beverage_service'] },
  ]),
  stage('FDL', 'Food Delivery', 'Speed of Service', 10, 'service_speed', 'Time to the main course and communication about any delay.', [
    { text: 'Time from order confirmation to the main course arriving (minutes)', type: 'time', weight: 4, threshold: 15, guidance: 'Standard: within 15 minutes of order confirmation.', tag: 'time_receive', kpi: ['speed_of_service'] },
    { text: 'Did all dishes for the table arrive together?', type: 'yes_no', weight: 2 },
    { text: 'If the wait exceeded the standard, was a delay communicated proactively?', type: 'yes_no', weight: 1, na: true, guidance: 'N/A when the main course arrived within standard.' },
    { text: 'Was the food delivered to the right person without auctioning dishes?', type: 'yes_no', weight: 1 },
  ]),
  stage('FQ', 'Food Quality', 'Product Quality', 15, 'product_environment', 'Taste, temperature, freshness, presentation and portion of what was served.', [
    { text: 'Taste and seasoning', type: 'rating_5', weight: 4, kpi: ['food_quality'] },
    { text: 'Was the food served hot and at the correct temperature?', type: 'yes_no', weight: 3, tag: 'temperature', kpi: ['food_quality'] },
    { text: 'Freshness of ingredients', type: 'rating_5', weight: 3, kpi: ['food_quality'] },
    { text: 'Presentation against brand standard', type: 'rating_5', weight: 2, evidence: true, guidance: 'Photograph the main course as served.', kpi: ['food_quality'] },
    { text: 'Portion size relative to menu and price', type: 'rating_5', weight: 2, kpi: ['food_quality'] },
    { text: 'Grill items cooked to the requested doneness (steak, burger)', type: 'rating_5', weight: 2, na: true, guidance: 'N/A when no grilled item was ordered.', kpi: ['food_quality'] },
    { text: 'Fried items (wings, Monte Cristo) served hot and crisp, not greasy', type: 'rating_5', weight: 1, na: true, guidance: 'N/A when none was ordered.', kpi: ['food_quality'] },
    { text: 'Food safe to eat: no raw or spoiled items, no foreign object', type: 'pass_fail', weight: 4, critical: true, evidence: true, comment: true, guidance: 'CRITICAL. Any undercooked, spoiled or contaminated item must be photographed and described.', tag: 'food_integrity' },
  ]),
  stage('TBL', 'Table Maintenance', 'Table Service', 5, 'customer_experience', 'Check-back after food, clearing, attentiveness and handling a small issue.', [
    { text: 'Did the server check back within 3 minutes of the food arriving to confirm everything was right?', type: 'yes_no', weight: 3, na: true, guidance: 'The check-back KPI. N/A only when the server was visibly pulled away by an incident.', tag: 'check_back', kpi: ['check_back', 'table_maintenance'] },
    { text: 'Were finished plates cleared promptly?', type: 'yes_no', weight: 2, kpi: ['table_maintenance'] },
    { text: 'Attentiveness throughout the meal', type: 'rating_5', weight: 3, guidance: '1 = had to seek out staff, 5 = anticipated needs.', kpi: ['table_maintenance'] },
    { text: 'Problem-solving: how was a minor issue handled?', type: 'multiple_choice', weight: 3, options: PROBLEM_SOLVING_OPTIONS, comment: true, guidance: 'Raise one minor issue (e.g. missing cutlery, a cold side) and observe the response.', tag: 'problem_solving', kpi: ['table_maintenance'] },
  ]),
  stage('CLN', 'Cleanliness', 'Cleanliness', 5, 'safety_entertainment', 'Hygiene of the dining room, washrooms and any visible food-handling.', [
    { text: 'No visible food-safety hazard observed (cross-contamination, uncovered food, pests)', type: 'pass_fail', weight: 4, critical: true, evidence: true, comment: true, guidance: 'CRITICAL. Any observed hazard must be photographed and described.', tag: 'food_safety', kpi: ['cleanliness'] },
    { text: 'Floors, seating and surfaces clean throughout the visit', type: 'rating_5', weight: 3, tag: 'hygiene', kpi: ['cleanliness'] },
    { text: 'Washroom cleanliness and supplies', type: 'rating_5', weight: 3, evidence: true, comment: true, tag: 'washroom', kpi: ['cleanliness'] },
    { text: 'Staff observed following hand-hygiene practice', type: 'yes_no', weight: 2, na: true, tag: 'hand_hygiene', kpi: ['cleanliness'] },
  ]),
  stage('CLO', 'Bill & Payment + Departure', 'Closing Experience', 5, 'operational_compliance', 'Bill promptness and accuracy, payment, receipt and the farewell.', [
    { text: 'Time from requesting the bill to it arriving (minutes)', type: 'time', weight: 2, threshold: 5, guidance: 'Standard: within 5 minutes of the request.' },
    { text: 'Bill accurate: items and prices matched what was ordered', type: 'pass_fail', weight: 4, evidence: true, comment: true, guidance: 'Photograph the receipt. Any overcharge is a High finding.', tag: 'billing' },
    { text: 'Was a receipt provided without prompting?', type: 'yes_no', weight: 1 },
    { text: 'Were you thanked and invited to return?', type: 'yes_no', weight: 2 },
    { text: 'Warmth of the farewell', type: 'rating_5', weight: 2, guidance: 'Did it feel like leaving friends, as the brand promises?' },
  ]),
  OVERALL_EXPERIENCE,
]

const CASUAL_SEQUENCE: ServiceSequence = {
  industry: 'Food & Beverage',
  serviceModel: 'Casual Dining',
  visitMode: 'Dine-in',
  mainKpis: [
    { key: 'server_engagement', label: 'Server Engagement Score', kind: 'weighted' },
    { key: 'product_knowledge', label: 'Product Knowledge Score', kind: 'weighted' },
    { key: 'upselling', label: 'Upselling Compliance', kind: 'weighted' },
    { key: 'order_accuracy', label: 'Order Accuracy', kind: 'weighted' },
    { key: 'speed_of_service', label: 'Speed of Service', kind: 'timing' },
    { key: 'food_quality', label: 'Food Quality', kind: 'weighted' },
    { key: 'beverage_service', label: 'Beverage Service', kind: 'weighted' },
    { key: 'table_maintenance', label: 'Table Maintenance', kind: 'weighted' },
    { key: 'check_back', label: 'Check-Back Compliance', kind: 'derived' },
    { key: 'cleanliness', label: 'Cleanliness', kind: 'weighted' },
    { key: 'csat', label: 'Customer Satisfaction (CSAT)', kind: 'satisfaction' },
    { key: 'nps', label: 'Net Promoter Score (NPS)', kind: 'satisfaction' },
  ],
  criticalFailures: CRITICAL_FAILURES_DINING,
}

// ── QSR_COUNTER_ORDER · quick service · counter order ───────────────────────

const QSR_STAGES: SectionBlueprint[] = [
  stage('OUT', 'Outlet Appearance', 'Outlet Presentation', 5, 'product_environment', 'Frontage, menu boards and the counter area as seen on approach.', [
    { text: 'Was the frontage and counter area clean and well maintained?', type: 'yes_no', weight: 2 },
    { text: 'Were menu boards lit, legible and showing current prices and deals?', type: 'yes_no', weight: 2, guidance: 'Check the current promotion (e.g. Buy Large, Get Medium Free; Italian crust launch) is displayed.' },
    { text: 'Overall presentation of the outlet on approach', type: 'rating_5', weight: 3, guidance: '1 = untidy or dim, 5 = bright, clean and on brand (red and checker branding intact, no faded or damaged graphics).' },
    { text: 'Photograph of the frontage and menu boards', type: 'photo', weight: 0, evidence: true },
  ]),
  stage('QUE', 'Queue Experience', 'Queue Experience', 10, 'service_speed', 'From joining the queue to the cashier beginning to serve you.', [
    { text: 'Queue time: joining the queue to the cashier beginning to serve you (minutes)', type: 'time', weight: 4, threshold: 5, timing: 'queue', guidance: 'Timing KPI. Start when you join the line; stop when the cashier addresses you. Standard: 5 minutes.', tag: 'time_queue' },
    { text: 'Were you acknowledged while waiting in the queue?', type: 'yes_no', weight: 2 },
    { text: 'Was the queue orderly and actively managed?', type: 'rating_5', weight: 2 },
    { text: 'If the wait was long, was the expected time communicated?', type: 'yes_no', weight: 1, na: true, guidance: 'N/A when served within 2 minutes.' },
    { text: 'Were enough tills open for the number of guests waiting?', type: 'yes_no', weight: 1 },
  ]),
  stage('GRT', 'Greeting', 'Cashier Service', 10, 'customer_experience', 'The cashier’s welcome, friendliness and clarity.', [
    { text: 'Were you greeted within 30 seconds of reaching the counter?', type: 'yes_no', weight: 3, tag: 'greet_30s', kpi: ['cashier_service'] },
    { text: 'Friendliness of the cashier', type: 'rating_5', weight: 3, guidance: '1 = flat or indifferent, 5 = warm and engaged.', kpi: ['cashier_service'] },
    { text: 'Did the cashier make eye contact and smile?', type: 'yes_no', weight: 2, kpi: ['cashier_service'] },
    { text: 'Clarity of communication (audible, clear, polite)', type: 'rating_5', weight: 2, kpi: ['cashier_service'] },
  ]),
  stage('ORD', 'Order Taking', 'Order Taking', 10, 'operational_compliance', 'From the cashier starting your order to payment completed; accuracy of what was captured.', [
    { text: 'Order-taking time: cashier starts your order to payment completed (minutes)', type: 'time', weight: 3, threshold: 3, timing: 'order', guidance: 'Timing KPI. Standard: 3 minutes.', tag: 'time_order' },
    { text: 'Was the order repeated back and confirmed on the screen or verbally?', type: 'yes_no', weight: 2, kpi: ['order_accuracy'] },
    { text: 'Were crust type and size confirmed for pizza items?', type: 'yes_no', weight: 2, na: true, guidance: 'Pan, Italian crust, stuffed crust; small, medium or large. N/A when no pizza was ordered.', kpi: ['order_accuracy'] },
    { key: 'ord_avail', text: 'Was every item you asked for available?', type: 'yes_no', weight: 0, guidance: 'Informational — gates the next question.' },
    { text: 'Was an alternative offered for the unavailable item?', type: 'yes_no', weight: 2, when: { key: 'ord_avail', equals: false }, kpi: ['order_accuracy'] },
    { text: 'Was a special request (no onion, extra sauce, dietary) captured correctly?', type: 'yes_no', weight: 2, na: true, guidance: 'N/A when no special request was made.', kpi: ['order_accuracy'] },
  ]),
  stage('PRK', 'Product Knowledge', 'Product Knowledge', 5, 'customer_experience', 'Whether the cashier knows the menu, deals and ingredients.', [
    { text: 'Product knowledge when questioned about a menu item', type: 'rating_5', weight: 3, comment: true, guidance: 'Ask the difference between the Italian crust and the pan crust, or what comes in a meal deal. 1 = could not answer, 5 = confident and accurate.', kpi: ['product_knowledge'] },
    { text: 'Was an ingredient or allergen question answered correctly?', type: 'yes_no', weight: 2, na: true, kpi: ['product_knowledge'] },
    { text: 'Were meal or deal options explained when asked?', type: 'yes_no', weight: 2, kpi: ['product_knowledge'] },
  ]),
  stage('UPS', 'Suggestive Selling', 'Upselling', 10, 'upselling_sales', 'Upsize, add-ons and promotions offered at the counter.', [
    { text: 'Was an upsize or crust upgrade offered (large, stuffed crust)?', type: 'yes_no', weight: 3, tag: 'upsell', kpi: ['upselling'] },
    { text: 'Was an add-on suggested (wedges, wings, dips, Pepsi combo, dessert)?', type: 'yes_no', weight: 3, tag: 'cross_sell', kpi: ['upselling'] },
    { text: 'Were current deals or promotions mentioned (e.g. Buy Large, Get Medium Free)?', type: 'yes_no', weight: 2, tag: 'promotions', kpi: ['upselling'] },
    { text: 'Was the app or loyalty programme mentioned for future orders?', type: 'yes_no', weight: 1, kpi: ['upselling'] },
    { text: 'Quality of the sales approach (natural vs. scripted or pushy)', type: 'rating_5', weight: 2, na: true, guidance: 'N/A when no suggestion was made at all.', kpi: ['upselling'] },
  ]),
  stage('PAY', 'Payment', 'Transaction Accuracy', 5, 'operational_compliance', 'Receipt accuracy, change and payment handling.', [
    { text: 'Receipt matched the order: items, quantities and prices', type: 'pass_fail', weight: 4, evidence: true, comment: true, guidance: 'Photograph the receipt. Any overcharge is a High finding.', tag: 'billing' },
    { key: 'pay_cash', text: 'Did you pay in cash?', type: 'yes_no', weight: 0, guidance: 'Informational — gates the change question.' },
    { text: 'Was the correct change returned?', type: 'yes_no', weight: 2, when: { key: 'pay_cash', equals: true } },
    { text: 'Was a receipt offered without prompting?', type: 'yes_no', weight: 1 },
    { text: 'Was the payment handled smoothly (card terminal working, no re-entry)?', type: 'yes_no', weight: 1 },
  ]),
  stage('PRP', 'Preparation', 'Speed of Service', 15, 'service_speed', 'From payment completed to the order handed over.', [
    { text: 'Preparation time: payment completed to order handed over (minutes)', type: 'time', weight: 5, threshold: 7, timing: 'preparation', guidance: 'Timing KPI. Start when payment completes; stop when the order is placed in your hands. Standard: 7 minutes.', tag: 'time_receive' },
    { text: 'Was an order number or name used so you knew when it was ready?', type: 'yes_no', weight: 2 },
    { text: 'Was the expected wait communicated when the order was placed?', type: 'yes_no', weight: 1, na: true },
    { text: 'If the wait exceeded the standard, was an update or apology given?', type: 'yes_no', weight: 2, na: true, guidance: 'N/A when the order arrived within standard.' },
    { text: 'Was the collection point organised (no mixed-up or abandoned orders)?', type: 'rating_5', weight: 2 },
    { text: 'Were staff behind the counter working with urgency and focus?', type: 'rating_5', weight: 2 },
  ]),
  stage('HND', 'Handover', 'Handover & Accuracy', 10, 'operational_compliance', 'Completeness and accuracy of the order at handover, and the packaging.', [
    { text: 'Was the order complete and correct at handover?', type: 'pass_fail', weight: 4, comment: true, tag: 'order_accuracy', kpi: ['order_accuracy'] },
    { text: 'Packaging quality: box sealed, pizza intact and not shifted, items upright', type: 'rating_5', weight: 3, evidence: true, guidance: 'Photograph the packaging before opening and the product on opening.', kpi: ['packaging'] },
    { text: 'Were napkins, cutlery and requested condiments or dips included?', type: 'yes_no', weight: 1, kpi: ['packaging'] },
    { text: 'Did the team member confirm the order contents with you at handover?', type: 'yes_no', weight: 2, kpi: ['order_accuracy'] },
  ]),
  stage('FQ', 'Food Quality', 'Food Quality', 15, 'product_environment', 'Temperature, taste, freshness and presentation of the product.', [
    { text: 'Was the food hot and fresh at handover?', type: 'yes_no', weight: 4, tag: 'temperature', kpi: ['food_quality'] },
    { text: 'Taste and seasoning', type: 'rating_5', weight: 3, kpi: ['food_quality'] },
    { text: 'Freshness of ingredients and toppings', type: 'rating_5', weight: 3, kpi: ['food_quality'] },
    { text: 'Presentation: cut evenly, toppings as ordered and evenly distributed', type: 'rating_5', weight: 3, evidence: true, guidance: 'Photograph the product on opening.', kpi: ['food_quality'] },
    { text: 'Crust baked through and cheese fully melted (no soggy centre, no burnt edge)', type: 'rating_5', weight: 2, na: true, guidance: 'N/A when no pizza was ordered.', kpi: ['food_quality'] },
    { text: 'Food safe to eat: no raw or spoiled items, no foreign object', type: 'pass_fail', weight: 4, critical: true, evidence: true, comment: true, guidance: 'CRITICAL. Any undercooked, spoiled or contaminated item must be photographed and described.', tag: 'food_integrity' },
  ]),
  stage('CLN', 'Cleanliness', 'Cleanliness', 3, 'safety_entertainment', 'Hygiene of the counter, dining area, washrooms and visible food-handling.', [
    { text: 'No visible food-safety hazard observed (cross-contamination, uncovered food, pests)', type: 'pass_fail', weight: 4, critical: true, evidence: true, comment: true, guidance: 'CRITICAL. Any observed hazard must be photographed and described.', tag: 'food_safety', kpi: ['cleanliness'] },
    { text: 'Dining area floors and seating clean', type: 'rating_5', weight: 2, tag: 'hygiene', kpi: ['cleanliness'] },
    { text: 'Table or counter cleanliness where you ate', type: 'rating_5', weight: 2, evidence: true, tag: 'cleanliness', kpi: ['cleanliness'] },
    { text: 'Washroom cleanliness and supplies', type: 'rating_5', weight: 2, evidence: true, comment: true, na: true, guidance: 'N/A when the outlet has no washroom of its own (shared mall facilities).', tag: 'washroom', kpi: ['cleanliness'] },
    { text: 'Staff observed following hand-hygiene / glove practice', type: 'yes_no', weight: 2, na: true, tag: 'hand_hygiene', kpi: ['cleanliness'] },
  ]),
  stage('DEP', 'Departure', 'Farewell', 2, 'customer_experience', 'The farewell at the counter or on leaving.', [
    { text: 'Were you thanked at handover or on leaving?', type: 'yes_no', weight: 2 },
    { text: 'Were you invited to return, or told about the app for next time?', type: 'yes_no', weight: 1 },
  ]),
  OVERALL_EXPERIENCE,
]

const QSR_SEQUENCE: ServiceSequence = {
  industry: 'Food & Beverage',
  serviceModel: 'Quick Service',
  visitMode: 'Counter Order',
  mainKpis: [
    { key: 'queue_time', label: 'Queue Time', kind: 'timing' },
    { key: 'order_taking_time', label: 'Order Taking Time', kind: 'timing' },
    { key: 'preparation_time', label: 'Preparation Time', kind: 'timing' },
    { key: 'total_service_time', label: 'Total Service Time', kind: 'timing' },
    { key: 'order_accuracy', label: 'Order Accuracy', kind: 'weighted' },
    { key: 'food_quality', label: 'Food Quality', kind: 'weighted' },
    { key: 'cashier_service', label: 'Cashier Service', kind: 'weighted' },
    { key: 'product_knowledge', label: 'Product Knowledge', kind: 'weighted' },
    { key: 'upselling', label: 'Upselling Compliance', kind: 'weighted' },
    { key: 'packaging', label: 'Packaging Score', kind: 'weighted' },
    { key: 'cleanliness', label: 'Cleanliness', kind: 'weighted' },
    { key: 'csat', label: 'Customer Satisfaction (CSAT)', kind: 'satisfaction' },
    { key: 'nps', label: 'Net Promoter Score (NPS)', kind: 'satisfaction' },
  ],
  criticalFailures: [
    'Unsafe food temperature',
    'Contamination of food or packaging',
    'Serious hygiene issue at the counter, kitchen or dining area',
    'Incorrect product with serious dietary impact',
    'Major pricing issue',
    'Serious employee misconduct',
    'Customer safety issue',
  ],
  timingChain: ['queue', 'order', 'preparation'],
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
  // ── Service sequence templates (selected by brand, see BLUEPRINTS_FOR_CLIENT) ──
  // A brand framework: the client's own document, not a reusable sequence.
  SHEBESTAN_TEMPLATE,
  BENNIGANS_TEMPLATE,
  PIZZAHUT_TEMPLATE,
  {
    id: 'tpl-fsr-dine-in',
    code: 'FSR_DINE_IN',
    name: 'Full Service Restaurant — Dine-in Sequence',
    description: 'Thirteen-stage dine-in journey for a full-service restaurant: arrival, greeting, seating, order taking, upselling, beverage and food service, food evaluation, table maintenance, cleanliness, billing, departure and overall experience.',
    segment: 'F&B',
    journey: 'In-store / Dine-in',
    isFollowUp: false,
    sections: FSR_STAGES,
    sequence: FSR_SEQUENCE,
  },
  {
    id: 'tpl-casual-dining',
    code: 'CASUAL_DINING',
    name: 'Casual Dining — Dine-in Sequence',
    description: 'Fourteen-stage casual-dining journey with server engagement, product knowledge, sales behaviour, speed of service, food quality and the check-back compliance KPI.',
    segment: 'F&B',
    journey: 'In-store / Dine-in',
    isFollowUp: false,
    sections: CASUAL_STAGES,
    sequence: CASUAL_SEQUENCE,
  },
  {
    id: 'tpl-qsr-counter',
    code: 'QSR_COUNTER_ORDER',
    name: 'Quick Service — Counter Order Sequence',
    description: 'Thirteen-stage counter-order journey timed from queue to handover: queue, cashier, order taking, product knowledge, upselling, payment, preparation, handover, food quality, cleanliness and farewell.',
    segment: 'F&B',
    journey: 'Counter Order',
    isFollowUp: false,
    sections: QSR_STAGES,
    sequence: QSR_SEQUENCE,
  },
]

export interface TemplateBundle {
  templates: AuditTemplate[]
  sections: Section[]
  questions: Question[]
  /** questionId → storyline tag */
  tags: Map<string, string>
}

/**
 * The segments this client actually trades in.
 *
 * Read from the portfolio rather than declared, so it cannot drift from the
 * outlets that exist.
 */
const CLIENT_SEGMENTS = new Set<Segment>(CLIENT.portfolio.brands.map((b) => b.segment))

/** True when a section is worth asking of this client at all. */
function sectionApplies(s: SectionBlueprint): boolean {
  return s.applicableTo === 'all' || s.applicableTo.some((seg) => CLIENT_SEGMENTS.has(seg))
}

/**
 * The questionnaire library, scoped to the client.
 *
 * Every client used to receive all seven templates, including the Entertainment
 * assessment and the entertainment halves of the follow-up audit. A burger group
 * was shown a 47-question ticketing-and-safety-briefing questionnaire it will
 * never use, and a 61-question follow-up of which a third did not apply — in the
 * one screen whose whole purpose is to show the client what they will be assessed
 * against.
 *
 * Nothing was broken by it: sections are filtered against each outlet's segment
 * when a visit is conducted, so no shopper was ever asked those questions. It
 * simply described the wrong business.
 */
/**
 * Service sequence templates the client's brands name. When any brand does, the
 * library is exactly those templates: a client assessed by service sequence is
 * not also shown the generic questionnaires.
 */
const CLIENT_TEMPLATE_CODES = new Set(CLIENT.portfolio.brands.flatMap((b) => (b.templateCode ? [b.templateCode] : [])))

const BLUEPRINTS_FOR_CLIENT: TemplateBlueprint[] = CLIENT_TEMPLATE_CODES.size
  ? TEMPLATE_BLUEPRINTS.filter((t) => CLIENT_TEMPLATE_CODES.has(t.code))
  : TEMPLATE_BLUEPRINTS
      // Sequence templates are only ever reached by brand; a client whose brands
      // name none keeps the generic library it had before they existed.
      .filter((t) => !t.sequence)
      .filter((t) => t.segment === 'Both' || CLIENT_SEGMENTS.has(t.segment))
      .map((t) => ({ ...t, sections: t.sections.filter(sectionApplies) }))
      // A template whose sections have all been filtered away has nothing to ask.
      .filter((t) => t.sections.length > 0)

/** Types that produce a score, and so can fall short of one. */
const SCOREABLE = new Set<Question['type']>(['yes_no', 'pass_fail', 'rating_5', 'rating_10', 'multiple_choice', 'numeric', 'time'])

export function buildTemplates(): TemplateBundle {
  const templates: AuditTemplate[] = []
  const sections: Section[] = []
  const questions: Question[] = []
  const tags = new Map<string, string>()

  for (const t of BLUEPRINTS_FOR_CLIENT) {
    const sectionIds: string[] = []
    let qCount = 0
    // Stage weights are the visit score; an authoring slip here would mis-score every
    // visit. A conditional stage is excluded: it applies only to the visits that
    // trigger it, where the engine renormalises over the stages actually scored.
    // Weights carry a decimal, so the sum is compared at one place rather than exactly.
    if (t.sequence) {
      const total = t.sections.filter((s) => !isConditionalStage(s)).reduce((n, s) => n + (s.stageWeight ?? 0), 0)
      if (Math.round(total * 10) !== 1000) throw new Error(`Template ${t.code}: stage weights sum to ${total}, not 100`)
    }
    // `when` names a sibling in the same stage; `from`/`to` reach across the whole
    // template, because a duration is routinely measured from a stamp taken earlier
    // (seated in the hostess stage, order taken in the waiter stage).
    const keyPairs = t.sections.flatMap((s) => s.questions.flatMap((q, qi) => (q.key ? [[q.key, `${s.code}.${qi + 1}`] as const] : [])))
    // Two questions sharing a key is the one slip the Map would swallow: the later
    // definition wins, so every gate and stamp naming that key silently binds to
    // the wrong question — a gate that never opens, or a duration measured from the
    // wrong stamp. Keys reach across the template, so they must be unique across it.
    const seenKeys = new Map<string, string>()
    for (const [key, code] of keyPairs) {
      const first = seenKeys.get(key)
      if (first) throw new Error(`Template ${t.code}: key '${key}' is defined twice, on ${first} and ${code}. Keys must be unique within a template.`)
      seenKeys.set(key, code)
    }
    const codeByKeyAll = new Map(keyPairs)
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
        ...(s.stageWeight !== undefined ? { stageWeight: s.stageWeight, kpiName: s.kpiName } : {}),
      })
      // A gating question is named by its local key; the condition stores the sibling's code.
      const codeByKey = new Map(s.questions.flatMap((q, qi) => (q.key ? [[q.key, `${s.code}.${qi + 1}`] as const] : [])))
      s.questions.forEach((q, qi) => {
        if (q.retired) return // keeps its number so later ids do not move
        const qid = `${sid}-${String(qi + 1).padStart(2, '0')}`
        qCount++
        const parentCode = q.when ? codeByKey.get(q.when.key) : undefined
        if (q.when && !parentCode) throw new Error(`Template ${t.code}: question ${s.code}.${qi + 1} gates on unknown key ${q.when.key}`)
        const fromCode = q.from ? codeByKeyAll.get(q.from) : undefined
        const toCode = q.to ? codeByKeyAll.get(q.to) : undefined
        if ((q.from && !fromCode) || (q.to && !toCode)) throw new Error(`Template ${t.code}: question ${s.code}.${qi + 1} times against an unknown stamp (${q.from} → ${q.to})`)
        // A numeric or time question with no threshold can never produce a score
        // (scoreQuestion returns null), so commentOnFail could never fire on it.
        // Setting it anyway would badge an informational field — party size, bill
        // total — with a rule the shopper can never trigger.
        const canFallShort = SCOREABLE.has(q.type) && !((q.type === 'numeric' || q.type === 'time') && !(q.threshold && q.threshold > 0))
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
          ...((q.commentOnFail ?? t.commentOnFail) && canFallShort ? { commentOnFail: true } : {}),
          allowNA: q.na ?? false,
          ...(q.required ? { required: true } : {}),
          guidance: q.guidance ?? '',
          options: q.options,
          threshold: q.threshold,
          order: qi + 1,
          ...(q.kpi ? { kpiKeys: q.kpi } : {}),
          ...(q.timing ? { timingRole: q.timing } : {}),
          ...(parentCode && q.when ? { condition: { questionCode: parentCode, equals: q.when.equals } } : {}),
          ...(fromCode && toCode ? { derivedFrom: { from: fromCode, to: toCode } } : {}),
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
      version: t.sequence ? '1.0' : t.isFollowUp ? '2.1' : '3.0',
      status: 'Active',
      sectionIds,
      questionCount: qCount,
      createdAt: '2025-09-01T09:00:00',
      updatedAt: '2026-03-14T14:20:00',
      isFollowUp: t.isFollowUp,
      ...(t.sequence ? { sequence: t.sequence } : {}),
    })
  }
  return { templates, sections, questions, tags }
}
