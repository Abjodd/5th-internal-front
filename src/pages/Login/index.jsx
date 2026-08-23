/**
 * 5th Avenue — Login Page
 * Full-bleed immersive design: a reactive three.js "gem" — a wireframe
 * icosahedron warped by simplex noise — floats behind a glass card,
 * surrounded by a drifting particle field. The gem tightens and flares
 * white on submit, flashes red and shakes on error, and blooms into a
 * scale burst on success right before navigation.
 *
 * Palette: deep navy / ink blue with a single bright cobalt accent and
 * white highlights — no gold, no purple. The rotating gradient ring
 * that used to frame the card has been removed; the card now sits on
 * a plain hairline border so the gem stays the only moving frame.
 *
 * Brand mark: swap FAVICON_SRC below for the actual file in /public
 * (e.g. "/favicon.svg", "/favicon.png", "/logo.svg") if it isn't
 * literally "/favicon.ico".
 */
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import { useAuth } from "../../context/AuthContext";

const FAVICON_SRC = "/favicon.svg";

// One typeface for the whole scene — the wordmark, the "Sign in" title,
// and the form now all read as Sora instead of mixing in a serif italic
// that didn't match the brand mark up top.
const FONT_BRAND = "'Sora', sans-serif";

// ── Local dark-blue / white palette for this design ──────────────────
const C = {
  bg: "#03060F",
  glass: "rgba(6,10,26,0.82)",
  glassBorder: "rgba(255,255,255,0.14)",
  inputBg: "rgba(255,255,255,0.06)",
  text: "#F5F7FF",
  sub: "rgba(245,247,255,0.68)",
  faint: "rgba(245,247,255,0.46)",
  accent: "#3E7BFF",
  accent2: "#FFFFFF",
  red: "#FF6B6B",
};

// ── GLSL: simplex noise (Ashima Arts, public domain) ─────────────────
const NOISE_GLSL = `
  vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
  float snoise(vec3 v){
    const vec2 Cc = vec2(1.0/6.0,1.0/3.0);
    const vec4 D = vec4(0.0,0.5,1.0,2.0);
    vec3 i  = floor(v + dot(v, Cc.yyy));
    vec3 x0 = v - i + dot(i, Cc.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + Cc.xxx;
    vec3 x2 = x0 - i2 + Cc.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m*m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
`;

const VERT = `
  uniform float uTime;
  uniform float uAmp;
  varying float vDisp;
  varying vec3 vNormal;
  ${NOISE_GLSL}
  void main(){
    vNormal = normal;
    float n = snoise(position * 1.35 + uTime * 0.22);
    vDisp = n;
    vec3 newPos = position + normal * n * uAmp;
    vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAG = `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying float vDisp;
  varying vec3 vNormal;
  void main(){
    float t = smoothstep(-0.35, 0.35, vDisp);
    vec3 color = mix(uColorA, uColorB, t);
    float glow = 0.55 + 0.45 * abs(vNormal.z);
    gl_FragColor = vec4(color * glow, 0.92);
  }
`;

// ── The reactive 3D scene, mounted into containerRef ──────────────────
function useReactiveGem(containerRef, statusRef) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 6.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    // Gem — wireframe icosahedron, noise-warped
    const uniforms = {
      uTime: { value: 0 },
      uAmp: { value: reduced ? 0.08 : 0.2 },
      uColorA: { value: new THREE.Color(C.accent) },
      uColorB: { value: new THREE.Color(C.accent2) },
    };
    const gemGeo = new THREE.IcosahedronGeometry(1.6, 4);
    const gemMat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, wireframe: true, transparent: true });
    const gem = new THREE.Mesh(gemGeo, gemMat);
    scene.add(gem);

    // Faint solid core so the wireframe reads as a volume, not a net
    const coreGeo = new THREE.IcosahedronGeometry(1.28, 2);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x040817, transparent: true, opacity: 0.4 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    scene.add(core);

    // Ambient particle field
    const COUNT = reduced ? 260 : 850;
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const r = 4.2 + Math.random() * 5.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xcdd9ff, size: 0.022, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Mouse-driven parallax
    const mouse = { x: 0, y: 0 };
    const onMouseMove = (e) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("mousemove", onMouseMove);

    const colorIdle = new THREE.Color(C.accent);
    const colorError = new THREE.Color(C.red);
    const colorSuccess = new THREE.Color(C.accent2);

    const clock = new THREE.Clock();
    let raf;
    const camTarget = { x: 0, y: 0 };
    const animate = () => {
      const t = clock.getElapsedTime();
      uniforms.uTime.value = t;

      const status = statusRef.current;
      const baseAmp = reduced ? 0.08 : 0.2;
      const targetAmp =
        status === "loading" ? baseAmp * 2.4 :
        status === "error" ? baseAmp * 3 :
        status === "success" ? baseAmp * 0.2 : baseAmp;
      uniforms.uAmp.value += (targetAmp - uniforms.uAmp.value) * 0.07;

      const targetColor = status === "error" ? colorError : status === "success" ? colorSuccess : colorIdle;
      uniforms.uColorA.value.lerp(targetColor, 0.06);

      const spin = status === "loading" ? 0.9 : status === "success" ? 1.8 : (reduced ? 0.04 : 0.16);
      gem.rotation.y += spin * 0.016;
      gem.rotation.x = Math.sin(t * 0.14) * 0.16;
      core.rotation.copy(gem.rotation);

      const targetScale = status === "success" ? 1.7 : 1;
      gem.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.09);
      core.scale.copy(gem.scale);

      if (!reduced) particles.rotation.y = t * 0.015;

      camTarget.x += ((mouse.y * 0.32) - camTarget.x) * 0.045;
      camTarget.y += ((mouse.x * 0.32) - camTarget.y) * 0.045;
      camera.position.x += ((camTarget.y * 1.3) - camera.position.x) * 0.06;
      camera.position.y += ((-camTarget.x * 1.3) - camera.position.y) * 0.06;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      gemGeo.dispose(); gemMat.dispose();
      coreGeo.dispose(); coreMat.dispose();
      particleGeo.dispose(); particleMat.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [containerRef, statusRef]);
}

// ── Kinetic letter-in text ─────────────────────────────────────────────
function KineticText({ text, style, delayStart = 0 }) {
  const { animation: extraAnim, ...restStyle } = style || {};
  return (
    <span style={{ display: "inline-block", perspective: 400 }}>
      {text.split("").map((ch, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            ...restStyle,
            animation: `letterIn 0.7s cubic-bezier(0.16,1,0.3,1) both${extraAnim ? `, ${extraAnim}` : ""}`,
            animationDelay: `${delayStart + i * 0.035}s`,
          }}
        >
          {ch === " " ? "\u00A0" : ch}
        </span>
      ))}
    </span>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | loading | error | success
  const [shake, setShake] = useState(false);
  const [btnOffset, setBtnOffset] = useState({ x: 0, y: 0 });
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const sceneRef = useRef(null);
  const statusRef = useRef("idle");
  useEffect(() => { statusRef.current = status; }, [status]);
  useReactiveGem(sceneRef, statusRef);

  const handleBtnMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left - r.width / 2) * 0.28;
    const y = (e.clientY - r.top - r.height / 2) * 0.4;
    setBtnOffset({ x, y });
  };
  const handleBtnLeave = () => setBtnOffset({ x: 0, y: 0 });

  const handleCardMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: px * 6, y: -py * 6 });
  };
  const handleCardLeave = () => setTilt({ x: 0, y: 0 });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    setStatus("loading");
    await new Promise((r) => setTimeout(r, 650));
    const result = await login(email, password);
    if (result.ok) {
      setStatus("success");
      setTimeout(() => navigate("/summary", { replace: true }), 620);
    } else {
      setLoading(false);
      setStatus("error");
      setErr(result.error);
      setShake(true);
      setTimeout(() => setShake(false), 480);
      setTimeout(() => setStatus("idle"), 1300);
    }
  };

  return (
    <div style={{
      position: "relative", height: "100%", width: "100%",
      background: "radial-gradient(120% 120% at 50% 0%, #0A1638 0%, #03060F 62%)",
      fontFamily: FONT_BRAND, overflow: "hidden",
    }}>
      <style>{`
        @keyframes letterIn { from { opacity: 0; transform: translateY(24px) rotateX(70deg); } to { opacity: 1; transform: translateY(0) rotateX(0); } }
        @keyframes riseIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shakeX { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-9px); } 40% { transform: translateX(7px); } 60% { transform: translateX(-5px); } 80% { transform: translateX(3px); } }
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes shimmerText { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes fieldIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shine { 0% { transform: translateX(-130%) skewX(-20deg); } 100% { transform: translateX(230%) skewX(-20deg); } }
        @keyframes ringPulse { 0% { box-shadow: 0 0 0 0 ${C.accent}55; } 100% { box-shadow: 0 0 0 14px ${C.accent}00; } }
        @keyframes burstRing { 0% { transform: scale(0.4); opacity: 0.9; } 100% { transform: scale(2.6); opacity: 0; } }
        .la-input { transition: border-color .15s, box-shadow .15s, background .15s; }
        .la-input:focus { box-shadow: 0 0 0 4px ${C.accent}30; border-color: ${C.accent} !important; background: rgba(255,255,255,0.09) !important; }
        .la-input::placeholder { color: rgba(245,247,255,0.3); }
        .la-btn .shine { position: absolute; top: 0; left: 0; width: 40%; height: 100%; background: linear-gradient(120deg, transparent, rgba(255,255,255,0.5), transparent); animation: shine 2.8s ease-in-out infinite; pointer-events: none; }
        @media (prefers-reduced-motion: reduce) {
          .marquee-track { animation: none !important; }
          .kinetic, .la-card, .la-btn { animation: none !important; }
          .la-btn .shine { animation: none !important; }
        }
      `}</style>

      {/* Three.js reactive gem + particles, full-bleed */}
      <div ref={sceneRef} style={{ position: "absolute", inset: 0, zIndex: 0 }} />

      {/* Grain */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.045, mixBlendMode: "overlay", pointerEvents: "none", zIndex: 1 }}>
        <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" /></filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>

      {/* Vignette so the card stays legible over the scene */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
        background: "radial-gradient(45% 42% at 50% 46%, rgba(3,6,15,0.55) 0%, rgba(3,6,15,0.87) 70%, rgba(3,6,15,0.97) 100%)",
      }} />

      {/* Wordmark */}
      <div style={{
        position: "absolute", top: 32, left: 40, zIndex: 2,
        display: "flex", alignItems: "center", gap: 10,
        animation: "riseIn 0.7s cubic-bezier(0.16,1,0.3,1) both",
      }}>
        <img
          src={FAVICON_SRC}
          alt="Fifth Avenue"
          width={18}
          height={18}
          style={{ display: "block", filter: `drop-shadow(0 0 4px ${C.accent}80)` }}
        />
        <span style={{ fontFamily: FONT_BRAND, fontSize: 13, color: C.text, letterSpacing: "0.24em", textTransform: "uppercase", fontWeight: 400, textShadow: "0 1px 8px rgba(0,0,0,0.6)" }}>
          Fifth Avenue
        </span>
      </div>

      {/* Centered glass card */}
      <div style={{ position: "relative", zIndex: 2, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, perspective: 1200 }}>
        <div
          className="la-card"
          onMouseMove={handleCardMove}
          onMouseLeave={handleCardLeave}
          style={{
            position: "relative", width: "100%", maxWidth: 400,
            transform: `rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)`,
            transformStyle: "preserve-3d",
            transition: "transform 0.15s ease-out",
            animation: `riseIn 0.75s 0.1s cubic-bezier(0.16,1,0.3,1) both${shake ? ", shakeX 0.48s ease-in-out" : ""}`,
          }}
        >
          {/* Success burst rings — the one moment allowed to be loud */}
          {status === "success" && (
            <>
              <div style={{ position: "absolute", inset: 0, borderRadius: 20, border: `2px solid ${C.accent2}`, animation: "burstRing 0.9s ease-out forwards", pointerEvents: "none" }} />
              <div style={{ position: "absolute", inset: 0, borderRadius: 20, border: `2px solid ${C.accent}`, animation: "burstRing 0.9s 0.15s ease-out forwards", pointerEvents: "none" }} />
            </>
          )}

          <div style={{
            position: "relative",
            background: C.glass, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
            border: `1px solid ${err ? `${C.red}66` : C.glassBorder}`,
            borderRadius: 20, padding: "38px 34px",
            boxShadow: "0 40px 90px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.06)",
            transition: "border-color 0.2s",
          }}>
            <div style={{ marginBottom: 30 }}>
              <div className="kinetic" style={{
                fontFamily: FONT_BRAND, fontSize: 28,
                fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 8,
              }}>
                <KineticText
                  text="Sign in"
                  style={{
                    background: `linear-gradient(90deg, ${C.text}, ${C.accent}, ${C.text})`,
                    backgroundSize: "200% auto",
                    WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
                    animation: "shimmerText 5s linear infinite",
                  }}
                />
              </div>
              <div style={{ fontSize: 12, color: C.sub, animation: "riseIn 0.7s 0.4s cubic-bezier(0.16,1,0.3,1) both" }}>
                Use your 5th Avenue workspace credentials.
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16, animation: "fieldIn 0.5s 0.45s cubic-bezier(0.16,1,0.3,1) both" }}>
                <label style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: C.faint, marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Email
                </label>
                <input
                  type="email" value={email}
                  onChange={(e) => { setEmail(e.target.value); setErr(""); }}
                  placeholder="you@5thavenue.in" autoFocus required
                  className="la-input"
                  style={{
                    width: "100%", padding: "12px 14px", fontSize: 13, color: C.text,
                    background: C.inputBg, border: `1.5px solid ${err ? C.red : C.glassBorder}`,
                    borderRadius: 12, outline: "none", fontFamily: FONT_BRAND, boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: err ? 10 : 24, animation: "fieldIn 0.5s 0.52s cubic-bezier(0.16,1,0.3,1) both" }}>
                <label style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: C.faint, marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Password
                </label>
                <input
                  type="password" value={password}
                  onChange={(e) => { setPassword(e.target.value); setErr(""); }}
                  placeholder="••••••••" required
                  className="la-input"
                  style={{
                    width: "100%", padding: "12px 14px", fontSize: 13, color: C.text,
                    background: C.inputBg, border: `1.5px solid ${err ? C.red : C.glassBorder}`,
                    borderRadius: 12, outline: "none", fontFamily: FONT_BRAND, boxSizing: "border-box",
                  }}
                />
              </div>

              {err && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.red,
                  background: `${C.red}14`, border: `1px solid ${C.red}40`, borderRadius: 10,
                  padding: "8px 12px", marginBottom: 20, animation: "riseIn 0.25s cubic-bezier(0.16,1,0.3,1) both",
                }}>
                  <span>⚠</span>{err}
                </div>
              )}

              <button
                type="submit" disabled={loading}
                onMouseMove={handleBtnMove}
                onMouseLeave={handleBtnLeave}
                className="la-btn"
                style={{
                  position: "relative", overflow: "hidden",
                  width: "100%", padding: "13px", display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 8,
                  background: loading ? "rgba(255,255,255,0.12)" : `linear-gradient(120deg, ${C.accent}, ${C.accent2})`,
                  color: loading ? C.sub : "#050914",
                  border: "none", borderRadius: 999, fontSize: 13, fontWeight: 700,
                  fontFamily: FONT_BRAND, cursor: loading ? "not-allowed" : "pointer",
                  letterSpacing: "0.01em",
                  transform: `translate(${btnOffset.x}px, ${btnOffset.y}px)`,
                  transition: "transform 0.12s ease-out, box-shadow 0.15s",
                  boxShadow: loading ? "none" : `0 14px 34px ${C.accent}45`,
                  animation: `fieldIn 0.5s 0.6s cubic-bezier(0.16,1,0.3,1) both${loading ? "" : ", ringPulse 2.6s 1s ease-out infinite"}`,
                }}
              >
                {!loading && <span className="shine" />}
                {loading && (
                  <span style={{
                    width: 14, height: 14, borderRadius: "50%",
                    border: "2px solid rgba(5,9,20,0.3)", borderTopColor: "#050914",
                    animation: "spin 0.7s linear infinite",
                  }} />
                )}
                {status === "success" ? "Welcome back" : loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Bottom marquee */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2,
        overflow: "hidden", padding: "14px 0",
        borderTop: `1px solid rgba(255,255,255,0.1)`,
        background: "linear-gradient(0deg, rgba(3,6,15,0.92) 30%, transparent)",
      }}>
        <div className="marquee-track" style={{
          display: "flex", whiteSpace: "nowrap", width: "max-content",
          animation: "marquee 26s linear infinite",
          fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: C.sub,
        }}>
          {Array(2).fill(
            "Access is scoped to your role — contact your admin if you need help logging in — "
          ).join("").repeat(2)}
        </div>
      </div>
    </div>
  );
}