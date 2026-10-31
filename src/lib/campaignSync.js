/**
 * Campaign sync — what makes several people on one campaign safe.
 * ─────────────────────────────────────────────────────────────────
 * The app still edits a campaign as one object in memory. What changed is how
 * that edit reaches the server:
 *
 *   before  →  the WHOLE creators list (or the whole campaign) was sent, and
 *              whoever saved last replaced everyone else's work.
 *   now     →  `diffCampaign(prev, next)` works out exactly which fields this
 *              edit touched, and only those are sent — one roster row at a
 *              time, campaign fields by path, timeline entries appended.
 *
 * Each write carries the value it started from. If someone else changed that
 * same field in the meantime, the server refuses with who/what/when (409) and
 * the user decides: keep theirs, or use mine. Everything else merges.
 *
 * Writes go through one ordered queue (`createSyncEngine`), so two quick edits
 * can never land out of order, a dropped connection is retried instead of
 * lost, and the page knows when it has unsaved work.
 *
 * `connectLive` is the other half: a server-sent-events stream that says "this
 * campaign changed" (and who else is looking at it), so open screens refresh
 * themselves instead of sitting on an old copy until someone reloads.
 */
import { CampaignsAPI, LIVE_URL } from "./api";

// ── diffing ─────────────────────────────────────────────────────────────────
export const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);
const norm = (v) => (v === undefined ? null : v);
export function deepEqual(a, b) {
  a = norm(a); b = norm(b);
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isObj(a) && isObj(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

const KEY_OK = /^[A-Za-z][\w]*$/;
// Server-owned bookkeeping on a roster row, never sent back.
const ROW_SKIP = new Set(["_id", "rev", "editedBy", "updatedAt", "updatedBy", "creatorId"]);
// Inside an object field: threads have their own append route; the metrics
// history is extended by the server.
const SUB_SKIP = new Set(["comments", "history"]);
// Campaign keys with their own routes, or owned by the server.
const CAMP_SKIP = new Set(["id", "_id", "rev", "editedBy", "updatedAt", "creators", "creatorIds", "timeline", "deleted", "deletedAt"]);
// Campaign objects edited one key at a time (brief.objective, insights.reach…).
const CAMP_SUBDIFF = new Set(["brief", "insights"]);

const stripSub = (o) => (isObj(o) ? Object.fromEntries(Object.entries(o).filter(([k]) => !SUB_SKIP.has(k))) : o);

/** `{ set, from }` for one roster row: top-level fields, or one level into an object field. */
export function diffRow(prev = {}, next = {}) {
  const set = {}, from = {};
  const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]);
  for (const k of keys) {
    if (ROW_SKIP.has(k) || !KEY_OK.test(k)) continue;
    const a = prev?.[k], b = next?.[k];
    if (deepEqual(a, b)) continue;
    if (isObj(b) && (isObj(a) || a == null)) {
      // field by field inside, so "concept.status" from one person and
      // "concept.fileLink" from another both survive
      const subs = new Set([...Object.keys(isObj(a) ? a : {}), ...Object.keys(b)]);
      let whole = false;
      for (const s of subs) {
        if (SUB_SKIP.has(s)) continue;
        const av = isObj(a) ? a[s] : undefined, bv = b[s];
        if (deepEqual(av, bv)) continue;
        if (!KEY_OK.test(s)) { whole = true; break; }
        set[`${k}.${s}`] = norm(bv);
        from[`${k}.${s}`] = norm(av);
      }
      if (whole) {
        for (const p of Object.keys(set)) if (p.startsWith(`${k}.`)) { delete set[p]; delete from[p]; }
        set[k] = stripSub(b); from[k] = norm(a);
      }
      continue;
    }
    set[k] = norm(b);
    from[k] = norm(a);
  }
  return { set, from };
}

/** Campaign-level `{ set, from }` (brief/insights by key). */
export function diffFields(prev = {}, next = {}) {
  const set = {}, from = {};
  const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]);
  for (const k of keys) {
    if (CAMP_SKIP.has(k) || !KEY_OK.test(k)) continue;
    const a = prev?.[k], b = next?.[k];
    if (deepEqual(a, b)) continue;
    if (CAMP_SUBDIFF.has(k) && isObj(b) && isObj(a)) {
      const subs = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const s of subs) {
        if (deepEqual(a[s], b[s])) continue;
        if (KEY_OK.test(s)) { set[`${k}.${s}`] = norm(b[s]); from[`${k}.${s}`] = norm(a[s]); }
        else { set[k] = b; from[k] = a; break; }
      }
      continue;
    }
    set[k] = norm(b);
    from[k] = norm(a);
  }
  return { set, from };
}

// A timeline entry keeps one id however many times its save is retried.
const tids = new WeakMap();
const tidOf = (e) => {
  if (e?.tid) return e.tid;
  if (!tids.has(e)) tids.set(e, `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
  return tids.get(e);
};

/** Everything one edit changed, as the list of small writes that carry it. */
export function diffCampaign(prev, next) {
  const ops = [];
  const id = next?.id || prev?.id;
  if (!prev || !next || prev === next) return ops;

  const f = diffFields(prev, next);
  if (Object.keys(f.set).length) ops.push({ kind: "fields", campId: id, set: f.set, from: f.from });

  // timeline: appended entries only
  const pt = prev.timeline || [], nt = next.timeline || [];
  if (pt !== nt) {
    const seen = new Set(pt);
    const fresh = nt.filter((e) => !seen.has(e) && !pt.some((p) => deepEqual(p, e)));
    for (const e of fresh) ops.push({ kind: "timeline", campId: id, entry: { ...e, tid: tidOf(e) } });
  }

  // roster: rows by _id
  const pc = prev.creators || [], nc = next.creators || [];
  if (pc !== nc) {
    const before = new Map(pc.filter((r) => r?._id).map((r) => [r._id, r]));
    const after = new Map(nc.filter((r) => r?._id).map((r) => [r._id, r]));
    const added = nc.filter((r) => r?._id && !before.has(r._id));
    if (added.length) ops.push({ kind: "add", campId: id, rows: added.map(({ rev, editedBy, ...r }) => r) });
    for (const [crId, a] of before) {
      const b = after.get(crId);
      if (!b) { ops.push({ kind: "remove", campId: id, crId }); continue; }
      if (a === b) continue;
      const d = diffRow(a, b);
      if (Object.keys(d.set).length) ops.push({ kind: "row", campId: id, crId, set: d.set, from: d.from });
    }
  }
  return ops;
}

// ── the save queue ──────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One ordered queue of writes for the whole page.
 *
 *   persist(prev, next)   diff and enqueue
 *   create(campaign)      a new campaign; later edits to it wait behind it
 *   hasPending(id)        anything for this campaign not yet confirmed?
 *
 * Callbacks:
 *   onStatus({ state, pending })     state: idle | saving | retrying | conflict
 *   onConflict({ op, conflicts, row })  → Promise<"mine" | "theirs">
 *   onSaved(campId, { rev, op, result })
 *   onDrained(campId)                the campaign's last queued write is in
 *   onError(message, op)             a write the server refused for good
 */
export function createSyncEngine({ actor, onStatus, onConflict, onSaved, onDrained, onError } = {}) {
  const queue = [];
  let running = false;
  let state = "idle";
  const report = (s) => { state = s ?? state; onStatus?.({ state, pending: queue.length }); };
  const who = () => (typeof actor === "function" ? actor() : actor) || "Someone";

  const coalesce = (op) => {
    // Typing then retyping one field shouldn't be two trips: merge into the
    // last waiting write for the same target (never the one in flight).
    for (let i = queue.length - 1; i >= (running ? 1 : 0); i--) {
      const q = queue[i];
      if (q.campId !== op.campId) continue;
      const same = (op.kind === "row" && q.kind === "row" && q.crId === op.crId) || (op.kind === "fields" && q.kind === "fields");
      if (same) {
        q.set = { ...q.set, ...op.set };
        q.from = { ...op.from, ...q.from }; // the earliest "from" is what this person actually saw
        return true;
      }
      // don't merge across a write to the same row/fields that must stay ordered
      if ((op.kind === "row" && (q.kind === "add" || q.kind === "remove") && (q.crId === op.crId || q.rows?.some((r) => r._id === op.crId)))) break;
      if (q.kind === "create") break;
    }
    return false;
  };

  function enqueue(op) {
    if (!coalesce(op)) queue.push({ ...op, tries: 0 });
    report(state === "idle" ? "saving" : state);
    pump();
  }

  async function send(op, force) {
    const actorName = who();
    switch (op.kind) {
      case "create": return CampaignsAPI.create(op.campaign);
      case "row": return CampaignsAPI.patchCreator(op.campId, op.crId, { set: op.set, from: op.from, force, actor: actorName });
      case "fields": return CampaignsAPI.patchFields(op.campId, { set: op.set, from: op.from, force, actor: actorName });
      case "add": return CampaignsAPI.addCreators(op.campId, op.rows, actorName);
      case "remove": return CampaignsAPI.removeCreator(op.campId, op.crId, actorName);
      case "timeline": return CampaignsAPI.addTimeline(op.campId, op.entry, actorName);
      default: return null;
    }
  }

  async function pump() {
    if (running) return;
    running = true;
    while (queue.length) {
      const op = queue[0];
      let force = !!op.force;
      try {
        const result = await send(op, force);
        queue.shift();
        onSaved?.(op.campId, { rev: result?.rev, op, result });
        if (!queue.some((q) => q.campId === op.campId)) onDrained?.(op.campId);
        report(queue.length ? "saving" : "idle");
      } catch (err) {
        const s = err?.status;
        const body = err?.body || {};
        if (s === 409 && body.conflicts?.length) {
          report("conflict");
          const choice = await (onConflict ? onConflict({ op, conflicts: body.conflicts, row: body.row }) : Promise.resolve("theirs"));
          if (choice === "mine") { op.force = true; report("saving"); continue; }
          queue.shift();
          if (!queue.some((q) => q.campId === op.campId)) onDrained?.(op.campId, { refresh: true });
          report(queue.length ? "saving" : "idle");
          continue;
        }
        if (s === 409 && op.kind === "create") { queue.shift(); continue; } // already there
        if (s && s >= 400 && s < 500 && !(s === 409 && body.busy)) {
          // refused for good (gone, not allowed, bad input) — don't loop on it
          queue.shift();
          onError?.(body.error || `Couldn't save (${s})`, op);
          if (!queue.some((q) => q.campId === op.campId)) onDrained?.(op.campId, { refresh: true });
          report(queue.length ? "saving" : "idle");
          continue;
        }
        // offline / server hiccup / busy: keep it, try again
        op.tries++;
        report("retrying");
        await sleep(Math.min(15000, 600 * 2 ** Math.min(op.tries, 5)));
      }
    }
    running = false;
    report("idle");
  }

  return {
    persist(prev, next) {
      const ops = diffCampaign(prev, next);
      ops.forEach(enqueue);
      return ops.length;
    },
    create(campaign) { enqueue({ kind: "create", campId: campaign.id, campaign }); },
    hasPending: (campId) => queue.some((q) => q.campId === campId),
    get pending() { return queue.length; },
    get state() { return state; },
    /** Retry now (e.g. the browser came back online). */
    kick() { pump(); },
  };
}

// ── live updates ────────────────────────────────────────────────────────────
/**
 * Opens the live stream. Returns `close()`.
 *   onCampaign({ id, rev, by, kind, … })   something changed
 *   onPresence({ campaignId, users })        who's on a campaign
 *   onConnection(isUp)                       stream up/down (falls back to polling)
 */
export function connectLive({ user, onCampaign, onPresence, onConnection } = {}) {
  if (typeof EventSource === "undefined") { onConnection?.(false); return () => {}; }
  let es = null, closed = false, retry = null;
  const open = () => {
    if (closed) return;
    es = new EventSource(`${LIVE_URL}?user=${encodeURIComponent(user || "")}`);
    es.addEventListener("hello", () => onConnection?.(true));
    es.addEventListener("campaign", (e) => { try { onCampaign?.(JSON.parse(e.data)); } catch { /* ignore */ } });
    es.addEventListener("presence", (e) => { try { onPresence?.(JSON.parse(e.data)); } catch { /* ignore */ } });
    es.onerror = () => {
      onConnection?.(false);
      // EventSource retries by itself while CONNECTING; if it gave up, reopen.
      if (es.readyState === 2 && !closed) { clearTimeout(retry); retry = setTimeout(open, 5000); }
    };
  };
  open();
  return () => { closed = true; clearTimeout(retry); es?.close(); };
}

/** A per-tab id, so one person in two tabs shows as two presences. */
export const TAB_KEY = `tab_${Math.random().toString(36).slice(2, 10)}`;
