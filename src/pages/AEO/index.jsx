/**
 * 5th Avenue — Internal Platform
 * AEOApp.jsx — Section 3: AEO / AI Visibility Engine
 * ─────────────────────────────────────────────────────────────────
 * Renamed from App.jsx. Works as a sub-section rendered inside
 * PlatformApp — fills the 40px-subtracted content area.
 *
 * Receives `role` prop from PlatformApp.
 * Maps platform roles to AEO module access:
 *   founder         → all modules
 *   aeo_consultant  → all modules
 *   aeo_specialist  → Audit, Recs, Develop, Projects, Intelligence
 *   seo_analyst     → Company, Audit, Market, Projects, Intelligence
 *   content_lead    → Develop, Projects, Intelligence, Reporting
 *   strategist      → Market, Recs, Develop, Intelligence, Reporting
 */

import { useState, useEffect, useCallback } from "react";

import PortfolioDashboard  from "./PortfolioDashboard";
import CompanyOverview     from "./CompanyOverview";
import AuditCentre         from "./AuditCentre";
import MarketPosition      from "./MarketPosition";
import RecommendationsHub  from "./RecommendationsHub";
import DevelopCentre       from "./DevelopCentre";
import ProjectWorkspace    from "./ProjectWorkspace";
import IntelligenceCentre  from "./IntelligenceCentre";
import ReportingCentre     from "./ReportingCentre";
import FAVIScore           from "./FAVIScore";
import SoftwareFlow        from "./SoftwareFlow";
import PlatformFlowChart   from "./PlatformFlowChart";

import { T } from "../../theme/tokens";

// ── ROUTE DEFINITIONS ─────────────────────────────────────────────────────────
const ALL_ROUTES = [
  // Section: Overview
  { id:"portfolio",    label:"Portfolio",           num:"00", icon:"◻", section:"Overview",
    roles:["founder","aeo_consultant"],
    component:PortfolioDashboard, desc:"Agency-wide daily view" },

  // Section: Intelligence
  { id:"company",      label:"Company Overview",    num:"01", icon:"⊞", section:"Intelligence",
    roles:["founder","aeo_consultant","seo_analyst"],
    component:CompanyOverview,    desc:"Client intelligence hub" },
  { id:"audit",        label:"Audit Centre",        num:"02", icon:"◎", section:"Intelligence",
    roles:["founder","aeo_consultant","aeo_specialist","seo_analyst"],
    component:AuditCentre,        desc:"Master diagnostic workspace" },
  { id:"market",       label:"Market Position",     num:"03", icon:"⇅", section:"Intelligence",
    roles:["founder","aeo_consultant","seo_analyst","strategist"],
    component:MarketPosition,     desc:"Competitive strategy" },

  // Section: Strategy
  { id:"recs",         label:"Recommendations",     num:"04", icon:"≡", section:"Strategy",
    roles:["founder","aeo_consultant","aeo_specialist","strategist"],
    component:RecommendationsHub, desc:"Risks + opportunities" },
  { id:"develop",      label:"Develop Centre",      num:"05", icon:"◈", section:"Strategy",
    roles:["founder","aeo_consultant","aeo_specialist","content_lead","strategist"],
    component:DevelopCentre,      desc:"Work package generation" },

  // Section: Execution
  { id:"projects",     label:"Project Workspace",   num:"06", icon:"▦", section:"Execution",
    roles:["founder","aeo_consultant","aeo_specialist","seo_analyst","content_lead","strategist"],
    component:ProjectWorkspace,   desc:"Tasks + projects + SLA" },

  // Section: Monitoring
  { id:"intelligence", label:"Intelligence Centre", num:"07", icon:"◉", section:"Monitoring",
    roles:["founder","aeo_consultant","aeo_specialist","seo_analyst","content_lead","strategist"],
    component:IntelligenceCentre, desc:"Signals + KPIs + trends" },

  // Section: Delivery
  { id:"reporting",    label:"Reporting Centre",    num:"08", icon:"↗", section:"Delivery",
    roles:["founder","aeo_consultant","content_lead","strategist"],
    component:ReportingCentre,    desc:"Client-facing outputs" },

  // Section: Tools
  { id:"faavi",        label:"FAAVI Score",         icon:"★", section:"Tools",
    roles:["founder","aeo_consultant","aeo_specialist","seo_analyst","content_lead","strategist"],
    component:FAVIScore,          desc:"Visibility index showcase" },
  { id:"flow",         label:"Platform Flow",       icon:"→", section:"Tools",
    roles:["founder","aeo_consultant"],
    component:SoftwareFlow,       desc:"Workflow reference" },
  { id:"flowchart",    label:"Flow Chart",          icon:"◧", section:"Tools",
    roles:["founder","aeo_consultant"],
    component:PlatformFlowChart,  desc:"Client journey map" },
];

const DEFAULT_ROUTE = "portfolio";

// ── HELPERS ───────────────────────────────────────────────────────────────────
const canAccess = (route, role) =>
  route.roles.includes(role) || route.roles.includes("founder");

// ── NAV ITEM ──────────────────────────────────────────────────────────────────
function NavItem({ item, active, collapsed, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={collapsed ? item.label : ""}
      style={{
        display:"flex", alignItems:"center",
        gap:9, padding: collapsed ? "8px 0" : "7px 12px",
        justifyContent: collapsed ? "center" : "flex-start",
        borderRadius:6, cursor:"pointer", marginBottom:2,
        borderLeft:`2px solid ${active ? T.accent : "transparent"}`,
        background: active ? T.raised : hovered ? T.hover : "transparent",
        transition:"all 0.12s",
      }}>
      <span style={{
        fontSize:12, lineHeight:1, flexShrink:0,
        color: active ? T.accent : hovered ? T.text : T.sub,
        width:16, textAlign:"center",
      }}>
        {item.icon}
      </span>
      {!collapsed && (
        <span style={{
          fontSize:11, fontWeight: active ? 600 : 400,
          color: active ? T.text : hovered ? T.text : T.sub,
          flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
        }}>
          {item.label}
        </span>
      )}
      {!collapsed && item.num && (
        <span style={{ fontSize:8.5, color: active ? T.accent : T.mute,
          fontWeight:600, flexShrink:0 }}>
          {item.num}
        </span>
      )}
    </div>
  );
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
function AEONav({ route, onRoute, collapsed, onToggle, role }) {
  // Filter routes by current role
  const accessible = ALL_ROUTES.filter(r => canAccess(r, role));

  // Group by section
  const sections = accessible.reduce((acc, r) => {
    if (!acc[r.section]) acc[r.section] = [];
    acc[r.section].push(r);
    return acc;
  }, {});

  return (
    <div style={{
      width: collapsed ? 48 : 192, flexShrink:0,
      height:"100%", background:T.surface,
      borderRight:`1px solid ${T.border}`,
      display:"flex", flexDirection:"column",
      transition:"width 0.18s ease", overflow:"hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: collapsed ? "10px 0" : "10px 16px",
        borderBottom:`1px solid ${T.border}`,
        display:"flex", alignItems:"center",
        justifyContent: collapsed ? "center" : "space-between",
        flexShrink:0, minHeight:44,
      }}>
        {!collapsed && (
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:T.amber,
              textTransform:"uppercase", letterSpacing:"0.1em", lineHeight:1 }}>
              AEO
            </div>
            <div style={{ fontSize:8.5, color:T.label, marginTop:2 }}>
              AI Visibility Engine
            </div>
          </div>
        )}
        {collapsed && (
          <span style={{ fontSize:11, color:T.amber, fontWeight:700 }}>◉</span>
        )}
        <button onClick={onToggle} style={{
          background:"transparent", border:"none", cursor:"pointer",
          color:T.label, fontSize:11, padding:4, borderRadius:4,
          display:"flex", alignItems:"center", justifyContent:"center",
          flexShrink:0,
        }}>
          {collapsed ? "»" : "«"}
        </button>
      </div>

      {/* Nav */}
      <div style={{ flex:1, overflowY:"auto",
        padding: collapsed ? "8px 4px" : "10px 8px" }}>
        {Object.entries(sections).map(([section, items], si) => (
          <div key={section} style={{ marginBottom: collapsed ? 8 : 14 }}>
            {!collapsed && (
              <div style={{
                fontSize:8.5, fontWeight:700, color:T.mute,
                textTransform:"uppercase", letterSpacing:"0.1em",
                padding:"2px 12px 5px",
              }}>
                {section}
              </div>
            )}
            {collapsed && si > 0 && (
              <div style={{ height:1, background:T.border,
                margin:"4px 4px 8px" }} />
            )}
            {items.map(item => (
              <NavItem key={item.id} item={item}
                active={route === item.id}
                collapsed={collapsed}
                onClick={() => onRoute(item.id)} />
            ))}
          </div>
        ))}
      </div>

      {/* Role indicator */}
      {!collapsed && (
        <div style={{
          padding:"8px 16px", borderTop:`1px solid ${T.border}`,
          flexShrink:0,
        }}>
          <div style={{ fontSize:8.5, color:T.label }}>
            Role: <span style={{ color:T.sub }}>
              {role?.replace(/_/g," ").replace(/\b\w/g, c => c.toUpperCase())}
            </span>
          </div>
          <div style={{ fontSize:8, color:T.mute, marginTop:2 }}>
            {accessible.length} modules accessible
          </div>
        </div>
      )}
    </div>
  );
}

// ── COMMAND PALETTE ───────────────────────────────────────────────────────────
function CommandPalette({ role, onRoute, onClose }) {
  const [q, setQ] = useState("");
  const accessible = ALL_ROUTES.filter(r => canAccess(r, role));
  const matches = accessible.filter(r =>
    r.label.toLowerCase().includes(q.toLowerCase()) ||
    r.desc?.toLowerCase().includes(q.toLowerCase()) ||
    r.num?.includes(q)
  );

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.7)",
      zIndex:500, display:"flex", alignItems:"flex-start",
      justifyContent:"center", paddingTop:100,
    }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width:480, background:T.surface,
        border:`1px solid ${T.borderMid}`,
        borderRadius:10, overflow:"hidden",
        boxShadow:"0 24px 64px rgba(0,0,0,0.6)",
      }}>
        <div style={{
          display:"flex", alignItems:"center", gap:10,
          padding:"12px 16px", borderBottom:`1px solid ${T.border}`,
        }}>
          <span style={{ color:T.label, fontSize:13 }}>⌕</span>
          <input autoFocus value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && matches.length > 0) {
                onRoute(matches[0].id); onClose();
              }
            }}
            placeholder="Search AEO modules…"
            style={{ flex:1, background:"transparent", border:"none",
              outline:"none", color:T.text, fontSize:13, fontFamily:"'Sora'" }} />
          <span style={{ fontSize:9, color:T.label, padding:"2px 6px",
            background:T.mute, borderRadius:4 }}>ESC</span>
        </div>
        <div style={{ maxHeight:320, overflowY:"auto" }}>
          {matches.length === 0 ? (
            <div style={{ padding:"20px", textAlign:"center",
              color:T.sub, fontSize:11 }}>No modules found</div>
          ) : matches.map((item, i) => (
            <div key={item.id}
              onClick={() => { onRoute(item.id); onClose(); }}
              style={{
                padding:"10px 16px", cursor:"pointer",
                borderBottom: i < matches.length-1 ? `1px solid ${T.border}` : "none",
                display:"flex", alignItems:"center", gap:12,
              }}
              onMouseOver={e => e.currentTarget.style.background = T.hover}
              onMouseOut={e  => e.currentTarget.style.background = "transparent"}>
              <span style={{ fontSize:13, color:T.sub, width:18,
                textAlign:"center", flexShrink:0 }}>{item.icon}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11.5, color:T.text,
                  fontWeight:500 }}>{item.label}</div>
                <div style={{ fontSize:9.5, color:T.sub }}>
                  {item.section}{item.desc ? ` · ${item.desc}` : ""}
                </div>
              </div>
              {item.num && (
                <span style={{ fontSize:9, color:T.label, padding:"2px 6px",
                  background:T.mute, borderRadius:4, flexShrink:0 }}>
                  {item.num}
                </span>
              )}
            </div>
          ))}
        </div>
        <div style={{ padding:"8px 16px", borderTop:`1px solid ${T.border}`,
          display:"flex", gap:12 }}>
          {[["↵","Select"],["Esc","Close"]].map(([k,l]) => (
            <div key={k} style={{ display:"flex", gap:5, alignItems:"center",
              fontSize:9, color:T.label }}>
              <span style={{ padding:"1px 5px", background:T.mute,
                borderRadius:3, fontWeight:600 }}>{k}</span>
              <span>{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── AEO APP ROOT ──────────────────────────────────────────────────────────────
export default function AEOApp({ role = "aeo_consultant" }) {
  const accessible    = ALL_ROUTES.filter(r => canAccess(r, role));
  const defaultRoute  = accessible.find(r => r.id === DEFAULT_ROUTE)?.id
                        || accessible[0]?.id;

  const [route,     setRoute]     = useState(defaultRoute);
  const [collapsed, setCollapsed] = useState(false);
  const [palette,   setPalette]   = useState(false);

  // Keep route valid when role changes
  useEffect(() => {
    const current = ALL_ROUTES.find(r => r.id === route);
    if (current && !canAccess(current, role)) {
      const fallback = accessible[0];
      if (fallback) setRoute(fallback.id);
    }
  }, [role]);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault(); setPalette(p => !p);
      }
      if (e.key === "Escape") setPalette(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const navigate = useCallback((id) => setRoute(id), []);

  const ActiveRoute = ALL_ROUTES.find(r => r.id === route);
  const ActiveComponent = ActiveRoute?.component;
  const hasAccess = ActiveRoute ? canAccess(ActiveRoute, role) : false;

  return (
    <div style={{
      display:"flex", height:"100%", width:"100%",
      background:T.bg, fontFamily:"'Sora', sans-serif",
      color:T.text, overflow:"hidden",
    }}>
      <AEONav
        route={route}
        onRoute={navigate}
        collapsed={collapsed}
        onToggle={() => setCollapsed(p => !p)}
        role={role} />

      <div style={{ flex:1, minWidth:0, position:"relative", overflow:"hidden" }}>
        {hasAccess && ActiveComponent ? (
          <div key={`${route}-${role}`} style={{
            width:"100%", height:"100%",
            animation:"fadeIn 0.14s ease both",
          }}>
            <ActiveComponent role={role} />
          </div>
        ) : (
          <div style={{ height:"100%", display:"flex", alignItems:"center",
            justifyContent:"center", flexDirection:"column", gap:10 }}>
            <div style={{ fontSize:22, color:T.mute }}>◎</div>
            <div style={{ fontSize:11, color:T.sub }}>
              Select a module from the sidebar
            </div>
          </div>
        )}

        {/* ⌘K button */}
        <button onClick={() => setPalette(true)} style={{
          position:"absolute", bottom:20, right:20, zIndex:30,
          display:"flex", alignItems:"center", gap:8,
          padding:"7px 12px", background:T.raised,
          border:`1px solid ${T.borderMid}`, borderRadius:6,
          color:T.sub, fontSize:10, cursor:"pointer",
          fontFamily:"'Sora'", boxShadow:"0 4px 12px rgba(0,0,0,0.4)",
        }}>
          <span>⌕</span>
          <span>Search</span>
          <span style={{ fontSize:9, padding:"1px 5px", background:T.mute,
            borderRadius:4, color:T.label }}>⌘K</span>
        </button>
      </div>

      {palette && (
        <CommandPalette role={role} onRoute={navigate}
          onClose={() => setPalette(false)} />
      )}
    </div>
  );
}
