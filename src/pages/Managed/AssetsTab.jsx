/**
 * 5th Avenue — Managed Creators → Assets
 * ─────────────────────────────────────────────────────────────────
 * Every reel a managed creator's brand deal has produced, as an immersive
 * library: full-bleed 9:16 tiles that play the real reel on hover, ranked
 * badges for the top three, and the biggest reel featured at double size.
 *
 * Source is the HikerAPI snapshot already on each deal's Project document
 * (`media`, see models/Project.js), kept fresh by the nightly job in
 * trendingReels.js. Video plays only while its signed URL is still valid
 * (videoExpiresAt — see fx.jsx ReelMedia); otherwise the still is shown.
 * Links that couldn't be fetched are still listed, at the end, marked as
 * such — never silently dropped.
 */
import { useMemo, useState } from "react";
import { Eye, Heart, MessageCircle, Share2, Play, Flame, ExternalLink, Film } from "lucide-react";
import { T } from "../../theme/tokens";
import { fmtCompact } from "../../lib/format";
import { Select, Notice } from "../Creators/shared";
import CreatorAvatar from "../../components/CreatorAvatar";
import BrandLogo from "../../components/BrandLogo";
import { DARK_SURFACE, FX_CSS, CountUp, Reveal, ReelMedia, canPlayReel, reelHref } from "./fx";

const compact = (n) => fmtCompact(Math.round(n));

const ASSET_CSS = `
  .as-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); grid-auto-flow: dense; }
  @media (min-width: 820px) { .as-feature { grid-column: span 2; grid-row: span 2; } }
`;

const SORTS = [
  { id: "views", label: "Most viewed", key: d => d.media?.views || 0 },
  { id: "er", label: "Highest ER", key: d => d.media?.er ?? -1 },
  { id: "likes", label: "Most liked", key: d => d.media?.likes || 0 },
  { id: "newest", label: "Newest", key: d => Date.parse(d.media?.takenAt || d.createdAt || 0) || 0 },
];

const RANK = ["#E8B931", "#C9CED6", "#D49A6A"]; // gold / silver / bronze

function ReelTile({ d, creator, rank, featured, i }) {
  const [hover, setHover] = useState(false);
  const m = d.media?.ok ? d.media : null;
  const href = reelHref(d);
  const playable = canPlayReel(d.media);

  return (
    <Reveal i={i} as="a" href={href || undefined} target="_blank" rel="noreferrer"
      className={`fx-zoom fx-lift${featured ? " as-feature" : ""}`}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position: "relative", display: "block", borderRadius: featured ? 22 : 16, overflow: "hidden", textDecoration: "none", color: "#FFF", boxShadow: T.shadow, minHeight: 0 }}>
      {/* aspect-ratio sizes the tile; height:100% then fills the cell when
          the double-size featured reel stretches its rows — no dark strip. */}
      <div style={{ position: "relative", width: "100%", aspectRatio: "9 / 16", height: "100%" }}>
        <ReelMedia deal={d} hovered={hover} fill />
      </div>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.86) 100%)" }} />

      {/* top row */}
      <div style={{ position: "absolute", top: 10, left: 10, right: 10, display: "flex", alignItems: "flex-start", gap: 6 }}>
        {d.brand && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.94)", borderRadius: 20, padding: "3px 10px 3px 3px", minWidth: 0, maxWidth: "75%" }}>
            <BrandLogo brand={d.brand} website={d.brandWebsite} size={featured ? 26 : 20} />
            <span style={{ fontSize: featured ? 12 : 10, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.brand}</span>
          </div>
        )}
        <span style={{ flex: 1 }} />
        {rank != null ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: featured ? 12 : 10.5, fontWeight: 800, color: "#14151A", background: RANK[rank], padding: featured ? "4px 10px" : "3px 8px", borderRadius: 20, boxShadow: "0 4px 14px rgba(0,0,0,0.35)" }}>
            {rank === 0 && <Flame size={featured ? 13 : 11} />}#{rank + 1}
          </span>
        ) : m?.duration ? (
          <span style={{ fontSize: 9.5, fontWeight: 600, background: "rgba(0,0,0,0.55)", padding: "2px 7px", borderRadius: 6 }}>{Math.round(m.duration)}s</span>
        ) : null}
      </div>

      {/* play hint */}
      {playable && (
        <div className="fx-hover-hide" style={{ position: "absolute", left: "50%", top: "46%", transform: "translate(-50%,-50%)", width: featured ? 64 : 44, height: featured ? 64 : 44, borderRadius: "50%", background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.35)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <Play size={featured ? 24 : 16} fill="#FFF" color="#FFF" style={{ marginLeft: 3 }} />
        </div>
      )}

      {/* bottom */}
      <div style={{ position: "absolute", left: 12, right: 12, bottom: 12 }}>
        {featured && m?.caption && (
          <div className="fx-hover-show" style={{ fontFamily: "'Newsreader',serif", fontStyle: "italic", fontSize: 14, lineHeight: 1.4, color: "rgba(255,255,255,0.9)", marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            “{m.caption}”
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ borderRadius: "50%", padding: 2, background: "rgba(255,255,255,0.9)", flexShrink: 0 }}>
            <CreatorAvatar creator={creator || { name: d.creatorName }} size={featured ? 34 : 24} radius={featured ? 17 : 12} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: featured ? 15 : 11.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.creatorName || "—"}</div>
            <div style={{ fontSize: featured ? 11 : 9, color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.creatorHandle || ""}</div>
          </div>
        </div>
        {m ? (
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: featured ? 14 : 9, marginTop: 9, fontSize: featured ? 13 : 10.5, fontWeight: 600 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Eye size={featured ? 14 : 11} /> {fmtCompact(m.views)}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Heart size={featured ? 14 : 11} /> {fmtCompact(m.likes)}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><MessageCircle size={featured ? 14 : 11} /> {fmtCompact(m.comments)}</span>
            {featured && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Share2 size={14} /> {fmtCompact(m.forwards)}</span>}
            {m.er != null && <span style={{ marginLeft: "auto", fontSize: featured ? 11 : 9.5, fontWeight: 700, background: "rgba(255,255,255,0.92)", color: "#14151A", padding: "2px 8px", borderRadius: 10 }}>ER {m.er}%</span>}
          </div>
        ) : (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 9, fontSize: 10, color: "rgba(255,255,255,0.75)" }}>
            <ExternalLink size={11} /> Open link
          </div>
        )}
      </div>
    </Reveal>
  );
}

export default function AssetsTab({ creators, deals, dealsLoading }) {
  const [brandFilter, setBrandFilter] = useState("");
  const [creatorFilter, setCreatorFilter] = useState("");
  const [sort, setSort] = useState("views");

  const creatorById = useMemo(() => new Map(creators.map(c => [c.id, c])), [creators]);
  const withLinks = useMemo(() => deals.filter(d => d.url), [deals]);
  const brands = useMemo(() => [...new Set(withLinks.map(d => d.brand).filter(Boolean))].sort(), [withLinks]);

  const { fetched, failed } = useMemo(() => {
    const rows = withLinks.filter(d =>
      (!brandFilter || d.brand === brandFilter) && (!creatorFilter || d.creatorId === creatorFilter));
    const key = SORTS.find(s => s.id === sort).key;
    return {
      fetched: rows.filter(d => d.media?.ok).sort((a, b) => key(b) - key(a)),
      failed: rows.filter(d => !d.media?.ok),
    };
  }, [withLinks, brandFilter, creatorFilter, sort]);

  const totals = useMemo(() => {
    const t = { views: 0, likes: 0, comments: 0, shares: 0 };
    const ers = [];
    fetched.forEach(d => {
      t.views += d.media.views || 0; t.likes += d.media.likes || 0;
      t.comments += d.media.comments || 0; t.shares += d.media.forwards || 0;
      if (d.media.er != null) ers.push(Number(d.media.er));
    });
    t.er = ers.length ? ers.reduce((s, v) => s + v, 0) / ers.length : null;
    return t;
  }, [fetched]);

  const ranked = sort === "views";
  const featureFirst = ranked && fetched.length >= 4;
  const tiles = [...fetched, ...failed];
  const filtered = !!(brandFilter || creatorFilter);

  const sortBtn = (active) => ({
    padding: "6px 12px", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: "'Sora'", fontWeight: 500,
    background: active ? T.surface : "transparent", color: active ? T.accent : T.sub, boxShadow: active ? T.shadow : "none", whiteSpace: "nowrap",
  });

  return (
    <div>
      <style>{FX_CSS + ASSET_CSS}</style>

      {/* Header band */}
      <Reveal style={{ position: "relative", overflow: "hidden", borderRadius: 20, background: DARK_SURFACE, color: "#FFF", padding: "24px 28px", marginBottom: 16, display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 22 }}>
        <div aria-hidden style={{ position: "absolute", left: -100, top: -160, width: 400, height: 400, borderRadius: "50%", background: `radial-gradient(circle, ${T.pink}4D, transparent 65%)`, pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>
            <Film size={13} /> Reel library
          </div>
          <div style={{ fontFamily: "'Newsreader',serif", fontStyle: "italic", fontSize: 30, fontWeight: 600, marginTop: 6, lineHeight: 1.1 }}>
            <CountUp value={fetched.length} /> reel{fetched.length === 1 ? "" : "s"}{filtered ? " in view" : ""}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
            Hover any reel to play it.{failed.length > 0 && ` ${failed.length} link${failed.length === 1 ? "" : "s"} couldn't be fetched — shown at the end.`}
          </div>
        </div>
        <div style={{ position: "relative", display: "flex", flexWrap: "wrap", gap: 10 }}>
          {[[Eye, "Views", totals.views], [Heart, "Likes", totals.likes], [MessageCircle, "Comments", totals.comments], [Share2, "Shares", totals.shares]].map(([Icon, label, v]) => (
            <div key={label} style={{ minWidth: 92, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 13px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.08em" }}><Icon size={11} /> {label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 3 }}><CountUp value={v} format={compact} /></div>
            </div>
          ))}
          <div style={{ minWidth: 92, background: "rgba(255,255,255,0.92)", color: "#14151A", borderRadius: 12, padding: "10px 13px" }}>
            <div style={{ fontSize: 9, color: T.sub, textTransform: "uppercase", letterSpacing: "0.08em" }}>Avg ER</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 3 }}>{totals.er != null ? <CountUp value={totals.er} format={n => `${n.toFixed(1)}%`} /> : "—"}</div>
          </div>
        </div>
      </Reveal>

      {/* Toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ display: "inline-flex", padding: 3, borderRadius: 8, background: T.mute, flexWrap: "wrap" }}>
          {SORTS.map(s => <button type="button" key={s.id} style={sortBtn(sort === s.id)} onClick={() => setSort(s.id)}>{s.label}</button>)}
        </div>
        <span style={{ flex: 1 }} />
        <Select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}>
          <option value="">All brands</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </Select>
        <Select value={creatorFilter} onChange={e => setCreatorFilter(e.target.value)}>
          <option value="">All creators</option>
          {creators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      {dealsLoading ? (
        <Notice>Loading reels…</Notice>
      ) : tiles.length === 0 ? (
        <Notice tone="empty">
          {filtered ? "No reels match those filters." : "No reels attached to a deal yet — add a reel link from the Campaigns tab or a creator's own card."}
        </Notice>
      ) : (
        <div className="as-grid">
          {tiles.map((d, i) => (
            <ReelTile key={d.id} i={i} d={d} creator={creatorById.get(d.creatorId)}
              rank={ranked && d.media?.ok && i < 3 ? i : null}
              featured={featureFirst && i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}
