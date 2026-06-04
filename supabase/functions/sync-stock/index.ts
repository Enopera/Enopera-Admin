// Sync periodico delle giacenze da StartyERP.
// Trigger: pg_cron ogni 15 minuti.
// Per ogni magazzino di interesse facciamo GET /v3/stock?warehouseId=...
// e upsert in public.wine_stock.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { startyFetch, type StartyStockRow } from "../_shared/starty.ts";

interface StockResponse { stockList: StartyStockRow[] }

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WAREHOUSE_ID = Number(Deno.env.get("STARTY_WAREHOUSE_ID") ?? "0");

/// Starty manda stringhe vuote ("") per i campi opzionali. Per le colonne
/// nullable (specie `date`) vanno convertite a null.
function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

Deno.serve(async () => {
  if (!WAREHOUSE_ID) {
    return Response.json({ ok: false, error: "STARTY_WAREHOUSE_ID non configurato" }, { status: 500 });
  }

  const supabase = createClient(SUPA_URL, SERVICE_ROLE);
  const startedAt = Date.now();

  try {
    const res = await startyFetch<StockResponse>(
      `/v3/stock?warehouseId=${WAREHOUSE_ID}`,
    );
    const rows = res.stockList ?? [];

    // Resolve wine_id da starty_product_id in batch
    const productIds = [...new Set(rows.map((r) => r.productId))];
    const { data: wines } = await supabase
      .from("wines")
      .select("id, starty_product_id")
      .in("starty_product_id", productIds);

    const wineByStartyId = new Map<number, string>();
    for (const w of wines ?? []) {
      if (w.starty_product_id != null) wineByStartyId.set(w.starty_product_id, w.id);
    }

    let upserted = 0, missing = 0;
    let firstError: string | null = null;
    for (const r of rows) {
      const wineId = wineByStartyId.get(r.productId);
      if (!wineId) { missing++; continue; }

      const { error } = await supabase.from("wine_stock").upsert({
        wine_id: wineId,
        starty_product_id: r.productId,
        warehouse_id: r.warehouseId,
        warehouse_name: emptyToNull(r.warehouseName),
        lot_id: r.lotId ?? null,
        lot_name: emptyToNull(r.lotName),
        // Starty manda "" (stringa vuota) per i lotti senza scadenza: va
        // convertita a null, altrimenti il cast a `date` fallisce
        // ("invalid input syntax for type date").
        lot_expiry_date: emptyToNull(r.lotExpiryDate),
        // Campi NOT NULL: difesa contro righe Starty che li omettono.
        qty_on_hand: r.qtyOnHand ?? 0,
        qty_reserved: r.qtyReserved ?? 0,
        qty_ordered: r.qtyOrdered ?? 0,
        qty_available: r.qtyAvailable ?? 0,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: "wine_id,warehouse_id,lot_id" });
      if (!error) {
        upserted++;
      } else if (!firstError) {
        firstError = error.message;
      }
    }

    return Response.json({
      ok: true,
      total: rows.length, upserted, missing_wines: missing,
      firstError,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});
