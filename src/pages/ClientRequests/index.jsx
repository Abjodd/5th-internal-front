/**
 * 5th Avenue — Client Requests (founder-only)
 * ─────────────────────────────────────────────────────────────────
 * Inbox of brand signups from the public "Start a project" landing page
 * (hosted separately — it POSTs to /api/client-requests)
 * All data comes from GET /api/client-requests. The founder triages each
 * lead by status (new → reviewed → contacted → archived); PATCH persists it.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { ClientRequestsAPI, ClientsAPI, BrandCredentialsAPI } from "../../lib/api";
import { can } from "../../lib/rbac";
import { T } from "../../theme/tokens";

// ── STYLE HELPERS (mirrors the Creators directory) ───────────────────────────
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

// Triage statuses in workflow order, each with its pill colour.
const STATUS = [
  { id: "new",       label: "New",       color: T.accent },
  { id: "reviewed",  label: "Reviewed",  color: T.amber },
  { id: "contacted", label: "Contacted", color: T.green },
  { id: "archived",  label: "Archived",  color: T.sub },
];
const statusMeta = (id) => STATUS.find(s => s.id === id) || STATUS[0];

const Av = ({ name }) => (
  <div style={{
    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
    background: `${T.gold}16`, color: T.gold,
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

// createdAt is a full ISO datetime (Mongoose timestamps), so format it here
// rather than lib/format.prettyDate (which only handles "YYYY-MM-DD").
const fmtWhen = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

// One label/value line in the expanded detail panel.
const Fact = ({ label, value }) => (
  <div style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 11 }}>
    <span style={{ color: T.label, width: 104, flexShrink: 0 }}>{label}</span>
    <span style={{ color: value ? T.text : T.label }}>{value || "—"}</span>
  </div>
);

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
      onCreated(created);
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
  return (
    <div style={{ display: "flex", gap: 12, padding: "14px 14px 16px", flexWrap: "wrap", background: T.raised }}>
      <div style={{
        flex: 2, minWidth: 260, background: T.surface,
        border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "12px 14px",
      }}>
        <div style={{ fontSize: 9, fontWeight: 600, color: T.label, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
          What they want
        </div>
        <div style={{ fontSize: 12, color: req.goal ? T.text : T.label, lineHeight: 1.6, fontStyle: req.goal ? "normal" : "italic" }}>
          {req.goal || "No details provided."}
        </div>
      </div>
      <div style={{
        flex: 1, minWidth: 220, background: T.surface,
        border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "12px 14px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: T.label, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            Contact
          </div>
          {req.credentialsGenerated ? (
            <Pill color={T.green}>Credentials issued</Pill>
          ) : (
            <button onClick={onGenerateCredentials} style={{
              fontSize: 9.5, color: T.accent, background: "transparent",
              border: `1px solid ${T.accent}30`, borderRadius: 4, padding: "3px 10px",
              cursor: "pointer", fontFamily: "'Sora'",
            }}>
              Generate credentials
            </button>
          )}
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

// ── PAGE ─────────────────────────────────────────────────────────────────────
export default function ClientRequests() {
  const { user, brands = [], refreshBrands } = useOutletContext() || {};
  const role = user?.role;

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [query, setQuery]     = useState("");
  const [expanded, setExpanded] = useState(null); // request id
  const [credModal, setCredModal] = useState(null); // request pending credential generation
  const [toast, setToast] = useState(null);
  const showToast = useCallback(msg => { setToast(msg); setTimeout(() => setToast(null), 2800); }, []);

  // Same slug scheme as the Auth page's inline "Add new brand…" flow.
  const onCreateBrand = useCallback(async (name) => {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const created = await ClientsAPI.create({ id, name });
    refreshBrands?.();
    return { id: created.id, name: created.name };
  }, [refreshBrands]);

  // A generated login also counts as the lead having been acted on — mark it
  // reviewed/contacted-equivalent via a dedicated flag so re-triaging status
  // doesn't hide the "already issued" badge.
  const onCredentialsCreated = useCallback((req) => {
    setRequests(prev => prev.map(r => (r.id === req.id ? { ...r, credentialsGenerated: true } : r)));
    ClientRequestsAPI.update(req.id, { credentialsGenerated: true }).catch(() => {});
    showToast(`Login created for ${req.name || req.organisation}`);
  }, [showToast]);

  // Optimistic status change + toast-on-failure, same pattern as Creators.
  const setStatus = useCallback((id, status) => {
    setRequests(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));
    ClientRequestsAPI.update(id, { status }).catch(() => showToast("Save failed — check connection"));
    showToast(`Marked ${statusMeta(status).label.toLowerCase()}`);
  }, [showToast]);

  useEffect(() => {
    if (!can(role, "seeClientRequests")) return;
    setLoading(true);
    setError(null);
    ClientRequestsAPI.list()
      .then(list => setRequests(list))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [role]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = !q ? requests : requests.filter(r =>
      [r.name, r.organisation, r.contact, r.headquarters, r.role, r.goal]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q))
    );
    // Newest signup first. The API already sorts this way (createdAt: -1),
    // but re-sorting here keeps the order correct even if a status update
    // reshuffles `requests` or the API contract ever changes.
    return matched.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [requests, query]);

  // Defense in depth — the shell already hides this section from non-founders.
  if (!can(role, "seeClientRequests")) {
    return <div style={{ padding: 40, fontSize: 12, color: T.sub }}>This page is restricted to the founder.</div>;
  }

  const newCount = requests.filter(r => r.status === "new").length;

  return (
    <div style={{ flex: 1, overflowY: "auto", background: T.bg, padding: "26px 30px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontSize: 24, fontWeight: 600, color: T.text }}>
            Client Requests
            {newCount > 0 && <span style={{ marginLeft: 10 }}><Pill color={T.accent}>{newCount} new</Pill></span>}
          </div>
          <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>
            Brand signups from the landing page — who they are and what they want from us.
          </div>
        </div>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search brand, name, contact, goal…"
          style={{ ...INP, width: 260 }}
        />
      </div>

      {/* States */}
      {loading && <div style={{ padding: 40, fontSize: 12, color: T.sub, textAlign: "center" }}>Loading client requests…</div>}
      {error && !loading && (
        <div style={{ padding: "14px 16px", background: `${T.red}0C`, border: `1px solid ${T.red}30`, borderRadius: T.radiusSm, fontSize: 11.5, color: T.red }}>
          Could not load client requests from the backend: {error}
        </div>
      )}
      {!loading && !error && visible.length === 0 && (
        <div style={{ padding: 40, fontSize: 12, color: T.label, textAlign: "center", fontStyle: "italic" }}>
          {query ? "No requests match your search." : "No client requests yet — signups from the landing page will appear here."}
        </div>
      )}

      {/* Table */}
      {!loading && !error && visible.length > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, boxShadow: T.shadow, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS}>Brand</th>
                <th style={thS}>Role</th>
                <th style={thS}>Contact</th>
                <th style={thS}>Headquarters</th>
                <th style={thS}>Received</th>
                <th style={thS}>Status</th>
                <th style={{ ...thS, width: 34 }} />
              </tr>
            </thead>
            <tbody>
              {visible.map(req => {
                const open = expanded === req.id;
                const meta = statusMeta(req.status);
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
                        <Av name={req.organisation || req.name} />
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
                    <td style={tdS} onClick={e => e.stopPropagation()}>
                      <select
                        value={req.status || "new"}
                        onChange={e => setStatus(req.id, e.target.value)}
                        style={{
                          ...INP, padding: "4px 8px", fontSize: 10.5, cursor: "pointer",
                          color: meta.color, borderColor: `${meta.color}40`, background: `${meta.color}0C`,
                        }}
                      >
                        {STATUS.map(s => <option key={s.id} value={s.id} style={{ color: T.text }}>{s.label}</option>)}
                      </select>
                    </td>
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
                  <tr key={`${req.id}_detail`}>
                    <td colSpan={7} style={{ padding: 0, border: "none", borderBottom: open ? `1px solid ${T.border}` : "none" }}>
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
                            <RequestDetail req={req} onGenerateCredentials={() => setCredModal(req)} />
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

      {credModal && (
        <GenerateCredentialsModal
          req={credModal}
          brands={brands}
          onClose={() => setCredModal(null)}
          onCreated={onCredentialsCreated}
          onCreateBrand={onCreateBrand}
        />
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, padding: "11px 18px", background: "rgba(29,29,31,0.92)", backdropFilter: "blur(16px)", borderRadius: 12, fontSize: 12, color: "#FFFFFF", fontFamily: "'Sora'", boxShadow: "0 8px 32px rgba(0,0,0,0.24)", letterSpacing: "-0.01em" }}>{toast}</div>
      )}
    </div>
  );
}
