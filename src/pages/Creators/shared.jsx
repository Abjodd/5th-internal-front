/**
 * 5th Avenue — Creators: shared card chrome
 * ─────────────────────────────────────────────────────────────────
 * The directory and the Vendors tab are the same object at a distance: a
 * record you scan as a card, a strip of figures, and detail panels you expand
 * to read and edit. The shell lives here so the two tabs cannot drift into two
 * slightly different cards the way the Requests inboxes once did.
 */
import { T } from "../../theme/tokens";

// ── STYLE HELPERS ────────────────────────────────────────────────────────────
export const INP = {
  padding: "7px 10px", borderRadius: 5, background: T.surface,
  border: `1px solid ${T.border}`, color: T.text, fontSize: 11.5,
  fontFamily: "'Sora'", outline: "none",
};

export const PAY_LABELS = { vendor: "To Vendor", net_banking: "Net Banking", upi: "UPI" };

export const Pill = ({ children, color = T.sub }) => (
  <span style={{
    display: "inline-block", padding: "2px 8px", borderRadius: 10,
    fontSize: 9.5, fontWeight: 500, color, background: `${color}14`,
    border: `1px solid ${color}28`, whiteSpace: "nowrap",
  }}>{children}</span>
);

// One label/value line in the expanded detail panels.
export const Fact = ({ label, value, width = 92 }) => (
  <div style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 11 }}>
    <span style={{ color: T.label, width, flexShrink: 0 }}>{label}</span>
    <span style={{ color: value ? T.text : T.label, minWidth: 0, wordBreak: "break-word" }}>{value || "—"}</span>
  </div>
);

// Shared styles for the expanded detail panels.
export const panel = {
  flex: 1, minWidth: 220, background: T.surface,
  border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "12px 14px",
};
export const panelTitle = {
  fontSize: 9, fontWeight: 600, color: T.label, textTransform: "uppercase",
  letterSpacing: "0.07em", marginBottom: 8,
};

// The small outlined action inside a detail panel — Edit, View PDF, Assign.
// `color` is the only thing that ever varied between the copies of it.
export const GhostBtn = ({ color = T.accent, style = {}, ...rest }) => (
  <button
    type="button"
    {...rest}
    style={{
      fontSize: 9.5, color, background: "transparent", border: `1px solid ${color}30`,
      borderRadius: 4, padding: "3px 9px", cursor: "pointer", fontFamily: "'Sora'",
      whiteSpace: "nowrap", ...style,
    }}
  />
);

// Loading / error / empty chrome, so every state on the page reads the same.
export const Notice = ({ children, tone }) => (
  <div style={tone === "error"
    ? { padding: "14px 16px", background: `${T.red}0C`, border: `1px solid ${T.red}30`, borderRadius: T.radiusSm, fontSize: 11.5, color: T.red }
    : { padding: 40, fontSize: 12, color: tone === "empty" ? T.label : T.sub, textAlign: "center", fontStyle: tone === "empty" ? "italic" : "normal" }}>
    {children}
  </div>
);

// Hover/shadow live in a class, not inline: an inline shorthand outranks a
// stylesheet, so declaring the border inline would make :hover dead code.
export const CARD_CSS = `
  .cr-card {
    border: 1px solid ${T.border};
    box-shadow: ${T.shadow};
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .cr-card:hover {
    border-color: ${T.borderMid};
    box-shadow: 0 4px 16px rgba(28,24,16,0.10);
  }
`;

export const CardGrid = ({ children }) => (
  <div style={{
    display: "grid", gap: 12, alignItems: "start",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
  }}>{children}</div>
);

// One figure in a card's stat strip. The strip draws its own dividers with a
// 1px grid gap over a border-coloured backdrop, so nothing here needs to know
// its index to decide whether it has a rule on its left.
const Stat = ({ label, value, color = T.text }) => (
  <div style={{ flex: 1, minWidth: 0, background: T.surface, padding: "9px 4px", textAlign: "center" }}>
    <div style={{ fontSize: 13, fontWeight: 600, color, letterSpacing: "-0.01em" }}>{value}</div>
    <div style={{
      fontSize: 7.5, color: T.label, textTransform: "uppercase",
      letterSpacing: "0.07em", marginTop: 2,
    }}>{label}</div>
  </div>
);

/**
 * One record as a card: photo and identity, the figures worth scanning, then a
 * footer strip — with the detail panels underneath.
 *
 * Opening one spans it across the whole grid row (`gridColumn: 1 / -1`) rather
 * than growing it inside its own column — the detail is several panels wide,
 * and in a 300px column they stack into a tower that leaves the rest of the row
 * empty. The card stays where it is in DOM order, so it moves at most one row.
 */
export function Card({ open, onToggle, name, avatar, title, subtitle, stats, footer, children }) {
  return (
    <article
      className="cr-card"
      onClick={onToggle}
      // Only the open state is set inline — where beating :hover is the point,
      // since an open card should not also light up under the cursor.
      style={{
        gridColumn: open ? "1 / -1" : "auto",
        background: T.surface, borderRadius: T.radius,
        overflow: "hidden", cursor: "pointer",
        borderColor: open ? T.borderMid : undefined,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 14px" }}>
        {avatar}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 500, color: T.text,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{title}</div>
          <div style={{ fontSize: 9.5, color: T.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {subtitle}
          </div>
        </div>
        {/* The whole card is clickable for convenience, but the chevron is the
            real control: a div with an onClick is unreachable by keyboard, and
            the card cannot itself be a button because it may contain a link. */}
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} details for ${name}`}
          onClick={e => { e.stopPropagation(); onToggle(); }}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 20, height: 20, borderRadius: "50%", flexShrink: 0, fontSize: 10,
            border: "none", padding: 0, cursor: "pointer",
            background: open ? `${T.accent}12` : "transparent",
            color: open ? T.accent : T.label,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1), background 0.2s ease, color 0.2s ease",
          }}
        >▾</button>
      </header>

      {/* 1px gap over a border-coloured backdrop = hairlines between figures. */}
      <div style={{ display: "flex", gap: 1, background: T.border, borderTop: `1px solid ${T.border}` }}>
        {stats.map(s => <Stat key={s.label} {...s} />)}
      </div>

      <footer style={{
        display: "flex", alignItems: "center", gap: 8, padding: "9px 14px",
        borderTop: `1px solid ${T.border}`, background: T.raised,
        fontSize: 10.5, color: T.sub,
      }}>{footer}</footer>

      {/* Always mounted; the 0fr→1fr grid transition animates the reveal.
          The detail swallows its own clicks: it lives inside the card that
          toggles, so without this every button and filter inside it would shut
          the card the moment it was used. `visibility` is what takes the
          collapsed copy out of the tab order and off the screen reader —
          clipped-but-present controls are still focusable. */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: "grid", gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 0.32s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div style={{
            borderTop: `1px solid ${T.border}`,
            opacity: open ? 1 : 0,
            visibility: open ? "visible" : "hidden",
            transition: "opacity 0.28s ease 0.06s, visibility 0.34s",
          }}>
            <div style={{ display: "flex", gap: 12, padding: "14px 14px 16px", flexWrap: "wrap", background: T.raised }}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
