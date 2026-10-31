/**
 * 5th Avenue — Creators › Find creators
 * ─────────────────────────────────────────────────────────────────
 * Discover new Instagram creators by niche, category or bio ("mom",
 * "couple travel", "fitness coach", "tamil food"), 20 at a time.
 *
 * Talks to the separate creator-finder service (FinderAPI in lib/api.js),
 * never to the main backend — discovery is the expensive part, so it lives on
 * its own server with its own database and its own daily HikerAPI limit.
 *
 * The finder keeps every profile it looks at, so a niche searched before is
 * answered from that saved index for free; only new ground costs requests.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, ExternalLink, Mail, MapPin, Search, Sparkles, UserPlus, Check, Loader2, X } from "lucide-react";
import { CreatorsAPI, FinderAPI } from "../../lib/api";
import { fmtCompact } from "../../lib/format";
import { T } from "../../theme/tokens";
import { GhostBtn, Notice, Pill } from "./shared";

const SIZES = [
  { id: "nano", label: "Nano", hint: "1K–10K" },
  { id: "micro", label: "Micro", hint: "10K–100K" },
  { id: "macro", label: "Macro", hint: "100K–1M" },
  { id: "mega", label: "Mega", hint: "1M+" },
];
const DEFAULT_NICHES = ["Mom", "Couple", "Fitness", "Lifestyle", "Food", "Travel", "Fashion", "Beauty", "Skincare", "Tech",
  "Finance", "Comedy", "Parenting", "Yoga", "Pets", "Home decor", "Wedding", "Gaming", "Education", "Auto"];

// Used until /api/find/meta answers (it sends the full list).
const DEFAULT_PLACES = [
  ["Anywhere in India", "India", "🇮🇳"], ["Mumbai", "India"], ["Delhi NCR", "India"], ["Bengaluru", "India"], ["Hyderabad", "India"],
  ["Chennai", "India"], ["Kolkata", "India"], ["Pune", "India"], ["Kerala", "India"], ["Punjab", "India"],
  ["UAE", "Countries", "🇦🇪"], ["United Kingdom", "Countries", "🇬🇧"], ["United States", "Countries", "🇺🇸"], ["Canada", "Countries", "🇨🇦"],
  ["Australia", "Countries", "🇦🇺"], ["Singapore", "Countries", "🇸🇬"], ["Saudi Arabia", "Countries", "🇸🇦"], ["Qatar", "Countries", "🇶🇦"],
  ["Dubai", "Cities abroad", "🇦🇪", "UAE"], ["London", "Cities abroad", "🇬🇧", "United Kingdom"], ["Toronto", "Cities abroad", "🇨🇦", "Canada"],
  ["New York", "Cities abroad", "🇺🇸", "United States"], ["Sydney", "Cities abroad", "🇦🇺", "Australia"],
].map(([label, group, flag, country]) => ({ label, group, flag, country }));
const GROUPS = ["India", "Countries", "Cities abroad"];

/**
 * Location picker: type to filter, grouped into India / Countries / Cities
 * abroad. Anything typed that isn't listed (a smaller town) is used as-is.
 */
function LocationPicker({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const q = text.trim().toLowerCase();
  const exact = options.find((o) => o.label.toLowerCase() === q);
  const shown = (!q || exact ? options : options.filter((o) =>
    o.label.toLowerCase().includes(q) || (o.country || "").toLowerCase().includes(q) || (o.group === "India" && "india".startsWith(q))));
  const pick = (label) => { onChange(label); setText(label); setOpen(false); };
  const active = options.find((o) => o.label === value);

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <span style={{ position: "absolute", left: 9, pointerEvents: "none", fontSize: 12, lineHeight: 1, display: "flex" }}>
        {active?.flag || <MapPin size={12} color={value ? T.accent : T.label} />}
      </span>
      <input
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); if (text.trim() !== value) onChange(text.trim()); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); pick(shown.length && q && !exact ? shown[0].label : text.trim()); e.currentTarget.blur(); }
          if (e.key === "Escape") { setText(value); setOpen(false); e.currentTarget.blur(); }
        }}
        placeholder="Anywhere"
        title="A city, state or country — or type any town"
        style={{ ...chip(!!value), width: 190, padding: "5px 26px 5px 28px", outline: "none", cursor: "text", textAlign: "left" }}
      />
      {value && (
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick("")} title="Clear location"
          style={{ position: "absolute", right: 6, background: "none", border: "none", cursor: "pointer", padding: 2, display: "grid", placeItems: "center" }}>
          <X size={11} color={T.label} />
        </button>
      )}
      {open && (
        <div onMouseDown={(e) => e.preventDefault()} style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60, width: 280, maxHeight: 340, overflowY: "auto",
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: T.shadowLg, padding: 6,
        }}>
          <button type="button" onClick={() => pick("")} style={optStyle(!value)}><span style={{ width: 18 }}>🌐</span> Anywhere</button>
          {GROUPS.map((g) => {
            const items = shown.filter((o) => o.group === g).slice(0, q ? 40 : g === "Cities abroad" ? 30 : 60);
            if (!items.length) return null;
            return (
              <div key={g}>
                <div style={{ fontSize: 9, fontWeight: 600, color: T.label, textTransform: "uppercase", letterSpacing: ".08em", padding: "8px 8px 4px" }}>{g}</div>
                {items.map((o) => (
                  <button key={`${g}:${o.label}`} type="button" onClick={() => pick(o.label)} style={optStyle(o.label === value)}>
                    <span style={{ width: 18 }}>{o.flag || (o.group === "India" ? "" : "")}</span>
                    <span style={{ flex: 1 }}>{o.label}</span>
                    {o.country && <span style={{ fontSize: 10, color: T.label }}>{o.country}</span>}
                    {o.kind === "state" && <span style={{ fontSize: 10, color: T.label }}>state</span>}
                  </button>
                ))}
              </div>
            );
          })}
          {q && !exact && (
            <button type="button" onClick={() => pick(text.trim())} style={{ ...optStyle(false), color: T.accent }}>
              <span style={{ width: 18 }}><MapPin size={11} /></span> Use “{text.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
const optStyle = (on) => ({
  display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", padding: "6px 8px", borderRadius: 6,
  border: "none", background: on ? `${T.accent}10` : "transparent", color: on ? T.accent : T.text, fontWeight: on ? 600 : 400,
  fontSize: 11.5, fontFamily: "'Sora'", cursor: "pointer",
});


const handleOf = (h) => String(h || "").toLowerCase().replace(/^@/, "").trim();

const chip = (on, color = T.accent) => ({
  padding: "5px 11px", borderRadius: 999, fontSize: 11, fontFamily: "'Sora'", cursor: "pointer",
  border: `1px solid ${on ? color : T.border}`, background: on ? `${color}10` : T.surface,
  color: on ? color : T.sub, fontWeight: on ? 600 : 400, whiteSpace: "nowrap", transition: "all .15s",
});

function Toggle({ on, onChange, children }) {
  return (
    <button type="button" onClick={() => onChange(!on)} style={{ ...chip(on), display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 22, height: 12, borderRadius: 6, background: on ? T.accent : T.mute, position: "relative", transition: "background .15s" }}>
        <span style={{ position: "absolute", top: 2, left: on ? 12 : 2, width: 8, height: 8, borderRadius: 4, background: "#fff", transition: "left .15s" }} />
      </span>
      {children}
    </button>
  );
}

/** Bio with the words that matched the search lightly marked. */
function Bio({ text, words }) {
  if (!text) return <span style={{ color: T.label }}>No bio</span>;
  const ws = (words || []).filter((w) => w && w.length > 1);
  if (!ws.length) return text;
  const re = new RegExp(`(${ws.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(re).map((part, i) =>
    i % 2 ? <mark key={i} style={{ background: `${T.amber}22`, color: T.text, borderRadius: 3, padding: "0 2px" }}>{part}</mark> : part);
}

function Avatar({ r, size = 54 }) {
  const [src, setSrc] = useState(FinderAPI.avatarUrl(r));
  const [broken, setBroken] = useState(false);
  const initials = (r.fullName || r.username || "?").replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  if (!src || broken) {
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
        background: `linear-gradient(135deg, ${T.accent}22, ${T.purple}22)`, color: T.accent, fontWeight: 600, fontSize: size * 0.32 }}>
        {initials || "?"}
      </div>
    );
  }
  return (
    <img src={src} alt="" width={size} height={size} referrerPolicy="no-referrer"
      onError={() => (src !== r.picUrl && r.picUrl ? setSrc(r.picUrl) : setBroken(true))}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: `1px solid ${T.border}` }} />
  );
}

function ResultCard({ r, known, added, adding, onAdd }) {
  const inDir = known || added;
  return (
    <div className="fc-card" style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16,
      display: "flex", flexDirection: "column", gap: 11, boxShadow: T.shadow, minWidth: 0,
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
        <Avatar r={r} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.fullName || r.username}
            </span>
            {r.isVerified && <BadgeCheck size={13} color={T.accent} style={{ flexShrink: 0 }} />}
          </div>
          <a href={r.igUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: T.sub, textDecoration: "none" }}>@{r.username}</a>
          {r.category && <div style={{ marginTop: 4 }}><Pill color={T.teal}>{r.category}</Pill></div>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "'Newsreader', serif", fontSize: 22, fontWeight: 600, color: T.text, lineHeight: 1 }}>{fmtCompact(r.followers)}</div>
          <div style={{ fontSize: 9, color: T.label, textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>followers</div>
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: T.sub, lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 53, whiteSpace: "pre-line" }}>
        <Bio text={r.biography} words={r.why?.words} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
        {r.publicEmail && (
          <a href={`mailto:${r.publicEmail}`} style={{ textDecoration: "none" }} title={r.publicEmail}>
            <Pill color={T.green}><Mail size={9} style={{ verticalAlign: -1, marginRight: 3 }} />{r.publicEmail.length > 26 ? `${r.publicEmail.slice(0, 24)}…` : r.publicEmail}</Pill>
          </a>
        )}
        {inDir && <Pill color={T.purple}>In directory</Pill>}
        {(r.location || r.why?.where) && (
          <span title={r.why?.where ? `Location evidence — ${r.why.where}` : "From the bio"}
            style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: T.sub }}>
            {r.flag ? <span style={{ fontSize: 11 }}>{r.flag}</span> : <MapPin size={10} color={T.red} />}
            {r.location || r.why.where.replace(/^(bio|profile city|posts at|via):?\s*/i, "")}
          </span>
        )}
        {r.posts != null && <span style={{ fontSize: 10, color: T.label }}>{fmtCompact(r.posts)} posts</span>}
        {r.why?.via && <span style={{ fontSize: 10, color: T.label, marginLeft: "auto" }} title="How the finder found this creator">via {r.why.via}</span>}
      </div>

      <div style={{ display: "flex", gap: 6, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
        <a href={r.igUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
          <GhostBtn color={T.sub} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><ExternalLink size={10} /> Instagram</GhostBtn>
        </a>
        {onAdd && <GhostBtn
          color={inDir ? T.label : T.accent}
          disabled={inDir || adding}
          onClick={onAdd}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: "auto", cursor: inDir ? "default" : "pointer", opacity: adding ? 0.6 : 1 }}
        >
          {added ? <><Check size={10} /> Added</> : known ? "Already in directory" : adding ? "Adding…" : <><UserPlus size={10} /> Add to directory</>}
        </GhostBtn>}
      </div>
    </div>
  );
}

export default function FindCreators({ creators = [], canEdit, onToast, onCreated }) {
  const [query, setQuery] = useState("");
  const [sizes, setSizes] = useState([]);
  const [hasEmail, setHasEmail] = useState(false);
  const [hideKnown, setHideKnown] = useState(false);
  const [location, setLocation] = useState("");
  const [places, setPlaces] = useState(DEFAULT_PLACES);
  const [niches, setNiches] = useState(DEFAULT_NICHES);
  const [usage, setUsage] = useState(null);

  const [search, setSearch] = useState(null);     // { sessionId, query, expanded, hasMore }
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(null);         // "search" | "more" | null
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [spent, setSpent] = useState(null);
  const [added, setAdded] = useState(() => new Set());
  const [adding, setAdding] = useState(null);
  const inputRef = useRef(null);

  const knownHandles = useMemo(() => new Set(creators.map((c) => handleOf(c.handle)).filter(Boolean)), [creators]);

  useEffect(() => {
    if (!FinderAPI.configured) return;
    FinderAPI.meta().then((m) => {
      if (m?.suggestions?.length) setNiches(m.suggestions);
      if (m?.places?.length) setPlaces(m.places);
      setUsage(m.usage);
    }).catch(() => {});
  }, []);

  // Filters are fixed when a search starts; this tells us if they've changed since.
  const filterKey = JSON.stringify([[...sizes].sort(), hasEmail, location.trim().toLowerCase()]);

  const exclude = () => (hideKnown ? [...knownHandles, ...added] : [...added]);

  async function run(q = query) {
    const text = q.trim();
    if (!text || busy) return;
    setQuery(text);
    setBusy("search"); setError(null); setWarnings([]); setResults([]); setSearch(null);
    try {
      const r = await FinderAPI.search({ query: text, filters: { sizes, hasEmail, location: location.trim() || null }, exclude: exclude() });
      setSearch({ sessionId: r.sessionId, query: r.query, expanded: r.expanded, hasMore: r.hasMore, used: filterKey });
      setResults(r.results); setWarnings(r.warnings || []); setSpent({ batch: r.spent, total: r.totalSpent }); setUsage(r.usage);
    } catch (e) {
      setError(e.body?.error || e.message);
    } finally { setBusy(null); }
  }

  async function more() {
    if (!search?.sessionId || busy) return;
    setBusy("more"); setError(null);
    try {
      const r = await FinderAPI.next(search.sessionId, { exclude: exclude() });
      setResults((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        return [...prev, ...r.results.filter((x) => !ids.has(x.id))];
      });
      setSearch((s) => ({ ...s, hasMore: r.hasMore }));
      setWarnings(r.warnings || []); setSpent({ batch: r.spent, total: r.totalSpent }); setUsage(r.usage);
    } catch (e) {
      setError(e.body?.error || e.message);
    } finally { setBusy(null); }
  }

  async function addToDirectory(r) {
    setAdding(r.id);
    try {
      const created = await CreatorsAPI.create({
        name: r.fullName || r.username,
        handle: `@${r.username}`,
        platform: "Instagram",
        igUrl: r.igUrl,
        followers: fmtCompact(r.followers),
        niche: search?.expanded?.niches?.join(", ") || search?.query || "",
        ...(r.publicEmail ? { personalDetails: { email: r.publicEmail } } : {}),
        ...(FinderAPI.avatarUrl(r) ? { avatarSourceUrl: FinderAPI.avatarUrl(r) } : {}),
      });
      setAdded((s) => new Set(s).add(r.username));
      onCreated?.(created);
      onToast?.(`${r.fullName || r.username} added to the directory`);
    } catch (e) {
      if (e.status === 409) { setAdded((s) => new Set(s).add(r.username)); onToast?.("Already in the directory"); }
      else onToast?.(`Couldn't add: ${e.body?.error || e.message}`);
    } finally { setAdding(null); }
  }

  const shown = hideKnown ? results.filter((r) => !knownHandles.has(r.username)) : results;

  if (!FinderAPI.configured) {
    return <Notice>The creator finder service isn't connected yet. Set <code>VITE_FINDER_URL</code> (and <code>VITE_FINDER_KEY</code>) for this app, then reload.</Notice>;
  }

  return (
    <div>
      <style>{`.fc-card{transition:transform .18s ease, box-shadow .18s ease}.fc-card:hover{transform:translateY(-2px);box-shadow:${T.shadowLg}}@keyframes fc-spin{to{transform:rotate(360deg)}}`}</style>

      {/* Search panel */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 18px 14px", boxShadow: T.shadow, marginBottom: 18 }}>
        <form onSubmit={(e) => { e.preventDefault(); run(); }} style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={15} color={T.label} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Niche, category or bio words — e.g. mom, couple travel, fitness coach, tamil food"
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px 11px 36px", borderRadius: 8, border: `1px solid ${T.borderMid}`,
                background: T.raised, color: T.text, fontSize: 13, fontFamily: "'Sora'", outline: "none" }}
            />
          </div>
          <button type="submit" disabled={!query.trim() || !!busy} style={{
            padding: "0 20px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 12.5, fontWeight: 600,
            fontFamily: "'Sora'", cursor: query.trim() && !busy ? "pointer" : "default", opacity: query.trim() && !busy ? 1 : 0.5,
            display: "inline-flex", alignItems: "center", gap: 7,
          }}>
            {busy === "search" ? <Loader2 size={14} style={{ animation: "fc-spin 1s linear infinite" }} /> : <Sparkles size={14} />}
            Find creators
          </button>
        </form>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
          {niches.map((n) => (
            <button key={n} type="button" onClick={() => run(n)} style={chip(search?.query === n.toLowerCase())}>{n}</button>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${T.border}` }}>
          <span style={{ fontSize: 9.5, color: T.label, textTransform: "uppercase", letterSpacing: ".08em", marginRight: 2 }}>Location</span>
          <LocationPicker value={location} onChange={setLocation} options={places} />
          <span style={{ width: 1, height: 18, background: T.border, margin: "0 4px" }} />
          <span style={{ fontSize: 9.5, color: T.label, textTransform: "uppercase", letterSpacing: ".08em", marginRight: 2 }}>Size</span>
          {SIZES.map((s) => {
            const on = sizes.includes(s.id);
            return (
              <button key={s.id} type="button" title={s.hint}
                onClick={() => setSizes((v) => (on ? v.filter((x) => x !== s.id) : [...v, s.id]))}
                style={chip(on)}>
                {s.label} <span style={{ opacity: 0.6, fontWeight: 400 }}>{s.hint}</span>
              </button>
            );
          })}
          <span style={{ width: 1, height: 18, background: T.border, margin: "0 4px" }} />
          <Toggle on={hasEmail} onChange={setHasEmail}>Has email</Toggle>
          <Toggle on={hideKnown} onChange={setHideKnown}>Hide ones we have</Toggle>
          {usage && (
            <span style={{ marginLeft: "auto", fontSize: 10, color: usage.calls / usage.limit > 0.85 ? T.amber : T.label }}
              title="Instagram requests made by the finder today (resets midnight UTC)">
              Today: {usage.calls.toLocaleString("en-IN")} / {usage.limit.toLocaleString("en-IN")} requests
            </span>
          )}
        </div>
        {location && (
          <div style={{ fontSize: 10.5, color: T.label, marginTop: 8 }}>
            Only creators with evidence of {location}: their bio or profile city, posts tagged there, or its hashtags. Instagram doesn't share where creators live, so this finds fewer creators per search.
          </div>
        )}
        {search && search.used !== filterKey && (
          <div style={{ fontSize: 10.5, color: T.label, marginTop: 8 }}>Filters apply to the next search — press Find creators again to use them.</div>
        )}
      </div>

      {/* Search summary */}
      {search && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 14, fontSize: 11, color: T.sub }}>
          <span>Looking for <strong style={{ color: T.text }}>{search.expanded?.niches?.join(" + ") || search.query}</strong> creators
            {search.expanded?.location && <> in <strong style={{ color: T.text }}>{search.expanded.location}</strong></>}</span>
          {search.expanded?.hashtags?.slice(0, 6).map((h) => <Pill key={h} color={T.label}>#{h}</Pill>)}
          <span style={{ marginLeft: "auto", color: T.label }}>
            {shown.length} shown{spent ? ` · this batch used ${spent.batch} request${spent.batch === 1 ? "" : "s"}${spent.batch === 0 ? " (from saved creators)" : ""}` : ""}
          </span>
        </div>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {warnings.map((w) => <div key={w} style={{ fontSize: 10.5, color: T.amber, marginBottom: 6 }}>{w}</div>)}

      {!search && !busy && !error && (
        <Notice tone="empty">
          Search any niche — the finder looks through Instagram accounts, reels and niche hashtags, and checks each bio.
          Creators it has seen before come back instantly and for free.
        </Notice>
      )}
      {busy === "search" && <Notice>Searching Instagram for “{query}”… the first search in a new niche takes 20–60 seconds.</Notice>}
      {search && !busy && shown.length === 0 && !error && (
        <Notice tone="empty">No creators matched. Try a broader word (“fitness” instead of “crossfit coach”) or remove a filter.</Notice>
      )}

      {shown.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
          {shown.map((r) => (
            <ResultCard key={r.id} r={r}
              known={knownHandles.has(r.username)}
              added={added.has(r.username)}
              adding={adding === r.id}
              onAdd={canEdit ? () => addToDirectory(r) : undefined} />
          ))}
        </div>
      )}

      {search?.hasMore && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
          <button type="button" onClick={more} disabled={!!busy} style={{
            padding: "10px 22px", borderRadius: 8, border: `1px solid ${T.accent}`, background: T.surface, color: T.accent,
            fontSize: 12, fontWeight: 600, fontFamily: "'Sora'", cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 7,
          }}>
            {busy === "more" ? <><Loader2 size={13} style={{ animation: "fc-spin 1s linear infinite" }} /> Finding the next 20…</> : "Load next 20"}
          </button>
        </div>
      )}
      {search && !search.hasMore && shown.length > 0 && (
        <div style={{ textAlign: "center", fontSize: 11, color: T.label, marginTop: 18 }}>That's everyone the finder could find for this search.</div>
      )}
    </div>
  );
}
