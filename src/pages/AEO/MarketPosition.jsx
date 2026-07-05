/**
 * 5th Avenue — Internal OS
 * Module 3: Market Position
 * ─────────────────────────────────────────────────────────────────
 * Competitive strategy layer.
 * Questions answered: Who is winning? Why? Where is the gap?
 * Where can we take share?
 *
 * Refresh cadence by tier:
 *   Enterprise / Gold → Weekly
 *   Growth / Mid      → Monthly
 *   Starter           → Quarterly
 *   + Manual Fetch    → On demand (meetings, campaigns, upsell)
 *
 * Design: minimal default, drill-down to reveal detail.
 */

import { useState, useMemo } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis,
  ZAxis, Tooltip, Legend, Cell,
} from "recharts";

// ── TOKENS ────────────────────────────────────────────────────────────────────
import { T } from "../../theme/tokens";

// ── MARKET DATA ───────────────────────────────────────────────────────────────
const MARKET_DATA = {
  fb: {
    tier:"growth", cadence:"monthly",
    lastUpdated:"Mon 26 May 2026", nextScheduled:"Tue 24 Jun 2026",
    overallTrend:"improving",
    position:{ rank:2, of:5, label:"Strong challenger" },
    swot:{
      strengths:[
        { title:"Review authority 85/100", detail:"Highest in tracked set. FreshBite leads Yoga Bar (82), Happilo (79) and Too Yumm (71) on review quality and volume. Strong trust signal at point of purchase." },
        { title:"GBP primary listing fully optimised", detail:"Main office GBP listing is complete, photo-rich, and has a response rate above 80%. Local search advantage in Bengaluru and Mumbai." },
        { title:"Top-2 rankings for 3 millet snack queries", detail:"'Millet snacks India' (8.4K/mo), 'ragi snacks online' (3.1K/mo) and 'foxtail millet snacks' (1.8K/mo) — FreshBite holds position 1 or 2 for all three." },
      ],
      weaknesses:[
        { title:"AI presence 58/100 — absent from all LLM responses", detail:"ChatGPT, Perplexity, Gemini, Claude and Copilot do not cite FreshBite for any tracked category queries. Happilo is cited in 4 of 5. This is the most critical gap." },
        { title:"Domain authority gap vs Happilo", detail:"FreshBite DA 38 vs Happilo DA 52. This structural gap limits keyword competitiveness and content reach. Requires a sustained link-building programme to close." },
        { title:"No YouTube presence in snack education category", detail:"YouTube channel exists but inactive (last video 7 months ago). Yoga Bar posts weekly. FreshBite is entirely absent from the fastest-growing brand discovery channel." },
      ],
      opportunities:[
        { title:"6 featured snippet vacancies in low-sugar snack queries", detail:"Competitor analysis shows 6 queries (combined 24K/mo) with no dominant snippet owner. FreshBite's product authority makes these winnable within 45–60 days with the right content structure." },
        { title:"Perplexity citation achievable with one article", detail:"Perplexity refreshes citations frequently. One well-structured, cited comparison article could appear in Perplexity results within 30 days — the fastest AI visibility win available." },
        { title:"YouTube snack education — no dominant Indian brand", detail:"No Indian snack brand has built a YouTube channel with >50K subscribers in the health snack education niche. First-mover advantage window is open. Estimated 12–18 months before a competitor claims it." },
      ],
      threats:[
        { title:"Yoga Bar accelerating AEO content investment", detail:"Yoga Bar published 14 new FAQ-structured articles in the past 90 days. They are systematically targeting the same featured snippet queries as FreshBite. If unchallenged, they will own this space within 6 months." },
        { title:"Happilo AI citation strategy underway", detail:"Happilo is cited in 4 of 5 major AI platforms — a position built over 18 months. Their recent content shows deliberate AI-optimised structuring. Closing this gap will take at least 12 months for FreshBite." },
        { title:"New D2C millet snack entrant with similar positioning", detail:"A new brand ('MilletGo') launched Q1 2026 with VC backing, targeting identical audience and keyword set. Early SEO signals show aggressive content investment. Worth monitoring closely." },
      ],
    },
    signals:[
      { dir:"down", text:"AI citation gap widening — Happilo now cited in 4/5 platforms vs FreshBite 0/5", ch:"ai",     urgent:true  },
      { dir:"up",   text:"FreshBite holds #1 millet snacks — Yoga Bar actively targeting same queries",   ch:"aeo",    urgent:false },
      { dir:"up",   text:"Review authority gap +3pts vs Yoga Bar — FreshBite 85, Yoga Bar 82",            ch:"reviews", urgent:false },
      { dir:"down", text:"New competitor MilletGo — early content signals show aggressive SEO investment", ch:"seo",    urgent:true  },
      { dir:"flat", text:"GBP standing stable — Happilo added new listing in Bengaluru (watch)",          ch:"meo",    urgent:false },
    ],
    competitors:[
      { id:"yb", name:"Yoga Bar",  type:"direct",     logo:"YB",
        scores:{ aeo:74, seo:71, meo:65, ai:71, reviews:82, social:68 },
        strengths:["Content hub with 80+ FAQ articles","YouTube channel — weekly posting, 28K subscribers","Backed by ITC — distribution scale advantage"],
        vulnerabilities:["Premium price limits mass-market penetration","Protein focus means snack range is narrow","AI citations are broad but not deep — easily displaced with authority content"],
        recentMoves:["Published 14 FAQ-structured articles (last 90 days)","Launched YouTube Shorts series","Introduced ₹99 entry-level SKU targeting FreshBite's price point"],
        recommendation:"Outflank on millet/grain specificity. Yoga Bar's content is generic health — FreshBite can own the ingredient-authority position.",
      },
      { id:"hp", name:"Happilo",   type:"direct",     logo:"HP",
        scores:{ aeo:61, seo:68, meo:58, ai:69, reviews:79, social:55 },
        strengths:["Strong AI citation presence (4/5 platforms)","Amazon marketplace dominance — DA 52 from product pages","Premium gifting positioning with corporate B2B moat"],
        vulnerabilities:["Gifting-first perception limits everyday snack discovery","Blog content thin — high ranking driven by DA, not content quality","Social presence inconsistent — no YouTube strategy"],
        recentMoves:["Sponsored content in 5 authority food publications (AI citation play)","Launched Happilo Rewards loyalty programme","Reduced prices on core SKUs by 12%"],
        recommendation:"AI citation gap is the priority. Happilo built their position over 18 months through publication placements. Same strategy — move fast on Perplexity first.",
      },
      { id:"ty", name:"Too Yumm",  type:"indirect",   logo:"TY",
        scores:{ aeo:55, seo:72, meo:48, ai:64, reviews:71, social:62 },
        strengths:["Mass distribution — 200K+ retail points","Baked snack association — strong 'baked not fried' narrative","Celebrity brand ambassador — high top-of-mind awareness"],
        vulnerabilities:["Health positioning is shallow — consumers don't associate with functional health","Premium segment vulnerable — positioned between mass and health","No ingredient authority content"],
        recentMoves:["Launched 'Smart Snacking' campaign targeting health-conscious segment","Entered quick-commerce with Zepto and Blinkit","Added protein range — competing with FreshBite protein bars"],
        recommendation:"Monitor primarily. Too Yumm's health pivot is brand-deep, not content-deep. Easier to outrank on ingredient specificity. Watch protein range closely.",
      },
      { id:"mg", name:"MilletGo",  type:"direct",     logo:"MG",
        scores:{ aeo:32, seo:41, meo:28, ai:22, reviews:48, social:38 },
        strengths:["VC-backed — significant content and marketing budget incoming","Direct millet positioning — identical to FreshBite","Clean, modern brand identity targeting urban millennial"],
        vulnerabilities:["Very early stage — no review base, no authority","Zero AI presence currently","Limited product range — 4 SKUs only"],
        recentMoves:["Launched Jan 2026 with ₹3Cr seed round","Published 8 SEO-optimised millet education articles in first month","Running aggressive Google Ads on FreshBite's branded terms"],
        recommendation:"Move fast on AEO content. MilletGo will build authority over 12–18 months. Establish FreshBite's ingredient authority now while MilletGo is still early.",
      },
    ],
    radarData:[
      { axis:"AEO",     FreshBite:68, "Yoga Bar":74, Happilo:61 },
      { axis:"SEO",     FreshBite:74, "Yoga Bar":71, Happilo:68 },
      { axis:"Maps",    FreshBite:80, "Yoga Bar":65, Happilo:58 },
      { axis:"AI",      FreshBite:58, "Yoga Bar":71, Happilo:69 },
      { axis:"Reviews", FreshBite:85, "Yoga Bar":82, Happilo:79 },
      { axis:"Social",  FreshBite:62, "Yoga Bar":68, Happilo:55 },
    ],
    matrixData:[
      { name:"FreshBite", x:72, y:68, z:100, color:T.accent },
      { name:"Yoga Bar",  x:72, y:74, z:85,  color:T.red    },
      { name:"Happilo",   x:65, y:61, z:90,  color:T.amber  },
      { name:"Too Yumm",  x:62, y:55, z:110, color:T.purple },
      { name:"MilletGo",  x:35, y:32, z:40,  color:T.sub    },
    ],
  },
  nb:{
    tier:"growth", cadence:"monthly", lastUpdated:"Mon 26 May 2026", nextScheduled:"Tue 24 Jun 2026",
    overallTrend:"stable", position:{ rank:4, of:4, label:"Emerging challenger" },
    swot:{
      strengths:[{ title:"Amazon presence — product listings active", detail:"4 active Amazon listings with 3.8★ avg. Good foundation to build from." }],
      weaknesses:[{ title:"DA 18 — lowest in competitive set", detail:"MuscleBlaze DA 52, Myprotein DA 61. Cannot rank competitively without closing this gap." }, { title:"Zero AI platform presence", detail:"Not cited anywhere. Full absence." }],
      opportunities:[{ title:"Women's protein segment underserved", detail:"No brand in the set has built a dedicated women's fitness narrative. High search volume, low competition." }],
      threats:[{ title:"MuscleBlaze dominant in all channels", detail:"Market leader with 10× the DA, 8× the AI citations. Direct competition is unwinnable short-term." }],
    },
    signals:[
      { dir:"flat", text:"MuscleBlaze AI presence stable — cited in all 5 platforms for key queries", ch:"ai", urgent:false },
      { dir:"down", text:"DA gap widening — NutriBlend 18 vs MuscleBlaze 52 — 3pt increase this month", ch:"seo", urgent:true },
    ],
    competitors:[
      { id:"mb", name:"MuscleBlaze", type:"direct", logo:"MB",
        scores:{ aeo:74, seo:81, meo:55, ai:82, reviews:78, social:72 },
        strengths:["Market leader with massive content library","All 5 AI platforms cite MuscleBlaze for protein queries","D2C + Amazon + offline distribution"],
        vulnerabilities:["Premium pricing in a price-sensitive segment","Generic protein positioning — no clinical differentiation","Dated brand identity — opportunity for challenger to look modern"],
        recentMoves:["Launched 'Science of Protein' content hub","Expanded to UAE market","Introduced women-specific protein line"],
        recommendation:"Don't compete head-to-head. Own women's functional nutrition and clinical differentiation. These are gaps MuscleBlaze has not filled.",
      },
    ],
    radarData:[
      { axis:"AEO",     NutriBlend:52, MuscleBlaze:74 },
      { axis:"SEO",     NutriBlend:65, MuscleBlaze:81 },
      { axis:"Maps",    NutriBlend:55, MuscleBlaze:55 },
      { axis:"AI",      NutriBlend:48, MuscleBlaze:82 },
      { axis:"Reviews", NutriBlend:70, MuscleBlaze:78 },
      { axis:"Social",  NutriBlend:55, MuscleBlaze:72 },
    ],
    matrixData:[
      { name:"NutriBlend",  x:61, y:52, z:60,  color:T.accent },
      { name:"MuscleBlaze", x:74, y:74, z:120, color:T.red    },
      { name:"Myprotein",   x:71, y:68, z:100, color:T.amber  },
    ],
  },
};
MARKET_DATA.ch = { tier:"starter", cadence:"quarterly", lastUpdated:"15 Mar 2026", nextScheduled:"15 Jun 2026", overallTrend:"declining", position:{ rank:5, of:5, label:"Needs attention" }, swot:{ strengths:[{ title:"Instagram community 8K followers — active engagement", detail:"Above average ER for home decor niche. Loyal community." }], weaknesses:[{ title:"Offline store invisible locally", detail:"GBP unclaimed. Zero local search presence." }, { title:"No AI presence in home decor", detail:"Fully absent from all recommendation platforms." }], opportunities:[{ title:"Pinterest — zero competition from similar brands", detail:"Home decor brands with Pinterest see 8× referral traffic vs other channels." }], threats:[{ title:"Pepperfry dominates all digital channels", detail:"DA 74, cited in all AI platforms, 3 local listings. Too far ahead on most channels." }] }, signals:[{ dir:"down", text:"Pepperfry added 2 new GBP listings in Bengaluru — direct local competition", ch:"meo", urgent:true }], competitors:[], radarData:[], matrixData:[] };
MARKET_DATA.df = { tier:"enterprise", cadence:"weekly", lastUpdated:"Mon 26 May 2026", nextScheduled:"Mon 2 Jun 2026", overallTrend:"improving", position:{ rank:2, of:4, label:"Strong challenger" }, swot:{ strengths:[{ title:"Dermatologist credibility — differentiates from influencer brands", detail:"Clinical positioning drives higher AOV and lower return rates." }, { title:"Perplexity citation established", detail:"Cited in Perplexity for dermat queries. Foundation to build ChatGPT citations from." }], weaknesses:[{ title:"Minimalist outranks on 28/35 shared keywords", detail:"Systematic content depth gap vs category leader." }], opportunities:[{ title:"Retinol education content — no authoritative Indian brand owns this", detail:"27K/mo 'best retinol India' with no clinical authority content. DermFirst is perfectly placed." }], threats:[{ title:"The Derma Co. accelerating content and paid investment", detail:"New content hub launched — 60+ articles in 90 days." }] }, signals:[{ dir:"up", text:"Perplexity citations increased 18% — now appearing for 6 dermat queries", ch:"ai", urgent:false }, { dir:"down", text:"Minimalist launched SPF campaign — 4 new rankings in shared keyword set", ch:"seo", urgent:true }], competitors:[], radarData:[], matrixData:[] };
MARKET_DATA.tg = { tier:"starter", cadence:"quarterly", lastUpdated:"Never", nextScheduled:"Pending audit", overallTrend:"unknown", position:{ rank:0, of:0, label:"No data — audit required" }, swot:{ strengths:[], weaknesses:[], opportunities:[], threats:[] }, signals:[], competitors:[], radarData:[], matrixData:[] };

const CLIENTS = [
  { id:"fb", name:"FreshBite Foods",   init:"FB", website:"freshbitefoods.com", faavi:72, phase:"bau"      },
  { id:"nb", name:"NutriBlend India",  init:"NB", website:"nutriblend.in",      faavi:61, phase:"launch"   },
  { id:"ch", name:"CraftHome Decor",   init:"CH", website:"crafthomedecor.com", faavi:53, phase:"audit"    },
  { id:"df", name:"DermFirst",         init:"DF", website:"dermfirst.in",       faavi:68, phase:"campaigns"},
  { id:"tg", name:"TerraGrow Organic", init:"TG", website:"terragrow.in",       faavi:44, phase:"audit"    },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
const scoreColor = s => s >= 70 ? T.green : s >= 50 ? T.amber : T.red;
const phaseColor = p => ({ audit:T.label, launch:T.amber, bau:T.accent, campaigns:T.green })[p] || T.sub;
const phaseLabel = p => ({ audit:"Audit", launch:"Launch", bau:"BAU", campaigns:"Campaigns" })[p] || p;
const tierColor  = t => ({ enterprise:T.purple, gold:T.purple, growth:T.accent, starter:T.label })[t] || T.sub;
const chLabel    = c => ({ aeo:"AEO", seo:"SEO", meo:"Maps", ai:"AI", reviews:"Reviews", social:"Social" })[c] || c;

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
  const b = { padding:"6px 14px", borderRadius:5, fontSize:10.5, fontWeight:500,
    cursor:disabled?"not-allowed":"pointer", fontFamily:"'Sora'", border:"none",
    display:"inline-flex", alignItems:"center", gap:6, opacity:disabled?0.35:1 };
  const v = {
    primary:{ background:T.accent, color:"#07080D", fontWeight:600 },
    ghost:  { background:T.hover,  color:T.sub, border:`1px solid ${T.border}` },
    subtle: { background:"transparent", color:T.label, border:`1px solid ${T.border}` },
  };
  return <button onClick={onClick} disabled={disabled}
    style={{...b,...(v[variant]||v.ghost),...style}}>{children}</button>;
}

// ── SWOT QUADRANT ─────────────────────────────────────────────────────────────
const SWOT_META = {
  strengths:   { label:"Strengths",    color:T.green  },
  weaknesses:  { label:"Weaknesses",   color:T.red    },
  opportunities:{ label:"Opportunities",color:T.accent },
  threats:     { label:"Threats",      color:T.amber  },
};

function SwotQuadrant({ type, items }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const meta = SWOT_META[type];
  if (!items) return null;
  return (
    <div style={{ borderRadius:8, border:`1px solid ${T.border}`,
      background:T.raised, overflow:"hidden" }}>
      {/* Header — always visible */}
      <div onClick={() => setOpen(!open)}
        style={{ padding:"14px 16px", cursor:"pointer", display:"flex",
          alignItems:"center", gap:10,
          borderBottom: open ? `1px solid ${T.border}` : "none" }}
        onMouseOver={e => e.currentTarget.style.background = T.hover}
        onMouseOut={e  => e.currentTarget.style.background = "transparent"}>
        <Dot color={meta.color} size={6} />
        <span style={{ fontSize:12, fontWeight:600, color:T.text, flex:1 }}>
          {meta.label}
        </span>
        <span style={{ fontSize:11, color:T.sub }}>{items.length}</span>
        <span style={{ fontSize:9, color:T.label }}>{open ? "▲" : "▼"}</span>
      </div>

      {/* Items — revealed on click */}
      {open && items.map((item, i) => (
        <div key={i}>
          <div onClick={() => setExpanded(expanded === i ? null : i)}
            style={{ padding:"12px 16px", cursor:"pointer",
              borderBottom:`1px solid ${T.border}`,
              display:"flex", alignItems:"flex-start", gap:10 }}
            onMouseOver={e => e.currentTarget.style.background = T.hover}
            onMouseOut={e  => e.currentTarget.style.background = "transparent"}>
            <span style={{ fontSize:9, color:meta.color, marginTop:3,
              flexShrink:0 }}>·</span>
            <span style={{ fontSize:11, color:T.text, flex:1, lineHeight:1.4 }}>
              {item.title}
            </span>
            <span style={{ fontSize:9, color:T.label, flexShrink:0 }}>
              {expanded === i ? "▲" : "▼"}
            </span>
          </div>
          {expanded === i && (
            <div style={{ padding:"10px 16px 12px 36px",
              borderBottom:`1px solid ${T.border}`,
              background:"rgba(255,255,255,0.012)" }}>
              <div style={{ fontSize:10.5, color:T.text, lineHeight:1.6 }}>
                {item.detail}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── COMPETITOR ROW ────────────────────────────────────────────────────────────
function CompetitorRow({ comp, clientScores }) {
  const [open, setOpen] = useState(false);
  const channels = ["aeo","seo","meo","ai","reviews","social"];
  const typeColor = { direct:T.red, indirect:T.amber, aspirational:T.sub };
  return (
    <div style={{ borderRadius:8, border:`1px solid ${T.border}`,
      background:T.raised, overflow:"hidden", marginBottom:8 }}>

      {/* Summary row */}
      <div onClick={() => setOpen(!open)}
        style={{ padding:"14px 16px", cursor:"pointer", display:"flex",
          alignItems:"center", gap:14 }}
        onMouseOver={e => e.currentTarget.style.background = T.hover}
        onMouseOut={e  => e.currentTarget.style.background = "transparent"}>
        <Av init={comp.logo} size={28} />
        <div style={{ flex:1 }}>
          <div style={{ fontSize:12, fontWeight:600, color:T.text,
            marginBottom:3 }}>{comp.name}</div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:9, color:typeColor[comp.type]||T.sub,
              fontWeight:600, textTransform:"uppercase" }}>{comp.type}</span>
            {/* Mini score comparison */}
            {channels.slice(0,4).map(ch => {
              const cs = clientScores?.[ch] || 0;
              const ts = comp.scores[ch] || 0;
              const diff = ts - cs;
              return (
                <span key={ch} style={{ fontSize:9, color:T.sub }}>
                  {chLabel(ch)}{" "}
                  <span style={{ color: diff > 0 ? T.red : diff < 0 ? T.green : T.sub,
                    fontWeight:600 }}>
                    {diff > 0 ? `+${diff}` : diff < 0 ? diff : "—"}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
        <span style={{ fontSize:9, color:T.label }}>{open ? "▲ less" : "▼ detail"}</span>
      </div>

      {/* Drill-down detail */}
      {open && (
        <>
          <Hr />
          <div style={{ padding:"16px 16px", display:"grid",
            gridTemplateColumns:"1fr 1fr", gap:20 }}>

            {/* Channel comparison */}
            <div>
              <Lbl style={{ display:"block", marginBottom:10 }}>Channel vs Client</Lbl>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {channels.map(ch => {
                  const cs = clientScores?.[ch] || 0;
                  const ts = comp.scores[ch] || 0;
                  const diff = ts - cs;
                  const max  = Math.max(cs, ts, 50);
                  return (
                    <div key={ch}>
                      <div style={{ display:"flex", justifyContent:"space-between",
                        marginBottom:4 }}>
                        <span style={{ fontSize:10, color:T.text }}>{chLabel(ch)}</span>
                        <span style={{ fontSize:10,
                          color: diff > 5 ? T.red : diff < -5 ? T.green : T.text }}>
                          Us {cs} · Them {ts}
                          {" "}
                          <span style={{ fontSize:9, fontWeight:600 }}>
                            ({diff > 0 ? "−" : "+"}{Math.abs(diff)})
                          </span>
                        </span>
                      </div>
                      <div style={{ display:"flex", gap:2, height:3 }}>
                        <div style={{ width:`${(cs/100)*50}%`, minWidth:2,
                          background:T.accent, borderRadius:1 }} />
                        <div style={{ width:`${(ts/100)*50}%`, minWidth:2,
                          background: diff > 0 ? T.red : T.green,
                          borderRadius:1 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Intel */}
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {[
                { label:"Vulnerabilities", items:comp.vulnerabilities, color:T.green },
                { label:"Recent Moves",    items:comp.recentMoves,     color:T.amber },
              ].map(({ label, items, color }) => (
                <div key={label}>
                  <Lbl style={{ display:"block", marginBottom:8 }}>{label}</Lbl>
                  <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                    {items.map((item, i) => (
                      <div key={i} style={{ display:"flex", gap:7,
                        alignItems:"flex-start" }}>
                        <span style={{ color, fontSize:9, marginTop:3,
                          flexShrink:0 }}>·</span>
                        <span style={{ fontSize:10.5, color:T.text,
                          lineHeight:1.45 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ padding:"10px 12px", borderRadius:6,
                border:`1px solid ${T.border}`, background:T.bg }}>
                <Lbl style={{ display:"block", marginBottom:5 }}>Recommendation</Lbl>
                <div style={{ fontSize:10.5, color:T.text, lineHeight:1.5 }}>
                  {comp.recommendation}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── GAP HEATMAP ───────────────────────────────────────────────────────────────
function GapHeatmap({ data, competitors }) {
  const channels = ["aeo","seo","meo","ai","reviews","social"];
  if (!competitors?.length) return (
    <div style={{ padding:"40px 20px", textAlign:"center",
      color:T.sub, fontSize:11 }}>No competitor data available.</div>
  );
  const cellColor = diff => {
    if (diff >= 10)  return { bg:`${T.red}22`,   text:T.red    };
    if (diff >= 5)   return { bg:`${T.amber}18`,  text:T.amber  };
    if (diff >= 0)   return { bg:"transparent",   text:T.sub    };
    if (diff >= -5)  return { bg:`${T.green}12`,  text:T.green  };
    return               { bg:`${T.green}22`,   text:T.green  };
  };
  const clientScores = data.competitors[0] ? {} : {};
  // Use radar data as source of truth
  const clientRow = {};
  channels.forEach(ch => {
    const r = data.radarData?.find(d => d.axis?.toLowerCase()?.includes(ch.replace("meo","map").replace("ai","ai")) || d.axis === chLabel(ch));
    clientRow[ch] = r ? (Object.values(r).find((v,i) => i > 0 && typeof v === "number" && Object.keys(r)[i] !== Object.keys(r).find(k => k !== "axis" && competitors.some(c => c.name === k))) || 0) : 0;
  });
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", minWidth:500 }}>
        <thead>
          <tr>
            <th style={{ padding:"8px 14px", textAlign:"left", fontSize:9,
              color:T.label, fontWeight:600, textTransform:"uppercase",
              letterSpacing:"0.07em", borderBottom:`1px solid ${T.border}` }}>
              Channel
            </th>
            {competitors.map(c => (
              <th key={c.id} style={{ padding:"8px 14px", textAlign:"center",
                fontSize:9, color:T.label, fontWeight:600, textTransform:"uppercase",
                letterSpacing:"0.07em", borderBottom:`1px solid ${T.border}` }}>
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {channels.map((ch, ri) => {
            const radarEntry = data.radarData?.find(r =>
              r.axis && (r.axis.toLowerCase() === chLabel(ch).toLowerCase() ||
                ch === "meo" && r.axis === "Maps" || ch === "ai" && r.axis === "AI" ||
                ch === "reviews" && r.axis === "Reviews"));
            const clientScore = radarEntry
              ? (radarEntry["FreshBite"] || radarEntry["NutriBlend"] || radarEntry["DermFirst"] || 0)
              : 0;
            return (
              <tr key={ch}>
                <td style={{ padding:"10px 14px", fontSize:11, color:T.text,
                  fontWeight:500, borderBottom:`1px solid ${T.border}` }}>
                  {chLabel(ch)}
                  {clientScore > 0 && (
                    <span style={{ fontSize:9, color:T.sub, marginLeft:6 }}>
                      ({clientScore})
                    </span>
                  )}
                </td>
                {competitors.map(c => {
                  const ts = c.scores[ch] || 0;
                  const diff = ts - (clientScore || 0);
                  const col = cellColor(diff);
                  return (
                    <td key={c.id} style={{ padding:"10px 14px", textAlign:"center",
                      background:col.bg, borderBottom:`1px solid ${T.border}` }}>
                      <div style={{ fontSize:11, fontWeight:600, color:col.text }}>
                        {ts > 0 ? ts : "—"}
                      </div>
                      {ts > 0 && diff !== 0 && (
                        <div style={{ fontSize:8.5, color:col.text, opacity:0.8 }}>
                          {diff > 0 ? `+${diff}` : diff}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── CUSTOM RADAR TOOLTIP ──────────────────────────────────────────────────────
const RadarTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:T.raised, border:`1px solid ${T.borderMid}`,
      borderRadius:5, padding:"8px 12px", fontSize:10 }}>
      {payload.map((p, i) => (
        <div key={i} style={{ color:p.color, marginBottom:2 }}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

// ── VISUALISATIONS TAB ────────────────────────────────────────────────────────
function VisualisationsTab({ data }) {
  if (!data.radarData?.length) return (
    <div style={{ padding:"48px 20px", textAlign:"center", color:T.sub, fontSize:11 }}>
      No data available — run audit first.
    </div>
  );
  const RADAR_COLORS = [T.accent, T.red, T.amber, T.purple];
  const radarKeys = data.radarData[0]
    ? Object.keys(data.radarData[0]).filter(k => k !== "axis")
    : [];
  return (
    <div style={{ padding:"20px", display:"flex", flexDirection:"column", gap:28 }}>

      {/* Competitor Radar */}
      <div>
        <div style={{ marginBottom:16 }}>
          <Lbl>Competitor Radar</Lbl>
          <span style={{ fontSize:9.5, color:T.sub, marginLeft:8 }}>
            Channel scores — client vs tracked competitors
          </span>
        </div>
        <div style={{ height:300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data.radarData}
              style={{ fontFamily:"'Sora'" }}>
              <PolarGrid stroke={T.border} strokeDasharray="3 3" />
              <PolarAngleAxis dataKey="axis"
                tick={{ fill:T.sub, fontSize:10, fontFamily:"'Sora'" }} />
              <PolarRadiusAxis domain={[0,100]} tick={false} axisLine={false} />
              {radarKeys.map((key, i) => (
                <Radar key={key} name={key} dataKey={key}
                  stroke={RADAR_COLORS[i] || T.sub}
                  fill={RADAR_COLORS[i] || T.sub}
                  fillOpacity={0.06}
                  strokeWidth={1.5} />
              ))}
              <Legend
                wrapperStyle={{ fontSize:10, fontFamily:"'Sora'", paddingTop:8 }}
                iconSize={8}
                iconType="circle" />
              <Tooltip content={<RadarTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <Hr />

      {/* Leadership Matrix */}
      {data.matrixData?.length > 0 && (
        <div>
          <div style={{ marginBottom:16 }}>
            <Lbl>Visibility Leadership Matrix</Lbl>
            <span style={{ fontSize:9.5, color:T.sub, marginLeft:8 }}>
              X: Overall FAAVI · Y: AEO strength · Bubble: relative market presence
            </span>
          </div>
          <div style={{ height:260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart style={{ fontFamily:"'Sora'" }}
                margin={{ top:10, right:20, bottom:20, left:0 }}>
                <XAxis type="number" dataKey="x" domain={[20,100]}
                  tick={{ fill:T.sub, fontSize:9 }}
                  label={{ value:"Overall Visibility", position:"bottom",
                    fill:T.label, fontSize:9, fontFamily:"'Sora'" }} />
                <YAxis type="number" dataKey="y" domain={[20,100]}
                  tick={{ fill:T.sub, fontSize:9 }}
                  label={{ value:"AEO Score", angle:-90, position:"insideLeft",
                    fill:T.label, fontSize:9, fontFamily:"'Sora'" }} />
                <ZAxis type="number" dataKey="z" range={[40,200]} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={{ background:T.raised, border:`1px solid ${T.borderMid}`,
                        borderRadius:5, padding:"8px 12px", fontSize:10 }}>
                        <div style={{ color:T.text, fontWeight:600, marginBottom:3 }}>{d.name}</div>
                        <div style={{ color:T.sub }}>Visibility {d.x} · AEO {d.y}</div>
                      </div>
                    );
                  }}
                />
                <Scatter data={data.matrixData} isAnimationActive={false}>
                  {data.matrixData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} fillOpacity={0.6} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div style={{ display:"flex", gap:14, marginTop:8, flexWrap:"wrap" }}>
            {data.matrixData.map(d => (
              <div key={d.name} style={{ display:"flex", alignItems:"center", gap:5 }}>
                <Dot color={d.color} size={6} />
                <span style={{ fontSize:9.5, color:T.text }}>{d.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── FETCH MODAL ───────────────────────────────────────────────────────────────
const FETCH_CONTEXTS = [
  { id:"general",   label:"General refresh",      desc:"Routine competitive update" },
  { id:"meeting",   label:"Pre-meeting brief",     desc:"Quick snapshot before client call" },
  { id:"campaign",  label:"Campaign tracking",     desc:"Track competitive response to active campaign" },
  { id:"upsell",    label:"Upsell opportunity",    desc:"Build case for expanded engagement" },
];

const FETCH_STAGES = [
  "Scanning competitor channels…",
  "Comparing visibility scores…",
  "Identifying position changes…",
  "Generating delta analysis…",
];

function FetchModal({ onClose, showToast }) {
  const [ctx,      setCtx]      = useState("general");
  const [stage,    setStage]    = useState(-1);
  const [done,     setDone]     = useState(false);

  const run = () => {
    setStage(0);
    let s = 0;
    const iv = setInterval(() => {
      s++; setStage(s);
      if (s >= FETCH_STAGES.length - 1) {
        clearInterval(iv);
        setTimeout(() => setDone(true), 400);
      }
    }, 500);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)",
      zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width:440, background:T.surface, borderRadius:10,
        border:`1px solid ${T.borderMid}`, overflow:"hidden" }}>

        <div style={{ padding:"16px 18px", borderBottom:`1px solid ${T.border}`,
          display:"flex", alignItems:"center" }}>
          <span style={{ fontSize:13, fontWeight:600, color:T.text, flex:1 }}>
            Fetch Current Standing
          </span>
          <button onClick={onClose}
            style={{ background:"transparent", border:"none",
              color:T.sub, fontSize:14, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ padding:"18px" }}>
          {!done && stage < 0 && (
            <>
              <div style={{ marginBottom:14 }}>
                <Lbl style={{ display:"block", marginBottom:10 }}>Context</Lbl>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {FETCH_CONTEXTS.map(c => (
                    <div key={c.id} onClick={() => setCtx(c.id)}
                      style={{ display:"flex", alignItems:"center", gap:10,
                        padding:"10px 12px", borderRadius:6, cursor:"pointer",
                        border:`1px solid ${ctx === c.id ? T.accent+"40" : T.border}`,
                        background: ctx === c.id ? `${T.accent}08` : T.raised }}>
                      <div style={{ width:14, height:14, borderRadius:"50%", flexShrink:0,
                        border:`1.5px solid ${ctx === c.id ? T.accent : T.border}`,
                        display:"flex", alignItems:"center", justifyContent:"center" }}>
                        {ctx === c.id && (
                          <div style={{ width:6, height:6, borderRadius:"50%",
                            background:T.accent }} />
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize:11, fontWeight:500, color:T.text }}>
                          {c.label}
                        </div>
                        <div style={{ fontSize:9.5, color:T.sub }}>{c.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <Btn variant="primary" onClick={run}
                style={{ width:"100%", justifyContent:"center", fontSize:10.5 }}>
                Fetch Now →
              </Btn>
            </>
          )}

          {stage >= 0 && !done && (
            <div style={{ padding:"8px 0", display:"flex",
              flexDirection:"column", gap:8 }}>
              {FETCH_STAGES.map((s, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8,
                  fontSize:10.5,
                  color: i < stage ? T.sub : i === stage ? T.text : T.label }}>
                  <span style={{ fontSize:10, color: i < stage ? T.green : i === stage ? T.accent : T.mute }}>
                    {i < stage ? "✓" : i === stage ? "◎" : "○"}
                  </span>
                  {s}
                </div>
              ))}
            </div>
          )}

          {done && (
            <div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:600, color:T.green, marginBottom:4 }}>
                  ✓ Snapshot updated
                </div>
                <div style={{ fontSize:9.5, color:T.sub }}>Changes since last fetch:</div>
              </div>
              {[
                { dir:"down", text:"Yoga Bar published 3 new AEO articles — snippet gap increasing" },
                { dir:"up",   text:"FreshBite review score held at 4.4★ — Happilo dropped to 4.2★" },
                { dir:"flat", text:"AI presence unchanged — no new citations for FreshBite" },
              ].map((item, i) => (
                <div key={i} style={{ display:"flex", gap:8, padding:"8px 0",
                  borderBottom:`1px solid ${T.border}`, alignItems:"flex-start" }}>
                  <span style={{ fontSize:10, flexShrink:0,
                    color: item.dir==="down" ? T.red : item.dir==="up" ? T.green : T.sub }}>
                    {item.dir==="down" ? "▼" : item.dir==="up" ? "▲" : "—"}
                  </span>
                  <span style={{ fontSize:10.5, color:T.text }}>{item.text}</span>
                </div>
              ))}
              <div style={{ marginTop:14 }}>
                <Btn variant="primary" onClick={() => { showToast("Snapshot applied"); onClose(); }}
                  style={{ width:"100%", justifyContent:"center", fontSize:10.5 }}>
                  Apply to Report
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MARKET POSITION DETAIL ────────────────────────────────────────────────────
const TABS = [
  { id:"overview",     label:"Overview"      },
  { id:"competitors",  label:"Competitors"   },
  { id:"gaps",         label:"Gap Analysis"  },
  { id:"visuals",      label:"Visualisations"},
];

function MarketDetail({ client, data, showToast }) {
  const [tab,       setTab]       = useState("overview");
  const [showFetch, setShowFetch] = useState(false);

  if (!data) return (
    <div style={{ flex:1, display:"flex", alignItems:"center",
      justifyContent:"center", color:T.sub, fontSize:11 }}>
      No market data available.
    </div>
  );

  const noData = data.overallTrend === "unknown";

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

      {/* Sub-header */}
      <div style={{ padding:"14px 24px 0", borderBottom:`1px solid ${T.border}`,
        flexShrink:0, background:T.surface }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>

          {/* Tier + cadence */}
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:9, fontWeight:700, textTransform:"uppercase",
              color:tierColor(data.tier),
              padding:"2px 8px", borderRadius:3,
              border:`1px solid ${tierColor(data.tier)}30`,
              background:`${tierColor(data.tier)}10` }}>
              {data.tier}
            </span>
            <span style={{ fontSize:9.5, color:T.sub }}>
              Updates {data.cadence}
            </span>
            {!noData && (
              <>
                <span style={{ color:T.mute }}>·</span>
                <span style={{ fontSize:9.5, color:T.sub }}>
                  Last: {data.lastUpdated}
                </span>
                <span style={{ color:T.mute }}>·</span>
                <span style={{ fontSize:9.5, color:T.sub }}>
                  Next: {data.nextScheduled}
                </span>
              </>
            )}
          </div>

          <div style={{ flex:1 }} />

          {!noData && (
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:9.5, color:T.sub }}>
                Rank {data.position.rank} of {data.position.of}
              </span>
              <span style={{ color:T.mute }}>·</span>
              <span style={{ fontSize:9.5, color:
                data.overallTrend==="improving" ? T.green :
                data.overallTrend==="declining" ? T.red : T.sub }}>
                {data.overallTrend==="improving" ? "▲ Improving" :
                 data.overallTrend==="declining" ? "▼ Declining" : "→ Stable"}
              </span>
              <span style={{ color:T.mute }}>·</span>
              <span style={{ fontSize:9.5, color:T.sub }}>{data.position.label}</span>
            </div>
          )}

          <Btn variant="ghost" onClick={() => setShowFetch(true)}
            style={{ fontSize:9.5, padding:"4px 12px" }}>
            Fetch ↺
          </Btn>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:2 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding:"7px 14px", background:"transparent", border:"none",
              borderBottom:`2px solid ${tab===t.id ? T.accent : "transparent"}`,
              color:tab===t.id ? T.accent : T.sub,
              fontSize:10.5, fontWeight:500, fontFamily:"'Sora'",
              cursor:"pointer", transition:"all 0.12s" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex:1, overflowY:"auto" }}>

        {noData ? (
          <div style={{ padding:"48px 24px", textAlign:"center" }}>
            <div style={{ fontSize:22, color:T.mute, marginBottom:12 }}>◎</div>
            <div style={{ fontSize:12, fontWeight:600, color:T.sub, marginBottom:6 }}>
              No market data
            </div>
            <div style={{ fontSize:10.5, color:T.label, maxWidth:300, margin:"0 auto 18px" }}>
              Complete the baseline audit first. Market position analysis requires channel scores and competitor data.
            </div>
            <Btn variant="primary">Go to Audit Centre →</Btn>
          </div>
        ) : tab === "overview" ? (
          <div style={{ padding:"24px" }}>

            {/* Top signals */}
            {data.signals?.length > 0 && (
              <div style={{ marginBottom:28 }}>
                <div style={{ marginBottom:12 }}>
                  <Lbl>Signals</Lbl>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {data.signals.map((sig, i) => (
                    <div key={i} style={{ display:"flex", gap:10,
                      alignItems:"flex-start", padding:"10px 14px",
                      borderRadius:7, border:`1px solid ${T.border}`,
                      background: sig.urgent ? `${T.red}06` : T.raised }}>
                      <span style={{ fontSize:11, flexShrink:0,
                        color: sig.dir==="down" ? T.red : sig.dir==="up" ? T.green : T.sub }}>
                        {sig.dir==="down" ? "▼" : sig.dir==="up" ? "▲" : "—"}
                      </span>
                      <span style={{ fontSize:11, color:T.text, flex:1, lineHeight:1.45 }}>
                        {sig.text}
                      </span>
                      <span style={{ fontSize:9, color:T.label,
                        flexShrink:0, alignSelf:"center" }}>
                        {chLabel(sig.ch)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SWOT */}
            <div style={{ marginBottom:12 }}>
              <Lbl>SWOT — click to expand</Lbl>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {Object.keys(SWOT_META).map(type => (
                <SwotQuadrant key={type} type={type}
                  items={data.swot[type]} />
              ))}
            </div>
          </div>

        ) : tab === "competitors" ? (
          <div style={{ padding:"24px" }}>
            {data.competitors?.length ? (
              <>
                <div style={{ marginBottom:14 }}>
                  <Lbl>Tracked Competitors — click to drill down</Lbl>
                </div>
                {data.competitors.map(comp => {
                  const rd = data.radarData?.[0];
                  const clientKey = rd ? Object.keys(rd).find(k => k !== "axis") : null;
                  const clientScores = {};
                  if (clientKey) {
                    ["aeo","seo","meo","ai","reviews","social"].forEach(ch => {
                      const entry = data.radarData?.find(r => r.axis === chLabel(ch) ||
                        (ch==="meo"&&r.axis==="Maps") || (ch==="ai"&&r.axis==="AI") ||
                        (ch==="reviews"&&r.axis==="Reviews"));
                      clientScores[ch] = entry?.[clientKey] || 0;
                    });
                  }
                  return (
                    <CompetitorRow key={comp.id} comp={comp} clientScores={clientScores} />
                  );
                })}
              </>
            ) : (
              <div style={{ padding:"40px", textAlign:"center", color:T.sub, fontSize:11 }}>
                No competitor data. Run audit to populate.
              </div>
            )}
          </div>

        ) : tab === "gaps" ? (
          <div style={{ padding:"24px" }}>
            <div style={{ marginBottom:14 }}>
              <Lbl>Gap Heatmap</Lbl>
              <span style={{ fontSize:9.5, color:T.sub, marginLeft:8 }}>
                Competitor score vs client — red = they lead, green = we lead
              </span>
            </div>
            <div style={{ borderRadius:8, border:`1px solid ${T.border}`,
              background:T.raised, overflow:"hidden" }}>
              <GapHeatmap data={data} competitors={data.competitors} />
            </div>
          </div>

        ) : tab === "visuals" ? (
          <VisualisationsTab data={data} />
        ) : null}
      </div>

      {showFetch && (
        <FetchModal onClose={() => setShowFetch(false)} showToast={showToast} />
      )}
    </div>
  );
}

// ── CLIENT CARD ───────────────────────────────────────────────────────────────
function ClientCard({ client, data, selected, onClick }) {
  const trend = data?.overallTrend;
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
        <span style={{ fontSize:9, color:
          trend==="improving" ? T.green : trend==="declining" ? T.red : T.sub }}>
          {trend==="improving" ? "▲" : trend==="declining" ? "▼" : "—"}
        </span>
      </div>
      <div style={{ fontSize:9.5, color:T.sub, marginBottom:6 }}>{client.website}</div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <Dot color={phaseColor(client.phase)} />
        <span style={{ fontSize:9.5, color:T.sub }}>{phaseLabel(client.phase)}</span>
        {data && (
          <>
            <span style={{ color:T.mute }}>·</span>
            <span style={{ fontSize:9, color:tierColor(data.tier) }}>
              {data.cadence}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function MarketPosition() {
  const [selected, setSelected] = useState("fb");
  const [toast,    setToast]    = useState(null);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2600); };
  const client = CLIENTS.find(c => c.id === selected);
  const data   = MARKET_DATA[selected];

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
              color:T.text, margin:0, fontStyle:"italic" }}>Market Position</h1>
            <div style={{ marginTop:2 }}>
              <Lbl>Module 3 · Competitive Intelligence · Who is winning and why?</Lbl>
            </div>
          </div>
          <div style={{ flex:1 }} />
          <div style={{ display:"flex", gap:20, marginRight:16 }}>
            {[
              { l:"Tracked clients", v:CLIENTS.length },
              { l:"Improving",       v:Object.values(MARKET_DATA).filter(d=>d?.overallTrend==="improving").length, c:T.green },
              { l:"Declining",       v:Object.values(MARKET_DATA).filter(d=>d?.overallTrend==="declining").length, c:T.red   },
            ].map(s => (
              <div key={s.l} style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                <span style={{ fontSize:18, fontWeight:600,
                  color:s.c||T.sub, lineHeight:1 }}>{s.v}</span>
                <span style={{ fontSize:9, color:T.label }}>{s.l}</span>
              </div>
            ))}
          </div>
          <Btn variant="primary">Export Report</Btn>
        </div>
      </div>

      {/* BODY */}
      <div style={{ display:"flex", flex:1, minHeight:0 }}>
        <div style={{ width:260, flexShrink:0, borderRight:`1px solid ${T.border}`,
          overflowY:"auto", padding:"10px 8px" }}>
          {CLIENTS.map(c => (
            <ClientCard key={c.id} client={c} data={MARKET_DATA[c.id]}
              selected={selected === c.id}
              onClick={() => setSelected(c.id)} />
          ))}
        </div>
        <div style={{ flex:1, minWidth:0, overflow:"hidden" }}>
          {client && (
            <MarketDetail client={client} data={data} showToast={showToast} />
          )}
        </div>
      </div>

    </div>
  );
}
