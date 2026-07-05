/**
 * 5th Avenue — Internal OS
 * Module 6: Project Workspace + Tasks
 * ─────────────────────────────────────────────────────────────────
 * Task-first. Projects are a grouping layer.
 * Views: Kanban · List · Calendar
 * SLA: type-based windows × client importance modifier
 * Management: configurable importance per client / task type / campaign / custom
 */

import { useState, useMemo } from "react";

// ── TOKENS ────────────────────────────────────────────────────────────────────
import { T } from "../../theme/tokens";

// ── SLA BASE CONFIGURATION ────────────────────────────────────────────────────
const DEFAULT_SLA = {
  taskTypes:{
    deliverable:{ days:5,  label:"Client Deliverable"  },
    content:    { days:7,  label:"Content Production"  },
    technical:  { days:3,  label:"Technical"           },
    audit:      { days:5,  label:"Audit / Research"    },
    reporting:  { days:2,  label:"Reporting"           },
    internal:   { days:10, label:"Internal"            },
  },
  // Importance: 1=Normal, 2=Important, 3=Critical
  // Effective SLA days = base / sqrt(importance) — higher importance = tighter window
  clientImportance:{
    fb:2, nb:2, ch:1, df:3, tg:1,
  },
  campaignFlags:[
    { id:"cf1", name:"FreshBite Q3 AEO Sprint", clientId:"fb", importance:3 },
  ],
  customVars:[
    { id:"cv1", key:"Meeting Prep",      value:"0.5", desc:"Tasks needed before client meeting halve their effective SLA" },
    { id:"cv2", key:"Upsell Opportunity",value:"0.7", desc:"Tasks supporting upsell conversation get 30% tighter window" },
  ],
};

// ── SEED DATA ─────────────────────────────────────────────────────────────────
const CLIENTS_META = {
  fb:{ name:"FreshBite Foods",  short:"FreshBite"  },
  nb:{ name:"NutriBlend India", short:"NutriBlend" },
  ch:{ name:"CraftHome Decor",  short:"CraftHome"  },
  df:{ name:"DermFirst",        short:"DermFirst"  },
  tg:{ name:"TerraGrow",        short:"TerraGrow"  },
};

const PROJECTS = [
  { id:"p1", cid:"fb", ch:"aeo", name:"FAQ Schema Implementation",  status:"active",   owner:"t4", end:"5 Jun",  progress:40, taskCount:4  },
  { id:"p2", cid:"fb", ch:"ai",  name:"AI Citation Campaign",       status:"planning", owner:"t6", end:"30 Jun", progress:0,  taskCount:3  },
  { id:"p3", cid:"fb", ch:"seo", name:"Core Web Vitals Fix",        status:"active",   owner:"t5", end:"10 Jun", progress:65, taskCount:3  },
  { id:"p4", cid:"nb", ch:"ai",  name:"AI Visibility Strategy",     status:"planning", owner:"t1", end:"30 Jun", progress:0,  taskCount:2  },
  { id:"p5", cid:"nb", ch:"seo", name:"Backlink Programme",         status:"active",   owner:"t3", end:"31 Jul", progress:20, taskCount:3  },
  { id:"p6", cid:"ch", ch:"meo", name:"GBP Claim & Optimisation",   status:"active",   owner:"t2", end:"7 Jun",  progress:10, taskCount:4  },
  { id:"p7", cid:"df", ch:"seo", name:"Content Programme",          status:"active",   owner:"t3", end:"30 Nov", progress:5,  taskCount:3  },
  { id:"p8", cid:"df", ch:"ai",  name:"Perplexity Citation Build",  status:"planning", owner:"t4", end:"10 Aug", progress:0,  taskCount:1  },
];

const TEAM = [
  { id:"t1", name:"Priya Nair",  init:"PN" },
  { id:"t2", name:"Vikram Das",  init:"VD" },
  { id:"t3", name:"Arjun Reddy", init:"AR" },
  { id:"t4", name:"Sneha Iyer",  init:"SI" },
  { id:"t5", name:"Meera Joshi", init:"MJ" },
  { id:"t6", name:"Karan Shah",  init:"KS" },
];

// daysUntil: negative = overdue, 0 = today, positive = days remaining
const TASKS_SEED = [
  { id:"t001",pid:"p1",cid:"fb",ch:"aeo",type:"technical",  title:"Implement FAQ schema — millet snacks page",              status:"in_progress",priority:"p1",owner:"t4",dueDate:"29 May",daysUntil:-1 },
  { id:"t002",pid:"p1",cid:"fb",ch:"aeo",type:"technical",  title:"Implement FAQ schema — protein bars page",               status:"todo",       priority:"p1",owner:"t4",dueDate:"30 May",daysUntil:0  },
  { id:"t003",pid:"p1",cid:"fb",ch:"aeo",type:"technical",  title:"Add product schema to roasted seeds page",               status:"todo",       priority:"p2",owner:"t4",dueDate:"2 Jun", daysUntil:4  },
  { id:"t004",pid:"p1",cid:"fb",ch:"aeo",type:"technical",  title:"QA schema in Rich Results Test — all 5 pages",           status:"todo",       priority:"p2",owner:"t4",dueDate:"5 Jun", daysUntil:7  },
  { id:"t005",pid:"p3",cid:"fb",ch:"seo",type:"technical",  title:"Optimise hero images to WebP — homepage + PDPs",         status:"in_progress",priority:"p1",owner:"t5",dueDate:"27 May",daysUntil:-2 },
  { id:"t006",pid:"p3",cid:"fb",ch:"seo",type:"technical",  title:"Reduce JS bundle — defer non-critical scripts",          status:"todo",       priority:"p1",owner:"t5",dueDate:"29 May",daysUntil:0  },
  { id:"t007",pid:"p3",cid:"fb",ch:"seo",type:"technical",  title:"Fix CLS on product page carousel — shift 0.22",          status:"todo",       priority:"p2",owner:"t5",dueDate:"3 Jun", daysUntil:6  },
  { id:"t008",pid:"p5",cid:"nb",ch:"seo",type:"audit",      title:"Identify 20 target domains for outreach",                status:"in_progress",priority:"p1",owner:"t3",dueDate:"25 May",daysUntil:-4 },
  { id:"t009",pid:"p5",cid:"nb",ch:"seo",type:"deliverable","title":"Draft outreach emails — 20 contacts",                   status:"todo",       priority:"p2",owner:"t3",dueDate:"5 Jun", daysUntil:7  },
  { id:"t010",pid:"p5",cid:"nb",ch:"seo",type:"deliverable","title":"Submit 5 guest post pitches to fitness publications",   status:"todo",       priority:"p2",owner:"t6",dueDate:"10 Jun",daysUntil:12 },
  { id:"t011",pid:"p4",cid:"nb",ch:"ai", type:"content",    title:"Brief: protein comparison article for AI citation",      status:"todo",       priority:"p1",owner:"t1",dueDate:"3 Jun", daysUntil:5  },
  { id:"t012",pid:"p4",cid:"nb",ch:"ai", type:"content",    title:"Produce brand entity definition page",                   status:"todo",       priority:"p2",owner:"t6",dueDate:"7 Jun", daysUntil:9  },
  { id:"t013",pid:"p6",cid:"ch",ch:"meo",type:"technical",  title:"Submit GBP claim — Bengaluru showroom",                  status:"todo",       priority:"p1",owner:"t2",dueDate:"28 May",daysUntil:-1 },
  { id:"t014",pid:"p6",cid:"ch",ch:"meo",type:"deliverable","title":"Capture 20 showroom photos for GBP listing",            status:"todo",       priority:"p1",owner:"t2",dueDate:"1 Jun", daysUntil:3  },
  { id:"t015",pid:"p6",cid:"ch",ch:"meo",type:"deliverable","title":"Write GBP business description — 750 char",             status:"todo",       priority:"p2",owner:"t2",dueDate:"1 Jun", daysUntil:3  },
  { id:"t016",pid:"p6",cid:"ch",ch:"meo",type:"deliverable","title":"Seed 10 Q&A entries on GBP listing",                    status:"todo",       priority:"p3",owner:"t2",dueDate:"5 Jun", daysUntil:7  },
  { id:"t017",pid:"p7",cid:"df",ch:"seo",type:"content",    title:"Brief: 'best retinol for beginners India' pillar page",  status:"in_progress",priority:"p1",owner:"t3",dueDate:"28 May",daysUntil:-1 },
  { id:"t018",pid:"p7",cid:"df",ch:"seo",type:"content",    title:"Brief: niacinamide vs vitamin C comparison",             status:"todo",       priority:"p2",owner:"t6",dueDate:"4 Jun", daysUntil:6  },
  { id:"t019",pid:"p7",cid:"df",ch:"seo",type:"audit",      title:"Identify top 10 Minimalist keyword gaps",                status:"done",       priority:"p2",owner:"t3",dueDate:"20 May",daysUntil:-9 },
  { id:"t020",pid:"p8",cid:"df",ch:"ai", type:"content",    title:"Produce 'retinol complete guide' — citation-optimised",  status:"todo",       priority:"p1",owner:"t6",dueDate:"15 Jun",daysUntil:17 },
  { id:"t021",pid:"p2",cid:"fb",ch:"ai", type:"content",    title:"Brief: Perplexity first-strike article",                 status:"todo",       priority:"p1",owner:"t6",dueDate:"4 Jun", daysUntil:6  },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
const getTeam    = id => TEAM.find(t => t.id === id);
const getProject = id => PROJECTS.find(p => p.id === id);
const priColor   = p  => ({ p1:T.red, p2:T.amber, p3:T.accent, p4:T.label })[p] || T.sub;
const priLabel   = p  => ({ p1:"P1", p2:"P2", p3:"P3", p4:"P4" })[p] || p;
const chLabel    = c  => ({ aeo:"AEO", seo:"SEO", meo:"Maps", ai:"AI", reviews:"Reviews", social:"Social" })[c] || c?.toUpperCase();
const chColor    = c  => ({ aeo:T.accent, seo:T.green, meo:T.amber, ai:T.purple, reviews:"#C47ABF" })[c] || T.sub;
const statusColor= s  => ({ todo:T.sub, in_progress:T.accent, review:T.amber, done:T.green, blocked:T.red })[s] || T.sub;
const statusLabel= s  => ({ todo:"To Do", in_progress:"In Progress", review:"Review", done:"Done", blocked:"Blocked" })[s] || s;

const calcSLA = (task, cfg) => {
  if (task.status === "done") return { status:"done", label:"Done" };
  const base       = cfg.taskTypes[task.type]?.days || 5;
  const importance = cfg.clientImportance[task.cid] || 1;
  const effective  = Math.max(1, Math.ceil(base / Math.sqrt(importance)));
  const du         = task.daysUntil;
  if (du < 0)              return { status:"breached", label:`${Math.abs(du)}d late`,  color:T.red   };
  if (du === 0)            return { status:"breached", label:"Due today",              color:T.red   };
  if (du <= effective*0.4) return { status:"at_risk",  label:`${du}d — at risk`,       color:T.amber };
  return                          { status:"on_track",  label:`${du}d remaining`,      color:T.sub   };
};

// ── ATOMS ─────────────────────────────────────────────────────────────────────
const Av  = ({ init, size=22 }) =>
  <div style={{ width:size, height:size, borderRadius:4, flexShrink:0, background:T.mute,
    display:"flex", alignItems:"center", justifyContent:"center",
    fontSize:Math.max(7, size*0.38), fontWeight:600, color:T.sub }}>{init}</div>;
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
    primary:{ background:T.accent, color:"#07080D", fontWeight:600 },
    ghost:  { background:T.hover,  color:T.sub, border:`1px solid ${T.border}` },
    subtle: { background:"transparent", color:T.label, border:`1px solid ${T.border}` },
  };
  return <button onClick={onClick} disabled={disabled}
    style={{...b,...(v[variant]||v.ghost),...style}}>{children}</button>;
}

// ── SLA BADGE ─────────────────────────────────────────────────────────────────
function SLABadge({ task, cfg }) {
  const sla = calcSLA(task, cfg);
  if (sla.status === "done") return null;
  return (
    <span style={{ fontSize:8.5, fontWeight:600, color:sla.color,
      padding:"1px 6px", borderRadius:3,
      background:`${sla.color}12`,
      border:`1px solid ${sla.color}20`,
      whiteSpace:"nowrap" }}>
      {sla.label}
    </span>
  );
}

// ── TASK DETAIL MODAL ─────────────────────────────────────────────────────────
function TaskModal({ task, cfg, onClose, onStatusChange }) {
  const owner = getTeam(task.owner);
  const proj  = getProject(task.pid);
  const sla   = calcSLA(task, cfg);
  const STATUSES = ["todo","in_progress","review","done","blocked"];
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)",
      zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width:480, background:T.surface, borderRadius:10,
        border:`1px solid ${T.borderMid}`, overflow:"hidden" }}>
        {/* Header */}
        <div style={{ padding:"14px 18px", borderBottom:`1px solid ${T.border}`,
          display:"flex", alignItems:"flex-start", gap:10 }}>
          <div style={{ width:3, height:"100%", minHeight:24, borderRadius:2,
            background:priColor(task.priority), flexShrink:0, alignSelf:"stretch" }} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:600, color:T.text,
              lineHeight:1.35, marginBottom:4 }}>{task.title}</div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:9, color:chColor(task.ch),
                fontWeight:700, textTransform:"uppercase" }}>{chLabel(task.ch)}</span>
              <span style={{ fontSize:9, color:T.sub }}>·</span>
              <span style={{ fontSize:9, color:T.sub }}>{proj?.name}</span>
              <span style={{ fontSize:9, color:T.sub }}>·</span>
              <span style={{ fontSize:9, color:T.sub }}>{CLIENTS_META[task.cid]?.short}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"transparent", border:"none",
            color:T.sub, fontSize:14, cursor:"pointer" }}>✕</button>
        </div>
        {/* Body */}
        <div style={{ padding:"16px 18px", display:"flex", flexDirection:"column", gap:14 }}>
          {/* Status selector */}
          <div>
            <Lbl style={{ display:"block", marginBottom:8 }}>Status</Lbl>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
              {STATUSES.map(s => (
                <button key={s} onClick={() => onStatusChange(task.id, s)} style={{
                  padding:"4px 10px", borderRadius:4, fontSize:10, fontWeight:500,
                  fontFamily:"'Sora'", cursor:"pointer", border:"none",
                  background: task.status === s ? `${statusColor(s)}20` : T.raised,
                  color: task.status === s ? statusColor(s) : T.sub,
                  border: `1px solid ${task.status === s ? statusColor(s)+"40" : T.border}` }}>
                  {statusLabel(s)}
                </button>
              ))}
            </div>
          </div>
          <Hr />
          {/* Meta */}
          {[
            ["Owner",   owner ? owner.name : "—"                   ],
            ["Due",     task.dueDate                                ],
            ["Type",    cfg.taskTypes[task.type]?.label || task.type],
            ["Priority",priLabel(task.priority)                     ],
            ["Project", proj?.name || "—"                          ],
          ].map(([k, v]) => (
            <div key={k} style={{ display:"flex", gap:12, alignItems:"baseline" }}>
              <Lbl style={{ width:72, flexShrink:0 }}>{k}</Lbl>
              <span style={{ fontSize:11, color:T.text }}>{v}</span>
            </div>
          ))}
          <Hr />
          {/* SLA */}
          <div style={{ display:"flex", gap:12, alignItems:"center" }}>
            <Lbl style={{ width:72 }}>SLA</Lbl>
            <SLABadge task={task} cfg={cfg} />
            <span style={{ fontSize:9.5, color:T.sub }}>
              Base {cfg.taskTypes[task.type]?.days || 5}d ·
              Client importance ×{cfg.clientImportance[task.cid]||1}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── KANBAN VIEW ───────────────────────────────────────────────────────────────
const KANBAN_COLS = [
  { id:"todo",        label:"To Do"      },
  { id:"in_progress", label:"In Progress"},
  { id:"review",      label:"Review"     },
  { id:"done",        label:"Done"       },
];

function KanbanCard({ task, cfg, onClick }) {
  const owner = getTeam(task.owner);
  const sla   = calcSLA(task, cfg);
  return (
    <div onClick={onClick}
      style={{ padding:"11px 13px", borderRadius:7,
        background:T.raised, border:`1px solid ${T.border}`,
        borderLeft:`3px solid ${priColor(task.priority)}`,
        marginBottom:7, cursor:"pointer", transition:"all 0.12s" }}
      onMouseOver={e => e.currentTarget.style.borderColor = T.borderMid}
      onMouseOut={e  => e.currentTarget.style.borderColor = T.border}
    >
      {/* Channel tag */}
      <div style={{ fontSize:8.5, fontWeight:700, color:chColor(task.ch),
        textTransform:"uppercase", marginBottom:6 }}>
        {chLabel(task.ch)} · {CLIENTS_META[task.cid]?.short}
      </div>
      {/* Title */}
      <div style={{ fontSize:11, color:T.text, fontWeight:500,
        lineHeight:1.4, marginBottom:8 }}>
        {task.title}
      </div>
      {/* Footer: owner + due + SLA */}
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        {owner && <Av init={owner.init} size={18} />}
        <span style={{ fontSize:9, color:T.sub, flex:1 }}>{task.dueDate}</span>
        {sla.status !== "done" && sla.status !== "on_track" && (
          <span style={{ fontSize:8.5, fontWeight:600, color:sla.color }}>
            {sla.label}
          </span>
        )}
      </div>
    </div>
  );
}

function KanbanView({ tasks, cfg, onTaskClick }) {
  return (
    <div style={{ display:"flex", gap:0, height:"100%",
      overflowX:"auto", padding:"18px 20px" }}>
      {KANBAN_COLS.map((col, ci) => {
        const colTasks = tasks.filter(t => t.status === col.id);
        return (
          <div key={col.id} style={{ flex:1, minWidth:220, maxWidth:320,
            marginRight: ci < KANBAN_COLS.length-1 ? 12 : 0,
            display:"flex", flexDirection:"column" }}>
            {/* Column header */}
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
              <span style={{ fontSize:11, fontWeight:600, color:T.text }}>{col.label}</span>
              <span style={{ fontSize:9, color:T.label, padding:"1px 6px",
                background:T.mute, borderRadius:8 }}>{colTasks.length}</span>
            </div>
            {/* Cards */}
            <div style={{ flex:1, overflowY:"auto" }}>
              {colTasks.map(t => (
                <KanbanCard key={t.id} task={t} cfg={cfg}
                  onClick={() => onTaskClick(t)} />
              ))}
              {colTasks.length === 0 && (
                <div style={{ padding:"20px 0", textAlign:"center",
                  color:T.label, fontSize:10 }}>—</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── LIST VIEW ─────────────────────────────────────────────────────────────────
const thS = { fontSize:9, fontWeight:600, color:T.label, textTransform:"uppercase",
  letterSpacing:"0.07em", padding:"7px 12px", whiteSpace:"nowrap",
  borderBottom:`1px solid ${T.border}`, textAlign:"left", background:T.raised };
const tdS = { padding:"9px 12px", borderBottom:`1px solid ${T.border}`,
  fontSize:11, color:T.text, verticalAlign:"middle" };

function ListView({ tasks, cfg, onTaskClick }) {
  const [sortKey,  setSortKey]  = useState("daysUntil");
  const [sortDir,  setSortDir]  = useState("asc");

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [tasks, sortKey, sortDir]);

  const toggleSort = key => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortTh = ({ k, children }) => (
    <th onClick={() => toggleSort(k)}
      style={{ ...thS, cursor:"pointer",
        color: sortKey === k ? T.text : T.label }}>
      {children}{sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );

  return (
    <div style={{ padding:"0 20px 20px", overflowY:"auto", flex:1 }}>
      <div style={{ borderRadius:8, border:`1px solid ${T.border}`,
        overflow:"hidden", marginTop:18 }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              <th style={thS}></th>
              <SortTh k="title">Task</SortTh>
              <SortTh k="cid">Client</SortTh>
              <th style={thS}>Owner</th>
              <SortTh k="dueDate">Due</SortTh>
              <SortTh k="priority">Priority</SortTh>
              <th style={thS}>SLA</th>
              <SortTh k="status">Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => {
              const owner = getTeam(t.owner);
              return (
                <tr key={t.id}
                  onClick={() => onTaskClick(t)}
                  style={{ cursor:"pointer",
                    background: i%2===0 ? "transparent" : T.hover }}
                  onMouseOver={e => e.currentTarget.style.background = T.hover}
                  onMouseOut={e  => e.currentTarget.style.background = i%2===0 ? "transparent" : T.hover}>
                  <td style={{ ...tdS, width:4, padding:"9px 0 9px 12px" }}>
                    <div style={{ width:3, height:16, borderRadius:2,
                      background:priColor(t.priority) }} />
                  </td>
                  <td style={{ ...tdS, maxWidth:280 }}>
                    <div style={{ overflow:"hidden", textOverflow:"ellipsis",
                      whiteSpace:"nowrap" }}>{t.title}</div>
                    <div style={{ fontSize:9, color:T.sub, marginTop:2 }}>
                      {chLabel(t.ch)} · {getProject(t.pid)?.name}
                    </div>
                  </td>
                  <td style={{ ...tdS, color:T.sub, whiteSpace:"nowrap" }}>
                    {CLIENTS_META[t.cid]?.short}
                  </td>
                  <td style={tdS}>
                    {owner && (
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <Av init={owner.init} size={18} />
                        <span style={{ fontSize:9.5, color:T.sub }}>{owner.init}</span>
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdS, color:t.daysUntil < 0 ? T.red : T.text,
                    whiteSpace:"nowrap", fontWeight: t.daysUntil < 0 ? 600 : 400 }}>
                    {t.dueDate}
                  </td>
                  <td style={{ ...tdS, color:priColor(t.priority), fontWeight:600 }}>
                    {priLabel(t.priority)}
                  </td>
                  <td style={tdS}><SLABadge task={t} cfg={cfg} /></td>
                  <td style={{ ...tdS, color:statusColor(t.status), fontWeight:500 }}>
                    {statusLabel(t.status)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── CALENDAR VIEW ─────────────────────────────────────────────────────────────
function CalendarView({ tasks, cfg, onTaskClick }) {
  const [focusDay, setFocusDay] = useState(null);

  // June 2026
  const YEAR = 2026, MONTH = 5;
  const firstDay = new Date(YEAR, MONTH, 1).getDay();
  const daysInMonth = new Date(YEAR, MONTH+1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) * 7 }, (_, i) => {
    const d = i - firstDay + 1;
    return (d >= 1 && d <= daysInMonth) ? d : null;
  });

  // Map tasks to day number (parse "1 Jun", "28 May" etc.)
  const tasksByDay = useMemo(() => {
    const map = {};
    tasks.forEach(t => {
      const parts = t.dueDate?.split(" ");
      if (!parts || parts.length < 2) return;
      const day = parseInt(parts[0]);
      const mon = parts[1];
      if (mon === "Jun" && !isNaN(day)) {
        if (!map[day]) map[day] = [];
        map[day].push(t);
      }
    });
    return map;
  }, [tasks]);

  const focusTasks = focusDay ? (tasksByDay[focusDay] || []) : [];

  return (
    <div style={{ padding:"18px 20px", display:"flex",
      flexDirection:"column", gap:16 }}>
      {/* Month header */}
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ fontSize:13, fontWeight:600, color:T.text }}>June 2026</span>
        {focusDay && (
          <>
            <span style={{ color:T.mute }}>·</span>
            <span style={{ fontSize:11, color:T.sub }}>
              {focusTasks.length} task{focusTasks.length !== 1 ? "s" : ""} on {focusDay} Jun
            </span>
            <button onClick={() => setFocusDay(null)}
              style={{ fontSize:9, color:T.label, background:"transparent",
                border:"none", cursor:"pointer", marginLeft:4 }}>
              Clear
            </button>
          </>
        )}
      </div>

      {/* Day-of-week headers */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:1 }}>
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <div key={d} style={{ padding:"6px 0", textAlign:"center" }}>
            <Lbl>{d}</Lbl>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />;
          const dayTasks = tasksByDay[day] || [];
          const hasBreached = dayTasks.some(t => calcSLA(t, cfg).status === "breached");
          const hasAtRisk   = dayTasks.some(t => calcSLA(t, cfg).status === "at_risk");
          const isFocus     = focusDay === day;
          const isToday     = day === 27; // May 27 reference — June 27 would be future
          return (
            <div key={day}
              onClick={() => dayTasks.length > 0 && setFocusDay(isFocus ? null : day)}
              style={{ minHeight:72, padding:"7px 8px", borderRadius:6,
                border:`1px solid ${isFocus ? T.borderMid : T.border}`,
                background: isFocus ? T.raised : "transparent",
                cursor: dayTasks.length > 0 ? "pointer" : "default",
                transition:"all 0.12s" }}
              onMouseOver={e => { if (dayTasks.length) e.currentTarget.style.background = T.hover; }}
              onMouseOut={e  => { if (!isFocus) e.currentTarget.style.background = "transparent"; }}>
              {/* Day number */}
              <div style={{ fontSize:10.5, fontWeight:500,
                color: isToday ? T.accent : T.text, marginBottom:5 }}>
                {day}
              </div>
              {/* Task pills — max 3 visible */}
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                {dayTasks.slice(0, 3).map(t => (
                  <div key={t.id} style={{ fontSize:8.5, color:T.text,
                    background:`${chColor(t.ch)}18`,
                    borderRadius:2, padding:"1px 4px",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                    borderLeft:`2px solid ${priColor(t.priority)}` }}>
                    {t.title.split(" ").slice(0, 4).join(" ")}…
                  </div>
                ))}
                {dayTasks.length > 3 && (
                  <div style={{ fontSize:8, color:T.label }}>
                    +{dayTasks.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Focus day task list */}
      {focusDay && focusTasks.length > 0 && (
        <div style={{ marginTop:4 }}>
          <div style={{ marginBottom:10 }}>
            <Lbl>{focusDay} June — Tasks</Lbl>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {focusTasks.map(t => {
              const owner = getTeam(t.owner);
              return (
                <div key={t.id} onClick={() => onTaskClick(t)}
                  style={{ padding:"10px 14px", borderRadius:7,
                    background:T.raised, border:`1px solid ${T.border}`,
                    borderLeft:`3px solid ${priColor(t.priority)}`,
                    cursor:"pointer", display:"flex", gap:12,
                    alignItems:"center" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, color:T.text, fontWeight:500,
                      marginBottom:2 }}>{t.title}</div>
                    <div style={{ fontSize:9, color:T.sub }}>
                      {chLabel(t.ch)} · {CLIENTS_META[t.cid]?.short}
                    </div>
                  </div>
                  {owner && <Av init={owner.init} size={20} />}
                  <SLABadge task={t} cfg={cfg} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PROJECT PANEL (left) ──────────────────────────────────────────────────────
function ProjectPanel({ selectedPid, onSelect }) {
  const grouped = useMemo(() => {
    const g = {};
    PROJECTS.forEach(p => {
      if (!g[p.cid]) g[p.cid] = [];
      g[p.cid].push(p);
    });
    return g;
  }, []);

  const statusColor_ = s => ({ active:T.accent, planning:T.amber, done:T.green })[s] || T.sub;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      {/* All tasks option */}
      <div onClick={() => onSelect(null)}
        style={{ padding:"10px 12px", borderRadius:6, cursor:"pointer",
          marginBottom:8,
          background: !selectedPid ? T.raised : "transparent",
          border:`1px solid ${!selectedPid ? T.borderMid : "transparent"}`,
          transition:"all 0.12s" }}
        onMouseOver={e => { if (selectedPid) e.currentTarget.style.background = T.hover; }}
        onMouseOut={e  => { if (selectedPid) e.currentTarget.style.background = "transparent"; }}>
        <div style={{ fontSize:11.5, fontWeight:500, color:T.text }}>All Tasks</div>
        <div style={{ fontSize:9.5, color:T.sub, marginTop:2 }}>
          {TASKS_SEED.filter(t => t.status !== "done").length} active
        </div>
      </div>

      <Hr style={{ marginBottom:10 }} />

      {/* Projects grouped by client */}
      <div style={{ flex:1, overflowY:"auto" }}>
        {Object.entries(grouped).map(([cid, projects]) => (
          <div key={cid} style={{ marginBottom:14 }}>
            <Lbl style={{ display:"block", padding:"2px 4px", marginBottom:5 }}>
              {CLIENTS_META[cid]?.short}
            </Lbl>
            {projects.map(p => (
              <div key={p.id} onClick={() => onSelect(p.id)}
                style={{ padding:"9px 10px", borderRadius:5, cursor:"pointer",
                  marginBottom:3,
                  background: selectedPid === p.id ? T.raised : "transparent",
                  border:`1px solid ${selectedPid === p.id ? T.borderMid : "transparent"}`,
                  transition:"all 0.12s" }}
                onMouseOver={e => { if (selectedPid !== p.id) e.currentTarget.style.background = T.hover; }}
                onMouseOut={e  => { if (selectedPid !== p.id) e.currentTarget.style.background = "transparent"; }}>
                <div style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"center", marginBottom:4 }}>
                  <span style={{ fontSize:10.5, color:T.text, fontWeight:500,
                    overflow:"hidden", textOverflow:"ellipsis",
                    whiteSpace:"nowrap", maxWidth:140 }}>
                    {p.name}
                  </span>
                  <Dot color={statusColor_(p.status)} size={5} />
                </div>
                {/* Progress bar */}
                <div style={{ height:2, background:T.mute, borderRadius:1 }}>
                  <div style={{ height:2, borderRadius:1,
                    width:`${p.progress}%`, background:T.accent,
                    transition:"width 0.4s" }} />
                </div>
                <div style={{ fontSize:8.5, color:T.sub, marginTop:3 }}>
                  {p.taskCount} tasks · {p.progress}% · {p.end}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SLA SETTINGS DRAWER ───────────────────────────────────────────────────────
function SLASettingsDrawer({ cfg, onChange, onClose }) {
  const [local, setLocal] = useState(() => JSON.parse(JSON.stringify(cfg)));
  const IMPORTANCE_OPTS = [1, 2, 3];
  const IMPORTANCE_LABELS = { 1:"Normal", 2:"Important", 3:"Critical" };

  const setTypeDays = (type, days) =>
    setLocal(p => ({ ...p, taskTypes:{ ...p.taskTypes, [type]:{ ...p.taskTypes[type], days:+days } } }));
  const setClientImp = (cid, imp) =>
    setLocal(p => ({ ...p, clientImportance:{ ...p.clientImportance, [cid]:+imp } }));

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)",
      zIndex:100, display:"flex", justifyContent:"flex-end" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width:400, height:"100%", background:T.surface,
        borderLeft:`1px solid ${T.borderMid}`, display:"flex",
        flexDirection:"column", overflow:"hidden" }}>

        {/* Header */}
        <div style={{ padding:"16px 18px", borderBottom:`1px solid ${T.border}`,
          display:"flex", alignItems:"center", flexShrink:0 }}>
          <span style={{ fontSize:13, fontWeight:600, color:T.text, flex:1 }}>
            SLA Configuration
          </span>
          <span style={{ fontSize:9.5, color:T.sub, marginRight:12 }}>
            Management only
          </span>
          <button onClick={onClose} style={{ background:"transparent", border:"none",
            color:T.sub, fontSize:14, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"18px" }}>

          {/* Task type SLA windows */}
          <div style={{ marginBottom:22 }}>
            <Lbl style={{ display:"block", marginBottom:12 }}>Task Type SLA Windows</Lbl>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {Object.entries(local.taskTypes).map(([type, meta]) => (
                <div key={type} style={{ display:"flex", alignItems:"center",
                  gap:12, padding:"8px 12px", background:T.raised,
                  borderRadius:6, border:`1px solid ${T.border}` }}>
                  <span style={{ fontSize:11, color:T.text, flex:1 }}>
                    {meta.label}
                  </span>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <input type="number" min="1" max="30" value={meta.days}
                      onChange={e => setTypeDays(type, e.target.value)}
                      style={{ width:44, padding:"3px 6px", background:T.bg,
                        border:`1px solid ${T.border}`, borderRadius:4,
                        color:T.text, fontSize:11, textAlign:"center",
                        fontFamily:"'Sora'", outline:"none" }} />
                    <span style={{ fontSize:9.5, color:T.sub }}>days</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Hr style={{ marginBottom:22 }} />

          {/* Client importance */}
          <div style={{ marginBottom:22 }}>
            <Lbl style={{ display:"block", marginBottom:5 }}>Client Importance</Lbl>
            <div style={{ fontSize:9.5, color:T.sub, marginBottom:12 }}>
              Higher importance = tighter effective SLA window
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {Object.entries(CLIENTS_META).map(([cid, meta]) => (
                <div key={cid} style={{ display:"flex", alignItems:"center",
                  gap:12, padding:"8px 12px", background:T.raised,
                  borderRadius:6, border:`1px solid ${T.border}` }}>
                  <span style={{ fontSize:11, color:T.text, flex:1 }}>{meta.name}</span>
                  <div style={{ display:"flex", gap:4 }}>
                    {IMPORTANCE_OPTS.map(v => (
                      <button key={v} onClick={() => setClientImp(cid, v)} style={{
                        padding:"3px 9px", borderRadius:4, fontSize:9.5, fontWeight:500,
                        fontFamily:"'Sora'", cursor:"pointer", border:"none",
                        background: (local.clientImportance[cid]||1) === v
                          ? (v===3?`${T.red}20`:v===2?`${T.amber}20`:`${T.accent}20`)
                          : T.bg,
                        color:(local.clientImportance[cid]||1) === v
                          ? (v===3?T.red:v===2?T.amber:T.accent)
                          : T.sub,
                        border:`1px solid ${(local.clientImportance[cid]||1)===v
                          ? (v===3?T.red+"40":v===2?T.amber+"40":T.accent+"40")
                          : T.border}` }}>
                        {IMPORTANCE_LABELS[v]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Hr style={{ marginBottom:22 }} />

          {/* Campaign flags */}
          <div style={{ marginBottom:22 }}>
            <div style={{ display:"flex", alignItems:"center",
              gap:8, marginBottom:12 }}>
              <Lbl>Campaign Flags</Lbl>
              <button style={{ fontSize:9, color:T.accent, background:"transparent",
                border:"none", cursor:"pointer", fontFamily:"'Sora'" }}>
                + Add
              </button>
            </div>
            {local.campaignFlags.map(flag => (
              <div key={flag.id} style={{ padding:"9px 12px", background:T.raised,
                borderRadius:6, border:`1px solid ${T.border}`,
                display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                <span style={{ fontSize:11, color:T.text, flex:1 }}>{flag.name}</span>
                <span style={{ fontSize:9, color:
                  flag.importance===3?T.red:flag.importance===2?T.amber:T.accent }}>
                  {IMPORTANCE_LABELS[flag.importance]}
                </span>
              </div>
            ))}
          </div>

          <Hr style={{ marginBottom:22 }} />

          {/* Custom variables */}
          <div style={{ marginBottom:22 }}>
            <div style={{ display:"flex", alignItems:"center",
              gap:8, marginBottom:12 }}>
              <Lbl>Custom Variables</Lbl>
              <button style={{ fontSize:9, color:T.accent, background:"transparent",
                border:"none", cursor:"pointer", fontFamily:"'Sora'" }}>
                + Add
              </button>
            </div>
            {local.customVars.map(v => (
              <div key={v.id} style={{ padding:"9px 12px", background:T.raised,
                borderRadius:6, border:`1px solid ${T.border}`, marginBottom:6 }}>
                <div style={{ display:"flex", alignItems:"baseline",
                  gap:8, marginBottom:3 }}>
                  <span style={{ fontSize:11, color:T.text, fontWeight:500 }}>
                    {v.key}
                  </span>
                  <span style={{ fontSize:9, color:T.accent }}>×{v.value}</span>
                </div>
                <div style={{ fontSize:9.5, color:T.sub }}>{v.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:"12px 18px", borderTop:`1px solid ${T.border}`,
          display:"flex", gap:8, flexShrink:0 }}>
          <Btn variant="primary" onClick={() => { onChange(local); onClose(); }}
            style={{ flex:1, justifyContent:"center" }}>
            Save Configuration
          </Btn>
          <Btn variant="subtle" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
const VIEWS = [
  { id:"kanban",   label:"Kanban"   },
  { id:"list",     label:"List"     },
  { id:"calendar", label:"Calendar" },
];

export default function ProjectWorkspace() {
  const [view,       setView]       = useState("kanban");
  const [selectedPid,setSelectedPid] = useState(null);
  const [activeTask, setActiveTask]  = useState(null);
  const [showSLA,    setShowSLA]     = useState(false);
  const [slaCfg,     setSLACfg]      = useState(DEFAULT_SLA);
  const [tasks,      setTasks]       = useState(TASKS_SEED);
  const [toast,      setToast]       = useState(null);

  // Filters
  const [filterClient, setFilterClient] = useState("all");
  const [filterOwner,  setFilterOwner]  = useState("all");
  const [filterPri,    setFilterPri]    = useState("all");
  const [filterSLA,    setFilterSLA]    = useState("all");

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const handleStatusChange = (id, status) => {
    setTasks(p => p.map(t => t.id === id ? { ...t, status } : t));
    if (activeTask?.id === id) setActiveTask(p => ({ ...p, status }));
    showToast(`Status updated → ${statusLabel(status)}`);
  };

  const visibleTasks = useMemo(() => {
    let list = tasks;
    if (selectedPid)           list = list.filter(t => t.pid === selectedPid);
    if (filterClient !== "all") list = list.filter(t => t.cid === filterClient);
    if (filterOwner  !== "all") list = list.filter(t => t.owner === filterOwner);
    if (filterPri    !== "all") list = list.filter(t => t.priority === filterPri);
    if (filterSLA === "breached") list = list.filter(t => calcSLA(t, slaCfg).status === "breached");
    if (filterSLA === "at_risk")  list = list.filter(t => ["breached","at_risk"].includes(calcSLA(t, slaCfg).status));
    return list;
  }, [tasks, selectedPid, filterClient, filterOwner, filterPri, filterSLA, slaCfg]);

  const breachCount = tasks.filter(t => calcSLA(t, slaCfg).status === "breached").length;
  const overdueCount = tasks.filter(t => t.daysUntil < 0 && t.status !== "done").length;

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
      <div style={{ padding:"14px 20px 12px", borderBottom:`1px solid ${T.border}`,
        flexShrink:0, background:T.surface }}>
        <div style={{ display:"flex", alignItems:"center", marginBottom:12 }}>
          <div>
            <h1 style={{ fontFamily:"'Newsreader',serif", fontSize:18, fontWeight:600,
              color:T.text, margin:0, fontStyle:"italic" }}>Project Workspace</h1>
            <div style={{ marginTop:2 }}>
              <Lbl>Module 6 · Tasks + Projects · Global Task View</Lbl>
            </div>
          </div>
          <div style={{ flex:1 }} />
          <div style={{ display:"flex", gap:20, marginRight:16 }}>
            {[
              { l:"Total tasks",  v:tasks.length,                                                     c:T.sub   },
              { l:"Active",       v:tasks.filter(t=>!["done"].includes(t.status)).length,             c:T.text  },
              { l:"Overdue",      v:overdueCount,  c:overdueCount > 0 ? T.red  : T.sub               },
              { l:"SLA breach",   v:breachCount,   c:breachCount  > 0 ? T.amber: T.sub               },
            ].map(s => (
              <div key={s.l} style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                <span style={{ fontSize:18, fontWeight:600, color:s.c, lineHeight:1 }}>{s.v}</span>
                <span style={{ fontSize:9, color:T.label }}>{s.l}</span>
              </div>
            ))}
          </div>
          {/* View switcher */}
          <div style={{ display:"flex", gap:3, marginRight:10 }}>
            {VIEWS.map(v => (
              <button key={v.id} onClick={() => setView(v.id)} style={{
                padding:"4px 11px", borderRadius:5, fontSize:10, fontWeight:500,
                fontFamily:"'Sora'", cursor:"pointer", background:"transparent",
                border:`1px solid ${view===v.id ? T.borderMid : T.border}`,
                color: view===v.id ? T.text : T.sub, transition:"all 0.12s" }}>
                {v.label}
              </button>
            ))}
          </div>
          <button onClick={() => setShowSLA(true)}
            style={{ padding:"5px 10px", background:"transparent",
              border:`1px solid ${T.border}`, borderRadius:5, color:T.sub,
              fontSize:10, cursor:"pointer", fontFamily:"'Sora'", marginRight:8 }}>
            ⚙ SLA
          </button>
          <Btn variant="primary">+ Add Task</Btn>
        </div>

        {/* Filter bar */}
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {[
            { val:filterClient, set:setFilterClient, opts:[["all","All Clients"],...Object.entries(CLIENTS_META).map(([k,v])=>[k,v.short])] },
            { val:filterOwner,  set:setFilterOwner,  opts:[["all","All Owners"], ...TEAM.map(t=>[t.id,t.name])]                             },
            { val:filterPri,    set:setFilterPri,    opts:[["all","All Priority"],["p1","P1"],["p2","P2"],["p3","P3"]]                       },
            { val:filterSLA,    set:setFilterSLA,    opts:[["all","All SLA"],["breached","Breached"],["at_risk","At Risk"]]                  },
          ].map((f, i) => (
            <select key={i} value={f.val} onChange={e => f.set(e.target.value)}
              style={{ background:T.raised, border:`1px solid ${T.border}`,
                color: f.val !== "all" ? T.text : T.sub,
                fontFamily:"'Sora'", fontSize:10, padding:"4px 22px 4px 9px",
                borderRadius:5, outline:"none", appearance:"none",
                backgroundImage:`url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3e%3cpath fill='%2328283A' d='M4 6L0 2h8z'/%3e%3c/svg%3e")`,
                backgroundRepeat:"no-repeat", backgroundPosition:"right 6px center" }}>
              {f.opts.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
          {(filterClient!=="all"||filterOwner!=="all"||filterPri!=="all"||filterSLA!=="all") && (
            <button onClick={() => { setFilterClient("all"); setFilterOwner("all");
              setFilterPri("all"); setFilterSLA("all"); }}
              style={{ fontSize:9.5, color:T.label, background:"transparent",
                border:"none", cursor:"pointer", fontFamily:"'Sora'" }}>
              Clear filters
            </button>
          )}
          <span style={{ fontSize:9.5, color:T.sub, marginLeft:"auto" }}>
            {visibleTasks.length} task{visibleTasks.length!==1?"s":""}
          </span>
        </div>
      </div>

      {/* BODY */}
      <div style={{ display:"flex", flex:1, minHeight:0 }}>

        {/* Left — projects */}
        <div style={{ width:240, flexShrink:0, borderRight:`1px solid ${T.border}`,
          padding:"10px 10px", overflowY:"auto" }}>
          <ProjectPanel selectedPid={selectedPid} onSelect={setSelectedPid} />
        </div>

        {/* Main — views */}
        <div style={{ flex:1, minWidth:0, overflowY:"auto",
          display:"flex", flexDirection:"column" }}>
          {view === "kanban" && (
            <KanbanView tasks={visibleTasks} cfg={slaCfg}
              onTaskClick={t => setActiveTask(t)} />
          )}
          {view === "list" && (
            <ListView tasks={visibleTasks} cfg={slaCfg}
              onTaskClick={t => setActiveTask(t)} />
          )}
          {view === "calendar" && (
            <div style={{ overflowY:"auto", flex:1 }}>
              <CalendarView tasks={visibleTasks} cfg={slaCfg}
                onTaskClick={t => setActiveTask(t)} />
            </div>
          )}
        </div>
      </div>

      {/* Task modal */}
      {activeTask && (
        <TaskModal task={activeTask} cfg={slaCfg}
          onClose={() => setActiveTask(null)}
          onStatusChange={handleStatusChange} />
      )}

      {/* SLA settings drawer */}
      {showSLA && (
        <SLASettingsDrawer cfg={slaCfg}
          onChange={cfg => { setSLACfg(cfg); showToast("SLA configuration saved"); }}
          onClose={() => setShowSLA(false)} />
      )}

    </div>
  );
}
