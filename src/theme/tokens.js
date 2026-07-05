/**
 * 5th Avenue — Internal OS · Design Tokens
 * ─────────────────────────────────────────────────────────────────
 * Single source of truth for the light theme used across every page.
 * Previously every page file (17 of them) hard-coded its own copy of
 * this object — several were even still on the old dark palette from
 * before the light-theme redesign (FounderSummary + the whole AEO
 * module). Centralizing here means:
 *   - one edit updates the whole product's palette
 *   - every page is guaranteed to be on the current light theme
 *   - page-specific extras (e.g. Campaigns' pipeline-stage colors)
 *     just spread ...T and add their own keys, see Campaigns/index.jsx
 *
 * Palette notes: warm paper neutrals (not cool SaaS gray) + a deep
 * indigo-navy accent instead of a default blue, so the primary accent
 * doesn't collide visually with the amber/gold semantic colors used
 * for pending/finance states. Pairs with the serif italic "5th Avenue"
 * wordmark for an editorial, less "generated dashboard" feel.
 */
export const T = {
  bg: "#F7F6F2",
  surface: "#FFFFFF",
  raised: "#FBFAF8",
  hover: "rgba(28,24,16,0.035)",
  border: "rgba(28,24,16,0.09)",
  borderMid: "rgba(28,24,16,0.15)",
  text: "#1C1A15",
  sub: "#6E6A5C",
  mute: "#E8E5DC",
  label: "#948E7C",

  accent: "#2F3E6B", // primary actions, active tabs, links
  green: "#1E9E5A",  // success / live / paid
  amber: "#B5790A",  // pending / needs attention
  red: "#C13A3A",    // error / overdue / critical
  purple: "#7860D6", // founder / leadership accents
  teal: "#1C9C8C",   // secondary informational accent
  pink: "#A8519E",   // rare accent (registry/creator tags)
  gold: "#A6862E",   // finance / director-level accents

  shadow: "0 1px 2px rgba(28,24,16,0.04), 0 6px 20px rgba(28,24,16,0.06)",
  shadowLg: "0 12px 40px rgba(28,24,16,0.14)",
  radius: 8,
  radiusSm: 5,
};

export default T;
