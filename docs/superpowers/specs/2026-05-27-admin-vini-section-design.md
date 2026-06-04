# Admin sezione "Vini" + Flutter N/A - Design

**Status**: Draft, awaiting review
**Date**: 2026-05-27
**Author**: brainstormed con utente, scritto da Claude
**Projects**: Enopera-Admin (Next.js 15 + Supabase) + Enopera Portal (Flutter)

## Problem statement

La tabella `public.wines` contiene 829 vini sincronizzati ogni notte da StartyERP via Edge Function `sync-starty-catalog`. Tre attributi commerciali essenziali per il consumer - **vitigno** (`grape`), **regione/denominazione** (`region`) e **gradazione alcolica** (`abv`) - esistono già come colonne nullable nello schema, ma sono popolati solo per i 20 vini Veneto del seed iniziale. I rimanenti 809 vini (98% del catalogo) hanno questi campi a `NULL`, perché StartyERP PIM non li espone nelle API che lo sync legge.

Lato app Flutter consumer, il `CatalogoScreen` oggi legge da un mock locale (`venetoWines`) di 20 vini con tutti i campi popolati - quindi l'utente B2B non vede mai una scheda incompleta, ma non vede neanche i 809 vini reali del catalogo.

Servono due cose congiunte:

1. Un'interfaccia admin per **popolare a mano** vitigno/regione/gradazione sui 829 vini, in modo che StartyERP fornisca le informazioni operative (anagrafica, prezzi, stock) e l'admin curi gli attributi PIM mancanti.
2. Lo **switch del catalogo Flutter** dal mock alla sorgente DB reale (RPC `catalog_for_current_user`), con visualizzazione esplicita "N/A" per i campi mancanti finché l'admin non li popola.

## Goals

- Nuova pagina `/vini` nell'admin (6ª voce sidebar) con tabella di tutti i vini e editing inline dei 3 campi
- Workflow ottimizzato per popolare i 809 vini mancanti: badge "incompleto", sort default che li mette in cima, filtro "Solo da popolare"
- Autocomplete intelligente per Vitigno/Regione basato sui valori già in uso (evita typo e proliferazione di varianti)
- Salvataggio optimistic con rollback su errore di rete (UX fluida per data entry massivo)
- Switch del catalogo Flutter da mock locale a RPC `catalog_for_current_user`, già esistente in DB ed esposto correttamente
- Visualizzazione "N/A" esplicita nelle schede vino Flutter per i campi nulli, senza fallback inventati
- Sync StartyERP che continua a NON sovrascrivere i campi curati dall'admin (oggi è già il caso; va documentato come invariante)

## Non-goals (v1)

- **Bulk edit** (selezione multipla → applica vitigno X a N vini) - fuori scope, single-row editing è sufficiente
- **Import CSV/XLSX** nell'admin - fuori scope, popolazione manuale via UI è il workflow target
- **Versioning/history** delle modifiche admin - niente audit log su questi campi
- **Editing degli altri campi** della tabella `wines` (nome, prezzo, vintage, code) - quelli sono di Starty, l'admin solo legge
- **Picklist tassonomica strutturata** per vitigno o regione (es. anagrafica vitigni master) - testo libero con autocomplete è la scelta deliberata
- **Multi-valore strutturato per vitigno** (blend come array invece che stringa con separatore ` · `) - manteniamo la convenzione testuale corrente
- **Wire dell'inventario Flutter al DB** - il `CatalogoScreen` passa al DB ma `inventoryProvider` resta su `SharedPreferences`; sarà task separato
- **Notifiche / progress tracking** della copertura ("80% dei vini sono completi") - solo conteggio raw `X di 829 da popolare`
- **Permission granulari** (admin che possono scrivere solo certi produttori) - qualsiasi admin loggato può scrivere su qualsiasi vino

## Architecture overview

### Schema DB

**Nessuna migration**. Le colonne sono già presenti in `public.wines`:

```sql
-- estratto dello schema corrente
region  text NULL
grape   text NULL
abv     numeric NULL
```

Per i 20 vini Veneto del seed sono popolati; per i restanti 809 sono `NULL`. Non si tocca nulla a livello DDL.

### Sync StartyERP - invariante documentale

L'Edge Function `sync-starty-catalog` fa UPSERT sulla tabella `wines` con `onConflict: "starty_product_id"`. Il payload include esclusivamente colonne anagrafiche/operative: `starty_product_id, code, sku, upc, name, producer, type, vintage, uom_id, units_per_package, is_stocked, lot_managed, is_sold, active, last_synced_at`.

Per costruzione del comportamento `.upsert()` di Supabase (PostgreSQL `ON CONFLICT DO UPDATE SET col1=EXCLUDED.col1, col2=EXCLUDED.col2, ...` solo sui campi presenti nel payload), le colonne `grape/region/abv/notes/pairing` NON vengono mai aggiornate dal sync. I valori curati dall'admin sono preservati automaticamente.

Per blindare l'invariante contro modifiche future allo sync, si aggiunge un commento di guard rail sopra il blocco `wineRows.map(...)`:

```ts
// IMPORTANTE: NON aggiungere grape/region/abv/notes/pairing a questo
// payload. Sono curati a mano dall'admin nella pagina /vini (Enopera-Admin).
// L'upsert by-omission li preserva - includerli qui li azzererebbe per
// gli 800+ vini popolati dall'admin al primo sync notturno.
```

Nessuna modifica funzionale all'Edge Function.

### Auth/autorizzazione

Riuso del meccanismo `requireAdmin()` esistente (iron-session + env `ADMIN_CREDENTIALS`).

- Gate nel layout `(admin)/layout.tsx` già copre `/vini` (auth a livello di route)
- Secondo gate dentro la server action `updateWineMetadata` (defense in depth: la action può essere chiamata da qualsiasi origine, non solo dalla pagina)
- Niente RLS speciali sulla tabella `wines`: la server action usa il client admin (service-role) come tutte le altre scritture admin

### Prior art da ignorare

Esistono nei worktree locali (`.claude/worktrees/inspiring-varahamihira-c60960/` e `.claude/worktrees/magical-swirles-29bdf2/`) esplorazioni precedenti del catalogo Flutter via DB, con shape di file diverse (es. classe `SupabaseCatalogRepo`). **Questo task non riusa quel codice**: l'implementazione parte da zero seguendo le specifiche di questo documento (top-level function `fetchCatalogFromDb()` in `lib/data/supabase_catalog.dart`). I worktree restano intatti come riferimento storico ma non vanno mergeati.

## Components (Admin)

### Pagina `app/(admin)/vini/page.tsx` - server component

```tsx
export const dynamic = "force-dynamic";

export default async function ViniPage() {
  const [crumb, sub] = PAGE_LABELS.vini;
  const [wines, options] = await Promise.all([
    listWinesForAdmin(),
    listGrapeRegionOptions(),
  ]);
  return (
    <AdmShell active="vini" crumb={crumb} sub={sub}>
      <ViniList wines={wines} options={options} />
    </AdmShell>
  );
}
```

Pattern identico a `listini/page.tsx`. Niente paginazione lato server: i 829 record sono ~80KB di payload, trasferibili in un colpo senza problemi.

Error handling allineato a `listini/page.tsx` (try/catch + card carminio).

### Sidebar - due file da aggiornare

#### `components/admin/nav.ts` (mapping label / breadcrumb)

Aggiunta `"vini"` come 6° PageId:

```ts
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

#### `components/admin/shell.tsx` (rendering visivo della sidebar e bottom-nav)

`NAV_ITEMS` (riga 15-20 nel file attuale) è la lista delle voci effettivamente renderizzate. Oggi contiene `ordini, ristoranti, listini, utenti` - 4 voci (manca volutamente `cantine`, che resta una route accessibile via URL ma non in sidebar). Aggiungiamo `vini` come 5ª voce visibile, dopo `utenti`:

```ts
const NAV_ITEMS: { id: PageId; label: string; icon: () => ReactNode }[] = [
  { id: "ordini",     label: "Ordini",     icon: () => AdmIcons.package(16) },
  { id: "ristoranti", label: "Ristoranti", icon: () => AdmIcons.store(16) },
  { id: "listini",    label: "Listini",    icon: () => AdmIcons.tag(16) },
  { id: "utenti",     label: "Utenti",     icon: () => AdmIcons.user(16) },
  { id: "vini",       label: "Vini",       icon: () => AdmIcons.bottle(16) },
];
```

L'icona `AdmIcons.bottle` esiste già in `lib/admin/icons.tsx:28` - perfetta per la voce vini. Nessuna nuova icona da creare.

### Query layer - `lib/wines/queries.ts`

Convenzione del repo (vedi `lib/price-lists/queries.ts:2`): usare `createAdminClient` da `@/lib/supabase/admin`, **non** `createServiceClient` da `@/lib/supabase/server`. Entrambi sono service-role, ma `createAdminClient` è il pattern uniforme di tutte le admin queries esistenti.

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
  grapes: string[];   // distinct, sorted
  regions: string[];  // distinct, sorted
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

### Server action - `lib/wines/actions.ts`

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

**Conversione client-side dei valori input → wire format**:

| Input HTML | Valore raw da DOM | Conviato al server |
|---|---|---|
| `<input>` testo (grape/region) vuoto | `""` | `null` |
| `<input>` testo (grape/region) con caratteri | stringa trimmed | stringa trimmed (Zod fa trim) |
| `<input type="number">` (abv) vuoto | `""` o `NaN` da `valueAsNumber` | `null` |
| `<input type="number">` (abv) `15.5` | `15.5` da `valueAsNumber` | `15.5` |
| `<input type="number">` (abv) `99` | `99` da `valueAsNumber` | rigettato da Zod (max:20) → toast errore + rollback |

Helper client-side `parseAbvInput(value: string): number | null`:
```ts
function parseAbvInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}
```

Niente `revalidatePath`: la UI usa state locale, il client owna lo stato post-mutazione.

**Concorrenza**: la action è last-write-wins. Se due admin aprono la stessa riga e modificano lo stesso campo, vince l'ultimo che salva. Accettabile: nel workflow reale (popolazione iniziale da 1 operatore) è scenario remoto. Niente lock pessimistico, niente version field.

### Lista vini - `components/admin/vini-list.tsx` (client component)

**Stato locale gestito con `useState`, non `useOptimistic`.** `useOptimistic` di React 19 ripristina il valore solo quando il dato sottostante cambia per riconciliazione (es. dopo `revalidatePath` + RSC re-render). In questo task il dato sottostante è una prop statica server-passed, quindi su errore non ci sarebbe rollback automatico: la UX dell'optimistic update si gestisce direttamente con `useState` + try/catch (più semplice e corretto). Per rendere visibile la richiesta in-flight si usa `useTransition`.

```tsx
"use client";
import { useState, useTransition } from "react";
import { updateWineMetadata } from "@/lib/wines/actions";
import { ADM } from "@/lib/admin/tokens";

export function ViniList({ wines: initial, options }: Props) {
  const [wines, setWines] = useState(initial);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"incomplete" | "complete" | null>(null);
  const [filterProducer, setFilterProducer] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const filtered = filterAndSort(wines, { search, filterType, filterStatus, filterProducer });
  const incompleteCount = wines.filter(isIncomplete).length;

  function commitUpdate(wineId: string, fields: Partial<WineMetadata>) {
    const prev = wines;
    // Optimistic apply
    setWines((w) => w.map((r) => (r.id === wineId ? { ...r, ...fields } : r)));
    setPendingIds((s) => new Set(s).add(wineId));
    startTransition(async () => {
      try {
        await updateWineMetadata(wineId, fields);
      } catch (err) {
        // Rollback esplicito
        setWines(prev);
        showErrorToast((err as Error).message);
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
    <>
      <Toolbar
        search={search} onSearch={setSearch}
        filterType={filterType} onFilterType={setFilterType}
        filterStatus={filterStatus} onFilterStatus={setFilterStatus}
        filterProducer={filterProducer} onFilterProducer={setFilterProducer}
        incompleteCount={incompleteCount}
        totalCount={wines.length}
        producers={uniqueProducers(wines)}
      />
      <WineTable rows={filtered} options={options} pendingIds={pendingIds} onUpdate={commitUpdate} />
    </>
  );
}
```

Sort default: incompleti prima (`isIncomplete` = qualsiasi dei 3 campi `null`), poi alfabetico per produttore + nome.

**Visualizzazione `isPending`** sulla riga: quando `pendingIds.has(row.id)`, la riga riceve `opacity: 0.7` e un sottile bordo sinistro `ADM.gold`. Così l'admin che digita velocemente sa quale riga è in-flight. Su errore la riga torna allo stato pre-modifica e il toast spiega cosa è successo.

**Layout toolbar** (allineato a `listini-list.tsx`):
- Riga 1: search input (full width sinistra) + counter "X di 829 da popolare" (destra, color `ADM.inkSoft` 12px)
- Riga 2: chip filtro orizzontali - Tipo (Rosso/Bianco/Bolle/Rosato), Stato (Solo da popolare/Solo completi), Produttore (dropdown nativo `<select>`)

### Riga editabile

Ogni riga ha 4 celle di sola lettura (Nome, Produttore, Tipo, Annata) e 3 celle input perennemente renderizzate:

```tsx
<td>
  <input
    list="grape-suggestions"
    defaultValue={row.grape ?? ""}
    onBlur={(e) => maybeCommit(row.id, "grape", e.currentTarget.value)}
    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    placeholder="-"
    style={cellInputStyle}
  />
</td>
```

`<datalist id="grape-suggestions">` definito una volta sola in fondo al body con le `options.grapes`. Stessa logica per `region-suggestions`.

Per `abv`: `<input type="number" step="0.1" min="0" max="20">` con validazione browser nativa.

`maybeCommit` confronta il nuovo valore con il vecchio (normalizzando empty → null) e chiama `commitUpdate` solo se diverso, per evitare write spurie su blur senza modifiche.

**`key={row.id}` sulla `<tr>`**: indispensabile perché il sort default (incompleti in cima) riordina la lista dopo ogni save di successo che porta una riga da incompleto → completo. Senza key stabile, React riusa nodi DOM e gli input mantengono valori sbagliati per la riga sbagliata. Stesso motivo per `key={row.id + '-grape'}` sugli input se React Strict mode segnala warning di key duplicate.

**Definizione "riga completa"**: una riga è considerata completa quando tutti e 3 i campi `grape`, `region`, `abv` sono `non-null`. Se anche solo uno dei tre è `null` la riga è incompleta - badge `●` carmine. La funzione `isIncomplete(row): boolean` è single source of truth per badge, filtro e counter "X di 829 da popolare".

### Tokens / stili

Tutto inline con `ADM` tokens, niente Tailwind. Convenzioni allineate a `listini-list.tsx`:

- Header tabella: `background: ADM.panelAlt`, font `ADM.sans` 12px uppercase letter-spacing 0.8
- Righe: alternanza `ADM.panel` / `ADM.white`
- Celle input: `border: 1px solid ADM.line`, `background: ADM.white`, focus `border: 1px solid ADM.carmine`
- Badge stato: pill carmine (`●` `ADM.carmineWash` background, `ADM.carmine` color) per incompleto, pill verde (`✓` `ADM.greenWash` / `ADM.green`) per completo
- Barra "X di 829 da popolare" in alto a destra della toolbar: testo `ADM.inkSoft` 12px

## Components (Flutter)

### Modello `Wine` - `lib/data/models.dart`

Tre campi diventano nullable:

```dart
class Wine {
  final String id;
  final String name;
  final String producer;
  final WineType type;
  final String? region;     // era String
  final int year;
  final double? abv;        // era double
  final String? grape;      // era String
  final double price;
  final String notes;
  final String pairing;
  // ...
}
```

I 20 mock di `mock_data.dart` continuano a passare valori non-null (resta retrocompatibile per qualsiasi codice di test che ancora usi il mock).

### Sorgente catalogo da DB - `lib/data/supabase_catalog.dart` (nuovo)

```dart
import 'package:supabase_flutter/supabase_flutter.dart';
import 'models.dart';

Future<List<Wine>> fetchCatalogFromDb() async {
  final rows = await Supabase.instance.client.rpc('catalog_for_current_user') as List<dynamic>;
  return rows.map<Wine>((r) {
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
  }).toList();
}

WineType _mapType(String? s) {
  switch (s) {
    case 'Rosso': return WineType.rosso;
    case 'Bianco': return WineType.bianco;
    case 'Bolle': return WineType.bolle;
    case 'Rosato': return WineType.rosato;
    default: return WineType.rosso;
  }
}
```

### Provider - `lib/state/app_state.dart`

Nuovo:

```dart
final catalogProvider = FutureProvider<List<Wine>>((ref) async {
  return fetchCatalogFromDb();
});
```

### Schermata - `lib/screens/catalogo_screen.dart`

Sostituzione di `venetoWines` con `catalogProvider`:

```dart
@override
Widget build(BuildContext context, WidgetRef ref) {
  final asyncCatalog = ref.watch(catalogProvider);
  return asyncCatalog.when(
    data: (wines) => _buildList(context, ref, wines),
    loading: () => const Center(child: CircularProgressIndicator()),
    error: (err, _) => _ErrorCard(message: '$err', onRetry: () => ref.invalidate(catalogProvider)),
  );
}
```

Search filter aggiornato per nullable:

```dart
final byQuery = q.isEmpty ||
    w.name.toLowerCase().contains(q) ||
    w.producer.toLowerCase().contains(q) ||
    (w.region?.toLowerCase().contains(q) ?? false) ||
    (w.grape?.toLowerCase().contains(q) ?? false);
```

### Visualizzazione N/A

Nel `_WineCatalogCard` collapsed, riga regione/anno:

```dart
'${w.region ?? 'N/A'} · ${w.year}'
```

Nel `_ExpandedDetail`, i 3 `_DetailField`:

```dart
_DetailField('VITIGNO',    wine.grape ?? 'N/A'),
_DetailField('GRADAZIONE', wine.abv == null ? 'N/A' : '${wine.abv}% vol.'),
_DetailField('REGIONE',    wine.region ?? 'N/A'),
```

Nessuna formattazione speciale per "N/A" (stesso stile del valore normale). Il consumer capisce visivamente che è un placeholder per "informazione non ancora disponibile".

### Lookup vino per inventario e storico ordini - gap noto

Due chiamanti di `wineById(id)` da `mock_data.dart` restano in piedi:

- `lib/state/app_state.dart:143` - `cantinaLinesProvider` per risolvere gli ID dell'inventario salvato in `SharedPreferences`
- `lib/screens/dettaglio_ordine_screen.dart:272` - per disegnare le righe degli ordini storici (anch'essi cached, con id-mock `w01..w20`)

Con il catalogo che passa al DB, gli id legacy non risolvono più nessun vino reale. Entrambi i chiamanti già gestiscono il `null` silenziosamente (filtrano via).

**Decisione di transizione**: in questo task `wineById()` continua a esistere e cercare nel mock + fallback `null`. Il wire dell'inventario al DB (e la migration `id-mock → UUID`) è task separato `"wire-inventory-and-orders-to-db"`, fuori scope.

**Conseguenza pratica visibile all'utente** dopo lo switch:

- La **Cantina** di un utente esistente (es. utente test su Osteria Metti) appare **vuota** - gli id `w01..w20` cached in `SharedPreferences` non risolvono più nessun vino. Il `cantinaLinesProvider` filtra entry con `wine == null` (linea 144).
- Gli **ordini storici** mostrano un numero corretto di items in lista, ma il dettaglio per riga è vuoto (nessuna bottle card per riga).
- I **nuovi ordini** futuri devono usare gli UUID reali dal catalogo DB - tracciato dal task separato.

**Comunicazione**: nelle release notes Flutter "Catalogo aggiornato: il tuo elenco vini ora arriva direttamente da Enopera. Se la tua Cantina appare vuota, ricostruiscila aggiungendo i vini dal nuovo Catalogo - i prossimi ordini saranno tracciati con il nuovo sistema."

## Data flow

### Lettura admin

```
ViniPage (server) → listWinesForAdmin() + listGrapeRegionOptions()
                  → Supabase service-role SELECT
                  → JSON props a ViniList (client)
                  → render tabella + datalist
```

### Scrittura admin

```
input cambio + blur/Enter
  ↓
ViniList.commitUpdate(wineId, { field: newValue })   // un solo campo per call
  ↓
setWines(prev → apply patch)         // optimistic UI update
setPendingIds(add wineId)            // riga diventa opacity 0.7
  ↓
startTransition: updateWineMetadata(wineId, { field: newValue })
  ↓
requireAdmin() + Zod parse + supa.from("wines").update(...)
  ↓
success → setPendingIds(remove wineId), UI già ok
error   → setWines(prev = snapshot pre-modifica)  // rollback esplicito
          + toast rosso + setPendingIds(remove wineId)
```

**Per-field commit**: `maybeCommit(wineId, field, value)` invia sempre un oggetto a singolo campo (es. `{ grape: "Glera" }` oppure `{ abv: null }`). Mai un oggetto multi-campo, anche se due input adiacenti vengono blurrati in sequenza - così evitiamo race condition dove un blur su `region` sovrascrive un cambio concorrente su `abv` ancora in-flight per la stessa riga.

### Lettura Flutter

```
CatalogoScreen build
  ↓
ref.watch(catalogProvider)
  ↓
fetchCatalogFromDb() → supabase.rpc('catalog_for_current_user')
  ↓
RPC SECURITY DEFINER: lookup utente → restaurant.price_list_id → wines+wine_prices+price_lists JOIN
  ↓
mappatura JSON → List<Wine> (con nullable)
  ↓
AsyncValue.data → render lista filtrata
```

## Error handling

| Sito | Errore | Behavior |
|---|---|---|
| `ViniPage` server | Throw da `listWinesForAdmin` | Card carminio "Impossibile caricare i vini" come in `listini/page.tsx` |
| `ViniList` client | Throw da `updateWineMetadata` | Toast rosso `ADM.red` con messaggio errore + rollback optimistic |
| Validazione Zod fallita | `ZodError` | Toast rosso "Valore non valido" |
| `fetchCatalogFromDb` Flutter | `PostgrestException` o network error | `AsyncValue.error` → card "Catalogo non disponibile" + bottone "Riprova" che invalida il provider |
| Cella `abv` con valore fuori range | Validazione browser (min/max) | Browser blocca submit; se l'utente forza, Zod server-side rigetta |

## Verification

### Pre-merge

- `pnpm typecheck` zero errori
- `pnpm lint` zero warning sui nuovi file
- `pnpm build` build pulita Vercel-ready
- `flutter analyze` zero issue su `enopera_portal`
- Ispezione manuale di `supabase/functions/sync-starty-catalog/index.ts`: il payload del `.upsert("wines", chunk)` **non deve contenere** le chiavi `grape`, `region`, `abv`, `notes`, `pairing`. Se le contiene, l'invariante è violata anche con il commento.

### Smoke manuale Admin

1. Login admin → sidebar mostra "Vini · Anagrafica catalogo" (6ª voce)
2. Click → tabella con 829 vini, badge `●` su tutti tranne i 20 popolati
3. Filtro "Solo da popolare" → mostra 809
4. Popola un vino reale (Vitigno, Regione, Gradazione) → cella si aggiorna, badge passa a `✓`
5. F5 → modifica persiste
6. Search "amarone" → filtra correttamente
7. Lancio manuale sync (`/listini` → bottone "Sync da Starty") → riprovo il vino modificato → ancora popolato

### Smoke manuale Flutter

1. APK release installato su device
2. Login utente test (Osteria Metti)
3. Tab Catalogo → lista carica con loading spinner → mostra 829 vini reali (non più i 20 mock)
4. Vino non popolato → expand → 3 campi mostrano "N/A"
5. Vino popolato → expand → 3 campi mostrano i valori (es. "Garganega", "Soave", "12.5% vol.")
6. Search "soave" → filtra anche per regione (nullable-safe)

## Resolved questions e convenzioni

Tutte le domande chiarite in fase di brainstorming (nessuna aperta):

- ~~Vitigno picklist o testo~~: testo libero con autocomplete (datalist HTML5)
- ~~Regione picklist o testo~~: testo libero con autocomplete
- ~~Gradazione precisione~~: 1 decimale, range 0–20
- ~~Posizione UI~~: nuova voce sidebar `/vini`
- ~~Edit pattern~~: inline table editing
- ~~Bulk edit~~: fuori scope v1
- ~~Save UX~~: optimistic blur/Enter (con `useState`, non `useOptimistic` - vedi sezione lista vini)
- ~~Switch Flutter mock→DB in questo task~~: sì, end-to-end

**Convenzione editoriale per `region`**: preferire la denominazione/zona specifica (es. "Valpolicella", "Soave DOCG", "Lugana") rispetto alla regione amministrativa generica (es. "Veneto"). I 20 vini già popolati seguono questa convenzione (sono tutte zone, non regioni). L'autocomplete riusa quei valori già curati. Da scrivere come `placeholder` nell'input dell'admin: `placeholder="es. Valpolicella, Soave"`.

## Risk / rollback

| Risk | Mitigation |
|---|---|
| Admin scrive valori errati su molti vini | Reversibile via UI: empty string → `null`. Backup giornaliero Supabase comunque attivo. |
| Sync notturno futuro modifica payload e include `grape/region/abv` | Commento di guard rail nello `index.ts` dello sync + sezione "Sync StartyERP" in CLAUDE.md di Enopera-Admin. |
| RPC `catalog_for_current_user` lenta su 829 vini × N utenti concorrenti | JOIN su PK indicizzate, cardinalità modesta. Se diventa problema: cache lato client (Riverpod keepAlive) o materialized view. |
| Flutter mostra catalogo vuoto perché RPC fallisce silenziosamente | `AsyncValue.error` con messaggio + retry button - error visibile, non silenzioso |
| Utenti esistenti vedono Cantina svuotata (id-mock non risolvono) | Documentato come previsto (gap noto in sezione "Lookup vino per inventario"). Comunicare nelle release notes "ricostruisci la tua cantina aggiungendo i vini dal nuovo catalogo". |
| Build APK release dopo modifiche al modello non installa | Test smoke su device fisico/emulatore prima di considerare il task done |

## Out of scope follow-ups

- Import CSV/XLSX di vini popolati (utile se l'utente fa popolazione offline su file Excel)
- Wire `cantinaLinesProvider` al DB (sostituire mock_data lookup con DB lookup)
- Audit log "chi ha modificato cosa quando" sui metadati vino
- Versioning dei metadati (history delle modifiche)
- UI di rotazione vitigni "master" (anagrafica vitigni separata)
- Bulk edit con selezione checkbox + form barra azione
