-- 0010 — Service sequence engine: stage-weighted templates, KPI mapping, conditional
-- questions and per-visit stage / KPI scores.
--
-- Every column added here is nullable, and nothing else changes: a template without
-- stage weights scores exactly as before, so existing rows need no backfill and no
-- policy is touched (RLS is row-level; these are columns on tables it already covers).
--
-- Apply BEFORE deploying an app build that carries sequence templates. The app
-- persists whole rows, so a save of a stage template or a visit on one against a
-- database without these columns fails with "column does not exist".

-- Which service sequence template a brand is assessed against (audit_templates.code).
alter table public.brands
  add column if not exists template_code text;

-- Industry / service model / visit mode, main KPIs, critical failures, timing chain.
alter table public.audit_templates
  add column if not exists sequence jsonb;

-- A section is a stage of the sequence: its share of the visit score and its KPI name.
alter table public.audit_sections
  add column if not exists stage_weight numeric(5,2)
    check (stage_weight is null or (stage_weight >= 0 and stage_weight <= 100)),
  add column if not exists kpi_name text;

-- Question → main KPI mapping, timing-chain leg, and the sibling answer that gates it.
alter table public.audit_questions
  add column if not exists kpi_keys text[],
  add column if not exists timing_role text
    check (timing_role is null or timing_role in ('queue','order','preparation')),
  add column if not exists condition jsonb;

-- Stored beside category_scores so reports need no recomputation.
alter table public.visits
  add column if not exists stage_scores jsonb,
  add column if not exists kpi_scores jsonb;

-- Counter-service visits are a journey of their own.
-- The inline checks in 0001 were auto-named <table>_<column>_check.
alter table public.audit_templates drop constraint if exists audit_templates_journey_check;
alter table public.audit_templates add constraint audit_templates_journey_check check (journey in (
  'In-store / Dine-in','Social Media Interaction','Takeaway','Delivery',
  'Entertainment Ticketing','Reception','Guest Onboarding','Safety Briefing','Digital Interaction',
  'Counter Order'));

alter table public.visits drop constraint if exists visits_journey_check;
alter table public.visits add constraint visits_journey_check check (journey in (
  'In-store / Dine-in','Social Media Interaction','Takeaway','Delivery',
  'Entertainment Ticketing','Reception','Guest Onboarding','Safety Briefing','Digital Interaction',
  'Counter Order'));
