-- ============================================================================
-- 0006_user_provisioning.sql — one safe way to onboard an employee.
--
-- Adding a person by hand means getting several things right at once: matching
-- the Auth account, deriving a stable id, satisfying the users_shopper_link
-- constraint for field auditors, and translating outlet codes into outlet ids.
-- Getting any of them wrong produces a user who either cannot sign in or —
-- worse, because it is silent — can see the wrong outlets.
--
-- app.provision_user() does all of it in one call, in order, and reports what it
-- actually did. It is the only supported way to create a login.
--
-- NOT callable from the application. Execute is revoked from every browser-facing
-- role, so it runs only from the Supabase SQL editor or a service-role
-- connection. Creating logins is an administrator action performed deliberately,
-- not something the web app should be able to trigger.
--
-- Safe to re-run. Apply after 0005.
-- ============================================================================

create or replace function app.provision_user(
  p_email        text,
  p_name         text,
  p_title        text,
  p_role         text,
  p_outlet_codes text default '',          -- '' = every outlet
  p_gender       text default 'Female',    -- shoppers only
  p_age_range    text default '25-34',     -- shoppers only
  p_profile      text default 'Individual' -- shoppers only
)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_email        text := lower(trim(coalesce(p_email, '')));
  v_role         text := trim(coalesce(p_role, ''));
  v_auth_id      uuid;
  v_user_id      text;
  v_shopper_id   text;
  v_wanted       text[];
  v_outlet_ids   text[];
  v_matched      text[];
  v_missing      text[];
  v_access       text;
  v_note         text := '';
begin
  -- ---------------------------------------------------------------------
  -- Validate before touching anything, so a typo changes nothing.
  -- ---------------------------------------------------------------------
  if v_email = '' then
    return 'FAILED - email is required.';
  end if;

  if v_role not in ('super_admin','client_admin','ops_manager','shopper','analyst','executive') then
    return format(
      'FAILED - %L is not a role. Use one of: super_admin, client_admin, ops_manager, shopper, analyst, executive.',
      p_role);
  end if;

  -- Supabase Auth owns the password. Without an account there, nothing we write
  -- here can produce a working login, so stop rather than leave a dead profile.
  select a.id into v_auth_id
  from auth.users a
  where lower(a.email) = v_email;

  if v_auth_id is null then
    return format(
      'FAILED - no Auth user for %s. Create it under Authentication -> Users (tick "Auto Confirm User"), then run this again.',
      v_email);
  end if;

  -- Ids derived from the email, so re-running updates the same person instead
  -- of creating a second record.
  v_user_id    := 'usr-' || substr(md5(v_email), 1, 10);
  v_shopper_id := 'shp-' || substr(md5(v_email), 1, 10);

  -- ---------------------------------------------------------------------
  -- Outlet codes -> outlet ids. Unmatched codes are reported, never dropped
  -- silently: a typo here means a manager quietly loses sight of a site.
  -- ---------------------------------------------------------------------
  select coalesce(array_agg(upper(trim(c))), '{}')
    into v_wanted
  from unnest(string_to_array(coalesce(p_outlet_codes, ''), ',')) as c
  where trim(c) <> '';

  if cardinality(v_wanted) > 0 then
    select coalesce(array_agg(o.id order by o.code), '{}'),
           coalesce(array_agg(o.code order by o.code), '{}')
      into v_outlet_ids, v_matched
    from public.outlets o
    where upper(o.code) = any(v_wanted);

    select coalesce(array_agg(w), '{}')
      into v_missing
    from unnest(v_wanted) as w
    where w <> all(coalesce(v_matched, '{}'));
  else
    v_outlet_ids := '{}';
    v_matched    := '{}';
    v_missing    := '{}';
  end if;

  -- ---------------------------------------------------------------------
  -- A field auditor needs a shoppers record first: users_shopper_link (0001)
  -- refuses a 'shopper' row without one. Done as its own statement so the
  -- foreign key is already satisfied when the profile is written.
  -- ---------------------------------------------------------------------
  if v_role = 'shopper' then
    insert into public.shoppers (id, code, name, gender, age_range, profile_type, email, status)
    values (v_shopper_id,
            'MS-' || upper(substr(md5(v_email), 1, 6)),
            trim(p_name), p_gender, p_age_range, p_profile, v_email, 'Active')
    on conflict (id) do update
      set name = excluded.name, email = excluded.email;
  end if;

  -- ---------------------------------------------------------------------
  -- The profile. This is where the role lives; the app reads it from here and
  -- never from anything the browser sends.
  -- ---------------------------------------------------------------------
  insert into public.users (
    id, auth_id, name, email, role, status, title,
    outlet_ids, brand_ids, mfa_enabled, shopper_id
  )
  values (
    v_user_id, v_auth_id, trim(p_name), v_email, v_role, 'active', trim(coalesce(p_title, '')),
    v_outlet_ids, '{}', false,
    case when v_role = 'shopper' then v_shopper_id else null end
  )
  on conflict (email) do update
    set auth_id    = excluded.auth_id,
        name       = excluded.name,
        role       = excluded.role,
        status     = 'active',
        title      = excluded.title,
        outlet_ids = excluded.outlet_ids,
        shopper_id = excluded.shopper_id;

  -- ---------------------------------------------------------------------
  -- Report what was actually granted, including the ways it may be wrong.
  -- ---------------------------------------------------------------------
  v_access := case
    when cardinality(v_outlet_ids) = 0 then 'all outlets'
    else array_to_string(v_matched, ', ')
  end;

  if cardinality(v_missing) > 0 then
    v_note := v_note || format(
      ' WARNING: no outlet matches %s - check the codes under Administration -> Outlets.',
      array_to_string(v_missing, ', '));
  end if;

  -- An ops_manager is scoped by explicit list only; an empty list is fail-closed
  -- and shows them nothing at all.
  if v_role = 'ops_manager' and cardinality(v_outlet_ids) = 0 then
    v_note := v_note ||
      ' WARNING: an ops_manager with no outlets sees nothing. Pass their outlet codes.';
  end if;

  return format('OK - %s (%s) can sign in as %s. Outlet access: %s.%s',
                trim(p_name), v_email, v_role, v_access, v_note);
end;
$$;

comment on function app.provision_user(text, text, text, text, text, text, text, text) is
  'Administrator-only: links a Supabase Auth account to a platform profile with a role and outlet scope. Not callable by the application.';

-- ---------------------------------------------------------------------------
-- Creating logins is not something the web app may do. Postgres grants EXECUTE
-- to PUBLIC on new functions by default, so revoke it explicitly.
-- ---------------------------------------------------------------------------
revoke all on function app.provision_user(text, text, text, text, text, text, text, text) from public;
revoke all on function app.provision_user(text, text, text, text, text, text, text, text) from anon;
revoke all on function app.provision_user(text, text, text, text, text, text, text, text) from authenticated;

-- service_role is a back-end key that never reaches a browser, so a trusted
-- server-side onboarding job may still call this.
grant execute on function app.provision_user(text, text, text, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- The roster view an administrator should check after onboarding.
-- `can_sign_in` false means the profile exists but has no password behind it.
--
-- security_invoker = true is load-bearing. Without it a view runs with its
-- OWNER's privileges, which would let any signed-in user read every row of
-- public.users straight through the view and bypass the RLS on that table.
-- With it, the view sees exactly what the caller is entitled to see.
-- ---------------------------------------------------------------------------
create or replace view public.user_access_review
with (security_invoker = true) as
select
  u.name,
  u.email,
  u.role,
  u.status,
  (u.auth_id is not null) as can_sign_in,
  case
    when cardinality(u.outlet_ids) = 0 then 'all outlets'
    else cardinality(u.outlet_ids) || ' outlet(s)'
  end                     as outlet_access,
  u.last_login
from public.users u;

comment on view public.user_access_review is
  'Who can sign in, as what, and over which outlets. Read by administrators during access reviews.';

-- The view reads public.users, which is already protected by its own RLS
-- policies; anon keeps no access at all.
revoke all on public.user_access_review from anon;
grant select on public.user_access_review to authenticated;
