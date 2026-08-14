/**
 * AvatarPicker — the one control for setting a profile photo.
 *
 * Used by the Auth page's add/edit modals (internal users and brand portal
 * credentials) and the Profile page, so the 2MB rule, the compression step and
 * the "what does an empty avatar look like" answer are all decided once.
 *
 * ── The three-state value contract ───────────────────────────────────────────
 * `value` mirrors what the backend's PATCH expects, and the distinction is
 * load-bearing (see withAvatar in routes/auth.js):
 *
 *   undefined  — untouched. The caller must OMIT avatarImage from the patch, so
 *                an edit that never opened this control keeps the photo.
 *   null       — the user pressed Remove. Send null to clear it.
 *   data URI   — a new photo. Send it.
 *
 * Collapsing "untouched" and "removed" into one falsy value is what would make
 * renaming a colleague silently delete their photo.
 */
import { useRef, useState } from "react";
import { T } from "../theme/tokens";
import { compressAvatar, AVATAR_ACCEPT } from "../lib/avatar";

export default function AvatarPicker({
  value,            // undefined | null | data URI  (see contract above)
  currentUrl,       // served URL of the photo already on the record, or null
  initials,         // fallback shown when there is no photo at all
  onChange,         // (null | dataUri) => void
  size = 72,
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // A photo that 404s or fails to decode falls back to initials rather than a
  // browser's broken-image glyph, which looks like a bug in the page.
  const [imgBroken, setImgBroken] = useState(false);

  // Pending upload wins; then the stored photo, unless it was just removed
  // (value === null) — otherwise pressing Remove would leave the old image on
  // screen until the modal was saved and reopened.
  const preview = value || (value === null ? null : currentUrl);
  const showImg = !!preview && !imgBroken;

  const pick = async (file) => {
    if (!file) return;
    setErr("");
    setBusy(true);
    try {
      const dataUri = await compressAvatar(file);
      setImgBroken(false);
      onChange(dataUri);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
      // Clearing the input lets the SAME file be picked again after an error or
      // a removal — without this, re-selecting it fires no change event.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const btn = {
    padding: "5px 11px", borderRadius: 5, fontSize: 10.5, fontWeight: 500,
    fontFamily: "'Sora'", cursor: disabled ? "not-allowed" : "pointer",
    background: "transparent", border: `1px solid ${T.border}`, color: T.sub,
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        title={disabled ? undefined : "Upload a profile photo"}
        style={{
          width: size, height: size, borderRadius: "50%", flexShrink: 0,
          overflow: "hidden", position: "relative",
          background: showImg ? T.mute : T.accent,
          color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'Sora'", fontWeight: 600, fontSize: size * 0.32,
          border: `1px solid ${T.border}`,
          cursor: disabled ? "default" : "pointer",
        }}
      >
        {showImg
          ? <img src={preview} alt="" onError={() => setImgBroken(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : (initials || "?")}
        {busy && (
          <div style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, letterSpacing: "0.04em",
          }}>…</div>
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" style={btn} disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}>
            {preview ? "Change photo" : "Upload photo"}
          </button>
          {preview && (
            <button type="button" disabled={disabled || busy}
              onClick={() => { setImgBroken(false); onChange(null); }}
              style={{ ...btn, color: T.red, borderColor: `${T.red}30` }}>
              Remove
            </button>
          )}
        </div>
        <div style={{ fontSize: 9.5, color: err ? T.red : T.label, marginTop: 5, lineHeight: 1.5 }}>
          {err || "Optional · PNG, JPEG or WebP · up to 2MB"}
        </div>
      </div>

      <input
        ref={inputRef} type="file" accept={AVATAR_ACCEPT} hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />
    </div>
  );
}
