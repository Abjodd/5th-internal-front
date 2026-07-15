/**
 * 5th Avenue — Access & Credentials (founder-only)
 * ─────────────────────────────────────────────────────────────────
 * The founder's view of every login in the system:
 *   · Internal — platform users (pcm, cm, am, ea, accounts…) from /api/users
 *   · Brand Portal — external client logins from /api/brand-credentials,
 *     each mapped to a brandId (= Client._id)
 *
 * The DB stores { id, username, hashKey } — hashKey is sha256(password),
 * so the actual password can never be displayed; the hash is shown instead
 * (reveal + copy). Founder can add new users, edit existing ones (including
 * a password reset, re-hashed server-side) and remove them (soft delete —
 * the doc stays in Mongo with deleted:true and login is blocked).
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { UsersAPI, BrandCredentialsAPI } from "../../lib/api";
import { can } from "../../lib/rbac";
import { PLATFORM_ROLES } from "../../routes/sections";
import { T } from "../../theme/tokens";

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
  width: "100%", padding: "8px 10px", borderRadius: 5, background: T.surface,
  border: `1px solid ${T.border}`, color: T.text, fontSize: 11.5,
  fontFamily: "'Sora'", outline: "none", boxSizing: "border-box",
};
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
      : variant === "danger"
      ? { background: T.red, color: "#FFF", border: `1px solid ${T.red}` }
      : { background: "transparent", color: T.sub, border: `1px solid ${T.border}` }),
  }}>{children}</button>
);
const Pill = ({ children, color = T.sub }) => (
  <span style={{
    display: "inline-block", padding: "2px 8px", borderRadius: 10,
    fontSize: 9.5, fontWeight: 500, color, background: `${color}14`,
    border: `1px solid ${color}28`, whiteSpace: "nowrap",
  }}>{children}</span>
);

const roleLabel = id => PLATFORM_ROLES.find(r => r.id === id)?.label || id;

// ── HASH KEY CELL ────────────────────────────────────────────────────────────
// The stored credential is sha256(password) — unrecoverable by design, so we
// show the hash itself: masked by default, reveal on click, copy to clipboard.
function HashKey({ hash }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!hash) return <span style={{ color: T.label }}>—</span>;
  const copy = () => {
    navigator.clipboard?.writeText(hash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontFamily: "monospace", fontSize: 10, color: T.sub }}>
        {shown ? `${hash.slice(0, 18)}…` : "•".repeat(14)}
      </span>
      <button onClick={() => setShown(s => !s)} title={shown ? "Hide" : "Reveal"}
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: T.label, padding: 2 }}>
        {shown ? "🙈" : "👁"}
      </button>
      <button onClick={copy} title="Copy full hash"
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 9.5, color: copied ? T.green : T.accent, padding: 2 }}>
        {copied ? "✓" : "copy"}
      </button>
    </div>
  );
}

// ── ADD / EDIT MODAL ─────────────────────────────────────────────────────────
// One modal for both collections: `kind` decides which fields show (role for
// internal users, brand for portal credentials). `editing` = existing record
// (password optional = reset) vs null = create (password required).
function CredentialModal({ kind, editing, brands, defaultBrandId, onClose, onSave }) {
  const isUser = kind === "internal";
  const [form, setForm] = useState({
    username: editing?.username || "",
    name:     editing?.name || "",
    title:    editing?.title || "",
    role:     editing?.role || "cm",
    teamId:   editing?.teamId || "",
    brandId:  editing?.brandId || defaultBrandId || brands[0]?.id || "",
    password: "",
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const u = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErr(""); };

  const submit = async () => {
    if (!form.username.trim()) return setErr("Username (email) is required.");
    if (!form.name.trim())     return setErr("Name is required.");
    if (!editing && !form.password) return setErr("Password is required for a new login.");
    if (!isUser && !form.brandId)   return setErr("Select a brand for this credential.");
    setSaving(true);
    try {
      await onSave(form);
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
            {editing ? `Edit — ${editing.name}` : isUser ? "Add team member" : "Add brand credential"}
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: T.sub, fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <Lbl>Name</Lbl>
              <input value={form.name} onChange={e => u("name", e.target.value)} placeholder="Full name" style={INP} />
            </div>
            <div>
              <Lbl>Title</Lbl>
              <input value={form.title} onChange={e => u("title", e.target.value)} placeholder={isUser ? "e.g. Category Manager" : "e.g. Marketing Head"} style={INP} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Lbl>Username (login email)</Lbl>
            <input value={form.username} onChange={e => u("username", e.target.value)} placeholder={isUser ? "name@5thavenue.in" : "name@brand.com"} style={INP} />
          </div>
          {isUser ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <Lbl>Role</Lbl>
                <select value={form.role} onChange={e => u("role", e.target.value)} style={{ ...INP, cursor: "pointer" }}>
                  {PLATFORM_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <Lbl>Team ID (optional)</Lbl>
                <input value={form.teamId} onChange={e => u("teamId", e.target.value)} placeholder="e.g. t3 — campaign ownership" style={INP} />
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <Lbl>Brand</Lbl>
              <select value={form.brandId} onChange={e => u("brandId", e.target.value)} style={{ ...INP, cursor: "pointer" }}>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <div style={{ marginBottom: 4 }}>
            <Lbl>{editing ? "Reset password (leave blank to keep current)" : "Password"}</Lbl>
            <input type="password" value={form.password} onChange={e => u("password", e.target.value)}
              placeholder={editing ? "••••••••" : "Set an initial password"} style={INP} />
            <div style={{ fontSize: 9.5, color: T.label, marginTop: 5 }}>
              Stored as a SHA-256 hash key — the plaintext never reaches the database.
            </div>
          </div>
          {err && <div style={{ fontSize: 11, color: T.red, marginTop: 10 }}>{err}</div>}
        </div>

        <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <div style={{ flex: 1 }} />
          <Btn variant="primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create login"}</Btn>
        </div>
      </div>
    </div>
  );
}

// ── REMOVE (SOFT DELETE) CONFIRM ─────────────────────────────────────────────
function RemoveModal({ record, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(4,5,10,0.55)", backdropFilter: "blur(4px)" }} />
      <div style={{ position: "relative", width: "min(380px,94vw)", background: T.surface, border: `1px solid ${T.borderMid}`, borderRadius: 10, padding: "20px 22px", boxShadow: T.shadowLg }}>
        <div style={{ fontFamily: "'Newsreader',serif", fontSize: 16, fontStyle: "italic", color: T.text, marginBottom: 8 }}>
          Remove {record.name}?
        </div>
        <div style={{ fontSize: 11.5, color: T.sub, lineHeight: 1.6, marginBottom: 18 }}>
          This is a <strong style={{ color: T.text }}>soft delete</strong> — the record stays in the
          database (marked removed) and can be restored by hand, but{" "}
          <span style={{ fontFamily: "monospace", fontSize: 10.5 }}>{record.username}</span> will no
          longer be able to sign in.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <div style={{ flex: 1 }} />
          <Btn variant="danger" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(); }}>
            {busy ? "Removing…" : "Remove login"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── PAGE ─────────────────────────────────────────────────────────────────────
export default function Auth() {
  const { user, brands = [], brandFilter } = useOutletContext() || {};
  const role = user?.role;

  const [tab, setTab] = useState("internal");          // internal | external
  const [users, setUsers] = useState([]);
  const [creds, setCreds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const [modal, setModal] = useState(null);            // { mode:"add"|"edit", record? }
  const [removing, setRemoving] = useState(null);      // record pending soft delete

  const api    = tab === "internal" ? UsersAPI : BrandCredentialsAPI;
  // Brand Portal tab respects the global brand filter (top bar), same as
  // Campaigns/Billing. Internal users aren't brand-scoped, so no filter there.
  const visibleCreds = brandFilter ? creds.filter(c => c.brandId === brandFilter) : creds;
  const rows   = tab === "internal" ? users : visibleCreds;
  const setRows = tab === "internal" ? setUsers : setCreds;

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([UsersAPI.list(showRemoved), BrandCredentialsAPI.list(showRemoved)])
      .then(([u, c]) => { setUsers(u); setCreds(c); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [showRemoved]);

  useEffect(() => { if (can(role, "manageAuth")) load(); }, [role, load]);

  const brandName = id => brands.find(b => b.id === id)?.name || id || "—";

  // Create / update handlers passed into the modal. IDs are human-readable
  // and generated here, matching the codebase's frontend-generated-ID pattern.
  const handleSave = async (form) => {
    const isUser = tab === "internal";
    if (modal.mode === "edit") {
      const patch = {
        username: form.username, name: form.name, title: form.title,
        ...(isUser ? { role: form.role, teamId: form.teamId || null } : { brandId: form.brandId }),
        ...(form.password ? { password: form.password } : {}),
      };
      const updated = await api.update(modal.record.id, patch);
      setRows(prev => prev.map(r => r.id === updated.id ? updated : r));
    } else {
      const id = isUser ? `u_${Date.now().toString(36)}` : `bc_${form.brandId}_${Date.now().toString(36)}`;
      const avatar = form.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
      const created = await api.create({
        id, avatar, username: form.username, name: form.name, title: form.title,
        password: form.password,
        ...(isUser ? { role: form.role, teamId: form.teamId || null } : { brandId: form.brandId }),
      });
      setRows(prev => [...prev, created]);
    }
  };

  const handleRemove = async () => {
    await api.remove(removing.id, user?.name);
    setRows(prev => showRemoved
      ? prev.map(r => r.id === removing.id ? { ...r, deleted: true } : r)
      : prev.filter(r => r.id !== removing.id));
    setRemoving(null);
  };

  // Defense in depth — the shell already hides this section from non-founders.
  if (!can(role, "manageAuth")) {
    return <div style={{ padding: 40, fontSize: 12, color: T.sub }}>This page is restricted to the founder.</div>;
  }

  const TABS = [
    { id: "internal", label: `Internal Users (${users.length})` },
    { id: "external", label: `Brand Portal (${visibleCreds.length})` },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", background: T.bg, padding: "26px 30px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontSize: 24, fontWeight: 600, color: T.text }}>
            Access & Credentials
          </div>
          <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>
            Every login in the system — internal team and brand portal. Passwords are stored as hash keys only.
          </div>
        </div>
        <Btn variant="primary" onClick={() => setModal({ mode: "add" })}>
          + {tab === "internal" ? "Add team member" : "Add brand credential"}
        </Btn>
      </div>

      {/* Tabs + show-removed toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 14, borderBottom: `1px solid ${T.border}` }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "9px 14px", background: "transparent", border: "none",
            borderBottom: `2px solid ${tab === t.id ? T.accent : "transparent"}`,
            fontSize: 11.5, fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? T.text : T.sub, cursor: "pointer", fontFamily: "'Sora'",
          }}>{t.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: T.sub, cursor: "pointer", paddingBottom: 6 }}>
          <input type="checkbox" checked={showRemoved} onChange={e => setShowRemoved(e.target.checked)} style={{ accentColor: T.accent }} />
          Show removed
        </label>
      </div>

      {/* States */}
      {loading && <div style={{ padding: 40, fontSize: 12, color: T.sub, textAlign: "center" }}>Loading credentials…</div>}
      {error && !loading && (
        <div style={{ padding: "14px 16px", background: `${T.red}0C`, border: `1px solid ${T.red}30`, borderRadius: T.radiusSm, fontSize: 11.5, color: T.red }}>
          Could not load credentials from the backend: {error}. Run <span style={{ fontFamily: "monospace" }}>npm run seed:users</span> in 5th-internal-back if the collections are empty.
        </div>
      )}
      {!loading && !error && rows.length === 0 && (
        <div style={{ padding: 40, fontSize: 12, color: T.label, textAlign: "center", fontStyle: "italic" }}>
          {tab === "external" && brandFilter && creds.length > 0
            ? "No brand credentials for the selected brand — clear the brand filter or add one above."
            : `No ${tab === "internal" ? "users" : "brand credentials"} yet — add the first one above.`}
        </div>
      )}

      {/* Table */}
      {!loading && !error && rows.length > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, boxShadow: T.shadow, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS}>ID</th>
                <th style={thS}>Name</th>
                <th style={thS}>Username</th>
                <th style={thS}>Hash Key</th>
                <th style={thS}>{tab === "internal" ? "Role" : "Brand"}</th>
                <th style={thS}>Title</th>
                <th style={thS}>Status</th>
                <th style={{ ...thS, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ opacity: r.deleted ? 0.55 : 1 }}>
                  <td style={{ ...tdS, fontFamily: "monospace", fontSize: 10.5, color: T.sub }}>{r.id}</td>
                  <td style={{ ...tdS, fontWeight: 500 }}>{r.name}</td>
                  <td style={{ ...tdS, fontFamily: "monospace", fontSize: 10.5 }}>{r.username}</td>
                  <td style={tdS}><HashKey hash={r.hashKey} /></td>
                  <td style={tdS}>
                    {tab === "internal"
                      ? <Pill color={r.role === "founder" ? T.purple : T.accent}>{roleLabel(r.role)}</Pill>
                      : <Pill color={T.teal}>{brandName(r.brandId)}</Pill>}
                  </td>
                  <td style={{ ...tdS, color: T.sub }}>{r.title || "—"}</td>
                  <td style={tdS}>
                    {r.deleted
                      ? <Pill color={T.red}>Removed</Pill>
                      : <Pill color={T.green}>Active</Pill>}
                  </td>
                  <td style={{ ...tdS, textAlign: "right", whiteSpace: "nowrap" }}>
                    {!r.deleted && (
                      <>
                        <button onClick={() => setModal({ mode: "edit", record: r })}
                          style={{ fontSize: 9.5, color: T.accent, background: "transparent", border: `1px solid ${T.accent}30`, borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontFamily: "'Sora'", marginRight: 6 }}>
                          Edit
                        </button>
                        <button
                          onClick={() => setRemoving(r)}
                          disabled={tab === "internal" && r.id === user?.id}
                          title={tab === "internal" && r.id === user?.id ? "You can't remove your own login" : "Soft delete"}
                          style={{ fontSize: 9.5, color: T.red, background: "transparent", border: `1px solid ${T.red}30`, borderRadius: 4, padding: "3px 10px", cursor: tab === "internal" && r.id === user?.id ? "not-allowed" : "pointer", opacity: tab === "internal" && r.id === user?.id ? 0.4 : 1, fontFamily: "'Sora'" }}>
                          Remove
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <CredentialModal
          kind={tab}
          editing={modal.mode === "edit" ? modal.record : null}
          brands={brands}
          defaultBrandId={brandFilter}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      {removing && (
        <RemoveModal record={removing} onClose={() => setRemoving(null)} onConfirm={handleRemove} />
      )}
    </div>
  );
}
