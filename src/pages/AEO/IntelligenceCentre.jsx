/**
 * 5th Avenue — Internal OS
 * Module 7: Intelligence Centre
 * ─────────────────────────────────────────────────────────────────
 * Ongoing monitoring. Signal-first. Post-audit tracking.
 *
 * Default view: unified signal feed sorted by significance.
 * KPI view: per-channel targets — system-suggested, consultant-confirmed.
 * Channel views: individual channel metrics, trend, benchmark, signals.
 *
 * Anomaly → Audit bridge: non-intrusive prompt inside signal expansion.
 * Signals feed what needs attention. Audit explains why.
 */

import { useState, useMemo } from "react";

// ── TOKENS ────────────────────────────────────────────────────────────────────
import { T } from "../../theme/tokens";

// ── CHANNEL META ──────────────────────────────────────────────────────────────
const CHANNELS = [
  { id:"search",      label:"Search",      color:T.green   },
  { id:"ai",          label:"AI Presence", color:T.purple  },
  { id:"maps",        label:"Maps / MEO",  color:T.amber   },
  { id:"reviews",     label:"Reviews",     color:"#C47ABF" },
  { id:"social",      label:"Social",      color:"#4ADE80" },
  { id:"video",       label:"Video",       color:T.red     },
  { id:"marketplace", label:"Marketplace", color:T.accent  },
  { id:"competitors", label:"Competitors", color:T.sub     },
];

const chColor = id => CHANNELS.find(c => c.id === id)?.color || T.sub;
const chLabel = id => CHANNELS.find(c => c.id === id)?.label || id;

// ── CLIENTS ───────────────────────────────────────────────────────────────────
const CLIENTS = [
  { id:"fb", name:"FreshBite Foods",   init:"FB", faavi:72, phase:"bau"      },
  { id:"nb", name:"NutriBlend India",  init:"NB", faavi:61, phase:"launch"   },
  { id:"ch", name:"CraftHome Decor",   init:"CH", faavi:53, phase:"audit"    },
  { id:"df", name:"DermFirst",         init:"DF", faavi:68, phase:"campaigns"},
  { id:"tg", name:"TerraGrow Organic", init:"TG", faavi:44, phase:"audit"    },
];

// ── SIGNALS DATA ──────────────────────────────────────────────────────────────
const SIGNALS_DATA = {
  fb:[
    { id:"s1",  ch:"ai",       dir:"down", sig:"high",   ack:false, time:"2h ago",
      metric:"ChatGPT citation rate",
      delta:"-8%", current:"0 citations", benchmark:"Happilo: 12 citations",
      title:"ChatGPT stopped citing FreshBite for 3 tracked category queries this month",
      evidence:"Monthly query test: 'best healthy snacks India', 'low sugar snacks', 'millet snacks brand' — FreshBite present in 0 of 3. Last month: 2 of 3. Happilo present in all 3.",
      recommendation:"Publish one structured comparison article targeting these exact queries. Perplexity update cycle is 2–4 weeks — fastest path to re-establishing citations.",
      needsAudit:true, auditChannel:"AI Presence" },
    { id:"s2",  ch:"search",   dir:"up",   sig:"medium", ack:false, time:"Yesterday",
      metric:"Core Web Vitals — LCP",
      delta:"-1.1s", current:"3.1s", benchmark:"Target: 2.5s",
      title:"LCP improved from 4.2s to 3.1s following image optimisation sprint",
      evidence:"PageSpeed mobile score: 58 → 71. LCP 4.2s → 3.1s. FID and CLS unchanged. Still below the 2.5s threshold for Core Web Vitals pass.",
      recommendation:"Complete the JS bundle reduction task (due 29 May) to achieve full CWV pass. Estimated LCP improvement: additional 0.4–0.6s.",
      needsAudit:false },
    { id:"s3",  ch:"reviews",  dir:"up",   sig:"low",    ack:false, time:"Yesterday",
      metric:"Review volume",
      delta:"+15", current:"142 reviews", benchmark:"Target: 200",
      title:"15 new Google reviews in the last 30 days — avg rating 4.4★ maintained",
      evidence:"Review volume: 127 → 142. New reviews: 11 positive (4–5★), 3 neutral (3★), 1 negative (1★). Response rate still 22%.",
      recommendation:"Respond to all 15 new reviews within 48 hours. The negative review (unresponded 6 days) is the most urgent action.",
      needsAudit:false },
    { id:"s4",  ch:"ai",       dir:"down", sig:"high",   ack:false, time:"3 days ago",
      metric:"Perplexity displacement",
      delta:"−3 queries", current:"0 appearances", benchmark:"Happilo: 4 appearances",
      title:"Competitor Happilo now cited in Perplexity for 3 queries where FreshBite previously ranked",
      evidence:"Perplexity query tests: 'healthy snack subscription India', 'low calorie snacks', 'office snack delivery India' — Happilo cited in all 3. FreshBite absent. Previous test (45 days ago): FreshBite appeared in 1 of 3.",
      recommendation:"Immediate: publish the Perplexity-first article brief from the AI Citation work package. This displacement is recent and still reversible.",
      needsAudit:true, auditChannel:"AI Presence" },
    { id:"s5",  ch:"maps",     dir:"flat", sig:"low",    ack:true,  time:"5 days ago",
      metric:"GBP listing views",
      delta:"±0%", current:"840 views/mo", benchmark:"Last month: 835",
      title:"GBP primary listing views stable — no meaningful change",
      evidence:"Google Business Profile insights: 840 monthly views (835 last month). Direction requests: 42 (38 last month). Calls: 18 (21 last month).",
      recommendation:"No immediate action required. Unclaimed partner listings remain the priority MEO action.",
      needsAudit:false },
    { id:"s6",  ch:"search",   dir:"up",   sig:"medium", ack:false, time:"4 days ago",
      metric:"Featured snippet — new capture",
      delta:"+1 snippet", current:"3 snippets", benchmark:"Target: 8",
      title:"Featured snippet captured for 'ragi snacks benefits' (2.1K/mo)",
      evidence:"Search Console shows FreshBite now appearing in position 0 for 'ragi snacks benefits'. Estimated additional CTR: +340 sessions/month.",
      recommendation:"Replicate the content structure from this page across the other 5 snippet targets identified in the AEO work package.",
      needsAudit:false },
  ],
  nb:[
    { id:"n1", ch:"ai", dir:"down", sig:"high", ack:false, time:"Today",
      metric:"AI platform presence",
      delta:"0 citations", current:"0/5 platforms", benchmark:"MuscleBlaze: 5/5",
      title:"NutriBlend absent from all 5 AI platforms — no change from last month",
      evidence:"Monthly platform test: ChatGPT, Perplexity, Gemini, Claude, Copilot — NutriBlend cited zero times for protein powder queries. MuscleBlaze cited in all 5.",
      recommendation:"AI Citation work package must start immediately. Every month of delay compounds the gap.",
      needsAudit:true, auditChannel:"AI Presence" },
    { id:"n2", ch:"search", dir:"flat", sig:"medium", ack:false, time:"3 days ago",
      metric:"Domain authority",
      delta:"+0", current:"DA 18", benchmark:"MuscleBlaze: DA 52",
      title:"Domain authority unchanged at 18 — backlink programme not yet started",
      evidence:"Ahrefs: DA 18, 43 referring domains. No new backlinks acquired this month. Backlink programme tasks overdue by 4 days.",
      recommendation:"Backlink programme task is 4 days overdue. Escalate to owner (Arjun) immediately.",
      needsAudit:false },
  ],
  ch:[
    { id:"c1", ch:"maps", dir:"down", sig:"high", ack:false, time:"Today",
      metric:"Local search visibility",
      delta:"0 impressions", current:"Not listed", benchmark:"Pepperfry: 3 listings",
      title:"GBP claim still not submitted — showroom invisible to local search for 67 days",
      evidence:"Google Maps: CraftHome showroom not appearing in 'home decor Bengaluru' or 'home decor store near me' queries. GBP claim task status: overdue by 1 day.",
      recommendation:"GBP claim is a 15-minute task. Escalate to Vikram immediately — this is the single highest-impact action across the portfolio.",
      needsAudit:true, auditChannel:"Maps / MEO" },
  ],
  df:[
    { id:"d1", ch:"ai", dir:"up", sig:"medium", ack:false, time:"Yesterday",
      metric:"Perplexity citations",
      delta:"+6 queries", current:"6 queries", benchmark:"Target: 15 queries",
      title:"Perplexity now citing DermFirst for 6 dermatology queries — up from 0 last month",
      evidence:"Perplexity query tests: DermFirst cited for 'retinol for beginners', 'niacinamide skincare', 'dermatologist recommended moisturiser India' and 3 more. Growing.",
      recommendation:"Momentum is working. Publish 2 more expert articles to extend into ChatGPT citations within 60 days.",
      needsAudit:false },
    { id:"d2", ch:"search", dir:"down", sig:"medium", ack:false, time:"3 days ago",
      metric:"Shared keyword rankings",
      delta:"-2 positions avg", current:"Avg pos 11.4", benchmark:"Minimalist: avg pos 5.2",
      title:"Average position vs Minimalist widened — 2 shared keywords dropped out of top 10",
      evidence:"Rank tracker: 'vitamin C serum India' (4.8K/mo) dropped from pos 9 to 12. 'best face serum' dropped from pos 8 to 11. Minimalist unchanged.",
      recommendation:"Both keywords have content that needs freshening. Update with 2025 data and add FAQ schema.",
      needsAudit:false },
  ],
  tg:[
    { id:"tg1", ch:"search", dir:"down", sig:"high", ack:false, time:"Today",
      metric:"Overall visibility",
      delta:"N/A", current:"No audit data", benchmark:"N/A",
      title:"No monitoring data available — baseline audit required before intelligence tracking can begin",
      evidence:"TerraGrow has been a client for 91 days with no completed audit. Intelligence Centre cannot surface meaningful signals without baseline channel scores.",
      recommendation:"Prioritise TerraGrow baseline audit immediately. Without it, the team is flying blind on this account.",
      needsAudit:true, auditChannel:"All Channels" },
  ],
};

// ── KPI DATA ──────────────────────────────────────────────────────────────────
// trend: last 6 data points for sparkline
const KPIS_DATA = {
  fb:{
    search:[
      { id:"k1", metric:"Organic sessions / mo", unit:"sessions", current:12400, target:null, suggested:18000, targetConfirmed:false, trend:[9800,10200,10800,11400,12100,12400], dir:"up",   owner:"t5", cadence:"monthly" },
      { id:"k2", metric:"Keywords in top 10",    unit:"keywords", current:43,    target:70,   suggested:70,    targetConfirmed:true,  trend:[31,34,37,39,41,43],              dir:"up",   owner:"t5", cadence:"monthly" },
      { id:"k3", metric:"Avg position (tracked)",unit:"pos",      current:14.2,  target:8.0,  suggested:9.0,   targetConfirmed:false, trend:[18.4,17.1,16.8,16.2,15.3,14.2], dir:"up",   owner:"t5", cadence:"weekly"  },
      { id:"k4", metric:"Featured snippets owned",unit:"snippets",current:3,     target:8,    suggested:7,     targetConfirmed:false, trend:[1,1,2,2,2,3],                   dir:"up",   owner:"t4", cadence:"monthly" },
    ],
    ai:[
      { id:"k5", metric:"ChatGPT citation rate",  unit:"%",  current:0,  target:null, suggested:15, targetConfirmed:false, trend:[2,3,2,1,0,0],    dir:"down", owner:"t6", cadence:"monthly" },
      { id:"k6", metric:"Perplexity citation rate",unit:"%", current:0,  target:null, suggested:20, targetConfirmed:false, trend:[3,3,2,2,0,0],    dir:"down", owner:"t6", cadence:"monthly" },
      { id:"k7", metric:"AI presence score",       unit:"/100",current:58,target:75,  suggested:72, targetConfirmed:false, trend:[54,55,56,57,58,58],dir:"flat",owner:"t6", cadence:"monthly" },
    ],
    maps:[
      { id:"k8", metric:"GBP listing completeness",unit:"%",    current:72, target:95, suggested:95, targetConfirmed:true,  trend:[65,65,68,70,72,72], dir:"up",   owner:"t5", cadence:"monthly" },
      { id:"k9", metric:"Monthly direction requests",unit:"req",current:180,target:280,suggested:260,targetConfirmed:false, trend:[160,165,170,172,178,180],dir:"up",owner:"t5",cadence:"monthly"},
    ],
    reviews:[
      { id:"k10",metric:"Average rating",       unit:"★",    current:4.4, target:4.6, suggested:4.5, targetConfirmed:false, trend:[4.3,4.3,4.4,4.4,4.4,4.4], dir:"flat", owner:"t5", cadence:"monthly" },
      { id:"k11",metric:"Review response rate", unit:"%",    current:22,  target:80,  suggested:80,  targetConfirmed:true,  trend:[18,19,20,20,21,22],        dir:"up",   owner:"t5", cadence:"weekly"  },
      { id:"k12",metric:"New reviews / month",  unit:"reviews",current:15,target:25,  suggested:25,  targetConfirmed:false, trend:[8,9,10,12,13,15],          dir:"up",   owner:"t5", cadence:"monthly" },
    ],
  },
  nb:{
    ai:[
      { id:"n1", metric:"AI platforms cited in", unit:"/5",  current:0,  target:5, suggested:3,  targetConfirmed:false, trend:[0,0,0,0,0,0], dir:"flat", owner:"t1", cadence:"monthly" },
      { id:"n2", metric:"AI presence score",     unit:"/100",current:48, target:72,suggested:65, targetConfirmed:false, trend:[46,46,47,47,48,48],dir:"flat",owner:"t1",cadence:"monthly"},
    ],
    search:[
      { id:"n3", metric:"Domain authority",      unit:"DA",  current:18, target:35, suggested:28, targetConfirmed:false, trend:[17,17,17,18,18,18], dir:"flat", owner:"t3", cadence:"monthly" },
      { id:"n4", metric:"Referring domains",     unit:"domains",current:43,target:120,suggested:80,targetConfirmed:false,trend:[40,41,42,42,43,43],  dir:"up",   owner:"t3", cadence:"monthly" },
    ],
  },
  ch:{
    maps:[
      { id:"c1", metric:"GBP listing claimed",   unit:"",    current:0,  target:3, suggested:3,  targetConfirmed:false, trend:[0,0,0,0,0,0],     dir:"flat", owner:"t2", cadence:"weekly" },
    ],
    search:[
      { id:"c2", metric:"Keywords in top 20",    unit:"kws", current:8,  target:40,suggested:30, targetConfirmed:false, trend:[5,6,7,7,8,8],     dir:"up",   owner:"t2", cadence:"monthly"},
    ],
  },
  df:{
    ai:[
      { id:"d1", metric:"Perplexity citations",  unit:"queries",current:6,target:15,suggested:12,targetConfirmed:false,trend:[0,0,0,1,3,6],      dir:"up",   owner:"t4", cadence:"monthly" },
      { id:"d2", metric:"AI presence score",     unit:"/100",current:65,target:80, suggested:78,targetConfirmed:false, trend:[58,59,60,62,63,65], dir:"up",   owner:"t4", cadence:"monthly" },
    ],
    search:[
      { id:"d3", metric:"Keywords vs Minimalist",unit:"ahead",current:-28,target:0, suggested:-10,targetConfirmed:false,trend:[-32,-31,-30,-30,-29,-28],dir:"up",owner:"t3",cadence:"monthly"},
    ],
  },
  tg:{ search:[{ id:"tg1", metric:"Overall visibility", unit:"/100", current:0, target:null, suggested:50, targetConfirmed:false, trend:[0,0,0,0,0,0], dir:"flat", owner:"t3", cadence:"monthly" }] },
};

// ── TEAM ─────────────────────────────────────────────────────────────────────
const TEAM = [
  { id:"t1", name:"Priya Nair",  init:"PN" },
  { id:"t2", name:"Vikram Das",  init:"VD" },
  { id:"t3", name:"Arjun Reddy", init:"AR" },
  { id:"t4", name:"Sneha Iyer",  init:"SI" },
  { id:"t5", name:"Meera Joshi", init:"MJ" },
  { id:"t6", name:"Karan Shah",  init:"KS" },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
const scoreColor = s  => s >= 70 ? T.green : s >= 50 ? T.amber : T.red;
const phaseColor = p  => ({ audit:T.label, launch:T.amber, bau:T.accent, campaigns:T.green })[p] || T.sub;
const phaseLabel = p  => ({ audit:"Audit", launch:"Launch", bau:"BAU", campaigns:"Campaigns" })[p] || p;
const sigColor   = s  => ({ high:T.red, medium:T.amber, low:T.sub })[s] || T.sub;
const dirColor   = d  => ({ up:T.green, down:T.red, flat:T.sub })[d] || T.sub;
const dirIcon    = d  => ({ up:"▲", down:"▼", flat:"—" })[d] || "—";
const getTeam    = id => TEAM.find(t => t.id === id);

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
  };
  return <button onClick={onClick} disabled={disabled}
    style={{...b,...(v[variant]||v.ghost),...style}}>{children}</button>;
}

// ── SPARKLINE ─────────────────────────────────────────────────────────────────
function Sparkline({ data, color, width=72, height=22 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length-1)) * (width - pad*2);
    const y = pad + ((max - v) / range) * (height - pad*2);
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      style={{ overflow:"visible", flexShrink:0 }}>
      <polyline points={pts} fill="none"
        stroke={color || T.accent} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      {/* End dot */}
      {(() => {
        const last = data[data.length-1];
        const x = width - pad;
        const y = pad + ((max - last) / range) * (height - pad*2);
        return <circle cx={x} cy={y} r="2.5" fill={color || T.accent} />;
      })()}
    </svg>
  );
}

// ── SIGNAL CARD ───────────────────────────────────────────────────────────────
function SignalCard({ signal, onAcknowledge, onRunAudit }) {
  const [open, setOpen] = useState(false);
  const isAcknowledged  = signal.ack;

  return (
    <div style={{ borderRadius:8, border:`1px solid ${T.border}`,
      background: T.raised,
      opacity: isAcknowledged ? 0.55 : 1,
      marginBottom:8, transition:"all 0.15s",
      borderLeft:`3px solid ${signal.sig === "high" && !isAcknowledged
        ? (signal.dir === "down" ? T.red : signal.dir === "up" ? T.green : T.sub)
        : T.mute}` }}>

      {/* Signal summary row — always visible */}
      <div onClick={() => setOpen(!open)}
        style={{ padding:"12px 16px", cursor:"pointer", display:"flex",
          alignItems:"flex-start", gap:12 }}
        onMouseOver={e => e.currentTarget.style.background = T.hover}
        onMouseOut={e  => e.currentTarget.style.background = "transparent"}>

        {/* Direction + channel */}
        <div style={{ flexShrink:0, width:36, display:"flex",
          flexDirection:"column", alignItems:"center", gap:4, paddingTop:2 }}>
          <span style={{ fontSize:13, color:dirColor(signal.dir), fontWeight:700 }}>
            {dirIcon(signal.dir)}
          </span>
          <span style={{ fontSize:8, fontWeight:700, color:chColor(signal.ch),
            textTransform:"uppercase", letterSpacing:"0.06em", textAlign:"center",
            lineHeight:1.2 }}>
            {chLabel(signal.ch).split("/")[0].trim()}
          </span>
        </div>

        {/* Title + delta */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:11.5, color:T.text, fontWeight:500,
            lineHeight:1.4, marginBottom:4 }}>
            {signal.title}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:10, fontWeight:700,
              color:dirColor(signal.dir) }}>{signal.delta}</span>
            <span style={{ fontSize:9.5, color:T.sub }}>{signal.metric}</span>
            <span style={{ color:T.mute }}>·</span>
            <span style={{ fontSize:9, color:T.label }}>{signal.time}</span>
            {signal.sig === "high" && !isAcknowledged && (
              <>
                <span style={{ color:T.mute }}>·</span>
                <span style={{ fontSize:8.5, color:sigColor(signal.sig),
                  fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                  High priority
                </span>
              </>
            )}
          </div>
        </div>

        <span style={{ fontSize:9, color:T.label, flexShrink:0, marginTop:2 }}>
          {open ? "▲" : "▼"}
        </span>
      </div>

      {/* Expanded detail */}
      {open && (
        <>
          <Hr />
          <div style={{ padding:"12px 16px 4px 64px",
            display:"flex", flexDirection:"column", gap:10 }}>

            {[
              { l:"Evidence",       t:signal.evidence       },
              { l:"Benchmark",      t:`${signal.benchmark}` },
              { l:"Recommendation", t:signal.recommendation },
            ].map(row => (
              <div key={row.l} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                <Lbl style={{ width:100, flexShrink:0, paddingTop:2 }}>{row.l}</Lbl>
                <div style={{ fontSize:11, color:T.text, lineHeight:1.55, flex:1 }}>
                  {row.t}
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ padding:"10px 16px 12px 64px",
            display:"flex", alignItems:"center", gap:8 }}>
            {!isAcknowledged && (
              <Btn variant="subtle" onClick={() => onAcknowledge(signal.id)}
                style={{ fontSize:9.5, padding:"3px 10px" }}>
                Acknowledge
              </Btn>
            )}

            {/* Anomaly → Audit bridge */}
            {signal.needsAudit && !isAcknowledged && (
              <button onClick={() => onRunAudit(signal)}
                style={{ fontSize:9.5, color:T.amber, background:"transparent",
                  border:`1px solid ${T.amber}30`, borderRadius:4,
                  padding:"3px 10px", cursor:"pointer", fontFamily:"'Sora'",
                  display:"flex", alignItems:"center", gap:5 }}>
                <span>⚑</span>
                <span>Anomaly detected — run {signal.auditChannel} audit →</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── SIGNAL FEED ───────────────────────────────────────────────────────────────
function SignalFeed({ signals, onAcknowledge, onRunAudit }) {
  const [showAck, setShowAck] = useState(false);
  const [chFilter, setChFilter] = useState("all");

  const visible = useMemo(() => {
    let list = [...signals];
    if (!showAck) list = list.filter(s => !s.ack);
    if (chFilter !== "all") list = list.filter(s => s.ch === chFilter);
    // Sort: high sig first, then by dir (down first), then time
    list.sort((a, b) => {
      const sigOrder = { high:0, medium:1, low:2 };
      if (a.ack !== b.ack) return a.ack ? 1 : -1;
      if (a.sig !== b.sig) return (sigOrder[a.sig]||2) - (sigOrder[b.sig]||2);
      if (a.dir !== b.dir) return a.dir === "down" ? -1 : 1;
      return 0;
    });
    return list;
  }, [signals, showAck, chFilter]);

  const unacked = signals.filter(s => !s.ack).length;
  const high    = signals.filter(s => s.sig === "high" && !s.ack).length;

  return (
    <div style={{ padding:"20px 24px", display:"flex",
      flexDirection:"column", gap:0 }}>

      {/* Feed controls */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {high > 0 && (
            <span style={{ fontSize:9.5, color:T.red, fontWeight:600 }}>
              {high} high priority
            </span>
          )}
          <span style={{ fontSize:9.5, color:T.sub }}>
            {unacked} active signal{unacked !== 1 ? "s" : ""}
          </span>
        </div>
        <div style={{ flex:1 }} />

        {/* Channel filter */}
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          {[["all","All"], ...CHANNELS.slice(0,5).map(c=>[c.id,c.label])].map(([id,lbl]) => (
            <button key={id} onClick={() => setChFilter(id)} style={{
              padding:"3px 8px", borderRadius:4, fontSize:9.5, fontWeight:500,
              fontFamily:"'Sora'", cursor:"pointer", border:"none",
              background: chFilter === id ? `${T.accent}20` : T.raised,
              color:       chFilter === id ? T.accent : T.sub }}>
              {lbl}
            </button>
          ))}
        </div>

        <button onClick={() => setShowAck(!showAck)}
          style={{ fontSize:9.5, color:T.label, background:"transparent",
            border:"none", cursor:"pointer", fontFamily:"'Sora'" }}>
          {showAck ? "Hide acknowledged" : "Show acknowledged"}
        </button>
      </div>

      {/* Signals */}
      {visible.length === 0 ? (
        <div style={{ padding:"40px 0", textAlign:"center",
          color:T.sub, fontSize:11 }}>
          No active signals.
          {!showAck && signals.some(s => s.ack) && (
            <button onClick={() => setShowAck(true)}
              style={{ display:"block", margin:"8px auto 0", fontSize:9.5,
                color:T.accent, background:"transparent",
                border:"none", cursor:"pointer", fontFamily:"'Sora'" }}>
              Show acknowledged signals
            </button>
          )}
        </div>
      ) : (
        visible.map(s => (
          <SignalCard key={s.id} signal={s}
            onAcknowledge={onAcknowledge}
            onRunAudit={onRunAudit} />
        ))
      )}
    </div>
  );
}

// ── KPI ROW ───────────────────────────────────────────────────────────────────
function KPIRow({ kpi, onConfirm, onEdit }) {
  const [editing,   setEditing]   = useState(false);
  const [editValue, setEditValue] = useState("");
  const owner = getTeam(kpi.owner);

  const displayTarget = kpi.targetConfirmed ? kpi.target : kpi.suggested;
  const delta = kpi.current != null && displayTarget != null
    ? (kpi.unit === "pos" ? displayTarget - kpi.current : kpi.current - displayTarget)
    : null;
  const deltaGood = kpi.unit === "pos" ? delta <= 0 : delta >= 0;

  return (
    <tr style={{ borderBottom:`1px solid ${T.border}` }}
      onMouseOver={e => e.currentTarget.style.background = T.hover}
      onMouseOut={e  => e.currentTarget.style.background = "transparent"}>

      {/* Metric */}
      <td style={{ padding:"10px 14px", fontSize:11, color:T.text, fontWeight:500,
        minWidth:200 }}>
        {kpi.metric}
        <div style={{ fontSize:8.5, color:T.sub, marginTop:1 }}>{kpi.cadence}</div>
      </td>

      {/* Current */}
      <td style={{ padding:"10px 14px", fontSize:13, fontWeight:700,
        color: kpi.current === 0 && kpi.unit !== "pos" ? T.red : T.text,
        whiteSpace:"nowrap" }}>
        {kpi.current}{kpi.unit && kpi.unit !== "" && kpi.unit !== "pos" ? ` ${kpi.unit}` : ""}
      </td>

      {/* Target */}
      <td style={{ padding:"10px 14px", whiteSpace:"nowrap" }}>
        {editing ? (
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <input type="number" value={editValue}
              onChange={e => setEditValue(e.target.value)}
              style={{ width:64, padding:"3px 6px", background:T.bg,
                border:`1px solid ${T.borderMid}`, borderRadius:4,
                color:T.text, fontSize:11, fontFamily:"'Sora'", outline:"none" }} />
            <button onClick={() => { onEdit(kpi.id, parseFloat(editValue)); setEditing(false); }}
              style={{ fontSize:9.5, color:T.green, background:"transparent",
                border:"none", cursor:"pointer", fontFamily:"'Sora'" }}>✓</button>
            <button onClick={() => setEditing(false)}
              style={{ fontSize:9.5, color:T.sub, background:"transparent",
                border:"none", cursor:"pointer", fontFamily:"'Sora'" }}>✕</button>
          </div>
        ) : (
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:11,
              color: kpi.targetConfirmed ? T.text : T.sub }}>
              {displayTarget != null ? displayTarget : "—"}
              {kpi.unit && kpi.unit !== "" && kpi.unit !== "pos" ? ` ${kpi.unit}` : ""}
            </span>
            {!kpi.targetConfirmed && displayTarget != null && (
              <span style={{ fontSize:8, color:T.label, padding:"1px 5px",
                background:T.mute, borderRadius:3 }}>Suggested</span>
            )}
            <div style={{ display:"flex", gap:4 }}>
              {!kpi.targetConfirmed && (
                <button onClick={() => onConfirm(kpi.id)}
                  style={{ fontSize:8.5, color:T.green, background:"transparent",
                    border:`1px solid ${T.green}30`, borderRadius:3,
                    padding:"1px 6px", cursor:"pointer", fontFamily:"'Sora'" }}>
                  Confirm
                </button>
              )}
              <button onClick={() => { setEditValue(displayTarget ?? ""); setEditing(true); }}
                style={{ fontSize:8.5, color:T.label, background:"transparent",
                  border:"none", cursor:"pointer", fontFamily:"'Sora'" }}>
                Edit
              </button>
            </div>
          </div>
        )}
      </td>

      {/* Delta */}
      <td style={{ padding:"10px 14px", fontSize:11, fontWeight:600,
        color: delta == null ? T.sub : deltaGood ? T.green : T.red,
        whiteSpace:"nowrap" }}>
        {delta != null
          ? `${delta > 0 ? "+" : ""}${typeof delta === "number" && !Number.isInteger(delta) ? delta.toFixed(1) : delta}`
          : "—"}
      </td>

      {/* Trend sparkline */}
      <td style={{ padding:"10px 14px" }}>
        <Sparkline data={kpi.trend}
          color={kpi.dir === "up" ? T.green : kpi.dir === "down" ? T.red : T.sub} />
      </td>

      {/* Owner */}
      <td style={{ padding:"10px 14px" }}>
        {owner && (
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            <Av init={owner.init} size={18} />
            <span style={{ fontSize:9, color:T.sub }}>{owner.init}</span>
          </div>
        )}
      </td>
    </tr>
  );
}

// ── KPI VIEW ──────────────────────────────────────────────────────────────────
const thS = { fontSize:9, fontWeight:600, color:T.label, textTransform:"uppercase",
  letterSpacing:"0.07em", padding:"7px 14px", whiteSpace:"nowrap",
  borderBottom:`1px solid ${T.border}`, textAlign:"left", background:T.raised };

function KPIView({ kpis, onConfirm, onEdit }) {
  const channels = Object.keys(kpis || {});
  if (!channels.length) return (
    <div style={{ padding:"40px 24px", textAlign:"center",
      color:T.sub, fontSize:11 }}>
      No KPI data — run audit to populate initial targets.
    </div>
  );

  const unconfirmedCount = channels.flatMap(ch => kpis[ch] || [])
    .filter(k => !k.targetConfirmed).length;

  return (
    <div style={{ padding:"20px 24px" }}>
      {unconfirmedCount > 0 && (
        <div style={{ marginBottom:16, padding:"10px 14px", borderRadius:7,
          border:`1px solid ${T.amber}28`, background:`${T.amber}06`,
          fontSize:10.5, color:T.text }}>
          <span style={{ color:T.amber, fontWeight:600 }}>
            {unconfirmedCount} suggested target{unconfirmedCount>1?"s":""} awaiting confirmation.
          </span>
          {" "}Review and confirm or adjust before the next reporting cycle.
        </div>
      )}

      {channels.map(ch => (
        <div key={ch} style={{ marginBottom:22 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
            <div style={{ width:4, height:14, borderRadius:2,
              background:chColor(ch), flexShrink:0 }} />
            <span style={{ fontSize:12, fontWeight:600, color:T.text }}>
              {chLabel(ch)}
            </span>
            <span style={{ fontSize:9.5, color:T.sub }}>
              {(kpis[ch]||[]).length} metric{(kpis[ch]||[]).length!==1?"s":""}
            </span>
          </div>
          <div style={{ borderRadius:8, border:`1px solid ${T.border}`,
            overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  {["Metric","Current","Target","vs Target","Trend","Owner"].map(h => (
                    <th key={h} style={thS}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(kpis[ch] || []).map(kpi => (
                  <KPIRow key={kpi.id} kpi={kpi}
                    onConfirm={onConfirm} onEdit={onEdit} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── CHANNEL VIEW (individual channel monitoring) ───────────────────────────────
function ChannelView({ channelId, signals, kpis, onAcknowledge, onRunAudit, onConfirm, onEdit }) {
  const chSignals = (signals || []).filter(s => s.ch === channelId);
  const chKPIs    = kpis?.[channelId] || [];

  return (
    <div style={{ padding:"20px 24px" }}>
      {/* Channel KPIs */}
      {chKPIs.length > 0 && (
        <div style={{ marginBottom:24 }}>
          <div style={{ marginBottom:12 }}>
            <Lbl>KPIs</Lbl>
          </div>
          <div style={{ borderRadius:8, border:`1px solid ${T.border}`, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  {["Metric","Current","Target","vs Target","Trend","Owner"].map(h => (
                    <th key={h} style={thS}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chKPIs.map(kpi => (
                  <KPIRow key={kpi.id} kpi={kpi}
                    onConfirm={onConfirm} onEdit={onEdit} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Channel signals */}
      {chSignals.length > 0 && (
        <div>
          <div style={{ marginBottom:12 }}>
            <Lbl>Signals</Lbl>
          </div>
          {chSignals.map(s => (
            <SignalCard key={s.id} signal={s}
              onAcknowledge={onAcknowledge}
              onRunAudit={onRunAudit} />
          ))}
        </div>
      )}

      {chKPIs.length === 0 && chSignals.length === 0 && (
        <div style={{ padding:"40px 0", textAlign:"center",
          color:T.sub, fontSize:11 }}>
          No {chLabel(channelId)} data yet.
        </div>
      )}
    </div>
  );
}

// ── CLIENT CARD ───────────────────────────────────────────────────────────────
function ClientCard({ client, signals, selected, onClick }) {
  const active   = (signals || []).filter(s => !s.ack);
  const high     = active.filter(s => s.sig === "high").length;
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
        {high > 0 && (
          <>
            <span style={{ color:T.mute }}>·</span>
            <span style={{ fontSize:9.5, color:T.red }}>{high} high priority</span>
          </>
        )}
        {active.length > 0 && high === 0 && (
          <>
            <span style={{ color:T.mute }}>·</span>
            <span style={{ fontSize:9.5, color:T.amber }}>{active.length} signals</span>
          </>
        )}
      </div>
      <div style={{ height:2, background:T.mute, borderRadius:1 }}>
        <div style={{ height:2, borderRadius:1,
          background:scoreColor(client.faavi),
          width:`${client.faavi}%`, transition:"width 0.4s" }} />
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id:"signals", label:"Signals" },
  { id:"kpis",    label:"KPIs"    },
  ...CHANNELS.map(c => ({ id:c.id, label:c.label })),
];

export default function IntelligenceCentre() {
  const [selectedClient, setClient]   = useState("fb");
  const [tab,            setTab]      = useState("signals");
  const [signals,        setSignals]  = useState(SIGNALS_DATA);
  const [kpis,           setKPIs]     = useState(KPIS_DATA);
  const [toast,          setToast]    = useState(null);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const handleAcknowledge = (signalId) => {
    setSignals(prev => ({
      ...prev,
      [selectedClient]: (prev[selectedClient] || []).map(s =>
        s.id === signalId ? { ...s, ack:true } : s
      ),
    }));
    showToast("Signal acknowledged");
  };

  const handleRunAudit = (signal) => {
    showToast(`Running ${signal.auditChannel} audit → Module 2`);
  };

  const handleConfirmTarget = (kpiId) => {
    setKPIs(prev => ({
      ...prev,
      [selectedClient]: Object.fromEntries(
        Object.entries(prev[selectedClient] || {}).map(([ch, list]) => [
          ch, list.map(k => k.id === kpiId ? { ...k, targetConfirmed:true, target:k.suggested } : k)
        ])
      ),
    }));
    showToast("Target confirmed");
  };

  const handleEditTarget = (kpiId, value) => {
    setKPIs(prev => ({
      ...prev,
      [selectedClient]: Object.fromEntries(
        Object.entries(prev[selectedClient] || {}).map(([ch, list]) => [
          ch, list.map(k => k.id === kpiId ? { ...k, target:value, suggested:value, targetConfirmed:true } : k)
        ])
      ),
    }));
    showToast("Target updated");
  };

  const clientSignals  = signals[selectedClient] || [];
  const clientKPIs     = kpis[selectedClient] || {};
  const activeSignals  = clientSignals.filter(s => !s.ack).length;
  const highSignals    = clientSignals.filter(s => s.sig === "high" && !s.ack).length;
  const unconfirmedKPIs = Object.values(clientKPIs).flat().filter(k => !k.targetConfirmed).length;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%",
      background:T.bg, fontFamily:"'Sora',sans-serif", color:T.text, overflow:"hidden" }}>

      {toast && (
        <div style={{ position:"fixed", bottom:20, right:20, zIndex:200,
          padding:"9px 14px", background:T.raised, border:`1px solid ${T.borderMid}`,
          borderRadius:6, fontSize:11, color:T.text }}>
          {toast}
        </div>
      )}

      {/* HEADER */}
      <div style={{ padding:"14px 24px 12px", borderBottom:`1px solid ${T.border}`,
        flexShrink:0, background:T.surface }}>
        <div style={{ display:"flex", alignItems:"center" }}>
          <div>
            <h1 style={{ fontFamily:"'Newsreader',serif", fontSize:18, fontWeight:600,
              color:T.text, margin:0, fontStyle:"italic" }}>Intelligence Centre</h1>
            <div style={{ marginTop:2 }}>
              <Lbl>Module 7 · Ongoing Monitoring · Signals → Benchmarks → Actions</Lbl>
            </div>
          </div>
          <div style={{ flex:1 }} />
          <div style={{ display:"flex", gap:20, marginRight:16 }}>
            {[
              { l:"Active signals",   v:activeSignals,   c:activeSignals>0 ? T.text : T.sub },
              { l:"High priority",    v:highSignals,     c:highSignals>0   ? T.red  : T.sub },
              { l:"KPIs unconfirmed", v:unconfirmedKPIs, c:unconfirmedKPIs>0?T.amber: T.sub },
            ].map(s => (
              <div key={s.l} style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                <span style={{ fontSize:18, fontWeight:600, color:s.c, lineHeight:1 }}>
                  {s.v}
                </span>
                <span style={{ fontSize:9, color:T.label }}>{s.l}</span>
              </div>
            ))}
          </div>
          <Btn variant="primary">Export Report →</Btn>
        </div>
      </div>

      {/* BODY */}
      <div style={{ display:"flex", flex:1, minHeight:0 }}>

        {/* Left panel */}
        <div style={{ width:260, flexShrink:0, borderRight:`1px solid ${T.border}`,
          overflowY:"auto", padding:"10px 8px" }}>
          {CLIENTS.map(c => (
            <ClientCard key={c.id} client={c}
              signals={signals[c.id] || []}
              selected={selectedClient === c.id}
              onClick={() => { setClient(c.id); setTab("signals"); }} />
          ))}
        </div>

        {/* Right panel */}
        <div style={{ flex:1, minWidth:0, display:"flex",
          flexDirection:"column", overflow:"hidden" }}>

          {/* Tab bar */}
          <div style={{ padding:"0 24px", borderBottom:`1px solid ${T.border}`,
            flexShrink:0, background:T.surface,
            display:"flex", gap:2, overflowX:"auto" }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding:"9px 12px", background:"transparent", border:"none",
                borderBottom:`2px solid ${tab===t.id ? T.accent : "transparent"}`,
                color: tab===t.id ? T.accent : T.sub,
                fontSize:10.5, fontWeight:500, fontFamily:"'Sora'",
                cursor:"pointer", transition:"all 0.12s", whiteSpace:"nowrap",
              }}>
                {t.label}
                {t.id === "signals" && activeSignals > 0 && (
                  <span style={{ marginLeft:5, fontSize:8.5, color:T.red,
                    fontWeight:700 }}>{activeSignals}</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex:1, overflowY:"auto" }}>
            {tab === "signals" && (
              <SignalFeed
                signals={clientSignals}
                onAcknowledge={handleAcknowledge}
                onRunAudit={handleRunAudit} />
            )}
            {tab === "kpis" && (
              <KPIView
                kpis={clientKPIs}
                onConfirm={handleConfirmTarget}
                onEdit={handleEditTarget} />
            )}
            {CHANNELS.map(ch => tab === ch.id && (
              <ChannelView key={ch.id}
                channelId={ch.id}
                signals={clientSignals}
                kpis={clientKPIs}
                onAcknowledge={handleAcknowledge}
                onRunAudit={handleRunAudit}
                onConfirm={handleConfirmTarget}
                onEdit={handleEditTarget} />
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
