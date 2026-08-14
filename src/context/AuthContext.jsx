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

  // Merge fields into the signed-in user, in state AND in sessionStorage.
  //
  // Exists for the Profile page: when you change your own photo or title, the
  // record the backend returns has to replace the session copy, or the app
  // shell's chip keeps rendering the old one until the next sign-in — and a
  // reload would silently restore the stale version from sessionStorage.
  //
  // A merge rather than a replace: the login payload carries fields no other
  // endpoint returns (notably `email`, which is `username` renamed server-side),
  // and a PATCH response overwriting the whole object would drop them.
  const updateUser = useCallback((patch) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      try { sessionStorage.setItem("5av_user", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

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
        updateUser,
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

// This file owns authentication only. Campaign visibility is `canSee()` in
// pages/Campaigns/index.jsx — one rule, kept next to the thing it governs.
