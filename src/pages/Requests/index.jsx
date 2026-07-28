/**
 * 5th Avenue — Requests (founder-only)
 * ─────────────────────────────────────────────────────────────────
 * Every inbound submission from the public landing pages, in one place:
 *
 *   Client Requests   brand signups from "Start a project"      → /api/client-requests
 *   Creator Requests  applications from "Apply as a creator"    → /api/creator-requests
 *
 * Creator applications used to sit as a second tab inside the Creators
 * directory, which put the same kind of work — triaging an inbound lead — in
 * two unrelated sections. The directory is now purely the roster of creators
 * we work with; anything still awaiting a decision lives here.
 *
 * This file owns only the page chrome: header, search, tab strip and the
 * shared toast. Each tab's data, mutations and modals stay in its own panel.
 */
import { useState, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { can } from "../../lib/rbac";
import { T } from "../../theme/tokens";
import { INP, Pill } from "./shared";
import ClientRequestsPanel from "./ClientRequestsPanel";
import CreatorRequestsPanel from "./CreatorRequestsPanel";

const TABS = [
  {
    id: "client",
    label: "Client Requests",
    perm: "seeClientRequests",
    blurb: "Brand signups from the landing page — who they are and what they want from us.",
    placeholder: "Search brand, name, contact, goal…",
  },
  {
    id: "creator",
    label: "Creator Requests",
    perm: "seeCreatorRequests",
    blurb: "Creator applications from the landing page — triage them, then add the ones we want to the directory.",
    placeholder: "Search name, handle, platform, state, niche…",
  },
];

export default function Requests() {
  const { user } = useOutletContext() || {};
  const role = user?.role;

  const allowed = TABS.filter(t => can(role, t.perm));
  const [tab, setTab] = useState(allowed[0]?.id || "client");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState(null);
  // Each panel reports how many of its rows are still untriaged, so the badge
  // on the *other* tab tells the founder there's work there without switching.
  const [counts, setCounts] = useState({ client: 0, creator: 0 });

  const showToast = useCallback(msg => { setToast(msg); setTimeout(() => setToast(null), 2800); }, []);
  const countFor = useCallback((id) => (n) => setCounts(prev => (prev[id] === n ? prev : { ...prev, [id]: n })), []);

  // Defense in depth — the shell already hides this section from non-founders.
  if (!allowed.length) {
    return <div style={{ padding: 40, fontSize: 12, color: T.sub }}>This page is restricted to the founder.</div>;
  }

  const active = allowed.find(t => t.id === tab) || allowed[0];
  const totalNew = allowed.reduce((n, t) => n + (counts[t.id] || 0), 0);

  return (
    <div style={{ flex: 1, overflowY: "auto", background: T.bg, padding: "26px 30px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontSize: 24, fontWeight: 600, color: T.text }}>
            Requests
            {totalNew > 0 && <span style={{ marginLeft: 10 }}><Pill color={T.accent}>{totalNew} new</Pill></span>}
          </div>
          <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>{active.blurb}</div>
        </div>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={active.placeholder}
          style={{ ...INP, width: 280 }}
        />
      </div>

      {/* Tabs — same underline treatment the campaign detail panel uses */}
      {allowed.length > 1 && (
        <div style={{ display: "flex", gap: 22, borderBottom: `1px solid ${T.border}`, marginBottom: 18 }}>
          {allowed.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setQuery(""); }}
              style={{
                position: "relative", display: "flex", alignItems: "center", gap: 7,
                padding: "0 0 9px", background: "transparent", border: "none", cursor: "pointer",
                fontFamily: "'Sora'", fontSize: 12, letterSpacing: "-0.01em", marginBottom: -1,
                fontWeight: tab === t.id ? 600 : 400, color: tab === t.id ? T.text : T.sub,
                transition: "color 0.15s",
              }}>
              {t.label}
              {counts[t.id] > 0 && <Pill color={T.accent}>{counts[t.id]}</Pill>}
              {tab === t.id && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, borderRadius: 1, background: T.accent }} />}
            </button>
          ))}
        </div>
      )}

      {/* Both panels stay mounted so switching tabs doesn't refetch and lose
          triage state — only the inactive one is hidden. */}
      {allowed.map(t => (
        <div key={t.id} style={{ display: tab === t.id ? "block" : "none" }}>
          {t.id === "client"
            ? <ClientRequestsPanel  query={tab === "client"  ? query : ""} showToast={showToast} onCount={countFor("client")} />
            : <CreatorRequestsPanel query={tab === "creator" ? query : ""} showToast={showToast} onCount={countFor("creator")} />}
        </div>
      ))}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, padding: "11px 18px", background: "rgba(29,29,31,0.92)", backdropFilter: "blur(16px)", borderRadius: 12, fontSize: 12, color: "#FFFFFF", fontFamily: "'Sora'", boxShadow: "0 8px 32px rgba(0,0,0,0.24)", letterSpacing: "-0.01em" }}>{toast}</div>
      )}
    </div>
  );
}
