import type { ServiceSequence } from '@/types'
import { PROBLEM_SOLVING_OPTIONS, QUALITY_SCALE, type SectionBlueprint, type TemplateBlueprint, stage, RESTROOM_KPI, restroomStage, RED_FLAGS_DINE_IN } from './templateKit'

/**
 * BENNIGANS_CASUAL_DINING — Bennigan's, Qatar Tennis Federation.
 *
 * A brand framework rather than a reusable sequence: the client supplied the
 * guest journey, the standards, the timing fields and the KPI weighting, and
 * this is that document expressed as a questionnaire. Where the generic
 * CASUAL_DINING template asks whether the table was set, this asks whether the
 * ketchup, the Tabasco and the loyalty planner were on it — because that is
 * what the brief holds Bennigan's managers to.
 *
 * Four things about the shape, all of them from the brief:
 *
 * 1. The brief's KPI table lists fourteen categories and sums to exactly 100.
 *    A fifteenth, Toilet / Restroom Cleanliness at 5%, was added at the
 *    operator's request; the brief's fourteen were scaled by 0.95 to make room,
 *    which keeps every relative priority exactly as written. Its twenty questionnaire
 *    sections are grouped into those fourteen stages: plate condition joins
 *    plate clearing under Table Maintenance, main-course timing joins main-course
 *    quality, and billing joins farewell.
 *
 * 2. Complaint handling is a conditional KPI, scored "only when a complaint
 *    occurs". Every one of its scored questions is gated behind that switch,
 *    which puts the stage outside the weights-sum rule: on a visit with no
 *    complaint it scores null and the fourteen weighted stages carry the whole
 *    100 between them; on a visit with one it takes a 4.75% share of 104.75. Cash
 *    handling is gated the same way, on whether cash was used.
 *
 * 3. Timings are recorded as wall-clock stamps and every duration is calculated,
 *    as the brief asks: the shopper writes down 14:16 and 14:18, not "2 minutes".
 *    All sixteen required timing fields are present.
 *
 * 4. Every No and every Average or Poor rating must be explained, so the
 *    template sets `commentOnFail` for the whole questionnaire.
 *
 * The brief names a standard only for the waiter's approach (within 2 minutes).
 * The other four thresholds — appetizer 10, main course 20, plate clearing 5 and
 * bill delivery 5 minutes — are casual-dining defaults, not the client's, and
 * are the one set of numbers here awaiting confirmation.
 */

// ── Timing stamps ───────────────────────────────────────────────────────────
// Each clock question carries a local key; a duration names two of them. Keys
// are unique across the template, so a stage can time against an earlier stamp.

const PROOF: SectionBlueprint = stage(
  'PRF',
  'Visit Reference & Proof of Visit',
  'Visit Verification',
  0,
  'operational_compliance',
  'Mandatory evidence of the visit. The assessment cannot be submitted without both exterior photographs.',
  [
    { text: 'Time in (entered the restaurant)', type: 'clock', weight: 0, required: true, key: 't_in', guidance: 'Record the moment you cross the entrance threshold. Every arrival timing is measured from here.' },
    { text: 'Time out (left the restaurant)', type: 'clock', weight: 0, required: true, key: 't_out' },
    { text: 'Total visit duration (minutes)', type: 'time', weight: 0, from: 't_in', to: 't_out', kpi: ['visit_duration'], guidance: 'Calculated from the two stamps above.' },
    {
      text: 'Exterior arrival photograph',
      type: 'photo',
      weight: 0,
      guidance: 'Taken before entering. The image must clearly show the Bennigan’s signage and exterior together with the date, exact time and location stamp. The assessment cannot be submitted without it.',
    },
    { text: 'Exterior departure photograph', type: 'photo', weight: 0, guidance: 'Taken on leaving, with the same date, time and location stamp.' },
    { text: 'Confirm the branch assessed', type: 'yes_no', weight: 0, required: true, guidance: 'Bennigan’s, Qatar Tennis Federation, Doha.' },
    { text: 'Number of guests in your party', type: 'numeric', weight: 0 },
    {
      text: 'Items ordered',
      type: 'text',
      weight: 0,
      guidance: 'List every item ordered for the whole party — appetizers, mains with how they were requested, sides, drinks and desserts. This is the record every accuracy, timing and food-quality answer below is read against.',
      retired: 'The brief asks this in Order Taking & Accuracy ("What did you order?"), which now holds it (14 Nov 2026).',
    },
    { text: 'Total bill amount (QAR)', type: 'numeric', weight: 0 },
    {
      text: 'Photograph of the bill',
      type: 'photo',
      weight: 0,
      na: true,
      guidance: 'Attach the itemised bill or receipt. Mark N/A only if the restaurant issued none — the billing stage scores that failure separately.',
    },
  ],
)

// ── 1 · Exterior & First Impression — 4% ────────────────────────────────────

const EXTERIOR: SectionBlueprint = stage(
  'EXT',
  'Exterior & First Impression',
  'Arrival & First Impression',
  3.8,
  'product_environment',
  'The frontage, the entrance and the impression the restaurant makes before a word is spoken.',
  [
    { text: 'Was the Bennigan’s exterior signage clean and well maintained?', type: 'yes_no', weight: 2 },
    { text: 'Was the entrance area clean and presentable?', type: 'yes_no', weight: 2 },
    { text: 'Were the exterior and sign lights operational?', type: 'yes_no', weight: 1, na: true, guidance: 'N/A for a daytime visit where no lighting is expected to be lit.' },
    { text: 'Was the entrance free from obvious litter, dirt or damage?', type: 'yes_no', weight: 2 },
    { text: 'Did the restaurant create a positive first impression?', type: 'rating_5', weight: 3, guidance: '1 = unwelcoming or neglected, 5 = lively, clean and immediately inviting.' },
  ],
)

// ── 2 · Hostess Welcome & Seating — 7% ──────────────────────────────────────

const HOSTESS: SectionBlueprint = stage(
  'HOS',
  'Hostess Welcome & Seating',
  'Hostess & Seating',
  6.65,
  'customer_experience',
  'The welcome at the door, the party-size enquiry and the walk to the table.',
  [
    { text: 'Time seated at the table', type: 'clock', weight: 0, key: 't_seated' },
    { text: 'Seating time (minutes from entering to being seated)', type: 'time', weight: 0, from: 't_in', to: 't_seated', guidance: 'Calculated from the stamps.' },
    { text: 'Did the hostess welcome you upon arrival?', type: 'yes_no', weight: 3, tag: 'greet_30s', kpi: ['hostess'] },
    { text: 'Did the hostess ask how many persons were in your party?', type: 'yes_no', weight: 2, kpi: ['hostess'] },
    { text: 'Did the hostess assist and escort you to the table?', type: 'yes_no', weight: 3, kpi: ['hostess'] },
    { text: 'Was the hostess polite, professional, friendly and well groomed?', type: 'rating_5', weight: 3, kpi: ['hostess'], guidance: '1 = indifferent or untidy, 5 = warm, composed and well presented.' },
    { text: 'Was the seating process smooth and organised?', type: 'rating_5', weight: 2, kpi: ['hostess'] },
  ],
)

// ── 3 · Occupancy & Restaurant Environment — 6% ─────────────────────────────

const OCCUPANCY: SectionBlueprint = stage(
  'OCC',
  'Occupancy & Restaurant Environment',
  'Occupancy, Environment & Cleanliness',
  5.7,
  'product_environment',
  'How busy the restaurant was, and the condition of the room the guest sat in. Occupancy is recorded for context and is not scored.',
  [
    {
      text: 'What was the restaurant occupancy level at the time of the visit?',
      type: 'multiple_choice',
      weight: 0,
      options: ['0-25%', '26-50%', '51-75%', '76-100%'],
      guidance: 'Recorded for context. A score is read differently at 20% occupancy than at 90%.',
    },
    { text: 'How many occupied tables were visible (approximately)?', type: 'numeric', weight: 0 },
    { text: 'How many guests were waiting (approximately)?', type: 'numeric', weight: 0 },
    { text: 'Was the restaurant floor clean and free from visible dirt?', type: 'yes_no', weight: 3, evidence: true, tag: 'cleanliness', kpi: ['cleanliness'] },
    { text: 'Were the dining-area furniture and fittings clean and in good repair?', type: 'yes_no', weight: 2, kpi: ['cleanliness'] },
    { text: 'Were surrounding tables cleared and reset promptly?', type: 'yes_no', weight: 2, na: true, kpi: ['cleanliness'] },
    { text: 'Were the lighting, music level and temperature appropriate for the concept?', type: 'rating_5', weight: 2 },
    {
      text: 'Was the dining area free from any serious hygiene issue?',
      type: 'yes_no',
      weight: 3,
      critical: true,
      evidence: true,
      comment: true,
      tag: 'food_safety',
      kpi: ['cleanliness'],
      guidance: 'A critical failure. Answer No for a seriously dirty dining area or table at the time of service, visible pests, or any hygiene issue a guest would report. Photograph it and describe what you saw.',
    },
  ],
)

// ── 4 · Table Setup & Condiments — 6% ───────────────────────────────────────

const TABLE_SETUP: SectionBlueprint = stage(
  'TBS',
  'Table Setup & Condiments',
  'Table Setup & Condiments',
  5.7,
  'product_environment',
  'The table as the guest finds it: cleanliness, the condiment set and the loyalty material the brief requires on display.',
  [
    { text: 'Was the table clean and free from dust or sticky residue?', type: 'yes_no', weight: 3, evidence: true, tag: 'hygiene', kpi: ['cleanliness'] },
    { text: 'Were salt and pepper displayed on the table?', type: 'yes_no', weight: 2 },
    { text: 'Were the salt and pepper containers clean and adequately filled?', type: 'yes_no', weight: 2 },
    { text: 'Was sugar displayed on the table?', type: 'yes_no', weight: 2 },
    { text: 'Was ketchup displayed?', type: 'yes_no', weight: 2 },
    { text: 'Was Tabasco displayed?', type: 'yes_no', weight: 2 },
    { text: 'Was the loyalty programme planner displayed on the table?', type: 'yes_no', weight: 2, tag: 'promotions', guidance: 'The brief requires the loyalty material on display alongside the ketchup and Tabasco.' },
    { text: 'Were the condiments clean, organised and in good condition?', type: 'rating_5', weight: 2, evidence: true },
  ],
)

// ── 5 · Initial Waiter / Order Taker Contact — 7% ───────────────────────────

const WAITER_CONTACT: SectionBlueprint = stage(
  'WTR',
  'Initial Waiter / Order Taker Contact',
  'Waiter Initial Response',
  6.65,
  'customer_experience',
  'How quickly the order taker reached the table, and the first impression they made. The brand standard is two minutes from seating.',
  [
    { text: 'Time the order taker first approached the table', type: 'clock', weight: 0, key: 't_waiter' },
    {
      text: 'Waiter initial response time (minutes from being seated)',
      type: 'time',
      weight: 3,
      threshold: 2,
      from: 't_seated',
      to: 't_waiter',
      tag: 'time_order',
      kpi: ['waiter_response_time'],
      guidance: 'Calculated from the stamps. Standard: the order taker approaches within 2 minutes of seating.',
    },
    { text: 'Did the order taker approach your table within 2 minutes of seating?', type: 'yes_no', weight: 3, kpi: ['waiter_response_time'] },
    { text: 'Did the waiter greet you professionally?', type: 'yes_no', weight: 3 },
    { text: 'Did the waiter appear attentive and ready to assist?', type: 'rating_5', weight: 2 },
    {
      text: 'What was the name of the waiter?',
      type: 'text',
      weight: 0,
      guidance: 'Read it from the name tag. If no name tag is visible, give a brief description instead — approximate age, build, hair and anything distinguishing — so the branch can identify them.',
    },
  ],
)

// ── 6 · Menu Knowledge & Upselling — 8% ─────────────────────────────────────

const MENU_KNOWLEDGE: SectionBlueprint = stage(
  'MNK',
  'Menu Knowledge & Upselling',
  'Menu Knowledge & Upselling',
  7.6,
  'upselling_sales',
  'What the order taker knew about the menu, and whether they grew the order naturally.',
  [
    {
      text: 'Did the order taker demonstrate good menu knowledge?',
      type: 'rating_5',
      weight: 3,
      kpi: ['menu_knowledge'],
      guidance: 'Ask a direct question about a signature item — what is in it, how it is cooked. 1 = could not answer, 5 = confident and accurate.',
    },
    { text: 'Did the waiter answer your questions confidently?', type: 'rating_5', weight: 2, kpi: ['menu_knowledge'] },
    { text: 'Did the order taker try to upsell or recommend additional items?', type: 'yes_no', weight: 3, tag: 'upsell', kpi: ['upselling'] },
    { text: 'Did the order taker suggest appetizers?', type: 'yes_no', weight: 2, tag: 'cross_sell', kpi: ['upselling'] },
    { text: 'Did the order taker suggest drinks?', type: 'yes_no', weight: 2, kpi: ['upselling'] },
    { text: 'Did the order taker suggest sides or upgrades?', type: 'yes_no', weight: 2, kpi: ['upselling'] },
    { text: 'Did the order taker suggest desserts where appropriate?', type: 'yes_no', weight: 2, na: true, kpi: ['upselling'] },
    { text: 'Was the upselling natural and helpful rather than pushy?', type: 'rating_5', weight: 2, na: true, kpi: ['upselling'] },
  ],
)

// ── 7 · Order Taking & Accuracy — 7% ────────────────────────────────────────

const ORDER_ACCURACY: SectionBlueprint = stage(
  'ORD',
  'Order Taking & Accuracy',
  'Order Accuracy',
  6.65,
  'operational_compliance',
  'What was ordered, whether it was confirmed back, and whether it arrived as placed.',
  [
    {
      text: 'What did you order?',
      type: 'text',
      weight: 0,
      required: true,
      guidance: 'Record every item by category — appetizer, main course with how it was requested, beverage, sides and desserts — for the whole party. Every accuracy, timing and food-quality answer is read against this list.',
    },
    { text: 'Did the order taker repeat the complete order back to you?', type: 'yes_no', weight: 3, tag: 'order_accuracy', kpi: ['order_accuracy'] },
    { text: 'Did you make a modification or special request?', type: 'yes_no', weight: 0, key: 'ord_special', guidance: 'Informational — gates the next question.' },
    { text: 'Did the order taker confirm the modification or special request?', type: 'yes_no', weight: 3, when: { key: 'ord_special', equals: true }, kpi: ['order_accuracy'] },
    { text: 'Were all ordered items correctly entered and later delivered as ordered?', type: 'yes_no', weight: 3, comment: true, key: 'ord_correct', kpi: ['order_accuracy'] },
    { text: 'Was the order-taking process accurate and professional?', type: 'rating_5', weight: 2, kpi: ['order_accuracy'] },
    // Red flags from the brief are added at the end of their stage, never in the
    // middle: question ids are positional and answers on the live system point at them.
    {
      text: 'Was the order error corrected once you pointed it out?',
      type: 'yes_no',
      weight: 3,
      critical: true,
      comment: true,
      when: { key: 'ord_correct', equals: false },
      kpi: ['order_accuracy'],
      guidance: 'Point out the wrong or missing item to the waiter. A critical failure (major order error not corrected) when it was not put right.',
    },
  ],
)

// ── 8 · Appetizer Service — 8% ──────────────────────────────────────────────

const APPETIZER: SectionBlueprint = stage(
  'APP',
  'Appetizer Service',
  'Appetizer Service',
  7.6,
  'service_speed',
  'The measured delivery of the appetizer and its quality on arrival.',
  [
    { text: 'What appetizer(s) did you order?', type: 'text', weight: 0 },
    { text: 'Time the appetizer was ordered', type: 'clock', weight: 0, key: 't_app_order' },
    { text: 'Time the appetizer was received', type: 'clock', weight: 0, key: 't_app_served' },
    {
      text: 'Appetizer delivery time (minutes)',
      type: 'time',
      weight: 3,
      threshold: 10,
      from: 't_app_order',
      to: 't_app_served',
      kpi: ['appetizer_time'],
      guidance: 'Calculated from the stamps. Standard: within 10 minutes of ordering.',
    },
    { text: 'Was the appetizer served within an acceptable time?', type: 'yes_no', weight: 2, kpi: ['appetizer_time'] },
    { text: 'Appetizer presentation', type: 'multiple_choice', weight: 2, options: QUALITY_SCALE, evidence: true, kpi: ['appetizer_quality'], guidance: 'Photograph the appetizer as served, before eating. An Average or Poor rating must be explained.' },
    { text: 'Appetizer taste', type: 'multiple_choice', weight: 3, options: QUALITY_SCALE, kpi: ['appetizer_quality'] },
    { text: 'Was the appetizer served at the correct temperature?', type: 'yes_no', weight: 2, tag: 'temperature', kpi: ['appetizer_quality'] },
    { text: 'Was the appetizer fresh and appetizing?', type: 'yes_no', weight: 3, kpi: ['appetizer_quality'] },
  ],
)

// ── 9 · Plate Condition & Clearing — 5% ─────────────────────────────────────
// The brief's sections 10 and 11. Its KPI table names one category for both.

const PLATE: SectionBlueprint = stage(
  'PLT',
  'Plate Condition & Clearing',
  'Table Maintenance',
  4.75,
  'product_environment',
  'The condition of the serving ware, and whether finished plates were cleared and the table kept in order through the meal.',
  [
    { text: 'Was the serving plate clean?', type: 'yes_no', weight: 3, tag: 'hygiene', kpi: ['cleanliness'] },
    { text: 'Was the plate free from scratches?', type: 'yes_no', weight: 2 },
    {
      text: 'Was the plate free from chips or cracks?',
      type: 'yes_no',
      weight: 3,
      critical: true,
      evidence: true,
      comment: true,
      tag: 'food_integrity',
      guidance: 'A critical failure. Chipped or cracked serving ware is a safety risk. Photograph it.',
    },
    { text: 'Was the plate free from other visible damage?', type: 'yes_no', weight: 2, evidence: true },
    { text: 'Was the plate appropriate for the presentation of the dish?', type: 'rating_5', weight: 2 },
    { text: 'Time the finished appetizer plate was ready to be cleared', type: 'clock', weight: 0, key: 't_plate_ready' },
    { text: 'Time the finished plate was actually cleared', type: 'clock', weight: 0, key: 't_plate_cleared' },
    {
      text: 'Plate clearing time (minutes)',
      type: 'time',
      weight: 3,
      threshold: 5,
      from: 't_plate_ready',
      to: 't_plate_cleared',
      kpi: ['plate_clearing_time'],
      guidance: 'Calculated from the stamps. Standard: a finished plate cleared within 5 minutes.',
    },
    { text: 'Did the waiter remove the finished appetizer plate?', type: 'yes_no', weight: 3 },
    { text: 'Did the waiter remove finished plates within a reasonable time?', type: 'yes_no', weight: 2 },
    { text: 'Was the table kept clean throughout the meal?', type: 'yes_no', weight: 3, kpi: ['cleanliness'] },
    { text: 'Did the waiter remove unnecessary items without being asked?', type: 'yes_no', weight: 2, na: true },
  ],
)

// ── 10 · Main Course Timing & Quality — 15% ─────────────────────────────────
// The brief's sections 12 and 13, and its heaviest category by a wide margin.

const MAIN_COURSE: SectionBlueprint = stage(
  'MCS',
  'Main Course Timing & Quality',
  'Main Course Timing & Quality',
  14.25,
  'product_environment',
  'The measured delivery of the main course and the quality of what arrived: cooking, doneness, temperature, freshness, taste, portion and seasoning.',
  [
    { text: 'Time the main course was ordered', type: 'clock', weight: 0, key: 't_main_order' },
    { text: 'Time the main course was served', type: 'clock', weight: 0, key: 't_main_served' },
    {
      text: 'Main course delivery time (minutes)',
      type: 'time',
      weight: 3,
      threshold: 20,
      from: 't_main_order',
      to: 't_main_served',
      tag: 'time_receive',
      kpi: ['main_course_time'],
      guidance: 'Calculated from the stamps. Standard: within 20 minutes of ordering.',
    },
    { text: 'Were all main-course items served within a reasonable time of each other?', type: 'yes_no', weight: 2 },
    { text: 'Were any delays explained by the waiter?', type: 'yes_no', weight: 2, na: true, guidance: 'N/A where there was no delay to explain.' },
    { text: 'Was the main course cooked properly?', type: 'yes_no', weight: 3, kpi: ['food_quality'] },
    { text: 'Was the food cooked to the doneness you asked for?', type: 'yes_no', weight: 3, na: true, kpi: ['food_quality'], guidance: 'N/A where you did not specify a doneness.' },
    { text: 'Was the food served at the correct temperature?', type: 'yes_no', weight: 3, tag: 'temperature', kpi: ['food_quality'] },
    { text: 'Food appearance — visually appealing and appetizing', type: 'multiple_choice', weight: 2, options: QUALITY_SCALE, evidence: true, kpi: ['food_quality'], guidance: 'Photograph the main course as it arrives, before eating.' },
    { text: 'Freshness', type: 'multiple_choice', weight: 3, options: QUALITY_SCALE, kpi: ['food_quality'] },
    { text: 'Taste', type: 'multiple_choice', weight: 3, options: QUALITY_SCALE, kpi: ['food_quality'] },
    { text: 'Portion size', type: 'multiple_choice', weight: 2, options: QUALITY_SCALE },
    { text: 'Seasoning balance', type: 'multiple_choice', weight: 2, options: QUALITY_SCALE, kpi: ['food_quality'] },
    { text: 'Overall main-course quality', type: 'multiple_choice', weight: 3, options: QUALITY_SCALE, kpi: ['food_quality'] },
    {
      text: 'Was the food safe to eat — nothing undercooked and no foreign object?',
      type: 'yes_no',
      weight: 3,
      critical: true,
      evidence: true,
      comment: true,
      tag: 'food_integrity',
      kpi: ['food_quality'],
      guidance: 'A critical failure. Answer No for anything served clearly undercooked or unsafe, or any foreign object in the food. Photograph it and describe what you found.',
    },
    {
      text: 'Was the meal free from any excessive, unexplained service delay?',
      type: 'yes_no',
      weight: 2,
      critical: true,
      comment: true,
      guidance: 'A critical failure. Answer No only for a wait far beyond the standard times that nobody explained or apologised for.',
    },
  ],
)

// ── 11 · Beverage Quality & Refill — 8% ─────────────────────────────────────

const BEVERAGE: SectionBlueprint = stage(
  'BEV',
  'Beverage Quality & Refill',
  'Beverage Quality & Refill',
  7.6,
  'service_speed',
  'The drink as served, and whether the waiter watched the glass and offered a refill before it was empty.',
  [
    { text: 'What drink did you order?', type: 'text', weight: 0 },
    { text: 'Was the drink served cold when it should have been cold?', type: 'yes_no', weight: 3, tag: 'temperature', kpi: ['beverage_quality'] },
    { text: 'Did the carbonated drink have adequate carbonation?', type: 'yes_no', weight: 2, na: true, kpi: ['beverage_quality'], guidance: 'N/A for a drink that is not carbonated. A flat soft drink is a No.' },
    { text: 'Was the drink fresh and correctly prepared?', type: 'yes_no', weight: 3, kpi: ['beverage_quality'] },
    { text: 'Overall beverage quality', type: 'multiple_choice', weight: 3, options: QUALITY_SCALE, kpi: ['beverage_quality'] },
    { text: 'Did the waiter monitor the beverage level?', type: 'yes_no', weight: 2, kpi: ['refill_offer'] },
    { text: 'Did the waiter ask whether you wanted a refill?', type: 'yes_no', weight: 3, kpi: ['refill_offer'] },
    { text: 'Was the refill offered before the drink was completely finished?', type: 'yes_no', weight: 2, na: true, kpi: ['refill_offer'], guidance: 'The brand standard is an offer made before the glass is empty, not after.' },
  ],
)

// ── 12 · Waiter Attentiveness & Service Behaviour — 8% ──────────────────────

const ATTENTIVENESS: SectionBlueprint = stage(
  'ATT',
  'Waiter Attentiveness & Service Behaviour',
  'Waiter Attentiveness',
  7.6,
  'customer_experience',
  'Presence through the meal: responsiveness, judgement about when to approach, and professional conduct.',
  [
    { text: 'Was the waiter attentive throughout the visit?', type: 'rating_5', weight: 3, kpi: ['attentiveness'] },
    { text: 'Did the waiter respond promptly when assistance was needed?', type: 'yes_no', weight: 3, kpi: ['attentiveness'] },
    { text: 'Did the waiter check the table without being intrusive?', type: 'rating_5', weight: 2, kpi: ['attentiveness'] },
    { text: 'Did the waiter maintain professional body language and tone?', type: 'yes_no', weight: 3, kpi: ['attentiveness'] },
    { text: 'Did the waiter anticipate reasonable guest needs?', type: 'yes_no', weight: 2, kpi: ['attentiveness'] },
    { text: 'Did the waiter keep the table organised throughout the meal?', type: 'yes_no', weight: 2, kpi: ['attentiveness'] },
    {
      text: 'Was all staff conduct free from rude, aggressive or seriously unprofessional behaviour?',
      type: 'yes_no',
      weight: 3,
      critical: true,
      comment: true,
      kpi: ['attentiveness'],
      guidance: 'A critical failure. Answer No for rude, aggressive, discriminatory or seriously unprofessional behaviour by any member of staff, and describe exactly what was said or done.',
    },
  ],
)

// ── 13 · Supervisor / Manager Interaction — 4% ──────────────────────────────

const SUPERVISOR: SectionBlueprint = stage(
  'SUP',
  'Supervisor / Manager Interaction',
  'Supervisor Interaction',
  3.8,
  'customer_experience',
  'Whether a manager worked the floor and asked the guest for feedback. The follow-up questions are asked only where one passed the table.',
  [
    { text: 'Did a supervisor or manager pass by the table?', type: 'yes_no', weight: 3, key: 'saw_manager', kpi: ['manager_interaction'] },
    { text: 'Did the supervisor or manager ask for feedback about the food or service?', type: 'yes_no', weight: 3, when: { key: 'saw_manager', equals: true }, kpi: ['manager_interaction'] },
    { text: 'Was the interaction professional and friendly?', type: 'rating_5', weight: 2, when: { key: 'saw_manager', equals: true } },
    { text: 'Did the supervisor or manager show genuine interest in the guest experience?', type: 'rating_5', weight: 2, when: { key: 'saw_manager', equals: true } },
    { text: 'If a concern was raised, did management respond appropriately?', type: 'yes_no', weight: 2, na: true, when: { key: 'saw_manager', equals: true } },
  ],
)

// ── 14 · Complaint Handling — conditional ───────────────────────────────────

const COMPLAINT: SectionBlueprint = stage(
  'CMP',
  'Complaint Handling',
  'Complaint Resolution',
  4.75,
  'customer_experience',
  'Scored only on a visit where a complaint was raised. On every other visit the stage is excluded and the fourteen weighted stages carry the full score.',
  [
    {
      text: 'Was a complaint or problem raised during the visit?',
      type: 'yes_no',
      weight: 0,
      key: 'had_complaint',
      guidance: 'Answer No if nothing went wrong. The rest of this stage is asked only if a complaint was raised, and is left out of the score entirely when it was not.',
    },
    { text: 'Time the complaint was raised', type: 'clock', weight: 0, key: 't_complaint', when: { key: 'had_complaint', equals: true } },
    { text: 'Time the resolution was provided', type: 'clock', weight: 0, key: 't_resolved', when: { key: 'had_complaint', equals: true } },
    {
      text: 'Complaint resolution time (minutes)',
      type: 'time',
      weight: 3,
      threshold: 10,
      from: 't_complaint',
      to: 't_resolved',
      when: { key: 'had_complaint', equals: true },
      kpi: ['complaint_resolution_time'],
      guidance: 'Calculated from the stamps. Standard: resolved within 10 minutes of the complaint being made.',
    },
    { text: 'Did the staff listen carefully to the complaint?', type: 'yes_no', weight: 3, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    { text: 'Did the staff apologise appropriately?', type: 'yes_no', weight: 3, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    { text: 'Did the staff take ownership of the issue?', type: 'yes_no', weight: 3, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    { text: 'Was a reasonable solution provided?', type: 'yes_no', weight: 3, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    { text: 'Was the problem resolved within a reasonable time?', type: 'yes_no', weight: 2, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    { text: 'Was the guest satisfied with the final resolution?', type: 'yes_no', weight: 3, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    {
      text: 'How was the complaint handled?',
      type: 'multiple_choice',
      weight: 3,
      options: PROBLEM_SOLVING_OPTIONS,
      when: { key: 'had_complaint', equals: true },
      tag: 'problem_solving',
      kpi: ['complaint_resolution'],
      guidance: 'Record how the complaint was handled. If it was ignored or dismissed, answer the next question No.',
    },
    {
      text: 'Was the complaint taken seriously — not ignored or dismissed?',
      type: 'yes_no',
      weight: 3,
      critical: true,
      comment: true,
      when: { key: 'had_complaint', equals: true },
      kpi: ['complaint_resolution'],
      guidance: 'A critical failure when staff ignored or dismissed the complaint. Describe what happened.',
    },
  ],
)

// ── 15 · Toilet / Restroom Cleanliness — 5% ────────────────────────────────
// Not in the client's brief: added at the operator's request (14 Nov 2026). It
// takes 5%, and every other stage was scaled by 0.95 so the brief's relative
// weights hold exactly. The standard inspection shared by every template.

const RESTROOM: SectionBlueprint = restroomStage(5, 'a casual-dining restaurant of Bennigan’s standard')

// ── 16 · Billing, Payment & Farewell — 7% → 6.65 ────────────────────────────
// The brief's sections 18 and 19. Cash questions are gated on cash payment.

const BILLING_FAREWELL: SectionBlueprint = stage(
  'BPF',
  'Billing, Payment & Farewell',
  'Billing & Farewell',
  6.65,
  'operational_compliance',
  'From asking for the bill to walking out: promptness, accuracy, cash handling where cash was used, the receipt and the last impression.',
  [
    { text: 'Time the bill was requested', type: 'clock', weight: 0, key: 't_bill_req' },
    { text: 'Time the bill was received', type: 'clock', weight: 0, key: 't_bill_recv' },
    {
      text: 'Bill delivery time (minutes)',
      type: 'time',
      weight: 3,
      threshold: 5,
      from: 't_bill_req',
      to: 't_bill_recv',
      kpi: ['billing_speed'],
      guidance: 'Calculated from the stamps. Standard: the bill arrives within 5 minutes of being asked for.',
    },
    { text: 'Was the staff attentive when the bill was requested?', type: 'yes_no', weight: 2 },
    { text: 'Was the bill accurate?', type: 'yes_no', weight: 3, evidence: true, comment: true, tag: 'billing', guidance: 'Photograph the bill. Check every item and the total against what you ordered.' },
    { text: 'Was the bill folder clean and in good condition?', type: 'yes_no', weight: 1, na: true, guidance: 'N/A where no bill folder was used.' },
    { text: 'Did you pay by cash?', type: 'yes_no', weight: 0, key: 'paid_cash', guidance: 'Informational — gates the two cash-handling questions.' },
    { text: 'Did the staff confirm the amount received?', type: 'yes_no', weight: 2, when: { key: 'paid_cash', equals: true } },
    { text: 'Was the correct change returned?', type: 'yes_no', weight: 3, comment: true, when: { key: 'paid_cash', equals: true } },
    { text: 'Was the payment process efficient and professional?', type: 'rating_5', weight: 2 },
    { text: 'Was a receipt provided?', type: 'yes_no', weight: 3 },
    { text: 'Did the waiter or cashier thank you after payment?', type: 'yes_no', weight: 3, kpi: ['farewell'] },
    { text: 'Did the staff thank you when leaving?', type: 'yes_no', weight: 3, kpi: ['farewell'] },
    { text: 'Did the hostess acknowledge you on departure?', type: 'yes_no', weight: 2, na: true, kpi: ['farewell'] },
    { text: 'Was the farewell warm and professional?', type: 'rating_5', weight: 2, kpi: ['farewell'] },
    { text: 'Did the final interaction leave a positive impression?', type: 'rating_5', weight: 2, kpi: ['farewell'] },
    {
      text: 'Were the bill and any change correct, or corrected before you left?',
      type: 'yes_no',
      weight: 3,
      critical: true,
      comment: true,
      guidance: 'A critical failure when a wrong bill or wrong cash change was not put right before you left.',
    },
  ],
)

// ── 17 · Overall Experience — unweighted ────────────────────────────────────

const OVERALL: SectionBlueprint = stage(
  'OVR',
  'Overall Experience',
  'Guest Satisfaction',
  0,
  'customer_experience',
  'The shopper’s own verdict. Not weighted; it carries CSAT, NPS, likelihood to return and the four open questions.',
  [
    { text: 'Rate the overall food quality', type: 'rating_5', weight: 0 },
    { text: 'Rate the overall beverage quality', type: 'rating_5', weight: 0 },
    { text: 'Rate staff friendliness and professionalism', type: 'rating_5', weight: 0 },
    { text: 'Rate the service speed', type: 'rating_5', weight: 0 },
    { text: 'Rate the cleanliness', type: 'rating_5', weight: 0 },
    { text: 'Rate value for money', type: 'rating_5', weight: 0 },
    { text: 'Rate the overall American casual-dining experience (1-10)', type: 'rating_10', weight: 0, kpi: ['csat'], guidance: '1 = extremely dissatisfied, 10 = extremely satisfied.' },
    { text: 'How likely are you to return? (1-10)', type: 'rating_10', weight: 0, kpi: ['return_likelihood'] },
    {
      text: 'How likely are you to recommend Bennigan’s to a friend, family member or colleague? (0-10)',
      type: 'rating_10',
      weight: 0,
      kpi: ['nps'],
      guidance: 'Net Promoter question. 9-10 promoter, 7-8 passive, 0-6 detractor.',
    },
    { text: 'What did you like most?', type: 'text', weight: 0 },
    { text: 'What did you dislike?', type: 'text', weight: 0 },
    { text: 'What should be improved?', type: 'text', weight: 0 },
    { text: 'Additional comments', type: 'text', weight: 0 },
  ],
)

export const BENNIGANS_STAGES: SectionBlueprint[] = [
  PROOF,
  EXTERIOR,
  HOSTESS,
  OCCUPANCY,
  TABLE_SETUP,
  WAITER_CONTACT,
  MENU_KNOWLEDGE,
  ORDER_ACCURACY,
  APPETIZER,
  PLATE,
  MAIN_COURSE,
  BEVERAGE,
  ATTENTIVENESS,
  SUPERVISOR,
  COMPLAINT,
  RESTROOM,
  BILLING_FAREWELL,
  OVERALL,
]

const BENNIGANS_SEQUENCE: ServiceSequence = {
  industry: 'Food & Beverage',
  serviceModel: 'American Casual Dining',
  visitMode: 'Dine-in',
  // The dashboard the brief specifies, in its order. The overall mystery
  // shopping score is the visit score itself and is reported in the header,
  // not here. Menu Knowledge is reported alongside Upselling, which the brief
  // weights as one category but measures as two things.
  mainKpis: [
    { key: 'hostess', label: 'Hostess & Seating Score', kind: 'weighted' },
    { key: 'waiter_response_time', label: 'Waiter Initial Response Time', kind: 'timing' },
    { key: 'menu_knowledge', label: 'Menu Knowledge Score', kind: 'weighted' },
    { key: 'upselling', label: 'Upselling Score', kind: 'weighted' },
    { key: 'order_accuracy', label: 'Order Accuracy Score', kind: 'weighted' },
    { key: 'appetizer_quality', label: 'Appetizer Quality Score', kind: 'weighted' },
    { key: 'appetizer_time', label: 'Appetizer Delivery Time', kind: 'timing' },
    { key: 'food_quality', label: 'Main Course Quality Score', kind: 'weighted' },
    { key: 'main_course_time', label: 'Main Course Delivery Time', kind: 'timing' },
    { key: 'beverage_quality', label: 'Beverage Quality Score', kind: 'weighted' },
    { key: 'refill_offer', label: 'Refill Offer Rate', kind: 'derived' },
    { key: 'plate_clearing_time', label: 'Table Clearing Time', kind: 'timing' },
    { key: 'attentiveness', label: 'Waiter Attentiveness Score', kind: 'weighted' },
    { key: 'cleanliness', label: 'Cleanliness Score', kind: 'weighted' },
    RESTROOM_KPI,
    { key: 'manager_interaction', label: 'Supervisor / Manager Feedback Interaction Rate', kind: 'derived' },
    { key: 'complaint_resolution', label: 'Complaint Resolution Score', kind: 'weighted' },
    { key: 'complaint_resolution_time', label: 'Complaint Resolution Time', kind: 'timing' },
    { key: 'billing_speed', label: 'Billing Speed', kind: 'timing' },
    { key: 'farewell', label: 'Farewell Score', kind: 'weighted' },
    { key: 'csat', label: 'Customer Satisfaction (CSAT)', kind: 'satisfaction' },
    { key: 'nps', label: 'Net Promoter Score (NPS)', kind: 'satisfaction' },
    { key: 'return_likelihood', label: 'Likelihood to Return', kind: 'satisfaction' },
    { key: 'visit_duration', label: 'Total Visit Duration', kind: 'timing' },
  ],
  // The brief's red-flag list, in its words.
  criticalFailures: RED_FLAGS_DINE_IN,
}

export const BENNIGANS_TEMPLATE: TemplateBlueprint = {
  id: 'tpl-bennigans-casual-dining',
  code: 'BENNIGANS_CASUAL_DINING',
  name: 'Bennigan’s — American Casual Dining Framework',
  description:
    'The brand’s own guest journey: exterior and hostess welcome, occupancy and room condition, the table condiment and loyalty set, a two-minute order-taker standard, menu knowledge and upselling, measured appetizer and main-course delivery, serving-ware condition and plate clearing, beverage temperature, carbonation and refill offers, waiter attentiveness, the manager feedback visit, conditional complaint handling, and the billing-to-farewell close.',
  segment: 'F&B',
  journey: 'In-store / Dine-in',
  isFollowUp: false,
  sections: BENNIGANS_STAGES,
  sequence: BENNIGANS_SEQUENCE,
  // The brief: every No and every Average or Poor rating must be explained.
  commentOnFail: true,
}
