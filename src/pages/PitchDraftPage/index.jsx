/**
 * 5th Avenue — Pitch Draft, full page
 * ─────────────────────────────────────────────────────────────────
 * A prospect being actively worked — the combined brand+campaign form, a
 * freeform brief with its own preview, suggested content, and a candidate
 * composer — is a lot to fit in the Pitch Client modal's cramped viewport.
 * This is that same editor (DraftEditor, exported from ../PitchDraft) given
 * a full page of its own: reached at /pitch-drafts/:id (see App.jsx), which
 * the modal's "New brand" tab now navigates to instead of showing the
 * editor inline (see PitchDraft/index.jsx's own note on why).
 *
 * Ordinary AppShell page — no modal chrome, just a back link and the
 * editor with room to breathe.
 */
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { T } from "../../theme/tokens";
import { PitchDraftAPI } from "../../lib/api";
import { DraftEditor } from "../PitchDraft";
import { ArrowLeft } from "lucide-react";

export default function PitchDraftPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, refreshBrands, setBrandFilter } = useOutletContext() || {};

  const [draft, setDraft] = useState(null); // null = loading, false = not found
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(null), 3200); }, []);

  useEffect(() => {
    setDraft(null);
    PitchDraftAPI.get(id).then(setDraft).catch(() => setDraft(false));
  }, [id]);

  const onPromoted = ({ clientId, campaignId, client, campaign }) => {
    setDraft((prev) => (prev ? { ...prev, status: "promoted", promotedClientId: clientId, promotedCampaignId: campaignId } : prev));
    refreshBrands?.();
    // Switch the app's brand filter to the brand that just came into being —
    // the natural next place a team member wants to land.
    setBrandFilter?.(clientId);
    showToast(`${client?.name || "Brand"} and ${campaign?.name || "the campaign"} are live — find them under Campaigns.`);
  };

  return (
    <div style={{ minHeight: "100%", background: T.bg, padding: "26px 32px 60px" }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <button
          onClick={() => navigate("/campaigns")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 18,
            background: "transparent", border: "none", color: T.sub, fontSize: 11.5,
            fontFamily: "'Sora'", cursor: "pointer", padding: 0,
          }}
        >
          <ArrowLeft size={13} /> Campaigns
        </button>

        {draft === null ? (
          <div style={{ padding: 60, textAlign: "center", fontSize: 12, color: T.sub }}>Loading…</div>
        ) : draft === false ? (
          <div style={{ padding: 60, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: T.sub, marginBottom: 4 }}>Couldn't find that prospect.</div>
            <div style={{ fontSize: 10.5, color: T.label }}>It may have been deleted, or the link is wrong.</div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontFamily: "'Newsreader',serif", fontSize: 24, fontStyle: "italic", color: T.text }}>
                {draft.brandName}{draft.campaignName ? ` — ${draft.campaignName}` : ""}
              </div>
              <div style={{ fontSize: 10.5, color: T.sub, marginTop: 4 }}>
                Pitching a brand that isn't in the system yet — nothing here is real until it's promoted.
              </div>
            </div>
            <div style={{ height: 22 }} />
            <DraftEditor
              draft={draft}
              setDraft={setDraft}
              onBack={null}
              onPromoted={onPromoted}
              showToast={showToast}
              createdBy={user?.name}
            />
          </>
        )}
      </div>

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
