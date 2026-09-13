# INSIGHT360 — Security Model

This document describes what INSIGHT360 protects, who it protects it from, the controls
that are implemented today, and the hardening steps recommended before a real engagement.

INSIGHT360 is a **client-side application**. In Demo Mode there is no server and no data
leaves the browser. In Live Mode the only backend is Supabase, and the security boundary is
therefore **Postgres Row Level Security**, not application code.

---

## 1. Assets

| Asset | Sensitivity | Where it lives |
| --- | --- | --- |
| Mystery-shopper identities and contact details | High — shoppers must stay anonymous to outlets | `public.shoppers` |
| Visit results, scores and narratives | High — commercially sensitive, outlet-attributable | `public.visits`, `visit_answers` |
| Evidence files (photos, video, receipts) | High — may contain faces, names, addresses, payment traces | Storage bucket `evidence` |
| Findings, alerts, corrective actions | Medium–High — operational and reputational risk | `public.findings`, `alerts`, `corrective_actions` |
| User accounts, roles and outlet scope | High — the access-control data itself | `public.users`, `user_roles`, `user_outlets` |
| Activity log | Medium — forensic value only if trustworthy | `public.activity_logs` |
| Configuration (KPI weights, templates, rules) | Medium — integrity matters more than confidentiality | `kpi_config`, `audit_*`, `notification_rules` |

---

## 2. Threat model

| # | Threat | Actor | Mitigation |
| --- | --- | --- | --- |
| T1 | An outlet manager (ops_manager) reads another region's scores to benchmark or pre-empt an audit | Authenticated insider | `app.can_see_outlet()` — ops managers are **always** restricted to an explicit outlet list; empty never means "all" |
| T2 | A mystery shopper reads findings, alerts, other shoppers' visits or management reports | Authenticated insider | Shopper policies limit reads to their own visits and the template tree behind them; they hold none of the `findings/alerts/actions/reports` permissions |
| T3 | A shopper edits an already-approved visit to improve a score | Authenticated insider | `app.can_write_visit()` — writes only while the visit is `Assigned`, `In Progress`, `Draft` or `Rejected`; the `with check` on `visits_shopper_update` excludes `Approved` |
| T4 | A read-only role (executive, analyst) mutates data through the API despite a hidden UI button | Authenticated insider | No insert/update policies exist for those roles; UI gating is cosmetic only |
| T5 | A user promotes themselves to `super_admin`, or widens their outlet scope | Authenticated insider | `prevent_privilege_escalation` trigger on `public.users` (error `42501`), plus a `with check` limiting `client_admin` to stakeholder roles |
| T6 | A user erases their tracks in the audit log | Authenticated insider | `update` and `delete` are **revoked** on `public.activity_logs` — not merely unpolicied |
| T7 | Evidence is downloaded by an unauthenticated party from a guessed URL | External | The bucket is private; no `anon` policy; access needs a session and a passing `app.can_see_visit()`; files are served via short-lived signed URLs |
| T8 | Malicious or oversized upload (web shell, huge video, executable) | Authenticated insider | Client-side MIME + 50 MB check, **and** bucket-level `allowed_mime_types` + `file_size_limit`, **and** an object insert policy |
| T9 | Credential stuffing / weak passwords | External | Supabase Auth (bcrypt, rate limiting); MFA recommended below |
| T10 | Secrets leak through the frontend bundle | Accidental | Only the anon key is ever used; nothing `VITE_`-prefixed is secret; no service-role key anywhere in the repository |
| T11 | Supply-chain compromise of an npm dependency | External | Pinned `package-lock.json`, `npm ci` in CI; Dependabot/audit recommended below |
| T12 | Client tampering — forging a role in localStorage or the JS console | Authenticated insider | The role is read server-side from `public.users` by `auth.uid()`; a forged client role changes nothing that RLS evaluates |
| T13 | Cross-site scripting injecting script through user-entered text (comments, narratives, CAPA fields) | Authenticated insider | React escapes by default; the app never uses `dangerouslySetInnerHTML`; CSP recommended below |
| T14 | Data loss (accidental deletion, ransomware, region failure) | Various | Backups / PITR recommended below |

**Explicitly out of scope:** a compromised Supabase project owner account, a malicious
`service_role` key holder, physical device compromise, and anyone with `postgres`
superuser access — all of these bypass RLS by definition.

---

## 3. Implemented controls

### 3.1 Demo credentials exist only in demo mode

`src/config/demoAccounts.ts` holds six fixtures sharing the password `Demo@123`. They are
consumed only by the demo repository; when `VITE_APP_MODE=live` the application uses
`SupabaseRepository` and Supabase Auth owns credentials. The demo accounts grant nothing
anywhere — they unlock a dataset that is generated in the visitor's own browser.

### 3.2 No secrets in source

The repository contains no keys, tokens or connection strings. `.env` is git-ignored;
`.env.example` ships with empty values and an explicit warning. Vite only exposes
`VITE_`-prefixed variables to client code, and **anything so exposed is public** — it is
compiled into the JavaScript bundle that every visitor downloads.

### 3.3 Anon key only

`src/services/supabaseClient.ts` builds the client from `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` and throws if either is absent. The anon key is an identifier, not
an authorisation: by itself it can read nothing, because `0002_rls.sql` executes
`revoke all on all tables in schema public from anon;` and every policy targets
`to authenticated`.

The **service-role key bypasses RLS entirely** and must never appear in `.env`, in
`vite.config.ts`, in a GitHub Actions variable, or in any file under `src/`. Keep it in a
password manager and use it only from a trusted machine.

### 3.4 RLS mirrors the permission matrix

`src/config/permissions.ts` defines 36 permission keys and the role matrix. That matrix is
reproduced twice on the server:

* as rows in `public.role_permissions` (seeded by `0003_seed_reference.sql`), and
* as `app.role_has_permission()` in `0002_rls.sql`, a literal fallback used if the table is
  unseeded — so the policies can never fail open.

RLS is enabled on all 26 tables. `app.has_permission()` evaluates the user's effective
permissions over `users.role ∪ user_roles`, and every policy is expressed in terms of it
plus the scope helpers `app.can_see_outlet()`, `app.can_see_visit()` and
`app.can_write_visit()`.

The practical consequence: **hiding a button in the UI is a usability decision, not a
security control.** The control is the policy.

### 3.5 Server-side role resolution

`SupabaseRepository.profileFor()` selects from `public.users` by `auth_id = auth.uid()`,
rejects any profile whose `status` is not `active`, and returns the role from the database.
Nothing the browser sends influences the role that RLS evaluates — `auth.uid()` comes from
the signed JWT.

### 3.6 Upload validation on both sides

| Layer | Control |
| --- | --- |
| Client (`uploadEvidence`) | MIME allow-list (JPEG, PNG, WebP, MP4, PDF), 50 MB cap, filename sanitised to `[\w.-]`, deterministic `<visit_id>/<evidence_id>-<name>` path, `upsert: false` so an existing object is never overwritten |
| Bucket (`storage.buckets`) | `public = false`, `file_size_limit = 52428800`, `allowed_mime_types` set to the same five types |
| Object policies (`storage.objects`) | insert requires `evidence.upload` **and** `app.can_write_visit(split_part(name,'/',1))`; select requires `evidence.view` **and** `app.can_see_visit(...)`; delete is super-admin only; there is no `anon` policy |
| Table (`public.evidence`) | Its own insert/select policies, so a row cannot be recorded for a visit the user cannot write |

Client-side validation is a user-experience affordance. The bucket and object policies are
the enforcement.

### 3.7 Immutable activity logs

`public.activity_logs` has no `updated_at` column, an insert policy open to any signed-in
application user, a select policy requiring `admin.logs`, and — critically —
`revoke update, delete on public.activity_logs from authenticated, anon;`. Because the
privilege itself is gone, not even a `super_admin` can rewrite the trail through the API.
Only a direct `postgres`/`service_role` connection could, which is the documented trust
boundary.

### 3.8 Privilege-escalation guard

A `before update` trigger on `public.users` raises `42501` when a non-super-admin changes
`role`, `status`, `outlet_ids`, `brand_ids`, `shopper_id` or `auth_id` — the last two
because re-pointing either would hand the caller another identity's data through
`app.current_shopper_id()` / `app.current_user_id()`. `client_admin` may create and edit
stakeholder accounts (`client_admin`, `executive`, `analyst`, `ops_manager`) but can never
mint a `super_admin` or a `shopper`, and can never re-role an existing account. Contexts
without `auth.uid()` (migrations, the SQL editor, the service role) are exempt by design.

### 3.9 Session handling

Sign-in takes a *remember me* flag. When it is unchecked the repository writes
`insight360.session.ephemeral` to `sessionStorage`, so the session is treated as
tab-scoped. The Supabase client is configured with `persistSession: true` and
`autoRefreshToken: true`.

---

## 4. Recommendations before a real engagement

### 4.1 Multi-factor authentication

Enable **Supabase Auth MFA (TOTP)** and require it at minimum for `super_admin` and
`client_admin`.

* Dashboard → **Authentication → Providers / Multi-Factor** → enable TOTP.
* Enrol with `supabase.auth.mfa.enroll({ factorType: 'totp' })`, verify with
  `mfa.challengeAndVerify()`.
* Gate sensitive operations on the assurance level:
  `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` → require `aal2`.
* `public.users.mfa_enabled` already exists as the profile-side flag; keep it in step with
  the enrolled factors and surface it in the users admin screen.
* For a hard requirement, add `(auth.jwt() ->> 'aal') = 'aal2'` to the policies on
  `public.users`, `role_permissions` and `activity_logs`.

### 4.2 Session handling

* Shorten the JWT lifetime (Authentication → Sessions) to 30–60 minutes; the refresh token
  covers continuity.
* Enable **refresh-token rotation** and reuse detection.
* Prefer the ephemeral (session-storage) path for shared or public devices; consider making
  *remember me* opt-in per policy rather than the default.
* Add an idle timeout that signs out after ~30 minutes of inactivity on admin roles.
* Set **single session per user** if the engagement requires it.

### 4.3 Content Security Policy and transport headers

GitHub Pages cannot set response headers. On a real host (Cloudflare, Netlify, Vercel,
nginx) serve at least:

```
Content-Security-Policy: default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://<project-ref>.supabase.co;
  media-src 'self' blob: https://<project-ref>.supabase.co;
  connect-src 'self' https://<project-ref>.supabase.co wss://<project-ref>.supabase.co;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
  form-action 'self'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cross-Origin-Opener-Policy: same-origin
```

`style-src 'unsafe-inline'` is needed by Tailwind's runtime style injection and Recharts;
everything else can stay strict. Verify against the PDF/canvas export path
(`html2canvas` + `jsPDF`) before enforcing, and roll out with
`Content-Security-Policy-Report-Only` first.

### 4.4 Dependency scanning

* Enable **Dependabot alerts** and **security updates** on the repository.
* Add `npm audit --audit-level=high` and `npm ci` to CI so a vulnerable transitive
  dependency fails the build.
* Consider `npm audit signatures` / provenance checks, and pin the Node version (already
  20 in the workflow).
* Review the export stack (`xlsx`, `jspdf`, `html2canvas`) on each upgrade — they process
  untrusted content.
* Enable **secret scanning** and **push protection** on the repository.

### 4.5 Backups and recovery

* Free tier gives daily backups; enable **Point-in-Time Recovery** on a paid plan before
  the first live engagement.
* Schedule an independent logical dump (`supabase db dump` / `pg_dump`) to storage you
  control, and **restore it somewhere at least once** — an untested backup is a hypothesis.
* Storage objects are not covered by the database backup: replicate the `evidence` bucket
  separately.
* Document an RPO/RTO with the client and record retention and deletion rules for evidence
  containing personal data.

### 4.6 Operational hygiene

* Re-run the RLS testing checklist in [`../supabase/README.md`](../supabase/README.md) §8
  after **every** change to `permissions.ts` or to a migration.
* Keep `permissions.ts`, `app.role_has_permission()` and `0003_seed_reference.sql` in the
  same commit whenever the matrix changes.
* Review `public.activity_logs` periodically for `Failed` / `Denied` results.
* Rotate the anon key if a policy gap ever reaches production, and audit the logs
  afterwards.
* Grant `super_admin` to as few people as the engagement allows, and review the roster each
  quarter.
* Never disable RLS to debug; impersonate a role instead.

---

## 5. Privacy note

The demo dataset is entirely fictional — no real person, outlet, brand or audit result
appears anywhere in it. A live deployment, by contrast, will hold personal data about
mystery shoppers and, through evidence files, potentially about outlet staff and other
customers. Before going live, agree a lawful basis, a retention period and a deletion
process for evidence, restrict who holds `evidence.view`, and prefer signed URLs with short
expiry over any form of shared link.
