/**
 * 5th Avenue — Internal OS
 * Module 8: Reporting Centre
 * ─────────────────────────────────────────────────────────────────
 * Client-facing output generation.
 * 7 report types — all assembled from live module data.
 * AI writes narrative sections with full company context.
 * Approval gate before any report reaches the client.
 * Send = publish to client dashboard + email notification.
 */

import { useState, useMemo } from "react";

// ── TOKENS ────────────────────────────────────────────────────────────────────
import { T } from "../../theme/tokens";

// ── REPORT TYPE DEFINITIONS ───────────────────────────────────────────────────
const REPORT_TYPES = {
  monthly:     { label:"Monthly Report",        color:T.accent,  icon:"◷", desc:"Regular performance update — KPIs, signals, work completed, next focus"    },
  quarterly:   { label:"Quarterly Report",      color:T.purple,  icon:"◈", desc:"Deeper strategic review — FAAVI progress, channel deep-dives, Q ahead plan" },
  audit:       { label:"Audit Report",          color:T.amber,   icon:"◎", desc:"Full channel diagnostic — findings, scores, priority issues, next steps"     },
  swot:        { label:"SWOT Analysis",         color:T.green,   icon:"◧", desc:"Strategic assessment — strengths, weaknesses, opportunities, threats"        },
  gap_analysis:{ label:"Gap Analysis",          color:T.red,     icon:"◫", desc:"Channel gaps with priority ranking, competitive context, action plan"         },
  roadmap:     { label:"Roadmap",               color:"#C47ABF", icon:"→", desc:"30/60/90-day execution plan — quick wins, priorities, strategic moves"        },
  competitive: { label:"Competitive Benchmark", color:"#4ADE80", icon:"⇅", desc:"Market position vs competitors — channel comparison, vulnerabilities, strategy"},
};

const REPORT_SECTIONS = {
  monthly:[
    { id:"exec",      title:"Executive Summary",    type:"narrative", cf:true  },
    { id:"faavi",     title:"FAAVI Score Overview",  type:"data",      cf:true  },
    { id:"kpis",      title:"KPI Dashboard",         type:"data",      cf:true  },
    { id:"signals",   title:"Key Signals This Month",type:"mixed",     cf:true  },
    { id:"completed", title:"Work Completed",        type:"narrative", cf:true  },
    { id:"next",      title:"Next Month Focus",      type:"narrative", cf:true  },
  ],
  quarterly:[
    { id:"exec",       title:"Executive Summary",    type:"narrative", cf:true  },
    { id:"faavi_prog", title:"FAAVI Progress",        type:"data",      cf:true  },
    { id:"kpi_review", title:"KPI Review",            type:"data",      cf:true  },
    { id:"channels",   title:"Channel Deep Dives",    type:"mixed",     cf:true  },
    { id:"strategy",   title:"Strategic Direction",   type:"narrative", cf:true  },
    { id:"next_q",     title:"Next Quarter Plan",     type:"narrative", cf:true  },
  ],
  audit:[
    { id:"exec",       title:"Executive Summary",    type:"narrative", cf:true  },
    { id:"faavi",      title:"FAAVI Score",           type:"data",      cf:true  },
    { id:"scorecard",  title:"Channel Scorecard",     type:"data",      cf:true  },
    { id:"findings",   title:"Key Findings",          type:"mixed",     cf:true  },
    { id:"priorities", title:"Priority Issues",       type:"data",      cf:true  },
    { id:"next_steps", title:"Recommended Next Steps",type:"narrative", cf:true  },
  ],
  swot:[
    { id:"exec",       title:"Executive Summary",      type:"narrative", cf:true  },
    { id:"strengths",  title:"Strengths",               type:"mixed",     cf:true  },
    { id:"weaknesses", title:"Weaknesses",              type:"mixed",     cf:true  },
    { id:"opps",       title:"Opportunities",           type:"mixed",     cf:true  },
    { id:"threats",    title:"Threats",                 type:"mixed",     cf:true  },
    { id:"strategy",   title:"Strategic Implications",  type:"narrative", cf:true  },
  ],
  gap_analysis:[
    { id:"exec",       title:"Executive Summary",       type:"narrative", cf:true  },
    { id:"channels",   title:"Channel Gap Summary",     type:"data",      cf:true  },
    { id:"p1_gaps",    title:"Priority Gaps",           type:"mixed",     cf:true  },
    { id:"competitive",title:"Competitive Context",     type:"narrative", cf:false },
    { id:"action",     title:"Action Plan",             type:"narrative", cf:true  },
  ],
  roadmap:[
    { id:"exec",       title:"Executive Summary",       type:"narrative", cf:true  },
    { id:"d30",        title:"30-Day Quick Wins",        type:"mixed",     cf:true  },
    { id:"d60",        title:"60-Day Priorities",        type:"mixed",     cf:true  },
    { id:"d90",        title:"90-Day Strategic Moves",   type:"narrative", cf:true  },
    { id:"kpi_targets",title:"KPI Targets",              type:"data",      cf:true  },
  ],
  competitive:[
    { id:"exec",       title:"Executive Summary",         type:"narrative", cf:true  },
    { id:"position",   title:"Market Position",           type:"data",      cf:true  },
    { id:"comparison", title:"Channel-by-Channel",        type:"data",      cf:true  },
    { id:"intel",      title:"Competitor Intelligence",   type:"narrative", cf:false },
    { id:"recommend",  title:"Strategic Recommendations", type:"narrative", cf:true  },
  ],
};

// ── CLIENTS ───────────────────────────────────────────────────────────────────
const CLIENTS = [
  { id:"fb", name:"FreshBite Foods",   init:"FB", faavi:72, pkg:"Growth",    phase:"bau",      contacts:["Rohan Mehta (CEO)","Priya Sharma (Marketing Head)"] },
  { id:"nb", name:"NutriBlend India",  init:"NB", faavi:61, pkg:"Growth",    phase:"launch",   contacts:["Aditya Rao (Founder)"] },
  { id:"ch", name:"CraftHome Decor",   init:"CH", faavi:53, pkg:"Starter",   phase:"audit",    contacts:["Deepika Nair (Owner)"] },
  { id:"df", name:"DermFirst",         init:"DF", faavi:68, pkg:"Enterprise",phase:"campaigns",contacts:["Dr. Kavita Singh (CMO)","Arjun Patel (Growth Lead)"] },
  { id:"tg", name:"TerraGrow Organic", init:"TG", faavi:44, pkg:"Starter",   phase:"audit",    contacts:["Sunita Krishnan (Founder)"] },
];

const TEAM = [
  { id:"t1", name:"Priya Nair",  init:"PN", role:"Consultant"  },
  { id:"t2", name:"Vikram Das",  init:"VD", role:"Consultant"  },
  { id:"t3", name:"Arjun Reddy", init:"AR", role:"Strategist"  },
  { id:"t4", name:"Sneha Iyer",  init:"SI", role:"AEO Spec."   },
  { id:"t5", name:"Meera Joshi", init:"MJ", role:"SEO Analyst" },
];

// ── REPORT HISTORY ────────────────────────────────────────────────────────────
const HISTORY_SEED = [
  {
    id:"rep1", cid:"fb", type:"monthly", period:"May 2026",
    status:"review", author:"t1", created:"27 May 2026", reviewer:"t2",
    generated:true,
    content:{
      exec:`May 2026 delivered measurable progress on FreshBite's digital visibility programme, with notable gains in organic search and a landmark featured snippet capture — offset by a growing AI citation gap that requires immediate action.\n\nYour FAAVI score holds at 72/100, placing FreshBite in the top third of tracked Food & Beverage brands. The Core Web Vitals improvement (LCP: 4.2s → 3.1s) following the image optimisation sprint will compound as Google re-indexes improved pages.\n\nTwo high-priority signals require attention: ChatGPT has stopped citing FreshBite for three tracked category queries, and Happilo has displaced FreshBite in Perplexity for three additional queries. The AI Citation Campaign — now in planning — is the correct response, and we recommend approving it for immediate execution in June.`,
      faavi:`FAAVI Score: 72/100 (Grade B — Strong)\n\nChannel breakdown:\n  AEO           68/100    ↑ +2 pts\n  SEO           74/100    ↑ +1 pt\n  Maps / MEO    80/100    → stable\n  AI Presence   58/100    ↓ −2 pts  ⚑ attention\n  Reviews       85/100    ↑ +1 pt\n  Social        62/100    → stable\n\nPortfolio average: 61/100. FreshBite is 11 points above portfolio average.`,
      kpis:`KPI PERFORMANCE — MAY 2026\n\n  Organic sessions/mo    12,400    Target: 18,000    ↑ +400 vs Apr\n  Keywords in top 10         43    Target: 70        ↑ +2 vs Apr\n  Featured snippets           3    Target: 8         ↑ +1 vs Apr\n  Review response rate       22%   Target: 80%       ↑ +2% vs Apr\n  AI presence score          58    Target: 75        ↓ −1 vs Apr\n  Avg rating               4.4★   Target: 4.6★      → stable`,
      signals:`▼ HIGH  AI — ChatGPT stopped citing FreshBite for 3 category queries. Happilo cited in all 3.\n▼ HIGH  AI — Perplexity displacement: Happilo now appears in 3 queries where FreshBite previously ranked.\n▲ MED   Search — Featured snippet captured: 'ragi snacks benefits' (2.1K/mo, est. +340 sessions).\n▲ MED   Search — LCP improved from 4.2s to 3.1s following image optimisation sprint.\n↔ LOW   Reviews — 15 new reviews this month, avg rating 4.4★ maintained.`,
      completed:`Work delivered in May 2026:\n\n1. FAQ schema implemented on Millet Snacks product page (1 of 14 in sprint)\n2. Hero images converted to WebP across homepage and all product pages — LCP: 4.2s → 3.1s\n3. Featured snippet captured for 'ragi snacks benefits' — estimated +340 sessions/month\n4. Review response rate improved from 18% to 22% following template rollout\n5. Audit finding prioritisation completed — 5 P1 recommendations now in active development`,
      next:`June 2026 priorities:\n\n1. Complete Core Web Vitals — target LCP below 2.5s via JS bundle reduction and CLS fix. A full CWV pass unlocks ranking improvements across all mobile queries.\n\n2. Launch AI Citation Campaign — publish the Perplexity-first comparison article immediately. Recapturing Perplexity citations is achievable within 30 days; ChatGPT citations will follow in 60–90 days.\n\n3. Complete FAQ schema on remaining 13 product pages — compound AEO advantage heading into Q3.\n\n4. Claim 2 partner branch GBP listings (Koramangala + Bandra) — 15-minute task that unlocks local search visibility.`,
    },
  },
  {
    id:"rep2", cid:"fb", type:"audit", period:"Apr 2026",
    status:"sent", author:"t1", created:"15 Apr 2026", sentDate:"16 Apr 2026",
    generated:true, content:{},
  },
  {
    id:"rep3", cid:"nb", type:"audit", period:"Mar 2026",
    status:"sent", author:"t1", created:"10 Mar 2026", sentDate:"11 Mar 2026",
    generated:true, content:{},
  },
  {
    id:"rep4", cid:"df", type:"monthly", period:"May 2026",
    status:"draft", author:"t2", created:"27 May 2026",
    generated:false, content:{},
  },
  {
    id:"rep5", cid:"df", type:"competitive", period:"Q1 2026",
    status:"approved", author:"t2", created:"2 Apr 2026",
    generated:true, content:{
      exec:`DermFirst enters Q2 2026 from a position of growing momentum in AI visibility, offset by a persistent keyword gap versus category leader Minimalist. Perplexity now cites DermFirst for 6 dermatology queries — a foundation that, if built upon, positions the brand to break into ChatGPT citations within 60–90 days. The clinical credibility narrative remains DermFirst's clearest competitive differentiator and the strategic priority for the period ahead.`,
    },
  },
];

// ── GENERATION STAGES ─────────────────────────────────────────────────────────
const GEN_STAGES = [
  "Loading client profile and company context…",
  "Pulling channel scores and KPI data…",
  "Analysing signals and findings…",
  "Generating narrative sections…",
  "Structuring report…",
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
const scoreColor = s  => s >= 70 ? T.green : s >= 50 ? T.amber : T.red;
const phaseColor = p  => ({ audit:T.label, launch:T.amber, bau:T.accent, campaigns:T.green })[p] || T.sub;
const phaseLabel = p  => ({ audit:"Audit", launch:"Launch", bau:"BAU", campaigns:"Campaigns" })[p] || p;
const statusColor= s  => ({ draft:T.sub, review:T.accent, approved:T.green, sent:T.label })[s] || T.sub;
const statusLabel= s  => ({ draft:"Draft", review:"In Review", approved:"Approved", sent:"Sent" })[s] || s;
const getTeam    = id => TEAM.find(t => t.id === id);
const getClient  = id => CLIENTS.find(c => c.id === id);

// ── ATOMS ─────────────────────────────────────────────────────────────────────
const Av  = ({ init, size=22 }) =>
  <div style={{ width:size, height:size, borderRadius:4, flexShrink:0, background:T.mute,
    display:"flex", alignItems:"center", justifyContent:"center",
    fontSize:Math.max(7,size*0.38), fontWeight:600, color:T.sub }}>{init}</div>;
const Lbl = ({ children, color, style={} }) =>
  <span style={{ fontSize:9, fontWeight:600, color:color||T.label,
    textTransform:"uppercase", letterSpacing:"0.08em", ...style }}>{children}</span>;
const Hr  = ({ style={} }) =>
  <div style={{ height:1, background:T.border, ...style }} />;
function Btn({ children, onClick, variant="ghost", disabled, style={} }) {
  const b = { padding:"6px 12px", borderRadius:5, fontSize:10.5, fontWeight:500,
    cursor:disabled?"not-allowed":"pointer", fontFamily:"'Sora'", border:"none",
    display:"inline-flex", alignItems:"center", gap:5, opacity:disabled?0.35:1 };
  const v = {
    primary:{ background:T.accent,  color:"#07080D", fontWeight:600 },
    ghost:  { background:T.hover,   color:T.sub, border:`1px solid ${T.border}` },
    subtle: { background:"transparent", color:T.label, border:`1px solid ${T.border}` },
    green:  { background:`${T.green}18`, color:T.green, border:`1px solid ${T.green}30` },
    danger: { background:"transparent", color:T.red, border:`1px solid ${T.red}22` },
  };
  return <button onClick={onClick} disabled={disabled}
    style={{...b,...(v[variant]||v.ghost),...style}}>{children}</button>;
}

// ── REPORT TYPE SELECTOR ──────────────────────────────────────────────────────
function ReportTypeSelector({ onSelect, onClose }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)",
      zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width:540, background:T.surface, borderRadius:10,
        border:`1px solid ${T.borderMid}`, overflow:"hidden" }}>
        <div style={{ padding:"16px 20px", borderBottom:`1px solid ${T.border}`,
          display:"flex", alignItems:"center" }}>
          <span style={{ fontSize:13, fontWeight:600, color:T.text, flex:1 }}>
            New Report
          </span>
          <button onClick={onClose} style={{ background:"transparent", border:"none",
            color:T.sub, fontSize:14, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ padding:"16px 20px",
          display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {Object.entries(REPORT_TYPES).map(([id, rt]) => (
            <div key={id} onClick={() => onSelect(id)}
              style={{ padding:"12px 14px", borderRadius:7, cursor:"pointer",
                border:`1px solid ${T.border}`, background:T.raised,
                transition:"all 0.12s" }}
              onMouseOver={e => e.currentTarget.style.borderColor = T.borderMid}
              onMouseOut={e  => e.currentTarget.style.borderColor = T.border}>
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:5 }}>
                <span style={{ fontSize:13, color:rt.color }}>{rt.icon}</span>
                <span style={{ fontSize:11, fontWeight:600, color:T.text }}>
                  {rt.label}
                </span>
              </div>
              <div style={{ fontSize:9.5, color:T.sub, lineHeight:1.45 }}>
                {rt.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── REPORT SECTION BLOCK ──────────────────────────────────────────────────────
function SectionBlock({ schema, content, onEdit, onRegen }) {
  const [editing, setEditing]   = useState(false);
  const [draft,   setDraft]     = useState(content || "");
  const [regening,setRegen]     = useState(false);
  const INP = { width:"100%", padding:"10px 12px", borderRadius:5,
    background:T.bg, border:`1px solid ${T.border}`,
    color:T.text, fontSize:11, fontFamily:"'Sora',monospace",
    outline:"none", lineHeight:1.65 };

  const handleRegen = () => {
    setRegen(true);
    setTimeout(() => setRegen(false), 1200);
  };

  const typeColor = { narrative:T.accent, data:T.green, mixed:T.amber }[schema.type] || T.sub;

  return (
    <div style={{ borderRadius:8, border:`1px solid ${T.border}`,
      background:T.raised, overflow:"hidden", marginBottom:10 }}>
      {/* Section header */}
      <div style={{ padding:"9px 14px", borderBottom:`1px solid ${T.border}`,
        display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:11, fontWeight:600, color:T.text, flex:1 }}>
          {schema.title}
        </span>
        <span style={{ fontSize:8, color:typeColor, padding:"1px 6px",
          borderRadius:3, border:`1px solid ${typeColor}28`,
          background:`${typeColor}10`, fontWeight:600, textTransform:"uppercase",
          letterSpacing:"0.07em" }}>
          {schema.type}
        </span>
        {schema.cf && (
          <span style={{ fontSize:8, color:T.green, padding:"1px 6px", borderRadius:3,
            border:`1px solid ${T.green}28`, background:`${T.green}08`,
            fontWeight:600, textTransform:"uppercase", letterSpacing:"0.07em" }}>
            Client-facing
          </span>
        )}
        <button onClick={() => setEditing(!editing)}
          style={{ fontSize:9, color:T.accent, background:"transparent",
            border:"none", cursor:"pointer", fontFamily:"'Sora'" }}>
          {editing ? "Done" : "Edit"}
        </button>
        <button onClick={handleRegen} disabled={regening}
          style={{ fontSize:9, color:T.sub, background:"transparent",
            border:"none", cursor:"pointer", fontFamily:"'Sora'",
            opacity:regening ? 0.4 : 1 }}>
          {regening ? "Generating…" : "↺ Regenerate"}
        </button>
      </div>
      {/* Content */}
      <div style={{ padding:"12px 14px" }}>
        {editing ? (
          <div>
            <textarea rows={Math.min(18, (draft||"").split("\n").length + 2)}
              value={draft} onChange={e => setDraft(e.target.value)}
              style={{ ...INP, resize:"vertical" }} />
            <div style={{ marginTop:8, display:"flex", gap:6 }}>
              <Btn variant="primary" style={{ fontSize:9.5, padding:"3px 10px" }}
                onClick={() => { onEdit && onEdit(schema.id, draft); setEditing(false); }}>
                Save
              </Btn>
              <Btn variant="subtle" style={{ fontSize:9.5, padding:"3px 10px" }}
                onClick={() => { setDraft(content||""); setEditing(false); }}>
                Discard
              </Btn>
            </div>
          </div>
        ) : regening ? (
          <div style={{ fontSize:10.5, color:T.sub, padding:"4px 0" }}>
            Regenerating section…
          </div>
        ) : (draft || content) ? (
          <pre style={{ fontSize:10.5, color:T.text, lineHeight:1.7,
            fontFamily:"'Sora'", whiteSpace:"pre-wrap", wordBreak:"break-word",
            margin:0 }}>{draft || content}</pre>
        ) : (
          <div style={{ fontSize:10.5, color:T.label, fontStyle:"italic" }}>
            Content will appear after generation.
          </div>
        )}
      </div>
    </div>
  );
}

// ── CLIENT PREVIEW ────────────────────────────────────────────────────────────
function ClientPreview({ report, client, onClose }) {
  const rt      = REPORT_TYPES[report.type];
  const sections = REPORT_SECTIONS[report.type] || [];
  return (
    <div style={{ position:"fixed", inset:0, background:T.bg, zIndex:50,
      overflowY:"auto", display:"flex", flexDirection:"column" }}>
      {/* Preview banner */}
      <div style={{ padding:"10px 24px", background:`${T.amber}14`,
        borderBottom:`1px solid ${T.amber}30`, display:"flex",
        alignItems:"center", gap:10, position:"sticky", top:0, zIndex:1 }}>
        <span style={{ fontSize:9.5, color:T.amber, fontWeight:600 }}>
          PREVIEW MODE — This is what the client sees
        </span>
        <div style={{ flex:1 }} />
        <Btn variant="ghost" onClick={onClose}
          style={{ fontSize:9.5, padding:"3px 12px" }}>
          ← Exit Preview
        </Btn>
      </div>

      {/* Report content */}
      <div style={{ maxWidth:780, margin:"0 auto", padding:"40px 32px", flex:1 }}>
        {/* Report header */}
        <div style={{ marginBottom:36 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
            <span style={{ fontSize:10, fontWeight:700, color:rt?.color,
              textTransform:"uppercase", letterSpacing:"0.1em" }}>
              Fifth Avenue
            </span>
            <span style={{ color:T.mute }}>·</span>
            <span style={{ fontSize:10, color:T.sub }}>{rt?.label}</span>
          </div>
          <div style={{ fontFamily:"'Newsreader',serif", fontSize:28,
            fontWeight:600, color:T.text, fontStyle:"italic", marginBottom:8 }}>
            {client.name}
          </div>
          <div style={{ fontSize:11, color:T.sub }}>{report.period}</div>
          <Hr style={{ marginTop:20 }} />
        </div>

        {/* Sections */}
        {sections.filter(s => s.cf).map(sec => {
          const content = report.content?.[sec.id];
          if (!content) return null;
          return (
            <div key={sec.id} style={{ marginBottom:32 }}>
              <div style={{ fontSize:11, fontWeight:700, color:T.text,
                textTransform:"uppercase", letterSpacing:"0.1em",
                marginBottom:14 }}>
                {sec.title}
              </div>
              <pre style={{ fontSize:12, color:T.sub, lineHeight:1.75,
                fontFamily:"'Sora'", whiteSpace:"pre-wrap",
                wordBreak:"break-word", margin:0 }}>
                {content}
              </pre>
              <Hr style={{ marginTop:24 }} />
            </div>
          );
        })}

        {/* Footer */}
        <div style={{ paddingTop:16, fontSize:9.5, color:T.label, textAlign:"center" }}>
          Report generated by Fifth Avenue · {report.period} · Confidential
        </div>
      </div>
    </div>
  );
}

// ── SEND MODAL ────────────────────────────────────────────────────────────────
function SendModal({ report, client, onSend, onClose }) {
  const [publishDash, setPublishDash] = useState(true);
  const [sendEmail,   setSendEmail]   = useState(true);
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)",
      zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width:440, background:T.surface, borderRadius:10,
        border:`1px solid ${T.borderMid}`, overflow:"hidden" }}>
        <div style={{ padding:"16px 20px", borderBottom:`1px solid ${T.border}`,
          display:"flex", alignItems:"center" }}>
          <span style={{ fontSize:13, fontWeight:600, color:T.text, flex:1 }}>
            Send Report
          </span>
          <button onClick={onClose} style={{ background:"transparent", border:"none",
            color:T.sub, fontSize:14, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ padding:"18px 20px", display:"flex", flexDirection:"column", gap:14 }}>
          {/* Report summary */}
          <div style={{ padding:"12px 14px", background:T.raised, borderRadius:7,
            border:`1px solid ${T.border}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:11, color:REPORT_TYPES[report.type]?.color }}>
                {REPORT_TYPES[report.type]?.icon}
              </span>
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:T.text }}>
                  {REPORT_TYPES[report.type]?.label} · {report.period}
                </div>
                <div style={{ fontSize:9.5, color:T.sub }}>{client.name}</div>
              </div>
            </div>
          </div>

          {/* Recipients */}
          <div>
            <Lbl style={{ display:"block", marginBottom:8 }}>Recipients</Lbl>
            <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
              {client.contacts.map(c => (
                <div key={c} style={{ fontSize:10.5, color:T.text,
                  display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ color:T.green, fontSize:9 }}>✓</span>
                  {c}
                </div>
              ))}
            </div>
          </div>

          <Hr />

          {/* Send options */}
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {[
              { val:publishDash, set:setPublishDash,
                label:"Publish to client dashboard",
                desc:"Report appears in the client's 5th Avenue portal immediately" },
              { val:sendEmail,   set:setSendEmail,
                label:"Send email notification",
                desc:"Notify contacts that a new report is available" },
            ].map(opt => (
              <div key={opt.label} onClick={() => opt.set(!opt.val)}
                style={{ display:"flex", alignItems:"flex-start", gap:10,
                  cursor:"pointer", padding:"8px 10px", borderRadius:6,
                  border:`1px solid ${opt.val ? T.accent+"30" : T.border}`,
                  background: opt.val ? `${T.accent}08` : T.raised }}>
                <div style={{ width:16, height:16, borderRadius:3, flexShrink:0,
                  marginTop:1, border:`1px solid ${opt.val ? T.accent : T.border}`,
                  background: opt.val ? `${T.accent}20` : "transparent",
                  display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {opt.val && <span style={{ fontSize:10, color:T.accent, fontWeight:700 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize:11, color:T.text, fontWeight:500 }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize:9, color:T.sub, marginTop:1 }}>{opt.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding:"12px 20px", borderTop:`1px solid ${T.border}`,
          display:"flex", gap:8 }}>
          <Btn variant="primary"
            onClick={() => { onSend({ publishDash, sendEmail }); onClose(); }}
            style={{ flex:1, justifyContent:"center" }}>
            Send Report
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

// ── REPORT BUILDER ────────────────────────────────────────────────────────────
function ReportBuilder({ report, client, onUpdate, onBack, showToast }) {
  const [genStage, setGenStage] = useState(-1);
  const [generated, setGenerated] = useState(report.generated);
  const [content,   setContent]   = useState(report.content || {});
  const [showPreview, setShowPreview] = useState(false);
  const [showSend,    setShowSend]    = useState(false);
  const [verifyNote,  setVerifyNote]  = useState("");

  const rt      = REPORT_TYPES[report.type];
  const sections = REPORT_SECTIONS[report.type] || [];
  const isReview  = report.status === "review";
  const isApproved = report.status === "approved";
  const isSent    = report.status === "sent";

  const runGeneration = () => {
    onUpdate(report.id, { status:"draft", generated:false });
    setGenerated(false);
    setGenStage(0);
    let s = 0;
    const iv = setInterval(() => {
      s++; setGenStage(s);
      if (s >= GEN_STAGES.length - 1) {
        clearInterval(iv);
        setTimeout(() => {
          // In production: Anthropic API call with full client context
          // System prompt: company profile, FAAVI scores, channel data, KPIs,
          //                signals, audit findings, competitors
          // Returns JSON keyed by section id
          const mockContent = {};
          sections.forEach(sec => {
            if (content[sec.id]) { mockContent[sec.id] = content[sec.id]; return; }
            mockContent[sec.id] =
              `[AI-generated: ${sec.title}]\n\n` +
              `Context used:\n— Client: ${client.name} (${client.pkg} tier)\n` +
              `— FAAVI: ${client.faavi}/100\n` +
              `— Period: ${report.period}\n\n` +
              `In production, Claude generates fully structured, client-ready narrative using all module data for this client.`;
          });
          setContent(mockContent);
          setGenerated(true);
          setGenStage(-1);
          onUpdate(report.id, { generated:true, content:mockContent, status:"draft" });
        }, 500);
      }
    }, 400);
  };

  const handleEdit = (secId, val) => {
    const updated = { ...content, [secId]:val };
    setContent(updated);
    onUpdate(report.id, { content:updated });
  };

  const handleSend = ({ publishDash, sendEmail }) => {
    onUpdate(report.id, { status:"sent", sentDate:`${new Date().toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}` });
    showToast(`Report sent to ${client.name}${sendEmail ? " · Email notification sent" : ""}`);
  };

  return (
    <>
      <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
        {/* Header */}
        <div style={{ padding:"13px 20px", borderBottom:`1px solid ${T.border}`,
          flexShrink:0, background:T.surface }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <button onClick={onBack}
              style={{ fontSize:10, color:T.sub, background:"transparent",
                border:"none", cursor:"pointer", fontFamily:"'Sora'",
                display:"flex", alignItems:"center", gap:4 }}>
              ← Reports
            </button>
            <span style={{ color:T.mute }}>·</span>
            <span style={{ fontSize:10, color:rt?.color }}>{rt?.icon}</span>
            <span style={{ fontSize:12, fontWeight:600, color:T.text, flex:1 }}>
              {rt?.label} — {report.period}
            </span>
            <span style={{ fontSize:10, fontWeight:500,
              color:statusColor(report.status) }}>
              {statusLabel(report.status)}
            </span>
            <div style={{ display:"flex", gap:6 }}>
              {!generated && genStage < 0 && !isSent && (
                <Btn variant="primary" onClick={runGeneration}
                  style={{ fontSize:9.5, padding:"4px 11px" }}>
                  Generate with AI →
                </Btn>
              )}
              {generated && !isSent && (
                <Btn variant="ghost" onClick={() => setShowPreview(true)}
                  style={{ fontSize:9.5, padding:"4px 11px" }}>
                  Preview as Client
                </Btn>
              )}
              {generated && !isApproved && !isSent && (
                <Btn variant="ghost"
                  onClick={() => onUpdate(report.id, { status:"review" })}
                  style={{ fontSize:9.5, padding:"4px 11px" }}>
                  Submit for Review
                </Btn>
              )}
              {isReview && (
                <Btn variant="green"
                  onClick={() => { onUpdate(report.id, { status:"approved" }); showToast("Report approved"); }}
                  style={{ fontSize:9.5, padding:"4px 11px" }}>
                  ✓ Approve
                </Btn>
              )}
              {isApproved && (
                <Btn variant="primary" onClick={() => setShowSend(true)}
                  style={{ fontSize:9.5, padding:"4px 11px" }}>
                  Send to Client →
                </Btn>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:"auto", padding:"18px 20px" }}>

          {/* Context bar */}
          <div style={{ display:"flex", gap:0, marginBottom:16, borderRadius:7,
            border:`1px solid ${T.border}`, background:T.raised, overflow:"hidden" }}>
            {[
              { l:"Client",  v:client.name    },
              { l:"Package", v:client.pkg     },
              { l:"FAAVI",   v:`${client.faavi}/100` },
              { l:"Phase",   v:phaseLabel(client.phase) },
              { l:"Period",  v:report.period  },
            ].map((item, i) => (
              <div key={item.l} style={{ flex:1, padding:"9px 12px",
                borderRight: i < 4 ? `1px solid ${T.border}` : "none" }}>
                <Lbl style={{ display:"block", marginBottom:3 }}>{item.l}</Lbl>
                <div style={{ fontSize:10.5, color:T.text }}>{item.v}</div>
              </div>
            ))}
          </div>

          {/* Generation progress */}
          {genStage >= 0 && (
            <div style={{ marginBottom:16, padding:"16px",
              background:T.raised, borderRadius:8, border:`1px solid ${T.border}` }}>
              <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                {GEN_STAGES.map((s, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:8,
                    fontSize:10.5,
                    color: i < genStage ? T.sub : i === genStage ? T.text : T.label }}>
                    <span style={{ fontSize:10, width:14,
                      color: i < genStage ? T.green : i === genStage ? T.accent : T.mute }}>
                      {i < genStage ? "✓" : i === genStage ? "◎" : "○"}
                    </span>
                    {s}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!generated && genStage < 0 && !isSent && (
            <div style={{ padding:"40px 20px", textAlign:"center",
              border:`1px solid ${T.border}`, borderRadius:8,
              background:T.raised, marginBottom:16 }}>
              <div style={{ fontSize:22, color:T.mute, marginBottom:12 }}>
                {rt?.icon}
              </div>
              <div style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:6 }}>
                Ready to generate {rt?.label}
              </div>
              <div style={{ fontSize:10.5, color:T.sub, maxWidth:400,
                margin:"0 auto 18px", lineHeight:1.6 }}>
                Claude will use {client.name}'s full profile — scores, KPIs, signals, findings,
                and competitive data — to generate each section.
              </div>
              <Btn variant="primary" onClick={runGeneration}
                style={{ fontSize:10.5, padding:"7px 18px" }}>
                Generate with AI →
              </Btn>
            </div>
          )}

          {/* Sections */}
          {(generated || isSent) && genStage < 0 && (
            <div>
              <div style={{ display:"flex", alignItems:"center",
                gap:8, marginBottom:12 }}>
                <Lbl>Report Sections</Lbl>
                <span style={{ fontSize:9.5, color:T.sub }}>
                  {sections.filter(s => s.cf).length} client-facing ·
                  {" "}{sections.filter(s => !s.cf).length} internal
                </span>
              </div>
              {sections.map(sec => (
                <SectionBlock key={sec.id} schema={sec}
                  content={content[sec.id] || ""}
                  onEdit={handleEdit} />
              ))}
            </div>
          )}

          {/* Verification */}
          {generated && (isReview || isApproved) && !isSent && (
            <>
              <Hr style={{ margin:"16px 0" }} />
              <div style={{ padding:"14px 16px", borderRadius:7,
                border:`1px solid ${isApproved ? T.green+"30" : T.border}`,
                background: isApproved ? `${T.green}06` : T.raised }}>
                <div style={{ fontSize:11, fontWeight:600, color:T.text, marginBottom:4 }}>
                  {isApproved ? "✓ Approved — ready to send" : "Awaiting internal approval"}
                </div>
                <div style={{ fontSize:9.5, color:T.sub, marginBottom:10 }}>
                  {isApproved
                    ? "This report has been approved. Click 'Send to Client' to publish."
                    : "Senior review required before sending. Approve or request changes below."}
                </div>
                <textarea rows={2} value={verifyNote}
                  onChange={e => setVerifyNote(e.target.value)}
                  placeholder="Review notes…"
                  style={{ width:"100%", padding:"7px 10px", borderRadius:5,
                    background:T.bg, border:`1px solid ${T.border}`,
                    color:T.text, fontSize:11, fontFamily:"'Sora'",
                    outline:"none", resize:"vertical", marginBottom:10 }} />
                {!isApproved && (
                  <div style={{ display:"flex", gap:6 }}>
                    <Btn variant="green"
                      onClick={() => { onUpdate(report.id,{status:"approved"}); showToast("Report approved"); }}
                      style={{ fontSize:9.5, padding:"4px 12px" }}>
                      ✓ Approve
                    </Btn>
                    <Btn variant="danger"
                      onClick={() => { onUpdate(report.id,{status:"draft",generated:false}); setGenerated(false); showToast("Returned for revision"); }}
                      style={{ fontSize:9.5, padding:"4px 12px" }}>
                      Request Changes
                    </Btn>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showPreview && (
        <ClientPreview report={{ ...report, content }}
          client={client} onClose={() => setShowPreview(false)} />
      )}
      {showSend && (
        <SendModal report={report} client={client}
          onSend={handleSend}
          onClose={() => setShowSend(false)} />
      )}
    </>
  );
}

// ── REPORT HISTORY CARD ───────────────────────────────────────────────────────
function ReportHistoryCard({ report, selected, onClick }) {
  const rt     = REPORT_TYPES[report.type];
  const author = getTeam(report.author);
  return (
    <div onClick={onClick}
      style={{ padding:"11px 13px", borderRadius:6, cursor:"pointer",
        marginBottom:4, transition:"all 0.12s",
        background:selected ? T.raised : "transparent",
        border:`1px solid ${selected ? T.borderMid : "transparent"}` }}
      onMouseOver={e => { if (!selected) e.currentTarget.style.background = T.hover; }}
      onMouseOut={e  => { if (!selected) e.currentTarget.style.background = "transparent"; }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
        <span style={{ fontSize:11, color:rt?.color }}>{rt?.icon}</span>
        <span style={{ fontSize:11, fontWeight:500, color:T.text, flex:1 }}>
          {rt?.label}
        </span>
        <span style={{ fontSize:9.5, fontWeight:500,
          color:statusColor(report.status) }}>
          {statusLabel(report.status)}
        </span>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ fontSize:9.5, color:T.sub }}>{report.period}</span>
        <span style={{ color:T.mute }}>·</span>
        <span style={{ fontSize:9.5, color:T.label }}>{report.created}</span>
        {author && (
          <>
            <span style={{ color:T.mute }}>·</span>
            <span style={{ fontSize:9.5, color:T.label }}>{author.init}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── LEFT PANEL CLIENT CARD ────────────────────────────────────────────────────
function ClientCard({ client, reports, selected, onClick }) {
  const sent   = reports.filter(r => r.cid === client.id && r.status === "sent").length;
  const review = reports.filter(r => r.cid === client.id && r.status === "review").length;
  return (
    <div onClick={onClick}
      style={{ padding:"11px 12px", borderRadius:6, cursor:"pointer", marginBottom:3,
        background:selected ? T.raised : "transparent",
        border:`1px solid ${selected ? T.borderMid : "transparent"}`,
        transition:"all 0.12s" }}
      onMouseOver={e => { if (!selected) e.currentTarget.style.background = T.hover; }}
      onMouseOut={e  => { if (!selected) e.currentTarget.style.background = "transparent"; }}>
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"center", marginBottom:3 }}>
        <span style={{ fontSize:12, fontWeight:500, color:T.text, overflow:"hidden",
          textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{client.name}</span>
        <span style={{ fontSize:11, fontWeight:600,
          color:scoreColor(client.faavi), marginLeft:8 }}>{client.faavi}</span>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ fontSize:9.5, color:T.sub }}>{phaseLabel(client.phase)}</span>
        {review > 0 && (
          <>
            <span style={{ color:T.mute }}>·</span>
            <span style={{ fontSize:9.5, color:T.accent }}>{review} in review</span>
          </>
        )}
        {sent > 0 && (
          <>
            <span style={{ color:T.mute }}>·</span>
            <span style={{ fontSize:9.5, color:T.sub }}>{sent} sent</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function ReportingCentre() {
  const [selectedClient, setClient]   = useState("fb");
  const [selectedReport, setReport]   = useState("rep1");
  const [reports,        setReports]  = useState(HISTORY_SEED);
  const [showTypeSelect, setTypeSelect] = useState(false);
  const [view,           setView]     = useState("builder"); // "list" | "builder"
  const [toast,          setToast]    = useState(null);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const handleUpdate = (id, changes) => {
    setReports(prev => prev.map(r => r.id === id ? { ...r, ...changes } : r));
  };

  const handleNewReport = (type) => {
    const newId = `rep${Date.now()}`;
    const newReport = {
      id:newId, cid:selectedClient, type,
      period:"Jun 2026", status:"draft",
      author:"t2", created:new Date().toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }),
      generated:false, content:{},
    };
    setReports(prev => [newReport, ...prev]);
    setReport(newId);
    setView("builder");
    setTypeSelect(false);
    showToast(`New ${REPORT_TYPES[type].label} created`);
  };

  const client   = getClient(selectedClient);
  const activeReport = reports.find(r => r.id === selectedReport);
  const clientReports = reports.filter(r => r.cid === selectedClient)
    .sort((a, b) => a.status === "sent" ? 1 : -1);

  const totalReview = reports.filter(r => r.status === "review").length;
  const totalSent   = reports.filter(r => r.status === "sent").length;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%",
      background:T.bg, fontFamily:"'Sora',sans-serif", color:T.text, overflow:"hidden" }}>

      {toast && (
        <div style={{ position:"fixed", bottom:20, right:20, zIndex:300,
          padding:"9px 14px", background:T.raised, border:`1px solid ${T.borderMid}`,
          borderRadius:6, fontSize:11, color:T.text }}>
          {toast}
        </div>
      )}

      {/* HEADER */}
      <div style={{ padding:"14px 20px 12px", borderBottom:`1px solid ${T.border}`,
        flexShrink:0, background:T.surface }}>
        <div style={{ display:"flex", alignItems:"center" }}>
          <div>
            <h1 style={{ fontFamily:"'Newsreader',serif", fontSize:18, fontWeight:600,
              color:T.text, margin:0, fontStyle:"italic" }}>Reporting Centre</h1>
            <div style={{ marginTop:2 }}>
              <Lbl>Module 8 · Client-Facing Outputs · 7 Report Types</Lbl>
            </div>
          </div>
          <div style={{ flex:1 }} />
          <div style={{ display:"flex", gap:20, marginRight:16 }}>
            {[
              { l:"Total reports", v:reports.length,  c:T.sub    },
              { l:"In review",     v:totalReview,     c:totalReview > 0 ? T.accent : T.sub },
              { l:"Sent",          v:totalSent,       c:totalSent > 0 ? T.green : T.sub    },
            ].map(s => (
              <div key={s.l} style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                <span style={{ fontSize:18, fontWeight:600, color:s.c, lineHeight:1 }}>{s.v}</span>
                <span style={{ fontSize:9, color:T.label }}>{s.l}</span>
              </div>
            ))}
          </div>
          <Btn variant="primary" onClick={() => setTypeSelect(true)}>
            + New Report
          </Btn>
        </div>
      </div>

      {/* BODY */}
      <div style={{ display:"flex", flex:1, minHeight:0 }}>

        {/* Left — clients */}
        <div style={{ width:200, flexShrink:0, borderRight:`1px solid ${T.border}`,
          padding:"10px 8px", overflowY:"auto" }}>
          {CLIENTS.map(c => (
            <ClientCard key={c.id} client={c} reports={reports}
              selected={selectedClient === c.id}
              onClick={() => { setClient(c.id); setReport(null); setView("list"); }} />
          ))}
        </div>

        {/* Mid — report history */}
        <div style={{ width:240, flexShrink:0, borderRight:`1px solid ${T.border}`,
          display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ padding:"10px 10px 6px",
            borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
            <Lbl>{client?.name}</Lbl>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"8px 8px" }}>
            {clientReports.length === 0 ? (
              <div style={{ padding:"28px 12px", textAlign:"center",
                color:T.label, fontSize:10.5 }}>
                No reports yet
              </div>
            ) : clientReports.map(r => (
              <ReportHistoryCard key={r.id} report={r}
                selected={selectedReport === r.id}
                onClick={() => { setReport(r.id); setView("builder"); }} />
            ))}
          </div>
        </div>

        {/* Right — builder / empty */}
        <div style={{ flex:1, minWidth:0, overflow:"hidden" }}>
          {activeReport && client && view === "builder" ? (
            <ReportBuilder
              report={activeReport}
              client={client}
              onUpdate={handleUpdate}
              onBack={() => { setReport(null); setView("list"); }}
              showToast={showToast} />
          ) : (
            <div style={{ height:"100%", display:"flex", alignItems:"center",
              justifyContent:"center", flexDirection:"column", gap:10 }}>
              <div style={{ fontSize:22, color:T.mute }}>◷</div>
              <div style={{ fontSize:12, color:T.sub }}>
                Select a report or create a new one
              </div>
              <Btn variant="ghost" onClick={() => setTypeSelect(true)}
                style={{ marginTop:4 }}>
                + New Report
              </Btn>
            </div>
          )}
        </div>
      </div>

      {showTypeSelect && (
        <ReportTypeSelector
          onSelect={handleNewReport}
          onClose={() => setTypeSelect(false)} />
      )}

    </div>
  );
}
