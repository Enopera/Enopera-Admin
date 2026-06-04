"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AccountRole, AccountStatus } from "./types";

const USERS_PATH = "/utenti";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

// ─── Reset password: invia un'email con link di recupero ─────
export async function sendPasswordReset(email: string): Promise<ActionResult> {
  if (!email) return { ok: false, error: "Email mancante" };

  const supabase = createAdminClient();
  const redirectTo = process.env.NEXT_PUBLIC_PASSWORD_RESET_REDIRECT
    ?? `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/reset-password`;

  const { error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true, message: `Email di reset inviata a ${email}` };
}

// ─── Cambia stato account (attivo / sospeso / invitato) ──────
export async function setUserStatus(userId: string, status: AccountStatus): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("profiles")
    .update({ status })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };

  // Per "sospeso" disabilitiamo anche il login bannando l'utente in auth
  if (status === "sospeso") {
    await supabase.auth.admin.updateUserById(userId, { ban_duration: "876000h" }); // ~100 anni
  } else {
    await supabase.auth.admin.updateUserById(userId, { ban_duration: "none" });
  }

  revalidatePath(USERS_PATH);
  return { ok: true, message: `Stato aggiornato a ${status}` };
}

// ─── Cambia ruolo ─────────────────────────────────────────────
export async function setUserRole(userId: string, role: AccountRole): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(USERS_PATH);
  return { ok: true, message: `Ruolo aggiornato a ${role}` };
}

// ─── Aggiorna anagrafica ──────────────────────────────────────
export async function updateUserProfile(
  userId: string,
  data: {
    fullName?: string;
    phone?: string;
    notes?: string;
    restaurantName?: string;
    address?: string;
    vat?: string;
    startyBpId?: number | null;
    memberSinceYear?: number | null;
    city?: string;
    district?: string;
  },
): Promise<ActionResult> {
  const supabase = createAdminClient();
  const update: Record<string, unknown> = {};
  if (data.fullName        !== undefined) update.full_name         = data.fullName       || null;
  if (data.phone           !== undefined) update.phone             = data.phone          || null;
  if (data.notes           !== undefined) update.notes             = data.notes          || null;
  if (data.restaurantName  !== undefined) update.restaurant_name   = data.restaurantName || null;
  if (data.address         !== undefined) update.address           = data.address        || null;
  if (data.vat             !== undefined) update.vat               = data.vat            || null;
  if (data.startyBpId      !== undefined) update.starty_bp_id      = data.startyBpId      ?? null;
  if (data.memberSinceYear !== undefined) update.member_since_year = data.memberSinceYear ?? null;
  if (data.city            !== undefined) update.city              = data.city            || null;
  if (data.district        !== undefined) update.district          = data.district        || null;

  const { error } = await supabase.from("profiles").update(update).eq("id", userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(USERS_PATH);
  return { ok: true, message: "Profilo aggiornato" };
}

// ─── Elimina utente (auth + profile via cascade) ─────────────
export async function deleteUser(userId: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(USERS_PATH);
  return { ok: true, message: "Utente eliminato" };
}

// ─── Crea/invita nuovo utente ─────────────────────────────────
export async function inviteUser(
  email: string,
  data: {
    fullName?: string;
    phone?: string;
    role?: AccountRole;
    restaurantName?: string;
    address?: string;
    vat?: string;
    startyBpId?: number | null;
    memberSinceYear?: number | null;
    city?: string;
    district?: string;
  },
): Promise<ActionResult> {
  if (!email) return { ok: false, error: "Email mancante" };

  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: data.fullName ?? null,
      phone: data.phone ?? null,
      role: data.role ?? "user",
      status: "invitato",
      restaurant_name: data.restaurantName ?? null,
      address: data.address ?? null,
      vat: data.vat ?? null,
      starty_bp_id: data.startyBpId ?? null,
      member_since_year: data.memberSinceYear ?? null,
      city: data.city ?? null,
      district: data.district ?? null,
    },
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(USERS_PATH);
  return { ok: true, message: `Invito inviato a ${email}` };
}
