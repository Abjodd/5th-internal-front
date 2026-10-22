/**
 * 5th Avenue — Managed Creators → Summary
 * ─────────────────────────────────────────────────────────────────
 * The managed roster's dashboard. Every figure is derived from the two
 * feeds the other tabs already hold (`creators`, `deals`), so this tab can
 * never disagree with Campaigns or Assets about a total.
 *
 *   Hero          combined audience of the roster + real creator photos
 *   KPI cards     live reels, deals, client spend, internal cost, margin —
 *                 each with a sparkline from the same six real months
 *   Money flow    client vs internal cost per month (one axis, one unit)
 *   Status        Live / Draft / Needs attention — DERIVED from each deal's
 *                 reel link and fetch result (see fx.jsx dealStatus)
 *   Leaderboard   creators ranked by what brands paid for their deals
 *   Brand wall    brands by share of client spend, with logos
 *   Spotlight     the best real reel, playable on hover
 *   Activity      real events from createdAt / fetchedAt — no invented
 *                 "upcoming" items, this app tracks no due dates
 *   Latest reels  a rail of the newest fetched reels
 *
 * Colour: one fixed hue per metric (fx.jsx MONEY) on every chart here and
 * on the Campaigns/Assets tabs.
 */
import { useMemo, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import {
  Handshake, IndianRupee, Coins, TrendingUp, TrendingDown, Eye, Heart, MessageCircle, Share2,
  Crown, Trophy, ArrowUpRight, Sparkles, Plus, RefreshCw,
} from "lucide-react";
import { T } from "../../theme/tokens";
import { fmtINR, fmtCompact } from "../../lib/format";
import { Notice } from "../Creators/shared";
import CreatorAvatar from "../../components/CreatorAvatar";
import BrandLogo from "../../components/BrandLogo";
import {
  DARK_SURFACE, MONEY, FX_CSS, STATUS_COLOR, STATUS_LABEL, CountUp, Reveal, ReelMedia, SectionTitle, LinkBtn,
  StatusPill, card, dealStatus, parseFollowersLoose, relativeDay, reelHref, useMounted,
} from "./fx";

const compact = (n) => fmtCompact(Math.round(n));
const inr = (n) => fmtINR(Math.round(n));

// ── HERO ─────────────────────────────────────────────────────────────────────
// Five fixed slots for the photo collage; filled by the top creators by
// reach, so every face here is a real managed creator.
const COLLAGE = [
  { left: 98,  top: 4,   size: 120, r: "4deg",  z: 5, delay: "0s" },
  { left: 0,   top: 44,  size: 94,  r: "-8deg", z: 4, delay: "-1.4s" },
  { left: 206, top: 52,  size: 96,  r: "9deg",  z: 3, delay: "-2.8s" },
  { left: 40,  top: 156, size: 70,  r: "6deg",  z: 2, delay: "-4.1s" },
  { left: 196, top: 164, size: 66,  r: "-5deg", z: 1, delay: "-3.3s" },
];

function Hero({ user, creators, totalFollowers, totalViews, avgER, live, deals, brands }) {
  const firstName = user?.name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const faces = [...creators].sort((a, b) => parseFollowersLoose(b.followers) - parseFollowersLoose(a.followers)).slice(0, COLLAGE.length);

  const glow = [
    ["Reel views", totalViews, compact],
    ["Avg engagement", avgER, (n) => `${n.toFixed(1)}%`],
    ["Brand deals", deals, (n) => Math.round(n)],
  ];

  return (
    <Reveal style={{
      position: "relative", overflow: "hidden", borderRadius: 20, background: DARK_SURFACE, color: "#FFF",
      padding: "30px 34px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 28,
    }}>
      {/* soft colour fields behind everything */}
      <div aria-hidden style={{ position: "absolute", right: -80, top: -120, width: 420, height: 420, borderRadius: "50%", background: `radial-gradient(circle, ${T.purple}55, transparent 65%)`, pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "absolute", left: "30%", bottom: -180, width: 380, height: 380, borderRadius: "50%", background: `radial-gradient(circle, ${T.pink}40, transparent 65%)`, pointerEvents: "none" }} />

      <div style={{ position: "relative", flex: "1 1 360px", minWidth: 280 }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
          <span>{greeting}, {firstName}</span>
          {live > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 20, background: "rgba(30,158,90,0.18)", border: "1px solid rgba(30,158,90,0.35)", fontSize: 10.5, color: "#B9F0CF" }}>
              <span className="fx-live" style={{ width: 6, height: 6, borderRadius: "50%", background: T.green }} />
              {live} reel{live === 1 ? "" : "s"} live
            </span>
          )}
        </div>

        <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginTop: 22 }}>
          Combined audience
        </div>
        <div style={{
          fontSize: 64, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.03em", marginTop: 6,
          background: "linear-gradient(95deg, #FFFFFF 10%, #F1CDEB 55%, #C8BBFF 95%)",
          WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
        }}>
          <CountUp value={totalFollowers} format={compact} duration={1400} />
        </div>
        <div style={{ fontFamily: "'Newsreader',serif", fontStyle: "italic", fontSize: 19, color: "rgba(255,255,255,0.82)", marginTop: 8 }}>
          across {creators.length} creator{creators.length === 1 ? "" : "s"} we manage directly.
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 0, marginTop: 24 }}>
          {glow.map(([label, value, fmt], i) => (
            <div key={label} style={{ padding: "0 22px", paddingLeft: i === 0 ? 0 : 22, borderLeft: i === 0 ? "none" : "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>
                {value == null ? "—" : <CountUp value={value} format={fmt} />}
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>

        {brands.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginBottom: 9 }}>
              Brands on deals
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              {brands.slice(0, 8).map((b, i) => (
                <div key={b.name} title={b.name} style={{
                  marginLeft: i ? -9 : 0, position: "relative", zIndex: 20 - i, borderRadius: "50%", padding: 2.5,
                  background: "#FFF", boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
                }}>
                  <BrandLogo brand={b.name} website={b.website} size={38} />
                </div>
              ))}
              {brands.length > 8 && (
                <div style={{ marginLeft: -9, width: 43, height: 43, borderRadius: "50%", background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#FFF", backdropFilter: "blur(6px)" }}>
                  +{brands.length - 8}
                </div>
              )}
              <span style={{ marginLeft: 14, fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
                {brands.length} brand{brands.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        )}
      </div>

      {faces.length > 0 && (
        <div style={{ position: "relative", width: 310, height: 240, flexShrink: 0 }}>
          {faces.map((c, i) => {
            const s = COLLAGE[i];
            return (
              <div key={c.id} className="fx-float" title={c.name} style={{
                position: "absolute", left: s.left, top: s.top, zIndex: s.z, "--r": s.r, animationDelay: s.delay,
                background: "#FFF", padding: 5, borderRadius: 14, boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
              }}>
                <CreatorAvatar creator={c} size={s.size} radius={10} />
              </div>
            );
          })}
        </div>
      )}
    </Reveal>
  );
}

// ── HEADLINE PANELS ──────────────────────────────────────────────────────────
// Two panels instead of five sparkline cards. The sparklines read badly on a
// young roster (five empty months, then one spike); the month-by-month view
// lives in Money flow below, where it has room to make sense.
function Ring({ pct, color, size = 46 }) {
  const mounted = useMounted();
  const R = size / 2 - 5, C = 2 * Math.PI * R, len = Math.max(0, Math.min(100, pct)) / 100 * C;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={T.mute} strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
        strokeDasharray={`${mounted ? len : 0} ${C}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 1.1s cubic-bezier(.2,.7,.2,1)" }} />
      <text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle" fontSize={size > 50 ? 13 : 10.5} fontWeight="700" fill={T.text} fontFamily="'Sora'">{Math.round(pct)}%</text>
    </svg>
  );
}

const PanelLabel = ({ icon: Icon, color, children, right }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
    <div style={{ width: 30, height: 30, borderRadius: 9, background: `${color}16`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon size={14} color={color} strokeWidth={2.2} />
    </div>
    <span style={{ fontSize: 10, fontWeight: 600, color: T.sub, textTransform: "uppercase", letterSpacing: "0.07em", flex: 1 }}>{children}</span>
    {right}
  </div>
);

function PipelinePanel({ i, counts, total, trend }) {
  const mounted = useMounted();
  const segs = ["live", "draft", "attention"].map(k => ({ key: k, value: counts[k], color: STATUS_COLOR[k] }));
  return (
    <Reveal i={i} style={{ ...card, flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
      <PanelLabel icon={Handshake} color={T.teal} right={trend != null && (
        <span title="Deals logged in the last 30 days vs. the 30 before" style={{ fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 20, color: trend >= 0 ? T.green : T.red, background: `${trend >= 0 ? T.green : T.red}14` }}>
          {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}% · 30d
        </span>
      )}>Deal pipeline</PanelLabel>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 44, fontWeight: 700, color: T.text, letterSpacing: "-0.03em", lineHeight: 1 }}><CountUp value={total} /></span>
        <span style={{ fontSize: 12, color: T.sub }}>brand deal{total === 1 ? "" : "s"}</span>
      </div>

      <div>
        <div style={{ display: "flex", gap: 3, height: 10, borderRadius: 5, overflow: "hidden", background: T.mute }}>
          {total > 0 && segs.filter(s => s.value > 0).map((s, k) => (
            <div key={s.key} className="fx-bar" style={{ width: mounted ? `${(s.value / total) * 100}%` : 0, background: s.color, borderRadius: 5, transitionDelay: `${k * 0.1}s` }} />
          ))}
        </div>
        <div style={{ display: "flex", marginTop: 12 }}>
          {segs.map((s, k) => (
            <div key={s.key} style={{ flex: 1, minWidth: 0, paddingLeft: k ? 12 : 0, borderLeft: k ? `1px solid ${T.border}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9.5, color: T.sub, whiteSpace: "nowrap" }}>
                <span className={s.key === "live" && s.value ? "fx-live" : undefined} style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                {STATUS_LABEL[s.key]}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.value ? T.text : T.label, marginTop: 3 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

function MoneyPanel({ i, client, internal, margin, marginPct }) {
  const mounted = useMounted();
  const loss = margin < 0;
  const internalShare = client > 0 ? Math.min(100, (internal / client) * 100) : 0;
  const cols = [
    { icon: IndianRupee, color: MONEY.client, label: "Client spend", value: client, sub: "paid by brands" },
    { icon: Coins, color: MONEY.internal, label: "Paid to creators", value: internal, sub: client > 0 ? `${Math.round(internalShare)}% of spend` : "—" },
    { icon: loss ? TrendingDown : TrendingUp, color: loss ? MONEY.loss : MONEY.margin, label: "Margin", value: margin, sub: marginPct != null ? `${Math.round(marginPct)}% of spend` : "—", ring: true },
  ];
  return (
    <Reveal i={i} style={{ ...card, flex: "2.3 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 0" }}>
        {cols.map((c, k) => (
          <div key={c.label} style={{ flex: "1 1 160px", minWidth: 0, padding: k ? "0 0 0 20px" : "0 20px 0 0", borderLeft: k ? `1px solid ${T.border}` : "none", display: "flex", flexDirection: "column", gap: 12 }}>
            <PanelLabel icon={c.icon} color={c.color}>{c.label}</PanelLabel>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 30, fontWeight: 700, color: c.ring ? c.color : T.text, letterSpacing: "-0.025em", lineHeight: 1.05, whiteSpace: "nowrap" }}>
                  <CountUp value={c.value} format={inr} />
                </div>
                <div style={{ fontSize: 10.5, color: T.sub, marginTop: 5 }}>{c.sub}</div>
              </div>
              {c.ring && marginPct != null && marginPct >= 0 && <Ring pct={marginPct} color={c.color} size={54} />}
            </div>
          </div>
        ))}
      </div>

      <div>
        <div style={{ display: "flex", gap: 3, height: 12, borderRadius: 6, overflow: "hidden", background: T.mute }}>
          {client > 0 && <>
            <div className="fx-bar" style={{ width: mounted ? `${loss ? 100 : internalShare}%` : 0, background: loss ? MONEY.loss : MONEY.internal, borderRadius: 6 }} />
            {!loss && <div className="fx-bar" style={{ width: mounted ? `${100 - internalShare}%` : 0, background: MONEY.margin, borderRadius: 6, transitionDelay: ".12s" }} />}
          </>}
        </div>
        <div style={{ fontSize: 10.5, color: T.sub, marginTop: 8 }}>
          {client === 0
            ? "No client spend logged yet."
            : loss
              ? "Running at a loss — creators are being paid more than brands paid us."
              : <>Of every ₹100 a brand pays, <b style={{ color: MONEY.internal }}>₹{Math.round(internalShare)}</b> goes to the creator and <b style={{ color: T.green }}>₹{100 - Math.round(internalShare)}</b> is margin.</>}
        </div>
      </div>
    </Reveal>
  );
}

// ── MONEY FLOW ───────────────────────────────────────────────────────────────
function MoneyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const margin = row.clientCost - row.internalCost;
  return (
    <div style={{ background: "rgba(20,21,26,0.94)", color: "#FFF", borderRadius: 10, padding: "10px 12px", fontSize: 11, boxShadow: T.shadowLg, minWidth: 160 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {[["Client cost", row.clientCost, MONEY.client], ["Internal cost", row.internalCost, MONEY.internal]].map(([l, v, c]) => (
        <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 14, marginTop: 3 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.7)" }}><span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{l}</span>
          <span style={{ fontWeight: 600 }}>{fmtINR(v)}</span>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
        <span style={{ color: "rgba(255,255,255,0.7)" }}>Margin</span>
        <span style={{ fontWeight: 700, color: margin >= 0 ? "#7FE0A8" : "#F4A0A0" }}>{fmtINR(margin)}</span>
      </div>
    </div>
  );
}

function MoneyFlow({ monthly }) {
  const sumClient = monthly.reduce((s, m) => s + m.clientCost, 0);
  const sumInternal = monthly.reduce((s, m) => s + m.internalCost, 0);
  const empty = sumClient === 0 && sumInternal === 0;
  return (
    <>
      <SectionTitle sub="Last 6 months, by month a deal was logged" action={
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {[["Client cost", sumClient, MONEY.client], ["Internal cost", sumInternal, MONEY.internal]].map(([l, v, c]) => (
            <div key={l} style={{ textAlign: "right" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", fontSize: 9.5, color: T.sub }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{l}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{fmtINR(v)}</div>
            </div>
          ))}
        </div>
      }>Money flow</SectionTitle>
      {empty ? <Notice tone="empty">No deals in the last six months.</Notice> : (
        <ResponsiveContainer width="100%" height={230}>
          <AreaChart data={monthly} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mf-client" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={MONEY.client} stopOpacity={0.32} />
                <stop offset="100%" stopColor={MONEY.client} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="mf-internal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={MONEY.internal} stopOpacity={0.3} />
                <stop offset="100%" stopColor={MONEY.internal} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={T.border} strokeDasharray="3 4" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: T.sub }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: T.label }} axisLine={false} tickLine={false} width={58} tickFormatter={(v) => fmtINR(v)} />
            <Tooltip content={<MoneyTooltip />} cursor={{ stroke: T.borderMid, strokeDasharray: "3 3" }} />
            <Area type="monotone" dataKey="clientCost" stroke={MONEY.client} strokeWidth={2.2} fill="url(#mf-client)" dot={false}
              activeDot={{ r: 4.5, stroke: "#FFF", strokeWidth: 2 }} animationDuration={1100} />
            <Area type="monotone" dataKey="internalCost" stroke={MONEY.internal} strokeWidth={2.2} fill="url(#mf-internal)" dot={false}
              activeDot={{ r: 4.5, stroke: "#FFF", strokeWidth: 2 }} animationDuration={1100} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </>
  );
}

// ── STATUS ───────────────────────────────────────────────────────────────────
function StatusPanel({ counts, total }) {
  const mounted = useMounted();
  const SIZE = 168, R = 64, STROKE = 18, C = 2 * Math.PI * R, GAP = total > 1 ? 4 : 0;
  const slices = ["live", "draft", "attention"].map(k => ({ key: k, value: counts[k], color: STATUS_COLOR[k] }));
  let acc = 0;
  return (
    <>
      <SectionTitle sub="Derived from each deal's reel link">Campaign status</SectionTitle>
      {total === 0 ? <Notice tone="empty">No deals logged yet.</Notice> : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <svg width={SIZE} height={SIZE}>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={T.mute} strokeWidth={STROKE} />
            {slices.filter(s => s.value > 0).map(s => {
              const frac = s.value / total, len = Math.max(0, frac * C - GAP);
              const el = (
                <circle key={s.key} cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={s.color} strokeWidth={STROKE}
                  strokeDasharray={`${mounted ? len : 0} ${C}`} strokeDashoffset={-acc} strokeLinecap="butt"
                  transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`} style={{ transition: "stroke-dasharray 1s cubic-bezier(.2,.7,.2,1)" }} />
              );
              acc += frac * C;
              return el;
            })}
            <text x="50%" y="47%" textAnchor="middle" fontSize="30" fontWeight="700" fill={T.text} fontFamily="'Sora'">{total}</text>
            <text x="50%" y="60%" textAnchor="middle" fontSize="8.5" fill={T.label} fontFamily="'Sora'" letterSpacing="1">DEALS</text>
          </svg>
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
            {slices.map(s => (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                <span style={{ color: T.sub, flex: 1 }}>{STATUS_LABEL[s.key]}</span>
                <span style={{ fontWeight: 700, color: T.text }}>{s.value}</span>
                <span style={{ color: T.label, width: 34, textAlign: "right" }}>{Math.round((s.value / total) * 100)}%</span>
              </div>
            ))}
            <div style={{ fontSize: 9.5, color: T.label, lineHeight: 1.5, marginTop: 2 }}>
              Draft = no reel link yet · Needs attention = the link couldn't be fetched.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── LEADERBOARD ──────────────────────────────────────────────────────────────
function Leaderboard({ rows }) {
  const mounted = useMounted();
  const max = Math.max(1, ...rows.map(r => r.clientCost));
  return (
    <>
      <SectionTitle sub="Ranked by what brands paid for their deals" action={
        <div style={{ display: "flex", gap: 10, fontSize: 9.5, color: T.sub }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: MONEY.client }} />Client cost</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: MONEY.internal }} />Paid to creator</span>
        </div>
      }>Creator leaderboard</SectionTitle>
      {rows.length === 0 ? <Notice tone="empty">No deals logged yet.</Notice> : rows.map((r, i) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? `1px solid ${T.border}` : "none" }}>
          <div style={{ width: 22, textAlign: "center", flexShrink: 0 }}>
            {i === 0 ? <Crown size={16} color={T.gold} fill={`${T.gold}40`} /> : <span style={{ fontSize: 11, fontWeight: 700, color: T.label }}>{i + 1}</span>}
          </div>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <CreatorAvatar creator={r.creator} size={38} radius={19} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
              <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
                {r.brandList.slice(0, 3).map((b, k) => (
                  <span key={b.name} title={b.name} style={{ marginLeft: k ? -5 : 0, position: "relative", zIndex: 5 - k, borderRadius: "50%", boxShadow: `0 0 0 1.5px ${T.surface}` }}>
                    <BrandLogo brand={b.name} website={b.website} size={18} />
                  </span>
                ))}
                {r.brandList.length > 3 && <span style={{ marginLeft: 4, fontSize: 9, color: T.label }}>+{r.brandList.length - 3}</span>}
              </span>
              <span style={{ fontSize: 9.5, color: T.label, whiteSpace: "nowrap" }}>{r.deals} deal{r.deals === 1 ? "" : "s"}{r.views ? ` · ${fmtCompact(r.views)} views` : ""}</span>
            </div>
            <div style={{ position: "relative", height: 8, borderRadius: 4, background: T.mute, overflow: "hidden" }}>
              <div className="fx-bar" style={{ position: "absolute", inset: 0, width: mounted ? `${(r.clientCost / max) * 100}%` : 0, background: MONEY.client, borderRadius: 4 }} />
              <div className="fx-bar" style={{ position: "absolute", inset: 0, width: mounted ? `${(Math.min(r.internalCost, r.clientCost || r.internalCost) / max) * 100}%` : 0, background: MONEY.internal, borderRadius: 4, transitionDelay: ".15s" }} />
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0, minWidth: 70 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{fmtINR(r.clientCost)}</div>
            <div style={{ fontSize: 9.5, fontWeight: 600, color: r.clientCost - r.internalCost >= 0 ? T.green : T.red }}>
              {r.clientCost - r.internalCost >= 0 ? "+" : ""}{fmtINR(r.clientCost - r.internalCost)}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

// ── BRAND WALL ───────────────────────────────────────────────────────────────
function BrandWall({ brands, total }) {
  const mounted = useMounted();
  return (
    <>
      <SectionTitle sub="Share of client spend, all-time">Brand wall</SectionTitle>
      {brands.length === 0 ? <Notice tone="empty">No brands yet.</Notice> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
          {brands.map((b, i) => {
            const share = total > 0 ? (b.clientCost / total) * 100 : 0;
            return (
              <div key={b.name} className="fx-lift" style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 12px 11px", background: i === 0 ? `linear-gradient(160deg, ${MONEY.client}10, transparent 70%)` : T.surface }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <BrandLogo brand={b.name} website={b.website} size={34} radius={9} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</div>
                    <div style={{ fontSize: 9, color: T.label }}>{b.deals} deal{b.deals === 1 ? "" : "s"}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 10 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>{fmtINR(b.clientCost)}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 600, color: T.sub }}>{Math.round(share)}%</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: T.mute, marginTop: 5, overflow: "hidden" }}>
                  <div className="fx-bar" style={{ height: "100%", width: mounted ? `${share}%` : 0, background: MONEY.client, borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── SPOTLIGHT ────────────────────────────────────────────────────────────────
function Spotlight({ deal, creator }) {
  const [hover, setHover] = useState(false);
  const m = deal.media?.ok ? deal.media : null;
  const href = reelHref(deal);
  const stats = [
    [Eye, "Views", m?.views], [Heart, "Likes", m?.likes], [MessageCircle, "Comments", m?.comments], [Share2, "Shares", m?.forwards],
  ];
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ borderRadius: 18, overflow: "hidden", background: DARK_SURFACE, color: "#FFF", display: "flex", flexWrap: "wrap", height: "100%" }}>
      <a href={href || undefined} target="_blank" rel="noreferrer" className="fx-zoom"
        style={{ position: "relative", width: 190, flexShrink: 0, display: "block", minHeight: 300 }}>
        <ReelMedia deal={deal} hovered={hover} fill />
        <div style={{ position: "absolute", left: 10, top: 10 }}><StatusPill status={dealStatus(deal)} onDark /></div>
      </a>
      <div style={{ flex: "1 1 220px", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "#F3D98B" }}>
          <Trophy size={13} /> Top performing reel
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CreatorAvatar creator={creator || { name: deal.creatorName }} size={34} radius={17} />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>×</span>
          {deal.brand && <BrandLogo brand={deal.brand} website={deal.brandWebsite} size={34} radius={9} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{deal.creatorName || "—"}</div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.6)" }}>for {deal.brand || "—"}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {stats.map(([Icon, label, v]) => (
            <div key={label} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "9px 11px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.08em" }}><Icon size={11} /> {label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 3 }}>{v != null ? <CountUp value={v} format={compact} /> : "—"}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 11, color: "rgba(255,255,255,0.7)", flexWrap: "wrap" }}>
          {m?.er != null && <span>ER <b style={{ color: "#FFF" }}>{m.er}%</b></span>}
          <span>Margin <b style={{ color: (deal.budget || 0) - (deal.internalCost || 0) >= 0 ? "#7FE0A8" : "#F4A0A0" }}>{fmtINR((deal.budget || 0) - (deal.internalCost || 0))}</b></span>
        </div>
        {m?.caption && (
          <div style={{ fontFamily: "'Newsreader',serif", fontStyle: "italic", fontSize: 13, lineHeight: 1.45, color: "rgba(255,255,255,0.72)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          “{m.caption}”
          </div>
        )}
        {href && (
          <a href={href} target="_blank" rel="noreferrer" style={{ marginTop: "auto", alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "#14151A", background: "#FFF", padding: "8px 14px", borderRadius: 20, textDecoration: "none" }}>
            Open reel <ArrowUpRight size={13} />
          </a>
        )}
      </div>
    </div>
  );
}

// ── ACTIVITY ─────────────────────────────────────────────────────────────────
const EVENT_STYLE = {
  added: { color: T.teal, icon: Plus, label: "New deal" },
  synced: { color: T.purple, icon: RefreshCw, label: "Reel synced" },
};
function ActivityFeed({ events }) {
  return (
    <>
      <SectionTitle sub="Deals logged and reels synced">Recent activity</SectionTitle>
      {events.length === 0 ? <Notice tone="empty">Nothing logged yet.</Notice> : (
        <div style={{ position: "relative" }}>
          <div aria-hidden style={{ position: "absolute", left: 16, top: 10, bottom: 10, width: 2, background: T.mute, borderRadius: 1 }} />
          {events.map(e => {
            const s = EVENT_STYLE[e.type];
            const Icon = s.icon;
            return (
              <div key={e.id} style={{ position: "relative", display: "flex", gap: 12, padding: "7px 0" }}>
                <div style={{ position: "relative", flexShrink: 0, zIndex: 1, borderRadius: 10, boxShadow: `0 0 0 3px ${T.surface}` }}>
                  <BrandLogo brand={e.brand === "Unspecified" ? "" : e.brand} website={e.website} size={34} radius={10} />
                  <span title={s.label} style={{ position: "absolute", right: -5, bottom: -5, width: 17, height: 17, borderRadius: "50%", background: s.color, border: `2px solid ${T.surface}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={9} color="#FFF" strokeWidth={3} />
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
                  <div style={{ fontSize: 11, color: T.text }}>
                    <span style={{ fontWeight: 600 }}>{s.label}</span> — {e.creator} × {e.brand}
                  </div>
                  <div style={{ fontSize: 9.5, color: T.label, marginTop: 2 }}>{relativeDay(e.when)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── LATEST REELS ─────────────────────────────────────────────────────────────
function RailReel({ deal }) {
  const [hover, setHover] = useState(false);
  const href = reelHref(deal);
  return (
    <a href={href || undefined} target="_blank" rel="noreferrer" className="fx-zoom"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position: "relative", width: 158, flexShrink: 0, borderRadius: 14, overflow: "hidden", display: "block", textDecoration: "none", boxShadow: T.shadow }}>
      <ReelMedia deal={deal} hovered={hover} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.78) 100%)", pointerEvents: "none" }} />
      {deal.brand && (
        <div style={{ position: "absolute", top: 8, left: 8, display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.92)", borderRadius: 20, padding: "2px 8px 2px 2px", maxWidth: "calc(100% - 16px)" }}>
          <BrandLogo brand={deal.brand} website={deal.brandWebsite} size={18} />
          <span style={{ fontSize: 9.5, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{deal.brand}</span>
        </div>
      )}
      <div style={{ position: "absolute", left: 10, right: 10, bottom: 9, color: "#FFF" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700 }}><Eye size={12} /> {fmtCompact(deal.media?.views)}</div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>{deal.creatorName}</div>
      </div>
    </a>
  );
}

// ── TAB ──────────────────────────────────────────────────────────────────────
export default function SummaryTab({ creators, deals, dealsLoading, user, setTab }) {
  const data = useMemo(() => {
    const totalClient = deals.reduce((s, d) => s + (d.budget || 0), 0);
    const totalInternal = deals.reduce((s, d) => s + (d.internalCost || 0), 0);
    const margin = totalClient - totalInternal;
    const marginPct = totalClient > 0 ? (margin / totalClient) * 100 : null;

    const totalFollowers = creators.reduce((s, c) => s + parseFollowersLoose(c.followers), 0);
    const ers = creators.map(c => Number(c.avgER)).filter(v => Number.isFinite(v) && v > 0);
    const avgER = ers.length ? ers.reduce((s, v) => s + v, 0) / ers.length : null;
    const totalViews = deals.reduce((s, d) => s + (d.media?.ok ? (d.media.views || 0) : 0), 0);

    const counts = { live: 0, draft: 0, attention: 0 };
    deals.forEach(d => { counts[dealStatus(d)]++; });

    // Six real monthly buckets — every sparkline and the money-flow chart
    // read off this one series.
    const now = new Date();
    const monthly = [];
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthly.push({ key: `${dt.getFullYear()}-${dt.getMonth()}`, label: dt.toLocaleDateString("en-IN", { month: "short" }), count: 0, live: 0, clientCost: 0, internalCost: 0 });
    }
    const byKey = new Map(monthly.map(m => [m.key, m]));
    deals.forEach(d => {
      const dt = d.createdAt ? new Date(d.createdAt) : null;
      const b = dt && !isNaN(dt) ? byKey.get(`${dt.getFullYear()}-${dt.getMonth()}`) : null;
      if (!b) return;
      b.count++; if (dealStatus(d) === "live") b.live++;
      b.clientCost += d.budget || 0; b.internalCost += d.internalCost || 0;
    });

    // Deals logged in the last 30 days vs the 30 before — a real comparison,
    // shown only on the card it actually describes.
    const nowMs = Date.now(), d30 = 30 * 86400000;
    const age = d => d.createdAt ? nowMs - new Date(d.createdAt).getTime() : Infinity;
    const last30 = deals.filter(d => age(d) <= d30).length;
    const prev30 = deals.filter(d => age(d) > d30 && age(d) <= 2 * d30).length;
    const dealTrend = prev30 === 0 ? null : Math.round(((last30 - prev30) / prev30) * 100);

    const creatorById = new Map(creators.map(c => [c.id, c]));

    const lb = new Map();
    deals.forEach(d => {
      const r = lb.get(d.creatorId) || { id: d.creatorId, name: d.creatorName || creatorById.get(d.creatorId)?.name || "—", creator: creatorById.get(d.creatorId) || { name: d.creatorName }, clientCost: 0, internalCost: 0, deals: 0, views: 0, brandMap: new Map() };
      r.clientCost += d.budget || 0; r.internalCost += d.internalCost || 0; r.deals++;
      if (d.brand) {
        const b = r.brandMap.get(d.brand) || { name: d.brand, website: null, spend: 0 };
        b.spend += d.budget || 0; if (!b.website && d.brandWebsite) b.website = d.brandWebsite;
        r.brandMap.set(d.brand, b);
      }
      if (d.media?.ok) r.views += d.media.views || 0;
      lb.set(d.creatorId, r);
    });
    const leaderboard = [...lb.values()]
      .map(r => ({ ...r, brandList: [...r.brandMap.values()].sort((a, b) => b.spend - a.spend) }))
      .sort((a, b) => b.clientCost - a.clientCost || b.views - a.views).slice(0, 6);

    const bm = new Map();
    deals.forEach(d => {
      const name = d.brand || "Unspecified";
      const r = bm.get(name) || { name, clientCost: 0, deals: 0, website: null };
      r.clientCost += d.budget || 0; r.deals++;
      if (!r.website && d.brandWebsite) r.website = d.brandWebsite;
      bm.set(name, r);
    });
    const allBrands = [...bm.values()].filter(b => b.name !== "Unspecified").sort((a, b) => b.clientCost - a.clientCost);
    const brands = [...bm.values()].sort((a, b) => b.clientCost - a.clientCost).slice(0, 6);

    const reels = deals.filter(d => d.media?.ok);
    const topDeal = reels.length
      ? [...reels].sort((a, b) => (b.media.views || 0) - (a.media.views || 0))[0]
      : deals.length ? [...deals].sort((a, b) => (b.budget || 0) - (a.budget || 0))[0] : null;
    const reelTime = d => Date.parse(d.media?.takenAt || d.createdAt || 0) || 0;
    const latest = [...reels].sort((a, b) => reelTime(b) - reelTime(a)).slice(0, 12);

    const events = [];
    deals.forEach(d => {
      const who = { creator: d.creatorName || "—", brand: d.brand || "Unspecified", website: d.brandWebsite || null };
      if (d.createdAt) events.push({ id: `${d.id}-a`, type: "added", when: d.createdAt, ...who });
      if (d.fetchedAt && d.fetchedAt !== d.createdAt) events.push({ id: `${d.id}-s`, type: "synced", when: d.fetchedAt, ...who });
    });
    const activity = events.sort((a, b) => new Date(b.when) - new Date(a.when)).slice(0, 6);

    return { totalClient, totalInternal, margin, marginPct, totalFollowers, avgER, totalViews, counts, monthly, dealTrend, creatorById, leaderboard, brands, allBrands, topDeal, latest, activity };
  }, [creators, deals]);

  if (dealsLoading) return <Notice>Loading summary…</Notice>;

  const d = data;
  const go = (t) => () => setTab && setTab(t);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <style>{FX_CSS}</style>

      <Hero user={user} creators={creators} totalFollowers={d.totalFollowers} totalViews={d.totalViews}
        avgER={d.avgER} live={d.counts.live} deals={deals.length} brands={d.allBrands} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <PipelinePanel i={1} counts={d.counts} total={deals.length} trend={d.dealTrend} />
        <MoneyPanel i={2} client={d.totalClient} internal={d.totalInternal} margin={d.margin} marginPct={d.marginPct} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <Reveal i={6} style={{ ...card, flex: "2 1 480px", minWidth: 0 }}><MoneyFlow monthly={d.monthly} /></Reveal>
        <Reveal i={7} style={{ ...card, flex: "1 1 260px", minWidth: 0 }}><StatusPanel counts={d.counts} total={deals.length} /></Reveal>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <Reveal i={8} style={{ ...card, flex: "1.25 1 400px", minWidth: 0 }}><Leaderboard rows={d.leaderboard} /></Reveal>
        <Reveal i={9} style={{ ...card, flex: "1 1 320px", minWidth: 0 }}><BrandWall brands={d.brands} total={d.totalClient} /></Reveal>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "stretch" }}>
        <Reveal i={10} style={{ flex: "1.3 1 440px", minWidth: 0 }}>
          {d.topDeal ? <Spotlight deal={d.topDeal} creator={d.creatorById.get(d.topDeal.creatorId)} />
            : <div style={{ ...card }}><Notice tone="empty">No deals logged yet.</Notice></div>}
        </Reveal>
        <Reveal i={11} style={{ ...card, flex: "1 1 300px", minWidth: 0 }}><ActivityFeed events={d.activity} /></Reveal>
      </div>

      {d.latest.length > 0 && (
        <Reveal i={12} style={{ ...card }}>
          <SectionTitle sub="Newest reels from managed-creator deals — hover to play"
            action={<LinkBtn onClick={go("assets")}>All reels →</LinkBtn>}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><Sparkles size={15} color={T.pink} /> Latest reels</span>
          </SectionTitle>
          <div className="fx-rail" style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6 }}>
            {d.latest.map(deal => <RailReel key={deal.id} deal={deal} />)}
          </div>
        </Reveal>
      )}
    </div>
  );
}
