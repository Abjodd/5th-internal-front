/**
 * 5th Avenue — Requests: shared primitives
 * ─────────────────────────────────────────────────────────────────
 * The client and creator inboxes are the same object at heart — an inbound
 * form submission the founder triages — so they share their chrome here
 * rather than keeping two drifting copies. Before these lived in one place
 * the two tabs disagreed on what "New" looked like: client requests painted
 * it accent-blue and creator applications amber, with reviewed swapped. One
 * triage vocabulary, one palette.
 */
import { T } from "../../theme/tokens";

// ── TABLE / INPUT STYLES ─────────────────────────────────────────────────────
export const thS = {
  padding: "9px 14px", textAlign: "left", fontSize: 9, fontWeight: 600,
  color: T.label, textTransform: "uppercase", letterSpacing: "0.07em",
  borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap",
  fontFamily: "'Sora', sans-serif", background: T.raised,
};
export const tdS = {
  padding: "11px 14px", fontSize: 11.5, color: T.text,
  borderBottom: `1px solid ${T.border}`, verticalAlign: "middle",
};
export const INP = {
  padding: "7px 10px", borderRadius: 5, background: T.surface,
  border: `1px solid ${T.border}`, color: T.text, fontSize: 11.5,
  fontFamily: "'Sora'", outline: "none",
};

// ── TRIAGE STATUS ────────────────────────────────────────────────────────────
// Workflow order, shared by both inboxes. The backend defaults every new
// submission to "new" (models/ClientRequest.js, models/CreatorRequest.js).
export const STATUS = [
  { id: "new",       label: "New",       color: T.accent },
  { id: "reviewed",  label: "Reviewed",  color: T.amber  },
  { id: "contacted", label: "Contacted", color: T.green  },
  { id: "archived",  label: "Archived",  color: T.sub    },
];
export const statusMeta = (id) => STATUS.find(s => s.id === id) || STATUS[0];

// ── ATOMS ────────────────────────────────────────────────────────────────────
// `color` distinguishes the two inboxes at a glance: gold for brands,
// pink for creators — matching the accent each section already uses.
export const Av = ({ name, color = T.gold }) => (
  <div style={{
    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
    background: `${color}16`, color,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 10, fontWeight: 600,
  }}>
    {(name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
  </div>
);

export const Pill = ({ children, color = T.sub }) => (
  <span style={{
    display: "inline-block", padding: "2px 8px", borderRadius: 10,
    fontSize: 9.5, fontWeight: 500, color, background: `${color}14`,
    border: `1px solid ${color}28`, whiteSpace: "nowrap",
  }}>{children}</span>
);

// One label/value line in an expanded detail panel.
export const Fact = ({ label, value, width = 104 }) => (
  <div style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 11 }}>
    <span style={{ color: T.label, width, flexShrink: 0 }}>{label}</span>
    <span style={{ color: value ? T.text : T.label }}>{value || "—"}</span>
  </div>
);

// Expand/collapse affordance — rotates 180° when its row is open.
export const Chevron = ({ open }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 20, height: 20, borderRadius: "50%", fontSize: 10,
    background: open ? `${T.accent}12` : "transparent",
    color: open ? T.accent : T.label,
    transform: open ? "rotate(180deg)" : "rotate(0deg)",
    transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1), background 0.2s ease, color 0.2s ease",
  }}>▾</span>
);

// Wraps a row's detail panel in the 0fr→1fr grid transition both inboxes use
// — the panel is always mounted, so expanding animates instead of popping.
export const Expandable = ({ open, children }) => (
  <div style={{
    display: "grid", gridTemplateRows: open ? "1fr" : "0fr",
    transition: "grid-template-rows 0.32s cubic-bezier(0.4,0,0.2,1)",
  }}>
    <div style={{ overflow: "hidden" }}>
      <div style={{
        opacity: open ? 1 : 0,
        transform: open ? "translateY(0)" : "translateY(-6px)",
        transition: "opacity 0.28s ease 0.06s, transform 0.32s cubic-bezier(0.4,0,0.2,1)",
      }}>{children}</div>
    </div>
  </div>
);

// ── HELPERS ──────────────────────────────────────────────────────────────────
// createdAt is a full ISO datetime (Mongoose timestamps), so format it here
// rather than lib/format.prettyDate (which only handles "YYYY-MM-DD").
export const fmtWhen = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

// Shared empty/loading/error chrome so both tabs read identically.
export const Notice = ({ children, tone }) => (
  <div style={tone === "error"
    ? { padding: "14px 16px", background: `${T.red}0C`, border: `1px solid ${T.red}30`, borderRadius: T.radiusSm, fontSize: 11.5, color: T.red }
    : { padding: 40, fontSize: 12, color: tone === "empty" ? T.label : T.sub, textAlign: "center", fontStyle: tone === "empty" ? "italic" : "normal" }}>
    {children}
  </div>
);
