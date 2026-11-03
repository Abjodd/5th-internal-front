/**
 * 5th Avenue — Creators › Find creators › Content tools
 * ─────────────────────────────────────────────────────────────────
 * Everything SocialKit can do besides finding creators, for the team:
 * transcripts (one video, or a creator's top 10), AI summaries, a post's
 * numbers, comments, a creator's posts ranked, search, downloads.
 *
 * Pick the platform (the tabs above, shared with Find creators), pick a tool,
 * paste a link, press Run. Each tool has an (i) with what it does and how to
 * use it, in plain words. The list of tools, their options and their prices
 * come from the finder (GET /api/find/tools — creator-finder/src/tools.js),
 * so this file only lays them out.
 *
 * Runs work in the background on the finder and are saved there for 90 days:
 * long ones (top 10 transcripts) show progress, and anything run before —
 * by anyone on the team — can be re-opened from "Recent runs" for free.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText, Sparkles, BarChart3, MessageSquare, LayoutGrid, UserRound, Building2, Search, Hash, Download, ListOrdered,
  Newspaper, Info, Play, Loader2, Copy, ExternalLink, ChevronDown, ChevronRight, Check, X, Eye, Heart, MessageCircle,
  Repeat2, Bookmark, Clock, History, Wand2, AlertTriangle,
} from "lucide-react";
import { FinderAPI } from "../../lib/api";
import { fmtCompact } from "../../lib/format";
import { T } from "../../theme/tokens";
import PlatformLogo from "../../components/PlatformLogo";
import { Notice, Pill } from "./shared";

// Icon per tool (by the part of the id after the platform).
const ICON = {
  "top-transcripts": ListOrdered, transcript: FileText, summary: Sparkles, stats: BarChart3, comments: MessageSquare,
  posts: LayoutGrid, profile: UserRound, company: Building2, thread: ListOrdered, article: Newspaper,
  search: Search, hashtag: Hash, download: Download,
};
const keyOf = (id) => String(id || "").split(".").slice(1).join(".");

let catalogueCache = null; // the tool list rarely changes — fetch once per page load

// ── little helpers ──────────────────────────────────────────────────────────
const n = (v) => (v == null ? "—" : fmtCompact(v));
const dur = (s) => (s == null ? null : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null);
function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return day(iso);
}
function saveFile(name, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const csvCell = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const toCsv = (rows, cols) => [cols.map((c) => c[0]).join(","), ...rows.map((r) => cols.map((c) => csvCell(c[1](r))).join(","))].join("\n");
const slug = (s) => String(s || "").replace(/^https?:\/\/(www\.)?/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40);

/** How many SocialKit credits a run will roughly use, from the tool's price and the chosen options. */
function estimate(svc, opts) {
  const c = svc?.cost || {};
  if (svc?.usesHiker) return null;
  let base = c.base || 0;
  if (opts.scan) base = { youtube: Math.ceil(opts.scan / 50), instagram: Math.ceil(opts.scan / 20), tiktok: Math.ceil(opts.scan / 30) }[svc.platform] ?? 1;
  if (keyOf(svc.id) === "comments" || (keyOf(svc.id) === "search" && opts.limit)) base = Math.max(1, Math.ceil((opts.limit || 50) / 50));
  if (keyOf(svc.id) === "download") return opts.format === "mp4" && opts.quality === "720p" ? [4, 8] : [1, 2];
  const count = c.fixedCount != null ? c.fixedCount : opts.count || 0;
  return [base + count * (c.perItem || 0), base + count * (c.perItemMax ?? c.perItem ?? 0)];
}

// ── small UI pieces ─────────────────────────────────────────────────────────
const btn = (primary, disabled) => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: primary ? "0 18px" : "6px 11px", height: primary ? 40 : undefined,
  borderRadius: 8, border: primary ? "none" : `1px solid ${T.border}`, background: primary ? T.accent : T.surface,
  color: primary ? "#fff" : T.sub, fontSize: primary ? 12.5 : 11, fontWeight: primary ? 600 : 500, fontFamily: "'Sora'",
  cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap", textDecoration: "none",
});
const chip = (on) => ({
  padding: "5px 11px", borderRadius: 999, fontSize: 11, fontFamily: "'Sora'", cursor: "pointer",
  border: `1px solid ${on ? T.accent : T.border}`, background: on ? `${T.accent}10` : T.surface,
  color: on ? T.accent : T.sub, fontWeight: on ? 600 : 400, whiteSpace: "nowrap",
});
const lbl = { fontSize: 9.5, color: T.label, textTransform: "uppercase", letterSpacing: ".08em" };

function CopyBtn({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" style={btn(false)} onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }); }}>
      {done ? <Check size={11} color={T.green} /> : <Copy size={11} />} {done ? "Copied" : label}
    </button>
  );
}

function Thumb({ src, w = 64, h = 64, radius = 8 }) {
  const [ok, setOk] = useState(!!src);
  if (!ok) return <div style={{ width: w, height: h, borderRadius: radius, background: T.mute, flexShrink: 0 }} />;
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setOk(false)} style={{ width: w, height: h, borderRadius: radius, objectFit: "cover", flexShrink: 0, background: T.mute }} />;
}

/** Views · likes · comments · shares · saves · length — whichever the post has. */
function Numbers({ p, size = 10.5 }) {
  const items = [[Eye, p.views, "views"], [Heart, p.likes, "likes"], [MessageCircle, p.comments, "comments"], [Repeat2, p.shares, "shares"], [Bookmark, p.saves, "saves"]]
    .filter(([, v]) => v != null);
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 10, fontSize: size, color: T.sub }}>
      {items.map(([I, v, t]) => <span key={t} title={`${v.toLocaleString("en-IN")} ${t}`} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><I size={size + 0.5} color={T.label} />{n(v)}</span>)}
      {p.durationSec != null && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Clock size={size + 0.5} color={T.label} />{dur(p.durationSec)}</span>}
      {(p.publishedAt || p.when) && <span style={{ color: T.label }}>{day(p.publishedAt) || p.when}</span>}
    </span>
  );
}

/** The (i) on each tool: what it does, how to use it, what it costs — plain words. */
function InfoButton({ svc, open, onToggle }) {
  return (
    <span style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={`How ${svc.label} works`} aria-expanded={open} onClick={onToggle}
        style={{ width: 22, height: 22, borderRadius: "50%", border: `1px solid ${open ? T.accent : T.border}`, background: open ? T.accent : T.surface,
          color: open ? "#fff" : T.label, display: "grid", placeItems: "center", cursor: "pointer", padding: 0 }}>
        <Info size={12} />
      </button>
      {open && (
        <div role="dialog" style={{ position: "absolute", top: 28, right: -6, zIndex: 30, width: 300, background: T.surface, border: `1px solid ${T.borderMid}`,
          borderRadius: 10, boxShadow: T.shadowLg, padding: 14, textAlign: "left", cursor: "default" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: T.text, marginBottom: 8 }}>
            <PlatformLogo platform={svc.platform} size={13} /> {svc.label}
            <button type="button" onClick={onToggle} aria-label="Close" style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", padding: 2 }}><X size={12} color={T.label} /></button>
          </div>
          {[["What it does", svc.what], ["How to use it", svc.how], ["Cost", svc.cost?.text]].map(([h, t]) => t && (
            <div key={h} style={{ marginTop: 8 }}>
              <div style={lbl}>{h}</div>
              <div style={{ fontSize: 11.5, color: T.sub, lineHeight: 1.55, marginTop: 3 }}>{t}</div>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

function ToolCard({ svc, on, onPick, infoOpen, onInfo }) {
  const Icon = ICON[keyOf(svc.id)] || Wand2;
  return (
    <div role="button" tabIndex={0} data-testid={`tool-${svc.id}`} aria-pressed={on} onClick={onPick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); } }}
      className="ct-card"
      style={{ position: "relative", display: "flex", gap: 11, padding: "12px 12px 12px 13px", borderRadius: 10, cursor: "pointer", textAlign: "left", minWidth: 0,
        border: `1px solid ${on ? T.accent : T.border}`, background: on ? `${T.accent}08` : T.surface, boxShadow: on ? `0 0 0 3px ${T.accent}14` : "none",
        gridColumn: svc.featured ? "span 2" : undefined }}>
      <span style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: "grid", placeItems: "center", background: on ? T.accent : T.raised, border: `1px solid ${on ? T.accent : T.border}` }}>
        <Icon size={15} color={on ? "#fff" : T.sub} />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{svc.label}</span>
          {svc.featured && <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: T.green, border: `1px solid ${T.green}40`, borderRadius: 20, padding: "1px 6px" }}>Most used</span>}
        </span>
        <span style={{ display: "block", fontSize: 11, color: T.sub, lineHeight: 1.45, marginTop: 3 }}>{svc.short}</span>
      </span>
      <InfoButton svc={svc} open={infoOpen} onToggle={onInfo} />
    </div>
  );
}

// ── result views ────────────────────────────────────────────────────────────
function TranscriptItem({ it, open, onToggle, showTimes }) {
  const t = it.transcript;
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, background: T.surface, overflow: "hidden" }}>
      <div onClick={onToggle} style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, cursor: "pointer" }}>
        <span style={{ fontFamily: "'Newsreader', serif", fontSize: 20, fontWeight: 600, color: T.label, width: 28, textAlign: "center", flexShrink: 0 }}>{it.rank}</span>
        {it.thumbnail !== undefined && <Thumb src={it.thumbnail} w={46} h={58} radius={6} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title || it.url}</div>
          <div style={{ marginTop: 4 }}><Numbers p={it} /></div>
          <div style={{ marginTop: 4, fontSize: 10.5, color: it.error ? T.red : T.label }}>
            {it.error ? <><AlertTriangle size={10} style={{ verticalAlign: -1 }} /> {it.error}</> : t ? `${t.words.toLocaleString("en-IN")} words${t.language ? ` · ${t.language}` : ""}` : "…"}
          </div>
        </div>
        <span style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          {t?.text && <CopyBtn text={t.text} />}
          {it.url && <a href={it.url} target="_blank" rel="noreferrer" style={btn(false)}><ExternalLink size={11} /> Open</a>}
        </span>
        {t && (open ? <ChevronDown size={15} color={T.label} /> : <ChevronRight size={15} color={T.label} />)}
      </div>
      {open && t && (
        <div style={{ borderTop: `1px solid ${T.border}`, background: T.raised, padding: "12px 16px 14px 52px", maxHeight: 340, overflowY: "auto" }}>
          {showTimes && t.segments.length
            ? t.segments.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 12, fontSize: 12, lineHeight: 1.6, color: T.text }}>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: T.label, width: 40, flexShrink: 0, paddingTop: 2 }}>{s.at}</span>
                <span>{s.text}</span>
              </div>))
            : <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.7, color: T.text, whiteSpace: "pre-wrap" }}>{t.text || "No speech in this one."}</p>}
        </div>
      )}
    </div>
  );
}

function Transcripts({ run }) {
  const items = run.result.items;
  const [openSet, setOpenSet] = useState(() => new Set(items.length === 1 ? [0] : []));
  const [times, setTimes] = useState(false);
  const good = items.filter((x) => x.transcript?.text);
  const all = good.map((x) => `#${x.rank}  ${x.title ? x.title.replace(/\s+/g, " ").slice(0, 120) : ""}\n${x.url}${x.views != null ? `  ·  ${x.views.toLocaleString("en-IN")} views` : ""}\n\n${x.transcript.text}`).join("\n\n────────────\n\n");
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: T.sub }}>{good.length} of {items.length} transcribed{run.result.scanned ? ` · picked from their last ${run.result.scanned}` : ""}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button type="button" style={btn(false)} onClick={() => setTimes((v) => !v)}><Clock size={11} /> {times ? "Hide" : "Show"} timestamps</button>
          {items.length > 1 && <button type="button" style={btn(false)} onClick={() => setOpenSet((s) => (s.size ? new Set() : new Set(items.map((_, i) => i))))}>{openSet.size ? "Collapse all" : "Expand all"}</button>}
          {good.length > 0 && <CopyBtn text={all} label="Copy all" />}
          {good.length > 0 && <button type="button" style={btn(false)} onClick={() => saveFile(`transcripts-${slug(run.input)}.txt`, all)}><Download size={11} /> Download .txt</button>}
        </span>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((it, i) => <TranscriptItem key={i} it={it} showTimes={times} open={openSet.has(i)}
          onToggle={() => setOpenSet((s) => { const x = new Set(s); x.has(i) ? x.delete(i) : x.add(i); return x; })} />)}
      </div>
    </div>
  );
}

function Summary({ r }) {
  const block = (title, children) => (
    <div style={{ marginTop: 14 }}><div style={lbl}>{title}</div><div style={{ marginTop: 6 }}>{children}</div></div>
  );
  const text = [r.summary, r.keyPoints?.length && `Key points:\n- ${r.keyPoints.join("\n- ")}`, r.quotes?.length && `Quotes:\n- ${r.quotes.join("\n- ")}`].filter(Boolean).join("\n\n");
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 18 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <p style={{ margin: 0, fontFamily: "'Newsreader', serif", fontSize: 18, lineHeight: 1.5, color: T.text, flex: 1 }}>{r.summary || "No summary came back."}</p>
        <CopyBtn text={text} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
        {r.keyPoints?.length > 0 && block("Key points", <ul style={{ margin: 0, paddingLeft: 17, fontSize: 12, lineHeight: 1.7, color: T.text }}>{r.keyPoints.map((k, i) => <li key={i}>{k}</li>)}</ul>)}
        <div>
          {r.topics?.length > 0 && block("Topics", <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{r.topics.map((t) => <Pill key={t} color={T.teal}>{t}</Pill>)}</div>)}
          {r.tone && block("Tone", <div style={{ fontSize: 12, color: T.text }}>{r.tone}</div>)}
          {r.audience && block("Made for", <div style={{ fontSize: 12, color: T.text }}>{r.audience}</div>)}
        </div>
      </div>
      {r.quotes?.length > 0 && block("Quotes", <div style={{ display: "grid", gap: 6 }}>{r.quotes.map((q, i) => <div key={i} style={{ fontSize: 12.5, fontStyle: "italic", color: T.text, borderLeft: `2px solid ${T.border}`, paddingLeft: 10 }}>“{q}”</div>)}</div>)}
      {r.timeline?.length > 0 && block("Timeline", <div style={{ display: "grid", gap: 3 }}>{r.timeline.map((t, i) => (
        <div key={i} style={{ display: "flex", gap: 12, fontSize: 12, color: T.text }}><span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: T.label, width: 40 }}>{t.time || t.timestamp || ""}</span>{t.event || t.title || t.text || (typeof t === "string" ? t : "")}</div>))}</div>)}
    </div>
  );
}

function PostNumbers({ r }) {
  const p = r.post || {};
  const tiles = [["Views", p.views, Eye], ["Likes", p.likes, Heart], ["Comments", p.comments, MessageCircle], ["Shares", p.shares, Repeat2], ["Saves", p.saves, Bookmark]].filter(([, v]) => v != null);
  const [more, setMore] = useState(false);
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <Thumb src={p.thumbnail} w={92} h={92} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.4 }}>{p.title || "Post"}</div>
          <div style={{ fontSize: 11, color: T.label, marginTop: 4 }}>{[p.author && `by ${p.author}`, day(p.publishedAt) && `posted ${day(p.publishedAt)}`, dur(p.durationSec)].filter(Boolean).join(" · ")}</div>
          <a href={p.url} target="_blank" rel="noreferrer" style={{ ...btn(false), marginTop: 8, display: "inline-flex" }}><ExternalLink size={11} /> Open post</a>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, tiles.length)}, minmax(0, 1fr))`, gap: 8, marginTop: 14 }}>
        {tiles.map(([t, v, I]) => (
          <div key={t} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px", background: T.raised }}>
            <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 4 }}><I size={10} />{t}</div>
            <div style={{ fontFamily: "'Newsreader', serif", fontSize: 24, fontWeight: 600, color: T.text, marginTop: 2 }} title={v.toLocaleString("en-IN")}>{n(v)}</div>
          </div>
        ))}
      </div>
      {p.views > 0 && p.likes != null && <div style={{ fontSize: 11, color: T.sub, marginTop: 10 }}>Engagement: <strong style={{ color: T.text }}>{(((p.likes || 0) + (p.comments || 0)) / p.views * 100).toFixed(1)}%</strong> of viewers liked or commented.</div>}
      {r.details?.length > 0 && (
        <button type="button" style={{ ...btn(false), marginTop: 10 }} onClick={() => setMore((v) => !v)}>{more ? "Hide" : "Show"} everything SocialKit returned</button>
      )}
      {more && <DetailRows rows={r.details} />}
    </div>
  );
}

function DetailRows({ rows }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 11.5 }}>
      <tbody>{rows.map((x) => (
        <tr key={x.label} style={{ borderTop: `1px solid ${T.border}` }}>
          <td style={{ padding: "6px 10px 6px 0", color: T.label, width: 180, verticalAlign: "top" }}>{x.label}</td>
          <td style={{ padding: "6px 0", color: T.text, wordBreak: "break-word" }}>{typeof x.value === "string" && /^https?:\/\//.test(x.value) ? <a href={x.value} target="_blank" rel="noreferrer" style={{ color: T.accent }}>{x.value}</a> : String(x.value)}</td>
        </tr>))}</tbody>
    </table>
  );
}

function Comments({ run }) {
  const r = run.result;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: T.sub }}>{r.items.length} comments{r.total ? ` of ${r.total.toLocaleString("en-IN")} on the post` : ""}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <CopyBtn text={r.items.map((c) => `@${c.user}: ${c.text}`).join("\n")} label="Copy all" />
          <button type="button" style={btn(false)} onClick={() => saveFile(`comments-${slug(run.input)}.csv`, toCsv(r.items, [["user", (c) => c.user], ["comment", (c) => c.text], ["likes", (c) => c.likes], ["replies", (c) => c.replies], ["date", (c) => c.date]]), "text/csv")}><Download size={11} /> CSV</button>
        </span>
      </div>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
        {r.items.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px", borderTop: i ? `1px solid ${T.border}` : "none" }}>
            <span style={{ width: 26, height: 26, borderRadius: "50%", background: `${T.accent}12`, color: T.accent, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 600, flexShrink: 0 }}>{(c.user || "?")[0].toUpperCase()}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, color: T.sub }}><strong style={{ color: T.text, fontWeight: 600 }}>@{c.user || "someone"}</strong>{c.date ? ` · ${c.date}` : ""}</div>
              <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.5, marginTop: 2 }}>{c.text}</div>
            </div>
            <span style={{ fontSize: 10.5, color: T.label, display: "inline-flex", gap: 8, flexShrink: 0 }}>
              {c.likes != null && <span><Heart size={10} style={{ verticalAlign: -1 }} /> {n(c.likes)}</span>}
              {c.replies ? <span><MessageCircle size={10} style={{ verticalAlign: -1 }} /> {c.replies}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Posts({ run, platform, onUse, has }) {
  const items = run.result.items || [];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: T.sub }}>{items.length} posts{run.result.rankedBy ? ` · ${{ views: "most viewed", likes: "most liked", comments: "most comments", newest: "newest" }[run.result.rankedBy]} first` : ""}</span>
        <button type="button" style={{ ...btn(false), marginLeft: "auto" }} onClick={() => saveFile(`posts-${slug(run.input)}.csv`, toCsv(items, [["url", (p) => p.url], ["title", (p) => p.title], ["views", (p) => p.views], ["likes", (p) => p.likes], ["comments", (p) => p.comments], ["shares", (p) => p.shares], ["posted", (p) => p.publishedAt || p.when], ["length", (p) => dur(p.durationSec)]]), "text/csv")}>
          <Download size={11} /> CSV
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
        {items.map((p, i) => (
          <div key={p.url || i} style={{ display: "flex", gap: 10, padding: 10, border: `1px solid ${T.border}`, borderRadius: 10, background: T.surface, minWidth: 0 }}>
            <Thumb src={p.thumbnail} w={58} h={74} radius={6} />
            <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 11.5, color: T.text, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.title || "(no caption)"}</div>
              <div style={{ marginTop: 5 }}><Numbers p={p} size={10} /></div>
              <div style={{ display: "flex", gap: 5, marginTop: "auto", paddingTop: 7, flexWrap: "wrap" }}>
                {p.url && <a href={p.url} target="_blank" rel="noreferrer" style={{ ...btn(false), padding: "3px 8px", fontSize: 10 }}><ExternalLink size={10} /> Open</a>}
                {p.url && p.isVideo !== false && has(`${platform}.transcript`) && <button type="button" style={{ ...btn(false), padding: "3px 8px", fontSize: 10 }} onClick={() => onUse(`${platform}.transcript`, p.url)}><FileText size={10} /> Transcript</button>}
                {p.url && p.isVideo !== false && has(`${platform}.summary`) && <button type="button" style={{ ...btn(false), padding: "3px 8px", fontSize: 10 }} onClick={() => onUse(`${platform}.summary`, p.url)}><Sparkles size={10} /> Summary</button>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TextResult({ r, platform }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {r.image && <Thumb src={r.image} w={44} h={44} />}
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, flex: 1 }}>{r.title}</div>
        {r.text && <CopyBtn text={r.text} />}
        {r.url && <a href={r.url} target="_blank" rel="noreferrer" style={btn(false)}><ExternalLink size={11} /> Open</a>}
      </div>
      {r.text && <p style={{ margin: "12px 0 0", fontSize: 12.5, lineHeight: 1.7, color: T.text, whiteSpace: "pre-wrap", maxHeight: 420, overflowY: "auto" }}>{r.text}</p>}
      {r.items?.length > 0 && (
        <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
          {r.items.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 10, fontSize: 12, color: T.text, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
              <span style={{ color: T.label, width: 18 }}>{i + 1}.</span>
              <span style={{ flex: 1 }}>{p.title}<div style={{ marginTop: 3 }}><Numbers p={p} size={10} /></div></span>
            </div>
          ))}
        </div>
      )}
      {r.rows?.length > 0 && <DetailRows rows={r.rows} />}
    </div>
  );
}

function DownloadResult({ r }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16 }}>
      <Thumb src={r.thumbnail} w={80} h={80} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{r.title || "Your file is ready"}</div>
        <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>{[r.format?.toUpperCase(), r.quality !== "audio" && r.quality, r.duration, r.size].filter(Boolean).join(" · ")}</div>
        <div style={{ fontSize: 10.5, color: T.amber, marginTop: 4 }}>The link works for {r.expiresIn || "1 hour"} — download it now, or run this again later for a fresh link.</div>
      </div>
      {r.downloadUrl
        ? <a href={r.downloadUrl} target="_blank" rel="noreferrer" style={btn(true)}><Download size={14} /> Download</a>
        : <span style={{ fontSize: 11, color: T.red }}>No link came back</span>}
    </div>
  );
}

function Result({ run, renderCreators, onUse, has }) {
  const r = run.result;
  if (!r) return null;
  if (r.kind === "transcripts") return <Transcripts run={run} />;
  if (r.kind === "summary") return <Summary r={r} />;
  if (r.kind === "post") return <PostNumbers r={r} />;
  if (r.kind === "comments") return <Comments run={run} />;
  if (r.kind === "posts") return <Posts run={run} platform={run.platform} onUse={onUse} has={has} />;
  if (r.kind === "creators") return renderCreators(r.results);
  if (r.kind === "download") return <DownloadResult r={r} />;
  if (r.kind === "text" || r.kind === "details") return <TextResult r={r} platform={run.platform} />;
  return <pre style={{ fontSize: 11, background: T.raised, padding: 12, borderRadius: 8, overflow: "auto" }}>{JSON.stringify(r, null, 2)}</pre>;
}

/** While a run works: what it's doing, how far along, and (top transcripts) one dot per video. */
function Working({ run }) {
  const p = run.progress || {};
  const pct = p.total ? Math.round((p.done / p.total) * 100) : null;
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.text, fontWeight: 600 }}>
        <Loader2 size={15} color={T.accent} style={{ animation: "fc-spin 1s linear infinite" }} /> {p.note || "Working…"}
        {pct != null && <span style={{ marginLeft: "auto", fontSize: 11, color: T.label, fontWeight: 400 }}>{p.done} / {p.total}</span>}
      </div>
      <div style={{ height: 6, borderRadius: 3, background: T.mute, marginTop: 12, overflow: "hidden" }}>
        <div style={{ height: "100%", width: pct == null ? "35%" : `${Math.max(4, pct)}%`, background: T.accent, borderRadius: 3, transition: "width .4s ease",
          animation: pct == null ? "ct-indet 1.4s ease-in-out infinite" : "none" }} />
      </div>
      {Array.isArray(p.partial) && (
        <div style={{ display: "flex", gap: 5, marginTop: 10, flexWrap: "wrap" }}>
          {p.partial.map((x) => (
            <span key={x.rank} title={x.error || (x.ok ? "Done" : "Waiting")} style={{ width: 22, height: 22, borderRadius: 6, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 600,
              background: x.ok ? `${T.green}18` : x.error ? `${T.red}14` : T.raised, color: x.ok ? T.green : x.error ? T.red : T.label, border: `1px solid ${x.ok ? `${T.green}40` : x.error ? `${T.red}40` : T.border}` }}>{x.rank}</span>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10.5, color: T.label, marginTop: 10 }}>You can leave this page — it keeps going on the finder and shows up under Recent runs.</div>
    </div>
  );
}

// ── the panel ───────────────────────────────────────────────────────────────
export default function ContentTools({ platform, renderCreators, onToast }) {
  const [cat, setCat] = useState(catalogueCache);
  const [catError, setCatError] = useState(null);
  const [balance, setBalance] = useState(null);
  const [pick, setPick] = useState({});            // platform → service id
  const [inputs, setInputs] = useState({});        // service id → pasted text
  const [optsBy, setOptsBy] = useState({});        // service id → chosen options
  const [info, setInfo] = useState(null);          // service id with its (i) open
  const [confirm, setConfirm] = useState(false);
  const [run, setRun] = useState(null);
  const [startErr, setStartErr] = useState(null);
  const [starting, setStarting] = useState(false);
  const [recent, setRecent] = useState(null);
  const [showRecent, setShowRecent] = useState(false);
  const panelRef = useRef(null);
  const resultRef = useRef(null);

  useEffect(() => {
    if (!cat) FinderAPI.tools().then((c) => { catalogueCache = c; setCat(c); }).catch((e) => setCatError(e.status === 404 ? "old" : e.body?.error || e.message));
    FinderAPI.toolCredits().then(setBalance).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close an open (i) when clicking anywhere else.
  useEffect(() => {
    if (!info) return undefined;
    const close = () => setInfo(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [info]);

  // Poll the run until it finishes.
  useEffect(() => {
    if (!run || run.status !== "running") return undefined;
    let stop = false;
    const t = setTimeout(async () => {
      try {
        const next = await FinderAPI.toolRun(run.id);
        if (stop) return;
        setRun(next);
        if (next.status !== "running") {
          FinderAPI.toolCredits().then(setBalance).catch(() => {});
          if (showRecent) loadRecent();
          if (next.status === "done") onToast?.(`${next.label} is ready`);
        }
      } catch { if (!stop) setRun((r) => ({ ...r })); } // retry on the next tick
    }, run.progress?.total > 1 ? 1500 : 900);
    return () => { stop = true; clearTimeout(t); };
  }, [run]); // eslint-disable-line react-hooks/exhaustive-deps

  const services = useMemo(() => (cat?.services || []).filter((s) => s.platform === platform), [cat, platform]);
  const has = (id) => !!cat?.services?.some((s) => s.id === id);
  const svc = services.find((s) => s.id === pick[platform]) || services.find((s) => s.featured) || services[0];
  const opts = useMemo(() => {
    if (!svc) return {};
    const chosen = optsBy[svc.id] || {};
    return Object.fromEntries(svc.options.map((o) => [o.id, chosen[o.id] ?? (o.type === "text" ? "" : o.default)]));
  }, [svc, optsBy]);
  const input = svc ? inputs[svc.id] || "" : "";
  const est = svc ? estimate(svc, opts) : null;
  const big = est && est[1] >= 15;
  useEffect(() => { setConfirm(false); setStartErr(null); }, [svc?.id, input, JSON.stringify(opts)]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    if (!svc || !input.trim() || starting || run?.status === "running") return;
    if (big && !confirm) { setConfirm(true); return; }
    setStarting(true); setStartErr(null); setConfirm(false);
    try {
      const r = await FinderAPI.runTool({ service: svc.id, input: input.trim(), options: opts });
      setRun(r);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setStartErr(e.body?.error || e.message);
    } finally { setStarting(false); }
  }

  function loadRecent() {
    FinderAPI.toolRuns(15).then((r) => setRecent(r.runs || [])).catch(() => setRecent([]));
  }
  async function openRun(id) {
    try {
      const r = await FinderAPI.toolRun(id);
      setRun(r);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) { onToast?.(`Couldn't open that run: ${e.body?.error || e.message}`); }
  }
  /** From a result: run another tool on one of its posts (e.g. a post → its transcript). */
  function applyTool(id, value) {
    setPick((p) => ({ ...p, [platform]: id }));
    setInputs((m) => ({ ...m, [id]: value }));
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (catError === "old") return <Notice>The finder service needs updating before Content tools work — deploy the latest creator-finder.</Notice>;
  if (catError) return <Notice tone="error">Couldn't load the tools: {catError}</Notice>;
  if (!cat) return <Notice>Loading tools…</Notice>;

  const groups = (cat.groups || []).map((g) => ({ ...g, items: services.filter((s) => s.group === g.id) })).filter((g) => g.items.length);
  const running = run?.status === "running";

  return (
    <div>
      <style>{`.ct-card{transition:border-color .15s, box-shadow .15s, background .15s}.ct-card:hover{border-color:${T.borderMid}}
        @keyframes ct-indet{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
        @media (max-width: 640px){.ct-card{grid-column:auto !important}}`}</style>

      {!cat.configured && <Notice tone="error">SocialKit isn't set up on the finder (SOCIALKIT_ACCESS_KEY), so only Instagram profile details work here.</Notice>}

      {/* Pick a tool */}
      <div ref={panelRef} style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 10px" }}>
        <PlatformLogo platform={platform} size={16} />
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>What do you want to do?</span>
        <span style={{ fontSize: 11, color: T.label }}>Press <Info size={10} style={{ verticalAlign: -1 }} /> on any tool to see how it works.</span>
        {balance?.configured && balance.remaining != null && (
          <span data-testid="sk-balance" title="SocialKit's own count of credits left on the plan" style={{ marginLeft: "auto", fontSize: 10.5, color: balance.remaining < 50 ? T.amber : T.label }}>
            SocialKit: <strong style={{ color: balance.remaining < 50 ? T.amber : T.sub }}>{balance.remaining.toLocaleString("en-IN")}</strong> credits left{balance.resetAt ? ` · renews ${day(balance.resetAt)}` : ""}
          </span>
        )}
      </div>
      {groups.map((g) => (
        <div key={g.id} style={{ marginBottom: 12 }}>
          <div style={{ ...lbl, marginBottom: 6 }}>{g.label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 8 }}>
            {g.items.map((s) => (
              <ToolCard key={s.id} svc={s} on={svc?.id === s.id} onPick={() => setPick((p) => ({ ...p, [platform]: s.id }))}
                infoOpen={info === s.id} onInfo={() => setInfo((v) => (v === s.id ? null : s.id))} />
            ))}
          </div>
        </div>
      ))}

      {/* The chosen tool */}
      {svc && (
        <div data-testid="tool-form" style={{ marginTop: 14, padding: 16, borderRadius: 12, border: `1px solid ${T.borderMid}`, background: T.raised }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <PlatformLogo platform={svc.platform} size={15} />
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{svc.label}</span>
            <span style={{ fontSize: 11, color: T.sub }}>— {svc.how}</span>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); start(); }} style={{ display: "flex", gap: 8 }}>
            <input data-testid="tool-input" value={input} onChange={(e) => setInputs((m) => ({ ...m, [svc.id]: e.target.value }))}
              // Runs cost credits, so they only start from the button.
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              placeholder={svc.input.placeholder}
              style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: "0 12px", height: 40, borderRadius: 8, border: `1px solid ${T.borderMid}`, background: T.surface, color: T.text, fontSize: 12.5, fontFamily: "'Sora'", outline: "none" }} />
            <button type="submit" data-testid="tool-run" disabled={!input.trim() || starting || running}
              style={{ ...btn(true, !input.trim() || starting || running), background: confirm ? T.amber : T.accent }}>
              {starting ? <Loader2 size={14} style={{ animation: "fc-spin 1s linear infinite" }} /> : <Play size={13} />}
              {confirm ? `Yes, use ~${est[1]} credits` : "Run"}
            </button>
          </form>
          {svc.options.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 22px", marginTop: 12 }}>
              {svc.options.map((o) => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", ...(o.type === "text" ? { flex: "1 1 100%" } : {}) }}>
                  <span style={lbl}>{o.label}</span>
                  {o.type === "text"
                    ? <input value={opts[o.id]} placeholder={o.placeholder} onChange={(e) => setOptsBy((m) => ({ ...m, [svc.id]: { ...m[svc.id], [o.id]: e.target.value } }))}
                        style={{ flex: 1, minWidth: 200, padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, fontSize: 11.5, fontFamily: "'Sora'", color: T.text, outline: "none" }} />
                    : o.choices.map((c) => (
                      <button key={String(c.value)} type="button" style={chip(opts[o.id] === c.value)}
                        onClick={() => setOptsBy((m) => ({ ...m, [svc.id]: { ...m[svc.id], [o.id]: c.value } }))}>{c.label}</button>
                    ))}
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 10.5, color: confirm ? T.amber : T.label, marginTop: 10 }}>
            {svc.usesHiker ? svc.cost.text
              : est ? <>Uses about <strong style={{ color: confirm ? T.amber : T.sub }}>{est[0] === est[1] ? est[0] : `${est[0]}–${est[1]}`}</strong> SocialKit credit{est[1] === 1 ? "" : "s"}. {svc.cost.text}{confirm ? " Press again to go ahead." : ""}</> : svc.cost.text}
          </div>
          {startErr && <div style={{ fontSize: 11.5, color: T.red, marginTop: 8 }}><AlertTriangle size={11} style={{ verticalAlign: -1 }} /> {startErr}</div>}
        </div>
      )}

      {/* The run */}
      <div ref={resultRef} style={{ scrollMarginTop: 90 }}>
        {run && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <PlatformLogo platform={run.platform} size={14} />
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{run.label}</span>
              <a href={/^https?:/.test(run.input) ? run.input : undefined} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: T.sub, maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{run.input}</a>
              <span style={{ marginLeft: "auto", fontSize: 10.5, color: T.label }}>
                {run.status === "done" ? `Done ${ago(run.finishedAt || run.createdAt)}` : run.status === "error" ? "Didn't work" : "Working"}
                {run.spent ? ` · used ${run.spent} credit${run.spent === 1 ? "" : "s"}` : ""}
              </span>
              {!running && <button type="button" onClick={() => setRun(null)} aria-label="Close result" style={{ border: "none", background: "none", cursor: "pointer", padding: 2 }}><X size={13} color={T.label} /></button>}
            </div>
            {running && <Working run={run} />}
            {run.status === "error" && <Notice tone="error">{run.error}</Notice>}
            {run.status === "done" && <Result run={run} renderCreators={renderCreators} onUse={applyTool} has={has} />}
          </div>
        )}
      </div>

      {/* Recent runs — anyone's, re-open for free */}
      <div style={{ marginTop: 22, borderTop: `1px dashed ${T.border}`, paddingTop: 12 }}>
        <button type="button" onClick={() => { const v = !showRecent; setShowRecent(v); if (v) loadRecent(); }}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "none", cursor: "pointer", padding: 0, fontSize: 11.5, fontWeight: 600, color: T.sub, fontFamily: "'Sora'" }}>
          <History size={13} /> Recent runs {showRecent ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span style={{ fontWeight: 400, color: T.label }}>— the team's last 15, open any for free</span>
        </button>
        {showRecent && (
          <div style={{ marginTop: 8, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
            {recent == null ? <div style={{ padding: 12, fontSize: 11, color: T.label }}>Loading…</div>
              : !recent.length ? <div style={{ padding: 12, fontSize: 11, color: T.label }}>Nothing run yet.</div>
              : recent.map((r, i) => (
                <button key={r.id} type="button" onClick={() => openRun(r.id)}
                  style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "9px 12px", border: "none", borderTop: i ? `1px solid ${T.border}` : "none", background: run?.id === r.id ? `${T.accent}08` : "transparent", cursor: "pointer", textAlign: "left", fontFamily: "'Sora'" }}>
                  <PlatformLogo platform={r.platform} size={13} />
                  <span style={{ fontSize: 11.5, color: T.text, fontWeight: 500, width: 210, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
                  <span style={{ fontSize: 11, color: T.sub, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.input}</span>
                  <span style={{ fontSize: 10, color: r.status === "error" ? T.red : r.status === "running" ? T.amber : T.green, flexShrink: 0 }}>{r.status === "done" ? "Ready" : r.status === "error" ? "Failed" : "Running"}</span>
                  <span style={{ fontSize: 10, color: T.label, width: 90, textAlign: "right", flexShrink: 0 }}>{ago(r.createdAt)}</span>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
