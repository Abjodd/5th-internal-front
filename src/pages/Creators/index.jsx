/**
 * 5th Avenue — Creators (founder-only)
 * ─────────────────────────────────────────────────────────────────
 * Directory of every creator we work with: profile, billing/onboarding details,
 * campaign appearances and generated invoices (PDFs in the backend's GridFS).
 *
 * All data comes from GET /api/creators, which joins campaigns and invoices onto
 * the creators collection — this page is a pure view over that endpoint.
 *
 * Inbound applications are NOT here: they're untriaged leads and live in
 * pages/Requests. A creator appears here once promoted from that inbox, or once
 * a campaign puts them on its creator list.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { CreatorsAPI, InvoicePdfAPI } from "../../lib/api";
import { can } from "../../lib/rbac";
import CreatorHandle from "../../components/CreatorHandle";
import CreatorAvatar from "../../components/CreatorAvatar";
import { fmtCompact, fmtINR } from "../../lib/format";
import { T } from "../../theme/tokens";
import { AddCreatorModal } from "../Campaigns";

// ── STYLE HELPERS ────────────────────────────────────────────────────────────
const INP = {
  padding: "7px 10px", borderRadius: 5, background: T.surface,
  border: `1px solid ${T.border}`, color: T.text, fontSize: 11.5,
  fontFamily: "'Sora'", outline: "none",
};

const PAY_LABELS = { vendor: "To Vendor", net_banking: "Net Banking", upi: "UPI" };

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

// Shared styles for the three expanded detail panels.
const panel = {
  flex: 1, minWidth: 220, background: T.surface,
  border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "12px 14px",
};
const panelTitle = {
  fontSize: 9, fontWeight: 600, color: T.label, textTransform: "uppercase",
  letterSpacing: "0.07em", marginBottom: 8,
};

// One figure in a card's stat strip. The strip draws its own dividers with a
// 1px grid gap over a border-coloured backdrop, so nothing here needs to know
// its index to decide whether it has a rule on its left.
const Stat = ({ label, value, color = T.text }) => (
  <div style={{ flex: 1, minWidth: 0, background: T.surface, padding: "9px 4px", textAlign: "center" }}>
    <div style={{ fontSize: 13, fontWeight: 600, color, letterSpacing: "-0.01em" }}>{value}</div>
    <div style={{
      fontSize: 7.5, color: T.label, textTransform: "uppercase",
      letterSpacing: "0.07em", marginTop: 2,
    }}>{label}</div>
  </div>
);

// ── INVOICES PANEL ───────────────────────────────────────────────────────────
// One creator's generated invoices with a local filter — matches invoice
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

// ── EXPANDED DETAIL ──────────────────────────────────────────────────────────
function CreatorDetail({ inf, canEdit, onEdit }) {
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
            <span style={{ fontSize: 11, color: T.text, fontWeight: 500, width: 60, textAlign: "right" }}>{fmtINR(c.cost ?? c.fee)}</span>
          </div>
        ))}
      </div>

      {/* Generated invoices */}
      <InvoicesPanel invoices={inf.invoices} campaigns={inf.campaigns} />
    </div>
  );
}

// ── CREATOR CARD ─────────────────────────────────────────────────────────────
/**
 * One creator, as a card: photo and identity, the four figures worth scanning,
 * then platform/location/pay on a footer strip.
 *
 * Opening one spans it across the whole grid row (`gridColumn: 1 / -1`) rather
 * than growing it inside its own column — the detail is three panels wide, and
 * in a 300px column they stack into a tower that leaves the rest of the row
 * empty. The card stays where it is in DOM order, so it moves at most one row.
 */
function CreatorCard({ inf, open, onToggle, canEdit, onEdit }) {
  return (
    <article
      className="cr-card"
      onClick={onToggle}
      // Border and shadow live in the .cr-card rule, not here: an inline
      // shorthand outranks a stylesheet, so declaring them inline would make
      // the :hover rule below dead code. Only the open state is set inline —
      // where beating :hover is the point, since an open card should not also
      // light up under the cursor.
      style={{
        gridColumn: open ? "1 / -1" : "auto",
        background: T.surface, borderRadius: T.radius,
        overflow: "hidden", cursor: "pointer",
        borderColor: open ? T.borderMid : undefined,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 14px" }}>
        <CreatorAvatar creator={inf} size={40} radius={10} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 500, color: T.text,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{inf.name}</div>
          <div style={{ fontSize: 9.5, color: T.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <CreatorHandle creator={inf} style={{ fontSize: 9.5 }} />{inf.niche ? ` · ${inf.niche}` : ""}
          </div>
        </div>
        {/* The whole card is clickable for convenience, but the chevron is the
            real control: a div with an onClick is unreachable by keyboard, and
            the card cannot itself be a button because it contains a link. */}
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} details for ${inf.name}`}
          onClick={e => { e.stopPropagation(); onToggle(); }}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 20, height: 20, borderRadius: "50%", flexShrink: 0, fontSize: 10,
            border: "none", padding: 0, cursor: "pointer",
            background: open ? `${T.accent}12` : "transparent",
            color: open ? T.accent : T.label,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1), background 0.2s ease, color 0.2s ease",
          }}
        >▾</button>
      </header>

      {/* 1px gap over a border-coloured backdrop = hairlines between figures. */}
      <div style={{ display: "flex", gap: 1, background: T.border, borderTop: `1px solid ${T.border}` }}>
        <Stat label="Followers" value={fmtCompact(inf.followers)} />
        <Stat label="Avg ER" value={inf.avgER != null ? `${inf.avgER}%` : "—"} />
        <Stat label="Campaigns" value={inf.campaigns.length} color={inf.campaigns.length ? T.teal : T.label} />
        <Stat label="Invoices" value={inf.invoices.length} color={inf.invoices.length ? T.green : T.label} />
      </div>

      <footer style={{
        display: "flex", alignItems: "center", gap: 8, padding: "9px 14px",
        borderTop: `1px solid ${T.border}`, background: T.raised,
        fontSize: 10.5, color: T.sub,
      }}>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {inf.platform || "—"}{inf.state ? ` · ${inf.state}` : ""}
        </span>
        {inf.payType && (
          <span style={{ marginLeft: "auto" }}>
            <Pill color={T.accent}>{PAY_LABELS[inf.payType] || inf.payType}</Pill>
          </span>
        )}
      </footer>

      {/* Always mounted; the 0fr→1fr grid transition animates the reveal.
          The detail swallows its own clicks: it lives inside the card that
          toggles, so without this the invoice filter and every View PDF button
          would shut the card the moment they were used. `visibility` is what
          takes the collapsed copy out of the tab order and off the screen
          reader — clipped-but-present controls are still focusable. */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: "grid", gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 0.32s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div style={{
            borderTop: `1px solid ${T.border}`,
            opacity: open ? 1 : 0,
            visibility: open ? "visible" : "hidden",
            transition: "opacity 0.28s ease 0.06s, visibility 0.34s",
          }}>
            <CreatorDetail inf={inf} canEdit={canEdit} onEdit={onEdit} />
          </div>
        </div>
      </div>
    </article>
  );
}

// ── PAGE ─────────────────────────────────────────────────────────────────────
export default function Creators() {
  const { user, brandFilter } = useOutletContext() || {};
  const role = user?.role;

  const [creators, setCreators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [query, setQuery]     = useState("");
  const [expanded, setExpanded] = useState(null); // creator id
  const [editTarget, setEditTarget] = useState(null); // creator being edited (founder only)
  const [toast, setToast] = useState(null);
  const showToast = useCallback(msg => { setToast(msg); setTimeout(() => setToast(null), 2800); }, []);
  const canEdit = can(role, "editCreator");

  // Same optimistic-update + toast-on-failure pattern as Campaigns. The modal
  // returns the merged record; aggregate-only keys stay out of the PATCH.
  const saveEdit = useCallback(merged => {
    const { campaigns, invoices, ...patch } = merged;
    setCreators(prev => prev.map(i => (i.id === merged.id ? { ...i, ...patch } : i)));
    CreatorsAPI.update(merged.id, patch)
      // The photo is the one field the optimistic pass cannot paint. What the
      // card renders is a URL built from `hasAvatar` + `avatarUpdatedAt`, and
      // both are the server's to decide — it also owns whether a platform
      // capture (`avatarSourceUrl`) actually succeeded. Folding the response
      // back in is what makes a new picture appear without a reload, and
      // `avatarUpdatedAt` moving is what busts the year-long image cache.
      // The response carries no campaigns/invoices keys, so the aggregates
      // merged over above survive.
      .then(saved => setCreators(prev => prev.map(i => (i.id === saved.id ? { ...i, ...saved } : i))))
      .catch(() => showToast("Save failed — check connection"));
    showToast("Creator updated");
  }, [showToast]);

  useEffect(() => {
    if (!can(role, "seeCreators")) return;
    setLoading(true);
    setError(null);
    CreatorsAPI.list(brandFilter)
      .then(list => setCreators(list))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [role, brandFilter]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return creators;
    return creators.filter(i =>
      [i.name, i.handle, i.niche, i.state, ...(i.campaigns || []).map(c => c.name)]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q))
    );
  }, [creators, query]);

  // Defense in depth — the shell already hides this section from non-founders.
  if (!can(role, "seeCreators")) {
    return <div style={{ padding: 40, fontSize: 12, color: T.sub }}>This page is restricted to the founder.</div>;
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", background: T.bg, padding: "26px 30px" }}>
      <style>{`
        .cr-card {
          border: 1px solid ${T.border};
          box-shadow: ${T.shadow};
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .cr-card:hover {
          border-color: ${T.borderMid};
          box-shadow: 0 4px 16px rgba(28,24,16,0.10);
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontSize: 24, fontWeight: 600, color: T.text }}>
            Creators
          </div>
          <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>
            Every creator we work with — profiles, onboarding details and generated invoices.
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
      {loading && <div style={{ padding: 40, fontSize: 12, color: T.sub, textAlign: "center" }}>Loading creators…</div>}
      {error && !loading && (
        <div style={{ padding: "14px 16px", background: `${T.red}0C`, border: `1px solid ${T.red}30`, borderRadius: T.radiusSm, fontSize: 11.5, color: T.red }}>
          Could not load creators from the backend: {error}
        </div>
      )}
      {!loading && !error && visible.length === 0 && (
        <div style={{ padding: 40, fontSize: 12, color: T.label, textAlign: "center", fontStyle: "italic" }}>
          {query ? "No creators match your search." : "No creators in the directory yet."}
        </div>
      )}

      {/* Directory */}
      {!loading && !error && visible.length > 0 && (
        <div style={{
          display: "grid", gap: 12, alignItems: "start",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        }}>
          {visible.map(inf => (
            <CreatorCard
              key={inf.id}
              inf={inf}
              open={expanded === inf.id}
              onToggle={() => setExpanded(expanded === inf.id ? null : inf.id)}
              canEdit={canEdit}
              onEdit={setEditTarget}
            />
          ))}
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
