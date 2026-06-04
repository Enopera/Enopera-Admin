"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ADM } from "@/lib/admin/tokens";
import { AdmIcons } from "@/lib/admin/icons";
import { AdmAvatar, AdmBtn, AdmStatus, fmtEUR, initials } from "@/lib/admin/primitives";
import { useIsMobile } from "@/lib/admin/use-is-mobile";
import { AdmKpiStrip, AdmPageHeader } from "@/components/admin/page-header";
import type { AdminOrder, OrderStatus } from "@/lib/orders/types";
import { ORDER_STATUS_LABELS } from "@/lib/orders/types";
import {
  updateOrderDelivery,
  setOrderStatus,
  adminCancelOrder,
  type ActionResult,
} from "@/lib/orders/actions";

// ───────── helpers ─────────

const months = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];

function fmtItDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtItDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${fmtItDate(iso)} · ${time}`;
}

function shortId(id: string): string {
  return id.split("-")[0].toUpperCase();
}

function statusToBadgeKey(s: OrderStatus): "effettuato" | "inConsegna" | "consegnato" | null {
  if (s === "confirmed")    return "effettuato";
  if (s === "in_consegna")  return "inConsegna";
  if (s === "consegnato")   return "consegnato";
  return null; // creating + failed_*
}

// ───────── filters config ─────────

type FilterId = "all" | "confirmed" | "in_consegna" | "consegnato" | "failed";

const filters: { id: FilterId; label: string }[] = [
  { id: "all",          label: "Tutti" },
  { id: "confirmed",    label: "Da pianificare" },
  { id: "in_consegna",  label: "In consegna" },
  { id: "consegnato",   label: "Consegnati" },
  { id: "failed",       label: "Errori" },
];

function matchesFilter(o: AdminOrder, f: FilterId): boolean {
  if (f === "all") return true;
  if (f === "failed") return o.status.startsWith("failed_") || o.status === "creating";
  return o.status === f;
}

// ───────── main component ─────────

export function OrdersList({ orders }: { orders: AdminOrder[] }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState<FilterId>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  const onRefresh = () => {
    startRefresh(() => {
      // RSC re-fetch: rilegge listOrders() server-side senza full-page reload.
      router.refresh();
    });
  };

  const counts = useMemo(() => ({
    all:          orders.length,
    confirmed:    orders.filter((o) => o.status === "confirmed").length,
    in_consegna:  orders.filter((o) => o.status === "in_consegna").length,
    consegnato:   orders.filter((o) => o.status === "consegnato").length,
    failed:       orders.filter((o) => o.status.startsWith("failed_") || o.status === "creating").length,
  }), [orders]);

  const totalGmv = useMemo(
    () => orders.filter((o) => o.status !== "creating" && !o.status.startsWith("failed_"))
                .reduce((s, o) => s + o.total, 0),
    [orders],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (!matchesFilter(o, filter)) return false;
      if (!q) return true;
      const fields = [
        o.customer.restaurant_name,
        o.customer.full_name,
        o.userEmail,
        o.customer.email,
        o.customer.city,
        o.customer.vat,
        o.startyDocumentNumber,
        shortId(o.id),
        o.id,
      ];
      return fields.some((f) => f && f.toLowerCase().includes(q));
    });
  }, [orders, filter, search]);

  const openOrder = orders.find((o) => o.id === openId) ?? null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
      <AdmPageHeader
        kicker="Operations · Consegne"
        title="Ordini"
        sub={`${counts.confirmed} da pianificare · ${counts.in_consegna} in consegna · ${counts.consegnato} consegnati`}
        actions={
          <AdmBtn
            kind="secondary"
            icon={
              <span style={{
                display: "flex",
                animation: refreshing ? "adm-spin 0.7s linear infinite" : undefined,
              }}>
                {AdmIcons.refresh(14)}
              </span>
            }
            onClick={onRefresh}
          >
            {refreshing ? "Aggiornamento…" : "Aggiorna"}
          </AdmBtn>
        }
      />
      <AdmKpiStrip
        items={[
          { label: "Totale ordini",  value: String(counts.all),         sub: "in tutti gli stati" },
          { label: "Da pianificare", value: String(counts.confirmed),   sub: "in attesa di data consegna" },
          { label: "In consegna",    value: String(counts.in_consegna), sub: "corriere in viaggio" },
          { label: "Consegnati",     value: String(counts.consegnato),  sub: "completati" },
          { label: "Fatturato",      value: fmtEUR(totalGmv),           sub: "sommatoria ordini validi" },
        ]}
      />

      <div style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "center",
        gap: isMobile ? 10 : 14,
        padding: isMobile ? "12px 16px" : "14px 36px",
        borderBottom: `1px solid ${ADM.line}`,
      }}>
        <div style={{
          display: "flex", gap: 4,
          flexWrap: isMobile ? "nowrap" : "wrap",
          overflowX: isMobile ? "auto" : "visible",
          WebkitOverflowScrolling: "touch",
          minWidth: 0,
        }}>
          {filters.map((f) => {
            const active = filter === f.id;
            return (
              <div key={f.id} onClick={() => setFilter(f.id)} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 4,
                background: active ? ADM.ink : "transparent",
                color: active ? ADM.panel : ADM.inkSoft,
                fontFamily: ADM.sans, fontSize: 12.5, fontWeight: active ? 600 : 500,
                cursor: "pointer",
                whiteSpace: "nowrap", flexShrink: 0,
              }}>
                {f.label}
                <span style={{
                  fontSize: 10.5, padding: "1px 6px", borderRadius: 999,
                  background: active ? "#ffffff22" : ADM.panelAlt,
                  color: active ? ADM.panel : ADM.inkSoft,
                  fontWeight: 600, fontVariantNumeric: "tabular-nums",
                }}>{counts[f.id]}</span>
              </div>
            );
          })}
        </div>
        {!isMobile && <div style={{ flex: 1 }} />}
        <SearchBox value={search} onChange={setSearch} fullWidth={isMobile} />
        {!isMobile && (
          <span style={{ fontFamily: ADM.sans, fontSize: 12, color: ADM.inkSoft }}>
            {filtered.length} di {counts.all}
          </span>
        )}
      </div>

      <div style={{
        flex: 1, minHeight: 0,
        padding: isMobile ? "0 12px 24px" : "0 36px 36px",
        overflow: "auto",
        display: "flex", flexDirection: "column",
      }}>
        {!isMobile && (
          <div style={{
            display: "flex", background: ADM.panelAlt,
            borderBottom: `1px solid ${ADM.line}`, borderTop: `1px solid ${ADM.line}`,
            fontFamily: ADM.sans, fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
            textTransform: "uppercase", color: ADM.inkSoft, position: "sticky", top: 0, zIndex: 1,
          }}>
            <div style={{ flex: 2.4, padding: "12px 14px" }}>Ristorante</div>
            <div style={{ flex: 1.2, padding: "12px 14px" }}>Ordine</div>
            <div style={{ width: 120, padding: "12px 14px" }}>Stato</div>
            <div style={{ width: 130, padding: "12px 14px" }}>Consegna</div>
            <div style={{ width: 80,  padding: "12px 14px", textAlign: "right" }}>Btg</div>
            <div style={{ width: 110, padding: "12px 14px", textAlign: "right" }}>Totale</div>
            <div style={{ width: 60,  padding: "12px 14px" }} />
          </div>
        )}
        {filtered.length === 0 ? (
          <div style={{
            padding: 60, textAlign: "center", fontFamily: ADM.serif, fontStyle: "italic",
            fontSize: 16, color: ADM.inkSoft,
          }}>
            Nessun ordine corrispondente ai filtri.
          </div>
        ) : isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12 }}>
            {filtered.map((o) => (
              <OrderCard key={o.id} order={o} onOpen={() => setOpenId(o.id)} />
            ))}
          </div>
        ) : (
          filtered.map((o) => (
            <OrderRow key={o.id} order={o} onOpen={() => setOpenId(o.id)} />
          ))
        )}
      </div>

      {openOrder && (
        <OrderModal order={openOrder} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

// ───────── search ─────────

function SearchBox({
  value,
  onChange,
  fullWidth = false,
}: {
  value: string;
  onChange: (v: string) => void;
  fullWidth?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "0 12px", height: 36,
      width: fullWidth ? "100%" : 280,
      background: ADM.panelAlt, border: `1px solid ${ADM.line}`,
      borderRadius: 6,
    }}>
      <span style={{ display: "flex", color: ADM.inkSoft }}>{AdmIcons.search(14)}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Cerca ristorante, email, P.IVA…"
        style={{
          flex: 1, border: "none", outline: "none", background: "transparent",
          fontFamily: ADM.sans, fontSize: 13, color: ADM.ink, minWidth: 0,
        }}
      />
      {value && (
        <span onClick={() => onChange("")} style={{
          display: "flex", color: ADM.inkSoft, cursor: "pointer",
        }}>{AdmIcons.close(12)}</span>
      )}
    </div>
  );
}

// ───────── card mobile ─────────

function OrderCard({ order, onOpen }: { order: AdminOrder; onOpen: () => void }) {
  const restaurant =
    order.customer.restaurant_name ?? order.customer.full_name ?? order.userEmail ?? "—";
  const eyebrow = [order.customer.city, order.customer.district].filter(Boolean).join(" · ");
  const orderNum = order.startyDocumentNumber ?? `#${shortId(order.id)}`;
  const statusKey = statusToBadgeKey(order.status);

  return (
    <div onClick={onOpen} style={{
      background: ADM.panel,
      border: `1px solid ${ADM.line}`,
      borderRadius: 10,
      padding: "12px 14px",
      display: "flex", flexDirection: "column", gap: 10,
      cursor: "pointer",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <AdmAvatar initials={initials(restaurant)} size={36} tone="carmine" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: ADM.sans, fontSize: 14, fontWeight: 600, color: ADM.ink,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{restaurant}</div>
          <div style={{
            fontFamily: ADM.sans, fontSize: 11.5, color: ADM.inkSoft, marginTop: 1,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {eyebrow || order.userEmail || "—"}
          </div>
        </div>
        {statusKey
          ? <AdmStatus value={statusKey} />
          : <span style={{
              fontFamily: ADM.sans, fontSize: 10.5, color: ADM.red,
              padding: "3px 8px", borderRadius: 999, background: ADM.redWash,
              fontWeight: 600,
            }}>
              {ORDER_STATUS_LABELS[order.status]}
            </span>
        }
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: 10, paddingTop: 4, borderTop: `1px solid ${ADM.lineSoft}`,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: ADM.mono, fontSize: 11.5, color: ADM.ink }}>{orderNum}</div>
          <div style={{ fontFamily: ADM.sans, fontSize: 11, color: ADM.inkSoft, marginTop: 2 }}>
            {fmtItDateTime(order.createdAt)}
          </div>
          <div style={{ fontFamily: ADM.sans, fontSize: 11.5, color: ADM.inkSoft, marginTop: 4 }}>
            {order.deliveryDate
              ? <>Consegna: <span style={{ color: ADM.ink, fontWeight: 600 }}>{fmtItDate(order.deliveryDate)}</span></>
              : <span style={{ fontStyle: "italic", color: ADM.inkMuted }}>da pianificare</span>
            }
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{
            fontFamily: ADM.serif, fontWeight: 600, fontSize: 18, color: ADM.carmine,
            fontVariantNumeric: "tabular-nums",
          }}>{fmtEUR(order.total)}</div>
          <div style={{ fontFamily: ADM.sans, fontSize: 11, color: ADM.inkSoft, marginTop: 2 }}>
            {order.itemsCount} btg
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────── row ─────────

function OrderRow({ order, onOpen }: { order: AdminOrder; onOpen: () => void }) {
  const restaurant =
    order.customer.restaurant_name ?? order.customer.full_name ?? order.userEmail ?? "—";
  const eyebrow = [order.customer.city, order.customer.district].filter(Boolean).join(" · ");
  const orderNum = order.startyDocumentNumber ?? `#${shortId(order.id)}`;
  const statusKey = statusToBadgeKey(order.status);

  return (
    <div onClick={onOpen} style={{
      display: "flex", alignItems: "center",
      borderBottom: `1px solid ${ADM.lineSoft}`, background: ADM.panel,
      cursor: "pointer", transition: "background 100ms",
    }}
      onMouseEnter={(e) => (e.currentTarget.style.background = ADM.panelAlt)}
      onMouseLeave={(e) => (e.currentTarget.style.background = ADM.panel)}
    >
      <div style={{ flex: 2.4, padding: "14px", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <AdmAvatar initials={initials(restaurant)} size={32} tone="carmine" />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: ADM.sans, fontSize: 13.5, fontWeight: 600, color: ADM.ink,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{restaurant}</div>
          <div style={{ fontFamily: ADM.sans, fontSize: 11.5, color: ADM.inkSoft, marginTop: 1 }}>
            {eyebrow || order.userEmail || "—"}
          </div>
        </div>
      </div>
      <div style={{ flex: 1.2, padding: "14px", fontFamily: ADM.mono, fontSize: 12, color: ADM.ink }}>
        <div>{orderNum}</div>
        <div style={{ fontFamily: ADM.sans, fontSize: 11, color: ADM.inkSoft, marginTop: 2 }}>
          {fmtItDateTime(order.createdAt)}
        </div>
      </div>
      <div style={{ width: 120, padding: "14px" }}>
        {statusKey
          ? <AdmStatus value={statusKey} />
          : <span style={{ fontFamily: ADM.sans, fontSize: 11.5, color: ADM.red }}>
              {ORDER_STATUS_LABELS[order.status]}
            </span>
        }
      </div>
      <div style={{ width: 130, padding: "14px", fontFamily: ADM.sans, fontSize: 12, color: ADM.inkSoft }}>
        {order.deliveryDate ? fmtItDate(order.deliveryDate) : <span style={{ color: ADM.inkMuted, fontStyle: "italic" }}>da pianificare</span>}
      </div>
      <div style={{
        width: 80, padding: "14px", textAlign: "right",
        fontFamily: ADM.sans, fontSize: 13, fontVariantNumeric: "tabular-nums", color: ADM.ink,
      }}>{order.itemsCount}</div>
      <div style={{
        width: 110, padding: "14px", textAlign: "right",
        fontFamily: ADM.serif, fontWeight: 600, fontSize: 16, color: ADM.carmine,
        fontVariantNumeric: "tabular-nums",
      }}>{fmtEUR(order.total)}</div>
      <div style={{ width: 60, padding: "14px", display: "flex", justifyContent: "center", color: ADM.inkSoft }}>
        {AdmIcons.chevronRight(14)}
      </div>
    </div>
  );
}

// ───────── drawer (edit) ─────────

function OrderModal({ order, onClose }: { order: AdminOrder; onClose: () => void }) {
  const isMobile = useIsMobile();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<ActionResult | null>(null);

  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [deliveryDate, setDeliveryDate] = useState<string>(order.deliveryDate ?? "");
  const [courier, setCourier] = useState<string>(order.courier ?? "Enopera Logistica");
  const [trackingCode, setTrackingCode] = useState<string>(order.trackingCode ?? "");
  const [adminNotes, setAdminNotes] = useState<string>(order.adminNotes ?? "");

  const restaurant =
    order.customer.restaurant_name ?? order.customer.full_name ?? order.userEmail ?? "—";
  const orderNum = order.startyDocumentNumber ?? `#${shortId(order.id)}`;

  const onSave = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await updateOrderDelivery(order.id, {
        status,
        deliveryDate: deliveryDate || null,
        courier,
        trackingCode,
        adminNotes,
      });
      setFeedback(res);
      if (res.ok) {
        // Auto-chiudi dopo un breve feedback
        setTimeout(() => onClose(), 600);
      }
    });
  };

  const onQuickStatus = (s: OrderStatus) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await setOrderStatus(order.id, s);
      setFeedback(res);
      if (res.ok) setStatus(s);
    });
  };

  const onCancel = () => {
    if (!confirm(`Cancellare definitivamente l'ordine ${orderNum}? Operazione non reversibile.`)) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await adminCancelOrder(order.id);
      setFeedback(res);
      if (res.ok) setTimeout(() => onClose(), 600);
    });
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "#2A1A1D88", zIndex: 50,
      display: "flex", justifyContent: "center", alignItems: "center",
      padding: isMobile ? 0 : 24,
      overflow: "auto",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: isMobile ? "100%" : "min(1100px, 95vw)",
        maxWidth: "100%",
        height: isMobile ? "100vh" : undefined,
        maxHeight: isMobile ? "100vh" : "92vh",
        background: ADM.panel,
        borderRadius: isMobile ? 0 : 12,
        boxShadow: isMobile ? "none" : "0 24px 60px rgba(42,26,29,0.35)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 28px 16px", borderBottom: `1px solid ${ADM.line}`,
          display: "flex", alignItems: "flex-start", gap: 14,
        }}>
          <AdmAvatar initials={initials(restaurant)} size={42} tone="carmine" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: ADM.sans, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase",
              color: ADM.inkSoft, fontWeight: 600,
            }}>{orderNum} · {fmtItDateTime(order.createdAt)}</div>
            <div style={{
              fontFamily: ADM.serif, fontSize: 22, fontWeight: 500, color: ADM.ink, marginTop: 4,
            }}>{restaurant}</div>
            <div style={{ fontFamily: ADM.sans, fontSize: 12, color: ADM.inkSoft, marginTop: 2 }}>
              {order.userEmail ?? order.customer.email ?? "—"}
              {order.customer.phone ? ` · ${order.customer.phone}` : ""}
            </div>
          </div>
          <span onClick={onClose} style={{
            display: "flex", padding: 6, cursor: "pointer", color: ADM.inkSoft,
          }}>{AdmIcons.close(16)}</span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 28px 28px" }}>

          {/* Quick status switcher */}
          <Section label="Stato corrente">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["confirmed", "in_consegna", "consegnato"] as OrderStatus[]).map((s) => {
                const active = status === s;
                const key = statusToBadgeKey(s)!;
                const label = ORDER_STATUS_LABELS[s];
                return (
                  <div key={s} onClick={() => onQuickStatus(s)} style={{
                    padding: "6px 12px", borderRadius: 999, cursor: "pointer",
                    background: active ? ADM.ink : ADM.panelAlt,
                    color: active ? ADM.panel : ADM.ink,
                    fontFamily: ADM.sans, fontSize: 12, fontWeight: active ? 600 : 500,
                    border: `1px solid ${active ? ADM.ink : ADM.line}`,
                    transition: "all 100ms",
                  }}>
                    {label}
                  </div>
                );
              })}
              {status.startsWith("failed_") || status === "creating" ? (
                <span style={{
                  padding: "6px 12px", borderRadius: 999, color: ADM.red,
                  background: ADM.redWash, fontFamily: ADM.sans, fontSize: 12, fontWeight: 600,
                }}>{ORDER_STATUS_LABELS[status]}</span>
              ) : null}
            </div>
          </Section>

          <Section label="Data di consegna">
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              style={inputStyle}
            />
          </Section>

          <Section label="Corriere">
            <input
              value={courier}
              onChange={(e) => setCourier(e.target.value)}
              placeholder="Enopera Logistica"
              style={inputStyle}
            />
          </Section>

          <Section label="Codice tracking">
            <input
              value={trackingCode}
              onChange={(e) => setTrackingCode(e.target.value)}
              placeholder="Es. EN42811 (opzionale)"
              style={inputStyle}
            />
          </Section>

          <Section label="Note interne staff">
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
              placeholder="Visibili solo dall'admin"
              style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
          </Section>

          {/* Cliente */}
          <Section label="Indirizzo consegna">
            <div style={{ fontFamily: ADM.sans, fontSize: 13, color: ADM.ink, lineHeight: 1.5 }}>
              {order.deliveryAddress ?? order.customer.address ?? "—"}
            </div>
          </Section>

          {order.customer.vat && (
            <Section label="P. IVA cliente">
              <div style={{ fontFamily: ADM.mono, fontSize: 12, color: ADM.ink }}>
                {order.customer.vat}
              </div>
            </Section>
          )}

          {order.notes && (
            <Section label="Note del cliente">
              <div style={{
                fontFamily: ADM.serif, fontStyle: "italic", fontSize: 14, color: ADM.inkSoft,
                lineHeight: 1.5,
              }}>{order.notes}</div>
            </Section>
          )}

          {/* Righe */}
          <Section label={`Bottiglie (${order.itemsCount})`}>
            <div style={{ border: `1px solid ${ADM.line}`, borderRadius: 6 }}>
              {order.lines.map((l, i) => (
                <div key={i} style={{
                  padding: "10px 12px", display: "flex", gap: 10,
                  borderBottom: i < order.lines.length - 1 ? `1px solid ${ADM.lineSoft}` : "none",
                }}>
                  <div style={{
                    width: 32, fontFamily: ADM.sans, fontSize: 13, fontWeight: 600, color: ADM.ink,
                  }}>{l.qty}×</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: ADM.serif, fontSize: 14, color: ADM.ink, lineHeight: 1.2 }}>
                      {l.wineName}
                    </div>
                    <div style={{ fontFamily: ADM.sans, fontSize: 11, color: ADM.inkSoft, marginTop: 2 }}>
                      {[l.wineProducer, l.wineVintage].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <div style={{
                    fontFamily: ADM.sans, fontSize: 12, color: ADM.inkSoft, alignSelf: "center",
                    fontVariantNumeric: "tabular-nums",
                  }}>{fmtEUR(l.unitPrice)}</div>
                  <div style={{
                    width: 80, textAlign: "right", fontFamily: ADM.serif, fontSize: 14, fontWeight: 600,
                    color: ADM.ink, alignSelf: "center", fontVariantNumeric: "tabular-nums",
                  }}>{fmtEUR(l.unitPrice * l.qty)}</div>
                </div>
              ))}
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              padding: "12px 4px 0",
            }}>
              <span style={{ fontFamily: ADM.sans, fontSize: 11.5, color: ADM.inkSoft, letterSpacing: 1, textTransform: "uppercase" }}>
                Totale
              </span>
              <span style={{ fontFamily: ADM.serif, fontSize: 22, fontWeight: 600, color: ADM.carmine }}>
                {fmtEUR(order.total)}
              </span>
            </div>
          </Section>

          {/* Email notifica */}
          <Section label="Notifica email Enopera">
            <div style={{ fontFamily: ADM.sans, fontSize: 12, color: ADM.inkSoft, lineHeight: 1.6 }}>
              <div>Destinatario: <code style={{ color: ADM.ink }}>{order.notificationEmailTo ?? "—"}</code></div>
              <div>Inviata: {fmtItDateTime(order.notificationEmailSentAt)}</div>
              {order.notificationEmailError && (
                <div style={{ color: ADM.red, marginTop: 4 }}>
                  Errore: {order.notificationEmailError}
                </div>
              )}
            </div>
          </Section>

          {/* Tecnici */}
          <Section label="Riferimenti tecnici">
            <div style={{ fontFamily: ADM.mono, fontSize: 11, color: ADM.inkSoft, lineHeight: 1.6 }}>
              <div>Order id: <code>{order.id}</code></div>
              <div>Idempotency: <code>{order.clientIdempotencyKey}</code></div>
              {order.startyOrderId && <div>Starty id: <code>{order.startyOrderId}</code></div>}
              {order.startyDocumentNumber && <div>Starty doc: <code>{order.startyDocumentNumber}</code></div>}
              {order.deliveredAt && <div>Consegnato: <code>{fmtItDateTime(order.deliveredAt)}</code></div>}
              <div>Aggiornato: <code>{fmtItDateTime(order.updatedAt)}</code></div>
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 28px", borderTop: `1px solid ${ADM.line}`,
          background: ADM.panelAlt, display: "flex", gap: 10, alignItems: "center",
        }}>
          {feedback && (
            <div style={{
              fontFamily: ADM.sans, fontSize: 12,
              color: feedback.ok ? ADM.green : ADM.red, flex: 1,
            }}>
              {feedback.ok ? feedback.message ?? "Salvato" : feedback.error}
            </div>
          )}
          {!feedback && <div style={{ flex: 1 }} />}
          <AdmBtn kind="danger" onClick={onCancel} icon={AdmIcons.trash(14)}>
            Cancella ordine
          </AdmBtn>
          <AdmBtn kind="secondary" onClick={onClose}>Chiudi</AdmBtn>
          <AdmBtn kind="primary" onClick={onSave} icon={AdmIcons.check(14)}>
            {pending ? "Salvataggio…" : "Salva"}
          </AdmBtn>
        </div>
      </div>
    </div>
  );
}

// ───────── small bits ─────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontFamily: ADM.sans, fontSize: 11, fontWeight: 600, letterSpacing: 1.4,
        textTransform: "uppercase", color: ADM.inkSoft, marginBottom: 8,
      }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px",
  border: `1px solid ${ADM.line}`, borderRadius: 6,
  background: ADM.white, fontFamily: ADM.sans, fontSize: 13, color: ADM.ink,
  outline: "none",
};
