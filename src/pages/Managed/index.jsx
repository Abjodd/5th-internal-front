/**
 * 5th Avenue — Managed Creators (founder-only)
 * ─────────────────────────────────────────────────────────────────
 * The whole ecosystem around the creators we manage directly — managedBy
 * === "fifthavenue" (see lib/management.js) — as its own small app instead
 * of one card grid:
 *
 *   · Summary   — the roster at a glance: revenue, reach, top creators.
 *   · Campaigns — every brand deal any managed creator is running, across
 *                 the whole roster (not "campaigns" in the agency-pipeline
 *                 sense — see CampaignsTab's own header comment).
 *   · Assets    — every reel those deals have ever produced, as cards.
 *   · Creators  — the roster itself: add one, see full profile + history.
 *
 * One deal — a brand, a budget, a reel link that auto-fetches its own stats
 * — is one Project document (models/Project.js) whichever surface it's
 * reached from, Campaigns' central table or a creator's own card on the
 * Creators tab. Kept as ONE model, not two, so the two views can never
 * disagree about a total — and because this is the seed of a future
 * standalone creator dashboard, which will read this same shape.
 *
 * This file owns the shared data (the managed roster, vendors, every deal)
 * and the shared write paths (patch a creator, add a creator, add/remove a
 * deal); each tab below is a presentational consumer of what's loaded here.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { CreatorsAPI, VendorsAPI } from "../../lib/api";
import { can } from "../../lib/rbac";
import { T } from "../../theme/tokens";
import { CARD_CSS, Notice } from "../Creators/shared";
import SummaryTab from "./SummaryTab";
import CampaignsTab from "./CampaignsTab";
import AssetsTab from "./AssetsTab";
import CreatorsTab from "./CreatorsTab";

const TABS = [
  { id: "summary", label: "Summary" },
  { id: "campaigns", label: "Campaigns" },
  { id: "assets", label: "Assets" },
  { id: "creators", label: "Creators" },
];

export default function Managed() {
  const { user, brandFilter } = useOutletContext() || {};
  const role = user?.role;
  const canEdit = can(role, "editCreator");

  const [tab, setTab] = useState("summary");
  const [creators, setCreators] = useState([]);
  const [vendors, setVendors] = useState([]);
  // null = not loaded yet — distinct from [] (loaded, nobody has a deal),
  // so Campaigns/Assets/Summary can tell "loading" from "empty".
  const [projects, setProjects] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const showToast = useCallback(msg => { setToast(msg); setTimeout(() => setToast(null), 2800); }, []);

  useEffect(() => {
    if (!can(role, "seeCreators")) return;
    setLoading(true);
    setError(null);
    Promise.all([CreatorsAPI.list(brandFilter), VendorsAPI.list().catch(() => [])])
      .then(([cs, vs]) => { setCreators(cs); setVendors(vs); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [role, brandFilter]);

  // Deals load lazily and refresh every time a tab that actually needs them
  // becomes active. That's what keeps Campaigns/Assets/Summary from going
  // stale after a deal is added or removed from inside a creator's own card
  // on the Creators tab, without plumbing a shared-state callback all the
  // way through CreatorCard → CreatorDetail → ProjectsPanel just for this
  // page — one unscoped collection, cheap to re-fetch, no pagination to fight.
  const loadProjects = useCallback(() => {
    CreatorsAPI.projects.listAll()
      .then(setProjects)
      .catch(() => setProjects(prev => prev ?? []));
  }, []);
  useEffect(() => { if (tab !== "creators") loadProjects(); }, [tab, loadProjects]);

  const managed = useMemo(() => creators.filter(c => c.managedBy === "fifthavenue"), [creators]);
  const managedIds = useMemo(() => new Set(managed.map(c => c.id)), [managed]);
  // Scoped to the current managed roster even if the unscoped feed ever
  // carries a stray row for a creator later moved off "fifthavenue".
  const deals = useMemo(() => (projects || []).filter(p => managedIds.has(p.creatorId)), [projects, managedIds]);

  const vendorById = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors]);

  const patchCreator = useCallback((id, patch, msg) => {
    setCreators(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
    CreatorsAPI.update(id, patch)
      .then(saved => setCreators(prev => prev.map(c => (c.id === saved.id ? { ...c, ...saved } : c))))
      .catch(() => showToast("Save failed — check connection"));
    if (msg) showToast(msg);
  }, [showToast]);

  const saveEdit = useCallback(merged => {
    const { campaigns, invoices, ...patch } = merged;
    patchCreator(merged.id, patch, "Creator updated");
  }, [patchCreator]);

  // AddCreatorModal is built for the campaign roster's "Add to list" flow —
  // its onAdd just hands back a local object for the caller to decide what
  // to do with. Here that means a real POST: this is the one place a
  // creator is added with no campaign to save it alongside. managedBy is
  // forced rather than offered as a form field — anyone using this page's
  // Add button is, by definition, adding someone we manage.
  const addCreator = useCallback(async (cr) => {
    try {
      const created = await CreatorsAPI.create({ ...cr, managedBy: "fifthavenue" });
      // POST returns the bare directory record — GET /api/creators is the
      // only route that joins on campaigns/invoices. CreatorCard reads both
      // unconditionally, so a brand-new creator needs them seeded empty.
      setCreators(prev => [...prev, { ...created, campaigns: created.campaigns || [], invoices: created.invoices || [] }]);
      showToast(`${created.name} added`);
    } catch (e) {
      showToast(e.message?.includes("already exists") ? e.message : "Could not add creator — check connection");
    }
  }, [showToast]);

  // One write path for every deal mutation on this page — Campaigns' central
  // "+ Add deal" / Remove both go through CreatorsAPI.projects, the exact
  // same route ProjectsPanel on the Creators tab uses, and fold the result
  // into `projects` so Summary/Assets see it without waiting for the next
  // tab-switch refetch.
  const addDeal = useCallback(async (creatorId, body) => {
    const saved = await CreatorsAPI.projects.create(creatorId, body);
    const creator = creators.find(c => c.id === creatorId);
    setProjects(prev => [{
      ...saved,
      creatorId,
      creatorName: creator?.name || null,
      creatorHandle: creator?.handle || null,
      creatorPlatform: creator?.platform || null,
    }, ...(prev || [])]);
    showToast("Deal added");
    return saved;
  }, [creators, showToast]);

  const removeDeal = useCallback(async (creatorId, projectId) => {
    await CreatorsAPI.projects.remove(creatorId, projectId);
    setProjects(prev => (prev || []).filter(p => p.id !== projectId));
    showToast("Deal removed");
  }, [showToast]);

  const updateDeal = useCallback(async (creatorId, projectId, patch) => {
    const saved = await CreatorsAPI.projects.update(creatorId, projectId, patch);
    setProjects(prev => (prev || []).map(p => (p.id === projectId ? { ...p, ...saved } : p)));
    showToast("Deal updated");
    return saved;
  }, [showToast]);

  if (!can(role, "seeCreators")) {
    return <div style={{ padding: 40, fontSize: 12, color: T.sub }}>This page is restricted to the founder.</div>;
  }

  const tabProps = {
    creators: managed, vendors, vendorById, canEdit,
    deals, dealsLoading: projects === null,
    patchCreator, showToast, user, setTab,
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: T.bg, padding: "26px 30px" }}>
      <style>{CARD_CSS}</style>

      {/* Header + sub-nav */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontSize: 24, fontWeight: 600, color: T.text }}>
          Managed Creators
        </div>
        <div style={{ fontSize: 11, color: T.sub, marginTop: 4, marginBottom: 14 }}>
          The creators we manage directly — their roster, their brand deals, and every reel those deals have produced.
        </div>
        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.border}` }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              position: "relative", padding: "9px 14px", background: "transparent", border: "none",
              borderBottom: `2px solid ${tab === t.id ? T.accent : "transparent"}`,
              marginBottom: -1, cursor: "pointer", fontFamily: "'Sora'",
              fontSize: 12, fontWeight: tab === t.id ? 600 : 500,
              color: tab === t.id ? T.accent : T.sub,
            }}>
              {t.label}
              {t.id === "campaigns" && deals.length > 0 && (
                <span style={{ marginLeft: 6, fontSize: 9.5, color: T.label }}>{deals.length}</span>
              )}
              {t.id === "creators" && managed.length > 0 && (
                <span style={{ marginLeft: 6, fontSize: 9.5, color: T.label }}>{managed.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading && <Notice>Loading…</Notice>}
      {error && !loading && <Notice tone="error">Could not load creators from the backend: {error}</Notice>}

      {!loading && !error && (
        tab === "summary" ? <SummaryTab {...tabProps} /> :
        tab === "campaigns" ? <CampaignsTab {...tabProps} onAddDeal={addDeal} onRemoveDeal={removeDeal} onUpdateDeal={updateDeal} /> :
        tab === "assets" ? <AssetsTab {...tabProps} /> :
        <CreatorsTab {...tabProps} onAddCreator={addCreator} onSaveEdit={saveEdit} />
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, padding: "11px 18px", background: "rgba(29,29,31,0.92)", backdropFilter: "blur(16px)", borderRadius: 12, fontSize: 12, color: "#FFFFFF", fontFamily: "'Sora'", boxShadow: "0 8px 32px rgba(0,0,0,0.24)", letterSpacing: "-0.01em" }}>{toast}</div>
      )}
    </div>
  );
}
