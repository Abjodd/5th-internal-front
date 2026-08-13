import { phoneDigits, toPhone } from "../lib/validators";

/**
 * 5th Avenue — PhoneInput
 *
 * Every number this company collects is an Indian mobile, so "+91" is a fixed
 * prefix rather than something anyone types. The field holds ten digits and
 * nothing else: an 11th is simply not accepted, and pasting "+91 98765 43210"
 * or "0 9876543210" lands on the same ten digits as typing them.
 *
 * Same contract as MoneyInput — the parent keeps the canonical value and this
 * only shapes what goes in and out. `onChange` receives the stored form,
 * "+91XXXXXXXXXX", or "" while the field is empty, so nothing downstream has
 * to know the prefix was displayed separately.
 *
 * Reading is normalised too, which is what makes this safe to drop onto
 * existing records: a creator saved before this component existed holds a bare
 * "9876543210" (or a hand-typed "+91-98765 43210"), and both display — and
 * re-save — correctly without a migration.
 */
const SF = "'SF Pro Display','-apple-system','BlinkMacSystemFont','Helvetica Neue',sans-serif";

export default function PhoneInput({ value, onChange, style = {}, placeholder = "98765 43210", disabled, ...rest }) {
  const digits = phoneDigits(value);
  // Typing and pasting want opposite things from an over-long value. A paste
  // of "+91 98765 43210" means "drop the country code"; an 11th keystroke
  // means "no". Only a value that is exactly a country code plus ten digits
  // gets the former — everything else is capped, so the extra keystroke is
  // rejected instead of shifting the whole number along by one.
  const onType = raw => {
    const d = String(raw).replace(/\D/g, "");
    onChange(toPhone(/^(?:0*91|0)\d{10}$/.test(d) ? phoneDigits(d) : d.slice(0, 10)));
  };
  // The wrapper wears the caller's field styling (border, radius, background)
  // so this drops in wherever a plain <input style={INP}> was, and the inner
  // input is stripped bare — two borders around one field reads as a bug.
  const { padding, ...frame } = style;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:7, padding: padding || "9px 12px",
      opacity: disabled ? 0.55 : 1, ...frame, boxSizing:"border-box" }}>
      <span aria-hidden style={{ fontSize:12, fontFamily:SF, color:"#6E6E73", fontWeight:600,
        letterSpacing:"-0.01em", flexShrink:0, paddingRight:7, borderRight:"1px solid rgba(0,0,0,0.12)" }}>
        +91
      </span>
      <input
        type="tel" inputMode="numeric" autoComplete="tel-national"
        value={digits} disabled={disabled} placeholder={placeholder}
        onChange={e => onType(e.target.value)}
        style={{ flex:1, minWidth:0, border:"none", outline:"none", background:"transparent",
          padding:0, fontSize:12, fontFamily:SF, color:"#1D1D1F", letterSpacing:"0.01em" }}
        {...rest}
      />
    </div>
  );
}
