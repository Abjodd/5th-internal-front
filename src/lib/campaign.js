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

// ── DELIVERABLES PLANNING ────────────────────────────────────────────────────
// Two numbers describe the scope of a campaign: how many creators, and how many
// posts each one owes. `deliverablesPerCreator` is the PLAN — the default a
// creator is briefed with — not a constraint, because rosters are never uniform:
// a campaign of five creators where one hero creator does two reels and the rest
// do one is normal, and a single campaign-wide multiplier can't express it.
//
// So each creator carries an optional `numDeliverables` that overrides the plan
// for that row only. Nothing has to be set for the common case (everyone does
// the same count); the override exists for the row that differs.
export const perCreatorDelivOf = c => Number(c?.deliverablesPerCreator) || 1;

// What THIS creator owes — their own override, else the campaign plan.
export const delivTargetOf = (camp, cr) => Number(cr?.numDeliverables) || perCreatorDelivOf(camp);

// Total posts the campaign expects. Locked creators contribute their real
// target; slots not yet filled contribute the plan, so the number is meaningful
// from the moment the campaign is created and only gets more accurate as the
// roster fills. Never below the locked creators' own sum — a campaign that
// over-locked its target still owes every post it committed to.
export function totalDelivOf(camp) {
  const locked = (camp?.creators || []).filter(isLockedCreator);
  const committed = locked.reduce((s, cr) => s + delivTargetOf(camp, cr), 0);
  const unfilled = Math.max(0, numReqOf(camp) - locked.length);
  return committed + unfilled * perCreatorDelivOf(camp);
}

// ── LIVE LINKS ───────────────────────────────────────────────────────────────
// A creator posts one link per deliverable, so `live` holds an ARRAY. It was a
// single `postUrl` string, which meant a creator doing two reels had nowhere to
// record the second — the campaign was only ever half-tracked.
//
// `postUrl` is still written as the first link and is NOT dead: the client
// portal reads `cr.live?.postUrl` directly (mapping.js, Overview.jsx,
// DetailPanel.jsx in 5th-avenue-client-front). Keeping it mirrored means the
// portal renders unchanged against the new shape and can be migrated on its own
// schedule instead of having to ship in lockstep with this.
export const liveLinksOf = cr => {
  const live = cr?.live;
  if (!live) return [];
  const urls = Array.isArray(live.postUrls) ? live.postUrls : live.postUrl ? [live.postUrl] : [];
  return urls.map(u => String(u || "").trim()).filter(Boolean);
};

// Builds the `live` object to store, keeping the portal's `postUrl` mirror in
// step. Written in one place so no caller can set the array and forget the
// mirror — which would blank the post out of the client's view.
export const withLiveLinks = (live, urls) => {
  const clean = (urls || []).map(u => String(u || "").trim()).filter(Boolean);
  return { ...(live || {}), postUrls: clean, postUrl: clean[0] || null };
};

// Posts actually up, capped at what was asked for: a creator who posted three
// links against a target of two is 100% done, not 150%.
export const delivDoneOf = (camp, cr) => Math.min(liveLinksOf(cr).length, delivTargetOf(camp, cr));

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

// ── PROFILE LINKS ────────────────────────────────────────────────────────────
// External links pasted without a protocol ("instagram.com/p/…") would resolve
// relative to the SPA — the new tab lands on our router with an empty
// sessionStorage and gets bounced to /login. Always absolutize before href.
export const extUrl = u => {
  if (!u) return u;
  const t = String(u).trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

// LinkedIn / Moj / Josh / Other have no derivable pattern from a handle alone
// (a LinkedIn slug may be /in/ or /company/), so they're deliberately absent —
// profileUrl returns null for them and the handle stays plain text.
const PROFILE_URL = {
  "Instagram":   h => `https://www.instagram.com/${h}/`,
  "YouTube":     h => `https://www.youtube.com/@${h}`,
  "Twitter / X": h => `https://x.com/${h}`,
  "Snapchat":    h => `https://www.snapchat.com/add/${h}`,
};
const HANDLE_RE = /^[A-Za-z0-9._-]{1,50}$/;

// Public profile link for a creator's handle, or null when one can't be built.
//
// Returning null matters: a handle with no derivable profile stays plain text
// rather than becoming a link that 404s — and, more importantly, rather than
// rendering as accent-coloured "link" text that isn't clickable.
//
// `igUrl` is checked first and is NOT Instagram-only despite the name — the
// YouTube lookup writes the channel URL into the same field, so whenever a
// profile was auto-fetched that URL is the canonical one.
//
// Handles are stored with a leading "@" ("@anjalikitchen") but not always
// ("adidastestcr"), so the "@" is stripped before templating either way.
//
// Lives here rather than in the Campaigns page because a creator's handle is
// rendered on five screens (campaign roster, suggestions, deliverables, the
// creators directory, and the creator-applications inbox) — it was only ever a
// link on one of them, so the same @handle was clickable in Deliverables and
// dead text everywhere else.
export const profileUrl = (cr) => {
  if (cr?.igUrl) return extUrl(cr.igUrl);
  const raw = String(cr?.handle || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;          // already a full link
  const h = raw.replace(/^@+/, "");
  if (!HANDLE_RE.test(h)) return null;                // spaces, emoji, junk
  return PROFILE_URL[cr?.platform]?.(h) || null;
};

export const isLockedCreator = c => c?.status === "locked";
export const expenseIdFor = (campId, crId) => `EXP-${campId}-${crId}`;

// ── ROSTER GATE ──────────────────────────────────────────────────────────────
// "The roster is confirmed." One definition, three consumers, which is the
// whole reason it lives here:
//   - the client is auto-sent the roster the moment it goes true,
//   - the client PO can't be recorded until it is (the PO buys these creators
//     at these fees; raised against an unconfirmed list its value is a guess,
//     and anyone who then backs off means reissuing it),
//   - and the Creators tab counts down to it.
// It used to be one hand-written `lockedCount >= required` on a button.
//
// Locked is the only status that counts. Shortlisted, reached out and
// negotiating all mean "we asked" — a name that hasn't agreed a fee is not
// something anyone downstream can rely on.
//
// The count it's measured against is `numReq`, the plan. That plan is editable
// on the Brief tab right up to the PO (see canEditScope in TabBrief), which is
// what keeps this gate from being a trap: a team that planned five, locked four
// and decided four is the roster changes the plan to four — deliberately, in
// the field the client was quoted from — rather than being stuck, or being let
// through by a rule that quietly stopped meaning anything.
//
// `creators` is separable so a caller holding a roster it hasn't saved yet
// (onUpdateCreators) can ask about the roster it is about to write.
export const lockedCountOf = (camp, creators = camp?.creators) =>
  (creators || []).filter(isLockedCreator).length;
export const rosterReady = (camp, creators = camp?.creators) =>
  lockedCountOf(camp, creators) >= numReqOf(camp);

// Why the roster isn't confirmed, in words, or null when it is. Shared so the
// PO button's hint, the reducer's rejection and the Creators tab all say the
// same thing rather than three near-misses that drift apart.
export function rosterGap(camp, creators = camp?.creators) {
  const locked = lockedCountOf(camp, creators), req = numReqOf(camp);
  if (locked >= req) return null;
  return `${locked} of ${req} creators locked`;
}

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
