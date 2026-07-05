/**
 * 5th Avenue — Internal OS
 * FAAVI Score — Fifth Avenue AI Visibility Index
 * ─────────────────────────────────────────────────────────────────
 * The platform's primary brand health metric.
 * Central showcase: score dominates, ring connects to channels,
 * nodes expand to reveal channel detail, history on scroll.
 */

import { useState, useMemo } from "react";

import { T } from "../../theme/tokens";

const CLIENTS = [
  { id:"fb", name:"FreshBite Foods",   faavi:72, grade:"B", gradeLabel:"Strong",    rank:"2 of 5",  cat:"Food & Beverage",     catAvg:61, portfolioAvg:62 },
  { id:"nb", name:"NutriBlend India",  faavi:61, grade:"C", gradeLabel:"Average",   rank:"3 of 4",  cat:"Nutrition",           catAvg:58, portfolioAvg:62 },
  { id:"ch", name:"CraftHome Decor",   faavi:53, grade:"C", gradeLabel:"Average",   rank:"5 of 5",  cat:"Home Decor",          catAvg:59, portfolioAvg:62 },
  { id:"df", name:"DermFirst",         faavi:68, grade:"B", gradeLabel:"Strong",    rank:"2 of 4",  cat:"Skincare",            catAvg:60, portfolioAvg:62 },
  { id:"tg", name:"TerraGrow Organic", faavi:44, grade:"D", gradeLabel:"Weak",      rank:"4 of 4",  cat:"Organic Food",        catAvg:55, portfolioAvg:62 },
];

const CHANNEL_DATA = {
  fb:[
    { id:"aeo",     label:"AEO",         color:T.accent,  score:68, benchmark:52, trend:[60,62,64,65,67,68], gaps:3, gapList:["No FAQ schema on product pages","'Best low sugar snacks' AI answer not owned","Recipe content lacks structured markup"], topRec:"Implement FAQ and Product schema on all 14 product pages." },
    { id:"seo",     label:"SEO",         color:T.green,   score:74, benchmark:61, trend:[68,70,71,72,73,74], gaps:2, gapList:["3 content cluster pages missing (22K/mo)","Core Web Vitals LCP 3.1s — target 2.5s"], topRec:"Build 3 pillar content pages targeting identified cluster queries." },
    { id:"meo",     label:"Maps / MEO",  color:T.amber,   score:80, benchmark:55, trend:[75,76,77,78,79,80], gaps:1, gapList:["2 partner branch GBP listings unclaimed"], topRec:"Claim Koramangala and Bandra GBP listings within 48 hours." },
    { id:"ai",      label:"AI Presence", color:T.purple,  score:58, benchmark:48, trend:[62,61,60,59,59,58], gaps:4, gapList:["Not cited in ChatGPT, Perplexity, Gemini or Claude","Happilo displacing FreshBite in 3 Perplexity queries","No structured comparison content for AI extraction"], topRec:"Publish Perplexity-first comparison article — fastest AI citation path." },
    { id:"reviews", label:"Reviews",     color:"#C47ABF", score:85, benchmark:60, trend:[81,82,83,83,84,85], gaps:1, gapList:["Review response rate 22% — target 80%"], topRec:"Deploy response template library and respond to all reviews within 14 days." },
    { id:"social",  label:"Social",      color:"#4ADE80", score:62, benchmark:55, trend:[60,60,61,61,62,62], gaps:2, gapList:["YouTube channel inactive — last video 7 months ago","No YouTube Shorts strategy"], topRec:"Launch YouTube snack education series — zero dominant competitor in niche." },
  ],
  nb:[
    { id:"aeo",     label:"AEO",         color:T.accent,  score:52, benchmark:52, trend:[48,49,50,51,51,52], gaps:5, gapList:["Competitor owns all AI answers for protein queries","No clinical content to trigger citations"], topRec:"3 expert comparison articles with clinical citations." },
    { id:"seo",     label:"SEO",         color:T.green,   score:65, benchmark:61, trend:[60,61,62,63,64,65], gaps:4, gapList:["Domain authority DA 18 — MuscleBlaze DA 52","Only 43 referring domains"], topRec:"20 high-quality backlinks in 90 days via fitness publications." },
    { id:"meo",     label:"Maps / MEO",  color:T.amber,   score:55, benchmark:45, trend:[52,52,53,54,54,55], gaps:2, gapList:["Online-only — Amazon/Flipkart listings unoptimised"], topRec:"Optimise marketplace listings for search visibility." },
    { id:"ai",      label:"AI Presence", color:T.purple,  score:48, benchmark:48, trend:[48,48,48,48,48,48], gaps:6, gapList:["Not cited on any platform","MuscleBlaze cited everywhere"], topRec:"AI Citation campaign — Perplexity first." },
    { id:"reviews", label:"Reviews",     color:"#C47ABF", score:70, benchmark:60, trend:[66,67,68,68,69,70], gaps:3, gapList:["Amazon avg 3.8★ — below 4.0★ threshold"], topRec:"Post-purchase review request campaign." },
    { id:"social",  label:"Social",      color:"#4ADE80", score:55, benchmark:55, trend:[53,53,54,54,55,55], gaps:3, gapList:["Instagram inconsistent","YouTube non-existent"], topRec:"Define content pillars and 60-day calendar." },
  ],
};
["ch","df","tg"].forEach(cid => {
  CHANNEL_DATA[cid] = CHANNEL_DATA.fb.map(ch => ({
    ...ch,
    score:   Math.max(20, ch.score - Math.floor(Math.random()*20) + Math.floor(Math.random()*15)),
    trend:   ch.trend.map(v => Math.max(10, v - Math.floor(Math.random()*15) + Math.floor(Math.random()*10))),
  }));
});

const FAAVI_HISTORY = {
  fb:[64,66,67,68,70,72],
  nb:[55,56,57,58,59,61],
  ch:[50,50,51,51,52,53],
  df:[62,63,64,65,66,68],
  tg:[42,42,43,43,44,44],
};
const MONTHS = ["Dec","Jan","Feb","Mar","Apr","May"];

const scoreColor = s => s >= 70 ? T.green : s >= 50 ? T.amber : T.red;
const gradeColor = g => ({ A:T.green, B:T.accent, C:T.amber, D:T.red })[g] || T.sub;

const Lbl = ({ children, color, style={} }) =>
  <span style={{ fontSize:9, fontWeight:600, color:color||T.label,
    textTransform:"uppercase", letterSpacing:"0.08em", ...style }}>{children}</span>;
const Hr  = ({ style={} }) =>
  <div style={{ height:1, background:T.border, ...style }} />;
function Btn({ children, onClick, variant="ghost", style={} }) {
  const v = {
    primary:{ background:T.accent, color:"#07080D", fontWeight:600 },
    ghost:  { background:T.hover,  color:T.sub, border:`1px solid ${T.border}` },
  };
  return <button onClick={onClick}
    style={{ padding:"6px 12px", borderRadius:5, fontSize:10.5, fontWeight:500,
      cursor:"pointer", fontFamily:"'Sora'", border:"none",
      display:"inline-flex", alignItems:"center", gap:5,
      ...(v[variant]||v.ghost), ...style }}>{children}</button>;
}

// ── SPARKLINE ─────────────────────────────────────────────────────────────────
function Sparkline({ data, color, width=80, height=24 }) {
  if (!data || data.length < 2) return null;
  const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
  const p  = 2;
  const pts = data.map((v,i) => `${p+(i/(data.length-1))*(width-p*2)},${p+((mx-v)/rng)*(height-p*2)}`).join(" ");
  const last = data[data.length-1];
  const lx = width-p, ly = p+((mx-last)/rng)*(height-p*2);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow:"visible" }}>
      <polyline points={pts} fill="none" stroke={color||T.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.5" fill={color||T.accent} />
    </svg>
  );
}

// ── FAAVI RING ────────────────────────────────────────────────────────────────
function FAVIRing({ channels, size=280 }) {
  const cx = size/2, cy = size/2, r = size/2 - 20;
  const n = channels.length, gapDeg = 6, sliceDeg = (360 - gapDeg*n) / n;

  const pt = (deg, rad) => {
    const a = (deg - 90) * Math.PI / 180;
    return { x:(cx + rad*Math.cos(a)).toFixed(2), y:(cy + rad*Math.sin(a)).toFixed(2) };
  };
  const arc = (startDeg, sweepDeg) => {
    if (sweepDeg <= 0.1) return "";
    const s = pt(startDeg, r), e = pt(startDeg+sweepDeg, r);
    const lg = sweepDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${lg} 1 ${e.x} ${e.y}`;
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink:0 }}>
      {channels.map((ch, i) => {
        const start = i * (sliceDeg + gapDeg);
        const fill  = sliceDeg * (ch.score / 100);
        return (
          <g key={ch.id}>
            <path d={arc(start, sliceDeg)} fill="none"
              stroke="rgba(255,255,255,0.04)" strokeWidth={10} strokeLinecap="round" />
            <path d={arc(start, Math.max(0.5, fill - 0.5))} fill="none"
              stroke="rgba(255,255,255,0.52)" strokeWidth={10} strokeLinecap="round" />
          </g>
        );
      })}
    </svg>
  );
}

// ── CHANNEL NODE ──────────────────────────────────────────────────────────────
function ChannelNode({ ch, clientId }) {
  const [open, setOpen] = useState(false);
  const diff = ch.score - ch.benchmark;
  const r = 18, circ = 2*Math.PI*r;
  const offset = circ * (1 - ch.score/100);

  return (
    <div style={{ borderRadius:9, border:`1px solid ${open ? T.borderMid : T.border}`,
      background: open ? T.raised : "transparent",
      transition:"all 0.18s", overflow:"hidden" }}>

      {/* Collapsed header */}
      <div onClick={() => setOpen(!open)}
        style={{ padding:"14px 16px", cursor:"pointer", display:"flex",
          alignItems:"center", gap:14 }}
        onMouseOver={e => e.currentTarget.style.background = T.hover}
        onMouseOut={e  => e.currentTarget.style.background = "transparent"}>

        {/* Score ring */}
        <div style={{ position:"relative", width:44, height:44, flexShrink:0 }}>
          <svg width={44} height={44} viewBox="0 0 44 44"
            style={{ transform:"rotate(-90deg)" }}>
            <circle cx={22} cy={22} r={r} fill="none"
              stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
            <circle cx={22} cy={22} r={r} fill="none"
              stroke={ch.color} strokeWidth={5}
              strokeDasharray={circ} strokeDashoffset={offset}
              strokeLinecap="round" />
          </svg>
          <div style={{ position:"absolute", inset:0, display:"flex",
            alignItems:"center", justifyContent:"center",
            fontSize:10.5, fontWeight:700, color:ch.color }}>
            {ch.score}
          </div>
        </div>

        <div style={{ flex:1 }}>
          <div style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:2 }}>
            {ch.label}
          </div>
          <div style={{ fontSize:9.5, color:T.sub }}>
            vs benchmark:
            <span style={{ color: diff >= 0 ? T.green : T.red, fontWeight:600,
              marginLeft:4 }}>
              {diff >= 0 ? `+${diff}` : diff}
            </span>
          </div>
        </div>

        {ch.gaps > 0 && (
          <div style={{ textAlign:"right", flexShrink:0 }}>
            <div style={{ fontSize:11, fontWeight:600,
              color: ch.gaps >= 3 ? T.red : T.amber }}>{ch.gaps}</div>
            <div style={{ fontSize:8.5, color:T.sub }}>gap{ch.gaps!==1?"s":""}</div>
          </div>
        )}

        <span style={{ fontSize:9, color:T.label, marginLeft:6 }}>
          {open ? "▲" : "▼"}
        </span>
      </div>

      {/* Expanded detail */}
      {open && (
        <>
          <Hr />
          <div style={{ padding:"14px 16px", display:"flex",
            flexDirection:"column", gap:14 }}>

            {/* Trend */}
            <div style={{ display:"flex", alignItems:"center",
              justifyContent:"space-between" }}>
              <Lbl>6-Month Trend</Lbl>
              <Sparkline data={ch.trend} color={ch.color} width={100} height={26} />
            </div>

            {/* Gaps */}
            {ch.gapList?.length > 0 && (
              <div>
                <Lbl style={{ display:"block", marginBottom:7 }}>Identified Gaps</Lbl>
                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  {ch.gapList.map((g, i) => (
                    <div key={i} style={{ display:"flex", gap:7, alignItems:"flex-start" }}>
                      <span style={{ fontSize:8.5, color:T.red,
                        marginTop:3, flexShrink:0 }}>✕</span>
                      <span style={{ fontSize:10.5, color:T.text, lineHeight:1.45 }}>{g}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top recommendation */}
            <div style={{ padding:"10px 12px", background:T.bg,
              borderRadius:6, border:`1px solid ${T.border}` }}>
              <Lbl style={{ display:"block", marginBottom:5 }}>Top Recommendation</Lbl>
              <div style={{ fontSize:10.5, color:T.text, lineHeight:1.5 }}>
                {ch.topRec}
              </div>
            </div>

            <button style={{ fontSize:9.5, color:T.accent, background:"transparent",
              border:"none", cursor:"pointer", fontFamily:"'Sora'",
              textAlign:"left", padding:0 }}>
              → View full {ch.label} audit
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function FAVIScore() {
  const [clientId, setClientId] = useState("fb");
  const client   = CLIENTS.find(c => c.id === clientId);
  const channels = CHANNEL_DATA[clientId] || CHANNEL_DATA.fb;
  const history  = FAAVI_HISTORY[clientId] || [];
  const gc = gradeColor(client.grade);
  const trendDelta = history.length >= 2 ? history[history.length-1] - history[history.length-2] : 0;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%",
      background:T.bg, fontFamily:"'Sora',sans-serif", color:T.text,
      overflowY:"auto" }}>

      {/* HEADER */}
      <div style={{ padding:"14px 28px", borderBottom:`1px solid ${T.border}`,
        display:"flex", alignItems:"center", gap:12, flexShrink:0,
        background:T.surface, position:"sticky", top:0, zIndex:10 }}>
        <div>
          <span style={{ fontSize:11, fontWeight:700, color:T.accent,
            letterSpacing:"0.12em" }}>FAAVI</span>
          <span style={{ fontSize:9.5, color:T.sub, marginLeft:8 }}>
            Fifth Avenue AI Visibility Index
          </span>
        </div>
        <div style={{ flex:1 }} />
        <select value={clientId} onChange={e => setClientId(e.target.value)}
          style={{ background:T.raised, border:`1px solid ${T.border}`, color:T.text,
            fontFamily:"'Sora'", fontSize:11, padding:"5px 22px 5px 10px",
            borderRadius:5, outline:"none", appearance:"none",
            backgroundImage:`url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3e%3cpath fill='%2328283A' d='M4 6L0 2h8z'/%3e%3c/svg%3e")`,
            backgroundRepeat:"no-repeat", backgroundPosition:"right 8px center" }}>
          {CLIENTS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Btn variant="ghost" style={{ fontSize:9.5, padding:"4px 11px" }}>Export</Btn>
      </div>

      {/* HERO */}
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
        padding:"52px 28px 40px", gap:0 }}>

        {/* Tiny label above ring */}
        <div style={{ fontSize:9, fontWeight:700, color:T.label,
          textTransform:"uppercase", letterSpacing:"0.18em", marginBottom:28 }}>
          Fifth Avenue AI Visibility Index
        </div>

        {/* Ring + score (relative positioned) */}
        <div style={{ position:"relative", width:280, height:280 }}>
          <FAVIRing channels={channels} size={280} />
          {/* Centered score */}
          <div style={{ position:"absolute", top:"50%", left:"50%",
            transform:"translate(-50%,-50%)", textAlign:"center" }}>
            <div style={{ fontSize:76, fontWeight:600, color:T.text,
              lineHeight:1, letterSpacing:"-0.03em" }}>
              {client.faavi}
            </div>
            <div style={{ fontSize:10, color:T.label, marginTop:4 }}>/100</div>
          </div>
        </div>

        {/* Grade + label */}
        <div style={{ marginTop:16, textAlign:"center" }}>
          <div style={{ fontSize:10, color:T.sub, marginBottom:10 }}>
            Grade {client.grade} · {client.gradeLabel}
          </div>
          <div style={{ display:"flex", alignItems:"center",
            justifyContent:"center", gap:10, fontSize:10 }}>
            <span style={{ color:T.sub }}>
              Rank {client.rank} in {client.cat}
            </span>
            <span style={{ color:T.mute }}>·</span>
            <span style={{ color:T.sub }}>
              Category avg {client.catAvg}
            </span>
            <span style={{ color:T.mute }}>·</span>
            <span style={{ color:T.sub }}>
              {client.faavi >= client.catAvg
                ? `+${client.faavi - client.catAvg} above category`
                : `${client.faavi - client.catAvg} below category`}
            </span>
            {trendDelta !== 0 && (
              <>
                <span style={{ color:T.mute }}>·</span>
                <span style={{ color:T.sub }}>
                  {trendDelta > 0 ? "▲" : "▼"}{Math.abs(trendDelta)} this month
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* CHANNEL NODES */}
      <div style={{ padding:"0 28px 44px" }}>
        <div style={{ display:"flex", alignItems:"center",
          justifyContent:"space-between", marginBottom:14 }}>
          <Lbl>Channel Breakdown — click to expand</Lbl>
          <span style={{ fontSize:9.5, color:T.sub }}>
            {channels.filter(c => c.gaps > 0).reduce((s,c) => s+c.gaps, 0)} total gaps
          </span>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
          {channels.map(ch => (
            <ChannelNode key={ch.id} ch={ch} clientId={clientId} />
          ))}
        </div>
      </div>

      <Hr style={{ margin:"0 28px" }} />

      {/* SCORE HISTORY */}
      <div style={{ padding:"32px 28px" }}>
        <Lbl style={{ display:"block", marginBottom:20 }}>Score History — last 6 months</Lbl>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>

          {/* FAAVI total history */}
          <div style={{ padding:"16px 18px", background:T.raised,
            borderRadius:8, border:`1px solid ${T.border}` }}>
            <div style={{ display:"flex", alignItems:"center",
              justifyContent:"space-between", marginBottom:16 }}>
              <span style={{ fontSize:11, fontWeight:600, color:T.text }}>
                Total FAAVI
              </span>
              <span style={{ fontSize:16, fontWeight:700, color:gc }}>
                {history[history.length-1]}
              </span>
            </div>
            <div style={{ display:"flex", alignItems:"flex-end",
              gap:8, height:50 }}>
              {history.map((v, i) => {
                const maxV = Math.max(...history);
                const h = Math.max(6, Math.round((v/maxV) * 46));
                return (
                  <div key={i} style={{ flex:1, display:"flex",
                    flexDirection:"column", alignItems:"center", gap:4 }}>
                    <div style={{ width:"100%", height:h, borderRadius:2,
                      background: i === history.length-1 ? gc : `${gc}40`,
                      transition:"height 0.4s" }} />
                    <span style={{ fontSize:8, color:T.label }}>{MONTHS[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Channel trends */}
          <div style={{ padding:"16px 18px", background:T.raised,
            borderRadius:8, border:`1px solid ${T.border}` }}>
            <div style={{ marginBottom:14 }}>
              <span style={{ fontSize:11, fontWeight:600, color:T.text }}>
                Channel Trends
              </span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {channels.map(ch => (
                <div key={ch.id} style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:10, color:T.text, width:96, flexShrink:0 }}>
                    {ch.label}
                  </span>
                  <Sparkline data={ch.trend} color={ch.color} width={88} height={20} />
                  <span style={{ fontSize:10.5, fontWeight:600,
                    color:scoreColor(ch.score), marginLeft:"auto" }}>
                    {ch.score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Hr style={{ margin:"0 28px" }} />

      {/* CALCULATION */}
      <div style={{ padding:"32px 28px 48px" }}>
        <Lbl style={{ display:"block", marginBottom:16 }}>How FAAVI is Calculated</Lbl>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
          {[
            { ch:"AEO",         weight:"20%", score:channels[0]?.score, contribution:Math.round(channels[0]?.score*0.2), color:T.accent },
            { ch:"SEO",         weight:"18%", score:channels[1]?.score, contribution:Math.round(channels[1]?.score*0.18),color:T.green  },
            { ch:"AI Presence", weight:"18%", score:channels[3]?.score, contribution:Math.round(channels[3]?.score*0.18),color:T.purple },
            { ch:"Reviews",     weight:"18%", score:channels[4]?.score, contribution:Math.round(channels[4]?.score*0.18),color:"#C47ABF"},
            { ch:"Maps / MEO",  weight:"14%", score:channels[2]?.score, contribution:Math.round(channels[2]?.score*0.14),color:T.amber  },
            { ch:"Social",      weight:"12%", score:channels[5]?.score, contribution:Math.round(channels[5]?.score*0.12),color:"#4ADE80"},
          ].map(row => (
            <div key={row.ch} style={{ padding:"11px 13px", background:T.raised,
              borderRadius:7, border:`1px solid ${T.border}`,
              display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:3, height:30, borderRadius:2,
                background:row.color, flexShrink:0 }} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10.5, color:T.text, fontWeight:500,
                  marginBottom:2 }}>{row.ch}</div>
                <div style={{ fontSize:9.5, color:T.sub }}>
                  {row.weight} weight
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:11, fontWeight:700, color:scoreColor(row.score||0) }}>
                  {row.score}
                </div>
                <div style={{ fontSize:9, color:T.label }}>→ +{row.contribution}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:12, padding:"10px 14px",
          background:T.raised, borderRadius:7, border:`1px solid ${T.border}`,
          fontSize:10.5, color:T.sub }}>
          FAAVI = Σ (channel score × channel weight) &nbsp;·&nbsp; Weighted composite of 6 visibility dimensions
        </div>
      </div>

    </div>
  );
}
