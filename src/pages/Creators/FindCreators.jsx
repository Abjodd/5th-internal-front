/**
 * 5th Avenue — Creators › Find creators
 * ─────────────────────────────────────────────────────────────────
 * Discover new creators by niche, category or bio ("mom", "couple travel",
 * "fitness coach", "tamil food"), 20 at a time — on Instagram (HikerAPI),
 * YouTube or TikTok (SocialKit). Whatever is added to the directory keeps its
 * platform, so the Creators tab can filter by it.
 *
 * Talks to the separate creator-finder service (FinderAPI in lib/api.js),
 * never to the main backend — discovery is the expensive part, so it lives on
 * its own server with its own database and its own daily HikerAPI limit.
 *
 * The finder keeps every profile it looks at, so a niche searched before is
 * answered from that saved index for free; only new ground costs requests.
 *
 * Three ways in, as tabs under the platforms: Search by niche, Paste profile
 * links, and Content tools (ContentTools.jsx — transcripts, summaries, stats,
 * comments, downloads… through SocialKit).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Mail, MapPin, Search, UserPlus, UserRoundSearch, Check, Loader2, X, Wand2, Link2 } from "lucide-react";
import { CreatorsAPI, FinderAPI } from "../../lib/api";
import { fmtCompact } from "../../lib/format";
import { T } from "../../theme/tokens";
import { GhostBtn, Notice, Pill } from "./shared";
import PlatformLogo from "../../components/PlatformLogo";
import ContentTools from "./ContentTools";

// The finder's platforms. `directory` is how the main app spells it on a
// creator record (lib/campaign.js PLATFORMS); `followers` is what the count is
// called there. Availability comes from /api/find/meta.
const FINDER_PLATFORMS = [
  { id: "instagram", label: "Instagram", directory: "Instagram", followers: "followers", posts: "posts", color: "#C13584" },
  { id: "youtube", label: "YouTube", directory: "YouTube", followers: "subscribers", posts: "videos", color: "#E62117" },
  { id: "tiktok", label: "TikTok", directory: "TikTok", followers: "followers", posts: "videos", color: "#111111" },
  // SocialKit can't search these by niche — they're looked up from profile links.
  { id: "facebook", label: "Facebook", directory: "Facebook", followers: "followers", posts: "posts", color: "#1877F2", linkOnly: true },
  { id: "x", label: "X", directory: "Twitter / X", followers: "followers", posts: "posts", color: "#000000", linkOnly: true },
  { id: "linkedin", label: "LinkedIn", directory: "LinkedIn", followers: "followers", posts: "posts", color: "#0A66C2", linkOnly: true },
];
const LINK_EXAMPLES = {
  instagram: "https://www.instagram.com/name/", youtube: "https://www.youtube.com/@name", tiktok: "https://www.tiktok.com/@name",
  facebook: "https://www.facebook.com/name", x: "https://x.com/name", linkedin: "https://www.linkedin.com/in/name/",
};
const platformInfo = (id) => FINDER_PLATFORMS.find((p) => p.id === id) || FINDER_PLATFORMS[0];

const SIZES = [
  { id: "nano", label: "Nano", hint: "1K–10K" },
  { id: "micro", label: "Micro", hint: "10K–100K" },
  { id: "macro", label: "Macro", hint: "100K–1M" },
  { id: "mega", label: "Mega", hint: "1M+" },
];
const DEFAULT_NICHES = ["Mom", "Couple", "Fitness", "Lifestyle", "Food", "Travel", "Fashion", "Beauty", "Skincare", "Tech",
  "Finance", "Comedy", "Parenting", "Yoga", "Pets", "Home decor", "Wedding", "Gaming", "Education", "Auto"];

// Country → State → City, as /api/find/meta sends it (placeTree). Until it
// answers — or from a finder that predates the tree — India alone is offered.
const FALLBACK_TREE = [{ id: "country:india", label: "India", flag: "🇮🇳", states: [], cities: [] }];

// A finder deployed before the tree existed only sends the flat `places` list;
// rebuild what we can from it (India's states have no cities under them then).
function treeFromFlat(places) {
  const india = { id: "country:india", label: "India", flag: "🇮🇳", states: [], cities: [] };
  const abroad = new Map();
  for (const p of places || []) {
    if (p.group === "India" && p.kind === "state") india.states.push({ id: p.id, label: p.label, cities: [] });
    else if (p.group === "India" && p.kind === "city") india.cities.push({ id: p.id, label: p.label });
    else if (p.group === "Countries") abroad.set(p.label, { id: p.id, label: p.label, flag: p.flag, states: [], cities: [] });
  }
  for (const p of places || []) if (p.group === "Cities abroad" && abroad.has(p.country)) abroad.get(p.country).cities.push({ id: p.id, label: p.label });
  india.states.sort((x, y) => x.label.localeCompare(y.label));
  return [india, ...[...abroad.values()].sort((x, y) => x.label.localeCompare(y.label))];
}

/** All of a finder result, as stored on the directory creator (socials.<platform>). */
function discoveryOf(r, search) {
  const drop = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)));
  return drop({
    platform: r.platform || "instagram",
    platformId: r.id,
    username: r.username,
    fullName: r.fullName,
    profileUrl: r.profileUrl || r.igUrl,
    bio: r.biography,
    category: r.category,
    followers: r.followers,
    following: r.following,
    posts: r.posts,
    totalLikes: r.totalLikes,
    verified: !!r.isVerified,
    email: r.publicEmail,
    website: r.externalUrl,
    city: r.city,
    detectedLocation: r.location,
    flag: r.flag,
    photoUrl: r.picUrl,
    extra: r.extra && Object.keys(r.extra).length ? r.extra : null,
    foundVia: r.why?.via,
    matchedWords: r.why?.words,
    locationEvidence: r.why?.where,
    searchQuery: search?.query,
    searchNiches: search?.expanded?.niches,
    searchLocation: search?.expanded?.location,
    fetchedAt: r.lastFetched,
    source: "Find creators",
  });
}

/** A finder photo as a data: URI (≤ 1.5MB), or null — never blocks adding the creator. */
async function photoDataUri(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    // Only what the directory accepts (avatarStore.js): PNG, JPEG, WebP.
    if (!/^image\/(png|jpeg|webp)$/i.test(blob.type) || blob.size > 1.5 * 1024 * 1024) return null;
    return await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => ok(null); fr.readAsDataURL(blob); });
  } catch { return null; }
}

const NO_PLACE = { country: null, state: null, city: null, town: "" };
/** What goes to the finder: the most specific thing picked. */
function locationIdOf(v) {
  const town = (v.town || "").trim();
  if (town) return `text:${town}${v.state || v.country ? `@${v.state || v.country}` : ""}`;
  return v.city || v.state || v.country || null;
}
/** "Kochi, Kerala, India" for the notice under the filters. */
function locationLabelOf(v, tree) {
  const country = tree.find((c) => c.id === v.country);
  const state = country?.states.find((s) => s.id === v.state);
  const city = [...(state?.cities || []), ...(country?.states.flatMap((s) => s.cities) || []), ...(country?.cities || [])].find((c) => c.id === v.city);
  return [(v.town || "").trim() || city?.label, state?.label, country?.label].filter(Boolean).join(", ");
}

function PlaceSelect({ value, onChange, placeholder, children, testId, width = 150 }) {
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <select data-testid={testId} value={value || ""} onChange={(e) => onChange(e.target.value || null)}
        style={{ ...chip(!!value), appearance: "none", WebkitAppearance: "none", width, padding: "5px 24px 5px 11px", outline: "none", textOverflow: "ellipsis" }}>
        <option value="">{placeholder}</option>
        {children}
      </select>
      <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 7, color: value ? T.accent : T.label }}>▼</span>
    </span>
  );
}

/**
 * Location: three dropdowns that narrow each other — Country, then State,
 * then City. Each one left on "Any" means everywhere inside the one before
 * it. A city can be picked straight from the country (its state fills
 * itself in), and "Other town…" takes any place we don't list.
 */
function LocationFilter({ tree, value, onChange }) {
  const country = tree.find((c) => c.id === value.country) || null;
  const states = country?.states || [];
  const state = states.find((s) => s.id === value.state) || null;
  const cities = state ? state.cities : country ? [...country.cities, ...states.flatMap((s) => s.cities)] : [];
  // Biggest-first inside one state (or a country with no states); A–Z when
  // a whole country's states are merged into one list.
  const sortedCities = state || !states.length ? cities : [...cities].sort((x, y) => x.label.localeCompare(y.label));
  const typing = value.town != null && value.town !== "" || value.city === "__other";
  const stateOf = (cityId) => states.find((s) => s.cities.some((c) => c.id === cityId))?.id || null;

  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      <PlaceSelect testId="loc-country" value={value.country} placeholder="🌐 Any country" width={170}
        onChange={(id) => onChange({ ...NO_PLACE, country: id })}>
        <option value="country:india">🇮🇳 India</option>
        <optgroup label="Abroad">
          {tree.filter((c) => c.id !== "country:india").map((c) => <option key={c.id} value={c.id}>{c.flag} {c.label}</option>)}
        </optgroup>
      </PlaceSelect>

      {country && states.length > 0 && (
        <PlaceSelect testId="loc-state" value={value.state} placeholder={`Any ${country.id === "country:india" ? "state" : "region"}`} width={170}
          onChange={(id) => onChange({ ...value, state: id, city: null, town: "" })}>
          {states.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </PlaceSelect>
      )}

      {country && (
        <PlaceSelect testId="loc-city" value={typing ? "__other" : value.city} placeholder="Any city" width={160}
          onChange={(id) => {
            if (id === "__other") return onChange({ ...value, city: "__other", town: "" });
            onChange({ ...value, city: id, town: "", state: id ? (value.state || stateOf(id)) : value.state });
          }}>
          {sortedCities.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          <option value="__other">Other town…</option>
        </PlaceSelect>
      )}

      {typing && (
        <input data-testid="loc-town" autoFocus value={value.town || ""} placeholder={`Town in ${state?.label || country?.label || "…"}`}
          onChange={(e) => onChange({ ...value, city: "__other", town: e.target.value })}
          style={{ ...chip(!!(value.town || "").trim()), width: 150, cursor: "text", outline: "none" }} />
      )}

      {value.country && (
        <button type="button" onClick={() => onChange(NO_PLACE)} title="Clear location"
          style={{ background: "none", border: "none", cursor: "pointer", padding: 3, display: "grid", placeItems: "center" }}>
          <X size={12} color={T.label} />
        </button>
      )}
    </span>
  );
}
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

/** Photo with the platform's logo in the corner. */
function AvatarWithBadge({ r, size = 54 }) {
  return (
    <span style={{ position: "relative", flexShrink: 0, width: size, height: size }}>
      <Avatar r={r} size={size} />
      <span title={platformInfo(r.platform).label} style={{ position: "absolute", right: -3, bottom: -3, width: 20, height: 20, borderRadius: "50%", background: "#fff",
        border: `1px solid ${T.border}`, display: "grid", placeItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,.12)" }}>
        <PlatformLogo platform={r.platform || "instagram"} size={11} />
      </span>
    </span>
  );
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
  const pf = platformInfo(r.platform);
  const link = r.profileUrl || r.igUrl;
  return (
    <div className="fc-card" style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16,
      display: "flex", flexDirection: "column", gap: 11, boxShadow: T.shadow, minWidth: 0,
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
        <AvatarWithBadge r={r} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.fullName || r.username}
            </span>
            {r.isVerified && <BadgeCheck size={13} color={T.accent} style={{ flexShrink: 0 }} />}
            <span data-testid="card-platform" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 600, color: pf.color, border: `1px solid ${pf.color}33`, borderRadius: 20, padding: "1px 6px 1px 4px" }}><PlatformLogo platform={pf.id} size={9} />{pf.label}</span>
          </div>
          <a href={link} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 11, color: T.sub, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{r.username}</a>
          {r.category && <div style={{ marginTop: 4 }}><Pill color={T.teal}>{r.category}</Pill></div>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "'Newsreader', serif", fontSize: 22, fontWeight: 600, color: T.text, lineHeight: 1 }}>{fmtCompact(r.followers)}</div>
          <div style={{ fontSize: 9, color: T.label, textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>{pf.followers}</div>
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
        {r.posts != null && <span style={{ fontSize: 10, color: T.label }}>{fmtCompact(r.posts)} {pf.posts}</span>}
        {r.totalLikes != null && <span style={{ fontSize: 10, color: T.label }}>{fmtCompact(r.totalLikes)} likes</span>}
        {r.extra?.connections != null && <span style={{ fontSize: 10, color: T.label }}>{fmtCompact(r.extra.connections)} connections</span>}
        {r.extra?.joinedAt && <span style={{ fontSize: 10, color: T.label }}>joined {String(r.extra.joinedAt).slice(0, 4)}</span>}
        {r.externalUrl && <a href={r.externalUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: T.accent, textDecoration: "none", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.externalUrl.replace(/^https?:\/\/(www\.)?/, "")}</a>}
        {r.why?.via && <span style={{ fontSize: 10, color: T.label, marginLeft: "auto" }} title="How the finder found this creator">via {r.why.via}</span>}
      </div>

      <div style={{ display: "flex", gap: 6, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
        <a href={link} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
          <GhostBtn color={T.sub} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><PlatformLogo platform={pf.id} size={11} /> Open on {pf.label}</GhostBtn>
        </a>
        {onAdd && <GhostBtn
          color={inDir ? T.label : T.accent}
          disabled={inDir || adding}
          onClick={onAdd}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: "auto", cursor: inDir ? "default" : "pointer", opacity: adding ? 0.6 : 1 }}
        >
          {added ? <><Check size={10} /> Added</> : known ? (typeof known === "string" ? `In directory · ${known}` : "Already in directory") : adding ? "Adding…" : <><UserPlus size={10} /> Add to directory</>}
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
  const [place, setPlace] = useState(NO_PLACE);      // { country, state, city, town }
  const [placeTree, setPlaceTree] = useState(FALLBACK_TREE);
  const location = locationIdOf({ ...place, city: place.city === "__other" ? null : place.city });
  const locationLabel = locationLabelOf(place, placeTree);
  const [niches, setNiches] = useState(DEFAULT_NICHES);
  const [usage, setUsage] = useState(null);
  const [platform, setPlatform] = useState("instagram");
  const [mode, setMode] = useState("search");          // "search" (by niche) | "links" (paste profile links)
  const [linksText, setLinksText] = useState("");
  const [lookup, setLookup] = useState(null);          // { results, errors, spent }
  const [available, setAvailable] = useState({ instagram: true });  // from /api/find/meta

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
  // The directory is keyed by handle, so the same handle on another platform is
  // the same directory entry. Which platform it's under, to say so on the card.
  const knownPlatform = useMemo(() => new Map(creators.map((c) => [handleOf(c.handle), c.platform || ""]).filter(([h]) => h)), [creators]);
  const [taken, setTaken] = useState(() => new Map()); // username → platform it's already in the directory under

  useEffect(() => {
    if (!FinderAPI.configured) return;
    FinderAPI.meta().then((m) => {
      if (m?.suggestions?.length) setNiches(m.suggestions);
      if (m?.placeTree?.length) setPlaceTree(m.placeTree);
      else if (m?.places?.length) setPlaceTree(treeFromFlat(m.places));
      setUsage(m.usage);
      if (Array.isArray(m?.platforms)) setAvailable(Object.fromEntries(m.platforms.map((p) => [p.id, !!p.available])));
    }).catch(() => {});
  }, []);

  // Filters are fixed when a search starts; this tells us if they've changed since.
  const toolsMode = mode === "tools";
  const linkMode = !toolsMode && (mode === "links" || !!platformInfo(platform).linkOnly);
  const filterKey = JSON.stringify([platform, [...sizes].sort(), hasEmail, (location || "").toLowerCase()]);
  const pf = platformInfo(platform);

  const exclude = () => (hideKnown ? [...knownHandles, ...added] : [...added]);

  async function run(q = query, onPlatform = platform) {
    const text = q.trim();
    if (!text || busy) return;
    setQuery(text);
    setBusy("search"); setError(null); setWarnings([]); setResults([]); setSearch(null);
    try {
      const r = await FinderAPI.search({ query: text, filters: { platform: onPlatform, sizes, hasEmail, location }, exclude: exclude() });
      const key = JSON.stringify([onPlatform, ...JSON.parse(filterKey).slice(1)]);
      setSearch({ sessionId: r.sessionId, query: r.query, expanded: r.expanded, hasMore: r.hasMore, used: key, platform: onPlatform });
      setResults(r.results); setWarnings(r.warnings || []); setSpent({ batch: r.spent, total: r.totalSpent }); setUsage(r.usage);
    } catch (e) {
      setError(e.body?.error || e.message);
    } finally { setBusy(null); }
  }

  async function runLookup() {
    const links = linksText.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    if (!links.length || busy) return;
    setBusy("lookup"); setError(null); setLookup(null);
    try {
      const r = await FinderAPI.lookup(links);
      setLookup(r); setUsage(r.usage);
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
    const pf = platformInfo(r.platform);
    try {
      // The photo goes as bytes: the finder keeps its own copy, and platform
      // CDN links (TikTok's especially) expire within days.
      const avatarImage = await photoDataUri(FinderAPI.avatarUrl(r));
      const created = await CreatorsAPI.create({
        name: r.fullName || r.username,
        handle: `@${r.username}`,
        platform: pf.directory,
        igUrl: r.profileUrl || r.igUrl,   // the profile link on any platform (see profileUrl in lib/campaign.js)
        followers: fmtCompact(r.followers),
        niche: search?.expanded?.niches?.join(", ") || search?.query || "",
        ...(r.publicEmail ? { personalDetails: { email: r.publicEmail } } : {}),
        ...(avatarImage ? { avatarImage } : {}),
        // Everything the finder knows, kept on the creator under
        // socials.<platform> (backend routes/creators.js).
        discovery: discoveryOf(r, r.why?.via === "profile link" ? null : search),
      });
      setAdded((s) => new Set(s).add(r.username));
      if (created?.linked) {
        const was = created.existing?.platform;
        onToast?.(`@${r.username} was already in the directory${was ? ` (${was})` : ""} — saved their ${pf.label} details to it`);
      } else {
        onCreated?.(created);
        onToast?.(`${r.fullName || r.username} added to the directory as a ${pf.directory} creator`);
      }
    } catch (e) {
      if (e.status === 409) {
        const existing = e.body?.existing?.platform || "";
        if (existing && existing.toLowerCase() !== pf.directory.toLowerCase()) {
          setTaken((m) => new Map(m).set(r.username, existing));
          onToast?.(`@${r.username} is already in the directory as a ${existing} creator — same handle, same entry`);
        } else { setAdded((s) => new Set(s).add(r.username)); onToast?.("Already in the directory"); }
      }
      else onToast?.(`Couldn't add: ${e.body?.error || e.message}`);
    } finally { setAdding(null); }
  }
  // "In directory · Instagram" when the handle is there under another platform.
  const knownAs = (r) => {
    const p = taken.get(r.username) ?? (knownHandles.has(r.username) ? knownPlatform.get(r.username) : null);
    if (p == null) return false;
    return p && p.toLowerCase() !== platformInfo(r.platform).directory.toLowerCase() ? p : true;
  };

  const shown = hideKnown ? results.filter((r) => !knownHandles.has(r.username)) : results;

  if (!FinderAPI.configured) {
    return <Notice>The creator finder service isn't connected yet. Set <code>VITE_FINDER_URL</code> (and <code>VITE_FINDER_KEY</code>) for this app, then reload.</Notice>;
  }

  const usageLine = usage && (() => {
            // Instagram spends HikerAPI requests; YouTube/TikTok spend SocialKit credits.
            const sk = platform !== "instagram";
            const used = sk ? usage.socialkit?.credits ?? 0 : usage.calls;
            const cap = sk ? usage.socialkit?.limit ?? 0 : usage.limit;
            return (
              <span data-testid="usage" style={{ marginLeft: "auto", fontSize: 10, color: cap && used / cap > 0.85 ? T.amber : T.label }}
                title={sk ? "SocialKit credits the finder spent today on YouTube and TikTok (resets midnight UTC)" : "Instagram requests made by the finder today (resets midnight UTC)"}>
                Today: {used.toLocaleString("en-IN")} / {cap.toLocaleString("en-IN")} {sk ? "SocialKit credits" : "requests"}
              </span>
            );
          })();

  return (
    <div>
      <style>{`.fc-card{transition:transform .18s ease, box-shadow .18s ease}.fc-card:hover{transform:translateY(-2px);box-shadow:${T.shadowLg}}@keyframes fc-spin{to{transform:rotate(360deg)}}`}</style>

      {/* Search panel */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 18px 14px", boxShadow: T.shadow, marginBottom: 18 }}>
        {/* Platform — switching only changes where the NEXT search goes; nothing
            runs (or spends credits) until Find creators / Look up is pressed. */}
        <div role="tablist" aria-label="Platform" style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 9, background: T.raised, border: `1px solid ${T.border}`, marginBottom: 12 }}>
          {FINDER_PLATFORMS.map((p) => {
            const on = platform === p.id, off = available[p.id] === false;
            return (
              <button key={p.id} type="button" role="tab" aria-selected={on} data-testid={`platform-${p.id}`}
                title={off ? `${p.label} isn't set up on the finder service yet (needs a SocialKit key)` : p.linkOnly ? `Look up ${p.label} profiles from their links` : `Find ${p.label} creators`}
                onClick={() => { if (on || busy) return; setPlatform(p.id); }}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 7, border: "none", cursor: busy ? "default" : "pointer",
                  background: on ? T.surface : "transparent", boxShadow: on ? T.shadow : "none", color: on ? T.text : off ? T.label : T.sub,
                  fontSize: 11.5, fontWeight: on ? 600 : 500, fontFamily: "'Sora'", opacity: off ? 0.6 : 1 }}>
                <PlatformLogo platform={p.id} size={14} style={{ opacity: on ? 1 : 0.75, filter: on ? "none" : "saturate(.6)" }} />
                {p.label}
              </button>
            );
          })}
        </div>
        {/* How: by niche (not on link-only platforms), from profile links, or a content tool. */}
        <div style={{ display: "inline-flex", gap: 16, marginLeft: 14, verticalAlign: "top", paddingTop: 9 }}>
          {[...(pf.linkOnly ? [] : [["search", "Search by niche", Search]]), ["links", "Paste profile links", Link2], ["tools", "Content tools", Wand2]].map(([id, label, Icon]) => {
            const on = id === "tools" ? toolsMode : id === "links" ? linkMode : !toolsMode && !linkMode;
            return (
              <button key={id} type="button" data-testid={`mode-${id}`} onClick={() => setMode(id)}
                title={id === "tools" ? "Transcripts, AI summaries, post numbers, comments, downloads…" : undefined}
                style={{ background: "none", border: "none", padding: "0 0 3px", cursor: "pointer", fontFamily: "'Sora'", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5,
                  color: on ? T.text : T.label, fontWeight: on ? 600 : 400, borderBottom: `2px solid ${on ? T.accent : "transparent"}` }}>
                <Icon size={11} />{label}
                {id === "tools" && <span style={{ fontSize: 8, fontWeight: 700, color: T.green, border: `1px solid ${T.green}40`, borderRadius: 20, padding: "0 5px", letterSpacing: ".05em" }}>NEW</span>}
              </button>
            );
          })}
        </div>
        {toolsMode ? (
          <div style={{ marginTop: 6 }}>
            <ContentTools platform={platform} onToast={onToast}
              renderCreators={(list) => (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
                  {list.map((r) => <ResultCard key={r.id} r={r} known={knownAs(r)} added={added.has(r.username)} adding={adding === r.id}
                    onAdd={canEdit ? () => addToDirectory(r) : undefined} />)}
                </div>
              )} />
          </div>
        ) : linkMode ? (
          <div>
            {pf.linkOnly && (
              <div style={{ fontSize: 11, color: T.sub, marginBottom: 8, lineHeight: 1.5 }}>
                {pf.label} can't be searched by niche (SocialKit has no search for it). Paste the profile links of the creators you want — the finder fetches each profile and you can add them to the directory.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <textarea data-testid="links-input" value={linksText} onChange={(e) => setLinksText(e.target.value)} rows={4}
                placeholder={`One profile link per line (up to 20) — e.g.\n${LINK_EXAMPLES[platform] || LINK_EXAMPLES.instagram}`}
                style={{ flex: 1, boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.borderMid}`, resize: "vertical",
                  background: T.raised, color: T.text, fontSize: 12, fontFamily: "'Sora'", outline: "none", lineHeight: 1.6 }} />
              <button type="button" data-testid="links-go" onClick={runLookup} disabled={!linksText.trim() || !!busy} style={{
                padding: "0 20px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 12.5, fontWeight: 600,
                fontFamily: "'Sora'", cursor: linksText.trim() && !busy ? "pointer" : "default", opacity: linksText.trim() && !busy ? 1 : 0.5,
                display: "inline-flex", alignItems: "center", gap: 7, alignSelf: "flex-start", height: 42,
              }}>
                {busy === "lookup" ? <Loader2 size={14} style={{ animation: "fc-spin 1s linear infinite" }} /> : <Search size={14} />}
                Look up profiles
              </button>
            </div>
            <div style={{ fontSize: 10, color: T.label, marginTop: 6 }}>
              Any platform's links work here — Instagram, YouTube, TikTok, Facebook, X and LinkedIn can be mixed. A profile looked up before comes back free.
              <span style={{ float: "right" }}>{usageLine}</span>
            </div>
          </div>
        ) : <>
        <form onSubmit={(e) => { e.preventDefault(); run(); }} style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={15} color={T.label} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // Searching costs credits, so it only ever starts from the button.
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
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
            {busy === "search" ? <Loader2 size={14} style={{ animation: "fc-spin 1s linear infinite" }} /> : <UserRoundSearch size={14} />}
            Find creators
          </button>
        </form>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
          {niches.map((n) => (
            <button key={n} type="button" title={`Use “${n}” — then press Find creators`}
              onClick={() => { setQuery(n); inputRef.current?.focus(); }}
              style={chip(query.trim().toLowerCase() === n.toLowerCase())}>{n}</button>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${T.border}` }}>
          <span style={{ fontSize: 9.5, color: T.label, textTransform: "uppercase", letterSpacing: ".08em", marginRight: 2 }}>Location</span>
          <LocationFilter tree={placeTree} value={place} onChange={setPlace} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 10 }}>
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
          {usageLine}
        </div>
        {location && (
          <div style={{ fontSize: 10.5, color: T.label, marginTop: 8 }}>
            Only creators with evidence of <strong style={{ color: T.sub }}>{locationLabel || location}</strong>: {platform === "instagram"
              ? "their bio or profile city, posts tagged there, or its hashtags. Instagram doesn't share where creators live"
              : `their ${pf.label === "YouTube" ? "channel description" : "bio"} or the place's hashtags. ${pf.label} doesn't share where creators live`}, so this finds fewer creators per search.
          </div>
        )}
        {search && search.used !== filterKey && (
          <div style={{ fontSize: 10.5, color: T.label, marginTop: 8 }}>Changes apply to the next search — press Find creators to run it.</div>
        )}
        </>}
      </div>

      {linkMode && !toolsMode && <LookupResults lookup={lookup} busy={busy === "lookup"} error={error} knownAs={knownAs} added={added} adding={adding}
        onAdd={canEdit ? addToDirectory : undefined} />}

      {!linkMode && !toolsMode && <>
      {/* Search summary */}
      {search && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 14, fontSize: 11, color: T.sub }}>
          <span>Looking for <strong style={{ color: T.text }}>{search.expanded?.niches?.join(" + ") || search.query}</strong> creators on <strong style={{ color: platformInfo(search.platform).color, display: "inline-flex", alignItems: "center", gap: 4, verticalAlign: -2 }}><PlatformLogo platform={search.platform} size={12} />{platformInfo(search.platform).label}</strong>
            {search.expanded?.location && <> in <strong style={{ color: T.text }}>{search.expanded.location}</strong></>}</span>
          {search.expanded?.hashtags?.slice(0, 6).map((h) => <Pill key={h} color={T.label}>#{h}</Pill>)}
          <span style={{ marginLeft: "auto", color: T.label }}>
            {shown.length} shown{spent ? ` · this batch used ${spent.batch} ${search.platform && search.platform !== "instagram" ? "credit" : "request"}${spent.batch === 1 ? "" : "s"}${spent.batch === 0 ? " (from saved creators)" : ""}` : ""}
          </span>
        </div>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {warnings.map((w) => <div key={w} style={{ fontSize: 10.5, color: T.amber, marginBottom: 6 }}>{w}</div>)}

      {!search && !busy && !error && (
        <Notice tone="empty">
          Search any niche — {platform === "youtube" ? "the finder looks through YouTube videos and Shorts and checks each channel's description"
            : platform === "tiktok" ? "the finder looks through TikTok videos and niche hashtags and checks each creator's bio"
            : "the finder looks through Instagram accounts, reels and niche hashtags, and checks each bio"}.
          Creators it has seen before come back instantly and for free.
        </Notice>
      )}
      {busy === "search" && <Notice>Searching {pf.label} for “{query}”… the first search in a new niche takes 20–60 seconds.</Notice>}
      {search && !busy && shown.length === 0 && !error && (
        <Notice tone="empty">No creators matched. Try a broader word (“fitness” instead of “crossfit coach”) or remove a filter.</Notice>
      )}

      {shown.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
          {shown.map((r) => (
            <ResultCard key={r.id} r={r}
              known={knownAs(r)}
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
      </>}
    </div>
  );
}

/** Profiles looked up from pasted links, plus the links that couldn't be read. */
function LookupResults({ lookup, busy, error, knownAs, added, adding, onAdd }) {
  if (error) return <Notice tone="error">{error}</Notice>;
  if (busy) return <Notice>Looking up the profiles…</Notice>;
  if (!lookup) return <Notice tone="empty">Paste profile links and press Look up profiles. Every detail the platform gives is kept, and saved to the directory when you add them.</Notice>;
  return (
    <div>
      <div style={{ fontSize: 11, color: T.sub, marginBottom: 10 }}>
        {lookup.results.length} profile{lookup.results.length === 1 ? "" : "s"} found
        {lookup.spent ? ` · used ${lookup.spent} credit${lookup.spent === 1 ? "" : "s"}` : " · from saved profiles"}
      </div>
      {lookup.errors?.map((e) => (
        <div key={e.link} style={{ fontSize: 10.5, color: T.amber, marginBottom: 4 }}>{e.link} — {e.error}</div>
      ))}
      {lookup.results.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14, marginTop: 8 }}>
          {lookup.results.map((r) => (
            <ResultCard key={r.id} r={r} known={knownAs(r)} added={added.has(r.username)} adding={adding === r.id}
              onAdd={onAdd ? () => onAdd(r) : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}
