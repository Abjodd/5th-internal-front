/**
 * 5th Avenue — Internal OS · Your profile
 *
 * Reached from the app shell's user chip (top right). Mirrors the client
 * portal's Settings → Profile pane so the two products answer "who am I signed
 * in as" the same way.
 *
 * ── What is editable here, and why so little ────────────────────────────────
 * Your PHOTO, and nothing else.
 *
 * Everything else on this page — name, role, team id, login email — is what the
 * founder set on Access & Credentials, and several of those fields are load
 * bearing elsewhere: `teamId` is the id campaigns store in amId/cmId/eaId, so
 * editing it here would silently detach someone from every campaign they own,
 * and `role` is the access-control key. Those belong on the founder's page,
 * behind the founder's judgement, not on a self-serve screen.
 *
 * A photo is the one thing that is genuinely yours, affects nothing but how you
 * appear, and is tedious to ask someone else to change — so it is the one thing
 * you can change here.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { UsersAPI } from "../../lib/api";
import { getRole } from "../../routes/sections";
import { T } from "../../theme/tokens";
import AvatarPicker from "../../components/AvatarPicker";

const initialsOf = (s) =>
  (s || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function Field({ label, value, mono = false }) {
  const empty = value == null || value === "";
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10,
      padding: "12px 14px",
    }}>
      <div style={{
        fontSize: 9, fontWeight: 600, color: T.label,
        textTransform: "uppercase", letterSpacing: "0.08em",
      }}>{label}</div>
      <div style={{
        marginTop: 5, fontSize: 13, fontWeight: 500,
        color: empty ? T.label : T.text,
        fontFamily: mono ? "monospace" : "'Sora', sans-serif",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }} title={empty ? undefined : String(value)}>
        {empty ? "—" : value}
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  // Three-state, same contract as the Auth page's modal: undefined = untouched,
  // null = remove, data URI = new photo. See components/AvatarPicker.
  const [avatarImage, setAvatarImage] = useState(undefined);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { tone: "ok" | "err", text }

  if (!user) return null;

  const roleLabel = getRole(user.role)?.label || user.role;
  const dirty = avatarImage !== undefined;

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const updated = await UsersAPI.update(user.id, { avatarImage });
      // Push the result back into the session so the shell's chip repaints
      // immediately — otherwise your new photo appears everywhere except the
      // one place you are looking at when you upload it.
      updateUser({ hasAvatar: updated.hasAvatar, avatarUpdatedAt: updated.avatarUpdatedAt });
      setAvatarImage(undefined);
      setMsg({ tone: "ok", text: avatarImage ? "Photo updated." : "Photo removed." });
    } catch (e) {
      // The backend's own message is the useful one here ("must be 2MB or
      // smaller", "must be a PNG, JPEG or WebP image"), so it is surfaced
      // rather than replaced with a generic failure.
      setMsg({ tone: "err", text: e.body?.error || "Could not save your photo. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const btn = (variant) => ({
    padding: "9px 18px", borderRadius: 7, fontSize: 12, fontWeight: 500,
    fontFamily: "'Sora', sans-serif", cursor: "pointer", transition: "all 0.12s",
    ...(variant === "primary"
      ? { background: T.accent, color: "#FFF", border: `1px solid ${T.accent}` }
      : { background: "transparent", color: T.sub, border: `1px solid ${T.border}` }),
  });

  return (
    <div style={{ flex: 1, overflowY: "auto", background: T.bg, padding: "26px 30px 60px" }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            display: "flex", alignItems: "center", gap: 6, marginBottom: 18,
            padding: "6px 12px", borderRadius: 999, background: T.surface,
            border: `1px solid ${T.border}`, color: T.sub, fontSize: 11.5,
            fontFamily: "'Sora', sans-serif", cursor: "pointer",
          }}
        >
          <ArrowLeft size={13} /> Back
        </button>

        <div style={{
          fontFamily: "'Newsreader', serif", fontStyle: "italic",
          fontSize: 26, fontWeight: 600, color: T.text,
        }}>
          Your profile
        </div>
        <div style={{ fontSize: 11.5, color: T.sub, marginTop: 5, marginBottom: 22 }}>
          How you appear across the platform. Your details are managed by the founder on Access &amp; Credentials.
        </div>

        {/* Photo — the one editable thing on this page */}
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12,
          padding: "22px 24px", marginBottom: 16, boxShadow: T.shadow,
        }}>
          <div style={{
            fontSize: 9, fontWeight: 600, color: T.label,
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14,
          }}>
            Profile photo
          </div>

          <AvatarPicker
            value={avatarImage}
            currentUrl={UsersAPI.avatarUrl(user)}
            initials={user.avatar || initialsOf(user.name)}
            onChange={(v) => { setAvatarImage(v); setMsg(null); }}
            size={88}
            disabled={saving}
          />

          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.border}`,
          }}>
            {/* Only enabled once something has actually changed, so the button
                can never post an avatarImage of `undefined` — which the backend
                would read as "field absent" and quietly do nothing. */}
            <button onClick={save} disabled={!dirty || saving}
              style={{ ...btn("primary"), opacity: !dirty || saving ? 0.5 : 1, cursor: !dirty || saving ? "not-allowed" : "pointer" }}>
              {saving ? "Saving…" : "Save photo"}
            </button>
            {dirty && !saving && (
              <button onClick={() => { setAvatarImage(undefined); setMsg(null); }} style={btn()}>
                Cancel
              </button>
            )}
            {msg && (
              <span style={{ fontSize: 11.5, color: msg.tone === "ok" ? T.green : T.red }}>
                {msg.text}
              </span>
            )}
          </div>
        </div>

        {/* Account — read-only, for the reasons in the file header */}
        <div style={{
          fontSize: 9, fontWeight: 600, color: T.label,
          textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10,
        }}>
          Account
        </div>
        <div style={{
          display: "grid", gap: 10,
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        }}>
          <Field label="Full name" value={user.name} />
          <Field label="Role" value={roleLabel} />
          <Field label="Title" value={user.title} />
          <Field label="Login email" value={user.email || user.username} mono />
          {/* Surfaced read-only precisely because it is the link between this
              user and every campaign they own (amId/cmId/eaId). */}
          <Field label="Team ID" value={user.teamId} mono />
          <Field label="Account ID" value={user.id} mono />
        </div>

        <div style={{ marginTop: 26, paddingTop: 20, borderTop: `1px solid ${T.border}` }}>
          <button
            onClick={() => { logout(); navigate("/login", { replace: true }); }}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 16px", borderRadius: 7, background: "transparent",
              border: `1px solid ${T.red}30`, color: T.red, fontSize: 12,
              fontWeight: 500, fontFamily: "'Sora', sans-serif", cursor: "pointer",
            }}
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
