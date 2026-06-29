# Collegamento BP Starty + auto-compilazione ristorante — Design

Data: 2026-06-29
Stato: approvato (design), pronto per il piano di implementazione

## Contesto / problema

Gli ordini creati da `place-order` escono su Starty con indirizzi di spedizione/fatturazione
sbagliati (caso reale: Osteria Metti → indirizzo ungherese, poi → sede Lazise invece del locale).

Cause radice individuate (debug 2026-06-29):

1. **Gli indirizzi dell'ordine Starty NON vengono dai campi indirizzo dell'admin.** Vengono
   dalle *location* del Business Partner su Starty: `place-order` manda `indFatturazioneId` /
   `indSpedizioneId` = `businessPartnerLocationId`. La funzione `pickBpLocation` sceglie la
   **prima** location `shipTo` → ambigua per i BP multi-sede.
2. **Clienti multi-sede.** ALCI SNC (BP 16874) ha 3 location shipTo: Lazise (sede), Incaffi
   (Osteria Metti, loc 19999), Cavaion (Osteria Tenuta Preella, loc 20000). Un solo flag
   `shipTo` non può distinguere Metti da Preella: **solo il nostro codice**, che sa quale
   ristorante ha ordinato, può scegliere la location giusta.
3. **Codice vs ID.** Su Starty il "codice" BP (`BP-25010`) ≠ `businessPartnerId` API (16874).
   Osteria Preella ha `starty_bp_id = 25010` (il numero del codice) → l'API dà 404.
4. **Doppia fonte del BP id.** `place-order` legge `profile.starty_bp_id` (utente), mentre il
   form admin salva su `restaurants`. Le due fonti divergono (è il bug di Preella).

## Obiettivo

Nel form ristorante dell'admin, collegare un Business Partner Starty cercandolo (P.IVA/nome),
sceglierlo, scegliere le location di **spedizione** e **fatturazione**, e auto-compilare i campi.
`place-order` usa gli ID location salvati. Il **ristorante** diventa l'unica fonte di verità del
collegamento Starty.

## Decisioni (dal brainstorming)

- Collegamento BP: **solo ricerca-e-scegli** per P.IVA/nome (niente incolla-ID).
- Location: **selettori espliciti** Spedizione + Fatturazione (preselezione se unica).
- Campi auto-compilati: **modificabili** (l'auto-fill è una comodità, non un mirror read-only).
- Scope: **fix completo** end-to-end (form + place-order + dati rotti).
- YAGNI: niente sync automatico continuo; auto-fill on-demand (al collegamento / "ricarica").

## Modello dati

Migration su `public.restaurants` (aggiunte; `starty_bp_id` esiste già):

| Colonna | Tipo | Note |
|---|---|---|
| `starty_ship_location_id` | int null | `businessPartnerLocationId` per la spedizione |
| `starty_bill_location_id` | int null | `businessPartnerLocationId` per la fatturazione |

`restaurants.starty_bp_id` diventa la fonte di verità (insieme alle due location).
`profile.starty_bp_id` resta solo come fallback per utenti senza `restaurant_id`.

## Componenti

### a) Edge function `starty-bp-search` (nuova)

L'admin (Vercel) non ha il token Starty; ce l'hanno solo le edge function. La funzione:
- `GET ?q=<P.IVA o testo>&mode=search` → chiama `GET /v3/business-partners?taxId=` (se q è
  P.IVA, 11 cifre) oppure `?businessName=` → ritorna lista compatta:
  `[{ businessPartnerId, name, taxId, city, locations: [{ id, name, city, countryId, billTo, shipTo }] }]`.
- `GET ?bpId=<id>&mode=byId` → ricarica le location di un BP (per la modifica).
- `verify_jwt: true` (chiamata server-side dall'admin con la service-role key).
- Mai espone il token; solo READ su Starty.

### b) UI admin (`components/admin/restaurants-list.tsx` + `lib/restaurants/actions.ts`)

Nel drawer del ristorante, sezione "Collegamento Starty":
- Campo ricerca (P.IVA/nome) + bottone **Cerca su Starty** → server action `searchStartyBp(q)`
  che chiama l'edge function → mostra i risultati → si **sceglie** un BP.
- Alla scelta: due `<select>` **Spedizione** e **Fatturazione** popolati con le location del BP
  (preselezione se unica). Mostra città/nome per disambiguare ("Osteria Metti · Incaffi").
- Auto-compila (modificabili): `ragione_sociale` (= BP name), `vat` (= taxId), indirizzo
  spedizione (`address`/`city`) dalla location ship, fatturazione (`billing_address`/`billing_city`)
  dalla location bill.
- Salva (server action `updateRestaurant`): `starty_bp_id`, `starty_ship_location_id`,
  `starty_bill_location_id` + i campi testo.

### c) `place-order` (modifica)

- Estende la select su `restaurants` (già presente, ~riga 251) con
  `starty_bp_id, starty_ship_location_id, starty_bill_location_id`.
- **Fonte del BP id**: se `profile.restaurant_id` e `restaurant.starty_bp_id` → usa quello;
  altrimenti fallback a `profile.starty_bp_id` (retrocompat).
- **Location**: se il ristorante ha `starty_ship_location_id` / `starty_bill_location_id` → usali
  come `indSpedizioneId` / `indFatturazioneId`; altrimenti fallback all'attuale `pickBpLocation`.
  Se la location salvata non esiste più lato Starty, l'ordine non fallisce (Starty usa il
  default / o si degrada al fallback).

### d) Fix dati (una tantum, dopo la migration)

- Osteria Metti (rest. 7b600060…): `starty_ship_location_id = 19999`, `starty_bill_location_id = 17758`.
  Profili Metti: `starty_bp_id` già 16874 (ok).
- Osteria Preella (rest. 87112086…): `starty_bp_id = 16874` (era 25010),
  `starty_ship_location_id = 20000`, `starty_bill_location_id = 17758`. Aggiornare anche il
  `profile.starty_bp_id` dei suoi utenti 25010 → 16874.

### e) Correzione ordine 41995 (doc 26/0705)

Dopo il deploy della fix: correggere l'ordine su Starty impostando `indSpedizioneId = 19999`
(Osteria Metti / Incaffi), mantenendo `indFatturazioneId = 17758`, e riportandolo a documentStatus
`CO`. Mantiene lo stesso documento 26/0705 e lo stesso ordine in app. **Coordinare con l'utente**
(l'ordine è in bozza perché editato a mano): toccarlo via API solo dopo conferma.

## Flusso dati

Form admin → server action → edge `starty-bp-search` → Starty → scelta BP+location → salva su
`restaurants`. Ordine app → `place-order` legge `restaurant.starty_bp_id` + location ids → invia
`indSpedizioneId`/`indFatturazioneId` corretti → ordine Starty con indirizzi giusti.

## Gestione errori

- Ricerca senza risultati / Starty giù / 429 → messaggio chiaro nel form + possibilità di
  riprovare. Il salvataggio del ristorante non è bloccato dal collegamento BP (rimane opzionale).
- Location selezionata non più valida → `place-order` non fallisce (fallback).
- Edge function: errori Starty mappati a messaggi leggibili; mai esporre il token.

## Test

- Edge `starty-bp-search`: ricerca per P.IVA nota (ALCI SNC → 16874, 3 location) e per nome;
  caso 0 risultati; caso `byId`.
- `place-order`: ristorante con location salvate → ordine con `indSpedizioneId` atteso; ristorante
  senza → fallback `pickBpLocation`; profilo senza restaurant_id → fallback `profile.starty_bp_id`.
- Verifica end-to-end: ordine di prova Osteria Metti → spedizione = Incaffi su Starty.
- Migration: colonne presenti; `get_advisors` pulito.

## Fuori scope

- Sync automatico continuo BP↔admin.
- Gestione fatturazione per-sede oltre alla singola location scelta.
- Modifica massiva/backfill automatico di tutti i ristoranti (si collegano on-demand dal form;
  i due rotti — Metti/Preella — li sistemo nel fix dati).
