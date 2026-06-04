// Query lato server per la pagina Utenti.
// Combina auth.users (email, password hash, ultimi accessi) con public.profiles
// (nome, telefono, ruolo, stato, note).

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminUser, AccountRole, AccountStatus } from "./types";

export async function listUsers(): Promise<AdminUser[]> {
  const supabase = createAdminClient();

  const [authRes, profilesRes] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 200 }),
    supabase.from("profiles").select("*"),
  ]);

  if (authRes.error) throw authRes.error;
  if (profilesRes.error) throw profilesRes.error;

  const profileById = new Map(
    (profilesRes.data ?? []).map((p) => [p.id as string, p]),
  );

  const users: AdminUser[] = authRes.data.users.map((u) => {
    const p = profileById.get(u.id);
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    return {
      id: u.id,
      email: u.email ?? "—",
      fullName: (p?.full_name as string) ?? (meta.full_name as string) ?? null,
      phone: (p?.phone as string) ?? (meta.phone as string) ?? null,
      role: (p?.role as AccountRole) ?? "user",
      status: (p?.status as AccountStatus) ?? "attivo",
      notes: (p?.notes as string) ?? null,
      restaurantName: (p?.restaurant_name as string) ?? (meta.restaurant_name as string) ?? null,
      address:        (p?.address         as string) ?? (meta.address         as string) ?? null,
      vat:            (p?.vat             as string) ?? (meta.vat             as string) ?? null,
      startyBpId:     (p?.starty_bp_id    as number) ?? null,
      memberSinceYear:(p?.member_since_year as number) ?? null,
      city:           (p?.city               as string) ?? (meta.city     as string) ?? null,
      district:       (p?.district           as string) ?? (meta.district as string) ?? null,
      createdAt: u.created_at ?? "",
      emailConfirmedAt: u.email_confirmed_at ?? null,
      lastSignInAt: u.last_sign_in_at ?? null,
      restaurantId: (p?.restaurant_id as string) ?? null,
    };
  });

  // Ordine: invitati prima, poi sospesi, poi attivi (più recenti per createdAt).
  return users.sort((a, b) => {
    const order = { invitato: 0, sospeso: 1, attivo: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return b.createdAt.localeCompare(a.createdAt);
  });
}
