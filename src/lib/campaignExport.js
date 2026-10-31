/**
 * Campaign report export — one tab per campaign, in the agency's sheet format
 * (the Google Sheet template the team uses for client reports):
 *
 *   S.No. · NAME · LINK · FOLLOWERS · TYPE · LOCATION · AUDIENCE LOCATION ·
 *   GENDER SPLIT · AUDIENCE AGE · COST            ← blue header  #3D85C6
 *   LIVE DATE · LIVE LINK · VIEWS · LIKES · COMMENTS · SHARES · SAVES ·
 *   REACH · REEL INSIGHTS                          ← magenta header #A64D79
 *
 * Lora 10, centred, thin black borders, links in blue, the same column widths.
 * Built in the browser from the campaigns the user can already see.
 */
import { buildXlsx, XLSX_MIME } from "./xlsx.js";

const COLS = [
  ["S.No.", 100, "blue"], ["NAME", 153, "blue"], ["LINK", 159, "blue"], ["FOLLOWERS", 105, "blue"], ["TYPE", 100, "blue"],
  ["LOCATION", 100, "blue"], ["AUDIENCE LOCATION", 212, "blue"], ["GENDER SPLIT", 173, "blue"], ["AUDIENCE AGE", 173, "blue"],
  ["COST", 100, "blue"], ["LIVE DATE", 110, "pink"], ["LIVE LINK", 144, "pink"], ["VIEWS", 100, "pink"], ["LIKES", 100, "pink"],
  ["COMMENTS", 106, "pink"], ["SHARES", 100, "pink"], ["SAVES", 100, "pink"], ["REACH", 100, "pink"], ["REEL INSIGHTS", 152, "pink"],
];

const FONT = "Lora";
const INDIAN = "[>=10000000]##\\,##\\,##\\,##0;[>=100000]##\\,##\\,##0;##,##0"; // 1,00,000
const STYLES = [
  { font: { name: FONT, size: 10, bold: true, color: "FFFFFF" }, fill: "3D85C6", border: "000000", align: "center", valign: "center" }, // 0 header blue
  { font: { name: FONT, size: 10, bold: true, color: "FFFFFF" }, fill: "A64D79", border: "000000", align: "center", valign: "center" }, // 1 header magenta
  { font: { name: FONT, size: 10, color: "000000" }, border: "000000", align: "center", valign: "center", wrap: true },                // 2 body
  { font: { name: FONT, size: 10, color: "1155CC", underline: true }, border: "000000", align: "center", valign: "center", wrap: true }, // 3 link
  { font: { name: FONT, size: 10, color: "000000" }, border: "000000", align: "center", valign: "center", numFmt: INDIAN },             // 4 number
  { font: { name: FONT, size: 10, color: "1155CC", underline: true }, border: "000000", align: "center", valign: "center" },             // 5 link, one line (clipped like the sheet)
];
const S = { blue: 0, pink: 1, body: 2, link: 3, num: 4, link1: 5 };

// ── field helpers (match how the app stores creators) ────────────────────────
const DROPPED = new Set(["backed_off", "brand_dropped", "rejected", "dropped"]);

export function parseFollowers(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const m = String(v).trim().toUpperCase().replace(/,/g, "").match(/^([\d.]+)\s*([KML])?/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Math.round(n * (m[2] === "K" ? 1e3 : m[2] === "M" ? 1e6 : m[2] === "L" ? 1e5 : 1));
}
export const compact = (n) => (n == null ? "" : n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K` : String(n));
export const tierOf = (n) => (n == null ? "" : n < 10_000 ? "Nano" : n < 100_000 ? "Micro" : n < 1_000_000 ? "Macro" : "Mega");

const handleOf = (cr) => String(cr.handle || "").trim().replace(/^@+/, "");
const profileLink = (cr) => {
  const h = handleOf(cr);
  if ((cr.platform || "Instagram") === "Instagram" && /^[A-Za-z0-9._]+$/.test(h)) return `https://www.instagram.com/${h}/`;
  return cr.igUrl || "";
};
const pct = (x) => `${+Number(x).toFixed(2)}%`;
export function audienceLocations(a) {
  const list = (a?.locations || []).filter((l) => l?.name && l.pct != null).sort((x, y) => y.pct - x.pct);
  return list.map((l) => `${pct(l.pct)} - ${l.name}`).join("\n");
}
export function genderSplit(a) {
  const g = a?.gender;
  if (!g || (g.female == null && g.male == null)) return "";
  const parts = [];
  if (g.female != null) parts.push(`F: ${pct(g.female)}`);
  if (g.male != null) parts.push(`M: ${pct(g.male)}`);
  if (g.other) parts.push(`O: ${pct(g.other)}`);
  return parts.join(", ");
}
const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-64", "65+"];
export function audienceAge(a) {
  const age = a?.age;
  if (!age) return "";
  const keys = [...AGE_ORDER.filter((k) => k in age), ...Object.keys(age).filter((k) => !AGE_ORDER.includes(k))];
  return keys.filter((k) => age[k] != null && age[k] !== "").map((k) => `${pct(age[k])} - ${k}`).join("\n");
}
const liveLinks = (cr) => {
  const l = cr.live;
  if (!l) return [];
  const urls = Array.isArray(l.postUrls) ? l.postUrls : l.postUrl ? [l.postUrl] : [];
  return urls.map((u) => String(u || "").trim()).filter(Boolean);
};
export function ddmmyyyy(v) {
  if (!v) return "";
  const s = String(v);
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}
const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** Who goes on a campaign's tab: the locked roster; if nothing is locked yet, everyone still in play. */
export function exportRoster(camp) {
  const all = (camp.creators || []).filter((c) => !DROPPED.has(c.status));
  const locked = all.filter((c) => c.status === "locked");
  return locked.length ? locked : all;
}

function campaignSheet(camp) {
  const header = { height: 24, cells: COLS.map(([label, , color]) => ({ v: label, s: S[color] })) };
  const rows = exportRoster(camp).map((cr, i) => {
    const a = cr.audience || {};
    const f = parseFollowers(cr.followers);
    const links = liveLinks(cr);
    const t = cr.tracking || {};
    const loc = audienceLocations(a), age = audienceAge(a);
    const values = [
      { v: i + 1, s: S.body },
      { v: handleOf(cr) || cr.name || "", s: S.body },
      { v: profileLink(cr), s: S.link1, link: profileLink(cr) || undefined },
      { v: compact(f), s: S.body },
      { v: tierOf(f), s: S.body },
      { v: cr.city || cr.state || "", s: S.body },
      { v: loc, s: S.body },
      { v: genderSplit(a), s: S.body },
      { v: age, s: S.body },
      { v: num(cr.clientCost), s: S.num },
      { v: ddmmyyyy(cr.live?.postedDate), s: S.body },
      { v: links.join("\n"), s: links.length > 1 ? S.link : S.link1, link: links[0] },
      { v: num(t.views), s: S.num },
      { v: num(t.likes), s: S.num },
      { v: num(t.comments), s: S.num },
      { v: num(t.forwards ?? t.shares), s: S.num },
      { v: num(t.saves), s: S.num },
      { v: num(t.reach), s: S.num },
      { v: cr.reelInsights || t.insightsUrl || "", s: cr.reelInsights || t.insightsUrl ? S.link : S.body, link: cr.reelInsights || t.insightsUrl || undefined },
    ];
    const lines = Math.max(1, ...[loc, age, links.join("\n")].map((x) => (x ? x.split("\n").length : 1)));
    return { height: Math.max(32, lines * 17 + 12), cells: values };
  });
  return { name: camp.name || camp.id, cols: COLS.map(([, w]) => w), rows: [header, ...rows] };
}

/** Workbook bytes for these campaigns (newest first). */
export function campaignsWorkbook(campaigns) {
  const sorted = [...campaigns].sort((a, b) => String(b.start || "").localeCompare(String(a.start || "")));
  const sheets = sorted.length ? sorted.map(campaignSheet) : [{ name: "Campaigns", cols: COLS.map(([, w]) => w), rows: [{ height: 24, cells: COLS.map(([l, , c]) => ({ v: l, s: S[c] })) }] }];
  return buildXlsx({ sheets, styles: STYLES });
}

/** Builds the workbook and hands it to the browser as a download. */
export function downloadCampaignsWorkbook(campaigns, fileLabel = "All campaigns") {
  const bytes = campaignsWorkbook(campaigns);
  const blob = new Blob([bytes], { type: XLSX_MIME });
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const name = `Fifth Avenue - ${fileLabel} - ${stamp}.xlsx`.replace(/[\\/:*?"<>|]+/g, " ");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return name;
}
