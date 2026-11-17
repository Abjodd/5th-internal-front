/**
 * Services → Consultant (internal, founder only).
 *
 * Every consultant as a card: who they are, the figures worth scanning
 * (brands, POCs, UGC creators, documents) and how complete their record is.
 * Opening a card spans it across the row and shows every section as its own
 * panel, each editable on the spot:
 *
 *   1 Basic · 2 Billing · 3 HQ · 4 Tax · 5 Primary contact   (inline forms)
 *   6 POCs · 7 Brands · 8 Dedicated UGC creators · 9 Documents
 *   + portal logins (managed in Settings → Consultant Login) and internal notes
 *
 * Sections save one at a time (PATCH with only that section), so two people
 * editing different sections of one consultant never overwrite each other.
 * The consultant portal, built later, reads this same record.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  BriefcaseBusiness, Building2, Receipt, Landmark, IdCard, UserRound, Users, Tags, Clapperboard,
  FolderOpen, KeyRound, NotebookPen, Plus, Pencil, Trash2, Upload, ExternalLink, Download, Mail, Phone, X, ImageIcon,
} from "lucide-react";
import { ConsultantsAPI, CreatorsAPI } from "../../lib/api";
import { T } from "../../theme/tokens";
import BrandLogo from "../../components/BrandLogo";
import AvatarPicker from "../../components/AvatarPicker";
import { Card, CardGrid, CARD_CSS, Fact, GhostBtn, INP, Notice, Pill, Select, Spinner, panel, panelTitle } from "../Creators/shared";
import { SECTIONS, PERSON_FIELDS, sectionValue, sectionErrors, sectionPatch, completeness, EMAIL_RE } from "./consultantFields";

const ICONS = { basic: BriefcaseBusiness, billing: Receipt, hq: Building2, tax: Landmark, primary: IdCard };
const MAX_FILE = 3 * 1024 * 1024;
const fmtSize = (b) => (b == null ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
const inr = (n) => (n == null || n === "" ? "—" : `₹${Number(n).toLocaleString("en-IN")}`);
const initials = (name) => String(name || "?").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const errText = (e) => e?.body?.error || e?.message || "Something went wrong";
const PALETTE = [T.purple, T.teal, T.gold, T.pink, "#3B6EDB"];
const colorFor = (s) => { let h = 0; for (const ch of String(s || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };

// ── small pieces ────────────────────────────────────────────────────────────
/** The consultant's picture, or their initials on a tinted tile. */
function ConsultantAvatar({ c, size = 40, radius = 10 }) {
  const [broken, setBroken] = useState(false);
  const url = !broken && ConsultantsAPI.avatarUrl(c);
  const col = colorFor(c.name);
  return url
    ? <img src={url} alt="" onError={() => setBroken(true)} style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", flexShrink: 0, border: `1px solid ${T.border}`, background: T.raised }} />
    : <span style={{ width: size, height: size, borderRadius: radius, background: `${col}16`, color: col, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size / 3.1), fontWeight: 600, flexShrink: 0, border: `1px solid ${col}30` }}>{initials(c.name)}</span>;
}

const lbl = { fontSize: 9, fontWeight: 600, color: T.label, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 };
const Btn = ({ primary, danger, disabled, children, style = {}, ...rest }) => (
  <button type="button" disabled={disabled} {...rest} style={{
    display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6, fontSize: 11.5,
    fontWeight: 500, fontFamily: "'Sora'", cursor: disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap",
    opacity: disabled ? 0.55 : 1,
    background: primary ? T.accent : danger ? T.red : T.surface,
    color: primary || danger ? "#FFF" : T.text,
    border: `1px solid ${primary ? T.accent : danger ? T.red : T.border}`, ...style,
  }}>{children}</button>
);

function Field({ field, value, error, onChange, autoFocus }) {
  const common = {
    value: value ?? "", autoFocus, placeholder: field.placeholder,
    onChange: (e) => onChange(field.upper ? e.target.value.toUpperCase() : e.target.value),
    style: { ...INP, width: "100%", boxSizing: "border-box", borderColor: error ? `${T.red}80` : T.border, ...(field.upper ? { fontFamily: "monospace", letterSpacing: "0.03em" } : {}) },
  };
  return (
    <label style={{ display: "block", marginBottom: 9 }}>
      <span style={lbl}>{field.label}{field.required && <span style={{ color: T.red }}> *</span>}</span>
      {field.multiline ? <textarea rows={2} {...common} style={{ ...common.style, resize: "vertical" }} /> : <input {...common} />}
      {error && <span style={{ display: "block", fontSize: 9.5, color: T.red, marginTop: 3 }}>{error}</span>}
    </label>
  );
}

function PanelHead({ icon: Icon, n, title, aside }) {
  return (
    <div style={{ ...panelTitle, display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
      {Icon && <Icon size={12} strokeWidth={2.2} style={{ color: T.accent, flexShrink: 0 }} />}
      {n && <span style={{ color: T.accent }}>{n}</span>}
      <span>{title}</span>
      {aside && <span style={{ marginLeft: "auto", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>{aside}</span>}
    </div>
  );
}

function Modal({ title, onClose, children, footer, width = 640 }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(20,18,12,0.38)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", overflowY: "auto" }}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: width, background: T.surface, borderRadius: 10, boxShadow: T.shadowLg, border: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontSize: 19, fontWeight: 600, color: T.text }}>{title}</div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: T.label, display: "flex" }}><X size={16} /></button>
        </div>
        <div style={{ padding: "16px 18px" }}>{children}</div>
        {footer && <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 18px", borderTop: `1px solid ${T.border}`, background: T.raised, borderRadius: "0 0 10px 10px" }}>{footer}</div>}
      </div>
    </div>
  );
}

// ── 1–5: one section as a panel that turns into its own form ───────────────
function SectionPanel({ consultant, section, onSave, wide }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(null);
  const value = sectionValue(consultant, section);
  const open = () => { setDraft(value); setErrors({}); setFailed(null); setEditing(true); };
  const save = async () => {
    const e = sectionErrors(section, draft);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true); setFailed(null);
    try { await onSave(sectionPatch(section, draft), `${section.title} saved`); setEditing(false); }
    catch (err) { setFailed(errText(err)); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ ...panel, minWidth: wide ? 300 : 220 }} data-testid={`panel-${section.id}`}>
      <PanelHead icon={ICONS[section.id]} n={section.n} title={section.title}
        aside={!editing && <GhostBtn onClick={open}><Pencil size={9} style={{ verticalAlign: -1 }} /> Edit</GhostBtn>} />
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); save(); }}>
          {section.fields.map((f, i) => (
            <Field key={f.key} field={f} value={draft[f.key]} error={errors[f.key]} autoFocus={i === 0}
              onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
          ))}
          {failed && <div style={{ fontSize: 10, color: T.red, marginBottom: 8 }}>{failed}</div>}
          <div style={{ display: "flex", gap: 6 }}>
            <Btn primary type="submit" onClick={save} disabled={saving} style={{ padding: "5px 12px", fontSize: 10.5 }}>{saving ? <Spinner size={10} /> : null}Save</Btn>
            <Btn onClick={() => setEditing(false)} style={{ padding: "5px 12px", fontSize: 10.5 }}>Cancel</Btn>
          </div>
        </form>
      ) : (
        // Label above value: GSTINs and addresses get the full panel width
        // instead of breaking mid-code beside a label column.
        section.fields.map((f) => (
          <div key={f.key} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9.5, color: T.label, marginBottom: 1 }}>{f.label}</div>
            <div style={{ fontSize: 11.5, color: value[f.key] ? T.text : T.label, wordBreak: f.upper ? "normal" : "break-word", whiteSpace: f.multiline ? "pre-line" : "normal",
              ...(f.upper && value[f.key] ? { fontFamily: "monospace", fontSize: 11, letterSpacing: "0.02em" } : {}) }}>
              {value[f.key] || "—"}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── 6: POCs ─────────────────────────────────────────────────────────────────
function PocsPanel({ consultant, onSave }) {
  const pocs = consultant.pocs || [];
  const [form, setForm] = useState(null);   // { index|null, value }
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(null);
  const pocSection = { fields: PERSON_FIELDS.map((f) => (f.key === "name" ? { ...f, label: "Name", required: true } : f)) };
  const commit = async (next, msg) => {
    setBusy(true); setFailed(null);
    try { await onSave({ pocs: next }, msg); setForm(null); }
    catch (err) { setFailed(errText(err)); }
    finally { setBusy(false); }
  };
  const save = () => {
    const e = sectionErrors(pocSection, form.value);
    setErrors(e);
    if (Object.keys(e).length) return;
    const clean = Object.fromEntries(Object.entries(form.value).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));
    const next = form.index == null ? [...pocs, clean] : pocs.map((p, i) => (i === form.index ? { ...p, ...clean } : p));
    commit(next, form.index == null ? "POC added" : "POC updated");
  };
  return (
    <div style={{ ...panel, minWidth: 300, flexBasis: "100%" }} data-testid="panel-pocs">
      <PanelHead icon={Users} n={6} title={`POCs (${pocs.length})`}
        aside={!form && <GhostBtn onClick={() => { setErrors({}); setFailed(null); setForm({ index: null, value: {} }); }}><Plus size={9} style={{ verticalAlign: -1 }} /> Add POC</GhostBtn>} />
      {pocs.length === 0 && !form && <div style={{ fontSize: 11, color: T.label, fontStyle: "italic" }}>No points of contact yet.</div>}
      {pocs.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8, marginBottom: form ? 12 : 0 }}>
          {pocs.map((p, i) => (
            <div key={p._id || i} style={{ border: `1px solid ${T.border}`, borderRadius: 6, padding: "9px 11px", background: T.raised }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 24, height: 24, borderRadius: "50%", background: `${colorFor(p.name)}18`, color: colorFor(p.name), fontSize: 9.5, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials(p.name)}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 500, color: T.text }}>{p.name}</div>
                  <div style={{ fontSize: 9.5, color: T.sub }}>{p.designation || "—"}</div>
                </div>
                <button type="button" aria-label={`Edit ${p.name}`} onClick={() => { setErrors({}); setFailed(null); setForm({ index: i, value: { ...p } }); }} style={iconBtn}><Pencil size={11} /></button>
                <button type="button" aria-label={`Remove ${p.name}`} disabled={busy} onClick={() => commit(pocs.filter((_, j) => j !== i), `${p.name} removed`)} style={{ ...iconBtn, color: T.red }}><Trash2 size={11} /></button>
              </div>
              <div style={{ marginTop: 6, fontSize: 10, color: T.sub, display: "flex", flexDirection: "column", gap: 2 }}>
                {p.email && <a href={`mailto:${p.email}`} style={{ color: T.sub, display: "inline-flex", alignItems: "center", gap: 4 }}><Mail size={10} />{p.email}</a>}
                {p.phone && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Phone size={10} />{p.phone}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {form && (
        <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ border: `1px dashed ${T.borderMid}`, borderRadius: 6, padding: "10px 12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0 10px" }}>
            {pocSection.fields.map((f, i) => (
              <Field key={f.key} field={f} value={form.value[f.key]} error={errors[f.key]} autoFocus={i === 0}
                onChange={(v) => setForm((s) => ({ ...s, value: { ...s.value, [f.key]: v } }))} />
            ))}
          </div>
          {failed && <div style={{ fontSize: 10, color: T.red, marginBottom: 8 }}>{failed}</div>}
          <div style={{ display: "flex", gap: 6 }}>
            <Btn primary type="submit" onClick={save} disabled={busy} style={{ padding: "5px 12px", fontSize: 10.5 }}>{form.index == null ? "Add POC" : "Save POC"}</Btn>
            <Btn onClick={() => setForm(null)} style={{ padding: "5px 12px", fontSize: 10.5 }}>Cancel</Btn>
          </div>
        </form>
      )}
    </div>
  );
}
const iconBtn = { background: "none", border: "none", cursor: "pointer", color: T.label, padding: 3, display: "inline-flex", borderRadius: 4 };

// ── 7: brands ───────────────────────────────────────────────────────────────
function BrandsPanel({ consultant, brands, onSave }) {
  const ids = consultant.brandIds || [];
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(null);
  const byId = new Map(brands.map((b) => [b.id, b]));
  const free = brands.filter((b) => !ids.includes(b.id)).sort((a, b) => a.name.localeCompare(b.name));
  const commit = async (next, msg) => {
    setBusy(true); setFailed(null);
    try { await onSave({ brandIds: next }, msg); setPick(""); }
    catch (err) { setFailed(errText(err)); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ ...panel, minWidth: 280 }} data-testid="panel-brands">
      <PanelHead icon={Tags} n={7} title={`Brands (${ids.length})`} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {ids.length === 0 && <span style={{ fontSize: 11, color: T.label, fontStyle: "italic" }}>No brands assigned yet.</span>}
        {ids.map((id) => {
          const b = byId.get(id);
          return (
            <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 6px 4px 5px", borderRadius: 16, border: `1px solid ${T.border}`, background: T.raised, fontSize: 11 }}>
              <BrandLogo brand={b?.name || id} website={b?.website} size={18} radius={9} />
              {b?.name || id}
              <button type="button" aria-label={`Unassign ${b?.name || id}`} disabled={busy} onClick={() => commit(ids.filter((x) => x !== id), `${b?.name || id} unassigned`)} style={{ ...iconBtn, padding: 1 }}><X size={11} /></button>
            </span>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Select value={pick} onChange={(e) => setPick(e.target.value)} data-testid="assign-brand" wrapStyle={{ flex: 1, minWidth: 0 }} style={{ width: "100%", color: pick ? T.text : T.sub }}>
          <option value="">{free.length ? "Assign a brand…" : "Every brand is assigned"}</option>
          {free.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Btn primary disabled={!pick || busy} onClick={() => commit([...ids, pick], `${byId.get(pick)?.name || pick} assigned`)} style={{ padding: "5px 12px", fontSize: 10.5 }}>Assign</Btn>
      </div>
      {failed && <div style={{ fontSize: 10, color: T.red, marginTop: 6 }}>{failed}</div>}
      <div style={{ fontSize: 9.5, color: T.label, marginTop: 8, lineHeight: 1.45 }}>New brands are added in Settings → Brand Settings. Consultants will also be able to create brands from their own portal later.</div>
    </div>
  );
}

// ── 8: dedicated UGC creators ───────────────────────────────────────────────
const UGC_PLATFORMS = ["Instagram", "YouTube", "TikTok", "Facebook", "Twitter / X", "LinkedIn", "Other"];
function UgcPanel({ consultant, directory, loadDirectory, onSave }) {
  const list = consultant.ugcCreators || [];
  const [form, setForm] = useState(null);   // { index|null, value }
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(null);
  const commit = async (next, msg) => {
    setBusy(true); setFailed(null);
    try { await onSave({ ugcCreators: next }, msg); setForm(null); }
    catch (err) { setFailed(errText(err)); }
    finally { setBusy(false); }
  };
  const openAdd = () => { loadDirectory(); setFailed(null); setForm({ index: null, value: { platform: "Instagram", status: "active" } }); };
  // Picking "Name (@handle)" from the directory list fills the row and links it.
  const fromDirectory = (text) => {
    const hit = (directory || []).find((c) => `${c.name} (${c.handle})` === text);
    setForm((s) => ({ ...s, value: hit
      ? { ...s.value, creatorId: hit.id, name: hit.name, handle: hit.handle, platform: hit.platform || s.value.platform, _search: text }
      : { ...s.value, creatorId: null, name: text, _search: text } }));
  };
  const save = () => {
    const v = form.value;
    if (!String(v.name || "").trim() && !String(v.handle || "").trim()) return setFailed("Add a name or handle.");
    if (v.rate !== "" && v.rate != null && !(Number(v.rate) >= 0)) return setFailed("Rate must be a number.");
    const { _search, ...row } = v;
    const clean = { ...row, name: String(row.name || "").trim(), handle: String(row.handle || "").trim(), rate: row.rate === "" || row.rate == null ? null : Number(row.rate) };
    const next = form.index == null ? [...list, clean] : list.map((u, i) => (i === form.index ? { ...u, ...clean } : u));
    commit(next, form.index == null ? `${clean.name || clean.handle} added to UGC` : "UGC creator updated");
  };
  const active = list.filter((u) => u.status !== "paused").length;
  return (
    <div style={{ ...panel, flexBasis: "100%" }} data-testid="panel-ugc">
      <PanelHead icon={Clapperboard} n={8} title={`Dedicated UGC creators (${list.length})`}
        aside={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {list.length > 0 && <span style={{ fontSize: 10, color: T.sub }}>{active} active</span>}
          {!form && <GhostBtn onClick={openAdd}><Plus size={9} style={{ verticalAlign: -1 }} /> Add UGC creator</GhostBtn>}
        </span>} />
      {list.length === 0 && !form && <div style={{ fontSize: 11, color: T.label, fontStyle: "italic" }}>No UGC creators dedicated to this consultant yet — add one from the Creators directory or by hand.</div>}
      {list.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 620 }}>
            <thead><tr>{["Creator", "Platform", "Rate / piece", "Status", "Notes", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {list.map((u, i) => (
                <tr key={u._id || i}>
                  <td style={td}>
                    <div style={{ fontWeight: 500, color: T.text }}>{u.name || u.handle}</div>
                    <div style={{ fontSize: 9.5, color: T.sub }}>{u.handle}{u.creatorId && <span style={{ color: T.teal }}> · in directory</span>}</div>
                  </td>
                  <td style={td}>{u.platform || "—"}</td>
                  <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{inr(u.rate)}</td>
                  <td style={td}>
                    <button type="button" disabled={busy} title="Click to switch" onClick={() => commit(list.map((x, j) => (j === i ? { ...x, status: x.status === "paused" ? "active" : "paused" } : x)), `${u.name || u.handle} ${u.status === "paused" ? "active" : "paused"}`)}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                      <Pill color={u.status === "paused" ? T.amber : T.green}>{u.status === "paused" ? "Paused" : "Active"}</Pill>
                    </button>
                  </td>
                  <td style={{ ...td, color: T.sub, maxWidth: 260 }}>{u.notes || "—"}</td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button type="button" aria-label={`Edit ${u.name || u.handle}`} onClick={() => { setFailed(null); setForm({ index: i, value: { ...u, rate: u.rate ?? "" } }); }} style={iconBtn}><Pencil size={11} /></button>
                    <button type="button" aria-label={`Remove ${u.name || u.handle}`} disabled={busy} onClick={() => commit(list.filter((_, j) => j !== i), `${u.name || u.handle} removed`)} style={{ ...iconBtn, color: T.red }}><Trash2 size={11} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && (
        <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ border: `1px dashed ${T.borderMid}`, borderRadius: 6, padding: "10px 12px", marginTop: list.length ? 10 : 0 }}>
          {form.index == null && (
            <label style={{ display: "block", marginBottom: 9 }}>
              <span style={lbl}>From the Creators directory (or type a new name)</span>
              <input list="ugc-directory" value={form.value._search || ""} onChange={(e) => fromDirectory(e.target.value)} autoFocus
                placeholder={directory ? "Start typing a name or @handle…" : "Loading the directory…"} style={{ ...INP, width: "100%", boxSizing: "border-box" }} />
              <datalist id="ugc-directory">{(directory || []).map((c) => <option key={c.id} value={`${c.name} (${c.handle})`} />)}</datalist>
            </label>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0 10px" }}>
            {[["name", "Name", "Creator name"], ["handle", "Handle", "@handle"]].map(([k, l, ph]) => (
              <Field key={k} field={{ key: k, label: l, placeholder: ph }} value={form.value[k]} onChange={(v) => setForm((s) => ({ ...s, value: { ...s.value, [k]: v } }))} />
            ))}
            <label style={{ display: "block", marginBottom: 9 }}>
              <span style={lbl}>Platform</span>
              <Select value={form.value.platform || ""} onChange={(e) => setForm((s) => ({ ...s, value: { ...s.value, platform: e.target.value } }))} wrapStyle={{ width: "100%" }} style={{ width: "100%" }}>
                {UGC_PLATFORMS.map((p) => <option key={p}>{p}</option>)}
              </Select>
            </label>
            <Field field={{ key: "rate", label: "Rate per piece (₹)", placeholder: "e.g. 4500" }} value={form.value.rate} onChange={(v) => setForm((s) => ({ ...s, value: { ...s.value, rate: v.replace(/[^\d.]/g, "") } }))} />
            <label style={{ display: "block", marginBottom: 9 }}>
              <span style={lbl}>Status</span>
              <Select value={form.value.status || "active"} onChange={(e) => setForm((s) => ({ ...s, value: { ...s.value, status: e.target.value } }))} wrapStyle={{ width: "100%" }} style={{ width: "100%" }}>
                <option value="active">Active</option><option value="paused">Paused</option>
              </Select>
            </label>
          </div>
          <Field field={{ key: "notes", label: "Notes", placeholder: "Content style, availability, anything the team should know", multiline: true }} value={form.value.notes} onChange={(v) => setForm((s) => ({ ...s, value: { ...s.value, notes: v } }))} />
          {failed && <div style={{ fontSize: 10, color: T.red, marginBottom: 8 }}>{failed}</div>}
          <div style={{ display: "flex", gap: 6 }}>
            <Btn primary type="submit" onClick={save} disabled={busy} style={{ padding: "5px 12px", fontSize: 10.5 }}>{form.index == null ? "Add UGC creator" : "Save"}</Btn>
            <Btn onClick={() => setForm(null)} style={{ padding: "5px 12px", fontSize: 10.5 }}>Cancel</Btn>
          </div>
        </form>
      )}
    </div>
  );
}
const th = { textAlign: "left", fontSize: 8.5, fontWeight: 600, color: T.label, textTransform: "uppercase", letterSpacing: "0.07em", padding: "6px 8px", borderBottom: `1px solid ${T.border}` };
const td = { padding: "8px 8px", borderBottom: `1px solid ${T.border}`, verticalAlign: "top", color: T.text };

// ── 9: documents ────────────────────────────────────────────────────────────
const readAsDataUri = (file) => new Promise((ok, bad) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => bad(fr.error); fr.readAsDataURL(file); });
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt";
function DocumentsPanel({ consultant, actor, onCount, onToast }) {
  const [docs, setDocs] = useState(null);
  const [failed, setFailed] = useState(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const input = useRef(null);
  useEffect(() => {
    let live = true;
    ConsultantsAPI.documents.list(consultant.id).then((d) => { if (live) setDocs(d); }).catch((e) => live && setFailed(errText(e)));
    return () => { live = false; };
    // documentCount moves when the consultant uploads from their portal (the
    // list refreshes on focus), so the panel re-reads then too.
  }, [consultant.id, consultant.documentCount]);
  const choose = (f) => {
    setFailed(null);
    if (!f) return setFile(null);
    if (f.size > MAX_FILE) { setFile(null); return setFailed(`${f.name} is ${fmtSize(f.size)} — files must be 3MB or smaller.`); }
    setFile(f);
    if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  };
  const upload = async () => {
    if (!name.trim()) return setFailed("Give the document a name.");
    if (!file) return setFailed("Choose a file.");
    setBusy(true); setFailed(null);
    try {
      const created = await ConsultantsAPI.documents.upload(consultant.id, { name: name.trim(), filename: file.name, file: await readAsDataUri(file), uploadedBy: actor });
      const next = [created, ...(docs || [])];
      setDocs(next); onCount(next.length); setName(""); setFile(null);
      if (input.current) input.current.value = "";
      onToast(`${created.name} uploaded`);
    } catch (e) { setFailed(errText(e)); }
    finally { setBusy(false); }
  };
  const remove = async (d) => {
    setRemoving(d.id);
    try { await ConsultantsAPI.documents.remove(consultant.id, d.id); const next = docs.filter((x) => x.id !== d.id); setDocs(next); onCount(next.length); onToast(`${d.name} deleted`); }
    catch (e) { setFailed(errText(e)); }
    finally { setRemoving(null); }
  };
  return (
    <div style={{ ...panel, minWidth: 320, flexBasis: "100%" }} data-testid="panel-docs">
      <PanelHead icon={FolderOpen} n={9} title={`Documents${docs ? ` (${docs.length})` : ""}`} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", marginBottom: 10 }}>
        <label style={{ flex: "2 1 200px" }}>
          <span style={lbl}>Document name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Signed agreement, GST certificate" style={{ ...INP, width: "100%", boxSizing: "border-box" }} />
        </label>
        <label style={{ flex: "2 1 200px" }}>
          <span style={lbl}>File (PDF, image, Word, Excel — up to 3MB)</span>
          <input ref={input} type="file" accept={ACCEPT} onChange={(e) => choose(e.target.files?.[0])} data-testid="doc-file"
            style={{ ...INP, width: "100%", boxSizing: "border-box", padding: "4px 6px" }} />
        </label>
        <Btn primary disabled={busy || !file} onClick={upload}>{busy ? <Spinner size={11} /> : <Upload size={12} />} Upload</Btn>
      </div>
      {failed && <div style={{ fontSize: 10, color: T.red, marginBottom: 8 }}>{failed}</div>}
      {docs == null && !failed && <div style={{ fontSize: 11, color: T.label }}>Loading documents…</div>}
      {docs && docs.length === 0 && <div style={{ fontSize: 11, color: T.label, fontStyle: "italic" }}>No documents yet.</div>}
      {docs && docs.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
          {docs.map((d) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 10px", background: T.raised }}>
              <span style={{ width: 34, height: 34, borderRadius: 6, background: `${T.accent}10`, color: T.accent, fontSize: 8.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, letterSpacing: "0.03em" }}>{(d.type || "FILE").toUpperCase().slice(0, 4)}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11.5, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.filename}>{d.name}</div>
                <div style={{ fontSize: 9.5, color: T.sub, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span>{[fmtSize(d.size), fmtDate(d.uploadedAt), d.uploadedBy].filter(Boolean).join(" · ")}</span>
                  {d.source === "portal" && <Pill color={T.teal}>From their portal</Pill>}
                </div>
              </div>
              <a href={ConsultantsAPI.documents.fileUrl(consultant.id, d.id)} target="_blank" rel="noreferrer" aria-label={`Open ${d.name}`} style={{ ...iconBtn, color: T.accent }}><ExternalLink size={12} /></a>
              <a href={ConsultantsAPI.documents.fileUrl(consultant.id, d.id, true)} aria-label={`Download ${d.name}`} style={{ ...iconBtn, color: T.accent }}><Download size={12} /></a>
              <button type="button" aria-label={`Delete ${d.name}`} disabled={removing === d.id} onClick={() => remove(d)} style={{ ...iconBtn, color: T.red }}>{removing === d.id ? <Spinner size={11} /> : <Trash2 size={12} />}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── profile picture ─────────────────────────────────────────────────────────
// The same picture the consultant sees (and can change) in their portal.
function PicturePanel({ c, onSave }) {
  const [value, setValue] = useState(undefined);   // undefined = untouched · null = remove · data URI
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(null);
  const save = async () => {
    setBusy(true); setFailed(null);
    try { await onSave({ avatarImage: value }, value ? "Profile picture saved" : "Profile picture removed"); setValue(undefined); }
    catch (e) { setFailed(errText(e)); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ ...panel, minWidth: 240 }} data-testid="panel-picture">
      <PanelHead icon={ImageIcon} title="Profile picture" />
      <AvatarPicker value={value} currentUrl={ConsultantsAPI.avatarUrl(c)} initials={initials(c.name)} onChange={(v) => { setValue(v); setFailed(null); }} size={64} radius={14} noun="picture" />
      {c.hasAvatar && value === undefined && (
        <div style={{ fontSize: 9.5, color: T.label, marginTop: 8 }}>
          {c.avatarSource === "portal" ? "Set by the consultant from their portal" : "Set by the team"}{c.avatarUpdatedAt ? ` · ${fmtDate(c.avatarUpdatedAt)}` : ""}
        </div>
      )}
      {value !== undefined && (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <Btn primary disabled={busy} onClick={save} style={{ padding: "5px 12px", fontSize: 10.5 }}>{busy && <Spinner size={10} />}{value ? "Save picture" : "Remove picture"}</Btn>
          <Btn onClick={() => setValue(undefined)} style={{ padding: "5px 12px", fontSize: 10.5 }}>Cancel</Btn>
        </div>
      )}
      {failed && <div style={{ fontSize: 10, color: T.red, marginTop: 6 }}>{failed}</div>}
      <div style={{ fontSize: 9.5, color: T.label, marginTop: 8, lineHeight: 1.45 }}>The consultant sees this picture on their portal and can change it there too.</div>
    </div>
  );
}

// ── notes ───────────────────────────────────────────────────────────────────
function NotesPanel({ consultant, onSave }) {
  const [draft, setDraft] = useState(consultant.notes || "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(consultant.notes || ""); }, [consultant.notes]);
  const dirty = draft !== (consultant.notes || "");
  return (
    <div style={{ ...panel, minWidth: 260 }}>
      <PanelHead icon={NotebookPen} title="Internal notes" aside={<span style={{ fontSize: 9.5, color: T.label }}>never shown on their portal</span>} />
      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} placeholder="Terms, history, anything the team should know…"
        style={{ ...INP, width: "100%", boxSizing: "border-box", resize: "vertical" }} />
      {dirty && <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <Btn primary disabled={busy} onClick={async () => { setBusy(true); try { await onSave({ notes: draft }, "Notes saved"); } finally { setBusy(false); } }} style={{ padding: "5px 12px", fontSize: 10.5 }}>Save notes</Btn>
        <Btn onClick={() => setDraft(consultant.notes || "")} style={{ padding: "5px 12px", fontSize: 10.5 }}>Discard</Btn>
      </div>}
    </div>
  );
}

// ── one consultant ──────────────────────────────────────────────────────────
function ConsultantCard({ c, brands, open, onToggle, onSave, onDelete, onCount, directory, loadDirectory, actor, onToast }) {
  const navigate = useNavigate();
  const byId = new Map(brands.map((b) => [b.id, b]));
  const done = completeness(c);
  const brandList = (c.brandIds || []).map((id) => byId.get(id) || { id, name: id });
  const ugcActive = (c.ugcCreators || []).filter((u) => u.status !== "paused").length;
  return (
    <Card open={open} onToggle={onToggle} name={c.name} title={c.name}
      avatar={<ConsultantAvatar c={c} />}
      subtitle={[c.email, c.primaryContact?.name && `${c.primaryContact.name}${c.primaryContact.designation ? `, ${c.primaryContact.designation}` : ""}`].filter(Boolean).join(" · ") || "No contact details yet"}
      stats={[
        { label: "Brands", value: brandList.length, color: brandList.length ? T.accent : T.label },
        { label: "POCs", value: (c.pocs || []).length, color: (c.pocs || []).length ? T.text : T.label },
        { label: "UGC creators", value: (c.ugcCreators || []).length, color: ugcActive ? T.teal : T.label },
        { label: "Documents", value: c.documentCount || 0, color: c.documentCount ? T.green : T.label },
      ]}
      footer={<>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0, overflow: "hidden" }}>
          {brandList.slice(0, 4).map((b) => <span key={b.id} title={b.name} style={{ display: "inline-flex" }}><BrandLogo brand={b.name} website={b.website} size={16} radius={8} /></span>)}
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {brandList.length ? brandList.slice(0, 2).map((b) => b.name).join(", ") + (brandList.length > 2 ? ` +${brandList.length - 2}` : "") : "No brands yet"}
          </span>
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <span title={`${done.done} of ${done.total} details filled in`} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 34, height: 4, borderRadius: 2, background: T.mute, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${done.pct}%`, background: done.pct === 100 ? T.green : T.accent }} /></span>
            <span style={{ fontSize: 9.5 }}>{done.pct}%</span>
          </span>
          <Pill color={c.status === "inactive" ? T.label : T.green}>{c.status === "inactive" ? "Inactive" : "Active"}</Pill>
        </span>
      </>}
    >
      {/* everything about them, every section editable where it sits */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, width: "100%" }}>
        {SECTIONS.map((s) => <SectionPanel key={s.id} consultant={c} section={s} onSave={onSave} />)}
        <PocsPanel consultant={c} onSave={onSave} />
        <BrandsPanel consultant={c} brands={brands} onSave={onSave} />
        <PicturePanel c={c} onSave={onSave} />
        <div style={{ ...panel, minWidth: 240 }}>
          <PanelHead icon={KeyRound} title="Portal logins" />
          <div style={{ fontSize: 11, color: T.text, marginBottom: 4 }}>{c.loginCount ? `${c.loginCount} login${c.loginCount === 1 ? "" : "s"} for the consultant portal` : "No portal login yet"}</div>
          <div style={{ fontSize: 9.5, color: T.label, lineHeight: 1.45, marginBottom: 8 }}>Logins are generated in Settings → Consultant Login. The portal itself comes later and will show what's on this page.</div>
          <GhostBtn onClick={() => navigate(`/settings?tab=consultants&consultant=${encodeURIComponent(c.id)}`)}>Manage logins →</GhostBtn>
        </div>
        <UgcPanel consultant={c} directory={directory} loadDirectory={loadDirectory} onSave={onSave} />
        <DocumentsPanel consultant={c} actor={actor} onCount={onCount} onToast={onToast} />
        <NotesPanel consultant={c} onSave={onSave} />
        <div style={{ ...panel, minWidth: 240 }}>
          <PanelHead icon={UserRound} title="Record" />
          <Fact label="Status" value={<Select value={c.status || "active"} onChange={(e) => onSave({ status: e.target.value }, `${c.name} marked ${e.target.value}`)} style={{ padding: "3px 8px", fontSize: 10.5 }}>
            <option value="active">Active</option><option value="inactive">Inactive — portal login blocked</option></Select>} width={70} />
          <Fact label="ID" value={c.id} width={70} />
          <Fact label="Added" value={[fmtDate(c.createdAt), c.createdBy].filter(Boolean).join(" · ")} width={70} />
          <Fact label="Updated" value={[fmtDate(c.updatedAt), c.updatedBy].filter(Boolean).join(" · ")} width={70} />
          <div style={{ marginTop: 10 }}><GhostBtn color={T.red} onClick={() => onDelete(c)}><Trash2 size={9} style={{ verticalAlign: -1 }} /> Delete consultant</GhostBtn></div>
        </div>
      </div>
    </Card>
  );
}

// ── add a consultant ────────────────────────────────────────────────────────
function AddConsultantModal({ brands, onClose, onCreated }) {
  const [values, setValues] = useState(() => Object.fromEntries(SECTIONS.map((s) => [s.id, {}])));
  const [brandIds, setBrandIds] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(null);
  const set = (sid, key, v) => setValues((s) => ({ ...s, [sid]: { ...s[sid], [key]: v } }));
  const submit = async () => {
    const all = Object.fromEntries(SECTIONS.map((s) => [s.id, sectionErrors(s, values[s.id])]));
    setErrors(all);
    if (Object.values(all).some((e) => Object.keys(e).length)) return setFailed("Fix the highlighted fields first.");
    setBusy(true); setFailed(null);
    try {
      const body = Object.assign({ brandIds }, ...SECTIONS.map((s) => sectionPatch(s, values[s.id])));
      onCreated(await ConsultantsAPI.create(body));
    } catch (e) { setFailed(errText(e)); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Add consultant" onClose={onClose} width={760}
      footer={<>
        {failed && <span style={{ fontSize: 10.5, color: T.red, marginRight: "auto", alignSelf: "center" }}>{failed}</span>}
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn primary disabled={busy} onClick={submit}>{busy && <Spinner size={11} />}Add consultant</Btn>
      </>}>
      <div style={{ fontSize: 11, color: T.sub, marginBottom: 14 }}>Only the name is required — everything else can be filled in later from the consultant's card. POCs, UGC creators and documents are added on the card.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        {SECTIONS.map((s) => {
          const Icon = ICONS[s.id];
          return (
            <fieldset key={s.id} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px 2px", margin: 0 }}>
              <legend style={{ ...panelTitle, padding: "0 4px", marginBottom: 0, display: "inline-flex", alignItems: "center", gap: 5 }}><Icon size={11} style={{ color: T.accent }} /><span style={{ color: T.accent }}>{s.n}</span> {s.title}</legend>
              {s.fields.map((f, i) => (
                <Field key={f.key} field={f} value={values[s.id][f.key]} error={errors[s.id]?.[f.key]} autoFocus={s.n === 1 && i === 0}
                  onChange={(v) => set(s.id, f.key, v)} />
              ))}
            </fieldset>
          );
        })}
        <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px", margin: 0 }}>
          <legend style={{ ...panelTitle, padding: "0 4px", marginBottom: 0, display: "inline-flex", alignItems: "center", gap: 5 }}><Tags size={11} style={{ color: T.accent }} /><span style={{ color: T.accent }}>7</span> Brands</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 190, overflowY: "auto" }}>
            {brands.length === 0 && <span style={{ fontSize: 11, color: T.label, fontStyle: "italic" }}>No brands yet — add them in Settings → Brand Settings.</span>}
            {[...brands].sort((a, b) => a.name.localeCompare(b.name)).map((b) => {
              const on = brandIds.includes(b.id);
              return (
                <button key={b.id} type="button" onClick={() => setBrandIds((ids) => (on ? ids.filter((x) => x !== b.id) : [...ids, b.id]))}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 5px", borderRadius: 16, cursor: "pointer", fontFamily: "'Sora'", fontSize: 11,
                    border: `1px solid ${on ? T.accent : T.border}`, background: on ? `${T.accent}0E` : T.surface, color: on ? T.accent : T.text, fontWeight: on ? 600 : 400 }}>
                  <BrandLogo brand={b.name} website={b.website} size={16} radius={8} />{b.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}

// ── the tab ─────────────────────────────────────────────────────────────────
export default function Consultants() {
  const { user, brands = [], brandFilter } = useOutletContext() || {};
  const actor = user?.name || null;
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [toast, setToast] = useState(null);
  const [directory, setDirectory] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((m) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2600); }, []);

  useEffect(() => {
    ConsultantsAPI.list().then(setList).catch((e) => setError(errText(e)));
    // What a consultant changes in their portal (picture, uploads) shows up
    // here the next time this tab is looked at — no reload needed.
    const refresh = () => { if (document.visibilityState === "visible") ConsultantsAPI.list().then(setList).catch(() => {}); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  // The Creators directory, for linking UGC creators — loaded the first time someone adds one.
  const loadDirectory = useCallback(() => {
    if (directory) return;
    CreatorsAPI.list().then((cs) => setDirectory((cs || []).map((c) => ({ id: c.id, name: c.name || c.handle, handle: c.handle, platform: c.platform })))).catch(() => setDirectory([]));
  }, [directory]);

  const save = useCallback(async (id, patch, msg) => {
    const updated = await ConsultantsAPI.update(id, { ...patch, actor });
    setList((l) => l.map((c) => (c.id === id ? { ...c, ...updated } : c)));
    if (msg) showToast(msg);
    return updated;
  }, [actor, showToast]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byId = new Map(brands.map((b) => [b.id, b.name]));
    return (list || []).filter((c) => {
      if (status !== "all" && (c.status || "active") !== status) return false;
      if (brandFilter && !(c.brandIds || []).includes(brandFilter)) return false;
      if (!q) return true;
      return [c.name, c.email, c.primaryContact?.name, c.billing?.gstNumber, c.tax?.pan, ...(c.brandIds || []).map((id) => byId.get(id)),
        ...(c.pocs || []).flatMap((p) => [p.name, p.email]), ...(c.ugcCreators || []).flatMap((u) => [u.name, u.handle])]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [list, query, status, brandFilter, brands]);

  const counts = useMemo(() => ({
    all: (list || []).length,
    active: (list || []).filter((c) => (c.status || "active") === "active").length,
    inactive: (list || []).filter((c) => c.status === "inactive").length,
  }), [list]);

  return (
    <div>
      <style>{CARD_CSS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, GST, PAN, brand, POC…" style={{ ...INP, width: 300 }} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ color: status === "all" ? T.sub : T.text }}>
          <option value="all">All consultants ({counts.all})</option>
          <option value="active">Active ({counts.active})</option>
          <option value="inactive">Inactive ({counts.inactive})</option>
        </Select>
        {brandFilter && <Pill color={T.accent}>Holding {brands.find((b) => b.id === brandFilter)?.name || brandFilter}</Pill>}
        <span style={{ marginLeft: "auto" }} />
        <Btn primary onClick={() => setAdding(true)} data-testid="add-consultant"><Plus size={13} /> Add consultant</Btn>
      </div>

      {error && <Notice tone="error">Could not load consultants: {error}</Notice>}
      {!error && list == null && <Notice>Loading consultants…</Notice>}
      {!error && list && list.length === 0 && (
        <div style={{ textAlign: "center", padding: "56px 20px", border: `1px dashed ${T.borderMid}`, borderRadius: T.radius, background: T.surface }}>
          <BriefcaseBusiness size={26} style={{ color: T.accent, opacity: 0.7 }} />
          <div style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontSize: 19, color: T.text, marginTop: 8 }}>No consultants yet</div>
          <div style={{ fontSize: 11.5, color: T.sub, margin: "6px 0 16px" }}>Add a consultant with their billing, HQ, tax and contact details, then assign brands, POCs, UGC creators and documents.</div>
          <Btn primary onClick={() => setAdding(true)}><Plus size={13} /> Add the first consultant</Btn>
        </div>
      )}
      {!error && list && list.length > 0 && (visible.length === 0
        ? <Notice tone="empty">No consultants match these filters.</Notice>
        : (
          <CardGrid>
            {visible.map((c) => (
              <ConsultantCard key={c.id} c={c} brands={brands} open={expanded === c.id} actor={actor}
                onToggle={() => setExpanded((x) => (x === c.id ? null : c.id))}
                onSave={(patch, msg) => save(c.id, patch, msg)}
                onDelete={setDeleting}
                onCount={(n) => setList((l) => l.map((x) => (x.id === c.id ? { ...x, documentCount: n } : x)))}
                directory={directory} loadDirectory={loadDirectory} onToast={showToast} />
            ))}
          </CardGrid>
        ))}

      {adding && <AddConsultantModal brands={brands} onClose={() => setAdding(false)}
        onCreated={(c) => { setList((l) => [...(l || []), c].sort((a, b) => a.name.localeCompare(b.name))); setAdding(false); setExpanded(c.id); showToast(`${c.name} added`); }} />}

      {deleting && (
        <Modal title={`Delete ${deleting.name}?`} onClose={() => setDeleting(null)} width={460}
          footer={<>
            <Btn onClick={() => setDeleting(null)}>Cancel</Btn>
            <Btn danger onClick={async () => {
              try {
                await ConsultantsAPI.remove(deleting.id);
                setList((l) => l.filter((c) => c.id !== deleting.id));
                showToast(`${deleting.name} deleted`);
                setDeleting(null);
              } catch (e) { showToast(errText(e)); }
            }}>Delete permanently</Btn>
          </>}>
          <div style={{ fontSize: 12, color: T.text, lineHeight: 1.55 }}>
            This removes the consultant and everything held against them: {deleting.documentCount || 0} document{deleting.documentCount === 1 ? "" : "s"} and {deleting.loginCount || 0} portal login{deleting.loginCount === 1 ? "" : "s"}. Their brands stay as they are. This can't be undone.
          </div>
        </Modal>
      )}

      {toast && <div role="status" style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, padding: "11px 18px", background: "rgba(29,29,31,0.92)", borderRadius: 12, fontSize: 12, color: "#FFF", fontFamily: "'Sora'", boxShadow: "0 8px 32px rgba(0,0,0,0.24)" }}>{toast}</div>}
    </div>
  );
}
