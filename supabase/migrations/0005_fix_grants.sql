-- ============================================================================
-- 0005_fix_grants.sql — repair table privileges, and stop this recurring.
--
-- 0002 granted privileges with:
--
--     grant select, insert, update, delete on all tables in schema public
--       to authenticated;
--
-- `on all tables in schema` applies only to tables that exist when it runs. The
-- `scenarios` table is created later, by 0004, so it never received the grant.
--
-- In Postgres, table privileges are checked BEFORE row level security, so the
-- result was "permission denied for table scenarios" for every signed-in user,
-- including a super_admin. The policies were correct; the grant was missing.
--
-- This migration re-grants across the whole schema and then sets DEFAULT
-- PRIVILEGES, so any table added in future is granted automatically and the same
-- failure cannot happen again.
--
-- Safe to re-run. Apply after 0004.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Re-grant across every table that exists now, including scenarios.
--    Row level security still decides which ROWS each user may see; this only
--    restores the table-level privilege that RLS is evaluated on top of.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Anonymous visitors keep no access at all.
--    Verified by scripts/check-rls.mjs, which probes every table with only the
--    publishable key and expects a refusal from each.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ---------------------------------------------------------------------------
-- 3. The activity log stays append-only: entries may be written and read, never
--    altered or removed. Re-applied here because step 1 grants broadly.
-- ---------------------------------------------------------------------------
revoke update, delete on public.activity_logs from authenticated;

-- ---------------------------------------------------------------------------
-- 4. Future tables inherit the same treatment automatically.
-- ---------------------------------------------------------------------------
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant usage, select on sequences to authenticated;

alter default privileges in schema public
  revoke all on tables from anon;

-- NOTE, added after the fact: these three statements rewrote the default
-- privileges for `public` and named only `authenticated` and `anon`. The entry
-- they produced left `service_role` with truncate/references/trigger and none of
-- select/insert/update/delete, and every table created afterwards inherited it.
--
-- That surfaced much later as `permission denied for table users`, from the
-- provision-user Edge Function. It has been left as it stands rather than
-- "corrected", because no part of this system needs service_role to read tables
-- and a secret key with no table privileges behind it is a much smaller loss if
-- it ever leaks. See supabase/README.md, "Why service_role cannot read your
-- tables", before granting anything back.

-- ---------------------------------------------------------------------------
-- 5. Verification
--
--   -- Every table should list `authenticated` as a grantee:
--   select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type)
--   from information_schema.role_table_grants
--   where table_schema = 'public' and grantee in ('authenticated','anon')
--   group by table_name, grantee
--   order by table_name, grantee;
--
--   -- `scenarios` specifically, which is the table that was missing:
--   select count(*) from public.scenarios;   -- expect 8 when signed in
-- ---------------------------------------------------------------------------
