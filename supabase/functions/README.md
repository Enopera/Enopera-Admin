# Edge Functions — Enopera × StartyERP

Tre funzioni che orchestrano tra Supabase (cache + ordini locali) e StartyERP
(source of truth per stock + ordini fornitori):

| Funzione | Trigger | Cosa fa |
|---|---|---|
| `sync-products` | `pg_cron` ogni 6 ore | `GET /v3/products` → upsert `public.wines` |
| `sync-stock` | `pg_cron` ogni 15 min | `GET /v3/stock` → upsert `public.wine_stock` |
| `place-order` | App Flutter (chiamata diretta) | Saga: check stock → `POST /v3/orders` → `POST /v3/orders/{id}/confirmIt` → INSERT in DB |

Tutte usano `_shared/starty.ts` per il client HTTP autenticato (handshake + JWT refresh).

## Stato attuale

🟡 **Skeleton, NON funzionanti.** Le chiamate a Starty sono stub con `TODO`.<br>
Quando arrivano le credenziali StartyERP:

1. Configura le secrets:
   ```bash
   supabase secrets set STARTY_BASE_URL=https://api.startyerp.cloud/four
   supabase secrets set STARTY_INITIAL_TOKEN=<jwt iniziale>   # da definire con Starty
   supabase secrets set STARTY_ROLE_ID=<r>
   supabase secrets set STARTY_ORG_ID=<o>
   supabase secrets set STARTY_WAREHOUSE_ID=<id magazzino centrale>
   supabase secrets set STARTY_DOC_TYPE_ID=<docTypeId 'Ordine cliente'>
   ```
2. Riempi i `TODO` in `_shared/starty.ts` (login flow + cache JWT) e nelle 3 functions.
3. Deploy:
   ```bash
   supabase functions deploy sync-products
   supabase functions deploy sync-stock
   supabase functions deploy place-order
   ```
4. Schedula `sync-stock` e `sync-products` via `pg_cron` (vedi `supabase/cron.sql`).

## Saga di `place-order`

```
1. INSERT in orders { status: 'creating', client_idempotency_key }
2. GET /v3/stock?productId=...   → se qty insufficiente → 409 + status='failed_no_stock'
3. POST /v3/orders draft         → salva starty_order_id in orders
4. POST /v3/orders/{id}/confirmIt → status='confirmed'
5. Se 4 fallisce: DELETE /v3/orders/{id} (compensazione) + status='failed_confirm'
6. Reconciliation job pulisce gli stati 'creating'/'failed_*' più vecchi di 2 min
```
