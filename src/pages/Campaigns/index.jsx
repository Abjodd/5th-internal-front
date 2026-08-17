/**
 * 5th Avenue — Internal Operations: Campaigns  · VERSION V5
 * ──────────────────────────────────────────────────────────
 * V5 Changes:
 *  1. Add Creator → custom pop-up form (Name, Platform, Handle required;
 *     Phone, Niche, Followers, Avg Likes, Avg ER optional). No DB lookup.
 *  2. Payment Details column — Type (To Vendor / Net Banking) + ID. 🔒 internal.
 *  3. Roles: Founder · BM · CM · EA · Accounts. PCM-P/C removed.
 *  4. Senior EA / EA / Junior EA = job titles on TEAM, single "ea" role.
 *  5. Accounts Team → placeholder for dedicated view (next build).
 *  6. CM not auto-assigned → BM selects from fixed dropdown in Team tab.
 *  7. Deliverables tab → aggregate stat cards (Views, Likes, CPV, ER, Avg Forwards).
 *  8. Fee input step = 100.
 */
 import { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect, forwardRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useOutletContext } from "react-router-dom";
import { motion, AnimatePresence, useSpring, useMotionValueEvent, useReducedMotion } from "motion/react";
import { CampaignsAPI, InstagramAPI, YouTubeAPI, PostMetricsAPI, InvoicesAPI, ExpensesAPI, ClientPOsAPI, PurchaseOrdersAPI, QuotesAPI, ClientsAPI, InvoicePdfAPI, UsersAPI } from "../../lib/api";
import { can } from "../../lib/rbac";
import { validateCreatorDetails, requiredForPayType, validateField, sanitizeField } from "../../lib/validators";
import { fmtCompact, fmtINR, prettyDate, initials, ISO_DATE, todayISO } from "../../lib/format";
import { useBrandAccent } from "../../lib/brandAccent";
import { creatorBudgetOf, numReqOf, perCreatorOf, costOf, normCreator, creatorExpensePlan, isLockedCreator,
         PIPELINE, PL_IDS, COMMON_STAGES, FIN_STAGES, EXEC_STAGES, EXEC_NODES,
         normStage, stageIdx, extUrl, rosterReady, rosterGap, lockedCountOf,
         perCreatorDelivOf, delivTargetOf, totalDelivOf, liveLinksOf, withLiveLinks, delivDoneOf,
         teamComplete, briefLocked, assetIn, execStats, execDone, briefGaps, executionStageOf,
         expenseIdFor, CREATOR_PAY_STATUSES, creatorPayStatusOf, creatorPayStats } from "../../lib/campaign";
import MoneyInput from "../../components/MoneyInput";
import DateInput from "../../components/DateInput";
import PhoneInput from "../../components/PhoneInput";
import BrandPicker from "../../components/BrandPicker";
import BrandLogoModal from "../../components/BrandLogoModal";
import { zoomOf } from "../../lib/zoom";
import CreatorHandle from "../../components/CreatorHandle";
import Donut from "../../components/Donut";

// ── TOKENS ───────────────────────────────────────────────────────────────────
import { T as BASE_T, DARK_SURFACE } from "../../theme/tokens";

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
//
// One hint per node across BOTH tracks, since the header renders them side by
// side. Each says what is being waited on and who does it — a node the reader
// can't act on should still tell them whose move it is.
const STAGE_HINT = {
  draft:            "Fill the brief in and lock it — Founder or PCM signs it off",
  brief_locked:     "Brief locked — assign the Account Manager, Category Manager and Exec Associate",
  team_assigned:    "Team on the campaign — execution can start and the client PO can be recorded",
  // Finance
  po_raised:        "Client PO recorded — awaiting the advance payment",
  advance_received: "Advance received — raise the final invoice when delivery is done",
  invoice_raised:   "Invoice issued to the client — awaiting payment",
  payment_done:     "Client has paid in full — the campaign is settled",
  // Execution
  execution:        "Creators locked, scripting, shooting and going live",
  creator_payment:  "Every creator is live — invoice them and settle their fees",
};

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
const CR_JOURNEY = [
  {id:"shortlisted",label:"Shortlisted",neg:false},{id:"reached_out",label:"Reached Out",neg:false},
  {id:"negotiating",label:"Negotiating",neg:false},{id:"locked",label:"Locked",neg:false},
  {id:"backed_off",label:"Backed Off",neg:true},{id:"backup",label:"Backup",neg:false},
  {id:"brand_reject",label:"Brand Reject",neg:true},
];
const CR_COLOR = { shortlisted:T.label,reached_out:T.accent,negotiating:T.amber,locked:T.green,backed_off:T.red,backup:T.purple,brand_reject:T.red };
const REMOVE_REASONS = [
  {id:"bad_gen",label:"Bad Generation",desc:"Auto-generated — not a good fit"},
  {id:"brand_reject",label:"Brand Reject",desc:"Informally communicated by the brand"},
  {id:"backed_off",label:"Backed Off",desc:"Creator declined or unresponsive"},
];
const PAYMENT_TYPES = [{id:"",label:"— Select —"},{id:"vendor",label:"To Vendor"},{id:"net_banking",label:"Net Banking"},{id:"upi",label:"UPI"}];
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
const NICHE_SIMILAR = {
  Food:      ["Food","Cooking"],
  Cooking:   ["Cooking","Food"],
  Fitness:   ["Fitness","Lifestyle"],
  Lifestyle: ["Lifestyle","Fashion","Beauty","Travel"],
  Beauty:    ["Beauty","Fashion","Lifestyle"],
  Fashion:   ["Fashion","Beauty","Lifestyle"],
  Travel:    ["Travel","Lifestyle"],
  Tech:      ["Tech","Gaming"],
  Gaming:    ["Gaming","Tech"],
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

// Creators whose niche shares an audience with ANY niche the campaign picked.
const nicheMatches = (campNiches, creatorNiche) => {
  if (!campNiches?.length) return true; // no niche picked → don't filter
  return campNiches.some(n => (NICHE_SIMILAR[n] || [n]).includes(creatorNiche));
};
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
  {key:"status",label:"Status",cv:true,w:120},
  // Concept/Demo deliberately absent: this table is the shortlist, and an
  // asset status is meaningless before the creator is locked. Both live on the
  // Deliverables tab, which only renders locked creators.
  {key:"cost",label:"Cost",cv:false,w:90},{key:"payType",label:"Pay Type",cv:false,w:110},
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

// ── CREATOR DB (used only by Generate) ───────────────────────────────────────
const CREATOR_DB = [
  {id:"c001",name:"Anjali Kitchen",   handle:"@anjalikitchen",  platform:"Instagram",niche:"Cooking",  followers:"820K",  avgLikes:"32K",avgER:4.2, cost:85000 },
  {id:"c002",name:"South Foodie",     handle:"@southfoodie",    platform:"YouTube",  niche:"Food",     followers:"1.2M",  avgLikes:"58K",avgER:5.1, cost:180000},
  {id:"c003",name:"Taste of Madras",  handle:"@tasteofmadras",  platform:"Instagram",niche:"Food",     followers:"540K",  avgLikes:"18K",avgER:3.8, cost:65000 },
  {id:"c004",name:"Foodie Hyderabad", handle:"@foodiehyd",      platform:"Instagram",niche:"Lifestyle",followers:"380K",  avgLikes:"16K",avgER:4.5, cost:50000 },
  {id:"c005",name:"Kerala Food Tales",handle:"@keralafood",     platform:"YouTube",  niche:"Cooking",  followers:"290K",  avgLikes:"16K",avgER:6.1, cost:40000 },
  {id:"c006",name:"Mumbai Munchies",  handle:"@mumbaimunch",    platform:"Instagram",niche:"Food",     followers:"95K",   avgLikes:"6.5K",avgER:7.2,cost:18000 },
  {id:"c007",name:"Delhi Diaries",    handle:"@delhidiaries",   platform:"Instagram",niche:"Lifestyle",followers:"78K",   avgLikes:"5K", avgER:6.8, cost:15000 },
  {id:"c008",name:"Chef Kabira",      handle:"@chefkabira",     platform:"YouTube",  niche:"Cooking",  followers:"650K",  avgLikes:"30K",avgER:4.9, cost:90000 },
  {id:"c009",name:"Fit Freaks IN",    handle:"@fitfreaksin",    platform:"Instagram",niche:"Fitness",  followers:"120K",  avgLikes:"6K", avgER:5.5, cost:22000 },
  {id:"c010",name:"Goa Vibes",        handle:"@goavibes",       platform:"Instagram",niche:"Lifestyle",followers:"32K",   avgLikes:"2.8K",avgER:9.2,cost:8000  },
  {id:"c011",name:"Bong Kitchen",     handle:"@bongkitchen",    platform:"YouTube",  niche:"Cooking",  followers:"420K",  avgLikes:"17K",avgER:4.4, cost:55000 },
  {id:"c012",name:"Pune Palate",      handle:"@punepalate",     platform:"Instagram",niche:"Food",     followers:"67K",   avgLikes:"5K", avgER:8.1, cost:12000 },
  {id:"c013",name:"Coastal Kitchen",  handle:"@coastalkitchen", platform:"YouTube",  niche:"Cooking",  followers:"510K",  avgLikes:"25K",avgER:5.3, cost:72000 },
  {id:"c014",name:"Hyderabad Hunger", handle:"@hydhunger",      platform:"Instagram",niche:"Food",     followers:"41K",   avgLikes:"4K", avgER:10.4,cost:9000  },
];

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
  igFetched: src.igFetched || null, // raw auto-fetched snapshot (bio, posts, fetchedAt, etc.)
  status:   "shortlisted",
  state:    src.state   || null,
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

// ── SEED DATA ────────────────────────────────────────────────────────────────
// const INIT_CAMPS = [
//   {
//     id:"c1",name:"Diwali Festive Push",client:"FreshBite Foods",
//     service:"Influencer Marketing",region:"South India",
//     stage:"execution",progress:62,budget:1250000,creatorBudget:750000,numReq:5,
//     start:"Mar 1",end:"Apr 30",amId:"t7",cmId:"t1",eaId:"t3",
//     brief:{objective:"Build festive awareness across South India for FreshBite's new snack range.",
//       audience:"18–35 in TN, KA, KL, TS.",messages:"FreshBite — the festive snack companion.",
//       deliverables:["Reel — Collab","Reel — Non-Collab","Story"],budget:"₹12.5L",timeline:"6 weeks"},
//     briefStatus:"locked",amNote:"",cmNote:"Focus on authentic home-cook aesthetic.",
//     creators:[
//       {...mkCreator(CREATOR_DB[0],85000), status:"locked",   payType:"vendor",     payId:"VND-1042",
//         concept:{status:"approved",fileLink:"https://drive.google.com/file1"},
//         demo:{status:"locked",fileLink:"https://drive.google.com/demo1"},
//         live:{postUrl:"https://instagram.com/p/abc1",postedDate:"Apr 12"},
//         tracking:{views:480000,likes:21000,comments:980,forwards:3200,commentAnalysis:"Very positive. Users tagging friends.",positivityScore:88,lastFetched:"May 2 09:14"}},
//       {...mkCreator(CREATOR_DB[1],180000),status:"negotiating",payType:null,payId:null,
//         concept:{status:"received",fileLink:"https://drive.google.com/file2"},
//         demo:{status:"yet_to_receive",fileLink:null},live:{postUrl:null,postedDate:null},
//         tracking:{views:null,likes:null,comments:null,forwards:null,commentAnalysis:null,positivityScore:null,lastFetched:null}},
//       {...mkCreator(CREATOR_DB[3],50000), status:"reached_out",payType:null,payId:null,
//         concept:{status:"yet_to_receive",fileLink:null},demo:{status:"yet_to_receive",fileLink:null},
//         live:{postUrl:null,postedDate:null},
//         tracking:{views:null,likes:null,comments:null,forwards:null,commentAnalysis:null,positivityScore:null,lastFetched:null}},
//     ],
//     genRounds:1,sentToClient:true,
//     internalNotes:"Creator budget ₹7.5L. Keep pricing tight.",
//     timeline:[
//       {date:"Feb 20",event:"Campaign submitted by client",actor:"Client"},
//       {date:"Feb 25",event:"Brief locked by client",actor:"Client"},
//       {date:"Feb 27",event:"CM approved, advance pending",actor:"Priya Nair"},
//       {date:"Mar 2", event:"Advance confirmed",actor:"Accounts"},
//       {date:"Mar 2", event:"Assigned to Arjun Reddy",actor:"Priya Nair"},
//     ],
//   },
//   {
//     id:"c2",name:"Summer Launch Teaser",client:"FreshBite Foods",
//     service:"Influencer Marketing",region:"North India",
//     stage:"draft",progress:8,budget:800000,creatorBudget:500000,numReq:8,
//     start:"Apr 20",end:"Jun 15",amId:"t7",cmId:null,eaId:null,
//     brief:{objective:"Teaser campaign for FreshBite's summer range.",audience:"18–28, college students.",
//       messages:"",deliverables:[],budget:"₹8L",timeline:"Apr 20 – Jun 15"},
//     briefStatus:"draft",amNote:"",cmNote:"",
//     creators:[],genRounds:0,sentToClient:false,
//     internalNotes:"Solid budget — good margin potential.",
//     timeline:[{date:"Apr 18",event:"Campaign submitted",actor:"Client"}],
//   },
//   {
//     id:"c3",name:"Festive Nano Wave",client:"FreshBite Foods",
//     service:"Influencer Marketing",region:"Pan-India",
//     stage:"live",progress:88,budget:320000,creatorBudget:200000,numReq:3,
//     start:"Jan 1",end:"Feb 28",amId:"t7",cmId:"t1",eaId:"t4",
//     brief:{objective:"Nano creator sampling across 10 cities.",audience:"18–30 urban millennials.",
//       messages:"Healthy snacking, redefined.",deliverables:["Reel — Non-Collab","Story"],budget:"₹3.2L",timeline:"8 weeks"},
//     briefStatus:"locked",amNote:"",cmNote:"",
//     creators:[
//       {...mkCreator(CREATOR_DB[5],18000),status:"locked",payType:"net_banking",payId:"9876543210@upi",
//         concept:{status:"locked",fileLink:"#"},demo:{status:"locked",fileLink:"#"},
//         live:{postUrl:"https://instagram.com/p/xyz1",postedDate:"Feb 10"},
//         tracking:{views:420000,likes:18200,comments:840,forwards:1200,commentAnalysis:"Very positive. Strong brand recall.",positivityScore:91,lastFetched:"Apr 28 10:32"}},
//       {...mkCreator(CREATOR_DB[9],8000),status:"locked",payType:"vendor",payId:"VND-2081",
//         concept:{status:"locked",fileLink:"#"},demo:{status:"approved",fileLink:"#"},
//         live:{postUrl:null,postedDate:null},
//         tracking:{views:null,likes:null,comments:null,forwards:null,commentAnalysis:null,positivityScore:null,lastFetched:null}},
//     ],
//     genRounds:1,sentToClient:true,internalNotes:"Strong results on first creator.",timeline:[],
//   },
// ];

// ── WORKFLOW ACTION LABELS ───────────────────────────────────────────────────
// Shared by the confirmation modal and the post-action toast.
const ACTION_MSGS={assign_am:"Assign Account Manager",assign_cm:"Assign Category Manager",assign_ea:"Assign Executive Associate",lock_brief:"Lock the brief",raise_po:"Record the client Purchase Order",advance_received:"Confirm advance received",raise_invoice:"Raise the client invoice",payment_done:"Confirm payment received",extend_end_date:"Campaign end date extended"};
// Actions that don't get the generic "Confirm stage change" dialog.
// extend_end_date is here because ExtendEndModal is already its own confirm
// step (it has to be — it collects the new date), so the generic modal would
// just be a second dialog saying less.
// The three assign_* actions are here even though completing the team DOES
// advance Brief Locked → Team Assigned: that transition is meant to be
// automatic, and a dialog after a dropdown pick would make it read as a manual
// stage change. The Team tab warns before the fact instead (see TabTeam).
// raise_po joins them for the same reason as extend_end_date: ClientPOModal
// collects the PO number and value, so it is already the confirmation step.
// lock_brief has LockBriefModal, which names what is about to freeze — the
// generic dialog could only repeat the action's label back.
const NO_CONFIRM_ACTIONS=new Set(["assign_am","assign_cm","assign_ea","extend_end_date","raise_po","lock_brief"]);
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
// creatorBudgetOf / numReqOf / perCreatorOf / costOf now live in lib/campaign.js
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
// Creator-side money — the creator budget pot + per-creator fees. Wider than
// canFin on purpose: CM/AM/EA run the shortlist and the negotiation, so they
// need the pot they're spending against, while the client-facing total budget,
// agency fee and margin stay behind canFin/canFF.
const canCrFin  = r => can(r, "seeCreatorFees");
const canFF     = r => can(r, "seeMargins");          // margins — founder only
const canCreate = r => can(r, "createCampaign");
// Visibility: founder sees all; everyone else only sees own campaigns
const canSee = (c, r, teamId) => {
  if (r === "founder") return true;
  return c.createdBy === teamId || c.amId === teamId || c.cmId === teamId || c.eaId === teamId;
};
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

// ── STAGE GATES ──────────────────────────────────────────────────────────────
// A stage only advances when its own condition is met, so the workflow buttons
// confirm something that is already true rather than skipping past it.
//
// execStats / execDone / briefGaps / teamComplete / executionStageOf all moved
// to lib/campaign.js when the pipeline forked: the execution track is derived
// rather than stored, and the campaign header, the card grid, the Exec filter
// and Billing all have to derive it the same way.

// ── BILLING BRIDGE ───────────────────────────────────────────────────────────
// Locking a creator commits money. That commitment used to live only on the
// campaign, so Billing — which reads the `expenses` collection — reported ₹0
// spent on every campaign, forever: the collection was empty, "Total Spent"
// was structurally stuck at zero, and every vendor PO read permanently open
// because nothing was ever billed against it.
//
// One expense per locked creator, with an id derived from the campaign and
// creator ids so re-saving the roster updates the row instead of duplicating
// it. The expense is created `pending_approval` — committed, not paid; Accounts
// settles it on the Campaign P&L, which is what moves it to `paid`.
// Executes the plan creatorExpensePlan() decides on — see lib/campaign.js for
// the rule itself, which is kept pure so it can be tested without the network.
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
function progressOf(c){
  return (PIPELINE[stageIdx(c?.stage)]||PIPELINE[0]).p;
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
// Overlapping team stack. Only the AM is accented — the slot that owns the
// campaign — so the colour means something rather than being three different
// tints you have to decode. Full names sit in the tooltip.
const AvStack=({people})=>(
  <div style={{display:"flex",alignItems:"center"}}>
    {people.map(({m,l},i)=>(
      <div key={l} title={`${l} · ${m.name}`} style={{marginLeft:i?-5:0,zIndex:people.length-i,borderRadius:6,boxShadow:"0 0 0 1.5px #FFFFFF"}}>
        <Av init={m.avatar} size={19} muted={l!=="AM"}/>
      </div>
    ))}
  </div>
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
const viewPl  = (camp,role) => role==="ea"
  ? (EXEC_NODES.find(n=>n.id===executionStageOf(camp))||EXEC_NODES[0])
  : (PIPELINE.find(p=>p.id===normStage(camp?.stage))||PIPELINE[0]);
const viewCol = (camp,role) => T.sc[viewPl(camp,role).id]||T.sub;

// ── PIPELINE ─────────────────────────────────────────────────────────────────
// The campaign header's centrepiece: two common nodes that FORK into two
// independent rails — Execution on top (the work), Finance below (the money).
//
// It forks because the two genuinely move independently. A campaign whose
// creators are all live can still be waiting on a client's advance, and a
// campaign that has been paid in full can still owe three posts. On one rail
// each of those is invisible; the fork is the only honest shape.
//
// What animates, and why each carries meaning rather than decoration:
//
//   the rails    — motion.path pathLength, so a rail DRAWS to where the
//                  campaign has actually got. The fork curves are part of the
//                  same paths, which is what makes the split read as one
//                  movement instead of three shapes that happen to touch.
//   the marker   — a single shared element (layoutId) that TRAVELS along the
//                  execution track when it advances, so a change reads as
//                  movement rather than two colours swapping in place.
//   the sweep    — a slow highlight along the completed length, so a live
//                  campaign's rail isn't dead track. It stops when nothing is
//                  left in flight.
//   the previews — hovering Execution or Creator Payment shows that node's
//                  donuts without leaving the header; clicking opens the full
//                  breakdown. The donuts are deliberately NOT drawn on the
//                  rail itself — circles sitting on a progress line read as
//                  ornament, and at rail scale none of them are legible.
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

// Milestone palette — one colour per thing, reused by the rail badges, the
// hover donuts and the expanded modals so a colour means the same everywhere.
const EXEC_MILESTONES = [
  { key:"locked",  label:"Creators Locked", color:T.green  },
  { key:"concept", label:"Scripting",       color:T.accent },
  { key:"video",   label:"Shooting",        color:T.purple },
  { key:"live",    label:"Live",            color:T.teal   },
];
const PAY_COLOR = { pending:"#C7C7CC", invoice_raised:T.amber, paid:T.green };

// Headline percentage, tweened. Initialised at the true value so mounting (or
// switching campaigns) snaps rather than counting up from zero every time.
function useCountUp(value){
  const mv = useSpring(value, { stiffness:140, damping:26 });
  const [shown,setShown] = useState(value);
  useEffect(()=>{ mv.set(value); },[value,mv]);
  useMotionValueEvent(mv,"change",v=>setShown(Math.round(v)));
  return shown;
}

// ── HOVER PREVIEW ────────────────────────────────────────────────────────────
// Anchors a portalled card under an element and KEEPS it anchored. Measuring
// once on mouseenter looked equivalent and wasn't: the header scrolls inside
// the page, so a preview opened before a scroll stayed where the node used to
// be. Re-measuring on scroll (capture phase, so it catches inner scrollers
// too) and on resize is what makes the caret line up with the node it
// describes.
//
// The card is portalled to <body> because the header card is `overflow:hidden`
// — anything anchored inside it was clipped at the card's edge.
//
// The app scales its entire UI with `zoom` on <html>, which put the two halves
// of this calculation in different units: getBoundingClientRect() reports
// VISUAL pixels (the zoom already applied), while the `left`/`top` written on
// the portalled card are layout pixels that the zoom multiplies AGAIN on paint.
// So the card landed at zoom × the intended x — drifting further right the
// further right the node sat, which is why the caret missed the node it was
// describing rather than being uniformly off. Dividing the measurement back out
// puts both halves in the card's own units. See lib/zoom.js — shared with
// every other position:fixed popover anchored to a trigger's rect.

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

// A rail is painted with a GRADIENT rather than one flat colour: it blends from
// the colour of the node it leaves to the colour of the node the campaign is
// standing on. A flat rail repainted itself wholesale on every advance — a teal
// line became an amber line in one step, which read as a state change rather
// than as progress — and it left the fork as two hard colour joins.
//
// Two stops, deliberately, not one per node. The palette is chosen to be
// legible as chips (navy PO, teal advance, amber invoice, green paid), and
// interpolating end to end through all of them ran the line through olive and
// brown on the way. Blending only start → current is smooth whatever the two
// colours are, and it still moves: the head of the rail always wears the
// current stage's colour, the same thing the marker and the track tag say.
//
// gradientUnits="userSpaceOnUse" so the stops sit at real column positions
// rather than at fractions of a path whose length differs per branch.
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
      // it never runs past progress that hasn't happened.
      //
      // pathLength MUST be declared in initial/animate, not in `style`. Framer
      // only converts the path props into stroke-dasharray when it sees them on
      // the animation target; passing it as a style left the highlight with no
      // dash at all, so it painted the ENTIRE rail solid white — which is what
      // made the rails look washed-out and completely still. It was covering
      // the colour it was supposed to be travelling along.
      // Long, faint and slow. A short bright glint read as a loading bar — the
      // rail is meant to look alive, not to look busy. Stretching the highlight
      // and dropping its opacity turns the same animation into a breath passing
      // under the colour rather than a marker running along the top of it.
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
  const eaOnly = role==="ea";                    // no commercial rail for an EA

  const si   = stageIdx(camp.stage);                       // stored-track index
  const es   = execStats(camp);
  const pay  = creatorPayStats(camp, expenseById);
  const exId = executionStageOf(camp);
  const execIdx = EXEC_STAGES.findIndex(n=>n.id===exId);   // -1 while still common
  // Team Assigned is stored but drawn on the execution branch, so the finance
  // branch starts one stage later than the common head ends.
  const finIdx  = si - (FORK + 1);                         // -1 before the PO
  const paidOut = pay.total>0 && pay.paid===pay.total;
  const settled = si === PL_IDS.length-1;

  // How far each rail is drawn. The fork counts as one step of the branch it
  // belongs to, which is why each denominator is the branch's node count and
  // reaching node i costs i+1 steps.
  const commonFrac = Math.min(si,FORK-1)/(FORK-1);
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
      <div style={{position:"relative",width:PIPE_W,minWidth:PIPE_W,height:PIPE_H}}>
        <svg width={PIPE_W} height={PIPE_H} style={{position:"absolute",inset:0,pointerEvents:"none"}} aria-hidden>
          <defs>
            {/* Each branch starts on the colour the common head ends on, so the
                fork curves read as that line continuing rather than as two new
                ones starting. */}
            <RailGradient id="railCommon" x0={cx(0)} x1={cx(FORK-1)} from={PIPE_GREEN} to={T.sc.brief_locked}/>
            <RailGradient id="railExec" x0={cx(FORK-1)} x1={cx(FORK+EXEC_STAGES.length-1)} from={T.sc.brief_locked} to={execCol}/>
            <RailGradient id="railFin"  x0={cx(FORK-1)} x1={cx(FORK+FIN_STAGES.length-1)}  from={T.sc.brief_locked} to={finCol}/>
          </defs>
          <Rail d={RAIL.common} frac={commonFrac} stroke="url(#railCommon)" flowing={flowing} reduce={reduce}/>
          <Rail d={RAIL.exec}   frac={execFrac}   stroke="url(#railExec)"   flowing={flowing} reduce={reduce}/>
          {!eaOnly&&<Rail d={RAIL.fin} frac={finFrac} stroke="url(#railFin)" flowing={flowing} reduce={reduce}/>}
        </svg>

        {/* Track tags, in the gutter the fork leaves empty. They say which rail
            is which without a legend, and carry each track's own headline. */}
        <TrackTag y={TOP_Y} label="Execution" col={execCol}
          sub={es.locked?`${es.live}/${es.locked} live · ${es.pct}%`:"no creators locked"}/>
        {!eaOnly&&<TrackTag y={BOT_Y} label="Finance" col={finCol}
          sub={finIdx<0?"not started":FIN_STAGES[finIdx].label}/>}

        {/* Common head — labels ABOVE the markers, into the space the fork
            leaves free, so they can't collide with the finance rail below. */}
        {COMMON_STAGES.map((n,i)=>(
          <TrackNode key={n.id} node={n} x={cx(i)} y={MID_Y} labelAbove reduce={reduce}
            state={stateOf(si,i,false)} col={T.sc[n.id]}
            badge={si===i?"NOW":null}/>
        ))}

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
        {!eaOnly&&FIN_STAGES.map((n,i)=>(
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
                      delivDoneOf(camp,cr) >= delivTargetOf(camp,cr);
  return(
    <Sheet title="Execution" onClose={onClose} width={560}
      sub={`${camp.name} · ${s.target} creator${s.target!==1?"s":""} planned · ${s.delivered} of ${s.expected} deliverables posted`}
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
// Resolve the two input modes down to the one number that gets stored.
const resolveCreatorBudget = (f, budget) =>
  f.creatorBudgetMode === "amount"
    ? (parseInt(f.creatorBudgetAmt) || 0)
    : Math.round(budget * clampPct(f.creatorBudgetPct) / 100);

function CreatorBudgetField({budget,numCreators,mode,pct,amount,onChange,showAgency}){
  const isPct = mode === "pct";
  const value = resolveCreatorBudget({creatorBudgetMode:mode,creatorBudgetPct:pct,creatorBudgetAmt:amount}, budget);
  const effPct = budget > 0 ? (value / budget) * 100 : 0;
  const per    = numCreators > 0 ? Math.round(value / numCreators) : 0;
  const over   = value > budget;
  const agency = budget - value;
  // One slice per creator up to 12 — past that the hairlines read as noise,
  // so the bar collapses to a single block and the "× N" label carries it.
  const slices = numCreators > 0 && numCreators <= 12 ? numCreators : 1;
  const seg = on => ({padding:"4px 12px",borderRadius:6,fontSize:10,fontWeight:600,fontFamily:SF,cursor:"pointer",border:"none",transition:"all 0.15s",background:on?T.surface:"transparent",color:on?T.text:T.label,boxShadow:on?"0 1px 2px rgba(0,0,0,0.08)":"none"});
  return(<div style={{marginBottom:14}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
      <Lbl>Creator budget</Lbl>
      <div style={{display:"flex",gap:2,padding:2,borderRadius:8,background:T.mute}}>
        <button onClick={()=>onChange({creatorBudgetMode:"pct"})}    style={seg(isPct)}>% of budget</button>
        <button onClick={()=>onChange({creatorBudgetMode:"amount"})} style={seg(!isPct)}>₹ amount</button>
      </div>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      {isPct
        ? <div style={{position:"relative",width:120,flexShrink:0}}>
            <input type="number" min={0} max={100} step={5} value={pct} onChange={e=>onChange({creatorBudgetPct:e.target.value})} style={{...INP,resize:"none",paddingRight:26}}/>
            <span style={{position:"absolute",right:11,top:"50%",transform:"translateY(-50%)",fontSize:11,color:T.label,pointerEvents:"none"}}>%</span>
          </div>
        : <MoneyInput value={amount} onChange={v=>onChange({creatorBudgetAmt:v})} placeholder="e.g. 7,50,000" style={{...INP,resize:"none",width:150,flexShrink:0}}/>}
      <span style={{fontSize:11,color:budget>0?T.text:T.label,fontFamily:SF}}>
        {budget>0
          ? (isPct ? `= ${fmtINR(value)} of ${fmtINR(budget)}` : `= ${effPct.toFixed(1)}% of ${fmtINR(budget)}`)
          : "Enter the total budget first"}
      </span>
    </div>
    {isPct&&<div style={{display:"flex",gap:6,marginTop:8}}>{[50,60,70,75].map(p=>{
      const on=clampPct(pct)===p;
      return <Chip key={p} on={on} onClick={()=>onChange({creatorBudgetPct:p})} style={{padding:"3px 10px",fontSize:10}}>{p}%</Chip>;
    })}</div>}
    {/* Allocation bar — the creator share split into one block per creator,
        with the agency remainder trailing it. Makes "where does the money go"
        legible at a glance instead of only as two numbers. */}
    {budget>0&&!over&&<div style={{marginTop:10}}>
      <div style={{display:"flex",height:8,borderRadius:4,overflow:"hidden",background:T.mute}}>
        <div style={{width:`${effPct}%`,flexShrink:0,display:"flex",gap:2,overflow:"hidden",transition:"width 0.25s"}}>
          {Array.from({length:slices}).map((_,i)=><div key={i} style={{flex:1,background:T.accent,borderRadius:2,minWidth:2}}/>)}
        </div>
        <div style={{flex:1,minWidth:0,marginLeft:2,background:`${T.gold}55`,borderRadius:2}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:9.5,fontFamily:SF}}>
        <span style={{color:T.sub}}>≈ <strong style={{color:T.text,fontWeight:600}}>{fmtINR(per)}</strong> per creator × {numCreators||0}</span>
        {showAgency&&<span style={{color:T.label}}>Agency {fmtINR(agency)} · {(100-effPct).toFixed(0)}%</span>}
      </div>
    </div>}
    {over&&<div style={{fontSize:9.5,color:T.red,marginTop:6}}>Creator budget can't exceed the total budget of {fmtINR(budget)}.</div>}
    {budget>0&&!over&&value===0&&<div style={{fontSize:9.5,color:T.red,marginTop:6}}>Set how much of the budget goes to creators.</div>}
  </div>);
}

// ── CAMPAIGN CARD (grid tile) ─────────────────────────────────────────────────
// Three bands, always in the same place: identity, then the money, then a
// status footer. Fixing the bands means a row of tiles lines up even when one
// campaign has no team and another has an end-date warning — the old card let
// every element shift vertically, so a row read as a ragged list rather than a
// grid.
//
// The progress bar is the tile's bottom edge rather than a hairline floating in
// the padding: it's the one element you compare ACROSS tiles, so it belongs on
// a shared baseline. It carries the stage colour, which makes 90%-and-ended
// (red) look nothing like 90%-and-live (amber) at a glance.
const CampCard = forwardRef(function CampCard(
  { camp, onClick, role, accent, logoUrl },
  ref
) {
  const col = viewCol(camp, role);
  const pl = viewPl(camp, role);
  
  const es = endStatus(camp.end, camp.stage);
  const team = [
    { m: getM(camp.amId), l: "AM" },
    { m: getM(camp.cmId), l: "CM" },
    { m: getM(camp.eaId), l: "EA" },
  ].filter((x) => x.m);

  const pct = progressOf(camp);
  const st = execStats(camp);

  const done =
    hasEnded(camp) || normStage(camp.stage) === "payment_done";

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{
        opacity: done ? 0.72 : 1,
        y: 0,
        scale: 1,
      }}
      exit={{
        opacity: 0,
        scale: 0.96,
        transition: { duration: 0.12 },
      }}
      whileHover={{
        y: -6,
        opacity: 1,
        boxShadow:
          "0 24px 55px rgba(0,0,0,0.16), 0 4px 14px rgba(0,0,0,0.08)",
      }}
      whileTap={{ scale: 0.985 }}
      transition={{
        type: "spring",
        stiffness: 340,
        damping: 28,
      }}
      onClick={onClick}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        minHeight: 205,
        borderRadius: 20,
        overflow: "hidden",
        cursor: "pointer",
        isolation: "isolate",

        background: DARK_SURFACE,

        border: `1px solid ${
          accent
            ? `${accent}55`
            : "rgba(255,255,255,0.12)"
        }`,

        boxShadow:
          "0 8px 25px rgba(0,0,0,0.07)",

        transition:
          "border-color .35s ease, box-shadow .35s ease",
      }}
    >

      {/* =========================================================
          BRAND IMAGE — ATMOSPHERIC BACKGROUND
      ========================================================= */}

      {logoUrl && (
        <>
          <motion.img
            src={logoUrl}
            alt=""
            aria-hidden="true"
            whileHover={{
              scale: 1.17,
            }}
            transition={{
              duration: 0.8,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{
              position: "absolute",
              inset: -12,
              width: "calc(100% + 24px)",
              height: "calc(100% + 24px)",
              objectFit: "cover",
              objectPosition: "center",

              opacity: 0.28,

              filter:
                "blur(3px) saturate(0.85) contrast(1.05)",

              transform: "scale(1.10)",

              pointerEvents: "none",
              zIndex: 0,
            }}
          />

          {/* LEFT → RIGHT CONTRAST */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(105deg, rgba(10,11,14,0.97) 0%, rgba(10,11,14,0.88) 38%, rgba(10,11,14,0.52) 72%, rgba(10,11,14,0.30) 100%)",
              pointerEvents: "none",
              zIndex: 1,
            }}
          />

          {/* BOTTOM FADE */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "58%",
              background:
                "linear-gradient(transparent, rgba(10,11,14,0.96))",
              pointerEvents: "none",
              zIndex: 1,
            }}
          />
        </>
      )}

      {/* =========================================================
          SUBTLE BRAND GLOW
      ========================================================= */}

      {accent && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            width: 180,
            height: 180,
            top: -100,
            right: -70,
            borderRadius: "50%",
            background: accent,
            opacity: 0.10,
            filter: "blur(55px)",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      )}

      {/* =========================================================
          TOP BAR
      ========================================================= */}

      <div
        style={{
          position: "relative",
          zIndex: 3,

          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",

          padding: "16px 17px 0",

          gap: 12,
        }}
      >

        {/* CAMPAIGN INDEX */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,

            padding: "5px 8px",

            borderRadius: 999,

            background:
              "rgba(255,255,255,0.08)",

            border:
              "1px solid rgba(255,255,255,0.12)",

            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: col,
              boxShadow: `0 0 0 3px ${col}22`,
            }}
          />

          <span
            style={{
              fontFamily: SF,
              fontSize: 8.5,
              fontWeight: 800,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.72)",
            }}
          >
            Campaign
          </span>
        </div>

        {/* BUDGET */}
        {canFin(role) && (
          <div
            style={{
              fontFamily: SF,
              fontSize: 13,
              fontWeight: 750,
              color: "#FFFFFF",
              letterSpacing: "-0.02em",

              padding: "6px 9px",
              borderRadius: 8,

              background:
                "rgba(255,255,255,0.09)",

              border:
                "1px solid rgba(255,255,255,0.12)",

              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            {fmtINR(camp.budget)}
          </div>
        )}
      </div>

      {/* =========================================================
          MAIN CONTENT
      ========================================================= */}

      <div
        style={{
          position: "relative",
          zIndex: 3,

          display: "flex",
          flexDirection: "column",

          flex: 1,

          padding:
            "25px 17px 14px",
        }}
      >

        {/* CLIENT */}
        <div
          style={{
            fontFamily: SF,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.11em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.52)",

            marginBottom: 5,

            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {camp.client}
          {camp.region
            ? ` · ${camp.region}`
            : ""}
        </div>

        {/* CAMPAIGN NAME */}
        <div
          style={{
            fontFamily:
              "'Newsreader', serif",

            fontStyle: "italic",

            fontSize:
              "clamp(20px, 2vw, 25px)",

            fontWeight: 500,

            lineHeight: 1.02,

            letterSpacing: "-0.025em",

            color: "#FFFFFF",

            maxWidth: "90%",

            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",

            overflow: "hidden",

            textShadow:
              "0 2px 20px rgba(0,0,0,0.35)",
          }}
        >
          {camp.name}
        </div>

        {/* =====================================================
            INTELLIGENCE STRIP
        ===================================================== */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr 1fr 1fr",

            gap: 1,

            marginTop: "auto",
            marginBottom: 12,

            borderRadius: 12,

            overflow: "hidden",

            background:
              "rgba(255,255,255,0.10)",

            border:
              "1px solid rgba(255,255,255,0.13)",

            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
          }}
        >
          {/* CREATORS */}
          <div
            style={{
              padding: "9px 9px",
              background:
                "rgba(0,0,0,0.20)",
            }}
          >
            <div
              style={{
                fontFamily: SF,
                fontSize: 7.5,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color:
                  "rgba(255,255,255,0.42)",
              }}
            >
              Creators
            </div>

            <div
              style={{
                marginTop: 3,
                fontFamily: SF,
                fontSize: 11,
                fontWeight: 750,
                color: "#FFFFFF",
                fontVariantNumeric:
                  "tabular-nums",
              }}
            >
              {st.locked} / {st.target}
            </div>
          </div>

          {/* POSTS */}
          <div
            style={{
              padding: "9px 9px",
              background:
                "rgba(0,0,0,0.20)",
            }}
          >
            <div
              style={{
                fontFamily: SF,
                fontSize: 7.5,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color:
                  "rgba(255,255,255,0.42)",
              }}
            >
              Posts
            </div>

            <div
              style={{
                marginTop: 3,
                fontFamily: SF,
                fontSize: 11,
                fontWeight: 750,
                color: "#FFFFFF",
                fontVariantNumeric:
                  "tabular-nums",
              }}
            >
              {st.expected
                ? `${st.delivered}/${st.expected}`
                : "—"}
            </div>
          </div>

          {/* END */}
          <div
            style={{
              padding: "9px 9px",
              background:
                "rgba(0,0,0,0.20)",
            }}
          >
            <div
              style={{
                fontFamily: SF,
                fontSize: 7.5,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color:
                  "rgba(255,255,255,0.42)",
              }}
            >
              Ends
            </div>

            <div
              style={{
                marginTop: 3,
                fontFamily: SF,
                fontSize: 10,
                fontWeight: 700,
                color: "#FFFFFF",
                whiteSpace: "nowrap",
              }}
            >
              {prettyDate(camp.end) ||
                "TBD"}
            </div>
          </div>
        </div>

        {/* =====================================================
            FOOTER
        ===================================================== */}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            minHeight: 25,
          }}
        >

          {/* STAGE */}
          <Pill tone={col}>
            {pl.label}
          </Pill>

          {/* END WARNING */}
          <EndPill es={es} />

          <div style={{ flex: 1 }} />

          {/* TEAM */}
          <div
  style={{
    display: "flex",
    alignItems: "center",
    paddingLeft: 4,
  }}
>
  {team.slice(0, 3).map((person, i) => {
    const user = person.m;
   const url = UsersAPI.avatarUrl({
  id: user.userId,
  hasAvatar: user.hasAvatar,
  avatarUpdatedAt: user.avatarUpdatedAt,
});

    return (
      <div
        key={`${user.id || user._id || i}-${person.l}`}
        title={`${user.name || person.l} · ${person.l}`}
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          overflow: "hidden",
          marginLeft: i === 0 ? 0 : -8,
          background: "#FFFFFF",
          border: "2px solid rgba(17,18,22,0.9)",
          boxShadow: "0 3px 10px rgba(0,0,0,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          zIndex: 10 - i,
          fontFamily: SF,
          fontSize: 8,
          fontWeight: 800,
          color: "#111216",
        }}
      >
        {url ? (
          <img
            src={url}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          initials(user.name)
        )}
      </div>
    );
  })}
</div>

          {/* PROGRESS */}
          <span
            style={{
              fontFamily: SF,
              fontSize: 10,
              fontWeight: 800,
              color:
                "rgba(255,255,255,0.72)",
              fontVariantNumeric:
                "tabular-nums",
            }}
          >
            {pct}%
          </span>
        </div>
      </div>

      {/* =========================================================
          PROGRESS BAR
      ========================================================= */}

      <div
        style={{
          position: "relative",
          zIndex: 4,

          height: 4,

          background:
            "rgba(255,255,255,0.09)",
        }}
      >
        <motion.div
          style={{
            height: "100%",
            background: col,

            boxShadow:
              `0 0 14px ${col}88`,
          }}
          animate={{
            width: `${pct}%`,
          }}
          transition={{
            type: "spring",
            stiffness: 220,
            damping: 26,
          }}
        />
      </div>

    </motion.div>
  );
});

// ── BRAND IDENTITY ────────────────────────────────────────────────────────────
// A brand is identified on the board by its logo and its name, not by a colour.
// There was a per-brand accent here — hashed from the name, then upgraded to a
// colour sampled from the uploaded logo — and it did separate the groups, but
// it filled the board with hues that competed with the one colour that carries
// meaning: a campaign's stage. Structure does that job instead (see BrandGroup),
// which leaves colour free to mean status and only status.
const brandInitials=(s="")=>s.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase()||"?";

// ── BRAND HEADER ──────────────────────────────────────────────────────────────
// The banner above each brand's group of campaign tiles.
//
// It used to be a 24px chip, a 15px name and a hairline rule, all left-aligned
// and about as prominent as a table caption — on a board carrying several
// brands, the thing you actually navigate by was the quietest element on the
// page. It is now a proper tile: centred, taller, and carrying the brand's own
// logo.
//
// The backdrop is that same logo, blown up and heavily blurred. That is what
// gives each brand a distinct colour field without needing a stored brand
// colour — the palette comes from the logo itself. Brands with no logo keep the
// derived accent (brandAccent) so the treatment degrades to something with the
// same shape rather than to a blank box.
// The brand's accent colour, sampled from its uploaded logo when there is one
// and falling back to the name-derived palette colour when there isn't.
//
// See useBrandAccent in lib/brandAccent.js.

function BrandHeader({label,count,logoUrl,onEditLogo}){
  const [broken,setBroken]=useState(false);
  const showLogo=!!logoUrl&&!broken;
  // The logo mark IS the control for setting the logo — that is where someone
  // looking to change it already is, and an empty one is the most legible
  // "nothing here yet" button the page could have.
  const editable=!!onEditLogo;
  return(
    // Sticky, and it must PAINT — the group's field scrolls underneath it, so a
    // transparent header would let campaign tiles show through the brand name.
    <div style={{position:"sticky",top:0,zIndex:2}}>
      <div style={{position:"relative",borderRadius:"15px 15px 0 0",background:"#FFFFFF",borderBottom:"1px solid rgba(0,0,0,0.07)"}}>
        {/* Deliberately uncoloured. An earlier version tinted this band with a
            colour sampled from the brand's logo and washed a blurred copy of
            the logo across it — distinct per brand, but it made the board a
            field of competing hues and drowned out the one colour that carries
            meaning here: a campaign's stage. Brand identity is the logo and the
            name at 27px, which is plenty; colour is reserved for status. */}
        <div style={{display:"flex",alignItems:"center",gap:14,padding:"18px 22px 17px"}}>
          {/* Initials keep the original 40px/13px SF treatment — scaling them
              up with the masthead made the fallback read as a display letterform
              rather than as a quiet stand-in for a missing logo. */}
          <div
            onClick={editable?onEditLogo:undefined}
            title={editable?(showLogo?`Change ${label}'s logo`:`Set ${label}'s logo`):undefined}
            style={{width:40,height:40,borderRadius:11,flexShrink:0,overflow:"hidden",background:showLogo?"#FFFFFF":"rgba(0,0,0,0.05)",border:"1px solid rgba(0,0,0,0.08)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#86868B",fontFamily:SF,letterSpacing:"-0.02em",boxShadow:showLogo?"0 1px 3px rgba(0,0,0,0.08)":"none",cursor:editable?"pointer":"default",transition:"box-shadow 0.15s"}}
            onMouseOver={e=>{if(editable)e.currentTarget.style.boxShadow="0 0 0 3px rgba(0,0,0,0.07)";}}
            onMouseOut={e=>{if(editable)e.currentTarget.style.boxShadow=showLogo?"0 1px 3px rgba(0,0,0,0.08)":"none";}}
          >
            {showLogo
              ? <img src={logoUrl} alt="" onError={()=>setBroken(true)} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              : brandInitials(label)}
          </div>
          <div style={{minWidth:0,flex:1}}>
            {/* 27px against the tiles' 14.5px. The brand is the thing you
                navigate by, so it outranks every campaign name under it rather
                than competing with them at a near-equal weight. */}
            <div style={{fontFamily:"'Newsreader',serif",fontSize:27,fontStyle:"italic",fontWeight:600,color:"#1D1D1F",letterSpacing:"-0.015em",lineHeight:1.1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</div>
            <div style={{marginTop:3,fontSize:10,fontWeight:600,letterSpacing:"0.09em",textTransform:"uppercase",color:"#86868B",fontFamily:SF}}>
              {count} campaign{count===1?"":"s"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// One brand's header plus its campaign tiles, as a single visually bounded
// block. Split out of CampaignGrid so the accent can be resolved per brand —
// hooks cannot be called inside the `.map()` that renders the groups.
function BrandGroup({label,brandId,rows,role,onSelect,brandLogoUrl,onEditLogo,empty}){
  const logoUrl=brandLogoUrl?.(brandId);
  // Null unless this brand has uploaded a logo we can read a colour out of —
  // see lib/brandAccent. Resolved once here rather than per card: every tile in
  // the group shares a brand, so decoding the same image N times would be N-1
  // wasted decodes.
  const accent=useBrandAccent(logoUrl);
  return(
    // The masthead and its tiles are ONE enclosed object: a single rounded
    // container ruled down its left edge, white masthead over a faint grey
    // field.
    //
    // Before this they were two free-floating white tiles with the same radius
    // and the same border — a campaign and the brand it belongs to were
    // rendered as the same KIND of thing, so the eye had to read text to tell a
    // heading from a row. Enclosing the group says "these belong to that"
    // structurally, which is what frees the masthead to be styled as a heading
    // rather than as another card, and frees colour to mean stage.
    <div style={{marginBottom:34,borderRadius:16,overflow:"hidden",border:"1px solid rgba(0,0,0,0.07)",borderLeft:"3px solid rgba(0,0,0,0.14)",background:"rgba(0,0,0,0.018)",boxShadow:"0 1px 2px rgba(0,0,0,0.04)"}}>
      <BrandHeader label={label} count={rows.length} logoUrl={logoUrl}
        onEditLogo={onEditLogo&&brandId?()=>onEditLogo(brandId):undefined}/>
      {empty&&!rows.length
        ? <div style={{padding:"34px 16px",textAlign:"center",color:"#86868B",fontSize:12.5,fontFamily:SF}}>{empty}</div>
        : null}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:12,padding:rows.length?"14px":0}}>
        <AnimatePresence mode="popLayout">
          {rows.map(c=>(
  <CampCard
    key={c.id}
    camp={c}
    role={role}
    accent={accent}
    logoUrl={logoUrl}
    onClick={()=>onSelect(c.id)}
  />
))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── CAMPAIGN GRID ─────────────────────────────────────────────────────────────
// Groups the already-filtered `visible` list by brand (same grouping rule the
// old sidebar used) and lays each group out as a responsive card grid.
function CampaignGrid({campaigns,role,onSelect,brandName,brandLogoUrl,onEditLogo,brandFilter}){
  if(campaigns.length===0){
    // Scoped to one brand with nothing to show: still render that brand's
    // header. Dropping straight to bare grey text was reported as "the colour
    // goes when I add the brand filter" — and it is worse than colourless, it
    // removes the only on-page confirmation of WHICH brand you are scoped to,
    // so an empty board is indistinguishable from a broken one.
    const label=brandFilter?brandName(brandFilter):null;
    if(label){
      return(
        <div style={{padding:"20px 28px 40px"}}>
          <BrandGroup label={label} brandId={brandFilter} rows={[]} role={role}
            onSelect={onSelect} brandLogoUrl={brandLogoUrl} onEditLogo={onEditLogo}
            empty="No campaigns for this brand yet."/>
        </div>
      );
    }
    return <div style={{padding:"64px 16px",textAlign:"center",color:"#86868B",fontSize:13,fontFamily:SF}}>No campaigns match</div>;
  }
  // Grouped by brand NAME (the display label), but the logo has to be looked up
  // by brandId — so the id of the first campaign in each group is carried
  // alongside. Every campaign in a group shares a brand by construction, so any
  // one of them identifies it.
  const groups={};
  campaigns.forEach(c=>{
    const label=brandName(c.brandId)||"Unassigned";
    (groups[label]=groups[label]||{brandId:c.brandId,rows:[]}).rows.push(c);
  });
  const labels=Object.keys(groups).sort((a,b)=>a==="Unassigned"?1:b==="Unassigned"?-1:a.localeCompare(b));
  return(
    <div style={{padding:"20px 28px 40px"}}>
      {/* One BrandGroup per brand — a component rather than inline JSX because
          each group resolves its own accent colour with a hook, and hooks can't
          be called inside a map body. Grid layout comment lives there too. */}
      {labels.map(label=>(
        <BrandGroup
          key={label}
          label={label}
          brandId={groups[label].brandId}
          rows={groups[label].rows}
          role={role}
          onSelect={onSelect}
          brandLogoUrl={brandLogoUrl}
          onEditLogo={onEditLogo}
        />
      ))}
    </div>
  );
}

// ── VIEWS — the counts ARE the filter ────────────────────────────────────────
// One control, not two. The grid used to carry a stat strip (All / Active /
// In Exec / Attention) that counted but could not be clicked, above a pill row
// (All / Setup / Money / Exec / Done / Ended) that filtered but showed no
// numbers. The two named different groups, so a number like "3 Active" led
// nowhere — there was no pill for it — and the strip counted the ALREADY
// FILTERED list, which collapsed every number to 0 or 1 the moment a pill was
// picked. Reading a count and acting on it are the same gesture now.
//
// "Active" (not draft/paid, not ended) used to sit here too, next to
// "In Execution" (creators actively posting). Almost every campaign that isn't
// a draft, isn't fully paid and hasn't ended IS mid-execution — the two
// predicates target different axes (finance-track health vs. delivery state)
// but land on the same campaigns often enough that the pair read as one stat
// counted twice. In Execution is the one with a specific, actionable meaning
// ("creators are posting right now"), so it's the one that stayed.
//
// Predicates rather than stage-id lists, because two of these span the derived
// execution track: a campaign is in execution when its creators are working and
// ended when its date has passed, whatever its stored finance stage says.
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
};
const ViewIcon=({id,color})=>(
  <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    {VIEW_ICON_PATHS[id]}
  </svg>
);

function ViewBar({counts,value,onChange}){
  return(
    <div style={{display:"flex",background:"rgba(0,0,0,0.03)",borderRadius:12,padding:3,border:"1px solid rgba(0,0,0,0.06)",gap:2}}>
      {VIEWS.map(v=>{
        const on=value===v.id, n=counts[v.id]||0;
        // A tone only fires when there is something to look at — a red 0 under
        // "Ended" is an alarm about nothing.
        const hot=v.tone&&n>0;
        const numCol=hot?v.tone:"#1D1D1F";
        const iconCol=on?numCol:hot?v.tone:"#ADADB2";
        return(
          <button key={v.id} onClick={()=>onChange(v.id)} aria-pressed={on} title={`Show ${v.label.toLowerCase()}`}
            style={{position:"relative",flex:1,minWidth:0,padding:"10px 6px 9px",borderRadius:9,border:"none",
              // A hot-but-unselected view (something needs looking at) gets a
              // faint tint of its own — a red "Ended" pill shouldn't look
              // identical to an empty one just because it isn't clicked yet.
              background:on?"transparent":hot?`${v.tone}0C`:"transparent",cursor:"pointer",fontFamily:SF}}>
            {on&&<motion.div layoutId="viewPill" transition={{type:"spring",stiffness:500,damping:38}}
              style={{position:"absolute",inset:0,background:"#FFFFFF",borderRadius:9,boxShadow:`0 1px 3px rgba(0,0,0,0.10)${hot?`, inset 0 0 0 1px ${v.tone}30`:""}`,zIndex:0}}/>}
            <span style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <ViewIcon id={v.icon} color={iconCol}/>
              <span style={{fontSize:17,fontWeight:700,letterSpacing:"-0.03em",lineHeight:1,color:numCol}}>{n}</span>
              <span style={{fontSize:9.5,whiteSpace:"nowrap",color:on?"#1D1D1F":"#86868B",fontWeight:on?600:400}}>{v.label}</span>
            </span>
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
// One shell for every confirm-or-collect dialog on this page. Six of them had
// hand-copied the same backdrop, spring, card chrome, serif title and footer,
// so the look could only be changed in six places — and they had already
// drifted: Remove Creator had no enter animation at all and no spacer before
// its destructive button, so its Cancel and Remove sat side by side while every
// other dialog put them at opposite ends.
//
// `confirm` is one object rather than four props because the label, the colour
// and the guard are one decision: a danger button saying "Delete campaign" that
// is disabled until a reason is picked is a single description of the action.
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
      sub={<>Lock <strong style={{color:T.text}}>{creator?.name}</strong> <CreatorHandle creator={creator} style={{fontSize:11}} fallback=""/> at <strong style={{color:T.text}}>{fmtINR(costOf(creator))}</strong>?</>}
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

// ── CLIENT PO MODAL ──────────────────────────────────────────────────────────
// The PO stage used to advance on a bare "Mark Purchase Order Raised" button:
// an assertion that a PO existed somewhere, creating no record, no number and
// no amount. Meanwhile Billing had a real PO model that the campaign never
// touched — which is how client PO records ended up holding *vendor* PO
// numbers, the only route to one being to staple a number onto an invoice
// after the fact.
//
// Now the stage advances because the PO exists. This collects it, writes the
// client PO, links it to the campaign's invoice, and the transition follows.
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
export function AddCreatorModal({onAdd,onClose,editing=null}){
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
        askingPrice:parseInt(askingPrice)||null, cost:parseInt(cost)||0,
        payType:f.payType||null, payId:payId||null,
        personalDetails:{...editing.personalDetails,...personalDetails},
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
          <div><Lbl style={{display:"block",marginBottom:4}}>Negotiated Cost (₹)</Lbl><MoneyInput value={cost} onChange={setCost} placeholder="e.g. 75,000" style={{...INP,resize:"none"}}/></div>
        </div>
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
  const required=numReqOf(camp),flagged=genRounds>=4;
  const lockedCount=creators.filter(isLocked).length;
  // Read off the LOCAL roster, not camp.creators: the tab holds edits that
  // haven't round-tripped yet, and the countdown has to move when you lock
  // someone, not one save later. null once the roster is confirmed.
  const gap=rosterGap(camp,creators);
  const cb=creatorBudgetOf(camp),perCr=perCreatorOf(camp);
  const totalFee=creators.reduce((s,c)=>s+costOf(c),0);
  const over=totalFee>cb;
  const canEdit=["ea","cm","am","pcm","founder"].includes(role);
  const sync=next=>{setCreators(next);onUpdateCreators(next);};
  const patch=(id,obj)=>sync(creators.map(c=>c._id===id?{...c,...obj}:c));
  const generate=()=>{if(flagged||generating)return;setGenerating(true);setTimeout(()=>{const taken=new Set(creators.map(c=>c.dbId).filter(Boolean));
    // Restrict suggestions to the campaign's niche (same/similar). If nothing
    // in the DB matches, fall back to the full pool so Generate is never empty.
    const inNiche=CREATOR_DB.filter(c=>!taken.has(c.id)&&nicheMatches(nichesOf(camp),c.niche));
    const base=inNiche.length?inNiche:CREATOR_DB.filter(c=>!taken.has(c.id));
    const pool=base.slice(0,required*2).map(c=>mkCreator(c));setSuggested(pool);setGenRounds(r=>r+1);setGenerating(false);},900);};
  const confirmRemove=(reason,note)=>{API.removeCreator(camp.id,removeTarget._id,reason,note);sync(creators.filter(c=>c._id!==removeTarget._id));setRemoveTarget(null);};
  // Locking commits money and cannot be taken back, so it is confirmed and
  // logged. The timeline entry matters more here than on a reversible change:
  // it is the only record of who made the commitment and at what fee.
  const confirmLock=()=>{
    patch(lockTarget._id,{status:"locked"});
    onLogTimeline?.(`${lockTarget.name} locked at ${fmtINR(costOf(lockTarget))}`);
    setLockTarget(null);
  };
  const addFromSugg=cr=>{if(creators.length>=required)return;sync([...creators,cr]);setSuggested(p=>p.filter(c=>c._id!==cr._id));};
  const thS={fontSize:9,fontWeight:600,color:T.label,textTransform:"uppercase",letterSpacing:"0.07em",padding:"8px 10px",whiteSpace:"nowrap",borderBottom:`1px solid ${T.border}`,textAlign:"left",background:T.raised};
  const tdS={padding:"8px 10px",borderBottom:`1px solid ${T.border}`,fontSize:11,color:T.sub,verticalAlign:"middle",whiteSpace:"nowrap"};
  return(<div>
    {canCrFin(role)&&<div style={{marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><Lbl>Creator Budget</Lbl><span style={{fontSize:10.5,color:over?T.red:T.sub}}>{fmtINR(totalFee)} of {fmtINR(cb)}</span></div>
      <div style={{height:2,background:T.mute,borderRadius:1}}><div style={{height:2,borderRadius:1,background:over?T.red:T.green,width:`${cb>0?Math.min((totalFee/cb)*100,100):0}%`,transition:"width 0.3s"}}/></div>
      {/* The per-head target set at creation — what a shortlister needs in view
          while negotiating, next to what's actually been committed so far. */}
      <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:9.5}}>
        <span style={{color:T.label}}>≈ {fmtINR(perCr)} per creator target · {required} required</span>
        <span style={{color:over?T.red:T.sub}}>{over?`${fmtINR(totalFee-cb)} over budget`:`${fmtINR(cb-totalFee)} left`}</span>
      </div>
    </div>}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
      {/* Both scope numbers in one line: how many creators, and how many posts
          the roster owes in total (see totalDelivOf — per-creator overrides
          included, so this is the real number, not creators × plan). */}
      <div><Lbl>Creators</Lbl><span style={{fontSize:9,color:T.sub,marginLeft:8}}>{creators.length} of {required} required &middot; {lockedCount} locked &middot; {totalDelivOf(camp)} deliverables</span>{camp.sentToClient&&<span style={{fontSize:9,color:T.green,marginLeft:8}}>&middot; sent to client</span>}</div>
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        {canEdit&&<>
          <Btn variant="ghost" onClick={()=>setShowAdd(true)} style={{fontSize:9.5,padding:"4px 10px"}}>+ Add Creator</Btn>
          <Btn variant="ghost" onClick={generate} disabled={flagged||generating} style={{fontSize:9.5,padding:"4px 10px",color:flagged?T.red:generating?T.sub:T.text,borderColor:flagged?`${T.red}22`:T.border}}>{generating?"Generating…":flagged?`Flagged (${genRounds}×)`:"Generate"}</Btn>
        </>}
      </div>
    </div>
    {flagged&&<div style={{padding:"8px 10px",borderRadius:5,border:`1px solid ${T.red}22`,fontSize:10,color:T.red,marginBottom:12,background:T.raised}}>{genRounds}× the required count generated. Founder approval required to continue.</div>}
    <div style={{overflowX:"auto",borderRadius:6,border:`1px solid ${T.border}`}}>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:1080}}>
        <thead><tr>
          {CREATOR_COLS.filter(c=>c.key!=="cost"||canCrFin(role)).filter(c=>!["payType","payId"].includes(c.key)||canFin(role)).map(col=>(
            <th key={col.key} title={col.cv?undefined:"Internal only"} style={{...thS,width:col.w,minWidth:col.w}}>{col.label}</th>
          ))}
          {(canEdit||canFin(role))&&<th style={{...thS,width:130}}></th>}
        </tr></thead>
        <tbody>
          {creators.length===0&&<tr><td colSpan={12} style={{...tdS,textAlign:"center",color:T.label,padding:"24px"}}>No creators yet. Generate or add manually.</td></tr>}
          {creators.map((cr,i)=>{
            const stCol=CR_COLOR[cr.status]||T.sub;
            return(<tr key={cr._id} style={{background:i%2===0?"transparent":T.hover}}>
              <td style={{...tdS,color:T.text}}><div style={{display:"flex",alignItems:"center",gap:7}}><Av init={(cr.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2)} size={22}/><div><div style={{fontSize:11,fontWeight:500,color:T.text}}>{cr.name}</div><CreatorHandle creator={cr} style={{fontSize:9,color:T.label,display:"block"}}/></div></div></td>
              <td style={tdS}>{cr.platform}</td>
              <td style={tdS}>{fmtNum(cr.followers)}</td>
              <td style={{...tdS,color:T.text}}>{cr.avgER!=null?`${cr.avgER}%`:"—"}</td>
              <td style={tdS}>{cr.niche||"—"}</td>
              <td style={tdS}>{cr.state||"—"}</td>
              {/* Reads as an interactive control, not a label. With no border,
                  no background and appearance:none it was indistinguishable
                  from the plain text in every other cell, so nobody could tell
                  the journey stage was changeable from here.
                  Locked is a one-way door — see LockCreatorModal. Once it is
                  taken the dropdown becomes a plain pill, because there is no
                  longer a choice to offer. */}
              <td style={tdS}>{canEdit&&!isLocked(cr)
                ? <span style={{position:"relative",display:"inline-block"}}>
                    <select value={cr.status}
                      onChange={e=>e.target.value==="locked"?setLockTarget(cr):patch(cr._id,{status:e.target.value})}
                      title="Change shortlist status"
                      style={{appearance:"none",WebkitAppearance:"none",cursor:"pointer",outline:"none",
                        fontSize:10.5,fontWeight:600,fontFamily:"'Sora'",color:stCol,
                        background:`${stCol}12`,border:`1px solid ${stCol}40`,borderRadius:20,
                        padding:"3px 22px 3px 10px"}}>
                      {CR_JOURNEY.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <span style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",fontSize:7,color:stCol}}>▼</span>
                  </span>
                : <span title={canEdit&&isLocked(cr)?"Locked is final — this creator's fee is committed in Billing. Remove them from the roster if the deal falls through.":undefined}
                    style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:10.5,fontWeight:600,fontFamily:"'Sora'",color:stCol,
                      ...(canEdit&&isLocked(cr)?{background:`${stCol}12`,border:`1px solid ${stCol}40`,borderRadius:20,padding:"3px 10px",cursor:"default"}:{})}}>
                    {CR_JOURNEY.find(s=>s.id===cr.status)?.label}{canEdit&&isLocked(cr)&&<span style={{fontSize:8}}>🔒</span>}
                  </span>}</td>
              {/* Locking a creator is what posts their cost to Billing as a
                  committed expense. Editing it afterwards silently re-prices a
                  commitment the books have already recorded — and, once an
                  invoice has been generated against it, disagrees with a PDF
                  that has left the building. Since Locked is now one-way, the
                  only route back is Remove, which cancels the expense outright
                  — the honest audit trail for a deal that fell through. */}
              {canCrFin(role)&&<td style={tdS}>{canEdit&&!isLocked(cr)
                ? <CostCell value={costOf(cr)} onCommit={n=>patch(cr._id,{cost:n})} style={{width:76,background:"transparent",border:"none",borderBottom:`1px solid ${T.border}`,color:T.text,fontSize:11,fontFamily:"'Sora'",outline:"none",padding:"2px 0"}}/>
                : <span title={canEdit&&isLocked(cr)?"Cost is locked — this creator's fee is committed in Billing and locking is final. Remove them from the roster if the deal falls through.":undefined}
                    style={{color:T.text,...(canEdit&&isLocked(cr)?{cursor:"not-allowed"}:{})}}>
                    {fmtINR(costOf(cr))}{canEdit&&isLocked(cr)&&<span style={{fontSize:9,color:T.label,marginLeft:5}}>🔒</span>}
                  </span>}</td>}
              {canFin(role)&&<td style={tdS}>{canEdit?<select value={cr.payType||""} onChange={e=>patch(cr._id,{payType:e.target.value||null,payId:null})} style={{background:"transparent",border:`1px solid ${T.border}`,color:cr.payType?T.text:T.label,fontSize:10,fontFamily:"'Sora'",outline:"none",cursor:"pointer",borderRadius:4,padding:"3px 5px"}}>{PAYMENT_TYPES.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select>:<span style={{fontSize:10,color:T.text}}>{PAYMENT_TYPES.find(p=>p.id===cr.payType)?.label||"—"}</span>}</td>}
              {(canEdit||canFin(role))&&<td style={{...tdS,textAlign:"right"}}><div style={{display:"flex",gap:5,justifyContent:"flex-end"}}>
                {can(role,"editCreatorDetails")&&<button onClick={()=>setEditTarget(cr)} title="Edit all creator details" style={{fontSize:9,color:T.sub,background:"transparent",border:`1px solid ${T.borderMid}`,borderRadius:4,padding:"3px 8px",cursor:"pointer",fontFamily:"'Sora'"}}>Edit</button>}
                {canFin(role)&&(cr.invoiceNo
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
    {suggested.length>0&&<div style={{marginTop:20}}><Hr style={{marginBottom:14}}/><div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><Lbl>Suggested — Round {genRounds}</Lbl><span style={{fontSize:9,color:T.sub}}>{required-creators.length} spots remaining</span></div>
      <div style={{overflowX:"auto",borderRadius:6,border:`1px solid ${T.border}`}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}><thead><tr>{["Creator","Platform","Followers","Avg ER%","Niche",...(canCrFin(role)?["Est. Cost"]:[]),""].map(h=><th key={h} style={{...thS}}>{h}</th>)}</tr></thead><tbody>{suggested.map((cr,i)=><tr key={cr._id} style={{opacity:creators.length>=required?0.35:1}}><td style={{...tdS,color:T.text}}><div style={{display:"flex",alignItems:"center",gap:7}}><Av init={(cr.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2)} size={20}/><div><div style={{fontSize:11,fontWeight:500}}>{cr.name}</div><CreatorHandle creator={cr} style={{fontSize:9,color:T.label,display:"block"}}/></div></div></td><td style={tdS}>{cr.platform}</td><td style={tdS}>{fmtNum(cr.followers)}</td><td style={{...tdS,color:T.text}}>{cr.avgER!=null?`${cr.avgER}%`:"—"}</td><td style={tdS}>{cr.niche||"—"}</td>{canCrFin(role)&&<td style={tdS}>{fmtINR(costOf(cr))}</td>}<td style={{...tdS,textAlign:"right"}}><div style={{display:"flex",gap:5,justifyContent:"flex-end"}}><Btn variant="ghost" onClick={()=>addFromSugg(cr)} disabled={creators.length>=required} style={{fontSize:9,padding:"3px 9px"}}>Add</Btn><Btn variant="subtle" onClick={()=>setSuggested(p=>p.filter(c=>c._id!==cr._id))} style={{fontSize:9,padding:"3px 9px"}}>Skip</Btn></div></td></tr>)}</tbody></table></div>
    </div>}
    {removeTarget&&<RemoveModal creator={removeTarget} onConfirm={confirmRemove} onCancel={()=>setRemoveTarget(null)}/>}
    {lockTarget&&<LockCreatorModal creator={lockTarget} onConfirm={confirmLock} onCancel={()=>setLockTarget(null)}/>}
    {showAdd&&<AddCreatorModal onAdd={cr=>sync([...creators,cr])} onClose={()=>setShowAdd(false)}/>}
    {editTarget&&<AddCreatorModal editing={editTarget} onAdd={cr=>sync(creators.map(c=>c._id===cr._id?cr:c))} onClose={()=>setEditTarget(null)}/>}
    {invoiceTarget && (
      <InvoiceDetailsModal camp={camp} creator={creators.find(c=>c._id===invoiceTarget._id)||invoiceTarget} creators={creators} onClose={()=>setInvoiceTarget(null)} onUpdateCreators={sync} onLogTimeline={onLogTimeline}/>
    )}
  </div>);
}

// ── DRAFT-ON-BLUR MONEY CELL ─────────────────────────────────────────────────
// Same reasoning as AssetCell below: a free-text field must not commit per
// keystroke. Typing "1,50,000" through the raw MoneyInput fired six full
// campaign PATCHes plus — for a locked creator — six expense PATCHes, all
// racing each other, and every intermediate value ("1", "15", "150"…) was
// briefly the creator's real committed cost in Billing.
// Hold a local draft, commit once on blur, and re-sync when the underlying
// value changes (so switching creators never shows a stale draft). Shared by
// every free-text cell that writes straight to the campaign — typing "150000"
// per keystroke fires six PATCHes racing each other, and each intermediate
// value is briefly real.
function useDraft(value,onCommit,parse){
  const [draft,setDraft]=useState(String(value ?? ""));
  useEffect(()=>{setDraft(String(value ?? ""));},[value]);
  const commit=()=>{const n=parse(draft); if(n!==value) onCommit(n);};
  return [draft,setDraft,commit];
}

function CostCell({value,onCommit,style}){
  const [draft,setDraft,commit]=useDraft(value,onCommit,d=>parseInt(d)||0);
  return <MoneyInput value={draft} onChange={setDraft} onBlur={commit}
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
// The two columns were duplicated blocks differing only by label and patcher.
//
// The file link is now always present, at every status — the link IS the
// deliverable, so hiding the field until the status happened to be Received or
// Rework meant an approved asset had nowhere to record where it lives.
//
// The input holds a local draft and commits on blur rather than on change.
// Committing per keystroke fired a full campaign PATCH per character — dozens
// of round trips to type one Drive URL, each racing the last.
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
function TabDeliverables({camp,role,onUpdateCreators,onLogTimeline}){
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
  // Forwards are reported as an AVERAGE PER POST, not a campaign total. A total
  // says more about how many creators are live than about how shareable the
  // content is, so it climbed all through execution and could never be compared
  // against another campaign. The average is the per-post number a creator or a
  // concept can actually be judged on.
  //
  // Denominator counts only posts on platforms that report forwards — YouTube
  // returns null, and folding those posts in would halve the average of a mixed
  // roster for no reason other than the platform mix. postsCounted is what the
  // refresh recorded; ||1 covers rows tracked before it existed.
  const fw=wd.filter(c=>c.tracking.forwards!=null);
  const totF=fw.reduce((s,c)=>s+c.tracking.forwards,0);
  const fwPosts=fw.reduce((s,c)=>s+(c.tracking.postsCounted||1),0);
  const avgF=fwPosts>0?totF/fwPosts:null;
  // OVERALL CPV — the campaign's cost per view across every post that has
  // reported back, which is the number this card exists to give.
  //
  // The cost is summed over `wd` (creators WITH view data), not `rows` (every
  // locked creator), and the difference is the whole correctness of the metric.
  // Summing over `rows` divided one set by another: the fees of creators who
  // hadn't posted yet were charged against views only the posted ones had
  // produced. On a campaign three creators deep with one live, CPV read ~3x its
  // real value and fell as the others went up — so the number moved most when
  // nothing about the media buy had changed, and two campaigns could never be
  // compared unless they happened to be equally far along.
  //
  // Matching the sets makes it a true cost-per-view of the measured portion, and
  // the "Based on N of M creators with live data" line below already states the
  // scope that qualifies it.
  //Overall CPV → Creator Cost / Views
//External CPV → Campaign Budget / Views
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
    {l:"Overall CPV",v:cpv!=null?`₹${cpv.toFixed(5)}`:"—",show:canCrFin(role)},
    {l:"External CPV",v:externalCpv!=null?`₹${externalCpv.toFixed(5)}`:"—",show:canFin(role)},  // campaign-wide creator fees ÷ views, over the same set of creators
    {l:"Avg ER",v:er!=null?`${er.toFixed(1)}%`:"—",show:true},
    {l:"Avg Forwards",v:avgF!=null?fmtNum(Math.round(avgF)):"—",show:true},
  ].filter(s=>s.show);
  return(<div>
    {wd.length>0&&<div style={{marginBottom:20}}>
      <div style={{display:"grid",gridTemplateColumns:`repeat(${agg.length},1fr)`,gap:8,marginBottom:6}}>
        {agg.map(s=><div key={s.l} style={{padding:"12px 14px",background:T.raised,borderRadius:7,border:`1px solid ${T.border}`}}><div style={{fontSize:8.5,color:T.label,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600}}>{s.l}</div><div style={{fontSize:18,fontWeight:600,color:T.text,lineHeight:1}}>{s.v}</div></div>)}
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
                <span style={{display:"flex",alignItems:"center",gap:3,fontSize:8.5,color:posted>=target?T.green:T.label,whiteSpace:"nowrap"}}>
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
        </div>);
      })}
    </div>
  </div>);
}

// ── BRIEF TAB ────────────────────────────────────────────────────────────────
function TabBrief({camp,role,currentUser,onSaveBrief,onSaveCampaign,onAction,onGoTab}){
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
      const numReq=Math.max(1,parseInt(draft?.numReq)||1);
      const deliverablesPerCreator=Math.max(1,parseInt(draft?.perDeliv)||1);
      const patch={};
      if(numReq!==numReqOf(camp)) patch.numReq=numReq;
      if(deliverablesPerCreator!==perCreatorDelivOf(camp)) patch.deliverablesPerCreator=deliverablesPerCreator;
      if(Object.keys(patch).length) onSaveCampaign(patch);
    } else if(key==="budget"){
      const n=parseInt(draft)||0;
      if(n<creatorBudgetOf(camp)) return;          // guarded by the button too
      // `brief.budget` is the FORMATTED string the client portal renders in the
      // brief. It was written once at creation and never again, so it went
      // stale the moment anyone touched the budget. Kept in step here rather
      // than re-derived, because the portal reads the brief as authored.
      if(n!==(camp.budget||0)) onSaveCampaign({budget:n,brief:{...camp.brief,budget:fmtINR(n)}});
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
  const tbUnder=edit==="budget"&&mNum<creatorBudgetOf(camp);
  // Both dates required, and in order. Checked here so the Save button and the
  // commit guard read the same condition.
  const tlBad=edit==="timeline"&&(!draft?.start||!draft?.end||draft.end<draft.start);

  return(<div>
    {field({fieldKey:"objective",label:"Objective",value:camp.brief.objective||"",render:txt(camp.brief.objective),children:area})}<Hr/>
    {field({fieldKey:"audience",label:"Audience",value:camp.brief.audience||"",render:txt(camp.brief.audience),children:area})}<Hr/>
    {field({fieldKey:"messages",label:"Key Messages",value:camp.brief.messages||"",children:area,
      render:<div style={{fontSize:12,color:camp.brief.messages?T.text:T.label,lineHeight:1.6,fontStyle:camp.brief.messages?"normal":"italic"}}>{camp.brief.messages||"Not specified — AM to fill"}</div>})}<Hr/>
    {field({fieldKey:"deliverables",label:"Deliverables",value:camp.brief.deliverables||[],
      children:<DelvSelect value={draft||[]} onChange={setDraft}/>,
      render:(camp.brief.deliverables||[]).length>0
        ? <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{camp.brief.deliverables.map(d=><span key={d} style={{fontSize:10.5,color:T.sub,padding:"3px 8px",background:T.mute,borderRadius:3}}>{d}</span>)}</div>
        : <div style={{fontSize:12,color:T.label,fontStyle:"italic"}}>Not selected — AM to choose</div>})}<Hr/>
    {/* Scope: how many creators, how many posts each. Both are quoted to the
        client, and `numReq` is what the roster gate counts to, so it stays
        editable one stage longer than the rest of the brief (see canEditCommercials).
        The total shown is the live one — per-creator overrides on the
        Deliverables tab are already counted in it. */}
    {field({fieldKey:"scope",label:"Scope",editable:canEditCommercials,
      value:{numReq:String(numReqOf(camp)),perDeliv:String(perCreatorDelivOf(camp))},
      render:<div style={{fontSize:12,color:T.text}}>{numReqOf(camp)} creators · {perCreatorDelivOf(camp)} deliverable{perCreatorDelivOf(camp)!==1?"s":""} each <span style={{fontSize:10,color:T.label}}>· {totalDelivOf(camp)} total</span></div>,
      children:<>
        <div style={{display:"flex",gap:10}}>
          {[["numReq","Creators"],["perDeliv","Deliverables each"]].map(([k,l])=>(
            <div key={k}>
              <Lbl style={{display:"block",marginBottom:4}}>{l}</Lbl>
              <input type="number" min={1} value={draft?.[k]??""} onChange={e=>setDraft(d=>({...d,[k]:e.target.value}))} style={{...INP,resize:"none",maxWidth:120}}/>
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
    {canFin(role)&&<>{field({fieldKey:"budget",label:"Total budget",editable:canEditCommercials,
      value:String(camp.budget||0),invalid:tbUnder,
      render:<div style={{fontSize:12,color:camp.budget?T.text:T.label}}>{camp.budget?fmtINR(camp.budget):"—"}</div>,
      children:<>
        <MoneyInput value={draft||""} onChange={setDraft} placeholder="e.g. 12,50,000" style={{...INP,resize:"none",maxWidth:180}}/>
        <div style={{fontSize:9.5,color:tbUnder?T.red:T.sub,marginTop:4}}>
          {tbUnder
            ? `Can't be below the creator budget of ${fmtINR(creatorBudgetOf(camp))}.`
            : "What the client is billed. The invoice raised when the PO is recorded is drawn from this."}
        </div>
      </>})}<Hr/></>}
    {canCrFin(role)&&<>
      {field({fieldKey:"creatorBudget",label:"Creator budget",value:String(creatorBudgetOf(camp)),invalid:cbOver,
        render:<div style={{fontSize:12,color:T.text}}>{fmtINR(creatorBudgetOf(camp))} <span style={{fontSize:10,color:T.label}}>· ≈ {fmtINR(perCreatorOf(camp))} per creator × {numReqOf(camp)}</span></div>,
        children:<>
          <MoneyInput value={draft||""} onChange={setDraft} placeholder="e.g. 7,50,000" style={{...INP,resize:"none",maxWidth:180}}/>
          <div style={{fontSize:9.5,color:cbOver?T.red:T.sub,marginTop:4}}>
            {cbOver
              ? `Can't exceed the total budget of ${fmtINR(camp.budget)}.`
              : `≈ ${fmtINR(numReqOf(camp)>0?Math.round(mNum/numReqOf(camp)):0)} per creator × ${numReqOf(camp)}`}
          </div>
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
        Locking freezes the brief text and raises the client quote. Scope, budget and dates stay editable until the client PO is recorded; the brief itself can't be edited afterwards.
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
          ["Client quote","raised in Billing from the campaign's own budget split"],
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
// One rule: slots are freely assignable and re-assignable up to the PO, and
// frozen from then on. That boundary is the same one the brief uses (beforePO)
// — once the PO is raised the campaign is committed to the client, and moving
// it off someone also revokes their access to it (see canSee), so past that
// point it's a governance decision rather than an inline edit.
//
// These slots are also the Draft gate: filling all three moves the campaign to
// Brief Log on its own (see the assign_* cases in onAction). That's why the
// form warns before the last slot is saved — the transition is automatic, so
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
function TabFinancials({camp,role}){
  const cb=creatorBudgetOf(camp),af=(camp.budget||0)-cb;
  const cmt=(camp.creators||[]).reduce((s,c)=>s+costOf(c),0);
  const marginPct=camp.budget>0?(af/camp.budget)*100:0;
  const rows=[
    {label:"Total budget",value:fmtINR(camp.budget),color:T.text,show:canFin(role)},
    {label:"Creator budget",value:fmtINR(cb),color:T.sub,show:true},
    {label:"Per-creator target",value:`≈ ${fmtINR(perCreatorOf(camp))} × ${numReqOf(camp)}`,color:T.sub,show:true},
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
  if (stage==="team_assigned") {
    const gap=rosterGap(camp);
    if (isAcc) actions.push({label:"Record Client PO", action:"raise_po", variant:"primary", disabled:!!gap});
    else if (!gap) actions.push({action:null, hint:"Waiting on Accounts to record the client's Purchase Order"});
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
  // Selecting a different campaign resets the panel to Brief — the tab chosen
  // on one campaign shouldn't leak onto the next.
  useEffect(()=>{setTab("brief");setConfirmDelete(false);setExtending(false);setSheet(null);setRaisingPO(false);},[camp.id]);
  // raise_po needs a form before it can do anything, so it opens ClientPOModal
  // instead of firing straight through. Everything else passes untouched.
  const handleAction=(action,data)=>action==="raise_po"?setRaisingPO(true):onAction(action,data);
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
            {[...(canFin(role)?[{k:"Budget",v:fmtINR(camp.budget)}]:[]),
              {k:"Creators",v:`${lockedCountOf(camp)} of ${numReqOf(camp)} locked`},
              {k:"Progress",v:`${progressOf(camp)}%`},
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
            {tab==="brief"        &&<TabBrief        camp={camp} role={role} currentUser={currentUser} onAction={onAction} onSaveBrief={onSaveBrief} onSaveCampaign={onSaveCampaign} onGoTab={setTab}/>}
            {tab==="team"         &&<TabTeam         camp={camp} role={role} onAction={onAction}/>}
            {tab==="creators"     &&<TabCreators     camp={camp} role={role} onUpdateCreators={onUpdateCreators} onLogTimeline={onLogTimeline}/>}
            {tab==="deliverables" &&<TabDeliverables camp={camp} role={role} onUpdateCreators={onUpdateCreators} onLogTimeline={onLogTimeline}/>}
            {tab==="timeline"     &&<TabTimeline     camp={camp}/>}
            {tab==="financials"   &&(canFin(role)||canCrFin(role))&&<TabFinancials camp={camp} role={role}/>}
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
const STEPS=[
  {id:"Basics",     title:"Start with the basics",     sub:"A name and a brand is most of it."},
  {id:"Brief",      title:"What's the campaign for?",  sub:"Objective is the one thing worth pinning down now — the rest can be written properly later, on its own tab."},
  {id:"Commercial", title:"Scope and money",           sub:"The budget, how many creators it buys, and when it runs."},
  {id:"Internal",   title:"Anything the client shouldn't see?", sub:"Optional. Check the summary and you're done."},
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
  // creatorBudgetMode decides which of the two creator-budget inputs is live —
  // the other is kept around so toggling back doesn't lose what was typed.
  //
  // brandId seeds from the active brand filter. Someone working inside one
  // brand — the whole app is filtered to it, every campaign on screen is
  // theirs — was still landing on an empty brand picker and re-choosing it,
  // and picking the wrong one silently files the campaign (and every invoice
  // and PO that follows) under another client. It stays a normal editable
  // field; only the default changes. `brands` may not have loaded yet, so the
  // id is validated against the list before it's trusted.
  const [f,setF]=useState({name:"",brandId:brands.some(b=>b.id===brandFilter)?brandFilter:"",service:"Influencer Marketing",region:"",niches:[],budget:"",numCreators:5,deliverablesPerCreator:1,creatorBudgetMode:"pct",creatorBudgetPct:60,creatorBudgetAmt:"",objective:"",audience:"",messages:"",deliverables:[],timelineStart:"",timelineEnd:"",internalNotes:""});
  // Staged only — nothing is written to the backend until the campaign is
  // actually submitted, so abandoning this modal never leaves an orphan brand.
  const [pendingBrandName,setPendingBrandName]=useState(null);
  const [submitting,setSubmitting]=useState(false);
  const [brandErr,setBrandErr]=useState(null);
  const u=(k,v)=>setF(p=>({...p,[k]:v}));
  const merge=patch=>setF(p=>({...p,...patch}));
  const budgetNum=parseInt(f.budget)||0;
  const creatorBudget=resolveCreatorBudget(f,budgetNum);
  // Per-step required fields — Next/Create stay disabled until the current
  // step's required inputs are filled (Brief + Internal have none).
  const stepOk=[
    !!(f.name.trim()&&f.service&&f.brandId),
    !!f.objective.trim(),
    budgetNum>0&&parseInt(f.numCreators)>0&&parseInt(f.deliverablesPerCreator)>0&&creatorBudget>0&&creatorBudget<=budgetNum&&!!f.timelineStart&&!!f.timelineEnd&&f.timelineEnd>=f.timelineStart,
    true,
  ];
  const ok=stepOk[step];
  const allOk=stepOk.every(Boolean);
  const timelineLabel=f.timelineStart&&f.timelineEnd?`${prettyDate(f.timelineStart)} – ${prettyDate(f.timelineEnd)}`:"";
  const handleSubmit=async()=>{
    if(!allOk)return;
    // creatorBudget is resolved here rather than in onCreate so the stored
    // number is exactly the one the wizard showed, whichever mode was used.
    const payload={...f,timeline:timelineLabel,creatorBudget};
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
  const next=()=>ok&&setStep(s=>Math.min(s+1,STEPS.length-1));
  // Enter advances the wizard from any single-line input, the way every other
  // form on the web behaves. Textareas keep Enter for newlines.
  const onKeyDown=e=>{
    if(e.key!=="Enter"||e.target.tagName==="TEXTAREA")return;
    e.preventDefault();
    step<STEPS.length-1?next():allOk&&handleSubmit();
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
          <Field label="Campaign name"><input value={f.name} onChange={e=>u("name",e.target.value)} placeholder="e.g. Summer Launch Teaser" style={{...INP,resize:"none"}}/></Field>
          <Field label="Brand" hint={f.brandId==="__new__"&&pendingBrandName?`"${pendingBrandName}" will be created when you submit this campaign.`:undefined}>
            <BrandPicker brands={brands} value={f.brandId} pendingName={pendingBrandName}
              onSelect={id=>{u("brandId",id);setPendingBrandName(null);}}
              onCreate={name=>{setPendingBrandName(name);u("brandId","__new__");}}/>
          </Field>
          {brandErr&&<div style={{fontSize:10.5,color:T.red,marginBottom:10}}>{brandErr}</div>}
          <Field label="Service"><select value={f.service} onChange={e=>u("service",e.target.value)} style={{...INP,resize:"none"}}>{["Influencer Marketing","IM — Mass","IM — Sales"].map(s=><option key={s}>{s}</option>)}</select></Field>
          <Field label="Region" optional style={{marginBottom:0}}><input value={f.region} onChange={e=>u("region",e.target.value)} placeholder="e.g. South India" style={{...INP,resize:"none"}}/></Field>
        </>}
        {step===1&&<>
          {[["Objective","objective",60,false],["Target audience","audience",50,true],["Key Messages","messages",50,true]].map(([l,k,h,opt])=>
            <Field key={k} label={l} optional={opt}><textarea value={f[k]} onChange={e=>u(k,e.target.value)} style={{...INP,minHeight:h}}/></Field>)}
          <Field label="Deliverables" optional style={{marginBottom:0}}><DelvSelect value={f.deliverables} onChange={v=>u("deliverables",v)}/></Field>
        </>}
        {step===2&&<>
          <Field label="Total budget (₹)"><MoneyInput value={f.budget} onChange={v=>u("budget",v)} placeholder="e.g. 12,50,000" style={{...INP,resize:"none"}}/></Field>
          {/* The two numbers that size a campaign. Deliverables-per-creator is
              the PLAN — any single creator can be set higher on the
              Deliverables tab without changing it (see delivTargetOf). */}
          <Field label="Scope" hint={`${nCr*nDv} deliverables planned in total — individual creators can be set higher later.`}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><Lbl style={{display:"block",marginBottom:4,fontSize:8.5}}>Creators required</Lbl><input type="number" min={1} value={f.numCreators} onChange={e=>u("numCreators",e.target.value)} placeholder="5" style={{...INP,resize:"none"}}/></div>
              <div><Lbl style={{display:"block",marginBottom:4,fontSize:8.5}}>Deliverables each</Lbl><input type="number" min={1} value={f.deliverablesPerCreator} onChange={e=>u("deliverablesPerCreator",e.target.value)} placeholder="1" style={{...INP,resize:"none"}}/></div>
            </div>
          </Field>
          <CreatorBudgetField
            budget={budgetNum} numCreators={nCr}
            mode={f.creatorBudgetMode} pct={f.creatorBudgetPct} amount={f.creatorBudgetAmt}
            onChange={merge} showAgency={canFF(role)}/>
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
          </Field>
        </>}
        {step===3&&<>
          {/* Everything the three steps behind you added up to. The last screen
              was one textarea, which is a strange place to be asked to commit
              without being shown what you're committing to. */}
          <div style={{display:"flex",flexWrap:"wrap",gap:"12px 26px",padding:"13px 15px",borderRadius:10,background:`${T.accent}08`,border:`1px solid ${T.accent}1F`,marginBottom:16}}>
            <Stat small label="Campaign" value={f.name||"—"}/>
            <Stat small label="Brand" value={brandLabel}/>
            <Stat small label="Budget" value={budgetNum?fmtINR(budgetNum):"—"}/>
            <Stat small label="Scope" value={`${nCr} creators · ${nDv} each`}/>
            <Stat small label="Window" value={timelineLabel||"—"}/>
          </div>
          <Field label="Internal notes — never visible to client" optional style={{marginBottom:0}}>
            <textarea value={f.internalNotes} onChange={e=>u("internalNotes",e.target.value)} placeholder="Margin targets, context…" style={{...INP,minHeight:90,borderColor:`${T.amber}30`}}/>
          </Field>
        </>}
      </div>
      <div style={{padding:"14px 20px",borderTop:`1px solid ${T.border}`,display:"flex",gap:8,alignItems:"center"}}>
        {step>0&&<Btn variant="ghost" onClick={()=>setStep(s=>s-1)}>← Back</Btn>}
        <div style={{flex:1}}/>
        {step<STEPS.length-1
          ? <Btn variant="primary" onClick={next} disabled={!ok}>Next →</Btn>
          : <Btn variant="success" onClick={handleSubmit} disabled={submitting||!allOk}>{submitting?"Creating…":"Create campaign"}</Btn>}
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
      // Legacy shapes are normalised once, here, so nothing downstream ever
      // sees a retired 16-stage id (LEGACY_STAGE) or a creator still carrying
      // `fee`/`negotiatedCost` instead of `cost` (normCreator). Nothing is
      // written back on load — the mapped values persist with the next save the
      // campaign makes, which self-heals the collection on its own.
      //
      // The creator half matters for release safety: without it, every read of
      // `cr.cost` depends on scrap/migrate_creator_fee_to_cost.js having already
      // run against that environment. Deploy the two in the wrong order and
      // creator invoices render ₹0 and locked creators post an expense of zero
      // — silently, because 0 is a legal cost.
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
        // Every gated transition re-checks its condition HERE as well as in the
        // UI. The reducer is the only write path, so guarding it means a stale
        // render (or a second tab) can't push a campaign through a gate that
        // has stopped being satisfied.
        //
        // Locking the brief lands on Team Assigned directly when the team is
        // already staffed. That case is normal, not exotic: the wizard stamps
        // the creator into their own slot, so a campaign raised by an AM only
        // needs a CM and an EA, and both may well be picked before anyone
        // writes the brief. Stopping at Brief Locked with nothing left to
        // assign would strand it on a node it had already satisfied.
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
        case "raise_po": next=rosterGap(c)?(blocked=`Roster not confirmed — ${rosterGap(c)}`,c)
          :data.poNumber?{...c,stage:"po_raised",
          timeline:addEv(`Client PO ${data.poNumber} recorded — ${fmtINR(data.amount)}, awaiting advance`,currentUser.name||"Accounts")}:(blocked="A client PO number is required",c);break;
        case "advance_received": next={...c,stage:"advance_received",advanceReceivedOn:today(),
          timeline:addEv("Advance received from the client",currentUser.name||"Accounts")};break;
        case "raise_invoice": next={...c,stage:"invoice_raised",invoiceRaisedOn:today(),
          timeline:addEv("Client invoice issued — NET 30",currentUser.name||"Accounts")};break;
        case "payment_done": next={...c,stage:"payment_done",paidOn:today(),
          timeline:addEv("Client payment received in full",currentUser.name||"Accounts")};break;
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
        // The lock is the moment the commercials stop being a draft: the budget
        // and the creator split are agreed and the brief freezes. That is what a
        // quote is, so it is raised here — with the campaign's real numbers,
        // not the invented percentages the old auto-quote carried.
        //
        // The quote's margin is expressed as a single percentage because that
        // is the shape quoteMargin() takes, and it resolves back to exactly the
        // campaign's own split: margin = budget − creator pool, ops = pool.
        // `updatedCamp`, not `next` — `next` is scoped to the setCampaigns
        // updater above, so reading it here threw a ReferenceError before the
        // create could fire. The stage had already been PATCHed on the line
        // above, so the lock moved the campaign on and silently raised no quote
        // at all. Caught by walking the UI; an API-level test can't see it,
        // because the test makes the POST itself.
        if(action==="lock_brief"&&briefLocked(updatedCamp)){
          const budget=updatedCamp.budget||0, pool=creatorBudgetOf(updatedCamp);
          if(budget>0) QuotesAPI.create({
            id:`QT-${id}`, campaignId:id, client:updatedCamp.client||"",
            brandId:updatedCamp.brandId||null,
            label:`${updatedCamp.name} — Quote`, status:"pending_review",
            createdDate:today(), validTill:addDays(today(),30),
            marginPct: Math.round(((budget-pool)/budget)*1000)/10,
            agencyFeePct:0, agencyFeeType:"baked_in", isRetainerClient:false,
            lines:[{desc:`Influencer Marketing — ${updatedCamp.name}`,sac:"998361",qty:1,rate:budget,gstRate:18}],
            notes:"Raised when the brief was locked. Review and send before recording the client's PO.",
          }).catch(warn("Quote not raised"));
        }
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
          // Paid in full: the invoice closes and any outstanding leg closes
          // with it, so Collected and Outstanding agree with the stage.
          payment_done: inv => ({
            status:"paid", paidDate:today(),
            ...(inv.schedule?.final?{schedule:{...inv.schedule,final:{...inv.schedule.final,status:"paid",paidDate:today()}}}:{}),
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
    const budget = parseInt(f.budget)||0;
    const c={
      id:campId, name:f.name, client:brandName(f.brandId)||"", brandId:f.brandId, service:f.service,
      region:f.region||"TBD", niches:f.niches||[], stage:"draft",
      budget, creatorBudget:Math.min(f.creatorBudget||0,budget),
      numReq:parseInt(f.numCreators)||5, deliverablesPerCreator:parseInt(f.deliverablesPerCreator)||1,
      start:f.timelineStart||today(), end:f.timelineEnd||"TBD",
      createdBy:currentUser.teamId,
      amId, cmId, eaId,
      brief:{objective:f.objective,audience:f.audience,messages:f.messages,deliverables:f.deliverables,budget:fmtINR(budget),timeline:timelineLabel(f.timelineStart,f.timelineEnd)},
      briefStatus:"draft", amNote:"", cmNote:"", creators:[], genRounds:0,
      sentToClient:false, internalNotes:f.internalNotes,
      timeline:[{date:today(),event:"Campaign created",actor:currentUser.name||role.toUpperCase()}],
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
  const inScope=useMemo(()=>campaigns.filter(c=>{
    if(!canSee(c,role,currentUser.teamId))return false;
    if(brandFilter&&c.brandId!==brandFilter)return false;
    if(search){const s=search.toLowerCase();if(!c.name.toLowerCase().includes(s)&&!c.client.toLowerCase().includes(s))return false;}
    return true;
  }),[campaigns,role,currentUser.teamId,search,brandFilter]);
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
          <div style={{padding:"16px 20px 14px",borderBottom:"1px solid rgba(0,0,0,0.07)",flexShrink:0,background:"#FFFFFF"}}>
            <div style={{display:"flex",alignItems:"center",marginBottom:14}}>
              <div>
                <h1 style={{fontFamily:"'Newsreader',serif",fontSize:20,fontWeight:600,color:"#1D1D1F",margin:0,fontStyle:"italic",letterSpacing:"-0.02em"}}>IM Campaigns</h1>
                <div style={{fontSize:10.5,color:"#86868B",fontFamily:SF,marginTop:2}}>5th Avenue · Influencer Marketing</div>
              </div>
              <div style={{flex:1}}/>
              {canCreate(role)&&<Btn variant="primary" onClick={()=>setCreate(true)} style={{padding:"8px 16px",fontSize:12}}>+ New</Btn>}
            </div>
            {/* Search sits ABOVE the views, because it narrows what they count:
                every number in the bar is a count of the searched set. */}
            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:12}}>
              <div style={{position:"relative",flex:"1 1 320px",maxWidth:380}}>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search campaigns or clients…" style={{width:"100%",padding:"8px 12px 8px 30px",borderRadius:9,background:"rgba(0,0,0,0.04)",border:"1px solid rgba(0,0,0,0.08)",color:"#1D1D1F",fontSize:12,fontFamily:SF,outline:"none",boxSizing:"border-box"}}/>
                <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"#86868B",pointerEvents:"none"}}>⌕</span>
              </div>
              <div style={{flex:1}}/>
            </div>
            <ViewBar counts={viewCounts} value={stageFilter} onChange={setStageF}/>
          </div>
          {/* Ended-tab notice */}
          <AnimatePresence initial={false}>
            {showEndedNotice&&<EndedNotice key="ended-notice" count={endedCount} onDismiss={()=>setNoticeAck(endedCount)}/>}
          </AnimatePresence>
          {/* Grid */}
          <div style={{flex:1,minHeight:0,overflowY:"auto"}}>
            <CampaignGrid campaigns={visible} role={role} onSelect={setSelId} brandName={brandName} brandLogoUrl={brandLogoUrl} onEditLogo={canEditBrand?setLogoBrandId:undefined} brandFilter={brandFilter}/>
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