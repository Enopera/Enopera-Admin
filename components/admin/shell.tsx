"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ADM } from "@/lib/admin/tokens";
import { AdmIcons } from "@/lib/admin/icons";
import { AdmAvatar, AdmWordmark } from "@/lib/admin/primitives";
import { useIsMobile } from "@/lib/admin/use-is-mobile";
import type { PageId } from "@/components/admin/nav";
import { useAdminContext } from "@/lib/admin/admin-context";

export type { PageId };
export const ADM_SIDEBAR_W = 220;

const NAV_ITEMS: { id: PageId; label: string; icon: () => ReactNode }[] = [
  { id: "ordini",     label: "Ordini",     icon: () => AdmIcons.package(16) },
  { id: "ristoranti", label: "Ristoranti", icon: () => AdmIcons.store(16) },
  { id: "listini",    label: "Listini",    icon: () => AdmIcons.tag(16) },
  { id: "utenti",     label: "Utenti",     icon: () => AdmIcons.user(16) },
  { id: "vini",       label: "Vini",       icon: () => AdmIcons.bottle(16) },
];

/// Wrapper combinato: sidebar (desktop) + topstrip + content + bottom-nav
/// (mobile). Le pagine lo usano come root invece di mettere insieme
/// manualmente i pezzi.
export function AdmShell({
  active,
  crumb,
  sub,
  children,
}: {
  active: PageId;
  crumb: string;
  sub?: string;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();

  return (
    <div style={{
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      width: "100%",
      minHeight: "100vh",
    }}>
      {!isMobile && <AdmSidebar active={active} />}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        position: "relative",
        paddingBottom: isMobile ? 64 : 0, // spazio per bottom nav
      }}>
        <AdmTopstrip crumb={crumb} sub={sub} isMobile={isMobile} />
        {children}
      </div>
      {isMobile && <AdmBottomNav active={active} />}
    </div>
  );
}

export function AdmSidebar({ active }: { active: PageId }) {
  return (
    <div style={{
      width: ADM_SIDEBAR_W, flexShrink: 0,
      borderRight: `1px solid ${ADM.line}`, background: ADM.panel,
      display: "flex", flexDirection: "column",
      padding: "20px 12px 16px", gap: 4,
      height: "100vh", position: "sticky", top: 0,
    }}>
      <div style={{ padding: "0 8px 18px" }}>
        <AdmWordmark size={20} />
      </div>
      {NAV_ITEMS.map((it) => {
        const isActive = active === it.id;
        return (
          <Link key={it.id} href={`/${it.id}`} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 6,
            background: isActive ? ADM.carmineWash : "transparent",
            color: isActive ? ADM.carmine : ADM.inkSoft,
            fontFamily: ADM.sans, fontSize: 13, fontWeight: isActive ? 600 : 500,
            cursor: "pointer", textDecoration: "none",
          }}>
            <span style={{ display: "flex" }}>{it.icon()}</span>
            <span>{it.label}</span>
          </Link>
        );
      })}
      <div style={{ flex: 1 }} />
      <AdmUserCard />
    </div>
  );
}

function AdmUserCard() {
  const { username } = useAdminContext();
  // Initials: se username "nome.cognome" prendi N + C, altrimenti prime 2 lettere
  const parts = username.split(/[._-]/).filter(Boolean);
  const initials = (parts.length >= 2
    ? parts[0][0] + parts[1][0]
    : username.slice(0, 2)
  ).toUpperCase() || "??";

  return (
    <form
      action="/api/admin/logout"
      method="POST"
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 10px", borderRadius: 8, background: ADM.panelAlt,
        border: `1px solid ${ADM.line}`,
      }}
    >
      <AdmAvatar initials={initials} size={30} tone="ink" />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontFamily: ADM.sans, fontSize: 12.5, fontWeight: 600, color: ADM.ink,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }} title={username}>{username}</div>
        <div style={{ fontFamily: ADM.sans, fontSize: 11, color: ADM.inkSoft }}>Sessione amministratore</div>
      </div>
      <button
        type="submit"
        title="Esci"
        aria-label="Esci"
        style={{
          padding: "6px 8px",
          background: "transparent",
          border: `1px solid ${ADM.line}`,
          borderRadius: 6,
          color: ADM.inkSoft,
          fontFamily: ADM.sans,
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Esci
      </button>
    </form>
  );
}

export function AdmTopstrip({
  crumb,
  sub,
  isMobile = false,
}: {
  crumb: string;
  sub?: string;
  isMobile?: boolean;
}) {
  return (
    <div style={{
      height: 52, borderBottom: `1px solid ${ADM.line}`, background: ADM.panel,
      display: "flex", alignItems: "center",
      padding: isMobile ? "0 16px" : "0 36px",
      gap: 14, flexShrink: 0,
    }}>
      {isMobile && (
        <div style={{ display: "flex", alignItems: "center", marginRight: 4 }}>
          <AdmWordmark size={16} />
        </div>
      )}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        fontFamily: ADM.sans, fontSize: isMobile ? 12 : 13, color: ADM.inkSoft,
        minWidth: 0, flex: 1,
      }}>
        <span style={{
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{crumb}</span>
        {sub && (
          <>
            <span style={{ color: ADM.inkMuted, display: "flex" }}>{AdmIcons.chevronRight(11)}</span>
            <span style={{
              color: ADM.ink, fontWeight: 600,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{sub}</span>
          </>
        )}
      </div>
    </div>
  );
}

/// Bottom-nav mobile: 2 voci grandi tappabili (Ordini, Utenti). Sostituisce
/// la sidebar sui device sotto la breakpoint.
export function AdmBottomNav({ active }: { active: PageId }) {
  return (
    <nav style={{
      position: "fixed", left: 0, right: 0, bottom: 0,
      height: 64, background: ADM.panel,
      borderTop: `1px solid ${ADM.line}`,
      display: "flex", zIndex: 40,
    }}>
      {NAV_ITEMS.map((it) => {
        const isActive = active === it.id;
        return (
          <Link key={it.id} href={`/${it.id}`} style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 4,
            color: isActive ? ADM.carmine : ADM.inkSoft,
            textDecoration: "none",
            background: isActive ? ADM.carmineWash : "transparent",
          }}>
            <span style={{ display: "flex" }}>{it.icon()}</span>
            <span style={{
              fontFamily: ADM.sans, fontSize: 11, fontWeight: isActive ? 600 : 500,
              letterSpacing: 0.3,
            }}>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
