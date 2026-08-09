import { useState, useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard, SquareKanban, IndianRupee, Sparkles, Inbox, ShieldCheck,
  Building2, Search, ChevronDown, Check, Circle,
} from "lucide-react";
import { SECTIONS, canAccess, getRole } from "../routes/sections";
import { useAuth } from "../context/AuthContext";
import { ClientsAPI } from "../lib/api";

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
const GLASS = {
  fill: "rgba(255,255,255,0.10)",
  fillScrolled: "rgba(255,255,255,0.20)",
  border: "rgba(255,255,255,0.65)",
  outline: "rgba(255,255,255,0.30)",
  blur: "blur(28px) saturate(2.4)",
  shadow: "inset 0 1px 0 rgba(255,255,255,0.65), inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 -12px 20px -14px rgba(255,255,255,0.35), 0 1px 2px rgba(20,21,26,0.03), 0 20px 44px -14px rgba(20,21,26,0.20)",

  hoverFill: "rgba(255,255,255,0.28)",
  chipBorder: "rgba(255,255,255,0.35)",
};

function Pill({ children, style = {}, padded = true }) {
  const [scrolled] = usePaneScroll();
  return (
    <div style={{
      display: "flex", alignItems: "center",
      height: 52, borderRadius: 999,
      background: scrolled ? GLASS.fillScrolled : GLASS.fill,
      backdropFilter: GLASS.blur,
      WebkitBackdropFilter: GLASS.blur,
      border: `1px solid ${GLASS.border}`,
      outline: `1px solid ${GLASS.outline}`,
      boxShadow: GLASS.shadow,
      padding: padded ? "0 8px" : 0,
      transition: "background 0.25s ease",
      flexShrink: 0,
      pointerEvents: "auto",
      ...style,
    }}>
      {children}
    </div>
  );
}

// Tiny shared context so every independent pill can react to page
// scroll together (deepen slightly) without being wired through props.
import { createContext, useContext } from "react";
const ScrollCtx = createContext([false]);
function usePaneScroll() { return useContext(ScrollCtx); }

const TOPBAR_H = 84;

function SectionTab({ section }) {
  const [hovered, setHovered] = useState(false);
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
        color: isActive ? "#FFFFFF" : F.inkSoft,
        transition: "color 0.18s",
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
              style={{ position: "absolute", inset: 0, borderRadius: 999, background: F.navy, zIndex: 0 }}
            />
          )}
          {!isActive && hovered && (
            <span style={{ position: "absolute", inset: 0, borderRadius: 999, background: GLASS.hoverFill, zIndex: 0 }} />
          )}
          <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 7 }}>
            <SecIcon name={section.lucide} size={15} color={isActive ? "#FFFFFF" : F.label} style={{ transition: "color 0.18s" }} />
            {section.shortLabel}
          </span>
        </>
      )}
    </NavLink>
  );
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const location = useLocation();
  const roleLabel = getRole(user.role)?.label || user.role;

  // Close the menu whenever the route changes, so it can never be left
  // open (or appear "stuck") when navigating between pages.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex", alignItems: "center", gap: 9,
          padding: "4px 12px 4px 4px", height: 44,
          background: open || hovered ? GLASS.hoverFill : "transparent",
          border: "none",
          borderRadius: 999, cursor: "pointer",
          fontFamily: "'Sora', sans-serif", fontSize: 12,
          transition: "background 0.15s",
        }}
      >
        <div style={{
          width: 30, height: 30, borderRadius: "50%",
          background: F.navy, color: "#FFFFFF",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 600, flexShrink: 0,
        }}>
          {user.avatar}
        </div>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontWeight: 600, fontSize: 12.5, color: F.ink, lineHeight: 1.25 }}>
            {user.name.split(" ")[0]}
          </div>
          <div style={{ fontSize: 10.5, color: F.inkSoft, lineHeight: 1.25 }}>{roleLabel}</div>
        </div>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: "flex", marginLeft: 2 }}
        >
          <ChevronDown size={14} color={F.label} strokeWidth={2} />
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
          background: open || hovered ? GLASS.hoverFill : "transparent",
          border: "none",
          borderRadius: 999, cursor: "pointer",
          fontFamily: "'Sora', sans-serif", fontSize: 12.5,
          fontWeight: value ? 600 : 500,
          color: F.ink,
          transition: "background 0.15s",
        }}
      >
        <span style={{
          width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
          background: value ? F.navy : F.hairline,
          color: value ? "#FFFFFF" : F.inkSoft,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: 700,
        }}>{selected ? initials(selected.name) : "AB"}</span>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>
          {selected ? selected.name : "All brands"}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: "flex", flexShrink: 0 }}
        >
          <ChevronDown size={15} color={F.label} strokeWidth={2} />
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
        background: h ? GLASS.hoverFill : "transparent",
        border: "none",
        color: h ? F.ink : F.inkSoft,
        cursor: "pointer",
        transition: "background 0.15s, color 0.15s",
      }}
    >
      {children}
    </button>
  );
}

function CommandPalette({ open, onClose, sections, brands, onBrand, brandFilter }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const navigate = useNavigate();

  const items = [
    ...sections.map(s => ({ key: `s:${s.id}`, icon: s.lucide, label: s.label, hint: "Section", run: () => navigate(s.path) })),
    { key: "b:all", icon: "Building2", label: "All brands", hint: "Brand filter", run: () => onBrand(null) },
    ...brands.map(b => ({ key: `b:${b.id}`, icon: "Building2", label: b.name, hint: "Brand filter", run: () => onBrand(b.id) })),
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
  const [scrolled, setScrolled] = useState(false);

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
        const brandsList = list.map(c => ({ id: c.id, name: c.name })).filter(b => b.name);
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

  // Cosmetic only: every independent pill deepens its glass slightly
  // once the page pane has scrolled, via ScrollCtx below — the pills
  // never overlap page content, so nothing is ever hidden beneath them.
  const paneRef = useRef(null);
  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 8);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const handleLogout = () => {
    handleBrandChange(null);
    logout();
    navigate("/login", { replace: true });
  };

  const visibleSections = SECTIONS.filter(s => canAccess(s, user.role));
  const activeSec = SECTIONS.find(s => location.pathname === s.path || location.pathname.startsWith(s.path + "/"));
  const hasAccess  = activeSec ? canAccess(activeSec, user.role) : true;

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
          of just showing flat page background. */}
      <div
        ref={paneRef}
        style={{
          position: "absolute", inset: 0,
          overflowY: "auto", overflowX: "hidden",
          display: "flex", flexDirection: "column",
          paddingTop: TOPBAR_H + 22,
        }}
      >
        {hasAccess
          ? <Outlet context={{ user, role: user.role, brandFilter, setBrandFilter, brands, refreshBrands: loadBrands, topBarHeight: TOPBAR_H }} />
          : <AccessDenied section={activeSec} />
        }
      </div>

      <ScrollCtx.Provider value={[scrolled]}>
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
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 30,
          pointerEvents: "none",
          display: "flex", alignItems: "center", gap: 14,
          padding: "14px 18px 0", flexWrap: "wrap",
        }}>
          <Pill style={{ padding: "0 20px" }}>
            <span style={{
              fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 700,
              textTransform: "uppercase", color: F.ink, letterSpacing: "0.24em",
              whiteSpace: "nowrap",
            }}>
              Fifth Avenue
            </span>
          </Pill>

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
      </ScrollCtx.Provider>

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