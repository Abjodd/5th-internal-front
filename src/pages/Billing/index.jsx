/**
 * 5th Avenue — Internal Billing · V2 (crash-fixed rewrite)
 * No IIFEs in JSX · All null guards · Clean component structure
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { InvoicesAPI, ExpensesAPI, PurchaseOrdersAPI, ClientPOsAPI, QuotesAPI, RegistryAPI, CampaignsAPI } from "../../lib/api";
import { can } from "../../lib/rbac";

// ── TOKENS ────────────────────────────────────────────────────────────────────
import { T } from "../../theme/tokens";

const INP = {
  width:"100%", padding:"7px 10px", borderRadius:5,
  background:T.raised, border:`1px solid ${T.border}`,
  color:T.text, fontSize:11.5, fontFamily:"'Sora'", outline:"none",
};

const FY = "2025–26";
const todayStr = () => new Date().toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });

// ── ROLES ─────────────────────────────────────────────────────────────────────
// NOTE: "pcm" (Partner Category Manager) gets accounts-tier financial
// visibility + PO rights, scoped to the campaign/event they select — see
// canRaisePO / isAccounts below and the event filter on the Dashboard,
// Income, Spending and Campaign P&L tabs. Every other operating role
// (Category Manager, EA, Brand/Account Manager) stays revenue-blind:
// showAmt() masks amounts to "₹ ——" for them everywhere in this file.
const ROLES = [
  { id:"founder",  label:"Founder" },
  { id:"accounts", label:"Accounts" },
  { id:"pcm",      label:"PCM (Partner Cat. Mgr)" },
  { id:"bm",       label:"Brand Manager" },
  { id:"cm",       label:"Category Manager" },
  { id:"ea",       label:"EA" },
];

// ── ROLE GATES ────────────────────────────────────────────────────────────────
const isFounder = r => r === "founder";
// Accounts-tier visibility: Founder, Accounts team, and PCM (full billing
// access to their own event's numbers).
const isAccounts = r => r === "founder" || r === "accounts" || r === "pcm";
const isPCM = r => r === "pcm";
const canRaisePO = r => ["founder","cm","ea","pcm"].includes(r);
const showAmt = (n, r) => isAccounts(r) ? fmtFull(n) : "₹ ——";

// ── HELPERS ───────────────────────────────────────────────────────────────────
function fmtINR(n) {
  if (!n && n !== 0) return "—";
  if (n >= 10000000) return `₹${(n/10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `₹${(n/100000).toFixed(1)}L`;
  if (n >= 1000)     return `₹${(n/1000).toFixed(0)}K`;
  return `₹${n}`;
}
function fmtFull(n) { return "₹" + (n || 0).toLocaleString("en-IN"); }
function fmtPct(n)  { return `${Number(n || 0).toFixed(1)}%`; }

// ── MARGIN MODEL ──────────────────────────────────────────────────────────────
function calcMargin(clientBudget, marginPct, agencyFeePct, agencyFeeType, isRetainer) {
  const margin    = clientBudget * (marginPct / 100);
  const agencyFee = isRetainer ? 0 : clientBudget * (agencyFeePct / 100);
  const opsBudget = agencyFeeType === "baked_in"
    ? clientBudget - margin - agencyFee
    : clientBudget - margin;
  const clientTotal  = agencyFeeType === "over_above" ? clientBudget + agencyFee : clientBudget;
  const grossProfit  = margin + agencyFee;
  const grossPct     = clientTotal > 0 ? (grossProfit / clientTotal) * 100 : 0;
  return { margin, agencyFee, opsBudget, clientTotal, grossProfit, grossPct };
}

// ── QUOTE TOTALS ──────────────────────────────────────────────────────────────
function calcQuoteTotals(lines, agencyFeePct, agencyFeeType) {
  const sub    = lines.reduce((s, l) => s + (l.qty || 1) * (l.rate || 0), 0);
  const gst    = lines.reduce((s, l) => s + (l.qty || 1) * (l.rate || 0) * ((l.gstRate || 18) / 100), 0);
  const fee    = agencyFeeType === "over_above" ? sub * ((agencyFeePct || 0) / 100) : 0;
  const feeGst = fee * 0.18;
  return { sub, gst, fee, feeGst, grand: sub + gst + fee + feeGst };
}

// ── ANOMALY DETECTION ─────────────────────────────────────────────────────────
function detectAnomalies(expenses) {
  const anomalies = [];
  const byCamp = {};

  expenses
    .filter(e => ["external_creator","external_vendor"].includes(e.cat) && e.campaign)
    .forEach(e => {
      if (!byCamp[e.campaign]) byCamp[e.campaign] = [];
      byCamp[e.campaign].push(e);
    });

  Object.entries(byCamp).forEach(([cid, exps]) => {
    if (exps.length < 2) return;
    const amounts = exps.map(e => e.amount);
    const mean    = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const stdDev  = Math.sqrt(amounts.reduce((s, a) => s + Math.pow(a - mean, 2), 0) / amounts.length) || 1;
    exps.forEach(e => {
      const z = (e.amount - mean) / stdDev;
      if (Math.abs(z) > 2) {
        anomalies.push({
          id: `amt_${e.id}`,
          type: "payment_amount",
          severity: Math.abs(z) > 3 ? "critical" : "high",
          campaign: cid,
          payee: e.payee,
          amount: e.amount,
          msg: `${e.payee}: ${fmtINR(e.amount)} vs campaign avg ${fmtINR(mean)} (${z.toFixed(1)}σ)`,
        });
      }
    });
  });

  // CPF check
  const cpfByCamp = {};
  expenses
    .filter(e => e.vendorForCreator && e.vendorForCreator.followers && e.amount > 0 && e.campaign)
    .forEach(e => {
      if (!cpfByCamp[e.campaign]) cpfByCamp[e.campaign] = [];
      cpfByCamp[e.campaign].push({ ...e, cpf: e.amount / e.vendorForCreator.followers });
    });
  Object.values(cpfByCamp).forEach(exps => {
    if (exps.length < 2) return;
    const avgCpf = exps.reduce((s, e) => s + e.cpf, 0) / exps.length;
    exps.forEach(e => {
      if (e.cpf > avgCpf * 3) {
        anomalies.push({
          id: `cpf_${e.id}`,
          type: "cost_per_follower",
          severity: "medium",
          campaign: e.campaign,
          payee: e.payee,
          amount: e.amount,
          msg: `${e.payee}: ₹${(e.cpf * 100000).toFixed(0)}/100K followers vs avg ₹${(avgCpf * 100000).toFixed(0)}/100K`,
        });
      }
    });
  });

  // Duplicate guard
  const active = expenses.filter(e => e.status !== "cancelled");
  active.forEach((e, i) => {
    active.slice(i + 1).forEach(e2 => {
      if (
        e.payee === e2.payee &&
        e.campaign === e2.campaign &&
        e.amount > 0 && e2.amount > 0 &&
        Math.abs(e.amount - e2.amount) / Math.max(e.amount, e2.amount) < 0.15
      ) {
        anomalies.push({
          id: `dup_${e.id}_${e2.id}`,
          type: "duplicate",
          severity: "critical",
          payee: e.payee,
          campaign: e.campaign,
          msg: `Possible duplicate: ${e.payee} has two similar payments for the same campaign`,
        });
      }
    });
  });

  return anomalies;
}

// ── TALLY EXPORT ──────────────────────────────────────────────────────────────
function exportTally(invoices, expenses) {
  const rows = [["Date","Voucher Type","Ledger Name","Debit","Credit","Narration","Reference"]];
  invoices
    .filter(i => i.status === "paid" && i.type !== "credit_note")
    .forEach(i => {
      rows.push([i.paidDate || i.raisedDate, "Receipt", i.client, "", i.amount, i.label, i.id]);
    });
  expenses
    .filter(e => e.status === "paid" && !e.directorOnly)
    .forEach(e => {
      rows.push([e.date || "", "Payment", e.payee, e.amount, "", e.note || e.cat, e.id]);
    });
  const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `5thAvenue_Tally_${FY.replace("–","_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── LOCALSTORAGE ──────────────────────────────────────────────────────────────
const readLS  = k => { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch { return {}; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// ── SEED DATA ─────────────────────────────────────────────────────────────────
const CLIENTS = [
  { id:"cl1", name:"FreshBite Foods", isRetainer:true, retainerAmount:350000, agencyFeeExempt:true, creditLimit:1500000, poPreferred:true },
];

const SEED_INVOICES = [
  { id:"INV-2026-022", client:"FreshBite Foods", clientId:"cl1", campaign:"c1", type:"campaign",
    label:"Diwali Festive Push — Creator Batch 2", amount:280000, gstRate:18,
    raisedDate:"Apr 28, 2026", dueDate:"May 10, 2026", status:"pending",
    isRetainerClient:true, clientPO:{ id:"CPO-001", poNumber:"PO/FBF/2026/042", amount:1250000, status:"received" },
    schedule:{ type:"advance_final",
      advance:{ pct:50, amount:140000, status:"paid", paidDate:"Apr 28", utr:"HDFC2811204", razorpaySettled:true, settledDate:"Apr 30" },
      final:{ pct:50, amount:140000, status:"pending", dueDate:"May 10" } },
    gstin:"29AADCB2230M1ZP", sac:"998361", placeOfSupply:"Karnataka",
    confirmedByAccounts:true, confirmedByFounder:false },
  { id:"INV-2026-023", client:"FreshBite Foods", clientId:"cl1", campaign:null, type:"retainer",
    label:"Monthly Retainer — May 2026", amount:350000, gstRate:18,
    raisedDate:"May 1, 2026", dueDate:"May 15, 2026", status:"pending",
    isRetainerClient:true, clientPO:null,
    schedule:{ type:"single" },
    gstin:"29AADCB2230M1ZP", sac:"998311", placeOfSupply:"Karnataka",
    confirmedByAccounts:false, confirmedByFounder:false },
  { id:"INV-2026-020", client:"FreshBite Foods", clientId:"cl1", campaign:null, type:"retainer",
    label:"Monthly Retainer — April 2026", amount:350000, gstRate:18,
    raisedDate:"Apr 1, 2026", dueDate:"Apr 15, 2026", status:"overdue",
    isRetainerClient:true, clientPO:null,
    schedule:{ type:"single" },
    gstin:"29AADCB2230M1ZP", sac:"998311", placeOfSupply:"Karnataka",
    confirmedByAccounts:false, confirmedByFounder:false },
  { id:"INV-2026-019", client:"FreshBite Foods", clientId:"cl1", campaign:"c3", type:"campaign",
    label:"Festive Nano Wave — Final Settlement", amount:160000, gstRate:18,
    raisedDate:"Mar 10, 2026", dueDate:"Mar 25, 2026", status:"paid", paidDate:"Mar 22, 2026",
    isRetainerClient:true, clientPO:{ id:"CPO-002", poNumber:"PO/FBF/2026/019", amount:320000, status:"exhausted" },
    schedule:{ type:"advance_final",
      advance:{ pct:50, amount:80000, status:"paid", paidDate:"Mar 10", utr:"ICICI9920021", razorpaySettled:true, settledDate:"Mar 10" },
      final:{ pct:50, amount:80000, status:"paid", paidDate:"Mar 22", utr:"ICICI9920098", razorpaySettled:true, settledDate:"Mar 24" } },
    gstin:"29AADCB2230M1ZP", sac:"998361", placeOfSupply:"Karnataka",
    confirmedByAccounts:true, confirmedByFounder:true },
  { id:"CN-2026-003", client:"FreshBite Foods", clientId:"cl1", campaign:"c2", type:"credit_note",
    label:"Credit Note — Summer Launch (campaign delay)", amount:-45000, gstRate:18,
    raisedDate:"Apr 5, 2026", dueDate:null, status:"issued",
    isRetainerClient:true, clientPO:null, schedule:{ type:"single" },
    gstin:"29AADCB2230M1ZP", sac:"998311", placeOfSupply:"Karnataka",
    confirmedByAccounts:true, confirmedByFounder:true },
];

const SEED_CLIENT_POS = [
  { id:"CPO-001", client:"FreshBite Foods", campaign:"c1", campaignName:"Diwali Festive Push",
    poNumber:"PO/FBF/2026/042", amount:1250000, receivedDate:"Feb 18, 2026", validTill:"Jun 30, 2026",
    document:"uploaded", invoicedAmount:280000, status:"partial" },
  { id:"CPO-002", client:"FreshBite Foods", campaign:"c3", campaignName:"Festive Nano Wave",
    poNumber:"PO/FBF/2026/019", amount:320000, receivedDate:"Dec 28, 2025", validTill:"Mar 31, 2026",
    document:"uploaded", invoicedAmount:320000, status:"exhausted" },
];

const SEED_EXPENSES = [
  { id:"EXP-R-001", cat:"internal_regular", sub:"salary", payee:"May 2026 Payroll Batch", campaign:null,
    amount:385000, date:"May 1, 2026", status:"paid", schedule:{ type:"single" },
    tds:{ applicable:false }, gst:{ applicable:false }, approvedBy:"founder", utr:"AXS_PAYROLL_MAY26",
    note:"5 employees — batch transfer" },
  { id:"EXP-R-002", cat:"internal_regular", sub:"bonus", payee:"Q1 Performance Bonus", campaign:null,
    amount:75000, date:"Apr 28, 2026", status:"pending_approval", schedule:{ type:"single" },
    tds:{ applicable:false }, gst:{ applicable:false }, requestedBy:"founder" },
  { id:"EXP-DIR-001", cat:"director", sub:"salary", payee:"Founder — Director Salary", campaign:null,
    amount:200000, date:"May 1, 2026", status:"paid", schedule:{ type:"single" },
    tds:{ applicable:true, section:"192", rate:30, deducted:60000 }, gst:{ applicable:false },
    approvedBy:"founder", utr:"DIR_SAL_MAY26", directorOnly:true },
  { id:"EXP-DIR-002", cat:"director", sub:"consultancy", payee:"Founder LLP — Consultancy", campaign:null,
    amount:100000, date:"May 5, 2026", status:"paid", schedule:{ type:"single" },
    tds:{ applicable:true, section:"194J", rate:10, deducted:10000 }, gst:{ applicable:true, amount:18000 },
    approvedBy:"founder", utr:"DIR_CON_MAY26", directorOnly:true },
  { id:"EXP-DIR-003", cat:"director", sub:"drawings", payee:"Founder — Drawings", campaign:null,
    amount:50000, date:"May 10, 2026", status:"pending", schedule:{ type:"single" },
    tds:{ applicable:false }, gst:{ applicable:false }, directorOnly:true },
  { id:"EXP-DIR-004", cat:"director", sub:"profit_distribution", payee:"Founder — Profit Share Q1", campaign:null,
    amount:350000, date:"Apr 30, 2026", status:"paid", schedule:{ type:"single" },
    tds:{ applicable:false }, gst:{ applicable:false }, approvedBy:"founder", utr:"DIR_PRF_Q1_26", directorOnly:true },
  { id:"EXP-V-001", cat:"internal_variable", sub:"reimbursement", payee:"Arjun Reddy", campaign:"c1",
    amount:4200, date:"May 3, 2026", status:"pending_approval", schedule:{ type:"single" },
    tds:{ applicable:false }, gst:{ applicable:false }, requestedBy:"ea", note:"Travel to FreshBite HQ" },
  { id:"EXP-V-002", cat:"internal_variable", sub:"misc", payee:"Office Supplies", campaign:null,
    amount:8500, date:"Apr 28, 2026", status:"paid", schedule:{ type:"single" },
    tds:{ applicable:false }, gst:{ applicable:false }, approvedBy:"founder", utr:"MISC_APR26" },
  { id:"EXP-S-001", cat:"external_subscription", sub:"saas", payee:"Notion", campaign:null,
    amount:2800, date:"May 1, 2026", status:"paid", schedule:{ type:"single" },
    tds:{ applicable:false }, gst:{ applicable:true, amount:504 }, approvedBy:"founder" },
  { id:"EXP-S-002", cat:"external_subscription", sub:"saas", payee:"Adobe CC", campaign:null,
    amount:5400, date:"May 2, 2026", status:"paid", schedule:{ type:"single" },
    tds:{ applicable:false }, gst:{ applicable:true, amount:972 }, approvedBy:"founder" },
  { id:"EXP-S-003", cat:"external_subscription", sub:"saas", payee:"Metricool Pro", campaign:null,
    amount:1800, date:"May 1, 2026", status:"paid", schedule:{ type:"single" },
    tds:{ applicable:false }, gst:{ applicable:false }, approvedBy:"founder" },
  { id:"EXP-C-001", cat:"external_creator", sub:"creator_mcn", payee:"StarTalent MCN", campaign:"c1",
    amount:85000, date:"Apr 12, 2026", status:"paid",
    vendorType:"mcn", vendorForCreator:{ creatorName:"Anjali Kitchen", creatorHandle:"@anjalikitchen", creatorId:"r1", followers:820000, platform:"Instagram" },
    schedule:{ type:"single" }, tds:{ applicable:true, section:"194M", rate:10, deducted:8500 }, gst:{ applicable:false },
    pan:"STMCN1234A", poId:"PO-2026-001", approvedBy:"founder", utr:"HDFC2811909",
    eaConfirmed:true, cmConfirmed:true, accConfirmed:true },
  { id:"EXP-C-002", cat:"external_creator", sub:"creator_mcn", payee:"InfluenceHub Agency", campaign:"c1",
    amount:180000, date:null, status:"pending_approval",
    vendorType:"mcn", vendorForCreator:{ creatorName:"South Foodie", creatorHandle:"@southfoodie", creatorId:"r2", followers:1200000, platform:"YouTube" },
    schedule:{ type:"advance_final", advance:{ amount:90000, status:"pending_approval" }, final:{ amount:90000, status:"pending" } },
    tds:{ applicable:true, section:"194M", rate:10, deducted:18000 }, gst:{ applicable:false },
    pan:"IFHUB5678B", poId:"PO-2026-002", requestedBy:"cm", eaConfirmed:false, cmConfirmed:false, accConfirmed:false },
  { id:"EXP-C-003", cat:"external_creator", sub:"creator_mcn", payee:"NanoNet MCN", campaign:"c3",
    amount:18000, date:"Feb 10, 2026", status:"paid",
    vendorType:"mcn", vendorForCreator:{ creatorName:"Mumbai Munchies", creatorHandle:"@mumbaimunch", creatorId:"r3", followers:95000, platform:"Instagram" },
    schedule:{ type:"single" }, tds:{ applicable:false }, gst:{ applicable:false },
    pan:"NANO9012C", approvedBy:"founder", utr:"AXIS0029901", eaConfirmed:true, cmConfirmed:true, accConfirmed:true },
  { id:"EXP-C-004", cat:"external_creator", sub:"creator_mcn", payee:"GoaTalent MCN", campaign:"c3",
    amount:8000, date:"Feb 15, 2026", status:"paid",
    vendorType:"mcn", vendorForCreator:{ creatorName:"Goa Vibes", creatorHandle:"@goavibes", creatorId:"r4", followers:32000, platform:"Instagram" },
    schedule:{ type:"single" }, tds:{ applicable:false }, gst:{ applicable:false },
    pan:null, approvedBy:"founder", utr:"AXIS0029910", eaConfirmed:true, cmConfirmed:true, accConfirmed:true },
  { id:"EXP-V-010", cat:"external_vendor", sub:"vendor", payee:"Pixel Studio", campaign:"c2",
    amount:65000, date:"Apr 20, 2026", status:"paid",
    vendorType:"production", vendorForCreator:null,
    schedule:{ type:"advance_final",
      advance:{ amount:32500, status:"paid", paidDate:"Apr 20", utr:"SBI4481920" },
      final:{ amount:32500, status:"paid", paidDate:"May 8", utr:"SBI4491222" } },
    tds:{ applicable:true, section:"194C", rate:2, deducted:1300 }, gst:{ applicable:true, gstin:"27AAACS1234B1ZX", amount:11700 },
    pan:"PIXEL1234B", poId:"PO-2026-003", approvedBy:"founder", eaConfirmed:true, cmConfirmed:true, accConfirmed:true },
];

const SEED_POS = [
  { id:"PO-2026-001", raisedBy:"ea", raisedByName:"Arjun Reddy", vendor:"StarTalent MCN", vendorType:"creator_mcn",
    campaign:"c1", campaignName:"Diwali Festive Push", scope:"Creator fee via MCN for Anjali Kitchen — 3x Reels + 5x Stories",
    amount:85000, paymentScheduleType:"single", deliveryDate:"Apr 15, 2026",
    status:"closed", poDocument:"uploaded", approvedBy:"founder", approvedAt:"Mar 20, 2026",
    deliveryConfirmed:true, deliveryConfirmedBy:"ea", createdAt:"Mar 18, 2026", notes:"" },
  { id:"PO-2026-002", raisedBy:"cm", raisedByName:"Priya Nair", vendor:"InfluenceHub Agency", vendorType:"creator_mcn",
    campaign:"c1", campaignName:"Diwali Festive Push", scope:"Creator fee via MCN for South Foodie — 2x YouTube Shorts + 3x Community Posts",
    amount:180000, paymentScheduleType:"advance_final", deliveryDate:"May 20, 2026",
    status:"approved", poDocument:null, approvedBy:"founder", approvedAt:"Apr 25, 2026",
    deliveryConfirmed:false, deliveryConfirmedBy:null, createdAt:"Apr 23, 2026", notes:"" },
  { id:"PO-2026-003", raisedBy:"cm", raisedByName:"Priya Nair", vendor:"Pixel Studio", vendorType:"vendor",
    campaign:"c2", campaignName:"Summer Launch Teaser", scope:"Video production — 4x Reels (filming + editing)",
    amount:65000, paymentScheduleType:"advance_final", deliveryDate:"Apr 30, 2026",
    status:"closed", poDocument:"uploaded", approvedBy:"founder", approvedAt:"Apr 5, 2026",
    deliveryConfirmed:true, deliveryConfirmedBy:"ea", createdAt:"Apr 3, 2026", notes:"" },
  { id:"PO-2026-004", raisedBy:"cm", raisedByName:"Vikram Das", vendor:"VideoEdge Studio", vendorType:"vendor",
    campaign:"c2", campaignName:"Summer Launch Teaser", scope:"Post-production — colour grading + subtitle animation for 6 Reels",
    amount:38000, paymentScheduleType:"single", deliveryDate:"May 28, 2026",
    status:"pending_approval", poDocument:null, approvedBy:null, approvedAt:null,
    deliveryConfirmed:false, deliveryConfirmedBy:null, createdAt:todayStr(), notes:"" },
];

const SEED_REGISTRY = [
  { id:"r1", type:"creator", mcnVendor:"StarTalent MCN", name:"Anjali Kitchen", handle:"@anjalikitchen", platform:"Instagram", followers:820000, niche:"Cooking", pan:"ABCDE1234F", gstin:null, bank:"Via StarTalent MCN", tdsSection:"194M", tdsRate:10, totalPaid:255000, tdsDeducted:25500, panCollected:true, campaigns:["c1","c3"] },
  { id:"r2", type:"creator", mcnVendor:"InfluenceHub Agency", name:"South Foodie", handle:"@southfoodie", platform:"YouTube", followers:1200000, niche:"Food", pan:"FGHIJ5678K", gstin:null, bank:"Via InfluenceHub Agency", tdsSection:"194M", tdsRate:10, totalPaid:180000, tdsDeducted:18000, panCollected:true, campaigns:["c1"] },
  { id:"r3", type:"creator", mcnVendor:"NanoNet MCN", name:"Mumbai Munchies", handle:"@mumbaimunch", platform:"Instagram", followers:95000, niche:"Food", pan:"KLMNO9012P", gstin:null, bank:"Via NanoNet MCN", tdsSection:null, tdsRate:0, totalPaid:18000, tdsDeducted:0, panCollected:true, campaigns:["c3"] },
  { id:"r4", type:"creator", mcnVendor:"GoaTalent MCN", name:"Goa Vibes", handle:"@goavibes", platform:"Instagram", followers:32000, niche:"Lifestyle", pan:null, gstin:null, bank:"Via GoaTalent MCN", tdsSection:null, tdsRate:0, totalPaid:8000, tdsDeducted:0, panCollected:false, campaigns:["c3"] },
  { id:"r5", type:"vendor", mcnVendor:null, name:"Pixel Studio", handle:null, platform:null, followers:null, niche:null, pan:"PIXEL1234B", gstin:"27AAACS1234B1ZX", bank:"SBI — CA2229001", tdsSection:"194C", tdsRate:2, totalPaid:65000, tdsDeducted:1300, panCollected:true, campaigns:["c2"] },
  { id:"r6", type:"vendor", mcnVendor:null, name:"VideoEdge Studio", handle:null, platform:null, followers:null, niche:null, pan:"VIDEG5678C", gstin:"29VIDEG5678C1ZY", bank:"HDFC — CA4412009", tdsSection:"194C", tdsRate:2, totalPaid:0, tdsDeducted:0, panCollected:true, campaigns:["c2"] },
];

const SEED_QUOTES = [
  { id:"QT-2026-005", client:"FreshBite Foods", label:"FreshBite — Monsoon Campaign 2026", status:"sent",
    isAutoGenerated:false, campaignId:null, createdDate:"May 15, 2026", validTill:"May 31, 2026",
    isRetainerClient:true, marginPct:35, agencyFeePct:0, agencyFeeType:"over_above",
    lines:[
      { desc:"Influencer Marketing — 8 Creators (Reels + Stories)", sac:"998361", qty:1, rate:650000, gstRate:18 },
      { desc:"Campaign Strategy & Brief Development", sac:"998311", qty:1, rate:80000, gstRate:18 },
      { desc:"Performance Reports (2)", sac:"998312", qty:2, rate:25000, gstRate:18 },
    ],
    notes:"Retainer client — agency fee waived. 50% advance on acceptance." },
  { id:"QT-2026-004", client:"FreshBite Foods", label:"FreshBite — SEO Onboarding", status:"accepted",
    isAutoGenerated:false, campaignId:null, createdDate:"Apr 20, 2026", validTill:"May 5, 2026",
    isRetainerClient:true, marginPct:40, agencyFeePct:0, agencyFeeType:"baked_in",
    lines:[
      { desc:"SEO Strategy & Audit", sac:"998314", qty:1, rate:120000, gstRate:18 },
      { desc:"Monthly SEO Retainer (3 months)", sac:"998314", qty:3, rate:45000, gstRate:18 },
    ],
    notes:"Retainer client — agency fee waived. 3-month commitment." },
];

// SEED_CAMPS_REF is only used as initial fallback — tabs receive live `campsRef` prop from state
const SEED_CAMPS_REF = [
  { id:"c1", name:"Diwali Festive Push",  client:"FreshBite Foods", budget:1250000, marginPct:35, agencyFeePct:15, agencyFeeType:"over_above", isRetainerClient:true },
  { id:"c2", name:"Summer Launch Teaser", client:"FreshBite Foods", budget:800000,  marginPct:38, agencyFeePct:15, agencyFeeType:"baked_in",   isRetainerClient:true },
  { id:"c3", name:"Festive Nano Wave",    client:"FreshBite Foods", budget:320000,  marginPct:35, agencyFeePct:15, agencyFeeType:"over_above",  isRetainerClient:true },
];

const GST_CALENDAR = [
  { id:"g1", type:"GSTR-1",    period:"April 2026", dueDate:"May 11, 2026", status:"due",   filedDate:null },
  { id:"g2", type:"GSTR-3B",   period:"April 2026", dueDate:"May 20, 2026", status:"due",   filedDate:null },
  { id:"g3", type:"TDS 194M",  period:"April 2026", dueDate:"May 7, 2026",  status:"due",   filedDate:null },
  { id:"g4", type:"TDS 194C",  period:"April 2026", dueDate:"May 7, 2026",  status:"due",   filedDate:null },
  { id:"g5", type:"GSTR-1",    period:"March 2026", dueDate:"Apr 11, 2026", status:"filed", filedDate:"Apr 9, 2026" },
  { id:"g6", type:"GSTR-3B",   period:"March 2026", dueDate:"Apr 20, 2026", status:"filed", filedDate:"Apr 18, 2026" },
];

// ── DESIGN CONSTANTS ─────────────────────────────────────────────────────────
const SF = "'SF Pro Display','-apple-system','BlinkMacSystemFont','Helvetica Neue',sans-serif";

// ── ATOMS ─────────────────────────────────────────────────────────────────────
function Lbl({ children, color, style: s = {} }) {
  return (
    <span style={{ fontSize:9.5, fontWeight:600, color:color||"#6E6E73", textTransform:"uppercase", letterSpacing:"0.07em", fontFamily:SF, ...s }}>
      {children}
    </span>
  );
}
function Hr({ style: s = {} }) {
  return <div style={{ height:"0.5px", background:"rgba(0,0,0,0.08)", ...s }} />;
}
function Av({ init, size = 22, color }) {
  return (
    <div style={{ width:size, height:size, borderRadius:Math.max(4,size*0.25), flexShrink:0, background:color?`${color}18`:`${T.accent}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:Math.max(7, size*0.38), fontWeight:600, color:color||T.accent, fontFamily:SF }}>
      {init}
    </div>
  );
}
function Btn({ children, onClick, variant = "ghost", disabled, style: s = {} }) {
  const base = { padding:"7px 14px", borderRadius:8, fontSize:11, fontWeight:500, cursor:disabled?"not-allowed":"pointer", fontFamily:SF, border:"none", display:"inline-flex", alignItems:"center", gap:5, opacity:disabled?0.35:1, letterSpacing:"-0.01em", transition:"all 0.15s", ...s };
  const variants = {
    primary: { background:T.accent,  color:"#FFFFFF", fontWeight:600 },
    success: { background:T.green,   color:"#FFFFFF", fontWeight:600 },
    ghost:   { background:"rgba(0,0,0,0.05)", color:"#1D1D1F", border:"none" },
    danger:  { background:"transparent", color:T.red, border:`1px solid ${T.red}22` },
    amber:   { background:`${T.amber}12`, color:T.amber, border:`1px solid ${T.amber}28` },
    teal:    { background:`${T.teal}12`,  color:T.teal,  border:`1px solid ${T.teal}28` },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...(variants[variant] || variants.ghost) }}>{children}</button>;
}
function Pill({ status }) {
  const map = {
    paid:             [T.green,  "Paid"],
    pending:          [T.amber,  "Pending"],
    overdue:          [T.red,    "Overdue"],
    issued:           [T.teal,   "Issued"],
    pending_approval: [T.purple, "Awaiting Approval"],
    pending_review:   [T.amber,  "Pending Review"],
    approved:         [T.accent, "Approved"],
    draft:            [T.label,  "Draft"],
    sent:             [T.amber,  "Sent"],
    accepted:         [T.green,  "Accepted"],
    rejected:         [T.red,    "Rejected"],
    expired:          [T.sub,    "Expired"],
    due:              [T.amber,  "Due"],
    filed:            [T.green,  "Filed"],
    credit_note:      [T.teal,   "Credit"],
    closed:           [T.sub,    "Closed"],
    matched:          [T.teal,   "Matched"],
    work_delivered:   [T.teal,   "Delivered"],
    partial:          [T.amber,  "Partial"],
    exhausted:        [T.sub,    "Exhausted"],
    received:         [T.green,  "Received"],
    critical:         [T.red,    "Critical"],
    high:             [T.amber,  "High"],
    medium:           [T.gold,   "Medium"],
  };
  const [col, lbl] = map[status] || [T.label, status || "—"];
  return (
    <span style={{ fontSize:9, fontWeight:600, color:col, background:`${col}14`, padding:"2px 8px", borderRadius:20, letterSpacing:"0.04em", textTransform:"uppercase", whiteSpace:"nowrap", fontFamily:SF, border:`1px solid ${col}22` }}>
      {lbl}
    </span>
  );
}
function SevDot({ s }) {
  const icons = { critical:"🔴", high:"🟠", medium:"🟡", info:"🔵" };
  return <span style={{ fontSize:10 }}>{icons[s] || "⚪"}</span>;
}

// ── STAT CARD ─────────────────────────────────────────────────────────────────
// StatCard — renders NOTHING (not even a placeholder) if role lacks permission.
// Per spec: "Do not render the card. Do not display placeholders. Do not reserve empty space."
function StatCard({ label, value, sub, col, permission, role }) {
  if (permission && !can(role, permission)) return null;
  return (
    <div style={{ background:"#FFFFFF", borderRadius:14, padding:"18px 20px", boxShadow:"0 1px 0 rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.05)" }}>
      <div style={{ fontSize:10, color:"#6E6E73", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6, fontFamily:SF, fontWeight:500 }}>
        {label}
      </div>
      <div style={{ fontSize:26, fontWeight:700, color:col || "#1D1D1F", fontFamily:SF, letterSpacing:"-0.03em", lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"#6E6E73", marginTop:4, fontFamily:SF }}>{sub}</div>}
    </div>
  );
}

// ── INVOICE DETAIL PANEL ──────────────────────────────────────────────────────
function InvDetail({ inv, role, onAccConfirm, onFounderConfirm, onUploadPO }) {
  if (!inv) return <div style={{ textAlign:"center", paddingTop:60, color:T.label, fontSize:11 }}>Select an invoice to view details</div>;
  const gstAmt = Math.abs(inv.amount || 0) * ((inv.gstRate || 18) / 100);
  const schedType = inv.schedule && inv.schedule.type;
  return (
    <div style={{ padding:"20px 24px", overflowY:"auto", height:"100%" }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
        <div>
          <div style={{ fontFamily:"'Newsreader',serif", fontSize:18, fontWeight:600, color:T.text, fontStyle:"italic", marginBottom:3 }}>{inv.label}</div>
          <div style={{ fontSize:10, color:T.label, fontFamily:"monospace" }}>{inv.id} · {inv.raisedDate}</div>
          {inv.isRetainerClient && <div style={{ fontSize:9, color:T.teal, marginTop:3, fontWeight:500 }}>RETAINER CLIENT — Agency fee waived</div>}
        </div>
        <div style={{ display:"flex", gap:6 }}>
          <Pill status={inv.type === "credit_note" ? "credit_note" : inv.status} />
          {isAccounts(role) && <Btn variant="ghost" style={{ fontSize:10 }} onClick={() => alert("Branded PDF generated — 5th Avenue letterhead + GSTIN")}>↓ PDF</Btn>}
        </div>
      </div>

      {!inv.clientPO && inv.type === "campaign" && (
        <div style={{ background:`${T.amber}08`, border:`1px solid ${T.amber}25`, borderRadius:6, padding:"10px 12px", marginBottom:12, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontSize:11, color:T.amber }}>⚑ No Client PO on file — best practice to have one per campaign</div>
          <Btn variant="amber" style={{ fontSize:9 }} onClick={() => onUploadPO && onUploadPO(inv.id)}>Upload PO</Btn>
        </div>
      )}

      <Hr style={{ marginBottom:14 }} />

      <Lbl style={{ display:"block", marginBottom:8 }}>Payment Schedule</Lbl>
      {schedType === "single" ? (
        <div style={{ padding:"10px 12px", background:T.raised, borderRadius:6, marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between" }}>
            <span style={{ fontSize:11.5, color:T.text }}>Single payment</span>
            <span style={{ fontSize:12, fontWeight:600, color:T.text }}>{showAmt(Math.abs(inv.amount || 0), role)}</span>
          </div>
          <div style={{ fontSize:9.5, color:T.sub, marginTop:3 }}>
            Due: {inv.dueDate || "—"}
            {inv.paidDate && <span style={{ color:T.green }}> · Paid {inv.paidDate}</span>}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom:14 }}>
          {["advance","final"].map(t => {
            const s = inv.schedule && inv.schedule[t];
            if (!s) return null;
            return (
              <div key={t} style={{ padding:"10px 12px", background:T.raised, borderRadius:6, marginBottom:6, border:`1px solid ${s.status === "paid" ? `${T.green}25` : T.border}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontSize:11, fontWeight:500, color:T.text, textTransform:"capitalize" }}>
                    {t}{s.pct != null ? ` (${s.pct}%)` : ""}
                  </span>
                  <span style={{ fontSize:11.5, fontWeight:600, color:T.text }}>{showAmt(s.amount || 0, role)}</span>
                </div>
                {s.status === "paid" && (
                  <div style={{ fontSize:9.5, color:T.green }}>
                    Paid {s.paidDate} · UTR: {s.utr}
                    {s.razorpaySettled === false && <span style={{ color:T.teal }}> · Settling T+2</span>}
                    {s.settledDate && <span> · Settled {s.settledDate}</span>}
                  </div>
                )}
                <Pill status={s.status} />
              </div>
            );
          })}
        </div>
      )}

      {isFounder(role) && (
        <div style={{ marginBottom:14 }}>
          <Lbl style={{ display:"block", marginBottom:6 }}>
            GST Breakdown
            <span style={{ marginLeft:5, fontSize:7, color:T.amber, border:`1px solid ${T.amber}25`, borderRadius:2, padding:"0 3px" }}>Founder</span>
          </Lbl>
          <div style={{ background:T.raised, borderRadius:6, overflow:"hidden" }}>
            {[
              ["Taxable amount", fmtFull(Math.abs(inv.amount || 0))],
              ["CGST 9%",        fmtFull(gstAmt / 2)],
              ["SGST 9%",        fmtFull(gstAmt / 2)],
              ["Total incl. GST",fmtFull(Math.abs(inv.amount || 0) + gstAmt)],
            ].map(([l, v], i, arr) => (
              <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"7px 12px", background:i === arr.length-1 ? `${T.accent}08` : "transparent", borderBottom:i < arr.length-1 ? `1px solid ${T.border}` : "none" }}>
                <span style={{ fontSize:11, color:i === arr.length-1 ? T.text : T.sub }}>{l}</span>
                <span style={{ fontSize:11.5, fontWeight:i === arr.length-1 ? 600 : 400, color:i === arr.length-1 ? T.accent : T.text }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Lbl style={{ display:"block", marginBottom:8 }}>Confirmation Status</Lbl>
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        {[{ l:"Accounts logged", done:inv.confirmedByAccounts }, { l:"Founder confirmed", done:inv.confirmedByFounder }].map(item => (
          <div key={item.l} style={{ flex:1, padding:"8px 10px", background:item.done ? `${T.green}10` : T.raised, border:`1px solid ${item.done ? `${T.green}30` : T.border}`, borderRadius:5 }}>
            <div style={{ fontSize:9, color:item.done ? T.green : T.label, fontWeight:600 }}>{item.done ? "✓ " : ""}{item.l}</div>
            {!item.done && <div style={{ fontSize:9.5, color:T.sub }}>Pending</div>}
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:8 }}>
        {isAccounts(role) && !inv.confirmedByAccounts && inv.status !== "paid" && (
          <Btn variant="amber" onClick={() => onAccConfirm && onAccConfirm(inv.id)}>Log receipt reference</Btn>
        )}
        {isFounder(role) && inv.confirmedByAccounts && !inv.confirmedByFounder && (
          <Btn variant="success" onClick={() => onFounderConfirm && onFounderConfirm(inv.id)}>Confirm amount & mark paid</Btn>
        )}
      </div>
    </div>
  );
}

// ── EXPENSE DETAIL PANEL ──────────────────────────────────────────────────────
const CAT_LABEL = { internal_regular:"Internal — Regular", internal_variable:"Internal — Variable", external_subscription:"Subscription", external_creator:"Creator (MCN)", external_vendor:"Vendor", director:"Director" };
const CAT_COL   = { internal_regular:T.accent, internal_variable:T.purple, external_subscription:T.teal, external_creator:T.pink, external_vendor:T.amber, director:T.gold };

function ExpDetail({ exp, role, pos, anomalies, onApprove, onMarkPaid, onEAConfirm, onCMConfirm }) {
  if (!exp) return <div style={{ textAlign:"center", paddingTop:60, color:T.label, fontSize:11 }}>Select an expense to view details</div>;
  const col           = CAT_COL[exp.cat] || T.label;
  const linkedPO      = (pos || []).find(p => p.id === exp.poId);
  const deliverables  = readLS("deliverables_status");
  const dlKey         = `${exp.campaign}_${exp.vendorForCreator ? exp.vendorForCreator.creatorId : ""}`;
  const dlUploaded    = !!deliverables[dlKey] || exp.status === "paid";
  const expAnomalies  = (anomalies || []).filter(a => a.payee === exp.payee);
  const schedType     = exp.schedule && exp.schedule.type;

  return (
    <div style={{ padding:"20px 24px", overflowY:"auto", height:"100%" }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
        <div>
          <div style={{ fontFamily:"'Newsreader',serif", fontSize:18, fontWeight:600, color:T.text, fontStyle:"italic", marginBottom:3 }}>{exp.payee}</div>
          <div style={{ fontSize:10, color:col, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em" }}>{CAT_LABEL[exp.cat] || exp.cat}</div>
          {exp.vendorForCreator && (
            <div style={{ fontSize:11, color:T.pink, marginTop:3 }}>
              MCN payment for <strong>{exp.vendorForCreator.creatorName}</strong> ({exp.vendorForCreator.creatorHandle}) · {((exp.vendorForCreator.followers || 0) / 1000).toFixed(0)}K followers · {exp.vendorForCreator.platform}
            </div>
          )}
        </div>
        <Pill status={exp.status} />
      </div>

      {expAnomalies.length > 0 && (
        <div style={{ background:`${T.red}08`, border:`1px solid ${T.red}25`, borderRadius:6, padding:"10px 12px", marginBottom:12 }}>
          <Lbl color={T.red} style={{ display:"block", marginBottom:6 }}>Anomalies detected</Lbl>
          {expAnomalies.map(a => (
            <div key={a.id} style={{ fontSize:11, color:T.sub, padding:"4px 0", borderTop:`1px solid ${T.border}` }}>
              <SevDot s={a.severity} /> {a.msg}
            </div>
          ))}
        </div>
      )}

      <Hr style={{ marginBottom:14 }} />

      <div style={{ fontSize:22, fontWeight:700, color:T.text, marginBottom:8, fontFamily:"'Sora'" }}>
        {showAmt(exp.amount || 0, role)}
        {isFounder(role) && exp.tds && exp.tds.applicable && (
          <span style={{ fontSize:13, color:T.amber, marginLeft:10 }}>
            – TDS {fmtFull(exp.tds.deducted || 0)} = net {fmtFull((exp.amount || 0) - (exp.tds.deducted || 0))}
          </span>
        )}
      </div>

      {linkedPO && (
        <div style={{ background:T.raised, border:`1px solid ${T.accent}25`, borderRadius:6, padding:"10px 12px", marginBottom:12 }}>
          <Lbl color={T.accent} style={{ display:"block", marginBottom:4 }}>Linked PO — {linkedPO.id}</Lbl>
          <div style={{ fontSize:11, color:T.sub }}>{linkedPO.scope}</div>
          <div style={{ display:"flex", gap:6, marginTop:5 }}>
            <Pill status={linkedPO.status} />
            {linkedPO.deliveryConfirmed && <Pill status="work_delivered" />}
          </div>
        </div>
      )}

      {exp.cat === "external_creator" && schedType === "advance_final" && !dlUploaded && (
        <div style={{ background:`${T.amber}08`, border:`1px solid ${T.amber}25`, borderRadius:6, padding:"10px 12px", marginBottom:12 }}>
          <div style={{ fontSize:11, color:T.amber }}>⚑ Final payment locked — waiting for deliverable upload in Campaigns dashboard</div>
        </div>
      )}

      <Lbl style={{ display:"block", marginBottom:8 }}>Payment Schedule</Lbl>
      {schedType === "single" ? (
        <div style={{ padding:"10px 12px", background:T.raised, borderRadius:6, marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between" }}>
            <span style={{ fontSize:11.5, color:T.text }}>Single payment</span>
            <span style={{ fontSize:11.5, color:T.text }}>{showAmt(exp.amount || 0, role)}</span>
          </div>
          {exp.utr && <div style={{ fontSize:9.5, color:T.green, marginTop:3 }}>UTR: {exp.utr}</div>}
        </div>
      ) : (
        <div style={{ marginBottom:14 }}>
          {["advance","final"].map(t => {
            const s = exp.schedule && exp.schedule[t];
            if (!s) return null;
            const locked = t === "final" && !dlUploaded;
            return (
              <div key={t} style={{ padding:"10px 12px", background:T.raised, borderRadius:6, marginBottom:6, border:`1px solid ${s.status === "paid" ? `${T.green}25` : locked ? `${T.amber}25` : T.border}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontSize:11, fontWeight:500, color:T.text, textTransform:"capitalize" }}>{t}{locked ? " 🔒" : ""}</span>
                  <span style={{ fontSize:11, color:T.text }}>{showAmt(s.amount || 0, role)}</span>
                </div>
                {s.utr && <div style={{ fontSize:9.5, color:T.green }}>UTR: {s.utr}</div>}
                <Pill status={locked ? "pending" : (s.status || "pending")} />
              </div>
            );
          })}
        </div>
      )}

      {isAccounts(role) && (exp.cat === "external_creator" || exp.cat === "external_vendor") && (
        <div style={{ marginBottom:14 }}>
          <Lbl style={{ display:"block", marginBottom:6 }}>Payee Details</Lbl>
          <div style={{ background:T.raised, borderRadius:6, overflow:"hidden" }}>
            {[
              ["PAN",        exp.pan || "Not collected", !exp.pan ? T.red : T.text],
              ["Payment mode", exp.vendorType === "mcn" ? "MCN Transfer" : "Vendor Transfer", T.text],
              ["TDS",        exp.tds && exp.tds.applicable ? `${exp.tds.section} @ ${exp.tds.rate}%` : "Not applicable", T.text],
            ].map(([l, v, c]) => (
              <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"7px 12px", borderBottom:`1px solid ${T.border}` }}>
                <span style={{ fontSize:11, color:T.sub }}>{l}</span>
                <span style={{ fontSize:11, color:c }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {exp.cat === "external_creator" && (
        <div style={{ marginBottom:14 }}>
          <Lbl style={{ display:"block", marginBottom:8 }}>Confirmation Chain</Lbl>
          <div style={{ display:"flex", gap:5 }}>
            {[
              { l:"EA",         done:exp.eaConfirmed,   who:"ea" },
              { l:"CM",         done:exp.cmConfirmed,   who:"cm" },
              { l:"Accounts",   done:exp.accConfirmed,  who:"accounts" },
              { l:"Closed",     done:exp.status === "paid", who:"founder" },
            ].map(item => (
              <div key={item.l} style={{ flex:1, padding:"6px 8px", background:item.done ? `${T.green}10` : T.raised, border:`1px solid ${item.done ? `${T.green}30` : T.border}`, borderRadius:5, textAlign:"center" }}>
                <div style={{ fontSize:8.5, fontWeight:600, color:item.done ? T.green : T.label }}>{item.done ? "✓" : ""} {item.l}</div>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", gap:8, marginTop:8 }}>
            {role === "ea" && !exp.eaConfirmed && <Btn variant="amber" style={{ fontSize:10 }} onClick={() => onEAConfirm && onEAConfirm(exp.id)}>Confirm creator received payment</Btn>}
            {role === "cm" && exp.eaConfirmed && !exp.cmConfirmed && <Btn variant="amber" style={{ fontSize:10 }} onClick={() => onCMConfirm && onCMConfirm(exp.id)}>CM review — confirm</Btn>}
          </div>
        </div>
      )}

      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {isFounder(role) && exp.status === "pending_approval" && <Btn variant="success" onClick={() => onApprove && onApprove(exp.id)}>Approve payment</Btn>}
        {isAccounts(role) && exp.status === "approved" && <Btn variant="primary" onClick={() => onMarkPaid && onMarkPaid(exp.id)}>Mark paid + log UTR</Btn>}
      </div>
    </div>
  );
}

// ── PO DETAIL PANEL ───────────────────────────────────────────────────────────
const PO_FLOW = ["pending_approval","approved","work_delivered","matched","closed"];

function PODetail({ po, role, canRaise, onApprove, onDeliver, onMatch, onClose }) {
  if (!po) return <div style={{ textAlign:"center", paddingTop:60, color:T.label, fontSize:11 }}>Select a PO{canRaise ? " or create new" : ""}</div>;
  const stepIdx = PO_FLOW.indexOf(po.status);
  return (
    <div style={{ padding:"20px 24px", overflowY:"auto", height:"100%" }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
        <div>
          <div style={{ fontFamily:"'Newsreader',serif", fontSize:18, fontWeight:600, color:T.text, fontStyle:"italic", marginBottom:3 }}>{po.vendor}</div>
          <div style={{ fontSize:10, color:T.label, fontFamily:"monospace" }}>{po.id} · {po.campaignName} · {po.createdAt}</div>
          <div style={{ fontSize:10.5, color:T.sub, marginTop:3 }}>Raised by {po.raisedByName}</div>
        </div>
        <Pill status={po.status} />
      </div>

      <div style={{ display:"flex", gap:0, marginBottom:16, overflow:"hidden", borderRadius:6 }}>
        {PO_FLOW.map((s, i) => (
          <div key={s} style={{ flex:1, padding:"5px 6px", background:i <= stepIdx ? `${T.accent}20` : T.raised, borderRight:i < PO_FLOW.length-1 ? `1px solid ${T.border}` : "none", textAlign:"center" }}>
            <div style={{ fontSize:8.5, color:i <= stepIdx ? T.accent : T.label, fontWeight:i === stepIdx ? 600 : 400, textTransform:"capitalize" }}>
              {s.replace(/_/g," ")}
            </div>
          </div>
        ))}
      </div>

      <Hr style={{ marginBottom:14 }} />

      <div style={{ marginBottom:12 }}>
        <Lbl style={{ display:"block", marginBottom:6 }}>Scope of work</Lbl>
        <div style={{ fontSize:12, color:T.text, lineHeight:1.6 }}>{po.scope}</div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:14 }}>
        {[
          ["Amount",   showAmt(po.amount, role)],
          ["Schedule", po.paymentScheduleType === "advance_final" ? "Advance + Final" : "Single"],
          ["Delivery", po.deliveryDate || "TBD"],
        ].map(([l, v]) => (
          <div key={l} style={{ padding:"8px 10px", background:T.raised, borderRadius:5 }}>
            <div style={{ fontSize:9, color:T.label, marginBottom:2 }}>{l}</div>
            <div style={{ fontSize:12, fontWeight:500, color:T.text }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:10, color:po.poDocument ? T.green : T.amber }}>
          {po.poDocument ? "✓ PO document uploaded" : "⚑ PO document not uploaded"}
        </div>
        {!po.poDocument && <Btn variant="ghost" style={{ fontSize:10, marginTop:6 }}>↑ Upload PO PDF</Btn>}
      </div>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {can(role,"approvePO") && po.status === "pending_approval" && <Btn variant="success" onClick={() => onApprove && onApprove(po.id)}>Approve PO</Btn>}
        {["ea","cm"].includes(role) && po.status === "approved" && !po.deliveryConfirmed && <Btn variant="teal" onClick={() => onDeliver && onDeliver(po.id)}>Mark work delivered</Btn>}
        {isAccounts(role) && po.status === "work_delivered" && <Btn variant="amber" onClick={() => onMatch && onMatch(po.id)}>Match vendor invoice</Btn>}
        {isAccounts(role) && po.status === "matched" && <Btn variant="ghost" onClick={() => onClose && onClose(po.id)}>Close PO</Btn>}
      </div>
    </div>
  );
}

// ── TAB: DASHBOARD ────────────────────────────────────────────────────────────
function TabDashboard({ role, invoices, expenses, advMap, setAdvMap, setTab, anomalies, pos, campsRef }) {
  const paid    = invoices.filter(i => i.status === "paid" && i.type !== "credit_note").reduce((s, i) => s + i.amount, 0);
  const pending = invoices.filter(i => i.status === "pending" && i.type !== "credit_note").reduce((s, i) => s + i.amount, 0);
  const overdue = invoices.filter(i => i.status === "overdue").reduce((s, i) => s + i.amount, 0);
  const spent   = expenses.filter(e => e.status === "paid" && !e.directorOnly).reduce((s, e) => s + e.amount, 0);
  const pendingApproval = expenses.filter(e => e.status === "pending_approval").length;
  const posPending      = (pos || []).filter(p => p.status === "pending_approval").length;
  const gstCollected    = invoices.filter(i => i.status === "paid" && i.type !== "credit_note").reduce((s, i) => s + i.amount * ((i.gstRate || 18) / 100), 0);
  const tdsDeducted     = expenses.reduce((s, e) => s + ((e.tds && e.tds.deducted) || 0), 0);
  const retainer        = CLIENTS[0];
  const campFees        = invoices.filter(i => i.type === "campaign").reduce((s, i) => s + i.amount, 0);
  const outstanding     = pending + overdue;
  const overservicing   = campFees > retainer.retainerAmount * 2.5;
  const creditRisk      = outstanding > retainer.creditLimit * 0.8;
  const criticalAnoms   = anomalies.filter(a => ["critical","high"].includes(a.severity));
  const advancePending  = campsRef.filter(c => !advMap[c.id]);

  return (
    <div style={{ padding:"20px 24px", overflowY:"auto", height:"100%" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:"'Newsreader',serif", fontSize:20, fontWeight:600, color:T.text, fontStyle:"italic" }}>Financial Dashboard</div>
          <div style={{ fontSize:10, color:T.sub, marginTop:2 }}>FY {FY} · Monthly GST · April–March</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <Btn variant="ghost" style={{ fontSize:10 }} onClick={() => exportTally(invoices, expenses)}>↓ Tally CSV</Btn>
          <Btn variant="ghost" style={{ fontSize:10 }}>↓ GST JSON</Btn>
        </div>
      </div>

      {criticalAnoms.length > 0 && (
        <div style={{ background:`${T.red}08`, border:`1px solid ${T.red}25`, borderRadius:7, padding:"12px 14px", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <Lbl color={T.red}>⚑ {criticalAnoms.length} Anomaly Alert{criticalAnoms.length > 1 ? "s" : ""}</Lbl>
            <Btn variant="ghost" style={{ fontSize:9 }} onClick={() => setTab("spending")}>View in Spending →</Btn>
          </div>
          {criticalAnoms.slice(0, 3).map(a => (
            <div key={a.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderTop:`1px solid ${T.border}` }}>
              <SevDot s={a.severity} />
              <span style={{ fontSize:11, color:T.text, flex:1 }}>{a.msg}</span>
              <Pill status={a.severity} />
            </div>
          ))}
        </div>
      )}

      {isFounder(role) && (overservicing || creditRisk) && (
        <div style={{ background:`${T.amber}08`, border:`1px solid ${T.amber}25`, borderRadius:7, padding:"12px 14px", marginBottom:16, display:"flex", gap:20 }}>
          {overservicing && <div style={{ flex:1 }}><Lbl color={T.amber}>Overservicing Flag</Lbl><div style={{ fontSize:11, color:T.sub, marginTop:3 }}>Campaign fees ({fmtINR(campFees)}) vs retainer ({fmtINR(retainer.retainerAmount)}) — ratio high</div></div>}
          {creditRisk    && <div style={{ flex:1 }}><Lbl color={T.red}>Credit Limit Risk</Lbl><div style={{ fontSize:11, color:T.sub, marginTop:3 }}>Outstanding {fmtINR(outstanding)} approaching limit {fmtINR(retainer.creditLimit)}</div></div>}
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:12 }}>
        <StatCard role={role} label="Revenue Collected MTD" value={fmtFull(paid)}           sub={`${invoices.filter(i => i.status === "paid").length} invoices`} col={T.green}                    permission="seeRevenue" />
        <StatCard role={role} label="Outstanding"           value={fmtFull(outstanding)}    sub={overdue > 0 ? `${fmtINR(overdue)} overdue` : null}             col={overdue > 0 ? T.amber : T.text} permission="seeOutstanding" />
        <StatCard role={role} label="Total Spent MTD"       value={fmtFull(spent)}           sub={`${pendingApproval} pending approval`}                                                              permission="seeTotalSpend" />
        <StatCard role={role} label="Net MTD"               value={fmtFull(paid - spent)}    sub={can(role,"seeMargins") ? fmtPct(((paid-spent)/Math.max(paid,1))*100)+" margin" : null} col={(paid-spent)>0?T.green:T.red} permission="seeNetMTD" />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
        <StatCard role={role} label="GST Collected MTD" value={fmtFull(gstCollected)} col={T.accent}  permission="seeGST" />
        <StatCard role={role} label="TDS Deducted MTD"  value={fmtFull(tdsDeducted)}  col={T.purple}  permission="seeTDS" />
        <div style={{ background:T.raised, border:`1px solid ${pendingApproval > 0 ? T.amber : T.border}`, borderRadius:7, padding:"12px 14px" }}>
          <div style={{ fontSize:8.5, color:T.label, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>Pending Approvals</div>
          <div style={{ fontSize:18, fontWeight:600, color:pendingApproval > 0 ? T.amber : T.text }}>{pendingApproval}</div>
          <div style={{ fontSize:9.5, color:T.label, marginTop:2 }}>{posPending} POs pending</div>
        </div>
        <div style={{ background:T.raised, border:`1px solid ${GST_CALENDAR.filter(g => g.status === "due").length > 0 ? T.red : T.border}`, borderRadius:7, padding:"12px 14px" }}>
          <div style={{ fontSize:8.5, color:T.label, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>Filings Due</div>
          <div style={{ fontSize:18, fontWeight:600, color:GST_CALENDAR.filter(g => g.status === "due").length > 0 ? T.red : T.text }}>{GST_CALENDAR.filter(g => g.status === "due").length}</div>
          <div style={{ fontSize:9.5, color:T.label, marginTop:2 }}>this month</div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:20 }}>
        <div style={{ background:T.raised, border:`1px solid ${T.border}`, borderRadius:7, padding:"14px" }}>
          <Lbl style={{ display:"block", marginBottom:10 }}>Aged Receivables (DSO)</Lbl>
          {overdue === 0 ? (
            <div style={{ fontSize:11, color:T.green, fontStyle:"italic" }}>No overdue invoices ✓</div>
          ) : (
            invoices.filter(i => i.status === "overdue").map(i => (
              <div key={i.id} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${T.border}` }}>
                <span style={{ fontSize:11, color:T.sub }}>{i.id}</span>
                <span style={{ fontSize:11.5, fontWeight:500, color:T.amber }}>{isAccounts(role) ? fmtFull(i.amount) : "₹ ——"}</span>
              </div>
            ))
          )}
          <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${T.border}` }}>
            <div style={{ fontSize:10, color:T.amber, marginBottom:4 }}>⚑ Campaign invoices without Client PO</div>
            {invoices.filter(i => !i.clientPO && i.type === "campaign").map(i => (
              <div key={i.id} style={{ fontSize:10, color:T.sub, padding:"2px 0" }}>{i.id} — {(i.label || "").slice(0, 32)}…</div>
            ))}
          </div>
        </div>
        <div style={{ background:T.raised, border:`1px solid ${T.border}`, borderRadius:7, padding:"14px" }}>
          <Lbl style={{ display:"block", marginBottom:10 }}>GST & TDS Filing Calendar</Lbl>
          {GST_CALENDAR.filter(g => g.status === "due").map(g => (
            <div key={g.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${T.border}` }}>
              <div>
                <div style={{ fontSize:11.5, fontWeight:500, color:T.text }}>{g.type} — {g.period}</div>
                <div style={{ fontSize:9.5, color:T.label }}>Due {g.dueDate}</div>
              </div>
              <Pill status="due" />
            </div>
          ))}
          {GST_CALENDAR.filter(g => g.status === "filed").slice(0, 2).map(g => (
            <div key={g.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${T.border}` }}>
              <div>
                <div style={{ fontSize:11, color:T.sub }}>{g.type} — {g.period}</div>
                <div style={{ fontSize:9.5, color:T.label }}>Filed {g.filedDate}</div>
              </div>
              <Pill status="filed" />
            </div>
          ))}
        </div>
      </div>

      {isFounder(role) && advancePending.length > 0 && (
        <div style={{ background:`${T.amber}08`, border:`1px solid ${T.amber}25`, borderRadius:7, padding:"14px" }}>
          <Lbl color={T.amber} style={{ display:"block", marginBottom:8 }}>Advance Confirmations Pending</Lbl>
          {advancePending.map(c => (
            <div key={c.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:`1px solid ${T.border}` }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11.5, fontWeight:500, color:T.text }}>{c.name}</div>
                <div style={{ fontSize:9.5, color:T.sub }}>{c.client} · Budget: {fmtINR(c.budget)}</div>
              </div>
              <Btn variant="success" style={{ fontSize:10 }} onClick={() => {
                const upd = { ...advMap, [c.id]:{ status:"confirmed", confirmedAt:todayStr(), confirmedBy:"founder" } };
                setAdvMap(upd);
                writeLS("billing_advances", upd);
              }}>
                Confirm advance received
              </Btn>
            </div>
          ))}
        </div>
      )}

      {/* ── LIVE CAMPAIGN BUDGET TRACKER ── */}
      {campsRef.length > 0 && (
        <div style={{ marginTop:20 }}>
          <div style={{ fontFamily:"'Newsreader',serif", fontSize:15, fontWeight:600, color:T.text, fontStyle:"italic", marginBottom:10 }}>Campaign Budget Tracker</div>
          {campsRef.map(c => {
            const campSpend = expenses.filter(e => e.campaign === c.id && e.status === "paid").reduce((s, e) => s + e.amount, 0);
            const campInv   = invoices.filter(i => i.campaign === c.id && i.status === "paid").reduce((s, i) => s + i.amount, 0);
            const pct       = c.budget > 0 ? Math.min(100, (campSpend / c.budget) * 100) : 0;
            const over      = campSpend > c.budget;
            return (
              <div key={c.id} style={{ background:T.raised, border:`1px solid ${T.border}`, borderRadius:7, padding:"12px 14px", marginBottom:8 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                  <div>
                    <span style={{ fontSize:12, fontWeight:500, color:T.text }}>{c.name}</span>
                    <span style={{ fontSize:9.5, color:T.label, marginLeft:8 }}>{c.client}</span>
                    <span style={{ fontSize:8.5, color:T.sub, marginLeft:6, padding:"1px 5px", border:`1px solid ${T.border}`, borderRadius:3, textTransform:"capitalize" }}>{c.stage||"—"}</span>
                  </div>
                  <div style={{ display:"flex", gap:16, alignItems:"center" }}>
                    {[["Budget",fmtINR(c.budget),T.text],["Spent",fmtINR(campSpend),over?T.red:T.text],["Invoiced",fmtINR(campInv),T.green]].map(([l,v,col])=>(
                      <div key={l} style={{ textAlign:"right" }}>
                        <div style={{ fontSize:8.5, color:T.label }}>{l}</div>
                        <div style={{ fontSize:11.5, fontWeight:600, color:col }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ height:4, background:T.mute, borderRadius:2 }}>
                  <div style={{ height:4, borderRadius:2, background:over?T.red:pct>80?T.amber:T.accent, width:`${pct}%`, transition:"width 0.3s" }} />
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:3 }}>
                  <span style={{ fontSize:8.5, color:T.label }}>{pct.toFixed(0)}% of budget used</span>
                  <span style={{ fontSize:8.5, color:over?T.red:T.green }}>{over?`Over by ${fmtINR(campSpend-c.budget)}`:`${fmtINR(c.budget-campSpend)} remaining`}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── TAB: INCOME ───────────────────────────────────────────────────────────────
function TabIncome({ role, invoices, setInvoices, clientPOs, setClientPOs, campsRef }) {
  const [subTab, setSubTab] = useState("invoices");
  const [filter, setFilter] = useState("all");
  const [selId,  setSelId]  = useState(null);

  const filtered = useMemo(() => invoices.filter(i => {
    if (filter === "pending")  return i.status === "pending";
    if (filter === "overdue")  return i.status === "overdue";
    if (filter === "paid")     return i.status === "paid";
    if (filter === "credit")   return i.type === "credit_note";
    if (filter === "no_po")    return !i.clientPO && i.type === "campaign";
    return true;
  }), [invoices, filter]);

  const inv = invoices.find(i => i.id === selId) || null;

  const handleAccConfirm    = useCallback(id => setInvoices(p => p.map(i => i.id !== id ? i : { ...i, confirmedByAccounts:true })), [setInvoices]);
  const handleFounderConfirm= useCallback(id => setInvoices(p => p.map(i => i.id !== id ? i : { ...i, confirmedByFounder:true, status:"paid", paidDate:todayStr() })), [setInvoices]);
  const handleUploadPO      = useCallback(id => {
    const poNum = window.prompt("Enter Client PO number:");
    if (!poNum) return;
    const newPO = { id:`CPO-${Date.now()}`, poNumber:poNum, amount:0, receivedDate:todayStr(), document:"uploaded", status:"received" };
    setInvoices(p => p.map(i => i.id !== id ? i : { ...i, clientPO:newPO }));
    setClientPOs(p => [...p, { ...newPO, client:"FreshBite Foods", campaign:null, invoicedAmount:0, campaignName:"" }]);
  }, [setInvoices, setClientPOs]);

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <div style={{ display:"flex", gap:0, padding:"0 16px", borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        {[["invoices","Invoices & Retainers"],["client_pos","Client POs"]].map(([id, lbl]) => (
          <button key={id} onClick={() => setSubTab(id)} style={{ padding:"9px 0", marginRight:18, background:"transparent", border:"none", borderBottom:`1.5px solid ${subTab === id ? T.accent : "transparent"}`, color:subTab === id ? T.text : T.sub, fontSize:11, cursor:"pointer", fontFamily:"'Sora'", fontWeight:subTab === id ? 500 : 400, marginBottom:-1 }}>
            {lbl}
            {id === "client_pos" && invoices.filter(i => !i.clientPO && i.type === "campaign").length > 0 && (
              <span style={{ marginLeft:5, fontSize:8, background:T.amber, color:"#06060A", padding:"1px 5px", borderRadius:8 }}>
                {invoices.filter(i => !i.clientPO && i.type === "campaign").length} no PO
              </span>
            )}
          </button>
        ))}
      </div>

      {subTab === "client_pos" ? (
        <div style={{ padding:"20px 24px", overflowY:"auto", flex:1 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <div>
              <div style={{ fontFamily:"'Newsreader',serif", fontSize:17, fontWeight:600, color:T.text, fontStyle:"italic" }}>Client Purchase Orders</div>
              <div style={{ fontSize:10, color:T.sub, marginTop:2 }}>POs issued by clients to 5th Avenue</div>
            </div>
            <Btn variant="amber" style={{ fontSize:10 }}>+ Upload PO</Btn>
          </div>
          {invoices.filter(i => !i.clientPO && i.type === "campaign").length > 0 && (
            <div style={{ background:`${T.amber}08`, border:`1px solid ${T.amber}25`, borderRadius:6, padding:"10px 14px", marginBottom:14 }}>
              <Lbl color={T.amber} style={{ display:"block", marginBottom:6 }}>⚑ Best Practice — campaign invoices without a Client PO</Lbl>
              {invoices.filter(i => !i.clientPO && i.type === "campaign").map(i => (
                <div key={i.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"5px 0", borderTop:`1px solid ${T.border}` }}>
                  <span style={{ fontSize:11, color:T.sub }}>{i.id} — {i.label}</span>
                  <Btn variant="amber" style={{ fontSize:9 }} onClick={() => handleUploadPO(i.id)}>Upload PO</Btn>
                </div>
              ))}
            </div>
          )}
          {clientPOs.map(po => (
            <div key={po.id} style={{ background:T.raised, border:`1px solid ${T.border}`, borderRadius:6, padding:"12px 14px", marginBottom:8 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:500, color:T.text }}>{po.poNumber}</div>
                  <div style={{ fontSize:10, color:T.sub }}>{po.client}{po.campaignName ? ` · ${po.campaignName}` : ""}</div>
                </div>
                <Pill status={po.status} />
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                {[
                  ["PO Amount",  isAccounts(role) ? fmtFull(po.amount) : "₹ ——"],
                  ["Invoiced",   isAccounts(role) ? fmtFull(po.invoicedAmount || 0) : "₹ ——"],
                  ["Remaining",  isAccounts(role) ? fmtFull((po.amount || 0) - (po.invoicedAmount || 0)) : "₹ ——"],
                  ["Valid Till", po.validTill || "—"],
                ].map(([l, v]) => (
                  <div key={l} style={{ padding:"6px 8px", background:T.bg, borderRadius:4 }}>
                    <div style={{ fontSize:9, color:T.label, marginBottom:2 }}>{l}</div>
                    <div style={{ fontSize:11.5, fontWeight:500, color:T.text }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:6, fontSize:9.5, color:po.document === "uploaded" ? T.green : T.amber }}>
                {po.document === "uploaded" ? "✓ Document uploaded" : "⚑ Document not uploaded"}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display:"flex", flex:1, minHeight:0 }}>
          <div style={{ width:320, flexShrink:0, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"10px", borderBottom:`1px solid ${T.border}`, display:"flex", gap:4, flexWrap:"wrap" }}>
              {[["all","All"],["pending","Pending"],["overdue","Overdue"],["paid","Paid"],["credit","Credits"],["no_po","No PO ⚑"]].map(([id, lbl]) => (
                <button key={id} onClick={() => setFilter(id)} style={{ padding:"3px 8px", borderRadius:4, fontSize:9, background:filter === id ? `${id === "no_po" ? T.amber : T.accent}18` : "transparent", border:`1px solid ${filter === id ? (id === "no_po" ? T.amber : T.accent) : T.border}`, color:filter === id ? (id === "no_po" ? T.amber : T.accent) : T.sub, cursor:"pointer", fontFamily:"'Sora'" }}>
                  {lbl}
                </button>
              ))}
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:"8px" }}>
              {filtered.map(i => (
                <div key={i.id} onClick={() => setSelId(i.id)} style={{ padding:"10px 12px", borderRadius:6, cursor:"pointer", marginBottom:3, background:selId === i.id ? T.raised : "transparent", border:`1px solid ${selId === i.id ? T.borderMid : "transparent"}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                    <span style={{ fontSize:9.5, color:T.label, fontFamily:"monospace" }}>{i.id}</span>
                    <Pill status={i.type === "credit_note" ? "credit_note" : i.status} />
                  </div>
                  <div style={{ fontSize:11.5, fontWeight:500, color:T.text, marginBottom:3, lineHeight:1.4 }}>{i.label}</div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:10, color:T.sub }}>{i.raisedDate}</span>
                    <span style={{ fontSize:11.5, fontWeight:600, color:T.text }}>{showAmt(Math.abs(i.amount || 0), role)}</span>
                  </div>
                  {!i.clientPO && i.type === "campaign" && <div style={{ fontSize:9, color:T.amber, marginTop:3 }}>⚑ No client PO</div>}
                  {i.confirmedByAccounts && !i.confirmedByFounder && isFounder(role) && <div style={{ fontSize:9, color:T.amber, marginTop:3 }}>Accounts logged — awaiting your confirmation</div>}
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <InvDetail inv={inv} role={role} onAccConfirm={handleAccConfirm} onFounderConfirm={handleFounderConfirm} onUploadPO={handleUploadPO} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── TAB: SPENDING ─────────────────────────────────────────────────────────────
function TabSpending({ role, expenses, setExpenses, anomalies, pos, campsRef }) {
  const [cat,    setCat]    = useState("all");
  const [selId,  setSelId]  = useState(null);
  const [dupWarn,setDupWarn]= useState(null);

  const visible = useMemo(() => expenses.filter(e => {
    if (e.directorOnly && !isFounder(role)) return false;
    if (cat === "all")      return true;
    if (cat === "approval") return e.status === "pending_approval";
    if (cat === "anomaly")  return anomalies.some(a => a.payee === e.payee && a.campaign === e.campaign);
    return e.cat === cat;
  }), [expenses, cat, role, anomalies]);

  const exp = expenses.find(e => e.id === selId) || null;

  const handleApprove = useCallback(id => {
    const e    = expenses.find(x => x.id === id);
    const dups = anomalies.filter(a => a.type === "duplicate" && a.payee === (e && e.payee));
    if (dups.length > 0) { setDupWarn({ id, dups }); return; }
    setExpenses(p => p.map(e => e.id !== id ? e : { ...e, status:"approved", approvedBy:"founder", approvedAt:todayStr() }));
  }, [expenses, anomalies, setExpenses]);

  const handleMarkPaid = useCallback(id => setExpenses(p => p.map(e => e.id !== id ? e : { ...e, status:"paid", date:todayStr(), utr:`UTR${Date.now().toString().slice(-8)}`, accConfirmed:true })), [setExpenses]);
  const handleEAConfirm= useCallback(id => setExpenses(p => p.map(e => e.id !== id ? e : { ...e, eaConfirmed:true })), [setExpenses]);
  const handleCMConfirm= useCallback(id => setExpenses(p => p.map(e => e.id !== id ? e : { ...e, cmConfirmed:true })), [setExpenses]);

  const cats = [["all","All"],["approval","⚑ Approval"],["anomaly","Anomalies"],["internal_regular","Reg"],["internal_variable","Var"],["external_subscription","Subs"],["external_creator","MCN"],["external_vendor","Vendors"]];
  if (isFounder(role)) cats.push(["director","Director"]);

  return (
    <div style={{ display:"flex", height:"100%" }}>
      {dupWarn && (
        <div style={{ position:"fixed", inset:0, zIndex:500, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div onClick={() => setDupWarn(null)} style={{ position:"absolute", inset:0, background:"rgba(4,5,10,0.88)" }} />
          <div style={{ position:"relative", width:420, background:T.surface, border:`1px solid ${T.red}50`, borderRadius:10, padding:24 }}>
            <div style={{ fontFamily:"'Newsreader',serif", fontSize:17, color:T.red, fontStyle:"italic", marginBottom:8 }}>Duplicate Payment Alert</div>
            {dupWarn.dups.map(d => <div key={d.id} style={{ fontSize:11.5, color:T.sub, padding:"6px 0", borderBottom:`1px solid ${T.border}` }}>{d.msg}</div>)}
            <div style={{ display:"flex", gap:8, marginTop:14 }}>
              <Btn variant="danger" onClick={() => { setExpenses(p => p.map(e => e.id !== dupWarn.id ? e : { ...e, status:"approved", approvedBy:"founder" })); setDupWarn(null); }}>Approve anyway</Btn>
              <Btn variant="ghost" onClick={() => setDupWarn(null)}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      <div style={{ width:320, flexShrink:0, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"10px", borderBottom:`1px solid ${T.border}`, display:"flex", gap:4, flexWrap:"wrap" }}>
          {cats.map(([id, lbl]) => (
            <button key={id} onClick={() => setCat(id)} style={{ padding:"3px 8px", borderRadius:4, fontSize:9, background:cat === id ? `${id === "anomaly" ? T.red : T.accent}18` : "transparent", border:`1px solid ${cat === id ? (id === "anomaly" ? T.red : T.accent) : T.border}`, color:cat === id ? (id === "anomaly" ? T.red : T.accent) : T.sub, cursor:"pointer", fontFamily:"'Sora'" }}>
              {lbl}
              {id === "anomaly" && anomalies.length > 0 && <span style={{ marginLeft:3, fontSize:8, background:T.red, color:"#fff", padding:"0 4px", borderRadius:8 }}>{anomalies.length}</span>}
            </button>
          ))}
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"8px" }}>
          {visible.map(e => {
            const col        = CAT_COL[e.cat] || T.label;
            const hasAnomaly = anomalies.some(a => a.payee === e.payee && a.campaign === e.campaign);
            return (
              <div key={e.id} onClick={() => setSelId(e.id)} style={{ padding:"10px 12px", borderRadius:6, cursor:"pointer", marginBottom:3, background:selId === e.id ? T.raised : "transparent", border:`1px solid ${hasAnomaly ? `${T.red}30` : selId === e.id ? T.borderMid : "transparent"}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontSize:9, fontWeight:600, color:col }}>{e.cat === "director" ? "Director" : CAT_LABEL[e.cat] || e.cat}</span>
                  <Pill status={e.status} />
                </div>
                <div style={{ fontSize:11.5, fontWeight:500, color:T.text, marginBottom:2 }}>{e.payee}</div>
                {e.vendorForCreator && <div style={{ fontSize:10, color:T.pink, marginBottom:2 }}>for {e.vendorForCreator.creatorName} ({e.vendorForCreator.creatorHandle})</div>}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:10, color:T.label }}>{e.campaign ? (campsRef.find(c => c.id === e.campaign) || {}).name || e.campaign : "No campaign"}</span>
                  <span style={{ fontSize:11.5, fontWeight:600, color:T.text }}>{showAmt(e.amount || 0, role)}</span>
                </div>
                {hasAnomaly && <div style={{ fontSize:9, color:T.red, marginTop:3 }}>🔴 Anomaly detected</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ flex:1, minWidth:0 }}>
        <ExpDetail exp={exp} role={role} pos={pos} anomalies={anomalies} onApprove={handleApprove} onMarkPaid={handleMarkPaid} onEAConfirm={handleEAConfirm} onCMConfirm={handleCMConfirm} />
      </div>
    </div>
  );
}

// ── TAB: PURCHASE ORDERS ──────────────────────────────────────────────────────
function TabPurchaseOrders({ role, pos, setPos, campsRef }) {
  const [filter, setFilter] = useState("all");
  const [selId,  setSelId]  = useState(null);
  const [showNew,setNew]    = useState(false);
  const [draft,  setDraft]  = useState({ vendor:"", vendorType:"creator_mcn", campaign:"c1", scope:"", amount:"", paymentScheduleType:"single", deliveryDate:"", notes:"" });

  const filtered = useMemo(() => pos.filter(p => {
    if (filter === "pending_approval") return p.status === "pending_approval";
    if (filter === "approved")         return p.status === "approved";
    if (filter === "closed")           return ["closed","matched"].includes(p.status);
    return true;
  }), [pos, filter]);

  const po = pos.find(p => p.id === selId) || null;

  const handleApprove = id => setPos(p => p.map(o => o.id !== id ? o : { ...o, status:"approved", approvedBy:"founder", approvedAt:todayStr() }));
  const handleDeliver = id => setPos(p => p.map(o => o.id !== id ? o : { ...o, status:"work_delivered", deliveryConfirmed:true, deliveryConfirmedBy:role }));
  const handleMatch   = id => setPos(p => p.map(o => o.id !== id ? o : { ...o, status:"matched" }));
  const handleClose   = id => setPos(p => p.map(o => o.id !== id ? o : { ...o, status:"closed" }));

  const submitNew = () => {
    const camp = campsRef.find(c => c.id === draft.campaign) || {};
    const n = { ...draft, id:`PO-${Date.now().toString().slice(-5)}`, raisedBy:role, raisedByName:ROLES.find(r => r.id === role).label, campaignName:camp.name || "", status:"pending_approval", poDocument:null, approvedBy:null, approvedAt:null, deliveryConfirmed:false, deliveryConfirmedBy:null, createdAt:todayStr(), amount:parseFloat(draft.amount) || 0 };
    setPos(p => [n, ...p]);
    setSelId(n.id);
    setNew(false);
    setDraft({ vendor:"", vendorType:"creator_mcn", campaign:"c1", scope:"", amount:"", paymentScheduleType:"single", deliveryDate:"", notes:"" });
  };

  const ud = (k, v) => setDraft(prev => ({ ...prev, [k]:v }));

  return (
    <div style={{ display:"flex", height:"100%" }}>
      <div style={{ width:300, flexShrink:0, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"10px 12px", borderBottom:`1px solid ${T.border}`, display:"flex", gap:8, alignItems:"center" }}>
          <span style={{ flex:1, fontSize:11, color:T.text, fontWeight:500 }}>Purchase Orders</span>
          {canRaisePO(role) && <Btn variant="primary" style={{ fontSize:10 }} onClick={() => { setNew(true); setSelId(null); }}>+ New PO</Btn>}
        </div>
        <div style={{ padding:"8px 10px", borderBottom:`1px solid ${T.border}`, display:"flex", gap:4 }}>
          {[["all","All"],["pending_approval","⚑ Pending"],["approved","Active"],["closed","Closed"]].map(([id, lbl]) => (
            <button key={id} onClick={() => setFilter(id)} style={{ padding:"3px 8px", borderRadius:4, fontSize:9, background:filter === id ? `${T.accent}18` : "transparent", border:`1px solid ${filter === id ? T.accent : T.border}`, color:filter === id ? T.accent : T.sub, cursor:"pointer", fontFamily:"'Sora'" }}>{lbl}</button>
          ))}
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"8px" }}>
          {filtered.map(p => (
            <div key={p.id} onClick={() => { setSelId(p.id); setNew(false); }} style={{ padding:"10px 12px", borderRadius:6, cursor:"pointer", marginBottom:3, background:selId === p.id ? T.raised : "transparent", border:`1px solid ${selId === p.id ? T.borderMid : p.status === "pending_approval" ? `${T.amber}30` : "transparent"}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                <span style={{ fontSize:9, color:T.label, fontFamily:"monospace" }}>{p.id}</span>
                <Pill status={p.status} />
              </div>
              <div style={{ fontSize:11.5, fontWeight:500, color:T.text, marginBottom:2 }}>{p.vendor}</div>
              <div style={{ fontSize:10, color:T.sub, marginBottom:2 }}>{p.campaignName}</div>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:9.5, color:T.label }}>{p.raisedByName}</span>
                <span style={{ fontSize:11, fontWeight:600, color:T.text }}>{showAmt(p.amount, role)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex:1, minWidth:0 }}>
        {showNew ? (
          <div style={{ padding:"20px 24px", overflowY:"auto", height:"100%" }}>
            <div style={{ fontFamily:"'Newsreader',serif", fontSize:18, fontWeight:600, color:T.text, fontStyle:"italic", marginBottom:16 }}>New Purchase Order</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
              <div><Lbl style={{ display:"block", marginBottom:4 }}>Vendor / MCN name *</Lbl><input value={draft.vendor} onChange={e => ud("vendor", e.target.value)} placeholder="e.g. StarTalent MCN" style={{ ...INP }} /></div>
              <div><Lbl style={{ display:"block", marginBottom:4 }}>Type</Lbl><select value={draft.vendorType} onChange={e => ud("vendorType", e.target.value)} style={{ ...INP }}><option value="creator_mcn">Creator MCN</option><option value="vendor">Production Vendor</option></select></div>
              <div><Lbl style={{ display:"block", marginBottom:4 }}>Campaign</Lbl><select value={draft.campaign} onChange={e => ud("campaign", e.target.value)} style={{ ...INP }}>{campsRef.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div><Lbl style={{ display:"block", marginBottom:4 }}>Expected delivery</Lbl><input value={draft.deliveryDate} onChange={e => ud("deliveryDate", e.target.value)} placeholder="May 30, 2026" style={{ ...INP }} /></div>
            </div>
            <div style={{ marginBottom:12 }}><Lbl style={{ display:"block", marginBottom:4 }}>Scope of work *</Lbl><textarea value={draft.scope} onChange={e => ud("scope", e.target.value)} rows={3} placeholder="Describe deliverables…" style={{ ...INP, resize:"vertical" }} /></div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
              <div>
                <Lbl style={{ display:"block", marginBottom:4 }}>Amount (₹) *</Lbl>
                <input type="number" value={draft.amount} onChange={e => ud("amount", e.target.value)} placeholder="e.g. 85000" style={{ ...INP }} />
                {parseFloat(draft.amount || 0) > 0 && parseFloat(draft.amount || 0) < (draft.vendorType === "creator_mcn" ? 10000 : 25000) && (
                  <div style={{ fontSize:9, color:T.amber, marginTop:3 }}>Below threshold — PO optional</div>
                )}
              </div>
              <div><Lbl style={{ display:"block", marginBottom:4 }}>Payment</Lbl><select value={draft.paymentScheduleType} onChange={e => ud("paymentScheduleType", e.target.value)} style={{ ...INP }}><option value="single">Single payment</option><option value="advance_final">Advance + Final</option></select></div>
            </div>
            <div style={{ marginBottom:14 }}><Lbl style={{ display:"block", marginBottom:4 }}>Notes</Lbl><input value={draft.notes} onChange={e => ud("notes", e.target.value)} placeholder="Additional instructions…" style={{ ...INP }} /></div>
            <div style={{ display:"flex", gap:8 }}>
              <Btn variant="primary" onClick={submitNew} disabled={!draft.vendor || !draft.scope || !draft.amount}>Submit for approval</Btn>
              <Btn variant="ghost" onClick={() => setNew(false)}>Cancel</Btn>
            </div>
          </div>
        ) : (
          <PODetail po={po} role={role} canRaise={canRaisePO(role)} onApprove={handleApprove} onDeliver={handleDeliver} onMatch={handleMatch} onClose={handleClose} />
        )}
      </div>
    </div>
  );
}

// ── TAB: QUOTATIONS ───────────────────────────────────────────────────────────
function QuoteMarginPreview({ lines, marginPct, agencyFeePct, agencyFeeType, isRetainerClient }) {
  const sub = lines.reduce((s, l) => s + (l.qty || 1) * (l.rate || 0), 0);
  if (!sub) return null;
  const m = calcMargin(sub, marginPct, agencyFeePct, agencyFeeType, isRetainerClient);
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginTop:10 }}>
      {[["Ops budget (team)", fmtINR(m.opsBudget), T.teal], ["Margin kept", fmtINR(m.margin), T.accent], ["Gross %", fmtPct(m.grossPct), m.grossPct >= 30 ? T.green : T.red]].map(([l, v, c]) => (
        <div key={l} style={{ padding:"6px 8px", background:T.bg, borderRadius:4 }}>
          <div style={{ fontSize:8.5, color:T.label, marginBottom:2 }}>{l}</div>
          <div style={{ fontSize:13, fontWeight:600, color:c }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

function QuoteTotalsPreview({ lines, agencyFeePct, agencyFeeType }) {
  const t = calcQuoteTotals(lines, agencyFeePct, agencyFeeType);
  if (!t.grand) return null;
  return (
    <div style={{ background:T.raised, borderRadius:6, padding:"10px 12px", marginBottom:12 }}>
      {[["Subtotal", t.sub], ["GST", t.gst], ["Agency fee", t.fee], ["Grand Total", t.grand]].filter(([, v]) => v > 0).map(([l, v], i, arr) => (
        <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:i < arr.length-1 ? `1px solid ${T.border}` : "none" }}>
          <span style={{ fontSize:11, color:i === arr.length-1 ? T.text : T.sub }}>{l}</span>
          <span style={{ fontSize:12, fontWeight:i === arr.length-1 ? 700 : 400, color:i === arr.length-1 ? T.accent : T.text }}>{fmtFull(v)}</span>
        </div>
      ))}
    </div>
  );
}

function TabQuotations({ role, quotes, setQuotes, campsRef }) {
  const [selId,    setSelId]    = useState(null);
  const [showBuild,setShowBuild]= useState(false);
  const emptyLine = () => ({ desc:"", sac:"998361", qty:1, rate:0, gstRate:18 });
  const [draft, setDraft] = useState({ client:"FreshBite Foods", label:"", marginPct:35, agencyFeePct:0, agencyFeeType:"over_above", isRetainerClient:true, lines:[emptyLine()], notes:"Retainer client — agency fee waived. 50% advance on acceptance." });

  const q = quotes.find(x => x.id === selId) || null;
  const tot = q ? calcQuoteTotals(q.lines, q.agencyFeePct, q.agencyFeeType) : { sub:0, gst:0, fee:0, feeGst:0, grand:0 };
  const m   = q ? calcMargin(q.lines.reduce((s, l) => s + (l.qty||1)*(l.rate||0), 0), q.marginPct, q.agencyFeePct, q.agencyFeeType, q.isRetainerClient) : { margin:0, opsBudget:0, agencyFee:0, grossPct:0 };
  const autoQuotes = quotes.filter(x => x.isAutoGenerated && x.status === "pending_review");

  const simulateBriefLock = () => {
    const camp = campsRef[1] || campsRef[0];
    if (!camp) return;
    const newQ = { id:`QT-AUTO-${Date.now().toString().slice(-5)}`, client:camp.client, label:`${camp.name} — Auto-Generated Quote`, status:"pending_review", isAutoGenerated:true, campaignId:camp.id, createdDate:todayStr(), validTill:"", isRetainerClient:true, marginPct:35, agencyFeePct:0, agencyFeeType:"baked_in", lines:[{ desc:`Influencer Marketing — ${camp.name}`, sac:"998361", qty:1, rate:camp.budget, gstRate:18 }], notes:"Auto-generated on brief lock. Review and edit before sending." };
    setQuotes(p => [newQ, ...p]);
    setSelId(newQ.id);
  };

  const saveQuote = () => {
    const newQ = { ...draft, id:`QT-${Date.now().toString().slice(-5)}`, status:"draft", createdDate:todayStr(), isAutoGenerated:false, campaignId:null };
    setQuotes(p => [newQ, ...p]);
    setSelId(newQ.id);
    setShowBuild(false);
  };

  const updateLine = (i, k, v) => setDraft(d => ({ ...d, lines:d.lines.map((l, idx) => idx === i ? { ...l, [k]:v } : l) }));
  const addLine    = () => setDraft(d => ({ ...d, lines:[...d.lines, emptyLine()] }));
  const removeLine = i  => setDraft(d => ({ ...d, lines:d.lines.filter((_, idx) => idx !== i) }));

  return (
    <div style={{ display:"flex", height:"100%" }}>
      <div style={{ width:300, flexShrink:0, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"10px 12px", borderBottom:`1px solid ${T.border}`, display:"flex", gap:6, alignItems:"center" }}>
          <span style={{ flex:1, fontSize:11, color:T.text, fontWeight:500 }}>Quotations</span>
          {can(role,"createInvoice") && <Btn variant="ghost" style={{ fontSize:9 }} onClick={simulateBriefLock}>Simulate brief lock</Btn>}
          {can(role,"createInvoice") && <Btn variant="primary" style={{ fontSize:10 }} onClick={() => { setShowBuild(true); setSelId(null); }}>+ New</Btn>}
        </div>
        {autoQuotes.length > 0 && (
          <div style={{ padding:"8px 10px", background:`${T.amber}08`, borderBottom:`1px solid ${T.border}` }}>
            <Lbl color={T.amber} style={{ display:"block", marginBottom:4 }}>Auto-generated from brief lock</Lbl>
            {autoQuotes.map(aq => (
              <div key={aq.id} onClick={() => { setSelId(aq.id); setShowBuild(false); }} style={{ fontSize:11, color:T.amber, cursor:"pointer", padding:"3px 0", textDecoration:"underline" }}>{aq.label}</div>
            ))}
          </div>
        )}
        <div style={{ flex:1, overflowY:"auto", padding:"8px" }}>
          {quotes.map(x => {
            const t = calcQuoteTotals(x.lines, x.agencyFeePct, x.agencyFeeType);
            return (
              <div key={x.id} onClick={() => { setSelId(x.id); setShowBuild(false); }} style={{ padding:"10px 12px", borderRadius:6, cursor:"pointer", marginBottom:3, background:selId === x.id ? T.raised : "transparent", border:`1px solid ${x.status === "pending_review" ? `${T.amber}30` : selId === x.id ? T.borderMid : "transparent"}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontSize:9, color:T.label, fontFamily:"monospace" }}>{x.id}</span>
                  <Pill status={x.status === "pending_review" ? "pending_review" : x.status} />
                </div>
                <div style={{ fontSize:11.5, fontWeight:500, color:T.text, marginBottom:2, lineHeight:1.3 }}>{x.label}</div>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontSize:10, color:T.sub }}>{x.createdDate}</span>
                  <span style={{ fontSize:11, fontWeight:600, color:T.text }}>{showAmt(t.grand, role)}</span>
                </div>
                {x.isAutoGenerated && <div style={{ fontSize:9, color:T.teal, marginTop:3 }}>⚡ Auto-generated from brief</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>
        {showBuild ? (
          <div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ fontFamily:"'Newsreader',serif", fontSize:18, fontWeight:600, color:T.text, fontStyle:"italic" }}>New Quotation</div>
              <Btn variant="ghost" onClick={() => setShowBuild(false)}>Cancel</Btn>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
              <div><Lbl style={{ display:"block", marginBottom:4 }}>Quote label *</Lbl><input value={draft.label} onChange={e => setDraft(d => ({ ...d, label:e.target.value }))} placeholder="e.g. FreshBite Monsoon Campaign" style={{ ...INP }} /></div>
              <div><Lbl style={{ display:"block", marginBottom:4 }}>Client</Lbl><input value={draft.client} onChange={e => setDraft(d => ({ ...d, client:e.target.value }))} style={{ ...INP }} /></div>
            </div>
            <div style={{ background:T.raised, border:`1px solid ${T.amber}22`, borderRadius:7, padding:"12px", marginBottom:12 }}>
              <Lbl color={T.amber} style={{ display:"block", marginBottom:8 }}>Margin & Fee (Founder — not on client PDF)</Lbl>
              <label style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:T.sub, cursor:"pointer", marginBottom:8 }}>
                <input type="checkbox" checked={draft.isRetainerClient} onChange={e => setDraft(d => ({ ...d, isRetainerClient:e.target.checked, agencyFeePct:e.target.checked ? 0 : 15 }))} style={{ accentColor:T.accent }} />
                Retainer client (agency fee waived)
              </label>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                <div><Lbl style={{ display:"block", marginBottom:3 }}>Margin %</Lbl><input type="number" value={draft.marginPct} onChange={e => setDraft(d => ({ ...d, marginPct:parseFloat(e.target.value)||0 }))} style={{ ...INP }} /></div>
                <div><Lbl style={{ display:"block", marginBottom:3 }}>Agency fee %</Lbl><input type="number" value={draft.agencyFeePct} disabled={draft.isRetainerClient} onChange={e => setDraft(d => ({ ...d, agencyFeePct:parseFloat(e.target.value)||0 }))} style={{ ...INP, opacity:draft.isRetainerClient?0.4:1 }} /></div>
                <div><Lbl style={{ display:"block", marginBottom:3 }}>Fee type</Lbl><select value={draft.agencyFeeType} disabled={draft.isRetainerClient} onChange={e => setDraft(d => ({ ...d, agencyFeeType:e.target.value }))} style={{ ...INP, opacity:draft.isRetainerClient?0.4:1 }}><option value="over_above">Over &amp; above</option><option value="baked_in">Baked in</option></select></div>
              </div>
              <QuoteMarginPreview lines={draft.lines} marginPct={draft.marginPct} agencyFeePct={draft.agencyFeePct} agencyFeeType={draft.agencyFeeType} isRetainerClient={draft.isRetainerClient} />
            </div>
            <Lbl style={{ display:"block", marginBottom:6 }}>Line Items</Lbl>
            {draft.lines.map((ln, i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 70px 90px 75px 28px", gap:6, marginBottom:6, alignItems:"center" }}>
                <input value={ln.desc} onChange={e => updateLine(i, "desc", e.target.value)} placeholder="Service description…" style={{ ...INP, fontSize:11 }} />
                <input value={ln.sac} onChange={e => updateLine(i, "sac", e.target.value)} placeholder="SAC" style={{ ...INP, fontSize:11 }} />
                <input type="number" value={ln.rate} onChange={e => updateLine(i, "rate", parseFloat(e.target.value)||0)} placeholder="Rate" style={{ ...INP, fontSize:11 }} />
                <select value={ln.gstRate} onChange={e => updateLine(i, "gstRate", parseInt(e.target.value))} style={{ ...INP, fontSize:11 }}>
                  {[0,5,12,18,28].map(r => <option key={r} value={r}>{r}% GST</option>)}
                </select>
                <button onClick={() => removeLine(i)} style={{ background:"transparent", border:"none", color:T.red, cursor:"pointer", fontSize:14 }}>✕</button>
              </div>
            ))}
            <Btn variant="ghost" onClick={addLine} style={{ fontSize:10, marginBottom:12 }}>+ Add line</Btn>
            <QuoteTotalsPreview lines={draft.lines} agencyFeePct={draft.agencyFeePct} agencyFeeType={draft.agencyFeeType} />
            <div style={{ marginBottom:12 }}><Lbl style={{ display:"block", marginBottom:4 }}>Notes / Terms</Lbl><textarea value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes:e.target.value }))} rows={3} style={{ ...INP, resize:"vertical" }} /></div>
            <div style={{ display:"flex", gap:8 }}>
              <Btn variant="primary" onClick={saveQuote} disabled={!draft.label}>Save quote</Btn>
              <Btn variant="ghost" onClick={() => setShowBuild(false)}>Cancel</Btn>
            </div>
          </div>
        ) : !q ? (
          <div style={{ textAlign:"center", paddingTop:60, color:T.label, fontSize:11 }}>Select a quote{isFounder(role) ? " or create new" : ""}</div>
        ) : (
          <div>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
              <div>
                <div style={{ fontFamily:"'Newsreader',serif", fontSize:18, fontWeight:600, color:T.text, fontStyle:"italic", marginBottom:3 }}>{q.label}</div>
                <div style={{ fontSize:10, color:T.label, fontFamily:"monospace" }}>{q.id} · {q.client} · {q.createdDate}</div>
                {q.isRetainerClient && <div style={{ fontSize:9, color:T.teal, marginTop:3, fontWeight:500 }}>Retainer client — agency fee waived</div>}
                {q.isAutoGenerated  && <div style={{ fontSize:9, color:T.amber, marginTop:2 }}>⚡ Auto-generated — review before sending</div>}
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <Pill status={q.status === "pending_review" ? "pending_review" : q.status} />
                <Btn variant="ghost" style={{ fontSize:10 }} onClick={() => alert("Branded PDF — 5th Avenue letterhead, GSTIN, bank details. Margin excluded.")}>↓ Client PDF</Btn>
              </div>
            </div>
            <div style={{ background:T.raised, borderRadius:7, overflow:"hidden", marginBottom:14 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 60px 80px 60px 80px", padding:"7px 10px", borderBottom:`1px solid ${T.border}` }}>
                {["Description","SAC","Rate","GST","Total"].map(h => <Lbl key={h}>{h}</Lbl>)}
              </div>
              {q.lines.map((ln, i) => (
                <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 60px 80px 60px 80px", padding:"8px 10px", borderBottom:`1px solid ${T.border}` }}>
                  <span style={{ fontSize:11, color:T.text }}>{ln.desc}</span>
                  <span style={{ fontSize:11, color:T.label }}>{ln.sac}</span>
                  <span style={{ fontSize:11, color:T.text }}>{showAmt((ln.qty||1)*(ln.rate||0), role)}</span>
                  <span style={{ fontSize:11, color:T.sub }}>{ln.gstRate}%</span>
                  <span style={{ fontSize:11, color:T.text }}>{showAmt((ln.qty||1)*(ln.rate||0)*(1+(ln.gstRate||18)/100), role)}</span>
                </div>
              ))}
              {[["Subtotal",tot.sub],["GST",tot.gst],...(tot.fee>0?[["Agency fee",tot.fee]]:[]),["Grand Total",tot.grand]].map(([l, v], i, arr) => (
                <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"7px 12px", background:i===arr.length-1?`${T.accent}08`:"transparent", borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none" }}>
                  <span style={{ fontSize:11, color:i===arr.length-1?T.text:T.sub }}>{l}</span>
                  <span style={{ fontSize:12, fontWeight:i===arr.length-1?700:400, color:i===arr.length-1?T.accent:T.text }}>{showAmt(v, role)}</span>
                </div>
              ))}
            </div>
            {isFounder(role) && (
              <div style={{ background:`${T.amber}08`, border:`1px solid ${T.amber}20`, borderRadius:6, padding:"12px", marginBottom:14 }}>
                <Lbl color={T.amber} style={{ display:"block", marginBottom:8 }}>Internal — not on client PDF</Lbl>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                  {[["Ops budget", fmtINR(m.opsBudget), T.teal],["Margin kept", fmtINR(m.margin), T.accent],["Gross %", fmtPct(m.grossPct), m.grossPct>=30?T.green:T.red]].map(([l, v, c]) => (
                    <div key={l} style={{ padding:"6px 8px", background:T.raised, borderRadius:4 }}>
                      <div style={{ fontSize:8.5, color:T.label, marginBottom:2 }}>{l}</div>
                      <div style={{ fontSize:13, fontWeight:600, color:c }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {q.notes && <div style={{ fontSize:11, color:T.sub, lineHeight:1.6, marginBottom:14 }}>{q.notes}</div>}
            <div style={{ display:"flex", gap:8 }}>
              {can(role,"sendQuote") && ["draft","pending_review"].includes(q.status) && <Btn variant="primary" onClick={() => setQuotes(p => p.map(x => x.id !== q.id ? x : { ...x, status:"sent" }))}>Send to client</Btn>}
              {can(role,"sendQuote") && q.status === "sent" && <Btn variant="success" onClick={() => setQuotes(p => p.map(x => x.id !== q.id ? x : { ...x, status:"accepted" }))}>Mark accepted → invoice</Btn>}
              {can(role,"sendQuote") && q.status === "sent" && <Btn variant="danger" onClick={() => setQuotes(p => p.map(x => x.id !== q.id ? x : { ...x, status:"rejected" }))}>Mark rejected</Btn>}
              {q.status === "accepted" && <div style={{ fontSize:10, color:T.green }}>✓ Accepted — raise invoice in Income tab</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── TAB: REGISTRY ─────────────────────────────────────────────────────────────
function TabRegistry({ role }) {
  const [type, setType] = useState("all");
  const [selId,setSelId]= useState(null);
  const [registry,setRegistry]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let cancelled=false;
    RegistryAPI.list()
      .then(data=>{ if(!cancelled){ setRegistry(data); setLoading(false); } })
      .catch(()=>{ if(!cancelled){ setLoading(false); } });
    return ()=>{ cancelled=true; };
  },[]);
  const filtered = registry.filter(r => type === "all" || r.type === type);
  const r = registry.find(x => x.id === selId) || null;

  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:T.sub,fontSize:11.5}}>Loading registry…</div>;

  return (
    <div style={{ display:"flex", height:"100%" }}>
      <div style={{ width:280, flexShrink:0, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"10px 12px", borderBottom:`1px solid ${T.border}`, display:"flex", gap:6 }}>
          {[["all","All"],["creator","Creators"],["vendor","Vendors"]].map(([id, lbl]) => (
            <button key={id} onClick={() => setType(id)} style={{ padding:"3px 10px", borderRadius:4, fontSize:9.5, background:type===id?`${T.accent}18`:"transparent", border:`1px solid ${type===id?T.accent:T.border}`, color:type===id?T.accent:T.sub, cursor:"pointer", fontFamily:"'Sora'" }}>{lbl}</button>
          ))}
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"8px" }}>
          {filtered.map(x => (
            <div key={x.id} onClick={() => setSelId(x.id)} style={{ padding:"10px 12px", borderRadius:6, cursor:"pointer", marginBottom:3, background:selId===x.id?T.raised:"transparent", border:`1px solid ${selId===x.id?T.borderMid:"transparent"}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <Av init={(x.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2)} size={22} color={x.type==="creator"?`${T.pink}22`:`${T.amber}22`} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11.5, fontWeight:500, color:T.text }}>{x.name}</div>
                  <div style={{ fontSize:9.5, color:T.sub }}>{x.mcnVendor ? `via ${x.mcnVendor}` : x.type}</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:4 }}>
                {x.panCollected ? <span style={{ fontSize:8, color:T.green, border:`1px solid ${T.green}25`, borderRadius:3, padding:"1px 4px" }}>PAN ✓</span> : <span style={{ fontSize:8, color:T.red, border:`1px solid ${T.red}25`, borderRadius:3, padding:"1px 4px" }}>PAN ✗</span>}
                {x.tdsSection   && <span style={{ fontSize:8, color:T.amber, border:`1px solid ${T.amber}25`, borderRadius:3, padding:"1px 4px" }}>{x.tdsSection}</span>}
                {x.followers    && <span style={{ fontSize:8, color:T.sub, border:`1px solid ${T.border}`, borderRadius:3, padding:"1px 4px" }}>{((x.followers||0)/1000).toFixed(0)}K</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>
        {!r ? (
          <div style={{ textAlign:"center", paddingTop:60, color:T.label, fontSize:11 }}>Select a vendor or creator</div>
        ) : (
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
              <Av init={(r.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2)} size={44} color={r.type==="creator"?`${T.pink}22`:`${T.amber}22`} />
              <div>
                <div style={{ fontFamily:"'Newsreader',serif", fontSize:20, fontWeight:600, color:T.text, fontStyle:"italic" }}>{r.name}</div>
                {r.mcnVendor && <div style={{ fontSize:11, color:T.teal, marginTop:2 }}>MCN: {r.mcnVendor}</div>}
                <div style={{ fontSize:10, color:T.sub, marginTop:2 }}>{r.handle || ""}{r.platform ? ` · ${r.platform}` : ""}{r.followers ? ` · ${((r.followers||0)/1000).toFixed(0)}K followers` : ""}</div>
              </div>
            </div>
            <Hr style={{ marginBottom:14 }} />
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <div>
                <Lbl style={{ display:"block", marginBottom:8 }}>Payment & Compliance</Lbl>
                {[["PAN", isAccounts(role) ? r.pan || "Not collected" : "*****", !r.panCollected ? T.red : T.text], ["Bank / MCN route", isAccounts(role) ? r.bank || "—" : "——", T.text], ["GSTIN", isAccounts(role) ? r.gstin || "N/A" : "——", T.text], ["TDS Section", r.tdsSection || "N/A", T.text], ["TDS Rate", r.tdsRate > 0 ? `${r.tdsRate}%` : "Exempt", T.text]].map(([l, v, c]) => (
                  <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${T.border}` }}>
                    <span style={{ fontSize:11, color:T.sub }}>{l}</span>
                    <span style={{ fontSize:11, color:c }}>{v}</span>
                  </div>
                ))}
                {!r.panCollected && <div style={{ marginTop:6, fontSize:9.5, color:T.red }}>⚑ PAN not collected — collect before next payment</div>}
              </div>
              <div>
                <Lbl style={{ display:"block", marginBottom:8 }}>Payment History</Lbl>
                {[["Total paid", showAmt(r.totalPaid, role)], ["TDS deducted", showAmt(r.tdsDeducted, role)], ["Net paid", showAmt((r.totalPaid||0)-(r.tdsDeducted||0), role)], ["Campaigns", r.campaigns.length]].map(([l, v]) => (
                  <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${T.border}` }}>
                    <span style={{ fontSize:11, color:T.sub }}>{l}</span>
                    <span style={{ fontSize:11, color:T.text }}>{v}</span>
                  </div>
                ))}
                {isFounder(role) && r.tdsSection && <Btn variant="ghost" style={{ marginTop:8, fontSize:10 }}>↓ Form 16A</Btn>}
              </div>
            </div>
            {r.type === "creator" && r.followers && isFounder(role) && (
              <div style={{ marginTop:14, background:T.raised, borderRadius:6, padding:"10px 12px" }}>
                <Lbl style={{ display:"block", marginBottom:6 }}>CPF Benchmark</Lbl>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                  {[["Followers", `${((r.followers||0)/1000).toFixed(0)}K`], ["Paid per 100K followers", `₹${((r.totalPaid||0)/(r.followers||1)*100000).toFixed(0)}`], ["Platform", r.platform || "—"]].map(([l, v]) => (
                    <div key={l} style={{ padding:"6px 8px", background:T.bg, borderRadius:4 }}>
                      <div style={{ fontSize:8.5, color:T.label, marginBottom:2 }}>{l}</div>
                      <div style={{ fontSize:12, fontWeight:500, color:T.text }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── TAB: GST & COMPLIANCE ─────────────────────────────────────────────────────
function TabGST({ role, invoices, expenses }) {
  const [registry,setRegistry]=useState([]);
  useEffect(()=>{
    RegistryAPI.list().then(setRegistry).catch(()=>{});
  },[]);
  const paidInv      = invoices.filter(i => i.status === "paid" && i.type !== "credit_note");
  const gstOut       = paidInv.reduce((s, i) => s + (i.amount || 0) * ((i.gstRate || 18) / 100), 0);
  const itc          = expenses.filter(e => e.gst && e.gst.applicable && e.status === "paid").reduce((s, e) => s + (e.gst.amount || 0), 0);
  const tds          = expenses.reduce((s, e) => s + ((e.tds && e.tds.deducted) || 0), 0);
  const dirTds       = expenses.filter(e => e.directorOnly && e.tds && e.tds.applicable).reduce((s, e) => s + (e.tds.deducted || 0), 0);
  const netGST       = gstOut - itc;

  return (
    <div style={{ padding:"20px 24px", overflowY:"auto", height:"100%" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:"'Newsreader',serif", fontSize:20, fontWeight:600, color:T.text, fontStyle:"italic" }}>GST & Compliance</div>
          <div style={{ fontSize:10, color:T.sub, marginTop:2 }}>Monthly filing · FY {FY} · April–March</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {isAccounts(role) && <Btn variant="ghost" style={{ fontSize:10 }} onClick={() => exportTally(invoices, expenses)}>↓ Tally CSV</Btn>}
          {isAccounts(role) && <Btn variant="ghost" style={{ fontSize:10 }}>↓ GSTR-1 JSON</Btn>}
          {isAccounts(role) && <Btn variant="ghost" style={{ fontSize:10 }}>↓ GSTR-3B Summary</Btn>}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
        {[["GST Collected", gstOut, T.green], ["ITC Eligible", itc, T.accent], ["Net GST Payable", netGST, netGST > 0 ? T.amber : T.green], ["TDS Deducted", tds, T.purple]].map(([l, v, c]) => (
          <div key={l} style={{ background:T.raised, border:`1px solid ${T.border}`, borderRadius:7, padding:"12px 14px" }}>
            <div style={{ fontSize:8.5, color:T.label, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>{l}</div>
            <div style={{ fontSize:18, fontWeight:600, color:c }}>{fmtINR(v)}</div>
          </div>
        ))}
      </div>

      {isFounder(role) && dirTds > 0 && (
        <div style={{ background:`${T.gold}08`, border:`1px solid ${T.gold}25`, borderRadius:7, padding:"12px 14px", marginBottom:16 }}>
          <Lbl color={T.gold} style={{ display:"block", marginBottom:4 }}>Director TDS — Founder only</Lbl>
          <div style={{ fontSize:12, color:T.text }}>TDS on director remuneration: {fmtFull(dirTds)} · Sec 192 (salary) + 194J (consultancy)</div>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:16 }}>
        <div style={{ background:T.raised, border:`1px solid ${T.border}`, borderRadius:7, padding:"14px" }}>
          <Lbl style={{ display:"block", marginBottom:10 }}>GSTR-1 — Outward Supplies</Lbl>
          {paidInv.slice(0, 4).map(inv => (
            <div key={inv.id} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${T.border}` }}>
              <div>
                <div style={{ fontSize:10.5, color:T.text }}>{inv.id}</div>
                <div style={{ fontSize:9, color:T.label }}>{inv.gstin} · SAC {inv.sac}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:10.5, color:T.text }}>{isAccounts(role) ? fmtFull(inv.amount || 0) : "₹ ——"}</div>
                <div style={{ fontSize:9, color:T.sub }}>GST: {isAccounts(role) ? fmtFull((inv.amount||0)*((inv.gstRate||18)/100)) : "₹ ——"}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ background:T.raised, border:`1px solid ${T.border}`, borderRadius:7, padding:"14px" }}>
          <Lbl style={{ display:"block", marginBottom:10 }}>TDS Register — 194C/J/M</Lbl>
          {registry.filter(r => r.tdsSection && r.tdsDeducted > 0).map(r => (
            <div key={r.id} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${T.border}` }}>
              <div>
                <div style={{ fontSize:10.5, color:T.text }}>{r.name}</div>
                <div style={{ fontSize:9, color:T.label }}>{r.tdsSection} · PAN: {isAccounts(role) ? r.pan || "⚑ Missing" : "*****"}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:10.5, color:T.amber }}>{fmtFull(r.tdsDeducted)}</div>
                <div style={{ fontSize:9, color:T.sub }}>{r.tdsRate}%</div>
              </div>
            </div>
          ))}
          <div style={{ fontSize:9.5, color:T.sub, marginTop:8 }}>Deposit by 7th of following month</div>
        </div>
      </div>

      <Lbl style={{ display:"block", marginBottom:10 }}>Filing Calendar</Lbl>
      <div style={{ background:T.raised, border:`1px solid ${T.border}`, borderRadius:7, overflow:"hidden" }}>
        <div style={{ display:"grid", gridTemplateColumns:"130px 1fr 130px 110px", padding:"7px 12px", borderBottom:`1px solid ${T.border}` }}>
          {["Type","Period","Due Date","Status"].map(h => <Lbl key={h}>{h}</Lbl>)}
        </div>
        {GST_CALENDAR.map(g => (
          <div key={g.id} style={{ display:"grid", gridTemplateColumns:"130px 1fr 130px 110px", padding:"9px 12px", borderBottom:`1px solid ${T.border}`, alignItems:"center" }}>
            <span style={{ fontSize:11.5, fontWeight:500, color:T.text }}>{g.type}</span>
            <span style={{ fontSize:11, color:T.sub }}>{g.period}</span>
            <span style={{ fontSize:11, color:g.status==="due"?T.amber:T.sub }}>{g.dueDate}</span>
            <Pill status={g.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TAB: CAMPAIGN P&L (Founder — full; PCM — their event, no director pay) ──
function TabCampaignPL({ role, advMap, setAdvMap, expenses, invoices, campsRef }) {
  const [selC, setSelC]     = useState("c1");
  const [mPctOv, setMPctOv] = useState({});

  if (!can(role, "seeCampaignPL")) {
    return (
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:10 }}>
        <div style={{ fontSize:32, color:T.mute }}>◉</div>
        <div style={{ fontSize:13, color:T.sub }}>Campaign P&L — Founder / PCM access only</div>
      </div>
    );
  }

  const camp = campsRef.find(c => c.id === selC) || campsRef[0];
  if (!camp) return <div style={{padding:40,color:T.sub,fontSize:12}}>No campaigns found. Seed the campaigns database first.</div>;
  const mPct = mPctOv[camp.id] != null ? mPctOv[camp.id] : camp.marginPct;
  const m    = calcMargin(camp.budget, mPct, camp.agencyFeePct, camp.agencyFeeType, camp.isRetainerClient);
  const creatorSpend = expenses.filter(e => e.campaign === camp.id && e.cat === "external_creator" && e.status === "paid").reduce((s, e) => s + e.amount, 0);
  const vendorSpend  = expenses.filter(e => e.campaign === camp.id && e.cat === "external_vendor"  && e.status === "paid").reduce((s, e) => s + e.amount, 0);
  const totalSpend   = creatorSpend + vendorSpend;
  const remaining    = m.opsBudget - totalSpend;
  const isAdv        = !!advMap[camp.id];
  const retainerAmt  = CLIENTS[0].retainerAmount;
  const campInvoiced = invoices.filter(i => i.type === "campaign").reduce((s, i) => s + (i.amount || 0), 0);
  const ovsRatio     = retainerAmt > 0 ? campInvoiced / retainerAmt : 0;

  const DIR_TYPES = [
    { t:"Salary",            sub:"salary",              sec:"192",  col:T.gold,   desc:"Director salary from company" },
    { t:"Consultancy",       sub:"consultancy",          sec:"194J", col:T.accent, desc:"Fee to personal LLP" },
    { t:"Drawings",          sub:"drawings",             sec:"N/A",  col:T.teal,   desc:"Proprietorship withdrawal" },
    { t:"Profit distribution",sub:"profit_distribution",sec:"N/A",  col:T.green,  desc:"LLP profit share" },
  ];

  return (
    <div style={{ padding:"20px 24px", overflowY:"auto", height:"100%" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div style={{ fontFamily:"'Newsreader',serif", fontSize:20, fontWeight:600, color:T.text, fontStyle:"italic" }}>
          Campaign P&L
          <span style={{ marginLeft:10, fontSize:10, color:T.amber, border:`1px solid ${T.amber}25`, borderRadius:3, padding:"1px 5px", fontFamily:"'Sora'", fontStyle:"normal", verticalAlign:"middle" }}>
            {isFounder(role) ? "Founder" : "PCM — event view"}
          </span>
        </div>
        {/* Event selector — this is the "particular event" scope for PCM.
            NOTE: campsRef has no owning-PCM field yet, so every PCM
            currently sees the same event list a Founder does; once
            campaigns carry a pcmId (mirroring amId/cmId/eaId in
            InternalCampaigns_V5), filter this list to
            campsRef.filter(c => c.pcmId === currentUserId) for real
            per-PCM scoping. */}
        <select value={selC} onChange={e => setSelC(e.target.value)} style={{ ...INP, width:"auto" }}>
          {campsRef.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {ovsRatio > 2 && (
        <div style={{ background:`${T.amber}08`, border:`1px solid ${T.amber}25`, borderRadius:7, padding:"12px 14px", marginBottom:14 }}>
          <Lbl color={T.amber}>Overservicing Alert</Lbl>
          <div style={{ fontSize:11, color:T.sub, marginTop:4 }}>Campaign fees ({fmtFull(campInvoiced)}) are {ovsRatio.toFixed(1)}× the monthly retainer ({fmtFull(retainerAmt)}). Consider repricing.</div>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
        <div style={{ background:T.raised, border:`1px solid ${T.amber}22`, borderRadius:7, padding:"14px" }}>
          <Lbl color={T.amber} style={{ display:"block", marginBottom:10 }}>Margin Configuration</Lbl>
          <div style={{ marginBottom:10 }}>
            <Lbl style={{ display:"block", marginBottom:4 }}>Margin %</Lbl>
            <input type="number" value={mPct} min={0} max={80} step={1} onChange={e => setMPctOv(o => ({ ...o, [camp.id]:parseFloat(e.target.value)||0 }))} style={{ ...INP }} />
          </div>
          {camp.isRetainerClient && <div style={{ fontSize:9.5, color:T.teal, marginBottom:10 }}>Retainer client — agency fee waived on campaigns</div>}
          {[["Client budget (set by client)", fmtFull(camp.budget), T.text], ["Margin (stays with us)", fmtFull(m.margin), T.accent], ["Ops budget (team sees)", fmtFull(m.opsBudget), T.teal], ["Agency fee", m.agencyFee > 0 ? fmtFull(m.agencyFee) : "Waived (retainer)", m.agencyFee > 0 ? T.amber : T.sub], ["Gross profit", fmtFull(m.grossProfit), T.green], ["Gross margin %", fmtPct(m.grossPct), m.grossPct >= 30 ? T.green : T.red]].map(([l, v, c]) => (
            <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${T.border}` }}>
              <span style={{ fontSize:11, color:T.sub }}>{l}</span>
              <span style={{ fontSize:11.5, fontWeight:500, color:c }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ background:T.raised, border:`1px solid ${T.border}`, borderRadius:7, padding:"14px" }}>
          <Lbl style={{ display:"block", marginBottom:10 }}>Budget vs. Actuals</Lbl>
          {[
            ["Total campaign budget", camp.budget, null],
            ["Creator budget allocated", camp.creatorBudget || Math.round(camp.budget * 0.6), null],
            ["Ops budget (post-margin)", m.opsBudget, null],
            ["Creator (MCN) spend", creatorSpend, m.opsBudget],
            ["Vendor spend", vendorSpend, m.opsBudget],
            ["Total spent", totalSpend, m.opsBudget],
            ["Pool remaining", remaining, m.opsBudget],
          ].map(([l, v, max]) => (
            <div key={l} style={{ marginBottom:9 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                <span style={{ fontSize:11, color:T.sub }}>{l}</span>
                <span style={{ fontSize:11.5, fontWeight:500, color:v < 0 ? T.red : T.text }}>{fmtFull(v)}</span>
              </div>
              {max != null && (
                <div style={{ height:3, background:T.mute, borderRadius:1 }}>
                  <div style={{ height:3, borderRadius:1, background:v > max ? T.red : T.teal, width:`${Math.min(100, max > 0 ? (v/max)*100 : 0)}%`, transition:"width 0.3s" }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Owner's personal compensation — never shown to PCM, even though
          PCM otherwise has full billing access to this event's numbers. */}
      {isFounder(role) && (
        <div style={{ background:T.raised, border:`1px solid ${T.gold}22`, borderRadius:7, padding:"14px", marginBottom:14 }}>
          <Lbl color={T.gold} style={{ display:"block", marginBottom:10 }}>Director's Remuneration — All structures</Lbl>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
            {DIR_TYPES.map(({ t, sub, sec, col, desc }) => {
              const item = expenses.find(e => e.directorOnly && e.sub === sub);
              return (
                <div key={t} style={{ padding:"10px", background:T.bg, borderRadius:6, border:`1px solid ${T.border}` }}>
                  <div style={{ fontSize:10, fontWeight:500, color:col, marginBottom:3 }}>{t}</div>
                  <div style={{ fontSize:8.5, color:T.label, marginBottom:5 }}>{desc} · TDS {sec}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{item ? fmtFull(item.amount) : "—"}</div>
                  <Pill status={item ? item.status : "pending"} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ background:isAdv ? `${T.green}08` : `${T.amber}08`, border:`1px solid ${isAdv ? `${T.green}25` : `${T.amber}25`}`, borderRadius:7, padding:"14px", display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:12, fontWeight:500, color:isAdv ? T.green : T.amber, marginBottom:3 }}>Advance Status — {camp.name}</div>
          <div style={{ fontSize:10.5, color:T.sub }}>{isAdv ? `Confirmed ${advMap[camp.id].confirmedAt} · Campaign stage unlocked` : "Advance not confirmed — campaign stage blocked in InternalCampaigns"}</div>
        </div>
        {!isAdv && (
          <Btn variant="success" onClick={() => {
            const upd = { ...advMap, [camp.id]:{ status:"confirmed", confirmedAt:todayStr(), confirmedBy:"founder" } };
            setAdvMap(upd);
            writeLS("billing_advances", upd);
          }}>
            Confirm advance received
          </Btn>
        )}
        {isAdv && <span style={{ fontSize:11, color:T.green }}>✓ Confirmed</span>}
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function InternalBilling() {
  const { user } = useOutletContext() || {};
  const currentUser = user || { role:"founder", teamId:"t8" };
  const propRole = currentUser.role;
  const billingRole = propRole === "accounts_head" || propRole === "accounts_exec" ? "accounts" : propRole;
  const [role] = useState(billingRole);
  const [tab,       setTab]       = useState("dashboard");
  const [invoices,  setInvoicesRaw]  = useState([]);
  const [expenses,  setExpensesRaw]  = useState([]);
  const [quotes,    setQuotesRaw]    = useState([]);
  const [pos,       setPosRaw]       = useState([]);
  const [clientPOs, setClientPOsRaw] = useState([]);
  const [campsRef,  setCampsRef]  = useState(SEED_CAMPS_REF); // real campaigns from DB (seed fallback until loaded)
  const [advMap,    setAdvMap]    = useState(() => readLS("billing_advances"));
  const [toast,     setToast]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(null);

  const showToast = useCallback(msg => { setToast(msg); setTimeout(() => setToast(null), 2500); }, []);

  // Each item in these arrays is a full object (no nested merges from
  // children), so on every setState we diff against the previous list and
  // PATCH/POST whichever ids changed or are new. Keeps every child
  // component (TabIncome, TabSpending, etc.) completely unchanged — they
  // just call setInvoices(prev => ...) like before.
  const syncCollection = useCallback((prevList, nextList, api) => {
    const prevById = new Map(prevList.map(x => [x.id, x]));
    for (const item of nextList) {
      const before = prevById.get(item.id);
      if (!before) {
        api.create(item).catch(() => showToast("Save failed — check connection"));
      } else if (JSON.stringify(before) !== JSON.stringify(item)) {
        const { id, ...rest } = item;
        api.update(id, rest).catch(() => showToast("Save failed — check connection"));
      }
    }
  }, [showToast]);

  const setInvoices  = useCallback(updater => setInvoicesRaw(prev => { const next = typeof updater === "function" ? updater(prev) : updater; syncCollection(prev, next, InvoicesAPI); return next; }), [syncCollection]);
  const setExpenses  = useCallback(updater => setExpensesRaw(prev => { const next = typeof updater === "function" ? updater(prev) : updater; syncCollection(prev, next, ExpensesAPI); return next; }), [syncCollection]);
  const setQuotes    = useCallback(updater => setQuotesRaw(prev => { const next = typeof updater === "function" ? updater(prev) : updater; syncCollection(prev, next, QuotesAPI); return next; }), [syncCollection]);
  const setPos       = useCallback(updater => setPosRaw(prev => { const next = typeof updater === "function" ? updater(prev) : updater; syncCollection(prev, next, PurchaseOrdersAPI); return next; }), [syncCollection]);
  const setClientPOs = useCallback(updater => setClientPOsRaw(prev => { const next = typeof updater === "function" ? updater(prev) : updater; syncCollection(prev, next, ClientPOsAPI); return next; }), [syncCollection]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([InvoicesAPI.list(), ExpensesAPI.list(), QuotesAPI.list(), PurchaseOrdersAPI.list(), ClientPOsAPI.list(), CampaignsAPI.list()])
      .then(([inv, exp, qts, posList, cpos, camps]) => {
        if (cancelled) return;
        setInvoicesRaw(inv);
        setExpensesRaw(exp);
        setQuotesRaw(qts);
        setPosRaw(posList);
        setClientPOsRaw(cpos);
        // Map real campaigns into the billing reference shape
        setCampsRef(camps.map(c => ({
          id: c.id,
          name: c.name,
          client: c.client,
          budget: c.budget || 0,
          creatorBudget: c.creatorBudget || Math.round((c.budget || 0) * 0.6),
          stage: c.stage,
          marginPct: c.marginPct || 35,
          agencyFeePct: c.agencyFeePct || 15,
          agencyFeeType: c.agencyFeeType || "baked_in",
          isRetainerClient: c.isRetainerClient || false,
        })));
        setLoading(false);
      })
      .catch(err => { if (!cancelled) { setLoadError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (loading) return; // wait until quotes are fetched so the dup-check below is accurate
    const pending = readLS("billing_auto_quotes_pending");
    const keys    = Object.keys(pending);
    if (keys.length === 0) return;
    const campId  = keys[0];
    const camp    = campsRef.find(c => c.id === campId);
    if (!camp) return;
    const already = quotes.some(q => q.campaignId === campId && q.isAutoGenerated);
    if (already) return;
    const newQ = { id:`QT-AUTO-${campId}`, client:camp.client, label:`${camp.name} — Auto-Generated Quote`, status:"pending_review", isAutoGenerated:true, campaignId:campId, createdDate:todayStr(), validTill:"", isRetainerClient:true, marginPct:35, agencyFeePct:0, agencyFeeType:"baked_in", lines:[{ desc:`Influencer Marketing — ${camp.name}`, sac:"998361", qty:1, rate:camp.budget, gstRate:18 }], notes:"Auto-generated on brief lock. Review and edit before sending." };
    setQuotes(p => [newQ, ...p]);
    writeLS("billing_auto_quotes_pending", {});
    showToast(`Auto-quote created for ${camp.name}`);
  }, [loading, campsRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const anomalies = useMemo(() => detectAnomalies(expenses), [expenses]);

  const overdueCount     = invoices.filter(i => i.status === "overdue").length;
  const pendingApproval  = expenses.filter(e => e.status === "pending_approval").length;
  const pendingPOs       = pos.filter(p => p.status === "pending_approval").length;
  const filingsDue       = GST_CALENDAR.filter(g => g.status === "due").length;
  const autoQuotesPending= quotes.filter(q => q.isAutoGenerated && q.status === "pending_review").length;
  const noPOInvoices     = invoices.filter(i => !i.clientPO && i.type === "campaign").length;
  const criticalAnoms    = anomalies.filter(a => a.severity === "critical").length;

  // Per spec: CM and EA must not see any financial billing data.
  // AM gets read-only access to campaign budget info only (no income/spending/GST/TDS).
  const hasFullBilling = can(role, "seeRevenue");       // founder + pcm
  const hasOpsBilling  = can(role, "seeCampaignBudgetInBilling"); // + am + accounts

  const TABS = [
    { id:"dashboard",       lbl:"Dashboard",    badge:null,                                          show: hasOpsBilling },
    { id:"income",          lbl:"Income",        badge:overdueCount + noPOInvoices || null, col:overdueCount > 0 ? T.red : T.amber, show: hasFullBilling },
    { id:"spending",        lbl:"Spending",      badge:pendingApproval + criticalAnoms || null, col:criticalAnoms > 0 ? T.red : T.amber, show: hasFullBilling },
    { id:"purchase_orders", lbl:"POs",           badge:pendingPOs || null, col:T.amber,            show: hasFullBilling },
    { id:"quotations",      lbl:"Quotations",    badge:autoQuotesPending || null, col:T.teal,       show: hasFullBilling },
    { id:"registry",        lbl:"Registry",      badge:null,                                          show: can(role, "seeRegistry") },
    { id:"gst",             lbl:"GST",           badge:filingsDue || null, col:T.amber,             show: can(role, "seeGST") },
    ...(can(role, "seeCampaignPL") ? [{ id:"campaign_pl", lbl:"Campaign P&L", badge:null, show: true }] : []),
  ].filter(t => t.show);

  if (loading) return (
    <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", background:"#F5F5F7", fontFamily:SF, fontSize:13, color:"#6E6E73" }}>
      Loading billing data…
    </div>
  );
  if (loadError) return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#F5F5F7", fontFamily:SF, fontSize:13, gap:8, color:"#6E6E73" }}>
      <div>Couldn't reach the billing API.</div>
      <div style={{ fontSize:11, color:"#86868B" }}>{loadError}</div>
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"#F5F5F7", fontFamily:SF, color:"#1D1D1F", overflow:"hidden" }}>
      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", bottom:24, right:24, zIndex:9999, padding:"11px 18px", background:"rgba(29,29,31,0.92)", backdropFilter:"blur(16px)", borderRadius:12, fontSize:12, color:"#FFFFFF", fontFamily:SF, boxShadow:"0 8px 32px rgba(0,0,0,0.24)", letterSpacing:"-0.01em" }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ padding:"16px 24px 0", flexShrink:0, background:"#FFFFFF", borderBottom:"1px solid rgba(0,0,0,0.07)" }}>
        <div style={{ display:"flex", alignItems:"center", marginBottom:14 }}>
          <div>
            <h1 style={{ fontFamily:"'Newsreader',serif", fontSize:20, fontWeight:600, color:"#1D1D1F", margin:0, fontStyle:"italic", letterSpacing:"-0.02em" }}>Billing</h1>
            <div style={{ fontSize:10.5, color:"#86868B", fontFamily:SF, marginTop:2 }}>
              5th Avenue · FY {FY} · Monthly GST
            </div>
          </div>
          <div style={{ flex:1 }} />
          {/* Quick stats */}
          <div style={{ display:"flex", gap:20, marginRight:8 }}>
            {[
              { l:"Outstanding", v:fmtINR(invoices.filter(i => ["pending","overdue"].includes(i.status) && i.type !== "credit_note").reduce((s,i)=>s+i.amount,0)), c:overdueCount > 0 ? T.red : "#1D1D1F" },
              { l:"Approval needed", v:pendingApproval, c:pendingApproval > 0 ? T.amber : "#6E6E73" },
              { l:"Anomalies", v:anomalies.length, c:anomalies.length > 0 ? T.red : "#6E6E73" },
            ].map(s => (
              <div key={s.l} style={{ textAlign:"right" }}>
                <div style={{ fontSize:17, fontWeight:700, color:s.c, lineHeight:1, letterSpacing:"-0.03em", fontFamily:SF }}>{s.v}</div>
                <div style={{ fontSize:9.5, color:"#86868B", marginTop:2, fontFamily:SF }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tab strip — segment control style */}
        <div style={{ display:"flex", gap:0, marginBottom:0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding:"10px 0", marginRight:20, background:"transparent", border:"none",
              borderBottom:`2px solid ${tab === t.id ? T.accent : "transparent"}`,
              color:tab === t.id ? "#1D1D1F" : "#6E6E73",
              fontSize:12, cursor:"pointer", fontFamily:SF,
              fontWeight:tab === t.id ? 600 : 400, marginBottom:-1,
              transition:"all 0.15s", display:"flex", alignItems:"center", gap:6,
              letterSpacing:"-0.01em", whiteSpace:"nowrap",
            }}>
              {t.lbl}
              {t.badge != null && (
                <span style={{ fontSize:9, fontWeight:700, background:t.col || T.amber, color:"#FFFFFF", padding:"1px 6px", borderRadius:10, lineHeight:1.5 }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex:1, minHeight:0, overflow:"hidden" }}>
        {tab === "dashboard"      && <TabDashboard      role={role} invoices={invoices} expenses={expenses} advMap={advMap} setAdvMap={setAdvMap} setTab={setTab} anomalies={anomalies} pos={pos} campsRef={campsRef} />}
        {tab === "income"         && <TabIncome         role={role} invoices={invoices} setInvoices={setInvoices} clientPOs={clientPOs} setClientPOs={setClientPOs} campsRef={campsRef} />}
        {tab === "spending"       && <TabSpending       role={role} expenses={expenses} setExpenses={setExpenses} anomalies={anomalies} pos={pos} campsRef={campsRef} />}
        {tab === "purchase_orders"&& <TabPurchaseOrders role={role} pos={pos} setPos={setPos} campsRef={campsRef} />}
        {tab === "quotations"     && <TabQuotations     role={role} quotes={quotes} setQuotes={setQuotes} campsRef={campsRef} />}
        {tab === "registry"       && <TabRegistry       role={role} />}
        {tab === "gst"            && <TabGST            role={role} invoices={invoices} expenses={expenses} />}
        {tab === "campaign_pl"    && <TabCampaignPL     role={role} advMap={advMap} setAdvMap={setAdvMap} expenses={expenses} invoices={invoices} campsRef={campsRef} />}
      </div>

    </div>
  );
}