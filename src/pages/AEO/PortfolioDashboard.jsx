/**
 * 5th Avenue — Internal OS
 * Module 0: Portfolio Dashboard
 * ─────────────────────────────────────────────
 * Daily entry point. Views: Agency · My Accounts
 */

import { useState, useMemo } from "react";

// ── TOKENS ────────────────────────────────────────────────────────────────────
import { T } from "../../theme/tokens";

// ── DATA ──────────────────────────────────────────────────────────────────────
const TEAM = [
  { id:"t1", name:"Priya Nair",   init:"PN", role:"Consultant",     capacity:88 },
  { id:"t2", name:"Vikram Das",   init:"VD", role:"Consultant",     capacity:72, me:true },
  { id:"t3", name:"Arjun Reddy",  init:"AR", role:"Sr. Strategist", capacity:95 },
  { id:"t4", name:"Sneha Iyer",   init:"SI", role:"AEO Specialist", capacity:61 },
  { id:"t5", name:"Meera Joshi",  init:"MJ", role:"SEO Analyst",    capacity:44 },
  { id:"t6", name:"Karan Shah",   init:"KS", role:"Content Lead",   capacity:78 },
];

const CLIENTS = [
  { id:"fb", name:"FreshBite Foods",   init:"FB", website:"freshbitefoods.com", consultant:"t1", faavi:72, phase:"bau",      pkg:"Growth",     auditAge:18, openP1:2,  overdueTasks:1, projectsBehind:0 },
  { id:"nb", name:"NutriBlend India",  init:"NB", website:"nutriblend.in",      consultant:"t1", faavi:61, phase:"launch",    pkg:"Growth",     auditAge:42, openP1:5,  overdueTasks:4, projectsBehind:1 },
  { id:"ch", name:"CraftHome Decor",   init:"CH", website:"crafthomedecor.com", consultant:"t2", faavi:53, phase:"audit",     pkg:"Starter",    auditAge:67, openP1:8,  overdueTasks:6, projectsBehind:1 },
  { id:"df", name:"DermFirst",         init:"DF", website:"dermfirst.in",       consultant:"t2", faavi:68, phase:"campaigns", pkg:"Enterprise", auditAge:9,  openP1:1,  overdueTasks:0, projectsBehind:0 },
  { id:"tg", name:"TerraGrow Organic", init:"TG", website:"terragrow.in",       consultant:"t3", faavi:44, phase:"audit",     pkg:"Starter",    auditAge:91, openP1:11, overdueTasks:0, projectsBehind:0 },
];

const RECS = [
  { id:"r1", clientId:"nb", channel:"AI",      daysOpen:14, owner:"t1", title:"Launch AI citation strategy — brand absent from ChatGPT, Perplexity, Gemini" },
  { id:"r2", clientId:"ch", channel:"Maps",    daysOpen:21, owner:"t2", title:"Claim and optimise GBP listing — offline store invisible on local search" },
  { id:"r3", clientId:"ch", channel:"AEO",     daysOpen:21, owner:"t1", title:"Build home decor content cluster targeting 110K/mo queries" },
  { id:"r4", clientId:"nb", channel:"SEO",     daysOpen:9,  owner:"t3", title:"Domain authority gap — 20 backlinks needed to close gap vs competitors" },
  { id:"r5", clientId:"tg", channel:"Audit",   daysOpen:91, owner:"t3", title:"Full baseline audit overdue — no diagnostic data exists for this client" },
  { id:"r6", clientId:"ch", channel:"Reviews", daysOpen:30, owner:"t4", title:"0% review response rate — 17 unresponded reviews, some 6+ months old" },
];

const TASKS = [
  { id:"tk1", clientId:"nb", project:"AI Citation",       title:"Draft FAQ content for ChatGPT visibility",      owner:"t1", daysOverdue:3,  channel:"AI"      },
  { id:"tk2", clientId:"ch", project:"GBP Optimisation",  title:"Submit GBP claim and verify business listing",  owner:"t2", daysOverdue:7,  channel:"Maps"    },
  { id:"tk3", clientId:"nb", project:"Backlink Programme", title:"Identify 20 target domains for outreach",       owner:"t3", daysOverdue:2,  channel:"SEO"     },
  { id:"tk4", clientId:"ch", project:"Content Cluster",   title:"Keyword map for home decor cluster",            owner:"t1", daysOverdue:5,  channel:"AEO"     },
  { id:"tk5", clientId:"fb", project:"Schema",            title:"Add FAQ schema to 14 product pages",            owner:"t4", daysOverdue:1,  channel:"AEO"     },
  { id:"tk6", clientId:"ch", project:"Review Response",   title:"Respond to 17 unanswered Google reviews",       owner:"t4", daysOverdue:12, channel:"Reviews" },
  { id:"tk7", clientId:"nb", project:"AI Citation",       title:"Map competitor AI citations vs NutriBlend",     owner:"t3", daysOverdue:4,  channel:"AI"      },
];

const ACTIVITY = [
  { id:"a1", type:"audit",   client:"DermFirst",        actor:"SI", desc:"AI Presence scan completed — score 65/100",       time:"1h ago"    },
  { id:"a2", type:"task",    client:"FreshBite Foods",  actor:"SI", desc:"FAQ schema deployed on 6 product pages",          time:"2h ago"    },
  { id:"a3", type:"rec",     client:"NutriBlend India", actor:"PN", desc:"P1 created: AI Citation Strategy",                time:"3h ago"    },
  { id:"a4", type:"project", client:"DermFirst",        actor:"VD", desc:"Project 'Ingredient Authority Pages' approved",   time:"Yesterday" },
  { id:"a5", type:"report",  client:"FreshBite Foods",  actor:"PN", desc:"Monthly visibility report sent to client",        time:"Yesterday" },
  { id:"a6", type:"audit",   client:"CraftHome Decor",  actor:"VD", desc:"Competitive analysis — 3 new threats identified", time:"3 days ago"},
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
const getClient  = id => CLIENTS.find(c => c.id === id);
const getTeam    = id => TEAM.find(t => t.id === id);
const scoreColor = s  => s >= 70 ? T.green : s >= 50 ? T.amber : T.red;
const phaseColor = p  => ({ audit:T.label, launch:T.amber, bau:T.accent, campaigns:T.green })[p] || T.sub;
const phaseLabel = p  => ({ audit:"Audit", launch:"Launch", bau:"BAU", campaigns:"Campaigns" })[p] || p;
const urgency    = c  => {
  let s = 0;
  if (c.faavi < 50)    s += 40;
  if (c.auditAge > 60) s += 30;
  s += c.openP1 * 3 + c.overdueTasks * 4 + c.projectsBehind * 10;
  return s;
};

// ── ATOMS — exact V5 style ────────────────────────────────────────────────────
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

function Btn({ children, onClick, variant="ghost", disabled, style={} }) {
  const b = { padding:"6px 12px", borderRadius:5, fontSize:10.5, fontWeight:500,
    cursor:disabled?"not-allowed":"pointer", fontFamily:"'Sora'", border:"none",
    display:"inline-flex", alignItems:"center", gap:5, opacity:disabled?0.35:1 };
  const v = {
    primary: { background:T.accent, color:"#07080D", fontWeight:600 },
    ghost:   { background:T.hover,  color:T.sub, border:`1px solid ${T.border}` },
  };
  return <button onClick={onClick} disabled={disabled} style={{...b,...(v[variant]||v.ghost),...style}}>{children}</button>;
}

// ── TABLE STYLES ──────────────────────────────────────────────────────────────
const thS = { fontSize:9, fontWeight:600, color:T.label, textTransform:"uppercase",
  letterSpacing:"0.07em", padding:"6px 10px", whiteSpace:"nowrap",
  borderBottom:`1px solid ${T.border}`, textAlign:"left", background:T.raised };
const tdS = { padding:"7px 10px", borderBottom:`1px solid ${T.border}`,
  fontSize:11, color:T.sub, verticalAlign:"middle" };

// ── CLIENT CARD ───────────────────────────────────────────────────────────────
function ClientCard({ client, selected, onClick }) {
  return (
    <div onClick={onClick}
      style={{ padding:"11px 12px", borderRadius:6, cursor:"pointer", marginBottom:3,
        background:selected ? T.raised : "transparent",
        border:`1px solid ${selected ? T.borderMid : "transparent"}`,
        transition:"all 0.12s" }}
      onMouseOver={e => { if (!selected) e.currentTarget.style.background = T.hover; }}
      onMouseOut={e  => { if (!selected) e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
        <span style={{ fontSize:12, fontWeight:500, color:T.text, overflow:"hidden",
          textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{client.name}</span>
        <span style={{ fontSize:11, fontWeight:600, color:scoreColor(client.faavi),
          marginLeft:8, flexShrink:0 }}>{client.faavi}</span>
      </div>
      <div style={{ fontSize:9.5, color:T.sub, marginBottom:6 }}>{client.website}</div>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
        <Dot color={phaseColor(client.phase)} />
        <span style={{ fontSize:9.5, color:T.sub }}>{phaseLabel(client.phase)}</span>
        {client.openP1 > 0 && <>
          <span style={{ color:T.mute }}>·</span>
          <span style={{ fontSize:9.5, color:T.red }}>{client.openP1} P1</span>
        </>}
        {client.overdueTasks > 0 && <>
          <span style={{ color:T.mute }}>·</span>
          <span style={{ fontSize:9.5, color:T.amber }}>{client.overdueTasks} overdue</span>
        </>}
      </div>
      <div style={{ height:2, background:T.mute, borderRadius:1 }}>
        <div style={{ height:2, borderRadius:1, background:scoreColor(client.faavi),
          width:`${client.faavi}%`, transition:"width 0.4s" }} />
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function PortfolioDashboard() {
  const [view,  setView]  = useState("agency");
  const [toast, setToast] = useState(null);
  const MY_ID = "t2";

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const sorted = useMemo(() =>
    [...CLIENTS]
      .filter(c => view === "agency" ? true : c.consultant === MY_ID)
      .sort((a, b) => urgency(b) - urgency(a)),
    [view]
  );

  const visRecs  = view === "agency" ? RECS  : RECS.filter(r  => getClient(r.clientId)?.consultant === MY_ID);
  const visTasks = view === "agency" ? TASKS : TASKS.filter(t => t.owner === MY_ID);

  const totalP1  = CLIENTS.reduce((s, c) => s + c.openP1, 0);
  const totalOD  = TASKS.length;
  const auditDue = CLIENTS.filter(c => c.auditAge > 60).length;
  const avgFaavi = Math.round(CLIENTS.reduce((s, c) => s + c.faavi, 0) / CLIENTS.length);

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

      {/* HEADER */}
      <div style={{ padding:"14px 20px 12px", borderBottom:`1px solid ${T.border}`,
        flexShrink:0, background:T.surface }}>
        <div style={{ display:"flex", alignItems:"center", marginBottom:12 }}>
          <div>
            <h1 style={{ fontFamily:"'Newsreader',serif", fontSize:18, fontWeight:600,
              color:T.text, margin:0, fontStyle:"italic" }}>Portfolio</h1>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:2 }}>
              <Lbl>Internal · 5th Avenue</Lbl>
              <span style={{ fontSize:8, color:T.label, border:`1px solid ${T.border}`,
                borderRadius:3, padding:"1px 5px" }}>OS</span>
            </div>
          </div>
          <div style={{ flex:1 }} />
          <div style={{ display:"flex", gap:20, marginRight:16 }}>
            {[
              { l:"Clients",   v:CLIENTS.length },
              { l:"Avg FAAVI", v:avgFaavi,        c:T.sub                          },
              { l:"Open P1",   v:totalP1,         c:totalP1  > 0 ? T.red   : T.sub },
              { l:"Overdue",   v:totalOD,         c:totalOD  > 0 ? T.amber : T.sub },
              { l:"Audit due", v:auditDue,        c:auditDue > 0 ? T.amber : T.sub },
            ].map(s => (
              <div key={s.l} style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                <span style={{ fontSize:18, fontWeight:600, color:s.c||T.sub, lineHeight:1 }}>{s.v}</span>
                <span style={{ fontSize:9, color:T.label }}>{s.l}</span>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", gap:3, marginRight:10 }}>
            {[["agency","Agency"],["consultant","My Accounts"]].map(([id, lbl]) => (
              <button key={id} onClick={() => setView(id)} style={{
                padding:"4px 10px", borderRadius:5, fontSize:10, fontWeight:500,
                fontFamily:"'Sora'", cursor:"pointer", background:"transparent",
                border:`1px solid ${view === id ? T.borderMid : T.border}`,
                color:view === id ? T.text : T.sub, transition:"all 0.12s" }}>
                {lbl}
              </button>
            ))}
          </div>
          <Btn variant="primary" onClick={() => showToast("New client → Module 1")}>+ New Client</Btn>
        </div>
      </div>

      {/* BODY */}
      <div style={{ display:"flex", flex:1, minHeight:0 }}>

        {/* Left — client list */}
        <div style={{ width:260, flexShrink:0, borderRight:`1px solid ${T.border}`,
          overflowY:"auto", padding:"10px 8px" }}>
          {sorted.map(c => (
            <ClientCard key={c.id} client={c} selected={false}
              onClick={() => showToast(`${c.name} → Module 1`)} />
          ))}
        </div>

        {/* Right — digest */}
        <div style={{ flex:1, minWidth:0, overflowY:"auto", padding:"18px 20px",
          display:"flex", flexDirection:"column", gap:24 }}>

          {/* P1 Recommendations */}
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
              <Lbl>P1 Recommendations</Lbl>
              <span style={{ fontSize:9, color:T.label, padding:"1px 6px",
                background:T.mute, borderRadius:8 }}>{visRecs.length}</span>
              <div style={{ flex:1 }} />
              <button onClick={() => showToast("Recommendations Hub → Module 4")}
                style={{ fontSize:9, color:T.accent, background:"transparent",
                  border:"none", cursor:"pointer", fontFamily:"'Sora'" }}>View all →</button>
            </div>
            <div style={{ borderRadius:7, border:`1px solid ${T.border}`, overflow:"hidden" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr>{["Client","Channel","Issue","Owner","Open"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
                <tbody>
                  {visRecs.map((r, i) => {
                    const cl = getClient(r.clientId);
                    const ow = getTeam(r.owner);
                    return (
                      <tr key={r.id} style={{ background: i%2===0 ? "transparent" : T.hover }}>
                        <td style={{ ...tdS, color:T.text, whiteSpace:"nowrap" }}>{cl?.name}</td>
                        <td style={{ ...tdS, whiteSpace:"nowrap" }}>{r.channel}</td>
                        <td style={{ ...tdS, color:T.text, maxWidth:360 }}>{r.title}</td>
                        <td style={tdS}>
                          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                            <Av init={ow?.init||"?"} size={16} />
                            <span style={{ fontSize:9, color:T.label }}>{ow?.init}</span>
                          </div>
                        </td>
                        <td style={{ ...tdS, color:r.daysOpen>14?T.red:T.amber,
                          fontWeight:600, whiteSpace:"nowrap" }}>{r.daysOpen}d</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Overdue Tasks */}
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
              <Lbl>Overdue Tasks</Lbl>
              <span style={{ fontSize:9, color:T.label, padding:"1px 6px",
                background:T.mute, borderRadius:8 }}>{visTasks.length}</span>
              <div style={{ flex:1 }} />
              <button onClick={() => showToast("Task workspace → Module 6")}
                style={{ fontSize:9, color:T.accent, background:"transparent",
                  border:"none", cursor:"pointer", fontFamily:"'Sora'" }}>View all →</button>
            </div>
            <div style={{ borderRadius:7, border:`1px solid ${T.border}`, overflow:"hidden" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr>{["Client","Channel","Task","Owner","Late"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
                <tbody>
                  {visTasks.map((t, i) => {
                    const cl = getClient(t.clientId);
                    const ow = getTeam(t.owner);
                    return (
                      <tr key={t.id} style={{ background: i%2===0 ? "transparent" : T.hover }}>
                        <td style={{ ...tdS, whiteSpace:"nowrap" }}>{cl?.name}</td>
                        <td style={{ ...tdS, whiteSpace:"nowrap" }}>{t.channel}</td>
                        <td style={{ ...tdS, color:T.text }}>{t.title}</td>
                        <td style={tdS}>
                          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                            <Av init={ow?.init||"?"} size={16} />
                            <span style={{ fontSize:9, color:T.label }}>{ow?.init}</span>
                          </div>
                        </td>
                        <td style={{ ...tdS, color:t.daysOverdue>5?T.red:T.amber,
                          fontWeight:600, whiteSpace:"nowrap" }}>{t.daysOverdue}d</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Team + Activity */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>

            <div>
              <div style={{ marginBottom:10 }}><Lbl>Team Workload</Lbl></div>
              <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                {TEAM.map(m => (
                  <div key={m.id} style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <Av init={m.init} size={22} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", justifyContent:"space-between",
                        alignItems:"baseline", marginBottom:4 }}>
                        <span style={{ fontSize:10.5, color:T.text }}>
                          {m.name}
                          {m.me && <span style={{ fontSize:8, color:T.accent, marginLeft:5 }}>you</span>}
                        </span>
                        <span style={{ fontSize:9.5, fontWeight:600,
                          color:m.capacity>=85?T.red:m.capacity>=70?T.amber:T.sub }}>
                          {m.capacity}%
                        </span>
                      </div>
                      <div style={{ height:2, background:T.mute, borderRadius:1 }}>
                        <div style={{ height:2, borderRadius:1,
                          width:`${m.capacity}%`,
                          background:m.capacity>=85?T.red:m.capacity>=70?T.amber:T.label,
                          transition:"width 0.4s" }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ marginBottom:10 }}><Lbl>Recent Activity</Lbl></div>
              <div style={{ display:"flex", flexDirection:"column" }}>
                {ACTIVITY.map((item, i) => (
                  <div key={item.id} style={{ display:"flex", alignItems:"flex-start", gap:9,
                    padding:"8px 0",
                    borderBottom:i<ACTIVITY.length-1?`1px solid ${T.border}`:"none" }}>
                    <span style={{ fontSize:9, color:T.label, marginTop:2, flexShrink:0 }}>
                      {{ audit:"◎", task:"✓", rec:"⚑", project:"▤", report:"↗" }[item.type]}
                    </span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:10.5, color:T.sub, lineHeight:1.4 }}>{item.desc}</div>
                      <div style={{ fontSize:9, color:T.label, marginTop:2 }}>
                        {item.client} · {item.actor} · {item.time}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
