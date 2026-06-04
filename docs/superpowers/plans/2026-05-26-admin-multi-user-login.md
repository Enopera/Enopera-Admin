# Admin Multi-User Login Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire l'HTTP Basic Auth attuale con login email/password Supabase, permettendo a più admin di lavorare contemporaneamente con sessioni distinte; lista email autorizzate via env var CSV `ADMIN_EMAILS`.

**Architecture:** Doppio gate su ogni request alle route admin: (1) sessione Supabase valida via cookie HTTP-only gestiti da `@supabase/ssr`, (2) email dell'utente presente in `ADMIN_EMAILS`. Provisioning manuale degli account via Supabase Dashboard. Cutover soft in due PR: PR1 deploya solo i nuovi file isolati (basic auth resta attivo), PR2 fa lo swap atomico (rimuove basic auth + wira layout + rimuove env var legacy).

**Tech Stack:** Next.js 15 App Router, React 19 (`useActionState`), `@supabase/ssr` (già in deps), TypeScript stretto. Niente test framework nel progetto: validazione via `pnpm typecheck`, `pnpm build`, e smoke test manuale.

**Spec di riferimento:** `docs/superpowers/specs/2026-05-26-admin-multi-user-login-design.md`

**Project root:** `D:\Dev\Progetti\Enopera-Admin\`

---

## File structure

**Nuovi:**
| Path | Responsabilità |
|---|---|
| `lib/admin/auth.ts` | Helper server-only: `getAdminEmails()`, `tryGetAdmin()`, `requireAdmin()`. Doppio gate auth+CSV. |
| `app/admin/login/actions.ts` | Server action `signInAdmin` - chiama `signInWithPassword`, valida CSV, redirect o ritorna error state. |
| `app/admin/login/login-form.tsx` | Client component form (`useActionState`) - campi email/password + errori + link reset. |
| `app/admin/login/page.tsx` | Server component pagina login - layout card centrata, parsing `?next` e `?error`. |
| `app/api/admin/logout/route.ts` | Route handler POST: `signOut()` + redirect login. |

**Modificati (solo nella PR2 - cutover atomico):**
| Path | Modifica |
|---|---|
| `middleware.ts` | Rimuovi basic auth. Aggiungi middleware `@supabase/ssr` che fa solo refresh cookie + setta `x-pathname` header per i RSC. |
| `app/(admin)/layout.tsx` | Aggiungi `await requireAdmin()` in cima. Passa `email` come prop al children/shell. |
| `components/admin/shell.tsx` | Sostituisci card "Enopera Admin / Sessione interna" con email loggata + bottone logout. |
| `app/page.tsx` | Usa `tryGetAdmin()` per redirect condizionale (`/utenti` se admin, `/admin/login` altrimenti). |

**Inalterati (no-op, già compatibili):**
| Path | Note |
|---|---|
| `lib/supabase/server.ts` | Già usa `@supabase/ssr` con `cookies()` di Next.js. Nessuna modifica. |
| `lib/users/*`, `app/(admin)/utenti/*`, `app/(admin)/ristoranti/*` | Non toccati: continuano a usare `createClient()` / `createServiceClient()` come prima. |

---

## Chunk 1: Pre-flight manuale (Step 1 della migration)

### Task 0: Setup pre-flight (manuale, no codice)

**Outcome:** Lista email + auth user pre-creati su Supabase + env var pronta su Vercel.

- [ ] **Step 0.1: Decidi le email degli admin iniziali**

Scrivile su carta/Bitwarden, es:
```
alice@enopera.it
bob@enopera.it
```

- [ ] **Step 0.2: Pre-crea gli auth user su Supabase Dashboard**

Per ciascuna email:
1. Apri https://supabase.com/dashboard/project/vguueimgbngnjgoockge/auth/users
2. Click "Add user" → "Create new user"
3. Email = quella decisa allo step 0.1, Password = password temporanea robusta (es. da Bitwarden generator)
4. Auto-confirm: ON (così l'utente non deve cliccare un link di conferma)
5. Click "Create user"
6. Verifica che la riga compaia in `auth.users` e che il trigger `handle_new_user` abbia creato la corrispondente riga in `public.profiles`

Annota le credenziali da consegnare ai diretti interessati via canale sicuro.

- [ ] **Step 0.3: (Opzionale, consigliato) marca i profili come admin**

Su Supabase SQL Editor:
```sql
UPDATE public.profiles
SET role = 'admin'
WHERE id IN (
  SELECT id FROM auth.users WHERE email IN ('alice@enopera.it', 'bob@enopera.it')
);
```
(Sostituisci con le tue email reali.)

Non è strettamente richiesto per il funzionamento - la sorgente di verità è il CSV - ma allinea il DB per futuri RLS.

- [ ] **Step 0.4: Setta `ADMIN_EMAILS` su Vercel (Preview + Production)**

1. Apri https://vercel.com/<your-team>/enopera-admin/settings/environment-variables
2. Add `ADMIN_EMAILS`, value `alice@enopera.it,bob@enopera.it` (no spazi, virgola separatore)
3. Scope: Production + Preview + Development (tutti)
4. Save

**NON** rimuovere ancora `ADMIN_USER` e `ADMIN_PASSWORD` - la rimozione è parte del cutover atomico (Chunk 3).

---

## Chunk 2: PR1 - nuovi file isolati (Step 2 della migration)

**Goal della PR1:** ship dei file `lib/admin/auth.ts`, `app/admin/login/*`, `app/api/admin/logout/*` senza toccare nulla di esistente. Basic auth resta attivo. Zero impatto utente.

### Task 1: Crea `lib/admin/auth.ts`

**Files:**
- Create: `lib/admin/auth.ts`

- [ ] **Step 1.1: Scrivi il modulo**

```ts
// lib/admin/auth.ts
//
// Admin authorization helpers. Layered on top of @supabase/ssr.
//
// Due gate per request alle route admin:
//   1. authentication: utente ha sessione Supabase valida (cookie HTTP-only)
//   2. authorization:  la sua email è in `ADMIN_EMAILS` (env var CSV)
//
// `requireAdmin()` è hard:  redirect a /admin/login se uno dei due fallisce.
// `tryGetAdmin()`  è soft:  ritorna null, utile in app/page.tsx.
//
// La lista admin viene riletta dall'env ad ogni chiamata: una variazione del
// CSV (richiede redeploy Vercel) ha effetto al primo page-load successivo.

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export interface AdminContext {
  email: string;
  userId: string;
}

/// Parse `ADMIN_EMAILS` (CSV) → lista normalizzata lowercase+trim.
/// Plain function: env var non cambia a runtime.
export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/// Variante soft: ritorna AdminContext se admin, null altrimenti.
export async function tryGetAdmin(): Promise<AdminContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const email = user.email.toLowerCase().trim();
  if (!getAdminEmails().includes(email)) return null;
  return { email, userId: user.id };
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
```

- [ ] **Step 1.2: Verifica typecheck**

```bash
cd D:\Dev\Progetti\Enopera-Admin
pnpm typecheck
```

Atteso: nessun errore.

---

### Task 2: Crea `app/admin/login/actions.ts`

**Files:**
- Create: `app/admin/login/actions.ts`

- [ ] **Step 2.1: Scrivi la server action**

```ts
// app/admin/login/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminEmails } from "@/lib/admin/auth";

export type SignInState = { error?: string };

/// Server action: valida credenziali + check email in CSV in un colpo.
/// Su success fa redirect server-side (next sanitizzato).
/// Su failure ritorna { error } da renderizzare nel form via useActionState.
export async function signInAdmin(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const rawNext = String(formData.get("next") ?? "");

  if (!email || !password) {
    return { error: "Email e password obbligatorie" };
  }

  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    // Generic - non leakare quali email esistono
    return { error: "Credenziali non valide" };
  }

  if (!getAdminEmails().includes(email)) {
    // Utente Supabase OK ma non autorizzato → disloggalo subito
    await supabase.auth.signOut();
    return { error: "Account non autorizzato all'admin" };
  }

  // Sanitize next: solo path relativi, no protocol-relative URLs
  const safeNext =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/utenti";
  redirect(safeNext);
}
```

- [ ] **Step 2.2: Typecheck**

```bash
pnpm typecheck
```

Atteso: nessun errore.

---

### Task 3: Crea `app/admin/login/login-form.tsx`

**Files:**
- Create: `app/admin/login/login-form.tsx`

- [ ] **Step 3.1: Scrivi il client component**

```tsx
// app/admin/login/login-form.tsx
"use client";

import { useActionState } from "react";
import { signInAdmin, type SignInState } from "./actions";
import { ADM } from "@/lib/admin/tokens";

export function LoginForm({
  next,
  initialError,
}: {
  next: string;
  initialError: string | null;
}) {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(
    signInAdmin,
    initialError ? { error: initialError } : {},
  );

  return (
    <form
      action={formAction}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        width: "100%",
      }}
    >
      <input type="hidden" name="next" value={next} />

      <label style={labelStyle}>
        <span style={labelTextStyle}>Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          style={inputStyle}
        />
      </label>

      <label style={labelStyle}>
        <span style={labelTextStyle}>Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          style={inputStyle}
        />
      </label>

      {state.error && (
        <p
          role="alert"
          style={{
            margin: 0,
            color: ADM.carmine,
            fontFamily: ADM.sans,
            fontSize: 13,
          }}
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        style={{
          marginTop: 4,
          padding: "10px 14px",
          background: ADM.carmine,
          color: "white",
          border: "none",
          borderRadius: 6,
          fontFamily: ADM.sans,
          fontSize: 14,
          fontWeight: 600,
          cursor: pending ? "wait" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "Accesso in corso…" : "Accedi"}
      </button>

      <a
        href="/auth/reset-password"
        style={{
          marginTop: 6,
          color: ADM.inkSoft,
          fontFamily: ADM.sans,
          fontSize: 12.5,
          textDecoration: "none",
          textAlign: "center",
        }}
      >
        Password dimenticata?
      </a>
    </form>
  );
}

const labelStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 6,
};

const labelTextStyle = {
  fontFamily: ADM.sans,
  fontSize: 12,
  fontWeight: 600,
  color: ADM.inkSoft,
  textTransform: "uppercase" as const,
  letterSpacing: 0.4,
};

const inputStyle = {
  padding: "10px 12px",
  border: `1px solid ${ADM.line}`,
  borderRadius: 6,
  fontFamily: ADM.sans,
  fontSize: 14,
  background: "white",
  color: ADM.ink,
};
```

- [ ] **Step 3.2: Typecheck**

```bash
pnpm typecheck
```

---

### Task 4: Crea `app/admin/login/page.tsx`

**Files:**
- Create: `app/admin/login/page.tsx`

- [ ] **Step 4.1: Scrivi la pagina server**

```tsx
// app/admin/login/page.tsx
import { LoginForm } from "./login-form";
import { ADM } from "@/lib/admin/tokens";
import { AdmWordmark } from "@/lib/admin/primitives";

interface PageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized:
    "La tua sessione è stata revocata. Effettua di nuovo il login.",
};

export default async function AdminLoginPage({ searchParams }: PageProps) {
  const { next, error } = await searchParams;

  // Sanitize next anche qui: cambia URL non valida in default visibile nel form
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/utenti";

  const initialError = error ? ERROR_MESSAGES[error] ?? null : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: ADM.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        fontFamily: ADM.sans,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: ADM.panel,
          border: `1px solid ${ADM.line}`,
          borderRadius: 10,
          padding: "32px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          <AdmWordmark size={22} />
        </div>

        <div style={{ textAlign: "center" }}>
          <h1
            style={{
              margin: 0,
              fontFamily: ADM.sans,
              fontSize: 18,
              fontWeight: 700,
              color: ADM.ink,
            }}
          >
            Accesso amministrazione
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              fontFamily: ADM.sans,
              fontSize: 12.5,
              color: ADM.inkSoft,
            }}
          >
            Riservato agli operatori autorizzati Enopera
          </p>
        </div>

        <LoginForm next={safeNext} initialError={initialError} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4.2: Typecheck**

```bash
pnpm typecheck
```

---

### Task 5: Crea `app/api/admin/logout/route.ts`

**Files:**
- Create: `app/api/admin/logout/route.ts`

- [ ] **Step 5.1: Scrivi il route handler**

```ts
// app/api/admin/logout/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/// POST /api/admin/logout - pulisce la sessione Supabase e redirige al login.
/// Chiamato dal bottone "Esci" nella topbar (form POST classico).
///
/// Usa `req.url` per costruire la URL assoluta richiesta da
/// NextResponse.redirect: request-relative, funziona in dev/preview/prod
/// senza dipendere da `NEXT_PUBLIC_SITE_URL` o `VERCEL_URL`.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/admin/login", req.url), 303);
}
```

- [ ] **Step 5.2: Typecheck**

```bash
pnpm typecheck
```

---

### Task 6: Build verification PR1

- [ ] **Step 6.1: Build completa**

```bash
pnpm build
```

Atteso: build SUCCESS, niente warning su nuovi file. Eventuali warning su file pre-esistenti sono fuori scope.

- [ ] **Step 6.2: Lint**

```bash
pnpm lint
```

Risolvi eventuali warning sui file nuovi (es. unused imports). Errori su file pre-esistenti: ignorali (fuori scope).

---

### Task 7: Commit + push PR1

- [ ] **Step 7.1: Commit**

```bash
cd D:\Dev\Progetti\Enopera-Admin
git add lib/admin/auth.ts app/admin/login/ app/api/admin/logout/
git status  # verifica che solo i file nuovi siano staged
git commit -m "$(cat <<'EOF'
feat(auth): add admin login flow (not wired yet)

PR1 del cutover soft: aggiunge i nuovi file isolati per il login admin
multi-utente senza toccare middleware.ts né layout esistenti. Basic auth
resta attivo, nessun impatto utente.

Files:
- lib/admin/auth.ts        helper getAdminEmails/requireAdmin/tryGetAdmin
- app/admin/login/         pagina login (server + client form)
- app/api/admin/logout/    route handler POST

Spec: docs/superpowers/specs/2026-05-26-admin-multi-user-login-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7.2: Push**

```bash
git push origin main
```

Vercel auto-deploya. Aspetta che il deploy verde compaia (~30s).

- [ ] **Step 7.3: Smoke test post-PR1 (manuale)**

1. Apri https://enopera-admin-26yb.vercel.app (URL Vercel)
2. Inserisci credenziali basic auth (ADMIN_USER / ADMIN_PASSWORD) per superare il middleware
3. Naviga su `/admin/login`
4. Verifica che il form sia renderizzato (logo + 2 input + bottone + link "Password dimenticata")
5. Compila con un'email NON in CSV + password sbagliata → click Accedi → messaggio "Credenziali non valide"
6. Compila con un'email pre-creata in `auth.users` (es. alice@) + password corretta → in teoria sarebbe redirect a /utenti, ma il `(admin)/layout.tsx` non ha ancora `requireAdmin()` → la pagina /utenti carica normalmente come prima. Importante: il cookie Supabase è stato settato → controllare in DevTools → Application → Cookies → c'è un cookie `sb-...-auth-token`
7. Compila con email NON in CSV ma valida in `auth.users` (creane una temporanea via Dashboard se serve) → messaggio "Account non autorizzato all'admin"
8. POST manuale a `/api/admin/logout` (es. via DevTools Console: `fetch('/api/admin/logout', {method:'POST'})`) → verifica che il cookie sb-auth scompaia

Se uno degli step fallisce: NON procedere al Chunk 3. Aprire issue, risolvere, ripetere lo smoke test.

---

## Chunk 3: PR2 - cutover atomico (Step 3 della migration)

**Goal della PR2:** rimuovi basic auth, wira `requireAdmin()` in layout, rimuovi env legacy. Da questo punto in poi tutti gli accessi richiedono login Supabase.

### Task 8: Sostituisci `middleware.ts`

**Files:**
- Modify: `middleware.ts` (sostituzione completa)

- [ ] **Step 8.1: Sostituisci il file**

```ts
// middleware.ts
//
// Refresh del cookie sessione Supabase a ogni request + propagazione del
// pathname corrente come header `x-pathname` sulla REQUEST (usato da
// `requireAdmin()` via headers() per costruire il redirect link
// `?next=<current>`).
//
// IMPORTANTE: x-pathname va settato sulle request headers PRIMA di chiamare
// NextResponse.next({ request: { headers } }), non sulle response headers.
// Solo così headers() lato RSC lo vede. Se lo si setta su res.headers, è
// visibile solo al client ma non ai server component.
//
// L'autorizzazione vera (cookie valido + email in CSV `ADMIN_EMAILS`) è
// applicata nei server component sotto `app/(admin)/*` via `requireAdmin()`.
// Il middleware NON blocca nessuna route: rinfresca solo i cookie e propaga
// l'header. La pagina `/admin/login` passa anche lei attraverso il middleware
// (non esclusa dal matcher) - il refresh cookie è idempotente e non ha effetti
// indesiderati sulle route pubbliche.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  // 1. Clona le request headers e aggiungi x-pathname per i RSC
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);

  // 2. Crea la response passando le request headers modificate
  const res = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // 3. Crea client Supabase che legge cookie da request e scrive su response
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 4. Trigger refresh del token se necessario (side-effect su cookies)
  await supabase.auth.getUser();

  return res;
}

// Match tutte le route eccetto:
//   - /api               (route handler hanno la loro logica auth)
//   - /auth              (pagine pubbliche: reset password cross-device per Flutter)
//   - _next/static, _next/image (asset)
//   - favicon, robots, sitemap
// `/admin/login` NON è escluso volutamente: il middleware fa solo refresh,
// non gate, quindi passa innocuamente.
export const config = {
  matcher: ["/((?!api|auth|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
```

- [ ] **Step 8.2: Typecheck**

```bash
pnpm typecheck
```

---

### Task 9: Wire `requireAdmin()` in `app/(admin)/layout.tsx`

**Files:**
- Modify: `app/(admin)/layout.tsx` (sostituzione completa, file piccolo)

- [ ] **Step 9.1: Sostituisci il file**

```tsx
// app/(admin)/layout.tsx
import { ADM } from "@/lib/admin/tokens";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminContextProvider } from "@/lib/admin/admin-context";

/// Outer wrapper. La struttura interna (sidebar + topstrip + content
/// + bottom-nav mobile) è gestita da AdmShell nelle singole pagine.
///
/// `requireAdmin()` è il gate: se l'utente non è autenticato Supabase
/// o la sua email non è in ADMIN_EMAILS, redirige a /admin/login.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div style={{
      minHeight: "100vh",
      background: ADM.bg,
      fontFamily: ADM.sans,
      color: ADM.ink,
    }}>
      <AdminContextProvider email={admin.email}>{children}</AdminContextProvider>
    </div>
  );
}
```

- [ ] **Step 9.2: Crea il context provider per propagare l'email ai client component**

**Files:**
- Create: `lib/admin/admin-context.tsx`

```tsx
// lib/admin/admin-context.tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";

const AdminContext = createContext<{ email: string } | null>(null);

export function AdminContextProvider({
  email,
  children,
}: {
  email: string;
  children: ReactNode;
}) {
  return (
    <AdminContext.Provider value={{ email }}>{children}</AdminContext.Provider>
  );
}

/// Hook per i client component che vogliono mostrare email loggata.
/// Fallisce loud se chiamato fuori dal layout admin (errore di programmazione).
export function useAdminContext(): { email: string } {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error("useAdminContext must be used inside AdminContextProvider");
  }
  return ctx;
}
```

- [ ] **Step 9.3: Typecheck**

```bash
pnpm typecheck
```

---

### Task 10: Aggiorna `components/admin/shell.tsx` con email + logout

**Files:**
- Modify: `components/admin/shell.tsx` (linee 89-103 - sostituisci la card "Enopera Admin / Sessione interna")

- [ ] **Step 10.1: Import il context**

In cima al file (subito dopo gli import esistenti) aggiungi:

```tsx
import { useAdminContext } from "@/lib/admin/admin-context";
```

- [ ] **Step 10.2: Sostituisci la card a fondo sidebar**

Trova il blocco (righe ~89-103):

```tsx
      <div style={{ flex: 1 }} />
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 10px", borderRadius: 8, background: ADM.panelAlt,
        border: `1px solid ${ADM.line}`,
      }}>
        <AdmAvatar initials="EA" size={30} tone="ink" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontFamily: ADM.sans, fontSize: 12.5, fontWeight: 600, color: ADM.ink,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>Enopera Admin</div>
          <div style={{ fontFamily: ADM.sans, fontSize: 11, color: ADM.inkSoft }}>Sessione interna</div>
        </div>
      </div>
```

Sostituisci con:

```tsx
      <div style={{ flex: 1 }} />
      <AdmUserCard />
```

E aggiungi questa funzione **prima** di `AdmTopstrip` (così resta nello stesso file):

```tsx
function AdmUserCard() {
  const { email } = useAdminContext();
  // Initials: prendi prima e seconda lettera dell'email (prima del @)
  const local = email.split("@")[0] ?? email;
  const initials = (local.slice(0, 2) || "??").toUpperCase();

  return (
    <form
      action="/api/admin/logout"
      method="POST"
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 10px", borderRadius: 8, background: ADM.panelAlt,
        border: `1px solid ${ADM.line}`,
      }}
    >
      <AdmAvatar initials={initials} size={30} tone="ink" />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontFamily: ADM.sans, fontSize: 12.5, fontWeight: 600, color: ADM.ink,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }} title={email}>{email}</div>
        <div style={{ fontFamily: ADM.sans, fontSize: 11, color: ADM.inkSoft }}>Sessione amministratore</div>
      </div>
      <button
        type="submit"
        title="Esci"
        aria-label="Esci"
        style={{
          padding: "6px 8px",
          background: "transparent",
          border: `1px solid ${ADM.line}`,
          borderRadius: 6,
          color: ADM.inkSoft,
          fontFamily: ADM.sans,
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Esci
      </button>
    </form>
  );
}
```

- [ ] **Step 10.3: Typecheck**

```bash
pnpm typecheck
```

---

### Task 11: Aggiorna `app/page.tsx` con redirect condizionale

**Files:**
- Modify: `app/page.tsx` (sostituzione completa)

- [ ] **Step 11.1: Sostituisci il file**

```tsx
// app/page.tsx
import { redirect } from "next/navigation";
import { tryGetAdmin } from "@/lib/admin/auth";

export default async function Home() {
  const admin = await tryGetAdmin();
  if (admin) {
    redirect("/utenti");
  }
  redirect("/admin/login");
}
```

Nota: il default `/utenti` è quello scelto nello spec; se preferisci `/ordini` (default storico precedente) cambia entrambi gli usi (qui + in `actions.ts`).

- [ ] **Step 11.2: Typecheck**

```bash
pnpm typecheck
```

---

### Task 12: Build + lint finale

- [ ] **Step 12.1: Build**

```bash
pnpm build
```

Atteso: SUCCESS, nessun warning sui file modificati.

- [ ] **Step 12.2: Lint**

```bash
pnpm lint
```

Risolvi warning sui file modificati.

---

### Task 13: Commit PR2 (NON pushare ancora)

- [ ] **Step 13.1: Commit (con basic auth env ancora attive)**

```bash
git add middleware.ts "app/(admin)/layout.tsx" app/page.tsx components/admin/shell.tsx lib/admin/admin-context.tsx
git status  # verifica
git commit -m "$(cat <<'EOF'
feat(auth): cutover atomico al login multi-utente Supabase

PR2 del cutover soft: rimuove il basic auth middleware e wira il nuovo
flow Supabase Auth introdotto nella PR1.

- middleware.ts: ora fa solo refresh cookie + propaga x-pathname header
- app/(admin)/layout.tsx: aggiunge `requireAdmin()` come gate
- components/admin/shell.tsx: topbar mostra email loggata + bottone Esci
- app/page.tsx: redirect condizionale via `tryGetAdmin()`
- lib/admin/admin-context.tsx: NUOVO - propaga email ai client component

BREAKING: dopo il deploy va rimosso ADMIN_USER/ADMIN_PASSWORD da Vercel
(vedi task 14 del plan).

Spec: docs/superpowers/specs/2026-05-26-admin-multi-user-login-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

⚠️ **NON pushare ancora.** Prima rimuovi le env legacy (step successivo).

---

### Task 14: Rimuovi env legacy su Vercel (manuale)

- [ ] **Step 14.1: Rimuovi ADMIN_USER**

1. https://vercel.com/<team>/enopera-admin/settings/environment-variables
2. Trova `ADMIN_USER` → click "Edit" → "Remove"

- [ ] **Step 14.2: Rimuovi ADMIN_PASSWORD**

Stessa procedura per `ADMIN_PASSWORD`.

- [ ] **Step 14.3: (Sanity check) Conferma `ADMIN_EMAILS` esiste ancora**

Deve essere presente con il valore settato nello step 0.4.

---

### Task 15: Push PR2 + verifica deploy

- [ ] **Step 15.1: Push**

```bash
git push origin main
```

Vercel auto-deploya. Aspetta verde (~30s-1min).

- [ ] **Step 15.2: Smoke test post-cutover (manuale, CHECKLIST COMPLETA)**

Apri il sito in finestra incognito per essere sicuro che il cookie basic auth cached non interferisca.

1. ☐ Apri https://enopera-admin-26yb.vercel.app - atteso: redirect a `/admin/login`
2. ☐ Apri direttamente `/utenti` - atteso: redirect a `/admin/login?next=%2Futenti`
3. ☐ Form login con credenziali completamente sbagliate → atteso: "Credenziali non valide" inline
4. ☐ Login con email valida Supabase ma NON in CSV → atteso: "Account non autorizzato all'admin"
5. ☐ Login con admin reale (es. alice@) → atteso: redirect a `/utenti` (o al `next` originale), sidebar mostra "alice@enopera.it" + bottone Esci
6. ☐ Click Esci → atteso: cookie pulito + redirect a `/admin/login`
7. ☐ Reset password: link "Password dimenticata?" → atteso: pagina `/auth/reset-password` carica (riusa flow esistente)
8. ☐ Multi-utente concurrent: apri secondo browser/profilo, logga con bob@ → atteso: bob@ vede la sua email in sidebar, alice@ continua a lavorare nel suo browser senza interferenze
9. ☐ Revoca on-the-fly: con un admin loggato, rimuovi quella email da `ADMIN_EMAILS` su Vercel → **trigger esplicito redeploy** (Vercel non ridepoya automaticamente al cambio env var: dal dashboard del progetto → Deployments → click sui ⋮ dell'ultimo deploy → "Redeploy", oppure pusha un empty commit `git commit --allow-empty -m "trigger redeploy" && git push`) → al successivo click di quell'admin atteso: redirect a `/admin/login` (sessione ancora valida lato Supabase ma fuori CSV)
10. ☐ Open-redirect: prova URL `/admin/login?next=https://evil.example.com` → atteso: dopo login redirect a `/utenti` (next ignorato perché non inizia con `/` o inizia con `//`)
11. ☐ Open-redirect protocol-relative: `/admin/login?next=//evil.example.com` → atteso: redirect a `/utenti`

Se uno qualsiasi degli step 1-11 fallisce, vedere il **Rollback** sotto.

- [ ] **Step 15.3: Ripristina ADMIN_EMAILS se modificato durante lo step 15.2 punto 9**

Reinseriscilo allo stato pre-test (per non lasciare un admin reale fuori).

---

### Rollback (in caso lo step 15.2 fallisca)

1. Su Vercel, ri-aggiungi `ADMIN_USER` e `ADMIN_PASSWORD` (devono essere ancora annotate da te)
2. Sulla repo: `git revert <hash-del-commit-PR2>` → push → deploy
3. ~5 minuti totali. Il deploy di rollback ripristina lo stato post-PR1 (basic auth attivo, nuovo flow presente ma non wirato)

---

## Cleanup post-merge (opzionale)

- [ ] Cancellare la sezione "Auth Supabase 'vera' per l'admin" da `CLAUDE.md` (è ora completa)
- [ ] Aggiungere voce a `CLAUDE.md` documentando il nuovo flow: env var `ADMIN_EMAILS`, procedura "aggiungere un admin" (3 step: Dashboard add user → email in CSV → redeploy)

---

## Tasks summary

| # | Task | Phase | Effort |
|---|---|---|---|
| 0 | Pre-flight manuale (DB + env) | Pre-PR | 10 min |
| 1 | `lib/admin/auth.ts` | PR1 | 5 min |
| 2 | `app/admin/login/actions.ts` | PR1 | 5 min |
| 3 | `app/admin/login/login-form.tsx` | PR1 | 10 min |
| 4 | `app/admin/login/page.tsx` | PR1 | 5 min |
| 5 | `app/api/admin/logout/route.ts` | PR1 | 3 min |
| 6 | Build verification PR1 | PR1 | 3 min |
| 7 | Commit + push PR1 + smoke | PR1 | 10 min |
| 8 | `middleware.ts` | PR2 | 5 min |
| 9 | `app/(admin)/layout.tsx` + admin-context | PR2 | 5 min |
| 10 | `components/admin/shell.tsx` | PR2 | 10 min |
| 11 | `app/page.tsx` | PR2 | 2 min |
| 12 | Build + lint PR2 | PR2 | 3 min |
| 13 | Commit PR2 | PR2 | 2 min |
| 14 | Rimuovi env legacy su Vercel | PR2 | 2 min |
| 15 | Push + smoke checklist completa | PR2 | 15 min |

**Totale stimato:** ~1h 35min (esclusi tempi di deploy Vercel)
