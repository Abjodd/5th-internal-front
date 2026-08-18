/**
 * How complete an internal user's profile is, and what is missing.
 *
 * Mirrors the client portal's lib/profileCompletion so both score the same idea
 * the same way — see there for why system-assigned values are excluded.
 *
 * `role` is excluded: it is the access-control key, so anyone who can sign in
 * has one, and counting a never-empty field gives everybody a free point.
 *
 * `teamId` IS counted despite not being self-serve — it is what campaigns store
 * in amId/cmId/eaId, so a user without one owns nothing and appears nowhere.
 * Their own profile is where that gets noticed.
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
