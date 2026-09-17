-- ============================================================================
-- 0009_policy_consistency.sql — two issues raised by Supabase's own linters.
--
-- Safe to re-run. Apply after 0008.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The scenarios policies applied to PUBLIC, not to authenticated.
--
-- Every other table in this schema scopes its policies `to authenticated`. The
-- three added for `scenarios` in 0004 left the clause out, so Postgres defaulted
-- them to PUBLIC — which includes `anon`.
--
-- This is not currently exploitable: `anon` holds no table privilege, and
-- privileges are checked before policies, so an anonymous request is refused
-- before any policy is consulted. scripts/check-rls.mjs confirms that against
-- the live project.
--
-- It is still worth correcting. The protection rests entirely on the grant, with
-- the policy silently agreeing to serve anyone — and a policy named
-- `scenarios_read_all` that applies to PUBLIC is exactly what someone
-- re-granting privileges later would fail to notice. Defence in depth means the
-- policy should refuse on its own.
-- ---------------------------------------------------------------------------
drop policy if exists scenarios_read_all on public.scenarios;
create policy scenarios_read_all on public.scenarios
  for select to authenticated
  using (app.is_app_user());

drop policy if exists scenarios_manage on public.scenarios;
create policy scenarios_manage on public.scenarios
  for all to authenticated
  using (app.has_permission('admin.templates'))
  with check (app.has_permission('admin.templates'));

drop policy if exists scenarios_super_admin_all on public.scenarios;
create policy scenarios_super_admin_all on public.scenarios
  for all to authenticated
  using (app.is_super_admin())
  with check (app.is_super_admin());

-- ---------------------------------------------------------------------------
-- 2. auth.uid() was re-evaluated once per row.
--
-- Called bare in a policy, the planner treats auth.uid() as something to run for
-- every candidate row. Wrapped in a scalar sub-select it is evaluated once and
-- reused, which is the difference between a constant and a per-row function call
-- when the table grows. The permission expressed is identical.
-- ---------------------------------------------------------------------------
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated
  using (
    auth_id = (select auth.uid())
    or app.current_role() = 'client_admin'
  );

drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users
  for update to authenticated
  using (auth_id = (select auth.uid()))
  with check (auth_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Not changed, deliberately:
--
-- `multiple_permissive_policies` — every table carries its specific policies
-- plus a `*_super_admin_all` bypass. Merging them would save a policy evaluation
-- per query at the cost of one long condition per table, where today the
-- administrator bypass is a separate, readable line. For a database of this size
-- the clarity is worth more than the microseconds.
--
-- `unused_index` — reported for all 41 indexes because no query has run against
-- real data yet. It will resolve itself once the programme is live; dropping
-- them now would remove exactly the indexes the first real reports need.
-- ---------------------------------------------------------------------------
