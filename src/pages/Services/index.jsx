/**
 * Services — the agency's service lines, one tab each. Founder only.
 *
 *   Consultant   live — every consultant we work with, managed internally
 *                (see Consultants.jsx). The consultant portal, built later,
 *                reads the same records; its logins are made in Settings →
 *                Consultant Login.
 *   Client flow  coming soon
 *   CRM          coming soon
 */
import { useOutletContext, useSearchParams } from "react-router-dom";
import { BriefcaseBusiness, Workflow, Contact } from "lucide-react";
import { T } from "../../theme/tokens";
import { can } from "../../lib/rbac";
import Consultants from "./Consultants";

const TABS = [
  { id: "consultant", label: "Consultant", icon: BriefcaseBusiness, blurb: "Consultants we work with — their billing, HQ, tax and contact details, POCs, brands, dedicated UGC creators and documents." },
  { id: "client-flow", label: "Client flow", icon: Workflow, soon: true, blurb: "How a client moves from first contact to a live campaign." },
  { id: "crm", label: "CRM", icon: Contact, soon: true, blurb: "Leads, conversations and follow-ups in one place." },
];

export default function Services() {
  const { user } = useOutletContext() || {};
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.id === params.get("tab")) || TABS[0];
  const go = (id) => setParams(id === TABS[0].id ? {} : { tab: id }, { replace: true });

  if (!can(user?.role, "seeServices")) {
    return <div style={{ padding: 40, fontSize: 12, color: T.sub }}>This page is restricted to the founder.</div>;
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", background: T.bg, padding: "26px 30px" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontSize: 24, fontWeight: 600, color: T.text }}>Services</div>
        <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>{tab.blurb}</div>
      </div>

      <div role="tablist" style={{ display: "flex", gap: 22, borderBottom: `1px solid ${T.border}`, marginBottom: 18 }}>
        {TABS.map((t) => {
          const on = t.id === tab.id;
          const Icon = t.icon;
          return (
            <button key={t.id} role="tab" aria-selected={on} onClick={() => go(t.id)} data-testid={`services-tab-${t.id}`}
              style={{
                position: "relative", display: "flex", alignItems: "center", gap: 7, padding: "0 0 9px",
                background: "transparent", border: "none", cursor: "pointer", fontFamily: "'Sora'", fontSize: 12,
                letterSpacing: "-0.01em", marginBottom: -1, fontWeight: on ? 600 : 400, color: on ? T.text : T.sub,
              }}>
              <Icon size={13} strokeWidth={2.1} style={{ color: on ? T.accent : T.label }} />
              {t.label}
              {t.soon && <span style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.label, border: `1px solid ${T.border}`, borderRadius: 8, padding: "1px 6px" }}>Soon</span>}
              {on && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, borderRadius: 1, background: T.accent }} />}
            </button>
          );
        })}
      </div>

      {tab.id === "consultant" && <Consultants />}
      {tab.soon && (
        <div style={{ textAlign: "center", padding: "64px 20px", border: `1px dashed ${T.borderMid}`, borderRadius: T.radius, background: T.surface }}>
          <tab.icon size={26} style={{ color: T.accent, opacity: 0.6 }} />
          <div style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontSize: 20, color: T.text, marginTop: 8 }}>{tab.label} is coming soon</div>
          <div style={{ fontSize: 11.5, color: T.sub, marginTop: 6 }}>{tab.blurb}</div>
        </div>
      )}
    </div>
  );
}
