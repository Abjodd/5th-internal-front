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
 *
 * CHANGELOG (this pass #3 — client cards use real brand logos)
 * ──────────────────────────────────────────────
 * 10. CLIENT PORTFOLIO CARDS: the front face of each client card
 *     showed a deterministic colour-coded initials badge instead of
 *     the brand's actual uploaded logo — the same logo the nav's
 *     brand-filter pill already renders via ClientsAPI.avatarUrl().
 *     Client cards now render that logo when the client record has
 *     one (hasAvatar/avatarUpdatedAt coming through on clients.names
 *     from lib/summaryMetrics), and fall back to the initials badge
 *     only when there is no logo or the image fails to load.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  animate,
  useScroll,
  useTransform,
} from "motion/react";
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

  const [socialNews, setSocialNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState(false);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const titleY = useTransform(
    scrollYProgress,
    [0, 1],
    reduce ? [0, 0] : [0, 55]
  );

  const fade = useTransform(
    scrollYProgress,
    [0, 0.9],
    [1, 0]
  );

  /*
   * ============================================================
   * GNEWS CONFIG
   * ============================================================
   *
   * Put your GNews API key here.
   *
   * IMPORTANT:
   * This is frontend-only, so the key is visible to users.
   * Fine for a prototype/internal dashboard.
   */



  /*
   * ============================================================
   * SOCIAL NEWS FETCH
   * ============================================================
   */

  useEffect(() => {
  let cancelled = false;

  async function fetchSocialNews() {
    try {
      setNewsLoading(true);
      setNewsError(false);

      // IMPORTANT:
      // This calls YOUR Vercel serverless function.
      // The GNews API key stays on the server.
      const response = await fetch("/api/social-news");

      if (!response.ok) {
        throw new Error(`Social news API returned ${response.status}`);
      }

      const data = await response.json();

      console.log("Social news response:", data);

      const articles = Array.isArray(data.articles)
        ? data.articles
        : Array.isArray(data)
          ? data
          : [];

      const filtered = articles
        .filter((article) => article?.title && article?.url)
        .map((article) => ({
          id: article.url,
          title: article.title,
          description: article.description || "",
          image: article.image || PHOTOS.close,
          url: article.url,
          source:
            article.source?.name ||
            article.source ||
            "Social Media",
          publishedAt: article.publishedAt,

          platform: detectSocialPlatform(
            [
              article.title,
              article.description,
              article.content,
            ]
              .filter(Boolean)
              .join(" ")
          ),

          timeAgo: formatNewsTime(article.publishedAt),
        }));

      const unique = Array.from(
        new Map(
          filtered.map((item) => [item.url, item])
        ).values()
      );

      console.log("Social news found:", unique);

      if (!cancelled) {
        setSocialNews(unique.slice(0, 10));
      }
    } catch (error) {
      console.error("SOCIAL NEWS ERROR:", error);

      if (!cancelled) {
        setNewsError(true);
        setSocialNews([]);
      }
    } finally {
      if (!cancelled) {
        setNewsLoading(false);
      }
    }
  }

  fetchSocialNews();

  // Refresh every 10 minutes
  const interval = setInterval(
    fetchSocialNews,
    10 * 60 * 1000
  );

  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}, []);

  /*
   * ============================================================
   * PLATFORM DETECTION
   * ============================================================
   */

  function detectSocialPlatform(text = "") {
    const value =
      text.toLowerCase();

    if (
      value.includes("instagram") ||
      value.includes("reels")
    ) {
      return "Instagram";
    }

    if (
      value.includes("tiktok")
    ) {
      return "TikTok";
    }

    if (
      value.includes("youtube") ||
      value.includes("shorts")
    ) {
      return "YouTube";
    }

    if (
      value.includes("facebook") ||
      value.includes("meta")
    ) {
      return "Meta";
    }

    if (
      value.includes("linkedin")
    ) {
      return "LinkedIn";
    }

    if (
      value.includes("threads")
    ) {
      return "Threads";
    }

    if (
      value.includes("snapchat")
    ) {
      return "Snapchat";
    }

    if (
      value.includes("creator") ||
      value.includes("influencer")
    ) {
      return "Creator Economy";
    }

    return "Social Media";
  }

  /*
   * ============================================================
   * TIME FORMAT
   * ============================================================
   */

  function formatNewsTime(date) {
    if (!date) return "";

    const time =
      new Date(date).getTime();

    if (Number.isNaN(time)) {
      return "";
    }

    const difference =
      Date.now() - time;

    const minutes =
      Math.floor(
        difference / 60000
      );

    if (minutes < 1) {
      return "Just now";
    }

    if (minutes < 60) {
      return `${minutes}m ago`;
    }

    const hours =
      Math.floor(minutes / 60);

    if (hours < 24) {
      return `${hours}h ago`;
    }

    const days =
      Math.floor(hours / 24);

    if (days < 7) {
      return `${days}d ago`;
    }

    return new Date(date)
      .toLocaleDateString(
        "en-IN",
        {
          day: "numeric",
          month: "short",
        }
      );
  }

  /*
   * Duplicate the feed so the rail can loop continuously.
   */

  const newsRail =
    socialNews.length >= 3
      ? [
          ...socialNews,
          ...socialNews,
        ]
      : socialNews;

  return (
    <section
      ref={ref}
      className="fs-hero"
      data-nav-merge
      data-nav-tone="light"
      style={{
        position: "relative",
        minHeight: "94vh",
        overflow: "hidden",
        background: F.cream,
        color: F.ink,
        paddingTop: 105,
      }}
    >

      {/* ======================================================
          STYLES
      ======================================================= */}

      <style>{`

        @keyframes fsSocialRail {
          from {
            transform:
              translate3d(0, 0, 0);
          }

          to {
            transform:
              translate3d(-50%, 0, 0);
          }
        }

        @keyframes fsLivePulse {
          0%,
          100% {
            opacity: .3;
            transform: scale(.8);
          }

          50% {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes fsSkeleton {
          0% {
            background-position:
              200% 0;
          }

          100% {
            background-position:
              -200% 0;
          }
        }

        .fs-social-news-rail {
          animation:
            fsSocialRail
            55s
            linear
            infinite;

          will-change:
            transform;
        }

        .fs-social-news-rail:hover {
          animation-play-state:
            paused;
        }

        .fs-social-card {
          transition:
            transform
              .4s
              cubic-bezier(.2,.8,.2,1),
            box-shadow
              .4s ease;
        }

        .fs-social-card:hover {
          transform:
            translateY(-9px);

          box-shadow:
            0 28px 65px
            rgba(20,21,26,.14)
            !important;
        }

        .fs-social-image {
          transition:
            transform
              .65s
              cubic-bezier(.2,.8,.2,1);
        }

        .fs-social-card:hover
        .fs-social-image {
          transform:
            scale(1.06);
        }

        @media (max-width: 760px) {

          .fs-hero-title {
            font-size:
              clamp(
                52px,
                14vw,
                82px
              ) !important;
          }

          .fs-social-card {
            width:
              285px !important;
          }

        }

        @media (prefers-reduced-motion: reduce) {

          .fs-social-news-rail {
            animation:
              none;
          }

        }

      `}</style>

      {/* ======================================================
          DECORATIVE BACKGROUND
      ======================================================= */}

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          width: 650,
          height: 650,
          borderRadius: "50%",
          top: -390,
          right: -190,
          background:
            "radial-gradient(circle, rgba(169,145,94,.14), transparent 68%)",
          pointerEvents: "none",
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          borderRadius: "50%",
          left: -330,
          top: 260,
          background:
            "radial-gradient(circle, rgba(90,105,130,.07), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* ======================================================
          TOP BAR
      ======================================================= */}

      <div
        style={{
          position: "relative",
          zIndex: 5,
          maxWidth: 1280,
          margin: "0 auto",
          padding: "0 44px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
        }}
      >

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            fontFamily: T.ui,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: ".18em",
            textTransform: "uppercase",
            color: F.muted,
          }}
        >

          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: F.forest,
              boxShadow:
                `0 0 0 5px ${F.forestTint}`,
              animation: reduce
                ? undefined
                : "fsLivePulse 2.2s ease-in-out infinite",
            }}
          />

          Agency intelligence

        </div>

        <div
          style={{
            fontFamily: T.ui,
            fontSize: 9.5,
            letterSpacing: ".12em",
            color: F.muted,
          }}
        >
          {asOfLabel}
        </div>

      </div>

      {/* ======================================================
          MAIN TITLE
      ======================================================= */}

      <motion.div
        style={{
          position: "relative",
          zIndex: 3,
          maxWidth: 1180,
          margin: "0 auto",
          padding:
            "82px 44px 0",
          textAlign: "center",
          y: titleY,
          opacity: fade,
        }}
      >

        {/* EYEBROW */}

        <motion.div
          initial={
            reduce
              ? false
              : {
                  opacity: 0,
                  y: 12,
                }
          }
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: 0.7,
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            fontFamily: T.ui,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: ".18em",
            textTransform: "uppercase",
            color: F.muted,
            marginBottom: 25,
          }}
        >

          <span
            style={{
              width: 32,
              height: 1,
              background:
                F.hairlineStrong,
            }}
          />

          Founder Summary

          <span
            style={{
              width: 32,
              height: 1,
              background:
                F.hairlineStrong,
            }}
          />

        </motion.div>

        {/* TITLE */}

        <motion.h1
          className="fs-hero-title"
          initial={
            reduce
              ? false
              : {
                  opacity: 0,
                  y: 30,
                }
          }
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: 1,
            ease: EASE,
            delay: 0.1,
          }}
          style={{
            fontFamily: T.display,
            fontStyle: "italic",
            fontWeight: 500,
            fontSize:
              "clamp(58px, 9vw, 126px)",
            lineHeight: 0.88,
            letterSpacing: "-.045em",
            color: F.ink,
            margin: 0,
          }}
        >
          The state of
          <br />

          <span
            style={{
              marginLeft:
                "clamp(20px, 8vw, 130px)",
            }}
          >
            the agency.
          </span>

        </motion.h1>

        {/* DESCRIPTION */}

        <motion.p
          initial={
            reduce
              ? false
              : {
                  opacity: 0,
                  y: 15,
                }
          }
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: 0.8,
            ease: EASE,
            delay: 0.35,
          }}
          style={{
            maxWidth: 480,
            margin:
              "36px auto 0",
            fontFamily: T.ui,
            fontSize: 14,
            lineHeight: 1.7,
            color: F.inkSoft,
          }}
        >
          A living view of the work,
          the people behind it,
          and what is changing
          across social media right now.
        </motion.p>

      </motion.div>

      {/* ======================================================
          SOCIAL PULSE
      ======================================================= */}

      <section
        style={{
          position: "relative",
          zIndex: 6,
          marginTop: 82,
          paddingBottom: 70,
        }}
      >

        {/* HEADER */}

        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "0 44px",
          }}
        >

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent:
                "space-between",
              gap: 20,
              marginBottom: 28,
            }}
          >

            <div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: T.ui,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: ".16em",
                  textTransform:
                    "uppercase",
                  color: F.muted,
                }}
              >

                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius:
                      "50%",
                    background:
                      F.forest,
                    animation: reduce
                      ? undefined
                      : "fsLivePulse 2s ease-in-out infinite",
                  }}
                />

                Social pulse

              </div>

              <h2
                style={{
                  margin:
                    "9px 0 0",
                  fontFamily:
                    T.display,
                  fontStyle:
                    "italic",
                  fontWeight: 500,
                  fontSize:
                    "clamp(34px, 4vw, 57px)",
                  lineHeight: .95,
                  letterSpacing:
                    "-.035em",
                  color: F.ink,
                }}
              >
                What's happening
                <br />

                <span
                  style={{
                    marginLeft: 35,
                  }}
                >
                  on social.
                </span>
              </h2>

            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                paddingBottom: 5,
                fontFamily: T.ui,
                fontSize: 8.5,
                fontWeight: 700,
                letterSpacing: ".12em",
                textTransform:
                  "uppercase",
                color: F.muted,
                whiteSpace:
                  "nowrap",
              }}
            >

              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius:
                    "50%",
                  background:
                    F.forest,
                }}
              />

              Social media only

            </div>

          </div>

        </div>

        {/* ====================================================
            LOADING
        ===================================================== */}

        {newsLoading && (

          <div
            style={{
              display: "flex",
              gap: 14,
              overflow: "hidden",
              paddingLeft: 44,
            }}
          >

            {[1, 2, 3, 4].map(
              (item) => (
                <div
                  key={item}
                  style={{
                    width: 330,
                    height: 330,
                    flexShrink: 0,
                    borderRadius: 18,
                    background:
                      "linear-gradient(90deg, rgba(20,21,26,.035), rgba(20,21,26,.09), rgba(20,21,26,.035))",
                    backgroundSize:
                      "200% 100%",
                    animation:
                      "fsSkeleton 1.6s ease-in-out infinite",
                  }}
                />
              )
            )}

          </div>

        )}

        {/* ====================================================
            NEWS
        ===================================================== */}

        {!newsLoading &&
          socialNews.length > 0 && (

            <div
              style={{
                overflow:
                  "hidden",
                width: "100%",
              }}
            >

              <div
                className="fs-social-news-rail"
                style={{
                  display: "flex",
                  gap: 14,
                  width: "max-content",
                  paddingLeft: 44,
                }}
              >

                {newsRail.map(
                  (article, index) => (

                    <a
                      key={
                        `${article.id}-${index}`
                      }
                      href={
                        article.url
                      }
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        textDecoration:
                          "none",
                        color:
                          "inherit",
                      }}
                    >

                      <article
                        className="fs-social-card"
                        style={{
                          width: 330,
                          flexShrink: 0,
                          borderRadius:
                            18,
                          overflow:
                            "hidden",
                          background:
                            F.paper,
                          border:
                            `1px solid ${F.hairline}`,
                          boxShadow:
                            "0 16px 40px rgba(20,21,26,.07)",
                        }}
                      >

                        {/* IMAGE */}

                        <div
                          style={{
                            position:
                              "relative",
                            height:
                              190,
                            overflow:
                              "hidden",
                            background:
                              F.hairline,
                          }}
                        >

                          <img
                            className="fs-social-image"
                            src={
                              article.image
                            }
                            alt=""
                            loading="lazy"
                            style={{
                              width:
                                "100%",
                              height:
                                "100%",
                              objectFit:
                                "cover",
                              display:
                                "block",
                            }}
                          />

                          <div
                            style={{
                              position:
                                "absolute",
                              inset: 0,
                              background:
                                "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(12,13,17,.75) 100%)",
                            }}
                          />

                          {/* PLATFORM */}

                          <span
                            style={{
                              position:
                                "absolute",
                              left: 14,
                              bottom: 13,
                              padding:
                                "6px 10px",
                              borderRadius:
                                999,
                              background:
                                "rgba(255,255,255,.90)",
                              backdropFilter:
                                "blur(10px)",
                              fontFamily:
                                T.ui,
                              fontSize:
                                8,
                              fontWeight:
                                750,
                              letterSpacing:
                                ".11em",
                              textTransform:
                                "uppercase",
                              color:
                                F.ink,
                            }}
                          >
                            {article.platform}
                          </span>

                        </div>

                        {/* ARTICLE CONTENT */}

                        <div
                          style={{
                            padding:
                              "17px 17px 18px",
                          }}
                        >

                          <div
                            style={{
                              display:
                                "flex",
                              justifyContent:
                                "space-between",
                              gap: 12,
                              marginBottom:
                                9,
                            }}
                          >

                            <span
                              style={{
                                fontFamily:
                                  T.ui,
                                fontSize:
                                  8.5,
                                fontWeight:
                                  700,
                                letterSpacing:
                                  ".1em",
                                textTransform:
                                  "uppercase",
                                color:
                                  F.muted,
                              }}
                            >
                              {article.source}
                            </span>

                            <span
                              style={{
                                fontFamily:
                                  T.ui,
                                fontSize:
                                  8.5,
                                color:
                                  F.muted,
                                whiteSpace:
                                  "nowrap",
                              }}
                            >
                              {article.timeAgo}
                            </span>

                          </div>

                          <div
                            style={{
                              fontFamily:
                                T.ui,
                              fontSize:
                                14,
                              lineHeight:
                                1.38,
                              fontWeight:
                                650,
                              letterSpacing:
                                "-.015em",
                              color:
                                F.ink,
                            }}
                          >
                            {article.title}
                          </div>

                          {article.description && (
                            <div
                              style={{
                                marginTop:
                                  8,
                                fontFamily:
                                  T.ui,
                                fontSize:
                                  10.5,
                                lineHeight:
                                  1.55,
                                color:
                                  F.muted,
                                display:
                                  "-webkit-box",
                                WebkitLineClamp:
                                  2,
                                WebkitBoxOrient:
                                  "vertical",
                                overflow:
                                  "hidden",
                              }}
                            >
                              {article.description}
                            </div>
                          )}

                          <div
                            style={{
                              display:
                                "flex",
                              alignItems:
                                "center",
                              justifyContent:
                                "space-between",
                              marginTop:
                                14,
                              paddingTop:
                                11,
                              borderTop:
                                `1px solid ${F.hairline}`,
                            }}
                          >

                            <span
                              style={{
                                fontFamily:
                                  T.ui,
                                fontSize:
                                  8,
                                fontWeight:
                                  700,
                                letterSpacing:
                                  ".1em",
                                textTransform:
                                  "uppercase",
                                color:
                                  F.muted,
                              }}
                            >
                              Read story
                            </span>

                            <span
                              style={{
                                fontSize:
                                  13,
                                color:
                                  F.ink,
                              }}
                            >
                              ↗
                            </span>

                          </div>

                        </div>

                      </article>

                    </a>

                  )
                )}

              </div>

            </div>

          )}

        {/* ====================================================
            ERROR / EMPTY
        ===================================================== */}

        {!newsLoading &&
          socialNews.length === 0 && (

            <div
              style={{
                maxWidth:
                  1280,
                margin:
                  "0 auto",
                padding:
                  "0 44px",
              }}
            >

              <div
                style={{
                  borderTop:
                    `1px solid ${F.hairline}`,
                  borderBottom:
                    `1px solid ${F.hairline}`,
                  padding:
                    "28px 0",
                  display:
                    "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "space-between",
                  gap: 20,
                  fontFamily:
                    T.ui,
                }}
              >

                <div
                  style={{
                    fontSize:
                      11,
                    color:
                      F.muted,
                  }}
                >
                  {newsError
                    ? "Unable to refresh the social feed right now."
                    : "No social-media stories available right now."}
                </div>

                <div
                  style={{
                    fontSize:
                      8.5,
                    fontWeight:
                      700,
                    letterSpacing:
                      ".1em",
                    textTransform:
                      "uppercase",
                    color:
                      F.muted,
                  }}
                >
                  Instagram · TikTok · YouTube · Meta
                </div>

              </div>

            </div>

          )}

        {/* FOOTER */}

        {!newsLoading &&
          socialNews.length > 0 && (

            <div
              style={{
                maxWidth:
                  1280,
                margin:
                  "27px auto 0",
                padding:
                  "0 44px",
                display:
                  "flex",
                justifyContent:
                  "space-between",
                gap: 20,
                fontFamily:
                  T.ui,
                fontSize:
                  8.5,
                letterSpacing:
                  ".11em",
                textTransform:
                  "uppercase",
                color:
                  F.muted,
              }}
            >

              <span>
                Instagram · TikTok · YouTube · Meta · LinkedIn
              </span>

              <span>
                Auto-refresh · 15 min
              </span>

            </div>

          )}

      </section>

      {/* ======================================================
          SCROLL INDICATOR
      ======================================================= */}

      {!reduce && (
        <motion.div
          style={{
            position:
              "absolute",
            left: "50%",
            bottom: 20,
            width: 1,
            height: 28,
            background:
              F.hairlineStrong,
            transformOrigin:
              "top",
          }}
          animate={{
            scaleY: [
              0.25,
              1,
              0.25,
            ],
            opacity: [
              0.25,
              0.8,
              0.25,
            ],
          }}
          transition={{
            duration: 2.2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
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

  const size = 440;
  const cx = size / 2;
  const cy = size / 2;

  /*
   * These are only LABELS.
   * The values must come from `health`.
   *
   * Nothing is invented here.
   */
  const definitions = [
    {
      key: "revenue",
      label: "Revenue",
      color: "#8FBBA8",
    },
    {
      key: "delivery",
      label: "Delivery",
      color: "#9DB4D9",
    },
    {
      key: "clients",
      label: "Clients",
      color: "#E4C77B",
    },
    {
      key: "team",
      label: "Team",
      color: "#D2A6C0",
    },
    {
      key: "growth",
      label: "Growth",
      color: "#E0A08F",
    },
  ];

  /*
   * ONLY keep values that actually exist.
   *
   * This means:
   * null       → hidden
   * undefined  → hidden
   * NaN        → hidden
   *
   * Zero IS kept because 0 is a real measurement.
   */
  const measured = definitions
    .map((definition) => ({
      ...definition,
      value: Number(health?.[definition.key]),
    }))
    .filter(
      (item) =>
        health?.[item.key] !== null &&
        health?.[item.key] !== undefined &&
        Number.isFinite(item.value)
    );

  /*
   * Dynamically position only the signals we actually have.
   */
  const positioned = measured.map((item, index) => {
    const angle =
      measured.length === 1
        ? -90
        : -90 + (360 / measured.length) * index;

    return {
      ...item,
      angle,
    };
  });

  const measuredCount = measured.length;

  const average =
    measuredCount > 0
      ? measured.reduce((sum, item) => sum + item.value, 0) /
        measuredCount
      : null;

  const strongest =
    measuredCount > 0
      ? [...measured].sort((a, b) => b.value - a.value)[0]
      : null;

  const weakest =
    measuredCount > 0
      ? [...measured].sort((a, b) => a.value - b.value)[0]
      : null;

  const ref = useRef(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const imgY = useTransform(
    scrollYProgress,
    [0, 1],
    reduce ? [0, 0] : [-30, 30]
  );

  return (
    <section
      ref={ref}
      style={{
        padding: "110px 44px 100px",
        position: "relative",
        overflow: "hidden",
        background: F.ink,
      }}
    >
      {/* BACKGROUND ATMOSPHERE */}

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(65% 70% at 20% 20%, rgba(49,65,95,0.45), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          right: -220,
          top: -220,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(143,187,168,0.12), transparent 68%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          position: "relative",
        }}
      >
        {/* =====================================================
            HEADER
        ===================================================== */}

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 30,
            marginBottom: 38,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: T.ui,
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: F.cream,
                opacity: 0.75,
                marginBottom: 10,
              }}
            >
              Live measurement
            </div>

            <h2
              style={{
                margin: 0,
                fontFamily: T.display,
                fontStyle: "italic",
                fontSize: "clamp(42px, 5vw, 66px)",
                fontWeight: 400,
                lineHeight: 0.95,
                letterSpacing: "-0.035em",
                color: "#FFFFFF",
              }}
            >
              Agency health.
            </h2>

            <p
              style={{
                maxWidth: 590,
                margin: "16px 0 0",
                fontFamily: T.ui,
                fontSize: 12.5,
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.48)",
              }}
            >
              A view of the signals the system can actually measure right
              now. Unavailable metrics are deliberately omitted.
            </p>
          </div>

          {/* MEASUREMENT COUNT */}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 13px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background:
                  measuredCount > 0
                    ? "#8FBBA8"
                    : "rgba(255,255,255,0.25)",
                boxShadow:
                  measuredCount > 0
                    ? "0 0 0 4px rgba(143,187,168,0.12)"
                    : "none",
              }}
            />

            <span
              style={{
                fontFamily: T.ui,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.65)",
              }}
            >
              {measuredCount} measured
            </span>
          </div>
        </div>

        {/* =====================================================
            MAIN PANEL
        ===================================================== */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              measuredCount > 0
                ? "minmax(420px, 1.1fr) minmax(320px, 0.9fr)"
                : "1fr",
            gap: 18,
          }}
        >
          {/* =================================================
              LEFT — LIVE SIGNAL MAP
          ================================================= */}

          <Reveal delay={0.08}>
            <div
              style={{
                position: "relative",
                minHeight: 500,
                borderRadius: 24,
                overflow: "hidden",

                background:
                  "linear-gradient(145deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018))",

                border:
                  "1px solid rgba(255,255,255,0.10)",

                boxShadow:
                  "0 30px 70px rgba(0,0,0,0.25)",

                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {measuredCount > 0 ? (
                <>
                  {/* AMBIENT GLOW */}

                  <div
                    style={{
                      position: "absolute",
                      width: 250,
                      height: 250,
                      left: "50%",
                      top: "50%",
                      transform:
                        "translate(-50%, -50%)",
                      borderRadius: "50%",
                      background:
                        "radial-gradient(circle, rgba(255,255,255,0.06), transparent 68%)",
                      filter: "blur(10px)",
                    }}
                  />

                  <svg
                    viewBox={`0 0 ${size} ${size}`}
                    width="100%"
                    style={{
                      maxWidth: size,
                      position: "relative",
                      overflow: "visible",
                    }}
                  >
                    {/* ORBIT */}

                    <circle
                      cx={cx}
                      cy={cy}
                      r={158}
                      fill="none"
                      stroke="rgba(255,255,255,0.10)"
                      strokeWidth={1}
                      strokeDasharray="2 7"
                    />

                    {/* CENTER */}

                    <circle
                      cx={cx}
                      cy={cy}
                      r={58}
                      fill="rgba(255,255,255,0.055)"
                      stroke="rgba(255,255,255,0.14)"
                      strokeWidth={1}
                    />

                    <text
                      x={cx}
                      y={cy - 5}
                      textAnchor="middle"
                      fontFamily={T.ui}
                      fontSize={9}
                      fontWeight={700}
                      fill="rgba(255,255,255,0.42)"
                      letterSpacing="0.12em"
                    >
                      LIVE
                    </text>

                    <text
                      x={cx}
                      y={cy + 17}
                      textAnchor="middle"
                      fontFamily={T.display}
                      fontStyle="italic"
                      fontSize={22}
                      fill="#FFFFFF"
                    >
                      {average != null
                        ? `${Math.round(average)}%`
                        : "—"}
                    </text>

                    {/* CONNECTIONS */}

                    {positioned.map((item) => {
                      const rad =
                        (item.angle * Math.PI) / 180;

                      const x =
                        cx + Math.cos(rad) * 158;

                      const y =
                        cy + Math.sin(rad) * 158;

                      const d = `
                        M ${cx} ${cy}
                        Q ${(cx + x) / 2}
                          ${(cy + y) / 2}
                          ${x} ${y}
                      `;

                      return (
                        <path
                          key={`line-${item.key}`}
                          d={d}
                          fill="none"
                          stroke={item.color}
                          strokeOpacity={0.22}
                          strokeWidth={1}
                        />
                      );
                    })}

                    {/* MEASURED SIGNALS */}

                    {positioned.map((item) => {
                      const rad =
                        (item.angle * Math.PI) / 180;

                      const x =
                        cx + Math.cos(rad) * 158;

                      const y =
                        cy + Math.sin(rad) * 158;

                      const nodeSize = 70;

                      return (
                        <g key={item.key}>
                          {/* halo */}

                          <circle
                            cx={x}
                            cy={y}
                            r={nodeSize / 2 + 8}
                            fill={item.color}
                            opacity={0.045}
                          />

                          {/* node */}

                          <circle
                            cx={x}
                            cy={y}
                            r={nodeSize / 2}
                            fill="rgba(255,255,255,0.055)"
                            stroke="rgba(255,255,255,0.20)"
                            strokeWidth={1}
                          />

                          {/* REAL VALUE ARC */}

                          <HealthOrbitArc
                            pct={item.value}
                            color={item.color}
                            cx={x}
                            cy={y}
                            r={nodeSize / 2 - 7}
                            stroke={4}
                          />

                          {/* VALUE */}

                          <foreignObject
                            x={
                              x - nodeSize / 2
                            }
                            y={
                              y - nodeSize / 2
                            }
                            width={nodeSize}
                            height={nodeSize}
                          >
                            <div
                              style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                alignItems:
                                  "center",
                                justifyContent:
                                  "center",
                                fontFamily: T.ui,
                                fontSize: 13,
                                fontWeight: 750,
                                color: "#FFFFFF",
                              }}
                            >
                              {Math.round(
                                item.value
                              )}
                              %
                            </div>
                          </foreignObject>

                          {/* LABEL */}

                          <text
                            x={x}
                            y={
                              y +
                              nodeSize / 2 +
                              22
                            }
                            textAnchor="middle"
                            fontFamily={T.ui}
                            fontSize={9}
                            fontWeight={700}
                            fill="rgba(255,255,255,0.68)"
                            letterSpacing="0.09em"
                          >
                            {item.label.toUpperCase()}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </>
              ) : (
                /* =================================================
                   EMPTY STATE
                ================================================= */

                <div
                  style={{
                    textAlign: "center",
                    maxWidth: 330,
                    padding: 30,
                  }}
                >
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      margin: "0 auto 18px",
                      borderRadius: "50%",
                      border:
                        "1px solid rgba(255,255,255,0.12)",
                      background:
                        "rgba(255,255,255,0.04)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: T.display,
                      fontStyle: "italic",
                      fontSize: 24,
                      color: "rgba(255,255,255,0.45)",
                    }}
                  >
                    —
                  </div>

                  <div
                    style={{
                      fontFamily: T.display,
                      fontStyle: "italic",
                      fontSize: 25,
                      color: "#FFFFFF",
                    }}
                  >
                    No live measurements yet.
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      fontFamily: T.ui,
                      fontSize: 11.5,
                      lineHeight: 1.6,
                      color:
                        "rgba(255,255,255,0.42)",
                    }}
                  >
                    Once the system receives measurable
                    agency data, the signals will appear
                    here automatically.
                  </div>
                </div>
              )}
            </div>
          </Reveal>

          {/* =================================================
              RIGHT — MEASURED DATA
          ================================================= */}

          {measuredCount > 0 && (
            <Reveal delay={0.15}>
              <div
                style={{
                  minHeight: 500,
                  borderRadius: 24,
                  overflow: "hidden",
                  background: "#F7F4EE",
                  border:
                    "1px solid rgba(255,255,255,0.12)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* HEADER */}

                <div
                  style={{
                    padding: "25px 25px 20px",
                    borderBottom:
                      "1px solid rgba(20,21,26,0.08)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: T.ui,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "#77736C",
                    }}
                  >
                    Measured signals
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      fontFamily: T.display,
                      fontStyle: "italic",
                      fontSize: 28,
                      lineHeight: 1,
                      color: "#15161A",
                    }}
                  >
                    What the system knows.
                  </div>
                </div>

                {/* SIGNAL LIST */}

                <div
                  style={{
                    flex: 1,
                    padding: "8px 22px",
                  }}
                >
                  {measured.map((item, index) => (
                    <div
                      key={item.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 13,
                        padding: "17px 2px",
                        borderBottom:
                          index <
                          measured.length - 1
                            ? "1px solid rgba(20,21,26,0.07)"
                            : "none",
                      }}
                    >
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background:
                            item.color,
                          boxShadow:
                            `0 0 0 5px ${item.color}18`,
                          flexShrink: 0,
                        }}
                      />

                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            fontFamily: T.ui,
                            fontSize: 11,
                            fontWeight: 650,
                            color: "#24252A",
                          }}
                        >
                          {item.label}
                        </div>

                        <div
                          style={{
                            marginTop: 5,
                            height: 4,
                            borderRadius: 999,
                            background:
                              "rgba(20,21,26,0.07)",
                            overflow: "hidden",
                          }}
                        >
                          <motion.div
                            initial={
                              reduce
                                ? false
                                : { width: 0 }
                            }
                            whileInView={{
                              width: `${Math.min(
                                Math.max(
                                  item.value,
                                  0
                                ),
                                100
                              )}%`,
                            }}
                            viewport={{
                              once: true,
                            }}
                            transition={{
                              duration: 1,
                              ease: EASE,
                            }}
                            style={{
                              height: "100%",
                              borderRadius: 999,
                              background:
                                item.color,
                            }}
                          />
                        </div>
                      </div>

                      <div
                        style={{
                          fontFamily: T.ui,
                          fontSize: 19,
                          fontWeight: 700,
                          color: "#15161A",
                          fontVariantNumeric:
                            "tabular-nums",
                        }}
                      >
                        {Math.round(
                          item.value
                        )}
                        %
                      </div>
                    </div>
                  ))}
                </div>

                {/* BOTTOM SUMMARY */}

                <div
                  style={{
                    margin: "0 22px 22px",
                    padding: "16px 17px",
                    borderRadius: 14,
                    background: "#EDE8DE",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      gap: 15,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: T.ui,
                          fontSize: 8.5,
                          fontWeight: 700,
                          textTransform:
                            "uppercase",
                          letterSpacing:
                            "0.1em",
                          color: "#858078",
                        }}
                      >
                        Highest measured
                      </div>

                      <div
                        style={{
                          marginTop: 4,
                          fontFamily: T.display,
                          fontStyle: "italic",
                          fontSize: 18,
                          color: "#17181C",
                        }}
                      >
                        {strongest.label}
                      </div>
                    </div>

                    <div
                      style={{
                        textAlign: "right",
                      }}
                    >
                      <div
                        style={{
                          fontFamily: T.ui,
                          fontSize: 8.5,
                          fontWeight: 700,
                          textTransform:
                            "uppercase",
                          letterSpacing:
                            "0.1em",
                          color: "#858078",
                        }}
                      >
                        Current reading
                      </div>

                      <div
                        style={{
                          marginTop: 4,
                          fontFamily: T.ui,
                          fontSize: 18,
                          fontWeight: 750,
                          color: "#17181C",
                        }}
                      >
                        {Math.round(
                          strongest.value
                        )}
                        %
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          )}
        </div>

        {/* =====================================================
            DATA NOTE
        ===================================================== */}

        {measuredCount > 0 && (
          <div
            style={{
              marginTop: 15,
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: T.ui,
              fontSize: 9.5,
              color:
                "rgba(255,255,255,0.30)",
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "#8FBBA8",
              }}
            />

            Showing {measuredCount} live{" "}
            {measuredCount === 1
              ? "signal"
              : "signals"}{" "}
            supplied by the system. Unavailable
            measurements are hidden.
          </div>
        )}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
 * 5 — REVENUE
 * ──────────────────────────────────────────────────────────────── */

function RevenueSection({ data = {} }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState(null);

  /*
   * ============================================================
   * REAL REVENUE DATA
   * ============================================================
   *
   * We NEVER manufacture a value here.
   * Everything comes directly from `data`.
   */

  const total =
    Number.isFinite(Number(data.total))
      ? Number(data.total)
      : null;

  const collected =
    Number.isFinite(Number(data.collected))
      ? Number(data.collected)
      : null;

  const outstanding =
    Number.isFinite(Number(data.outstanding))
      ? Number(data.outstanding)
      : null;

  const overdue =
    Number.isFinite(Number(data.overdue))
      ? Number(data.overdue)
      : null;

  const renewals =
    Number.isFinite(Number(data.renewalsDue))
      ? Number(data.renewalsDue)
      : null;

  /*
   * Collection percentage is DERIVED ONLY from real
   * collected + total values.
   *
   * If either doesn't exist, we don't show it.
   */
  const collectionPct =
    total != null &&
    total > 0 &&
    collected != null
      ? Math.min(
          100,
          Math.max(0, (collected / total) * 100)
        )
      : null;

  /*
   * ============================================================
   * NORMALISE THE TREND
   * ============================================================
   *
   * Supports:
   *
   * [{ date:"2026-08-01", value:120 }]
   *
   * [{ date:"2026-08-01", total:120 }]
   *
   * [{ date:"2026-08-01", amount:120 }]
   *
   * [[date, value]]
   *
   * [100, 120, 140]
   *
   * We only keep REAL numeric points.
   */

  const rawTrend = Array.isArray(data.trend)
    ? data.trend
    : [];

  const trend = rawTrend
    .map((point, index) => {
      if (typeof point === "number") {
        return {
          value: point,
          date: null,
          index,
        };
      }

      if (Array.isArray(point)) {
        const possibleDate = point[0];
        const possibleValue = Number(point[1]);

        if (Number.isFinite(possibleValue)) {
          return {
            value: possibleValue,
            date: possibleDate || null,
            index,
          };
        }

        return null;
      }

      if (point && typeof point === "object") {
        const possibleValue =
          point.value ??
          point.amount ??
          point.total ??
          point.revenue ??
          point.collected;

        const numericValue =
          Number(possibleValue);

        if (Number.isFinite(numericValue)) {
          return {
            value: numericValue,
            date:
              point.date ??
              point.period ??
              point.label ??
              null,
            index,
          };
        }
      }

      return null;
    })
    .filter(Boolean);

  const hasTrend = trend.length >= 2;

  /*
   * ============================================================
   * CHART HELPERS
   * ============================================================
   */

  const W = 900;
  const H = 280;

  const left = 58;
  const right = 22;
  const top = 24;
  const bottom = 42;

  const chartW = W - left - right;
  const chartH = H - top - bottom;

  const trendMax = hasTrend
    ? Math.max(
        ...trend.map((p) => p.value),
        1
      )
    : 1;

  const trendPoints = trend.map(
    (point, index) => ({
      ...point,
      x:
        left +
        (index /
          Math.max(trend.length - 1, 1)) *
          chartW,
      y:
        top +
        chartH -
        (point.value / trendMax) *
          chartH,
    })
  );

  /*
   * Smooth cubic curve.
   */
  const buildPath = (points) => {
    if (!points.length) return "";

    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y}`;
    }

    let path =
      `M ${points[0].x} ${points[0].y}`;

    for (
      let i = 0;
      i < points.length - 1;
      i++
    ) {
      const current = points[i];
      const next = points[i + 1];

      const midX =
        (current.x + next.x) / 2;

      path += `
        C
        ${midX} ${current.y},
        ${midX} ${next.y},
        ${next.x} ${next.y}
      `;
    }

    return path;
  };

  const trendPath =
    hasTrend
      ? buildPath(trendPoints)
      : "";

  const areaPath =
    hasTrend
      ? `${trendPath}
         L ${trendPoints[trendPoints.length - 1].x}
           ${top + chartH}
         L ${trendPoints[0].x}
           ${top + chartH}
         Z`
      : "";

  /*
   * Date formatter.
   */
  const formatTrendDate = (value) => {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleDateString(
      "en-IN",
      {
        day: "numeric",
        month: "short",
      }
    );
  };

  /*
   * ============================================================
   * ACTUAL CURRENT METRICS
   * ============================================================
   */

  const metrics = [
    {
      label: "Collected",
      value: collected,
      color: F.forest,
    },
    {
      label: "Outstanding",
      value: outstanding,
      color: F.navy,
    },
    {
      label: "Overdue",
      value: overdue,
      color: "#C97867",
    },
    {
      label: "Renewals",
      value: renewals,
      isCount: true,
      color: F.plum,
    },
  ].filter(
    (item) => item.value != null
  );

  /*
   * Only show the section if there is actually
   * something measurable.
   */
  const hasRevenueData =
    total != null ||
    metrics.length > 0;

  return (
    <section
      style={{
        padding: "140px 44px",
        background: F.surface,
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
        }}
      >

        {/* ======================================================
            HEADER
        ====================================================== */}

        <SectionHeader
          eyebrow="Financial"
          eyebrowColor={F.forest}
          title="Revenue."
          center={false}
          sub={
            hasRevenueData
              ? "A live view of what has been collected, what remains outstanding, and where billing stands."
              : "Revenue data will appear here once billing records are available."
          }
        />

        {/* ======================================================
            MAIN REVENUE PANEL
        ====================================================== */}

        {hasRevenueData ? (
          <Reveal delay={0.12}>
            <div
              style={{
                marginTop: 42,
                borderRadius: 26,
                overflow: "hidden",

                background: "#111216",

                border:
                  "1px solid rgba(255,255,255,0.08)",

                boxShadow:
                  "0 30px 75px rgba(20,21,26,0.13)",
              }}
            >

              {/* ==================================================
                  TOP — HERO NUMBER
              ================================================== */}

              <div
                style={{
                  padding:
                    "30px 32px 28px",

                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems: "flex-end",
                  gap: 30,
                  flexWrap: "wrap",

                  borderBottom:
                    "1px solid rgba(255,255,255,0.07)",
                }}
              >

                <div>
                  <div
                    style={{
                      fontFamily: T.ui,
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      textTransform:
                        "uppercase",
                      color:
                        "rgba(255,255,255,0.42)",
                    }}
                  >
                    Total revenue
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems:
                        "baseline",
                      gap: 10,
                      marginTop: 6,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: T.display,
                        fontStyle: "italic",
                        fontSize: 56,
                        lineHeight: 1,
                        letterSpacing:
                          "-0.035em",
                        color: "#FFFFFF",
                      }}
                    >
                      {total != null
                        ? `₹${fmtINR(total)}L`
                        : "—"}
                    </div>
                  </div>
                </div>

                {/* COLLECTION RATE */}

                {collectionPct != null && (
                  <div
                    style={{
                      minWidth: 170,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent:
                          "space-between",
                        alignItems:
                          "center",
                        marginBottom: 7,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: T.ui,
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing:
                            "0.10em",
                          textTransform:
                            "uppercase",
                          color:
                            "rgba(255,255,255,0.40)",
                        }}
                      >
                        Collected
                      </span>

                      <span
                        style={{
                          fontFamily: T.ui,
                          fontSize: 12,
                          fontWeight: 750,
                          color: "#FFFFFF",
                        }}
                      >
                        {Math.round(
                          collectionPct
                        )}
                        %
                      </span>
                    </div>

                    <div
                      style={{
                        height: 6,
                        borderRadius: 999,
                        background:
                          "rgba(255,255,255,0.10)",
                        overflow: "hidden",
                      }}
                    >
                      <motion.div
                        initial={
                          reduce
                            ? false
                            : { width: 0 }
                        }
                        whileInView={{
                          width: `${collectionPct}%`,
                        }}
                        viewport={{
                          once: true,
                        }}
                        transition={{
                          duration: 1,
                          ease: EASE,
                        }}
                        style={{
                          height: "100%",
                          borderRadius: 999,
                          background:
                            F.forest,
                          boxShadow:
                            `0 0 14px ${F.forest}66`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ==================================================
                  REAL CURRENT BREAKDOWN
              ================================================== */}

              {metrics.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(170px, 1fr))",

                    borderBottom:
                      "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  {metrics.map(
                    (metric, index) => (
                      <div
                        key={metric.label}
                        style={{
                          padding:
                            "20px 24px",

                          borderRight:
                            index <
                            metrics.length - 1
                              ? "1px solid rgba(255,255,255,0.07)"
                              : "none",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems:
                              "center",
                            gap: 7,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius:
                                "50%",
                              background:
                                metric.color,
                              boxShadow:
                                `0 0 0 4px ${metric.color}18`,
                            }}
                          />

                          <span
                            style={{
                              fontFamily:
                                T.ui,
                              fontSize: 8.5,
                              fontWeight: 700,
                              letterSpacing:
                                "0.10em",
                              textTransform:
                                "uppercase",
                              color:
                                "rgba(255,255,255,0.40)",
                            }}
                          >
                            {metric.label}
                          </span>
                        </div>

                        <div
                          style={{
                            marginTop: 8,
                            fontFamily:
                              T.ui,
                            fontSize: 21,
                            fontWeight: 700,
                            letterSpacing:
                              "-0.025em",
                            color:
                              "#FFFFFF",
                          }}
                        >
                          {metric.isCount
                            ? metric.value
                            : `₹${fmtINR(
                                metric.value
                              )}L`}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}

              {/* ==================================================
                  TREND
              ================================================== */}

              <div
                style={{
                  padding:
                    "26px 24px 22px",
                }}
              >

                {hasTrend ? (
                  <>
                    <div
                      style={{
                        display: "flex",
                        alignItems:
                          "flex-end",
                        justifyContent:
                          "space-between",
                        gap: 15,
                        marginBottom: 12,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontFamily:
                              T.ui,
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing:
                              "0.12em",
                            textTransform:
                              "uppercase",
                            color:
                              "rgba(255,255,255,0.40)",
                          }}
                        >
                          Billing trend
                        </div>

                        <div
                          style={{
                            marginTop: 4,
                            fontFamily:
                              T.display,
                            fontStyle:
                              "italic",
                            fontSize: 22,
                            color:
                              "#FFFFFF",
                          }}
                        >
                          Recorded revenue
                          over time.
                        </div>
                      </div>

                      {hover != null && (
                        <div
                          style={{
                            textAlign:
                              "right",
                          }}
                        >
                          <div
                            style={{
                              fontFamily:
                                T.ui,
                              fontSize: 9,
                              color:
                                "rgba(255,255,255,0.38)",
                            }}
                          >
                            {formatTrendDate(
                              trend[
                                hover
                              ]?.date
                            )}
                          </div>

                          <div
                            style={{
                              marginTop: 2,
                              fontFamily:
                                T.ui,
                              fontSize: 15,
                              fontWeight: 700,
                              color:
                                "#FFFFFF",
                            }}
                          >
                            ₹
                            {fmtINR(
                              trend[
                                hover
                              ]?.value
                            )}
                            L
                          </div>
                        </div>
                      )}
                    </div>

                    <svg
                      viewBox={`0 0 ${W} ${H}`}
                      width="100%"
                      height={300}
                      preserveAspectRatio="none"
                      style={{
                        display: "block",
                        overflow:
                          "visible",
                        cursor:
                          "crosshair",
                      }}
                      onMouseMove={(e) => {
                        const rect =
                          e.currentTarget.getBoundingClientRect();

                        const mouseX =
                          ((e.clientX -
                            rect.left) /
                            rect.width) *
                          W;

                        let closest = 0;
                        let distance =
                          Infinity;

                        trendPoints.forEach(
                          (point, i) => {
                            const d =
                              Math.abs(
                                point.x -
                                  mouseX
                              );

                            if (
                              d <
                              distance
                            ) {
                              distance = d;
                              closest = i;
                            }
                          }
                        );

                        setHover(
                          closest
                        );
                      }}
                      onMouseLeave={() =>
                        setHover(null)
                      }
                    >

                      <defs>
                        <linearGradient
                          id="revenue-area-gradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor={
                              F.forest
                            }
                            stopOpacity="0.30"
                          />

                          <stop
                            offset="100%"
                            stopColor={
                              F.forest
                            }
                            stopOpacity="0"
                          />
                        </linearGradient>
                      </defs>

                      {/* GRID */}

                      {[0, 0.25, 0.5, 0.75, 1].map(
                        (f) => {
                          const y =
                            top +
                            chartH -
                            f * chartH;

                          return (
                            <line
                              key={f}
                              x1={left}
                              y1={y}
                              x2={W - right}
                              y2={y}
                              stroke="rgba(255,255,255,0.07)"
                              strokeDasharray={
                                f === 0
                                  ? "0"
                                  : "3 7"
                              }
                            />
                          );
                        }
                      )}

                      {/* AREA */}

                      <motion.path
                        d={areaPath}
                        fill="url(#revenue-area-gradient)"
                        initial={
                          reduce
                            ? false
                            : {
                                opacity: 0,
                              }
                        }
                        whileInView={{
                          opacity: 1,
                        }}
                        viewport={{
                          once: true,
                        }}
                        transition={{
                          duration: 0.9,
                        }}
                      />

                      {/* LINE */}

                      <motion.path
                        d={trendPath}
                        fill="none"
                        stroke={F.forest}
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={
                          reduce
                            ? false
                            : {
                                pathLength: 0,
                              }
                        }
                        whileInView={{
                          pathLength: 1,
                        }}
                        viewport={{
                          once: true,
                        }}
                        transition={{
                          duration: 1.5,
                          ease: EASE,
                        }}
                      />

                      {/* DATA POINTS */}

                      {trendPoints.map(
                        (point, i) => (
                          <circle
                            key={i}
                            cx={point.x}
                            cy={point.y}
                            r={
                              hover === i
                                ? 6
                                : 2.5
                            }
                            fill={F.forest}
                            stroke="#111216"
                            strokeWidth={2}
                          />
                        )
                      )}

                      {/* HOVER GUIDE */}

                      {hover != null &&
                        trendPoints[
                          hover
                        ] && (
                          <>
                            <line
                              x1={
                                trendPoints[
                                  hover
                                ].x
                              }
                              y1={top}
                              x2={
                                trendPoints[
                                  hover
                                ].x
                              }
                              y2={
                                top +
                                chartH
                              }
                              stroke="rgba(255,255,255,0.20)"
                              strokeDasharray="4 6"
                            />

                            <circle
                              cx={
                                trendPoints[
                                  hover
                                ].x
                              }
                              cy={
                                trendPoints[
                                  hover
                                ].y
                              }
                              r={7}
                              fill="none"
                              stroke="#FFFFFF"
                              strokeWidth={2}
                            />
                          </>
                        )}

                      {/* X LABELS */}

                      {trend[0]?.date && (
                        <text
                          x={left}
                          y={H - 10}
                          fontFamily={T.ui}
                          fontSize={10}
                          fill="rgba(255,255,255,0.32)"
                        >
                          {formatTrendDate(
                            trend[0].date
                          )}
                        </text>
                      )}

                      {trend[
                        trend.length - 1
                      ]?.date && (
                        <text
                          x={W - right}
                          y={H - 10}
                          textAnchor="end"
                          fontFamily={T.ui}
                          fontSize={10}
                          fill="rgba(255,255,255,0.32)"
                        >
                          {formatTrendDate(
                            trend[
                              trend.length - 1
                            ].date
                          )}
                        </text>
                      )}
                    </svg>
                  </>
                ) : (
                  /*
                   * NO REAL TREND DATA
                   *
                   * Don't draw a fake graph.
                   * Instead, show the actual current
                   * billing state.
                   */
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "1fr auto",
                      alignItems:
                        "center",
                      gap: 30,
                      padding:
                        "22px 4px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily:
                            T.ui,
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing:
                            "0.12em",
                          textTransform:
                            "uppercase",
                          color:
                            "rgba(255,255,255,0.38)",
                        }}
                      >
                        Current billing state
                      </div>

                      <div
                        style={{
                          marginTop: 6,
                          fontFamily:
                            T.display,
                          fontStyle:
                            "italic",
                          fontSize: 25,
                          color:
                            "#FFFFFF",
                        }}
                      >
                        {collected !=
                          null &&
                        outstanding !=
                          null
                          ? "Collection in progress."
                          : "Billing data available."}
                      </div>

                      <div
                        style={{
                          marginTop: 7,
                          maxWidth: 520,
                          fontFamily:
                            T.ui,
                          fontSize: 11,
                          lineHeight: 1.6,
                          color:
                            "rgba(255,255,255,0.40)",
                        }}
                      >
                        A historical trend is not
                        shown because the system does
                        not currently have enough real
                        billing periods to draw one.
                      </div>
                    </div>

                    {collectionPct !=
                      null && (
                      <div
                        style={{
                          width: 92,
                          height: 92,
                          borderRadius:
                            "50%",
                          background:
                            `conic-gradient(${F.forest} ${collectionPct}%, rgba(255,255,255,0.08) ${collectionPct}% 100%)`,
                          display: "flex",
                          alignItems:
                            "center",
                          justifyContent:
                            "center",
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            width: 76,
                            height: 76,
                            borderRadius:
                              "50%",
                            background:
                              "#111216",
                            display: "flex",
                            alignItems:
                              "center",
                            justifyContent:
                              "center",
                            fontFamily:
                              T.ui,
                            fontSize: 15,
                            fontWeight: 750,
                            color:
                              "#FFFFFF",
                          }}
                        >
                          {Math.round(
                            collectionPct
                          )}
                          %
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Reveal>
        ) : (
          /* ======================================================
             TRUE EMPTY STATE
          ====================================================== */

          <Reveal delay={0.12}>
            <div
              style={{
                marginTop: 42,
                minHeight: 300,
                borderRadius: 24,
                border:
                  `1px solid ${F.hairline}`,
                background: F.paper,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  maxWidth: 360,
                  padding: 30,
                }}
              >
                <div
                  style={{
                    fontFamily: T.display,
                    fontStyle: "italic",
                    fontSize: 30,
                    color: F.ink,
                  }}
                >
                  No billing data yet.
                </div>

                <div
                  style={{
                    marginTop: 8,
                    fontFamily: T.ui,
                    fontSize: 11.5,
                    lineHeight: 1.6,
                    color: F.muted,
                  }}
                >
                  Revenue metrics will appear here once
                  billing records are available.
                </div>
              </div>
            </div>
          </Reveal>
        )}
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
 *
 * ── Front-face identity ─────────────────────────────────────────────────────
 * Uses the brand's real uploaded logo (same source the nav's brand-filter
 * pill already renders, ClientsAPI.avatarUrl) rather than a colour-coded
 * initials badge. Falls back to the initials badge when the client has no
 * logo on file, or if the image URL 404s/fails to decode.
 */
function ClientCard({ client, delay = 0 }) {
  const [flipped, setFlipped] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const reduce = useReducedMotion();

  const live = client.status === "active";
  const campaigns = client.campaigns || [];
  const logoUrl = ClientsAPI.avatarUrl(client);
  const showLogo = Boolean(logoUrl) && !logoBroken;

  const campaignCount = campaigns.length;
  const activeCount = client.activeCampaigns ?? 0;

  const toggle = () => setFlipped((f) => !f);

  const face = {
    position: "absolute",
    inset: 0,
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
    borderRadius: 20,
    border: `1px solid ${F.hairline}`,
    overflow: "hidden",
  };

  return (
    <Reveal delay={delay}>
      <div
        onClick={toggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        aria-label={`${client.name} — ${
          flipped ? "hide" : "show"
        } campaigns`}
        style={{
          perspective: 1400,
          height: 190,
          cursor: "pointer",
          outline: "none",
        }}
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={
            reduce
              ? { duration: 0 }
              : { duration: 0.6, ease: EASE }
          }
          whileHover={
            !reduce && !flipped
              ? { y: -5 }
              : undefined
          }
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            transformStyle: "preserve-3d",
          }}
        >

          {/* =====================================================
              FRONT
          ===================================================== */}
          <div
            style={{
              ...face,
              background: F.ink,
              boxShadow:
                "0 18px 45px rgba(20,21,26,0.10)",
            }}
          >

            {/* BACKGROUND IMAGE */}
            {showLogo && (
              <img
                src={logoUrl}
                alt=""
                onError={() => setLogoBroken(true)}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center",
                  opacity: 0.48,
                  filter: "grayscale(15%)",
                  transform: "scale(1.06)",
                }}
              />
            )}

            {/* IMAGE BLUR / DEPTH */}
            {showLogo && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backdropFilter: "blur(1px)",
                  WebkitBackdropFilter: "blur(1px)",
                }}
              />
            )}

            {/* CINEMATIC GRADIENT */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `
                  linear-gradient(
                    180deg,
                    rgba(15,16,20,0.08) 0%,
                    rgba(15,16,20,0.18) 30%,
                    rgba(15,16,20,0.72) 70%,
                    rgba(15,16,20,0.97) 100%
                  )
                `,
              }}
            />

            {/* TOP CONTENT */}
            <div
              style={{
                position: "relative",
                zIndex: 2,
                padding: "16px 17px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >

              {/* LOGO */}
              <motion.div
                whileHover={
                  !reduce
                    ? { scale: 1.05 }
                    : undefined
                }
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 14,
                  overflow: "hidden",
                  background: "rgba(255,255,255,0.94)",
                  border:
                    "1px solid rgba(255,255,255,0.75)",
                  boxShadow:
                    "0 8px 25px rgba(0,0,0,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {showLogo ? (
                  <img
                    src={logoUrl}
                    alt=""
                    onError={() => setLogoBroken(true)}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <span
                    style={{
                      fontFamily: T.ui,
                      fontWeight: 800,
                      fontSize: 14,
                      color: F.ink,
                    }}
                  >
                    {initials(client.name)}
                  </span>
                )}
              </motion.div>

              {/* STATUS */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: live
                    ? "rgba(255,255,255,0.90)"
                    : "rgba(20,21,26,0.55)",
                  border: live
                    ? "1px solid rgba(255,255,255,0.65)"
                    : "1px solid rgba(255,255,255,0.16)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: live
                      ? F.forest
                      : "rgba(255,255,255,0.45)",
                    boxShadow: live
                      ? `0 0 0 3px ${F.forestTint}`
                      : "none",
                  }}
                />

                <span
                  style={{
                    fontFamily: T.ui,
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: "0.09em",
                    color: live
                      ? F.forest
                      : "rgba(255,255,255,0.72)",
                  }}
                >
                  {live ? "LIVE" : "IDLE"}
                </span>
              </div>
            </div>

            {/* BOTTOM CONTENT */}
            <div
              style={{
                position: "absolute",
                zIndex: 3,
                left: 0,
                right: 0,
                bottom: 0,
                padding: "0 18px 16px",
              }}
            >

              {/* CLIENT NAME */}
              <div
                style={{
                  fontFamily: T.display,
                  fontStyle: "italic",
                  fontSize: "clamp(20px, 2vw, 25px)",
                  lineHeight: 1,
                  color: "#FFFFFF",
                  fontWeight: 500,
                  letterSpacing: "-0.02em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  textShadow:
                    "0 2px 14px rgba(0,0,0,0.45)",
                }}
              >
                {client.name}
              </div>

              {/* META ROW */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 10,
                }}
              >

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontFamily: T.ui,
                      fontSize: 10.5,
                      color: "rgba(255,255,255,0.65)",
                    }}
                  >
                    {campaignCount} campaign
                    {campaignCount === 1 ? "" : "s"}
                  </span>

                  <span
                    style={{
                      width: 3,
                      height: 3,
                      borderRadius: "50%",
                      background:
                        "rgba(255,255,255,0.35)",
                    }}
                  />

                  <span
                    style={{
                      fontFamily: T.ui,
                      fontSize: 10.5,
                      color: live
                        ? "rgba(255,255,255,0.85)"
                        : "rgba(255,255,255,0.55)",
                      fontWeight: live ? 700 : 500,
                    }}
                  >
                    {activeCount} active
                  </span>
                </div>

                {/* FLIP ICON */}
                <motion.div
                  animate={{ rotate: flipped ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    width: 27,
                    height: 27,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background:
                      "rgba(255,255,255,0.12)",
                    border:
                      "1px solid rgba(255,255,255,0.18)",
                    color: "rgba(255,255,255,0.78)",
                    fontSize: 14,
                  }}
                >
                  ↗
                </motion.div>
              </div>
            </div>
          </div>

          {/* =====================================================
              BACK
          ===================================================== */}
          <div
            style={{
              ...face,
              transform: "rotateY(180deg)",
              background: F.paper,
              boxShadow:
                "0 18px 45px rgba(20,21,26,0.08)",
              display: "flex",
              flexDirection: "column",
            }}
          >

            {/* BACK HEADER */}
            <div
              style={{
                padding: "14px 16px",
                borderBottom: `1px solid ${F.hairline}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontFamily: T.ui,
                    fontSize: 8.5,
                    fontWeight: 800,
                    color: F.muted,
                    letterSpacing: "0.13em",
                    textTransform: "uppercase",
                    marginBottom: 3,
                  }}
                >
                  Client campaigns
                </div>

                <div
                  style={{
                    fontFamily: T.display,
                    fontStyle: "italic",
                    fontSize: 17,
                    color: F.ink,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {client.name}
                </div>
              </div>

              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  border: `1px solid ${F.hairline}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: F.muted,
                  fontSize: 14,
                  flexShrink: 0,
                }}
              >
                ↗
              </div>
            </div>

            {/* CAMPAIGNS */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "7px 14px 10px",
              }}
            >
              {campaigns.length === 0 ? (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    fontFamily: T.ui,
                    color: F.muted,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 20,
                      opacity: 0.45,
                    }}
                  >
                    ○
                  </div>

                  <div
                    style={{
                      fontSize: 11,
                      fontStyle: "italic",
                    }}
                  >
                    No campaigns yet
                  </div>
                </div>
              ) : (
                campaigns.map((c, i) => (
                  <motion.div
                    key={c.id || i}
                    whileHover={{
                      x: 3,
                    }}
                    transition={{
                      duration: 0.2,
                    }}
                    style={{
                      padding: "8px 0",
                      borderBottom:
                        i < campaigns.length - 1
                          ? `1px solid ${F.hairline}`
                          : "none",
                    }}
                  >
                    {/* CAMPAIGN NAME */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: T.ui,
                          fontSize: 11,
                          fontWeight: 700,
                          color: F.ink,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {c.name}
                      </div>

                      <span
                        style={{
                          fontFamily: T.ui,
                          fontSize: 8.5,
                          fontWeight: 700,
                          color: c.live
                            ? F.forest
                            : F.muted,
                          flexShrink: 0,
                        }}
                      >
                        {c.live ? "LIVE" : c.stage}
                      </span>
                    </div>

                    {/* PROGRESS */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 7,
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          height: 4,
                          borderRadius: 10,
                          background: F.hairline,
                          overflow: "hidden",
                        }}
                      >
                        <motion.div
                          initial={
                            reduce
                              ? false
                              : { width: 0 }
                          }
                          animate={{
                            width: `${c.progress || 0}%`,
                          }}
                          transition={{
                            duration: 0.7,
                            delay: i * 0.04,
                          }}
                          style={{
                            height: "100%",
                            borderRadius: 10,
                            background: c.live
                              ? F.forest
                              : F.gold,
                          }}
                        />
                      </div>

                      <span
                        style={{
                          fontFamily: T.ui,
                          fontSize: 9,
                          fontWeight: 800,
                          color: F.inkSoft,
                          minWidth: 28,
                          textAlign: "right",
                        }}
                      >
                        {c.progress || 0}%
                      </span>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {/* BACK FOOTER */}
            <div
              style={{
                padding: "8px 14px",
                borderTop: `1px solid ${F.hairline}`,
                fontFamily: T.ui,
                fontSize: 8.5,
                color: F.muted,
                letterSpacing: "0.04em",
                display: "flex",
                justifyContent: "space-between",
                flexShrink: 0,
              }}
            >
              <span>
                {campaignCount} total
              </span>

              <span>
                Click to return ↗
              </span>
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
  const [hover, setHover] = useState(null);

  /*
   * ============================================================
   * REAL DATA ONLY
   * ============================================================
   */

  const cleanLines = lines
    .map((line) => ({
      ...line,
      data: Array.isArray(line.data)
        ? line.data
            .map((v) => Number(v))
            .filter((v) => Number.isFinite(v))
        : [],
    }))
    .filter((line) => line.data.length > 0);

  const hasData = cleanLines.length > 0;

  const hasTrend = cleanLines.some(
    (line) => line.data.length >= 2
  );

  const totalPoints = cleanLines.reduce(
    (sum, line) => sum + line.data.length,
    0
  );

  /*
   * ============================================================
   * GLOBAL SCALE
   *
   * All lines use the SAME scale.
   * This makes comparisons honest.
   * ============================================================
   */

  const allValues = cleanLines.flatMap(
    (line) => line.data
  );

  const globalMax = Math.max(
    1,
    ...allValues
  );

  const globalMin = Math.min(
    0,
    ...allValues
  );

  const globalSpan =
    globalMax - globalMin || 1;

  /*
   * ============================================================
   * HERO INSIGHTS
   * ============================================================
   */

  const latestLines = cleanLines.map(
    (line) => {
      const latest =
        line.data[line.data.length - 1];

      const previous =
        line.data.length > 1
          ? line.data[line.data.length - 2]
          : null;

      const delta =
        previous != null
          ? latest - previous
          : null;

      const pct =
        previous != null &&
        previous !== 0
          ? (delta / Math.abs(previous)) *
            100
          : null;

      return {
        ...line,
        latest,
        previous,
        delta,
        pct,
      };
    }
  );

  const strongest = [...latestLines].sort(
    (a, b) => b.latest - a.latest
  )[0];

  const rising = latestLines
    .filter((x) => x.delta != null)
    .sort((a, b) => b.delta - a.delta)[0];

  /*
   * ============================================================
   * CHART
   * ============================================================
   */

  const W = 1000;
  const H = 390;

  const left = 52;
  const right = 34;
  const top = 28;
  const bottom = 58;

  const chartW = W - left - right;
  const chartH = H - top - bottom;

  const buildPoints = (line) => {
    if (line.data.length < 2) return [];

    return line.data.map((value, i) => ({
      x:
        left +
        (i /
          Math.max(
            line.data.length - 1,
            1
          )) *
          chartW,

      y:
        top +
        chartH -
        ((value - globalMin) /
          globalSpan) *
          chartH,

      value,
    }));
  };

  const buildSmoothPath = (points) => {
    if (!points.length) return "";

    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y}`;
    }

    let path =
      `M ${points[0].x} ${points[0].y}`;

    for (
      let i = 0;
      i < points.length - 1;
      i++
    ) {
      const a = points[i];
      const b = points[i + 1];

      const mid =
        (a.x + b.x) / 2;

      path += `
        C
        ${mid} ${a.y},
        ${mid} ${b.y},
        ${b.x} ${b.y}
      `;
    }

    return path;
  };

  /*
   * ============================================================
   * HOVER
   * ============================================================
   */

  const hoverIndex =
    hover == null ? null : hover;

  return (
    <section
      style={{
        padding: "130px 44px 150px",
        background: F.cream,
        position: "relative",
        overflow: "hidden",
      }}
    >

      {/* ========================================================
          BACKGROUND DETAIL
      ======================================================== */}

      <div
        style={{
          position: "absolute",
          width: 520,
          height: 520,
          borderRadius: "50%",
          background:
            `radial-gradient(circle, ${F.forest}12 0%, transparent 70%)`,
          top: -180,
          right: -120,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          width: 420,
          height: 420,
          borderRadius: "50%",
          background:
            `radial-gradient(circle, ${F.navy}10 0%, transparent 70%)`,
          bottom: -220,
          left: -140,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          position: "relative",
        }}
      >

        {/* ======================================================
            HEADER
        ====================================================== */}

        <SectionHeader
          eyebrow="Trajectory"
          eyebrowColor={F.forest}
          title="Performance."
          center={false}
          sub={
            hasTrend
              ? "The operating curve — measured from the history actually recorded."
              : hasData
                ? "A live snapshot of the numbers currently on the books."
                : "Performance intelligence appears as operating history accumulates."
          }
        />

        {/* ======================================================
            COMMAND PANEL
        ====================================================== */}

        <Reveal delay={0.12}>
          <div
            style={{
              marginTop: 42,
              borderRadius: 28,
              overflow: "hidden",
              background: "#111216",
              border:
                "1px solid rgba(255,255,255,0.08)",
              boxShadow:
                "0 35px 90px rgba(20,21,26,0.18)",
              position: "relative",
            }}
          >

            {/* ==================================================
                TOP BAR
            ================================================== */}

            <div
              style={{
                padding:
                  "22px 28px",
                display: "flex",
                alignItems: "center",
                justifyContent:
                  "space-between",
                gap: 20,
                flexWrap: "wrap",
                borderBottom:
                  "1px solid rgba(255,255,255,0.07)",
              }}
            >

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background:
                      hasData
                        ? F.forest
                        : "rgba(255,255,255,0.25)",
                    boxShadow:
                      hasData
                        ? `0 0 14px ${F.forest}`
                        : "none",
                  }}
                />

                <span
                  style={{
                    fontFamily: T.ui,
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing:
                      "0.13em",
                    textTransform:
                      "uppercase",
                    color:
                      "rgba(255,255,255,0.48)",
                  }}
                >
                  {hasTrend
                    ? "Live performance history"
                    : hasData
                      ? "Current performance"
                      : "Awaiting measurements"}
                </span>
              </div>

              <div
                style={{
                  fontFamily: T.ui,
                  fontSize: 9,
                  color:
                    "rgba(255,255,255,0.28)",
                  letterSpacing:
                    "0.06em",
                }}
              >
                {totalPoints} DATA POINT
                {totalPoints === 1
                  ? ""
                  : "S"}
              </div>
            </div>

            {/* ==================================================
                HERO INSIGHTS
            ================================================== */}

            {hasData && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(220px, 1.4fr) repeat(2, minmax(160px, 1fr))",
                  borderBottom:
                    "1px solid rgba(255,255,255,0.07)",
                }}
              >

                {/* MAIN */}

                <div
                  style={{
                    padding:
                      "28px 30px",
                    borderRight:
                      "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: T.ui,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing:
                        "0.12em",
                      textTransform:
                        "uppercase",
                      color:
                        "rgba(255,255,255,0.36)",
                    }}
                  >
                    Latest reading
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      alignItems:
                        "baseline",
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        fontFamily:
                          T.display,
                        fontStyle:
                          "italic",
                        fontSize: 38,
                        color:
                          "#FFFFFF",
                        lineHeight: 1,
                      }}
                    >
                      {strongest?.latest ?? "—"}
                    </span>

                    <span
                      style={{
                        fontFamily: T.ui,
                        fontSize: 10,
                        fontWeight: 600,
                        color:
                          "rgba(255,255,255,0.38)",
                      }}
                    >
                      {strongest?.label}
                    </span>
                  </div>
                </div>

                {/* CHANGE */}

                <div
                  style={{
                    padding:
                      "28px 24px",
                    borderRight:
                      "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: T.ui,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing:
                        "0.12em",
                      textTransform:
                        "uppercase",
                      color:
                        "rgba(255,255,255,0.36)",
                    }}
                  >
                    Momentum
                  </div>

                  {rising?.pct != null ? (
                    <>
                      <div
                        style={{
                          marginTop: 6,
                          fontFamily:
                            T.display,
                          fontStyle:
                            "italic",
                          fontSize: 29,
                          color:
                            rising.pct >= 0
                              ? F.forest
                              : F.rust,
                        }}
                      >
                        {rising.pct >= 0
                          ? "+"
                          : ""}
                        {rising.pct.toFixed(
                          1
                        )}
                        %
                      </div>

                      <div
                        style={{
                          marginTop: 3,
                          fontFamily:
                            T.ui,
                          fontSize: 9.5,
                          color:
                            "rgba(255,255,255,0.34)",
                        }}
                      >
                        {rising.label}
                      </div>
                    </>
                  ) : (
                    <div
                      style={{
                        marginTop: 10,
                        fontFamily:
                          T.ui,
                        fontSize: 11,
                        color:
                          "rgba(255,255,255,0.32)",
                      }}
                    >
                      Need another
                      period
                    </div>
                  )}
                </div>

                {/* SERIES */}

                <div
                  style={{
                    padding:
                      "28px 24px",
                  }}
                >
                  <div
                    style={{
                      fontFamily: T.ui,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing:
                        "0.12em",
                      textTransform:
                        "uppercase",
                      color:
                        "rgba(255,255,255,0.36)",
                    }}
                  >
                    Tracked
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      fontFamily:
                        T.display,
                      fontStyle:
                        "italic",
                      fontSize: 29,
                      color:
                        "#FFFFFF",
                    }}
                  >
                    {cleanLines.length}
                  </div>

                  <div
                    style={{
                      marginTop: 3,
                      fontFamily:
                        T.ui,
                      fontSize: 9.5,
                      color:
                        "rgba(255,255,255,0.34)",
                    }}
                  >
                    metric
                    {cleanLines.length ===
                    1
                      ? ""
                      : "s"}
                  </div>
                </div>
              </div>
            )}

            {/* ==================================================
                LEGEND
            ================================================== */}

            {hasData && (
              <div
                style={{
                  padding:
                    "18px 28px 4px",
                  display: "flex",
                  gap: 18,
                  flexWrap: "wrap",
                }}
              >
                {cleanLines.map(
                  (line) => (
                    <div
                      key={line.key}
                      style={{
                        display:
                          "flex",
                        alignItems:
                          "center",
                        gap: 7,
                        fontFamily:
                          T.ui,
                        fontSize: 9.5,
                        fontWeight: 600,
                        color:
                          "rgba(255,255,255,0.52)",
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius:
                            "50%",
                          background:
                            line.color,
                          boxShadow:
                            `0 0 10px ${line.color}66`,
                        }}
                      />
                      {line.label}
                    </div>
                  )
                )}
              </div>
            )}

            {/* ==================================================
                CHART
            ================================================== */}

            {hasTrend ? (
              <div
                style={{
                  padding:
                    "8px 20px 20px",
                  position:
                    "relative",
                }}
              >

                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  width="100%"
                  height={390}
                  preserveAspectRatio="none"
                  style={{
                    display: "block",
                    overflow:
                      "visible",
                    cursor:
                      "crosshair",
                  }}

                  onMouseMove={(e) => {
                    const rect =
                      e.currentTarget.getBoundingClientRect();

                    const x =
                      ((e.clientX -
                        rect.left) /
                        rect.width) *
                      W;

                    /*
                     * Find the closest
                     * timeline index.
                     */
                    const maxLength =
                      Math.max(
                        ...cleanLines.map(
                          (l) =>
                            l.data.length
                        )
                      );

                    let closest = 0;
                    let distance =
                      Infinity;

                    for (
                      let i = 0;
                      i <
                      maxLength;
                      i++
                    ) {
                      const px =
                        left +
                        (i /
                          Math.max(
                            maxLength -
                              1,
                            1
                          )) *
                          chartW;

                      const d =
                        Math.abs(
                          px - x
                        );

                      if (
                        d < distance
                      ) {
                        distance = d;
                        closest = i;
                      }
                    }

                    setHover(
                      closest
                    );
                  }}

                  onMouseLeave={() =>
                    setHover(null)
                  }
                >

                  <defs>

                    {cleanLines.map(
                      (line) => (
                        <linearGradient
                          key={line.key}
                          id={`performance-gradient-${line.key}`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor={
                              line.color
                            }
                            stopOpacity={
                              0.28
                            }
                          />

                          <stop
                            offset="65%"
                            stopColor={
                              line.color
                            }
                            stopOpacity={
                              0.06
                            }
                          />

                          <stop
                            offset="100%"
                            stopColor={
                              line.color
                            }
                            stopOpacity={
                              0
                            }
                          />
                        </linearGradient>
                      )
                    )}

                    <filter
                      id="performance-glow"
                      x="-50%"
                      y="-50%"
                      width="200%"
                      height="200%"
                    >
                      <feGaussianBlur
                        stdDeviation="4"
                        result="blur"
                      />

                      <feMerge>
                        <feMergeNode
                          in="blur"
                        />
                        <feMergeNode
                          in="SourceGraphic"
                        />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* ==================================================
                      GRID
                  ================================================== */}

                  {[0, 0.25, 0.5, 0.75, 1].map(
                    (f) => {
                      const y =
                        top +
                        chartH -
                        f * chartH;

                      return (
                        <line
                          key={f}
                          x1={left}
                          y1={y}
                          x2={W - right}
                          y2={y}
                          stroke="rgba(255,255,255,0.065)"
                          strokeDasharray={
                            f === 0
                              ? "0"
                              : "3 8"
                          }
                        />
                      );
                    }
                  )}

                  {/* ==================================================
                      Y LABELS
                  ================================================== */}

                  {[0, 0.5, 1].map(
                    (f) => {
                      const value =
                        globalMin +
                        globalSpan * f;

                      const y =
                        top +
                        chartH -
                        f * chartH;

                      return (
                        <text
                          key={f}
                          x={0}
                          y={y + 4}
                          fontFamily={
                            T.ui
                          }
                          fontSize={9}
                          fill="rgba(255,255,255,0.24)"
                        >
                          {Math.round(
                            value
                          )}
                        </text>
                      );
                    }
                  )}

                  {/* ==================================================
                      SERIES
                  ================================================== */}

                  {cleanLines.map(
                    (line, li) => {
                      const points =
                        buildPoints(
                          line
                        );

                      if (
                        points.length <
                        2
                      ) {
                        return null;
                      }

                      const path =
                        buildSmoothPath(
                          points
                        );

                      const area =
                        `${path}
                         L ${points[points.length - 1].x} ${top + chartH}
                         L ${points[0].x} ${top + chartH}
                         Z`;

                      const latest =
                        points[
                          points.length -
                            1
                        ];

                      return (
                        <g
                          key={line.key}
                        >

                          {/* AREA */}

                          <motion.path
                            d={area}
                            fill={`url(#performance-gradient-${line.key})`}
                            initial={
                              reduce
                                ? false
                                : {
                                    opacity: 0,
                                  }
                            }
                            whileInView={{
                              opacity: 1,
                            }}
                            viewport={{
                              once: true,
                            }}
                            transition={{
                              duration: 1,
                              delay:
                                li *
                                0.1,
                            }}
                          />

                          {/* GLOW */}

                          <motion.path
                            d={path}
                            fill="none"
                            stroke={
                              line.color
                            }
                            strokeWidth={7}
                            strokeOpacity={
                              0.08
                            }
                            filter="url(#performance-glow)"
                            initial={
                              reduce
                                ? false
                                : {
                                    pathLength: 0,
                                  }
                            }
                            whileInView={{
                              pathLength: 1,
                            }}
                            viewport={{
                              once: true,
                            }}
                            transition={{
                              duration: 1.5,
                              ease: EASE,
                              delay:
                                li *
                                0.1,
                            }}
                          />

                          {/* MAIN LINE */}

                          <motion.path
                            d={path}
                            fill="none"
                            stroke={
                              line.color
                            }
                            strokeWidth={2.8}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            initial={
                              reduce
                                ? false
                                : {
                                    pathLength: 0,
                                  }
                            }
                            whileInView={{
                              pathLength: 1,
                            }}
                            viewport={{
                              once: true,
                            }}
                            transition={{
                              duration: 1.5,
                              ease: EASE,
                              delay:
                                li *
                                0.1,
                            }}
                          />

                          {/* DATA POINTS */}

                          {points.map(
                            (
                              point,
                              i
                            ) => {
                              const active =
                                hoverIndex ===
                                i;

                              return (
                                <g
                                  key={i}
                                >
                                  <circle
                                    cx={
                                      point.x
                                    }
                                    cy={
                                      point.y
                                    }
                                    r={
                                      active
                                        ? 7
                                        : 3
                                    }
                                    fill={
                                      line.color
                                    }
                                    stroke="#111216"
                                    strokeWidth={
                                      2
                                    }
                                  />

                                  {active && (
                                    <circle
                                      cx={
                                        point.x
                                      }
                                      cy={
                                        point.y
                                      }
                                      r={12}
                                      fill="none"
                                      stroke={
                                        line.color
                                      }
                                      strokeOpacity={
                                        0.35
                                      }
                                      strokeWidth={
                                        1
                                      }
                                    />
                                  )}
                                </g>
                              );
                            }
                          )}

                          {/* LAST VALUE */}

                          <g>
                            <rect
                              x={
                                Math.min(
                                  latest.x +
                                    10,
                                  W -
                                    120
                                )
                              }
                              y={
                                latest.y -
                                12
                              }
                              width={105}
                              height={24}
                              rx={12}
                              fill="#191A1F"
                              stroke={
                                line.color
                              }
                              strokeOpacity={
                                0.45
                              }
                            />

                            <text
                              x={
                                Math.min(
                                  latest.x +
                                    22,
                                  W -
                                    108
                                )
                              }
                              y={
                                latest.y +
                                4
                              }
                              fontFamily={
                                T.ui
                              }
                              fontSize={10}
                              fontWeight={700}
                              fill="#FFFFFF"
                            >
                              {line.label} ·{" "}
                              {
                                line.data[
                                  line.data
                                    .length -
                                    1
                                ]
                              }
                            </text>
                          </g>
                        </g>
                      );
                    }
                  )}

                  {/* ==================================================
                      HOVER SCAN LINE
                  ================================================== */}

                  {hoverIndex != null && (
                    <line
                      x1={
                        left +
                        (hoverIndex /
                          Math.max(
                            ...cleanLines.map(
                              (l) =>
                                l.data
                                  .length
                            )
                          ) -
                          1) *
                          chartW
                      }
                      x2={
                        left +
                        (hoverIndex /
                          Math.max(
                            ...cleanLines.map(
                              (l) =>
                                l.data
                                  .length
                            )
                          ) -
                          1) *
                          chartW
                      }
                      y1={top}
                      y2={
                        top + chartH
                      }
                      stroke="rgba(255,255,255,0.25)"
                      strokeDasharray="4 7"
                    />
                  )}

                  {/* ==================================================
                      BOTTOM AXIS
                  ================================================== */}

                  <line
                    x1={left}
                    y1={
                      top + chartH
                    }
                    x2={W - right}
                    y2={
                      top + chartH
                    }
                    stroke="rgba(255,255,255,0.14)"
                  />
                </svg>

                {/* ==================================================
                    HOVER DETAIL
                ================================================== */}

                {hoverIndex != null && (
                  <div
                    style={{
                      display: "flex",
                      gap: 18,
                      flexWrap: "wrap",
                      padding:
                        "10px 14px",
                      margin:
                        "0 30px 4px",
                      borderRadius: 12,
                      background:
                        "rgba(255,255,255,0.045)",
                      border:
                        "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    {cleanLines.map(
                      (line) => {
                        const value =
                          line.data[
                            hoverIndex
                          ];

                        if (
                          value ==
                          null
                        )
                          return null;

                        return (
                          <div
                            key={
                              line.key
                            }
                            style={{
                              display:
                                "flex",
                              alignItems:
                                "center",
                              gap: 7,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius:
                                  "50%",
                                background:
                                  line.color,
                              }}
                            />

                            <span
                              style={{
                                fontFamily:
                                  T.ui,
                                fontSize: 9,
                                color:
                                  "rgba(255,255,255,0.38)",
                              }}
                            >
                              {line.label}
                            </span>

                            <span
                              style={{
                                fontFamily:
                                  T.ui,
                                fontSize: 11,
                                fontWeight: 700,
                                color:
                                  "#FFFFFF",
                              }}
                            >
                              {value}
                            </span>
                          </div>
                        );
                      }
                    )}
                  </div>
                )}
              </div>
            ) : hasData ? (

              /* ==================================================
                 ONE DATA POINT STATE
              ================================================== */

              <div
                style={{
                  padding:
                    "40px 32px 46px",
                }}
              >

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(190px, 1fr))",
                    gap: 14,
                  }}
                >
                  {latestLines.map(
                    (line, i) => {
                      const pct =
                        line.latest /
                        globalMax;

                      return (
                        <motion.div
                          key={line.key}
                          whileHover={{
                            y: -3,
                          }}
                          style={{
                            padding:
                              "20px",
                            borderRadius:
                              18,
                            background:
                              "rgba(255,255,255,0.035)",
                            border:
                              "1px solid rgba(255,255,255,0.08)",
                          }}
                        >

                          <div
                            style={{
                              display:
                                "flex",
                              alignItems:
                                "center",
                              justifyContent:
                                "space-between",
                            }}
                          >
                            <span
                              style={{
                                fontFamily:
                                  T.ui,
                                fontSize: 9,
                                fontWeight:
                                  700,
                                letterSpacing:
                                  "0.1em",
                                textTransform:
                                  "uppercase",
                                color:
                                  "rgba(255,255,255,0.40)",
                              }}
                            >
                              {
                                line.label
                              }
                            </span>

                            <span
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius:
                                  "50%",
                                background:
                                  line.color,
                              }}
                            />
                          </div>

                          <div
                            style={{
                              marginTop: 15,
                              fontFamily:
                                T.display,
                              fontStyle:
                                "italic",
                              fontSize: 32,
                              color:
                                "#FFFFFF",
                            }}
                          >
                            {
                              line.latest
                            }
                          </div>

                          <div
                            style={{
                              marginTop: 14,
                              height: 4,
                              borderRadius:
                                999,
                              background:
                                "rgba(255,255,255,0.08)",
                              overflow:
                                "hidden",
                            }}
                          >
                            <motion.div
                              initial={
                                reduce
                                  ? false
                                  : {
                                      width: 0,
                                    }
                              }
                              whileInView={{
                                width: `${Math.max(
                                  4,
                                  pct *
                                    100
                                )}%`,
                              }}
                              viewport={{
                                once: true,
                              }}
                              transition={{
                                duration: 1,
                                delay:
                                  i *
                                  0.08,
                                ease: EASE,
                              }}
                              style={{
                                height:
                                  "100%",
                                borderRadius:
                                  999,
                                background:
                                  line.color,
                                boxShadow:
                                  `0 0 12px ${line.color}66`,
                              }}
                            />
                          </div>

                          <div
                            style={{
                              marginTop: 8,
                              fontFamily:
                                T.ui,
                              fontSize: 9,
                              color:
                                "rgba(255,255,255,0.28)",
                            }}
                          >
                            First recorded
                            reading
                          </div>
                        </motion.div>
                      );
                    }
                  )}
                </div>

                <div
                  style={{
                    marginTop: 22,
                    padding:
                      "13px 16px",
                    borderRadius: 12,
                    background:
                      "rgba(255,255,255,0.025)",
                    border:
                      "1px dashed rgba(255,255,255,0.10)",
                    fontFamily: T.ui,
                    fontSize: 10.5,
                    color:
                      "rgba(255,255,255,0.34)",
                    lineHeight: 1.5,
                  }}
                >
                  Historical movement will appear
                  after a second measurement period.
                  Nothing is being estimated here.
                </div>
              </div>

            ) : (

              /* ==================================================
                 TRUE EMPTY STATE
              ================================================== */

              <div
                style={{
                  minHeight: 330,
                  display: "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  textAlign:
                    "center",
                  padding: 40,
                }}
              >
                <div
                  style={{
                    maxWidth: 390,
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      margin:
                        "0 auto 18px",
                      borderRadius:
                        18,
                      border:
                        "1px solid rgba(255,255,255,0.10)",
                      background:
                        "rgba(255,255,255,0.035)",
                      display:
                        "flex",
                      alignItems:
                        "center",
                      justifyContent:
                        "center",
                      fontFamily:
                        T.ui,
                      fontSize: 18,
                      color:
                        "rgba(255,255,255,0.32)",
                    }}
                  >
                    ↗
                  </div>

                  <div
                    style={{
                      fontFamily:
                        T.display,
                      fontStyle:
                        "italic",
                      fontSize: 28,
                      color:
                        "#FFFFFF",
                    }}
                  >
                    The curve hasn't
                    started yet.
                  </div>

                  <div
                    style={{
                      marginTop: 9,
                      fontFamily:
                        T.ui,
                      fontSize: 11,
                      lineHeight: 1.6,
                      color:
                        "rgba(255,255,255,0.34)",
                    }}
                  >
                    Performance will appear here
                    when actual billing or delivery
                    measurements are recorded.
                  </div>
                </div>
              </div>
            )}

            {/* ==================================================
                FOOTER
            ================================================== */}

            {hasData && (
              <div
                style={{
                  padding:
                    "13px 28px",
                  borderTop:
                    "1px solid rgba(255,255,255,0.07)",
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "center",
                  gap: 15,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontFamily: T.ui,
                    fontSize: 8.5,
                    letterSpacing:
                      "0.10em",
                    textTransform:
                      "uppercase",
                    color:
                      "rgba(255,255,255,0.25)",
                  }}
                >
                  Actual recorded values
                </span>

                <span
                  style={{
                    fontFamily: T.ui,
                    fontSize: 8.5,
                    color:
                      "rgba(255,255,255,0.25)",
                  }}
                >
                  {hasTrend
                    ? "Historical comparison enabled"
                    : "Historical comparison pending"}
                </span>
              </div>
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
  const [hover, setHover] = useState(null);

  const points = growth?.points || [];
  const W = 1000;
  const H = 360;
  const left = 68;
  const right = 24;
  const top = 28;
  const bottom = 46;

  const chartW = W - left - right;
  const chartH = H - top - bottom;

  const series = points.map((p) => Number(p[metric] || 0));
  const has = series.length >= 2;

  const latest = series[series.length - 1] ?? 0;
  const first = series[0] ?? 0;
  const gained = latest - first;

  const peak = series.length ? Math.max(...series) : 0;
  const color = metric === "views" ? F.navy : F.plum;

  const growthPct =
    first > 0
      ? ((gained / first) * 100)
      : 0;

  const label = (d) => {
    const [, m, day] = String(d).split("-");
    const MONTHS = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    return `${MONTHS[Number(m) - 1]} ${Number(day)}`;
  };

  const fmtAxis = (value) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return Math.round(value);
  };

  /*
   * Keep the baseline at zero.
   * This is important because the graph represents cumulative
   * campaign performance.
   */
  const max = has
    ? Math.max(...series, 1)
    : 1;

  /*
   * Convert real data into SVG coordinates.
   */
  const pts = series.map((value, i) => ({
    x:
      left +
      (i / Math.max(series.length - 1, 1)) * chartW,

    y:
      top +
      chartH -
      (value / max) * chartH,

    value,
    date: points[i]?.date,
  }));

  /*
   * Create a smooth cubic Bézier curve instead of
   * connecting the points with straight lines.
   */
  const buildSmoothPath = (data) => {
    if (!data.length) return "";

    if (data.length === 1) {
      return `M ${data[0].x} ${data[0].y}`;
    }

    let d = `M ${data[0].x} ${data[0].y}`;

    for (let i = 0; i < data.length - 1; i++) {
      const current = data[i];
      const next = data[i + 1];

      const midX = (current.x + next.x) / 2;

      d += `
        C
        ${midX} ${current.y},
        ${midX} ${next.y},
        ${next.x} ${next.y}
      `;
    }

    return d;
  };

  const path = buildSmoothPath(pts);

  const area = has
    ? `${path}
       L ${pts[pts.length - 1].x} ${top + chartH}
       L ${pts[0].x} ${top + chartH}
       Z`
    : "";

  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  const handleMove = (e) => {
    if (!has) return;

    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();

    const mouseX =
      ((e.clientX - rect.left) / rect.width) * W;

    let closest = 0;
    let distance = Infinity;

    pts.forEach((p, i) => {
      const d = Math.abs(p.x - mouseX);

      if (d < distance) {
        distance = d;
        closest = i;
      }
    });

    setHover(closest);
  };

  const hoverPoint =
    hover !== null ? pts[hover] : null;

  return (
    <section
      style={{
        padding: "150px 44px",
        background: F.surface,
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
        }}
      >
        <SectionHeader
          eyebrow="Audience intelligence"
          eyebrowColor={F.plum}
          title="What the work did once it was live."
          center={false}
          sub={
            has
              ? `Live performance tracked across ${growth.creators} creator ${
                  growth.creators === 1 ? "post" : "posts"
                } and ${growth.campaigns} ${
                  growth.campaigns === 1 ? "campaign" : "campaigns"
                }.`
              : "This curve fills in as live posts are refreshed."
          }
        />

        <Reveal delay={0.18}>
          <div
            style={{
              marginTop: 42,
              borderRadius: 28,
              overflow: "hidden",
              background: "#111216",
              boxShadow:
                "0 30px 80px rgba(20,21,26,0.14)",
              border:
                "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {/* ───────── TOP INFORMATION ───────── */}

            <div
              style={{
                padding: "30px 32px 26px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                gap: 24,
                flexWrap: "wrap",
                borderBottom:
                  "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: T.ui,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.42)",
                  }}
                >
                  Live performance
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 12,
                    marginTop: 7,
                  }}
                >
                  <div
                    style={{
                      fontFamily: T.display,
                      fontStyle: "italic",
                      fontSize: 52,
                      lineHeight: 1,
                      letterSpacing: "-0.03em",
                      color: "#FFFFFF",
                    }}
                  >
                    {has ? fmtCompact(latest) : "—"}
                  </div>

                  {has && gained > 0 && (
                    <span
                      style={{
                        fontFamily: T.ui,
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#9FD6B5",
                      }}
                    >
                      +{growthPct.toFixed(1)}%
                    </span>
                  )}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    fontFamily: T.ui,
                    fontSize: 11,
                    color: "rgba(255,255,255,0.45)",
                  }}
                >
                  cumulative {metric}
                </div>
              </div>

              {/* METRIC SWITCHER */}

              <div
                style={{
                  display: "flex",
                  gap: 4,
                  padding: 4,
                  borderRadius: 999,
                  background:
                    "rgba(255,255,255,0.07)",
                  border:
                    "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {[
                  ["views", "Views"],
                  ["engagements", "Engagements"],
                ].map(([id, text]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setMetric(id);
                      setHover(null);
                    }}
                    style={{
                      border: "none",
                      cursor: "pointer",
                      borderRadius: 999,
                      padding: "8px 15px",
                      fontFamily: T.ui,
                      fontSize: 11,
                      fontWeight: 600,
                      background:
                        metric === id
                          ? "#FFFFFF"
                          : "transparent",
                      color:
                        metric === id
                          ? "#111216"
                          : "rgba(255,255,255,0.48)",
                      transition:
                        "all 0.25s ease",
                    }}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>

            {/* ───────── MINI STATS ───────── */}

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(3, 1fr)",
                borderBottom:
                  "1px solid rgba(255,255,255,0.07)",
              }}
            >
              {[
                [
                  "Growth",
                  has ? `+${fmtCompact(gained)}` : "—",
                ],
                [
                  "Peak",
                  has ? fmtCompact(peak) : "—",
                ],
                [
                  "Readings",
                  has ? points.length : "—",
                ],
              ].map(([labelText, value], i) => (
                <div
                  key={labelText}
                  style={{
                    padding: "18px 26px",
                    borderRight:
                      i < 2
                        ? "1px solid rgba(255,255,255,0.07)"
                        : "none",
                  }}
                >
                  <div
                    style={{
                      fontFamily: T.ui,
                      fontSize: 9.5,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      color:
                        "rgba(255,255,255,0.34)",
                    }}
                  >
                    {labelText}
                  </div>

                  <div
                    style={{
                      marginTop: 5,
                      fontFamily: T.ui,
                      fontSize: 15,
                      fontWeight: 600,
                      color: "#FFFFFF",
                    }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {/* ───────── CHART ───────── */}

            <div
              style={{
                position: "relative",
                padding: "28px 22px 20px",
              }}
            >
              <svg
                viewBox={`0 0 ${W} ${H}`}
                width="100%"
                height="360"
                preserveAspectRatio="none"
                style={{
                  display: "block",
                  overflow: "visible",
                  cursor: has
                    ? "crosshair"
                    : "default",
                }}
                onMouseMove={handleMove}
                onMouseLeave={() => setHover(null)}
              >
                <defs>
                  <linearGradient
                    id={`growth-area-${metric}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={color}
                      stopOpacity="0.32"
                    />

                    <stop
                      offset="75%"
                      stopColor={color}
                      stopOpacity="0.06"
                    />

                    <stop
                      offset="100%"
                      stopColor={color}
                      stopOpacity="0"
                    />
                  </linearGradient>

                  <filter
                    id={`glow-${metric}`}
                    x="-50%"
                    y="-50%"
                    width="200%"
                    height="200%"
                  >
                    <feGaussianBlur
                      stdDeviation="5"
                      result="blur"
                    />

                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* Y AXIS */}

                {yTicks.map((f) => {
                  const y =
                    top + chartH - f * chartH;

                  const value = max * f;

                  return (
                    <g key={f}>
                      <line
                        x1={left}
                        y1={y}
                        x2={W - right}
                        y2={y}
                        stroke="rgba(255,255,255,0.075)"
                        strokeDasharray={
                          f === 0
                            ? "0"
                            : "3 7"
                        }
                      />

                      <text
                        x={left - 14}
                        y={y + 4}
                        textAnchor="end"
                        fontFamily={T.ui}
                        fontSize="10"
                        fill="rgba(255,255,255,0.30)"
                      >
                        {fmtAxis(value)}
                      </text>
                    </g>
                  );
                })}

                {has ? (
                  <g>
                    {/* AREA */}

                    <motion.path
                      key={`area-${metric}`}
                      d={area}
                      fill={`url(#growth-area-${metric})`}
                      initial={
                        reduce
                          ? false
                          : { opacity: 0 }
                      }
                      whileInView={{ opacity: 1 }}
                      viewport={{
                        once: true,
                        amount: 0.35,
                      }}
                      transition={{
                        duration: 1,
                      }}
                    />

                    {/* CURVE */}

                    <motion.path
                      key={`line-${metric}`}
                      d={path}
                      fill="none"
                      stroke={color}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={
                        reduce
                          ? false
                          : { pathLength: 0 }
                      }
                      whileInView={{
                        pathLength: 1,
                      }}
                      viewport={{
                        once: true,
                        amount: 0.35,
                      }}
                      transition={{
                        duration: 1.7,
                        ease: EASE,
                      }}
                    />

                    {/* DATA POINTS */}

                    {pts.map((p, i) => (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={
                          hover === i
                            ? 6
                            : 2.5
                        }
                        fill={color}
                        stroke="#111216"
                        strokeWidth="2"
                        style={{
                          transition:
                            "r 0.15s ease",
                        }}
                      />
                    ))}

                    {/* HOVER */}

                    {hoverPoint && (
                      <g
                        pointerEvents="none"
                      >
                        <line
                          x1={hoverPoint.x}
                          y1={top}
                          x2={hoverPoint.x}
                          y2={top + chartH}
                          stroke="rgba(255,255,255,0.20)"
                          strokeDasharray="4 6"
                        />

                        <circle
                          cx={hoverPoint.x}
                          cy={hoverPoint.y}
                          r="8"
                          fill={color}
                          opacity="0.20"
                          filter={`url(#glow-${metric})`}
                        />

                        <circle
                          cx={hoverPoint.x}
                          cy={hoverPoint.y}
                          r="5"
                          fill={color}
                          stroke="#FFFFFF"
                          strokeWidth="2"
                        />

                        <g
                          transform={`
                            translate(
                              ${Math.min(
                                Math.max(
                                  hoverPoint.x - 65,
                                  left
                                ),
                                W - right - 130
                              )},
                              ${Math.max(
                                hoverPoint.y - 72,
                                8
                              )}
                            )
                          `}
                        >
                          <rect
                            width="130"
                            height="58"
                            rx="10"
                            fill="#FFFFFF"
                          />

                          <text
                            x="12"
                            y="20"
                            fontFamily={T.ui}
                            fontSize="9"
                            fill="#777"
                          >
                            {label(
                              hoverPoint.date
                            )}
                          </text>

                          <text
                            x="12"
                            y="42"
                            fontFamily={T.ui}
                            fontSize="15"
                            fontWeight="700"
                            fill="#111216"
                          >
                            {fmtCompact(
                              hoverPoint.value
                            )}
                          </text>
                        </g>
                      </g>
                    )}
                  </g>
                ) : (
                  <text
                    x={W / 2}
                    y={H / 2}
                    textAnchor="middle"
                    fontFamily={T.ui}
                    fontSize="12"
                    fill="rgba(255,255,255,0.35)"
                  >
                    Live-post growth appears here after
                    posts have been refreshed twice
                  </text>
                )}

                {/* X AXIS */}

                {has && (
                  <>
                    <text
                      x={left}
                      y={H - 12}
                      fontFamily={T.ui}
                      fontSize="10"
                      fill="rgba(255,255,255,0.30)"
                    >
                      {label(points[0].date)}
                    </text>

                    <text
                      x={W - right}
                      y={H - 12}
                      textAnchor="end"
                      fontFamily={T.ui}
                      fontSize="10"
                      fill="rgba(255,255,255,0.30)"
                    >
                      {label(
                        points[points.length - 1]
                          .date
                      )}
                    </text>
                  </>
                )}
              </svg>
            </div>

            {/* ───────── FOOTER ───────── */}

            <div
              style={{
                padding:
                  "15px 28px 18px",
                borderTop:
                  "1px solid rgba(255,255,255,0.07)",
                display: "flex",
                justifyContent:
                  "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontFamily: T.ui,
                  fontSize: 10,
                  color:
                    "rgba(255,255,255,0.35)",
                }}
              >
                LIVE POST METRICS
              </span>

              <span
                style={{
                  fontFamily: T.ui,
                  fontSize: 10,
                  color:
                    "rgba(255,255,255,0.35)",
                }}
              >
                {has
                  ? `${points.length} metric refreshes recorded`
                  : "Awaiting metric refresh"}
              </span>
            </div>
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
      const summary = buildSummary(
        {
          campaigns: forBrand(campaigns),
          clients: brandFilter
            ? clients.filter(c => (c.id || c._id) === brandFilter)
            : clients,
          invoices: forBrand(invoices),
          quotes: forBrand(quotes),
          users,
          creators,
          clientRequests,
          creatorRequests,
        },
        F,
      );

      const rawClients = brandFilter
        ? clients.filter(c => (c.id || c._id) === brandFilter)
        : clients;

      const clientById = new Map(
        rawClients.map((c) => [String(c.id || c._id), c])
      );

      const clientNamesWithAvatars = (summary.clients?.names || []).map((client) => {
        const raw = clientById.get(String(client.id || client._id));

        return {
          ...client,

          // Preserve the avatar fields that ClientsAPI.avatarUrl()
          // needs to build the actual image URL.
          hasAvatar: raw?.hasAvatar ?? client.hasAvatar ?? false,
          avatarUpdatedAt:
            raw?.avatarUpdatedAt ?? client.avatarUpdatedAt ?? null,
        };
      });

      setData({
        ...summary,
        clients: {
          ...summary.clients,
          names: clientNamesWithAvatars,
        },
      });
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
     <Hero
  asOfLabel={asOfLabel}

/>
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