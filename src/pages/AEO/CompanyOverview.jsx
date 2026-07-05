/**
 * 5th Avenue — Internal OS
 * Module 1: Company Overview
 * Client Intelligence Hub
 * ─────────────────────────────────────────────────────────────────
 * Answers in 30 seconds:
 *   1. Who is this company?
 *   2. How do they make money?
 *   3. Who are their customers?
 *   4. Who are their competitors?
 *   5. What channels matter most?
 *   6. Where are the biggest gaps?
 *   7. What needs attention now?
 */

import { useState, useMemo, useEffect } from "react";
import { ClientsAPI } from "../../lib/api";

// ── TOKENS ────────────────────────────────────────────────────────────────────
import { T } from "../../theme/tokens";

// ── CLIENT DATA ───────────────────────────────────────────────────────────────
const CLIENTS = [
  {
    id:"fb", name:"FreshBite Foods", init:"FB",
    website:"freshbitefoods.com", faavi:72,
    phase:"bau", pkg:"Growth", consultant:"Priya Nair",
    auditAge:18, lastScanned:"Today, 09:14",
    confidence:"high",
    profile:{
      type:"D2C · FMCG",
      industry:"Food & Beverage",
      subIndustry:"Packaged Snacks & Health Foods",
      model:"Direct-to-consumer packaged snack brand. Revenue via own website, quick-commerce (Zepto, Swiggy Instamart), and modern trade.",
      stage:"Series A",
      founded:"2019",
      employees:"50–200",
      geography:"Pan-India. Primary: South & West. Expanding: North.",
      market:"Urban Tier-1 and Tier-2 cities. Health-conscious consumers. Rising demand for better-for-you snacking alternatives.",
    },
    personas:[
      "Health-conscious millennials, 22–35, urban metros",
      "Fitness enthusiasts seeking low-sugar snack options",
      "Working professionals needing guilt-free desk snacks",
      "Parents buying healthier alternatives for children",
    ],
    competitors:{
      direct:     ["Too Yumm", "Happilo", "Yoga Bar", "UNIBIC"],
      indirect:   ["Haldiram's", "Lay's Baked", "Britannia NutriChoice"],
      aspirational:["Kind Bars", "RXBar", "Graze"],
    },
    products:["Millet snacks", "Low-sugar biscuits", "Protein bars", "Roasted seeds mix", "Snack subscription box"],
    channels:{
      aeo:     { score:68, benchmark:52, trend:+4, gaps:3,  benchmarkSrc:"Category avg" },
      seo:     { score:74, benchmark:61, trend:+2, gaps:2,  benchmarkSrc:"Category avg" },
      meo:     { score:80, benchmark:55, trend: 0, gaps:1,  benchmarkSrc:"Local avg"    },
      ai:      { score:58, benchmark:48, trend:+8, gaps:4,  benchmarkSrc:"Category avg" },
      reviews: { score:85, benchmark:60, trend:+3, gaps:1,  benchmarkSrc:"Category avg" },
      social:  { score:62, benchmark:55, trend:-1, gaps:2,  benchmarkSrc:"Category avg" },
    },
    issues:[
      { id:"i1", channel:"AEO", title:"No FAQ schema on any of the 14 product pages", priority:24.0, impact:9, effort:1, confidence:9, why:"Featured snippets and AI answer boxes are captured via structured data. Without schema, FreshBite cannot win these placements regardless of content quality. Competitors with schema own the top of SERP." },
      { id:"i2", channel:"AI",  title:"Brand not cited in ChatGPT or Gemini for 'best healthy snacks India'", priority:21.0, impact:9, effort:3, confidence:8, why:"Consumers increasingly trust AI recommendations as purchasing signals. Absence here means the brand is invisible at a high-intent decision moment. Competitors Yoga Bar and Happilo are actively cited." },
      { id:"i3", channel:"SEO", title:"3 high-volume content cluster pages missing (combined 38K/mo)", priority:14.4, impact:8, effort:5, confidence:9, why:"Content gaps directly translate to traffic lost to competitors. Each page represents a compounding organic asset. Delay increases competitor authority in these queries." },
      { id:"i4", channel:"MEO", title:"2 distribution partner branches unclaimed on Google Maps", priority:12.0, impact:6, effort:2, confidence:8, why:"Unclaimed GBP listings allow competitors to appear alongside brand touchpoints. Also affects local search ranking and AI systems that source location data from Maps." },
      { id:"i5", channel:"AI",  title:"No structured comparison pages to trigger AI citation", priority:10.5, impact:7, effort:4, confidence:6, why:"AI systems heavily cite comparison and category pages. FreshBite has product pages but no 'FreshBite vs X' or 'best snacks for Y' content that AI systems pull from." },
    ],
    openRecs:3, openTasks:1, activeProjects:3,
  },
  {
    id:"nb", name:"NutriBlend India", init:"NB",
    website:"nutriblend.in", faavi:61,
    phase:"launch", pkg:"Growth", consultant:"Priya Nair",
    auditAge:42, lastScanned:"42 days ago",
    confidence:"medium",
    profile:{
      type:"D2C · Health & Wellness",
      industry:"Nutrition & Supplements",
      subIndustry:"Sports Nutrition / Protein",
      model:"Direct-to-consumer protein and nutrition supplements. Revenue via own website and Amazon India. Gym and fitness community as primary acquisition channel.",
      stage:"Seed",
      founded:"2021",
      employees:"20–50",
      geography:"Pan-India, primarily gym-dense urban centres.",
      market:"Growing sports nutrition market driven by fitness adoption post-2020. Under-served mid-price segment between mass brands and premium imports.",
    },
    personas:[
      "Gym-goers and recreational athletes, 20–35",
      "Women entering fitness — seeking non-intimidating protein options",
      "Weight management seekers looking for high-protein diet support",
      "Athletes seeking performance nutrition without imports",
    ],
    competitors:{
      direct:      ["MuscleBlaze", "Myprotein India", "Fast&Up", "AS-IT-IS Nutrition"],
      indirect:    ["Epigamia Greek Yoghurt", "RiteBite", "Sattu-based brands"],
      aspirational:["Optimum Nutrition", "Dymatize", "Garden of Life"],
    },
    products:["Whey protein isolate", "Plant protein blend", "Multivitamins", "Pre-workout formula", "Protein snack bars"],
    channels:{
      aeo:     { score:52, benchmark:52, trend:+3, gaps:5,  benchmarkSrc:"Category avg" },
      seo:     { score:65, benchmark:61, trend:+1, gaps:4,  benchmarkSrc:"Category avg" },
      meo:     { score:55, benchmark:45, trend: 0, gaps:2,  benchmarkSrc:"N/A — online only" },
      ai:      { score:48, benchmark:48, trend:-2, gaps:6,  benchmarkSrc:"Category avg" },
      reviews: { score:70, benchmark:60, trend:+1, gaps:3,  benchmarkSrc:"Category avg" },
      social:  { score:55, benchmark:55, trend:+2, gaps:3,  benchmarkSrc:"Category avg" },
    },
    issues:[
      { id:"i1", channel:"AI",  title:"Brand completely absent from all AI platform responses for category queries", priority:24.0, impact:9, effort:3, confidence:8, why:"NutriBlend ranks on Google but AI systems (ChatGPT, Perplexity, Gemini) do not cite it for 'best protein powder India' or related queries. This gap will widen as AI search share grows. Competitor MuscleBlaze is cited in all 3 platforms." },
      { id:"i2", channel:"SEO", title:"Domain authority (DA 18) critically below competitors — MuscleBlaze DA 52, Myprotein DA 61", priority:18.0, impact:8, effort:5, confidence:9, why:"Low DA means FreshBite cannot compete for competitive keywords regardless of content quality. Each month of delay is a compounding disadvantage as competitors build more links." },
      { id:"i3", channel:"AEO", title:"Competitor owns AI answer for 'best protein powder without side effects' (8.2K/mo)", priority:15.0, impact:8, effort:3, confidence:7, why:"This is a high-purchase-intent query. The competitor article ranking here captures users at peak buying readiness. NutriBlend has no equivalent page." },
      { id:"i4", channel:"Reviews", title:"Amazon reviews averaging 3.8★ — below 4.0★ conversion threshold", priority:9.6, impact:8, effort:4, confidence:6, why:"Research shows conversion drops sharply below 4.0★. NutriBlend's Amazon performance is directly limited by review score. 50 targeted review requests could move this to 4.2★." },
    ],
    openRecs:5, openTasks:4, activeProjects:2,
  },
  {
    id:"ch", name:"CraftHome Decor", init:"CH",
    website:"crafthomedecor.com", faavi:53,
    phase:"audit", pkg:"Starter", consultant:"Vikram Das",
    auditAge:67, lastScanned:"67 days ago",
    confidence:"low",
    profile:{
      type:"D2C · E-commerce",
      industry:"Home Decor & Lifestyle",
      subIndustry:"Handcrafted & Artisanal Home Products",
      model:"Online-first home decor. Revenue via own website and offline showroom (Bengaluru). Seasonal gifting and corporate orders are significant revenue contributors.",
      stage:"Bootstrapped",
      founded:"2018",
      employees:"10–50",
      geography:"Primarily Bengaluru. Online reach pan-India. International orders via Etsy (nascent).",
      market:"Premium handcrafted home decor. Underserved segment between mass-market (Pepperfry) and luxury. Growing demand for artisan products, sustainability narrative.",
    },
    personas:[
      "Homemakers and interior design enthusiasts, 28–45, urban metros",
      "Corporate gifting decision-makers (HR, admin teams)",
      "Wedding planners and event decorators",
      "NRI buyers seeking authentic Indian artisan products",
    ],
    competitors:{
      direct:      ["Pepperfry", "Urban Ladder", "WoodenStreet"],
      indirect:    ["Fabindia Home", "Good Earth", "Nappa Dori"],
      aspirational:["Crate & Barrel", "CB2", "Anthropologie Home"],
    },
    products:["Handmade wall art", "Furniture accents", "Festive décor", "Custom name boards", "Corporate gift boxes"],
    channels:{
      aeo:     { score:41, benchmark:52, trend:-2, gaps:6,  benchmarkSrc:"Category avg" },
      seo:     { score:58, benchmark:61, trend:+1, gaps:5,  benchmarkSrc:"Category avg" },
      meo:     { score:48, benchmark:55, trend: 0, gaps:4,  benchmarkSrc:"Local avg"    },
      ai:      { score:38, benchmark:48, trend:-5, gaps:7,  benchmarkSrc:"Category avg" },
      reviews: { score:63, benchmark:60, trend:-1, gaps:3,  benchmarkSrc:"Category avg" },
      social:  { score:58, benchmark:55, trend:+3, gaps:2,  benchmarkSrc:"Category avg" },
    },
    issues:[
      { id:"i1", channel:"MEO", title:"Physical showroom unclaimed on Google Maps — invisible to local search", priority:32.0, impact:8, effort:1, confidence:9, why:"Local search is the primary discovery mechanism for offline retail. An unclaimed GBP listing means competitors appear where CraftHome should. Maps data also feeds AI local recommendations. 15-minute fix with potentially months of compounding benefit." },
      { id:"i2", channel:"AEO", title:"'Home decor ideas' and related queries (110K/mo combined) — zero content targeting these", priority:27.0, impact:9, effort:4, confidence:8, why:"Home decor is a heavily searched category. Competitors Pepperfry and Urban Ladder dominate these queries with content hubs. CraftHome has product pages but no inspirational or informational content that captures top-of-funnel intent." },
      { id:"i3", channel:"AI",  title:"Brand completely absent from AI recommendations in home decor category", priority:21.6, impact:9, effort:5, confidence:8, why:"AI recommendation absence is most damaging in discovery categories where consumers ask 'what should I buy'. Home decor is exactly this. CraftHome's competitors are cited; the brand is not." },
      { id:"i4", channel:"Reviews", title:"0% review response rate — 17 unanswered reviews including 3 negative", priority:16.0, impact:8, effort:2, confidence:9, why:"Unanswered negative reviews are one of the highest-trust-cost items in local search. Google uses review response rate as a GBP quality signal. Unanswered reviews also signal to AI systems that the business is inactive." },
      { id:"i5", channel:"SEO", title:"'Minimalist home decor' (74K/mo) tracked at position 28 — no dedicated page", priority:14.4, impact:8, effort:5, confidence:9, why:"Ranking 28th means effectively no organic traffic (CTR at position 28 < 0.5%). A single well-built landing page targeting this query cluster could reach top 10 within 90 days based on competition analysis." },
    ],
    openRecs:8, openTasks:6, activeProjects:1,
  },
  {
    id:"df", name:"DermFirst", init:"DF",
    website:"dermfirst.in", faavi:68,
    phase:"campaigns", pkg:"Enterprise", consultant:"Vikram Das",
    auditAge:9, lastScanned:"Today, 11:30",
    confidence:"high",
    profile:{
      type:"D2C · Healthtech",
      industry:"Skincare & Dermatology",
      subIndustry:"Dermatologist-formulated Skincare",
      model:"D2C skincare with a dermatologist consultation layer. Products sold via own website. Consultation revenue supplements product margins. Strong clinical credibility narrative.",
      stage:"Series A",
      founded:"2020",
      employees:"50–200",
      geography:"Pan-India. Primary: Mumbai, Delhi, Bengaluru. Expanding to international (UAE, UK NRI market).",
      market:"Premium clinical skincare. Consumers moving away from influencer brands toward evidence-based products. Strong tailwind from skincare education content trend.",
    },
    personas:[
      "Women 22–40 dealing with acne, pigmentation or sensitivity",
      "Skincare-educated consumers seeking dermat-backed formulations",
      "Dermatologist-referred patients continuing a prescribed routine",
      "Premium skincare buyers moving away from influencer brands",
    ],
    competitors:{
      direct:      ["Minimalist", "Dot & Key", "Plum", "The Derma Co."],
      indirect:    ["Mamaearth", "Forest Essentials", "Kama Ayurveda"],
      aspirational:["CeraVe", "Paula's Choice", "La Roche-Posay"],
    },
    products:["Retinol serums", "SPF moisturisers", "AHA/BHA exfoliants", "Vitamin C actives", "Dermat consultation add-on"],
    channels:{
      aeo:     { score:62, benchmark:52, trend:+5, gaps:3,  benchmarkSrc:"Category avg" },
      seo:     { score:71, benchmark:61, trend:+3, gaps:3,  benchmarkSrc:"Category avg" },
      meo:     { score:60, benchmark:45, trend: 0, gaps:2,  benchmarkSrc:"N/A — online only" },
      ai:      { score:65, benchmark:48, trend:+6, gaps:3,  benchmarkSrc:"Category avg" },
      reviews: { score:78, benchmark:60, trend:+2, gaps:2,  benchmarkSrc:"Category avg" },
      social:  { score:60, benchmark:55, trend:+4, gaps:2,  benchmarkSrc:"Category avg" },
    },
    issues:[
      { id:"i1", channel:"AEO", title:"'Best retinol for beginners India' (27K/mo) — not owned by DermFirst", priority:22.5, impact:9, effort:4, confidence:8, why:"This is the highest-intent query for DermFirst's core product. A well-structured guide with clinical authority signals could win both the featured snippet and the AI answer box. Competitor Minimalist currently owns this query." },
      { id:"i2", channel:"SEO", title:"Competitor Minimalist outranks on 28 of 35 shared tracked keywords", priority:18.0, impact:9, effort:5, confidence:9, why:"Systematic underperformance on shared keywords indicates a domain authority and content depth gap. Minimalist has been investing in content for longer. Closing this gap requires a sustained 6-month content programme." },
      { id:"i3", channel:"AI",  title:"Cited in Perplexity but not ChatGPT or Gemini for dermat queries", priority:14.0, impact:7, effort:3, confidence:7, why:"Partial AI citation is a fragile position. It indicates some authority signals exist but are insufficient for the larger platforms. Building 5 expert-authored, cited articles should trigger ChatGPT citations within 60–90 days." },
    ],
    openRecs:1, openTasks:0, activeProjects:4,
  },
  {
    id:"tg", name:"TerraGrow Organic", init:"TG",
    website:"terragrow.in", faavi:44,
    phase:"audit", pkg:"Starter", consultant:"Arjun Reddy",
    auditAge:91, lastScanned:"91 days ago",
    confidence:"low",
    profile:{
      type:"D2C · Agri-food",
      industry:"Organic Food & Agriculture",
      subIndustry:"Organic Produce & Farm-to-table",
      model:"Farm-to-consumer organic produce and packaged organic food. Subscription box model supplemented by individual product sales.",
      stage:"Bootstrapped",
      founded:"2020",
      employees:"10–50",
      geography:"South India primary (Bengaluru, Chennai, Hyderabad). Pan-India for packaged products.",
      market:"Organic food market growing at 25% CAGR. Urban consumers willing to pay premium for certified organic. Subscription model reduces churn.",
    },
    personas:[
      "Health and sustainability-conscious urban households",
      "Parents seeking pesticide-free produce for young children",
      "Fitness communities adopting clean eating",
      "Corporate wellness programme buyers",
    ],
    competitors:{
      direct:      ["Organic Tattva", "24 Mantra Organic", "Conscious Food"],
      indirect:    ["Nature's Basket", "Godrej Nature's Basket", "FreshToHome"],
      aspirational:["Abel & Cole", "Riverford", "Thrive Market"],
    },
    products:["Organic vegetable subscription boxes", "Certified pulses & grains", "Cold-pressed oils", "Organic spice range"],
    channels:{
      aeo:     { score:38, benchmark:52, trend:-3, gaps:7,  benchmarkSrc:"Category avg" },
      seo:     { score:46, benchmark:61, trend:-1, gaps:6,  benchmarkSrc:"Category avg" },
      meo:     { score:32, benchmark:55, trend:-2, gaps:5,  benchmarkSrc:"Local avg"    },
      ai:      { score:28, benchmark:48, trend:-4, gaps:8,  benchmarkSrc:"Category avg" },
      reviews: { score:55, benchmark:60, trend: 0, gaps:4,  benchmarkSrc:"Category avg" },
      social:  { score:44, benchmark:55, trend:+1, gaps:4,  benchmarkSrc:"Category avg" },
    },
    issues:[
      { id:"i1", channel:"Audit", title:"No baseline audit completed — client onboarded 3 months ago with no diagnostic data", priority:40.0, impact:10, effort:2, confidence:9, why:"Without an audit, all subsequent recommendations are assumptions. TerraGrow has no baseline FAAVI score, no identified gaps, no competitor benchmarks and no prioritised roadmap. Everything else is blocked on this." },
      { id:"i2", channel:"AI",  title:"Brand completely absent from all AI systems — weakest AI presence in portfolio", priority:24.0, impact:9, effort:3, confidence:7, why:"Organic food is increasingly purchased via AI-recommended discovery. TerraGrow scores 28/100 on AI presence — the weakest in the entire portfolio. With the audit pending, the full picture is unknown." },
      { id:"i3", channel:"MEO", title:"Pickup location and partner stores not listed on Google Maps", priority:20.0, impact:8, effort:2, confidence:7, why:"Subscription box services with physical pickup points lose significant local discovery without Maps presence. This is directly affecting subscriber acquisition in addressable geographic areas." },
    ],
    openRecs:11, openTasks:0, activeProjects:0,
  },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
const scoreColor = s  => s >= 70 ? T.green : s >= 50 ? T.amber : T.red;
const trendStr   = n  => n > 0 ? `+${n}` : n < 0 ? `${n}` : "—";
const trendColor = n  => n > 0 ? T.green : n < 0 ? T.red : T.sub;
const faaviGrade = s  => s >= 80 ? "A" : s >= 65 ? "B" : s >= 50 ? "C" : "D";
const phaseColor = p  => ({ audit:T.label, launch:T.amber, bau:T.accent, campaigns:T.green })[p] || T.sub;
const phaseLabel = p  => ({ audit:"Audit", launch:"Launch", bau:"BAU", campaigns:"Campaigns" })[p] || p;
const confColor  = c  => ({ high:T.green, medium:T.amber, low:T.red })[c] || T.sub;
const urgency    = c  => {
  let s = 0;
  if (c.faavi < 50)    s += 40;
  if (c.auditAge > 60) s += 30;
  s += c.openP1 * 3 + (c.openRecs || 0) * 2;
  return s;
};

const CH_LABELS = { aeo:"AEO", seo:"SEO", meo:"MEO / Maps", ai:"AI Presence", reviews:"Reviews", social:"Social / Video" };

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
  };
  return <button onClick={onClick} disabled={disabled} style={{...b,...(v[variant]||v.ghost),...style}}>{children}</button>;
}

const INP = { width:"100%", padding:"7px 10px", borderRadius:5, background:T.raised,
  border:`1px solid ${T.border}`, color:T.text, fontSize:11.5,
  fontFamily:"'Sora'", outline:"none" };

// ── TABLE SHARED STYLES ───────────────────────────────────────────────────────
const thS = { fontSize:9, fontWeight:600, color:T.label, textTransform:"uppercase",
  letterSpacing:"0.07em", padding:"7px 12px", whiteSpace:"nowrap",
  borderBottom:`1px solid ${T.border}`, textAlign:"left", background:T.raised };
const tdS = { padding:"8px 12px", borderBottom:`1px solid ${T.border}`,
  fontSize:11, color:T.sub, verticalAlign:"top" };

// ── LEFT PANEL — CLIENT CARD ──────────────────────────────────────────────────
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

// ── RIGHT PANEL — COMPANY INTELLIGENCE ───────────────────────────────────────
function CompanyDetail({ client, onRescan }) {
  const [expandedIssue, setExpandedIssue] = useState(null);
  const grade = faaviGrade(client.faavi);

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

      {/* ── DETAIL HEADER ── */}
      <div style={{ padding:"14px 20px", borderBottom:`1px solid ${T.border}`,
        flexShrink:0, background:T.surface }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
          <Av init={client.init} size={32} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:600, color:T.text, marginBottom:2 }}>
              {client.name}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:9.5, color:T.sub }}>{client.website}</span>
              <span style={{ color:T.mute }}>·</span>
              <Dot color={phaseColor(client.phase)} />
              <span style={{ fontSize:9.5, color:T.sub }}>{phaseLabel(client.phase)}</span>
              <span style={{ color:T.mute }}>·</span>
              <span style={{ fontSize:9.5, color:T.label }}>{client.pkg}</span>
              <span style={{ color:T.mute }}>·</span>
              <span style={{ fontSize:9.5, color:T.label }}>{client.consultant}</span>
            </div>
          </div>

          {/* FAAVI */}
          <div style={{ display:"flex", alignItems:"center", gap:10,
            padding:"8px 14px", background:T.raised,
            border:`1px solid ${T.border}`, borderRadius:6 }}>
            <div>
              <div style={{ fontSize:8, color:T.label, fontWeight:700,
                textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:2 }}>
                FAAVI
              </div>
              <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                <span style={{ fontSize:22, fontWeight:700, color:scoreColor(client.faavi), lineHeight:1 }}>
                  {client.faavi}
                </span>
                <span style={{ fontSize:10, color:T.label }}>/100</span>
                <span style={{ fontSize:13, fontWeight:600, color:scoreColor(client.faavi), marginLeft:4 }}>
                  {grade}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            <div style={{ fontSize:9, color:T.label, textAlign:"right" }}>
              <div>Confidence: <span style={{ color:confColor(client.confidence), fontWeight:600 }}>{client.confidence}</span></div>
              <div style={{ marginTop:2 }}>Scanned: {client.lastScanned}</div>
            </div>
            <Btn variant="ghost" onClick={onRescan} style={{ fontSize:9.5 }}>Re-scan</Btn>
            <Btn variant="primary" style={{ fontSize:9.5 }}>Run Audit →</Btn>
          </div>
        </div>
      </div>

      {/* ── SCROLLABLE BODY ── */}
      <div style={{ flex:1, overflowY:"auto", padding:"18px 20px",
        display:"flex", flexDirection:"column", gap:22 }}>

        {/* ── 1. COMPANY PROFILE ── */}
        <div>
          <div style={{ marginBottom:10 }}><Lbl>Company Profile</Lbl></div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>

            {/* Profile table */}
            <div style={{ borderRadius:7, border:`1px solid ${T.border}`, overflow:"hidden" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <tbody>
                  {[
                    ["Type",      client.profile.type        ],
                    ["Industry",  client.profile.subIndustry ],
                    ["Stage",     client.profile.stage       ],
                    ["Founded",   client.profile.founded     ],
                    ["Team",      client.profile.employees   ],
                    ["Geography", client.profile.geography   ],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ ...tdS, color:T.label, width:90, whiteSpace:"nowrap",
                        fontSize:10, background:T.raised }}>{k}</td>
                      <td style={{ ...tdS, color:T.text, fontSize:10.5 }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Model + Market */}
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ padding:"11px 13px", borderRadius:7,
                border:`1px solid ${T.border}` }}>
                <Lbl style={{ display:"block", marginBottom:5 }}>Business Model</Lbl>
                <div style={{ fontSize:11, color:T.sub, lineHeight:1.55 }}>
                  {client.profile.model}
                </div>
              </div>
              <div style={{ padding:"11px 13px", borderRadius:7,
                border:`1px solid ${T.border}` }}>
                <Lbl style={{ display:"block", marginBottom:5 }}>Market</Lbl>
                <div style={{ fontSize:11, color:T.sub, lineHeight:1.55 }}>
                  {client.profile.market}
                </div>
              </div>
            </div>
          </div>
        </div>

        <Hr />

        {/* ── 2. PERSONAS + COMPETITORS ── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>

          {/* Personas */}
          <div>
            <div style={{ marginBottom:10 }}><Lbl>Customer Personas</Lbl></div>
            <div style={{ display:"flex", flexDirection:"column", gap:0,
              borderRadius:7, border:`1px solid ${T.border}`, overflow:"hidden" }}>
              {client.personas.map((p, i) => (
                <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8,
                  padding:"8px 12px",
                  borderBottom: i < client.personas.length-1 ? `1px solid ${T.border}` : "none",
                  background: i%2===0 ? "transparent" : T.hover }}>
                  <span style={{ fontSize:9, color:T.label, marginTop:2, flexShrink:0 }}>·</span>
                  <span style={{ fontSize:10.5, color:T.sub, lineHeight:1.4 }}>{p}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Competitors */}
          <div>
            <div style={{ marginBottom:10 }}><Lbl>Competitive Set</Lbl></div>
            <div style={{ borderRadius:7, border:`1px solid ${T.border}`, overflow:"hidden" }}>
              {[
                ["Direct",      client.competitors.direct      ],
                ["Indirect",    client.competitors.indirect    ],
                ["Aspirational",client.competitors.aspirational],
              ].map(([label, list], si) => (
                <div key={label} style={{
                  padding:"9px 12px",
                  borderBottom: si < 2 ? `1px solid ${T.border}` : "none",
                  background: si%2===0 ? "transparent" : T.hover,
                }}>
                  <div style={{ fontSize:9, color:T.label, marginBottom:5,
                    fontWeight:600, textTransform:"uppercase", letterSpacing:"0.07em" }}>
                    {label}
                  </div>
                  <div style={{ fontSize:11, color:T.sub }}>
                    {list.join(" · ")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Hr />

        {/* ── 3. FAAVI BREAKDOWN ── */}
        <div>
          <div style={{ marginBottom:10 }}><Lbl>FAAVI Breakdown — Fifth Avenue AI Visibility Index</Lbl></div>
          <div style={{ borderRadius:7, border:`1px solid ${T.border}`, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  {["Channel","Score","Benchmark","vs. Benchmark","30d Trend","Gaps",""].map(h =>
                    <th key={h} style={thS}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {Object.entries(client.channels).map(([key, ch], i) => {
                  const diff = ch.score - ch.benchmark;
                  return (
                    <tr key={key} style={{ background: i%2===0 ? "transparent" : T.hover }}>
                      <td style={{ ...tdS, color:T.text, fontWeight:500, whiteSpace:"nowrap" }}>
                        {CH_LABELS[key]}
                      </td>
                      <td style={{ ...tdS, color:scoreColor(ch.score), fontWeight:600 }}>
                        {ch.score}
                      </td>
                      <td style={{ ...tdS, whiteSpace:"nowrap" }}>
                        {ch.benchmark}
                        <span style={{ fontSize:9, color:T.label, marginLeft:4 }}>
                          {ch.benchmarkSrc}
                        </span>
                      </td>
                      <td style={{ ...tdS, color: diff >= 0 ? T.green : T.red, fontWeight:600 }}>
                        {diff >= 0 ? `+${diff}` : diff}
                      </td>
                      <td style={{ ...tdS, color:trendColor(ch.trend), fontWeight:600 }}>
                        {trendStr(ch.trend)}
                      </td>
                      <td style={{ ...tdS, color: ch.gaps > 3 ? T.red : ch.gaps > 1 ? T.amber : T.sub }}>
                        {ch.gaps}
                      </td>
                      <td style={{ ...tdS }}>
                        <button style={{ fontSize:9, color:T.accent, background:"transparent",
                          border:"none", cursor:"pointer", fontFamily:"'Sora'" }}>
                          Drill →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <Hr />

        {/* ── 4. TOP ISSUES ── */}
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
            <Lbl>Top Issues</Lbl>
            <span style={{ fontSize:9, color:T.label, padding:"1px 6px",
              background:T.mute, borderRadius:8 }}>{client.issues.length}</span>
            <span style={{ fontSize:9, color:T.label, marginLeft:4 }}>
              sorted by priority score · Impact × Confidence ÷ Effort
            </span>
          </div>
          <div style={{ borderRadius:7, border:`1px solid ${T.border}`, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  {["Channel","Issue","Priority","Impact","Effort","Conf.","Why",""].map(h =>
                    <th key={h} style={thS}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {client.issues.map((issue, i) => {
                  const isOpen = expandedIssue === issue.id;
                  return (
                    <>
                      <tr key={issue.id}
                        style={{ background: i%2===0 ? "transparent" : T.hover, cursor:"pointer" }}
                        onClick={() => setExpandedIssue(isOpen ? null : issue.id)}>
                        <td style={{ ...tdS, whiteSpace:"nowrap", fontWeight:500,
                          color:T.text }}>{issue.channel}</td>
                        <td style={{ ...tdS, color:T.text, minWidth:280 }}>{issue.title}</td>
                        <td style={{ ...tdS, color:scoreColor(issue.priority/4),
                          fontWeight:700, whiteSpace:"nowrap" }}>
                          {issue.priority.toFixed(1)}
                        </td>
                        <td style={{ ...tdS, color:T.sub }}>{issue.impact}</td>
                        <td style={{ ...tdS, color:T.sub }}>{issue.effort}</td>
                        <td style={{ ...tdS, color:T.sub }}>{issue.confidence}</td>
                        <td style={{ ...tdS }}>
                          <span style={{ fontSize:9, color:T.accent, cursor:"pointer" }}>
                            {isOpen ? "▲ less" : "▼ why"}
                          </span>
                        </td>
                        <td style={{ ...tdS }}>
                          <button style={{ fontSize:9, color:T.accent, background:"transparent",
                            border:"none", cursor:"pointer", fontFamily:"'Sora'",
                            whiteSpace:"nowrap" }}
                            onClick={e => { e.stopPropagation(); }}>
                            Develop →
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${issue.id}-why`}>
                          <td colSpan={8} style={{ padding:"10px 12px 12px 28px",
                            borderBottom:`1px solid ${T.border}`,
                            background: i%2===0 ? T.hover : "rgba(255,255,255,0.01)" }}>
                            <div style={{ fontSize:9, color:T.label, fontWeight:700,
                              textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:5 }}>
                              Why this matters
                            </div>
                            <div style={{ fontSize:11, color:T.sub, lineHeight:1.6,
                              maxWidth:640 }}>
                              {issue.why}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <Hr />

        {/* ── 5. OPEN ACTIONS SUMMARY ── */}
        <div>
          <div style={{ marginBottom:10 }}><Lbl>Open Actions</Lbl></div>
          <div style={{ display:"flex", gap:0, borderRadius:7,
            border:`1px solid ${T.border}`, overflow:"hidden" }}>
            {[
              { label:"Open Recommendations", value:client.openRecs,     link:"→ Recommendations Hub",   mod:"Module 4" },
              { label:"Overdue Tasks",         value:client.openTasks,    link:"→ Project Workspace",      mod:"Module 6" },
              { label:"Active Projects",       value:client.activeProjects,link:"→ Project Workspace",    mod:"Module 6" },
            ].map((item, i) => (
              <div key={item.label} style={{ flex:1, padding:"14px 16px",
                borderRight: i < 2 ? `1px solid ${T.border}` : "none" }}>
                <div style={{ fontSize:8.5, color:T.label, fontWeight:600,
                  textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 }}>
                  {item.label}
                </div>
                <div style={{ fontSize:20, fontWeight:600, color:T.text, marginBottom:4,
                  lineHeight:1 }}>
                  {item.value}
                </div>
                <div style={{ fontSize:9, color:T.accent, cursor:"pointer" }}>{item.link}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function CompanyOverview() {
  const [clients,    setClients]  = useState([]);
  const [loading,    setLoading]  = useState(true);
  const [loadError,  setLoadError]= useState(null);
  const [selectedId, setSelId]  = useState(null);
  const [scanning,   setScanning] = useState(false);
  const [search,     setSearch]   = useState("");
  const [toast,      setToast]    = useState(null);

  useEffect(() => {
    let cancelled = false;
    ClientsAPI.list()
      .then(data => { if(!cancelled){ setClients(data); setSelId(data[0]?.id || null); setLoading(false); } })
      .catch(err => { if(!cancelled){ setLoadError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const sorted = useMemo(() =>
    clients
      .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
                               c.website.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        // At-risk first, then by FAAVI
        const ua = (a.faavi < 60 ? 100 : 0) + (a.auditAge > 60 ? 50 : 0);
        const ub = (b.faavi < 60 ? 100 : 0) + (b.auditAge > 60 ? 50 : 0);
        return ub - ua || a.faavi - b.faavi;
      }),
    [clients, search]
  );

  const selected = clients.find(c => c.id === selectedId) || null;

  const handleRescan = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      showToast("Intelligence refreshed");
      if (selected) {
        const patch = { lastScanned: "Just now" };
        setClients(prev => prev.map(c => c.id === selected.id ? { ...c, ...patch } : c));
        ClientsAPI.update(selected.id, patch).catch(() => showToast("Save failed — check connection"));
      }
    }, 1600);
  };

  if (loading) return (
    <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center",
      background:T.bg, color:T.sub, fontFamily:"'Sora',sans-serif", fontSize:12 }}>
      Loading clients…
    </div>
  );
  if (loadError) return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", background:T.bg, color:T.sub, fontFamily:"'Sora',sans-serif",
      fontSize:12, gap:8 }}>
      <div>Couldn't reach the clients API.</div>
      <div style={{ fontSize:10, color:T.label }}>{loadError}</div>
    </div>
  );

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
        <div style={{ display:"flex", alignItems:"center", marginBottom:12 }}>
          <div>
            <h1 style={{ fontFamily:"'Newsreader',serif", fontSize:18, fontWeight:600,
              color:T.text, margin:0, fontStyle:"italic" }}>Company Overview</h1>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:2 }}>
              <Lbl>Module 1 · Client Intelligence Hub</Lbl>
            </div>
          </div>
          <div style={{ flex:1 }} />
          <Btn variant="primary" onClick={() => showToast("New client form — add scan URL")}>
            + New Client
          </Btn>
        </div>

        {/* Search */}
        <div style={{ position:"relative", maxWidth:240 }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search clients…"
            style={{ ...INP, fontSize:11, padding:"5px 10px 5px 28px" }}
          />
          <span style={{ position:"absolute", left:10, top:"50%",
            transform:"translateY(-50%)", fontSize:11, color:T.label,
            pointerEvents:"none" }}>⌕</span>
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ display:"flex", flex:1, minHeight:0 }}>

        {/* Left — client list */}
        <div style={{ width:260, flexShrink:0, borderRight:`1px solid ${T.border}`,
          overflowY:"auto", padding:"10px 8px" }}>
          {sorted.length === 0 ? (
            <div style={{ padding:"40px 12px", textAlign:"center", color:T.label, fontSize:11 }}>
              No clients found
            </div>
          ) : sorted.map(c => (
            <ClientCard key={c.id} client={c}
              selected={selectedId === c.id}
              onClick={() => setSelId(c.id)} />
          ))}
        </div>

        {/* Right — detail */}
        <div style={{ flex:1, minWidth:0, overflow:"hidden", position:"relative" }}>
          {scanning && (
            <div style={{ position:"absolute", inset:0, background:"rgba(8,9,13,0.7)",
              zIndex:10, display:"flex", alignItems:"center", justifyContent:"center",
              flexDirection:"column", gap:10 }}>
              <div style={{ fontSize:11, color:T.sub }}>Refreshing intelligence…</div>
              {["Scanning digital footprint", "Scoring channels", "Updating competitor data"].map((s, i) => (
                <div key={i} style={{ fontSize:10, color:T.label }}>{s}</div>
              ))}
            </div>
          )}
          {selected ? (
            <CompanyDetail client={selected} onRescan={handleRescan} />
          ) : (
            <div style={{ flex:1, display:"flex", alignItems:"center",
              justifyContent:"center", flexDirection:"column", gap:10, height:"100%" }}>
              <div style={{ fontSize:28, color:T.mute }}>◎</div>
              <div style={{ fontSize:12, color:T.sub }}>Select a client</div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
