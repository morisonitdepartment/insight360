-- ============================================================================
-- INSIGHT360 — 0003_seed_reference.sql
-- Reference data: organisation defaults, roles, permissions, the role ->
-- permission matrix, training modules, KPI weights and notification rules.
--
-- Sources of truth (kept byte-for-byte in step with this file):
--   * src/data/defaults.ts     — DEFAULT_ORGANIZATION, DEFAULT_KPI_CONFIG,
--                                TRAINING_MODULES, DEFAULT_NOTIFICATION_RULES
--   * src/config/permissions.ts— PERMISSIONS, ROLE_PERMISSIONS,
--                                ROLE_LABELS, ROLE_DESCRIPTIONS, READ_ONLY_ROLES
--
-- Every statement is idempotent (`on conflict ... do nothing` against the
-- table's own primary key), so the migration can be replayed safely.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Organisation (DEFAULT_ORGANIZATION)
-- ---------------------------------------------------------------------------
insert into public.organizations (
  id, name, engagement_name, engagement_start, engagement_end,
  reporting_sla_hours, escalation_sla_hours, timezone, currency, locale
) values (
  'org-001',
  'Demo Hospitality & Entertainment Group',
  'Mystery Shopping Programme 2025/26',
  date '2025-10-01',
  date '2026-11-30',
  48,
  24,
  'Asia/Qatar (GMT+3)',
  'QAR',
  'en-QA'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Roles (ROLE_LABELS / ROLE_DESCRIPTIONS / READ_ONLY_ROLES)
-- Primary key is `key`.
-- ---------------------------------------------------------------------------
insert into public.roles (key, label, description, read_only) values
  ('super_admin',  'Super Admin',
   'Full platform administration: users, templates, scoring, alerts, approvals and system settings.', false),
  ('client_admin', 'Client Admin',
   'Client-side administrator with full visibility across authorised outlets and stakeholder management.', false),
  ('ops_manager',  'Operations Manager',
   'Regional / operations manager restricted to assigned outlets; manages corrective actions.', false),
  ('shopper',      'Mystery Shopper',
   'Auditor conducting assigned mystery-shopping visits and submitting evidence-based assessments.', false),
  ('analyst',      'Analyst',
   'Analytics and reporting specialist with read access to all performance data and exports.', true),
  ('executive',    'Executive',
   'Read-only executive visibility: dashboard, rankings, risks, trends, alerts and reports.', true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Permissions (PERMISSIONS — 36 keys)
-- Primary key is `key`.
-- ---------------------------------------------------------------------------
insert into public.permissions (key, description) values
  -- Overview & performance
  ('dashboard.executive',  'View executive dashboard'),
  ('dashboard.overview',   'View overview'),
  ('analytics.view',       'View KPI analytics, benchmarking and trends'),
  ('outlets.view',         'View outlet performance'),
  ('outlets.compare',      'Compare outlets'),
  -- Operations
  ('visits.view',          'View visits'),
  ('visits.create',        'Create visits'),
  ('visits.assign',        'Assign / reassign shoppers'),
  ('visits.review',        'Review, approve or reject visits'),
  ('visits.conduct',       'Conduct assessment (questionnaire)'),
  ('calendar.view',        'View audit calendar'),
  ('shoppers.view',        'View mystery shoppers'),
  ('shoppers.manage',      'Manage mystery shoppers & training'),
  -- Quality
  ('findings.view',        'View findings & issues'),
  ('findings.comment',     'Comment on findings'),
  ('actions.view',         'View corrective actions'),
  ('actions.manage',       'Create / update corrective actions'),
  ('alerts.view',          'View alerts & escalations'),
  ('alerts.manage',        'Acknowledge / resolve alerts'),
  ('alerts.configure',     'Configure alert rules'),
  -- Reports & evidence
  ('reports.visit',        'View visit reports'),
  ('reports.management',   'View management reports'),
  ('reports.build',        'Use report builder'),
  ('reports.export',       'Export data'),
  ('evidence.view',        'View evidence library'),
  ('evidence.upload',      'Upload evidence'),
  -- Administration
  ('admin.outlets',        'Manage outlets'),
  ('admin.users',          'Manage users'),
  ('admin.stakeholders',   'Manage client stakeholder accounts'),
  ('admin.roles',          'View roles & permissions'),
  ('admin.roles.edit',     'Edit role permissions'),
  ('admin.templates',      'Manage audit templates'),
  ('admin.kpi',            'Configure KPIs & scoring'),
  ('admin.notifications',  'Configure notification rules'),
  ('admin.settings',       'System settings'),
  ('admin.logs',           'Inspect activity logs')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Role -> permission matrix (ROLE_PERMISSIONS)
-- Primary key is (role, permission).
-- ---------------------------------------------------------------------------

-- super_admin: every permission key.
insert into public.role_permissions (role, permission)
select 'super_admin', p.key from public.permissions p
on conflict (role, permission) do nothing;

-- client_admin (24)
insert into public.role_permissions (role, permission)
select 'client_admin', k from unnest(array[
  'dashboard.executive','dashboard.overview','analytics.view','outlets.view','outlets.compare',
  'visits.view','visits.review','calendar.view','shoppers.view',
  'findings.view','findings.comment','actions.view','actions.manage','alerts.view','alerts.manage',
  'reports.visit','reports.management','reports.build','reports.export','evidence.view',
  'admin.outlets','admin.stakeholders','admin.roles','admin.logs'
]) as k
on conflict (role, permission) do nothing;

-- ops_manager (17)
insert into public.role_permissions (role, permission)
select 'ops_manager', k from unnest(array[
  'dashboard.overview','dashboard.executive','analytics.view','outlets.view','outlets.compare',
  'visits.view','calendar.view',
  'findings.view','findings.comment','actions.view','actions.manage','alerts.view','alerts.manage',
  'reports.visit','reports.management','reports.export','evidence.view'
]) as k
on conflict (role, permission) do nothing;

-- shopper (6)
insert into public.role_permissions (role, permission)
select 'shopper', k from unnest(array[
  'dashboard.overview','visits.view','visits.conduct','calendar.view','evidence.upload','evidence.view'
]) as k
on conflict (role, permission) do nothing;

-- analyst (16)
insert into public.role_permissions (role, permission)
select 'analyst', k from unnest(array[
  'dashboard.overview','dashboard.executive','analytics.view','outlets.view','outlets.compare',
  'visits.view','calendar.view','shoppers.view',
  'findings.view','actions.view','alerts.view',
  'reports.visit','reports.management','reports.build','reports.export','evidence.view'
]) as k
on conflict (role, permission) do nothing;

-- executive (10)
insert into public.role_permissions (role, permission)
select 'executive', k from unnest(array[
  'dashboard.overview','dashboard.executive','analytics.view','outlets.view','outlets.compare',
  'findings.view','actions.view','alerts.view','reports.visit','reports.management'
]) as k
on conflict (role, permission) do nothing;

-- ---------------------------------------------------------------------------
-- Training modules (TRAINING_MODULES)
-- ---------------------------------------------------------------------------
insert into public.training_modules (id, name, validity_months) values
  ('trn-01', 'Mystery Shopping Ethics',            12),
  ('trn-02', 'Scenario Briefing',                   6),
  ('trn-03', 'Evidence Collection',                12),
  ('trn-04', 'F&B Assessment',                     12),
  ('trn-05', 'Entertainment Safety Assessment',    12),
  ('trn-06', 'Report Writing',                     12),
  ('trn-07', 'Confidentiality',                    12)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- KPI configuration (DEFAULT_KPI_CONFIG) — weights total 100.
-- Primary key is `key`; `id` is a generated alias of `key`.
-- ---------------------------------------------------------------------------
insert into public.kpi_config (key, name, description, weight, target, critical_threshold, data_source, applicable_to) values
  ('customer_experience',   'Customer Experience',
   'Greeting, engagement, staff attitude, professionalism and digital touchpoints.',
   25, 90, 70, 'Sections A, C, G', '"all"'::jsonb),
  ('service_speed',         'Service Speed',
   'Measured greeting, ordering, delivery and queue times against service standards.',
   15, 88, 65, 'Section B (time measurements)', '"all"'::jsonb),
  ('operational_compliance','Operational Compliance',
   'SOP adherence, order and billing accuracy, payment and process compliance.',
   20, 92, 75, 'Section D', '"all"'::jsonb),
  ('product_environment',   'Product & Environment',
   'Product quality, presentation, cleanliness, hygiene, ambience and facility condition.',
   20, 90, 70, 'Sections E, H', '"all"'::jsonb),
  ('upselling_sales',       'Upselling & Sales',
   'Suggestive selling, cross-selling and promotion awareness.',
   10, 80, 50, 'Section D2', '"all"'::jsonb),
  ('safety_entertainment',  'Safety & Entertainment Compliance',
   'Food-safety compliance (F&B) and ticketing, onboarding, safety briefing and equipment (Entertainment).',
   10, 95, 80, 'Section F', '"all"'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Notification rules (DEFAULT_NOTIFICATION_RULES — 12 rows)
-- ---------------------------------------------------------------------------
insert into public.notification_rules (id, name, trigger, channel, recipients, severity, enabled, escalation_hours) values
  ('nr-01', 'Critical safety breach',           'Critical question failed (safety)',
   array['In-app','Email','SMS'], array['super_admin','client_admin','ops_manager','executive'], 'Critical', true,  12),
  ('nr-02', 'Food hygiene failure',             'Critical question failed (food safety)',
   array['In-app','Email','SMS'], array['super_admin','client_admin','ops_manager'],             'Critical', true,  12),
  ('nr-03', 'Severe customer complaint',        'Problem-solving answered "Not resolved / ignored"',
   array['In-app','Email'],       array['client_admin','ops_manager'],                           'High',     true,  24),
  ('nr-04', 'Incorrect billing',                'Billing accuracy failed',
   array['In-app','Email'],       array['client_admin','ops_manager'],                           'High',     true,  24),
  ('nr-05', 'Queue time threshold exceeded',    'Queue waiting time > 2x standard',
   array['In-app'],               array['ops_manager'],                                          'Medium',   true,  48),
  ('nr-06', 'Outlet score below 70%',           'Approved visit score < 70',
   array['In-app','Email'],       array['super_admin','client_admin','ops_manager','executive'], 'High',     true,  24),
  ('nr-07', 'Repeated finding',                 'Same finding in two consecutive assessments',
   array['In-app','Email'],       array['client_admin','ops_manager'],                           'High',     true,  48),
  ('nr-08', 'Report SLA breach',                'Report submitted > 48h after visit',
   array['In-app'],               array['super_admin'],                                          'Medium',   true,  null),
  ('nr-09', 'Approval required',                'Report submitted for review',
   array['In-app','Email'],       array['super_admin','client_admin'],                           'Info',     true,  null),
  ('nr-10', 'Corrective action overdue',        'Target date passed without closure',
   array['In-app','Email'],       array['client_admin','ops_manager'],                           'High',     true,  null),
  ('nr-11', 'Shopper assignment',               'Visit assigned to shopper',
   array['In-app','Email'],       array['shopper'],                                              'Info',     true,  null),
  ('nr-12', 'Visit due reminder',               '24h before scheduled visit',
   array['In-app','SMS'],         array['shopper'],                                              'Info',     false, null)
on conflict (id) do nothing;

-- ============================================================================
-- Optional: populating a live environment with the demonstration dataset
-- ----------------------------------------------------------------------------
-- This migration seeds REFERENCE data only. Transactional data (brands,
-- outlets, shoppers, templates/sections/questions, visits, answers, evidence,
-- findings, alerts, corrective actions, comments, notifications, activity logs
-- and management reports) is produced deterministically in the browser by
-- `generateDataset()` in src/data/seed.ts.
--
-- If you want a *populated* live environment rather than an empty one, export
-- that dataset once and import it — the generator is seeded, so the result is
-- byte-stable across runs:
--
--   1. Run the app in demo mode and, from the browser console (or a small Node
--      script that imports src/data/seed.ts), serialise the dataset:
--          copy(JSON.stringify(generateDataset(), null, 2))
--      Every collection key maps to the table named in the TABLES map of
--      src/repositories/supabaseRepository.ts (e.g. `templates` ->
--      audit_templates, `answers` -> visit_answers, `correctiveActions` ->
--      corrective_actions), and every camelCase field maps to its snake_case
--      column.
--   2. Convert each collection to CSV (or generate INSERT statements) and load
--      it with the Supabase CLI / psql, respecting foreign-key order:
--          brands -> outlets -> shoppers -> users -> audit_templates ->
--          audit_sections -> audit_questions -> visits -> visit_answers ->
--          evidence -> findings -> alerts -> corrective_actions -> comments ->
--          notifications -> activity_logs -> reports
--      e.g.  \copy public.outlets (id, code, name, brand_id, ...) from 'outlets.csv' with (format csv, header true)
--   3. Import as the service role (`supabase db push`, `psql` with the
--      connection string, or the SQL editor). Those contexts bypass RLS; the
--      policies in 0002 still govern every request made with the anon key.
--
-- Remember that public.users.auth_id must point at a real auth.users row for a
-- profile to be reachable at sign-in — see supabase/README.md.
-- ============================================================================
