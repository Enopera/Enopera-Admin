# Enopera · Admin

Portale interno Enopera (Next.js 15, App Router, TypeScript) costruito sul design "variante C" del bundle `_design/enopera-portal/`. Si collega a Supabase (Postgres + Auth + Storage) come backend condiviso con la futura app mobile.

## Stack

- **Next.js 15** App Router, **React 19**, **TypeScript**
- **Supabase** (`@supabase/ssr` + `@supabase/supabase-js`) per DB, auth, storage PDF
- **Google Fonts**: Cormorant Garamond + DM Sans + JetBrains Mono via `next/font`
- Stili **inline** (replica fedele del design canvas)

## Struttura

```
app/
  layout.tsx              ← root layout + fonts
  page.tsx                ← redirect a /dashboard
  (admin)/
    layout.tsx            ← shell (sidebar + topstrip)
    [section]/page.tsx    ← router dinamico per le 7 sezioni
components/admin/
  shell.tsx               ← sidebar persistente + topstrip
  page-header.tsx         ← header editoriale + KPI strip
  pages/                  ← una tsx per ognuna delle 7 sezioni
    dashboard.tsx
    utenti.tsx            ← lista unificata + modal a 2 colonne
    cantine.tsx           ← lista + drawer
    vini.tsx              ← griglia 4 colonne + drawer scheda vino
    ordini.tsx            ← lista + drawer con timeline
    fatturazione.tsx      ← 3 tab + drawer fattura
    impostazioni.tsx      ← profilo, listini, integrazioni, team
lib/
  admin/
    tokens.ts             ← design tokens ADM
    icons.tsx             ← icone line stroke
    primitives.tsx        ← AdmStatus, AdmAvatar, AdmBtn, AdmChannel, helpers
    data.ts               ← mock data tipizzati (vini, ristoranti, cantine, ordini, …)
  supabase/
    client.ts             ← client browser
    server.ts             ← client server + service-role
supabase/
  schema.sql              ← schema iniziale (tabelle + enum + RLS)
_design/                  ← bundle di design originale (non importato)
```

## Setup

1. **Installa dipendenze**

   ```bash
   pnpm install
   ```

2. **Configura Supabase**

   - Crea un progetto su https://app.supabase.com
   - Project Settings → API → copia URL, `anon` key, `service_role` key
   - Crea `.env.local` partendo da `.env.local.example` e riempi i valori
   - SQL Editor → incolla `supabase/schema.sql` → Run
   - Storage → New bucket privato `documents` (per PDF fatture / DDT)

3. **Dev server**

   ```bash
   pnpm dev
   ```

   Apri http://localhost:3000 → redirect a `/dashboard`.

4. **Build di produzione**

   ```bash
   pnpm build
   pnpm start
   ```

## Pagine

| Path                    | Cosa fa |
|-------------------------|---------|
| `/dashboard`            | KPI strip, trend GMV 12 mesi, alert, top ristoranti & vini |
| `/utenti`               | Lista unificata ristoranti + agenti + operatori, modal 2 colonne |
| `/cantine`              | Tabella produttori, drawer con anagrafica + vini + ristoranti collegati |
| `/vini`                 | Griglia 4 colonne, drawer con KPI + note + ristoranti distribuiti |
| `/ordini`               | Tabella filtrabile per stato, drawer con timeline + righe + IVA |
| `/fatt`                 | 3 tab (ristoranti / provvigioni agenti / pagamenti cantine), drawer fattura |
| `/sett`                 | Profilo org, listini, notifiche, integrazioni, sicurezza, team |

Tutti i dati sono attualmente **mock** (`lib/admin/data.ts`). Il prossimo step è collegare le tabelle Supabase sostituendo gli array statici con query.

## Note

- I design tokens (`ADM`) sono in `lib/admin/tokens.ts` e mappano 1:1 i valori della direzione Vendemmia (avorio + carminio + oro).
- Tutti i componenti pagina usano `"use client"` perché l'interazione (filtri, drawer, modal, tab) è lato client.
- Le drawer/modal usano `position: fixed` + overlay click-to-close.
- Per la migrazione mock → Supabase, sostituisci gli import da `lib/admin/data.ts` con server actions/queries verso le tabelle del modulo `lib/supabase/`. Le RLS preimpostate isolano per ruolo (admin / operator / agent / restaurant / cantina).

## Backend condiviso con app mobile

Lo schema in `supabase/schema.sql` è pensato per essere consumato anche dall'app Flutter (vedi `_design/enopera-portal/project/design_handoff_enopera/`). L'app mobile usa l'SDK Supabase Flutter, autenticando l'utente come `restaurant` e leggendo solo i propri ordini/fatture grazie alla RLS.
