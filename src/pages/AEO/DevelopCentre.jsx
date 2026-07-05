/**
 * 5th Avenue — Internal OS
 * Module 5: Develop Centre
 * ─────────────────────────────────────────────────────────────────
 * Recommendation → Work Package → Verified Brief → Export
 *
 * Generation: live Anthropic API call with full company context.
 * Sections are independently editable and re-generatable.
 * Human verification required before export or project creation.
 * Export is selective — consultant chooses which sections to include.
 */

import { useState, useMemo } from "react";

// ── TOKENS ────────────────────────────────────────────────────────────────────
import { T } from "../../theme/tokens";

// ── SECTION SCHEMAS PER CHANNEL ───────────────────────────────────────────────
const SECTION_SCHEMA = {
  aeo: [
    { id:"priority",        title:"Implementation Priority List",  clientFacing:true,  desc:"Pages to update in order, with traffic rationale"            },
    { id:"faq_content",     title:"FAQ Questions & Answers",       clientFacing:true,  desc:"Ready-to-publish FAQ content for product/service pages"      },
    { id:"schema_code",     title:"Schema Markup Templates",       clientFacing:true,  desc:"JSON-LD code for developer implementation"                   },
    { id:"snippet_targets", title:"Featured Snippet Targets",      clientFacing:false, desc:"Query analysis and competitive snapshot"                     },
    { id:"content_brief",   title:"Supporting Content Brief",      clientFacing:false, desc:"Brief for missing content pages identified in audit"         },
  ],
  seo: [
    { id:"tech_checklist",  title:"Technical Fix Checklist",       clientFacing:true,  desc:"Specific, actionable fixes ordered by impact"               },
    { id:"content_briefs",  title:"Content Briefs",                clientFacing:false, desc:"Full briefs for each cluster page"                           },
    { id:"kw_cluster",      title:"Keyword Cluster Map",           clientFacing:false, desc:"Query groupings with volumes and intent classification"      },
    { id:"timeline",        title:"Implementation Timeline",       clientFacing:true,  desc:"Milestone plan with owner and deadline recommendations"      },
  ],
  meo: [
    { id:"gbp_checklist",   title:"GBP Optimisation Checklist",    clientFacing:true,  desc:"Step-by-step actions with specific copy to use"             },
    { id:"review_templates",title:"Review Response Templates",     clientFacing:true,  desc:"Response copy for positive, negative and neutral reviews"    },
    { id:"photo_brief",     title:"Photo Acquisition Brief",       clientFacing:true,  desc:"Shot list and spec for Maps listing images"                 },
    { id:"qa_seeding",      title:"Q&A Pre-Seeding Questions",     clientFacing:true,  desc:"Questions and answers to seed on the GBP listing"           },
  ],
  ai: [
    { id:"article_briefs",  title:"Article Briefs",                clientFacing:false, desc:"Structure and citation requirements for citation-building articles" },
    { id:"entity_page",     title:"Brand Entity Definition",       clientFacing:true,  desc:"Canonical brand description to deploy across all profiles"   },
    { id:"publisher_list",  title:"Publisher Target List",         clientFacing:false, desc:"Prioritised outreach targets for authority placement"        },
    { id:"faq_hub",         title:"FAQ Hub Content Structure",     clientFacing:true,  desc:"Architecture and initial content for brand FAQ hub"          },
  ],
  reviews: [
    { id:"response_lib",    title:"Response Template Library",     clientFacing:true,  desc:"Templates for all review scenarios with personalisation guide" },
    { id:"acq_workflow",    title:"Review Acquisition Workflow",   clientFacing:true,  desc:"Triggered campaign to grow review volume from existing customers" },
    { id:"monitoring",      title:"Monitoring Setup Guide",        clientFacing:true,  desc:"Platform-by-platform alert configuration instructions"      },
  ],
  pr: [
    { id:"story_angles",    title:"Story Angle Briefs",            clientFacing:false, desc:"3 press-ready narratives with supporting data points"        },
    { id:"media_list",      title:"Target Media List",             clientFacing:false, desc:"25 prioritised outlets with contact details and rationale"   },
    { id:"outreach_seq",    title:"Outreach Sequence",             clientFacing:false, desc:"7-touch email sequence with copy"                           },
    { id:"press_release",   title:"Press Release Draft",           clientFacing:false, desc:"First draft ready for client review and publication"        },
  ],
  social: [
    { id:"pillars",         title:"Content Pillar Framework",      clientFacing:true,  desc:"Brand voice, content buckets, and posting rationale"        },
    { id:"calendar",        title:"60-Day Content Calendar",       clientFacing:true,  desc:"Post-by-post plan with format, hook and caption direction"  },
    { id:"format_brief",    title:"Format Testing Brief",          clientFacing:false, desc:"A/B test plan for Reels vs Static vs Carousel"             },
  ],
};

// ── WORK PACKAGES ─────────────────────────────────────────────────────────────
const INIT_PACKAGES = [
  { id:"wp1", cid:"fb", recId:"r01", ch:"aeo", title:"AEO Schema & FAQ Implementation — FreshBite",
    status:"review", owner:"t4", created:"3 days ago", priority:81,
    rec:{ issue:"Zero schema markup across 14 product pages. Yoga Bar has FAQ schema on 11/12.", insight:"Without schema FreshBite cannot win featured snippets regardless of content quality.", recommendation:"Implement FAQ + Product schema on all 14 pages." },
    company:{ name:"FreshBite Foods", industry:"Food & Beverage", model:"D2C healthy snacks", market:"Urban India, Tier-1 & 2", competitors:["Yoga Bar","Happilo","Too Yumm"] },
  },
  { id:"wp2", cid:"fb", recId:"r02", ch:"ai", title:"AI Citation Campaign — FreshBite",
    status:"draft", owner:"t6", created:"3 days ago", priority:24,
    rec:{ issue:"FreshBite cited zero times across 5 AI platforms. Happilo cited in all 5.", insight:"AI search share growing 40% YoY. Absence compounds as competitor associations solidify.", recommendation:"3 expert comparison articles, FAQ pages, seed on 5 authority publications." },
    company:{ name:"FreshBite Foods", industry:"Food & Beverage", model:"D2C healthy snacks", market:"Urban India, Tier-1 & 2", competitors:["Yoga Bar","Happilo","Too Yumm"] },
  },
  { id:"wp3", cid:"nb", recId:"r13", ch:"aeo", title:"AEO Content Strategy — NutriBlend",
    status:"draft", owner:"t1", created:"1 day ago", priority:24,
    rec:{ issue:"Competitor owns AI answer for 'best protein powder India' across all platforms.", insight:"Consumers researching protein use these exact queries before purchase.", recommendation:"3 comparison articles with clinical citations. Prioritise Perplexity first." },
    company:{ name:"NutriBlend India", industry:"Nutrition & Supplements", model:"D2C protein supplements", market:"Gym-goers, urban fitness community", competitors:["MuscleBlaze","Myprotein India","Fast&Up"] },
  },
  { id:"wp4", cid:"ch", recId:"r15", ch:"meo", title:"GBP Claim & Optimisation — CraftHome",
    status:"approved", owner:"t2", created:"5 days ago", priority:32,
    rec:{ issue:"Showroom unclaimed on Google Maps. Competitor Pepperfry has 3 claimed listings within 5km.", insight:"Unclaimed GBP = zero local visibility. Maps also feeds AI local recommendations.", recommendation:"Claim GBP, optimise categories, add 20 photos, respond to all reviews." },
    company:{ name:"CraftHome Decor", industry:"Home Decor", model:"D2C + offline showroom, handcrafted products", market:"Bengaluru + pan-India online", competitors:["Pepperfry","Urban Ladder","WoodenStreet"] },
  },
  { id:"wp5", cid:"df", recId:"r18", ch:"seo", title:"SEO Content Programme — DermFirst",
    status:"draft", owner:"t3", created:"Today", priority:18,
    rec:{ issue:"Minimalist outranks on 28 of 35 shared keywords. Avg position gap: 6.2.", insight:"Domain authority + content depth deficit requires sustained programme.", recommendation:"6-month content programme targeting 28 underperforming keywords." },
    company:{ name:"DermFirst", industry:"Skincare & Dermatology", model:"D2C dermatologist-formulated skincare", market:"Urban Indian women 22–40", competitors:["Minimalist","Dot & Key","The Derma Co."] },
  },
];

// ── PRE-GENERATED CONTENT (wp1 — FreshBite AEO) ───────────────────────────────
const PREGENERATED = {
  wp1: {
    priority:`IMPLEMENTATION ORDER — based on organic traffic × snippet opportunity

1. Millet Snacks Range page  — est. 2,400 sessions/mo at risk  — HIGHEST PRIORITY
2. Protein Bars product page — est. 1,800 sessions/mo at risk
3. Roasted Seeds Collection  — est. 1,200 sessions/mo at risk
4. Low-Sugar Biscuits page   — est. 900 sessions/mo at risk
5. Snack Subscription Box    — est. 600 sessions/mo at risk

Complete in this order. All 5 pages can be done in a single developer sprint (est. 4–6 hours total). Validate each page in Google's Rich Results Test before moving to the next.`,

    faq_content:`MILLET SNACKS PAGE — READY-TO-PUBLISH FAQ

Q: What makes FreshBite millet snacks a healthier choice?
A: FreshBite millet snacks are made with finger millet (ragi) and foxtail millet — ancient grains naturally rich in fibre, calcium and complex carbohydrates. They contain no maida, no artificial preservatives and no added MSG. Each serving provides sustained energy release without the blood sugar spike associated with refined flour snacks.

Q: Are FreshBite millet snacks suitable for people with diabetes?
A: Yes. Millets have a low glycaemic index (GI 50–54, compared to maida's GI of 70+), which means they cause a slower, more gradual rise in blood sugar. Our millet snacks are also free from refined sugar. We recommend consulting your physician regarding specific dietary needs.

Q: How much fibre does one serving contain?
A: One 30g serving of FreshBite Millet Crunchies contains 3.2g of dietary fibre — approximately 11% of the recommended daily intake — supporting digestive health and sustained satiety between meals.

Q: Do FreshBite snacks contain artificial colours or flavours?
A: No. FreshBite uses only natural flavouring agents from spices and herbs. All products are free from artificial colours (no tartrazine, no Sunset Yellow), artificial flavours and artificial preservatives. Full ingredient lists appear on each product page.

Q: What is the shelf life of FreshBite millet snacks?
A: 6 months from manufacture date when stored in a cool, dry place away from direct sunlight. Once opened, consume within 7 days for optimal freshness.`,

    schema_code:`<!-- PASTE IN <head> OF MILLET SNACKS PRODUCT PAGE -->

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What makes FreshBite millet snacks a healthier choice?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "FreshBite millet snacks are made with finger millet (ragi) and foxtail millet — ancient grains rich in fibre, calcium and complex carbohydrates. No maida, no artificial preservatives, no added MSG."
      }
    },
    {
      "@type": "Question",
      "name": "Are FreshBite millet snacks suitable for people with diabetes?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Millets have a low glycaemic index (GI 50–54 vs maida's GI of 70+), causing a slower rise in blood sugar. Our millet snacks are free from refined sugar."
      }
    },
    {
      "@type": "Question",
      "name": "Do FreshBite snacks contain artificial colours or flavours?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. FreshBite uses only natural flavouring agents. Products are free from artificial colours, artificial flavours and artificial preservatives."
      }
    }
  ]
}
</script>

<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "Product",
  "name": "FreshBite Millet Crunchies",
  "description": "Healthy millet-based snacks made with ragi and foxtail millet. No maida, no artificial preservatives, low GI.",
  "brand": { "@type": "Brand", "name": "FreshBite Foods" },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.4",
    "reviewCount": "127"
  }
}
</script>`,

    snippet_targets:`FEATURED SNIPPET OPPORTUNITY MAP

"best low sugar snacks india" — 8,400/mo
  Current owner: Yoga Bar blog (paragraph snippet)
  Gap: No FreshBite editorial content. Product page exists but no comparison content.
  Action: Comparative article — FreshBite as primary recommendation.

"are millet snacks healthy" — 2,900/mo
  Current owner: HealthifyMe article (list snippet)
  Gap: FreshBite not in top 5 despite being the most relevant brand.
  Action: FAQ content on millet page will directly compete. Deploy schema first.

"healthy snacks for office india" — 4,200/mo
  Current owner: Rotating — no strong single owner (prime opportunity)
  Gap: No FreshBite content page targeting this query.
  Action: Pillar content page — see Content Brief section.

"snacks for diabetics india" — 3,100/mo
  Current owner: Diabetes.co.in (paragraph snippet)
  Gap: FreshBite FAQ answer on diabetes-suitability will compete. Add clinical citation.
  Action: Ensure FAQ answer cites a peer-reviewed source (e.g. ICMR GI guidelines).`,

    content_brief:`CONTENT BRIEF — "The 12 Healthiest Office Snacks in India (2025)"

Target keyword:  healthy office snacks india (4,200/mo) + 8 related terms
Word count:      1,800–2,200 words
Snippet target:  List snippet (best format for this query type)
AI target:       Yes — structure for Perplexity + ChatGPT extraction

STRUCTURE
H1:  The 12 Healthiest Office Snacks You Can Buy in India (2025)
H2:  Why Most Office Snacks Fail the Health Test
H2:  What to Look For in a Healthy Office Snack [use checklist format]
H2:  12 Best Healthy Office Snacks in India
  H3: FreshBite Millet Crunchies [include Product schema + internal link]
  H3: FreshBite Roasted Seeds Mix [internal link]
  H3: [5 generic options — no direct competitor names]
H2:  How to Build a Healthy Snacking Routine at Work [HowTo schema]
H2:  Frequently Asked Questions [FAQ schema — 4 questions minimum]

INTERNAL LINKS REQUIRED
→ Millet Snacks product page
→ Protein Bars product page
→ Subscription Box page

SCHEMA REQUIRED:  Article + FAQ + HowTo
PRIMARY CTA:      FreshBite office snack subscription (include discount code if available)`
  }
};

// ── TEAM ─────────────────────────────────────────────────────────────────────
const TEAM = [
  { id:"t1", name:"Priya Nair",  init:"PN", role:"Consultant"     },
  { id:"t2", name:"Vikram Das",  init:"VD", role:"Consultant"     },
  { id:"t3", name:"Arjun Reddy", init:"AR", role:"Sr. Strategist" },
  { id:"t4", name:"Sneha Iyer",  init:"SI", role:"AEO Specialist" },
  { id:"t5", name:"Meera Joshi", init:"MJ", role:"SEO Analyst"    },
  { id:"t6", name:"Karan Shah",  init:"KS", role:"Content Lead"   },
];
const getTeam = id => TEAM.find(t => t.id === id);

// ── HELPERS ───────────────────────────────────────────────────────────────────
const chColor  = c => ({ aeo:T.accent, seo:T.green, meo:T.amber, ai:T.purple,
  reviews:"#C47ABF", social:"#4ADE80", pr:T.accent, default:T.sub })[c] || T.sub;
const chLabel  = c => ({ aeo:"AEO", seo:"SEO", meo:"Maps / MEO", ai:"AI Presence",
  reviews:"Reviews", social:"Social", pr:"PR", default:c })[c] || c?.toUpperCase();
const statusColor = s => ({ draft:T.sub, generating:T.amber, review:T.accent,
  approved:T.green, exported:T.purple, project:T.green })[s] || T.sub;
const statusLabel = s => ({ draft:"Draft", generating:"Generating…", review:"In Review",
  approved:"Approved", exported:"Exported", project:"In Project" })[s] || s;

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
    primary:{ background:T.accent, color:"#07080D", fontWeight:600 },
    ghost:  { background:T.hover,  color:T.sub, border:`1px solid ${T.border}` },
    subtle: { background:"transparent", color:T.label, border:`1px solid ${T.border}` },
    green:  { background:`${T.green}18`, color:T.green, border:`1px solid ${T.green}30` },
    danger: { background:"transparent", color:T.red, border:`1px solid ${T.red}22` },
  };
  return <button onClick={onClick} disabled={disabled}
    style={{...b,...(v[variant]||v.ghost),...style}}>{children}</button>;
}
const INP = { width:"100%", padding:"7px 10px", borderRadius:5, background:T.raised,
  border:`1px solid ${T.border}`, color:T.text, fontSize:11,
  fontFamily:"'Sora'", outline:"none" };

// ── SECTION BLOCK ─────────────────────────────────────────────────────────────
function SectionBlock({ schema, content, onRegenerate, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft  ] = useState(content || "");
  const [regening,setRegen  ] = useState(false);

  const handleRegen = () => {
    setRegen(true);
    setTimeout(() => { setRegen(false); }, 1400);
  };

  return (
    <div style={{ borderRadius:7, border:`1px solid ${T.border}`,
      background:T.raised, overflow:"hidden", marginBottom:10 }}>

      {/* Section header */}
      <div style={{ padding:"9px 14px", borderBottom:`1px solid ${T.border}`,
        display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ fontSize:11, fontWeight:600, color:T.text, flex:1 }}>
          {schema.title}
        </span>
        <span style={{ fontSize:8.5, fontWeight:600,
          color: schema.clientFacing ? T.green : T.label,
          padding:"1px 6px", borderRadius:3,
          border:`1px solid ${schema.clientFacing ? T.green+"30" : T.border}`,
          background: schema.clientFacing ? `${T.green}10` : "transparent" }}>
          {schema.clientFacing ? "Client-facing" : "Internal"}
        </span>
        <span style={{ fontSize:8.5, color:T.sub }}>{schema.desc}</span>
        <button onClick={() => setEditing(!editing)}
          style={{ fontSize:9, color:T.accent, background:"transparent",
            border:"none", cursor:"pointer", fontFamily:"'Sora'" }}>
          {editing ? "Done" : "Edit"}
        </button>
        <button onClick={handleRegen} disabled={regening}
          style={{ fontSize:9, color:T.sub, background:"transparent",
            border:"none", cursor:"pointer", fontFamily:"'Sora'",
            opacity:regening?0.4:1 }}>
          {regening ? "Generating…" : "↺ Regenerate"}
        </button>
      </div>

      {/* Section content */}
      <div style={{ padding:"12px 14px" }}>
        {editing ? (
          <div>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={Math.min(20, draft.split("\n").length + 2)}
              style={{ ...INP, resize:"vertical", fontSize:10.5,
                lineHeight:1.65, fontFamily:"monospace" }} />
            <div style={{ marginTop:8, display:"flex", gap:6 }}>
              <Btn variant="primary" onClick={() => { onEdit && onEdit(draft); setEditing(false); }}
                style={{ fontSize:9.5, padding:"4px 10px" }}>
                Save changes
              </Btn>
              <Btn variant="subtle" onClick={() => { setDraft(content||""); setEditing(false); }}
                style={{ fontSize:9.5, padding:"4px 10px" }}>
                Discard
              </Btn>
            </div>
          </div>
        ) : (
          <pre style={{ fontSize:10.5, color:T.text, lineHeight:1.7,
            fontFamily:"'Sora'", whiteSpace:"pre-wrap", wordBreak:"break-word",
            margin:0 }}>
            {regening ? <span style={{ color:T.sub }}>Regenerating section…</span> : (draft || content)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── EXPORT MODAL ──────────────────────────────────────────────────────────────
function ExportModal({ wp, sections, generatedContent, onClose, showToast }) {
  const schema = SECTION_SCHEMA[wp.ch] || [];
  const [selected, setSelected] = useState(() => {
    const init = {};
    schema.forEach(s => { init[s.id] = s.clientFacing; }); // client-facing pre-ticked
    return init;
  });

  const toggle = id => setSelected(p => ({ ...p, [id]:!p[id] }));
  const count  = Object.values(selected).filter(Boolean).length;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)",
      zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width:480, background:T.surface, borderRadius:10,
        border:`1px solid ${T.borderMid}`, overflow:"hidden" }}>

        {/* Modal header */}
        <div style={{ padding:"14px 18px", borderBottom:`1px solid ${T.border}`,
          display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:13, fontWeight:600, color:T.text, flex:1 }}>
            Build Export
          </span>
          <span style={{ fontSize:9.5, color:T.sub }}>{count} section{count!==1?"s":""} selected</span>
          <button onClick={onClose}
            style={{ background:"transparent", border:"none", color:T.sub,
              fontSize:14, cursor:"pointer" }}>✕</button>
        </div>

        {/* Section checklist */}
        <div style={{ padding:"14px 18px", maxHeight:320, overflowY:"auto" }}>
          <div style={{ marginBottom:10, fontSize:9.5, color:T.sub, lineHeight:1.5 }}>
            Client-facing sections are pre-selected. These are items the client needs
            to act on directly — modify their website, update their listings, etc.
          </div>
          {schema.map(s => (
            <div key={s.id} onClick={() => toggle(s.id)}
              style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0",
                borderBottom:`1px solid ${T.border}`, cursor:"pointer" }}>
              <div style={{ width:16, height:16, borderRadius:3, flexShrink:0,
                border:`1px solid ${selected[s.id] ? T.accent : T.border}`,
                background: selected[s.id] ? `${T.accent}20` : "transparent",
                display:"flex", alignItems:"center", justifyContent:"center" }}>
                {selected[s.id] && (
                  <span style={{ fontSize:10, color:T.accent, fontWeight:700 }}>✓</span>
                )}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:T.text, fontWeight:500 }}>
                  {s.title}
                </div>
                <div style={{ fontSize:9, color:T.sub }}>{s.desc}</div>
              </div>
              <span style={{ fontSize:8.5, fontWeight:600,
                color: s.clientFacing ? T.green : T.label }}>
                {s.clientFacing ? "Client" : "Internal"}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding:"12px 18px", borderTop:`1px solid ${T.border}`,
          display:"flex", gap:8 }}>
          <Btn variant="primary" disabled={count === 0}
            onClick={() => { showToast(`Export generated — ${count} sections`); onClose(); }}
            style={{ flex:1, justifyContent:"center", fontSize:10.5 }}>
            Generate Export ({count} sections)
          </Btn>
          <Btn variant="ghost" onClick={onClose} style={{ fontSize:10.5 }}>
            Cancel
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── GENERATION STAGES ─────────────────────────────────────────────────────────
const GEN_STAGES = [
  "Loading company context…",
  "Analysing recommendation…",
  "Selecting content strategy…",
  "Generating section content…",
  "Structuring deliverables…",
  "Finalising work package…",
];

// ── WORK PACKAGE DETAIL ───────────────────────────────────────────────────────
function WorkPackageDetail({ wp, onStatusChange, showToast }) {
  const [genStage,  setGenStage]  = useState(-1);
  const [generated, setGenerated] = useState(!!PREGENERATED[wp.id]);
  const [content,   setContent]   = useState(PREGENERATED[wp.id] || {});
  const [showExport,setShowExport]= useState(false);
  const [verifyNote,setVerifyNote]= useState("");
  const [verifier,  setVerifier]  = useState("t2");

  const schema   = SECTION_SCHEMA[wp.ch] || [];
  const owner    = getTeam(wp.owner);
  const isReview = wp.status === "review";
  const isApproved = wp.status === "approved";

  // ── REAL API CALL ─────────────────────────────────────────────────────────
  // Production: call through a server-side proxy (never expose API keys client-side)
  //
  // const systemPrompt = `You are an expert marketing strategist for ${wp.company.name},
  //   a ${wp.company.industry} company. Model: ${wp.company.model}.
  //   Market: ${wp.company.market}. Key competitors: ${wp.company.competitors.join(", ")}.
  //   Generate a structured ${chLabel(wp.ch)} work package based on the following
  //   recommendation. Return valid JSON with keys matching: ${schema.map(s=>s.id).join(", ")}.
  //   Each key should contain implementation-ready content a team can act on directly.`;
  //
  // const response = await fetch("https://api.anthropic.com/v1/messages", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({
  //     model: "claude-sonnet-4-20250514",
  //     max_tokens: 4000,
  //     system: systemPrompt,
  //     messages: [{ role:"user", content:
  //       `Recommendation: ${wp.rec.recommendation}\n` +
  //       `Issue: ${wp.rec.issue}\n` +
  //       `Insight: ${wp.rec.insight}` }]
  //   })
  // });
  // const data = await response.json();
  // const text = data.content.map(i => i.text || "").join("");
  // const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
  // ─────────────────────────────────────────────────────────────────────────

  const runGeneration = () => {
    onStatusChange(wp.id, "generating");
    setGenStage(0);
    let s = 0;
    const iv = setInterval(() => {
      s++;
      setGenStage(s);
      if (s >= GEN_STAGES.length - 1) {
        clearInterval(iv);
        setTimeout(() => {
          // Simulate API response with channel-appropriate placeholder content
          const mock = {};
          schema.forEach(sec => {
            mock[sec.id] =
              `[AI-generated content for "${sec.title}" would appear here]\n\n` +
              `Context used:\n— Company: ${wp.company.name} (${wp.company.industry})\n` +
              `— Rec: ${wp.rec.recommendation}\n— Competitors: ${wp.company.competitors.join(", ")}\n\n` +
              `In production, the Anthropic API returns fully structured, implementation-ready\n` +
              `content specific to this company, channel and recommendation context.`;
          });
          setContent(mock);
          setGenerated(true);
          onStatusChange(wp.id, "review");
          setGenStage(-1);
        }, 600);
      }
    }, 450);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

      {/* ── WP HEADER ── */}
      <div style={{ padding:"13px 20px", borderBottom:`1px solid ${T.border}`,
        flexShrink:0, background:T.surface }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <span style={{ fontSize:9, fontWeight:700, color:chColor(wp.ch),
                textTransform:"uppercase" }}>{chLabel(wp.ch)}</span>
              <span style={{ fontSize:9, color:T.sub }}>·</span>
              <span style={{ fontSize:9, color:T.sub }}>Priority {wp.priority}</span>
              <span style={{ fontSize:9, color:T.sub }}>·</span>
              <span style={{ fontSize:9, color:T.sub }}>{wp.created}</span>
            </div>
            <div style={{ fontSize:14, fontWeight:600, color:T.text }}>
              {wp.title}
            </div>
          </div>

          <div style={{ display:"flex", alignItems:"center",
            gap:10, flexShrink:0 }}>
            <span style={{ fontSize:10, fontWeight:500,
              color:statusColor(wp.status) }}>
              {statusLabel(wp.status)}
            </span>
            {owner && (
              <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                <Av init={owner.init} size={20} />
                <span style={{ fontSize:9.5, color:T.sub }}>{owner.name}</span>
              </div>
            )}

            {!generated && wp.status !== "generating" && (
              <Btn variant="primary" onClick={runGeneration}
                style={{ fontSize:9.5, padding:"5px 12px" }}>
                Generate with AI →
              </Btn>
            )}
            {generated && !isApproved && (
              <Btn variant="ghost"
                onClick={() => onStatusChange(wp.id, "review")}
                style={{ fontSize:9.5, padding:"5px 12px" }}>
                Submit for Review
              </Btn>
            )}
            {isReview && (
              <Btn variant="green" onClick={() => onStatusChange(wp.id, "approved")}
                style={{ fontSize:9.5, padding:"5px 12px" }}>
                ✓ Approve
              </Btn>
            )}
            {isApproved && (
              <Btn variant="ghost" onClick={() => setShowExport(true)}
                style={{ fontSize:9.5, padding:"5px 12px" }}>
                Build Export
              </Btn>
            )}
          </div>
        </div>
      </div>

      {/* ── SCROLLABLE BODY ── */}
      <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>

        {/* Rec + company context */}
        <div style={{ marginBottom:16 }}>
          <div style={{ marginBottom:8 }}><Lbl>Recommendation Context</Lbl></div>
          <div style={{ borderRadius:7, border:`1px solid ${T.border}`,
            background:T.raised, overflow:"hidden" }}>
            {[
              { l:"Company",  v:`${wp.company.name} · ${wp.company.industry}` },
              { l:"Model",    v:wp.company.model },
              { l:"Market",   v:wp.company.market },
              { l:"vs.",      v:wp.company.competitors.join(" · ") },
              { l:"Issue",    v:wp.rec.issue },
              { l:"Insight",  v:wp.rec.insight },
              { l:"Action",   v:wp.rec.recommendation },
            ].map(({ l, v }, i) => (
              <div key={l} style={{ display:"flex", gap:12, padding:"7px 14px",
                borderBottom: i < 6 ? `1px solid ${T.border}` : "none",
                background: i%2===0 ? "transparent" : T.hover }}>
                <Lbl style={{ width:70, flexShrink:0, paddingTop:2 }}>{l}</Lbl>
                <span style={{ fontSize:10.5, color:T.text, lineHeight:1.5 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <Hr style={{ marginBottom:16 }} />

        {/* Generation progress */}
        {genStage >= 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ marginBottom:8 }}><Lbl>Generating</Lbl></div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {GEN_STAGES.map((s, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8,
                  fontSize:10.5,
                  color: i < genStage ? T.sub : i === genStage ? T.text : T.label }}>
                  <span style={{ fontSize:10, flexShrink:0, width:14,
                    color: i < genStage ? T.green : i === genStage ? T.accent : T.mute }}>
                    {i < genStage ? "✓" : i === genStage ? "◎" : "○"}
                  </span>
                  {s}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Draft / generate prompt */}
        {!generated && genStage < 0 && (
          <div style={{ padding:"32px 20px", textAlign:"center",
            border:`1px solid ${T.border}`, borderRadius:8, background:T.raised }}>
            <div style={{ fontSize:22, color:T.mute, marginBottom:12 }}>◎</div>
            <div style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:6 }}>
              Ready to generate work package
            </div>
            <div style={{ fontSize:10.5, color:T.sub, marginBottom:16,
              maxWidth:420, margin:"0 auto 16px" }}>
              Claude will use the full company context above to generate
              implementation-ready content for each deliverable section.
            </div>
            <Btn variant="primary" onClick={runGeneration}
              style={{ fontSize:10.5, padding:"7px 18px" }}>
              Generate with AI →
            </Btn>
          </div>
        )}

        {/* Generated sections */}
        {generated && genStage < 0 && (
          <div>
            <div style={{ display:"flex", alignItems:"center",
              gap:8, marginBottom:12 }}>
              <Lbl>Generated Work Package</Lbl>
              <span style={{ fontSize:9.5, color:T.sub }}>
                {schema.filter(s => s.clientFacing).length} client-facing ·
                {" "}{schema.filter(s => !s.clientFacing).length} internal
              </span>
            </div>
            {schema.map(sec => (
              <SectionBlock
                key={sec.id}
                schema={sec}
                content={content[sec.id] || ""}
                onEdit={val => setContent(p => ({ ...p, [sec.id]:val }))} />
            ))}
          </div>
        )}

        {/* Verification panel */}
        {generated && (isReview || isApproved) && (
          <>
            <Hr style={{ margin:"16px 0" }} />
            <div>
              <div style={{ marginBottom:10 }}><Lbl>Human Verification</Lbl></div>
              <div style={{ padding:"14px 16px", borderRadius:7,
                border:`1px solid ${isApproved ? T.green+"30" : T.border}`,
                background: isApproved ? `${T.green}06` : T.raised }}>
                <div style={{ display:"flex", alignItems:"center",
                  gap:10, marginBottom:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:T.text,
                      marginBottom:3 }}>
                      {isApproved ? "✓ Approved" : "Awaiting approval"}
                    </div>
                    <div style={{ fontSize:9.5, color:T.sub }}>
                      {isApproved
                        ? "Work package approved. Export available."
                        : "Review all sections before approving. Approved packages can be exported."}
                    </div>
                  </div>
                  <select value={verifier} onChange={e => setVerifier(e.target.value)}
                    style={{ background:T.raised, border:`1px solid ${T.border}`,
                      color:T.text, fontFamily:"'Sora'", fontSize:10,
                      padding:"4px 22px 4px 8px", borderRadius:4, outline:"none",
                      appearance:"none", backgroundImage:`url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3e%3cpath fill='%2328283A' d='M4 6L0 2h8z'/%3e%3c/svg%3e")`,
                      backgroundRepeat:"no-repeat", backgroundPosition:"right 6px center" }}>
                    {TEAM.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                <textarea rows={2} value={verifyNote}
                  onChange={e => setVerifyNote(e.target.value)}
                  placeholder="Review notes or change requests…"
                  style={{ ...INP, resize:"vertical", fontSize:10.5,
                    marginBottom:10 }} />

                {!isApproved && (
                  <div style={{ display:"flex", gap:6 }}>
                    <Btn variant="green"
                      onClick={() => { onStatusChange(wp.id, "approved");
                        showToast("Work package approved"); }}
                      style={{ fontSize:9.5, padding:"5px 12px" }}>
                      ✓ Approve Work Package
                    </Btn>
                    <Btn variant="danger"
                      onClick={() => { onStatusChange(wp.id, "draft");
                        setGenerated(false);
                        showToast("Returned for revision"); }}
                      style={{ fontSize:9.5, padding:"5px 12px" }}>
                      Request Changes
                    </Btn>
                  </div>
                )}

                {isApproved && (
                  <Btn variant="primary" onClick={() => setShowExport(true)}
                    style={{ fontSize:9.5, padding:"5px 12px" }}>
                    Build Export →
                  </Btn>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {showExport && (
        <ExportModal wp={wp} schema={schema}
          generatedContent={content}
          onClose={() => setShowExport(false)}
          showToast={showToast} />
      )}
    </div>
  );
}

// ── LEFT PANEL CARD ───────────────────────────────────────────────────────────
function WPCard({ wp, selected, onClick }) {
  return (
    <div onClick={onClick}
      style={{ padding:"11px 12px", borderRadius:6, cursor:"pointer",
        marginBottom:3, transition:"all 0.12s",
        background:selected ? T.raised : "transparent",
        border:`1px solid ${selected ? T.borderMid : "transparent"}` }}
      onMouseOver={e => { if (!selected) e.currentTarget.style.background = T.hover; }}
      onMouseOut={e  => { if (!selected) e.currentTarget.style.background = "transparent"; }}>
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"center", marginBottom:4 }}>
        <span style={{ fontSize:9, fontWeight:700, color:chColor(wp.ch),
          textTransform:"uppercase" }}>{chLabel(wp.ch)}</span>
        <span style={{ fontSize:9, color:statusColor(wp.status), fontWeight:500 }}>
          {statusLabel(wp.status)}
        </span>
      </div>
      <div style={{ fontSize:11.5, fontWeight:500, color:T.text,
        lineHeight:1.35, marginBottom:6 }}>{wp.title}</div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ fontSize:9, color:T.sub }}>{wp.created}</span>
        <span style={{ color:T.mute }}>·</span>
        <span style={{ fontSize:9, color:T.sub }}>P {wp.priority}</span>
        <div style={{ flex:1 }} />
        {(() => { const o = getTeam(wp.owner); return o ?
          <span style={{ fontSize:8.5, color:T.sub }}>{o.init}</span> : null; })()}
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function DevelopCentre() {
  const [packages,  setPackages] = useState(INIT_PACKAGES);
  const [selectedId,setSelected] = useState("wp1");
  const [toast,     setToast]    = useState(null);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const handleStatus = (id, status) => {
    setPackages(p => p.map(wp => wp.id === id ? { ...wp, status } : wp));
  };

  const selected = packages.find(p => p.id === selectedId);

  const byStatus = order => packages.filter(wp =>
    ({ draft:["draft","generating"], review:["review"], approved:["approved","exported","project"] })[order]
    ?.includes(wp.status)
  );

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
              color:T.text, margin:0, fontStyle:"italic" }}>Develop Centre</h1>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:2 }}>
              <Lbl>Module 5 · Recommendation → Work Package → Verified Brief</Lbl>
            </div>
          </div>
          <div style={{ flex:1 }} />
          <div style={{ display:"flex", gap:20, marginRight:16 }}>
            {[
              { l:"Draft",    v:byStatus("draft").length,    c:T.sub   },
              { l:"In Review",v:byStatus("review").length,   c:T.accent },
              { l:"Approved", v:byStatus("approved").length, c:T.green  },
            ].map(s => (
              <div key={s.l} style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                <span style={{ fontSize:18, fontWeight:600, color:s.c, lineHeight:1 }}>{s.v}</span>
                <span style={{ fontSize:9, color:T.label }}>{s.l}</span>
              </div>
            ))}
          </div>
          <Btn variant="primary">+ New Work Package</Btn>
        </div>
      </div>

      {/* BODY */}
      <div style={{ display:"flex", flex:1, minHeight:0 }}>

        {/* Left — package list */}
        <div style={{ width:270, flexShrink:0, borderRight:`1px solid ${T.border}`,
          overflowY:"auto", padding:"10px 8px" }}>

          {[["Draft",byStatus("draft")],["In Review",byStatus("review")],["Approved",byStatus("approved")]].map(([label,list]) =>
            list.length > 0 && (
              <div key={label} style={{ marginBottom:14 }}>
                <div style={{ padding:"4px 4px 6px",
                  display:"flex", alignItems:"center", gap:6 }}>
                  <Lbl>{label}</Lbl>
                  <span style={{ fontSize:9, color:T.label, padding:"0px 5px",
                    background:T.mute, borderRadius:8 }}>{list.length}</span>
                </div>
                {list.map(wp => (
                  <WPCard key={wp.id} wp={wp}
                    selected={selectedId === wp.id}
                    onClick={() => setSelected(wp.id)} />
                ))}
              </div>
            )
          )}
        </div>

        {/* Right — detail */}
        <div style={{ flex:1, minWidth:0, overflow:"hidden" }}>
          {selected
            ? <WorkPackageDetail key={selected.id} wp={selected}
                onStatusChange={handleStatus} showToast={showToast} />
            : <div style={{ height:"100%", display:"flex", alignItems:"center",
                justifyContent:"center", flexDirection:"column", gap:10 }}>
                <div style={{ fontSize:22, color:T.mute }}>◎</div>
                <div style={{ fontSize:12, color:T.sub }}>Select a work package</div>
              </div>
          }
        </div>
      </div>

    </div>
  );
}
