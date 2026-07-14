import { groupINR, parseINR } from "../lib/format";

// Money input with live Indian comma grouping — typing 1250000 shows
// "12,50,000". The parent keeps the raw numeric value: `value` may be a
// number or digit string, and `onChange` receives the plain digit string
// (run parseInt/parseFloat on it as before).
export default function MoneyInput({ value, onChange, style, ...rest }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={groupINR(value)}
      onChange={e => onChange(parseINR(e.target.value))}
      style={style}
      {...rest}
    />
  );
}
