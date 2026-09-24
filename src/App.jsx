/**
 * 5th Avenue — App.jsx
 * Route table. Login is public; everything else is protected.
 * AuthProvider wraps the whole tree so useAuth() works everywhere.
 */
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./routes/ProtectedRoute";
import { SECTIONS, canAccess } from "./routes/sections";
import AppShell from "./layout/AppShell";
import Campaigns from "./pages/Campaigns";
import Billing from "./pages/Billing";
import Summary from "./pages/Summary";
import Creators from "./pages/Creators";
import Requests from "./pages/Requests";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import PitchDraftPage from "./pages/PitchDraftPage";

// Lazy because it is the only consumer of three.js (~600KB). Statically
// imported, every authenticated page downloaded a renderer it never used.
const LoginPage = lazy(() => import("./pages/Login"));

// "/" and any unknown path used to hard-redirect to "/summary" regardless of
// role. That broke the moment Summary became founder-only (sections.js) —
// every other role would land there and immediately see AccessDenied. This
// picks the first section SECTIONS actually grants the signed-in role,
// preserving "/summary" as the founder's landing page (still first in that
// list) without hardcoding it for everyone else.
function DefaultRoute() {
  const { user } = useAuth();
  const target = SECTIONS.find(s => canAccess(s, user?.role))?.path || "/login";
  return <Navigate to={target} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Fallback is the page's own bg, not a spinner — the chunk resolves
              fast enough that a spinner would only flash. */}
          <Route path="/login" element={
            <Suspense fallback={<div style={{ minHeight: "100vh", background: "#05060D" }} />}>
              <LoginPage />
            </Suspense>
          } />

          {/* Protected — wrapped in AppShell */}
          <Route element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }>
            <Route path="/summary"   element={<Summary />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/billing"   element={<Billing />} />
            {/* Founder-only — AppShell blocks other roles via sections.js */}
            <Route path="/creators"  element={<Creators />} />
            <Route path="/requests"  element={<Requests />} />
            <Route path="/settings"  element={<Settings />} />
            {/* Pitch Client is now a modal opened from the Campaigns page
                (see PitchClientModal in pages/Campaigns/index.jsx), not a
                route of its own — send old bookmarks/tabs somewhere real. */}
            <Route path="/pitch-client" element={<Navigate to="/campaigns" replace />} />
            {/* Pitching a brand that doesn't exist yet — opened from the same
                modal's "New brand" tab, but as its own full page: a prospect
                being actively worked (the form, brief, composer) needs more
                room than the modal can give it. See pages/PitchDraftPage. */}
            <Route path="/pitch-drafts/:id" element={<PitchDraftPage />} />
            {/* Not a SECTION — deliberately absent from routes/sections.js, so
                it never appears as a nav tab or in the command palette. It is
                reached from the shell's user chip, and it is every role's own
                page rather than something access-controlled. */}
            <Route path="/profile"   element={<Profile />} />
            {/* Client Requests was its own section before the two inboxes were
                merged — keep old bookmarks working rather than bouncing them
                to Summary via the catch-all below. */}
            <Route path="/client-requests" element={<Navigate to="/requests" replace />} />
            <Route path="/auth"      element={<Navigate to="/settings" replace />} />
            <Route path="/"          element={<DefaultRoute />} />
            <Route path="*"          element={<DefaultRoute />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
