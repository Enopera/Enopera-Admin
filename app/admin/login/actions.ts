// app/admin/login/actions.ts
"use server";

import { redirect } from "next/navigation";
import { validateCredentials, createAdminSession } from "@/lib/admin/auth";

export type SignInState = { error?: string };

/// Username allowed chars: lowercase ASCII, digits, dot, dash, underscore.
/// Tipico: pierangelo.pancera, fausto.battaglia, admin-2, ecc.
const USERNAME_REGEX = /^[a-z0-9._-]+$/;

/// Server action: valida credenziali contro ADMIN_CREDENTIALS env var
/// e crea sessione iron-session su success. Niente Supabase.
export async function signInAdmin(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const rawNext = String(formData.get("next") ?? "");

  if (!username || !password) {
    return { error: "Username e password obbligatori" };
  }
  if (!USERNAME_REGEX.test(username)) {
    return { error: "Username contiene caratteri non validi" };
  }

  if (!validateCredentials(username, password)) {
    return { error: "Username o password non validi" };
  }

  await createAdminSession(username);

  // Sanitize next: solo path relativi, no protocol-relative URLs
  const safeNext =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/utenti";
  redirect(safeNext);
}
