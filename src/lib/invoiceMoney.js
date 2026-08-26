/**
 * What an invoice is actually worth, in money terms.
 *
 * These two rules used to live inside pages/Billing — which was fine while
 * Billing was the only page that reported on invoices. The Founder Summary
 * now reports the same figures on its own page, and a second hand-rolled copy
 * of "what counts as collected" is exactly how the Summary and Billing would
 * come to quote different revenue for the same month.
 *
 * Billing imports these; nothing here is new logic.
 */
import { ISO_DATE, todayISO } from "./format";

// Money actually in the bank against an invoice. An invoice confirmed paid in
// full is the whole amount; otherwise it's whichever schedule legs have been
// settled — which is how a campaign's 50% advance shows up as received while
// the invoice itself correctly stays outstanding for the balance.
export const receivedOf = inv => {
  if (inv?.status === "paid") return inv.amount || 0;
  const s = inv?.schedule;
  if (!s) return 0;
  return ["advance", "final"].reduce((t, k) => t + (s[k]?.status === "paid" ? (s[k].amount || 0) : 0), 0);
};

// Every schedule leg marked settled, for the moment an invoice is paid in full.
// Legs already paid keep their own paidDate and UTR — this closes what is
// outstanding, it does not restate what was already banked.
//
// Written here rather than at the call site because "which legs count as
// received" is receivedOf's rule above, and the two have to move together: a
// paid invoice whose legs still read pending is the same fact recorded two
// ways, and the screens that render legs (Billing's InvDetail) show the stale
// half.
export const settleSchedule = (schedule, paidDate) => {
  if (!schedule) return schedule;
  const next = { ...schedule };
  for (const leg of ["advance", "final"]) {
    const s = next[leg];
    if (s && s.status !== "paid") next[leg] = { ...s, status: "paid", paidDate };
  }
  return next;
};

// The payment schedule as it should READ for a given invoice. An invoice paid
// in full has no outstanding legs by definition — that is already receivedOf's
// rule above — so this closes the gap on records written before payment_done
// settled every leg, without a migration and without a screen ever
// contradicting the invoice header it sits under.
export const scheduleOf = inv =>
  inv?.status === "paid" ? settleSchedule(inv.schedule, inv.paidDate || null) : inv?.schedule;

// Overdue is DERIVED, never stored — nothing in the app ever sets
// `status:"overdue"`.
//
// Only ISO dates count. "TBD" and the localised strings older Billing-created
// invoices carry mean "no due date agreed" — which is not the same as "not yet
// due", and must not be reported as either.
export const isOverdue = inv => {
  if (!inv || inv.type === "credit_note" || inv.status === "paid") return false;
  if (!ISO_DATE.test(inv.dueDate || "")) return false;
  return inv.dueDate < todayISO() && receivedOf(inv) < (inv.amount || 0);
};

// A credit note reverses revenue rather than adding to it, so every "what did
// we bill" total excludes them.
export const isRevenueInvoice = inv => inv?.type !== "credit_note";

// Face value billed, money received, and the unpaid balance that is past its
// agreed due date — the three numbers every revenue panel is built from.
export function invoiceTotals(invoices) {
  const revenue = (invoices || []).filter(isRevenueInvoice);
  const billed = revenue.reduce((s, i) => s + (i.amount || 0), 0);
  const collected = revenue.reduce((s, i) => s + receivedOf(i), 0);
  const overdue = revenue
    .filter(isOverdue)
    .reduce((s, i) => s + Math.max(0, (i.amount || 0) - receivedOf(i)), 0);
  return { billed, collected, outstanding: Math.max(0, billed - collected), overdue };
}
