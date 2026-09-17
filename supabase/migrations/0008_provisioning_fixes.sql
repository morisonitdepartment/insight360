-- ============================================================================
-- 0008_provisioning_fixes.sql — three corrections found by testing 0006/0007
-- against the live database.
--
-- Safe to re-run. Apply after 0007.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. "Outlet access: all outlets" was a lie for an operations manager.
--
-- An empty outlet list means "every outlet" for most roles, but an ops_manager
-- is scoped by explicit list only, so for them an empty list means NONE. The
-- report said "all outlets" either way. An administrator creating an ops manager
-- with a typo'd outlet code was told they had granted everything, when they had
-- granted nothing.
--
-- 2. Nothing stopped you demoting the last super_admin.
--
-- Changing the only super_admin to, say, 'analyst' succeeded silently and left
-- the organisation with no one able to manage users — recoverable only from the
-- SQL editor. Refuse it instead.
-- ---------------------------------------------------------------------------

create or replace function app.provision_user(
  p_email        text,
  p_name         text,
  p_title        text,
  p_role         text,
  p_outlet_codes text default '',
  p_gender       text default 'Female',
  p_age_range    text default '25-34',
  p_profile      text default 'Individual'
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
  v_current_role text;
  v_admin_count  integer;
begin
  if v_email = '' then
    return 'FAILED - email is required.';
  end if;

  if v_role not in ('super_admin','client_admin','ops_manager','shopper','analyst','executive') then
    return format(
      'FAILED - %L is not a role. Use one of: super_admin, client_admin, ops_manager, shopper, analyst, executive.',
      p_role);
  end if;

  select a.id into v_auth_id
  from auth.users a
  where lower(a.email) = v_email;

  if v_auth_id is null then
    return format(
      'FAILED - no Auth user for %s. Create it under Authentication -> Users (tick "Auto Confirm User"), then run this again.',
      v_email);
  end if;

  -- Losing the last administrator locks user management away behind the SQL
  -- editor, so refuse rather than report success on a change that strands them.
  select u.role into v_current_role from public.users u where lower(u.email) = v_email;

  if v_current_role = 'super_admin' and v_role <> 'super_admin' then
    select count(*) into v_admin_count
    from public.users
    where role = 'super_admin' and status = 'active';

    if v_admin_count <= 1 then
      return format(
        'FAILED - %s is the only active super_admin. Promote someone else first, or nobody will be able to manage users.',
        v_email);
    end if;
  end if;

  v_user_id    := 'usr-' || substr(md5(v_email), 1, 10);
  v_shopper_id := 'shp-' || substr(md5(v_email), 1, 10);

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

  if v_role = 'shopper' then
    insert into public.shoppers (id, code, name, gender, age_range, profile_type, email, status)
    values (v_shopper_id,
            'MS-' || upper(substr(md5(v_email), 1, 6)),
            trim(p_name), p_gender, p_age_range, p_profile, v_email, 'Active')
    on conflict (id) do update
      set name = excluded.name, email = excluded.email;
  end if;

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

  -- An empty list means opposite things depending on the role, so say which.
  v_access := case
    when cardinality(v_outlet_ids) > 0 then array_to_string(v_matched, ', ')
    when v_role = 'ops_manager'        then 'NONE'
    else 'all outlets'
  end;

  if cardinality(v_missing) > 0 then
    v_note := v_note || format(
      ' WARNING: no outlet matches %s - check the codes under Administration -> Outlets.',
      array_to_string(v_missing, ', '));
  end if;

  if v_role = 'ops_manager' and cardinality(v_outlet_ids) = 0 then
    v_note := v_note ||
      ' WARNING: an ops_manager with no outlets sees nothing. Pass their outlet codes.';
  end if;

  return format('OK - %s (%s) can sign in as %s. Outlet access: %s.%s',
                trim(p_name), v_email, v_role, v_access, v_note);
end;
$$;

-- The same distinction in the roster view: an ops_manager with no outlets was
-- listed as having "all outlets".
create or replace view public.user_access_review
with (security_invoker = true) as
select
  u.name,
  u.email,
  u.role,
  u.status,
  (u.auth_id is not null) as can_sign_in,
  case
    when cardinality(u.outlet_ids) > 0 then cardinality(u.outlet_ids) || ' outlet(s)'
    when u.role = 'ops_manager'        then 'NONE - sees nothing'
    else 'all outlets'
  end                     as outlet_access,
  u.last_login
from public.users u;

revoke all on public.user_access_review from anon;
grant select on public.user_access_review to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Pin search_path on the remaining helpers.
--
-- Supabase's linter flags every function without a fixed search_path. These
-- eight run with invoker rights and reference everything schema-qualified, so
-- none was exploitable — but a security model should not rely on that holding
-- after the next edit, and the warnings hide real ones.
-- ---------------------------------------------------------------------------
alter function app.is_app_user()                      set search_path = public, app, pg_catalog;
alter function app.is_super_admin()                   set search_path = public, app, pg_catalog;
alter function app.can_see_outlet(text)               set search_path = public, app, pg_catalog;
alter function app.role_has_permission(text, text)    set search_path = public, app, pg_catalog;
alter function app.set_updated_at()                   set search_path = public, app, pg_catalog;
alter function app.attach_updated_at(regclass)        set search_path = public, app, pg_catalog;
alter function app.safe_count(text)                   set search_path = public, app, pg_catalog;
alter function app.safe_sum(text, text)               set search_path = public, app, pg_catalog;

-- Keep the lock from 0006: this must never be callable from a browser.
revoke all on function app.provision_user(text, text, text, text, text, text, text, text) from public;
revoke all on function app.provision_user(text, text, text, text, text, text, text, text) from anon;
revoke all on function app.provision_user(text, text, text, text, text, text, text, text) from authenticated;
grant execute on function app.provision_user(text, text, text, text, text, text, text, text) to service_role;
