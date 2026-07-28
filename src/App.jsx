/**
 * 5th Avenue — App.jsx
 * Route table. Login is public; everything else is protected.
 * AuthProvider wraps the whole tree so useAuth() works everywhere.
 */
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./routes/ProtectedRoute";
import AppShell from "./layout/AppShell";
import LoginPage from "./pages/Login";
import Campaigns from "./pages/Campaigns";
import Billing from "./pages/Billing";
import Summary from "./pages/Summary";
import Creators from "./pages/Creators";
import Requests from "./pages/Requests";
import Auth from "./pages/Auth";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

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
