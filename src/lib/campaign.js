// ── PIPELINE ─────────────────────────────────────────────────────────────────
// The 7-stage lifecycle, and the map from the 16-stage pipeline it replaced.
//
// Shared rather than page-local because Billing reads a campaign's stage too.
// It previously kept its own partial copy (a STAGE_LABEL map covering only the
// seven new ids) and did no normalisation at all, so the Billing dashboard
// printed raw `concept_approved` / `advance_received` next to campaigns the
// Campaigns page called "Execution" and "Advance" — the same drift the derived
// numbers were meant to end, just in a different column.
//
// `p` is the progress % a campaign reads on ENTERING a stage. Execution
// interpolates between its own `p` and Reporting's, driven by how much creator
// work is actually done — that band is the widest because it is the only stage
// where the campaign is genuinely being delivered.
export const PIPELINE = [
  { id:"draft",     label:"Draft",     p:0   },
  { id:"brief_log", label:"Brief Log", p:10  },
  { id:"po",        label:"PO",        p:25  },
  { id:"advance",   label:"Advance",   p:35  },
  { id:"execution", label:"Execution", p:40  },
  { id:"reporting", label:"Reporting", p:90  },
  { id:"completed", label:"Completed", p:100 },
];
export const PL_IDS = PIPELINE.map(p => p.id);

// The nine execution-phase stages all collapse into `execution`: what used to
// be a campaign-wide stage (concept submitted, video submitted, live…) is now
// tracked per creator on the Deliverables tab, where it always belonged — one
// creator being late no longer holds the whole campaign at a stage.
export const LEGACY_STAGE = {
  creator_shortlist: "brief_log",
  po_raised:         "po",
  advance_received:  "advance",
  brief_sent:        "execution", concept_submitted: "execution",
  concept_approved:  "execution", production:        "execution",
  video_submitted:   "execution", internal_review:   "execution",
  client_approved:   "execution", live:              "execution",
  creator_paid:      "execution",
};

// Anything unrecognised becomes `draft` rather than rendering a raw db string.
export const normStage = s => LEGACY_STAGE[s] || (PL_IDS.includes(s) ? s : "draft");
export const stageLabel = s => (PIPELINE.find(p => p.id === normStage(s)) || PIPELINE[0]).label;

// Campaign money + creator-shape helpers shared by the pages that read a
// campaign: Campaigns (owns the record) and Billing (derives the P&L and the
// payee registry from it).
//
// These live here rather than in either page because both pages have to agree
// on them. They previously did not: the 60% creator-budget fallback was written
// out twice, once in each file, so a change to one would have quietly put the
// campaign's Financials tab and Billing's Campaign P&L back into disagreement —
// exactly the class of bug that motivated deriving these numbers in the first
// place.

// Creator budget — the slice of the total budget that pays creators. It's set
// explicitly on the Commercial step of the New Campaign wizard; campaigns
// created before that step existed fall back to the 60% split that used to be
// hardcoded at creation, so their financials read the same as they always did.
export const creatorBudgetOf = c => c?.creatorBudget || Math.round((c?.budget || 0) * 0.6);

export const numReqOf = c => c?.numReq || 5;

// Even per-head slice of the creator budget — an "approx" planning number, not
// a commitment: the real per-creator fee is negotiated on the Creators tab.
export const perCreatorOf = c => Math.round(creatorBudgetOf(c) / numReqOf(c));

// What we pay a creator for this campaign.
//
// The field is `cost`. It was `fee`, and was also mirrored into an unread
// `negotiatedCost`. scrap/migrate_creator_fee_to_cost.js renames it on every
// campaign document, but a read-side fallback is kept deliberately: it means
// the frontend can be deployed before the migration is run (or against an
// environment where it never was) without invoices rendering ₹0 and creator
// expenses posting an amount of zero. `??` not `||`, so a negotiated 0 survives.
export const costOf = cr => cr?.cost ?? cr?.fee ?? cr?.negotiatedCost ?? 0;

// Normalises a creator entry read from the API onto the current field names.
// Applied once at load, in the same place stages are normalised, so nothing
// downstream ever has to know the old names existed.
export const normCreator = cr => {
  if (!cr || "cost" in cr) return cr;
  const { fee, negotiatedCost, ...rest } = cr;
  return { ...rest, cost: fee ?? negotiatedCost ?? 0 };
};

// Stable identity for a creator ACROSS campaigns. Mirrors the backend's
// `keyOf` in creatorSync.js, which is what the creators directory is keyed on.
//
// Not `_id`: that is generated per campaign entry (`cr_<ts>_<rand>`), so the
// same person appearing on three campaigns has three of them. Not `name`
// either — two creators can share a name, and merging them would merge their
// PAN and bank details into one registry row.
export const creatorKeyOf = cr => String(cr?.handle || cr?.name || "").toLowerCase().trim();

export const isLockedCreator = c => c?.status === "locked";
export const expenseIdFor = (campId, crId) => `EXP-${campId}-${crId}`;

// Locking a creator commits money, so Billing has to hear about it. This is the
// DECISION half of that sync — pure in, pure out — with the network half left
// to the caller. Split that way so the rule ("what should happen to the books
// when the roster changes") is unit-testable without stubbing fetch.
//
// Returns a list of {op:"create"|"update", id, body}.
//
// It walks the UNION of the previous and next rosters, not just `next`. A
// locked creator who is REMOVED is absent from `next`, so walking `next` alone
// left their expense at `pending_approval` forever — off the campaign, but
// still inflating Committed Spend, Pool remaining and the payee registry, with
// no screen anywhere that could surface it again.
export function creatorExpensePlan(camp, prevCreators, nextCreators) {
  const prevById = new Map((prevCreators || []).map(c => [c._id, c]));
  const nextById = new Map((nextCreators || []).map(c => [c._id, c]));
  const plan = [];
  for (const crId of new Set([...prevById.keys(), ...nextById.keys()])) {
    const before = prevById.get(crId), cr = nextById.get(crId);
    const id = expenseIdFor(camp.id, crId);
    const wasLocked = isLockedCreator(before), nowLocked = isLockedCreator(cr);
    if (nowLocked && !wasLocked) {
      plan.push({ op: "create", id, body: {
        id, campaign: camp.id, brandId: camp.brandId || null, cat: "external_creator",
        payee: cr.name, amount: costOf(cr), status: "pending_approval",
        note: `${cr.name} — creator fee`, date: null, poId: null,
        creatorId: creatorKeyOf(cr), invoiceNo: cr.invoiceNo || null,
        // Feeds Billing's cost-per-follower anomaly check.
        vendorForCreator: { followers: Number(cr.followers) || 0, handle: cr.handle || "", platform: cr.platform || "" },
      }});
    } else if (wasLocked && !nowLocked) {
      // Backed off, or removed from the roster entirely. The commitment is
      // void, but the row stays so the audit trail (and anything already paid
      // against it) survives.
      plan.push({ op: "update", id, body: { status: "cancelled" } });
    } else if (nowLocked && (costOf(before) !== costOf(cr) || before.invoiceNo !== cr.invoiceNo)) {
      plan.push({ op: "update", id, body: { amount: costOf(cr), invoiceNo: cr.invoiceNo || null } });
    }
  }
  return plan;
}
