# Timing thresholds — what they are, where they came from

Every threshold in this document is a pass/fail line a client's outlet is judged
against. Twenty are in force. **Two came from a client brief. Eighteen are our
assumptions and need sign-off before any score is treated as contractual.**

Regenerate the live list at any time — it is read from the questionnaires themselves,
so it cannot drift from what the shoppers actually answer:

```bash
VITE_APP_MODE=demo VITE_CLIENT=sterling npm run check:frameworks
```

## How a threshold scores

This matters more than the number, and it is the first thing to explain to a client.
A threshold is **not** a simple pass/fail. From `scoreQuestion` in `src/utils/scoring.ts`:

| Measured time | Score |
|---|---|
| At or under the threshold | 100% |
| 1.5 × threshold | 50% |
| 2 × threshold or more | 0% |

So a 20-minute main-course standard means 20 minutes scores full marks, 30 minutes
scores half, and 40 minutes scores nothing. Setting a threshold therefore sets two
things at once: the standard, and how fast credit falls away past it. A threshold set
too tight does not just fail more visits — it collapses the whole stage toward zero.

One consequence worth stating plainly: a threshold of **0 or absent** makes the
question score `null`, and a null score is dropped before it reaches the stage's
weight sum. The question would sit on screen looking authoritative and contribute
nothing. `npm run check:frameworks` fails the build on that, so it cannot ship.

## Shebestan Palace — Fine Dining

| Code | Standard | Measures | Source |
|---|---|---|---|
| HOS.4 | 1 min | Entering → greeted | **Assumed** |
| HOS.5 | 3 min | Entering → seated | **Assumed** |
| HOS.6 | 2 min | Seated → menu presented | **Assumed** |
| WTR.3 | 3 min | Seated → waiter approaches | **Assumed** |
| WTR.4 | 5 min | Seated → order taken | **Assumed** |
| DEL.5 | 10 min | Starter delivery | **Assumed** |
| DEL.6 | 20 min | Main-course delivery | **Assumed** |
| DEL.7 | 25 min | Grilled-item delivery | **Assumed** |
| TBM.3 | 5 min | Finished plates cleared | **Client brief** — "within 5 minutes" |
| CMP.4 | 10 min | Complaint resolution | **Assumed** |
| BPF.3 | 5 min | Bill delivery | **Assumed** |

## Bennigan's — American Casual Dining

| Code | Standard | Measures | Source |
|---|---|---|---|
| WTR.2 | 2 min | Seated → order taker approaches | **Client brief** — "within 2 minutes of seating" |
| APP.4 | 10 min | Appetizer delivery | **Assumed** |
| PLT.8 | 5 min | Plate clearing | **Assumed** |
| MCS.3 | 20 min | Main-course delivery | **Assumed** |
| CMP.4 | 10 min | Complaint resolution | **Assumed** |
| BPF.3 | 5 min | Bill delivery | **Assumed** |

## Pizza Hut — Food Court

The Pizza Hut brief states no numeric standard anywhere. It asks only that queue time
be "calculated in minutes". All three thresholds are ours.

| Code | Standard | Measures | Source |
|---|---|---|---|
| QUE.6 | 5 min | Joining queue → cashier begins | **Assumed** |
| CSH.13 | 3 min | Cashier begins → payment complete | **Assumed** |
| PRP.2 | 10 min | Payment → food handed over | **Assumed** |

## What the briefs actually said

Searched for every stated standard — "within", "standard", "target", "benchmark",
"no more than", "less than", "under", alongside any digit. The complete set of
numeric service standards in all three documents:

- Shebestan: *"Did the waiter clear finished plates within 5 minutes?"*
- Bennigan's: *"Did the order taker approach your table within 2 minutes of seating?"*

Everything else in the briefs specifies **what to measure**, not **what good looks
like**: "calculate appetizer delivery time in minutes", "use numeric minute fields
for timing KPIs". We supplied the standards so the questionnaires could score at all.

## Getting these signed off

Send each brand the table above and ask one question per row: *is this the standard
you hold your outlets to?* Three outcomes:

1. **Confirmed** — change the Source column to the brand and the date.
2. **Corrected** — edit `threshold:` in the brand's file under `src/data/`, then run
   `npm run check:frameworks` and re-run `npm run emit:live-seed`.
3. **No standard exists** — the brand has never defined one. Then the first round of
   visits is the baseline, not an assessment, and the threshold should be set from the
   observed distribution afterwards. Say so in the report rather than scoring against
   a number nobody agreed to.

Until a row is confirmed, any score that depends on it is a measurement against our
assumption. That is fine for a pilot, and not fine in a contractual report.
