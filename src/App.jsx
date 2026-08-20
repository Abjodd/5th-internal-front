/**
 * 5th Avenue — App.jsx
 * Route table. Login is public; everything else is protected.
 * AuthProvider wraps the whole tree so useAuth() works everywhere.
 */
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./routes/ProtectedRoute";
import AppShell from "./layout/AppShell";
import Campaigns from "./pages/Campaigns";
import Billing from "./pages/Billing";
import Summary from "./pages/Summary";
import Creators from "./pages/Creators";
import Requests from "./pages/Requests";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";

// Lazy because it is the only consumer of three.js (~600KB). Statically
// imported, every authenticated page downloaded a renderer it never used.
const LoginPage = lazy(() => import("./pages/Login"));

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
            <Route path="/auth"      element={<Auth />} />
            {/* Not a SECTION — deliberately absent from routes/sections.js, so
                it never appears as a nav tab or in the command palette. It is
                reached from the shell's user chip, and it is every role's own
                page rather than something access-controlled. */}
            <Route path="/profile"   element={<Profile />} />
            {/* Client Requests was its own section before the two inboxes were
                merged — keep old bookmarks working rather than bouncing them
                to Summary via the catch-all below. */}
            <Route path="/client-requests" element={<Navigate to="/requests" replace />} />
            <Route path="/"          element={<Navigate to="/summary" replace />} />
            <Route path="*"          element={<Navigate to="/summary" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
