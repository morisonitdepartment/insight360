-- ============================================================================
-- verify_install.sql — health check for the Live Mode database.
--
-- Run this in the Supabase SQL Editor after applying the migrations. It reports,
-- per expectation, whether the objects each migration should have created are
-- present. Safe to run repeatedly, and safe to run when migrations are only
-- partially applied.
--
-- It installs two small helper functions in the `app` schema (app.safe_count and
-- app.safe_sum). They are needed because Postgres validates every table
-- reference when it parses a query, so a plain `select count(*) from
-- public.scenarios` fails outright when that table does not exist yet — which is
-- exactly the situation this script has to report on. The helpers look the table
-- up first and return -1 instead of failing.
--
-- Expected result once 0001-0004 have all applied: every row reads OK.
-- ============================================================================

create schema if not exists app;

-- Counts rows in a table, returning -1 when the table does not exist.
create or replace function app.safe_count(p_table text)
returns bigint
language plpgsql
as $$
declare n bigint;
begin
  if to_regclass(p_table) is null then
    return -1;
  end if;
  execute format('select count(*) from %s', p_table) into n;
  return n;
end;
$$;

-- Sums a column, returning -1 when the table or column is absent.
create or replace function app.safe_sum(p_table text, p_column text)
returns numeric
language plpgsql
as $$
declare n numeric;
begin
  if to_regclass(p_table) is null then
    return -1;
  end if;
  begin
    execute format('select coalesce(sum(%I), 0) from %s', p_column, p_table) into n;
  exception when undefined_column then
    return -1;
  end;
  return n;
end;
$$;

with expectations as (

  -- ---- 0001: helpers and core tables ----
  select 1 as seq, '0001' as from_migration, 'app.set_updated_at() exists' as check_name,
         (to_regprocedure('app.set_updated_at()') is not null) as passed
  union all
  select 2, '0001', 'app.attach_updated_at(regclass) exists',
         (to_regprocedure('app.attach_updated_at(regclass)') is not null)
  union all
  select 3, '0001', 'core tables present (expect 26)',
         (select count(*) >= 26 from information_schema.tables
           where table_schema = 'public'
             and table_name in ('organizations','roles','permissions','role_permissions','user_roles',
                                'user_outlets','brands','outlets','shoppers','training_modules',
                                'users','audit_templates','audit_sections','audit_questions','visits',
                                'visit_answers','evidence','findings','alerts','corrective_actions',
                                'comments','notifications','activity_logs','kpi_config','reports',
                                'notification_rules'))

  -- ---- 0002: RLS helpers, RLS enabled, policies, storage ----
  union all
  select 4, '0002', 'app.current_user_id() exists',
         (to_regprocedure('app.current_user_id()') is not null)
  union all
  select 5, '0002', 'app.has_permission(text) exists',
         (to_regprocedure('app.has_permission(text)') is not null)
  union all
  select 6, '0002', 'app.is_app_user() exists',
         (to_regprocedure('app.is_app_user()') is not null)
  union all
  select 7, '0002', 'app.is_super_admin() exists',
         (to_regprocedure('app.is_super_admin()') is not null)
  union all
  select 8, '0002', 'RLS enabled on every public table',
         coalesce((select bool_and(c.relrowsecurity)
                     from pg_class c
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relkind = 'r'), false)
  union all
  select 9, '0002', 'policies created (expect 40+)',
         (select count(*) >= 40 from pg_policies where schemaname = 'public')
  union all
  select 10, '0002', 'evidence storage bucket exists',
         (app.safe_count('storage.buckets') >= 0
          and exists (select 1 from storage.buckets where id = 'evidence'))

  -- ---- 0003: reference seeds ----
  union all
  select 11, '0003', 'organization row seeded',
         (app.safe_count('public.organizations') = 1)
  union all
  select 12, '0003', 'roles seeded (expect 6)',
         (app.safe_count('public.roles') >= 6)
  union all
  select 13, '0003', 'permissions seeded (expect 36)',
         (app.safe_count('public.permissions') >= 36)
  union all
  select 14, '0003', 'kpi_config seeded (expect 6)',
         (app.safe_count('public.kpi_config') = 6)
  union all
  select 15, '0003', 'kpi weights total 100',
         (app.safe_sum('public.kpi_config', 'weight') = 100)
  union all
  select 16, '0003', 'notification_rules seeded (expect 12)',
         (app.safe_count('public.notification_rules') >= 12)
  union all
  select 17, '0003', 'training_modules seeded (expect 7)',
         (app.safe_count('public.training_modules') >= 7)

  -- ---- 0004: scenarios and the two-tier SLA ----
  union all
  select 18, '0004', 'scenarios table exists',
         (to_regclass('public.scenarios') is not null)
  union all
  select 19, '0004', 'scenarios seeded (expect 8)',
         (app.safe_count('public.scenarios') >= 8)
  union all
  select 20, '0004', 'visits.scenario_id column added',
         (select count(*) = 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'visits' and column_name = 'scenario_id')
  union all
  select 21, '0004', 'organizations.reporting_target_hours added',
         (select count(*) = 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'organizations'
             and column_name = 'reporting_target_hours')

  -- ---- Clean install: transactional tables still empty ----
  union all
  select 22, 'fresh', 'no outlets yet (clean install)',
         (app.safe_count('public.outlets') = 0)
  union all
  select 23, 'fresh', 'no visits yet (clean install)',
         (app.safe_count('public.visits') = 0)
)
select
  from_migration                                as "migration",
  check_name                                    as "check",
  case when passed then 'OK' else 'MISSING' end as "result"
from expectations
order by seq;
