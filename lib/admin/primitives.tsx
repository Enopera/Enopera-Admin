import type { CSSProperties, ReactNode } from "react";
import { ADM } from "./tokens";

// ─── Status pill ────────────────────────────────────────────
type StatusValue =
  | "attivo" | "sospeso" | "invitato"
  | "emessa" | "inviata" | "pagata" | "scaduta"
  | "effettuato" | "inConsegna" | "consegnato";

export function AdmStatus({ value }: { value: StatusValue }) {
  const map: Record<string, { fg: string; bg: string; dot: string; label: string }> = {
    attivo:    { fg: ADM.green, bg: ADM.greenWash, dot: ADM.green, label: "Attivo" },
    sospeso:   { fg: ADM.red,   bg: ADM.redWash,   dot: ADM.red,   label: "Sospeso" },
    invitato:  { fg: ADM.amber, bg: ADM.amberWash, dot: ADM.amber, label: "Invitato" },
    emessa:    { fg: ADM.amber, bg: ADM.amberWash, dot: ADM.amber, label: "Emessa" },
    inviata:   { fg: ADM.gold,  bg: ADM.goldWash,  dot: ADM.gold,  label: "Inviata" },
    pagata:    { fg: ADM.green, bg: ADM.greenWash, dot: ADM.green, label: "Pagata" },
    scaduta:   { fg: ADM.red,   bg: ADM.redWash,   dot: ADM.red,   label: "Scaduta" },
    effettuato:{ fg: ADM.carmine, bg: ADM.carmineWash, dot: ADM.carmine, label: "Effettuato" },
    inConsegna:{ fg: ADM.gold,  bg: ADM.goldWash,  dot: ADM.gold,  label: "In consegna" },
    consegnato:{ fg: ADM.green, bg: ADM.greenWash, dot: ADM.green, label: "Consegnato" },
  };
  const s = map[value] || map.attivo;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 10px 3px 8px", borderRadius: 999,
      background: s.bg, color: s.fg, fontFamily: ADM.sans,
      fontSize: 11.5, fontWeight: 600, letterSpacing: 0.1,
      border: `1px solid ${s.fg}22`, lineHeight: 1.3,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />
      {s.label}
    </span>
  );
}

// ─── Channel badge ──────────────────────────────────────────
export function AdmChannel({ value, size = "md" }: { value: "contoVendita" | "distribuzione"; size?: "sm" | "md" }) {
  const isCV = value === "contoVendita";
  const fg = isCV ? ADM.gold : ADM.carmine;
  const bg = isCV ? ADM.goldWash : ADM.carmineWash;
  const label = isCV ? "Conto vendita" : "Distribuzione";
  const pad = size === "sm" ? "2px 8px" : "3px 10px";
  const fs = size === "sm" ? 10.5 : 11.5;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: pad, borderRadius: 4, background: bg, color: fg,
      fontFamily: ADM.sans, fontSize: fs, fontWeight: 600, letterSpacing: 0.2,
      lineHeight: 1.3,
    }}>{label}</span>
  );
}

// ─── Avatar ─────────────────────────────────────────────────
export function AdmAvatar({ initials, size = 32, tone = "carmine" }: { initials: string; size?: number; tone?: "carmine" | "gold" | "ink" | "green" }) {
  const palettes: Record<string, { bg: string; fg: string }> = {
    carmine: { bg: ADM.carmineWash, fg: ADM.carmine },
    gold:    { bg: ADM.goldWash,    fg: ADM.gold },
    ink:     { bg: ADM.panelAlt,    fg: ADM.ink },
    green:   { bg: ADM.greenWash,   fg: ADM.green },
  };
  const p = palettes[tone] || palettes.carmine;
  return (
    <div style={{
      width: size, height: size, borderRadius: 6, background: p.bg,
      color: p.fg, display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: ADM.sans, fontWeight: 600, fontSize: size * 0.36, letterSpacing: 0.4,
      flexShrink: 0,
    }}>{initials}</div>
  );
}

// ─── Button ─────────────────────────────────────────────────
type BtnKind = "primary" | "secondary" | "ghost" | "danger";
type BtnSize = "sm" | "md" | "lg";

export function AdmBtn({
  children, kind = "ghost", icon, size = "md", onClick, style, type = "button",
}: {
  children: ReactNode;
  kind?: BtnKind;
  icon?: ReactNode;
  size?: BtnSize;
  onClick?: () => void;
  style?: CSSProperties;
  type?: "button" | "submit";
}) {
  const styles: Record<BtnKind, { bg: string; fg: string; border: string }> = {
    primary:   { bg: ADM.carmine, fg: "#fbf6e8", border: ADM.carmine },
    secondary: { bg: ADM.panel, fg: ADM.ink, border: ADM.line },
    ghost:     { bg: "transparent", fg: ADM.ink, border: "transparent" },
    danger:    { bg: "transparent", fg: ADM.red, border: ADM.red + "33" },
  };
  const s = styles[kind];
  const heights: Record<BtnSize, number> = { sm: 28, md: 34, lg: 40 };
  return (
    <button type={type} onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      height: heights[size], padding: size === "sm" ? "0 10px" : "0 14px",
      background: s.bg, color: s.fg,
      border: `1px solid ${s.border}`,
      borderRadius: 6, fontFamily: ADM.sans, fontWeight: 500,
      fontSize: size === "sm" ? 12 : 13, letterSpacing: 0.1,
      cursor: "pointer", whiteSpace: "nowrap",
      ...style,
    }}>
      {icon}
      {children}
    </button>
  );
}

// ─── Wordmark ───────────────────────────────────────────────
export function AdmWordmark({ size = 22, suffix = "Admin" }: { size?: number; suffix?: string | null }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span style={{
        fontFamily: ADM.serif, fontWeight: 600, fontSize: size,
        color: ADM.ink, letterSpacing: -0.4, lineHeight: 1,
      }}>Enopera</span>
      {suffix ? (
        <span style={{
          fontFamily: ADM.sans, fontSize: size * 0.42, color: ADM.inkSoft,
          textTransform: "uppercase", letterSpacing: 2, fontWeight: 600,
        }}>{suffix}</span>
      ) : null}
    </div>
  );
}

// ─── Initials helper ────────────────────────────────────────
export const initials = (name: string) =>
  name.split(" ").slice(0, 2).map((w) => w[0]).join("");

export const fmtEUR = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export const wineSwatch = (type: string) =>
  type === "Bianco" ? "#e8d68a"
  : type === "Rosato" ? "#d49a8e"
  : type === "Bolle" ? "#d4cb8e"
  : "#5a1820";
