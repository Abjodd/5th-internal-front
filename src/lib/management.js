/**
 * 5th Avenue — which of the three kinds of creator this is.
 *
 * "Managed by vendors" is NOT stored: `creator.vendorId` already says it, and a
 * second field saying the same thing is a second field to disagree with the
 * Vendors tab. Only the other two are a choice, so `managedBy` holds
 * "fifthavenue" or "general" and an absent value reads as general.
 */
export const MANAGEMENT = [
  { id: "fifthavenue", label: "Managed by Fifth Avenue" },
  { id: "vendor", label: "Managed by vendors" },
  { id: "general", label: "General" },
];

export const MANAGEMENT_LABEL = Object.fromEntries(MANAGEMENT.map(m => [m.id, m.label]));

// Assigning a vendor wins over whatever is stored, so the tag can never claim
// we manage someone a vendor invoices for.
export const managementOf = (creator) =>
  creator?.vendorId ? "vendor" : creator?.managedBy === "fifthavenue" ? "fifthavenue" : "general";

// The two a founder can actually pick; "vendor" is set by assigning a vendor.
export const MANAGEMENT_CHOICES = MANAGEMENT.filter(m => m.id !== "vendor");
