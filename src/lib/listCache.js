// Read-through cache for the collection lists every page loads on mount.
//
// Summary, Campaigns and Billing each ask for the same lists (campaigns,
// invoices, quotes, users, creators), so without this a tab switch re-queries
// Mongo for rows fetched seconds earlier. api.js is the only caller; it is
// split out so the cache can be unit-tested without a bundler.

// Safe because it is SHORTER than the staleness the app already accepts: a page
// fetches once on mount and never refetches, so a tab left open holds data older
// than this regardless. Writes invalidate immediately, so the only stale window
// is another user's edit. Lower it if that matters more.
const TTL_MS = 120_000;

const cache = new Map();

// Cached as the PROMISE, so concurrent mounts share one request instead of
// racing. Arrays are copied per caller: one page sorting its copy must not
// reorder another's.
export function cachedList(key, fetchFresh) {
  const hit = cache.get(key);
  const fresh = hit && Date.now() - hit.at < TTL_MS;
  // Dropped on failure so a transient outage does not poison the key.
  const promise = fresh ? hit.promise : fetchFresh().catch((err) => { cache.delete(key); throw err; });
  if (!fresh) cache.set(key, { at: Date.now(), promise });
  return promise.then((rows) => (Array.isArray(rows) ? [...rows] : rows));
}

// Drops every key of the collections given — including their per-argument
// variants (?brandId=, ?status=) — or the whole cache when called with none.
export function invalidate(...basePaths) {
  if (!basePaths.length) return cache.clear();
  for (const key of [...cache.keys()]) {
    if (basePaths.some((base) => key.startsWith(base))) cache.delete(key);
  }
}
