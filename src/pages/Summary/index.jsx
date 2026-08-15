/**
 * 5th Avenue — Internal Platform
 * FounderSummary.jsx — Founder Landing
 * ─────────────────────────────────────────────────────────────────
 * A cinematic, editorial visual report — closer to an annual report
 * or a Bloomberg/Monocle cover story than a dashboard. The founder
 * scrolls top to bottom; nothing is clickable in the functional
 * sense (no navigation, no filters, no editable state). Motion is
 * ambient: parallax photography, mask-reveal headlines, self-drawing
 * charts, drifting particles, a film-grain texture over the whole
 * page for warmth. All of it respects prefers-reduced-motion.
 *
 * CHANGELOG (this pass — fixes for reported bugs)
 * ──────────────────────────────────────────────
 * 1. HERO OVERLAP: the two-line italic title was colliding with the
 *    subtitle row. Root cause was (a) the title + subtitle sharing a
 *    single flex-end block with no explicit gap, and (b) the hero's
 *    critical above-the-fold text using `whileInView` — on a fast
 *    load this can paint mid-animation and *look* like missing text.
 *    Fixed: explicit `gap`, larger min-height, tighter line-height
 *    that doesn't clip descenders, and the hero text now animates
 *    with `animate` (fires immediately on mount) instead of relying
 *    on a scroll observer.
 * 2. "PLAIN / EMPTY" DIAGRAM SECTIONS: Agency Health, Client
 *    Constellation and Risk Radar were single SVGs dropped onto a
 *    flat background with nothing else around them — visually they
 *    read as broken or unfinished, and the heading had no breathing
 *    room above it. Fixed: added generous top padding, a soft radial
 *    background wash behind each diagram, drifting particles for
 *    ambient motion, and a row of small "insight cards" under each
 *    diagram so the section never looks like an empty canvas.
 * 3. BROKEN / IRRELEVANT PHOTOS: `thumbUrl()` piped a keyword into
 *    loremflickr, which does a loose keyword match against a stock
 *    photo pool — hence a cat statue where a content-creator photo
 *    was expected. Client/decision thumbnails now render as
 *    deterministic colour-coded initials badges (no network call,
 *    never wrong, always on-brand). The large editorial photography
 *    (`PHOTOS`, `MOSAIC`) now points at a curated, fixed set of
 *    Unsplash images that are actually about filming/content
 *    creation/influencer work, instead of a random keyword search.
 * 4. LABEL LEGIBILITY: text sitting directly on top of connector
 *    lines in the radial diagrams now sits on a small backing pill
 *    so it stays readable regardless of what's behind it.
 * 5. MORE MOTION: hover-lift on every card/tile, staggered legends,
 *    drifting background particles, springier marquee, pulse rings
 *    tuned down so they don't look like loading spinners.
 *
 * CHANGELOG (this pass #2 — layout / section-boundary fixes)
 * ──────────────────────────────────────────────
 * 6. REVENUE SIDE TILE: the photo tile and the trend line beneath it
 *    were two separate floating elements with mismatched widths and
 *    a bare dashed placeholder line hanging in empty space whenever
 *    there was no trend to draw — it read as broken, not "no data
 *    yet." The photo, the trend and the fallback state are now one
 *    bordered card so the column always has a single clean shape,
 *    matched in height to the numbers column beside it.
 * 7. SECTIONS "COINCIDING": Team, Decisions and Performance all sit
 *    on the same cream background back-to-back with no seam between
 *    Team and Decisions (a seam existed between Decisions and
 *    Performance, but not the pair before it), so the page read as
 *    one long run rather than three distinct chapters. Added the
 *    missing seam and gave each of the three a distinct header
 *    treatment (kicker position, rule weight) so adjacent sections
 *    are legible as separate even at a fast scroll.
 * 8. TRAJECTORY HAD NO GRAPH: with fewer than two data points on any
 *    line, Performance rendered a bare dashed rectangle with a
 *    sentence in it — no chart, no shape, nothing "graph-like."
 *    Rebuilt so the panel always draws an actual chart frame (axis
 *    baseline, gridlines, value bars) at every data state: full
 *    trend line with ≥2 points, a comparative bar read at exactly 1
 *    point per line, and a labelled empty frame (not a dashed box)
 *    when there is truly nothing yet.
 * 9. CAMPAIGN FLOW SIDE TILE: the image column used a fixed
 *    `paddingTop` to line up with the timeline, which only matched
 *    one specific timeline length — any other stage count left the
 *    tile floating above or below the timeline's true midpoint.
 *    Switched to grid alignment so the tile is always centred
 *    against whatever height the timeline actually renders at.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion, useReducedMotion, animate, useScroll, useTransform } from "motion/react";
import {
  CampaignsAPI, ClientsAPI, InvoicesAPI, UsersAPI, CreatorsAPI,
  QuotesAPI, ClientRequestsAPI, CreatorRequestsAPI,
} from "../../lib/api";
import { buildSummary } from "../../lib/summaryMetrics";

/* ────────────────────────────────────────────────────────────────
 * DESIGN TOKENS + PHOTOGRAPHY
 * ──────────────────────────────────────────────────────────────── */

const F = {
  paper: "#FAFAF9",
  surface: "#FFFFFF",
  ink: "#14151A",
  inkSoft: "#6E7077",
  muted: "#9C9EA6",
  hairline: "#E7E6E2",
  hairlineStrong: "#DBDAD4",
  navy: "#1E2A44",
  navyTint: "#EEF1F6",
  forest: "#24413A",
  forestTint: "#EBF0EE",
  gold: "#8C6B2E",
  goldTint: "#F6EFE2",
  plum: "#4A2E42",
  plumTint: "#F3EDF0",
  rust: "#8C3B2E",
  rustTint: "#F7ECE9",
  cream: "#F1ECE1",
};

const T = { display: "'Newsreader', serif", ui: "'Sora', sans-serif" };
const EASE = [0.16, 1, 0.3, 1];

// Curated, fixed photography — deliberately NOT a keyword search, so it
// can never resolve to an off-topic image. Swap for the agency's own
// campaign photography whenever it's available; nothing else changes.
const IMG = (id, w = 1800) => `https://images.unsplash.com/${id}?q=80&w=${w}&auto=format&fit=crop`;

// Every entry below is attached to a section that carries real data. The four
// full-bleed interlude photographs (`studio`, `city`, `desk` and the mosaic
// grid) were removed along with the interludes themselves — they were page
// furniture between chapters rather than part of any chapter.
const PHOTOS = {
  hero: ("https://images.openai.com/static-rsc-4/ADpR5ytzcVB2dT4mXMIA11nr7R3X5gBPKhtjgPSo_PE7qIp2SJKZ4Gpdm7uQXUnmzW0n2udCFaqaMUj6-fp_YFXSksf5vmzFPwULxSsRvYkWNIyDVfjeELf20MQkYHKEG06Q8MxLTNX-IVoqCbAza0dS1QN_JJrAIL0SITtvV12AIwpiqi1YPqadBbd0A_wq?purpose=fullsize"),
  close: IMG("photo-1516035069371-29a1b244cc32"), // camera / photoshoot
  health: IMG("photo-1533750349088-cd871a92f312"), // creator filming setup, for Agency Health
  team: IMG("photo-1522202176988-66273c2fd55f"), // creative team working together
  footer: IMG("photo-1493421419110-74f4e85ba126"), // dim editorial workspace, for footer bg
  revenue: IMG("photo-1554224155-6726b3ff858f"), // invoices / financial paperwork, for the Revenue side card
  decisions: IMG("photo-1600880292203-757bb62b4baf"), // leadership / strategy conversation, for the Decisions side card
};

// Deterministic colour-coded initials badge — replaces the old
// keyword-photo lookup so a thumbnail can never render the wrong
// thing (or nothing at all). Same input always produces the same
// colour, so it still reads as a stable "identity" per client/topic.
const BADGE_PALETTE = [
  [F.forest, F.forestTint], [F.navy, F.navyTint], [F.gold, F.goldTint],
  [F.plum, F.plumTint], [F.rust, F.rustTint],
];
function badgeTone(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return BADGE_PALETTE[h % BADGE_PALETTE.length];
}
function initials(label) {
  return (label || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("");
}

function fmtINR(n) {
  if (n === null || n === undefined) return null;
  return Number((n / 100000).toFixed(1));
}
function pct(n) { return n === null || n === undefined ? null : `${n > 0 ? "+" : ""}${n}%`; }

// Compact counts for audience figures — views run into the millions, and
// "8478414" on a headline is a number nobody reads.
function fmtCompact(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1e7) return `${(v / 1e7).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (Math.abs(v) >= 1e5) return `${(v / 1e5).toFixed(1).replace(/\.0$/, "")}L`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(v));
}

/* ────────────────────────────────────────────────────────────────
 * DATA
 * ────────────────────────────────────────────────────────────────
 * There is no sample content on this page any more.
 *
 * What stood here was a `DEMO` object — 128 campaigns, 34 clients,
 * ₹86.0L of revenue, ten invented brands, eight invented colleagues
 * with invented utilisation figures and stock-photo faces — merged
 * field-by-field under anything the backend sent. It was written as
 * a fallback, but the page read `summaryData` off the router's outlet
 * context and nothing ever put `summaryData` there, so the merge had
 * nothing to merge and DEMO was, in practice, the entire page. The
 * founder's landing screen was a brochure.
 *
 * Every figure now comes from lib/summaryMetrics.buildSummary(), which
 * derives it from the live collections and returns null for anything
 * the database cannot answer — see that file for the metric-by-metric
 * account of what is derived and what is deliberately left blank.
 *
 * The shape below is what an unloaded page renders: nulls and empty
 * arrays, which every section already knows how to draw as "—" or
 * "not yet connected". It is not a fallback and must never gain
 * plausible-looking values.
 */
const EMPTY = {
  asOf: null,
  bigNumbers: { campaigns: null, clients: null, team: null, creators: null },
  health: { revenue: null, delivery: null, clients: null, team: null, growth: null },
  revenue: { total: null, deltaPct: null, trend: [], collected: null, outstanding: null, overdue: null, renewalsDue: null },
  campaigns: { stages: [] },
  clients: { total: null, active: null, idle: null, healthy: null, atRisk: null, critical: null, names: [] },
  team: { members: [], avgUtilizationPct: null, staffedPct: null },
  decisions: [],
  performance: { lines: [] },
};

/* ────────────────────────────────────────────────────────────────
 * AMBIENT / TEXTURE LAYER
 * ──────────────────────────────────────────────────────────────── */

function GrainOverlay() {
  return (
    <svg
      aria-hidden
      style={{
        position: "fixed", inset: 0, width: "100%", height: "100%",
        pointerEvents: "none", zIndex: 1, opacity: 0.035, mixBlendMode: "multiply",
      }}
    >
      <filter id="grain-filter">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain-filter)" />
    </svg>
  );
}

// Soft drifting dots used behind the radial diagrams so those sections
// never feel like an empty canvas with a single SVG floating on it.
function DriftParticles({ color = F.navy, count = 10, area = 520 }) {
  const reduce = useReducedMotion();
  const dots = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * area,
      y: Math.random() * area,
      r: 1.4 + Math.random() * 2.2,
      dur: 10 + Math.random() * 10,
      delay: Math.random() * -10,
    })),
    [count, area]
  );
  if (reduce) return null;
  return (
    <svg aria-hidden width="100%" height="100%" viewBox={`0 0 ${area} ${area}`}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {dots.map((d) => (
        <motion.circle
          key={d.id} cx={d.x} cy={d.y} r={d.r} fill={color} opacity={0.16}
          animate={{ cy: [d.y, d.y - 26, d.y], opacity: [0.06, 0.22, 0.06] }}
          transition={{ duration: d.dur, delay: d.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </svg>
  );
}

function Marquee({ items, color = F.inkSoft }) {
  const reduce = useReducedMotion();
  const track = [...items, ...items, ...items];
  return (
    <div style={{ overflow: "hidden", width: "100%", padding: "14px 0", borderTop: `1px solid ${F.hairline}`, borderBottom: `1px solid ${F.hairline}` }}>
      <motion.div
        style={{ display: "flex", gap: 40, whiteSpace: "nowrap", width: "max-content" }}
        animate={reduce ? undefined : { x: ["0%", "-33.333%"] }}
        transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
      >
        {track.map((it, i) => (
          <span key={i} style={{ fontFamily: T.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", color, display: "flex", alignItems: "center", gap: 40 }}>
            {it} <span style={{ opacity: 0.3 }}>◆</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
 * SHARED PRIMITIVES
 * ──────────────────────────────────────────────────────────────── */

const Eyebrow = ({ children, color = F.navy }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
    <span style={{ width: 22, height: 1, background: color, opacity: 0.45 }} />
    <span style={{ fontFamily: T.ui, fontSize: 10.5, fontWeight: 600, color, textTransform: "uppercase", letterSpacing: "0.14em" }}>
      {children}
    </span>
  </div>
);

// Standard header block used by every section below a photo interlude —
// centralised so top spacing is always consistent and never collides
// with whatever section preceded it.
// `gap` overrides the default 56px space below the header. Sections that follow
// their header with a full-width panel (Agency Health) need less air than ones
// that open straight onto body copy, and hard-coding 56 everywhere left the
// former with a visible hole between the title and the content it introduces.
function SectionHeader({ eyebrow, eyebrowColor, title, center = true, sub, dark = false, gap = 56 }) {
  return (
    <div style={{ marginBottom: gap, textAlign: center ? "center" : "left" }}>
      <Reveal>
        <div style={{ display: "flex", justifyContent: center ? "center" : "flex-start" }}>
          <Eyebrow color={dark ? "rgba(255,255,255,0.85)" : eyebrowColor}>{eyebrow}</Eyebrow>
        </div>
      </Reveal>
      <MaskReveal delay={0.08} style={{ display: "flex", justifyContent: center ? "center" : "flex-start" }}>
        <h2 style={{ fontFamily: T.display, fontStyle: "italic", fontWeight: 500, fontSize: "clamp(30px, 3.6vw, 46px)", color: dark ? "#FFFFFF" : F.ink, margin: 0, lineHeight: 1.22 }}>
          {title}
        </h2>
      </MaskReveal>
      {sub && (
        <Reveal delay={0.16}>
          <p style={{ fontFamily: T.ui, fontSize: 13.5, color: dark ? "rgba(255,255,255,0.68)" : F.inkSoft, maxWidth: 480, margin: center ? "16px auto 0" : "16px 0 0", lineHeight: 1.7 }}>
            {sub}
          </p>
        </Reveal>
      )}
    </div>
  );
}

function Reveal({ children, delay = 0, y = 22, style = {} }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.8, ease: EASE, delay }}
      style={style}
    >
      {children}
    </motion.div>
  );
}

/**
 * The rising-from-behind-a-mask reveal used by every section TITLE.
 *
 * ── The trigger has to sit on the OUTER element ─────────────────────────────
 * This previously put `whileInView` on the inner, translated element, and that
 * could never fire: the inner div starts at y:"100%", which parks it entirely
 * below the clipping edge of its own `overflow: hidden` parent.
 * IntersectionObserver honours ancestor clipping when it computes an
 * intersection rect, so the element the observer was watching had exactly 0%
 * visible area — and 0% never reaches the 0.4 threshold that would start the
 * animation that would bring it into view. A deadlock: the reveal hid itself
 * too well to ever be told to un-hide.
 *
 * The effect was that EVERY section heading on this page ("Agency Health",
 * "Revenue", "The client portfolio.", …) rendered as a blank gap between its
 * eyebrow and its subtitle. It reads as a spacing bug rather than a missing
 * heading, which is why it survived so long.
 *
 * So the observer now watches the outer wrapper — which is never clipped and
 * intersects normally — and the inner element is driven by variant propagation.
 */
function MaskReveal({ children, delay = 0, style = {} }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : "hidden"}
      whileInView="show"
      viewport={{ once: true, amount: 0.4 }}
      style={{ overflow: "hidden", padding: "0.06em 0 0.22em", ...style }}
    >
      <motion.div
        variants={{ hidden: { y: "100%" }, show: { y: "0%" } }}
        transition={{ duration: 0.9, ease: EASE, delay }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function BigNumber({ value, prefix = "", suffix = "", decimals = 0, size = 56 }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (value === null || value === undefined || !ref.current) return;
    if (reduce) { ref.current.textContent = prefix + value.toFixed(decimals) + suffix; return; }
    const controls = animate(0, value, {
      duration: 1.4, ease: EASE,
      onUpdate(v) { if (ref.current) ref.current.textContent = prefix + v.toFixed(decimals) + suffix; },
    });
    return () => controls.stop();
  }, [value, prefix, suffix, decimals, reduce]);

  if (value === null || value === undefined) {
    return <span style={{ fontFamily: T.display, fontSize: size, color: F.muted, fontStyle: "italic" }}>—</span>;
  }
  return <span ref={ref} style={{ fontFamily: T.display, fontSize: size, color: F.ink, fontWeight: 500 }}>{prefix}{(0).toFixed(decimals)}{suffix}</span>;
}

function EditorialLine({ data, height = 220, color = F.forest, thick = 2 }) {
  const reduce = useReducedMotion();
  const id = useRef("grad-" + Math.round(Math.random() * 1e6)).current;
  const width = 560;
  if (!data || data.length < 2) {
    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <line x1={0} y1={height - 1} x2={width} y2={height - 1} stroke={F.hairline} strokeDasharray="3 6" />
      </svg>
    );
  }
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * width,
    height - ((v - min) / span) * (height - 20) - 10,
  ]);
  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = d + ` L${width} ${height} L0 ${height} Z`;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <motion.path
        d={d} fill="none" stroke={color} strokeWidth={thick} strokeLinecap="round" strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 1.6, ease: EASE }}
      />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={2} fill={color} opacity={0.7} />)}
    </svg>
  );
}

// Small filled card used to keep otherwise-sparse sections from reading
// as empty — a value, a label, and a one-line note, with a hover lift.
function InsightCard({ label, value, note, color = F.navy, delay = 0, dark = false }) {
  return (
    <Reveal delay={delay}>
      <motion.div
        whileHover={{ y: -3, boxShadow: dark ? "0 14px 30px rgba(0,0,0,0.35)" : "0 14px 30px rgba(20,21,26,0.08)" }}
        transition={{ duration: 0.3, ease: EASE }}
        style={{
          background: dark ? "rgba(255,255,255,0.08)" : F.surface,
          border: `1px solid ${dark ? "rgba(255,255,255,0.18)" : F.hairline}`,
          backdropFilter: dark ? "blur(10px)" : "none",
          WebkitBackdropFilter: dark ? "blur(10px)" : "none",
          borderRadius: 16, padding: "20px 22px", minWidth: 200, flex: "1 1 200px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
          <span style={{ fontFamily: T.ui, fontSize: 10, fontWeight: 700, color: dark ? "rgba(255,255,255,0.6)" : F.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
        </div>
        <div style={{ fontFamily: T.display, fontStyle: "italic", fontSize: 26, color: dark ? "#FFFFFF" : F.ink, marginBottom: 6 }}>{value}</div>
        {note && <div style={{ fontFamily: T.ui, fontSize: 12, color: dark ? "rgba(255,255,255,0.62)" : F.inkSoft, lineHeight: 1.5 }}>{note}</div>}
      </motion.div>
    </Reveal>
  );
}

// Deterministic colour badge — used in place of unreliable keyword-photo
// thumbnails for client / decision tiles.
function InitialsBadge({ seed, size = 40, radius = 10 }) {
  const [fg, bg] = badgeTone(seed || "?");
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: T.ui, fontWeight: 700, fontSize: size * 0.34, color: fg, flexShrink: 0,
    }}>
      {initials(seed)}
    </div>
  );
}

// A thin, quiet divider between two sections that would otherwise share the
// exact same background colour. Used between the studio PhotoInterlude and
// Agency Health (both F.ink), between Decisions and Performance (both
// F.cream), and between Team and Decisions (also both F.cream) — three
// consecutive same-colour joins that previously had no seam at all, which is
// what made the page read as one long run instead of distinct chapters. This
// doesn't try to look like a section of its own — no eyebrow, no title —
// just enough breathing room and a faint gradient line to mark where one
// ends and the next begins.
function SectionSeam({ tone = "light" }) {
  const dark = tone === "dark";
  return (
    <div
      aria-hidden
      style={{
        position: "relative", height: dark ? 72 : 56,
        background: dark ? F.ink : F.cream,
      }}
    >
      <div style={{
        position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
        width: 120, height: 1,
        background: dark
          ? "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)"
          : `linear-gradient(90deg, transparent, ${F.hairlineStrong}, transparent)`,
      }} />
    </div>
  );
}

// A single photo tile matching the ContentMosaic treatment (rounded corners,
// gradient caption) — used to fill the empty side column a text-only section
// left blank, rather than a chart or diagram standing there half-drawn.
function SideTile({ src, caption, height = 320 }) {
  return (
    <Reveal delay={0.24} style={{ height: "100%" }}>
      <motion.div
        whileHover={{ scale: 1.02 }}
        transition={{ duration: 0.35, ease: EASE }}
        style={{ position: "relative", borderRadius: 18, overflow: "hidden", height: "100%", minHeight: height, background: F.hairline }}
      >
        <img src={src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 50%, rgba(20,21,26,0.65) 100%)" }} />
        <div style={{ position: "absolute", left: 16, right: 16, bottom: 14, fontFamily: T.ui, fontSize: 11, fontWeight: 600, color: "#FFFFFF", letterSpacing: "0.04em" }}>
          {caption}
        </div>
      </motion.div>
    </Reveal>
  );
}

/* ────────────────────────────────────────────────────────────────
 * 1 — HERO: full-bleed cover photograph
 * ──────────────────────────────────────────────────────────────── */

function Hero({ asOfLabel }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const imgY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, 140]);
  const textY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, 60]);
  const fade = useTransform(scrollYProgress, [0, 0.9], [1, 0]);

  return (
    // `data-nav-merge` asks the shell's floating nav to drop its glass chrome
    // while this section is behind it, so the pills read as sitting directly
    // on the cover photograph rather than as a row of chips on top of it —
    // the same photo the nav already darkens for its own copy, so white nav
    // text stays exactly as legible as the "Founder Summary" label above it.
    <section ref={ref} className="fs-hero" data-nav-merge data-nav-tone="dark"
      style={{ position: "relative", height: "94vh", minHeight: 780, overflow: "hidden", background: F.ink }}>
      <motion.div style={{ position: "absolute", inset: -60, y: imgY }}
        animate={reduce ? undefined : { scale: [1, 1.06] }}
        transition={{ duration: 26, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
      >
        <img src={PHOTOS.hero} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(0.2) brightness(0.6) contrast(1.05)" }} />
      </motion.div>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(20,21,26,0.28) 0%, rgba(20,21,26,0.3) 40%, rgba(20,21,26,0.68) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 90% at 15% 15%, rgba(140,107,46,0.1), transparent 55%)" }} />

      {/* Critical above-the-fold copy: `animate` on mount, not a scroll
          observer, so it is never caught mid-reveal on first paint. */}
      <motion.div
        className="fs-hero__content"
        style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "0 44px 96px", y: textY, opacity: fade }}
      >
        <div style={{ maxWidth: 1280, margin: "0 auto", width: "100%" }}>
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}
          >
            <span style={{ width: 22, height: 1, background: F.cream, opacity: 0.5 }} />
            <span style={{ fontFamily: T.ui, fontSize: 10.5, fontWeight: 600, color: F.cream, textTransform: "uppercase", letterSpacing: "0.2em" }}>
              Founder Summary
            </span>
          </motion.div>

          <motion.h1
            className="fs-hero__title"
            initial={reduce ? false : { opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.12 }}
            style={{
              fontFamily: T.display, fontWeight: 500, fontStyle: "italic",
              fontSize: "clamp(42px, 7vw, 96px)", lineHeight: 1.08,
              color: "#FFFFFF", margin: "0 0 30px", letterSpacing: "-0.01em",
            }}
          >
            The state of<br />the agency.
          </motion.h1>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.4 }}
            style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}
          >
            <div style={{ fontFamily: T.ui, fontSize: 15, color: "rgba(255,255,255,0.78)", maxWidth: 420, lineHeight: 1.7 }}>
              A quiet view of every campaign, creator and client moving across the business.
            </div>
            <div style={{ fontFamily: T.ui, fontSize: 10.5, color: "rgba(255,255,255,0.55)", letterSpacing: "0.14em" }}>
              {asOfLabel}
            </div>
          </motion.div>
        </div>
      </motion.div>

      {!reduce && (
        <motion.div
          style={{ position: "absolute", left: "50%", bottom: 24, width: 1, height: 34, background: "rgba(255,255,255,0.4)" }}
          animate={{ scaleY: [0.3, 1, 0.3], opacity: [0.2, 0.8, 0.2] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
 * 2 — EXECUTIVE STATEMENT
 * ──────────────────────────────────────────────────────────────── */

function ExecutiveStatement() {
  return (
    <section style={{ padding: "130px 44px 90px", background: F.surface, textAlign: "center" }}>
      <MaskReveal style={{ display: "flex", justifyContent: "center" }}>
        <h2 style={{
          fontFamily: T.display, fontStyle: "italic", fontWeight: 500,
          fontSize: "clamp(32px, 4.4vw, 56px)", color: F.ink, margin: "0 auto 22px",
          lineHeight: 1.2, maxWidth: 780,
        }}>
          One agency. Multiple systems. One view.
        </h2>
      </MaskReveal>
      <Reveal delay={0.15}>
        <p style={{ fontFamily: T.ui, fontSize: 14.5, color: F.inkSoft, maxWidth: 560, margin: "0 auto", lineHeight: 1.8 }}>
          IM operations, billing, AEO, people, campaigns and performance —
          distilled into a single operating picture.
        </p>
      </Reveal>
      <Reveal delay={0.28} style={{ marginTop: 56 }}>
        <Marquee items={["IM", "BILLING", "AEO", "TEAM", "CLIENTS", "PERFORMANCE"]} />
      </Reveal>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
 * 3 — THE BIG NUMBERS
 * ──────────────────────────────────────────────────────────────── */

function BigNumbers({ revenue = {}, bigNumbers = {} }) {
  return (
    <section style={{ padding: "40px 44px 100px", background: F.surface }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <span style={{ fontFamily: T.ui, fontSize: 10.5, fontWeight: 600, color: F.forest, letterSpacing: "0.14em", textTransform: "uppercase" }}>Revenue</span>
          </div>
          <div style={{ textAlign: "center", marginBottom: 6 }}>
            <BigNumber value={fmtINR(revenue.total)} prefix="₹" suffix={revenue.total != null ? "L" : ""} decimals={1} size={76} />
          </div>
          <div style={{ textAlign: "center", fontFamily: T.ui, fontSize: 12, color: revenue.deltaPct != null ? F.forest : F.muted, fontWeight: 600, marginBottom: 64 }}>
            {revenue.deltaPct != null ? `${pct(revenue.deltaPct)} vs previous period` : "Awaiting data"}
          </div>
        </Reveal>

        <div style={{ height: 1, background: F.hairline, marginBottom: 64 }} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "48px 40px" }}>
          {[
            { label: "Campaigns", value: bigNumbers.campaigns, color: F.navy },
            { label: "Clients", value: bigNumbers.clients, color: F.rust },
            { label: "Team", value: bigNumbers.team, color: F.plum },
            // Was "AEO", scored out of a findings collection that is empty and
            // sits behind a section disabled in routes/sections.js. The
            // creators directory is a live count the founder actually has.
            { label: "Creators", value: bigNumbers.creators, color: F.gold },
          ].map((item, i) => (
            <Reveal key={item.label} delay={i * 0.08}>
              <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.25 }}>
                <div style={{ fontFamily: T.ui, fontSize: 10.5, fontWeight: 600, color: F.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                  {item.label}
                </div>
                <BigNumber value={item.value} suffix={item.suffix || ""} size={52} />
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
 * 4 — AGENCY HEALTH
 * ──────────────────────────────────────────────────────────────── */

// `cx`/`cy` are the node's actual position in the PARENT svg's coordinate
// space — this used to take a `size` prop and self-center at (size/2, size/2)
// as if it owned its own local viewport, but it's rendered directly into
// AgencyHealth's shared 520×520 canvas alongside four siblings, all with the
// same `size`. Every arc landed at the identical (36, 36), stacked on top of
// each other near the corner of the diagram — the "random progress circle
// floating about" bug: five overlapping rings in colours that don't belong
// to any single node, sitting nowhere near the signal they were meant to
// wrap. Positioning explicitly by the node's own (x, y) is what the visible
// halo circle beside it already does correctly.
function HealthOrbitArc({ pct: value, color, cx, cy, r, stroke = 3 }) {
  const reduce = useReducedMotion();
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  const offset = c - (v / 100) * c;
  return (
    <motion.circle
      cx={cx} cy={cy} r={r} fill="none"
      stroke={value === null ? F.hairlineStrong : color}
      strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c}
      transform={`rotate(-90 ${cx} ${cy})`}
      initial={{ strokeDashoffset: c }}
      whileInView={{ strokeDashoffset: value === null ? c : offset }}
      viewport={{ once: true }}
      transition={reduce ? { duration: 0 } : { duration: 1.4, ease: EASE }}
    />
  );
}

// Both columns of the Agency Health spread are pinned to this, so the ring
// panel and the photograph beside it are the same height at every breakpoint
// rather than each sizing to its own content.
const PANEL_H = 480;

function AgencyHealth({ health = {} }) {
  const reduce = useReducedMotion();
  // 440, down from 520: the ring lives inside a half-width column now, not the
  // full page. At the old size the labels around its edge were the widest thing
  // in the column and forced the whole spread taller than it needed to be.
  const size = 440, cx = size / 2, cy = size / 2;
  const items = [
    { key: "revenue", label: "Revenue", angle: -90, color: "#8FBBA8", value: health.revenue },
    { key: "delivery", label: "Delivery", angle: -18, color: "#9DB4D9", value: health.delivery },
    { key: "clients", label: "Clients", angle: 54, color: "#E4C77B", value: health.clients },
    { key: "team", label: "Team", angle: 126, color: "#D2A6C0", value: health.team },
    { key: "growth", label: "Growth", angle: 198, color: "#E0A08F", value: health.growth },
  ];
  // Orbit radius, kept in proportion to `size` above (was 190 at size 520) so
  // the 64px nodes and their label pills still clear the panel's edge.
  const R = 158;
  // Only the signals the database can actually answer take part in the
  // ranking and the average — and the cards below say how many that is, so
  // "strongest of five" is never claimed when three of the five are blank.
  const measured = items.filter((i) => i.value != null);
  const strongest = [...measured].sort((a, b) => b.value - a.value)[0];
  const weakest = [...measured].sort((a, b) => a.value - b.value)[0];
  const avg = measured.length ? measured.reduce((s, i) => s + i.value, 0) / measured.length : null;
  const measuredNote = `${measured.length} of ${items.length} signals are measured today`;

  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const imgY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [-30, 30]);

  return (
    // ── LAYOUT ──────────────────────────────────────────────────────────────
    // Three stacked bands, in reading order: the heading, then the diagram
    // beside its photograph, then the takeaways across the bottom.
    //
    // The previous arrangement put the heading, the ring AND the cards all
    // inside the left grid column, which made that column ~1260px tall against
    // a 616px photo. With `align-items: center` the photo then floated in the
    // vertical middle of a column it was supposed to sit beside, and the ring
    // drifted in a very wide field of empty dark. Lifting the header and the
    // cards OUT of the columns leaves the grid holding two things of similar
    // height, which is the only way `stretch` can line them up.
    <section ref={ref} style={{ padding: "104px 44px 96px", position: "relative", overflow: "hidden", background: F.ink }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(70% 60% at 30% 30%, rgba(30,42,68,0.45), transparent 70%)" }} />

      <div style={{ maxWidth: 1240, margin: "0 auto", position: "relative" }}>
        <SectionHeader eyebrow="Live view" eyebrowColor={F.cream} title="Agency Health" dark center={false}
          sub="Five signals, one pulse — how revenue, delivery, clients, team and growth are tracking right now."
          gap={40} />

        {/* Diagram + photograph. `stretch` (not `center`) so the tile is
            exactly as tall as the ring panel next to it — the two now read as
            one spread rather than two floating objects. */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 28, alignItems: "stretch",
        }}>
          <Reveal delay={0.1} style={{ height: "100%" }}>
            <div style={{
              position: "relative", height: "100%", minHeight: PANEL_H,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "18px 12px", borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
              backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
              overflow: "hidden",
            }}>
              <DriftParticles color="#FFFFFF" area={size} count={12} />
              {/* maxWidth caps the ring so it never inflates to fill a wide
                  column; the panel around it is what holds the space. */}
              <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size, position: "relative", overflow: "visible" }}>
                <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={1} strokeDasharray="2 6" />
                {items.map((it) => {
                  const rad = (it.angle * Math.PI) / 180;
                  const x = cx + Math.cos(rad) * R, y = cy + Math.sin(rad) * R;
                  const d = `M ${cx} ${cy} Q ${(cx + x) / 2} ${(cy + y) / 2 - 30} ${x} ${y}`;
                  return <path key={"c-" + it.key} d={d} fill="none" stroke={it.color} strokeOpacity={0.35} strokeWidth={1} />;
                })}
                {items.map((it) => {
                  const rad = (it.angle * Math.PI) / 180;
                  const x = cx + Math.cos(rad) * R, y = cy + Math.sin(rad) * R;
                  const nodeSize = 64;
                  return (
                    <g key={it.key}>
                      <motion.circle
                        cx={x} cy={y} r={nodeSize / 2} fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.28)" strokeWidth={1}
                        animate={reduce ? undefined : { r: [nodeSize / 2, nodeSize / 2 + 2, nodeSize / 2] }}
                        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                      />
                      <HealthOrbitArc pct={it.value} color={it.color} cx={x} cy={y} r={nodeSize / 2 - 6} stroke={3} />
                      <foreignObject x={x - nodeSize / 2} y={y - nodeSize / 2} width={nodeSize} height={nodeSize}>
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.ui, fontWeight: 700, fontSize: 12.5, color: "#FFFFFF" }}>
                          {it.value != null ? `${it.value}%` : <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 15 }}>—</span>}
                        </div>
                      </foreignObject>
                      <rect x={x - 34} y={y + nodeSize / 2 + 7} width={68} height={16} rx={8} fill="rgba(20,21,26,0.55)" />
                      <text x={x} y={y + nodeSize / 2 + 18.5} textAnchor="middle" fontFamily={T.ui} fontSize={9.5} fontWeight={600} fill="#F1ECE1" letterSpacing="0.05em">
                        {it.label.toUpperCase()}
                      </text>
                    </g>
                  );
                })}
                <circle cx={cx} cy={cy} r={50} fill="rgba(255,255,255,0.1)" />
                <circle cx={cx} cy={cy} r={50} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
                <text x={cx} y={cy - 5} textAnchor="middle" fontFamily={T.ui} fontSize={9.5} fontWeight={700} fill="#FFFFFF" letterSpacing="0.08em">AGENCY</text>
                <text x={cx} y={cy + 9} textAnchor="middle" fontFamily={T.ui} fontSize={9.5} fontWeight={700} fill="#FFFFFF" letterSpacing="0.08em">HEALTH</text>
              </svg>
            </div>
          </Reveal>

          {/* The photograph that used to be a full-bleed backdrop behind this
              whole section. As a tile it does a job — anchoring the right
              column — instead of being a texture the copy had to fight for
              contrast against. */}
          <Reveal delay={0.18} style={{ height: "100%" }}>
            <div style={{
              position: "relative", height: "100%", minHeight: PANEL_H,
              borderRadius: 20, overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 30px 70px rgba(0,0,0,0.45)",
            }}>
              <motion.img src={PHOTOS.health} alt="" loading="lazy" style={{
                position: "absolute", inset: -40, width: "calc(100% + 80px)", height: "calc(100% + 80px)",
                objectFit: "cover", filter: "grayscale(0.3) brightness(0.6) contrast(1.05)", y: imgY,
              }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(20,21,26,0.12) 0%, rgba(20,21,26,0.78) 100%)" }} />
              <div style={{ position: "absolute", left: 26, right: 26, bottom: 24 }}>
                <div style={{ fontFamily: T.ui, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.16em", color: F.cream, opacity: 0.85, marginBottom: 8 }}>
                  ON THE FLOOR
                </div>
                <div style={{ fontFamily: T.display, fontStyle: "italic", fontSize: 22, color: "#FFFFFF", lineHeight: 1.3 }}>
                  Every signal beside this is a room like it, mid-shoot.
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Takeaways, full width under both columns — three equal cards on one
            row instead of stacking three-deep inside a narrow column. */}
        <div style={{
          display: "grid", gap: 16, marginTop: 28,
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          textAlign: "left",
        }}>
          <InsightCard dark label="Strongest signal" value={strongest ? strongest.label : "—"} note={strongest ? `Sitting at ${strongest.value}%, the highest of those we can measure` : "No signal is measurable yet"} color="#8FBBA8" delay={0.05} />
          <InsightCard dark label="Needs attention" value={measured.length > 1 ? weakest.label : "—"} note={measured.length > 1 ? `Sitting at ${weakest.value}%, the softest of those we can measure` : "Needs at least two measured signals to compare"} color="#E0A08F" delay={0.12} />
          <InsightCard dark label="Overall average" value={avg != null ? `${Math.round(avg)}` : "—"} note={measuredNote} color="#9DB4D9" delay={0.19} />
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
 * 5 — REVENUE
 * ──────────────────────────────────────────────────────────────── */

function RevenueSection({ data = {} }) {
  const rows = [
    { label: "Collected", value: data.collected },
    { label: "Outstanding", value: data.outstanding },
    { label: "Overdue", value: data.overdue },
    { label: "Renewals", value: data.renewalsDue, isCount: true },
  ];
  const hasTrend = data.trend && data.trend.length >= 2;

  return (
    <section style={{ padding: "140px 44px", background: F.surface }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 56, alignItems: "stretch" }}>
        <div>
          <SectionHeader eyebrow="Financial" eyebrowColor={F.forest} title="Revenue" center={false} />
          <Reveal delay={0.16}>
            <BigNumber value={fmtINR(data.total)} prefix="₹" suffix={data.total != null ? "L" : ""} decimals={1} size={60} />
          </Reveal>
          <Reveal delay={0.22}>
            <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 14 }}>
              {rows.map((r) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${F.hairline}`, paddingBottom: 10 }}>
                  <span style={{ fontFamily: T.ui, fontSize: 11, fontWeight: 600, color: F.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{r.label}</span>
                  <span style={{ fontFamily: T.ui, fontSize: 14, fontWeight: 600, color: F.ink }}>
                    {r.value == null ? "—" : r.isCount ? r.value : `₹${fmtINR(r.value)}L`}
                  </span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        {/* One bordered card, not two floating pieces: the photo, the trend
            line (or its empty-state note) now share a single frame that is
            always the same shape, matched to the numbers column beside it
            instead of hanging a bare dashed line in open space. */}
        <Reveal delay={0.24} style={{ height: "100%" }}>
          <div style={{
            height: "100%", minHeight: 460, display: "flex", flexDirection: "column",
            borderRadius: 20, overflow: "hidden", border: `1px solid ${F.hairline}`,
            background: F.surface, boxShadow: "0 20px 44px rgba(20,21,26,0.05)",
          }}>
            <div style={{ position: "relative", height: 200, flexShrink: 0 }}>
              <img src={PHOTOS.revenue} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(0.2) brightness(0.85)" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 45%, rgba(20,21,26,0.72) 100%)" }} />
              <div style={{ position: "absolute", left: 20, right: 20, bottom: 16, fontFamily: T.ui, fontSize: 11, fontWeight: 600, color: "#FFFFFF", letterSpacing: "0.04em" }}>
                Every invoice, traced to the work behind it
              </div>
            </div>
            <div style={{ flex: 1, padding: "26px 26px 22px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              {hasTrend ? (
                <>
                  <div style={{ fontFamily: T.ui, fontSize: 10, fontWeight: 700, color: F.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
                    Trend
                  </div>
                  <EditorialLine data={data.trend} color={F.forest} height={140} />
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", border: `1px dashed ${F.hairlineStrong}`, borderRadius: 12 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: F.muted, flexShrink: 0 }} />
                  <span style={{ fontFamily: T.ui, fontSize: 12, color: F.muted, lineHeight: 1.5 }}>
                    A trend line appears once there's a second period of billing to compare against.
                  </span>
                </div>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
 * 6 — CAMPAIGN PIPELINE
 * ──────────────────────────────────────────────────────────────── */

function CampaignFlow({ stages = [] }) {
  const reduce = useReducedMotion();
  return (
    <section style={{ padding: "140px 44px", background: F.cream }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 56, alignItems: "stretch" }}>
        <div>
          <SectionHeader eyebrow="Campaign operations" eyebrowColor={F.navy} title="The campaign journey." center={false} />

          <div style={{ position: "relative", paddingLeft: 8 }}>
            <div style={{ position: "absolute", left: 19, top: 8, bottom: 8, width: 1, background: F.hairlineStrong }} />
            {!reduce && (
              <motion.div
                style={{ position: "absolute", left: 19, top: 8, width: 1, height: 40, background: `linear-gradient(${F.navy}, transparent)` }}
                animate={{ y: [0, 420, 0] }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              />
            )}
            {stages.map((s, i) => (
              <Reveal key={s.key} delay={i * 0.06} y={14}>
                <motion.div whileHover={{ x: 4 }} transition={{ duration: 0.25 }} style={{ display: "flex", gap: 22, alignItems: "flex-start", position: "relative", paddingBottom: i < stages.length - 1 ? 40 : 0 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%", flexShrink: 0, zIndex: 1,
                    background: F.surface, border: `1.5px solid ${s.key === "execution" ? F.navy : F.hairlineStrong}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: T.ui, fontWeight: 700, fontSize: 13, color: s.count != null ? F.navy : F.muted,
                  }}>
                    {s.count ?? "–"}
                  </div>
                  <div>
                    <div style={{ fontFamily: T.ui, fontSize: 13, fontWeight: 700, color: F.ink, letterSpacing: "0.03em", marginBottom: 3 }}>
                      {s.label.toUpperCase()}
                    </div>
                    <div style={{ fontFamily: T.ui, fontSize: 12, color: F.inkSoft }}>{s.note}</div>
                  </div>
                </motion.div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* The timeline used to be the whole section — a single narrow
            column of text on an otherwise empty field. This tile now
            stretches to match the timeline's own height via grid alignment,
            instead of a fixed paddingTop tuned to one specific stage count. */}
        <div style={{ display: "flex", alignItems: "stretch" }}>
          <SideTile src={PHOTOS.close} caption="What 'execution' looks like on set" height={360} />
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
 * 7 — CLIENT CONSTELLATION
 * ──────────────────────────────────────────────────────────────── */

/**
 * One brand, as a card that turns over.
 *
 * Front: who they are and whether anything is live.
 * Back:  the campaigns themselves — name, stage, and how far along.
 *
 * ── Why the 3D flip is built this way ───────────────────────────────────────
 * `transformStyle: preserve-3d` on a rotating parent with `backfaceVisibility:
 * hidden` on each face is the only version of this that behaves in Safari.
 * Animating two absolutely-positioned faces' opacity instead looks identical
 * for the first 40% of the turn and then shows both at once through the middle.
 *
 * The card is a fixed height rather than auto: two faces occupy the same box,
 * so the box cannot size to its content — it would collapse to whichever face
 * is currently laid out and jump on every flip. The back scrolls internally
 * when a brand has more campaigns than fit.
 */
function ClientCard({ client, delay = 0 }) {
  const [flipped, setFlipped] = useState(false);
  const reduce = useReducedMotion();
  const [fg, bg] = badgeTone(client.name || "?");
  const live = client.status === "active";
  const campaigns = client.campaigns || [];

  const face = {
    position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
    borderRadius: 16, border: `1px solid ${F.hairline}`, background: F.surface,
    display: "flex", flexDirection: "column", overflow: "hidden",
  };

  return (
    <Reveal delay={delay}>
      <div
        onClick={() => setFlipped((f) => !f)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFlipped((f) => !f); } }}
        aria-label={`${client.name} — ${flipped ? "hide" : "show"} campaigns`}
        style={{ perspective: 1200, height: 168, cursor: "pointer", outline: "none" }}
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.55, ease: EASE }}
          style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d" }}
        >
          {/* FRONT */}
          <div style={{ ...face, padding: "18px 18px 16px", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 11, background: bg, color: fg,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: T.ui, fontWeight: 700, fontSize: 13, flexShrink: 0,
              }}>
                {initials(client.name)}
              </div>
              <div style={{ minWidth: 0, textAlign: "left" }}>
                <div style={{
                  fontFamily: T.display, fontStyle: "italic", fontSize: 17, color: F.ink,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{client.name}</div>
                <div style={{ fontFamily: T.ui, fontSize: 10.5, color: F.muted, marginTop: 2 }}>
                  {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"} on record
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "4px 10px", borderRadius: 20,
                background: live ? F.forestTint : F.hairline,
                fontFamily: T.ui, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                color: live ? F.forest : F.muted,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: live ? F.forest : F.muted }} />
                {live ? `${client.activeCampaigns} LIVE` : "NO LIVE WORK"}
              </span>
              <span style={{ fontFamily: T.ui, fontSize: 15, color: F.muted, lineHeight: 1 }}>&#8635;</span>
            </div>
          </div>

          {/* BACK — pre-rotated so it faces the viewer once the parent turns */}
          <div style={{ ...face, transform: "rotateY(180deg)", background: F.paper }}>
            <div style={{
              padding: "11px 14px", borderBottom: `1px solid ${F.hairline}`,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexShrink: 0,
            }}>
              <span style={{
                fontFamily: T.ui, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em",
                color: F.muted, textTransform: "uppercase",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{client.name}</span>
              <span style={{ fontFamily: T.ui, fontSize: 14, color: F.muted, lineHeight: 1, flexShrink: 0 }}>&#8635;</span>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px 10px", textAlign: "left" }}>
              {campaigns.length === 0 ? (
                <div style={{
                  height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: T.ui, fontSize: 11, color: F.muted, fontStyle: "italic", textAlign: "center",
                }}>
                  No campaigns on the books yet
                </div>
              ) : campaigns.map((c) => (
                <div key={c.id} style={{ padding: "6px 0", borderBottom: `1px solid ${F.hairline}` }}>
                  <div style={{
                    fontFamily: T.ui, fontSize: 11.5, fontWeight: 600, color: F.ink,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{c.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <span style={{ fontFamily: T.ui, fontSize: 9.5, color: F.muted, flexShrink: 0 }}>{c.stage}</span>
                    <span style={{ flex: 1, height: 3, borderRadius: 2, background: F.hairline, overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", width: `${c.progress}%`, background: c.live ? F.forest : F.gold }} />
                    </span>
                    <span style={{ fontFamily: T.ui, fontSize: 9.5, fontWeight: 700, color: F.inkSoft, flexShrink: 0 }}>{c.progress}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </Reveal>
  );
}

function ClientPortfolio({ clients = {} }) {
  const names = clients.names || [];

  return (
    <section style={{ padding: "130px 44px 110px", background: F.surface, position: "relative" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", textAlign: "center" }}>
        <SectionHeader eyebrow="Portfolio" eyebrowColor={F.rust} title="The client portfolio."
          sub="Every brand on the books. Turn a card to see what we are running for them." />

        <Reveal delay={0.14}>
          <div style={{ display: "flex", gap: 24, justifyContent: "center", marginBottom: 36, flexWrap: "wrap" }}>
            {[
              { label: "On the books", value: clients.total, color: F.rust },
              { label: "With live work", value: clients.active, color: F.forest },
              { label: "No live campaign", value: clients.idle, color: F.muted },
            ].map((s) => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
                <span style={{ fontFamily: T.ui, fontSize: 11.5, color: F.inkSoft }}>{s.value ?? "\u2014"} {s.label}</span>
              </div>
            ))}
          </div>
        </Reveal>

        {names.length === 0 ? (
          <Reveal delay={0.2}>
            <div style={{
              padding: "60px 20px", border: `1px dashed ${F.hairlineStrong}`, borderRadius: 18,
              fontFamily: T.ui, fontSize: 12, color: F.muted,
            }}>
              Client portfolio data not yet connected
            </div>
          </Reveal>
        ) : (
          // A tight responsive grid — the constellation this replaced spread
          // five clients around a 620px circle, so the nodes sat further apart
          // the FEWER clients there were, and the middle of the diagram was a
          // permanently empty disc. A grid packs them, reads left-to-right, and
          // gets denser rather than sparser as the book grows.
          <div style={{
            display: "grid", gap: 14,
            gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
          }}>
            {names.map((n, i) => <ClientCard key={n.id || i} client={n} delay={Math.min(i * 0.05, 0.4)} />)}
          </div>
        )}

        <Reveal delay={0.2}>
          <div style={{ fontFamily: T.ui, fontSize: 10.5, color: F.muted, marginTop: 22, letterSpacing: "0.04em" }}>
            Click a card to turn it over
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
 * 8 — TEAM FIELD
 * ──────────────────────────────────────────────────────────────── */

// Small circular utilization ring used on each team card.
function UtilizationRing({ pct: value, color, size = 54, stroke = 3.5 }) {
  const reduce = useReducedMotion();
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value ?? 0));
  const offset = c - (v / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={F.hairline} strokeWidth={stroke} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={c} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        initial={{ strokeDashoffset: c }}
        whileInView={{ strokeDashoffset: offset }}
        viewport={{ once: true }}
        transition={reduce ? { duration: 0 } : { duration: 1.2, ease: EASE }}
      />
    </svg>
  );
}

function TeamField({ team = {} }) {
  const members = team.members || [];
  // Ranked by live campaign load — a real count — rather than by the
  // utilisation percentage the platform does not measure. Sorting on a field
  // that is null for everyone would have made "Highest load" whoever happened
  // to be first in the array, and captioned them "Running at null% capacity".
  const busiest = [...members].sort((a, b) => (b.activeProjects ?? 0) - (a.activeProjects ?? 0))[0];
  const busiestLoad = busiest?.activeProjects ?? 0;

  return (
    <section style={{ position: "relative", background: F.cream, overflow: "hidden" }}>
      {/* A slim photo band gives this section presence up top instead of
          opening straight into a flat field like before. */}
      <div style={{ position: "relative", height: 220, overflow: "hidden" }}>
        <img src={PHOTOS.team} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(0.3) brightness(0.55)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(20,21,26,0.35) 0%, rgba(241,236,225,1) 96%)" }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 34 }}>
          <span style={{ fontFamily: T.ui, fontSize: 10.5, fontWeight: 600, color: "#FFFFFF", letterSpacing: "0.2em" }}>THE TEAM, IN THE FIELD</span>
        </div>
      </div>

      <div style={{ padding: "40px 44px 130px", position: "relative" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <SectionHeader eyebrow="People" eyebrowColor={F.plum} title="Everyone carrying the work." />

          {members.length === 0 ? (
            <Reveal delay={0.14}>
              <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", border: `1px dashed ${F.hairlineStrong}`, borderRadius: 14, background: F.surface }}>
                <span style={{ fontFamily: T.ui, fontSize: 12, color: F.muted }}>Team capacity data not yet connected</span>
              </div>
            </Reveal>
          ) : (
            <>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 44 }}>
                <InsightCard
                  label="Roster staffed"
                  value={team.staffedPct != null ? `${team.staffedPct}%` : "—"}
                  note="Share of the team on at least one live campaign"
                  color={F.plum} delay={0.02}
                />
                <InsightCard
                  label="Highest load"
                  value={busiestLoad > 0 ? busiest.name : "—"}
                  note={busiestLoad > 0
                    ? `Carrying ${busiestLoad} live campaign${busiestLoad === 1 ? "" : "s"}`
                    : "Nobody is on a live campaign right now"}
                  color={F.rust} delay={0.08}
                />
                <InsightCard label="Team size" value={`${members.length}`} note="People who can own a campaign" color={F.gold} delay={0.14} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
                {members.map((m, i) => {
                  // The ring reads campaign load against the busiest person on
                  // the roster — a relative picture built from real counts.
                  // It used to read `utilizationPct ?? 0`, which drew an empty
                  // ring captioned "0% utilized" for anyone the platform had
                  // no capacity figure for, i.e. everyone.
                  const load = m.activeProjects ?? 0;
                  const share = busiestLoad > 0 ? Math.round((load / busiestLoad) * 100) : 0;
                  const color = load === 0 ? F.gold : share >= 85 ? F.rust : F.plum;
                  return (
                    <Reveal key={m.id || i} delay={Math.min(i * 0.04, 0.4)}>
                      <motion.div
                        whileHover={{ y: -4, boxShadow: "0 16px 34px rgba(20,21,26,0.1)" }}
                        transition={{ duration: 0.3, ease: EASE }}
                        style={{ background: F.surface, border: `1px solid ${F.hairline}`, borderRadius: 16, padding: "18px 18px 20px", display: "flex", gap: 14, alignItems: "center" }}
                      >
                        <div style={{ position: "relative", display: "flex" }}>
                          <UtilizationRing pct={share} color={color} />
                          {/* The user's own initials, from the users record —
                              the old card pulled a random stranger's face off
                              pravatar.cc keyed on a made-up seed number. */}
                          <div style={{
                            position: "absolute", inset: 7, borderRadius: "50%",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: F.navyTint, color: F.navy,
                            fontFamily: T.ui, fontWeight: 700, fontSize: 12,
                          }}>
                            {m.avatar || initials(m.name)}
                          </div>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: T.ui, fontSize: 14, fontWeight: 700, color: F.ink, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                          <div style={{ fontFamily: T.ui, fontSize: 11, color, fontWeight: 700, marginBottom: 2 }}>
                            {load} live campaign{load === 1 ? "" : "s"}
                          </div>
                          <div style={{ fontFamily: T.ui, fontSize: 10.5, color: F.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title || "—"}</div>
                        </div>
                      </motion.div>
                    </Reveal>
                  );
                })}
              </div>

              <div style={{ display: "flex", justifyContent: "center", gap: 28, marginTop: 36, flexWrap: "wrap" }}>
                {[["No live campaign", F.gold], ["Carrying work", F.plum], ["Heaviest load", F.rust]].map(([l, c]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />
                    <span style={{ fontFamily: T.ui, fontSize: 10.5, color: F.muted, letterSpacing: "0.04em" }}>{l.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
 * 9 — DECISIONS ON THE HORIZON
 * (was preceded by a Risk Radar section — removed. It scored five
 * signals — billing/client/campaign/team/AEO risk — that nothing in
 * the platform actually measures, so it only ever drew five hollow
 * grey rings under "Where attention is needed" with no attention to
 * report. See lib/summaryMetrics.js for the fuller account of why
 * that data doesn't exist yet; the section comes back if it ever does.)
 * ──────────────────────────────────────────────────────────────── */

// What populates the Decisions list once there is something pending —
// shown as quiet category cards under the empty state so "nothing pending"
// reads as a clear, informative status rather than a blank box with one
// grey sentence in it. Purely descriptive of the categories the backend
// already tags decisions with (see lib/summaryMetrics) — no invented counts.
const DECISION_CATEGORIES = [
  { label: "Renewals", note: "A client contract nearing its end date", color: F.rust },
  { label: "Budget calls", note: "Spend that needs sign-off before it moves", color: F.gold },
  { label: "Staffing", note: "A role or campaign that needs to be assigned", color: F.plum },
];

function DecisionsHorizon({ items = [] }) {
  return (
    <section style={{ padding: "140px 44px", background: F.cream }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 56, alignItems: "stretch" }}>
        <div>
          <SectionHeader eyebrow="Ahead" eyebrowColor={F.gold} title="Decisions on the horizon." center={false} />

          {items.length === 0 ? (
            <>
              <Reveal delay={0.14}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 20px", borderTop: `1px solid ${F.hairline}`, borderBottom: `1px solid ${F.hairline}` }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: F.forest, flexShrink: 0 }} />
                  <span style={{ fontFamily: T.ui, fontSize: 12.5, color: F.inkSoft, lineHeight: 1.6 }}>
                    Nothing pending founder input right now — everything on the books is running on its own.
                  </span>
                </div>
              </Reveal>

              {/* Fills the space the empty timeline left blank with concrete
                  context: what kinds of decisions land here once one comes
                  up, so the section reads as "quiet" rather than "broken". */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 28 }}>
                {DECISION_CATEGORIES.map((c, i) => (
                  <Reveal key={c.label} delay={0.2 + i * 0.06}>
                    <motion.div
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.25 }}
                      style={{ display: "flex", alignItems: "center", gap: 16, background: F.surface, border: `1px solid ${F.hairline}`, borderRadius: 14, padding: "16px 20px" }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontFamily: T.ui, fontSize: 12.5, fontWeight: 700, color: F.ink, letterSpacing: "0.02em" }}>{c.label}</div>
                        <div style={{ fontFamily: T.ui, fontSize: 11.5, color: F.inkSoft, marginTop: 2 }}>{c.note}</div>
                      </div>
                    </motion.div>
                  </Reveal>
                ))}
              </div>
            </>
          ) : (
            <div style={{ position: "relative", paddingLeft: 10 }}>
              <div style={{ position: "absolute", left: 0, top: 10, bottom: 10, width: 1, background: F.hairlineStrong }} />
              {items.map((d, i) => (
                <Reveal key={d.id} delay={i * 0.08} y={20}>
                  <motion.div whileHover={{ x: 4 }} transition={{ duration: 0.25 }} style={{ display: "flex", gap: 18, alignItems: "flex-start", paddingLeft: 40, paddingBottom: i < items.length - 1 ? 56 : 0, position: "relative" }}>
                    <span style={{ position: "absolute", left: -5, top: 4, width: 11, height: 11, borderRadius: "50%", background: F.surface, border: `1.5px solid ${F.gold}` }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: T.display, fontStyle: "italic", fontSize: 15, color: F.muted, marginBottom: 6 }}>
                        {String(i + 1).padStart(2, "0")}
                      </div>
                      <div style={{ fontFamily: T.ui, fontSize: 20, fontWeight: 600, color: F.ink, marginBottom: 6 }}>{d.title}</div>
                      {(d.impactLabel || d.deadline) && (
                        <div style={{ fontFamily: T.ui, fontSize: 11.5, color: F.inkSoft }}>
                          {[d.impactLabel, d.deadline ? `Due ${d.deadline}` : null].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    {(d.tag || d.thumb) && <InitialsBadge seed={d.tag || d.thumb} size={56} radius={12} />}
                  </motion.div>
                </Reveal>
              ))}
            </div>
          )}
        </div>

        {/* A photo card gives this column the same presence Revenue and
            Campaign Flow already have beside their own text columns —
            previously this section was the one text-only column left with
            nothing to balance it on wider screens. */}
        <div style={{ display: "flex", alignItems: "stretch" }}>
          <SideTile src={PHOTOS.decisions} caption="Where the calls that shape next quarter get made" height={360} />
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
 * 10 — PERFORMANCE
 * ──────────────────────────────────────────────────────────────── */

function PerformanceGraph({ lines = [] }) {
  const reduce = useReducedMotion();
  const W = 900, H = 340, pad = 20;
  // Two different bars: `hasChips` is "is there at least one real number to
  // show" (one invoiced month is a real number); `hasTrend` is "is there a
  // shape worth drawing a line through" (needs two). A line with exactly one
  // point used to be discarded entirely by lib/summaryMetrics before it ever
  // reached this component, which is why this section was always either a
  // full chart or a giant empty box — there was no state in between for the
  // very common case of "we have this month's number, just not last
  // month's". It now renders that case as a labelled bar read (still a real
  // chart, just not a line) and reserves the fully-empty dashed frame for
  // when there is truly no figure at all on any line.
  const hasChips = lines.some((l) => l.data && l.data.length >= 1);
  const hasTrend = lines.some((l) => l.data && l.data.length >= 2);
  const barMax = hasChips ? Math.max(1, ...lines.map((l) => (l.data && l.data.length ? l.data[l.data.length - 1] : 0))) : 1;

  return (
    <section style={{ padding: "140px 44px", background: F.cream }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <SectionHeader eyebrow="Trajectory" eyebrowColor={F.forest} title="Performance." center={false}
          sub={hasTrend
            ? "Month by month, from what has actually been invoiced and delivered."
            : hasChips
              ? "What's on the books right now — a full trend line needs a second month to compare against."
              : "The chart below fills in as billing and delivery history accumulates."} />

        {/* The panel itself is now always a chart frame — axis baseline and
            gridlines are drawn at every data state, so "no data yet" reads
            as an empty graph waiting to fill in, not a broken placeholder. */}
        <Reveal delay={0.18}>
          <div style={{ background: F.surface, border: `1px solid ${F.hairline}`, borderRadius: 20, padding: "36px 32px 28px", boxShadow: "0 20px 44px rgba(20,21,26,0.05)" }}>
            {hasChips && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
                {lines.map((line, i) => {
                  const d = line.data || [];
                  const latest = d[d.length - 1];
                  const prev = d[d.length - 2];
                  const delta = latest != null && prev != null ? latest - prev : null;
                  return (
                    <Reveal key={line.key} delay={i * 0.05}>
                      <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.25 }} style={{
                        display: "flex", alignItems: "center", gap: 10, background: F.paper,
                        border: `1px solid ${F.hairline}`, borderRadius: 12, padding: "10px 16px",
                      }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: line.color }} />
                        <span style={{ fontFamily: T.ui, fontSize: 11, fontWeight: 600, color: F.inkSoft }}>{line.label}</span>
                        <span style={{ fontFamily: T.display, fontStyle: "italic", fontSize: 17, color: F.ink }}>{latest ?? "—"}</span>
                        {delta != null && (
                          <span style={{ fontFamily: T.ui, fontSize: 10.5, fontWeight: 700, color: delta >= 0 ? F.forest : F.rust }}>
                            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}
                          </span>
                        )}
                      </motion.div>
                    </Reveal>
                  );
                })}
              </div>
            )}

            {hasTrend ? (
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow: "visible" }}>
                <defs>
                  {lines.map((line) => (
                    <linearGradient key={line.key} id={`perf-grad-${line.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={line.color} stopOpacity="0.16" />
                      <stop offset="100%" stopColor={line.color} stopOpacity="0" />
                    </linearGradient>
                  ))}
                </defs>
                {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={0} y1={H * f} x2={W} y2={H * f} stroke={F.hairline} strokeDasharray="2 6" />)}
                {lines.map((line, li) => {
                  const d = line.data || [];
                  if (d.length < 2) return null;
                  const min = Math.min(...d), max = Math.max(...d), span = max - min || 1;
                  const pts = d.map((v, i) => [
                    (i / (d.length - 1)) * W,
                    H - pad - ((v - min) / span) * (H - pad * 2),
                  ]);
                  const path = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
                  const area = path + ` L${W} ${H} L0 ${H} Z`;
                  const last = pts[pts.length - 1];
                  return (
                    <g key={line.key}>
                      <motion.path
                        d={area} fill={`url(#perf-grad-${line.key})`}
                        initial={reduce ? false : { opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true, amount: 0.4 }}
                        transition={{ duration: 1, delay: li * 0.1 }}
                      />
                      <motion.path
                        d={path} fill="none" stroke={line.color} strokeWidth={2.25} strokeLinecap="round"
                        initial={reduce ? false : { pathLength: 0 }}
                        whileInView={{ pathLength: 1 }}
                        viewport={{ once: true, amount: 0.4 }}
                        transition={{ duration: 1.6, ease: EASE, delay: li * 0.1 }}
                      />
                      <motion.circle
                        cx={last[0]} cy={last[1]} r={4} fill={line.color}
                        animate={reduce ? undefined : { r: [4, 6, 4] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                      />
                      <rect x={last[0] + 8} y={last[1] - 10} width={line.label.length * 6.4 + 12} height={16} rx={8} fill={F.surface} opacity={0.95} />
                      <text x={last[0] + 14} y={last[1] + 4} fontFamily={T.ui} fontSize={11} fontWeight={600} fill={line.color}>{line.label}</text>
                    </g>
                  );
                })}
              </svg>
            ) : hasChips ? (
              // Exactly one point per line so far: a comparative bar read is
              // an honest chart for this shape of data — a line chart with
              // one point per series is just a row of dots, which is what
              // this page used to fall back to silently.
              <svg viewBox={`0 0 ${W} 200`} width="100%" height={200} style={{ overflow: "visible" }}>
                {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={0} y1={180 * f} x2={W} y2={180 * f} stroke={F.hairline} strokeDasharray="2 6" />)}
                <line x1={0} y1={180} x2={W} y2={180} stroke={F.hairlineStrong} strokeWidth={1} />
                {lines.map((line, i) => {
                  const d = line.data || [];
                  const v = d.length ? d[d.length - 1] : 0;
                  const bw = Math.min(120, (W - 40) / lines.length - 24);
                  const gap = (W - lines.length * bw) / (lines.length + 1);
                  const bx = gap + i * (bw + gap);
                  const bh = 180 * (v / barMax);
                  return (
                    <g key={line.key}>
                      <motion.rect
                        x={bx} y={180 - bh} width={bw} height={bh} rx={6} fill={line.color} fillOpacity={0.85}
                        initial={reduce ? false : { scaleY: 0 }}
                        whileInView={{ scaleY: 1 }}
                        viewport={{ once: true, amount: 0.5 }}
                        style={{ transformOrigin: `${bx + bw / 2}px 180px` }}
                        transition={{ duration: 0.9, ease: EASE, delay: i * 0.08 }}
                      />
                      <text x={bx + bw / 2} y={172 - bh} textAnchor="middle" fontFamily={T.display} fontStyle="italic" fontSize={16} fill={F.ink}>{v || "—"}</text>
                      <text x={bx + bw / 2} y={198} textAnchor="middle" fontFamily={T.ui} fontSize={10.5} fontWeight={600} fill={F.inkSoft} letterSpacing="0.04em">{line.label.toUpperCase()}</text>
                    </g>
                  );
                })}
              </svg>
            ) : (
              // Truly nothing yet — still a chart frame (baseline + faint
              // gridlines), just with no shape drawn on it, rather than a
              // dashed rectangle with a sentence floating inside it.
              <svg viewBox={`0 0 ${W} 180`} width="100%" height={180} style={{ overflow: "visible" }}>
                {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={0} y1={160 * f} x2={W} y2={160 * f} stroke={F.hairline} strokeDasharray="2 6" />)}
                <line x1={0} y1={160} x2={W} y2={160} stroke={F.hairlineStrong} strokeWidth={1} />
                <text x={W / 2} y={86} textAnchor="middle" fontFamily={T.ui} fontSize={12} fill={F.muted}>
                  Performance trend will appear once operating history accumulates
                </text>
              </svg>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
 * 10b — LIVE-POST GROWTH
 *
 * The audience side of Trajectory, which it sits directly beneath: that
 * section is what has been invoiced and delivered, this is what the delivered
 * work went on to do once it was live.
 *
 * Drawn from the append-only history the backend now records on every
 * post-metrics refresh. Until that existed each refresh overwrote the previous
 * numbers, so the agency only ever had a "now" — this curve was unrecoverable
 * from stored data, which is why the page never had it.
 *
 * Cumulative, so it only ever climbs; see growthFrom() in lib/summaryMetrics
 * for why creators measured on different days are carried forward rather than
 * counted as zero.
 * ──────────────────────────────────────────────────────────────── */

function LivePostGrowth({ growth }) {
  const reduce = useReducedMotion();
  const [metric, setMetric] = useState("views");
  const points = growth?.points || [];
  const W = 900, H = 300, pad = 24;

  const series = points.map((p) => p[metric]);
  const has = series.length >= 2;
  const latest = series[series.length - 1] ?? 0;
  const gained = has ? latest - series[0] : 0;
  const color = metric === "views" ? F.navy : F.plum;

  const label = (d) => {
    const [, m, day] = String(d).split("-");
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${MONTHS[Number(m) - 1]} ${Number(day)}`;
  };

  // Baseline at zero rather than at the series minimum. This is cumulative
  // reach, so the honest read is how far it has climbed from nothing — a
  // min-anchored axis would turn a steady build into a dramatic-looking ramp.
  const max = has ? Math.max(...series, 1) : 1;
  const pts = series.map((v, i) => [
    (i / (series.length - 1 || 1)) * W,
    H - pad - (v / max) * (H - pad * 2),
  ]);
  const path = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = has ? path + ` L${W} ${H} L0 ${H} Z` : "";

  return (
    <section style={{ padding: "140px 44px", background: F.surface }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <SectionHeader eyebrow="Audience" eyebrowColor={F.plum} title="What the work did once it was live." center={false}
          sub={has
            ? `Cumulative ${metric === "views" ? "views" : "engagements"} across ${growth.creators} tracked post${growth.creators === 1 ? "" : "s"} on ${growth.campaigns} campaign${growth.campaigns === 1 ? "" : "s"}, recorded at every metrics refresh.`
            : "This curve fills in as live posts are refreshed — two readings are needed before there is a shape to draw."} />

        <Reveal delay={0.18}>
          <div style={{ background: F.paper, border: `1px solid ${F.hairline}`, borderRadius: 20, padding: "32px 32px 26px", boxShadow: "0 20px 44px rgba(20,21,26,0.05)" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 26 }}>
              <div>
                <div style={{ fontFamily: T.ui, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: F.muted }}>
                  Total {metric}
                </div>
                <div style={{ fontFamily: T.display, fontStyle: "italic", fontSize: 40, lineHeight: 1.05, color: F.ink, marginTop: 4 }}>
                  {has ? fmtCompact(latest) : "—"}
                </div>
                {has && (
                  <div style={{ fontFamily: T.ui, fontSize: 11.5, color: F.inkSoft, marginTop: 6 }}>
                    +{fmtCompact(gained)} since {label(points[0].date)} · {points.length} readings
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 4, background: F.cream, border: `1px solid ${F.hairline}`, borderRadius: 999, padding: 4 }}>
                {[["views", "Views"], ["engagements", "Engagements"]].map(([id, l]) => (
                  <button key={id} onClick={() => setMetric(id)} style={{
                    border: "none", cursor: "pointer", borderRadius: 999, padding: "6px 14px",
                    fontFamily: T.ui, fontSize: 11.5, fontWeight: 600,
                    background: metric === id ? F.surface : "transparent",
                    color: metric === id ? F.ink : F.muted,
                    boxShadow: metric === id ? "0 1px 3px rgba(20,21,26,0.10)" : "none",
                    transition: "background 0.2s, color 0.2s",
                  }}>{l}</button>
                ))}
              </div>
            </div>

            {/* Always a chart frame — baseline and gridlines are drawn at every
                data state, so "nothing measured yet" reads as an empty graph
                waiting to fill in rather than as a broken placeholder. */}
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow: "visible" }}>
              <defs>
                <linearGradient id="growth-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75].map((f) => (
                <line key={f} x1={0} y1={H * f} x2={W} y2={H * f} stroke={F.hairline} strokeDasharray="2 6" />
              ))}
              <line x1={0} y1={H} x2={W} y2={H} stroke={F.hairlineStrong} strokeWidth={1} />

              {has ? (
                <g key={metric}>
                  <motion.path d={area} fill="url(#growth-grad)"
                    initial={reduce ? false : { opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 1 }} />
                  <motion.path d={path} fill="none" stroke={color} strokeWidth={2.25} strokeLinecap="round"
                    initial={reduce ? false : { pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 1.6, ease: EASE }} />
                  <motion.circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={4} fill={color}
                    animate={reduce ? undefined : { r: [4, 6, 4] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
                </g>
              ) : (
                <text x={W / 2} y={H / 2} textAnchor="middle" fontFamily={T.ui} fontSize={12} fill={F.muted}>
                  Live-post growth appears here after posts have been refreshed twice
                </text>
              )}
            </svg>

            {has && (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
                <span style={{ fontFamily: T.ui, fontSize: 10.5, color: F.muted }}>{label(points[0].date)}</span>
                <span style={{ fontFamily: T.ui, fontSize: 10.5, color: F.muted }}>{label(points[points.length - 1].date)}</span>
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
 * 11 — THE BIG PICTURE
 * ──────────────────────────────────────────────────────────────── */

function BigPicture() {
  const reduce = useReducedMotion();
  const stages = [
    { label: "Campaigns", color: F.navy },
    { label: "Delivery", color: F.forest },
    { label: "Client health", color: F.gold },
    { label: "Retention", color: F.plum },
    { label: "Revenue", color: F.rust },
  ];
  const W = 1000, H = 200;
  const n = stages.length;
  const nodeX = (i) => 60 + (i / (n - 1)) * (W - 120);
  const nodeY = H / 2;

  return (
    <section style={{ padding: "160px 44px", background: F.surface, textAlign: "center", position: "relative", overflow: "hidden" }}>
      <SectionHeader eyebrow="Cause and effect" eyebrowColor={F.navy}
        title="Everything is connected." sub="One motion, moving through five stages of the business." />

      <Reveal delay={0.15}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow: "visible" }}>
            <defs>
              <linearGradient id="bigpic-flow" x1="0" y1="0" x2="1" y2="0">
                {stages.map((s, i) => <stop key={i} offset={`${(i / (n - 1)) * 100}%`} stopColor={s.color} />)}
              </linearGradient>
            </defs>

            {/* base connecting line */}
            <line x1={nodeX(0)} y1={nodeY} x2={nodeX(n - 1)} y2={nodeY} stroke={F.hairlineStrong} strokeWidth={2} />
            {/* animated flow line drawn on top */}
            <motion.line
              x1={nodeX(0)} y1={nodeY} x2={nodeX(n - 1)} y2={nodeY} stroke="url(#bigpic-flow)" strokeWidth={2}
              initial={reduce ? false : { pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 1.8, ease: EASE, delay: 0.2 }}
            />
            {/* drifting particles simulating motion along the line */}
            {!reduce && [0, 1, 2].map((k) => (
              <motion.circle key={k} r={3.5} fill={F.gold}
                initial={{ cx: nodeX(0), cy: nodeY, opacity: 0 }}
                animate={{ cx: [nodeX(0), nodeX(n - 1)], cy: nodeY, opacity: [0, 1, 1, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear", delay: k * 1.35 }}
              />
            ))}

            {stages.map((s, i) => (
              <g key={s.label}>
                <motion.circle
                  cx={nodeX(i)} cy={nodeY} r={11} fill={F.surface} stroke={s.color} strokeWidth={2.5}
                  initial={reduce ? false : { scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true, amount: 0.6 }}
                  transition={{ duration: 0.5, ease: EASE, delay: 0.3 + i * 0.15 }}
                  style={{ transformOrigin: `${nodeX(i)}px ${nodeY}px` }}
                />
                <circle cx={nodeX(i)} cy={nodeY} r={4} fill={s.color} />
                <text x={nodeX(i)} y={nodeY - 28} textAnchor="middle" fontFamily={T.display} fontStyle="italic" fontSize={16} fill={F.ink}>
                  {s.label}
                </text>
                {i < n - 1 && (
                  <text x={(nodeX(i) + nodeX(i + 1)) / 2} y={nodeY + 34} textAnchor="middle" fontFamily={T.ui} fontSize={10} fontWeight={600} fill={F.muted} letterSpacing="0.08em">
                    INFLUENCES
                  </text>
                )}
              </g>
            ))}
          </svg>
        </div>
      </Reveal>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
 * 12 — CLOSING
 * ──────────────────────────────────────────────────────────────── */



/* ────────────────────────────────────────────────────────────────
 * 13 — FOOTER
 * Reuses the same dark full-bleed-photo treatment as the closing
 * section (per feedback: "the last tab is good, make it footer bg").
 * ──────────────────────────────────────────────────────────────── */

const FOOTER_LINKS = {
  Platform: [
    { label: "Overview", href: "https://5th-avenue-client-front.vercel.app/portal/overview" },
    { label: "Campaigns", href: "https://5th-avenue-client-front.vercel.app/portal/campaigns" },
    { label: "Regional map", href: "https://5th-avenue-client-front.vercel.app/portal/regional" },
    { label: "Profile", href: "https://5th-avenue-client-front.vercel.app/portal/profile" },
  ],
  Services: [
    { label: "Tech & Data", href: "https://5th-avenue-client-front.vercel.app/tech" },
    { label: "Creatives", href: "https://5th-avenue-client-front.vercel.app/creatives" },
    { label: "Regional network", href: "https://5th-avenue-client-front.vercel.app/regional" },
    { label: "International", href: "https://5th-avenue-client-front.vercel.app/international" },
  ],
  Company: [
    { label: "Portfolio", href: "https://5th-avenue-client-front.vercel.app/portfolio" },
    { label: "Careers", href: "https://5th-avenue-client-front.vercel.app/careers" },
    { label: "Creators", href: "https://5th-avenue-client-front.vercel.app/apply" },
    { label: "Start a project", href: "https://5th-avenue-client-front.vercel.app/start" },
    { label: "Client login", href: "https://5th-avenue-client-front.vercel.app/login" },
  ],
  Legal: [
    { label: "Privacy", href: "https://5th-avenue-client-front.vercel.app/legal/privacy" },
    { label: "Terms", href: "https://5th-avenue-client-front.vercel.app/legal/terms" },
    { label: "Security", href: "https://5th-avenue-client-front.vercel.app/legal/security" },
    { label: "GST", href: "https://5th-avenue-client-front.vercel.app/legal/gst" },
  ],
};

function FooterLink({ href, children }) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      whileHover={{ x: 3, opacity: 1 }}
      transition={{ duration: 0.2 }}
      style={{
        display: "block", fontFamily: T.ui, fontSize: 13, color: "rgba(255,255,255,0.68)",
        textDecoration: "none", marginBottom: 12, opacity: 0.85,
      }}
    >
      {children}
    </motion.a>
  );
}

function Footer() {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [-20, 20]);

  return (
    <footer ref={ref} style={{ position: "relative", overflow: "hidden", background: F.ink }}>
      <motion.div style={{ position: "absolute", inset: -30, y }}>
        <img src={PHOTOS.footer} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(0.4) brightness(0.28)" }} />
      </motion.div>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(20,21,26,0.75) 0%, rgba(20,21,26,0.94) 100%)" }} />

      <div style={{ position: "relative", padding: "100px 44px 40px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 40, paddingBottom: 64, borderBottom: "1px solid rgba(255,255,255,0.14)" }}>
            {/* Brand column */}
            <Reveal>
              <div>
                <a href="https://5th-avenue-client-front.vercel.app/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                  <div style={{ fontFamily: T.display, fontStyle: "italic", fontSize: 26, color: "#FFFFFF", marginBottom: 18 }}>
                    Fifth Avenue
                  </div>
                </a>
                <p style={{ fontFamily: T.ui, fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, maxWidth: 320, marginBottom: 20 }}>
                  Full-service marketing, engineered. Influencer, AI-search, performance and regional creator campaigns across India.
                </p>
                <a href="mailto:contact@fifth-avenue.in" style={{ fontFamily: T.ui, fontSize: 13, fontWeight: 600, color: F.cream, textDecoration: "none", borderBottom: "1px solid rgba(241,236,225,0.4)", paddingBottom: 2 }}>
                  contact@fifth-avenue.in
                </a>
              </div>
            </Reveal>

            {Object.entries(FOOTER_LINKS).map(([col, links], i) => (
              <Reveal key={col} delay={0.06 + i * 0.05}>
                <div>
                  <div style={{ fontFamily: T.ui, fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,0.42)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 18 }}>
                    {col}
                  </div>
                  {links.map((l) => <FooterLink key={l.label} href={l.href}>{l.label}</FooterLink>)}
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.2}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, paddingTop: 28 }}>
              <span style={{ fontFamily: T.ui, fontSize: 11, color: "rgba(255,255,255,0.42)", letterSpacing: "0.08em" }}>
                INDIA · EST. MMXXVI
              </span>
              <span style={{ fontFamily: T.ui, fontSize: 11, color: "rgba(255,255,255,0.42)" }}>
                © 2026 5th Avenue Marketing
              </span>
            </div>
          </Reveal>
        </div>
      </div>
    </footer>
  );
}

/* ────────────────────────────────────────────────────────────────
 * PAGE — FounderSummary
 * ──────────────────────────────────────────────────────────────── */

export default function FounderSummary() {
  const [data, setData] = useState(EMPTY);
  // The shell's brand filter is now on every route, so this page has to answer
  // to it rather than quietly ignore a control the reader can see.
  const { brandFilter } = useOutletContext() || {};

  useEffect(() => {
    let live = true;

    // Each collection is fetched independently and a failure is contained to
    // its own slice: if `quotes` 404s, the decisions list loses its quote rows
    // and every other section still reports. The alternative — one rejected
    // Promise.all — would blank the whole page over one bad endpoint.
    const safe = (p) => p.then((r) => r).catch(() => []);

    Promise.all([
      safe(CampaignsAPI.list()),
      safe(ClientsAPI.list()),
      safe(InvoicesAPI.list()),
      safe(UsersAPI.list()),
      safe(CreatorsAPI.list()),
      safe(QuotesAPI.list()),
      safe(ClientRequestsAPI.list()),
      safe(CreatorRequestsAPI.list()),
    ]).then(([campaigns, clients, invoices, users, creators, quotes, clientRequests, creatorRequests]) => {
      if (!live) return;
      // Only the three collections that actually carry a brand are scoped, plus
      // the client the brand IS. Team, the creator directory and the inbound
      // request inboxes are agency-wide by nature — a creator belongs to the
      // roster, not to a brand, and filtering them would report "0 creators"
      // for a brand that simply hasn't booked anyone yet, which is a different
      // and false claim. They stay whole, and the sections that read them stay
      // agency-wide on purpose.
      const forBrand = (rows) => brandFilter ? rows.filter(r => r?.brandId === brandFilter) : rows;
      setData(
        buildSummary(
          {
            campaigns: forBrand(campaigns),
            clients:   brandFilter ? clients.filter(c => (c.id || c._id) === brandFilter) : clients,
            invoices:  forBrand(invoices),
            quotes:    forBrand(quotes),
            users, creators, clientRequests, creatorRequests,
          },
          F,
        ),
      );
    });

    return () => { live = false; };
  }, [brandFilter]);

  const asOfLabel = useMemo(() => {
    if (data.asOf) return data.asOf;
    const d = new Date();
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }).toUpperCase();
  }, [data.asOf]);

  return (
    <div style={{ background: F.paper, fontFamily: T.ui, color: F.ink, position: "relative" }}>
      <GrainOverlay />

      {/* ── SECTION ORDER ──
          Revenue is now followed immediately by Trajectory (PerformanceGraph)
          and then by the internal roster (TeamField): the money, how it is
          moving, and who is moving it, read as one continuous argument instead
          of being separated by three other chapters.

          The four full-bleed photo interludes ("What the work looks like",
          "Behind the work", "Momentum", "Craft") and the ContentMosaic tile
          grid are gone. They were stock photography carrying no data — pure
          page furniture between sections that DO carry data — and at ~480px
          each they added roughly two screens of scrolling to a report whose
          whole point is density. The dark SectionSeam went with them: it
          existed only to separate the studio interlude from Agency Health, and
          with the interlude gone it was a 72px gap before a section that now
          follows the Big Numbers directly. */}
      <Hero asOfLabel={asOfLabel} />
      <ExecutiveStatement />
      <BigNumbers revenue={data.revenue} bigNumbers={data.bigNumbers} />
      <AgencyHealth health={data.health} />
      <RevenueSection data={data.revenue} />
      <PerformanceGraph lines={data.performance.lines} />
      {/* Directly after Trajectory, and on F.surface rather than F.cream so the
          two alternate: Trajectory is what was invoiced and delivered, this is
          what the delivered work went on to do once it was live. Reading them
          as a pair is the point, so no seam between them. */}
      <LivePostGrowth growth={data.growth} />
      {/* Growth and Team would otherwise run together as one long section. */}
      <SectionSeam tone="light" />
      <TeamField team={data.team} />
      {/* Team and Campaign Flow are both F.cream too. */}
      <SectionSeam tone="light" />
      <CampaignFlow stages={data.campaigns.stages} />
      <ClientPortfolio clients={data.clients} />
      <DecisionsHorizon items={data.decisions} />
      <BigPicture />

      <Footer />
    </div>
  );
}