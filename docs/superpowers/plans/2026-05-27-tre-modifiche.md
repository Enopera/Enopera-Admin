# Tre modifiche minori - Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tre piccole modifiche indipendenti emerse dopo lo smoke della release `/vini`: (A) filtro prezzo nel catalogo Flutter, (B) rimozione colonna SCORTA dalla cantina nel tab Distribuzione, (C) flag `free_shipping` per ristorante editabile da admin + implementazione regola standard spedizione (€10 / gratis sopra €300).

**Architecture:** Tre cambiamenti indipendenti commitabili separatamente. A e B sono Flutter-only. C tocca DB (migration) + Next admin (types/actions/queries/UI) + Flutter (UserProfile JOIN + helper shipping + riepilogo). Nessuna dipendenza tra i 3 chunk.

**Tech Stack:** Flutter Material 3 + Riverpod (Portal). Next.js 15 + React 19 + TypeScript + Supabase service-role (Admin). PostgreSQL migration via Supabase MCP. Niente test framework - verifica via `pnpm typecheck` + `pnpm build` + `flutter analyze` + smoke manuale.

**Spec di riferimento:** [docs/superpowers/specs/2026-05-27-tre-modifiche-design.md](../specs/2026-05-27-tre-modifiche-design.md)

**Project roots:**
- Admin: `D:\Dev\Progetti\Enopera-Admin\`
- Flutter: `D:\Dev\Progetti\enopera_portal\`

---

## File structure

### Chunk A - Filtro prezzo Flutter

**Modificati:**
| Path | Modifica |
|---|---|
| `lib/state/app_state.dart` | Aggiungi 3 provider: `priceMinProvider`, `priceMaxProvider`, `advancedFiltersExpandedProvider`. |
| `lib/screens/catalogo_screen.dart` | Search bar diventa figlia di `Row` con nuovo bottone `_FiltersToggleButton`. Aggiungi widget `_AdvancedFiltersPanel` (ConsumerStatefulWidget). Estendi filter in `_buildLoaded` con min/max price check. |

### Chunk B - Cantina distribuzione

**Modificati:**
| Path | Modifica |
|---|---|
| `lib/screens/cantina_screen.dart` | `_ColumnsHeader`: nasconde SCORTA se `isDistribution`. `_WineCard`: estrai `_StockCell` widget, renderizza solo se `!isDistribution`. |

### Chunk C - Free shipping flag

**C1 DB:**
| | |
|---|---|
| Supabase migration | `add_free_shipping_to_restaurants` - `ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS free_shipping boolean NOT NULL DEFAULT false`. |

**C2 Admin (Next):**
| Path | Modifica |
|---|---|
| `lib/restaurants/types.ts` | `AdminRestaurant` interface - aggiungi `freeShipping: boolean`. |
| `lib/restaurants/actions.ts` | `RestaurantInput` interface - aggiungi `freeShipping: boolean`. `toRow()` helper - aggiungi `free_shipping: input.freeShipping`. |
| `lib/restaurants/queries.ts` | Mapping - leggi `free_shipping` da DB e mappa a `freeShipping` camelCase. |
| `components/admin/restaurants-list.tsx` | 2 `useState<RestaurantInput>` initializers (create + edit) - aggiungi `freeShipping: false` di default. Aggiungi UI checkbox "Spedizione sempre gratuita" + helper text in entrambe le form. |

**C3 Flutter:**
| Path | Modifica |
|---|---|
| `lib/data/shipping.dart` (nuovo) | Costanti `kShippingCost = 10.0`, `kFreeShippingThreshold = 300.0`. Classe `ShippingCalc`. Funzione `computeShipping`. |
| `lib/services/auth_service.dart` | `UserProfile` - aggiungi `restaurantFreeShipping: bool`. `userProfileProvider` - query con JOIN su `restaurants(free_shipping)`. |
| `lib/screens/riepilogo_screen.dart` | `_Footer` - aggiungi prop `freeShipping`. Call-site nel parent - `ref.watch(userProfileProvider).value?.restaurantFreeShipping ?? false`. Body - usa `computeShipping`, aggiorna riga Spedizione + Totale + helper text "gratis sopra €300". |

---

## Chunk A: Filtro prezzo Flutter

### Task A1: Provider di stato

**Outcome:** 3 nuovi provider Riverpod in `app_state.dart` per stato filtro prezzo + UI expanded.

**Files:**
- Modify: `D:\Dev\Progetti\enopera_portal\lib\state\app_state.dart`

- [ ] **Step A1.1: Aggiungi i 3 provider in fondo al file**

In `D:\Dev\Progetti\enopera_portal\lib\state\app_state.dart`, dopo l'ultimo provider esistente (`catalogProvider` o equivalente), aggiungi:

```dart
/// Prezzo minimo per filtrare il catalogo. null = nessun filtro.
final priceMinProvider = StateProvider<double?>((_) => null);

/// Prezzo massimo per filtrare il catalogo. null = nessun filtro.
final priceMaxProvider = StateProvider<double?>((_) => null);

/// Stato di apertura del pannello "Filtri avanzati" nel catalogo.
final advancedFiltersExpandedProvider = StateProvider<bool>((_) => false);
```

- [ ] **Step A1.2: Verifica con flutter analyze**

```bash
cd "D:/Dev/Progetti/enopera_portal"; flutter analyze 2>&1 | tail -5
```
Expected: `No issues found!` (i nuovi provider non sono ancora usati ma il file compila).

- [ ] **Step A1.3: Non committare ancora** - task A2 modifica il catalogo, commit unico Chunk A.

### Task A2: UI filtri avanzati nel catalogo

**Outcome:** Bottone "Filtri" accanto alla search bar, pannello collassabile con 2 input min/max, filter applicato in AND con tipo + query. Lifecycle pulito di Timer + TextEditingController.

**Files:**
- Modify: `D:\Dev\Progetti\enopera_portal\lib\screens\catalogo_screen.dart`

- [ ] **Step A2.1: Aggiungi import `dart:async` per Timer**

In testa al file `D:\Dev\Progetti\enopera_portal\lib\screens\catalogo_screen.dart`, dopo gli import esistenti, aggiungi:

```dart
import 'dart:async';
```

- [ ] **Step A2.2: Aggiorna il filter in `_buildLoaded`**

Trova nel metodo `_buildLoaded` (intorno a riga 30-40) il blocco:

```dart
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
```

Sostituiscilo con (leggi anche i 2 nuovi provider all'inizio del metodo, dopo `final filter = ref.watch(filterProvider);`):

```dart
    final priceMin = ref.watch(priceMinProvider);
    final priceMax = ref.watch(priceMaxProvider);

    final filtered = wines.where((w) {
      final q = query.trim().toLowerCase();
      final byQuery = q.isEmpty ||
          w.name.toLowerCase().contains(q) ||
          w.producer.toLowerCase().contains(q) ||
          (w.region?.toLowerCase().contains(q) ?? false) ||
          (w.grape?.toLowerCase().contains(q) ?? false);
      final byFilter = filter == 'Tutti' || w.type.label == filter;
      final byPriceMin = priceMin == null || w.price >= priceMin;
      final byPriceMax = priceMax == null || w.price <= priceMax;
      return byQuery && byFilter && byPriceMin && byPriceMax;
    }).toList();
```

- [ ] **Step A2.3: Trasforma la search bar in Row(search + toggle)**

Trova nel `_buildLoaded` (intorno a riga 45-55) il blocco:

```dart
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
          // ... chip tipo
        ),
      ),
    ],
  ),
),
```

Sostituiscilo con (legge anche `expanded` all'inizio del metodo):

```dart
    final advFiltersOpen = ref.watch(advancedFiltersExpandedProvider);
    // ...
        Padding(
          padding: const EdgeInsets.fromLTRB(22, 0, 22, 14),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: _SearchBar(
                      value: query,
                      onChanged: (v) => ref.read(queryProvider.notifier).state = v,
                    ),
                  ),
                  const SizedBox(width: 8),
                  _FiltersToggleButton(
                    expanded: advFiltersOpen,
                    hasActiveFilters: priceMin != null || priceMax != null,
                    onTap: () {
                      ref.read(advancedFiltersExpandedProvider.notifier).state =
                          !advFiltersOpen;
                    },
                  ),
                ],
              ),
              if (advFiltersOpen) ...[
                const SizedBox(height: 12),
                const _AdvancedFiltersPanel(),
              ],
              const SizedBox(height: 12),
              SizedBox(
                height: 34,
                child: ListView.separated(
                  // ... chip tipo (invariato)
                ),
              ),
            ],
          ),
        ),
```

NOTA: il riferimento a `priceMin`/`priceMax` qui usa le variabili già lette al passo A2.2. Se nel tuo flusso le hai definite più in basso, spostale prima del Padding.

- [ ] **Step A2.4: Aggiungi `_FiltersToggleButton`**

In fondo al file `catalogo_screen.dart` (dopo `_AddToCellarButton` o `_ErrorPanel`), aggiungi:

```dart
class _FiltersToggleButton extends StatelessWidget {
  final bool expanded;
  final bool hasActiveFilters;
  final VoidCallback onTap;

  const _FiltersToggleButton({
    required this.expanded,
    required this.hasActiveFilters,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: expanded ? AppColors.primary : AppColors.surface,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: expanded ? AppColors.primary : AppColors.line,
            ),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.tune,
                size: 16,
                color: expanded ? AppColors.onPrimary : AppColors.ink,
              ),
              const SizedBox(width: 6),
              Text(
                'Filtri',
                style: GoogleFonts.dmSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: expanded ? AppColors.onPrimary : AppColors.ink,
                ),
              ),
              if (hasActiveFilters) ...[
                const SizedBox(width: 4),
                Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: expanded ? AppColors.onPrimary : AppColors.primary,
                    shape: BoxShape.circle,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step A2.5: Aggiungi `_AdvancedFiltersPanel` (ConsumerStatefulWidget)**

In fondo al file, dopo `_FiltersToggleButton`, aggiungi:

```dart
class _AdvancedFiltersPanel extends ConsumerStatefulWidget {
  const _AdvancedFiltersPanel();

  @override
  ConsumerState<_AdvancedFiltersPanel> createState() =>
      _AdvancedFiltersPanelState();
}

class _AdvancedFiltersPanelState extends ConsumerState<_AdvancedFiltersPanel> {
  late final TextEditingController _minCtrl;
  late final TextEditingController _maxCtrl;
  Timer? _minDebounce;
  Timer? _maxDebounce;

  @override
  void initState() {
    super.initState();
    final initialMin = ref.read(priceMinProvider);
    final initialMax = ref.read(priceMaxProvider);
    _minCtrl = TextEditingController(
      text: initialMin?.toStringAsFixed(0) ?? '',
    );
    _maxCtrl = TextEditingController(
      text: initialMax?.toStringAsFixed(0) ?? '',
    );
  }

  @override
  void dispose() {
    _minDebounce?.cancel();
    _maxDebounce?.cancel();
    _minCtrl.dispose();
    _maxCtrl.dispose();
    super.dispose();
  }

  void _onMinChanged(String v) {
    _minDebounce?.cancel();
    _minDebounce = Timer(const Duration(milliseconds: 200), () {
      final parsed = double.tryParse(v.trim());
      ref.read(priceMinProvider.notifier).state = parsed;
    });
  }

  void _onMaxChanged(String v) {
    _maxDebounce?.cancel();
    _maxDebounce = Timer(const Duration(milliseconds: 200), () {
      final parsed = double.tryParse(v.trim());
      ref.read(priceMaxProvider.notifier).state = parsed;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'PREZZO',
            style: GoogleFonts.dmSans(
              fontSize: 10,
              letterSpacing: 1.2,
              fontWeight: FontWeight.w500,
              color: AppColors.inkMuted,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _PriceInput(
                  controller: _minCtrl,
                  hint: 'min',
                  onChanged: _onMinChanged,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _PriceInput(
                  controller: _maxCtrl,
                  hint: 'max',
                  onChanged: _onMaxChanged,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PriceInput extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final ValueChanged<String> onChanged;

  const _PriceInput({
    required this.controller,
    required this.hint,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onChanged: onChanged,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      style: GoogleFonts.dmSans(fontSize: 13, color: AppColors.ink),
      decoration: InputDecoration(
        prefixText: '€ ',
        prefixStyle: GoogleFonts.dmSans(
          fontSize: 13,
          color: AppColors.inkSoft,
          fontWeight: FontWeight.w500,
        ),
        hintText: hint,
        hintStyle: GoogleFonts.dmSans(fontSize: 13, color: AppColors.inkMuted),
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: AppColors.primary, width: 1.5),
        ),
      ),
    );
  }
}
```

- [ ] **Step A2.6: Verifica `flutter analyze`**

```bash
cd "D:/Dev/Progetti/enopera_portal"; flutter analyze 2>&1 | tail -10
```
Expected: `No issues found!`. Se ci sono errori (import mancante, riferimento a `priceMin`/`priceMax` prima della declaration, ecc.), risolvili leggendo il messaggio.

- [ ] **Step A2.7: Commit Chunk A (provider + UI)**

```bash
git -C "D:/Dev/Progetti/enopera_portal" add lib/state/app_state.dart lib/screens/catalogo_screen.dart
git -C "D:/Dev/Progetti/enopera_portal" commit -m "$(cat <<'EOF'
feat(catalog): price filter min/max in collapsible Filtri panel

Adds 3 Riverpod providers (priceMinProvider, priceMaxProvider,
advancedFiltersExpandedProvider) and a new collapsible "Filtri"
panel next to the search bar. Two number inputs combined in AND
with type chips + search query. Debounced 200ms with proper Timer
+ TextEditingController lifecycle (ConsumerStatefulWidget +
initState/dispose). Active filters indicated by a small carmine
dot on the Filtri button.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk B: Cantina distribuzione (rimuovi SCORTA)

### Task B1: `_StockCell` widget + condizionale in header e cell

**Outcome:** Nel tab Distribuzione la cantina mostra solo `VINO | ORDINE` (header + stepper). Conto vendita resta `VINO | SCORTA | REINTEGRO` invariato.

**Files:**
- Modify: `D:\Dev\Progetti\enopera_portal\lib\screens\cantina_screen.dart`

- [ ] **Step B1.1: Estrai `_StockCell` widget**

In `D:\Dev\Progetti\enopera_portal\lib\screens\cantina_screen.dart`, in fondo al file (dopo `_AddWineButton`), aggiungi:

```dart
class _StockCell extends StatelessWidget {
  final InventoryEntry entry;
  const _StockCell({required this.entry});

  @override
  Widget build(BuildContext context) {
    final lowStock = entry.inStock <= 3;
    return SizedBox(
      width: 68,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '${entry.inStock}',
            style: AppTextStyles.stockNumber(
              color: lowStock ? AppColors.primarySoft : AppColors.ink,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            lowStock ? 'bassa' : 'btg',
            style: GoogleFonts.dmSans(
              fontSize: 9,
              letterSpacing: 1,
              fontWeight: FontWeight.w500,
              color: lowStock ? AppColors.primarySoft : AppColors.inkMuted,
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step B1.2: Aggiorna `_ColumnsHeader`**

Trova `_ColumnsHeader` (linee 291-313 attuali). Sostituiscilo con:

```dart
class _ColumnsHeader extends StatelessWidget {
  final WineChannel channel;
  const _ColumnsHeader({required this.channel});
  @override
  Widget build(BuildContext context) {
    final style = AppTextStyles.eyebrowTight();
    final isDistribution = channel == WineChannel.distribuzione;
    final actionLabel = isDistribution ? 'ORDINE' : 'REINTEGRO';
    return Padding(
      padding: const EdgeInsets.fromLTRB(34, 4, 34, 10),
      child: Row(
        children: [
          Expanded(child: Text('VINO', style: style)),
          if (!isDistribution)
            SizedBox(width: 68, child: Center(child: Text('SCORTA', style: style))),
          SizedBox(
            width: kStepperWidth,
            child: Center(child: Text(actionLabel, style: style)),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step B1.3: Aggiorna `_WineCard` per usare `_StockCell` condizionale**

Trova `_WineCard.build` (linee 350-429 attuali). Sostituisci il metodo `build` con:

```dart
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wine = line.wine;
    final entry = line.entry;
    final channel = ref.watch(cantinaChannelProvider);
    final isDistribution = channel == WineChannel.distribuzione;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  wine.name,
                  softWrap: true,
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontSize: 17, height: 1.2),
                ),
                const SizedBox(height: 3),
                Text(
                  '${wine.producer} · ${wine.year}',
                  softWrap: true,
                  style: GoogleFonts.dmSans(
                    fontSize: 11,
                    height: 1.35,
                    color: AppColors.inkSoft,
                  ),
                ),
              ],
            ),
          ),
          if (!isDistribution) _StockCell(entry: entry),
          SizedBox(
            width: kStepperWidth,
            child: Center(
              child: QtyStepper(
                qty: entry.orderQty,
                onIncrement: () =>
                    ref.read(inventoryProvider.notifier).increment(wine.id),
                onDecrement: () =>
                    ref.read(inventoryProvider.notifier).decrement(wine.id),
              ),
            ),
          ),
        ],
      ),
    );
  }
```

Le variabili `lowStock` e gli stili stockNumber sono ora dentro `_StockCell` - niente più dead variable in `_WineCard`.

- [ ] **Step B1.4: Verifica `flutter analyze`**

```bash
cd "D:/Dev/Progetti/enopera_portal"; flutter analyze 2>&1 | tail -10
```
Expected: `No issues found!`. Particolare attenzione: il warning `unused_local_variable` su `lowStock` deve essere assente (era dentro `_WineCard`, ora è dentro `_StockCell`).

- [ ] **Step B1.5: Commit Chunk B**

```bash
git -C "D:/Dev/Progetti/enopera_portal" add lib/screens/cantina_screen.dart
git -C "D:/Dev/Progetti/enopera_portal" commit -m "$(cat <<'EOF'
feat(cantina): hide SCORTA column in distribuzione tab

In distribution channel Enopera invoices directly on delivery, so
the ristoratore doesn't need to track inventory there - only the
order quantity. The SCORTA header and cell are now hidden when
channel == distribuzione; conto vendita keeps SCORTA + REINTEGRO
unchanged.

Refactor: extracted _StockCell widget (encapsulates the lowStock
computation that was unused on the distribution branch).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk C: Free shipping flag

### Task C1: DB migration

**Outcome:** Colonna `free_shipping boolean NOT NULL DEFAULT false` su `public.restaurants`. Tutti i ristoranti esistenti default false (= regola standard).

- [ ] **Step C1.1: Applica migration via MCP**

Usa `mcp__c366e5da-ca9d-4beb-9e42-ca69d4dacba7__apply_migration` con:

- `project_id`: `vguueimgbngnjgoockge`
- `name`: `add_free_shipping_to_restaurants`
- `query`:

```sql
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS free_shipping boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.restaurants.free_shipping IS
  'Se true, bypassa la soglia di gratuità (€300) - spedizione sempre gratis per questo ristorante, indipendentemente dall''importo ordine. Editato dall''admin in /ristoranti.';
```

Expected: success. Verifica:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='restaurants' AND column_name='free_shipping';
```
Expected: 1 row `free_shipping | boolean | NO | false`.

E controlla che tutti i ristoranti esistenti abbiano `false`:

```sql
SELECT free_shipping, COUNT(*) FROM public.restaurants GROUP BY free_shipping;
```
Expected: 1 row `false | N` (con N = numero ristoranti).

- [ ] **Step C1.2: Niente commit** - migration applicata DB-side, non c'è codice nel repo da committare. Procediamo a C2 (admin).

### Task C2: Admin (Next.js) - types + actions + queries + UI checkbox

**Outcome:** Admin `/ristoranti` mostra una checkbox "Spedizione sempre gratuita" nel drawer di create/edit, persistita su DB.

**Files:**
- Modify: `lib/restaurants/types.ts`
- Modify: `lib/restaurants/actions.ts`
- Modify: `lib/restaurants/queries.ts`
- Modify: `components/admin/restaurants-list.tsx`

- [ ] **Step C2.1: Aggiungi `freeShipping` a `AdminRestaurant` interface**

In `D:\Dev\Progetti\Enopera-Admin\lib\restaurants\types.ts`, trova l'interface `AdminRestaurant` (intorno a riga 3). Aggiungi alla fine dei field (prima della closing `}`):

```ts
  freeShipping: boolean;
```

- [ ] **Step C2.2: Aggiungi `freeShipping` a `RestaurantInput` interface + `toRow()` mapping**

In `D:\Dev\Progetti\Enopera-Admin\lib\restaurants\actions.ts`:

1. Trova `interface RestaurantInput` (intorno a riga 12). Aggiungi alla fine dei field:
   ```ts
     freeShipping: boolean;
   ```

2. Trova il `toRow()` helper (intorno a riga 25-38). Aggiungi nel return object:
   ```ts
     free_shipping: input.freeShipping,
   ```

- [ ] **Step C2.3: Aggiorna mapping in `queries.ts`**

In `D:\Dev\Progetti\Enopera-Admin\lib\restaurants\queries.ts`:

1. Trova la chiamata `.select(...)` che legge i ristoranti. Aggiungi `free_shipping` all'elenco delle colonne. Se è già un `.select('*')`, va bene così (include tutte le colonne).

2. Trova il mapping che converte le row DB in `AdminRestaurant` objects (intorno alle linee 50-67). Aggiungi:
   ```ts
     freeShipping: (r.free_shipping as boolean | null) ?? false,
   ```
   
   Il `?? false` è una safety net: se la colonna manca (edge case migration), default a false.

- [ ] **Step C2.4: Aggiorna 2 `useState<RestaurantInput>` in restaurants-list.tsx**

In `D:\Dev\Progetti\Enopera-Admin\components\admin\restaurants-list.tsx`, ci sono **due** `useState<RestaurantInput>` initializers:

1. **Form di EDIT** (~riga 320): trova `useState<RestaurantInput>({...})` con i field iniziali. Aggiungi alla fine dell'object literal:
   ```ts
     freeShipping: openRestaurant.freeShipping,
   ```

2. **Form di CREATE** (~riga 862): trova il secondo `useState<RestaurantInput>({...})` (quello del modal di create - i field sono inizializzati a empty/default). Aggiungi:
   ```ts
     freeShipping: false,
   ```

- [ ] **Step C2.5: Aggiungi UI checkbox in entrambe le form**

Nelle stesse form (edit + create), localizza la sezione dei field input (input testuali per nome, indirizzo, P.IVA, ecc.). Aggiungi sotto i field principali, in una nuova sezione "Condizioni commerciali":

```tsx
<div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${ADM.line}` }}>
  <div style={{
    fontSize: 11, color: ADM.inkMuted, letterSpacing: 0.6,
    textTransform: "uppercase", fontFamily: ADM.sans, marginBottom: 10,
  }}>
    Condizioni commerciali
  </div>
  <label style={{
    display: "flex", alignItems: "flex-start", gap: 10,
    cursor: "pointer", fontFamily: ADM.sans,
  }}>
    <input
      type="checkbox"
      checked={form.freeShipping}
      onChange={(e) => setForm({ ...form, freeShipping: e.target.checked })}
      style={{ marginTop: 3, cursor: "pointer" }}
    />
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 13, color: ADM.ink, fontWeight: 500 }}>
        Spedizione sempre gratuita
      </div>
      <div style={{ fontSize: 11, color: ADM.inkSoft, marginTop: 2, lineHeight: 1.4 }}>
        Bypassa la soglia di gratuità (€300) - la spedizione sarà gratis
        per ogni ordine di questo ristorante, indipendentemente dall'importo.
      </div>
    </div>
  </label>
</div>
```

NOTA: in entrambe le form la variabile di stato si chiama `form` e il setter `setForm` (verificato nel codice attuale alle linee ~320 e ~862). Usa quei nomi così come scritti nello snippet.

- [ ] **Step C2.6: Verifica typecheck + lint + build**

```bash
cd "D:/Dev/Progetti/Enopera-Admin"; pnpm typecheck; pnpm lint 2>&1 | tail -5
```
Expected: zero errors. Se errori, sono probabilmente dovuti a `freeShipping` mancante in qualche call site di `RestaurantInput` o `AdminRestaurant` - risolvi.

- [ ] **Step C2.7: Commit C2 (admin)**

```bash
git -C "D:/Dev/Progetti/Enopera-Admin" add lib/restaurants/types.ts lib/restaurants/actions.ts lib/restaurants/queries.ts components/admin/restaurants-list.tsx
git -C "D:/Dev/Progetti/Enopera-Admin" commit -m "$(cat <<'EOF'
feat(restaurants): admin checkbox 'Spedizione sempre gratuita'

Adds freeShipping: boolean to AdminRestaurant + RestaurantInput
types, toRow() mapping, and queries mapping. UI: new "Condizioni
commerciali" section in both create + edit forms with a checkbox
and helper text explaining the bypass of the €300 threshold.

DB migration applied separately (add_free_shipping_to_restaurants).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task C3: Flutter - shipping helper + UserProfile JOIN + riepilogo

**Outcome:** Flutter consumer calcola spedizione corretta: €0 se flag attivo, altrimenti €10 sotto €300 / €0 sopra. Riepilogo mostra valore + helper text.

**Files:**
- Create: `D:\Dev\Progetti\enopera_portal\lib\data\shipping.dart`
- Modify: `D:\Dev\Progetti\enopera_portal\lib\services\auth_service.dart`
- Modify: `D:\Dev\Progetti\enopera_portal\lib\screens\riepilogo_screen.dart`

- [ ] **Step C3.1: Crea `lib/data/shipping.dart`**

```dart
/// Configurazione spedizione consumer.
///
/// Regola standard:
///   - sopra kFreeShippingThreshold (€300) → gratis
///   - sotto soglia → kShippingCost (€10)
///
/// Override per-ristorante: il flag `free_shipping` su `public.restaurants`
/// (esposto come `UserProfile.restaurantFreeShipping`) bypassa la soglia
/// e rende la spedizione sempre gratis per quel ristorante.
const double kShippingCost = 10.0;
const double kFreeShippingThreshold = 300.0;

class ShippingCalc {
  final double cost;
  final bool isFree;
  /// "ristorante con spedizione gratuita" | "ordine sopra €300" | "sotto soglia €300"
  final String reason;

  const ShippingCalc({
    required this.cost,
    required this.isFree,
    required this.reason,
  });
}

ShippingCalc computeShipping({
  required double subtotal,
  required bool freeShippingFlag,
}) {
  if (freeShippingFlag) {
    return const ShippingCalc(
      cost: 0,
      isFree: true,
      reason: 'ristorante con spedizione gratuita',
    );
  }
  if (subtotal >= kFreeShippingThreshold) {
    return const ShippingCalc(
      cost: 0,
      isFree: true,
      reason: 'ordine sopra €300',
    );
  }
  return const ShippingCalc(
    cost: kShippingCost,
    isFree: false,
    reason: 'sotto soglia €300',
  );
}
```

- [ ] **Step C3.2: Aggiorna `UserProfile` in `auth_service.dart`**

In `D:\Dev\Progetti\enopera_portal\lib\services\auth_service.dart`:

1. Trova la classe `UserProfile`. Aggiungi un nuovo field (dopo gli altri):
   ```dart
     final bool restaurantFreeShipping;
   ```

2. Aggiungi al costruttore (con `required` per coerenza, ma il default factory sarà false):
   ```dart
     required this.restaurantFreeShipping,
   ```

- [ ] **Step C3.3: Aggiorna la query in `userProfileProvider`**

Nello stesso file, trova `userProfileProvider` (intorno a riga 87). La query Supabase è **dentro un blocco `try/catch`** alle linee 98-106 (`catch` ripristina `row = null` per RLS/errore fetch). La modifica va fatta **dentro lo stesso try block** - non spostarla fuori.

Trova:

```dart
row = await supabase
    .from('profiles')
    .select()
    .eq('id', user.id)
    .maybeSingle();
```

Sostituiscila con:

```dart
row = await supabase
    .from('profiles')
    .select('*, restaurants(free_shipping)')
    .eq('id', user.id)
    .maybeSingle();
```

Poi nella factory `UserProfile(...)` in fondo allo stesso provider, aggiungi:

```dart
    restaurantFreeShipping:
        (row?['restaurants'] as Map<String, dynamic>?)?['free_shipping'] as bool? ?? false,
```

NOTA: `supabase-js` (e supabase_flutter) auto-detecta 1:1 vs 1:N dalla cardinalità della FK. `profiles.restaurant_id` è single FK quindi `restaurants` arriva come **singolo oggetto** (Map), non array. Il `?? false` fa fallback safe se il profilo non ha `restaurant_id` o se l'RLS blocca (anche se `restaurants_select_linked` policy permette già SELECT al linked user - verificato in spec).

- [ ] **Step C3.4: Aggiorna `_Footer` in `riepilogo_screen.dart`**

In `D:\Dev\Progetti\enopera_portal\lib\screens\riepilogo_screen.dart`:

1. **Import** in testa al file:
   ```dart
   import '../data/shipping.dart';
   ```

2. **Costruttore `_Footer`** (linee 223-232): aggiungi `freeShipping` come prop:
   ```dart
   class _Footer extends StatelessWidget {
     final double total;
     final bool canConfirm;
     final bool freeShipping;
     final VoidCallback onConfirm;

     const _Footer({
       required this.total,
       required this.canConfirm,
       required this.freeShipping,
       required this.onConfirm,
     });
   ```

3. **Body `_Footer.build()`** - sostituisci il blocco esistente con:

```dart
  @override
  Widget build(BuildContext context) {
    final calc = computeShipping(
      subtotal: total,
      freeShippingFlag: freeShipping,
    );
    final realTotal = total + calc.cost;

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.line)),
      ),
      padding: const EdgeInsets.fromLTRB(22, 16, 22, 18),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _LineRow(
            left: 'Subtotale',
            right: '€${total.toStringAsFixed(2)}',
            rightStyle: GoogleFonts.cormorantGaramond(
              fontSize: 14,
              color: AppColors.ink,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: 4),
          _LineRow(
            left: 'Spedizione',
            right: calc.isFree ? 'gratis' : '€${calc.cost.toStringAsFixed(2)}',
            rightStyle: GoogleFonts.cormorantGaramond(
              fontSize: 14,
              color: calc.isFree ? AppColors.success : AppColors.ink,
            ),
          ),
          if (!calc.isFree)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Align(
                alignment: Alignment.centerRight,
                child: Text(
                  'gratis sopra €${kFreeShippingThreshold.toStringAsFixed(0)}',
                  style: GoogleFonts.dmSans(
                    fontSize: 10,
                    color: AppColors.inkMuted,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ),
            ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                'Totale',
                style: GoogleFonts.cormorantGaramond(
                  fontSize: 18,
                  fontWeight: FontWeight.w500,
                  color: AppColors.ink,
                ),
              ),
              const Spacer(),
              Text(
                '€${realTotal.toStringAsFixed(2)}',
                style: GoogleFonts.cormorantGaramond(
                  fontSize: 28,
                  fontWeight: FontWeight.w600,
                  color: AppColors.primary,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _ConfirmButton(enabled: canConfirm, onTap: onConfirm),
        ],
      ),
    );
  }
```

- [ ] **Step C3.5: Aggiorna call-site di `_Footer` in `_RiepilogoScreenState.build()`**

Nello stesso file, trova il punto dove viene chiamato `_Footer(...)` (intorno a riga 80-84):

```dart
_Footer(
  total: total,
  canConfirm: lines.isNotEmpty,
  onConfirm: _onConfirm,
),
```

Sostituisci con (aggiungi anche la lettura del provider in cima al metodo `build`, vicino agli altri `ref.watch`):

```dart
// in cima al build(), dopo le altre letture (lines, bottles, total):
    final freeShipping = ref
        .watch(userProfileProvider)
        .value
        ?.restaurantFreeShipping
        ?? false;

// ... e più sotto, nel widget tree:
            _Footer(
              total: total,
              canConfirm: lines.isNotEmpty,
              freeShipping: freeShipping,
              onConfirm: _onConfirm,
            ),
```

NOTA: il `?? false` gestisce 3 casi: profilo non ancora caricato (loading), errore, o `restaurant_id IS NULL`. In tutti questi, fallback alla regola standard (€10 / €300). Niente UI "in attesa" dedicata.

Aggiungi anche l'import in cima al file se non c'è già:
```dart
import '../services/auth_service.dart';
```

- [ ] **Step C3.6: Verifica `flutter analyze`**

```bash
cd "D:/Dev/Progetti/enopera_portal"; flutter analyze 2>&1 | tail -10
```
Expected: `No issues found!`. Se errori: probabilmente nel mapping `UserProfile` mancano alcuni argomenti `required` - vedi quali e correggi (`?? false` se restaurantFreeShipping non è ancora popolato in qualche call site, ma a questo punto non dovrebbe esserci).

- [ ] **Step C3.7: Commit Chunk C3 (Flutter)**

```bash
git -C "D:/Dev/Progetti/enopera_portal" add lib/data/shipping.dart lib/services/auth_service.dart lib/screens/riepilogo_screen.dart
git -C "D:/Dev/Progetti/enopera_portal" commit -m "$(cat <<'EOF'
feat(shipping): standard €10/€300 rule + per-restaurant free_shipping flag

Adds shipping.dart with kShippingCost (€10), kFreeShippingThreshold
(€300), and computeShipping() helper. UserProfile reads the new
restaurants.free_shipping flag via supabase JOIN on profiles. The
_Footer in riepilogo_screen now computes shipping properly:
- free if restaurant has the flag (bypass rule)
- free if subtotal >= €300 (rule)
- €10 otherwise, with helper text "gratis sopra €300"

The standard rule was previously hardcoded as "Spedizione: inclusa"
for everyone - this commit implements the actual business logic.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Chunk D: Build + verify + push

### Task D1: Build admin + push

- [ ] **Step D1.1: Build admin**

```bash
cd "D:/Dev/Progetti/Enopera-Admin"; pnpm build 2>&1 | tail -15
```
Expected: `Compiled successfully`. Se errore: investiga prima di procedere.

- [ ] **Step D1.2: Push admin**

```bash
git -C "D:/Dev/Progetti/Enopera-Admin" push origin main 2>&1 | tail -5
```
Expected: 1 commit pushato (`feat(restaurants): admin checkbox 'Spedizione sempre gratuita'`). Vercel triggera build automatica.

- [ ] **Step D1.3: Attendi deploy Vercel + smoke**

Aspetta ~60-90s. Verifica root non in errore:
```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" -L https://enopera-admin-26yb.vercel.app/
```
Expected: `HTTP 200` (redirect a /admin/login → form).

### Task D2: Build APK Flutter

- [ ] **Step D2.1: flutter analyze finale (full)**

```bash
cd "D:/Dev/Progetti/enopera_portal"; flutter analyze 2>&1 | tail -5
```
Expected: `No issues found!`.

- [ ] **Step D2.2: Build APK release**

```bash
cd "D:/Dev/Progetti/enopera_portal"; flutter build apk --release 2>&1 | tail -8
```
Expected: `✓ Built build\app\outputs\flutter-apk\app-release.apk (XX.X MB)`.

- [ ] **Step D2.3: Niente push** - repo Flutter è local-only (vedi `feedback_push_freely.md`).

---

## Smoke test manuale (post-implementation)

Dopo che tutti i task sono completati e l'APK Flutter è installato sul device, eseguire questi smoke test:

### A - Filtro prezzo
1. Apri tab Catalogo
2. Tap bottone "Filtri" (icona tune accanto alla search bar) → pannello si apre con 2 input
3. Digita `20` in min → lista ridotta ai vini ≥ €20
4. Digita `30` in max → lista ridotta a €20–€30
5. Combina con chip "Bianco" → solo bianchi €20–€30
6. Search "Soave" → solo Soave bianchi €20–€30
7. Svuota un input → filter rimosso, badge "•" sparisce dal bottone Filtri quando entrambi vuoti
8. Tap "Filtri" → pannello si chiude ma filtri restano attivi (badge "•" se almeno uno popolato)

### B - Cantina distribuzione
1. Apri tab Cantina, tab Distribuzione attivo
2. Verifica colonne: **VINO | ORDINE** (no SCORTA)
3. Stepper continua a funzionare (+/- ordinano bottiglie)
4. Switch a tab Conto vendita
5. Verifica colonne: **VINO | SCORTA | REINTEGRO** (invariato)

### C - Free shipping
1. Admin: apri /ristoranti, edit un ristorante test (uno legato a un utente con cui puoi loggarti nel Flutter)
2. Spunta la nuova checkbox "Spedizione sempre gratuita" → Salva → drawer si chiude
3. Riapri il drawer → checkbox spuntata (persistenza)
4. Verifica DB via MCP:
   ```sql
   SELECT name, free_shipping FROM public.restaurants WHERE id = '<id>';
   ```
   Expected: `free_shipping = true`
5. Flutter: login con utente legato a quel ristorante
6. Aggiungi 1 vino (es. €25), vai al riepilogo → riga Spedizione mostra "gratis" verde, helper text NON presente, Totale = subtotale
7. Admin: rimuovi la spunta, Salva
8. Flutter: logout/login → ri-fetch del profilo → riepilogo per subtotale < €300 ora mostra "Spedizione €10.00" + helper "gratis sopra €300", Totale = subtotale + €10
9. Aggiungi vini fino a superare €300 (es. 5×€70 = €350) → "Spedizione: gratis" (per soglia, non per flag), helper text NON presente

---

## Note di esecuzione

- **Ordine task suggerito**: C1 → A1+A2 → B1 → C2 → C3 → D1 → D2. C1 in cima perché è migration DB (atomica, no rollback nel resto). A e B sono indipendenti, possono andare in qualsiasi ordine.
- **Shell**: i blocchi ```bash sono per Bash tool. I comandi `git -C "path"` evitano di toccare `cwd`.
- **Niente test framework**: solo `pnpm typecheck`/`build` + `flutter analyze` + smoke manuale.
- **Rollback per ogni chunk**:
  - A: `git revert` del commit catalog price filter
  - B: `git revert` del commit cantina SCORTA
  - C: revert dei 2 commit Flutter + admin; per la migration, `ALTER TABLE public.restaurants DROP COLUMN free_shipping;` via MCP (sicuro: nessun altro codice legge la colonna se il revert tocca tutti i call site)
