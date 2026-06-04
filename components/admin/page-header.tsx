"use client";

import type { ReactNode } from "react";
import { ADM } from "@/lib/admin/tokens";
import { useIsMobile } from "@/lib/admin/use-is-mobile";

export function AdmPageHeader({
  kicker, title, sub, actions,
}: {
  kicker: string;
  title: string;
  sub?: string;
  actions?: ReactNode;
}) {
  const isMobile = useIsMobile();
  return (
    <div style={{
      padding: isMobile ? "20px 16px 14px" : "32px 36px 22px",
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      alignItems: isMobile ? "flex-start" : "flex-end",
      justifyContent: "space-between",
      gap: isMobile ? 12 : 20,
      borderBottom: `1px solid ${ADM.lineSoft}`,
    }}>
      <div style={{ minWidth: 0, width: "100%" }}>
        <div style={{
          fontFamily: ADM.sans, fontSize: 11, letterSpacing: 2.4, textTransform: "uppercase",
          color: ADM.inkSoft, fontWeight: 600, marginBottom: 6,
        }}>{kicker}</div>
        <div style={{
          display: "flex", alignItems: "baseline",
          gap: isMobile ? 8 : 16,
          flexWrap: "wrap",
        }}>
          <h1 style={{
            margin: 0,
            fontFamily: ADM.serif,
            fontSize: isMobile ? 30 : 44,
            fontWeight: 500, color: ADM.ink,
            letterSpacing: isMobile ? -0.8 : -1.4,
            lineHeight: 1,
          }}>{title}</h1>
          {sub && (
            <span style={{
              fontFamily: ADM.serif, fontStyle: "italic",
              fontSize: isMobile ? 14 : 18,
              color: ADM.inkSoft,
            }}>{sub}</span>
          )}
        </div>
      </div>
      {actions && (
        <div style={{
          display: "flex", gap: 8, flexShrink: 0,
          flexWrap: "wrap",
          width: isMobile ? "100%" : "auto",
        }}>{actions}</div>
      )}
    </div>
  );
}

export interface KpiItem {
  label: string;
  value: string;
  sub: string;
  delta?: string;
}

export function AdmKpiStrip({ items }: { items: KpiItem[] }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    // Scroll orizzontale: ogni KPI ha una larghezza minima, l'intero strip
    // diventa pannabile.
    return (
      <div style={{
        background: ADM.panel, borderBottom: `1px solid ${ADM.line}`,
        overflowX: "auto", WebkitOverflowScrolling: "touch",
      }}>
        <div style={{
          display: "flex", minWidth: "100%",
        }}>
          {items.map((it, i) => (
            <div key={i} style={{
              padding: "14px 18px",
              minWidth: 160,
              borderRight: i < items.length - 1 ? `1px solid ${ADM.lineSoft}` : "none",
              display: "flex", flexDirection: "column", gap: 4,
              flexShrink: 0,
            }}>
              <div style={{
                fontFamily: ADM.sans, fontSize: 10.5, color: ADM.inkSoft, letterSpacing: 1.2,
                textTransform: "uppercase", fontWeight: 600,
              }}>{it.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
                <span style={{
                  fontFamily: ADM.serif, fontSize: 22, fontWeight: 600, color: ADM.ink,
                  letterSpacing: -0.4, lineHeight: 1, fontVariantNumeric: "tabular-nums",
                }}>{it.value}</span>
                {it.delta && (
                  <span style={{
                    fontFamily: ADM.sans, fontSize: 10.5, fontWeight: 600,
                    color: it.delta.startsWith("−") ? ADM.red : ADM.green,
                  }}>{it.delta}</span>
                )}
              </div>
              <div style={{ fontFamily: ADM.sans, fontSize: 11, color: ADM.inkMuted }}>{it.sub}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`,
      borderBottom: `1px solid ${ADM.line}`, background: ADM.panel,
    }}>
      {items.map((it, i) => (
        <div key={i} style={{
          padding: "18px 22px",
          borderRight: i < items.length - 1 ? `1px solid ${ADM.lineSoft}` : "none",
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <div style={{
            fontFamily: ADM.sans, fontSize: 11, color: ADM.inkSoft, letterSpacing: 1.4,
            textTransform: "uppercase", fontWeight: 600,
          }}>{it.label}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
            <span style={{
              fontFamily: ADM.serif, fontSize: 28, fontWeight: 600, color: ADM.ink,
              letterSpacing: -0.6, lineHeight: 1, fontVariantNumeric: "tabular-nums",
            }}>{it.value}</span>
            {it.delta && (
              <span style={{
                fontFamily: ADM.sans, fontSize: 11, fontWeight: 600,
                color: it.delta.startsWith("−") ? ADM.red : ADM.green,
              }}>{it.delta}</span>
            )}
          </div>
          <div style={{ fontFamily: ADM.sans, fontSize: 11.5, color: ADM.inkMuted }}>{it.sub}</div>
        </div>
      ))}
    </div>
  );
}
