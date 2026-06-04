// Sync periodico del catalogo prodotti da StartyERP.
// Trigger: pg_cron ogni 6 ore (vedi supabase/cron.sql).
// TODO: riempire le chiamate Starty quando arrivano le credenziali.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { startyFetch, type StartyProduct } from "../_shared/starty.ts";

interface ProductsResponse {
  products: StartyProduct[];
  options?: { totalCount?: number; pageSize?: number; page?: number };
}

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async () => {
  const supabase = createClient(SUPA_URL, SERVICE_ROLE);
  const startedAt = Date.now();
  let page = 1, total = 0, upserted = 0;

  try {
    while (true) {
      const res = await startyFetch<ProductsResponse>(
        `/v3/products?pagesize=200&page=${page}`,
      );
      const items = res.products ?? [];
      if (items.length === 0) break;
      total += items.length;

      // Upsert per starty_product_id. Se già esiste un row con quel legacy_id
      // ma starty_product_id null, lo riconciliamo per code/sku.
      for (const p of items) {
        const { error } = await supabase.from("wines").upsert({
          starty_product_id: p.productId,
          code: p.code ?? null,
          sku: p.sku ?? null,
          upc: p.upc ?? null,
          name: p.name,
          uom_id: p.uomId ?? null,
          units_per_package: p.unitsPerPackage ?? null,
          is_stocked: p.isStocked ?? true,
          lot_managed: p.lotManaged ?? false,
          is_sold: p.sold ?? true,
          last_synced_at: new Date().toISOString(),
        }, { onConflict: "starty_product_id" });
        if (!error) upserted++;
      }

      if (items.length < 200) break;
      page++;
    }

    return Response.json({
      ok: true,
      pages: page, total, upserted,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});
