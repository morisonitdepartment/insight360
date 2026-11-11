# Go-live runbook — Sterling programme, first live round

Everything needed to take the Sterling programme from a working demonstration to
real shoppers answering real questionnaires against the live Supabase project.
Written so somebody who has never seen this conversation can finish it.

**Supabase project:** `cmnnbizfvppaudgbjfrv`
**Live app:** `morisonitdepartment.github.io/insight360/app/`

## Where things stand

As of 10 November 2026 the live database holds **3 users and nothing else** — no
brands, outlets, questionnaires, shoppers or visits. Migrations `0010` and `0011`
are written but **not applied**. Check the current position before you start:

```sql
select 'brands' t, count(*) n from public.brands
union all select 'outlets', count(*) from public.outlets
union all select 'templates', count(*) from public.audit_templates
union all select 'stages', count(*) from public.audit_sections
union all select 'questions', count(*) from public.audit_questions
union all select 'shoppers', count(*) from public.shoppers
union all select 'visits', count(*) from public.visits order by t;
```

And which migrations are tracked:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

## Step 1 — Apply the two migrations

In order. `0010` adds the service-sequence columns, `0011` the brand-framework ones.
Both are additive and nullable, so they are safe on a populated database — but
nothing below works without them, and the seed fails on a missing column.

```
supabase/migrations/0010_service_sequence.sql
supabase/migrations/0011_brand_framework.sql
```

Apply with the Supabase CLI (`supabase db push`) or by pasting each file into the
SQL editor. Do not reorder them.

## Step 2 — Load the questionnaires

`supabase/seed_sterling.sql` — 3 brands, 3 outlets, 3 questionnaires, 51 stages,
**562 questions**. Paste it into the SQL editor and run it. It ends with a count
query; the questions row should read 562.

Every insert is `on conflict (id) do update`, so it is safe to re-run after a
questionnaire change. It deliberately creates **no shoppers and no visits** —
people and schedules are not reference data.

### Regenerating it

Never hand-edit the SQL. It is generated from the app's own dataset so the live
database cannot drift from what the client was shown:

```bash
VITE_APP_MODE=demo VITE_CLIENT=sterling npm run emit:live-seed
```

**The `VITE_APP_MODE=demo` prefix is required.** `.env` sets `VITE_APP_MODE=live`,
and in live mode the generator reads an empty dataset and would emit an empty seed.

Run `npm run check:frameworks` first — if a questionnaire cannot be scored, there is
no point loading it.

## Step 3 — Create the three shopper accounts

**Use the app, not SQL.** Administration → Users → Create user creates the Auth
account, the profile row and the shopper record in one action, and shows you a
temporary password once so you can pass it on. The `provision-user` Edge Function
is deployed and active on this project, so this route works today.

| Name | Role | Outlet | Visit date |
|---|---|---|---|
| Allaway Rashidi | Mystery Shopper | Shebestan Palace – Al Sadd (FB-001) | 10 Nov 2026 |
| Ahmed Ouf | Mystery Shopper | Bennigan's – Qatar Tennis Federation (FB-002) | 11 Nov 2026 |
| Roben | Mystery Shopper | Pizza Hut – Doha Festival City (FB-003) | 13 Nov 2026 |

Leave outlet codes empty — a shopper only ever sees the visits assigned to them.

### Two traps

**The email address is permanent.** `app.provision_user` derives the shopper's record
id as `'shp-' || substr(md5(email),1,10)`. Change the email later and you get a
*second* shopper, not a renamed one. Use each person's real, permanent work address
the first time.

**`ahmedouf@morisonqatar.com` is already a super_admin on this project.**
`provision_user` updates a person rather than duplicating them, so provisioning that
address as a shopper would **demote that account** and strip its administration
access. Ahmed needs a second address to hold both — the app reads one role per user.

`supabase/create_shoppers.sql` does all three in one go if you would rather work in
SQL, but Supabase Auth owns passwords, so you must create the Auth users first
(Authentication → Users → Add user, tick *Auto Confirm User*).

Afterwards, check the roster — `can_sign_in` must be true for all three:

```sql
select name, email, role, can_sign_in from public.user_access_review
where role = 'shopper' order by name;
```

## Step 4 — Book the three visits

Operations → Visits → New visit. Choosing the outlet selects its questionnaire
automatically, because the brand names it. Assign each shopper the visit in the table
above. Only a super_admin holds `visits.assign`.

## Step 5 — Walk one visit end to end before anyone travels

Sign in as one shopper and open the assigned visit. Confirm:

- the stepper shows stage names with their weight (`15%`)
- a gated question stays hidden until its gate is answered
- a calculated duration says *"Calculated once both clock times are recorded"* and
  fills in once both stamps are entered
- submitting produces a score, and the report's stage contributions sum to it

If the chain holds for one visit, it holds for all three.

## Treat the first round as a pilot, not as data

The questionnaires have never been answered by a human in a restaurant. Expect the
first round to surface wording problems, questions that are awkward to answer at the
table, and timing stamps that are hard to capture while eating. That is normal and
cheap to fix — once.

Two things to settle before any of it becomes a contractual report:

1. **Thresholds.** 18 of the 20 timing standards are our assumptions, not the
   clients'. See [THRESHOLDS.md](THRESHOLDS.md) — that document is written to be sent
   to a brand for sign-off row by row.
2. **Calibration.** Three shoppers have never been compared against each other. Two
   shoppers scoring the same outlet differently is the standard way mystery-shopping
   data loses credibility. One joint visit, or the same outlet twice in a week, tells
   you whether the scores mean the same thing between people.

## Open decisions

- Should Operations Manager or Client Admin hold `visits.assign`? Today only
  super_admin does, which makes every assignment a bottleneck.
- Should shopper certification hard-block the Assign button, or only warn?
