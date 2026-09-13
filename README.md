# INSIGHT360 — Mystery Shopping Intelligence Platform

**Customer Experience • Compliance • Analytics • Continuous Improvement**

INSIGHT360 is an enterprise mystery-shopping platform for multi-brand hospitality and
entertainment portfolios. It covers the whole programme lifecycle — planning visits,
assigning trained shoppers, capturing evidence-based assessments in the field, scoring
them against a weighted KPI model, raising findings and escalations, driving corrective
actions to closure, and reporting the result to the board.

It ships as a fully interactive **Demo Mode** (deterministic seeded dataset, no backend,
deployable to GitHub Pages) and a **Live Mode** backed by Supabase (Auth + Postgres with
Row Level Security + Storage).

> Everything in the demo dataset is fictional. See [Disclaimer](#disclaimer).

---

## Table of contents

- [Feature overview](#feature-overview)
- [Tech stack](#tech-stack)
- [Operating modes](#operating-modes)
- [Demo accounts](#demo-accounts)
- [Quick start](#quick-start)
- [Deployment to GitHub Pages](#deployment-to-github-pages)
- [Base path, router basename and the SPA fallback](#base-path-router-basename-and-the-spa-fallback)
- [Project structure](#project-structure)
- [Scoring model](#scoring-model)
- [Security](#security)
- [Data quality & reconciliation](#data-quality--reconciliation)
- [Guided demo storyline](#guided-demo-storyline)
- [Documentation](#documentation)
- [Disclaimer](#disclaimer)

---

## Feature overview

### Login & roles
Email/password sign-in with a remember-me option, six distinct roles and a
permission-driven interface. Navigation items, routes and action buttons are all gated by
the same 36-key permission matrix (`src/config/permissions.ts`), which Supabase RLS mirrors
server-side in live mode. Read-only roles never see a mutation control.

| Role | Scope |
| --- | --- |
| Super Admin | Full platform administration |
| Client Admin | Portfolio-wide client visibility, stakeholder management, approvals |
| Operations Manager | Assigned outlets only; owns corrective actions |
| Mystery Shopper | Own assigned visits, questionnaire and evidence upload |
| Analyst | Read-only analytics, benchmarking and exports |
| Executive | Read-only dashboard, rankings, risks, trends, reports |

### Executive dashboard
Organisation health at a glance: overall experience score with period variance, the six
weighted KPI cards, risk distribution, critical findings needing attention, SLA compliance,
CAPA closure rate, trend lines and automatically generated insight statements.

### 50-outlet portfolio & drill-down
A ranked portfolio of 50 F&B and entertainment outlets with risk ratings, segment and brand
filters, heatmaps and a map-style grid. Drilling into an outlet gives its score history,
category radar, benchmark position and percentile, visit history, open findings, evidence
and the main-audit vs follow-up comparison.

### Visits & mobile questionnaire
Visit planning, calendar, shopper assignment and reassignment, SLA tracking and a full
approval workflow (Planned → Assigned → In Progress → Draft → Submitted → Under Review →
Approved / Rejected → Closed). The assessment screen is a mobile-first questionnaire with
ten question types (yes/no, 5- and 10-point ratings, pass/fail, multiple choice, text,
numeric, time, photo, video), per-question guidance, N/A handling, mandatory-comment and
mandatory-evidence rules, live progress and draft autosave.

### Scenario-based assessments
Every visit carries a briefed scenario from an eight-scenario library: standard visit,
complaint handling, return/refund, special request, service recovery under pressure,
accessibility and assistance, group booking and onboarding, and a social-media enquiry and
complaint run entirely through the outlet's channels. Each scenario carries step-by-step
shopper instructions and a stated expected outcome, is shown as a briefing card on the
questionnaire, and is reproduced in the client's visit report so the deliberate test is
visible alongside the result.

### Assessment journeys
Nine journeys are covered by six templates: in-store dine-in, takeaway, delivery,
entertainment ticketing, digital interaction and a dedicated social-media assessment
measuring response time, public acknowledgement, private-channel handover, remedy quality,
brand tone and profile accuracy.

### Two-tier reporting SLA
Report submission is graded twice: against a 24-hour preferred target and against the
48-hour contractual maximum, with at-risk and breached states in between. Both compliance
percentages, average turnaround, late reports and reports due today are reported, and both
thresholds are configurable under System Settings.

### Weighted scoring engine
Answers score to 0–1, roll up by question weight into sections, sections into the six KPI
categories, and categories into a single weighted visit score — with a critical-failure
override. See [Scoring model](#scoring-model).

### Evidence library
Photos, videos, receipts, screenshots and documents linked to the visit, the outlet, the
KPI category and the specific question that failed. Filterable gallery with preview,
lightbox and per-visit deep links. In live mode files live in a private Supabase Storage
bucket with a 50 MB limit and a MIME allow-list enforced on both the client and the server.

### Alerts & escalation
Critical answers raise alerts automatically with a severity, an owner, an escalation
deadline (12/24/48 hours per rule) and a complete audit trail: New → Acknowledged →
Investigating → Action Required → Resolved → Closed.

### Corrective actions (CAPA)
Full CAPA records — root cause, immediate action, corrective action, preventive action,
owner, priority, target date, closure evidence, verification note and history. Status flow:
Open → Assigned → In Progress → Awaiting Evidence → Awaiting Verification → Closed, with
automatic overdue detection.

### Benchmarking, trends & comparison
Segment and brand benchmarks, percentile positioning, category averages, monthly trend
analysis, main-audit vs follow-up effectiveness, side-by-side outlet comparison and
repeat-finding detection.

### Reports & exports
Visit reports (weighted results, shopper narrative, evidence, findings), management reports
(executive summary, quarterly performance, risk & compliance, trend analysis), a report
builder, and export to CSV, Excel, PDF, JSON and print.

### Administration
Outlets, users, roles & permissions, audit templates (sections and questions), KPI
configuration and weights, notification rules, system settings and an immutable activity
log.

### Guided demo
An eight-step narrated tour that walks a new viewer through the complete storyline, from
the executive dashboard to the closed corrective action and the board report. See
[Guided demo storyline](#guided-demo-storyline).

---

## Tech stack

| Layer | Technology |
| --- | --- |
| UI | React 19, TypeScript 6 (strict), Vite 8 |
| Styling | Tailwind CSS 3 (`darkMode: 'class'`), full light/dark theming |
| Routing | React Router 7 (`BrowserRouter` with a base-path-aware `basename`) |
| Charts | Recharts 3 via typed wrappers in `src/components/charts` |
| Icons | lucide-react |
| Notifications | react-hot-toast |
| Exports | xlsx, jsPDF, html2canvas |
| Dates | date-fns |
| Backend (live) | Supabase — Auth, Postgres 15 + RLS, Storage |
| Lint | oxlint |
| Deploy | GitHub Actions → GitHub Pages (or `gh-pages` branch) |

No state-management library: React context plus reducer "recipes" in
`src/services/actions.ts` keep every mutation pure and auditable.

---

## Operating modes

The mode is chosen at build time by `VITE_APP_MODE` and read once in `src/config/app.ts`.

### Demo Mode (default)

* No backend, no network calls, no secrets.
* `generateDataset()` in `src/data/seed.ts` builds the entire portfolio deterministically
  from a seeded PRNG, so every reload — and every deployment — produces identical numbers.
* "Today" is pinned to **2026-09-13 10:00** so the storyline never drifts.
* Mutations are applied in memory and persisted to `localStorage`; **Reset demo** restores
  the pristine dataset.
* Credentials come from `src/config/demoAccounts.ts` and exist only in this mode.

### Live Mode (Supabase)

* Supabase Auth owns credentials; `public.users.auth_id` links an auth user to their
  INSIGHT360 profile.
* Roles and permissions are resolved **server-side** from the `users` table — never from
  client state.
* Every table has Row Level Security mirroring the permission matrix.
* Evidence uploads go to a private `evidence` bucket.

### Environment variables

Copy `.env.example` to `.env`:

```bash
# "demo" (no backend, seeded data) or "live" (Supabase)
VITE_APP_MODE=demo

# Live Mode only. Only the public anon key belongs here.
# NEVER put the service-role key in any frontend configuration.
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# Base path for GitHub Pages project sites, e.g. /insight360/
VITE_BASE_PATH=
```

Backend setup, migrations and the RLS model are documented in
[`supabase/README.md`](supabase/README.md).

---

## Demo accounts

Available **in demo mode only**. All six share the password `Demo@123`. They are seeded
fixtures, not credentials for any real system, and they do not exist in live mode.

| Email | Role | What you see |
| --- | --- | --- |
| `admin@insight360.demo` | Super Admin | Full platform administration |
| `clientadmin@insight360.demo` | Client Admin | Portfolio-wide client visibility |
| `manager@insight360.demo` | Operations Manager | Assigned outlets only |
| `shopper@insight360.demo` | Mystery Shopper | Assigned visits & questionnaire |
| `analyst@insight360.demo` | Analyst | Analytics, benchmarking, exports |
| `executive@insight360.demo` | Executive | Read-only executive view |

The login screen offers one-click sign-in for each account.

---

## Quick start

Requires Node.js 20+ and npm.

```bash
npm install       # install dependencies
npm run dev       # start the dev server on http://localhost:5173
npm run build     # type-check (tsc -b) and build to dist/
npm run preview   # serve the production build locally
npm run typecheck # tsc -b --noEmit
npm run lint      # oxlint
```

`npm run build` fails on any type error — the build is the type gate.

---

## Deployment to GitHub Pages

### (a) Automatic — GitHub Actions (recommended)

`.github/workflows/deploy.yml` builds and publishes on every push to `main`, and can be
triggered manually via **workflow_dispatch**.

1. Push the repository to GitHub.
2. Go to **GitHub → Settings → Pages → Build and deployment → Source: "GitHub Actions"**.
3. Push to `main` (or run the workflow manually from the **Actions** tab).

The workflow checks out the repo, installs with `npm ci`, builds with
`VITE_APP_MODE: demo` and
`VITE_BASE_PATH: /${{ github.event.repository.name }}/` — so **the base path is set
automatically from the repository name, whatever it is called** — runs
`node scripts/spa-fallback.cjs`, uploads `dist` and deploys with `actions/deploy-pages`.

Your site appears at `https://<user>.github.io/<repo-name>/`.

### (b) Manual — the `gh-pages` branch

```bash
npm run deploy
```

`predeploy` runs `npm run build` followed by `node scripts/spa-fallback.cjs`, then
`gh-pages -d dist -t true` publishes `dist` (including dotfiles such as `.nojekyll`) to the
`gh-pages` branch.

Then set **Settings → Pages → Source: "Deploy from a branch"**, branch `gh-pages`,
folder `/ (root)`.

If the repository is **not** named `insight360`, set the base path before building:

```bash
# .env
VITE_BASE_PATH=/my-repo-name/
```

(The Actions workflow does this for you; the manual route does not.)

---

## Base path, router basename and the SPA fallback

Three pieces have to agree for a project site served from a sub-path to work:

1. **Vite base** — `vite.config.ts` reads `VITE_BASE_PATH`, falling back to `/insight360/`
   for production builds and `/` in development. This prefixes every emitted asset URL.
2. **Router basename** — `src/App.tsx` derives it from the build-time base:
   ```ts
   const basename = import.meta.env.BASE_URL.replace(/\/$/, '')
   <BrowserRouter basename={basename}>
   ```
   so routes never need to know where the app is mounted.
3. **404 fallback** — GitHub Pages has no SPA rewrite. `scripts/spa-fallback.cjs` copies
   `dist/index.html` to `dist/404.html` and writes an empty `dist/.nojekyll` (so Pages does
   not run Jekyll and does not strip files beginning with `_`). Pages then serves the app
   for any deep link such as `/insight360/performance/outlets/out-012`, and the router
   resolves the route client-side.

Troubleshooting (blank page, 404 on refresh, stale caches) is covered in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Project structure

```
insight360/
├─ .github/workflows/deploy.yml   GitHub Pages CI (build + deploy)
├─ docs/
│  ├─ FOUNDATION.md               Shared foundation guide for page development
│  ├─ DEPLOYMENT.md               GitHub Pages + Live Mode deployment
│  └─ SECURITY.md                 Threat model and controls
├─ public/favicon.svg
├─ scripts/spa-fallback.cjs       dist/404.html + dist/.nojekyll for GitHub Pages
├─ supabase/
│  ├─ README.md                   Backend setup, RLS model, testing checklist
│  └─ migrations/
│     ├─ 0001_schema.sql          26 tables, constraints, indexes, triggers
│     ├─ 0002_rls.sql             RLS policies, app.* helpers, storage bucket
│     └─ 0003_seed_reference.sql  Roles, permissions, KPI, notification rules
├─ src/
│  ├─ App.tsx                     Routes, guards, lazy loading, basename
│  ├─ components/
│  │  ├─ charts/                  Recharts wrappers (trend, radar, donut, heatmap…)
│  │  ├─ guided/                  Guided demo overlay and controls
│  │  ├─ layout/                  Shell, sidebar, topbar, breadcrumbs
│  │  └─ ui/                      Card, DataTable, Badge, Modal, Form, EvidenceThumb…
│  ├─ config/
│  │  ├─ app.ts                   Mode, Supabase env, branding, fixed demo date
│  │  ├─ demoAccounts.ts          Demo credentials (demo mode only)
│  │  ├─ navigation.ts            Permission-gated navigation tree
│  │  └─ permissions.ts           36 permission keys + role matrix (source of truth)
│  ├─ contexts/                   Auth, Data, Filter, Theme, GuidedDemo
│  ├─ data/
│  │  ├─ defaults.ts              Organisation, KPI config, training, notification rules
│  │  └─ seed.ts                  Deterministic dataset generator + STORYLINE ids
│  ├─ hooks/                      useNow, useDebounce, usePagination, useMediaQuery…
│  ├─ pages/
│  │  ├─ auth/                    LoginPage
│  │  ├─ overview/                OverviewPage
│  │  ├─ operations/              Visits, VisitDetail, Assessment, Calendar,
│  │  │                           Assignments, Shoppers, ShopperDetail
│  │  ├─ performance/             ExecutiveDashboard, Outlets, OutletDetail,
│  │  │                           Compare, KpiAnalytics, Benchmarking, Trends
│  │  ├─ quality/                 Findings, CorrectiveActions, Alerts
│  │  ├─ reports/                 VisitReports, VisitReport, ManagementReports,
│  │  │                           ReportBuilder, Exports
│  │  ├─ evidence/                EvidenceLibrary
│  │  └─ admin/                   AdminOutlets, Users, Roles, Templates, KpiConfig,
│  │                              NotificationRules, Settings, ActivityLogs
│  ├─ repositories/               demoRepository | supabaseRepository (same interface)
│  ├─ services/                   actions (reducers), analytics, derive, supabaseClient
│  ├─ types/index.ts              Domain model
│  └─ utils/                      scoring, format, export, prng, cn
├─ .env.example
├─ tailwind.config.js
└─ vite.config.ts
```

---

## Scoring model

Six weighted KPI categories, defined in `src/data/defaults.ts` and stored in
`public.kpi_config`:

| KPI category | Weight | Target | Critical threshold |
| --- | ---: | ---: | ---: |
| Customer Experience | **25 %** | 90 | 70 |
| Operational Compliance | **20 %** | 92 | 75 |
| Product & Environment | **20 %** | 90 | 70 |
| Service Speed | **15 %** | 88 | 65 |
| Upselling & Sales | **10 %** | 80 | 50 |
| Safety & Entertainment Compliance | **10 %** | 95 | 80 |
| **Total** | **100 %** | | |

**How a score is built** (`computeVisitScores` in `src/utils/scoring.ts`):

1. **Answer → 0–1.** Each answer is normalised to a 0–1 value by question type. Purely
   informational questions (weight 0, or type `text` / `photo` / `video`) and questions
   answered N/A are excluded.
2. **Section score.** A weight-weighted mean of its answered questions, expressed as a
   percentage. Unanswered questions never dilute a score — only answered weight counts.
3. **Category score.** Sections roll up into their KPI category, weighted by the answered
   question weight they carry.
4. **Visit score.** The KPI-weighted average of the categories actually present in that
   assessment (weights are renormalised over the categories in scope, so a template that
   omits a category is not penalised).

**Risk bands** (`DEFAULT_THRESHOLDS`):

| Band | Range | Meaning |
| --- | --- | --- |
| Excellent | **≥ 90** | Consistently exceeds brand standards |
| Good | **80 – 89.99** | Meets standards with minor gaps |
| Needs Improvement | **70 – 79.99** | Below standard; corrective action recommended |
| Critical | **< 70** | Immediate intervention required |

**Critical override.** Any question flagged `critical` that scores below 0.5 is recorded as
a critical failure and forces the visit's risk rating to **Critical** regardless of the
numeric score — a 91 % visit with a failed food-hygiene question is still Critical, and it
raises an alert with a 12-hour escalation target.

---

## Security

* **No secrets in source.** The repository contains no keys. Only `VITE_`-prefixed values
  reach the bundle, and everything `VITE_`-prefixed is public by definition.
* **Anon key only.** The frontend uses the Supabase **anon** key. The service-role key must
  never appear in `.env`, in `vite.config.ts` or in GitHub Actions variables.
* **Server-side role resolution.** `SupabaseRepository.profileFor()` reads the role from
  `public.users` by `auth_id`; the client cannot assert a role, and inactive accounts are
  refused at sign-in.
* **RLS mirrors the permission matrix.** `supabase/migrations/0002_rls.sql` enables RLS on
  all 26 tables and reproduces `src/config/permissions.ts` in SQL, including ops-manager
  outlet scoping and the shopper's own-visit-only, still-open-only write window.
* **Privilege-escalation guard.** A trigger on `public.users` rejects any change to `role`,
  `status`, `outlet_ids` or `brand_ids` by a non-super-admin.
* **Immutable audit trail.** `public.activity_logs` accepts inserts and rejects updates and
  deletes at the privilege level.
* **Evidence is private.** The `evidence` bucket is non-public with a 50 MB limit and a
  five-type MIME allow-list, validated client-side and enforced again by bucket and object
  policies keyed on the visit id in the object path.
* **Demo credentials are demo-only.** They live in `src/config/demoAccounts.ts` and are
  never used when `VITE_APP_MODE=live`.

Full threat model and hardening recommendations: [`docs/SECURITY.md`](docs/SECURITY.md).

---

## Data quality & reconciliation

The demo dataset is generated from a seeded PRNG, so it is identical on every machine and
every deployment, and the totals reconcile across every screen:

**Portfolio**

* **50** outlets across F&B and Entertainment segments and multiple brands
* **200** planned visits in the engagement

**Visit status reconciliation** (200 planned)

| Bucket | Count |
| --- | ---: |
| Completed (submitted, reviewed, approved or closed) | **146** |
| Scheduled | **20** |
| In progress | **12** |
| Awaiting approval | **8** |
| Unassigned | **14** |
| **Total** | **200** |

**Open findings**

| Severity | Count |
| --- | ---: |
| Critical | **7** |
| High | **18** |
| Medium | **31** |

**Corrective actions** — **82 %** CAPA closure rate.

**Storyline outlet** — *Urban Fork – Al Wakrah* scored **68.1 %** at its main audit
(service delays, cleanliness gaps, no upselling and one critical hygiene observation) and
**83.1 %** at the follow-up after the corrective action was verified: a **+15.0 point**
recovery, visible in the outlet trend line and in the main-audit vs follow-up comparison.

Dates are anchored to the fixed demo "today" of **2026-09-13 10:00**, so SLA states,
overdue CAPAs and escalation countdowns are stable rather than drifting with the wall
clock.

---

## Guided demo storyline

Start the tour from the header. Eight steps
(`buildDemoSteps()` in `src/contexts/GuidedDemoContext.tsx`):

| # | Step | Destination | What it shows |
| --- | --- | --- | --- |
| 1 | **Executive Dashboard** | `/performance/executive` | Organisation health at a glance: overall experience score around 87 %, KPI cards with period variance, and seven critical findings that need attention. |
| 2 | **Portfolio Performance** | `/performance/outlets?risk=Critical` | All 50 outlets ranked with risk ratings. Filter by segment or risk to isolate the outlets that require intervention. |
| 3 | **Outlet Drill-Down** | `/performance/outlets/:outletId` | Urban Fork – Al Wakrah scored 68.1 % at its latest main audit: service delays, cleanliness gaps, no upselling and one critical hygiene observation. |
| 4 | **Visit Evidence** | `/reports/visits/:visitId#evidence` | The visit report presents the weighted questionnaire results, the shopper narrative and the photographic evidence behind every failed standard. |
| 5 | **Critical Alert** | `/quality/alerts?alert=…` | The critical hygiene failure automatically raised an alert with a 12-hour escalation target, an owner and a full audit trail. |
| 6 | **Corrective Action** | `/quality/corrective-actions?action=…` | A CAPA record captures root cause, immediate, corrective and preventive actions, the owner, target date and closure evidence awaiting verification. |
| 7 | **Follow-Up Improvement** | `/performance/outlets/:outletId#comparison` | The follow-up visit re-assessed the same standards: the score improved from 68.1 % to 83.1 %, and the trend line shows the recovery. |
| 8 | **Management Reporting** | `/reports/management` | Main audit reports, follow-up summaries and quarterly packs bring trends, gaps, risks and recommendations together for the board. |

---

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/FOUNDATION.md`](docs/FOUNDATION.md) | Shared foundation: types, contexts, reducers, UI components, conventions |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | GitHub Pages step by step, custom base paths and domains, troubleshooting, Live Mode deployment |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Threat model, implemented controls, hardening recommendations |
| [`supabase/README.md`](supabase/README.md) | Supabase project setup, migrations, storage, auth linking, RLS testing checklist |

---

## Disclaimer

INSIGHT360 is a demonstration platform. **Every organisation, brand, outlet, person, email
address, score, finding, alert, corrective action, report and data point in the seeded
dataset is entirely fictional** and was generated for illustration. Nothing here represents
a real company, a real location, a real employee, a real mystery shopper or a real audit
result, and no real customer data is present. Any resemblance to an actual business or
individual is coincidental.

The demo credentials are fixtures for the seeded dataset only; they grant no access to any
real system.
