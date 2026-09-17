-- ============================================================================
-- verify_install.sql — read-only health check for the Live Mode database.
--
-- Run this in the Supabase SQL Editor after applying the migrations. It changes
-- nothing. Each row reports one expectation and whether it is met.
--
-- Expected result when 0001-0004 have all applied cleanly:
--   every row shows OK
-- ============================================================================

with expectations as (

  -- 0001: helper functions
  select 1 as seq, 'app.set_updated_at() exists' as check_name,
         (to_regprocedure('app.set_updated_at()') is not null) as passed,
         '0001' as from_migration
  union all
  select 2, 'app.attach_updated_at(regclass) exists',
         (to_regprocedure('app.attach_updated_at(regclass)') is not null), '0001'

  -- 0001: core tables
  union all
  select 3, 'core tables present (expect 26)',
         (select count(*) >= 26 from information_schema.tables
           where table_schema = 'public'
             and table_name in ('organizations','roles','permissions','role_permissions','user_roles',
                                'user_outlets','brands','outlets','shoppers','training_modules',
                                'users','audit_templates','audit_sections','audit_questions','visits',
                                'visit_answers','evidence','findings','alerts','corrective_actions',
                                'comments','notifications','activity_logs','kpi_config','reports',
                                'notification_rules')), '0001'

  -- 0002: RLS helper functions
  union all
  select 4, 'app.current_user_id() exists',
         (to_regprocedure('app.current_user_id()') is not null), '0002'
  union all
  select 5, 'app.has_permission(text) exists',
         (to_regprocedure('app.has_permission(text)') is not null), '0002'
  union all
  select 6, 'app.is_app_user() exists',
         (to_regprocedure('app.is_app_user()') is not null), '0002'
  union all
  select 7, 'app.is_super_admin() exists',
         (to_regprocedure('app.is_super_admin()') is not null), '0002'

  -- 0002: row level security actually enabled
  union all
  select 8, 'RLS enabled on every public table',
         (select bool_and(c.relrowsecurity)
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r'), '0002'
  union all
  select 9, 'policies created (expect 40+)',
         (select count(*) >= 40 from pg_policies where schemaname = 'public'), '0002'

  -- 0003: reference seeds
  union all
  select 10, 'organization row seeded',
         (select count(*) = 1 from public.organizations), '0003'
  union all
  select 11, 'roles seeded (expect 6)',
         (select count(*) >= 6 from public.roles), '0003'
  union all
  select 12, 'permissions seeded (expect 36)',
         (select count(*) >= 36 from public.permissions), '0003'
  union all
  select 13, 'kpi_config seeded, weights total 100',
         (select count(*) = 6 and sum(weight) = 100 from public.kpi_config), '0003'
  union all
  select 14, 'notification_rules seeded (expect 12)',
         (select count(*) >= 12 from public.notification_rules), '0003'
  union all
  select 15, 'training_modules seeded (expect 7)',
         (select count(*) >= 7 from public.training_modules), '0003'

  -- 0004: scenarios and the two-tier SLA
  union all
  select 16, 'scenarios table exists',
         (to_regclass('public.scenarios') is not null), '0004'
  union all
  select 17, 'scenarios seeded (expect 8)',
         (select case when to_regclass('public.scenarios') is null then false
                 else (select count(*) >= 8 from public.scenarios) end), '0004'
  union all
  select 18, 'visits.scenario_id column added',
         (select count(*) = 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'visits' and column_name = 'scenario_id'), '0004'
  union all
  select 19, 'organizations.reporting_target_hours added',
         (select count(*) = 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'organizations'
             and column_name = 'reporting_target_hours'), '0004'

  -- Storage bucket for evidence uploads
  union all
  select 20, 'evidence storage bucket exists',
         (select count(*) = 1 from storage.buckets where id = 'evidence'), '0002'

  -- Transactional tables should be empty on a fresh production install
  union all
  select 21, 'no outlets yet (clean install)',
         (select count(*) = 0 from public.outlets), 'fresh'
  union all
  select 22, 'no visits yet (clean install)',
         (select count(*) = 0 from public.visits), 'fresh'
)
select
  from_migration                        as "migration",
  check_name                            as "check",
  case when passed then 'OK' else 'MISSING' end as "result"
from expectations
order by seq;
