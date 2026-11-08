-- 0011 — Brand frameworks: calculated durations, clock stamps and conditional comments.
--
-- Added for SHEBESTAN_FINE_DINING, where the shopper records wall-clock times and the
-- questionnaire works the elapsed minutes out for itself, and where the client's rule
-- is that every No and every Average or Poor rating must be explained.
--
-- Like 0010, every column here is nullable and nothing else changes: a question with
-- none of them behaves exactly as it does today. Apply BEFORE deploying an app build
-- that carries a template using them — the app persists whole rows, so a save against
-- a database without these columns fails with "column does not exist".
--
-- Depends on: 0010_service_sequence.sql.

-- A `time` question whose minutes are calculated rather than typed:
--   {"from": "PRF.1", "to": "HOS.1"} — the codes of two `clock` questions.
alter table public.audit_questions
  add column if not exists derived_from jsonb;

-- Require a comment when the answer falls short (a No, a Fail, a bottom-half rating),
-- as distinct from comment_required, which asks for one whatever the answer.
alter table public.audit_questions
  add column if not exists comment_on_fail boolean not null default false;

-- `clock` joins the question types: a wall-clock stamp (HH:MM), never scored.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'audit_questions_type_check' and conrelid = 'public.audit_questions'::regclass
  ) then
    alter table public.audit_questions drop constraint audit_questions_type_check;
  end if;
  alter table public.audit_questions
    add constraint audit_questions_type_check
    check (type in ('yes_no', 'rating_5', 'rating_10', 'pass_fail', 'multiple_choice', 'text', 'numeric', 'time', 'clock', 'photo', 'video'));
end $$;

-- How full the outlet was when the shopper arrived, as a percentage of seats or
-- service points in use. Context for every timing on the visit.
alter table public.visits
  add column if not exists occupancy integer check (occupancy is null or (occupancy between 0 and 100));

-- A stage weight may now carry a decimal (14.2), so a client's own weighting can be
-- scaled to 100 without rounding it into something they would not recognise.
-- numeric(5,2) already allows this; the comment records why it matters.
comment on column public.audit_sections.stage_weight is
  'Percent of the visit score carried by this stage. One decimal place is meaningful: a client weighting that sums to something other than 100 is scaled, not rounded. A stage whose every scored question is gated is conditional and sits outside the 100.';
