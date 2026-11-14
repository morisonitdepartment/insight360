-- 0013 — Bennigan's: restroom stage, rescaled weights, one repeated question retired.
--
-- Brings a database loaded from the earlier seed to what supabase/seed_sterling.sql
-- now generates for Bennigan's (14 Nov 2026). A fresh load from the seed already
-- contains all of this.
--
-- * New stage "Toilet / Restroom Cleanliness" (WC), 5% of the score, 21 questions.
-- * The brief's other Bennigan's stages scaled by 0.95, so their relative weights
--   are unchanged and the weighted stages still sum to 100.
-- * ORD.1 "What did you order?" removed: it repeated PRF.8 "Items ordered".
--   Question ids are positional, so the later ORD questions keep their ids.
--   Deleting it cascades to its saved answers (one, on MS-26-0002, whose order
--   is also recorded under Items ordered).
--
-- Safe to re-run.

-- Stage weights (× 0.95) and the order after the new stage.
update public.audit_sections s
   set stage_weight = v.w, "order" = v.o
  from (values
    ('EXT', 3.8, 2), ('HOS', 6.65, 3), ('OCC', 5.7, 4), ('TBS', 5.7, 5), ('WTR', 6.65, 6),
    ('MNK', 7.6, 7), ('ORD', 6.65, 8), ('APP', 7.6, 9), ('PLT', 4.75, 10), ('MCS', 14.25, 11),
    ('BEV', 7.6, 12), ('ATT', 7.6, 13), ('SUP', 3.8, 14), ('CMP', 4.75, 15), ('BPF', 6.65, 17), ('OVR', 0, 18)
  ) as v(code, w, o)
 where s.id = 'tpl-bennigans-casual-dining-' || v.code;

insert into public.audit_sections (id, template_id, code, title, category, description, "order", applicable_to, stage_weight, kpi_name)
  values ('tpl-bennigans-casual-dining-WC', 'tpl-bennigans-casual-dining', 'WC', 'Toilet / Restroom Cleanliness', 'safety_entertainment',
          'A full restroom inspection. Photograph anything that falls short.', 16, '"all"'::jsonb, 5, 'Restroom Cleanliness')
  on conflict (id) do update set title = excluded.title, category = excluded.category, description = excluded.description,
    "order" = excluded."order", stage_weight = excluded.stage_weight, kpi_name = excluded.kpi_name;

insert into public.audit_questions (id, section_id, code, text, type, weight, critical, evidence_required, comment_required, allow_na, guidance, options, threshold, "order", kpi_keys, timing_role, condition, derived_from, comment_on_fail)
select 'tpl-bennigans-casual-dining-WC-' || lpad(n::text, 2, '0'), 'tpl-bennigans-casual-dining-WC', 'WC.' || n, t, ty, w, false, ev, false, na, '', null, null, n,
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
    (21, 'Was the restroom overall suitable for a casual-dining restaurant of Bennigan’s standard?', 'rating_5', 3, false, false)
  ) as q(n, t, ty, w, ev, na)
on conflict (id) do update set text = excluded.text, type = excluded.type, weight = excluded.weight,
  evidence_required = excluded.evidence_required, allow_na = excluded.allow_na, "order" = excluded."order",
  kpi_keys = excluded.kpi_keys, comment_on_fail = excluded.comment_on_fail;

delete from public.audit_questions where id = 'tpl-bennigans-casual-dining-ORD-01';

-- The template: stage list, question count, and the restroom KPI after Cleanliness.
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
 where t.id = 'tpl-bennigans-casual-dining';
