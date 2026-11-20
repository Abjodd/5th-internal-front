/**
 * Settings → Brand Settings.
 *
 * Every brand as a big card. Opening one expands it, from the card itself, into
 * a full-screen view of that brand:
 *
 *   · the brand — logo (with its colours as an ambient glow), name, website
 *   · details, each card editable on the spot: billing address + GST number,
 *     HQ address + GST, TIN + PAN, primary contact and other contacts
 *   · campaigns & spend — headline figures, then one card per campaign
 *     (creators, budget, committed creator spend, delivery ring)
 *   · insights — budget vs spend per campaign, spend by month, creators by
 *     platform
 *   · brand-portal logins
 *
 * Look and motion follow Apple's product pages: SF type, frosted glass bars,
 * grouped cards, segmented controls with a sliding thumb, activity rings,
 * figures that count up and charts that draw as they scroll into view. All of
 * it honours "reduce motion" (MotionConfig reducedMotion="user").
 *
 * The open brand lives in the URL (?tab=brands&brand=<id>), so the view can be
 * linked to and Back / Escape close it. Details save one section at a time
 * (PATCH /api/clients/:id); the backend checks GSTIN / PAN / TIN / emails.
 * Figures are derived from the campaigns — nothing extra is stored.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, MotionConfig, animate, motion, useInView, useReducedMotion } from "motion/react";
import {
  ArrowUpRight, Building2, CalendarDays, Check, ChevronLeft, ChevronRight, Copy, Globe, IdCard, ImageIcon,
  Landmark, Mail, Megaphone, Pencil, Phone, Plus, Receipt, Search, Trash2, UserRound, Users, Wallet, X,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from "recharts";
import { ClientsAPI, CampaignsAPI } from "../../lib/api";
import { fmtINR } from "../../lib/format";
import {
  costOf, hasBudget, isLockedCreator, execStats, normStage, stageLabel, creatorKeyOf, platformLabel, createdAtOf,
} from "../../lib/campaign";
import { check, sectionErrors, sectionPatch } from "../Services/consultantFields";
import BrandLogo from "../../components/BrandLogo";

// ── the look ────────────────────────────────────────────────────────────────
const SF = "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Sora', sans-serif";
const SFT = "'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Sora', sans-serif";
const INK = "#1D1D1F", INK2 = "#6E6E73", INK3 = "#86868B";
const BG = "#F5F5F7", LINE = "rgba(0,0,0,0.08)", FILL = "rgba(118,118,128,0.12)";
const BLUE = "#0071E3", LINK = "#0066CC", GREEN = "#28A745", RED = "#E30000";
const EASE = [0.32, 0.72, 0, 1];            // Apple's sheet curve
const SPRING = { type: "spring", stiffness: 380, damping: 34, mass: 0.9 };
const SOFT = { type: "spring", stiffness: 200, damping: 28 };

// Chart colours — validated with the dataviz palette checker (light: all pass).
const C_BUDGET = "#2a78d6", C_SPEND = "#eb6834", C_CREATORS = "#1baf7a";

// iOS-Settings-style icon tiles, one hue per section.
const ICON_HUE = { basic: "#0A84FF", billing: "#30C759", hq: "#5E5CE6", tax: "#FF9F0A", primary: "#FF375F", contacts: "#32ADE6" };

// ── what a brand record holds (the order it's read in) ─────────────────────
const SECTIONS = [
  { id: "basic", title: "Brand", icon: Globe, path: "", fields: [
    { key: "name", label: "Brand name", placeholder: "e.g. Glow Co", required: true },
    { key: "website", label: "Website", placeholder: "brand.com" },
  ] },
  { id: "billing", title: "Billing", icon: Receipt, path: "billing", fields: [
    { key: "address", label: "Brand address", placeholder: "Street, city, state, PIN", multiline: true },
    { key: "gstNumber", label: "GST number", placeholder: "27AAPFU0939F1ZV", check: check.gst, upper: true, code: true },
    { key: "email", label: "Billing email", placeholder: "accounts@brand.com", check: check.email },
  ] },
  { id: "hq", title: "Headquarters", icon: Building2, path: "hq", fields: [
    { key: "address", label: "HQ address", placeholder: "Registered office address", multiline: true },
    { key: "gst", label: "HQ GST", placeholder: "GSTIN of the HQ", check: check.gst, upper: true, code: true },
  ] },
  { id: "tax", title: "Tax", icon: Landmark, path: "tax", fields: [
    { key: "tin", label: "TIN", placeholder: "Tax identification number", check: check.tin, upper: true, code: true },
    { key: "pan", label: "PAN", placeholder: "ABCDE1234F", check: check.pan, upper: true, code: true },
  ] },
  { id: "primary", title: "Primary contact", icon: IdCard, path: "primaryContact", fields: [
    { key: "name", label: "Name", placeholder: "Who we deal with" },
    { key: "designation", label: "Designation", placeholder: "e.g. Marketing Head" },
    { key: "email", label: "Email", placeholder: "name@brand.com", check: check.email },
    { key: "phone", label: "Phone", placeholder: "+91 …" },
  ] },
];
const PERSON_FIELDS = SECTIONS.find((s) => s.id === "primary").fields;
const valueOf = (b, s) => (s.path ? { ...b?.[s.path] } : { name: b?.name || "", website: b?.website || "" });

/** How much of a brand's record is filled in. */
export function brandCompleteness(b) {
  const checks = [
    b.website, b.billing?.address, b.billing?.gstNumber, b.billing?.email, b.hq?.address, b.hq?.gst,
    b.tax?.tin, b.tax?.pan, b.primaryContact?.name, b.primaryContact?.email,
  ];
  const done = checks.filter(Boolean).length;
  return { done, total: checks.length, pct: Math.round((done / checks.length) * 100) };
}

// ── campaign figures ─────────────────────────────────────────────────────────
const norm = (s) => String(s || "").trim().toLowerCase();
const campaignsOf = (brand, all) => all.filter((c) => c.brandId === brand.id || (!c.brandId && norm(c.client) === norm(brand.name)));
const isDone = (c) => normStage(c.stage) === "payment_done";

function campaignFigures(c) {
  const creators = c.creators || [];
  const locked = creators.filter(isLockedCreator);
  const spend = locked.reduce((s, cr) => s + (Number(costOf(cr)) || 0), 0);
  const budget = hasBudget(c) ? Number(c.budget) : null;
  return { creators: creators.length, locked: locked.length, spend, budget, pct: execStats(c).pct };
}

function brandFigures(camps) {
  const people = new Set(), lockedPeople = new Set();
  let budget = 0, spend = 0, budgeted = 0, spendOnBudgeted = 0;
  for (const c of camps) {
    const f = campaignFigures(c);
    for (const cr of c.creators || []) {
      const k = creatorKeyOf(cr);
      if (!k) continue;
      people.add(k);
      if (isLockedCreator(cr)) lockedPeople.add(k);
    }
    spend += f.spend;
    if (f.budget != null) { budget += f.budget; budgeted++; spendOnBudgeted += f.spend; }
  }
  const active = camps.filter((c) => !isDone(c)).length;
  return {
    campaigns: camps.length, active, completed: camps.length - active,
    creators: people.size, locked: lockedPeople.size,
    budget: budgeted ? budget : null, budgeted, spend,
    used: budgeted && budget > 0 ? Math.round((spendOnBudgeted / budget) * 100) : null,
    perCreator: lockedPeople.size ? Math.round(spend / lockedPeople.size) : null,
  };
}

const fmtDay = (d) => {
  const t = Date.parse(d ? `${String(d).slice(0, 10)}T00:00:00` : "");
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
};
const siteHref = (w) => (!w ? null : /^https?:\/\//i.test(w) ? w : `https://${w}`);
const siteText = (w) => String(w || "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
const errText = (e) => e?.body?.error || e?.message || "Something went wrong";
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const TINTS = ["#5E5CE6", "#0A84FF", "#30B0C7", "#FF9F0A", "#FF375F", "#BF5AF2", "#34C759"];
const tintFor = (s) => { let h = 0; for (const ch of String(s || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return TINTS[h % TINTS.length]; };

// ── global styles for this view ──────────────────────────────────────────────
const CSS = `
.bx{font-family:${SFT};color:${INK};-webkit-font-smoothing:antialiased;font-feature-settings:"tnum" 0}
.bx .num{font-variant-numeric:tabular-nums}
.bx :focus-visible{outline:3px solid rgba(0,113,227,0.45);outline-offset:2px;border-radius:12px}
.bx-input{transition:border-color .2s, box-shadow .2s, background .2s}
.bx-input:focus{border-color:${BLUE}!important;background:#fff!important;box-shadow:0 0 0 4px rgba(0,113,227,0.16)}
.bx-link{color:${LINK};text-decoration:none}
.bx-link:hover{text-decoration:underline}
.bx-scroll{scrollbar-width:thin;scrollbar-color:rgba(0,0,0,0.25) transparent}
.bx .recharts-tooltip-cursor{transition:opacity .2s}
@media (max-width: 720px){.bx-hide-sm{display:none!important}.bx-pad{padding-left:16px!important;padding-right:16px!important}}
`;

// ═════════════════════════════════════════════════════════════════════════════
//  SMALL PIECES
// ═════════════════════════════════════════════════════════════════════════════

/** A number that counts up the first time it scrolls into view. */
function CountUp({ value, format = (n) => Math.round(n).toLocaleString("en-IN"), empty = "—" }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (value == null || !inView) return;
    if (reduce) { setN(value); return; }
    const ctl = animate(0, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1], onUpdate: setN });
    return () => ctl.stop();
  }, [value, inView, reduce]);
  return <span ref={ref} className="num">{value == null ? empty : format(inView ? n : 0)}</span>;
}
const inrUp = (n) => fmtINR(Math.round(n));

/** Apple-Watch-style ring: gradient stroke that draws itself in. */
function Ring({ pct, size = 56, stroke = 7, from = "#30D158", to = "#A3F07A", track = "rgba(0,0,0,0.07)", children, label }) {
  const id = useId().replace(/:/g, "");
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct || 0));
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-30px" });
  return (
    <div ref={ref} role="img" aria-label={label || `${v}%`} style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", display: "block" }} aria-hidden>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={from} /><stop offset="100%" stopColor={to} /></linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#g${id})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: inView ? c * (1 - v / 100) : c }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.15 }} />
      </svg>
      {children && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>}
    </div>
  );
}

/** iOS segmented control with a sliding thumb. */
function Segmented({ options, value, onChange, label, size = "md" }) {
  const group = useId();
  const h = size === "sm" ? 30 : 34;
  return (
    <div role="tablist" aria-label={label} style={{ display: "inline-flex", padding: 2, borderRadius: 11, background: FILL, gap: 0, maxWidth: "100%", overflowX: "auto" }}>
      {options.map(([id, text]) => {
        const on = value === id;
        return (
          <button key={id} type="button" role="tab" aria-selected={on} onClick={() => onChange(id)}
            style={{ position: "relative", height: h, padding: "0 14px", border: "none", background: "transparent", cursor: "pointer", borderRadius: 9,
              fontFamily: SFT, fontSize: 13, fontWeight: on ? 600 : 500, color: INK, whiteSpace: "nowrap", flexShrink: 0 }}>
            {on && <motion.span layoutId={`seg-${group}`} transition={SPRING}
              style={{ position: "absolute", inset: 0, borderRadius: 9, background: "#fff", boxShadow: "0 3px 8px rgba(0,0,0,0.12), 0 3px 1px rgba(0,0,0,0.04)" }} />}
            <span style={{ position: "relative" }}>{text}</span>
          </button>
        );
      })}
    </div>
  );
}

function Pill({ kind = "plain", icon: Icon, children, style = {}, ...rest }) {
  const look = {
    primary: { background: BLUE, color: "#fff", border: "none" },
    dark: { background: INK, color: "#fff", border: "none" },
    danger: { background: "rgba(227,0,0,0.08)", color: RED, border: "none" },
    plain: { background: FILL, color: INK, border: "none" },
    glass: { background: "rgba(255,255,255,0.7)", color: INK, border: `0.5px solid ${LINE}`, backdropFilter: "blur(12px)" },
  }[kind];
  return (
    <motion.button type="button" whileHover={rest.disabled ? undefined : { scale: 1.03 }} whileTap={rest.disabled ? undefined : { scale: 0.96 }} transition={SPRING} {...rest}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 16px", borderRadius: 980, fontFamily: SFT, fontSize: 13.5, fontWeight: 500,
        cursor: rest.disabled ? "not-allowed" : "pointer", opacity: rest.disabled ? 0.5 : 1, whiteSpace: "nowrap", ...look, ...style }}>
      {Icon && <Icon size={15} strokeWidth={2.2} />}{children}
    </motion.button>
  );
}

const IconTile = ({ hue, icon: Icon, size = 30 }) => (
  <span style={{ width: size, height: size, borderRadius: size * 0.26, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff",
    background: `linear-gradient(180deg, ${hue}cc 0%, ${hue} 100%)`, boxShadow: `inset 0 0.5px 0 rgba(255,255,255,0.45), 0 1px 2px ${hue}55` }}>
    <Icon size={size * 0.55} strokeWidth={2.2} />
  </span>
);

/** The brand's own colours, blurred into a soft glow behind it. */
function Ambient({ brand, height = "100%", strength = 0.55 }) {
  const url = ClientsAPI.avatarUrl(brand);
  const tint = tintFor(brand.name);
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, height, overflow: "hidden", pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(60% 80% at 20% 10%, ${tint}55 0%, transparent 70%), radial-gradient(50% 70% at 85% 30%, ${tint}33 0%, transparent 70%)` }} />
      {url && <img src={url} alt="" style={{ position: "absolute", left: "50%", top: "40%", width: "120%", height: "160%", objectFit: "cover", transform: "translate(-50%,-50%)", filter: "blur(60px) saturate(1.7)", opacity: strength }} />}
    </div>
  );
}

const Logo = ({ brand, size, radius }) => (
  <BrandLogo brand={brand.name} website={brand.website} logoUrl={ClientsAPI.avatarUrl(brand)} size={size} radius={radius} />
);

// ═════════════════════════════════════════════════════════════════════════════
//  THE GRID
// ═════════════════════════════════════════════════════════════════════════════
function BrandCard({ brand, figures, logins, index, onOpen }) {
  const done = brandCompleteness(brand);
  const ref = useRef(null);
  return (
    <motion.button ref={ref} type="button" onClick={() => onOpen(ref.current?.getBoundingClientRect())} aria-label={`Open ${brand.name}`} data-testid={`brand-card-${brand.id}`}
      layout initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
      transition={{ ...SOFT, delay: Math.min(index, 12) * 0.045 }}
      whileHover={{ y: -6, boxShadow: "0 30px 60px -12px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.05)" }} whileTap={{ scale: 0.98 }}
      style={{ position: "relative", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: SFT, color: INK, overflow: "hidden", display: "flex", flexDirection: "column",
        background: "#fff", border: "none", borderRadius: 28, boxShadow: "0 2px 4px rgba(0,0,0,0.03), 0 12px 32px -8px rgba(0,0,0,0.10)" }}>
      {/* art */}
      <div style={{ position: "relative", height: 150, background: "#FBFBFD" }}>
        <Ambient brand={brand} />
        <motion.div whileHover={{ scale: 1.06 }} transition={SPRING}
          style={{ position: "absolute", left: "50%", top: "50%", x: "-50%", y: "-50%", width: 84, height: 84, borderRadius: 22, background: "rgba(255,255,255,0.9)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.14), inset 0 0 0 0.5px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <Logo brand={brand} size={68} radius={16} />
        </motion.div>
        <span style={{ position: "absolute", right: 14, top: 14, width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.72)", backdropFilter: "blur(10px)",
          display: "inline-flex", alignItems: "center", justifyContent: "center", color: INK }}><ArrowUpRight size={15} /></span>
      </div>

      <div style={{ padding: "18px 22px 20px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ fontFamily: SF, fontWeight: 700, fontSize: 24, letterSpacing: "-0.022em", lineHeight: 1.12, overflowWrap: "anywhere" }}>{brand.name || "Untitled brand"}</div>
        <div style={{ fontSize: 14, color: INK3, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{brand.website ? siteText(brand.website) : "No website yet"}</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", marginTop: 18, padding: "14px 0", borderTop: `0.5px solid ${LINE}`, borderBottom: `0.5px solid ${LINE}` }}>
          {[
            ["Campaigns", figures ? <CountUp value={figures.campaigns} /> : "…"],
            ["Creators", figures ? <CountUp value={figures.creators} /> : "…"],
            ["Spend", figures ? <CountUp value={figures.spend} format={inrUp} /> : "…"],
          ].map(([k, v], i) => (
            <div key={k} style={{ textAlign: "center", borderLeft: i ? `0.5px solid ${LINE}` : "none", minWidth: 0, padding: "0 6px" }}>
              <div style={{ fontFamily: SF, fontSize: 21, fontWeight: 600, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</div>
              <div style={{ fontSize: 12, color: INK3, marginTop: 2 }}>{k}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <Ring pct={done.pct} size={36} stroke={5} label={`Brand details ${done.pct}% filled`}
            from={done.pct === 100 ? "#30D158" : "#0A84FF"} to={done.pct === 100 ? "#A3F07A" : "#64D2FF"} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{done.pct === 100 ? "Details complete" : `Details ${done.pct}% filled`}</div>
            <div style={{ fontSize: 12.5, color: INK3 }}>{logins ? plural(logins, "portal login") : "No portal logins"}{figures ? ` · ${figures.active} active` : ""}</div>
          </div>
        </div>
      </div>
    </motion.button>
  );
}

export default function BrandSettings({ brands, creds, onEditLogo, onDelete, onCreate, onManageLogins, refreshBrands }) {
  const [params, setParams] = useSearchParams();
  const openId = params.get("brand");
  const [campaigns, setCampaigns] = useState(null);
  const [campErr, setCampErr] = useState(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("name");
  const [saved, setSaved] = useState({});          // saved edits, shown before the lists re-fetch
  const rects = useRef({});                         // card rects — the sheet grows out of the card

  const loadCampaigns = useCallback(() => {
    setCampErr(null);
    CampaignsAPI.list().then(setCampaigns).catch((e) => { setCampErr(errText(e)); setCampaigns([]); });
  }, []);
  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  // The app shell's `brands` carries only id/name/logo, so the full records
  // (website, billing, HQ, tax, contacts) are read here — again whenever the
  // shell's list changes (a brand added, deleted or given a new logo).
  const [records, setRecords] = useState(null);
  useEffect(() => {
    let live = true;
    ClientsAPI.list().then((r) => { if (live) { setRecords(r); setSaved({}); } }).catch(() => { if (live) setRecords(null); });
    return () => { live = false; };
  }, [brands]);
  const list = useMemo(() => {
    const byId = new Map((records || []).map((r) => [r.id, r]));
    return brands.map((b) => ({ ...b, ...byId.get(b.id), ...saved[b.id] }));
  }, [brands, records, saved]);
  const figures = useMemo(() => {
    if (!campaigns) return {};
    return Object.fromEntries(list.map((b) => [b.id, brandFigures(campaignsOf(b, campaigns))]));
  }, [list, campaigns]);
  const totals = useMemo(() => {
    if (!campaigns) return null;
    const v = Object.values(figures);
    return { campaigns: v.reduce((s, f) => s + f.campaigns, 0), active: v.reduce((s, f) => s + f.active, 0), spend: v.reduce((s, f) => s + f.spend, 0), budget: v.reduce((s, f) => s + (f.budget || 0), 0) };
  }, [figures, campaigns]);

  const shown = useMemo(() => {
    const term = norm(q);
    const rows = term ? list.filter((b) => [b.name, b.website, b.billing?.gstNumber, b.tax?.pan, b.primaryContact?.name].some((v) => norm(v).includes(term))) : list;
    const byName = (a, b) => (a.name || "").localeCompare(b.name || "");
    const by = {
      name: byName,
      campaigns: (a, b) => (figures[b.id]?.campaigns || 0) - (figures[a.id]?.campaigns || 0) || byName(a, b),
      spend: (a, b) => (figures[b.id]?.spend || 0) - (figures[a.id]?.spend || 0) || byName(a, b),
    }[sort];
    return [...rows].sort(by);
  }, [list, q, sort, figures]);

  const open = (id, rect) => {
    if (rect) rects.current[id] = rect;
    setParams((p) => { const n = new URLSearchParams(p); n.set("tab", "brands"); n.set("brand", id); return n; });
  };
  const close = useCallback(() => setParams((p) => { const n = new URLSearchParams(p); n.delete("brand"); return n; }), [setParams]);
  const openBrand = openId ? list.find((b) => b.id === openId) : null;
  const onSaved = (updated) => { setSaved((s) => ({ ...s, [updated.id]: updated })); refreshBrands?.(); };

  return (
    <MotionConfig reducedMotion="user">
      <div className="bx">
        <style>{CSS}</style>

        {/* everything behind an open brand is inert — not focusable, hidden from screen readers */}
        <div {...(openBrand ? { inert: "", "aria-hidden": true } : {})}>
        {/* summary */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 24, flexWrap: "wrap", margin: "6px 0 22px" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: INK3, letterSpacing: "0.02em", textTransform: "uppercase" }}>Your brands</div>
            <div style={{ fontFamily: SF, fontSize: "clamp(30px, 3.4vw, 40px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, marginTop: 4 }}>
              {plural(list.length, "brand")}{totals ? <span style={{ color: INK3 }}> · <CountUp value={totals.campaigns} /> campaigns</span> : null}
            </div>
          </div>
          {totals && (
            <div style={{ display: "flex", gap: 28, marginLeft: "auto", flexWrap: "wrap" }}>
              {[["Creator spend", <CountUp key="s" value={totals.spend} format={inrUp} />], ["Total budget", <CountUp key="b" value={totals.budget || null} format={inrUp} />], ["Active campaigns", <CountUp key="a" value={totals.active} />]].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontFamily: SF, fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>{v}</div>
                  <div style={{ fontSize: 12.5, color: INK3 }}>{k}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
          <label style={{ position: "relative", flex: "1 1 260px", maxWidth: 440 }}>
            <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Search brands</span>
            <Search size={16} style={{ position: "absolute", left: 13, top: 12, color: INK3 }} />
            <input className="bx-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brand, website, GST, PAN or contact"
              style={{ width: "100%", boxSizing: "border-box", height: 40, padding: "0 14px 0 38px", borderRadius: 12, border: "1px solid transparent", background: FILL, fontSize: 14, color: INK, fontFamily: SFT, outline: "none" }} />
          </label>
          <Segmented label="Sort brands" value={sort} onChange={setSort} options={[["name", "A–Z"], ["campaigns", "Most campaigns"], ["spend", "Highest spend"]]} />
          <span style={{ marginLeft: "auto", fontSize: 13.5, color: INK3 }}>{shown.length === list.length ? "" : `${shown.length} of ${list.length}`}</span>
        </div>
        {campErr && <div style={{ fontSize: 13.5, color: "#B25000", marginBottom: 14 }}>Campaign figures couldn't load ({campErr}). Brand details still work. <button type="button" onClick={loadCampaigns} className="bx-link" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13.5, padding: 0 }}>Try again</button></div>}

        {shown.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 24, padding: 48, textAlign: "center", fontSize: 15, color: INK2 }}>No brand matches “{q}”.</div>
        ) : (
          <motion.div layout style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: 22 }}>
            <AnimatePresence mode="popLayout">
              {shown.map((b, i) => (
                <BrandCard key={b.id} index={i} brand={b} figures={campaigns ? figures[b.id] : null}
                  logins={creds.filter((c) => c.brandId === b.id).length} onOpen={(rect) => open(b.id, rect)} />
              ))}
              <motion.button key="__add" layout type="button" onClick={onCreate} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                style={{ minHeight: 300, borderRadius: 28, border: `1.5px dashed rgba(0,0,0,0.14)`, background: "rgba(255,255,255,0.5)", cursor: "pointer", fontFamily: SFT, color: INK2,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, fontSize: 15, fontWeight: 500 }}>
                <span style={{ width: 54, height: 54, borderRadius: "50%", background: BLUE, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 20px rgba(0,113,227,0.35)" }}><Plus size={26} /></span>
                Add a brand
              </motion.button>
            </AnimatePresence>
          </motion.div>
        )}

        </div>

        <AnimatePresence custom={openBrand ? rects.current[openBrand.id] : null}>
          {openId && openBrand && (
            <BrandScreen key={openBrand.id} brand={openBrand} rect={rects.current[openBrand.id]} campaigns={campaigns} campErr={campErr}
              logins={creds.filter((c) => c.brandId === openBrand.id)}
              onClose={close} onSaved={onSaved}
              onEditLogo={() => onEditLogo(openBrand)} onDelete={() => onDelete(openBrand)}
              onManageLogins={() => { close(); onManageLogins?.(openBrand); }} />
          )}
        </AnimatePresence>
        {openId && !openBrand && list.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 18, padding: 18, marginTop: 18, fontSize: 14, color: INK2 }}>
            That brand isn't in the list any more. <button type="button" onClick={close} className="bx-link" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 0 }}>Show all brands</button>
          </div>
        )}
      </div>
    </MotionConfig>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  THE BRAND SCREEN
// ═════════════════════════════════════════════════════════════════════════════
const insetOf = (r) => {
  if (!r || typeof window === "undefined") return "inset(0px 0px 0px 0px round 0px)";
  return `inset(${Math.max(0, r.top)}px ${Math.max(0, window.innerWidth - r.right)}px ${Math.max(0, window.innerHeight - r.bottom)}px ${Math.max(0, r.left)}px round 28px)`;
};
const sheet = {
  hidden: (r) => (r ? { clipPath: insetOf(r), opacity: 1 } : { clipPath: insetOf(null), opacity: 0, scale: 0.985 }),
  shown: { clipPath: insetOf(null), opacity: 1, scale: 1, transition: { duration: 0.6, ease: EASE } },
  gone: (r) => (r ? { clipPath: insetOf(r), opacity: 0.4, transition: { duration: 0.42, ease: EASE } } : { opacity: 0, scale: 0.985, transition: { duration: 0.25 } }),
};
const NAV = [["details", "Details"], ["campaigns", "Campaigns"], ["insights", "Insights"], ["logins", "Logins"]];

function BrandScreen({ brand, rect, campaigns, campErr, logins, onClose, onSaved, onEditLogo, onDelete, onManageLogins }) {
  const scroller = useRef(null);
  const [ready, setReady] = useState(false);
  const [scrolled, setScrolled] = useState(0);
  const [section, setSection] = useState("details");
  const sectionRefs = useRef({});

  useEffect(() => {
    const k = (e) => { if (e.key === "Escape" && !document.querySelector("[data-bx-editing='1']")) onClose(); };
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    scroller.current?.focus({ preventScroll: true });
    // Detail cards rise in once the sheet has opened (a fallback in case the
    // opening animation is skipped, e.g. with reduce motion).
    const t = setTimeout(() => setReady(true), 700);
    return () => { clearTimeout(t); window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [onClose]);

  const onScroll = () => {
    const el = scroller.current; if (!el) return;
    setScrolled(el.scrollTop);
    let cur = "details";
    for (const [id] of NAV) { const s = sectionRefs.current[id]; if (s && s.offsetTop - 160 <= el.scrollTop) cur = id; }
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) cur = NAV[NAV.length - 1][0];
    setSection(cur);
  };
  const jump = (id) => {
    const el = scroller.current, s = sectionRefs.current[id];
    if (el && s) el.scrollTo({ top: s.offsetTop - 118, behavior: "smooth" });
    setSection(id);
  };

  const camps = useMemo(() => (campaigns ? campaignsOf(brand, campaigns).sort((a, b) => createdAtOf(b) - createdAtOf(a)) : null), [brand, campaigns]);
  const fig = useMemo(() => (camps ? brandFigures(camps) : null), [camps]);
  const done = brandCompleteness(brand);
  const save = async (patch) => { onSaved(await ClientsAPI.update(brand.id, patch)); };
  const compact = scrolled > 230;

  const reveal = (i) => ({ initial: { opacity: 0, y: 28 }, animate: ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }, transition: { ...SOFT, delay: 0.05 + i * 0.07 } });

  return (
    <motion.div role="dialog" aria-modal="true" aria-label={`${brand.name} — brand`} ref={scroller} tabIndex={-1} onScroll={onScroll} className="bx bx-scroll"
      custom={rect} variants={sheet} initial="hidden" animate="shown" exit="gone" onAnimationComplete={(def) => { if (def === "shown") setReady(true); }}
      style={{ position: "fixed", inset: 0, zIndex: 400, background: BG, overflowY: "auto", outline: "none", willChange: "clip-path" }} data-testid="brand-screen">
        {/* frosted top bar — the large title collapses into it */}
        <div style={{ position: "sticky", top: 0, zIndex: 20, background: compact ? "rgba(245,245,247,0.86)" : "rgba(245,245,247,0)", backdropFilter: compact ? "saturate(180%) blur(20px)" : "none",
          WebkitBackdropFilter: compact ? "saturate(180%) blur(20px)" : "none", borderBottom: `0.5px solid ${compact ? LINE : "transparent"}`, transition: "background .3s, border-color .3s" }}>
          <div className="bx-pad" style={{ maxWidth: 1180, margin: "0 auto", padding: "10px 32px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
            <div>
              <motion.button type="button" onClick={onClose} whileTap={{ scale: 0.95 }} aria-label="Back to all brands"
                style={{ display: "inline-flex", alignItems: "center", gap: 2, height: 34, padding: "0 12px 0 6px", borderRadius: 980, border: "none", background: "rgba(255,255,255,0.75)", backdropFilter: "blur(12px)",
                  color: LINK, fontFamily: SFT, fontSize: 15, cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <ChevronLeft size={20} />Brands
              </motion.button>
            </div>
            <div style={{ display: "flex", justifyContent: "center", minWidth: 0 }}>
            <AnimatePresence>
              {compact && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.22 }}
                  style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <Logo brand={brand} size={24} radius={6} />
                  <span style={{ fontFamily: SF, fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "40vw" }}>{brand.name}</span>
                </motion.div>
              )}
            </AnimatePresence>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Pill kind="glass" icon={ImageIcon} onClick={onEditLogo} aria-label="Logo and website"><span className="bx-hide-sm">Logo &amp; website</span></Pill>
              <Pill kind="danger" icon={Trash2} onClick={onDelete} aria-label="Delete brand"><span className="bx-hide-sm">Delete</span></Pill>
              <motion.button type="button" aria-label="Close" onClick={onClose} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}
                style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: FILL, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: INK2 }}><X size={17} strokeWidth={2.4} /></motion.button>
            </div>
          </div>
        </div>

        {/* hero */}
        <div style={{ position: "relative", marginTop: -54, paddingTop: 54 }}>
          <div style={{ position: "absolute", inset: 0, height: 520, WebkitMaskImage: "linear-gradient(180deg,#000 40%,transparent)", maskImage: "linear-gradient(180deg,#000 40%,transparent)" }}>
            <Ambient brand={brand} strength={0.5} />
          </div>
          <div className="bx-pad" style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "40px 32px 10px", textAlign: "center" }}>
            <motion.button type="button" onClick={onEditLogo} aria-label="Change logo" title="Change logo"
              initial={{ scale: 0.6, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.18 }} whileHover={{ scale: 1.05, rotate: -1.5 }}
              style={{ width: 132, height: 132, borderRadius: 34, background: "rgba(255,255,255,0.92)", border: "none", padding: 0, cursor: "pointer",
                boxShadow: "0 24px 50px -10px rgba(0,0,0,0.25), inset 0 0 0 0.5px rgba(0,0,0,0.06)", display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              <Logo brand={brand} size={108} radius={26} />
            </motion.button>
            <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.26 }}
              style={{ margin: "22px 0 0", fontFamily: SF, fontWeight: 700, fontSize: "clamp(36px, 5.6vw, 64px)", lineHeight: 1.04, letterSpacing: "-0.035em", overflowWrap: "anywhere" }}>{brand.name}</motion.h1>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.34 }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              {brand.website
                ? <a href={siteHref(brand.website)} target="_blank" rel="noopener noreferrer" className="bx-link" style={{ fontSize: 17, display: "inline-flex", alignItems: "center", gap: 3 }}>{siteText(brand.website)}<ChevronRight size={16} /></a>
                : <span style={{ fontSize: 17, color: INK3 }}>No website yet</span>}
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.42 }}
              style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
              {[
                [<CountUp key="c" value={fig?.campaigns ?? null} empty="…" />, "Campaigns"],
                [<CountUp key="l" value={logins.length} />, "Portal logins"],
              ].map(([v, k]) => (
                <div key={k} style={{ display: "inline-flex", alignItems: "baseline", gap: 6, padding: "9px 16px", borderRadius: 980, background: "rgba(255,255,255,0.72)", backdropFilter: "blur(14px)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                  <span style={{ fontFamily: SF, fontWeight: 700, fontSize: 17 }}>{v}</span><span style={{ fontSize: 14, color: INK2 }}>{k}</span>
                </div>
              ))}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "5px 16px 5px 6px", borderRadius: 980, background: "rgba(255,255,255,0.72)", backdropFilter: "blur(14px)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <Ring pct={done.pct} size={30} stroke={4.5} label={`Details ${done.pct}% filled`} from={done.pct === 100 ? "#30D158" : "#0A84FF"} to={done.pct === 100 ? "#A3F07A" : "#64D2FF"} />
                <span style={{ fontFamily: SF, fontWeight: 700, fontSize: 17 }} className="num">{done.pct}%</span><span style={{ fontSize: 14, color: INK2 }}>details filled</span>
              </div>
            </motion.div>
          </div>
        </div>

        {/* section switcher — stays under the bar */}
        <div style={{ position: "sticky", top: 58, zIndex: 15, display: "flex", justifyContent: "center", padding: "18px 16px 6px", pointerEvents: "none" }}>
          <div style={{ pointerEvents: "auto", borderRadius: 13, background: "rgba(255,255,255,0.72)", backdropFilter: "saturate(180%) blur(20px)", WebkitBackdropFilter: "saturate(180%) blur(20px)", boxShadow: "0 4px 18px rgba(0,0,0,0.08)", maxWidth: "100%" }}>
            <Segmented label="Sections" value={section} onChange={jump} options={NAV} />
          </div>
        </div>

        <div className="bx-pad" style={{ maxWidth: 1180, margin: "0 auto", padding: "8px 32px 120px" }}>
          {/* details */}
          <section data-section="details" ref={(el) => (sectionRefs.current.details = el)}>
            <SectionHead eyebrow="Who they are" title="Brand details" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: 18 }}>
              {SECTIONS.map((s, i) => <motion.div key={s.id} {...reveal(i)}><DetailCard brand={brand} section={s} onSave={save} /></motion.div>)}
              <motion.div {...reveal(SECTIONS.length)}><ContactsCard brand={brand} onSave={save} /></motion.div>
            </div>
          </section>

          {/* campaigns & spend */}
          <section data-section="campaigns" ref={(el) => (sectionRefs.current.campaigns = el)}>
            <SectionHead eyebrow="Campaigns & spend" title={fig ? `${plural(fig.campaigns, "campaign")}, ${fmtINR(fig.spend)} committed.` : "Campaigns"} />
            {!camps ? <Shimmer /> : (<><Kpis fig={fig} /><CampaignCards camps={camps} brand={brand} campErr={campErr} /></>)}
          </section>

          {/* insights */}
          <section data-section="insights" ref={(el) => (sectionRefs.current.insights = el)}>
            <SectionHead eyebrow="Insights" title="At a glance." />
            {!camps ? <Shimmer /> : camps.length === 0
              ? <Glass><Empty>Charts appear once {brand.name} has campaigns.</Empty></Glass>
              : <Charts camps={camps} />}
          </section>

          {/* logins */}
          <section data-section="logins" ref={(el) => (sectionRefs.current.logins = el)}>
            <SectionHead eyebrow="Brand portal" title="Who can sign in." aside={<Pill kind="plain" icon={Pencil} onClick={onManageLogins}>Manage logins</Pill>} />
            {logins.length === 0 ? (
              <Glass style={{ padding: "26px 28px", fontSize: 15, color: INK2 }}>No one from {brand.name} can sign in to the brand portal yet. Add a login from <b style={{ color: INK }}>Manage logins</b>.</Glass>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))", gap: 14 }}>
                {logins.map((l, i) => (
                  <InView key={l.id} delay={i * 0.06}>
                    <Glass style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
                      <span style={{ width: 44, height: 44, borderRadius: "50%", background: `linear-gradient(180deg, #8E8E93, #636366)`, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 15, flexShrink: 0, fontFamily: SF }}>
                        {(l.avatar || (l.name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("")).toUpperCase()}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15.5, fontWeight: 600 }}>{l.name}</div>
                        <div style={{ fontSize: 13.5, color: INK2, overflow: "hidden", textOverflow: "ellipsis" }}>{l.username}</div>
                        {l.title && <div style={{ fontSize: 12.5, color: INK3 }}>{l.title}</div>}
                      </div>
                    </Glass>
                  </InView>
                ))}
              </div>
            )}
          </section>
        </div>
    </motion.div>
  );
}

const Glass = ({ children, style = {}, ...rest }) => (
  <div {...rest} style={{ background: "#fff", borderRadius: 22, boxShadow: "0 1px 2px rgba(0,0,0,0.03), 0 8px 28px -6px rgba(0,0,0,0.08)", ...style }}>{children}</div>
);

/** Fades and rises the first time it scrolls into view. */
function InView({ children, delay = 0, y = 26, style }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} style={style} initial={{ opacity: 0, y }} animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }} transition={{ ...SOFT, delay }}>{children}</motion.div>
  );
}

function SectionHead({ eyebrow, title, aside }) {
  return (
    <InView y={18} style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", margin: "64px 0 22px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", width: "100%" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: INK3, marginBottom: 6 }}>{eyebrow}</div>
          <h2 style={{ margin: 0, fontFamily: SF, fontWeight: 700, fontSize: "clamp(26px, 3.2vw, 38px)", letterSpacing: "-0.03em", lineHeight: 1.1 }}>{title}</h2>
        </div>
        {aside && <div style={{ marginLeft: "auto" }}>{aside}</div>}
      </div>
    </InView>
  );
}

const Shimmer = () => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px,100%),1fr))", gap: 16 }}>
    {[0, 1, 2, 3].map((i) => (
      <motion.div key={i} animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.12 }}
        style={{ height: 120, borderRadius: 22, background: "linear-gradient(90deg,#ececf0,#f5f5f7,#ececf0)" }} />
    ))}
  </div>
);

// ── one details card: an iOS grouped list that turns into its own form ──────
function Field({ field, value, error, onChange, autoFocus }) {
  const id = `bx-f-${useId()}`;
  const common = {
    id, value: value ?? "", autoFocus, placeholder: field.placeholder, className: "bx-input",
    onChange: (e) => onChange(field.upper ? e.target.value.toUpperCase() : e.target.value),
    "aria-invalid": !!error,
    style: {
      width: "100%", boxSizing: "border-box", padding: "10px 13px", borderRadius: 11, fontSize: 15, color: INK, background: "#F5F5F7",
      border: `1px solid ${error ? "rgba(227,0,0,0.55)" : "transparent"}`, fontFamily: field.code ? "'SF Mono', ui-monospace, monospace" : SFT,
      letterSpacing: field.code ? "0.03em" : 0, outline: "none",
    },
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <label htmlFor={id} style={{ display: "block", fontSize: 13, fontWeight: 500, color: INK2, marginBottom: 6 }}>
        {field.label}{field.required && <span style={{ color: RED }}> *</span>}
      </label>
      {field.multiline ? <textarea rows={3} {...common} style={{ ...common.style, resize: "vertical", lineHeight: 1.5 }} /> : <input {...common} />}
      <AnimatePresence>
        {error && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ fontSize: 12.5, color: RED, marginTop: 5, overflow: "hidden" }}>{error}</motion.div>}
      </AnimatePresence>
    </div>
  );
}

function CopyBtn({ text, label }) {
  const [ok, setOk] = useState(false);
  return (
    <motion.button type="button" aria-label={`Copy ${label}`} title={`Copy ${label}`} whileTap={{ scale: 0.88 }}
      onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1400); } catch { /* clipboard blocked */ } }}
      style={{ marginLeft: 8, width: 28, height: 28, borderRadius: "50%", border: "none", background: ok ? "rgba(48,199,89,0.14)" : FILL, color: ok ? GREEN : INK2,
        display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={ok ? "y" : "n"} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.15 }} style={{ display: "inline-flex" }}>
          {ok ? <Check size={14} strokeWidth={2.6} /> : <Copy size={13} />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

function Value({ field, value }) {
  if (!value) return <span style={{ color: INK3 }}>Not added</span>;
  if (field.key === "email") return <a href={`mailto:${value}`} className="bx-link">{value}</a>;
  if (field.key === "phone") return <a href={`tel:${value.replace(/\s+/g, "")}`} className="bx-link">{value}</a>;
  if (field.key === "website") return <a href={siteHref(value)} target="_blank" rel="noopener noreferrer" className="bx-link">{siteText(value)}</a>;
  return <span style={{ whiteSpace: field.multiline ? "pre-line" : "normal", fontFamily: field.code ? "'SF Mono', ui-monospace, monospace" : SFT, letterSpacing: field.code ? "0.04em" : 0 }}>{value}</span>;
}

function CardHead({ id, icon, title, sub, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 20px 14px" }}>
      <IconTile hue={ICON_HUE[id]} icon={icon} />
      <div style={{ minWidth: 0 }}>
        <h3 style={{ margin: 0, fontFamily: SF, fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</h3>
        {sub}
      </div>
      <div style={{ marginLeft: "auto" }}>{action}</div>
    </div>
  );
}
const TextBtn = ({ children, ...rest }) => (
  <motion.button type="button" whileTap={{ scale: 0.94 }} {...rest}
    style={{ background: "none", border: "none", color: LINK, fontFamily: SFT, fontSize: 15, cursor: "pointer", padding: "6px 4px", display: "inline-flex", alignItems: "center", gap: 4, ...rest.style }}>{children}</motion.button>
);

function DetailCard({ brand, section, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(null);
  const [flash, setFlash] = useState(false);
  const value = valueOf(brand, section);
  const filled = section.fields.filter((f) => value[f.key]).length;

  const start = () => { setDraft(value); setErrors({}); setFailed(null); setEditing(true); };
  const submit = async (e) => {
    e?.preventDefault();
    const errs = sectionErrors(section, draft);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true); setFailed(null);
    try { await onSave(sectionPatch(section, draft)); setEditing(false); setFlash(true); setTimeout(() => setFlash(false), 1600); }
    catch (err) { setFailed(errText(err)); }
    finally { setSaving(false); }
  };

  return (
    <motion.section layout transition={SOFT} data-testid={`brand-panel-${section.id}`} data-bx-editing={editing ? "1" : "0"}
      style={{ background: "#fff", borderRadius: 22, boxShadow: editing ? "0 0 0 2px rgba(0,113,227,0.35), 0 18px 40px -10px rgba(0,0,0,0.15)" : "0 1px 2px rgba(0,0,0,0.03), 0 8px 28px -6px rgba(0,0,0,0.08)", overflow: "hidden", height: "100%" }}>
      <CardHead id={section.id} icon={section.icon} title={section.title}
        sub={<div style={{ fontSize: 13, color: flash ? GREEN : filled === section.fields.length ? GREEN : INK3, display: "flex", alignItems: "center", gap: 4 }}>
          {flash ? <><Check size={13} strokeWidth={3} />Saved</> : `${filled} of ${section.fields.length} filled`}</div>}
        action={!editing && <TextBtn onClick={start} aria-label={`Edit ${section.title}`}>Edit</TextBtn>} />

      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.form key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            onSubmit={submit} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEditing(false); } }} noValidate style={{ padding: "2px 20px 20px" }}>
            {section.fields.map((f, i) => (
              <Field key={f.key} field={f} value={draft[f.key]} error={errors[f.key]} autoFocus={i === 0}
                onChange={(v) => { setDraft((d) => ({ ...d, [f.key]: v })); setErrors((x) => ({ ...x, [f.key]: undefined })); }} />
            ))}
            {failed && <div role="alert" style={{ fontSize: 13.5, color: RED, marginBottom: 12 }}>{failed}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Pill kind="plain" onClick={() => setEditing(false)} disabled={saving}>Cancel</Pill>
              <Pill kind="primary" type="submit" disabled={saving} onClick={submit}>{saving ? "Saving…" : "Save"}</Pill>
            </div>
          </motion.form>
        ) : (
          <motion.dl key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} style={{ margin: 0, padding: "0 0 6px 20px" }}>
            {section.fields.map((f, i) => (
              <div key={f.key} style={{ padding: "12px 20px 12px 0", borderTop: i ? `0.5px solid ${LINE}` : `0.5px solid ${LINE}` }}>
                <dt style={{ fontSize: 13, color: INK2, marginBottom: 3 }}>{f.label}</dt>
                <dd style={{ margin: 0, fontSize: 16, lineHeight: 1.45, display: "flex", alignItems: "center", wordBreak: "break-word" }}>
                  <Value field={f} value={value[f.key]} />
                  {f.code && value[f.key] && <CopyBtn text={value[f.key]} label={f.label} />}
                </dd>
              </div>
            ))}
          </motion.dl>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

// ── other contacts (POCs) ────────────────────────────────────────────────────
function ContactsCard({ brand, onSave }) {
  const pocs = brand.pocs || [];
  const [form, setForm] = useState(null);          // { index | null, value }
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const personSection = { fields: PERSON_FIELDS };

  const persist = async (next) => {
    setBusy(true); setFailed(null);
    try { await onSave({ pocs: next }); setForm(null); setConfirm(null); }
    catch (e) { setFailed(errText(e)); }
    finally { setBusy(false); }
  };
  const submit = (e) => {
    e?.preventDefault();
    const errs = sectionErrors(personSection, form.value);
    if (!String(form.value.name || "").trim()) errs.name = "Name is required";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const tidy = { ...form.value, ...Object.fromEntries(PERSON_FIELDS.map((f) => [f.key, String(form.value[f.key] || "").trim()])) };
    persist(form.index == null ? [...pocs, tidy] : pocs.map((p, i) => (i === form.index ? tidy : p)));
  };

  return (
    <motion.section layout transition={SOFT} data-testid="brand-panel-contacts" data-bx-editing={form ? "1" : "0"}
      style={{ background: "#fff", borderRadius: 22, boxShadow: form ? "0 0 0 2px rgba(0,113,227,0.35), 0 18px 40px -10px rgba(0,0,0,0.15)" : "0 1px 2px rgba(0,0,0,0.03), 0 8px 28px -6px rgba(0,0,0,0.08)", overflow: "hidden", height: "100%" }}>
      <CardHead id="contacts" icon={Users} title="Other contacts"
        sub={<div style={{ fontSize: 13, color: INK3 }}>{pocs.length ? plural(pocs.length, "person", "people") : "Anyone else we work with"}</div>}
        action={!form && <TextBtn onClick={() => { setForm({ index: null, value: {} }); setErrors({}); setFailed(null); }}><Plus size={16} />Add</TextBtn>} />

      <AnimatePresence mode="wait" initial={false}>
        {form ? (
          <motion.form key="f" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            onSubmit={submit} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setForm(null); } }} noValidate style={{ padding: "2px 20px 20px" }}>
            {PERSON_FIELDS.map((f, i) => (
              <Field key={f.key} field={{ ...f, required: f.key === "name" }} value={form.value[f.key]} error={errors[f.key]} autoFocus={i === 0}
                onChange={(v) => setForm((x) => ({ ...x, value: { ...x.value, [f.key]: v } }))} />
            ))}
            {failed && <div role="alert" style={{ fontSize: 13.5, color: RED, marginBottom: 12 }}>{failed}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Pill kind="plain" onClick={() => setForm(null)} disabled={busy}>Cancel</Pill>
              <Pill kind="primary" type="submit" disabled={busy} onClick={submit}>{busy ? "Saving…" : form.index == null ? "Add contact" : "Save"}</Pill>
            </div>
          </motion.form>
        ) : pocs.length === 0 ? (
          <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontSize: 15, color: INK3, padding: "4px 20px 22px" }}>No other contacts yet.</motion.div>
        ) : (
          <motion.ul key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ listStyle: "none", margin: 0, padding: "0 0 6px 20px" }}>
            <AnimatePresence initial={false}>
              {pocs.map((p, i) => (
                <motion.li key={p._id || i} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  style={{ borderTop: `0.5px solid ${LINE}`, padding: "12px 16px 12px 0", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(180deg,#A1A1A6,#7C7C80)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 14, flexShrink: 0 }}>
                      {(p.name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{p.name}</div>
                      {p.designation && <div style={{ fontSize: 13.5, color: INK2 }}>{p.designation}</div>}
                    </div>
                    <AnimatePresence mode="wait" initial={false}>
                      {confirm === i ? (
                        <motion.span key="c" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} style={{ display: "inline-flex", gap: 6 }}>
                          <Pill kind="danger" disabled={busy} onClick={() => persist(pocs.filter((_, j) => j !== i))} style={{ height: 30, fontSize: 13 }}>Remove</Pill>
                          <Pill kind="plain" onClick={() => setConfirm(null)} style={{ height: 30, fontSize: 13 }}>Keep</Pill>
                        </motion.span>
                      ) : (
                        <motion.span key="a" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: "inline-flex", gap: 4 }}>
                          <RoundIcon label={`Edit ${p.name}`} onClick={() => { setForm({ index: i, value: { ...p } }); setErrors({}); setFailed(null); }}><Pencil size={14} /></RoundIcon>
                          <RoundIcon label={`Remove ${p.name}`} danger onClick={() => setConfirm(i)}><Trash2 size={14} /></RoundIcon>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px", marginTop: 8, marginLeft: 50, fontSize: 14 }}>
                    {p.email && <a href={`mailto:${p.email}`} className="bx-link" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Mail size={14} />{p.email}</a>}
                    {p.phone && <a href={`tel:${p.phone.replace(/\s+/g, "")}`} className="bx-link" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Phone size={14} />{p.phone}</a>}
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
            {failed && <li role="alert" style={{ fontSize: 13.5, color: RED, padding: "8px 0" }}>{failed}</li>}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

const RoundIcon = ({ label, danger, children, ...rest }) => (
  <motion.button type="button" aria-label={label} title={label} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }} {...rest}
    style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: danger ? "rgba(227,0,0,0.08)" : FILL, color: danger ? RED : INK2, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>{children}</motion.button>
);

// ── headline figures ─────────────────────────────────────────────────────────
function Kpis({ fig }) {
  const tiles = [
    { label: "Campaigns", value: fig.campaigns, sub: `${fig.active} active · ${fig.completed} completed`, icon: Megaphone, hue: "#5E5CE6" },
    { label: "Creators", value: fig.creators, sub: `${fig.locked} locked in`, icon: Users, hue: "#30B0C7" },
    { label: "Total budget", value: fig.budget, fmt: inrUp, sub: fig.budgeted ? `across ${plural(fig.budgeted, "campaign")}` : "no budget agreed yet", icon: Wallet, hue: "#0A84FF" },
    { label: "Creator spend", value: fig.spend, fmt: inrUp, sub: fig.used != null ? `${fig.used}% of budget committed` : "committed to locked creators", icon: Receipt, hue: "#FF9F0A", ring: fig.used },
    { label: "Avg per creator", value: fig.perCreator, fmt: inrUp, sub: "spend ÷ locked creators", icon: UserRound, hue: "#BF5AF2" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: 16, marginBottom: 30 }}>
      {tiles.map((t, i) => (
        <InView key={t.label} delay={i * 0.06}>
          <motion.div whileHover={{ y: -4 }} transition={SPRING}
            style={{ background: "#fff", borderRadius: 22, padding: "18px 20px 20px", boxShadow: "0 1px 2px rgba(0,0,0,0.03), 0 8px 28px -6px rgba(0,0,0,0.08)", height: "100%", boxSizing: "border-box" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <IconTile hue={t.hue} icon={t.icon} size={28} />
              {t.ring != null && <Ring pct={t.ring} size={34} stroke={5} from="#FF9F0A" to="#FFD60A" label={`${t.ring}% of budget committed`} />}
            </div>
            <div style={{ fontFamily: SF, fontSize: 34, fontWeight: 700, letterSpacing: "-0.035em", marginTop: 14, lineHeight: 1 }}>
              <CountUp value={t.value ?? null} format={t.fmt} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>{t.label}</div>
            <div style={{ fontSize: 13, color: INK3, marginTop: 2 }}>{t.sub}</div>
          </motion.div>
        </InView>
      ))}
    </div>
  );
}

// ── one card per campaign ────────────────────────────────────────────────────
function CampaignCards({ camps, brand, campErr }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const active = camps.filter((c) => !isDone(c)), done = camps.filter(isDone);
  const shown = filter === "active" ? active : filter === "done" ? done : camps;

  if (!camps.length) {
    return (
      <Glass style={{ padding: "34px 28px", textAlign: "center" }}>
        <div style={{ fontFamily: SF, fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em" }}>{campErr ? "Campaigns couldn't load." : `${brand.name} has no campaigns yet.`}</div>
        {!campErr && <div style={{ marginTop: 16 }}><Pill kind="primary" icon={Plus} onClick={() => navigate(`/campaigns?new=1&brand=${encodeURIComponent(brand.id)}`)}>New campaign</Pill></div>}
      </Glass>
    );
  }
  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <Segmented label="Filter campaigns" value={filter} onChange={setFilter}
          options={[["all", `All ${camps.length}`], ["active", `Active ${active.length}`], ["done", `Completed ${done.length}`]]} />
      </div>
      <motion.div layout style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))", gap: 16 }}>
        <AnimatePresence mode="popLayout">
          {shown.map((c, i) => (
            <CampaignCard key={c.id} c={c} index={i}
              onOpen={() => navigate(`/campaigns?open=${encodeURIComponent(c.id)}&brand=${encodeURIComponent(c.brandId || brand.id)}`)} />
          ))}
        </AnimatePresence>
      </motion.div>
      {shown.length === 0 && <Glass style={{ padding: 24, fontSize: 15, color: INK2 }}>Nothing here.</Glass>}
    </>
  );
}

function CampaignCard({ c, index, onOpen }) {
  const f = campaignFigures(c);
  const finished = isDone(c);
  const used = f.budget ? Math.round((f.spend / f.budget) * 100) : null;
  const start = fmtDay(c.start), end = fmtDay(c.end);
  return (
    <motion.button type="button" layout onClick={onOpen} aria-label={`Open campaign ${c.name}`} data-testid={`brand-campaign-${c.id}`}
      initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ ...SOFT, delay: Math.min(index, 8) * 0.05 }}
      whileHover={{ y: -5, boxShadow: "0 24px 48px -12px rgba(0,0,0,0.18)" }} whileTap={{ scale: 0.985 }}
      style={{ background: "#fff", border: "none", borderRadius: 22, padding: "20px 20px 18px", textAlign: "left", cursor: "pointer", fontFamily: SFT, color: INK,
        display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.03), 0 8px 28px -6px rgba(0,0,0,0.08)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 980,
            color: finished ? GREEN : "#5E5CE6", background: finished ? "rgba(48,199,89,0.12)" : "rgba(94,92,230,0.10)" }}>{finished && <Check size={12} strokeWidth={3} />}{stageLabel(c.stage)}</span>
          <div style={{ fontFamily: SF, fontSize: 19, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.25, marginTop: 8, overflowWrap: "anywhere" }}>{c.name || "Untitled campaign"}</div>
          <div style={{ fontSize: 13.5, color: INK3, marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
            <CalendarDays size={13} />{start ? `${start}${end ? ` – ${end}` : ""}` : "No dates yet"}
          </div>
        </div>
        <Ring pct={f.pct} size={62} stroke={7} label={`Delivery ${f.pct}%`} from={f.pct === 100 ? "#30D158" : "#32D74B"} to={f.pct === 100 ? "#A3F07A" : "#64D2FF"}>
          <div style={{ textAlign: "center", lineHeight: 1 }}>
            <div style={{ fontFamily: SF, fontSize: 15, fontWeight: 700 }} className="num">{f.pct}<span style={{ fontSize: 10 }}>%</span></div>
          </div>
        </Ring>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", borderRadius: 14, background: "#F5F5F7", padding: "12px 4px" }}>
        {[["Creators", f.creators, `${f.locked} locked`], ["Budget", fmtINR(f.budget), f.budget == null ? "not agreed" : "total"], ["Spend", fmtINR(f.spend), used != null ? `${used}% of budget` : "committed"]].map(([k, v, sub], i) => (
          <div key={k} style={{ textAlign: "center", borderLeft: i ? `0.5px solid ${LINE}` : "none", minWidth: 0, padding: "0 6px" }}>
            <div style={{ fontSize: 12, color: INK3 }}>{k}</div>
            <div style={{ fontFamily: SF, fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }} className="num">{v}</div>
            <div style={{ fontSize: 11.5, color: INK3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
          </div>
        ))}
      </div>

      {used != null && (
        <div>
          <div style={{ height: 6, borderRadius: 99, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, used)}%` }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              style={{ height: "100%", borderRadius: 99, background: used > 100 ? RED : `linear-gradient(90deg, ${C_SPEND}, #FF9F0A)` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: INK3, marginTop: 6 }}><span>Budget used</span><span className="num">{used}%</span></div>
        </div>
      )}
      <div style={{ fontSize: 14, color: LINK, display: "inline-flex", alignItems: "center", gap: 2, marginTop: "auto" }}>Open campaign <ChevronRight size={15} /></div>
    </motion.button>
  );
}

// ── charts — drawn when they scroll into view ───────────────────────────────
const axisTick = { fontSize: 12.5, fill: INK3, fontFamily: SFT };
const shortName = (s, n = 18) => (String(s || "").length > n ? `${String(s).slice(0, n - 1)}…` : String(s || "Untitled"));

function ChartTip({ active, payload, label, money = true }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(255,255,255,0.86)", backdropFilter: "saturate(180%) blur(20px)", WebkitBackdropFilter: "saturate(180%) blur(20px)", borderRadius: 14,
      boxShadow: "0 12px 34px rgba(0,0,0,0.16), inset 0 0 0 0.5px rgba(0,0,0,0.06)", padding: "12px 14px", fontSize: 13.5, minWidth: 180, fontFamily: SFT }}>
      <div style={{ fontWeight: 600, color: INK, marginBottom: 8 }}>{payload[0]?.payload?.full || label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 8, color: INK2, padding: "2px 0" }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, flexShrink: 0 }} />
          <span>{p.name}</span>
          <span style={{ marginLeft: "auto", color: INK, fontWeight: 600 }} className="num">{money ? fmtINR(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, sub, children, height, delay = 0 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.section ref={ref} initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }} transition={{ ...SOFT, delay }}
      style={{ background: "#fff", borderRadius: 24, padding: "22px 22px 14px", minWidth: 0, boxShadow: "0 1px 2px rgba(0,0,0,0.03), 0 8px 28px -6px rgba(0,0,0,0.08)" }}>
      <h3 style={{ margin: 0, fontFamily: SF, fontSize: 19, fontWeight: 600, letterSpacing: "-0.015em" }}>{title}</h3>
      {sub && <div style={{ fontSize: 14, color: INK3, marginTop: 4, marginBottom: 10 }}>{sub}</div>}
      <div style={{ width: "100%", height }}>{inView ? children : null}</div>
    </motion.section>
  );
}

const legendFmt = (v) => <span style={{ color: INK2, fontSize: 13.5, fontFamily: SFT }}>{v}</span>;
const ANIM = { isAnimationActive: true, animationDuration: 1100, animationEasing: "ease-out" };

function Charts({ camps }) {
  const narrow = typeof window !== "undefined" && window.innerWidth < 640;
  const perCamp = camps.slice(0, 8).map((c) => {
    const f = campaignFigures(c);
    return { name: shortName(c.name, narrow ? 14 : 26), full: c.name, budget: f.budget || 0, spend: f.spend };
  });

  const byMonth = new Map();
  for (const c of camps) {
    const t = Date.parse(c.start ? `${String(c.start).slice(0, 10)}T00:00:00` : "") || createdAtOf(c);
    if (!t) continue;
    const d = new Date(t), key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const row = byMonth.get(key) || { key, name: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), spend: 0 };
    row.spend += campaignFigures(c).spend;
    byMonth.set(key, row);
  }
  const months = [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-12);

  const seen = new Set(), plat = new Map();
  for (const c of camps) for (const cr of c.creators || []) {
    const p = platformLabel(cr.platform) || "Other", k = `${creatorKeyOf(cr)}|${p}`;
    if (!creatorKeyOf(cr) || seen.has(k)) continue;
    seen.add(k); plat.set(p, (plat.get(p) || 0) + 1);
  }
  const platforms = [...plat.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const anyMoney = perCamp.some((r) => r.budget || r.spend);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <ChartCard title="Budget vs creator spend" sub={camps.length > 8 ? "The latest 8 campaigns" : "Each campaign's agreed budget beside what's committed to its locked creators"} height={anyMoney ? 60 + perCamp.length * 50 : 120}>
        {anyMoney ? (
          <ResponsiveContainer>
            <BarChart data={perCamp} layout="vertical" margin={{ top: 8, right: 70, bottom: 4, left: 8 }} barGap={3} barCategoryGap="24%">
              <CartesianGrid horizontal={false} stroke="rgba(0,0,0,0.06)" />
              <XAxis type="number" tick={axisTick} tickFormatter={fmtINR} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ ...axisTick, fill: INK }} width={narrow ? 104 : 196} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(0,0,0,0.035)", radius: 8 }} />
              <Legend verticalAlign="top" align="left" height={34} iconType="circle" iconSize={10} formatter={legendFmt} />
              <Bar dataKey="budget" name="Budget" fill={C_BUDGET} radius={[0, 6, 6, 0]} maxBarSize={14} {...ANIM} />
              <Bar dataKey="spend" name="Creator spend" fill={C_SPEND} radius={[0, 6, 6, 0]} maxBarSize={14} {...ANIM} animationBegin={150}>
                <LabelList dataKey="spend" position="right" formatter={(v) => (v ? fmtINR(v) : "")} style={{ fontSize: 12.5, fill: INK2, fontFamily: SFT }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <Empty>No budgets or creator fees on these campaigns yet.</Empty>}
      </ChartCard>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))", gap: 18 }}>
        <ChartCard title="Spend by month" sub="Creator spend, by the month each campaign started" height={270}>
          {months.some((m) => m.spend) ? (
            <ResponsiveContainer>
              <BarChart data={months} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="bxSpend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FF9F0A" /><stop offset="100%" stopColor={C_SPEND} /></linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} tickFormatter={fmtINR} axisLine={false} tickLine={false} width={64} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(0,0,0,0.035)", radius: 8 }} />
                <Bar dataKey="spend" name="Creator spend" fill="url(#bxSpend)" radius={[8, 8, 3, 3]} maxBarSize={40} {...ANIM} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty>No creator spend yet.</Empty>}
        </ChartCard>

        <ChartCard title="Creators by platform" sub="Every creator on this brand's campaigns, counted once" height={Math.max(170, 40 + platforms.length * 44)} delay={0.08}>
          {platforms.length ? (
            <ResponsiveContainer>
              <BarChart data={platforms} layout="vertical" margin={{ top: 4, right: 44, bottom: 0, left: 8 }} barCategoryGap="28%">
                <CartesianGrid horizontal={false} stroke="rgba(0,0,0,0.06)" />
                <XAxis type="number" allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ ...axisTick, fill: INK }} width={100} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip money={false} />} cursor={{ fill: "rgba(0,0,0,0.035)", radius: 8 }} />
                <Bar dataKey="count" name="Creators" fill={C_CREATORS} radius={[0, 8, 8, 0]} maxBarSize={20} {...ANIM}>
                  <LabelList dataKey="count" position="right" style={{ fontSize: 13.5, fill: INK, fontWeight: 600, fontFamily: SF }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty>No creators on these campaigns yet.</Empty>}
        </ChartCard>
      </div>
    </div>
  );
}

const Empty = ({ children }) => <div style={{ padding: "34px 8px", fontSize: 15, color: INK3, textAlign: "center" }}>{children}</div>;
