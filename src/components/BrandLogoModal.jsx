/**
 * BrandLogoModal — set the logo that identifies a brand everywhere.
 *
 * The backend has stored a logo on the Client document for a while, and plenty
 * reads it: the campaign board's masthead, the accent every tile in that brand's
 * group is tinted with, a portal member's fallback picture. But there was no way
 * to SET one — the only avatar controls wrote to a user or a brand credential,
 * which are people, not the brand.
 *
 * The website field is here because it is what makes the suggestion possible and
 * no brand has one stored: type the site once, get the brand's own icon offered
 * back, confirm. It is saved alongside the logo so it is only typed once ever.
 *
 * Nothing is written until Save — the suggestion is a data URI in state, committed
 * through the same PATCH an uploaded file takes, so a logo has one write path.
 */
import { useState } from "react";
import { ClientsAPI } from "../lib/api";
import { initials } from "../lib/format";
import { T } from "../theme/tokens";
import AvatarPicker from "./AvatarPicker";

const Lbl = ({ children }) => (
  <label style={{
    display: "block", fontSize: 9, fontWeight: 600, color: T.label,
    textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4,
  }}>{children}</label>
);

const INP = {
  padding: "7px 10px", borderRadius: 5, background: T.surface,
  border: `1px solid ${T.border}`, color: T.text, fontSize: 11.5,
  fontFamily: "'Sora'", outline: "none",
};

const Btn = ({ variant = "ghost", disabled, onClick, children }) => (
  <button type="button" onClick={onClick} disabled={disabled} style={{
    padding: "8px 16px", borderRadius: 6, fontSize: 11.5, fontWeight: 500,
    fontFamily: "'Sora'", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1, transition: "all 0.12s",
    ...(variant === "primary"
      ? { background: T.accent, color: "#FFF", border: `1px solid ${T.accent}` }
      : { background: "transparent", color: T.sub, border: `1px solid ${T.border}` }),
  }}>{children}</button>
);

export default function BrandLogoModal({ brand, onClose, onSaved }) {
  const [website, setWebsite] = useState(brand.website || "");
  // undefined = untouched, null = remove, data URI = new logo. The same
  // three-state contract AvatarPicker and the backend's withAvatar() use.
  const [avatarImage, setAvatarImage] = useState(undefined);
  const [suggestion, setSuggestion] = useState(null); // { dataUri, source }
  const [finding, setFinding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const currentUrl = ClientsAPI.avatarUrl(brand);

  const find = async () => {
    if (!website.trim() || finding) return;
    setFinding(true);
    setErr("");
    setSuggestion(null);
    try {
      setSuggestion(await ClientsAPI.suggestLogo(website.trim()));
    } catch (e) {
      // The backend answers 422 with a sentence written for this dialog
      // ("…may be an .ico file, which we can't store — upload an image
      // instead"), so prefer it over the generic status-code message.
      setErr(e.body?.error || `Couldn't reach that site — ${e.message}`);
    } finally {
      setFinding(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      const patch = { website: website.trim() };
      // Omitted entirely when untouched — sending undefined would be dropped by
      // JSON.stringify anyway, but being explicit is what keeps "I only edited
      // the website" from ever clearing the logo.
      if (avatarImage !== undefined) patch.avatarImage = avatarImage;
      onSaved(await ClientsAPI.update(brand.id, patch));
      onClose();
    } catch (e) {
      setErr(e.body?.error || `Save failed: ${e.message}`);
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(4,5,10,0.55)", backdropFilter: "blur(4px)" }} />
      <div style={{ position: "relative", width: "min(440px,94vw)", maxHeight: "88vh", background: T.surface, border: `1px solid ${T.borderMid}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: T.shadowLg }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'Newsreader',serif", fontSize: 17, color: T.text, fontStyle: "italic" }}>
            Brand logo — {brand.name}
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: T.sub, fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
          <div style={{ marginBottom: 14 }}>
            <Lbl>Website</Lbl>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={website}
                onChange={e => { setWebsite(e.target.value); setErr(""); }}
                onKeyDown={e => { if (e.key === "Enter") find(); }}
                placeholder="nike.com"
                style={{ ...INP, flex: 1, minWidth: 0 }}
              />
              <Btn onClick={find} disabled={!website.trim() || finding}>
                {finding ? "Looking…" : "Find logo"}
              </Btn>
            </div>
            <div style={{ fontSize: 9.5, color: T.label, marginTop: 5 }}>
              Saved on the brand, so it only needs typing once.
            </div>
          </div>

          {/* The confirmation the founder acts on: here is what we found, use it
              or upload your own. Not applied automatically — a fetched icon can
              be a placeholder or the wrong mark entirely, and a logo silently
              changing colour across the whole board is not a surprise anyone
              wants. */}
          {suggestion && (
            <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", marginBottom: 14, background: T.raised, border: `1px solid ${T.border}`, borderRadius: T.radiusSm }}>
              <img src={suggestion.dataUri} alt="" style={{ width: 44, height: 44, borderRadius: 9, objectFit: "contain", background: "#FFF", border: `1px solid ${T.border}`, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11.5, color: T.text, fontWeight: 500 }}>Found this on {website.trim()}</div>
                <div style={{ fontSize: 9.5, color: T.label, marginTop: 2 }}>
                  Set it as the logo, or upload another below to change it.
                </div>
              </div>
              <Btn variant="primary" onClick={() => { setAvatarImage(suggestion.dataUri); setSuggestion(null); }}>
                Use this
              </Btn>
            </div>
          )}

          <Lbl>Logo</Lbl>
          <AvatarPicker
            value={avatarImage}
            currentUrl={currentUrl}
            initials={initials(brand.name)}
            onChange={setAvatarImage}
            radius={12}
            noun="logo"
          />

          <div style={{ fontSize: 9.5, color: T.label, marginTop: 12, lineHeight: 1.6 }}>
            The logo is the brand's identity across the app: it heads the brand's
            campaigns, tints those cards with a colour sampled from it, and stands
            in as the picture for portal members who haven't set their own.
          </div>

          {err && <div style={{ fontSize: 11, color: T.red, marginTop: 10 }}>{err}</div>}
        </div>

        <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <div style={{ flex: 1 }} />
          <Btn variant="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
        </div>
      </div>
    </div>
  );
}
