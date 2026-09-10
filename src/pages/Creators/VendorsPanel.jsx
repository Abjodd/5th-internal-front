/**
 * 5th Avenue — Creators › Vendors
 * ─────────────────────────────────────────────────────────────────
 * The agencies and talent managers that invoice us on a creator's behalf.
 * A vendor record holds the billing identity (GSTIN/PAN) and the account we
 * settle it into; who belongs to it is read off `creator.vendorId`, so each
 * card's roster is derived from the directory the page already loaded and can
 * never disagree with it.
 *
 * Vendors are not brand-scoped — the same manager fronts creators across
 * brands — so the top-bar brand filter deliberately doesn't narrow this tab.
 */
import { useMemo, useState } from "react";
import { initials } from "../../lib/format";
import { sanitizeField, validateCreatorDetails, validateField } from "../../lib/validators";
import CreatorAvatar from "../../components/CreatorAvatar";
import CreatorHandle from "../../components/CreatorHandle";
import PhoneInput from "../../components/PhoneInput";
import { T } from "../../theme/tokens";
import { Card, CardGrid, Fact, GhostBtn, INP, Notice, PAY_LABELS, Pill, panel, panelTitle } from "./shared";

// A vendor is paid the same two ways a creator is, minus "vendor" itself —
// which would only point back here.
const VENDOR_PAY_TYPES = [
  { id: "", label: "— Select —" },
  { id: "net_banking", label: "Net Banking" },
  { id: "upi", label: "UPI" },
];

// Field name → validator kind, for the live per-keystroke checks. Same shape as
// the creator modal's FIELD_SANITIZE; `gstin` is the one a creator never has.
const FIELD_SANITIZE = { phone: "phone", email: "email", pan: "pan", gstin: "gstin", ifsc: "ifsc", bankAccount: "account", upiId: "upi" };

const BANK_FIELDS = [
  ["Bank Name", "bankName", "e.g. Canara Bank"],
  ["Account No.", "bankAccount", "e.g. 110074028985"],
  ["Branch", "bankBranch", "e.g. Basavangudi"],
  ["IFS Code", "ifsc", "e.g. CNRB0000684"],
];

// The id is the name slugged, exactly like a brand's (see onCreateBrand on the
// Auth page): one readable key, and the backend's unique index turns a repeat
// of a name into a 409 rather than two vendors nobody can tell apart.
const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// The form's own fields, and the whole of what a vendor is. Doubles as the
// filter for `editing` below: a record also carries id/createdAt/updatedAt, and
// spreading it wholesale would send those back in the PATCH body for Mongo to
// $set onto the document beside the fields that actually changed.
const BLANK = {
  name: "", contact: "", phone: "", email: "", gstin: "", pan: "", address: "",
  payType: "", bankName: "", bankAccount: "", bankBranch: "", ifsc: "", upiId: "", notes: "",
};

const Lbl = ({ children }) => (
  <label style={{
    display: "block", fontSize: 9, fontWeight: 600, color: T.label,
    textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4,
  }}>{children}</label>
);

// ── ADD / EDIT MODAL ─────────────────────────────────────────────────────────
// `editing` = existing vendor (id fixed) vs null = create.
function VendorModal({ editing, onClose, onSave, onRemove }) {
  const [f, setF] = useState(() =>
    Object.fromEntries(Object.entries(BLANK).map(([k, v]) => [k, editing?.[k] ?? v])));
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  // Removing is destructive and sits inches from Save, so it arms first. A
  // second dialog stacked on this one would be the heavier answer to the same
  // problem — see ConfirmDialog in pages/Requests for where that is worth it.
  const [armed, setArmed] = useState(false);

  const u = (k, v) => {
    const clean = FIELD_SANITIZE[k] ? sanitizeField(FIELD_SANITIZE[k], v) : v;
    setF(p => ({ ...p, [k]: clean }));
    setErrors(p => ({ ...p, [k]: FIELD_SANITIZE[k] ? validateField(FIELD_SANITIZE[k], clean) : null }));
    setErr("");
  };
  const Err = ({ k }) => errors[k] ? <div style={{ fontSize: 9.5, color: T.red, marginTop: 3 }}>{errors[k]}</div> : null;
  const field = (k) => ({ value: f[k], onChange: e => u(k, e.target.value), style: { ...INP, width: "100%", boxSizing: "border-box", borderColor: errors[k] ? T.red : T.border } });

  const submit = async () => {
    if (!f.name.trim()) return setErr("Vendor name is required.");
    // Only the chosen payType's account fields are mandatory; everything else
    // just has to be well-formed if it was filled in.
    const errs = validateCreatorDetails(f, f.payType === "upi" ? ["upiId"] : f.payType === "net_banking" ? ["bankName", "bankAccount", "ifsc"] : []);
    setErrors(errs);
    if (Object.keys(errs).length) return setErr("Fix the highlighted fields.");
    setSaving(true);
    try {
      // The id is assigned once, on create: a vendor's key is fixed, and sending
      // it on an edit would only be a field for Mongo to write back over itself.
      const payload = { ...f, name: f.name.trim() };
      await onSave(editing ? payload : { ...payload, id: slugOf(payload.name) }, editing);
      onClose();
    } catch (e) {
      setErr(e.status === 409 ? "A vendor with this name already exists." : `Save failed: ${e.message}`);
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(4,5,10,0.55)", backdropFilter: "blur(4px)" }} />
      <div style={{ position: "relative", width: "min(460px,94vw)", maxHeight: "88vh", background: T.surface, border: `1px solid ${T.borderMid}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: T.shadowLg }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'Newsreader',serif", fontSize: 17, color: T.text, fontStyle: "italic" }}>
            {editing ? `Edit — ${editing.name}` : "Add vendor"}
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: T.sub, fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
          <div style={{ marginBottom: 12 }}>
            <Lbl>Vendor name <span style={{ color: T.red }}>*</span></Lbl>
            <input {...field("name")} placeholder="e.g. Bright Talent Media LLP" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <Lbl>Contact person</Lbl>
              <input {...field("contact")} placeholder="Who we deal with" />
            </div>
            <div>
              <Lbl>Phone</Lbl>
              <PhoneInput value={f.phone} onChange={v => u("phone", v)} style={{ ...INP, width: "100%", boxSizing: "border-box", borderColor: errors.phone ? T.red : T.border }} />
              <Err k="phone" />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Lbl>Email</Lbl>
            <input {...field("email")} placeholder="billing@vendor.com" /><Err k="email" />
          </div>

          <div style={{ ...panelTitle, marginTop: 16 }}>Billing identity</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <Lbl>GSTIN</Lbl>
              <input {...field("gstin")} placeholder="29ABCDE1234F1Z5" /><Err k="gstin" />
            </div>
            <div>
              <Lbl>PAN</Lbl>
              <input {...field("pan")} placeholder="ABCDE1234F" /><Err k="pan" />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Lbl>Address</Lbl>
            <textarea {...field("address")} rows={2} placeholder="Registered address (for invoices)" />
          </div>

          <div style={{ ...panelTitle, marginTop: 16 }}>Payment details</div>
          <div style={{ marginBottom: 12 }}>
            <Lbl>Pay type</Lbl>
            <select {...field("payType")} style={{ ...INP, width: "100%", boxSizing: "border-box", cursor: "pointer" }}>
              {VENDOR_PAY_TYPES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          {f.payType === "upi" && (
            <div style={{ marginBottom: 12 }}>
              <Lbl>UPI ID</Lbl>
              <input {...field("upiId")} placeholder="name@okhdfcbank" /><Err k="upiId" />
            </div>
          )}
          {f.payType === "net_banking" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              {BANK_FIELDS.map(([l, k, ph]) => (
                <div key={k}><Lbl>{l}</Lbl><input {...field(k)} placeholder={ph} /><Err k={k} /></div>
              ))}
            </div>
          )}
          <div style={{ marginBottom: 4 }}>
            <Lbl>Notes</Lbl>
            <textarea {...field("notes")} rows={2} placeholder="Payment terms, TDS treatment, anything worth remembering" />
          </div>
          {err && <div style={{ fontSize: 11, color: T.red, marginTop: 10 }}>{err}</div>}
        </div>

        <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, alignItems: "center" }}>
          <GhostBtn onClick={onClose} color={T.sub} style={{ fontSize: 11.5, padding: "8px 16px" }}>Cancel</GhostBtn>
          {editing && (
            <GhostBtn
              color={T.red}
              style={{ fontSize: 11.5, padding: "8px 16px", ...(armed ? { background: T.red, color: "#FFF" } : {}) }}
              onClick={() => armed ? onRemove(editing).then(onClose) : setArmed(true)}
            >{armed ? "Confirm remove" : "Remove"}</GhostBtn>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={submit} disabled={saving} style={{
            padding: "8px 16px", borderRadius: 6, fontSize: 11.5, fontWeight: 500, fontFamily: "'Sora'",
            background: T.accent, color: "#FFF", border: `1px solid ${T.accent}`,
            cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1,
          }}>{saving ? "Saving…" : editing ? "Save changes" : "Add vendor"}</button>
        </div>
      </div>
    </div>
  );
}

// ── VENDOR CARD ──────────────────────────────────────────────────────────────
function VendorCard({ vendor, creators, open, onToggle, canEdit, onEdit }) {
  // Campaigns and invoices are the vendor's reach, summed off the creators it
  // fronts — a campaign booking two of them is still one campaign.
  const campaigns = new Set(creators.flatMap(c => (c.campaigns || []).map(x => x.id))).size;
  const invoices = creators.reduce((n, c) => n + (c.invoices || []).length, 0);

  return (
    <Card
      open={open}
      onToggle={onToggle}
      name={vendor.name}
      title={vendor.name}
      subtitle={[vendor.contact, vendor.email].filter(Boolean).join(" · ") || "No contact on file"}
      avatar={
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: `${T.gold}16`, color: T.gold,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 600,
        }}>{initials(vendor.name)}</div>
      }
      stats={[
        { label: "Creators", value: creators.length, color: creators.length ? T.gold : T.label },
        { label: "Campaigns", value: campaigns, color: campaigns ? T.teal : T.label },
        { label: "Invoices", value: invoices, color: invoices ? T.green : T.label },
      ]}
      footer={<>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {vendor.gstin || "No GSTIN"}
        </span>
        {vendor.payType && (
          <span style={{ marginLeft: "auto" }}>
            <Pill color={T.accent}>{PAY_LABELS[vendor.payType] || vendor.payType}</Pill>
          </span>
        )}
      </>}
    >
      {/* Billing & payment */}
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={panelTitle}>Billing & Payment</div>
          {canEdit && <GhostBtn onClick={() => onEdit(vendor)}>Edit</GhostBtn>}
        </div>
        <Fact label="Contact" value={vendor.contact} />
        <Fact label="Phone" value={vendor.phone} />
        <Fact label="Email" value={vendor.email} />
        <Fact label="GSTIN" value={vendor.gstin} />
        <Fact label="PAN" value={vendor.pan} />
        <Fact label="Address" value={vendor.address} />
        <Fact label="Pay Type" value={vendor.payType ? PAY_LABELS[vendor.payType] || vendor.payType : null} />
        {vendor.payType === "upi"
          ? <Fact label="UPI ID" value={vendor.upiId} />
          : <>
              <Fact label="Bank" value={vendor.bankName} />
              <Fact label="A/c No." value={vendor.bankAccount} />
              <Fact label="IFSC" value={vendor.ifsc} />
            </>}
        {vendor.notes && <Fact label="Notes" value={vendor.notes} />}
      </div>

      {/* Who this vendor fronts — derived from creator.vendorId, never stored. */}
      <div style={{ ...panel, flex: 1.4 }}>
        <div style={panelTitle}>Creators ({creators.length})</div>
        {creators.length === 0 && (
          <div style={{ fontSize: 10.5, color: T.label, fontStyle: "italic" }}>
            No creators assigned yet — assign them from a creator's card on the Creators tab.
          </div>
        )}
        {creators.map((c, i) => (
          <div key={c.id} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "7px 0",
            borderBottom: i < creators.length - 1 ? `1px solid ${T.border}` : "none",
          }}>
            <CreatorAvatar creator={c} size={26} radius={7} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 500, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
              <div style={{ fontSize: 9.5, color: T.sub }}>
                <CreatorHandle creator={c} style={{ fontSize: 9.5 }} />{c.platform ? ` · ${c.platform}` : ""}
              </div>
            </div>
            <Pill color={(c.campaigns || []).length ? T.teal : T.label}>
              {(c.campaigns || []).length} campaign{(c.campaigns || []).length === 1 ? "" : "s"}
            </Pill>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── PANEL ────────────────────────────────────────────────────────────────────
export default function VendorsPanel({ vendors, creators, query, canEdit, onSave, onRemove, modal, onModal }) {
  // One pass over the directory keyed by vendor, rather than a filter per card.
  const creatorsByVendor = useMemo(() => {
    const map = new Map();
    for (const c of creators) {
      if (!c.vendorId) continue;
      map.set(c.vendorId, [...(map.get(c.vendorId) || []), c]);
    }
    return map;
  }, [creators]);

  const [expanded, setExpanded] = useState(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter(v =>
      [v.name, v.contact, v.email, v.gstin, v.pan, ...(creatorsByVendor.get(v.id) || []).map(c => c.name)]
        .filter(Boolean).some(s => String(s).toLowerCase().includes(q))
    );
  }, [vendors, query, creatorsByVendor]);

  return (
    <>
      {/* The empty state sits INSIDE this fragment, not in an early return:
          "no vendors yet" is precisely when the Add modal needs to render. */}
      {!visible.length && (
        <Notice tone="empty">
          {query ? "No vendors match your search." : "No vendors yet — add the first one above."}
        </Notice>
      )}
      <CardGrid>
        {visible.map(v => (
          <VendorCard
            key={v.id}
            vendor={v}
            creators={creatorsByVendor.get(v.id) || []}
            open={expanded === v.id}
            onToggle={() => setExpanded(expanded === v.id ? null : v.id)}
            canEdit={canEdit}
            onEdit={onModal}
          />
        ))}
      </CardGrid>
      {modal && (
        <VendorModal
          editing={modal.id ? modal : null}
          onClose={() => onModal(null)}
          onSave={onSave}
          onRemove={onRemove}
        />
      )}
    </>
  );
}
