/**
 * 5th Avenue — Internal OS
 * Software Flow — Platform Reference
 * ─────────────────────────────────────────────────────────────────
 * Two tracks:
 *   1. Client Journey — what the client experiences at each stage
 *   2. Internal Workflow — chronological team actions with module refs
 *
 * Each stage shows primary action + alternate paths.
 * Connections show where internal work creates client-visible outcomes.
 */

import { useState } from "react";

import { T } from "../../theme/tokens";

// ── CLIENT JOURNEY ────────────────────────────────────────────────────────────
const CLIENT_JOURNEY = [
  { id:"cj1", phase:"Onboarding",           desc:"Client signs contract, credentials shared, intro call held",              outcome:"Access granted to client portal" },
  { id:"cj2", phase:"Audit Delivery",        desc:"First FAAVI score presented, channel scores, gap analysis delivered",     outcome:"Client sees their visibility baseline" },
  { id:"cj3", phase:"Strategy Presentation", desc:"Recommendations, prioritised roadmap, and 90-day plan presented",        outcome:"Client approves programme direction" },
  { id:"cj4", phase:"Execution Kickoff",     desc:"Projects confirmed, team assigned, timeline agreed",                     outcome:"Work begins — client sees first tasks in progress" },
  { id:"cj5", phase:"Monthly Review",        desc:"Monthly report delivered, KPI progress reviewed, priorities confirmed",  outcome:"Client receives regular performance visibility" },
  { id:"cj6", phase:"Quarterly Deep-Dive",   desc:"FAAVI progress, strategic review, competitive update, Q ahead plan",    outcome:"Strategic direction confirmed for next quarter" },
  { id:"cj7", phase:"Renewal",               desc:"Annual review, expanded scope discussed, contract renewed",              outcome:"Retainer renewed — expanded engagement" },
];

// ── INTERNAL WORKFLOW ─────────────────────────────────────────────────────────
const INTERNAL_FLOW = [
  {
    id:"iw1", step:1, module:"Module 1", moduleLabel:"Company Overview",
    action:"Create client profile and generate business intelligence",
    detail:"Company profile, FAAVI baseline, competitive set, customer personas, products, market intelligence. Auto-generated from company name or website URL.",
    owner:"Consultant", duration:"Day 1", output:"Company Overview populated",
    linksToCJ:"cj1",
    alternates:[
      { label:"Manual entry", desc:"Consultant inputs company data directly for faster onboarding" },
      { label:"Import from CRM", desc:"If client exists in connected CRM, pull data automatically" },
    ],
  },
  {
    id:"iw2", step:2, module:"Module 1", moduleLabel:"Company Overview — Data Sources",
    action:"Connect data sources and feeds",
    detail:"Link Google Search Console, Analytics, LinkedIn, review platforms, CRM, and ad accounts. Auto-populates audit data and ongoing monitoring signals.",
    owner:"Consultant + Client", duration:"Day 1–2", output:"Data sources live",
    alternates:[
      { label:"Manual data entry", desc:"Input channel data manually if client cannot share API access" },
      { label:"Partial connection", desc:"Connect available sources, flag missing ones for follow-up" },
    ],
  },
  {
    id:"iw3", step:3, module:"Module 2", moduleLabel:"Audit Centre",
    action:"Run full baseline audit across all 11 channels",
    detail:"Auto-scan AEO, SEO, Maps, AI Presence, Reviews. Manual assessment for Website, PR, Community, Influencer. Data dump ingestion for unstructured research. AI extracts findings.",
    owner:"AEO Specialist + SEO Analyst", duration:"Days 2–5", output:"Findings with priority scores",
    linksToCJ:"cj2",
    alternates:[
      { label:"Targeted channel audit", desc:"Audit specific channels only if full audit is not feasible in timeline" },
      { label:"Rapid audit", desc:"Auto-scan only — manual sections deferred to week 2. Faster but less complete." },
      { label:"Re-audit", desc:"Re-run on existing client to capture delta and measure progress" },
    ],
  },
  {
    id:"iw4", step:4, module:"Module 3", moduleLabel:"Market Position",
    action:"Analyse competitive landscape and market position",
    detail:"AI draft from company + competitor data, consultant validates. Competitor scores, SWOT, gap heatmap, leadership matrix, competitive radar.",
    owner:"Sr. Strategist", duration:"Days 4–6", output:"SWOT + competitive benchmark",
    alternates:[
      { label:"Lightweight competitive scan", desc:"Quick comparison on 2–3 direct competitors if full analysis is time-constrained" },
      { label:"Manual SWOT only", desc:"If competitor data is unavailable, produce SWOT from audit findings alone" },
    ],
  },
  {
    id:"iw5", step:5, module:"Module 4", moduleLabel:"Recommendations Hub",
    action:"Generate and prioritise recommendations from audit + market position",
    detail:"Risks and opportunities streams. Priority = (Impact × Confidence) ÷ Effort. P1 recommendations flagged for immediate attention. Auto-generated from findings.",
    owner:"Consultant", duration:"Days 5–7", output:"Prioritised recommendation list",
    linksToCJ:"cj3",
    alternates:[
      { label:"Express prioritisation", desc:"Focus only on P1 recommendations for fast-turnaround clients" },
      { label:"Client co-creation", desc:"Share recommendation list with client for joint prioritisation session" },
      { label:"Escalate urgent issue", desc:"If a critical finding emerges, send direct client alert before full deck" },
    ],
  },
  {
    id:"iw6", step:6, module:"Module 5", moduleLabel:"Develop Centre",
    action:"Generate work packages for approved recommendations",
    detail:"AI uses full company context to generate implementation-ready content: FAQ schema, content briefs, GBP checklists, PR plans, creator briefs. Human verification required.",
    owner:"Channel Specialist", duration:"Days 6–10", output:"Approved work packages",
    alternates:[
      { label:"Quick task assignment", desc:"Skip work package — assign high-confidence low-effort tasks directly as Module 6 tasks" },
      { label:"Client-only brief", desc:"Generate export for client to self-implement simple tasks (GBP claim, schema code)" },
      { label:"Defer to next sprint", desc:"P3 recommendations can be developed in following month's sprint" },
    ],
  },
  {
    id:"iw7", step:7, module:"Module 6", moduleLabel:"Project Workspace",
    action:"Create projects from work packages — tasks auto-generated",
    detail:"Work packages become projects. Deliverables become tasks with owners, due dates, and SLA windows. Tasks visible globally across clients. Kanban, List, and Calendar views.",
    owner:"Operations / Consultant", duration:"Day 8–10", output:"Active projects + task queue",
    linksToCJ:"cj4",
    alternates:[
      { label:"Manual task creation", desc:"Create tasks directly without a work package for small ad-hoc work" },
      { label:"Template projects", desc:"Use saved project templates for recurring work types (e.g. monthly review)" },
      { label:"Bulk assign", desc:"Assign multiple tasks to a team member in one action" },
    ],
  },
  {
    id:"iw8", step:8, module:"Module 7", moduleLabel:"Intelligence Centre",
    action:"Activate ongoing monitoring — signals, KPIs, benchmarks",
    detail:"Post-audit: channels monitored continuously. Signals surface what changed. KPIs tracked against confirmed targets. Anomaly detected → audit prompt bridging back to Module 2.",
    owner:"AEO Specialist + SEO Analyst", duration:"Ongoing", output:"Live signal feed + KPI dashboard",
    linksToCJ:"cj5",
    alternates:[
      { label:"Threshold alerts only", desc:"Surface signals only when a metric crosses a defined threshold — reduces noise" },
      { label:"Competitor-focused monitoring", desc:"Prioritise signals about competitor moves over internal metric changes" },
      { label:"Pre-meeting snapshot", desc:"Use Fetch to generate current standing before any client call" },
    ],
  },
  {
    id:"iw9", step:9, module:"Module 8", moduleLabel:"Reporting Centre",
    action:"Generate, approve, and send client reports",
    detail:"AI drafts narrative sections using full client context. Consultant reviews and edits sections. Human approval required. Preview as client before sending. Publish to dashboard + email.",
    owner:"Consultant", duration:"Monthly / Quarterly", output:"Report delivered to client",
    linksToCJ:"cj5",
    alternates:[
      { label:"Express monthly report", desc:"AI-only generation without consultant edit for straightforward months" },
      { label:"Ad-hoc report", desc:"Generate a report outside the cycle — e.g. post-campaign, post-audit, pre-meeting" },
      { label:"Export only", desc:"Generate PDF for a client who prefers email over portal delivery" },
    ],
  },
  {
    id:"iw10", step:10, module:"All modules", moduleLabel:"Repeat cycle",
    action:"Monthly BAU cycle: monitor → act → report",
    detail:"Monthly: Intelligence signals reviewed, tasks completed, monthly report sent. Quarterly: Market position updated, FAAVI progress reviewed, roadmap refreshed, quarterly report delivered.",
    owner:"Full team", duration:"Ongoing", output:"Continuous visibility improvement",
    linksToCJ:"cj6",
    alternates:[
      { label:"Accelerated cycle", desc:"Enterprise clients: weekly monitoring, bi-weekly check-ins, monthly deep-dive reports" },
      { label:"Upsell trigger", desc:"When FAAVI improvements are demonstrable, use Fetch to build a current-state snapshot for upsell conversation" },
    ],
  },
];

// ── MODULE COLORS ─────────────────────────────────────────────────────────────
const MODULE_COLORS = {
  "Module 1":T.accent, "Module 2":T.amber, "Module 3":"#4ADE80",
  "Module 4":T.red,    "Module 5":T.purple,"Module 6":T.accent,
  "Module 7":"#C47ABF","Module 8":T.green, "All modules":T.sub,
};

// ── ATOMS ─────────────────────────────────────────────────────────────────────
const Lbl = ({ children, color, style={} }) =>
  <span style={{ fontSize:9, fontWeight:600, color:color||T.label,
    textTransform:"uppercase", letterSpacing:"0.08em", ...style }}>{children}</span>;
const Hr  = ({ style={} }) =>
  <div style={{ height:1, background:T.border, ...style }} />;

// ── INTERNAL STEP ─────────────────────────────────────────────────────────────
function InternalStep({ step, open, onToggle }) {
  const mc = MODULE_COLORS[step.module] || T.sub;
  return (
    <div style={{ borderRadius:8, border:`1px solid ${open ? T.borderMid : T.border}`,
      background: open ? T.raised : "transparent",
      marginBottom:8, transition:"all 0.15s", overflow:"hidden" }}>

      {/* Header */}
      <div onClick={onToggle}
        style={{ padding:"13px 16px", cursor:"pointer", display:"flex",
          alignItems:"flex-start", gap:12 }}
        onMouseOver={e => e.currentTarget.style.background = T.hover}
        onMouseOut={e  => e.currentTarget.style.background = "transparent"}>

        {/* Step number */}
        <div style={{ width:26, height:26, borderRadius:"50%", flexShrink:0,
          border:`1.5px solid ${mc}`, display:"flex", alignItems:"center",
          justifyContent:"center", fontSize:10, fontWeight:700, color:mc }}>
          {step.step}
        </div>

        <div style={{ flex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <span style={{ fontSize:9, fontWeight:700, color:mc,
              padding:"1px 6px", borderRadius:3, background:`${mc}14`,
              border:`1px solid ${mc}22` }}>
              {step.moduleLabel}
            </span>
            <span style={{ fontSize:9, color:T.sub }}>{step.owner}</span>
            <span style={{ color:T.mute }}>·</span>
            <span style={{ fontSize:9, color:T.sub }}>{step.duration}</span>
          </div>
          <div style={{ fontSize:12, fontWeight:500, color:T.text, lineHeight:1.4 }}>
            {step.action}
          </div>
        </div>

        <div style={{ flexShrink:0, display:"flex", flexDirection:"column",
          alignItems:"flex-end", gap:3 }}>
          <span style={{ fontSize:8.5, color:mc,
            padding:"1px 6px", borderRadius:3, background:`${mc}10` }}>
            → {step.output}
          </span>
          <span style={{ fontSize:9, color:T.label }}>{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Expanded */}
      {open && (
        <>
          <Hr />
          <div style={{ padding:"14px 16px 4px 54px",
            display:"flex", flexDirection:"column", gap:14 }}>

            <div style={{ fontSize:11, color:T.text, lineHeight:1.6 }}>
              {step.detail}
            </div>

            {/* Alternate paths */}
            <div>
              <Lbl style={{ display:"block", marginBottom:8 }}>Alternate Paths</Lbl>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {step.alternates.map((alt, i) => (
                  <div key={i} style={{ display:"flex", gap:10,
                    padding:"8px 11px", borderRadius:6,
                    border:`1px solid ${T.border}`, background:T.bg }}>
                    <span style={{ fontSize:9.5, color:T.amber,
                      fontWeight:600, flexShrink:0, marginTop:1 }}>↳</span>
                    <div>
                      <div style={{ fontSize:10.5, color:T.text,
                        fontWeight:500, marginBottom:2 }}>{alt.label}</div>
                      <div style={{ fontSize:9.5, color:T.sub }}>
                        {alt.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ height:14 }} />
        </>
      )}
    </div>
  );
}

// ── CLIENT JOURNEY STRIP ──────────────────────────────────────────────────────
function ClientJourneyStrip({ linkedStep }) {
  const [expanded, setExpanded] = useState(null);
  return (
    <div style={{ display:"flex", gap:0, overflowX:"auto",
      paddingBottom:8 }}>
      {CLIENT_JOURNEY.map((stage, i) => {
        const isLinked = linkedStep && linkedStep === stage.id;
        return (
          <div key={stage.id} style={{ display:"flex", alignItems:"flex-start" }}>
            <div onClick={() => setExpanded(expanded === stage.id ? null : stage.id)}
              style={{ flexShrink:0, width:160, cursor:"pointer" }}>
              {/* Node */}
              <div style={{ display:"flex", alignItems:"center", marginBottom:8 }}>
                <div style={{ width:28, height:28, borderRadius:"50%", flexShrink:0,
                  border:`1.5px solid ${isLinked ? T.green : T.border}`,
                  background: isLinked ? `${T.green}15` : T.raised,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:10, fontWeight:700,
                  color: isLinked ? T.green : T.sub }}>
                  {i+1}
                </div>
                {i < CLIENT_JOURNEY.length - 1 && (
                  <div style={{ flex:1, height:1, background:T.border,
                    marginLeft:4, minWidth:16 }} />
                )}
              </div>
              {/* Label */}
              <div style={{ paddingRight:16 }}>
                <div style={{ fontSize:10.5, fontWeight:600,
                  color: isLinked ? T.green : T.text, marginBottom:3 }}>
                  {stage.phase}
                </div>
                {expanded === stage.id && (
                  <div style={{ fontSize:9.5, color:T.sub, lineHeight:1.45,
                    marginBottom:5 }}>{stage.desc}</div>
                )}
                <div style={{ fontSize:8.5, color: isLinked ? T.green : T.label }}>
                  {isLinked ? "← Connected to this step" : stage.outcome}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function SoftwareFlow() {
  const [openStep,    setOpenStep]    = useState("iw3");
  const [showClient,  setShowClient]  = useState(true);

  const activeStep = INTERNAL_FLOW.find(s => s.id === openStep);

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%",
      background:T.bg, fontFamily:"'Sora',sans-serif",
      color:T.text, overflow:"hidden" }}>

      {/* HEADER */}
      <div style={{ padding:"14px 28px 12px", borderBottom:`1px solid ${T.border}`,
        flexShrink:0, background:T.surface }}>
        <div style={{ display:"flex", alignItems:"center" }}>
          <div>
            <h1 style={{ fontFamily:"'Newsreader',serif", fontSize:18, fontWeight:600,
              color:T.text, margin:0, fontStyle:"italic" }}>
              Platform Flow
            </h1>
            <Lbl style={{ marginTop:3, display:"block" }}>
              Client Journey + Internal Workflow · Action Paths + Alternates
            </Lbl>
          </div>
          <div style={{ flex:1 }} />
          <div style={{ display:"flex", gap:3 }}>
            {[["Show Client Journey", showClient]].map(([lbl, active]) => (
              <button key={lbl} onClick={() => setShowClient(!showClient)} style={{
                padding:"4px 11px", borderRadius:5, fontSize:10, fontWeight:500,
                fontFamily:"'Sora'", cursor:"pointer", background:"transparent",
                border:`1px solid ${active ? T.borderMid : T.border}`,
                color: active ? T.text : T.sub, transition:"all 0.12s" }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* BODY */}
      <div style={{ flex:1, overflowY:"auto", padding:"20px 28px" }}>

        {/* Client Journey */}
        {showClient && (
          <div style={{ marginBottom:28 }}>
            <div style={{ display:"flex", alignItems:"center",
              gap:8, marginBottom:16 }}>
              <div style={{ width:8, height:8, borderRadius:"50%",
                background:T.green }} />
              <Lbl color={T.green}>Client Journey</Lbl>
              <span style={{ fontSize:9.5, color:T.sub }}>
                — what the client experiences at each stage
              </span>
            </div>
            <div style={{ padding:"18px 20px", background:T.raised,
              borderRadius:9, border:`1px solid ${T.border}` }}>
              <ClientJourneyStrip linkedStep={activeStep?.linksToCJ} />
            </div>
          </div>
        )}

        {/* Internal Workflow */}
        <div>
          <div style={{ display:"flex", alignItems:"center",
            gap:8, marginBottom:16 }}>
            <div style={{ width:8, height:8, borderRadius:"50%",
              background:T.accent }} />
            <Lbl color={T.accent}>Internal Workflow</Lbl>
            <span style={{ fontSize:9.5, color:T.sub }}>
              — chronological team actions · click any step to expand
            </span>
            <div style={{ flex:1 }} />
            <span style={{ fontSize:9, color:T.label }}>
              ↳ Alternate paths available in each step
            </span>
          </div>

          {/* Module legend */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
            {Object.entries(MODULE_COLORS).filter(([k]) => k !== "All modules").map(([label, color]) => (
              <div key={label} style={{ display:"flex", alignItems:"center", gap:5 }}>
                <div style={{ width:6, height:6, borderRadius:1, background:color }} />
                <span style={{ fontSize:8.5, color:T.sub }}>{label}</span>
              </div>
            ))}
          </div>

          {INTERNAL_FLOW.map(step => (
            <InternalStep
              key={step.id}
              step={step}
              open={openStep === step.id}
              onToggle={() => setOpenStep(openStep === step.id ? null : step.id)} />
          ))}
        </div>

        {/* Connection note */}
        <div style={{ marginTop:24, padding:"14px 18px",
          background:T.raised, borderRadius:8,
          border:`1px solid ${T.border}` }}>
          <Lbl style={{ display:"block", marginBottom:8 }}>Module Connections</Lbl>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {[
              { from:"Audit Centre (M2)",       to:"Recommendations Hub (M4)",   desc:"Findings auto-populate as P1/P2/P3 recommendations"    },
              { from:"Recommendations Hub (M4)", to:"Develop Centre (M5)",       desc:"'Develop →' action creates a work package"              },
              { from:"Develop Centre (M5)",      to:"Project Workspace (M6)",    desc:"Approved work packages become projects with auto-tasks"  },
              { from:"Intelligence Centre (M7)", to:"Audit Centre (M2)",         desc:"Anomaly signal triggers 'Run audit' prompt"              },
              { from:"All modules",              to:"Reporting Centre (M8)",     desc:"Data, KPIs, signals and findings feed report generation" },
              { from:"Reporting Centre (M8)",    to:"Client Portal",             desc:"Approved reports published + email notification sent"    },
            ].map((conn, i) => (
              <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start",
                fontSize:10.5 }}>
                <span style={{ color:T.accent, flexShrink:0 }}>→</span>
                <div>
                  <span style={{ color:T.text }}>{conn.from}</span>
                  <span style={{ color:T.label }}> → </span>
                  <span style={{ color:T.text }}>{conn.to}</span>
                  <div style={{ fontSize:9.5, color:T.sub, marginTop:1 }}>
                    {conn.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
