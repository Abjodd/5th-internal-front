/**
 * 5th Avenue — RBAC Permission Map
 * Single source of truth. Import { PERMS, can } everywhere.
 *
 * Principle of least privilege:
 * - Founder: everything
 * - PCM: own campaigns only, full financials for those
 * - CM: operational only — creator-side money only, no revenue/margins
 * - AM: own brands/campaigns, execution budget only (no revenue/margins/GST/TDS)
 * - EA: assigned campaigns only — creator-side money only
 */

export const PERMS = {
  // ── Who can see what in the campaign list / cards ──────────────────────────
  seeCampaignBudget:  ["founder", "pcm", "accounts_head", "accounts_exec"],
  // Creator-side money — the creator budget pot and the per-creator fees drawn
  // against it. This is execution data, not commercial data: CM/AM/EA shortlist
  // and negotiate creators, so they have to know what's left to spend. It stays
  // separate from seeCampaignBudget (client-facing total) and seeMargins, so
  // these roles still never see what the agency keeps.
  seeCreatorFees:     ["founder", "pcm", "cm", "am", "ea", "accounts_head", "accounts_exec"],
  seeMargins:         ["founder"],
  seeAgencyFee:       ["founder"],
  createCampaign:     ["founder", "pcm", "cm", "am"],
  deleteCampaign:     ["founder"],
  // Pushing a campaign's end date out is a commercial decision (it moves the
  // delivery commitment), so it sits with the roles that own the schedule —
  // not with CM/EA, who execute against whatever dates they're given.
  extendCampaignEnd:  ["founder", "pcm", "am"],
  // Creator records are retained: any campaign role can edit
  // details, but only the founder can remove a creator (the underlying
  // record is only ever deleted from the founder's Auth side).
  editCreatorDetails: ["founder", "pcm", "cm", "am", "ea"],   // full Edit modal on the creators table
  removeCreator:      ["founder"],
  editCreator:        ["founder"],   // edit from the Creators directory
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
  seeCreators:        ["founder"],  // Creators directory (all creators + invoices)
  manageAuth:         ["founder"],  // Auth page: view/add/edit/soft-delete credentials
  // Requests inbox — one permission per tab rather than one for the section,
  // so the two inboxes can be opened to different roles later without
  // reworking the page (it renders only the tabs the role can see).
  seeClientRequests:  ["founder"],  // brand signups from "Start a project"
  seeCreatorRequests: ["founder"],  // creator applications from "Apply as a creator"
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