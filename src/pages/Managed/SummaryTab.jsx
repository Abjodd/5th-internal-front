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
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  Handshake,
  IndianRupee,
  Coins,
  TrendingUp,
  TrendingDown,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Crown,
  Trophy,
  ArrowUpRight,
  Sparkles,
  Plus,
  RefreshCw,
} from "lucide-react";
import { T } from "../../theme/tokens";
import { fmtINR, fmtCompact } from "../../lib/format";
import { Notice } from "../Creators/shared";
import CreatorAvatar from "../../components/CreatorAvatar";
import BrandLogo from "../../components/BrandLogo";
import {
  DARK_SURFACE,
  MONEY,
  FX_CSS,
  STATUS_COLOR,
  STATUS_LABEL,
  CountUp,
  Reveal,
  ReelMedia,
  SectionTitle,
  LinkBtn,
  StatusPill,
  card,
  dealStatus,
  parseFollowersLoose,
  relativeDay,
  reelHref,
  useMounted,
} from "./fx";

const compact = (n) => fmtCompact(Math.round(n));
const inr = (n) => fmtINR(Math.round(n));

// Dashboard metric colors only — layout and component structure remain unchanged.
const DASH_COLORS = {
  client: "#7C5CE7", // Client spend / client cost
  internal: "#B08A2E", // Paid to creators / internal cost
  margin: "#1E9E5A", // Margin
  live: "#1E9E5A", // Live deals
  draft: "#3F6FE5", // Draft deals
  attention: "#C83B3B", // Needs attention
  pipeline: "#0F9F8F",
};
const DASH_STATUS_COLORS = {
  live: DASH_COLORS.live,
  draft: DASH_COLORS.draft,
  attention: DASH_COLORS.attention,
};

// ── HERO ─────────────────────────────────────────────────────────────────────
// Five fixed slots for the photo collage; filled by the top creators by
// reach, so every face here is a real managed creator.
const COLLAGE = [
  { left: 98, top: 4, size: 120, r: "4deg", z: 5, delay: "0s" },
  { left: 0, top: 44, size: 94, r: "-8deg", z: 4, delay: "-1.4s" },
  { left: 206, top: 52, size: 96, r: "9deg", z: 3, delay: "-2.8s" },
  { left: 40, top: 156, size: 70, r: "6deg", z: 2, delay: "-4.1s" },
  { left: 196, top: 164, size: 66, r: "-5deg", z: 1, delay: "-3.3s" },
];

function Hero({
  user,
  creators,
  totalFollowers,
  totalViews,
  avgER,
  live,
  deals,
  brands,
}) {
  const firstName = user?.name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const faces = [...creators]
    .sort(
      (a, b) =>
        parseFollowersLoose(b.followers) - parseFollowersLoose(a.followers),
    )
    .slice(0, 4);
  const metrics = [
    ["Reel views", totalViews, compact],
    ["Avg engagement", avgER, (n) => `${n.toFixed(1)}%`],
    ["Brand deals", deals, (n) => Math.round(n)],
  ];

  return (
    <Reveal
      className="managed-summary-glass-hero"
      style={{
        position: "relative",
        isolation: "isolate",
        overflow: "hidden",
        borderRadius: 28,
        background:
          "linear-gradient(125deg, rgba(255,255,255,0.96) 0%, rgba(250,250,252,0.88) 55%, rgba(245,246,250,0.9) 100%)",
        color: "#17233F",
        border: "1px solid rgba(148,163,184,0.22)",
        boxShadow:
          "0 12px 38px rgba(15,23,42,0.07), inset 0 1px 0 rgba(255,255,255,0.98)",
        backdropFilter: "blur(22px)",
        WebkitBackdropFilter: "blur(22px)",
        padding: "32px 42px",
        display: "grid",
        gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.1fr)",
        alignItems: "center",
        columnGap: 32,
        rowGap: 28,
      }}
    >
      {/* Subtle frosted-glass reflections, kept neutral rather than multicoloured. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          zIndex: -1,
          inset: 0,
          pointerEvents: "none",
          background:
            "linear-gradient(132deg, transparent 0%, rgba(226,232,240,0.22) 16%, transparent 25%, transparent 56%, rgba(226,232,240,0.24) 68%, transparent 80%)",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          zIndex: -1,
          right: -90,
          top: -160,
          width: 420,
          height: 420,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(226,232,240,0.42), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        className="managed-summary-glass-intro"
        style={{ minWidth: 0, position: "relative" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            fontSize: 13,
            color: "#34415C",
            fontWeight: 500,
          }}
        >
          <span>
            {greeting}, {firstName}
          </span>
          {live > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "5px 12px",
                borderRadius: 24,
                background: "rgba(16,185,129,0.09)",
                border: "1px solid rgba(16,185,129,0.16)",
                fontSize: 11,
                fontWeight: 600,
                color: "#18794E",
                whiteSpace: "nowrap",
              }}
            >
              <span
                className="fx-live"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#1EAA68",
                }}
              />
              {live} reel{live === 1 ? "" : "s"} live
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.17em",
            textTransform: "uppercase",
            color: "#727D91",
            marginTop: 26,
          }}
        >
          Combined audience
        </div>
        <div
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "clamp(68px, 7vw, 104px)",
            fontWeight: 500,
            lineHeight: 0.98,
            letterSpacing: "-0.055em",
            marginTop: 2,
            color: "#17233F",
          }}
        >
          <CountUp value={totalFollowers} format={compact} duration={1400} />
        </div>
        <div
          style={{
            fontFamily: "'Newsreader', Georgia, serif",
            fontStyle: "italic",
            fontSize: 20,
            lineHeight: 1.35,
            color: "#35415B",
            marginTop: 13,
          }}
        >
          across {creators.length} creator{creators.length === 1 ? "" : "s"} we
          manage directly.
        </div>
      </div>

      <div
        className="managed-summary-glass-overview"
        style={{
          minWidth: 0,
          borderLeft: "1px solid rgba(100,116,139,0.28)",
          paddingLeft: 30,
        }}
      >
        <div
          className="managed-summary-glass-metrics"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            alignItems: "start",
            marginLeft: 0,
          }}
        >
          {metrics.map(([label, value, fmt], i) => (
            <div
              key={label}
              style={{
                minWidth: 0,
                padding: "0 18px",
                paddingLeft: i === 0 ? 0 : 22,
                borderLeft:
                  i === 0 ? "none" : "1px solid rgba(100,116,139,0.25)",
              }}
            >
              <div
                style={{
                  fontSize: "clamp(23px, 2.5vw, 34px)",
                  lineHeight: 1.1,
                  fontWeight: 700,
                  letterSpacing: "-0.035em",
                  color: "#111B32",
                  whiteSpace: "nowrap",
                }}
              >
                {value == null ? "—" : <CountUp value={value} format={fmt} />}
              </div>
              <div
                style={{
                  fontSize: 10,
                  lineHeight: 1.4,
                  color: "#68748B",
                  textTransform: "uppercase",
                  letterSpacing: "0.11em",
                  marginTop: 9,
                  fontWeight: 600,
                }}
              >
                {label}
              </div>
            </div>
          ))}
        </div>

        <div
          className="managed-summary-glass-social"
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
            marginTop: 30,
            marginLeft: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              paddingRight: 20,
              borderRight: "1px solid rgba(100,116,139,0.28)",
            }}
            aria-label={`${faces.length} managed creators`}
          >
            {faces.map((c, i) => (
              <div
                key={c.id}
                title={c.name}
                style={{
                  position: "relative",
                  zIndex: faces.length - i,
                  marginLeft: i ? -13 : 0,
                  borderRadius: "50%",
                  padding: 2,
                  background: "rgba(255,255,255,0.96)",
                  border: "1px solid rgba(148,163,184,0.18)",
                  boxShadow: "0 3px 10px rgba(15,23,42,0.12)",
                }}
              >
                <CreatorAvatar creator={c} size={42} radius={21} />
              </div>
            ))}
          </div>

          {brands.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                minWidth: 0,
                flex: "1 1 190px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
              >
                {brands.slice(0, 4).map((b, i) => (
                  <div
                    key={b.name}
                    title={b.name}
                    style={{
                      marginLeft: i ? -9 : 0,
                      position: "relative",
                      zIndex: 10 - i,
                      borderRadius: "50%",
                      padding: 3,
                      background: "rgba(255,255,255,0.96)",
                      border: "1px solid rgba(148,163,184,0.2)",
                      boxShadow: "0 3px 10px rgba(15,23,42,0.10)",
                    }}
                  >
                    <BrandLogo brand={b.name} website={b.website} size={34} />
                  </div>
                ))}
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: "#56627A",
                  lineHeight: 1.5,
                  whiteSpace: "nowrap",
                }}
              >
                Brands on deals · {brands.length}{" "}
                {brands.length === 1 ? "brand" : "brands"}
              </span>
            </div>
          )}
        </div>
      </div>
      <style>{`
        .managed-summary-glass-overview { min-width: 0; }
        .managed-summary-glass-metrics > div { min-width: 0; }
        .managed-summary-glass-social { min-width: 0; }
        @media (max-width: 900px) {
          .managed-summary-glass-hero { grid-template-columns: minmax(0, 1fr) !important; padding: 28px !important; row-gap: 24px !important; }
          .managed-summary-glass-overview { border-left: 0 !important; border-top: 1px solid rgba(100,116,139,0.24); padding-left: 0 !important; padding-top: 24px !important; }
          .managed-summary-glass-social { margin-top: 24px !important; }
        }
        @media (max-width: 520px) {
          .managed-summary-glass-hero { padding: 23px 19px !important; border-radius: 22px !important; }
          .managed-summary-glass-intro > div:nth-child(2) { margin-top: 20px !important; }
          .managed-summary-glass-intro > div:nth-child(3) { font-size: clamp(58px, 17vw, 78px) !important; }
          .managed-summary-glass-intro > div:nth-child(4) { font-size: 16px !important; }
          .managed-summary-glass-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 0 !important; }
          .managed-summary-glass-metrics > div { padding-left: 8px !important; padding-right: 6px !important; }
          .managed-summary-glass-metrics > div:first-child { padding-left: 0 !important; }
          .managed-summary-glass-metrics > div > div:first-child { font-size: clamp(18px, 5.5vw, 25px) !important; white-space: normal !important; overflow-wrap: anywhere; }
          .managed-summary-glass-metrics > div > div:last-child { font-size: 7px !important; letter-spacing: 0.04em !important; overflow-wrap: anywhere; }
          .managed-summary-glass-social { gap: 12px !important; margin-top: 20px !important; }
          .managed-summary-glass-social > div:first-child { padding-right: 12px !important; }
          .managed-summary-glass-social > div:first-child > div { transform: scale(.88); transform-origin: left center; }
          .managed-summary-glass-social > div:last-child { flex-basis: 150px !important; }
          .managed-summary-glass-social span { white-space: normal !important; }
        }
      `}</style>
    </Reveal>
  );
}

// ── HEADLINE PANELS ──────────────────────────────────────────────────────────
// Two panels instead of five sparkline cards. The sparklines read badly on a
// young roster (five empty months, then one spike); the month-by-month view
// lives in Money flow below, where it has room to make sense.
function Ring({ pct, color, size = 46 }) {
  const mounted = useMounted();
  const R = size / 2 - 5,
    C = 2 * Math.PI * R,
    len = (Math.max(0, Math.min(100, pct)) / 100) * C;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={R}
        fill="none"
        stroke={T.mute}
        strokeWidth={6}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={R}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${mounted ? len : 0} ${C}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 1.1s cubic-bezier(.2,.7,.2,1)" }}
      />
      <text
        x="50%"
        y="53%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={size > 50 ? 13 : 10.5}
        fontWeight="700"
        fill={T.text}
        fontFamily="'Sora'"
      >
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

const PanelLabel = ({ icon: Icon, color, children, right }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: 9,
        background: `${color}16`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon size={14} color={color} strokeWidth={2.2} />
    </div>
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: T.sub,
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        flex: 1,
      }}
    >
      {children}
    </span>
    {right}
  </div>
);

function PipelinePanel({ i, counts, total, trend }) {
  const mounted = useMounted();
  const segs = ["live", "draft", "attention"].map((k) => ({
    key: k,
    value: counts[k],
    color: DASH_STATUS_COLORS[k],
  }));
  return (
    <Reveal
      className="managed-summary-glass-panel managed-summary-glass-pipeline"
      i={i}
      style={{
        flex: "0.88 1 300px",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <PanelLabel
        icon={Handshake}
        color={DASH_COLORS.pipeline}
        right={
          trend != null && (
            <span
              title="Deals logged in the last 30 days vs. the 30 before"
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: 20,
                color: "#34415C",
                background: "rgba(100,116,139,0.10)",
              }}
            >
              {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}% · 30d
            </span>
          )
        }
      >
        Deal pipeline
      </PanelLabel>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span
          style={{
            fontSize: 44,
            fontWeight: 700,
            color: T.text,
            letterSpacing: "-0.03em",
            lineHeight: 1,
          }}
        >
          <CountUp value={total} />
        </span>
        <span style={{ fontSize: 12, color: T.sub }}>
          brand deal{total === 1 ? "" : "s"}
        </span>
      </div>

      <div>
        <div
          style={{
            display: "flex",
            gap: 3,
            height: 10,
            borderRadius: 8,
            overflow: "hidden",
            background: "rgba(100,116,139,0.16)",
            padding: 1,
          }}
        >
          {total > 0 &&
            segs
              .filter((s) => s.value > 0)
              .map((s, k) => (
                <div
                  key={s.key}
                  className="fx-bar"
                  style={{
                    width: mounted ? `${(s.value / total) * 100}%` : 0,
                    background: DASH_STATUS_COLORS[s.key],
                    borderRadius: 7,
                    transitionDelay: `${k * 0.1}s`,
                  }}
                />
              ))}
        </div>
        <div style={{ display: "flex", marginTop: 12 }}>
          {segs.map((s, k) => (
            <div
              key={s.key}
              style={{
                flex: 1,
                minWidth: 0,
                paddingLeft: k ? 12 : 0,
                borderLeft: k ? `1px solid ${T.border}` : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 9.5,
                  color: T.sub,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  className={
                    s.key === "live" && s.value ? "fx-live" : undefined
                  }
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: DASH_STATUS_COLORS[s.key],
                    flexShrink: 0,
                  }}
                />
                {STATUS_LABEL[s.key]}
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: s.value ? T.text : T.label,
                  marginTop: 3,
                }}
              >
                {s.value}
              </div>
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
  const internalShare =
    client > 0 ? Math.min(100, (internal / client) * 100) : 0;
  const cols = [
    {
      icon: IndianRupee,
      color: DASH_COLORS.client,
      label: "Client spend",
      value: client,
      sub: "paid by brands",
    },
    {
      icon: Coins,
      color: DASH_COLORS.internal,
      label: "Paid to creators",
      value: internal,
      sub: client > 0 ? `${Math.round(internalShare)}% of spend` : "—",
    },
    {
      icon: loss ? TrendingDown : TrendingUp,
      color: loss ? "#C83B3B" : DASH_COLORS.margin,
      label: "Margin",
      value: margin,
      sub: marginPct != null ? `${Math.round(marginPct)}% of spend` : "—",
      ring: true,
    },
  ];
  return (
    <Reveal
      className="managed-summary-glass-panel managed-summary-glass-money"
      i={i}
      style={{
        flex: "2.3 1 560px",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 0" }}>
        {cols.map((c, k) => (
          <div
            key={c.label}
            style={{
              flex: "1 1 160px",
              minWidth: 0,
              padding: k ? "0 0 0 20px" : "0 20px 0 0",
              borderLeft: k ? `1px solid ${T.border}` : "none",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <PanelLabel icon={c.icon} color={c.color}>
              {c.label}
            </PanelLabel>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 700,
                    color: c.ring ? c.color : T.text,
                    letterSpacing: "-0.025em",
                    lineHeight: 1.05,
                    whiteSpace: "nowrap",
                  }}
                >
                  <CountUp value={c.value} format={inr} />
                </div>
                <div style={{ fontSize: 10.5, color: T.sub, marginTop: 5 }}>
                  {c.sub}
                </div>
              </div>
              {c.ring && marginPct != null && marginPct >= 0 && (
                <Ring pct={marginPct} color={c.color} size={54} />
              )}
            </div>
          </div>
        ))}
      </div>

      <div>
        <div
          style={{
            display: "flex",
            gap: 3,
            height: 12,
            borderRadius: 6,
            overflow: "hidden",
            background: T.mute,
          }}
        >
          {client > 0 && (
            <>
              <div
                className="fx-bar"
                style={{
                  width: mounted ? `${loss ? 100 : internalShare}%` : 0,
                  background: DASH_COLORS.internal,
                  borderRadius: 6,
                }}
              />
              {!loss && (
                <div
                  className="fx-bar"
                  style={{
                    width: mounted ? `${100 - internalShare}%` : 0,
                    background: DASH_COLORS.margin,
                    borderRadius: 6,
                    transitionDelay: ".12s",
                  }}
                />
              )}
            </>
          )}
        </div>
        <div style={{ fontSize: 10.5, color: T.sub, marginTop: 8 }}>
          {client === 0 ? (
            "No client spend logged yet."
          ) : loss ? (
            "Running at a loss — creators are being paid more than brands paid us."
          ) : (
            <>
              Of every ₹100 a brand pays,{" "}
              <b style={{ color: DASH_COLORS.internal }}>
                ₹{Math.round(internalShare)}
              </b>{" "}
              goes to the creator and{" "}
              <b style={{ color: DASH_COLORS.margin }}>
                ₹{100 - Math.round(internalShare)}
              </b>{" "}
              is margin.
            </>
          )}
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
    <div
      style={{
        background: "rgba(20,21,26,0.94)",
        color: "#FFF",
        borderRadius: 10,
        padding: "10px 12px",
        fontSize: 11,
        boxShadow: T.shadowLg,
        minWidth: 160,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {[
        ["Client cost", row.clientCost, DASH_COLORS.client],
        ["Internal cost", row.internalCost, DASH_COLORS.internal],
      ].map(([l, v, c]) => (
        <div
          key={l}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            marginTop: 3,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "rgba(255,255,255,0.7)",
            }}
          >
            <span
              style={{ width: 8, height: 8, borderRadius: 2, background: c }}
            />
            {l}
          </span>
          <span style={{ fontWeight: 600 }}>{fmtINR(v)}</span>
        </div>
      ))}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 14,
          marginTop: 6,
          paddingTop: 6,
          borderTop: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <span style={{ color: "rgba(255,255,255,0.7)" }}>Margin</span>
        <span
          style={{
            fontWeight: 700,
            color: margin >= 0 ? "#7FE0A8" : "#F4A0A0",
          }}
        >
          {fmtINR(margin)}
        </span>
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
      <SectionTitle
        sub="Last 6 months, by month a deal was logged"
        action={
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {[
              ["Client cost", sumClient, DASH_COLORS.client],
              ["Internal cost", sumInternal, DASH_COLORS.internal],
            ].map(([l, v, c]) => (
              <div key={l} style={{ textAlign: "right" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    justifyContent: "flex-end",
                    fontSize: 9.5,
                    color: T.sub,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: c,
                    }}
                  />
                  {l}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                  {fmtINR(v)}
                </div>
              </div>
            ))}
          </div>
        }
      >
        Money flow
      </SectionTitle>
      {empty ? (
        <Notice tone="empty">No deals in the last six months.</Notice>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart
            data={monthly}
            margin={{ top: 12, right: 8, left: 4, bottom: 0 }}
          >
            <defs>
              <linearGradient id="mf-client" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={DASH_COLORS.client}
                  stopOpacity={0.32}
                />
                <stop
                  offset="100%"
                  stopColor={DASH_COLORS.client}
                  stopOpacity={0}
                />
              </linearGradient>
              <linearGradient id="mf-internal" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={DASH_COLORS.internal}
                  stopOpacity={0.3}
                />
                <stop
                  offset="100%"
                  stopColor={DASH_COLORS.internal}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke={T.border}
              strokeDasharray="3 4"
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: T.sub }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: T.label }}
              axisLine={false}
              tickLine={false}
              width={58}
              tickFormatter={(v) => fmtINR(v)}
            />
            <Tooltip
              content={<MoneyTooltip />}
              cursor={{ stroke: T.borderMid, strokeDasharray: "3 3" }}
            />
            <Area
              type="monotone"
              dataKey="clientCost"
              stroke={DASH_COLORS.client}
              strokeWidth={2.2}
              fill="url(#mf-client)"
              dot={false}
              activeDot={{ r: 4.5, stroke: "#FFF", strokeWidth: 2 }}
              animationDuration={1100}
            />
            <Area
              type="monotone"
              dataKey="internalCost"
              stroke={DASH_COLORS.internal}
              strokeWidth={2.2}
              fill="url(#mf-internal)"
              dot={false}
              activeDot={{ r: 4.5, stroke: "#FFF", strokeWidth: 2 }}
              animationDuration={1100}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </>
  );
}

// ── STATUS ───────────────────────────────────────────────────────────────────
function StatusPanel({ counts, total }) {
  const mounted = useMounted();
  const SIZE = 168,
    R = 64,
    STROKE = 18,
    C = 2 * Math.PI * R,
    GAP = total > 1 ? 4 : 0;
  const slices = ["live", "draft", "attention"].map((k) => ({
    key: k,
    value: counts[k],
    color: DASH_STATUS_COLORS[k],
  }));
  let acc = 0;
  return (
    <>
      <SectionTitle sub="Derived from each deal's reel link">
        Campaign status
      </SectionTitle>
      {total === 0 ? (
        <Notice tone="empty">No deals logged yet.</Notice>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <svg width={SIZE} height={SIZE}>
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke={T.mute}
              strokeWidth={STROKE}
            />
            {slices
              .filter((s) => s.value > 0)
              .map((s) => {
                const frac = s.value / total,
                  len = Math.max(0, frac * C - GAP);
                const el = (
                  <circle
                    key={s.key}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={R}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={STROKE}
                    strokeDasharray={`${mounted ? len : 0} ${C}`}
                    strokeDashoffset={-acc}
                    strokeLinecap="butt"
                    transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                    style={{
                      transition:
                        "stroke-dasharray 1s cubic-bezier(.2,.7,.2,1)",
                    }}
                  />
                );
                acc += frac * C;
                return el;
              })}
            <text
              x="50%"
              y="47%"
              textAnchor="middle"
              fontSize="30"
              fontWeight="700"
              fill={T.text}
              fontFamily="'Sora'"
            >
              {total}
            </text>
            <text
              x="50%"
              y="60%"
              textAnchor="middle"
              fontSize="8.5"
              fill={T.label}
              fontFamily="'Sora'"
              letterSpacing="1"
            >
              DEALS
            </text>
          </svg>
          <div
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {slices.map((s) => (
              <div
                key={s.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 3,
                    background: s.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: T.sub, flex: 1 }}>
                  {STATUS_LABEL[s.key]}
                </span>
                <span style={{ fontWeight: 700, color: T.text }}>
                  {s.value}
                </span>
                <span style={{ color: T.label, width: 34, textAlign: "right" }}>
                  {Math.round((s.value / total) * 100)}%
                </span>
              </div>
            ))}
            <div
              style={{
                fontSize: 9.5,
                color: T.label,
                lineHeight: 1.5,
                marginTop: 2,
              }}
            >
              Draft = no reel link yet · Needs attention = the link couldn't be
              fetched.
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
  const max = Math.max(1, ...rows.map((r) => r.clientCost));
  return (
    <>
      <SectionTitle
        sub="Ranked by what brands paid for their deals"
        action={
          <div
            style={{ display: "flex", gap: 10, fontSize: 9.5, color: T.sub }}
          >
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: DASH_COLORS.client,
                }}
              />
              Client cost
            </span>
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: DASH_COLORS.internal,
                }}
              />
              Paid to creator
            </span>
          </div>
        }
      >
        Creator leaderboard
      </SectionTitle>
      {rows.length === 0 ? (
        <Notice tone="empty">No deals logged yet.</Notice>
      ) : (
        rows.map((r, i) => (
          <div
            key={r.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 0",
              borderTop: i ? `1px solid ${T.border}` : "none",
            }}
          >
            <div style={{ width: 22, textAlign: "center", flexShrink: 0 }}>
              {i === 0 ? (
                <Crown size={16} color={T.gold} fill={`${T.gold}40`} />
              ) : (
                <span style={{ fontSize: 11, fontWeight: 700, color: T.label }}>
                  {i + 1}
                </span>
              )}
            </div>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <CreatorAvatar creator={r.creator} size={38} radius={19} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: T.text,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {r.name}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  {r.brandList.slice(0, 3).map((b, k) => (
                    <span
                      key={b.name}
                      title={b.name}
                      style={{
                        marginLeft: k ? -5 : 0,
                        position: "relative",
                        zIndex: 5 - k,
                        borderRadius: "50%",
                        boxShadow: `0 0 0 1.5px ${T.surface}`,
                      }}
                    >
                      <BrandLogo brand={b.name} website={b.website} size={18} />
                    </span>
                  ))}
                  {r.brandList.length > 3 && (
                    <span
                      style={{ marginLeft: 4, fontSize: 9, color: T.label }}
                    >
                      +{r.brandList.length - 3}
                    </span>
                  )}
                </span>
                <span
                  style={{
                    fontSize: 9.5,
                    color: T.label,
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.deals} deal{r.deals === 1 ? "" : "s"}
                  {r.views ? ` · ${fmtCompact(r.views)} views` : ""}
                </span>
              </div>
              <div
                style={{
                  position: "relative",
                  height: 8,
                  borderRadius: 4,
                  background: T.mute,
                  overflow: "hidden",
                }}
              >
                <div
                  className="fx-bar"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: mounted ? `${(r.clientCost / max) * 100}%` : 0,
                    background: DASH_COLORS.client,
                    borderRadius: 4,
                  }}
                />
                <div
                  className="fx-bar"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: mounted
                      ? `${(Math.min(r.internalCost, r.clientCost || r.internalCost) / max) * 100}%`
                      : 0,
                    background: DASH_COLORS.internal,
                    borderRadius: 4,
                    transitionDelay: ".15s",
                  }}
                />
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0, minWidth: 70 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>
                {fmtINR(r.clientCost)}
              </div>
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 600,
                  color: r.clientCost - r.internalCost >= 0 ? T.green : T.red,
                }}
              >
                {r.clientCost - r.internalCost >= 0 ? "+" : ""}
                {fmtINR(r.clientCost - r.internalCost)}
              </div>
            </div>
          </div>
        ))
      )}
    </>
  );
}

// ── BRAND WALL ───────────────────────────────────────────────────────────────
function BrandWall({ brands, total }) {
  const mounted = useMounted();
  return (
    <>
      <SectionTitle sub="Share of client spend, all-time">
        Brand wall
      </SectionTitle>
      {brands.length === 0 ? (
        <Notice tone="empty">No brands yet.</Notice>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 10,
          }}
        >
          {brands.map((b, i) => {
            const share = total > 0 ? (b.clientCost / total) * 100 : 0;
            return (
              <div
                key={b.name}
                className="fx-lift"
                style={{
                  border: `1px solid ${T.border}`,
                  borderRadius: 12,
                  padding: "12px 12px 11px",
                  background:
                    i === 0
                      ? `linear-gradient(160deg, ${DASH_COLORS.client}10, transparent 70%)`
                      : T.surface,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <BrandLogo
                    brand={b.name}
                    website={b.website}
                    size={34}
                    radius={9}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: T.text,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {b.name}
                    </div>
                    <div style={{ fontSize: 9, color: T.label }}>
                      {b.deals} deal{b.deals === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    marginTop: 10,
                  }}
                >
                  <span
                    style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}
                  >
                    {fmtINR(b.clientCost)}
                  </span>
                  <span
                    style={{ fontSize: 9.5, fontWeight: 600, color: T.sub }}
                  >
                    {Math.round(share)}%
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    borderRadius: 2,
                    background: T.mute,
                    marginTop: 5,
                    overflow: "hidden",
                  }}
                >
                  <div
                    className="fx-bar"
                    style={{
                      height: "100%",
                      width: mounted ? `${share}%` : 0,
                      background: DASH_COLORS.client,
                      borderRadius: 2,
                    }}
                  />
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
  const margin = (deal.budget || 0) - (deal.internalCost || 0);
  const stats = [
    [Eye, "Views", m?.views],
    [Heart, "Likes", m?.likes],
    [MessageCircle, "Comments", m?.comments],
    [Share2, "Shares", m?.forwards],
  ];

  return (
    <section
      className="managed-reel-glass"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <a
        href={href || undefined}
        target="_blank"
        rel="noreferrer"
        className="managed-reel-glass__media fx-zoom"
        aria-label={`Open ${deal.creatorName || "creator"} reel`}
      >
        <ReelMedia deal={deal} hovered={hover} fill />
        <div className="managed-reel-glass__live">
          <StatusPill status={dealStatus(deal)} onDark />
        </div>
      </a>

      <div className="managed-reel-glass__body">
        <div className="managed-reel-glass__eyebrow">
          <Trophy size={13} strokeWidth={1.8} />
          <span>Top performing reel</span>
        </div>

        <div className="managed-reel-glass__identity">
          <CreatorAvatar
            creator={creator || { name: deal.creatorName }}
            size={34}
            radius={17}
          />
          <span className="managed-reel-glass__multiply">×</span>
          {deal.brand && (
            <BrandLogo
              brand={deal.brand}
              website={deal.brandWebsite}
              size={34}
              radius={9}
            />
          )}
          <div className="managed-reel-glass__brand-info">
            <div className="managed-reel-glass__creator-name">
              {deal.creatorName || "—"}
            </div>
            <div className="managed-reel-glass__brand-name">
              for {deal.brand || "—"}
            </div>
          </div>
        </div>

        <div className="managed-reel-glass__stats">
          {stats.map(([Icon, label, value]) => (
            <div className="managed-reel-glass__stat" key={label}>
              <div className="managed-reel-glass__stat-label">
                <Icon size={11} strokeWidth={1.8} />
                <span>{label}</span>
              </div>
              <div className="managed-reel-glass__stat-value">
                {value != null ? (
                  <CountUp value={value} format={compact} />
                ) : (
                  "—"
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="managed-reel-glass__summary">
          {m?.er != null && (
            <span>
              ER <strong>{m.er}%</strong>
            </span>
          )}
          <span>
            Margin{" "}
            <strong className={margin < 0 ? "is-negative" : ""}>
              {fmtINR(margin)}
            </strong>
          </span>
        </div>

        {m?.caption && (
          <p className="managed-reel-glass__caption">“{m.caption}”</p>
        )}

        {href && (
          <a
            className="managed-reel-glass__button"
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            Open reel <ArrowUpRight size={13} />
          </a>
        )}
      </div>
    </section>
  );
}

// ── ACTIVITY ─────────────────────────────────────────────────────────────────
const EVENT_STYLE = {
  added: { color: T.teal, icon: Plus, label: "New deal" },
  synced: { color: T.purple, icon: RefreshCw, label: "Reel synced" },
};
function ActivityFeed({ events }) {
  return (
    <section className="managed-activity-glass">
      <SectionTitle sub="Deals logged and reels synced">
        Recent activity
      </SectionTitle>

      {events.length === 0 ? (
        <Notice tone="empty">Nothing logged yet.</Notice>
      ) : (
        <div className="managed-activity-glass__timeline">
          <div className="managed-activity-glass__line" aria-hidden="true" />
          {events.map((event) => {
            const style = EVENT_STYLE[event.type] || EVENT_STYLE.added;
            const Icon = style.icon;
            return (
              <div className="managed-activity-glass__event" key={event.id}>
                <div className="managed-activity-glass__brand">
                  <BrandLogo
                    brand={event.brand === "Unspecified" ? "" : event.brand}
                    website={event.website}
                    size={34}
                    radius={10}
                  />
                  <span
                    className="managed-activity-glass__event-icon"
                    title={style.label}
                  >
                    <Icon size={9} strokeWidth={2.5} />
                  </span>
                </div>
                <div className="managed-activity-glass__details">
                  <div className="managed-activity-glass__event-title">
                    <strong>{style.label}</strong> — {event.creator} ×{" "}
                    {event.brand}
                  </div>
                  <div className="managed-activity-glass__date">
                    {relativeDay(event.when)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── LATEST REELS ─────────────────────────────────────────────────────────────
function RailReel({ deal }) {
  const [hover, setHover] = useState(false);
  const href = reelHref(deal);

  return (
    <a
      href={href || undefined}
      target="_blank"
      rel="noreferrer"
      className={`managed-latest-reel${hover ? " is-hovered" : ""}`}
      aria-label={`Open reel by ${deal.creatorName || "creator"}${deal.brand ? ` for ${deal.brand}` : ""}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <ReelMedia deal={deal} hovered={hover} />

      <div className="managed-latest-reel__shade" />

      {deal.brand && (
        <div className="managed-latest-reel__brand">
          <BrandLogo brand={deal.brand} website={deal.brandWebsite} size={24} />
          <span>{deal.brand}</span>
        </div>
      )}

      {!hover && (
        <div className="managed-latest-reel__play" aria-hidden="true">
          <span>▶</span>
        </div>
      )}

      <div className="managed-latest-reel__footer">
        <div className="managed-latest-reel__views">
          <Eye size={15} strokeWidth={2.2} />
          <span>{fmtCompact(deal.media?.views || 0)}</span>
        </div>

        <div className="managed-latest-reel__creator">
          {deal.creatorName || "Unknown creator"}
        </div>
      </div>
    </a>
  );
}

// ── TAB ──────────────────────────────────────────────────────────────────────
export default function SummaryTab({
  creators,
  deals,
  dealsLoading,
  user,
  setTab,
}) {
  const data = useMemo(() => {
    const totalClient = deals.reduce((s, d) => s + (d.budget || 0), 0);
    const totalInternal = deals.reduce((s, d) => s + (d.internalCost || 0), 0);
    const margin = totalClient - totalInternal;
    const marginPct = totalClient > 0 ? (margin / totalClient) * 100 : null;

    const totalFollowers = creators.reduce(
      (s, c) => s + parseFollowersLoose(c.followers),
      0,
    );
    const ers = creators
      .map((c) => Number(c.avgER))
      .filter((v) => Number.isFinite(v) && v > 0);
    const avgER = ers.length
      ? ers.reduce((s, v) => s + v, 0) / ers.length
      : null;
    const totalViews = deals.reduce(
      (s, d) => s + (d.media?.ok ? d.media.views || 0 : 0),
      0,
    );

    const counts = { live: 0, draft: 0, attention: 0 };
    deals.forEach((d) => {
      counts[dealStatus(d)]++;
    });

    // Six real monthly buckets — every sparkline and the money-flow chart
    // read off this one series.
    const now = new Date();
    const monthly = [];
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthly.push({
        key: `${dt.getFullYear()}-${dt.getMonth()}`,
        label: dt.toLocaleDateString("en-IN", { month: "short" }),
        count: 0,
        live: 0,
        clientCost: 0,
        internalCost: 0,
      });
    }
    const byKey = new Map(monthly.map((m) => [m.key, m]));
    deals.forEach((d) => {
      const dt = d.createdAt ? new Date(d.createdAt) : null;
      const b =
        dt && !isNaN(dt)
          ? byKey.get(`${dt.getFullYear()}-${dt.getMonth()}`)
          : null;
      if (!b) return;
      b.count++;
      if (dealStatus(d) === "live") b.live++;
      b.clientCost += d.budget || 0;
      b.internalCost += d.internalCost || 0;
    });

    // Deals logged in the last 30 days vs the 30 before — a real comparison,
    // shown only on the card it actually describes.
    const nowMs = Date.now(),
      d30 = 30 * 86400000;
    const age = (d) =>
      d.createdAt ? nowMs - new Date(d.createdAt).getTime() : Infinity;
    const last30 = deals.filter((d) => age(d) <= d30).length;
    const prev30 = deals.filter(
      (d) => age(d) > d30 && age(d) <= 2 * d30,
    ).length;
    const dealTrend =
      prev30 === 0 ? null : Math.round(((last30 - prev30) / prev30) * 100);

    const creatorById = new Map(creators.map((c) => [c.id, c]));

    const lb = new Map();
    deals.forEach((d) => {
      const r = lb.get(d.creatorId) || {
        id: d.creatorId,
        name: d.creatorName || creatorById.get(d.creatorId)?.name || "—",
        creator: creatorById.get(d.creatorId) || { name: d.creatorName },
        clientCost: 0,
        internalCost: 0,
        deals: 0,
        views: 0,
        brandMap: new Map(),
      };
      r.clientCost += d.budget || 0;
      r.internalCost += d.internalCost || 0;
      r.deals++;
      if (d.brand) {
        const b = r.brandMap.get(d.brand) || {
          name: d.brand,
          website: null,
          spend: 0,
        };
        b.spend += d.budget || 0;
        if (!b.website && d.brandWebsite) b.website = d.brandWebsite;
        r.brandMap.set(d.brand, b);
      }
      if (d.media?.ok) r.views += d.media.views || 0;
      lb.set(d.creatorId, r);
    });
    const leaderboard = [...lb.values()]
      .map((r) => ({
        ...r,
        brandList: [...r.brandMap.values()].sort((a, b) => b.spend - a.spend),
      }))
      .sort((a, b) => b.clientCost - a.clientCost || b.views - a.views)
      .slice(0, 6);

    const bm = new Map();
    deals.forEach((d) => {
      const name = d.brand || "Unspecified";
      const r = bm.get(name) || {
        name,
        clientCost: 0,
        deals: 0,
        website: null,
      };
      r.clientCost += d.budget || 0;
      r.deals++;
      if (!r.website && d.brandWebsite) r.website = d.brandWebsite;
      bm.set(name, r);
    });
    const allBrands = [...bm.values()]
      .filter((b) => b.name !== "Unspecified")
      .sort((a, b) => b.clientCost - a.clientCost);
    const brands = [...bm.values()]
      .sort((a, b) => b.clientCost - a.clientCost)
      .slice(0, 6);

    const reels = deals.filter((d) => d.media?.ok);
    const topDeal = reels.length
      ? [...reels].sort(
          (a, b) => (b.media.views || 0) - (a.media.views || 0),
        )[0]
      : deals.length
        ? [...deals].sort((a, b) => (b.budget || 0) - (a.budget || 0))[0]
        : null;
    const reelTime = (d) =>
      Date.parse(d.media?.takenAt || d.createdAt || 0) || 0;
    const latest = [...reels]
      .sort((a, b) => reelTime(b) - reelTime(a))
      .slice(0, 12);

    const events = [];
    deals.forEach((d) => {
      const who = {
        creator: d.creatorName || "—",
        brand: d.brand || "Unspecified",
        website: d.brandWebsite || null,
      };
      if (d.createdAt)
        events.push({
          id: `${d.id}-a`,
          type: "added",
          when: d.createdAt,
          ...who,
        });
      if (d.fetchedAt && d.fetchedAt !== d.createdAt)
        events.push({
          id: `${d.id}-s`,
          type: "synced",
          when: d.fetchedAt,
          ...who,
        });
    });
    const activity = events
      .sort((a, b) => new Date(b.when) - new Date(a.when))
      .slice(0, 6);

    return {
      totalClient,
      totalInternal,
      margin,
      marginPct,
      totalFollowers,
      avgER,
      totalViews,
      counts,
      monthly,
      dealTrend,
      creatorById,
      leaderboard,
      brands,
      allBrands,
      topDeal,
      latest,
      activity,
    };
  }, [creators, deals]);

  if (dealsLoading) return <Notice>Loading summary…</Notice>;

  const d = data;
  const go = (t) => () => setTab && setTab(t);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <style>{FX_CSS}</style>

      <Hero
        user={user}
        creators={creators}
        totalFollowers={d.totalFollowers}
        totalViews={d.totalViews}
        avgER={d.avgER}
        live={d.counts.live}
        deals={deals.length}
        brands={d.allBrands}
      />

      <div className="managed-summary-glass-financials">
        <PipelinePanel
          i={1}
          counts={d.counts}
          total={deals.length}
          trend={d.dealTrend}
        />
        <MoneyPanel
          i={2}
          client={d.totalClient}
          internal={d.totalInternal}
          margin={d.margin}
          marginPct={d.marginPct}
        />
      </div>
      <style>{`
        .managed-summary-glass-financials {
          position: relative;
          isolation: isolate;
          display: flex;
          flex-wrap: wrap;
          align-items: stretch;
          gap: 18px;
          padding: 18px;
          border-radius: 26px;
          overflow: hidden;
          background: linear-gradient(135deg, rgba(220,226,237,0.72), rgba(241,244,249,0.78) 48%, rgba(203,213,226,0.72));
          border: 1px solid rgba(148,163,184,0.24);
          box-shadow: 0 14px 34px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.88);
          backdrop-filter: blur(22px);
          -webkit-backdrop-filter: blur(22px);
        }
        .managed-summary-glass-financials::before {
          content: "";
          position: absolute;
          z-index: -1;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(125deg, rgba(255,255,255,0.44), transparent 38%, rgba(255,255,255,0.22) 72%, transparent);
        }
        .managed-summary-glass-panel {
          box-sizing: border-box;
          padding: 24px !important;
          border-radius: 22px !important;
          border: 1px solid rgba(255,255,255,0.72) !important;
          background: linear-gradient(145deg, rgba(255,255,255,0.78), rgba(248,250,253,0.56)) !important;
          box-shadow: 0 8px 24px rgba(15,23,42,0.07), inset 0 1px 0 rgba(255,255,255,0.92) !important;
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }
        .managed-summary-glass-panel .fx-bar { transition: width 900ms cubic-bezier(.2,.7,.2,1); }
        @media (max-width: 720px) {
          .managed-summary-glass-financials { padding: 12px; gap: 12px; border-radius: 22px; }
          .managed-summary-glass-panel { flex-basis: 100% !important; padding: 20px !important; border-radius: 18px !important; }
        }
        @media (max-width: 420px) {
          .managed-summary-glass-panel { padding: 16px !important; }
          .managed-summary-glass-pipeline > div:last-child > div:last-child > div { padding-left: 7px !important; }
          .managed-summary-glass-money > div:first-child > div { flex-basis: 100% !important; padding: 0 !important; border-left: 0 !important; }
          .managed-summary-glass-money > div:first-child > div + div { padding-top: 14px !important; border-top: 1px solid rgba(100,116,139,0.22) !important; }
        }
      `}</style>

      <div className="managed-summary-chart-grid">
        <Reveal
          i={6}
          className="managed-summary-chart-card"
          style={{ ...card, minWidth: 0, width: "100%" }}
        >
          <MoneyFlow monthly={d.monthly} />
        </Reveal>
        <Reveal
          i={7}
          className="managed-summary-chart-card managed-summary-status-card"
          style={{ ...card, minWidth: 0, width: "100%" }}
        >
          <StatusPanel counts={d.counts} total={deals.length} />
        </Reveal>
      </div>
      <style>{`
        /* Frosted-glass Money Flow and Campaign Status cards */
        .managed-summary-chart-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(280px, 0.85fr);
          align-items: stretch;
          gap: 18px;
          min-width: 0;
        }

        .managed-summary-chart-card {
          box-sizing: border-box;
          min-width: 0;
          padding: 26px !important;
          overflow: hidden;
          border-radius: 24px !important;
          border: 1px solid rgba(255, 255, 255, 0.88) !important;
          background:
            radial-gradient(
              circle at 82% 18%,
              rgba(224, 231, 245, 0.52),
              transparent 38%
            ),
            linear-gradient(
              135deg,
              rgba(255, 255, 255, 0.91),
              rgba(246, 248, 252, 0.80)
            ) !important;
          box-shadow:
            0 12px 32px rgba(25, 38, 65, 0.07),
            inset 0 1px 0 rgba(255, 255, 255, 0.96) !important;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }

        .managed-summary-chart-card h2,
        .managed-summary-chart-card h3 {
          color: #17233f;
        }

        .managed-summary-chart-card .recharts-cartesian-grid-horizontal line {
          stroke: rgba(100, 116, 139, 0.15);
        }

        .managed-summary-chart-card .recharts-cartesian-axis-tick-value {
          fill: #778196;
          font-size: 12px;
        }

        .managed-summary-status-card > div {
          min-width: 0;
        }

        @media (max-width: 720px) {
          .managed-summary-chart-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 12px;
          }
          .managed-summary-chart-card {
            padding: 20px !important;
            border-radius: 20px !important;
          }
        }

        @media (max-width: 420px) {
          .managed-summary-chart-card {
            padding: 16px !important;
          }
        }
      `}</style>

      <style>{`
        /* Frosted-glass leaderboard and brand wall; metric colors stay unchanged. */
        .managed-glass-leaderboard-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
          align-items: stretch;
          gap: 18px;
          min-width: 0;
        }
        .managed-glass-panel {
          box-sizing: border-box;
          min-width: 0;
          padding: 24px !important;
          overflow: hidden;
          border-radius: 24px !important;
          border: 1px solid rgba(255,255,255,0.9) !important;
          background:
            radial-gradient(circle at 85% 8%, rgba(224,231,245,0.48), transparent 40%),
            linear-gradient(135deg, rgba(255,255,255,0.9), rgba(242,246,252,0.76)) !important;
          box-shadow: 0 12px 30px rgba(25,38,65,0.065), inset 0 1px 0 rgba(255,255,255,0.96) !important;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
        .managed-glass-panel h2,
        .managed-glass-panel h3 { color: #17233f; }
        .managed-glass-panel .fx-lift {
          border-color: rgba(255,255,255,0.92) !important;
          background: linear-gradient(145deg, rgba(255,255,255,0.78), rgba(239,243,250,0.58)) !important;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.9);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
        }
        .managed-glass-panel .fx-lift:hover {
          transform: translateY(-2px);
          border-color: rgba(148,163,184,0.4) !important;
          box-shadow: 0 8px 20px rgba(23,35,63,0.07), inset 0 1px 0 rgba(255,255,255,0.96);
        }
        .managed-glass-panel .fx-bar { transition: width 900ms cubic-bezier(.2,.7,.2,1); }
        @media (max-width: 900px) {
          .managed-glass-leaderboard-grid { grid-template-columns: minmax(0, 1fr); }
        }
        @media (max-width: 720px) {
          .managed-glass-panel { padding: 20px !important; border-radius: 20px !important; }
        }
        @media (max-width: 420px) {
          .managed-glass-panel { padding: 16px !important; border-radius: 18px !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .managed-glass-panel .fx-bar,
          .managed-glass-panel .fx-lift { transition: none; }
        }
      `}</style>

      <div className="managed-glass-leaderboard-grid">
        <Reveal
          i={8}
          className="managed-glass-panel managed-glass-leaderboard"
          style={{ ...card, minWidth: 0 }}
        >
          <Leaderboard rows={d.leaderboard} />
        </Reveal>
        <Reveal
          i={9}
          className="managed-glass-panel managed-glass-brand-wall"
          style={{ ...card, minWidth: 0 }}
        >
          <BrandWall brands={d.brands} total={d.totalClient} />
        </Reveal>
      </div>

      <div className="managed-summary-spotlight-grid">
        <Reveal i={10} style={{ minWidth: 0 }}>
          {d.topDeal ? (
            <Spotlight
              deal={d.topDeal}
              creator={d.creatorById.get(d.topDeal.creatorId)}
            />
          ) : (
            <div style={card}>
              <Notice tone="empty">No deals logged yet.</Notice>
            </div>
          )}
        </Reveal>
        <Reveal i={11} style={{ minWidth: 0 }}>
          <ActivityFeed events={d.activity} />
        </Reveal>
      </div>

      <style>{`
        /* Frosted-glass spotlight and recent activity */
        .managed-summary-spotlight-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.3fr) minmax(280px, .9fr);
          gap: 18px;
          align-items: stretch;
          min-width: 0;
        }

        .managed-reel-glass,
        .managed-activity-glass {
          box-sizing: border-box;
          min-width: 0;
          height: 100%;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.88);
          border-radius: 22px;
          background:
            radial-gradient(circle at 82% 10%, rgba(221,229,243,.58), transparent 43%),
            linear-gradient(135deg, rgba(255,255,255,.91), rgba(242,246,252,.78));
          color: #17233f;
          box-shadow: 0 12px 30px rgba(25,38,65,.07), inset 0 1px 0 rgba(255,255,255,.96);
          backdrop-filter: blur(22px);
          -webkit-backdrop-filter: blur(22px);
        }

        .managed-reel-glass { display: flex; flex-direction: row; align-items: stretch; }

        .managed-reel-glass__media {
          position: relative;
          display: block;
          flex: 0 0 190px;
          min-width: 0;
          min-height: 300px;
          overflow: hidden;
          border-radius: 20px 0 0 20px;
          background: rgba(148,163,184,.18);
          text-decoration: none;
        }

        .managed-reel-glass__live { position: absolute; z-index: 2; top: 10px; left: 10px; }
        .managed-reel-glass__body {
          display: flex; flex: 1 1 0; flex-direction: column; justify-content: center;
          gap: 13px; min-width: 0; padding: 20px 22px;
        }
        .managed-reel-glass__eyebrow {
          display: flex; align-items: center; gap: 8px; color: #354766;
          font-size: 10px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase;
        }
        .managed-reel-glass__identity { display: flex; align-items: center; gap: 9px; min-width: 0; }
        .managed-reel-glass__multiply { color: #8792a6; font-size: 12px; }
        .managed-reel-glass__brand-info { min-width: 0; }
        .managed-reel-glass__creator-name {
          overflow: hidden; color: #17233f; font-size: 13px; font-weight: 700;
          text-overflow: ellipsis; white-space: nowrap;
        }
        .managed-reel-glass__brand-name { margin-top: 2px; color: #69758b; font-size: 10.5px; }
        .managed-reel-glass__stats {
          display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; min-width: 0;
        }
        .managed-reel-glass__stat {
          min-width: 0; padding: 9px 10px; border: 1px solid rgba(255,255,255,.9);
          border-radius: 11px; background: rgba(255,255,255,.48);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.7);
        }
        .managed-reel-glass__stat-label {
          display: flex; align-items: center; gap: 5px; color: #718097;
          font-size: 9px; letter-spacing: .075em; text-transform: uppercase;
        }
        .managed-reel-glass__stat-value {
          margin-top: 3px; overflow-wrap: anywhere; color: #17233f;
          font-size: 18px; font-weight: 750; line-height: 1.15;
        }
        .managed-reel-glass__summary {
          display: flex; flex-wrap: wrap; gap: 14px; color: #68748a; font-size: 10.5px;
        }
        .managed-reel-glass__summary strong { color: #263653; font-weight: 750; }
        .managed-reel-glass__summary strong.is-negative { color: #b45353; }
        .managed-reel-glass__caption {
          display: -webkit-box; overflow: hidden; margin: 0; color: #59667d;
          font-family: 'Newsreader', Georgia, serif; font-size: 12px; font-style: italic;
          line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
        }
        .managed-reel-glass__button {
          display: inline-flex; align-items: center; align-self: flex-start; gap: 7px;
          margin-top: auto; padding: 8px 14px; border: 1px solid rgba(255,255,255,.92);
          border-radius: 24px; background: linear-gradient(135deg, #263653, #435574);
          color: #fff; font-size: 11px; font-weight: 650; text-decoration: none;
          box-shadow: 0 4px 12px rgba(38,54,83,.16);
          transition: transform .18s ease, box-shadow .18s ease;
        }
        .managed-reel-glass__button:hover {
          transform: translateY(-1px); box-shadow: 0 7px 16px rgba(38,54,83,.2);
        }

        .managed-activity-glass { padding: 20px 22px; }
        .managed-activity-glass__timeline { position: relative; margin-top: 18px; }
        .managed-activity-glass__line {
          position: absolute; top: 14px; bottom: 14px; left: 16px; width: 1px;
          background: rgba(100,116,139,.25);
        }
        .managed-activity-glass__event {
          position: relative; display: flex; align-items: flex-start; gap: 12px;
          min-width: 0; padding: 8px 0;
        }
        .managed-activity-glass__brand {
          position: relative; z-index: 1; flex: 0 0 34px; width: 34px; height: 34px;
          border: 1px solid rgba(255,255,255,.9); border-radius: 10px;
          background: rgba(255,255,255,.65); box-shadow: 0 0 0 3px rgba(246,248,252,.8);
        }
        .managed-activity-glass__event-icon {
          position: absolute; right: -5px; bottom: -5px; display: flex; width: 16px; height: 16px;
          align-items: center; justify-content: center; border: 2px solid rgba(255,255,255,.95);
          border-radius: 50%; background: #354766; color: white;
        }
        .managed-activity-glass__details { flex: 1; min-width: 0; padding-top: 3px; }
        .managed-activity-glass__event-title {
          color: #35415a; font-size: 11px; line-height: 1.5; overflow-wrap: anywhere;
        }
        .managed-activity-glass__event-title strong { color: #17233f; font-weight: 700; }
        .managed-activity-glass__date { margin-top: 2px; color: #7d8799; font-size: 10px; }

        @media (max-width: 900px) {
          .managed-summary-spotlight-grid { grid-template-columns: minmax(0, 1fr); }
        }
        @media (max-width: 560px) {
          .managed-reel-glass { flex-direction: column; }
          .managed-reel-glass__media {
            flex: none; width: 100%; height: 245px; min-height: 245px;
            border-radius: 20px 20px 0 0;
          }
          .managed-reel-glass__body { padding: 18px; gap: 12px; }
          .managed-reel-glass__stat { padding: 10px; }
          .managed-reel-glass__stat-value { font-size: 17px; }
          .managed-activity-glass { padding: 18px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .managed-reel-glass__button { transition: none; }
        }
      `}</style>

      <style>{`
        /* Latest reels — frosted-glass gallery */
        .managed-latest-reels-panel {
          box-sizing: border-box;
          position: relative;
          isolation: isolate;
          min-width: 0;
          width: 100%;
          padding: 26px 28px 28px !important;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.92) !important;
          border-radius: 26px !important;
          background:
            radial-gradient(circle at 85% 0%, rgba(222, 230, 244, 0.48), transparent 38%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(246, 248, 252, 0.88)) !important;
          box-shadow:
            0 12px 32px rgba(25, 38, 65, 0.065),
            inset 0 1px 0 rgba(255, 255, 255, 0.98) !important;
          backdrop-filter: blur(22px);
          -webkit-backdrop-filter: blur(22px);
        }

        .managed-latest-reels-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
          min-width: 0;
        }

        .managed-latest-reels-title-group {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .managed-latest-reels-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          border: 1px solid rgba(255, 255, 255, 0.95);
          border-radius: 12px;
          color: #a64eaa;
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.94), rgba(239, 232, 246, 0.72));
          box-shadow: 0 4px 12px rgba(38, 54, 83, 0.06);
        }

        .managed-latest-reels-title {
          margin: 0;
          color: #17233f;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 20px;
          font-weight: 600;
          font-style: italic;
          line-height: 1.3;
        }

        .managed-latest-reels-subtitle {
          margin: 4px 0 0;
          color: #81899a;
          font-size: 12px;
          line-height: 1.5;
        }

        .managed-latest-reels-rail {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: clamp(190px, 18vw, 230px);
          gap: 16px;
          width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          padding: 2px 2px 12px;
          scroll-snap-type: x mandatory;
          overscroll-behavior-x: contain;
          scrollbar-width: thin;
          scrollbar-color: rgba(100, 116, 139, 0.3) transparent;
        }

        .managed-latest-reels-rail::-webkit-scrollbar { height: 6px; }
        .managed-latest-reels-rail::-webkit-scrollbar-track { background: transparent; }
        .managed-latest-reels-rail::-webkit-scrollbar-thumb {
          border-radius: 10px;
          background: rgba(100, 116, 139, 0.28);
        }

        .managed-latest-reel {
          position: relative;
          display: block;
          width: 100%;
          min-width: 0;
          aspect-ratio: 9 / 14;
          overflow: hidden;
          isolation: isolate;
          border: 1px solid rgba(255, 255, 255, 0.85);
          border-radius: 19px;
          background: #dce2ec;
          box-shadow: 0 8px 22px rgba(23, 35, 63, 0.11), inset 0 1px 0 rgba(255, 255, 255, 0.6);
          text-decoration: none;
          scroll-snap-align: start;
          transform: translateZ(0);
          transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease;
        }

        .managed-latest-reel > :first-child {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .managed-latest-reel__shade {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          background: linear-gradient(
            180deg,
            rgba(13, 22, 39, 0.2) 0%,
            rgba(13, 22, 39, 0) 27%,
            rgba(13, 22, 39, 0.03) 48%,
            rgba(13, 22, 39, 0.78) 100%
          );
        }

        .managed-latest-reel__brand {
          position: absolute;
          z-index: 2;
          top: 12px;
          left: 12px;
          display: flex;
          align-items: center;
          gap: 7px;
          max-width: calc(100% - 24px);
          padding: 5px 11px 5px 5px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.88);
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.92);
          box-shadow: 0 3px 12px rgba(15, 23, 42, 0.09);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .managed-latest-reel__brand span {
          overflow: hidden;
          color: #263653;
          font-size: 11px;
          font-weight: 700;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .managed-latest-reel__play {
          position: absolute;
          z-index: 2;
          top: 50%;
          left: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 43px;
          height: 43px;
          border: 1px solid rgba(255, 255, 255, 0.8);
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          color: white;
          opacity: 0;
          transform: translate(-50%, -44%) scale(0.88);
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.12);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          transition: opacity 180ms ease, transform 180ms ease;
          pointer-events: none;
        }

        .managed-latest-reel__play span { margin-left: 3px; font-size: 15px; }

        .managed-latest-reel__footer {
          position: absolute;
          z-index: 2;
          right: 14px;
          bottom: 14px;
          left: 14px;
          color: #fff;
        }

        .managed-latest-reel__views {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 18px;
          font-weight: 750;
          letter-spacing: -0.025em;
          line-height: 1.25;
          text-shadow: 0 1px 5px rgba(0, 0, 0, 0.2);
        }

        .managed-latest-reel__creator {
          margin-top: 4px;
          overflow: hidden;
          color: rgba(255, 255, 255, 0.83);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.045em;
          text-overflow: ellipsis;
          text-transform: uppercase;
          white-space: nowrap;
        }

        @media (hover: hover) {
          .managed-latest-reel:hover {
            z-index: 3;
            border-color: rgba(255, 255, 255, 1);
            box-shadow: 0 14px 30px rgba(23, 35, 63, 0.18);
            transform: translateY(-4px);
          }
          .managed-latest-reel:hover .managed-latest-reel__play {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }

        .managed-latest-reel:focus-visible {
          outline: 3px solid rgba(63, 81, 116, 0.6);
          outline-offset: 4px;
        }

        .managed-latest-reel:focus-visible .managed-latest-reel__play {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }

        @media (max-width: 720px) {
          .managed-latest-reels-panel { padding: 20px !important; border-radius: 22px !important; }
          .managed-latest-reels-rail { grid-auto-columns: 190px; gap: 12px; }
          .managed-latest-reel { border-radius: 16px; }
        }

        @media (max-width: 480px) {
          .managed-latest-reels-panel { padding: 16px !important; border-radius: 19px !important; }
          .managed-latest-reels-heading { align-items: flex-start; gap: 8px; margin-bottom: 16px; }
          .managed-latest-reels-title-group { gap: 9px; }
          .managed-latest-reels-icon { width: 31px; height: 31px; border-radius: 10px; }
          .managed-latest-reels-title { font-size: 18px; }
          .managed-latest-reels-subtitle { max-width: 230px; font-size: 11px; }
          .managed-latest-reels-rail { grid-auto-columns: 165px; gap: 11px; }
          .managed-latest-reel__brand { top: 9px; left: 9px; max-width: calc(100% - 18px); }
          .managed-latest-reel__footer { right: 11px; bottom: 11px; left: 11px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .managed-latest-reel,
          .managed-latest-reel__play { transition: none; }
        }
      `}</style>

      {d.latest.length > 0 && (
        <Reveal i={12} className="managed-latest-reels-panel">
          <div className="managed-latest-reels-heading">
            <div className="managed-latest-reels-title-group">
              <div className="managed-latest-reels-icon">
                <Sparkles size={17} />
              </div>
              <div>
                <h3 className="managed-latest-reels-title">Latest reels</h3>
                <p className="managed-latest-reels-subtitle">
                  Newest reels from managed-creator deals — hover to play
                </p>
              </div>
            </div>

            <LinkBtn onClick={go("assets")}>All reels →</LinkBtn>
          </div>

          <div className="managed-latest-reels-rail">
            {d.latest.map((deal) => (
              <RailReel key={deal.id} deal={deal} />
            ))}
          </div>
        </Reveal>
      )}
    </div>
  );
}
