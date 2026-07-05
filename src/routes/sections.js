/**
 * 5th Avenue — Internal Platform
 * routes/sections.js — section/route/role registry
 * ─────────────────────────────────────────────────────────────────
 * Single source of truth for: which URL each section lives at, which
 * roles can see it, its top-bar icon/color, and any special access
 * flag (e.g. Account Manager's read-only Billing view).
 *
 * AppShell (nav + guards) and App.jsx (route table) both read this so
 * they can never drift out of sync.
 */
import { T } from "../theme/tokens";

export const PLATFORM_ROLES = [
  { id: "founder",       label: "Founder",               group: "Leadership" },
  { id: "pcm",           label: "PCM (Partner Cat. Mgr)", group: "IM Team"    },
  { id: "cm",            label: "CM (Category Manager)",  group: "IM Team"    },
  { id: "am",            label: "Account Manager",        group: "IM Team"    },
  { id: "ea",            label: "Executive Associate",    group: "IM Team"    },
  { id: "accounts_head", label: "Accounting Head",        group: "Finance"    },
  { id: "accounts_exec", label: "Accounting Executive",   group: "Finance"    },
];

export const SECTIONS = [
  {
    id: "summary",
    path: "/summary",
    label: "Founder Summary",
    shortLabel: "Summary",
    icon: "◈",
    color: T.purple,
    roles: ["founder"],
  },
  {
    id: "im",
    path: "/campaigns",
    label: "IM Operations",
    shortLabel: "IM",
    icon: "◻",
    color: T.accent,
    roles: ["founder", "pcm", "cm", "am", "ea"],
  },
  {
    id: "billing",
    path: "/billing",
    label: "Billing",
    shortLabel: "Billing",
    icon: "₹",
    color: T.green,
    roles: ["founder", "accounts_head", "accounts_exec", "pcm"],
  },
  // ── AEO / AI Visibility — temporarily hidden from the nav & routes,
  // matching the original app's state. The page code lives at
  // src/pages/AEO and is fully migrated/restructured; re-enable by
  // uncommenting this entry and its <Route> in App.jsx.
  // {
  //   id: "aeo",
  //   path: "/aeo",
  //   label: "AEO / AI Visibility",
  //   shortLabel: "AEO",
  //   icon: "◉",
  //   color: T.amber,
  //   roles: ["founder","aeo_consultant","aeo_specialist","seo_analyst","content_lead","strategist"],
  // },
];

export const canAccess = (section, roleId) => section.roles.includes(roleId);
export const isAMReadOnly = (section, roleId) => !!section.amReadOnly && roleId === "am";
export const getRole = (id) => PLATFORM_ROLES.find(r => r.id === id);
export const defaultSection = SECTIONS[0];