/**
 * 5th Avenue — Internal Platform
 * FounderSummary.jsx — Section 0
 * ─────────────────────────────────────────────────────────────────
 * Founder-only cross-section overview.
 * Placeholder — full build to follow once content is confirmed. The data
 * this page will eventually show doesn't exist yet, so the redesign here is
 * purely about presentation: motion, depth and hierarchy on the same eight
 * planned-widget cards, rather than inventing numbers that aren't real.
 *
 * Visual identity: quiet modern formal — ivory surfaces, deep navy accent,
 * Newsreader for display type, Sora for UI, soft Apple-style card
 * elevation. Content and structure unchanged from the original.
 */

import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "motion/react";
import { Clock } from "lucide-react";

const F = {
  paper:     "#FAFAF9",
  surface:   "#FFFFFF",
  ink:       "#14151A",
  inkSoft:   "#6E7077",
  label:     "#9C9EA6",
  hairline:  "#E7E6E2",
  navy:      "#1E2A44",
  navyTint:  "#EEF1F6",
  amber:     "#8C6B2E",
  amberTint: "#F6EFE2",
  shadowSm:  "0 1px 2px rgba(20,21,26,0.04)",
  shadowMd:  "0 1px 2px rgba(20,21,26,0.04), 0 8px 24px rgba(20,21,26,0.07)",
  shadowLg:  "0 20px 48px rgba(20,21,26,0.12)",
};

const Lbl = ({ children, color, style={} }) =>
  <span style={{ fontSize:10, fontWeight:600, color:color||F.label,
    textTransform:"uppercase", letterSpacing:"0.07em", ...style }}>{children}</span>;

// Muted, formal category palette — replaces the old bright T.* colors
const CAT = {
  forest: { c:"#24413A", tint:"#EBF0EE" },
  navy:   { c:"#1E2A44", tint:"#EEF1F6" },
  ochre:  { c:"#8C6B2E", tint:"#F6EFE2" },
  plum:   { c:"#4A2E42", tint:"#F3EDF0" },
  rust:   { c:"#8C3B2E", tint:"#F7ECE9" },
};

// Planned widgets — shown as placeholder cards
const PLANNED = [
  {
    id:"revenue",
    icon:"₹",
    cat: CAT.forest,
    title:"Revenue & Billing Health",
    desc:"Outstanding invoices, monthly revenue, retainer renewals due, billing anomalies from Section 2.",
    source:"Section 2 — Billing",
  },
  {
    id:"im",
    icon:"◻",
    cat: CAT.navy,
    title:"IM Campaign Pipeline",
    desc:"Active campaigns, campaigns awaiting approval, live count, total creator spend this month.",
    source:"Section 1 — IM Operations",
  },
  {
    id:"aeo",
    icon:"◉",
    cat: CAT.ochre,
    title:"AEO Portfolio Health",
    desc:"Portfolio FAAVI average, clients at risk, open P1 recommendations, audit overdue alerts.",
    source:"Section 3 — AEO",
  },
  {
    id:"team",
    icon:"▦",
    cat: CAT.plum,
    title:"Team Utilization",
    desc:"Capacity by role, overdue tasks across sections, team members at limit (>85%).",
    source:"Section 3 — Project Workspace",
  },
  {
    id:"escalations",
    icon:"⚑",
    cat: CAT.rust,
    title:"Open Escalations",
    desc:"Critical items surfaced from all three sections requiring founder attention or decision.",
    source:"Cross-section",
  },
  {
    id:"signals",
    icon:"⟳",
    cat: CAT.plum,
    title:"Renewal & Upsell Signals",
    desc:"Clients where FAAVI trajectory or billing data supports a renewal or upsell conversation.",
    source:"Section 2 + Section 3",
  },
  {
    id:"decisions",
    icon:"→",
    cat: CAT.ochre,
    title:"Decisions Required",
    desc:"Budget approvals, campaign sign-offs, team additions, strategic calls awaiting founder input.",
    source:"Cross-section",
  },
  {
    id:"performance",
    icon:"◈",
    cat: CAT.forest,
    title:"Agency Performance",
    desc:"Revenue vs target, client satisfaction, delivery rate, SLA compliance across all services.",
    source:"Cross-section",
  },
];

const SECTIONS = new Set(PLANNED.map(w => w.source.split(/[—+]/)[0].trim()));

export default function FounderSummary() {
  const { user, brandFilter, brands } = useOutletContext() || {};
  const role = user?.role || "founder";
  const brandName = brands?.find(b => b.id === brandFilter)?.name || null;
  const [noted, setNoted] = useState(false);

  return (
    <div style={{
      height:"100%", background:F.paper,
      fontFamily:"'Sora', sans-serif", color:F.ink,
      overflowY:"auto",
    }}>

      {/* Header */}
      <div style={{
        position:"relative", overflow:"hidden",
        padding:"44px 44px 32px",
        borderBottom:`1px solid ${F.hairline}`,
        background:F.surface,
      }}>
        {/* Faint drifting mesh — a whisper of depth behind a page whose real
            content doesn't exist yet, not a hero treatment. */}
        <div style={{ position:"absolute", inset:0, pointerEvents:"none", overflow:"hidden" }}>
          <motion.div
            style={{
              position:"absolute", width:420, height:420, borderRadius:"50%",
              right:"-8%", top:"-30%", opacity:0.05, filter:"blur(90px)",
              background:`radial-gradient(circle, ${F.navy}, transparent 70%)`,
            }}
            animate={{ x:[0, 24, 0], y:[0, -16, 0] }}
            transition={{ duration:18, repeat:Infinity, ease:"easeInOut" }}
          />
          <motion.div
            style={{
              position:"absolute", width:320, height:320, borderRadius:"50%",
              right:"14%", bottom:"-40%", opacity:0.04, filter:"blur(80px)",
              background:`radial-gradient(circle, ${F.amber}, transparent 70%)`,
            }}
            animate={{ x:[0, -18, 0], y:[0, 14, 0] }}
            transition={{ duration:22, repeat:Infinity, ease:"easeInOut" }}
          />
        </div>

        <motion.div
          initial={{ opacity:0, y:10 }}
          animate={{ opacity:1, y:0 }}
          transition={{ duration:0.5, ease:[0.16,1,0.3,1] }}
          style={{ position:"relative", display:"flex", alignItems:"flex-start",
            justifyContent:"space-between", gap:20 }}
        >
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
              <span style={{ width:20, height:1, background:F.navy, opacity:0.35 }} />
              <Lbl color={F.navy}>Founder · Cross-section overview</Lbl>
            </div>
            <h1 style={{
              fontFamily:"'Newsreader',serif", fontSize:32,
              fontWeight:600, color:F.ink, fontStyle:"italic",
              margin:0, marginBottom:10, letterSpacing:"-0.01em",
            }}>
              Founder Summary
            </h1>
            <div style={{ fontSize:12.5, color:F.inkSoft, lineHeight:1.7, maxWidth:460 }}>
              A cross-section overview — IM, Billing and AEO in one view.
              Full content to be confirmed and built; the layout below shows
              what's planned.
            </div>
            {brandName && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                marginTop: 10, padding: "4px 14px",
                background: F.navyTint, borderRadius: 20,
                fontSize: 10.5, color: F.navy, fontWeight: 600,
                fontFamily: "'Sora', sans-serif",
              }}>
                <span style={{ opacity: 0.7 }}>◈</span>
                <span>Filtered to: {brandName}</span>
              </div>
            )}
          </div>
          <div style={{
            display:"flex", alignItems:"center", gap:6,
            padding:"6px 14px", borderRadius:20,
            background:F.amberTint, border:`1px solid ${F.amber}26`,
            fontSize:10.5, color:F.amber, fontWeight:600,
            whiteSpace:"nowrap", marginTop:4,
          }}>
            <Clock size={12} strokeWidth={2.2} />
            In Development
          </div>
        </motion.div>
      </div>

      {/* Planned widget grid */}
      <div style={{ padding:"32px 44px 44px" }}>
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          marginBottom:18, flexWrap:"wrap", gap:10,
        }}>
          <Lbl>Planned widgets — confirm content before build</Lbl>
          <div style={{ fontSize:10.5, color:F.label }}>
            {PLANNED.length} widgets across {SECTIONS.size} sections
          </div>
        </div>

        <motion.div
          initial="hide"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.05 } } }}
          style={{
            display:"grid",
            gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))",
            gap:16,
          }}
        >
          {PLANNED.map(widget => (
            <motion.div
              key={widget.id}
              variants={{
                hide: { opacity:0, y:14 },
                show: { opacity:1, y:0, transition:{ duration:0.45, ease:[0.16,1,0.3,1] } },
              }}
              whileHover={{ y:-3, boxShadow:F.shadowLg }}
              transition={{ boxShadow:{ duration:0.15 }, y:{ type:"spring", stiffness:340, damping:24 } }}
              style={{
                position:"relative", overflow:"hidden",
                padding:"20px 20px 18px",
                background:F.surface,
                borderRadius:14,
                border:`1px solid ${F.hairline}`,
                boxShadow:F.shadowSm,
              }}
            >
              {/* Category accent — a lit edge rather than a flat card */}
              <span style={{
                position:"absolute", left:0, top:0, bottom:0, width:3,
                background:widget.cat.c, opacity:0.7,
              }} />

              <div style={{ display:"flex", alignItems:"flex-start",
                justifyContent:"space-between", gap:10, marginBottom:12 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{
                    width:32, height:32, borderRadius:9,
                    background:`linear-gradient(155deg, ${widget.cat.tint}, ${widget.cat.tint}CC)`,
                    color:widget.cat.c,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:14, flexShrink:0,
                    boxShadow:`inset 0 0 0 1px ${widget.cat.c}1A`,
                  }}>
                    {widget.icon}
                  </div>
                  <span style={{ fontSize:13, fontWeight:600, color:F.ink, lineHeight:1.3 }}>
                    {widget.title}
                  </span>
                </div>
                <span style={{
                  flexShrink:0, fontSize:8.5, fontWeight:600, color:F.label,
                  border:`1px dashed ${F.hairline}`, borderRadius:5,
                  padding:"2px 6px", textTransform:"uppercase", letterSpacing:"0.05em",
                }}>
                  Planned
                </span>
              </div>
              <div style={{ fontSize:11.5, color:F.inkSoft,
                lineHeight:1.65, marginBottom:14 }}>
                {widget.desc}
              </div>
              <div style={{
                display:"inline-block", fontSize:9.5, color:widget.cat.c,
                background:widget.cat.tint, padding:"3px 9px", borderRadius:6,
                fontWeight:600, letterSpacing:"0.02em",
              }}>
                {widget.source}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

    </div>
  );
}
