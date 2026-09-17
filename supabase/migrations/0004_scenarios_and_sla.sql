-- ============================================================================
-- 0004_scenarios_and_sla.sql
--
-- Adds three programme capabilities to the Live Mode schema:
--   1. Scenario-based assessments (complaints, returns, special requests)
--   2. The social-media journey as a first-class assessment template
--   3. A two-tier reporting SLA: a 24h preferred target inside the 48h
--      contractual maximum.
--
-- Safe to re-run. Apply after 0001_schema.sql, 0002_rls.sql and 0003_seed_reference.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Helper guards
--    0001 creates these. They are redefined here, idempotently, so this file can
--    be applied on its own and cannot fail with
--    "function app.attach_updated_at(unknown) does not exist".
-- ---------------------------------------------------------------------------
create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function app.attach_updated_at(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format(
    'drop trigger if exists set_updated_at on %s; create trigger set_updated_at before update on %s for each row execute function app.set_updated_at();',
    p_table, p_table
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Scenario library
-- ---------------------------------------------------------------------------
create table if not exists public.scenarios (
  id               text primary key,
  code             text not null unique,
  name             text not null,
  type             text not null check (type in (
                     'Standard Visit','Complaint Handling','Return / Refund','Special Request',
                     'Service Recovery','Accessibility','Group Booking')),
  description      text not null default '',
  -- Ordered briefing steps the shopper follows during the visit.
  instructions     text[] not null default '{}',
  expected_outcome text not null default '',
  -- NULL means the scenario applies to every segment.
  applicable_to    text[],
  suitable_profiles text[] not null default '{}',
  focus_areas      text[] not null default '{}',
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists scenarios_type_idx   on public.scenarios(type);
create index if not exists scenarios_active_idx on public.scenarios(active);
select app.attach_updated_at('public.scenarios');

comment on table public.scenarios is
  'Scenario-based assessment briefings: complaints, returns, special requests, recovery, accessibility, group bookings and social-media interactions.';

-- ---------------------------------------------------------------------------
-- 2. Link visits to a scenario
-- ---------------------------------------------------------------------------
alter table public.visits
  add column if not exists scenario_id text references public.scenarios(id) on delete set null;

create index if not exists visits_scenario_id_idx on public.visits(scenario_id);

comment on column public.visits.scenario_id is
  'Scenario the shopper was briefed to execute on this visit.';

-- ---------------------------------------------------------------------------
-- 3. Two-tier reporting SLA
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists reporting_target_hours integer not null default 24;

alter table public.organizations
  drop constraint if exists organizations_reporting_window_chk;
alter table public.organizations
  add constraint organizations_reporting_window_chk
  check (reporting_target_hours > 0 and reporting_target_hours <= reporting_sla_hours);

comment on column public.organizations.reporting_target_hours is
  'Preferred report turnaround in hours. reporting_sla_hours is the contractual maximum.';

-- Widen the sla_status enumeration to admit the new best band.
alter table public.visits drop constraint if exists visits_sla_status_check;
alter table public.visits
  add constraint visits_sla_status_check
  check (sla_status in ('Within Target','Within SLA','At Risk','Breached','Pending'));

-- Re-grade existing rows: anything submitted inside the target moves to 'Within Target'.
update public.visits v
set    sla_status = 'Within Target'
from   public.organizations o
where  v.sla_status = 'Within SLA'
  and  v.submitted_at is not null
  and  v.visit_end   is not null
  and  v.submitted_at <= v.visit_end + make_interval(hours => o.reporting_target_hours);

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
--    Scenarios are reference data: readable by every authenticated app user,
--    writable only by roles holding admin.templates (super_admin).
-- ---------------------------------------------------------------------------
alter table public.scenarios enable row level security;

drop policy if exists scenarios_super_admin_all on public.scenarios;
create policy scenarios_super_admin_all on public.scenarios
  for all using (app.is_super_admin()) with check (app.is_super_admin());

drop policy if exists scenarios_read_all on public.scenarios;
create policy scenarios_read_all on public.scenarios
  for select using (app.is_app_user());

drop policy if exists scenarios_manage on public.scenarios;
create policy scenarios_manage on public.scenarios
  for all using (app.has_permission('admin.templates'))
  with check (app.has_permission('admin.templates'));

-- Table privileges are checked before row level security, so the grant matters as
-- much as the policies. 0002 granted "on all tables in schema" before this table
-- existed, so it must be granted explicitly here.
grant select, insert, update, delete on public.scenarios to authenticated;
revoke all on public.scenarios from anon;

-- ---------------------------------------------------------------------------
-- 5. Seed the scenario library (mirrors src/data/scenarios.ts)
-- ---------------------------------------------------------------------------
insert into public.scenarios (id, code, name, type, description, instructions, expected_outcome, applicable_to, suitable_profiles, focus_areas, active) values
 ('scn-01','SC-STD','Standard customer journey','Standard Visit',
  'Baseline visit with no deliberate intervention. Establishes the outlet''s everyday service level.',
  array['Arrive unannounced during the briefed day-part and behave as an ordinary guest.','Place a typical order for the outlet category without special requests.','Record timings discreetly at each touchpoint.','Settle the bill, retain the receipt and photograph it before leaving.'],
  'Service delivered to brand standard throughout, with no prompting required from the guest.',
  null, array['Individual','Family','Professional','Young Adult','Tourist','Parent'], array['greet_30s','time_order','time_receive','order_accuracy','billing'], true),

 ('scn-02','SC-COMP','Complaint handling','Complaint Handling',
  'The shopper raises a genuine but moderate complaint and grades how the team acknowledges, resolves and recovers.',
  array['Midway through the visit, raise one credible complaint (e.g. the order is cold, the table was not cleaned, a long unexplained wait).','Deliver the complaint calmly and once only - do not escalate the tone.','Record who responds, how long acknowledgement takes and whether a supervisor becomes involved.','Note whether an apology, a remedy and a follow-up check are all offered.','Do not accept compensation beyond the normal remedy; record what was offered.'],
  'Complaint acknowledged within two minutes, ownership taken without deflection, a remedy offered unprompted, and a follow-up check before departure.',
  null, array['Individual','Professional','Family'], array['problem_solving','ownership','courtesy'], true),

 ('scn-03','SC-RTN','Return / refund request','Return / Refund',
  'Tests policy knowledge, authority limits and billing accuracy when a guest asks to return an item or reverse a charge.',
  array['After payment, request to return or exchange one item, or query a charge on the receipt.','Give a reasonable but non-urgent reason (wrong item, changed mind, incorrect price).','Record whether staff know the policy without checking, and whether a supervisor is needed.','Note the time taken and whether the refund or exchange is completed during the visit.','Photograph the amended receipt or refund confirmation.'],
  'Policy explained accurately and consistently, the request handled without undue delay, and any refund evidenced on the receipt.',
  null, array['Individual','Professional','Parent'], array['billing','order_accuracy','problem_solving'], true),

 ('scn-04','SC-REQ','Special request handling','Special Request',
  'Assesses flexibility and product knowledge through an allergen, dietary or seating request.',
  array['At the point of ordering, make one specific request (allergen check, dietary substitution, seating change).','Ask a direct follow-up question that requires real product knowledge.','Record whether the request is written down, confirmed back and honoured correctly.','Check on delivery whether the request was actually met.'],
  'Request confirmed back to the guest, escalated to the kitchen or supervisor where required, and delivered correctly without a reminder.',
  null, array['Family','Parent','Professional','Individual'], array['order_accuracy','product_knowledge','problem_solving'], true),

 ('scn-05','SC-REC','Service recovery under pressure','Service Recovery',
  'Run during a known peak period to test composure, queue communication and recovery when the outlet is stretched.',
  array['Attend during the briefed peak window when queues are expected.','Observe whether waiting guests are acknowledged and given a wait estimate.','Raise one time-related concern once the wait exceeds the standard.','Record crowd and queue control, and whether staff composure holds.'],
  'Queue actively managed with proactive wait communication, and the concern met with a realistic update rather than deflection.',
  null, array['Individual','Young Adult','Professional'], array['time_queue','time_receive','problem_solving'], true),

 ('scn-06','SC-ACC','Accessibility & assistance','Accessibility',
  'Checks whether the outlet can accommodate a guest needing assistance, step-free access or additional support.',
  array['Request assistance on arrival (step-free route, seating close to the entrance, help carrying a tray).','Observe whether staff offer help proactively or wait to be asked.','Record the condition and availability of accessible facilities, including washrooms.','Photograph any obstruction to an accessible route, without identifying individuals.'],
  'Assistance offered willingly and promptly, accessible routes and facilities available and unobstructed.',
  null, array['Parent','Family','Individual'], array['courtesy','washroom','facility'], true),

 ('scn-07','SC-GRP','Group booking & onboarding','Group Booking',
  'Entertainment-weighted scenario testing booking, group onboarding, safety briefing and crowd handling.',
  array['Book in advance for a group of four or more, by phone or online.','Arrive as a group and record the reception and registration process.','Confirm that a safety briefing is delivered to the whole group before the activity begins.','Observe crowd control and staff supervision throughout the activity.','Video the safety briefing where permitted, otherwise record the time and content in notes.'],
  'Booking honoured, group onboarded together, a complete safety briefing delivered before the activity, and supervision maintained throughout.',
  array['Entertainment'], array['Family','Young Adult','Parent'], array['safety_briefing','staff_safety','time_queue'], true),

 ('scn-08','SC-SOC','Social media enquiry & complaint','Complaint Handling',
  'Remote scenario run entirely through the outlet''s social channels, covering enquiry, complaint and recovery.',
  array['Send a direct message asking about opening hours, availability or allergens, and record the response time.','Post or message one moderate complaint referencing a plausible recent experience.','Record whether the reply is on-brand, whether it moves the conversation to a private channel, and whether a remedy is offered.','Screenshot every exchange with visible timestamps.'],
  'Enquiry answered within two hours, complaint acknowledged publicly then taken private, and a named person owning the resolution.',
  null, array['Young Adult','Individual','Professional'], array['social_response','social_quality','social_complaint'], true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Verification
-- ---------------------------------------------------------------------------
-- select count(*) from public.scenarios;                       -- expect 8
-- select sla_status, count(*) from public.visits group by 1;   -- expect a 'Within Target' band
-- select reporting_target_hours, reporting_sla_hours from public.organizations;  -- expect 24 / 48
