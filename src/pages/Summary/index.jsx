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
 */

import { useEffect, useMemo, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import { motion, useReducedMotion, animate, useScroll, useTransform } from "motion/react";

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

const PHOTOS = {
  hero: ("https://images.openai.com/static-rsc-4/ADpR5ytzcVB2dT4mXMIA11nr7R3X5gBPKhtjgPSo_PE7qIp2SJKZ4Gpdm7uQXUnmzW0n2udCFaqaMUj6-fp_YFXSksf5vmzFPwULxSsRvYkWNIyDVfjeELf20MQkYHKEG06Q8MxLTNX-IVoqCbAza0dS1QN_JJrAIL0SITtvV12AIwpiqi1YPqadBbd0A_wq?purpose=fullsize"),
  studio: IMG("photo-1590602847861-f357a9332bbc"), // podcast / studio mic
  city: ("https://images.openai.com/static-rsc-4/nPbOO1_cHu9-rbY2L_hOyMnxZsUsMAFK9OmfxsQBAhhJVCcfBu_sR4NxCQnBkl59asGVZpRQJjzcWNsJt4-qOesayZVqy_BjvY-VqVme-UjvIX55ALma8c2hyqmgEwha9B4qgydK-aKroJc-cbqCwu5_BTGyD6Q0hpInuu0rRrdZ_2m6Rwkjw9Q5IYCa2HFu?purpose=fullsize"), // phone + social feed on the go
  desk: IMG("photo-1552664730-d307ca884978"), // content planning desk
  close: IMG("photo-1516035069371-29a1b244cc32"), // camera / photoshoot
  health: IMG("photo-1533750349088-cd871a92f312"), // creator filming setup, for Agency Health bg
  team: IMG("photo-1522202176988-66273c2fd55f"), // creative team working together
  footer: IMG("photo-1493421419110-74f4e85ba126"), // dim editorial workspace, for footer bg
};

const MOSAIC = [
  { src: IMG("photo-1587614382346-4ec70e388b28", 700), caption: "Reels in production" },
  { src: IMG("photo-1607083206869-4c7672e72a8a", 700), caption: "Unboxing shoots" },
  { src: IMG("photo-1590602847861-f357a9332bbc", 700), caption: "Podcast collabs" },
  { src: IMG("photo-1551288049-bebda4e38f71", 700), caption: "Performance reviews" },
];

function avatarUrl(seed, size = 128) {
  return `https://i.pravatar.cc/${size}?img=${seed}`;
}

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

/* ────────────────────────────────────────────────────────────────
 * SAMPLE / DEMO CONTENT — landing-page fallback, field-by-field
 * ──────────────────────────────────────────────────────────────── */

const DEMO = {
  bigNumbers: { campaigns: 128, clients: 34, team: 82, aeo: 46 },
  health: { revenue: 78, delivery: 84, clients: 72, team: 80, growth: 65 },
  revenue: {
    total: 8600000,
    deltaPct: 18,
    trend: [58, 62, 60, 67, 71, 69, 78, 82, 86],
    collected: 6100000,
    outstanding: 1800000,
    overdue: 700000,
    renewalsDue: 5,
  },
  campaigns: {
    stages: [
      { key: "draft", label: "Draft", count: 6, note: "Concepts not yet briefed" },
      { key: "brief", label: "Brief", count: 9, note: "Awaiting client sign-off" },
      { key: "po", label: "PO", count: 14, note: "Purchase orders in motion" },
      { key: "advance", label: "Advance", count: 11, note: "Creator advances processing" },
      { key: "execution", label: "Execution", count: 22, note: "Campaigns currently live" },
      { key: "reporting", label: "Reporting", count: 8, note: "Wrapping and reporting out" },
      { key: "completed", label: "Completed", count: 58, note: "Delivered this period" },
    ],
  },
  clients: {
    total: 34, healthy: 24, atRisk: 7, critical: 3,
    names: [
      { id: "c1", name: "Meraki Skin", status: "healthy" },
      { id: "c2", name: "Voltage Audio", status: "healthy" },
      { id: "c3", name: "Terra Foods", status: "atRisk" },
      { id: "c4", name: "Bloom Beauty", status: "healthy" },
      { id: "c5", name: "Northstar Wearables", status: "critical" },
      { id: "c6", name: "Kindle & Co", status: "healthy" },
      { id: "c7", name: "Fizz Beverages", status: "atRisk" },
      { id: "c8", name: "Wanderlux Travel", status: "healthy" },
      { id: "c9", name: "Pulse Fitness", status: "healthy" },
      { id: "c10", name: "Stitch & Sole", status: "critical" },
    ],
  },
  team: {
    members: [
      { id: "t1", name: "Aisha", utilizationPct: 88, activeProjects: 5, avatar: 12 },
      { id: "t2", name: "Rohan", utilizationPct: 64, activeProjects: 3, avatar: 33 },
      { id: "t3", name: "Meera", utilizationPct: 92, activeProjects: 6, avatar: 45 },
      { id: "t4", name: "Kabir", utilizationPct: 51, activeProjects: 2, avatar: 5 },
      { id: "t5", name: "Sana", utilizationPct: 76, activeProjects: 4, avatar: 29 },
      { id: "t6", name: "Devika", utilizationPct: 34, activeProjects: 1, avatar: 47 },
      { id: "t7", name: "Arjun", utilizationPct: 81, activeProjects: 5, avatar: 15 },
      { id: "t8", name: "Priya", utilizationPct: 69, activeProjects: 3, avatar: 23 },
    ],
    avgUtilizationPct: 69,
  },
  risks: { billing: 0.35, client: 0.52, campaign: 0.22, team: 0.6, aeo: 0.3 },
  decisions: [
    { id: "d1", title: "Approve Q3 retainer renewal for Bloom Beauty", impactLabel: "₹14L annual value", deadline: "14 Aug", tag: "Bloom Beauty" },
    { id: "d2", title: "Sign off on the creator roster for the Voltage Audio launch", impactLabel: "12 creators", deadline: "18 Aug", tag: "Voltage Audio" },
    { id: "d3", title: "Resolve the overdue invoice with Northstar Wearables", impactLabel: "₹7L overdue", deadline: "20 Aug", tag: "Northstar" },
    { id: "d4", title: "Greenlight the festive campaign concept for Fizz Beverages", impactLabel: "Festive campaign", deadline: "25 Aug", tag: "Fizz" },
  ],
  performance: {
    lines: [
      { key: "revenue", label: "Revenue", color: F.forest, data: [52, 55, 58, 60, 65, 70, 74, 78] },
      { key: "delivery", label: "Delivery", color: F.navy, data: [60, 62, 65, 68, 70, 73, 79, 84] },
      { key: "clientHealth", label: "Client Health", color: F.gold, data: [58, 60, 63, 65, 68, 70, 71, 72] },
      { key: "retention", label: "Retention", color: F.plum, data: [70, 71, 73, 74, 76, 77, 79, 81] },
    ],
  },
};

function mergeObj(demoObj, partialObj) {
  const out = { ...demoObj };
  if (!partialObj) return out;
  for (const k of Object.keys(demoObj)) {
    const pv = partialObj[k];
    if (Array.isArray(demoObj[k])) {
      out[k] = Array.isArray(pv) && pv.length > 0 ? pv : demoObj[k];
    } else if (pv !== null && pv !== undefined) {
      out[k] = pv;
    }
  }
  return out;
}

function mergeData(partial) {
  const p = partial || {};
  return {
    asOf: p.asOf ?? null,
    bigNumbers: mergeObj(DEMO.bigNumbers, p.bigNumbers),
    health: mergeObj(DEMO.health, p.health),
    revenue: mergeObj(DEMO.revenue, p.revenue),
    campaigns: {
      stages: Array.isArray(p.campaigns?.stages) && p.campaigns.stages.length > 0
        ? p.campaigns.stages
        : DEMO.campaigns.stages,
    },
    clients: mergeObj(DEMO.clients, p.clients),
    team: mergeObj(DEMO.team, p.team),
    risks: mergeObj(DEMO.risks, p.risks),
    decisions: Array.isArray(p.decisions) && p.decisions.length > 0 ? p.decisions : DEMO.decisions,
    performance: {
      lines: Array.isArray(p.performance?.lines) && p.performance.lines.length > 0
        ? p.performance.lines
        : DEMO.performance.lines,
    },
  };
}

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

function PhotoInterlude({ src, kicker, headline, height = 520, dark = true }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [-40, 40]);

  return (
    <section ref={ref} style={{ position: "relative", height, overflow: "hidden", background: F.ink }}>
      <motion.div
        style={{ position: "absolute", inset: -40, y }}
        animate={reduce ? undefined : { scale: [1, 1.08] }}
        transition={{ duration: 22, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
      >
        <img
          src={src} alt="" loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover", filter: dark ? "grayscale(0.15) brightness(0.72)" : "grayscale(0.1)" }}
        />
      </motion.div>
      <div style={{
        position: "absolute", inset: 0,
        background: dark
          ? "linear-gradient(180deg, rgba(20,21,26,0.15) 0%, rgba(20,21,26,0.55) 100%)"
          : "linear-gradient(180deg, rgba(250,250,249,0.1) 0%, rgba(250,250,249,0.6) 100%)",
      }} />
      <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", padding: "0 44px" }}>
        <Reveal>
          <div style={{ fontFamily: T.ui, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.2em", color: dark ? "#F1ECE1" : F.navy, opacity: 0.8, marginBottom: 18 }}>
            {kicker}
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <h3 style={{
            fontFamily: T.display, fontStyle: "italic", fontWeight: 500,
            fontSize: "clamp(28px, 4vw, 48px)", color: dark ? "#FFFFFF" : F.ink,
            margin: 0, maxWidth: 720, lineHeight: 1.25,
          }}>
            {headline}
          </h3>
        </Reveal>
      </div>
    </section>
  );
}

function ContentMosaic() {
  return (
    <section style={{ padding: "0 44px 120px", background: F.surface }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 34 }}>
            <span style={{ fontFamily: T.ui, fontSize: 10.5, fontWeight: 600, color: F.muted, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              What the work looks like
            </span>
          </div>
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
          {MOSAIC.map((it, i) => (
            <Reveal key={it.caption} delay={i * 0.06}>
              <motion.div
                whileHover={{ scale: 1.03 }}
                transition={{ duration: 0.35, ease: EASE }}
                style={{ position: "relative", borderRadius: 14, overflow: "hidden", aspectRatio: "1 / 1", background: F.hairline }}
              >
                <img src={it.src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 55%, rgba(20,21,26,0.65) 100%)" }} />
                <div style={{ position: "absolute", left: 12, right: 12, bottom: 10, fontFamily: T.ui, fontSize: 10.5, fontWeight: 600, color: "#FFFFFF", letterSpacing: "0.02em" }}>
                  {it.caption}
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
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
function SectionHeader({ eyebrow, eyebrowColor, title, center = true, sub, dark = false }) {
  return (
    <div style={{ marginBottom: 56, textAlign: center ? "center" : "left" }}>
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

function MaskReveal({ children, delay = 0, style = {} }) {
  const reduce = useReducedMotion();
  return (
    <div style={{ overflow: "hidden", padding: "0.06em 0 0.22em", ...style }}>
      <motion.div
        initial={reduce ? false : { y: "100%" }}
        whileInView={{ y: "0%" }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.9, ease: EASE, delay }}
      >
        {children}
      </motion.div>
    </div>
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
    <section ref={ref} className="fs-hero" style={{ position: "relative", height: "94vh", minHeight: 780, overflow: "hidden", background: F.ink }}>
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
            { label: "Team", value: bigNumbers.team, color: F.plum, suffix: bigNumbers.team != null ? "%" : "" },
            { label: "AEO", value: bigNumbers.aeo, color: F.gold },
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

function HealthOrbitArc({ pct: value, color, r, size, stroke = 3 }) {
  const reduce = useReducedMotion();
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  const offset = c - (v / 100) * c;
  return (
    <motion.circle
      cx={size / 2} cy={size / 2} r={r} fill="none"
      stroke={value === null ? F.hairlineStrong : color}
      strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c}
      transform={`rotate(-90 ${size / 2} ${size / 2})`}
      initial={{ strokeDashoffset: c }}
      whileInView={{ strokeDashoffset: value === null ? c : offset }}
      viewport={{ once: true }}
      transition={reduce ? { duration: 0 } : { duration: 1.4, ease: EASE }}
    />
  );
}

function AgencyHealth({ health = {} }) {
  const reduce = useReducedMotion();
  const size = 520, cx = size / 2, cy = size / 2;
  const items = [
    { key: "revenue", label: "Revenue", angle: -90, color: "#8FBBA8", value: health.revenue },
    { key: "delivery", label: "Delivery", angle: -18, color: "#9DB4D9", value: health.delivery },
    { key: "clients", label: "Clients", angle: 54, color: "#E4C77B", value: health.clients },
    { key: "team", label: "Team", angle: 126, color: "#D2A6C0", value: health.team },
    { key: "growth", label: "Growth", angle: 198, color: "#E0A08F", value: health.growth },
  ];
  const R = 190;
  const strongest = [...items].filter((i) => i.value != null).sort((a, b) => b.value - a.value)[0];
  const weakest = [...items].filter((i) => i.value != null).sort((a, b) => a.value - b.value)[0];
  const avg = items.filter((i) => i.value != null).reduce((s, i, _, arr) => s + i.value / arr.length, 0);

  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const imgY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [-30, 30]);

  return (
    <section ref={ref} style={{ padding: "150px 44px 120px", position: "relative", overflow: "hidden", background: F.ink }}>
      {/* Full-bleed photo backdrop — this section was flat and dull before;
          it now reads as a proper editorial spread like the closing section. */}
      <motion.div style={{ position: "absolute", inset: -40, y: imgY }}>
        <img src={PHOTOS.health} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(0.35) brightness(0.42) contrast(1.05)" }} />
      </motion.div>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(20,21,26,0.55) 0%, rgba(20,21,26,0.72) 55%, rgba(20,21,26,0.88) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(70% 60% at 50% 38%, rgba(30,42,68,0.35), transparent 70%)" }} />

      <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center", position: "relative" }}>
        <SectionHeader eyebrow="Live view" eyebrowColor={F.cream} title="Agency Health" dark
          sub="Five signals, one pulse — how revenue, delivery, clients, team and growth are tracking right now." />

        <Reveal delay={0.15}>
          <div style={{ position: "relative", width: "100%", maxWidth: size, margin: "0 auto" }}>
            <DriftParticles color="#FFFFFF" area={size} count={14} />
            <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ overflow: "visible", position: "relative" }}>
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
                const nodeSize = 72;
                return (
                  <g key={it.key}>
                    <motion.circle
                      cx={x} cy={y} r={nodeSize / 2} fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.28)" strokeWidth={1}
                      animate={reduce ? undefined : { r: [nodeSize / 2, nodeSize / 2 + 2, nodeSize / 2] }}
                      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                      style={{ backdropFilter: "blur(6px)" }}
                    />
                    <HealthOrbitArc pct={it.value} color={it.color} r={nodeSize / 2 - 6} size={nodeSize} stroke={3} />
                    <foreignObject x={x - nodeSize / 2} y={y - nodeSize / 2} width={nodeSize} height={nodeSize}>
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.ui, fontWeight: 700, fontSize: 13, color: "#FFFFFF" }}>
                        {it.value != null ? `${it.value}${it.key === "revenue" || it.key === "growth" ? "" : "%"}` : <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 16 }}>—</span>}
                      </div>
                    </foreignObject>
                    <rect x={x - 36} y={y + nodeSize / 2 + 8} width={72} height={17} rx={8.5} fill="rgba(20,21,26,0.55)" />
                    <text x={x} y={y + nodeSize / 2 + 20} textAnchor="middle" fontFamily={T.ui} fontSize={10.5} fontWeight={600} fill="#F1ECE1" letterSpacing="0.05em">
                      {it.label.toUpperCase()}
                    </text>
                  </g>
                );
              })}
              <circle cx={cx} cy={cy} r={56} fill="rgba(255,255,255,0.1)" style={{ backdropFilter: "blur(8px)" }} />
              <circle cx={cx} cy={cy} r={56} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
              <text x={cx} y={cy - 6} textAnchor="middle" fontFamily={T.ui} fontSize={10} fontWeight={700} fill="#FFFFFF" letterSpacing="0.08em">AGENCY</text>
              <text x={cx} y={cy + 10} textAnchor="middle" fontFamily={T.ui} fontSize={10} fontWeight={700} fill="#FFFFFF" letterSpacing="0.08em">HEALTH</text>
            </svg>
          </div>
        </Reveal>

        {/* Fills the space around the ring with legible, concrete takeaways
            instead of leaving the diagram to stand alone on a flat field. */}
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginTop: 64, textAlign: "left" }}>
          <InsightCard dark label="Strongest signal" value={strongest ? strongest.label : "—"} note={strongest ? `Sitting at ${strongest.value}${strongest.key === "revenue" || strongest.key === "growth" ? "" : "%"}, ahead of the rest` : "Awaiting data"} color="#8FBBA8" delay={0.05} />
          <InsightCard dark label="Needs attention" value={weakest ? weakest.label : "—"} note={weakest ? `Currently the softest of the five signals` : "Awaiting data"} color="#E0A08F" delay={0.12} />
          <InsightCard dark label="Overall average" value={items.some((i) => i.value != null) ? `${Math.round(avg)}` : "—"} note="Blended across all five health signals" color="#9DB4D9" delay={0.19} />
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
  return (
    <section style={{ padding: "140px 44px", background: F.surface }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 56, alignItems: "start" }}>
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
        <Reveal delay={0.2}>
          <div style={{ paddingTop: 60 }}>
            <EditorialLine data={data.trend} color={F.forest} height={230} />
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
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
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
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
 * 7 — CLIENT CONSTELLATION
 * ──────────────────────────────────────────────────────────────── */

function ClientConstellation({ clients = {} }) {
  const reduce = useReducedMotion();
  const size = 560, cx = size / 2, cy = size / 2;
  const names = clients.names || [];
  const count = Math.max(names.length, 0);
  const R = 220;
  const tones = { healthy: F.forest, atRisk: F.gold, critical: F.rust };
  const critical = names.filter((n) => n.status === "critical");

  return (
    <section style={{ padding: "150px 44px 120px", background: F.surface, position: "relative" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", textAlign: "center" }}>
        <SectionHeader eyebrow="Portfolio" eyebrowColor={F.rust} title="The client constellation." />

        <Reveal delay={0.14}>
          <div style={{ display: "flex", gap: 24, justifyContent: "center", marginBottom: 54, flexWrap: "wrap" }}>
            {[
              { label: "Healthy", value: clients.healthy, color: F.forest },
              { label: "At risk", value: clients.atRisk, color: F.gold },
              { label: "Critical", value: clients.critical, color: F.rust },
            ].map((s) => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
                <span style={{ fontFamily: T.ui, fontSize: 11.5, color: F.inkSoft }}>{s.value ?? "—"} {s.label}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <div style={{ position: "relative", width: "100%", maxWidth: size, margin: "0 auto" }}>
            <DriftParticles color={F.rust} area={size} count={10} />
            <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ overflow: "visible", position: "relative" }}>
              <circle cx={cx} cy={cy} r={R} fill="none" stroke={F.hairline} strokeDasharray="2 6" />
              <circle cx={cx} cy={cy} r={90} fill={F.rustTint} opacity={0.5} />
              <circle cx={cx} cy={cy} r={90} fill="none" stroke={F.rust} strokeOpacity={0.25} />
              <text x={cx} y={cy - 6} textAnchor="middle" fontFamily={T.ui} fontSize={11} fontWeight={700} fill={F.rust} letterSpacing="0.08em">CLIENT</text>
              <text x={cx} y={cy + 10} textAnchor="middle" fontFamily={T.ui} fontSize={11} fontWeight={700} fill={F.rust} letterSpacing="0.08em">PORTFOLIO</text>

              {count === 0 && (
                <text x={cx} y={cy + R + 8} textAnchor="middle" fontFamily={T.ui} fontSize={11} fill={F.muted}>
                  Client portfolio data not yet connected
                </text>
              )}

              {names.map((n, i) => {
                const angle = (i / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2;
                const x = cx + Math.cos(angle) * R, y = cy + Math.sin(angle) * R;
                const color = tones[n.status] || F.muted;
                const [fg, bg] = badgeTone(n.name || String(i));
                const badgeR = 17;
                return (
                  <g key={n.id || i}>
                    <line x1={cx} y1={cy} x2={x} y2={y} stroke={color} strokeOpacity={0.14} />
                    <motion.circle cx={x} cy={y} r={badgeR + 3} fill="none" stroke={color} strokeWidth={1.6}
                      animate={reduce ? undefined : { r: [badgeR + 3, badgeR + 5, badgeR + 3] }}
                      transition={{ duration: 4 + (i % 3), repeat: Infinity, ease: "easeInOut" }} />
                    <circle cx={x} cy={y} r={badgeR} fill={bg} />
                    <text x={x} y={y + 4} textAnchor="middle" fontFamily={T.ui} fontSize={11} fontWeight={700} fill={fg}>
                      {initials(n.name)}
                    </text>
                    <rect x={x - 40} y={y - badgeR - 24} width={80} height={15} rx={7.5} fill={F.surface} opacity={0.92} />
                    <text x={x} y={y - badgeR - 13} textAnchor="middle" fontFamily={T.ui} fontSize={10} fontWeight={600} fill={F.inkSoft}>{n.name}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        </Reveal>

        {critical.length > 0 && (
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginTop: 56, textAlign: "left" }}>
            {critical.slice(0, 3).map((n, i) => (
              <InsightCard key={n.id} label="Critical" value={n.name} note="Flagged for founder review this period" color={F.rust} delay={i * 0.07} />
            ))}
          </div>
        )}
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
  const avg = team.avgUtilizationPct;
  const busiest = [...members].sort((a, b) => (b.utilizationPct ?? 0) - (a.utilizationPct ?? 0))[0];

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

      <div style={{ padding: "40px 44px 140px", position: "relative" }}>
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
                <InsightCard label="Average utilization" value={avg != null ? `${avg}%` : "—"} note="Across the full active roster" color={F.plum} delay={0.02} />
                <InsightCard label="Highest load" value={busiest ? busiest.name : "—"} note={busiest ? `Running at ${busiest.utilizationPct}% capacity` : "Awaiting data"} color={F.rust} delay={0.08} />
                <InsightCard label="Team size" value={`${members.length}`} note="People actively staffed on campaigns" color={F.gold} delay={0.14} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
                {members.map((m, i) => {
                  const util = m.utilizationPct ?? 0;
                  const hot = util >= 85;
                  const low = util < 40;
                  const color = hot ? F.rust : low ? F.gold : F.plum;
                  return (
                    <Reveal key={m.id || i} delay={Math.min(i * 0.04, 0.4)}>
                      <motion.div
                        whileHover={{ y: -4, boxShadow: "0 16px 34px rgba(20,21,26,0.1)" }}
                        transition={{ duration: 0.3, ease: EASE }}
                        style={{ background: F.surface, border: `1px solid ${F.hairline}`, borderRadius: 16, padding: "18px 18px 20px", display: "flex", gap: 14, alignItems: "center" }}
                      >
                        <div style={{ position: "relative" }}>
                          <UtilizationRing pct={util} color={color} />
                          {m.avatar && (
                            <img src={avatarUrl(m.avatar, 96)} alt="" style={{
                              position: "absolute", inset: 7, width: "calc(100% - 14px)", height: "calc(100% - 14px)",
                              borderRadius: "50%", objectFit: "cover",
                            }} />
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: T.ui, fontSize: 14, fontWeight: 700, color: F.ink, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                          <div style={{ fontFamily: T.ui, fontSize: 11, color, fontWeight: 700, marginBottom: 2 }}>{util}% utilized</div>
                          <div style={{ fontFamily: T.ui, fontSize: 10.5, color: F.muted }}>{m.activeProjects ?? 0} active project{m.activeProjects === 1 ? "" : "s"}</div>
                        </div>
                      </motion.div>
                    </Reveal>
                  );
                })}
              </div>

              <div style={{ display: "flex", justifyContent: "center", gap: 28, marginTop: 36, flexWrap: "wrap" }}>
                {[["Low capacity", F.gold], ["Healthy", F.plum], ["High capacity", F.rust]].map(([l, c]) => (
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
 * 9 — RISK RADAR
 * ──────────────────────────────────────────────────────────────── */

function RiskRadar({ risks = {} }) {
  const reduce = useReducedMotion();
  const size = 460, cx = size / 2, cy = size / 2, R = 170;
  const items = [
    { key: "billing", label: "Billing", angle: -90, color: F.forest },
    { key: "client", label: "Client", angle: -18, color: F.rust },
    { key: "campaign", label: "Campaign", angle: 54, color: F.navy },
    { key: "team", label: "Team", angle: 126, color: F.plum },
    { key: "aeo", label: "AEO", angle: 198, color: F.gold },
  ];
  const ranked = [...items].filter((i) => risks[i.key] != null).sort((a, b) => risks[b.key] - risks[a.key]);

  return (
    <section style={{ padding: "150px 44px 120px", background: F.surface, position: "relative" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
        <SectionHeader eyebrow="Signals" eyebrowColor={F.rust} title="Where attention is needed." />

        <Reveal delay={0.16}>
          <div style={{ position: "relative", width: "100%", maxWidth: size, margin: "0 auto" }}>
            <DriftParticles color={F.rust} area={size} count={9} />
            <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ overflow: "visible", position: "relative" }}>
              {[0.4, 0.7, 1].map((f) => <circle key={f} cx={cx} cy={cy} r={R * f} fill="none" stroke={F.hairline} strokeDasharray="2 6" />)}
              <circle cx={cx} cy={cy} r={40} fill={F.navyTint} />
              <text x={cx} y={cy + 4} textAnchor="middle" fontFamily={T.ui} fontSize={9.5} fontWeight={700} fill={F.navy} letterSpacing="0.06em">AGENCY</text>

              {items.map((it) => {
                const rad = (it.angle * Math.PI) / 180;
                const level = risks[it.key];
                const r = level == null ? R * 0.85 : R * (0.4 + (1 - level) * 0.5);
                const x = cx + Math.cos(rad) * r, y = cy + Math.sin(rad) * r;
                const critical = level != null && level > 0.66;
                return (
                  <g key={it.key}>
                    <line x1={cx} y1={cy} x2={x} y2={y} stroke={it.color} strokeOpacity={0.15} />
                    {critical && !reduce && (
                      <motion.circle cx={x} cy={y} r={9} fill="none" stroke={F.rust}
                        animate={{ scale: [1, 1.6], opacity: [0.45, 0] }}
                        transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
                        style={{ transformOrigin: `${x}px ${y}px` }} />
                    )}
                    <circle cx={x} cy={y} r={7} fill={F.surface} stroke={level == null ? F.hairlineStrong : it.color} strokeWidth={1.6} />
                    <rect x={x - 32} y={y - 30} width={64} height={15} rx={7.5} fill={F.surface} opacity={0.92} />
                    <text x={x} y={y - 19} textAnchor="middle" fontFamily={T.ui} fontSize={10} fontWeight={600} fill={F.inkSoft} letterSpacing="0.04em">
                      {it.label.toUpperCase()}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </Reveal>

        {/* Concrete list beneath the radar so the abstract diagram is
            always backed by legible numbers. */}
        <Reveal delay={0.22}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 420, margin: "56px auto 0" }}>
            {ranked.length === 0 && <div style={{ fontFamily: T.ui, fontSize: 12, color: F.muted }}>Risk signals not yet connected</div>}
            {ranked.map((it) => (
              <div key={it.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 82, fontFamily: T.ui, fontSize: 11, fontWeight: 600, color: F.inkSoft, textAlign: "left" }}>{it.label}</span>
                <div style={{ flex: 1, height: 5, borderRadius: 3, background: F.hairline, overflow: "hidden" }}>
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${Math.round(risks[it.key] * 100)}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, ease: EASE }}
                    style={{ height: "100%", background: it.color, borderRadius: 3 }}
                  />
                </div>
                <span style={{ width: 34, fontFamily: T.ui, fontSize: 11, fontWeight: 700, color: F.ink, textAlign: "right" }}>{Math.round(risks[it.key] * 100)}%</span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
 * 10 — DECISIONS ON THE HORIZON
 * ──────────────────────────────────────────────────────────────── */

function DecisionsHorizon({ items = [] }) {
  return (
    <section style={{ padding: "140px 44px", background: F.cream }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <SectionHeader eyebrow="Ahead" eyebrowColor={F.gold} title="Decisions on the horizon." center={false} />

        {items.length === 0 ? (
          <Reveal delay={0.14}>
            <div style={{ padding: "50px 0", textAlign: "center", borderTop: `1px solid ${F.hairline}`, borderBottom: `1px solid ${F.hairline}` }}>
              <span style={{ fontFamily: T.ui, fontSize: 12, color: F.muted }}>No decisions currently pending founder input</span>
            </div>
          </Reveal>
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
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
 * 11 — PERFORMANCE
 * ──────────────────────────────────────────────────────────────── */

function PerformanceGraph({ lines = [] }) {
  const reduce = useReducedMotion();
  const W = 900, H = 340, pad = 20;
  const hasAny = lines.some((l) => l.data && l.data.length > 1);

  return (
    <section style={{ padding: "140px 44px", background: F.cream }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <SectionHeader eyebrow="Trajectory" eyebrowColor={F.forest} title="Performance." center={false}
          sub="Eight periods, four signals — the shape of where the agency is headed." />

        {!hasAny ? (
          <Reveal delay={0.16}>
            <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", border: `1px dashed ${F.hairlineStrong}`, borderRadius: 14, background: F.surface }}>
              <span style={{ fontFamily: T.ui, fontSize: 12, color: F.muted }}>Performance trend will appear once operating history accumulates</span>
            </div>
          </Reveal>
        ) : (
          <>
            {/* Value chips — turns "a chart" into a set of concrete,
                scannable numbers before you even read the lines. */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
              {lines.map((line, i) => {
                const d = line.data || [];
                const latest = d[d.length - 1];
                const prev = d[d.length - 2];
                const delta = latest != null && prev != null ? latest - prev : null;
                return (
                  <Reveal key={line.key} delay={i * 0.05}>
                    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.25 }} style={{
                      display: "flex", alignItems: "center", gap: 10, background: F.surface,
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

            {/* Framed chart panel — previously the SVG floated directly on
                the section background with no definition of its own. */}
            <Reveal delay={0.18}>
              <div style={{ background: F.surface, border: `1px solid ${F.hairline}`, borderRadius: 20, padding: "36px 32px 24px", boxShadow: "0 20px 44px rgba(20,21,26,0.05)" }}>
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
              </div>
            </Reveal>
          </>
        )}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
 * 12 — THE BIG PICTURE
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
 * 13 — CLOSING
 * ──────────────────────────────────────────────────────────────── */



/* ────────────────────────────────────────────────────────────────
 * 14 — FOOTER
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
  const ctx = useOutletContext() || {};
  const { brandFilter, brands, summaryData } = ctx;

  const data = useMemo(() => mergeData(summaryData), [summaryData]);
  const brandName = brands?.find((b) => b.id === brandFilter)?.name || null;

  const asOfLabel = useMemo(() => {
    if (data.asOf) return data.asOf;
    const d = new Date();
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }).toUpperCase();
  }, [data.asOf]);

  return (
    <div style={{ background: F.paper, fontFamily: T.ui, color: F.ink, position: "relative" }}>
      <GrainOverlay />

      {brandName && (
        <div style={{ position: "relative", zIndex: 2, padding: "14px 44px", background: F.navyTint, borderBottom: `1px solid ${F.hairline}`, textAlign: "center" }}>
          <span style={{ fontFamily: T.ui, fontSize: 11, fontWeight: 600, color: F.navy }}>Filtered to: {brandName}</span>
        </div>
      )}

      <Hero asOfLabel={asOfLabel} />
      <ExecutiveStatement />
      <BigNumbers revenue={data.revenue} bigNumbers={data.bigNumbers} />
      <ContentMosaic />
      <PhotoInterlude src={PHOTOS.studio} kicker="Behind the work" headline="Every number on this page traces back to a room full of people making things." height={480} />
      <AgencyHealth health={data.health} />
      <RevenueSection data={data.revenue} />
      <PhotoInterlude src={PHOTOS.city} kicker="Momentum" headline="Campaigns move through the agency like light through a city." height={480} />
      <CampaignFlow stages={data.campaigns.stages} />
      <ClientConstellation clients={data.clients} />
      <PhotoInterlude src={PHOTOS.desk} kicker="Craft" headline="Client health is built one relationship, one delivery, at a time." height={480} dark={false} />
      <TeamField team={data.team} />
      <RiskRadar risks={data.risks} />
      <DecisionsHorizon items={data.decisions} />
      <PerformanceGraph lines={data.performance.lines} />
      <BigPicture />
      
      <Footer />
    </div>
  );
}