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
  // The client-facing total. Deliberately narrower than seeCreatorFees below:
  // knowing the campaign sold for ₹12.5L while the creator pot is ₹7.5L is the
  // margin, so it stays with the two roles that own commercials. Accounts sees
  // the total in Billing (seeCampaignBudgetInBilling) where it is the invoice
  // amount, not on the campaign where it sits next to creator cost.
  seeCampaignBudget:  ["founder", "pcm"],
  // Creator-side money — the creator budget pot and the per-creator fees drawn
  // against it. This is execution data, not commercial data: CM/AM/EA shortlist
  // and negotiate creators, so they have to know what's left to spend. It stays
  // separate from seeCampaignBudget (client-facing total) and seeMargins, so
  // these roles still never see what the agency keeps.
  seeCreatorFees:     ["founder", "pcm", "cm", "am", "ea", "accounts_head", "accounts_exec"],
  // The FINANCE rail on a campaign's pipeline — PO Raised → Advance Received →
  // Invoice Raised → Payment Done. Deliberately wider than seeCampaignBudget:
  // these are STEPS, not amounts. AM chases the client's PO and Accounts
  // settles the invoice, so both need to see where the money has got to
  // without seeing what it is.
  //
  // CM and EA execute against a brief that is already funded, and none of the
  // four steps is theirs to take — the rail was four dead-end nodes. They get
  // the execution track alone, drawn as one straight line with no fork.
  seeFinanceTrack:    ["founder", "pcm", "am", "accounts_head", "accounts_exec"],
  seeMargins:         ["founder"],
  // The fee charged ON TOP of a campaign's budget — a commercial term the
  // client is quoted and can see on their own portal, not an internal split.
  // That is what separates it from seeMargins directly above, which is the
  // slice of the budget we keep and stays founder-only: PCM negotiates the fee
  // with the brand, so they set it on the campaign; what is left of the budget
  // after the creator pool is still none of their business.
  seeAgencyFee:       ["founder", "pcm"],
  // CHANGING it after the campaign is raised, which is a different act from
  // agreeing it in the first place. Setting the fee is part of pricing a new
  // campaign, and PCM prices campaigns. Editing it later re-prices something
  // the client has already been quoted — and because the fee is charged on top,
  // it moves the campaign's total, which is what the PO and the invoice are
  // both drawn from. That is the same shape as overrideLockedCost below:
  // founder only, and every use lands on the timeline.
  editAgencyFee:      ["founder"],
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
  // Raising a creator's GST invoice and pulling the PDF back down. Split out
  // of seeCampaignBudget, which is a REVENUE permission (founder/pcm) and was
  // gating this only because both happened to sit on the same table: EAs run
  // the creator side of a campaign and are the ones who actually chase and
  // issue these, so they could see the fee they were invoicing but not the
  // button that invoiced it. Deliberately narrower than seeCreatorFees —
  // issuing a document on the agency's behalf is not the same as reading a
  // number — and it carries the pay-type field with it, since choosing how a
  // creator is paid is the first step of the same job.
  invoiceCreator:     ["founder", "pcm", "ea"],
  // Re-price a creator whose fee is already committed. Locking posts the fee to
  // Billing as an expense and freezes it for everyone precisely so a commitment
  // the books have recorded cannot be quietly restated — but a deal genuinely
  // does get renegotiated after the handshake, and the alternative today is to
  // Remove the creator (cancelling their expense and their invoice history) and
  // re-add them, which loses the trail rather than recording the change.
  // Founder only, and every use is written to the campaign timeline: this is an
  // override with an audit entry, not an open field.
  overrideLockedCost: ["founder"],
  editCreator:        ["founder"],   // edit from the Creators directory
  assignUsers:        ["founder", "pcm", "cm", "am"],
  // A brand's logo and website are its identity across the whole app — the
  // masthead on its campaigns, the colour those cards are tinted with, the
  // fallback picture for its portal members. Same roles that own the client
  // relationship; CM/EA execute against a brand, they don't define it.
  editBrandIdentity:  ["founder", "pcm", "am"],

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
  // so the inboxes can be opened to different roles later without reworking the
  // page (it renders only the tabs the role can see).
  seeClientRequests:  ["founder"],  // brand signups from "Start a project"
  seeCreatorRequests: ["founder"],  // creator applications from "Apply as a creator"
  seeCareerRequests:  ["founder"],  // job applications from the Careers page
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