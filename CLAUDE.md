# Enopera Admin — context for Claude Code

> Questo file viene letto automaticamente all'apertura della repo. Tienilo aggiornato.

## Cosa è questo progetto

Pannello admin web per **Enopera**, distributore B2B di vini del Veneto. Gestisce gli account dei ristoranti clienti (CRUD, sospensione, reset password) e — quando arriverà l'integrazione — orchestrerà gli ordini verso il magazzino centrale tramite **StartyERP**.

Repo: https://github.com/Pier144/Enopera-Admin
Deploy: https://enopera-admin-26yb.vercel.app (URL provvisorio, niente custom domain ancora)

## Stack

- **Next.js 15** App Router + **React 19** + **TypeScript**
- **Supabase** (`@supabase/ssr` + `@supabase/supabase-js`) per DB, Auth, Storage, Edge Functions
- **Google Fonts** (Cormorant Garamond + DM Sans + JetBrains Mono) via `next/font`
- Stili **inline** (replica fedele del design Vendemmia "variante C")
- Basic auth via `middleware.ts` (env `ADMIN_USER` / `ADMIN_PASSWORD`)
- MCP Supabase configurato in `.mcp.json` — usa i tool `mcp__supabase__*` per migrazioni e query

## Struttura

```
app/
  layout.tsx                  ← root layout + fonts
  page.tsx                    ← redirect → /utenti
  (admin)/
    layout.tsx                ← shell admin (sidebar + topstrip)
    utenti/page.tsx           ← server component, fetch via lib/users
  auth/
    layout.tsx                ← layout pubblico (NO basic auth)
    reset-password/page.tsx   ← target del link email Supabase
components/admin/
  shell.tsx                   ← sidebar + topstrip
  page-header.tsx             ← header editoriale + KPI strip
  nav.ts                      ← PageId + labels
  users-list.tsx              ← lista, drawer, modal invito (gran parte della UI)
lib/
  admin/
    tokens.ts, icons.tsx, primitives.tsx   ← design system Vendemmia
  supabase/
    client.ts (browser) + server.ts (RSC) + admin.ts (service-role)
  users/
    types.ts, queries.ts, actions.ts        ← server-only data layer
middleware.ts                 ← basic auth gate, esclude /auth/*, /api, _next
supabase/
  functions/                  ← Edge Functions skeleton (NON deployate)
  cron.sql                    ← schedulazione pg_cron (NON ancora applicata)
```

## Backend Supabase

- **Project ref**: `vguueimgbngnjgoockge`
- **URL**: `https://vguueimgbngnjgoockge.supabase.co`
- **Anon key (publishable)**: `sb_publishable_RR0EhCzoipuE4HgIuLwrNw_L_LWUoyh` — safe in repo
- **Service role key**: `SUPABASE_SERVICE_ROLE_KEY` env var (Vercel dashboard) — MAI in repo
- **Basic auth env**: `ADMIN_USER` + `ADMIN_PASSWORD` su Vercel

### Schema essenziale (`public.profiles`)

`profiles` è 1:1 con `auth.users`. Campi rilevanti:

| Campo | Tipo | Note |
|---|---|---|
| `full_name`, `phone` | text | anagrafica utente |
| `role` | enum `admin`/`user` | default `user` |
| `status` | enum `attivo`/`sospeso`/`invitato` | default `attivo`. Sospeso → ban auth |
| `restaurant_name`, `address`, `vat` | text | anagrafica B2B |
| `starty_bp_id` | int | businessPartnerId in StartyERP (vuoto finché non c'è sync) |
| `member_since_year` | int | "Cliente Enopera dal {anno}" sull'app mobile |
| `city`, `district` | text | eyebrow header app — `{CITY} · {DISTRICT}` |
| `notes` | text | note interne admin |

Trigger `public.handle_new_user` su `auth.users` (AFTER INSERT) crea automaticamente la riga `profiles` propagando i campi dal `raw_user_meta_data`.

Esistono anche `public.wines` + `public.wine_stock` (cache per StartyERP, ancora non sincronizzati) e una view `wine_stock_summary`.

### RLS

- `profiles`: ognuno legge/aggiorna se stesso. Admin panel usa **service-role** e bypassa RLS.
- `wines` / `wine_stock`: lettura pubblica per autenticati.

### Edge Functions (skeleton, da completare)

In `supabase/functions/`:
- `_shared/starty.ts` — client tipizzato con handshake JWT cache
- `sync-products`, `sync-stock`, `place-order` — saga + idempotency
- Da deployare quando arrivano le credenziali StartyERP

Lo spec OpenAPI di Starty è in `_starty-spec.json` (gitignored — chiedi se serve).

## Vini (anagrafica catalogo)

- **Pagina**: `/vini` — server component carica tutti i ~829 vini attivi + valori distinct per autocomplete
- **Editing**: inline table, 3 colonne (vitigno, regione, gradazione) con optimistic update via `useState`+`useTransition`
- **Auth**: `requireAdmin()` nel layout + secondo gate dentro `updateWineMetadata` server action
- **Sorgente dati**: `lib/wines/queries.ts` (read) + `lib/wines/actions.ts` (write) — entrambi `createAdminClient` (service-role)
- **Sync StartyERP**: vedi sezione qui sotto. I 3 campi sono OUT del payload `wineRows.map(...)` per design; non aggiungere mai grape/region/abv/notes/pairing al sync.

## Sync StartyERP — invariante critico

La Edge Function `sync-starty-catalog` (slug attivo lato Supabase, non tracciata nel repo locale: vedi note in plan 2026-05-27-admin-vini-section.md) gira ogni notte via pg_cron e fa UPSERT su `public.wines`.

**Il payload UPSERT deve includere SOLO i campi anagrafici/operativi:**
`starty_product_id, code, sku, upc, name, producer, type, vintage, uom_id, units_per_package, is_stocked, lot_managed, is_sold, active, last_synced_at`

**NON deve mai includere:**
`grape, region, abv, notes, pairing`

Questi cinque campi sono curati a mano dall'admin nella pagina `/vini`. L'`.upsert()` di Supabase aggiorna solo le colonne presenti nel payload (UPSERT by-omission), quindi finché non vengono mai aggiunti al `wineRows.map(...)`, i valori curati dall'admin sono preservati automaticamente. **Aggiungere uno qualsiasi di questi cinque campi al payload azzererebbe gli 800+ vini popolati dall'admin al primo sync notturno.**

Se in futuro il source del sync viene importato nel repo, copiare questo commento sopra il blocco `wineRows.map(...)` come guard rail aggiuntivo a livello di codice.

## Tooling / convenzioni

```bash
pnpm install              # install
pnpm dev                  # dev server (localhost:3000)
pnpm typecheck            # tsc --noEmit (usa questo prima di build)
pnpm lint                 # next lint
pnpm build                # production build (eseguilo PRIMA di committare grosse modifiche)
```

- **Commit message**: stile conventional (`feat:`, `fix:`, `chore:`, ecc.). Includi `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` quando il commit è tuo.
- **Modifiche DB**: usa `mcp__supabase__apply_migration` con nome snake_case esplicativo, mai SQL editor manuali. Verifica con `mcp__supabase__get_advisors` dopo DDL.
- **Mai committare** `.env.local`, `_starty-spec.json`, `_design*/`. Il `.gitignore` li copre già.
- **`tsconfig.json` esclude `supabase/functions`** (runtime Deno, non Node).
- **Reset password**: il flow è cross-device → Flutter usa `authFlowType: implicit`. NON riportarlo a PKCE senza valutare conseguenze.

## Stato pendente

- ⏳ Credenziali StartyERP non ancora ricevute → secrets Supabase + Edge Functions da finalizzare
- ⏳ Custom domain Vercel + SMTP custom (Resend) per togliere il rate limit di 2 email/h del SMTP free
- ⏳ Auth Supabase "vera" per l'admin (oggi è basic auth via middleware)
- ⏳ Quando arriva Starty: applicare `supabase/cron.sql`, riempire i TODO nelle Edge Functions, popolare `starty_bp_id` per i ristoranti

## Vedi anche

- App mobile Flutter consumer di questo backend: `D:\Dev\Progetti\enopera_portal\` (ha il suo `CLAUDE.md`)
