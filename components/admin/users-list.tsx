"use client";

import { useState, useTransition } from "react";
import { ADM } from "@/lib/admin/tokens";
import { AdmIcons } from "@/lib/admin/icons";
import { AdmAvatar, AdmBtn, AdmStatus, initials } from "@/lib/admin/primitives";
import { useIsMobile } from "@/lib/admin/use-is-mobile";
import { AdmKpiStrip, AdmPageHeader } from "@/components/admin/page-header";
import type { AdminUser, AccountStatus } from "@/lib/users/types";
import {
  sendPasswordReset, setUserStatus, updateUserProfile, deleteUser, inviteUser,
  type ActionResult,
} from "@/lib/users/actions";
import { setUserRestaurant } from "@/lib/restaurants/actions";

/// Opzione del dropdown ristoranti nel drawer utente.
export interface RestaurantOption {
  id: string;
  name: string;
  city: string | null;
  email: string | null;
  vat: string | null;
  address: string | null;
  district: string | null;
}

type FilterId = "all" | "attivo" | "sospeso" | "invitato" | "admin";

const filters: { id: FilterId; label: string }[] = [
  { id: "all",      label: "Tutti" },
  { id: "attivo",   label: "Attivi" },
  { id: "sospeso",  label: "Sospesi" },
  { id: "invitato", label: "Invitati" },
  { id: "admin",    label: "Admin" },
];

function fmtItDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const months = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
  return `${String(d.getDate()).padStart(2, "0")} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtItDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${fmtItDate(iso)} · ${time}`;
}

export function UsersList({
  users,
  restaurants,
}: {
  users: AdminUser[];
  restaurants: RestaurantOption[];
}) {
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState<FilterId>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const counts = {
    all:      users.length,
    attivo:   users.filter((u) => u.status === "attivo").length,
    sospeso:  users.filter((u) => u.status === "sospeso").length,
    invitato: users.filter((u) => u.status === "invitato").length,
    admin:    users.filter((u) => u.role === "admin").length,
  };

  const filtered = users.filter((u) => {
    if (filter === "all") return true;
    if (filter === "admin") return u.role === "admin";
    return u.status === filter;
  });

  const openUser = users.find((u) => u.id === openId);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
      <AdmPageHeader
        kicker="Piattaforma · Account"
        title="Utenti"
        sub={`${counts.attivo} attivi · ${counts.invitato} invitati · ${counts.sospeso} sospesi`}
        actions={
          <AdmBtn kind="primary" icon={AdmIcons.plus(14)} onClick={() => setInviteOpen(true)}>
            Invita utente
          </AdmBtn>
        }
      />
      <AdmKpiStrip
        items={[
          { label: "Totale account", value: String(counts.all),      sub: "registrati su Supabase Auth" },
          { label: "Attivi",         value: String(counts.attivo),   sub: "possono accedere" },
          { label: "Invitati",       value: String(counts.invitato), sub: "in attesa di prima password" },
          { label: "Sospesi",        value: String(counts.sospeso),  sub: "login bloccato" },
          { label: "Amministratori", value: String(counts.admin),    sub: "ruolo admin" },
        ]}
      />

      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: isMobile ? "12px 16px" : "14px 36px",
        borderBottom: `1px solid ${ADM.line}`,
      }}>
        <div style={{
          display: "flex", gap: 4,
          flexWrap: isMobile ? "nowrap" : "wrap",
          overflowX: isMobile ? "auto" : "visible",
          WebkitOverflowScrolling: "touch",
          minWidth: 0, flex: isMobile ? 1 : "0 0 auto",
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
        {!isMobile && <span style={{ flex: 1 }} />}
        {!isMobile && (
          <span style={{ fontFamily: ADM.sans, fontSize: 12, color: ADM.inkSoft }}>
            {filtered.length} di {counts.all}
          </span>
        )}
      </div>

      <div style={{
        flex: 1, minHeight: 0,
        padding: isMobile ? "12px 12px 24px" : "0 36px 36px",
        overflow: isMobile ? "auto" : "hidden",
        display: "flex", flexDirection: "column",
      }}>
        {!isMobile && (
        <>
        <div style={{
          display: "flex", background: ADM.panelAlt,
          borderBottom: `1px solid ${ADM.line}`, borderTop: `1px solid ${ADM.line}`,
          fontFamily: ADM.sans, fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
          textTransform: "uppercase", color: ADM.inkSoft,
        }}>
          <div style={{ flex: 2.4, padding: "12px 14px" }}>Utente</div>
          <div style={{ flex: 1.4, padding: "12px 14px" }}>Email</div>
          <div style={{ width: 130, padding: "12px 14px" }}>Telefono</div>
          <div style={{ width: 110, padding: "12px 14px" }}>Ruolo</div>
          <div style={{ width: 130, padding: "12px 14px" }}>Stato</div>
          <div style={{ width: 150, padding: "12px 14px" }}>Ultimo accesso</div>
          <div style={{ width: 60 }} />
        </div>
        <div style={{
          flex: 1, overflow: "auto",
          background: ADM.panel, border: `1px solid ${ADM.line}`, borderTop: "none",
          display: "flex", flexDirection: "column",
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "60px 16px", textAlign: "center", fontFamily: ADM.sans, fontSize: 13, color: ADM.inkSoft }}>
              Nessun utente con questo filtro.
            </div>
          ) : filtered.map((u, idx) => (
            <div key={u.id} onClick={() => setOpenId(u.id)} style={{
              display: "flex", alignItems: "center", height: 64, cursor: "pointer",
              borderBottom: idx === filtered.length - 1 ? "none" : `1px solid ${ADM.lineSoft}`,
              background: openId === u.id ? ADM.carmineWash + "55" : "transparent",
            }}>
              <div style={{ flex: 2.4, padding: "0 14px", display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <AdmAvatar
                  initials={initials(u.fullName ?? u.email)}
                  size={36}
                  tone={u.role === "admin" ? "carmine" : "ink"}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontFamily: ADM.serif, fontSize: 16, fontWeight: 600, color: ADM.ink,
                    letterSpacing: -0.2, lineHeight: 1.15,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{u.fullName ?? u.email}</div>
                  <div style={{ fontFamily: ADM.sans, fontSize: 11.5, color: ADM.inkSoft, marginTop: 2 }}>
                    Iscritto il {fmtItDate(u.createdAt)}
                  </div>
                </div>
              </div>
              <div style={{ flex: 1.4, padding: "0 14px", fontFamily: ADM.sans, fontSize: 12.5, color: ADM.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {u.email}
              </div>
              <div style={{ width: 130, padding: "0 14px", fontFamily: ADM.sans, fontSize: 12.5, color: ADM.inkSoft }}>
                {u.phone ?? "—"}
              </div>
              <div style={{ width: 110, padding: "0 14px" }}>
                <RoleBadge role={u.role} />
              </div>
              <div style={{ width: 130, padding: "0 14px" }}>
                <AdmStatus value={u.status} />
              </div>
              <div style={{ width: 150, padding: "0 14px", fontFamily: ADM.sans, fontSize: 12, color: ADM.inkSoft }}>
                {fmtItDateTime(u.lastSignInAt)}
              </div>
              <div style={{ width: 60, padding: "0 14px", display: "flex", justifyContent: "flex-end", color: ADM.inkSoft }}>
                {AdmIcons.chevronRight(14)}
              </div>
            </div>
          ))}
        </div>
        </>
        )}

        {isMobile && (
          filtered.length === 0 ? (
            <div style={{ padding: "60px 16px", textAlign: "center", fontFamily: ADM.sans, fontSize: 13, color: ADM.inkSoft }}>
              Nessun utente con questo filtro.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map((u) => (
                <div key={u.id} onClick={() => setOpenId(u.id)} style={{
                  background: ADM.panel, border: `1px solid ${ADM.line}`, borderRadius: 10,
                  padding: "12px 14px", display: "flex", gap: 12, alignItems: "center",
                  cursor: "pointer",
                }}>
                  <AdmAvatar
                    initials={initials(u.fullName ?? u.email)}
                    size={40}
                    tone={u.role === "admin" ? "carmine" : "ink"}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: ADM.serif, fontSize: 15.5, fontWeight: 600, color: ADM.ink,
                      letterSpacing: -0.2, lineHeight: 1.15,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{u.fullName ?? u.email}</div>
                    <div style={{
                      fontFamily: ADM.sans, fontSize: 11.5, color: ADM.inkSoft, marginTop: 2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{u.email}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      <AdmStatus value={u.status} />
                      <RoleBadge role={u.role} />
                    </div>
                  </div>
                  <span style={{ display: "flex", color: ADM.inkSoft, flexShrink: 0 }}>
                    {AdmIcons.chevronRight(14)}
                  </span>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {openUser && (
        <UserDrawer
          user={openUser}
          restaurants={restaurants}
          onClose={() => setOpenId(null)}
        />
      )}
      {inviteOpen && <InviteModal restaurants={restaurants} onClose={() => setInviteOpen(false)} />}
    </div>
  );
}

function RoleBadge({ role }: { role: "admin" | "user" }) {
  if (role === "admin") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "3px 10px", borderRadius: 4,
        background: ADM.carmineWash, color: ADM.carmine,
        fontFamily: ADM.sans, fontSize: 11.5, fontWeight: 600, letterSpacing: 0.2,
      }}>Admin</span>
    );
  }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 10px", borderRadius: 4,
      background: ADM.panelAlt, color: ADM.inkSoft,
      fontFamily: ADM.sans, fontSize: 11.5, fontWeight: 600, letterSpacing: 0.2,
    }}>Utente</span>
  );
}

// ─── Drawer dettaglio + azioni ────────────────────────────────
function UserDrawer({
  user,
  restaurants,
  onClose,
}: {
  user: AdminUser;
  restaurants: RestaurantOption[];
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  // L'anagrafica del ristorante (nome, indirizzo, città, P.IVA, BP Starty,
  // anno cliente, telefono) è SOLA del ristorante linkato — vedi sezione
  // "Ristorante" sotto. Qui restano solo i campi PROPRI dell'utente.
  const [form, setForm] = useState({
    fullName: user.fullName ?? "",
    phone: user.phone ?? "",
    notes: user.notes ?? "",
  });

  const linkedRestaurant = restaurants.find((r) => r.id === user.restaurantId) ?? null;

  const run = (fn: () => Promise<ActionResult>) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await fn();
      setFeedback(res.ok
        ? { kind: "ok",  text: res.message ?? "Operazione completata" }
        : { kind: "err", text: res.error });
    });
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(42, 26, 29, 0.32)",
      display: "flex", justifyContent: "flex-end", zIndex: 50,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: isMobile ? "100%" : 640,
        maxWidth: "100%", height: "100%", background: ADM.bg,
        boxShadow: isMobile ? "none" : "-20px 0 60px rgba(42, 26, 29, 0.2)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{
          padding: "20px 28px", display: "flex", alignItems: "flex-start", gap: 16,
          background: ADM.panel, borderBottom: `1px solid ${ADM.line}`,
        }}>
          <AdmAvatar
            initials={initials(user.fullName ?? user.email)}
            size={56}
            tone={user.role === "admin" ? "carmine" : "ink"}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: ADM.sans, fontSize: 10.5, letterSpacing: 1.6, textTransform: "uppercase", color: ADM.inkSoft, fontWeight: 600 }}>
                Utente · {user.id.slice(0, 8)}
              </span>
              <AdmStatus value={user.status} />
              <RoleBadge role={user.role} />
            </div>
            <h2 style={{ margin: "6px 0 4px", fontFamily: ADM.serif, fontSize: 28, fontWeight: 500, color: ADM.ink, letterSpacing: -0.6, lineHeight: 1.05 }}>
              {user.fullName ?? user.email}
            </h2>
            <div style={{ fontFamily: ADM.sans, fontSize: 12.5, color: ADM.inkSoft }}>
              {user.email} · iscritto il {fmtItDate(user.createdAt)}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: ADM.inkSoft, border: `1px solid ${ADM.line}`, borderRadius: 4, background: ADM.panel,
          }}>{AdmIcons.close(14)}</button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "22px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
          {feedback && (
            <div style={{
              padding: "10px 14px", borderRadius: 6,
              background: feedback.kind === "ok" ? ADM.greenWash : ADM.redWash,
              color: feedback.kind === "ok" ? ADM.green : ADM.red,
              fontFamily: ADM.sans, fontSize: 13, fontWeight: 500,
              border: `1px solid ${feedback.kind === "ok" ? ADM.green : ADM.red}33`,
            }}>{feedback.text}</div>
          )}

          {/* Anagrafica */}
          <section style={{ background: ADM.panel, border: `1px solid ${ADM.line}`, borderRadius: 6, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontFamily: ADM.sans, fontSize: 10.5, color: ADM.inkSoft, letterSpacing: 1.6, textTransform: "uppercase", fontWeight: 600 }}>
                Anagrafica
              </div>
              {editing ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <AdmBtn kind="ghost" size="sm" onClick={() => {
                    setEditing(false);
                    setForm({
                      fullName: user.fullName ?? "",
                      phone: user.phone ?? "",
                      notes: user.notes ?? "",
                    });
                  }}>
                    Annulla
                  </AdmBtn>
                  <AdmBtn kind="primary" size="sm" icon={AdmIcons.check(13)}
                    onClick={() => {
                      run(() => updateUserProfile(user.id, {
                        fullName: form.fullName,
                        phone: form.phone,
                        notes: form.notes,
                      }));
                      setEditing(false);
                    }}>
                    Salva
                  </AdmBtn>
                </div>
              ) : (
                <AdmBtn kind="secondary" size="sm" icon={AdmIcons.edit(13)} onClick={() => setEditing(true)}>
                  Modifica
                </AdmBtn>
              )}
            </div>

            {editing ? (
              <div style={{ display: "grid", gap: 12 }}>
                <Field label="Nome completo">
                  <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Telefono">
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Note interne">
                  <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ ...inputStyle, fontFamily: ADM.sans, resize: "vertical" }} />
                </Field>
                <div style={{
                  fontFamily: ADM.sans, fontSize: 11, color: ADM.inkMuted,
                  marginTop: 2, lineHeight: 1.45,
                }}>
                  L&apos;anagrafica del ristorante (indirizzo, città, zona, P.IVA,
                  Starty BP ID, anno cliente) si gestisce dalla{" "}
                  <a href="/ristoranti" style={{ color: ADM.carmine, textDecoration: "underline" }}>sezione Ristoranti</a>.
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <Row k="Nome completo"  v={user.fullName ?? "—"} />
                <Row k="Email"          v={user.email} />
                <Row k="Telefono"       v={user.phone ?? "—"} />
                <Row k="Email confermata" v={user.emailConfirmedAt ? fmtItDate(user.emailConfirmedAt) : "Non confermata"} />
                <Row k="Ultimo accesso"   v={fmtItDateTime(user.lastSignInAt)} />
                {user.notes && <Row k="Note interne" v={user.notes} />}
              </div>
            )}
          </section>

          {/* Ristorante linkato */}
          <section style={{ background: ADM.panel, border: `1px solid ${ADM.line}`, borderRadius: 6, padding: 18 }}>
            <div style={{
              fontFamily: ADM.sans, fontSize: 10.5, color: ADM.inkSoft,
              letterSpacing: 1.6, textTransform: "uppercase", fontWeight: 600,
              marginBottom: 12,
            }}>
              Ristorante
            </div>
            {linkedRestaurant ? (
              <div style={{
                padding: "12px 14px", border: `1px solid ${ADM.line}`,
                borderRadius: 6, background: ADM.bg,
                display: "flex", gap: 12, alignItems: "center",
              }}>
                <AdmAvatar
                  initials={initials(linkedRestaurant.name)}
                  size={36}
                  tone="carmine"
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: ADM.serif, fontSize: 15, fontWeight: 600, color: ADM.ink,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{linkedRestaurant.name}</div>
                  {linkedRestaurant.city && (
                    <div style={{
                      fontFamily: ADM.sans, fontSize: 12, color: ADM.inkSoft, marginTop: 2,
                    }}>{linkedRestaurant.city}</div>
                  )}
                </div>
                <AdmBtn
                  kind="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Scollegare ${user.fullName ?? user.email} da ${linkedRestaurant.name}?`)) {
                      run(() => setUserRestaurant(user.id, null));
                    }
                  }}
                >
                  Scollega
                </AdmBtn>
              </div>
            ) : (
              <div style={{
                padding: "12px 14px", border: `1px dashed ${ADM.line}`,
                borderRadius: 6, fontFamily: ADM.serif, fontStyle: "italic",
                fontSize: 13, color: ADM.inkSoft, marginBottom: 10, textAlign: "center",
              }}>
                Utente non collegato ad alcun ristorante.
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <select
                value={user.restaurantId ?? ""}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === (user.restaurantId ?? "")) return;
                  run(() => setUserRestaurant(user.id, next || null));
                }}
                disabled={pending}
                style={{
                  flex: 1, minWidth: 180,
                  padding: "8px 10px", border: `1px solid ${ADM.line}`,
                  borderRadius: 6, background: ADM.white,
                  fontFamily: ADM.sans, fontSize: 13, color: ADM.ink,
                  cursor: "pointer", outline: "none",
                }}
              >
                <option value="">— Nessun ristorante —</option>
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}{r.city ? ` · ${r.city}` : ""}
                  </option>
                ))}
              </select>
              <a href="/ristoranti" style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                height: 34, padding: "0 14px",
                background: "transparent", color: ADM.ink,
                border: `1px solid ${ADM.line}`, borderRadius: 6,
                fontFamily: ADM.sans, fontWeight: 500, fontSize: 13,
                textDecoration: "none", whiteSpace: "nowrap",
              }}>
                {AdmIcons.ext(13)}
                <span>Apri ristoranti</span>
              </a>
            </div>
          </section>

          {/* Azioni */}
          <section style={{ background: ADM.panel, border: `1px solid ${ADM.line}`, borderRadius: 6, padding: 18 }}>
            <div style={{ fontFamily: ADM.sans, fontSize: 10.5, color: ADM.inkSoft, letterSpacing: 1.6, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>
              Sicurezza
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <AdmBtn kind="secondary" icon={AdmIcons.mail(14)}
                onClick={() => run(() => sendPasswordReset(user.email))}>
                Invia reset password
              </AdmBtn>
              {user.status !== "sospeso" && (
                <AdmBtn kind="secondary" icon={AdmIcons.shield(14)}
                  onClick={() => run(() => setUserStatus(user.id, "sospeso"))}>
                  Sospendi accesso
                </AdmBtn>
              )}
              {user.status === "sospeso" && (
                <AdmBtn kind="secondary" icon={AdmIcons.check(14)}
                  onClick={() => run(() => setUserStatus(user.id, "attivo"))}>
                  Riattiva
                </AdmBtn>
              )}
              <AdmBtn kind="danger" icon={AdmIcons.trash(14)}
                onClick={() => {
                  if (confirm(`Eliminare definitivamente ${user.email}? L'operazione non è reversibile.`)) {
                    run(() => deleteUser(user.id));
                    onClose();
                  }
                }}>
                Elimina account
              </AdmBtn>
            </div>
            {pending && (
              <div style={{ marginTop: 10, fontFamily: ADM.sans, fontSize: 12, color: ADM.inkSoft, fontStyle: "italic" }}>
                Operazione in corso…
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Modal invito ─────────────────────────────────────────────
function InviteModal({ restaurants, onClose }: { restaurants: RestaurantOption[]; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [role, setRole] = useState<"admin" | "user">("user");
  const [restaurantId, setRestaurantId] = useState("");
  const [email, setEmail] = useState("");
  const [autoEmail, setAutoEmail] = useState("");
  const [fullName, setFullName] = useState("");

  const selected = restaurants.find((r) => r.id === restaurantId) ?? null;

  const pickRestaurant = (id: string) => {
    setRestaurantId(id);
    const r = restaurants.find((x) => x.id === id) ?? null;
    const prefill = r?.email ?? "";
    // Precompila l'email dal ristorante, ma non sovrascrivere una modifica manuale.
    if (email === "" || email === autoEmail) {
      setEmail(prefill);
      setAutoEmail(prefill);
    }
  };

  const submit = () => {
    setFeedback(null);
    if (!email) { setFeedback({ kind: "err", text: "Inserisci l'email dell'account" }); return; }
    if (role === "user" && !restaurantId) { setFeedback({ kind: "err", text: "Seleziona un ristorante da collegare" }); return; }
    startTransition(async () => {
      const res = await inviteUser(email, {
        role,
        restaurantId: role === "user" ? restaurantId : null,
        restaurantName: selected?.name ?? null,
        fullName: role === "admin" ? (fullName || null) : null,
      });
      if (res.ok) {
        setFeedback({ kind: "ok", text: res.message ?? "Invito inviato" });
        setTimeout(onClose, 1000);
      } else {
        setFeedback({ kind: "err", text: res.error });
      }
    });
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(42,26,29,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 24,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 480, maxWidth: "100%", background: ADM.panel, borderRadius: 8,
        border: `1px solid ${ADM.line}`, boxShadow: "0 30px 60px rgba(42,26,29,0.28)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${ADM.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: ADM.sans, fontSize: 10.5, letterSpacing: 1.6, textTransform: "uppercase", color: ADM.inkSoft, fontWeight: 600 }}>Nuovo account</div>
            <h3 style={{ margin: "4px 0 0", fontFamily: ADM.serif, fontSize: 22, fontWeight: 500, color: ADM.ink, letterSpacing: -0.4 }}>Invita utente</h3>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: ADM.inkSoft, border: `1px solid ${ADM.line}`, borderRadius: 4, background: ADM.panel,
          }}>{AdmIcons.close(14)}</button>
        </div>
        <div style={{ padding: "20px 22px", display: "grid", gap: 12 }}>
          {feedback && (
            <div style={{
              padding: "10px 12px", borderRadius: 6,
              background: feedback.kind === "ok" ? ADM.greenWash : ADM.redWash,
              color: feedback.kind === "ok" ? ADM.green : ADM.red,
              fontFamily: ADM.sans, fontSize: 13,
              border: `1px solid ${feedback.kind === "ok" ? ADM.green : ADM.red}33`,
            }}>{feedback.text}</div>
          )}
          <Field label="Ruolo">
            <select value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "user")}
              style={inputStyle}>
              <option value="user">Utente (ristorante)</option>
              <option value="admin">Admin</option>
            </select>
          </Field>

          {role === "user" && (
            <>
              <Field label="Ristorante *">
                <select value={restaurantId}
                  onChange={(e) => pickRestaurant(e.target.value)}
                  style={inputStyle}>
                  <option value="">— Seleziona un ristorante —</option>
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}{r.city ? ` · ${r.city}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              {selected && (
                <div style={{
                  border: `1px solid ${ADM.line}`, borderRadius: 6, background: ADM.bg,
                  padding: "12px 14px", display: "grid", gap: 8,
                }}>
                  <Row k="Nome" v={selected.name} />
                  {selected.address && <Row k="Indirizzo" v={selected.address} />}
                  {(selected.city || selected.district) && (
                    <Row k="Città / zona" v={[selected.city, selected.district].filter(Boolean).join(" · ")} />
                  )}
                  {selected.vat && <Row k="P.IVA" v={selected.vat} />}
                  <div style={{ fontFamily: ADM.sans, fontSize: 11, color: ADM.inkMuted, marginTop: 2, lineHeight: 1.45 }}>
                    Nome, indirizzo, P.IVA, Starty BP ID e anno vengono presi dal ristorante e collegati in automatico.
                  </div>
                </div>
              )}
            </>
          )}

          <Field label="Email account *">
            <input type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@dominio.it" style={inputStyle} />
          </Field>
          {role === "user" && (
            <div style={{ fontFamily: ADM.sans, fontSize: 11, color: ADM.inkMuted, marginTop: -6, lineHeight: 1.45 }}>
              Precompilata dall&apos;email del ristorante, modificabile. Qui arriverà il link per impostare la password e installare l&apos;app.
            </div>
          )}

          {role === "admin" && (
            <Field label="Nome completo">
              <input value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={inputStyle} />
            </Field>
          )}
        </div>
        <div style={{ padding: "14px 22px", borderTop: `1px solid ${ADM.line}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <AdmBtn kind="ghost" onClick={onClose}>Annulla</AdmBtn>
          <AdmBtn kind="primary" icon={AdmIcons.mail(14)} onClick={submit}>
            {pending ? "Invio…" : "Invia invito"}
          </AdmBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers UI ───────────────────────────────────────────────
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, paddingBottom: 8, borderBottom: `1px solid ${ADM.lineSoft}` }}>
      <span style={{ fontFamily: ADM.sans, fontSize: 12.5, color: ADM.inkSoft }}>{k}</span>
      <span style={{ fontFamily: ADM.sans, fontSize: 13, color: ADM.ink, fontWeight: 500, textAlign: "right" }}>{v}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontFamily: ADM.sans, fontSize: 11, color: ADM.inkSoft, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px",
  border: `1px solid ${ADM.line}`, borderRadius: 4,
  fontFamily: ADM.sans, fontSize: 13, color: ADM.ink, background: ADM.bg,
  outline: "none",
};
