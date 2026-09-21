import test from "node:test";
import assert from "node:assert/strict";
import { cachedList, invalidate } from "./listCache.js";

// A fetcher that records how many times it actually ran.
const counter = (rows = [{ id: "a" }, { id: "b" }]) => {
  const fn = () => { fn.calls++; return Promise.resolve(rows); };
  fn.calls = 0;
  return fn;
};

test.beforeEach(() => invalidate());

test("a repeated read inside the TTL runs the fetcher once", async () => {
  const f = counter();
  await cachedList("/api/campaigns", f);
  await cachedList("/api/campaigns", f);
  await cachedList("/api/campaigns", f);
  assert.equal(f.calls, 1);
});

test("concurrent reads share one in-flight request", async () => {
  const f = counter();
  await Promise.all([
    cachedList("/api/clients", f), cachedList("/api/clients", f),
    cachedList("/api/clients", f), cachedList("/api/clients", f),
  ]);
  assert.equal(f.calls, 1);
});

test("different keys do not collide", async () => {
  const all = counter(); const scoped = counter();
  await cachedList("/api/creators", all);
  await cachedList("/api/creators?brandId=c1", scoped);
  assert.equal(all.calls, 1);
  assert.equal(scoped.calls, 1);
});

test("an entry past its TTL is refetched", async () => {
  const f = counter();
  await cachedList("/api/quotes", f);
  const realNow = Date.now;
  Date.now = () => realNow() + 10 * 60 * 1000;   // ten minutes later
  try { await cachedList("/api/quotes", f); } finally { Date.now = realNow; }
  assert.equal(f.calls, 2);
});

test("invalidate forces the next read to refetch", async () => {
  const f = counter();
  await cachedList("/api/invoices", f);
  invalidate("/api/invoices");
  await cachedList("/api/invoices", f);
  assert.equal(f.calls, 2);
});

test("invalidate clears the per-argument keys of the same collection", async () => {
  const all = counter(); const scoped = counter();
  await cachedList("/api/creators", all);
  await cachedList("/api/creators?brandId=c1", scoped);
  invalidate("/api/creators");
  await cachedList("/api/creators", all);
  await cachedList("/api/creators?brandId=c1", scoped);
  assert.equal(all.calls, 2);
  assert.equal(scoped.calls, 2);
});

test("invalidate leaves collections with a similar prefix alone", async () => {
  const clients = counter(); const requests = counter(); const pos = counter();
  await cachedList("/api/clients", clients);
  await cachedList("/api/client-requests", requests);
  await cachedList("/api/client-pos", pos);
  invalidate("/api/clients");
  await cachedList("/api/client-requests", requests);
  await cachedList("/api/client-pos", pos);
  assert.equal(requests.calls, 1, "client-requests was wrongly evicted");
  assert.equal(pos.calls, 1, "client-pos was wrongly evicted");
});

test("invalidate matches a PREFIX, not a substring anywhere in the key", async () => {
  // A key can carry another path inside its query string; only the collection
  // the key actually belongs to may be evicted.
  const own = counter(); const other = counter();
  await cachedList("/api/campaigns", own);
  await cachedList("/api/creators?ref=/api/campaigns", other);
  invalidate("/api/campaigns");
  await cachedList("/api/creators?ref=/api/campaigns", other);
  assert.equal(other.calls, 1, "a key merely containing the path was evicted");
});

test("invalidate with several paths clears all of them", async () => {
  const camps = counter(); const exps = counter();
  await cachedList("/api/campaigns", camps);
  await cachedList("/api/expenses", exps);
  invalidate("/api/campaigns", "/api/expenses");
  await cachedList("/api/campaigns", camps);
  await cachedList("/api/expenses", exps);
  assert.equal(camps.calls, 2);
  assert.equal(exps.calls, 2);
});

test("invalidate with no arguments clears everything", async () => {
  const a = counter(); const b = counter();
  await cachedList("/api/a", a);
  await cachedList("/api/b", b);
  invalidate();
  await cachedList("/api/a", a);
  await cachedList("/api/b", b);
  assert.equal(a.calls, 2);
  assert.equal(b.calls, 2);
});

test("a rejected read is not cached — the next attempt retries", async () => {
  let attempt = 0;
  const flaky = () => {
    attempt++;
    return attempt === 1 ? Promise.reject(new Error("boom")) : Promise.resolve([{ id: "ok" }]);
  };
  await assert.rejects(() => cachedList("/api/users", flaky), /boom/);
  assert.deepEqual(await cachedList("/api/users", flaky), [{ id: "ok" }]);
  assert.equal(attempt, 2);
});

test("every caller gets its own array", async () => {
  const f = counter();
  const a = await cachedList("/api/creators", f);
  const b = await cachedList("/api/creators", f);
  a.push({ id: "injected" });
  a.sort(() => -1);
  assert.equal(b.length, 2, "mutating one caller's array changed another's");
  assert.equal(f.calls, 1, "the copy must not cost an extra request");
});

test("a non-array body is passed through untouched", async () => {
  const body = { total: 3 };
  assert.equal(await cachedList("/api/thing", () => Promise.resolve(body)), body);
});

test("a second session cannot read the first one's rows", async () => {
  const userA = counter([{ id: "a-only" }]);
  const userB = counter([{ id: "b-only" }]);
  assert.deepEqual(await cachedList("/api/campaigns", userA), [{ id: "a-only" }]);
  invalidate();                                      // what sign-out/sign-in does
  assert.deepEqual(await cachedList("/api/campaigns", userB), [{ id: "b-only" }],
    "the second session was served the first one's cache");
});
