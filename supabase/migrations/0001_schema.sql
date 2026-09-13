-- ============================================================================
-- INSIGHT360 — 0001_schema.sql
-- Postgres 15 / Supabase. Core relational schema.
--
-- Conventions
--   * Column names are the snake_case form of the camelCase fields in
--     src/types/index.ts. src/repositories/supabaseRepository.ts maps
--     camelCase <-> snake_case generically and upserts by `id`, so every model
--     field MUST exist as a column with the exact snake_case name.
--   * Ids are application-generated text ('vis-0001', 'usr-001', ...).
--   * created_at / updated_at are server-maintained (trigger app.set_updated_at).
--   * Derived outlet metrics (overall_score, rank, ...) are stored nullable so
--     the client-side upsert of a full Outlet row never fails; the app
--     recomputes them from visits/findings on load (services/derive.ts).
--   * Reference-data seeds (roles, permissions, role_permissions, kpi_config,
--     notification_rules, training_modules) live in 0003_seed_reference.sql.
-- ============================================================================

create extension if not exists pgcrypto;

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Attaches the updated_at trigger to a table (helper used below only).
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
-- Organisation (single-tenant settings row)
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id                   text primary key default 'org-001',
  name                 text not null,
  engagement_name      text not null default '',
  engagement_start     date,
  engagement_end       date,
  reporting_sla_hours  integer not null default 48 check (reporting_sla_hours > 0),
  escalation_sla_hours integer not null default 24 check (escalation_sla_hours > 0),
  timezone             text not null default 'Asia/Qatar (GMT+3)',
  currency             text not null default 'QAR',
  locale               text not null default 'en-QA',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
select app.attach_updated_at('public.organizations');

-- ---------------------------------------------------------------------------
-- Roles & permissions (mirror of src/config/permissions.ts)
-- ---------------------------------------------------------------------------
create table if not exists public.roles (
  key         text primary key
              check (key in ('super_admin','client_admin','ops_manager','shopper','analyst','executive')),
  label       text not null,
  description text not null default '',
  read_only   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
select app.attach_updated_at('public.roles');

create table if not exists public.permissions (
  key         text primary key,
  description text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
select app.attach_updated_at('public.permissions');

create table if not exists public.role_permissions (
  role       text not null references public.roles(key) on delete cascade,
  permission text not null references public.permissions(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role, permission)
);
create index if not exists role_permissions_permission_idx on public.role_permissions(permission);

-- ---------------------------------------------------------------------------
-- Brands & outlets
-- ---------------------------------------------------------------------------
create table if not exists public.brands (
  id           text primary key,
  name         text not null,
  segment      text not null check (segment in ('F&B','Entertainment')),
  outlet_count integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
select app.attach_updated_at('public.brands');

create table if not exists public.outlets (
  id                    text primary key,
  code                  text not null unique,
  name                  text not null,
  brand_id              text not null references public.brands(id) on delete restrict,
  brand                 text not null default '',
  segment               text not null check (segment in ('F&B','Entertainment')),
  subcategory           text not null check (subcategory in (
                          'Fine Dining','Casual Dining','Café','Fast Casual','Food Court',
                          'Indoor Entertainment','Family Entertainment','Attraction','Cinema','Recreation')),
  location              text not null default '',
  region                text not null default '',
  manager               text not null default '',
  status                text not null default 'Active' check (status in ('Active','Under Renovation','Seasonal')),
  opening_hours         text not null default '',
  target_score          numeric(5,2) not null default 85 check (target_score between 0 and 100),
  annual_visits         integer not null default 4 check (annual_visits >= 0),
  map_x                 numeric(6,2) not null default 50,
  map_y                 numeric(6,2) not null default 50,
  -- derived (recomputed client-side; stored so full-row upserts succeed)
  main_audits_completed integer not null default 0,
  follow_ups_completed  integer not null default 0,
  last_audit            date,
  next_audit            date,
  overall_score         numeric(5,2),
  previous_score        numeric(5,2),
  risk_rating           text not null default 'Not Assessed'
                        check (risk_rating in ('Excellent','Good','Needs Improvement','Critical','Not Assessed')),
  open_issues           integer not null default 0,
  critical_findings     integer not null default 0,
  category_scores       jsonb,
  rank                  integer,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists outlets_brand_id_idx on public.outlets(brand_id);
create index if not exists outlets_region_idx   on public.outlets(region);
select app.attach_updated_at('public.outlets');

-- ---------------------------------------------------------------------------
-- Shoppers & training
-- ---------------------------------------------------------------------------
create table if not exists public.training_modules (
  id              text primary key,
  name            text not null,
  validity_months integer not null check (validity_months > 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
select app.attach_updated_at('public.training_modules');

create table if not exists public.shoppers (
  id                     text primary key,
  code                   text not null unique,
  name                   text not null,
  gender                 text not null check (gender in ('Female','Male')),
  age_range              text not null check (age_range in ('18-24','25-34','35-44','45-54','55+')),
  nationality            text not null default '',
  profile_type           text not null check (profile_type in ('Individual','Family','Tourist','Young Adult','Professional','Parent')),
  languages              text[] not null default '{}',
  experience_years       integer not null default 0 check (experience_years >= 0),
  assigned_categories    text[] not null default '{}'
                         check (assigned_categories <@ array['F&B','Entertainment']::text[]),
  availability           text not null default 'Available' check (availability in ('Available','Limited','Unavailable')),
  training_status        text not null default 'Not Started' check (training_status in ('Not Started','In Progress','Completed','Expired')),
  certification_status   text not null default 'Pending' check (certification_status in ('Certified','Pending','Expired')),
  completed_visits       integer not null default 0,
  avg_report_quality     numeric(5,2) not null default 0,
  on_time_submission_pct numeric(5,2) not null default 0,
  status                 text not null default 'Active' check (status in ('Active','On Leave','Inactive')),
  training               jsonb not null default '[]'::jsonb,   -- ShopperTrainingRecord[]
  email                  text not null default '',
  phone                  text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
select app.attach_updated_at('public.shoppers');

-- ---------------------------------------------------------------------------
-- Users (application profiles linked to Supabase Auth)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id          text primary key,
  auth_id     uuid unique references auth.users(id) on delete set null,
  name        text not null,
  email       text not null unique,
  role        text not null check (role in ('super_admin','client_admin','ops_manager','shopper','analyst','executive')),
  status      text not null default 'invited' check (status in ('active','inactive','invited')),
  title       text not null default '',
  outlet_ids  text[] not null default '{}',   -- empty = all outlets (subject to role)
  brand_ids   text[] not null default '{}',
  last_login  timestamptz,
  mfa_enabled boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  shopper_id  text references public.shoppers(id) on delete set null,
  constraint users_shopper_link check (role <> 'shopper' or shopper_id is not null)
);
create index if not exists users_auth_id_idx    on public.users(auth_id);
create index if not exists users_role_idx       on public.users(role);
create index if not exists users_shopper_id_idx on public.users(shopper_id);
select app.attach_updated_at('public.users');

-- Optional multi-role support (a user's effective permissions = users.role ∪ user_roles).
create table if not exists public.user_roles (
  user_id    text not null references public.users(id) on delete cascade,
  role       text not null references public.roles(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
create index if not exists user_roles_role_idx on public.user_roles(role);

-- Normalised outlet assignments (union-ed with users.outlet_ids by app.user_outlet_ids()).
create table if not exists public.user_outlets (
  user_id    text not null references public.users(id) on delete cascade,
  outlet_id  text not null references public.outlets(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, outlet_id)
);
create index if not exists user_outlets_outlet_id_idx on public.user_outlets(outlet_id);

-- ---------------------------------------------------------------------------
-- Audit templates, sections, questions
-- ---------------------------------------------------------------------------
create table if not exists public.audit_templates (
  id             text primary key,
  name           text not null,
  code           text not null unique,
  description    text not null default '',
  segment        text not null check (segment in ('F&B','Entertainment','Both')),
  journey        text not null check (journey in (
                   'In-store / Dine-in','Social Media Interaction','Takeaway','Delivery',
                   'Entertainment Ticketing','Reception','Guest Onboarding','Safety Briefing','Digital Interaction')),
  version        text not null default '1.0',
  status         text not null default 'Draft' check (status in ('Active','Inactive','Draft')),
  section_ids    text[] not null default '{}',
  question_count integer not null default 0,
  is_follow_up   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
select app.attach_updated_at('public.audit_templates');

create table if not exists public.audit_sections (
  id            text primary key,
  template_id   text not null references public.audit_templates(id) on delete cascade,
  code          text not null,
  title         text not null,
  category      text not null check (category in (
                  'customer_experience','service_speed','operational_compliance',
                  'product_environment','upselling_sales','safety_entertainment')),
  description   text not null default '',
  "order"       integer not null default 0,
  applicable_to jsonb not null default '"all"'::jsonb,   -- Segment[] | 'all'
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists audit_sections_template_id_idx on public.audit_sections(template_id);
select app.attach_updated_at('public.audit_sections');

create table if not exists public.audit_questions (
  id                text primary key,
  section_id        text not null references public.audit_sections(id) on delete cascade,
  code              text not null,
  text              text not null,
  type              text not null check (type in (
                      'yes_no','rating_5','rating_10','pass_fail','multiple_choice',
                      'text','numeric','time','photo','video')),
  weight            numeric(6,2) not null default 1 check (weight >= 0),
  critical          boolean not null default false,
  evidence_required boolean not null default false,
  comment_required  boolean not null default false,
  allow_na          boolean not null default false,
  guidance          text not null default '',
  options           text[],
  threshold         numeric(8,2),
  "order"           integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists audit_questions_section_id_idx on public.audit_questions(section_id);
select app.attach_updated_at('public.audit_questions');

-- ---------------------------------------------------------------------------
-- Visits, answers, evidence
-- ---------------------------------------------------------------------------
create table if not exists public.visits (
  id                  text primary key,
  code                text not null unique,
  outlet_id           text not null references public.outlets(id) on delete restrict,
  type                text not null check (type in ('Main Audit 1','Follow-up 1','Main Audit 2','Follow-up 2')),
  journey             text not null check (journey in (
                        'In-store / Dine-in','Social Media Interaction','Takeaway','Delivery',
                        'Entertainment Ticketing','Reception','Guest Onboarding','Safety Briefing','Digital Interaction')),
  template_id         text not null references public.audit_templates(id) on delete restrict,
  shopper_id          text references public.shoppers(id) on delete set null,
  scheduled_date      date not null,
  visit_date          date,
  visit_start         timestamptz,
  visit_end           timestamptz,
  submission_deadline timestamptz,
  submitted_at        timestamptz,
  status              text not null default 'Planned' check (status in (
                        'Planned','Assigned','In Progress','Draft','Submitted',
                        'Under Review','Approved','Rejected','Closed')),
  score               numeric(5,2) check (score is null or score between 0 and 100),
  category_scores     jsonb,
  risk                text check (risk is null or risk in ('Excellent','Good','Needs Improvement','Critical')),
  report_status       text not null default 'Not Started' check (report_status in (
                        'Not Started','Draft','Pending Review','Approved','Rejected','Published')),
  sla_status          text not null default 'Pending' check (sla_status in ('Within SLA','At Risk','Breached','Pending')),
  reviewer_id         text references public.users(id) on delete set null,
  reviewed_at         timestamptz,
  reviewer_comment    text,
  approval_history    jsonb not null default '[]'::jsonb,   -- ApprovalEvent[]
  narrative           text,
  critical_count      integer not null default 0,
  spend               numeric(10,2),
  party_size          integer not null default 1,
  progress            numeric(5,2) not null default 0 check (progress between 0 and 100),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint visits_visit_window check (visit_end is null or visit_start is null or visit_end >= visit_start)
);
create index if not exists visits_outlet_id_status_idx on public.visits(outlet_id, status);
create index if not exists visits_shopper_id_idx      on public.visits(shopper_id);
create index if not exists visits_template_id_idx     on public.visits(template_id);
create index if not exists visits_reviewer_id_idx     on public.visits(reviewer_id);
create index if not exists visits_scheduled_date_idx  on public.visits(scheduled_date);
select app.attach_updated_at('public.visits');

create table if not exists public.visit_answers (
  id           text primary key,
  visit_id     text not null references public.visits(id) on delete cascade,
  question_id  text not null references public.audit_questions(id) on delete cascade,
  value        jsonb,                                  -- string | number | boolean | null
  na           boolean not null default false,
  comment      text not null default '',
  evidence_ids text[] not null default '{}',
  score        numeric(6,4) check (score is null or score between 0 and 1),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (visit_id, question_id)
);
create index if not exists visit_answers_visit_id_idx    on public.visit_answers(visit_id);
create index if not exists visit_answers_question_id_idx on public.visit_answers(question_id);
select app.attach_updated_at('public.visit_answers');

create table if not exists public.evidence (
  id          text primary key,
  visit_id    text not null references public.visits(id) on delete cascade,
  outlet_id   text not null references public.outlets(id) on delete restrict,
  category    text not null check (category in (
                'customer_experience','service_speed','operational_compliance',
                'product_environment','upselling_sales','safety_entertainment')),
  question_id text references public.audit_questions(id) on delete set null,
  type        text not null check (type in ('Photo','Video','Receipt','Screenshot','Document')),
  title       text not null default '',
  description text not null default '',
  captured_at timestamptz not null default now(),
  uploaded_at timestamptz not null default now(),
  uploaded_by text not null default '',
  visual_seed bigint not null default 0,
  file_name   text not null default '',   -- storage object path: <visit_id>/<evidence_id>-<file>
  size_kb     integer not null default 0 check (size_kb >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists evidence_visit_id_idx    on public.evidence(visit_id);
create index if not exists evidence_outlet_id_idx   on public.evidence(outlet_id);
create index if not exists evidence_question_id_idx on public.evidence(question_id);
select app.attach_updated_at('public.evidence');

-- ---------------------------------------------------------------------------
-- Findings, alerts, corrective actions (CAPA)
-- ---------------------------------------------------------------------------
create table if not exists public.findings (
  id                   text primary key,
  code                 text not null unique,
  visit_id             text not null references public.visits(id) on delete cascade,
  outlet_id            text not null references public.outlets(id) on delete restrict,
  question_id          text references public.audit_questions(id) on delete set null,
  category             text not null check (category in (
                         'customer_experience','service_speed','operational_compliance',
                         'product_environment','upselling_sales','safety_entertainment')),
  title                text not null,
  description          text not null default '',
  severity             text not null check (severity in ('Critical','High','Medium','Low')),
  status               text not null default 'Open' check (status in ('Open','In Progress','Resolved','Closed','Verified')),
  repeated             boolean not null default false,
  -- Back-links are intentionally NOT foreign keys: alerts / corrective_actions
  -- reference findings, and a circular FK would break single-statement upserts.
  corrective_action_id text,
  alert_id             text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists findings_visit_id_idx               on public.findings(visit_id);
create index if not exists findings_question_id_idx            on public.findings(question_id);
create index if not exists findings_outlet_status_severity_idx on public.findings(outlet_id, status, severity);
select app.attach_updated_at('public.findings');

create table if not exists public.alerts (
  id              text primary key,
  code            text not null unique,
  severity        text not null check (severity in ('Critical','High','Medium','Low')),
  type            text not null,
  outlet_id       text not null references public.outlets(id) on delete restrict,
  visit_id        text references public.visits(id) on delete set null,
  finding_id      text references public.findings(id) on delete set null,
  title           text not null,
  description     text not null default '',
  escalation_due  timestamptz not null,
  owner_id        text references public.users(id) on delete set null,
  status          text not null default 'New' check (status in (
                    'New','Acknowledged','Investigating','Action Required','Resolved','Closed')),
  acknowledged_at timestamptz,
  resolved_at     timestamptz,
  history         jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists alerts_outlet_id_idx       on public.alerts(outlet_id);
create index if not exists alerts_visit_id_idx        on public.alerts(visit_id);
create index if not exists alerts_finding_id_idx      on public.alerts(finding_id);
create index if not exists alerts_owner_id_idx        on public.alerts(owner_id);
create index if not exists alerts_status_severity_idx on public.alerts(status, severity);
select app.attach_updated_at('public.alerts');

create table if not exists public.corrective_actions (
  id                text primary key,
  code              text not null unique,
  finding_id        text not null references public.findings(id) on delete cascade,
  outlet_id         text not null references public.outlets(id) on delete restrict,
  category          text not null check (category in (
                      'customer_experience','service_speed','operational_compliance',
                      'product_environment','upselling_sales','safety_entertainment')),
  title             text not null,
  description       text not null default '',
  root_cause        text not null default '',
  immediate_action  text not null default '',
  corrective_action text not null default '',
  preventive_action text not null default '',
  owner_id          text references public.users(id) on delete set null,
  owner_name        text not null default '',
  priority          text not null check (priority in ('Critical','High','Medium','Low')),
  target_date       date not null,
  evidence_ids      text[] not null default '{}',
  status            text not null default 'Open' check (status in (
                      'Open','Assigned','In Progress','Awaiting Evidence','Awaiting Verification','Closed','Overdue')),
  reviewer_id       text references public.users(id) on delete set null,
  closure_date      date,
  verification_note text,
  history           jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists corrective_actions_finding_id_idx         on public.corrective_actions(finding_id);
create index if not exists corrective_actions_outlet_id_idx          on public.corrective_actions(outlet_id);
create index if not exists corrective_actions_owner_id_idx           on public.corrective_actions(owner_id);
create index if not exists corrective_actions_reviewer_id_idx        on public.corrective_actions(reviewer_id);
create index if not exists corrective_actions_status_target_date_idx on public.corrective_actions(status, target_date);
select app.attach_updated_at('public.corrective_actions');

-- ---------------------------------------------------------------------------
-- Comments, notifications, activity logs
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id          text primary key,
  entity_type text not null check (entity_type in ('visit','finding','corrective_action','alert')),
  entity_id   text not null,
  user_id     text not null references public.users(id) on delete restrict,
  user_name   text not null default '',
  text        text not null check (length(text) between 1 and 4000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists comments_user_id_idx on public.comments(user_id);
create index if not exists comments_entity_idx  on public.comments(entity_type, entity_id);
select app.attach_updated_at('public.comments');

create table if not exists public.notifications (
  id         text primary key,
  type       text not null check (type in (
               'critical_issue','visit_due','report_submitted','report_overdue',
               'action_overdue','approval_required','assignment','escalation')),
  title      text not null,
  message    text not null default '',
  read       boolean not null default false,
  link       text not null default '',
  severity   text not null default 'Info' check (severity in ('Critical','High','Medium','Low','Info')),
  audience   text[] not null default '{}'
             check (audience <@ array['super_admin','client_admin','ops_manager','shopper','analyst','executive']::text[]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notifications_created_at_idx on public.notifications(created_at desc);
create index if not exists notifications_audience_idx   on public.notifications using gin(audience);
select app.attach_updated_at('public.notifications');

-- Immutable audit trail: no updated_at, no update/delete policies (see 0002).
create table if not exists public.activity_logs (
  id          text primary key,
  "timestamp" timestamptz not null default now(),
  user_id     text,
  user_name   text not null default '',
  action      text not null,
  module      text not null default '',
  record_id   text not null default '',
  ip          text not null default '',
  result      text not null default 'Success' check (result in ('Success','Failed','Denied')),
  details     text,
  created_at  timestamptz not null default now()
);
create index if not exists activity_logs_timestamp_idx on public.activity_logs("timestamp" desc);
create index if not exists activity_logs_user_id_idx   on public.activity_logs(user_id);

-- ---------------------------------------------------------------------------
-- Configuration: KPI weights / notification rules
-- ---------------------------------------------------------------------------
-- KpiConfig has no `id` field; the client upserts with onConflict 'id', so `id`
-- is a generated alias of `key` (unique) to satisfy the arbiter index.
create table if not exists public.kpi_config (
  key                text primary key check (key in (
                       'customer_experience','service_speed','operational_compliance',
                       'product_environment','upselling_sales','safety_entertainment')),
  id                 text generated always as (key) stored unique,
  name               text not null,
  description        text not null default '',
  weight             numeric(5,2) not null check (weight between 0 and 100),
  target             numeric(5,2) not null check (target between 0 and 100),
  critical_threshold numeric(5,2) not null check (critical_threshold between 0 and 100),
  data_source        text not null default '',
  applicable_to      jsonb not null default '"all"'::jsonb,   -- Segment[] | 'all'
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
select app.attach_updated_at('public.kpi_config');

create table if not exists public.notification_rules (
  id               text primary key,
  name             text not null,
  trigger          text not null,
  channel          text[] not null default '{}' check (channel <@ array['In-app','Email','SMS']::text[]),
  recipients       text[] not null default '{}'
                   check (recipients <@ array['super_admin','client_admin','ops_manager','shopper','analyst','executive']::text[]),
  severity         text not null default 'Info' check (severity in ('Critical','High','Medium','Low','Info')),
  enabled          boolean not null default true,
  escalation_hours integer check (escalation_hours is null or escalation_hours > 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
select app.attach_updated_at('public.notification_rules');

-- ---------------------------------------------------------------------------
-- Management reports
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id           text primary key,
  code         text not null unique,
  title        text not null,
  type         text not null check (type in (
                 'Executive Summary','Main Audit Report','Follow-up Report','Quarterly Performance',
                 'Outlet Performance','Risk & Compliance','Corrective Action','Trend Analysis')),
  period       text not null default '',
  generated_at timestamptz not null default now(),
  generated_by text not null default '',
  status       text not null default 'Draft' check (status in ('Draft','Final','Published')),
  scope        text not null default '',
  outlet_ids   text[] not null default '{}',
  summary      text not null default '',
  pages        integer not null default 0 check (pages >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists reports_generated_at_idx on public.reports(generated_at desc);
select app.attach_updated_at('public.reports');

-- Helper no longer needed at runtime.
drop function if exists app.attach_updated_at(regclass);
