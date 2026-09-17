-- ============================================================================
-- 0007_admin_provisioning_rpc.sql — let the Edge Function reach provision_user.
--
-- app.provision_user() (0006) lives in the `app` schema, which PostgREST does
-- not expose, so nothing outside the database can call it. The `provision-user`
-- Edge Function needs to, because it is what turns the app's "Create user"
-- button into a real login.
--
-- This adds a thin wrapper in `public` — the only schema PostgREST serves — and
-- then locks it to `service_role`.
--
-- WHY THAT IS STILL SAFE
--   PostgREST checks EXECUTE before it will call a function. `anon` and
--   `authenticated` have none, so a browser calling /rest/v1/rpc/admin_provision_user
--   gets 403 no matter what it sends. Only a connection holding the service-role
--   key — which never leaves the Edge Function — can run it.
--
-- WARNING FOR FUTURE MIGRATIONS
--   Never write `grant execute on all functions in schema public to authenticated`.
--   That one line would hand every signed-in user the ability to mint a
--   super_admin. Grant execute function by function.
--
-- Safe to re-run. Apply after 0006.
-- ============================================================================

create or replace function public.admin_provision_user(
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
language sql
volatile
security definer
set search_path = app, public, pg_catalog
as $$
  select app.provision_user(
    p_email, p_name, p_title, p_role, p_outlet_codes, p_gender, p_age_range, p_profile
  );
$$;

comment on function public.admin_provision_user(text, text, text, text, text, text, text, text) is
  'Service-role only. RPC entry point for the provision-user Edge Function; delegates to app.provision_user().';

-- Postgres grants EXECUTE to PUBLIC on new functions by default. Revoke first,
-- then grant to exactly one role.
revoke all on function public.admin_provision_user(text, text, text, text, text, text, text, text) from public;
revoke all on function public.admin_provision_user(text, text, text, text, text, text, text, text) from anon;
revoke all on function public.admin_provision_user(text, text, text, text, text, text, text, text) from authenticated;
grant execute on function public.admin_provision_user(text, text, text, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Verify the lock held. Both must be false:
--
--   select has_function_privilege('anon',          'public.admin_provision_user(text,text,text,text,text,text,text,text)', 'execute'),
--          has_function_privilege('authenticated', 'public.admin_provision_user(text,text,text,text,text,text,text,text)', 'execute');
--
-- verify_install.sql check 29 asserts the same thing.
-- ---------------------------------------------------------------------------
