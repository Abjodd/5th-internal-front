/**
 * 5th Avenue — Internal Billing · V2 (crash-fixed rewrite)
 * No IIFEs in JSX · All null guards · Clean component structure
 */
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useOutletContext } from "react-router-dom";
// RegistryAPI is gone: the registry is derived from campaigns + expenses now
// (see buildRegistry) rather than read from a collection nothing ever wrote to.
import { InvoicesAPI, ExpensesAPI, PurchaseOrdersAPI, ClientPOsAPI, QuotesAPI, CampaignsAPI } from "../../lib/api";
import { can } from "../../lib/rbac";
import { fmtCompact, fmtINR, prettyDate, todayISO } from "../../lib/format";
import { receivedOf, isOverdue } from "../../lib/invoiceMoney";
import { creatorBudgetOf, creatorKeyOf, normStage, stageLabel } from "../../lib/campaign";
import MoneyInput from "../../components/MoneyInput";
import DateInput from "../../components/DateInput";

// ── TOKENS ────────────────────────────────────────────────────────────────────
import { T } from "../../theme/tokens";

const INP = {
  width:"100%", padding:"7px 10px", borderRadius:5,
  background:T.raised, border:`1px solid ${T.border}`,
  color:T.text, fontSize:11.5, fontFamily:"'Sora'", outline:"none",
};

const FY = "2025–26";
const todayStr = () => new Date().toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });

// Document ids. These were minted as `Date.now().toString().slice(-5)`, i.e.
// the last 5 digits of a millisecond clock — a value space that wraps every
// 100 seconds, so two POs raised a minute and a half apart could collide and
// the duplicate _id took the backend down. Full-precision base36 time keeps
// ids sortable and short, and the random suffix removes same-millisecond
// collisions (two rapid submits, a retry, a double-fired handler).
const newId = (prefix) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

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
function fmtFull(n) { return "₹" + (n || 0).toLocaleString("en-IN"); }
function fmtPct(n)  { return `${Number(n || 0).toFixed(1)}%`; }

// ── MARGIN MODEL ──────────────────────────────────────────────────────────────
// One model, and it's the same arithmetic IM Financials already shows: the
// client's budget splits into the creator pool the team gets to spend and the
// agency fee we keep. Both numbers come off the campaign — nothing is stored
// here and nothing is assumed.
//
// The old model read marginPct / agencyFeePct / agencyFeeType off the campaign
// and fell back to `|| 35` / `|| 15` when they were missing — which was always,
// since no campaign in the database has ever carried those fields. So every
// P&L reported two invented percentages as if they were the commercials, while
// `creatorBudget` (the number the brief actually collects) was loaded into
// campsRef and then used in exactly one display row. Two pages, two answers,
// for the same campaign. Deriving it means they cannot disagree again.
function calcMargin(clientBudget, creatorBudget) {
  const budget    = clientBudget || 0;
  // Clamped: a creator pool larger than the budget is a data error, not a
  // negative agency fee.
  const opsBudget = Math.min(Math.max(creatorBudget || 0, 0), budget);
  const agencyFee = budget - opsBudget;
  return { opsBudget, agencyFee, clientTotal:budget, grossProfit:agencyFee,
           grossPct: budget > 0 ? (agencyFee / budget) * 100 : 0 };
}

// ── PO LEDGER MODEL ───────────────────────────────────────────────────────────
// A purchase order has two independent axes. The old model jammed both into one
// enum (pending_approval → approved → work_delivered → matched → closed), which
// made "matched" something a human asserted with a button rather than something
// the books proved:
//
//   approval    — pending_approval → approved / rejected      (a human decision)
//   fulfilment  — open → partially_billed → fully_billed      (derived, below)
//
// Fulfilment and every money figure are recomputed from the documents that bill
// against the PO. Nothing is stored. The previous design stored `invoicedAmount`
// on each client PO and nothing ever incremented it — the real values existed
// only in seed rows, so every PO raised through the UI sat at 0 forever while
// the "Remaining" column happily reported the full value as unspent.

// Overdue is DERIVED, never stored. Nothing in the app ever set
// `status:"overdue"` — there was no date sweep anywhere — so the Aged
// Receivables panel, the overdue filter and the red header count were all
// permanently empty while invoices sat unpaid indefinitely. Compounding it,
// every auto-created invoice carried `dueDate:"TBD"`, so even a sweep would
// have had nothing to compare.
//
// Only ISO dates count. "TBD" and the localised strings older Billing-created
// invoices carry mean "no due date agreed" — which is not the same as "not yet
// due", and must not be reported as either.
// ISO_DATE and todayISO come from lib/format — both were re-declared here
// while Campaigns imported/hand-rolled its own copies of the same two things.
//
// Declared above isOverdue because it calls it: both are const arrow functions,
// so this only works today by virtue of the call happening after module init.
// receivedOf / isOverdue moved to lib/invoiceMoney (imported at the top of
// this file) once the Founder Summary began reporting the same figures — two
// copies of "what counts as collected" is how the two pages would drift.

// Outbound (us → vendor): the bills are expenses tagged with this PO.
const billedAgainstPO = (poId, expenses) =>
  (expenses || []).filter(e => e.poId === poId).reduce((s, e) => s + (e.amount || 0), 0);

// Inbound (client → us): the bills are invoices raised against this PO.
// Credit notes are excluded — they reverse revenue, they don't consume the PO.
const invoicedAgainstPO = (poId, invoices) =>
  (invoices || [])
    .filter(i => i.clientPO?.id === poId && i.type !== "credit_note")
    .reduce((s, i) => s + (i.amount || 0), 0);

// Legacy docs used the single enum above. work_delivered/matched really meant
// "approved, and some billing has happened" — which derived fulfilment now
// answers on its own, so they collapse back to plain `approved`.
const APPROVAL_OF = {
  pending_approval:"pending_approval", approved:"approved", rejected:"rejected",
  work_delivered:"approved", matched:"approved", closed:"approved",
};
const approvalOf = po => APPROVAL_OF[po?.status] || "pending_approval";
const isPOClosed = po => po?.closed === true || po?.status === "closed";

// One PO's ledger line: value, what has been billed against it, what is left.
// `billed` comes from billedAgainstPO / invoicedAgainstPO depending on direction.
function poLedger(po, billed) {
  const value   = po?.amount || 0;
  const balance = value - billed;
  // A PO with no recorded value is NOT over-billed — its value is simply
  // unknown, and the two must not look the same. The old "Upload PO" flow
  // captured only a PO number and wrote amount:0, so these exist in the data:
  // reporting them as "over-billed by the full invoice" would be a false alarm,
  // while silently backfilling the value from the invoices would invent an
  // authorisation the client never gave. Both are wrong; this asks for the number.
  const fulfilment = isPOClosed(po) ? "closed"
    : value <= 0      ? "unrecorded"
    : billed <= 0     ? "open"
    // Sub-rupee slack: a fully-billed PO shouldn't read "partially billed"
    // because of floating-point drift on a split payment schedule.
    : balance > 0.5   ? "partially_billed"
    : "fully_billed";
  return { value, billed, balance, fulfilment, pct: value > 0 ? Math.min(100, (billed / value) * 100) : 0 };
}

const FULFILMENT_LABEL = { open:"Open", partially_billed:"Partially billed", fully_billed:"Fully billed", closed:"Closed", unrecorded:"Value not set" };
const FULFILMENT_COL   = { open:T.sub, partially_billed:T.amber, fully_billed:T.green, closed:T.label, unrecorded:T.red };

// ── QUOTE MARGIN ──────────────────────────────────────────────────────────────
// The percentage-driven model, kept where it belongs: a quote's margin % and
// agency fee % are typed into the quote form, so here they are real inputs
// rather than the `|| 35` / `|| 15` guesses they became on the campaign P&L.
function quoteMargin(sub, marginPct, agencyFeePct, agencyFeeType, isRetainer) {
  const margin    = sub * ((marginPct || 0) / 100);
  const agencyFee = isRetainer ? 0 : sub * ((agencyFeePct || 0) / 100);
  const opsBudget = agencyFeeType === "baked_in" ? sub - margin - agencyFee : sub - margin;
  const total     = agencyFeeType === "over_above" ? sub + agencyFee : sub;
  const grossProfit = margin + agencyFee;
  return { margin, agencyFee, opsBudget, grossProfit,
           grossPct: total > 0 ? (grossProfit / total) * 100 : 0 };
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

// Billing state lives in the shared collections, never in localStorage — a
// figure only one person's browser knows is not a books entry.

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
          {/* Overdue is derived, so the pill has to ask isOverdue rather than
              read a stored status that nothing ever sets. */}
          <Pill status={inv.type === "credit_note" ? "credit_note" : isOverdue(inv) ? "overdue" : inv.status} />
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

// ── PO DETAIL PANEL ───────────────────────────────────────────────────────────
// Shared by both PO directions. `docs` are the bills counted against this PO,
// so the panel can show WHY the balance is what it is instead of a bare number.
function POLedgerBar({ led, role }) {
  const col = FULFILMENT_COL[led.fulfilment] || T.sub;
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:8 }}>
        {[["PO Value", led.value, T.text], ["Billed", led.billed, col], ["Balance", led.balance, led.balance < 0 ? T.red : T.text]].map(([l, v, c]) => (
          <div key={l} style={{ padding:"8px 10px", background:T.raised, borderRadius:5 }}>
            <div style={{ fontSize:9, color:T.label, marginBottom:2 }}>{l}</div>
            <div style={{ fontSize:13, fontWeight:600, color:c }}>{isAccounts(role) ? fmtFull(v) : "\u20b9 \u2014\u2014"}</div>
          </div>
        ))}
      </div>
      <div style={{ height:5, background:T.mute, borderRadius:3, overflow:"hidden" }}>
        <div style={{ height:5, borderRadius:3, background:led.balance < 0 ? T.red : col, width:`${led.pct}%`, transition:"width 0.3s" }} />
      </div>
      {led.fulfilment === "unrecorded" ? (
        <div style={{ fontSize:9.5, color:T.red, marginTop:4 }}>
          No PO value recorded \u2014 {fmtFull(led.billed)} has been billed against it. Set the value this PO authorises to track a balance.
        </div>
      ) : led.balance < 0 ? (
        <div style={{ fontSize:9.5, color:T.red, marginTop:4 }}>
          Over-billed by {fmtFull(Math.abs(led.balance))} \u2014 bills against this PO exceed its approved value.
        </div>
      ) : null}
    </div>
  );
}

// Bills counted against a PO, so the balance is auditable rather than asserted.
function POLinkedDocs({ docs, role, emptyText, onUnbill }) {
  return (
    <div style={{ marginBottom:14 }}>
      <Lbl style={{ display:"block", marginBottom:6 }}>Billed against this PO ({docs.length})</Lbl>
      {docs.length === 0
        ? <div style={{ fontSize:11, color:T.label, fontStyle:"italic" }}>{emptyText}</div>
        : docs.map(d => (
            <div key={d.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:`1px solid ${T.border}` }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:11, color:T.text }}>{d.label || d.payee || d.id}</div>
                <div style={{ fontSize:9, color:T.label, fontFamily:"monospace" }}>{d.id}{d.date || d.raisedDate ? ` \u00b7 ${d.date || d.raisedDate}` : ""}</div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0, marginLeft:10 }}>
                <span style={{ fontSize:11, fontWeight:500, color:T.text }}>{isAccounts(role) ? fmtFull(d.amount || 0) : "\u20b9 \u2014\u2014"}</span>
                {onUnbill && isAccounts(role) && <button onClick={() => onUnbill(d.id)} title="Remove from this PO" style={{ fontSize:9, color:T.sub, background:"transparent", border:`1px solid ${T.border}`, borderRadius:3, padding:"1px 5px", cursor:"pointer", fontFamily:"'Sora'" }}>unlink</button>}
              </div>
            </div>
          ))}
    </div>
  );
}

function PODetail({ po, role, canRaise, led, docs, candidates = [], direction, onApprove, onReject, onReopen, onClose, onSetValue, onSetNumber, onBill, onUnbill }) {
  if (!po) return <div style={{ textAlign:"center", paddingTop:60, color:T.label, fontSize:11 }}>Select a PO{canRaise ? " or create new" : ""}</div>;
  const approval = approvalOf(po);
  const outbound = direction === "outbound";
  return (
    <div style={{ padding:"20px 24px", overflowY:"auto", height:"100%" }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
        <div style={{ minWidth:0 }}>
          <div style={{ fontFamily:"'Newsreader',serif", fontSize:18, fontWeight:600, color:T.text, fontStyle:"italic", marginBottom:3 }}>
            {outbound ? po.vendor : po.poNumber}
          </div>
          <div style={{ fontSize:10, color:T.label, fontFamily:"monospace" }}>
            {po.id}{po.campaignName ? ` \u00b7 ${po.campaignName}` : ""}{po.createdAt || po.receivedDate ? ` \u00b7 ${po.createdAt || po.receivedDate}` : ""}
          </div>
          <div style={{ fontSize:10.5, color:T.sub, marginTop:3 }}>
            {outbound ? `Raised by ${po.raisedByName || "\u2014"}` : `Issued by ${po.client || "client"}`}
          </div>
        </div>
        <div style={{ display:"flex", gap:6, flexShrink:0 }}>
          {outbound && <Pill status={approval} />}
          <span style={{ fontSize:9, fontWeight:600, padding:"3px 8px", borderRadius:10, whiteSpace:"nowrap",
            color:FULFILMENT_COL[led.fulfilment], border:`1px solid ${FULFILMENT_COL[led.fulfilment]}35`, background:`${FULFILMENT_COL[led.fulfilment]}12` }}>
            {FULFILMENT_LABEL[led.fulfilment]}
          </span>
        </div>
      </div>

      <POLedgerBar led={led} role={role} />
      <Hr style={{ marginBottom:14 }} />

      {po.needsReview && (
        <div style={{ background:`${T.red}08`, border:`1px solid ${T.red}25`, borderRadius:6, padding:"10px 12px", marginBottom:12 }}>
          <Lbl color={T.red}>Needs review</Lbl>
          <div style={{ fontSize:10.5, color:T.sub, marginTop:3, lineHeight:1.5 }}>{po.reviewNote}</div>
        </div>
      )}

      {po.scope && (
        <div style={{ marginBottom:12 }}>
          <Lbl style={{ display:"block", marginBottom:6 }}>Scope of work</Lbl>
          <div style={{ fontSize:12, color:T.text, lineHeight:1.6 }}>{po.scope}</div>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:14 }}>
        {(outbound
          ? [["Schedule", po.paymentScheduleType === "advance_final" ? "Advance + Final" : "Single"], ["Delivery", po.deliveryDate || "TBD"], ["Approval", approval.replace(/_/g," ")]]
          : [["PO Number", po.poNumber || "\u2014"], ["Received", po.receivedDate || "\u2014"], ["Valid till", po.validTill || "\u2014"]]
        ).map(([l, v]) => (
          <div key={l} style={{ padding:"8px 10px", background:T.raised, borderRadius:5 }}>
            <div style={{ fontSize:9, color:T.label, marginBottom:2 }}>{l}</div>
            <div style={{ fontSize:12, fontWeight:500, color:T.text, textTransform:l === "Approval" ? "capitalize" : "none" }}>{v}</div>
          </div>
        ))}
      </div>

      <POLinkedDocs docs={docs} role={role} onUnbill={outbound ? onUnbill : null}
        emptyText={outbound
          ? "No creator costs billed against this PO yet."
          : "No invoices raised against this PO yet."} />

      {/* The costs this PO could cover: creator expenses on the same campaign
          with no PO attached. Without this there was no route from a committed
          creator cost to the PO that authorises it, so `billedAgainstPO` always
          summed zero and every vendor PO read "open" no matter what had been
          spent. Explicit, one at a time — a PO covers what someone says it
          covers, not whatever happens to share a campaign id. */}
      {outbound && candidates.length > 0 && (
        <div style={{ marginBottom:14, background:`${T.amber}06`, border:`1px solid ${T.amber}22`, borderRadius:6, padding:"10px 12px" }}>
          <Lbl color={T.amber} style={{ display:"block", marginBottom:2 }}>Unbilled creator costs on this campaign ({candidates.length})</Lbl>
          <div style={{ fontSize:9.5, color:T.label, marginBottom:6 }}>Committed on the campaign but not yet drawn against any PO.</div>
          {candidates.map(e => (
            <div key={e.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 0", borderTop:`1px solid ${T.border}` }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:11, color:T.text }}>{e.payee}</div>
                <div style={{ fontSize:9, color:T.label, fontFamily:"monospace" }}>{e.id}</div>
              </div>
              <span style={{ fontSize:11, fontWeight:500, color:T.text }}>{isAccounts(role) ? fmtFull(e.amount || 0) : "₹ ——"}</span>
              {isAccounts(role) && <Btn variant="amber" style={{ fontSize:9.5 }} onClick={() => onBill && onBill(po.id, e.id)}>Bill against this PO</Btn>}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom:12, fontSize:10, color:(po.poDocument || po.document === "uploaded") ? T.green : T.amber }}>
        {(po.poDocument || po.document === "uploaded") ? "\u2713 PO document uploaded" : "\u26a1 PO document not uploaded"}
      </div>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {outbound && can(role,"approvePO") && approval === "pending_approval" && <>
          <Btn variant="success" onClick={() => onApprove && onApprove(po.id)}>Approve PO</Btn>
          <Btn variant="danger"  onClick={() => onReject  && onReject(po.id)}>Reject</Btn>
        </>}
        {/* Closing is the only manual override left: it freezes a PO whose
            remaining balance will never be billed (job descoped, PO expired). */}
        {isAccounts(role) && led.fulfilment === "unrecorded" && <Btn variant="amber" onClick={() => onSetValue && onSetValue(po.id, po.amount)}>Set PO value</Btn>}
        {/* Inbound only. Client PO numbers were captured by an "Upload PO"
            prompt that sat next to the vendor POs, and every client PO in the
            data ended up holding the *vendor* PO id for the same campaign —
            a reference for money going out, filed as the client's reference
            for money coming in. There was no way to correct one; now there is. */}
        {!outbound && isAccounts(role) && <Btn variant={po.poNumber ? "ghost" : "amber"} onClick={() => onSetNumber && onSetNumber(po.id, po.poNumber)}>{po.poNumber ? "Correct PO number" : "Set PO number"}</Btn>}
        {isAccounts(role) && !isPOClosed(po) && !["open","unrecorded"].includes(led.fulfilment) && <Btn variant="ghost" onClick={() => onClose && onClose(po.id)}>Close PO</Btn>}
        {isAccounts(role) && isPOClosed(po) && <Btn variant="ghost" onClick={() => onReopen && onReopen(po.id)}>Reopen PO</Btn>}
      </div>
    </div>
  );
}

// ── TAB: DASHBOARD ────────────────────────────────────────────────────────────
function TabDashboard({ role, invoices, expenses, setTab, anomalies, pos, campsRef }) {
  // Collected counts settled schedule legs, not just fully-paid invoices — a
  // campaign's 50% advance is money in the bank even while the invoice is open.
  // Outstanding is the mirror image: billed, minus whatever has landed.
  const billed  = invoices.filter(i => i.type !== "credit_note").reduce((s, i) => s + (i.amount || 0), 0);
  const paid    = invoices.filter(i => i.type !== "credit_note").reduce((s, i) => s + receivedOf(i), 0);
  // Unpaid balance on invoices past their due date — not the full face value,
  // since a settled advance leg is not overdue money.
  const overdue = invoices.filter(isOverdue).reduce((s, i) => s + Math.max(0, (i.amount || 0) - receivedOf(i)), 0);
  const spent   = expenses.filter(e => e.status === "paid" && !e.directorOnly).reduce((s, e) => s + e.amount, 0);
  // Committed = every live expense, paid or not. A creator locked into a
  // campaign is money we owe whether or not it has left the account yet, and
  // reporting only the paid half is what made "Total Spent" read ₹0 forever.
  const committed       = expenses.filter(e => e.status !== "cancelled" && e.status !== "rejected" && !e.directorOnly).reduce((s, e) => s + e.amount, 0);
  const posPending      = (pos || []).filter(p => p.status === "pending_approval").length;
  const outstanding     = Math.max(0, billed - paid);
  const criticalAnoms   = anomalies.filter(a => ["critical","high"].includes(a.severity));
  // Campaigns whose advance the pipeline is still waiting on. Derived from the
  // campaign's own stage — the previous version kept an `advMap` in
  // localStorage and told the founder it "unlocked the campaign stage", which
  // it did not: it was browser-local, invisible to Accounts, and the real gate
  // was a separate button in Campaigns all along.
  const advancePending  = campsRef.filter(c => c.stage === "advance");

  return (
    <div style={{ padding:"20px 24px", overflowY:"auto", height:"100%" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:"'Newsreader',serif", fontSize:20, fontWeight:600, color:T.text, fontStyle:"italic" }}>Financial Dashboard</div>
          <div style={{ fontSize:10, color:T.sub, marginTop:2 }}>FY {FY} · April–March</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <Btn variant="ghost" style={{ fontSize:10 }} onClick={() => exportTally(invoices, expenses)}>↓ Tally CSV</Btn>
        </div>
      </div>

      {criticalAnoms.length > 0 && (
        <div style={{ background:`${T.red}08`, border:`1px solid ${T.red}25`, borderRadius:7, padding:"12px 14px", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <Lbl color={T.red}>⚑ {criticalAnoms.length} Anomaly Alert{criticalAnoms.length > 1 ? "s" : ""}</Lbl>
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

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:12 }}>
        <StatCard role={role} label="Revenue Collected MTD" value={fmtFull(paid)}           sub={`${invoices.filter(i => i.status === "paid").length} invoices`} col={T.green}                    permission="seeRevenue" />
        <StatCard role={role} label="Outstanding"           value={fmtFull(outstanding)}    sub={overdue > 0 ? `${fmtINR(overdue)} overdue` : null}             col={overdue > 0 ? T.amber : T.text} permission="seeOutstanding" />
        <StatCard role={role} label="Committed Spend"       value={fmtFull(committed)}       sub={spent < committed ? `${fmtINR(spent)} paid · ${fmtINR(committed - spent)} owed` : "all settled"}   permission="seeTotalSpend" />
        <StatCard role={role} label="Net (collected − paid)" value={fmtFull(paid - spent)}   sub={can(role,"seeMargins") ? fmtPct(((paid-spent)/Math.max(paid,1))*100)+" margin" : null} col={(paid-spent)>0?T.green:T.red} permission="seeNetMTD" />
      </div>
      {/* GST Collected / TDS Deducted / Filings Due lived here and went with
          the GST tab — they were driven by a hardcoded filing calendar. */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
        <div style={{ background:T.raised, border:`1px solid ${posPending > 0 ? T.amber : T.border}`, borderRadius:7, padding:"12px 14px" }}>
          <div style={{ fontSize:8.5, color:T.label, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>POs Awaiting Approval</div>
          <div style={{ fontSize:18, fontWeight:600, color:posPending > 0 ? T.amber : T.text }}>{posPending}</div>
          <div style={{ fontSize:9.5, color:T.label, marginTop:2 }}>{posPending === 0 ? "nothing pending" : "needs founder sign-off"}</div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:14, marginBottom:20 }}>
        <div style={{ background:T.raised, border:`1px solid ${T.border}`, borderRadius:7, padding:"14px" }}>
          <Lbl style={{ display:"block", marginBottom:10 }}>Aged Receivables (DSO)</Lbl>
          {overdue === 0 ? (
            <div style={{ fontSize:11, color:T.green, fontStyle:"italic" }}>No overdue invoices ✓</div>
          ) : (
            invoices.filter(isOverdue).map(i => {
              const days = Math.round((new Date(`${todayISO()}T00:00:00`) - new Date(`${i.dueDate}T00:00:00`)) / 86400000);
              return (
                <div key={i.id} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:11, color:T.sub }}>{i.id}</div>
                    <div style={{ fontSize:9, color:T.label }}>due {i.dueDate} · {days} day{days === 1 ? "" : "s"} overdue</div>
                  </div>
                  <span style={{ fontSize:11.5, fontWeight:500, color:T.amber }}>{isAccounts(role) ? fmtFull(Math.max(0, (i.amount || 0) - receivedOf(i))) : "₹ ——"}</span>
                </div>
              );
            })
          )}
          <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${T.border}` }}>
            <div style={{ fontSize:10, color:T.amber, marginBottom:4 }}>⚑ Campaign invoices without Client PO</div>
            {invoices.filter(i => !i.clientPO && i.type === "campaign").map(i => (
              <div key={i.id} style={{ fontSize:10, color:T.sub, padding:"2px 0" }}>{i.id} — {(i.label || "").slice(0, 32)}…</div>
            ))}
          </div>
        </div>
      </div>

      {advancePending.length > 0 && (
        <div style={{ background:`${T.amber}08`, border:`1px solid ${T.amber}25`, borderRadius:7, padding:"14px" }}>
          <Lbl color={T.amber} style={{ display:"block", marginBottom:4 }}>Awaiting Advance</Lbl>
          <div style={{ fontSize:10, color:T.sub, marginBottom:8 }}>
            These campaigns are held at the Advance stage. Confirming receipt is done on the campaign — it's the same action that releases it into execution.
          </div>
          {advancePending.map(c => (
            <div key={c.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:`1px solid ${T.border}` }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11.5, fontWeight:500, color:T.text }}>{c.name}</div>
                <div style={{ fontSize:9.5, color:T.sub }}>{c.client} · Budget: {fmtINR(c.budget)}</div>
              </div>
              <span style={{ fontSize:10, color:T.amber, fontStyle:"italic" }}>advance not received</span>
            </div>
          ))}
        </div>
      )}

      {/* ── LIVE CAMPAIGN BUDGET TRACKER ── */}
      {campsRef.length > 0 && (
        <div style={{ marginTop:20 }}>
          <div style={{ fontFamily:"'Newsreader',serif", fontSize:15, fontWeight:600, color:T.text, fontStyle:"italic", marginBottom:10 }}>Campaign Budget Tracker</div>
          {campsRef.map(c => {
            // "Spent" is COMMITTED, matching the Committed Spend stat above and
            // the Campaign P&L — it counted only `paid` here, so a campaign with
            // a fully locked roster and nothing yet disbursed read ₹0 spent
            // while the same page's headline said otherwise.
            const campSpend = expenses.filter(e => e.campaign === c.id && !["cancelled","rejected"].includes(e.status) && !e.directorOnly).reduce((s, e) => s + (e.amount || 0), 0);
            // "Invoiced" is what we BILLED, not what was collected. Filtering on
            // `status === "paid"` made an open ₹10L invoice read as ₹0 invoiced,
            // which is the one number this row exists to show.
            const campInv   = invoices.filter(i => i.campaign === c.id && i.type !== "credit_note").reduce((s, i) => s + (i.amount || 0), 0);
            const pct       = c.budget > 0 ? Math.min(100, (campSpend / c.budget) * 100) : 0;
            const over      = campSpend > c.budget;
            return (
              <div key={c.id} style={{ background:T.raised, border:`1px solid ${T.border}`, borderRadius:7, padding:"12px 14px", marginBottom:8 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                  <div>
                    <span style={{ fontSize:12, fontWeight:500, color:T.text }}>{c.name}</span>
                    <span style={{ fontSize:9.5, color:T.label, marginLeft:8 }}>{c.client}</span>
                    <span style={{ fontSize:8.5, color:T.sub, marginLeft:6, padding:"1px 5px", border:`1px solid ${T.border}`, borderRadius:3 }}>{stageLabel(c.stage)}</span>
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
// Invoices and retainers. Client POs used to live here as a second sub-tab;
// they moved to the POs tab so both directions share one value/balance model.
// What stays here is the part that belongs to an invoice: attaching the client
// PO it bills against.
function TabIncome({ role, invoices, setInvoices, setClientPOs, campsRef }) {
  const [filter, setFilter] = useState("all");
  const [selId,  setSelId]  = useState(null);

  const filtered = useMemo(() => invoices.filter(i => {
    if (filter === "pending")  return i.status === "pending" && !isOverdue(i);
    if (filter === "overdue")  return isOverdue(i);
    if (filter === "paid")     return i.status === "paid";
    if (filter === "credit")   return i.type === "credit_note";
    if (filter === "no_po")    return !i.clientPO && i.type === "campaign";
    return true;
  }), [invoices, filter]);

  const inv = invoices.find(i => i.id === selId) || null;

  const handleAccConfirm    = useCallback(id => setInvoices(p => p.map(i => i.id !== id ? i : { ...i, confirmedByAccounts:true })), [setInvoices]);
  const handleFounderConfirm= useCallback(id => setInvoices(p => p.map(i => i.id !== id ? i : { ...i, confirmedByFounder:true, status:"paid", paidDate:todayStr() })), [setInvoices]);
  // The PO's approved value has to be captured here: with balances derived,
  // a PO recorded at 0 would read as over-billed the moment its first invoice
  // lands. Defaults to the invoice amount, which is the common single-invoice
  // case — override it when the client's PO covers several invoices.
  const handleUploadPO      = useCallback(id => {
    const inv = invoices.find(i => i.id === id);
    const poNum = window.prompt("Client PO number:");
    if (!poNum) return;
    const raw = window.prompt("PO value (₹) — the total this PO authorises:", String(inv?.amount || 0));
    if (raw === null) return;
    const amount = parseFloat(String(raw).replace(/[^\d.]/g, "")) || 0;
    const newPO = { id:newId("CPO"), poNumber:poNum.trim(), amount, receivedDate:todayStr(), document:"uploaded" };
    // The invoice stores the LINK, not a copy. It used to embed the whole PO
    // object alongside the client_pos record, and nothing kept the two in sync:
    // correcting a PO number in the POs tab left the invoice showing the old
    // one. Nothing ever read the embedded number or amount anyway — every
    // consumer uses `clientPO.id` or just its existence — so the copy was pure
    // drift surface. One record, one place, looked up by id.
    setInvoices(p => p.map(i => i.id !== id ? i : { ...i, clientPO:{ id:newPO.id } }));
    // Invoices carry `campaign` (an id) but no campaign name — resolve it here
    // so the POs tab can label the row without another lookup.
    const campName = campsRef.find(c => c.id === inv?.campaign)?.name || "";
    setClientPOs(p => [...p, { ...newPO, client:inv?.client || "", brandId:inv?.brandId || null, campaign:inv?.campaign || null, campaignName:campName, closed:false }]);
  }, [invoices, setInvoices, setClientPOs, campsRef]);

  return (
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
                    <Pill status={i.type === "credit_note" ? "credit_note" : isOverdue(i) ? "overdue" : i.status} />
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
  );
}
// ── TAB: PURCHASE ORDERS ──────────────────────────────────────────────────────
// Both directions live here now. They are the same document with the arrow
// reversed — an approved value, bills drawn against it, a balance — so splitting
// them across two tabs (vendor POs here, client POs buried inside Income) meant
// neither got the value/balance treatment. Every money figure is derived; see
// the PO LEDGER MODEL block near the top of this file.
function TabPurchaseOrders({ role, currentUser, pos, setPos, setExpenses, clientPOs, setClientPOs, invoices, expenses, campsRef }) {
  const [direction, setDirection] = useState("outbound");
  const [filter, setFilter] = useState("all");
  const [selId,  setSelId]  = useState(null);
  const [showNew,setNew]    = useState(false);
  const [draft,  setDraft]  = useState({ vendor:"", vendorType:"creator_mcn", campaign:"", scope:"", amount:"", paymentScheduleType:"single", deliveryDate:"", notes:"" });

  const outbound = direction === "outbound";
  const source   = outbound ? pos : clientPOs;

  // One ledger per PO, computed from the documents that bill against it.
  // `candidates` are the campaign's creator costs that aren't yet billed
  // against any PO — the missing link that left every vendor PO reading "open"
  // forever. Expenses have always carried a `poId`; nothing ever populated it,
  // so `billedAgainstPO` summed an empty set no matter how much had been
  // committed. Attaching is explicit rather than automatic: which costs a PO
  // covers is a decision, and guessing it would fabricate a ledger.
  const rows = useMemo(() => (source || []).map(po => {
    const docs = outbound
      ? (expenses || []).filter(e => e.poId === po.id)
      : (invoices || []).filter(i => i.clientPO?.id === po.id && i.type !== "credit_note");
    const candidates = outbound && po.campaign
      ? (expenses || []).filter(e => e.campaign === po.campaign && !e.poId
          && e.cat === "external_creator" && !["cancelled","rejected"].includes(e.status))
      : [];
    const billed = outbound ? billedAgainstPO(po.id, expenses) : invoicedAgainstPO(po.id, invoices);
    return { po, docs, candidates, led: poLedger(po, billed) };
  }), [source, outbound, expenses, invoices]);

  const filtered = useMemo(() => rows.filter(({ po, led }) => {
    if (filter === "pending_approval") return outbound && approvalOf(po) === "pending_approval";
    if (filter === "open")             return ["open","partially_billed"].includes(led.fulfilment);
    if (filter === "closed")           return ["fully_billed","closed"].includes(led.fulfilment);
    return true;
  }), [rows, filter, outbound]);

  const sel = rows.find(r => r.po.id === selId) || null;

  // Totals across whatever is on screen — the number a finance lead opens this
  // tab for: how much is committed, and how much of it is still unbilled.
  const totals = useMemo(() => filtered.reduce((t, { led }) => ({
    value: t.value + led.value, billed: t.billed + led.billed, balance: t.balance + led.balance,
  }), { value:0, billed:0, balance:0 }), [filtered]);

  const patchPO = (id, obj) => (outbound ? setPos : setClientPOs)(p => p.map(o => o.id !== id ? o : { ...o, ...obj }));
  const handleApprove = id => patchPO(id, { status:"approved", approvedBy:currentUser?.name || "founder", approvedAt:todayStr() });
  const handleReject  = id => patchPO(id, { status:"rejected", approvedBy:currentUser?.name || "founder", approvedAt:todayStr() });
  const handleClose   = id => patchPO(id, { closed:true,  closedAt:todayStr() });
  const handleReopen  = id => patchPO(id, { closed:false, closedAt:null });
  const handleSetValue = (id, current) => {
    const raw = window.prompt("PO value (₹) — the total this PO authorises:", String(current || 0));
    if (raw === null) return;
    const amount = parseFloat(String(raw).replace(/[^\d.]/g, "")) || 0;
    if (amount > 0) patchPO(id, { amount });
  };
  // Inbound only — see PODetail. Also clears the review flag the repair script
  // sets, so a corrected PO stops being listed as needing attention.
  // Bills a creator cost against this PO. One PATCH per expense — the ledger
  // recomputes from the expenses themselves, so nothing is stored on the PO.
  const handleBill = (poId, expenseId) =>
    setExpenses(p => p.map(e => e.id !== expenseId ? e : { ...e, poId }));
  const handleUnbill = expenseId =>
    setExpenses(p => p.map(e => e.id !== expenseId ? e : { ...e, poId:null }));

  const handleSetNumber = (id, current) => {
    const raw = window.prompt("Client PO number — the reference on the client's own PO:", current || "");
    if (raw === null) return;
    const poNumber = raw.trim();
    if (poNumber) patchPO(id, { poNumber, needsReview:false, reviewNote:null });
  };

  const submitNew = () => {
    const camp = campsRef.find(c => c.id === draft.campaign) || {};
    // raisedBy = the logged-in user's teamId (the same t-id campaigns use for
    // amId/cmId/eaId), raisedByName = their real name — not just a role label.
    const n = { ...draft, id:newId("PO"), raisedBy:currentUser?.teamId || role, raisedByRole:role,
      raisedByName:currentUser?.name || ROLES.find(r => r.id === role)?.label || role,
      campaign:draft.campaign || null, campaignName:camp.name || "", brandId:camp.brandId || null,
      status:"pending_approval", closed:false, poDocument:null, approvedBy:null, approvedAt:null,
      createdAt:todayStr(), amount:parseFloat(draft.amount) || 0, deliveryDate:prettyDate(draft.deliveryDate) };
    setPos(p => [n, ...p]);
    setSelId(n.id);
    setNew(false);
    setDraft({ vendor:"", vendorType:"creator_mcn", campaign:"", scope:"", amount:"", paymentScheduleType:"single", deliveryDate:"", notes:"" });
  };

  const ud = (k, v) => setDraft(prev => ({ ...prev, [k]:v }));
  const switchDir = d => { setDirection(d); setSelId(null); setNew(false); setFilter("all"); };

  const FILTERS = outbound
    ? [["all","All"],["pending_approval","⚑ Approval"],["open","Open"],["closed","Settled"]]
    : [["all","All"],["open","Open"],["closed","Settled"]];

  return (
    <div style={{ display:"flex", height:"100%" }}>
      <div style={{ width:320, flexShrink:0, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"10px 12px 8px", borderBottom:`1px solid ${T.border}` }}>
          <div style={{ display:"flex", gap:2, padding:2, borderRadius:7, background:T.mute, marginBottom:8 }}>
            {[["outbound","To vendors"],["inbound","From clients"]].map(([id, lbl]) => (
              <button key={id} onClick={() => switchDir(id)} style={{ flex:1, padding:"5px 8px", borderRadius:5, fontSize:10, fontWeight:600, cursor:"pointer", border:"none", fontFamily:"'Sora'",
                background:direction === id ? T.surface : "transparent", color:direction === id ? T.text : T.sub,
                boxShadow:direction === id ? "0 1px 2px rgba(0,0,0,0.08)" : "none" }}>{lbl}</button>
            ))}
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <span style={{ flex:1, fontSize:10, color:T.sub }}>
              {filtered.length} PO{filtered.length === 1 ? "" : "s"} · {isAccounts(role) ? fmtINR(totals.balance) : "₹ ——"} unbilled
            </span>
            {outbound && canRaisePO(role) && <Btn variant="primary" style={{ fontSize:10 }} onClick={() => { setNew(true); setSelId(null); }}>+ New PO</Btn>}
          </div>
        </div>
        <div style={{ padding:"8px 10px", borderBottom:`1px solid ${T.border}`, display:"flex", gap:4 }}>
          {FILTERS.map(([id, lbl]) => (
            <button key={id} onClick={() => setFilter(id)} style={{ padding:"3px 8px", borderRadius:4, fontSize:9, background:filter === id ? `${T.accent}18` : "transparent", border:`1px solid ${filter === id ? T.accent : T.border}`, color:filter === id ? T.accent : T.sub, cursor:"pointer", fontFamily:"'Sora'" }}>{lbl}</button>
          ))}
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"8px" }}>
          {filtered.length === 0 && (
            <div style={{ padding:"24px 12px", textAlign:"center", fontSize:10.5, color:T.label, fontStyle:"italic" }}>
              {outbound ? "No purchase orders raised yet." : "No client POs recorded. Attach one from an invoice in the Income tab."}
            </div>
          )}
          {filtered.map(({ po, led }) => (
            <div key={po.id} onClick={() => { setSelId(po.id); setNew(false); }} style={{ padding:"10px 12px", borderRadius:6, cursor:"pointer", marginBottom:3, background:selId === po.id ? T.raised : "transparent", border:`1px solid ${selId === po.id ? T.borderMid : outbound && approvalOf(po) === "pending_approval" ? `${T.amber}30` : "transparent"}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3, gap:8 }}>
                <span style={{ fontSize:9, color:T.label, fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{outbound ? po.id : po.poNumber || po.id}</span>
                <span style={{ fontSize:8.5, fontWeight:600, color:FULFILMENT_COL[led.fulfilment], flexShrink:0 }}>{FULFILMENT_LABEL[led.fulfilment]}</span>
              </div>
              <div style={{ fontSize:11.5, fontWeight:500, color:T.text, marginBottom:2 }}>{outbound ? po.vendor : po.client}</div>
              <div style={{ fontSize:10, color:T.sub, marginBottom:5 }}>{po.campaignName || "—"}</div>
              <div style={{ height:3, background:T.mute, borderRadius:2, marginBottom:4 }}>
                <div style={{ height:3, borderRadius:2, background:led.balance < 0 ? T.red : FULFILMENT_COL[led.fulfilment], width:`${led.pct}%` }} />
              </div>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:9.5, color:T.label }}>{isAccounts(role) ? `${fmtINR(led.billed)} of ${fmtINR(led.value)}` : ""}</span>
                <span style={{ fontSize:11, fontWeight:600, color:led.balance < 0 ? T.red : T.text }}>{isAccounts(role) ? fmtINR(led.balance) : "₹ ——"} left</span>
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
              <div><Lbl style={{ display:"block", marginBottom:4 }}>Campaign</Lbl><select value={draft.campaign} onChange={e => ud("campaign", e.target.value)} style={{ ...INP }}><option value="">— None —</option>{campsRef.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div><Lbl style={{ display:"block", marginBottom:4 }}>Expected delivery</Lbl><DateInput value={draft.deliveryDate} onChange={v => ud("deliveryDate", v)} placeholder="Pick a date" style={{ ...INP }} /></div>
            </div>
            <div style={{ marginBottom:12 }}><Lbl style={{ display:"block", marginBottom:4 }}>Scope of work *</Lbl><textarea value={draft.scope} onChange={e => ud("scope", e.target.value)} rows={3} placeholder="Describe deliverables…" style={{ ...INP, resize:"vertical" }} /></div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
              <div>
                <Lbl style={{ display:"block", marginBottom:4 }}>Amount (₹) *</Lbl>
                <MoneyInput value={draft.amount} onChange={v => ud("amount", v)} placeholder="e.g. 85,000" style={{ ...INP }} />
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
          <PODetail po={sel?.po} led={sel?.led} docs={sel?.docs || []} candidates={sel?.candidates || []} direction={direction}
            onBill={handleBill} onUnbill={handleUnbill}
            role={role} canRaise={outbound && canRaisePO(role)}
            onApprove={handleApprove} onReject={handleReject} onClose={handleClose} onReopen={handleReopen} onSetValue={handleSetValue} onSetNumber={handleSetNumber} />
        )}
      </div>
    </div>
  );
}

// ── TAB: QUOTATIONS ───────────────────────────────────────────────────────────
// A quote's margin % is typed by whoever builds the quote — it is a proposal,
// not a campaign, so there is no creator budget to derive it from. That's why
// this doesn't go through calcMargin: the two are genuinely different questions
// ("what are we pitching" vs "what did this campaign actually leave us").
function QuoteMarginPreview({ lines, marginPct, agencyFeePct, agencyFeeType, isRetainerClient }) {
  const sub = lines.reduce((s, l) => s + (l.qty || 1) * (l.rate || 0), 0);
  if (!sub) return null;
  const m = quoteMargin(sub, marginPct, agencyFeePct, agencyFeeType, isRetainerClient);
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
  const m   = q ? quoteMargin(q.lines.reduce((s, l) => s + (l.qty||1)*(l.rate||0), 0), q.marginPct, q.agencyFeePct, q.agencyFeeType, q.isRetainerClient) : { margin:0, opsBudget:0, agencyFee:0, grossPct:0 };
  const autoQuotes = quotes.filter(x => x.isAutoGenerated && x.status === "pending_review");

  const simulateBriefLock = () => {
    const camp = campsRef[1] || campsRef[0];
    if (!camp) return;
    const newQ = { id:newId("QT-AUTO"), client:camp.client, brandId:camp.brandId || null, label:`${camp.name} — Auto-Generated Quote`, status:"pending_review", isAutoGenerated:true, campaignId:camp.id, createdDate:todayStr(), validTill:"", isRetainerClient:true, marginPct:35, agencyFeePct:0, agencyFeeType:"baked_in", lines:[{ desc:`Influencer Marketing — ${camp.name}`, sac:"998361", qty:1, rate:camp.budget, gstRate:18 }], notes:"Auto-generated on brief lock. Review and edit before sending." };
    setQuotes(p => [newQ, ...p]);
    setSelId(newQ.id);
  };

  const saveQuote = () => {
    const brandId = campsRef.find(c => c.client === draft.client)?.brandId || null;
    const newQ = { ...draft, id:newId("QT"), brandId, status:"draft", createdDate:todayStr(), isAutoGenerated:false, campaignId:null };
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
                <MoneyInput value={ln.rate} onChange={v => updateLine(i, "rate", parseFloat(v)||0)} placeholder="Rate" style={{ ...INP, fontSize:11 }} />
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
// The registry is derived, not stored. It used to read a `registry` collection
// via RegistryAPI.list() — the only call to that API anywhere in the codebase.
// There was no create, no update, no write path of any kind, so the collection
// was empty and this tab rendered nothing, permanently.
//
// Every field it wants already exists: identity and PAN/bank on the creator
// embedded in each campaign, money on the expenses those campaigns generate.
// Deriving it means it populates itself and can never drift from the campaigns
// it describes — the same reasoning that removed the stored campaign progress.
function buildRegistry(campsRef, expenses) {
  const byPayee = new Map();
  // Alias → row. Kept separate from byPayee so the registry still has exactly
  // one entry per person while an expense can be joined by any id it happens
  // to carry (see the alias loop below).
  const aliases = new Map();
  for (const camp of campsRef) {
    for (const cr of camp.creators || []) {
      // Locked only. A shortlisted creator has been considered, not engaged —
      // counting them here put "3 campaigns" next to ₹85,000 paid on one, in a
      // block headed Payment History.
      if (!cr?.name || cr.status !== "locked") continue;
      // Keyed on handle (falling back to name) — the same key the creators
      // directory uses on the backend, see creatorSync.keyOf. Keying on the
      // display name alone merged two different creators who happen to share
      // one into a single registry row, pooling their campaigns, their money
      // and — because the first one seen wins — one of their PAN/bank details.
      const key = creatorKeyOf(cr);
      if (!key) continue;
      if (!byPayee.has(key)) {
        const pd = cr.personalDetails || {};
        byPayee.set(key, {
          id: `REG-${key.replace(/[^a-z0-9]+/gi, "_")}`, type:"creator", name: cr.name,
          handle: cr.handle || "", platform: cr.platform || "", followers: Number(cr.followers) || 0,
          pan: pd.pan || null, panCollected: !!pd.pan,
          bank: pd.bankAccount ? `${pd.bankName || "Bank"} ····${String(pd.bankAccount).slice(-4)}` : (cr.payType === "vendor" ? `Vendor ${cr.payId || ""}`.trim() : null),
          gstin: pd.gstin || null,
          // TDS 194J at 10% on professional fees is the standing treatment for
          // creator work; without a PAN on file it is 20% under s.206AA.
          tdsSection: "194J", tdsRate: pd.pan ? 10 : 20,
          mcnVendor: cr.payType === "vendor" ? (cr.payId || "MCN") : null,
          campaigns: [], totalPaid: 0, totalCommitted: 0, tdsDeducted: 0,
        });
      }
      const r = byPayee.get(key);
      if (!r.campaigns.includes(camp.name)) r.campaigns.push(camp.name);
      // Every id an expense might carry for this person, all pointing at the
      // one row. Three vintages exist in the data and all of them must join:
      //   @handle          — what syncCreatorExpenses writes now
      //   cr_<ts>_<rand>   — the per-campaign `_id` earlier code wrote, which
      //                      is why those rows were orphaned and their money
      //                      silently missing from the registry
      //   the payee name   — seeded/hand-entered rows with no creatorId at all
      for (const alias of [key, cr._id, creatorKeyOf({ name: cr.name })]) {
        if (alias && !aliases.has(alias)) aliases.set(alias, r);
      }
    }
  }
  for (const e of expenses) {
    if (e.cat !== "external_creator") continue;
    const r = aliases.get(e.creatorId) || aliases.get(creatorKeyOf({ name: e.payee }));
    if (!r) continue;
    if (["cancelled","rejected"].includes(e.status)) continue;
    r.totalCommitted += e.amount || 0;
    if (e.status === "paid") r.totalPaid += e.amount || 0;
  }
  for (const r of byPayee.values()) r.tdsDeducted = Math.round(r.totalPaid * (r.tdsRate / 100));
  return [...byPayee.values()].sort((a, b) => b.totalCommitted - a.totalCommitted);
}

function TabRegistry({ role, campsRef, expenses }) {
  const [type, setType] = useState("all");
  const [selId,setSelId]= useState(null);
  const registry = useMemo(() => buildRegistry(campsRef, expenses), [campsRef, expenses]);
  const filtered = registry.filter(r => type === "all" || r.type === type);
  const r = registry.find(x => x.id === selId) || null;

  return (
    <div style={{ display:"flex", height:"100%" }}>
      <div style={{ width:280, flexShrink:0, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"10px 12px", borderBottom:`1px solid ${T.border}`, display:"flex", gap:6 }}>
          {/* A "Vendors" filter used to sit alongside these. Vendors only exist
              as free-text names on outbound POs — there is no vendor record to
              derive a registry entry from, so the tab was always empty. */}
          {[["all","All"],["creator","Creators"]].map(([id, lbl]) => (
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
                {x.followers    && <span style={{ fontSize:8, color:T.sub, border:`1px solid ${T.border}`, borderRadius:3, padding:"1px 4px" }}>{fmtCompact(x.followers)}</span>}
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
                <div style={{ fontSize:10, color:T.sub, marginTop:2 }}>{r.handle || ""}{r.platform ? ` · ${r.platform}` : ""}{r.followers ? ` · ${fmtCompact(r.followers)} followers` : ""}</div>
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
                {[["Committed", showAmt(r.totalCommitted, role)], ["Total paid", showAmt(r.totalPaid, role)], ["TDS deducted", showAmt(r.tdsDeducted, role)], ["Net paid", showAmt((r.totalPaid||0)-(r.tdsDeducted||0), role)], ["Campaigns", r.campaigns.length]].map(([l, v]) => (
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

// ── TAB: CAMPAIGN P&L (Founder — full; PCM — their event, no director pay) ──
function TabCampaignPL({ role, expenses, setExpenses, invoices, campsRef }) {
  const [selC, setSelC] = useState(null);

  if (!can(role, "seeCampaignPL")) {
    return (
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:10 }}>
        <div style={{ fontSize:32, color:T.mute }}>◉</div>
        <div style={{ fontSize:13, color:T.sub }}>Campaign P&L — Founder / PCM access only</div>
      </div>
    );
  }

  const camp = campsRef.find(c => c.id === selC) || campsRef[0];
  if (!camp) return <div style={{padding:40,color:T.sub,fontSize:12}}>No campaigns yet.</div>;
  const m = calcMargin(camp.budget, camp.creatorBudget);

  // Live expenses for this campaign, split by where they are in their life.
  // `committed` is what the campaign has already obligated us to — a locked
  // creator is money owed the moment they're locked, not the day it's paid.
  const live         = expenses.filter(e => e.campaign === camp.id && !["cancelled","rejected"].includes(e.status));
  const sum          = arr => arr.reduce((s, e) => s + (e.amount || 0), 0);
  const creatorSpend = sum(live.filter(e => e.cat === "external_creator"));
  const vendorSpend  = sum(live.filter(e => e.cat === "external_vendor"));
  const committed    = creatorSpend + vendorSpend;
  const settled      = sum(live.filter(e => e.status === "paid"));
  const remaining    = m.opsBudget - committed;
  const campInvoiced = sum(invoices.filter(i => i.campaign === camp.id && i.type !== "credit_note"));
  const campReceived = invoices.filter(i => i.campaign === camp.id && i.type !== "credit_note").reduce((s, i) => s + receivedOf(i), 0);
  // Creator costs awaiting payment — the one place Accounts can settle them.
  const payables     = live.filter(e => e.cat === "external_creator" && e.status !== "paid");
  const markPaid     = id => setExpenses(p => p.map(e => e.id !== id ? e : { ...e, status:"paid", date:todayStr() }));

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
          {/* Where the campaign actually stands. Billing reads this; it never
              writes it — the pipeline is owned by the campaign. */}
          <span style={{ marginLeft:6, fontSize:10, color:T.sub, border:`1px solid ${T.border}`, borderRadius:3, padding:"1px 5px", fontFamily:"'Sora'", fontStyle:"normal", verticalAlign:"middle" }}>
            {stageLabel(camp.stage)}
          </span>
        </div>
        {/* Event selector — campsRef arrives pre-scoped from the root
            (non-founder/accounts users only get campaigns where their teamId
            is createdBy/amId/cmId/eaId), so a PCM only ever sees their own
            events here. */}
        <select value={camp.id} onChange={e => setSelC(e.target.value)} style={{ ...INP, width:"auto" }}>
          {campsRef.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
        <div style={{ background:T.raised, border:`1px solid ${T.amber}22`, borderRadius:7, padding:"14px" }}>
          <Lbl color={T.amber} style={{ display:"block", marginBottom:4 }}>Commercials</Lbl>
          {/* Read-only on purpose. The margin used to be an editable % that
              overrode a field the campaign never had; it is now the split the
              brief actually agreed, so it changes on the campaign or not at all. */}
          <div style={{ fontSize:9.5, color:T.label, marginBottom:10 }}>Derived from the brief — edit the creator budget on the campaign to change this.</div>
          {[["Client budget", fmtFull(camp.budget), T.text], ["Creator pool (ops budget)", fmtFull(m.opsBudget), T.teal], ["Agency fee (stays with us)", fmtFull(m.agencyFee), T.accent], ["Gross margin %", fmtPct(m.grossPct), m.grossPct >= 30 ? T.green : T.red], ["Invoiced to client", fmtFull(campInvoiced), T.text], ["Received", fmtFull(campReceived), campReceived >= campInvoiced && campInvoiced > 0 ? T.green : T.amber]].map(([l, v, c]) => (
            <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${T.border}` }}>
              <span style={{ fontSize:11, color:T.sub }}>{l}</span>
              <span style={{ fontSize:11.5, fontWeight:500, color:c }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ background:T.raised, border:`1px solid ${T.border}`, borderRadius:7, padding:"14px" }}>
          <Lbl style={{ display:"block", marginBottom:4 }}>Creator Pool vs. Actuals</Lbl>
          <div style={{ fontSize:9.5, color:T.label, marginBottom:10 }}>Committed = locked creators. Settled = actually paid out.</div>
          {[
            ["Creator pool available", m.opsBudget, null],
            ["Creator cost committed", creatorSpend, m.opsBudget],
            ["Vendor cost committed", vendorSpend, m.opsBudget],
            ["Total committed", committed, m.opsBudget],
            ["Settled (paid out)", settled, m.opsBudget],
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

      {/* Creator payables — the settlement step the books were missing.
          Expenses are written by the campaign the moment a creator is locked,
          so this list fills itself; paying one here is what finally moves
          "Settled" and the Tally export off zero. An "Advance Status" panel
          used to sit in this spot writing localStorage and claiming to unlock
          the campaign stage — the stage now says so itself, in the header. */}
      <div style={{ background:T.raised, border:`1px solid ${T.border}`, borderRadius:7, padding:"14px" }}>
        <Lbl style={{ display:"block", marginBottom:8 }}>Creator Payables — {camp.name}</Lbl>
        {payables.length === 0 ? (
          <div style={{ fontSize:11, color:T.sub, fontStyle:"italic" }}>
            {creatorSpend > 0 ? "All locked creators settled ✓" : "No creators locked yet — costs appear here as they're locked on the campaign."}
          </div>
        ) : payables.map(e => (
          <div key={e.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:`1px solid ${T.border}` }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11.5, fontWeight:500, color:T.text }}>{e.payee}</div>
              <div style={{ fontSize:9.5, color:T.sub }}>{e.note || "Creator fee"}{e.invoiceNo ? ` · Invoice ${e.invoiceNo}` : " · invoice not raised yet"}</div>
            </div>
            <span style={{ fontSize:11.5, fontWeight:500, color:T.text }}>{showAmt(e.amount, role)}</span>
            {/* Gated on createExpense (founder / pcm / accounts) rather than on
                a role list: everyone allowed to record a cost is allowed to
                settle one. Note that accounts cannot currently reach this tab
                at all — seeCampaignPL is founder+pcm — so today this only ever
                renders for those two. That's an RBAC policy question, not a
                code one; the gate is written so opening the tab up is enough. */}
            {can(role, "createExpense")
              ? <Btn variant="success" style={{ fontSize:10 }} onClick={() => markPaid(e.id)}>Mark paid</Btn>
              : <Pill status={e.status} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function InternalBilling() {
  const { user, brandFilter, brands } = useOutletContext() || {};
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
  const [campsRef,  setCampsRef]  = useState([]); // real campaigns from DB
  const [toast,     setToast]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(null);

  // ── Assignment scoping ─────────────────────────────────────────────────────
  // Founder and Accounts see company-wide billing; every other internal role
  // only sees billing tied to campaigns they're on — same rule as canSee() in
  // Campaigns (createdBy / amId / cmId / eaId === their teamId). Company-level
  // docs with no campaign link (retainers, payroll, subscriptions) stay
  // founder/accounts-only.
  const seesAll   = role === "founder" || role === "accounts";
  const myCamps   = seesAll ? campsRef : campsRef.filter(c => [c.createdBy, c.amId, c.cmId, c.eaId].includes(currentUser.teamId));
  const myCampIds = new Set(myCamps.map(c => c.id));
  const inScope   = d => seesAll || myCampIds.has(d.campaign || d.campaignId);
  const scopedInvoices  = seesAll ? invoices  : invoices.filter(inScope);
  const scopedExpenses  = seesAll ? expenses  : expenses.filter(inScope);
  const scopedPos       = seesAll ? pos       : pos.filter(inScope);
  const scopedClientPOs = seesAll ? clientPOs : clientPOs.filter(inScope);
  const scopedQuotes    = seesAll ? quotes    : quotes.filter(inScope);

  // ── Brand-filtered display slices ──────────────────────────────────────────
  // Read-only views. Setters (setInvoices, setExpenses…) still write to the
  // full arrays so DB sync is unaffected by the filter.
  // Docs are matched on their brandId FK when they have one, falling back to
  // the resolved `client` display name for legacy docs created before the
  // brandId backfill (scrap/migrate_billing_brands.js).
  const brandName        = brands?.find(b => b.id === brandFilter)?.name || null;
  const matchesBrand     = d => d.brandId ? d.brandId === brandFilter : d.client === brandName;
  const displayCampsRef  = brandFilter ? myCamps.filter(matchesBrand) : myCamps;
  const brandCampIds     = new Set(displayCampsRef.map(c => c.id));
  // Deleted campaigns are excluded from CampaignsAPI.list(), so any
  // campaign-linked invoice/client PO whose campaign is missing from campsRef
  // belongs to a deleted campaign — hide it (covers orphans left in the DB
  // before the delete-cascade in Campaigns existed).
  const liveCampIds      = new Set(campsRef.map(c => c.id));
  const hasLiveCampaign  = d => loading || !d.campaign || liveCampIds.has(d.campaign);
  const displayInvoices  = (brandFilter ? scopedInvoices.filter(matchesBrand) : scopedInvoices).filter(hasLiveCampaign);
  // Filtered by hasLiveCampaign like invoices and client POs. It wasn't, so a
  // creator expense whose campaign had been deleted kept inflating Committed
  // Spend and the derived registry forever — and the only thing preventing
  // that was the delete-cascade in Campaigns, which is inside a bare
  // `catch{}`. One failed DELETE and the number was permanently wrong with no
  // screen that could even show you the row. Now the cascade is a tidy-up
  // rather than the thing correctness depends on.
  const displayExpenses  = (brandFilter ? scopedExpenses.filter(e => e.brandId ? e.brandId === brandFilter : (!e.campaign || brandCampIds.has(e.campaign))) : scopedExpenses).filter(hasLiveCampaign);
  // Vendor POs get the same treatment, and for the same reason: they were the
  // last collection Billing showed unfiltered, so a PO raised against a
  // since-deleted campaign stayed in To Vendors — in the pending-approval
  // count, and offering to bill expenses that no longer exist.
  const displayPos       = (brandFilter ? scopedPos.filter(p => p.brandId ? p.brandId === brandFilter : (!p.campaign || brandCampIds.has(p.campaign))) : scopedPos).filter(hasLiveCampaign);
  const displayClientPOs = (brandFilter ? scopedClientPOs.filter(matchesBrand) : scopedClientPOs).filter(hasLiveCampaign);
  // Quotes key on `campaignId`, so hasLiveCampaign (which reads `campaign`)
  // would pass every one of them through — it needs the other field name.
  const displayQuotes    = (brandFilter ? scopedQuotes.filter(matchesBrand) : scopedQuotes)
    .filter(q => loading || !q.campaignId || liveCampIds.has(q.campaignId));

  const showToast = useCallback(msg => { setToast(msg); setTimeout(() => setToast(null), 2500); }, []);

  // Each item in these arrays is a full object (no nested merges from
  // children), so on every setState we diff against the previous list and
  // PATCH/POST whichever ids changed or are new. Keeps every child
  // component (TabIncome, TabPurchaseOrders, etc.) completely unchanged —
  // they just call setInvoices(prev => ...) like before.
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

  // These refs mirror the latest list so a setter can resolve `next` OUTSIDE
  // the state updater.
  //
  // React state updaters must be pure. These setters used to call
  // syncCollection() from inside setXxxRaw(prev => ...), and because <App/>
  // renders inside <React.StrictMode> (main.jsx), React deliberately
  // double-invokes updaters in development. Every create therefore fired the
  // SAME POST twice in the same millisecond — which is exactly the duplicate
  // _id that crashed the backend (E11000 on client_pos: "CPO-1785781224336").
  // Every edit likewise fired two PATCHes.
  //
  // Writing the ref synchronously (rather than syncing it in an effect) keeps
  // consecutive setter calls in one tick chaining off each other correctly.
  const invoicesRef = useRef([]), expensesRef = useRef([]), quotesRef = useRef([]);
  const posRef = useRef([]), clientPOsRef = useRef([]);
  const makeSetter = useCallback((ref, setRaw, api) => (updater) => {
    const prev = ref.current;
    const next = typeof updater === "function" ? updater(prev) : updater;
    ref.current = next;
    syncCollection(prev, next, api);
    setRaw(next);
  }, [syncCollection]);

  const setInvoices  = useMemo(() => makeSetter(invoicesRef,  setInvoicesRaw,  InvoicesAPI),        [makeSetter]);
  const setExpenses  = useMemo(() => makeSetter(expensesRef,  setExpensesRaw,  ExpensesAPI),        [makeSetter]);
  const setQuotes    = useMemo(() => makeSetter(quotesRef,    setQuotesRaw,    QuotesAPI),          [makeSetter]);
  const setPos       = useMemo(() => makeSetter(posRef,       setPosRaw,       PurchaseOrdersAPI),  [makeSetter]);
  const setClientPOs = useMemo(() => makeSetter(clientPOsRef, setClientPOsRaw, ClientPOsAPI),       [makeSetter]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([InvoicesAPI.list(), ExpensesAPI.list(), QuotesAPI.list(), PurchaseOrdersAPI.list(), ClientPOsAPI.list(), CampaignsAPI.list()])
      .then(([inv, exp, qts, posList, cpos, camps]) => {
        if (cancelled) return;
        // Seed both the state and the mirror refs the setters diff against —
        // a ref left at [] would make the next edit look like a create and
        // re-POST every row.
        setInvoicesRaw(invoicesRef.current   = inv);
        setExpensesRaw(expensesRef.current   = exp);
        setQuotesRaw(quotesRef.current       = qts);
        setPosRaw(posRef.current             = posList);
        setClientPOsRaw(clientPOsRef.current = cpos);
        // Map real campaigns into the billing reference shape
        setCampsRef(camps.map(c => ({
          id: c.id,
          name: c.name,
          client: c.client,
          brandId: c.brandId || null,
          budget: c.budget || 0,
          creatorBudget: creatorBudgetOf(c),
          // Normalised on the way in, so a legacy 16-stage id can never reach
          // a label or a filter here. Billing reads the stage; it never writes it.
          stage: normStage(c.stage),
          // assignment slots — drive the per-user billing scope below
          createdBy: c.createdBy || null,
          amId: c.amId || null,
          cmId: c.cmId || null,
          eaId: c.eaId || null,
          // Embedded creators drive the derived Registry and the committed
          // creator cost on the P&L — both were previously reading collections
          // nothing writes to.
          creators: c.creators || [],
        })));
        setLoading(false);
      })
      .catch(err => { if (!cancelled) { setLoadError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  // An effect used to sit here that read `billing_auto_quotes_pending` from
  // localStorage and turned it into a quote "on brief lock". Nothing in the
  // codebase has ever written that key — brief sign-off was supposed to set it
  // and doesn't — so the effect could never fire. It is gone rather than
  // wired up: auto-generating a quote from a campaign is a decision for the
  // Quotations rework, not something to switch on silently.

  const anomalies = useMemo(() => detectAnomalies(displayExpenses), [displayExpenses]);

  const overdueCount     = displayInvoices.filter(isOverdue).length;
  const pendingPOs       = displayPos.filter(p => p.status === "pending_approval").length;
  const autoQuotesPending= displayQuotes.filter(q => q.isAutoGenerated && q.status === "pending_review").length;
  const noPOInvoices     = displayInvoices.filter(i => !i.clientPO && i.type === "campaign").length;

  // Per spec: CM and EA must not see any financial billing data.
  // AM gets read-only access to campaign budget info only.
  const hasFullBilling = can(role, "seeRevenue");       // founder + pcm
  const hasOpsBilling  = can(role, "seeCampaignBudgetInBilling"); // + am + accounts

  // Spending and GST were removed pending a rework — neither modelled its
  // domain correctly (Spending had no link from an expense back to the PO that
  // authorised it; GST ran off a hardcoded filing calendar). The `expenses`
  // collection is deliberately still loaded and synced: Campaign P&L reads it
  // for creator/vendor spend and the director's remuneration block.
  const TABS = [
    { id:"dashboard",       lbl:"Dashboard",    badge:null,                                          show: hasOpsBilling },
    { id:"income",          lbl:"Income",        badge:overdueCount + noPOInvoices || null, col:overdueCount > 0 ? T.red : T.amber, show: hasFullBilling },
    { id:"purchase_orders", lbl:"POs",           badge:pendingPOs || null, col:T.amber,            show: hasFullBilling },
    { id:"quotations",      lbl:"Quotations",    badge:autoQuotesPending || null, col:T.teal,       show: hasFullBilling },
    { id:"registry",        lbl:"Registry",      badge:null,                                          show: can(role, "seeRegistry") },
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
              5th Avenue · FY {FY}
            </div>
          </div>
          <div style={{ flex:1 }} />
          {/* Quick stats */}
          <div style={{ display:"flex", gap:20, marginRight:8 }}>
            {[
              // Billed minus received, so a settled 50% advance actually moves
              // this number instead of the invoice reading fully outstanding
              // until its final leg lands.
              { l:"Outstanding", v:fmtINR(displayInvoices.filter(i => i.type !== "credit_note").reduce((s,i)=>s+Math.max(0,(i.amount||0)-receivedOf(i)),0)), c:overdueCount > 0 ? T.red : "#1D1D1F" },
              // These two used to read `pendingApproval` (expense approvals) and
              // `anomalies` (expense outliers). Both were Spending-tab concepts
              // with no input path left, so they now track what Billing actually
              // owns: PO sign-off and campaign invoices raised without a client PO.
              { l:"POs to approve", v:pendingPOs, c:pendingPOs > 0 ? T.amber : "#6E6E73" },
              { l:"Invoices w/o PO", v:noPOInvoices, c:noPOInvoices > 0 ? T.amber : "#6E6E73" },
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
        {tab === "dashboard"      && <TabDashboard      role={role} invoices={displayInvoices} expenses={displayExpenses} setTab={setTab} anomalies={anomalies} pos={displayPos} campsRef={displayCampsRef} />}
        {tab === "income"         && <TabIncome         role={role} invoices={displayInvoices} setInvoices={setInvoices} setClientPOs={setClientPOs} campsRef={displayCampsRef} />}
        {tab === "purchase_orders"&& <TabPurchaseOrders role={role} currentUser={currentUser} pos={displayPos} setPos={setPos} setExpenses={setExpenses} clientPOs={displayClientPOs} setClientPOs={setClientPOs} invoices={displayInvoices} expenses={displayExpenses} campsRef={displayCampsRef} />}
        {tab === "quotations"     && <TabQuotations     role={role} quotes={displayQuotes} setQuotes={setQuotes} campsRef={displayCampsRef} />}
        {tab === "registry"       && <TabRegistry       role={role} campsRef={displayCampsRef} expenses={displayExpenses} />}
        {tab === "campaign_pl"    && <TabCampaignPL     role={role} expenses={displayExpenses} setExpenses={setExpenses} invoices={displayInvoices} campsRef={displayCampsRef} />}
      </div>

    </div>
  );
}