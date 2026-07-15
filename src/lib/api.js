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
    throw new Error(`API ${options.method || "GET"} ${path} failed: ${res.status} ${body}`);
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
};

export const FindingsAPI = {
  list: (clientId) => request(`/api/findings${clientId ? `?clientId=${clientId}` : ""}`),
  update: (id, patch) =>
    request(`/api/findings/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
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
export const RegistryAPI = crud("/api/registry");

export const InstagramAPI = {
  lookup: (handle) => request(`/api/instagram?handle=${encodeURIComponent(handle)}`),
};

// ── Auth ─────────────────────────────────────────────────────────────────────
// Real backend login (sha256 hashKey check server-side). AuthContext calls
// this first and only falls back to its local USERS directory if the backend
// is unreachable.
export const AuthAPI = {
  login: (email, password) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
};

// Founder-only credential management (Auth page). Both clients share the
// backend's registerAuthCrudRoutes shape: password → hashKey server-side,
// DELETE is a soft delete with ?actor= for the audit trail.
function authCrud(basePath) {
  return {
    list: (includeDeleted) => request(`${basePath}${includeDeleted ? "?includeDeleted=1" : ""}`),
    create: (item) => request(basePath, { method: "POST", body: JSON.stringify(item) }),
    update: (id, patch) => request(`${basePath}/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    remove: (id, actor) => request(`${basePath}/${id}${actor ? `?actor=${encodeURIComponent(actor)}` : ""}`, { method: "DELETE" }),
  };
}

export const UsersAPI = authCrud("/api/users");
export const BrandCredentialsAPI = authCrud("/api/brand-credentials");

// ── Influencers (founder directory) ──────────────────────────────────────────
export const InfluencersAPI = {
  list: (brandId) => request(`/api/influencers${brandId ? `?brandId=${encodeURIComponent(brandId)}` : ""}`),
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
