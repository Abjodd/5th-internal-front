/**
 * 5th Avenue — Internal OS
 * Platform Flow Chart — Client View
 * ─────────────────────────────────────────────────────────────────
 * Select a client on the left.
 * The flowchart shows their actual status at every stage —
 * what's complete, active, in progress, or not started —
 * with real data inline at each node.
 */

import { useState } from "react";

import { T } from "../../theme/tokens";

// ── PHASE META ────────────────────────────────────────────────────────────────
const PHASE = {
  discovery: { color:T.purple,  label:"Discovery"   },
  collection:{ color:T.accent,  label:"Collection"  },
  audit:     { color:T.amber,   label:"Audit"       },
  monitor:   { color:T.purple,  label:"Monitor"     },
  analysis:  { color:"#4ADE80", label:"Analysis"    },
  strategy:  { color:T.red,     label:"Strategy"    },
  external:  { color:T.amber,   label:"External"    },
  develop:   { color:"#C47ABF", label:"Develop"     },
  execute:   { color:T.accent,  label:"Execute"     },
  trend:     { color:T.accent,  label:"Trend"       },
  report:    { color:T.green,   label:"Report"      },
  deliver:   { color:T.sub,     label:"Deliver"     },
};

const OUT_TYPE = {
  data:    { color:T.sub,    icon:"·"  },
  primary: { color:T.text,   icon:"★"  },
  action:  { color:T.amber,  icon:"→"  },
  report:  { color:T.green,  icon:"↗"  },
  alert:   { color:T.red,    icon:"⚑"  },
  quality: { color:T.label,  icon:"◎"  },
  signal:  { color:T.purple, icon:"⟳"  },
};

const STAGE_STATUS = {
  complete:    { color:T.green,  label:"Complete"     },
  active:      { color:T.accent, label:"Active"       },
  in_progress: { color:T.amber,  label:"In Progress"  },
  not_started: { color:T.label,  label:"Not started"  },
  none:        { color:T.mute,   label:"—"            },
};

// ── CLIENT DATA ───────────────────────────────────────────────────────────────
const CLIENTS = [
  { id:"fb", name:"FreshBite Foods",   init:"FB", website:"freshbitefoods.com", faavi:72, phase:"bau",       pkg:"Growth"     },
  { id:"nb", name:"NutriBlend India",  init:"NB", website:"nutriblend.in",      faavi:61, phase:"launch",    pkg:"Growth"     },
  { id:"ch", name:"CraftHome Decor",   init:"CH", website:"crafthomedecor.com", faavi:53, phase:"audit",     pkg:"Starter"    },
  { id:"df", name:"DermFirst",         init:"DF", website:"dermfirst.in",       faavi:68, phase:"campaigns", pkg:"Enterprise" },
  { id:"tg", name:"TerraGrow Organic", init:"TG", website:"terragrow.in",       faavi:44, phase:"audit",     pkg:"Starter"    },
];

// ── CLIENT-SPECIFIC STAGE DATA ────────────────────────────────────────────────
const CLIENT_STAGES = {
  fb:{
    s1: { status:"complete",    date:"3 Jan 2026",  summary:"FreshBite Foods · Food & Beverage · D2C · Series A",
          detail:["Company profile complete","4 competitors tracked: Yoga Bar, Happilo, Too Yumm, MilletGo","3 customer personas defined","All data sources mapped"] },
    s2: { status:"complete",    date:"5 Jan 2026",  summary:"9 sources connected · 2 manual assessments · 1 dump processed",
          detail:["Search Console + Analytics connected","GBP and review platforms live","LinkedIn and social accounts connected","Brand guidelines ingested via dump"] },
    s3: { status:"complete",    date:"10 May 2026", summary:"FAAVI 72/100 · 18 findings · 2 critical · Last audit: 18 days ago",
          detail:["FAAVI: 72/100  (Grade B)","AEO 68 · SEO 74 · Maps 80 · AI 58 · Reviews 85 · Social 62","18 findings across 6 channels","P1: 2 · P2: 5 · P3: 8","Benchmarked vs 4 competitors"] },
    s3b:{ status:"active",      date:"Ongoing",     summary:"6 active signals · 2 high priority · FAAVI trending ▲",
          detail:["Signal feed active — last signal 2h ago","2 high-priority AI presence declines","FAAVI +8 pts over 6 months","KPIs: 6 metrics tracked, 4 unconfirmed targets","No anomaly audit triggers currently active"] },
    s4: { status:"complete",    date:"12 May 2026", summary:"SWOT complete · 4 competitors scored · 3 white-space opportunities",
          detail:["SWOT: 3 strengths, 3 weaknesses, 3 opportunities, 3 threats","Competitor radar: Yoga Bar leads on AI (+13pts)","Gap heatmap: AI presence biggest competitive gap","White-space: YouTube snack education niche uncontested"] },
    s5: { status:"active",      date:"Ongoing",     summary:"10 open recs · 6 risks · 4 opportunities · 2 P1 in develop",
          detail:["6 risk recommendations — P1 to P3","4 opportunity recommendations","Priority scores: FAQ Schema 81.0 (highest), AI Citation 24.0","2 recommendations currently in Develop Centre","Quick wins identified: 3 items"] },
    s5b:{ status:"none",        date:"—",           summary:"No active client campaigns",
          detail:["No campaigns raised by client this cycle","Portal is live for client to submit requests"] },
    s6: { status:"in_progress", date:"Ongoing",     summary:"1 work package approved · 1 in review · FAQ Schema complete",
          detail:["FAQ Schema Package: approved by Vikram Das","Core Web Vitals Package: in review","AI Citation Package: generating","Client export: FAQ Schema brief exported 22 May 2026"] },
    s7: { status:"in_progress", date:"Ongoing",     summary:"3 active projects · 21 tasks · 1 overdue",
          detail:["Project: FAQ Schema Implementation (40% complete)","Project: Core Web Vitals Fix (65% complete)","Project: AI Citation Campaign (0% — planning)","Tasks: 21 total, 16 active, 4 done, 1 overdue","SLA: 1 task breached (FAQ schema on protein bars page)"] },
    s8: { status:"active",      date:"Ongoing",     summary:"FAAVI +8 pts in 6 months · LCP improved 4.2s → 3.1s · Trending ▲",
          detail:["FAAVI trend: 64 → 72 over 6 months (+8 pts)","SEO trending up: Core Web Vitals improvement measurable","AI Presence trending down: -2 pts (citation gap widening)","Snippet captured: 'ragi snacks benefits' → +340 sessions/mo","Attribution: LCP improvement linked to image optimisation task"] },
    s9: { status:"active",      date:"Ongoing",     summary:"Monthly May 2026 sent · Audit Apr 2026 sent · 1 in review",
          detail:["Monthly Report May 2026: in review (awaiting approval)","Audit Report April 2026: sent 16 Apr 2026","Total reports sent: 3","Next scheduled: Monthly June 2026"] },
    s10:{ status:"active",      date:"27 May 2026", summary:"Dashboard live · Email sent 27 May · No active escalations",
          detail:["Client portal: active, 2 contacts (Rohan Mehta, Priya Sharma)","Last email: 27 May 2026 — monthly report notification","No active escalations","Renewal signal: not yet triggered (FAAVI 72 — trajectory positive)"] },
  },
  nb:{
    s1: { status:"complete",    date:"15 Feb 2026", summary:"NutriBlend India · Nutrition · D2C · Seed stage",
          detail:["Company profile complete","4 competitors tracked","Online-only brand — Maps/MEO adapted for marketplace presence"] },
    s2: { status:"complete",    date:"18 Feb 2026", summary:"6 sources connected · Manual supplement forms completed",
          detail:["Search Console + Analytics connected","Amazon seller account linked","Review platforms connected (Amazon, Google)","Manual: product specs and positioning completed"] },
    s3: { status:"complete",    date:"1 Mar 2026",  summary:"FAAVI 61/100 · 22 findings · 5 critical · Last audit: 42 days ago",
          detail:["FAAVI: 61/100 (Grade C)","AEO 52 · SEO 65 · Maps 55 · AI 48 · Reviews 70 · Social 55","22 findings — 5 critical (all AI-related)","Audit overdue: 42 days since last run (threshold: 30 days)"] },
    s3b:{ status:"active",      date:"Ongoing",     summary:"2 active signals · 1 high priority · DA gap widening",
          detail:["DA gap vs MuscleBlaze widening this month (+0 new backlinks)","AI presence: no change — still 0/5 platforms","Signal feed active — last signal: today"] },
    s4: { status:"complete",    date:"5 Mar 2026",  summary:"SWOT complete · MuscleBlaze dominates all channels",
          detail:["Competitor: MuscleBlaze DA 52 vs NutriBlend DA 18","Opportunity: women's protein segment underserved by all competitors","Gap: AI presence — MuscleBlaze cited everywhere, NutriBlend nowhere"] },
    s5: { status:"active",      date:"Ongoing",     summary:"12 open recs · 3 in develop · 2 P1 overdue (42d)",
          detail:["AI Citation Strategy: P1, 42 days open — not yet in develop","DA Gap Programme: P1, 42 days open — in develop","Amazon Review Programme: P2, 9 days open"] },
    s5b:{ status:"none",        date:"—",           summary:"No active client campaigns" },
    s6: { status:"in_progress", date:"Ongoing",     summary:"1 work package approved · Backlink programme in progress",
          detail:["Backlink Programme Package: approved","AI Citation Package: draft — consultant review pending","No client exports sent this cycle"] },
    s7: { status:"in_progress", date:"Ongoing",     summary:"2 active projects · 7 tasks · 4 overdue",
          detail:["Project: Backlink Programme (20% complete)","Project: AI Visibility Strategy (0% — planning)","Tasks: 7 total, 4 overdue (backlink domain research 4 days late)","SLA: 2 P1 tasks breached"] },
    s8: { status:"active",      date:"Ongoing",     summary:"FAAVI flat over 3 months · DA not improving",
          detail:["FAAVI trend: 59 → 61 in 3 months (+2 pts)","SEO flat — DA not improving without link building","AI trending flat at 0/5 platforms"] },
    s9: { status:"active",      date:"Ongoing",     summary:"Audit Report Mar 2026 sent · Monthly May 2026 draft",
          detail:["Audit Report March 2026: sent 11 Mar 2026","Monthly May 2026: draft in progress","No quarterly report yet (client <6 months)"] },
    s10:{ status:"active",      date:"11 Mar 2026", summary:"Dashboard live · 1 contact · No escalations",
          detail:["Client portal: active, 1 contact (Aditya Rao)","No active escalations","Renewal: 8 months remaining on contract"] },
  },
  ch:{
    s1: { status:"complete",    date:"15 Nov 2025", summary:"CraftHome Decor · Home Decor · D2C + offline · Bootstrapped",
          detail:["Company profile complete","5 competitors tracked: Pepperfry, Urban Ladder, WoodenStreet, Fabindia, Good Earth","Offline showroom in Bengaluru — MEO critical"] },
    s2: { status:"partial",     date:"20 Nov 2025", summary:"4 sources connected · GBP not yet connected (unclaimed)",
          detail:["Search Console + Analytics connected","Social (Instagram) connected","GBP not connected — listing not yet claimed","Review platforms connected (17 reviews found)"] },
    s3: { status:"overdue",     date:"67 days ago", summary:"FAAVI 53/100 · Audit 67 days old — OVERDUE",
          detail:["FAAVI: 53/100 (Grade C)","AEO 41 · SEO 58 · Maps 48 · AI 38 · Reviews 63 · Social 58","Last audit: 67 days ago (threshold: 30 days)","8 P1 issues — none actioned yet","GBP still unclaimed — identified 67 days ago"] },
    s3b:{ status:"active",      date:"Ongoing",     summary:"1 high-priority signal · GBP still unclaimed",
          detail:["High priority: GBP claim still not submitted (67 days)","Pepperfry added 2 new Bengaluru listings this month","FAAVI declining: -2 pts since last audit","Escalation triggered: GBP gap escalated to Vikram Das"] },
    s4: { status:"complete",    date:"20 Nov 2025", summary:"SWOT complete · Pepperfry dominates all channels",
          detail:["Pepperfry: DA 74, 3 local listings, cited in all AI platforms","Opportunity: Pinterest — zero competition in home decor","Threat: MilletGo-equivalent entering home decor space"] },
    s5: { status:"active",      date:"Ongoing",     summary:"14 open recs · 8 P1 · 0 in develop — STALLED",
          detail:["8 P1 recommendations — none in develop","Stalled for 67 days — escalation raised","GBP claim: highest priority (P 32.0) — not actioned","Top P1 awaiting action: claim GBP, content cluster, AI presence"] },
    s5b:{ status:"none",        date:"—",           summary:"No active client campaigns" },
    s6: { status:"not_started", date:"—",           summary:"No work packages created yet",
          detail:["No recommendations developed yet","GBP and content packages ready to generate on consultant action"] },
    s7: { status:"in_progress", date:"Ongoing",     summary:"1 active project · 4 tasks · 6 overdue",
          detail:["Project: GBP Claim & Optimisation (10% complete)","6 tasks overdue — GBP claim task 7 days overdue","SLA: 3 P1 tasks breached (critical)"] },
    s8: { status:"active",      date:"Ongoing",     summary:"FAAVI declining · -2 pts since last audit",
          detail:["FAAVI trend: 55 → 53 over last 3 months (-2 pts)","Maps declining due to GBP inaction","AI declining — competitor presence growing"] },
    s9: { status:"active",      date:"Ongoing",     summary:"Only Audit Report sent · No monthly reports yet",
          detail:["No monthly report sent for May 2026","Audit Report sent Nov 2025","Monthly reporting not yet established — client on Starter tier"] },
    s10:{ status:"active",      date:"Nov 2025",    summary:"Dashboard live · Escalation active — GBP gap",
          detail:["Client portal: active, 1 contact (Deepika Nair)","Escalation active: GBP gap 67 days unresolved","⚑ Senior consultant notified 28 May 2026"] },
  },
  df:{
    s1: { status:"complete",    date:"1 Jan 2026",  summary:"DermFirst · Skincare & Dermatology · D2C · Series A · Enterprise",
          detail:["Company profile complete","4 competitors: Minimalist, Dot & Key, Plum, The Derma Co.","Premium positioning — clinical credibility is differentiator"] },
    s2: { status:"complete",    date:"3 Jan 2026",  summary:"10 sources connected · Full data coverage",
          detail:["Full analytics, search console, and social suite connected","Dermatologist database and consultation data ingested (manual)","PR coverage tracking active"] },
    s3: { status:"complete",    date:"19 May 2026", summary:"FAAVI 68/100 · 7 findings · 9 days ago",
          detail:["FAAVI: 68/100 (Grade B)","AEO 62 · SEO 71 · Maps 60 · AI 65 · Reviews 78 · Social 60","7 findings — 1 critical","Perplexity citations growing (+6 this month)"] },
    s3b:{ status:"active",      date:"Ongoing",     summary:"Enterprise: weekly refresh · 2 signals · Perplexity growing ▲",
          detail:["Weekly monitoring cycle (Enterprise tier)","AI signal positive: Perplexity citations +6 this month","SEO signal warning: Minimalist gained 4 shared keyword rankings","No escalations active"] },
    s4: { status:"complete",    date:"20 May 2026", summary:"SWOT updated · Minimalist outranks on 28/35 keywords",
          detail:["Key threat: Minimalist launched new content hub (60+ articles)","Opportunity: retinol education — no clinical authority content exists","DermFirst second strongest AI presence in set (behind Minimalist)"] },
    s5: { status:"active",      date:"Ongoing",     summary:"5 open recs · 1 P1 · 2 opportunities · Enterprise velocity",
          detail:["1 P1 risk: Minimalist keyword gap programme","2 opportunities: AI citation expansion, retinol guide","4 recommendations in develop or project stage","Fast-track approved for 2 items this cycle"] },
    s5b:{ status:"active",      date:"Ongoing",     summary:"1 active campaign: Spring Skincare Push (client-raised)",
          detail:["Spring Skincare Campaign: raised by Dr. Kavita Singh 15 May 2026","Brief: increase AI citations for SPF + retinol queries before summer","Status: fast-tracked to Develop Centre as P1 Opportunity"] },
    s6: { status:"complete",    date:"Ongoing",     summary:"4 work packages approved · 2 in execution",
          detail:["Content Programme Package: approved and in execution","Perplexity Citation Build Package: approved","Spring Campaign Package: approved 20 May 2026","All packages have client export delivered"] },
    s7: { status:"in_progress", date:"Ongoing",     summary:"4 active projects · 20 tasks · 0 overdue",
          detail:["All projects on schedule — 0 overdue tasks","Content Programme: 5% complete (6-month programme)","Perplexity Build: 0% (planning this week)","Spring Campaign: 0% (kickoff 1 Jun 2026)"] },
    s8: { status:"active",      date:"Ongoing",     summary:"FAAVI +6 in 5 months · AI trending strongly ▲",
          detail:["FAAVI trend: 62 → 68 over 5 months (+6 pts)","AI Presence: 58 → 65 (+7 pts) — fastest growing channel","SEO: 68 → 71 (+3 pts)","Attribution: Perplexity growth linked to article publishing"] },
    s9: { status:"active",      date:"Ongoing",     summary:"Monthly May 2026 approved · Competitive Benchmark sent Q1",
          detail:["Monthly May 2026: approved, ready to send","Competitive Benchmark Q1 2026: sent and acknowledged","Quarterly report due: June 2026","Enterprise: bi-weekly reporting cadence"] },
    s10:{ status:"active",      date:"26 May 2026", summary:"Dashboard live · 2 contacts · Renewal signal approaching",
          detail:["Client portal: active, 2 contacts (Dr. Singh, Arjun Patel)","Last email: 26 May 2026","Renewal signal: FAAVI +6 in 5 months — renewal conversation recommended at next QR","No escalations active"] },
  },
  tg:{
    s1: { status:"complete",    date:"1 Mar 2026",  summary:"TerraGrow Organic · Organic Food · D2C · Bootstrapped",
          detail:["Company profile complete","4 competitors tracked","Subscription box model — local-first strategy"] },
    s2: { status:"partial",     date:"5 Mar 2026",  summary:"4 sources connected · Analytics and social connected · Review platforms pending",
          detail:["Google Analytics connected","Instagram connected","Search Console: partial setup","Review platforms: not yet connected","Manual forms: not completed by client"] },
    s3: { status:"overdue",     date:"91 days ago", summary:"NO AUDIT COMPLETED · Client onboarded 91 days ago — CRITICAL",
          detail:["⚑ No baseline audit exists","FAAVI score: unverified estimate (44/100)","91 days since onboarding — no diagnostic data","All downstream stages blocked on this","Escalated to Arjun Reddy 28 May 2026"] },
    s3b:{ status:"not_started", date:"—",           summary:"Intelligence Monitoring not active — requires audit baseline",
          detail:["Cannot activate monitoring without audit baseline","No KPI targets set","No signals — no data to monitor"] },
    s4: { status:"not_started", date:"—",           summary:"Market Position not yet analysed",
          detail:["Blocked on audit completion","Competitor data partially collected in company profile","SWOT cannot be generated without channel scores"] },
    s5: { status:"active",      date:"Ongoing",     summary:"11 open recs · 1 critical: complete audit immediately",
          detail:["1 critical P1: complete baseline audit (priority 40.0)","All other recommendations are assumptions without audit data","No recommendations in develop stage"] },
    s5b:{ status:"none",        date:"—",           summary:"No active client campaigns" },
    s6: { status:"not_started", date:"—",           summary:"No work packages — blocked on audit",
          detail:["Blocked until recommendations are evidenced by audit data"] },
    s7: { status:"not_started", date:"—",           summary:"No active projects",
          detail:["No projects created yet","Execution blocked on upstream stages"] },
    s8: { status:"not_started", date:"—",           summary:"Trend analysis unavailable — no historical data",
          detail:["No historical scores to trend","Audit required before trend analysis can begin"] },
    s9: { status:"not_started", date:"—",           summary:"No reports sent",
          detail:["No reports generated — nothing to report without audit data","Starter tier: quarterly report when available"] },
    s10:{ status:"active",      date:"—",           summary:"Dashboard live · ⚑ Escalation active — 91 days no audit",
          detail:["Client portal active, 1 contact (Sunita Krishnan)","⚑ Escalation: 91 days without audit — senior review required","No reports delivered to client yet"] },
  },
};

// ── GENERIC STAGE DEFINITIONS ─────────────────────────────────────────────────
const STAGES = [
  { id:"s1",  num:"01", label:"Initial Discovery",         phase:"discovery", continuous:false, external:false },
  { id:"s2",  num:"02", label:"Source Collection",          phase:"collection",continuous:false, external:false },
  { id:"s3",  num:"03", label:"Audit",                      phase:"audit",     continuous:false, external:false,
    note:"Intelligence Monitoring activates here for BAU clients" },
  { id:"s3b", num:"↺",  label:"Intelligence Monitoring",   phase:"monitor",   continuous:true,  external:false,
    note:"BAU only — runs continuously in parallel from audit onwards" },
  { id:"s4",  num:"04", label:"Market Position Analysis",   phase:"analysis",  continuous:false, external:false },
  { id:"s5",  num:"05", label:"Recommendation Engine",      phase:"strategy",  continuous:false, external:false },
  { id:"s5b", num:"EXT",label:"Client Campaigns",           phase:"external",  continuous:false, external:true,
    note:"External input — raised by client, enters flow directly" },
  { id:"s6",  num:"06", label:"Work Package Development",   phase:"develop",   continuous:false, external:false },
  { id:"s7",  num:"07", label:"Execution",                  phase:"execute",   continuous:false, external:false },
  { id:"s8",  num:"08", label:"Trend Analysis",             phase:"trend",     continuous:false, external:false },
  { id:"s9",  num:"09", label:"Reporting",                  phase:"report",    continuous:false, external:false },
  { id:"s10", num:"10", label:"Client Delivery",            phase:"deliver",   continuous:false, external:false },
];

// ── ATOMS ─────────────────────────────────────────────────────────────────────
const Lbl = ({ children, color, style={} }) =>
  <span style={{ fontSize:9, fontWeight:600, color:color||T.label,
    textTransform:"uppercase", letterSpacing:"0.08em", ...style }}>{children}</span>;

const scoreColor = s => s >= 70 ? T.green : s >= 50 ? T.amber : T.red;
const phaseColor = p => ({ audit:T.label, launch:T.amber, bau:T.accent, campaigns:T.green })[p] || T.sub;
const phaseLabel = p => ({ audit:"Audit", launch:"Launch", bau:"BAU", campaigns:"Campaigns" })[p] || p;

// ── STATUS BADGE ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const meta = {
    complete:    { color:T.green,  label:"Complete"     },
    active:      { color:T.accent, label:"Active"       },
    in_progress: { color:T.amber,  label:"In Progress"  },
    not_started: { color:T.label,  label:"Not started"  },
    partial:     { color:T.amber,  label:"Partial"      },
    overdue:     { color:T.red,    label:"Overdue ⚑"    },
    none:        { color:T.mute,   label:"—"            },
  };
  const m = meta[status] || meta.not_started;
  return (
    <span style={{ fontSize:8.5, fontWeight:600, color:m.color,
      padding:"2px 7px", borderRadius:3, flexShrink:0,
      background:`${m.color}12`,
      border:`1px solid ${m.color}22` }}>
      {m.label}
    </span>
  );
}

// ── STAGE NODE ────────────────────────────────────────────────────────────────
function StageNode({ stage, clientStage, open, onToggle, isLast }) {
  const phase   = PHASE[stage.phase] || { color:T.sub, label:"" };
  const isCont  = stage.continuous;
  const isExt   = stage.external;
  const status  = clientStage?.status || "not_started";
  const summary = clientStage?.summary || "No data yet";
  const detail  = clientStage?.detail  || [];
  const isAlert = status === "overdue";

  return (
    <div style={{ display:"flex", gap:0 }}>

      {/* Spine */}
      <div style={{ width:54, flexShrink:0, display:"flex",
        flexDirection:"column", alignItems:"center" }}>
        <div style={{ width:28, height:28, borderRadius:"50%", flexShrink:0,
          border:`1.5px solid ${isAlert ? T.red : isCont ? phase.color : open ? phase.color : T.border}`,
          borderStyle: isCont ? "dashed" : "solid",
          background: open ? `${isAlert?T.red:phase.color}12` : T.bg,
          display:"flex", alignItems:"center", justifyContent:"center",
          zIndex:1, transition:"all 0.15s" }}>
          <span style={{ fontSize:isCont||isExt?7.5:9, fontWeight:700,
            color: isAlert ? T.red : open ? phase.color : T.sub,
            fontFamily:"'Sora'" }}>
            {stage.num}
          </span>
        </div>
        {!isLast && (
          <div style={{ width:1, flex:1, minHeight:18,
            background: isCont
              ? `repeating-linear-gradient(to bottom, ${phase.color}50 0, ${phase.color}50 5px, transparent 5px, transparent 9px)`
              : T.border }} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex:1, paddingBottom:isLast?0:16, paddingLeft:4 }}>

        {/* Header row */}
        <div onClick={onToggle}
          style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 12px 4px 10px",
            borderRadius:6, cursor:"pointer",
            border:`1px solid ${open ? T.borderMid : isAlert ? `${T.red}22` : "transparent"}`,
            background: open ? T.raised : isAlert ? `${T.red}05` : "transparent",
            borderLeft:`3px solid ${open ? (isAlert?T.red:phase.color) : isAlert ? T.red : "transparent"}`,
            transition:"all 0.12s" }}
          onMouseOver={e => { if (!open) e.currentTarget.style.background = T.hover; }}
          onMouseOut={e  => { if (!open) e.currentTarget.style.background = isAlert?`${T.red}05`:"transparent"; }}>

          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
              <span style={{ fontSize:12, fontWeight:600, color:T.text }}>
                {stage.label}
              </span>
              {isCont && <span style={{ fontSize:8, color:phase.color, fontWeight:700 }}>↺ continuous</span>}
              {isExt  && <span style={{ fontSize:8, color:T.amber, fontWeight:700 }}>← client</span>}
            </div>
            {/* Client summary line */}
            <div style={{ fontSize:9.5, color: isAlert ? T.red : T.sub,
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {summary}
            </div>
          </div>

          <StatusBadge status={status} />

          <span style={{ fontSize:9, color:T.label, marginLeft:4 }}>
            {open ? "▲" : "▼"}
          </span>
        </div>

        {/* Expanded content */}
        {open && (
          <div style={{ borderRadius:"0 0 7px 7px",
            border:`1px solid ${T.borderMid}`, borderTop:"none",
            borderLeft:`3px solid ${isAlert ? T.red : phase.color}`,
            background:T.raised, overflow:"hidden" }}>

            {/* Note */}
            {stage.note && (
              <div style={{ padding:"7px 14px", borderBottom:`1px solid ${T.border}`,
                background:`${phase.color}06` }}>
                <span style={{ fontSize:9.5, color:T.sub, fontStyle:"italic" }}>
                  {stage.note}
                </span>
              </div>
            )}

            {/* Client detail block */}
            <div style={{ padding:"14px 16px",
              display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>

              {/* Stage status detail */}
              <div>
                <Lbl style={{ display:"block", marginBottom:8 }}>
                  Current Status
                </Lbl>
                {clientStage?.date && clientStage.date !== "—" && (
                  <div style={{ fontSize:9.5, color:T.label, marginBottom:8 }}>
                    {clientStage.date}
                  </div>
                )}
                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  {detail.map((line, i) => (
                    <div key={i} style={{ display:"flex", gap:7, alignItems:"flex-start" }}>
                      <span style={{ fontSize:8.5,
                        color: line.startsWith("⚑") ? T.red : line.startsWith("↺") ? T.accent : T.label,
                        marginTop:2, flexShrink:0 }}>
                        {line.startsWith("⚑") ? "⚑" : line.startsWith("↺") ? "↺" : "·"}
                      </span>
                      <span style={{ fontSize:10.5, color:T.text, lineHeight:1.4 }}>
                        {line.replace(/^[⚑↺]\s*/,"")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Phase context */}
              <div>
                <Lbl style={{ display:"block", marginBottom:8 }}>
                  Phase Context
                </Lbl>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:9, color:T.label }}>Stage</span>
                    <span style={{ fontSize:10.5, color:T.text }}>{stage.label}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:9, color:T.label }}>Phase</span>
                    <span style={{ fontSize:10, fontWeight:600, color:phase.color,
                      padding:"1px 6px", borderRadius:3,
                      background:`${phase.color}12` }}>
                      {phase.label}
                    </span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:9, color:T.label }}>Status</span>
                    <StatusBadge status={status} />
                  </div>
                  <div style={{ marginTop:6 }}>
                    <button style={{ fontSize:9.5, color:T.accent, background:"transparent",
                      border:"none", cursor:"pointer", fontFamily:"'Sora'", padding:0 }}>
                      → Open in {stage.label.split(" ")[0]} module
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CLIENT CARD ───────────────────────────────────────────────────────────────
function ClientCard({ client, selected, onClick }) {
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
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
        <span style={{ fontSize:9.5, color:T.sub }}>{phaseLabel(client.phase)}</span>
        <span style={{ color:T.mute }}>·</span>
        <span style={{ fontSize:9.5, color:T.label }}>{client.pkg}</span>
      </div>
      <div style={{ height:2, background:T.mute, borderRadius:1 }}>
        <div style={{ height:2, borderRadius:1, background:scoreColor(client.faavi),
          width:`${client.faavi}%`, transition:"width 0.4s" }} />
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function PlatformFlowChart() {
  const [clientId,  setClientId]  = useState("fb");
  const [openStage, setOpenStage] = useState("s3");

  const toggle   = id => setOpenStage(p => p === id ? null : id);
  const client   = CLIENTS.find(c => c.id === clientId);
  const stageMap = CLIENT_STAGES[clientId] || {};

  // Compute progress summary
  const total     = STAGES.length;
  const complete  = STAGES.filter(s => ["complete"].includes(stageMap[s.id]?.status)).length;
  const overdue   = STAGES.filter(s => stageMap[s.id]?.status === "overdue").length;
  const active    = STAGES.filter(s => ["active","in_progress"].includes(stageMap[s.id]?.status)).length;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%",
      background:T.bg, fontFamily:"'Sora',sans-serif",
      color:T.text, overflow:"hidden" }}>

      {/* HEADER */}
      <div style={{ padding:"14px 20px 12px", borderBottom:`1px solid ${T.border}`,
        flexShrink:0, background:T.surface }}>
        <div style={{ display:"flex", alignItems:"center" }}>
          <div>
            <h1 style={{ fontFamily:"'Newsreader',serif", fontSize:18, fontWeight:600,
              color:T.text, margin:0, fontStyle:"italic" }}>
              Platform Flow Chart
            </h1>
            <Lbl style={{ marginTop:3, display:"block" }}>
              Client Journey · Input → Process → Output · Click any stage to expand
            </Lbl>
          </div>
          <div style={{ flex:1 }} />
          <button onClick={() => setOpenStage(null)}
            style={{ fontSize:9.5, color:T.sub, background:"transparent",
              border:`1px solid ${T.border}`, borderRadius:5,
              padding:"4px 11px", cursor:"pointer", fontFamily:"'Sora'" }}>
            Collapse All
          </button>
        </div>
      </div>

      {/* BODY */}
      <div style={{ display:"flex", flex:1, minHeight:0 }}>

        {/* Left — client list */}
        <div style={{ width:260, flexShrink:0, borderRight:`1px solid ${T.border}`,
          overflowY:"auto", padding:"10px 8px" }}>
          {CLIENTS.map(c => (
            <ClientCard key={c.id} client={c}
              selected={clientId === c.id}
              onClick={() => { setClientId(c.id); setOpenStage(null); }} />
          ))}
        </div>

        {/* Right — flowchart */}
        <div style={{ flex:1, minWidth:0, display:"flex",
          flexDirection:"column", overflow:"hidden" }}>

          {/* Client sub-header */}
          <div style={{ padding:"10px 20px", borderBottom:`1px solid ${T.border}`,
            flexShrink:0, background:T.surface,
            display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ flex:1 }}>
              <span style={{ fontSize:12, fontWeight:600, color:T.text }}>
                {client?.name}
              </span>
              <span style={{ fontSize:9.5, color:T.sub, marginLeft:8 }}>
                {client?.website}
              </span>
            </div>
            {/* Progress summary */}
            {[
              { l:"Stages complete", v:complete, c:T.green  },
              { l:"Active",          v:active,   c:T.accent },
              { l:"Overdue",         v:overdue,  c:overdue > 0 ? T.red : T.sub },
            ].map(s => (
              <div key={s.l} style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                <span style={{ fontSize:16, fontWeight:600, color:s.c, lineHeight:1 }}>{s.v}</span>
                <span style={{ fontSize:8.5, color:T.label }}>{s.l}</span>
              </div>
            ))}
          </div>

          {/* Flow */}
          <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>
            {STAGES.map((stage, i) => (
              <StageNode
                key={stage.id}
                stage={stage}
                clientStage={stageMap[stage.id]}
                open={openStage === stage.id}
                onToggle={() => toggle(stage.id)}
                isLast={i === STAGES.length - 1} />
            ))}

            <div style={{ marginTop:14, padding:"10px 14px",
              background:T.raised, borderRadius:7,
              border:`1px solid ${T.border}`, fontSize:9.5, color:T.sub }}>
              ↺ Intelligence Monitoring runs continuously for BAU clients from Stage 03 onwards — in parallel with all downstream stages.
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
