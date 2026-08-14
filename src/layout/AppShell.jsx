import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard, SquareKanban, IndianRupee, Sparkles, Inbox, ShieldCheck,
  Building2, Search, ChevronDown, Check, Circle,
} from "lucide-react";
import { SECTIONS, canAccess, getRole } from "../routes/sections";
import { useAuth } from "../context/AuthContext";
import { ClientsAPI, UsersAPI } from "../lib/api";

const SECTION_ICONS = {
  LayoutDashboard, SquareKanban, IndianRupee, Sparkles, Inbox, ShieldCheck, Building2,
};

function SecIcon({ name, size = 16, ...rest }) {
  const C = SECTION_ICONS[name] || Circle;
  return <C size={size} strokeWidth={1.9} {...rest} />;
}

const F = {
  paper:     "#FAFAF9",
  surface:   "#FFFFFF",
  ink:       "#14151A",
  inkSoft:   "#6E7077",
  label:     "#9C9EA6",
  hairline:  "#E7E6E2",
  navy:      "#1E2A44",
  navyTint:  "#EEF1F6",
  rust:      "#8C3B2E",
  rustTint:  "#F7ECE9",
  shadowSm:  "0 1px 2px rgba(20,21,26,0.04)",
  shadowMd:  "0 1px 2px rgba(20,21,26,0.04), 0 8px 20px rgba(20,21,26,0.08)",
  shadowLg:  "0 4px 12px rgba(20,21,26,0.06), 0 24px 48px -12px rgba(20,21,26,0.16)",
};

// ── Liquid-glass pill system ──────────────────────────────────────
// The nav is NOT one bar — it's several independent floating pills
// (logo · brand filter · section tabs · search+user) with visible
// transparent gaps between them, each its own pane of glass. That's
// what makes it read as "not a navbar": no single container ties
// them together, they just happen to float in a row.
//
// "Liquid glass" tuning: fill opacity is kept very low so page
// content genuinely shows through, the blur carries all the
// legibility work, and a bright inner top-edge + soft outer edge
// stand in for a specular highlight, the way real glass catches light.
//
// ── Why there are two materials ───────────────────────────────────
// A 10%-opaque white pane cannot carry its own contrast: whatever is
// behind it sets its brightness. Over the paper background that's
// fine, but the Founder Summary scrolls full-bleed near-black
// sections (hero, Agency Health, the photo interludes, the footer)
// under the nav — the glass went dark while the ink stayed #14151A,
// and the wordmark, the tab labels and the user's role all vanished.
// That is the "navbar colour disappears when I scroll" bug.
//
// Raising the fill opacity until dark ink survives a black backdrop
// needs ~0.85 alpha, which throws the material away. So instead the
// material INVERTS: over dark backdrops the pills become smoked
// glass with light ink. Both variants stay genuinely transparent —
// only which side of the contrast they sit on changes.
const GLASS_LIGHT = {
  fill: "rgba(255,255,255,0.10)",
  fillScrolled: "rgba(255,255,255,0.20)",
  border: "rgba(255,255,255,0.65)",
  outline: "rgba(255,255,255,0.30)",
  blur: "blur(28px) saturate(2.4)",
  shadow: "inset 0 1px 0 rgba(255,255,255,0.65), inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 -12px 20px -14px rgba(255,255,255,0.35), 0 1px 2px rgba(20,21,26,0.03), 0 20px 44px -14px rgba(20,21,26,0.20)",

  hoverFill: "rgba(255,255,255,0.28)",
  chipBorder: "rgba(255,255,255,0.35)",

  // Ink + accents that ride on this material.
  text: F.ink,
  textSoft: F.inkSoft,
  label: F.label,
  activeFill: F.navy,
  activeText: "#FFFFFF",
  chipOnFill: F.navy,
  chipOnText: "#FFFFFF",
  chipOffFill: F.hairline,
  chipOffText: F.inkSoft,
};

const GLASS_DARK = {
  fill: "rgba(16,17,22,0.30)",
  fillScrolled: "rgba(16,17,22,0.46)",
  border: "rgba(255,255,255,0.34)",
  outline: "rgba(255,255,255,0.10)",
  blur: "blur(28px) saturate(1.7)",
  shadow: "inset 0 1px 0 rgba(255,255,255,0.38), inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 -12px 20px -14px rgba(255,255,255,0.18), 0 1px 2px rgba(0,0,0,0.22), 0 20px 44px -14px rgba(0,0,0,0.55)",

  hoverFill: "rgba(255,255,255,0.16)",
  chipBorder: "rgba(255,255,255,0.35)",

  text: "#FFFFFF",
  textSoft: "rgba(255,255,255,0.74)",
  label: "rgba(255,255,255,0.60)",
  // The navy active pill is invisible against a dark backdrop, so it
  // inverts too: a bright pill carrying navy text.
  activeFill: "#FFFFFF",
  activeText: F.navy,
  chipOnFill: "#FFFFFF",
  chipOnText: F.navy,
  chipOffFill: "rgba(255,255,255,0.20)",
  chipOffText: "#FFFFFF",
};

// Shared context so every independent pill reacts together — to page
// scroll (deepen slightly) and to what is currently passing beneath
// them (swap material) — without wiring either through props.
const NavCtx = createContext({ scrolled: false, merged: false, glass: GLASS_LIGHT });
function useNavSurface() { return useContext(NavCtx); }

const TOPBAR_H = 84;

// ── Backdrop tone detection ───────────────────────────────────────
// Which material the pills wear is decided by what is actually passing
// beneath them. The cost of knowing that is kept off the scroll path:
// the dark blocks' positions are MEASURED ONCE (per route, per resize,
// per content-height change) into a list of [top, bottom] offsets, and
// the only thing scrolling does is compare `scrollTop` against those
// cached numbers. No getBoundingClientRect, no getComputedStyle and no
// forced layout while the user is scrolling — just a few numeric
// comparisons inside the scroll listener the nav already had.
//
// Blocks classify themselves. `data-nav-tone="dark|light"` is an
// explicit override; otherwise the block's own computed background is
// measured, so the full-bleed #14151A editorial spreads register as
// dark with no annotation, and every other page — all of which are
// paper-coloured — keeps the light material by default.
const LUMA_DARK_MAX = 0.35;

function relativeLuminance(cssColor) {
  const m = /rgba?\(([^)]+)\)/.exec(cssColor || "");
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(",").map(Number);
  if (a < 0.5) return null; // transparent — tells us nothing about the backdrop
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function isDarkBlock(el) {
  const declared = el.dataset.navTone;
  if (declared === "dark") return true;
  if (declared === "light") return false;
  const luma = relativeLuminance(getComputedStyle(el).backgroundColor);
  return luma != null && luma < LUMA_DARK_MAX;
}

// Owns both bits of nav surface state — "has the page scrolled at all"
// and "is a dark block under the pills right now" — behind the single
// passive scroll listener the nav already had. Deliberately NOT
// rAF-coalesced: the per-event work is one `scrollTop` read and a
// handful of numeric comparisons, which is cheaper than the closure a
// rAF gate would allocate each frame, and `setState` bails out on an
// unchanged result so React re-renders only on an actual transition.
function useNavSurfaceState(paneRef, navRef, routeKey) {
  const [state, setState] = useState({ scrolled: false, onDark: false, merged: false });
  const darkRef = useRef([]);
  const mergeRef = useRef([]);
  const navBandRef = useRef(TOPBAR_H);

  const evaluate = useCallback(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const top = pane.scrollTop;
    const bottom = top + navBandRef.current;
    // Overlap tests against the cached bands.
    const covers = (bands) => {
      for (const [a, b] of bands) if (a < bottom && b > top) return true;
      return false;
    };
    const next = { scrolled: top > 8, onDark: covers(darkRef.current), merged: covers(mergeRef.current) };
    setState((prev) =>
      prev.scrolled === next.scrolled && prev.onDark === next.onDark && prev.merged === next.merged
        ? prev
        : next,
    );
  }, [paneRef]);

  const measure = useCallback(() => {
    const pane = paneRef.current;
    const nav = navRef.current;
    if (!pane) return;
    // The band the pills physically cover, measured rather than assumed
    // so a nav that has wrapped onto two rows is fully accounted for.
    navBandRef.current = Math.max(nav ? nav.offsetHeight : 0, TOPBAR_H);

    const paneTop = pane.getBoundingClientRect().top;
    const scroll = pane.scrollTop;
    const dark = [];
    const merge = [];
    for (const el of pane.querySelectorAll("section, footer, [data-nav-tone], [data-nav-merge]")) {
      const isDark = isDarkBlock(el);
      const isMerge = el.dataset.navMerge != null;
      if (!isDark && !isMerge) continue;
      const r = el.getBoundingClientRect();
      const band = [r.top - paneTop + scroll, r.top - paneTop + scroll + r.height];
      if (isDark) dark.push(band);
      if (isMerge) merge.push(band);
    }
    darkRef.current = dark;
    mergeRef.current = merge;
    evaluate();
  }, [paneRef, navRef, evaluate]);

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return undefined;

    pane.addEventListener("scroll", evaluate, { passive: true });
    window.addEventListener("resize", measure);

    // Re-measure whenever the page's own height changes — images and
    // fonts finishing late move every section below them.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro) for (const child of pane.children) ro.observe(child);

    // Layout is already available in an effect, so measure now; the
    // deferred pass catches anything that mounts in the same commit.
    measure();
    const t = setTimeout(measure, 0);

    return () => {
      clearTimeout(t);
      pane.removeEventListener("scroll", evaluate);
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [paneRef, evaluate, measure, routeKey]);

  return state;
}

function Pill({ children, style = {}, padded = true }) {
  const { scrolled, merged, glass } = useNavSurface();
  // Over a block that opts into merging (the Founder Summary's cover
  // photograph), the pill drops its chrome entirely — no fill, no blur, no
  // border, no shadow — so the nav reads as part of the image rather than
  // four chips sitting on top of it. The glass condenses back the moment
  // that block scrolls out from under the nav.
  const bare = merged;
  return (
    <div style={{
      display: "flex", alignItems: "center",
      height: 52, borderRadius: 999,
      background: bare ? "transparent" : scrolled ? glass.fillScrolled : glass.fill,
      backdropFilter: bare ? "none" : glass.blur,
      WebkitBackdropFilter: bare ? "none" : glass.blur,
      border: `1px solid ${bare ? "transparent" : glass.border}`,
      outline: `1px solid ${bare ? "transparent" : glass.outline}`,
      boxShadow: bare ? "none" : glass.shadow,
      padding: padded ? "0 8px" : 0,
      transition: "background 0.4s ease, border-color 0.4s ease, outline-color 0.4s ease, box-shadow 0.4s ease",
      flexShrink: 0,
      pointerEvents: "auto",
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionTab({ section }) {
  const [hovered, setHovered] = useState(false);
  const { glass } = useNavSurface();
  return (
    <NavLink
      to={section.path}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={({ isActive }) => ({
        position: "relative",
        display: "flex", alignItems: "center", gap: 7,
        padding: "0 15px", height: 38, borderRadius: 999,
        background: "transparent", border: "none",
        cursor: "pointer", fontFamily: "'Sora', sans-serif",
        fontSize: 13, fontWeight: isActive ? 600 : 500,
        color: isActive ? glass.activeText : glass.textSoft,
        transition: "color 0.35s ease",
        whiteSpace: "nowrap", textDecoration: "none",
        WebkitTapHighlightColor: "transparent",
      })}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-pill"
              transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.9 }}
              style={{ position: "absolute", inset: 0, borderRadius: 999, background: glass.activeFill, zIndex: 0 }}
            />
          )}
          {!isActive && hovered && (
            <span style={{ position: "absolute", inset: 0, borderRadius: 999, background: glass.hoverFill, zIndex: 0 }} />
          )}
          <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 7 }}>
            <SecIcon name={section.lucide} size={15} color={isActive ? glass.activeText : glass.label} style={{ transition: "color 0.35s ease" }} />
            {section.shortLabel}
          </span>
        </>
      )}
    </NavLink>
  );
}

// The signed-in user's own photo in the nav chip, falling back to their
// initials. Kept tiny and self-contained because it renders on every page: the
// URL is null when the record has no photo, so no request is made that is
// certain to 404, and a photo that fails to decode degrades to initials rather
// than a broken-image glyph sitting in the middle of the nav.
function UserAvatar({ user, size, bg, fg }) {
  const [broken, setBroken] = useState(false);
  const url = UsersAPI.avatarUrl(user);
  const show = url && !broken;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
      background: show ? "rgba(255,255,255,0.2)" : bg, color: fg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.37, fontWeight: 600,
      transition: "background 0.35s ease, color 0.35s ease",
    }}>
      {show
        ? <img src={url} alt="" onError={() => setBroken(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : (user.avatar || initials(user.name))}
    </div>
  );
}

// The chip is TWO controls sharing one pill, not one.
//
// Clicking your name or photo goes to your profile — that is what the whole
// chip looks like it should do, and it is what it now does. The chevron beside
// it still opens the small menu, because Sign out has to stay one click from
// anywhere; folding it into the profile page would have made signing out a
// two-step journey through a page nobody wanted to visit.
function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { glass } = useNavSurface();
  const roleLabel = getRole(user.role)?.label || user.role;

  // Close the menu whenever the route changes, so it can never be left
  // open (or appear "stuck") when navigating between pages.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div
      style={{
        position: "relative", display: "flex", alignItems: "center",
        height: 44, borderRadius: 999,
        background: open || hovered ? glass.hoverFill : "transparent",
        transition: "background 0.15s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => navigate("/profile")}
        title="Your profile"
        style={{
          display: "flex", alignItems: "center", gap: 9,
          padding: "4px 4px 4px 4px", height: 44,
          background: "transparent", border: "none",
          borderRadius: 999, cursor: "pointer",
          fontFamily: "'Sora', sans-serif", fontSize: 12,
        }}
      >
        <UserAvatar user={user} size={30} bg={glass.chipOnFill} fg={glass.chipOnText} />
        <div style={{ textAlign: "left" }}>
          <div style={{ fontWeight: 600, fontSize: 12.5, color: glass.text, lineHeight: 1.25, transition: "color 0.35s ease" }}>
            {user.name.split(" ")[0]}
          </div>
          <div style={{ fontSize: 10.5, color: glass.textSoft, lineHeight: 1.25, transition: "color 0.35s ease" }}>{roleLabel}</div>
        </div>
      </button>

      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", height: 44,
          padding: "0 10px 0 2px", background: "transparent",
          border: "none", borderRadius: 999, cursor: "pointer",
        }}
      >
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: "flex" }}
        >
          <ChevronDown size={14} color={glass.label} strokeWidth={2} />
        </motion.span>
      </button>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 899 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", top: "calc(100% + 10px)", right: 0, zIndex: 900,
            background: F.surface, border: `1px solid ${F.hairline}`,
            borderRadius: 12, overflow: "hidden", minWidth: 210,
            boxShadow: F.shadowLg,
          }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${F.hairline}` }}>
              <div style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontWeight: 600, fontSize: 14, color: F.ink }}>
                {user.name}
              </div>
              <div style={{ fontSize: 10.5, color: F.inkSoft, marginTop: 3 }}>{user.email}</div>
              <div style={{
                display: "inline-block", marginTop: 8,
                padding: "3px 9px", background: F.navyTint,
                borderRadius: 6, fontSize: 9.5, color: F.navy, fontWeight: 600,
              }}>
                {user.title}
              </div>
            </div>
            <div
              onClick={() => { setOpen(false); navigate("/profile"); }}
              style={{
                padding: "11px 16px", cursor: "pointer",
                fontSize: 11.5, color: F.ink, fontWeight: 500,
                borderBottom: `1px solid ${F.hairline}`, transition: "background 0.1s",
              }}
              onMouseOver={e => e.currentTarget.style.background = F.navyTint}
              onMouseOut={e => e.currentTarget.style.background = "transparent"}
            >
              Your profile
            </div>
            <div
              onClick={() => { setOpen(false); onLogout(); }}
              style={{
                padding: "11px 16px", cursor: "pointer",
                fontSize: 11.5, color: F.rust, fontWeight: 500,
                transition: "background 0.1s",
              }}
              onMouseOver={e => e.currentTarget.style.background = F.rustTint}
              onMouseOut={e => e.currentTarget.style.background = "transparent"}
            >
              Sign out
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AccessDenied({ section }) {
  return (
    <div style={{
      height: "100%", display: "flex", alignItems: "center",
      justifyContent: "center", flexDirection: "column", gap: 12,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: "50%",
        background: F.navyTint, color: F.navy,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16,
      }}>
        ◎
      </div>
      <div style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontWeight: 600, fontSize: 15, color: F.ink }}>
        Access restricted
      </div>
      <div style={{ fontSize: 11.5, color: F.inkSoft, textAlign: "center", maxWidth: 300, lineHeight: 1.6 }}>
        You don't have access to <strong style={{ color: F.ink }}>{section?.label}</strong>.
      </div>
    </div>
  );
}

function ReadOnlyBanner() {
  return (
    <div style={{
      padding: "8px 18px", background: F.navyTint,
      borderBottom: `1px solid ${F.hairline}`,
      fontSize: 10.5, color: F.navy,
      display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
      fontFamily: "'Sora', sans-serif",
    }}>
      <span>ⓘ</span>
      <span>You are viewing Billing in <strong>read-only mode</strong>. You can see updates but cannot edit financial records.</span>
    </div>
  );
}

const initials = (s) =>
  (s || "?").split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

function BrandSelect({ brands, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const location = useLocation();
  const { glass } = useNavSurface();

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => { if (!open) setQ(""); }, [open]);

  // Close on route change so it never lingers open across pages.
  useEffect(() => { setOpen(false); }, [location.pathname]);

  if (brands.length === 0) return null;

  const selected = brands.find(b => b.id === value);
  const selectedLogo = ClientsAPI.avatarUrl(selected);
  const shown = q
    ? brands.filter(b => b.name.toLowerCase().includes(q.toLowerCase()))
    : brands;

  const row = (active, label, sub, onClick, key) => (
    <button
      key={key}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        padding: "9px 12px", background: active ? F.navyTint : "transparent",
        border: "none", cursor: "pointer", textAlign: "left",
        fontFamily: "'Sora', sans-serif", fontSize: 12.5,
        color: F.ink, transition: "background 0.1s",
      }}
      onMouseOver={e => { if (!active) e.currentTarget.style.background = F.paper; }}
      onMouseOut={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{
        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
        background: active ? F.navy : F.hairline,
        color: active ? "#FFFFFF" : F.inkSoft,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 600,
      }}>{sub}</span>
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {active && <Check size={15} color={F.navy} strokeWidth={2.2} />}
    </button>
  );

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: 9,
          padding: "6px 14px 6px 6px", height: 40,
          background: open || hovered ? glass.hoverFill : "transparent",
          border: "none",
          borderRadius: 999, cursor: "pointer",
          fontFamily: "'Sora', sans-serif", fontSize: 12.5,
          fontWeight: value ? 600 : 500,
          color: glass.text,
          transition: "background 0.15s, color 0.35s ease",
        }}
      >
        {/* Shows the selected brand's LOGO rather than only its initials, so
            the control you scoped the app with identifies the brand at a
            glance. Kept in the theme's own colours — brand-derived hues are
            deliberately not used anywhere in the shell. */}
        <span style={{
          width: 24, height: 24, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
          background: selectedLogo ? "#FFFFFF" : (value ? glass.chipOnFill : glass.chipOffFill),
          color: value ? glass.chipOnText : glass.chipOffText,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: 700,
          transition: "background 0.35s ease, color 0.35s ease",
        }}>
          {selectedLogo
            ? <img src={selectedLogo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
            : (selected ? initials(selected.name) : "AB")}
        </span>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>
          {selected ? selected.name : "All brands"}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: "flex", flexShrink: 0 }}
        >
          <ChevronDown size={15} color={glass.label} strokeWidth={2} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 899 }} onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.99 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 900,
                minWidth: 250, maxHeight: 340, overflowY: "auto",
                background: F.surface, border: `1px solid ${F.hairline}`,
                borderRadius: 12, boxShadow: F.shadowLg, padding: "6px 0",
              }}
            >
              {brands.length > 7 && (
                <div style={{ padding: "4px 10px 8px" }}>
                  <input
                    autoFocus
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Find a brand"
                    style={{
                      width: "100%", padding: "7px 10px",
                      border: `1px solid ${F.hairline}`, borderRadius: 7,
                      fontFamily: "'Sora', sans-serif", fontSize: 12,
                      color: F.ink, outline: "none", background: F.paper,
                    }}
                  />
                </div>
              )}
              {row(!value, "All brands", "AB", () => { onChange(null); setOpen(false); }, "__all")}
              {shown.length > 0 && (
                <div style={{ height: 1, background: F.hairline, margin: "6px 0" }} />
              )}
              {shown.map(b =>
                row(b.id === value, b.name, initials(b.name), () => { onChange(b.id); setOpen(false); }, b.id)
              )}
              {shown.length === 0 && (
                <div style={{ padding: "10px 12px", fontSize: 12, color: F.label }}>No brand matches.</div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function RailButton({ label, onClick, children }) {
  const [h, setH] = useState(false);
  const { glass } = useNavSurface();
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: 36, height: 36, borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: h ? glass.hoverFill : "transparent",
        border: "none",
        color: h ? glass.text : glass.textSoft,
        cursor: "pointer",
        transition: "background 0.15s, color 0.35s ease",
      }}
    >
      {children}
    </button>
  );
}

function CommandPalette({ open, onClose, sections, brands, onBrand, brandFilter, showBrands = true }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const navigate = useNavigate();

  const items = [
    ...sections.map(s => ({ key: `s:${s.id}`, icon: s.lucide, label: s.label, hint: "Section", run: () => navigate(s.path) })),
    // Brand entries follow the brand pill: hidden wherever the filter
    // itself is, so the palette can't set a filter the page ignores.
    ...(showBrands
      ? [
          { key: "b:all", icon: "Building2", label: "All brands", hint: "Brand filter", run: () => onBrand(null) },
          ...brands.map(b => ({ key: `b:${b.id}`, icon: "Building2", label: b.name, hint: "Brand filter", run: () => onBrand(b.id) })),
        ]
      : []),
  ].filter(it => !q || it.label.toLowerCase().includes(q.toLowerCase()));

  useEffect(() => { setI(0); }, [q]);
  useEffect(() => { if (!open) setQ(""); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") return onClose();
      if (e.key === "ArrowDown") { e.preventDefault(); setI(v => Math.min(v + 1, items.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setI(v => Math.max(v - 1, 0)); }
      if (e.key === "Enter" && items[i]) { e.preventDefault(); items[i].run(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items, i, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 900, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh" }}>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{ position: "absolute", inset: 0, background: "rgba(20,21,26,0.38)", backdropFilter: "blur(3px)" }}
          />
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "relative", width: "min(520px, 92vw)",
              background: F.surface, border: `1px solid ${F.hairline}`,
              borderRadius: 14, boxShadow: F.shadowLg, overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: `1px solid ${F.hairline}` }}>
              <Search size={17} color={F.label} strokeWidth={1.9} />
              <input
                autoFocus value={q} onChange={e => setQ(e.target.value)}
                placeholder="Jump to a section or brand"
                style={{ flex: 1, border: "none", outline: "none", fontFamily: "'Sora', sans-serif", fontSize: 13.5, color: F.ink, background: "transparent" }}
              />
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto", padding: "6px 0" }}>
              {items.map((it, n) => (
                <button
                  key={it.key}
                  onMouseEnter={() => setI(n)}
                  onClick={() => { it.run(); onClose(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 11, width: "100%",
                    padding: "10px 16px", border: "none", cursor: "pointer", textAlign: "left",
                    background: n === i ? F.navyTint : "transparent",
                    fontFamily: "'Sora', sans-serif", fontSize: 13, color: F.ink,
                  }}
                >
                  <SecIcon name={it.icon} size={16} color={n === i ? F.navy : F.label} />
                  <span style={{ flex: 1 }}>{it.label}</span>
                  <span style={{ fontSize: 10.5, color: F.label }}>{it.hint}</span>
                  {it.key === `b:${brandFilter}` || (it.key === "b:all" && !brandFilter)
                    ? <Check size={14} color={F.navy} strokeWidth={2.2} /> : null}
                </button>
              ))}
              {items.length === 0 && (
                <div style={{ padding: "16px", fontSize: 13, color: F.label }}>Nothing matches “{q}”.</div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate  = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  const [brandFilter, setBrandFilter] = useState(() => {
    try { return sessionStorage.getItem("5av_brandFilter") || null; } catch { return null; }
  });
  const [brands, setBrands] = useState([]);

  const handleBrandChange = (val) => {
    setBrandFilter(val);
    try {
      if (val) sessionStorage.setItem("5av_brandFilter", val);
      else sessionStorage.removeItem("5av_brandFilter");
    } catch {}
  };

  const loadBrands = () => {
    ClientsAPI.list()
      .then(list => {
        // hasAvatar/avatarUpdatedAt come along so anything rendering a brand can
        // build its logo URL (ClientsAPI.avatarUrl) without refetching the
        // clients collection. Still no image bytes — those are served per-logo.
        const brandsList = list
          .map(c => ({ id: c.id, name: c.name, hasAvatar: c.hasAvatar, avatarUpdatedAt: c.avatarUpdatedAt }))
          .filter(b => b.name);
        setBrands(brandsList);
        setBrandFilter(prev => (prev && !brandsList.some(b => b.id === prev) ? null : prev));
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadBrands();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(o => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close the command palette whenever the route changes (e.g. after
  // jumping to a section from within it), so it never lingers open.
  useEffect(() => {
    setSearchOpen(false);
  }, [location.pathname]);

  const paneRef = useRef(null);
  const navRef = useRef(null);

  const handleLogout = () => {
    handleBrandChange(null);
    logout();
    navigate("/login", { replace: true });
  };

  const visibleSections = SECTIONS.filter(s => canAccess(s, user.role));
  const activeSec = SECTIONS.find(s => location.pathname === s.path || location.pathname.startsWith(s.path + "/"));
  const hasAccess  = activeSec ? canAccess(activeSec, user.role) : true;
  const isSummary  = activeSec?.id === "summary";

  // `scrolled` deepens the glass slightly once the pane has moved.
  // `onDark` picks which material the pills wear, from what is passing
  // beneath them right now — light everywhere by default; only pages
  // that scroll dark full-bleed blocks under the nav ever flip it.
  // `merged` drops the chrome altogether while a block that asked to own
  // the nav (a full-bleed cover image) is under it.
  const { scrolled, onDark, merged } = useNavSurfaceState(paneRef, navRef, location.pathname);
  const glass = onDark ? GLASS_DARK : GLASS_LIGHT;

  return (
    <div style={{
      position: "relative",
      height: "100%", width: "100%",
      background: F.paper, color: F.ink,
      fontFamily: "'Sora', sans-serif",
      overflow: "hidden",
    }}>
      {/* ── PAGE CONTENT ──
          Fills the entire shell (not squeezed below the nav in normal
          flow) and scrolls underneath the floating nav. paddingTop just
          keeps content clear of the pills on initial load; once the
          user scrolls, content genuinely passes behind the glass, which
          is what makes the blur/transparency actually visible instead
          of just showing flat page background.

          The Summary route is the one exception: its first section is a
          full-bleed cover photograph that opts into `data-nav-merge` (see
          Pill above) specifically so the nav can sit directly on the image
          with no chrome. A top-padding gap here would leave a band of flat
          page background between the pane's edge and where that photo
          starts, undercutting the merge before the user ever scrolls — so
          Summary alone renders flush and lets its own hero handle contrast
          for the nav labels.

          `app-scroll-pane` hides this pane's own scrollbar (see index.css)
          — the app's single primary scroll region reads cleaner without a
          visible track, and every other scrollable area (dropdowns,
          modals, tables) is untouched since the rule is scoped to this
          class, not global. */}
      <div
        ref={paneRef}
        className="app-scroll-pane"
        style={{
          position: "absolute", inset: 0,
          overflowY: "auto", overflowX: "hidden",
          display: "flex", flexDirection: "column",
          paddingTop: isSummary ? 0 : TOPBAR_H + 22,
        }}
      >
        {hasAccess
          ? <Outlet context={{ user, role: user.role, brandFilter, setBrandFilter, brands, refreshBrands: loadBrands, topBarHeight: TOPBAR_H }} />
          : <AccessDenied section={activeSec} />
        }
      </div>

      <NavCtx.Provider value={{ scrolled, merged, glass }}>
        {/* ── NAV ──
            Not a bar — four independent floating glass pills (logo ·
            brand filter · section tabs · search+user) with transparent
            gaps between them. The row itself is position:absolute and
            pointer-events:none so it floats over the scrolling content
            pane (letting the blur pick up real content behind it)
            while clicks pass through the transparent gaps to whatever
            is underneath; each Pill re-enables pointer-events so its
            own buttons/links still work normally. Rendered once here in
            AppShell — which wraps every routed page via <Outlet> above —
            so the brand pill, section tabs, search, and the user/logout
            menu are present and functional identically on every page. */}
        <div ref={navRef} style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 30,
          pointerEvents: "none",
          display: "flex", alignItems: "center", gap: 14,
          padding: "14px 18px 0", flexWrap: "wrap",
          // Merged into a photograph, the labels have no pane behind them —
          // a soft shadow is what keeps them off the image's own highlights.
          // drop-shadow covers the SVG icons, which text-shadow does not.
          textShadow: merged ? "0 1px 14px rgba(0,0,0,0.55)" : "none",
          filter: merged ? "drop-shadow(0 1px 10px rgba(0,0,0,0.45))" : "none",
          transition: "filter 0.4s ease",
        }}>
          <Pill style={{ padding: "0 20px" }}>
            <span style={{
              fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 700,
              textTransform: "uppercase", color: glass.text, letterSpacing: "0.24em",
              whiteSpace: "nowrap", transition: "color 0.35s ease",
            }}>
              Fifth Avenue
            </span>
          </Pill>

          {/* On every route, the Summary included. The filter used to be hidden
              there on the grounds that the report is agency-wide, but a nav bar
              that gains and loses a control as you move between sections reads
              as a bug, and "the agency" is simply the unfiltered case of "this
              brand". The Summary scopes its own brand-bearing collections to
              match — see FounderSummary. */}
          <Pill>
            <BrandSelect brands={brands} value={brandFilter} onChange={handleBrandChange} />
          </Pill>

          <Pill style={{ flex: "1 1 auto", minWidth: 0, justifyContent: "center", overflowX: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 3, minWidth: 0 }}>
              {visibleSections.map(s => <SectionTab key={s.id} section={s} />)}
            </div>
          </Pill>

          <Pill style={{ padding: "0 6px 0 10px", gap: 4 }}>
            <RailButton label="Search  (⌘K)" onClick={() => setSearchOpen(true)}>
              <Search size={16} strokeWidth={1.9} />
            </RailButton>
            <UserMenu user={user} onLogout={handleLogout} />
          </Pill>
        </div>
      </NavCtx.Provider>

      <CommandPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        sections={visibleSections}
        brands={brands}
        brandFilter={brandFilter}
        onBrand={handleBrandChange}
      />
    </div>
  );
}

export { TOPBAR_H };