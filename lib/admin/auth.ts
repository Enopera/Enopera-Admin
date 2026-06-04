// lib/admin/auth.ts
//
// Admin authorization 100% custom — niente Supabase Auth.
// Le credenziali admin vivono in `ADMIN_CREDENTIALS` (env var CSV
// "username:password,user:pass,..."). La sessione admin è un cookie firmato
// (iron-session) con dentro lo username dell'utente loggato.
//
// PERCHÉ NIENTE SUPABASE:
// L'admin gestisce dati Supabase ma non DOVREBBE essere un utente Supabase.
// Disaccoppiare permette di cambiare backend dati in futuro senza toccare
// l'auth, e separa concettualmente "admin interno Enopera" da "cliente B2B
// dell'app Flutter". Il service-role key continua a essere usato dai server
// component per leggere/scrivere dati Supabase a nome dell'app.
//
// LIMITAZIONI:
// - No self-service password recovery (cambia password = edit env var su Vercel + redeploy)
// - Scala male oltre ~10 admin (CSV diventa lungo)
// - Audit: non c'è log automatico di chi è loggato — eventualmente console.log
//
// Due gate per request alle route admin:
//   1. authentication: cookie iron-session presente e firmato correttamente
//   2. authorization:  lo username del cookie è ancora in ADMIN_CREDENTIALS
//      (così rimuovendo dall'env si revoca anche le sessioni esistenti)
//
// `requireAdmin()` è hard:  redirect a /admin/login se uno dei due fallisce.
// `tryGetAdmin()`  è soft:  ritorna null, utile in app/page.tsx.

import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";

export interface AdminContext {
  username: string;
}

interface AdminSessionData {
  username?: string;
  loggedInAt?: number;
}

const SESSION_COOKIE_NAME = "enopera-admin-session";

function getSessionOptions(): SessionOptions {
  const password = process.env.ADMIN_SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error(
      "ADMIN_SESSION_SECRET deve essere settato a una stringa di almeno 32 caratteri. " +
      "Genera con: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return {
    password,
    cookieName: SESSION_COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 1 settimana
      path: "/",
    },
  };
}

/// Parse `ADMIN_CREDENTIALS` (CSV `user:password,user:pass,...`) → Map.
/// Username normalizzato lowercase+trim. Password preservata as-is.
/// Una password può contenere `:` solo se non è il primo carattere del valore
/// (il primo `:` separa username da password — il resto è considerato password).
export function getAdminCredentials(): Map<string, string> {
  const raw = process.env.ADMIN_CREDENTIALS ?? "";
  const map = new Map<string, string>();
  for (const pair of raw.split(",")) {
    const trimmed = pair.trim();
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx <= 0) continue; // no separator o username vuoto
    const username = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const password = trimmed.slice(colonIdx + 1);
    if (!username || !password) continue;
    map.set(username, password);
  }
  return map;
}

export function isAuthorizedUsername(username: string): boolean {
  return getAdminCredentials().has(username);
}

/// Confronto in tempo costante per ridurre il rischio di timing attack.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function validateCredentials(username: string, password: string): boolean {
  const stored = getAdminCredentials().get(username);
  if (!stored) return false;
  return constantTimeEqual(stored, password);
}

/// Crea sessione admin. Chiamato da signInAdmin server action dopo che le
/// credenziali sono state validate.
export async function createAdminSession(username: string): Promise<void> {
  const cookieStore = await cookies();
  const session = await getIronSession<AdminSessionData>(cookieStore, getSessionOptions());
  session.username = username;
  session.loggedInAt = Date.now();
  await session.save();
}

/// Distrugge la sessione admin. Chiamato da /api/admin/logout.
export async function destroyAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const session = await getIronSession<AdminSessionData>(cookieStore, getSessionOptions());
  session.destroy();
}

/// Variante soft: ritorna AdminContext se sessione valida + username ancora
/// in ADMIN_CREDENTIALS, null altrimenti.
export async function tryGetAdmin(): Promise<AdminContext | null> {
  const cookieStore = await cookies();
  const session = await getIronSession<AdminSessionData>(cookieStore, getSessionOptions());
  if (!session.username) return null;
  // Revoca on-the-fly: se l'username è stato rimosso da ADMIN_CREDENTIALS
  // (es. dimesso un admin), il cookie ancora valido perde efficacia subito.
  if (!isAuthorizedUsername(session.username)) return null;
  return { username: session.username };
}

/// Variante hard: redirect a `/admin/login?next=<current>` se non admin.
/// Il path corrente viene letto dall'header `x-pathname` settato dal middleware.
export async function requireAdmin(): Promise<AdminContext> {
  const admin = await tryGetAdmin();
  if (admin) return admin;
  const h = await headers();
  const path = h.get("x-pathname") ?? "/utenti";
  redirect(`/admin/login?next=${encodeURIComponent(path)}`);
}
