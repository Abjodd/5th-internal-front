/**
 * 5th Avenue — Internal OS · Design Tokens
 * ─────────────────────────────────────────────────────────────────
 * Single source of truth for the light theme. Every page file used to hard-code
 * its own copy — several still on the pre-redesign dark palette. Page-specific
 * extras (e.g. Campaigns' pipeline-stage colours) spread ...T and add keys.
 *
 * Warm paper neutrals rather than cool SaaS grey, and a deep indigo-navy accent
 * instead of a default blue so it doesn't collide with the amber/gold used for
 * pending and finance states.
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

  accent: "#1F2C52", // primary actions, active tabs, links (darkened navy)
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

/**
 * The one dark surface in a light theme — Agency Health, the growth panel,
 * client cards, campaign cards. Previously four separate flat blacks that read
 * as four materials.
 *
 * A single `background` shorthand (not a base + overlay child) so it drops onto
 * any element. Anything dark should use this; a new flat black is a regression.
 */
export const DARK_SURFACE =
  "radial-gradient(125% 105% at 18% 10%, rgba(59,79,116,0.55) 0%, rgba(46,60,90,0.20) 44%, rgba(20,21,26,0) 72%), #14151A";

export default T;
