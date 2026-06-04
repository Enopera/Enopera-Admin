"use client";

import { useMemo, useState, useTransition } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ADM } from "@/lib/admin/tokens";
import { updateWineMetadata } from "@/lib/wines/actions";
import type { WineRow, AutocompleteOptions } from "@/lib/wines/queries";

type Props = {
  wines: WineRow[];
  options: AutocompleteOptions;
};

type StatusFilter = "incomplete" | "complete" | null;

// ─── Constants ────────────────────────────────────────────────────────────

const TYPES = ["Rosso", "Bianco", "Bolle", "Rosato"];

function isIncomplete(w: WineRow): boolean {
  return w.grape == null || w.region == null || w.abv == null;
}

export function ViniList({ wines: initial, options }: Props) {
  const [wines, setWines] = useState<WineRow[]>(initial);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<StatusFilter>(null);
  const [filterProducer, setFilterProducer] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const producers = useMemo(() => {
    const s = new Set<string>();
    for (const w of wines) if (w.producer) s.add(w.producer);
    return [...s].sort((a, b) => a.localeCompare(b, "it"));
  }, [wines]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = wines.filter((w) => {
      if (q) {
        const inName = w.name.toLowerCase().includes(q);
        const inProd = (w.producer ?? "").toLowerCase().includes(q);
        if (!inName && !inProd) return false;
      }
      if (filterType && w.type !== filterType) return false;
      if (filterProducer && w.producer !== filterProducer) return false;
      if (filterStatus === "incomplete" && !isIncomplete(w)) return false;
      if (filterStatus === "complete" && isIncomplete(w)) return false;
      return true;
    });
    return matches.sort((a, b) => {
      const ai = isIncomplete(a) ? 0 : 1;
      const bi = isIncomplete(b) ? 0 : 1;
      if (ai !== bi) return ai - bi;
      const pa = (a.producer ?? "").localeCompare(b.producer ?? "", "it");
      if (pa !== 0) return pa;
      return a.name.localeCompare(b.name, "it");
    });
  }, [wines, search, filterType, filterStatus, filterProducer]);

  const incompleteCount = useMemo(() => wines.filter(isIncomplete).length, [wines]);

  function commitUpdate(
    wineId: string,
    field: "grape" | "region" | "abv",
    value: string | number | null,
  ) {
    // Cattura il valore precedente del SINGOLO campo della SINGOLA riga,
    // NON l'intero array `wines`. Così il rollback non sovrascrive
    // modifiche concorrenti su altre righe (o su altri campi della stessa riga).
    const target = wines.find((r) => r.id === wineId);
    if (!target) return;
    const previousFieldValue = (target as Record<string, unknown>)[field] as string | number | null;

    setWines((curr) => curr.map((r) => (r.id === wineId ? { ...r, [field]: value } : r)));
    setPendingIds((s) => new Set(s).add(wineId));
    startTransition(async () => {
      try {
        await updateWineMetadata(wineId, { [field]: value });
      } catch (err) {
        setWines((curr) => curr.map((r) =>
          r.id === wineId ? { ...r, [field]: previousFieldValue } : r,
        ));
        setToast(`Salvataggio fallito: ${(err as Error).message}`);
        setTimeout(() => setToast(null), 5000);
      } finally {
        setPendingIds((s) => {
          const next = new Set(s);
          next.delete(wineId);
          return next;
        });
      }
    });
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <Toolbar
        search={search} onSearch={setSearch}
        filterType={filterType} onFilterType={setFilterType}
        filterStatus={filterStatus} onFilterStatus={setFilterStatus}
        filterProducer={filterProducer} onFilterProducer={setFilterProducer}
        producers={producers}
        incompleteCount={incompleteCount}
        totalCount={wines.length}
      />
      <WineTable
        rows={filtered}
        options={options}
        pendingIds={pendingIds}
        onCommit={commitUpdate}
      />
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, padding: "12px 18px",
          background: ADM.red, color: ADM.white, borderRadius: 6,
          fontFamily: ADM.sans, fontSize: 13, boxShadow: "0 4px 18px rgba(0,0,0,0.2)",
          zIndex: 100,
        }}>{toast}</div>
      )}
    </div>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────

function Toolbar(props: {
  search: string;
  onSearch: (v: string) => void;
  filterType: string | null;
  onFilterType: (v: string | null) => void;
  filterStatus: StatusFilter;
  onFilterStatus: (v: StatusFilter) => void;
  filterProducer: string | null;
  onFilterProducer: (v: string | null) => void;
  producers: string[];
  incompleteCount: number;
  totalCount: number;
}) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 12,
      padding: "20px 36px 16px",
      background: ADM.panel, borderBottom: `1px solid ${ADM.line}`,
      fontFamily: ADM.sans,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <input
          type="text"
          placeholder="Cerca per nome o produttore…"
          value={props.search}
          onChange={(e) => props.onSearch(e.target.value)}
          style={{
            flex: 1, maxWidth: 480,
            padding: "8px 12px", borderRadius: 6,
            border: `1px solid ${ADM.line}`, background: ADM.white,
            fontFamily: ADM.sans, fontSize: 13, color: ADM.ink,
            outline: "none",
          }}
        />
        <div style={{ marginLeft: "auto", fontSize: 12, color: ADM.inkSoft }}>
          {props.incompleteCount === 0
            ? `${props.totalCount} vini, tutti completi`
            : `${props.incompleteCount} di ${props.totalCount} da popolare`}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <FilterGroup
          label="Tipo"
          options={TYPES}
          value={props.filterType}
          onChange={props.onFilterType}
        />
        <FilterGroup
          label="Stato"
          options={[
            { value: "incomplete", label: "Solo da popolare" },
            { value: "complete",   label: "Solo completi" },
          ]}
          value={props.filterStatus}
          onChange={(v) => props.onFilterStatus(v as StatusFilter)}
        />
        <ProducerFilter
          producers={props.producers}
          value={props.filterProducer}
          onChange={props.onFilterProducer}
        />
      </div>
    </div>
  );
}

function FilterGroup({
  label, options, value, onChange,
}: {
  label: string;
  options: (string | { value: string; label: string })[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const items = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11, color: ADM.inkMuted, letterSpacing: 0.4, textTransform: "uppercase" }}>
        {label}
      </span>
      {items.map((it) => {
        const active = value === it.value;
        return (
          <button
            key={it.value}
            onClick={() => onChange(active ? null : it.value)}
            style={{
              padding: "4px 10px", borderRadius: 999,
              border: `1px solid ${active ? ADM.carmine : ADM.line}`,
              background: active ? ADM.carmineWash : ADM.white,
              color: active ? ADM.carmine : ADM.ink,
              fontSize: 12, fontFamily: ADM.sans, cursor: "pointer",
            }}
          >{it.label}</button>
        );
      })}
    </div>
  );
}

function ProducerFilter(props: {
  producers: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11, color: ADM.inkMuted, letterSpacing: 0.4, textTransform: "uppercase" }}>
        Produttore
      </span>
      <select
        value={props.value ?? ""}
        onChange={(e) => props.onChange(e.target.value || null)}
        style={{
          padding: "4px 10px", borderRadius: 6,
          border: `1px solid ${ADM.line}`, background: ADM.white,
          fontSize: 12, fontFamily: ADM.sans, cursor: "pointer", color: ADM.ink,
        }}
      >
        <option value="">Tutti</option>
        {props.producers.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </div>
  );
}

// ─── WineTable ───────────────────────────────────────────────────────────

function WineTable(props: {
  rows: WineRow[];
  options: AutocompleteOptions;
  pendingIds: Set<string>;
  onCommit: (wineId: string, field: "grape" | "region" | "abv", value: string | number | null) => void;
}) {
  return (
    <>
      {/* No overflow wrapper: <th> sticky usa la finestra come scroll container.
          Con un wrapper overflow:auto che non scrolla mai internamente (perché
          la sua altezza non è vincolata dalla shell), la sticky non si attiva. */}
      <div style={{ flex: 1 }}>
        <table style={{
          width: "100%", borderCollapse: "collapse",
          fontFamily: ADM.sans, fontSize: 13, color: ADM.ink,
        }}>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>Produttore</Th>
              <Th style={{ width: 80 }}>Tipo</Th>
              <Th style={{ width: 80 }}>Annata</Th>
              <Th style={{ width: 240 }}>Vitigno</Th>
              <Th style={{ width: 200 }}>Regione</Th>
              <Th style={{ width: 100 }}>Grad.</Th>
              <Th style={{ width: 40 }}> </Th>
            </tr>
          </thead>
          <tbody>
            {props.rows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 36, textAlign: "center", color: ADM.inkMuted }}>
                  Nessun vino corrisponde ai filtri.
                </td>
              </tr>
            ) : (
              props.rows.map((row, idx) => (
                <WineRowEditor
                  key={row.id}
                  row={row}
                  options={props.options}
                  pending={props.pendingIds.has(row.id)}
                  alt={idx % 2 === 1}
                  onCommit={props.onCommit}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <datalist id="grape-suggestions">
        {props.options.grapes.map((g) => <option key={g} value={g} />)}
      </datalist>
      <datalist id="region-suggestions">
        {props.options.regions.map((r) => <option key={r} value={r} />)}
      </datalist>
    </>
  );
}

function Th({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <th style={{
      textAlign: "left", padding: "10px 14px",
      fontSize: 11, fontWeight: 600, color: ADM.inkSoft,
      letterSpacing: 0.6, textTransform: "uppercase",
      position: "sticky", top: 0, zIndex: 2,
      background: ADM.panelAlt,
      // box-shadow al posto di border-bottom: con border-collapse:collapse
      // il bordo non segue il <th> sticky e sparisce allo scroll.
      boxShadow: `inset 0 -1px 0 ${ADM.line}`,
      ...style,
    }}>{children}</th>
  );
}

function parseAbvInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function WineRowEditor(props: {
  row: WineRow;
  options: AutocompleteOptions;
  pending: boolean;
  alt: boolean;
  onCommit: (wineId: string, field: "grape" | "region" | "abv", value: string | number | null) => void;
}) {
  const { row, pending } = props;
  const incomplete = row.grape == null || row.region == null || row.abv == null;
  return (
    <tr style={{
      background: pending
        ? ADM.goldWash
        : props.alt ? ADM.panel : ADM.white,
      borderBottom: `1px solid ${ADM.lineSoft}`,
      opacity: pending ? 0.7 : 1,
      transition: "opacity 0.15s",
    }}>
      <td style={cellStyle}>{row.name}</td>
      <td style={{ ...cellStyle, color: ADM.inkSoft }}>{row.producer ?? "—"}</td>
      <td style={cellStyle}>{row.type}</td>
      <td style={cellStyle}>{row.vintage ?? "—"}</td>
      <td style={cellStyle}>
        <TextCellInput
          key={`grape:${row.grape ?? ""}`}
          defaultValue={row.grape ?? ""}
          listId="grape-suggestions"
          placeholder="es. Glera, Corvina"
          onCommit={(v) => {
            if ((row.grape ?? "") !== v) props.onCommit(row.id, "grape", v || null);
          }}
        />
      </td>
      <td style={cellStyle}>
        <TextCellInput
          key={`region:${row.region ?? ""}`}
          defaultValue={row.region ?? ""}
          listId="region-suggestions"
          placeholder="es. Valpolicella, Soave"
          onCommit={(v) => {
            if ((row.region ?? "") !== v) props.onCommit(row.id, "region", v || null);
          }}
        />
      </td>
      <td style={cellStyle}>
        <AbvCellInput
          key={`abv:${row.abv ?? ""}`}
          defaultValue={row.abv}
          onCommit={(n) => {
            if (row.abv !== n) props.onCommit(row.id, "abv", n);
          }}
        />
      </td>
      <td style={{ ...cellStyle, textAlign: "center" }}>
        <StatusBadge incomplete={incomplete} />
      </td>
    </tr>
  );
}

const cellStyle: CSSProperties = {
  padding: "8px 14px",
  verticalAlign: "middle",
};

function TextCellInput(props: {
  defaultValue: string;
  listId: string;
  placeholder: string;
  onCommit: (value: string) => void;
}) {
  return (
    <input
      type="text"
      list={props.listId}
      defaultValue={props.defaultValue}
      placeholder={props.placeholder}
      aria-label={props.placeholder}
      onBlur={(e) => props.onCommit(e.currentTarget.value.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = props.defaultValue;
          e.currentTarget.blur();
        }
      }}
      style={{
        width: "100%", boxSizing: "border-box",
        padding: "6px 8px", borderRadius: 4,
        border: `1px solid ${ADM.line}`, background: ADM.white,
        fontFamily: ADM.sans, fontSize: 13, color: ADM.ink,
        outline: "none",
      }}
    />
  );
}

function AbvCellInput(props: {
  defaultValue: number | null;
  onCommit: (value: number | null) => void;
}) {
  return (
    <input
      type="number"
      step="0.1"
      min="0"
      max="20"
      defaultValue={props.defaultValue ?? ""}
      placeholder="—"
      aria-label="Gradazione alcolica in percentuale"
      onBlur={(e) => props.onCommit(parseAbvInput(e.currentTarget.value))}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = props.defaultValue?.toString() ?? "";
          e.currentTarget.blur();
        }
      }}
      style={{
        width: "100%", boxSizing: "border-box",
        padding: "6px 8px", borderRadius: 4,
        border: `1px solid ${ADM.line}`, background: ADM.white,
        fontFamily: ADM.sans, fontSize: 13, color: ADM.ink,
        outline: "none",
      }}
    />
  );
}

function StatusBadge({ incomplete }: { incomplete: boolean }) {
  if (incomplete) {
    return (
      <span title="Da popolare" style={{
        display: "inline-block", width: 18, height: 18, borderRadius: 999,
        background: ADM.carmineWash, color: ADM.carmine,
        textAlign: "center", lineHeight: "18px", fontSize: 11, fontWeight: 700,
      }}>●</span>
    );
  }
  return (
    <span title="Completo" style={{
      display: "inline-block", width: 18, height: 18, borderRadius: 999,
      background: ADM.greenWash, color: ADM.green,
      textAlign: "center", lineHeight: "18px", fontSize: 11, fontWeight: 700,
    }}>✓</span>
  );
}
