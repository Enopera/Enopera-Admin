"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ADM } from "@/lib/admin/tokens";
import { AdmIcons } from "@/lib/admin/icons";
import { AdmAvatar, AdmBtn, AdmStatus, initials } from "@/lib/admin/primitives";
import { useIsMobile } from "@/lib/admin/use-is-mobile";
import { AdmKpiStrip, AdmPageHeader } from "@/components/admin/page-header";
import { ChannelColumn } from "@/components/admin/cantina-channels";
import type {
  AdminRestaurant,
  DeliverySlot,
  DeliverySlotTime,
  UnlinkedUserOption,
} from "@/lib/restaurants/types";
import type { PriceListOption } from "@/lib/price-lists/types";
import type { ShippingConfig } from "@/lib/shipping/types";
import { updateShippingConfig } from "@/lib/shipping/actions";
import type {
  AdminCustomerInventoryRow,
  CatalogWineOption,
  WineChannel,
} from "@/lib/customer-inventory/types";
import {
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
  setUserRestaurant,
  type ActionResult,
  type RestaurantInput,
} from "@/lib/restaurants/actions";
import { setRestaurantPriceList } from "@/lib/price-lists/actions";
import {
  loadRestaurantInventory,
  setInventoryChannel,
  setInventoryQty,
  addInventoryRow,
  removeInventoryRow,
} from "@/lib/customer-inventory/actions";

export function RestaurantsList({
  restaurants,
  unlinkedUsers,
  priceLists,
  catalog,
  shippingConfig,
}: {
  restaurants: AdminRestaurant[];
  unlinkedUsers: UnlinkedUserOption[];
  priceLists: PriceListOption[];
  catalog: CatalogWineOption[];
  shippingConfig: ShippingConfig;
}) {
  const isMobile = useIsMobile();
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return restaurants;
    return restaurants.filter((r) => {
      const fields = [r.name, r.city, r.district, r.address, r.vat];
      return fields.some((f) => f && f.toLowerCase().includes(q));
    });
  }, [restaurants, search]);

  const stats = useMemo(() => {
    const totalUsers = restaurants.reduce((s, r) => s + r.users.length, 0);
    const orphan = restaurants.filter((r) => r.users.length === 0).length;
    const withStarty = restaurants.filter((r) => r.startyBpId).length;
    return { total: restaurants.length, totalUsers, orphan, withStarty };
  }, [restaurants]);

  const openRestaurant = restaurants.find((r) => r.id === openId) ?? null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <AdmPageHeader
        kicker="Anagrafiche · B2B"
        title="Ristoranti"
        sub={`${stats.total} totali · ${stats.totalUsers} utenti collegati`}
        actions={
          <AdmBtn kind="primary" icon={AdmIcons.plus(14)} onClick={() => setCreateOpen(true)}>
            Nuovo ristorante
          </AdmBtn>
        }
      />

      <AdmKpiStrip
        items={[
          { label: "Ristoranti",     value: String(stats.total),       sub: "in anagrafica" },
          { label: "Utenti",         value: String(stats.totalUsers),  sub: "collegati a un ristorante" },
          { label: "Senza utente",   value: String(stats.orphan),      sub: "in attesa di assegnazione" },
          { label: "Con bp Starty",  value: String(stats.withStarty),  sub: "mappati a un BP ERP" },
        ]}
      />

      <ShippingConfigCard config={shippingConfig} isMobile={isMobile} />

      {/* Search */}
      <div style={{
        padding: isMobile ? "12px 16px" : "14px 36px",
        borderBottom: `1px solid ${ADM.line}`,
        display: "flex", gap: 10, alignItems: "center",
      }}>
        <SearchBox
          value={search}
          onChange={setSearch}
          fullWidth={isMobile}
          placeholder="Cerca per nome, città, P.IVA…"
        />
        {!isMobile && (
          <span style={{ flex: 1 }} />
        )}
        {!isMobile && (
          <span style={{ fontFamily: ADM.sans, fontSize: 12, color: ADM.inkSoft }}>
            {filtered.length} di {restaurants.length}
          </span>
        )}
      </div>

      {/* List */}
      <div style={{
        flex: 1, minHeight: 0,
        padding: isMobile ? "12px 12px 24px" : "0 36px 36px",
        overflow: "auto",
      }}>
        {filtered.length === 0 ? (
          <div style={{
            padding: 60, textAlign: "center",
            fontFamily: ADM.serif, fontStyle: "italic",
            fontSize: 16, color: ADM.inkSoft,
          }}>
            Nessun ristorante corrispondente.
          </div>
        ) : isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12 }}>
            {filtered.map((r) => (
              <RestaurantCard key={r.id} restaurant={r} onOpen={() => setOpenId(r.id)} />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{
              display: "flex", background: ADM.panelAlt,
              borderBottom: `1px solid ${ADM.line}`, borderTop: `1px solid ${ADM.line}`,
              fontFamily: ADM.sans, fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
              textTransform: "uppercase", color: ADM.inkSoft,
            }}>
              <div style={{ flex: 2.4, padding: "12px 14px" }}>Ristorante</div>
              <div style={{ flex: 1.4, padding: "12px 14px" }}>Sede</div>
              <div style={{ width: 160, padding: "12px 14px" }}>P. IVA</div>
              <div style={{ width: 110, padding: "12px 14px" }}>Utenti</div>
              <div style={{ width: 110, padding: "12px 14px" }}>Starty BP</div>
              <div style={{ width: 60 }} />
            </div>
            {filtered.map((r) => (
              <RestaurantRow key={r.id} restaurant={r} onOpen={() => setOpenId(r.id)} />
            ))}
          </div>
        )}
      </div>

      {openRestaurant && (
        <RestaurantModal
          restaurant={openRestaurant}
          unlinkedUsers={unlinkedUsers}
          priceLists={priceLists}
          catalog={catalog}
          shippingConfig={shippingConfig}
          onClose={() => setOpenId(null)}
        />
      )}
      {createOpen && (
        <CreateRestaurantModal shippingConfig={shippingConfig} onClose={() => setCreateOpen(false)} />
      )}
    </div>
  );
}

// ───────── Row & Card ─────────

function RestaurantRow({ restaurant, onOpen }: { restaurant: AdminRestaurant; onOpen: () => void }) {
  return (
    <div onClick={onOpen} style={{
      display: "flex", alignItems: "center",
      borderBottom: `1px solid ${ADM.lineSoft}`, background: ADM.panel,
      cursor: "pointer",
    }}
      onMouseEnter={(e) => (e.currentTarget.style.background = ADM.panelAlt)}
      onMouseLeave={(e) => (e.currentTarget.style.background = ADM.panel)}
    >
      <div style={{
        flex: 2.4, padding: "14px",
        display: "flex", alignItems: "center", gap: 12, minWidth: 0,
      }}>
        <AdmAvatar initials={initials(restaurant.name)} size={36} tone="carmine" />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: ADM.serif, fontSize: 15.5, fontWeight: 600, color: ADM.ink,
            letterSpacing: -0.2, lineHeight: 1.15,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{restaurant.name}</div>
          <div style={{
            fontFamily: ADM.sans, fontSize: 11.5, color: ADM.inkSoft, marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {restaurant.address ?? "—"}
          </div>
        </div>
      </div>
      <div style={{ flex: 1.4, padding: "14px", fontFamily: ADM.sans, fontSize: 12.5, color: ADM.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {[restaurant.city, restaurant.district].filter(Boolean).join(" · ") || "—"}
      </div>
      <div style={{ width: 160, padding: "14px", fontFamily: ADM.mono, fontSize: 11.5, color: ADM.ink }}>
        {restaurant.vat ?? "—"}
      </div>
      <div style={{ width: 110, padding: "14px" }}>
        {restaurant.users.length === 0 ? (
          <span style={{
            fontFamily: ADM.sans, fontSize: 11.5, color: ADM.amber,
            padding: "3px 8px", borderRadius: 4, background: ADM.amberWash,
            fontWeight: 600,
          }}>nessuno</span>
        ) : (
          <span style={{ fontFamily: ADM.sans, fontSize: 13, color: ADM.ink, fontVariantNumeric: "tabular-nums" }}>
            {restaurant.users.length}
          </span>
        )}
      </div>
      <div style={{ width: 110, padding: "14px", fontFamily: ADM.mono, fontSize: 12, color: ADM.inkSoft }}>
        {restaurant.startyBpId ?? "—"}
      </div>
      <div style={{ width: 60, padding: "14px", display: "flex", justifyContent: "center", color: ADM.inkSoft }}>
        {AdmIcons.chevronRight(14)}
      </div>
    </div>
  );
}

function RestaurantCard({ restaurant, onOpen }: { restaurant: AdminRestaurant; onOpen: () => void }) {
  return (
    <div onClick={onOpen} style={{
      background: ADM.panel, border: `1px solid ${ADM.line}`, borderRadius: 10,
      padding: "12px 14px", display: "flex", gap: 12, alignItems: "center",
      cursor: "pointer",
    }}>
      <AdmAvatar initials={initials(restaurant.name)} size={40} tone="carmine" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: ADM.serif, fontSize: 15.5, fontWeight: 600, color: ADM.ink,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{restaurant.name}</div>
        <div style={{
          fontFamily: ADM.sans, fontSize: 11.5, color: ADM.inkSoft, marginTop: 2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {[restaurant.city, restaurant.district].filter(Boolean).join(" · ") || restaurant.address || "—"}
        </div>
        <div style={{ fontFamily: ADM.sans, fontSize: 11, color: ADM.inkSoft, marginTop: 4 }}>
          {restaurant.users.length === 0 ? (
            <span style={{ color: ADM.amber, fontWeight: 600 }}>Nessun utente</span>
          ) : (
            <>{restaurant.users.length} {restaurant.users.length === 1 ? "utente" : "utenti"}</>
          )}
          {restaurant.startyBpId ? ` · BP ${restaurant.startyBpId}` : ""}
        </div>
      </div>
      <span style={{ display: "flex", color: ADM.inkSoft, flexShrink: 0 }}>
        {AdmIcons.chevronRight(14)}
      </span>
    </div>
  );
}

// ───────── SearchBox ─────────

function SearchBox({
  value, onChange, fullWidth = false, placeholder = "Cerca…",
}: {
  value: string;
  onChange: (v: string) => void;
  fullWidth?: boolean;
  placeholder?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "0 12px", height: 36,
      width: fullWidth ? "100%" : 320,
      background: ADM.panelAlt, border: `1px solid ${ADM.line}`,
      borderRadius: 6,
    }}>
      <span style={{ display: "flex", color: ADM.inkSoft }}>{AdmIcons.search(14)}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
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

// ───────── Drawer (edit) ─────────

function RestaurantModal({
  restaurant, unlinkedUsers, priceLists, catalog, shippingConfig, onClose,
}: {
  restaurant: AdminRestaurant;
  unlinkedUsers: UnlinkedUserOption[];
  priceLists: PriceListOption[];
  catalog: CatalogWineOption[];
  shippingConfig: ShippingConfig;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<ActionResult | null>(null);

  const [form, setForm] = useState<RestaurantInput>({
    name:            restaurant.name,
    address:         restaurant.address,
    city:            restaurant.city,
    district:        restaurant.district,
    vat:             restaurant.vat,
    email:           restaurant.email,
    phone:           restaurant.phone,
    startyBpId:      restaurant.startyBpId,
    memberSinceYear: restaurant.memberSinceYear,
    notes:           restaurant.notes,
    freeShipping:    restaurant.freeShipping,
    closingDays:     restaurant.closingDays,
    deliverySlots:   restaurant.deliverySlots,
    deliverySlotTimes: restaurant.deliverySlotTimes,
    shippingFeeNet:  restaurant.shippingFeeNet,
    freeShippingThresholdGross: restaurant.freeShippingThresholdGross,
  });
  const [addUserId, setAddUserId] = useState("");

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
      display: "flex", justifyContent: "center", alignItems: "center",
      padding: isMobile ? 0 : 24,
      overflow: "auto",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: isMobile ? "100%" : "min(1100px, 95vw)",
        maxWidth: "100%",
        height: isMobile ? "100vh" : undefined,
        maxHeight: isMobile ? "100vh" : "92vh",
        background: ADM.bg,
        borderRadius: isMobile ? 0 : 12,
        boxShadow: isMobile ? "none" : "0 24px 60px rgba(42,26,29,0.35)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 28px 16px", background: ADM.panel,
          borderBottom: `1px solid ${ADM.line}`,
          display: "flex", alignItems: "flex-start", gap: 14,
        }}>
          <AdmAvatar initials={initials(restaurant.name)} size={48} tone="carmine" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: ADM.sans, fontSize: 10.5, color: ADM.inkSoft,
              letterSpacing: 1.6, textTransform: "uppercase", fontWeight: 600,
            }}>Ristorante</div>
            <h2 style={{
              margin: "4px 0 4px", fontFamily: ADM.serif, fontSize: 24,
              fontWeight: 500, color: ADM.ink, letterSpacing: -0.4, lineHeight: 1.1,
            }}>{restaurant.name}</h2>
            <div style={{ fontFamily: ADM.sans, fontSize: 12, color: ADM.inkSoft }}>
              {restaurant.users.length} {restaurant.users.length === 1 ? "utente" : "utenti"} collegati
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: ADM.inkSoft, border: `1px solid ${ADM.line}`,
            borderRadius: 4, background: ADM.panel,
          }}>{AdmIcons.close(14)}</button>
        </div>

        {/* Body */}
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

          {/* Anagrafica form */}
          <Section label="Anagrafica">
            <Field label="Nome">
              <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            </Field>
            <Field label="Indirizzo">
              <Input value={form.address ?? ""} onChange={(v) => setForm({ ...form, address: v })} />
            </Field>
            <Row2>
              <Field label="Città">
                <Input value={form.city ?? ""} onChange={(v) => setForm({ ...form, city: v })} />
              </Field>
              <Field label="Zona / Calle">
                <Input value={form.district ?? ""} onChange={(v) => setForm({ ...form, district: v })} />
              </Field>
            </Row2>
            <Row2>
              <Field label="P. IVA">
                <Input value={form.vat ?? ""} onChange={(v) => setForm({ ...form, vat: v })} mono />
              </Field>
              <Field label="Anno cliente Enopera">
                <Input
                  value={form.memberSinceYear?.toString() ?? ""}
                  onChange={(v) => setForm({ ...form, memberSinceYear: parseIntOrNull(v) })}
                  mono
                />
              </Field>
            </Row2>
            <Row2>
              <Field label="Email ristorante">
                <Input value={form.email ?? ""} onChange={(v) => setForm({ ...form, email: v })} />
              </Field>
              <Field label="Telefono">
                <Input value={form.phone ?? ""} onChange={(v) => setForm({ ...form, phone: v })} />
              </Field>
            </Row2>
            <Field label="StartyERP BP ID">
              <Input
                value={form.startyBpId?.toString() ?? ""}
                onChange={(v) => setForm({ ...form, startyBpId: parseIntOrNull(v) })}
                mono
                placeholder="Es. 1000123"
              />
            </Field>
            <Field label="Note interne">
              <Textarea value={form.notes ?? ""} onChange={(v) => setForm({ ...form, notes: v })} />
            </Field>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${ADM.line}` }}>
              <div style={{
                fontSize: 11, color: ADM.inkMuted, letterSpacing: 0.6,
                textTransform: "uppercase", fontFamily: ADM.sans, marginBottom: 10,
              }}>
                Condizioni commerciali
              </div>
              <label style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                cursor: "pointer", fontFamily: ADM.sans,
              }}>
                <input
                  type="checkbox"
                  checked={form.freeShipping}
                  onChange={(e) => setForm({ ...form, freeShipping: e.target.checked })}
                  style={{ marginTop: 3, cursor: "pointer" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: ADM.ink, fontWeight: 500 }}>
                    Spedizione sempre gratuita
                  </div>
                  <div style={{ fontSize: 11, color: ADM.inkSoft, marginTop: 2, lineHeight: 1.4 }}>
                    Bypassa la soglia di gratuità (€300) — la spedizione sarà gratis
                    per ogni ordine di questo ristorante, indipendentemente dall&apos;importo.
                  </div>
                </div>
              </label>
              <ShippingOverrideFields form={form} setForm={setForm} config={shippingConfig} />
            </div>
            <OperativitaFields form={form} setForm={setForm} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <AdmBtn
                kind="primary"
                icon={AdmIcons.check(14)}
                onClick={() => run(() => updateRestaurant(restaurant.id, form))}
              >
                {pending ? "Salvataggio…" : "Salva modifiche"}
              </AdmBtn>
              <AdmBtn
                kind="danger"
                icon={AdmIcons.trash(14)}
                onClick={() => {
                  if (confirm(`Eliminare il ristorante "${restaurant.name}"? Gli utenti collegati verranno scollegati.`)) {
                    run(() => deleteRestaurant(restaurant.id), true);
                  }
                }}
              >
                Elimina
              </AdmBtn>
            </div>
          </Section>

          {/* Listino assegnato */}
          <PriceListSection
            restaurantId={restaurant.id}
            currentPriceListId={restaurant.priceListId}
            currentPriceListName={restaurant.priceListName}
            priceLists={priceLists}
            pending={pending}
            run={run}
          />

          {/* Cantina (distribuzione + conto vendita) - condivisa per ristorante */}
          <CantinaSection
            restaurantId={restaurant.id}
            catalog={catalog}
          />

          {/* Utenti collegati */}
          <Section label={`Utenti collegati (${restaurant.users.length})`}>
            {restaurant.users.length === 0 ? (
              <div style={{
                padding: "14px 16px", border: `1px dashed ${ADM.line}`, borderRadius: 6,
                fontFamily: ADM.serif, fontStyle: "italic", fontSize: 13, color: ADM.inkSoft,
                textAlign: "center",
              }}>
                Nessun utente collegato a questo ristorante.
              </div>
            ) : (
              <div style={{ border: `1px solid ${ADM.line}`, borderRadius: 6, overflow: "hidden" }}>
                {restaurant.users.map((u, i) => (
                  <div key={u.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px",
                    borderBottom: i < restaurant.users.length - 1 ? `1px solid ${ADM.lineSoft}` : "none",
                    background: ADM.panel,
                  }}>
                    <AdmAvatar
                      initials={initials(u.fullName ?? u.email)}
                      size={32}
                      tone={u.role === "admin" ? "carmine" : "ink"}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: ADM.sans, fontSize: 13, fontWeight: 600, color: ADM.ink,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{u.fullName ?? u.email}</div>
                      <div style={{
                        fontFamily: ADM.sans, fontSize: 11, color: ADM.inkSoft,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{u.email}</div>
                    </div>
                    <AdmStatus value={u.status} />
                    <AdmBtn
                      kind="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Scollegare ${u.fullName ?? u.email} dal ristorante?`)) {
                          run(() => setUserRestaurant(u.id, null));
                        }
                      }}
                    >
                      Scollega
                    </AdmBtn>
                  </div>
                ))}
              </div>
            )}

            {unlinkedUsers.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <select
                  value={addUserId}
                  onChange={(e) => setAddUserId(e.target.value)}
                  disabled={pending}
                  style={{
                    flex: 1, minWidth: 180,
                    padding: "8px 10px", border: `1px solid ${ADM.line}`,
                    borderRadius: 6, background: ADM.white,
                    fontFamily: ADM.sans, fontSize: 13, color: ADM.ink,
                  }}
                >
                  <option value="">+ Collega un utente esistente…</option>
                  {unlinkedUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName ? `${u.fullName} · ${u.email}` : u.email}
                    </option>
                  ))}
                </select>
                <AdmBtn
                  kind="secondary"
                  size="sm"
                  onClick={() => {
                    if (addUserId) {
                      run(() => setUserRestaurant(addUserId, restaurant.id));
                      setAddUserId("");
                    }
                  }}
                >
                  Collega
                </AdmBtn>
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

// ───────── Cantina section ─────────

function CantinaSection({
  restaurantId, catalog,
}: {
  restaurantId: string;
  catalog: CatalogWineOption[];
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdminCustomerInventoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<ActionResult | null>(null);

  const refresh = async () => {
    try {
      const rows = await loadRestaurantInventory(restaurantId);
      setData(rows);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const distribuzione = useMemo(
    () => (data ?? []).filter((r) => r.channel === "distribuzione")
      .sort((a, b) => a.wineName.localeCompare(b.wineName)),
    [data],
  );
  const contoVendita = useMemo(
    () => (data ?? []).filter((r) => r.channel === "contoVendita")
      .sort((a, b) => a.wineName.localeCompare(b.wineName)),
    [data],
  );

  const inventoryWineIds = useMemo(
    () => new Set((data ?? []).map((r) => r.wineId)),
    [data],
  );
  const availableWines = useMemo(
    () => catalog.filter((w) => !inventoryWineIds.has(w.id)),
    [catalog, inventoryWineIds],
  );

  const run = (fn: () => Promise<ActionResult>) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await fn();
      setFeedback(res);
      if (res.ok) await refresh();
    });
  };

  if (loading) {
    return (
      <Section label="Cantina">
        <div style={{
          padding: 24, textAlign: "center",
          fontFamily: ADM.sans, fontSize: 12, color: ADM.inkSoft,
        }}>
          Caricamento cantina…
        </div>
      </Section>
    );
  }

  if (error || !data) {
    return (
      <Section label="Cantina">
        <div style={{
          padding: "10px 14px", borderRadius: 6,
          background: ADM.redWash, color: ADM.red,
          fontFamily: ADM.sans, fontSize: 13,
          border: `1px solid ${ADM.red}33`,
        }}>
          Errore caricamento cantina{error ? `: ${error}` : ""}
        </div>
      </Section>
    );
  }

  const totalBottles = distribuzione.length + contoVendita.length;
  const totalQty = (data ?? []).reduce((s, r) => s + r.qtyInStock, 0);

  return (
    <Section label={`Cantina · ${totalBottles} vin${totalBottles === 1 ? "o" : "i"} · ${totalQty} bottiglie`}>
      {feedback && (
        <div style={{
          padding: "10px 14px", borderRadius: 6, marginBottom: 12,
          background: feedback.ok ? ADM.greenWash : ADM.redWash,
          color: feedback.ok ? ADM.green : ADM.red,
          fontFamily: ADM.sans, fontSize: 13, fontWeight: 500,
          border: `1px solid ${feedback.ok ? ADM.green : ADM.red}33`,
        }}>
          {feedback.ok ? feedback.message ?? "Operazione completata" : feedback.error}
        </div>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
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
          onAdd={(wineId) => run(() => addInventoryRow(restaurantId, wineId, "distribuzione", 0))}
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
          onAdd={(wineId) => run(() => addInventoryRow(restaurantId, wineId, "contoVendita", 0))}
          onRemove={(id) => run(() => removeInventoryRow(id))}
        />
      </div>
    </Section>
  );
}

// ───────── Price list section ─────────

function PriceListSection({
  restaurantId, currentPriceListId, currentPriceListName,
  priceLists, pending, run,
}: {
  restaurantId: string;
  currentPriceListId: string | null;
  currentPriceListName: string | null;
  priceLists: PriceListOption[];
  pending: boolean;
  run: (fn: () => Promise<ActionResult>) => void;
}) {
  // Stato locale dropdown — "" significa "usa il default" (NULL nel DB).
  const [selected, setSelected] = useState<string>(currentPriceListId ?? "");
  const defaultPl = priceLists.find((p) => p.isDefault) ?? null;
  const changed = selected !== (currentPriceListId ?? "");

  return (
    <Section label="Listino assegnato">
      <div style={{
        padding: "10px 12px", borderRadius: 6,
        background: currentPriceListId ? ADM.panelAlt : ADM.goldWash,
        border: `1px solid ${currentPriceListId ? ADM.line : ADM.gold + "33"}`,
        marginBottom: 12,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{
          color: currentPriceListId ? ADM.inkSoft : ADM.gold,
          display: "flex", flexShrink: 0,
        }}>
          {currentPriceListId ? AdmIcons.tag(16) : AdmIcons.star(16)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: ADM.sans, fontSize: 10.5, color: ADM.inkSoft,
            letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600,
          }}>
            {currentPriceListId ? "Listino custom" : "Listino di default"}
          </div>
          <div style={{
            fontFamily: ADM.serif, fontSize: 15, color: ADM.ink, fontWeight: 600, marginTop: 1,
          }}>
            {currentPriceListName ?? defaultPl?.name ?? "Standard"}
          </div>
        </div>
      </div>

      <Field label="Cambia listino">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={pending}
          style={{
            width: "100%", padding: "8px 10px",
            border: `1px solid ${ADM.line}`, borderRadius: 6,
            background: ADM.white,
            fontFamily: ADM.sans, fontSize: 13, color: ADM.ink, cursor: "pointer",
          }}
        >
          <option value="">— Usa il listino di default —</option>
          {priceLists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>
      </Field>

      <div style={{ display: "flex", gap: 8 }}>
        <AdmBtn
          kind="primary"
          icon={AdmIcons.check(14)}
          onClick={() => run(() => setRestaurantPriceList(restaurantId, selected || null))}
        >
          {pending ? "Salvataggio…" : changed ? "Salva listino" : "Salva listino"}
        </AdmBtn>
        {currentPriceListId && (
          <AdmBtn
            kind="secondary"
            onClick={() => {
              setSelected("");
              run(() => setRestaurantPriceList(restaurantId, null));
            }}
          >
            Ripristina default
          </AdmBtn>
        )}
      </div>
    </Section>
  );
}

// ───────── Create modal ─────────

function CreateRestaurantModal({ shippingConfig, onClose }: { shippingConfig: ShippingConfig; onClose: () => void }) {
  const isMobile = useIsMobile();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<ActionResult | null>(null);
  const [form, setForm] = useState<RestaurantInput>({
    name: "",
    address: "",
    city: "",
    district: "",
    vat: "",
    email: "",
    phone: "",
    startyBpId: null,
    memberSinceYear: null,
    notes: "",
    freeShipping: false,
    closingDays: [],
    deliverySlots: [],
    deliverySlotTimes: {},
    shippingFeeNet: null,
    freeShippingThresholdGross: null,
  });

  const parseIntOrNull = (s: unknown): number | null => {
    if (s == null || s === "") return null;
    const n = typeof s === "number" ? s : Number(String(s).trim());
    return Number.isFinite(n) ? Math.round(n) : null;
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "#2A1A1D88", zIndex: 60,
      display: "flex", justifyContent: "center", alignItems: isMobile ? "flex-end" : "center",
      padding: isMobile ? 0 : 24,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: isMobile ? "100%" : 560, maxWidth: "100%",
        maxHeight: isMobile ? "90vh" : "calc(100vh - 48px)",
        background: ADM.bg,
        borderRadius: isMobile ? "14px 14px 0 0" : 10,
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 20px 60px rgba(42,26,29,0.3)",
      }}>
        <div style={{
          padding: "18px 24px", background: ADM.panel,
          borderBottom: `1px solid ${ADM.line}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <h2 style={{
            margin: 0, fontFamily: ADM.serif, fontSize: 22, fontWeight: 500, color: ADM.ink,
          }}>Nuovo ristorante</h2>
          <button onClick={onClose} style={{
            width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: ADM.inkSoft, border: `1px solid ${ADM.line}`,
            borderRadius: 4, background: ADM.panel,
          }}>{AdmIcons.close(14)}</button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
          {feedback && (
            <div style={{
              padding: "10px 14px", borderRadius: 6, marginBottom: 14,
              background: feedback.ok ? ADM.greenWash : ADM.redWash,
              color: feedback.ok ? ADM.green : ADM.red,
              fontFamily: ADM.sans, fontSize: 13, fontWeight: 500,
              border: `1px solid ${feedback.ok ? ADM.green : ADM.red}33`,
            }}>{feedback.ok ? feedback.message ?? "Creato" : feedback.error}</div>
          )}
          <Field label="Nome *">
            <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          </Field>
          <Field label="Indirizzo">
            <Input value={form.address ?? ""} onChange={(v) => setForm({ ...form, address: v })} />
          </Field>
          <Row2>
            <Field label="Città">
              <Input value={form.city ?? ""} onChange={(v) => setForm({ ...form, city: v })} />
            </Field>
            <Field label="Zona / Calle">
              <Input value={form.district ?? ""} onChange={(v) => setForm({ ...form, district: v })} />
            </Field>
          </Row2>
          <Row2>
            <Field label="P. IVA">
              <Input value={form.vat ?? ""} onChange={(v) => setForm({ ...form, vat: v })} mono />
            </Field>
            <Field label="Anno cliente">
              <Input
                value={form.memberSinceYear?.toString() ?? ""}
                onChange={(v) => setForm({ ...form, memberSinceYear: parseIntOrNull(v) })}
                mono
              />
            </Field>
          </Row2>
          <Row2>
            <Field label="Email ristorante">
              <Input value={form.email ?? ""} onChange={(v) => setForm({ ...form, email: v })} />
            </Field>
            <Field label="Telefono">
              <Input value={form.phone ?? ""} onChange={(v) => setForm({ ...form, phone: v })} />
            </Field>
          </Row2>
          <Field label="StartyERP BP ID">
            <Input
              value={form.startyBpId?.toString() ?? ""}
              onChange={(v) => setForm({ ...form, startyBpId: parseIntOrNull(v) })}
              mono
            />
          </Field>
          <Field label="Note interne">
            <Textarea value={form.notes ?? ""} onChange={(v) => setForm({ ...form, notes: v })} />
          </Field>
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${ADM.line}` }}>
            <div style={{
              fontSize: 11, color: ADM.inkMuted, letterSpacing: 0.6,
              textTransform: "uppercase", fontFamily: ADM.sans, marginBottom: 10,
            }}>
              Condizioni commerciali
            </div>
            <label style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              cursor: "pointer", fontFamily: ADM.sans,
            }}>
              <input
                type="checkbox"
                checked={form.freeShipping}
                onChange={(e) => setForm({ ...form, freeShipping: e.target.checked })}
                style={{ marginTop: 3, cursor: "pointer" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: ADM.ink, fontWeight: 500 }}>
                  Spedizione sempre gratuita
                </div>
                <div style={{ fontSize: 11, color: ADM.inkSoft, marginTop: 2, lineHeight: 1.4 }}>
                  Bypassa la soglia di gratuità (€300) — la spedizione sarà gratis
                  per ogni ordine di questo ristorante, indipendentemente dall&apos;importo.
                </div>
              </div>
            </label>
            <ShippingOverrideFields form={form} setForm={setForm} config={shippingConfig} />
          </div>
          <OperativitaFields form={form} setForm={setForm} />
        </div>
        <div style={{
          padding: "14px 24px", borderTop: `1px solid ${ADM.line}`,
          background: ADM.panelAlt, display: "flex", gap: 10, justifyContent: "flex-end",
        }}>
          <AdmBtn kind="secondary" onClick={onClose}>Annulla</AdmBtn>
          <AdmBtn
            kind="primary"
            icon={AdmIcons.check(14)}
            onClick={() => {
              setFeedback(null);
              startTransition(async () => {
                const res = await createRestaurant(form);
                setFeedback(res);
                if (res.ok) setTimeout(() => onClose(), 600);
              });
            }}
          >
            {pending ? "Creazione…" : "Crea"}
          </AdmBtn>
        </div>
      </div>
    </div>
  );
}

// ───────── Small bits ─────────

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

function Row2({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{children}</div>
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

// ───────── Operatività (giorni chiusura + fasce consegna) ─────────

// ISO 8601: 1=Lunedì .. 7=Domenica. Allineato con DateTime.weekday di Dart.
const WEEKDAYS: { iso: number; label: string }[] = [
  { iso: 1, label: "Lun" },
  { iso: 2, label: "Mar" },
  { iso: 3, label: "Mer" },
  { iso: 4, label: "Gio" },
  { iso: 5, label: "Ven" },
  { iso: 6, label: "Sab" },
  { iso: 7, label: "Dom" },
];

const SLOTS: { key: DeliverySlot; label: string }[] = [
  { key: "morning", label: "Mattina" },
  { key: "afternoon", label: "Pomeriggio" },
];

// Orari proposti quando si attiva una fascia (l'admin poi li modifica).
const SLOT_DEFAULT_TIMES: Record<DeliverySlot, DeliverySlotTime> = {
  morning: { from: "10:00", to: "12:00" },
  afternoon: { from: "12:00", to: "16:00" },
};

function TimeInput({
  value, onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "6px 8px", border: `1px solid ${ADM.line}`, borderRadius: 6,
        background: ADM.white, fontFamily: ADM.mono, fontSize: 13, color: ADM.ink,
        outline: "none",
      }}
    />
  );
}

function Chip({
  active, label, onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 13px", borderRadius: 999,
        border: `1px solid ${active ? ADM.carmine : ADM.line}`,
        background: active ? ADM.carmineWash : ADM.white,
        color: active ? ADM.carmine : ADM.inkSoft,
        fontFamily: ADM.sans, fontSize: 12.5, fontWeight: active ? 600 : 500,
        cursor: "pointer", outline: "none",
      }}
    >
      {label}
    </button>
  );
}

function OperativitaFields({
  form, setForm,
}: {
  form: RestaurantInput;
  setForm: (f: RestaurantInput) => void;
}) {
  const toggleDay = (iso: number) => {
    const set = new Set(form.closingDays ?? []);
    if (set.has(iso)) set.delete(iso);
    else set.add(iso);
    setForm({ ...form, closingDays: [...set].sort((a, b) => a - b) });
  };
  const toggleSlot = (slot: DeliverySlot) => {
    const set = new Set(form.deliverySlots ?? []);
    const times = { ...(form.deliverySlotTimes ?? {}) };
    if (set.has(slot)) {
      set.delete(slot);
      delete times[slot];
    } else {
      set.add(slot);
      if (!times[slot]) times[slot] = { ...SLOT_DEFAULT_TIMES[slot] };
    }
    // Ordine fisso: mattina prima di pomeriggio.
    setForm({
      ...form,
      deliverySlots: SLOTS.map((s) => s.key).filter((k) => set.has(k)),
      deliverySlotTimes: times,
    });
  };

  const setSlotTime = (slot: DeliverySlot, field: "from" | "to", value: string) => {
    const times = { ...(form.deliverySlotTimes ?? {}) };
    const cur = times[slot] ?? { from: "", to: "" };
    times[slot] = { ...cur, [field]: value };
    setForm({ ...form, deliverySlotTimes: times });
  };

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${ADM.line}` }}>
      <div style={{
        fontSize: 11, color: ADM.inkMuted, letterSpacing: 0.6,
        textTransform: "uppercase", fontFamily: ADM.sans, marginBottom: 10,
      }}>
        Operatività
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: ADM.sans, fontSize: 11, color: ADM.inkSoft, marginBottom: 6, fontWeight: 500 }}>
          Giorni di chiusura
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {WEEKDAYS.map((d) => (
            <Chip
              key={d.iso}
              active={(form.closingDays ?? []).includes(d.iso)}
              label={d.label}
              onClick={() => toggleDay(d.iso)}
            />
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontFamily: ADM.sans, fontSize: 11, color: ADM.inkSoft, marginBottom: 6, fontWeight: 500 }}>
          Fasce di consegna
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {SLOTS.map((s) => (
            <Chip
              key={s.key}
              active={(form.deliverySlots ?? []).includes(s.key)}
              label={s.label}
              onClick={() => toggleSlot(s.key)}
            />
          ))}
        </div>
        {SLOTS.filter((s) => (form.deliverySlots ?? []).includes(s.key)).map((s) => {
          const t = (form.deliverySlotTimes ?? {})[s.key] ?? { from: "", to: "" };
          return (
            <div key={s.key} style={{
              display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap",
            }}>
              <span style={{ width: 78, fontFamily: ADM.sans, fontSize: 12, color: ADM.ink, fontWeight: 500 }}>
                {s.label}
              </span>
              <span style={{ fontFamily: ADM.sans, fontSize: 11.5, color: ADM.inkSoft }}>dalle</span>
              <TimeInput value={t.from} onChange={(v) => setSlotTime(s.key, "from", v)} />
              <span style={{ fontFamily: ADM.sans, fontSize: 11.5, color: ADM.inkSoft }}>alle</span>
              <TimeInput value={t.to} onChange={(v) => setSlotTime(s.key, "to", v)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────── Spedizione: config globale + override ─────────

function parseFloatOrNull(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function NumField({
  label, value, onChange, suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontFamily: ADM.sans, fontSize: 11, color: ADM.inkSoft, fontWeight: 500 }}>
        {label}
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        border: `1px solid ${ADM.line}`, borderRadius: 6, background: ADM.white,
        padding: "0 10px", height: 34, width: 160,
      }}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          style={{
            flex: 1, border: "none", outline: "none", background: "transparent",
            fontFamily: ADM.mono, fontSize: 13, color: ADM.ink, minWidth: 0,
          }}
        />
        {suffix && <span style={{ fontFamily: ADM.sans, fontSize: 12, color: ADM.inkSoft }}>{suffix}</span>}
      </div>
    </div>
  );
}

// Banda sotto la KPI strip: i default globali di spedizione (singleton DB).
function ShippingConfigCard({ config, isMobile }: { config: ShippingConfig; isMobile: boolean }) {
  const [fee, setFee] = useState(String(config.feeNet));
  const [threshold, setThreshold] = useState(String(config.freeThresholdGross));
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<ActionResult | null>(null);

  const save = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await updateShippingConfig(
        Number(fee.replace(",", ".")),
        Number(threshold.replace(",", ".")),
      );
      setFeedback(res);
    });
  };

  return (
    <div style={{
      padding: isMobile ? "12px 16px" : "14px 36px",
      borderBottom: `1px solid ${ADM.line}`,
      display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{
          fontFamily: ADM.sans, fontSize: 10.5, color: ADM.inkSoft,
          letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600,
        }}>
          Spedizione · default globali
        </div>
        <div style={{ fontFamily: ADM.serif, fontSize: 13.5, color: ADM.inkSoft, fontStyle: "italic" }}>
          Usati per ogni ristorante senza override.
        </div>
      </div>
      <span style={{ flex: 1, minWidth: 12 }} />
      <NumField label="Costo spedizione (netto)" suffix="€" value={fee} onChange={setFee} />
      <NumField label="Soglia gratis (lordo vini)" suffix="€" value={threshold} onChange={setThreshold} />
      <AdmBtn kind="primary" icon={AdmIcons.check(14)} onClick={save}>
        {pending ? "Salvataggio…" : "Salva"}
      </AdmBtn>
      {feedback && (
        <span style={{
          fontFamily: ADM.sans, fontSize: 12, fontWeight: 500,
          color: feedback.ok ? ADM.green : ADM.red,
        }}>
          {feedback.ok ? (feedback.message ?? "Salvato") : feedback.error}
        </span>
      )}
    </div>
  );
}

// Override per-ristorante dentro la sezione "Condizioni commerciali".
function ShippingOverrideFields({
  form, setForm, config,
}: {
  form: RestaurantInput;
  setForm: (f: RestaurantInput) => void;
  config: ShippingConfig;
}) {
  const feeStr = form.shippingFeeNet == null ? "" : String(form.shippingFeeNet);
  const thrStr = form.freeShippingThresholdGross == null ? "" : String(form.freeShippingThresholdGross);
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Costo spedizione (override)">
          <Input
            value={feeStr}
            onChange={(v) => setForm({ ...form, shippingFeeNet: parseFloatOrNull(v) })}
            mono
            placeholder={`${config.feeNet} € (globale)`}
          />
        </Field>
        <Field label="Soglia gratis (override)">
          <Input
            value={thrStr}
            onChange={(v) => setForm({ ...form, freeShippingThresholdGross: parseFloatOrNull(v) })}
            mono
            placeholder={`${config.freeThresholdGross} € (globale)`}
          />
        </Field>
      </div>
      <div style={{ fontSize: 11, color: ADM.inkSoft, marginTop: 2, lineHeight: 1.4, fontFamily: ADM.sans }}>
        Lascia vuoto per usare i valori globali. L&apos;override vale solo per questo ristorante.
      </div>
    </div>
  );
}
