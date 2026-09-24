/**
 * 5th Avenue — Settings: access & credentials (founder-only)
 * ─────────────────────────────────────────────────────────────────
 * The founder's view of every login in the system:
 *   · Internal — platform users (pcm, cm, am, ea, accounts…) from /api/users
 *   · Brand Portal — external client logins from /api/brand-credentials,
 *     each mapped to a brandId (= Client._id)
 *
 * The DB stores { id, username, hashKey } — hashKey is sha256(password),
 * so the actual password can never be displayed; the hash is shown instead
 * (reveal + copy). Founder can add new users, edit existing ones (including
 * a password reset, re-hashed server-side) and remove them (hard delete —
 * the doc is removed from Mongo so the id sequence stays consistent).
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { UsersAPI, BrandCredentialsAPI, ClientsAPI } from "../../lib/api";
import { can } from "../../lib/rbac";
import { PLATFORM_ROLES } from "../../routes/sections";
import { T } from "../../theme/tokens";
import BrandPicker from "../../components/BrandPicker";
import AvatarPicker from "../../components/AvatarPicker";
import BrandLogoModal from "../../components/BrandLogoModal";

// Where the brand-portal app lives, for the "open client login" shortcut below.
// Env-driven so a local portal (localhost:5174) can be targeted during dev
// without editing this file; falls back to the deployed portal.
const CLIENT_PORTAL_URL = (
  import.meta.env.VITE_CLIENT_PORTAL_URL || "https://www.fifth-avenue.in/"
).replace(/\/$/, "");

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

// Table-row avatar: the photo when there is one, initials when there isn't.
// `url` is null for records with no photo (api.avatarUrl returns null on
// hasAvatar:false), so a row without one never issues a request that 404s; the
// onError path only covers a photo that exists but fails to decode.
function RowAvatar({ record, url, size = 26 }) {
  const [broken, setBroken] = useState(false);
  const initials = record.avatar
    || (record.name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
      background: url && !broken ? T.mute : T.accent, color: "#FFF",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 600, fontFamily: "'Sora'",
    }}>
      {url && !broken
        ? <img src={url} alt="" onError={() => setBroken(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : initials}
    </div>
  );
}

const roleLabel = id => PLATFORM_ROLES.find(r => r.id === id)?.label || id;
// Hierarchy for sorting the internal-users table — PLATFORM_ROLES is already
// declared top-down (Founder → PCM → CM → AM → EA → Accounts), so its order is
// the source of truth. Unknown roles sort last.
const ROLE_RANK = Object.fromEntries(PLATFORM_ROLES.map((r, i) => [r.id, i]));
const roleRank = id => (id in ROLE_RANK ? ROLE_RANK[id] : PLATFORM_ROLES.length);

// ── PASSWORD CELL ────────────────────────────────────────────────────────────
// The DB stores only hashKey (sha256, for login) + passKey (encrypted copy).
// Reveal fetches the decrypted actual password from GET …/:id/password —
// founder-only page, so only the founder ever sees it. Records created before
// the passKey era have nothing to decrypt until their password is reset once.
function PasswordCell({ api, record }) {
  const [shown, setShown] = useState(false);
  const [password, setPassword] = useState(null); // fetched plaintext
  const [notice, setNotice] = useState(null);     // e.g. "reset to enable"
  const [copied, setCopied] = useState(false);

  // Fetch-and-cache the plaintext; returns null (and sets the notice) when
  // there's nothing to decrypt (pre-passKey records → backend 404).
  const fetchPassword = async () => {
    if (password != null) return password;
    try {
      const pw = (await api.password(record.id)).password;
      setPassword(pw);
      return pw;
    } catch (err) {
      setNotice(err.status === 404 ? "Set a new password to enable reveal" : "Could not fetch password");
      return null;
    }
  };

  const reveal = async () => {
    if (shown) { setShown(false); return; }
    if (await fetchPassword() != null) setShown(true);
  };

  const copy = async () => {
    const pw = await fetchPassword();
    if (pw == null) return;
    navigator.clipboard?.writeText(pw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  if (notice) return <span style={{ fontSize: 9.5, color: T.amber }}>{notice}</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontFamily: "monospace", fontSize: 10.5, color: shown ? T.text : T.sub }}>
        {shown ? password : "•".repeat(10)}
      </span>
      <button onClick={reveal} title={shown ? "Hide" : "Reveal actual password"}
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: T.label, padding: 2 }}>
        {shown ? "🙈" : "👁"}
      </button>
      <button onClick={copy} title="Copy password"
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
function CredentialModal({ kind, editing, brands, defaultBrandId, currentAvatarUrl, onClose, onSave, onCreateBrand }) {
  const isUser = kind === "internal";
  const [form, setForm] = useState({
    username: editing?.username || "",
    name:     editing?.name || "",
    title:    editing?.title || "",
    role:     editing?.role || "cm",
    teamId:   editing?.teamId || "",
    brandId:  editing?.brandId || defaultBrandId || "",
    password: "",
  });
  // Kept OUT of `form` on purpose: this is the three-state avatar value
  // (undefined = untouched · null = remove · data URI = replace), and `form` is
  // spread wholesale into the patch, which would turn "untouched" into an
  // explicit undefined the caller couldn't distinguish. See AvatarPicker.
  const [avatarImage, setAvatarImage] = useState(undefined);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const u = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErr(""); };
  // Initials follow the name as it's typed while no photo is set, so the
  // placeholder in the picker matches the avatar the record will actually get.
  const initials = (form.name || "").split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0]).join("").toUpperCase();

  // New-brand staging — nothing is written to the backend until the
  // credential is actually submitted, so abandoning this modal never leaves
  // an orphan brand. BrandPicker owns the search/create UI; this is just the
  // committed value, same shape as the campaign creation modal.
  const [pendingBrandName, setPendingBrandName] = useState(null);

  const submit = async () => {
    if (!form.username.trim()) return setErr("Username (email) is required.");
    if (!form.name.trim())     return setErr("Name is required.");
    if (!editing && !form.password) return setErr("Password is required for a new login.");
    if (!isUser && !form.brandId)   return setErr("Select a brand for this credential.");
    setSaving(true);
    try {
      let brandId = form.brandId;
      if (!isUser && brandId === "__new__") {
        const created = await onCreateBrand(pendingBrandName);
        brandId = created.id;
      }
      // `avatarImage` is passed through only when it was actually touched, so a
      // plain rename never carries an avatar instruction at all.
      await onSave({ ...form, brandId, ...(avatarImage !== undefined ? { avatarImage } : {}) });
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
          {/* Photo first — it's optional, so it sits above the required fields
              rather than interrupting them, and the picker states plainly that
              it can be skipped. */}
          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${T.border}` }}>
            <Lbl>Profile photo</Lbl>
            <div style={{ marginTop: 8 }}>
              <AvatarPicker
                value={avatarImage}
                currentUrl={currentAvatarUrl}
                initials={initials}
                onChange={(v) => { setAvatarImage(v); setErr(""); }}
              />
            </div>
          </div>
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
                <Lbl>Team ID (auto-assigned if blank)</Lbl>
                <input value={form.teamId} onChange={e => u("teamId", e.target.value)} placeholder="e.g. t3 — links campaigns (amId/cmId/eaId)" style={INP} />
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <Lbl>Brand</Lbl>
              <div style={{ marginTop: 5 }}>
                <BrandPicker brands={brands} value={form.brandId} pendingName={pendingBrandName}
                  onSelect={id => { u("brandId", id); setPendingBrandName(null); }}
                  onCreate={name => { setPendingBrandName(name); u("brandId", "__new__"); }} />
              </div>
              {pendingBrandName && form.brandId === "__new__" && (
                <div style={{ fontSize: 9.5, color: T.amber, marginTop: 6 }}>"{pendingBrandName}" will be created when you save this credential.</div>
              )}
            </div>
          )}
          <div style={{ marginBottom: 4 }}>
            <Lbl>{editing ? "Reset password (leave blank to keep current)" : "Password"}</Lbl>
            <input type="password" value={form.password} onChange={e => u("password", e.target.value)}
              placeholder={editing ? "••••••••" : "Set an initial password"} style={INP} />
            <div style={{ fontSize: 9.5, color: T.label, marginTop: 5 }}>
              Stored as a SHA-256 hash key plus an encrypted copy for the founder's reveal — plaintext is never stored.
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

// ── REMOVE (HARD DELETE) CONFIRM ─────────────────────────────────────────────
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
          This <strong style={{ color: T.red }}>permanently deletes</strong> the record from the
          database — it cannot be restored, and{" "}
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

// ── CREATE BRAND ─────────────────────────────────────────────────────────────
// Same slug scheme as Campaigns'/Requests' onCreateBrand and this file's own
// "Add brand credential" inline BrandPicker — one place already existed to
// spin up a brand, this is a second, more direct one for when there's no
// login to attach yet.
function CreateBrandModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setErr("");
    try {
      const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const created = await ClientsAPI.create({ id, name: name.trim() });
      onCreated(created);
      onClose();
    } catch (e) {
      setErr(e.body?.error || `Couldn't create the brand: ${e.message}`);
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(4,5,10,0.55)", backdropFilter: "blur(4px)" }} />
      <div style={{ position: "relative", width: "min(380px,94vw)", background: T.surface, border: `1px solid ${T.borderMid}`, borderRadius: 10, padding: "20px 22px", boxShadow: T.shadowLg }}>
        <div style={{ fontFamily: "'Newsreader',serif", fontSize: 16, fontStyle: "italic", color: T.text, marginBottom: 14 }}>
          New brand
        </div>
        <Lbl>Brand name</Lbl>
        <input
          autoFocus
          value={name}
          onChange={e => { setName(e.target.value); setErr(""); }}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder="Acme Co."
          style={{ ...INP, marginBottom: 6 }}
        />
        <div style={{ fontSize: 9.5, color: T.label, marginBottom: 14 }}>
          Logo, website and portal logins are added afterward, from this same table.
        </div>
        {err && <div style={{ fontSize: 11, color: T.red, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <div style={{ flex: 1 }} />
          <Btn variant="primary" disabled={!name.trim() || saving} onClick={submit}>
            {saving ? "Creating…" : "Create brand"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── DELETE BRAND (cascades everything scoped to it) ──────────────────────────
function RemoveBrandModal({ brand, loginCount, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(4,5,10,0.55)", backdropFilter: "blur(4px)" }} />
      <div style={{ position: "relative", width: "min(420px,94vw)", background: T.surface, border: `1px solid ${T.borderMid}`, borderRadius: 10, padding: "20px 22px", boxShadow: T.shadowLg }}>
        <div style={{ fontFamily: "'Newsreader',serif", fontSize: 16, fontStyle: "italic", color: T.text, marginBottom: 8 }}>
          Delete {brand.name}?
        </div>
        <div style={{ fontSize: 11.5, color: T.sub, lineHeight: 1.6, marginBottom: 18 }}>
          This <strong style={{ color: T.red }}>permanently deletes</strong> the brand and everything
          scoped to it — its campaigns
          {loginCount > 0 ? `, ${loginCount} portal login${loginCount === 1 ? "" : "s"}` : ""},
          billing records, market-watch items and audit findings. It cannot be undone.
        </div>
        {err && <div style={{ fontSize: 11, color: T.red, marginBottom: 12 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <div style={{ flex: 1 }} />
          <Btn
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr("");
              try { await onConfirm(); }
              catch (e) {
                setErr(e.body?.error || `Couldn't delete: ${e.message}`);
                setBusy(false);
              }
            }}
          >
            {busy ? "Deleting…" : "Delete brand"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── BRAND SETTINGS (name, logo, and a roster of that brand's portal logins) ──
// One row per brand — the same Client documents the top-bar filter and every
// campaign already key off. Name is editable in place (Edit → type →
// Save/Cancel); the logo reuses BrandLogoModal exactly as Campaigns' own
// "change logo" flow does (website lookup + upload, one write path either
// way), so a brand's logo is never set two different ways in two different
// screens. Logins aren't fetched again here — `creds` is the same Brand
// Portal list already loaded for the tab beside this one, just grouped by
// brandId instead of shown flat.
function BrandNameCell({ brand, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(brand.name || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 500 }}>{brand.name || "—"}</span>
        <button onClick={() => { setValue(brand.name || ""); setEditing(true); }}
          style={{ fontSize: 9.5, color: T.accent, background: "transparent", border: "none", cursor: "pointer", fontFamily: "'Sora'" }}>
          Edit
        </button>
      </div>
    );
  }

  const save = async () => {
    if (!value.trim()) { setErr("Name can't be empty."); return; }
    setSaving(true);
    setErr("");
    try {
      await ClientsAPI.update(brand.id, { name: value.trim() });
      onSaved();
      setEditing(false);
    } catch (e) {
      setErr(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input value={value} onChange={e => { setValue(e.target.value); setErr(""); }}
          onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          autoFocus style={{ ...INP, width: 160 }} />
        <button onClick={save} disabled={saving}
          style={{ fontSize: 9.5, color: T.green, background: "transparent", border: "none", cursor: saving ? "not-allowed" : "pointer", fontFamily: "'Sora'" }}>
          {saving ? "…" : "Save"}
        </button>
        <button onClick={() => setEditing(false)} disabled={saving}
          style={{ fontSize: 9.5, color: T.sub, background: "transparent", border: "none", cursor: "pointer", fontFamily: "'Sora'" }}>
          Cancel
        </button>
      </div>
      {err && <div style={{ fontSize: 9.5, color: T.red }}>{err}</div>}
    </div>
  );
}

// A count reads at a glance; "what all are the logins" (name + username, the
// same two fields the Brand Portal tab shows per row) is one click away
// without leaving this table.
function BrandLoginsCell({ logins }) {
  const [open, setOpen] = useState(false);
  if (!logins.length) {
    return <span style={{ fontSize: 10.5, color: T.label, fontStyle: "italic" }}>No logins yet</span>;
  }
  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        style={{ fontSize: 10.5, color: T.teal, background: "transparent", border: `1px solid ${T.teal}30`, borderRadius: 4, padding: "3px 9px", cursor: "pointer", fontFamily: "'Sora'" }}>
        {logins.length} login{logins.length === 1 ? "" : "s"} {open ? "▲" : "▼"}
      </button>
      {open && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
          {logins.map(l => (
            <div key={l.id} style={{ fontSize: 10, color: T.sub }}>
              <span style={{ color: T.text, fontWeight: 500 }}>{l.name}</span>{" "}
              <span style={{ fontFamily: "monospace", fontSize: 9.5 }}>({l.username})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BrandSettingsTable({ brands, creds, onEditLogo, onBrandSaved, onDelete }) {
  const sorted = useMemo(() => [...brands].sort((a, b) => (a.name || "").localeCompare(b.name || "")), [brands]);
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, boxShadow: T.shadow, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...thS, width: 34, textAlign: "right" }}>#</th>
            <th style={{ ...thS, width: 40 }} />
            <th style={thS}>Brand</th>
            <th style={thS}>Website</th>
            <th style={thS}>Logins</th>
            <th style={{ ...thS, textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((b, i) => {
            const logins = creds.filter(c => c.brandId === b.id);
            const websiteHref = b.website
              ? (b.website.startsWith("http://") || b.website.startsWith("https://") ? b.website : `https://${b.website}`)
              : null;
            return (
              <tr key={b.id}>
                <td style={{ ...tdS, fontSize: 10.5, color: T.sub, textAlign: "right" }}>{i + 1}</td>
                <td style={{ ...tdS, paddingRight: 0 }}>
                  <RowAvatar record={b} url={ClientsAPI.avatarUrl(b)} />
                </td>
                <td style={tdS}>
                  <BrandNameCell brand={b} onSaved={onBrandSaved} />
                </td>
                <td style={{ ...tdS, fontSize: 10.5 }}>
                  {websiteHref
                    ? <a href={websiteHref} target="_blank" rel="noopener noreferrer" style={{ color: T.accent, textDecoration: "none" }}>{b.website}</a>
                    : <span style={{ color: T.label }}>—</span>}
                </td>
                <td style={tdS}>
                  <BrandLoginsCell logins={logins} />
                </td>
                <td style={{ ...tdS, textAlign: "right", whiteSpace: "nowrap" }}>
                  <button onClick={() => onEditLogo(b)}
                    style={{ fontSize: 9.5, color: T.accent, background: "transparent", border: `1px solid ${T.accent}30`, borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontFamily: "'Sora'", marginRight: 6 }}>
                    Logo &amp; website
                  </button>
                  <button onClick={() => onDelete(b)}
                    style={{ fontSize: 9.5, color: T.red, background: "transparent", border: `1px solid ${T.red}30`, borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontFamily: "'Sora'" }}>
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── PAGE ─────────────────────────────────────────────────────────────────────
export default function Settings() {
  const { user, brands = [], brandFilter, refreshBrands } = useOutletContext() || {};
  const role = user?.role;

  const [tab, setTab] = useState("internal");          // internal | external
  const [users, setUsers] = useState([]);
  const [creds, setCreds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);            // { mode:"add"|"edit", record? }
  const [removing, setRemoving] = useState(null);      // record pending hard delete
  const [logoBrandId, setLogoBrandId] = useState(null); // brand id whose logo/website modal is open
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [deletingBrand, setDeletingBrand] = useState(null); // brand record pending cascade delete

  const api    = tab === "internal" ? UsersAPI : BrandCredentialsAPI;
  // Brand Portal tab respects the global brand filter (top bar), same as
  // Campaigns/Billing. Internal users aren't brand-scoped, so no filter there.
  const visibleCreds = brandFilter ? creds.filter(c => c.brandId === brandFilter) : creds;
  // Internal users are grouped by role hierarchy (Founder first, then PCMs, …),
  // then A–Z within a role. Brand credentials have no role, so they're sorted
  // by name. The DB id (u3 / bc2) is no longer surfaced — rows are shown with a
  // plain running number instead (see the "#" column below).
  const rows = useMemo(() => {
    if (tab !== "internal") return [...visibleCreds].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return [...users].sort((a, b) => roleRank(a.role) - roleRank(b.role) || (a.name || "").localeCompare(b.name || ""));
  }, [tab, users, visibleCreds]);
  const setRows = tab === "internal" ? setUsers : setCreds;

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([UsersAPI.list(), BrandCredentialsAPI.list()])
      .then(([u, c]) => { setUsers(u); setCreds(c); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (can(role, "manageSettings")) load(); }, [role, load]);

  const brandName = id => brands.find(b => b.id === id)?.name || id || "—";

  // Create / update handlers passed into the modal. Ids and teamIds are
  // assigned by the backend, continuing the seed sequence (u10, bc3, t10, …).
  const handleSave = async (form) => {
    const isUser = tab === "internal";
    // Present only when the modal's picker was actually used. `avatarImage` may
    // legitimately be null (remove), so the key's PRESENCE is the signal, not
    // its truthiness — `form.avatarImage || {}` would drop every removal.
    const avatarPatch = "avatarImage" in form ? { avatarImage: form.avatarImage } : {};
    if (modal.mode === "edit") {
      const patch = {
        username: form.username, name: form.name, title: form.title,
        ...(isUser ? { role: form.role, ...(form.teamId ? { teamId: form.teamId } : {}) } : { brandId: form.brandId }),
        ...(form.password ? { password: form.password } : {}),
        ...avatarPatch,
      };
      const updated = await api.update(modal.record.id, patch);
      setRows(prev => prev.map(r => r.id === updated.id ? updated : r));
    } else {
      // Initials stay the fallback even when a photo is uploaded — it's what
      // renders while the image loads, and what's left if the photo is removed.
      const avatar = form.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
      const created = await api.create({
        avatar, username: form.username, name: form.name, title: form.title,
        password: form.password,
        ...(isUser ? { role: form.role, ...(form.teamId ? { teamId: form.teamId } : {}) } : { brandId: form.brandId }),
        ...avatarPatch,
      });
      setRows(prev => [...prev, created]);
    }
  };

  // Opens the brand portal's login with this credential's username already in
  // the field, so the founder testing a brand's view doesn't have to copy it
  // across by hand. The PASSWORD is deliberately not passed — it would end up
  // in a URL, which lands in browser history and any proxy log in between; the
  // reveal/copy control in the table beside this is the intended path for it.
  const openClientLogin = (record) => {
    const url = `${CLIENT_PORTAL_URL}/login?email=${encodeURIComponent(record.username || "")}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Lets "Add brand credential" create a brand new brand inline, instead of
  // requiring one to already exist from the campaign-creation flow. Same slug
  // scheme as Campaigns' onCreateBrand; refreshBrands() re-pulls the list so
  // the top-bar brand filter picks it up right away.
  const onCreateBrand = useCallback(async (name) => {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const created = await ClientsAPI.create({ id, name });
    refreshBrands?.();
    return { id: created.id, name: created.name };
  }, [refreshBrands]);

  const handleRemove = async () => {
    await api.remove(removing.id);
    setRows(prev => prev.filter(r => r.id !== removing.id));
    setRemoving(null);
  };

  // Defense in depth — the shell already hides this section from non-founders.
  if (!can(role, "manageSettings")) {
    return <div style={{ padding: 40, fontSize: 12, color: T.sub }}>This page is restricted to the founder.</div>;
  }

  const TABS = [
    { id: "internal", label: `Internal Users (${users.length})` },
    { id: "external", label: `Brand Portal (${visibleCreds.length})` },
    { id: "brands", label: `Brand Settings (${brands.length})` },
  ];
  // Brands themselves come from a brand-creation flow elsewhere (the "Add
  // brand credential" modal's inline BrandPicker) — this tab is for editing
  // ones that already exist, so it has no "+ Add" action of its own.
  const logoBrand = logoBrandId ? brands.find(b => b.id === logoBrandId) : null;
  const refreshBrandRow = () => refreshBrands?.();

  return (
    <div style={{ flex: 1, overflowY: "auto", background: T.bg, padding: "26px 30px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontSize: 24, fontWeight: 600, color: T.text }}>
            Settings
          </div>
          <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>
            Every login in the system — internal team and brand portal. The DB stores hash keys; reveal shows the actual password (founder only).
          </div>
        </div>
        {tab === "brands" ? (
          <Btn variant="primary" onClick={() => setCreatingBrand(true)}>+ Add brand</Btn>
        ) : (
          <Btn variant="primary" onClick={() => setModal({ mode: "add" })}>
            + {tab === "internal" ? "Add team member" : "Add brand credential"}
          </Btn>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 14, borderBottom: `1px solid ${T.border}` }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "9px 14px", background: "transparent", border: "none",
            borderBottom: `2px solid ${tab === t.id ? T.accent : "transparent"}`,
            fontSize: 11.5, fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? T.text : T.sub, cursor: "pointer", fontFamily: "'Sora'",
          }}>{t.label}</button>
        ))}
      </div>

      {/* States */}
      {loading && <div style={{ padding: 40, fontSize: 12, color: T.sub, textAlign: "center" }}>Loading credentials…</div>}
      {error && !loading && (
        <div style={{ padding: "14px 16px", background: `${T.red}0C`, border: `1px solid ${T.red}30`, borderRadius: T.radiusSm, fontSize: 11.5, color: T.red }}>
          Could not load credentials from the backend: {error}. Run <span style={{ fontFamily: "monospace" }}>npm run seed:users</span> in 5th-internal-back if the collections are empty.
        </div>
      )}
      {tab !== "brands" && !loading && !error && rows.length === 0 && (
        <div style={{ padding: 40, fontSize: 12, color: T.label, textAlign: "center", fontStyle: "italic" }}>
          {tab === "external" && brandFilter && creds.length > 0
            ? "No brand credentials for the selected brand — clear the brand filter or add one above."
            : `No ${tab === "internal" ? "users" : "brand credentials"} yet — add the first one above.`}
        </div>
      )}
      {tab === "brands" && !loading && !error && brands.length === 0 && (
        <div style={{ padding: 40, fontSize: 12, color: T.label, textAlign: "center", fontStyle: "italic" }}>
          No brands yet — add one from the Brand Portal tab's "Add brand credential" form.
        </div>
      )}

      {/* Brand Settings table */}
      {tab === "brands" && !loading && !error && brands.length > 0 && (
        <BrandSettingsTable brands={brands} creds={creds} onEditLogo={b => setLogoBrandId(b.id)} onBrandSaved={refreshBrandRow} onDelete={b => setDeletingBrand(b)} />
      )}

      {/* Table */}
      {tab !== "brands" && !loading && !error && rows.length > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, boxShadow: T.shadow, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thS, width: 34, textAlign: "right" }}>#</th>
                <th style={{ ...thS, width: 40 }} />
                <th style={thS}>Name</th>
                <th style={thS}>Username</th>
                <th style={thS}>Password</th>
                <th style={thS}>{tab === "internal" ? "Role" : "Brand"}</th>
                <th style={thS}>Title</th>
                <th style={{ ...thS, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isSelf = tab === "internal" && r.id === user?.id;
                return (
                  <tr key={r.id}>
                    <td style={{ ...tdS, fontSize: 10.5, color: T.sub, textAlign: "right" }}>{i + 1}</td>
                    <td style={{ ...tdS, paddingRight: 0 }}>
                      <RowAvatar record={r} url={api.avatarUrl(r)} />
                    </td>
                    <td style={{ ...tdS, fontWeight: 500 }}>{r.name}</td>
                    <td style={{ ...tdS, fontFamily: "monospace", fontSize: 10.5 }}>{r.username}</td>
                    <td style={tdS}><PasswordCell api={api} record={r} /></td>
                    <td style={tdS}>
                      {tab === "internal"
                        ? <Pill color={r.role === "founder" ? T.purple : T.accent}>{roleLabel(r.role)}</Pill>
                        : <Pill color={T.teal}>{brandName(r.brandId)}</Pill>}
                    </td>
                    <td style={{ ...tdS, color: T.sub }}>{r.title || "—"}</td>
                    <td style={{ ...tdS, textAlign: "right", whiteSpace: "nowrap" }}>
                      {/* Brand-portal rows only: jump straight to the client
                          login with this username filled in. Internal users
                          sign in to THIS app, so the shortcut would point at
                          the wrong door for them. */}
                      {tab === "external" && (
                        <button onClick={() => openClientLogin(r)}
                          title={`Open the client portal login as ${r.username}`}
                          style={{ fontSize: 9.5, color: T.teal, background: "transparent", border: `1px solid ${T.teal}30`, borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontFamily: "'Sora'", marginRight: 6 }}>
                          Client login ↗
                        </button>
                      )}
                      <button onClick={() => setModal({ mode: "edit", record: r })}
                        style={{ fontSize: 9.5, color: T.accent, background: "transparent", border: `1px solid ${T.accent}30`, borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontFamily: "'Sora'", marginRight: 6 }}>
                        Edit
                      </button>
                      <button
                        onClick={() => setRemoving(r)}
                        disabled={isSelf}
                        title={isSelf ? "You can't remove your own login" : "Permanently delete"}
                        style={{ fontSize: 9.5, color: T.red, background: "transparent", border: `1px solid ${T.red}30`, borderRadius: 4, padding: "3px 10px", cursor: isSelf ? "not-allowed" : "pointer", opacity: isSelf ? 0.4 : 1, fontFamily: "'Sora'" }}>
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
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
          currentAvatarUrl={modal.mode === "edit" ? api.avatarUrl(modal.record) : null}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onCreateBrand={onCreateBrand}
        />
      )}
      {removing && (
        <RemoveModal record={removing} onClose={() => setRemoving(null)} onConfirm={handleRemove} />
      )}
      {logoBrand && (
        <BrandLogoModal brand={logoBrand} onClose={() => setLogoBrandId(null)}
          onSaved={() => { refreshBrandRow(); }} />
      )}
      {creatingBrand && (
        <CreateBrandModal
          onClose={() => setCreatingBrand(false)}
          onCreated={() => refreshBrands?.()}
        />
      )}
      {deletingBrand && (
        <RemoveBrandModal
          brand={deletingBrand}
          loginCount={creds.filter(c => c.brandId === deletingBrand.id).length}
          onClose={() => setDeletingBrand(null)}
          onConfirm={async () => {
            await ClientsAPI.remove(deletingBrand.id);
            // Cascades server-side, but the Brand Portal tab's own `creds`
            // list is loaded once client-side and won't otherwise notice
            // this brand's logins are gone until the next full reload.
            setCreds(prev => prev.filter(c => c.brandId !== deletingBrand.id));
            setDeletingBrand(null);
            refreshBrands?.();
          }}
        />
      )}
    </div>
  );
}
