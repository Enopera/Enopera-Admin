"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ADM } from "@/lib/admin/tokens";
import { AdmIcons } from "@/lib/admin/icons";
import { useIsMobile } from "@/lib/admin/use-is-mobile";
import { AdmPageHeader } from "@/components/admin/page-header";
import { ChannelColumn } from "@/components/admin/cantina-channels";
import type {
  AdminCustomerInventoryRow,
  CatalogWineOption,
  CustomerOption,
} from "@/lib/customer-inventory/types";
import {
  setInventoryChannel,
  setInventoryQty,
  addInventoryRow,
  removeInventoryRow,
  type ActionResult,
} from "@/lib/customer-inventory/actions";

export function CantineList({
  customers,
  inventory,
  catalog,
  selectedUserId,
}: {
  customers: CustomerOption[];
  inventory: AdminCustomerInventoryRow[];
  catalog: CatalogWineOption[];
  selectedUserId: string | null;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<ActionResult | null>(null);

  const selected = customers.find((c) => c.id === selectedUserId) ?? null;

  const { distribuzione, contoVendita } = useMemo(() => {
    const d: AdminCustomerInventoryRow[] = [];
    const cv: AdminCustomerInventoryRow[] = [];
    for (const r of inventory) {
      if (r.channel === "distribuzione") d.push(r);
      else cv.push(r);
    }
    const byName = (a: AdminCustomerInventoryRow, b: AdminCustomerInventoryRow) =>
      a.wineName.localeCompare(b.wineName);
    d.sort(byName);
    cv.sort(byName);
    return { distribuzione: d, contoVendita: cv };
  }, [inventory]);

  const wineIdsInInventory = useMemo(
    () => new Set(inventory.map((r) => r.wineId)),
    [inventory],
  );
  const availableWines = useMemo(
    () => catalog.filter((w) => !wineIdsInInventory.has(w.id)),
    [catalog, wineIdsInInventory],
  );

  const run = (fn: () => Promise<ActionResult>) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await fn();
      setFeedback(res);
      if (res.ok) router.refresh();
    });
  };

  const onSelectCustomer = (id: string) => {
    setFeedback(null);
    const params = new URLSearchParams();
    if (id) params.set("u", id);
    const qs = params.toString();
    router.replace(qs ? `/cantine?${qs}` : "/cantine");
  };

  const totalBottles = distribuzione.length + contoVendita.length;
  const totalQty = inventory.reduce((s, r) => s + r.qtyInStock, 0);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <AdmPageHeader
        kicker="Operations · Stock"
        title="Cantine cliente"
        sub={selected
          ? `${totalBottles} vini · ${totalQty} bottiglie totali`
          : "Seleziona un cliente per gestirne la cantina"}
      />

      {/* Customer selector */}
      <div style={{
        padding: isMobile ? "16px" : "20px 36px",
        borderBottom: `1px solid ${ADM.line}`,
        background: ADM.panel,
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        gap: 14,
        alignItems: isMobile ? "stretch" : "center",
      }}>
        <label style={{
          fontFamily: ADM.sans, fontSize: 11.5, color: ADM.inkSoft,
          letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600,
          flexShrink: 0,
        }}>Cliente</label>
        <CustomerSearch
          customers={customers}
          selected={selected}
          isMobile={isMobile}
          onSelect={onSelectCustomer}
        />
        {selected && (
          <div style={{
            display: "flex", flexDirection: "column", gap: 2, flexShrink: 0,
          }}>
            <span style={{
              fontFamily: ADM.sans, fontSize: 12, color: ADM.inkSoft,
            }}>{selected.email}</span>
          </div>
        )}
      </div>

      {feedback && (
        <div style={{
          margin: isMobile ? "12px 16px 0" : "16px 36px 0",
          padding: "10px 14px", borderRadius: 6,
          background: feedback.ok ? ADM.greenWash : ADM.redWash,
          color: feedback.ok ? ADM.green : ADM.red,
          fontFamily: ADM.sans, fontSize: 13, fontWeight: 500,
          border: `1px solid ${feedback.ok ? ADM.green : ADM.red}33`,
        }}>
          {feedback.ok ? feedback.message ?? "Operazione completata" : feedback.error}
        </div>
      )}

      {/* Channel columns */}
      <div style={{
        flex: 1, minHeight: 0,
        padding: isMobile ? "16px" : "24px 36px 36px",
        overflow: "auto",
      }}>
        {!selected ? (
          <div style={{
            padding: 60, textAlign: "center",
            fontFamily: ADM.serif, fontStyle: "italic",
            fontSize: 16, color: ADM.inkSoft,
          }}>
            Seleziona un cliente dal menu sopra per vedere la sua cantina.
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: isMobile ? 16 : 24,
            alignItems: "start",
          }}>
            <ChannelColumn
              title="Distribuzione"
              subtitle="Bottiglie acquistate e fatturate"
              accent={ADM.carmine}
              accentBg={ADM.carmineWash}
              rows={distribuzione}
              otherChannel="contoVendita"
              otherChannelLabel="conto vendita"
              availableWines={availableWines}
              pending={pending}
              onMove={(id, ch) => run(() => setInventoryChannel(id, ch))}
              onSetQty={(id, qty) => run(() => setInventoryQty(id, qty))}
              onAdd={(wineId) => run(() => addInventoryRow(selected.id, wineId, "distribuzione", 0))}
              onRemove={(id) => run(() => removeInventoryRow(id))}
            />
            <ChannelColumn
              title="Conto vendita"
              subtitle="Bottiglie in deposito"
              accent={ADM.gold}
              accentBg={ADM.goldWash}
              rows={contoVendita}
              otherChannel="distribuzione"
              otherChannelLabel="distribuzione"
              availableWines={availableWines}
              pending={pending}
              onMove={(id, ch) => run(() => setInventoryChannel(id, ch))}
              onSetQty={(id, qty) => run(() => setInventoryQty(id, qty))}
              onAdd={(wineId) => run(() => addInventoryRow(selected.id, wineId, "contoVendita", 0))}
              onRemove={(id) => run(() => removeInventoryRow(id))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ───────── Customer search (combobox) ─────────

function customerDisplay(c: CustomerOption): string {
  const name = c.restaurantName ?? c.fullName ?? c.email;
  const where = [c.city, c.district].filter(Boolean).join(" · ");
  return where ? `${name} · ${where}` : name;
}

function CustomerSearch({
  customers, selected, isMobile, onSelect,
}: {
  customers: CustomerOption[];
  selected: CustomerOption | null;
  isMobile: boolean;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync display value with selected customer when not actively searching.
  const displayValue = open ? query : selected ? customerDisplay(selected) : query;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers.slice(0, 50);
    const matches = customers.filter((c) => {
      const hay = [
        c.restaurantName, c.fullName, c.email, c.city, c.district,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
    return matches.slice(0, 50);
  }, [customers, query]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  const choose = (c: CustomerOption) => {
    onSelect(c.id);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const clear = () => {
    onSelect("");
    setQuery("");
    setOpen(true);
    inputRef.current?.focus();
  };

  return (
    <div ref={wrapRef} style={{ flex: 1, minWidth: 0, position: "relative" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        border: `1px solid ${ADM.line}`, borderRadius: 6,
        background: ADM.white,
        padding: "0 6px 0 12px",
      }}>
        <span style={{ display: "flex", color: ADM.inkSoft, flexShrink: 0 }}>
          {AdmIcons.search(14)}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
            if (selected) onSelect("");
          }}
          onFocus={() => {
            setOpen(true);
            if (selected) setQuery("");
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setHighlight((h) => Math.min(filtered.length - 1, h + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(0, h - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const c = filtered[highlight];
              if (c) choose(c);
            } else if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder="Cerca cliente per nome, città, provincia, email…"
          style={{
            flex: 1, minWidth: 0,
            padding: "10px 0",
            border: "none", outline: "none", background: "transparent",
            fontFamily: ADM.sans, fontSize: 14, color: ADM.ink,
          }}
        />
        {selected && !open && (
          <button
            type="button"
            onClick={clear}
            title="Cambia cliente"
            style={{
              height: 26, padding: "0 8px", marginRight: 2,
              border: `1px solid ${ADM.line}`, borderRadius: 4,
              background: ADM.panelAlt, color: ADM.inkSoft,
              fontFamily: ADM.sans, fontSize: 11, fontWeight: 600,
              letterSpacing: 0.4, textTransform: "uppercase", cursor: "pointer",
              flexShrink: 0,
            }}
          >Cambia</button>
        )}
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          maxHeight: isMobile ? 280 : 360, overflowY: "auto",
          background: ADM.white, border: `1px solid ${ADM.line}`, borderRadius: 6,
          boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
          zIndex: 20,
        }}>
          {filtered.length === 0 ? (
            <div style={{
              padding: "14px 14px", fontFamily: ADM.serif, fontStyle: "italic",
              fontSize: 13, color: ADM.inkSoft, textAlign: "center",
            }}>
              Nessun cliente trovato.
            </div>
          ) : (
            filtered.map((c, idx) => {
              const name = c.restaurantName ?? c.fullName ?? c.email;
              const where = [c.city, c.district].filter(Boolean).join(" · ");
              const isHi = idx === highlight;
              return (
                <button
                  type="button"
                  key={c.id}
                  onMouseDown={(e) => { e.preventDefault(); choose(c); }}
                  onMouseEnter={() => setHighlight(idx)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "9px 12px",
                    border: "none",
                    borderBottom: idx === filtered.length - 1 ? "none" : `1px solid ${ADM.lineSoft}`,
                    background: isHi ? ADM.panelAlt : "transparent",
                    cursor: "pointer",
                    fontFamily: ADM.sans,
                  }}
                >
                  <div style={{
                    fontSize: 13.5, color: ADM.ink, fontWeight: 500,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{name}</div>
                  <div style={{
                    fontSize: 11.5, color: ADM.inkSoft, marginTop: 1,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {where || c.email}{where ? ` · ${c.email}` : ""}
                  </div>
                </button>
              );
            })
          )}
          {customers.length > filtered.length && query.trim() === "" && (
            <div style={{
              padding: "8px 12px", fontFamily: ADM.sans, fontSize: 11,
              color: ADM.inkSoft, textAlign: "center",
              borderTop: `1px solid ${ADM.lineSoft}`, background: ADM.panelAlt,
            }}>
              Mostro primi 50 di {customers.length} — digita per filtrare.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
