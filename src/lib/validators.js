/**
 * 5th Avenue — field validators for creator personal / bank details.
 * Each validator returns null when valid, or a short error message.
 * Empty values are always valid here — required-ness is decided by the
 * caller (e.g. which fields the selected payType demands).
 */

const RULES = {
  phone:   { re: /^(?:\+91)?[6-9]\d{9}$/,        msg: "Enter a valid 10-digit Indian mobile number", strip: /[\s-]/g },
  email:   { re: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,   msg: "Enter a valid email address" },
  pan:     { re: /^[A-Z]{5}[0-9]{4}[A-Z]$/,      msg: "PAN must look like ABCDE1234F" },
  ifsc:    { re: /^[A-Z]{4}0[A-Z0-9]{6}$/,       msg: "IFSC must look like CNRB0000684" },
  account: { re: /^\d{9,18}$/,                   msg: "Account number must be 9–18 digits" },
  upi:     { re: /^[\w.\-]{2,}@[a-zA-Z]{2,}$/,   msg: "UPI ID must look like name@bank" },
};

// Input shaping for real-time typing: strips characters the field can never
// contain and caps length, so e.g. an 11th digit in a phone field is simply
// not accepted. Pair with validateField for the remaining format checks.
const SANITIZE = {
  phone:   v => v.replace(/\D/g, "").slice(0, 10),
  account: v => v.replace(/\D/g, "").slice(0, 18),
  pan:     v => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10),
  ifsc:    v => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11),
  upi:     v => v.replace(/\s/g, ""),
  email:   v => v.replace(/\s/g, ""),
};

export function sanitizeField(kind, value) {
  const fn = SANITIZE[kind];
  return fn ? fn(value || "") : value;
}

export function validateField(kind, value) {
  const rule = RULES[kind];
  if (!rule) return null;
  let v = (value || "").trim();
  if (!v) return null; // empty = valid; required-ness handled by caller
  if (rule.strip) v = v.replace(rule.strip, "");
  if (kind === "pan" || kind === "ifsc") v = v.toUpperCase();
  return rule.re.test(v) ? null : rule.msg;
}

/**
 * validateCreatorDetails(values, requiredKeys)
 * values: { phone, email, pan, ifsc, bankAccount, upiId, ... }
 * requiredKeys: field names that must be non-empty (payType-driven).
 * Returns { fieldName: message } — empty object when everything passes.
 */
const FIELD_KIND = {
  phone: "phone", email: "email", pan: "pan",
  ifsc: "ifsc", bankAccount: "account", upiId: "upi",
};

export function validateCreatorDetails(values, requiredKeys = []) {
  const errors = {};
  for (const key of requiredKeys) {
    if (!(values[key] || "").trim()) errors[key] = "Required";
  }
  for (const [key, kind] of Object.entries(FIELD_KIND)) {
    if (errors[key]) continue;
    const msg = validateField(kind, values[key]);
    if (msg) errors[key] = msg;
  }
  return errors;
}

/** Which detail fields the selected payType makes mandatory. */
export function requiredForPayType(payType) {
  if (payType === "upi") return ["upiId"];
  if (payType === "net_banking") return ["bankName", "bankAccount", "ifsc"];
  if (payType === "vendor") return ["vendorCode"];
  return [];
}
