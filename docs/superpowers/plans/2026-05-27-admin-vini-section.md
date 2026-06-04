# Admin sezione "Vini" + Flutter consumer N/A - Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere la pagina admin `/vini` per popolare a mano vitigno/regione/gradazione sui 829 vini (oggi 809 con questi campi NULL perché StartyERP non li espone), e fare lo switch del catalogo Flutter da mock locale a RPC reale con visualizzazione esplicita "N/A" per i campi mancanti.

**Architecture:** Nessuna migration DDL (le 3 colonne `grape/region/abv` esistono già nullable in `public.wines`). Edge Function di sync intatta - ha già upsert by-omission che preserva i campi curati dall'admin; aggiungiamo solo un commento di guard rail. Admin: server component carica wines + autocomplete options → client component con tabella inline-edit, optimistic update via `useState`+`useTransition`, rollback esplicito su errore. Flutter: model con 3 campi nullable, nuovo `fetchCatalogFromDb()` che chiama RPC `catalog_for_current_user`, `CatalogoScreen` consuma `catalogProvider` con `AsyncValue.when`.

**Tech Stack:** Next.js 15 App Router, React 19 (`useState`+`useTransition`, niente `useOptimistic`), TypeScript stretto, Supabase service-role via `createAdminClient` (lib/supabase/admin), Zod per validazione server. Flutter Material 3, Riverpod (`FutureProvider`), `supabase_flutter` v2.8. Niente test framework: verifica via `pnpm typecheck` + `pnpm build` + `flutter analyze` + smoke manuale.

**Spec di riferimento:** [docs/superpowers/specs/2026-05-27-admin-vini-section-design.md](../specs/2026-05-27-admin-vini-section-design.md)

**Project roots:**
- Admin: `D:\Dev\Progetti\Enopera-Admin\`
- Flutter: `D:\Dev\Progetti\enopera_portal\`

---

## File structure

### Enopera-Admin - nuovi

| Path | Responsabilità |
|---|---|
| `lib/wines/queries.ts` | Server-only. `listWinesForAdmin()` + `listGrapeRegionOptions()`. Usa `createAdminClient` da `@/lib/supabase/admin`. |
| `lib/wines/actions.ts` | Server action `updateWineMetadata(wineId, fields)`. `requireAdmin()` + Zod parse + UPDATE su wines. |
| `app/(admin)/vini/page.tsx` | Server component. Carica wines + options, passa al client component. `AdmShell active="vini"`. |
| `components/admin/vini-list.tsx` | Client component. Stato locale via `useState`, optimistic update, rollback, sort/filter, tabella inline-edit + datalist. |

### Enopera-Admin - modificati

| Path | Modifica |
|---|---|
| `components/admin/nav.ts` | Aggiungi `"vini"` a `PageId`, `PAGE_LABELS`, `VALID_PAGES`. |
| `components/admin/shell.tsx:15-20` | Aggiungi `{ id: "vini", label: "Vini", icon: () => AdmIcons.bottle(16) }` a `NAV_ITEMS` come 5ª voce. |
| `CLAUDE.md` | Sezione "Sync StartyERP" con guard rail invariant (vedi Task 1 - il source del sync attivo non è tracciato nel repo locale). |

### Drift repo / produzione - nota importante

La Edge Function `sync-starty-catalog` attualmente attiva in produzione (slug `aeeb9960-5745-488c-836d-3e5aad0d6ff7`, version 14) è stata sviluppata e deployata direttamente lato server Supabase: **non è tracciata nel repo locale**. Il file `supabase/functions/sync-products/index.ts` presente nel repo è una bozza vecchia con `TODO: riempire le chiamate Starty quando arrivano le credenziali` - non è il codice che gira realmente, e non viene chiamato da nessuna pg_cron attiva.

Per questo task non risolviamo il drift (out of scope), ma:
- L'invariante "il payload upsert NON contiene grape/region/abv/notes/pairing" è già verificato leggendo il codice production via MCP (vedi spec) - i campi sono safe per design.
- Il guard rail viene documentato in `CLAUDE.md` come sezione formale (Task 1).
- Aggiungiamo un follow-up "import sync-starty-catalog source into repo" nella sezione "Out of scope" del plan finale (Task 14).

### enopera_portal - nuovi

| Path | Responsabilità |
|---|---|
| `lib/data/supabase_catalog.dart` | `fetchCatalogFromDb()` - chiama RPC `catalog_for_current_user` e mappa in `List<Wine>`. |

### enopera_portal - modificati

| Path | Modifica |
|---|---|
| `lib/data/models.dart:28-54` | Campi `region`, `abv`, `grape` diventano nullable (`String?`, `double?`, `String?`). |
| `lib/state/app_state.dart` | Aggiungi `catalogProvider = FutureProvider<List<Wine>>`. |
| `lib/screens/catalogo_screen.dart` | Sostituisci `venetoWines` con `ref.watch(catalogProvider).when(...)`, search filter nullable-safe, "N/A" sui 3 `_DetailField` e sull'header chip. |

### enopera_portal - inalterati (no-op gap noto)

| Path | Note |
|---|---|
| `lib/data/mock_data.dart` | I 20 vini hanno tutti i campi popolati - continuano a compilare con il modello nullable (Dart accetta non-null dove è atteso nullable). `wineById()` resta. |
| `lib/state/app_state.dart` `cantinaLinesProvider` | Continua a chiamare `wineById()` dal mock. Filtra `null` silenziosamente. Effetto: cantina vuota per utenti esistenti - documentato. |
| `lib/screens/dettaglio_ordine_screen.dart:272` | Stesso pattern, ordini storici hanno righe vuote - documentato. |

---

## Chunk 0: Pre-flight verification (DB)

### Task 0: Verifica stato Supabase prima di iniziare

**Outcome:** Confermato via MCP che (a) lo schema `wines` ha le 3 colonne nullable attese, (b) l'RPC `catalog_for_current_user` esiste con la firma documentata nella spec, (c) la edge function `sync-starty-catalog` è ancora ACTIVE con il payload safe.

- [ ] **Step 0.1: Verifica schema wines**

Esegui via MCP (`mcp__c366e5da-...__execute_sql`):
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='wines'
  AND column_name IN ('grape','region','abv')
ORDER BY column_name;
```
Expected: 3 righe - `abv numeric YES`, `grape text YES`, `region text YES`. Se manca anche uno solo, FERMA - la spec assume queste colonne nullable.

- [ ] **Step 0.2: Verifica esistenza RPC `catalog_for_current_user`**

Esegui via MCP:
```sql
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema='public' AND routine_name='catalog_for_current_user';
```
Expected: 1 riga `catalog_for_current_user FUNCTION`. Se 0 righe, FERMA - la spec assume l'RPC esistente.

Inoltre verifica le colonne ritornate:
```sql
SELECT pg_get_function_result(oid) AS sig
FROM pg_proc WHERE proname='catalog_for_current_user';
```
Expected: include `wine_id uuid, name text, producer text, type text, vintage integer, region text, grape text, abv numeric, price numeric, notes text, pairing text` (più altre). Se la firma non include `region/grape/abv`, il Dart mapper del Task 10 non funzionerà.

- [ ] **Step 0.3: Verifica che la edge function `sync-starty-catalog` sia ACTIVE**

Esegui via MCP (`mcp__c366e5da-...__list_edge_functions`):
Expected: lista include una entry con `slug: "sync-starty-catalog"`, `status: "ACTIVE"`.

Poi verifica che il payload del suo upsert NON contenga grape/region/abv/notes/pairing (`mcp__c366e5da-...__get_edge_function` con slug `sync-starty-catalog`, leggi il body): cerca il blocco `const wineRows = uniqueProducts.map(` e conferma che le chiavi presenti sono solo `starty_product_id, code, sku, upc, name, producer, type, vintage, uom_id, units_per_package, is_stocked, lot_managed, is_sold, active, last_synced_at`.

Se trovi anche solo una di `grape/region/abv/notes/pairing`, FERMA - l'invariante è violata e va sistemata prima di abilitare /vini.

- [ ] **Step 0.4: Conta i vini incompleti**

Esegui via MCP:
```sql
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE grape IS NULL OR region IS NULL OR abv IS NULL) AS incomplete
FROM public.wines WHERE active = true;
```
Expected: oggi `total ≈ 829`, `incomplete ≈ 809`. Annota i numeri reali - serviranno nello smoke (Task 8.2 e 13.3).

Non c'è commit per questo task - è solo verifica.

---

## Chunk 1: Backend Admin (queries + action + sync guard rail docs)

### Task 1: Sync guard rail - documentale in CLAUDE.md

**Outcome:** `CLAUDE.md` di Enopera-Admin contiene una sezione esplicita "Sync StartyERP" che documenta l'invariante: il payload UPSERT non deve includere `grape/region/abv/notes/pairing`.

**Files:**
- Modify: `CLAUDE.md`

**Nota di contesto** (vedi sezione "Drift repo / produzione" in cima): il source TypeScript del sync `sync-starty-catalog` attivo in produzione NON è tracciato nel repo locale (è stato deployato direttamente lato server). Quindi il guard rail va come documentazione (CLAUDE.md), non come commento nel codice. Se in futuro il source viene importato nel repo, replicarvi il commento.

- [ ] **Step 1.1: Leggi CLAUDE.md per individuare la posizione**

Apri `D:\Dev\Progetti\Enopera-Admin\CLAUDE.md` e identifica la sezione naturale dove aggiungere il guard rail. Tipicamente sotto una sezione "Backend / Supabase" o tra le sezioni di alto livello. Se non c'è una sezione corrispondente, aggiungilo come nuova sezione di alto livello prima di "Conventions" / "Coding rules" (se presenti) o in fondo.

- [ ] **Step 1.2: Aggiungi la sezione**

Inserisci:

```markdown
## Sync StartyERP - invariante critico

La Edge Function `sync-starty-catalog` (slug attivo lato Supabase, non tracciata nel repo locale: vedi note in plan 2026-05-27-admin-vini-section.md) gira ogni notte via pg_cron e fa UPSERT su `public.wines`.

**Il payload UPSERT deve includere SOLO i campi anagrafici/operativi:**
`starty_product_id, code, sku, upc, name, producer, type, vintage, uom_id, units_per_package, is_stocked, lot_managed, is_sold, active, last_synced_at`

**NON deve mai includere:**
`grape, region, abv, notes, pairing`

Questi cinque campi sono curati a mano dall'admin nella pagina `/vini`. L'`.upsert()` di Supabase aggiorna solo le colonne presenti nel payload (UPSERT by-omission), quindi finché non vengono mai aggiunti al `wineRows.map(...)`, i valori curati dall'admin sono preservati automaticamente. **Aggiungere uno qualsiasi di questi cinque campi al payload azzererebbe gli 800+ vini popolati dall'admin al primo sync notturno.**

Se in futuro il source del sync viene importato nel repo, copiare questo commento sopra il blocco `wineRows.map(...)` come guard rail aggiuntivo a livello di codice.
```

- [ ] **Step 1.3: Commit**

```bash
git -C "D:/Dev/Progetti/Enopera-Admin" add CLAUDE.md
git -C "D:/Dev/Progetti/Enopera-Admin" commit -m "$(cat <<'EOF'
docs(claudemd): document sync StartyERP guard rail invariant

The sync-starty-catalog edge function (deployed server-side, not
tracked in repo) must never include grape/region/abv/notes/pairing
in the upsert payload - these are admin-curated via the new /vini
section and would be wiped by the nightly sync if added.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2: Query layer - `lib/wines/queries.ts`

**Outcome:** Due funzioni server-only che il page component admin può importare per leggere tutti i vini e i valori di autocomplete.

**Files:**
- Create: `lib/wines/queries.ts`

- [ ] **Step 2.1: Crea la directory + il file**

```powershell
New-Item -ItemType Directory -Path "D:\Dev\Progetti\Enopera-Admin\lib\wines" -Force | Out-Null
```

- [ ] **Step 2.2: Scrivi il contenuto del file**

`D:\Dev\Progetti\Enopera-Admin\lib\wines\queries.ts`:

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type WineRow = {
  id: string;
  name: string;
  producer: string | null;
  type: string;
  vintage: number | null;
  grape: string | null;
  region: string | null;
  abv: number | null;
  starty_product_id: number | null;
};

export type AutocompleteOptions = {
  grapes: string[];
  regions: string[];
};

export async function listWinesForAdmin(): Promise<WineRow[]> {
  const supa = createAdminClient();
  const { data, error } = await supa
    .from("wines")
    .select("id, name, producer, type, vintage, grape, region, abv, starty_product_id")
    .eq("active", true)
    .order("producer", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as WineRow[];
}

export async function listGrapeRegionOptions(): Promise<AutocompleteOptions> {
  const supa = createAdminClient();
  const { data, error } = await supa
    .from("wines")
    .select("grape, region")
    .or("grape.not.is.null,region.not.is.null");
  if (error) throw new Error(error.message);
  const grapes = new Set<string>();
  const regions = new Set<string>();
  for (const row of data ?? []) {
    if (row.grape) grapes.add(row.grape);
    if (row.region) regions.add(row.region);
  }
  return {
    grapes:  [...grapes].sort((a, b) => a.localeCompare(b, "it")),
    regions: [...regions].sort((a, b) => a.localeCompare(b, "it")),
  };
}
```

- [ ] **Step 2.3: Verifica con `pnpm typecheck`**

```bash
cd "D:/Dev/Progetti/Enopera-Admin"; pnpm typecheck
```
Expected: zero errori. Se errore "Cannot find module @/lib/supabase/admin", verifica path import (deve esistere `lib/supabase/admin.ts` con export `createAdminClient` - è già lì, vedi `lib/price-lists/queries.ts:2`).

- [ ] **Step 2.4: Commit**

```bash
git -C "D:/Dev/Progetti/Enopera-Admin" add lib/wines/queries.ts
git -C "D:/Dev/Progetti/Enopera-Admin" commit -m "$(cat <<'EOF'
feat(wines): server-only query layer for admin

listWinesForAdmin returns all active wines sorted by producer + name.
listGrapeRegionOptions returns the distinct grape/region values already
in use, sorted case-insensitive italian - powers the inline-edit
autocomplete in /vini.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 3: Server action - `lib/wines/actions.ts`

**Outcome:** Una server action `updateWineMetadata` con doppio auth gate, validazione Zod, e UPDATE atomico.

**Files:**
- Create: `lib/wines/actions.ts`

- [ ] **Step 3.1: Verifica che Zod sia in deps**

```bash
cd "D:/Dev/Progetti/Enopera-Admin"; pnpm list zod | head -3
```
Expected: una riga `zod X.Y.Z`. Se assente, `pnpm add zod` (è dipendenza standard nel progetto admin, già usata da altre actions).

- [ ] **Step 3.2: Crea il file**

`D:\Dev\Progetti\Enopera-Admin\lib\wines\actions.ts`:

```ts
"use server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const Schema = z.object({
  grape:  z.string().trim().max(200).nullable().optional(),
  region: z.string().trim().max(200).nullable().optional(),
  abv:    z.number().min(0).max(20).nullable().optional(),
});

export async function updateWineMetadata(
  wineId: string,
  fields: unknown,
): Promise<void> {
  await requireAdmin();
  const parsed = Schema.parse(fields);

  // Normalizza empty string → null (cella svuotata = "non popolato")
  const update: Record<string, string | number | null> = {};
  if ("grape"  in parsed) update.grape  = (parsed.grape  ?? "") || null;
  if ("region" in parsed) update.region = (parsed.region ?? "") || null;
  if ("abv"    in parsed) update.abv    = parsed.abv ?? null;

  const supa = createAdminClient();
  const { error } = await supa.from("wines").update(update).eq("id", wineId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 3.3: Verifica typecheck**

```bash
cd "D:/Dev/Progetti/Enopera-Admin"; pnpm typecheck
```
Expected: zero errori.

- [ ] **Step 3.4: Commit**

```bash
git -C "D:/Dev/Progetti/Enopera-Admin" add lib/wines/actions.ts
git -C "D:/Dev/Progetti/Enopera-Admin" commit -m "$(cat <<'EOF'
feat(wines): server action updateWineMetadata with double-gate auth

requireAdmin() guards every call (defense in depth on top of the route
layout gate). Zod schema accepts partial updates (any combination of
grape/region/abv) with sane bounds (max 200 chars text, abv 0-20).
Empty strings normalized to null so the admin can revert a cell to
"not populated" state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 2: UI Admin (sidebar + page + viniList)

### Task 4: Sidebar wiring

**Outcome:** La voce "Vini" appare nella sidebar (5ª, dopo Utenti) e nel mapping breadcrumb.

**Files:**
- Modify: `components/admin/nav.ts`
- Modify: `components/admin/shell.tsx:15-20`

- [ ] **Step 4.1: Aggiorna `nav.ts`**

Rimpiazza il contenuto di `D:\Dev\Progetti\Enopera-Admin\components\admin\nav.ts` con:

```ts
// Navigazione admin.

export type PageId = "ordini" | "cantine" | "ristoranti" | "listini" | "utenti" | "vini";

export const PAGE_LABELS: Record<PageId, [string, string]> = {
  ordini:     ["Ordini",     "Consegne"],
  cantine:    ["Cantine",    "Stock clienti"],
  ristoranti: ["Ristoranti", "Anagrafiche B2B"],
  listini:    ["Listini",    "Prezzi per cliente"],
  utenti:     ["Utenti",     "Account"],
  vini:       ["Vini",       "Anagrafica catalogo"],
};

export const VALID_PAGES: readonly PageId[] = ["ordini", "cantine", "ristoranti", "listini", "utenti", "vini"];
```

- [ ] **Step 4.2: Aggiorna `NAV_ITEMS` in `shell.tsx`**

Apri `D:\Dev\Progetti\Enopera-Admin\components\admin\shell.tsx`. Localizza linee 15-20:

```ts
const NAV_ITEMS: { id: PageId; label: string; icon: () => ReactNode }[] = [
  { id: "ordini",     label: "Ordini",     icon: () => AdmIcons.package(16) },
  { id: "ristoranti", label: "Ristoranti", icon: () => AdmIcons.store(16) },
  { id: "listini",    label: "Listini",    icon: () => AdmIcons.tag(16) },
  { id: "utenti",     label: "Utenti",     icon: () => AdmIcons.user(16) },
];
```

Aggiungi una 5ª riga `vini` con icona `bottle` (esiste già in `lib/admin/icons.tsx:28`):

```ts
const NAV_ITEMS: { id: PageId; label: string; icon: () => ReactNode }[] = [
  { id: "ordini",     label: "Ordini",     icon: () => AdmIcons.package(16) },
  { id: "ristoranti", label: "Ristoranti", icon: () => AdmIcons.store(16) },
  { id: "listini",    label: "Listini",    icon: () => AdmIcons.tag(16) },
  { id: "utenti",     label: "Utenti",     icon: () => AdmIcons.user(16) },
  { id: "vini",       label: "Vini",       icon: () => AdmIcons.bottle(16) },
];
```

- [ ] **Step 4.3: Verifica `pnpm typecheck`**

```bash
cd "D:/Dev/Progetti/Enopera-Admin"; pnpm typecheck
```
Expected: zero errori. Se errore "Type ... is not assignable to ... PageId", verifica che il `PageId` in nav.ts includa `"vini"`.

- [ ] **Step 4.4: Commit**

```bash
git -C "D:/Dev/Progetti/Enopera-Admin" add components/admin/nav.ts components/admin/shell.tsx
git -C "D:/Dev/Progetti/Enopera-Admin" commit -m "$(cat <<'EOF'
feat(admin): add 'vini' nav entry to sidebar

5th visible item after Utenti, uses existing bottle icon from
AdmIcons. PageId and PAGE_LABELS extended consistently across nav.ts
and shell.tsx NAV_ITEMS.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 5: Pagina server component `/vini`

**Outcome:** Visitando `/vini` da loggato si ottiene un AdmShell con tabella che mostra "Vini · Anagrafica catalogo" e (vuota per ora) la lista - basta che la pagina compili e renderizzi senza errori. Il render della tabella arriva al task 6.

**Files:**
- Create: `app/(admin)/vini/page.tsx`

- [ ] **Step 5.1: Crea directory + file**

```powershell
New-Item -ItemType Directory -Path "D:\Dev\Progetti\Enopera-Admin\app\(admin)\vini" -Force | Out-Null
```

- [ ] **Step 5.2: Scrivi il page component (stub: render tabella vuoto)**

`D:\Dev\Progetti\Enopera-Admin\app\(admin)\vini\page.tsx`:

```tsx
import { ADM } from "@/lib/admin/tokens";
import { AdmShell } from "@/components/admin/shell";
import { PAGE_LABELS } from "@/components/admin/nav";
import { listWinesForAdmin, listGrapeRegionOptions } from "@/lib/wines/queries";
import { ViniList } from "@/components/admin/vini-list";

export const dynamic = "force-dynamic";

export default async function ViniPage() {
  const [crumb, sub] = PAGE_LABELS.vini;

  let wines: Awaited<ReturnType<typeof listWinesForAdmin>> = [];
  let options: Awaited<ReturnType<typeof listGrapeRegionOptions>> = { grapes: [], regions: [] };
  let fetchError: string | null = null;
  try {
    [wines, options] = await Promise.all([listWinesForAdmin(), listGrapeRegionOptions()]);
  } catch (e) {
    fetchError = (e as Error).message;
  }

  return (
    <AdmShell active="vini" crumb={crumb} sub={sub}>
      {fetchError ? (
        <div style={{
          margin: 36, padding: "24px 28px", borderRadius: 8,
          background: ADM.redWash, border: `1px solid ${ADM.red}33`,
          fontFamily: ADM.sans, fontSize: 13, color: ADM.red, lineHeight: 1.5,
        }}>
          <strong>Impossibile caricare i vini.</strong>
          <div style={{ marginTop: 6, color: ADM.ink }}>{fetchError}</div>
        </div>
      ) : (
        <ViniList wines={wines} options={options} />
      )}
    </AdmShell>
  );
}
```

- [ ] **Step 5.3: Verifica che `vini-list` non esista ancora (genererà errore di typecheck atteso)**

```bash
cd "D:/Dev/Progetti/Enopera-Admin"; pnpm typecheck 2>&1 | head -10
```
Expected: errore "Cannot find module '@/components/admin/vini-list'". Procediamo al task 6 per crearlo.

- [ ] **Step 5.4: NON committare ancora** - la pagina dipende da `ViniList` che creiamo al task 6. Andiamo avanti senza commit.

### Task 6: Client component `vini-list.tsx` - parte 1 (struttura + toolbar + sort/filter)

**Outcome:** Il file `vini-list.tsx` esiste, esporta `ViniList`, compila, e mostra: header con counter, search + filtri. La tabella stessa è uno stub al task 7.

**Files:**
- Create: `components/admin/vini-list.tsx`

- [ ] **Step 6.1: Scrivi lo scaffold del file con tutto fuorché la tabella**

`D:\Dev\Progetti\Enopera-Admin\components\admin\vini-list.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ADM } from "@/lib/admin/tokens";
import { updateWineMetadata } from "@/lib/wines/actions";
import type { WineRow, AutocompleteOptions } from "@/lib/wines/queries";

type Props = {
  wines: WineRow[];
  options: AutocompleteOptions;
};

type StatusFilter = "incomplete" | "complete" | null;

function isIncomplete(w: WineRow): boolean {
  return w.grape == null || w.region == null || w.abv == null;
}

export function ViniList({ wines: initial, options }: Props) {
  const [wines, setWines] = useState<WineRow[]>(initial);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<StatusFilter>(null);
  const [filterProducer, setFilterProducer] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const producers = useMemo(() => {
    const s = new Set<string>();
    for (const w of wines) if (w.producer) s.add(w.producer);
    return [...s].sort((a, b) => a.localeCompare(b, "it"));
  }, [wines]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = wines.filter((w) => {
      if (q) {
        const inName = w.name.toLowerCase().includes(q);
        const inProd = (w.producer ?? "").toLowerCase().includes(q);
        if (!inName && !inProd) return false;
      }
      if (filterType && w.type !== filterType) return false;
      if (filterProducer && w.producer !== filterProducer) return false;
      if (filterStatus === "incomplete" && !isIncomplete(w)) return false;
      if (filterStatus === "complete" && isIncomplete(w)) return false;
      return true;
    });
    // Sort: incompleti prima, poi producer + name
    return matches.sort((a, b) => {
      const ai = isIncomplete(a) ? 0 : 1;
      const bi = isIncomplete(b) ? 0 : 1;
      if (ai !== bi) return ai - bi;
      const pa = (a.producer ?? "").localeCompare(b.producer ?? "", "it");
      if (pa !== 0) return pa;
      return a.name.localeCompare(b.name, "it");
    });
  }, [wines, search, filterType, filterStatus, filterProducer]);

  const incompleteCount = useMemo(() => wines.filter(isIncomplete).length, [wines]);

  function commitUpdate(
    wineId: string,
    field: "grape" | "region" | "abv",
    value: string | number | null,
  ) {
    // Cattura il valore precedente del SINGOLO campo della SINGOLA riga,
    // NON l'intero array `wines`. Così il rollback non sovrascrive
    // modifiche concorrenti su altre righe (o su altri campi della stessa riga).
    const target = wines.find((r) => r.id === wineId);
    if (!target) return;
    const previousFieldValue = (target as Record<string, unknown>)[field] as string | number | null;

    setWines((curr) => curr.map((r) => (r.id === wineId ? { ...r, [field]: value } : r)));
    setPendingIds((s) => new Set(s).add(wineId));
    startTransition(async () => {
      try {
        await updateWineMetadata(wineId, { [field]: value });
      } catch (err) {
        // Rollback solo del singolo field/row, niente snapshot dell'intera lista.
        setWines((curr) => curr.map((r) =>
          r.id === wineId ? { ...r, [field]: previousFieldValue } : r,
        ));
        setToast(`Salvataggio fallito: ${(err as Error).message}`);
        setTimeout(() => setToast(null), 5000);
      } finally {
        setPendingIds((s) => {
          const next = new Set(s);
          next.delete(wineId);
          return next;
        });
      }
    });
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <Toolbar
        search={search} onSearch={setSearch}
        filterType={filterType} onFilterType={setFilterType}
        filterStatus={filterStatus} onFilterStatus={setFilterStatus}
        filterProducer={filterProducer} onFilterProducer={setFilterProducer}
        producers={producers}
        incompleteCount={incompleteCount}
        totalCount={wines.length}
      />
      <WineTable
        rows={filtered}
        options={options}
        pendingIds={pendingIds}
        onCommit={commitUpdate}
      />
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, padding: "12px 18px",
          background: ADM.red, color: ADM.white, borderRadius: 6,
          fontFamily: ADM.sans, fontSize: 13, boxShadow: "0 4px 18px rgba(0,0,0,0.2)",
          zIndex: 100,
        }}>{toast}</div>
      )}
    </div>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────

function Toolbar(props: {
  search: string;
  onSearch: (v: string) => void;
  filterType: string | null;
  onFilterType: (v: string | null) => void;
  filterStatus: StatusFilter;
  onFilterStatus: (v: StatusFilter) => void;
  filterProducer: string | null;
  onFilterProducer: (v: string | null) => void;
  producers: string[];
  incompleteCount: number;
  totalCount: number;
}) {
  const TYPES = ["Rosso", "Bianco", "Bolle", "Rosato"];
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 12,
      padding: "20px 36px 16px",
      background: ADM.panel, borderBottom: `1px solid ${ADM.line}`,
      fontFamily: ADM.sans,
    }}>
      {/* Riga 1: search + counter */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <input
          type="text"
          placeholder="Cerca per nome o produttore…"
          value={props.search}
          onChange={(e) => props.onSearch(e.target.value)}
          style={{
            flex: 1, maxWidth: 480,
            padding: "8px 12px", borderRadius: 6,
            border: `1px solid ${ADM.line}`, background: ADM.white,
            fontFamily: ADM.sans, fontSize: 13, color: ADM.ink,
            outline: "none",
          }}
        />
        <div style={{ marginLeft: "auto", fontSize: 12, color: ADM.inkSoft }}>
          {props.incompleteCount === 0
            ? `${props.totalCount} vini, tutti completi`
            : `${props.incompleteCount} di ${props.totalCount} da popolare`}
        </div>
      </div>
      {/* Riga 2: filtri */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <FilterGroup
          label="Tipo"
          options={TYPES}
          value={props.filterType}
          onChange={props.onFilterType}
        />
        <FilterGroup
          label="Stato"
          options={[
            { value: "incomplete", label: "Solo da popolare" },
            { value: "complete",   label: "Solo completi" },
          ]}
          value={props.filterStatus}
          onChange={(v) => props.onFilterStatus(v as StatusFilter)}
        />
        <ProducerFilter
          producers={props.producers}
          value={props.filterProducer}
          onChange={props.onFilterProducer}
        />
      </div>
    </div>
  );
}

function FilterGroup({
  label, options, value, onChange,
}: {
  label: string;
  options: (string | { value: string; label: string })[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const items = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11, color: ADM.inkMuted, letterSpacing: 0.4, textTransform: "uppercase" }}>
        {label}
      </span>
      {items.map((it) => {
        const active = value === it.value;
        return (
          <button
            key={it.value}
            onClick={() => onChange(active ? null : it.value)}
            style={{
              padding: "4px 10px", borderRadius: 999,
              border: `1px solid ${active ? ADM.carmine : ADM.line}`,
              background: active ? ADM.carmineWash : ADM.white,
              color: active ? ADM.carmine : ADM.ink,
              fontSize: 12, fontFamily: ADM.sans, cursor: "pointer",
            }}
          >{it.label}</button>
        );
      })}
    </div>
  );
}

function ProducerFilter(props: {
  producers: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11, color: ADM.inkMuted, letterSpacing: 0.4, textTransform: "uppercase" }}>
        Produttore
      </span>
      <select
        value={props.value ?? ""}
        onChange={(e) => props.onChange(e.target.value || null)}
        style={{
          padding: "4px 10px", borderRadius: 6,
          border: `1px solid ${ADM.line}`, background: ADM.white,
          fontSize: 12, fontFamily: ADM.sans, cursor: "pointer", color: ADM.ink,
        }}
      >
        <option value="">Tutti</option>
        {props.producers.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </div>
  );
}

// ─── Stub WineTable (sostituito al task 7) ───────────────────────────────

function WineTable(_props: {
  rows: WineRow[];
  options: AutocompleteOptions;
  pendingIds: Set<string>;
  onCommit: (wineId: string, field: "grape" | "region" | "abv", value: string | number | null) => void;
}) {
  return (
    <div style={{ padding: 36, color: ADM.inkSoft, fontFamily: ADM.sans }}>
      [stub: la tabella arriva nel task 7]
    </div>
  );
}
```

- [ ] **Step 6.2: Verifica `pnpm typecheck`**

```bash
cd "D:/Dev/Progetti/Enopera-Admin"; pnpm typecheck
```
Expected: zero errori.

- [ ] **Step 6.3: Verifica visiva (opzionale ma raccomandato)**

```bash
cd "D:/Dev/Progetti/Enopera-Admin"; pnpm dev
```
Apri `http://localhost:3000/vini` (dopo login). Dovresti vedere: sidebar con "Vini", topstrip "Vini · Anagrafica catalogo", toolbar con search e filtri funzionanti, area centrale `[stub: la tabella arriva nel task 7]`. Chiudi il dev server (`Ctrl+C`).

- [ ] **Step 6.4: NON committare ancora** - completa la tabella nel task 7 e commit unico.

### Task 7: Client component `vini-list.tsx` - parte 2 (tabella + inline edit + datalist)

**Outcome:** La tabella renderizza tutte le 829 righe filtrate con celle editabili per grape/region (input+datalist autocomplete) e abv (input number), badge stato, salva su blur/Enter con optimistic update.

**Files:**
- Modify: `components/admin/vini-list.tsx` (sostituisci la funzione `WineTable` stub)

- [ ] **Step 7.1: Sostituisci la funzione `WineTable` stub**

In `D:\Dev\Progetti\Enopera-Admin\components\admin\vini-list.tsx`, rimpiazza l'intera sezione dal commento `// ─── Stub WineTable (sostituito al task 7) ───` fino a fine file con:

```tsx
// ─── WineTable ───────────────────────────────────────────────────────────

function WineTable(props: {
  rows: WineRow[];
  options: AutocompleteOptions;
  pendingIds: Set<string>;
  onCommit: (wineId: string, field: "grape" | "region" | "abv", value: string | number | null) => void;
}) {
  return (
    <div style={{ flex: 1, overflowX: "auto", overflowY: "auto" }}>
      <table style={{
        width: "100%", borderCollapse: "collapse",
        fontFamily: ADM.sans, fontSize: 13, color: ADM.ink,
      }}>
        <thead>
          <tr style={{
            position: "sticky", top: 0, zIndex: 1,
            background: ADM.panelAlt, borderBottom: `1px solid ${ADM.line}`,
          }}>
            <Th>Nome</Th>
            <Th>Produttore</Th>
            <Th style={{ width: 80 }}>Tipo</Th>
            <Th style={{ width: 80 }}>Annata</Th>
            <Th style={{ width: 240 }}>Vitigno</Th>
            <Th style={{ width: 200 }}>Regione</Th>
            <Th style={{ width: 100 }}>Grad.</Th>
            <Th style={{ width: 40 }}> </Th>
          </tr>
        </thead>
        <tbody>
          {props.rows.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ padding: 36, textAlign: "center", color: ADM.inkMuted }}>
                Nessun vino corrisponde ai filtri.
              </td>
            </tr>
          ) : (
            props.rows.map((row, idx) => (
              <WineRowEditor
                key={row.id}
                row={row}
                options={props.options}
                pending={props.pendingIds.has(row.id)}
                alt={idx % 2 === 1}
                onCommit={props.onCommit}
              />
            ))
          )}
        </tbody>
      </table>

      {/* Datalist condivisi - uno solo per tutta la tabella */}
      <datalist id="grape-suggestions">
        {props.options.grapes.map((g) => <option key={g} value={g} />)}
      </datalist>
      <datalist id="region-suggestions">
        {props.options.regions.map((r) => <option key={r} value={r} />)}
      </datalist>
    </div>
  );
}

function Th({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <th style={{
      textAlign: "left", padding: "10px 14px",
      fontSize: 11, fontWeight: 600, color: ADM.inkSoft,
      letterSpacing: 0.6, textTransform: "uppercase",
      ...style,
    }}>{children}</th>
  );
}

function parseAbvInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function WineRowEditor(props: {
  row: WineRow;
  options: AutocompleteOptions;
  pending: boolean;
  alt: boolean;
  onCommit: (wineId: string, field: "grape" | "region" | "abv", value: string | number | null) => void;
}) {
  const { row, pending } = props;
  const incomplete = row.grape == null || row.region == null || row.abv == null;
  return (
    <tr style={{
      background: pending
        ? ADM.goldWash
        : props.alt ? ADM.panel : ADM.white,
      borderBottom: `1px solid ${ADM.lineSoft}`,
      opacity: pending ? 0.7 : 1,
      transition: "opacity 0.15s",
    }}>
      <td style={cellStyle}>{row.name}</td>
      <td style={{ ...cellStyle, color: ADM.inkSoft }}>{row.producer ?? "-"}</td>
      <td style={cellStyle}>{row.type}</td>
      <td style={cellStyle}>{row.vintage ?? "-"}</td>
      <td style={cellStyle}>
        <TextCellInput
          defaultValue={row.grape ?? ""}
          listId="grape-suggestions"
          placeholder="es. Glera, Corvina"
          onCommit={(v) => {
            if ((row.grape ?? "") !== v) props.onCommit(row.id, "grape", v || null);
          }}
        />
      </td>
      <td style={cellStyle}>
        <TextCellInput
          defaultValue={row.region ?? ""}
          listId="region-suggestions"
          placeholder="es. Valpolicella, Soave"
          onCommit={(v) => {
            if ((row.region ?? "") !== v) props.onCommit(row.id, "region", v || null);
          }}
        />
      </td>
      <td style={cellStyle}>
        <AbvCellInput
          defaultValue={row.abv}
          onCommit={(n) => {
            if (row.abv !== n) props.onCommit(row.id, "abv", n);
          }}
        />
      </td>
      <td style={{ ...cellStyle, textAlign: "center" }}>
        <StatusBadge incomplete={incomplete} />
      </td>
    </tr>
  );
}

const cellStyle: CSSProperties = {
  padding: "8px 14px",
  verticalAlign: "middle",
};

function TextCellInput(props: {
  defaultValue: string;
  listId: string;
  placeholder: string;
  onCommit: (value: string) => void;
}) {
  return (
    <input
      type="text"
      list={props.listId}
      defaultValue={props.defaultValue}
      placeholder={props.placeholder}
      onBlur={(e) => props.onCommit(e.currentTarget.value.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = props.defaultValue;
          e.currentTarget.blur();
        }
      }}
      style={{
        width: "100%", boxSizing: "border-box",
        padding: "6px 8px", borderRadius: 4,
        border: `1px solid ${ADM.line}`, background: ADM.white,
        fontFamily: ADM.sans, fontSize: 13, color: ADM.ink,
        outline: "none",
      }}
    />
  );
}

function AbvCellInput(props: {
  defaultValue: number | null;
  onCommit: (value: number | null) => void;
}) {
  return (
    <input
      type="number"
      step="0.1"
      min="0"
      max="20"
      defaultValue={props.defaultValue ?? ""}
      placeholder="-"
      onBlur={(e) => props.onCommit(parseAbvInput(e.currentTarget.value))}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = props.defaultValue?.toString() ?? "";
          e.currentTarget.blur();
        }
      }}
      style={{
        width: "100%", boxSizing: "border-box",
        padding: "6px 8px", borderRadius: 4,
        border: `1px solid ${ADM.line}`, background: ADM.white,
        fontFamily: ADM.sans, fontSize: 13, color: ADM.ink,
        outline: "none",
      }}
    />
  );
}

function StatusBadge({ incomplete }: { incomplete: boolean }) {
  if (incomplete) {
    return (
      <span title="Da popolare" style={{
        display: "inline-block", width: 18, height: 18, borderRadius: 999,
        background: ADM.carmineWash, color: ADM.carmine,
        textAlign: "center", lineHeight: "18px", fontSize: 11, fontWeight: 700,
      }}>●</span>
    );
  }
  return (
    <span title="Completo" style={{
      display: "inline-block", width: 18, height: 18, borderRadius: 999,
      background: ADM.greenWash, color: ADM.green,
      textAlign: "center", lineHeight: "18px", fontSize: 11, fontWeight: 700,
    }}>✓</span>
  );
}
```

- [ ] **Step 7.2: Verifica `pnpm typecheck` + `pnpm lint`**

```bash
cd "D:/Dev/Progetti/Enopera-Admin"; pnpm typecheck; pnpm lint
```
Expected: zero errori/warning.

- [ ] **Step 7.3: Commit unico (page + viniList + 2 task atomico)**

```bash
git -C "D:/Dev/Progetti/Enopera-Admin" add "app/(admin)/vini" components/admin/vini-list.tsx
git -C "D:/Dev/Progetti/Enopera-Admin" commit -m "$(cat <<'EOF'
feat(admin): /vini section with inline-edit table

Server component loads all active wines + autocomplete options via
service-role client. Client component renders sticky-header table
with optimistic single-field updates (useState + useTransition,
explicit rollback on error). Sort default puts incomplete rows on
top; counter shows "X di 829 da popolare".

Editing: grape/region are text inputs with HTML5 datalist
autocomplete from distinct values already in use. Gradazione is
type=number with step 0.1, range 0-20. Empty input -> null
(reverts to "incomplete"). Pending rows visually dim (opacity 0.7
+ gold tint). Errors toast carmine + auto-rollback.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 3: Build & verify Admin, push

### Task 8: Verifica completa Admin + push

**Outcome:** `pnpm build` passa, sidebar visivamente ok, pagina `/vini` funzionante in dev mode, commit pushati su `main` (auto-deploy Vercel).

- [ ] **Step 8.1: Build completa**

```bash
cd "D:/Dev/Progetti/Enopera-Admin"; pnpm build 2>&1 | tail -25
```
Expected: ends with `Compiled successfully`. Se errori, ferma e diagnosticali - non procedere oltre.

- [ ] **Step 8.2: Smoke locale dev mode**

```bash
cd "D:/Dev/Progetti/Enopera-Admin"; pnpm dev
```
In browser su `http://localhost:3000`:
1. Login admin
2. Verifica che la sidebar mostri "Vini" come 5ª voce con icona bottiglia
3. Click → tabella si carica con 829 righe (≤2s)
4. Controlla che ~20 vini abbiano badge `✓` (i venetoWines del seed) e ~809 abbiano `●` carmine
5. Toolbar header mostri "809 di 829 da popolare" (o numero analogo)
6. Filtro "Solo da popolare" filtra a ~809; "Solo completi" filtra a ~20
7. Search "amarone" filtra a 1-2 righe
8. Filtro produttore mostra dropdown con tutti i produttori
9. **Edit live**: click su cella Vitigno di un vino non popolato (es. "Allegrini Amarone"), digita "Corvina · Rondinella", Tab fuori → cella aggiornata, badge resta `●` (manca ancora region+abv)
10. Aggiungi anche region e abv → badge passa a `✓`, riga si sposta in fondo (sort dinamico)
11. F5 → modifiche persistite
12. Test errore: stop il dev server. Riavvia con env `SUPABASE_SERVICE_ROLE_KEY` errata - in PowerShell `$env:SUPABASE_SERVICE_ROLE_KEY="invalid"; pnpm dev`, in bash `SUPABASE_SERVICE_ROLE_KEY=invalid pnpm dev`. Prova a editare una cella → toast rosso "Salvataggio fallito: ..." e cella torna al valore precedente. Ripristina l'env originale e riavvia il dev server.

Ferma il dev server (`Ctrl+C`).

- [ ] **Step 8.3: Push su `main` (auto-deploy)**

```bash
git -C "D:/Dev/Progetti/Enopera-Admin" push origin main
```
Expected: 5 commit pushati nell'ordine - `docs(claudemd): document sync StartyERP guard rail invariant` (Task 1), `feat(wines): server-only query layer for admin` (Task 2), `feat(wines): server action updateWineMetadata` (Task 3), `feat(admin): add 'vini' nav entry to sidebar` (Task 4), `feat(admin): /vini section with inline-edit table` (Tasks 5+6+7 combinati). Vercel triggera build automatica.

- [ ] **Step 8.4: Verifica deploy Vercel**

Apri Vercel dashboard del progetto Enopera-Admin. Aspetta che il build sia `Ready` (~1-2 min). Visita l'URL prod, login, `/vini`, verifica che la tabella si carichi con i dati reali. Se il deploy fallisce o la pagina ha errori 500 in prod, controlla i logs runtime Vercel (`Functions` → `Logs`) - di solito è env var mancante.

---

## Chunk 4: Flutter consumer (model + repo + provider + screen)

### Task 9: Model nullable refactor

**Outcome:** `Wine.region`, `Wine.abv`, `Wine.grape` sono nullable; `mock_data` continua a compilare; `flutter analyze` zero issue (i 4 call site che li usano sono ancora non-aggiornati: diventeranno issue temporanei al prossimo step).

**Files:**
- Modify: `lib/data/models.dart:28-54`

- [ ] **Step 9.1: Apri `models.dart` e cambia i 3 campi a nullable**

In `D:\Dev\Progetti\enopera_portal\lib\data\models.dart`, sostituisci la classe `Wine` (linee 28-54):

```dart
class Wine {
  final String id;
  final String name;
  final String producer;
  final WineType type;
  final String? region;
  final int year;
  final double? abv;
  final String? grape;
  final double price;
  final String notes;
  final String pairing;

  const Wine({
    required this.id,
    required this.name,
    required this.producer,
    required this.type,
    this.region,
    required this.year,
    this.abv,
    this.grape,
    required this.price,
    required this.notes,
    required this.pairing,
  });
}
```

- [ ] **Step 9.2: Esegui flutter analyze e censisci gli errori**

```bash
cd "D:/Dev/Progetti/enopera_portal"; flutter analyze 2>&1 | tail -30
```
Expected: 4-6 errori "The argument type 'String?' can't be assigned to ...", localizzati in `catalogo_screen.dart` (3-4 occorrenze) e `dettaglio_ordine_screen.dart` (1-2). NON committare ancora - risolviamo al task 12.

### Task 10: Repository - `lib/data/supabase_catalog.dart`

**Outcome:** Esiste `fetchCatalogFromDb()` che chiama l'RPC e ritorna `List<Wine>` ben tipizzato. Compila standalone.

**Files:**
- Create: `lib/data/supabase_catalog.dart`

- [ ] **Step 10.1: Crea il file**

`D:\Dev\Progetti\enopera_portal\lib\data\supabase_catalog.dart`:

```dart
import 'package:supabase_flutter/supabase_flutter.dart';
import 'models.dart';

/// Carica il catalogo per l'utente loggato chiamando l'RPC
/// `catalog_for_current_user`, che applica il listino corretto in
/// base al ristorante associato al profilo.
///
/// Ritorna lista vuota se l'utente non è loggato o non ha un listino
/// assegnato (l'RPC ritorna 0 righe in entrambi i casi).
Future<List<Wine>> fetchCatalogFromDb() async {
  final raw = await Supabase.instance.client.rpc('catalog_for_current_user');
  final rows = (raw as List).cast<dynamic>();
  return rows
      .map<Wine>((r) {
        final m = r as Map<String, dynamic>;
        return Wine(
          id:       m['wine_id'] as String,
          name:     (m['name'] as String?) ?? '-',
          producer: (m['producer'] as String?) ?? '-',
          type:     _mapType(m['type'] as String?),
          region:   m['region'] as String?,
          year:     (m['vintage'] as int?) ?? 0,
          abv:      (m['abv'] as num?)?.toDouble(),
          grape:    m['grape'] as String?,
          price:    (m['price'] as num?)?.toDouble() ?? 0,
          notes:    (m['notes'] as String?) ?? '',
          pairing:  (m['pairing'] as String?) ?? '',
        );
      })
      .toList(growable: false);
}

WineType _mapType(String? s) {
  switch (s) {
    case 'Rosso':  return WineType.rosso;
    case 'Bianco': return WineType.bianco;
    case 'Bolle':  return WineType.bolle;
    case 'Rosato': return WineType.rosato;
    default:       return WineType.rosso;
  }
}
```

- [ ] **Step 10.2: Verifica con flutter analyze (in isolamento)**

```bash
cd "D:/Dev/Progetti/enopera_portal"; flutter analyze lib/data/supabase_catalog.dart
```
Expected: zero issue. Se errore "Target of URI doesn't exist" su `supabase_flutter`, verifica che il pacchetto sia in `pubspec.yaml` (è già lì secondo `CLAUDE.md`).

### Task 11: Provider `catalogProvider`

**Outcome:** `lib/state/app_state.dart` esporta `catalogProvider = FutureProvider<List<Wine>>`.

**Files:**
- Modify: `lib/state/app_state.dart` (aggiunta in coda alla sezione provider)

- [ ] **Step 11.1: Aggiungi l'import del repository**

In testa al file `D:\Dev\Progetti\enopera_portal\lib\state\app_state.dart`, dopo `import '../data/order_storage.dart';`, aggiungi:

```dart
import '../data/supabase_catalog.dart';
```

- [ ] **Step 11.2: Aggiungi `catalogProvider`**

In fondo al file (dopo `orderTotalProvider`), aggiungi:

```dart
/// Catalogo vini caricato da Supabase via RPC catalog_for_current_user.
/// Usa AsyncValue.when() nello schermata Catalogo per gestire loading/error.
final catalogProvider = FutureProvider<List<Wine>>((ref) async {
  return fetchCatalogFromDb();
});
```

- [ ] **Step 11.3: Verifica `flutter analyze`** (errori del task 9 ancora presenti, niente di nuovo)

```bash
cd "D:/Dev/Progetti/enopera_portal"; flutter analyze 2>&1 | tail -20
```
Expected: stessi 4-6 errori del task 9, niente in più. Se compaiono nuovi errori in `app_state.dart`, leggi con attenzione il messaggio prima di procedere.

### Task 12: Refactor `CatalogoScreen` con AsyncValue + N/A

**Outcome:** `CatalogoScreen` consuma `catalogProvider` con loading/error/data states; search filter nullable-safe; 3 `_DetailField` e l'header chip mostrano "N/A" sui campi null. `flutter analyze` zero issue. `dettaglio_ordine_screen.dart` continua a compilare (usa solo campi non-null come `wine.name`, `wine.price`).

**Files:**
- Modify: `lib/screens/catalogo_screen.dart`

- [ ] **Step 12.1: Rimuovi import non più necessario**

In testa a `D:\Dev\Progetti\enopera_portal\lib\screens\catalogo_screen.dart`, rimuovi:

```dart
import '../data/mock_data.dart';
```

(viene rimpiazzato dal provider).

- [ ] **Step 12.2: Rifai il `build` del `CatalogoScreen`**

Sostituisci il metodo `build` (linee 17-86):

```dart
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncCatalog = ref.watch(catalogProvider);
    return asyncCatalog.when(
      data: (wines) => _buildLoaded(context, ref, wines),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, _) => _ErrorPanel(
        message: '$err',
        onRetry: () => ref.invalidate(catalogProvider),
      ),
    );
  }

  Widget _buildLoaded(BuildContext context, WidgetRef ref, List<Wine> wines) {
    final query = ref.watch(queryProvider);
    final filter = ref.watch(filterProvider);
    final expanded = ref.watch(expandedWineProvider);

    final filtered = wines.where((w) {
      final q = query.trim().toLowerCase();
      final byQuery = q.isEmpty ||
          w.name.toLowerCase().contains(q) ||
          w.producer.toLowerCase().contains(q) ||
          (w.region?.toLowerCase().contains(q) ?? false) ||
          (w.grape?.toLowerCase().contains(q) ?? false);
      final byFilter = filter == 'Tutti' || w.type.label == filter;
      return byQuery && byFilter;
    }).toList();

    return Column(
      children: [
        _Header(count: wines.length),
        Padding(
          padding: const EdgeInsets.fromLTRB(22, 0, 22, 14),
          child: Column(
            children: [
              _SearchBar(
                value: query,
                onChanged: (v) => ref.read(queryProvider.notifier).state = v,
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 34,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: _filters.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 6),
                  itemBuilder: (context, i) {
                    final name = _filters[i];
                    return _FilterChip(
                      label: name,
                      active: filter == name,
                      onTap: () =>
                          ref.read(filterProvider.notifier).state = name,
                    );
                  },
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 40),
            itemCount: filtered.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, i) {
              final w = filtered[i];
              return _WineCatalogCard(
                wine: w,
                expanded: expanded == w.id,
                onToggle: () {
                  ref.read(expandedWineProvider.notifier).state =
                      expanded == w.id ? null : w.id;
                },
              );
            },
          ),
        ),
      ],
    );
  }
```

- [ ] **Step 12.3: Aggiorna `_Header` per ricevere il count**

Sostituisci la classe `_Header` (intorno a linea 89):

```dart
class _Header extends StatelessWidget {
  final int count;
  const _Header({required this.count});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(22, 24, 22, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$count VINI DEL CATALOGO', style: AppTextStyles.eyebrow()),
          const SizedBox(height: 6),
          Text('Catalogo Enopera',
              style: Theme.of(context).textTheme.displayLarge),
        ],
      ),
    );
  }
}
```

- [ ] **Step 12.4: N/A nel chip collapsed**

Trova nel `_WineCatalogCard` la `Text` con `'${wine.region} · ${wine.year}'` (intorno a linea 310):

```dart
Text(
  '${wine.region ?? 'N/A'} · ${wine.year}',
  ...
),
```

- [ ] **Step 12.5: N/A nei 3 `_DetailField` espansi**

Trova nel `_ExpandedDetail` i due `Row` con i `_DetailField` (intorno a linee 487-503), sostituisci:

```dart
Row(
  children: [
    Expanded(child: _DetailField('VITIGNO', wine.grape ?? 'N/A')),
    const SizedBox(width: 12),
    Expanded(
      child: _DetailField(
        'GRADAZIONE',
        wine.abv == null ? 'N/A' : '${wine.abv}% vol.',
      ),
    ),
  ],
),
const SizedBox(height: 12),
Row(
  children: [
    Expanded(child: _DetailField('REGIONE', wine.region ?? 'N/A')),
    const SizedBox(width: 12),
    Expanded(child: _DetailField('ANNATA', '${wine.year}')),
  ],
),
```

- [ ] **Step 12.6: Aggiungi `_ErrorPanel`**

In fondo al file (dopo `_AddToCellarButton`), aggiungi:

```dart
class _ErrorPanel extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorPanel({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.cloud_off_outlined, color: AppColors.inkMuted, size: 36),
          const SizedBox(height: 12),
          Text(
            'Catalogo non disponibile',
            style: GoogleFonts.cormorantGaramond(
              fontSize: 22, color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style: GoogleFonts.dmSans(
              fontSize: 12, color: AppColors.inkMuted,
            ),
          ),
          const SizedBox(height: 18),
          OutlinedButton(
            onPressed: onRetry,
            child: Text('Riprova',
                style: GoogleFonts.dmSans(fontSize: 13, color: AppColors.primary)),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 12.7: Verifica `flutter analyze` zero issue**

```bash
cd "D:/Dev/Progetti/enopera_portal"; flutter analyze
```
Expected: `No issues found!`. Se ci sono errori, leggili e risolvi prima di procedere.

- [ ] **Step 12.8: Commit**

```bash
git -C "D:/Dev/Progetti/enopera_portal" add lib/data/models.dart lib/data/supabase_catalog.dart lib/state/app_state.dart lib/screens/catalogo_screen.dart
git -C "D:/Dev/Progetti/enopera_portal" commit -m "$(cat <<'EOF'
feat(catalog): switch from mock to DB via catalog_for_current_user RPC

Wine.region/abv/grape become nullable since the DB has 800+ rows with
these fields still NULL (StartyERP doesn't expose them - they'll be
populated via the new admin /vini section).

CatalogoScreen now uses ref.watch(catalogProvider).when() with proper
loading/error states. Search filter handles nullable region/grape
safely. Expanded detail panel shows "N/A" for missing values instead
of crashing or inventing fallbacks.

Known gap (separate task): cantinaLinesProvider and dettaglio_ordine
still call wineById() from mock_data - for existing users with cached
mock-id inventory the Cantina/Storico will appear empty after this
change. Documented in spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 5: Build & verify Flutter (APK release + smoke)

### Task 13: Build APK release e smoke device

**Outcome:** APK release installato su device fisico/emulatore, login utente test, catalogo carica da DB con N/A visibile sui vini non popolati.

**Pre-requisito:** un account utente test esistente (vedi memory `S835` - l'utente Osteria Metti è già creato).

- [ ] **Step 13.1: Build APK release**

```bash
cd "D:/Dev/Progetti/enopera_portal"; flutter build apk --release 2>&1 | tail -15
```
Expected: `√ Built build\app\outputs\flutter-apk\app-release.apk (~52MB)`. Se errore di build, NON procedere.

- [ ] **Step 13.2: Installa l'APK sul device**

Connetti il device (USB o emulatore avviato), poi:

```bash
cd "D:/Dev/Progetti/enopera_portal"; flutter install --release
```
Oppure manualmente: trasferisci `build/app/outputs/flutter-apk/app-release.apk` sul device, installa.

- [ ] **Step 13.3: Smoke test**

Apri l'app sul device:

1. Login con account utente test (es. Osteria Metti)
2. Tab "Catalogo" → spinner breve → lista vini reali (numero >> 20)
3. Header dovrebbe mostrare "X VINI DEL CATALOGO" con X = numero totale (depends on listino utente, probabilmente 200-800)
4. Scrolla - verifica che vini reali StartyERP appaiano (nomi tipo "AMARONE...", "PROSECCO...", produttori reali come "ALLEGRINI", "ZONIN" ecc.)
5. Tap su un vino non popolato → expand → verifica i 3 detail fields:
   - VITIGNO: `N/A`
   - GRADAZIONE: `N/A`
   - REGIONE: `N/A`
   - ANNATA: il valore reale (vintage da Starty)
6. Header chip collapsed di quel vino: `N/A · 2022` (o anno reale)
7. Tap su un vino popolato dall'admin (uno dei 20 originali o uno che hai aggiornato in Step 8.2 → 9): expand → i 3 fields hanno valori reali, niente N/A
8. Search "soave" → filtra correttamente
9. Filtro "Bianco" → mostra solo bianchi
10. Test errore di rete: attiva modalità aereo, kill app, riapri → tab Catalogo mostra error panel "Catalogo non disponibile" + bottone "Riprova". Disattiva aereo, tap Riprova → carica.
11. **Cantina**: tab Cantina sarà vuota (gap noto documentato) - verifica che non crashi, semplicemente non mostri nessuna riga.
12. **Storico ordini**: tab Profilo → Storico → apri un ordine vecchio (se l'utente test ne ha) → verifica che la pagina non crashi, anche se le righe wine sono vuote.

- [ ] **Step 13.4: Solo commit locale (no remote - vedi `feedback_push_freely.md`)**

Il repo Flutter è locale, non c'è un remote da pushare. Il commit del task 12 è già nel local `main`.

```bash
git -C "D:/Dev/Progetti/enopera_portal" log --oneline -3
```
Expected: in cima il commit `feat(catalog): switch from mock to DB ...`.

---

## Chunk 6: Final verification + documentazione release

### Task 14: Note release + closing

**Outcome:** Modifiche pushate live (admin lato Vercel + APK Flutter manuale), CLAUDE.md aggiornati con riferimento allo stato post-implementation.

- [ ] **Step 14.1: Verifica deploy Vercel admin completato**

Apri Vercel dashboard. Status `Ready` sull'ultimo deploy. Visita prod URL `/vini` → tabella carica e funziona come in dev mode.

- [ ] **Step 14.2: Aggiorna `CLAUDE.md` di Enopera-Admin con sezione "Vini"**

Apri `D:\Dev\Progetti\Enopera-Admin\CLAUDE.md`. Trova la sezione del Task 1 ("## Sync StartyERP - invariante critico"). Inserisci la nuova sezione **subito sopra** quella (così sync e vini stanno vicini, dato che il primo serve il secondo):

```markdown
## Vini (anagrafica catalogo)

- **Pagina**: `/vini` - server component carica tutti i ~829 vini attivi + valori distinct per autocomplete
- **Editing**: inline table, 3 colonne (vitigno, regione, gradazione) con optimistic update via `useState`+`useTransition`
- **Auth**: `requireAdmin()` nel layout + secondo gate dentro `updateWineMetadata` server action
- **Sorgente dati**: `lib/wines/queries.ts` (read) + `lib/wines/actions.ts` (write) - entrambi `createAdminClient` (service-role)
- **Sync StartyERP**: vedi sezione qui sotto. I 3 campi sono OUT del payload `wineRows.map(...)` per design; non aggiungere mai grape/region/abv/notes/pairing al sync.

```

- [ ] **Step 14.3: Aggiorna `CLAUDE.md` di enopera_portal** (sezione "Stato pendente")

Apri `D:\Dev\Progetti\enopera_portal\CLAUDE.md`. Sposta dalla sezione "Stato pendente" alla sezione "Pagine implementate":

Cambia:
```
| Catalogo | ⚠️ Mock locale (20 vini Veneto) - da migrare a DB |
```
in:
```
| Catalogo | ✅ Da Supabase via RPC `catalog_for_current_user`, N/A su campi nulli |
```

E rimuovi/sposta da "Stato pendente":
```
- ⏳ Catalogo: switch a `public.wines` invece del mock
```

Aggiungi a "Stato pendente":
```
- ⏳ Wire `cantinaLinesProvider` e `dettaglio_ordine_screen` al DB (gap noto del task /vini - oggi usano ancora wineById() dal mock). Inventario cached con id-mock w01..w20 va migrato a UUID DB.
```

- [ ] **Step 14.4: Commit doc updates su entrambi i repo**

```bash
git -C "D:/Dev/Progetti/Enopera-Admin" add CLAUDE.md
git -C "D:/Dev/Progetti/Enopera-Admin" commit -m "$(cat <<'EOF'
docs(claudemd): document /vini section + sync invariant

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git -C "D:/Dev/Progetti/enopera_portal" add CLAUDE.md
git -C "D:/Dev/Progetti/enopera_portal" commit -m "$(cat <<'EOF'
docs(claudemd): catalog now from DB; cantina/storico wiring noted as next

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 14.5: Push admin (Flutter resta locale)**

```bash
git -C "D:/Dev/Progetti/Enopera-Admin" push origin main
```
Expected: 1 commit pushato.

- [ ] **Step 14.6: Closing summary all'utente**

Riporta:
- Numero commit Admin (~6) + Flutter (~2)
- URL Vercel di prod admin
- Path APK release Flutter (solo se diverso dal default `<worktree>/build/app/outputs/flutter-apk/app-release.apk` - vedi `feedback_apk_build_path.md`)
- Gap noto: cantina + storico ordini vuoti per utenti esistenti - da risolvere nel prossimo task `wire-inventory-and-orders-to-db`

---

## Notes for execution

- **Ordine dei task**: Chunk 0 → Chunk 1 → Chunk 2 → Chunk 3 (admin), poi Chunk 4 → Chunk 5 (Flutter) sono indipendenti dall'admin lato runtime (parlano direttamente al DB), ma rischiano di mostrare ancora N/A ovunque se l'admin non ha popolato vini dopo il deploy. **Suggerimento**: dopo Step 8.2 popola almeno 5-10 vini reali a mano in dev mode, così il smoke Flutter al Task 13 mostra mix di N/A e valori reali.
- **Rollback strategy**: se qualcosa va male e devi rollback, il sync Starty notturno rimette tutti i 800+ vini (anagrafica). I 3 campi grape/region/abv NON vengono toccati dal sync - quindi sono persi solo se fai `UPDATE wines SET grape=NULL, region=NULL, abv=NULL`. Niente migration DDL = niente rischio strutturale.
- **Niente test framework**: la pipeline è `pnpm typecheck` + `pnpm build` + smoke manuale per admin; `flutter analyze` + build APK + smoke device per Flutter. Se aggiungi test in futuro, target naturale: server action `updateWineMetadata` (Zod boundary cases), `parseAbvInput` (unit), `_mapType` Flutter (unit).
- **Shell**: tutti i blocchi ```bash sono pensati per il Bash tool (HEREDOC `cat <<'EOF'`, chain con `;` e `|`, `$(...)` substitution). I blocchi ```powershell vanno passati al PowerShell tool. Se usi il PowerShell tool per un blocco bash, il comando fallirà - usa lo shell corretto.
- **Follow-up out of scope** (dopo questo plan):
  - Importare nel repo il source TypeScript di `sync-starty-catalog` (oggi deployato server-side ma non tracciato - vedi "Drift repo / produzione" in cima).
  - Wire `cantinaLinesProvider` e `dettaglio_ordine_screen` al DB (sostituire `wineById()` da mock con lookup DB).
  - Cleanup di `supabase/functions/sync-products/` (bozza dead code).
