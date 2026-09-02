/**
 * 5th Avenue — Internal Operations: Campaigns
 * ──────────────────────────────────────────────────────────
 * The IM board. Brand-grouped campaign tiles, a forked finance/execution
 * pipeline per campaign, and the deliverables + team + P&L tabs behind each.
 */
 import { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect, forwardRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useOutletContext } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { CampaignsAPI, InstagramAPI, YouTubeAPI, PostMetricsAPI, InvoicesAPI, ExpensesAPI, ClientPOsAPI, PurchaseOrdersAPI, QuotesAPI, ClientsAPI, InvoicePdfAPI, UsersAPI, CreatorsAPI } from "../../lib/api";
import { can } from "../../lib/rbac";
import { validateCreatorDetails, requiredForPayType, validateField, sanitizeField } from "../../lib/validators";
import { fmtCompact, fmtINR, fmtCPV, prettyDate, prettyDateTime, initials, ISO_DATE, todayISO, isoDay } from "../../lib/format";
import { useBrandAccents } from "../../lib/brandAccent";
import { settleSchedule } from "../../lib/invoiceMoney";
import { creatorBudgetOf, numReqOf, costOf, clientCostOf, agencyFeeOf, baseBudgetOf, normCreator, creatorExpensePlan, isLockedCreator, canSeeCampaign, creatorKeyOf,
         PIPELINE, PL_IDS, COMMON_STAGES, FIN_STAGES, EXEC_STAGES, EXEC_NODES,
         normStage, stageIdx, extUrl, rosterReady, rosterGap, poGaps, hasBudget, budgetPending, lockedCountOf,
         perCreatorDelivOf, delivTargetOf, totalDelivOf, liveLinksOf, withLiveLinks, delivDoneOf, creatorLive,
         teamComplete, briefLocked, assetIn, execStats, execDone, briefGaps, executionStageOf,
         CREATOR_PAY_STATUSES, creatorPayStatusOf, creatorPayStats,
         createdAtOf } from "../../lib/campaign";
import MoneyInput from "../../components/MoneyInput";
import DateInput from "../../components/DateInput";
import PhoneInput from "../../components/PhoneInput";
import BrandPicker from "../../components/BrandPicker";
import BrandLogoModal from "../../components/BrandLogoModal";
import { zoomOf } from "../../lib/zoom";
import CreatorHandle from "../../components/CreatorHandle";
import AvatarPicker from "../../components/AvatarPicker";
import Donut from "../../components/Donut";

// ── TOKENS ───────────────────────────────────────────────────────────────────
import { T as BASE_T } from "../../theme/tokens";

// Stage → colour, layered on top of the shared theme. Both tracks are keyed
// into one map: the fork means a campaign has two live nodes at once, and
// giving each track its own palette would be two legends to learn.
//
// Execution and Creator Payment stay amber/teal for their entire duration —
// they are the nodes with work actually in flight, so they never read
// "settled" until the campaign hands off.
const T = {
  ...BASE_T,
  sc: {
    draft:            BASE_T.label,
    brief_locked:     BASE_T.accent,
    team_assigned:    BASE_T.purple,
    // Finance track
    po_raised:        BASE_T.teal,
    advance_received: BASE_T.accent,
    invoice_raised:   BASE_T.amber,
    payment_done:     BASE_T.green,
    // Execution track
    execution:        BASE_T.amber,
    creator_payment:  BASE_T.teal,
  },
};

// ── API STUBS ────────────────────────────────────────────────────────────────
// Post metrics moved to the backend (PostMetricsAPI) — only these remain fake.
const API = {
  saveCampaign: async (id, patch) => { console.info("[API stub] saveCampaign", id, patch); },
  removeCreator: async (campId, crId, reason, note) => { console.info("[API stub] removeCreator", crId, reason, note); },
};

// ── ROLES ────────────────────────────────────────────────────────────────────
// fin:     can see financial numbers (budget, fees)
// finFull: can see margins/profitability (Founder + PCM only)
// canCreate: can create new campaigns
const ROLES = [
  { id:"founder", label:"Founder",            short:"FO",  fin:true,  finFull:true,  canCreate:true  },
  { id:"pcm",     label:"PCM",                short:"PCM", fin:true,  finFull:true,  canCreate:true  },
  { id:"cm",      label:"Category Manager",   short:"CM",  fin:false, finFull:false, canCreate:true  },
  { id:"am",      label:"Account Manager",    short:"AM",  fin:true,  finFull:false, canCreate:true  },
  { id:"ea",      label:"Executive Associate",short:"EA",  fin:false, finFull:false, canCreate:false },
  { id:"accounts",label:"Accounts Team",      short:"ACC", fin:true,  finFull:false, canCreate:false },
];

// PIPELINE / LEGACY_STAGE / normStage now live in lib/campaign.js — Billing
// reads a campaign's stage too, and the two must not drift.

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const IM_DELIVERABLES = [
  "Reel — Collab","Reel — Non-Collab","Carousel — Single","Carousel — Multi",
  "Story","YouTube Long-form","YouTube Short","Instagram Live","Dedicated Post","UGC Content",
];
const ASSET_STATUSES = [
  {id:"yet_to_receive",label:"Yet to Receive"},{id:"received",label:"Received"},
  {id:"rework",label:"Rework"},{id:"approved",label:"Approved"},
  {id:"pending_brand",label:"Pending Brand"},{id:"locked",label:"Locked"},
];
const ASSET_COLOR = { yet_to_receive:T.label,received:T.accent,rework:T.amber,approved:T.green,pending_brand:T.amber,locked:T.green };
// `suggested` is where every generated or hand-added creator starts: put to the
// brand, not yet answered. Their yes/no in the client portal sets this field to
// shortlisted or brand_reject (5th-internal-back, the decision route), and
// setting either of those here does the same thing in reverse — one field, both
// directions, so neither side has to be told what the other decided.
const CR_JOURNEY = [
  {id:"suggested",label:"Suggested",neg:false},
  {id:"shortlisted",label:"Shortlisted",neg:false},{id:"reached_out",label:"Reached Out",neg:false},
  {id:"negotiating",label:"Negotiating",neg:false},{id:"locked",label:"Locked",neg:false},
  {id:"backed_off",label:"Backed Off",neg:true},{id:"backup",label:"Backup",neg:false},
  {id:"brand_reject",label:"Brand Reject",neg:true},
];
const CR_COLOR = { suggested:T.amber,shortlisted:T.label,reached_out:T.accent,negotiating:T.amber,locked:T.green,backed_off:T.red,backup:T.purple,brand_reject:T.red };
const REMOVE_REASONS = [
  {id:"bad_gen",label:"Bad Generation",desc:"Auto-generated — not a good fit"},
  {id:"brand_reject",label:"Brand Reject",desc:"Informally communicated by the brand"},
  {id:"backed_off",label:"Backed Off",desc:"Creator declined or unresponsive"},
];
const PAYMENT_TYPES = [{id:"",label:"— Select —"},{id:"vendor",label:"To Vendor"},{id:"net_banking",label:"Net Banking"},{id:"upi",label:"UPI"}];
// Whether the post goes up as a paid collaboration (the brand co-authors it and
// it carries their handle) or on the creator's own account alone. Deliberately
// has no default: the blank "— Select —" is the honest state for a creator
// nobody has decided about yet, and defaulting either way would silently answer
// a question the brand actually has to be asked.
const COLLAB_TYPES = [{id:"",label:"— Select —"},{id:"collab",label:"Collab"},{id:"non_collab",label:"Non-Collab"}];
// Full names — stored as-is on creator.state and matched by name in the
// client portal's STATES_META (5th-client-front/src/lib/geo.js).
const INDIAN_STATES = [
  "Andaman & Nicobar","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar",
  "Chandigarh","Chhattisgarh","Dadra & Nagar Haveli","Daman & Diu","Delhi",
  "Goa","Gujarat","Haryana","Himachal Pradesh","Jammu & Kashmir","Jharkhand",
  "Karnataka","Kerala","Lakshadweep","Madhya Pradesh","Maharashtra","Manipur",
  "Meghalaya","Mizoram","Nagaland","Odisha","Puducherry","Punjab","Rajasthan",
  "Sikkim","Tamil Nadu","Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
];
// ── AGENCY ENTITY (for invoice generation) ───────────────────────────────────
const AGENCY = {
  name:    "5th Avenue",
};
const PLATFORMS = ["Instagram","YouTube","Twitter / X","LinkedIn","Moj","Josh","Snapchat","Other"];
// Campaign niches — chosen on the Commercial step and used to steer the
// Generate suggestions towards same/similar creators. NICHE_SIMILAR groups
// niches that share an audience so "Generate" isn't limited to an exact match
// (e.g. a Food campaign also surfaces Cooking creators).
const NICHES = ["Food","Cooking","Fitness","Lifestyle","Beauty","Fashion","Travel","Tech","Gaming","Comedy","Parenting","Finance","Education"];
// Every preset niche has a group, including the four that used to have none
// (Comedy, Parenting, Finance, Education): a niche absent from this map scored
// nothing but an exact match, so a Comedy campaign found related creators only
// by accident.
const NICHE_SIMILAR = {
  Food:      ["Food","Cooking"],
  Cooking:   ["Cooking","Food"],
  Fitness:   ["Fitness","Lifestyle"],
  Lifestyle: ["Lifestyle","Fashion","Beauty","Travel","Comedy"],
  Beauty:    ["Beauty","Fashion","Lifestyle"],
  Fashion:   ["Fashion","Beauty","Lifestyle"],
  Travel:    ["Travel","Lifestyle"],
  Tech:      ["Tech","Gaming"],
  Gaming:    ["Gaming","Tech","Comedy"],
  Comedy:    ["Comedy","Lifestyle","Gaming"],
  Parenting: ["Parenting","Lifestyle","Education"],
  Finance:   ["Finance","Education","Tech"],
  Education: ["Education","Finance","Parenting"],
};
// Free-typed niches are normalised to the same shape as the NICHES list above —
// trimmed, single-spaced, Title Case — so "  home  decor" and "Home Decor"
// can't both land on one campaign, and a typed "food" resolves to the existing
// "Food" preset instead of creating a near-duplicate the matcher would miss.
// Words already typed in caps are left alone so acronyms (DIY, UGC) survive.
// \p{M} keeps combining marks so Indic scripts survive ("हिंदी" isn't stripped
// down to its consonants); hyphens capitalise on both sides ("pet-care" →
// "Pet-Care") while apostrophes don't ("mom's" → "Mom's", not "Mom'S").
const titleNicheWord = (w) => w.split("-")
  .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
  .join("-");
const normalizeNiche = (s) => String(s || "")
  .replace(/[’‘]/g, "'")
  .replace(/[^\p{L}\p{M}\p{N}&'\- ]/gu, " ")
  .trim().replace(/\s+/g, " ")
  .split(" ")
  .map(w => /^[\p{Lu}\p{N}&]{2,4}$/u.test(w) ? w : titleNicheWord(w))
  .join(" ");

// How well one creator's niche answers the campaign's, 0–3. A SCORE rather
// than the boolean this used to be, because "no exact match" is not the same
// as "no useful match": the old predicate filtered a Comedy campaign down to
// nothing and Generate then fell back to the unfiltered pool, which is exactly
// how a food roster ended up suggested for a comedy brief.
//
//   3  the same niche
//   2  shares a word, or one contains the other — the only rule that reaches
//      free-typed niches ("Street Food" → Food, "Comedy Skits" → Comedy),
//      which is most of them once a campaign stops using the presets. Ranked
//      ABOVE the group below it: a creator whose niche literally contains the
//      brief's word is a nearer fit than one merely in the same audience
//      bracket ("Comedy Skits" beats "Lifestyle" for a Comedy brief)
//   1  in the same audience group (NICHE_SIMILAR) — adjacent, not the same
//   0  unrelated
//
// Sorting by this is what makes "the closest ones" a real answer instead of
// whatever the list happened to be ordered by.
const NICHE_STOPWORDS = new Set(["and","the","of","&"]);
const nicheWords = n => normalizeNiche(n).toLowerCase().split(/[\s\-/,]+/)
  .filter(w => w.length > 2 && !NICHE_STOPWORDS.has(w));

const nicheScore = (campNiches, creatorNiche) => {
  const cr = normalizeNiche(creatorNiche);
  if (!campNiches?.length || !cr) return 0;
  const crWords = new Set(nicheWords(cr));
  let best = 0;
  for (const raw of campNiches) {
    const n = normalizeNiche(raw);
    if (!n) continue;
    if (n === cr) return 3;
    if (nicheWords(n).some(w => crWords.has(w))) { best = Math.max(best, 2); continue; }
    if ((NICHE_SIMILAR[n] || []).includes(cr) || (NICHE_SIMILAR[cr] || []).includes(n)) best = Math.max(best, 1);
  }
  return best;
};

// Directory creators ordered by how well they fit the brief. Ties break on
// engagement rate, so among equally on-niche creators the better performer is
// offered first. Nothing is dropped — the caller decides how deep to go, and
// the score travels with each row so the UI can say how close a match is.
const rankByNiche = (campNiches, pool) => pool
  .map(c => ({ ...c, nicheScore: nicheScore(campNiches, c.niche) }))
  .sort((a, b) => b.nicheScore - a.nicheScore || (b.avgER || 0) - (a.avgER || 0));
// Campaigns created before the field went multi-select stored a single `niche`
// string — read both shapes so their Generate results don't silently change.
const nichesOf = (c) => c?.niches?.length ? c.niches : (c?.niche ? [c.niche] : []);
// Profile auto-fetch per platform. Add an entry here when the backend grows a
// lookup endpoint for another platform.
const PROFILE_LOOKUP = {
  Instagram: { label:"Instagram profile link", placeholder:"https://www.instagram.com/username/", fetch:u=>InstagramAPI.lookup(u) },
  YouTube:   { label:"YouTube channel link",   placeholder:"https://www.youtube.com/@channel",    fetch:u=>YouTubeAPI.lookup(u) },
};
const CREATOR_COLS = [
  {key:"name",label:"Creator",cv:true,w:190},{key:"platform",label:"Platform",cv:true,w:90},
  {key:"followers",label:"Followers",cv:true,w:78},{key:"avgER",label:"Avg ER%",cv:true,w:65},
  {key:"niche",label:"Niche",cv:true,w:85},{key:"state",label:"State",cv:true,w:100},
  // Collab before Status on purpose: it is a precondition of locking (see
  // lockBlockedFor), so the column you must fill sits to the left of the one
  // it gates rather than after it.
  {key:"collab",label:"Collab",cv:true,w:110},{key:"status",label:"Status",cv:true,w:120},
  // Concept/Demo deliberately absent: this table is the shortlist, and an
  // asset status is meaningless before the creator is locked. Both live on the
  // Deliverables tab, which only renders locked creators.
  // Cost is what WE pay; Client Cost is what the brand is charged, and the one
  // column here the client sees — their portal breaks the budget down by it.
  // Adjacent on purpose: the pair is the per-creator margin, which is why it is
  // gated on canFin rather than canCrFin (see the header below).
  {key:"cost",label:"Cost",cv:false,w:90},{key:"clientCost",label:"Client Cost",cv:true,w:100},
  {key:"payType",label:"Pay Type",cv:false,w:110},
];
// Maps form field names -> validator kinds, for live per-keystroke checks.
const FIELD_SANITIZE = { phone:"phone", email:"email", pan:"pan", ifsc:"ifsc", bankAccount:"account", upiId:"upi" };

// ── TEAM ─────────────────────────────────────────────────────────────────────
// Hardcoded fallback only. The live directory (TEAM_DIR below) is derived from
// the backend `users` collection: each auth user's `teamId` IS the t-id that
// campaigns store in amId/cmId/eaId — so someone added on the founder's Auth
// page becomes assignable here without a code change. getM() and the Team-tab
// dropdowns all read TEAM_DIR.
const TEAM = [
  {id:"t0",name:"Rohan Mehta",  role:"pcm",     avatar:"RM",jobTitle:"Partner Category Manager"},
  {id:"t1",name:"Priya Nair",   role:"cm",      avatar:"PN",jobTitle:"Category Manager"},
  {id:"t2",name:"Vikram Das",   role:"cm",      avatar:"VD",jobTitle:"Category Manager"},
  {id:"t3",name:"Arjun Reddy",  role:"ea",      avatar:"AR",jobTitle:"Senior EA"},
  {id:"t4",name:"Sneha Iyer",   role:"ea",      avatar:"SI",jobTitle:"EA"},
  {id:"t5",name:"Meera Joshi",  role:"ea",      avatar:"MJ",jobTitle:"Junior EA"},
  {id:"t6",name:"Karan Shah",   role:"ea",      avatar:"KS",jobTitle:"EA"},
  {id:"t7",name:"Divya Pillai", role:"am",      avatar:"DP",jobTitle:"Account Manager"},
  {id:"t8",name:"Aisha Founder",role:"founder", avatar:"AF",jobTitle:"Founder"},
  {id:"t9",name:"Accounts",    role:"accounts",avatar:"AC",jobTitle:"Accounts"},
];

let TEAM_DIR = TEAM;
// Map DB users → team-directory entries. Users without a teamId can't own
// campaigns, so they're excluded from assignment lists.
const teamFromUsers = (users) => (users || [])
  .filter(u => u.teamId)
  .map(u => ({
    // Campaigns store teamId in amId/cmId/eaId.
    id: u.teamId,

    // Keep the real auth/user id because avatarUrl()
    // uses the database user's id.
    userId: u.id,

    name: u.name,

    role: ["accounts_head", "accounts_exec"].includes(u.role)
      ? "accounts"
      : u.role,

    avatar: u.avatar || initials(u.name),

    // IMPORTANT: preserve the avatar metadata.
    hasAvatar: Boolean(u.hasAvatar),
    avatarUpdatedAt: u.avatarUpdatedAt || null,

    jobTitle: u.title || u.role,
  }));

// ── CREATOR DIRECTORY ────────────────────────────────────────────────────────
// The real creators collection (GET /api/creators), which is what Generate and
// the roster search both draw from.
//
// This used to be CREATOR_DB: fourteen invented food bloggers hardcoded in this
// file. Generate offered them on every campaign regardless of brief, so a
// comedy campaign was shown "Anjali Kitchen" and the shortlist began with
// people who do not exist and cannot be booked.
//
// Fetched once per page load and shared — the roster search and Generate both
// want the same list, and each open campaign remounting this tab should not
// re-hit the endpoint. Cached as the PROMISE so concurrent mounts share one
// request; the cache is dropped on failure so a transient outage doesn't
// poison the tab for the rest of the session.
let directoryPromise = null;
const loadDirectory = () => {
  if (!directoryPromise) {
    directoryPromise = CreatorsAPI.list().catch(err => { directoryPromise = null; throw err; });
  }
  return directoryPromise;
};

// A directory row has no single "cost": what a creator charges is negotiated
// per campaign and lives on each campaign's roster entry. One of those prior
// fees is the only reference we can offer, and it is labelled as exactly that
// rather than as a rate card we do not have.
//
// Deliberately NOT called "most recent": /api/creators builds each row's
// campaign list in whatever order the query returned and carries no date, so
// "the latest fee" is not something this data can support. Naming it that would
// be the same invented precision as the per-creator budget slice.
const priorFeeOf = inf => {
  const costs = (inf?.campaigns || []).map(c => c.cost).filter(c => c != null && c > 0);
  return costs.length ? costs[costs.length - 1] : 0;
};

function useCreatorDirectory() {
  const [state, setState] = useState({ rows: [], loading: true, error: null });
  useEffect(() => {
    let alive = true;
    loadDirectory()
      .then(rows => alive && setState({ rows: rows || [], loading: false, error: null }))
      .catch(err => alive && setState({ rows: [], loading: false, error: err.message || "Could not load creators" }));
    return () => { alive = false; };
  }, []);
  return state;
}

// The statuses the brand's own answer sets, keyed by the answer. A stored
// decision that no longer matches the row is history — somebody here moved it
// since — and a green "Brand ✓" sitting on a Brand Reject would say the
// opposite of the truth, so the mark is only drawn while the two agree.
const BRAND_DECIDED = { shortlisted:"approve", brand_reject:"reject" };

// The brand's own call on a creator, made in the client portal — read off
// `brandDecision`, which the portal writes alongside the status it sets.
const BrandCall=({d})=>{
  const ok=d.decision==="approve",col=ok?T.green:T.red;
  return <span title={`${ok?"Approved":"Rejected"} by ${d.by||"the brand"}${d.at?` \u00b7 ${prettyDateTime(d.at)}`:""}`}
    style={{marginLeft:6,fontSize:9,fontWeight:600,fontFamily:"'Sora'",color:col,border:`1px solid ${col}40`,
      borderRadius:20,padding:"1px 6px",whiteSpace:"nowrap",cursor:"help"}}>
    {ok?"\u2713":"\u2717"} Brand
  </span>;
};

// ── CREATOR FACTORY ──────────────────────────────────────────────────────────
const mkCreator = (src={}, cost) => ({
  _id:      src._id || `cr_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
  dbId:     src.id || src.dbId || null,
  name:     src.name    || "",
  platform: src.platform|| "Instagram",
  handle:   src.handle  || "",
  igUrl:    src.igUrl   || null,
  phone:    src.phone   || null,
  niche:    src.niche   || "",
  followers:src.followers|| "",
  avgLikes: src.avgLikes || null,
  avgER:    src.avgER !== undefined ? src.avgER : (src.engRate || null),
  askingPrice: src.askingPrice !== undefined ? src.askingPrice : null,
  // What we pay this creator for this campaign — the negotiated cost. Was
  // `fee`, and was mirrored into a second `negotiatedCost` field that nothing
  // ever read; one name, one field. Legacy docs are read via src.fee.
  cost:     cost ?? costOf(src),
  // What the client is billed for them. Unset on a fresh shortlist entry —
  // nobody has priced it yet, and 0 would say they are being given away free.
  clientCost: src.clientCost ?? null,
  igFetched: src.igFetched || null, // raw auto-fetched snapshot (bio, posts, fetchedAt, etc.)
  // Suggested, not shortlisted: a name we have put forward is not a name the
  // brand has agreed to. Their answer in the portal is what moves it on.
  status:   "suggested",
  state:    src.state   || null,
  // Unset until someone chooses — see COLLAB_TYPES.
  collab:   src.collab  || null,
  payType:  src.payType || null,
  payId:    src.payId   || null,
  concept:  {status:"yet_to_receive",fileLink:null},
  demo:     {status:"yet_to_receive",fileLink:null},
  live:     {postUrl:null,postedDate:null},
  invoiceNo:src.invoiceNo || null, // set once a PDF invoice is generated — locks out duplicates
  // postsCounted = how many live links the last refresh summed, so the card can
  // say what the totals cover. `commentAnalysis`/`positivityScore` used to sit
  // here and are gone: nothing in the app ever wrote them (there is no sentiment
  // analysis), so the "% Positive" card they fed read "—" on every real campaign.
  tracking: {views:null,likes:null,comments:null,forwards:null,postsCounted:0,lastFetched:null},
  personalDetails: {
    pan:         src.personalDetails?.pan         || src.pan         || null,
    email:       src.personalDetails?.email       || src.email       || null,
    address:     src.personalDetails?.address     || src.address     || null,
    bankName:    src.personalDetails?.bankName    || src.bankName    || null,
    bankAccount: src.personalDetails?.bankAccount || src.bankAccount || null,
    bankBranch:  src.personalDetails?.bankBranch  || src.bankBranch  || null,
    ifsc:        src.personalDetails?.ifsc        || src.ifsc        || null,
    upiId:       src.personalDetails?.upiId       || src.upiId       || null,
  },
});


// ── WORKFLOW ACTION LABELS ───────────────────────────────────────────────────
// Shared by the confirmation modal and the post-action toast.
const ACTION_MSGS={assign_am:"Assign Account Manager",assign_cm:"Assign Category Manager",assign_ea:"Assign Executive Associate",lock_brief:"Lock the brief",raise_po:"Record the client Purchase Order",advance_received:"Confirm advance received",raise_invoice:"Raise the client invoice",payment_done:"Confirm payment received",extend_end_date:"Campaign end date extended",allocate_budget:"Budget allocated"};
// Actions that don't get the generic "Confirm stage change" dialog, because
// each already HAS a step that names what is about to happen:
//   extend_end_date / raise_po / lock_brief — their own modals collect the data
//   assign_* — completing the team auto-advances Brief Locked → Team Assigned,
//     and a dialog after a dropdown pick would read as a manual stage change.
//     TabTeam warns before the fact instead.
//   allocate_budget — AllocateBudgetModal states the consequences and collects
//     the split, and it moves no stage of its own.
const NO_CONFIRM_ACTIONS=new Set(["assign_am","assign_cm","assign_ea","extend_end_date","raise_po","lock_brief","allocate_budget"]);
const needsConfirm=action=>!NO_CONFIRM_ACTIONS.has(action);

// ── HELPERS ──────────────────────────────────────────────────────────────────
const fmtNum  = fmtCompact; // shared compact formatters — lib/format.js (fmtINR too)
// "13 Jul 2026 – 30 Aug 2026". The brief stores the human form of start/end
// because the client portal renders the brief as authored; start/end stay the
// source of truth and this is derived from them wherever they're written.
const timelineLabel = (start,end) => [prettyDate(start),prettyDate(end)].filter(Boolean).join(" – ");
const getM    = id => TEAM_DIR.find(t=>t.id===id)||TEAM.find(t=>t.id===id)||null;
const getR    = id => ROLES.find(r=>r.id===id)||ROLES[0];
// Team assignments and the commercial numbers stay editable right up to the
// PO — that is where they get committed to the client, and changing either
// after would silently desync it. One boundary, used by both.
const beforePO = c => stageIdx(c?.stage) < stageIdx("po_raised");
// creatorBudgetOf / numReqOf / costOf now live in lib/campaign.js
// — Billing derives the same numbers, and one copy is what keeps the two pages
// from disagreeing again.

function amtInWords(n) {
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
    "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  const convert = (num) => {
    if (num === 0) return "";
    if (num < 20)  return ones[num] + " ";
    if (num < 100) return tens[Math.floor(num/10)] + " " + ones[num%10] + " ";
    return ones[Math.floor(num/100)] + " Hundred " + convert(num%100);
  };
  const lakh = Math.floor(n / 100000), rest = n % 100000;
  const thou = Math.floor(rest / 1000),  rem = rest % 1000;
  let result = "";
  if (lakh) result += convert(lakh) + "Lakh ";
  if (thou)  result += convert(thou)  + "Thousand ";
  result += convert(rem);
  return ("INR " + result.trim() + " Only").replace(/\s+/g, " ");
}

function generateInvoiceHTML(creator, camp, invoiceNo, dated) {
  const cost = costOf(creator);
  const pd   = creator.personalDetails || {};
  const fmt  = n => "₹" + (n || 0).toLocaleString("en-IN");  // full format, e.g. ₹74,000
  const rows = Array(8).fill('<tr><td></td><td></td><td></td><td class="rt"></td><td class="rt"></td></tr>').join("");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Invoice — ${creator.name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Times New Roman",Times,serif;font-size:11pt;line-height:1.45;padding:24px;color:#000}
  table.inv{width:100%;border-collapse:collapse;border:2px solid #000}
  table.inv td{border:1px solid #000;padding:6px 10px;vertical-align:top}
  .title td{text-align:center;font-weight:bold;font-size:14pt;padding:8px 10px}
  .noborder{border:none!important;padding:0!important}
  table.meta{width:100%;height:100%;border-collapse:collapse}
  table.meta td{border:1px solid #000;padding:5px 10px}
  table.meta td:first-child{width:36%}
  p{margin:0 0 2px}
  .cen{text-align:center}.rt{text-align:right}
  .bg{display:grid;grid-template-columns:110px 1fr;gap:3px 8px;margin-top:6px}
  .sig{text-align:right;padding-top:26px}
  @media print{body{padding:0}}
</style></head><body>
<table class="inv">
  <tr class="title"><td colspan="5">INVOICE</td></tr>
  <tr>
    <td colspan="3">
      <p><strong>NAME: ${creator.name || ""}</strong></p>
      ${pd.address  ? `<p>ADDRESS: ${pd.address}</p>`        : ""}
      ${pd.pan      ? `<p><strong>PAN: ${pd.pan}</strong></p>` : ""}
      ${creator.phone    ? `<p>CONTACT NO.: ${creator.phone}</p>`      : ""}
      ${pd.email    ? `<p>EMAIL ID: ${pd.email}</p>`         : ""}
    </td>
    <td colspan="2" class="noborder">
      <table class="meta">
        <tr><td>Invoice No.</td><td>${invoiceNo}</td></tr>
        <tr><td>Dated</td><td>${dated}</td></tr>
      </table>
    </td>
  </tr>
  <tr>
    <td colspan="5">
      <p>Buyer:-</p><br/>
      <p><strong>${AGENCY.name}</strong></p>
    </td>
  </tr>
  <tr>
    <td style="width:40px;font-weight:bold;text-align:center">Sl No.</td>
    <td style="font-weight:bold;background:#f0f0f0">Particulars of Service</td>
    <td style="width:50px;font-weight:bold;text-align:center;background:#f0f0f0">Qty</td>
    <td style="width:100px;font-weight:bold;text-align:center;background:#f0f0f0">Rate</td>
    <td style="width:100px;font-weight:bold;text-align:center;background:#f0f0f0">Amount</td>
  </tr>
  <tr>
    <td class="cen">1</td>
    <td>Influencer Marketing Services — ${camp.name}</td>
    <td class="cen">1</td>
    <td class="rt">${fmt(cost)}</td>
    <td class="rt">${fmt(cost)}</td>
  </tr>
  ${rows}
  <tr>
    <td colspan="4" style="text-align:right;font-weight:bold">Total</td>
    <td class="rt" style="font-weight:bold">${fmt(cost)}</td>
  </tr>
  <tr><td colspan="5">Tax Amount (in words): ${amtInWords(cost)}</td></tr>
  ${creator.payType === "upi" && pd.upiId ? `<tr><td colspan="5">
    <p><strong>Payment Details</strong></p>
    <div class="bg">
      <span>UPI ID</span><span>: ${pd.upiId}</span>
    </div>
  </td></tr>` : pd.bankName || pd.bankAccount ? `<tr><td colspan="5">
    <p><strong>Bank Details</strong></p>
    <div class="bg">
      ${pd.bankName    ? `<span>Bank Name</span><span>: ${pd.bankName}</span>`       : ""}
      ${pd.bankAccount ? `<span>A/c No.</span><span>: ${pd.bankAccount}</span>`      : ""}
      ${pd.bankBranch  ? `<span>Branch</span><span>: ${pd.bankBranch}</span>`        : ""}
      ${pd.ifsc        ? `<span>IFS Code</span><span>: ${pd.ifsc}</span>`            : ""}
    </div>
  </td></tr>` : ""}
  <tr><td colspan="5" class="sig">
    <p>for NAME</p><br/><br/>
    <p><strong>${(creator.name || "").toUpperCase()}</strong></p>
    <p>Authorised Signatory</p>
  </td></tr>
</table>
<script>window.onload = () => window.print();</script>
</body></html>`;
}
// ── RBAC helpers ──────────────────────────────────────────────────────────────
// Per spec: AM sees execution budget but NOT revenue/margins in billing.
// In campaigns: AM sees campaign budget (needed for execution). CM/EA: no financials.
const canFin    = r => can(r, "seeCampaignBudget");  // budget in campaign card/detail
// Which of the two pipeline rails a role gets. Not a role string: the split was
// hardcoded to "ea", so CM — who has exactly the same standing on the finance
// track — was shown four nodes they can't act on, on a forked rail. One list,
// in rbac.js with every other access rule.
const canFinTrack = r => can(r, "seeFinanceTrack");
// Who may choose a pay type and raise / download a creator's GST invoice. NOT
// canFin: that is the client-facing revenue gate, and using it here meant the
// EAs who actually issue these invoices couldn't reach the button.
const canCrInv  = r => can(r, "invoiceCreator");
// Locking freezes a creator's fee because it is already committed in Billing.
// The founder can still re-price it — a renegotiated deal is real, and the only
// alternative was Remove-and-re-add, which cancels the expense and throws the
// history away. Everyone else sees the frozen figure.
const costFrozen = (role, cr) => isLocked(cr) && !can(role, "overrideLockedCost");
// Creator-side money — the creator budget pot + per-creator fees. Wider than
// canFin on purpose: CM/AM/EA run the shortlist and the negotiation, so they
// need the pot they're spending against, while the client-facing total budget,
// agency fee and margin stay behind canFin/canFF.
const canCrFin  = r => can(r, "seeCreatorFees");
const canFF     = r => can(r, "seeMargins");          // margins — founder only
// Who sets the fee charged ON TOP of the budget. Wider than canFF and narrower
// than canCrFin on purpose: the fee is a term the client is quoted and can read
// on their own portal, so the roles that own commercials set it, while what is
// left of the budget after the creator pool stays behind canFF.
const canAF     = r => can(r, "seeAgencyFee");
// Founder only — see editAgencyFee in rbac.js. Setting a fee on a new campaign
// and re-pricing one the client already holds are not the same act.
const canEditAF = r => can(r, "editAgencyFee");
const canCreate = r => can(r, "createCampaign");
// Visibility now lives in lib/campaign.js (canSeeCampaign) — the app shell's
// brand filter has to give the same answer as this board, and two copies of
// "which campaigns are mine" is how they came to disagree.
const canSee = canSeeCampaign;
// ISO ("YYYY-MM-DD") so a campaign's start/end always matches the format
// DateInput writes when staff do pick a date — one consistent shape in the DB.
const today = todayISO; // shared with Billing — see lib/format.js
// End-date proximity nudge. Returns null unless the campaign is still running
// and its ISO end date is within a week (or already past) — a subtle "ending
// soon" cue on the card + detail header. Completed campaigns never warn.
const endStatus = (iso, stage) => {
  if (normStage(stage) === "payment_done" || !ISO_DATE.test(iso || "")) return null;
  const days = Math.round((new Date(`${iso}T00:00:00`) - new Date(`${today()}T00:00:00`)) / 86400000);
  if (days < 0)   return { tone: T.red,   text: "Ended",           key: "ended"  };
  if (days === 0) return { tone: T.amber, text: "Ends today",      key: "ending" };
  if (days <= 7)  return { tone: T.amber, text: `Ending in ${days}d`, key: "ending" };
  return null;
};
// "Past its end date and not settled" — the question the grid asks twice (a
// campaign is Ended, and therefore is not Active). Named once so the two can
// never answer it differently.
const hasEnded = c => endStatus(c?.end, c?.stage)?.key === "ended";
// ISO date arithmetic for the end-date extension presets. Parses at local
// midnight (same as prettyDate/DateInput) so a shift never lands a day off
// across a DST boundary.
const addDays = (iso, n) => {
  if(!ISO_DATE.test(iso||"")) return "";
  const d=new Date(`${iso}T00:00:00`); d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const daysBetween = (a,b) => Math.round((new Date(`${b}T00:00:00`)-new Date(`${a}T00:00:00`))/86400000);
// The end-date nudge, in the same chip as every other status (see Pill).
const EndPill = ({ es, style = {} }) => es ? <Pill tone={es.tone} dot style={style}>{es.text}</Pill> : null;
// A creator only reaches Deliverables once they're locked — everything before
// that is shortlisting, and an asset status on an unconfirmed creator is noise.
const isLocked = isLockedCreator;

// What still has to be answered before this creator can be locked, or null if
// nothing does. Locking is the one-way door that commits their fee to Billing
// and freezes it, so every field the lock makes permanent has to be settled
// while it is still editable — a Collab type agreed after the fact is a
// question the brand was never actually asked.
//
// Returns the reason rather than a boolean: the Status dropdown prints it on
// the disabled option, so "why can't I lock this person" is answered where the
// attempt is made instead of in a toast after it fails.
const lockBlockedFor = cr =>
  !cr?.collab ? "set Collab first" : null;

// ── STAGE GATES ──────────────────────────────────────────────────────────────
// A stage only advances when its own condition is met, so the workflow buttons
// confirm something that is already true rather than skipping past it.
//
// execStats / execDone / briefGaps / teamComplete / executionStageOf all moved
// to lib/campaign.js when the pipeline forked: the execution track is derived
// rather than stored, and the campaign header, the card grid, the Exec filter
// and Billing all have to derive it the same way.

// ── BILLING BRIDGE ───────────────────────────────────────────────────────────
// Locking a creator commits money. That used to live only on the campaign, so
// Billing (which reads `expenses`) reported ₹0 spent on every campaign forever
// and every vendor PO read permanently open.
//
// One expense per locked creator, id derived from campaign+creator ids so
// re-saving updates the row instead of duplicating it. Created
// `pending_approval` — committed, not paid; Accounts settles it on the P&L.
// The rule itself is creatorExpensePlan() in lib/campaign.js, kept pure.
function syncCreatorExpenses(camp,prevCreators,nextCreators,onError){
  const fail=()=>onError&&onError();
  for(const {op,id,body} of creatorExpensePlan(camp,prevCreators,nextCreators)){
    if(op==="create"){
      // A creator locked → backed off → locked again already has a row, so a
      // failed create means "exists": revive it rather than losing the link.
      ExpensesAPI.create(body).catch(()=>{const{id:_,...rest}=body;ExpensesAPI.update(id,rest).catch(fail);});
    } else {
      ExpensesAPI.update(id,body).catch(fail);
    }
  }
}

// Headline % on the card and the detail chip: the FINANCE track, because that
// is the stage the chip beside it names. It used to interpolate through a wide
// "execution" stage; the delivery half now has its own rail with its own
// percentage (execStats().pct), so this is a flat step lookup again.
// How far along the campaign is, on the track the ROLE is actually reading.
// The stored stage's `p` is a FINANCE figure — every post live but the invoice
// unpaid reads 80% — so a role with no finance rail gets the execution track's
// own progress instead. The stage LABEL beside this number is already derived
// that way (viewPl); the number wasn't, so an EA read "Creator Payment · 80%"
// with a rail underneath saying 100% live. Three readings of one campaign.
function progressOf(c, role){
  return canFinTrack(role)
    ? (PIPELINE[stageIdx(c?.stage)]||PIPELINE[0]).p
    : execStats(c).pct;
}
// extUrl / profileUrl now live in lib/campaign.js — the creators directory and
// the creator-applications inbox render handles too, and all three screens have
// to agree on when a handle is a link.

// Live post URLs must match the creator's platform — those are the two
// platforms the backend /api/post-metrics endpoint can track.
const isIgUrl = u => /^(https?:\/\/)?(www\.)?instagram\.com\/.+/i.test(String(u || "").trim());
const isYtUrl = u => /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/i.test(String(u || "").trim());
const livePostUrlOk = (u, platform) => platform === "YouTube" ? isYtUrl(u) : isIgUrl(u);
// Demo statuses that count as "received" — receiving the demo unlocks Live.
const demoReceived = s => ["received", "rework", "approved", "pending_brand", "locked"].includes(s);

// ── DESIGN CONSTANTS ─────────────────────────────────────────────────────────
const SF = "'SF Pro Display','-apple-system','BlinkMacSystemFont','Helvetica Neue',sans-serif";

// ── ATOMS ────────────────────────────────────────────────────────────────────
const Av=({init,size=22,muted})=><div style={{width:size,height:size,borderRadius:Math.max(4,size*0.28),flexShrink:0,background:muted?"rgba(0,0,0,0.055)":`${T.accent}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:Math.max(8,size*0.4),fontWeight:600,color:muted?"#86868B":T.accent,fontFamily:SF}}>{init}</div>;
const Dot=({color=T.sub,size=6})=><span style={{width:size,height:size,borderRadius:"50%",background:color,display:"inline-block",flexShrink:0,boxShadow:`0 0 0 2px ${color}22`}}/>;
// One tinted status chip, everywhere. The card's stage chip, the detail
// header's and the end-date nudge each carried their own copy of this markup
// and had already drifted apart — 10px vs 10.5px, weight 500 vs 700, tint 14
// vs 18 — so the same campaign read as a slightly different kind of thing
// depending on which screen you were looking at.
const Pill=({tone,dot,children,style={}})=>(
  <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,background:`${tone}14`,border:`1px solid ${tone}30`,fontSize:10.5,fontWeight:600,color:tone,fontFamily:SF,whiteSpace:"nowrap",...style}}>
    {dot&&<Dot color={tone} size={5}/>}{children}
  </span>
);
// Toggle chip. Deliverables, niches, the creator-budget presets and the
// end-date presets each carried their own copy of this button — same accent
// fill, same border trick, four different paddings — so a change to how
// "selected" looks had to be made four times.
const Chip=({on,onClick,title,children,style={}})=>(
  <button onClick={onClick} title={title} style={{padding:"5px 11px",borderRadius:20,fontSize:11,cursor:"pointer",fontFamily:SF,
    background:on?`${T.accent}18`:"rgba(0,0,0,0.04)",color:on?T.accent:"#6E6E73",border:`1px solid ${on?`${T.accent}30`:"transparent"}`,...style}}>{children}</button>
);
const Lbl=({children,color,style={}})=><span style={{fontSize:9.5,fontWeight:600,color:color||"#6E6E73",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:SF,...style}}>{children}</span>;
// Caps label over a value. The card's delivery strip and the detail header's
// meta row are the same object at two sizes — `small` is the card's.
// `children` sits after the value for the one stat that carries a chip.
const Stat=({label,value,small,children})=>(
  <div style={{minWidth:0}}>
    <Lbl style={small?{fontSize:8.5}:{}}>{label}</Lbl>
    <div style={{display:"flex",alignItems:"center",gap:8,marginTop:small?2:3,fontSize:small?12:13,fontWeight:600,color:"#1D1D1F",fontFamily:SF,letterSpacing:"-0.02em",fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
      {value}{children}
    </div>
  </div>
);
// Label over a control, with an optional hint beneath. The create wizard had a
// dozen hand-written copies of this — a Lbl forced to display:block with a 5px
// gap — each with its own spacing, so the form's rhythm drifted screen to
// screen. Required is the default: only what can be skipped says so, which is
// the shorter thing to read and the one worth pointing at.
const Field=({label,hint,optional,children,style={}})=>(
  <div style={{marginBottom:14,...style}}>
    <Lbl style={{display:"block",marginBottom:5}}>
      {label}
      {optional&&<span style={{marginLeft:6,fontSize:9,fontWeight:500,letterSpacing:0,textTransform:"none",color:T.label}}>optional</span>}
    </Lbl>
    {children}
    {hint&&<div style={{fontSize:9.5,color:T.label,marginTop:5,lineHeight:1.55,fontFamily:SF}}>{hint}</div>}
  </div>
);
const Hr=({style={}})=><div style={{height:"0.5px",background:"rgba(0,0,0,0.08)",...style}}/>;
// "You have to fill this in", under the field it belongs to. Only ever rendered
// once someone has actually tried to move on (see `tried` in CreateModal): a
// form that flags empty fields before you have typed in any of them is
// scolding you for not having started yet.
const Req=({show,children})=>show
  ? <div style={{fontSize:9.5,color:T.red,marginTop:5,fontFamily:SF}}>{children||"Mandatory field — this can't be left empty."}</div>
  : null;
function Btn({children,onClick,variant="ghost",disabled,style={}}){
  const b={padding:"7px 14px",borderRadius:8,fontSize:11,fontWeight:500,cursor:disabled?"not-allowed":"pointer",fontFamily:SF,border:"none",display:"inline-flex",alignItems:"center",gap:5,opacity:disabled?0.35:1,letterSpacing:"-0.01em",transition:"all 0.15s",...style};
  const v={primary:{background:T.accent,color:"#FFFFFF",fontWeight:600},success:{background:T.green,color:"#FFFFFF",fontWeight:600},ghost:{background:"rgba(0,0,0,0.05)",color:"#1D1D1F",border:"none"},danger:{background:"transparent",color:T.red,border:`1px solid ${T.red}22`},subtle:{background:"transparent",color:"#6E6E73",border:"1px solid rgba(0,0,0,0.1)"}};
  return <button onClick={onClick} disabled={disabled} style={{...b,...(v[variant]||v.ghost)}}>{children}</button>;
}
const INP={width:"100%",padding:"9px 12px",borderRadius:9,background:"rgba(0,0,0,0.03)",border:"1px solid rgba(0,0,0,0.1)",color:"#1D1D1F",fontSize:12,fontFamily:SF,outline:"none",resize:"vertical",transition:"border 0.15s"};

// One source of truth for "which node does this role see this campaign on", so
// a campaign's chip, its colour and its pipeline can never disagree.
//
// An EA never runs a commercial step and has no access to the money, so their
// campaign reads off the EXECUTION track instead of the finance one — the
// alternative was what shipped before: their chip said "Brief Log" while the
// campaign was really parked at PO, because three commercial stages were
// collapsed into one node they could see. Now they simply see the other rail.
const viewPl  = (camp,role) => canFinTrack(role)
  ? (PIPELINE.find(p=>p.id===normStage(camp?.stage))||PIPELINE[0])
  : (EXEC_NODES.find(n=>n.id===executionStageOf(camp))||EXEC_NODES[0]);
const viewCol = (camp,role) => T.sc[viewPl(camp,role).id]||T.sub;

// ── PIPELINE ─────────────────────────────────────────────────────────────────
// Two common nodes that FORK into two rails: Execution (the work) on top,
// Finance (the money) below. They fork because they move independently — a
// campaign with every creator live can still owe an advance, and a fully paid
// one can still owe three posts. One rail hides that.
//
// The motion carries meaning, not decoration:
//   rails    — pathLength draws to where the campaign actually got; the fork
//              curves are part of the same paths, so the split reads as one
//              movement rather than three shapes that touch.
//   marker   — one shared element (layoutId) that TRAVELS, so an advance reads
//              as movement rather than two colours swapping in place.
//   sweep    — highlight along the completed length; stops when nothing is live.
//   previews — hover a node for its donuts without leaving the header.
const NODE_W  = 104;   // one node column
const GUTTER  = 92;    // left of the rails — the two track tags live here
const TOP_Y   = 16;    // execution rail, y of the marker centres
const BOT_Y   = 100;   // finance rail
const MID_Y   = (TOP_Y + BOT_Y) / 2;   // the common head, between the two
const FORK    = COMMON_STAGES.length;  // first column past the split
const N_COLS  = FORK + FIN_STAGES.length; // finance is the longer branch
const PIPE_W  = GUTTER + N_COLS * NODE_W;
const PIPE_H  = 150;
const cx = i => GUTTER + i * NODE_W + NODE_W / 2;

const PIPE_GREEN = "#34C759";
// The marker and the rails travel on the SAME spring. They were on different
// ones, so on a stage change the circle arrived while the line was still
// catching up — the two halves of one movement visibly out of step.
const PIPE_SPRING = { type:"spring", stiffness:260, damping:30 };

// Rail geometry, written once. The fork curves are cubics whose control points
// sit on the column boundary, so both branches leave the common head at the
// same angle and arrive flat — a straight diagonal made the split look like a
// mistake rather than a design.
const branch = (y, n) =>
  `M ${cx(FORK-1)} ${MID_Y} C ${cx(FORK-1)+NODE_W*0.5} ${MID_Y}, ${cx(FORK)-NODE_W*0.5} ${y}, ${cx(FORK)} ${y} H ${cx(FORK+n-1)}`;
const RAIL = {
  common: `M ${cx(0)} ${MID_Y} H ${cx(FORK-1)}`,
  exec:   branch(TOP_Y, EXEC_STAGES.length),
  fin:    branch(BOT_Y, FIN_STAGES.length),
};
// A role without the finance rail has nothing to fork AWAY from — the curve was
// drawing a detour around a branch that isn't rendered, which read as a kink in
// the track. One straight line instead, with the common head sitting on the
// execution row.
const RAIL_ONE = {
  common: `M ${cx(0)} ${TOP_Y} H ${cx(FORK-1)}`,
  exec:   `M ${cx(FORK-1)} ${TOP_Y} H ${cx(FORK+EXEC_STAGES.length-1)}`,
};

// Milestone palette — one colour per thing, reused by the rail badges, the
// hover donuts and the expanded modals so a colour means the same everywhere.
const EXEC_MILESTONES = [
  { key:"locked",  label:"Creators Locked", color:T.green  },
  { key:"concept", label:"Scripting",       color:T.accent },
  { key:"video",   label:"Shooting",        color:T.purple },
  { key:"live",    label:"Live",            color:T.teal   },
];
const PAY_COLOR = { pending:"#C7C7CC", invoice_raised:T.amber, paid:T.green };

// ── HOVER PREVIEW ────────────────────────────────────────────────────────────
// Anchors a portalled card under an element and KEEPS it anchored. Measuring
// once on mouseenter isn't enough — the header scrolls, so the card stayed
// where the node used to be. Re-measures on scroll (capture phase, to catch
// inner scrollers) and resize. Portalled to <body> because the header card is
// overflow:hidden and clipped it.
//
// GOTCHA: the app zooms <html>, so getBoundingClientRect() returns VISUAL px
// while `left`/`top` on the card are layout px that the zoom multiplies AGAIN.
// The card landed at zoom × x, drifting further right the further right the
// node sat. Divide the measurement back out — see lib/zoom.js, shared with
// every position:fixed popover anchored to a rect.
function useAnchor(target, width){
  const [pos,setPos] = useState(null);
  useLayoutEffect(()=>{
    if(!target){ setPos(null); return; }
    const place = () => {
      const z = zoomOf(document.body);
      const r = target.getBoundingClientRect();
      const centre = (r.left + r.width/2) / z;
      // Clamped to the viewport, and the caret is then placed relative to the
      // card rather than to the node — so a preview near either edge slides
      // sideways while its pointer stays on the node. The caret is kept off
      // the card's rounded corners, where it would read as a stray diamond.
      const left = Math.min(Math.max(centre - width/2, 12), window.innerWidth/z - width - 12);
      setPos({ left, top:r.bottom/z + 11, caret:Math.min(Math.max(centre - left, 18), width - 18) });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  },[target,width]);
  return pos;
}

function HoverCard({ target, width, title, children }){
  const pos = useAnchor(target, width);
  if(!target || !pos) return null;
  return createPortal(
    // Positioning lives on a plain wrapper, never on the animated child:
    // framer writes its own `transform` while animating y/scale and silently
    // discards any inline transform on the same element.
    <div style={{position:"fixed",left:pos.left,top:pos.top,width,boxSizing:"border-box",zIndex:900,pointerEvents:"none"}}>
      <motion.div initial={{opacity:0,y:-6,scale:0.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-4}}
        transition={{duration:0.16,ease:[0.16,1,0.3,1]}}
        style={{position:"relative",width:"100%",boxSizing:"border-box",background:"#FFFFFF",
          border:"1px solid rgba(0,0,0,0.07)",borderRadius:14,padding:"13px 16px 12px",
          boxShadow:"0 1px 2px rgba(0,0,0,0.04), 0 16px 40px -12px rgba(0,0,0,0.22)"}}>
        <div aria-hidden style={{position:"absolute",top:-5,left:pos.caret,width:9,height:9,
          transform:"translateX(-50%) rotate(45deg)",background:"#FFFFFF",
          borderLeft:"1px solid rgba(0,0,0,0.07)",borderTop:"1px solid rgba(0,0,0,0.07)"}}/>
        <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:12,marginBottom:11}}>
          <Lbl>{title}</Lbl>
          <span style={{fontSize:8.5,color:"rgba(0,0,0,0.32)",fontFamily:SF,whiteSpace:"nowrap"}}>Click to expand</span>
        </div>
        {children}
      </motion.div>
    </div>,
    document.body
  );
}

// ── DONUT READOUTS ───────────────────────────────────────────────────────────
// One milestone: a ring showing n of target, its percentage in the hole.
// `flex:1 1 0` + minWidth:0 because a flex child defaults to `min-width:auto`
// — four nowrap labels refused to shrink and pushed the preview wider than the
// width its own position had been calculated from.
function DonutStat({label,n,target,color,size=46}){
  const pct = target>0 ? Math.round((n/target)*100) : 0;
  return(
    <div style={{flex:"1 1 0",minWidth:0,display:"flex",flexDirection:"column",alignItems:"center",gap:7}}>
      <Donut size={size} thickness={size>60?7:6} center={pct}
        segments={[{value:n,color,label},{value:Math.max(0,target-n),color:"transparent",label:"Remaining"}]}/>
      <div style={{textAlign:"center",lineHeight:1.3}}>
        <div style={{fontWeight:600,color:"#1D1D1F",fontSize:11.5,fontFamily:SF}}>{n}/{target}</div>
        <div style={{fontSize:9,color:"#6E6E73",fontFamily:SF,whiteSpace:"nowrap"}}>{label}</div>
      </div>
    </div>
  );
}
const ExecutionDonuts = ({camp,size}) => {
  const s = execStats(camp);
  return(<div style={{display:"flex",alignItems:"flex-start",gap:10}}>
    {EXEC_MILESTONES.map(m=><DonutStat key={m.key} label={m.label} n={s[m.key]} target={s.target} color={m.color} size={size}/>)}
  </div>);
};
// Creator payment is one ring, not four: the three statuses are slices of the
// same population (every locked creator is in exactly one), so stacking them
// says "of the people we owe, this many are settled" in a single shape.
function CreatorPaymentDonut({stats,size=62}){
  return(<div style={{display:"flex",alignItems:"center",gap:14}}>
    <Donut size={size} thickness={size>70?9:8}
      center={stats.total>0?`${stats.paid}/${stats.total}`:"—"} centerSize={size>70?13:11}
      segments={CREATOR_PAY_STATUSES.map(s=>({value:stats[s.id],color:PAY_COLOR[s.id],label:s.label}))}/>
    <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:6}}>
      {CREATOR_PAY_STATUSES.map(s=>(
        <div key={s.id} style={{display:"flex",alignItems:"center",gap:7}}>
          <Dot color={PAY_COLOR[s.id]} size={6}/>
          <span style={{flex:1,fontSize:10.5,color:"#6E6E73",fontFamily:SF,whiteSpace:"nowrap"}}>{s.label}</span>
          <span style={{fontSize:11,fontWeight:600,color:"#1D1D1F",fontFamily:SF}}>{stats[s.id]}</span>
        </div>
      ))}
    </div>
  </div>);
}

// ── ONE NODE ─────────────────────────────────────────────────────────────────
// `state` is "done" | "now" | "next". Passed in rather than inferred from the
// node's own id, because the same three common nodes are shared by two tracks
// and only the rail that owns them knows how far each has got.
function TrackNode({node,x,y,state,col,labelAbove,badge,interactive,onEnter,onLeave,onClick,reduce,marker}){
  const done = state==="done", now = state==="now";
  const dotCol = now ? col : done ? PIPE_GREEN : "#FFFFFF";
  const label = (
    <motion.span animate={{color:now?col:done?"#1D1D1F":"rgba(0,0,0,0.32)"}}
      style={{fontSize:9.5,textAlign:"center",whiteSpace:"nowrap",fontWeight:now?700:done?500:400,
        fontFamily:SF,letterSpacing:"-0.01em",
        textDecoration:interactive?"underline":"none",textUnderlineOffset:3,textDecorationStyle:"dotted"}}>
      {node.label}
    </motion.span>
  );
  const pill = badge ? (
    <motion.span initial={reduce?false:{opacity:0,y:-3}} animate={{opacity:1,y:0}}
      transition={{delay:0.1,type:"spring",stiffness:400,damping:30}}
      style={{fontSize:8,fontWeight:700,color:col,background:`${col}16`,borderRadius:5,
        padding:"1.5px 6px",letterSpacing:"0.06em",fontFamily:SF,whiteSpace:"nowrap"}}>{badge}</motion.span>
  ) : null;

  return(
    <motion.div
      onMouseEnter={onEnter} onMouseLeave={onLeave}
      onFocus={onEnter} onBlur={onLeave}
      onClick={onClick}
      onKeyDown={onClick?e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onClick();}}:undefined}
      role={onClick?"button":undefined} tabIndex={onClick?0:undefined}
      aria-label={`${node.label}${done?" — complete":now?" — current":""}`}
      whileHover={reduce?undefined:{y:labelAbove?-2:-3}}
      whileTap={onClick?{scale:0.94}:undefined}
      transition={{type:"spring",stiffness:420,damping:28}}
      // Anchored by whichever END the marker is on, never by a fixed offset:
      // the marker is the last child when the label is above and the first
      // when it's below, and a node with no badge is one row shorter than one
      // with. Pinning `top` for both put the common head's markers 23px above
      // their own rail whenever the campaign wasn't standing on them.
      style={{position:"absolute",left:x-NODE_W/2,width:NODE_W,
        ...(labelAbove?{bottom:PIPE_H-(y+9)}:{top:y-9}),
        display:"flex",flexDirection:"column",alignItems:"center",gap:5,
        cursor:onClick?"pointer":"default",outline:"none"}}>

      {labelAbove&&<>{pill}{label}</>}

      <div style={{position:"relative",width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center"}}>
        {/* Heartbeat on the live node. A looped motion animation rather than a
            CSS keyframe so it honours prefers-reduced-motion with the rest. */}
        {now&&!reduce&&(
          <motion.span aria-hidden animate={{scale:[1,2.1],opacity:[0.4,0]}}
            transition={{duration:2,repeat:Infinity,ease:"easeOut"}}
            style={{position:"absolute",width:16,height:16,borderRadius:"50%",background:col}}/>
        )}
        {/* The travelling ring. One element for the whole execution track —
            framer interpolates it between nodes when the track advances. Only
            that track has one: two layoutIds sharing the common head would
            stack two identical rings on one node. */}
        {now&&marker&&(
          <motion.span layoutId="pipeNowRing" aria-hidden transition={PIPE_SPRING}
            style={{position:"absolute",width:25,height:25,borderRadius:"50%",border:`1.5px solid ${col}`,opacity:0.45}}/>
        )}
        <motion.div animate={{backgroundColor:dotCol,scale:now?1:0.86}}
          transition={{type:"spring",stiffness:300,damping:26}}
          style={{position:"relative",width:16,height:16,borderRadius:"50%",display:"flex",
            alignItems:"center",justifyContent:"center",border:done||now?"none":"1.5px solid rgba(0,0,0,0.14)"}}>
          {done&&(
            <motion.svg width={10} height={10} viewBox="0 0 12 12" aria-hidden>
              {/* Drawn rather than popped in — a completed node should feel
                  ticked off, and the stagger makes a fresh load read as the
                  campaign walking its own history. */}
              <motion.path d="M2.6 6.3 L4.9 8.6 L9.4 3.8" fill="none" stroke="#FFF"
                strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"
                initial={reduce?false:{pathLength:0}} animate={{pathLength:1}}
                transition={{duration:0.28,ease:"easeOut"}}/>
            </motion.svg>
          )}
          {now&&<span style={{width:5,height:5,borderRadius:"50%",background:"#FFF"}}/>}
        </motion.div>
      </div>

      {!labelAbove&&<>{label}{pill}</>}
    </motion.div>
  );
}

// Rails use a GRADIENT, blending from the colour of the node left behind to the
// node the campaign stands on. A flat rail repainted wholesale on each advance
// — teal to amber in one step read as a state change, not progress.
//
// Two stops, not one per node: the palette (navy PO, teal advance, amber
// invoice, green paid) is chosen to work as chips, and interpolating end to end
// ran the line through olive and brown. Start → current is smooth whatever the
// two colours are, and the head still wears the current stage's colour.
//
// userSpaceOnUse so stops sit at real column positions, not at fractions of a
// path whose length differs per branch.
const RailGradient = ({id,x0,x1,from,to}) => (
  <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x0} y1="0" x2={x1} y2="0">
    <stop offset="0" stopColor={from}/>
    <stop offset="1" stopColor={to}/>
  </linearGradient>
);

// A rail: the grey base, the gradient fill drawn to `frac`, and the sweep.
function Rail({d,frac,stroke,flowing,reduce}){
  return(<>
    <path d={d} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={3} strokeLinecap="round"/>
    <motion.path d={d} fill="none" stroke={stroke} strokeWidth={3} strokeLinecap="round"
      initial={reduce?false:{pathLength:0}} animate={{pathLength:frac}}
      transition={reduce?{duration:0}:PIPE_SPRING}/>
    {flowing&&frac>0.02&&(
          // A short highlight travelling the drawn length, clipped by pathOffset so
          // it never runs past progress that hasn't happened. Long, faint and slow
          // — a short bright glint read as a loading bar.
          //
          // pathLength MUST be in initial/animate, not `style`. Framer only
          // converts it to stroke-dasharray when it sees it on the animation
          // target; in `style` the highlight got no dash and painted the ENTIRE
          // rail solid white, covering the colour it was meant to travel along.
      <motion.path d={d} fill="none" stroke="rgba(255,255,255,0.42)" strokeWidth={3} strokeLinecap="round"
        initial={{pathLength:0.34,pathOffset:-0.34}}
        animate={{pathLength:0.34,pathOffset:[-0.34,frac]}}
        transition={{duration:5.5,repeat:Infinity,ease:"easeInOut"}}/>
    )}
  </>);
}

// ── THE HEADER PIPELINE ──────────────────────────────────────────────────────
// `onOpen` opens a track's expanded breakdown; `onFinNode` sends a click on a
// finance node to wherever that step is actually done. A pipeline whose nodes
// only tell you where you are is a picture; one whose nodes take you to the
// work is navigation.
function TrackPipeline({camp,role,expenseById,onOpen,onFinNode,onGoTeam}){
  const reduce = useReducedMotion();
  const [preview,setPreview] = useState(null);   // {id, el}
  const oneRail = !canFinTrack(role);            // no commercial rail — see rbac.js
  // With one rail there is no fork: the common head drops onto the execution
  // row, its labels hang below like the rest of the branch, and the canvas is
  // only as wide and tall as the five nodes that remain.
  const rail  = oneRail ? RAIL_ONE : RAIL;
  const headY = oneRail ? TOP_Y : MID_Y;
  const pipeW = GUTTER + (oneRail ? EXEC_NODES.length : N_COLS) * NODE_W;
  const pipeH = oneRail ? 76 : PIPE_H;

  const si   = stageIdx(camp.stage);                       // stored-track index
  const es   = execStats(camp);
  const pay  = creatorPayStats(camp, expenseById);
  const exId = executionStageOf(camp);
  const execIdx = EXEC_STAGES.findIndex(n=>n.id===exId);   // -1 while still common
  // Team Assigned is stored but drawn on the execution branch, so the finance
  // branch starts one stage later than the common head ends.
  const finIdx  = si - (FORK + 1);                         // -1 before the PO
  // Which node the COMMON head stands on. A one-rail role reads the DERIVED
  // track end to end; the stored stage put Brief Locked back to "not reached" on
  // a campaign whose brief is signed off but whose PO hasn't been raised —
  // exactly the case the two tracks exist to tell apart.
  const headIdx = oneRail ? Math.max(0, EXEC_NODES.findIndex(n=>n.id===exId)) : si;
  const paidOut = pay.total>0 && pay.paid===pay.total;
  const settled = si === PL_IDS.length-1;

  // How far each rail is drawn. The fork counts as one step of the branch it
  // belongs to, which is why each denominator is the branch's node count and
  // reaching node i costs i+1 steps.
  const commonFrac = Math.min(headIdx,FORK-1)/(FORK-1);
  const execFrac   = execIdx<0 ? 0
    // Inside Execution the fill advances with the work rather than sitting
    // still through the longest node on the branch.
    : (1 + execIdx + (exId==="execution" ? es.pct/100 : 0))/EXEC_STAGES.length;
  const finFrac    = finIdx<0 ? 0 : (1+finIdx)/FIN_STAGES.length;
  const flowing    = !reduce && !(settled && paidOut);

  const stateOf = (idx,i,terminalDone) =>
    idx>i ? "done" : idx===i ? (terminalDone?"done":"now") : "next";

  const execCol = T.sc[exId] || T.accent;
  const finCol  = T.sc[normStage(camp.stage)] || T.sub;

  const enter = (id,e) => setPreview({id, el:e.currentTarget});
  const leave = () => setPreview(null);

  return(
    <div style={{overflowX:"auto",overflowY:"hidden",padding:"6px 0 2px"}}>
      <div style={{position:"relative",width:pipeW,minWidth:pipeW,height:pipeH}}>
        <svg width={pipeW} height={pipeH} style={{position:"absolute",inset:0,pointerEvents:"none"}} aria-hidden>
          <defs>
            {/* Each branch starts on the colour the common head ends on, so the
                fork curves read as that line continuing rather than as two new
                ones starting. */}
            <RailGradient id="railCommon" x0={cx(0)} x1={cx(FORK-1)} from={PIPE_GREEN} to={T.sc.brief_locked}/>
            <RailGradient id="railExec" x0={cx(FORK-1)} x1={cx(FORK+EXEC_STAGES.length-1)} from={T.sc.brief_locked} to={execCol}/>
            <RailGradient id="railFin"  x0={cx(FORK-1)} x1={cx(FORK+FIN_STAGES.length-1)}  from={T.sc.brief_locked} to={finCol}/>
          </defs>
          <Rail d={rail.common} frac={commonFrac} stroke="url(#railCommon)" flowing={flowing} reduce={reduce}/>
          <Rail d={rail.exec}   frac={execFrac}   stroke="url(#railExec)"   flowing={flowing} reduce={reduce}/>
          {!oneRail&&<Rail d={RAIL.fin} frac={finFrac} stroke="url(#railFin)" flowing={flowing} reduce={reduce}/>}
        </svg>

        {/* Track tags, in the gutter the fork leaves empty. They say which rail
            is which without a legend, and carry each track's own headline. */}
        <TrackTag y={TOP_Y} label="Execution" col={execCol}
          sub={es.locked?`${es.live}/${es.locked} live · ${es.pct}%`:"no creators locked"}/>
        {!oneRail&&<TrackTag y={BOT_Y} label="Finance" col={finCol}
          sub={finIdx<0?"not started":FIN_STAGES[finIdx].label}/>}

        {/* Common head — labels ABOVE the markers, into the space the fork
            leaves free, so they can't collide with the finance rail below.
            With no fork there is no such space and nothing below to collide
            with, so they hang under the line like every other node. */}
        {COMMON_STAGES.map((n,i)=>{
          const st = stateOf(headIdx,i,false);
          return(
            <TrackNode key={n.id} node={n} x={cx(i)} y={headY} labelAbove={!oneRail} reduce={reduce}
              state={st} col={T.sc[n.id]}
              // The travelling ring belongs to a single rail, so it runs
              // the head too. On the forked view it stays on the
              // execution branch — the head is shared, and a ring there would
              // claim it for one of the two tracks.
              marker={oneRail&&st==="now"}
              badge={headIdx===i?"NOW":null}/>
          );
        })}

        {/* Execution rail. Only the last two open a breakdown — Team Assigned
            has no donut to preview, it's three names on the Team tab. */}
        {EXEC_STAGES.map((n,i)=>{
          const st = stateOf(execIdx,i,n.id==="creator_payment"&&paidOut);
          const opens = n.id!=="team_assigned";
          return(
            <TrackNode key={n.id} node={n} x={cx(FORK+i)} y={TOP_Y} reduce={reduce}
              state={st} col={T.sc[n.id]} interactive marker={st==="now"}
              badge={st==="now"?(n.id==="execution"?`${es.pct}%`:n.id==="creator_payment"?`${pay.paid}/${pay.total}`:"NOW"):null}
              onEnter={opens?e=>enter(n.id,e):undefined} onLeave={opens?leave:undefined}
              onClick={opens?()=>{leave();onOpen(n.id);}:()=>onGoTeam()}/>
          );
        })}

        {/* Finance rail — hidden from an EA, who neither runs these steps nor
            can see the numbers behind them. */}
        {!oneRail&&FIN_STAGES.map((n,i)=>(
          <TrackNode key={n.id} node={n} x={cx(FORK+i)} y={BOT_Y} reduce={reduce}
            state={stateOf(finIdx,i,n.id==="payment_done")} col={T.sc[n.id]} interactive
            badge={finIdx===i&&n.id!=="payment_done"?"NOW":null}
            onClick={()=>onFinNode(n.id)}/>
        ))}
      </div>

      <AnimatePresence>
        {preview?.id==="execution"&&(
          <HoverCard key="exec" target={preview.el} width={452} title="Execution">
            <ExecutionDonuts camp={camp}/>
          </HoverCard>
        )}
        {preview?.id==="creator_payment"&&(
          <HoverCard key="pay" target={preview.el} width={272} title="Creator Payment">
            <CreatorPaymentDonut stats={pay}/>
          </HoverCard>
        )}
      </AnimatePresence>
    </div>
  );
}

const TrackTag = ({y,label,col,sub}) => (
  <div style={{position:"absolute",left:0,top:y-16,width:GUTTER-14,textAlign:"right"}}>
    <div style={{fontSize:9,fontWeight:700,color:col,textTransform:"uppercase",letterSpacing:"0.09em",fontFamily:SF}}>{label}</div>
    <div style={{fontSize:9,color:"rgba(0,0,0,0.35)",fontFamily:SF,marginTop:3,lineHeight:1.35}}>{sub}</div>
  </div>
);

// ── EXPANDED BREAKDOWNS ──────────────────────────────────────────────────────
// The modal shell both breakdowns share. Extracted because they were the same
// twenty lines of backdrop, spring and header twice over.
function Sheet({title,right,sub,onClose,width=520,children}){
  return(<div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}}
      onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(4,5,10,0.55)",backdropFilter:"blur(6px)"}}/>
    <motion.div initial={{opacity:0,scale:0.96,y:10}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:0.97,y:6}}
      transition={{duration:0.2,ease:[0.16,1,0.3,1]}}
      style={{position:"relative",width:`min(${width}px,94vw)`,maxHeight:"86vh",overflowY:"auto",
        background:"#FFFFFF",border:"1px solid rgba(0,0,0,0.07)",borderRadius:18,padding:"20px 22px 18px",
        boxShadow:"0 1px 2px rgba(0,0,0,0.05), 0 30px 60px -20px rgba(0,0,0,0.35)"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,marginBottom:2}}>
        <div style={{fontFamily:"'Newsreader',serif",fontSize:19,color:"#1D1D1F",fontStyle:"italic",fontWeight:600,letterSpacing:"-0.01em"}}>{title}</div>
        {right}
      </div>
      <div style={{fontSize:10.5,color:"#86868B",fontFamily:SF,marginBottom:18}}>{sub}</div>
      {children}
      <div style={{display:"flex",marginTop:18}}><div style={{flex:1}}/><Btn variant="ghost" onClick={onClose}>Close</Btn></div>
    </motion.div>
  </div>);
}

// A tile the donuts sit in, so four rings read as one instrument panel rather
// than four floating circles.
const Tile = ({children}) => (
  <div style={{background:"rgba(0,0,0,0.022)",border:"1px solid rgba(0,0,0,0.05)",borderRadius:14,padding:"16px 10px 14px"}}>{children}</div>
);

// What the Execution node opens. Four milestones as donuts, all measured
// against the same target creator count so the rings and the headline are
// reading one denominator — "concepts 1/1" next to "locked 1/5" would look
// finished while 80% of the campaign hadn't started. Under them, the same four
// milestones per creator, which is the detail the rings summarise.
function ExecutionModal({camp,onClose}){
  const s = execStats(camp);
  const locked = (camp.creators||[]).filter(isLocked);
  const hit = (cr,key) =>
    key==="locked"  ? true :
    key==="concept" ? assetIn(cr.concept) :
    key==="video"   ? assetIn(cr.demo) :
                      // The shared rule, so this tick and the Live donut
                      // beside it can never disagree about the same creator.
                      creatorLive(camp,cr);
  return(
    <Sheet title="Execution" onClose={onClose} width={560}
      sub={`${camp.name} · ${numReqOf(camp)==null?`${s.locked} locked, no count set`:`${s.target} creator${s.target!==1?"s":""} planned`} · ${s.delivered}${s.expected>0?` of ${s.expected}`:""} deliverable${s.delivered===1?"":"s"} posted`}
      right={<div style={{textAlign:"right"}}>
        <div style={{fontSize:26,fontWeight:700,color:T.amber,fontFamily:SF,lineHeight:1,letterSpacing:"-0.03em"}}>{s.pct}%</div>
        <div style={{fontSize:9,color:"#86868B",fontFamily:SF,marginTop:3}}>of all milestones</div>
      </div>}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
        {EXEC_MILESTONES.map(m=>(
          <Tile key={m.key}><DonutStat label={m.label} n={s[m.key]} target={s.target} color={m.color} size={64}/></Tile>
        ))}
      </div>

      {locked.length>0&&<>
        <Lbl style={{display:"block",margin:"20px 0 8px"}}>Per creator</Lbl>
        <div style={{border:"1px solid rgba(0,0,0,0.06)",borderRadius:12,overflow:"hidden"}}>
          {locked.map((cr,i)=>(
            <div key={cr._id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 13px",
              borderTop:i?"1px solid rgba(0,0,0,0.05)":"none",background:i%2?"rgba(0,0,0,0.014)":"transparent"}}>
              <span style={{flex:1,minWidth:0,fontSize:11.5,color:"#1D1D1F",fontFamily:SF,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cr.name}</span>
              <span style={{fontSize:9.5,color:"#86868B",fontFamily:SF,whiteSpace:"nowrap"}}>
                {delivDoneOf(camp,cr)}/{delivTargetOf(camp,cr)} posted
              </span>
              <div style={{display:"flex",gap:5}}>
                {EXEC_MILESTONES.map(m=>{
                  const on = hit(cr,m.key);
                  return <span key={m.key} title={m.label} style={{width:9,height:9,borderRadius:"50%",
                    background:on?m.color:"transparent",border:on?"none":"1.5px solid rgba(0,0,0,0.14)"}}/>;
                })}
              </div>
            </div>
          ))}
        </div>
      </>}
      <div style={{fontSize:9.5,color:"#86868B",lineHeight:1.6,marginTop:14}}>
        Every locked creator walks four milestones — locked, script in, shoot in, every post live. Move them on the Deliverables tab.
      </div>
    </Sheet>
  );
}

// What the Creator Payment node opens. The same three statuses as the preview,
// then who is in each — because "2 pending" is only actionable once you know
// which two and what they're owed.
function CreatorPaymentModal({camp,expenseById,role,onClose}){
  const pay = creatorPayStats(camp, expenseById);
  const locked = (camp.creators||[]).filter(isLocked);
  const owed = locked.reduce((s,cr)=>s + (creatorPayStatusOf(camp.id,cr,expenseById)==="paid"?0:costOf(cr)),0);
  return(
    <Sheet title="Creator Payment" onClose={onClose} width={480}
      sub={`${camp.name} · ${pay.total} locked creator${pay.total!==1?"s":""}${canCrFin(role)?` · ${fmtINR(owed)} still owed`:""}`}
      right={<div style={{textAlign:"right"}}>
        <div style={{fontSize:26,fontWeight:700,color:T.green,fontFamily:SF,lineHeight:1,letterSpacing:"-0.03em"}}>
          {pay.total>0?Math.round((pay.paid/pay.total)*100):0}%
        </div>
        <div style={{fontSize:9,color:"#86868B",fontFamily:SF,marginTop:3}}>settled</div>
      </div>}>
      <Tile><div style={{padding:"2px 8px"}}><CreatorPaymentDonut stats={pay} size={92}/></div></Tile>

      {CREATOR_PAY_STATUSES.map(st=>{
        const rows = locked.filter(cr=>creatorPayStatusOf(camp.id,cr,expenseById)===st.id);
        if(!rows.length) return null;
        return(<div key={st.id} style={{marginTop:16}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
            <Dot color={PAY_COLOR[st.id]} size={6}/><Lbl>{st.label}</Lbl>
            <span style={{fontSize:9,color:"rgba(0,0,0,0.3)",fontFamily:SF}}>{rows.length}</span>
          </div>
          <div style={{border:"1px solid rgba(0,0,0,0.06)",borderRadius:12,overflow:"hidden"}}>
            {rows.map((cr,i)=>(
              <div key={cr._id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 13px",
                borderTop:i?"1px solid rgba(0,0,0,0.05)":"none"}}>
                <span style={{flex:1,minWidth:0,fontSize:11.5,color:"#1D1D1F",fontFamily:SF,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cr.name}</span>
                {cr.invoiceNo&&<span style={{fontSize:9,color:"#86868B",fontFamily:"monospace"}}>{cr.invoiceNo}</span>}
                {canCrFin(role)&&<span style={{fontSize:11.5,fontWeight:600,color:"#1D1D1F",fontFamily:SF}}>{fmtINR(costOf(cr))}</span>}
              </div>
            ))}
          </div>
        </div>);
      })}
      {!pay.total&&<div style={{fontSize:11,color:"#86868B",fontStyle:"italic",marginTop:14}}>No creators locked yet — they appear here as the roster fills.</div>}
      <div style={{fontSize:9.5,color:"#86868B",lineHeight:1.6,marginTop:16}}>
        A creator moves to <b>Invoice Raised</b> when their GST invoice is generated on the Creators tab, and to <b>Payment Done</b> when Accounts settles it under Billing → Campaign P&amp;L → Creator Payables.
      </div>
    </Sheet>
  );
}

// ── DELIVERABLE MULTISELECT ───────────────────────────────────────────────────
function DelvSelect({value=[],onChange}){const t=d=>onChange(value.includes(d)?value.filter(x=>x!==d):[...value,d]);return(<div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:2}}>{IM_DELIVERABLES.map(d=>{const on=value.includes(d);return <Chip key={d} on={on} onClick={()=>t(d)}>{d}</Chip>;})}</div>);}

// ── NICHE MULTISELECT ────────────────────────────────────────────────────────
// Same chip pattern as DelvSelect, plus a free-text row for niches we don't
// have a preset for. Anything typed goes through normalizeNiche() first, and a
// typed value that matches an existing preset or an already-picked custom niche
// (case-insensitively) selects that one rather than adding a twin — the
// Generate matcher compares niches by exact string, so near-duplicates would
// quietly stop matching creators.
function NicheSelect({value=[],onChange}){
  const [draft,setDraft]=useState("");
  const norm=normalizeNiche(draft);
  const all=[...NICHES,...value.filter(n=>!NICHES.includes(n))];
  const existing=norm?all.find(n=>n.toLowerCase()===norm.toLowerCase()):null;
  const already=!!existing&&value.includes(existing);
  const toggle=n=>onChange(value.includes(n)?value.filter(x=>x!==n):[...value,n]);
  const add=()=>{
    if(!norm)return;
    const n=existing||norm;
    if(!value.includes(n))onChange([...value,n]);
    setDraft("");
  };
  return(<div>
    <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:2}}>
      {all.map(n=>{
        const on=value.includes(n),custom=!NICHES.includes(n);
        return <Chip key={n} on={on} onClick={()=>toggle(n)} title={custom?"Custom niche — click to remove":undefined}>{n}{custom&&on&&<span style={{marginLeft:5,opacity:0.6}}>×</span>}</Chip>;
      })}
    </div>
    <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center"}}>
      <input value={draft} maxLength={24}
        onChange={e=>setDraft(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();add();}}}
        placeholder="+ Other niche…" style={{...INP,resize:"none",flex:1}}/>
      <Btn variant="ghost" onClick={add} disabled={!norm||already}>Add</Btn>
    </div>
    {norm&&(already
      ? <div style={{fontSize:9,color:T.sub,marginTop:4}}>"{existing}" is already selected.</div>
      : norm!==draft.trim()&&<div style={{fontSize:9,color:T.sub,marginTop:4}}>Will be added as "{norm}".</div>)}
  </div>);
}

// ── CREATOR BUDGET FIELD (New Campaign → Commercial) ─────────────────────────
// The creator budget is the slice of the total that actually pays creators;
// whatever is left is the agency's. Teams arrive at it both ways — "60% of the
// budget" when pricing off a rate card, a fixed rupee number when the client
// has already carved it out — so the field accepts either and always shows the
// other, plus the per-head split the shortlist will be built against.
const clampPct = v => Math.min(100, Math.max(0, parseFloat(v) || 0));
// A Mixed brief field as the list it is meant to be. `brief` is stored on a
// strict:false schema, so its shape is a convention rather than a guarantee.
const asList = v => Array.isArray(v) ? v : (v == null || v === "" ? [] : [v]);
// One segmented-control button. Module-level rather than inside the field that
// first needed it: the wizard's "set the budget now / decide later" switch is
// the same control doing the same job, and two hand-rolled copies of a segment
// style drift the first time either is touched.
const segBtn = on => ({padding:"4px 12px",borderRadius:6,fontSize:10,fontWeight:600,fontFamily:SF,cursor:"pointer",border:"none",transition:"all 0.15s",background:on?T.surface:"transparent",color:on?T.text:T.label,boxShadow:on?"0 1px 2px rgba(0,0,0,0.08)":"none"});
const SEG_WRAP = {display:"flex",gap:2,padding:2,borderRadius:8,background:T.mute};
// A percentage with the unit inside the box. Shared by the creator-budget split
// and the agency fee, for the reason Chip and segBtn were pulled out.
const PctInput = ({value,onChange,step=1,width=120}) => (
  <div style={{position:"relative",width,flexShrink:0}}>
    <input type="number" min={0} max={100} step={step} value={value} placeholder="0"
      onChange={e=>onChange(e.target.value)} style={{...INP,resize:"none",paddingRight:26}}/>
    <span style={{position:"absolute",right:11,top:"50%",transform:"translateY(-50%)",fontSize:11,color:T.label,pointerEvents:"none"}}>%</span>
  </div>
);
// Presets. An empty field matches nothing, including a 0 preset, so "not agreed
// yet" and "agreed at nothing" stay distinguishable.
const PctChips = ({value,options,onPick,zeroLabel}) => (
  <div style={{display:"flex",gap:6,marginTop:8}}>{options.map(p=>(
    <Chip key={p} on={String(value).trim()!=="" && clampPct(value)===p}
      onClick={()=>onPick(String(p))} style={{padding:"3px 10px",fontSize:10}}>
      {p===0&&zeroLabel?zeroLabel:`${p}%`}
    </Chip>))}
  </div>
);
// Resolve the two input modes down to the one number that gets stored.
const resolveCreatorBudget = (f, budget) =>
  f.creatorBudgetMode === "amount"
    ? (parseInt(f.creatorBudgetAmt) || 0)
    : Math.round(budget * clampPct(f.creatorBudgetPct) / 100);

function CreatorBudgetField({budget,mode,pct,amount,onChange}){
  const isPct = mode === "pct";
  const value = resolveCreatorBudget({creatorBudgetMode:mode,creatorBudgetPct:pct,creatorBudgetAmt:amount}, budget);
  const effPct = budget > 0 ? (value / budget) * 100 : 0;
  const over   = value > budget;
  return(<div style={{marginBottom:14}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
      <Lbl>Creator budget</Lbl>
      <div style={SEG_WRAP}>
        <button onClick={()=>onChange({creatorBudgetMode:"pct"})}    style={segBtn(isPct)}>% of budget</button>
        <button onClick={()=>onChange({creatorBudgetMode:"amount"})} style={segBtn(!isPct)}>₹ amount</button>
      </div>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      {isPct
        ? <PctInput value={pct} step={5} onChange={v=>onChange({creatorBudgetPct:v})}/>
        : <MoneyInput value={amount} onChange={v=>onChange({creatorBudgetAmt:v})} placeholder="e.g. 7,50,000" style={{...INP,resize:"none",width:150,flexShrink:0}}/>}
      <span style={{fontSize:11,color:budget>0?T.text:T.label,fontFamily:SF}}>
        {budget>0
          ? (isPct ? `= ${fmtINR(value)} of ${fmtINR(budget)}` : `= ${effPct.toFixed(1)}% of ${fmtINR(budget)}`)
          : "Enter the total budget first"}
      </span>
    </div>
    {isPct&&<PctChips value={pct} options={[50,60,70,75]} onPick={v=>onChange({creatorBudgetPct:v})}/>}
    {/* The allocation bar moved to MoneyStack: with a fee on top there are
        three parts, and two bars competing to summarise was the clutter. */}
    {over&&<div style={{fontSize:9.5,color:T.red,marginTop:6}}>Creator budget can't exceed the total budget of {fmtINR(budget)}.</div>}
    {budget>0&&!over&&value===0&&<div style={{fontSize:9.5,color:T.red,marginTop:6}}>Mandatory field — set how much of the budget goes to creators.</div>}
  </div>);
}

// ── AGENCY FEE FIELD (New Campaign → Money) ──────────────────────────────────
// Charged ON TOP of the budget, unlike the margin left after the creator pool:
// this is a term the client is quoted, invoiced for, and sees on their portal.
//
// Always a percentage — a fee is agreed as a rate, and a flat number typed
// against a budget that later moves stops being the rate anyone agreed. It
// resolves against the budget as typed, never the total it helps make up.
const resolveAgencyFee = (pct, base) => Math.round(base * clampPct(pct) / 100);

function AgencyFeeField({base,pct,onChange}){
  const fee = resolveAgencyFee(pct, base);
  const set = v => onChange({agencyFeePct:v});
  return(<div style={{marginBottom:14}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
      <Lbl>Agency fee</Lbl>
      <span style={{fontSize:9.5,color:T.label,fontFamily:SF}}>charged on top</span>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <PctInput value={pct} onChange={set}/>
      <span style={{fontSize:11,color:base>0?T.text:T.label,fontFamily:SF}}>
        {base<=0 ? "Enter the total budget first"
          : fee>0 ? `= ${fmtINR(fee)} on top of ${fmtINR(base)}`
          : "No fee — the client pays the budget above"}
      </span>
    </div>
    {/* "None" is a preset like any other, so choosing not to charge a fee is a
        click rather than the absence of one. */}
    <PctChips value={pct} options={[0,10,15,20]} onPick={set} zeroLabel="None"/>
  </div>);
}

// ── MONEY STACK (New Campaign → Money) ───────────────────────────────────────
// The commercial as one bar: what reaches creators, what stays here, what is
// charged on top — against the total the client pays. It is also the only place
// the total is stated, being the one figure nobody types.
//
// Segments a role can't see are still drawn, just unlabelled: a bar that
// changed shape by viewer would make two people describe it differently.
function MoneyStack({base,fee,pool,showMargin,showFee}){
  const total = base + fee;
  if(total<=0) return null;
  const margin = Math.max(0, base - pool);
  const segs = [
    {k:"pool",   label:"Creator pool", v:pool,   c:T.accent,      show:true},
    {k:"margin", label:"Agency",       v:margin, c:`${T.gold}99`, show:showMargin},
    {k:"fee",    label:"Agency fee",   v:fee,    c:T.teal,        show:showFee},
  ].filter(s=>s.v>0);
  return(<div style={{marginBottom:14,padding:"12px 14px",borderRadius:10,background:T.raised,border:`1px solid ${T.border}`}}>
    <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:10,marginBottom:9}}>
      <Lbl>Client pays</Lbl>
      <span style={{fontSize:17,fontWeight:700,color:T.text,fontFamily:SF,letterSpacing:"-0.02em"}}>{fmtINR(total)}</span>
    </div>
    <div style={{display:"flex",height:9,borderRadius:5,overflow:"hidden",background:T.mute,gap:2}}>
      {segs.map(s=><div key={s.k} title={`${s.label} — ${fmtINR(s.v)}`}
        style={{width:`${(s.v/total)*100}%`,background:s.c,borderRadius:3,transition:"width 0.3s ease"}}/>)}
    </div>
    <div style={{display:"flex",flexWrap:"wrap",gap:"5px 16px",marginTop:9}}>
      {segs.filter(s=>s.show).map(s=>(
        <span key={s.k} style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:9.5,fontFamily:SF,color:T.sub}}>
          <span style={{width:7,height:7,borderRadius:2,background:s.c,flexShrink:0}}/>
          {s.label} <strong style={{color:T.text,fontWeight:600}}>{fmtINR(s.v)}</strong>
          <span style={{color:T.label}}>{Math.round((s.v/total)*100)}%</span>
        </span>))}
    </div>
    {/* In words as well as drawn: the total is what the quote, the PO and the
        invoice are written for. */}
    {fee>0&&showFee&&<div style={{marginTop:8,fontSize:9.5,color:T.label,fontFamily:SF,lineHeight:1.5}}>
      {fmtINR(base)} budget + {fmtINR(fee)} agency fee. The client is quoted, PO'd and invoiced for the total.
    </div>}
  </div>);
}

// ── STEPPER (New Campaign → Scope) ───────────────────────────────────────────
// A count you nudge rather than select-all and retype — both scope numbers are
// small and usually move by one. Still a real number input underneath, so
// typing 12 beats twelve clicks.
function Stepper({value,onChange,min=1,max=99,unit}){
  const n = parseInt(value)||0;
  const set = v => onChange(String(Math.min(max, Math.max(min, v))));
  const btn = live => ({width:28,height:28,borderRadius:8,flexShrink:0,fontSize:15,lineHeight:1,fontFamily:SF,
    border:`1px solid ${live?T.borderMid:T.border}`,background:live?T.surface:"transparent",
    color:live?T.text:T.label,cursor:live?"pointer":"not-allowed",transition:"all 0.15s"});
  return(<div style={{display:"flex",alignItems:"center",gap:7}}>
    <button type="button" onClick={()=>set(n-1)} disabled={n<=min} title="One fewer" style={btn(n>min)}>−</button>
    <input type="number" min={min} max={max} value={value} onChange={e=>onChange(e.target.value)} onBlur={()=>set(n)}
      style={{...INP,width:58,textAlign:"center",padding:"7px 4px",resize:"none",fontWeight:600}}/>
    <button type="button" onClick={()=>set(n+1)} disabled={n>=max} title="One more" style={btn(n<max)}>+</button>
    {unit&&<span style={{fontSize:10.5,color:T.sub,fontFamily:SF}}>{unit}</span>}
  </div>);
}

// ── BRAND MARK ────────────────────────────────────────────────────────────────
// The brand's logo, and the control that sets it. The mark IS the button —
// that's where someone looking to change it already is, and an empty one is the
// most legible "nothing here yet" affordance the board can carry. It stops the
// click from reaching the row it sits in, so editing a logo never also opens a
// campaign.
const brandInitials=(s="")=>s.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase()||"?";

function BrandMark({label,logoUrl,accent,size=38,onEdit}){
  const [broken,setBroken]=useState(false);
  const show=!!logoUrl&&!broken;
  return(
    <div
      onClick={onEdit?e=>{e.stopPropagation();onEdit();}:undefined}
      title={onEdit?(show?`Change ${label}'s logo`:`Set ${label}'s logo`):label}
      style={{width:size,height:size,borderRadius:Math.round(size*0.29),flexShrink:0,overflow:"hidden",
        background:show?"#FFFFFF":"rgba(0,0,0,0.05)",
        // The one place the brand's own colour touches the row's interior — a
        // ring around its own logo, where it can't be mistaken for a status.
        border:`1px solid ${accent?`${accent}55`:"rgba(0,0,0,0.09)"}`,
        display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:Math.round(size*0.32),fontWeight:700,color:"#86868B",fontFamily:SF,letterSpacing:"-0.02em",
        cursor:onEdit?"pointer":"inherit"}}
    >
      {show
        ? <img src={logoUrl} alt="" onError={()=>setBroken(true)} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        : brandInitials(label)}
    </div>
  );
}

// ── CAMPAIGN CARD ─────────────────────────────────────────────────────────────
// One campaign, one card, in a flat grid ordered newest-first.
//
// The board used to group 205px tiles under a brand masthead, so reading it
// meant reading brand-first: six campaigns cost six headers and most of a
// screen, and the newest campaign could be anywhere on the page. Grouping is
// gone — recency IS the structure now — and the brand became an attribute of
// the card it belongs to: its logo, its name, and the colour sampled from that
// logo along the card's top edge.
//
// The ring is the card's centre of gravity because progress is the one thing
// every campaign has and the one thing worth comparing at a glance. It carries
// the STAGE colour and the stage names itself underneath it, which is what lets
// the rest of the card stay uncoloured — a 90%-and-ended card looks nothing
// like a 90%-and-live one without either of them needing a second chip.
//
// Colour still means stage and only stage. The brand accent is confined to the
// top rule and the ring around its own logo, so a board of six brands never
// becomes a field of competing hues.
const CARD_LINE = "1px solid rgba(0,0,0,0.06)";

// Figure over caption — the figure is what you are scanning for, so it reads
// first and the caption explains it, rather than the other way round.
const CardStat = ({label,value}) => (
  <div style={{padding:"9px 5px",textAlign:"center",minWidth:0}}>
    <div style={{fontFamily:SF,fontSize:12,fontWeight:600,color:"#1D1D1F",letterSpacing:"-0.02em",
      fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
      {value}
    </div>
    <Lbl color="#A0A0A6" style={{display:"block",marginTop:2,fontSize:8.5,letterSpacing:"0.09em"}}>{label}</Lbl>
  </div>
);

// forwardRef because AnimatePresence's popLayout measures the card it is
// animating out — a plain function component silently loses that ref.
const CampaignCard = forwardRef(function CampaignCard(
  {camp,role,accent,logoUrl,brandLabel,onClick,onEditLogo},
  ref,
){
  const col=viewCol(camp,role);
  const pl=viewPl(camp,role);
  const es=endStatus(camp.end,camp.stage);
  const pct=progressOf(camp,role);
  const st=execStats(camp);
  const team=[
    {m:getM(camp.amId),l:"AM"},
    {m:getM(camp.cmId),l:"CM"},
    {m:getM(camp.eaId),l:"EA"},
  ].filter(x=>x.m);
  // Ended or fully paid campaigns sit back at 0.72 so live work reads first.
  // Hover restores them to full.
  const done=hasEnded(camp)||normStage(camp.stage)==="payment_done";
  const added=createdAtOf(camp);
  return(
    <motion.div
      ref={ref}
      role="button" tabIndex={0}
      onClick={onClick}
      onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onClick();}}}
      initial={{opacity:0,y:10,scale:0.985}}
      animate={{opacity:done?0.72:1,y:0,scale:1}}
      exit={{opacity:0,scale:0.97,transition:{duration:0.12}}}
      whileHover={{opacity:1,y:-4,boxShadow:"0 16px 38px rgba(0,0,0,0.11)"}}
      whileTap={{scale:0.99}}
      transition={{type:"spring",stiffness:340,damping:30}}
      style={{position:"relative",display:"flex",flexDirection:"column",
        borderRadius:16,background:"#FFFFFF",border:"1px solid rgba(0,0,0,0.07)",
        boxShadow:"0 1px 2px rgba(0,0,0,0.04)",cursor:"pointer",overflow:"hidden",outline:"none"}}
    >
      {/* BRAND RULE — the brand's own colour, and the only place on the card
          it appears besides the ring around its logo. */}
      <div aria-hidden="true" style={{height:3,background:accent||"rgba(0,0,0,0.07)"}}/>

      {/* IDENTITY */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"13px 14px 0"}}>
        <BrandMark label={brandLabel} logoUrl={logoUrl} accent={accent} size={32} onEdit={onEditLogo}/>
        <Lbl color="#8E8E93" style={{flex:1,minWidth:0,fontSize:9,letterSpacing:"0.11em",fontWeight:700,
          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
          {brandLabel}{camp.region?` · ${camp.region}`:""}
        </Lbl>
        {/* "TBC", not the em dash fmtINR would give: on a board of cards each
            showing a rupee figure here, a dash reads as a number that failed
            to load rather than as a campaign that hasn't got one yet. */}
        {canFin(role)&&(budgetPending(camp)
          ? <span title="No budget allocated yet" style={{flexShrink:0,fontFamily:SF,fontSize:9,fontWeight:700,
              letterSpacing:"0.06em",color:T.amber,background:`${T.amber}14`,
              border:`1px solid ${T.amber}33`,borderRadius:5,padding:"2px 6px"}}>
              BUDGET TBC
            </span>
          : <span style={{flexShrink:0,fontFamily:SF,fontSize:12,fontWeight:700,color:"#1D1D1F",
              letterSpacing:"-0.02em",fontVariantNumeric:"tabular-nums"}}>
              {fmtINR(camp.budget)}
            </span>
        )}
      </div>

      {/* CAMPAIGN NAME — clamped to two lines at a fixed height, so every ring
          on the row sits on the same line however long the names are. */}
      <div style={{padding:"8px 14px 0",height:52,fontFamily:"'Newsreader',serif",fontStyle:"italic",
        fontSize:19,fontWeight:500,lineHeight:1.2,letterSpacing:"-0.02em",color:"#1D1D1F",
        display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>
        {camp.name}
      </div>

      {/* PROGRESS */}
      <div style={{padding:"10px 14px 14px",display:"flex",flexDirection:"column",alignItems:"center",gap:9}}>
        <Donut size={78} thickness={7} segments={[
          {value:pct,color:col,label:pl.label},
          {value:Math.max(0,100-pct),color:"transparent",label:"Remaining"},
        ]} center={
          <span style={{display:"flex",alignItems:"baseline"}}>
            <span style={{fontSize:23,fontWeight:700,letterSpacing:"-0.03em"}}>{pct}</span>
            <span style={{fontSize:11,fontWeight:600,color:"#A0A0A6"}}>%</span>
          </span>
        }/>
        <Lbl color={col} style={{fontSize:9,fontWeight:700,letterSpacing:"0.10em",textAlign:"center"}}>
          {pl.label}
        </Lbl>
      </div>

      {/* DELIVERY — the date column gets the wider track; equal thirds clipped
          "22 Aug 2026" to "22 Aug 20…" once three cards fit across a 900px
          window, and a truncated end date is worse than an uneven grid. */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1.35fr",borderTop:CARD_LINE}}>
        {/* No denominator when no creator count has been agreed. `st.target`
            falls back to the locked count in that case, so this read "0/0" on a
            campaign whose scope was deliberately left open — which states a
            target of zero rather than the absence of one. Posts alongside it
            has always dropped to "—" for the same reason. */}
        <CardStat label="Creators" value={numReqOf(camp)!=null?`${st.locked}/${st.target}`:`${st.locked}`}/>
        <CardStat label="Posts" value={st.expected?`${st.delivered}/${st.expected}`:"—"}/>
        <CardStat label="Ends" value={prettyDate(camp.end)||"TBD"}/>
      </div>

      {/* FOOTER — the time-sensitive thing about this campaign, and who is
          carrying it. The end-date nudge when there is one to give; otherwise
          when the campaign was added, which is the one fact that explains the
          order the board is in and appears nowhere else on the card. Every
          campaign here runs under the same service, so naming it was noise. */}
      <div style={{marginTop:"auto",display:"flex",alignItems:"center",gap:8,minHeight:42,
        padding:"8px 14px",borderTop:CARD_LINE}}>
        {es ? <EndPill es={es}/> : added ? (
          <Lbl color="#A0A0A6" style={{minWidth:0,fontSize:9,whiteSpace:"nowrap",overflow:"hidden",
            textOverflow:"ellipsis"}}>
            Added {prettyDate(isoDay(new Date(added)))}
          </Lbl>
        ) : null}
        <div style={{flex:1}}/>
        <div style={{display:"flex",alignItems:"center",flexShrink:0}}>
          {team.slice(0,3).map((person,i)=>{
            const user=person.m;
            const url=UsersAPI.avatarUrl({id:user.userId,hasAvatar:user.hasAvatar,avatarUpdatedAt:user.avatarUpdatedAt});
            return(
              <div key={`${user.id||user._id||i}-${person.l}`} title={`${user.name||person.l} · ${person.l}`}
                style={{width:24,height:24,borderRadius:"50%",overflow:"hidden",marginLeft:i?-7:0,
                  background:"#FFFFFF",border:"2px solid #FFFFFF",boxShadow:"0 0 0 1px rgba(0,0,0,0.08)",
                  display:"flex",alignItems:"center",justifyContent:"center",position:"relative",zIndex:10-i,
                  fontFamily:SF,fontSize:8,fontWeight:800,color:"#1D1D1F"}}>
                {url
                  ? <img src={url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  : initials(user.name)}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
});

// ── CAMPAIGN BOARD ────────────────────────────────────────────────────────────
// The already-filtered, already-sorted `visible` list, one card each. No
// grouping and no re-sorting here — the page owns the order (newest first, see
// createdAtOf) so the detail view's prev/next steps through exactly what the
// board shows.
function CampaignList({campaigns,role,onSelect,brandName,brandLogoUrl,onEditLogo,brandFilter}){
  // Every brand on the board resolves its colour in one pass — a hook can't be
  // called inside the map that renders the cards.
  const accents=useBrandAccents(campaigns.map(c=>brandLogoUrl(c.brandId)));
  const labelOf=c=>brandName(c.brandId)||c.client||"Unassigned";

  if(!campaigns.length){
    // Scoped to one brand with nothing to show: still name that brand, and keep
    // its logo editable. Dropping straight to bare grey text was reported as
    // "the colour goes when I add the brand filter" — worse than colourless, it
    // removes the only on-page confirmation of WHICH brand you're scoped to, so
    // an empty board is indistinguishable from a broken one.
    const label=brandFilter?brandName(brandFilter):null;
    return(
      <div style={{padding:"48px 28px",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
        {label&&<BrandMark label={label} logoUrl={brandLogoUrl(brandFilter)}
          accent={accents[brandLogoUrl(brandFilter)]} size={46}
          onEdit={onEditLogo?()=>onEditLogo(brandFilter):undefined}/>}
        <div style={{fontSize:13,color:"#86868B",fontFamily:SF,textAlign:"center"}}>
          {label?`No campaigns for ${label} in this view.`:"No campaigns match"}
        </div>
      </div>
    );
  }

  return(
    <div style={{padding:"18px 28px 40px"}}>
      {/* Says what the board is showing and in what order — the one thing a
          flat grid can't say for itself. */}
      <Lbl color="#A0A0A6" style={{display:"block",marginBottom:12,fontSize:9.5,letterSpacing:"0.09em"}}>
        {campaigns.length} campaign{campaigns.length===1?"":"s"} · newest first
      </Lbl>
      {/* auto-fill, not auto-fit: a board with two campaigns keeps them at card
          width instead of stretching them across the whole screen. */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",
        gap:14,alignItems:"stretch"}}>
        <AnimatePresence mode="popLayout">
          {campaigns.map(c=>{
            const logoUrl=brandLogoUrl(c.brandId);
            return(
              <CampaignCard
                key={c.id}
                camp={c}
                role={role}
                brandLabel={labelOf(c)}
                logoUrl={logoUrl}
                accent={accents[logoUrl]}
                onClick={()=>onSelect(c.id)}
                onEditLogo={onEditLogo&&c.brandId?()=>onEditLogo(c.brandId):undefined}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── VIEWS — the counts ARE the filter ────────────────────────────────────────
// One control, not two. A stat strip counted but couldn't be clicked; a pill
// row filtered but showed no numbers. They named different groups, so "3
// Active" led nowhere, and the strip counted the ALREADY FILTERED list —
// collapsing every number to 0 or 1 the moment a pill was picked.
//
// "Active" (not draft/paid, not ended) was dropped: it lands on nearly the same
// campaigns as "In Execution", which has the actionable meaning.
//
// Predicates, not stage-id lists — two of these span the derived execution
// track, which the stored finance stage doesn't know about.
const VIEWS=[
  { id:"all",       label:"All",               icon:"grid",  match:()=>true },
  { id:"execution", label:"In Execution",      icon:"pulse", match:c=>executionStageOf(c)==="execution" },
  // Blocked on a person rather than on work in progress — Draft waits on the
  // brief, Brief Locked on staffing, Team Assigned on Accounts raising the PO.
  { id:"attention", label:"Require Attention", icon:"alert", match:c=>["draft","brief_locked","team_assigned"].includes(normStage(c.stage)), tone:T.amber },
  { id:"done",      label:"Completed",         icon:"check", match:c=>normStage(c.stage)==="payment_done" },
  { id:"ended",     label:"Ended",             icon:"flag",  match:hasEnded, tone:T.red },
];

// Tiny stroke icons for the view bar — feather-style, 13px, so each view reads
// at a glance instead of only by its label. No icon library for five shapes.
const VIEW_ICON_PATHS={
  grid:  <><rect x="2.5" y="2.5" width="4" height="4" rx="1"/><rect x="8.5" y="2.5" width="4" height="4" rx="1"/><rect x="2.5" y="8.5" width="4" height="4" rx="1"/><rect x="8.5" y="8.5" width="4" height="4" rx="1"/></>,
  pulse: <polyline points="1.5,8 4.5,8 6,3.5 8.5,12.5 10,8 13.5,8"/>,
  alert: <><path d="M7.5 1.5 L14 13 H1 Z"/><line x1="7.5" y1="6" x2="7.5" y2="9"/><circle cx="7.5" cy="11.2" r="0.6" fill="currentColor" stroke="none"/></>,
  check: <><circle cx="7.5" cy="7.5" r="6"/><polyline points="4.7,7.6 6.6,9.5 10.5,5.2"/></>,
  flag:  <><path d="M3.5 1.5 V14"/><path d="M3.5 2.5 H11.5 L9.5 5 L11.5 7.5 H3.5"/></>,
  // Search sits in the same row as the views, so it is drawn on the same grid
  // at the same stroke. It used to be "⌕" (U+2315) set as text — a glyph whose
  // weight and size come from whatever font resolves it, which is why it never
  // matched the icons beside it.
  search:<><circle cx="6.6" cy="6.6" r="4.6"/><line x1="10.1" y1="10.1" x2="13.6" y2="13.6"/></>,
};
const ViewIcon=({id,color})=>(
  <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    {VIEW_ICON_PATHS[id]}
  </svg>
);

// A tab rail, not a row of pills — and the rail is the header's OWN bottom
// border, so the line that ends the header does a second job instead of sitting
// under a separate band of chrome.
//
// Two earlier shapes were wrong in the same way. A segmented slab stretched five
// equal columns across the full width with icon over count over label stacked in
// each: 54px of heavier material than anything below it. Pills fixed the weight
// but not the geometry — fully-round chips beside a 10px-radius search field are
// two shapes doing one job, which is what still read as off.
//
// Tabs also say the right thing: these five views are mutually exclusive, which
// is what a tab rail means. If a filter is ever added that COMBINES with another,
// this shape will be lying and should go back to chips.
//
// The count still rides inside the tab, because the counts ARE the filter: a view
// you can read the size of before clicking it is the whole point of the control.
function ViewBar({counts,value,onChange}){
  return(
    // Scrolls rather than wraps: a wrapped tab would leave the rail behind on
    // the line above it.
    <div style={{display:"flex",alignItems:"center",overflowX:"auto"}}>
      {VIEWS.map(v=>{
        const on=value===v.id, n=counts[v.id]||0;
        // A tone only fires when there is something to look at — a red 0 under
        // "Ended" is an alarm about nothing. On a tab the tone rides the COUNT,
        // never the rule: the rule means "this is the view you are in", and one
        // meaning per element is what keeps the rail readable.
        const hot=v.tone&&n>0;
        return(
          <button key={v.id} onClick={()=>onChange(v.id)} aria-pressed={on} title={`Show ${v.label.toLowerCase()}`}
            style={{position:"relative",display:"inline-flex",alignItems:"center",gap:7,flexShrink:0,
              height:38,padding:"0 2px",marginRight:24,border:"none",background:"none",
              cursor:"pointer",fontFamily:SF}}>
            <ViewIcon id={v.icon} color={on?T.accent:hot?v.tone:"#B8B8BE"}/>
            <span style={{fontSize:12.5,fontWeight:on?600:500,letterSpacing:"-0.01em",
              color:on?"#1D1D1F":"#6E6E73",whiteSpace:"nowrap"}}>{v.label}</span>
            <span style={{minWidth:17,padding:"1px 5px",borderRadius:999,textAlign:"center",
              fontSize:10,fontWeight:700,fontVariantNumeric:"tabular-nums",
              background:hot?`${v.tone}1A`:on?`${T.accent}1A`:"rgba(0,0,0,0.05)",
              color:hot?v.tone:on?T.accent:"#6E6E73"}}>{n}</span>
            {/* One element that TRAVELS between tabs, so switching views reads as
                movement along the rail rather than two rules swapping in place.
                Sits on -1px to cover the header's border, which is the rail. */}
            {on&&<motion.div layoutId="viewRule" transition={{type:"spring",stiffness:500,damping:38}}
              style={{position:"absolute",left:0,right:0,bottom:-1,height:2,
                borderRadius:"2px 2px 0 0",background:T.accent}}/>}
          </button>
        );
      })}
    </div>
  );
}

// ── ENDED NOTICE ─────────────────────────────────────────────────────────────
// Shown once when the Ended tab is opened: says how many campaigns finished and
// what to do about them. Dismissible, and re-appears if the count changes so a
// newly-ended campaign isn't silently hidden behind an earlier dismissal.
function EndedNotice({count,onDismiss}){
  return(
    <motion.div initial={{opacity:0,y:-8,height:0}} animate={{opacity:1,y:0,height:"auto"}} exit={{opacity:0,y:-6,height:0}}
      transition={{duration:0.24,ease:[0.16,1,0.3,1]}} style={{overflow:"hidden",flexShrink:0}}>
      <div style={{margin:"12px 28px 0",padding:"11px 14px",borderRadius:12,background:`${T.amber}0D`,border:`1px solid ${T.amber}2E`,display:"flex",alignItems:"center",gap:11}}>
        <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,background:`${T.amber}1F`,color:T.amber,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,fontFamily:SF}}>!</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:11.5,fontWeight:600,color:"#1D1D1F",fontFamily:SF,letterSpacing:"-0.01em"}}>
            {count} campaign{count===1?"":"s"} {count===1?"has":"have"} ended
          </div>
          <div style={{fontSize:10.5,color:"#6E6E73",fontFamily:SF,marginTop:1.5}}>
            Close them out — settle creator payments, file reporting, then mark complete.
          </div>
        </div>
        <button onClick={onDismiss} style={{background:"transparent",border:"none",cursor:"pointer",color:"#86868B",fontSize:14,lineHeight:1,padding:"3px 5px",borderRadius:5,fontFamily:SF,flexShrink:0}}>✕</button>
      </div>
    </motion.div>
  );
}

// ── DIALOG ───────────────────────────────────────────────────────────────────
// One shell for every confirm-or-collect dialog here. Six had hand-copied the
// same chrome and already drifted — Remove Creator had no enter animation and
// no spacer, so its buttons sat side by side while every other dialog put them
// at opposite ends.
//
// `confirm` is one object, not four props: the label, the colour and the guard
// are a single description of the action.
function Dialog({title,sub,width=400,onCancel,confirm,children}){
  return(<div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}}
      onClick={onCancel} style={{position:"absolute",inset:0,background:"rgba(4,5,10,0.88)",backdropFilter:"blur(4px)"}}/>
    <motion.div initial={{opacity:0,scale:0.96,y:8}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:0.97,y:4}}
      transition={{duration:0.18,ease:"easeOut"}}
      style={{position:"relative",width:`min(${width}px,92vw)`,background:T.surface,border:`1px solid ${T.borderMid}`,borderRadius:10,padding:"20px"}}>
      <div style={{marginBottom:14}}>
        <div style={{fontFamily:"'Newsreader',serif",fontSize:16,color:T.text,fontStyle:"italic"}}>{title}</div>
        {sub&&<div style={{fontSize:11,color:T.sub,lineHeight:1.6,marginTop:4}}>{sub}</div>}
      </div>
      {children}
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
        <div style={{flex:1}}/>
        <Btn variant={confirm.variant||"primary"} disabled={confirm.disabled} onClick={confirm.onClick}>{confirm.label}</Btn>
      </div>
    </motion.div>
  </div>);
}

// ── PANEL ────────────────────────────────────────────────────────────────────
// The other modal shape: a long form that has to scroll, so the title and the
// buttons are pinned and only the middle moves. Dialog can't do this — its body
// grows the card — and the two forms that need it had copied it between
// themselves. `sub` sits under the title in the pinned header rather than in
// the scrolling body, so the thing being edited stays named while you scroll.
function Panel({title,sub,width=480,maxHeight="90vh",onClose,footer,children}){
  return(<div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(4,5,10,0.88)",backdropFilter:"blur(5px)"}}/>
    <div style={{position:"relative",width:`min(${width}px,94vw)`,maxHeight,background:T.surface,border:`1px solid ${T.borderMid}`,borderRadius:10,overflow:"hidden",display:"flex",flexDirection:"column"}}>
      <div style={{padding:"16px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
        <div style={{minWidth:0}}>
          <div style={{fontFamily:"'Newsreader',serif",fontSize:17,color:T.text,fontStyle:"italic"}}>{title}</div>
          {sub&&<div style={{fontSize:9.5,color:T.sub,marginTop:2}}>{sub}</div>}
        </div>
        <button onClick={onClose} style={{background:"transparent",border:"none",color:T.sub,fontSize:16,cursor:"pointer",flexShrink:0}}>✕</button>
      </div>
      <div style={{padding:"18px 20px",overflowY:"auto",flex:1}}>{children}</div>
      <div style={{padding:"14px 20px",borderTop:`1px solid ${T.border}`,display:"flex",gap:8,alignItems:"center"}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <div style={{flex:1}}/>
        {footer}
      </div>
    </div>
  </div>);
}

// ── REMOVE MODAL ─────────────────────────────────────────────────────────────
function RemoveModal({creator,onConfirm,onCancel}){
  const [reason,setReason]=useState("");
  const [note,setNote]=useState("");
  return(
    <Dialog title="Remove Creator" onCancel={onCancel}
      sub={<>{creator?.name} <CreatorHandle creator={creator} style={{fontSize:11}} fallback=""/> — select a reason</>}
      confirm={{label:"Remove creator",variant:"danger",disabled:!reason,onClick:()=>onConfirm(reason,note)}}>
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
        {REMOVE_REASONS.map(r=>(
          <label key={r.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",borderRadius:6,cursor:"pointer",background:reason===r.id?`${T.accent}10`:T.raised,border:`1px solid ${reason===r.id?`${T.accent}30`:T.border}`,transition:"all 0.1s"}}>
            <input type="radio" value={r.id} checked={reason===r.id} onChange={()=>setReason(r.id)} style={{marginTop:2,accentColor:T.accent}}/>
            <div>
              <div style={{fontSize:11.5,color:T.text,fontWeight:500,marginBottom:2}}>{r.label}</div>
              <div style={{fontSize:10,color:T.sub}}>{r.desc}</div>
            </div>
          </label>
        ))}
      </div>
      <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="Additional note (optional)…" style={{...INP,fontSize:11,marginBottom:14}}/>
    </Dialog>
  );
}

// ── LOCK CREATOR MODAL ───────────────────────────────────────────────────────
// Locking is the only creator action that spends money and cannot be undone:
// it posts the fee to Billing as a committed expense, freezes the fee, and —
// once it fills the last required slot — sends the roster to the client. It was
// one item in a dropdown, indistinguishable from "Negotiating", so it could be
// (and was) taken by mis-click. This states the three consequences and names
// the only way back, which is removing the creator entirely.
function LockCreatorModal({creator,onConfirm,onCancel}){
  return(
    <Dialog title="Lock Creator" width={420} onCancel={onCancel}
      sub={<>Lock <strong style={{color:T.text}}>{creator?.name}</strong> <CreatorHandle creator={creator} style={{fontSize:11}} fallback=""/> at <strong style={{color:T.text}}>{fmtINR(costOf(creator))}</strong> as a <strong style={{color:T.text}}>{COLLAB_TYPES.find(c=>c.id===creator?.collab)?.label}</strong> post?</>}
      confirm={{label:"Lock creator",variant:"success",onClick:onConfirm}}>
      <div style={{display:"flex",flexDirection:"column",gap:8,padding:"12px 14px",background:T.raised,border:`1px solid ${T.border}`,borderRadius:8,marginBottom:14}}>
        {[["Their fee is committed",`${fmtINR(costOf(creator))} is posted to Billing as an expense awaiting approval.`],
          ["The fee is frozen","It can no longer be edited from this table."],
          ["This can't be reversed","Locked is final. If the deal falls through, remove them from the roster instead."]].map(([h,d])=>(
          <div key={h} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
            <Dot color={T.amber} size={5}/>
            <div><div style={{fontSize:11,color:T.text,fontWeight:500}}>{h}</div><div style={{fontSize:10,color:T.sub,marginTop:1}}>{d}</div></div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

// ── DELETE CAMPAIGN MODAL ────────────────────────────────────────────────────
// Founder-only confirm step. The backend soft-deletes (deleted:true), so the
// campaign disappears from every list but stays recoverable in the DB.
const DeleteCampaignModal=({camp,onConfirm,onCancel})=>(
  <Dialog title="Delete Campaign" onCancel={onCancel}
    sub={<>Delete <strong style={{color:T.text}}>{camp?.name}</strong> ({camp?.client})? It will be removed from all views. Recovery requires a database restore.</>}
    confirm={{label:"Delete campaign",variant:"danger",onClick:onConfirm}}/>
);

// ── CONFIRM STAGE-CHANGE MODAL ───────────────────────────────────────────────
// Double-check gate for every workflow action that moves a campaign to another
// pipeline stage — changes are only applied (and synced) after confirmation.
const ConfirmActionModal=({camp,label,onConfirm,onCancel})=>(
  <Dialog title="Confirm stage change" onCancel={onCancel}
    sub={<><strong style={{color:T.text}}>{label}</strong> — this moves <strong style={{color:T.text}}>{camp?.name}</strong> to a different pipeline stage and is logged on the campaign timeline. Continue?</>}
    confirm={{label:"Yes, confirm",onClick:onConfirm}}/>
);

// ── EXTEND END DATE MODAL ────────────────────────────────────────────────────
// A campaign that has run past its end date (or is about to) still has work
// against it — creators mid-production, deliverables not yet live. Rather than
// force a stage change or leave the card permanently flagged "Ended", the
// schedule owner pushes the end date out and the move is logged.
//
// Only ever moves the date forward: `min` is the day after the current end, so
// the picker can't quietly shorten a campaign. A reason is required, because
// six months later the timeline entry is the only record of why the date moved.
function ExtendEndModal({camp,onConfirm,onCancel}){
  const cur=camp.end;
  const [end,setEnd]=useState("");
  const [reason,setReason]=useState("");
  const floor=ISO_DATE.test(cur||"")?addDays(cur,1):today();
  // Presets are relative to the later of the current end and today: extending
  // a campaign that ended three weeks ago by "+2 weeks" should land two weeks
  // out, not a week in the past.
  const base=!ISO_DATE.test(cur||"")||cur<today()?today():cur;
  const presets=[["+1 week",7],["+2 weeks",14],["+1 month",30]];
  const delta=ISO_DATE.test(cur||"")&&end?daysBetween(cur,end):null;
  const ok=!!end&&end>=floor&&!!reason.trim();

  return(
    <Dialog title="Extend end date" width={420} onCancel={onCancel}
      sub={<><strong style={{color:T.text}}>{camp.name}</strong> currently ends <strong style={{color:T.text}}>{prettyDate(cur)||"—"}</strong>. The new date is logged on the campaign timeline.</>}
      confirm={{label:"Extend",disabled:!ok,onClick:()=>ok&&onConfirm(end,reason.trim())}}>
      <Lbl style={{display:"block",marginBottom:5}}>New end date</Lbl>
      <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
        {presets.map(([label,n])=>{
          const v=addDays(base,n),on=end===v;
          return <Chip key={label} on={on} onClick={()=>setEnd(v)} style={{padding:"4px 10px",fontSize:10}}>{label}</Chip>;
        })}
      </div>
      <DateInput value={end} onChange={setEnd} min={floor} placeholder="Pick a new end date" style={{...INP,marginBottom:6}}/>
      {delta>0&&<div style={{fontSize:10,color:T.sub,marginBottom:10}}>{prettyDate(cur)} → <strong style={{color:"#1D1D1F"}}>{prettyDate(end)}</strong> · {delta} day{delta===1?"":"s"} longer</div>}

      <Lbl style={{display:"block",marginTop:6,marginBottom:5}}>Reason</Lbl>
      <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2}
        placeholder="e.g. two creators re-shooting after client revision"
        style={{...INP,fontSize:11,marginBottom:14}}/>
    </Dialog>
  );
}

// ── ALLOCATE BUDGET MODAL ────────────────────────────────────────────────────
// The second half of raising a campaign without a budget: the client has come
// back with a number, and this is where it lands.
//
// It asks for exactly what the wizard's Commercial step asks for — the total
// and the creator split — through the same CreatorBudgetField, so the campaign
// ends up in a state indistinguishable from one that had a budget all along.
// Deliberately not a bare "total budget" input: a total with no split leaves
// creatorBudgetOf() falling back to its 60% guess, and a guess is what the
// split field exists to replace.
//
// The two notes at the bottom are the reason this is a modal rather than an
// inline field. Allocating is not editing a number — it unparks the finance
// track (the PO becomes recordable, the quote that was skipped at brief-lock
// gets raised), and if creators were locked while the campaign had no pool,
// their committed fees are already spent against the number being set here.
function AllocateBudgetModal({camp,role,onConfirm,onCancel}){
  const [budget,setBudget]=useState("");
  const [split,setSplit]=useState({creatorBudgetMode:"pct",creatorBudgetPct:60,creatorBudgetAmt:""});
  const budgetNum=parseInt(budget)||0;
  const creatorBudget=resolveCreatorBudget(split,budgetNum);
  const ok=budgetNum>0&&creatorBudget>0&&creatorBudget<=budgetNum;
  // Fees already committed by locking creators before a pool existed. Nothing
  // stopped that — the roster is not the client's money — but the number being
  // typed now has to cover it, and only this screen can say so.
  const committed=(camp.creators||[]).filter(isLockedCreator).reduce((s,c)=>s+costOf(c),0);
  const short=ok&&committed>creatorBudget;
  const willQuote=briefLocked(camp);
  return(
    <Dialog title="Allocate budget" width={470} onCancel={onCancel}
      sub={<><strong style={{color:T.text}}>{camp.name}</strong> was raised without a budget. Setting one here is logged on the timeline and unblocks the finance track.</>}
      confirm={{label:"Allocate budget",disabled:!ok,onClick:()=>ok&&onConfirm(budgetNum,creatorBudget)}}>
      <Lbl style={{display:"block",marginBottom:5}}>Total budget (₹)</Lbl>
      <MoneyInput value={budget} onChange={setBudget} placeholder="e.g. 12,50,000" style={{...INP,resize:"none",marginBottom:4}}/>
      <div style={{fontSize:9.5,color:T.sub,marginBottom:14}}>What the client is billed. The PO and the invoice are both raised from this.</div>
      <CreatorBudgetField
        budget={budgetNum}
        mode={split.creatorBudgetMode} pct={split.creatorBudgetPct} amount={split.creatorBudgetAmt}
        onChange={p=>setSplit(x=>({...x,...p}))}/>
      {/* The wizard's picture, because this is the other door a campaign gets a
          budget through and the split shouldn't look different by route. No fee:
          a campaign reaching this modal was raised without one. */}
      <MoneyStack base={budgetNum} fee={0} pool={creatorBudget}
        showMargin={canFF(role)} showFee={canAF(role)}/>
      <div style={{display:"flex",flexDirection:"column",gap:8,padding:"12px 14px",background:T.raised,border:`1px solid ${T.border}`,borderRadius:8,marginBottom:4}}>
        {[["The finance track opens","The client PO becomes recordable, and the invoice follows it."],
          ...(willQuote?[["The client quote is raised now","It was skipped when the brief was locked, because there was no number to quote."]]:[]),
          ...(committed>0?[["Creator fees already committed",`${fmtINR(committed)} is locked in against this pool.`]]:[])].map(([h,d])=>(
          <div key={h} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
            <Dot color={short?T.amber:T.green} size={5}/>
            <div><div style={{fontSize:11,color:T.text,fontWeight:500}}>{h}</div><div style={{fontSize:10,color:T.sub,marginTop:1}}>{d}</div></div>
          </div>
        ))}
      </div>
      {short&&<div style={{fontSize:9.5,color:T.amber,marginTop:8,lineHeight:1.5}}>
        {fmtINR(committed)} is already committed to locked creators — {fmtINR(committed-creatorBudget)} more than this creator pool. You can still allocate; the Financials tab will read over budget until the pool or the fees change.
      </div>}
    </Dialog>
  );
}

// ── CLIENT PO MODAL ──────────────────────────────────────────────────────────
// The PO stage used to advance on a bare "Mark Purchase Order Raised" — an
// assertion that a PO existed somewhere, with no record, number or amount.
// Billing had a real PO model the campaign never touched, which is how client
// PO records ended up holding *vendor* PO numbers.
//
// Now the stage advances because the PO exists: this collects it, writes the
// client PO, links it to the invoice, and the transition follows.
function ClientPOModal({camp,invoiceAmount,onConfirm,onCancel}){
  const [poNumber,setPo]=useState("");
  const [amount,setAmount]=useState(String(invoiceAmount||camp.budget||0));
  const [date,setDate]=useState(today());
  const amt=parseInt(String(amount).replace(/[^\d]/g,""))||0;
  const ok=!!poNumber.trim()&&amt>0&&ISO_DATE.test(date);
  // Not a blocker — a single PO can legitimately cover several campaigns, or
  // be raised for less while the rest follows. It just shouldn't pass silently.
  const mismatch=invoiceAmount>0&&amt!==invoiceAmount;

  return(
    <Dialog title="Record client Purchase Order" width={420} onCancel={onCancel}
      sub={<>The PO <strong style={{color:T.text}}>{camp.client}</strong> raised against <strong style={{color:T.text}}>{camp.name}</strong>. Saving it starts the finance track at PO Raised and links the PO to its invoice in Billing.</>}
      confirm={{label:"Save PO",disabled:!ok,onClick:()=>ok&&onConfirm({poNumber:poNumber.trim(),amount:amt,receivedDate:date})}}>
      <Lbl style={{display:"block",marginBottom:5}}>Client PO number</Lbl>
      <input value={poNumber} onChange={e=>setPo(e.target.value)} placeholder="as it appears on the client's PO"
        style={{...INP,marginBottom:12}}/>

      <Lbl style={{display:"block",marginBottom:5}}>PO value</Lbl>
      <MoneyInput value={amt} onChange={setAmount} style={{...INP,marginBottom:mismatch?5:12}}/>
      {mismatch&&<div style={{fontSize:10,color:T.amber,marginBottom:12}}>
        Invoice for this campaign is {fmtINR(invoiceAmount)} — the PO authorises {fmtINR(amt)}.
      </div>}

      <Lbl style={{display:"block",marginBottom:5}}>PO date</Lbl>
      <DateInput value={date} onChange={setDate} style={{...INP,marginBottom:16}}/>
    </Dialog>
  );
}

// ── ADD CREATOR MODAL ─────────────────────────────────────────────────────────
// Doubles as the "Edit Creator" form (PERMS.editCreatorDetails): pass `editing` (an existing
// creator object) to prefill every field; onAdd then receives the merged
// creator (same _id, status/tracking preserved) instead of a new one.
// Exported so the Creators directory reuses it as its founder edit form.
//
// `costLocked` freezes the negotiated fee. The table cell refuses to edit a
// locked creator's cost — locking is what posts that fee to Billing as a
// committed expense, and re-pricing it afterwards silently restates a
// commitment the books have recorded and an invoice may already quote. This
// form reached the same field without the same guard, so Edit was a way around
// the lock: change the number here and it flowed straight back to the campaign
// and on to the expense (see creatorExpensePlan), which made locking the cost
// mean nothing. The asking price stays editable — it is a note about the
// negotiation, not the commitment.
//
// The caller decides, via costFrozen(), so the founder's override
// (PERMS.overrideLockedCost) reaches this field too rather than being an
// exception the table has and the modal doesn't.
export function AddCreatorModal({onAdd,onClose,editing=null,costLocked=false}){
  const pd0=editing?.personalDetails||{};
  const [f,setF]=useState({
    name:editing?.name||"",platform:editing?.platform||"Instagram",handle:editing?.handle||"",igUrl:editing?.igUrl||"",
    phone:editing?.phone||"",niche:editing?.niche||"",state:editing?.state||"",
    followers:editing?.followers!=null?String(editing.followers):"",avgLikes:editing?.avgLikes!=null?String(editing.avgLikes):"",avgER:editing?.avgER!=null?String(editing.avgER):"",
    pan:pd0.pan||"",email:pd0.email||"",address:pd0.address||"",
    bankName:pd0.bankName||"",bankAccount:pd0.bankAccount||"",bankBranch:pd0.bankBranch||"",ifsc:pd0.ifsc||"",
    payType:editing?.payType||"",upiId:pd0.upiId||"",
    vendorCode:editing?.payType==="vendor"?(editing.payId||""):""
  });
  const [askingPrice,setAskingPrice]=useState(editing?.askingPrice!=null?String(editing.askingPrice):"");
  const [cost,setCost]=useState(editing?.cost!=null?String(editing.cost):"");
  const [fetching,setFetching]=useState(false);
  const [fetchErr,setFetchErr]=useState(null);
  const [igFetched,setIgFetched]=useState(null);
  // Three-state, same contract as every other AvatarPicker in the app:
  // undefined = untouched, null = remove, data URI = new photo.
  const [avatarImage,setAvatarImage]=useState(undefined);
  const [errors,setErrors]=useState({});
  const u=(k,v)=>{
    const clean=FIELD_SANITIZE[k]?sanitizeField(FIELD_SANITIZE[k],v):v;
    setF(p=>({...p,[k]:clean}));
    setErrors(p=>({...p,[k]:FIELD_SANITIZE[k]?validateField(FIELD_SANITIZE[k],clean):null}));
  };
  const valid=f.name.trim()&&f.handle.trim();
  // Nothing beyond name+handle is mandatory here — bank/UPI/vendor details can
  // be filled later; InvoiceDetailsModal enforces them when they're needed.
  const Err=({k})=>errors[k]?<div style={{fontSize:9.5,color:T.red,marginTop:3}}>{errors[k]}</div>:null;

  // Per-platform profile lookup — only Instagram has a backend endpoint today;
  // other platforms keep the link field but Fetch stays disabled.
  const lookup=PROFILE_LOOKUP[f.platform];
  const handleFetch=async()=>{
    if(!lookup||!f.igUrl.trim())return;
    setFetching(true);setFetchErr(null);
    try{
      const data=await lookup.fetch(f.igUrl.trim());
      setIgFetched(data);
      setF(p=>({
        ...p,
        handle: p.handle || (data.username?`@${data.username}`:p.handle),
        name: p.name || data.fullName || p.name,
        followers: data.followers!=null?String(data.followers):p.followers,
        avgLikes: data.avgLikes!=null?String(data.avgLikes):p.avgLikes,
        avgER: data.engagementRate!=null?String(data.engagementRate):p.avgER,
      }));
    }catch(err){
      setFetchErr(err.message||"Fetch failed");
    }finally{
      setFetching(false);
    }
  };

  const handleAdd=()=>{
    if(!valid)return;
    // Only the selected payType's fields are mandatory; everything else just
    // needs to be well-formed if filled in.
    const errs=validateCreatorDetails(f,requiredForPayType(f.payType));
    setErrors(errs);
    if(Object.keys(errs).length)return;
    // payId mirrors the payType-specific identifier for the payment column
    const payId=f.payType==="vendor"?f.vendorCode:f.payType==="net_banking"?f.bankAccount:f.payType==="upi"?f.upiId:null;
    const personalDetails={
      pan: f.pan || null,
      email: f.email || null,
      address: f.address || null,
      bankName: f.bankName || null,
      bankAccount: f.bankAccount || null,
      bankBranch: f.bankBranch || null,
      ifsc: f.ifsc || null,
      upiId: f.upiId || null,
    };
    if(editing){
      // Merge onto the existing creator — _id, status, concept/demo/live and
      // tracking data all survive the edit.
      onAdd({
        ...editing,
        name:f.name, platform:f.platform, handle:f.handle, igUrl:f.igUrl||null,
        phone:f.phone||null, niche:f.niche, state:f.state||null,
        followers:f.followers, avgLikes:f.avgLikes||null, avgER:parseFloat(f.avgER)||null,
        askingPrice:parseInt(askingPrice)||null,
        // Belt and braces: the input is read-only when the fee is committed,
        // and the value it would have carried is discarded here too.
        cost:costLocked?costOf(editing):(parseInt(cost)||0),
        payType:f.payType||null, payId:payId||null,
        personalDetails:{...editing.personalDetails,...personalDetails},
        // Only when actually touched — sending `undefined` would read as
        // "field absent" and sending null would wipe an untouched photo.
        ...(avatarImage!==undefined?{avatarImage}:{}),
        // A Fetch in this session re-captured the platform picture, which is
        // how a creator who changed their Instagram photo gets the new one.
        // The backend copies the bytes and never stores this URL: it is signed
        // and expires (see remoteAvatar.js). Loses to an explicit upload.
        ...(avatarImage===undefined&&igFetched?.profilePic?{avatarSourceUrl:igFetched.profilePic}:{}),
      });
      onClose();
      return;
    }
    onAdd(mkCreator({
      ...f,
      avgER:parseFloat(f.avgER)||null,
      askingPrice:parseInt(askingPrice)||null,
      igFetched,
      state:f.state||null,
      payType:f.payType||null,
      payId:payId||null,
      personalDetails
    },parseInt(cost)||0));
    onClose();
  };

  return(
    <Panel title={editing?`Edit Creator — ${editing.name}`:"Add Creator"} onClose={onClose}
      footer={<Btn variant="primary" onClick={handleAdd} disabled={!valid}>{editing?"Save changes":"Add to list"}</Btn>}>
        {/* Directory edits only. On the campaign Add path this creator has no
            record yet, and their photo arrives on its own: the backend copies
            it out of the Fetch snapshot when the roster saves (creatorSync.js).
            A picker there would be a control that silently did nothing. */}
        {editing&&(
          <div style={{marginBottom:16,paddingBottom:16,borderBottom:`1px solid ${T.border}`}}>
            <Lbl style={{display:"block",marginBottom:10}}>Profile photo</Lbl>
            <AvatarPicker
              value={avatarImage}
              currentUrl={CreatorsAPI.avatarUrl(editing)}
              initials={(editing.name||"?").split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase()}
              onChange={setAvatarImage}
              size={64}
              noun="photo"
            />
          </div>
        )}
        <div style={{marginBottom:14}}><Lbl style={{display:"block",marginBottom:4}}>Platform <span style={{color:T.red}}>*</span></Lbl><select value={f.platform} onChange={e=>u("platform",e.target.value)} style={{...INP,resize:"none"}}>{PLATFORMS.map(p=><option key={p}>{p}</option>)}</select></div>
        <Lbl style={{display:"block",marginBottom:6}}>{lookup?.label||`${f.platform} profile link`}</Lbl>
        <div style={{display:"flex",gap:8,marginBottom:6}}>
          <input value={f.igUrl} onChange={e=>u("igUrl",e.target.value)} placeholder={lookup?.placeholder||"https://…"} style={{...INP,resize:"none",flex:1}}/>
          <Btn variant="ghost" onClick={handleFetch} disabled={!lookup||fetching||!f.igUrl.trim()}>{fetching?"Fetching…":"Fetch"}</Btn>
        </div>
        {!lookup&&<div style={{fontSize:9.5,color:T.label,marginBottom:10}}>Auto-fetch supports Instagram only for now — fill the stats below manually.</div>}
        {fetchErr&&<div style={{fontSize:10.5,color:T.red,marginBottom:10}}>{fetchErr}</div>}
        {igFetched&&!fetchErr&&(
          <div style={{marginBottom:14,padding:"14px",borderRadius:10,background:T.raised,border:`1px solid ${T.green}25`}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{position:"relative",flexShrink:0}}>
                {igFetched.profilePic
                  ? <img src={igFetched.profilePic} alt={igFetched.username} referrerPolicy="no-referrer" style={{width:52,height:52,borderRadius:"50%",objectFit:"cover",border:`1px solid ${T.border}`,display:"block"}}/>
                  : <div style={{width:52,height:52,borderRadius:"50%",background:T.mute}}/>}
                {igFetched.isVerified&&<div title="Verified" style={{position:"absolute",bottom:-2,right:-2,width:16,height:16,borderRadius:"50%",background:T.accent,border:`2px solid ${T.raised}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#FFF"}}>✓</div>}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{fontSize:13,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{igFetched.fullName||igFetched.username}</span>
                </div>
                <div style={{fontSize:10.5,color:T.sub}}>@{igFetched.username}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:0,marginTop:12,borderTop:`1px solid ${T.border}`,paddingTop:10}}>
              {[
                ["Followers",fmtNum(igFetched.followers)],
                ["Avg Likes",fmtNum(igFetched.avgLikes)],
                ["Avg Comments",fmtNum(igFetched.avgComments)],
                ["Posts",fmtNum(igFetched.posts)],
              ].map(([l,v],i)=>(
                <div key={l} style={{flex:1,textAlign:"center",borderLeft:i>0?`1px solid ${T.border}`:"none"}}>
                  <div style={{fontSize:13.5,fontWeight:700,color:T.text,letterSpacing:"-0.02em"}}>{v}</div>
                  <div style={{fontSize:8,color:T.label,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:2}}>{l}</div>
                </div>
              ))}
            </div>
            {Array.isArray(igFetched.recentPosts)&&igFetched.recentPosts.length>0&&(
              <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${T.border}`}}>
                <div style={{fontSize:8.5,color:T.label,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Recent posts</div>
                <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
                  {igFetched.recentPosts.slice(0,6).map((p,i)=>(
                    <a key={p.id||i} href={p.permalink||undefined} target="_blank" rel="noreferrer" style={{position:"relative",flexShrink:0,width:64,height:64,borderRadius:7,overflow:"hidden",display:"block",border:`1px solid ${T.border}`,textDecoration:"none"}}>
                      <img src={p.thumbnailUrl} alt="" referrerPolicy="no-referrer" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                      {p.likeCount!=null&&(
                        <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"2px 4px",background:"linear-gradient(transparent,rgba(0,0,0,0.75))",fontSize:8,color:"#FFF",fontWeight:600,display:"flex",alignItems:"center",gap:2}}>
                          ♥ {fmtNum(p.likeCount)}
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div style={{fontSize:9.5,color:T.green,marginTop:10}}>Followers, avg likes & ER filled below — review before saving.</div>
          </div>
        )}
        <Hr style={{margin:"10px 0 14px"}}/>
        <Lbl style={{display:"block",marginBottom:10}}>Required</Lbl>
        <div style={{marginBottom:12}}><Lbl style={{display:"block",marginBottom:4}}>Name <span style={{color:T.red}}>*</span></Lbl><input value={f.name} onChange={e=>u("name",e.target.value)} placeholder="e.g. Anjali Kitchen" style={{...INP,resize:"none"}}/></div>
        <div style={{marginBottom:12}}><Lbl style={{display:"block",marginBottom:4}}>Handle / Tag <span style={{color:T.red}}>*</span></Lbl><input value={f.handle} onChange={e=>u("handle",e.target.value)} placeholder="@username" style={{...INP,resize:"none"}}/></div>
        <Hr style={{margin:"14px 0"}}/>
        <Lbl style={{display:"block",marginBottom:10}}>Profile stats <span style={{fontSize:8,color:T.label,textTransform:"none",letterSpacing:0}}>— auto-filled by Fetch, editable</span></Lbl>
        <div style={{marginBottom:12}}><Lbl style={{display:"block",marginBottom:4}}>Phone <span style={{fontSize:8,color:T.label,textTransform:"none",letterSpacing:0}}>— internal only</span></Lbl><PhoneInput value={f.phone} onChange={v=>u("phone",v)} style={{...INP,resize:"none",borderColor:errors.phone?T.red:`${T.amber}30`}}/><Err k="phone"/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div><Lbl style={{display:"block",marginBottom:4}}>Niche</Lbl><input value={f.niche} onChange={e=>u("niche",e.target.value)} placeholder="e.g. Food, Fitness, Lifestyle" style={{...INP,resize:"none"}}/></div>
          <div><Lbl style={{display:"block",marginBottom:4}}>State</Lbl><select value={f.state} onChange={e=>u("state",e.target.value)} style={{...INP,resize:"none"}}><option value="">— Select —</option>{INDIAN_STATES.map(s=><option key={s}>{s}</option>)}</select></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
          {[["Followers","followers","e.g. 820K"],["Avg Likes","avgLikes","e.g. 32K"],["Avg ER%","avgER","e.g. 4.2"]].map(([l,k,ph])=>(
            <div key={k}><Lbl style={{display:"block",marginBottom:4}}>{l}</Lbl><input value={f[k]} onChange={e=>u(k,e.target.value)} placeholder={ph} style={{...INP,resize:"none"}}/></div>
          ))}
        </div>
        <Hr style={{margin:"14px 0"}}/>
        <Lbl style={{display:"block",marginBottom:10}}>Commercials</Lbl>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div><Lbl style={{display:"block",marginBottom:4}}>Asking Price (₹)</Lbl><MoneyInput value={askingPrice} onChange={setAskingPrice} placeholder="e.g. 90,000" style={{...INP,resize:"none"}}/></div>
          <div>
            <Lbl style={{display:"block",marginBottom:4}}>Negotiated Cost (₹){costLocked&&<span style={{fontSize:9,marginLeft:5}}>🔒</span>}</Lbl>
            {costLocked
              ? <div style={{...INP,background:T.mute,color:T.text,cursor:"not-allowed",display:"flex",alignItems:"center"}}>{fmtINR(costOf(editing))}</div>
              : <MoneyInput value={cost} onChange={setCost} placeholder="e.g. 75,000" style={{...INP,resize:"none"}}/>}
          </div>
        </div>
        {costLocked&&<div style={{fontSize:9.5,color:T.label,marginTop:6}}>
          This creator is locked — their fee is committed in Billing and can't be re-priced. Remove them from the roster if the deal falls through.
        </div>}
        <Hr style={{margin:"14px 0"}}/>
        <Lbl style={{display:"block",marginBottom:10}}>Payment</Lbl>
        <div style={{marginBottom:12}}>
          <Lbl style={{display:"block",marginBottom:4}}>Pay Type</Lbl>
          <select value={f.payType} onChange={e=>u("payType",e.target.value)} style={{...INP,resize:"none"}}>{PAYMENT_TYPES.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select>
        </div>
        {f.payType==="upi"&&<div style={{marginBottom:12}}>
          <Lbl style={{display:"block",marginBottom:4}}>UPI ID</Lbl>
          <input value={f.upiId} onChange={e=>u("upiId",e.target.value)} placeholder="name@okhdfcbank" style={{...INP,resize:"none",borderColor:errors.upiId?T.red:undefined}}/><Err k="upiId"/>
        </div>}
        {f.payType==="vendor"&&<div style={{marginBottom:12}}>
          <Lbl style={{display:"block",marginBottom:4}}>Vendor Code / ID</Lbl>
          <input value={f.vendorCode} onChange={e=>u("vendorCode",e.target.value)} placeholder="e.g. VND-1042" style={{...INP,resize:"none",borderColor:errors.vendorCode?T.red:undefined}}/><Err k="vendorCode"/>
        </div>}
        {f.payType==="net_banking"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          {[
            ["Bank Name",   "bankName",    "e.g. Canara Bank"],
            ["Account No.", "bankAccount", "e.g. 110074028985"],
            ["Branch",      "bankBranch",  "e.g. Basavangudi"],
            ["IFS Code",    "ifsc",        "e.g. CNRB0000684"],
          ].map(([l,k,ph]) => (
            <div key={k}>
              <Lbl style={{display:"block",marginBottom:4}}>{l}</Lbl>
              <input value={f[k]} onChange={e=>u(k,e.target.value)} placeholder={ph} style={{...INP,resize:"none",borderColor:errors[k]?T.red:undefined}}/><Err k={k}/>
            </div>
          ))}
        </div>}
        <Hr style={{margin:"14px 0"}}/>
        <Lbl style={{display:"block",marginBottom:10}}>Invoice Details <span style={{fontSize:8,color:T.label,textTransform:"none",letterSpacing:0}}>— for invoice generation 🧾</span></Lbl>
        <div style={{marginBottom:12}}>
          <Lbl style={{display:"block",marginBottom:4}}>PAN</Lbl>
          <input value={f.pan} onChange={e=>u("pan",e.target.value)} placeholder="ABCDE1234F" style={{...INP,resize:"none",borderColor:errors.pan?T.red:undefined}}/><Err k="pan"/>
        </div>
        <div style={{marginBottom:12}}>
          <Lbl style={{display:"block",marginBottom:4}}>Email</Lbl>
          <input value={f.email} onChange={e=>u("email",e.target.value)} placeholder="creator@email.com" style={{...INP,resize:"none",borderColor:errors.email?T.red:undefined}}/><Err k="email"/>
        </div>
        <div style={{marginBottom:12}}>
          <Lbl style={{display:"block",marginBottom:4}}>Address (for invoice)</Lbl>
          <textarea value={f.address} onChange={e=>u("address",e.target.value)} rows={2}
            placeholder="Full address" style={{...INP}}/>
        </div>
    </Panel>
  );
}

// ── INVOICE DETAILS MODAL ─────────────────────────────────────────────────────
// Opened per creator from the table's Invoice button (enabled once a pay type
// is chosen). Shows only the fields that pay type needs — a UPI creator never
// sees IFSC/branch/account — validates as you type, saves the details to the
// campaign, then opens the printable invoice.
const INVOICE_BASE_FIELDS = [
  ["Phone", "phone", "9876543210"],
  ["PAN",   "pan",   "ABCDE1234F"],
  ["Email", "email", "creator@email.com"],
];
const PAYTYPE_FIELDS = {
  upi:    [["UPI ID","upiId","name@okhdfcbank"]],
  vendor: [["Vendor Code / ID","vendorCode","e.g. VND-1042"]],
  net_banking: [
    ["Bank Name",   "bankName",    "e.g. Canara Bank"],
    ["Account No.", "bankAccount", "e.g. 110074028985"],
    ["Branch",      "bankBranch",  "e.g. Basavangudi"],
    ["IFS Code",    "ifsc",        "e.g. CNRB0000684"],
  ],
};

function InvoiceDetailsModal({ camp, creator, creators, onClose, onUpdateCreators, onLogTimeline }) {
  const { user } = useOutletContext() || {};
  const pd0 = creator.personalDetails || {};
  const [form, setForm] = useState({
    phone: creator.phone || "", pan: pd0.pan || "", email: pd0.email || "", address: pd0.address || "",
    bankName: pd0.bankName || "", bankAccount: pd0.bankAccount || "", bankBranch: pd0.bankBranch || "", ifsc: pd0.ifsc || "",
    upiId: pd0.upiId || "", vendorCode: creator.payType === "vendor" ? (creator.payId || "") : "",
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);    // backend PDF generation in flight
  const required = requiredForPayType(creator.payType);
  const fields = [...INVOICE_BASE_FIELDS, ...(PAYTYPE_FIELDS[creator.payType] || [])];
  const u = (k, v) => {
    const clean = FIELD_SANITIZE[k] ? sanitizeField(FIELD_SANITIZE[k], v) : v;
    setForm(p => ({ ...p, [k]: clean }));
    setErrors(p => ({ ...p, [k]: FIELD_SANITIZE[k] ? validateField(FIELD_SANITIZE[k], clean) : null }));
  };

  const generate = async () => {
    if (busy) return;
    const errs = validateCreatorDetails(form, required);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const payId = creator.payType === "vendor" ? form.vendorCode
                : creator.payType === "net_banking" ? form.bankAccount
                : creator.payType === "upi" ? form.upiId : creator.payId;
    const updatedCr = {
      ...creator,
      phone: form.phone || null,
      payId: payId || null,
      personalDetails: {
        ...creator.personalDetails,
        pan: form.pan || null, email: form.email || null, address: form.address || null,
        bankName: form.bankName || null, bankAccount: form.bankAccount || null,
        bankBranch: form.bankBranch || null, ifsc: form.ifsc || null, upiId: form.upiId || null,
      },
    };
    const idx       = creators.findIndex(c => c._id === creator._id) + 1;
    const invoiceNo = `INV-CR-${camp.id.slice(-6).toUpperCase()}-${String(idx).padStart(2,"0")}`;
    const dated     = new Date().toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" });

    // Backend renders + persists the PDF (GridFS) so every generated invoice
    // is saved server-side; we then open the stored PDF in a new tab.
    setBusy(true);
    try {
      await InvoicePdfAPI.generate(invoiceNo, {
        campaignId: camp.id, campaignName: camp.name, brandId: camp.brandId || null,
        creator: updatedCr, dated, actor: user?.name,
      });
      setBusy(false);
      // Stamp the invoiceNo on the creator — the table's Invoice button
      // becomes "Download Invoice" and no duplicate can ever be generated.
      onUpdateCreators(creators.map(c => c._id === creator._id ? { ...updatedCr, invoiceNo } : c));
      if (!window.open(InvoicePdfAPI.url(invoiceNo), "_blank")) {
        alert("Pop-up blocked — please allow pop-ups for this site to view the invoice.");
        return;
      }
      onLogTimeline?.(`Invoice ${invoiceNo} generated for ${creator.name} (PDF saved)`);
      onClose();
      return;
    } catch {
      // Backend unreachable — fall back to the old client-side printable HTML.
      // The PDF is NOT saved, so invoiceNo is deliberately not stamped and the
      // button stays "Invoice" for a proper retry once the backend is back.
      onUpdateCreators(creators.map(c => c._id === creator._id ? updatedCr : c));
      setBusy(false);
    }
    const blob = new Blob([generateInvoiceHTML(updatedCr, camp, invoiceNo, dated)], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) {
      alert("Pop-up blocked — please allow pop-ups for this site to generate the invoice.");
      URL.revokeObjectURL(url);
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    onLogTimeline?.(`Invoice ${invoiceNo} generated for ${creator.name}`);
    onClose();
  };

  return (
    <Panel title={`Invoice Details — ${creator.name}`} width={460} maxHeight="88vh" onClose={onClose}
      sub={<>{PAYMENT_TYPES.find(p=>p.id===creator.payType)?.label||"—"} · <CreatorHandle creator={creator} style={{fontSize:9.5}}/> · {fmtINR(costOf(creator))}</>}
      footer={<Btn variant="primary" onClick={generate} disabled={busy}>{busy ? "Generating…" : "Save & Generate"}</Btn>}>
          <div style={{fontSize:10.5,color:T.sub,marginBottom:14}}>Fill in the billing details for this creator. Saved to the campaign before the invoice is generated.</div>
          <div style={{marginBottom:12}}>
            <Lbl style={{display:"block",marginBottom:4}}>Address (for invoice)</Lbl>
            <textarea value={form.address} onChange={e=>u("address",e.target.value)} rows={2}
              placeholder="Full address" style={{...INP}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {fields.map(([l,k,ph]) => (
              <div key={k}>
                <Lbl style={{display:"block",marginBottom:4}}>{l}{required.includes(k)&&<span style={{color:T.red}}> *</span>}</Lbl>
                {/* Phone is the one field in this generic loop with a fixed
                    shape (+91 and ten digits), so it gets its own control
                    rather than a placeholder asking people to type the code. */}
                {k==="phone"
                  ? <PhoneInput value={form[k]} onChange={v=>u(k,v)} style={{...INP,resize:"none",borderColor:errors[k]?T.red:undefined}}/>
                  : <input value={form[k]} onChange={e=>u(k,e.target.value)} placeholder={ph} style={{...INP,resize:"none",borderColor:errors[k]?T.red:undefined}}/>}
                {errors[k]&&<div style={{fontSize:9.5,color:T.red,marginTop:3}}>{errors[k]}</div>}
              </div>
            ))}
          </div>
    </Panel>
  );
}

// ── NICHE FIT BADGE ──────────────────────────────────────────────────────────
// How close a suggestion actually is to the brief, said out loud. Generate
// ranks rather than filters (see nicheScore), so without this the third-best
// match and a creator in an unrelated niche look identical in the table — and
// the whole complaint about Generate was that it offered unrelated people with
// nothing marking them as such.
const NICHE_FIT = {
  3: { label:"Exact match", color:T.green },
  2: { label:"Close",       color:T.accent },
  1: { label:"Related",     color:T.amber },
  0: { label:"Off-niche",   color:T.label },
};
const NicheFit = ({score}) => {
  const fit = NICHE_FIT[score] || NICHE_FIT[0];
  return <span title={`Niche fit: ${fit.label}`} style={{fontSize:8,fontWeight:600,fontFamily:"'Sora'",
    color:fit.color,border:`1px solid ${fit.color}35`,borderRadius:3,padding:"1px 5px",whiteSpace:"nowrap"}}>{fit.label}</span>;
};

// ── ROSTER SEARCH ────────────────────────────────────────────────────────────
// Typeahead over the whole creators directory, so a shortlister who already
// knows who they want can add them straight onto the roster. Generate answers
// "who fits this brief"; before this, naming someone specific meant retyping
// their entire profile into Add Creator and creating a second record of a
// creator we already hold.
function CreatorSearch({query,onQuery,hits,directory,onAdd,campNiches}){
  const [focused,setFocused]=useState(false);
  // No timer here. Each result suppresses mousedown's default, so the input
  // never loses focus to a click inside the list and blur only fires when the
  // user genuinely leaves — which should close the list at once, not 120ms
  // later. The delay was guarding against a race the preventDefault already
  // rules out, and left a timer that could outlive the component.
  const open=focused&&!!query.trim();
  return(
    <div style={{position:"relative"}}>
      <input value={query} onChange={e=>onQuery(e.target.value)}
        onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
        disabled={directory.loading||!!directory.error}
        placeholder={directory.error?"Directory unavailable":directory.loading?"Loading creators…":"Search all creators…"}
        style={{...INP,width:190,padding:"4px 9px",fontSize:10,
          opacity:(directory.loading||directory.error)?0.6:1}}/>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,zIndex:40,width:320,
          background:T.surface,border:`1px solid ${T.border}`,borderRadius:6,boxShadow:T.shadow,
          maxHeight:280,overflowY:"auto"}}>
          {hits.length===0
            ? <div style={{padding:"12px 11px",fontSize:10,color:T.label,fontStyle:"italic"}}>
                No creator in the directory matches "{query}".
              </div>
            : hits.map(inf=>(
                <button key={inf.id} onMouseDown={e=>e.preventDefault()} onClick={()=>onAdd(inf)}
                  style={{display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left",
                    padding:"7px 10px",background:"transparent",border:"none",borderBottom:`1px solid ${T.border}`,
                    cursor:"pointer",fontFamily:"'Sora'"}}
                  onMouseOver={e=>{e.currentTarget.style.background=T.hover;}}
                  onMouseOut={e=>{e.currentTarget.style.background="transparent";}}>
                  <Av init={(inf.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2)} size={20}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:10.5,fontWeight:500,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inf.name}</div>
                    <div style={{fontSize:9,color:T.label}}>
                      <CreatorHandle creator={inf} style={{fontSize:9}}/>
                      {inf.niche?` · ${inf.niche}`:""}{inf.followers?` · ${fmtNum(inf.followers)}`:""}
                    </div>
                  </div>
                  {/* Same fit signal the suggestions carry — searching by name
                      still shouldn't hide that someone is off-brief. */}
                  {campNiches.length>0&&<NicheFit score={nicheScore(campNiches,inf.niche)}/>}
                </button>
              ))}
        </div>
      )}
    </div>
  );
}

// ── CREATORS TABLE ────────────────────────────────────────────────────────────
function TabCreators({camp,role,onUpdateCreators,onLogTimeline}){
  const [creators,setCreators]=useState(camp.creators||[]);
  const [suggested,setSuggested]=useState([]);
  const [generating,setGenerating]=useState(false);
  const [genRounds,setGenRounds]=useState(camp.genRounds||0);
  const [removeTarget,setRemoveTarget]=useState(null);
  const [lockTarget,setLockTarget]=useState(null);       // creator awaiting lock confirmation
  const [showAdd,setShowAdd]=useState(false);
  const [editTarget,setEditTarget]=useState(null);       // creator being edited (see PERMS.editCreatorDetails)
  const [invoiceTarget,setInvoiceTarget]=useState(null); // creator to invoice
  const [dirQuery,setDirQuery]=useState("");             // roster search over the creators directory
  const directory=useCreatorDirectory();
  // Null when the scope hasn't been agreed — a budgetless campaign can be raised
  // without one. `capped` is the question the roster UI actually asks: is there
  // a planned count to fill, and is it full?
  const required=numReqOf(camp),flagged=genRounds>=4;
  const atCapacity=required!=null&&creators.length>=required;
  const lockedCount=creators.filter(isLocked).length;
  // Read off the LOCAL roster, not camp.creators: the tab holds edits that
  // haven't round-tripped yet, and the countdown has to move when you lock
  // someone, not one save later. null once the roster is confirmed.
  const gap=rosterGap(camp,creators);
  const cb=creatorBudgetOf(camp);
  const totalFee=creators.reduce((s,c)=>s+costOf(c),0);
  const over=totalFee>cb;
  const canEdit=["ea","cm","am","pcm","founder"].includes(role);
  const sync=next=>{setCreators(next);onUpdateCreators(next);};
  const patch=(id,obj)=>sync(creators.map(c=>c._id===id?{...c,...obj}:c));
  // Anyone already on the roster is out of both the suggestions and the search
  // results — offering to add someone twice is never the right answer.
  //
  // Keyed on `creatorId`, which IS the directory row's id (both are the backend's
  // keyOf — lower-cased handle, else name — see creatorSync.js), with
  // creatorKeyOf as the fallback for a roster entry added by hand and not yet
  // round-tripped through a save.
  //
  // This read `c.dbId`, which does not survive the trip to the database: the
  // backend splits profile fields out and hands back `creatorId`, and nothing
  // maps it to dbId on the way in (normCreator doesn't). So on any campaign
  // reopened from the DB the set came back empty — or worse, full of dead
  // `c001`-style ids left over from the hardcoded CREATOR_DB, which match
  // nothing in the real directory. It didn't show while Generate served
  // invented creators nobody had actually rostered; pointing it at the real
  // collection made it a duplicate waiting to happen.
  const taken=useMemo(
    ()=>new Set(creators.map(c=>c.creatorId||c.dbId||creatorKeyOf(c)).filter(Boolean)),
    [creators],
  );
  const available=useMemo(()=>directory.rows.filter(c=>!taken.has(c.id)),[directory.rows,taken]);
  // Ranked ONCE per roster/brief change rather than inside Generate, so each
  // round is a deeper slice of one stable ordering instead of a fresh shuffle:
  // pressing Generate again should show you the next-best creators, not the
  // same ones rearranged.
  const ranked=useMemo(()=>rankByNiche(nichesOf(camp),available),[camp.niches,camp.niche,available]);
  const generate=()=>{
    if(flagged||generating||directory.loading)return;
    setGenerating(true);
    // Ranked, never filtered to nothing. The brief's niche decides the ORDER,
    // so an exact match always leads and the closest available creators follow
    // when there is no exact match — which beats the old behaviour of
    // filtering to empty and then falling back to the unranked pool.
    // Twice the planned count, so each round leaves room to reject half. With no
    // planned count there is nothing to double, so it offers a fixed page.
    const pool=ranked.slice(0,required!=null?Math.max(required*2,4):10).map(c=>mkCreator(c,priorFeeOf(c)));
    setSuggested(pool);setGenRounds(r=>r+1);setGenerating(false);
  };
  // Roster search — the whole directory, not just what Generate surfaced.
  // Generate answers "who fits this brief"; this answers "add the specific
  // person I already have in mind", which was previously only possible by
  // retyping their whole profile into Add Creator.
  const searchHits=useMemo(()=>{
    const q=dirQuery.trim().toLowerCase();
    if(!q)return [];
    return available
      .filter(c=>[c.name,c.handle,c.niche,c.state,c.platform].filter(Boolean)
        .some(v=>String(v).toLowerCase().includes(q)))
      .slice(0,8);
  },[available,dirQuery]);
  const confirmRemove=(reason,note)=>{API.removeCreator(camp.id,removeTarget._id,reason,note);sync(creators.filter(c=>c._id!==removeTarget._id));setRemoveTarget(null);};
  // Locking commits money and cannot be taken back, so it is confirmed and
  // logged. The timeline entry matters more here than on a reversible change:
  // it is the only record of who made the commitment and at what fee.
  const confirmLock=()=>{
    // Re-checked here, not just on the dropdown: the disabled option is the
    // affordance, this is the rule. The modal can outlive the state that
    // opened it (clear the Collab type in another cell while it's up) and the
    // lock it confirms is not reversible.
    if(lockBlockedFor(lockTarget)){setLockTarget(null);return;}
    patch(lockTarget._id,{status:"locked"});
    onLogTimeline?.(`${lockTarget.name} locked at ${fmtINR(costOf(lockTarget))}`);
    setLockTarget(null);
  };
  // Fee changes on an UNLOCKED creator are ordinary shortlisting and stay
  // silent. On a locked one they are the founder override (costFrozen), and
  // they restate a commitment Billing has already booked — so they get the
  // same treatment as the lock itself: written to the timeline, naming the
  // invoice if one has already gone out against the old figure.
  const setCost=(cr,n)=>{
    const before=costOf(cr);
    if(n===before)return;
    patch(cr._id,{cost:n});
    if(isLocked(cr))
      onLogTimeline?.(`${cr.name} — locked fee re-priced ${fmtINR(before)} → ${fmtINR(n)}${cr.invoiceNo?` (invoice ${cr.invoiceNo} already generated at the old figure)`:""}`);
  };
  // The client-side twin of setCost. Silent while the campaign is still ours to
  // price; once the PO is raised the client holds this figure, so re-pricing it
  // lands on the timeline the way a locked fee does.
  const setClientCost=(cr,n)=>{
    const before=clientCostOf(cr);
    if(n===before)return;
    patch(cr._id,{clientCost:n});
    if(!beforePO(camp))
      onLogTimeline?.(`${cr.name} — client cost re-priced ${before==null?"—":fmtINR(before)} → ${n==null?"—":fmtINR(n)} after the PO was raised`);
  };
  const addFromSugg=cr=>{if(atCapacity)return;sync([...creators,cr]);setSuggested(p=>p.filter(c=>c._id!==cr._id));};
  // From the search: a directory row, not a roster entry, so it goes through
  // mkCreator the same way a suggestion does. Deliberately NOT capped at
  // `required` — Generate proposes and so respects the planned count, but
  // someone naming a creator by hand is making a decision, and blocking it
  // would leave them retyping the same person into Add Creator to get past it.
  const addFromSearch=inf=>{sync([...creators,mkCreator(inf,priorFeeOf(inf))]);setDirQuery("");};
  const thS={fontSize:9,fontWeight:600,color:T.label,textTransform:"uppercase",letterSpacing:"0.07em",padding:"8px 10px",whiteSpace:"nowrap",borderBottom:`1px solid ${T.border}`,textAlign:"left",background:T.raised};
  const tdS={padding:"8px 10px",borderBottom:`1px solid ${T.border}`,fontSize:11,color:T.sub,verticalAlign:"middle",whiteSpace:"nowrap"};
  return(<div>
    {/* Building the roster is NOT gated on the budget — shortlisting, agreeing
        fees and locking creators all go ahead without one, which is the point
        of raising a campaign this way. What changes is that there is no pool to
        measure the fees against, so the bar states the running total and says
        plainly that nothing is capping it. Drawn as "₹4L of ₹0" in red, it
        accused the team of an overspend on a budget nobody had set. */}
    {canCrFin(role)&&(budgetPending(camp)
      ? <div style={{marginBottom:18}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
            <Lbl>Creator Budget</Lbl>
            <span style={{fontSize:10.5,color:T.sub}}>{fmtINR(totalFee)} committed</span>
          </div>
          <div style={{height:2,background:T.mute,borderRadius:1}}/>
          <div style={{marginTop:4,fontSize:9.5,color:T.amber}}>
            No creator pool set — this campaign has no budget yet. Fees agreed now are committed against whatever is allocated later.
          </div>
        </div>
      : <div style={{marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><Lbl>Creator Budget</Lbl><span style={{fontSize:10.5,color:over?T.red:T.sub}}>{fmtINR(totalFee)} of {fmtINR(cb)}</span></div>
      <div style={{height:2,background:T.mute,borderRadius:1}}><div style={{height:2,borderRadius:1,background:over?T.red:T.green,width:`${cb>0?Math.min((totalFee/cb)*100,100):0}%`,transition:"width 0.3s"}}/></div>
      {/* What is left of the pool — the only number a shortlister can negotiate
          against. The "≈ ₹X per creator target" that used to sit beside it was
          the pool divided by the head count, which is not a target anyone set:
          creators are priced one at a time and a roster of equal fees is the
          exception, so the figure was wrong the moment the first deal closed. */}
      <div style={{display:"flex",justifyContent:"flex-end",marginTop:4,fontSize:9.5}}>
        <span style={{color:over?T.red:T.sub}}>{over?`${fmtINR(totalFee-cb)} over budget`:`${fmtINR(cb-totalFee)} left`}</span>
      </div>
    </div>)}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
      {/* Both scope numbers in one line: how many creators, and how many posts
          the roster owes in total (see totalDelivOf — per-creator overrides
          included, so this is the real number, not creators × plan). */}
      <div><Lbl>Creators</Lbl><span style={{fontSize:9,color:T.sub,marginLeft:8}}>
        {required!=null?`${creators.length} of ${required} required`:`${creators.length} added · no count set`} &middot; {lockedCount} locked
        {totalDelivOf(camp)!=null&&<> &middot; {totalDelivOf(camp)} deliverables</>}
      </span>{camp.sentToClient&&<span style={{fontSize:9,color:T.green,marginLeft:8}}>&middot; sent to client</span>}</div>
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        {canEdit&&<>
          <CreatorSearch query={dirQuery} onQuery={setDirQuery} hits={searchHits}
            directory={directory} onAdd={addFromSearch} campNiches={nichesOf(camp)}/>
          <Btn variant="ghost" onClick={()=>setShowAdd(true)} style={{fontSize:9.5,padding:"4px 10px"}}>+ Add Creator</Btn>
          <Btn variant="ghost" onClick={generate} disabled={flagged||generating||directory.loading}
            title={directory.error?`Creator directory unavailable — ${directory.error}`:undefined}
            style={{fontSize:9.5,padding:"4px 10px",color:flagged?T.red:(generating||directory.loading)?T.sub:T.text,borderColor:flagged?`${T.red}22`:T.border}}>
            {directory.loading?"Loading…":generating?"Generating…":flagged?`Flagged (${genRounds}×)`:"Generate"}</Btn>
        </>}
      </div>
    </div>
    {flagged&&<div style={{padding:"8px 10px",borderRadius:5,border:`1px solid ${T.red}22`,fontSize:10,color:T.red,marginBottom:12,background:T.raised}}>{genRounds}× the required count generated. Founder approval required to continue.</div>}
    {/* Generate and the search both read the directory, so a failure there
        disables both — said once, plainly, rather than leaving two controls
        that look available and do nothing. */}
    {canEdit&&directory.error&&<div style={{padding:"8px 10px",borderRadius:5,border:`1px solid ${T.amber}25`,fontSize:10,color:T.amber,marginBottom:12,background:T.raised}}>Creator directory unavailable ({directory.error}) — Generate and search are off until it loads. Add Creator still works.</div>}
    {canEdit&&!directory.loading&&!directory.error&&available.length===0&&<div style={{padding:"8px 10px",borderRadius:5,border:`1px solid ${T.border}`,fontSize:10,color:T.sub,marginBottom:12,background:T.raised}}>
      {directory.rows.length===0
        ? "No creators in the directory yet — Add Creator is the way in, and everyone added there becomes searchable here."
        : "Every creator in the directory is already on this roster — use Add Creator for someone new."}</div>}
    <div style={{overflowX:"auto",borderRadius:6,border:`1px solid ${T.border}`}}>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:1290}}>
        <thead><tr>
          {/* Client Cost is behind canFin, not canCrFin: what we pay and what
              the client pays on one row IS the margin, which seeCampaignBudget
              exists to keep with the roles that own commercials (rbac.js). */}
          {CREATOR_COLS.filter(c=>c.key!=="cost"||canCrFin(role)).filter(c=>c.key!=="clientCost"||canFin(role)).filter(c=>!["payType","payId"].includes(c.key)||canCrInv(role)).map(col=>(
            <th key={col.key} title={col.cv?undefined:"Internal only"} style={{...thS,width:col.w,minWidth:col.w}}>{col.label}</th>
          ))}
          {(canEdit||canCrInv(role))&&<th style={{...thS,width:130}}></th>}
        </tr></thead>
        <tbody>
          {creators.length===0&&<tr><td colSpan={13} style={{...tdS,textAlign:"center",color:T.label,padding:"24px"}}>No creators yet. Generate or add manually.</td></tr>}
          {creators.map((cr,i)=>{
            const stCol=CR_COLOR[cr.status]||T.sub;
            const lockBlock=lockBlockedFor(cr);
            // Only nag on rows that are still heading for a lock: a Backed Off
            // or Brand Reject creator never needs a Collab type.
            const collabDue=!!lockBlock&&!isLocked(cr)&&!CR_JOURNEY.find(j=>j.id===cr.status)?.neg;
            return(<tr key={cr._id} style={{background:i%2===0?"transparent":T.hover}}>
              <td style={{...tdS,color:T.text}}><div style={{display:"flex",alignItems:"center",gap:7}}><Av init={(cr.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2)} size={22}/><div><div style={{fontSize:11,fontWeight:500,color:T.text}}>{cr.name}</div><CreatorHandle creator={cr} style={{fontSize:9,color:T.label,display:"block"}}/></div></div></td>
              <td style={tdS}>{cr.platform}</td>
              <td style={tdS}>{fmtNum(cr.followers)}</td>
              <td style={{...tdS,color:T.text}}>{cr.avgER!=null?`${cr.avgER}%`:"—"}</td>
              <td style={tdS}>{cr.niche||"—"}</td>
              <td style={tdS}>{cr.state||"—"}</td>
              {/* Answered before the lock, so it sits before Status in the row,
                  and frozen by it exactly like Cost. The lock is the moment the
                  deal is agreed, and the collab type is part of what was
                  agreed: it decides whose handle the post goes up under, which
                  the brand has signed off and the creator has priced. Leaving
                  it editable afterwards meant the one field the lock now
                  REQUIRES could be changed — or blanked — the second after it
                  was satisfied, so the precondition guarded nothing.
                  Unset is drawn in the warning colour while the creator is
                  still lockable — it is the one field standing between them and
                  the lock, so it has to look like an open question. */}
              <td style={tdS}>{canEdit&&!isLocked(cr)
                ? <span style={{position:"relative",display:"inline-block"}}>
                    <select value={cr.collab||""} onChange={e=>patch(cr._id,{collab:e.target.value||null})}
                      title={cr.collab?"Is this a paid collaboration post?":"Required before this creator can be locked"}
                      style={{appearance:"none",WebkitAppearance:"none",cursor:"pointer",outline:"none",
                        background:"transparent",border:`1px solid ${collabDue?`${T.amber}55`:T.border}`,borderRadius:4,
                        color:cr.collab?T.text:collabDue?T.amber:T.label,fontSize:10,fontFamily:"'Sora'",padding:"3px 20px 3px 7px"}}>
                      {COLLAB_TYPES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                    <span style={{position:"absolute",right:7,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",fontSize:7,color:cr.collab?T.sub:collabDue?T.amber:T.label}}>▼</span>
                  </span>
                : <span title={canEdit&&isLocked(cr)?"Collab type is locked — it was agreed with the brand when this creator was locked. Remove them from the roster if the deal changes.":undefined}
                    style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:10,color:T.text,
                      ...(canEdit&&isLocked(cr)?{cursor:"not-allowed"}:{})}}>
                    {(cr.collab&&COLLAB_TYPES.find(c=>c.id===cr.collab)?.label)||"—"}
                    {canEdit&&isLocked(cr)&&<span style={{fontSize:9,color:T.label}}>🔒</span>}
                  </span>}</td>
              {/* Reads as an interactive control, not a label. With no border,
                  no background and appearance:none it was indistinguishable
                  from the plain text in every other cell, so nobody could tell
                  the journey stage was changeable from here.
                  Locked is a one-way door — see LockCreatorModal. Once it is
                  taken the dropdown becomes a plain pill, because there is no
                  longer a choice to offer. Locked is also DISABLED until the
                  roster answers everything the lock commits us to (lockBlock),
                  rather than being offered and then silently ignored. */}
              <td style={tdS}>{canEdit&&!isLocked(cr)
                ? <span style={{position:"relative",display:"inline-block"}}>
                    <select value={cr.status}
                      onChange={e=>e.target.value==="locked"?(!lockBlock&&setLockTarget(cr)):patch(cr._id,{status:e.target.value})}
                      title={lockBlock?`Change shortlist status — ${lockBlock.toLowerCase()}`:"Change shortlist status"}
                      style={{appearance:"none",WebkitAppearance:"none",cursor:"pointer",outline:"none",
                        fontSize:10.5,fontWeight:600,fontFamily:"'Sora'",color:stCol,
                        background:`${stCol}12`,border:`1px solid ${stCol}40`,borderRadius:20,
                        padding:"3px 22px 3px 10px"}}>
                      {CR_JOURNEY.map(s=><option key={s.id} value={s.id} disabled={s.id==="locked"&&!!lockBlock}>
                        {s.id==="locked"&&lockBlock?`${s.label} — ${lockBlock}`:s.label}
                      </option>)}
                    </select>
                    <span style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",fontSize:7,color:stCol}}>▼</span>
                  </span>
                : <span title={canEdit&&isLocked(cr)?"Locked is final — this creator's fee is committed in Billing. Remove them from the roster if the deal falls through.":undefined}
                    style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:10.5,fontWeight:600,fontFamily:"'Sora'",color:stCol,
                      ...(canEdit&&isLocked(cr)?{background:`${stCol}12`,border:`1px solid ${stCol}40`,borderRadius:20,padding:"3px 10px",cursor:"default"}:{})}}>
                    {CR_JOURNEY.find(s=>s.id===cr.status)?.label}{canEdit&&isLocked(cr)&&<span style={{fontSize:8}}>🔒</span>}
                  </span>}
                {/* Why the status is what it is, when the brand is the one who
                    set it. Without it, a row that moved to Brand Reject on its
                    own looks like somebody here did it. */}
                {!!cr.brandDecision?.decision&&cr.brandDecision.decision===BRAND_DECIDED[cr.status]&&<BrandCall d={cr.brandDecision}/>}</td>
              {/* Locking a creator is what posts their cost to Billing as a
                  committed expense. Editing it afterwards re-prices a
                  commitment the books have already recorded — and, once an
                  invoice has been generated against it, disagrees with a PDF
                  that has left the building. So it is frozen for every role
                  EXCEPT the founder (PERMS.overrideLockedCost), whose edits go
                  through setCost and land on the timeline. For everyone else
                  the only route back is Remove, which cancels the expense
                  outright — the honest trail for a deal that fell through. */}
              {canCrFin(role)&&<td style={tdS}>{canEdit&&!costFrozen(role,cr)
                ? <CostCell value={costOf(cr)} onCommit={n=>setCost(cr,n)}
                    style={{width:76,background:"transparent",border:"none",borderBottom:`1px solid ${isLocked(cr)?`${T.amber}66`:T.border}`,color:T.text,fontSize:11,fontFamily:"'Sora'",outline:"none",padding:"2px 0"}}
                    title={isLocked(cr)?`Founder override — this fee is committed in Billing${cr.invoiceNo?` and invoiced as ${cr.invoiceNo}`:""}. Changing it re-prices the expense and is logged to the timeline.`:undefined}/>
                : <span title={canEdit&&isLocked(cr)?"Cost is locked — this creator's fee is committed in Billing and locking is final. Remove them from the roster if the deal falls through.":undefined}
                    style={{color:T.text,...(canEdit&&isLocked(cr)?{cursor:"not-allowed"}:{})}}>
                    {fmtINR(costOf(cr))}{canEdit&&isLocked(cr)&&<span style={{fontSize:9,color:T.label,marginLeft:5}}>🔒</span>}
                  </span>}</td>}
              {/* What the CLIENT is billed — the only figure on this table the
                  brand sees. Unset is drawn "—" and stored null, not ₹0, so an
                  unpriced creator drops out of their breakdown rather than
                  appearing free.
                  Not frozen by the creator lock: locking commits what we PAY,
                  while this is settled on the client PO. Logged to the timeline
                  once that PO exists, since it then restates a figure they
                  hold. */}
              {canFin(role)&&<td style={tdS}>{canEdit
                ? <CostCell value={clientCostOf(cr)} onCommit={n=>setClientCost(cr,n)} blankAs={null}
                    style={{width:82,background:"transparent",border:"none",borderBottom:`1px solid ${T.border}`,color:T.text,fontSize:11,fontFamily:"'Sora'",outline:"none",padding:"2px 0"}}
                    title={beforePO(camp)?"What the client is billed for this creator — shown in their portal's budget breakdown. Leave empty until it is agreed.":"The client PO is raised — changing this restates a figure the client already has, and is logged to the timeline."}/>
                : <span style={{color:clientCostOf(cr)==null?T.label:T.text}}>{clientCostOf(cr)==null?"—":fmtINR(clientCostOf(cr))}</span>}</td>}
              {/* Carries its own caret. The app strips the native one from every
                  select (index.css), so a bordered box with a value in it was
                  indistinguishable from the plain text in the cells either side
                  — nobody could tell the pay type was theirs to choose. */}
              {canCrInv(role)&&<td style={tdS}>{canEdit
                ? <span style={{position:"relative",display:"inline-block"}}>
                    <select value={cr.payType||""} onChange={e=>patch(cr._id,{payType:e.target.value||null,payId:null})}
                      title="How this creator gets paid"
                      style={{appearance:"none",WebkitAppearance:"none",cursor:"pointer",outline:"none",
                        background:"transparent",border:`1px solid ${T.border}`,borderRadius:4,
                        color:cr.payType?T.text:T.label,fontSize:10,fontFamily:"'Sora'",padding:"3px 20px 3px 7px"}}>
                      {PAYMENT_TYPES.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                    <span style={{position:"absolute",right:7,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",fontSize:7,color:cr.payType?T.sub:T.label}}>▼</span>
                  </span>
                : <span style={{fontSize:10,color:T.text}}>{PAYMENT_TYPES.find(p=>p.id===cr.payType)?.label||"—"}</span>}</td>}
              {(canEdit||canCrInv(role))&&<td style={{...tdS,textAlign:"right"}}><div style={{display:"flex",gap:5,justifyContent:"flex-end"}}>
                {can(role,"editCreatorDetails")&&<button onClick={()=>setEditTarget(cr)} title="Edit all creator details" style={{fontSize:9,color:T.sub,background:"transparent",border:`1px solid ${T.borderMid}`,borderRadius:4,padding:"3px 8px",cursor:"pointer",fontFamily:"'Sora'"}}>Edit</button>}
                {canCrInv(role)&&(cr.invoiceNo
                  ?<button onClick={()=>window.open(InvoicePdfAPI.url(cr.invoiceNo),"_blank")} title={`Download ${cr.invoiceNo} — already generated`} style={{fontSize:9,color:T.green,background:"transparent",border:`1px solid ${T.green}30`,borderRadius:4,padding:"3px 8px",cursor:"pointer",fontFamily:"'Sora'"}}>↓ Download Invoice</button>
                  :<button onClick={()=>cr.payType&&setInvoiceTarget(cr)} disabled={!cr.payType} title={cr.payType?"Generate invoice":"Select a pay type first"} style={{fontSize:9,color:cr.payType?T.accent:T.label,background:"transparent",border:`1px solid ${cr.payType?`${T.accent}30`:T.border}`,borderRadius:4,padding:"3px 8px",cursor:cr.payType?"pointer":"not-allowed",opacity:cr.payType?1:0.5,fontFamily:"'Sora'"}}>Invoice</button>)}
                {can(role,"removeCreator")&&<button onClick={()=>setRemoveTarget(cr)} style={{fontSize:9,color:T.red,background:"transparent",border:`1px solid ${T.red}22`,borderRadius:4,padding:"3px 8px",cursor:"pointer",fontFamily:"'Sora'"}}>Remove</button>}
              </div></td>}
            </tr>);
          })}
        </tbody>
      </table>
    </div>
    {/* No "send to client" button. The roster goes to the client the moment it
        is confirmed — every required slot filled by a LOCKED creator (see
        rosterReady, applied in onUpdateCreators). Locking IS the decision; a
        separate button only added a step someone could forget, which left the
        brand looking at an empty roster while the team had finished picking.
        All this says is what's left before that happens. */}
    {canEdit&&!camp.sentToClient&&gap&&<div style={{marginTop:14}}><Hr style={{marginBottom:12}}/>
      <div style={{fontSize:9.5,color:T.label}}>{gap} — the roster goes to the client, and the client PO becomes raisable, once it's confirmed.</div>
    </div>}
    {suggested.length>0&&<div style={{marginTop:20}}><Hr style={{marginBottom:14}}/><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <Lbl>Suggested — Round {genRounds}</Lbl>
        {/* Says what the ordering was, so "why am I being shown this person"
            has an answer on the screen that showed them. */}
        <span style={{fontSize:9,color:T.label}}>{nichesOf(camp).length?`closest fit to ${nichesOf(camp).join(", ")} first`:"no brief niche set — ordered by engagement"}</span>
      </div>
      <span style={{fontSize:9,color:T.sub}}>{required!=null?`${Math.max(0,required-creators.length)} spots remaining`:"no planned count — add as many as the brief needs"}</span></div>
      <div style={{overflowX:"auto",borderRadius:6,border:`1px solid ${T.border}`}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}><thead><tr>{["Creator","Platform","Followers","Avg ER%","Niche","Fit",...(canCrFin(role)?["Prior fee"]:[]),""].map(h=><th key={h} style={{...thS}}>{h}</th>)}</tr></thead><tbody>{suggested.map((cr,i)=><tr key={cr._id} style={{opacity:atCapacity?0.35:1}}><td style={{...tdS,color:T.text}}><div style={{display:"flex",alignItems:"center",gap:7}}><Av init={(cr.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2)} size={20}/><div><div style={{fontSize:11,fontWeight:500}}>{cr.name}</div><CreatorHandle creator={cr} style={{fontSize:9,color:T.label,display:"block"}}/></div></div></td><td style={tdS}>{cr.platform}</td><td style={tdS}>{fmtNum(cr.followers)}</td><td style={{...tdS,color:T.text}}>{cr.avgER!=null?`${cr.avgER}%`:"—"}</td><td style={tdS}>{cr.niche||"—"}</td><td style={tdS}><NicheFit score={nicheScore(nichesOf(camp),cr.niche)}/></td>{canCrFin(role)&&<td style={tdS} title="What this creator was paid on another campaign — a reference, not a rate card. The fee for this campaign is negotiated on the roster.">{costOf(cr)>0?fmtINR(costOf(cr)):"—"}</td>}<td style={{...tdS,textAlign:"right"}}><div style={{display:"flex",gap:5,justifyContent:"flex-end"}}><Btn variant="ghost" onClick={()=>addFromSugg(cr)} disabled={atCapacity} style={{fontSize:9,padding:"3px 9px"}}>Add</Btn><Btn variant="subtle" onClick={()=>setSuggested(p=>p.filter(c=>c._id!==cr._id))} style={{fontSize:9,padding:"3px 9px"}}>Skip</Btn></div></td></tr>)}</tbody></table></div>
    </div>}
    {removeTarget&&<RemoveModal creator={removeTarget} onConfirm={confirmRemove} onCancel={()=>setRemoveTarget(null)}/>}
    {lockTarget&&<LockCreatorModal creator={lockTarget} onConfirm={confirmLock} onCancel={()=>setLockTarget(null)}/>}
    {showAdd&&<AddCreatorModal onAdd={cr=>sync([...creators,cr])} onClose={()=>setShowAdd(false)}/>}
    {/* Resolved from the live roster, not the captured editTarget: the modal
        can outlive the row's state, and the lock is what freezes the fee. */}
    {editTarget&&<AddCreatorModal editing={editTarget} costLocked={costFrozen(role,creators.find(c=>c._id===editTarget._id)||editTarget)}
      onAdd={cr=>sync(creators.map(c=>c._id===cr._id?cr:c))} onClose={()=>setEditTarget(null)}/>}
    {invoiceTarget && (
      <InvoiceDetailsModal camp={camp} creator={creators.find(c=>c._id===invoiceTarget._id)||invoiceTarget} creators={creators} onClose={()=>setInvoiceTarget(null)} onUpdateCreators={sync} onLogTimeline={onLogTimeline}/>
    )}
  </div>);
}

    // ── DRAFT-ON-BLUR MONEY CELL ─────────────────────────────────────────────────
    // A free-text field must not commit per keystroke. Typing "1,50,000" fired
    // six campaign PATCHes — plus six expense PATCHes for a locked creator — all
    // racing, and every intermediate value ("1", "15", "150") was briefly the
    // creator's real committed cost in Billing.
    //
    // Hold a local draft, commit on blur, re-sync when the underlying value
    // changes so switching creators never shows a stale draft.
function useDraft(value,onCommit,parse){
  const [draft,setDraft]=useState(String(value ?? ""));
  useEffect(()=>{setDraft(String(value ?? ""));},[value]);
  const commit=()=>{const n=parse(draft); if(n!==value) onCommit(n);};
  return [draft,setDraft,commit];
}

// `title` is threaded through like DelivCell's: the founder's override of a
// locked fee looks identical to an ordinary edit, so the warning about what it
// re-prices has to reach the input itself.
// `blankAs` is what an emptied field commits: 0 for the negotiated fee (a blank
// there is a typo mid-edit), null for the client cost, which has a real unset
// state that must survive being cleared.
function CostCell({value,onCommit,style,title,blankAs=0}){
  const [draft,setDraft,commit]=useDraft(value,onCommit,d=>d===""?blankAs:(parseInt(d)||0));
  return <MoneyInput value={draft} onChange={setDraft} onBlur={commit} title={title}
    onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}} style={style}/>;
}

// How many posts this creator owes. Draft-on-blur for the same reason as
// CostCell, and one more: every commit writes a timeline entry, so committing
// per keystroke would log "1 → 1", "1 → 12", "1 → 123" for one edit and bury
// the real change in noise. Clamped at 1 — a locked creator owing zero posts
// is not a scope change, it's a mistake.
function DelivCell({value,onCommit,style,title}){
  const [draft,setDraft,commit]=useDraft(value,onCommit,d=>Math.max(1,parseInt(d)||1));
  return <input type="number" min={1} value={draft} title={title}
    onChange={e=>setDraft(e.target.value)} onBlur={commit}
    onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}} style={style}/>;
}

    // ── ASSET CELL (Concept / Demo) ──────────────────────────────────────────────
    // Concept and Demo were duplicated blocks differing only by label and patcher.
    //
    // The file link is present at EVERY status — the link IS the deliverable, so
    // hiding it unless the status was Received/Rework left an approved asset with
    // nowhere to record where it lives. Draft-on-blur for the same reason as the
    // money cell above.
function AssetCell({label,asset,canEdit,onPatch,style={}}){
  const [draft,setDraft]=useState(asset.fileLink||"");
  // Re-sync when the campaign or creator underneath changes, so the box never
  // shows a stale draft from a previously selected row.
  useEffect(()=>{setDraft(asset.fileLink||"");},[asset.fileLink]);
  const commit=()=>{
    const v=draft.trim();
    if(v!==(asset.fileLink||"")) onPatch({fileLink:v||null});
  };
  const stS=st=>({fontSize:10,color:ASSET_COLOR[st]||T.sub,fontWeight:500,padding:"2px 6px",background:`${ASSET_COLOR[st]||T.sub}12`,borderRadius:3});
  return(<div style={{padding:"12px 14px",...style}}>
    <Lbl style={{display:"block",marginBottom:8}}>{label}</Lbl>
    {canEdit
      ? <select value={asset.status} onChange={e=>onPatch({status:e.target.value})} style={{background:"transparent",border:`1px solid ${T.border}`,color:ASSET_COLOR[asset.status]||T.sub,fontSize:10,fontFamily:"'Sora'",outline:"none",borderRadius:4,padding:"3px 6px",width:"100%",marginBottom:8}}>{ASSET_STATUSES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select>
      : <span style={stS(asset.status)}>{ASSET_STATUSES.find(s=>s.id===asset.status)?.label}</span>}
    {canEdit&&<input value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}}
      placeholder="Attach file link…" style={{...INP,fontSize:10,padding:"5px 8px",resize:"none"}}/>}
    {asset.fileLink
      ? <a href={extUrl(asset.fileLink)} target="_blank" rel="noreferrer" style={{fontSize:9,color:T.accent,display:"block",marginTop:4}}>Open file →</a>
      : <div style={{fontSize:9,color:T.label,marginTop:4,fontStyle:"italic"}}>No link attached</div>}
  </div>);
}

// ── LIVE POST LINKS ──────────────────────────────────────────────────────────
// One row per post the creator has put up. A creator on a multi-post brief had
// a single URL field, so only the first post was ever recorded — and only the
// first was ever tracked, which quietly under-reported the campaign's real
// reach on every brief asking for more than one deliverable.
//
// Same draft-on-blur discipline as AssetCell and CostCell: the array is
// rewritten on blur, not per keystroke, so typing one URL doesn't fire a
// campaign PATCH per character.
function LiveLinks({links,platform,canEdit,onChange}){
  // A trailing blank row is what makes "add another" work without a button
  // while editing; it is never persisted, because withLiveLinks drops empties.
  const [draft,setDraft]=useState(links);
  useEffect(()=>{setDraft(links);},[links.join("|")]);
  const rows=canEdit?[...draft,""]:draft;
  const commit=next=>{const clean=next.filter(Boolean); if(clean.join("|")!==links.join("|")) onChange(clean);};
  const setAt=(i,v)=>setDraft(d=>{const n=[...d];n[i]=v;return n;});
  const label=platform==="YouTube"?"YouTube video":"Instagram post";
  return(<div style={{display:"flex",flexDirection:"column",gap:5}}>
    {rows.map((u,i)=>{
      const bad=!!u&&!livePostUrlOk(u,platform);
      return(<div key={i}>
        {canEdit
          ? <div style={{display:"flex",gap:4,alignItems:"center"}}>
              <input value={u} onChange={e=>setAt(i,e.target.value)} onBlur={()=>commit(draft)}
                onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}}
                placeholder={i===0?`${label} URL…`:`${label} URL (${i+1})`}
                style={{...INP,fontSize:10,padding:"5px 8px",resize:"none",flex:1,borderColor:bad?T.red:T.border}}/>
              {u&&<button onClick={()=>{const n=draft.filter((_,j)=>j!==i);setDraft(n);commit(n);}}
                title="Remove this link" style={{fontSize:11,lineHeight:1,color:T.label,background:"transparent",border:"none",cursor:"pointer",padding:"0 2px"}}>✕</button>}
            </div>
          : u&&<a href={extUrl(u)} target="_blank" rel="noreferrer" style={{fontSize:9.5,color:T.accent}}>Post {i+1} →</a>}
        {bad&&<div style={{fontSize:9,color:T.red,marginTop:2}}>Only {platform==="YouTube"?"YouTube":"Instagram"} URLs are supported.</div>}
        {canEdit&&!!u&&!bad&&<a href={extUrl(u)} target="_blank" rel="noreferrer" style={{fontSize:9,color:T.accent,display:"block",marginTop:2}}>Open post {i+1} →</a>}
      </div>);
    })}
  </div>);
}

// ── DELIVERABLES TAB ─────────────────────────────────────────────────────────
// ── CLIENT REVIEW THREAD ─────────────────────────────────────────────────────
// What the client said about one asset — concept or demo — and what we said
// back.
//
// The brand reviews it from their portal and writes their notes there; they
// land on creators[].<asset>.comments, which is what this renders. Replies post
// to the append endpoint rather than through the campaign PATCH — that rewrites
// creators[] wholesale and would drop any note the brand left while this page
// was open.
//
// Only mounted once there is something to read: the review is the client's to
// open, and empty threads on every locked creator are noise on a dense tab.
function AssetThread({campaignId,creator,asset,label,comments,canEdit,author,onThread}){
  const [open,setOpen]=useState(false);
  const [draft,setDraft]=useState("");
  const [sending,setSending]=useState(false);
  const [err,setErr]=useState(null);
  if(!comments.length) return null;

  const last=comments[comments.length-1];
  const fromClient=comments.filter(c=>c.role==="client").length;
  const send=async()=>{
    const text=draft.trim();
    if(!text||sending) return;
    setSending(true);setErr(null);
    try{
      const res=await CampaignsAPI.replyToAsset(campaignId,creator._id,asset,{text,author});
      onThread(creator._id,asset,res.comments);
      setDraft("");
    }catch(e){setErr(e.message||"Could not send that reply.");}
    finally{setSending(false);}
  };

  return(<div style={{borderTop:`1px solid ${T.border}`,padding:"9px 14px"}}>
    <div onClick={()=>setOpen(!open)} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
      <Lbl style={{color:T.amber,whiteSpace:"nowrap"}}>Client review · {label}</Lbl>
      <span style={{fontSize:9.5,color:T.sub,whiteSpace:"nowrap"}}>
        {fromClient} note{fromClient!==1?"s":""} from the brand
      </span>
      {/* The latest line, collapsed — enough to tell whether it needs opening. */}
      {!open&&<span style={{fontSize:9.5,color:T.label,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
        “{last.body}”
      </span>}
      <span style={{fontSize:9,color:T.accent,marginLeft:"auto"}}>{open?"Hide ▴":"Open ▾"}</span>
    </div>

    {open&&<div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
      {comments.map(c=>{
        const client=c.role==="client";
        return(<div key={c.id} style={{alignSelf:client?"flex-start":"flex-end",maxWidth:"78%"}}>
          <div style={{fontSize:8.5,color:T.label,marginBottom:3}}>
            {c.author||(client?"Client":"5th Avenue")}{c.at?` · ${prettyDateTime(c.at)}`:""}
          </div>
          <div style={{fontSize:10.5,lineHeight:1.5,color:T.text,whiteSpace:"pre-wrap",padding:"7px 10px",borderRadius:6,
            background:client?`${T.amber}12`:T.raised,border:`1px solid ${client?`${T.amber}25`:T.border}`}}>
            {c.body}
          </div>
        </div>);
      })}

      {canEdit&&<div style={{marginTop:2}}>
        {err&&<div style={{fontSize:9.5,color:T.red,marginBottom:4}}>{err}</div>}
        <textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={2}
          onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)){e.preventDefault();send();}}}
          placeholder={`Reply to the client about the ${label.toLowerCase()}…`} style={{...INP,fontSize:10,padding:"6px 8px",resize:"vertical",width:"100%"}}/>
        <div style={{display:"flex",justifyContent:"flex-end",marginTop:5}}>
          <button onClick={send} disabled={!draft.trim()||sending}
            style={{fontSize:9,color:T.accent,background:"transparent",border:`1px solid ${T.accent}25`,borderRadius:3,
              padding:"3px 9px",fontFamily:"'Sora'",cursor:draft.trim()&&!sending?"pointer":"not-allowed",opacity:draft.trim()&&!sending?1:0.45}}>
            {sending?"Sending…":"Send reply"}
          </button>
        </div>
      </div>}
    </div>}
  </div>);
}

function TabDeliverables({camp,role,currentUser,onUpdateCreators,onLogTimeline}){
  // `creators` stays the FULL list so edits below splice back into the real
  // array; `rows` is what actually renders. Filtering the state itself would
  // drop every non-locked creator on the first save.
  const [creators,setCreators]=useState(camp.creators||[]);
  const rows=creators.filter(isLocked);
  const [fetching,setFetching]=useState({});
  const canEdit=["ea","cm","am","pcm","founder"].includes(role);
  const sync=next=>{setCreators(next);onUpdateCreators(next);};
  const pCr=(id,obj)=>sync(creators.map(c=>c._id===id?{...c,...obj}:c));
  const pCon=(id,obj)=>pCr(id,{concept:{...(creators.find(c=>c._id===id)?.concept||{}),...obj}});
  const pDem=(id,obj)=>pCr(id,{demo:{...(creators.find(c=>c._id===id)?.demo||{}),...obj}});
  const pLiv=(id,obj)=>pCr(id,{live:{...(creators.find(c=>c._id===id)?.live||{}),...obj}});
  /* setCreators, NOT sync: the thread is already persisted by the append
     endpoint, and routing it through onUpdateCreators would fire a campaign
     PATCH that rewrites creators[] from this tab's copy — the exact overwrite
     the endpoint exists to avoid. */
  const setThread=(id,asset,comments)=>setCreators(cs=>cs.map(c=>
    c._id===id?{...c,[asset]:{...(c[asset]||{}),comments}}:c));
  const pTrk=(id,obj)=>pCr(id,{tracking:{...(creators.find(c=>c._id===id)?.tracking||{}),...obj}});
  // Scope changes are audited. Cost is frozen once a creator is locked because
  // the fee is committed in Billing — but the number of posts that fee buys
  // stayed editable, so re-scoping a locked creator silently re-priced the deal
  // and left no trace anywhere. Freezing it too would be worse (unlocking to
  // re-scope cancels the expense), so it stays editable and gets logged, the
  // same way stage changes and end-date extensions already are.
  const setDeliv=(cr,n)=>{
    const before=delivTargetOf(camp,cr);
    if(n===before)return;
    pCr(cr._id,{numDeliverables:n});
    onLogTimeline?.(`${cr.name} — deliverables ${before} → ${n}${isLocked(cr)?" (creator already locked)":""}`);
  };
  const [fetchErrs,setFetchErrs]=useState({});
  // One creator can owe several posts, so Refresh fetches every link they have
  // up and reports the SUM — the creator's total contribution to the campaign,
  // which is what the aggregates and CPV are measuring.
  //
  // Links are fetched together but reduced tolerantly: one dead link (post
  // deleted, made private, rate-limited) must not throw away the numbers from
  // the ones that worked. A partial result is reported with a note saying how
  // many links it covers, rather than the whole creator failing.
  const refresh=async(id,urls,platform)=>{
    setFetching(f=>({...f,[id]:true}));setFetchErrs(e=>({...e,[id]:null}));
    const results=await Promise.all(urls.map(u=>PostMetricsAPI.fetch(extUrl(u),platform).catch(e=>({__err:e.body?.error||"Fetch failed"}))));
    const ok=results.filter(r=>!r.__err);
    if(ok.length){
      // null means "this platform doesn't expose it" (YouTube has no forward
      // count) — summing as 0 would report a real zero. Stays null unless at
      // least one link actually returned a number.
      const sum=k=>ok.some(m=>m[k]!=null)?ok.reduce((s,m)=>s+(m[k]||0),0):null;
      pTrk(id,{views:sum("views"),likes:sum("likes"),comments:sum("comments"),forwards:sum("forwards"),
        postsCounted:ok.length,lastFetched:new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})});
    }
    const failed=results.length-ok.length;
    setFetchErrs(errs=>({...errs,[id]:failed
      ? `${failed} of ${results.length} link${results.length!==1?"s":""} couldn't be read${ok.length?" — totals cover the rest":""}.`
      : null}));
    setFetching(f=>({...f,[id]:false}));
  };
  // Aggregates
  const wd=rows.filter(c=>c.tracking?.views!=null);
  const totV=wd.reduce((s,c)=>s+(c.tracking.views||0),0);
  const totL=wd.reduce((s,c)=>s+(c.tracking.likes||0),0);
  const totC=wd.reduce((s,c)=>s+(c.tracking.comments||0),0);
      // Forwards are an AVERAGE PER POST, not a campaign total. A total tracks how
      // many creators are live rather than how shareable the content is, so it
      // climbed all through execution and couldn't be compared across campaigns.
      //
      // Denominator counts only posts on platforms that report forwards —
      // YouTube returns null, and folding those in would halve a mixed roster's
      // average for no reason. `||1` covers rows tracked before postsCounted.
  const fw=wd.filter(c=>c.tracking.forwards!=null);
  const totF=fw.reduce((s,c)=>s+c.tracking.forwards,0);
  const fwPosts=fw.reduce((s,c)=>s+(c.tracking.postsCounted||1),0);
  const avgF=fwPosts>0?totF/fwPosts:null;
      // OVERALL CPV — cost per view across every post that has reported back.
      //
      // Cost is summed over `wd` (creators WITH view data), not `rows` (every
      // locked creator). Summing over `rows` charged the fees of creators who
      // hadn't posted against views only the posted ones produced: three deep with
      // one live, CPV read ~3x and FELL as the others went up, so the number moved
      // most when nothing about the media buy had changed.
      //
      //   Overall CPV  → creator cost / views
      //   External CPV → campaign budget / views
  const totCost=wd.reduce((s,c)=>s+costOf(c),0);
  // Cost per view runs to five decimals. At agency scale the numerator is
  // lakhs and the denominator is millions, so two decimals rounded almost
  // every campaign to the same ₹0.02–₹0.05 band and the metric couldn't
  // separate a good buy from a bad one. The precision is the whole point of
  // the number.
  const cpv=totV>0?(totCost/totV):null;
  // ER counts reactions the audience left ON the post — likes and comments.
  // Forwards are shares OFF-platform: they measure distribution, not
  // engagement, and they're already reported on their own card below. Adding
  // them in double-counted reach and made Instagram creators (the only ones
  // with a forward count — YouTube returns null) look systematically more
  // engaged than YouTube ones for the same real performance.
  const campaignBudget = Number(camp?.budget) || 0;
const externalCpv = totV > 0 && campaignBudget > 0
  ? campaignBudget / totV
  : null;
  const er=totV>0?(((totL+totC)/totV)*100):null;
  const agg=[
    {l:"Total Views",v:fmtNum(totV||null),show:true},
    {l:"Total Likes",v:fmtNum(totL||null),show:true},
    // The two rate tiles on a strip of raw totals, and the only ones where
    // lower is better — so they carry T.green, the same hue the client portal
    // gives CPV. fmtCPV, not toFixed(5): five decimals is a number you count
    // zeros in, and the portal prints the same figure to two significant
    // digits, so a hardcoded precision here is how the two screens start
    // disagreeing about what a view cost.
    {l:"Overall CPV",v:fmtCPV(cpv),c:T.green,show:canCrFin(role)},
    {l:"External CPV",v:fmtCPV(externalCpv),c:T.green,show:canFin(role)},  // campaign-wide creator fees ÷ views, over the same set of creators
    {l:"Avg ER",v:er!=null?`${er.toFixed(1)}%`:"—",show:true},
    {l:"Avg Forwards",v:avgF!=null?fmtNum(Math.round(avgF)):"—",show:true},
  ].filter(s=>s.show);
  return(<div>
    {wd.length>0&&<div style={{marginBottom:20}}>
      <div style={{display:"grid",gridTemplateColumns:`repeat(${agg.length},1fr)`,gap:8,marginBottom:6}}>
        {agg.map(s=><div key={s.l} style={{padding:"12px 14px",background:T.raised,borderRadius:7,border:`1px solid ${T.border}`}}><div style={{fontSize:8.5,color:T.label,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600}}>{s.l}</div><div style={{fontSize:18,fontWeight:600,color:s.c||T.text,lineHeight:1}}>{s.v}</div></div>)}
      </div>
      {wd.length<rows.length&&<div style={{fontSize:9,color:T.label}}>Based on {wd.length} of {rows.length} creator{rows.length!==1?"s":""} with live data.</div>}
    </div>}
    {rows.length===0&&<div style={{padding:"20px 0",color:T.label,fontSize:11,textAlign:"center"}}>
      {creators.length===0
        ? "No creators yet."
        : `No locked creators yet — ${creators.length} shortlisted. Lock a creator on the Creators tab to start tracking deliverables.`}
    </div>}
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {rows.map(cr=>{
        const con=cr.concept||{status:"yet_to_receive",fileLink:null};
        const dem=cr.demo||{status:"yet_to_receive",fileLink:null};
        const liv=cr.live||{postUrls:[],postedDate:null};
        const links=liveLinksOf(cr);
        // Only well-formed links for this platform can be fetched — a typo'd
        // URL would just 502 the whole creator's refresh.
        const trackable=links.filter(u=>livePostUrlOk(u,cr.platform));
        const target=delivTargetOf(camp,cr);
        // Confirmed posts — links whose metrics have actually come back. This
        // is what "n / N posted" counts, and what marks the creator live.
        const posted=delivDoneOf(camp,cr);
        const trk=cr.tracking||{};
        const isFetch=!!fetching[cr._id];
        return(<div key={cr._id} style={{background:T.raised,borderRadius:8,border:`1px solid ${T.border}`,overflow:"hidden"}}>
          <div style={{padding:"11px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:10}}>
            <Av init={(cr.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2)} size={26}/>
            <div style={{flex:1}}><div style={{fontSize:12,fontWeight:500,color:T.text}}>{cr.name} <CreatorHandle creator={cr} style={{fontSize:9.5}} fallback=""/></div><div style={{fontSize:9.5,color:T.sub}}>{cr.platform}{cr.followers?` · ${fmtNum(cr.followers)}`:""}{ cr.avgER!=null?` · ${cr.avgER}% ER`:""}</div></div>
            {/* The deliverable count used to sit here, immediately left of this
                status pill — so an editable field rendered next to the word
                "Locked" and read as though the two were related. They aren't:
                "Locked" is the creator's journey status, not a frozen row. It
                now lives in the Live cell as the denominator of "n/N posted",
                which is the only place the number means anything. */}
            <span style={{fontSize:9.5,color:CR_COLOR[cr.status]||T.sub,fontWeight:500}}>{CR_JOURNEY.find(s=>s.id===cr.status)?.label||cr.status}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr"}}>
            <AssetCell label="Concept"    asset={con} canEdit={canEdit} onPatch={o=>pCon(cr._id,o)} style={{borderRight:`1px solid ${T.border}`}}/>
            <AssetCell label="Demo Video" asset={dem} canEdit={canEdit} onPatch={o=>pDem(cr._id,o)} style={{borderRight:`1px solid ${T.border}`}}/>
            {/* Live — unlocked once the demo video is received; URLs must match
                the creator's platform. One row per deliverable this creator
                owes (see LiveLinks). */}
            <div style={{padding:"12px 14px",borderRight:`1px solid ${T.border}`}}>
              {/* "posted" reads n / N, and N is the editable target — so the
                  field is visibly the thing the count is measured against
                  rather than a loose property of the creator. */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:6}}>
                <Lbl>Live</Lbl>
                {/* Counts CONFIRMED posts, not pasted links — see delivDoneOf.
                    The gap between the two is called out under the field, so
                    "0 / 1" next to a link that is visibly there reads as
                    "not verified yet" rather than as a bug. */}
                {/* Green off creatorLive — the same rule execStats counts the
                    Live milestone by, rather than a third hand-rolled
                    comparison that could drift from it. */}
                <span style={{display:"flex",alignItems:"center",gap:3,fontSize:8.5,color:creatorLive(camp,cr)?T.green:T.label,whiteSpace:"nowrap"}}>
                  {posted} /
                  {canEdit
                    ? <DelivCell value={target} onCommit={n=>setDeliv(cr,n)}
                        title="How many posts this creator owes on this campaign — changes are logged to the timeline"
                        style={{width:34,background:"transparent",border:`1px solid ${T.border}`,borderRadius:4,color:T.text,fontSize:9.5,fontFamily:"'Sora'",outline:"none",padding:"1px 3px",textAlign:"center"}}/>
                    : target}
                  posted
                </span>
              </div>
              {!demoReceived(dem.status)?<div style={{fontSize:10.5,color:T.label,fontStyle:"italic"}}>Unlocks once the demo video is received.</div>:<>
              <LiveLinks links={links} platform={cr.platform} canEdit={canEdit}
                onChange={urls=>pCr(cr._id,{live:withLiveLinks(cr.live,urls),
                  // Editing or removing a link invalidates the proof — the
                  // metrics on file were fetched against URLs that are no
                  // longer the ones on the row, so the confirmed count has to
                  // be earned again. APPENDING is the exception: the links
                  // already verified are untouched, and dropping their proof
                  // would punish a creator for posting a second time.
                  ...(links.every((u,i)=>urls[i]===u) ? {} : {tracking:{...trk,postsCounted:0}})})}/>
              {/* A link on its own doesn't count. Said here, next to the links,
                  because this is where the gap between "I pasted it" and "it
                  counts" is actually visible — the alternative is a count that
                  silently disagrees with what's on screen. */}
              {links.length>posted&&<div style={{fontSize:9.5,color:T.amber,marginTop:6,lineHeight:1.45}}>
                {links.length-posted} link{links.length-posted!==1?"s":""} not confirmed yet — {trackable.length>posted
                  ? "hit Refresh to pull its metrics; the post counts once they come back."
                  : "the URL has to be a valid " + (cr.platform==="YouTube"?"YouTube":"Instagram") + " post link before it can be checked."}
              </div>}
              {links.length>0
                ? (canEdit
                    ? <DateInput value={liv.postedDate||""} onChange={v=>pLiv(cr._id,{postedDate:v})} max={today()} placeholder="First posted date" style={{...INP,fontSize:10,padding:"5px 8px",marginTop:6}}/>
                    : liv.postedDate&&<div style={{fontSize:9.5,color:T.sub,marginTop:6}}>Posted: {prettyDate(liv.postedDate)}</div>)
                : !canEdit&&<div style={{fontSize:11,color:T.label,fontStyle:"italic"}}>Not posted</div>}
              </>}
            </div>
            {/* Tracking */}
            <div style={{padding:"12px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <Lbl>Tracking</Lbl>
                {trackable.length>0&&<button onClick={()=>refresh(cr._id,trackable,cr.platform)} disabled={isFetch} style={{fontSize:8.5,color:T.accent,background:"transparent",border:`1px solid ${T.accent}25`,borderRadius:3,padding:"2px 6px",cursor:isFetch?"not-allowed":"pointer",fontFamily:"'Sora'",opacity:isFetch?0.5:1}}>{isFetch?"…":"↻ Refresh"}</button>}
              </div>
              {links.length===0&&<div style={{fontSize:9.5,color:T.label,fontStyle:"italic"}}>Post URL required</div>}
              {links.length>0&&<>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>{[["Views",trk.views],["Likes",trk.likes],["Comments",trk.comments],["Forwards",trk.forwards]].map(([l,v])=><div key={l}><div style={{fontSize:8,color:T.label,marginBottom:1}}>{l}</div><div style={{fontSize:14,fontWeight:600,color:v!=null?T.text:T.mute}}>{fmtNum(v)}</div></div>)}</div>
                {/* Says what the totals actually cover, so a creator whose
                    second post hasn't been fetched yet doesn't read as one
                    whose second post underperformed. */}
                {trk.postsCounted>1&&<div style={{fontSize:8,color:T.label,marginBottom:4}}>Summed across {trk.postsCounted} posts</div>}
                {fetchErrs[cr._id]&&<div style={{fontSize:9,color:T.red,marginBottom:4}}>{fetchErrs[cr._id]}</div>}
                {!trk.views&&!isFetch&&!fetchErrs[cr._id]&&<div style={{fontSize:9.5,color:T.label,fontStyle:"italic"}}>No data — click Refresh</div>}
                {trk.lastFetched&&<div style={{fontSize:8,color:T.label,marginTop:5}}>Last fetched: {trk.lastFetched}</div>}
              </>}
            </div>
          </div>
          {/* Full width under the four cells: a conversation in a 25% column is
              unreadable, and this is the one thing on the row the client wrote.
              One per reviewable asset; each hides itself until it has notes. */}
          {[["concept","Concept",con],["demo","Demo video",dem]].map(([key,label,a])=>
            <AssetThread key={key} campaignId={camp.id} creator={cr} asset={key} label={label}
              comments={a.comments||[]} canEdit={canEdit} author={currentUser?.name} onThread={setThread}/>)}
        </div>);
      })}
    </div>
  </div>);
}

// ── BRIEF TAB ────────────────────────────────────────────────────────────────
function TabBrief({camp,role,currentUser,onSaveBrief,onSaveCampaign,onAction,onGoTab,onAllocate,onLogTimeline}){
  const [locking,setLocking]=useState(false);
  // One field is editable at a time. `edit` holds the field key being edited
  // and `draft` its working value — editing the whole brief at once made it
  // unclear what a Save was about to write.
  const [edit,setEdit]=useState(null);
  const [draft,setDraft]=useState(null);
  // Editing is open to founder/PCM AND to whoever created the campaign, up to
  // the PO — that's the point the numbers are committed to the client, after
  // which an edit here would silently desync the PO. Including the creator
  // matters because an AM or CM can raise a campaign, and locking them out of
  // their own brief means the two people who own commercials have to retype it.
  const isCreator=!!currentUser?.teamId&&camp.createdBy===currentUser.teamId;
  // The brief text freezes the moment the brief is LOCKED, not at the PO: the
  // lock is what the client is quoted from, and an edit after it desyncs the
  // quote. This is the first node of both tracks now, so it is also the
  // earliest freeze in the campaign.
  const canEditBrief=(["founder","pcm"].includes(role)||isCreator)&&!briefLocked(camp);
  // The commercial numbers — scope, total budget, dates — stay editable longer
  // than the brief text: right up to the client PO, once they've authorised
  // the spend and the invoice exists.
  //
  // `numReq` is what the roster gate measures against, so a team that planned
  // five, locked four and settled on four has to be able to say so or the PO
  // gate is a trap. Budget is what the PO modal and the invoice are both
  // raised from, so it has to be right AT the PO, not before it. Dates move
  // for real reasons all the way through.
  const canEditCommercials=(["founder","pcm"].includes(role)||isCreator)&&beforePO(camp);
  // Locking stays with the two roles that own commercials, regardless of who
  // wrote the brief — it's the act that commits the numbers — and it only
  // unlocks once the brief is actually filled in (briefGaps).
  const canLock=["founder","pcm"].includes(role)&&!briefLocked(camp);
  const gaps=briefGaps(camp);

  const open  = (key,value) => { setEdit(key); setDraft(value); };
  const cancel= () => { setEdit(null); setDraft(null); };
  // Brief text fields all patch brief{}; creatorBudget and the deliverables
  // plan live on the campaign itself, so they take the other setter.
  const commit= (key) => {
    if(key==="creatorBudget"){
      const n=parseInt(draft)||0;
      if(n>(camp.budget||0)) return;              // guarded by the button too
      if(n!==creatorBudgetOf(camp)) onSaveCampaign({creatorBudget:n});
    } else if(key==="scope"){
      // Two numbers, one save — they're quoted to the client together, and
      // saving them separately would put the campaign through a moment where
      // the roster gate reads a count nobody chose.
      //
      // Blank or 0 in the creator count stores NULL, not 1: the field has to be
      // able to say "not agreed yet" as well as answer it, or a campaign raised
      // without a scope could never be left without one after the first edit.
      // The per-creator plan has no such state — see perCreatorDelivOf.
      const numReq=parseInt(draft?.numReq)>0?parseInt(draft.numReq):null;
      const perDeliv=Math.max(1,parseInt(draft?.perDeliv)||1);
      const patch={};
      if(numReq!==numReqOf(camp)) patch.numReq=numReq;
      if(perDeliv!==perCreatorDelivOf(camp)) patch.deliverablesPerCreator=perDeliv;
      if(Object.keys(patch).length) onSaveCampaign(patch);
    } else if(key==="budget"){
      const n=parseInt(draft)||0;
      // `|| 0` because creatorBudgetOf is null on a campaign with no budget —
      // `n < null` is false for every n, so without it a blank total would
      // save as 0 and read as "agreed at nothing" ever after.
      if(n<=0||n<(creatorBudgetOf(camp)||0)) return;   // guarded by the button too
      // `brief.budget` is the FORMATTED string the client portal renders in the
      // brief. It was written once at creation and never again, so it went
      // stale the moment anyone touched the budget. Kept in step here rather
      // than re-derived, because the portal reads the brief as authored.
      if(n!==(camp.budget||0)){
        const patch={budget:n,brief:{...camp.brief,budget:fmtINR(n)}};
        // The rate is read against the base, so moving the total moves the
        // base. The fee AMOUNT is what the client is invoiced, so it holds and
        // the rate is refreshed to keep describing it.
        const fee=agencyFeeOf(camp);
        if(fee>0){
          const base=Math.max(0,n-fee);
          patch.agencyFeePct=base>0?Math.round((fee/base)*1000)/10:0;
        }
        onSaveCampaign(patch);
      }
    } else if(key==="agencyFee"){
      // A % of the BASE, so re-pricing leaves the campaign underneath alone and
      // moves the total the client pays (see baseBudgetOf).
      const base=baseBudgetOf(camp)||0;
      const pct=clampPct(draft);
      const fee=resolveAgencyFee(draft,base);
      const before=agencyFeeOf(camp);
      if(fee===before){cancel();return;}
      const budget=base+fee;
      onSaveCampaign({agencyFee:fee,agencyFeePct:pct,budget,brief:{...camp.brief,budget:fmtINR(budget)}});
      // Always logged: a founder override of a figure the client has been
      // quoted, same treatment as re-pricing a locked creator fee.
      onLogTimeline?.(`Agency fee ${before>0?`re-priced ${fmtINR(before)} → ${fmtINR(fee)}`:`set at ${fmtINR(fee)}`} (${pct}% of ${fmtINR(base)}) — client total now ${fmtINR(budget)}${beforePO(camp)?"":", after the PO was raised"}`);
    } else if(key==="timeline"){
      // Edits `start`/`end` — the real fields the header, the end-date nudge,
      // the overdue check and the portal all read. `brief.timeline` is only the
      // display string, and it was never even set at creation (the wizard wrote
      // `f.timeline`, which doesn't exist — it collects timelineStart/End), so
      // every campaign's Brief tab showed "—" here. Derived and stored together
      // in one save, so the two can't disagree.
      const start=draft?.start||"",end=draft?.end||"";
      if(!start||!end||end<start) return;          // guarded by the button too
      if(start===camp.start&&end===camp.end) return;
      onSaveCampaign({start,end,brief:{...camp.brief,timeline:timelineLabel(start,end)}});
    } else if(draft!==(camp.brief[key]??(key==="deliverables"?[]:""))){
      onSaveBrief({[key]:draft});
    }
    cancel();
  };

  // Row shell: label + its own Edit control, and Save/Cancel only while open.
  // Called as a function, NOT rendered as <Field/> — a component declared
  // inside render gets a fresh identity every pass, which makes React remount
  // the subtree and drop focus out of the textarea on every keystroke.
  const field = ({fieldKey,label,value,render,children,invalid,editable=canEditBrief}) => {
    const on = edit===fieldKey;
    return(<div style={{padding:"12px 0"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
        <Lbl>{label}</Lbl>
        {/* Gated on `edit`, not on `on`: while any field is open the other
            Edit controls disappear, so a half-typed draft can't be silently
            discarded by clicking Edit on a different row. */}
        {editable&&!edit&&<button onClick={()=>open(fieldKey,value)} style={{fontSize:9,color:T.accent,background:"none",border:"none",cursor:"pointer",fontFamily:"'Sora'"}}>Edit</button>}
      </div>
      {on
        ? <>{children}<div style={{display:"flex",gap:8,marginTop:8}}>
            <Btn variant="primary" onClick={()=>commit(fieldKey)} disabled={invalid}>Save</Btn>
            <Btn variant="ghost" onClick={cancel}>Cancel</Btn>
          </div></>
        : render}
    </div>);
  };
  const txt = v => <div style={{fontSize:12,color:v?T.text:T.label,lineHeight:1.6,fontStyle:v?"normal":"italic"}}>{v||"Not specified"}</div>;
  const area = <textarea value={draft||""} onChange={e=>setDraft(e.target.value)} style={{...INP,minHeight:60}}/>;

  // Draft validity for the two money rows. Same draft, two directions: the
  // creator budget can't rise above the total, the total can't fall below it.
  const mNum=parseInt(draft)||0;
  const cbOver =edit==="creatorBudget"&&mNum>(camp.budget||0);
  // The total covers the creator pool AND the fee on top of it. Checking only
  // the pool let a total be saved that the fee alone overdrew.
  // Agency-fee draft. The base doesn't move while it is edited, so the preview
  // can state the new total before the founder commits.
  const afBase=baseBudgetOf(camp)||0;
  const afNew=edit==="agencyFee"?resolveAgencyFee(draft,afBase):0;
  const tbFloor=(creatorBudgetOf(camp)||0)+agencyFeeOf(camp);
  const tbUnder=edit==="budget"&&mNum<tbFloor;
  // Both dates required, and in order. Checked here so the Save button and the
  // commit guard read the same condition.
  const tlBad=edit==="timeline"&&(!draft?.start||!draft?.end||draft.end<draft.start);

  return(<div>
    {field({fieldKey:"objective",label:"Objective",value:camp.brief.objective||"",render:txt(camp.brief.objective),children:area})}<Hr/>
    {field({fieldKey:"audience",label:"Audience",value:camp.brief.audience||"",render:txt(camp.brief.audience),children:area})}<Hr/>
    {field({fieldKey:"messages",label:"Key Messages",value:camp.brief.messages||"",children:area,
      render:<div style={{fontSize:12,color:camp.brief.messages?T.text:T.label,lineHeight:1.6,fontStyle:camp.brief.messages?"normal":"italic"}}>{camp.brief.messages||"Not specified — AM to fill"}</div>})}<Hr/>
    {/* `brief` is a Mixed field on a strict:false schema, so this is only an
        array by convention — anything writing the API can put a string here,
        and `(x||[]).length>0` waves one through to a .map() that throws and
        white-screens the whole campaign. Coerced rather than guarded, so a
        stray string renders as the one chip it describes. */}
    {(()=>{const delv=asList(camp.brief.deliverables);return(
    field({fieldKey:"deliverables",label:"Deliverables",value:delv,
      children:<DelvSelect value={draft||[]} onChange={setDraft}/>,
      render:delv.length>0
        ? <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{delv.map(d=><span key={d} style={{fontSize:10.5,color:T.sub,padding:"3px 8px",background:T.mute,borderRadius:3}}>{d}</span>)}</div>
        : <div style={{fontSize:12,color:T.label,fontStyle:"italic"}}>Not selected — AM to choose</div>}));})()}<Hr/>
    {/* Scope: how many creators, how many posts each. Both are quoted to the
        client, and `numReq` is what the roster gate counts to, so it stays
        editable one stage longer than the rest of the brief (see canEditCommercials).
        The total shown is the live one — per-creator overrides on the
        Deliverables tab are already counted in it. */}
    {field({fieldKey:"scope",label:"Scope",editable:canEditCommercials,
      // Blank, not "null", when nothing has been agreed — this is the field
      // where a campaign raised without a scope gets one.
      value:{numReq:numReqOf(camp)!=null?String(numReqOf(camp)):"",perDeliv:String(perCreatorDelivOf(camp))},
      render:numReqOf(camp)==null
        ? <div style={{fontSize:12,color:T.label,fontStyle:"italic"}}>Creator count not agreed yet · {perCreatorDelivOf(camp)} deliverable{perCreatorDelivOf(camp)!==1?"s":""} each</div>
        : <div style={{fontSize:12,color:T.text}}>
            {numReqOf(camp)} creators · {perCreatorDelivOf(camp)} deliverable{perCreatorDelivOf(camp)!==1?"s":""} each
            <span style={{fontSize:10,color:T.label}}> · {totalDelivOf(camp)} total</span>
          </div>,
      children:<>
        <div style={{display:"flex",gap:10}}>
          {/* Only the creator count can be left unset — blank stores null and
              the campaign runs without a target (see numReqOf). The per-creator
              plan always resolves to at least 1, so offering "not set" on it
              would be a state it cannot actually hold. */}
          {[["numReq","Creators","not set"],["perDeliv","Deliverables each","1"]].map(([k,l,ph])=>(
            <div key={k}>
              <Lbl style={{display:"block",marginBottom:4}}>{l}</Lbl>
              <input type="number" min={k==="numReq"?0:1} placeholder={ph} value={draft?.[k]??""} onChange={e=>setDraft(d=>({...d,[k]:e.target.value}))} style={{...INP,resize:"none",maxWidth:120}}/>
            </div>
          ))}
        </div>
        <div style={{fontSize:9.5,color:T.sub,marginTop:6}}>
          The plan, and what the client is quoted. Creators is also what the roster gate counts to — locking this many is what sends the list to the client and unlocks the PO. A single creator can still be set higher on the Deliverables tab.
        </div>
      </>})}<Hr/>
    {/* Total budget is the client-facing number (founder/PCM only). Creator
        budget is the pot the shortlist is built against, so every role that
        can see creator cost can see it here too.
        The floor is the creator budget — this is the same constraint the
        creator-budget row enforces from the other side, so the two can't be
        crossed from either end. */}
    {/* When there is no budget, this row does not offer Edit. Allocation is
        not the same act as changing a figure — it raises the quote the brief
        lock skipped and unblocks the PO — so it goes through the modal that
        collects the creator split and states those consequences, rather than
        through a bare MoneyInput that would leave the split to a 60% guess. */}
    {canFin(role)&&<>{field({fieldKey:"budget",label:"Total budget",editable:canEditCommercials&&hasBudget(camp),
      value:String(camp.budget||0),invalid:tbUnder,
      render:hasBudget(camp)
        ? <div style={{fontSize:12,color:T.text}}>{fmtINR(camp.budget)}</div>
        : <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:T.label,fontStyle:"italic"}}>Not allocated — raised before the client agreed a number</span>
            {onAllocate&&<Btn variant="primary" onClick={onAllocate} style={{fontSize:10,padding:"4px 10px"}}>Allocate budget</Btn>}
          </div>,
      children:<>
        <MoneyInput value={draft||""} onChange={setDraft} placeholder="e.g. 12,50,000" style={{...INP,resize:"none",maxWidth:180}}/>
        <div style={{fontSize:9.5,color:tbUnder?T.red:T.sub,marginTop:4}}>
          {tbUnder
            ? (agencyFeeOf(camp)>0
                ? `Can't be below the creator budget of ${fmtINR(creatorBudgetOf(camp))} plus the ${fmtINR(agencyFeeOf(camp))} agency fee.`
                : `Can't be below the creator budget of ${fmtINR(creatorBudgetOf(camp))}.`)
            : "What the client is billed. The invoice raised when the PO is recorded is drawn from this."}
        </div>
      </>})}<Hr/>
    {/* Charged ON TOP of that budget: seen by the roles that own commercials,
        edited by the founder alone (editAgencyFee, rbac.js). Only once a budget
        exists — a percentage of nothing is nothing. Sits under the total
        because it is the half of it nobody types. */}
    {canAF(role)&&hasBudget(camp)&&field({fieldKey:"agencyFee",label:"Agency fee",
      editable:canEditAF(role),value:String(camp.agencyFeePct??""),
      render:agencyFeeOf(camp)>0
        ? <div style={{fontSize:12,color:T.text}}>{fmtINR(agencyFeeOf(camp))}
            <span style={{fontSize:10.5,color:T.label}}> · {camp.agencyFeePct||0}% on top of {fmtINR(baseBudgetOf(camp))}</span>
          </div>
        : <div style={{fontSize:12,color:T.label,fontStyle:"italic"}}>None — the client pays the budget above</div>,
      children:<>
        <PctInput value={draft??""} onChange={setDraft}/>
        <div style={{fontSize:9.5,color:T.sub,marginTop:6,lineHeight:1.5}}>
          {afNew>0
            ? <>{fmtINR(afNew)} on top of {fmtINR(afBase)} — the client pays <strong style={{color:T.text}}>{fmtINR(afBase+afNew)}</strong>.</>
            : <>No fee — the client pays the {fmtINR(afBase)} budget.</>}
          {/* After the PO the invoiced total has left the building, so the row
              says what it is about to restate. */}
          {!beforePO(camp)&&<div style={{color:T.amber,marginTop:4}}>
            The PO was raised at {fmtINR(camp.budget)} — changing this restates what the client was billed. It is logged to the timeline.
          </div>}
        </div>
      </>})}<Hr/></>}
    {canCrFin(role)&&<>
      {field({fieldKey:"creatorBudget",label:"Creator budget",value:String(creatorBudgetOf(camp)||0),invalid:cbOver,
        // Not editable while the total is unset: a creator pool is a SHARE of
        // the total, and one typed against nothing is a number with no
        // denominator. Both are set together, in the allocate modal.
        editable:canEditBrief&&hasBudget(camp),
        render:hasBudget(camp)
          ? <div style={{fontSize:12,color:T.text}}>{fmtINR(creatorBudgetOf(camp))}</div>
          : <div style={{fontSize:12,color:T.label,fontStyle:"italic"}}>Set when the budget is allocated</div>,
        children:<>
          <MoneyInput value={draft||""} onChange={setDraft} placeholder="e.g. 7,50,000" style={{...INP,resize:"none",maxWidth:180}}/>
          {cbOver&&<div style={{fontSize:9.5,color:T.red,marginTop:4}}>
            Can't exceed the total budget of {fmtINR(camp.budget)}.
          </div>}
        </>})}<Hr/>
    </>}
    {/* Reads start/end, not brief.timeline — those are the fields everything
        else in the app uses, and the stored string is only their display form.
        After the PO this row goes read-only and the end date moves through
        "Extend" in the header instead, which takes a reason and logs it. */}
    {field({fieldKey:"timeline",label:"Timeline",editable:canEditCommercials,invalid:tlBad,
      value:{start:camp.start||"",end:ISO_DATE.test(camp.end||"")?camp.end:""},
      render:<div style={{fontSize:12,color:camp.start?T.text:T.label}}>{timelineLabel(camp.start,camp.end)||"—"}</div>,
      children:<>
        <div style={{display:"flex",gap:10}}>
          {[["start","Start"],["end","End"]].map(([k,l])=>(
            <div key={k}>
              <Lbl style={{display:"block",marginBottom:4}}>{l}</Lbl>
              <DateInput value={draft?.[k]||""} onChange={v=>setDraft(d=>({...d,[k]:v}))}
                min={k==="end"?draft?.start:undefined} style={{...INP,resize:"none",maxWidth:170}}/>
            </div>
          ))}
        </div>
        <div style={{fontSize:9.5,color:tlBad?T.red:T.sub,marginTop:6}}>
          {tlBad?"Both dates are required, and the end can't be before the start.":"The campaign's run dates. Drives the end-date warning and what the client sees on the brief."}
        </div>
      </>})}
    {camp.cmNote&&role!=="ea"&&<div style={{marginTop:14,paddingLeft:10,borderLeft:`2px solid ${T.accent}`}}><Lbl color={T.accent} style={{display:"block",marginBottom:4}}>CM Note</Lbl><div style={{fontSize:11.5,color:T.sub,lineHeight:1.6}}>{camp.cmNote}</div></div>}
    {role!=="ea"&&camp.internalNotes&&<div style={{marginTop:12,paddingLeft:10,borderLeft:`2px solid ${T.amber}`}}><Lbl color={T.amber} style={{display:"block",marginBottom:4}}>Internal — not visible to client</Lbl><div style={{fontSize:11.5,color:T.sub,lineHeight:1.6}}>{camp.internalNotes}</div></div>}
    {/* Locking the brief is the campaign's first real gate — everything after
        it, on both tracks, is downstream of these numbers. Blocked while a
        field is open so a half-typed draft can't be sealed away by the stage
        moving on. */}
    {canLock&&<div style={{marginTop:20}}>
      <Hr style={{marginBottom:16}}/>
      <Lbl style={{display:"block",marginBottom:6}}>Brief sign-off</Lbl>
      <div style={{fontSize:11.5,color:T.sub,lineHeight:1.55,marginBottom:10}}>
        {budgetPending(camp)
          ? "Locking freezes the brief text. No quote is raised — there is no budget to price yet; that follows when one is allocated. Scope and dates stay editable until the client PO is recorded; the brief itself can't be edited afterwards."
          : "Locking freezes the brief text and raises the client quote. Scope, budget and dates stay editable until the client PO is recorded; the brief itself can't be edited afterwards."}
      </div>
      {gaps.length>0&&<div style={{fontSize:10.5,color:T.amber,lineHeight:1.5,marginBottom:10}}>
        Still needed before the brief can be locked: {gaps.join(", ")}.
      </div>}
      <Btn variant="primary" onClick={()=>setLocking(true)} disabled={!!edit||gaps.length>0}>🔒 Lock brief</Btn>
    </div>}
    <AnimatePresence>
      {locking&&<LockBriefModal camp={camp} onCancel={()=>setLocking(false)}
        onConfirm={()=>{ setLocking(false); onAction("lock_brief"); onGoTab?.("team"); }}/>}
    </AnimatePresence>
    {!canEditBrief&&!canLock&&<div style={{marginTop:16,fontSize:10,color:T.label}}>
      {!briefLocked(camp)
        ? "The brief is written by the Founder, PCM or whoever raised this campaign, and locked by the Founder or PCM."
        : canEditCommercials
          ? "The brief text was frozen when the brief was locked. Scope, budget and dates stay editable until the client PO is recorded — that's what the PO and the invoice are raised from."
          : "The brief and its commercials were locked when the Purchase Order was raised."}
    </div>}
  </div>);
}

// ── LOCK BRIEF ───────────────────────────────────────────────────────────────
// Its own dialog rather than the generic "confirm stage change", because this
// is the one irreversible step a non-Accounts role takes: it freezes the brief
// text, raises the client quote, and opens both tracks. The generic modal
// could only repeat the button's label back; this names what is about to
// happen and where the campaign lands next.
function LockBriefModal({camp,onConfirm,onCancel}){
  const staffed=teamComplete(camp);
  return(<div style={{position:"fixed",inset:0,zIndex:650,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}}
      onClick={onCancel} style={{position:"absolute",inset:0,background:"rgba(4,5,10,0.55)",backdropFilter:"blur(6px)"}}/>
    <motion.div initial={{opacity:0,scale:0.96,y:10}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:0.97,y:6}}
      transition={{duration:0.2,ease:[0.16,1,0.3,1]}}
      style={{position:"relative",width:"min(420px,94vw)",background:"#FFFFFF",border:"1px solid rgba(0,0,0,0.07)",
        borderRadius:18,padding:"22px 24px 18px",boxShadow:"0 30px 60px -20px rgba(0,0,0,0.35)"}}>
      <div style={{fontFamily:"'Newsreader',serif",fontSize:19,fontStyle:"italic",fontWeight:600,color:"#1D1D1F",marginBottom:4}}>Lock this brief?</div>
      <div style={{fontSize:11.5,color:"#6E6E73",fontFamily:SF,lineHeight:1.6,marginBottom:14}}>{camp.name}</div>
      <div style={{border:"1px solid rgba(0,0,0,0.06)",borderRadius:12,overflow:"hidden",marginBottom:14}}>
        {[
          ["Brief text",  "frozen — objective, audience, messages and deliverables can't be edited again"],
          // A quote is a price. With no budget there is nothing to price, so
          // the lock genuinely raises no document — and saying it does would
          // send someone to Billing looking for one that isn't there. It gets
          // raised when the budget is allocated instead (see raiseQuote).
          ["Client quote", budgetPending(camp)
            ? "not raised — this campaign has no budget yet. It goes to Billing when one is allocated"
            : "raised in Billing from the campaign's own budget split"],
          ["Next",        staffed?"the team is already assigned, so execution opens immediately":"assign the AM, CM and Exec Associate — that's the blocker into execution"],
        ].map(([l,d],i)=>(
          <div key={l} style={{display:"flex",gap:12,padding:"10px 13px",borderTop:i?"1px solid rgba(0,0,0,0.05)":"none"}}>
            <span style={{width:78,flexShrink:0,fontSize:10,fontWeight:600,color:"#1D1D1F",fontFamily:SF}}>{l}</span>
            <span style={{flex:1,fontSize:10.5,color:"#6E6E73",fontFamily:SF,lineHeight:1.5}}>{d}</span>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:8}}>
        <Btn variant="subtle" onClick={onCancel}>Cancel</Btn>
        <div style={{flex:1}}/>
        <Btn variant="primary" onClick={onConfirm}>🔒 Lock brief</Btn>
      </div>
    </motion.div>
  </div>);
}

    // ── TEAM TAB ─────────────────────────────────────────────────────────────────
    // Slots are freely re-assignable up to the PO and frozen after — the same
    // boundary the brief uses (beforePO). Past it the campaign is committed to the
    // client, and moving it off someone revokes their access (see canSee).
    //
    // These slots are also the Draft gate: filling all three advances to Brief Log
    // on its own, which is why the form warns BEFORE the last slot is saved —
    // there is no confirmation dialog to catch it afterwards.
const TEAM_SLOTS=[
  {key:"am",label:"Account Manager", campKey:"amId",action:"assign_am",roles:["am","pcm","founder"]},
  {key:"cm",label:"Category Manager",campKey:"cmId",action:"assign_cm",roles:["cm","pcm"]},
  {key:"ea",label:"Exec Associate",  campKey:"eaId",action:"assign_ea",roles:["ea"]},
];
function TabTeam({camp,role,onAction}){
  const [editing,setEditing]=useState(null); // slot key currently being edited
  const [sel,setSel]=useState("");
  const canAssign=can(role,"assignUsers")&&beforePO(camp);
  const open=slot=>{setEditing(slot.key);setSel("");};
  const save=slot=>{
    if(!sel)return;
    onAction(slot.action,{[slot.campKey]:sel});
    setEditing(null);
  };
  // True when saving THIS slot is what completes the team and opens execution.
  const opensExec=slot=>normStage(camp.stage)==="brief_locked"
    &&TEAM_SLOTS.every(s=>s.key===slot.key||camp[s.campKey]);
  return(<div>
    {/* The blocker, stated up front. Assignment is the one step between a
        locked brief and any work happening, and it is restricted to the four
        roles that own staffing — so the people who can't do it should be told
        what the campaign is waiting for rather than shown three dead rows. */}
    {normStage(camp.stage)==="brief_locked"&&(
      <div style={{display:"flex",alignItems:"center",gap:9,padding:"10px 13px",marginBottom:6,
        background:`${T.amber}0D`,border:`1px solid ${T.amber}30`,borderRadius:10}}>
        <Dot color={T.amber} size={6}/>
        <span style={{fontSize:11,color:T.sub,fontFamily:SF,lineHeight:1.5}}>
          Brief locked — the campaign is blocked here until all three slots are filled. Assigning is done by the Founder, PCM, Category Manager or Account Manager.
        </span>
      </div>
    )}
    {TEAM_SLOTS.map((slot,i)=>{
      const m=getM(camp[slot.campKey]),isEditing=editing===slot.key;
      const pool=TEAM_DIR.filter(t=>slot.roles.includes(t.role));
      return(<div key={slot.key}>
        <div style={{padding:"12px 0"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
            <Lbl>{slot.label}</Lbl>
            {canAssign&&!isEditing&&<button onClick={()=>open(slot)} style={{background:"transparent",border:"none",padding:0,cursor:"pointer",fontFamily:SF,fontSize:10.5,fontWeight:600,color:T.accent,textDecoration:"underline",textUnderlineOffset:2}}>{m?"Change":"Assign"}</button>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            {m&&<Av init={m.avatar} size={20}/>}
            <span style={{fontSize:12,color:m?T.text:T.label,fontStyle:m?"normal":"italic"}}>{m?m.name:"Unassigned"}</span>
            {m&&<span style={{fontSize:9,color:T.label}}>{m.jobTitle}</span>}
          </div>
          {isEditing&&<div style={{marginTop:10,padding:"12px 14px",background:T.raised,borderRadius:6,border:`1px solid ${T.border}`}}>
            <select value={sel} onChange={e=>setSel(e.target.value)} style={{...INP,resize:"none",marginBottom:8}}>
              <option value="">Select {slot.label}…</option>
              {pool.map(t=><option key={t.id} value={t.id}>{t.name} — {t.jobTitle}</option>)}
            </select>
            {!pool.length&&<div style={{fontSize:9.5,color:T.amber,marginBottom:8}}>No one with this role yet — add them on the Access &amp; Credentials page (they need a Team ID).</div>}
            {/* Warned up front because the transition is automatic — there's no
                confirmation dialog after the fact to catch it. */}
            {opensExec(slot)&&<div style={{fontSize:9.5,color:T.amber,marginBottom:8}}>This is the last empty slot — saving it opens execution.</div>}
            <div style={{display:"flex",gap:8}}>
              <Btn variant="primary" onClick={()=>save(slot)} disabled={!sel}>{m?"Reassign":"Assign"}</Btn>
              <Btn variant="subtle" onClick={()=>setEditing(null)}>Cancel</Btn>
            </div>
          </div>}
        </div>
        {i<TEAM_SLOTS.length-1&&<Hr/>}
      </div>);
    })}
    <div style={{marginTop:14,fontSize:10,color:T.label,lineHeight:1.5}}>{
      !can(role,"assignUsers") ? "Assignments are managed by the Founder, PCM, Category Manager or Account Manager."
      : !beforePO(camp)        ? "The team was locked when the Purchase Order was raised — reassigning now also changes who can see this campaign, so it's handled outside the campaign."
      : "All three roles must be filled before execution can start. They stay reassignable until the Purchase Order is raised."
    }</div>
  </div>);
}

// ── FINANCIALS TAB ───────────────────────────────────────────────────────────
// Three visibility bands, widest to narrowest:
//   canCrFin — creator budget, per-head target, committed/remaining (CM/AM/EA)
//   canFin   — the client-facing total budget on top of that
//   canFF    — agency fee and margin (founder only)
function TabFinancials({camp,role,onAllocate}){
  const cb=creatorBudgetOf(camp),af=(camp.budget||0)-(cb||0);
  const cmt=(camp.creators||[]).reduce((s,c)=>s+costOf(c),0);
  const marginPct=camp.budget>0?(af/camp.budget)*100:0;
  // Nothing to lay out yet. The rows below would each read ₹0 — a total of
  // zero, a pool of zero, a margin of 0.0% — which is a set of claims about
  // this campaign's economics rather than the absence of any. Worse, "creator
  // budget remaining" would go NEGATIVE and red the moment a creator was
  // locked, reporting an overspend against a budget nobody has set.
  if(budgetPending(camp)) return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}><Lbl>Financial overview</Lbl><span style={{fontSize:9,color:T.amber,border:`1px solid ${T.amber}25`,borderRadius:3,padding:"1px 6px"}}>Internal only</span></div>
      <div style={{padding:"16px 18px",borderRadius:10,background:`${T.amber}0D`,border:`1px solid ${T.amber}26`}}>
        <div style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:SF,marginBottom:5}}>No budget allocated</div>
        <div style={{fontSize:11.5,color:T.sub,lineHeight:1.6}}>
          This campaign was raised before the client agreed a number. The brief, the team and the roster all run without one — the quote, the client PO and the invoice are what wait.
        </div>
        {cmt>0&&(
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14,paddingTop:12,borderTop:`1px solid ${T.amber}26`}}>
            <span style={{fontSize:11.5,color:T.sub}}>Creator fees committed so far</span>
            <span style={{fontSize:12,fontWeight:500,color:T.text}}>{fmtINR(cmt)}</span>
          </div>
        )}
        {onAllocate&&<div style={{marginTop:14}}><Btn variant="primary" onClick={onAllocate}>Allocate budget</Btn></div>}
      </div>
      {!canFF(role)&&<div style={{marginTop:10,fontSize:10,color:T.label}}>{canFin(role)?"Agency fee and margin visible to Founders only.":"Creator-side budget only — total budget, agency fee and margin are not shown for your role."}</div>}
    </div>
  );
  const rows=[
    {label:"Total budget",value:fmtINR(camp.budget),color:T.text,show:canFin(role)},
    {label:"Creator budget",value:fmtINR(cb),color:T.sub,show:true},
    {label:"Creator fees committed",value:fmtINR(cmt),color:cmt>cb?T.red:T.green,show:true},
    {label:"Creator budget remaining",value:fmtINR(cb-cmt),color:T.sub,show:true},
    {label:"Agency fee",value:fmtINR(af),color:T.accent,show:canFF(role)},
    {label:"Margin",value:`${marginPct.toFixed(1)}%`,color:marginPct>=30?T.green:T.amber,show:canFF(role)},
  ].filter(r=>r.show);
  return(<div><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}><Lbl>Financial overview</Lbl><span style={{fontSize:9,color:T.amber,border:`1px solid ${T.amber}25`,borderRadius:3,padding:"1px 6px"}}>Internal only</span></div>{rows.map(({label,value,color},i)=><div key={label}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0"}}><span style={{fontSize:11.5,color:T.sub}}>{label}</span><span style={{fontSize:12,fontWeight:500,color}}>{value}</span></div>{i<rows.length-1&&<Hr/>}</div>)}{!canFF(role)&&<div style={{marginTop:10,fontSize:10,color:T.label}}>{canFin(role)?"Agency fee and margin visible to Founders only.":"Creator-side budget only — total budget, agency fee and margin are not shown for your role."}</div>}</div>);
}

// ── TIMELINE TAB ─────────────────────────────────────────────────────────────
function TabTimeline({camp}){const events=camp.timeline||[];if(!events.length)return <div style={{padding:"20px 0",color:T.label,fontSize:11,textAlign:"center"}}>No events yet.</div>;return(<div>{events.map((ev,i)=><div key={i} style={{display:"flex",gap:12,marginBottom:i<events.length-1?16:0}}><div style={{display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0}}><div style={{width:5,height:5,borderRadius:"50%",marginTop:4,background:i===events.length-1?T.accent:T.green}}/>{i<events.length-1&&<div style={{width:1,flex:1,background:T.border,marginTop:5}}/>}</div><div><div style={{fontSize:11.5,color:T.text,lineHeight:1.5}}>{ev.event}</div><div style={{fontSize:9.5,color:T.sub,marginTop:2}}>{ev.actor} &middot; {ev.date}</div></div></div>)}</div>);}

// ── WORKFLOW ACTIONS ─────────────────────────────────────────────────────────
// The right next-step CTA(s) for the current role and stage. Only the FINANCE
// track gets buttons: it is the track that moves on somebody saying a document
// exists. The execution track moves on the work itself — locking a creator,
// posting a link — so there is nothing here to press for it, only the hint
// that says what it's waiting on.
function WorkflowActions({camp, role, onAction}) {
  const isAcc  = ["accounts","founder","pcm"].includes(role);
  const isLead = ["founder","pcm"].includes(role);
  const stage  = normStage(camp.stage);

  const actions = [];

  // Said once, on every stage before the PO, because it is true on all of them
  // and only becomes a BLOCKER on the last. Stated early it reads as the open
  // item it is; stated only at team_assigned it would ambush a campaign that
  // had already staffed and delivered.
  if (budgetPending(camp) && ["draft","brief_locked"].includes(stage))
    actions.push({action:null, hint:"No budget allocated yet — that's fine until the client PO"});

  // Draft has no button by design — the brief is locked from the Brief tab,
  // where the thing being locked is actually in front of you.
  if (stage==="draft") {
    const gaps=briefGaps(camp);
    actions.push({action:null, hint:gaps.length
      ? `Brief incomplete — ${gaps.join(", ")} still needed`
      : isLead ? "Brief is complete — lock it on the Brief tab"
               : "Waiting on Founder/PCM to lock the brief"});
  }
  // The blocker into execution. No button either: assignment is three dropdown
  // picks on the Team tab and the stage advances on its own when the last one
  // lands, so a button here would only be a link with a stage change attached.
  if (stage==="brief_locked") {
    const missing=TEAM_SLOTS.filter(s=>!camp[s.campKey]).map(s=>s.label);
    actions.push({action:null, hint: missing.length
      ? `Blocked — assign ${missing.join(", ")} on the Team tab to open execution`
      : "Team complete — execution is open"});
  }
  // Every step below records something that happened OUTSIDE the system, which
  // is why each stays manual — but each now produces the record rather than
  // merely asserting it, and the stage moves because the document exists.
  //
  // The client PO buys a specific set of creators at a specific set of fees, so
  // the roster has to be confirmed before it can be raised. Recorded against a
  // half-locked list, the PO's value was a guess: anyone still negotiating could
  // land above the number, and anyone who backed off meant reissuing it.
  // Two things can hold the PO now, not one — see poGaps. A missing budget is
  // the one an ACCOUNTS user can't clear themselves, so the button that clears
  // it is offered here to the roles that can.
  if (stage==="team_assigned") {
    const gap=rosterGap(camp);
    const noBudget=budgetPending(camp);
    if (isAcc) actions.push({label:"Record Client PO", action:"raise_po", variant:"primary", disabled:!!gap||noBudget});
    else if (!gap&&!noBudget) actions.push({action:null, hint:"Waiting on Accounts to record the client's Purchase Order"});
    if (noBudget) {
      actions.push({action:null, hint:"No budget allocated — the PO is raised from it, so it has to be set first"});
      if (isLead) actions.push({label:"Allocate Budget", action:"allocate_budget", variant:"primary"});
    }
    if (gap) actions.push({action:null, hint:`${gap} — settle the roster on the Creators tab before the PO is raised`});
  }
  if (stage==="po_raised") {
    if (isAcc) actions.push({label:"Confirm Advance Received", action:"advance_received", variant:"success"});
    else actions.push({action:null, hint:"PO recorded — waiting on the client's advance payment"});
  }
  // Deliberately NOT gated on delivery. The final invoice usually follows the
  // campaign going live, and the hint says how delivery is doing — but the two
  // tracks are independent by design, and a hard gate here would let one late
  // creator hold up billing a client who is ready to pay.
  if (stage==="advance_received") {
    const s=execStats(camp);
    if (isAcc) actions.push({label:"Raise Client Invoice", action:"raise_invoice", variant:"primary"});
    else actions.push({action:null, hint:"Advance in — Accounts raises the final invoice"});
    actions.push({action:null, hint: execDone(camp)
      ? "All locked creators are live"
      : s.locked===0 ? "No creators locked yet — lock creators on the Creators tab"
      : `${s.live} of ${s.locked} locked creator${s.locked!==1?"s":""} live · ${s.delivered} of ${s.expected} deliverables posted`});
  }
  if (stage==="invoice_raised") {
    if (isAcc) actions.push({label:"Confirm Payment Received", action:"payment_done", variant:"success"});
    else actions.push({action:null, hint:"Invoice issued — waiting on the client's payment"});
  }
  if (stage==="payment_done")
    actions.push({action:null, hint:"Client settled in full — creator payouts finish on the execution track"});

  if (!actions.length) return null;
  return (
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14,padding:"10px 14px",background:"rgba(0,0,0,0.03)",borderRadius:10,border:"1px solid rgba(0,0,0,0.07)",alignItems:"center"}}>
      <span style={{fontSize:9.5,color:"#86868B",marginRight:2,letterSpacing:"0.04em",textTransform:"uppercase",fontWeight:600,fontFamily:SF,flexShrink:0}}>Next</span>
      {actions.map((a,i)=> a.action
        ? <Btn key={i} variant={a.variant} disabled={a.disabled} onClick={()=>onAction(a.action,{})} style={{fontSize:11,padding:"6px 12px"}}>{a.label}</Btn>
        : <span key={i} style={{fontSize:11,color:"#86868B",fontStyle:"italic",fontFamily:SF}}>{a.hint}</span>
      )}
    </div>
  );
}

// ── DETAIL ───────────────────────────────────────────────────────────────────
function Detail({camp,role,currentUser,expenseById,onAction,onSaveBrief,onSaveCampaign,onUpdateCreators,onDelete,onLogTimeline,onBack,onPrev,onNext,hasPrev,hasNext}){
  const navigate=useNavigate();
  const [tab,setTab]=useState("brief");
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [extending,setExtending]=useState(false);
  const [sheet,setSheet]=useState(null);        // "execution" | "creator_payment"
  const [raisingPO,setRaisingPO]=useState(false);
  const [allocating,setAllocating]=useState(false);
  // Selecting a different campaign resets the panel to Brief — the tab chosen
  // on one campaign shouldn't leak onto the next.
  useEffect(()=>{setTab("brief");setConfirmDelete(false);setExtending(false);setSheet(null);setRaisingPO(false);setAllocating(false);},[camp.id]);
  // Who can put a number on the campaign. The same people who can edit the
  // commercials on the Brief tab, and for the same reason: allocating IS
  // editing the total budget, just from a campaign that never had one. Gated
  // on beforePO through canEditCommercials — past the PO the number is what
  // the client was billed and no longer ours to set.
  const isCreator=!!currentUser?.teamId&&camp.createdBy===currentUser.teamId;
  const canAllocate=(["founder","pcm"].includes(role)||isCreator)&&beforePO(camp)&&budgetPending(camp);
  // raise_po needs a form before it can do anything, so it opens ClientPOModal
  // instead of firing straight through. Everything else passes untouched.
  // Two actions need a form before they can do anything, so they open their
  // modal instead of firing straight through. The modals call `onAction`
  // directly with the data they collected. Everything else passes untouched.
  const handleAction=(action,data)=>
    action==="raise_po"        ? setRaisingPO(true)
    : action==="allocate_budget" ? setAllocating(true)
    : onAction(action,data);
  // Clicking a finance node goes to where that step is actually DONE, rather
  // than only telling you where the campaign stands. The PO is recorded on the
  // campaign, so it opens the Financials tab where the button lives; the rest
  // happen in Billing, so they open the tab in Billing that owns the document.
  const goFinNode=id=>{
    if(id==="po_raised"&&stageIdx(camp.stage)<stageIdx("po_raised")) return setTab("financials");
    if(id==="po_raised") return navigate("/billing?tab=purchase_orders");
    return navigate("/billing?tab=income");
  };
  const stCol=viewCol(camp,role),pl=viewPl(camp,role);
  const es=endStatus(camp.end,camp.stage);
  // The EA works the campaign, not its audit trail — their execution rail
  // already says where it stands, and the timeline is mostly commercial events
  // (PO raised, advance confirmed) that sit outside their view entirely.
  const tabs=[{id:"brief",label:"Brief"},{id:"team",label:"Team"},{id:"creators",label:`Creators (${camp.creators?.length||0})`},{id:"deliverables",label:"Deliverables"},...(role==="ea"?[]:[{id:"timeline",label:"Timeline"}]),...(canFin(role)||canCrFin(role)?[{id:"financials",label:"Financials"}]:[])];
  const navBtn={display:"flex",alignItems:"center",gap:4,background:"transparent",border:"none",cursor:"pointer",fontSize:11.5,fontWeight:500,color:"#6E6E73",fontFamily:SF,padding:"5px 8px",borderRadius:6};
  // Card chrome shared by the header and content panels — floating rounded
  // surfaces on the grey page rather than full-bleed white bands, so the
  // campaign reads as one object instead of four stacked strips.
  const card={background:"#FFFFFF",borderRadius:16,border:"1px solid rgba(0,0,0,0.07)",boxShadow:"0 1px 2px rgba(0,0,0,0.04), 0 10px 28px -16px rgba(0,0,0,0.14)"};
  return(<motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:0.26,ease:[0.16,1,0.3,1]}} style={{height:"100%",overflowY:"auto",background:"#F5F5F7"}}>
    <div style={{maxWidth:1160,margin:"0 auto",padding:"14px 28px 44px"}}>
      {/* Drill-in nav: back to grid + step through the filtered list */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <button onClick={onBack} style={navBtn}>← Campaigns</button>
        <div style={{display:"flex",alignItems:"center",gap:2}}>
          <button onClick={onPrev} disabled={!hasPrev} style={{...navBtn,opacity:hasPrev?1:0.3,cursor:hasPrev?"pointer":"default"}}>‹ Prev</button>
          <button onClick={onNext} disabled={!hasNext} style={{...navBtn,opacity:hasNext?1:0.3,cursor:hasNext?"pointer":"default"}}>Next ›</button>
        </div>
      </div>

      {/* ── HEADER CARD — identity, stage, actions, pipeline, tabs ── */}
      <div style={{...card,overflow:"hidden",marginBottom:16}}>
        {/* Stage accent — the bar, plus a tint that bleeds down behind the
            title so the campaign's state colours the whole header rather than
            being a 3px line you have to notice. */}
        <div style={{height:3,background:stCol}}/>
        <div style={{padding:"18px 22px 16px",position:"relative",background:`linear-gradient(180deg,${stCol}0F,${stCol}00 110px)`}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,marginBottom:14}}>
            <div style={{flex:1,minWidth:0}}>
              <h2 style={{fontFamily:"'Newsreader',serif",fontSize:24,fontWeight:600,color:"#1D1D1F",margin:"0 0 4px",fontStyle:"italic",letterSpacing:"-0.02em",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{camp.name}</h2>
              <div style={{fontSize:11.5,color:"#6E6E73",fontFamily:SF}}>{camp.client} · {camp.service} · {camp.region}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
              <Pill tone={stCol} dot style={{padding:"5px 12px",fontSize:11}}>{pl.label}</Pill>
              {can(role,"deleteCampaign")&&<Btn variant="danger" onClick={()=>setConfirmDelete(true)} style={{fontSize:10,padding:"4px 10px"}}>Delete</Btn>}
            </div>
          </div>
          {/* The four numbers the header used to run together into one grey
              sentence. Labelled and evenly spaced, they can be read one at a
              time instead of parsed left to right. */}
          <div style={{display:"flex",flexWrap:"wrap",gap:"10px 30px",marginBottom:14}}>
            {canFin(role)&&(budgetPending(camp)
              // Named, not an em dash. "—" here is indistinguishable from a
              // field that failed to load, and this is the one number in the
              // header someone is expected to go and do something about — so
              // the fix sits beside it, the way Extend sits beside the
              // end-date nudge below.
              ? <Stat label="Budget" value="Not allocated">
                  <Pill tone={T.amber} dot style={{padding:"2px 8px",fontSize:9.5}}>Pending</Pill>
                  {canAllocate&&(
                    <button onClick={()=>setAllocating(true)} style={{background:"transparent",border:"none",padding:0,cursor:"pointer",fontFamily:SF,fontSize:11,fontWeight:600,color:T.accent,textDecoration:"underline",textUnderlineOffset:2}}>
                      Allocate
                    </button>
                  )}
                </Stat>
              : <Stat label="Budget" value={fmtINR(camp.budget)}/>)}
            {[{k:"Creators",v:numReqOf(camp)!=null?`${lockedCountOf(camp)} of ${numReqOf(camp)} locked`:`${lockedCountOf(camp)} locked · no count set`},
              {k:"Progress",v:`${progressOf(camp,role)}%`},
             ].map(s=><Stat key={s.k} label={s.k} value={s.v}/>)}
            <Stat label="Window" value={`${prettyDate(camp.start)} – ${prettyDate(camp.end)}`}>
              <EndPill es={es}/>
              {/* Offered exactly when the end-date nudge is showing — the
                  campaign is running out of runway, so the fix belongs next
                  to the warning rather than buried in an edit form. */}
              {es&&can(role,"extendCampaignEnd")&&(
                <button onClick={()=>setExtending(true)} style={{background:"transparent",border:"none",padding:0,cursor:"pointer",fontFamily:SF,fontSize:11,fontWeight:600,color:T.accent,textDecoration:"underline",textUnderlineOffset:2}}>
                  Extend
                </button>
              )}
            </Stat>
          </div>
          <AnimatePresence>
            {confirmDelete&&<DeleteCampaignModal camp={camp} onConfirm={()=>{setConfirmDelete(false);onDelete(camp.id);}} onCancel={()=>setConfirmDelete(false)}/>}
            {extending&&<ExtendEndModal camp={camp} onConfirm={(end,reason)=>{setExtending(false);onAction("extend_end_date",{end,reason});}} onCancel={()=>setExtending(false)}/>}
            {sheet==="execution"&&<ExecutionModal camp={camp} onClose={()=>setSheet(null)}/>}
            {sheet==="creator_payment"&&<CreatorPaymentModal camp={camp} role={role} expenseById={expenseById} onClose={()=>setSheet(null)}/>}
            {raisingPO&&<ClientPOModal camp={camp} invoiceAmount={camp.budget||0}
              onConfirm={po=>{setRaisingPO(false);onAction("raise_po",po);}} onCancel={()=>setRaisingPO(false)}/>}
            {allocating&&<AllocateBudgetModal camp={camp} role={role}
              onConfirm={(budget,creatorBudget)=>{setAllocating(false);onAction("allocate_budget",{budget,creatorBudget});}}
              onCancel={()=>setAllocating(false)}/>}
          </AnimatePresence>
          <WorkflowActions camp={camp} role={role} onAction={handleAction}/>
          {/* Scrolls inside its own lane so it never widens the card */}
          <div style={{margin:"0 -22px",padding:"0 22px"}}>
            <TrackPipeline camp={camp} role={role} expenseById={expenseById}
              onOpen={setSheet} onFinNode={goFinNode} onGoTeam={()=>setTab("team")}/>
          </div>
        </div>
        {/* Tab strip — sliding indicator shared across tab switches AND campaign switches */}
        <div style={{display:"flex",padding:"0 22px",borderTop:"1px solid rgba(0,0,0,0.06)",background:"rgba(0,0,0,0.015)",overflowX:"auto"}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{position:"relative",padding:"11px 0",marginRight:22,background:"transparent",border:"none",color:tab===t.id?"#1D1D1F":"#6E6E73",fontSize:12,cursor:"pointer",fontFamily:SF,fontWeight:tab===t.id?600:400,transition:"color 0.15s",letterSpacing:"-0.01em",whiteSpace:"nowrap",flexShrink:0}}>
              {t.label}
              {tab===t.id&&<motion.div layoutId="detailTabIndicator" style={{position:"absolute",left:0,right:0,bottom:0,height:2,borderRadius:1,background:stCol}} transition={{type:"spring",stiffness:500,damping:40}}/>}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTENT CARD — crossfades on tab change ── */}
      <div style={{...card,padding:"22px 24px"}}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-3}} transition={{duration:0.16,ease:"easeOut"}}>
            {tab==="brief"        &&<TabBrief        camp={camp} role={role} currentUser={currentUser} onAction={onAction} onSaveBrief={onSaveBrief} onSaveCampaign={onSaveCampaign} onGoTab={setTab} onAllocate={canAllocate?()=>setAllocating(true):null} onLogTimeline={onLogTimeline}/>}
            {tab==="team"         &&<TabTeam         camp={camp} role={role} onAction={onAction}/>}
            {tab==="creators"     &&<TabCreators     camp={camp} role={role} onUpdateCreators={onUpdateCreators} onLogTimeline={onLogTimeline}/>}
            {tab==="deliverables" &&<TabDeliverables camp={camp} role={role} currentUser={currentUser} onUpdateCreators={onUpdateCreators} onLogTimeline={onLogTimeline}/>}
            {tab==="timeline"     &&<TabTimeline     camp={camp}/>}
            {tab==="financials"   &&(canFin(role)||canCrFin(role))&&<TabFinancials camp={camp} role={role} onAllocate={canAllocate?()=>setAllocating(true):null}/>}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  </motion.div>);
}

// ── CREATE MODAL ─────────────────────────────────────────────────────────────
// Each step says what it wants and why in one line. A four-screen form that
// only labels itself "BASICS — 1 OF 4" gives you no reason to keep going and no
// idea what's coming, so the two steps that are entirely skippable read as work
// rather than as the free passes they actually are.
// Money and Scope were one "Commercial" step — nine controls answering three
// unrelated questions, and the screen everybody stalled on. Split at the seam
// already there: money is agreed with the client's finance side, scope and
// dates with their marketing side.
const STEPS=[
  {id:"Basics",   title:"Start with the basics",     sub:"A name and a brand is most of it."},
  {id:"Brief",    title:"What's the campaign for?",  sub:"Objective is the one thing worth pinning down now — the rest can be written properly later, on its own tab."},
  {id:"Money",    title:"What the client pays",      sub:"The budget, anything charged on top of it, and how much of it reaches creators."},
  {id:"Scope",    title:"How big, and when",         sub:"How many creators, what each of them owes, and the window it runs in."},
  {id:"Internal", title:"Anything the client shouldn't see?", sub:"Optional. Check the summary and you're done."},
];

// Numbered rail with every step named, ticked once it's behind you and
// clickable to go back. Replaces a 1.5px progress line, which showed how far
// along you were but never what was left — the thing that makes a multi-step
// form feel open-ended.
function StepRail({step,onGo}){
  return(
    <div style={{display:"flex",alignItems:"center",padding:"0 20px 15px"}}>
      {STEPS.map((s,i)=>{
        const passed=i<step, here=i===step;
        const col=passed?T.green:here?T.text:T.label;
        return(
          <div key={s.id} style={{display:"flex",alignItems:"center",flex:i<STEPS.length-1?1:"0 0 auto",minWidth:0}}>
            <button onClick={()=>passed&&onGo(i)} disabled={!passed} title={passed?`Back to ${s.id}`:undefined}
              style={{display:"flex",alignItems:"center",gap:6,background:"transparent",border:"none",padding:0,cursor:passed?"pointer":"default",fontFamily:SF}}>
              <span style={{width:20,height:20,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9.5,fontWeight:700,
                color:here?"#FFFFFF":passed?T.green:T.label,
                background:here?T.accent:passed?`${T.green}1A`:"rgba(0,0,0,0.05)",
                border:`1px solid ${here?T.accent:passed?`${T.green}45`:"transparent"}`}}>{passed?"✓":i+1}</span>
              <span style={{fontSize:10.5,fontWeight:here?600:500,color:col,whiteSpace:"nowrap"}}>{s.id}</span>
            </button>
            {i<STEPS.length-1&&<div style={{flex:1,height:1.5,margin:"0 8px",borderRadius:1,background:passed?`${T.green}55`:"rgba(0,0,0,0.08)"}}/>}
          </div>
        );
      })}
    </div>
  );
}

function CreateModal({onClose,onSubmit,brands,onCreateBrand,role,brandFilter}){
  const [step,setStep]=useState(0);
      // creatorBudgetMode picks which creator-budget input is live; the other is
      // kept so toggling back doesn't lose what was typed.
      //
      // brandId seeds from the active brand filter — someone working inside one
      // brand was still landing on an empty picker, and picking wrong silently
      // files the campaign (and every invoice and PO after it) under another
      // client. Still editable; only the default changes. Validated against
      // `brands`, which may not have loaded yet.
  const [f,setF]=useState({name:"",brandId:brands.some(b=>b.id===brandFilter)?brandFilter:"",service:"Influencer Marketing",region:"",niches:[],budget:"",budgetDeferred:false,scopeDeferred:false,numCreators:5,deliverablesPerCreator:1,creatorBudgetMode:"pct",creatorBudgetPct:60,creatorBudgetAmt:"",agencyFeePct:"",objective:"",audience:"",messages:"",deliverables:[],timelineStart:"",timelineEnd:"",internalNotes:""});
  // Staged only — nothing is written to the backend until the campaign is
  // actually submitted, so abandoning this modal never leaves an orphan brand.
  const [pendingBrandName,setPendingBrandName]=useState(null);
  const [submitting,setSubmitting]=useState(false);
  const [brandErr,setBrandErr]=useState(null);
  // Set when someone tries to leave a step with a required field empty — see
  // next(). Until then the form stays quiet: fields are not marked missing
  // before anyone has had the chance to fill them.
  const [tried,setTried]=useState(false);
  const u=(k,v)=>setF(p=>({...p,[k]:v}));
  const merge=patch=>setF(p=>({...p,...patch}));
  // budgetNum is the budget AS TYPED — the base. clientTotal is what gets
  // stored as `budget`, which means "what the client pays" everywhere it is
  // read: the quote, the PO, the invoice, the portal's budget card.
  const budgetNum=parseInt(f.budget)||0;
  const agencyFee=canAF(role)?resolveAgencyFee(f.agencyFeePct,budgetNum):0;
  const clientTotal=budgetNum+agencyFee;
  // From the base, never the total: "60% of budget" means 60% of the campaign,
  // not of the campaign plus our own fee.
  const creatorBudget=resolveCreatorBudget(f,budgetNum);
  // Per-step required fields — Next/Create stay disabled until the current
  // step's required inputs are filled (Brief + Internal have none).
  //
  // The money half of Commercial drops out entirely when the budget is
  // deferred: scope and dates are still required, because those are what the
  // campaign is planned and staffed against and neither waits on a number.
  const moneyOk=f.budgetDeferred||(budgetNum>0&&creatorBudget>0&&creatorBudget<=budgetNum);
  // Scope rides with the budget. Both are settled in the same conversation with
  // the client — "how many creators, and for how much" is one question — so a
  // campaign raised before that conversation can be raised without either, and
  // one raised WITH a budget still has to say what the budget buys.
  // Deferring is now an explicit choice, so the numbers are mandatory unless it
  // has been made — no more "0 means I didn't decide", which was indistinguishable
  // from "I decided on none".
  const scopeOk=f.scopeDeferred||(parseInt(f.numCreators)>0&&parseInt(f.deliverablesPerCreator)>0);
  const scopeSet=!f.scopeDeferred&&parseInt(f.numCreators)>0;
  const stepOk=[
    !!(f.name.trim()&&f.service&&f.brandId),
    !!f.objective.trim(),
    moneyOk,
    scopeOk&&!!f.timelineStart&&!!f.timelineEnd&&f.timelineEnd>=f.timelineStart,
    true,
  ];
  const ok=stepOk[step];
  const allOk=stepOk.every(Boolean);
  const timelineLabel=f.timelineStart&&f.timelineEnd?`${prettyDate(f.timelineStart)} – ${prettyDate(f.timelineEnd)}`:"";
  const handleSubmit=async()=>{
    if(!allOk){
      // The summary screen has no required fields of its own, so a blocked
      // Create is always about a screen behind it. Going there and marking the
      // field beats grey-ing a button on a step with nothing wrong on it.
      setTried(true);
      const bad=stepOk.findIndex(v=>!v);
      if(bad>=0)setStep(bad);
      return;
    }
    // creatorBudget is resolved here rather than in onCreate so the stored
    // number is exactly the one the wizard showed, whichever mode was used.
    // Both are NULL when the budget was deferred — see hasBudget in
    // lib/campaign.js for why absent rather than zero.
    const payload={...f,timeline:timelineLabel,
      budget:f.budgetDeferred?null:clientTotal,
      // Stored resolved AND as the rate: the amount is what downstream needs,
      // the rate is what a renegotiation starts from. Both null on a deferred
      // budget — 0 would read as "agreed to charge nothing".
      agencyFee:f.budgetDeferred?null:agencyFee,
      agencyFeePct:f.budgetDeferred?null:(agencyFee>0?clampPct(f.agencyFeePct):0),
      creatorBudget:f.budgetDeferred?null:creatorBudget};
    if(f.brandId!=="__new__"){ onSubmit(payload); return; }
    setSubmitting(true);setBrandErr(null);
    try{
      const created=await onCreateBrand(pendingBrandName);
      onSubmit({...payload,brandId:created.id});
    }catch(err){
      setBrandErr(err.message||"Could not create brand — campaign not created");
      setSubmitting(false);
    }
  };
  // Advancing with something missing SAYS what is missing, rather than leaving
  // a dead Next button and no reason for it. `tried` arms the per-field
  // "required" messages below; it clears on a successful move so stepping back
  // into a screen you already completed isn't met with red text.
  const next=()=>{
    if(!ok){setTried(true);return;}
    setTried(false);
    setStep(s=>Math.min(s+1,STEPS.length-1));
  };
  const back=()=>{setTried(false);setStep(s=>s-1);};
  // Enter advances the wizard from any single-line input, the way every other
  // form on the web behaves. Textareas keep Enter for newlines.
  const onKeyDown=e=>{
    if(e.key!=="Enter"||e.target.tagName==="TEXTAREA")return;
    e.preventDefault();
    step<STEPS.length-1?next():allOk?handleSubmit():setTried(true);
  };
  const brandLabel=f.brandId==="__new__"?`${pendingBrandName} (new)`:brands.find(b=>b.id===f.brandId)?.name||"—";
  const nCr=parseInt(f.numCreators)||0, nDv=parseInt(f.deliverablesPerCreator)||0;
  // Backdrop is intentionally not clickable — half-filled wizards are not worth
  // losing to a stray click, so the modal only closes via ✕. It also keeps its
  // own shell rather than using <Panel>: it differs in four ways at once (that
  // undismissable backdrop, the step rail, a Back/Next footer rather than
  // Cancel/confirm, and its own z-index so it can sit under the confirm
  // dialogs). Teaching Panel all four to serve one caller would cost more than
  // the copy does.
  return(<div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center"}}><motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}} style={{position:"absolute",inset:0,background:"rgba(4,5,10,0.88)",backdropFilter:"blur(6px)"}}/>
    <motion.div initial={{opacity:0,scale:0.96,y:8}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:0.97,y:4}} transition={{duration:0.18,ease:"easeOut"}} onKeyDown={onKeyDown} style={{position:"relative",width:"min(560px,94vw)",maxHeight:"88vh",background:T.surface,border:`1px solid ${T.borderMid}`,borderRadius:14,overflow:"hidden",display:"flex",flexDirection:"column"}}>
      <div style={{padding:"16px 20px 13px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontFamily:"'Newsreader',serif",fontSize:18,color:T.text,fontStyle:"italic"}}>New Campaign</div>
        <button onClick={onClose} title="Close" style={{background:"transparent",border:"none",color:T.sub,fontSize:16,cursor:"pointer",lineHeight:1}}>✕</button>
      </div>
      <StepRail step={step} onGo={setStep}/>
      <div style={{padding:"16px 20px 20px",overflowY:"auto",flex:1,borderTop:`1px solid ${T.border}`}}>
        {/* What this screen wants, before the fields that want it */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:SF,letterSpacing:"-0.02em"}}>{STEPS[step].title}</div>
          <div style={{fontSize:11,color:T.sub,fontFamily:SF,marginTop:3,lineHeight:1.55}}>{STEPS[step].sub}</div>
        </div>
        {step===0&&<>
          <Field label="Campaign name">
            <input value={f.name} onChange={e=>u("name",e.target.value)} placeholder="e.g. Summer Launch Teaser" style={{...INP,resize:"none"}}/>
            <Req show={tried&&!f.name.trim()}/>
          </Field>
          <Field label="Brand" hint={f.brandId==="__new__"&&pendingBrandName?`"${pendingBrandName}" will be created when you submit this campaign.`:undefined}>
            <BrandPicker brands={brands} value={f.brandId} pendingName={pendingBrandName}
              onSelect={id=>{u("brandId",id);setPendingBrandName(null);}}
              onCreate={name=>{setPendingBrandName(name);u("brandId","__new__");}}/>
            <Req show={tried&&!f.brandId}>Mandatory field — pick the brand this campaign runs for, or create it.</Req>
          </Field>
          {brandErr&&<div style={{fontSize:10.5,color:T.red,marginBottom:10}}>{brandErr}</div>}
          <Field label="Service"><select value={f.service} onChange={e=>u("service",e.target.value)} style={{...INP,resize:"none"}}>{["Influencer Marketing","IM — Mass","IM — Sales"].map(s=><option key={s}>{s}</option>)}</select></Field>
          <Field label="Region" optional style={{marginBottom:0}}><input value={f.region} onChange={e=>u("region",e.target.value)} placeholder="e.g. South India" style={{...INP,resize:"none"}}/></Field>
        </>}
        {step===1&&<>
          {[["Objective","objective",60,false],["Target audience","audience",50,true],["Key Messages","messages",50,true]].map(([l,k,h,opt])=>
            <Field key={k} label={l} optional={opt}>
              <textarea value={f[k]} onChange={e=>u(k,e.target.value)} style={{...INP,minHeight:h}}/>
              <Req show={tried&&!opt&&!f[k].trim()}/>
            </Field>)}
          <Field label="Deliverables" optional style={{marginBottom:0}}><DelvSelect value={f.deliverables} onChange={v=>u("deliverables",v)}/></Field>
        </>}
        {step===2&&<>
          {/* The budget is the one thing on this screen the client may not have
              agreed yet, and waiting for it used to mean not raising the
              campaign at all. Deferring it leaves everything else intact — the
              brief still locks, the team is still staffed, the roster is still
              built and delivered. Only the client PO waits, because the PO's
              amount IS this number. */}
          <Field label="Total budget (₹)">
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:f.budgetDeferred?0:9}}>
              <div style={SEG_WRAP}>
                {/* Setting a budget also un-defers the scope: the "Not decided"
                    control below is only offered while the budget is deferred,
                    so leaving the flag set would hide it with a priced campaign
                    still carrying a null scope — past the very check that
                    control exists to make explicit. */}
                <button onClick={()=>merge({budgetDeferred:false,scopeDeferred:false})} style={segBtn(!f.budgetDeferred)}>Set now</button>
                <button onClick={()=>u("budgetDeferred",true)}  style={segBtn(f.budgetDeferred)}>Not agreed yet</button>
              </div>
              {f.budgetDeferred&&<span style={{fontSize:11,color:T.label,fontFamily:SF}}>Allocate it later</span>}
            </div>
            {f.budgetDeferred
              ? <div style={{fontSize:10.5,color:T.sub,lineHeight:1.55,padding:"10px 12px",borderRadius:8,background:`${T.amber}0D`,border:`1px solid ${T.amber}26`}}>
                  The campaign runs as normal — brief, team, roster and delivery are all open. Allocate the budget from its Brief or Financials tab when the client agrees a number; the client PO and the invoice wait until you do.
                </div>
              : /* The headline of its own screen now, so it is sized like one.
                   A 12px input asking for the number the whole campaign is
                   built on looked exactly as important as the region field two
                   steps back. The ₹ sits inside the box rather than in the
                   label, so the figure reads as money while it is being typed. */
                <div style={{position:"relative"}}>
                  <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:17,color:T.label,pointerEvents:"none",fontFamily:SF}}>₹</span>
                  <MoneyInput value={f.budget} onChange={v=>u("budget",v)} placeholder="12,50,000"
                    style={{...INP,resize:"none",padding:"13px 14px 13px 32px",fontSize:19,fontWeight:600,letterSpacing:"-0.01em"}}/>
                </div>}
            {/* Still mandatory. The toggle is the ONLY way past it — leaving it
                blank on "Set now" is an omission, and the campaign would go on
                to quote and invoice the client from it. */}
            <Req show={tried&&!f.budgetDeferred&&budgetNum<=0}>
              Mandatory field — enter the total budget, or switch to "Not agreed yet" if the client hasn't given you one.
            </Req>
          </Field>
          {/* Ordered the way the conversation happens: what is it worth, what
              do we charge on top, how much reaches creators. Absent for roles
              that don't set it (canAF) rather than shown disabled. */}
          {!f.budgetDeferred&&canAF(role)&&<AgencyFeeField base={budgetNum} pct={f.agencyFeePct} onChange={merge}/>}
          {/* Nothing to split until there is a total. Hidden rather than shown
              disabled: an empty allocation bar reads as "the creators get
              nothing", which is the opposite of what a deferred budget means. */}
          {!f.budgetDeferred&&<CreatorBudgetField
            budget={budgetNum}
            mode={f.creatorBudgetMode} pct={f.creatorBudgetPct} amount={f.creatorBudgetAmt}
            onChange={merge}/>}
          {!f.budgetDeferred&&<MoneyStack base={budgetNum} fee={agencyFee} pool={creatorBudget}
            showMargin={canFF(role)} showFee={canAF(role)}/>}
        </>}
        {step===3&&<>
          {/* The two numbers that size a campaign. Deliverables-per-creator is
              the PLAN — any single creator can be set higher on the
              Deliverables tab without changing it (see delivTargetOf). */}
          <Field label="Scope"
            hint={f.scopeDeferred?undefined:`${nCr*(nDv||1)} deliverables planned in total — individual creators can be set higher later.`}>
            {/* The same control the budget above carries, for the same reason:
                "not decided yet" is a CHOICE someone makes, so it gets a button
                that says so. It used to be expressed by typing 0 into Creators
                required — a value that reads as a decision to book nobody, next
                to a paragraph explaining that it wasn't. Only offered while the
                budget is deferred: scope and budget are agreed in the same
                conversation, and a priced campaign has to say what the price
                buys. */}
            {f.budgetDeferred&&(
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:f.scopeDeferred?0:9}}>
                <div style={SEG_WRAP}>
                  <button onClick={()=>u("scopeDeferred",false)} style={segBtn(!f.scopeDeferred)}>Set now</button>
                  <button onClick={()=>u("scopeDeferred",true)}  style={segBtn(f.scopeDeferred)}>Not decided</button>
                </div>
                {f.scopeDeferred&&<span style={{fontSize:11,color:T.label,fontFamily:SF}}>Size it later</span>}
              </div>
            )}
            {f.scopeDeferred
              ? <div style={{fontSize:10.5,color:T.sub,lineHeight:1.55,padding:"10px 12px",borderRadius:8,background:`${T.amber}0D`,border:`1px solid ${T.amber}26`}}>
                  Set the scope from the Brief tab once it's agreed. Shortlisting, locking and delivery all stay open — the roster just has no target to be complete against, so it won't auto-confirm to the client.
                </div>
              : <div style={{display:"flex",flexWrap:"wrap",gap:"12px 28px"}}>
                  <div><Lbl style={{display:"block",marginBottom:6,fontSize:8.5}}>Creators required</Lbl>
                    <Stepper value={f.numCreators} onChange={v=>u("numCreators",v)} unit={nCr===1?"creator":"creators"}/></div>
                  <div><Lbl style={{display:"block",marginBottom:6,fontSize:8.5}}>Deliverables each</Lbl>
                    <Stepper value={f.deliverablesPerCreator} onChange={v=>u("deliverablesPerCreator",v)} max={20} unit={nDv===1?"post":"posts"}/></div>
                </div>}
            <Req show={tried&&!scopeOk}>
              Mandatory field — both numbers are required, and each has to be at least 1.{f.budgetDeferred?' Switch to "Not decided" to size the campaign later.':' Switch the budget to "Not agreed yet" if the scope isn\'t settled either.'}
            </Req>
          </Field>
          <Field label="Niches" optional hint="Steers Generate towards creators in the same or similar niches. Leave empty for any niche.">
            <NicheSelect value={f.niches} onChange={v=>u("niches",v)}/>
          </Field>
          <Field label="Timeline" style={{marginBottom:0}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><Lbl style={{display:"block",marginBottom:4,fontSize:8.5}}>Start</Lbl><DateInput value={f.timelineStart} onChange={v=>u("timelineStart",v)} max={f.timelineEnd||undefined} placeholder="Start date" style={{...INP,resize:"none"}}/></div>
              <div><Lbl style={{display:"block",marginBottom:4,fontSize:8.5}}>End</Lbl><DateInput value={f.timelineEnd} onChange={v=>u("timelineEnd",v)} min={f.timelineStart||undefined} placeholder="End date" style={{...INP,resize:"none"}}/></div>
            </div>
            {f.timelineStart&&f.timelineEnd&&f.timelineEnd<f.timelineStart&&<div style={{fontSize:9.5,color:T.red,marginTop:5}}>End date must be after the start date.</div>}
            {timelineLabel&&f.timelineEnd>=f.timelineStart&&<div style={{fontSize:9.5,color:T.sub,marginTop:5}}>{timelineLabel}</div>}
            <Req show={tried&&!(f.timelineStart&&f.timelineEnd)}>
              Mandatory field — both a start and an end date are required.
            </Req>
          </Field>
        </>}
        {step===4&&<>
          {/* Everything the four steps behind you added up to. The last screen
              was one textarea, which is a strange place to be asked to commit
              without being shown what you're committing to. */}
          <div style={{display:"flex",flexWrap:"wrap",gap:"12px 26px",padding:"13px 15px",borderRadius:10,background:`${T.accent}08`,border:`1px solid ${T.accent}1F`,marginBottom:16}}>
            <Stat small label="Campaign" value={f.name||"—"}/>
            <Stat small label="Brand" value={brandLabel}/>
            {/* Three figures when a fee is charged: showing only the total
                hides the term just agreed, only the budget understates it. */}
            <Stat small label="Budget" value={f.budgetDeferred?"To be allocated":budgetNum?fmtINR(budgetNum):"—"}/>
            {!f.budgetDeferred&&agencyFee>0&&<Stat small label="Agency fee" value={`${fmtINR(agencyFee)} · ${clampPct(f.agencyFeePct)}%`}/>}
            {!f.budgetDeferred&&agencyFee>0&&<Stat small label="Client pays" value={fmtINR(clientTotal)}/>}
            <Stat small label="Scope" value={scopeSet?`${nCr} creators · ${nDv||1} each`:"To be agreed"}/>
            <Stat small label="Window" value={timelineLabel||"—"}/>
          </div>
          <Field label="Internal notes — never visible to client" optional style={{marginBottom:0}}>
            <textarea value={f.internalNotes} onChange={e=>u("internalNotes",e.target.value)} placeholder="Margin targets, context…" style={{...INP,minHeight:90,borderColor:`${T.amber}30`}}/>
          </Field>
        </>}
      </div>
      <div style={{padding:"14px 20px",borderTop:`1px solid ${T.border}`,display:"flex",gap:8,alignItems:"center"}}>
        {step>0&&<Btn variant="ghost" onClick={back}>← Back</Btn>}
        <div style={{flex:1}}/>
        {/* Deliberately NOT disabled on an incomplete step. A dead button is
            the reason nobody knew which field was missing; pressing it now
            marks them (see next / handleSubmit). Only the in-flight submit
            disables, because that one really can't be pressed twice. */}
        {step<STEPS.length-1
          ? <Btn variant="primary" onClick={next}>Next →</Btn>
          : <Btn variant="success" onClick={handleSubmit} disabled={submitting}>{submitting?"Creating…":"Create campaign"}</Btn>}
      </div>
    </motion.div>
  </div>);
}

// ── ROOT ─────────────────────────────────────────────────────────────────────
export default function InternalCampaigns(){
  const { user, brandFilter, brands: ctxBrands, refreshBrands } = useOutletContext() || {};
  const currentUser = user || { role:"am", teamId:"t7", name:"Demo" };
  const role = ["accounts_head","accounts_exec"].includes(currentUser.role) ? "accounts" : currentUser.role;
  const [campaigns,setCampaigns]=useState([]);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState(null);
  const [brands,setBrands]=useState([]);
  useEffect(()=>{ setBrands(ctxBrands||[]); },[ctxBrands]);
  const brandName = useCallback(id=>brands.find(b=>b.id===id)?.name||null,[brands]);
  // Null for a brand with no logo, so the header falls back to initials without
  // firing a request that is certain to 404 (see ClientsAPI.avatarUrl).
  const brandLogoUrl = useCallback(id=>ClientsAPI.avatarUrl(brands.find(b=>b.id===id)),[brands]);
  // Which brand's logo dialog is open, by id — resolved to the record at render
  // so it always reflects the freshest `brands` entry.
  const [logoBrandId,setLogoBrandId]=useState(null);
  const canEditBrand = can(currentUser.role,"editBrandIdentity");
  const logoBrand = logoBrandId?brands.find(b=>b.id===logoBrandId):null;
  // The updated client comes back from the PATCH, so the header re-renders with
  // the new logo (and a fresh avatarUpdatedAt, which busts the image cache)
  // without waiting for a refetch. refreshBrands keeps the shell's own copy —
  // the top-bar filter, the Summary — in step.
  const onLogoSaved = useCallback(updated=>{
    setBrands(prev=>prev.map(b=>b.id===updated.id?{...b,...updated}:b));
    refreshBrands?.();
  },[refreshBrands]);
  const onCreateBrand = useCallback(async(name)=>{
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    const created = await ClientsAPI.create({ id, name });
    const entry = { id: created.id, name: created.name };
    setBrands(prev=>[...prev,entry]);
    refreshBrands?.();
    return entry;
  },[refreshBrands]);
  useEffect(()=>{
    let cancelled=false;
    CampaignsAPI.list()
          // Legacy shapes are normalised once here, so nothing downstream sees a
          // retired 16-stage id (LEGACY_STAGE) or a creator carrying
          // `fee`/`negotiatedCost` instead of `cost` (normCreator). Nothing is
          // written back on load — mapped values persist with the next save.
          //
          // The creator half is release-safety: without it, every read of
          // `cr.cost` depends on the fee→cost migration having already run in that
          // environment. Wrong order and creator invoices render ₹0 silently,
          // because 0 is a legal cost.
      .then(data=>{ if(!cancelled){ setCampaigns(data.map(c=>({...c,stage:normStage(c.stage),creators:(c.creators||[]).map(normCreator)}))); setLoading(false); } })
      .catch(err=>{ if(!cancelled){ setLoadError(err.message); setLoading(false); } });
    return ()=>{ cancelled=true; };
  },[]);
  // Creator expenses, keyed by their derived id. The execution track's payment
  // node reads them: an expense flips to `paid` in Billing, and that is what
  // "Payment Done" means for a creator — so the campaign has to see the same
  // rows Accounts settles rather than storing a second answer of its own.
  // Silent on failure: it only softens the payment donut to "not paid yet",
  // and a billing hiccup must not stop a campaign from loading.
  const [expenses,setExpenses]=useState([]);
  useEffect(()=>{ ExpensesAPI.list().then(setExpenses).catch(()=>{}); },[]);
  const expenseById=useMemo(()=>Object.fromEntries((expenses||[]).map(e=>[e.id,e])),[expenses]);
  // Live team directory from the users collection — silent fallback to the
  // hardcoded TEAM if the API is unreachable. The state bump re-renders so
  // getM()/Team-tab dropdowns pick up the fetched names.
  const [,setTeamLoaded]=useState(false);
  useEffect(()=>{
    UsersAPI.list()
      .then(users=>{ const dir=teamFromUsers(users); if(dir.length){ TEAM_DIR=dir; setTeamLoaded(true); } })
      .catch(()=>{});
  },[]);
  const [selectedId,setSelId]=useState(null);
  const [search,setSearch]=useState("");
  const [stageFilter,setStageF]=useState("all");
  const [showCreate,setCreate]=useState(false);
  const [toast,setToast]=useState(null);
  const curRole=getR(role);
  const showToast=useCallback(msg=>{setToast(msg);setTimeout(()=>setToast(null),2800);},[]);
  const onAction=useCallback((action,data={})=>{
    let updatedCamp=null;
    // Why a gated transition refused, if it did. The guards below re-check
    // their condition and fall back to `c` unchanged — but the toast at the
    // bottom used to fire regardless, so a blocked action reported success and
    // the user was left looking at a stage that hadn't moved with no idea why.
    let blocked=null;
    setCampaigns(prev=>prev.map(c=>{
      if(c.id!==selectedId)return c;
      const addEv=(ev,actor)=>[...(c.timeline||[]),{date:today(),event:ev,actor:actor||"Ops"}];
      let next=c;
      // Staffing a slot is also the gate into execution: with a locked brief
      // already behind it, the moment all three slots are filled the campaign
      // moves itself to Team Assigned. Guarded on stage so reassigning someone
      // later can never rewind a live campaign, and the check runs against the
      // POST-assignment campaign, not `c`.
      const assign=(campKey,id,label)=>{
        const after={...c,[campKey]:id};
        const opens=normStage(c.stage)==="brief_locked"&&teamComplete(after);
        return {...after,...(opens?{stage:"team_assigned"}:{}),
          timeline:addEv(`${label} assigned: ${getM(id)?.name||id}${opens?" — team complete, execution open":""}`)};
      };
      switch(action){
        case "assign_am": next=assign("amId",data.amId,"AM");break;
        case "assign_cm": next=assign("cmId",data.cmId,"CM");break;
        case "assign_ea": next=assign("eaId",data.eaId,"EA");break;
            // Every gated transition re-checks its condition HERE as well as in
            // the UI. The reducer is the only write path, so a stale render or a
            // second tab can't push a campaign through a gate that has stopped
            // being satisfied.
            //
            // Locking the brief lands on Team Assigned directly when the team is
            // already staffed — normal, not exotic: the wizard stamps the creator
            // into their own slot, so an AM-raised campaign only needs a CM and an
            // EA, often picked before the brief is written.
        case "lock_brief": {
          const gaps=briefGaps(c);
          if(gaps.length){ blocked=`Brief incomplete — ${gaps.join(", ")} still needed`; next=c; break; }
          const staffed=teamComplete(c);
          next={...c,stage:staffed?"team_assigned":"brief_locked",briefStatus:"signed_off",
            timeline:addEv(`Brief locked${staffed?" — team already assigned, execution open":" — assign the team to open execution"}`,currentUser.name||role)};
          break;
        }
        // Deliberately does NOT copy the PO onto the campaign. client_pos is
        // the record and the timeline is the audit trail; a third copy here
        // would go stale the moment Accounts corrects the number in Billing.
        // poGaps, not rosterGap: a campaign raised without a budget also stops
        // here. The PO's amount IS the budget and the client invoice is drawn
        // from it, so recording one against a campaign with no number would
        // invent the figure the client gets billed. Re-checked in the reducer
        // like every other gate — the button is not the only way in.
        case "raise_po": next=poGaps(c).length?(blocked=`Can't record the PO — ${poGaps(c).join("; ")}`,c)
          :data.poNumber?{...c,stage:"po_raised",
          timeline:addEv(`Client PO ${data.poNumber} recorded — ${fmtINR(data.amount)}, awaiting advance`,currentUser.name||"Accounts")}:(blocked="A client PO number is required",c);break;
        case "advance_received": next={...c,stage:"advance_received",advanceReceivedOn:today(),
          timeline:addEv("Advance received from the client",currentUser.name||"Accounts")};break;
        case "raise_invoice": next={...c,stage:"invoice_raised",invoiceRaisedOn:today(),
          timeline:addEv("Client invoice issued — NET 30",currentUser.name||"Accounts")};break;
        case "payment_done": next={...c,stage:"payment_done",paidOn:today(),
          timeline:addEv("Client payment received in full",currentUser.name||"Accounts")};break;
        // The number arrives. Deliberately moves NO stage: allocating is not
        // an event on either track — it removes a blocker on the finance one.
        // A campaign sitting at Team Assigned with the roster confirmed can
        // record its PO the moment this lands, and one still in Draft carries
        // on being a draft. Anything else would let the money jump the work.
        //
        // `brief.budget` is the formatted string the CLIENT PORTAL renders,
        // kept in step here for the same reason the Brief tab's budget edit
        // keeps it in step: the portal reads the brief as authored, so a stale
        // one shows the brand the wrong figure.
        case "allocate_budget": {
          const budget=Math.max(0,parseInt(data.budget)||0);
          const creatorBudget=Math.min(Math.max(0,parseInt(data.creatorBudget)||0),budget);
          if(budget<=0){ blocked="A budget is required"; next=c; break; }
          if(!beforePO(c)){ blocked="The budget is fixed once the client PO is recorded"; next=c; break; }
          next={...c,budget,creatorBudget,brief:{...c.brief,budget:fmtINR(budget)},
            timeline:addEv(`Budget allocated — ${fmtINR(budget)} total, ${fmtINR(creatorBudget)} to creators`,currentUser.name||role)};
          break;
        }
        // Schedule change only — the stage is deliberately untouched, so
        // extending a campaign that ran long doesn't rewind its pipeline.
        case "extend_end_date": next={...c,end:data.end,timeline:addEv(
          `End date extended: ${prettyDate(c.end)||"—"} → ${prettyDate(data.end)}${data.reason?` — ${data.reason}`:""}`,
          currentUser.name||role)};break;
        default: next=c;
      }
      updatedCamp=next;
      return next;
    }));
    // DB sync — happens after setCampaigns so updatedCamp is set
    setTimeout(()=>{
      if(updatedCamp&&!blocked){
        const{id,...rest}=updatedCamp;
        CampaignsAPI.update(id,rest).catch(()=>showToast("Save failed — check connection"));
        // Billing side effects. Non-blocking by design: the campaign's stage is
        // the source of truth for the pipeline, so a failed billing write must
        // never hold it up. Non-blocking is not the same as silent, though —
        // these used to swallow every error, so a backend hiccup at sign-off or
        // PO left no quote and no invoice, the stage moved anyway, and nobody
        // found out until the books were reconciled. `warn` says so instead.
        const warn=what=>()=>showToast(`${what} — campaign moved, but the record wasn't created. Retry from Billing.`);
        // The quote carries the campaign's real numbers rather than the
        // invented percentages the old auto-quote used. Margin is one
        // percentage because that is quoteMargin()'s shape, and it resolves
        // back to the campaign's own split: margin = budget − creator pool,
        // ops = pool.
        //
        // `updatedCamp`, not `next` — `next` is scoped to the setCampaigns
        // updater, so reading it here threw and the lock silently raised no
        // quote at all. Only visible by walking the UI.
        //
        // TWO triggers, one definition. A quote needs a locked brief AND a
        // budget, and those no longer arrive together: a campaign raised
        // without a number locks its brief with nothing to quote, and the
        // quote falls due later, when the number does. Whichever of the two
        // lands second raises it, and `note` says which that was.
        //
        // Create-or-nothing rather than create-or-update: QT-<id> is derived
        // from the campaign, so a second call after both paths fire is a
        // duplicate-key 409 rather than a second quote. `warn` reports the
        // genuine failures; a 409 only means the quote already exists, which
        // is the outcome we wanted.
        const raiseQuote=note=>{
          const budget=updatedCamp.budget||0, pool=creatorBudgetOf(updatedCamp)||0;
          if(budget<=0||!briefLocked(updatedCamp)) return;
          QuotesAPI.create({
            id:`QT-${id}`, campaignId:id, client:updatedCamp.client||"",
            brandId:updatedCamp.brandId||null,
            label:`${updatedCamp.name} — Quote`, status:"pending_review",
            createdDate:today(), validTill:addDays(today(),30),
            marginPct: Math.round(((budget-pool)/budget)*1000)/10,
            agencyFeePct:0, agencyFeeType:"baked_in", isRetainerClient:false,
            lines:[{desc:`Influencer Marketing — ${updatedCamp.name}`,sac:"998361",qty:1,rate:budget,gstRate:18}],
            notes:note,
            // 409 is the duplicate-id response (lib/api.js sets `status`), and
            // it means the quote is already there — which is the outcome this
            // wanted. Branching on the status rather than the message, because
            // the message is prose and prose gets reworded.
          }).catch(err=>{ if(err?.status!==409) warn("Quote not raised")(); });
        };
            // The lock is where the commercials stop being a draft — budget and
            // creator split agreed, brief frozen. That is what a quote is.
        if(action==="lock_brief")
          raiseQuote("Raised when the brief was locked. Review and send before recording the client's PO.");
            // The other order: brief locked long ago with no number to quote,
            // and the client has just given one. Without this the quote was
            // never raised at all — the lock's `budget>0` guard had already
            // declined, and nothing came back to it.
        if(action==="allocate_budget")
          raiseQuote("Raised when the budget was allocated — the brief was locked before the client agreed a number. Review and send before recording the client's PO.");
        if(action==="raise_po"&&data.poNumber){
          const poId=`CPO-${id}`;
          ClientPOsAPI.create({id:poId,poNumber:data.poNumber,amount:data.amount,
            receivedDate:data.receivedDate,document:"recorded",
            client:updatedCamp.client||"",brandId:updatedCamp.brandId||null,
            campaign:id,campaignName:updatedCamp.name||"",closed:false}).catch(warn("Client PO not recorded"));
          // The invoice is raised HERE, not at campaign creation — a client PO
          // is the authorisation to bill, so this is the first point there is
          // anything to invoice against. `dueDate` is a real ISO date (NET 30),
          // which is what finally lets an invoice go overdue.
          //
          // Create-or-link: campaigns that predate this already carry an
          // `INV-AUTO-*` stub, so an existing invoice is linked rather than
          // duplicated.
          const budget=updatedCamp.budget||0, half=Math.round(budget*0.5);
          InvoicesAPI.list().then(list=>{
            const inv=list.find(i=>i.campaign===id&&i.type==="campaign");
            if(inv) return InvoicesAPI.update(inv.id,{clientPO:{id:poId},
              ...(ISO_DATE.test(inv.dueDate||"")?{}:{dueDate:addDays(today(),30)})});
            return InvoicesAPI.create({
              id:`INV-${id}`, client:updatedCamp.client||"", clientId:updatedCamp.brandId,
              brandId:updatedCamp.brandId||null, campaign:id, type:"campaign",
              label:`${updatedCamp.name} — Campaign Invoice`,
              amount:budget, gstRate:18,
              raisedDate:today(), dueDate:addDays(today(),30), status:"pending",
              isRetainerClient:false, clientPO:{id:poId},
              schedule:{type:"advance_final",
                advance:{pct:50,amount:half,status:"pending"},
                final:{pct:50,amount:budget-half,status:"pending"}},
              gstin:"", sac:"998361", placeOfSupply:"",
              confirmedByAccounts:false, confirmedByFounder:false,
            });
          }).catch(warn("Invoice not raised"));
        }
        // The last three finance steps all land on the SAME invoice — the one
        // the client PO authorised — so they share one read-modify-write.
        // Read-modify-write rather than a blind overwrite because the schedule
        // may have been edited in Billing since the invoice was created, and
        // an overwrite would silently undo that.
        const INVOICE_PATCH={
          // Settle the advance leg only. The invoice stays `pending` until the
          // final leg lands, so Outstanding keeps reporting what's still owed.
          advance_received: inv => inv.schedule?.advance
            ? {schedule:{...inv.schedule,advance:{...inv.schedule.advance,status:"paid",paidDate:today()}}}
            : null,
          // Issuing the invoice restarts the receivables clock. The document
          // has existed since the PO (that's what authorised the billing), but
          // NET 30 runs from the day it actually goes to the client — dating it
          // from the PO is what made invoices read overdue before anyone had
          // asked to be paid.
          raise_invoice: () => ({raisedDate:today(), dueDate:addDays(today(),30)}),
          // Paid in full: the invoice closes and EVERY outstanding leg closes
          // with it, so Collected and Outstanding agree with the stage.
          //
          // This used to settle `final` alone. A campaign that reached Payment
          // Done without anyone having stepped through Advance Received — the
          // common case when the client pays in one go — was left reading
          // "PAID" in the header with "Advance (50%) PENDING" underneath it:
          // the same invoice disagreeing with itself on the same screen.
          // receivedOf() already treats a paid invoice as fully collected, so
          // the money was right and only the record was wrong, which is the
          // kind of discrepancy that costs an afternoon to chase.
          payment_done: inv => ({
            status:"paid", paidDate:today(),
            ...(inv.schedule?{schedule:settleSchedule(inv.schedule,today())}:{}),
          }),
        };
        if(INVOICE_PATCH[action]){
          const label={advance_received:"Advance not settled",raise_invoice:"Invoice not issued",payment_done:"Payment not recorded"}[action];
          InvoicesAPI.list().then(list=>{
            const inv=list.find(i=>i.campaign===id&&i.type==="campaign");
            if(!inv) return;
            const patch=INVOICE_PATCH[action](inv);
            if(patch) return InvoicesAPI.update(inv.id,patch).catch(warn(label));
          }).catch(warn(label));
        }
      }
    },0);
    showToast(blocked||ACTION_MSGS[action]||action);
  },[selectedId,showToast,role,currentUser]);
  // Double-check gate: stage-changing actions go through a confirmation modal
  // before onAction applies (and persists) anything. Pure assignments skip it.
  const [pendingAction,setPendingAction]=useState(null); // {action,data}
  const requestAction=useCallback((action,data={})=>{
    if(!needsConfirm(action)){onAction(action,data);return;}
    setPendingAction({action,data});
  },[onAction]);
  const onSaveBrief=useCallback(patch=>{setCampaigns(prev=>prev.map(c=>c.id!==selectedId?c:{...c,brief:{...c.brief,...patch}}));CampaignsAPI.update(selectedId,{brief:{...(campaigns.find(c=>c.id===selectedId)?.brief||{}),...patch}}).catch(()=>showToast("Save failed — check connection"));showToast("Brief updated");},[selectedId,showToast,campaigns]);
  // Appends an audit entry to the selected campaign's timeline and persists it.
  const onLogTimeline=useCallback(event=>{
    const entry={date:today(),event,actor:currentUser.name||role};
    let nextTimeline=null;
    setCampaigns(prev=>prev.map(c=>{
      if(c.id!==selectedId)return c;
      nextTimeline=[...(c.timeline||[]),entry];
      return{...c,timeline:nextTimeline};
    }));
    if(nextTimeline)CampaignsAPI.update(selectedId,{timeline:nextTimeline}).catch(()=>showToast("Save failed — check connection"));
  },[selectedId,currentUser,role,showToast]);
  // Campaign-level patch (creatorBudget from the Brief tab). onSaveBrief only
  // touches brief{}; this writes fields that live on the campaign itself.
  const onSaveCampaign=useCallback(patch=>{
    // The roster gate reads `numReq`, which the Scope field can change — so
    // editing the plan down to what's already locked confirms the roster just
    // as surely as locking the last creator does. Without this the PO unlocked
    // but the client was never sent the list and nothing was logged, and the
    // Creators tab showed neither the countdown nor the "sent" badge.
    // Same derivation as onUpdateCreators, from the other direction.
    const camp=campaigns.find(c=>c.id===selectedId);
    const next=camp&&{...camp,...patch};
    const sending=!!next&&!camp.sentToClient&&rosterReady(next);
    const full=sending?{...patch,sentToClient:true}:patch;
    setCampaigns(prev=>prev.map(c=>c.id!==selectedId?c:{...c,...full}));
    CampaignsAPI.update(selectedId,full).catch(()=>showToast("Save failed — check connection"));
    showToast("Campaign updated");
    if(sending){
      showToast(`Roster complete — creator list sent to ${camp.client||"client"}`);
      onLogTimeline(`Roster confirmed — ${lockedCountOf(next)} creators locked, creator list sent to client`);
    }
  },[selectedId,showToast,campaigns,onLogTimeline]);
  const onUpdateCreators=useCallback(next=>{
    // Resolved before the state update, not inside it: React state updaters
    // must be pure, and StrictMode double-invokes them in development — which
    // would fire every expense POST twice.
    const camp=campaigns.find(c=>c.id===selectedId);
    // Sending the roster to the client is no longer an action someone takes —
    // it's a consequence of the roster being finished. Derived here rather than
    // on the Creators tab because a creator can be locked from more than one
    // place, and the rule should hold whichever one did it. Fires once: the
    // flag is already true on every save after this one.
    const sending=!!camp&&!camp.sentToClient&&rosterReady(camp,next);
    const patch={creators:next,...(sending?{sentToClient:true}:{})};
    setCampaigns(prev=>prev.map(c=>c.id!==selectedId?c:{...c,...patch}));
    CampaignsAPI.update(selectedId,patch).catch(()=>showToast("Save failed — check connection"));
    if(camp)syncCreatorExpenses(camp,camp.creators,next,()=>showToast("Creator cost saved, but Billing wasn't updated — check connection"));
    // Re-read the expenses the sync just wrote, so the Creator Payment donut
    // moves with the roster instead of waiting for a page reload.
    if(camp)ExpensesAPI.list().then(setExpenses).catch(()=>{});
    if(sending){
      showToast(`Roster complete — creator list sent to ${camp.client||"client"}`);
      onLogTimeline(`Roster confirmed — ${next.filter(isLockedCreator).length} creators locked, creator list sent to client`);
    }
  },[selectedId,showToast,campaigns,onLogTimeline]);
  const onDeleteCampaign=useCallback(async(id)=>{
    if(!can(role,"deleteCampaign"))return;
    try{
      // backend soft-deletes (deleted:true) and logs the actor on the timeline
      await CampaignsAPI.remove(id,currentUser.name||role);
      setCampaigns(prev=>prev.filter(c=>c.id!==id));
      setSelId(null);
      showToast("Campaign deleted");
      // Cascade: purge every billing doc that references this campaign, so
      // Billing stops showing a campaign that no longer exists. All five
      // collections, keyed the same way (`campaign`) except quotes.
      //
      // Two of these are load-bearing rather than cosmetic. Expenses and
      // VENDOR POs are the ones Billing does not hide on its own, so an orphan
      // of either keeps inflating committed spend, the approval queue and the
      // derived registry forever — a deleted campaign's vendor PO sat in
      // Purchase Orders → To vendors with nothing left to reconcile it against.
      try{
        const [invs,cpos,exps,qts,pos]=await Promise.all([
          InvoicesAPI.list(),ClientPOsAPI.list(),ExpensesAPI.list(),QuotesAPI.list(),PurchaseOrdersAPI.list()]);
        const forCamp=(rows,key="campaign")=>(rows||[]).filter(x=>x[key]===id);
        await Promise.all([
          ...forCamp(invs).map(x=>InvoicesAPI.remove(x.id)),
          ...forCamp(cpos).map(x=>ClientPOsAPI.remove(x.id)),
          ...forCamp(exps).map(x=>ExpensesAPI.remove(x.id)),
          ...forCamp(pos).map(x=>PurchaseOrdersAPI.remove(x.id)),
          // Quotes key on `campaignId`, not `campaign` like the rest.
          ...forCamp(qts,"campaignId").map(x=>QuotesAPI.remove(x.id)),
        ]);
      }catch{/* best-effort — Billing also hides docs whose campaign is gone */}
    }catch{
      showToast("Delete failed — check connection");
    }
  },[role,showToast,currentUser]);
  const onCreate=useCallback(f=>{
    if(!canCreate(role))return;
    // Stamp the correct role slot with the logged-in user's teamId
    const amId  = (role==="am"||role==="founder") ? currentUser.teamId : null;
    const cmId  = (role==="cm"||role==="pcm")     ? currentUser.teamId : null;
    const eaId  = role==="ea"                      ? currentUser.teamId : null;
    // Stable slug ID — readable, collision-resistant, matches billing references
    const slug = f.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,24);
    const campId = `camp_${slug}_${Date.now().toString(36)}`;
    // NULL, not 0, when the wizard deferred the budget — the whole distinction
    // this feature rests on. See hasBudget in lib/campaign.js.
    const deferred = f.budget===null||f.budgetDeferred;
    const budget = deferred ? null : (parseInt(f.budget)||0);
    const c={
      id:campId, name:f.name, client:brandName(f.brandId)||"", brandId:f.brandId, service:f.service,
      region:f.region||"TBD", niches:f.niches||[], stage:"draft",
      budget, creatorBudget:deferred?null:Math.min(f.creatorBudget||0,budget),
      // `budget` above is base + fee. These record which half was the fee, so
      // nothing has to infer it from a total (lib/campaign.js agencyFeeOf).
      agencyFee:deferred?null:(parseInt(f.agencyFee)||0),
      agencyFeePct:deferred?null:(parseFloat(f.agencyFeePct)||0),
      // NULL when the scope was explicitly deferred. `|| 5` used to sit here,
      // and it is where the invented count was born: nothing in the form said
      // "not decided", so an absent answer became five creators that the
      // campaign then measured itself against for the rest of its life.
      // `deliverablesPerCreator` still falls back to 1 — an unset plan has
      // always meant one post each, and the client portal reads it the same
      // way (portalMetrics.perCreatorDeliverables), so nulling it here would
      // put the two apps into disagreement.
      numReq:f.scopeDeferred?null:(parseInt(f.numCreators)||null),
      deliverablesPerCreator:f.scopeDeferred?null:(parseInt(f.deliverablesPerCreator)||1),
      start:f.timelineStart||today(), end:f.timelineEnd||"TBD",
      createdBy:currentUser.teamId,
      amId, cmId, eaId,
      // `brief.budget` is the formatted string the CLIENT PORTAL renders. Left
      // null rather than "—" so the portal decides how to say "not agreed yet"
      // in its own voice instead of inheriting an em dash from here.
      brief:{objective:f.objective,audience:f.audience,messages:f.messages,deliverables:f.deliverables,budget:deferred?null:fmtINR(budget),timeline:timelineLabel(f.timelineStart,f.timelineEnd)},
      briefStatus:"draft", amNote:"", cmNote:"", creators:[], genRounds:0,
      sentToClient:false, internalNotes:f.internalNotes,
      // The deferral is stated on the timeline at creation. Nothing else
      // records that it was a decision rather than an omission, and the person
      // who picks the campaign up a week later needs to know which it was.
      timeline:[{date:today(),event:"Campaign created",actor:currentUser.name||role.toUpperCase()},
        ...(deferred?[{date:today(),event:"Raised without a budget — to be allocated once the client agrees a number",actor:currentUser.name||role.toUpperCase()}]:[])],
    };
    // Save campaign
    CampaignsAPI.create(c).catch(()=>showToast("Save failed — check connection"));
    // No billing document is raised here. Each one is created at the point the
    // thing it records actually happens — brief signed off → Quote, client PO
    // recorded → Invoice (with a real NET-30 due date). See the brief_complete
    // and raise_po side effects in onAction.
    setCampaigns(p=>[c,...p]);setSelId(c.id);setCreate(false);showToast("Campaign created");
  },[showToast,role,currentUser,brandName]);
  // Two steps, deliberately. `inScope` is everything this person is allowed to
  // see under the current brand and search — that is what the view counts are
  // measured against, so picking a view never rewrites the other five numbers.
  // `visible` is that list narrowed to the chosen view, and is what renders.
  //
  // Sorted newest-first here rather than in the list, so the order the board
  // shows is the order the detail view's prev/next walks — and so a campaign
  // created a minute ago is the first thing on the page. See createdAtOf for
  // what stands in for the createdAt the documents don't carry.
  const inScope=useMemo(()=>campaigns.filter(c=>{
    if(!canSee(c,role,currentUser.teamId))return false;
    if(brandFilter&&c.brandId!==brandFilter)return false;
    if(search){const s=search.toLowerCase();if(!c.name.toLowerCase().includes(s)&&!c.client.toLowerCase().includes(s))return false;}
    return true;
  }).sort((a,b)=>createdAtOf(b)-createdAtOf(a)),[campaigns,role,currentUser.teamId,search,brandFilter]);
  const viewCounts=useMemo(()=>Object.fromEntries(VIEWS.map(v=>[v.id,inScope.filter(v.match).length])),[inScope]);
  const visible=useMemo(()=>{
    const view=VIEWS.find(v=>v.id===stageFilter)||VIEWS[0];
    return inScope.filter(view.match);
  },[inScope,stageFilter]);
  // Selection must respect the active filters — resolve against `visible`, not
  // `campaigns`, or the detail panel (and its Creators tab) keeps showing a
  // campaign from another brand after the brand filter changes.
  const selected=visible.find(c=>c.id===selectedId)||null;
  // Grid-first drill-in: a selection only ever gets *cleared* (back to the
  // grid) when it drops out of the active filters — it's never replaced with
  // another campaign automatically, since that'd be jarring in a full
  // drill-in view (contrast with the old sidebar, where auto-picking a
  // fallback made sense because the grid stayed visible alongside it).
  useEffect(()=>{
    if(!loading&&selectedId&&!visible.some(c=>c.id===selectedId)) setSelId(null);
  },[loading,visible,selectedId]);
  const selIndex=selected?visible.findIndex(c=>c.id===selectedId):-1;
  const hasPrev=selIndex>0, hasNext=selIndex>=0&&selIndex<visible.length-1;
  const goPrev=useCallback(()=>{if(selIndex>0)setSelId(visible[selIndex-1].id);},[selIndex,visible]);
  const goNext=useCallback(()=>{if(selIndex>=0&&selIndex<visible.length-1)setSelId(visible[selIndex+1].id);},[selIndex,visible]);
  // Both counts come off the same table as every other view, so the notice and
  // the bar can never disagree about how many campaigns have ended.
  const endedCount=viewCounts.ended||0;
  // Remembers the count it was dismissed at, so the notice returns when another
  // campaign ends rather than staying hidden forever after one dismissal.
  const [noticeAck,setNoticeAck]=useState(-1);
  const showEndedNotice=stageFilter==="ended"&&endedCount>0&&noticeAck!==endedCount;
  if(loading)return(<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",background:"#F5F5F7",fontFamily:SF,fontSize:13,color:"#6E6E73"}}>Loading campaigns…</div>);
  if(loadError)return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",background:"#F5F5F7",fontFamily:SF,fontSize:13,gap:8,color:"#6E6E73"}}><div>Couldn't reach the campaigns API.</div><div style={{fontSize:11,color:"#86868B"}}>{loadError}</div></div>);
  return(<div style={{display:"flex",flexDirection:"column",height:"100%",background:"#F5F5F7",fontFamily:SF,color:"#1D1D1F",overflow:"hidden"}}>
    {/* Toast */}
    {toast&&<div style={{position:"fixed",bottom:24,right:24,zIndex:9999,padding:"11px 18px",background:"rgba(29,29,31,0.92)",backdropFilter:"blur(16px)",borderRadius:12,fontSize:12,color:"#FFFFFF",fontFamily:SF,boxShadow:"0 8px 32px rgba(0,0,0,0.24)",letterSpacing:"-0.01em"}}>{toast}</div>}
    <AnimatePresence mode="wait">
      {selected ? (
        <Detail key={selected.id} camp={selected} role={role} currentUser={currentUser} expenseById={expenseById} onAction={requestAction} onSaveBrief={onSaveBrief} onSaveCampaign={onSaveCampaign}
          onUpdateCreators={onUpdateCreators} onDelete={onDeleteCampaign} onLogTimeline={onLogTimeline}
          onBack={()=>setSelId(null)} onPrev={goPrev} onNext={goNext} hasPrev={hasPrev} hasNext={hasNext}/>
      ) : (
        <motion.div key="grid" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.18}}
          style={{display:"flex",flexDirection:"column",flex:1,minHeight:0,overflow:"hidden"}}>
          {/* Header */}
          <div style={{padding:"20px 24px 0",borderBottom:"1px solid rgba(0,0,0,0.07)",flexShrink:0,background:"#FFFFFF"}}>
            {/* What this page IS and the controls that act on the whole of it,
                then the view rail sitting on the header's bottom border. Search
                rides up here with the create button rather than holding a band
                of its own — it narrows what the rail counts, but it is one field,
                not a row of chrome. */}
            <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:16,marginBottom:14}}>
              <div style={{minWidth:0}}>
                <h1 style={{fontFamily:"'Newsreader',serif",fontSize:21,fontWeight:600,color:"#1D1D1F",margin:0,fontStyle:"italic",letterSpacing:"-0.02em"}}>IM Campaigns</h1>
                <div style={{fontSize:10.5,color:"#86868B",fontFamily:SF,marginTop:3}}>5th Avenue · Influencer Marketing</div>
              </div>
              <div style={{flex:1,minWidth:16}}/>
              {/* White on a hairline — the same material as every card on the
                  board below, rather than a grey fill belonging to nothing. */}
              <div style={{position:"relative",flexShrink:0,width:280}}>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search campaigns or clients…"
                  style={{width:"100%",height:36,padding:"0 12px 0 33px",borderRadius:10,background:"#FFFFFF",
                    border:"1px solid rgba(0,0,0,0.10)",color:"#1D1D1F",fontSize:12,fontFamily:SF,
                    outline:"none",boxSizing:"border-box"}}/>
                <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",
                  display:"flex",pointerEvents:"none"}}>
                  <ViewIcon id="search" color="#A0A0A6"/>
                </span>
              </div>
              {/* Says what it makes. "+ New" on its own left the one button on
                  the page to be read off its position. */}
              {canCreate(role)&&<Btn variant="primary" onClick={()=>setCreate(true)} style={{flexShrink:0,padding:"10px 17px",fontSize:12}}>+ New campaign</Btn>}
            </div>
            <ViewBar counts={viewCounts} value={stageFilter} onChange={setStageF}/>
          </div>
          {/* Ended-tab notice */}
          <AnimatePresence initial={false}>
            {showEndedNotice&&<EndedNotice key="ended-notice" count={endedCount} onDismiss={()=>setNoticeAck(endedCount)}/>}
          </AnimatePresence>
          {/* Grid */}
          <div style={{flex:1,minHeight:0,overflowY:"auto"}}>
            <CampaignList campaigns={visible} role={role} onSelect={setSelId} brandName={brandName} brandLogoUrl={brandLogoUrl} onEditLogo={canEditBrand?setLogoBrandId:undefined} brandFilter={brandFilter}/>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    <AnimatePresence>
      {showCreate&&<CreateModal onClose={()=>setCreate(false)} onSubmit={onCreate} brands={brands} onCreateBrand={onCreateBrand} role={role} brandFilter={brandFilter}/>}
    </AnimatePresence>
    {logoBrand&&(
      <BrandLogoModal brand={logoBrand} onClose={()=>setLogoBrandId(null)} onSaved={onLogoSaved}/>
    )}
    <AnimatePresence>
      {pendingAction&&selected&&<ConfirmActionModal camp={selected} label={ACTION_MSGS[pendingAction.action]||pendingAction.action}
        onConfirm={()=>{onAction(pendingAction.action,pendingAction.data);setPendingAction(null);}}
        onCancel={()=>setPendingAction(null)}/>}
    </AnimatePresence>
  </div>);
}