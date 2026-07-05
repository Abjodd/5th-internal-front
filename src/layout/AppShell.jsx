/**
 * 5th Avenue — AppShell
 * Top bar driven by real logged-in user from AuthContext.
 * No more role dropdown — role comes from the authenticated user.
 * Each page receives `user` (full user object) via Outlet context.
 *
 * Visual identity: quiet modern formal — ivory surfaces, deep navy accent,
 * Newsreader for display type, Sora for UI. Soft elevation instead of
 * ornament. Styling only; logic below is unchanged from the original.
 */
import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { SECTIONS, canAccess, getRole } from "../routes/sections";
import { useAuth } from "../context/AuthContext";

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

function SectionTab({ section }) {
  const [hovered, setHovered] = useState(false);
  return (
    <NavLink
      to={section.path}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={({ isActive }) => ({
        display: "flex", alignItems: "center", gap: 7,
        padding: "0 16px", height: "100%",
        background: "transparent", border: "none",
        borderBottom: `2px solid ${isActive ? F.navy : "transparent"}`,
        cursor: "pointer", fontFamily: "'Sora', sans-serif",
        fontSize: 12, fontWeight: isActive ? 600 : 500,
        color: isActive ? F.ink : hovered ? F.ink : F.inkSoft,
        transition: "color 0.15s, border-color 0.15s",
        whiteSpace: "nowrap", textDecoration: "none",
      })}
    >
      {({ isActive }) => (
        <>
          <span style={{ fontSize: 12, color: isActive ? F.navy : F.label }}>
            {section.icon}
          </span>
          {section.shortLabel}
        </>
      )}
    </NavLink>
  );
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const roleLabel = getRole(user.role)?.label || user.role;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 9,
          padding: "5px 10px 5px 5px",
          background: F.surface, border: `1px solid ${F.hairline}`,
          borderRadius: 20, cursor: "pointer",
          fontFamily: "'Sora', sans-serif", fontSize: 11, color: F.ink,
          transition: "box-shadow 0.15s",
        }}
        onMouseOver={e => e.currentTarget.style.boxShadow = F.shadowSm}
        onMouseOut={e => e.currentTarget.style.boxShadow = "none"}
      >
        <div style={{
          width: 26, height: 26, borderRadius: "50%",
          background: F.navy, color: "#FFFFFF",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 600, flexShrink: 0,
        }}>
          {user.avatar}
        </div>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontWeight: 600, fontSize: 11.5, color: F.ink, lineHeight: 1.2 }}>
            {user.name.split(" ")[0]}
          </div>
          <div style={{ fontSize: 9.5, color: F.inkSoft, lineHeight: 1.2 }}>{roleLabel}</div>
        </div>
        <span style={{ color: F.label, fontSize: 8, marginLeft: 2 }}>▾</span>
      </button>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", top: "calc(100% + 10px)", right: 0, zIndex: 50,
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

export default function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate  = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  // Which sections can this user see in the nav?
  const visibleSections = SECTIONS.filter(s => canAccess(s, user.role));

  // What section is currently active?
  const activeSec = SECTIONS.find(s => location.pathname === s.path || location.pathname.startsWith(s.path + "/"));

  const hasAccess  = activeSec ? canAccess(activeSec, user.role) : true;

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100vh", width: "100vw",
      background: F.paper, color: F.ink,
      fontFamily: "'Sora', sans-serif", overflow: "hidden",
    }}>
      {/* ── TOP BAR ── */}
      <div style={{
        height: 56, flexShrink: 0,
        display: "flex", alignItems: "stretch",
        background: F.surface,
        borderBottom: `1px solid ${F.hairline}`,
        padding: "0 0 0 22px",
      }}>
        {/* Wordmark */}
        <div style={{
          display: "flex", alignItems: "center",
          paddingRight: 22, marginRight: 6,
          borderRight: `1px solid ${F.hairline}`,
        }}>
          <span style={{
            fontFamily: "'Newsreader', serif",
            fontSize: 16, fontStyle: "italic",
            fontWeight: 600, color: F.ink, letterSpacing: "-0.01em",
          }}>
            5th Avenue
          </span>
        </div>

        {/* Nav tabs */}
        <div style={{ display: "flex", alignItems: "stretch", flex: 1, overflowX: "auto" }}>
          {visibleSections.map(s => <SectionTab key={s.id} section={s} />)}
        </div>

        {/* User menu */}
        <div style={{
          display: "flex", alignItems: "center",
          paddingRight: 18, paddingLeft: 14,
          borderLeft: `1px solid ${F.hairline}`,
        }}>
          <UserMenu user={user} onLogout={handleLogout} />
        </div>
      </div>

      {/* ── PAGE CONTENT ── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {hasAccess
          ? <Outlet context={{ user, role: user.role }} />
          : <AccessDenied section={activeSec} />
        }
      </div>
    </div>
  );
}