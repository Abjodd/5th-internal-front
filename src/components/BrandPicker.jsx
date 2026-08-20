import { useState, useRef, useEffect } from "react";
import { T } from "../theme/tokens";
import { zoomOf } from "../lib/zoom";

// Single searchable control for "pick a brand, or create one" — replaces three
// near-identical hand-rolled copies (Campaigns' CreateModal, Auth's
// CredentialModal, Requests' ClientRequestsPanel).
//
// Two explicit modes, not one input doing both. The first cut only offered
// "create" by typing a name that matched nothing — it worked, but nothing told
// you it was possible. A pinned "+ Add a new brand" row now switches the popover
// into its own create form, rather than overloading the search box's Enter key.
//
// Positioning follows DateInput's popover convention (fixed, escapes the modal's
// overflow:auto).
//
// Committed selection stays with the caller — `value` is a brand id or the
// "__new__" sentinel, `pendingName` the staged name — the shape all three
// callers already used, so wiring this in doesn't touch their submit logic.
export default function BrandPicker({ brands, value, pendingName, onSelect, onCreate, placeholder = "Select or create a brand…" }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("search"); // "search" | "create"
  const [q, setQ] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const selected = value === "__new__" ? null : brands.find(b => b.id === value);
  const shownLabel = value === "__new__" ? `${pendingName} (new)` : selected?.name || "";

  const toggle = () => {
    if (!open && rootRef.current) {
      // getBoundingClientRect() reports visual (post-zoom) pixels; a
      // position:fixed element's own top/left/width are layout pixels the
      // browser multiplies by zoom again on paint — see lib/zoom.js. Without
      // dividing back out here the popover both drifted off the trigger and
      // rendered ~1.1x too wide.
      const z = zoomOf(rootRef.current);
      const r = rootRef.current.getBoundingClientRect();
      setPos({ top: r.bottom / z + 6, left: r.left / z, width: r.width / z });
      setMode("search");
      setQ("");
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    inputRef.current?.focus();
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, mode]);

  const query = q.trim().toLowerCase();
  const matches = mode === "search" && query ? brands.filter(b => b.name.toLowerCase().includes(query)) : brands;
  const sorted = mode === "search" ? matches.slice().sort((a, b) => a.name.localeCompare(b.name)) : [];
  // A name that already exists can't be "created" — offer picking it instead
  // of quietly filing a second brand under a near-duplicate name.
  const dupe = mode === "create" && query ? brands.find(b => b.name.toLowerCase() === query) : null;

  const pick = id => { onSelect(id); setOpen(false); };
  const startCreate = () => { setMode("create"); setQ(""); };
  const backToSearch = () => { setMode("search"); setQ(""); };
  const confirmCreate = () => { const name = q.trim(); if (name && !dupe) { onCreate(name); setOpen(false); } };

  const rowStyle = hot => ({
    display: "flex", alignItems: "center", width: "100%", padding: "9px 14px",
    background: hot ? "rgba(0,0,0,0.04)" : "transparent", border: "none", textAlign: "left",
    cursor: "pointer", fontSize: 12, fontFamily: "'Sora',sans-serif", color: T.text,
  });
  const fieldStyle = {
    width: "100%", boxSizing: "border-box", padding: "11px 14px", border: "none",
    borderBottom: `1px solid ${T.border}`, outline: "none", fontSize: 12, fontFamily: "'Sora',sans-serif",
  };

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button type="button" onClick={toggle}
        style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 9,
          background: "rgba(0,0,0,0.03)", border: `1px solid ${open ? T.accent + "55" : "rgba(0,0,0,0.1)"}`,
          fontSize: 12, fontFamily: "'Sora',sans-serif", cursor: "pointer", textAlign: "left",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ color: shownLabel ? T.text : T.label, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {shownLabel || placeholder}
        </span>
        <span aria-hidden style={{ fontSize: 10, color: T.label, flexShrink: 0 }}>▾</span>
      </button>

      {open && mode === "search" && (
        <div style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 900,
          background: T.surface, border: `1px solid ${T.borderMid}`, borderRadius: 10,
          boxShadow: "0 12px 32px rgba(28,24,16,0.16), 0 2px 8px rgba(28,24,16,0.08)", overflow: "hidden" }}>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && sorted.length) { e.preventDefault(); pick(sorted[0].id); } }}
            placeholder="Search brands…" style={fieldStyle}/>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {sorted.map(b => (
              <button key={b.id} type="button" onClick={() => pick(b.id)} style={rowStyle(b.id === value)}>{b.name}</button>
            ))}
            {sorted.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 11, color: T.label }}>No brands match.</div>
            )}
          </div>
          {/* Pinned, not folded into the results — this is the thing to
              notice on open, not a row you only find by scrolling past every
              brand or by typing a name that happens to match nothing. */}
          <button type="button" onClick={startCreate}
            style={{ ...rowStyle(false), color: T.accent, fontWeight: 600, borderTop: `1px solid ${T.border}` }}>
            + Add a new brand
          </button>
        </div>
      )}

      {open && mode === "create" && (
        <div style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 900,
          background: T.surface, border: `1px solid ${T.borderMid}`, borderRadius: 10,
          boxShadow: "0 12px 32px rgba(28,24,16,0.16), 0 2px 8px rgba(28,24,16,0.08)", overflow: "hidden" }}>
          <div style={{ padding: "16px 16px 14px" }}>
            <div style={{ fontSize: 9.5, fontWeight: 600, color: T.label, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>New brand</div>
            {/* A real bordered field, not bare text on a hairline — matching
                every other input in the modal it lives inside of, rather than
                looking like a stray label with no control under it. */}
            <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); confirmCreate(); } }}
              placeholder="Brand name"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9,
                background: "rgba(0,0,0,0.03)", border: `1px solid ${T.borderMid}`, outline: "none",
                fontSize: 12, fontFamily: "'Sora',sans-serif", color: T.text }}/>
            {dupe && <div style={{ marginTop: 8, fontSize: 10.5, color: T.amber, lineHeight: 1.5 }}>"{dupe.name}" already exists — pick it from search instead.</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderTop: `1px solid ${T.border}` }}>
            <button type="button" onClick={backToSearch} style={{ ...rowStyle(false), width: "auto", padding: "7px 11px", borderRadius: 7, color: T.sub }}>← Search brands</button>
            <div style={{ flex: 1 }}/>
            <button type="button" onClick={confirmCreate} disabled={!q.trim() || !!dupe}
              style={{ padding: "7px 16px", borderRadius: 7, border: "none", fontSize: 11.5, fontWeight: 600, fontFamily: "'Sora',sans-serif",
                cursor: q.trim() && !dupe ? "pointer" : "not-allowed", opacity: q.trim() && !dupe ? 1 : 0.4,
                background: T.accent, color: "#FFFFFF" }}>
              Create
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
