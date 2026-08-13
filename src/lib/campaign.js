// ── LIFECYCLE ────────────────────────────────────────────────────────────────
// A campaign runs on TWO tracks that fork once the brief is locked:
//
//   Draft → Brief Locked ─┬─ Team Assigned → Execution → Creator Payment
//                         └─ PO Raised → Advance Received → Invoice Raised → Payment Done
//
// Only the first two nodes are COMMON. Nothing at all can happen until the
// brief is written and signed off, so both tracks share those — and only
// those. Team assignment sits on the EXECUTION branch, not in the common head:
// staffing the campaign is what unblocks the work, and it has no bearing on
// whether the client's PO can be recorded.
//
// Only the FINANCE track is stored (`campaign.stage`). It moves on documents
// that exist outside this app — the client's PO, their bank transfer — so
// nothing here can derive it; somebody has to say it happened. `team_assigned`
// is on that stored track too (it is the stage between the lock and the PO),
// but it is DRAWN on the execution rail, because that is the branch it gates.
//
// The EXECUTION track is otherwise DERIVED on every read (executionStageOf)
// from the roster and the deliverables, and is never stored. The two were one
// linear stage before, which is what made a campaign waiting on a client's
// advance indistinguishable from one whose creators hadn't started: a single
// rail cannot say "the money is late but the work is fine".
//
// `p` is the progress % a campaign reads on entering a stored stage.
export const COMMON_STAGES = [
  { id:"draft",        label:"Draft",        p:0 },
  { id:"brief_locked", label:"Brief Locked", p:8 },
];
// Stored, but drawn on the execution rail — see above.
export const TEAM_STAGE = { id:"team_assigned", label:"Team Assigned", p:16 };
export const FIN_STAGES = [
  { id:"po_raised",        label:"PO Raised",        p:35  },
  { id:"advance_received", label:"Advance Received", p:55  },
  { id:"invoice_raised",   label:"Invoice Raised",   p:80  },
  { id:"payment_done",     label:"Payment Done",     p:100 },
];
// The stored track, head to tail. Shared rather than page-local because
// Billing reads a campaign's stage too, and the two must not drift.
export const PIPELINE = [...COMMON_STAGES, TEAM_STAGE, ...FIN_STAGES];
export const PL_IDS = PIPELINE.map(p => p.id);

// The execution branch. Only `team_assigned` has a `p` — the other two aren't
// stored, and their progress is the creator milestones themselves (execStats),
// which is the whole reason they aren't stages.
export const EXEC_STAGES = [
  TEAM_STAGE,
  { id:"execution",       label:"Execution"       },
  { id:"creator_payment", label:"Creator Payment" },
];
export const EXEC_NODES = [...COMMON_STAGES, ...EXEC_STAGES];

// Legacy ids, in two hops rather than one flat table. The 16-stage pipeline
// was already collapsed into 7 once; re-enumerating all sixteen against the
// forked ids would be a second table to keep in step with the first, and the
// two would drift the first time a mapping changed.
const OLD_16_TO_7 = {
  creator_shortlist: "brief_log",
  po_raised:         "po",
  advance_received:  "advance",
  brief_sent:        "execution", concept_submitted: "execution",
  concept_approved:  "execution", production:        "execution",
  video_submitted:   "execution", internal_review:   "execution",
  client_approved:   "execution", live:              "execution",
  creator_paid:      "execution",
};
// `brief_log` meant "team staffed, brief still being written". The brief now
// locks BEFORE the team is assigned, so those campaigns land back on `draft`:
// the lock is genuinely still owed, and the team they already have carries
// them straight through the next node the moment it lands.
//
// `execution` and `reporting` both meant "the client's advance is in and we're
// delivering" — on the finance track that is exactly `advance_received`, and
// how far the delivery itself got is re-derived from the creators either way.
const OLD_7_TO_FORK = {
  draft:     "draft",
  brief_log: "draft",
  po:        "team_assigned",
  advance:   "po_raised",
  execution: "advance_received",
  reporting: "advance_received",
  completed: "payment_done",
};
export const LEGACY_STAGE = {
  ...Object.fromEntries(Object.entries(OLD_16_TO_7).map(([k, v]) => [k, OLD_7_TO_FORK[v] || v])),
  ...OLD_7_TO_FORK,
};

// Current ids are checked FIRST, not last. Two of the retired ids (`po_raised`,
// `advance_received`) are also live ids on the forked track, so a table-first
// lookup would silently rewind every campaign that legitimately reached them.
// Anything unrecognised becomes `draft` rather than rendering a raw db string.
export const normStage = s => PL_IDS.includes(s) ? s : (LEGACY_STAGE[s] || "draft");
export const stageLabel = s => (PIPELINE.find(p => p.id === normStage(s)) || PIPELINE[0]).label;
export const stageIdx   = s => PL_IDS.indexOf(normStage(s));

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

// How many of a creator's links have actually returned metrics. Written as
// `postsCounted` by both refresh paths — the Deliverables tab's Refresh button
// and the nightly job (refreshPostMetrics.js) — and it is the count of links
// that FETCHED, not the count that were pasted.
export const trackedPostsOf = cr => Number(cr?.tracking?.postsCounted) || 0;

// Posts actually up. A link is a CLAIM; tracking data is the proof, so a
// deliverable only counts once metrics have come back for it. Pasting a URL
// used to be enough, which meant a typo ("hi.com") read as a delivered post —
// and, because this number feeds execStats, it marked the creator live, the
// campaign's Execution donut complete, and the whole delivery track finished
// against a link that resolves to nothing.
//
// Three-way min, and each bound is load-bearing:
//   tracked — the proof, and the new gate
//   links   — `postsCounted` isn't decremented when a link is deleted, so a
//             creator who posted twice and removed one would still read 2
//   target  — a creator who posted three against a target of two is 100%
//             done, not 150%
export const delivDoneOf = (camp, cr) =>
  Math.min(trackedPostsOf(cr), liveLinksOf(cr).length, delivTargetOf(camp, cr));

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

// ── THE DERIVED (EXECUTION) TRACK ────────────────────────────────────────────
// Everything below answers "where is the WORK", never "where is the money".
// It lives here rather than in the Campaigns page because the campaign header,
// the card grid, the Exec filter and the nightly metrics refresh all have to
// agree on it — and because none of it is stored, so the only thing keeping
// four readers in step is that there is one definition to read.

// All three slots staffed. Also the access key (canSee only shows a campaign
// to its amId/cmId/eaId), so until every seat is filled the campaign is
// invisible to someone who needs it.
export const teamComplete = c => !!(c?.amId && c?.cmId && c?.eaId);
export const briefLocked  = c => c?.briefStatus === "signed_off";

// An asset counts as "in" the moment anything arrives — `rework` and
// `pending_brand` mean it was submitted and is being worked, not that it's
// missing. Only `yet_to_receive` (and an empty status) is nothing.
export const assetIn = a => !!a?.status && a.status !== "yet_to_receive";

// Every locked creator walks four milestones — locked → scripting (concept in)
// → shooting (video in) → live — and execution progress is milestones reached
// over milestones planned. The denominator is the TARGET creator count, not the
// locked count: locking one of five creators and finishing their work has to
// read 20%, not 100%. max() keeps it honest if more get locked than planned.
//
// The `live` milestone is the one that isn't binary. A creator on a 3-post
// brief who has posted 2 is two-thirds done, and counting them as 0 or 1 are
// both wrong — the first stalls a campaign that is visibly progressing, the
// second calls it complete while a post is still owed. So live contributes
// delivered/expected per creator, summed, and the real counts are returned
// alongside so the UI can state them rather than only a percentage.
export function execStats(c){
  const lockd = (c?.creators || []).filter(isLockedCreator);
  const target= Math.max(numReqOf(c), lockd.length);
  const delivered = lockd.reduce((s, x) => s + delivDoneOf(c, x), 0);
  const expected  = lockd.reduce((s, x) => s + delivTargetOf(c, x), 0);
  const done = {
    locked:  lockd.length,
    concept: lockd.filter(x => assetIn(x.concept)).length,
    video:   lockd.filter(x => assetIn(x.demo)).length,
    // Creators with every post up — what "live" means as a headcount.
    live:    lockd.filter(x => delivDoneOf(c, x) >= delivTargetOf(c, x)).length,
  };
  // Fractional credit for partially-posted creators, in creator-equivalents so
  // it stays commensurate with the other three milestones.
  const liveFrac = expected > 0 ? (delivered / expected) * lockd.length : 0;
  const total = target * 4;
  const pct = total > 0
    ? Math.min(100, Math.round(((done.locked + done.concept + done.video + liveFrac) / total) * 100))
    : 0;
  return { ...done, target, pct, delivered, expected };
}

// Delivery is finished once everything actually committed to is live —
// measured against the LOCKED creators, not the target. A campaign that only
// ever locked 3 of 5 planned creators can never reach 100% of plan, so gating
// on the target would trap it in Execution with no way to close it out.
export const execDone = c => { const s = execStats(c); return s.locked > 0 && s.live === s.locked; };

// Signing off an empty brief would quote the client against nothing, so the
// lock needs the brief to actually say something first. Returns what's still
// missing, so the UI can name it instead of just greying a button out.
export const briefGaps = c => [
  ...[["objective","Objective"],["audience","Audience"],["messages","Key Messages"]]
    .filter(([k]) => !String(c?.brief?.[k] || "").trim()).map(([, l]) => l),
  ...((c?.brief?.deliverables || []).length ? [] : ["Deliverables"]),
  ...(creatorBudgetOf(c) > 0 ? [] : ["Creator budget"]),
];

// Which EXEC_NODES node the campaign is standing on. Every branch reads state
// that already exists, which is what makes this safe to recompute anywhere:
// there is no execution stage to get out of step with the roster, because the
// roster IS the execution stage.
export function executionStageOf(camp){
  if (!briefLocked(camp))  return "draft";
  if (!teamComplete(camp)) return "brief_locked";     // the Assign Team blocker
  const s = execStats(camp);
  if (s.locked === 0)      return "team_assigned";    // staffed, nothing locked yet
  if (s.live < s.locked)   return "execution";
  return "creator_payment";
}

// ── CREATOR PAYMENT ──────────────────────────────────────────────────────────
// Where one locked creator's money is, derived from two records that already
// exist: `cr.invoiceNo`, written when their invoice is generated on the
// Creators tab, and the expense the lock created, which Accounts settles in
// Billing. Nothing new is stored — a third copy of "paid" is a third thing
// that can disagree with the books.
export const CREATOR_PAY_STATUSES = [
  { id:"pending",        label:"Pending"              },
  { id:"invoice_raised", label:"Invoice Raised (GST)" },
  { id:"paid",           label:"Payment Done"         },
];
export function creatorPayStatusOf(campId, cr, expenseById){
  if (expenseById?.[expenseIdFor(campId, cr?._id)]?.status === "paid") return "paid";
  return cr?.invoiceNo ? "invoice_raised" : "pending";
}
export function creatorPayStats(camp, expenseById){
  const locked = (camp?.creators || []).filter(isLockedCreator);
  const out = { pending:0, invoice_raised:0, paid:0, total:locked.length };
  for (const cr of locked) out[creatorPayStatusOf(camp?.id, cr, expenseById)]++;
  return out;
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
