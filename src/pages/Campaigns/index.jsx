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
 *  7. Deliverables tab → aggregate stat cards (Views, Likes, CPV, ER, Forwards, % Positive).
 *  8. Fee input step = 100.
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { CampaignsAPI, InstagramAPI, YouTubeAPI, PostMetricsAPI, InvoicesAPI, ClientPOsAPI, ClientsAPI, InvoicePdfAPI, UsersAPI } from "../../lib/api";
import { can } from "../../lib/rbac";
import { validateCreatorDetails, requiredForPayType, validateField, sanitizeField } from "../../lib/validators";
import { fmtCompact, prettyDate, initials } from "../../lib/format";
import MoneyInput from "../../components/MoneyInput";
import DateInput from "../../components/DateInput";

// ── TOKENS ───────────────────────────────────────────────────────────────────
import { T as BASE_T } from "../../theme/tokens";

// Pipeline-stage → color map, layered on top of the shared theme.
const T = {
  ...BASE_T,
  sc: {
    draft: BASE_T.amber,
    creator_shortlist: BASE_T.accent, advance_received: BASE_T.green,
    po_raised: BASE_T.amber, execution: BASE_T.accent,
    brief_sent: BASE_T.purple, concept_submitted: BASE_T.amber, concept_approved: BASE_T.green,
    production: BASE_T.purple, video_submitted: BASE_T.amber,
    internal_review: BASE_T.accent, client_approved: BASE_T.green,
    live: BASE_T.green, creator_paid: BASE_T.green,
    reporting: BASE_T.label, completed: BASE_T.label,
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

// ── PIPELINE — 16-stage workflow ─────────────────────────────────────────────
const PIPELINE = [
  { id:"draft",             label:"Draft"              },
  { id:"creator_shortlist", label:"Creator Shortlisting"},
  { id:"po_raised",         label:"PO Raised"          },
  { id:"advance_received",  label:"Advance Received"   },
  { id:"execution",         label:"Execution"          },
  { id:"brief_sent",        label:"Brief Sent"         },
  { id:"concept_submitted", label:"Concept Submitted"  },
  { id:"concept_approved",  label:"Concept Approved"   },
  { id:"production",        label:"Production"         },
  { id:"video_submitted",   label:"Video Submitted"    },
  { id:"internal_review",   label:"Internal Review"    },
  { id:"client_approved",   label:"Client Approved"    },
  { id:"live",              label:"Live"               },
  { id:"creator_paid",      label:"Creator Paid"       },
  { id:"reporting",         label:"Reporting"          },
  { id:"completed",         label:"Completed"          },
];
const PL_IDS = PIPELINE.map(p=>p.id);
const STAGE_HINT = {
  draft:             "Campaign created — team building brief",
  creator_shortlist: "EA & AM shortlisting creators from directory",
  po_raised:         "Purchase Order raised — awaiting client confirmation",
  advance_received:  "Advance received — execution cleared",
  execution:         "Campaign execution in progress",
  brief_sent:        "Creator briefs sent — awaiting acknowledgement",
  concept_submitted: "Creator concepts received — pending review",
  concept_approved:  "Concepts approved — content production begins",
  production:        "Creators shooting & editing content",
  video_submitted:   "Content submitted — pending internal review",
  internal_review:   "AM reviewing content before client send",
  client_approved:   "Client has approved content — ready to go live",
  live:              "Content is live on platforms",
  creator_paid:      "Creator payments released",
  reporting:         "Campaign report being prepared",
  completed:         "Campaign fully completed",
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
// Creators whose niche shares an audience with the campaign's chosen niche.
const nicheMatches = (campNiche, creatorNiche) => {
  if (!campNiche) return true; // no niche picked → don't filter
  return (NICHE_SIMILAR[campNiche] || [campNiche]).includes(creatorNiche);
};
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
  {key:"concept",label:"Concept",cv:true,w:105},{key:"demo",label:"Demo",cv:true,w:105},
  {key:"fee",label:"Fee",cv:false,w:90},{key:"payType",label:"Pay Type",cv:false,w:110},
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
    id: u.teamId,
    name: u.name,
    role: ["accounts_head","accounts_exec"].includes(u.role) ? "accounts" : u.role,
    avatar: u.avatar || initials(u.name),
    jobTitle: u.title || u.role,
  }));

// ── CREATOR DB (used only by Generate) ───────────────────────────────────────
const CREATOR_DB = [
  {id:"c001",name:"Anjali Kitchen",   handle:"@anjalikitchen",  platform:"Instagram",niche:"Cooking",  followers:"820K",  avgLikes:"32K",avgER:4.2, fee:85000 },
  {id:"c002",name:"South Foodie",     handle:"@southfoodie",    platform:"YouTube",  niche:"Food",     followers:"1.2M",  avgLikes:"58K",avgER:5.1, fee:180000},
  {id:"c003",name:"Taste of Madras",  handle:"@tasteofmadras",  platform:"Instagram",niche:"Food",     followers:"540K",  avgLikes:"18K",avgER:3.8, fee:65000 },
  {id:"c004",name:"Foodie Hyderabad", handle:"@foodiehyd",      platform:"Instagram",niche:"Lifestyle",followers:"380K",  avgLikes:"16K",avgER:4.5, fee:50000 },
  {id:"c005",name:"Kerala Food Tales",handle:"@keralafood",     platform:"YouTube",  niche:"Cooking",  followers:"290K",  avgLikes:"16K",avgER:6.1, fee:40000 },
  {id:"c006",name:"Mumbai Munchies",  handle:"@mumbaimunch",    platform:"Instagram",niche:"Food",     followers:"95K",   avgLikes:"6.5K",avgER:7.2,fee:18000 },
  {id:"c007",name:"Delhi Diaries",    handle:"@delhidiaries",   platform:"Instagram",niche:"Lifestyle",followers:"78K",   avgLikes:"5K", avgER:6.8, fee:15000 },
  {id:"c008",name:"Chef Kabira",      handle:"@chefkabira",     platform:"YouTube",  niche:"Cooking",  followers:"650K",  avgLikes:"30K",avgER:4.9, fee:90000 },
  {id:"c009",name:"Fit Freaks IN",    handle:"@fitfreaksin",    platform:"Instagram",niche:"Fitness",  followers:"120K",  avgLikes:"6K", avgER:5.5, fee:22000 },
  {id:"c010",name:"Goa Vibes",        handle:"@goavibes",       platform:"Instagram",niche:"Lifestyle",followers:"32K",   avgLikes:"2.8K",avgER:9.2,fee:8000  },
  {id:"c011",name:"Bong Kitchen",     handle:"@bongkitchen",    platform:"YouTube",  niche:"Cooking",  followers:"420K",  avgLikes:"17K",avgER:4.4, fee:55000 },
  {id:"c012",name:"Pune Palate",      handle:"@punepalate",     platform:"Instagram",niche:"Food",     followers:"67K",   avgLikes:"5K", avgER:8.1, fee:12000 },
  {id:"c013",name:"Coastal Kitchen",  handle:"@coastalkitchen", platform:"YouTube",  niche:"Cooking",  followers:"510K",  avgLikes:"25K",avgER:5.3, fee:72000 },
  {id:"c014",name:"Hyderabad Hunger", handle:"@hydhunger",      platform:"Instagram",niche:"Food",     followers:"41K",   avgLikes:"4K", avgER:10.4,fee:9000  },
];

// ── CREATOR FACTORY ──────────────────────────────────────────────────────────
const mkCreator = (src={}, fee) => ({
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
  askingPrice:   src.askingPrice !== undefined ? src.askingPrice : null,
  negotiatedCost:src.negotiatedCost !== undefined ? src.negotiatedCost : (fee ?? src.fee ?? 0),
  fee:      fee ?? src.fee ?? (src.negotiatedCost || 0),
  igFetched: src.igFetched || null, // raw auto-fetched snapshot (bio, posts, fetchedAt, etc.)
  status:   "shortlisted",
  state:    src.state   || null,
  payType:  src.payType || null,
  payId:    src.payId   || null,
  concept:  {status:"yet_to_receive",fileLink:null},
  demo:     {status:"yet_to_receive",fileLink:null},
  live:     {postUrl:null,postedDate:null},
  invoiceNo:src.invoiceNo || null, // set once a PDF invoice is generated — locks out duplicates
  tracking: {views:null,likes:null,comments:null,forwards:null,commentAnalysis:null,positivityScore:null,lastFetched:null},
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
const ACTION_MSGS={advance_to_shortlist:"Move to creator shortlisting",am_request_edit:"Request brief edit",raise_po:"Raise Purchase Order",advance_received:"Confirm advance received",assign_cm:"Assign CM",assign_ea:"Assign EA — start execution",brief_sent:"Mark briefs sent to creators",concept_submitted:"Mark concepts received",cm_approve_concept:"Approve concept",cm_request_changes:"Request concept changes",start_production:"Start production",video_submitted:"Mark video submitted",internal_approved:"Approve internally — send to client",internal_revision:"Request internal revision",client_approved:"Mark client approved",client_revision:"Log client revision request",mark_live:"Mark content live",creator_paid:"Confirm creator payments released",start_reporting:"Start reporting",mark_completed:"Mark campaign completed"};
// Actions that don't move the pipeline stage — no confirmation needed.
const NO_CONFIRM_ACTIONS=new Set(["assign_cm"]);

// ── HELPERS ──────────────────────────────────────────────────────────────────
const fmtINR  = n => !n&&n!==0?"—":n>=100000?`₹${(n/100000).toFixed(1)}L`:`₹${(n/1000).toFixed(0)}K`;
const fmtNum  = fmtCompact; // shared compact formatter — lib/format.js
const getM    = id => TEAM_DIR.find(t=>t.id===id)||TEAM.find(t=>t.id===id)||null;
const getR    = id => ROLES.find(r=>r.id===id)||ROLES[0];
const plIdx   = id => PL_IDS.indexOf(id);

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
  const fee  = creator.fee || 0;
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
    <td class="rt">${fmt(fee)}</td>
    <td class="rt">${fmt(fee)}</td>
  </tr>
  ${rows}
  <tr>
    <td colspan="4" style="text-align:right;font-weight:bold">Total</td>
    <td class="rt" style="font-weight:bold">${fmt(fee)}</td>
  </tr>
  <tr><td colspan="5">Tax Amount (in words): ${amtInWords(fee)}</td></tr>
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
const canFF     = r => can(r, "seeMargins");          // margins — founder only
const canCreate = r => can(r, "createCampaign");
// Visibility: founder sees all; everyone else only sees own campaigns
const canSee = (c, r, teamId) => {
  if (r === "founder") return true;
  return c.createdBy === teamId || c.amId === teamId || c.cmId === teamId || c.eaId === teamId;
};
// ISO ("YYYY-MM-DD") so a campaign's start/end always matches the format
// DateInput writes when staff do pick a date — one consistent shape in the DB.
const today   = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const needsLnk= s => ["received","rework"].includes(s);
// External links pasted without a protocol ("instagram.com/p/…") would resolve
// relative to the SPA — the new tab lands on our router with an empty
// sessionStorage and gets bounced to /login. Always absolutize before href.
const extUrl = u => {
  if (!u) return u;
  const t = String(u).trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};
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
const Av=({init,size=22})=><div style={{width:size,height:size,borderRadius:Math.max(4,size*0.28),flexShrink:0,background:`${T.accent}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:Math.max(7,size*0.38),fontWeight:600,color:T.accent,fontFamily:SF}}>{init}</div>;
const Dot=({color=T.sub,size=6})=><span style={{width:size,height:size,borderRadius:"50%",background:color,display:"inline-block",flexShrink:0,boxShadow:`0 0 0 2px ${color}22`}}/>;
const Lbl=({children,color,style={}})=><span style={{fontSize:9.5,fontWeight:600,color:color||"#6E6E73",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:SF,...style}}>{children}</span>;
const Hr=({style={}})=><div style={{height:"0.5px",background:"rgba(0,0,0,0.08)",...style}}/>;
function Btn({children,onClick,variant="ghost",disabled,style={}}){
  const b={padding:"7px 14px",borderRadius:8,fontSize:11,fontWeight:500,cursor:disabled?"not-allowed":"pointer",fontFamily:SF,border:"none",display:"inline-flex",alignItems:"center",gap:5,opacity:disabled?0.35:1,letterSpacing:"-0.01em",transition:"all 0.15s",...style};
  const v={primary:{background:T.accent,color:"#FFFFFF",fontWeight:600},success:{background:T.green,color:"#FFFFFF",fontWeight:600},ghost:{background:"rgba(0,0,0,0.05)",color:"#1D1D1F",border:"none"},danger:{background:"transparent",color:T.red,border:`1px solid ${T.red}22`},subtle:{background:"transparent",color:"#6E6E73",border:"1px solid rgba(0,0,0,0.1)"}};
  return <button onClick={onClick} disabled={disabled} style={{...b,...(v[variant]||v.ghost)}}>{children}</button>;
}
const INP={width:"100%",padding:"9px 12px",borderRadius:9,background:"rgba(0,0,0,0.03)",border:"1px solid rgba(0,0,0,0.1)",color:"#1D1D1F",fontSize:12,fontFamily:SF,outline:"none",resize:"vertical",transition:"border 0.15s"};

// ── PIPELINE WIDGETS ─────────────────────────────────────────────────────────
const MiniPipe=({stage})=>{const pct=Math.round((plIdx(stage)/(PIPELINE.length-1))*100),col=T.sc[stage]||T.sub;return <div style={{height:2,background:"rgba(0,0,0,0.07)",borderRadius:1,marginTop:9}}><div style={{height:2,borderRadius:1,background:col,width:`${pct}%`,transition:"width 0.5s ease"}}/></div>;};
function FullPipe({stage}){
  const idx=plIdx(stage),col=T.sc[stage]||T.sub,GREEN="#34C759";
  // Top/bottom padding keeps the pulse ring and hover lift inside the
  // overflow-x scroll container instead of getting clipped.
  return(<div style={{overflowX:"auto",padding:"8px 0 6px"}}><div style={{display:"flex",alignItems:"flex-start",minWidth:"max-content"}}>{PIPELINE.map((p,i)=>{
    const done=i<idx,cur=i===idx;
    return(<div key={p.id} style={{display:"flex",alignItems:"flex-start"}}>
      <div className="pipe-node" title={`Stage ${i+1} of ${PIPELINE.length} — ${p.label}${done?" · complete":cur?" · current":""}`} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,minWidth:72}}>
        <div style={{width:14,height:14,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
          background:cur?col:done?GREEN:"#FFFFFF",
          border:done||cur?"none":"1.5px solid rgba(0,0,0,0.14)",
          animation:cur?"pipePulse 2s ease-out infinite":"none",
          "--pulse-col":`${col}50`,
          transition:"background 0.3s"}}>
          {done&&<span style={{color:"#FFF",fontSize:8,fontWeight:700,lineHeight:1}}>✓</span>}
          {cur&&<span style={{width:4,height:4,borderRadius:"50%",background:"#FFF"}}/>}
        </div>
        <span style={{fontSize:7.5,textAlign:"center",whiteSpace:"nowrap",color:cur?col:done?"#1D1D1F":"rgba(0,0,0,0.30)",fontWeight:cur?700:done?500:400,fontFamily:SF,letterSpacing:"0.01em"}}>{p.label}</span>
        {cur&&<span style={{fontSize:6.5,fontWeight:700,color:col,background:`${col}14`,borderRadius:4,padding:"1px 5px",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:SF,marginTop:-2}}>Now</span>}
      </div>
      {i<PIPELINE.length-1&&<div style={{width:18,height:2,borderRadius:1,background:i<idx?GREEN:"rgba(0,0,0,0.08)",marginTop:6,flexShrink:0,transition:"background 0.3s"}}/>}
    </div>);
  })}</div></div>);
}

// ── DELIVERABLE MULTISELECT ───────────────────────────────────────────────────
function DelvSelect({value=[],onChange}){const t=d=>onChange(value.includes(d)?value.filter(x=>x!==d):[...value,d]);return(<div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:2}}>{IM_DELIVERABLES.map(d=>{const on=value.includes(d);return <button key={d} onClick={()=>t(d)} style={{padding:"5px 11px",borderRadius:20,fontSize:11,cursor:"pointer",fontFamily:SF,background:on?`${T.accent}18`:"rgba(0,0,0,0.04)",color:on?T.accent:"#6E6E73",border:`1px solid ${on?`${T.accent}30`:"transparent"}`}}>{d}</button>;})}</div>);}

// ── CAMPAIGN CARD ────────────────────────────────────────────────────────────
function CampCard({camp,selected,onClick,role}){
  const col=T.sc[camp.stage]||T.sub,pl=PIPELINE.find(p=>p.id===camp.stage)||PIPELINE[0];
  const am=getM(camp.amId),cm=getM(camp.cmId),ea=getM(camp.eaId);
  const [hovered,setHovered]=useState(false);
  return(
    <div onClick={onClick} onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} style={{padding:"14px 16px",borderRadius:12,cursor:"pointer",marginBottom:4,background:selected?"#FFFFFF":hovered?"rgba(255,255,255,0.65)":"transparent",border:`1px solid ${selected?"rgba(0,0,0,0.1)":"transparent"}`,boxShadow:selected?"0 2px 12px rgba(0,0,0,0.08)":"none",transition:"all 0.15s"}}>
      {selected&&<div style={{height:2,background:col,borderRadius:1,marginBottom:10,width:24}}/>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:3}}>
        <span style={{fontSize:12.5,fontWeight:600,color:"#1D1D1F",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,letterSpacing:"-0.02em",fontFamily:SF}}>{camp.name}</span>
        <span style={{fontSize:9.5,color:"#6E6E73",marginLeft:8,flexShrink:0,fontFamily:SF}}>{camp.progress}%</span>
      </div>
      <div style={{fontSize:11,color:"#6E6E73",marginBottom:8,fontFamily:SF}}>{camp.client}{camp.region?` · ${camp.region}`:""}</div>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
        <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:20,background:`${col}14`,border:`1px solid ${col}28`,fontSize:9.5,fontWeight:500,color:col,fontFamily:SF}}>{pl.label}</span>
        {canFin(role)&&<span style={{marginLeft:"auto",fontSize:11,color:"#6E6E73",fontFamily:SF,fontWeight:500}}>{fmtINR(camp.budget)}</span>}
      </div>
      <MiniPipe stage={camp.stage}/>
      {(am||cm||ea)&&<div style={{display:"flex",gap:6,marginTop:9,alignItems:"center"}}>{[{m:am,l:"AM"},{m:cm,l:"CM"},{m:ea,l:"EA"}].filter(x=>x.m).map(({m,l})=><div key={l} style={{display:"flex",alignItems:"center",gap:4}}><Av init={m.avatar} size={16}/><span style={{fontSize:8.5,color:"#6E6E73",fontFamily:SF}}>{l}</span></div>)}</div>}
    </div>
  );
}

// ── REMOVE MODAL ─────────────────────────────────────────────────────────────
function RemoveModal({creator,onConfirm,onCancel}){const [reason,setReason]=useState("");const [note,setNote]=useState("");return(<div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"center",justifyContent:"center"}}><div onClick={onCancel} style={{position:"absolute",inset:0,background:"rgba(4,5,10,0.88)",backdropFilter:"blur(4px)"}}/><div style={{position:"relative",width:"min(400px,92vw)",background:T.surface,border:`1px solid ${T.borderMid}`,borderRadius:10,padding:"20px"}}><div style={{fontFamily:"'Newsreader',serif",fontSize:16,color:T.text,fontStyle:"italic",marginBottom:4}}>Remove Creator</div><div style={{fontSize:11,color:T.sub,marginBottom:16}}>{creator?.name} {creator?.handle} — select a reason</div><div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>{REMOVE_REASONS.map(r=><label key={r.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",borderRadius:6,cursor:"pointer",background:reason===r.id?`${T.accent}10`:T.raised,border:`1px solid ${reason===r.id?`${T.accent}30`:T.border}`,transition:"all 0.1s"}}><input type="radio" value={r.id} checked={reason===r.id} onChange={()=>setReason(r.id)} style={{marginTop:2,accentColor:T.accent}}/><div><div style={{fontSize:11.5,color:T.text,fontWeight:500,marginBottom:2}}>{r.label}</div><div style={{fontSize:10,color:T.sub}}>{r.desc}</div></div></label>)}</div><textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="Additional note (optional)…" style={{...INP,fontSize:11,marginBottom:12}}/><div style={{display:"flex",gap:8}}><Btn variant="ghost" onClick={onCancel}>Cancel</Btn><Btn variant="danger" onClick={()=>reason&&onConfirm(reason,note)} disabled={!reason}>Remove creator</Btn></div></div></div>);}

// ── DELETE CAMPAIGN MODAL ────────────────────────────────────────────────────
// Founder-only confirm step. The backend soft-deletes (deleted:true), so the
// campaign disappears from every list but stays recoverable in the DB.
function DeleteCampaignModal({camp,onConfirm,onCancel}){
  return(<div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div onClick={onCancel} style={{position:"absolute",inset:0,background:"rgba(4,5,10,0.88)",backdropFilter:"blur(4px)"}}/>
    <div style={{position:"relative",width:"min(400px,92vw)",background:T.surface,border:`1px solid ${T.borderMid}`,borderRadius:10,padding:"20px"}}>
      <div style={{fontFamily:"'Newsreader',serif",fontSize:16,color:T.text,fontStyle:"italic",marginBottom:4}}>Delete Campaign</div>
      <div style={{fontSize:11,color:T.sub,marginBottom:16}}>
        Delete <strong style={{color:T.text}}>{camp?.name}</strong> ({camp?.client})? It will be removed from all views. Recovery requires a database restore.
      </div>
      <div style={{display:"flex",gap:8}}>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
        <div style={{flex:1}}/>
        <Btn variant="danger" onClick={onConfirm}>Delete campaign</Btn>
      </div>
    </div>
  </div>);
}

// ── CONFIRM STAGE-CHANGE MODAL ───────────────────────────────────────────────
// Double-check gate for every workflow action that moves a campaign to another
// pipeline stage — changes are only applied (and synced) after confirmation.
function ConfirmActionModal({camp,label,onConfirm,onCancel}){
  return(<div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div onClick={onCancel} style={{position:"absolute",inset:0,background:"rgba(4,5,10,0.88)",backdropFilter:"blur(4px)"}}/>
    <div style={{position:"relative",width:"min(400px,92vw)",background:T.surface,border:`1px solid ${T.borderMid}`,borderRadius:10,padding:"20px"}}>
      <div style={{fontFamily:"'Newsreader',serif",fontSize:16,color:T.text,fontStyle:"italic",marginBottom:4}}>Confirm stage change</div>
      <div style={{fontSize:11,color:T.sub,lineHeight:1.6,marginBottom:16}}>
        <strong style={{color:T.text}}>{label}</strong> — this moves <strong style={{color:T.text}}>{camp?.name}</strong> to a different pipeline stage and is logged on the campaign timeline. Continue?
      </div>
      <div style={{display:"flex",gap:8}}>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
        <div style={{flex:1}}/>
        <Btn variant="primary" onClick={onConfirm}>Yes, confirm</Btn>
      </div>
    </div>
  </div>);
}

// ── ADD CREATOR MODAL ─────────────────────────────────────────────────────────
// Doubles as the "Edit Creator" form (PERMS.editCreatorDetails): pass `editing` (an existing
// creator object) to prefill every field; onAdd then receives the merged
// creator (same _id, status/tracking preserved) instead of a new one.
// Exported so the Influencers directory reuses it as its founder edit form.
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
  const [fee,setFee]=useState(editing?.fee!=null?String(editing.fee):""); // negotiated cost
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
        askingPrice:parseInt(askingPrice)||null, fee:parseInt(fee)||0,
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
      negotiatedCost:parseInt(fee)||0,
      igFetched,
      state:f.state||null,
      payType:f.payType||null,
      payId:payId||null,
      personalDetails
    },parseInt(fee)||0));
    onClose();
  };

  return(<div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(4,5,10,0.88)",backdropFilter:"blur(5px)"}}/>
    <div style={{position:"relative",width:"min(480px,94vw)",maxHeight:"90vh",background:T.surface,border:`1px solid ${T.borderMid}`,borderRadius:10,overflow:"hidden",display:"flex",flexDirection:"column"}}>
      <div style={{padding:"16px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontFamily:"'Newsreader',serif",fontSize:17,color:T.text,fontStyle:"italic"}}>{editing?`Edit Creator — ${editing.name}`:"Add Creator"}</div>
        <button onClick={onClose} style={{background:"transparent",border:"none",color:T.sub,fontSize:16,cursor:"pointer"}}>✕</button>
      </div>
      <div style={{padding:"18px 20px",overflowY:"auto",flex:1}}>
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
        <div style={{marginBottom:12}}><Lbl style={{display:"block",marginBottom:4}}>Phone <span style={{fontSize:8,color:T.label,textTransform:"none",letterSpacing:0}}>— internal only</span></Lbl><input value={f.phone} onChange={e=>u("phone",e.target.value)} placeholder="+91 98765 43210" style={{...INP,resize:"none",borderColor:errors.phone?T.red:`${T.amber}30`}}/><Err k="phone"/></div>
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
          <div><Lbl style={{display:"block",marginBottom:4}}>Negotiated Cost (₹)</Lbl><MoneyInput value={fee} onChange={setFee} placeholder="e.g. 75,000" style={{...INP,resize:"none"}}/></div>
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
      </div>
      <div style={{padding:"14px 20px",borderTop:`1px solid ${T.border}`,display:"flex",gap:8}}><Btn variant="ghost" onClick={onClose}>Cancel</Btn><div style={{flex:1}}/><Btn variant="primary" onClick={handleAdd} disabled={!valid}>{editing?"Save changes":"Add to list"}</Btn></div>
    </div>
  </div>);
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
    <div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(4,5,10,0.88)",backdropFilter:"blur(5px)"}}/>
      <div style={{position:"relative",width:"min(460px,94vw)",maxHeight:"88vh",background:T.surface,border:`1px solid ${T.borderMid}`,borderRadius:10,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontFamily:"'Newsreader',serif",fontSize:17,color:T.text,fontStyle:"italic"}}>Invoice Details — {creator.name}</div>
            <div style={{fontSize:9.5,color:T.sub,marginTop:2}}>{PAYMENT_TYPES.find(p=>p.id===creator.payType)?.label||"—"} · {creator.handle} · {fmtINR(creator.fee)}</div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:T.sub,fontSize:16,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{padding:"16px 20px",overflowY:"auto",flex:1}}>
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
                <input value={form[k]} onChange={e=>u(k,e.target.value)} placeholder={ph} style={{...INP,resize:"none",borderColor:errors[k]?T.red:undefined}}/>
                {errors[k]&&<div style={{fontSize:9.5,color:T.red,marginTop:3}}>{errors[k]}</div>}
              </div>
            ))}
          </div>
        </div>
        <div style={{padding:"14px 20px",borderTop:`1px solid ${T.border}`,display:"flex",gap:8}}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <div style={{flex:1}}/>
          <Btn variant="primary" onClick={generate} disabled={busy}>{busy ? "Generating…" : "Save & Generate"}</Btn>
        </div>
      </div>
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
  const [showAdd,setShowAdd]=useState(false);
  const [editTarget,setEditTarget]=useState(null);       // creator being edited (see PERMS.editCreatorDetails)
  const [invoiceTarget,setInvoiceTarget]=useState(null); // creator to invoice
  const required=camp.numReq||5,flagged=genRounds>=4;
  const cb=camp.creatorBudget||camp.budget*0.6;
  const totalFee=creators.reduce((s,c)=>s+(c.fee||0),0);
  const over=totalFee>cb;
  const canEdit=["ea","cm","am","pcm","founder"].includes(role);
  const sync=next=>{setCreators(next);onUpdateCreators(next);};
  const patch=(id,obj)=>sync(creators.map(c=>c._id===id?{...c,...obj}:c));
  const generate=()=>{if(flagged||generating)return;setGenerating(true);setTimeout(()=>{const taken=new Set(creators.map(c=>c.dbId).filter(Boolean));
    // Restrict suggestions to the campaign's niche (same/similar). If nothing
    // in the DB matches, fall back to the full pool so Generate is never empty.
    const inNiche=CREATOR_DB.filter(c=>!taken.has(c.id)&&nicheMatches(camp.niche,c.niche));
    const base=inNiche.length?inNiche:CREATOR_DB.filter(c=>!taken.has(c.id));
    const pool=base.slice(0,required*2).map(c=>mkCreator(c));setSuggested(pool);setGenRounds(r=>r+1);setGenerating(false);},900);};
  const confirmRemove=(reason,note)=>{API.removeCreator(camp.id,removeTarget._id,reason,note);sync(creators.filter(c=>c._id!==removeTarget._id));setRemoveTarget(null);};
  const addFromSugg=cr=>{if(creators.length>=required)return;sync([...creators,cr]);setSuggested(p=>p.filter(c=>c._id!==cr._id));};
  const thS={fontSize:9,fontWeight:600,color:T.label,textTransform:"uppercase",letterSpacing:"0.07em",padding:"8px 10px",whiteSpace:"nowrap",borderBottom:`1px solid ${T.border}`,textAlign:"left",background:T.raised};
  const tdS={padding:"8px 10px",borderBottom:`1px solid ${T.border}`,fontSize:11,color:T.sub,verticalAlign:"middle",whiteSpace:"nowrap"};
  return(<div>
    {canFin(role)&&<div style={{marginBottom:18}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><Lbl>Creator Budget</Lbl><span style={{fontSize:10.5,color:over?T.red:T.sub}}>{fmtINR(totalFee)} of {fmtINR(cb)}</span></div><div style={{height:2,background:T.mute,borderRadius:1}}><div style={{height:2,borderRadius:1,background:over?T.red:T.green,width:`${Math.min((totalFee/cb)*100,100)}%`,transition:"width 0.3s"}}/></div>{over&&<div style={{fontSize:9.5,color:T.red,marginTop:3}}>{fmtINR(totalFee-cb)} over budget</div>}</div>}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
      <div><Lbl>Creators</Lbl><span style={{fontSize:9,color:T.sub,marginLeft:8}}>{creators.length} of {required} required</span>{camp.sentToClient&&<span style={{fontSize:9,color:T.green,marginLeft:8}}>&middot; sent to client</span>}</div>
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
          {CREATOR_COLS.filter(c=>c.key!=="fee"||canFin(role)).filter(c=>!["payType","payId"].includes(c.key)||canFin(role)).map(col=>(
            <th key={col.key} title={col.cv?undefined:"Internal only"} style={{...thS,width:col.w,minWidth:col.w}}>{col.label}</th>
          ))}
          {(canEdit||canFin(role))&&<th style={{...thS,width:130}}></th>}
        </tr></thead>
        <tbody>
          {creators.length===0&&<tr><td colSpan={12} style={{...tdS,textAlign:"center",color:T.label,padding:"24px"}}>No creators yet. Generate or add manually.</td></tr>}
          {creators.map((cr,i)=>{
            const stCol=CR_COLOR[cr.status]||T.sub;
            const cSt=cr.concept?.status||"yet_to_receive",dSt=cr.demo?.status||"yet_to_receive";
            return(<tr key={cr._id} style={{background:i%2===0?"transparent":T.hover}}>
              <td style={{...tdS,color:T.text}}><div style={{display:"flex",alignItems:"center",gap:7}}><Av init={(cr.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2)} size={22}/><div><div style={{fontSize:11,fontWeight:500,color:T.text}}>{cr.name}</div><div style={{fontSize:9,color:T.label}}>{cr.handle}</div></div></div></td>
              <td style={tdS}>{cr.platform}</td>
              <td style={tdS}>{fmtNum(cr.followers)}</td>
              <td style={{...tdS,color:T.text}}>{cr.avgER!=null?`${cr.avgER}%`:"—"}</td>
              <td style={tdS}>{cr.niche||"—"}</td>
              <td style={tdS}>{cr.state||"—"}</td>
              <td style={tdS}>{canEdit?<select value={cr.status} onChange={e=>patch(cr._id,{status:e.target.value})} style={{background:"transparent",border:"none",color:stCol,fontSize:10.5,fontFamily:"'Sora'",outline:"none",cursor:"pointer",appearance:"none",WebkitAppearance:"none",padding:"2px 4px"}}>{CR_JOURNEY.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select>:<span style={{fontSize:10.5,color:stCol}}>{CR_JOURNEY.find(s=>s.id===cr.status)?.label}</span>}</td>
              <td style={tdS}><span style={{fontSize:10,color:ASSET_COLOR[cSt],fontWeight:500}}>{ASSET_STATUSES.find(s=>s.id===cSt)?.label}</span></td>
              <td style={tdS}><span style={{fontSize:10,color:ASSET_COLOR[dSt],fontWeight:500}}>{ASSET_STATUSES.find(s=>s.id===dSt)?.label}</span></td>
              {canFin(role)&&<td style={tdS}>{canEdit?<MoneyInput value={cr.fee||0} onChange={v=>patch(cr._id,{fee:parseInt(v)||0})} style={{width:76,background:"transparent",border:"none",borderBottom:`1px solid ${T.border}`,color:T.text,fontSize:11,fontFamily:"'Sora'",outline:"none",padding:"2px 0"}}/>:fmtINR(cr.fee)}</td>}
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
    {canEdit&&creators.length>=required&&!camp.sentToClient&&<div style={{marginTop:14}}><Hr style={{marginBottom:12}}/><Btn variant="primary" onClick={()=>onUpdateCreators(creators,"send_to_client")}>Send creator list to client</Btn></div>}
    {suggested.length>0&&<div style={{marginTop:20}}><Hr style={{marginBottom:14}}/><div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><Lbl>Suggested — Round {genRounds}</Lbl><span style={{fontSize:9,color:T.sub}}>{required-creators.length} spots remaining</span></div>
      <div style={{overflowX:"auto",borderRadius:6,border:`1px solid ${T.border}`}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}><thead><tr>{["Creator","Platform","Followers","Avg ER%","Niche","Est. Fee",""].map(h=><th key={h} style={{...thS}}>{h}</th>)}</tr></thead><tbody>{suggested.map((cr,i)=><tr key={cr._id} style={{opacity:creators.length>=required?0.35:1}}><td style={{...tdS,color:T.text}}><div style={{display:"flex",alignItems:"center",gap:7}}><Av init={(cr.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2)} size={20}/><div><div style={{fontSize:11,fontWeight:500}}>{cr.name}</div><div style={{fontSize:9,color:T.label}}>{cr.handle}</div></div></div></td><td style={tdS}>{cr.platform}</td><td style={tdS}>{fmtNum(cr.followers)}</td><td style={{...tdS,color:T.text}}>{cr.avgER!=null?`${cr.avgER}%`:"—"}</td><td style={tdS}>{cr.niche||"—"}</td>{canFin(role)&&<td style={tdS}>{fmtINR(cr.fee)}</td>}<td style={{...tdS,textAlign:"right"}}><div style={{display:"flex",gap:5,justifyContent:"flex-end"}}><Btn variant="ghost" onClick={()=>addFromSugg(cr)} disabled={creators.length>=required} style={{fontSize:9,padding:"3px 9px"}}>Add</Btn><Btn variant="subtle" onClick={()=>setSuggested(p=>p.filter(c=>c._id!==cr._id))} style={{fontSize:9,padding:"3px 9px"}}>Skip</Btn></div></td></tr>)}</tbody></table></div>
    </div>}
    {removeTarget&&<RemoveModal creator={removeTarget} onConfirm={confirmRemove} onCancel={()=>setRemoveTarget(null)}/>}
    {showAdd&&<AddCreatorModal onAdd={cr=>sync([...creators,cr])} onClose={()=>setShowAdd(false)}/>}
    {editTarget&&<AddCreatorModal editing={editTarget} onAdd={cr=>sync(creators.map(c=>c._id===cr._id?cr:c))} onClose={()=>setEditTarget(null)}/>}
    {invoiceTarget && (
      <InvoiceDetailsModal camp={camp} creator={creators.find(c=>c._id===invoiceTarget._id)||invoiceTarget} creators={creators} onClose={()=>setInvoiceTarget(null)} onUpdateCreators={sync} onLogTimeline={onLogTimeline}/>
    )}
  </div>);
}

// ── DELIVERABLES TAB ─────────────────────────────────────────────────────────
function TabDeliverables({camp,role,onUpdateCreators}){
  const [creators,setCreators]=useState(camp.creators||[]);
  const [fetching,setFetching]=useState({});
  const canEdit=["ea","cm","am","pcm","founder"].includes(role);
  const sync=next=>{setCreators(next);onUpdateCreators(next);};
  const pCr=(id,obj)=>sync(creators.map(c=>c._id===id?{...c,...obj}:c));
  const pCon=(id,obj)=>pCr(id,{concept:{...(creators.find(c=>c._id===id)?.concept||{}),...obj}});
  const pDem=(id,obj)=>pCr(id,{demo:{...(creators.find(c=>c._id===id)?.demo||{}),...obj}});
  const pLiv=(id,obj)=>pCr(id,{live:{...(creators.find(c=>c._id===id)?.live||{}),...obj}});
  const pTrk=(id,obj)=>pCr(id,{tracking:{...(creators.find(c=>c._id===id)?.tracking||{}),...obj}});
  const [fetchErrs,setFetchErrs]=useState({});
  const refresh=async(id,url,platform)=>{
    setFetching(f=>({...f,[id]:true}));setFetchErrs(e=>({...e,[id]:null}));
    try{
      const m=await PostMetricsAPI.fetch(url,platform);
      pTrk(id,{views:m.views,likes:m.likes,comments:m.comments,forwards:m.forwards,lastFetched:new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})});
    }catch(e){setFetchErrs(errs=>({...errs,[id]:e.body?.error||"Fetch failed — check connection"}));}
    setFetching(f=>({...f,[id]:false}));
  };
  // Aggregates
  const wd=creators.filter(c=>c.tracking?.views!=null);
  const totV=wd.reduce((s,c)=>s+(c.tracking.views||0),0);
  const totL=wd.reduce((s,c)=>s+(c.tracking.likes||0),0);
  const totC=wd.reduce((s,c)=>s+(c.tracking.comments||0),0);
  const totF=wd.reduce((s,c)=>s+(c.tracking.forwards||0),0);
  const totFee=creators.reduce((s,c)=>s+(c.fee||0),0);
  const cpv=totV>0?(totFee/totV):null;
  const er=totV>0?(((totL+totC+totF)/totV)*100):null;
  const ps=wd.filter(c=>c.tracking.positivityScore!=null).map(c=>c.tracking.positivityScore);
  const avgPos=ps.length>0?Math.round(ps.reduce((s,n)=>s+n,0)/ps.length):null;
  const agg=[
    {l:"Total Views",v:fmtNum(totV||null),show:true},
    {l:"Total Likes",v:fmtNum(totL||null),show:true},
    {l:"CPV",v:cpv!=null?`₹${cpv.toFixed(2)}`:"—",show:canFin(role)},
    {l:"Avg ER",v:er!=null?`${er.toFixed(1)}%`:"—",show:true},
    {l:"Forwards",v:fmtNum(totF||null),show:true},
    {l:"% Positive",v:avgPos!=null?`${avgPos}%`:"—",show:true},
  ].filter(s=>s.show);
  const stS=st=>({fontSize:10,color:ASSET_COLOR[st]||T.sub,fontWeight:500,padding:"2px 6px",background:`${ASSET_COLOR[st]||T.sub}12`,borderRadius:3});
  return(<div>
    {wd.length>0&&<div style={{marginBottom:20}}>
      <div style={{display:"grid",gridTemplateColumns:`repeat(${agg.length},1fr)`,gap:8,marginBottom:6}}>
        {agg.map(s=><div key={s.l} style={{padding:"12px 14px",background:T.raised,borderRadius:7,border:`1px solid ${T.border}`}}><div style={{fontSize:8.5,color:T.label,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600}}>{s.l}</div><div style={{fontSize:18,fontWeight:600,color:T.text,lineHeight:1}}>{s.v}</div></div>)}
      </div>
      {wd.length<creators.length&&<div style={{fontSize:9,color:T.label}}>Based on {wd.length} of {creators.length} creator{creators.length!==1?"s":""} with live data.</div>}
    </div>}
    {creators.length===0&&<div style={{padding:"20px 0",color:T.label,fontSize:11,textAlign:"center"}}>No creators yet.</div>}
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {creators.map(cr=>{
        const con=cr.concept||{status:"yet_to_receive",fileLink:null};
        const dem=cr.demo||{status:"yet_to_receive",fileLink:null};
        const liv=cr.live||{postUrl:null,postedDate:null};
        const trk=cr.tracking||{};
        const isFetch=!!fetching[cr._id];
        return(<div key={cr._id} style={{background:T.raised,borderRadius:8,border:`1px solid ${T.border}`,overflow:"hidden"}}>
          <div style={{padding:"11px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:10}}>
            <Av init={(cr.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2)} size={26}/>
            <div style={{flex:1}}><div style={{fontSize:12,fontWeight:500,color:T.text}}>{cr.name} <span style={{fontSize:9.5,color:T.label}}>{cr.handle}</span></div><div style={{fontSize:9.5,color:T.sub}}>{cr.platform}{cr.followers?` · ${fmtNum(cr.followers)}`:""}{ cr.avgER!=null?` · ${cr.avgER}% ER`:""}</div></div>
            <span style={{fontSize:9.5,color:CR_COLOR[cr.status]||T.sub,fontWeight:500}}>{CR_JOURNEY.find(s=>s.id===cr.status)?.label||cr.status}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr"}}>
            {/* Concept */}
            <div style={{padding:"12px 14px",borderRight:`1px solid ${T.border}`}}>
              <Lbl style={{display:"block",marginBottom:8}}>Concept</Lbl>
              {canEdit?<select value={con.status} onChange={e=>pCon(cr._id,{status:e.target.value})} style={{background:"transparent",border:`1px solid ${T.border}`,color:ASSET_COLOR[con.status]||T.sub,fontSize:10,fontFamily:"'Sora'",outline:"none",borderRadius:4,padding:"3px 6px",width:"100%",marginBottom:needsLnk(con.status)?8:0}}>{ASSET_STATUSES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select>:<span style={stS(con.status)}>{ASSET_STATUSES.find(s=>s.id===con.status)?.label}</span>}
              {needsLnk(con.status)&&canEdit&&<><input value={con.fileLink||""} onChange={e=>pCon(cr._id,{fileLink:e.target.value})} placeholder="Attach file link…" style={{...INP,fontSize:10,padding:"5px 8px",resize:"none"}}/>{con.fileLink&&<a href={extUrl(con.fileLink)} target="_blank" rel="noreferrer" style={{fontSize:9,color:T.accent,display:"block",marginTop:4}}>Open →</a>}</>}
              {con.fileLink&&!needsLnk(con.status)&&<a href={extUrl(con.fileLink)} target="_blank" rel="noreferrer" style={{fontSize:9,color:T.accent,display:"block",marginTop:6}}>Open file →</a>}
            </div>
            {/* Demo */}
            <div style={{padding:"12px 14px",borderRight:`1px solid ${T.border}`}}>
              <Lbl style={{display:"block",marginBottom:8}}>Demo Video</Lbl>
              {canEdit?<select value={dem.status} onChange={e=>pDem(cr._id,{status:e.target.value})} style={{background:"transparent",border:`1px solid ${T.border}`,color:ASSET_COLOR[dem.status]||T.sub,fontSize:10,fontFamily:"'Sora'",outline:"none",borderRadius:4,padding:"3px 6px",width:"100%",marginBottom:needsLnk(dem.status)?8:0}}>{ASSET_STATUSES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select>:<span style={stS(dem.status)}>{ASSET_STATUSES.find(s=>s.id===dem.status)?.label}</span>}
              {needsLnk(dem.status)&&canEdit&&<><input value={dem.fileLink||""} onChange={e=>pDem(cr._id,{fileLink:e.target.value})} placeholder="Attach file link…" style={{...INP,fontSize:10,padding:"5px 8px",resize:"none"}}/>{dem.fileLink&&<a href={extUrl(dem.fileLink)} target="_blank" rel="noreferrer" style={{fontSize:9,color:T.accent,display:"block",marginTop:4}}>Open →</a>}</>}
              {dem.fileLink&&!needsLnk(dem.status)&&<a href={extUrl(dem.fileLink)} target="_blank" rel="noreferrer" style={{fontSize:9,color:T.accent,display:"block",marginTop:6}}>Open file →</a>}
            </div>
            {/* Live — unlocked once the demo video is received; URL must match the creator's platform */}
            <div style={{padding:"12px 14px",borderRight:`1px solid ${T.border}`}}>
              <Lbl style={{display:"block",marginBottom:8}}>Live</Lbl>
              {!demoReceived(dem.status)?<div style={{fontSize:10.5,color:T.label,fontStyle:"italic"}}>Unlocks once the demo video is received.</div>:<>
              {canEdit&&<input value={liv.postUrl||""} onChange={e=>pLiv(cr._id,{postUrl:e.target.value})} placeholder={`${cr.platform==="YouTube"?"YouTube video":"Instagram post"} URL…`} style={{...INP,fontSize:10,padding:"5px 8px",resize:"none",marginBottom:6,borderColor:liv.postUrl&&!livePostUrlOk(liv.postUrl,cr.platform)?T.red:T.border}}/>}
              {liv.postUrl&&!livePostUrlOk(liv.postUrl,cr.platform)&&<div style={{fontSize:9,color:T.red,marginBottom:6}}>Only {cr.platform==="YouTube"?"YouTube":"Instagram"} URLs are supported.</div>}
              {liv.postUrl&&livePostUrlOk(liv.postUrl,cr.platform)?<><a href={extUrl(liv.postUrl)} target="_blank" rel="noreferrer" style={{fontSize:9,color:T.accent,display:"block",marginBottom:6}}>Open post →</a>{canEdit&&<DateInput value={liv.postedDate||""} onChange={v=>pLiv(cr._id,{postedDate:v})} max={today()} placeholder="Posted date" style={{...INP,fontSize:10,padding:"5px 8px"}}/>}{liv.postedDate&&!canEdit&&<div style={{fontSize:9.5,color:T.sub}}>Posted: {prettyDate(liv.postedDate)}</div>}</>:!canEdit&&<div style={{fontSize:11,color:T.label,fontStyle:"italic"}}>Not posted</div>}
              </>}
            </div>
            {/* Tracking */}
            <div style={{padding:"12px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <Lbl>Tracking</Lbl>
                {liv.postUrl&&livePostUrlOk(liv.postUrl,cr.platform)&&<button onClick={()=>refresh(cr._id,extUrl(liv.postUrl),cr.platform)} disabled={isFetch} style={{fontSize:8.5,color:T.accent,background:"transparent",border:`1px solid ${T.accent}25`,borderRadius:3,padding:"2px 6px",cursor:isFetch?"not-allowed":"pointer",fontFamily:"'Sora'",opacity:isFetch?0.5:1}}>{isFetch?"…":"↻ Refresh"}</button>}
              </div>
              {!liv.postUrl&&<div style={{fontSize:9.5,color:T.label,fontStyle:"italic"}}>Post URL required</div>}
              {liv.postUrl&&<>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>{[["Views",trk.views],["Likes",trk.likes],["Comments",trk.comments],["Forwards",trk.forwards]].map(([l,v])=><div key={l}><div style={{fontSize:8,color:T.label,marginBottom:1}}>{l}</div><div style={{fontSize:14,fontWeight:600,color:v!=null?T.text:T.mute}}>{fmtNum(v)}</div></div>)}</div>
                {trk.commentAnalysis&&<><div style={{fontSize:8,color:T.label,marginBottom:3}}>Comment Analysis</div><div style={{fontSize:9.5,color:T.sub,lineHeight:1.5}}>{trk.commentAnalysis}</div>{trk.positivityScore!=null&&<div style={{fontSize:9,color:T.green,marginTop:4}}>↑ {trk.positivityScore}% positive</div>}</>}
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
function TabBrief({camp,role,onSaveBrief,onAction}){
  const [editing,setEditing]=useState(false);
  const [messages,setMessages]=useState(camp.brief.messages||"");
  const [deliverables,setDeliverables]=useState(camp.brief.deliverables||[]);
  const [bmNote,setBmNote]=useState(camp.amNote||"");
  const [cmNote,setCmNote]=useState(camp.cmNote||"");
  const isAM=["am","founder","pcm"].includes(role),isCM=["cm","pcm","founder"].includes(role);
  const canAMEdit=isAM&&["draft","creator_shortlist"].includes(camp.stage);
  const canCMRev=isCM&&["concept_submitted","internal_review"].includes(camp.stage);
  const save=()=>{onSaveBrief({messages,deliverables});setEditing(false);};
  return(<div>
    {[["Objective",camp.brief.objective],["Audience",camp.brief.audience]].map(([l,v],i)=><div key={l}><div style={{padding:"12px 0"}}><Lbl style={{display:"block",marginBottom:5}}>{l}</Lbl><div style={{fontSize:12,color:v?T.text:T.label,lineHeight:1.6,fontStyle:v?"normal":"italic"}}>{v||"Not specified"}</div></div><Hr/></div>)}
    <div style={{padding:"12px 0"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}><Lbl>Key Messages</Lbl>{canAMEdit&&!editing&&<button onClick={()=>setEditing(true)} style={{fontSize:9,color:T.accent,background:"none",border:"none",cursor:"pointer",fontFamily:"'Sora'"}}>Edit</button>}</div>{editing&&canAMEdit?<textarea value={messages} onChange={e=>setMessages(e.target.value)} style={{...INP,minHeight:60,marginBottom:8}}/>:<div style={{fontSize:12,color:messages?T.text:T.label,lineHeight:1.6,fontStyle:messages?"normal":"italic"}}>{messages||"Not specified — AM to fill"}</div>}</div><Hr/>
    <div style={{padding:"12px 0"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}><Lbl>Deliverables</Lbl>{canAMEdit&&!editing&&<button onClick={()=>setEditing(true)} style={{fontSize:9,color:T.accent,background:"none",border:"none",cursor:"pointer",fontFamily:"'Sora'"}}>Edit</button>}</div>{editing&&canAMEdit?<DelvSelect value={deliverables} onChange={setDeliverables}/>:deliverables.length>0?<div style={{display:"flex",flexWrap:"wrap",gap:5}}>{deliverables.map(d=><span key={d} style={{fontSize:10.5,color:T.sub,padding:"3px 8px",background:T.mute,borderRadius:3}}>{d}</span>)}</div>:<div style={{fontSize:12,color:T.label,fontStyle:"italic"}}>Not selected — AM to choose</div>}</div>
    {editing&&canAMEdit&&<div style={{display:"flex",gap:8,marginTop:4}}><Btn variant="primary" onClick={save}>Save</Btn><Btn variant="ghost" onClick={()=>setEditing(false)}>Cancel</Btn></div>}
    <Hr style={{marginTop:4}}/>
    {[["Budget",camp.brief.budget],["Timeline",camp.brief.timeline]].map(([l,v],i)=><div key={l}><div style={{padding:"12px 0"}}><Lbl style={{display:"block",marginBottom:5}}>{l}</Lbl><div style={{fontSize:12,color:v?T.text:T.label}}>{v||"—"}</div></div>{i===0&&<Hr/>}</div>)}
    {camp.cmNote&&(isCM||isAM)&&<div style={{marginTop:14,paddingLeft:10,borderLeft:`2px solid ${T.accent}`}}><Lbl color={T.accent} style={{display:"block",marginBottom:4}}>CM Note</Lbl><div style={{fontSize:11.5,color:T.sub,lineHeight:1.6}}>{camp.cmNote}</div></div>}
    {role!=="ea"&&camp.internalNotes&&<div style={{marginTop:12,paddingLeft:10,borderLeft:`2px solid ${T.amber}`}}><Lbl color={T.amber} style={{display:"block",marginBottom:4}}>Internal — not visible to client</Lbl><div style={{fontSize:11.5,color:T.sub,lineHeight:1.6}}>{camp.internalNotes}</div></div>}
    {canAMEdit&&<div style={{marginTop:20}}><Hr style={{marginBottom:16}}/><Lbl style={{display:"block",marginBottom:8}}>AM Review</Lbl><textarea value={bmNote} onChange={e=>setBmNote(e.target.value)} placeholder="Review note…" style={{...INP,minHeight:60,marginBottom:10}}/><div style={{display:"flex",gap:8}}><Btn variant="primary" onClick={()=>onAction("advance_to_shortlist",{note:bmNote})}>Move to Creator Shortlisting</Btn><Btn variant="ghost" onClick={()=>onAction("am_request_edit",{note:bmNote})}>Request edit</Btn></div></div>}
    {canCMRev&&<div style={{marginTop:20}}><Hr style={{marginBottom:16}}/><Lbl style={{display:"block",marginBottom:8}}>CM / PCM Review</Lbl><textarea value={cmNote} onChange={e=>setCmNote(e.target.value)} placeholder="Review note…" style={{...INP,minHeight:60,marginBottom:10}}/><div style={{display:"flex",gap:8}}><Btn variant="primary" onClick={()=>onAction("cm_approve_concept")}>Approve concept</Btn><Btn variant="ghost" onClick={()=>onAction("cm_request_changes",{note:cmNote})}>Request changes</Btn></div></div>}
  </div>);
}

// ── TEAM TAB ─────────────────────────────────────────────────────────────────
function TabTeam({camp,role,onAction}){
  const [selCM,setSelCM]=useState(camp.cmId||"");
  const [selEA,setSelEA]=useState(camp.eaId||"");
  const [justif,setJustif]=useState("");
  const isAM=["am","founder","pcm"].includes(role),isCM=["cm","pcm","founder"].includes(role);
  const canAssignCM=isAM&&["draft","creator_shortlist","po_raised"].includes(camp.stage);
  const canAssignEA=isCM&&camp.stage==="advance_received"&&!camp.eaId;
  const cms=TEAM_DIR.filter(t=>["cm","pcm"].includes(t.role)),eas=TEAM_DIR.filter(t=>t.role==="ea");
  return(<div>
    {[{label:"Account Manager",id:camp.amId},{label:"Category Manager",id:camp.cmId},{label:"Exec Associate",id:camp.eaId}].map(({label,id},i)=>{const m=getM(id);return(<div key={label}><div style={{padding:"12px 0"}}><Lbl style={{display:"block",marginBottom:5}}>{label}</Lbl><div style={{display:"flex",alignItems:"center",gap:7}}>{m&&<Av init={m.avatar} size={20}/>}<span style={{fontSize:12,color:m?T.text:T.label,fontStyle:m?"normal":"italic"}}>{m?m.name:"Unassigned"}</span>{m&&<span style={{fontSize:9,color:T.label}}>{m.jobTitle}</span>}</div></div>{i<2&&<Hr/>}</div>);})}
    {canAssignCM&&<div style={{marginTop:20}}><Hr style={{marginBottom:16}}/><Lbl style={{display:"block",marginBottom:8}}>Assign Category Manager</Lbl><select value={selCM} onChange={e=>setSelCM(e.target.value)} style={{...INP,resize:"none",marginBottom:10}}><option value="">Select CM…</option>{cms.map(cm=><option key={cm.id} value={cm.id}>{cm.name}</option>)}</select><Btn variant="primary" onClick={()=>selCM&&onAction("assign_cm",{cmId:selCM})} disabled={!selCM}>Assign CM</Btn></div>}
    {canAssignEA&&<div style={{marginTop:20}}><Hr style={{marginBottom:16}}/><Lbl style={{display:"block",marginBottom:8}}>Assign EA</Lbl><select value={selEA} onChange={e=>setSelEA(e.target.value)} style={{...INP,resize:"none",marginBottom:8}}><option value="">Select EA…</option>{eas.map(ea=><option key={ea.id} value={ea.id}>{ea.name} ({ea.jobTitle})</option>)}</select><textarea value={justif} onChange={e=>setJustif(e.target.value)} placeholder="Justification…" style={{...INP,minHeight:48,marginBottom:10}}/><Btn variant="primary" onClick={()=>selEA&&onAction("assign_ea",{eaId:selEA,justif})} disabled={!selEA}>Assign</Btn></div>}
    {camp.stage==="po_raised"&&<div style={{marginTop:20}}><Hr style={{marginBottom:16}}/><div style={{padding:"12px 14px",background:T.raised,borderRadius:6,border:`1px solid ${T.amber}22`,marginBottom:12}}><Lbl color={T.amber} style={{display:"block",marginBottom:4}}>Advance Pending</Lbl><div style={{fontSize:11.5,color:T.sub,lineHeight:1.5}}>Waiting for Finance to confirm advance payment received.</div></div>{(role==="accounts"||role==="founder"||role==="pcm")&&<Btn variant="success" onClick={()=>onAction("advance_received")}>Confirm advance received</Btn>}</div>}
  </div>);
}

// ── FINANCIALS TAB ───────────────────────────────────────────────────────────
function TabFinancials({camp,role}){
  const cb=camp.creatorBudget||camp.budget*0.6,af=camp.budget-cb;
  const cmt=(camp.creators||[]).reduce((s,c)=>s+(c.fee||0),0);
  const rows=[{label:"Total budget",value:fmtINR(camp.budget),color:T.text,show:true},{label:"Creator budget",value:fmtINR(cb),color:T.sub,show:true},{label:"Creator fees committed",value:fmtINR(cmt),color:cmt>cb?T.red:T.green,show:true},{label:"Creator budget remaining",value:fmtINR(cb-cmt),color:T.sub,show:true},{label:"Agency fee",value:fmtINR(af),color:T.accent,show:canFF(role)},{label:"Margin",value:`${((af/camp.budget)*100).toFixed(1)}%`,color:((af/camp.budget)*100)>=30?T.green:T.amber,show:canFF(role)}].filter(r=>r.show);
  return(<div><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}><Lbl>Financial overview</Lbl><span style={{fontSize:9,color:T.amber,border:`1px solid ${T.amber}25`,borderRadius:3,padding:"1px 6px"}}>Internal only</span></div>{rows.map(({label,value,color},i)=><div key={label}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0"}}><span style={{fontSize:11.5,color:T.sub}}>{label}</span><span style={{fontSize:12,fontWeight:500,color}}>{value}</span></div>{i<rows.length-1&&<Hr/>}</div>)}{!canFF(role)&&<div style={{marginTop:10,fontSize:10,color:T.label}}>Agency fee and margin visible to Founders only.</div>}</div>);
}

// ── TIMELINE TAB ─────────────────────────────────────────────────────────────
function TabTimeline({camp}){const events=camp.timeline||[];if(!events.length)return <div style={{padding:"20px 0",color:T.label,fontSize:11,textAlign:"center"}}>No events yet.</div>;return(<div>{events.map((ev,i)=><div key={i} style={{display:"flex",gap:12,marginBottom:i<events.length-1?16:0}}><div style={{display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0}}><div style={{width:5,height:5,borderRadius:"50%",marginTop:4,background:i===events.length-1?T.accent:T.green}}/>{i<events.length-1&&<div style={{width:1,flex:1,background:T.border,marginTop:5}}/>}</div><div><div style={{fontSize:11.5,color:T.text,lineHeight:1.5}}>{ev.event}</div><div style={{fontSize:9.5,color:T.sub,marginTop:2}}>{ev.actor} &middot; {ev.date}</div></div></div>)}</div>);}

// ── WORKFLOW ACTIONS ─────────────────────────────────────────────────────────
// Shows the right next-step CTA(s) for the current role and stage.
// Each entry: { stages, roles, actions: [{label, action, variant, data}], hint }
function WorkflowActions({camp, role, onAction}) {
  const isAM  = ["am","founder","pcm"].includes(role);
  const isCM  = ["cm","pcm","founder"].includes(role);
  const isEA  = ["ea","am","pcm","founder"].includes(role);
  const isAcc = ["accounts","founder","pcm"].includes(role);

  const actions = [];

  if (camp.stage==="draft" && isAM)
    actions.push({label:"Move to Creator Shortlisting", action:"advance_to_shortlist", variant:"primary"}, {label:"Request Brief Edit", action:"am_request_edit", variant:"ghost"});
  if (camp.stage==="creator_shortlist" && isAM)
    actions.push({label:"Raise Purchase Order", action:"raise_po", variant:"primary"});
  if (camp.stage==="po_raised" && isAcc)
    actions.push({label:"Confirm Advance Received", action:"advance_received", variant:"success"});
  if (camp.stage==="advance_received" && isCM && !camp.eaId)
    actions.push({label:"Assign EA to start Execution →", action:null, variant:"ghost", hint:"Use the Team tab to assign an EA"});
  if (camp.stage==="execution" && isEA)
    actions.push({label:"Mark Briefs Sent to Creators", action:"brief_sent", variant:"primary"});
  if (camp.stage==="brief_sent" && isEA)
    actions.push({label:"Mark Concepts Received", action:"concept_submitted", variant:"primary"});
  if (camp.stage==="concept_submitted" && isCM)
    actions.push({label:"Approve Concept", action:"cm_approve_concept", variant:"success"}, {label:"Request Changes", action:"cm_request_changes", variant:"ghost"});
  if (camp.stage==="concept_approved" && isEA)
    actions.push({label:"Mark Production Started", action:"start_production", variant:"primary"});
  if (camp.stage==="production" && isEA)
    actions.push({label:"Mark Video Submitted", action:"video_submitted", variant:"primary"});
  if (camp.stage==="video_submitted" && isAM)
    actions.push({label:"Approve Internally → Send to Client", action:"internal_approved", variant:"success"}, {label:"Request Revision", action:"internal_revision", variant:"ghost"});
  if (camp.stage==="internal_review" && isAM)
    actions.push({label:"Client Approved", action:"client_approved", variant:"success"}, {label:"Client Requested Revision", action:"client_revision", variant:"ghost"});
  if (camp.stage==="client_approved" && isAM)
    actions.push({label:"Mark Content Live", action:"mark_live", variant:"success"});
  if (camp.stage==="live" && isAcc)
    actions.push({label:"Confirm Creator Payments Released", action:"creator_paid", variant:"primary"});
  if (camp.stage==="creator_paid" && isAM)
    actions.push({label:"Start Reporting", action:"start_reporting", variant:"primary"});
  if (camp.stage==="reporting" && isAM)
    actions.push({label:"Mark Campaign Completed", action:"mark_completed", variant:"success"});

  if (!actions.length) return null;
  return (
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14,padding:"10px 14px",background:"rgba(0,0,0,0.03)",borderRadius:10,border:"1px solid rgba(0,0,0,0.07)",alignItems:"center"}}>
      <span style={{fontSize:9.5,color:"#86868B",marginRight:2,letterSpacing:"0.04em",textTransform:"uppercase",fontWeight:600,fontFamily:SF,flexShrink:0}}>Next</span>
      {actions.map((a,i)=> a.action
        ? <Btn key={i} variant={a.variant} onClick={()=>onAction(a.action,{})} style={{fontSize:11,padding:"6px 12px"}}>{a.label}</Btn>
        : <span key={i} style={{fontSize:11,color:"#86868B",fontStyle:"italic",fontFamily:SF}}>{a.hint}</span>
      )}
    </div>
  );
}

// ── DETAIL ───────────────────────────────────────────────────────────────────
function Detail({camp,role,onAction,onSaveBrief,onUpdateCreators,onDelete,onLogTimeline}){
  const [tab,setTab]=useState("brief");
  const [confirmDelete,setConfirmDelete]=useState(false);
  // Selecting a different campaign resets the panel to Brief — the tab chosen
  // on one campaign shouldn't leak onto the next.
  useEffect(()=>{setTab("brief");setConfirmDelete(false);},[camp.id]);
  const stCol=T.sc[camp.stage]||T.sub,pl=PIPELINE.find(p=>p.id===camp.stage)||PIPELINE[0];
  const tabs=[{id:"brief",label:"Brief"},{id:"team",label:"Team"},{id:"creators",label:`Creators (${camp.creators?.length||0})`},{id:"deliverables",label:"Deliverables"},{id:"timeline",label:"Timeline"},...(canFin(role)?[{id:"financials",label:"Financials"}]:[])];
  return(<div style={{display:"flex",flexDirection:"column",height:"100%",background:"#F5F5F7"}}>
    {/* Thin color accent top border */}
    <div style={{height:2,background:stCol,flexShrink:0}}/>
    <div style={{padding:"22px 28px 16px",background:"#FFFFFF",flexShrink:0,borderBottom:"1px solid rgba(0,0,0,0.07)"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
        <div style={{flex:1,minWidth:0}}>
          <h2 style={{fontFamily:"'Newsreader',serif",fontSize:24,fontWeight:600,color:"#1D1D1F",margin:"0 0 4px",fontStyle:"italic",letterSpacing:"-0.02em",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{camp.name}</h2>
          <div style={{fontSize:11.5,color:"#6E6E73",fontFamily:SF}}>{camp.client} · {camp.service} · {camp.region} · {prettyDate(camp.start)}–{prettyDate(camp.end)}{canFin(role)&&<span style={{marginLeft:8,fontWeight:600,color:"#1D1D1F"}}>{fmtINR(camp.budget)}</span>}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,marginLeft:16}}>
          <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:20,background:`${stCol}14`,border:`1px solid ${stCol}28`,fontSize:10.5,fontWeight:600,color:stCol,fontFamily:SF}}>{pl.label}</span>
          <span style={{fontSize:10,color:"#6E6E73",fontFamily:SF}}>{camp.progress}% complete</span>
          {can(role,"deleteCampaign")&&<Btn variant="danger" onClick={()=>setConfirmDelete(true)} style={{fontSize:10,padding:"4px 10px"}}>Delete</Btn>}
        </div>
      </div>
      {confirmDelete&&<DeleteCampaignModal camp={camp} onConfirm={()=>{setConfirmDelete(false);onDelete(camp.id);}} onCancel={()=>setConfirmDelete(false)}/>}
      <div style={{fontSize:10.5,color:"#6E6E73",marginBottom:12,fontFamily:SF,fontStyle:"italic"}}>{STAGE_HINT[camp.stage]}</div>
      <WorkflowActions camp={camp} role={role} onAction={onAction}/>
      <FullPipe stage={camp.stage}/>
    </div>
    {/* Tab strip */}
    <div style={{display:"flex",padding:"0 28px",background:"#FFFFFF",borderBottom:"1px solid rgba(0,0,0,0.07)",flexShrink:0}}>
      {tabs.map(t=>(
        <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"11px 0",marginRight:22,background:"transparent",border:"none",borderBottom:`2px solid ${tab===t.id?stCol:"transparent"}`,color:tab===t.id?"#1D1D1F":"#6E6E73",fontSize:12,cursor:"pointer",fontFamily:SF,fontWeight:tab===t.id?600:400,marginBottom:-1,transition:"all 0.15s",letterSpacing:"-0.01em"}}>{t.label}</button>
      ))}
    </div>
    <div style={{flex:1,overflowY:"auto",padding:"24px 28px",background:"#F5F5F7"}}>
      {tab==="brief"        &&<TabBrief        camp={camp} role={role} onAction={onAction} onSaveBrief={onSaveBrief}/>}
      {tab==="team"         &&<TabTeam         camp={camp} role={role} onAction={onAction}/>}
      {tab==="creators"     &&<TabCreators     camp={camp} role={role} onUpdateCreators={onUpdateCreators} onLogTimeline={onLogTimeline}/>}
      {tab==="deliverables" &&<TabDeliverables camp={camp} role={role} onUpdateCreators={onUpdateCreators}/>}
      {tab==="timeline"     &&<TabTimeline     camp={camp}/>}
      {tab==="financials"   &&canFin(role)&&<TabFinancials camp={camp} role={role}/>}
    </div>
  </div>);
}

// ── CREATE MODAL ─────────────────────────────────────────────────────────────
function CreateModal({onClose,onSubmit,brands,onCreateBrand}){
  const [step,setStep]=useState(0);
  const [f,setF]=useState({name:"",brandId:"",service:"Influencer Marketing",region:"",niche:"",budget:"",numCreators:5,objective:"",audience:"",messages:"",deliverables:[],timelineStart:"",timelineEnd:"",internalNotes:""});
  const [newBrandName,setNewBrandName]=useState("");
  // Staged only — nothing is written to the backend until the campaign is
  // actually submitted, so abandoning this modal never leaves an orphan brand.
  const [pendingBrandName,setPendingBrandName]=useState(null);
  const [submitting,setSubmitting]=useState(false);
  const [brandErr,setBrandErr]=useState(null);
  const u=(k,v)=>setF(p=>({...p,[k]:v}));
  const STEPS=["Basics","Brief","Commercial","Internal"];
  // Per-step required fields — Next/Create stay disabled until the current
  // step's required inputs are filled (Brief + Internal have none).
  const stepOk=[
    !!(f.name.trim()&&f.service&&f.brandId),
    true,
    parseInt(f.budget)>0&&parseInt(f.numCreators)>0&&!!f.timelineStart&&!!f.timelineEnd&&f.timelineEnd>=f.timelineStart,
    true,
  ];
  const ok=stepOk[step];
  const allOk=stepOk.every(Boolean);
  const timelineLabel=f.timelineStart&&f.timelineEnd?`${prettyDate(f.timelineStart)} – ${prettyDate(f.timelineEnd)}`:"";
  const handleStageBrand=()=>{
    const name=newBrandName.trim();
    if(!name)return;
    setBrandErr(null);
    const existing=brands.find(b=>b.name.toLowerCase()===name.toLowerCase());
    if(existing){
      u("brandId",existing.id);
      setPendingBrandName(null);
    }else{
      setPendingBrandName(name);
      u("brandId","__new__");
    }
    setNewBrandName("");
  };
  const handleSubmit=async()=>{
    if(!allOk)return;
    const payload={...f,timeline:timelineLabel};
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
  // Backdrop is intentionally not clickable — the modal only closes via ✕
  return(<div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{position:"absolute",inset:0,background:"rgba(4,5,10,0.88)",backdropFilter:"blur(6px)"}}/>
    <div style={{position:"relative",width:"min(500px,94vw)",maxHeight:"88vh",background:T.surface,border:`1px solid ${T.borderMid}`,borderRadius:10,overflow:"hidden",display:"flex",flexDirection:"column"}}>
      <div style={{padding:"16px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div style={{fontFamily:"'Newsreader',serif",fontSize:18,color:T.text,fontStyle:"italic",marginBottom:2}}>New Campaign</div><Lbl>{STEPS[step]} — {step+1} of {STEPS.length}</Lbl></div><button onClick={onClose} style={{background:"transparent",border:"none",color:T.sub,fontSize:16,cursor:"pointer"}}>✕</button></div>
      <div style={{height:1.5,background:T.mute}}><div style={{height:1.5,background:T.accent,width:`${((step+1)/STEPS.length)*100}%`,transition:"width 0.25s"}}/></div>
      <div style={{padding:"18px 20px",overflowY:"auto",flex:1}}>
        {step===0&&<>
          <div style={{marginBottom:14}}><Lbl style={{display:"block",marginBottom:5}}>Campaign name *</Lbl><input value={f.name} onChange={e=>u("name",e.target.value)} placeholder="e.g. Summer Launch Teaser" style={{...INP,resize:"none"}}/></div>
          <div style={{marginBottom:6}}>
            <Lbl style={{display:"block",marginBottom:5}}>Brand *</Lbl>
            <select value={f.brandId} onChange={e=>{u("brandId",e.target.value);if(e.target.value!=="__new__")setPendingBrandName(null);}} style={{...INP,resize:"none"}}>
              <option value="">— Select brand —</option>
              {brands.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
              {pendingBrandName&&<option value="__new__">{pendingBrandName} (new)</option>}
            </select>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:6,alignItems:"center"}}>
            <input value={newBrandName} onChange={e=>setNewBrandName(e.target.value)} placeholder="+ Add new brand…" style={{...INP,resize:"none",flex:1}}/>
            <Btn variant="ghost" onClick={handleStageBrand} disabled={!newBrandName.trim()}>Add</Btn>
          </div>
          {pendingBrandName&&f.brandId==="__new__"&&<div style={{fontSize:9.5,color:T.amber,marginBottom:10}}>"{pendingBrandName}" will be created when you submit this campaign.</div>}
          {brandErr&&<div style={{fontSize:10.5,color:T.red,marginBottom:10}}>{brandErr}</div>}
          <div style={{marginBottom:14}}><Lbl style={{display:"block",marginBottom:5}}>Service *</Lbl><select value={f.service} onChange={e=>u("service",e.target.value)} style={{...INP,resize:"none"}}>{["Influencer Marketing","IM — Mass","IM — Sales"].map(s=><option key={s}>{s}</option>)}</select></div><div><Lbl style={{display:"block",marginBottom:5}}>Region</Lbl><input value={f.region} onChange={e=>u("region",e.target.value)} placeholder="e.g. South India" style={{...INP,resize:"none"}}/></div></>}
        {step===1&&<>{[["Objective","objective",60],["Target audience","audience",50],["Key Messages","messages",50]].map(([l,k,h])=><div key={k} style={{marginBottom:14}}><Lbl style={{display:"block",marginBottom:5}}>{l}</Lbl><textarea value={f[k]} onChange={e=>u(k,e.target.value)} style={{...INP,minHeight:h}}/></div>)}<div><Lbl style={{display:"block",marginBottom:6}}>Deliverables</Lbl><DelvSelect value={f.deliverables} onChange={v=>u("deliverables",v)}/></div></>}
        {step===2&&<>
          <div style={{marginBottom:14}}><Lbl style={{display:"block",marginBottom:5}}>Total budget (₹) *</Lbl><MoneyInput value={f.budget} onChange={v=>u("budget",v)} placeholder="e.g. 12,50,000" style={{...INP,resize:"none"}}/></div>
          <div style={{marginBottom:14}}><Lbl style={{display:"block",marginBottom:5}}>Creators required *</Lbl><input type="number" min={1} value={f.numCreators} onChange={e=>u("numCreators",e.target.value)} placeholder="5" style={{...INP,resize:"none"}}/></div>
          <div style={{marginBottom:14}}>
            <Lbl style={{display:"block",marginBottom:5}}>Niche</Lbl>
            <select value={f.niche} onChange={e=>u("niche",e.target.value)} style={{...INP,resize:"none",cursor:"pointer"}}>
              <option value="">— Any niche —</option>
              {NICHES.map(n=><option key={n} value={n}>{n}</option>)}
            </select>
            <div style={{fontSize:9,color:T.sub,marginTop:4}}>Steers Generate towards same/similar creators.</div>
          </div>
          <div style={{marginBottom:14}}>
            <Lbl style={{display:"block",marginBottom:5}}>Timeline *</Lbl>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><Lbl style={{display:"block",marginBottom:4,fontSize:8.5}}>Start</Lbl><DateInput value={f.timelineStart} onChange={v=>u("timelineStart",v)} max={f.timelineEnd||undefined} placeholder="Start date" style={{...INP,resize:"none"}}/></div>
              <div><Lbl style={{display:"block",marginBottom:4,fontSize:8.5}}>End</Lbl><DateInput value={f.timelineEnd} onChange={v=>u("timelineEnd",v)} min={f.timelineStart||undefined} placeholder="End date" style={{...INP,resize:"none"}}/></div>
            </div>
            {f.timelineStart&&f.timelineEnd&&f.timelineEnd<f.timelineStart&&<div style={{fontSize:9.5,color:T.red,marginTop:5}}>End date must be after the start date.</div>}
            {timelineLabel&&f.timelineEnd>=f.timelineStart&&<div style={{fontSize:9.5,color:T.sub,marginTop:5}}>{timelineLabel}</div>}
          </div>
        </>}
        {step===3&&<div><Lbl color={T.amber} style={{display:"block",marginBottom:5}}>Internal notes — never visible to client</Lbl><textarea value={f.internalNotes} onChange={e=>u("internalNotes",e.target.value)} placeholder="Margin targets, context…" style={{...INP,minHeight:100,borderColor:`${T.amber}30`}}/></div>}
      </div>
      <div style={{padding:"14px 20px",borderTop:`1px solid ${T.border}`,display:"flex",gap:8}}>{step>0&&<Btn variant="ghost" onClick={()=>setStep(s=>s-1)}>← Back</Btn>}<div style={{flex:1}}/>{step<STEPS.length-1?<Btn variant="primary" onClick={()=>setStep(s=>s+1)} disabled={!ok}>Next</Btn>:<Btn variant="primary" onClick={handleSubmit} disabled={submitting||!allOk}>{submitting?"Creating…":"Create campaign"}</Btn>}</div>
    </div>
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
      .then(data=>{ if(!cancelled){ setCampaigns(data); setLoading(false); } })
      .catch(err=>{ if(!cancelled){ setLoadError(err.message); setLoading(false); } });
    return ()=>{ cancelled=true; };
  },[]);
  // Live team directory from the users collection — silent fallback to the
  // hardcoded TEAM if the API is unreachable. The state bump re-renders so
  // getM()/Team-tab dropdowns pick up the fetched names.
  const [,setTeamLoaded]=useState(false);
  useEffect(()=>{
    UsersAPI.list()
      .then(users=>{ const dir=teamFromUsers(users); if(dir.length){ TEAM_DIR=dir; setTeamLoaded(true); } })
      .catch(()=>{});
  },[]);
  const [selectedId,setSelId]=useState("c1");
  const [search,setSearch]=useState("");
  const [stageFilter,setStageF]=useState("all");
  const [showCreate,setCreate]=useState(false);
  const [toast,setToast]=useState(null);
  const curRole=getR(role);
  const showToast=useCallback(msg=>{setToast(msg);setTimeout(()=>setToast(null),2800);},[]);
  const onAction=useCallback((action,data={})=>{
    let updatedCamp=null;
    setCampaigns(prev=>prev.map(c=>{
      if(c.id!==selectedId)return c;
      const addEv=(ev,actor)=>[...(c.timeline||[]),{date:today(),event:ev,actor:actor||"Ops"}];
      let next=c;
      switch(action){
        case "advance_to_shortlist": next={...c,stage:"creator_shortlist",briefStatus:"shortlisting",amNote:data.note||"",timeline:addEv("AM moved to creator shortlisting")};break;
        case "am_request_edit": next={...c,stage:"draft",briefStatus:"draft_edit",amNote:data.note||"",timeline:addEv("AM requested brief edit")};break;
        case "raise_po": next={...c,stage:"po_raised",timeline:addEv("Purchase Order raised")};break;
        case "advance_received": next={...c,stage:"advance_received",timeline:addEv("Advance received — execution cleared","Accounts")};break;
        case "assign_cm": next={...c,cmId:data.cmId,timeline:addEv(`CM assigned: ${getM(data.cmId)?.name}`)};break;
        case "assign_ea": next={...c,eaId:data.eaId,stage:"execution",timeline:addEv(`EA assigned: ${getM(data.eaId)?.name||data.eaId}`)};break;
        case "brief_sent": next={...c,stage:"brief_sent",timeline:addEv("Creator briefs sent")};break;
        case "concept_submitted": next={...c,stage:"concept_submitted",timeline:addEv("Creator concepts received")};break;
        case "cm_approve_concept": next={...c,stage:"concept_approved",cmNote:data.note||"",timeline:addEv("Concept approved — production starts",role)};break;
        case "cm_request_changes": next={...c,stage:"concept_submitted",cmNote:data.note||"",timeline:addEv("Changes requested on concept",role)};break;
        case "start_production": next={...c,stage:"production",timeline:addEv("Content production started")};break;
        case "video_submitted": next={...c,stage:"video_submitted",timeline:addEv("Video submitted by creator")};break;
        case "internal_approved": next={...c,stage:"internal_review",timeline:addEv("Content approved internally — sent to client",role)};break;
        case "internal_revision": next={...c,stage:"video_submitted",timeline:addEv("Internal revision requested",role)};break;
        case "client_approved": next={...c,stage:"client_approved",timeline:addEv("Client approved content")};break;
        case "client_revision": next={...c,stage:"video_submitted",timeline:addEv("Client requested revision")};break;
        case "mark_live": next={...c,stage:"live",progress:90,timeline:addEv("Content went live")};break;
        case "creator_paid": next={...c,stage:"creator_paid",timeline:addEv("Creator payments released","Accounts")};break;
        case "start_reporting": next={...c,stage:"reporting",timeline:addEv("Campaign report in progress")};break;
        case "mark_completed": next={...c,stage:"completed",progress:100,timeline:addEv("Campaign marked complete")};break;
        default: next=c;
      }
      updatedCamp=next;
      return next;
    }));
    // DB sync — happens after setCampaigns so updatedCamp is set
    setTimeout(()=>{
      if(updatedCamp){
        const{id,...rest}=updatedCamp;
        CampaignsAPI.update(id,rest).catch(()=>showToast("Save failed — check connection"));
      }
    },0);
    showToast(ACTION_MSGS[action]||action);
  },[selectedId,showToast,role]);
  // Double-check gate: stage-changing actions go through a confirmation modal
  // before onAction applies (and persists) anything. Pure assignments skip it.
  const [pendingAction,setPendingAction]=useState(null); // {action,data}
  const requestAction=useCallback((action,data={})=>{
    if(NO_CONFIRM_ACTIONS.has(action)){onAction(action,data);return;}
    setPendingAction({action,data});
  },[onAction]);
  const onSaveBrief=useCallback(patch=>{setCampaigns(prev=>prev.map(c=>c.id!==selectedId?c:{...c,brief:{...c.brief,...patch}}));CampaignsAPI.update(selectedId,{brief:{...(campaigns.find(c=>c.id===selectedId)?.brief||{}),...patch}}).catch(()=>showToast("Save failed — check connection"));showToast("Brief updated");},[selectedId,showToast,campaigns]);
  const onUpdateCreators=useCallback((next,extra)=>{setCampaigns(prev=>prev.map(c=>{if(c.id!==selectedId)return c;return{...c,creators:next,...(extra==="send_to_client"?{sentToClient:true}:{})}}));CampaignsAPI.update(selectedId,{creators:next,...(extra==="send_to_client"?{sentToClient:true}:{})}).catch(()=>showToast("Save failed — check connection"));if(extra==="send_to_client")showToast("Creator list sent to client");},[selectedId,showToast]);
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
  const onDeleteCampaign=useCallback(async(id)=>{
    if(!can(role,"deleteCampaign"))return;
    try{
      // backend soft-deletes (deleted:true) and logs the actor on the timeline
      await CampaignsAPI.remove(id,currentUser.name||role);
      setCampaigns(prev=>prev.filter(c=>c.id!==id));
      setSelId(null);
      showToast("Campaign deleted");
      // Cascade: purge billing docs that reference this campaign (auto-invoice
      // stub, client POs) so Billing stops showing the deleted campaign.
      try{
        const [invs,cpos]=await Promise.all([InvoicesAPI.list(),ClientPOsAPI.list()]);
        await Promise.all([
          ...invs.filter(x=>x.campaign===id).map(x=>InvoicesAPI.remove(x.id)),
          ...cpos.filter(x=>x.campaign===id).map(x=>ClientPOsAPI.remove(x.id)),
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
      region:f.region||"TBD", niche:f.niche||"", stage:"draft", progress:0,
      budget, creatorBudget:Math.round(budget*0.6),
      numReq:parseInt(f.numCreators)||5, start:f.timelineStart||today(), end:f.timelineEnd||"TBD",
      createdBy:currentUser.teamId,
      amId, cmId, eaId,
      brief:{objective:f.objective,audience:f.audience,messages:f.messages,deliverables:f.deliverables,budget:fmtINR(budget),timeline:f.timeline},
      briefStatus:"draft", amNote:"", cmNote:"", creators:[], genRounds:0,
      sentToClient:false, internalNotes:f.internalNotes,
      timeline:[{date:today(),event:"Campaign created",actor:currentUser.name||role.toUpperCase()}],
    };
    // Save campaign
    CampaignsAPI.create(c).catch(()=>showToast("Save failed — check connection"));
    // Auto-create a draft invoice stub in billing so the campaign appears in billing immediately
    if(budget > 0){
      const invId = `INV-AUTO-${campId}`;
      InvoicesAPI.create({
        id: invId, client: brandName(f.brandId)||"", clientId: f.brandId, brandId: f.brandId, campaign: campId,
        type:"campaign", label:`${f.name} — Campaign Invoice`,
        amount: budget, gstRate:18,
        raisedDate: today(), dueDate:"TBD", status:"pending",
        isRetainerClient:false, clientPO:null,
        schedule:{ type:"advance_final",
          advance:{ pct:50, amount:Math.round(budget*0.5), status:"pending" },
          final:{ pct:50, amount:Math.round(budget*0.5), status:"pending" },
        },
        gstin:"", sac:"998361", placeOfSupply:"",
        confirmedByAccounts:false, confirmedByFounder:false,
        autoCreated:true,
      }).catch(()=>{}); // silent — billing stub creation is best-effort
    }
    setCampaigns(p=>[c,...p]);setSelId(c.id);setCreate(false);showToast("Campaign created");
  },[showToast,role,currentUser,brandName]);
  const visible=useMemo(()=>campaigns.filter(c=>{if(!canSee(c,role,currentUser.teamId))return false;if(brandFilter&&c.brandId!==brandFilter)return false;if(stageFilter!=="all"){const g={intake:["draft","creator_shortlist","po_raised"],planning:["advance_received","execution","brief_sent"],execution:["concept_submitted","concept_approved","production"],delivery:["video_submitted","internal_review","client_approved","live","creator_paid","reporting","completed"]};if(!g[stageFilter]?.includes(c.stage))return false;}if(search){const s=search.toLowerCase();if(!c.name.toLowerCase().includes(s)&&!c.client.toLowerCase().includes(s))return false;}return true;}),[campaigns,role,currentUser.teamId,stageFilter,search,brandFilter]);
  // Selection must respect the active filters — resolve against `visible`, not
  // `campaigns`, or the detail panel (and its Creators tab) keeps showing a
  // campaign from another brand after the brand filter changes.
  const selected=visible.find(c=>c.id===selectedId)||null;
  useEffect(()=>{
    if(!loading&&!visible.some(c=>c.id===selectedId)) setSelId(visible[0]?.id??null);
  },[loading,visible,selectedId]);
  const needsAttn=visible.filter(c=>["draft","po_raised","concept_submitted","video_submitted"].includes(c.stage)).length;
  if(loading)return(<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",background:"#F5F5F7",fontFamily:SF,fontSize:13,color:"#6E6E73"}}>Loading campaigns…</div>);
  if(loadError)return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",background:"#F5F5F7",fontFamily:SF,fontSize:13,gap:8,color:"#6E6E73"}}><div>Couldn't reach the campaigns API.</div><div style={{fontSize:11,color:"#86868B"}}>{loadError}</div></div>);
  return(<div style={{display:"flex",flexDirection:"column",height:"100%",background:"#F5F5F7",fontFamily:SF,color:"#1D1D1F",overflow:"hidden"}}>
    {/* Toast */}
    {toast&&<div style={{position:"fixed",bottom:24,right:24,zIndex:9999,padding:"11px 18px",background:"rgba(29,29,31,0.92)",backdropFilter:"blur(16px)",borderRadius:12,fontSize:12,color:"#FFFFFF",fontFamily:SF,boxShadow:"0 8px 32px rgba(0,0,0,0.24)",letterSpacing:"-0.01em"}}>{toast}</div>}
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
      {/* Stats row */}
      <div style={{display:"flex",gap:0,marginBottom:14,background:"rgba(0,0,0,0.03)",borderRadius:10,padding:"2px",border:"1px solid rgba(0,0,0,0.06)"}}>
        {[{l:"All",v:visible.length},{l:"Active",v:visible.filter(c=>!["completed","draft"].includes(c.stage)).length},{l:"Live",v:visible.filter(c=>c.stage==="live").length},{l:"Attention",v:needsAttn}].map((s,i)=>(
          <div key={s.l} style={{flex:1,padding:"8px 12px",textAlign:"center",borderRight:i<3?"1px solid rgba(0,0,0,0.06)":"none"}}>
            <div style={{fontSize:18,fontWeight:700,color:s.l==="Attention"&&needsAttn>0?T.amber:"#1D1D1F",letterSpacing:"-0.03em",lineHeight:1,fontFamily:SF}}>{s.v}</div>
            <div style={{fontSize:9.5,color:"#86868B",marginTop:2,fontFamily:SF}}>{s.l}</div>
          </div>
        ))}
      </div>
      {/* Search + filters */}
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        <div style={{position:"relative",flex:1,maxWidth:200}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{width:"100%",padding:"7px 10px 7px 28px",borderRadius:8,background:"rgba(0,0,0,0.04)",border:"1px solid rgba(0,0,0,0.08)",color:"#1D1D1F",fontSize:11.5,fontFamily:SF,outline:"none",boxSizing:"border-box"}}/>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:12,color:"#86868B",pointerEvents:"none"}}>⌕</span>
        </div>
        <div style={{display:"flex",background:"rgba(0,0,0,0.04)",borderRadius:8,padding:2,gap:1}}>
          {[["all","All"],["intake","Intake"],["planning","Plan"],["execution","Exec"],["delivery","Done"]].map(([id,lbl])=>(
            <button key={id} onClick={()=>setStageF(id)} style={{padding:"5px 10px",borderRadius:6,fontSize:10.5,fontWeight:stageFilter===id?600:400,background:stageFilter===id?"#FFFFFF":"transparent",cursor:"pointer",fontFamily:SF,border:"none",color:stageFilter===id?"#1D1D1F":"#6E6E73",boxShadow:stageFilter===id?"0 1px 3px rgba(0,0,0,0.1)":"none",transition:"all 0.12s"}}>{lbl}</button>
          ))}
        </div>
      </div>
    </div>
    {/* Body */}
    <div style={{display:"flex",flex:1,minHeight:0}}>
      {/* Sidebar */}
      <div style={{width:290,flexShrink:0,borderRight:"1px solid rgba(0,0,0,0.07)",overflowY:"auto",padding:"8px 8px",background:"#FAFAFA"}}>
        {visible.length===0
          ? <div style={{padding:"48px 16px",textAlign:"center",color:"#86868B",fontSize:12,fontFamily:SF}}>No campaigns match</div>
          : (() => {
              const groups = {};
              visible.forEach(c => {
                const label = brandName(c.brandId) || "Unassigned";
                (groups[label] = groups[label] || []).push(c);
              });
              const labels = Object.keys(groups).sort((a,b) =>
                a==="Unassigned" ? 1 : b==="Unassigned" ? -1 : a.localeCompare(b));
              return labels.map(label => (
                <div key={label} style={{marginBottom:10}}>
                  <div style={{padding:"6px 8px 4px",fontSize:9.5,fontWeight:700,color:"#86868B",textTransform:"uppercase",letterSpacing:"0.06em",fontFamily:SF}}>
                    {label} · {groups[label].length}
                  </div>
                  {groups[label].map(c => (
                    <CampCard key={c.id} camp={c} selected={selectedId===c.id} onClick={()=>setSelId(c.id)} role={role}/>
                  ))}
                </div>
              ));
            })()
        }
      </div>
      {/* Detail panel */}
      <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {selected
          ? <Detail camp={selected} role={role} onAction={requestAction} onSaveBrief={onSaveBrief} onUpdateCreators={onUpdateCreators} onDelete={onDeleteCampaign} onLogTimeline={onLogTimeline}/>
          : <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,background:"#F5F5F7"}}>
              <div style={{width:48,height:48,borderRadius:16,background:"rgba(0,0,0,0.05)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:"#86868B"}}>◎</div>
              <div style={{fontSize:14,fontWeight:600,color:"#1D1D1F",fontFamily:SF,letterSpacing:"-0.02em"}}>Select a campaign</div>
              <div style={{fontSize:11.5,color:"#86868B",fontFamily:SF}}>
                {needsAttn>0?`${needsAttn} campaign${needsAttn>1?"s":""} need attention`:`${visible.length} campaign${visible.length!==1?"s":""}` }
              </div>
            </div>
        }
      </div>
    </div>
    {showCreate&&<CreateModal onClose={()=>setCreate(false)} onSubmit={onCreate} brands={brands} onCreateBrand={onCreateBrand}/>}
    {pendingAction&&selected&&<ConfirmActionModal camp={selected} label={ACTION_MSGS[pendingAction.action]||pendingAction.action}
      onConfirm={()=>{onAction(pendingAction.action,pendingAction.data);setPendingAction(null);}}
      onCancel={()=>setPendingAction(null)}/>}
  </div>);
}