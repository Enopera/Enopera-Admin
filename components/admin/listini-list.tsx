"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ADM } from "@/lib/admin/tokens";
import { AdmIcons } from "@/lib/admin/icons";
import { AdmBtn } from "@/lib/admin/primitives";
import { useIsMobile } from "@/lib/admin/use-is-mobile";
import { AdmKpiStrip, AdmPageHeader } from "@/components/admin/page-header";
import type { AdminPriceList } from "@/lib/price-lists/types";
import {
  updatePriceList,
  deletePriceList,
  setDefaultPriceList,
  syncAllFromStarty,
  type ActionResult,
  type PriceListInput,
} from "@/lib/price-lists/actions";

export function ListiniList({ priceLists }: { priceLists: AdminPriceList[] }) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [syncing, startSyncTransition] = useTransition();
  const [syncFeedback, setSyncFeedback] = useState<ActionResult | null>(null);

  const open = priceLists.find((p) => p.id === openId) ?? null;
  const stats = useMemo(() => {
    const total = priceLists.length;
    const custom = priceLists.filter((p) => !p.isDefault).length;
    const assigned = priceLists.reduce((s, p) => s + p.restaurantsCount, 0);
    return { total, custom, assigned };
  }, [priceLists]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <AdmPageHeader
        kicker="Commerciale · Listini"
        title="Listini di prezzo"
        sub={`${stats.total} listin${stats.total === 1 ? "o" : "i"} · ${stats.assigned} assegnazion${stats.assigned === 1 ? "e" : "i"}`}
        actions={
          <AdmBtn
            kind="primary"
            icon={AdmIcons.refresh(14)}
            onClick={() => {
              setSyncFeedback(null);
              startSyncTransition(async () => {
                const res = await syncAllFromStarty();
                setSyncFeedback(res);
                // Il catalogo (vini + prezzi) gira in background ~50s su Supabase:
                // ricarico i dati della pagina quando dovrebbe aver finito.
                if (res.ok) setTimeout(() => router.refresh(), 75000);
              });
            }}
          >
            {syncing ? "Aggiornamento listini…" : "Aggiorna da Starty"}
          </AdmBtn>
        }
      />

      <AdmKpiStrip
        items={[
          { label: "Listini",        value: String(stats.total),    sub: "totali" },
          { label: "Custom",         value: String(stats.custom),   sub: "oltre allo standard" },
          { label: "Ristoranti",     value: String(stats.assigned), sub: "con listino assegnato" },
        ]}
      />

      {syncFeedback && (
        <div style={{
          margin: isMobile ? "12px 16px 0" : "16px 36px 0",
          padding: "10px 14px", borderRadius: 6,
          background: syncFeedback.ok ? ADM.greenWash : ADM.redWash,
          color: syncFeedback.ok ? ADM.green : ADM.red,
          fontFamily: ADM.sans, fontSize: 13, fontWeight: 500,
          border: `1px solid ${syncFeedback.ok ? ADM.green : ADM.red}33`,
        }}>
          {syncFeedback.ok ? syncFeedback.message ?? "Sincronizzato" : syncFeedback.error}
        </div>
      )}

      <div style={{
        padding: isMobile ? "10px 16px" : "12px 36px",
        fontFamily: ADM.sans, fontSize: 11.5, color: ADM.inkSoft,
        fontStyle: "italic", lineHeight: 1.5,
      }}>
        I listini, i vini e i prezzi sono gestiti su Starty. Premi
        &laquo;Aggiorna da Starty&raquo;: l&apos;elenco listini si aggiorna
        subito, mentre il catalogo (vini, prezzi) viene rinfrescato in
        background (~1 minuto) e compare al ricaricamento della pagina.
      </div>

      <div style={{
        flex: 1, minHeight: 0,
        padding: isMobile ? "16px" : "20px 36px 36px",
        overflow: "auto",
      }}>
        <div style={{
          background: ADM.panel, border: `1px solid ${ADM.line}`,
          borderRadius: 8, overflow: "hidden",
        }}>
          {priceLists.length === 0 ? (
            <div style={{
              padding: 40, textAlign: "center",
              fontFamily: ADM.serif, fontStyle: "italic", fontSize: 14, color: ADM.inkSoft,
            }}>
              Nessun listino. Crea il primo per cominciare.
            </div>
          ) : (
            priceLists.map((p, i) => (
              <PriceListRow
                key={p.id}
                row={p}
                isLast={i === priceLists.length - 1}
                onOpen={() => setOpenId(p.id)}
              />
            ))
          )}
        </div>
      </div>

      {open && (
        <PriceListDrawer priceList={open} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

function PriceListRow({
  row, isLast, onOpen,
}: {
  row: AdminPriceList;
  isLast: boolean;
  onOpen: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 18px",
        borderBottom: isLast ? "none" : `1px solid ${ADM.lineSoft}`,
        cursor: "pointer", background: ADM.panel,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = ADM.panelAlt)}
      onMouseLeave={(e) => (e.currentTarget.style.background = ADM.panel)}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: row.isDefault ? ADM.goldWash : ADM.panelAlt,
        color: row.isDefault ? ADM.gold : ADM.inkSoft,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {row.isDefault ? AdmIcons.star(16) : AdmIcons.tag(16)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontFamily: ADM.serif, fontSize: 16, fontWeight: 600, color: ADM.ink,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{row.name}</span>
          {row.isDefault && (
            <span style={{
              fontFamily: ADM.sans, fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
              color: ADM.gold, background: ADM.goldWash, padding: "2px 7px",
              borderRadius: 4, textTransform: "uppercase",
            }}>Default</span>
          )}
          {!row.active && (
            <span style={{
              fontFamily: ADM.sans, fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
              color: ADM.inkMuted, background: ADM.panelAlt, padding: "2px 7px",
              borderRadius: 4, textTransform: "uppercase",
            }}>Disattivato</span>
          )}
        </div>
        {row.description && (
          <div style={{
            fontFamily: ADM.sans, fontSize: 12, color: ADM.inkSoft, marginTop: 3,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{row.description}</div>
        )}
      </div>
      <div style={{
        fontFamily: ADM.sans, fontSize: 12, color: ADM.inkSoft, textAlign: "right",
        flexShrink: 0,
      }}>
        <div style={{ fontVariantNumeric: "tabular-nums", color: ADM.ink, fontWeight: 600, fontSize: 14 }}>
          {row.restaurantsCount}
        </div>
        <div style={{ fontSize: 10.5 }}>
          {row.restaurantsCount === 1 ? "ristorante" : "ristoranti"}
        </div>
      </div>
      <div style={{ color: ADM.inkSoft, flexShrink: 0 }}>{AdmIcons.chevronRight(14)}</div>
    </div>
  );
}

// ───────── Drawer ─────────

function PriceListDrawer({
  priceList, onClose,
}: {
  priceList: AdminPriceList;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<ActionResult | null>(null);
  const [form, setForm] = useState<PriceListInput>({
    name: priceList.name,
    description: priceList.description,
    startyId: priceList.startyId,
    active: priceList.active,
  });

  const run = (fn: () => Promise<ActionResult>, closeOnOk = false) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await fn();
      setFeedback(res);
      if (res.ok && closeOnOk) setTimeout(() => onClose(), 600);
    });
  };

  const parseIntOrNull = (s: unknown): number | null => {
    if (s == null || s === "") return null;
    const n = typeof s === "number" ? s : Number(String(s).trim());
    return Number.isFinite(n) ? Math.round(n) : null;
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "#2A1A1D88", zIndex: 50,
      display: "flex", justifyContent: "flex-end",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: isMobile ? "100%" : 560, maxWidth: "100%", height: "100vh",
        background: ADM.bg, display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: isMobile ? "none" : "-8px 0 30px #0002",
      }}>
        <div style={{
          padding: "20px 28px 16px", background: ADM.panel,
          borderBottom: `1px solid ${ADM.line}`,
          display: "flex", alignItems: "flex-start", gap: 14,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 10,
            background: priceList.isDefault ? ADM.goldWash : ADM.panelAlt,
            color: priceList.isDefault ? ADM.gold : ADM.inkSoft,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            {priceList.isDefault ? AdmIcons.star(22) : AdmIcons.tag(22)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: ADM.sans, fontSize: 10.5, color: ADM.inkSoft,
              letterSpacing: 1.6, textTransform: "uppercase", fontWeight: 600,
            }}>Listino</div>
            <h2 style={{
              margin: "4px 0 4px", fontFamily: ADM.serif, fontSize: 24,
              fontWeight: 500, color: ADM.ink, letterSpacing: -0.4, lineHeight: 1.1,
            }}>{priceList.name}</h2>
            <div style={{ fontFamily: ADM.sans, fontSize: 12, color: ADM.inkSoft }}>
              {priceList.restaurantsCount} ristorant{priceList.restaurantsCount === 1 ? "e" : "i"} assegnat{priceList.restaurantsCount === 1 ? "o" : "i"}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: ADM.inkSoft, border: `1px solid ${ADM.line}`,
            borderRadius: 4, background: ADM.panel,
          }}>{AdmIcons.close(14)}</button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "20px 28px" }}>
          {feedback && (
            <div style={{
              padding: "10px 14px", borderRadius: 6, marginBottom: 16,
              background: feedback.ok ? ADM.greenWash : ADM.redWash,
              color: feedback.ok ? ADM.green : ADM.red,
              fontFamily: ADM.sans, fontSize: 13, fontWeight: 500,
              border: `1px solid ${feedback.ok ? ADM.green : ADM.red}33`,
            }}>{feedback.ok ? feedback.message ?? "Salvato" : feedback.error}</div>
          )}

          <Section label="Dettagli">
            <Field label="Nome">
              <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            </Field>
            <Field label="Descrizione">
              <Textarea value={form.description ?? ""} onChange={(v) => setForm({ ...form, description: v })} />
            </Field>
            <Field label="StartyERP price-list ID">
              <Input
                value={form.startyId?.toString() ?? ""}
                onChange={(v) => setForm({ ...form, startyId: parseIntOrNull(v) })}
                mono
                placeholder="Da popolare quando integreremo Starty"
              />
            </Field>
            <Field label="Stato">
              <label style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                fontFamily: ADM.sans, fontSize: 13, color: ADM.ink, cursor: "pointer",
              }}>
                <input
                  type="checkbox"
                  checked={form.active ?? true}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
                Attivo (i listini disattivati non compaiono nel selettore ristoranti)
              </label>
            </Field>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <AdmBtn
                kind="primary"
                icon={AdmIcons.check(14)}
                onClick={() => run(() => updatePriceList(priceList.id, form))}
              >
                {pending ? "Salvataggio…" : "Salva modifiche"}
              </AdmBtn>
              {!priceList.isDefault && (
                <AdmBtn
                  kind="secondary"
                  icon={AdmIcons.star(14)}
                  onClick={() => run(() => setDefaultPriceList(priceList.id))}
                >
                  Imposta come default
                </AdmBtn>
              )}
              <AdmBtn
                kind="danger"
                icon={AdmIcons.trash(14)}
                onClick={() => {
                  if (confirm(`Eliminare il listino "${priceList.name}"?`)) {
                    run(() => deletePriceList(priceList.id), true);
                  }
                }}
              >
                Elimina
              </AdmBtn>
            </div>
          </Section>

          {priceList.isDefault && (
            <div style={{
              padding: "10px 14px", borderRadius: 6,
              background: ADM.goldWash, color: ADM.gold,
              border: `1px solid ${ADM.gold}33`,
              fontFamily: ADM.sans, fontSize: 12, fontWeight: 500,
            }}>
              Questo è il listino di <strong>default</strong>: viene applicato automaticamente a tutti i ristoranti che non hanno un listino custom assegnato.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────── Small bits (copia da restaurants-list) ─────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{
      marginBottom: 20, padding: 18, background: ADM.panel,
      border: `1px solid ${ADM.line}`, borderRadius: 6,
    }}>
      <div style={{
        fontFamily: ADM.sans, fontSize: 10.5, color: ADM.inkSoft,
        letterSpacing: 1.6, textTransform: "uppercase", fontWeight: 600, marginBottom: 12,
      }}>{label}</div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontFamily: ADM.sans, fontSize: 11, color: ADM.inkSoft,
        marginBottom: 4, fontWeight: 500,
      }}>{label}</div>
      {children}
    </div>
  );
}

function Input({
  value, onChange, mono = false, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%", padding: "8px 10px",
        border: `1px solid ${ADM.line}`, borderRadius: 6,
        background: ADM.white,
        fontFamily: mono ? ADM.mono : ADM.sans,
        fontSize: 13, color: ADM.ink, outline: "none",
      }}
    />
  );
}

function Textarea({
  value, onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      style={{
        width: "100%", padding: "8px 10px",
        border: `1px solid ${ADM.line}`, borderRadius: 6,
        background: ADM.white,
        fontFamily: ADM.sans, fontSize: 13, color: ADM.ink,
        outline: "none", resize: "vertical", minHeight: 60,
      }}
    />
  );
}
