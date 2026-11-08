import type { ServiceSequence } from '@/types'
import { CRITICAL_FAILURES_DINING, PROBLEM_SOLVING_OPTIONS, QUALITY_SCALE, type SectionBlueprint, type TemplateBlueprint, stage } from './templateKit'

/**
 * SHEBESTAN_FINE_DINING — Shebestan Palace, Al Sadd.
 *
 * A brand framework rather than a reusable sequence: the client supplied the
 * service journey, the standards and the KPI weighting, and this is that
 * document expressed as a questionnaire. Where the generic FSR_DINE_IN template
 * asks whether a welcome was warm, this asks whether the yogurt and cucumber,
 * the greens with cheese and the six-piece bread basket arrived — because that
 * is what Shebestan serves and what its managers are held to.
 *
 * Three things about the shape, all of them from the brief:
 *
 * 1. The brief lists 28 service sections and 16 KPI categories. The KPI category
 *    is the unit that carries a weight, so the sections are grouped into those
 *    sixteen stages: menu knowledge and upselling into one, the five closing
 *    sections (bill request, presentation, cash, payment, farewell) into one.
 *    The section headings survive as the question wording.
 *
 * 2. The supplied weights sum to 105, not 100. They are scaled by 1/1.05, which
 *    keeps every relative priority exactly as written — food quality stays worth
 *    three times the restroom — and the hundredth of a point left over by the
 *    rounding is taken off food quality, the largest weight and so the least
 *    distorted by it (14.3 → 14.2).
 *
 * 3. Complaint handling is scored only on a visit where a complaint was raised.
 *    Every one of its questions is gated behind that switch, which makes the
 *    whole stage conditional: on a visit with no complaint it scores null and
 *    the other sixteen stages renormalise over the 100 between them; on a visit
 *    with one it takes a 5% share of a 105-point total. That is the engine's
 *    ordinary handling of an unscored stage, not a special case.
 *
 * Timings are recorded as wall-clock stamps and the durations are calculated, as
 * the brief asks: the shopper writes down 12:31 and 12:33, not "2 minutes".
 */

// ── Timing stamps ───────────────────────────────────────────────────────────
// Each clock question carries a local key; a duration names two of them. Keys are
// unique across the template, so a stage can time against a stamp taken earlier.

const PROOF: SectionBlueprint = stage(
  'PRF',
  'Visit Reference & Proof of Location',
  'Visit Verification',
  0,
  'operational_compliance',
  'Mandatory evidence of the visit. The assessment cannot be submitted without both exterior photographs.',
  [
    { text: 'Time in (entered the restaurant)', type: 'clock', weight: 0, key: 't_in', guidance: 'Record the moment you cross the entrance threshold. Every arrival timing is measured from here.' },
    { text: 'Time out (left the restaurant)', type: 'clock', weight: 0, key: 't_out' },
    {
      text: 'Exterior arrival photograph',
      type: 'photo',
      weight: 0,
      guidance: 'Taken before entering. The image must clearly show the restaurant signage and entrance, with the date, exact time and location stamp visible. The assessment cannot be submitted without it.',
    },
    { text: 'Exterior departure photograph', type: 'photo', weight: 0, guidance: 'Taken on leaving, with the same date, time and location stamp.' },
    { text: 'Confirm the branch assessed', type: 'yes_no', weight: 0, guidance: 'Shebestan Palace, Building 17, Al Sadd Street, Doha.' },
  ],
)

// ── 1 · Exterior & First Impression — 4% → 3.8 ──────────────────────────────

const EXTERIOR: SectionBlueprint = stage(
  'EXT',
  'Exterior & First Impression',
  'Arrival & First Impression',
  3.8,
  'product_environment',
  'The approach, the frontage and the impression the restaurant makes before a word is spoken.',
  [
    { text: 'Was the exterior signage clean and well maintained?', type: 'yes_no', weight: 2 },
    { text: 'Was the restaurant entrance clean and presentable?', type: 'yes_no', weight: 3 },
    { text: 'Were all entrance and exterior lights operational?', type: 'yes_no', weight: 2 },
    { text: 'Was the entrance area free from visible dirt or damage?', type: 'yes_no', weight: 2 },
    { text: 'Did the restaurant create a positive first impression upon arrival?', type: 'rating_5', weight: 3, guidance: '1 = unwelcoming or neglected, 5 = immediately reads as fine dining.' },
  ],
)

// ── 2 · Hostess Greeting & Seating — 7% → 6.7 ───────────────────────────────

const HOSTESS: SectionBlueprint = stage(
  'HOS',
  'Hostess Greeting & Seating',
  'Hostess & Seating',
  6.7,
  'customer_experience',
  'The welcome at the door, the walk to the table and the handover to the waiter.',
  [
    { text: 'Time greeted by the hostess', type: 'clock', weight: 0, key: 't_greet' },
    { text: 'Time seated at the table', type: 'clock', weight: 0, key: 't_seated' },
    { text: 'Time the menu was received', type: 'clock', weight: 0, key: 't_menu' },
    { text: 'Greeting time (minutes from entering to being greeted)', type: 'time', weight: 3, threshold: 1, from: 't_in', to: 't_greet', kpi: ['greeting_time'], tag: 'time_greet', guidance: 'Calculated from the stamps above. Standard: greeted within 1 minute of entering.' },
    { text: 'Seating time (minutes from entering to being seated)', type: 'time', weight: 2, threshold: 3, from: 't_in', to: 't_seated', kpi: ['seating_time'], guidance: 'Calculated. Standard: seated within 3 minutes.' },
    { text: 'Menu delivery time (minutes from being seated to receiving the menu)', type: 'time', weight: 2, threshold: 2, from: 't_seated', to: 't_menu', guidance: 'Calculated. Standard: menu in hand within 2 minutes of sitting down.' },
    { text: 'Did the hostess greet the guest upon arrival?', type: 'yes_no', weight: 3, kpi: ['hostess'] },
    { text: 'Did the hostess welcome the guest professionally?', type: 'yes_no', weight: 3, kpi: ['hostess'] },
    { text: 'Did the hostess assist and escort the guest to the table?', type: 'yes_no', weight: 3, kpi: ['hostess'] },
    { text: 'Did the hostess provide the menu?', type: 'yes_no', weight: 2, kpi: ['hostess'] },
    { text: 'Did the hostess inform the guest that the waiter / order taker would come to take the order?', type: 'yes_no', weight: 2, kpi: ['hostess'] },
    { text: 'Was the hostess friendly, polite, professional and well groomed?', type: 'rating_5', weight: 3, kpi: ['hostess'], guidance: '1 = indifferent or untidy, 5 = warm, composed and immaculately presented.' },
    { text: 'Was the seating process smooth and organised?', type: 'rating_5', weight: 2, kpi: ['hostess'] },
  ],
)

// ── 3 + 4 · Table Setup & Menu Condition — 6% → 5.7 ─────────────────────────

const TABLE_SETUP: SectionBlueprint = stage(
  'TBS',
  'Table Setup & Menu Condition',
  'Table Setup & Menu',
  5.7,
  'product_environment',
  'The state of the table the guest is seated at and of the menu placed in their hands.',
  [
    { text: 'Was the table clean and completely free from dust?', type: 'yes_no', weight: 3, evidence: true, tag: 'cleanliness' },
    { text: 'Was the tissue / napkin properly displayed on the table?', type: 'yes_no', weight: 2 },
    { text: 'Were the salt and pepper containers clean?', type: 'yes_no', weight: 2 },
    { text: 'Were the salt and pepper containers adequately filled?', type: 'yes_no', weight: 1 },
    { text: 'Were all table items properly arranged?', type: 'yes_no', weight: 2 },
    { text: 'Was the overall table setup appropriate for a fine-dining restaurant?', type: 'rating_5', weight: 3 },
    { text: 'Was the menu clean?', type: 'yes_no', weight: 2 },
    { text: 'Was the menu free from stains?', type: 'yes_no', weight: 2 },
    { text: 'Was the menu free from tears or damage?', type: 'yes_no', weight: 2 },
    { text: 'Was the menu easy to read?', type: 'yes_no', weight: 1 },
    { text: 'Was the menu presented professionally?', type: 'yes_no', weight: 2 },
  ],
)

// ── 5 · Restaurant Ambience — 5% → 4.8 ──────────────────────────────────────

const AMBIENCE: SectionBlueprint = stage(
  'AMB',
  'Restaurant Ambience',
  'Ambience',
  4.8,
  'product_environment',
  'Sound, temperature, light, cleanliness of the room and the air in it.',
  [
    { text: 'Was background music playing?', type: 'yes_no', weight: 1 },
    { text: 'Was the music volume appropriate and comfortable?', type: 'yes_no', weight: 2 },
    { text: 'Was the air conditioning operational?', type: 'yes_no', weight: 2 },
    { text: 'Was the restaurant temperature comfortable — neither too cold nor too hot?', type: 'yes_no', weight: 2 },
    { text: 'Were all lights in the guest seating area operational?', type: 'yes_no', weight: 2 },
    { text: 'Was the dining-area floor clean and free from visible dirt?', type: 'yes_no', weight: 3, tag: 'cleanliness' },
    { text: 'Was the restaurant free from unpleasant odours?', type: 'yes_no', weight: 3, tag: 'hygiene' },
    { text: 'Was the overall atmosphere appropriate for a fine-dining restaurant?', type: 'rating_5', weight: 3 },
    { text: 'Was the insect killer operational, where applicable?', type: 'yes_no', weight: 1, na: true },
  ],
)

// ── 6 + 7 · Welcome Complimentary Service — 8% → 7.6 ────────────────────────

const WELCOME: SectionBlueprint = stage(
  'WEL',
  'Welcome Complimentary Items & Bread Basket',
  'Welcome Complimentary Service',
  7.6,
  'product_environment',
  'The house welcome: yogurt and cucumber, the greens and cheese plate, and the bread basket — served, explained and replenished.',
  [
    { text: 'Did the waiter provide the complimentary yogurt and cucumber?', type: 'yes_no', weight: 3 },
    { text: 'Did the waiter provide the fresh greens / vegetable plate with cheese?', type: 'yes_no', weight: 3 },
    { text: 'Did the waiter provide the bread basket?', type: 'yes_no', weight: 3 },
    { text: 'Did the waiter explain that these items were complimentary house welcome items?', type: 'yes_no', weight: 2 },
    { text: 'Were the welcome plates presented properly?', type: 'yes_no', weight: 2 },
    { text: 'Were the welcome items fresh?', type: 'yes_no', weight: 3 },
    { text: 'Were the welcome items served at an appropriate temperature?', type: 'yes_no', weight: 2 },
    { text: 'Were the welcome items appetising?', type: 'yes_no', weight: 2 },
    { text: 'Taste of the welcome plates', type: 'multiple_choice', weight: 3, options: QUALITY_SCALE, evidence: true, guidance: 'Photograph the welcome plates as served. An Average or Poor rating must be explained.' },
    { text: 'Was the bread basket clean?', type: 'yes_no', weight: 2 },
    { text: 'Was the bread basket in good condition?', type: 'yes_no', weight: 2 },
    { text: 'Did the basket contain approximately 6 slices / pieces of bread?', type: 'yes_no', weight: 2, guidance: 'The house standard is six pieces. Count them before eating.' },
    { text: 'Was the bread fresh?', type: 'yes_no', weight: 3 },
    { text: 'Was the bread properly presented?', type: 'yes_no', weight: 2 },
    { text: 'Did the waiter offer additional bread when needed?', type: 'yes_no', weight: 2, na: true },
    { text: 'Did the waiter ask whether the guest would like extra bread?', type: 'yes_no', weight: 2, na: true },
  ],
)

// ── 8 + 12 + 13 · Waiter Professionalism & Attentiveness — 10% → 9.5 ────────

const WAITER: SectionBlueprint = stage(
  'WTR',
  'Waiter Professionalism & Attentiveness',
  'Waiter Professionalism & Attentiveness',
  9.5,
  'customer_experience',
  'Arrival at the table, bearing and manner, attentiveness through the meal, and how staff conduct themselves in the room.',
  [
    { text: 'Time the waiter first approached the table', type: 'clock', weight: 0, key: 't_waiter' },
    { text: 'Time order taking started', type: 'clock', weight: 0, key: 't_order_start' },
    { text: 'Waiter approach time (minutes from being seated)', type: 'time', weight: 3, threshold: 3, from: 't_seated', to: 't_waiter', kpi: ['waiter_approach_time'], guidance: 'Calculated. Standard: a waiter at the table within 3 minutes of seating.' },
    { text: 'Order taking time (minutes from being seated to the order being taken)', type: 'time', weight: 2, threshold: 5, from: 't_seated', to: 't_order_start', tag: 'time_order', guidance: 'Calculated. Standard: within 5 minutes of seating.' },
    { text: 'Did the waiter approach the table to take the order?', type: 'yes_no', weight: 3, kpi: ['service'] },
    { text: 'Did the waiter approach within a reasonable time?', type: 'yes_no', weight: 2, kpi: ['service'] },
    { text: 'Was the waiter attentive?', type: 'rating_5', weight: 3, kpi: ['service', 'attentiveness'] },
    { text: 'Was the waiter polite and professional?', type: 'rating_5', weight: 3, kpi: ['service'] },
    { text: 'Did the waiter maintain appropriate eye contact?', type: 'yes_no', weight: 2, kpi: ['service'] },
    { text: 'Did the waiter demonstrate professional body language?', type: 'yes_no', weight: 2, kpi: ['service'] },
    { text: 'Did the waiter appear confident?', type: 'yes_no', weight: 2, kpi: ['service'] },
    { text: 'Did the waiter make the guest feel comfortable?', type: 'rating_5', weight: 3, kpi: ['service'] },
    { text: 'Were the waiters attentive throughout the experience?', type: 'rating_5', weight: 3, kpi: ['attentiveness'] },
    { text: 'Did the waiter notice when the guest needed assistance?', type: 'yes_no', weight: 2, kpi: ['attentiveness'] },
    { text: 'Did the waiter respond quickly when called?', type: 'yes_no', weight: 3, kpi: ['attentiveness'] },
    { text: 'Did the waiter monitor the table regularly?', type: 'yes_no', weight: 2, kpi: ['attentiveness'] },
    { text: 'Did the waiter check on the guest without being intrusive?', type: 'rating_5', weight: 2, kpi: ['attentiveness'] },
    { text: 'Did the waiter refill or replace items when necessary?', type: 'yes_no', weight: 2, na: true, kpi: ['attentiveness'] },
    { text: 'Did the waiter notice when the bread was finished?', type: 'yes_no', weight: 2, na: true, kpi: ['attentiveness'] },
    { text: 'Did the waiter ask whether additional bread was required?', type: 'yes_no', weight: 2, na: true, kpi: ['attentiveness'] },
    { text: 'Did the waiter ask whether the guest needed anything else?', type: 'yes_no', weight: 2, kpi: ['attentiveness'] },
    {
      text: 'Were staff members communicating professionally with each other?',
      type: 'yes_no',
      weight: 2,
      kpi: ['service'],
      guidance: 'Judge the manner, not the language. Staff speaking Farsi, Arabic or any other language among themselves is not a fault; loud, disruptive or inappropriate conversation is.',
    },
    { text: 'Did staff avoid speaking loudly in the dining area?', type: 'yes_no', weight: 2, kpi: ['service'] },
    { text: 'Did staff avoid shouting?', type: 'yes_no', weight: 3, kpi: ['service'] },
    { text: 'Did staff avoid inappropriate or personal conversations in front of guests?', type: 'yes_no', weight: 3, kpi: ['service'] },
    { text: 'Was staff communication discreet?', type: 'yes_no', weight: 2, kpi: ['service'] },
    { text: 'Did staff behaviour maintain a fine-dining atmosphere?', type: 'rating_5', weight: 3, kpi: ['service'] },
  ],
)

// ── 9 + 10 · Menu Knowledge & Upselling — 8% → 7.6 ──────────────────────────

const MENU_KNOWLEDGE: SectionBlueprint = stage(
  'MNK',
  'Menu Knowledge & Suggestive Selling',
  'Menu Knowledge & Upselling',
  7.6,
  'upselling_sales',
  'What the order taker knows about the menu and what they do with it: explanation, recommendation and suggestive selling.',
  [
    { text: 'Did the order taker demonstrate good menu knowledge?', type: 'rating_5', weight: 3, kpi: ['menu_knowledge'], guidance: 'Ask about a kebab cut and how it is cooked, or what goes into a rice dish. 1 = could not answer, 5 = confident and accurate.' },
    { text: 'Was the waiter able to explain menu items clearly?', type: 'yes_no', weight: 3, kpi: ['menu_knowledge'] },
    { text: 'Was the waiter able to explain ingredients?', type: 'yes_no', weight: 2, kpi: ['menu_knowledge'] },
    { text: 'Was the waiter able to explain preparation methods?', type: 'yes_no', weight: 2, kpi: ['menu_knowledge'] },
    { text: 'Was the waiter able to recommend suitable dishes?', type: 'yes_no', weight: 2, kpi: ['menu_knowledge'] },
    { text: 'Did the waiter recommend signature items?', type: 'yes_no', weight: 2, kpi: ['menu_knowledge'] },
    { text: 'Did the waiter answer menu questions confidently?', type: 'rating_5', weight: 2, kpi: ['menu_knowledge'] },
    { text: 'Did the waiter inform the guest if any item was unavailable?', type: 'yes_no', weight: 2, na: true, kpi: ['menu_knowledge'] },
    { text: 'Did the order taker attempt to upsell?', type: 'yes_no', weight: 3, tag: 'upsell', kpi: ['upselling'] },
    { text: 'Did the waiter suggest starters?', type: 'yes_no', weight: 2, tag: 'cross_sell', kpi: ['upselling'] },
    { text: 'Did the waiter suggest additional sides?', type: 'yes_no', weight: 2, kpi: ['upselling'] },
    { text: 'Did the waiter suggest drinks?', type: 'yes_no', weight: 2, kpi: ['upselling'] },
    { text: 'Did the waiter recommend signature dishes?', type: 'yes_no', weight: 2, tag: 'promotions', kpi: ['upselling'] },
    { text: 'Did the waiter suggest desserts later in the meal, where appropriate?', type: 'yes_no', weight: 2, na: true, kpi: ['upselling'], guidance: 'Persian tea and a sweet are the house close — note whether either was offered.' },
    { text: 'Was the upselling natural and professional?', type: 'rating_5', weight: 2, na: true, kpi: ['upselling'] },
    { text: 'Was the upselling helpful rather than aggressive or pushy?', type: 'yes_no', weight: 2, na: true, kpi: ['upselling'] },
  ],
)

// ── 11 · Order Accuracy — 6% → 5.7 ──────────────────────────────────────────

const ORDER_ACCURACY: SectionBlueprint = stage(
  'ORD',
  'Order Accuracy',
  'Order Accuracy',
  5.7,
  'operational_compliance',
  'Whether the order was heard, confirmed and delivered as the guest gave it.',
  [
    { text: 'Did the order taker repeat the order?', type: 'yes_no', weight: 3, kpi: ['order_accuracy'] },
    { text: 'Did the order taker confirm all ordered items?', type: 'yes_no', weight: 3, kpi: ['order_accuracy'] },
    { text: 'Did the order taker confirm special requests or modifications?', type: 'yes_no', weight: 2, na: true, kpi: ['order_accuracy'] },
    { text: 'Did the waiter understand the order correctly?', type: 'yes_no', weight: 3, kpi: ['order_accuracy'] },
    { text: 'Were all modifications correctly communicated?', type: 'yes_no', weight: 2, na: true, kpi: ['order_accuracy'] },
    { text: 'Did the guest receive exactly what was ordered?', type: 'pass_fail', weight: 3, tag: 'order_accuracy', kpi: ['order_accuracy'], guidance: 'A missing item, a substitution or a wrong cut is a fail. Describe it in the comment.' },
  ],
)

// ── 14 · Food Delivery & Timing — 8% → 7.6 ──────────────────────────────────

const DELIVERY: SectionBlueprint = stage(
  'DEL',
  'Food Delivery & Timing',
  'Food Delivery & Timing',
  7.6,
  'service_speed',
  'Measured time from the order to each course, and whether the table was served together.',
  [
    { text: 'Time the order was placed', type: 'clock', weight: 0, key: 't_order_placed' },
    { text: 'Time the starters were received', type: 'clock', weight: 0, key: 't_starter' },
    { text: 'Time the main course was received', type: 'clock', weight: 0, key: 't_main' },
    { text: 'Time the grilled items were received', type: 'clock', weight: 0, key: 't_grilled' },
    { text: 'Starter delivery time (minutes)', type: 'time', weight: 2, threshold: 10, from: 't_order_placed', to: 't_starter', kpi: ['starter_time'], guidance: 'Calculated. Standard: starters within 10 minutes of ordering.' },
    { text: 'Main-course delivery time (minutes)', type: 'time', weight: 3, threshold: 20, from: 't_order_placed', to: 't_main', kpi: ['main_course_time'], tag: 'time_receive', guidance: 'Calculated. Standard: main course within 20 minutes of ordering.' },
    { text: 'Grilled-item delivery time (minutes)', type: 'time', weight: 3, threshold: 25, from: 't_order_placed', to: 't_grilled', kpi: ['grilled_time'], guidance: 'Calculated. Charcoal work takes longer; the standard is 25 minutes.' },
    { text: 'Were the grilled items delivered within an acceptable time?', type: 'yes_no', weight: 2 },
    { text: "Were all guests' meals served within a reasonable time of each other?", type: 'yes_no', weight: 3, guidance: 'The table should be served together. Note any guest left waiting while others ate.' },
    { text: 'Were any service delays explained?', type: 'yes_no', weight: 2, na: true },
  ],
)

// ── 16 · Food Quality & Cooking — 15% → 14.2 ────────────────────────────────

const FOOD_QUALITY: SectionBlueprint = stage(
  'FQC',
  'Food Quality & Cooking',
  'Food Quality & Cooking',
  14.2,
  'product_environment',
  'The food itself: cooking, temperature, freshness, seasoning, portion and the ratings the brief asks to be explained whenever they fall to Average or below.',
  [
    { text: 'Was the food cooked properly?', type: 'yes_no', weight: 3, kpi: ['food_quality'] },
    { text: 'Was the food cooked according to the expected doneness?', type: 'yes_no', weight: 3, kpi: ['food_quality'], guidance: 'Order a kebab at a stated doneness and judge against what arrives.' },
    { text: 'Was the meat cooked correctly?', type: 'yes_no', weight: 3, kpi: ['food_quality'] },
    { text: 'Was the meat tender?', type: 'yes_no', weight: 2, kpi: ['food_quality'] },
    { text: 'Were the grilled items served at the correct temperature?', type: 'yes_no', weight: 3, kpi: ['food_quality'] },
    { text: 'Were the grilled items hot when served?', type: 'yes_no', weight: 3, kpi: ['food_quality'] },
    {
      text: 'Was the food fresh?',
      type: 'pass_fail',
      weight: 3,
      critical: true,
      evidence: true,
      tag: 'food_safety',
      kpi: ['food_quality'],
      guidance: 'A critical standard. Fail this only for food that is not safe or fit to eat — spoiled, raw where it should not be, or containing a foreign object — and photograph it.',
    },
    { text: 'Was the food visually appealing?', type: 'yes_no', weight: 2, kpi: ['food_quality'] },
    { text: 'Was the food appetising?', type: 'yes_no', weight: 2, kpi: ['food_quality'] },
    { text: 'Was the food delicious?', type: 'yes_no', weight: 2, kpi: ['food_quality'] },
    { text: 'Was the seasoning balanced?', type: 'yes_no', weight: 2, kpi: ['food_quality'] },
    { text: 'Were the portions appropriate?', type: 'yes_no', weight: 2 },
    { text: 'Was the presentation suitable for a fine-dining restaurant?', type: 'yes_no', weight: 2 },
    { text: 'Was the overall quality of the food satisfactory?', type: 'yes_no', weight: 3, kpi: ['food_quality'] },
    { text: 'Overall taste', type: 'multiple_choice', weight: 3, options: QUALITY_SCALE, kpi: ['food_quality'] },
    { text: 'Food temperature', type: 'multiple_choice', weight: 2, options: QUALITY_SCALE, kpi: ['food_quality'] },
    { text: 'Food presentation', type: 'multiple_choice', weight: 2, options: QUALITY_SCALE, evidence: true, kpi: ['food_quality'], guidance: 'Photograph the main course as it arrives, before eating.' },
    { text: 'Freshness', type: 'multiple_choice', weight: 3, options: QUALITY_SCALE, kpi: ['food_quality'] },
    { text: 'Portion size', type: 'multiple_choice', weight: 2, options: QUALITY_SCALE },
    { text: 'Cooking quality', type: 'multiple_choice', weight: 3, options: QUALITY_SCALE, kpi: ['food_quality'] },
    { text: 'Overall meal quality', type: 'multiple_choice', weight: 3, options: QUALITY_SCALE, kpi: ['food_quality'] },
  ],
)

// ── 15 + 17 · Plate & Presentation Standards — 5% → 4.8 ─────────────────────

const PLATE: SectionBlueprint = stage(
  'PLT',
  'Food Serving & Serving-Ware Standards',
  'Plate & Presentation Standards',
  4.8,
  'operational_compliance',
  'How the dish is placed in front of the guest, and the condition of what it is served on.',
  [
    { text: 'Did the waiter introduce the name of the dish while serving?', type: 'yes_no', weight: 3 },
    { text: 'Did the waiter serve the correct dish to the correct guest?', type: 'yes_no', weight: 3 },
    { text: 'Was the food served professionally?', type: 'rating_5', weight: 3 },
    { text: 'Was the presentation appropriate for fine dining?', type: 'yes_no', weight: 2 },
    { text: 'Were plates handled professionally?', type: 'yes_no', weight: 2, guidance: 'Thumbs clear of the rim, no reaching across a guest.' },
    { text: 'Were food items placed correctly on the table?', type: 'yes_no', weight: 2 },
    { text: 'Was the serving plate clean?', type: 'yes_no', weight: 3, tag: 'cleanliness' },
    { text: 'Was the plate free from food stains?', type: 'yes_no', weight: 2 },
    { text: 'Was the plate free from scratches?', type: 'yes_no', weight: 1 },
    { text: 'Was the plate free from chips?', type: 'yes_no', weight: 2 },
    { text: 'Was the plate free from cracks?', type: 'yes_no', weight: 2 },
    { text: 'Was the plate free from any visible damage?', type: 'yes_no', weight: 2 },
    { text: 'Was the plate in good overall condition?', type: 'yes_no', weight: 2 },
    { text: 'Was the plate appropriate for fine-dining presentation?', type: 'yes_no', weight: 2 },
  ],
)

// ── 18 · Table Clearing & Maintenance — 5% → 4.8 ────────────────────────────

const TABLE_MAINTENANCE: SectionBlueprint = stage(
  'TBM',
  'Table Clearing & Maintenance',
  'Table Maintenance',
  4.8,
  'customer_experience',
  'Keeping the table in fine-dining condition through the meal, measured on the five-minute clearing standard.',
  [
    { text: 'Time the guest finished the plate', type: 'clock', weight: 0, key: 't_finished' },
    { text: 'Time the plate was cleared', type: 'clock', weight: 0, key: 't_cleared' },
    { text: 'Plate-clearing time (minutes)', type: 'time', weight: 3, threshold: 5, from: 't_finished', to: 't_cleared', kpi: ['plate_clearing_time'], guidance: 'Calculated. House standard: finished plates cleared within 5 minutes.' },
    { text: 'Did the waiter clear finished plates within 5 minutes?', type: 'yes_no', weight: 3 },
    { text: 'Were finished plates removed without the guest having to request it?', type: 'yes_no', weight: 3 },
    { text: 'Were empty or unnecessary items removed promptly?', type: 'yes_no', weight: 2 },
    { text: 'Was the table kept clean throughout the meal?', type: 'rating_5', weight: 3, tag: 'cleanliness' },
    { text: 'Did the waiter maintain the table professionally throughout the visit?', type: 'rating_5', weight: 2 },
    { text: 'Were tissues / napkins replaced when needed?', type: 'yes_no', weight: 2, na: true },
    { text: 'Was the bread basket monitored and replenished when needed?', type: 'yes_no', weight: 2, na: true },
  ],
)

// ── 19 · Supervisor / Manager Interaction — 3% → 2.9 ────────────────────────

const SUPERVISOR: SectionBlueprint = stage(
  'SUP',
  'Supervisor / Manager Interaction',
  'Supervisor Interaction',
  2.9,
  'customer_experience',
  'Whether a manager came to the table, and what they asked when they did.',
  [
    { text: 'Did the supervisor or manager visit the table?', type: 'yes_no', weight: 3 },
    { text: 'Did the supervisor ask how the food was?', type: 'yes_no', weight: 2 },
    { text: 'Did the supervisor ask whether the guest was satisfied?', type: 'yes_no', weight: 2 },
    { text: 'Did the supervisor ask about the service?', type: 'yes_no', weight: 2 },
    { text: 'Was the supervisor professional and friendly?', type: 'rating_5', weight: 3, na: true },
    { text: 'Did the supervisor show genuine interest in the guest experience?', type: 'rating_5', weight: 2, na: true },
  ],
)

// ── 20 · Complaint Handling — conditional, 5% when a complaint occurs ───────

const COMPLAINT: SectionBlueprint = stage(
  'CMP',
  'Complaint Handling',
  'Complaint Resolution',
  5,
  'customer_experience',
  'Scored only on a visit where a complaint was raised. On every other visit the stage is excluded and the remaining stages carry the full score.',
  [
    { text: 'Was a complaint or problem raised during the visit?', type: 'yes_no', weight: 0, key: 'had_complaint', guidance: 'Answer No if nothing went wrong. The rest of this stage is asked only if a complaint was raised, and is left out of the score entirely when it was not.' },
    { text: 'Time the complaint was raised', type: 'clock', weight: 0, key: 't_complaint', when: { key: 'had_complaint', equals: true } },
    { text: 'Time the solution was provided', type: 'clock', weight: 0, key: 't_solution', when: { key: 'had_complaint', equals: true } },
    { text: 'Complaint resolution time (minutes)', type: 'time', weight: 3, threshold: 10, from: 't_complaint', to: 't_solution', kpi: ['complaint_resolution_time'], when: { key: 'had_complaint', equals: true }, guidance: 'Calculated. Standard: a resolution within 10 minutes of the complaint being made.' },
    { text: 'Did the staff listen carefully?', type: 'yes_no', weight: 3, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    { text: 'Did the staff understand the complaint?', type: 'yes_no', weight: 3, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    { text: 'Did the staff apologise appropriately?', type: 'yes_no', weight: 3, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    { text: 'Did the staff take ownership?', type: 'yes_no', weight: 3, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    { text: 'Did the staff provide a solution?', type: 'yes_no', weight: 3, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    { text: 'How was the complaint handled?', type: 'multiple_choice', weight: 3, options: PROBLEM_SOLVING_OPTIONS, when: { key: 'had_complaint', equals: true }, tag: 'problem_solving', kpi: ['complaint_resolution'] },
    { text: 'Was the complaint solved within a reasonable time?', type: 'yes_no', weight: 2, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    { text: 'Was the guest satisfied with the solution?', type: 'yes_no', weight: 3, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    { text: 'Did the supervisor / manager become involved when needed?', type: 'yes_no', weight: 2, na: true, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
  ],
)

// ── 21 · Loyalty Program — 2% → 1.9 ─────────────────────────────────────────

const LOYALTY: SectionBlueprint = stage(
  'LOY',
  'Loyalty Programme',
  'Loyalty Program Awareness',
  1.9,
  'upselling_sales',
  'Whether the programme is visible in the restaurant and whether staff actually raise it.',
  [
    { text: 'Was the loyalty programme visibly displayed?', type: 'yes_no', weight: 2, kpi: ['loyalty'] },
    { text: 'Was loyalty information displayed on the table?', type: 'yes_no', weight: 2, kpi: ['loyalty'] },
    { text: 'Was loyalty information displayed elsewhere in the restaurant?', type: 'yes_no', weight: 1, kpi: ['loyalty'] },
    { text: 'Did the waiter inform the guest about the loyalty programme?', type: 'yes_no', weight: 3, kpi: ['loyalty'] },
    { text: 'Did the waiter explain how the loyalty programme works?', type: 'yes_no', weight: 2, kpi: ['loyalty'] },
    { text: 'Did the waiter invite or encourage the guest to join or use the loyalty programme?', type: 'yes_no', weight: 3, kpi: ['loyalty'] },
  ],
)

// ── 22 · Restroom Cleanliness — 5% → 4.8 ────────────────────────────────────

const RESTROOM: SectionBlueprint = stage(
  'WC',
  'Toilet / Restroom Cleanliness',
  'Restroom Cleanliness',
  4.8,
  'safety_entertainment',
  'A full restroom inspection against the fine-dining standard. Photograph anything that falls short.',
  [
    { text: 'Was the restroom clean?', type: 'yes_no', weight: 3, evidence: true, tag: 'washroom', kpi: ['restroom'] },
    { text: 'Was the toilet bowl clean?', type: 'yes_no', weight: 3, kpi: ['restroom'] },
    { text: 'Was the toilet seat clean?', type: 'yes_no', weight: 3, kpi: ['restroom'] },
    { text: 'Was the toilet floor clean?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: 'Was the floor dry?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: 'Was the washbasin clean?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: 'Was the mirror clean?', type: 'yes_no', weight: 1, kpi: ['restroom'] },
    { text: 'Was hand soap available?', type: 'yes_no', weight: 3, tag: 'hand_hygiene', kpi: ['restroom'] },
    { text: 'Was the soap dispenser adequately filled?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: 'Was hand sanitiser available, where applicable?', type: 'yes_no', weight: 1, na: true, kpi: ['restroom'] },
    { text: 'Was the hand sanitiser adequately filled?', type: 'yes_no', weight: 1, na: true, kpi: ['restroom'] },
    { text: 'Was toilet tissue available?', type: 'yes_no', weight: 3, kpi: ['restroom'] },
    { text: 'Was hand tissue / paper towel available?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: 'Was the tissue roll adequately stocked?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: 'Was the exhaust fan clean?', type: 'yes_no', weight: 1, kpi: ['restroom'] },
    { text: 'Was the exhaust fan operational?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: 'Was the restroom free from bad or unpleasant smells?', type: 'yes_no', weight: 3, tag: 'hygiene', kpi: ['restroom'] },
    { text: 'Were the restroom lights operational?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: 'Was the waste bin clean?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: 'Was the waste bin free from overflowing?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: 'Was the restroom overall suitable for a fine-dining restaurant?', type: 'rating_5', weight: 3, kpi: ['restroom'] },
  ],
)

// ── 23–27 · Billing, Payment & Farewell — 8% → 7.6 ──────────────────────────

const CLOSING: SectionBlueprint = stage(
  'BPF',
  'Billing, Payment & Farewell',
  'Billing, Payment & Farewell',
  7.6,
  'operational_compliance',
  'From the moment the bill is asked for to the door closing behind the guest. Cash handling is asked only when the bill was settled in cash.',
  [
    { text: 'Time the bill was requested', type: 'clock', weight: 0, key: 't_bill_req' },
    { text: 'Time the bill was received', type: 'clock', weight: 0, key: 't_bill_rec' },
    { text: 'Bill delivery time (minutes)', type: 'time', weight: 3, threshold: 5, from: 't_bill_req', to: 't_bill_rec', kpi: ['bill_delivery_time'], guidance: 'Calculated. Standard: the bill in the guest’s hands within 5 minutes of asking.' },
    { text: 'Was the staff attentive when the guest requested the bill?', type: 'yes_no', weight: 2, kpi: ['billing_payment'] },
    { text: 'Did the waiter acknowledge the bill request immediately?', type: 'yes_no', weight: 2, kpi: ['billing_payment'] },
    { text: 'Was the bill delivered promptly?', type: 'yes_no', weight: 2, kpi: ['billing_payment'] },
    { text: 'Was the bill folder clean?', type: 'yes_no', weight: 2, kpi: ['billing_payment'] },
    { text: 'Was the bill folder in good condition?', type: 'yes_no', weight: 1, kpi: ['billing_payment'] },
    { text: 'Was the bill folder free from damage?', type: 'yes_no', weight: 1, kpi: ['billing_payment'] },
    { text: 'Was the bill clearly presented?', type: 'yes_no', weight: 2, kpi: ['billing_payment'] },
    { text: 'Was the bill accurate?', type: 'pass_fail', weight: 3, evidence: true, tag: 'billing', kpi: ['billing_payment'], guidance: 'Photograph the bill. Check every line against what was ordered; an overcharge is a High finding.' },
    { text: 'Were all ordered items correctly charged?', type: 'yes_no', weight: 3, kpi: ['billing_payment'] },
    { text: 'Was the bill easy to review?', type: 'yes_no', weight: 1, kpi: ['billing_payment'] },
    { text: 'Was the bill settled in cash?', type: 'yes_no', weight: 0, key: 'paid_cash', guidance: 'The next four questions are asked only when the answer is Yes.' },
    { text: 'Did the staff repeat or confirm the amount of cash received?', type: 'yes_no', weight: 2, when: { key: 'paid_cash', equals: true }, kpi: ['billing_payment'] },
    { text: 'Did the staff clearly state the amount received?', type: 'yes_no', weight: 2, when: { key: 'paid_cash', equals: true }, kpi: ['billing_payment'] },
    { text: 'Did the staff return the correct change?', type: 'pass_fail', weight: 3, when: { key: 'paid_cash', equals: true }, kpi: ['billing_payment'] },
    { text: 'Was the change returned promptly?', type: 'yes_no', weight: 2, when: { key: 'paid_cash', equals: true }, kpi: ['billing_payment'] },
    { text: 'Was the payment handled professionally?', type: 'rating_5', weight: 2, kpi: ['billing_payment'] },
    { text: 'Was the payment process efficient?', type: 'yes_no', weight: 2, kpi: ['billing_payment'] },
    { text: 'Was the payment process smooth?', type: 'yes_no', weight: 2, kpi: ['billing_payment'] },
    { text: 'Was the receipt provided?', type: 'yes_no', weight: 3, kpi: ['billing_payment'] },
    { text: 'Did the waiter or cashier thank the guest after payment?', type: 'yes_no', weight: 2, kpi: ['billing_payment', 'farewell'] },
    { text: 'Did the waiter thank the guest when leaving?', type: 'yes_no', weight: 2, kpi: ['farewell'] },
    { text: 'Did restaurant staff thank the guest upon departure?', type: 'yes_no', weight: 2, kpi: ['farewell'] },
    { text: 'Did the hostess thank the guest when leaving?', type: 'yes_no', weight: 2, kpi: ['farewell'] },
    { text: 'Did the hostess open the door for the guest?', type: 'yes_no', weight: 2, kpi: ['farewell'] },
    { text: 'Was the farewell warm?', type: 'rating_5', weight: 2, kpi: ['farewell'] },
    { text: 'Was the farewell professional?', type: 'rating_5', weight: 2, kpi: ['farewell'] },
    { text: 'Did staff invite the guest to return?', type: 'yes_no', weight: 2, kpi: ['farewell'] },
    { text: 'Did the final interaction leave a positive impression?', type: 'rating_5', weight: 3, kpi: ['farewell'] },
  ],
)

// ── 28 · Overall Experience — unweighted, feeds the satisfaction KPIs ───────

const OVERALL: SectionBlueprint = stage(
  'OVR',
  'Overall Experience',
  'Guest Satisfaction',
  0,
  'customer_experience',
  'The shopper’s own verdict. Not weighted; it carries CSAT, NPS, likelihood to return and the three open questions.',
  [
    { text: 'Rate the overall service quality', type: 'rating_5', weight: 0 },
    { text: 'Rate the overall food quality', type: 'rating_5', weight: 0 },
    { text: 'Rate the food presentation', type: 'rating_5', weight: 0 },
    { text: 'Rate staff professionalism', type: 'rating_5', weight: 0 },
    { text: 'Rate staff attentiveness', type: 'rating_5', weight: 0 },
    { text: 'Rate restaurant cleanliness', type: 'rating_5', weight: 0 },
    { text: 'Rate the ambience', type: 'rating_5', weight: 0 },
    { text: 'Rate value for money', type: 'rating_5', weight: 0 },
    { text: 'Rate the overall fine-dining experience (1-10)', type: 'rating_10', weight: 0, kpi: ['csat'], guidance: '1 = extremely dissatisfied, 10 = extremely satisfied.' },
    { text: 'How likely are you to return? (1-10)', type: 'rating_10', weight: 0, kpi: ['return_likelihood'] },
    { text: 'How likely are you to recommend Shebestan Palace to a friend, family member or colleague? (1-10)', type: 'rating_10', weight: 0, kpi: ['nps'], guidance: 'Net Promoter question. 9-10 promoter, 7-8 passive, 1-6 detractor.' },
    { text: 'What did you like most?', type: 'text', weight: 0 },
    { text: 'What did you dislike?', type: 'text', weight: 0 },
    { text: 'What should be improved?', type: 'text', weight: 0 },
    { text: 'Additional comments', type: 'text', weight: 0 },
  ],
)

export const SHEBESTAN_STAGES: SectionBlueprint[] = [
  PROOF,
  EXTERIOR,
  HOSTESS,
  TABLE_SETUP,
  AMBIENCE,
  WELCOME,
  WAITER,
  MENU_KNOWLEDGE,
  ORDER_ACCURACY,
  DELIVERY,
  FOOD_QUALITY,
  PLATE,
  TABLE_MAINTENANCE,
  SUPERVISOR,
  COMPLAINT,
  LOYALTY,
  RESTROOM,
  CLOSING,
  OVERALL,
]

const SHEBESTAN_SEQUENCE: ServiceSequence = {
  industry: 'Food & Beverage',
  serviceModel: 'Fine Dining Restaurant',
  visitMode: 'Dine-in',
  // The dashboard the brief specifies, in its order. The overall mystery shopping
  // score is the visit score itself and is reported in the header, not here.
  mainKpis: [
    { key: 'food_quality', label: 'Food Quality Score', kind: 'weighted' },
    { key: 'service', label: 'Service Score', kind: 'weighted' },
    { key: 'attentiveness', label: 'Staff Attentiveness Score', kind: 'weighted' },
    { key: 'hostess', label: 'Hostess Score', kind: 'weighted' },
    { key: 'menu_knowledge', label: 'Menu Knowledge Score', kind: 'weighted' },
    { key: 'upselling', label: 'Upselling Score', kind: 'weighted' },
    { key: 'order_accuracy', label: 'Order Accuracy Score', kind: 'weighted' },
    { key: 'main_course_time', label: 'Food Delivery Speed', kind: 'timing' },
    { key: 'grilled_time', label: 'Grilled Items Delivery Time', kind: 'timing' },
    { key: 'plate_clearing_time', label: 'Table Clearing Time', kind: 'timing' },
    { key: 'restroom', label: 'Restroom Cleanliness Score', kind: 'weighted' },
    { key: 'complaint_resolution', label: 'Complaint Resolution Score', kind: 'weighted' },
    { key: 'loyalty', label: 'Loyalty Programme Awareness', kind: 'weighted' },
    { key: 'billing_payment', label: 'Billing & Payment Score', kind: 'weighted' },
    { key: 'farewell', label: 'Farewell Score', kind: 'weighted' },
    { key: 'csat', label: 'Customer Satisfaction (CSAT)', kind: 'satisfaction' },
    { key: 'nps', label: 'Net Promoter Score (NPS)', kind: 'satisfaction' },
    { key: 'return_likelihood', label: 'Likelihood to Return', kind: 'satisfaction' },
    { key: 'greeting_time', label: 'Greeting Time', kind: 'timing' },
    { key: 'seating_time', label: 'Seating Time', kind: 'timing' },
    { key: 'waiter_approach_time', label: 'Waiter Approach Time', kind: 'timing' },
    { key: 'starter_time', label: 'Starter Delivery Time', kind: 'timing' },
    { key: 'bill_delivery_time', label: 'Bill Delivery Time', kind: 'timing' },
    { key: 'complaint_resolution_time', label: 'Complaint Resolution Time', kind: 'timing' },
  ],
  criticalFailures: CRITICAL_FAILURES_DINING,
}

export const SHEBESTAN_TEMPLATE: TemplateBlueprint = {
  id: 'tpl-shebestan-fine-dining',
  code: 'SHEBESTAN_FINE_DINING',
  name: 'Shebestan Palace — Fine Dining Framework',
  description:
    'The brand’s own service journey: arrival and hostess welcome, the complimentary yogurt, greens and six-piece bread basket, waiter conduct and menu knowledge, measured delivery of starters, mains and grilled items, food quality and cooking, plate standards, table maintenance, manager interaction, conditional complaint handling, loyalty, restroom inspection and the billing-to-farewell close.',
  segment: 'F&B',
  journey: 'In-store / Dine-in',
  isFollowUp: false,
  sections: SHEBESTAN_STAGES,
  sequence: SHEBESTAN_SEQUENCE,
  // The brief: every No and every Average or Poor rating must be explained.
  commentOnFail: true,
}
