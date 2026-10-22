/**
 * A brand's logo, fetched from the brand's own website icon, falling back to
 * an initial in a tinted tile.
 *
 * Source: Google's favicon service (t1.gstatic.com/faviconV2, size 128).
 * Clearbit's logo API, which this used before, has been shut down — every
 * request to it now fails, which is why logos had stopped appearing.
 * Checked in a real browser (Oct 2026): philips.com / nykaa.com return 128px
 * icons, boat-lifestyle.com / mamaearth.in 47–48px, sugarcosmetics.com 32px.
 * For a domain with no icon Google returns a 16px placeholder globe rather
 * than an error, so anything 16px or smaller is treated as "not found" and
 * the next candidate is tried. (DuckDuckGo's icon service was rejected: its
 * not-found placeholder is 48px and indistinguishable from a real icon.)
 *
 * Order of sources (first that yields a real image wins):
 *   1. The agency's brand directory — if the brand name matches a Client
 *      (Settings → brands) that has an uploaded logo, that logo is used.
 *      It's the one a person chose, so it beats anything fetched.
 *   2. A saved website: Google's icon for it; if that is small (< 64px), the
 *      backend's own /api/logo-suggestion (faviconFetch.js — reads the page's
 *      declared icons / apple-touch-icon, usually sharper); else the small one.
 *   3. A domain guessed from the name, via Google only (the backend is not
 *      asked to fetch guessed sites).
 *   4. The initial.
 *
 * Which domain: the brand's saved website (models/Project.js `brandWebsite`,
 * the Website field + Fetch logo button on the deal forms, or "Set logo
 * website" on a brand card in Campaigns) is used verbatim. Without one, the
 * domain is guessed from the name — "Sugar Cosmetics" → sugarcosmetics.com,
 * then .in. A guess can land on the wrong company (boAt is boat-lifestyle.com,
 * not boat.com), which is exactly what saving the website fixes.
 *
 * Results are cached per domain-list for the page's lifetime, so a brand
 * shown on twenty cards is probed once, not twenty times.
 */
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ClientsAPI } from "../lib/api";
import { T } from "../theme/tokens";

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// The directory's uploaded logo for a brand name, if there is one. `brands`
// comes from AppShell's outlet context (id, name, hasAvatar, avatarUpdatedAt);
// avatarUrl returns null unless a logo is actually stored.
export function directoryLogoFor(brands, brand) {
  if (!brands?.length || !brand) return null;
  const n = norm(brand);
  const hit = brands.find((b) => norm(b.name) === n);
  return hit ? ClientsAPI.avatarUrl(hit) : null;
}

const PALETTE = [T.purple, T.teal, T.gold, T.pink, "#3B6EDB"];
function colorFor(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// "https://www.philips.com/en-in" / "philips.com" / "www.philips.com" → "philips.com"
export function domainFromWebsite(website) {
  const raw = String(website || "").trim();
  if (!raw) return null;
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withScheme).hostname.replace(/^www\./i, "");
    return host.includes(".") ? host : null;
  } catch {
    const slug = raw.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    return slug.includes(".") ? slug : null;
  }
}

function guessDomains(brand) {
  const slug = norm(brand);
  return slug ? [`${slug}.com`, `${slug}.in`] : [];
}

export const logoUrlFor = (domain) =>
  `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=128`;

const MIN_REAL_PX = 17; // Google's not-found globe is 16×16
const SHARP_PX = 64;
const cache = new Map(); // plan key → resolved url | null
const inflight = new Map();

function probe(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth >= MIN_REAL_PX ? { url, w: img.naturalWidth } : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function runPlan({ dir, saved, guesses }) {
  if (dir) { const r = await probe(dir); if (r) return r.url; }
  if (saved) {
    const g = await probe(logoUrlFor(saved));
    if (g && g.w >= SHARP_PX) return g.url;
    const uri = await ClientsAPI.suggestLogo(saved).then((r) => r?.dataUri || null).catch(() => null);
    if (uri) { const p = await probe(uri); if (p) return p.url; }
    return g ? g.url : null;
  }
  for (const d of guesses) { const g = await probe(logoUrlFor(d)); if (g) return g.url; }
  return null;
}

function resolveLogo(plan, key) {
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (inflight.has(key)) return inflight.get(key);
  const p = runPlan(plan).then((url) => { cache.set(key, url); inflight.delete(key); return url; });
  inflight.set(key, p);
  return p;
}

export default function BrandLogo({ brand, website, size = 36, radius, logoUrl }) {
  // useOutletContext is a plain context read — undefined (not a throw) when
  // rendered outside the routed app, which just skips the directory lookup.
  const ctx = useOutletContext();
  const dir = logoUrl || directoryLogoFor(ctx?.brands, brand);
  const saved = domainFromWebsite(website);
  const guesses = saved ? [] : guessDomains(brand);
  const key = [dir || "", saved || "", guesses.join(",")].join("|");
  const [src, setSrc] = useState(() => (cache.has(key) ? cache.get(key) : null));

  useEffect(() => {
    let live = true;
    if (!dir && !saved && !guesses.length) { setSrc(null); return; }
    if (cache.has(key)) { setSrc(cache.get(key)); return; }
    setSrc(null);
    resolveLogo({ dir, saved, guesses }, key).then((url) => { if (live) setSrc(url); });
    return () => { live = false; };
    // key captures dir/saved/guesses
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const box = { width: size, height: size, borderRadius: radius ?? size / 2, flexShrink: 0 };

  if (src) {
    return (
      <div style={{ ...box, background: "#FFF", border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <img src={src} alt="" style={{ width: "70%", height: "70%", objectFit: "contain", display: "block" }} />
      </div>
    );
  }

  const color = colorFor(brand);
  return (
    <div style={{
      ...box, display: "flex", alignItems: "center", justifyContent: "center",
      background: `${color}18`, color, fontSize: Math.round(size * 0.4), fontWeight: 700,
    }}>
      {(brand || "?").trim().charAt(0).toUpperCase()}
    </div>
  );
}
