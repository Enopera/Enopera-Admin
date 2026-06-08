"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInviteEmail } from "@/lib/email/send-invite";
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
// Nuovo flusso: si collega l'account a un Ristorante esistente (che porta
// nome/indirizzo/P.IVA/starty_bp_id/ecc. via trigger), e si invia un'email
// custom (Resend) con link imposta-password + link al test dell'app.
export async function inviteUser(
  email: string,
  data: {
    role?: AccountRole;
    restaurantId?: string | null;
    restaurantName?: string | null;
    fullName?: string | null;
  },
): Promise<ActionResult> {
  if (!email) return { ok: false, error: "Email mancante" };

  const supabase = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const role = data.role ?? "user";

  if (role === "user" && !data.restaurantId) {
    return { ok: false, error: "Seleziona un ristorante da collegare all'utente" };
  }

  // 1. Crea l'utente e ottieni il link "imposta password" SENZA inviare
  //    l'email di default di Supabase (generateLink non manda email).
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: {
        full_name: data.fullName ?? data.restaurantName ?? null,
        role,
        status: "invitato",
      },
      redirectTo: `${siteUrl}/auth/set-password`,
    },
  });
  if (linkErr) return { ok: false, error: linkErr.message };

  const userId = linkData.user?.id;
  const actionLink = linkData.properties?.action_link;
  if (!userId || !actionLink) {
    return { ok: false, error: "Utente creato ma link di invito non disponibile" };
  }

  // 2. Collega il ristorante: il trigger profiles_sync_on_restaurant_link
  //    copia l'anagrafica (nome, indirizzo, P.IVA, starty_bp_id, citta...) nel profilo.
  if (role === "user" && data.restaurantId) {
    const { error: linkRestErr } = await supabase
      .from("profiles")
      .update({ restaurant_id: data.restaurantId })
      .eq("id", userId);
    if (linkRestErr) {
      return { ok: false, error: `Utente creato ma collegamento ristorante fallito: ${linkRestErr.message}` };
    }
  }

  // 3. Email custom via Resend: dettagli account + link imposta-password + link testing.
  const mail = await sendInviteEmail({
    to: email,
    restaurantName: data.restaurantName ?? null,
    actionLink,
  });

  revalidatePath(USERS_PATH);

  if (!mail.ok) {
    return {
      ok: false,
      error: `Utente creato ma invio email fallito: ${mail.error}. Puoi reinviare l'accesso con "Invia reset password" dal dettaglio utente.`,
    };
  }

  return { ok: true, message: `Invito inviato a ${email}` };
}
