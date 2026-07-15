/**
 * 5th Avenue — Login Page
 * Clean, editorial. Left panel = brand identity, right = form.
 * Maps email/password to a user→role from AuthContext.
 */
import { useState } from "react";
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
    }}>
      {/* ── LEFT BRAND PANEL ─── */}
      <div style={{
        width: "42%", minWidth: 340,
        background: T.accent,
        display: "flex", flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px 52px",
        position: "relative", overflow: "hidden",
      }}>
        {/* Subtle texture circles */}
        <div style={{
          position: "absolute", width: 400, height: 400,
          borderRadius: "50%", border: "1px solid rgba(255,255,255,0.06)",
          top: -120, right: -120, pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", width: 260, height: 260,
          borderRadius: "50%", border: "1px solid rgba(255,255,255,0.04)",
          bottom: 60, left: -80, pointerEvents: "none",
        }} />

        {/* Logo */}
        <div>
          <div style={{
            fontFamily: "'Newsreader', serif",
            fontSize: 22, fontStyle: "italic", fontWeight: 600,
            color: "#FFFFFF", letterSpacing: "-0.02em", marginBottom: 6,
          }}>
            5th Avenue
          </div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Internal Operating System
          </div>
        </div>

        {/* Centre copy */}
        <div>
          <div style={{
            fontFamily: "'Newsreader', serif",
            fontSize: 38, lineHeight: 1.18,
            color: "#FFFFFF", fontWeight: 500,
            fontStyle: "italic", marginBottom: 20,
          }}>
            Every campaign,<br />every creator,<br />one place.
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, maxWidth: 280 }}>
            Manage influencer campaigns, track billing, and keep your team aligned — end to end.
          </div>
        </div>

        {/* Bottom role hint */}
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", lineHeight: 1.6 }}>
          Access is scoped to your role.<br />Contact your admin if you need help logging in.
        </div>
      </div>

      {/* ── RIGHT FORM PANEL ─── */}
      <div style={{
        flex: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "40px 32px",
      }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ marginBottom: 36 }}>
            <div style={{
              fontSize: 22, fontWeight: 600, color: T.text,
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
                style={{
                  width: "100%", padding: "11px 14px",
                  fontSize: 13, color: T.text,
                  background: T.surface,
                  border: `1.5px solid ${err ? T.red : T.border}`,
                  borderRadius: T.radiusSm, outline: "none",
                  fontFamily: "'Sora', sans-serif",
                  boxSizing: "border-box",
                  transition: "border-color 0.12s",
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
                style={{
                  width: "100%", padding: "11px 14px",
                  fontSize: 13, color: T.text,
                  background: T.surface,
                  border: `1.5px solid ${err ? T.red : T.border}`,
                  borderRadius: T.radiusSm, outline: "none",
                  fontFamily: "'Sora', sans-serif",
                  boxSizing: "border-box",
                  transition: "border-color 0.12s",
                }}
                onFocus={e => { if (!err) e.target.style.borderColor = T.accent; }}
                onBlur={e => { if (!err) e.target.style.borderColor = T.border; }}
              />
            </div>

            {/* Error */}
            {err && (
              <div style={{
                fontSize: 11.5, color: T.red,
                marginBottom: 20, paddingLeft: 2,
              }}>
                {err}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "12px",
                background: loading ? T.mute : T.accent,
                color: loading ? T.label : "#FFFFFF",
                border: "none", borderRadius: T.radiusSm,
                fontSize: 13, fontWeight: 600,
                fontFamily: "'Sora', sans-serif",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "background 0.15s",
                letterSpacing: "0.01em",
              }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {/* Demo credentials hint */}
          <div style={{
            marginTop: 32, padding: "14px 16px",
            background: T.raised,
            border: `1px solid ${T.border}`,
            borderRadius: T.radiusSm,
          }}>
            {/* <div style={{ fontSize: 9.5, color: T.label, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
              Demo credentials
            </div>
            {[
              ["Founder",        "founder@5thavenue.in",  "founder123" ],
              ["PCM",            "rohan@5thavenue.in",    "pcm123"     ],
              ["CM (Priya)",     "priya@5thavenue.in",    "cm123"      ],
              ["CM (Vikram)",    "vikram@5thavenue.in",   "cm456"      ],
              ["Account Mgr",   "divya@5thavenue.in",    "am123"      ],
              ["EA (Arjun)",     "arjun@5thavenue.in",    "ea123"      ],
              ["EA (Sneha)",     "sneha@5thavenue.in",    "ea456"      ],
              ["EA (Meera)",     "meera@5thavenue.in",    "ea789"      ],
              ["Accounts",       "accounts@5thavenue.in", "accounts123"],
            ].map(([role, em, pw]) => (
              <div
                key={em}
                onClick={() => { setEmail(em); setPassword(pw); setErr(""); }}
                style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center", padding: "6px 0",
                  borderBottom: `1px solid ${T.border}`,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 10.5, color: T.text, fontWeight: 500 }}>{role}</span>
                <span style={{ fontSize: 10, color: T.label, fontFamily: "monospace" }}>{em}</span>
              </div>
            )).reduce((acc, el, i, arr) => {
              // Remove border on last item
              const clone = i === arr.length - 1
                ? { ...el, props: { ...el.props, style: { ...el.props.style, borderBottom: "none" } } }
                : el;
              return [...acc, clone];
            }, [])}
            <div style={{ fontSize: 9, color: T.label, marginTop: 6 }}>
              Click a row to auto-fill credentials.
            </div> */}
          </div>
        </div>
      </div>
    </div>
  );
}