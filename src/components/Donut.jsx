import { motion } from "motion/react";

/**
 * 5th Avenue — Donut
 *
 * A ring chart and nothing else. Deliberately presentational: hover
 * explanations, click-to-expand and tooltips are the caller's business — an
 * earlier version owned its own tooltip, so every consumer inherited a popup
 * clipped by whichever card it was rendered inside.
 *
 * Segments are stroke-dasharray on one circle rather than arc paths: no
 * trigonometry, and the gap between segments is a dash gap rather than a mask.
 *
 * `center` is a node, not a number, so a caller can put a count over a label.
 */
const SF = "'SF Pro Display','-apple-system','BlinkMacSystemFont','Helvetica Neue',sans-serif";

export default function Donut({
  segments = [],
  size = 52,
  thickness = 6,
  center = null,
  centerSize,
  track = "rgba(0,0,0,0.06)",
  animate = true,
  style = {},
}) {
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + Math.max(0, x.value || 0), 0);

  // Running offset, so each segment starts where the previous one ended.
  let acc = 0;
  const arcs = segments.map((seg, i) => {
    const frac = total > 0 ? Math.max(0, seg.value || 0) / total : 0;
    const arc = { ...seg, frac, offset: acc, key: seg.label || i };
    acc += frac;
    return arc;
  });

  return (
    <div style={{ position:"relative", width:size, height:size, flexShrink:0, ...style }}>
      <svg width={size} height={size} style={{ display:"block", transform:"rotate(-90deg)" }} aria-hidden>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={track} strokeWidth={thickness} />
        {arcs.map(a => a.frac > 0 && (
          <motion.circle
            key={a.key} cx={size/2} cy={size/2} r={r} fill="none"
            stroke={a.color} strokeWidth={thickness} strokeLinecap="butt"
            strokeDasharray={`${a.frac * circ} ${circ}`}
            initial={animate ? { strokeDashoffset: 0, opacity: 0 } : false}
            animate={{ strokeDashoffset: -a.offset * circ, opacity: 1 }}
            transition={{ type:"spring", stiffness:180, damping:26 }}
          />
        ))}
      </svg>
      {center != null && (
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center", fontFamily:SF, lineHeight:1,
          fontSize: centerSize || Math.max(9, size * 0.26), fontWeight:700, color:"#1D1D1F",
          letterSpacing:"-0.02em", pointerEvents:"none" }}>
          {center}
        </div>
      )}
    </div>
  );
}
