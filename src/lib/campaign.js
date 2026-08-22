// ── LIFECYCLE ────────────────────────────────────────────────────────────────
// A campaign runs on TWO tracks that fork once the brief is locked:
//
//   Draft → Brief Locked ─┬─ Team Assigned → Execution → Creator Payment
//                         └─ PO Raised → Advance Received → Invoice Raised → Payment Done
//
// Only the first two nodes are COMMON — nothing happens until the brief is
// signed off. Team assignment sits on the EXECUTION branch: staffing unblocks
// the work and has no bearing on whether the client's PO can be recorded.
//
// Only the FINANCE track is stored (`campaign.stage`). It moves on documents
// outside this app — the client's PO, their bank transfer — so nothing here can
// derive it. `team_assigned` is stored too (it sits between lock and PO) but is
// DRAWN on the execution rail, because that is the branch it gates.
//
// The EXECUTION track is DERIVED on every read (executionStageOf) and never
// stored. One linear stage made "the money is late but the work is fine"
// impossible to say.
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
// locks BEFORE the team is assigned, so those land back on `draft` — the lock is
// genuinely still owed, and the team they have carries them straight through.
//
// `execution` and `reporting` both meant "advance in, delivering" — on the
// finance track that is `advance_received`, and delivery progress is re-derived
// from the creators either way.
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

// ── RECENCY ──────────────────────────────────────────────────────────────────
// When a campaign was created, in ms. Campaign documents carry no createdAt —
// the Mongoose schema is strict:false and was never timestamped — so this reads
// the next best record of the same moment, in descending order of precision:
//
//   1. the id, which the New Campaign form stamps as `camp_<slug>_<base36 ms>`
//   2. the "Campaign created" timeline entry, which is day-precision
//   3. the campaign's start date
//
// 0 for anything unreadable, so a campaign with no legible creation date sorts
// to the BOTTOM of a newest-first list rather than to the top of it.
export function createdAtOf(camp) {
  const stamp = parseInt(String(camp?.id || "").split("_").pop(), 36);
  // Anything before 2010 is a slug fragment that happened to parse, not a date.
  if (Number.isFinite(stamp) && stamp > 1262304000000) return stamp;
  const day = camp?.timeline?.[0]?.date || camp?.start;
  const parsed = Date.parse(`${day}T00:00:00`);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Campaign money + creator-shape helpers shared by Campaigns (owns the record)
// and Billing (derives the P&L and payee registry from it).
//
// Here rather than in either page because both must agree. They previously did
// not: the 60% creator-budget fallback was written out in both files, so a
// change to one silently put the Financials tab and the Campaign P&L back into
// disagreement — the exact bug that motivated deriving these at all.

// Creator budget — the slice of the total budget that pays creators. It's set
// explicitly on the Commercial step of the New Campaign wizard; campaigns
// created before that step existed fall back to the 60% split that used to be
// hardcoded at creation, so their financials read the same as they always did.
export const creatorBudgetOf = c => c?.creatorBudget || Math.round((c?.budget || 0) * 0.6);

export const numReqOf = c => c?.numReq || 5;

// ── DELIVERABLES PLANNING ────────────────────────────────────────────────────
// `deliverablesPerCreator` is the PLAN — the default a creator is briefed with —
// not a constraint. Rosters are never uniform: five creators where one hero does
// two reels and the rest do one is normal, and a campaign-wide multiplier can't
// express it.
//
// Each creator carries an optional `numDeliverables` overriding the plan for
// that row only. Nothing to set for the common case.
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
// One link per deliverable, so `live` holds an ARRAY. It was a single `postUrl`,
// so a creator doing two reels had nowhere to record the second.
//
// `postUrl` is still written as the first link and is NOT dead — the client
// portal reads `cr.live?.postUrl` directly. Mirroring it means the portal
// renders unchanged and can migrate on its own schedule.
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
// deliverable counts only once metrics come back. Pasting a URL used to be
// enough, so a typo ("hi.com") marked the creator live and the whole delivery
// track complete against a link that resolves to nothing.
//
// Three-way min, each bound load-bearing:
//   tracked — the proof, and the gate
//   links   — postsCounted isn't decremented on delete, so a creator who posted
//             twice and removed one would still read 2
//   target  — three posts against a target of two is 100%, not 150%
export const delivDoneOf = (camp, cr) =>
  Math.min(trackedPostsOf(cr), liveLinksOf(cr).length, delivTargetOf(camp, cr));

// Even per-head slice of the creator budget — an "approx" planning number, not
// a commitment: the real per-creator fee is negotiated on the Creators tab.
export const perCreatorOf = c => Math.round(creatorBudgetOf(c) / numReqOf(c));

// What we pay a creator for this campaign.
//
// The field is `cost` (was `fee`, also mirrored into an unread
// `negotiatedCost`). The read-side fallback is deliberate: the frontend can ship
// before the migration runs, or against an environment where it never did,
// without invoices rendering ₹0. `??` not `||`, so a negotiated 0 survives.
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
// Null matters: a handle with no derivable profile stays plain text rather than
// rendering as accent-coloured "link" text that isn't clickable.
//
// `igUrl` is checked first and is NOT Instagram-only despite the name — the
// YouTube lookup writes its channel URL into the same field, so an auto-fetched
// profile URL is always canonical. Handles are stored inconsistently with and
// without a leading "@", so it's stripped either way.
//
// Here rather than in Campaigns because a handle renders on five screens; it was
// only ever a link on one of them.
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
// "The roster is confirmed." One definition, three consumers — which is why it
// lives here rather than as a hand-written `lockedCount >= required` on a button:
//   - the client is auto-sent the roster when it goes true
//   - the client PO can't be recorded until it is (a PO raised against an
//     unconfirmed list is a guess, and a creator backing off means reissuing it)
//   - the Creators tab counts down to it
//
// Only `locked` counts. Shortlisted / reached out / negotiating all mean "we
// asked", and a name that hasn't agreed a fee is not something to rely on.
//
// Measured against `numReq`, the plan — which stays editable up to the PO (see
// canEditScope). That's what keeps this from being a trap: a team that planned
// five and locked four changes the plan, deliberately, in the field the client
// was quoted from.
//
// `creators` is separable so a caller holding an unsaved roster can ask about
// the one it is about to write.
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

// The stored stage is a second witness and has to be read too. `briefStatus`
// only started being set to "signed_off" when the lock became its own step, so
// older campaigns carry whatever the old flow left. Trusting the flag alone put
// those campaigns' execution track back at Draft while their finance track sat
// at Advance Received — a stage only reachable with a locked brief. A stage past
// `draft` is proof the lock happened, whatever the flag says.
export const briefLocked  = c => c?.briefStatus === "signed_off" || stageIdx(c?.stage) > 0;

// An asset counts as "in" the moment anything arrives — `rework` and
// `pending_brand` mean it was submitted and is being worked, not that it's
// missing. Only `yet_to_receive` (and an empty status) is nothing.
export const assetIn = a => !!a?.status && a.status !== "yet_to_receive";

// Every locked creator walks four milestones — locked → scripting → shooting →
// live — and progress is milestones reached over milestones planned. The
// denominator is the TARGET creator count, not the locked count: locking one of
// five and finishing their work reads 20%, not 100%. max() keeps it honest if
// more get locked than planned.
//
// `live` is the one non-binary milestone: a creator 2 of 3 posts in is
// two-thirds done, and 0 or 1 are both wrong. It contributes delivered/expected
// per creator, and the real counts are returned so the UI can state them.
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

// Signing off an empty brief would quote the client against nothing. Returns
// what's still missing so the UI can name it rather than just greying a button.
//
// Audience and Key Messages are NOT gates — useful context, not things the
// campaign can't be priced or staffed without. Holding the lock for them stalled
// campaigns whose brief was otherwise complete until someone invented a
// sentence. Still on the brief, still editable until the PO.
export const briefGaps = c => [
  ...(String(c?.brief?.objective || "").trim() ? [] : ["Objective"]),
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
// DECISION half — pure in, pure out — with the network half left to the caller,
// so the rule is unit-testable without stubbing fetch.
//
// Returns [{op:"create"|"update", id, body}].
//
// Walks the UNION of previous and next rosters, not just `next`. A locked
// creator who is REMOVED is absent from `next`, so walking it alone left their
// expense at `pending_approval` forever — off the campaign but still inflating
// Committed Spend and the payee registry, with no screen able to surface it.
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
