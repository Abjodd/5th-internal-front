/**
 * 5th Avenue — Internal OS
 * Module 2: Audit Centre
 * ─────────────────────────────────────────────────────────────────
 * Four audit category types per channel:
 *   Auto   — system-generated, re-scannable findings
 *   Manual — structured form inputs per channel
 *   Dump   — unstructured data → AI converts to findings
 *   Admin  — custom categories defined by admin
 *
 * Finding chain: Finding → Insight → Recommendation (brief here, full in Module 4)
 * Typography: T.text for all active content. T.sub/T.label for inactive/metadata only.
 */

import { useState, useMemo } from "react";

// ── TOKENS ────────────────────────────────────────────────────────────────────
import { T } from "../../theme/tokens";

// ── CHANNEL DEFINITIONS ───────────────────────────────────────────────────────
const CHANNELS = [
  { id:"aeo",        label:"AEO",             types:["Auto","Manual"] },
  { id:"seo",        label:"SEO",             types:["Auto","Manual"] },
  { id:"meo",        label:"Maps / MEO",      types:["Auto","Manual"] },
  { id:"ai",         label:"AI Presence",     types:["Auto","Manual"] },
  { id:"reviews",    label:"Reviews",         types:["Auto","Manual"] },
  { id:"social",     label:"Social & Video",  types:["Auto","Manual"] },
  { id:"website",    label:"Website",         types:["Manual","Dump"]  },
  { id:"pr",         label:"PR & Media",      types:["Manual","Dump"]  },
  { id:"community",  label:"Community",       types:["Manual","Dump"]  },
  { id:"marketplace",label:"Marketplace",     types:["Auto","Manual"]  },
  { id:"influencer", label:"Influencer",      types:["Manual","Dump"]  },
];

// ── AUDIT FINDINGS DATA ───────────────────────────────────────────────────────
// Populated from the API at runtime (see AuditCentre root component).
let ALL_FINDINGS = {};

// ── MANUAL FORM FIELDS PER CHANNEL ────────────────────────────────────────────
const MANUAL_FIELDS = {
  aeo:         [{ id:"faq_pages",  label:"FAQ pages present",            type:"select",   opts:["Yes","No","Partial"] },
                { id:"pillar_ct",  label:"Number of pillar pages",        type:"number",  ph:"e.g. 4" },
                { id:"queries",    label:"Target queries (one per line)", type:"textarea", ph:"e.g. best healthy snacks india" },
                { id:"notes",      label:"Assessment notes",              type:"textarea", ph:"" }],
  seo:         [{ id:"avg_words",  label:"Avg. content length (words)",   type:"number",  ph:"e.g. 1200" },
                { id:"blog_freq",  label:"Blog posts / month",            type:"number",  ph:"e.g. 4" },
                { id:"content_age",label:"Avg. content age (months)",     type:"number",  ph:"e.g. 14" },
                { id:"notes",      label:"Content quality notes",         type:"textarea", ph:"" }],
  meo:         [{ id:"citations",  label:"Verified citations",            type:"number",  ph:"e.g. 12" },
                { id:"nap",        label:"NAP consistency",               type:"select",  opts:["Consistent","Minor issues","Major issues"] },
                { id:"categories", label:"GBP categories correct",        type:"select",  opts:["Yes","No","Partial"] },
                { id:"notes",      label:"Local audit notes",             type:"textarea", ph:"" }],
  ai:          [{ id:"queries_tested",label:"Queries tested",            type:"textarea", ph:"one per line" },
                { id:"competitors_cited",label:"Competitors cited instead",type:"textarea",ph:"" },
                { id:"notes",      label:"Platform notes",                type:"textarea", ph:"" }],
  reviews:     [{ id:"pos_themes", label:"Common positive themes",        type:"textarea", ph:"" },
                { id:"neg_themes", label:"Common negative themes",        type:"textarea", ph:"" },
                { id:"response_strategy",label:"Response strategy in place",type:"select",opts:["Yes","No","In progress"] },
                { id:"notes",      label:"Sentiment notes",               type:"textarea", ph:"" }],
  social:      [{ id:"freq",       label:"Posts per week",                type:"number",  ph:"e.g. 3" },
                { id:"pillars",    label:"Content pillars defined",       type:"select",  opts:["Yes","No"] },
                { id:"voice",      label:"Brand voice consistent",        type:"select",  opts:["Yes","Partially","No"] },
                { id:"notes",      label:"Social notes",                  type:"textarea", ph:"" }],
  website:     [{ id:"cro_issues", label:"CRO issues observed",          type:"textarea", ph:"" },
                { id:"speed",      label:"PageSpeed score (mobile)",      type:"number",  ph:"e.g. 62" },
                { id:"ux_rating",  label:"UX rating",                    type:"select",  opts:["Good","Average","Poor"] },
                { id:"notes",      label:"Website notes",                 type:"textarea", ph:"" }],
  pr:          [{ id:"coverage_ct",label:"Media mentions (last 90 days)", type:"number",  ph:"e.g. 8" },
                { id:"da_outlets", label:"DA 40+ outlet coverage",        type:"select",  opts:["Yes","No","Minimal"] },
                { id:"notes",      label:"PR notes",                      type:"textarea", ph:"" }],
  community:   [{ id:"forums",     label:"Active forum presence",         type:"select",  opts:["Yes","No","Minimal"] },
                { id:"reddit",     label:"Reddit / Quora presence",       type:"select",  opts:["Yes","No","Minimal"] },
                { id:"notes",      label:"Community notes",               type:"textarea", ph:"" }],
  marketplace: [{ id:"listings",   label:"Active marketplace listings",   type:"number",  ph:"e.g. 4" },
                { id:"avg_rating", label:"Avg. rating across platforms",  type:"number",  ph:"e.g. 4.1" },
                { id:"notes",      label:"Marketplace notes",             type:"textarea", ph:"" }],
  influencer:  [{ id:"active_creators",label:"Active creators",          type:"number",  ph:"e.g. 12" },
                { id:"niche",      label:"Primary creator niche",         type:"textarea", ph:"e.g. food, fitness" },
                { id:"avg_er",     label:"Avg. engagement rate %",        type:"number",  ph:"e.g. 3.8" },
                { id:"notes",      label:"Influencer ecosystem notes",    type:"textarea", ph:"" }],
};

// ── AI DUMP SIMULATION OUTPUT ─────────────────────────────────────────────────
const DUMP_AI_OUTPUT = {
  default: [
    { sev:"high",   title:"Structured content opportunity identified from notes",    insight:"The research dump references several competitive gaps that map to high-volume search queries with no current FreshBite content coverage.", recommendation:"Convert research notes into a formal content gap registry and prioritise top 5 by search volume." },
    { sev:"medium", title:"Competitor strength signal detected in unstructured data", insight:"Multiple references to competitor performance indicate client is aware of a visibility gap but has not yet mapped it to specific queries or channels.", recommendation:"Run targeted query tests against the competitors mentioned and map to the findings table." },
    { sev:"low",    title:"Brand positioning inconsistency noted in dump data",       insight:"Notes suggest brand messaging varies across channels — this creates inconsistent AI citation context.", recommendation:"Define a canonical brand description and deploy across all owned channels and profiles." },
  ],
};

// ── CLIENT LIST ───────────────────────────────────────────────────────────────
const CLIENTS = [
  { id:"fb", name:"FreshBite Foods",   init:"FB", website:"freshbitefoods.com", faavi:72, phase:"bau",       auditAge:18 },
  { id:"nb", name:"NutriBlend India",  init:"NB", website:"nutriblend.in",      faavi:61, phase:"launch",    auditAge:42 },
  { id:"ch", name:"CraftHome Decor",   init:"CH", website:"crafthomedecor.com", faavi:53, phase:"audit",     auditAge:67 },
  { id:"df", name:"DermFirst",         init:"DF", website:"dermfirst.in",       faavi:68, phase:"campaigns", auditAge:9  },
  { id:"tg", name:"TerraGrow Organic", init:"TG", website:"terragrow.in",       faavi:44, phase:"audit",     auditAge:91 },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
const scoreColor = s  => s >= 70 ? T.green : s >= 50 ? T.amber : T.red;
const phaseColor = p  => ({ audit:T.label, launch:T.amber, bau:T.accent, campaigns:T.green })[p] || T.sub;
const phaseLabel = p  => ({ audit:"Audit", launch:"Launch", bau:"BAU", campaigns:"Campaigns" })[p] || p;
const sevColor   = s  => ({ critical:T.red, high:T.amber, medium:T.accent, low:T.label })[s] || T.label;
const sevLabel   = s  => ({ critical:"Critical", high:"High", medium:"Medium", low:"Low" })[s] || s;
const statusColor= s  => ({ open:T.text, develop:T.accent, task:T.amber, monitor:T.purple, ignored:T.sub })[s] || T.sub;
const statusLabel= s  => ({ open:"Open", develop:"In Develop", task:"Task", monitor:"Monitor", ignored:"Ignored" })[s] || s;

const clientFindings = (cid) => {
  const data = ALL_FINDINGS[cid] || {};
  return Object.entries(data).flatMap(([ch, arr]) => arr.map(f => ({ ...f, channel:ch })));
};
const channelFindings = (cid, ch) => (ALL_FINDINGS[cid]?.[ch] || []);

// ── ATOMS ─────────────────────────────────────────────────────────────────────
const Av  = ({ init, size=22 }) =>
  <div style={{ width:size, height:size, borderRadius:4, flexShrink:0, background:T.mute,
    display:"flex", alignItems:"center", justifyContent:"center",
    fontSize:Math.max(7,size*0.38), fontWeight:600, color:T.sub }}>{init}</div>;

const Dot = ({ color=T.sub, size=5 }) =>
  <span style={{ width:size, height:size, borderRadius:"50%", background:color,
    display:"inline-block", flexShrink:0 }} />;

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
    primary: { background:T.accent, color:"#07080D", fontWeight:600 },
    ghost:   { background:T.hover,  color:T.sub, border:`1px solid ${T.border}` },
    subtle:  { background:"transparent", color:T.label, border:`1px solid ${T.border}` },
    danger:  { background:"transparent", color:T.red, border:`1px solid ${T.red}22` },
  };
  return <button onClick={onClick} disabled={disabled}
    style={{...b,...(v[variant]||v.ghost),...style}}>{children}</button>;
}

const INP = { width:"100%", padding:"7px 10px", borderRadius:5, background:T.raised,
  border:`1px solid ${T.border}`, color:T.text, fontSize:11,
  fontFamily:"'Sora'", outline:"none" };

const thS = { fontSize:9, fontWeight:600, color:T.label, textTransform:"uppercase",
  letterSpacing:"0.07em", padding:"7px 12px", whiteSpace:"nowrap",
  borderBottom:`1px solid ${T.border}`, textAlign:"left", background:T.raised };
const tdS = { padding:"8px 12px", borderBottom:`1px solid ${T.border}`,
  fontSize:11, color:T.text, verticalAlign:"top" };

// ── CHANNEL CARD ──────────────────────────────────────────────────────────────
function ChannelCard({ ch, findings, onClick }) {
  const hasData   = findings.length > 0;
  const crit      = findings.filter(f => f.sev === "critical").length;
  const high      = findings.filter(f => f.sev === "high").length;
  const medium    = findings.filter(f => f.sev === "medium").length;
  const topSev    = crit > 0 ? "critical" : high > 0 ? "high" : medium > 0 ? "medium" : null;
  const scores    = { aeo:68,seo:74,meo:80,ai:58,reviews:85,social:62,
                      website:55,pr:45,community:40,marketplace:39,influencer:50 };
  const score     = scores[ch.id] || 0;
  const total     = findings.length;

  return (
    <div onClick={onClick}
      style={{ padding:"14px 16px", background:T.raised, borderRadius:8,
        border:`1px solid ${T.border}`, cursor:"pointer", transition:"all 0.12s",
        display:"flex", flexDirection:"column", gap:12 }}
      onMouseOver={e => e.currentTarget.style.borderColor = T.borderMid}
      onMouseOut={e  => e.currentTarget.style.borderColor = T.border}
    >
      {/* Row 1: Name + type badges */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
        <div style={{ fontSize:12, fontWeight:600,
          color: hasData ? T.text : T.sub }}>
          {ch.label}
        </div>
        <div style={{ display:"flex", gap:3, flexShrink:0 }}>
          {ch.types.map(t => (
            <span key={t} style={{ fontSize:8, color:T.label,
              padding:"1px 5px", border:`1px solid ${T.border}`, borderRadius:3 }}>
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Row 2: Score + severity breakdown */}
      <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:28, fontWeight:700, lineHeight:1,
            color: hasData ? scoreColor(score) : T.sub }}>
            {hasData ? score : "—"}
          </div>
          <div style={{ fontSize:9, color:T.sub, marginTop:3 }}>
            {hasData ? `${total} finding${total !== 1 ? "s" : ""}` : "Not audited"}
          </div>
        </div>

        {hasData && total > 0 && (
          <div style={{ display:"flex", flexDirection:"column",
            alignItems:"flex-end", gap:2 }}>
            {crit > 0   && <span style={{ fontSize:9, color:T.red    }}>{crit} critical</span>}
            {high > 0   && <span style={{ fontSize:9, color:T.amber  }}>{high} high</span>}
            {medium > 0 && <span style={{ fontSize:9, color:T.accent }}>{medium} medium</span>}
          </div>
        )}
      </div>

      {/* Severity distribution bar */}
      <div style={{ height:3, background:T.mute, borderRadius:2,
        display:"flex", overflow:"hidden", gap:1 }}>
        {hasData && total > 0 ? (
          ["critical","high","medium","low"].map(s => {
            const n = findings.filter(f => f.sev === s).length;
            if (!n) return null;
            return <div key={s} style={{ flex:n, background:sevColor(s),
              height:3, borderRadius:2 }} />;
          })
        ) : (
          <div style={{ flex:1, background:T.mute, height:3 }} />
        )}
      </div>
    </div>
  );
}

// ── FINDING ROW (expandable) ──────────────────────────────────────────────────
function FindingRow({ finding, expanded, onToggle, onAction, showChannel }) {
  return (
    <>
      <tr style={{ cursor:"pointer" }}
        onClick={onToggle}
        onMouseOver={e  => e.currentTarget.style.background = T.hover}
        onMouseOut={e   => e.currentTarget.style.background = "transparent"}>
        <td style={{ ...tdS, width:12, paddingRight:4 }}>
          <Dot color={sevColor(finding.sev)} size={6} />
        </td>
        {showChannel && (
          <td style={{ ...tdS, color:T.sub, whiteSpace:"nowrap", fontSize:10 }}>
            {finding.channel?.toUpperCase()}
          </td>
        )}
        <td style={{ ...tdS, fontWeight:500 }}>{finding.title}</td>
        <td style={{ ...tdS, whiteSpace:"nowrap", color:T.sub, fontSize:10 }}>
          {finding.cat === "auto" ? "Auto" : finding.cat === "manual" ? "Manual" :
           finding.cat === "dump" ? "Dump" : "Admin"}
        </td>
        <td style={{ ...tdS, whiteSpace:"nowrap" }}>
          <span style={{ color:statusColor(finding.status), fontSize:10.5, fontWeight:500 }}>
            {statusLabel(finding.status)}
          </span>
        </td>
        <td style={{ ...tdS, whiteSpace:"nowrap", fontWeight:700,
          color: finding.pri >= 20 ? T.red : finding.pri >= 12 ? T.amber : T.text }}>
          {finding.pri.toFixed(1)}
        </td>
        <td style={{ ...tdS, whiteSpace:"nowrap" }}>
          <span style={{ fontSize:9, color:T.accent }}>
            {expanded ? "▲" : "▼"}
          </span>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={showChannel ? 7 : 6}
            style={{ padding:"12px 14px 14px 28px",
              borderBottom:`1px solid ${T.border}`,
              background:"rgba(255,255,255,0.018)" }}>

            {/* Three-row chain */}
            {[
              { label:"Finding",        text:finding.finding        },
              { label:"Insight",        text:finding.insight        },
              { label:"Recommendation", text:finding.recommendation },
            ].map(row => (
              <div key={row.label} style={{ display:"flex", gap:12,
                marginBottom:8, alignItems:"flex-start" }}>
                <Lbl style={{ width:100, flexShrink:0, paddingTop:2 }}>{row.label}</Lbl>
                <div style={{ fontSize:11, color:T.text, lineHeight:1.55, flex:1 }}>
                  {row.text}
                </div>
              </div>
            ))}

            {/* Actions */}
            <div style={{ display:"flex", gap:6, marginTop:12,
              paddingTop:10, borderTop:`1px solid ${T.border}` }}>
              <Btn variant="primary" style={{ fontSize:9.5, padding:"4px 10px" }}
                onClick={e => { e.stopPropagation(); onAction("develop", finding.id); }}>
                Develop →
              </Btn>
              <Btn variant="ghost" style={{ fontSize:9.5, padding:"4px 10px" }}
                onClick={e => { e.stopPropagation(); onAction("task", finding.id); }}>
                Assign Task
              </Btn>
              <Btn variant="ghost" style={{ fontSize:9.5, padding:"4px 10px" }}
                onClick={e => { e.stopPropagation(); onAction("monitor", finding.id); }}>
                Monitor
              </Btn>
              <Btn variant="danger" style={{ fontSize:9.5, padding:"4px 10px" }}
                onClick={e => { e.stopPropagation(); onAction("ignore", finding.id); }}>
                Ignore
              </Btn>
              <div style={{ flex:1 }} />
              <Btn variant="subtle" style={{ fontSize:9.5, padding:"4px 10px" }}
                onClick={e => e.stopPropagation()}>
                → Full details (Module 4)
              </Btn>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function FindingsTable({ findings, onAction, showChannel = false }) {
  const [expanded, setExpanded] = useState(null);
  const sorted = [...findings].sort((a, b) => b.pri - a.pri);
  if (!sorted.length) return (
    <div style={{ padding:"28px 16px", textAlign:"center",
      color:T.sub, fontSize:11 }}>
      No findings recorded for this category yet.
    </div>
  );
  const cols = showChannel
    ? ["","Ch.","Finding","Source","Status","Priority",""]
    : ["","Finding","Source","Status","Priority",""];
  return (
    <div style={{ borderRadius:7, border:`1px solid ${T.border}`, overflow:"hidden" }}>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr>{cols.map((h,i) => <th key={i} style={thS}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {sorted.map(f => (
            <FindingRow key={f.id} finding={f}
              expanded={expanded === f.id}
              onToggle={() => setExpanded(expanded === f.id ? null : f.id)}
              onAction={onAction}
              showChannel={showChannel} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── AUTO CATEGORY ─────────────────────────────────────────────────────────────
function AutoCategory({ findings, onAction }) {
  const [scanning, setScanning] = useState(false);
  const [lastScan] = useState("18 days ago");
  const runScan = () => {
    setScanning(true);
    setTimeout(() => setScanning(false), 1800);
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
        background:T.raised, borderRadius:6, border:`1px solid ${T.border}` }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, color:T.text, fontWeight:500 }}>Automated scan</div>
          <div style={{ fontSize:9.5, color:T.sub, marginTop:2 }}>
            Last run: {lastScan}
          </div>
        </div>
        <Btn variant="ghost" onClick={runScan} disabled={scanning}
          style={{ fontSize:9.5, padding:"4px 11px" }}>
          {scanning ? "Scanning…" : "Re-scan"}
        </Btn>
      </div>
      {scanning ? (
        <div style={{ padding:"20px 0", display:"flex",
          flexDirection:"column", gap:5 }}>
          {["Running checks…", "Comparing benchmarks…", "Scoring findings…"].map((s,i) => (
            <div key={i} style={{ fontSize:10, color:T.sub,
              display:"flex", gap:8, alignItems:"center" }}>
              <span style={{ color:T.accent }}>◎</span> {s}
            </div>
          ))}
        </div>
      ) : (
        <FindingsTable
          findings={findings.filter(f => f.cat === "auto")}
          onAction={onAction} />
      )}
    </div>
  );
}

// ── MANUAL CATEGORY ───────────────────────────────────────────────────────────
function ManualCategory({ channelId, findings, onAction }) {
  const fields = MANUAL_FIELDS[channelId] || [];
  const [vals, setVals] = useState({});
  const set = (k, v) => setVals(p => ({ ...p, [k]:v }));
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {/* Input form */}
      <div style={{ padding:"14px 16px", background:T.raised,
        borderRadius:7, border:`1px solid ${T.border}` }}>
        <div style={{ marginBottom:12 }}><Lbl>Structured Assessment</Lbl></div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {fields.map(f => (
            <div key={f.id} style={{ display:"flex", flexDirection:"column", gap:4,
              gridColumn: f.type === "textarea" ? "span 2" : "span 1" }}>
              <Lbl>{f.label}</Lbl>
              {f.type === "select" ? (
                <select value={vals[f.id]||""}
                  onChange={e => set(f.id, e.target.value)}
                  style={{ ...INP, fontSize:10.5 }}>
                  <option value="">Select…</option>
                  {f.opts.map(o => <option key={o}>{o}</option>)}
                </select>
              ) : f.type === "textarea" ? (
                <textarea rows={3} value={vals[f.id]||""}
                  onChange={e => set(f.id, e.target.value)}
                  placeholder={f.ph}
                  style={{ ...INP, resize:"vertical", fontSize:10.5 }} />
              ) : (
                <input type="number" value={vals[f.id]||""}
                  onChange={e => set(f.id, e.target.value)}
                  placeholder={f.ph}
                  style={{ ...INP, fontSize:10.5 }} />
              )}
            </div>
          ))}
        </div>
        <div style={{ marginTop:12, display:"flex", gap:8 }}>
          <Btn variant="primary" style={{ fontSize:9.5, padding:"4px 11px" }}>
            Save Assessment
          </Btn>
          <Btn variant="subtle" style={{ fontSize:9.5, padding:"4px 11px" }}>
            Generate Findings from Input
          </Btn>
        </div>
      </div>

      {/* Manual findings */}
      {findings.filter(f => f.cat === "manual").length > 0 && (
        <FindingsTable
          findings={findings.filter(f => f.cat === "manual")}
          onAction={onAction} />
      )}
    </div>
  );
}

// ── DATA DUMP CATEGORY ────────────────────────────────────────────────────────
function DataDumpCategory({ channelId, findings, onAction, onAddFindings }) {
  const [dump,       setDump]       = useState("");
  const [processing, setProcessing] = useState(false);
  const [results,    setResults]    = useState([]);
  const [accepted,   setAccepted]   = useState(new Set());

  const stages = ["Reading input…","Extracting signals…","Structuring findings…","Scoring priority…"];
  const [stage, setStage] = useState(0);

  const process = () => {
    if (!dump.trim()) return;
    setProcessing(true);
    setResults([]);
    setStage(0);
    let s = 0;
    const iv = setInterval(() => {
      s++;
      setStage(s);
      if (s >= stages.length - 1) {
        clearInterval(iv);
        setTimeout(() => {
          setProcessing(false);
          setResults(DUMP_AI_OUTPUT.default);
        }, 500);
      }
    }, 500);
  };

  const accept = (i) => setAccepted(p => new Set([...p, i]));
  const dismiss = (i) => setAccepted(p => { const n = new Set(p); n.delete(i); return n; });

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* Input area */}
      <div style={{ padding:"14px 16px", background:T.raised,
        borderRadius:7, border:`1px solid ${T.border}` }}>
        <div style={{ marginBottom:8 }}>
          <Lbl>Data Dump</Lbl>
          <span style={{ fontSize:9.5, color:T.sub, marginLeft:8 }}>
            Paste any unstructured research — competitor notes, call transcripts, reports, raw data
          </span>
        </div>
        <textarea
          rows={7}
          value={dump}
          onChange={e => setDump(e.target.value)}
          placeholder="Paste competitor analysis, client call notes, market research, raw audit data, observations…"
          style={{ ...INP, resize:"vertical", fontSize:11, lineHeight:1.55 }}
        />
        <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:8 }}>
          <Btn variant="primary" onClick={process}
            disabled={!dump.trim() || processing}
            style={{ fontSize:9.5, padding:"4px 11px" }}>
            {processing ? "Processing…" : "Process with AI →"}
          </Btn>
          {dump.trim() && !processing && (
            <span style={{ fontSize:9, color:T.sub }}>
              {dump.split(/\s+/).filter(Boolean).length} words
            </span>
          )}
        </div>
      </div>

      {/* Processing state */}
      {processing && (
        <div style={{ display:"flex", flexDirection:"column", gap:5, padding:"8px 0" }}>
          {stages.map((s, i) => (
            <div key={i} style={{ fontSize:10, display:"flex", gap:8, alignItems:"center",
              color: i <= stage ? T.text : T.sub }}>
              <span style={{ color: i <= stage ? T.accent : T.mute }}>
                {i < stage ? "✓" : i === stage ? "◎" : "○"}
              </span>
              {s}
            </div>
          ))}
        </div>
      )}

      {/* AI-generated findings */}
      {results.length > 0 && (
        <div>
          <div style={{ marginBottom:10, display:"flex", alignItems:"center", gap:8 }}>
            <Lbl>Generated Findings</Lbl>
            <span style={{ fontSize:9.5, color:T.sub }}>
              {results.length} findings extracted — review and accept
            </span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
            {results.map((r, i) => {
              const isAccepted = accepted.has(i);
              return (
                <div key={i} style={{ padding:"12px 14px", borderRadius:7,
                  border:`1px solid ${isAccepted ? T.accent + "40" : T.border}`,
                  background: isAccepted ? `${T.accent}08` : T.raised }}>
                  <div style={{ display:"flex", alignItems:"flex-start",
                    gap:8, marginBottom:6 }}>
                    <Dot color={sevColor(r.sev)} size={6} style={{ marginTop:4 }} />
                    <div style={{ flex:1, fontSize:11, fontWeight:600,
                      color:T.text }}>{r.title}</div>
                    <span style={{ fontSize:9, color:sevColor(r.sev),
                      fontWeight:600, whiteSpace:"nowrap" }}>
                      {sevLabel(r.sev)}
                    </span>
                  </div>
                  <div style={{ fontSize:10.5, color:T.text, lineHeight:1.5,
                    marginBottom:4, marginLeft:14 }}>
                    {r.insight}
                  </div>
                  <div style={{ fontSize:10, color:T.sub, lineHeight:1.4,
                    marginBottom:8, marginLeft:14 }}>
                    → {r.recommendation}
                  </div>
                  <div style={{ display:"flex", gap:6, marginLeft:14 }}>
                    {!isAccepted ? (
                      <Btn variant="primary" onClick={() => accept(i)}
                        style={{ fontSize:9.5, padding:"3px 10px" }}>
                        Add to Findings
                      </Btn>
                    ) : (
                      <span style={{ fontSize:9.5, color:T.green, fontWeight:600 }}>
                        ✓ Added
                      </span>
                    )}
                    {!isAccepted && (
                      <Btn variant="subtle" onClick={() => dismiss(i)}
                        style={{ fontSize:9.5, padding:"3px 10px" }}>
                        Dismiss
                      </Btn>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Existing dump findings */}
      {findings.filter(f => f.cat === "dump").length > 0 && (
        <>
          <Hr />
          <FindingsTable
            findings={findings.filter(f => f.cat === "dump")}
            onAction={onAction} />
        </>
      )}
    </div>
  );
}

// ── CHANNEL DETAIL ────────────────────────────────────────────────────────────
const CATS = [
  { id:"auto",   label:"Auto-scan" },
  { id:"manual", label:"Manual Input" },
  { id:"dump",   label:"Data Dump" },
  { id:"admin",  label:"Admin" },
];

function ChannelDetail({ clientId, ch, onBack, onAction }) {
  const [cat, setCat] = useState("auto");
  const findings = channelFindings(clientId, ch.id);
  const scores = { aeo:68,seo:74,meo:80,ai:58,reviews:85,social:62,
                   website:55,pr:45,community:40,marketplace:39,influencer:50 };
  const score = scores[ch.id] || 0;
  const crit  = findings.filter(f => f.sev === "critical").length;
  const high  = findings.filter(f => f.sev === "high").length;

  // Disable "auto" tab for manual-only channels
  const hasAuto = ch.types.includes("Auto");

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

      {/* Sub-header */}
      <div style={{ padding:"12px 20px", borderBottom:`1px solid ${T.border}`,
        flexShrink:0, background:T.surface }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
          <button onClick={onBack}
            style={{ fontSize:10, color:T.sub, background:"transparent",
              border:"none", cursor:"pointer", fontFamily:"'Sora'",
              display:"flex", alignItems:"center", gap:4 }}>
            ← Channels
          </button>
          <span style={{ color:T.mute }}>·</span>
          <span style={{ fontSize:13, fontWeight:600, color:T.text }}>{ch.label}</span>
          <div style={{ flex:1 }} />
          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:16, fontWeight:700, color:scoreColor(score) }}>{score}</div>
              <div style={{ fontSize:8, color:T.sub }}>Score</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:16, fontWeight:700, color:T.text }}>{findings.length}</div>
              <div style={{ fontSize:8, color:T.sub }}>Findings</div>
            </div>
            {crit > 0 && (
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:16, fontWeight:700, color:T.red }}>{crit}</div>
                <div style={{ fontSize:8, color:T.sub }}>Critical</div>
              </div>
            )}
            {high > 0 && (
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:16, fontWeight:700, color:T.amber }}>{high}</div>
                <div style={{ fontSize:8, color:T.sub }}>High</div>
              </div>
            )}
          </div>
          <Btn variant="ghost" style={{ fontSize:9.5, padding:"4px 11px" }}>
            + Add Finding
          </Btn>
        </div>

        {/* Category tabs */}
        <div style={{ display:"flex", gap:2 }}>
          {CATS.map(c => {
            const isAuto  = c.id === "auto";
            const inactive = isAuto && !hasAuto;
            return (
              <button key={c.id}
                onClick={() => !inactive && setCat(c.id)}
                style={{ padding:"6px 13px", background:"transparent", border:"none",
                  borderBottom:`2px solid ${cat === c.id ? T.accent : "transparent"}`,
                  color: inactive ? T.mute : cat === c.id ? T.accent : T.sub,
                  fontSize:10.5, fontWeight:500, fontFamily:"'Sora'",
                  cursor: inactive ? "not-allowed" : "pointer",
                  transition:"all 0.12s" }}>
                {c.label}
                {c.id === "admin" && (
                  <span style={{ fontSize:8, color:T.mute, marginLeft:4 }}>—</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
        {cat === "auto"   && <AutoCategory   findings={findings} onAction={onAction} />}
        {cat === "manual" && <ManualCategory channelId={ch.id} findings={findings} onAction={onAction} />}
        {cat === "dump"   && <DataDumpCategory channelId={ch.id} findings={findings} onAction={onAction} />}
        {cat === "admin"  && (
          <div style={{ padding:"32px 0", textAlign:"center",
            color:T.sub, fontSize:11 }}>
            <div style={{ fontSize:22, color:T.mute, marginBottom:10 }}>◎</div>
            Custom admin categories can be defined here.
            <div style={{ fontSize:9.5, color:T.label, marginTop:6 }}>
              Available to administrators — add new audit dimensions for this channel.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CLIENT CARD ───────────────────────────────────────────────────────────────
function ClientCard({ client, selected, onClick }) {
  const findings = clientFindings(client.id);
  const crit     = findings.filter(f => f.sev === "critical").length;
  return (
    <div onClick={onClick}
      style={{ padding:"11px 12px", borderRadius:6, cursor:"pointer", marginBottom:3,
        background:selected ? T.raised : "transparent",
        border:`1px solid ${selected ? T.borderMid : "transparent"}`,
        transition:"all 0.12s" }}
      onMouseOver={e => { if (!selected) e.currentTarget.style.background = T.hover; }}
      onMouseOut={e  => { if (!selected) e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"center", marginBottom:3 }}>
        <span style={{ fontSize:12, fontWeight:500, color:T.text,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
          {client.name}
        </span>
        <span style={{ fontSize:11, fontWeight:600,
          color:scoreColor(client.faavi), marginLeft:8 }}>
          {client.faavi}
        </span>
      </div>
      <div style={{ fontSize:9.5, color:T.sub, marginBottom:6 }}>{client.website}</div>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
        <Dot color={phaseColor(client.phase)} />
        <span style={{ fontSize:9.5, color:T.sub }}>{phaseLabel(client.phase)}</span>
        {crit > 0 && <>
          <span style={{ color:T.mute }}>·</span>
          <span style={{ fontSize:9.5, color:T.red }}>{crit} critical</span>
        </>}
        {findings.length === 0 && <>
          <span style={{ color:T.mute }}>·</span>
          <span style={{ fontSize:9.5, color:T.label }}>No audit</span>
        </>}
      </div>
      <div style={{ height:2, background:T.mute, borderRadius:1 }}>
        <div style={{ height:2, borderRadius:1,
          background:scoreColor(client.faavi),
          width:`${client.faavi}%`, transition:"width 0.4s" }} />
      </div>
    </div>
  );
}

// ── AUDIT CENTRE ROOT ─────────────────────────────────────────────────────────
export default function AuditCentre() {
  const [selectedClient, setClient]  = useState("fb");
  const [selectedChannel, setChannel] = useState(null);
  const [toast, setToast]             = useState(null);
  const [localFindings, setLocalFindings] = useState({});

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const client   = CLIENTS.find(c => c.id === selectedClient);
  const channel  = CHANNELS.find(c => c.id === selectedChannel);
  const findings = clientFindings(selectedClient);

  const handleAction = (action, findingId) => {
    const labels = { develop:"Sent to Recommendations Hub", task:"Assigned as task",
                     monitor:"Set to monitor", ignore:"Ignored" };
    showToast(labels[action] || action);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%",
      background:T.bg, fontFamily:"'Sora',sans-serif", color:T.text, overflow:"hidden" }}>

      {toast && (
        <div style={{ position:"fixed", bottom:20, right:20, zIndex:9999,
          padding:"9px 14px", background:T.raised, border:`1px solid ${T.borderMid}`,
          borderRadius:6, fontSize:11, color:T.text }}>
          {toast}
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ padding:"14px 20px 12px", borderBottom:`1px solid ${T.border}`,
        flexShrink:0, background:T.surface }}>
        <div style={{ display:"flex", alignItems:"center" }}>
          <div>
            <h1 style={{ fontFamily:"'Newsreader',serif", fontSize:18, fontWeight:600,
              color:T.text, margin:0, fontStyle:"italic" }}>Audit Centre</h1>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:2 }}>
              <Lbl>Module 2 · Master Diagnostic Workspace</Lbl>
            </div>
          </div>
          <div style={{ flex:1 }} />
          <div style={{ display:"flex", gap:16, marginRight:16 }}>
            {[
              { l:"Total findings", v:findings.length },
              { l:"Critical",       v:findings.filter(f=>f.sev==="critical").length, c:T.red   },
              { l:"Open",           v:findings.filter(f=>f.status==="open").length,  c:T.text  },
              { l:"In develop",     v:findings.filter(f=>f.status==="develop").length,c:T.accent},
            ].map(s => (
              <div key={s.l} style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                <span style={{ fontSize:18, fontWeight:600,
                  color:s.c||T.sub, lineHeight:1 }}>{s.v}</span>
                <span style={{ fontSize:9, color:T.label }}>{s.l}</span>
              </div>
            ))}
          </div>
          <Btn variant="primary">New Audit</Btn>
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ display:"flex", flex:1, minHeight:0 }}>

        {/* Left — client list */}
        <div style={{ width:260, flexShrink:0, borderRight:`1px solid ${T.border}`,
          overflowY:"auto", padding:"10px 8px" }}>
          {CLIENTS.map(c => (
            <ClientCard key={c.id} client={c}
              selected={selectedClient === c.id}
              onClick={() => { setClient(c.id); setChannel(null); }} />
          ))}
        </div>

        {/* Right — audit workspace */}
        <div style={{ flex:1, minWidth:0, overflow:"hidden",
          display:"flex", flexDirection:"column" }}>

          {!selectedChannel ? (
            // ── CHANNEL GRID ──
            <div style={{ flex:1, overflowY:"auto", padding:"18px 20px" }}>

              {/* Client header */}
              {client && (
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                  <Av init={client.init} size={28} />
                  <div>
                    <div style={{ fontSize:14, fontWeight:600, color:T.text }}>
                      {client.name}
                    </div>
                    <div style={{ fontSize:9.5, color:T.sub }}>
                      {findings.length} total findings across {
                        CHANNELS.filter(ch => channelFindings(selectedClient, ch.id).length > 0).length
                      } channels · Last audit {client.auditAge} days ago
                    </div>
                  </div>
                  <div style={{ flex:1 }} />
                  <div style={{ display:"flex", gap:6 }}>
                    <Btn variant="ghost" style={{ fontSize:9.5, padding:"4px 11px" }}>
                      Export Audit
                    </Btn>
                    <Btn variant="primary" style={{ fontSize:9.5, padding:"4px 11px" }}
                      onClick={() => showToast("Full re-scan initiated across all channels")}>
                      Full Re-scan
                    </Btn>
                  </div>
                </div>
              )}

              {/* All findings summary */}
              {findings.length > 0 && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ marginBottom:10 }}>
                    <Lbl>All Findings — Sorted by Priority</Lbl>
                  </div>
                  <FindingsTable
                    findings={findings}
                    onAction={handleAction}
                    showChannel={true} />
                </div>
              )}

              {/* Channel grid */}
              <div style={{ marginBottom:10 }}>
                <Lbl>Channels — Click to Audit</Lbl>
              </div>
              <div style={{ display:"grid",
                gridTemplateColumns:"repeat(3, 1fr)", gap:10 }}>
                {CHANNELS.map(ch => (
                  <ChannelCard key={ch.id} ch={ch}
                    findings={channelFindings(selectedClient, ch.id)}
                    onClick={() => setChannel(ch.id)} />
                ))}
              </div>
            </div>
          ) : (
            // ── CHANNEL DETAIL ──
            channel && (
              <ChannelDetail
                clientId={selectedClient}
                ch={channel}
                onBack={() => setChannel(null)}
                onAction={handleAction} />
            )
          )}
        </div>
      </div>

    </div>
  );
}
