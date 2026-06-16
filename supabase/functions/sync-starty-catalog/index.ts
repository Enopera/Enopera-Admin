// Sincronizza il catalogo vini da Starty -> public.wines + public.wine_prices.
//
// Solo READ su Starty: la function fa esclusivamente GET. Scrive su Supabase.
//
// Endpoint Starty usati:
//   GET /v3/brands                  (anagrafica produttori, paginato)
//   GET /v3/product-categories      (anagrafica tipi, paginato)
//   GET /v3/products?pagesize=200   (paginato - anagrafica prodotti)
//   GET /v3/product-pricing?productId=X  (per ogni prodotto: prezzi per ogni listino)
//
// Trigger: POST a /functions/v1/sync-starty-catalog (auth via Supabase JWT admin).
//
// Env vars required (Supabase Dashboard -> Edge Functions -> Secrets):
//   STARTY_TENANT  (es. "four")
//   STARTY_TOKEN   (Bearer JWT, ottenuto da Starty)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CATEGORY_TYPE_MAP: Record<string, string> = {
  Bianchi: "Bianco",
  Rossi: "Rosso",
  Bollicine: "Bolle",
  Champagne: "Bolle",
  Cremant: "Bolle",
  Rose: "Rosato",
  "Rosè": "Rosato",
};

const EXCLUDED_CATEGORIES = new Set(["ALTRO"]);

function parseVintage(code: string | null | undefined): number | null {
  if (!code) return null;
  const m = code.match(/(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/);
  return m ? Number(m[1]) : null;
}

function mapType(categoryName: string | undefined): string {
  if (!categoryName) return "Rosso";
  if (CATEGORY_TYPE_MAP[categoryName]) return CATEGORY_TYPE_MAP[categoryName];
  const lc = categoryName.toLowerCase();
  if (lc.startsWith("ros")) return "Rosato";
  if (lc.includes("bianc")) return "Bianco";
  if (lc.includes("ross")) return "Rosso";
  if (lc.includes("boll") || lc.includes("champ") || lc.includes("crema")) return "Bolle";
  return "Rosso";
}

async function startyGet(path: string): Promise<any> {
  const tenant = Deno.env.get("STARTY_TENANT");
  const token = Deno.env.get("STARTY_TOKEN");
  if (!tenant || !token) throw new Error("STARTY_TENANT / STARTY_TOKEN mancanti nei secret");
  const url = `https://api.startyerp.cloud/${tenant}/v3/${path}`;
  const r = await fetch(url, {
    method: "GET", // SOLO GET
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Starty ${r.status} ${path}: ${body.slice(0, 300)}`);
  }
  return r.json();
}

// Fetch paginato generico. Starty limita la pagesize a 200 e pagina i risultati:
// una singola chiamata con pagesize alta NON basta (i record oltre la prima pagina
// verrebbero persi - es. i brand oltre il 200esimo, con i relativi vini a producer null).
async function fetchAllPaged(resource: string, key: string): Promise<any[]> {
  const all: any[] = [];
  const pageSize = 200;
  let page = 1;
  while (true) {
    const res = await startyGet(`${resource}?pagesize=${pageSize}&page=${page}`);
    const items = res?.[key] ?? [];
    all.push(...items);
    const totalPages = res?.options?.totalPages ?? page;
    if (page >= totalPages) break;
    page++;
  }
  return all;
}

async function fetchAllProducts(): Promise<any[]> {
  return fetchAllPaged("products", "products");
}

async function fetchPricingBatched(
  productIds: number[],
  concurrency = 10,
): Promise<Map<number, any[]>> {
  const result = new Map<number, any[]>();
  let cursor = 0;
  async function worker() {
    while (cursor < productIds.length) {
      const idx = cursor++;
      const pid = productIds[idx];
      try {
        const r = await startyGet(`product-pricing?productId=${pid}`);
        result.set(pid, r?.priceListPrices ?? []);
      } catch (e) {
        console.error(`pricing ${pid} failed:`, (e as Error).message);
        result.set(pid, []);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const startedAt = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1. Anagrafiche (paginate: vedi fetchAllPaged - Starty cap la pagesize a 200,
    //    quindi una singola chiamata perderebbe i brand/categorie oltre la prima pagina).
    const [brandsAll, categoriesAll] = await Promise.all([
      fetchAllPaged("brands", "brands"),
      fetchAllPaged("product-categories", "productCategories"),
    ]);
    const brandById = new Map<number, string>();
    for (const b of brandsAll) brandById.set(b.brandId, b.name);
    const categoryNameById = new Map<number, string>();
    for (const c of categoriesAll) categoryNameById.set(c.productCategoryId, c.name);

    // 2. Mapping price_lists Supabase <- starty_id
    const { data: pls, error: plErr } = await supabase
      .from("price_lists").select("id, starty_id").not("starty_id", "is", null);
    if (plErr) throw plErr;
    const supaPriceListIdByStarty = new Map<number, string>();
    for (const pl of pls ?? []) {
      if (pl.starty_id) supaPriceListIdByStarty.set(pl.starty_id, pl.id);
    }

    // 3. Fetch prodotti + filtro
    const allProducts = await fetchAllProducts();
    const filtered = allProducts.filter((p) => {
      const catName = categoryNameById.get(p.productCategoryId);
      if (!catName || EXCLUDED_CATEGORIES.has(catName)) return false;
      return p.sold === true;
    });

    // Dedupe by productId (Starty puo' ritornare duplicati su page boundaries).
    const productByStartyId = new Map<number, any>();
    for (const p of filtered) {
      if (p?.productId != null) productByStartyId.set(p.productId, p);
    }
    const uniqueProducts = Array.from(productByStartyId.values());

    // 4. Pricing per ognuno
    const productIds = uniqueProducts.map((p) => p.productId);
    const pricingByProductId = await fetchPricingBatched(productIds, 10);

    // 5. Upsert wines
    const wineRows = uniqueProducts.map((p) => {
      const catName = categoryNameById.get(p.productCategoryId);
      const producer = brandById.get(p.brandId) ?? null;
      return {
        starty_product_id: p.productId,
        code: p.code || null,
        sku: p.sku || null,
        upc: p.upc || null,
        name: p.name,
        producer: producer,
        type: mapType(catName),
        vintage: parseVintage(p.code),
        uom_id: p.uomId ?? null,
        units_per_package: p.unitsPerPackage ?? null,
        is_stocked: p.isStocked === true,
        lot_managed: p.lotManaged === true,
        is_sold: p.sold === true,
        active: true,
        last_synced_at: new Date().toISOString(),
      };
    });

    // Upsert in chunk per evitare body troppo grandi.
    const wineChunkSize = 500;
    for (let i = 0; i < wineRows.length; i += wineChunkSize) {
      const chunk = wineRows.slice(i, i + wineChunkSize);
      const { error: upsertErr } = await supabase
        .from("wines")
        .upsert(chunk, { onConflict: "starty_product_id" });
      if (upsertErr) throw upsertErr;
    }

    // 6. Mappo starty_product_id -> wine.id
    const wineUuidByStarty = new Map<number, string>();
    const wineFetchChunkSize = 500;
    for (let i = 0; i < productIds.length; i += wineFetchChunkSize) {
      const chunk = productIds.slice(i, i + wineFetchChunkSize);
      const { data: wines, error: wErr } = await supabase
        .from("wines").select("id, starty_product_id")
        .in("starty_product_id", chunk);
      if (wErr) throw wErr;
      for (const w of wines ?? []) {
        if (w.starty_product_id) wineUuidByStarty.set(w.starty_product_id, w.id);
      }
    }

    // 7. Build wine_prices con dedup (wine_id, price_list_id).
    // Se Starty ritorna piu' righe per stesso (product, priceList) per UoM o
    // validita' differenti, teniamo l'ultima (validUntilDate piu' lontana).
    const priceMap = new Map<string, any>();
    for (const [pid, plPrices] of pricingByProductId) {
      const wineUuid = wineUuidByStarty.get(pid);
      if (!wineUuid) continue;
      for (const p of plPrices) {
        const supaPlId = supaPriceListIdByStarty.get(p.priceListId);
        if (!supaPlId) continue;
        const key = `${wineUuid}|${supaPlId}`;
        const incoming = {
          wine_id: wineUuid,
          price_list_id: supaPlId,
          price: p.price,
          uom_id: p.uomId ?? null,
          valid_until: p.validUntilDate || null,
          starty_synced_at: new Date().toISOString(),
        };
        const existing = priceMap.get(key);
        if (!existing) {
          priceMap.set(key, incoming);
          continue;
        }
        // Tieni quello con validUntil maggiore (piu' attuale).
        const a = existing.valid_until ? Date.parse(existing.valid_until) : 0;
        const b = incoming.valid_until ? Date.parse(incoming.valid_until) : 0;
        if (b > a) priceMap.set(key, incoming);
      }
    }
    const priceRows = Array.from(priceMap.values());

    if (priceRows.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < priceRows.length; i += chunkSize) {
        const chunk = priceRows.slice(i, i + chunkSize);
        const { error: pErr } = await supabase
          .from("wine_prices")
          .upsert(chunk, { onConflict: "wine_id,price_list_id" });
        if (pErr) throw pErr;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        elapsed_ms: Date.now() - startedAt,
        starty_products_total: allProducts.length,
        starty_products_filtered: filtered.length,
        brands_total: brandsAll.length,
        categories_total: categoriesAll.length,
        wines_unique: uniqueProducts.length,
        wines_synced: wineRows.length,
        wine_prices_upserted: priceRows.length,
        price_lists_with_starty_id: supaPriceListIdByStarty.size,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
