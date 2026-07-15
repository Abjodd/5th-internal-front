/**
 * 5th Avenue — AuthContext
 * Holds the logged-in user. Login goes through the backend
 * (POST /api/auth/login — sha256 hashKey check against the users collection,
 * managed from the founder-only Auth page). If the backend is unreachable
 * (local dev without the API running), we fall back to the USERS directory
 * below so the app stays usable offline.
 * Every component that needs the current user imports useAuth().
 */
import { createContext, useContext, useState, useCallback } from "react";
import { AuthAPI } from "../lib/api";

// ── FALLBACK USER DIRECTORY ──────────────────────────────────────────────────
// Mirrors seed_users.js in 5th-internal-back — the DB is the source of truth;
// this list is only consulted when the backend can't be reached.
// Each user maps to a TEAM member id (teamId) so campaigns can be filtered
// by "does this user own this campaign's amId / cmId / eaId?"
export const USERS = [
  { id:"u1",  teamId:"t8",  name:"Aisha Founder",  email:"founder@5thavenue.in",  password:"founder123",  role:"founder",       avatar:"AF", title:"Founder"                   },
  { id:"u2",  teamId:"t0",  name:"Rohan Mehta",    email:"rohan@5thavenue.in",    password:"pcm123",      role:"pcm",           avatar:"RM", title:"Partner Category Manager"  },
  { id:"u3",  teamId:"t1",  name:"Priya Nair",     email:"priya@5thavenue.in",    password:"cm123",       role:"cm",            avatar:"PN", title:"Category Manager"          },
  { id:"u4",  teamId:"t2",  name:"Vikram Das",     email:"vikram@5thavenue.in",   password:"cm456",       role:"cm",            avatar:"VD", title:"Category Manager"          },
  { id:"u5",  teamId:"t7",  name:"Divya Pillai",   email:"divya@5thavenue.in",    password:"am123",       role:"am",            avatar:"DP", title:"Account Manager"           },
  { id:"u6",  teamId:"t3",  name:"Arjun Reddy",    email:"arjun@5thavenue.in",    password:"ea123",       role:"ea",            avatar:"AR", title:"Senior Executive Associate"},
  { id:"u7",  teamId:"t4",  name:"Sneha Iyer",     email:"sneha@5thavenue.in",    password:"ea456",       role:"ea",            avatar:"SI", title:"Executive Associate"       },
  { id:"u8",  teamId:"t5",  name:"Meera Joshi",    email:"meera@5thavenue.in",    password:"ea789",       role:"ea",            avatar:"MJ", title:"Executive Associate"       },
  { id:"u9",  teamId:"t9",  name:"Accounts",       email:"accounts@5thavenue.in", password:"accounts123", role:"accounts_head", avatar:"AC", title:"Accounting Head"           },
];

// ── CONTEXT ──────────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = sessionStorage.getItem("5av_user");
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  const persist = (safe) => {
    setUser(safe);
    sessionStorage.setItem("5av_user", JSON.stringify(safe));
    return { ok: true, user: safe };
  };

  const login = useCallback(async (email, password) => {
    // Backend first — users collection is the source of truth.
    try {
      const res = await AuthAPI.login(email, password);
      if (res?.ok && res.user) return persist(res.user);
      return { ok: false, error: "Invalid email or password." };
    } catch (err) {
      // 401 = wrong credentials, everything else = backend unreachable.
      if (String(err?.message).includes(" 401 "))
        return { ok: false, error: "Invalid email or password." };
    }
    // Offline fallback: check against the local directory.
    const found = USERS.find(
      u => u.email.toLowerCase() === email.toLowerCase().trim() && u.password === password
    );
    if (!found) return { ok: false, error: "Invalid email or password." };
    const { password: _, ...safe } = found;
    return persist(safe);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    sessionStorage.removeItem("5av_user");
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Helper: does this user "own" this campaign (for RBAC visibility)?
export function userCanSeeCampaign(user, camp) {
  if (!user) return false;
  const { role, teamId } = user;
  if (["founder", "accounts_head", "accounts_exec"].includes(role)) return true;
  if (role === "pcm") return true; // PCM sees all IM campaigns
  if (role === "cm")  return camp.cmId === teamId;
  if (role === "am")  return camp.amId === teamId;
  if (role === "ea")  return camp.eaId === teamId;
  return false;
}
