"use client";

// Componenti riutilizzabili per la visualizzazione/modifica della cantina
// di un cliente. Usati sia dalla pagina /cantine (legacy, sarà rimossa
// dalla nav) sia dal modal del ristorante in /ristoranti.
//
// Espongono:
//   <ChannelColumn> — una colonna (Distribuzione o Conto vendita) con header,
//     righe vino, e dropdown "Aggiungi vino"
//   <InventoryRow> — singola riga vino con stepper qty, sposta canale, rimuovi
//   <AddWineDropdown> — selettore vino dal catalogo + bottone aggiungi

import { useState } from "react";
import { ADM } from "@/lib/admin/tokens";
import { AdmIcons } from "@/lib/admin/icons";
import { AdmBtn, fmtEUR, wineSwatch } from "@/lib/admin/primitives";
import type {
  AdminCustomerInventoryRow,
  CatalogWineOption,
  WineChannel,
} from "@/lib/customer-inventory/types";

export function ChannelColumn({
  title, subtitle, accent, accentBg,
  rows, otherChannel, otherChannelLabel,
  availableWines, pending,
  onMove, onSetQty, onAdd, onRemove,
}: {
  title: string;
  subtitle: string;
  accent: string;
  accentBg: string;
  rows: AdminCustomerInventoryRow[];
  otherChannel: WineChannel;
  otherChannelLabel: string;
  availableWines: CatalogWineOption[];
  pending: boolean;
  onMove: (id: string, ch: WineChannel) => void;
  onSetQty: (id: string, qty: number) => void;
  onAdd: (wineId: string) => void;
  onRemove: (id: string) => void;
}) {
  const totalQty = rows.reduce((s, r) => s + r.qtyInStock, 0);

  return (
    <div style={{
      background: ADM.panel, border: `1px solid ${ADM.line}`, borderRadius: 10,
      overflow: "hidden",
    }}>
      <div style={{
        padding: "14px 16px",
        borderBottom: `1px solid ${ADM.line}`,
        background: accentBg,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: ADM.sans, fontSize: 11, color: accent,
            letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 600,
          }}>{title}</div>
          <div style={{
            fontFamily: ADM.serif, fontStyle: "italic", fontSize: 13,
            color: ADM.inkSoft, marginTop: 2,
          }}>{subtitle}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{
            fontFamily: ADM.serif, fontSize: 22, fontWeight: 600, color: accent,
            fontVariantNumeric: "tabular-nums", lineHeight: 1,
          }}>{totalQty}</div>
          <div style={{
            fontFamily: ADM.sans, fontSize: 10.5, color: ADM.inkSoft,
            letterSpacing: 0.6, textTransform: "uppercase", marginTop: 3,
          }}>{rows.length} vin{rows.length === 1 ? "o" : "i"}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{
          padding: 28, textAlign: "center",
          fontFamily: ADM.serif, fontStyle: "italic",
          fontSize: 14, color: ADM.inkSoft,
        }}>
          Nessun vino in questo canale.
        </div>
      ) : (
        rows.map((r, idx) => (
          <InventoryRow
            key={r.id}
            row={r}
            isLast={idx === rows.length - 1}
            accent={accent}
            otherChannel={otherChannel}
            otherChannelLabel={otherChannelLabel}
            pending={pending}
            onMove={onMove}
            onSetQty={onSetQty}
            onRemove={onRemove}
          />
        ))
      )}

      <AddWineDropdown
        availableWines={availableWines}
        pending={pending}
        accent={accent}
        onAdd={onAdd}
      />
    </div>
  );
}

export function InventoryRow({
  row, isLast, accent, otherChannel, otherChannelLabel,
  pending, onMove, onSetQty, onRemove,
}: {
  row: AdminCustomerInventoryRow;
  isLast: boolean;
  accent: string;
  otherChannel: WineChannel;
  otherChannelLabel: string;
  pending: boolean;
  onMove: (id: string, ch: WineChannel) => void;
  onSetQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}) {
  const [qty, setQty] = useState(row.qtyInStock);
  const propQty = row.qtyInStock;
  if (qty !== propQty && !pending) {
    queueMicrotask(() => setQty(propQty));
  }

  const commitQty = () => {
    const next = Math.max(0, Math.round(qty));
    if (next === row.qtyInStock) return;
    onSetQty(row.id, next);
  };

  return (
    <div style={{
      padding: "12px 14px",
      borderBottom: isLast ? "none" : `1px solid ${ADM.lineSoft}`,
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{
        width: 6, height: 36, borderRadius: 3,
        background: wineSwatch(row.wineType), flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: ADM.serif, fontSize: 15, fontWeight: 500, color: ADM.ink,
          lineHeight: 1.2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{row.wineName}</div>
        <div style={{
          fontFamily: ADM.sans, fontSize: 11, color: ADM.inkSoft, marginTop: 2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {[row.wineProducer, row.wineVintage].filter(Boolean).join(" · ") || "—"}
          {" · "}{fmtEUR(row.winePrice)}
        </div>
      </div>
      <div style={{
        display: "flex", alignItems: "center",
        border: `1px solid ${ADM.line}`, borderRadius: 6,
        background: ADM.white, flexShrink: 0,
      }}>
        <button
          type="button"
          disabled={pending || qty <= 0}
          onClick={() => {
            const next = Math.max(0, qty - 1);
            setQty(next);
            onSetQty(row.id, next);
          }}
          style={{
            width: 28, height: 30, border: "none", background: "transparent",
            cursor: pending ? "not-allowed" : "pointer",
            color: pending || qty <= 0 ? ADM.inkMuted : ADM.ink,
            fontSize: 16, fontFamily: ADM.sans, padding: 0,
          }}
        >−</button>
        <input
          value={qty}
          onChange={(e) => {
            const n = Number(e.target.value);
            setQty(Number.isFinite(n) ? Math.max(0, n) : 0);
          }}
          onBlur={commitQty}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          type="number"
          min={0}
          style={{
            width: 44, height: 30, border: "none", outline: "none",
            background: "transparent", textAlign: "center",
            fontFamily: ADM.sans, fontSize: 13, color: ADM.ink,
            fontVariantNumeric: "tabular-nums",
          }}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const next = qty + 1;
            setQty(next);
            onSetQty(row.id, next);
          }}
          style={{
            width: 28, height: 30, border: "none", background: "transparent",
            cursor: pending ? "not-allowed" : "pointer",
            color: pending ? ADM.inkMuted : ADM.ink,
            fontSize: 16, fontFamily: ADM.sans, padding: 0,
          }}
        >+</button>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => onMove(row.id, otherChannel)}
        title={`Sposta in ${otherChannelLabel}`}
        style={{
          height: 30, padding: "0 10px",
          border: `1px solid ${accent}55`,
          borderRadius: 6,
          background: "transparent", color: accent,
          cursor: pending ? "not-allowed" : "pointer",
          fontFamily: ADM.sans, fontSize: 11.5, fontWeight: 600, letterSpacing: 0.2,
          display: "inline-flex", alignItems: "center", gap: 4,
          flexShrink: 0, whiteSpace: "nowrap",
        }}
      >
        <span style={{ display: "flex" }}>{AdmIcons.chevronRight(12)}</span>
        <span>Sposta</span>
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm(`Rimuovere ${row.wineName} dalla cantina?`)) onRemove(row.id);
        }}
        title="Rimuovi dalla cantina"
        style={{
          width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
          border: `1px solid ${ADM.line}`, borderRadius: 6,
          background: "transparent", color: ADM.inkSoft,
          cursor: pending ? "not-allowed" : "pointer", flexShrink: 0,
        }}
      >
        {AdmIcons.trash(13)}
      </button>
    </div>
  );
}

export function AddWineDropdown({
  availableWines, pending, accent, onAdd,
}: {
  availableWines: CatalogWineOption[];
  pending: boolean;
  accent: string;
  onAdd: (wineId: string) => void;
}) {
  const [selectId, setSelectId] = useState("");

  if (availableWines.length === 0) {
    return (
      <div style={{
        padding: "12px 14px", borderTop: `1px solid ${ADM.line}`,
        background: ADM.panelAlt,
        fontFamily: ADM.serif, fontStyle: "italic", fontSize: 12.5,
        color: ADM.inkSoft, textAlign: "center",
      }}>
        Tutti i vini del catalogo sono già in cantina.
      </div>
    );
  }

  return (
    <div style={{
      padding: "12px 14px", borderTop: `1px solid ${ADM.line}`,
      background: ADM.panelAlt,
      display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
    }}>
      <select
        value={selectId}
        onChange={(e) => setSelectId(e.target.value)}
        disabled={pending}
        style={{
          flex: 1, minWidth: 140,
          padding: "8px 10px",
          border: `1px solid ${ADM.line}`, borderRadius: 6,
          background: ADM.white,
          fontFamily: ADM.sans, fontSize: 13, color: ADM.ink,
          cursor: "pointer", outline: "none",
        }}
      >
        <option value="">+ Aggiungi vino…</option>
        {availableWines.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}{w.producer ? ` · ${w.producer}` : ""}{w.vintage ? ` · ${w.vintage}` : ""}
          </option>
        ))}
      </select>
      <AdmBtn
        kind="secondary"
        size="sm"
        onClick={() => {
          if (selectId) {
            onAdd(selectId);
            setSelectId("");
          }
        }}
        style={{ borderColor: accent + "55", color: accent }}
      >
        Aggiungi
      </AdmBtn>
    </div>
  );
}
