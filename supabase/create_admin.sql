-- ============================================================================
-- create_admin.sql — link a Supabase Auth account to an INSIGHT360 profile.
--
-- Supabase Auth owns the password. This table owns the role. Until a row here
-- points at an auth account, nobody can sign in — the app resolves the role from
-- `public.users`, never from anything the browser sends, which is what stops a
-- user granting themselves permissions.
--
-- BEFORE RUNNING
--   1. Authentication -> Users -> Add user -> Create new user
--      Enter the real email and a password, and tick "Auto Confirm User".
--   2. Replace the three values in the `details` block below.
--
-- Safe to re-run, and safe to run for several administrators: the row id is
-- derived from the email, so each person gets their own record.
-- ============================================================================

with details as (
  select
    'REPLACE-WITH-THE-EMAIL-YOU-CREATED'::text as email,      -- must match the Auth user exactly
    'Administrator Name'::text                 as full_name,
    'Platform Administrator'::text             as job_title
),
auth_account as (
  select
    u.id                                       as auth_id,
    d.email,
    d.full_name,
    d.job_title,
    'usr-' || substr(md5(lower(d.email)), 1, 10) as user_id   -- stable per email, so re-runs match
  from details d
  join auth.users u on lower(u.email) = lower(d.email)
),
upserted as (
  insert into public.users (id, auth_id, name, email, role, status, title, outlet_ids, brand_ids, mfa_enabled)
  select a.user_id, a.auth_id, a.full_name, a.email, 'super_admin', 'active', a.job_title, '{}', '{}', false
  from auth_account a
  on conflict (email) do update
    set auth_id = excluded.auth_id,
        role    = 'super_admin',
        status  = 'active',
        name    = excluded.name,
        title   = excluded.title
  returning id, email, role, status
)
select
  case
    when not exists (select 1 from auth_account)
      then 'NO MATCHING AUTH USER - create the user under Authentication -> Users first, and check the email matches exactly'
    else 'OK - administrator linked. Sign in to the app with this email and the password you set.'
  end                            as result,
  (select id     from upserted)  as user_id,
  (select email  from upserted)  as email,
  (select role   from upserted)  as role,
  (select status from upserted)  as status;

-- ---------------------------------------------------------------------------
-- Afterwards, confirm the link is sound:
--
--   select u.id, u.email, u.role, u.status, (u.auth_id is not null) as linked
--   from public.users u;
--
-- `linked` must be true. If it is false the profile exists but cannot sign in.
-- ---------------------------------------------------------------------------
