/**
 * How complete an internal user's profile is, and what is missing from it.
 *
 * Mirrors the client portal's lib/profileCompletion so both products score the
 * same idea the same way — see that file for why system-assigned values
 * (account id, created-at) are deliberately excluded from the count.
 *
 * `role` is excluded for the same reason: it is the access-control key, so a
 * user who can sign in always has one. Counting a field that is never empty
 * just adds a free point to everybody's score.
 *
 * `teamId` IS counted despite not being self-serve, because a missing one is
 * genuinely consequential rather than cosmetic — it is the id campaigns store
 * in amId/cmId/eaId, so a user without one owns nothing and shows up nowhere.
 * Surfacing that on their own profile is how it gets noticed.
 */

const filled = (v) => v != null && String(v).trim() !== "";

export function profileCompletion(user) {
  const u = user || {};
  const items = [
    // hasAvatar, not `avatar` — the latter holds initials for the fallback chip
    // and is set on every record, so reading it would mark everyone complete.
    { key: "photo",  label: "Profile photo", filled: !!u.hasAvatar,        actionable: true },
    { key: "name",   label: "Full name",     filled: filled(u.name),       actionable: false },
    { key: "title",  label: "Title",         filled: filled(u.title),      actionable: false },
    { key: "email",  label: "Login email",   filled: filled(u.email || u.username), actionable: false },
    { key: "teamId", label: "Team ID",       filled: filled(u.teamId),     actionable: false },
  ];

  const done = items.filter((i) => i.filled).length;
  return {
    items,
    missing: items.filter((i) => !i.filled),
    done,
    total: items.length,
    // Display only — callers test completion with done === total, since a
    // rounded percentage can reach 100 while an item is still outstanding.
    pct: items.length ? Math.round((done / items.length) * 100) : 0,
  };
}
