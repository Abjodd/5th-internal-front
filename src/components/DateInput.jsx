import { useState, useRef, useEffect } from "react";
import { T } from "../theme/tokens";
import { prettyDate, ISO_DATE } from "../lib/format";

// Compact custom date picker — replaces native <input type="date">, whose
// OS-rendered popup ignores the app theme. Value in/out is "YYYY-MM-DD".
// Supports min/max (days outside the range are disabled).

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["S","M","T","W","T","F","S"];

const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
// Only "YYYY-MM-DD" round-trips; anything else (legacy free-text dates) is
// treated as unset so the picker never renders "Invalid Date".
const fromISO = s => (ISO_DATE.test(s || "") ? new Date(`${s}T00:00:00`) : null);

export default function DateInput({ value, onChange, min, max, placeholder = "Select date", style }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const sel = fromISO(value);
  const today = new Date();
  const [view, setView] = useState(() => sel || today); // month being shown
  const rootRef = useRef(null);

  // Fixed positioning so the popover escapes overflow:hidden/auto ancestors
  // (modals); flips above the trigger when the viewport bottom is too close.
  const POP_W = 232, POP_H = 302;
  const toggle = () => {
    if (!open && rootRef.current) {
      const r = rootRef.current.getBoundingClientRect();
      const up = r.bottom + POP_H + 8 > window.innerHeight;
      setPos({
        top: up ? Math.max(8, r.top - POP_H - 6) : r.bottom + 6,
        left: Math.min(r.left, window.innerWidth - POP_W - 8),
      });
      setView(sel || today);
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const y = view.getFullYear(), m = view.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const shift = n => setView(new Date(y, m + n, 1));
  const inRange = dISO => (!min || dISO >= min) && (!max || dISO <= max);

  const navBtn = {
    width:22, height:22, borderRadius:6, border:"none", background:"transparent",
    color:T.sub, fontSize:11, cursor:"pointer", display:"flex", alignItems:"center",
    justifyContent:"center", lineHeight:1,
  };

  return (
    <div ref={rootRef} style={{ position:"relative" }}>
      <button type="button" onClick={toggle}
        style={{ ...style, textAlign:"left", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8,
          color: value ? (style?.color || T.text) : T.label }}>
        <span>{value ? prettyDate(value) : placeholder}</span>
        <span aria-hidden style={{ fontSize:10, color:T.label, flexShrink:0 }}>▾</span>
      </button>

      {open && (
        <div style={{ position:"fixed", top:pos.top, left:pos.left, zIndex:900, width:POP_W,
          background:T.surface, border:`1px solid ${T.borderMid}`, borderRadius:10,
          boxShadow:"0 12px 32px rgba(28,24,16,0.16), 0 2px 8px rgba(28,24,16,0.08)",
          padding:"10px 10px 8px", animation:"popIn 0.14s ease" }}>

          {/* header: « ‹ Month Year › » */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <div style={{ display:"flex" }}>
              <button type="button" className="dp-nav" onClick={() => shift(-12)} title="Previous year" style={navBtn}>«</button>
              <button type="button" className="dp-nav" onClick={() => shift(-1)} title="Previous month" style={navBtn}>‹</button>
            </div>
            <div style={{ fontSize:11.5, fontWeight:600, color:T.text, letterSpacing:"-0.01em" }}>
              {MONTHS[m]} {y}
            </div>
            <div style={{ display:"flex" }}>
              <button type="button" className="dp-nav" onClick={() => shift(1)} title="Next month" style={navBtn}>›</button>
              <button type="button" className="dp-nav" onClick={() => shift(12)} title="Next year" style={navBtn}>»</button>
            </div>
          </div>

          {/* day-of-week header */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:2 }}>
            {DOW.map((d, i) => <div key={i} style={{ textAlign:"center", fontSize:8.5, fontWeight:600, color:T.label, padding:"2px 0", textTransform:"uppercase" }}>{d}</div>)}
          </div>

          {/* day grid */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:1 }}>
            {cells.map((day, i) => {
              if (day === null) return <div key={`b${i}`} />;
              const dISO = iso(new Date(y, m, day));
              const isSel = value === dISO;
              const isToday = iso(today) === dISO;
              const ok = inRange(dISO);
              return (
                <button key={dISO} type="button" disabled={!ok} className={ok && !isSel ? "dp-day" : undefined}
                  onClick={() => { onChange(dISO); setOpen(false); }}
                  style={{ height:26, borderRadius:7, border:"none", fontSize:10.5, cursor: ok ? "pointer" : "default",
                    fontWeight: isSel || isToday ? 600 : 400,
                    background: isSel ? T.accent : "transparent",
                    color: isSel ? "#FFF" : !ok ? T.mute : isToday ? T.accent : T.text,
                    boxShadow: isToday && !isSel ? `inset 0 0 0 1px ${T.accent}55` : "none" }}>
                  {day}
                </button>
              );
            })}
          </div>

          {/* footer shortcuts */}
          <div style={{ display:"flex", justifyContent:"space-between", borderTop:`1px solid ${T.border}`, marginTop:8, paddingTop:6 }}>
            <button type="button" className="dp-nav" disabled={!inRange(iso(today))}
              onClick={() => { onChange(iso(today)); setOpen(false); }}
              style={{ ...navBtn, width:"auto", padding:"2px 8px", fontSize:9.5, color:T.accent, fontWeight:600 }}>
              Today
            </button>
            <button type="button" className="dp-nav" onClick={() => { onChange(""); setOpen(false); }}
              style={{ ...navBtn, width:"auto", padding:"2px 8px", fontSize:9.5 }}>
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
