/**
 * 5th Avenue — Requests › Client Requests
 * ─────────────────────────────────────────────────────────────────
 * Inbox of brand signups from the public "Start a project" landing page
 * (hosted separately — it POSTs to /api/client-requests). No triage status —
 * a request is either sitting here pending, or it's been turned into an
 * actual Brand Portal login and removed (see onCredentialsCreated below).
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { ClientRequestsAPI, ClientsAPI, BrandCredentialsAPI } from "../../lib/api";
import { T } from "../../theme/tokens";
import { thS, tdS, INP, Av, Fact, Chevron, Expandable, fmtWhen, Notice } from "./shared";

const Lbl = ({ children }) => (
  <label style={{
    display: "block", fontSize: 9, fontWeight: 600, color: T.label,
    textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4,
  }}>{children}</label>
);
const Btn = ({ variant = "ghost", disabled, onClick, children }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: "8px 16px", borderRadius: 6, fontSize: 11.5, fontWeight: 500,
    fontFamily: "'Sora'", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1, transition: "all 0.12s",
    ...(variant === "primary"
      ? { background: T.accent, color: "#FFF", border: `1px solid ${T.accent}` }
      : { background: "transparent", color: T.sub, border: `1px solid ${T.border}` }),
  }}>{children}</button>
);

// Random 12-char password — mixed case + digits + one symbol, good enough
// for a founder-issued initial credential (the member resets it on first login).
function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let pw = Array.from({ length: 11 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  pw += "!#$%@*"[Math.floor(Math.random() * 6)];
  return pw;
}

// ── GENERATE CREDENTIALS MODAL ────────────────────────────────────────────────
// Turns a triaged lead into an actual Brand Portal login: resolves (or creates)
// the Client doc for req.organisation, then creates a BrandCredential the same
// way the founder-only Auth page does. Mirrors CredentialModal's new-brand
// staging pattern so nothing is written until the founder actually submits.
function GenerateCredentialsModal({ req, brands, onClose, onCreated, onCreateBrand }) {
  const existingBrand = brands.find(b => b.name.toLowerCase() === (req.organisation || "").trim().toLowerCase());
  const [form, setForm] = useState({
    name: req.name || "",
    title: req.role || "",
    username: (req.contact || "").includes("@") ? req.contact.trim() : "",
    password: genPassword(),
    brandId: existingBrand?.id || "__new__",
  });
  const [newBrandName, setNewBrandName] = useState(existingBrand ? "" : (req.organisation || ""));
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const u = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErr(""); };

  const submit = async () => {
    if (!form.username.trim())  return setErr("Username (login email) is required.");
    if (!form.name.trim())      return setErr("Name is required.");
    if (!form.password)         return setErr("Password is required.");
    const brandName = newBrandName.trim();
    if (form.brandId === "__new__" && !brandName) return setErr("Enter a brand name, or pick an existing brand.");
    setSaving(true);
    try {
      let brandId = form.brandId;
      if (brandId === "__new__") {
        const created = await onCreateBrand(brandName);
        brandId = created.id;
      }
      const avatar = form.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
      const created = await BrandCredentialsAPI.create({
        avatar, username: form.username.trim().toLowerCase(), name: form.name,
        title: form.title, password: form.password, brandId,
      });
      // Pass the original request alongside the new credential — `created`
      // is a BrandCredential (id "bc3"), not the ClientRequest ("cr5"), so
      // the caller needs `req` to know which request to remove.
      onCreated(req, created);
      onClose();
    } catch (e) {
      setErr(String(e.message).includes("409") ? "That username already exists." : `Save failed: ${e.message}`);
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(4,5,10,0.55)", backdropFilter: "blur(4px)" }} />
      <div style={{ position: "relative", width: "min(440px,94vw)", maxHeight: "88vh", background: T.surface, border: `1px solid ${T.borderMid}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: T.shadowLg }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'Newsreader',serif", fontSize: 17, color: T.text, fontStyle: "italic" }}>
            Generate credentials — {req.name || req.organisation}
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: T.sub, fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <Lbl>Name</Lbl>
              <input value={form.name} onChange={e => u("name", e.target.value)} placeholder="Full name" style={{ ...INP, width: "100%", boxSizing: "border-box" }} />
            </div>
            <div>
              <Lbl>Title</Lbl>
              <input value={form.title} onChange={e => u("title", e.target.value)} placeholder="e.g. Marketing Head" style={{ ...INP, width: "100%", boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Lbl>Username (login email)</Lbl>
            <input value={form.username} onChange={e => u("username", e.target.value)} placeholder="name@brand.com" style={{ ...INP, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <Lbl>Brand</Lbl>
            <select value={form.brandId} onChange={e => u("brandId", e.target.value)} style={{ ...INP, width: "100%", boxSizing: "border-box", cursor: "pointer" }}>
              <option value="">— Select brand —</option>
              {brands.slice().sort((a, b) => a.name.localeCompare(b.name)).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              <option value="__new__">+ New brand{req.organisation ? ` — ${req.organisation}` : ""}</option>
            </select>
            {form.brandId === "__new__" && (
              <input value={newBrandName} onChange={e => setNewBrandName(e.target.value)} placeholder="Brand name" style={{ ...INP, width: "100%", boxSizing: "border-box", marginTop: 8 }} />
            )}
          </div>
          <div style={{ marginBottom: 4 }}>
            <Lbl>Password</Lbl>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={form.password} onChange={e => u("password", e.target.value)} style={{ ...INP, flex: 1, fontFamily: "monospace" }} />
              <Btn onClick={() => u("password", genPassword())}>Regenerate</Btn>
            </div>
            <div style={{ fontSize: 9.5, color: T.label, marginTop: 5 }}>
              Auto-generated — share it with the member however you prefer. Stored as a hash plus an encrypted copy for founder reveal.
            </div>
          </div>
          {err && <div style={{ fontSize: 11, color: T.red, marginTop: 10 }}>{err}</div>}
        </div>

        <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <div style={{ flex: 1 }} />
          <Btn variant="primary" onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create login"}</Btn>
        </div>
      </div>
    </div>
  );
}

// ── EXPANDED ROW — full goal text + contact recap ────────────────────────────
function RequestDetail({ req, onGenerateCredentials }) {
  const card = {
    background: T.surface, border: `1px solid ${T.border}`,
    borderRadius: T.radiusSm, padding: "12px 14px",
  };
  const title = {
    fontSize: 9, fontWeight: 600, color: T.label,
    textTransform: "uppercase", letterSpacing: "0.07em",
  };
  return (
    <div style={{ display: "flex", gap: 12, padding: "14px 14px 16px", flexWrap: "wrap", background: T.raised }}>
      <div style={{ ...card, flex: 2, minWidth: 260 }}>
        <div style={{ ...title, marginBottom: 8 }}>What they want</div>
        <div style={{ fontSize: 12, color: req.goal ? T.text : T.label, lineHeight: 1.6, fontStyle: req.goal ? "normal" : "italic" }}>
          {req.goal || "No details provided."}
        </div>
      </div>
      <div style={{ ...card, flex: 1, minWidth: 220 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={title}>Contact</div>
          {/* Once credentials are generated the request is removed from the
              list entirely (see onCredentialsCreated), so this button never
              needs a "done" state — it's gone by the time that would show. */}
          <button onClick={onGenerateCredentials} style={{
            fontSize: 9.5, color: T.accent, background: "transparent",
            border: `1px solid ${T.accent}30`, borderRadius: 4, padding: "3px 10px",
            cursor: "pointer", fontFamily: "'Sora'",
          }}>
            Generate credentials
          </button>
        </div>
        <Fact label="Name"         value={req.name} />
        <Fact label="Role"         value={req.role} />
        <Fact label="Email/Phone"  value={req.contact} />
        <Fact label="Organisation" value={req.organisation} />
        <Fact label="Headquarters" value={req.headquarters} />
        <Fact label="Received"     value={fmtWhen(req.createdAt)} />
      </div>
    </div>
  );
}

export default function ClientRequestsPanel({ query, showToast, onCount }) {
  const { brands = [], refreshBrands } = useOutletContext() || {};

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [expanded, setExpanded] = useState(null); // request id
  const [credModal, setCredModal] = useState(null); // request pending credential generation

  useEffect(() => {
    setLoading(true);
    setError(null);
    ClientRequestsAPI.list()
      .then(setRequests)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Pending count for the tab badge — every request in the list is pending
  // by definition (it's removed once credentials are generated), so this is
  // just the list length. Reported up rather than lifted, so this panel
  // stays the only owner of its list.
  useEffect(() => {
    onCount?.(requests.length);
  }, [requests, onCount]);

  // Same slug scheme as the Auth page's inline "Add new brand…" flow.
  const onCreateBrand = useCallback(async (name) => {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const created = await ClientsAPI.create({ id, name });
    refreshBrands?.();
    return { id: created.id, name: created.name };
  }, [refreshBrands]);

  // The request has done its job once a login exists for it — it's removed
  // rather than flagged, mirroring the creator-request promote flow. `req` is
  // the original ClientRequest ("cr5"); `credential` is the just-created
  // BrandCredential ("bc3") — two different ids, don't mix them up.
  const onCredentialsCreated = useCallback((req, credential) => {
    setRequests(prev => prev.filter(r => r.id !== req.id));
    ClientRequestsAPI.remove(req.id).catch(() => {});
    showToast(`Login created for ${credential?.name || req.name || req.organisation}`);
  }, [showToast]);

  const visible = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    const matched = !q ? requests : requests.filter(r =>
      [r.name, r.organisation, r.contact, r.headquarters, r.role, r.goal]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q))
    );
    // Newest signup first. The API already sorts this way (createdAt: -1),
    // but re-sorting here keeps the order correct even if the list ever
    // reshuffles for another reason.
    return matched.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [requests, query]);

  if (loading) return <Notice>Loading client requests…</Notice>;
  if (error)   return <Notice tone="error">Could not load client requests: {error}</Notice>;
  if (!visible.length) return (
    <Notice tone="empty">
      {query ? "No requests match your search."
        : "No client requests yet — signups from the landing page will appear here."}
    </Notice>
  );

  return (
    <>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, boxShadow: T.shadow, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thS}>Brand</th>
              <th style={thS}>Role</th>
              <th style={thS}>Contact</th>
              <th style={thS}>Headquarters</th>
              <th style={thS}>Received</th>
              <th style={{ ...thS, width: 34 }} />
            </tr>
          </thead>
          <tbody>
            {visible.map(req => {
              const open = expanded === req.id;
              return [
                <tr
                  key={req.id}
                  onClick={() => setExpanded(open ? null : req.id)}
                  style={{ cursor: "pointer", background: open ? T.raised : "transparent", transition: "background 0.2s ease" }}
                  onMouseOver={e => { if (!open) e.currentTarget.style.background = T.hover; }}
                  onMouseOut={e => { if (!open) e.currentTarget.style.background = "transparent"; }}
                >
                  <td style={tdS}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Av name={req.organisation || req.name} color={T.gold} />
                      <div>
                        <div style={{ fontWeight: 500 }}>{req.organisation || "—"}</div>
                        <div style={{ fontSize: 9.5, color: T.sub }}>{req.name || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td style={tdS}>{req.role || "—"}</td>
                  <td style={tdS}>{req.contact || "—"}</td>
                  <td style={tdS}>{req.headquarters || "—"}</td>
                  <td style={tdS}>{fmtWhen(req.createdAt)}</td>
                  <td style={{ ...tdS, fontSize: 10 }}><Chevron open={open} /></td>
                </tr>,
                <tr key={`${req.id}_detail`}>
                  <td colSpan={6} style={{ padding: 0, border: "none", borderBottom: open ? `1px solid ${T.border}` : "none" }}>
                    <Expandable open={open}>
                      <RequestDetail req={req} onGenerateCredentials={() => setCredModal(req)} />
                    </Expandable>
                  </td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>

      {credModal && (
        <GenerateCredentialsModal
          req={credModal}
          brands={brands}
          onClose={() => setCredModal(null)}
          onCreated={onCredentialsCreated}
          onCreateBrand={onCreateBrand}
        />
      )}
    </>
  );
}
