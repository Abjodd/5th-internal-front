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

      {/* Header band — compact white glass design */}
      <Reveal className="as-library-header">
        <style>{`
          .as-library-header {
            position: relative;
            isolation: isolate;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
            width: 100%;
            box-sizing: border-box;
            min-height: 82px;
            padding: 11px 13px;
            margin-bottom: 16px;
            overflow: hidden;
            border: 1px solid #D9E2EE;
            border-radius: 17px;
            color: #172B49;
            background: linear-gradient(115deg, rgba(255,255,255,.98) 0%, rgba(246,249,253,.97) 64%, rgba(237,244,251,.96) 100%);
            box-shadow: 0 7px 22px rgba(27, 48, 77, .07), 0 1px 3px rgba(27,48,77,.04), inset 0 1px 0 rgba(255,255,255,.98);
          }
          .as-library-header::before {
            content: "";
            position: absolute;
            z-index: -1;
            pointer-events: none;
            width: 340px;
            height: 180px;
            top: -104px;
            left: 25%;
            transform: rotate(-28deg);
            background: linear-gradient(90deg, transparent, rgba(213,229,249,.28), transparent);
          }
          .as-library-intro {
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 220px;
            padding-left: 4px;
          }
          .as-library-icon {
            width: 39px;
            height: 39px;
            flex: 0 0 39px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(255,255,255,.95);
            border-radius: 12px;
            color: #23548D;
            background: linear-gradient(145deg, #EAF2FF, #DDE9FA);
            box-shadow: 0 3px 9px rgba(40,78,125,.08), inset 0 1px 0 #fff;
          }
          .as-library-copy { min-width: 0; }
          .as-library-eyebrow {
            color: #627B9D;
            font-size: 8px;
            line-height: 1.3;
            font-weight: 800;
            letter-spacing: .15em;
            text-transform: uppercase;
            white-space: nowrap;
          }
          .as-library-title {
            margin-top: 2px;
            color: #142947;
            font-family: 'Newsreader', Georgia, serif;
            font-size: 23px;
            font-weight: 650;
            font-style: italic;
            line-height: 1.08;
            white-space: nowrap;
          }
          .as-library-divider {
            width: 1px;
            align-self: stretch;
            min-height: 30px;
            margin: 0 2px;
            background: #D8E2EE;
          }
          .as-library-hint {
            color: #687D99;
            font-size: 10px;
            line-height: 1.5;
            white-space: nowrap;
          }
          .as-library-stats {
            display: grid;
            grid-template-columns: repeat(4, minmax(74px, 1fr)) minmax(78px, 1fr);
            gap: 7px;
            align-items: stretch;
            margin-left: auto;
            min-width: 0;
          }
          .as-library-stat {
            display: flex;
            flex-direction: column;
            justify-content: center;
            min-width: 0;
            padding: 7px 10px 6px;
            border: 1px solid #E1E9F3;
            border-radius: 11px;
            background: rgba(255,255,255,.58);
            box-shadow: inset 0 1px 0 rgba(255,255,255,.9);
          }
          .as-library-stat-label {
            display: flex;
            align-items: center;
            gap: 4px;
            color: #70819A;
            font-size: 7px;
            line-height: 1.3;
            font-weight: 800;
            letter-spacing: .08em;
            text-transform: uppercase;
            white-space: nowrap;
          }
          .as-library-stat-label svg { flex: 0 0 auto; }
          .as-library-stat-value {
            margin-top: 4px;
            color: #172B49;
            font-size: 16px;
            font-weight: 800;
            line-height: 1;
            letter-spacing: -.035em;
            white-space: nowrap;
          }
          .as-library-stat--er {
            border-color: #CBE8E7;
            background: linear-gradient(145deg, #F0FBFA, #E5F5F5);
          }
          .as-library-stat--er .as-library-stat-label { color: #338F88; }
          .as-library-stat--er .as-library-stat-value { color: #155E63; }
          @media (max-width: 980px) {
            .as-library-header { align-items: stretch; flex-direction: column; gap: 10px; padding: 12px; }
            .as-library-intro { min-width: 0; }
            .as-library-stats { width: 100%; margin-left: 0; }
            .as-library-hint { white-space: normal; }
          }
          @media (max-width: 520px) {
            .as-library-header { border-radius: 14px; }
            .as-library-intro { gap: 9px; }
            .as-library-icon { width: 34px; height: 34px; flex-basis: 34px; }
            .as-library-title { font-size: 21px; }
            .as-library-divider { display: none; }
            .as-library-hint { display: none; }
            .as-library-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
            .as-library-stat { padding: 8px; }
            .as-library-stat-value { font-size: 16px; }
            .as-library-stat--er { grid-column: span 2; }
          }
        `}</style>

        <div aria-hidden style={{ position: "absolute", zIndex: -1, right: "30%", top: -85, width: 240, height: 170, borderRadius: "50%", background: "radial-gradient(circle, rgba(219,232,249,.28), transparent 70%)", pointerEvents: "none" }} />

        <div className="as-library-intro">
          <div className="as-library-icon" aria-hidden="true">
            <Film size={17} strokeWidth={1.8} />
          </div>
          <div className="as-library-copy">
            <div className="as-library-eyebrow">Reel library</div>
            <div className="as-library-title">
              <CountUp value={fetched.length} /> reel{fetched.length === 1 ? "" : "s"}{filtered ? " in view" : ""}
            </div>
          </div>
          <div className="as-library-divider" />
          <div className="as-library-hint">
            Hover any reel to play it.{failed.length > 0 && ` ${failed.length} link${failed.length === 1 ? "" : "s"} couldn't be fetched — shown at the end.`}
          </div>
        </div>

        <div className="as-library-stats">
          {[[Eye, "Views", totals.views], [Heart, "Likes", totals.likes], [MessageCircle, "Comments", totals.comments], [Share2, "Shares", totals.shares]].map(([Icon, label, v]) => (
            <div className="as-library-stat" key={label}>
              <div className="as-library-stat-label"><Icon size={10} strokeWidth={1.8} /> {label}</div>
              <div className="as-library-stat-value"><CountUp value={v} format={compact} /></div>
            </div>
          ))}
          <div className="as-library-stat as-library-stat--er">
            <div className="as-library-stat-label"><svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 9.5V6.8M5 9.5V4.5M8 9.5V2.5M10.5 9.5H1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> Avg ER</div>
            <div className="as-library-stat-value">{totals.er != null ? <CountUp value={totals.er} format={n => `${n.toFixed(1)}%`} /> : "—"}</div>
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
