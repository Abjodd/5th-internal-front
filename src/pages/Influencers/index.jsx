/**
 * 5th Avenue — Influencers (founder-only)
 * ─────────────────────────────────────────────────────────────────
 * Directory of every creator across all campaigns, row by row, with
 * their profile, billing/onboarding details, campaign appearances and
 * generated invoices (PDFs stored in the backend's GridFS bucket).
 *
 * All data comes from GET /api/influencers — the backend aggregates
 * creators across campaigns and attaches invoices, so this page is a
 * pure view over that endpoint (single source of truth).
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { InfluencersAPI, InvoicePdfAPI } from "../../lib/api";
import { can } from "../../lib/rbac";
import { fmtCompact } from "../../lib/format";
import { T } from "../../theme/tokens";
import { AddCreatorModal } from "../Campaigns";

// ── STYLE HELPERS ────────────────────────────────────────────────────────────
const thS = {
  padding: "9px 14px", textAlign: "left", fontSize: 9, fontWeight: 600,
  color: T.label, textTransform: "uppercase", letterSpacing: "0.07em",
  borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap",
  fontFamily: "'Sora', sans-serif", background: T.raised,
};
const tdS = {
  padding: "11px 14px", fontSize: 11.5, color: T.text,
  borderBottom: `1px solid ${T.border}`, verticalAlign: "middle",
};
const INP = {
  padding: "7px 10px", borderRadius: 5, background: T.surface,
  border: `1px solid ${T.border}`, color: T.text, fontSize: 11.5,
  fontFamily: "'Sora'", outline: "none",
};

const PAY_LABELS = { vendor: "To Vendor", net_banking: "Net Banking", upi: "UPI" };

const fmtINR = n => (!n && n !== 0) ? "—"
  : n >= 100000 ? `₹${(n / 100000).toFixed(1)}L`
  : n >= 1000   ? `₹${(n / 1000).toFixed(0)}K`
  : `₹${n}`;

const Av = ({ name }) => (
  <div style={{
    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
    background: `${T.pink}16`, color: T.pink,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 10, fontWeight: 600,
  }}>
    {(name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
  </div>
);

const Pill = ({ children, color = T.sub }) => (
  <span style={{
    display: "inline-block", padding: "2px 8px", borderRadius: 10,
    fontSize: 9.5, fontWeight: 500, color, background: `${color}14`,
    border: `1px solid ${color}28`, whiteSpace: "nowrap",
  }}>{children}</span>
);

// One label/value line in the expanded detail panels.
const Fact = ({ label, value }) => (
  <div style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 11 }}>
    <span style={{ color: T.label, width: 92, flexShrink: 0 }}>{label}</span>
    <span style={{ color: value ? T.text : T.label }}>{value || "—"}</span>
  </div>
);

// Shared styles for the three expanded-row panels.
const panel = {
  flex: 1, minWidth: 220, background: T.surface,
  border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "12px 14px",
};
const panelTitle = {
  fontSize: 9, fontWeight: 600, color: T.label, textTransform: "uppercase",
  letterSpacing: "0.07em", marginBottom: 8,
};

// ── INVOICES PANEL ───────────────────────────────────────────────────────────
// One influencer's generated invoices with a local filter — matches invoice
// no, label, or the campaign the invoice belongs to.
function InvoicesPanel({ invoices, campaigns }) {
  const [invQuery, setInvQuery] = useState("");
  const nameById = useMemo(() => new Map(campaigns.map(c => [c.id, c.name])), [campaigns]);
  const campaignName = (id) => nameById.get(id) || null;
  const shown = useMemo(() => {
    const q = invQuery.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter(inv =>
      [inv.id, inv.label, inv.campaign, nameById.get(inv.campaign)]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q))
    );
  }, [invoices, invQuery, nameById]);

  return (
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ ...panelTitle, marginBottom: 0 }}>Invoices ({shown.length}{invQuery ? ` of ${invoices.length}` : ""})</div>
        {invoices.length > 1 && (
          <input
            value={invQuery}
            onChange={e => setInvQuery(e.target.value)}
            placeholder="Filter by campaign / invoice no…"
            style={{ ...INP, width: 170, padding: "4px 8px", fontSize: 10 }}
          />
        )}
      </div>
      {invoices.length === 0 && (
        <div style={{ fontSize: 10.5, color: T.label, fontStyle: "italic" }}>No invoices generated yet.</div>
      )}
      {invoices.length > 0 && shown.length === 0 && (
        <div style={{ fontSize: 10.5, color: T.label, fontStyle: "italic" }}>No invoices match "{invQuery}".</div>
      )}
      {shown.map((inv, i) => (
        <div key={inv.id} style={{
          display: "flex", alignItems: "center", gap: 8, padding: "7px 0",
          borderBottom: i < shown.length - 1 ? `1px solid ${T.border}` : "none",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontFamily: "monospace", color: T.text }}>{inv.id}</div>
            <div style={{ fontSize: 9.5, color: T.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {campaignName(inv.campaign) ? `${campaignName(inv.campaign)} · ` : ""}{fmtINR(inv.amount)}{inv.generatedAt ? ` · ${new Date(inv.generatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}
            </div>
          </div>
          {inv.pdfUrl && (
            <button
              onClick={() => window.open(InvoicePdfAPI.url(inv.id), "_blank")}
              style={{
                fontSize: 9.5, color: T.accent, background: "transparent",
                border: `1px solid ${T.accent}30`, borderRadius: 4,
                padding: "3px 9px", cursor: "pointer", fontFamily: "'Sora'",
              }}
            >View PDF</button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── EXPANDED ROW ─────────────────────────────────────────────────────────────
function InfluencerDetail({ inf, canEdit, onEdit }) {
  const pd = inf.personalDetails || {};
  return (
    <div style={{ display: "flex", gap: 12, padding: "14px 14px 16px", flexWrap: "wrap", background: T.raised }}>
      {/* Onboarding & billing details */}
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={panelTitle}>Onboarding & Billing</div>
          {canEdit && (
            <button
              onClick={e => { e.stopPropagation(); onEdit(inf); }}
              style={{
                fontSize: 9.5, color: T.accent, background: "transparent",
                border: `1px solid ${T.accent}30`, borderRadius: 4,
                padding: "3px 9px", cursor: "pointer", fontFamily: "'Sora'",
              }}
            >Edit</button>
          )}
        </div>
        <Fact label="Phone"    value={inf.phone} />
        <Fact label="Email"    value={pd.email} />
        <Fact label="PAN"      value={pd.pan} />
        <Fact label="Address"  value={pd.address} />
        <Fact label="Pay Type" value={inf.payType ? PAY_LABELS[inf.payType] || inf.payType : null} />
        {inf.payType === "upi"
          ? <Fact label="UPI ID" value={pd.upiId} />
          : <>
              <Fact label="Bank"    value={pd.bankName} />
              <Fact label="A/c No." value={pd.bankAccount} />
              <Fact label="IFSC"    value={pd.ifsc} />
            </>}
        <Fact label="Pay ID" value={inf.payId} />
      </div>

      {/* Campaign appearances */}
      <div style={{ ...panel, flex: 1.4 }}>
        <div style={panelTitle}>Campaigns ({inf.campaigns.length})</div>
        {inf.campaigns.map((c, i) => (
          <div key={`${c.id}_${i}`} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "7px 0",
            borderBottom: i < inf.campaigns.length - 1 ? `1px solid ${T.border}` : "none",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 500, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
              <div style={{ fontSize: 9.5, color: T.sub }}>{c.client}</div>
            </div>
            {c.stage && <Pill color={T.teal}>{String(c.stage).replace(/_/g, " ")}</Pill>}
            {c.status && <Pill color={c.status === "locked" ? T.green : T.amber}>{c.status}</Pill>}
            <span style={{ fontSize: 11, color: T.text, fontWeight: 500, width: 60, textAlign: "right" }}>{fmtINR(c.fee)}</span>
          </div>
        ))}
      </div>

      {/* Generated invoices */}
      <InvoicesPanel invoices={inf.invoices} campaigns={inf.campaigns} />
    </div>
  );
}

// ── PAGE ─────────────────────────────────────────────────────────────────────
export default function Influencers() {
  const { user, brandFilter } = useOutletContext() || {};
  const role = user?.role;

  const [influencers, setInfluencers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [query, setQuery]     = useState("");
  const [expanded, setExpanded] = useState(null); // influencer id
  const [editTarget, setEditTarget] = useState(null); // influencer being edited (founder only)
  const [toast, setToast] = useState(null);
  const showToast = useCallback(msg => { setToast(msg); setTimeout(() => setToast(null), 2800); }, []);
  const canEdit = can(role, "editInfluencer");

  // Same optimistic-update + toast-on-failure pattern as Campaigns. The modal
  // returns the merged record; aggregate-only keys stay out of the PATCH.
  const saveEdit = useCallback(merged => {
    const { campaigns, invoices, ...patch } = merged;
    setInfluencers(prev => prev.map(i => (i.id === merged.id ? { ...i, ...patch } : i)));
    InfluencersAPI.update(merged.id, patch).catch(() => showToast("Save failed — check connection"));
    showToast("Influencer updated");
  }, [showToast]);

  useEffect(() => {
    if (!can(role, "seeInfluencers")) return;
    setLoading(true);
    setError(null);
    InfluencersAPI.list(brandFilter)
      .then(list => setInfluencers(list))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [role, brandFilter]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return influencers;
    return influencers.filter(i =>
      [i.name, i.handle, i.niche, i.state, ...(i.campaigns || []).map(c => c.name)]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q))
    );
  }, [influencers, query]);

  // Defense in depth — the shell already hides this section from non-founders.
  if (!can(role, "seeInfluencers")) {
    return <div style={{ padding: 40, fontSize: 12, color: T.sub }}>This page is restricted to the founder.</div>;
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", background: T.bg, padding: "26px 30px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontSize: 24, fontWeight: 600, color: T.text }}>
            Influencers
          </div>
          <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>
            Every creator across all campaigns — profiles, onboarding details and generated invoices.
          </div>
        </div>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search name, handle, state, campaign…"
          style={{ ...INP, width: 260 }}
        />
      </div>

      {/* States */}
      {loading && <div style={{ padding: 40, fontSize: 12, color: T.sub, textAlign: "center" }}>Loading influencers…</div>}
      {error && !loading && (
        <div style={{ padding: "14px 16px", background: `${T.red}0C`, border: `1px solid ${T.red}30`, borderRadius: T.radiusSm, fontSize: 11.5, color: T.red }}>
          Could not load influencers from the backend: {error}
        </div>
      )}
      {!loading && !error && visible.length === 0 && (
        <div style={{ padding: 40, fontSize: 12, color: T.label, textAlign: "center", fontStyle: "italic" }}>
          {query ? "No influencers match your search." : "No creators found on any campaign yet."}
        </div>
      )}

      {/* Table */}
      {!loading && !error && visible.length > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, boxShadow: T.shadow, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS}>Creator</th>
                <th style={thS}>Platform</th>
                <th style={thS}>Followers</th>
                <th style={thS}>Avg ER%</th>
                <th style={thS}>State</th>
                <th style={thS}>Pay Type</th>
                <th style={thS}>Campaigns</th>
                <th style={thS}>Invoices</th>
                <th style={{ ...thS, width: 34 }} />
              </tr>
            </thead>
            <tbody>
              {visible.map(inf => {
                const open = expanded === inf.id;
                return [
                  <tr
                    key={inf.id}
                    onClick={() => setExpanded(open ? null : inf.id)}
                    style={{ cursor: "pointer", background: open ? T.raised : "transparent", transition: "background 0.2s ease" }}
                    onMouseOver={e => { if (!open) e.currentTarget.style.background = T.hover; }}
                    onMouseOut={e => { if (!open) e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={tdS}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Av name={inf.name} />
                        <div>
                          <div style={{ fontWeight: 500 }}>{inf.name}</div>
                          <div style={{ fontSize: 9.5, color: T.sub }}>{inf.handle || "—"}{inf.niche ? ` · ${inf.niche}` : ""}</div>
                        </div>
                      </div>
                    </td>
                    <td style={tdS}>{inf.platform || "—"}</td>
                    <td style={tdS}>{fmtCompact(inf.followers)}</td>
                    <td style={tdS}>{inf.avgER != null ? `${inf.avgER}%` : "—"}</td>
                    <td style={tdS}>{inf.state || "—"}</td>
                    <td style={tdS}>{inf.payType ? <Pill color={T.accent}>{PAY_LABELS[inf.payType] || inf.payType}</Pill> : "—"}</td>
                    <td style={tdS}><Pill color={T.teal}>{inf.campaigns.length}</Pill></td>
                    <td style={tdS}><Pill color={inf.invoices.length ? T.green : T.sub}>{inf.invoices.length}</Pill></td>
                    <td style={{ ...tdS, fontSize: 10 }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 20, height: 20, borderRadius: "50%",
                        background: open ? `${T.accent}12` : "transparent",
                        color: open ? T.accent : T.label,
                        transform: open ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1), background 0.2s ease, color 0.2s ease",
                      }}>▾</span>
                    </td>
                  </tr>,
                  // Always rendered; the 0fr→1fr grid transition animates the
                  // expand/collapse smoothly (no sudden mount/unmount).
                  <tr key={`${inf.id}_detail`}>
                    <td colSpan={9} style={{ padding: 0, border: "none", borderBottom: open ? `1px solid ${T.border}` : "none" }}>
                      <div style={{
                        display: "grid",
                        gridTemplateRows: open ? "1fr" : "0fr",
                        transition: "grid-template-rows 0.32s cubic-bezier(0.4,0,0.2,1)",
                      }}>
                        <div style={{ overflow: "hidden" }}>
                          <div style={{
                            opacity: open ? 1 : 0,
                            transform: open ? "translateY(0)" : "translateY(-6px)",
                            transition: "opacity 0.28s ease 0.06s, transform 0.32s cubic-bezier(0.4,0,0.2,1)",
                          }}>
                            <InfluencerDetail inf={inf} canEdit={canEdit} onEdit={setEditTarget} />
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {editTarget && (
        <AddCreatorModal editing={editTarget} onAdd={saveEdit} onClose={() => setEditTarget(null)} />
      )}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, padding: "11px 18px", background: "rgba(29,29,31,0.92)", backdropFilter: "blur(16px)", borderRadius: 12, fontSize: 12, color: "#FFFFFF", fontFamily: "'Sora'", boxShadow: "0 8px 32px rgba(0,0,0,0.24)", letterSpacing: "-0.01em" }}>{toast}</div>
      )}
    </div>
  );
}
