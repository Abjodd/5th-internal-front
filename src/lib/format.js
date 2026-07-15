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
export function prettyDate(s) {
  return ISO_DATE.test(s || "")
    ? new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : (s || "");
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
