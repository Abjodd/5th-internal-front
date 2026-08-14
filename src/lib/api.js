// Simple fetch wrapper for the IM Campaigns backend (Express + MongoDB).
// Set VITE_API_URL in a .env file to point at your backend, defaults to
// localhost:4000 for local dev.

const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`API ${options.method || "GET"} ${path} failed: ${res.status} ${body}`);
    // Structured fields so callers can branch on the failure instead of
    // string-matching the message (e.g. 401 → "invalid credentials").
    err.status = res.status;
    try { err.body = JSON.parse(body); } catch { err.body = null; }
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const ClientsAPI = {
  list: () => request("/api/clients"),
  create: (client) =>
    request("/api/clients", { method: "POST", body: JSON.stringify(client) }),
  update: (id, patch) =>
    request(`/api/clients/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  // The brand's logo. Same contract as the user/credential avatars — bytes are
  // never in the list payload, `?v=` busts the immutable cache when the logo
  // changes, and null means "no logo, render initials" so no request is made
  // that is certain to 404. See authCrud().avatarUrl below.
  avatarUrl: (brand) => {
    const id = typeof brand === "string" ? brand : brand?.id;
    if (!id || (typeof brand === "object" && !brand?.hasAvatar)) return null;
    const v = typeof brand === "object" && brand?.avatarUpdatedAt
      ? `?v=${encodeURIComponent(brand.avatarUpdatedAt)}`
      : "";
    return `${BASE}/api/clients/${encodeURIComponent(id)}/avatar${v}`;
  },
};

export const FindingsAPI = {
  list: (clientId) => request(`/api/findings${clientId ? `?clientId=${clientId}` : ""}`),
  update: (id, patch) =>
    request(`/api/findings/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
};

// ── Client Requests (Requests › Client Requests) ─────────────────────────────
// The landing page's "Start a project" form POSTs; the founder inbox uses
// list/update. Backend fires the founder email on create (mailer.js).
export const ClientRequestsAPI = {
  list: () => request("/api/client-requests"),
  create: (req) => request("/api/client-requests", { method: "POST", body: JSON.stringify(req) }),
  // Called once a BrandCredential login has been generated for this lead —
  // the request is removed rather than flagged, mirroring creator-request promote.
  remove: (id) => request(`/api/client-requests/${id}`, { method: "DELETE" }),
};

// ── Creator Requests (Requests › Creator Requests) ───────────────────────────
// The landing page's "Apply as a creator" form POSTs; the founder inbox uses
// list/update. Backend fires the founder email on create (mailer.js).
export const CreatorRequestsAPI = {
  list: (status) => request(`/api/creator-requests${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  create: (req) => request("/api/creator-requests", { method: "POST", body: JSON.stringify(req) }),
  update: (id, patch) =>
    request(`/api/creator-requests/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  // Promotion into the creators directory is two calls on purpose: `checkPromote`
  // is a dry run that reports whether the handle already exists, so the confirm
  // modal can say what will actually happen; `promote` then writes. Without
  // `overwrite` the backend refuses to clobber an existing row (409).
  checkPromote: (id) => request(`/api/creator-requests/${id}/promote`),
  promote: (id, overwrite = false) =>
    request(`/api/creator-requests/${id}/promote`, {
      method: "POST",
      body: JSON.stringify({ overwrite }),
    }),
};

// Generic CRUD client factory matching the backend's registerCrudRoutes shape.
function crud(basePath) {
  return {
    list: () => request(basePath),
    create: (item) => request(basePath, { method: "POST", body: JSON.stringify(item) }),
    update: (id, patch) => request(`${basePath}/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    remove: (id) => request(`${basePath}/${id}`, { method: "DELETE" }),
  };
}

export const InvoicesAPI = crud("/api/invoices");
export const ExpensesAPI = crud("/api/expenses");
export const PurchaseOrdersAPI = crud("/api/purchase-orders");
export const ClientPOsAPI = crud("/api/client-pos");
export const QuotesAPI = crud("/api/quotes");

export const InstagramAPI = {
  lookup: (handle) => request(`/api/instagram?handle=${encodeURIComponent(handle)}`),
};

// Same response shape as InstagramAPI.lookup so the Add Creator fetched-profile
// card renders both platforms unchanged.
export const YouTubeAPI = {
  lookup: (handle) => request(`/api/youtube?handle=${encodeURIComponent(handle)}`),
};

// Deliverables tab tracking — backend dispatches IG (HikerAPI) / YT (Data API)
// on the link, returns { views, likes, comments, forwards, fetchedAt }.
export const PostMetricsAPI = {
  fetch: (url, platform) =>
    request(`/api/post-metrics?url=${encodeURIComponent(url)}&platform=${encodeURIComponent(platform || "")}`),
};

// ── Auth ─────────────────────────────────────────────────────────────────────
// Backend login (sha256 hashKey check server-side against the users
// collection). The DB is the only credential store — no client-side fallback.
export const AuthAPI = {
  login: (email, password) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
};

// Founder-only credential management (Auth page). Both clients share the
// backend's registerAuthCrudRoutes shape: password → hashKey + encrypted
// passKey server-side, ids are backend-assigned (u10, bc3, …), DELETE is a
// hard delete so the id sequence stays consistent. `password(id)` decrypts
// the stored passKey so the founder can see the actual password.
function authCrud(basePath) {
  return {
    list: () => request(basePath),
    create: (item) => request(basePath, { method: "POST", body: JSON.stringify(item) }),
    update: (id, patch) => request(`${basePath}/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    remove: (id) => request(`${basePath}/${id}`, { method: "DELETE" }),
    password: (id) => request(`${basePath}/${id}/password`),

    // Profile photo. The bytes never travel in a list or login payload — the
    // record carries `hasAvatar` + `avatarUpdatedAt` and this builds the <img>
    // src from them. BASE-prefixed so it resolves against the API, not the SPA.
    //
    // `?v=` is the record's own avatarUpdatedAt: the backend serves the image
    // with a one-year immutable cache, so without a changing URL a replaced
    // photo would keep showing the old one until the user hard-reloaded. Returns
    // null when there's nothing to fetch, so callers render initials instead of
    // requesting a guaranteed 404.
    avatarUrl: (record) => {
      const id = typeof record === "string" ? record : record?.id;
      if (!id || (typeof record === "object" && !record?.hasAvatar)) return null;
      const v = typeof record === "object" && record?.avatarUpdatedAt
        ? `?v=${encodeURIComponent(record.avatarUpdatedAt)}`
        : "";
      return `${BASE}${basePath}/${encodeURIComponent(id)}/avatar${v}`;
    },
  };
}

export const UsersAPI = authCrud("/api/users");
export const BrandCredentialsAPI = authCrud("/api/brand-credentials");

// ── Creators (founder directory) ─────────────────────────────────────────────
export const CreatorsAPI = {
  list: (brandId) => request(`/api/creators${brandId ? `?brandId=${encodeURIComponent(brandId)}` : ""}`),
  // Founder edit from the directory — the backend propagates the patch to the
  // creator's entries across campaigns so the directory stays the source of truth.
  update: (id, patch) =>
    request(`/api/creators/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
};

// ── Invoice PDFs ─────────────────────────────────────────────────────────────
// The backend renders the PDF (pdfkit) and stores it in GridFS; the returned
// pdfUrl streams it back. BASE-prefixed absolute URL so window.open works.
export const InvoicePdfAPI = {
  generate: (invoiceNo, payload) =>
    request(`/api/invoices/${encodeURIComponent(invoiceNo)}/pdf`, { method: "POST", body: JSON.stringify(payload) }),
  url: (invoiceNo) => `${BASE}/api/invoices/${encodeURIComponent(invoiceNo)}/pdf`,
};

export const CampaignsAPI = {
  list: () => request("/api/campaigns"),
  create: (campaign) =>
    request("/api/campaigns", { method: "POST", body: JSON.stringify(campaign) }),
  update: (id, patch) =>
    request(`/api/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  // actor lands on the campaign's timeline ("Campaign deleted" audit entry)
  remove: (id, actor) => request(`/api/campaigns/${id}${actor ? `?actor=${encodeURIComponent(actor)}` : ""}`, { method: "DELETE" }),
};
