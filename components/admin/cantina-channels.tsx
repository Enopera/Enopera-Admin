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

import { useEffect, useMemo, useRef, useState } from "react";
import { ADM } from "@/lib/admin/tokens";
import { AdmIcons } from "@/lib/admin/icons";
import { fmtEUR, wineSwatch } from "@/lib/admin/primitives";
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
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableWines.slice(0, 60);
    return availableWines.filter((w) => {
      const hay = [w.name, w.producer, w.vintage?.toString()]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    }).slice(0, 60);
  }, [availableWines, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  useEffect(() => { setHighlight(0); }, [query, open]);

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

  const choose = (w: CatalogWineOption) => {
    onAdd(w.id);
    setQuery("");
    // Tengo il focus per aggiungere piu' vini di fila senza riaprire.
    inputRef.current?.focus();
  };

  return (
    <div
      ref={wrapRef}
      style={{
        padding: "12px 14px", borderTop: `1px solid ${ADM.line}`,
        background: ADM.panelAlt,
      }}
    >
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        border: `1px solid ${ADM.line}`, borderRadius: 6,
        background: ADM.white, padding: "0 8px 0 10px",
      }}>
        <span style={{ display: "flex", color: ADM.inkSoft, flexShrink: 0 }}>
          {AdmIcons.search(14)}
        </span>
        <input
          ref={inputRef}
          value={query}
          disabled={pending}
          onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault(); setOpen(true);
              setHighlight((h) => Math.min(filtered.length - 1, h + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(0, h - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const w = filtered[highlight];
              if (w) choose(w);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Cerca e aggiungi un vino…"
          style={{
            flex: 1, minWidth: 0, padding: "9px 0",
            border: "none", outline: "none", background: "transparent",
            fontFamily: ADM.sans, fontSize: 13, color: ADM.ink,
          }}
        />
        {query && (
          <span
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            style={{ display: "flex", color: ADM.inkSoft, cursor: "pointer" }}
          >
            {AdmIcons.close(12)}
          </span>
        )}
      </div>

      {open && (
        <div style={{
          marginTop: 6,
          border: `1px solid ${ADM.line}`, borderRadius: 6,
          background: ADM.white, overflow: "hidden",
          maxHeight: 260, overflowY: "auto",
        }}>
          {filtered.length === 0 ? (
            <div style={{
              padding: "12px 12px", fontFamily: ADM.serif, fontStyle: "italic",
              fontSize: 13, color: ADM.inkSoft, textAlign: "center",
            }}>
              Nessun vino trovato.
            </div>
          ) : (
            filtered.map((w, idx) => {
              const isHi = idx === highlight;
              return (
                <button
                  type="button"
                  key={w.id}
                  disabled={pending}
                  onMouseDown={(e) => { e.preventDefault(); choose(w); }}
                  onMouseEnter={() => setHighlight(idx)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", textAlign: "left",
                    padding: "8px 12px", border: "none",
                    borderBottom: idx === filtered.length - 1 ? "none" : `1px solid ${ADM.lineSoft}`,
                    background: isHi ? ADM.panelAlt : "transparent",
                    cursor: pending ? "not-allowed" : "pointer",
                    fontFamily: ADM.sans,
                  }}
                >
                  <span style={{
                    width: 5, height: 26, borderRadius: 3,
                    background: wineSwatch(w.type), flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: "block",
                      fontFamily: ADM.serif, fontSize: 14, fontWeight: 500, color: ADM.ink,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{w.name}</span>
                    <span style={{
                      display: "block",
                      fontSize: 11, color: ADM.inkSoft, marginTop: 1,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {[w.producer, w.vintage].filter(Boolean).join(" · ") || "—"}
                      {" · "}{fmtEUR(w.price)}
                    </span>
                  </span>
                  <span style={{
                    display: "flex", color: accent, flexShrink: 0,
                  }}>{AdmIcons.plus(14)}</span>
                </button>
              );
            })
          )}
          {!query.trim() && availableWines.length > filtered.length && (
            <div style={{
              padding: "8px 12px", fontFamily: ADM.sans, fontSize: 11,
              color: ADM.inkSoft, textAlign: "center",
              borderTop: `1px solid ${ADM.lineSoft}`, background: ADM.panelAlt,
            }}>
              Mostro i primi 60 di {availableWines.length}. Scrivi per filtrare.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
