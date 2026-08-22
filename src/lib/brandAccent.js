/**
 * A brand's colour, taken from the logo it actually uploaded.
 *
 * NO FALLBACK, on purpose. An earlier version hashed the brand NAME into a
 * palette so every brand had a colour — arbitrary hues (FreshBite navy, Nike
 * gold) that read as decoration, one per brand, which is what made the board too
 * colourful. `accentFromImage` resolves null for a brand with no logo, a broken
 * image, or no usable colour, and callers leave those plain. Colour therefore
 * always means "the brand's own colour", never "the hash landed here".
 *
 * Averaging pixels is the obvious approach and the wrong one — a red-and-green
 * logo gives mud, anything on white gives near-white. Instead: bin by coarse
 * colour, discard near-white/near-black/transparent as background, weight bins
 * by saturation, and normalise the winner into a fixed lightness band so pale
 * and dark logos yield tints of comparable strength.
 */

import { useEffect, useState } from "react";

// 24x24 is plenty: this is picking one colour, not reading the image. Anything
// larger just costs decode time on a value that gets rounded into 12 buckets.
const SAMPLE = 24;
// 4 bits per channel — coarse enough that anti-aliased edges land in the same
// bucket as the solid colour they came from.
const BIN = 16;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0))
          : max === g ? (b - r) / d + 2
          : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToHex(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Decoding the same logo for every card in a brand's group is wasted work, and
// the result never changes for a given URL (avatar URLs are cache-busted with
// ?v=avatarUpdatedAt, so a new upload is a new key).
//
// The PROMISE is cached, not the resolved colour: several cards for one brand
// mount in the same tick, and caching only the result would let every one of
// them start its own decode before the first finished.
const cache = new Map();

/**
 * Dominant colour of an image URL, as a hex string, or null when there isn't a
 * usable one. Never rejects — a brand without a resolvable colour simply
 * renders uncoloured.
 */
export function accentFromImage(url) {
  if (!url) return Promise.resolve(null);
  if (cache.has(url)) return cache.get(url);

  const pending = new Promise((resolve) => {
    const img = new Image();
    // Required to read pixels back out. The API sends permissive CORS headers
    // (see server.js), so this succeeds; without it the canvas is tainted and
    // getImageData throws.
    img.crossOrigin = "anonymous";
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = SAMPLE;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
        const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);

        const bins = new Map();
        for (let i = 0; i < data.length; i += 4) {
          const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
          if (a < 128) continue;                       // transparent
          const [, s, l] = rgbToHsl(r, g, b);
          if (l > 0.93 || l < 0.07) continue;          // paper white / pure black
          if (s < 0.12) continue;                      // greys carry no identity
          const key = `${(r / BIN) | 0},${(g / BIN) | 0},${(b / BIN) | 0}`;
          const bin = bins.get(key) || { r: 0, g: 0, b: 0, n: 0, w: 0 };
          bin.r += r; bin.g += g; bin.b += b; bin.n += 1;
          // Saturation-weighted: a small vivid mark beats a large washed one,
          // which is what makes a logo's actual brand colour win over its
          // pastel backdrop.
          bin.w += 1 + s * 2;
          bins.set(key, bin);
        }
        // A logo that is pure greyscale has no brand colour to lend — better
        // uncoloured than tinted with an invented hue.
        if (!bins.size) return resolve(null);

        const best = [...bins.values()].sort((a, b) => b.w - a.w)[0];
        const [h, s] = rgbToHsl(best.r / best.n, best.g / best.n, best.b / best.n);
        // Normalised, not used raw: a logo's own colour may be far too pale or
        // too dark to tint a card evenly. Hue and (roughly) saturation are what
        // identify the brand; lightness is ours to set so every brand's tint
        // lands at the same visual strength.
        return resolve(hslToHex(h, clamp(s, 0.35, 0.8), 0.45));
      } catch {
        return resolve(null); // tainted canvas or no 2d context
      }
    };
    img.src = url;
  });

  cache.set(url, pending);
  return pending;
}

/**
 * Accents for several logos at once, as a `{ [logoUrl]: hex | null }` map.
 *
 * The campaign board lists every brand's work in one flat list, so the colours
 * cannot be resolved a brand at a time — a hook can't be called inside the map
 * that renders the rows. Resolved together here instead, in one pass over the
 * distinct URLs, which is also one state update rather than N.
 *
 * A URL is absent from the map until it resolves, so a row is never briefly the
 * wrong colour on the way to the right one — it goes from uncoloured to
 * coloured, which is a much quieter transition than one hue swapping for
 * another.
 */
export function useBrandAccents(logoUrls = []) {
  // Joined, so the effect keys on the URLs themselves rather than on the
  // identity of an array the caller rebuilds every render.
  const key = [...new Set(logoUrls.filter(Boolean))].sort().join("\n");
  const [accents, setAccents] = useState({});
  useEffect(() => {
    let live = true;
    const urls = key ? key.split("\n") : [];
    Promise.all(
      urls.map((url) => accentFromImage(url).then((c) => [url, c])),
    ).then((pairs) => { if (live) setAccents(Object.fromEntries(pairs)); });
    return () => { live = false; };
  }, [key]);
  return accents;
}

/** One brand's accent, or null while it decodes and for any brand with no
 *  usable logo. */
export function useBrandAccent(logoUrl) {
  const accents = useBrandAccents(logoUrl ? [logoUrl] : []);
  return accents[logoUrl] ?? null;
}
