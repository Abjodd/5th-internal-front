/**
 * 5th Avenue — Requests › Creator Requests
 * ─────────────────────────────────────────────────────────────────
 * Founder inbox for applications from the landing page's "Apply as a creator"
 * form (hosted separately — it POSTs to /api/creator-requests).
 *
 * Beyond triage, an application can be promoted into the creators directory.
 * That's a two-call flow on purpose: `checkPromote` is a dry run so the
 * confirm modal can state what will actually happen, and only then does
 * `promote` write. Same optimistic-update + toast-on-failure pattern as the
 * rest of the platform.
 */
import { useState, useEffect, useMemo } from "react";
import { CreatorRequestsAPI } from "../../lib/api";
import { T } from "../../theme/tokens";
import { STATUS, statusMeta, Av, Pill, Chevron, Expandable, fmtWhen, Notice, ConfirmDialog } from "./shared";
import CreatorHandle from "../../components/CreatorHandle";

/**
 * Double-check gate before an application is written into the creators
 * directory — same shape as ConfirmActionModal in pages/Campaigns, because
 * this is the same class of action: it changes a record other pages read from.
 *
 * `check` is the backend's dry run. When it reports the handle already exists
 * the modal switches to a warning and the confirm becomes an explicit
 * overwrite, so nobody clobbers a directory row (and its bank/PAN details)
 * without being told.
 */
function PromoteModal({ req, check, busy, onConfirm, onCancel }) {
  const exists = check?.exists;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={busy ? undefined : onCancel}
        style={{ position: "absolute", inset: 0, background: "rgba(4,5,10,0.88)", backdropFilter: "blur(4px)" }} />
      <div style={{
        position: "relative", width: "min(430px,92vw)", background: T.surface,
        border: `1px solid ${T.borderMid}`, borderRadius: 10, padding: 20,
      }}>
        <div style={{ fontFamily: "'Newsreader',serif", fontSize: 16, color: T.text, fontStyle: "italic", marginBottom: 4 }}>
          {exists ? "Creator already in directory" : "Add to creators directory"}
        </div>

        {!check ? (
          <div style={{ fontSize: 11.5, color: T.sub, padding: "10px 0 16px" }}>Checking the directory…</div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: T.sub, lineHeight: 1.6, marginBottom: 14 }}>
              {exists ? (
                <>
                  <strong style={{ color: T.text }}>{check.existing?.name || check.key}</strong> is already in the
                  directory under <strong style={{ color: T.text }}>{check.key}</strong>. Continuing overwrites that
                  profile with this application's details. Bank and PAN details already on file are kept.
                </>
              ) : (
                <>
                  This creates a directory entry for <strong style={{ color: T.text }}>{req?.name}</strong> keyed
                  on <strong style={{ color: T.text }}>{check.key}</strong>, and removes this application from the
                  requests queue. Future campaigns using this handle will link to it automatically.
                </>
              )}
            </div>

            <div style={{
              background: T.raised, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
              padding: "10px 12px", marginBottom: 16,
              display: "flex", flexWrap: "wrap", gap: "8px 22px",
            }}>
              {[["Name", check.preview?.name], ["Handle", check.preview?.handle],
                ["Platform", check.preview?.platform], ["Followers", check.preview?.followers],
                ["State", check.preview?.state], ["Niche", check.preview?.niche],
                ["Phone", check.preview?.phone], ["Email", check.preview?.personalDetails?.email]]
                .filter(([, v]) => v).map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 8.5, color: T.label, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>{k}</div>
                    <div style={{ fontSize: 11, color: T.text }}>{v}</div>
                  </div>
                ))}
            </div>
          </>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={onCancel} disabled={busy}
            style={{
              padding: "7px 14px", borderRadius: 6, fontSize: 11, cursor: busy ? "default" : "pointer",
              fontFamily: "'Sora', sans-serif", background: "transparent",
              border: `1px solid ${T.border}`, color: T.sub, opacity: busy ? 0.5 : 1,
            }}>Cancel</button>
          <div style={{ flex: 1 }} />
          <button onClick={onConfirm} disabled={!check || busy}
            style={{
              padding: "7px 14px", borderRadius: 6, fontSize: 11, fontWeight: 500,
              cursor: !check || busy ? "default" : "pointer", fontFamily: "'Sora', sans-serif",
              background: exists ? T.amber : T.accent, color: "#FFFFFF",
              border: "none", opacity: !check || busy ? 0.55 : 1,
            }}>
            {busy ? "Adding…" : exists ? "Yes, overwrite" : "Yes, add to directory"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CreatorRequestsPanel({ query, showToast, onCount }) {
  const [reqs, setReqs]    = useState([]);
  const [loading, setLoad] = useState(true);
  const [error, setError]  = useState(null);
  const [open, setOpen]    = useState(null);

  // Promote-to-directory flow: `promoting` holds the request awaiting
  // confirmation, `check` the backend's dry run for it.
  const [promoting, setPromoting] = useState(null);
  const [check, setCheck]         = useState(null);
  const [busy, setBusy]           = useState(false);
  const [confirming, setConfirming] = useState(null); // request pending removal
  const [removing, setRemoving]     = useState(false);

  useEffect(() => {
    setLoad(true); setError(null);
    CreatorRequestsAPI.list()
      .then(setReqs)
      .catch(e => setError(e.message))
      .finally(() => setLoad(false));
  }, []);

  const startPromote = (r) => {
    setPromoting(r);
    setCheck(null);
    CreatorRequestsAPI.checkPromote(r.id)
      .then(setCheck)
      .catch(e => { showToast(`Couldn't check the directory — ${e.message}`); setPromoting(null); });
  };

  const confirmPromote = () => {
    setBusy(true);
    CreatorRequestsAPI.promote(promoting.id, !!check?.exists)
      .then(res => {
        // The application is deleted server-side once it's promoted, so it
        // drops out of the inbox entirely rather than sticking around marked
        // "contacted" — see routes/creatorRequests.js.
        setReqs(prev => prev.filter(r => r.id !== promoting.id));
        showToast(res.overwrote
          ? `${res.creator?.name || "Creator"} updated in the directory`
          : `${res.creator?.name || "Creator"} added to the directory`);
        setPromoting(null);
      })
      .catch(e => showToast(`Could not add to directory — ${e.message}`))
      .finally(() => setBusy(false));
  };

  // Untriaged count for the tab badge — reported up rather than lifted, so
  // this panel stays the only owner of its list.
  useEffect(() => {
    onCount?.(reqs.filter(r => (r.status || "new") === "new").length);
  }, [reqs, onCount]);

  // Dismissing an application that isn't going to be promoted. Confirmed
  // first: this is a hard delete server-side, and the applicant's handle and
  // contact details go with it. See ConfirmDialog in shared.
  const remove = async () => {
    const req = confirming;
    setRemoving(true);
    try {
      await CreatorRequestsAPI.remove(req.id);
      setReqs(prev => prev.filter(r => r.id !== req.id));
      showToast(`Removed ${req.name || req.handle || "application"}`);
      setConfirming(null);
    } catch (e) {
      showToast(`Could not remove — ${e.message}`);
    } finally {
      setRemoving(false);
    }
  };

  const setStatus = (id, status) => {
    setReqs(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));
    CreatorRequestsAPI.update(id, { status }).catch(() => showToast("Save failed — check connection"));
    showToast(`Marked ${statusMeta(status).label.toLowerCase()}`);
  };

  const visible = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    const matched = !q ? reqs : reqs.filter(r =>
      [r.name, r.handle, r.platform, r.email, r.phone, r.state, ...(r.niche || []), ...(r.languages || [])]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q))
    );
    // The API already sorts newest-first; re-sorting keeps the order correct
    // after a status update reshuffles `reqs`.
    return matched.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [reqs, query]);

  if (loading) return <Notice>Loading applications…</Notice>;
  if (error)   return <Notice tone="error">Could not load creator applications: {error}</Notice>;
  if (!visible.length) return (
    <Notice tone="empty">
      {query ? "No applications match your search."
        : "No creator applications yet — they arrive from the landing page's “Apply as a creator” form."}
    </Notice>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {visible.map(r => {
        const st = statusMeta(r.status);
        const isOpen = open === r.id;
        return (
          <div key={r.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, boxShadow: T.shadow, overflow: "hidden" }}>
            <div onClick={() => setOpen(isOpen ? null : r.id)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer" }}>
              <Av name={r.name} color={T.pink} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: T.text }}>{r.name}</div>
                <div style={{ fontSize: 10, color: T.sub, marginTop: 1 }}>
                  {/* An applicant's handle is the single most useful thing on
                      this row — vetting starts by opening their profile. */}
                  <CreatorHandle creator={r} style={{ fontSize: 10 }}/>{r.platform ? ` · ${r.platform}` : ""}{r.followers ? ` · ${r.followers}` : ""}
                </div>
              </div>
              <span style={{ fontSize: 10, color: T.label }}>{fmtWhen(r.createdAt)}</span>
              <Pill color={st.color}>{st.label}</Pill>
              <Chevron open={isOpen} />
            </div>
            <Expandable open={isOpen}>
              <div style={{ padding: "0 16px 14px", borderTop: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px", padding: "12px 0" }}>
                  {[["Email", r.email], ["Phone", r.phone], ["State", r.state],
                    ["Niche", (r.niche || []).join(", ")], ["Languages", (r.languages || []).join(", ")]]
                    .filter(([, v]) => v).map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize: 9, color: T.label, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>{k}</div>
                        <div style={{ fontSize: 11.5, color: T.text }}>{v}</div>
                      </div>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {STATUS.filter(s => s.id !== r.status).map(s => (
                    <button key={s.id} onClick={() => setStatus(r.id, s.id)}
                      style={{ padding: "5px 11px", borderRadius: 20, fontSize: 10.5, cursor: "pointer", fontFamily: "'Sora'", background: `${s.color}12`, color: s.color, border: `1px solid ${s.color}2E` }}>
                      Mark {s.label.toLowerCase()}
                    </button>
                  ))}

                  <div style={{ flex: 1 }} />

                  <button onClick={() => setConfirming(r)}
                    style={{ padding: "5px 12px", borderRadius: 20, fontSize: 10.5, cursor: "pointer", fontFamily: "'Sora'", background: "transparent", color: T.red, border: `1px solid ${T.red}2E` }}>
                    Remove
                  </button>

                  {/* Promote into the creators directory. The request is
                      deleted server-side once promoted (see
                      routes/creatorRequests.js), so it disappears from this
                      list entirely rather than sticking around marked done. */}
                  <button onClick={() => startPromote(r)}
                    style={{
                      padding: "5px 12px", borderRadius: 20, fontSize: 10.5, fontWeight: 500,
                      cursor: "pointer", fontFamily: "'Sora'",
                      background: T.accent, color: "#FFFFFF", border: "none",
                    }}>
                    Add to directory
                  </button>
                </div>
              </div>
            </Expandable>
          </div>
        );
      })}

      {confirming && (
        <ConfirmDialog
          title={`Remove ${confirming.name || confirming.handle || "this application"}?`}
          body={<>This deletes the application and everything on it — handle, {confirming.email || confirming.phone || "contact details"} and niche included. It can't be undone, and they aren't notified.</>}
          busy={removing}
          onConfirm={remove}
          onCancel={() => setConfirming(null)}
        />
      )}

      {promoting && (
        <PromoteModal
          req={promoting}
          check={check}
          busy={busy}
          onConfirm={confirmPromote}
          onCancel={() => { setPromoting(null); setCheck(null); }}
        />
      )}
    </div>
  );
}
