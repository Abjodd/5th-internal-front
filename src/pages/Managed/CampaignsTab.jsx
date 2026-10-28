/**
 * 5th Avenue — Managed Creators → Campaigns
 * ─────────────────────────────────────────────────────────────────
 * Every brand deal any managed creator is running, in one editable table —
 * not "campaigns" in the agency-pipeline sense (models/Campaign.js, the
 * Campaigns module elsewhere in this app), but the standalone paid deals a
 * managed creator runs directly with a brand. One Project document per deal
 * (models/Project.js) — one creator can carry several, for different
 * brands, so this is one row per DEAL, not per creator.
 *
 * Two money fields per deal, not one: CLIENT COST (what the brand paid us —
 * `budget` on the record, same figure Billing's revenue chart sums) and
 * INTERNAL COST (what we actually paid the creator out of that). Margin is
 * the two numbers against each other, computed here, never stored.
 *
 * No separate "project name" any more — the brand itself is what a deal is
 * known by. Every field but the creator (reassigning a deal to a different
 * creator isn't a thing — remove and re-add instead) edits in place, right
 * on the row.
 *
 * Reads and writes the exact same records as the Projects panel on a
 * creator's own card (Creators tab) — this table is the cross-roster view
 * of that same data, plus a central "+ Add deal" for logging one without
 * opening a creator's card first.
 */
import { useState, useMemo } from "react";
import { Plus, Pencil, Check, X, Trash2, ExternalLink, Search, RefreshCw, LayoutGrid, List, Globe } from "lucide-react";
import { T } from "../../theme/tokens";
import { fmtINR, fmtCompact, prettyDate } from "../../lib/format";
import { INP, Select, Notice, GhostBtn, Spinner } from "../Creators/shared";
import { ConfirmDialog } from "../Requests/shared";
import CreatorAvatar from "../../components/CreatorAvatar";
import BrandLogo, { domainFromWebsite } from "../../components/BrandLogo";
import {
  DARK_SURFACE, MONEY, FX_CSS, CountUp, Reveal, StatusPill, dealStatus, useMounted,
} from "./fx";

const inr = (n) => fmtINR(Math.round(n));

const FIELD = { fontSize: 10, fontWeight: 600, color: T.label, textTransform: "uppercase", letterSpacing: "0.06em", display: "block" };
const moneyClean = (v) => v.replace(/[^\d]/g, "");

// ── ADD DEAL ─────────────────────────────────────────────────────────────────
function AddDealModal({ creators, onSave, onClose, initialBrand = "", initialWebsite = "" }) {
  const [creatorId, setCreatorId] = useState(creators[0]?.id || "");
  const [form, setForm] = useState({ brand: initialBrand, website: initialWebsite, clientCost: "", internalCost: "", url: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  // Bumped by the Fetch button to force BrandLogo to remount and retry —
  // otherwise a domain that already 404'd this session would stay stuck on
  // the initials fallback even after the website is corrected.
  const [logoNonce, setLogoNonce] = useState(0);

  const save = async () => {
    if (!creatorId || !form.brand.trim() || busy) return;
    setBusy(true); setErr(null);
    try {
      await onSave(creatorId, {
        brand: form.brand.trim(),
        name: form.brand.trim(),
        brandWebsite: form.website.trim() || null,
        budget: Number(form.clientCost) || 0,
        internalCost: Number(form.internalCost) || 0,
        url: form.url.trim() || null,
      });
      onClose();
    } catch (e) {
      setErr(e.message || "Could not save — check connection");
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={() => !busy && onClose()} style={{ position: "absolute", inset: 0, background: "rgba(4,5,10,0.55)", backdropFilter: "blur(4px)" }} />
      <div style={{ position: "relative", width: "min(440px,92vw)", background: T.surface, border: `1px solid ${T.borderMid}`, borderRadius: 10, overflow: "hidden", boxShadow: T.shadowLg }}>
        <div style={{ padding: "18px 20px 14px" }}>
          <div style={{ fontFamily: "'Newsreader',serif", fontSize: 17, fontStyle: "italic", color: T.text, marginBottom: 14 }}>Add a brand deal</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={FIELD}>
              Creator
              <Select value={creatorId} onChange={e => setCreatorId(e.target.value)} wrapStyle={{ width: "100%", marginTop: 4 }} style={{ width: "100%" }}>
                {creators.length === 0 && <option value="">No managed creators yet</option>}
                {creators.map(c => <option key={c.id} value={c.id}>{c.name} ({c.handle})</option>)}
              </Select>
            </label>
            <label style={FIELD}>
              Brand
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                {form.brand.trim() && <BrandLogo key={logoNonce} brand={form.brand} website={form.website} size={30} radius={7} />}
                <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                  placeholder="e.g. Acme Sneakers" style={{ ...INP, flex: 1, minWidth: 0, boxSizing: "border-box" }} />
              </div>
            </label>
            <label style={FIELD}>
              Website <span style={{ textTransform: "none", fontWeight: 400, color: T.sub, letterSpacing: 0 }}>— for a reliable logo</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                  placeholder="e.g. acmesneakers.com" style={{ ...INP, flex: 1, minWidth: 0, boxSizing: "border-box" }} />
                <GhostBtn type="button" color={T.accent} onClick={() => setLogoNonce(n => n + 1)} style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                  <RefreshCw size={11} style={{ verticalAlign: -2 }} /> Fetch logo
                </GhostBtn>
              </div>
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <label style={{ ...FIELD, flex: 1 }}>
                Client cost (₹)
                <input value={form.clientCost} onChange={e => setForm(f => ({ ...f, clientCost: moneyClean(e.target.value) }))}
                  placeholder="What the brand paid us" style={{ ...INP, width: "100%", marginTop: 4, boxSizing: "border-box" }} />
              </label>
              <label style={{ ...FIELD, flex: 1 }}>
                Internal cost (₹)
                <input value={form.internalCost} onChange={e => setForm(f => ({ ...f, internalCost: moneyClean(e.target.value) }))}
                  placeholder="What we paid the creator" style={{ ...INP, width: "100%", marginTop: 4, boxSizing: "border-box" }} />
              </label>
            </div>
            <label style={FIELD}>
              Reel / video link
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="Optional — auto-fetches likes/views/ER" style={{ ...INP, width: "100%", marginTop: 4, boxSizing: "border-box" }} />
            </label>
          </div>

          {err && <div style={{ fontSize: 10.5, color: T.red, marginTop: 10 }}>{err}</div>}
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={busy} style={{
            padding: "8px 16px", borderRadius: 6, fontSize: 11.5, fontWeight: 500, fontFamily: "'Sora'",
            background: "transparent", color: T.sub, border: `1px solid ${T.border}`,
            cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1,
          }}>Cancel</button>
          <button onClick={save} disabled={busy || !creatorId || !form.brand.trim()} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 6, fontSize: 11.5, fontWeight: 500, fontFamily: "'Sora'",
            background: T.accent, color: "#FFF", border: `1px solid ${T.accent}`,
            cursor: busy ? "not-allowed" : "pointer", opacity: (busy || !creatorId || !form.brand.trim()) ? 0.6 : 1,
          }}>
            {busy ? <Spinner size={11} color="#FFF" /> : <Plus size={12} />}
            {busy ? (form.url.trim() ? "Fetching reel…" : "Saving…") : "Add deal"}
          </button>
        </div>
      </div>
    </div>
  );
}

// One deal's margin: client cost in, internal cost out. Negative (we paid
// the creator more than the brand paid us) reads in red rather than being
// silently clamped — a deal running at a loss is exactly the thing this
// column exists to surface.
function Margin({ clientCost, internalCost }) {
  const m = (clientCost || 0) - (internalCost || 0);
  const color = m > 0 ? T.green : m < 0 ? T.red : T.label;
  const pct = clientCost > 0 ? Math.round((m / clientCost) * 100) : null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontWeight: 600, color }}>{fmtINR(m)}</span>
      {pct != null && <span style={{ fontSize: 9, fontWeight: 700, color, background: `${color}14`, padding: "1px 6px", borderRadius: 10 }}>{pct}%</span>}
    </span>
  );
}

// ── MONEY BAND ───────────────────────────────────────────────────────────────
// The totals for whatever is filtered in, plus one bar that answers "where
// does a brand's rupee go": the internal-cost share (gold) and the margin
// share (green) of client cost. A loss turns the whole bar red rather than
// drawing a share over 100%.
function MoneyBand({ count, clientCost, internalCost }) {
  const mounted = useMounted();
  const margin = clientCost - internalCost;
  const loss = margin < 0;
  const internalShare = clientCost > 0
    ? Math.min(100, (internalCost / clientCost) * 100)
    : 0;
  const marginShare = clientCost > 0 && !loss ? 100 - internalShare : 0;
  const marginPct = clientCost > 0
    ? Math.round((margin / clientCost) * 100)
    : 0;

  const metrics = [
    {
      label: "Client cost",
      value: clientCost,
      note: "paid by brands",
      icon: "₹",
      valueColor: "#155E59",
      iconColor: "#739A9A",
      iconBackground: "#EEF4F4",
    },
    {
      label: "Internal cost",
      value: internalCost,
      note: "paid to creators",
      icon: "↗",
      valueColor: "#155E59",
      iconColor: "#A38A56",
      iconBackground: "#F5F1E8",
    },
    {
      label: "Margin",
      value: margin,
      note: clientCost > 0 ? `${marginPct}% of client cost` : "—",
      icon: "↗",
      valueColor: loss ? "#B84C4C" : "#155E59",
      iconColor: loss ? "#B84C4C" : "#5FAF98",
      iconBackground: loss ? "#FAEEEE" : "#EDF6F2",
    },
  ];

  return (
    <Reveal className="managed-money-band">
      <style>{`
        .managed-money-band {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          width: 100%;
          box-sizing: border-box;
          margin-bottom: 14px;
          padding: 16px 18px 13px;
          border: 1px solid #D8E0E9;
          border-radius: 20px;
          background: linear-gradient(145deg, rgba(255,255,255,.97), rgba(244,247,250,.94));
          box-shadow:
            0 10px 26px rgba(35, 49, 69, .07),
            0 2px 5px rgba(35, 49, 69, .035),
            inset 0 1px 0 rgba(255,255,255,.95);
          color: #172B43;
        }
        .managed-money-band::before {
          content: "";
          position: absolute;
          z-index: -1;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(ellipse at 92% 0%, rgba(218,228,238,.3), transparent 43%);
        }
        .managed-money-metrics {
          display: grid;
          grid-template-columns: minmax(112px, .82fr) repeat(3, minmax(135px, 1.15fr)) minmax(72px, .48fr);
          align-items: stretch;
          gap: 8px;
        }
        .managed-money-deals,
        .managed-money-metric,
        .managed-money-donut-wrap {
          min-width: 0;
          min-height: 78px;
          box-sizing: border-box;
          border: 1px solid rgba(255,255,255,.92);
          border-radius: 15px;
          background: linear-gradient(145deg, rgba(255,255,255,.88), rgba(247,249,251,.72));
          box-shadow: 0 3px 12px rgba(35,49,69,.045), inset 0 1px 0 #fff;
        }
        .managed-money-deals {
          padding: 14px 15px 10px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .managed-money-metric {
          padding: 11px 12px 9px;
          display: flex;
          align-items: flex-start;
          gap: 9px;
        }
        .managed-money-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 30px;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          font-size: 16px;
          font-weight: 700;
          line-height: 1;
        }
        .managed-money-label {
          display: block;
          margin: 3px 0 7px;
          color: #778397;
          font-size: 9px;
          font-weight: 700;
          line-height: 1.2;
          letter-spacing: .105em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .managed-money-value {
          color: #155E59;
          font-size: clamp(19px, 1.5vw, 25px);
          font-weight: 750;
          line-height: 1.08;
          letter-spacing: -.045em;
          white-space: nowrap;
        }
        .managed-money-note {
          margin-top: 4px;
          color: #7A8796;
          font-size: 9px;
          line-height: 1.25;
          white-space: nowrap;
        }
        .managed-money-deals .managed-money-label {
          margin: 0 0 8px;
        }
        .managed-money-count {
          color: #536F7C;
          font-size: 36px;
          font-weight: 750;
          line-height: .98;
          letter-spacing: -.055em;
        }
        .managed-money-donut-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
        }
        .managed-money-donut {
          width: 58px;
          height: 58px;
          flex: 0 0 58px;
          display: block;
        }
        .managed-money-bar-area {
          padding: 0 13px;
          margin-top: 10px;
        }
        .managed-money-bar {
          display: flex;
          width: 100%;
          height: 10px;
          overflow: hidden;
          border-radius: 999px;
          background: #E8EDF1;
          box-shadow: inset 0 1px 2px rgba(27,45,60,.06);
        }
        .managed-money-bar-internal {
          background: #D7C48C;
          transition: width .75s cubic-bezier(.2,.7,.2,1);
        }
        .managed-money-bar-margin {
          background: #65B99E;
          transition: width .75s cubic-bezier(.2,.7,.2,1);
        }
        .managed-money-caption {
          margin-top: 8px;
          color: #69788B;
          font-size: 10px;
          line-height: 1.5;
          letter-spacing: -.01em;
        }
        .managed-money-caption strong {
          color: #A78B45;
          font-weight: 750;
        }
        .managed-money-caption .managed-money-margin-text {
          color: #369777;
        }
        @media (max-width: 850px) {
          .managed-money-metrics {
            grid-template-columns: minmax(90px, .7fr) repeat(2, minmax(125px, 1fr));
          }
          .managed-money-donut-wrap {
            grid-column: 1 / -1;
            min-height: 65px;
          }
          .managed-money-donut {
            width: 52px;
            height: 52px;
          }
        }
        @media (max-width: 560px) {
          .managed-money-band {
            padding: 12px;
            border-radius: 16px;
          }
          .managed-money-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 7px;
          }
          .managed-money-deals,
          .managed-money-metric {
            min-height: 78px;
            padding: 10px;
          }
          .managed-money-deals {
            grid-column: 1 / -1;
            min-height: 65px;
          }
          .managed-money-metric {
            gap: 7px;
          }
          .managed-money-icon {
            flex-basis: 26px;
            width: 26px;
            height: 26px;
            font-size: 14px;
          }
          .managed-money-label {
            font-size: 8px;
            letter-spacing: .07em;
          }
          .managed-money-value {
            font-size: 19px;
          }
          .managed-money-note {
            font-size: 8px;
          }
          .managed-money-donut-wrap {
            grid-column: 1 / -1;
            min-height: 62px;
          }
          .managed-money-bar-area {
            margin-top: 10px;
            padding: 0 2px;
          }
          .managed-money-caption {
            font-size: 9px;
          }
        }
      `}</style>

      <div className="managed-money-metrics">
        <div className="managed-money-deals">
          <span className="managed-money-label">Deals shown</span>
          <span className="managed-money-count">
            <CountUp value={count} />
          </span>
        </div>

        {metrics.map((metric) => (
          <div className="managed-money-metric" key={metric.label}>
            <span
              className="managed-money-icon"
              aria-hidden="true"
              style={{
                color: metric.iconColor,
                background: metric.iconBackground,
              }}
            >
              {metric.icon}
            </span>
            <div style={{ minWidth: 0 }}>
              <span className="managed-money-label">{metric.label}</span>
              <div
                className="managed-money-value"
                style={{ color: metric.valueColor }}
              >
                <CountUp value={metric.value} format={inr} />
              </div>
              <div className="managed-money-note">{metric.note}</div>
            </div>
          </div>
        ))}

        <div className="managed-money-donut-wrap">
          <svg
            className="managed-money-donut"
            viewBox="0 0 64 64"
            role="img"
            aria-label={`${Math.max(0, marginPct)} percent margin`}
          >
            <circle
              cx="32"
              cy="32"
              r="25"
              fill="none"
              stroke="#E0E7EB"
              strokeWidth="7"
            />
            <circle
              cx="32"
              cy="32"
              r="25"
              fill="none"
              stroke={loss ? "#C46C6C" : "#65B99E"}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(0, Math.min(100, marginPct)) * 1.5708} 157.08`}
              transform="rotate(-90 32 32)"
              style={{ transition: "stroke-dasharray .75s ease" }}
            />
            <text
              x="32"
              y="35"
              textAnchor="middle"
              fontSize="12"
              fontWeight="750"
              fill="#24394D"
            >
              {clientCost > 0 ? `${marginPct}%` : "—"}
            </text>
          </svg>
        </div>
      </div>

      <div className="managed-money-bar-area">
        <div
          className="managed-money-bar"
          role="img"
          aria-label={`Internal cost ${Math.round(internalShare)} percent, margin ${Math.round(marginShare)} percent`}
        >
          <div
            className="managed-money-bar-internal"
            style={{
              width: mounted ? `${loss ? 100 : internalShare}%` : "0%",
              background: loss ? "#C46C6C" : undefined,
            }}
          />
          {marginShare > 0 && (
            <div
              className="managed-money-bar-margin"
              style={{
                width: mounted ? `${marginShare}%` : "0%",
              }}
            />
          )}
        </div>

        <div className="managed-money-caption">
          {clientCost === 0 ? (
            "No client cost logged on these deals yet."
          ) : loss ? (
            "Running at a loss — creators are being paid more than brands paid us."
          ) : (
            <>
              Of every ₹100 a brand pays:{" "}
              <strong>₹{Math.round(internalShare)}</strong> goes to the creator,{" "}
              <strong className="managed-money-margin-text">
                ₹{Math.round(marginShare)}
              </strong>{" "}
              is margin.
            </>
          )}
        </div>
      </div>
    </Reveal>
  );
}

// ── ROW ──────────────────────────────────────────────────────────────────────
function DealRow({ d, creator, canEdit, isEditing, onStartEdit, onCancelEdit, onSave, onAskRemove, busy }) {
  const [form, setForm] = useState(null);
  // Same remount-and-retry trick as AddDealModal's Fetch button — see there.
  const [logoNonce, setLogoNonce] = useState(0);

  const td = { padding: "9px 10px", textAlign: "center", fontSize: 11, color: T.text, whiteSpace: "nowrap", borderBottom: `1px solid ${T.border}` };

  // Enter edit mode: seed the local form from the row the moment it opens,
  // not on every render — so typing doesn't fight a parent re-render.
  if (isEditing && !form) {
    setForm({
      brand: d.brand || "", website: d.brandWebsite || "", clientCost: String(d.budget ?? ""),
      internalCost: String(d.internalCost ?? ""), url: d.url || "",
    });
  }
  if (!isEditing && form) setForm(null);

  const save = () => {
    onSave(d, {
      brand: form.brand.trim(),
      name: form.brand.trim(),
      brandWebsite: form.website.trim() || null,
      budget: Number(form.clientCost) || 0,
      internalCost: Number(form.internalCost) || 0,
      url: form.url.trim() || null,
    });
  };

  if (isEditing && form) {
    const changedUrl = form.url.trim() && form.url.trim() !== (d.url || "");
    return (
      <tr style={{ background: T.hover }}>
        <td style={{ ...td, textAlign: "left", fontWeight: 500 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <CreatorAvatar creator={creator} size={24} radius={7} />
            <span>{d.creatorName || "—"}</span>
          </div>
        </td>
        <td style={{ ...td, textAlign: "left" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {form.brand.trim() && <BrandLogo key={logoNonce} brand={form.brand} website={form.website} size={18} radius={5} />}
              <input autoFocus disabled={busy} value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                placeholder="Brand" style={{ ...INP, fontSize: 11, width: 110, opacity: busy ? 0.6 : 1 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input disabled={busy} value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                placeholder="Website (for logo)" style={{ ...INP, fontSize: 9.5, padding: "4px 7px", width: 110, opacity: busy ? 0.6 : 1 }} />
              <button type="button" disabled={busy} onClick={() => setLogoNonce(n => n + 1)} title="Fetch logo from this website"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  width: 20, height: 20, border: `1px solid ${T.border}`, background: "transparent", borderRadius: 4,
                  cursor: busy ? "not-allowed" : "pointer", color: T.accent,
                }}>
                <RefreshCw size={10} />
              </button>
            </div>
          </div>
        </td>
        <td style={td}>
          <input disabled={busy} value={form.clientCost} onChange={e => setForm(f => ({ ...f, clientCost: moneyClean(e.target.value) }))}
            placeholder="0" style={{ ...INP, fontSize: 11, width: 84, textAlign: "right", opacity: busy ? 0.6 : 1 }} />
        </td>
        <td style={td}>
          <input disabled={busy} value={form.internalCost} onChange={e => setForm(f => ({ ...f, internalCost: moneyClean(e.target.value) }))}
            placeholder="0" style={{ ...INP, fontSize: 11, width: 84, textAlign: "right", opacity: busy ? 0.6 : 1 }} />
        </td>
        <td style={td}><Margin clientCost={Number(form.clientCost) || 0} internalCost={Number(form.internalCost) || 0} /></td>
        <td style={{ ...td, textAlign: "left" }}>
          <input disabled={busy} value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
            placeholder="Reel link" style={{ ...INP, fontSize: 11, width: 150, opacity: busy ? 0.6 : 1 }} />
        </td>
        <td style={td} colSpan={3}>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }}>
            {busy ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, color: T.sub }}>
                <Spinner size={11} color={T.sub} /> {changedUrl ? "Fetching reel…" : "Saving…"}
              </span>
            ) : (
              <>
                <GhostBtn color={T.accent} disabled={!form.brand.trim()} onClick={save}><Check size={11} style={{ verticalAlign: -2 }} /> Save</GhostBtn>
                <GhostBtn color={T.sub} onClick={onCancelEdit}><X size={11} style={{ verticalAlign: -2 }} /> Cancel</GhostBtn>
              </>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="fx-row">
      <td style={{ ...td, textAlign: "left", fontWeight: 500 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <CreatorAvatar creator={creator} size={24} radius={7} />
            <span>{d.creatorName || "—"}</span>
          </div>
        </td>
      <td style={{ ...td, textAlign: "left" }}>
        {d.brand ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <BrandLogo brand={d.brand} website={d.brandWebsite} size={18} radius={5} />
            <span>{d.brand}</span>
          </div>
        ) : <span style={{ color: T.label }}>—</span>}
      </td>
      <td style={{ ...td, fontWeight: 600 }}>{fmtINR(d.budget)}</td>
      <td style={td}>{fmtINR(d.internalCost)}</td>
      <td style={td}><Margin clientCost={d.budget} internalCost={d.internalCost} /></td>
      <td style={{ ...td, textAlign: "left" }}>
        {d.url
          ? <a href={d.url} target="_blank" rel="noreferrer" style={{ color: T.accent, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
              title={d.media?.ok === false ? "Link couldn't be read" : "Open on Instagram"}>
              {d.media?.ok ? fmtCompact(d.media.views) + " views" : d.media?.ok === false ? "⚠ couldn't fetch" : "Open"} <ExternalLink size={10} />
            </a>
          : <span style={{ color: T.label }}>—</span>}
      </td>
      <td style={td}>{d.media?.ok && d.media.er != null ? `${d.media.er}%` : "—"}</td>
      <td style={td}>{d.createdAt ? prettyDate(String(d.createdAt).slice(0, 10)) : "—"}</td>
      <td style={td}>
        {canEdit && (
          <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
            <GhostBtn color={T.accent} disabled={busy} onClick={onStartEdit}><Pencil size={11} style={{ verticalAlign: -2 }} /></GhostBtn>
            <GhostBtn color={T.red} disabled={busy} onClick={() => onAskRemove(d)}><Trash2 size={11} style={{ verticalAlign: -2 }} /></GhostBtn>
          </div>
        )}
      </td>
    </tr>
  );
}

// ── BRAND CARD ───────────────────────────────────────────────────────────────
// The board is organised by BRAND: one card per brand, its logo as the
// masthead, what that brand has paid and where the money went, the creators
// on it, and its deals listed underneath. No reels here — those live on the
// Assets tab. Editing a deal still happens inline in the table (Edit jumps
// there); the logo website is set per brand and written to all its deals.
const ACCENTS = [T.purple, T.teal, T.gold, T.pink, "#3B6EDB"];
function accentFor(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

function BrandDealRow({ d, creator, canEdit, busy, onEdit, onAskRemove }) {
  const margin = (d.budget || 0) - (d.internalCost || 0);
  const iconBtn = { width: 26, height: 26, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${T.border}`, background: T.surface, cursor: busy ? "not-allowed" : "pointer", flexShrink: 0 };
  return (
    <div className="bc-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", borderRadius: 10 }}>
      <CreatorAvatar creator={creator || { name: d.creatorName }} size={30} radius={15} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.creatorName || "—"}</div>
        <div style={{ fontSize: 9.5, color: T.label, marginTop: 1 }}>{d.createdAt ? prettyDate(String(d.createdAt).slice(0, 10)) : "—"}</div>
      </div>
      <StatusPill status={dealStatus(d)} />
      <div style={{ textAlign: "right", minWidth: 74 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{fmtINR(d.budget)}</div>
        <div style={{ fontSize: 9.5, fontWeight: 600, color: margin >= 0 ? T.green : T.red }}>{margin >= 0 ? "+" : ""}{fmtINR(margin)}</div>
      </div>
      {canEdit && (
        <div className="bc-actions" style={{ display: "flex", gap: 4 }}>
          <button type="button" title="Edit deal" disabled={busy} onClick={() => onEdit(d.id)} style={{ ...iconBtn, color: T.accent }}><Pencil size={11} /></button>
          <button type="button" title="Remove deal" disabled={busy} onClick={() => onAskRemove(d)} style={{ ...iconBtn, color: T.red }}><Trash2 size={11} /></button>
        </div>
      )}
    </div>
  );
}

function BrandCard({ group, creatorById, canEdit, busy, onEditDeal, onAskRemove, onAddForBrand, onSetWebsite, i }) {
  const { name, deals, clientCost, internalCost, website } = group;
  const mounted = useMounted();
  const margin = clientCost - internalCost;
  const loss = margin < 0;
  const accent = accentFor(name);
  const internalShare = clientCost > 0 ? Math.min(100, (internalCost / clientCost) * 100) : 0;
  const marginPct = clientCost > 0 ? Math.round((margin / clientCost) * 100) : null;
  const creatorsIn = [...new Map(deals.map(d => [d.creatorId, creatorById.get(d.creatorId) || { name: d.creatorName }])).values()];
  const domain = domainFromWebsite(website);
  const named = name !== "Unspecified";

  const [editingSite, setEditingSite] = useState(false);
  const [site, setSite] = useState(website || "");
  const [saving, setSaving] = useState(false);
  const saveSite = async () => {
    setSaving(true);
    try { await onSetWebsite(name, site.trim()); setEditingSite(false); } finally { setSaving(false); }
  };

  return (
    <Reveal i={i} className="fx-lift" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, overflow: "hidden", boxShadow: T.shadow, display: "flex", flexDirection: "column" }}>
      {/* Masthead */}
      <div style={{ position: "relative", padding: "20px 20px 16px", background: `linear-gradient(135deg, ${accent}21 0%, ${accent}0A 55%, rgba(255,255,255,0) 100%)`, borderBottom: `1px solid ${T.border}` }}>
        <div aria-hidden style={{ position: "absolute", right: -40, top: -50, width: 170, height: 170, borderRadius: "50%", background: `radial-gradient(circle, ${accent}26, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ borderRadius: 18, boxShadow: "0 10px 24px rgba(28,24,16,0.14)", flexShrink: 0 }}>
            <BrandLogo brand={named ? name : ""} website={website} size={62} radius={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Newsreader',serif", fontStyle: "italic", fontSize: 23, fontWeight: 600, color: T.text, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6, fontSize: 10.5, color: T.sub, flexWrap: "wrap" }}>
              <span>{deals.length} deal{deals.length === 1 ? "" : "s"}</span>
              <span style={{ color: T.label }}>·</span>
              <span>{creatorsIn.length} creator{creatorsIn.length === 1 ? "" : "s"}</span>
              {domain && <>
                <span style={{ color: T.label }}>·</span>
                <a href={`https://${domain}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 3, color: T.accent, textDecoration: "none" }}><Globe size={10} />{domain}</a>
              </>}
              {canEdit && named && !editingSite && (
                <button type="button" onClick={() => { setSite(website || ""); setEditingSite(true); }} style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: "'Sora'", fontSize: 10.5, color: T.accent, textDecoration: "underline", textUnderlineOffset: 2 }}>
                  {domain ? "change" : "Set logo website"}
                </button>
              )}
            </div>
          </div>
          <div style={{ display: "flex", flexShrink: 0 }}>
            {creatorsIn.slice(0, 4).map((c, k) => (
              <div key={k} title={c.name} style={{ marginLeft: k ? -10 : 0, borderRadius: "50%", border: "2px solid #FFF", position: "relative", zIndex: 10 - k }}>
                <CreatorAvatar creator={c} size={28} radius={14} />
              </div>
            ))}
            {creatorsIn.length > 4 && (
              <div style={{ marginLeft: -10, width: 32, height: 32, borderRadius: "50%", border: "2px solid #FFF", background: T.mute, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 700, color: T.sub }}>+{creatorsIn.length - 4}</div>
            )}
          </div>
        </div>
        {editingSite && (
          <div style={{ position: "relative", display: "flex", gap: 6, marginTop: 12, alignItems: "center" }}>
            <BrandLogo brand={name} website={site} size={28} radius={8} />
            <input autoFocus value={site} onChange={e => setSite(e.target.value)} placeholder={`${name}'s website, e.g. ${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`}
              onKeyDown={e => { if (e.key === "Enter") saveSite(); if (e.key === "Escape") setEditingSite(false); }}
              style={{ ...INP, flex: 1, minWidth: 0, fontSize: 11 }} />
            <GhostBtn color={T.accent} disabled={saving} onClick={saveSite}>{saving ? "Saving…" : "Save"}</GhostBtn>
            <GhostBtn color={T.sub} disabled={saving} onClick={() => setEditingSite(false)}>Cancel</GhostBtn>
          </div>
        )}
      </div>

      {/* Money */}
      <div style={{ padding: "14px 20px 4px" }}>
        <div style={{ display: "flex", gap: 10 }}>
          {[["Client cost", clientCost, MONEY.client, T.text], ["Paid to creators", internalCost, MONEY.internal, T.text], ["Margin", margin, loss ? MONEY.loss : MONEY.margin, loss ? T.red : T.green]].map(([label, v, swatch, color], k) => (
            <div key={label} style={{ flex: 1, minWidth: 0, paddingLeft: k ? 10 : 0, borderLeft: k ? `1px solid ${T.border}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 8.5, color: T.label, textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: swatch, flexShrink: 0 }} />{label}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 4 }}>
                <span style={{ fontSize: 17, fontWeight: 700, color, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}><CountUp value={v} format={inr} /></span>
                {label === "Margin" && marginPct != null && <span style={{ fontSize: 9, fontWeight: 700, color, background: `${color}14`, padding: "1px 6px", borderRadius: 10 }}>{marginPct}%</span>}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 2, height: 7, borderRadius: 4, overflow: "hidden", background: T.mute, marginTop: 12 }}>
          <div className="fx-bar" style={{ width: mounted ? `${loss ? 100 : internalShare}%` : 0, background: loss ? MONEY.loss : MONEY.internal, borderRadius: 4 }} />
          {!loss && clientCost > 0 && <div className="fx-bar" style={{ width: mounted ? `${100 - internalShare}%` : 0, background: MONEY.margin, borderRadius: 4, transitionDelay: ".12s" }} />}
        </div>
      </div>

      {/* Deals */}
      <div style={{ padding: "10px 12px 6px", flex: 1 }}>
        <div style={{ fontSize: 8.5, fontWeight: 600, color: T.label, textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 8px 4px" }}>Deals</div>
        {deals.map(d => (
          <BrandDealRow key={d.id} d={d} creator={creatorById.get(d.creatorId)} canEdit={canEdit} busy={busy} onEdit={onEditDeal} onAskRemove={onAskRemove} />
        ))}
      </div>

      {canEdit && (
        <button type="button" onClick={() => onAddForBrand(named ? name : "", website || "")} className="bc-add" style={{
          margin: "4px 20px 16px", padding: "9px 0", borderRadius: 10, border: `1px dashed ${T.borderMid}`, background: "transparent",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", fontFamily: "'Sora'", fontSize: 11, fontWeight: 500, color: T.sub,
        }}><Plus size={12} /> Add deal{named ? ` for ${name}` : ""}</button>
      )}
    </Reveal>
  );
}

const BRAND_CSS = `
  .bc-row { transition: background .15s ease; }
  .bc-row:hover { background: ${T.hover}; }
  .bc-row .bc-actions { opacity: .35; transition: opacity .15s ease; }
  .bc-row:hover .bc-actions, .bc-row:focus-within .bc-actions { opacity: 1; }
  .bc-add:hover { border-color: ${T.accent} !important; color: ${T.accent} !important; background: ${T.accent}08 !important; }
`;

// ── TAB ──────────────────────────────────────────────────────────────────────
const VIEW_KEY = "managed.campaigns.view";
const readView = () => { try { return localStorage.getItem(VIEW_KEY) === "table" ? "table" : "brands"; } catch { return "brands"; } };

export default function CampaignsTab({ creators, deals, dealsLoading, canEdit, onAddDeal, onRemoveDeal, onUpdateDeal, showToast }) {
  const [brandFilter, setBrandFilter] = useState("");
  const [creatorFilter, setCreatorFilter] = useState("");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [view, setViewState] = useState(readView);
  const setView = (v) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* per-viewer convenience only */ } };

  // Brand rail: every brand with its deal count and a known website for the
  // logo (first one saved on any of its deals).
  const brands = useMemo(() => {
    const m = new Map();
    deals.forEach(d => {
      if (!d.brand) return;
      const r = m.get(d.brand) || { name: d.brand, count: 0, website: null };
      r.count++; if (!r.website && d.brandWebsite) r.website = d.brandWebsite;
      m.set(d.brand, r);
    });
    return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [deals]);
  // Looked up per row for the avatar beside each creator's name — deals carry
  // creatorName/Handle/Platform (GET /api/projects' join) but not the photo
  // fields, which live only on the full creator record already in hand here.
  const creatorById = useMemo(() => new Map(creators.map(c => [c.id, c])), [creators]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deals.filter(d =>
      (!brandFilter || d.brand === brandFilter) &&
      (!creatorFilter || d.creatorId === creatorFilter) &&
      (!q || [d.creatorName, d.brand].filter(Boolean).some(v => String(v).toLowerCase().includes(q)))
    );
  }, [deals, brandFilter, creatorFilter, search]);

  const totals = useMemo(() => visible.reduce((acc, d) => {
    acc.clientCost += d.budget || 0;
    acc.internalCost += d.internalCost || 0;
    return acc;
  }, { clientCost: 0, internalCost: 0 }), [visible]);

  const save = async (d, patch) => {
    setBusy(true);
    try {
      await onUpdateDeal(d.creatorId, d.id, patch);
      setEditingId(null);
    } catch (e) {
      showToast?.(e.message || "Could not save — check connection");
    } finally { setBusy(false); }
  };

  const remove = async (d) => {
    setBusy(true);
    try { await onRemoveDeal(d.creatorId, d.id); } finally { setBusy(false); setRemoving(null); }
  };

  const editFromBoard = (id) => { setView("table"); setEditingId(id); };

  // Brand cards: one per brand among the filtered deals, biggest spend first.
  const brandGroups = useMemo(() => {
    const m = new Map();
    visible.forEach(d => {
      const name = d.brand || "Unspecified";
      const g = m.get(name) || { name, deals: [], clientCost: 0, internalCost: 0, website: null };
      g.deals.push(d);
      g.clientCost += d.budget || 0;
      g.internalCost += d.internalCost || 0;
      if (!g.website && d.brandWebsite) g.website = d.brandWebsite;
      m.set(name, g);
    });
    const t = d => Date.parse(d.createdAt || 0) || 0;
    return [...m.values()]
      .map(g => ({ ...g, deals: [...g.deals].sort((a, b) => t(b) - t(a)) }))
      .sort((a, b) => b.clientCost - a.clientCost);
  }, [visible]);

  // The logo website belongs to the brand, not one deal — write it to every
  // deal carrying that brand name so every view of the brand agrees.
  const setBrandWebsite = async (name, website) => {
    const targets = deals.filter(d => (d.brand || "") === name);
    setBusy(true);
    try {
      for (const d of targets) await onUpdateDeal(d.creatorId, d.id, { brandWebsite: website || null });
      showToast?.(website ? `Logo website saved for ${name}` : `Logo website cleared for ${name}`);
    } catch (e) {
      showToast?.(e.message || "Could not save — check connection");
    } finally { setBusy(false); }
  };

  const th = { padding: "9px 10px", textAlign: "center", fontSize: 9, fontWeight: 600, color: T.label, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", borderBottom: `1px solid ${T.border}`, background: T.raised, position: "sticky", top: 0, zIndex: 1 };
  const chip = (active) => ({
    display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0, cursor: "pointer", fontFamily: "'Sora'",
    padding: "5px 12px 5px 5px", borderRadius: 24, fontSize: 11, fontWeight: active ? 600 : 500,
    color: active ? "#FFF" : T.text, background: active ? T.accent : T.surface,
    border: `1px solid ${active ? T.accent : T.border}`, boxShadow: active ? "0 3px 10px rgba(31,44,82,0.22)" : "none",
    transition: "all .18s ease",
  });
  const segBtn = (active) => ({
    display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", border: "none", borderRadius: 6, cursor: "pointer",
    fontSize: 11, fontFamily: "'Sora'", fontWeight: 500, background: active ? T.surface : "transparent",
    color: active ? T.accent : T.sub, boxShadow: active ? T.shadow : "none",
  });

  return (
    <div>
      <style>{FX_CSS + BRAND_CSS}</style>

      {/* Toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ marginRight: "auto", fontSize: 11, color: T.sub, maxWidth: 420 }}>
          Every brand deal a managed creator is running or has run.
        </div>
        <div style={{ position: "relative" }}>
          <Search size={12} color={T.label} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search creator or brand…"
            style={{ ...INP, width: 180, paddingLeft: 26, boxSizing: "border-box" }} />
        </div>
        <Select value={creatorFilter} onChange={e => setCreatorFilter(e.target.value)}>
          <option value="">All creators</option>
          {creators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <div style={{ display: "inline-flex", padding: 3, borderRadius: 8, background: T.mute }}>
          <button type="button" style={segBtn(view === "brands")} onClick={() => setView("brands")}><LayoutGrid size={12} /> Brands</button>
          <button type="button" style={segBtn(view === "table")} onClick={() => setView("table")}><List size={12} /> Table</button>
        </div>
        {canEdit && (
          <button onClick={() => setAdding(true)} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "8px 16px", borderRadius: 8, fontSize: 11.5, fontWeight: 500, fontFamily: "'Sora'",
            background: T.accent, color: "#FFF", border: `1px solid ${T.accent}`, cursor: "pointer", whiteSpace: "nowrap",
          }}><Plus size={13} /> Add deal</button>
        )}
      </div>

      {/* Brand rail */}
      {brands.length > 0 && (
        <div className="fx-rail" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "4px 4px 12px", margin: "-4px -4px 6px" }}>
          <button type="button" onClick={() => setBrandFilter("")} style={{ ...chip(!brandFilter), padding: "5px 14px" }}>All brands <span style={{ opacity: 0.6 }}>{deals.length}</span></button>
          {brands.map(b => (
            <button type="button" key={b.name} onClick={() => setBrandFilter(brandFilter === b.name ? "" : b.name)} style={chip(brandFilter === b.name)}>
              <BrandLogo brand={b.name} website={b.website} size={22} />
              {b.name}
              <span style={{ fontSize: 9.5, opacity: 0.6 }}>{b.count}</span>
            </button>
          ))}
        </div>
      )}

      {dealsLoading ? (
        <Notice>Loading deals…</Notice>
      ) : visible.length === 0 ? (
        <Notice tone="empty">
          {brandFilter || creatorFilter || search ? "No deals match those filters." : "No brand deals logged yet — add one above, or from a creator's own card on the Creators tab."}
        </Notice>
      ) : (
        <>
          <MoneyBand count={visible.length} clientCost={totals.clientCost} internalCost={totals.internalCost} />

          {view === "brands" ? (
            <div style={{ display: "grid", gap: 16, alignItems: "start", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}>
              {brandGroups.map((g, i) => (
                <BrandCard key={g.name} i={i} group={g} creatorById={creatorById} canEdit={canEdit} busy={busy}
                  onEditDeal={editFromBoard} onAskRemove={setRemoving}
                  onAddForBrand={(brand, website) => setAdding({ brand, website })}
                  onSetWebsite={setBrandWebsite} />
              ))}
            </div>
          ) : (
            <Reveal style={{ overflow: "auto", maxHeight: "70vh", border: `1px solid ${T.border}`, borderRadius: 14, background: T.surface, boxShadow: T.shadow }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "left" }}>Creator</th>
                    <th style={{ ...th, textAlign: "left" }}>Brand</th>
                    <th style={th}>Client Cost</th>
                    <th style={th}>Internal Cost</th>
                    <th style={th}>Margin</th>
                    <th style={{ ...th, textAlign: "left" }}>Reel</th>
                    <th style={th}>ER</th>
                    <th style={th}>Added</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(d => (
                    <DealRow key={d.id} d={d} creator={creatorById.get(d.creatorId)} canEdit={canEdit} busy={busy}
                      isEditing={editingId === d.id}
                      onStartEdit={() => setEditingId(d.id)}
                      onCancelEdit={() => setEditingId(null)}
                      onSave={save}
                      onAskRemove={setRemoving} />
                  ))}
                </tbody>
              </table>
            </Reveal>
          )}
        </>
      )}

      {adding && <AddDealModal creators={creators} onSave={onAddDeal} onClose={() => setAdding(false)}
        initialBrand={adding.brand} initialWebsite={adding.website} />}
      {removing && (
        <ConfirmDialog
          title="Remove this deal?"
          body={<>Removing the <b>{removing.brand || "—"}</b> deal for <b>{removing.creatorName}</b> cannot be undone.</>}
          busy={busy}
          onConfirm={() => remove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
