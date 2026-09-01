// Shared number-display helpers — Indian-locale money grouping and compact
// social counts. Import these instead of re-implementing per page.

// "1234567" → "12,34,567" (Indian grouping: 1,000 / 10,000 / 1,00,000).
// Accepts a number or a digit string; anything non-numeric is stripped.
export function groupINR(value) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("en-IN");
}

// Inverse of groupINR — "12,34,567" → "1234567" (plain digit string).
export function parseINR(str) {
  return String(str ?? "").replace(/[^\d]/g, "");
}

// "YYYY-MM-DD" → "13 Jul 2026" (en-IN). Anything non-ISO (legacy free-text
// dates like "May 30, 2026") passes through unchanged.
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// A Date as "YYYY-MM-DD" in LOCAL time. Deliberately not `toISOString()`, which
// is UTC and rolls the date over early evening in IST — an invoice raised at
// 6pm would be dated tomorrow, and a campaign created after 5:30am would be
// dated yesterday. Campaigns and Billing both need this; keeping one copy is
// what stops the two pages disagreeing about what day it is.
export const isoDay = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const todayISO = () => isoDay(new Date());

export function prettyDate(s) {
  return ISO_DATE.test(s || "")
    ? new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : (s || "");
}

// A full timestamp — date AND time — for things stamped to the second rather
// than to the day (review comments). prettyDate takes date-only ISO and echoes
// anything else unchanged, which printed a raw "2026-09-01T12:40:49.833Z"
// under a comment.
export const prettyDateTime = (s) => {
  const t = Date.parse(s || "");
  return isNaN(t) ? "" : new Date(t).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });
};

// Money, on the Indian scale: 75000 → "₹75,000", 750000 → "₹7.5L",
// 12000000 → "₹1.2Cr". Null/empty/non-numeric → "—"; a real 0 → "₹0".
//
// No "K" tier, deliberately. "₹75K" next to "₹7.5L" makes two numbers one order
// of magnitude apart look like different systems, and it isn't exact —
// (n/1000).toFixed(0) rounds ₹75,400 and ₹75,600 to the same "₹75K", which is
// not a rounding anyone wants on a creator's fee.
//
// Here, not per page: Campaigns, Creators and Billing print the same amounts and
// had already drifted (Campaigns had no crore tier, so ₹1.2Cr read "₹120.0L").
const compactINR = (n, div, unit) => `₹${+(n / div).toFixed(1)}${unit}`;
export function fmtINR(n) {
  const v = Number(n);
  if (n == null || n === "" || !Number.isFinite(v)) return "—";
  const a = Math.abs(v), sign = v < 0 ? "-" : "";
  if (a >= 1e7) return sign + compactINR(a, 1e7, "Cr");
  if (a >= 1e5) return sign + compactINR(a, 1e5, "L");
  return `${sign}₹${a.toLocaleString("en-IN")}`;
}

// Cost per view. Neither fmtINR's lakh/crore scale nor a flat two decimals
// works here: a real CPV is routinely a fraction of a paisa (₹0.005264), which
// toFixed(2) flattens to "₹0.01" — while five or six decimals gives a number
// you have to count zeros in. Two significant digits past the leading zeros,
// at any magnitude: 0.005264 → ₹0.0053, 0.03578 → ₹0.036, 1.25 → ₹1.25.
//
// Mirrors fmtCPV in the client portal (5th-avenue-client-front
// src/lib/format.js), as fmtINR already does — the same campaign's CPV is
// printed on both screens and the two must not round differently.
const CPV_SIGNIFICANT = 2;
export function fmtCPV(n) {
  const v = Number(n);
  if (n == null || n === "" || !Number.isFinite(v)) return "—";
  const a = Math.abs(v), sign = v < 0 ? "-" : "";
  // toFixed, not toPrecision: toPrecision returns "5.3e-3" on exactly these
  // values. Below ₹1 the exponent counts the zeros before the first real digit.
  const decimals = !(a > 0) || a >= 1
    ? CPV_SIGNIFICANT
    : Math.min(20, -Math.floor(Math.log10(a)) - 1 + CPV_SIGNIFICANT);
  return `${sign}₹${a.toFixed(decimals)}`;
}

// Compact display for follower/like/view counts: 1200000 → "1.2M",
// 95000 → "95K", 820 → "820". Accepts raw numbers, numeric strings
// ("820000" / "8,20,000"), or already-compact values ("820K") which pass
// through unchanged. Null/empty → "—".
export function fmtCompact(v) {
  if (v == null || v === "") return "—";
  const s = String(v).trim();
  const n = typeof v === "number" ? v : /^[\d,]+$/.test(s) ? Number(s.replace(/,/g, "")) : null;
  if (n == null) return s; // already formatted, e.g. "820K"
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}K`;
  return String(n);
}

// Two-letter avatar initials from a name: "Rahul Sharma" → "RS".
export const initials = (name) =>
  (name || "?").split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
