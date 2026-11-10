// src/lib/creatorPlace.js — where a directory creator is, and which niches
// they're in, for the Creators tab filters (Country → Region → City, Niche)
// and for saving that onto a creator found through Find creators.
//
// A creator's place comes from, in order:
//   1. their own profile fields — country / state / city (typed in the Edit
//      form, or saved when they were added from Find creators);
//   2. what Find creators worked out and saved under socials.<platform>.place;
//   3. for creators added before that existed: the location Find creators
//      detected (detectedLocation / profile city / the place searched for when
//      there was evidence for it), matched against the finder's place tree.
// A state from the Add Creator form's list is an Indian state, so it implies
// India.
//
// Niches are the creator's niche field (comma-separated, as typed) plus every
// niche they were found under in Find creators.

export const INDIAN_STATES = [
  "Andaman & Nicobar", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
  "Chandigarh", "Chhattisgarh", "Dadra & Nagar Haveli", "Daman & Diu", "Delhi",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu & Kashmir", "Jharkhand",
  "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

/** Lower-case, "&" → "and", punctuation and "the" dropped — for comparing place names. */
export const placeKey = (s) => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/\bthe\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ").trim();

const INDIA_STATE_BY_KEY = new Map(INDIAN_STATES.map((s) => [placeKey(s), s]));
/** "Delhi NCR" / "NCT of Delhi" / "Jammu and Kashmir" → the form's own spelling. */
export function indianStateName(s) {
  const k = placeKey(s);
  if (!k) return null;
  if (INDIA_STATE_BY_KEY.has(k)) return INDIA_STATE_BY_KEY.get(k);
  if (/\bdelhi\b/.test(k)) return "Delhi";
  if (k === "orissa") return "Odisha";
  if (k === "pondicherry") return "Puducherry";
  return null;
}
const isIndia = (country) => placeKey(country) === "india";

/** Tidy one place: India's states in the form's spelling, empty parts dropped. */
export function tidyPlace(p) {
  if (!p) return null;
  let { country = null, state = null, city = null } = p;
  if (!country && state && indianStateName(state)) country = "India";
  if (isIndia(country) && state) state = indianStateName(state) || state;
  if (!country && !state && !city) return null;
  return { country: country || null, state: state || null, city: city || null };
}

/**
 * A place name ("Bengaluru", "Kerala", "UAE", "Anywhere in India") → where it
 * sits in the finder's place tree: { country, state, city }. Cities first, so
 * "Delhi NCR" is the city, not just the state.
 */
export function placeFromLabel(tree, label) {
  const raw = String(label || "").replace(/^(anywhere in|in)\s+/i, "");
  const k = placeKey(raw);
  if (!k) return null;
  for (const c of tree || []) {
    for (const st of c.states || []) for (const ci of st.cities || []) {
      if (placeKey(ci.label) === k) return tidyPlace({ country: c.label, state: st.label, city: ci.label });
    }
    for (const ci of c.cities || []) if (placeKey(ci.label) === k) return tidyPlace({ country: c.label, city: ci.label });
  }
  for (const c of tree || []) {
    for (const st of c.states || []) if (placeKey(st.label) === k) return tidyPlace({ country: c.label, state: st.label });
  }
  for (const c of tree || []) if (placeKey(c.label) === k) return tidyPlace({ country: c.label });
  // No tree (finder not reachable): Indian states and India still resolve.
  if (indianStateName(raw)) return { country: "India", state: indianStateName(raw), city: null };
  if (k === "india") return { country: "India", state: null, city: null };
  return null;
}

/**
 * Where a Find creators result is, from what the finder detected: the bio /
 * profile city first, then — only when the finder had evidence for it — the
 * place the search was filtered to.
 */
export function placeOfResult(r, search, tree) {
  for (const label of [r?.location, r?.city, r?.why?.where ? search?.expanded?.location : null]) {
    const p = placeFromLabel(tree, label);
    if (p) return p;
  }
  return null;
}

/** A directory creator's place, or null when nothing says where they are. */
export function placeOfCreator(c, tree) {
  if (!c) return null;
  if (c.country || c.state || c.city) {
    let p = tidyPlace({ country: c.country, state: c.state, city: c.city });
    // A city typed alone ("Kochi") gets its state and country from the tree.
    if (p && p.city && (!p.state || !p.country)) {
      const t = placeFromLabel(tree, p.city);
      if (t) p = { country: p.country || t.country, state: p.state || t.state, city: p.city };
    }
    if (p) return p;
  }
  const found = Object.values(c.socials || {}).filter((d) => d && typeof d === "object");
  for (const d of found) { const p = tidyPlace(d.place); if (p) return p; }
  for (const d of found) {
    for (const label of [d.detectedLocation, d.city, d.locationEvidence ? d.searchLocation : null]) {
      const p = placeFromLabel(tree, label);
      if (p) return p;
    }
  }
  return null;
}

/** "Kochi, Kerala" in India; "Dubai, UAE" abroad. */
export function placeLabel(p) {
  if (!p) return "";
  const parts = [p.city, p.state && p.state !== p.city ? p.state : null];
  if (p.country && (!isIndia(p.country) || parts.every((x) => !x))) parts.push(p.country);
  return parts.filter(Boolean).join(", ");
}

const nicheLabel = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** The creator's niches: their niche field split on , / | ; & — plus every niche Find creators found them under. */
export function nichesOfCreator(c) {
  const out = new Map();
  const add = (v) => {
    for (const part of String(v || "").split(/[,/|;]|\s&\s|\s\+\s/)) {
      const t = part.trim().replace(/\s+/g, " ");
      if (t.length < 2 || t.length > 40) continue;
      const key = t.toLowerCase();
      if (!out.has(key)) out.set(key, nicheLabel(t));
    }
  };
  add(c?.niche);
  for (const d of Object.values(c?.socials || {})) for (const n of d?.searchNiches || []) add(n);
  return [...out.values()];
}
