import type { ServiceSequence } from '@/types'
import { PROBLEM_SOLVING_OPTIONS, QUALITY_SCALE, type SectionBlueprint, type TemplateBlueprint, stage } from './templateKit'

/**
 * PIZZAHUT_FOOD_COURT — Pizza Hut, Doha Festival City.
 *
 * A brand framework rather than a reusable sequence: the client supplied the
 * counter journey, the standards, the timing chain and the KPI weighting, and
 * this is that document expressed as a questionnaire. The brief is explicit
 * that this is a food-court flow and not a dine-in restaurant one, so there is
 * nothing here about seating, table service or mall ambience — only what Pizza
 * Hut controls at its own counter.
 *
 * Four things about the shape, all of them from the brief:
 *
 * 1. The brief weights seven KPI *areas*, not its fifteen questionnaire
 *    sections, and they sum to exactly 100. Keeping the sections as stages in
 *    the guest's order would scramble them — Speed of Service spans the queue
 *    at the start and the preparation wait at the end. So the sections stay in
 *    journey order and each area's weight is split across the stages that make
 *    it up, so every area still totals the figure the client wrote:
 *
 *      Food Quality 30              = BEV 6  + FQ 24
 *      Speed of Service 20          = QUE 7  + PRP 13
 *      Cashier Service 20           = CSH 10 + MNK 5 + PAY 5
 *      Upselling 10                 = UPS 10
 *      Order Accuracy & Handover 10 = HND 10
 *      Loyalty / Promotions 5       = LOY 5
 *      Cleanliness & Presentation 5 = PKG 3  + CLN 2
 *
 * 2. The timing chain is the engine's own: queue → order → preparation, each
 *    leg calculated from two wall-clock stamps, and total service time derived
 *    as their sum — which is exactly the brief's "joining the queue to
 *    receiving the order".
 *
 * 3. Two criticals fire only when something was left uncorrected, as the brief
 *    words them: a wrong order is critical when it was not put right, and the
 *    payment critical covers an incorrect amount or change not corrected.
 *
 * 4. Every No and every Average or Poor rating must be explained, so the
 *    template sets `commentOnFail` for the whole questionnaire. Cash and card
 *    questions appear only for the payment method used; complaint questions
 *    only when a complaint occurred.
 *
 * The brief sets no numeric standards. Queue 5 minutes, cashier transaction 3
 * and preparation 10 are defaults, not the client's, and are the numbers that
 * decide whether a timing KPI reads met or missed.
 */

// ── Timing stamps ───────────────────────────────────────────────────────────
// Each clock question carries a local key; a duration names two of them. Keys
// are unique across the template, so a stage can time against an earlier stamp.

const PROOF: SectionBlueprint = stage(
  'PRF',
  'Visit Information & Evidence',
  'Visit Verification',
  0,
  'operational_compliance',
  'The visit record and its proof. Recorded for context and evidence; not scored.',
  [
    { text: 'Time in (arrived at the outlet)', type: 'clock', weight: 0, key: 't_in' },
    { text: 'Time out (left the outlet)', type: 'clock', weight: 0, key: 't_out' },
    { text: 'Total visit duration (minutes)', type: 'time', weight: 0, from: 't_in', to: 't_out', kpi: ['visit_duration'], guidance: 'Calculated from the two stamps above.' },
    { text: 'Confirm the branch assessed', type: 'yes_no', weight: 0, guidance: 'Pizza Hut, Doha Festival City Mall food court.' },
    { text: 'Number of guests in your party', type: 'numeric', weight: 0 },
    {
      text: 'Approximate outlet and queue occupancy on arrival',
      type: 'multiple_choice',
      weight: 0,
      options: ['0-25%', '26-50%', '51-75%', '76-100%'],
      guidance: 'Recorded for context. A queue time is read differently at a quiet counter than at a full one.',
    },
    { text: 'Items ordered', type: 'text', weight: 0, guidance: 'List everything ordered: pizza with size and crust, sides, drinks and desserts.' },
    { text: 'Total bill amount (QAR)', type: 'numeric', weight: 0 },
    { text: 'Cashier name', type: 'text', weight: 0, guidance: 'Read it from the name badge. If no badge is visible, give a brief description instead so the branch can identify them.' },
    { text: 'Order number / receipt number', type: 'text', weight: 0 },
    { text: 'Photograph of the Pizza Hut counter and signage', type: 'photo', weight: 0, guidance: 'Proof of visit, with the date, exact time and location stamp visible where the client requires it.' },
    { text: 'Photograph of the receipt', type: 'photo', weight: 0 },
    { text: 'Photographs of the food before eating', type: 'photo', weight: 0, guidance: 'Both the closed packaging as handed over and the food with the box opened.' },
  ],
)

// ── 1 · Queue & Counter Access — 7% (Speed of Service) ──────────────────────

const QUEUE: SectionBlueprint = stage(
  'QUE',
  'Queue & Counter Access',
  'Queue Experience',
  7,
  'service_speed',
  'Finding the counter and the wait to be served. The first leg of the timing chain.',
  [
    { text: 'Was the Pizza Hut counter clearly identifiable and easy to locate?', type: 'yes_no', weight: 2 },
    { text: 'Was the queue area organised?', type: 'yes_no', weight: 2 },
    { text: 'How many customers were waiting when you joined the queue?', type: 'numeric', weight: 0 },
    { text: 'Time you joined the queue', type: 'clock', weight: 0, key: 't_queue' },
    { text: 'Time you reached the cashier', type: 'clock', weight: 0, key: 't_cashier' },
    {
      text: 'Queue waiting time (minutes)',
      type: 'time',
      weight: 3,
      threshold: 5,
      from: 't_queue',
      to: 't_cashier',
      timing: 'queue',
      tag: 'time_queue',
      guidance: 'Calculated from the stamps. Standard: at the cashier within 5 minutes of joining the queue.',
    },
  ],
)

// ── 2 · Cashier Greeting & Order Taking — 10% (Cashier Service) ─────────────

const CASHIER: SectionBlueprint = stage(
  'CSH',
  'Cashier Greeting & Order Taking',
  'Cashier Service',
  10,
  'customer_experience',
  'The brief’s primary focus: how the cashier greeted, listened, captured the order and closed the transaction.',
  [
    { text: 'Did the cashier acknowledge or greet you when it was your turn?', type: 'yes_no', weight: 3, tag: 'greet_30s', kpi: ['cashier_service'] },
    { text: 'Was the cashier friendly, polite and professional?', type: 'rating_5', weight: 3, kpi: ['cashier_service'], guidance: '1 = indifferent or abrupt, 5 = warm, attentive and professional throughout.' },
    { text: 'Was the cashier well groomed and wearing the correct uniform?', type: 'yes_no', weight: 2, kpi: ['cashier_service'] },
    { text: 'Was the cashier’s name badge visible?', type: 'yes_no', weight: 1, na: true, kpi: ['cashier_service'], guidance: 'N/A where the brand does not require a badge.' },
    { text: 'Did the cashier maintain appropriate eye contact and body language?', type: 'yes_no', weight: 2, kpi: ['cashier_service'] },
    { text: 'Did the cashier listen carefully to your order?', type: 'yes_no', weight: 3, kpi: ['cashier_service'] },
    { text: 'Did the cashier take the order efficiently without unnecessary delay?', type: 'yes_no', weight: 2, kpi: ['cashier_service'] },
    { text: 'Did the cashier repeat the order back to confirm accuracy?', type: 'yes_no', weight: 3, tag: 'order_accuracy', kpi: ['order_accuracy'] },
    { text: 'Did you request a modification to any item?', type: 'yes_no', weight: 0, key: 'ord_mod', guidance: 'Informational — gates the next question.' },
    { text: 'Did the cashier confirm the requested modification?', type: 'yes_no', weight: 2, when: { key: 'ord_mod', equals: true }, kpi: ['order_accuracy'] },
    { text: 'Did the cashier clearly state the total amount due?', type: 'yes_no', weight: 2, kpi: ['cashier_service'] },
    { text: 'Time the payment and order entry were completed', type: 'clock', weight: 0, key: 't_paid' },
    {
      text: 'Cashier transaction time (minutes)',
      type: 'time',
      weight: 3,
      threshold: 3,
      from: 't_cashier',
      to: 't_paid',
      timing: 'order',
      tag: 'time_order',
      guidance: 'Calculated from the stamps. Standard: from reaching the cashier to payment completed within 3 minutes.',
    },
    {
      text: 'Was all staff conduct free from rude, disrespectful or inappropriate behaviour?',
      type: 'yes_no',
      weight: 3,
      critical: true,
      comment: true,
      kpi: ['cashier_service'],
      guidance: 'A critical failure. Answer No for rude, disrespectful or inappropriate behaviour by any member of staff, and describe exactly what was said or done.',
    },
  ],
)

// ── 3 · Menu Knowledge & Product Guidance — 5% (Cashier Service) ────────────

const MENU_KNOWLEDGE: SectionBlueprint = stage(
  'MNK',
  'Menu Knowledge & Product Guidance',
  'Menu Knowledge',
  5,
  'customer_experience',
  'What the cashier knew about the menu, and whether they guided the order sensibly.',
  [
    {
      text: 'Did the cashier demonstrate good knowledge of Pizza Hut menu items?',
      type: 'rating_5',
      weight: 3,
      kpi: ['menu_knowledge'],
      guidance: 'Ask a direct question — what is on a named pizza, or the difference between two crusts. 1 = could not answer, 5 = confident and accurate.',
    },
    { text: 'Could the cashier explain the available pizza sizes, crusts and meal options correctly?', type: 'yes_no', weight: 3, kpi: ['menu_knowledge'] },
    { text: 'Could the cashier answer a simple menu question confidently?', type: 'yes_no', weight: 2, kpi: ['menu_knowledge'] },
    { text: 'Did the cashier clearly explain any unavailable item or substitution?', type: 'yes_no', weight: 2, na: true, kpi: ['menu_knowledge'], guidance: 'N/A where everything you asked for was available.' },
    { text: 'Did the cashier guide you to the most suitable meal or deal?', type: 'yes_no', weight: 2, na: true, kpi: ['menu_knowledge'] },
  ],
)

// ── 4 · Upselling & Suggestive Selling — 10% ────────────────────────────────

const UPSELL: SectionBlueprint = stage(
  'UPS',
  'Upselling & Suggestive Selling',
  'Upselling',
  10,
  'upselling_sales',
  'Whether the cashier grew the order, and whether it felt like service rather than pressure.',
  [
    { text: 'Did the cashier attempt to upsell or suggest additional items?', type: 'yes_no', weight: 3, tag: 'upsell', kpi: ['upselling'] },
    { text: 'Did the cashier suggest upgrading the meal or pizza size?', type: 'yes_no', weight: 2, kpi: ['upselling'] },
    { text: 'Did the cashier suggest a drink?', type: 'yes_no', weight: 2, na: true, kpi: ['upselling'], guidance: 'N/A where you had already ordered a drink unprompted.' },
    { text: 'Did the cashier suggest a side item such as garlic bread, wings or fries?', type: 'yes_no', weight: 2, tag: 'cross_sell', kpi: ['upselling'] },
    { text: 'Did the cashier suggest a dessert?', type: 'yes_no', weight: 2, na: true, kpi: ['upselling'] },
    { text: 'Did the cashier mention a meal deal or better-value combination?', type: 'yes_no', weight: 2, kpi: ['upselling'] },
    { text: 'Was the upselling relevant to the order?', type: 'rating_5', weight: 2, na: true, kpi: ['upselling'] },
    { text: 'Was the upselling natural and helpful rather than aggressive or pushy?', type: 'rating_5', weight: 2, na: true, kpi: ['upselling'] },
  ],
)

// ── 5 · Loyalty Programme, Offers & Promotions — 5% ─────────────────────────

const LOYALTY: SectionBlueprint = stage(
  'LOY',
  'Loyalty Programme, Offers & Promotions',
  'Loyalty / Promotion Communication',
  5,
  'upselling_sales',
  'What was on display at the counter, and what the cashier actually said about it.',
  [
    { text: 'Was the loyalty programme visibly displayed at the counter, menu area or POS?', type: 'yes_no', weight: 3, evidence: true, tag: 'promotions', kpi: ['loyalty'] },
    { text: 'Were the current offers and promotions clearly displayed?', type: 'yes_no', weight: 2, kpi: ['loyalty'] },
    { text: 'Did the cashier mention an applicable promotion or value deal?', type: 'yes_no', weight: 3, kpi: ['loyalty'] },
    { text: 'Did the cashier mention the loyalty programme?', type: 'yes_no', weight: 3, kpi: ['loyalty'] },
    { text: 'Did the cashier explain how the loyalty programme works when asked?', type: 'yes_no', weight: 2, na: true, kpi: ['loyalty'] },
    { text: 'Did the cashier encourage you to join or use the loyalty programme?', type: 'yes_no', weight: 2, na: true, kpi: ['loyalty'] },
    { text: 'Were the loyalty and promotional materials clean, current and easy to understand?', type: 'yes_no', weight: 2, kpi: ['loyalty'] },
  ],
)

// ── 6 · Payment Experience — 5% (Cashier Service) ───────────────────────────

const PAYMENT: SectionBlueprint = stage(
  'PAY',
  'Payment Experience',
  'Transaction Accuracy',
  5,
  'operational_compliance',
  'The transaction itself. The cash and card questions are asked only for the method actually used.',
  [
    { text: 'Was the payment process smooth and efficient?', type: 'rating_5', weight: 2, kpi: ['cashier_service'] },
    {
      text: 'Was the amount charged correct, or any error corrected before you left?',
      type: 'yes_no',
      weight: 3,
      critical: true,
      evidence: true,
      comment: true,
      tag: 'billing',
      guidance: 'A critical failure. Photograph the receipt and check it against what you ordered. Answer No only where an incorrect amount or incorrect change was left uncorrected.',
    },
    {
      text: 'How did you pay?',
      type: 'multiple_choice',
      weight: 0,
      key: 'pay_method',
      options: ['Cash', 'Card'],
      guidance: 'Informational — gates the cash and card questions below.',
    },
    { text: 'Did the cashier confirm the amount of cash received?', type: 'yes_no', weight: 2, when: { key: 'pay_method', equals: 'Cash' } },
    { text: 'Was the correct change returned?', type: 'yes_no', weight: 3, comment: true, when: { key: 'pay_method', equals: 'Cash' } },
    { text: 'Was the card transaction completed correctly and without difficulty?', type: 'yes_no', weight: 2, when: { key: 'pay_method', equals: 'Card' } },
    { text: 'Was a receipt provided or offered?', type: 'yes_no', weight: 3 },
    { text: 'Did the cashier thank you after payment?', type: 'yes_no', weight: 2, kpi: ['cashier_service'] },
  ],
)

// ── 7 · Preparation & Service Speed — 13% (Speed of Service) ────────────────

const PREPARATION: SectionBlueprint = stage(
  'PRP',
  'Preparation & Service Speed',
  'Speed of Service',
  13,
  'service_speed',
  'From payment to the order being ready. The third leg of the timing chain, and the one the guest feels most.',
  [
    { text: 'Time the order was ready for collection', type: 'clock', weight: 0, key: 't_ready' },
    {
      text: 'Preparation time (minutes)',
      type: 'time',
      weight: 3,
      threshold: 10,
      from: 't_paid',
      to: 't_ready',
      timing: 'preparation',
      tag: 'time_receive',
      guidance: 'Calculated from the stamps. Standard: ready within 10 minutes of payment.',
    },
    { text: 'Was the preparation time reasonable for the items ordered?', type: 'yes_no', weight: 3 },
    { text: 'Was the order ready within the promised or expected time?', type: 'yes_no', weight: 3 },
    { text: 'Was there a delay?', type: 'yes_no', weight: 0, key: 'had_delay', guidance: 'Informational — gates the next question.' },
    { text: 'Did staff explain the reason for the delay?', type: 'yes_no', weight: 3, when: { key: 'had_delay', equals: true } },
    { text: 'Did staff appear organised and coordinated during preparation and handover?', type: 'rating_5', weight: 3 },
    {
      text: 'Was the visit free from any major unexplained service delay?',
      type: 'yes_no',
      weight: 3,
      critical: true,
      comment: true,
      guidance: 'A critical failure. Answer No for a wait far beyond the standard with no explanation offered, and record how long it was.',
    },
  ],
)

// ── 8 · Order Handover & Accuracy — 10% ─────────────────────────────────────

const HANDOVER: SectionBlueprint = stage(
  'HND',
  'Order Handover & Accuracy',
  'Order Accuracy & Handover',
  10,
  'operational_compliance',
  'What was actually handed over, checked item by item against what was ordered.',
  [
    { text: 'Was the order number or name called clearly?', type: 'yes_no', weight: 2, kpi: ['order_accuracy'] },
    { text: 'Was the complete order handed over together?', type: 'yes_no', weight: 3, kpi: ['order_accuracy'] },
    { text: 'Did staff verify the order before handover?', type: 'yes_no', weight: 2, kpi: ['order_accuracy'] },
    { text: 'Did you receive exactly what you ordered?', type: 'yes_no', weight: 3, key: 'order_right', kpi: ['order_accuracy'] },
    {
      text: 'Was the error corrected when you raised it?',
      type: 'yes_no',
      weight: 3,
      critical: true,
      comment: true,
      when: { key: 'order_right', equals: false },
      kpi: ['order_accuracy'],
      guidance: 'A critical failure. The brief flags a wrong order only where it was not put right — record what was wrong and what the staff did about it.',
    },
    { text: 'Were all requested modifications correct?', type: 'yes_no', weight: 2, na: true, kpi: ['order_accuracy'] },
    { text: 'Were all side items included?', type: 'yes_no', weight: 2, na: true, kpi: ['order_accuracy'] },
    { text: 'Were the correct sauces and condiments included?', type: 'yes_no', weight: 2, na: true, kpi: ['order_accuracy'] },
    { text: 'Were napkins and cutlery provided?', type: 'yes_no', weight: 2, na: true },
    { text: 'Was the drink included and correct?', type: 'yes_no', weight: 2, na: true, kpi: ['order_accuracy'] },
    { text: 'Was the packaging clean and properly closed at handover?', type: 'yes_no', weight: 2, kpi: ['packaging'] },
    { text: 'Did the staff member thank you during handover?', type: 'yes_no', weight: 2 },
  ],
)

// ── 9 · Beverage Quality — 6% (Food Quality) ────────────────────────────────

const BEVERAGE: SectionBlueprint = stage(
  'BEV',
  'Beverage Quality',
  'Beverage Quality',
  6,
  'product_environment',
  'The drink as handed over: correct, cold, carbonated and sealed.',
  [
    { text: 'Was the beverage the correct item and size?', type: 'yes_no', weight: 3, kpi: ['beverage_quality'] },
    { text: 'Was the beverage served cold where applicable?', type: 'yes_no', weight: 3, na: true, tag: 'temperature', kpi: ['beverage_quality'] },
    { text: 'For a carbonated soft drink, was the carbonation level satisfactory?', type: 'yes_no', weight: 2, na: true, kpi: ['beverage_quality'], guidance: 'N/A for a drink that is not carbonated. A flat soft drink is a No.' },
    { text: 'Was the cup, can or bottle clean and in good condition?', type: 'yes_no', weight: 2, kpi: ['beverage_quality'] },
    { text: 'Was the beverage sealed or covered appropriately?', type: 'yes_no', weight: 2, na: true, kpi: ['beverage_quality'] },
    { text: 'Beverage taste — fresh and correct', type: 'multiple_choice', weight: 3, options: QUALITY_SCALE, kpi: ['beverage_quality'] },
  ],
)

// ── 10 · Pizza & Food Quality — 24% (Food Quality) ──────────────────────────
// The brief's heaviest area by a wide margin, and the reason for the visit.

const FOOD_QUALITY: SectionBlueprint = stage(
  'FQ',
  'Pizza & Food Quality',
  'Food Quality',
  24,
  'product_environment',
  'The product itself, opened and assessed: temperature, crust, base, cheese, toppings, cut, taste and seasoning.',
  [
    { text: 'Was the food served at the correct temperature?', type: 'yes_no', weight: 3, tag: 'temperature', kpi: ['food_quality'] },
    { text: 'Was the pizza hot when first opened?', type: 'yes_no', weight: 3, kpi: ['food_quality'] },
    { text: 'Did the pizza appear freshly prepared?', type: 'yes_no', weight: 3, kpi: ['food_quality'] },
    { text: 'Was the crust cooked properly?', type: 'yes_no', weight: 3, kpi: ['food_quality'] },
    { text: 'Was the crust free from excessive burning?', type: 'yes_no', weight: 2, kpi: ['food_quality'] },
    { text: 'Was the base fully cooked and not undercooked or soggy?', type: 'yes_no', weight: 3, kpi: ['food_quality'] },
    { text: 'Was the cheese properly melted?', type: 'yes_no', weight: 2, kpi: ['food_quality'] },
    { text: 'Were the toppings distributed evenly?', type: 'yes_no', weight: 2, kpi: ['food_quality'] },
    { text: 'Was the topping quantity appropriate?', type: 'yes_no', weight: 2, kpi: ['food_quality'] },
    { text: 'Pizza appearance — visually appealing and appetizing', type: 'multiple_choice', weight: 2, options: QUALITY_SCALE, evidence: true, kpi: ['food_quality'], guidance: 'Photograph the pizza with the box open, before eating.' },
    { text: 'Was the pizza cut properly into even slices?', type: 'yes_no', weight: 2, na: true, kpi: ['food_quality'] },
    { text: 'Taste', type: 'multiple_choice', weight: 3, options: QUALITY_SCALE, kpi: ['food_quality'] },
    { text: 'Seasoning and flavour balance', type: 'multiple_choice', weight: 2, options: QUALITY_SCALE, kpi: ['food_quality'] },
    { text: 'Was the portion or size consistent with what was ordered?', type: 'yes_no', weight: 2, kpi: ['food_quality'] },
    { text: 'Were the side items served hot and fresh?', type: 'yes_no', weight: 2, na: true, kpi: ['food_quality'], guidance: 'N/A where no side items were ordered.' },
    { text: 'Were the side items cooked properly?', type: 'yes_no', weight: 2, na: true, kpi: ['food_quality'] },
    { text: 'Overall food quality', type: 'multiple_choice', weight: 3, options: QUALITY_SCALE, kpi: ['food_quality'] },
    {
      text: 'Was the food safe to eat — nothing badly undercooked and no foreign object?',
      type: 'yes_no',
      weight: 3,
      critical: true,
      evidence: true,
      comment: true,
      tag: 'food_integrity',
      kpi: ['food_quality'],
      guidance: 'A critical failure. Answer No for anything served clearly unsafe or badly undercooked, or any foreign object in the food. Photograph it and describe what you found.',
    },
  ],
)

// ── 11 · Packaging & Presentation — 3% (Cleanliness & Presentation) ─────────

const PACKAGING: SectionBlueprint = stage(
  'PKG',
  'Packaging & Presentation',
  'Packaging & Presentation',
  3,
  'product_environment',
  'The box and everything in it — the brand’s last physical impression on the guest.',
  [
    { text: 'Was the pizza box clean?', type: 'yes_no', weight: 3, evidence: true, kpi: ['packaging'] },
    { text: 'Was the box free from tears, crushing or damage?', type: 'yes_no', weight: 2, kpi: ['packaging'] },
    { text: 'Was the packaging free from excessive grease leakage?', type: 'yes_no', weight: 2, kpi: ['packaging'] },
    { text: 'Was the food arranged neatly inside the packaging?', type: 'yes_no', weight: 2, kpi: ['packaging'] },
    { text: 'Were all packaged items clean and presentable?', type: 'yes_no', weight: 2, kpi: ['packaging'] },
    { text: 'Were the labels and stickers correct?', type: 'yes_no', weight: 1, na: true, kpi: ['packaging'] },
    { text: 'Did the packaging protect the food adequately during handover?', type: 'yes_no', weight: 2, kpi: ['packaging'] },
  ],
)

// ── 12 · Counter & Visible Area Cleanliness — 2% (Cleanliness & Presentation)
// Only what Pizza Hut controls. The brief is explicit that shared food-court
// seating and mall facilities are not scored here.

const CLEANLINESS: SectionBlueprint = stage(
  'CLN',
  'Counter & Visible Area Cleanliness',
  'Counter Cleanliness',
  2,
  'safety_entertainment',
  'The counter, the POS and the visible preparation area — Pizza Hut’s own footprint, not the shared food court.',
  [
    { text: 'Was the Pizza Hut counter clean?', type: 'yes_no', weight: 3, evidence: true, tag: 'cleanliness', kpi: ['cleanliness'] },
    { text: 'Was the cashier and POS area clean and free from unnecessary clutter?', type: 'yes_no', weight: 2, kpi: ['cleanliness'] },
    { text: 'Were the digital and menu boards clean and operational?', type: 'yes_no', weight: 2, kpi: ['cleanliness'] },
    { text: 'Were the menu prices and visuals clearly visible?', type: 'yes_no', weight: 2, kpi: ['cleanliness'] },
    { text: 'Was the visible preparation area clean and organised?', type: 'yes_no', weight: 3, tag: 'hygiene', kpi: ['cleanliness'] },
    { text: 'Were the staff uniforms clean and presentable?', type: 'yes_no', weight: 2, kpi: ['cleanliness'] },
    { text: 'Was the immediate counter area free from visible waste or spills?', type: 'yes_no', weight: 2, kpi: ['cleanliness'] },
    {
      text: 'Was the outlet free from any serious food-safety or hygiene issue?',
      type: 'yes_no',
      weight: 3,
      critical: true,
      evidence: true,
      comment: true,
      tag: 'food_safety',
      kpi: ['cleanliness'],
      guidance: 'A critical failure. Answer No for any hygiene issue a guest would report — unclean food contact surfaces, poor handling, pests. Photograph it and describe what you saw.',
    },
  ],
)

// ── 13 · Complaint / Service Recovery — conditional ─────────────────────────

const COMPLAINT: SectionBlueprint = stage(
  'CMP',
  'Complaint / Service Recovery',
  'Complaint Resolution',
  5,
  'customer_experience',
  'Scored only on a visit where a complaint was raised. On every other visit the stage is excluded and the twelve weighted stages carry the full score.',
  [
    {
      text: 'Was a complaint or problem raised during the visit?',
      type: 'yes_no',
      weight: 0,
      key: 'had_complaint',
      guidance: 'Answer No if nothing went wrong. The rest of this stage is asked only if a complaint was raised, and is left out of the score entirely when it was not.',
    },
    { text: 'Did the staff listen carefully to the complaint?', type: 'yes_no', weight: 3, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    { text: 'Did the staff apologise appropriately?', type: 'yes_no', weight: 3, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    { text: 'Did the staff take ownership of the issue?', type: 'yes_no', weight: 3, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    { text: 'Was a suitable solution offered?', type: 'yes_no', weight: 3, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    { text: 'Was the issue resolved within a reasonable time?', type: 'yes_no', weight: 2, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    { text: 'Did a supervisor or manager become involved where necessary?', type: 'yes_no', weight: 2, na: true, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    { text: 'Were you satisfied with the final resolution?', type: 'yes_no', weight: 3, when: { key: 'had_complaint', equals: true }, kpi: ['complaint_resolution'] },
    {
      text: 'How was the complaint handled?',
      type: 'multiple_choice',
      weight: 3,
      options: PROBLEM_SOLVING_OPTIONS,
      when: { key: 'had_complaint', equals: true },
      tag: 'problem_solving',
      kpi: ['complaint_resolution'],
      guidance: 'A complaint ignored or handled unprofessionally is a critical failure — record it here and describe it in the comment.',
    },
  ],
)

// ── 14 · Overall Experience & NPS — unweighted ──────────────────────────────

const OVERALL: SectionBlueprint = stage(
  'OVR',
  'Overall Experience & NPS',
  'Guest Satisfaction',
  0,
  'customer_experience',
  'The shopper’s own verdict. Not weighted; it carries CSAT, NPS, likelihood to return and the three open questions.',
  [
    { text: 'Rate the overall cashier service', type: 'rating_5', weight: 0 },
    { text: 'Rate the speed of service', type: 'rating_5', weight: 0 },
    { text: 'Rate the accuracy of the order', type: 'rating_5', weight: 0 },
    { text: 'Rate the food quality', type: 'rating_5', weight: 0 },
    { text: 'Rate value for money', type: 'rating_5', weight: 0 },
    { text: 'Rate the overall Pizza Hut food-court experience (1-10)', type: 'rating_10', weight: 0, kpi: ['csat'], guidance: '1 = extremely dissatisfied, 10 = extremely satisfied.' },
    { text: 'Would you return to this Pizza Hut branch? (1-10)', type: 'rating_10', weight: 0, kpi: ['return_likelihood'] },
    {
      text: 'How likely are you to recommend this Pizza Hut branch to a friend or colleague? (1-10)',
      type: 'rating_10',
      weight: 0,
      kpi: ['nps'],
      guidance: 'Net Promoter question. 9-10 promoter, 7-8 passive, 1-6 detractor.',
    },
    { text: 'What did you like most?', type: 'text', weight: 0 },
    { text: 'What should be improved?', type: 'text', weight: 0 },
    { text: 'Additional comments', type: 'text', weight: 0 },
  ],
)

export const PIZZAHUT_STAGES: SectionBlueprint[] = [
  PROOF,
  QUEUE,
  CASHIER,
  MENU_KNOWLEDGE,
  UPSELL,
  LOYALTY,
  PAYMENT,
  PREPARATION,
  HANDOVER,
  BEVERAGE,
  FOOD_QUALITY,
  PACKAGING,
  CLEANLINESS,
  COMPLAINT,
  OVERALL,
]

const PIZZAHUT_SEQUENCE: ServiceSequence = {
  industry: 'Food & Beverage',
  serviceModel: 'Quick Service / Food Court',
  visitMode: 'Counter Order',
  // The dashboard the brief specifies, in its order. The overall mystery
  // shopping score is the visit score itself and is reported in the header;
  // the critical failure count is reported natively on every dashboard and
  // needs no KPI of its own. Menu Knowledge and Beverage Quality are reported
  // alongside, since the brief asks for both but lists neither.
  mainKpis: [
    { key: 'cashier_service', label: 'Cashier Service Score', kind: 'weighted' },
    { key: 'menu_knowledge', label: 'Menu Knowledge Score', kind: 'weighted' },
    { key: 'upselling', label: 'Upselling Score', kind: 'weighted' },
    { key: 'loyalty', label: 'Loyalty / Promotion Communication Score', kind: 'weighted' },
    { key: 'order_accuracy', label: 'Order Accuracy Score', kind: 'weighted' },
    { key: 'food_quality', label: 'Food Quality Score', kind: 'weighted' },
    { key: 'beverage_quality', label: 'Beverage Quality Score', kind: 'weighted' },
    { key: 'packaging', label: 'Packaging & Presentation Score', kind: 'weighted' },
    { key: 'cleanliness', label: 'Counter Cleanliness Score', kind: 'weighted' },
    { key: 'complaint_resolution', label: 'Complaint Resolution Score', kind: 'weighted' },
    { key: 'queue_time', label: 'Queue Time', kind: 'timing' },
    { key: 'order_taking_time', label: 'Cashier Transaction Time', kind: 'timing' },
    { key: 'preparation_time', label: 'Preparation Time', kind: 'timing' },
    // Derived by the engine as the sum of the three legs, but reported in
    // minutes: 'derived' formats as a percentage and would read "15.0%".
    { key: 'total_service_time', label: 'Total Service Time', kind: 'timing' },
    { key: 'visit_duration', label: 'Total Visit Duration', kind: 'timing' },
    { key: 'csat', label: 'Customer Satisfaction (CSAT)', kind: 'satisfaction' },
    { key: 'nps', label: 'Net Promoter Score (NPS)', kind: 'satisfaction' },
    { key: 'return_likelihood', label: 'Likelihood to Return', kind: 'satisfaction' },
  ],
  // The brief's high-severity flag list, in its words.
  criticalFailures: [
    'Serious food-safety or hygiene issue',
    'Wrong order not corrected',
    'Foreign object in food',
    'Food served clearly unsafe or badly undercooked',
    'Incorrect payment amount or cash-change issue not corrected',
    'Rude, disrespectful or inappropriate staff behaviour',
    'Major unexplained service delay',
    'Complaint ignored or handled unprofessionally',
    'Missing required proof of visit',
  ],
  timingChain: ['queue', 'order', 'preparation'],
}

export const PIZZAHUT_TEMPLATE: TemplateBlueprint = {
  id: 'tpl-pizzahut-food-court',
  code: 'PIZZAHUT_FOOD_COURT',
  name: 'Pizza Hut — Food Court Framework',
  description:
    'The brand’s own counter journey: queue and counter access, cashier greeting and order taking, menu knowledge, upselling, loyalty and promotion communication, payment, a timed preparation wait, order handover checked item by item, beverage and pizza quality, packaging, counter cleanliness, conditional service recovery and the closing verdict. A food-court flow: shared seating and mall facilities are deliberately out of scope.',
  segment: 'F&B',
  journey: 'Counter Order',
  isFollowUp: false,
  sections: PIZZAHUT_STAGES,
  sequence: PIZZAHUT_SEQUENCE,
  // The brief: every No and every Average or Poor rating must be explained.
  commentOnFail: true,
}
