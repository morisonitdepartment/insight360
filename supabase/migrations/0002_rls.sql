-- ============================================================================
-- INSIGHT360 — 0002_rls.sql
-- Postgres 15 / Supabase. Row Level Security, helper functions, privilege
-- guards and the private `evidence` storage bucket.
--
-- Depends on 0001_schema.sql (tables) and is complemented by
-- 0003_seed_reference.sql (roles / permissions / role_permissions rows).
--
-- Design
--   * Every table created in 0001 has RLS enabled. Nothing is readable by the
--     `anon` role: the application always authenticates first.
--   * Roles are resolved SERVER-SIDE from public.users via auth.uid(). Client
--     state is never trusted.
--   * app.has_permission() reads public.role_permissions (seeded in 0003). If
--     that table has not been seeded yet it falls back to
--     app.role_has_permission(), a literal mirror of ROLE_PERMISSIONS in
--     src/config/permissions.ts, so the policies are never "fail open" and
--     never "fail closed by accident".
--   * Helpers are SECURITY DEFINER + STABLE so that policies which read
--     public.users do not recurse into public.users' own policies.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper functions (schema app)
-- ---------------------------------------------------------------------------

-- The application user id ('usr-001', ...) for the current Supabase Auth user.
create or replace function app.current_user_id()
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select u.id
  from public.users u
  where u.auth_id = auth.uid()
    and u.status = 'active'
  limit 1;
$$;
comment on function app.current_user_id() is
  'users.id of the signed-in Supabase Auth user (null when unauthenticated or not active).';

-- The primary role key of the current user.
create or replace function app.current_role()
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select u.role
  from public.users u
  where u.auth_id = auth.uid()
    and u.status = 'active'
  limit 1;
$$;
comment on function app.current_role() is
  'Primary role key (super_admin | client_admin | ops_manager | shopper | analyst | executive) of the signed-in user.';

create or replace function app.is_app_user()
returns boolean
language sql
stable
as $$
  select app.current_role() is not null;
$$;

create or replace function app.is_super_admin()
returns boolean
language sql
stable
as $$
  select app.current_role() = 'super_admin';
$$;

-- Literal mirror of ROLE_PERMISSIONS in src/config/permissions.ts. Used as the
-- fallback when public.role_permissions has not been seeded (0003).
create or replace function app.role_has_permission(p_role text, p_permission text)
returns boolean
language sql
immutable
as $$
  select case p_role
    when 'super_admin' then true
    when 'client_admin' then p_permission = any (array[
      'dashboard.executive','dashboard.overview','analytics.view','outlets.view','outlets.compare',
      'visits.view','visits.review','calendar.view','shoppers.view',
      'findings.view','findings.comment','actions.view','actions.manage','alerts.view','alerts.manage',
      'reports.visit','reports.management','reports.build','reports.export','evidence.view',
      'admin.outlets','admin.stakeholders','admin.roles','admin.logs'])
    when 'ops_manager' then p_permission = any (array[
      'dashboard.overview','dashboard.executive','analytics.view','outlets.view','outlets.compare',
      'visits.view','calendar.view',
      'findings.view','findings.comment','actions.view','actions.manage','alerts.view','alerts.manage',
      'reports.visit','reports.management','reports.export','evidence.view'])
    when 'shopper' then p_permission = any (array[
      'dashboard.overview','visits.view','visits.conduct','calendar.view','evidence.upload','evidence.view'])
    when 'analyst' then p_permission = any (array[
      'dashboard.overview','dashboard.executive','analytics.view','outlets.view','outlets.compare',
      'visits.view','calendar.view','shoppers.view',
      'findings.view','actions.view','alerts.view',
      'reports.visit','reports.management','reports.build','reports.export','evidence.view'])
    when 'executive' then p_permission = any (array[
      'dashboard.overview','dashboard.executive','analytics.view','outlets.view','outlets.compare',
      'findings.view','actions.view','alerts.view','reports.visit','reports.management'])
    else false
  end;
$$;
comment on function app.role_has_permission(text, text) is
  'Static mirror of ROLE_PERMISSIONS (src/config/permissions.ts); fallback for app.has_permission().';

-- Effective permission check across users.role ∪ user_roles.
create or replace function app.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with my_roles as (
    select u.role as role
    from public.users u
    where u.auth_id = auth.uid() and u.status = 'active'
    union
    select ur.role
    from public.user_roles ur
    join public.users u on u.id = ur.user_id
    where u.auth_id = auth.uid() and u.status = 'active'
  ),
  seeded as (
    select exists (
      select 1 from public.role_permissions rp join my_roles m on m.role = rp.role
    ) as any_row
  )
  select case
    when not exists (select 1 from my_roles) then false
    when (select any_row from seeded) then exists (
      select 1
      from public.role_permissions rp
      join my_roles m on m.role = rp.role
      where rp.permission = p_permission
    )
    else exists (
      select 1 from my_roles m where app.role_has_permission(m.role, p_permission)
    )
  end;
$$;
comment on function app.has_permission(text) is
  'True when the signed-in user holds the permission key via role_permissions (or the static mirror when unseeded).';

-- Outlet scope: users.outlet_ids ∪ user_outlets. An EMPTY array means
-- "all outlets" for every role EXCEPT ops_manager, who is always restricted
-- to an explicit assignment list (see app.can_see_outlet).
create or replace function app.user_outlet_ids()
returns text[]
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(array(
    select distinct s.outlet_id
    from (
      select unnest(u.outlet_ids) as outlet_id
      from public.users u
      where u.auth_id = auth.uid() and u.status = 'active'
      union
      select uo.outlet_id
      from public.user_outlets uo
      join public.users u2 on u2.id = uo.user_id
      where u2.auth_id = auth.uid() and u2.status = 'active'
    ) s
    where s.outlet_id is not null
    order by s.outlet_id
  ), '{}'::text[]);
$$;
comment on function app.user_outlet_ids() is
  'Outlet scope of the signed-in user (users.outlet_ids UNION user_outlets). Empty = unrestricted, except ops_manager.';

create or replace function app.can_see_outlet(p_outlet_id text)
returns boolean
language sql
stable
as $$
  select case
    when p_outlet_id is null then false
    when app.current_role() is null then false
    when app.current_role() = 'ops_manager'
      then p_outlet_id = any (app.user_outlet_ids())     -- always scoped
    when cardinality(app.user_outlet_ids()) = 0 then true -- unrestricted
    else p_outlet_id = any (app.user_outlet_ids())
  end;
$$;

-- shoppers.id of the signed-in user (null for non-shopper roles).
create or replace function app.current_shopper_id()
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select u.shopper_id
  from public.users u
  where u.auth_id = auth.uid() and u.status = 'active'
  limit 1;
$$;

-- Visit visibility, reused by visit_answers / evidence / comments / storage.
create or replace function app.can_see_visit(p_visit_id text)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select exists (
    select 1
    from public.visits v
    where v.id = p_visit_id
      and case app.current_role()
            when 'shopper'     then v.shopper_id is not null and v.shopper_id = app.current_shopper_id()
            when 'ops_manager' then app.can_see_outlet(v.outlet_id)
            when 'super_admin' then true
            when 'client_admin' then true
            when 'analyst'     then true
            when 'executive'   then true
            else false
          end
  );
$$;

-- Visit writability. A shopper may only edit their OWN visit while it is still
-- open for field work; an approved / submitted / closed visit is immutable.
create or replace function app.can_write_visit(p_visit_id text)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select case app.current_role()
    when 'super_admin' then exists (select 1 from public.visits v where v.id = p_visit_id)
    when 'shopper' then exists (
      select 1 from public.visits v
      where v.id = p_visit_id
        and v.shopper_id is not null
        and v.shopper_id = app.current_shopper_id()
        and v.status in ('Assigned','In Progress','Draft','Rejected')
    )
    else false
  end;
$$;
comment on function app.can_write_visit(text) is
  'True when the signed-in user may add/modify field data for the visit (shoppers: own visit, status Assigned/In Progress/Draft/Rejected only).';

-- The outlets / templates / sections reachable from the signed-in shopper's own
-- visits. SECURITY DEFINER so the shopper policies on outlets, audit_templates,
-- audit_sections and audit_questions never nest RLS evaluation inside RLS
-- evaluation (which is both slow and hard to reason about).
create or replace function app.my_visit_outlet_ids()
returns text[]
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(array(
    select distinct v.outlet_id
    from public.visits v
    where v.shopper_id is not null
      and v.shopper_id = app.current_shopper_id()
  ), '{}'::text[]);
$$;

create or replace function app.my_visit_template_ids()
returns text[]
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(array(
    select distinct v.template_id
    from public.visits v
    where v.shopper_id is not null
      and v.shopper_id = app.current_shopper_id()
  ), '{}'::text[]);
$$;

create or replace function app.my_visit_section_ids()
returns text[]
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(array(
    select distinct s.id
    from public.audit_sections s
    where s.template_id = any (app.my_visit_template_ids())
  ), '{}'::text[]);
$$;

-- Comment target visibility (comments.entity_type / entity_id are polymorphic).
create or replace function app.can_see_comment_entity(p_entity_type text, p_entity_id text)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select case p_entity_type
    when 'visit' then app.can_see_visit(p_entity_id)
    when 'finding' then app.has_permission('findings.view') and exists (
      select 1 from public.findings f where f.id = p_entity_id and app.can_see_outlet(f.outlet_id))
    when 'corrective_action' then app.has_permission('actions.view') and exists (
      select 1 from public.corrective_actions ca where ca.id = p_entity_id and app.can_see_outlet(ca.outlet_id))
    when 'alert' then app.has_permission('alerts.view') and exists (
      select 1 from public.alerts a where a.id = p_entity_id and app.can_see_outlet(a.outlet_id))
    else false
  end;
$$;

grant execute on function
  app.current_user_id(), app.current_role(), app.is_app_user(), app.is_super_admin(),
  app.role_has_permission(text, text), app.has_permission(text),
  app.user_outlet_ids(), app.can_see_outlet(text), app.current_shopper_id(),
  app.can_see_visit(text), app.can_write_visit(text), app.can_see_comment_entity(text, text),
  app.my_visit_outlet_ids(), app.my_visit_template_ids(), app.my_visit_section_ids()
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Base privileges — authenticated only, never anon
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- 3. Enable RLS everywhere + super_admin full access
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'organizations','roles','permissions','role_permissions','brands','outlets',
    'training_modules','shoppers','users','user_roles','user_outlets',
    'audit_templates','audit_sections','audit_questions','visits','visit_answers',
    'evidence','findings','alerts','corrective_actions','comments','notifications',
    'activity_logs','kpi_config','notification_rules','reports'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_super_admin_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (app.is_super_admin()) with check (app.is_super_admin());',
      t || '_super_admin_all', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Reference / configuration tables
--    Readable by every authenticated application user (the UI needs labels,
--    weights and the role matrix); writable only by the matching admin
--    permission, which the matrix grants to super_admin alone.
-- ---------------------------------------------------------------------------

-- organizations -------------------------------------------------------------
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated using (app.is_app_user());

drop policy if exists organizations_write on public.organizations;
create policy organizations_write on public.organizations
  for update to authenticated
  using (app.has_permission('admin.settings'))
  with check (app.has_permission('admin.settings'));

-- roles / permissions / role_permissions ------------------------------------
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles
  for select to authenticated using (app.has_permission('admin.roles') or app.is_app_user());

drop policy if exists roles_write on public.roles;
create policy roles_write on public.roles
  for update to authenticated
  using (app.has_permission('admin.roles.edit'))
  with check (app.has_permission('admin.roles.edit'));

drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions
  for select to authenticated using (app.is_app_user());

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions
  for select to authenticated using (app.is_app_user());

drop policy if exists role_permissions_insert on public.role_permissions;
create policy role_permissions_insert on public.role_permissions
  for insert to authenticated with check (app.has_permission('admin.roles.edit'));

drop policy if exists role_permissions_delete on public.role_permissions;
create policy role_permissions_delete on public.role_permissions
  for delete to authenticated using (app.has_permission('admin.roles.edit'));

-- kpi_config ----------------------------------------------------------------
drop policy if exists kpi_config_select on public.kpi_config;
create policy kpi_config_select on public.kpi_config
  for select to authenticated using (app.is_app_user());

drop policy if exists kpi_config_insert on public.kpi_config;
create policy kpi_config_insert on public.kpi_config
  for insert to authenticated with check (app.has_permission('admin.kpi'));

drop policy if exists kpi_config_update on public.kpi_config;
create policy kpi_config_update on public.kpi_config
  for update to authenticated
  using (app.has_permission('admin.kpi'))
  with check (app.has_permission('admin.kpi'));

-- notification_rules --------------------------------------------------------
drop policy if exists notification_rules_select on public.notification_rules;
create policy notification_rules_select on public.notification_rules
  for select to authenticated using (app.has_permission('admin.notifications') or app.has_permission('alerts.configure'));

drop policy if exists notification_rules_insert on public.notification_rules;
create policy notification_rules_insert on public.notification_rules
  for insert to authenticated with check (app.has_permission('admin.notifications'));

drop policy if exists notification_rules_update on public.notification_rules;
create policy notification_rules_update on public.notification_rules
  for update to authenticated
  using (app.has_permission('admin.notifications'))
  with check (app.has_permission('admin.notifications'));

-- training_modules ----------------------------------------------------------
drop policy if exists training_modules_select on public.training_modules;
create policy training_modules_select on public.training_modules
  for select to authenticated using (app.is_app_user());

drop policy if exists training_modules_write on public.training_modules;
create policy training_modules_write on public.training_modules
  for all to authenticated
  using (app.has_permission('shoppers.manage'))
  with check (app.has_permission('shoppers.manage'));

-- ---------------------------------------------------------------------------
-- 5. Brands & outlets
-- ---------------------------------------------------------------------------
drop policy if exists brands_select on public.brands;
create policy brands_select on public.brands
  for select to authenticated using (app.is_app_user());

drop policy if exists brands_write on public.brands;
create policy brands_write on public.brands
  for all to authenticated
  using (app.has_permission('admin.outlets'))
  with check (app.has_permission('admin.outlets'));

-- Shoppers only ever see the outlets attached to their own visits.
drop policy if exists outlets_select on public.outlets;
create policy outlets_select on public.outlets
  for select to authenticated
  using (
    case app.current_role()
      when 'shopper' then outlets.id = any (app.my_visit_outlet_ids())
      else app.has_permission('outlets.view') and app.can_see_outlet(outlets.id)
    end
  );

drop policy if exists outlets_insert on public.outlets;
create policy outlets_insert on public.outlets
  for insert to authenticated with check (app.has_permission('admin.outlets'));

drop policy if exists outlets_update on public.outlets;
create policy outlets_update on public.outlets
  for update to authenticated
  using (app.has_permission('admin.outlets') and app.can_see_outlet(outlets.id))
  with check (app.has_permission('admin.outlets'));

-- ---------------------------------------------------------------------------
-- 6. Shoppers
-- ---------------------------------------------------------------------------
drop policy if exists shoppers_select on public.shoppers;
create policy shoppers_select on public.shoppers
  for select to authenticated
  using (
    app.has_permission('shoppers.view')
    or (app.current_shopper_id() is not null and shoppers.id = app.current_shopper_id())
  );

drop policy if exists shoppers_write on public.shoppers;
create policy shoppers_write on public.shoppers
  for all to authenticated
  using (app.has_permission('shoppers.manage'))
  with check (app.has_permission('shoppers.manage'));

-- ---------------------------------------------------------------------------
-- 7. Users, user_roles, user_outlets
--    * everyone may read their own row (the app resolves the profile by auth_id)
--    * super_admin and client_admin read all rows
--    * client_admin may create/update STAKEHOLDER accounts only
--      (client_admin | executive | analyst | ops_manager) — never super_admin
--      or shopper — mirroring the 'admin.stakeholders' permission
--    * the prevent_privilege_escalation trigger is the second line of defence
-- ---------------------------------------------------------------------------
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated
  using (
    users.auth_id = auth.uid()
    or app.current_role() = 'client_admin'
  );

drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users
  for update to authenticated
  using (users.auth_id = auth.uid())
  with check (users.auth_id = auth.uid());

drop policy if exists users_stakeholder_insert on public.users;
create policy users_stakeholder_insert on public.users
  for insert to authenticated
  with check (
    app.has_permission('admin.stakeholders')
    and users.role in ('client_admin','executive','analyst','ops_manager')
  );

drop policy if exists users_stakeholder_update on public.users;
create policy users_stakeholder_update on public.users
  for update to authenticated
  using (
    app.has_permission('admin.stakeholders')
    and users.role in ('client_admin','executive','analyst','ops_manager')
  )
  with check (
    app.has_permission('admin.stakeholders')
    and users.role in ('client_admin','executive','analyst','ops_manager')
  );

drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (
    user_roles.user_id = app.current_user_id()
    or app.current_role() = 'client_admin'
  );

drop policy if exists user_outlets_select on public.user_outlets;
create policy user_outlets_select on public.user_outlets
  for select to authenticated
  using (
    user_outlets.user_id = app.current_user_id()
    or app.current_role() = 'client_admin'
  );
-- Writes to user_roles / user_outlets are super_admin-only (policy from step 3).

-- Privilege escalation guard -------------------------------------------------
create or replace function app.prevent_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  -- Migrations, the SQL editor and the service role run without auth.uid();
  -- they are already trusted and are not subject to this guard.
  if auth.uid() is null then
    return new;
  end if;
  if app.is_super_admin() then
    return new;
  end if;
  -- role / status / outlet_ids / brand_ids are the access-control fields.
  -- shopper_id and auth_id are included because re-pointing either one would
  -- hand the caller another identity's data through app.current_shopper_id()
  -- and app.current_user_id().
  if new.role       is distinct from old.role
     or new.status     is distinct from old.status
     or new.outlet_ids is distinct from old.outlet_ids
     or new.brand_ids  is distinct from old.brand_ids
     or new.shopper_id is distinct from old.shopper_id
     or new.auth_id    is distinct from old.auth_id then
    raise exception
      'Privilege escalation blocked: only a super_admin may change role, status, outlet_ids, brand_ids, shopper_id or auth_id (user %).',
      old.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_privilege_escalation on public.users;
create trigger prevent_privilege_escalation
  before update on public.users
  for each row execute function app.prevent_privilege_escalation();

-- ---------------------------------------------------------------------------
-- 8. Audit templates, sections, questions
--    Executives have no questionnaire access. Shoppers only see the template
--    tree behind their own assigned visits.
-- ---------------------------------------------------------------------------
drop policy if exists audit_templates_select on public.audit_templates;
create policy audit_templates_select on public.audit_templates
  for select to authenticated
  using (
    case app.current_role()
      when 'shopper' then audit_templates.id = any (app.my_visit_template_ids())
      else app.has_permission('admin.templates') or app.has_permission('visits.view')
    end
  );

drop policy if exists audit_templates_write on public.audit_templates;
create policy audit_templates_write on public.audit_templates
  for all to authenticated
  using (app.has_permission('admin.templates'))
  with check (app.has_permission('admin.templates'));

drop policy if exists audit_sections_select on public.audit_sections;
create policy audit_sections_select on public.audit_sections
  for select to authenticated
  using (
    case app.current_role()
      when 'shopper' then audit_sections.template_id = any (app.my_visit_template_ids())
      else app.has_permission('admin.templates') or app.has_permission('visits.view')
    end
  );

drop policy if exists audit_sections_write on public.audit_sections;
create policy audit_sections_write on public.audit_sections
  for all to authenticated
  using (app.has_permission('admin.templates'))
  with check (app.has_permission('admin.templates'));

drop policy if exists audit_questions_select on public.audit_questions;
create policy audit_questions_select on public.audit_questions
  for select to authenticated
  using (
    case app.current_role()
      when 'shopper' then audit_questions.section_id = any (app.my_visit_section_ids())
      else app.has_permission('admin.templates') or app.has_permission('visits.view')
    end
  );

drop policy if exists audit_questions_write on public.audit_questions;
create policy audit_questions_write on public.audit_questions
  for all to authenticated
  using (app.has_permission('admin.templates'))
  with check (app.has_permission('admin.templates'));

-- ---------------------------------------------------------------------------
-- 9. Visits
-- ---------------------------------------------------------------------------
drop policy if exists visits_select on public.visits;
create policy visits_select on public.visits
  for select to authenticated
  using (
    case app.current_role()
      when 'shopper'     then visits.shopper_id is not null and visits.shopper_id = app.current_shopper_id()
      when 'ops_manager' then app.has_permission('visits.view') and app.can_see_outlet(visits.outlet_id)
      when 'executive'   then true                      -- read-only executive visibility
      else app.has_permission('visits.view')
    end
  );

-- Planning / assignment (super_admin holds visits.create & visits.assign).
drop policy if exists visits_plan_insert on public.visits;
create policy visits_plan_insert on public.visits
  for insert to authenticated
  with check (app.has_permission('visits.create'));

-- Review / approval. client_admin holds 'visits.review' in the matrix, so the
-- policy follows the matrix rather than hard-coding the role.
drop policy if exists visits_review_update on public.visits;
create policy visits_review_update on public.visits
  for update to authenticated
  using (app.has_permission('visits.review'))
  with check (app.has_permission('visits.review'));

-- Field work: a shopper may only touch their own, still-open visit and may
-- never move it into (or out of) an approved state.
drop policy if exists visits_shopper_update on public.visits;
create policy visits_shopper_update on public.visits
  for update to authenticated
  using (
    app.current_role() = 'shopper'
    and visits.shopper_id is not null
    and visits.shopper_id = app.current_shopper_id()
    and visits.status in ('Assigned','In Progress','Draft','Rejected')
  )
  with check (
    app.current_role() = 'shopper'
    and visits.shopper_id is not null
    and visits.shopper_id = app.current_shopper_id()
    and visits.status in ('Assigned','In Progress','Draft','Submitted')
  );

-- ---------------------------------------------------------------------------
-- 10. Visit answers & evidence
-- ---------------------------------------------------------------------------
drop policy if exists visit_answers_select on public.visit_answers;
create policy visit_answers_select on public.visit_answers
  for select to authenticated using (app.can_see_visit(visit_answers.visit_id));

drop policy if exists visit_answers_insert on public.visit_answers;
create policy visit_answers_insert on public.visit_answers
  for insert to authenticated with check (app.can_write_visit(visit_answers.visit_id));

drop policy if exists visit_answers_update on public.visit_answers;
create policy visit_answers_update on public.visit_answers
  for update to authenticated
  using (app.can_write_visit(visit_answers.visit_id))
  with check (app.can_write_visit(visit_answers.visit_id));

drop policy if exists evidence_select on public.evidence;
create policy evidence_select on public.evidence
  for select to authenticated
  using (app.has_permission('evidence.view') and app.can_see_visit(evidence.visit_id));

drop policy if exists evidence_insert on public.evidence;
create policy evidence_insert on public.evidence
  for insert to authenticated
  with check (app.has_permission('evidence.upload') and app.can_write_visit(evidence.visit_id));

drop policy if exists evidence_update on public.evidence;
create policy evidence_update on public.evidence
  for update to authenticated
  using (app.has_permission('evidence.upload') and app.can_write_visit(evidence.visit_id))
  with check (app.has_permission('evidence.upload') and app.can_write_visit(evidence.visit_id));

-- ---------------------------------------------------------------------------
-- 11. Findings, alerts, corrective actions
--     Shoppers hold none of these permissions and therefore see nothing.
-- ---------------------------------------------------------------------------
drop policy if exists findings_select on public.findings;
create policy findings_select on public.findings
  for select to authenticated
  using (app.has_permission('findings.view') and app.can_see_outlet(findings.outlet_id));

drop policy if exists findings_insert on public.findings;
create policy findings_insert on public.findings
  for insert to authenticated with check (app.has_permission('visits.review'));

drop policy if exists findings_update on public.findings;
create policy findings_update on public.findings
  for update to authenticated
  using (app.has_permission('actions.manage') and app.can_see_outlet(findings.outlet_id))
  with check (app.has_permission('actions.manage') and app.can_see_outlet(findings.outlet_id));

drop policy if exists alerts_select on public.alerts;
create policy alerts_select on public.alerts
  for select to authenticated
  using (app.has_permission('alerts.view') and app.can_see_outlet(alerts.outlet_id));

drop policy if exists alerts_insert on public.alerts;
create policy alerts_insert on public.alerts
  for insert to authenticated
  with check (app.has_permission('alerts.manage') and app.can_see_outlet(alerts.outlet_id));

drop policy if exists alerts_update on public.alerts;
create policy alerts_update on public.alerts
  for update to authenticated
  using (app.has_permission('alerts.manage') and app.can_see_outlet(alerts.outlet_id))
  with check (app.has_permission('alerts.manage') and app.can_see_outlet(alerts.outlet_id));

drop policy if exists corrective_actions_select on public.corrective_actions;
create policy corrective_actions_select on public.corrective_actions
  for select to authenticated
  using (app.has_permission('actions.view') and app.can_see_outlet(corrective_actions.outlet_id));

drop policy if exists corrective_actions_insert on public.corrective_actions;
create policy corrective_actions_insert on public.corrective_actions
  for insert to authenticated
  with check (app.has_permission('actions.manage') and app.can_see_outlet(corrective_actions.outlet_id));

drop policy if exists corrective_actions_update on public.corrective_actions;
create policy corrective_actions_update on public.corrective_actions
  for update to authenticated
  using (app.has_permission('actions.manage') and app.can_see_outlet(corrective_actions.outlet_id))
  with check (app.has_permission('actions.manage') and app.can_see_outlet(corrective_actions.outlet_id));

-- ---------------------------------------------------------------------------
-- 12. Comments
-- ---------------------------------------------------------------------------
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to authenticated
  using (
    comments.user_id = app.current_user_id()
    or app.can_see_comment_entity(comments.entity_type, comments.entity_id)
  );

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    comments.user_id = app.current_user_id()
    and app.has_permission('findings.comment')
    and app.can_see_comment_entity(comments.entity_type, comments.entity_id)
  );

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own on public.comments
  for update to authenticated
  using (comments.user_id = app.current_user_id())
  with check (comments.user_id = app.current_user_id());

-- ---------------------------------------------------------------------------
-- 13. Notifications — visible to the audience roles only
-- ---------------------------------------------------------------------------
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (app.current_role() = any (notifications.audience));

-- Marking as read is the only mutation available to the audience.
drop policy if exists notifications_update_read on public.notifications;
create policy notifications_update_read on public.notifications
  for update to authenticated
  using (app.current_role() = any (notifications.audience))
  with check (app.current_role() = any (notifications.audience));

-- ---------------------------------------------------------------------------
-- 14. Activity logs — append only, immutable
-- ---------------------------------------------------------------------------
drop policy if exists activity_logs_select on public.activity_logs;
create policy activity_logs_select on public.activity_logs
  for select to authenticated using (app.has_permission('admin.logs'));

drop policy if exists activity_logs_insert on public.activity_logs;
create policy activity_logs_insert on public.activity_logs
  for insert to authenticated with check (app.is_app_user());

-- No update / delete policy is created, and the privilege itself is withdrawn
-- so that not even a super_admin can rewrite the audit trail through the API.
revoke update, delete on public.activity_logs from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 15. Management reports
-- ---------------------------------------------------------------------------
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated using (app.has_permission('reports.management'));

-- analyst holds 'reports.build' but is read-only platform-wide, so authoring is
-- limited to the two administrative roles.
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert to authenticated
  with check (app.has_permission('reports.build') and app.current_role() in ('super_admin','client_admin'));

drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports
  for update to authenticated
  using (app.has_permission('reports.build') and app.current_role() in ('super_admin','client_admin'))
  with check (app.has_permission('reports.build') and app.current_role() in ('super_admin','client_admin'));

-- ---------------------------------------------------------------------------
-- 16. Storage — private `evidence` bucket
--     Object path convention (src/repositories/supabaseRepository.ts):
--       <visit_id>/<evidence_id>-<sanitised file name>
--     so split_part(name, '/', 1) is the visit id.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence',
  'evidence',
  false,
  52428800,                                   -- 50 MB, mirrors the client-side check
  array['image/jpeg','image/png','image/webp','video/mp4','application/pdf']
)
on conflict (id) do nothing;

drop policy if exists evidence_objects_insert on storage.objects;
create policy evidence_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidence'
    and app.has_permission('evidence.upload')
    and app.can_write_visit(split_part(name, '/', 1))
  );

drop policy if exists evidence_objects_select on storage.objects;
create policy evidence_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidence'
    and app.has_permission('evidence.view')
    and app.can_see_visit(split_part(name, '/', 1))
  );

drop policy if exists evidence_objects_update on storage.objects;
create policy evidence_objects_update on storage.objects
  for update to authenticated
  using (bucket_id = 'evidence' and app.is_super_admin())
  with check (bucket_id = 'evidence' and app.is_super_admin());

drop policy if exists evidence_objects_delete on storage.objects;
create policy evidence_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'evidence' and app.is_super_admin());

-- There is deliberately NO policy for the `anon` role: evidence is never
-- publicly readable. Clients must use createSignedUrl() (short-lived) or
-- download() with an authenticated session.
