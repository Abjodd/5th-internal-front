/**
 * 5th Avenue — Pitch Draft (New Brand)
 * ─────────────────────────────────────────────────────────────────
 * The other half of Pitch Client: pitching a brand that isn't in the system
 * yet. Pitch Client (../PitchClient) always needs an existing Client +
 * Campaign to hang a pitch off — this is for the prospect stage before
 * either exists. A combined brand+campaign-lite form, a freeform written
 * brief (any number of heading/body sections — no fixed template, briefs
 * don't share a shape), a list of suggested reel links, and the same
 * candidate-profile composer Pitch Client uses — all living on one small
 * "draft" document (see the backend's models/PitchDraft.js) until the
 * internal team decides this is real and clicks "Create actual campaign".
 * That button sits exactly where Ship to Creators sits on a real pitch —
 * a draft has nothing to literally ship until it becomes one.
 *
 * Client-facing order (their public link) is Brief → Creators suggested →
 * Suggested Content — a different order than this editor, which is built
 * Brief → Suggested Content → Profiles, because a team member fills the
 * candidate list last, after the brief and reference content are settled.
 *
 * Rendered as a tab inside the same modal as Pitch Client (see
 * PitchClientModal in pages/Campaigns/index.jsx) — but only the launcher
 * (resume a prospect, or start one) lives in that modal. A prospect being
 * actively worked — the form, the brief, the composer — needs more room
 * than a modal tab can give it, so opening or creating one navigates to its
 * own full page (see ../PitchDraftPage, route /pitch-drafts/:id in App.jsx)
 * and closes the modal. `DraftEditor` is exported here so that page can
 * render the exact same editor this file used to show inline.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { T } from "../../theme/tokens";
import { PitchDraftAPI } from "../../lib/api";
import { fmtCompact, initials } from "../../lib/format";
import { Link2, RefreshCw, Trash2, BadgeCheck, Sparkles, Plus, X, Eye, EyeOff, ArrowLeft, ExternalLink } from "lucide-react";

const CLIENT_PORTAL_URL = (import.meta.env.VITE_CLIENT_PORTAL_URL || "https://www.fifth-avenue.in").replace(/\/$/, "");

const STATUS_META = {
  pending: { label: "Pending", color: T.label },
  approved: { label: "Approved", color: T.green },
  rejected: { label: "Rejected", color: T.red },
};

// Launcher only — resume a prospect already in progress, or start a new
// one. Opening either navigates to the prospect's own full page and closes
// this modal (`onClose`), the same way PitchClient's goCreateCampaign
// closes itself before navigating to New Campaign.
export default function PitchDraft({ onClose = () => {} } = {}) {
  const { user } = useOutletContext() || {};
  const navigate = useNavigate();

  const [drafts, setDrafts] = useState(null); // null = loading

  useEffect(() => {
    PitchDraftAPI.list().then(setDrafts).catch(() => setDrafts([]));
  }, []);

  const openDraft = (id) => { onClose(); navigate(`/pitch-drafts/${id}`); };
  const onCreated = (created) => { onClose(); navigate(`/pitch-drafts/${created.id}`); };

  return (
    <div style={{ background: T.bg, padding: "20px 22px 24px" }}>
      <DraftList drafts={drafts} onOpen={openDraft} onCreated={onCreated} createdBy={user?.name} />
    </div>
  );
}

// ── LIST: resume an in-progress prospect, or start a new one ──────────────
function DraftList({ drafts, onOpen, onCreated, createdBy }) {
  const [showNew, setShowNew] = useState(false);
  const [f, setF] = useState({ brandName: "", campaignName: "", service: "Influencer Marketing", region: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const u = (k, v) => setF((prev) => ({ ...prev, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    const brandName = f.brandName.trim();
    if (!brandName) return;
    setSaving(true);
    setErr(null);
    try {
      const created = await PitchDraftAPI.create({ ...f, brandName, createdBy });
      onCreated(created);
    } catch (err) {
      setErr(err.body?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  if (showNew || (drafts && drafts.length === 0)) {
    return (
      <div style={{ maxWidth: 480, margin: "12px auto" }}>
        <div style={{ fontFamily: "'Newsreader',serif", fontSize: 16, fontStyle: "italic", color: T.text, marginBottom: 4 }}>
          Pitch a new brand
        </div>
        <div style={{ fontSize: 10.5, color: T.sub, marginBottom: 18, lineHeight: 1.5 }}>
          Nothing here becomes a real brand or campaign until you click "Create actual campaign" further in — this is just a prospect.
        </div>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Brand name">
            <input value={f.brandName} onChange={(e) => u("brandName", e.target.value)} placeholder="e.g. PaperBoat" style={inputStyle} autoFocus />
          </Field>
          <Field label="Campaign name" optional>
            <input value={f.campaignName} onChange={(e) => u("campaignName", e.target.value)} placeholder="e.g. Summer UGC push" style={inputStyle} />
          </Field>
          <div style={{ display: "flex", gap: 12 }}>
            <Field label="Service" optional style={{ flex: 1 }}>
              <input value={f.service} onChange={(e) => u("service", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Region" optional style={{ flex: 1 }}>
              <input value={f.region} onChange={(e) => u("region", e.target.value)} placeholder="e.g. South India" style={inputStyle} />
            </Field>
          </div>
          {err && <div style={{ fontSize: 11, color: T.red }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            {drafts && drafts.length > 0 && (
              <button type="button" onClick={() => setShowNew(false)} style={secondaryBtn}>Cancel</button>
            )}
            <button type="submit" disabled={saving || !f.brandName.trim()} style={{ ...primaryBtn, opacity: saving || !f.brandName.trim() ? 0.5 : 1 }}>
              {saving ? "Starting…" : "Start prospect"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (drafts == null) return <Notice>Loading…</Notice>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 10.5, color: T.sub }}>Prospects being worked, or already promoted.</div>
        <button onClick={() => setShowNew(true)} style={primaryBtn}><Plus size={13} /> New brand</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {drafts.map((d) => (
          <button
            key={d.id}
            onClick={() => onOpen(d.id)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              padding: "12px 14px", borderRadius: T.radius, border: `1px solid ${T.border}`,
              background: T.surface, cursor: "pointer", textAlign: "left", fontFamily: "'Sora'",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>
                {d.brandName}{d.campaignName ? ` — ${d.campaignName}` : ""}
              </div>
              <div style={{ fontSize: 10, color: T.label, marginTop: 2 }}>
                {d.profileCount} candidate{d.profileCount === 1 ? "" : "s"}
                {d.approvedCount > 0 ? ` · ${d.approvedCount} approved` : ""}
                {d.briefSectionCount > 0 ? ` · brief started` : ""}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <span style={{
                padding: "2px 10px", borderRadius: 10, fontSize: 9.5, fontWeight: 500,
                color: d.status === "promoted" ? T.green : T.accent,
                background: d.status === "promoted" ? `${T.green}14` : `${T.accent}14`,
                border: `1px solid ${d.status === "promoted" ? T.green : T.accent}28`,
              }}>
                {d.status === "promoted" ? "Promoted" : "Draft"}
              </span>
              <ExternalLink size={12} color={T.label} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── EDITOR: one prospect in full ───────────────────────────────────────────
// Exported so PitchDraftPage (the big standalone page — see that file's own
// comment for why a prospect being actively worked needs more room than
// this component's launcher tab in the Pitch Client modal can give it) can
// render exactly the same editor.
export function DraftEditor({ draft, setDraft, onBack, backLabel = "All prospects", onPromoted, showToast, createdBy }) {
  const readOnly = draft.status === "promoted";

  const patchField = useCallback(async (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    try {
      await PitchDraftAPI.update(draft.id, { [key]: value });
    } catch (err) {
      showToast(err.body?.error || err.message);
    }
  }, [draft.id, setDraft, showToast]);

  return (
    <div>
      {onBack && <button onClick={onBack} style={{ ...secondaryBtn, marginBottom: 16 }}><ArrowLeft size={12} /> {backLabel}</button>}

      {readOnly && (
        <div style={{
          padding: "10px 14px", borderRadius: T.radius, background: `${T.green}0F`,
          border: `1px solid ${T.green}33`, fontSize: 11, color: T.text, marginBottom: 16,
        }}>
          Promoted — this brand and campaign are now real. This page stays as the archived record of the brief and suggested content; nothing here can be edited anymore.
        </div>
      )}

      <BrandCampaignFields draft={draft} onChange={patchField} readOnly={readOnly} />

      <Section title="Brief" hint="Freeform — add as many heading/text sections as this pitch needs.">
        <BriefEditor draftId={draft.id} sections={draft.briefSections || []} setDraft={setDraft} readOnly={readOnly} showToast={showToast} />
      </Section>

      <Section title="Suggested content" hint="Reel links the team is suggesting as reference or direction.">
        <SuggestedContent draftId={draft.id} links={draft.suggestedContent || []} setDraft={setDraft} readOnly={readOnly} createdBy={createdBy} showToast={showToast} />
      </Section>

      <Section title="Candidate creators" hint="Same composer as Pitch Client — the client decides on these from their own link.">
        <ClientLink draft={draft} setDraft={setDraft} showToast={showToast} />
        <ProfileComposer draftId={draft.id} setDraft={setDraft} readOnly={readOnly} createdBy={createdBy} showToast={showToast} />
        <ProfileGrid profiles={draft.profiles || []} draftId={draft.id} setDraft={setDraft} readOnly={readOnly} showToast={showToast} />
      </Section>

      {!readOnly && (
        <PromoteBar draft={draft} onPromoted={onPromoted} createdBy={createdBy} showToast={showToast} />
      )}
    </div>
  );
}

function BrandCampaignFields({ draft, onChange, readOnly }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 22, paddingBottom: 18, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", gap: 12 }}>
        <Field label="Brand name" style={{ flex: 1 }}>
          <DebouncedInput value={draft.brandName || ""} onCommit={(v) => onChange("brandName", v)} style={inputStyle} disabled={readOnly} />
        </Field>
        <Field label="Campaign name" optional style={{ flex: 1 }}>
          <DebouncedInput value={draft.campaignName || ""} onCommit={(v) => onChange("campaignName", v)} style={inputStyle} disabled={readOnly} />
        </Field>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <Field label="Service" optional style={{ flex: 1 }}>
          <DebouncedInput value={draft.service || ""} onCommit={(v) => onChange("service", v)} style={inputStyle} disabled={readOnly} />
        </Field>
        <Field label="Region" optional style={{ flex: 1 }}>
          <DebouncedInput value={draft.region || ""} onCommit={(v) => onChange("region", v)} placeholder="e.g. South India" style={inputStyle} disabled={readOnly} />
        </Field>
      </div>
      <Field label="Objective" optional>
        <DebouncedInput value={draft.objective || ""} onCommit={(v) => onChange("objective", v)} multiline style={inputStyle} disabled={readOnly} />
      </Field>
      <div style={{ display: "flex", gap: 12 }}>
        <Field label="Audience" optional style={{ flex: 1 }}>
          <DebouncedInput value={draft.audience || ""} onCommit={(v) => onChange("audience", v)} multiline style={inputStyle} disabled={readOnly} />
        </Field>
        <Field label="Key messages" optional style={{ flex: 1 }}>
          <DebouncedInput value={draft.messages || ""} onCommit={(v) => onChange("messages", v)} multiline style={inputStyle} disabled={readOnly} />
        </Field>
      </div>
    </div>
  );
}

// A text input that only writes back on blur (or Enter) rather than on
// every keystroke — this form auto-saves per field, and firing a PATCH on
// every character would be both noisy and a race against itself.
function DebouncedInput({ value, onCommit, multiline, disabled, ...props }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  const Tag = multiline ? "textarea" : "input";
  return (
    <Tag
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onCommit(local); }}
      onKeyDown={(e) => { if (!multiline && e.key === "Enter") e.currentTarget.blur(); }}
      disabled={disabled}
      rows={multiline ? 2 : undefined}
      {...props}
    />
  );
}

// ── BRIEF ───────────────────────────────────────────────────────────────
function BriefEditor({ draftId, sections, setDraft, readOnly, showToast }) {
  const [local, setLocal] = useState(sections);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setLocal(sections); }, [sections]);

  const dirty = useMemo(() => JSON.stringify(local) !== JSON.stringify(sections), [local, sections]);

  const addSection = () => setLocal((prev) => [...prev, { id: `new_${Date.now()}`, heading: "", body: "" }]);
  const removeSection = (id) => setLocal((prev) => prev.filter((s) => s.id !== id));
  const updateSection = (id, key, value) => setLocal((prev) => prev.map((s) => (s.id === id ? { ...s, [key]: value } : s)));

  const save = async () => {
    setSaving(true);
    try {
      const { sections: saved } = await PitchDraftAPI.saveBrief(draftId, local);
      setDraft((prev) => ({ ...prev, briefSections: saved }));
      showToast("Brief saved.");
    } catch (err) {
      showToast(err.body?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  if (preview) {
    return (
      <div>
        <button onClick={() => setPreview(false)} style={{ ...secondaryBtn, marginBottom: 12 }}><EyeOff size={12} /> Back to editing</button>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "18px 20px" }}>
          {local.length === 0 ? (
            <div style={{ fontSize: 11, color: T.label, fontStyle: "italic" }}>No brief written yet.</div>
          ) : local.map((s) => (
            <div key={s.id} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: T.accent, marginBottom: 4 }}>
                {s.heading || "Untitled section"}
              </div>
              <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {s.body || <span style={{ color: T.label, fontStyle: "italic" }}>Empty</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {!readOnly && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setPreview(true)} style={secondaryBtn}><Eye size={12} /> Preview</button>
          <button onClick={addSection} style={secondaryBtn}><Plus size={12} /> Add section</button>
          <div style={{ flex: 1 }} />
          <button onClick={save} disabled={!dirty || saving} style={{ ...primaryBtn, opacity: !dirty || saving ? 0.5 : 1 }}>
            {saving ? "Saving…" : dirty ? "Save brief" : "Saved"}
          </button>
        </div>
      )}
      {readOnly && (
        <button onClick={() => setPreview(true)} style={{ ...secondaryBtn, marginBottom: 12 }}><Eye size={12} /> Preview</button>
      )}
      {local.length === 0 ? (
        <Notice tone="empty">No brief sections yet — add a heading and text above.</Notice>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {local.map((s) => (
            <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 12 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <input
                  value={s.heading}
                  onChange={(e) => updateSection(s.id, "heading", e.target.value)}
                  placeholder="Heading — e.g. About the Brand"
                  style={{ ...inputStyle, fontWeight: 600 }}
                  disabled={readOnly}
                />
                <textarea
                  value={s.body}
                  onChange={(e) => updateSection(s.id, "body", e.target.value)}
                  placeholder="Text for this section…"
                  rows={3}
                  style={inputStyle}
                  disabled={readOnly}
                />
              </div>
              {!readOnly && (
                <button onClick={() => removeSection(s.id)} title="Remove section" style={iconBtn}><X size={13} /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SUGGESTED CONTENT ──────────────────────────────────────────────────────
// An Instagram link gets fetched via Hiker at add time (see POST
// /api/pitch-drafts/:id/content) and comes back with `media` — a one-time
// snapshot (thumbnail, caption, counts), same as Trending/Market Watch's own
// reel cards. That snapshot only exists while this is a prospect: the
// backend strips it at promote time, so a promoted draft's suggested
// content falls back to plain links here too.
function SuggestedContent({ draftId, links, setDraft, readOnly, createdBy, showToast }) {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    setAdding(true);
    try {
      const entry = await PitchDraftAPI.addContent(draftId, url.trim(), note.trim() || null, createdBy);
      setDraft((prev) => ({ ...prev, suggestedContent: [...(prev.suggestedContent || []), entry] }));
      setUrl(""); setNote("");
    } catch (err) {
      showToast(err.body?.error || err.message);
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id) => {
    try {
      await PitchDraftAPI.removeContent(draftId, id);
      setDraft((prev) => ({ ...prev, suggestedContent: (prev.suggestedContent || []).filter((c) => c.id !== id) }));
    } catch (err) {
      showToast(err.body?.error || err.message);
    }
  };

  return (
    <div>
      {!readOnly && (
        <form onSubmit={add} style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Instagram reel or post link…" style={{ ...inputStyle, flex: "2 1 220px" }} disabled={adding} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={{ ...inputStyle, flex: "1 1 160px" }} disabled={adding} />
          <button type="submit" disabled={adding || !url.trim()} style={{ ...primaryBtn, opacity: adding || !url.trim() ? 0.5 : 1 }}>
            {adding ? "Fetching…" : "Add"}
          </button>
        </form>
      )}
      {links.length === 0 ? (
        <Notice tone="empty">No suggested content yet.</Notice>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {links.map((c) => (
            <SuggestedContentCard key={c.id} c={c} onRemove={readOnly ? null : () => remove(c.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestedContentCard({ c, onRemove }) {
  const m = c.media;
  const [hovered, setHovered] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef(null);

  // A one-time snapshot taken when the link was added — by the time someone
  // views this card later, Instagram's signed video URL may have expired.
  // videoExpiresAt is computed at fetch time (see portalReels.js toReel); if
  // it's passed, skip playback — the thumbnail still works fine.
  const canPlay = !!m?.video && (!m.videoExpiresAt || Date.parse(m.videoExpiresAt) > Date.now());

  useEffect(() => {
    if (!hovered) setPlaying(false);
    const video = videoRef.current;
    if (!video) return;
    if (hovered) {
      video.currentTime = 0;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [hovered]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: "relative", background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, overflow: "hidden" }}
    >
      {onRemove && (
        <button onClick={onRemove} title="Remove" style={{ ...iconBtn, position: "absolute", top: 8, right: 8, zIndex: 2, background: "rgba(255,255,255,0.9)" }}>
          <Trash2 size={12} />
        </button>
      )}
      <a href={m?.permalink || c.url} target="_blank" rel="noreferrer noopener" style={{ display: "block", textDecoration: "none" }}>
        {m?.thumbnail ? (
          <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 5", background: T.mute, overflow: "hidden" }}>
            <img src={m.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {canPlay && hovered && (
              <video
                ref={videoRef}
                src={m.video}
                poster={m.thumbnail}
                muted
                loop
                playsInline
                preload="none"
                onCanPlay={() => setPlaying(true)}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  opacity: playing ? 1 : 0,
                  transition: "opacity 200ms ease",
                }}
              />
            )}
          </div>
        ) : (
          <div style={{ width: "100%", aspectRatio: "4 / 5", background: T.mute, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Link2 size={18} color={T.label} />
          </div>
        )}
        <div style={{ padding: "10px 12px" }}>
          {m?.username && <div style={{ fontSize: 10.5, fontWeight: 600, color: T.text, marginBottom: 3 }}>@{m.username}</div>}
          {m?.caption ? (
            <div style={{ fontSize: 10, color: T.sub, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {m.caption}
            </div>
          ) : !m?.username && (
            <div style={{ fontSize: 10.5, color: T.accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.url}</div>
          )}
          {m && (
            <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 9.5, color: T.label }}>
              {m.views != null && <span>{fmtCompact(m.views)} views</span>}
              {m.likes != null && <span>{fmtCompact(m.likes)} likes</span>}
            </div>
          )}
        </div>
      </a>
      {c.note && (
        <div style={{ padding: "0 12px 10px", fontSize: 10, color: T.sub, fontStyle: "italic" }}>{c.note}</div>
      )}
    </div>
  );
}

// ── CLIENT LINK ─────────────────────────────────────────────────────────
function ClientLink({ draft, setDraft, showToast }) {
  const regenerate = async () => {
    try {
      const { pitchCode } = await PitchDraftAPI.regenerateCode(draft.id);
      setDraft((prev) => ({ ...prev, pitchCode }));
      showToast("New link generated — the old one no longer works.");
    } catch (err) {
      showToast(err.body?.error || err.message);
    }
  };
  const link = draft.pitchCode ? `${CLIENT_PORTAL_URL}/pitch-draft/${draft.id}?code=${draft.pitchCode}` : null;
  const copy = () => {
    if (!link) return;
    navigator.clipboard?.writeText(link).then(() => showToast("Link copied."), () => showToast(link));
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      {link ? (
        <>
          <button onClick={copy} style={secondaryBtn}><Link2 size={13} /> Copy client link</button>
          <button onClick={regenerate} title="Generate a new code — the old link stops working" style={iconBtn}><RefreshCw size={13} /></button>
        </>
      ) : (
        <span style={{ fontSize: 11, color: T.label }}>Add a candidate below to generate the client link.</span>
      )}
    </div>
  );
}

// ── PROFILES ────────────────────────────────────────────────────────────
function ProfileComposer({ draftId, setDraft, readOnly, createdBy, showToast }) {
  const [profileUrl, setProfileUrl] = useState("");
  const [adding, setAdding] = useState(false);
  if (readOnly) return null;

  const add = async (e) => {
    e.preventDefault();
    const url = profileUrl.trim();
    if (!url) return;
    setAdding(true);
    try {
      const { profile, pitchCode } = await PitchDraftAPI.addProfile(draftId, url, createdBy);
      setDraft((prev) => ({ ...prev, profiles: [...(prev.profiles || []), profile], pitchCode }));
      setProfileUrl("");
    } catch (err) {
      showToast(err.body?.error || err.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <form onSubmit={add} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <input
        value={profileUrl}
        onChange={(e) => setProfileUrl(e.target.value)}
        placeholder="Paste an Instagram profile URL or @handle…"
        style={{ ...inputStyle, flex: 1 }}
        disabled={adding}
      />
      <button type="submit" disabled={adding || !profileUrl.trim()} style={{ ...primaryBtn, opacity: adding || !profileUrl.trim() ? 0.5 : 1 }}>
        {adding ? "Fetching…" : "Add"}
      </button>
    </form>
  );
}

function ProfileGrid({ profiles, draftId, setDraft, readOnly, showToast }) {
  const [busyId, setBusyId] = useState(null);
  const remove = async (id) => {
    setBusyId(id);
    try {
      await PitchDraftAPI.removeProfile(draftId, id);
      setDraft((prev) => ({ ...prev, profiles: (prev.profiles || []).filter((p) => p.id !== id) }));
    } catch (err) {
      showToast(err.body?.error || err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (profiles.length === 0) return <Notice tone="empty">Nothing pitched yet — paste a profile above to get started.</Notice>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 16 }}>
      {profiles.map((p) => (
        <ProfileCard key={p.id} p={p} busy={busyId === p.id} onRemove={readOnly ? null : () => remove(p.id)} />
      ))}
    </div>
  );
}

// Same card as Pitch Client's own ProfileCard — kept visually identical so
// a candidate looks the same whether it's pitched to an existing brand or a
// prospect one.
function ProfileCard({ p, busy, onRemove }) {
  const meta = STATUS_META[p.status] || STATUS_META.pending;
  // A view-count of exactly 0 is the stale HikerAPI artefact from before the
  // media-type fix (photo/carousel posts reported play_count: 0 rather than
  // omitting the field) — treat it the same as "no data" rather than
  // printing a misleading zero. Same guard PitchApprove's own card and the
  // public Pitch Draft page already apply; this internal card was missing
  // it, which is why a directory-sourced candidate with only photo posts
  // could show "0" here instead of hiding the stat.
  const avgViews = p.avgViews > 0 ? p.avgViews : null;
  return (
    <div style={{
      position: "relative", display: "flex", flexDirection: "column", alignItems: "center",
      textAlign: "center", background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: T.radius, padding: "24px 16px 16px", boxShadow: T.shadow,
    }}>
      {onRemove && (
        <button
          onClick={onRemove}
          disabled={busy}
          title="Remove"
          style={{ ...iconBtn, position: "absolute", top: 10, right: 10, color: T.label, opacity: busy ? 0.5 : 1 }}
        >
          <Trash2 size={13} />
        </button>
      )}

      {p.avatar ? (
        <img
          src={PitchDraftAPI.avatarUrl(p.avatar)}
          alt=""
          style={{ width: 76, height: 76, borderRadius: "50%", objectFit: "cover", border: `2px solid ${T.border}`, boxShadow: T.shadow }}
        />
      ) : (
        <div style={{
          width: 76, height: 76, borderRadius: "50%", background: `${T.teal}16`, color: T.teal,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 600,
          border: `2px solid ${T.border}`,
        }}>
          {initials(p.name || p.handle)}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.name || p.handle}
        </div>
        {p.isVerified && <BadgeCheck size={13} color={T.accent} style={{ flexShrink: 0 }} />}
      </div>
      <a
        href={`https://instagram.com/${encodeURIComponent(p.handle)}`}
        target="_blank"
        rel="noreferrer noopener"
        style={{ fontSize: 11, color: T.sub, marginBottom: 10, textDecoration: "none" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = T.accent; e.currentTarget.style.textDecoration = "underline"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = T.sub; e.currentTarget.style.textDecoration = "none"; }}
      >
        @{p.handle}
      </a>

      {p.bio && (
        <div style={{ fontSize: 10.5, color: T.sub, marginBottom: 12, lineHeight: 1.4, maxWidth: 210, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {p.bio}
        </div>
      )}

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, auto)", columnGap: 16, rowGap: 8,
        fontSize: 11, marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${T.border}`, width: "100%",
        justifyContent: "center",
      }}>
        <Stat label="Followers" value={fmtCompact(p.followers)} />
        <Stat label="Following" value={fmtCompact(p.following)} />
        <Stat label="Posts" value={fmtCompact(p.posts)} />
        <Stat label="Avg likes" value={fmtCompact(p.avgLikes)} />
        {avgViews != null && <Stat label="Avg views" value={fmtCompact(avgViews)} />}
        {p.avgER != null && <Stat label="ER" value={`${(+p.avgER).toFixed(1)}%`} />}
      </div>

      <span style={{
        display: "inline-block", padding: "2px 10px", borderRadius: 10, fontSize: 9.5, fontWeight: 500,
        color: meta.color, background: `${meta.color}14`, border: `1px solid ${meta.color}28`,
      }}>
        {meta.label}
      </span>
    </div>
  );
}

// ── PROMOTE ─────────────────────────────────────────────────────────────
// Sits exactly where Pitch Client's "Ship to Creators" bar sits — a draft
// has nothing to ship, so this is what fills that slot: the moment the
// internal team decides a prospect is a real deal.
function PromoteBar({ draft, onPromoted, createdBy, showToast }) {
  const [promoting, setPromoting] = useState(false);
  const approvedCount = (draft.profiles || []).filter((p) => p.status === "approved").length;

  const promote = async () => {
    setPromoting(true);
    try {
      const result = await PitchDraftAPI.promote(draft.id, createdBy);
      onPromoted(result);
    } catch (err) {
      showToast(err.body?.error || err.message);
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      background: `${T.accent}0F`, border: `1px solid ${T.accent}33`, borderRadius: T.radius,
      padding: "14px 16px", marginTop: 22,
    }}>
      <div style={{ fontSize: 11.5, color: T.text }}>
        <strong>{draft.brandName}</strong> becomes a real brand, its campaign goes live
        {approvedCount > 0 ? <>, and <strong>{approvedCount}</strong> client-approved candidate{approvedCount === 1 ? "" : "s"} carry over ready to ship</> : ""}.
        The brief and suggested content stay here, on this archived draft.
      </div>
      <button onClick={promote} disabled={promoting} style={{ ...primaryBtn, background: T.accent, opacity: promoting ? 0.6 : 1, flexShrink: 0 }}>
        <Sparkles size={13} />
        {promoting ? "Creating…" : "Create actual campaign"}
      </button>
    </div>
  );
}

// ── SHARED ──────────────────────────────────────────────────────────────
function Section({ title, hint, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.text, marginBottom: 2 }}>{title}</div>
      {hint && <div style={{ fontSize: 10, color: T.label, marginBottom: 10 }}>{hint}</div>}
      {children}
    </div>
  );
}

function Field({ label, optional, children, style }) {
  return (
    <div style={style}>
      <div style={{ fontSize: 9.5, color: T.label, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
        {label}{optional && <span style={{ opacity: 0.6 }}> · optional</span>}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ color: T.text, fontWeight: 600 }}>{value}</div>
      <div style={{ color: T.label, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
    </div>
  );
}

function Notice({ children, tone }) {
  return (
    <div style={{ padding: 24, fontSize: 11.5, color: tone === "empty" ? T.label : T.sub, textAlign: "center", fontStyle: tone === "empty" ? "italic" : "normal" }}>
      {children}
    </div>
  );
}

const inputStyle = {
  padding: "9px 12px", borderRadius: 8, background: T.surface,
  border: `1px solid ${T.border}`, color: T.text, fontSize: 12,
  fontFamily: "'Sora'", outline: "none", width: "100%", boxSizing: "border-box",
};
const primaryBtn = {
  padding: "9px 16px", borderRadius: 8, border: "none", fontSize: 11.5, fontWeight: 600,
  fontFamily: "'Sora'", cursor: "pointer", background: T.accent, color: "#FFFFFF",
  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
};
const secondaryBtn = {
  padding: "8px 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 500, fontFamily: "'Sora'",
  cursor: "pointer", background: "transparent", color: T.accent, border: `1px solid ${T.accent}55`,
  display: "inline-flex", alignItems: "center", gap: 6,
};
const iconBtn = {
  width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.border}`, background: "transparent",
  color: T.sub, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
};
