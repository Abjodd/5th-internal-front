/**
 * 5th Avenue — Requests › Career Requests
 * ─────────────────────────────────────────────────────────────────
 * Inbox of job applications from the client portal's public Careers page
 * (it POSTs to /api/career-requests).
 *
 * Shaped like CreatorRequestsPanel rather than ClientRequestsPanel: both are
 * triaged with a status rather than converted into another record, so they
 * read as the same kind of work. The one structural difference is the ending —
 * a creator application graduates into the creators directory, while hiring
 * happens outside the platform, so this one ends at "Remove" once the
 * application has been dealt with.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { CareerRequestsAPI } from "../../lib/api";
import { T } from "../../theme/tokens";
import { STATUS, statusMeta, Av, Pill, Chevron, Expandable, fmtWhen, Notice, ConfirmDialog } from "./shared";

export default function CareerRequestsPanel({ query, showToast, onCount }) {
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);           // expanded request id
  const [confirming, setConfirming] = useState(null); // request pending removal
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    CareerRequestsAPI.list()
      .then(setReqs)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Untriaged count for the tab badge — reported up rather than lifted, so
  // this panel stays the only owner of its list.
  useEffect(() => {
    onCount?.(reqs.filter(r => (r.status || "new") === "new").length);
  }, [reqs, onCount]);

  // Optimistic: the row moves the moment it's clicked and the write follows.
  // A failed save is surfaced as a toast rather than rolled back — the founder
  // is looking at the row they just changed, so telling them beats a silent
  // revert they may not notice.
  const setStatus = useCallback((id, status) => {
    setReqs(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));
    CareerRequestsAPI.update(id, { status }).catch(() => showToast("Save failed — check connection"));
    showToast(`Marked ${statusMeta(status).label.toLowerCase()}`);
  }, [showToast]);

  // Confirmed before it runs — the row is hard-deleted server-side, and this
  // is the only copy of the applicant's details. See ConfirmDialog in shared.
  const remove = useCallback(async () => {
    const req = confirming;
    setRemoving(true);
    try {
      await CareerRequestsAPI.remove(req.id);
      setReqs(prev => prev.filter(r => r.id !== req.id));
      showToast(`Removed ${req.name || "application"}`);
      setConfirming(null);
    } catch (e) {
      showToast(`Could not remove — ${e.message}`);
    } finally {
      setRemoving(false);
    }
  }, [confirming, showToast]);

  const visible = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    const matched = !q ? reqs : reqs.filter(r =>
      [r.name, r.email, r.roleTitle, r.link, r.note]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q))
    );
    // The API already sorts newest-first; re-sorting keeps the order correct
    // after a status update reshuffles `reqs`.
    return matched.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [reqs, query]);

  if (loading) return <Notice>Loading applications…</Notice>;
  if (error)   return <Notice tone="error">Could not load career applications: {error}</Notice>;
  if (!visible.length) return (
    <Notice tone="empty">
      {query ? "No applications match your search."
        : "No job applications yet — they arrive from the Careers page's “Tell us about you” form."}
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
              {/* Purple keeps the three inboxes distinguishable at a glance —
                  gold for brands, pink for creators, purple for hiring. */}
              <Av name={r.name} color={T.purple} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: T.text }}>{r.name}</div>
                {/* The role is what this row is about — which opening someone
                    applied for decides whether it's even worth opening. */}
                <div style={{ fontSize: 10, color: T.sub, marginTop: 1 }}>
                  {r.roleTitle || "General application"}{r.email ? ` · ${r.email}` : ""}
                </div>
              </div>
              <span style={{ fontSize: 10, color: T.label }}>{fmtWhen(r.createdAt)}</span>
              <Pill color={st.color}>{st.label}</Pill>
              <Chevron open={isOpen} />
            </div>
            <Expandable open={isOpen}>
              <div style={{ padding: "0 16px 14px", borderTop: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px", padding: "12px 0" }}>
                  {[["Email", r.email], ["Role", r.roleTitle]]
                    .filter(([, v]) => v).map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize: 9, color: T.label, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>{k}</div>
                        <div style={{ fontSize: 11.5, color: T.text }}>{v}</div>
                      </div>
                    ))}
                  {/* Rendered as a link, not text: a portfolio you have to
                      copy-paste to open is a portfolio that goes unread. */}
                  {r.link && (
                    <div>
                      <div style={{ fontSize: 9, color: T.label, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>Portfolio / LinkedIn</div>
                      <a href={/^https?:\/\//i.test(r.link) ? r.link : `https://${r.link}`}
                        target="_blank" rel="noreferrer"
                        style={{ fontSize: 11.5, color: T.accent, textDecoration: "none" }}>
                        {r.link}
                      </a>
                    </div>
                  )}
                </div>

                {r.note && (
                  <div style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "10px 12px", marginBottom: 12 }}>
                    <div style={{ fontSize: 9, color: T.label, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Why 5th Avenue</div>
                    <div style={{ fontSize: 11.5, color: T.text, lineHeight: 1.6 }}>{r.note}</div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {STATUS.filter(s => s.id !== (r.status || "new")).map(s => (
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
                </div>
              </div>
            </Expandable>
          </div>
        );
      })}

      {confirming && (
        <ConfirmDialog
          title={`Remove ${confirming.name || "this application"}?`}
          body={<>This deletes the application and everything on it — {confirming.email || "their contact details"} included. It can't be undone, and the applicant isn't notified.</>}
          busy={removing}
          onConfirm={remove}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
