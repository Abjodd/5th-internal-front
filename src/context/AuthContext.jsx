/**
 * 5th Avenue — AuthContext
 * Authentication is completely database-driven.
 * Login is handled by POST /api/auth/login.
 * No hardcoded users or offline fallback.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
} from "react";
import { AuthAPI } from "../lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Restore logged-in user from session
  const [user, setUser] = useState(() => {
    try {
      const stored = sessionStorage.getItem("5av_user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Persist authenticated user
  const persist = useCallback((safeUser) => {
    setUser(safeUser);
    sessionStorage.setItem("5av_user", JSON.stringify(safeUser));

    return {
      ok: true,
      user: safeUser,
    };
  }, []);

  // Login (Backend only)
  const login = useCallback(async (email, password) => {
    try {
      const res = await AuthAPI.login(email, password);

      if (res?.ok && res?.user) {
        return persist(res.user);
      }

      return {
        ok: false,
        error: res?.error || "Invalid email or password.",
      };
    } catch (err) {
      console.error("Login Error:", err);

      // request() attaches the HTTP status — map it to a user-appropriate
      // message instead of surfacing the raw API error string.
      if (err?.status === 401)
        return { ok: false, error: "Invalid email or password." };
      if (err?.status)
        return { ok: false, error: "Something went wrong signing you in. Please try again." };
      return { ok: false, error: "Unable to reach the server. Check your connection and try again." };
    }
  }, [persist]);

  // Logout
  const logout = useCallback(() => {
    setUser(null);
    sessionStorage.removeItem("5av_user");
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Hook
export function useAuth() {
  return useContext(AuthContext);
}

// ─────────────────────────────────────────────────────────────────────────────
// RBAC Helper
// Determines if the logged-in user can view a campaign.
// ─────────────────────────────────────────────────────────────────────────────
export function userCanSeeCampaign(user, camp) {
  if (!user || !camp) return false;

  const { role, teamId } = user;

  switch (role) {
    case "founder":
    case "accounts_head":
    case "accounts_exec":
      return true;

    case "pcm":
      // Partner Category Manager can view all campaigns
      return true;

    case "cm":
      return camp.cmId === teamId;

    case "am":
      return camp.amId === teamId;

    case "ea":
      return camp.eaId === teamId;

    default:
      return false;
  }
}