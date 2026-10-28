/**
 * 5th Avenue — Managed Creators → Creators
 * ─────────────────────────────────────────────────────────────────
 * The roster of creators we manage directly (managedBy === "fifthavenue",
 * see lib/management.js), redesigned from the ground up around two ideas:
 *
 *   1. The grid is for SCANNING. Each card is a big portrait photo with the
 *      name over it and three numbers under it — nothing that has to be
 *      read to be recognised. No inline expansion, so a card is always the
 *      same size.
 *   2. Detail lives in a DRAWER. Clicking a card slides a panel in from the
 *      right holding the full CreatorDetail (onboarding & billing, campaigns,
 *      agreements, invoices, brand deals) — the exact component the main
 *      Creators directory uses, so the record reads and edits identically
 *      from either page. Prev/next (buttons or ← →) walks the filtered
 *      roster without closing it.
 *
 * Only real fields are shown: no verified badges, bios or invented
 * categories. `niche` is one free-text field, split on commas/slashes into
 * tags. The "Managed by Fifth Avenue" pill is left off the cards (every
 * card on this tab is) and shown once in the drawer, next to the vendor a
 * creator is paid through when one is set — vendorId is independent of
 * managedBy, so both can be true at once.
 *
 * The one thing this tab adds beyond the directory: adding a brand-new
 * creator with no campaign behind them (CreatorsAPI.create).
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  MapPin,
} from "lucide-react";
import { AddCreatorModal } from "../Campaigns";
import { CreatorDetail } from "../Creators";
import { Pill, Select, INP, Notice } from "../Creators/shared";
import CreatorAvatar from "../../components/CreatorAvatar";
import CreatorHandle from "../../components/CreatorHandle";
import { CreatorsAPI } from "../../lib/api";
import { fmtCompact, initials } from "../../lib/format";
import { T } from "../../theme/tokens";

// ── helpers ──────────────────────────────────────────────────────────────────
// Same parse as SummaryTab's local copy: "820K" / "1.2M" / "8,20,000" → count.
function parseFollowersLoose(raw) {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const m = /^([\d.]+)\s*(K|M)?$/i.exec(String(raw).trim().replace(/,/g, ""));
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return 0;
  const unit = (m[2] || "").toUpperCase();
  return unit === "M" ? n * 1e6 : unit === "K" ? n * 1e3 : n;
}

const nicheTags = (niche) =>
  String(niche || "")
    .split(/[,/]+/)
    .map((s) => s.trim())
    .filter(Boolean);

const isTyping = (el) =>
  !!el &&
  (el.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

const CSS = `
  .mc-card {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 255 / 410;
    min-width: 0;
    padding: 0;
    overflow: hidden;
    isolation: isolate;
    border: 0;
    border-radius: 18px;
    background: #1B2548;
    box-shadow: 0 2px 6px rgba(27, 37, 72, .12);
    cursor: pointer;
    text-align: left;
    color: #fff;
    transform: translateY(0);
    transition: transform .35s cubic-bezier(.2,.7,.2,1),
                box-shadow .35s cubic-bezier(.2,.7,.2,1);
  }

  .mc-card:hover,
  .mc-card:focus-within {
    transform: translateY(-4px);
    box-shadow: 0 22px 40px -20px rgba(15,22,48,.6);
  }

  .mc-card:focus-visible {
    outline: 2px solid #fff;
    outline-offset: -4px;
    box-shadow: 0 0 0 2px #1B2548, 0 0 0 4px #fff;
  }

  .mc-card__photo,
  .mc-card__fallback {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .mc-card__photo {
    display: block;
    object-fit: cover;
    object-position: center 25%;
    transform: scale(1);
    transition: transform .7s cubic-bezier(.2,.7,.2,1);
  }

  .mc-card:hover .mc-card__photo,
  .mc-card:focus-within .mc-card__photo {
    transform: scale(1.05);
  }

  .mc-card__fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1B2548;
    color: #fff;
    font: 600 42px/1 system-ui, sans-serif;
    letter-spacing: .04em;
  }

  .mc-card__gradient {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      180deg,
      rgba(14,20,44,0) 38%,
      rgba(14,20,44,.72) 66%,
      rgba(14,20,44,.94) 100%
    );
  }

  .mc-card__platform {
    position: absolute;
    top: 14px;
    left: 14px;
    max-width: calc(100% - 70px);
    overflow: hidden;
    padding: 5px 10px;
    border-radius: 999px;
    background: rgba(14,20,44,.55);
    color: #fff;
    font: 600 10.5px/1.2 system-ui, sans-serif;
    letter-spacing: .1em;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .mc-card__open {
    position: absolute;
    top: 12px;
    right: 14px;
    display: flex;
    width: 34px;
    height: 34px;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #fff;
    color: #1B2548;
    opacity: 0;
    transform: translate(-4px, 4px);
    transition: opacity .3s ease, transform .3s ease;
    pointer-events: none;
  }

  .mc-card:hover .mc-card__open,
  .mc-card:focus-within .mc-card__open {
    opacity: 1;
    transform: none;
  }

  .mc-card__selected {
    position: absolute;
    z-index: 2;
    top: 12px;
    right: 14px;
    display: flex;
    width: 24px;
    height: 24px;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #fff;
    color: #1B2548;
    box-shadow: 0 0 0 2px #1B2548, 0 0 0 4px #fff;
  }

  .mc-card__info {
    position: absolute;
    right: 18px;
    bottom: 18px;
    left: 18px;
    z-index: 1;
    min-width: 0;
    color: #fff;
    font-family: "Hanken Grotesk", system-ui, sans-serif;
  }

  .mc-card__name {
    overflow: hidden;
    font-family: "Instrument Serif", Georgia, serif;
    font-size: 32px;
    font-weight: 400;
    line-height: 1.02;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mc-card__meta {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 5px;
    margin-top: 4px;
    color: rgba(255,255,255,.86);
    font-size: 13px;
    line-height: 1.4;
  }

  .mc-card__handle,
  .mc-card__location {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mc-card__handle {
    min-width: 0;
    flex-shrink: 1;
  }

  .mc-card__location {
    flex-shrink: 1;
  }

  .mc-card__separator {
    flex-shrink: 0;
  }

  .mc-card__tags {
    display: flex;
    min-width: 0;
    gap: 5px;
    margin-top: 8px;
    overflow: hidden;
    white-space: nowrap;
  }

  .mc-card__tag {
    max-width: 48%;
    overflow: hidden;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(255,255,255,.16);
    color: #fff;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mc-card__stats {
    display: grid;
    grid-template-columns: 1.2fr 1fr 1fr;
    gap: 6px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid rgba(255,255,255,.25);
  }

  .mc-card__stat {
    min-width: 0;
  }

  .mc-card__value {
    overflow: hidden;
    color: #fff;
    font-size: 17px;
    font-weight: 600;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .mc-card__label {
    overflow: hidden;
    margin-top: 3px;
    color: rgba(255,255,255,.78);
    font-size: 9px;
    letter-spacing: .12em;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .mc-card-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 24px;
  }

  @media (max-width: 1024px) {
    .mc-card-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 20px;
    }
  }

  @media (max-width: 768px) {
    .mc-card-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }

    .mc-card__info {
      right: 13px;
      bottom: 14px;
      left: 13px;
    }

    .mc-card__name {
      font-size: 27px;
    }

    .mc-card__value {
      font-size: 15px;
    }
  }

  @media (max-width: 520px) {
    .mc-card-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .mc-card {
      aspect-ratio: 4 / 5;
    }

    .mc-card__info {
      right: 18px;
      bottom: 18px;
      left: 18px;
    }

    .mc-card__name {
      font-size: 32px;
    }

    .mc-card__value {
      font-size: 17px;
    }
  }

  @media (hover: none) {
    .mc-card__open {
      opacity: 1;
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mc-card,
    .mc-card__photo,
    .mc-card__open {
      transition: opacity .2s ease;
    }

    .mc-card:hover,
    .mc-card:focus-within {
      transform: none;
    }

    .mc-card:hover .mc-card__photo,
    .mc-card:focus-within .mc-card__photo {
      transform: none;
    }
  }

  @keyframes mc-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes mc-slide {
    from { transform: translateX(28px); opacity: 0; }
    to { transform: none; opacity: 1; }
  }
`;

// ── photo ────────────────────────────────────────────────────────────────────
// Full-bleed photo sized by aspect-ratio, so it fills the card at any grid
// width. Same contract as CreatorAvatar: only requests a photo the record
// says exists, and falls back to initials if the load fails.
function Photo({ inf, ratio = "4 / 5" }) {
  const src = CreatorsAPI.avatarUrl(inf);
  const [broken, setBroken] = useState(null);
  const box = { width: "100%", aspectRatio: ratio, display: "block" };
  if (src && src !== broken) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setBroken(src)}
        style={{ ...box, objectFit: "cover", objectPosition: "center 25%" }}
      />
    );
  }
  return (
    <div
      style={{
        ...box,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(160deg, ${T.pink}1F, ${T.purple}1F)`,
        color: T.pink,
        fontSize: 44,
        fontWeight: 600,
        letterSpacing: "0.02em",
      }}
    >
      {initials(inf?.name)}
    </div>
  );
}

// ── card ─────────────────────────────────────────────────────────────────────
const CardStat = ({ label, value, color = T.text, first }) => (
  <div
    style={{
      flex: 1,
      minWidth: 0,
      paddingLeft: first ? 0 : 10,
      borderLeft: first ? "none" : `1px solid ${T.border}`,
    }}
  >
    <div
      style={{
        fontSize: 14,
        fontWeight: 600,
        color,
        letterSpacing: "-0.01em",
        lineHeight: 1.2,
      }}
    >
      {value}
    </div>
    <div
      style={{
        fontSize: 8,
        color: T.label,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginTop: 3,
      }}
    >
      {label}
    </div>
  </div>
);

function RosterCard({ inf, vendor, onOpen, selected = false }) {
  const tags = nicheTags(inf.niche).slice(0, 2);
  const src = CreatorsAPI.avatarUrl(inf);
  const [broken, setBroken] = useState(null);

  const name = inf?.name || "Unknown creator";
  const rawHandle = String(inf?.handle || "").trim();
  const handle = rawHandle ? `@${rawHandle.replace(/^@+/, "")}` : "";

  const location = inf?.state ? String(inf.state).trim() : "";
  const campaigns = Array.isArray(inf?.campaigns) ? inf.campaigns.length : 0;
  const avgER = inf?.avgER != null && inf.avgER !== "" ? `${inf.avgER}%` : "—";

  const hasPhoto = Boolean(src && src !== broken);

  return (
    <article
      className="cr-card mc-card"
      role="button"
      tabIndex={0}
      aria-label={`Open ${name}`}
      aria-haspopup="dialog"
      aria-pressed={selected}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {hasPhoto ? (
        <img
          className="mc-card__photo"
          src={src}
          alt={name}
          onError={() => setBroken(src)}
        />
      ) : (
        <div className="mc-card__fallback" aria-hidden="true">
          {initials(name)}
        </div>
      )}

      <div className="mc-card__gradient" aria-hidden="true" />

      {inf?.platform && (
        <span className="mc-card__platform">{inf.platform}</span>
      )}

      {selected ? (
        <span className="mc-card__selected" aria-label="Selected creator">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 12 4 4L19 6" />
          </svg>
        </span>
      ) : (
        <span className="mc-card__open" aria-hidden="true">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 17 17 7" />
            <path d="M7 7h10v10" />
          </svg>
        </span>
      )}

      <div className="mc-card__info">
        <div className="mc-card__name" title={name}>
          {name}
        </div>

        {(handle || location) && (
          <div className="mc-card__meta">
            {handle && (
              <span className="mc-card__handle" title={handle}>
                {handle}
              </span>
            )}

            {handle && location && (
              <span className="mc-card__separator" aria-hidden="true">
                ·
              </span>
            )}

            {location && (
              <span className="mc-card__location" title={location}>
                {location}
              </span>
            )}
          </div>
        )}

        {tags.length > 0 && (
          <div className="mc-card__tags" aria-label="Niches">
            {tags.map((tag) => (
              <span key={tag} className="mc-card__tag" title={tag}>
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mc-card__stats">
          <div className="mc-card__stat">
            <div className="mc-card__value">{fmtCompact(inf?.followers)}</div>
            <div className="mc-card__label">Followers</div>
          </div>

          <div className="mc-card__stat">
            <div className="mc-card__value">{avgER}</div>
            <div className="mc-card__label">Avg ER</div>
          </div>

          <div className="mc-card__stat">
            <div
              className="mc-card__value"
              style={{
                color: campaigns > 0 ? "#2DD4A7" : "#FFFFFF",
              }}
            >
              {campaigns}
            </div>
            <div className="mc-card__label">Campaigns</div>
          </div>
        </div>
      </div>
    </article>
  );
}

// ── drawer ───────────────────────────────────────────────────────────────────
const DrawerStat = ({ label, value, color = T.text }) => (
  <div
    style={{
      flex: "1 1 0",
      minWidth: 0,
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      padding: "10px 12px",
    }}
  >
    <div
      style={{ fontSize: 17, fontWeight: 600, color, letterSpacing: "-0.01em" }}
    >
      {value}
    </div>
    <div
      style={{
        fontSize: 8.5,
        color: T.label,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginTop: 3,
      }}
    >
      {label}
    </div>
  </div>
);

const IconBtn = ({ children, disabled, onClick, label }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
    style={{
      width: 30,
      height: 30,
      borderRadius: 8,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "transparent",
      border: `1px solid ${T.border}`,
      color: disabled ? T.label : T.text,
      cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.45 : 1,
    }}
  >
    {children}
  </button>
);

function CreatorDrawer({
  inf,
  vendor,
  vendors,
  position,
  total,
  onPrev,
  onNext,
  onClose,
  canEdit,
  onEdit,
  onAssign,
  onSetManagement,
  onToast,
  keysEnabled,
}) {
  // Esc closes the drawer; arrow keys move between creators unless typing.
  useEffect(() => {
    if (!keysEnabled) return;
    const onKey = (e) => {
      if (isTyping(e.target)) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && onPrev) onPrev();
      else if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keysEnabled, onClose, onPrev, onNext]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const tags = nicheTags(inf.niche);
  const profilePhoto = CreatorsAPI.avatarUrl(inf);
  const followers = fmtCompact(inf.followers);
  const avgER = inf.avgER != null && inf.avgER !== "" ? `${inf.avgER}%` : "—";
  const campaignCount = Array.isArray(inf.campaigns) ? inf.campaigns.length : 0;
  const invoiceCount = Array.isArray(inf.invoices) ? inf.invoices.length : 0;

  return (
    <div className="mc-drawer-root" style={{ position: "fixed", inset: 0, zIndex: 500 }}>
     <style>{`
  .mc-drawer-root {
    font-family: "Hanken Grotesk", system-ui, sans-serif;
  }

  .mc-drawer-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(12,18,38,.48);
    backdrop-filter: blur(9px);
    -webkit-backdrop-filter: blur(9px);
    animation: mc-fade .2s ease;
  }

  .mc-drawer-shell {
    position: absolute;
    top: 2.5vh;
    right: 2.5vw;
    bottom: 2.5vh;
    width: min(1120px, 95vw);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,.72);
    border-radius: 24px;
    background: linear-gradient(
      135deg,
      rgba(239,244,255,.88),
      rgba(249,240,255,.82) 52%,
      rgba(255,247,235,.88)
    );
    box-shadow: 0 30px 100px rgba(10,18,45,.35),
      inset 0 1px 0 rgba(255,255,255,.9);
    backdrop-filter: blur(28px);
    -webkit-backdrop-filter: blur(28px);
    animation: mc-slide .26s cubic-bezier(.2,.7,.2,1);
  }

  .mc-drawer-topbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255,255,255,.72);
    background: rgba(255,255,255,.34);
    flex-shrink: 0;
  }

  .mc-drawer-layout {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 260px minmax(0,1fr);
    gap: 16px;
    padding: 18px;
    overflow: hidden;
    box-sizing: border-box;
  }

  .mc-drawer-profile {
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,.78);
    border-radius: 20px;
    background: linear-gradient(
      160deg,
      rgba(255,255,255,.62),
      rgba(221,230,255,.36)
    );
    box-shadow: 0 10px 30px rgba(64,82,140,.09),
      inset 0 1px 0 rgba(255,255,255,.9);
  }

  .mc-drawer-portrait {
    position: relative;
    min-height: 220px;
    flex: 1;
    overflow: hidden;
    background: linear-gradient(145deg,#c8d7f5,#e7d7f1,#f8e4d5);
  }

  .mc-drawer-portrait img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 25%;
  }

  .mc-drawer-portrait::after {
    content: "";
    position: absolute;
    inset: 20% 0 0;
    background: linear-gradient(
      180deg,
      transparent 5%,
      rgba(12,20,48,.12) 32%,
      rgba(12,20,48,.9) 100%
    );
    pointer-events: none;
  }

  .mc-drawer-portrait-content {
    position: absolute;
    z-index: 1;
    left: 17px;
    right: 17px;
    bottom: 17px;
    color: #fff;
  }

  .mc-drawer-platform {
    display: inline-flex;
    padding: 5px 9px;
    border-radius: 999px;
    background: rgba(17,24,45,.58);
    border: 1px solid rgba(255,255,255,.35);
    font-size: 9px;
    letter-spacing: .09em;
    text-transform: uppercase;
  }

  .mc-drawer-name {
    margin-top: 12px;
    font: 400 32px/1.05 "Instrument Serif", Georgia, serif;
  }

  .mc-drawer-handle {
    margin-top: 5px;
    font-size: 12px;
    color: rgba(255,255,255,.9);
    overflow-wrap: anywhere;
  }

  .mc-drawer-badge {
    display: inline-flex;
    margin-top: 11px;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(224,255,249,.94);
    color: #087f78;
    font-size: 10px;
    font-weight: 700;
    border: 1px solid rgba(255,255,255,.8);
  }

  .mc-drawer-profile-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 12px;
  }

  .mc-drawer-glass-stat {
    padding: 12px 11px;
    border: 1px solid rgba(255,255,255,.76);
    border-radius: 13px;
    background: rgba(255,255,255,.56);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.8);
  }

  .mc-drawer-glass-stat strong {
    display: block;
    color: #172444;
    font-size: 19px;
    line-height: 1.1;
    font-weight: 700;
  }

  .mc-drawer-glass-stat span {
    display: block;
    margin-top: 5px;
    color: #77819a;
    font-size: 9px;
    letter-spacing: .09em;
    text-transform: uppercase;
  }

  .mc-drawer-profile-footer {
    padding: 0 12px 12px;
  }

  .mc-drawer-instagram {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    width: 100%;
    padding: 10px;
    border: 1px solid rgba(255,255,255,.75);
    border-radius: 12px;
    color: #35476c;
    background: rgba(255,255,255,.5);
    font-size: 11px;
    box-sizing: border-box;
  }

  /* RIGHT CONTENT: outer spacing */
  .mc-drawer-content {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 6px 8px 18px;
    box-sizing: border-box;
    scrollbar-gutter: stable;
  }

  /* Main CreatorDetail wrapper */
  .mc-drawer-content > div {
    padding: 8px !important;
    gap: 16px !important;
    box-sizing: border-box;
  }

  /* Individual sections/cards */
  .mc-drawer-content > div > * {
    min-width: 0;
    padding: 14px 16px !important;
    border: 1px solid rgba(255,255,255,.82) !important;
    border-radius: 16px !important;
    background: rgba(255,255,255,.64) !important;
    box-shadow: 0 8px 24px rgba(70,86,135,.06),
      inset 0 1px 0 rgba(255,255,255,.95) !important;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-sizing: border-box;
  }

  .mc-drawer-content button {
    border-radius: 9px;
  }

  /* Add comfortable spacing inside card text and rows */
  .mc-drawer-content label,
  .mc-drawer-content p {
    line-height: 1.6;
  }

  @media (max-width: 760px) {
    .mc-drawer-shell {
      top: 0;
      right: 0;
      bottom: 0;
      width: 100vw;
      border-radius: 0;
    }

    .mc-drawer-layout {
      grid-template-columns: 1fr;
      overflow: auto;
      display: block;
      padding: 12px;
    }

    .mc-drawer-profile {
      display: grid;
      grid-template-columns: minmax(115px, 38%) minmax(0,1fr);
      margin-bottom: 16px;
    }

    .mc-drawer-portrait {
      min-height: 190px;
    }

    .mc-drawer-profile-stats {
      align-content: center;
    }

    .mc-drawer-profile-footer {
      grid-column: 1 / -1;
    }

    .mc-drawer-content {
      overflow: visible;
      padding: 4px 2px 16px;
    }

    .mc-drawer-content > div {
      padding: 4px !important;
      gap: 12px !important;
    }

    .mc-drawer-content > div > * {
      padding: 12px !important;
    }
  }

  @media (max-width: 430px) {
    .mc-drawer-layout {
      padding: 9px;
    }

    .mc-drawer-profile {
      grid-template-columns: 1fr;
    }

    .mc-drawer-portrait {
      min-height: 245px;
    }

    .mc-drawer-name {
      font-size: 29px;
    }
  }
`}</style>

      <div className="mc-drawer-backdrop" onClick={onClose} />

      <aside className="mc-drawer-shell" role="dialog" aria-modal="true" aria-label={`${inf.name} — details`}>
        <div className="mc-drawer-topbar">
          <IconBtn label="Previous creator" disabled={!onPrev} onClick={onPrev}><ChevronLeft size={15} /></IconBtn>
          <IconBtn label="Next creator" disabled={!onNext} onClick={onNext}><ChevronRight size={15} /></IconBtn>
          {position > 0 && <span style={{ fontSize: 11, color: T.sub, marginLeft: 4 }}>{position} of {total}</span>}
          <div style={{ flex: 1 }} />
          <IconBtn label="Close" onClick={onClose}><X size={15} /></IconBtn>
        </div>

        <div className="mc-drawer-layout">
          <section className="mc-drawer-profile" aria-label="Creator profile">
            <div className="mc-drawer-portrait">
              {profilePhoto ? (
                <img src={profilePhoto} alt={inf.name || "Creator"} onError={(e) => { e.currentTarget.style.display = "none"; }} />
              ) : (
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#53638c", fontSize: 44, fontWeight: 700 }}>{initials(inf.name)}</div>
              )}
              <div className="mc-drawer-portrait-content">
                {inf.platform && <span className="mc-drawer-platform">{inf.platform}</span>}
                <div className="mc-drawer-name">{inf.name || "Unknown creator"}</div>
                <div className="mc-drawer-handle"><CreatorHandle creator={inf} style={{ color: "inherit", fontSize: 12 }} /></div>
                <div className="mc-drawer-badge">Managed by Fifth Avenue</div>
                {vendor && <div style={{ marginTop: 7, fontSize: 10, color: "rgba(255,255,255,.88)" }}>Paid via {vendor.name}</div>}
              </div>
            </div>
            <div className="mc-drawer-profile-stats">
              <div className="mc-drawer-glass-stat"><strong>{followers}</strong><span>Followers</span></div>
              <div className="mc-drawer-glass-stat"><strong>{avgER}</strong><span>Avg ER</span></div>
              <div className="mc-drawer-glass-stat"><strong style={{ color: campaignCount ? "#079b8e" : "#8791a5" }}>{campaignCount}</strong><span>Campaigns</span></div>
              <div className="mc-drawer-glass-stat"><strong style={{ color: invoiceCount ? "#079b68" : "#8791a5" }}>{invoiceCount}</strong><span>Invoices</span></div>
            </div>
            <div className="mc-drawer-profile-footer">
              <div className="mc-drawer-instagram">{inf.handle ? `@${String(inf.handle).replace(/^@+/, "")}` : "Creator profile"}</div>
              {tags.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>{tags.map((tag) => <Pill key={tag} color={T.pink}>{tag}</Pill>)}</div>}
            </div>
          </section>

          <section className="mc-drawer-content" aria-label="Creator business details">
            <CreatorDetail
              key={inf.id}
              inf={inf}
              vendor={vendor}
              vendors={vendors}
              open
              canEdit={canEdit}
              onEdit={onEdit}
              onAssign={onAssign}
              onSetManagement={onSetManagement}
              onToast={onToast}
            />
          </section>
        </div>
      </aside>
    </div>
  );
}

// ── tab ──────────────────────────────────────────────────────────────────────
export default function CreatorsTab({
  creators,
  vendors,
  vendorById,
  canEdit,
  onAddCreator,
  onSaveEdit,
  patchCreator,
  showToast,
}) {
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [sortBy, setSortBy] = useState("followers_desc");
  const [openId, setOpenId] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [adding, setAdding] = useState(false);

  const platforms = useMemo(
    () => [...new Set(creators.map((i) => i.platform).filter(Boolean))].sort(),
    [creators],
  );
  const states = useMemo(
    () => [...new Set(creators.map((i) => i.state).filter(Boolean))].sort(),
    [creators],
  );
  // Only show campaign names that actually exist on the current creator records.
  const campaignNames = useMemo(
    () => [...new Set(creators.flatMap((creator) =>
      (Array.isArray(creator.campaigns) ? creator.campaigns : [])
        .map((campaign) => campaign?.name)
        .filter(Boolean)
        .map((name) => String(name).trim())
        .filter(Boolean)
    ))].sort((a, b) => a.localeCompare(b)),
    [creators],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = creators.filter(
      (i) =>
        (!platformFilter || i.platform === platformFilter) &&
        (!stateFilter || i.state === stateFilter) &&
        (!campaignFilter || (Array.isArray(i.campaigns) && i.campaigns.some(
          (campaign) => String(campaign?.name || "").trim() === campaignFilter
        ))) &&
        (!q ||
          [
            i.name,
            i.handle,
            i.niche,
            i.state,
            vendorById.get(i.vendorId)?.name,
            ...(i.campaigns || []).map((c) => c.name),
          ]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))),
    );
    const f = (i) => parseFollowersLoose(i.followers);
    if (sortBy === "followers_desc")
      rows = [...rows].sort((a, b) => f(b) - f(a));
    else if (sortBy === "followers_asc")
      rows = [...rows].sort((a, b) => f(a) - f(b));
    else if (sortBy === "er_desc")
      rows = [...rows].sort(
        (a, b) => (Number(b.avgER) || 0) - (Number(a.avgER) || 0),
      );
    else if (sortBy === "name")
      rows = [...rows].sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || "")),
      );
    return rows;
  }, [creators, query, platformFilter, stateFilter, campaignFilter, sortBy, vendorById]);

  const filtered = !!(query || platformFilter || stateFilter || campaignFilter);
  const clearFilters = () => {
    setQuery("");
    setPlatformFilter("");
    setStateFilter("");
    setCampaignFilter("");
  };

  // The open creator is looked up live from `creators`, so edits made inside
  // the drawer show immediately — and moving someone off Managed (they drop
  // out of `creators`) closes it on its own.
  const selected = openId ? creators.find((c) => c.id === openId) : null;
  const idx = selected ? visible.findIndex((c) => c.id === openId) : -1;
  const goPrev = useCallback(
    () => idx > 0 && setOpenId(visible[idx - 1].id),
    [idx, visible],
  );
  const goNext = useCallback(
    () =>
      idx >= 0 && idx < visible.length - 1 && setOpenId(visible[idx + 1].id),
    [idx, visible],
  );
  const close = useCallback(() => setOpenId(null), []);

  return (
    <div>
      <style>{CSS}</style>

      {/* Toolbar */}
      <div className="mc-creators-toolbar">
        <div className="mc-creators-toolbar-info">
          <div className="mc-creators-toolbar-count">
            {visible.length} {visible.length === 1 ? "creator" : "creators"}
          </div>
          <div className="mc-creators-toolbar-description">
            Click a creator to see their full profile, billing and brand deals.
          </div>
        </div>

        <div className="mc-creators-toolbar-controls">
          <div className="mc-creators-toolbar-search">
            <input
              aria-label="Search creators"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, handle or niche..."
              style={{
                ...INP,
                width: "100%",
                height: 42,
                padding: "0 13px",
                border: "1px solid #D9DDE5",
                borderRadius: 9,
                background: "#FFFFFF",
                color: "#202B45",
                fontSize: 12,
                boxSizing: "border-box",
                outlineOffset: 2,
              }}
            />
          </div>

          <div className="mc-creators-toolbar-platform">
            <Select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              style={{
                width: "100%",
                height: 42,
                border: "1px solid #D9DDE5",
                borderRadius: 9,
                background: "#FFFFFF",
                color: "#202B45",
                fontSize: 12,
                boxSizing: "border-box",
              }}
            >
              <option value="">All platforms</option>
              {platforms.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </div>

          <div className="mc-creators-toolbar-location">
            <Select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              style={{
                width: "100%",
                height: 42,
                border: "1px solid #D9DDE5",
                borderRadius: 9,
                background: "#FFFFFF",
                color: "#202B45",
                fontSize: 12,
                boxSizing: "border-box",
              }}
            >
              <option value="">All locations</option>
              {states.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </div>

          {campaignNames.length > 0 && (
            <div className="mc-creators-toolbar-campaign">
              <Select
                value={campaignFilter}
                onChange={(e) => setCampaignFilter(e.target.value)}
                style={{
                  width: "100%",
                  height: 42,
                  border: "1px solid #D9DDE5",
                  borderRadius: 9,
                  background: "#FFFFFF",
                  color: "#202B45",
                  fontSize: 12,
                  boxSizing: "border-box",
                }}
              >
                <option value="">All campaigns</option>
                {campaignNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </Select>
            </div>
          )}

          <div className="mc-creators-toolbar-sort">
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                width: "100%",
                height: 42,
                border: "1px solid #D9DDE5",
                borderRadius: 9,
                background: "#FFFFFF",
                color: "#202B45",
                fontSize: 12,
                boxSizing: "border-box",
              }}
            >
              <option value="followers_desc">Most followers</option>
              <option value="followers_asc">Fewest followers</option>
              <option value="er_desc">Highest ER</option>
              <option value="name">Name A–Z</option>
            </Select>
          </div>

          {filtered && (
            <button
              type="button"
              onClick={clearFilters}
              className="mc-creators-toolbar-clear"
            >
              Clear
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mc-creators-toolbar-add"
            >
              + Add creator
            </button>
          )}
        </div>
      </div>

      <style>{`
        .mc-creators-toolbar {
          display: flex;
          align-items: center;
          gap: 14px;
          width: 100%;
          margin-bottom: 18px;
          padding: 14px 16px;
          background: #FFFFFF;
          border: 1px solid #E5E7EB;
          border-radius: 14px;
          box-shadow: 0 3px 12px rgba(24, 39, 75, 0.04);
          box-sizing: border-box;
        }

        .mc-creators-toolbar-info {
          flex: 0 0 300px;
          min-width: 0;
          padding-right: 16px;
          border-right: 1px solid #E5E7EB;
          box-sizing: border-box;
        }

        .mc-creators-toolbar-count {
          color: #202B45;
          font-size: 16px;
          font-weight: 700;
          line-height: 1.35;
          letter-spacing: -0.02em;
        }

        .mc-creators-toolbar-description {
          margin-top: 4px;
          color: #737B8C;
          font-size: 11.5px;
          line-height: 1.5;
        }

        .mc-creators-toolbar-controls {
          display: flex;
          flex: 1 1 auto;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .mc-creators-toolbar-search {
          flex: 1 1 220px;
          min-width: 145px;
        }

        .mc-creators-toolbar-platform {
          flex: 0 1 138px;
          min-width: 118px;
        }

        .mc-creators-toolbar-location {
          flex: 0 1 135px;
          min-width: 118px;
        }

        .mc-creators-toolbar-campaign {
          flex: 0 1 155px;
          min-width: 125px;
        }

        .mc-creators-toolbar-sort {
          flex: 0 1 150px;
          min-width: 128px;
        }

        .mc-creators-toolbar-clear {
          flex: 0 0 auto;
          padding: 0 3px;
          color: #596579;
          background: transparent;
          border: none;
          font-family: 'Sora', sans-serif;
          font-size: 11px;
          text-decoration: underline;
          text-underline-offset: 3px;
          white-space: nowrap;
          cursor: pointer;
        }

        .mc-creators-toolbar-add {
          display: inline-flex;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          padding: 0 16px;
          border: 1px solid #202D55;
          border-radius: 9px;
          background: #202D55;
          color: #FFFFFF;
          font-family: 'Sora', sans-serif;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
          transition: background .2s ease, box-shadow .2s ease;
        }

        .mc-creators-toolbar-add:hover {
          background: #293A6B;
          box-shadow: 0 4px 12px rgba(32, 45, 85, .16);
        }

        .mc-creators-toolbar input:focus,
        .mc-creators-toolbar select:focus {
          border-color: #AAB6D0 !important;
          box-shadow: 0 0 0 3px rgba(32, 45, 85, 0.08);
          outline: none;
        }

        @media (max-width: 1450px) {
          .mc-creators-toolbar {
            align-items: flex-start;
          }

          .mc-creators-toolbar-info {
            flex-basis: 245px;
          }

          .mc-creators-toolbar-controls {
            flex-wrap: wrap;
          }

          .mc-creators-toolbar-search {
            flex: 1 1 220px;
          }
        }

        @media (max-width: 760px) {
          .mc-creators-toolbar {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
            padding: 14px;
          }

          .mc-creators-toolbar-info {
            flex: 1 1 auto;
            width: 100%;
            padding: 0 0 12px;
            border-right: 0;
            border-bottom: 1px solid #E5E7EB;
          }

          .mc-creators-toolbar-controls {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
            width: 100%;
          }

          .mc-creators-toolbar-search {
            grid-column: 1 / -1;
            min-width: 0;
          }

          .mc-creators-toolbar-platform,
          .mc-creators-toolbar-location,
          .mc-creators-toolbar-campaign,
          .mc-creators-toolbar-sort {
            min-width: 0;
            width: 100%;
          }

          .mc-creators-toolbar-clear {
            min-height: 40px;
            justify-self: start;
          }

          .mc-creators-toolbar-add {
            width: 100%;
            grid-column: 1 / -1;
          }
        }
      `}</style>

      {/* Grid */}
      {visible.length === 0 ? (
        <Notice tone="empty">
          {filtered
            ? "No managed creators match your search or filters."
            : "No creators managed directly yet — add one above, or tag an existing creator “Managed by Fifth Avenue” from the Creators tab."}
        </Notice>
      ) : (
        <div className="mc-card-grid">
          {visible.map((inf) => (
            <RosterCard
              key={inf.id}
              inf={inf}
              vendor={vendorById.get(inf.vendorId)}
              selected={openId === inf.id}
              onOpen={() => setOpenId(inf.id)}
            />
          ))}
        </div>
      )}

      {selected && (
        <CreatorDrawer
          inf={selected}
          vendor={vendorById.get(selected.vendorId)}
          vendors={vendors}
          position={idx + 1}
          total={visible.length}
          onPrev={idx > 0 ? goPrev : null}
          onNext={idx >= 0 && idx < visible.length - 1 ? goNext : null}
          onClose={close}
          keysEnabled={!editTarget && !adding}
          canEdit={canEdit}
          onEdit={setEditTarget}
          onToast={showToast}
          onSetManagement={(managedBy) =>
            patchCreator(
              selected.id,
              { managedBy },
              managedBy === "fifthavenue"
                ? `${selected.name} — Managed by Fifth Avenue`
                : `${selected.name} moved off Managed`,
            )
          }
          onAssign={(vendorId) =>
            patchCreator(
              selected.id,
              { vendorId },
              vendorId
                ? `Assigned to ${vendorById.get(vendorId)?.name}`
                : "Vendor cleared",
            )
          }
        />
      )}

      {adding && (
        <AddCreatorModal
          onAdd={onAddCreator}
          onClose={() => setAdding(false)}
        />
      )}
      {editTarget && (
        <AddCreatorModal
          editing={editTarget}
          onAdd={onSaveEdit}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
