# Go-live runbook — Sterling programme, first live round

Everything needed to take the Sterling programme from a working demonstration to
real shoppers answering real questionnaires against the live Supabase project.
Written so somebody who has never seen this conversation can finish it.

**Supabase project:** `cmnnbizfvppaudgbjfrv`
**Live app:** `morisonitdepartment.github.io/insight360/app/`

## Where things stand

Verified on **11 November 2026**, after loading:

| | |
|---|---|
| Migrations | `0001`–`0012` **all applied** (0012 on 13 November 2026) |
| Brands / outlets / questionnaires | 3 / 3 / 3 |
| Stages | 51 — each template sums to exactly **100.00** scored weight, with the conditional Complaint Handling stage (5) outside it |
| Questions | **562** — matching each template's declared count exactly |
| Shoppers | **0 — the remaining step** |
| Visits / answers / evidence | 0 |

Steps 1 and 2 below are **done**. What is left is Step 3 onward: the people.

> **The demonstration is not this.** `…/insight360/` is the demonstration and
> keeps everything in the browser; `…/insight360/app/` is this database. Records
> entered on the first address never reach the second one. Two evenings of real
> outlets and visits were lost to exactly that in November 2026.

Check the current position before you start:

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

## Steps 1 and 2 — Schema and questionnaires, in one run

Paste **`supabase/GO_LIVE.sql`** into the Supabase SQL editor and run it. That one
file is the two migrations and the seed in the only order that works:

| Part | What it does |
|---|---|
| 1 | Migration `0010` — the service-sequence columns |
| 2 | Migration `0011` — the brand-framework columns |
| 3 | 3 brands, 3 outlets, 3 questionnaires, 51 stages, **562 questions** |

It ends with a check that prints `OK` or `FAIL` per row. **Every row must read
`OK`,** and questions must read 562.

Three files pasted by hand is three chances to paste them in the wrong order, and
a half-applied schema announces itself as `column does not exist` from somewhere
deep in the seed. One file cannot be mis-ordered. If the base schema is missing
it stops immediately with a readable message instead of a wall of errors.

**Safe to re-run.** Every column is added `if not exists`, every insert is
`on conflict (id) do update`. A second run changes nothing, so a run that failed
halfway is fixed by running it again. It touches no visits, answers or evidence —
only the questionnaire and the outlets. It deliberately creates **no shoppers and
no visits**: people and schedules are not reference data.

The three source files are still there and still apply in order
(`0010`, `0011`, `seed_sterling.sql`) if you would rather run them separately.

### Rebuilding it

`GO_LIVE.sql` is generated. After regenerating the seed (below), run:

```bash
bash scripts/build-go-live.sh
```

It counts the expected rows out of the seed rather than trusting the numbers
written here, so a questionnaire that gains a question cannot leave the closing
check asserting the old total.

### Regenerating the seed

Never hand-edit the SQL. It is generated from the app's own dataset so the live
database cannot drift from what the client was shown:

```bash
VITE_APP_MODE=demo VITE_CLIENT=sterling npm run emit:live-seed
```

**The `VITE_APP_MODE=demo` prefix is required.** `.env` sets `VITE_APP_MODE=live`,
and in live mode the generator reads an empty dataset and would emit an empty seed.

Run `npm run check:frameworks` first — if a questionnaire cannot be scored, there is
no point loading it. Then rebuild `GO_LIVE.sql` with `bash scripts/build-go-live.sh`,
or the one-file route will still carry the old questionnaire.

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

### Working as each person — Switch account

Once the shoppers and reviewers exist, a super admin does not need their passwords to
key in their work: **profile menu → Switch account** opens any non-admin account in one
click, and a teal bar with **Back to …** returns to the administrator. Every switch is
written to the activity log under the administrator's name, and anything saved while
switched is recorded under the borrowed account — exactly as if that person had done it.
It needs the `switch-account` Edge Function (see `supabase/functions/README.md`).

## Step 4 — Book the three visits

Operations → Visits → New visit. Choosing the outlet selects its questionnaire
automatically, because the brand names it. Assign each shopper the visit in the table
above, and pick the **Reviewer** — the person who approves it. Only a super_admin holds
`visits.assign`.

### The workflow each visit follows

| Step | Who | What they see |
|---|---|---|
| Booked / Assigned | Super admin | Books the visit, names shopper and reviewer. The shopper is notified. |
| In progress | Shopper | **Start visit**, answers stage by stage, takes photos on the phone. |
| Submitted | Shopper | **Submit visit**. The named reviewer is notified. |
| Under review | Reviewer | **Visits → Show my approvals**. Approve, or reject with a reason. |
| Approved | — | Report released; the shopper is notified. A rejected visit goes back to the shopper. |

Only the named reviewer (or a super admin) can approve — enforced by the database, not
just the screen. A visit booked with no reviewer can be approved by anyone holding
`visits.review`.

Migration `0012_workflow_and_photos.sql` must be applied for this: it lets a shopper's
submission raise its notification, finding and alert, addresses notifications to one
person, restricts approval to the named reviewer, and accepts phone videos (.mov).

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
