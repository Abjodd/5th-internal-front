# 5th-internal-front

## Budgetless campaigns

**What:** A campaign can be raised before the client has agreed a budget. It gets a name, a brand, a brief, a team, a roster and deliverables like any other — it just has no number attached yet, and one is allocated later when the client commits to it.

**Why:** The budget used to be a required field on the New Campaign wizard, and a required gate on the brief lock (`briefGaps` demanded a creator budget). Between those two, a campaign nobody had priced yet could not be raised at all, and one raised with a placeholder could not leave Draft. So the work waited on the number — the brief went unwritten, the team unassigned, the roster unbuilt — when none of those depend on it. The number is only needed at the point money actually moves.

**How:** The budget is **absent**, not zero.

```js
budget: null, creatorBudget: null     // raised without one
budget: 0                             // NOT a thing — see below
```

`fmtINR(0)` renders `"₹0"`, a real figure and a wrong one; `fmtINR(null)` renders `"—"`. Every screen that divides by the budget or measures committed spend against it has to tell "no number agreed yet" from "agreed at nothing", and `0` cannot say that. A stored `0` would report a campaign as having a budget of nothing — margins of 0.0% painted red as a loss, creator pools showing an overspend the moment anyone was locked.

There is deliberately **no `budgetPending` flag**. The absence *is* the state. A second field recording the same fact is free to disagree with it — the same reason the execution track is derived rather than stored.

### The rule: the work runs, the billing waits

| Step | Without a budget |
|---|---|
| Create the campaign | ✅ |
| Write and **lock the brief** | ✅ — but no client quote is raised, because there is nothing to price |
| Assign the team | ✅ |
| Shortlist, negotiate, **lock creators** | ✅ — fees are committed against a pool that doesn't exist yet, and the Creators tab says so |
| Deliverables, live links, tracking | ✅ |
| **Record the client PO** | ❌ **blocked** |
| Advance / invoice / payment | ❌ downstream of the PO |

The PO is the stopping point because the PO's amount **is** the budget, and the client invoice is drawn from it. Recording one against a campaign with no agreed number would invent the figure the client gets billed.

### Helpers

All in [`src/lib/campaign.js`](src/lib/campaign.js) — derived, never stored, so every screen answers the question the same way:

| | |
|---|---|
| `hasBudget(c)` / `budgetPending(c)` | the state itself |
| `creatorBudgetOf(c)` | **null** when there is no total to slice. The 60% fallback for legacy campaigns is unchanged whenever a budget exists |
| `perCreatorOf(c)` | null when there is no pool |
| `briefGaps(c)` | requires a creator budget **only when there is a budget to split** |
| `poGaps(c)` | what stands between a campaign and its PO — missing budget, unconfirmed roster, or both. Read by the reducer, the button and its hint, so a blocked PO says the same thing wherever you meet it |

### Raising one

Step 3 of the New Campaign wizard (`Commercial`) carries a **Set now / Not agreed yet** toggle above the budget field. Picking "Not agreed yet" hides the total and the creator-split field and drops both from that step's validation; scope and dates stay required, because those are what the campaign is planned and staffed against.

The budget is otherwise **still mandatory** — the toggle is the only way past it. Leaving it blank on "Set now" is an omission, and the campaign would go on to quote and invoice the client from it.

Related, and the reason the requirement was invisible before: the wizard's **Next button is no longer disabled** on an incomplete step. A dead button was what stopped anyone knowing *which* field was missing. Pressing it now marks the missing fields (`Req`, armed by `tried`) instead of doing nothing; Create does the same and jumps back to the offending step. This applies to every required field in the wizard, not only the budget.

The deferral is written to the campaign timeline at creation, so a week later it reads as a decision rather than an omission.

### Allocating later

`AllocateBudgetModal` — reachable from the campaign detail header (`Not allocated · Allocate`), the Brief tab, the Financials tab, and the workflow strip. Open to Founder/PCM **or whoever raised the campaign**, up to the PO (the same `canEditCommercials` boundary the Brief tab's other commercials use).

It collects the total **and** the creator split through the same `CreatorBudgetField` the wizard uses, so the campaign ends up indistinguishable from one that had a number all along. Deliberately not a bare total-budget input: a total with no split leaves `creatorBudgetOf` falling back to its 60% guess, and a guess is what that field exists to replace.

On confirm it:

- patches `budget` + `creatorBudget`, and keeps `brief.budget` in step (the client portal renders the brief as authored, so a stale one shows the brand the wrong figure)
- logs the allocation on the timeline
- **raises the client quote that the brief lock skipped.** `raiseQuote` has two triggers and one definition — a quote needs a locked brief *and* a budget, and those no longer arrive together. Whichever lands second raises it, and the quote's own `notes` says which that was. A duplicate is a 409 and is ignored, which is the outcome we wanted.
- moves **no stage**. Allocating is not an event on either track; it removes a blocker on the finance one. A campaign parked at Team Assigned with its roster confirmed can record its PO immediately; one still in Draft carries on being a draft.

### Where it surfaces

| Surface | |
|---|---|
| IM board card | amber `BUDGET TBC` chip — a dash there reads as a figure that failed to load |
| IM detail header | `Not allocated` + `Pending` chip + Allocate link |
| IM → Financials | a pending panel instead of rows of ₹0 and a negative "remaining" in red |
| IM → Creators | running committed total, with no pool bar; it used to draw `₹4L of ₹0` as an overspend |
| IM → Brief | Total budget offers Allocate rather than Edit; creator budget is not editable until a total exists |
| Lock-brief dialog | stops promising a quote it will not raise |
| Billing | tracker row, Campaign P&L commercials, `fmtPct(null)` → `—` rather than a red `0.0%` |
| Founder Summary | *Decisions on the Horizon* gains "Allocate a budget for X"; an awaiting-budget panel sits **below** the pipeline rail, not on it — it is not a stage, and drawn as one it would double-count every campaign above |
| Client portal | brief, budget card and card strip read "To be confirmed"; the Overview KPI reads `committed · N to be confirmed` rather than presenting a partial total as the whole |

Settled campaigns (`payment_done`) are excluded from every count and prompt above — one that finished without a budget on file is history, not a decision.

### Backend

No schema change. `models/Campaign.js` already types `budget`/`creatorBudget` as `Number`, and Mongoose stores and returns `null` through both `POST /api/campaigns` and the PATCH's `$set`. The contract is documented on the schema.

One related fix in `server.js`: the portal analytics spend split did `spendByService[svc] = (… || 0) + spend`, which **creates** the bucket even at zero — so a service whose only campaign had no agreed budget appeared in the client's spend split at ₹0, listed alongside services we are actually billing them for. It is now skipped unless a budget exists, and each event carries `budgetPending` so the portal can label the campaign rather than charting it as having cost nothing.
