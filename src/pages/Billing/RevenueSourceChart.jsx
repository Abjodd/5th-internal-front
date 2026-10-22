/**
 * 5th Avenue — Revenue by source (Billing dashboard)
 * ─────────────────────────────────────────────────────────────────
 * A donut of where revenue is actually coming from: client campaign billing,
 * split by whether the booked creator is one we manage, one a vendor
 * manages, or neither — plus Managed Creator Projects, the standalone deals
 * a managed creator runs outside any campaign (models/Project.js).
 *
 * `slices` is pre-computed by the caller ({ key, label, value, color }[]) —
 * this component only draws. Built as a plain SVG stroke-dasharray donut
 * rather than a charting dependency: four slices, one page, no axes.
 *
 * Categorical colors are the app's own existing per-concept tokens (the same
 * teal already means "Managed by Fifth Avenue" on a creator card, the same
 * gold already means "vendor"), not a separate chart palette — identity,
 * not decoration. Validated for CVD/contrast with the dataviz skill's
 * checker before being assigned here.
 */
import { useState } from "react";
import { T } from "../../theme/tokens";
import { fmtINR } from "../../lib/format";

const fmtExact = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");

const SIZE = 260;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 92;
const STROKE = 34;
const CIRC = 2 * Math.PI * R;
const GAP = 3; // px of track left transparent between adjacent slices

export default function RevenueSourceChart({ title = "Revenue by Source", slices, sub }) {
  const [hover, setHover] = useState(null); // slice key

  const total = slices.reduce((s, x) => s + Math.max(0, x.value || 0), 0);
  const nonZero = slices.filter(x => x.value > 0).length;

  // Cumulative offset in path units, one slice at a time — each slice is its
  // own full-circumference <circle> with a dasharray covering only its own
  // arc, shifted into place with strokeDashoffset. Standard stroke-based pie.
  let cursor = 0;
  const arcs = slices.map((s) => {
    const frac = total > 0 ? Math.max(0, s.value || 0) / total : 0;
    const len = frac * CIRC;
    const drawLen = nonZero > 1 ? Math.max(0, len - GAP) : len;
    const startOffset = cursor;
    const midAngleDeg = -90 + ((cursor + len / 2) / CIRC) * 360;
    cursor += len;
    return { ...s, frac, len, drawLen, startOffset, midAngleDeg };
  });

  const rad = (deg) => (deg * Math.PI) / 180;
  const labelPoint = (deg, radius) => ({
    x: CX + radius * Math.cos(rad(deg)),
    y: CY + radius * Math.sin(rad(deg)),
  });

  const sorted = [...arcs].sort((a, b) => b.value - a.value);

  return (
    <div style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 7, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontFamily: "'Newsreader',serif", fontSize: 15, fontWeight: 600, color: T.text, fontStyle: "italic" }}>{title}</div>
        {sub && <div style={{ fontSize: 9.5, color: T.label }}>{sub}</div>}
      </div>

      {total <= 0 ? (
        <div style={{ fontSize: 11, color: T.label, fontStyle: "italic", padding: "24px 0", textAlign: "center" }}>
          No revenue recorded yet.
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ flexShrink: 0 }}>
            <circle cx={CX} cy={CY} r={R} fill="none" stroke={T.mute} strokeWidth={STROKE} />
            {arcs.filter(a => a.value > 0).map((a) => {
              const isHover = hover === a.key;
              const isDim = hover && hover !== a.key;
              return (
                <circle
                  key={a.key}
                  cx={CX} cy={CY} r={R} fill="none"
                  stroke={a.color}
                  strokeWidth={isHover ? STROKE + 6 : STROKE}
                  strokeDasharray={`${a.drawLen} ${CIRC - a.drawLen}`}
                  strokeDashoffset={-a.startOffset}
                  strokeLinecap="butt"
                  transform={`rotate(-90 ${CX} ${CY})`}
                  opacity={isDim ? 0.35 : 1}
                  style={{ transition: "stroke-width 0.12s ease, opacity 0.12s ease", cursor: "pointer" }}
                  onMouseEnter={() => setHover(a.key)}
                  onMouseLeave={() => setHover(null)}
                >
                  <title>{`${a.label} — ${fmtExact(a.value)} (${(a.frac * 100).toFixed(1)}%)`}</title>
                </circle>
              );
            })}
            {/* Direct labels — only where a slice has room to carry one, so this
                stays "selective," not a percentage crammed onto every sliver. */}
            {arcs.filter(a => a.frac >= 0.08).map((a) => {
              const p = labelPoint(a.midAngleDeg, R);
              return (
                <text key={`${a.key}-lbl`} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central"
                  style={{ fontSize: 11, fontWeight: 700, fill: "#FFFFFF", fontFamily: "'Sora'", pointerEvents: "none" }}>
                  {Math.round(a.frac * 100)}%
                </text>
              );
            })}
            {/* Center hole — the total, since a donut's hole is otherwise just
                air; this is the one figure the chart is ultimately standing in for. */}
            <text x={CX} y={CY - 7} textAnchor="middle" style={{ fontSize: 9, fill: T.label, fontFamily: "'Sora'", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {hover ? sorted.find(s => s.key === hover)?.label : "Total Revenue"}
            </text>
            <text x={CX} y={CY + 13} textAnchor="middle" style={{ fontSize: 17, fontWeight: 700, fill: T.text, fontFamily: "'Sora'" }}>
              {fmtINR(hover ? arcs.find(a => a.key === hover)?.value : total)}
            </text>
          </svg>

          {/* Legend — always present, carries the exact figure a direct label
              on a thin slice can't fit. */}
          <div style={{ flex: 1, minWidth: 180 }}>
            {sorted.map((a) => (
              <div key={a.key}
                onMouseEnter={() => setHover(a.key)}
                onMouseLeave={() => setHover(null)}
                style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "7px 4px",
                  borderRadius: 5, cursor: "pointer",
                  background: hover === a.key ? `${a.color}10` : "transparent",
                  opacity: hover && hover !== a.key ? 0.5 : 1,
                  transition: "background 0.12s ease, opacity 0.12s ease",
                }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: a.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.label}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: T.text }}>{fmtINR(a.value)}</div>
                  <div style={{ fontSize: 9, color: T.label }}>{(a.frac * 100).toFixed(1)}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
