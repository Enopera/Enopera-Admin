# Tre modifiche minori - Design

**Status**: Draft, awaiting review
**Date**: 2026-05-27 (sera)
**Author**: brainstormed con utente, scritto da Claude
**Projects**: Enopera-Admin (Next.js 15 + Supabase) + Enopera Portal (Flutter)

## Problem statement

Tre richieste indipendenti emerse dopo lo smoke della release `/vini`:

1. **Filtro prezzo nel catalogo Flutter**: oggi l'app filtra solo per tipo (Rosso/Bianco/Bolle/Rosato) e fa search testuale. Su un catalogo di 800+ vini con range €14–€145, manca un modo per restringere a fasce di prezzo (es. "dammi i Bolle sotto €25").

2. **Cantina distribuzione - colonna "SCORTA" non più necessaria**: nel tab Distribuzione la colonna mostra il numero di bottiglie già in cantina (`inStock`). In questo canale Enopera fattura direttamente alla consegna, quindi il ristoratore non ha bisogno di "vedere il proprio inventario" - vuole solo aggiungere bottiglie al prossimo ordine. La colonna confonde. Tab Conto vendita (deposito) deve restare invariato.

3. **Flag spedizione sempre gratuita per ristorante**: oggi nel riepilogo ordine il Flutter ha hardcoded "Spedizione: inclusa" (sempre verde, gratis per tutti). Realtà business: standard è **€10 di spedizione, gratis sopra €300 di ordine**. Per alcuni ristoranti (es. accordi commerciali speciali) la spedizione deve essere sempre gratuita, indipendentemente dall'importo dell'ordine. Serve un flag editabile dall'admin nella pagina Ristoranti.

## Goals

- **A**: 2 input numerici min/max (€) in pannello collassabile "Filtri avanzati" sotto la search bar, combinati in AND con tipo + query
- **B**: rimozione header e cella SCORTA dalla cantina, **solo nel tab Distribuzione**
- **C**: implementazione regola standard di spedizione (€10 / gratis sopra €300) + flag per-restaurant che la bypassa rendendo sempre gratis; admin lo edita nel drawer Ristorante; Flutter lo legge via JOIN su `restaurants` e applica la logica nel riepilogo
- Tutte e tre le modifiche commitabili insieme o separatamente, nessuna dipendenza tra loro

## Non-goals (v1)

- **Filtro prezzo**:
  - Range slider visivo (solo input testuali)
  - Validazione "min ≤ max" con errore visibile (se invertiti, lista risulta vuota - feedback naturale sufficiente)
  - Persistenza dei filtri tra sessioni (state ephemeral in-memory)
  - Sort per prezzo (rimane l'ordine produttore + nome)
- **Cantina B**:
  - Modifiche al tab Conto vendita (restano SCORTA + REINTEGRO)
  - Restructure più ampio del layout cantina (solo rimozione condizionale di una colonna)
- **Free shipping C**:
  - Editing delle costanti `kShippingCost` / `kFreeShippingThreshold` da admin UI (resta hardcoded nel Flutter, modificabile via release APK - vedi domanda chiusa nel brainstorming)
  - Notifica al ristoratore quando il flag cambia
  - Audit log delle modifiche al flag
  - Visualizzazione del flag nella tabella ristoranti admin (solo nel drawer di edit)
  - Calcolo spedizione differente per zone geografiche o per peso/volume
  - Logica spedizione applicata fuori dal `riepilogo_screen.dart` (es. preview dal catalogo)

## Architecture overview

Tre cambiamenti indipendenti. A e B sono Flutter-only. C tocca DB + Next admin + Flutter.

### A - Filtro prezzo Flutter

Stato locale Riverpod (no persistenza). Filter applicato in-memory sulla lista `wines` già caricata da `catalogProvider`. UI in `catalogo_screen.dart` con `ExpansionTile` o pannello custom collassabile.

### B - Cantina distribuzione

Modifica condizionale su `channel == WineChannel.distribuzione`: nascondi colonne SCORTA in `_ColumnsHeader` e `_WineCard`. Nessun cambio per `contoVendita`.

### C - Free shipping flag

```
┌─────────────────────────────────────────────┐
│ DB (restaurants)                            │
│  + free_shipping bool NOT NULL DEFAULT false│
└──────────────┬──────────────────────────────┘
               │
        ┌──────┴──────┐
        ↓             ↓
   Admin Next      Flutter
   (read+write)    (read only via JOIN)
        │             │
        ↓             ↓
  RestaurantsList  userProfileProvider
  drawer checkbox  + restaurantFreeShipping
                          │
                          ↓
                  riepilogo_screen.dart
                  computeShipping(total, flag)
```

## Sezione A - Filtro prezzo Flutter

### File modificati

| Path | Modifica |
|---|---|
| `lib/state/app_state.dart` | Aggiungi `priceMinProvider`, `priceMaxProvider`, `advancedFiltersExpandedProvider`. |
| `lib/screens/catalogo_screen.dart` | Aggiungi widget `_AdvancedFiltersPanel`; estendi il filter in `_buildLoaded`; aggiungi bottone toggle nella riga search/filtri. |

### Stato

```dart
// app_state.dart
final priceMinProvider = StateProvider<double?>((_) => null);
final priceMaxProvider = StateProvider<double?>((_) => null);
final advancedFiltersExpandedProvider = StateProvider<bool>((_) => false);
```

### Filter logic (in `_buildLoaded`)

```dart
final priceMin = ref.watch(priceMinProvider);
final priceMax = ref.watch(priceMaxProvider);
// ...
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

### UI

**Layout change**: la search bar oggi è figlia diretta di un `Column` (catalogo_screen.dart linea 51). Diventa figlia di un nuovo `Row` insieme al bottone "Filtri":

```dart
Row(
  children: [
    Expanded(child: _SearchBar(...)),
    const SizedBox(width: 8),
    _FiltersToggleButton(
      active: ref.watch(advancedFiltersExpandedProvider),
      hasActiveFilters: priceMin != null || priceMax != null,
      onTap: () => ref.read(advancedFiltersExpandedProvider.notifier).state =
        !ref.read(advancedFiltersExpandedProvider),
    ),
  ],
),
```

Quando expanded (provider `true`), sotto la `Row` search+bottone (e sopra i chip tipo) appare il pannello:

```
┌────────────────────────────────────────────────┐
│ PREZZO                                         │
│ ┌────────────────┐ ┌────────────────┐         │
│ │ € min  [____] │ │ € max  [____] │         │
│ └────────────────┘ └────────────────┘         │
└────────────────────────────────────────────────┘
```

**Widget `_AdvancedFiltersPanel`**: deve essere un `ConsumerStatefulWidget` (NON `ConsumerWidget`), per gestire correttamente il lifecycle di:

- 2 `TextEditingController` (uno per min, uno per max) - istanziati in `initState()` e disposti in `dispose()`. NON in `build()` (footgun esistente in `_SearchBar` - non replicarlo qui).
- 2 `Timer?` per il debounce - cancellati in `dispose()` per evitare leak.

```dart
class _AdvancedFiltersPanel extends ConsumerStatefulWidget {
  const _AdvancedFiltersPanel();
  @override
  ConsumerState<_AdvancedFiltersPanel> createState() => _AdvancedFiltersPanelState();
}

class _AdvancedFiltersPanelState extends ConsumerState<_AdvancedFiltersPanel> {
  late final TextEditingController _minCtrl;
  late final TextEditingController _maxCtrl;
  Timer? _minDebounce;
  Timer? _maxDebounce;

  @override
  void initState() {
    super.initState();
    _minCtrl = TextEditingController(text: ref.read(priceMinProvider)?.toStringAsFixed(0) ?? '');
    _maxCtrl = TextEditingController(text: ref.read(priceMaxProvider)?.toStringAsFixed(0) ?? '');
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

  // ... analogo _onMaxChanged

  @override
  Widget build(BuildContext context) {
    // 2 TextField con prefixText: '€', keyboardType numeri
    // onChanged: _onMinChanged / _onMaxChanged
  }
}
```

- `TextField` `keyboardType: TextInputType.numberWithOptions(decimal: true)` (accetta anche decimali, l'utente potrebbe digitare 12.5)
- Prefisso `€`, label nel placeholder
- Empty string → `null` (= nessun filtro)
- Parsing tollerante: `double.tryParse(value.trim())` - null se invalid → no filter
- Nessun bottone "Reset" - bastano gli input svuotabili
- Niente validazione visiva: min > max → lista vuota, l'utente capisce

Quando i filtri sono attivi (almeno uno dei due `!= null`), il bottone Filtri mostra un piccolo badge "•" (color carmine).

### Edge cases

- Min > max → lista vuota, niente warning (feedback naturale: l'utente si accorge che è incoerente)
- Input non numerico → parsing fallisce → `null` → no filter
- Pannello chiuso ma filtri attivi → i filtri restano applicati (state persiste, UI compatta)

## Sezione B - Cantina distribuzione (rimuovi SCORTA)

### File modificati

| Path | Modifica |
|---|---|
| `lib/screens/cantina_screen.dart` | Modifica condizionale di `_ColumnsHeader` e `_WineCard` basata su `channel`. |

### Header colonne (linee 291-313)

Attuale:
```dart
class _ColumnsHeader extends StatelessWidget {
  final WineChannel channel;
  const _ColumnsHeader({required this.channel});
  @override
  Widget build(BuildContext context) {
    final style = AppTextStyles.eyebrowTight();
    final actionLabel =
        channel == WineChannel.distribuzione ? 'ORDINE' : 'REINTEGRO';
    return Padding(
      padding: const EdgeInsets.fromLTRB(34, 4, 34, 10),
      child: Row(
        children: [
          Expanded(child: Text('VINO', style: style)),
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

Nuovo:
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

### Cella WineCard (linee 390-413)

`_WineCard` legge `cantinaChannelProvider` direttamente nel build (è già `ConsumerWidget`). Trade-off accettato: ogni `_WineCard` re-watcha il provider, ma con max ~20-50 cards per tab non è un problema di performance. Evita prop drilling che richiederebbe di toccare anche `cantinaLinesProvider`.

**Importante**: `final lowStock = entry.inStock <= 3;` (linea 353 attuale) viene usato SOLO dentro la `SizedBox` SCORTA. Spostarlo dentro il branch `if (!isDistribution)` per evitare warning "unused_local_variable" da Dart analyzer.

```dart
@override
Widget build(BuildContext context, WidgetRef ref) {
  final wine = line.wine;
  final entry = line.entry;
  final channel = ref.watch(cantinaChannelProvider);
  final isDistribution = channel == WineChannel.distribuzione;

  return Container(
    // ... layout invariato
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(child: Column(/* nome + producer/year */)),
        if (!isDistribution) ...[
          () {
            final lowStock = entry.inStock <= 3;
            return SizedBox(
              width: 68,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('${entry.inStock}', style: AppTextStyles.stockNumber(
                    color: lowStock ? AppColors.primarySoft : AppColors.ink,
                  )),
                  const SizedBox(height: 2),
                  Text(
                    lowStock ? 'bassa' : 'btg',
                    style: GoogleFonts.dmSans(
                      fontSize: 9, letterSpacing: 1, fontWeight: FontWeight.w500,
                      color: lowStock ? AppColors.primarySoft : AppColors.inkMuted,
                    ),
                  ),
                ],
              ),
            );
          }(),
        ],
        SizedBox(
          width: kStepperWidth,
          child: Center(child: QtyStepper(/* invariato */)),
        ),
      ],
    ),
  );
}
```

**Alternativa più Dart-idiomatica** (preferita se passa flutter analyze): estrarre un helper privato `_StockCell` che riceve `entry` e fa il calcolo lowStock internamente:

```dart
// Fuori dalla classe _WineCard
class _StockCell extends StatelessWidget {
  final InventoryEntry entry;
  const _StockCell({required this.entry});
  @override
  Widget build(BuildContext context) {
    final lowStock = entry.inStock <= 3;
    return SizedBox(
      width: 68,
      child: Column(/* ... come sopra */),
    );
  }
}
// E in _WineCard:
//   if (!isDistribution) _StockCell(entry: entry),
```

Questa seconda versione è più leggibile e testabile. Da usare in implementazione.

### Effetto visivo

**Distribuzione** (after): `VINO | ORDINE [- 0 +]`
**Conto vendita** (invariato): `VINO | SCORTA | REINTEGRO [- 0 +]`

## Sezione C - Free shipping flag

### C1 - DB migration

```sql
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS free_shipping boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.restaurants.free_shipping IS
  'Se true, bypassa la soglia di gratuità (€300) - spedizione sempre gratis per questo ristorante, indipendentemente dall''importo ordine. Editato dall''admin in /ristoranti.';
```

Applicabile via `mcp__c366e5da-...__apply_migration` con nome `add_free_shipping_to_restaurants`. Non-breaking (default false = comportamento attuale per i ristoranti esistenti). `IF NOT EXISTS` per idempotenza in caso la migration sia applicata 2 volte.

### C2 - Admin (Next.js)

**File modificati** (verificati contro codebase corrente):

| Path | Modifica |
|---|---|
| `lib/restaurants/types.ts` | `AdminRestaurant` (`interface`, non `type`) - aggiungi `freeShipping: boolean`. |
| `lib/restaurants/actions.ts` | `RestaurantInput` (interface, **vive qui**, non in `types.ts`) - aggiungi `freeShipping: boolean`. Aggiungi mapping `free_shipping: input.freeShipping` nel `toRow()` helper condiviso (~linea 25-38). |
| `lib/restaurants/queries.ts` | Includi `free_shipping` nel select + mapping camelCase nell'output `AdminRestaurant`. |
| `components/admin/restaurants-list.tsx` | **Due useState initializers** da aggiornare (entrambi inizializzano `RestaurantInput`): il form di **edit** (~linea 320) e il form di **create** (~linea 862). Aggiungi `freeShipping: false` come default in entrambi. Aggiungi UI checkbox sotto i campi anagrafici principali. |

#### Schema TypeScript

```ts
// lib/restaurants/types.ts
export interface AdminRestaurant {
  // ... existing fields
  freeShipping: boolean;
}

// lib/restaurants/actions.ts
export interface RestaurantInput {
  // ... existing fields
  freeShipping: boolean;
}
```

#### Server action

```ts
// lib/restaurants/actions.ts - toRow() helper (~linea 25)
function toRow(input: RestaurantInput) {
  return {
    // ... existing mapping (name, address, etc.)
    free_shipping: input.freeShipping,
  };
}
// Usato sia da createRestaurant che da updateRestaurant.
```

#### UI checkbox

Aggiungere nel drawer (o form) dopo gli input principali (P.IVA, indirizzo, ecc.), in una sezione "Condizioni commerciali":

```tsx
<label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
  <input
    type="checkbox"
    checked={form.freeShipping}
    onChange={(e) => setForm({ ...form, freeShipping: e.target.checked })}
  />
  <span style={{ fontFamily: ADM.sans, fontSize: 13, color: ADM.ink }}>
    Spedizione sempre gratuita
  </span>
</label>
<div style={{ marginLeft: 24, fontSize: 11, color: ADM.inkSoft, fontFamily: ADM.sans }}>
  Bypassa la soglia di gratuità (€300) - la spedizione sarà gratis per
  ogni ordine di questo ristorante, indipendentemente dall'importo.
</div>
```

### C3 - Flutter

**File modificati/creati**:
| Path | Modifica |
|---|---|
| `lib/data/shipping.dart` (nuovo) | Costanti `kShippingCost`, `kFreeShippingThreshold` + `ShippingCalc` + funzione `computeShipping`. |
| `lib/services/auth_service.dart` | `UserProfile` aggiunge `restaurantFreeShipping: bool` (default false); `userProfileProvider` modifica la query per fare JOIN su `restaurants`. |
| `lib/screens/riepilogo_screen.dart` | `_Footer` legge il flag, calcola via `computeShipping`, mostra "gratis"/"€10" + helper text + totale aggiornato. |

#### Shipping helper

```dart
// lib/data/shipping.dart
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
    return const ShippingCalc(cost: 0, isFree: true, reason: 'ristorante con spedizione gratuita');
  }
  if (subtotal >= kFreeShippingThreshold) {
    return const ShippingCalc(cost: 0, isFree: true, reason: 'ordine sopra €300');
  }
  return const ShippingCalc(cost: kShippingCost, isFree: false, reason: 'sotto soglia €300');
}
```

#### UserProfile + provider

```dart
// auth_service.dart - aggiungere campo
class UserProfile {
  // ... existing
  final bool restaurantFreeShipping;  // default false; viene da restaurants.free_shipping via JOIN
  // costruttore: required this.restaurantFreeShipping (con default false nella factory)
}

// userProfileProvider - modificare la query
final row = await supabase
  .from('profiles')
  .select('*, restaurants(free_shipping)')   // JOIN
  .eq('id', user.id)
  .maybeSingle();

// nel mapping:
// Nota: supabase-js auto-detects 1:1 vs 1:N dalla cardinalità della FK -
// `profiles.restaurant_id` è single FK quindi `restaurants` arriva come
// singolo oggetto (non array). Se non lo fosse, sarebbe `List<dynamic>`.
restaurantFreeShipping: (row?['restaurants'] as Map<String, dynamic>?)?['free_shipping'] as bool? ?? false,
```

**RLS - già OK** ✅: verificato che la policy `restaurants_select_linked` su `public.restaurants` permette già il SELECT al linked user via `EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.restaurant_id = restaurants.id)`. Nessuna modifica RLS richiesta. Il fallback `?? false` resta come safety net (se il JOIN ritorna null per qualsiasi motivo - es. `restaurant_id IS NULL`).

#### Riepilogo - approccio: prop drilling

**Decisione**: il parent `_RiepilogoScreenState` (già `ConsumerState`) legge `userProfileProvider` e passa il flag come prop a `_Footer`. `_Footer` resta `StatelessWidget` (testabile senza Riverpod).

**Costruttore aggiornato** `_Footer` (riepilogo_screen.dart:223-232):

```dart
class _Footer extends StatelessWidget {
  final double total;
  final bool canConfirm;
  final bool freeShipping;          // NUOVO
  final VoidCallback onConfirm;

  const _Footer({
    required this.total,
    required this.canConfirm,
    required this.freeShipping,    // NUOVO
    required this.onConfirm,
  });
  // ...
}
```

**Call site aggiornato** (riepilogo_screen.dart:80-84):

```dart
// dentro _RiepilogoScreenState.build()
final freeShipping = ref
    .watch(userProfileProvider)
    .value
    ?.restaurantFreeShipping
    ?? false;   // durante loading o error → default false (= regola standard)

// ...
_Footer(
  total: total,
  canConfirm: lines.isNotEmpty,
  freeShipping: freeShipping,
  onConfirm: _onConfirm,
),
```

Nota AsyncValue: il `.value` di un FutureProvider è `null` finché loading o se error → `?? false` fa fallback alla regola standard (€10 / gratis sopra €300). L'utente non vede mai una visualizzazione "in attesa" della tariffa spedizione, vede direttamente quella standard finché il profilo non si carica (tipicamente <500ms).

**Body `_Footer.build()`** aggiornato:

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
            Text('Totale', style: GoogleFonts.cormorantGaramond(
              fontSize: 18, fontWeight: FontWeight.w500, color: AppColors.ink,
            )),
            const Spacer(),
            Text(
              '€${realTotal.toStringAsFixed(2)}',
              style: GoogleFonts.cormorantGaramond(
                fontSize: 28, fontWeight: FontWeight.w600,
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

## Data flow

### A - Filtro prezzo

```
TextField onChanged (con debounce 200ms)
  ↓
ref.read(priceMinProvider.notifier).state = parsed
  ↓
_buildLoaded ref.watch(priceMinProvider)
  ↓
filter `wines.where(... w.price >= priceMin)`
  ↓
ListView re-render
```

### C - Free shipping

```
userProfileProvider → JOIN profiles + restaurants(free_shipping)
  ↓
UserProfile.restaurantFreeShipping
  ↓
_RiepilogoScreenState.build → ref.watch(userProfileProvider)
  ↓
prop al _Footer
  ↓
computeShipping(subtotal, freeShippingFlag)
  ↓
display "gratis" / "€10" + total ricalcolato
```

## Error handling

| Sito | Errore | Behavior |
|---|---|---|
| Filtro prezzo input non valido | `double.tryParse` ritorna null | Trattato come "no filter" - nessun warning visibile |
| Filtro prezzo min > max | Lista vuota | Nessun warning - l'utente vede 0 risultati e capisce |
| JOIN restaurants RLS-bloccato | `restaurants` key nel JSON è null | Fallback `?? false` → spedizione regolare (€10/€300 logic) |
| Admin checkbox freeShipping non passato (legacy form data) | TypeScript enforce `freeShipping: boolean` in `RestaurantInput` (compile-time) + DB ha `DEFAULT false` per stray legacy inserts | Doppia barriera, niente runtime fallback necessario |
| Migration DB già applicata 2 volte | `ADD COLUMN IF NOT EXISTS` non usato - error "already exists" | Usare `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` per idempotenza |

## Verification

### Pre-merge
- `pnpm typecheck` + `pnpm lint` + `pnpm build` zero errori (Admin)
- `flutter analyze` zero issue (Portal)
- APK release build success

### Smoke A - Filtro prezzo
1. Apri tab Catalogo
2. Tap bottone "Filtri" → pannello si apre con 2 input
3. Digita `20` in min → lista ridotta ai vini ≥ €20
4. Digita `30` in max → lista ridotta a €20–€30
5. Combina con chip "Bianco" → solo bianchi €20–€30
6. Search "Soave" → solo Soave bianchi €20–€30
7. Svuota un input → filter rimosso
8. Tap "Filtri" → pannello si chiude ma filtri restano attivi (bottone mostra badge •)

### Smoke B - Cantina distribuzione
1. Apri tab Cantina, tab Distribuzione attivo
2. Verifica colonne: **VINO | ORDINE** (no SCORTA)
3. Stepper continua a funzionare (+/- ordinano bottiglie)
4. Switch a tab Conto vendita
5. Verifica colonne: **VINO | SCORTA | REINTEGRO** (invariato)

### Smoke C - Free shipping
1. Admin: apri /ristoranti, edit un ristorante test
2. Spunta la checkbox "Spedizione sempre gratuita"
3. Salva → drawer si chiude, lista mostra il ristorante editato
4. Riapri → checkbox spuntata (persistenza)
5. DB verify via MCP: `SELECT free_shipping FROM restaurants WHERE id = '...'` → `true`
6. Flutter: login con utente legato a quel ristorante
7. Aggiungi 1 vino, vai al riepilogo → spedizione mostra "gratis" (subtotale < €300 ma flag attivo)
8. Modifica admin → toglie la spunta
9. Flutter logout/login → cache invalidata → riepilogo per subtotale < €300 mostra "Spedizione €10" + helper "gratis sopra €300"
10. Aggiungi vini fino a superare €300 → "Spedizione: gratis" (per soglia, non per flag)
11. Test totale: sub €50, spedizione €10, totale €60 ✓

## Risk / rollback

| Risk | Mitigation |
|---|---|
| Migration `ADD COLUMN` blocca update concorrenti | Default value statico (false), no scan: lock minimo, irrilevante per 50+ righe |
| RLS su `restaurants` blocca il JOIN dal Flutter | Fallback `?? false` mantiene comportamento standard; da fixare in policy se serve |
| Admin form esistente non gestisce il nuovo campo | Default `false` lato server action + `if exists` check |
| Filter price persiste tra cambi di tab | Provider è ephemeral StateProvider - perso al restart app; accettabile |
| Cantina distribuzione `lowStock` non più visibile (era warning visivo) | Trade-off accettato: in distribuzione il ristoratore non gestisce stock |
| Flutter UserProfile breaking change (campo nullable→required) | Default `false` nel costruttore evita breaking |

## Out of scope follow-ups

- Admin: visualizzazione flag nella tabella ristoranti (es. icona 🚚 nelle row con flag true)
- Admin: bulk action "Imposta free_shipping su N ristoranti selezionati"
- Flutter: filtro per regione/vitigno nel pannello "Filtri avanzati" (oltre prezzo)
- Flutter: sort options (prezzo asc/desc, annata, alfabetico)
- Flutter: badge "Spedizione gratuita" nel tab Profilo (se flag attivo) per dare visibilità extra al ristoratore
- Settings table per `kShippingCost` / `kFreeShippingThreshold` editabili da admin (oggi hardcoded)
- Calcolo spedizione differenziato per zona/peso/volume
