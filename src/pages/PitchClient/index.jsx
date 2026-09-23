/**
 * 5th Avenue — Pitch Client
 * ─────────────────────────────────────────────────────────────────
 * The pre-sale step: pick a brand (top-bar filter) and one of its campaigns,
 * drop in candidate influencer profiles (fetched from the Creator directory
 * when we already know them, live via HikerAPI otherwise — see the backend's
 * routes/pitch.js), then send the client a code-gated link to approve or
 * reject each one. The link is brand-wide, not per campaign — it shows the
 * client everything ever pitched to them across every one of their
 * campaigns, in one place. Their calls land back here in real time on
 * refresh; an approved profile only joins the campaign's actual roster once
 * someone here clicks "Ship to Creators" — a deliberate, separate act, not
 * automatic, and done for every approved profile at once rather than one
 * button per card. A fresh Hiker fetch also lands the influencer in the
 * Creator directory itself (not just this one pitch) — see
 * upsertCreatorFromFetch in the backend's creatorSync.js.
 *
 * Not a standalone route or nav section — it used to be both, but living a
 * click away from the campaign list it feeds was one hop too many. It's now
 * rendered inline as a modal from the Campaigns page (see PitchClientModal
 * there, opened next to "+ New campaign"), still pulling brandFilter/brands
 * from the same useOutletContext() since the modal mounts inside the same
 * AppShell tree. `onClose` closes that modal — passed through so
 * goCreateCampaign can dismiss this one before navigating to open the New
 * Campaign flow, rather than leaving both open at once.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { T } from "../../theme/tokens";
import { CampaignsAPI, PitchAPI } from "../../lib/api";
import { fmtCompact, initials } from "../../lib/format";
import { Link2, RefreshCw, Trash2, BadgeCheck, Send } from "lucide-react";

const CLIENT_PORTAL_URL = (import.meta.env.VITE_CLIENT_PORTAL_URL || "https://www.fifth-avenue.in").replace(/\/$/, "");

const STATUS_META = {
  pending: { label: "Pending", color: T.label },
  approved: { label: "Approved", color: T.green },
  rejected: { label: "Rejected", color: T.red },
};

export default function PitchClient({ onClose = () => {} } = {}) {
  const { user, brandFilter, brands = [] } = useOutletContext() || {};
  const navigate = useNavigate();

  const [campaigns, setCampaigns] = useState(null); // null = loading
  const [campaignId, setCampaignId] = useState(null);
  const [pitchCode, setPitchCode] = useState(null);
  const [profiles, setProfiles] = useState(null);
  const [clientTotal, setClientTotal] = useState(null); // count pitched to the brand across ALL campaigns
  const [profileUrl, setProfileUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState(null);
  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null); // pitchId mid-action (remove)
  const [bulkShipping, setBulkShipping] = useState(false);

  const showToast = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); }, []);

  // All campaigns, fetched once — filtered to the active brand client-side,
  // the same pattern the Campaigns page itself uses for its own brandFilter.
  useEffect(() => {
    CampaignsAPI.list().then(setCampaigns).catch(() => setCampaigns([]));
  }, []);

  const brandCampaigns = useMemo(
    () => (campaigns || []).filter((c) => !brandFilter || c.brandId === brandFilter),
    [campaigns, brandFilter],
  );

  // Keep the selected campaign valid as the brand filter changes — default
  // to the first campaign under the newly active brand.
  useEffect(() => {
    if (!brandCampaigns.length) { setCampaignId(null); return; }
    if (!brandCampaigns.some((c) => c.id === campaignId)) setCampaignId(brandCampaigns[0].id);
  }, [brandCampaigns, campaignId]);

  const loadPitch = useCallback((id) => {
    if (!id) { setProfiles(null); return; }
    setProfiles(null);
    // pitchCode returned here is the BRAND's code (one link covers every
    // campaign for this brand), not something scoped to just this campaign.
    PitchAPI.list(id)
      .then(({ pitchCode: code, profiles: list }) => { setPitchCode(code); setProfiles(list); })
      .catch(() => { setPitchCode(null); setProfiles([]); });
  }, []);

  useEffect(() => { loadPitch(campaignId); }, [campaignId, loadPitch]);

  // The client-wide total — how many profiles the client's own link will
  // show them, across every campaign, not just the one selected above. Kept
  // separate from `profiles` (which stays scoped to the active campaign, so
  // the composer/list above it stays easy to work in one campaign at a time).
  useEffect(() => {
    if (!brandFilter) { setClientTotal(null); return; }
    PitchAPI.listForClient(brandFilter)
      .then(({ profiles: list }) => setClientTotal(list.length))
      .catch(() => setClientTotal(null));
  }, [brandFilter, profiles]);

  const addProfile = async (e) => {
    e.preventDefault();
    const url = profileUrl.trim();
    if (!url || !campaignId) return;
    setAdding(true);
    setAddErr(null);
    try {
      const { profile, pitchCode: code } = await PitchAPI.add(campaignId, url, user?.name);
      setProfiles((prev) => [...(prev || []), profile]);
      setPitchCode(code);
      setProfileUrl("");
    } catch (err) {
      setAddErr(err.body?.error || err.message);
    } finally {
      setAdding(false);
    }
  };

  const removeProfile = async (id) => {
    setBusyId(id);
    try {
      await PitchAPI.remove(campaignId, id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      showToast(err.body?.error || err.message);
    } finally {
      setBusyId(null);
    }
  };

  // Every client-approved, not-yet-shipped profile in the active campaign —
  // what the one "Ship to Creators" button below acts on, rather than a
  // button per card.
  const approvedUnshipped = useMemo(
    () => (profiles || []).filter((p) => p.status === "approved" && !p.shipped),
    [profiles],
  );

  const shipAllApproved = async () => {
    if (!approvedUnshipped.length) return;
    setBulkShipping(true);
    let shipped = 0;
    const failures = [];
    // Sequential, not Promise.all — each ship does its own directory upsert
    // and campaign $push (see routes/pitch.js), and running them one at a
    // time keeps a partial failure easy to attribute to the one profile that
    // caused it rather than a batch of interleaved errors.
    for (const p of approvedUnshipped) {
      try {
        const { shippedCreatorRef } = await PitchAPI.ship(campaignId, p.id);
        setProfiles((prev) => prev.map((row) => (row.id === p.id ? { ...row, shipped: true, shippedCreatorRef } : row)));
        shipped += 1;
      } catch {
        failures.push(p.name || p.handle);
      }
    }
    setBulkShipping(false);
    if (failures.length) {
      showToast(`Shipped ${shipped}, but ${failures.length} failed (${failures.join(", ")}).`);
    } else {
      showToast(`Shipped ${shipped} to the campaign's Creators tab.`);
    }
  };

  const regenerateCode = async () => {
    try {
      // Regenerates the whole brand's code (see routes/pitch.js) — the old
      // link stops working for every campaign of this brand, not just this one.
      const { pitchCode: code } = await PitchAPI.regenerateCode(campaignId);
      setPitchCode(code);
      showToast("New link generated — the old one no longer works, for every campaign of this brand.");
    } catch (err) {
      showToast(err.body?.error || err.message);
    }
  };

  // Brand-wide — this is the ONE link for this client, not one per campaign.
  const clientLink = pitchCode && brandFilter ? `${CLIENT_PORTAL_URL}/pitch/${brandFilter}?code=${pitchCode}` : null;
  const copyLink = () => {
    if (!clientLink) return;
    navigator.clipboard?.writeText(clientLink).then(
      () => showToast("Link copied."),
      () => showToast(clientLink),
    );
  };

  // Embedded in a modal on the Campaigns page now (see PitchClientModal
  // there) rather than a standalone route — closing it before navigating
  // avoids leaving this dialog open on top of the New Campaign one.
  const goCreateCampaign = () => {
    onClose();
    navigate(`/campaigns?new=1&brand=${encodeURIComponent(brandFilter)}`);
  };
  const activeBrandName = brands.find((b) => b.id === brandFilter)?.name;
  const activeCampaign = brandCampaigns.find((c) => c.id === campaignId);

  return (
    <div style={{ background: T.bg, padding: "20px 22px 24px" }}>
      {!brandFilter ? (
        <Notice>Pick a brand from the top bar to pitch influencers for one of its campaigns.</Notice>
      ) : campaigns == null ? (
        <Notice>Loading campaigns…</Notice>
      ) : brandCampaigns.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: T.sub, marginBottom: 14 }}>
            {activeBrandName || "This brand"} doesn't have a campaign yet — create one first, then come back here to pitch.
          </div>
          <button onClick={goCreateCampaign} style={primaryBtn}>+ New Campaign</button>
        </div>
      ) : (
        <>
          {/* Campaign filter */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            {brandCampaigns.map((c) => (
              <button
                key={c.id}
                onClick={() => setCampaignId(c.id)}
                style={{
                  padding: "7px 14px", borderRadius: 20, fontSize: 11.5, fontFamily: "'Sora'",
                  fontWeight: c.id === campaignId ? 600 : 400, cursor: "pointer",
                  border: `1px solid ${c.id === campaignId ? T.accent : T.border}`,
                  background: c.id === campaignId ? T.accent : "transparent",
                  color: c.id === campaignId ? "#FFFFFF" : T.sub,
                }}
              >
                {c.name}
              </button>
            ))}
            <button
              onClick={goCreateCampaign}
              style={{
                padding: "7px 14px", borderRadius: 20, fontSize: 11.5, fontFamily: "'Sora'", cursor: "pointer",
                border: `1px dashed ${T.border}`, background: "transparent", color: T.label,
              }}
            >
              + New Campaign
            </button>
          </div>

          {activeCampaign && (
            <>
              {/* Composer + client link */}
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 8 }}>
                <form onSubmit={addProfile} style={{ display: "flex", gap: 8, flex: "1 1 320px" }}>
                  <input
                    value={profileUrl}
                    onChange={(e) => setProfileUrl(e.target.value)}
                    placeholder="Paste an Instagram profile URL or @handle…"
                    style={{ ...inputStyle, flex: 1 }}
                    disabled={adding}
                  />
                  <button type="submit" disabled={adding || !profileUrl.trim()} style={{ ...primaryBtn, opacity: adding || !profileUrl.trim() ? 0.5 : 1 }}>
                    {adding ? "Fetching…" : "Add"}
                  </button>
                </form>

                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
                  {clientLink ? (
                    <>
                      <button onClick={copyLink} style={secondaryBtn}><Link2 size={13} /> Copy client link</button>
                      <button onClick={regenerateCode} title="Generate a new code — the old link stops working, for every campaign of this brand" style={iconBtn}><RefreshCw size={13} /></button>
                    </>
                  ) : (
                    <span style={{ fontSize: 11, color: T.label }}>Add a profile to generate the client link.</span>
                  )}
                </div>
              </div>
              {clientLink && (
                <div style={{ fontSize: 10.5, color: T.label, marginBottom: 14 }}>
                  One link for {activeBrandName || "this brand"} — shows{" "}
                  {clientTotal == null ? "every profile" : `all ${clientTotal} profile${clientTotal === 1 ? "" : "s"}`}
                  {" "}pitched across all of their campaigns, not just {activeCampaign.name}.
                </div>
              )}
              {addErr && <div style={{ marginBottom: 14, fontSize: 11.5, color: T.red }}>{addErr}</div>}

              {/* One bulk ship action for everything the client has approved
                  in this campaign, instead of a button on every card. */}
              {approvedUnshipped.length > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  background: `${T.green}0F`, border: `1px solid ${T.green}33`, borderRadius: T.radius,
                  padding: "12px 16px", marginBottom: 18,
                }}>
                  <div style={{ fontSize: 11.5, color: T.text }}>
                    <strong>{approvedUnshipped.length}</strong> approved and ready — join the campaign's Creators tab in one go.
                  </div>
                  <button onClick={shipAllApproved} disabled={bulkShipping} style={{ ...primaryBtn, background: T.green, opacity: bulkShipping ? 0.6 : 1 }}>
                    <Send size={13} />
                    {bulkShipping ? "Shipping…" : `Ship ${approvedUnshipped.length} to Creators`}
                  </button>
                </div>
              )}

              {/* Pitched profiles */}
              {profiles == null ? (
                <Notice>Loading…</Notice>
              ) : profiles.length === 0 ? (
                <Notice tone="empty">Nothing pitched yet — paste a profile above to get started.</Notice>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 16 }}>
                  {profiles.map((p) => (
                    <ProfileCard
                      key={p.id}
                      p={p}
                      busy={busyId === p.id}
                      onRemove={() => removeProfile(p.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999, padding: "11px 18px",
          background: "rgba(29,29,31,0.92)", backdropFilter: "blur(16px)", borderRadius: 12,
          fontSize: 12, color: "#FFFFFF", fontFamily: "'Sora'", boxShadow: "0 8px 32px rgba(0,0,0,0.24)",
          letterSpacing: "-0.01em", maxWidth: 360,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// Centered, portrait card: a big circular photo anchors the top, everything
// else (name, bio, stats, status) stacks below it centered — reads like a
// profile the client is meeting, not a data row. Shipping moved out to the
// single bulk button above; the only per-card action left is Remove, tucked
// into the corner since it's a quiet, occasional action, not a primary one.
function ProfileCard({ p, busy, onRemove }) {
  const meta = STATUS_META[p.status] || STATUS_META.pending;
  return (
    <div style={{
      position: "relative", display: "flex", flexDirection: "column", alignItems: "center",
      textAlign: "center", background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: T.radius, padding: "24px 16px 16px", boxShadow: T.shadow,
    }}>
      <button
        onClick={onRemove}
        disabled={busy}
        title="Remove"
        style={{ ...iconBtn, position: "absolute", top: 10, right: 10, color: T.label, opacity: busy ? 0.5 : 1 }}
      >
        <Trash2 size={13} />
      </button>

      {p.avatar ? (
        <img
          src={PitchAPI.avatarUrl(p.avatar)}
          alt=""
          style={{
            width: 76, height: 76, borderRadius: "50%", objectFit: "cover",
            border: `2px solid ${T.border}`, boxShadow: T.shadow,
          }}
        />
      ) : (
        <div style={{
          width: 76, height: 76, borderRadius: "50%", background: `${T.teal}16`, color: T.teal,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 600,
          border: `2px solid ${T.border}`,
        }}>
          {initials(p.name || p.handle)}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 12 }}>
        <div style={{
          fontSize: 13.5, fontWeight: 600, color: T.text, maxWidth: 180,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {p.name || p.handle}
        </div>
        {p.isVerified && <BadgeCheck size={13} color={T.accent} style={{ flexShrink: 0 }} />}
      </div>
      <a
        href={`https://instagram.com/${encodeURIComponent(p.handle)}`}
        target="_blank"
        rel="noreferrer noopener"
        style={{ fontSize: 11, color: T.sub, marginBottom: 10, textDecoration: "none" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = T.accent; e.currentTarget.style.textDecoration = "underline"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = T.sub; e.currentTarget.style.textDecoration = "none"; }}
      >
        @{p.handle}
      </a>

      {p.bio && (
        <div style={{
          fontSize: 10.5, color: T.sub, marginBottom: 12, lineHeight: 1.4, maxWidth: 210,
          overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>
          {p.bio}
        </div>
      )}

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, auto)", columnGap: 16, rowGap: 8,
        fontSize: 11, marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${T.border}`, width: "100%",
        justifyContent: "center",
      }}>
        <Stat label="Followers" value={fmtCompact(p.followers)} />
        <Stat label="Following" value={fmtCompact(p.following)} />
        <Stat label="Posts" value={fmtCompact(p.posts)} />
        <Stat label="Avg likes" value={fmtCompact(p.avgLikes)} />
        {p.avgViews != null && <Stat label="Avg views" value={fmtCompact(p.avgViews)} />}
        {p.avgER != null && <Stat label="ER" value={`${(+p.avgER).toFixed(1)}%`} />}
      </div>

      {p.campaignName && (
        <div style={{ fontSize: 9.5, color: T.label, marginBottom: 10 }}>
          Pitched for <span style={{ color: T.sub }}>{p.campaignName}</span>
        </div>
      )}

      <span style={{
        display: "inline-block", padding: "2px 10px", borderRadius: 10, fontSize: 9.5, fontWeight: 500,
        color: meta.color, background: `${meta.color}14`, border: `1px solid ${meta.color}28`,
      }}>
        {meta.label}
      </span>
      {p.shipped && (
        <div style={{ fontSize: 10, color: T.green, fontWeight: 600, marginTop: 8 }}>✓ In roster</div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ color: T.text, fontWeight: 600 }}>{value}</div>
      <div style={{ color: T.label, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
    </div>
  );
}

function Notice({ children, tone }) {
  return (
    <div style={{ padding: 40, fontSize: 12, color: tone === "empty" ? T.label : T.sub, textAlign: "center", fontStyle: tone === "empty" ? "italic" : "normal" }}>
      {children}
    </div>
  );
}

const inputStyle = {
  padding: "9px 12px", borderRadius: 8, background: T.surface,
  border: `1px solid ${T.border}`, color: T.text, fontSize: 12,
  fontFamily: "'Sora'", outline: "none",
};
const primaryBtn = {
  padding: "9px 16px", borderRadius: 8, border: "none", fontSize: 11.5, fontWeight: 600,
  fontFamily: "'Sora'", cursor: "pointer", background: T.accent, color: "#FFFFFF",
  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
};
const secondaryBtn = {
  padding: "8px 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 500, fontFamily: "'Sora'",
  cursor: "pointer", background: "transparent", color: T.accent, border: `1px solid ${T.accent}55`,
  display: "inline-flex", alignItems: "center", gap: 6,
};
const iconBtn = {
  width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.border}`, background: "transparent",
  color: T.sub, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
};
