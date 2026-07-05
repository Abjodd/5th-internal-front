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
            <Route path="/"          element={<Navigate to="/campaigns" replace />} />
            <Route path="*"          element={<Navigate to="/campaigns" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
