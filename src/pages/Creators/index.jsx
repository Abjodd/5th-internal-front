/**
 * 5th Avenue — Creators (founder-only)
 * ─────────────────────────────────────────────────────────────────
 * Two tabs over the same relationship:
 *   · Creators — every creator we work with: profile, billing/onboarding
 *     details, campaign appearances and generated invoices (PDFs in GridFS).
 *   · Vendors  — the agencies and talent managers that invoice us on a
 *     creator's behalf, and which creators each one fronts.
 *
 * Creator data comes from GET /api/creators, which joins campaigns and invoices
 * onto the creators collection; vendors are plain CRUD. A creator points at its
 * vendor with `vendorId`, so this page loads both lists once and every "which
 * creators does this vendor have" answer is derived rather than fetched.
 *
 * Inbound applications are NOT here: they're untriaged leads and live in
 * pages/Requests. A creator appears here once promoted from that inbox, or once
 * a campaign puts them on its creator list.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { CreatorsAPI, InvoicePdfAPI, VendorsAPI } from "../../lib/api";
import { can } from "../../lib/rbac";
import CreatorHandle from "../../components/CreatorHandle";
import CreatorAvatar from "../../components/CreatorAvatar";
import { fmtCompact, fmtINR } from "../../lib/format";
import { payeeOf } from "../../lib/payee";
import { T } from "../../theme/tokens";
import { AddCreatorModal } from "../Campaigns";
import VendorsPanel from "./VendorsPanel";
import {
  Card, CardGrid, CARD_CSS, Fact, GhostBtn, INP, Notice, PAY_LABELS, Pill, panel, panelTitle,
} from "./shared";

// ── INVOICES PANEL ───────────────────────────────────────────────────────────
// One creator's generated invoices with a local filter — matches invoice
// no, label, or the campaign the invoice belongs to.
function InvoicesPanel({ invoices, campaigns }) {
  const [invQuery, setInvQuery] = useState("");
  const nameById = useMemo(() => new Map(campaigns.map(c => [c.id, c.name])), [campaigns]);
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
              {nameById.get(inv.campaign) ? `${nameById.get(inv.campaign)} · ` : ""}{fmtINR(inv.amount)}{inv.generatedAt ? ` · ${new Date(inv.generatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}
            </div>
          </div>
          {inv.pdfUrl && (
            <GhostBtn onClick={() => window.open(InvoicePdfAPI.url(inv.id), "_blank")}>View PDF</GhostBtn>
          )}
        </div>
      ))}
    </div>
  );
}

// ── VENDOR ASSIGNMENT ────────────────────────────────────────────────────────
/**
 * Assigning a creator to a vendor is one field on the creator record
 * (`vendorId`), so it is an inline picker rather than a modal: the panel it
 * sits in is already the creator's billing detail, and a dialog to set a single
 * dropdown would be a whole screen to change one word.
 *
 * The list only exists once vendors do, so with none on file the control says
 * where to make one rather than opening an empty menu.
 */
function VendorAssign({ creator, vendors, onAssign }) {
  const [picking, setPicking] = useState(false);

  if (!vendors.length) {
    return <GhostBtn color={T.label} disabled title="Add a vendor on the Vendors tab first"
      style={{ cursor: "not-allowed" }}>Assign to vendor</GhostBtn>;
  }
  if (!picking) {
    return <GhostBtn color={T.gold} onClick={() => setPicking(true)}>
      {creator.vendorId ? "Change vendor" : "Assign to vendor"}
    </GhostBtn>;
  }
  return (
    <select
      autoFocus
      value={creator.vendorId || ""}
      onChange={e => { onAssign(e.target.value || null); setPicking(false); }}
      onBlur={() => setPicking(false)}
      style={{ ...INP, width: 150, padding: "3px 7px", fontSize: 10, cursor: "pointer" }}
    >
      <option value="">— No vendor —</option>
      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
    </select>
  );
}

// ── EXPANDED DETAIL ──────────────────────────────────────────────────────────
function CreatorDetail({ inf, vendor, vendors, canEdit, onEdit, onAssign }) {
  const pd = inf.personalDetails || {};
  // Where the money actually goes. A creator assigned to a vendor is invoiced
  // by that vendor and paid into the vendor's account, so showing the creator's
  // own bank details under a heading called Billing would name an account we
  // will never pay into. One rule, shared with the invoice — see lib/payee.js.
  const payee = payeeOf(inf, vendor);
  const viaVendor = payee.kind === "vendor";
  return (
    <>
      {/* Onboarding & billing details */}
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={panelTitle}>Onboarding & Billing</div>
          {canEdit && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
              <GhostBtn onClick={() => onEdit(inf)}>Edit</GhostBtn>
              <VendorAssign creator={inf} vendors={vendors} onAssign={onAssign} />
            </div>
          )}
        </div>
        {/* The creator's own contact details stay theirs either way. */}
        <Fact label="Phone"    value={inf.phone} />
        <Fact label="Email"    value={pd.email} />
        <Fact label="Address"  value={pd.address} />

        <div style={{ ...panelTitle, marginTop: 12, marginBottom: 4 }}>
          Paid to {viaVendor ? <span style={{ color: T.gold, textTransform: "none", letterSpacing: 0 }}>{payee.name}</span> : "the creator"}
        </div>
        {viaVendor && (
          <div style={{ fontSize: 10, color: T.label, marginBottom: 4, lineHeight: 1.5 }}>
            Invoiced by the vendor on this creator's behalf — details live on the Vendors tab.
          </div>
        )}
        {viaVendor && <Fact label="GSTIN" value={payee.gstin} />}
        <Fact label="PAN"      value={payee.pan} />
        <Fact label="Pay Type" value={payee.payType ? PAY_LABELS[payee.payType] || payee.payType : null} />
        {payee.payType === "upi"
          ? <Fact label="UPI ID" value={payee.upiId} />
          : <>
              <Fact label="Bank"    value={payee.bankName} />
              <Fact label="A/c No." value={payee.bankAccount} />
              <Fact label="IFSC"    value={payee.ifsc} />
            </>}
        {!viaVendor && <Fact label="Pay ID" value={inf.payId} />}
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
    </>
  );
}

// ── CREATOR CARD ─────────────────────────────────────────────────────────────
function CreatorCard({ inf, vendor, vendors, open, onToggle, canEdit, onEdit, onAssign }) {
  return (
    <Card
      open={open}
      onToggle={onToggle}
      name={inf.name}
      title={inf.name}
      avatar={<CreatorAvatar creator={inf} size={40} radius={10} />}
      subtitle={<><CreatorHandle creator={inf} style={{ fontSize: 9.5 }} />{inf.niche ? ` · ${inf.niche}` : ""}</>}
      stats={[
        { label: "Followers", value: fmtCompact(inf.followers) },
        { label: "Avg ER", value: inf.avgER != null ? `${inf.avgER}%` : "—" },
        { label: "Campaigns", value: inf.campaigns.length, color: inf.campaigns.length ? T.teal : T.label },
        { label: "Invoices", value: inf.invoices.length, color: inf.invoices.length ? T.green : T.label },
      ]}
      // Where they publish, where they are, and who bills for them — the vendor
      // is a pill rather than another dot-separated word because "Instagram ·
      // Delhi · Bright Talent" reads as three facts of the same kind, and only
      // one of them is a thing you can go and open.
      footer={<>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {inf.platform || "—"}{inf.state ? ` · ${inf.state}` : ""}
        </span>
        {vendor && <Pill color={T.gold}>{vendor.name}</Pill>}
        {inf.payType && (
          <span style={{ marginLeft: "auto" }}>
            <Pill color={T.accent}>{PAY_LABELS[inf.payType] || inf.payType}</Pill>
          </span>
        )}
      </>}
    >
      <CreatorDetail inf={inf} vendor={vendor} vendors={vendors} canEdit={canEdit} onEdit={onEdit} onAssign={onAssign} />
    </Card>
  );
}

// ── PAGE ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "creators", label: "Creators", blurb: "Every creator we work with — profiles, onboarding details and generated invoices.", placeholder: "Search name, handle, state, campaign…" },
  { id: "vendors", label: "Vendors", blurb: "The agencies and talent managers that invoice us on a creator's behalf.", placeholder: "Search vendor, contact, GSTIN, creator…" },
];

export default function Creators() {
  const { user, brandFilter } = useOutletContext() || {};
  const role = user?.role;

  const [tab, setTab] = useState("creators");
  const [creators, setCreators] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [query, setQuery]     = useState("");
  const [expanded, setExpanded] = useState(null);   // creator id
  const [editTarget, setEditTarget] = useState(null); // creator being edited (founder only)
  // null = closed · {} = add · a vendor = edit. One state for the Vendors tab's
  // only modal, so the header button and a card's Edit open the same thing.
  const [vendorModal, setVendorModal] = useState(null);
  const [toast, setToast] = useState(null);
  const showToast = useCallback(msg => { setToast(msg); setTimeout(() => setToast(null), 2800); }, []);
  const canEdit = can(role, "editCreator");

  // Optimistic update + toast-on-failure, shared by the Edit modal and the
  // vendor picker — both are a PATCH on one creator row.
  const patchCreator = useCallback((id, patch, msg) => {
    setCreators(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
    CreatorsAPI.update(id, patch)
      // The photo is the one field the optimistic pass cannot paint. What the
      // card renders is a URL built from `hasAvatar` + `avatarUpdatedAt`, and
      // both are the server's to decide — it also owns whether a platform
      // capture (`avatarSourceUrl`) actually succeeded. Folding the response
      // back in is what makes a new picture appear without a reload, and
      // `avatarUpdatedAt` moving is what busts the year-long image cache.
      // The response carries no campaigns/invoices keys, so the aggregates
      // merged over above survive.
      .then(saved => setCreators(prev => prev.map(c => (c.id === saved.id ? { ...c, ...saved } : c))))
      .catch(() => showToast("Save failed — check connection"));
    showToast(msg);
  }, [showToast]);

  // The modal returns the merged record; aggregate-only keys stay out of the PATCH.
  const saveEdit = useCallback(merged => {
    const { campaigns, invoices, ...patch } = merged;
    patchCreator(merged.id, patch, "Creator updated");
  }, [patchCreator]);

  const saveVendor = useCallback(async (vendor, editing) => {
    const saved = editing ? await VendorsAPI.update(editing.id, vendor) : await VendorsAPI.create(vendor);
    setVendors(prev => editing ? prev.map(v => (v.id === saved.id ? saved : v)) : [...prev, saved]);
    showToast(editing ? "Vendor updated" : "Vendor added");
  }, [showToast]);

  // Removing a vendor also detaches whoever pointed at it — otherwise their
  // cards would keep naming a vendor that no longer exists, and the next
  // vendor to take the same slug would silently inherit them.
  const removeVendor = useCallback(async (vendor) => {
    await VendorsAPI.remove(vendor.id);
    const orphans = creators.filter(c => c.vendorId === vendor.id);
    await Promise.all(orphans.map(c => CreatorsAPI.update(c.id, { vendorId: null })));
    setVendors(prev => prev.filter(v => v.id !== vendor.id));
    setCreators(prev => prev.map(c => (c.vendorId === vendor.id ? { ...c, vendorId: null } : c)));
    showToast(`Vendor removed${orphans.length ? ` — ${orphans.length} creator${orphans.length === 1 ? "" : "s"} unassigned` : ""}`);
  }, [creators, showToast]);

  useEffect(() => {
    if (!can(role, "seeCreators")) return;
    setLoading(true);
    setError(null);
    // Vendors aren't brand-scoped, but they load alongside the directory: both
    // tabs need both lists, and one round trip beats a second spinner.
    //
    // The vendors call degrades to empty rather than rejecting: it is a facet of
    // this page, not its subject, and an outage there must not put the whole
    // directory behind an error banner.
    Promise.all([CreatorsAPI.list(brandFilter), VendorsAPI.list().catch(() => [])])
      .then(([cs, vs]) => { setCreators(cs); setVendors(vs); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [role, brandFilter]);

  const vendorById = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return creators;
    return creators.filter(i =>
      [i.name, i.handle, i.niche, i.state, vendorById.get(i.vendorId)?.name, ...(i.campaigns || []).map(c => c.name)]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q))
    );
  }, [creators, query, vendorById]);

  // Defense in depth — the shell already hides this section from non-founders.
  if (!can(role, "seeCreators")) {
    return <div style={{ padding: 40, fontSize: 12, color: T.sub }}>This page is restricted to the founder.</div>;
  }

  const active = TABS.find(t => t.id === tab);

  return (
    <div style={{ flex: 1, overflowY: "auto", background: T.bg, padding: "26px 30px" }}>
      <style>{CARD_CSS}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontSize: 24, fontWeight: 600, color: T.text }}>
            Creators
          </div>
          <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>{active.blurb}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={active.placeholder}
            style={{ ...INP, width: 260 }}
          />
          {tab === "vendors" && canEdit && (
            <button onClick={() => setVendorModal({})} style={{
              padding: "8px 16px", borderRadius: 6, fontSize: 11.5, fontWeight: 500, fontFamily: "'Sora'",
              background: T.accent, color: "#FFF", border: `1px solid ${T.accent}`, cursor: "pointer", whiteSpace: "nowrap",
            }}>+ Add vendor</button>
          )}
        </div>
      </div>

      {/* Tabs — same underline treatment the Requests inbox uses */}
      <div style={{ display: "flex", gap: 22, borderBottom: `1px solid ${T.border}`, marginBottom: 18 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setQuery(""); }}
            style={{
              position: "relative", display: "flex", alignItems: "center", gap: 7,
              padding: "0 0 9px", background: "transparent", border: "none", cursor: "pointer",
              fontFamily: "'Sora'", fontSize: 12, letterSpacing: "-0.01em", marginBottom: -1,
              fontWeight: tab === t.id ? 600 : 400, color: tab === t.id ? T.text : T.sub,
              transition: "color 0.15s",
            }}>
            {t.label}
            <Pill color={tab === t.id ? T.accent : T.label}>{t.id === "creators" ? creators.length : vendors.length}</Pill>
            {tab === t.id && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, borderRadius: 1, background: T.accent }} />}
          </button>
        ))}
      </div>

      {/* States */}
      {loading && <Notice>Loading creators…</Notice>}
      {error && !loading && <Notice tone="error">Could not load creators from the backend: {error}</Notice>}

      {!loading && !error && tab === "creators" && (
        visible.length === 0
          ? <Notice tone="empty">{query ? "No creators match your search." : "No creators in the directory yet."}</Notice>
          : (
            <CardGrid>
              {visible.map(inf => (
                <CreatorCard
                  key={inf.id}
                  inf={inf}
                  vendor={vendorById.get(inf.vendorId)}
                  vendors={vendors}
                  open={expanded === inf.id}
                  onToggle={() => setExpanded(expanded === inf.id ? null : inf.id)}
                  canEdit={canEdit}
                  onEdit={setEditTarget}
                  onAssign={vendorId => patchCreator(inf.id, { vendorId },
                    vendorId ? `Assigned to ${vendorById.get(vendorId)?.name}` : "Vendor cleared")}
                />
              ))}
            </CardGrid>
          )
      )}

      {!loading && !error && tab === "vendors" && (
        <VendorsPanel
          vendors={vendors}
          creators={creators}
          query={query}
          canEdit={canEdit}
          onSave={saveVendor}
          onRemove={removeVendor}
          modal={vendorModal}
          onModal={setVendorModal}
        />
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
