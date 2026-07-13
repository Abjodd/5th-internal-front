/**
 * 5th Avenue — Internal Platform
 * FounderSummary.jsx — Section 0
 * ─────────────────────────────────────────────────────────────────
 * Founder-only cross-section overview.
 * Placeholder — full build to follow once content is confirmed.
 *
 * Visual identity: quiet modern formal — ivory surfaces, deep navy accent,
 * Newsreader for display type, Sora for UI, soft Apple-style card
 * elevation. Content and structure unchanged from the original.
 */

import { useState } from "react";
import { useOutletContext } from "react-router-dom";

const F = {
  paper:     "#FAFAF9",
  surface:   "#FFFFFF",
  ink:       "#14151A",
  inkSoft:   "#6E7077",
  label:     "#9C9EA6",
  hairline:  "#E7E6E2",
  navy:      "#1E2A44",
  navyTint:  "#EEF1F6",
  shadowSm:  "0 1px 2px rgba(20,21,26,0.04)",
  shadowMd:  "0 1px 2px rgba(20,21,26,0.04), 0 8px 24px rgba(20,21,26,0.07)",
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
        padding:"40px 44px 30px",
        borderBottom:`1px solid ${F.hairline}`,
        background:F.surface,
      }}>
        <div style={{ display:"flex", alignItems:"flex-start",
          justifyContent:"space-between", gap:20 }}>
          <div>
            <h1 style={{
              fontFamily:"'Newsreader',serif", fontSize:30,
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
            padding:"6px 13px", borderRadius:20,
            background:F.navyTint,
            fontSize:10.5, color:F.navy, fontWeight:600,
            whiteSpace:"nowrap", marginTop:4,
          }}>
            In Development
          </div>
        </div>
      </div>

      {/* Planned widget grid */}
      <div style={{ padding:"32px 44px 44px" }}>
        <div style={{ marginBottom:18 }}>
          <Lbl>Planned widgets — confirm content before build</Lbl>
        </div>

        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))",
          gap:16,
        }}>
          {PLANNED.map(widget => (
            <div key={widget.id} style={{
              padding:"20px 20px 18px",
              background:F.surface,
              borderRadius:14,
              border:`1px solid ${F.hairline}`,
              boxShadow:F.shadowSm,
              transition:"box-shadow 0.15s, transform 0.15s",
            }}
              onMouseOver={e => { e.currentTarget.style.boxShadow = F.shadowMd; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseOut={e => { e.currentTarget.style.boxShadow = F.shadowSm; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <div style={{ display:"flex", alignItems:"center",
                gap:10, marginBottom:12 }}>
                <div style={{
                  width:30, height:30, borderRadius:9,
                  background:widget.cat.tint, color:widget.cat.c,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:13, flexShrink:0,
                }}>
                  {widget.icon}
                </div>
                <span style={{ fontSize:13, fontWeight:600, color:F.ink, lineHeight:1.3 }}>
                  {widget.title}
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
            </div>
          ))}
        </div>

        
          
        
      </div>

    </div>
  );
}