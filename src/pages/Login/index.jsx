/**
 * 5th Avenue — Login Page
 * Clean, editorial. Left panel = brand identity, right = form.
 * Maps email/password to a user→role from AuthContext.
 */
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { T } from "../../theme/tokens";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate   = useNavigate();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [err,      setErr]      = useState("");
  const [loading,  setLoading]  = useState(false);

  // Purely presentational — drives the cursor-follow spotlight on the brand panel.
  const panelRef = useRef(null);
  const [spot, setSpot] = useState({ x: 50, y: 50 });
  const handlePanelMove = (e) => {
    const el = panelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSpot({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    // Small delay so it doesn't feel instant-fake
    await new Promise(r => setTimeout(r, 320));
    const result = await login(email, password);
    setLoading(false);
    if (result.ok) {
      navigate("/campaigns", { replace: true });
    } else {
      setErr(result.error);
    }
  };

  return (
    <div style={{
      display: "flex", height: "100vh", width: "100vw",
      fontFamily: "'Sora', sans-serif", background: T.bg,
      overflow: "hidden",
    }}>
      <style>{`
        @keyframes meshDrift1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(6%,-8%) scale(1.15); } }
        @keyframes meshDrift2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-8%,6%) scale(1.1); } }
        @keyframes meshDrift3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(4%,10%) scale(0.9); } }
        @keyframes orbFloat { 0%,100% { transform: translateY(0) translateX(0) rotate(0deg); } 33% { transform: translateY(-22px) translateX(14px) rotate(4deg); } 66% { transform: translateY(14px) translateX(-10px) rotate(-3deg); } }
        @keyframes shimmerLine { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes riseIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes softPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .la-input:focus { box-shadow: 0 0 0 4px ${T.accent}1a; }
      `}</style>

      {/* ── LEFT BRAND PANEL ─── */}
      <div
        ref={panelRef}
        onMouseMove={handlePanelMove}
        style={{
          width: "42%", minWidth: 340,
          background: `linear-gradient(160deg, ${T.accent} 0%, #14204A 55%, #0F172A 100%)`,
          display: "flex", flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px 52px",
          position: "relative", overflow: "hidden",
        }}
      >
        {/* Drifting mesh blobs */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div style={{
            position: "absolute", width: 460, height: 460, borderRadius: "50%",
            left: "-12%", top: "-14%", opacity: 0.45, filter: "blur(90px)",
            background: "radial-gradient(circle, #6C8CFF, transparent 70%)",
            animation: "meshDrift1 16s ease-in-out infinite",
          }} />
          <div style={{
            position: "absolute", width: 400, height: 400, borderRadius: "50%",
            right: "-10%", bottom: "-14%", opacity: 0.35, filter: "blur(100px)",
            background: "radial-gradient(circle, #7860D6, transparent 70%)",
            animation: "meshDrift2 20s ease-in-out infinite",
          }} />
          <div style={{
            position: "absolute", width: 320, height: 320, borderRadius: "50%",
            left: "32%", top: "42%", opacity: 0.22, filter: "blur(100px)",
            background: "radial-gradient(circle, #1E9E5A, transparent 70%)",
            animation: "meshDrift3 22s ease-in-out infinite",
          }} />
        </div>

        {/* Cursor-follow spotlight */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `radial-gradient(420px circle at ${spot.x}% ${spot.y}%, rgba(255,255,255,0.08), transparent 65%)`,
          transition: "background 0.2s",
        }} />

        {/* Fine grain texture */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.05, mixBlendMode: "overlay", pointerEvents: "none" }}>
          <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" /></filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>

        {/* Subtle texture circles — now gently orbiting */}
        <div style={{
          position: "absolute", width: 400, height: 400,
          borderRadius: "50%", border: "1px solid rgba(255,255,255,0.07)",
          top: -120, right: -120, pointerEvents: "none",
          animation: "orbFloat 24s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", width: 260, height: 260,
          borderRadius: "50%", border: "1px solid rgba(255,255,255,0.05)",
          bottom: 60, left: -80, pointerEvents: "none",
          animation: "orbFloat 19s ease-in-out infinite reverse",
        }} />
        <div style={{
          position: "absolute", width: 110, height: 110,
          borderRadius: "50%", border: "1px solid rgba(255,255,255,0.09)",
          top: "58%", right: "20%", pointerEvents: "none",
          animation: "orbFloat 13s ease-in-out infinite",
        }} />

        {/* Logo */}
        <div style={{ position: "relative", animation: "riseIn 0.7s cubic-bezier(0.16,1,0.3,1) both" }}>
          <div style={{
            fontFamily: "'Newsreader', serif",
            fontSize: 22, fontStyle: "italic", fontWeight: 600,
            color: "#FFFFFF", letterSpacing: "-0.02em", marginBottom: 8,
          }}>
            5th Avenue
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 9.5, color: "rgba(255,255,255,0.45)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            <span style={{ width: 22, height: 1, background: "rgba(255,255,255,0.3)" }} />
            Internal Operating System
          </div>
        </div>

        {/* Centre copy */}
        <div style={{ position: "relative", animation: "riseIn 0.8s 0.15s cubic-bezier(0.16,1,0.3,1) both" }}>
          <div style={{
            fontFamily: "'Newsreader', serif",
            fontSize: 38, lineHeight: 1.18,
            color: "#FFFFFF", fontWeight: 500,
            fontStyle: "italic", marginBottom: 20,
          }}>
            Every campaign,<br />every creator,<br />
            <span style={{
              background: "linear-gradient(90deg, #FFFFFF, rgba(255,255,255,0.55))",
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            }}>one place.</span>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, maxWidth: 280 }}>
            Manage influencer campaigns, track billing, and keep your team aligned — end to end.
          </div>
        </div>

        {/* Bottom role hint */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, fontSize: 10, color: "rgba(255,255,255,0.28)", lineHeight: 1.6, animation: "riseIn 0.8s 0.3s cubic-bezier(0.16,1,0.3,1) both" }}>
          <span style={{
            width: 90, height: 1,
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
            backgroundSize: "200% 100%",
            animation: "shimmerLine 3.5s linear infinite",
          }} />
          <span>Access is scoped to your role.<br />Contact your admin if you need help logging in.</span>
        </div>
      </div>

      {/* ── RIGHT FORM PANEL ─── */}
      <div style={{
        flex: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "40px 32px",
        position: "relative",
      }}>
        {/* Ambient glow on the light side */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
          <div style={{
            position: "absolute", width: 380, height: 380, borderRadius: "50%",
            right: "10%", top: "10%", opacity: 0.1, filter: "blur(110px)",
            background: `radial-gradient(circle, ${T.accent}, transparent 70%)`,
            animation: "meshDrift1 18s ease-in-out infinite",
          }} />
        </div>

        <div style={{
          width: "100%", maxWidth: 380, position: "relative",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 20,
          padding: "36px 34px",
          boxShadow: "0 30px 70px rgba(15,23,42,0.08)",
          animation: "riseIn 0.6s cubic-bezier(0.16,1,0.3,1) both",
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 999,
            border: `1px solid ${T.accent}26`, background: `${T.accent}0f`,
            fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
            color: T.accent, marginBottom: 14,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.accent, animation: "softPulse 2s ease-in-out infinite" }} />
            Workspace sign in
          </div>

          <div style={{ marginBottom: 30 }}>
            <div style={{
              fontFamily: "'Newsreader', serif",
              fontSize: 26, fontStyle: "italic", fontWeight: 600, color: T.text,
              letterSpacing: "-0.02em", marginBottom: 6,
            }}>
              Sign in
            </div>
            <div style={{ fontSize: 12, color: T.sub }}>
              Use your 5th Avenue workspace credentials.
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: "block", fontSize: 10.5, fontWeight: 500,
                color: T.sub, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase",
              }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setErr(""); }}
                placeholder="you@5thavenue.in"
                autoFocus
                required
                className="la-input"
                style={{
                  width: "100%", padding: "12px 14px",
                  fontSize: 13, color: T.text,
                  background: T.raised,
                  border: `1.5px solid ${err ? T.red : T.border}`,
                  borderRadius: 12, outline: "none",
                  fontFamily: "'Sora', sans-serif",
                  boxSizing: "border-box",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
                onFocus={e => { if (!err) e.target.style.borderColor = T.accent; }}
                onBlur={e => { if (!err) e.target.style.borderColor = T.border; }}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: err ? 10 : 24 }}>
              <label style={{
                display: "block", fontSize: 10.5, fontWeight: 500,
                color: T.sub, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase",
              }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setErr(""); }}
                placeholder="••••••••"
                required
                className="la-input"
                style={{
                  width: "100%", padding: "12px 14px",
                  fontSize: 13, color: T.text,
                  background: T.raised,
                  border: `1.5px solid ${err ? T.red : T.border}`,
                  borderRadius: 12, outline: "none",
                  fontFamily: "'Sora', sans-serif",
                  boxSizing: "border-box",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
                onFocus={e => { if (!err) e.target.style.borderColor = T.accent; }}
                onBlur={e => { if (!err) e.target.style.borderColor = T.border; }}
              />
            </div>

            {/* Error */}
            {err && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 11.5, color: T.red,
                background: `${T.red}0d`, border: `1px solid ${T.red}33`,
                borderRadius: 10, padding: "8px 12px",
                marginBottom: 20,
                animation: "riseIn 0.25s cubic-bezier(0.16,1,0.3,1) both",
              }}>
                <span>⚠</span>{err}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "13px",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: loading ? T.mute : T.accent,
                color: loading ? T.label : "#FFFFFF",
                border: "none", borderRadius: 999,
                fontSize: 13, fontWeight: 600,
                fontFamily: "'Sora', sans-serif",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "transform 0.15s, box-shadow 0.15s, background 0.15s",
                letterSpacing: "0.01em",
                boxShadow: loading ? "none" : `0 10px 26px ${T.accent}40`,
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = `0 14px 32px ${T.accent}55`; } }}
              onMouseLeave={e => { if (!loading) { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = `0 10px 26px ${T.accent}40`; } }}
            >
              {loading && (
                <span style={{
                  width: 14, height: 14, borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff",
                  animation: "spin 0.7s linear infinite",
                }} />
              )}
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          
        </div>
      </div>
    </div>
  );
}