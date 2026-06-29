# Handoff — feature "Collega BP Starty + auto-compila" (+ code residui)

Data: 2026-06-29. Il contesto della chat precedente era pieno; questo file riassume tutto
per ripartire. Progetti: `D:\Dev\Progetti\Enopera\Enopera-Admin` (Next.js + Supabase edge
functions) e `D:\Dev\Progetti\Enopera\Enopera-Portal` (app Flutter).

Supabase project ref: **vguueimgbngnjgoockge**.

## Cosa stiamo facendo

Bug segnalato: ordini Starty con indirizzo spedizione/fatturazione sbagliato (caso Osteria
Metti → indirizzo ungherese). Causa: `place-order` prendeva la **prima** location `shipTo`
del BP, e i clienti multi-sede (ALCI SNC = Osteria Metti + Osteria Preella, stesso BP 16874)
non erano distinguibili. Inoltre confusione **codice BP vs businessPartnerId API** (Preella
aveva `starty_bp_id=25010`, che è il codice "BP-25010", non l'id API 16874 → 404).

Soluzione (approvata): il **ristorante** diventa la fonte di verità del collegamento Starty
(bp_id + ID location spedizione/fatturazione); nel form admin si **cerca il BP** (P.IVA/nome)
e si **scelgono le location**; `place-order` usa quegli ID.

**Spec completo e approvato:** `docs/superpowers/specs/2026-06-29-restaurant-starty-bp-link-design.md`
(leggilo: contiene modello dati, componenti a–e, gestione errori, trigger, fallback). Passato
2 round di review.

## FATTO e LIVE in produzione (verificato)

1. **Migration** applicata: `public.restaurants` ha 2 nuove colonne `starty_ship_location_id`,
   `starty_bill_location_id` (int null). Migration Supabase `add_restaurant_starty_location_ids`.
2. **Fix dati**: Osteria Metti (rest. `7b600060-65e2-4d8a-96a2-15d706108b73`) → bp 16874,
   ship 19999, bill 17758. Osteria Preella (rest. `87112086-710e-4369-8cd5-7290df33afed`) →
   bp 16874 (era 25010), ship 20000, bill 17758. Il trigger `fn_sync_profiles_from_restaurant`
   ha propagato bp_id=16874 ai profili (Preella 404 risolto).
3. **Edge function `starty-bp-search`** deployata (v1) + testata. API:
   - `?q=<P.IVA 11 cifre | nome>` → `{ok, results:[{businessPartnerId, name, taxId, city, locations:[]}]}` (lista, **senza** location).
   - `?bpId=<id>` → idem ma con `locations:[{id, name, address, city, postalCode, countryId, billTo, shipTo}]`.
   - Sorgente: `supabase/functions/starty-bp-search/index.ts`.
4. **`place-order` v46** deployata (`verify_jwt` preservato, smoke-test ok). Ora: bp_id +
   location **dalla stessa fonte** — ristorante se collegato (`restaurant.starty_bp_id` +
   `starty_ship/bill_location_id` → `indSpedizioneId`/`indFatturazioneId`), altrimenti fallback
   a `profile.starty_bp_id` + `pickBpLocation`. Sorgente: `supabase/functions/place-order/index.ts`.

→ **I NUOVI ordini di Metti/Preella escono già con gli indirizzi giusti.** (Verifica: ordine
di prova dall'app.)

## DA FARE (lavoro residuo)

### 1. UI admin (il pezzo grosso rimasto) — task principale
File: `components/admin/restaurants-list.tsx` + `lib/restaurants/actions.ts`.
- Aggiungere 2 **server action** in `lib/restaurants/actions.ts` che chiamano l'edge function
  `starty-bp-search`: `searchStartyBp(q)` e `getStartyBp(bpId)`. Pattern chiamata edge da server:
  vedi `lib/price-lists/actions.ts` → `callEdgeFn` (usa `process.env.NEXT_PUBLIC_SUPABASE_URL` +
  `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}`).
- Nel drawer ristorante: campo ricerca (P.IVA/nome) + bottone "Cerca su Starty" → lista risultati
  → scelta BP → chiama `getStartyBp` → 2 `<select>` **Spedizione** e **Fatturazione** con le
  location (preselezione se unica) → auto-compila (modificabili) `ragione_sociale`(=name),
  `vat`(=taxId 11 cifre), indirizzo ship/bill dalle location scelte.
- Salvare `starty_bp_id`, `starty_ship_location_id`, `starty_bill_location_id` (estendere
  `PriceListInput`/l'update ristorante e `lib/restaurants/types.ts`).
- **RIMUOVERE** il campo testo libero "StartyERP BP ID" — compare in **DUE** punti:
  `restaurants-list.tsx` ~riga 488 (form add) e ~riga 1039 (form edit). Sostituirlo con display
  read-only del BP collegato + bottone "Cambia/Ricollega".
- Verifica: `pnpm typecheck` poi `pnpm build` (cwd Enopera-Admin).

### 2. Deploy admin
`git push origin main` → Vercel auto-deploya (repo `Enopera/Enopera-Admin`, branch main).

### 3. Ordine 26/0705 (orderId 41995) — manuale, NON via API
Starty **rifiuta** la modifica via API di documenti completati ("Impossibile modificare un
documento già completato"). La spedizione è ancora su location sbagliata (216473). **Va corretta
nella UI di Starty**: riaprire l'ordine, impostare Spedizione = *Osteria Metti / Incaffi*. Solo
questo vecchio ordine; i nuovi sono ok.

### 4. Fix prezzi app (già fatto, da deployare)
In `Enopera-Portal` ho cambiato gli importi cliente a **2 decimali** (`toStringAsFixed(2)`):
`widgets/order_fab.dart`, `screens/riepilogo_screen.dart`, `dettaglio_ordine_screen.dart`,
`profilo_screen.dart`, `storico_screen.dart`. `flutter analyze` pulito. **Modifiche non
committate** nel working tree. Serve: commit + `flutter build apk --release` (o il flow APK del
progetto). Repo Portal è locale (non su GitHub).

## Note tecniche utili

- **Deploy edge function**: `npx supabase functions deploy <slug> --project-ref vguueimgbngnjgoockge`
  (CLI già autenticata; warning "Docker is not running" è benigno, deploya via API). Da eseguire
  con cwd = Enopera-Admin. Per funzioni piccole va bene anche il tool MCP `deploy_edge_function`
  (inline); per file grandi (es. place-order, con HTML) usa la CLI per evitare escaping.
- **ALCI SNC, BP 16874, location**: 17758 = Corso Cangrande/Lazise (billTo+shipTo);
  19999 = "Osteria Metti"/Incaffi (shipTo); 20000 = "Osteria Tenuta Preella"/Cavaion (shipTo).
- **Trigger** `fn_sync_profiles_from_restaurant`: AFTER UPDATE su `restaurants`, copia ai profili
  collegati `restaurant_name, address, city, district, vat, starty_bp_id, member_since_year`
  (NON le location). Quindi aggiornare `restaurant.starty_bp_id` basta a sistemare i profili.
- **Starty API**: lista BP `GET /v3/business-partners?taxId=|businessName=` (senza entità interne);
  singolo `GET /v3/business-partners/{id}` (con `locations`). Spec OpenAPI: `Enopera-Admin/_starty-spec.json`
  (gitignored). Ordini: `indSpedizioneId`/`indFatturazioneId` = businessPartnerLocationId.
- **debug-starty-pricing**: edge function diagnostica, ora **disabilitata** (stub 410).
  **Eliminala dalla dashboard Supabase** quando vuoi (non serve più).
- **Memoria**: `~/.claude/projects/.../memory/starty-catalog-sync-perf.md` documenta la saga
  prezzi (risolta) — contesto extra, non necessario per questa feature.

## Stato git (Enopera-Admin, branch main)
Committato in questa sessione: spec (2 commit), `place-order` + `starty-bp-search` + questo
handoff. La UI admin è da fare. Nessuna modifica admin non committata a parte questo file.
