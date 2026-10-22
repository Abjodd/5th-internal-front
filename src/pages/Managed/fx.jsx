/**
 * 5th Avenue — Managed Creators: shared visual effects + derived signals
 * ─────────────────────────────────────────────────────────────────
 * One place for the things Summary, Campaigns and Assets all draw the same
 * way, so the three tabs read as one product:
 *
 *   - MONEY: one fixed hue per money metric (client cost purple, internal
 *     cost gold, margin green/red) — never swapped between charts. Pair
 *     validated with the dataviz palette script (light surface).
 *   - dealStatus: Live / Draft / Needs attention, DERIVED from a deal's
 *     reel link and whether its fetch succeeded. There is no stored status
 *     field on a Project, and this never pretends there is.
 *   - CountUp / Reveal: motion. Both switch off under
 *     prefers-reduced-motion.
 *   - ReelMedia: a reel's real thumbnail that plays its real video on hover —
 *     same contract as PitchDraft's SuggestedContentCard: only when the
 *     signed video URL hasn't expired (videoExpiresAt), otherwise a still.
 */
import { useEffect, useRef, useState } from "react";
import { Film, AlertTriangle, Link2 } from "lucide-react";
import { T, DARK_SURFACE } from "../../theme/tokens";
import { prettyDate } from "../../lib/format";

export { DARK_SURFACE };

export const MONEY = { client: T.purple, internal: T.gold, margin: T.green, loss: T.red };

export function parseFollowersLoose(raw) {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const m = /^([\d.]+)\s*(K|M)?$/i.exec(String(raw).trim().replace(/,/g, ""));
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return 0;
  const unit = (m[2] || "").toUpperCase();
  return unit === "M" ? n * 1e6 : unit === "K" ? n * 1e3 : n;
}

export function dealStatus(d) {
  if (!d.url) return "draft";
  if (d.media?.ok === false) return "attention";
  return "live";
}
export const STATUS_LABEL = { live: "Live", draft: "Draft", attention: "Needs attention" };
export const STATUS_COLOR = { live: T.green, draft: "#3B6EDB", attention: T.red };

export function StatusPill({ status, onDark }) {
  const color = STATUS_COLOR[status] || T.label;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 8.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
      color: onDark ? "#FFF" : color,
      background: onDark ? "rgba(0,0,0,0.45)" : `${color}14`,
      border: `1px solid ${onDark ? "rgba(255,255,255,0.18)" : `${color}30`}`,
      backdropFilter: onDark ? "blur(6px)" : undefined,
      padding: "3px 8px", borderRadius: 20, whiteSpace: "nowrap",
    }}>
      <span className={status === "live" ? "fx-live" : undefined} style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function relativeDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const startOf = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return prettyDate(String(iso).slice(0, 10));
}

// The reel link a person should land on: Instagram's own /reel/ permalink
// when the snapshot has one, else whatever link was typed on the deal.
export const reelHref = (d) => d.media?.permalink || d.url || null;

// ── motion ───────────────────────────────────────────────────────────────────
const prefersReduced = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function useCountUp(target, duration = 1000) {
  const safe = Number.isFinite(target) ? target : 0;
  const [val, setVal] = useState(prefersReduced() ? safe : 0);
  const from = useRef(prefersReduced() ? safe : 0);
  useEffect(() => {
    if (prefersReduced()) { setVal(safe); from.current = safe; return; }
    const start = performance.now(), origin = from.current;
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = origin + (safe - origin) * eased;
      from.current = v;
      setVal(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [safe, duration]);
  return val;
}

// `format` receives the in-flight number; round inside it for integer
// displays (fmtINR / fmtCompact of a fractional mid-animation value).
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString("en-IN"), duration }) {
  const v = useCountUp(Number(value) || 0, duration);
  return <>{format(v)}</>;
}

export const Reveal = ({ i = 0, children, style, className = "", as: Tag = "div", ...rest }) => (
  <Tag className={`fx-up ${className}`} style={{ animationDelay: `${Math.min(i, 12) * 55}ms`, ...style }} {...rest}>{children}</Tag>
);

export const FX_CSS = `
  @keyframes fx-up { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
  /* backwards, not both: a held final keyframe would pin transform:none and
     kill the .fx-lift hover transform on the same element. */
  .fx-up { animation: fx-up .6s cubic-bezier(.2,.7,.2,1) backwards; }
  @keyframes fx-float { 0%,100% { transform: translateY(0) rotate(var(--r, 0deg)) } 50% { transform: translateY(-7px) rotate(var(--r, 0deg)) } }
  .fx-float { animation: fx-float 6s ease-in-out infinite; }
  @keyframes fx-ping { 0% { box-shadow: 0 0 0 0 ${T.green}88 } 100% { box-shadow: 0 0 0 7px ${T.green}00 } }
  .fx-live { animation: fx-ping 1.6s ease-out infinite; }
  @keyframes fx-sheen { from { background-position: 200% 0 } to { background-position: -200% 0 } }
  .fx-lift { transition: transform .22s cubic-bezier(.2,.7,.2,1), box-shadow .22s ease, border-color .22s ease; }
  .fx-lift:hover { transform: translateY(-3px); box-shadow: 0 14px 34px rgba(28,24,16,0.13); border-color: ${T.borderMid}; }
  .fx-zoom img { transition: transform .6s cubic-bezier(.2,.7,.2,1); }
  .fx-zoom:hover img { transform: scale(1.06); }
  .fx-hover-show { opacity: 0; transform: translateY(4px); transition: opacity .2s ease, transform .2s ease; }
  .fx-zoom:hover .fx-hover-show { opacity: 1; transform: none; }
  .fx-hover-hide { transition: opacity .2s ease; }
  .fx-zoom:hover .fx-hover-hide { opacity: 0; }
  .fx-rail { scrollbar-width: thin; }
  .fx-rail::-webkit-scrollbar { height: 6px; }
  .fx-rail::-webkit-scrollbar-thumb { background: ${T.borderMid}; border-radius: 3px; }
  .fx-row:hover td { background: ${T.hover}; }
  .fx-bar { transition: width .9s cubic-bezier(.2,.7,.2,1); }
  @media (prefers-reduced-motion: reduce) {
    .fx-up, .fx-float, .fx-live { animation: none !important; }
    .fx-lift, .fx-lift:hover, .fx-zoom img { transition: none !important; transform: none !important; }
  }
`;

// Width that animates in from 0 on first paint — for bars.
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setM(true)); return () => cancelAnimationFrame(id); }, []);
  return m;
}

// ── reel media ───────────────────────────────────────────────────────────────
export function canPlayReel(media) {
  return !!media?.ok && !!media.video && (!media.videoExpiresAt || Date.parse(media.videoExpiresAt) > Date.now());
}

export function ReelMedia({ deal, hovered, ratio = "9 / 16", fill = false }) {
  const m = deal?.media;
  const [imgBroken, setImgBroken] = useState(false);
  const [playing, setPlaying] = useState(false);
  const ref = useRef(null);
  const playable = canPlayReel(m);
  const thumb = m?.ok && m.thumbnail && !imgBroken ? m.thumbnail : null;

  useEffect(() => {
    if (!hovered) setPlaying(false);
    const v = ref.current;
    if (!v) return;
    if (hovered) { v.currentTime = 0; v.play().catch(() => {}); } else v.pause();
  }, [hovered]);

  const box = fill
    ? { position: "absolute", inset: 0 }
    : { position: "relative", width: "100%", aspectRatio: ratio };

  return (
    <div style={{ ...box, background: "#14151A", overflow: "hidden" }}>
      {thumb ? (
        <img src={thumb} alt="" onError={() => setImgBroken(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
          background: "radial-gradient(120% 90% at 30% 10%, rgba(120,96,214,0.35), rgba(20,21,26,0) 60%), #14151A",
          color: "rgba(255,255,255,0.55)", fontSize: 10.5, textAlign: "center", padding: 14,
        }}>
          {m?.ok === false ? <AlertTriangle size={20} color="#F2A0A0" /> : deal?.url ? <Film size={20} /> : <Link2 size={20} />}
          <span>{m?.ok === false ? "Couldn't fetch this reel" : deal?.url ? "No preview image" : "No reel link yet"}</span>
        </div>
      )}
      {playable && hovered && (
        <video ref={ref} src={m.video} poster={thumb || undefined} muted loop playsInline preload="none"
          onCanPlay={() => setPlaying(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: playing ? 1 : 0, transition: "opacity .25s ease" }} />
      )}
    </div>
  );
}

// Section heading used across the three tabs.
export function SectionTitle({ children, sub, action, onDark }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
      <div>
        <div style={{ fontFamily: "'Newsreader',serif", fontStyle: "italic", fontSize: 16, fontWeight: 600, color: onDark ? "#FFF" : T.text, letterSpacing: "-0.01em" }}>{children}</div>
        {sub && <div style={{ fontSize: 10, color: onDark ? "rgba(255,255,255,0.55)" : T.label, marginTop: 2 }}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

export const LinkBtn = ({ children, onClick, onDark }) => (
  <button type="button" onClick={onClick} style={{
    background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: "'Sora'",
    fontSize: 10.5, fontWeight: 500, color: onDark ? "rgba(255,255,255,0.8)" : T.accent, whiteSpace: "nowrap",
  }}>{children}</button>
);

export const card = {
  background: T.surface, border: `1px solid ${T.border}`, boxShadow: T.shadow, borderRadius: 14, padding: "18px 20px",
};
