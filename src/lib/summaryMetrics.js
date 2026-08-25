/**
 * src/lib/summaryMetrics.js — the Founder Summary, derived from the database.
 *
 * The page shipped with a `DEMO` object (128 campaigns, ₹86.0L, invented
 * colleagues) written as a fallback — but the page read `summaryData` off outlet
 * context and nothing ever put it there, so every number was the fallback.
 *
 * THE RULE: a metric with no backing data returns `null`, never 0 and never a
 * plausible stand-in. The page already draws null as "—" or "Awaiting data".
 * A founder who can tell "not measured" from "zero" can act on the difference.
 *
 * Deliberately null, and what each would need:
 *   health.revenue / .growth        — a target, or a prior-period baseline
 *   team.*.utilizationPct           — capacity data; nothing records hours
 *   clients.healthy/atRisk/critical — a health field; `clients` has none
 *   revenue.renewalsDue             — retainers carry no renewal date
 *
 * `health.clients` used to be on that list — see healthFrom().
 */
import { PIPELINE, normStage, budgetPending } from "./campaign";
import { ISO_DATE } from "./format";
import { invoiceTotals, isRevenueInvoice, receivedOf } from "./invoiceMoney";

// One-line description under each pipeline stage. Static editorial copy that
// labels the stage — the COUNT beside it is the derived number.
// The Summary charts the FINANCE track — the one that's stored — because that
// is what `campaign.stage` holds. Delivery has its own derived track, and it
// lives on the campaign itself rather than in a company-wide stage count.
const STAGE_NOTE = {
  draft:            "Briefs still being written",
  brief_locked:     "Locked, awaiting a team",
  team_assigned:    "Staffed — execution under way",
  po_raised:        "Purchase orders in motion",
  advance_received: "Advance in, delivery running",
  invoice_raised:   "Invoiced, awaiting payment",
  payment_done:     "Settled in full",
};

const monthOf = (iso) => (ISO_DATE.test(iso || "") ? iso.slice(0, 7) : null);

const pctOrNull = (part, whole) =>
  whole > 0 ? Math.round((part / whole) * 100) : null;

/** Campaigns not yet finished — what the agency is actively carrying. */
const isActive = (c) => normStage(c.stage) !== "payment_done";

/* ── Revenue ────────────────────────────────────────────────────────────────
   Every figure here is the same one Billing reports, because both call
   lib/invoiceMoney. `trend` is billed-per-month; with fewer than two months
   on record the chart draws its own empty state rather than a line through
   a single point. */
function revenueFrom(invoices) {
  const { billed, collected, outstanding, overdue } = invoiceTotals(invoices);

  const byMonth = new Map();
  for (const inv of (invoices || []).filter(isRevenueInvoice)) {
    const m = monthOf(inv.raisedDate);
    if (!m) continue;
    byMonth.set(m, (byMonth.get(m) || 0) + (inv.amount || 0));
  }
  const months = [...byMonth.keys()].sort();
  const trend = months.map((m) => byMonth.get(m));

  // Period-on-period movement, only when there is a period to compare with.
  // A previous month of zero gives no meaningful percentage, so it stays null
  // rather than reporting an infinite rise.
  let deltaPct = null;
  if (trend.length >= 2) {
    const prev = trend[trend.length - 2];
    const curr = trend[trend.length - 1];
    if (prev > 0) deltaPct = Math.round(((curr - prev) / prev) * 100);
  }

  return {
    total: billed,
    collected,
    outstanding,
    overdue,
    deltaPct,
    trend,
    renewalsDue: null, // no renewal date is recorded against a retainer
  };
}

/* ── Campaign pipeline ──────────────────────────────────────────────────────
   Counts per stage, through the same `normStage` the Campaigns board and
   Billing use — so a legacy stage string lands in the same bucket here as it
   does there. Every stage is listed even at zero: an empty stage is a real
   and useful fact about the pipeline. */
function stagesFrom(campaigns) {
  const counts = new Map(PIPELINE.map((p) => [p.id, 0]));
  for (const c of campaigns || []) {
    const id = normStage(c.stage);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return PIPELINE.map((p) => ({
    key: p.id,
    label: p.label,
    count: counts.get(p.id) || 0,
    note: STAGE_NOTE[p.id] || "",
  }));
}

/* ── Clients ────────────────────────────────────────────────────────────────
   Real names, real count.

   The healthy / at-risk / critical traffic light the constellation used to
   show is NOT derived, and cannot be: the clients collection carries no
   health, status or risk field at all, and grading a relationship from a
   campaign count would be a judgement the data has never made.

   What the data does support is whether we are currently doing work for a
   client, so that is what the constellation reports instead — engagement, not
   health, and labelled as such. */
function clientsFrom(clients, campaigns) {
  // The campaigns themselves, per client — the list on the Portfolio card's
  // reverse, and the source of the count on its front. Matched on brandId OR
  // the denormalized `client` display name: campaigns predating brandId carry
  // only the name, and dropping them would under-report a client's book.
  const campaignsByClient = new Map();
  for (const c of campaigns || []) {
    for (const key of [c.brandId, c.client]) {
      if (!key) continue;
      if (!campaignsByClient.has(key)) campaignsByClient.set(key, []);
      campaignsByClient.get(key).push(c);
    }
  }

  const names = (clients || []).map((c) => {
    // ?? not ||, and id before name: a client whose id matched an EMPTY list
    // must not fall through to a same-named bucket.
    const own = campaignsByClient.get(c.id) ?? campaignsByClient.get(c.name) ?? [];
    // Counted off `own`, not a bucket of its own. A parallel activeByClient map
    // used to hold this — same campaigns, same id-then-name fallback, resolved
    // separately — so the two could land on different buckets and the badge on
    // a card's front could contradict the list on its back.
    const activeCampaigns = own.filter(isActive).length;
    return {
      id: c.id,
      name: c.name,
      activeCampaigns,
      // In-flight campaigns this client has no agreed number for. Reported per
      // client rather than only per campaign because it is a fact about the
      // RELATIONSHIP — work running for a brand that hasn't committed a spend
      // is the kind of thing a founder wants to see against the client's name.
      awaitingBudget: own.filter((x) => isActive(x) && budgetPending(x)).length,
      status: activeCampaigns > 0 ? "active" : "idle",
      health: null, // no health field exists on a client record
      // Newest first, so a card opens on what is happening now rather than on
      // whatever the collection happens to return first.
      campaigns: [...own]
        .sort((a, b) => String(b.start || "").localeCompare(String(a.start || "")))
        .map((x) => ({
          id: x.id,
          name: x.name || "Untitled campaign",
          // The same normalised label the Campaigns board and Billing show, so
          // a stage never reads differently depending on which screen you are on.
          stage: PIPELINE.find((p) => p.id === normStage(x.stage))?.label || "Draft",
          progress: Math.max(0, Math.min(100, Number(x.progress) || 0)),
          live: isActive(x),
          // So the card's back can mark the row. The stage says where the
          // campaign is; this says the one thing about it that the stage
          // cannot — that it is moving without a number behind it.
          budgetPending: budgetPending(x),
        })),
    };
  });

  return {
    total: names.length,
    active: names.filter((n) => n.status === "active").length,
    idle: names.filter((n) => n.status === "idle").length,
    awaitingBudget: names.filter((n) => n.awaitingBudget > 0).length,
    healthy: null,
    atRisk: null,
    critical: null,
    names,
  };
}

/* ── People ─────────────────────────────────────────────────────────────────
   The roster is the `users` collection, filtered to those who can actually
   own work: a user's `teamId` is the id campaigns store in amId/cmId/eaId, so
   a user without one is never on a campaign.

   `activeProjects` is a real count — the campaigns still in flight on which
   this person is the account manager, category manager or executive
   associate. `utilizationPct` is null and stays null: nothing in the platform
   records capacity or hours, so a percentage would be fabricated. */
function teamFrom(users, campaigns) {
  const active = (campaigns || []).filter(isActive);
  const staff = (users || []).filter((u) => u.teamId && !u.deleted);

  const members = staff.map((u) => ({
    id: u.id,
    teamId: u.teamId,
    name: u.name,
    title: u.title || null,
    avatar: u.avatar || null, // initials, e.g. "AF" — not a photo
    activeProjects: active.filter(
      (c) => c.amId === u.teamId || c.cmId === u.teamId || c.eaId === u.teamId,
    ).length,
    utilizationPct: null,
  }));

  return {
    members,
    avgUtilizationPct: null,
    // What IS measurable about capacity: the share of the roster carrying at
    // least one live campaign right now.
    staffedPct: pctOrNull(members.filter((m) => m.activeProjects > 0).length, members.length),
  };
}

/* ── Agency health ──────────────────────────────────────────────────────────
   Five 0-100 signals. THREE have something real behind them:

     delivery — mean `progress` across in-flight campaigns. `progress` is a
                real stored field, maintained by the pipeline stage.
     team     — share of the roster staffed on a live campaign.
     clients  — share of the book with a live campaign running.

   `clients` used to be null on the grounds that the clients collection has no
   health or status field, which is true — but it was the wrong test. What the
   ring asks is "how are clients tracking", and ENGAGEMENT answers that from
   data we do have: clientsFrom() already derives active-vs-idle from whether a
   client has a campaign in flight, and the Portfolio section has been
   reporting it as a headline number all along. The signal was being drawn as a
   grey em dash next to a section stating the very figure it needed.

   It is engagement, not satisfaction, and the card below the ring says so.

   revenue and growth stay null, and for a reason that has not changed: both
   need a BASELINE the database does not hold — a revenue target to score
   attainment against, and a prior-period figure to measure growth from. The
   invoices collection can say what was billed; nothing can say what was
   supposed to be. Scoring either would mean inventing the denominator, and a
   confident 74% built on a made-up target is worse than an honest dash. */
function healthFrom({ campaigns, team, clients }) {
  const active = (campaigns || []).filter(isActive);
  const withProgress = active.filter((c) => Number.isFinite(Number(c.progress)));
  const delivery = withProgress.length
    ? Math.round(withProgress.reduce((s, c) => s + Number(c.progress), 0) / withProgress.length)
    : null;

  const staffed = team.members.filter((m) => m.activeProjects > 0).length;

  return {
    revenue: null,
    delivery,
    clients: pctOrNull(clients.active, clients.total),
    team: team.staffedPct,
    growth: null,

    /* What each score is a percentage OF. "Delivery 90%" means nothing until
       you know it averages 1 campaign, not 30 — the counts were already being
       computed here and thrown away.

       basis[key] is non-null EXACTLY when health[key] is, so consumers need no
       second guard. */
    basis: {
      revenue: null,
      growth: null,
      delivery: delivery === null ? null : {
        count: withProgress.length, total: active.length, unit: "campaigns",
        note: "mean completion across campaigns in flight",
      },
      clients: clients.total ? {
        count: clients.active, total: clients.total, unit: "clients",
        note: "on the books with a campaign running",
      } : null,
      team: team.staffedPct === null ? null : {
        count: staffed, total: team.members.length, unit: "people",
        note: "carrying at least one live campaign",
      },
    },

    /* Why the two missing rings are missing — both need a baseline the DB
       doesn't hold. Named, so the gap reads as deliberate, not as a bug. */
    unmeasured: [
      { label: "Revenue", reason: "needs a target to score attainment against" },
      { label: "Growth", reason: "needs a prior period to measure movement from" },
    ],
  };
}

/* ── Decisions on the horizon ───────────────────────────────────────────────
   Not a curated list and not invented: every row is an actual record sitting
   in a state that needs the founder to act — a quote awaiting review, an
   invoice past its due date, an inbound brand or creator application nobody
   has answered. Each carries the id of the document it came from. */
function decisionsFrom({ campaigns, quotes, invoices, clientRequests, creatorRequests }) {
  const out = [];

  for (const q of quotes || []) {
    if (q.status !== "pending_review") continue;
    out.push({
      id: `q:${q.id}`,
      title: `Review and send the quote for ${q.client || "an unnamed client"}`,
      impactLabel: q.label || null,
      deadline: q.validTill && ISO_DATE.test(q.validTill) ? `valid till ${q.validTill}` : null,
      tag: q.client || "Quote",
    });
  }

  for (const inv of (invoices || []).filter(isRevenueInvoice)) {
    const balance = (inv.amount || 0) - receivedOf(inv);
    if (!ISO_DATE.test(inv.dueDate || "") || balance <= 0) continue;
    if (inv.dueDate >= new Date().toISOString().slice(0, 10)) continue;
    out.push({
      id: `i:${inv.id}`,
      title: `Chase the overdue invoice with ${inv.client || "a client"}`,
      impactLabel: `₹${balance.toLocaleString("en-IN")} outstanding`,
      deadline: `was due ${inv.dueDate}`,
      tag: inv.client || "Invoice",
    });
  }

  for (const r of clientRequests || []) {
    out.push({
      id: `cr:${r.id}`,
      title: `Respond to the enquiry from ${r.brand || r.company || r.name || "a new brand"}`,
      impactLabel: "Inbound brand enquiry",
      deadline: null,
      tag: r.brand || r.company || r.name || "Enquiry",
    });
  }

  for (const r of (creatorRequests || []).filter((r) => !r.status || r.status === "pending")) {
    out.push({
      id: `cq:${r.id}`,
      title: `Review the creator application from ${r.name || r.handle || "an applicant"}`,
      impactLabel: "Creator application",
      deadline: null,
      tag: r.name || r.handle || "Creator",
    });
  }

  /* Campaigns running without a budget. A campaign can be raised before the
     client has agreed a number — the brief locks, the team is staffed, the
     roster delivers — but the client PO cannot be recorded against it, so the
     money never starts moving until somebody sets one. That is exactly this
     section's subject: a real record, in a state, waiting on a decision.

     Settled campaigns are skipped. One that reached payment_done without a
     budget on file is history, not a decision — there is nothing left to
     allocate. */
  for (const c of campaigns || []) {
    if (c.deleted || !budgetPending(c)) continue;
    if (normStage(c.stage) === "payment_done") continue;
    out.push({
      id: `cb:${c.id}`,
      title: `Allocate a budget for ${c.name || "an unnamed campaign"}`,
      impactLabel: "Raised without one — the client PO can't be recorded until it is set",
      deadline: ISO_DATE.test(c.end || "") ? `campaign ends ${c.end}` : null,
      tag: c.client || "Campaign",
    });
  }

  return out;
}

/* ── Performance ────────────────────────────────────────────────────────────
   Revenue comes from invoices by raised month; delivery from mean campaign
   progress by start month. A line needs at least ONE real month to be worth
   returning at all — with only one, the page shows it as a plain current
   value rather than drawing a trend through a single point (that distinction
   is the page's call, not this module's; see PerformanceGraph's hasTrend). */
function performanceFrom({ invoices, campaigns }, colors) {
  const seriesFrom = (rows, dateOf, valueOf, aggregate) => {
    const byMonth = new Map();
    for (const row of rows || []) {
      const m = monthOf(dateOf(row));
      const v = valueOf(row);
      if (!m || !Number.isFinite(v)) continue;
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m).push(v);
    }
    return [...byMonth.keys()].sort().map((m) => aggregate(byMonth.get(m)));
  };

  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const mean = (xs) => Math.round(sum(xs) / xs.length);

  const lines = [
    {
      key: "revenue",
      label: "Revenue (₹L)",
      color: colors.green,
      data: seriesFrom(
        (invoices || []).filter(isRevenueInvoice),
        (i) => i.raisedDate,
        (i) => Number(i.amount) || 0,
        (xs) => Math.round(sum(xs) / 100000),
      ),
    },
    {
      key: "delivery",
      label: "Delivery %",
      color: colors.blue,
      data: seriesFrom(
        campaigns,
        (c) => c.start,
        (c) => Number(c.progress),
        mean,
      ),
    },
  ];

  return { lines: lines.filter((l) => l.data.length >= 1) };
}

/**
 * Build the whole Summary payload from raw API collections.
 *
 * `colors` is passed in rather than imported so this module stays free of the
 * page's design tokens — it computes numbers, the page decides how they look.
 * Only the performance lines take a colour, and they only ever draw on the
 * page's dark panel, so what arrives here is its on-navy accent set.
 */
export function buildSummary(sources = {}, colors = {}) {
  const {
    campaigns = [],
    clients = [],
    invoices = [],
    users = [],
    creators = [],
    quotes = [],
    clientRequests = [],
    creatorRequests = [],
  } = sources;

  const team = teamFrom(users, campaigns);
  // Derived before healthFrom, which reads the active/total split for its
  // `clients` signal rather than recomputing it — one definition of "a client
  // with live work", used by both the ring and the Portfolio section.
  const clientStats = clientsFrom(clients, campaigns);

  return {
    asOf: new Date()
      .toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
      .toUpperCase(),

    // Four counts, each a straight `length` over a collection that exists.
    // The page's old fourth tile was "AEO", scored out of a findings
    // collection that is empty and behind a section that is disabled in
    // routes/sections.js — creators is a live directory the founder actually
    // has, so it takes the slot.
    bigNumbers: {
      campaigns: campaigns.length,
      clients: clients.length,
      team: team.members.length,
      creators: creators.length,
    },

    health: healthFrom({ campaigns, team, clients: clientStats }),
    revenue: revenueFrom(invoices),
    campaigns: {
      stages: stagesFrom(campaigns),
      // In-flight campaigns with no budget agreed. Counted here rather than in
      // stagesFrom because it is NOT a stage — it cuts across draft, brief
      // locked and team assigned, and a campaign in any of them is otherwise
      // progressing normally.
      awaitingBudget: (campaigns || []).filter((c) => !c.deleted && isActive(c) && budgetPending(c)).length,
    },
    clients: clientStats,
    team,

    decisions: decisionsFrom({ campaigns, quotes, invoices, clientRequests, creatorRequests }),
    performance: performanceFrom({ invoices, campaigns }, colors),
    growth: growthFrom(campaigns),
  };
}

/* ── LIVE-POST GROWTH ────────────────────────────────────────────────────────
   How the agency's live posts have built up over time, from the append-only
   `creators[].tracking.history[]` the backend records on every post-metrics
   refresh (5th-internal-back/trackingHistory.js). Before that history existed
   each refresh overwrote the previous numbers, so there was only ever a "now".

   The carry-forward rule is deliberately identical to growthSeries() in the
   client portal (5th-avenue-client-front/src/lib/portalMetrics.js): each
   creator's series is CUMULATIVE but sampled whenever that creator's post
   happened to be refreshed, so a creator with no reading on a given day has not
   dropped to zero — they simply were not measured. Summing only the points that
   exist on each day would make the total lurch with the refresh schedule and
   invent collapses that never happened. Carrying each creator's last known
   value forward keeps the series monotonic, which a cumulative metric must be.

   `byPost` splits that same carried-forward basis one line per post, so the
   panel's breakdown can never add up to something other than the curve above
   it. Wide format — one row per day, one KEY per post — because that is what
   the breakdown reads a single day out of. Keys are positional (`p0`, `p1`, …)
   rather than names: two creators can share a display name, and a duplicate key
   would silently collapse two posts into one. A post with no reading yet on a
   day is left UNSET rather than 0, which is what lets the breakdown leave it
   out instead of listing it at zero.

   The two apps quote the same brands the same numbers, so if this rule changes
   it changes in both. */
export function growthFrom(campaigns = []) {
  const tracked = [];
  for (const c of campaigns) {
    if (c?.deleted) continue;
    for (const cr of c.creators || []) {
      const points = cr?.tracking?.history;
      if (Array.isArray(points) && points.length) {
        tracked.push({
          key: `p${tracked.length}`,
          name: cr.name || `Creator ${tracked.length + 1}`,
          campaign: c.name || null,
          points,
        });
      }
    }
  }
  // Counted once, up front, so the "not enough readings yet" return below
  // reports the same creator AND campaign totals as the populated one — a
  // caller that reads them from the empty shape gets a real number, not a zero
  // that happens to be unread today.
  const campaignsWithHistory = (campaigns || []).filter(
    (c) => !c?.deleted && (c.creators || []).some((cr) => cr?.tracking?.history?.length),
  ).length;
  const empty = {
    points: [],
    byPost: { rows: [], series: [] },
    creators: tracked.length,
    campaigns: campaignsWithHistory,
  };

  if (!tracked.length) return empty;

  const dayOf = (iso) => String(iso).slice(0, 10);
  const byDay = tracked.map(({ points }) => {
    const m = new Map();
    for (const p of [...points].sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
      m.set(dayOf(p.at), p);
    }
    return m;
  });

  const days = [...new Set(byDay.flatMap((m) => [...m.keys()]))].sort();
  // A growth chart needs two points; one day is a number, not a trajectory.
  if (days.length < 2) return empty;

  const carried = byDay.map(() => null);
  const rows = [];
  const points = days.map((date) => {
    let views = 0, engagements = 0;
    const row = { date };
    byDay.forEach((m, i) => {
      if (m.has(date)) carried[i] = m.get(date);
      const p = carried[i];
      if (!p) return;
      const v = Number(p.views) || 0;
      const e = (Number(p.likes) || 0) + (Number(p.comments) || 0) + (Number(p.forwards) || 0);
      views += v;
      engagements += e;
      row[`${tracked[i].key}_views`] = v;
      row[`${tracked[i].key}_engagements`] = e;
    });
    rows.push(row);
    return { date, views, engagements };
  });

  return {
    points,
    byPost: {
      rows,
      series: tracked.map(({ key, name, campaign }) => ({ key, name, campaign })),
    },
    creators: tracked.length,
    campaigns: campaignsWithHistory,
  };
}
