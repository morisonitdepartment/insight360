# INSIGHT360 — Supabase Backend (Live Mode)

INSIGHT360 ships in two operating modes. **Demo Mode** is entirely client-side (seeded,
deterministic dataset in the browser — this is what GitHub Pages serves). **Live Mode**
puts the same application on top of a Supabase project: Auth for identity, Postgres with
Row Level Security for data, and a private Storage bucket for evidence files.

Everything the backend needs lives in this folder:

| File | Purpose |
| --- | --- |
| `migrations/0001_schema.sql` | Tables, constraints, indexes, `updated_at` triggers. 26 tables in `public`, helper schema `app`. |
| `migrations/0002_rls.sql` | RLS on every table, `app.*` helper functions, the privilege-escalation trigger, the `evidence` storage bucket and its policies. |
| `migrations/0003_seed_reference.sql` | Reference data: organisation, 6 roles, 36 permissions, the full role → permission matrix, 7 training modules, 6 KPI rows, 12 notification rules. |

> **Golden rule:** the `service_role` key never leaves your machine or your CI secret store.
> The frontend only ever receives the **anon** key, and every request it makes is filtered by
> RLS. Roles are resolved **server-side** from `public.users` via `auth.uid()` — never from
> anything the browser sends.

---

## 1. Create a free Supabase project

1. Sign up at <https://supabase.com> and create a new project (Free tier is sufficient:
   500 MB database, 1 GB file storage, 50 000 monthly active users).
2. Choose a region close to your users (for the demo storyline, `eu-central` or
   `ap-south` work well for Qatar).
3. Save the generated database password somewhere safe — you need it for the CLI.
4. Once the project is provisioned, open **Project Settings → API** and note:
   * **Project URL** → `VITE_SUPABASE_URL`
   * **anon / public key** → `VITE_SUPABASE_ANON_KEY`
   * **service_role key** → *never* used by the frontend. Keep it out of `.env`, out of
     git, out of GitHub Actions variables (a *secret* is acceptable only for server-side
     admin scripts you run yourself).

---

## 2. Run the migrations, in order

Order matters, and numeric order is the only safe order: `0002` references tables created
in `0001`; `0003` seeds rows that `0002`'s `app.has_permission()` reads; `0005` repairs
privileges on the table `0004` adds; `0006` builds on all of it.

### Option A — Supabase CLI (recommended)

```bash
npm install -g supabase          # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <your-project-ref>

# Applies every file in supabase/migrations in filename order
supabase db push
```

Verify:

```bash
supabase db diff            # should report no differences
```

### Option B — SQL editor in the dashboard

Open **SQL Editor → New query** and run the files one at a time, top to bottom:

1. paste and run `migrations/0001_schema.sql`
2. paste and run `migrations/0002_rls.sql`
3. paste and run `migrations/0003_seed_reference.sql`
4. paste and run `migrations/0004_scenarios_and_sla.sql`
5. paste and run `migrations/0005_fix_grants.sql`
6. paste and run `migrations/0006_user_provisioning.sql`
7. paste and run `migrations/0007_admin_provisioning_rpc.sql`

Each file is idempotent (`create table if not exists`, `create or replace function`,
`drop policy if exists` before every `create policy`, `on conflict … do nothing`), so a
re-run is harmless.

### Quick sanity check

```sql
-- 26 tables, all with RLS on
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- Policy count per table
select tablename, count(*) as policies
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;

-- Reference data
select (select count(*) from public.roles)            as roles,            -- 6
       (select count(*) from public.permissions)      as permissions,      -- 36
       (select count(*) from public.role_permissions) as role_permissions, -- 109
       (select count(*) from public.kpi_config)       as kpi_config,       -- 6
       (select count(*) from public.notification_rules) as rules,          -- 12
       (select count(*) from public.training_modules) as training_modules; -- 7

-- KPI weights must total 100
select sum(weight) from public.kpi_config;   -- 100
```

---

## 3. Verify the storage bucket

`0002_rls.sql` creates the bucket. Confirm it in **Storage** in the dashboard, or:

```sql
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'evidence';
```

Expected:

| column | value |
| --- | --- |
| `public` | `false` |
| `file_size_limit` | `52428800` (50 MB — mirrors the client-side check in `supabaseRepository.uploadEvidence`) |
| `allowed_mime_types` | `{image/jpeg,image/png,image/webp,video/mp4,application/pdf}` |

And the object policies:

```sql
select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'evidence_objects%';
```

You should see `evidence_objects_insert`, `evidence_objects_select`,
`evidence_objects_update`, `evidence_objects_delete`.

**Path convention.** The client uploads to `<visit_id>/<evidence_id>-<file name>`. The
policies take `split_part(name, '/', 1)` as the visit id and check it against
`app.can_see_visit()` / `app.can_write_visit()`. Do not change the layout without
updating both sides.

Because the bucket is private, files are fetched with `createSignedUrl()` (short-lived) or
`download()` on an authenticated session. There is no anonymous read policy.

> If `insert into storage.buckets …` or the `storage.objects` policies fail with a
> permissions error, you are not connected as `postgres`. Run those statements from the
> dashboard SQL editor, or create the bucket in the Storage UI (private, 50 MB limit,
> the five MIME types above) and re-run just the policy block.

---

## 4. Create auth users and link them to `public.users`

Supabase Auth owns credentials; the platform owns the profile. `public.users.auth_id` is
the join, and `SupabaseRepository.profileFor()` looks the profile up by `auth_id` — so a
user who has no linked row simply cannot sign in ("No platform profile is linked to this
account.").

This cuts both ways, and it is the single most common onboarding mistake: **creating a
user inside the app (Administration → Users) writes the profile only.** It cannot set a
password, so the person is left at the login screen. Use the script below to create a
login; use the app afterwards to change roles and outlets.

### The quick way: from inside the app

Once `0007_admin_provisioning_rpc.sql` is applied and the `provision-user` Edge Function is
deployed (see `supabase/functions/README.md`), **Administration → Users → Create user**
does the whole job: it creates the Auth account, writes the profile and role, applies the
outlet scope, and shows you a temporary password once to pass on. That is the day-to-day
way to onboard staff.

The function is what makes this safe: creating an Auth account needs the service-role key,
which bypasses all RLS and must never be in a browser bundle, so the work happens
server-side where the caller's entitlement is checked against `public.users`.

### The SQL way: bootstrapping, and when the function is not deployed

The very first administrator has nobody to create them from inside the app, so they are
always made this way.

**Step 1 — create the password.** Dashboard → **Authentication → Users → Add user**
(real email, tick *Auto Confirm User*), or via the Admin API with the service-role key
from a trusted machine.

**Step 2 — provision the profile.** Run `supabase/create_user.sql`, one line per person:

```sql
select app.provision_user(
  'ops@example.com',     -- must match the auth user exactly
  'Operations Lead',     -- name shown in the app
  'Operations Manager',  -- job title
  'ops_manager',         -- role
  'OUT-001,OUT-002'      -- outlet codes; '' = all outlets
);
```

`app.provision_user()` (migration 0006) does the whole job in order and reports what it
actually granted: it refuses to write anything when no auth user matches, creates the
`shoppers` record that the `users_shopper_link` constraint requires before writing a
`shopper` profile, translates outlet codes into ids, and warns when a code matched nothing
or an `ops_manager` was left with no outlets. Re-running it updates the person rather than
duplicating them, which makes it the supported way to change a role later as well.

It is deliberately **not callable from the browser** — `execute` is revoked from `anon` and
`authenticated`, so minting a login requires the SQL editor or a service-role connection.
Verifier checks 26–28 assert this.

**Step 3 — review the roster.**

```sql
select * from public.user_access_review order by role, name;
```

`can_sign_in` must be true for everyone; false means a profile with no password behind it.
The view is defined `with (security_invoker = true)` so it shows each caller only what
their own RLS allows — without that option a view runs as its owner and would leak every
row of `public.users`.

**When someone leaves:** set `status = 'inactive'` rather than deleting the row, and delete
their auth user. Every `app.*` helper ignores non-active accounts, so access stops at once
while their name stays attached to the visits and reports they produced.

Notes:

* `status` must be `'active'` — every `app.*` helper ignores `invited` and `inactive`
  accounts, so an inactive user is invisible to RLS even with a valid JWT. A profile
  created in the app starts as `invited`, which is another reason it cannot sign in.
* `outlet_ids` empty means **all outlets** for every role *except* `ops_manager`, who is
  always restricted to an explicit list (see `app.can_see_outlet`). An ops manager with an
  empty `outlet_ids` sees nothing — deliberate, fail-closed behaviour.
* A `shopper` row requires `shopper_id` (`users_shopper_link` check constraint in 0001).
* `app.prevent_privilege_escalation` lets a signed-in **super_admin** change role, status
  and outlet scope from within the app, and blocks everyone else from changing their own.
  Migrations and the SQL editor run without `auth.uid()` and are not subject to it.
* Normalised alternatives to the arrays exist: `public.user_outlets` (unioned into
  `app.user_outlet_ids()`) and `public.user_roles` (unioned into `app.has_permission()`).

---


## 5. Frontend environment variables

Copy `.env.example` to `.env` at the project root:

```bash
VITE_APP_MODE=live
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_BASE_PATH=/insight360/       # only for GitHub Pages project sites
```

`src/services/supabaseClient.ts` throws if either Supabase variable is missing in live
mode. `VITE_APP_MODE=demo` (the default) ignores Supabase entirely.

**Never** add `SUPABASE_SERVICE_ROLE_KEY` to `.env`, to `vite.config.ts`, or to a GitHub
Actions *variable*. Anything prefixed `VITE_` is compiled into the JavaScript bundle and is
public by definition.

---

## 6. How the RLS model works

`0002_rls.sql` mirrors `src/config/permissions.ts` in the database, so the UI and the
server cannot drift apart.

### Helper functions (schema `app`, `security definer`, `stable`)

| Function | Returns | Meaning |
| --- | --- | --- |
| `app.current_user_id()` | `text` | `users.id` for `auth.uid()` (active accounts only) |
| `app.current_role()` | `text` | primary role key from `public.users` |
| `app.has_permission(text)` | `boolean` | permission check over `users.role ∪ user_roles`, against `role_permissions`; falls back to `app.role_has_permission()` (a literal mirror of the TypeScript matrix) when the table is unseeded |
| `app.user_outlet_ids()` | `text[]` | `users.outlet_ids ∪ user_outlets`; empty = unrestricted |
| `app.can_see_outlet(text)` | `boolean` | scope check; `ops_manager` is *always* restricted |
| `app.current_shopper_id()` | `text` | `users.shopper_id` |
| `app.can_see_visit(text)` | `boolean` | visit visibility; shoppers only see their own |
| `app.can_write_visit(text)` | `boolean` | shoppers may edit only their own visit while its status is `Assigned`, `In Progress`, `Draft` or `Rejected` |
| `app.can_see_comment_entity(text, text)` | `boolean` | resolves `comments.entity_type` / `entity_id` to the underlying record |
| `app.my_visit_outlet_ids()` | `text[]` | outlets reachable from the shopper's own visits |
| `app.my_visit_template_ids()` | `text[]` | templates reachable from the shopper's own visits |
| `app.my_visit_section_ids()` | `text[]` | sections under those templates |

They are `security definer` so policies that consult `public.users` do not recurse into
`public.users`' own policies.

### Effective access by role

| Role | Reads | Writes |
| --- | --- | --- |
| `super_admin` | everything | everything (except the activity log, which is append-only for all) |
| `client_admin` | everything | corrective actions, alerts, comments, outlets, reports, visit review/approval, and stakeholder users (`client_admin`/`executive`/`analyst`/`ops_manager` only) |
| `ops_manager` | rows whose `outlet_id` is in their assignment list | corrective actions, comments, alerts — for those outlets only |
| `shopper` | only visits where `shopper_id` = their own, plus the related answers, evidence, questions, sections, templates and outlets | `visit_answers`, `evidence` and their own `visits`, and only while the visit is `Assigned` / `In Progress` / `Draft` / `Rejected`. **Never an approved visit.** |
| `analyst` | everything except `users` (own row only) | nothing |
| `executive` | outlets, brands, visits, findings, alerts, corrective actions, reports, KPI config, and notifications addressed to their role | nothing |

### Additional guards

* **`prevent_privilege_escalation`** — a `before update` trigger on `public.users` raises
  `42501` if anyone other than a `super_admin` changes `role`, `status`, `outlet_ids`,
  `brand_ids`, `shopper_id` or `auth_id` (the last two would otherwise let a caller adopt
  another identity). Contexts with no `auth.uid()` (migrations, service role, SQL editor)
  are exempt by design.
* **Immutable activity logs** — `public.activity_logs` has an insert policy for any signed-in
  user and a select policy for `admin.logs`, and `update` / `delete` are *revoked at the
  privilege level*, so not even a `super_admin` can rewrite history through the API.
* **No `anon` access** — `revoke all on all tables in schema public from anon;` The
  application authenticates before it reads anything.

---

## 7. RLS recommendations

* **Keep the two matrices in sync.** If you edit `src/config/permissions.ts`, edit both
  `app.role_has_permission()` in `0002_rls.sql` *and* the seed in `0003_seed_reference.sql`
  in the same commit. The UI hiding a button is cosmetic; the policy is the control.
* **Never disable RLS "temporarily"** on a table to debug. Use
  `set local role authenticated;` plus a JWT claim instead (see the testing checklist).
* **Prefer `to authenticated`** on every policy — an omitted role list also targets `anon`.
* **Index the columns policies filter on.** `0001` already indexes `users.auth_id`,
  `visits.shopper_id`, `visits(outlet_id, status)`, `findings(outlet_id, status, severity)`
  and `notifications.audience` (GIN). Add indexes before adding new scoped policies.
* **Watch `security definer` ownership.** The `app.*` helpers must be owned by a role that
  can read `public.users`; each sets an explicit `search_path` to prevent shadowing.
* **Add `force row level security`** on `public.users` only if you also intend the table
  owner to be filtered — it would break the helper functions as written.
* **Use `select ... limit 1` style probes, not the dashboard**, when testing policies: the
  dashboard runs as `postgres` and bypasses RLS, which makes everything look permissive.
* **Rotate the anon key** if you ever suspect a policy gap shipped to production, and audit
  `public.activity_logs` afterwards.
* **Turn on point-in-time recovery / scheduled backups** before the first real engagement.

---

## 8. Testing checklist

Create one auth user per role, link each to a `public.users` row, sign in from the app (or
with the JS client) and confirm each line. All tests must be run **through the anon key**,
never in the dashboard SQL editor.

### Shopper cannot read management data

1. Sign in as the shopper account.
2. `select * from findings` → **0 rows** (no `findings.view` permission).
3. `select * from corrective_actions` → **0 rows**.
4. `select * from alerts` → **0 rows**.
5. `select * from reports` → **0 rows**.
6. `select * from users` → **exactly 1 row** (their own).
7. `select * from activity_logs` → **0 rows**.
8. `select * from visits` → only rows whose `shopper_id` matches their `users.shopper_id`.
9. `update visits set status = 'Approved' where id = '<own visit>'` → **0 rows updated**
   (the `with check` clause excludes `Approved`).
10. Pick an **approved** visit of theirs and try
    `insert into visit_answers …` → **rejected** (`app.can_write_visit` is false).
11. Upload to `evidence/<someone-else-visit-id>/x.jpg` → **rejected** by the storage policy.

### Operations manager outlet scoping

1. Sign in as the ops manager (with `outlet_ids = {out-012, out-021, out-034}`).
2. `select id from outlets` → only those three ids.
3. `select outlet_id from visits` / `findings` / `alerts` / `corrective_actions` →
   only those three ids, never any other.
4. `update corrective_actions set status = 'In Progress' where outlet_id = 'out-012'`
   → **succeeds**.
5. The same update on an outlet outside the list → **0 rows updated**.
6. `update outlets set name = 'x'` → **0 rows** (no `admin.outlets` permission).
7. Empty the assignment list (`update users set outlet_ids = '{}'` as super_admin) and
   re-test: the manager now sees **nothing**. Empty never means "all" for `ops_manager`.

### Executive cannot write

1. Sign in as the executive account.
2. Reads succeed for outlets, brands, visits, findings, alerts, corrective actions,
   reports and `kpi_config`.
3. `select * from notifications` → only rows where `'executive' = any(audience)`.
4. `select * from evidence` → **0 rows** (no `evidence.view`).
5. `select * from audit_questions` → **0 rows** (no `visits.view`).
6. `insert into corrective_actions …` → **rejected**.
7. `update alerts set status = 'Resolved' …` → **0 rows updated**.
8. `update visits set status = 'Approved' …` → **0 rows updated**.
9. `insert into reports …` → **rejected**.

### Privilege escalation

1. Sign in as `client_admin`.
2. `insert into users (… role) values (…, 'super_admin')` → **rejected** by
   `users_stakeholder_insert`.
3. `update users set role = 'super_admin' where id = '<own id>'` → **exception 42501**
   from `prevent_privilege_escalation`.
4. `update users set outlet_ids = '{}'` on any row → **exception 42501**.
5. Sign in as `analyst`: `select count(*) from users` → **1**.

### Audit-trail immutability

1. As any role: `insert into activity_logs (…)` → **succeeds**.
2. As `super_admin`: `update activity_logs set action = 'x'` → **permission denied for
   table activity_logs**.
3. `delete from activity_logs` → **permission denied**.

### Anonymous access

1. Create a client with the anon key and **no session**.
2. Every `select` against every table in `public` → **permission denied / 0 rows**.
3. `GET` the public URL of an evidence object → **400/404** (the bucket is private).
