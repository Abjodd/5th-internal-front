/**
 * 5th Avenue — Managed Creators → Creators
 * ─────────────────────────────────────────────────────────────────
 * The roster of creators we manage directly (managedBy === "fifthavenue",
 * see lib/management.js), redesigned from the ground up around two ideas:
 *
 *   1. The grid is for SCANNING. Each card is a big portrait photo with the
 *      name over it and three numbers under it — nothing that has to be
 *      read to be recognised. No inline expansion, so a card is always the
 *      same size.
 *   2. Detail lives in a DRAWER. Clicking a card slides a panel in from the
 *      right holding the full CreatorDetail (onboarding & billing, campaigns,
 *      agreements, invoices, brand deals) — the exact component the main
 *      Creators directory uses, so the record reads and edits identically
 *      from either page. Prev/next (buttons or ← →) walks the filtered
 *      roster without closing it.
 *
 * Only real fields are shown: no verified badges, bios or invented
 * categories. `niche` is one free-text field, split on commas/slashes into
 * tags. The "Managed by Fifth Avenue" pill is left off the cards (every
 * card on this tab is) and shown once in the drawer, next to the vendor a
 * creator is paid through when one is set — vendorId is independent of
 * managedBy, so both can be true at once.
 *
 * The one thing this tab adds beyond the directory: adding a brand-new
 * creator with no campaign behind them (CreatorsAPI.create).
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, ArrowUpRight, MapPin, Search, Plus } from "lucide-react";
import { AddCreatorModal } from "../Campaigns";
import { CreatorDetail } from "../Creators";
import { Pill, Select, INP, Notice } from "../Creators/shared";
import CreatorAvatar from "../../components/CreatorAvatar";
import CreatorHandle from "../../components/CreatorHandle";
import { CreatorsAPI } from "../../lib/api";
import { fmtCompact, initials } from "../../lib/format";
import { T } from "../../theme/tokens";

// ── helpers ──────────────────────────────────────────────────────────────────
// Same parse as SummaryTab's local copy: "820K" / "1.2M" / "8,20,000" → count.
function parseFollowersLoose(raw) {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const m = /^([\d.]+)\s*(K|M)?$/i.exec(String(raw).trim().replace(/,/g, ""));
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return 0;
  const unit = (m[2] || "").toUpperCase();
  return unit === "M" ? n * 1e6 : unit === "K" ? n * 1e3 : n;
}

const nicheTags = (niche) =>
  String(niche || "").split(/[,/]+/).map(s => s.trim()).filter(Boolean);

const isTyping = (el) =>
  !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

const CSS = `
  .mc-card { cursor: pointer; transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease; }
  .mc-card:hover { transform: translateY(-2px); }
  .mc-card .mc-photo img { transition: transform .45s cubic-bezier(.2,.7,.2,1); }
  .mc-card:hover .mc-photo img { transform: scale(1.04); }
  .mc-card .mc-open { opacity: .55; transition: opacity .2s ease, transform .2s ease; }
  .mc-card:hover .mc-open { opacity: 1; transform: translate(1px,-1px); }
  .mc-card:focus-visible { outline: 2px solid ${T.accent}; outline-offset: 2px; }
  @keyframes mc-fade  { from { opacity: 0 } to { opacity: 1 } }
  @keyframes mc-slide { from { transform: translateX(28px); opacity: 0 } to { transform: none; opacity: 1 } }
`;

// ── photo ────────────────────────────────────────────────────────────────────
// Full-bleed photo sized by aspect-ratio, so it fills the card at any grid
// width. Same contract as CreatorAvatar: only requests a photo the record
// says exists, and falls back to initials if the load fails.
function Photo({ inf, ratio = "4 / 5" }) {
  const src = CreatorsAPI.avatarUrl(inf);
  const [broken, setBroken] = useState(null);
  const box = { width: "100%", aspectRatio: ratio, display: "block" };
  if (src && src !== broken) {
    return <img src={src} alt="" onError={() => setBroken(src)} style={{ ...box, objectFit: "cover", objectPosition: "center 25%" }} />;
  }
  return (
    <div style={{
      ...box, display: "flex", alignItems: "center", justifyContent: "center",
      background: `linear-gradient(160deg, ${T.pink}1F, ${T.purple}1F)`,
      color: T.pink, fontSize: 44, fontWeight: 600, letterSpacing: "0.02em",
    }}>{initials(inf?.name)}</div>
  );
}

// ── card ─────────────────────────────────────────────────────────────────────
const CardStat = ({ label, value, color = T.text, first }) => (
  <div style={{ flex: 1, minWidth: 0, paddingLeft: first ? 0 : 10, borderLeft: first ? "none" : `1px solid ${T.border}` }}>
    <div style={{ fontSize: 14, fontWeight: 600, color, letterSpacing: "-0.01em", lineHeight: 1.2 }}>{value}</div>
    <div style={{ fontSize: 8, color: T.label, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 3 }}>{label}</div>
  </div>
);

function RosterCard({ inf, vendor, onOpen }) {
  const tags = nicheTags(inf.niche);
  const shown = tags.slice(0, 2);
  const more = tags.length - shown.length;

  return (
    <article
      className="cr-card mc-card"
      role="button"
      tabIndex={0}
      aria-label={`Open ${inf.name}`}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      style={{ background: T.surface, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}
    >
      <div className="mc-photo" style={{ position: "relative", overflow: "hidden" }}>
        <Photo inf={inf} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(18,16,12,0) 50%, rgba(18,16,12,0.82) 100%)" }} />

        {inf.platform && (
          <span style={{
            position: "absolute", top: 10, left: 10, fontSize: 9.5, fontWeight: 500, color: T.text,
            background: "rgba(255,255,255,0.9)", backdropFilter: "blur(6px)", padding: "3px 9px", borderRadius: 20,
          }}>{inf.platform}</span>
        )}

        <div style={{ position: "absolute", left: 14, right: 14, bottom: 12, color: "#FFF" }}>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em", textShadow: "0 1px 6px rgba(0,0,0,0.35)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {inf.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, fontSize: 10.5, color: "rgba(255,255,255,0.85)", minWidth: 0 }}>
            {inf.handle && <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{inf.handle}</span>}
            {inf.state && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap", flexShrink: 0 }}>
                <MapPin size={10} /> {inf.state}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: "13px 14px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex" }}>
          <CardStat first label="Followers" value={fmtCompact(inf.followers)} />
          <CardStat label="Avg ER" value={inf.avgER != null && inf.avgER !== "" ? `${inf.avgER}%` : "—"} />
          <CardStat label="Campaigns" value={inf.campaigns.length} color={inf.campaigns.length ? T.teal : T.label} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 22 }}>
          <div style={{ display: "flex", gap: 4, flex: 1, minWidth: 0, overflow: "hidden" }}>
            {vendor && <Pill color={T.gold}>via {vendor.name}</Pill>}
            {shown.map(t => <Pill key={t} color={T.pink}>{t}</Pill>)}
            {more > 0 && <Pill color={T.label}>+{more}</Pill>}
          </div>
          <span className="mc-open" style={{
            width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            background: `${T.accent}0D`, color: T.accent,
          }}><ArrowUpRight size={13} /></span>
        </div>
      </div>
    </article>
  );
}

// ── drawer ───────────────────────────────────────────────────────────────────
const DrawerStat = ({ label, value, color = T.text }) => (
  <div style={{ flex: "1 1 0", minWidth: 0, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px" }}>
    <div style={{ fontSize: 17, fontWeight: 600, color, letterSpacing: "-0.01em" }}>{value}</div>
    <div style={{ fontSize: 8.5, color: T.label, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 3 }}>{label}</div>
  </div>
);

const IconBtn = ({ children, disabled, onClick, label }) => (
  <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} style={{
    width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
    background: "transparent", border: `1px solid ${T.border}`, color: disabled ? T.label : T.text,
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1,
  }}>{children}</button>
);

function CreatorDrawer({ inf, vendor, vendors, position, total, onPrev, onNext, onClose, canEdit, onEdit, onAssign, onSetManagement, onToast, keysEnabled }) {
  // Esc closes, ← → walk the roster — but never while typing in one of the
  // detail panels' forms, and never while a modal (edit creator) is up.
  useEffect(() => {
    if (!keysEnabled) return;
    const onKey = (e) => {
      if (isTyping(e.target)) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && onPrev) onPrev();
      else if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keysEnabled, onClose, onPrev, onNext]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const tags = nicheTags(inf.niche);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(4,5,10,0.42)", backdropFilter: "blur(2px)", animation: "mc-fade .2s ease" }} />

      <aside
        role="dialog"
        aria-label={`${inf.name} — details`}
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0, width: "min(780px, 100vw)",
          background: T.bg, boxShadow: T.shadowLg, display: "flex", flexDirection: "column",
          animation: "mc-slide .26s cubic-bezier(.2,.7,.2,1)",
        }}
      >
        {/* Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 18px", borderBottom: `1px solid ${T.border}`, background: T.surface }}>
          <IconBtn label="Previous creator" disabled={!onPrev} onClick={onPrev}><ChevronLeft size={15} /></IconBtn>
          <IconBtn label="Next creator" disabled={!onNext} onClick={onNext}><ChevronRight size={15} /></IconBtn>
          {position > 0 && <span style={{ fontSize: 10.5, color: T.label, marginLeft: 4 }}>{position} of {total}</span>}
          <div style={{ flex: 1 }} />
          <IconBtn label="Close" onClick={onClose}><X size={15} /></IconBtn>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* Identity */}
          <div style={{ padding: "22px 24px 18px", background: T.surface, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ borderRadius: "50%", padding: 3, background: T.surface, boxShadow: `0 0 0 1px ${T.border}, ${T.shadow}`, flexShrink: 0 }}>
                <CreatorAvatar creator={inf} size={76} radius={38} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Newsreader',serif", fontStyle: "italic", fontSize: 24, color: T.text, lineHeight: 1.15 }}>{inf.name}</div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 4, fontSize: 11, color: T.sub }}>
                  <CreatorHandle creator={inf} style={{ fontSize: 11 }} />
                  {inf.platform && <span>{inf.platform}</span>}
                  {inf.state && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><MapPin size={11} /> {inf.state}</span>}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 9 }}>
                  <Pill color={T.teal}>Managed by Fifth Avenue</Pill>
                  {vendor && <Pill color={T.gold}>Paid via {vendor.name}</Pill>}
                  {tags.map(t => <Pill key={t} color={T.pink}>{t}</Pill>)}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <DrawerStat label="Followers" value={fmtCompact(inf.followers)} />
              <DrawerStat label="Avg ER" value={inf.avgER != null && inf.avgER !== "" ? `${inf.avgER}%` : "—"} />
              <DrawerStat label="Campaigns" value={inf.campaigns.length} color={inf.campaigns.length ? T.teal : T.label} />
              <DrawerStat label="Invoices" value={inf.invoices.length} color={inf.invoices.length ? T.green : T.label} />
            </div>
          </div>

          {/* The full record — same panels as the Creators directory. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "18px 24px 28px" }}>
            {/* key: the Agreements/Projects panels fetch once per mount, so
                stepping prev/next must remount them for the new creator. */}
            <CreatorDetail
              key={inf.id}
              inf={inf} vendor={vendor} vendors={vendors} open
              canEdit={canEdit} onEdit={onEdit} onAssign={onAssign}
              onSetManagement={onSetManagement} onToast={onToast}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}

// ── tab ──────────────────────────────────────────────────────────────────────
export default function CreatorsTab({ creators, vendors, vendorById, canEdit, onAddCreator, onSaveEdit, patchCreator, showToast }) {
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [sortBy, setSortBy] = useState("followers_desc");
  const [openId, setOpenId] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [adding, setAdding] = useState(false);

  const platforms = useMemo(() => [...new Set(creators.map(i => i.platform).filter(Boolean))].sort(), [creators]);
  const states = useMemo(() => [...new Set(creators.map(i => i.state).filter(Boolean))].sort(), [creators]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = creators.filter(i =>
      (!platformFilter || i.platform === platformFilter) &&
      (!stateFilter || i.state === stateFilter) &&
      (!q || [i.name, i.handle, i.niche, i.state, vendorById.get(i.vendorId)?.name, ...(i.campaigns || []).map(c => c.name)]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q))));
    const f = (i) => parseFollowersLoose(i.followers);
    if (sortBy === "followers_desc") rows = [...rows].sort((a, b) => f(b) - f(a));
    else if (sortBy === "followers_asc") rows = [...rows].sort((a, b) => f(a) - f(b));
    else if (sortBy === "er_desc") rows = [...rows].sort((a, b) => (Number(b.avgER) || 0) - (Number(a.avgER) || 0));
    else if (sortBy === "name") rows = [...rows].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    return rows;
  }, [creators, query, platformFilter, stateFilter, sortBy, vendorById]);

  const filtered = !!(query || platformFilter || stateFilter);
  const clearFilters = () => { setQuery(""); setPlatformFilter(""); setStateFilter(""); };

  // The open creator is looked up live from `creators`, so edits made inside
  // the drawer show immediately — and moving someone off Managed (they drop
  // out of `creators`) closes it on its own.
  const selected = openId ? creators.find(c => c.id === openId) : null;
  const idx = selected ? visible.findIndex(c => c.id === openId) : -1;
  const goPrev = useCallback(() => idx > 0 && setOpenId(visible[idx - 1].id), [idx, visible]);
  const goNext = useCallback(() => idx >= 0 && idx < visible.length - 1 && setOpenId(visible[idx + 1].id), [idx, visible]);
  const close = useCallback(() => setOpenId(null), []);

  return (
    <div>
      <style>{CSS}</style>

      {/* Toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ marginRight: "auto", minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
            {visible.length}{filtered ? ` of ${creators.length}` : ""} creator{(filtered ? creators.length : visible.length) === 1 ? "" : "s"}
          </div>
          <div style={{ fontSize: 10.5, color: T.sub, marginTop: 1 }}>Click a creator to see their full profile, billing and brand deals.</div>
        </div>

        <div style={{ position: "relative" }}>
          <Search size={12} color={T.label} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, handle, niche…"
            style={{ ...INP, width: 200, paddingLeft: 26, boxSizing: "border-box" }} />
        </div>
        {platforms.length > 1 && (
          <Select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}>
            <option value="">All platforms</option>
            {platforms.map(p => <option key={p} value={p}>{p}</option>)}
          </Select>
        )}
        {states.length > 0 && (
          <Select value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
            <option value="">All locations</option>
            {states.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        )}
        <Select value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="followers_desc">Most followers</option>
          <option value="followers_asc">Fewest followers</option>
          <option value="er_desc">Highest ER</option>
          <option value="name">Name A–Z</option>
        </Select>
        {filtered && (
          <button type="button" onClick={clearFilters} style={{ fontSize: 10.5, color: T.sub, background: "none", border: "none", cursor: "pointer", fontFamily: "'Sora'", textDecoration: "underline", textUnderlineOffset: 2 }}>
            Clear
          </button>
        )}
        {canEdit && (
          <button onClick={() => setAdding(true)} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "8px 15px", borderRadius: 7, fontSize: 11.5, fontWeight: 500, fontFamily: "'Sora'",
            background: T.accent, color: "#FFF", border: `1px solid ${T.accent}`, cursor: "pointer", whiteSpace: "nowrap",
          }}><Plus size={13} /> Add creator</button>
        )}
      </div>

      {/* Grid */}
      {visible.length === 0 ? (
        <Notice tone="empty">
          {filtered
            ? "No managed creators match your search or filters."
            : "No creators managed directly yet — add one above, or tag an existing creator “Managed by Fifth Avenue” from the Creators tab."}
        </Notice>
      ) : (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {visible.map(inf => (
            <RosterCard key={inf.id} inf={inf} vendor={vendorById.get(inf.vendorId)} onOpen={() => setOpenId(inf.id)} />
          ))}
        </div>
      )}

      {selected && (
        <CreatorDrawer
          inf={selected}
          vendor={vendorById.get(selected.vendorId)}
          vendors={vendors}
          position={idx + 1}
          total={visible.length}
          onPrev={idx > 0 ? goPrev : null}
          onNext={idx >= 0 && idx < visible.length - 1 ? goNext : null}
          onClose={close}
          keysEnabled={!editTarget && !adding}
          canEdit={canEdit}
          onEdit={setEditTarget}
          onToast={showToast}
          onSetManagement={managedBy => patchCreator(selected.id, { managedBy },
            managedBy === "fifthavenue" ? `${selected.name} — Managed by Fifth Avenue` : `${selected.name} moved off Managed`)}
          onAssign={vendorId => patchCreator(selected.id, { vendorId },
            vendorId ? `Assigned to ${vendorById.get(vendorId)?.name}` : "Vendor cleared")}
        />
      )}

      {adding && <AddCreatorModal onAdd={onAddCreator} onClose={() => setAdding(false)} />}
      {editTarget && <AddCreatorModal editing={editTarget} onAdd={onSaveEdit} onClose={() => setEditTarget(null)} />}
    </div>
  );
}
