/**
 * 5th Avenue — Internal OS
 * Module 4: Recommendations Hub — aesthetic overhaul
 * ─────────────────────────────────────────────────────────────────
 * Two streams: RISKS · OPPORTUNITIES
 * Priority = (Impact × Confidence) ÷ Effort
 * Cleaner cards, proper negative space, refined develop drawer.
 */

import { useState, useMemo } from "react";

import { T } from "../../theme/tokens";

const TEAM = [
  { id:"t1", name:"Priya Nair",  init:"PN" },
  { id:"t2", name:"Vikram Das",  init:"VD" },
  { id:"t3", name:"Arjun Reddy", init:"AR" },
  { id:"t4", name:"Sneha Iyer",  init:"SI" },
  { id:"t5", name:"Meera Joshi", init:"MJ" },
  { id:"t6", name:"Karan Shah",  init:"KS" },
];

const CLIENTS = [
  { id:"fb", name:"FreshBite Foods",   init:"FB", website:"freshbitefoods.com", faavi:72, phase:"bau"      },
  { id:"nb", name:"NutriBlend India",  init:"NB", website:"nutriblend.in",      faavi:61, phase:"launch"   },
  { id:"ch", name:"CraftHome Decor",   init:"CH", website:"crafthomedecor.com", faavi:53, phase:"audit"    },
  { id:"df", name:"DermFirst",         init:"DF", website:"dermfirst.in",       faavi:68, phase:"campaigns"},
  { id:"tg", name:"TerraGrow Organic", init:"TG", website:"terragrow.in",       faavi:44, phase:"audit"    },
];

const DEV_TEMPLATES = {
  aeo:    { type:"AEO Content Package",       owner:"t4", time:"5–7 days",
    deliverables:["FAQ schema markup for all product pages","Featured snippet content targets","Structured data implementation guide","QA checklist for Search Console"] },
  seo:    { type:"SEO Content Brief",         owner:"t5", time:"7–14 days",
    deliverables:["Keyword cluster map","Pillar page briefs ×3","Internal link architecture","Technical fix priority list"] },
  meo:    { type:"Local Optimisation Package",owner:"t5", time:"2–5 days",
    deliverables:["GBP claim + optimisation checklist","Review acquisition plan","Local citation audit","Photo brief"] },
  ai:     { type:"AI Citation Campaign",      owner:"t6", time:"14–21 days",
    deliverables:["Expert comparison article briefs ×3","Brand entity definition page","Authority publication seeding plan","FAQ hub structure"] },
  reviews:{ type:"Review Growth Programme",   owner:"t5", time:"7–14 days",
    deliverables:["Response template library","Review acquisition workflow","Monitoring setup guide","Sentiment tracking brief"] },
  social: { type:"Social Content Strategy",   owner:"t6", time:"10–14 days",
    deliverables:["Content pillar framework","60-day content calendar","Format testing brief","Platform tone guidelines"] },
  default:{ type:"Work Package",              owner:"t2", time:"7–14 days",
    deliverables:["Strategy brief","Implementation plan","KPI framework","Timeline + owners"] },
};

const ALL_RECS = [
  { id:"r01",cid:"fb",stream:"risk",ch:"aeo",src:"audit",   imp:9,eff:1,conf:9,owner:"t4",status:"open",daysOpen:18,
    title:"No FAQ schema on any of 14 product pages",
    issue:"Zero structured data across all product pages. Yoga Bar has FAQ schema on 11 of 12.",
    insight:"Without schema FreshBite cannot win featured snippets or AI answer boxes regardless of content quality.",
    recommendation:"Implement FAQ + Product schema on all 14 pages. Est. 4–6 snippet wins within 45 days." },
  { id:"r02",cid:"fb",stream:"risk",ch:"ai",src:"audit",    imp:9,eff:3,conf:8,owner:"t4",status:"open",daysOpen:18,
    title:"Brand absent from ChatGPT, Perplexity and Gemini for all category queries",
    issue:"Query testing across 5 platforms: FreshBite cited zero times. Happilo cited in all 5.",
    insight:"AI search share growing 40% YoY. Brand absence now compounds as competitor associations solidify.",
    recommendation:"Build citation strategy: 3 expert comparison articles, FAQ pages, seed on 5 authority publications." },
  { id:"r03",cid:"fb",stream:"risk",ch:"seo",src:"audit",   imp:8,eff:5,conf:9,owner:"t5",status:"develop",daysOpen:24,
    title:"Core Web Vitals failing on mobile — LCP 4.2s vs 2.5s threshold",
    issue:"Mobile LCP 4.2s, FID 180ms, CLS 0.22. All three fail. Mobile = 71% of organic traffic.",
    insight:"Confirmed ranking factor. Failing mobile scores suppress all mobile query rankings.",
    recommendation:"Optimise images to WebP, reduce JS bundle, fix CLS. Target LCP < 2.5s." },
  { id:"r04",cid:"fb",stream:"risk",ch:"seo",src:"audit",   imp:8,eff:5,conf:9,owner:"t6",status:"open",daysOpen:18,
    title:"3 content cluster pages missing — 22K/mo combined search volume",
    issue:"'Healthy office snacks', 'snacks for weight loss', 'high protein snacks India' — no FreshBite pages.",
    insight:"Commercial-intent queries in FreshBite's exact category. Compounds monthly as competitor pages age.",
    recommendation:"Create 3 pillar content pages with internal link architecture and schema." },
  { id:"r05",cid:"fb",stream:"risk",ch:"meo",src:"audit",   imp:6,eff:2,conf:8,owner:"t5",status:"open",daysOpen:18,
    title:"2 distribution partner branches unclaimed on Google Maps",
    issue:"Koramangala and Bandra partner locations unclaimed. Competitors can flag inaccuracies.",
    insight:"Unclaimed listings can't be managed or monitored. Maps data feeds AI local recommendations.",
    recommendation:"Claim via GBP bulk verification. Add photos, hours, categories and Q&A within 48 hours." },
  { id:"r06",cid:"fb",stream:"risk",ch:"reviews",src:"audit",imp:7,eff:4,conf:8,owner:"t5",status:"open",daysOpen:18,
    title:"Review response rate 22% — 12 negative reviews unanswered for 6+ months",
    issue:"127 reviews, 28 responded. 12 negative unresponded. Oldest: 6 months ago.",
    insight:"Response rate is a GBP quality signal. Unanswered negatives are the highest-trust-cost item visible to buyers.",
    recommendation:"Respond to all reviews within 14 days. Deploy template library. Set weekly monitoring alert." },
  { id:"r07",cid:"fb",stream:"opportunity",ch:"aeo",src:"market",imp:7,eff:3,conf:7,owner:"t4",status:"open",daysOpen:5,
    title:"6 featured snippet vacancies in low-sugar snack queries — low competition",
    issue:"6 queries (24K/mo combined) with no dominant snippet owner. Answer quality is poor across all.",
    insight:"Vacancies are temporary. FreshBite has product authority to own these within 45–60 days.",
    recommendation:"Create 6 structured FAQ articles with Answer Box optimisation for these queries." },
  { id:"r08",cid:"fb",stream:"opportunity",ch:"ai",src:"intelligence",imp:7,eff:2,conf:7,owner:"t6",status:"open",daysOpen:5,
    title:"Perplexity quick win — one article could trigger citation within 30 days",
    issue:"Perplexity refreshes citations frequently. One well-structured comparison article could appear within 30 days.",
    insight:"Fastest-moving AI platform for new citations. Lowest effort, fastest return AI win available right now.",
    recommendation:"Publish one 2,000-word expert comparison article with structured data. Target Perplexity first." },
  { id:"r09",cid:"fb",stream:"opportunity",ch:"social",src:"market",imp:8,eff:6,conf:6,owner:"t6",status:"open",daysOpen:5,
    title:"YouTube snack education niche — zero dominant Indian brand",
    issue:"No Indian snack brand has a YouTube channel with >10K subscribers in health snack education.",
    insight:"First-mover advantage window open. YouTube authority compounds — also an SEO asset and AI citation source.",
    recommendation:"Launch YouTube content strategy: 8 videos in 90 days, snack education + taste test format." },
  { id:"r10",cid:"fb",stream:"opportunity",ch:"reviews",src:"audit",imp:5,eff:2,conf:8,owner:"t5",status:"open",daysOpen:5,
    title:"4.4★ review average — untapped trust and conversion asset",
    issue:"Strong review score but rarely surfaced on product pages, ads, or AI-indexed content.",
    insight:"Social proof at this quality level is a conversion multiplier most brands underutilise.",
    recommendation:"Build review showcase on homepage and product pages. Feed top reviews into structured data." },
  { id:"r11",cid:"nb",stream:"risk",ch:"ai",src:"audit",   imp:9,eff:3,conf:8,owner:"t1",status:"open",daysOpen:42,
    title:"Brand completely absent from all AI platform responses",
    issue:"10 queries tested. NutriBlend cited zero times. MuscleBlaze cited in 8 of 10.",
    insight:"NutriBlend is invisible at the highest-intent purchase moment. Gap compounds with each month of delay.",
    recommendation:"AI citation strategy: 3 expert comparison articles, clinical citations, brand entity page, authority seeding." },
  { id:"r12",cid:"nb",stream:"risk",ch:"seo",src:"audit",  imp:8,eff:5,conf:9,owner:"t3",status:"open",daysOpen:42,
    title:"Domain authority DA 18 — MuscleBlaze DA 52, Myprotein DA 61",
    issue:"Cannot compete for competitive keywords regardless of content quality. Root structural disadvantage.",
    insight:"DA gap is the root cause of most NutriBlend ranking failures. Requires sustained link-building programme.",
    recommendation:"20 high-quality backlinks in 90 days: fitness publications, nutrition blogs, ingredient suppliers." },
  { id:"r15",cid:"ch",stream:"risk",ch:"meo",src:"audit",  imp:8,eff:1,conf:9,owner:"t2",status:"open",daysOpen:67,
    title:"Physical showroom unclaimed on Google Maps — invisible to local search",
    issue:"GBP not found as claimed business. Pepperfry has 3 claimed listings within 5km.",
    insight:"15-minute fix with months of compounding local SEO benefit. Also affects AI local recommendations.",
    recommendation:"Claim GBP immediately. Add photos, categories, hours, respond to all reviews." },
  { id:"r17",cid:"ch",stream:"opportunity",ch:"social",src:"market",imp:7,eff:2,conf:7,owner:"t6",status:"open",daysOpen:7,
    title:"Pinterest untapped — home decor is Pinterest's highest-traffic category globally",
    issue:"CraftHome has zero Pinterest presence despite it driving 8× referral traffic vs other channels for home decor.",
    insight:"Zero investment, high organic reach, long content lifespan. Traffic within 90 days.",
    recommendation:"Launch Pinterest: 3 boards, 30 initial pins, 5 pins/week. Optimise descriptions for SEO." },
  { id:"r18",cid:"df",stream:"risk",ch:"seo",src:"audit",  imp:9,eff:5,conf:9,owner:"t3",status:"open",daysOpen:9,
    title:"Competitor Minimalist outranks on 28 of 35 shared tracked keywords",
    issue:"Average position gap: 6.2 positions. Systematic underperformance across all shared keywords.",
    insight:"Domain authority + content depth deficit. Requires a sustained programme, not individual fixes.",
    recommendation:"6-month content programme targeting the 28 underperforming keywords. Start with top 10 by volume." },
  { id:"r19",cid:"df",stream:"opportunity",ch:"ai",src:"intelligence",imp:7,eff:3,conf:7,owner:"t4",status:"open",daysOpen:9,
    title:"Cited in Perplexity — 5 expert articles could unlock ChatGPT citations within 60 days",
    issue:"DermFirst cited in Perplexity for dermat queries. ChatGPT requires additional authority signals.",
    insight:"Partial citation means right signals exist but insufficient. Building on Perplexity authority is far easier than starting from zero.",
    recommendation:"Commission 5 expert-authored, clinically-cited skincare articles. Target dermatology publications." },
  { id:"r20",cid:"tg",stream:"risk",ch:"aeo",src:"audit",  imp:10,eff:2,conf:9,owner:"t3",status:"open",daysOpen:91,
    title:"No baseline audit completed — all downstream planning blocked",
    issue:"Client onboarded 91 days ago. No diagnostic data, FAAVI score, or channel benchmarks exist.",
    insight:"Every recommendation made without audit data is an assumption. Everything else is blocked on this.",
    recommendation:"Complete full baseline audit within 7 days. Prioritise: SEO, AI presence, Maps, Reviews." },
];

const pri        = r  => +((r.imp * r.conf) / r.eff).toFixed(1);
const scoreColor = s  => s >= 70 ? T.green : s >= 50 ? T.amber : T.red;
const priColor   = p  => p >= 40 ? T.red : p >= 18 ? T.amber : T.text;
const phaseColor = p  => ({ audit:T.label, launch:T.amber, bau:T.accent, campaigns:T.green })[p] || T.sub;
const phaseLabel = p  => ({ audit:"Audit", launch:"Launch", bau:"BAU", campaigns:"Campaigns" })[p] || p;
const chLabel    = c  => ({ aeo:"AEO", seo:"SEO", meo:"Maps", ai:"AI", reviews:"Reviews", social:"Social", pr:"PR", influencer:"Influencer" })[c] || c?.toUpperCase();
const chColor    = c  => ({ aeo:T.accent, seo:T.green, meo:T.amber, ai:T.purple, reviews:"#C47ABF", social:"#4ADE80" })[c] || T.sub;
const statusColor= s  => ({ open:T.text, develop:T.accent, project:T.green, done:T.sub, archived:T.mute, monitor:T.purple })[s] || T.sub;
const statusLabel= s  => ({ open:"Open", develop:"In Develop", project:"In Project", done:"Done", archived:"Archived", monitor:"Monitoring" })[s] || s;
const getTeam    = id => TEAM.find(t => t.id === id);
const devTpl     = ch => DEV_TEMPLATES[ch] || DEV_TEMPLATES.default;

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
    danger: { background:"transparent", color:T.red, border:`1px solid ${T.red}22` },
  };
  return <button onClick={onClick} disabled={disabled}
    style={{...b,...(v[variant]||v.ghost),...style}}>{children}</button>;
}

// ── DEVELOP DRAWER ────────────────────────────────────────────────────────────
const GEN_STAGES = ["Analysing recommendation…","Selecting package type…","Generating deliverables…","Assigning owner…"];
function DevelopDrawer({ rec, onClose, onSave, showToast }) {
  const [stage, setStage] = useState(0);
  const [done,  setDone]  = useState(false);
  const tpl   = devTpl(rec?.ch);
  const owner = getTeam(tpl?.owner);

  useState(() => {
    if (!rec) return;
    let s = 0;
    const iv = setInterval(() => {
      s++; setStage(s);
      if (s >= GEN_STAGES.length - 1) {
        clearInterval(iv);
        setTimeout(() => setDone(true), 380);
      }
    }, 420);
    return () => clearInterval(iv);
  }, [rec]);

  if (!rec) return null;
  const p = pri(rec);
  return (
    <div style={{ borderTop:`1px solid ${T.borderMid}`, background:T.surface,
      flexShrink:0, height:288, display:"flex", flexDirection:"column",
      overflow:"hidden" }}>
      {/* Drawer header */}
      <div style={{ padding:"10px 18px", borderBottom:`1px solid ${T.border}`,
        display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        <span style={{ fontSize:9.5, color:T.label }}>Developing</span>
        <span style={{ fontSize:10, fontWeight:600, color:T.text, flex:1,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {rec.title}
        </span>
        <span style={{ fontSize:9, color:chColor(rec.ch), fontWeight:700,
          textTransform:"uppercase" }}>{chLabel(rec.ch)}</span>
        <span style={{ color:T.mute }}>·</span>
        <span style={{ fontSize:9, color:priColor(p), fontWeight:700 }}>P {p}</span>
        <button onClick={onClose} style={{ background:"transparent", border:"none",
          color:T.sub, fontSize:14, cursor:"pointer", marginLeft:4 }}>✕</button>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"14px 18px",
        display:"flex", gap:22 }}>
        {!done ? (
          <div style={{ display:"flex", flexDirection:"column", gap:7,
            justifyContent:"center", flex:1 }}>
            {GEN_STAGES.map((s, i) => (
              <div key={i} style={{ display:"flex", gap:8, alignItems:"center",
                fontSize:10.5,
                color: i < stage ? T.sub : i === stage ? T.text : T.label }}>
                <span style={{ color:i < stage ? T.green : i === stage ? T.accent : T.mute }}>
                  {i < stage ? "✓" : i === stage ? "◎" : "○"}
                </span>
                {s}
              </div>
            ))}
          </div>
        ) : (
          <>
            <div style={{ flex:1, minWidth:0 }}>
              <Lbl style={{ display:"block", marginBottom:5 }}>Work Package Type</Lbl>
              <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:12 }}>
                {tpl.type}
              </div>
              <Lbl style={{ display:"block", marginBottom:8 }}>Deliverables</Lbl>
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {tpl.deliverables.map((d, i) => (
                  <div key={i} style={{ display:"flex", gap:7, alignItems:"flex-start" }}>
                    <span style={{ fontSize:9, color:T.accent, marginTop:2, flexShrink:0 }}>·</span>
                    <span style={{ fontSize:10.5, color:T.text }}>{d}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ width:180, flexShrink:0, display:"flex",
              flexDirection:"column", gap:12, justifyContent:"space-between" }}>
              <div>
                {owner && (
                  <div style={{ marginBottom:12 }}>
                    <Lbl style={{ display:"block", marginBottom:6 }}>Suggested Owner</Lbl>
                    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                      <Av init={owner.init} size={22} />
                      <div>
                        <div style={{ fontSize:11, color:T.text, fontWeight:500 }}>{owner.name}</div>
                        <div style={{ fontSize:9, color:T.sub }}>{tpl.time}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                <Btn variant="primary" onClick={() => { onSave(rec.id); onClose(); }}
                  style={{ fontSize:9.5, padding:"5px 11px", justifyContent:"center" }}>
                  Save as Work Package
                </Btn>
                <Btn variant="ghost"
                  onClick={() => { showToast("Opening Module 5: Develop Centre"); onClose(); }}
                  style={{ fontSize:9.5, padding:"5px 11px", justifyContent:"center" }}>
                  Open in Module 5 →
                </Btn>
                <Btn variant="subtle" onClick={onClose}
                  style={{ fontSize:9.5, padding:"5px 11px", justifyContent:"center" }}>
                  Cancel
                </Btn>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── RECOMMENDATION CARD ───────────────────────────────────────────────────────
function RecCard({ rec, expanded, onToggle, onDevelop, onStatus }) {
  const p    = pri(rec);
  const ow   = getTeam(rec.owner);
  const done = ["done","archived"].includes(rec.status);

  return (
    <div style={{ borderRadius:7, border:`1px solid ${T.border}`,
      background:T.raised, marginBottom:7, opacity:done?0.45:1 }}>

      {/* Header */}
      <div onClick={onToggle} style={{ padding:"13px 14px", cursor:"pointer" }}
        onMouseOver={e => e.currentTarget.style.background = T.hover}
        onMouseOut={e  => e.currentTarget.style.background = "transparent"}>

        <div style={{ display:"flex", alignItems:"center",
          gap:8, marginBottom:7 }}>
          <span style={{ fontSize:9, fontWeight:700, color:chColor(rec.ch),
            textTransform:"uppercase", letterSpacing:"0.07em" }}>
            {chLabel(rec.ch)}
          </span>
          <span style={{ color:T.mute, fontSize:9 }}>·</span>
          <span style={{ fontSize:9, color:T.sub }}>{rec.src}</span>
          <div style={{ flex:1 }} />
          <span style={{ fontSize:9.5, fontWeight:500,
            color:statusColor(rec.status) }}>
            {statusLabel(rec.status)}
          </span>
          <div style={{ textAlign:"right", flexShrink:0, marginLeft:6 }}>
            <div style={{ fontSize:15, fontWeight:700,
              color:priColor(p), lineHeight:1 }}>{p}</div>
            <div style={{ fontSize:7.5, color:T.label, letterSpacing:"0.05em" }}>
              PRI
            </div>
          </div>
        </div>

        <div style={{ fontSize:11.5, fontWeight:500, color:T.text,
          lineHeight:1.4, marginBottom:8 }}>
          {rec.title}
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {[["I",rec.imp],["E",rec.eff],["C",rec.conf]].map(([l,v]) => (
            <div key={l} style={{ display:"flex", alignItems:"baseline", gap:2 }}>
              <span style={{ fontSize:11, fontWeight:600, color:T.text }}>{v}</span>
              <span style={{ fontSize:8.5, color:T.sub }}>{l}</span>
            </div>
          ))}
          <span style={{ color:T.mute, fontSize:9 }}>·</span>
          <span style={{ fontSize:9, color:T.sub }}>{rec.daysOpen}d open</span>
          <div style={{ flex:1 }} />
          {ow && (
            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
              <Av init={ow.init} size={16} />
              <span style={{ fontSize:9, color:T.sub }}>{ow.name}</span>
            </div>
          )}
          <span style={{ fontSize:9, color:T.label, marginLeft:4 }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <>
          <Hr />
          <div style={{ padding:"12px 14px 4px" }}>
            {[
              { l:"Issue",          t:rec.issue          },
              { l:"Insight",        t:rec.insight        },
              { l:"Recommendation", t:rec.recommendation },
            ].map(row => (
              <div key={row.l} style={{ display:"flex", gap:12,
                marginBottom:10, alignItems:"flex-start" }}>
                <Lbl style={{ width:100, flexShrink:0, paddingTop:2 }}>{row.l}</Lbl>
                <div style={{ fontSize:11, color:T.text, lineHeight:1.55, flex:1 }}>
                  {row.t}
                </div>
              </div>
            ))}
            {/* Formula */}
            <div style={{ fontSize:8.5, color:T.label, marginBottom:12 }}>
              Priority ({pri(rec)}) = ({rec.imp} × {rec.conf}) ÷ {rec.eff}
            </div>
          </div>
          <Hr />
          <div style={{ padding:"10px 14px", display:"flex", gap:6, flexWrap:"wrap" }}>
            <Btn variant="primary" onClick={e => { e.stopPropagation(); onDevelop(rec); }}
              style={{ fontSize:9.5, padding:"4px 11px" }}>
              Develop →
            </Btn>
            <Btn variant="ghost" onClick={e => { e.stopPropagation(); onStatus(rec.id,"task"); }}
              style={{ fontSize:9.5, padding:"4px 10px" }}>
              Assign as Task
            </Btn>
            <Btn variant="ghost" onClick={e => { e.stopPropagation(); onStatus(rec.id,"monitor"); }}
              style={{ fontSize:9.5, padding:"4px 10px" }}>
              Monitor
            </Btn>
            <Btn variant="ghost" onClick={e => { e.stopPropagation(); onStatus(rec.id,"archived"); }}
              style={{ fontSize:9.5, padding:"4px 10px" }}>
              Archive
            </Btn>
            <Btn variant="danger" onClick={e => { e.stopPropagation(); onStatus(rec.id,"done"); }}
              style={{ fontSize:9.5, padding:"4px 10px" }}>
              Mark Done
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}

// ── STREAM COLUMN ─────────────────────────────────────────────────────────────
function StreamColumn({ label, stream, recs, onDevelop, onStatus }) {
  const [expanded, setExpanded] = useState(null);
  const [sort,     setSort]     = useState("priority");
  const [chFilter, setChFilter] = useState("all");
  const [showDone, setShowDone] = useState(false);

  const channels = [...new Set(recs.map(r => r.ch))];
  const visible  = useMemo(() => {
    let list = [...recs];
    if (!showDone)    list = list.filter(r => !["done","archived"].includes(r.status));
    if (chFilter !== "all") list = list.filter(r => r.ch === chFilter);
    if (sort === "priority") list.sort((a,b) => pri(b)-pri(a));
    if (sort === "impact")   list.sort((a,b) => b.imp-a.imp);
    if (sort === "days")     list.sort((a,b) => b.daysOpen-a.daysOpen);
    return list;
  }, [recs, sort, chFilter, showDone]);

  const activeCount = recs.filter(r => !["done","archived"].includes(r.status)).length;
  const highCount   = visible.filter(r => pri(r) >= 18).length;

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column",
      minWidth:0, overflow:"hidden" }}>

      {/* Column header */}
      <div style={{ padding:"12px 14px 10px",
        borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
          <span style={{ fontSize:13, fontWeight:600, color:T.text }}>{label}</span>
          <span style={{ fontSize:9, color:T.sub, padding:"1px 6px",
            background:T.mute, borderRadius:8 }}>{activeCount}</span>
          {highCount > 0 && (
            <span style={{ fontSize:9, color:T.red }}>
              {highCount} high priority
            </span>
          )}
          <div style={{ flex:1 }} />
          <span style={{ fontSize:8.5, color:T.label, fontStyle:"italic" }}>
            P = (I × C) ÷ E
          </span>
        </div>
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          <select value={sort} onChange={e => setSort(e.target.value)}
            style={{ background:T.raised, border:`1px solid ${T.border}`,
              color:T.text, fontFamily:"'Sora'", fontSize:9.5,
              padding:"3px 22px 3px 7px", borderRadius:4, outline:"none",
              appearance:"none", cursor:"pointer",
              backgroundImage:`url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3e%3cpath fill='%2328283A' d='M4 6L0 2h8z'/%3e%3c/svg%3e")`,
              backgroundRepeat:"no-repeat", backgroundPosition:"right 6px center" }}>
            <option value="priority">Priority ↓</option>
            <option value="impact">Impact ↓</option>
            <option value="days">Days Open ↓</option>
          </select>
          {["all",...channels].map(c => (
            <button key={c} onClick={() => setChFilter(c)} style={{
              padding:"3px 8px", borderRadius:4, fontSize:9.5, fontWeight:500,
              fontFamily:"'Sora'", cursor:"pointer", border:"none",
              background: chFilter === c ? `${T.accent}18` : T.raised,
              color:       chFilter === c ? T.accent : T.sub }}>
              {c === "all" ? "All" : chLabel(c)}
            </button>
          ))}
          <button onClick={() => setShowDone(!showDone)}
            style={{ marginLeft:"auto", padding:"3px 8px", borderRadius:4,
              fontSize:9, fontFamily:"'Sora'", cursor:"pointer",
              background:"transparent", border:`1px solid ${T.border}`,
              color:showDone ? T.amber : T.sub }}>
            {showDone ? "Hide closed" : "Show closed"}
          </button>
        </div>
      </div>

      {/* Cards */}
      <div style={{ flex:1, overflowY:"auto", padding:"12px" }}>
        {visible.length === 0
          ? <div style={{ padding:"32px 0", textAlign:"center",
              color:T.sub, fontSize:11 }}>No {label.toLowerCase()} for this filter.</div>
          : visible.map(r => (
            <RecCard key={r.id} rec={r}
              expanded={expanded === r.id}
              onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
              onDevelop={onDevelop}
              onStatus={onStatus} />
          ))
        }
      </div>
    </div>
  );
}

// ── CLIENT CARD ───────────────────────────────────────────────────────────────
function ClientCard({ client, recs, selected, onClick }) {
  const risks = recs.filter(r => r.cid===client.id && r.stream==="risk").length;
  const opps  = recs.filter(r => r.cid===client.id && r.stream==="opportunity").length;
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
        {risks > 0 && <><span style={{ color:T.mute }}>·</span><span style={{ fontSize:9.5, color:T.red }}>{risks} risks</span></>}
        {opps  > 0 && <><span style={{ color:T.mute }}>·</span><span style={{ fontSize:9.5, color:T.green }}>{opps} opps</span></>}
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function RecommendationsHub() {
  const [selectedClient, setClient]   = useState("fb");
  const [developRec,     setDevelop]  = useState(null);
  const [statuses,       setStatuses] = useState({});
  const [toast,          setToast]    = useState(null);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const enriched = useMemo(() =>
    ALL_RECS.map(r => ({ ...r, status:statuses[r.id]||r.status })), [statuses]);

  const risks = useMemo(() => enriched.filter(r => r.cid===selectedClient && r.stream==="risk"),        [enriched,selectedClient]);
  const opps  = useMemo(() => enriched.filter(r => r.cid===selectedClient && r.stream==="opportunity"), [enriched,selectedClient]);

  const handleStatus = (id, status) => {
    setStatuses(p => ({ ...p, [id]:status }));
    const labels = { task:"Assigned as task", monitor:"Set to monitoring",
      archived:"Archived", done:"Marked done" };
    showToast(labels[status] || status);
  };
  const handleSave = id => {
    setStatuses(p => ({ ...p, [id]:"develop" }));
    showToast("Work package saved → Module 5");
  };

  const totalRisks = risks.filter(r => !["done","archived"].includes(statuses[r.id]||r.status)).length;
  const totalOpps  = opps.filter(r  => !["done","archived"].includes(statuses[r.id]||r.status)).length;
  const highPri    = [...risks,...opps].filter(r => pri(r) >= 18 && !["done","archived"].includes(statuses[r.id]||r.status)).length;

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
        <div style={{ display:"flex", alignItems:"center" }}>
          <div>
            <h1 style={{ fontFamily:"'Newsreader',serif", fontSize:18, fontWeight:600,
              color:T.text, margin:0, fontStyle:"italic" }}>Recommendations Hub</h1>
            <div style={{ marginTop:2 }}>
              <Lbl>Module 4 · Risks + Opportunities · Priority = (Impact × Confidence) ÷ Effort</Lbl>
            </div>
          </div>
          <div style={{ flex:1 }} />
          <div style={{ display:"flex", gap:20, marginRight:16 }}>
            {[
              { l:"Open Risks",    v:totalRisks, c:totalRisks > 0 ? T.red   : T.sub },
              { l:"Opportunities", v:totalOpps,  c:totalOpps  > 0 ? T.green : T.sub },
              { l:"High Priority", v:highPri,    c:highPri    > 0 ? T.amber : T.sub },
            ].map(s => (
              <div key={s.l} style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                <span style={{ fontSize:18, fontWeight:600, color:s.c, lineHeight:1 }}>{s.v}</span>
                <span style={{ fontSize:9, color:T.label }}>{s.l}</span>
              </div>
            ))}
          </div>
          <Btn variant="primary">+ Add Recommendation</Btn>
        </div>
      </div>

      {/* BODY */}
      <div style={{ display:"flex", flex:1, minHeight:0 }}>

        {/* Left */}
        <div style={{ width:260, flexShrink:0, borderRight:`1px solid ${T.border}`,
          overflowY:"auto", padding:"10px 8px" }}>
          {CLIENTS.map(c => (
            <ClientCard key={c.id} client={c} recs={enriched}
              selected={selectedClient === c.id}
              onClick={() => { setClient(c.id); setDevelop(null); }} />
          ))}
        </div>

        {/* Right: columns + drawer */}
        <div style={{ flex:1, minWidth:0, display:"flex",
          flexDirection:"column", overflow:"hidden" }}>

          {/* Two columns */}
          <div style={{ flex:1, display:"flex", minHeight:0 }}>
            <StreamColumn label="Risks"         stream="risk"
              recs={risks} onDevelop={r => setDevelop(r)} onStatus={handleStatus} />
            <div style={{ width:1, background:T.border, flexShrink:0 }} />
            <StreamColumn label="Opportunities"  stream="opportunity"
              recs={opps}  onDevelop={r => setDevelop(r)} onStatus={handleStatus} />
          </div>

          {/* Develop drawer */}
          {developRec && (
            <DevelopDrawer rec={developRec}
              onClose={() => setDevelop(null)}
              onSave={handleSave}
              showToast={showToast} />
          )}
        </div>
      </div>

    </div>
  );
}
