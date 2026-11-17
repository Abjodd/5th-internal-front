// What a consultant record holds, section by section — the one list the add
// form, the card panels and (later) the consultant portal all read, so a field
// can't be added in one place and forgotten in another. Checks mirror the
// backend's (routes/consultants.js) so mistakes show before saving.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const TIN_RE = /^[A-Z0-9-]{6,20}$/;

const check = {
  email: (v) => (!v || EMAIL_RE.test(v.trim()) ? null : "Not a valid email address"),
  gst: (v) => (!v || GSTIN_RE.test(v.replace(/\s+/g, "").toUpperCase()) ? null : "15 characters, like 27AAPFU0939F1ZV"),
  pan: (v) => (!v || PAN_RE.test(v.replace(/\s+/g, "").toUpperCase()) ? null : "10 characters, like ABCDE1234F"),
  tin: (v) => (!v || TIN_RE.test(v.replace(/\s+/g, "").toUpperCase()) ? null : "6–20 letters or digits"),
};

/**
 * Sections shown as panels and in the add form. `path` is where the section
 * lives on the record ("" = top level). Each field: key, label, placeholder,
 * check, upper (store in capitals), multiline.
 */
export const SECTIONS = [
  {
    id: "basic", n: 1, title: "Basic details", path: "",
    fields: [
      { key: "name", label: "Name", placeholder: "e.g. Kapoor Consulting", required: true },
      { key: "email", label: "Email", placeholder: "hello@consultant.com", check: check.email },
    ],
  },
  {
    id: "billing", n: 2, title: "Billing details", path: "billing",
    fields: [
      { key: "gstNumber", label: "GST number", placeholder: "27AAPFU0939F1ZV", check: check.gst, upper: true },
      { key: "address", label: "Billing address", placeholder: "Street, city, state, PIN", multiline: true },
      { key: "gst", label: "Billing GST", placeholder: "GSTIN billed against", check: check.gst, upper: true },
      { key: "email", label: "Billing email", placeholder: "accounts@consultant.com", check: check.email },
    ],
  },
  {
    id: "hq", n: 3, title: "HQ details", path: "hq",
    fields: [
      { key: "address", label: "HQ address", placeholder: "Registered office address", multiline: true },
      { key: "gst", label: "HQ GST", placeholder: "GSTIN of the HQ", check: check.gst, upper: true },
    ],
  },
  {
    id: "tax", n: 4, title: "Tax details", path: "tax",
    fields: [
      { key: "tin", label: "TIN", placeholder: "Tax identification number", check: check.tin, upper: true },
      { key: "pan", label: "PAN", placeholder: "ABCDE1234F", check: check.pan, upper: true },
    ],
  },
  {
    id: "primary", n: 5, title: "Primary contact", path: "primaryContact",
    fields: [
      { key: "name", label: "Contact name", placeholder: "Who we deal with" },
      { key: "designation", label: "Designation", placeholder: "e.g. Founder, Partner" },
      { key: "email", label: "Email", placeholder: "name@consultant.com", check: check.email },
      { key: "phone", label: "Phone", placeholder: "+91 …" },
    ],
  },
];

/** The same contact fields, for each POC. */
export const PERSON_FIELDS = SECTIONS.find((s) => s.id === "primary").fields;

/** Read a section's values off a consultant ({} when empty). */
export const sectionValue = (c, section) => (section.path ? { ...(c?.[section.path] || {}) } : { name: c?.name || "", email: c?.email || "" });

/** Field errors for one section's values: { key: message }. */
export function sectionErrors(section, value) {
  const out = {};
  for (const f of section.fields) {
    const v = String(value?.[f.key] ?? "");
    if (f.required && !v.trim()) out[f.key] = `${f.label} is required`;
    else if (f.check) { const e = f.check(v); if (e) out[f.key] = e; }
  }
  return out;
}

/** The patch that saves one section: top-level fields, or the section object. */
export function sectionPatch(section, value) {
  const tidy = Object.fromEntries(section.fields.map((f) => {
    let v = String(value?.[f.key] ?? "").trim();
    if (f.upper) v = v.replace(/\s+/g, "").toUpperCase();
    return [f.key, v];
  }));
  if (!section.path) return tidy;
  // keep ids and fields this form doesn't show (e.g. the contact's _id)
  return { [section.path]: { ...(value || {}), ...tidy } };
}

/** How complete a consultant's record is — shown on the card. */
export function completeness(c) {
  const checks = [
    c.name, c.email,
    c.billing?.gstNumber, c.billing?.address, c.billing?.gst, c.billing?.email,
    c.hq?.address, c.hq?.gst,
    c.tax?.tin, c.tax?.pan,
    c.primaryContact?.name, c.primaryContact?.designation, c.primaryContact?.email,
    (c.pocs || []).length > 0, (c.brandIds || []).length > 0, (c.documentCount || 0) > 0,
  ];
  const done = checks.filter(Boolean).length;
  return { done, total: checks.length, pct: Math.round((done / checks.length) * 100) };
}
