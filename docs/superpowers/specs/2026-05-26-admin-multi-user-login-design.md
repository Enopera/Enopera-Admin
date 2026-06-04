# Admin multi-user login - Design

**Status**: Draft, awaiting review
**Date**: 2026-05-26
**Author**: brainstormed con utente, scritto da Claude
**Project**: Enopera-Admin (Next.js 15 + Supabase)

## Problem statement

Oggi il pannello admin Enopera-Admin è protetto da HTTP Basic Auth con un unico account globale (env `ADMIN_USER` / `ADMIN_PASSWORD` su Vercel). Questo blocca due esigenze concrete:

1. **Più operatori in contemporanea** non possono usare l'admin con identità distinte - c'è un solo account condiviso, niente sessione persistente, niente tracciabilità di chi è "loggato".
2. **Audit/sicurezza**: la rotazione della password globale è disruptiva (richiede di comunicarla a tutti), e non c'è modo di revocare l'accesso a un singolo operatore senza cambiarla a tutti.

L'obiettivo è sostituire il basic auth con un sistema di login email/password basato su Supabase Auth, mantenendo la lista degli admin autorizzati gestita semplicemente via env var (poche persone, raramente cambia), e permettendo a più admin di lavorare in parallelo con cookie di sessione indipendenti.

## Goals

- Login email/password per ogni admin con sessione persistente lato cookie (HTTP-only)
- Più admin loggati contemporaneamente, sessioni indipendenti
- Lista degli admin autorizzati in env var CSV `ADMIN_EMAILS` su Vercel
- Provisioning manuale: nuovo admin = aggiungere email a CSV + creare auth user su Supabase Dashboard
- Reset password riutilizzando il flow `/auth/reset-password` esistente (creato per la Flutter app)
- Migrazione senza downtime dal basic auth attuale
- Revoca immediata di un admin: rimuovere dal CSV → al prossimo page load l'utente viene rediretto al login

## Non-goals (v1)

- Pagina UI "Team" per gestire la lista admin dall'interfaccia (basta CSV)
- Audit log delle azioni admin (chi ha modificato cosa quando)
- 2FA, OAuth Google, magic link
- Permessi granulari (lettura/scrittura, ruoli multipli) - tutti gli admin in CSV hanno gli stessi diritti
- Notifiche di sicurezza ("nuovo login da IP sconosciuto")
- Sospensione temporanea con conservazione dello stato (oggi: rimuovi da CSV → effetto immediato)

## Architecture overview

### Auth provider

Supabase Auth con login email/password. Già configurato sul progetto `vguueimgbngnjgoockge`.

### Authorization model

Doppio gate:

1. **Autenticazione**: l'utente ha sessione Supabase valida (cookie)
2. **Autorizzazione admin**: la sua email è presente nella env var `ADMIN_EMAILS` (CSV)

Esempio env var:
```
ADMIN_EMAILS=alice@enopera.it,bob@enopera.it
```

Parsing: split per virgola, `.toLowerCase().trim()` su ogni voce, scartando i vuoti. Stesso trattamento sull'email dell'utente prima del compare.

Un utente che passa solo (1) ma non (2) viene immediatamente disloggato con messaggio "Non autorizzato".

### Account provisioning

Nessun codice di provisioning. Quando vuoi aggiungere un admin:

1. Supabase Dashboard → Authentication → Add user → crei l'account con email + password iniziale
2. Comunichi le credenziali via canale sicuro (es. Bitwarden)
3. Aggiungi l'email a `ADMIN_EMAILS` su Vercel
4. Redeploy (≈30s) - la nuova email è autorizzata

Per disabilitare un admin:

- Rimuovi dal CSV → effetto immediato al prossimo page load
- Opzionalmente disabilita l'utente in Supabase Dashboard

### Session model

- Cookie HTTP-only via `@supabase/ssr` (già in dipendenze)
- Default Supabase: access token 1h, refresh 1 settimana
- Refresh automatico a ogni request via middleware `@supabase/ssr`
- Multi-utente concurrent: ogni browser/admin ha il suo cookie indipendente

### Schema DB

Nessuna nuova tabella. La tabella `profiles` esiste già con `role` enum `admin`/`user` - la usiamo opzionalmente per coerenza (UPDATE `role='admin'` dopo aver creato l'auth user dal dashboard), ma il gating effettivo resta CSV.

## Components

### Nuovi file

| File | Tipo | Scopo |
|---|---|---|
| `app/admin/login/page.tsx` | RSC + client island | Form login email+password. Link "Password dimenticata". |
| `app/admin/login/actions.ts` | Server action | `signInAdmin(formData)`: signInWithPassword → valida email in CSV → redirect o errore. |
| `app/api/admin/logout/route.ts` | Route handler POST | `signOut()` + redirect `/admin/login`. |
| `lib/admin/auth.ts` | Server-only module | `getAdminEmails(): string[]` (parse CSV, lowercased+trimmed, può essere semplice function - le env var non cambiano a runtime). `requireAdmin(): Promise<{ email, userId }>` (legge user dal cookie via `@supabase/ssr`, valida email in CSV, redirect a `/admin/login?next=<current>` se fallisce). `tryGetAdmin(): Promise<{ email, userId } | null>` (variante "soft" senza redirect, per `app/page.tsx`). |

### File modificati

| File | Modifica |
|---|---|
| `middleware.ts` | Rimosso basic auth. Sostituito con middleware `@supabase/ssr` che fa solo refresh cookie. Matcher invariato (esclude `/api`, `/auth`, `_next`, asset). |
| `app/(admin)/layout.tsx` | Aggiunto `await requireAdmin()` in cima al server component. Passa email al children/topbar. |
| `components/admin/shell.tsx` | Topbar mostra email loggata + bottone "Esci" (POST `/api/admin/logout`). |
| `app/page.tsx` | Redirect condizionale: sessione admin valida → `/utenti`; altrimenti → `/admin/login`. |
| `lib/supabase/server.ts` | Da ispezionare durante l'implementazione: se già crea un client cookie-based via `@supabase/ssr` con `cookies()` di Next.js, no-op. Altrimenti, refactor minimo per supportare lettura/scrittura cookies di sessione (necessario perché `signInAdmin` e `requireAdmin` devono poter leggere/scrivere il cookie auth). |

### Routes pubbliche (no auth)

`/admin/login`, `/auth/reset-password`, `/auth/*`. Tutto il resto richiede `requireAdmin()`.

## Flow di login

### Login normale

1. Utente apre URL admin (es. `/utenti`)
2. `(admin)/layout.tsx` → `requireAdmin()` → cookie assente → redirect `/admin/login?next=/utenti`
3. Form login → submit chiama server action `signInAdmin`
4. `signInAdmin`:
   - `supabase.auth.signInWithPassword({ email, password })`
   - 400 "Invalid credentials" → `{ error: "Credenziali errate" }`
   - 2xx + email in CSV → `redirect(next ?? "/utenti")`
   - 2xx + email **non** in CSV → `await supabase.auth.signOut()` + `{ error: "Account non autorizzato all'admin" }`
5. Cookie sessione settato dal Supabase client SSR → pagine successive vedono sessione attiva

### Logout

- Click "Esci" → POST `/api/admin/logout` → `signOut()` clear cookies → redirect `/admin/login`

### Refresh token (automatico)

- Middleware `@supabase/ssr` legge cookie a ogni request
- Se access token sta per scadere → chiama refresh con il refresh token (1 settimana TTL)
- Aggiorna cookie. Trasparente per l'utente.

### Password dimenticata

- Link sulla login page → `/auth/reset-password` (route già esistente, cross-device-safe per il flow Flutter implicit)
- Inserisci email → Supabase manda mail con link recovery
- Click link → pagina set new password → redirect `/admin/login`

### Revoca on the fly

- Email rimossa da CSV mentre la sessione è attiva → cookie ancora valido → next request → `requireAdmin()` fallisce sul check CSV → `signOut()` + redirect `/admin/login?error=unauthorized`
- Latenza massima di revoca: durata di un page load (immediata in pratica)

### Password cambiata da admin tramite Supabase Dashboard

- Supabase invalida tutte le sessioni attive dell'utente → next request → cookie non più valido → redirect login

## Migration plan

Cutover **soft** in 4 step, zero downtime.

### Step 1 - Preparazione DB (5 min, manuale)

- Per ogni futuro admin: Supabase Dashboard → Authentication → Add user → email + password iniziale → annota credenziali per consegna
- Opzionale: `UPDATE profiles SET role='admin' WHERE id = '<auth.users.id>'` per coerenza coi futuri RLS

### Step 2 - Deploy file isolati, non wired (1 PR)

Aggiungi **solo i file nuovi**, lasciando intatti `middleware.ts`, `app/(admin)/layout.tsx`, `app/page.tsx`, `components/admin/shell.tsx`:

- `app/admin/login/page.tsx` + `app/admin/login/actions.ts`
- `app/api/admin/logout/route.ts`
- `lib/admin/auth.ts`

Nessuna modifica ai file esistenti. Il basic auth resta attivo intercettando prima di qualsiasi nuova route (le route `/admin/login` e `/api/admin/logout` finirebbero anche loro dietro basic auth a causa del matcher - questo va bene per ora, le esercitiamo manualmente passando le credenziali basic).

- Nuova env var su Vercel: `ADMIN_EMAILS=alice@...,bob@...`
- Deploy → niente cambia per gli utenti, basic auth ancora attivo
- Smoke test manuale: con le credenziali basic, apri `/admin/login`, prova un login Supabase (deve settare il cookie senza wirare niente), verifica che `signInAdmin` rifiuti email non in CSV

**Perché split**: se modificassimo `app/(admin)/layout.tsx` con `requireAdmin()` allo step 2, gli utenti basic-auth (che non hanno sessione Supabase) sarebbero rediretti a `/admin/login` nonostante l'autenticazione basic. Lo split mantiene zero-downtime fino allo step 3.

### Step 3 - Cutover atomico (1 PR)

Tutto in un singolo deploy, in modo che la transizione sia istantanea:

- `middleware.ts`: rimuovi basic auth, aggiungi solo `@supabase/ssr` refresh middleware. Aggiungi `/admin/login` e `/api/admin/logout` al matcher di esclusione (sono pubblici).
- `app/(admin)/layout.tsx`: aggiungi `await requireAdmin()` in cima
- `app/page.tsx`: usa `requireAdmin()` (o sua versione "soft" che ritorna null) per il redirect condizionale, **non** solo `getSession()` - un utente Supabase-loggato ma non in CSV deve essere rediretto a `/admin/login`, non a `/utenti`
- `components/admin/shell.tsx`: topbar con email + logout
- Rimuovi env var `ADMIN_USER`, `ADMIN_PASSWORD` da Vercel
- Deploy → da ora chiunque apre il sito viene rediretto a `/admin/login` se non ha sessione admin valida
- Tu e altri admin loggate con le credenziali pre-create allo step 1

### Step 4 - Verifica (manuale)

Vedere "Testing" sotto.

### Rollback

Se allo step 3 qualcosa va storto:
- Redeploy del commit dello step 2 (basic auth ancora attivo come fallback)
- Ri-aggiungere env var `ADMIN_USER` / `ADMIN_PASSWORD` su Vercel
- Tempo stimato di rollback: ~5 min

## Edge cases

### Gestiti dal design

| Scenario | Comportamento |
|---|---|
| CSV vuoto o non settato | `requireAdmin()` rifiuta sempre (fail closed). Login page mostra "Configurazione incompleta, contatta il super-admin" |
| Email con maiuscole/spazi | Normalizzazione `.toLowerCase().trim()` su entrambi i lati del compare |
| Tentativo login con email mai esistita | Supabase ritorna "Invalid login credentials". Mostriamo lo stesso messaggio per non leakare quali email esistono |
| Cookie scaduto + refresh fallito | Middleware non aggiorna → next RSC → `requireAdmin()` fallisce → redirect login |
| Session hijacking | Cookie `HttpOnly + Secure + SameSite=Lax` (default `@supabase/ssr`) |
| Rate limit login | Nativo Supabase: default 30/h per IP. Configurabile su Dashboard se serve più stretto |
| HTTPS | Forzato da Vercel automaticamente |
| Open redirect via `?next=...` | `signInAdmin` sanitizza: accetta `next` solo se inizia con `/` e non con `//` (no protocol-relative URL). Altrimenti default `/utenti` |

### Noti, lasciati per future

- **Supabase Auth down** (raro): login fails, sito inaccessibile. Acceptable senza SLA su admin
- **Audit log**: fuori scope v1. Pattern futuro: tabella `admin_audit_log` + trigger sulle azioni admin
- **2FA**: abilitabile in Supabase Dashboard quando vorrai

## Testing

### Testing manuale (post-deploy step 3)

Checklist:
1. Login OK con credenziali corrette → atterra su `/utenti`
2. Login KO con password sbagliata → messaggio errore visibile, no redirect
3. Login con email auth valida ma NON in CSV → messaggio "Account non autorizzato", no sessione attiva
4. Apertura URL admin senza cookie → redirect a `/admin/login?next=...`
5. Logout → cookie pulito + redirect a login
6. Reset password completo: click "dimenticata" → email → link → nuova password → login funziona
7. Multi-utente concurrent: due browser diversi, due admin diversi loggati, entrambi modificano ristoranti contemporaneamente senza interferenze
8. Revoca on the fly: rimuovi un'email da CSV mentre quell'admin è loggato → al suo prossimo click viene disloggato

### Testing automatico

Non proposto in v1. L'admin Next.js attualmente non ha test suite e introdurla è scope creep. Se in futuro vuoi e2e per questa auth, Playwright è il candidato naturale.

## Open questions

Nessuna al momento. Tutte le scelte fondamentali (CSV vs DB, email+password vs magic link, provisioning manuale vs invito) sono state decise nel brainstorming.

## Riferimenti

- Repo: `D:\Dev\Progetti\Enopera-Admin\`
- Stato attuale auth: `middleware.ts` (basic auth)
- Trigger handle_new_user su `auth.users` → crea `profiles` automaticamente (esistente)
- Flow reset password cross-device: già implementato per Flutter app (`authFlowType: implicit`)
- Project Supabase: `vguueimgbngnjgoockge` (Enopera Admin)
