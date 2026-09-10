/**
 * 5th Avenue — who actually gets paid for a creator.
 *
 * A creator assigned to a vendor (Creators › Vendors) is invoiced BY that
 * vendor: the vendor is the seller on the document, their GSTIN/PAN is the
 * billing identity, and their account is what receives the money. The creator
 * is named on the invoice as the service that was rendered — not as the payee.
 * Unassigned, the creator bills us themselves and nothing changes.
 *
 * `creator.vendorId` is the ONLY stored fact about that relationship. Nothing
 * is mirrored onto the creator's payType/payId, so there is nothing to drift:
 * this function is the one place that decides where money goes, and every
 * screen and document that needs the answer asks it here.
 *
 * That is also why the backend does not re-derive this. POST /api/invoices/:no/pdf
 * has always been a pure renderer of what it is handed (see routes/invoicePdf.js);
 * it receives the payee this produces and draws it, so the rule stays single.
 *
 * Both branches return the same keys, so callers never branch on `kind` to read
 * a field — only to say something different about it.
 */
export function payeeOf(creator, vendor) {
  const pd = creator?.personalDetails || {};
  if (vendor) {
    return {
      kind: "vendor",
      id: vendor.id || null,
      name: vendor.name || "",
      // Whose work this invoice is for. The line that makes a vendor-raised
      // invoice legible: "Bright Talent Media LLP, on behalf of Anjali Kitchen".
      onBehalfOf: creator?.name || null,
      address: vendor.address || null,
      pan: vendor.pan || null,
      gstin: vendor.gstin || null,
      email: vendor.email || null,
      phone: vendor.phone || null,
      payType: vendor.payType || null,
      payId: null,
      bankName: vendor.bankName || null,
      bankAccount: vendor.bankAccount || null,
      bankBranch: vendor.bankBranch || null,
      ifsc: vendor.ifsc || null,
      upiId: vendor.upiId || null,
    };
  }
  return {
    kind: "creator",
    id: creator?.id || creator?.dbId || null,
    name: creator?.name || "",
    onBehalfOf: null,
    address: pd.address || null,
    pan: pd.pan || null,
    gstin: pd.gstin || null,
    email: pd.email || null,
    phone: creator?.phone || null,
    payType: creator?.payType || null,
    // The hand-typed vendor code behind the legacy payType "vendor" — a
    // creator paid through an agency we never made a record for. Superseded by
    // vendorId, and kept because invoices raised under it still have to read.
    payId: creator?.payId || null,
    bankName: pd.bankName || null,
    bankAccount: pd.bankAccount || null,
    bankBranch: pd.bankBranch || null,
    ifsc: pd.ifsc || null,
    upiId: pd.upiId || null,
  };
}

/**
 * The payee for a creator, given the vendor directory as a Map by id.
 *
 * A creator whose vendor has since been removed falls back to their own
 * details rather than to a blank payee — the assignment is what's missing,
 * not the person.
 */
export const payeeFor = (creator, vendorById) =>
  payeeOf(creator, creator?.vendorId ? vendorById?.get(creator.vendorId) : null);

/**
 * Is there enough on file to actually send the money?
 *
 * What gates the Invoice button. Deliberately about the PAYEE, not the
 * creator: a creator with no bank details of their own is perfectly payable
 * once they are billed through a vendor who has them.
 */
export const isPayable = (payee) =>
  payee?.payType === "upi" ? !!payee.upiId
  : payee?.payType === "net_banking" ? !!(payee.bankAccount && payee.ifsc)
  : payee?.payType === "vendor" ? !!payee.payId
  : false;

/**
 * May an invoice be raised for this payee yet?
 *
 * Asymmetric on purpose. A creator's missing bank details are collected on the
 * invoice screen itself, so a pay type is enough to open it. A vendor's are not
 * editable there — they belong to the vendor record, shared by every creator
 * they front — so they have to be on file already, or the invoice would go out
 * with an empty payment block.
 */
export const canInvoice = (payee) =>
  payee?.kind === "vendor" ? isPayable(payee) : !!payee?.payType;
