-- 0014 — The restroom inspection becomes standard in every questionnaire.
--
-- Brings a database at 0013 to what supabase/seed_sterling.sql now generates
-- (14 Nov 2026). A fresh load from the seed already contains all of this.
--
-- * Pizza Hut gets the "Toilet / Restroom Cleanliness" stage (WC), 5% of the
--   score, 21 questions. The brief's other stages are scaled by 0.95, so its seven
--   areas keep their proportions and the weighted stages still sum to 100.
-- * Shebestan's restroom questions take the standard wording (five of them change
--   a word: sanitizer, toilet smells, restroom lights, bin not overflowing).
-- * Bennigan's already matches (0013).
--
-- Safe to re-run.

update public.audit_sections s
   set stage_weight = v.w, "order" = v.o
  from (values
    ('QUE', 6.65, 2), ('CSH', 9.5, 3), ('MNK', 4.75, 4), ('UPS', 9.5, 5), ('LOY', 4.75, 6), ('PAY', 4.75, 7),
    ('PRP', 12.35, 8), ('HND', 9.5, 9), ('BEV', 5.7, 10), ('FQ', 22.8, 11), ('PKG', 2.85, 12), ('CLN', 1.9, 13),
    ('CMP', 4.75, 15), ('OVR', 0, 16)
  ) as v(code, w, o)
 where s.id = 'tpl-pizzahut-food-court-' || v.code;

insert into public.audit_sections (id, template_id, code, title, category, description, "order", applicable_to, stage_weight, kpi_name)
  values ('tpl-pizzahut-food-court-WC', 'tpl-pizzahut-food-court', 'WC', 'Toilet / Restroom Cleanliness', 'safety_entertainment',
          'A full restroom inspection. Photograph anything that falls short.', 14, '"all"'::jsonb, 5, 'Restroom Cleanliness')
  on conflict (id) do update set title = excluded.title, category = excluded.category, description = excluded.description,
    "order" = excluded."order", stage_weight = excluded.stage_weight, kpi_name = excluded.kpi_name;

insert into public.audit_questions (id, section_id, code, text, type, weight, critical, evidence_required, comment_required, allow_na, guidance, options, threshold, "order", kpi_keys, timing_role, condition, derived_from, comment_on_fail)
select 'tpl-pizzahut-food-court-WC-' || lpad(n::text, 2, '0'), 'tpl-pizzahut-food-court-WC', 'WC.' || n, t, ty, w, false, ev, false, na, '', null, null, n,
       array['restroom']::text[], null, null, null, true
  from (values
    (1, 'Was the restroom clean?', 'yes_no', 3, true, false),
    (2, 'Was the toilet bowl clean?', 'yes_no', 3, false, false),
    (3, 'Was the toilet seat clean?', 'yes_no', 3, false, false),
    (4, 'Was the toilet floor clean?', 'yes_no', 2, false, false),
    (5, 'Was the floor dry?', 'yes_no', 2, false, false),
    (6, 'Was the washbasin clean?', 'yes_no', 2, false, false),
    (7, 'Was the mirror clean?', 'yes_no', 1, false, false),
    (8, 'Was hand soap available?', 'yes_no', 3, false, false),
    (9, 'Was the soap dispenser adequately filled?', 'yes_no', 2, false, false),
    (10, 'Was hand sanitizer available, where applicable?', 'yes_no', 1, false, true),
    (11, 'Was the hand sanitizer adequately filled?', 'yes_no', 1, false, true),
    (12, 'Was toilet tissue available?', 'yes_no', 3, false, false),
    (13, 'Was hand tissue / paper towel available?', 'yes_no', 2, false, false),
    (14, 'Was the tissue roll adequately stocked?', 'yes_no', 2, false, false),
    (15, 'Was the exhaust fan clean?', 'yes_no', 1, false, false),
    (16, 'Was the exhaust fan operational?', 'yes_no', 2, false, false),
    (17, 'Was the toilet free from bad or unpleasant smells?', 'yes_no', 3, false, false),
    (18, 'Were restroom lights operational?', 'yes_no', 2, false, false),
    (19, 'Was the waste bin clean?', 'yes_no', 2, false, false),
    (20, 'Was the waste bin not overflowing?', 'yes_no', 2, false, false),
    (21, 'Was the restroom overall suitable for a quick-service restaurant of Pizza Hut’s standard?', 'rating_5', 3, false, false)
  ) as q(n, t, ty, w, ev, na)
on conflict (id) do update set text = excluded.text, type = excluded.type, weight = excluded.weight,
  evidence_required = excluded.evidence_required, allow_na = excluded.allow_na, "order" = excluded."order",
  kpi_keys = excluded.kpi_keys, comment_on_fail = excluded.comment_on_fail;

update public.audit_questions q set text = v.t
  from (values
    ('tpl-shebestan-fine-dining-WC-10', 'Was hand sanitizer available, where applicable?'),
    ('tpl-shebestan-fine-dining-WC-11', 'Was the hand sanitizer adequately filled?'),
    ('tpl-shebestan-fine-dining-WC-17', 'Was the toilet free from bad or unpleasant smells?'),
    ('tpl-shebestan-fine-dining-WC-18', 'Were restroom lights operational?'),
    ('tpl-shebestan-fine-dining-WC-20', 'Was the waste bin not overflowing?')
  ) as v(id, t)
 where q.id = v.id;

update public.audit_templates t
   set section_ids = array(select id from public.audit_sections where template_id = t.id order by "order"),
       question_count = (select count(*) from public.audit_questions q join public.audit_sections s on s.id = q.section_id where s.template_id = t.id),
       sequence = case when t.sequence->'mainKpis' @> '[{"key":"restroom"}]' then t.sequence else jsonb_set(t.sequence, '{mainKpis}', (
         select jsonb_agg(e order by pos) from (
           select e, ord::numeric as pos from jsonb_array_elements(t.sequence->'mainKpis') with ordinality as k(e, ord)
           union all
           select '{"key":"restroom","label":"Restroom Cleanliness Score","kind":"weighted"}'::jsonb,
                  coalesce((select ord from jsonb_array_elements(t.sequence->'mainKpis') with ordinality as k(e, ord) where e->>'key' = 'cleanliness'), 999) + 0.5
         ) x)) end
 where t.id = 'tpl-pizzahut-food-court';
