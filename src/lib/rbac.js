/**
 * 5th Avenue — RBAC Permission Map
 * Single source of truth. Import { PERMS, can } everywhere.
 *
 * Principle of least privilege:
 * - Founder: everything
 * - PCM: own campaigns only, full financials for those
 * - CM: operational only, no financials anywhere
 * - AM: own brands/campaigns, execution budget only (no revenue/margins/GST/TDS)
 * - EA: assigned campaigns only, no financials
 */

export const PERMS = {
  // ── Who can see what in the campaign list / cards ──────────────────────────
  seeCampaignBudget:  ["founder", "pcm", "accounts_head", "accounts_exec"],
  seeCreatorFees:     ["founder", "pcm", "accounts_head", "accounts_exec"],
  seeMargins:         ["founder"],
  seeAgencyFee:       ["founder"],
  createCampaign:     ["founder", "pcm", "cm", "am"],
  deleteCampaign:     ["founder"],
  // Creator/influencer records are retained: any campaign role can edit
  // details, but only the founder can remove a creator (the underlying
  // record is only ever deleted from the founder's Auth side).
  editCreatorDetails: ["founder", "pcm", "cm", "am", "ea"],   // full Edit modal on the creators table
  removeCreator:      ["founder"],
  editInfluencer:     ["founder"],   // edit from the Influencers directory
  assignUsers:        ["founder", "pcm", "cm", "am"],

  // ── Billing tab: which financial widgets to show ───────────────────────────
  // Founder: all. PCM: own-campaign scoped (filtered in component).
  // CM/AM/EA: none.
  seeRevenue:         ["founder", "pcm"],
  seeOutstanding:     ["founder", "pcm"],
  seeTotalSpend:      ["founder", "pcm"],
  seeNetMTD:          ["founder", "pcm"],
  seeGST:             ["founder", "pcm"],
  seeTDS:             ["founder", "pcm"],
  seeReceivables:     ["founder", "pcm"],
  seeProfitMargin:    ["founder"],           // PCM sees their own P&L but not company-wide margin
  seeDirectorComp:    ["founder"],
  seeFinancialReports:["founder", "pcm"],

  // Operational billing (visible to AM in read-only — campaign budget only)
  seeCampaignBudgetInBilling: ["founder", "pcm", "am", "accounts_head", "accounts_exec"],

  // ── Billing: action permissions ────────────────────────────────────────────
  approveInvoice:    ["founder"],
  approveExpense:    ["founder"],
  approvePO:         ["founder"],
  createInvoice:     ["founder", "pcm", "accounts_head", "accounts_exec"],
  createExpense:     ["founder", "pcm", "accounts_head", "accounts_exec"],
  createPO:          ["founder", "pcm", "accounts_head", "accounts_exec"],
  sendQuote:         ["founder", "pcm"],
  seeRegistry:       ["founder", "pcm", "accounts_head", "accounts_exec"],
  seeCampaignPL:     ["founder", "pcm"],

  // ── Founder-only pages ──────────────────────────────────────────────────────
  seeInfluencers:    ["founder"],   // Influencers directory (all creators + invoices)
  manageAuth:        ["founder"],   // Auth page: view/add/edit/soft-delete credentials
};

/**
 * can(role, permission) → boolean
 * Usage: can(user.role, "seeRevenue")
 */
export function can(role, permission) {
  if (!PERMS[permission]) return false;
  return PERMS[permission].includes(role);
}

/**
 * canAny(role, permissions[]) → boolean
 */
export function canAny(role, permissions) {
  return permissions.some(p => can(role, p));
}