-- 0018 — The rest of the brief comparison (14 Nov 2026).
--
-- Brings a database at 0017 to what supabase/seed_sterling.sql now generates,
-- and adds the photo-stamp columns.
--
-- * Shebestan: its brief names no red flags, so the ten dine-in red flags from
--   the Bennigan's brief apply, each backed by a critical check added at the end
--   of its stage. "Was the food fresh?" is an ordinary question again; the
--   critical food-safety check is its own question (FQC.22).
-- * Bennigan's: "What did you order?" is back in Order Taking & Accuracy, where
--   the brief puts it, and "Items ordered" in the visit details is retired. The
--   answer and photo already saved on it move across, then the old row goes.
-- * Pizza Hut: the brief's KPI weights exactly as written; the restroom stage is
--   recorded and reported but not scored (the brief keeps mall facilities out).
-- * evidence.photo_taken_at / latitude / longitude: the date, time and GPS the
--   camera wrote into a photo, read before upload, for the proof-of-visit check.
--
-- Safe to re-run.

alter table public.evidence add column if not exists photo_taken_at timestamptz;
alter table public.evidence add column if not exists latitude double precision;
alter table public.evidence add column if not exists longitude double precision;

-- Shebestan's red-flag list: the dine-in list from the Bennigan's brief.
update public.audit_templates
   set sequence = jsonb_set(sequence, '{criticalFailures}', '["Serious food-safety or hygiene issue","Foreign object in food","Food served clearly undercooked or unsafe","Rude, aggressive, discriminatory or seriously unprofessional staff behaviour","Major order error not corrected","Incorrect bill or incorrect cash change not corrected","Complaint ignored or dismissed","Excessive unexplained service delay","Damaged or chipped serving ware creating a safety risk","Seriously dirty dining area or table at the time of service"]'::jsonb)
 where id = 'tpl-shebestan-fine-dining';

-- Pizza Hut: the brief's weights as written; the restroom recorded, not scored.
update public.audit_sections s set stage_weight = v.w
  from (values ('QUE', 7), ('CSH', 10), ('MNK', 5), ('UPS', 10), ('LOY', 5), ('PAY', 5), ('PRP', 13), ('HND', 10),
               ('BEV', 6), ('FQ', 24), ('PKG', 3), ('CLN', 2), ('WC', 0), ('CMP', 5)) as v(code, w)
 where s.id = 'tpl-pizzahut-food-court-' || v.code;

insert into public.audit_questions (id, section_id, code, text, type, weight, critical, evidence_required, comment_required, allow_na, guidance, options, threshold, "order", kpi_keys, timing_role, condition, derived_from, comment_on_fail, required)
values
  ('tpl-bennigans-casual-dining-ORD-01', 'tpl-bennigans-casual-dining-ORD', 'ORD.1', 'What did you order?', 'text', 0, false, false, false, false, 'Record every item by category — appetizer, main course with how it was requested, beverage, sides and desserts — for the whole party. Every accuracy, timing and food-quality answer is read against this list.', null, null, 1, null, null, null, null, false, true),
  ('tpl-shebestan-fine-dining-AMB-11', 'tpl-shebestan-fine-dining-AMB', 'AMB.11', 'Were the dining area and table free from serious dirt or any hygiene issue?', 'yes_no', 3, true, true, true, false, 'A critical failure: a seriously dirty dining area or table at the time of service, or a hygiene hazard such as pests. Photograph it.', null, null, 11, null, null, null, null, true, false),
  ('tpl-shebestan-fine-dining-WTR-28', 'tpl-shebestan-fine-dining-WTR', 'WTR.28', 'Was all staff conduct free from rude, aggressive, discriminatory or seriously unprofessional behaviour?', 'yes_no', 3, true, false, true, false, 'A critical failure. Describe exactly what was said or done. Speaking another language is not a fault.', null, null, 28, array['service']::text[], null, null, null, true, false),
  ('tpl-shebestan-fine-dining-ORD-07', 'tpl-shebestan-fine-dining-ORD', 'ORD.7', 'Was the order error corrected once you pointed it out?', 'yes_no', 3, true, false, true, false, 'Point out the wrong or missing item. A critical failure (major order error not corrected) when it was not put right.', null, null, 7, array['order_accuracy']::text[], null, '{"questionCode":"ORD.6","equals":false}'::jsonb, null, true, false),
  ('tpl-shebestan-fine-dining-DEL-11', 'tpl-shebestan-fine-dining-DEL', 'DEL.11', 'Was the meal free from any excessive, unexplained service delay?', 'yes_no', 2, true, false, true, false, 'A critical failure. Answer No only for a wait far beyond the standard times that nobody explained or apologised for.', null, null, 11, null, null, null, null, true, false),
  ('tpl-shebestan-fine-dining-FQC-07', 'tpl-shebestan-fine-dining-FQC', 'FQC.7', 'Was the food fresh?', 'yes_no', 3, false, false, false, false, '', null, null, 7, array['food_quality']::text[], null, null, null, true, false),
  ('tpl-shebestan-fine-dining-FQC-22', 'tpl-shebestan-fine-dining-FQC', 'FQC.22', 'Was the food safe to eat — nothing undercooked or raw, nothing spoiled, and no foreign object?', 'yes_no', 3, true, true, true, false, 'A critical failure. Answer No for anything served clearly undercooked, raw where it should not be, spoiled, or with a foreign object in it. Photograph it and describe what you found.', null, null, 22, array['food_quality']::text[], null, null, null, true, false),
  ('tpl-shebestan-fine-dining-PLT-15', 'tpl-shebestan-fine-dining-PLT', 'PLT.15', 'Was the serving ware safe — no chip or crack that could cut or harm a guest?', 'yes_no', 2, true, true, true, false, 'A critical failure only when the damage is a safety risk: a sharp chip or a crack that could break. Cosmetic marks are recorded in the questions above.', null, null, 15, null, null, null, null, true, false),
  ('tpl-shebestan-fine-dining-CMP-14', 'tpl-shebestan-fine-dining-CMP', 'CMP.14', 'Was the complaint taken seriously — not ignored or dismissed?', 'yes_no', 3, true, false, true, false, 'A critical failure when staff ignored or dismissed the complaint. Describe what happened.', null, null, 14, array['complaint_resolution']::text[], null, '{"questionCode":"CMP.1","equals":true}'::jsonb, null, true, false),
  ('tpl-shebestan-fine-dining-BPF-32', 'tpl-shebestan-fine-dining-BPF', 'BPF.32', 'Were the bill and any change correct, or corrected before you left?', 'yes_no', 3, true, false, true, false, 'A critical failure when a wrong bill or wrong cash change was not put right before you left.', null, null, 32, null, null, null, null, true, false)
on conflict (id) do update set section_id = excluded.section_id, code = excluded.code, text = excluded.text, type = excluded.type, weight = excluded.weight,
  critical = excluded.critical, evidence_required = excluded.evidence_required, comment_required = excluded.comment_required, allow_na = excluded.allow_na,
  guidance = excluded.guidance, options = excluded.options, threshold = excluded.threshold, "order" = excluded."order", kpi_keys = excluded.kpi_keys,
  timing_role = excluded.timing_role, condition = excluded.condition, derived_from = excluded.derived_from, comment_on_fail = excluded.comment_on_fail, required = excluded.required;

-- Move anything saved on Bennigan's "Items ordered" (PRF.8) to "What did you order?"
-- (ORD.1): photos first (their link would block the delete), then the answers.
update public.evidence set question_id = 'tpl-bennigans-casual-dining-ORD-01'
 where question_id = 'tpl-bennigans-casual-dining-PRF-08';
insert into public.visit_answers (id, visit_id, question_id, value, na, comment, evidence_ids, score)
select a.visit_id || '-tpl-bennigans-casual-dining-ORD-01', a.visit_id, 'tpl-bennigans-casual-dining-ORD-01', a.value, a.na, a.comment, a.evidence_ids, a.score
  from public.visit_answers a
 where a.question_id = 'tpl-bennigans-casual-dining-PRF-08'
on conflict (id) do nothing;
delete from public.audit_questions where id = 'tpl-bennigans-casual-dining-PRF-08';

update public.audit_templates t
   set section_ids = array(select id from public.audit_sections where template_id = t.id order by "order"),
       question_count = (select count(*) from public.audit_questions q join public.audit_sections s on s.id = q.section_id where s.template_id = t.id)
 where t.id in ('tpl-shebestan-fine-dining', 'tpl-bennigans-casual-dining', 'tpl-pizzahut-food-court');
