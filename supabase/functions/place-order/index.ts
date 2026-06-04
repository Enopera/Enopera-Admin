// place-order — saga di creazione ordine.
// Chiamata dall'app Flutter; protetta dal JWT dell'utente loggato.
//
// Flow normale:
//   1. Verifica JWT → recupera profile + starty_bp_id
//   2. Idempotency: se orders.client_idempotency_key esiste → ritorna esistente
//   3. Risolve i wineId → wines (incluso starty_product_id)
//   4. INSERT orders { status: 'creating' } + INSERT order_lines (snapshot prezzi/nomi)
//   5. Check strutturale: ogni vino deve avere starty_product_id mappato
//   6. POST /v3/orders draft + UPDATE orders.starty_order_id
//   7. POST /v3/orders/{id}/confirmIt + UPDATE orders.status='confirmed'
//      (qui Starty ritorna 409 se lo stock non basta -> failed_no_stock)
//   8. Compensazioni in caso di errore + status appropriato
//
// BYPASS_STARTY=true (env): salta gli step 5-7, fingiamo che Starty abbia
// confermato. Utile per testare l'INSERT locale finche' le creds Starty
// non sono disponibili.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  startyFetch, StartyHttpError,
  type StartyOrderIn, type StartyOrderOut,
} from "../_shared/starty.ts";

// ────────────── env ──────────────
const SUPA_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WAREHOUSE_ID  = Number(Deno.env.get("STARTY_WAREHOUSE_ID") ?? "0");
const DOC_TYPE_ID   = Number(Deno.env.get("STARTY_DOC_TYPE_ID")  ?? "0");

const BYPASS_STARTY = (Deno.env.get("BYPASS_STARTY") ?? "false").toLowerCase() === "true";

// ────────────── tipi ──────────────
interface PlaceOrderRequest {
  idempotencyKey: string;
  lines: { wineId: string; qty: number }[];
  deliveryAddress?: string; // se null usa profile.address
  notes?: string;
}

interface WineRow {
  id: string;
  legacy_id: string | null;
  starty_product_id: number | null;
  name: string;
  producer: string | null;
  vintage: number | null;
  uom_id: number | null;
}

interface WinePricedRow extends WineRow {
  // Prezzo per riga, risolto dal listino del cliente.
  // Aggiunto in-line dopo il fetch delle wines.
  price: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);

interface ProfileRow {
  id: string;
  status: string;
  starty_bp_id: number | null;
  restaurant_name: string | null;
  full_name: string | null;
  address: string | null;
  vat: string | null;
  phone: string | null;
  city: string | null;
  district: string | null;
  restaurant_id: string | null;
}

// Default business defaults per gli ordini app: l'utente vuole sempre
// "Porto" vuoto, Causale di trasporto = Vendita (SA), Mezzo di spedizione =
// Spedizioniere (S). Sovrascrivono il template /v3/orders/default che
// arriva con fob="EX", shipmentReason="", deliveryViaRule="P".
// Codici da /v3/references/1000003: SA=Vendita, VE=Conto vendita,
// CM=Conto comodato, FS=Campioni gratuiti, ecc.
const STARTY_FOB_DEFAULT = "";
const STARTY_SHIPMENT_REASON_DEFAULT = "SA";
const STARTY_DELIVERY_VIA_RULE_DEFAULT = "S";

// ────────────── helpers ──────────────
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function shortId(uuid: string): string {
  return uuid.split("-")[0].toUpperCase();
}

// ────────────── handler ──────────────
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // 1. Auth
  const userJwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!userJwt) return json({ error: "Missing Authorization" }, 401);

  const supabase = createClient(SUPA_URL, SERVICE_ROLE);
  const { data: { user }, error: userErr } = await supabase.auth.getUser(userJwt);
  if (userErr || !user) return json({ error: "Invalid token" }, 401);

  // Profile + restaurant link (restaurant_id serve per risolvere il listino)
  const { data: profileRaw } = await supabase
    .from("profiles")
    .select("id, status, starty_bp_id, restaurant_name, full_name, address, vat, phone, city, district, restaurant_id")
    .eq("id", user.id)
    .single();
  const profile = profileRaw as ProfileRow | null;

  if (!profile)                     return json({ error: "Profile non trovato" }, 403);
  if (profile.status !== "attivo")  return json({ error: "Account non attivo" }, 403);
  if (!BYPASS_STARTY && !profile.starty_bp_id) {
    return json({ error: "Account non collegato a un businessPartner Starty" }, 403);
  }

  // Risolvi il listino prezzi del cliente: custom del ristorante o, in
  // mancanza, il default globale. Replica la stessa logica della RPC
  // catalog_for_current_user. Ci serve sia l'UUID Supabase (per leggere
  // wine_prices) sia lo starty_id (da passare a Starty come priceListId).
  let restaurantPriceListId: string | null = null;
  if (profile.restaurant_id) {
    const { data: rest } = await supabase
      .from("restaurants")
      .select("price_list_id")
      .eq("id", profile.restaurant_id)
      .maybeSingle();
    restaurantPriceListId = (rest?.price_list_id as string | null) ?? null;
  }
  let priceListRow: { id: string; starty_id: number | null; name: string } | null = null;
  if (restaurantPriceListId) {
    const { data } = await supabase
      .from("price_lists")
      .select("id, starty_id, name")
      .eq("id", restaurantPriceListId)
      .maybeSingle();
    priceListRow = data as typeof priceListRow;
  }
  if (!priceListRow) {
    const { data } = await supabase
      .from("price_lists")
      .select("id, starty_id, name")
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();
    priceListRow = data as typeof priceListRow;
  }
  if (!priceListRow) {
    return json({ error: "Listino prezzi non configurato" }, 500);
  }
  const priceListId = priceListRow.id;
  const startyPriceListId = priceListRow.starty_id;

  let body: PlaceOrderRequest;
  try {
    body = await req.json() as PlaceOrderRequest;
  } catch {
    return json({ error: "Body non è JSON valido" }, 400);
  }
  if (!body.idempotencyKey) return json({ error: "idempotencyKey richiesto" }, 400);
  if (!body.lines?.length)  return json({ error: "Nessuna riga ordine" }, 400);

  // 2. Idempotency: l'ordine può essere già stato creato
  const { data: existing } = await supabase
    .from("orders")
    .select("id, status, starty_order_id, starty_document_number, total, items_count, created_at")
    .eq("client_idempotency_key", body.idempotencyKey)
    .maybeSingle();
  if (existing) {
    return json({
      ok: true,
      duplicate: true,
      orderId: existing.id,
      status: existing.status,
      total: existing.total,
      itemsCount: existing.items_count,
      startyOrderId: existing.starty_order_id,
      documentNumber: existing.starty_document_number,
    }, 200);
  }

  // 3. Risolvi wines → starty_product_id (e snapshot prezzi/nomi).
  // wineId può arrivare come UUID (id) o come legacy_id (es. "w01") dal mock
  // Flutter — accettiamo entrambi e mappiamo con la stessa Map.
  const wineIds = body.lines.map((l) => l.wineId);
  const uuidIds = wineIds.filter(isUuid);
  const legacyIds = wineIds.filter((s) => !isUuid(s));

  const orFilters: string[] = [];
  if (uuidIds.length)   orFilters.push(`id.in.(${uuidIds.join(",")})`);
  if (legacyIds.length) orFilters.push(`legacy_id.in.(${legacyIds.map((s) => `"${s}"`).join(",")})`);

  let winesQuery = supabase
    .from("wines")
    .select("id, legacy_id, starty_product_id, name, producer, vintage, uom_id");
  if (orFilters.length === 1) {
    // Una sola condizione: usa direttamente .in() (più chiaro)
    if (uuidIds.length) winesQuery = winesQuery.in("id", uuidIds);
    else                winesQuery = winesQuery.in("legacy_id", legacyIds);
  } else {
    winesQuery = winesQuery.or(orFilters.join(","));
  }
  const { data: winesRaw, error: winesErr } = await winesQuery;
  if (winesErr) return json({ error: "Errore lettura catalogo", detail: winesErr.message }, 500);

  const wines = (winesRaw ?? []) as WineRow[];

  // Fetch prezzi dal listino risolto per i wine_id richiesti.
  // wines.price (vecchia colonna) non e' piu' usata: l'app legge i prezzi
  // tramite catalog_for_current_user che JOINa wine_prices; per coerenza
  // l'ordine usa esattamente la stessa fonte di verita'.
  const { data: pricesRaw, error: pricesErr } = await supabase
    .from("wine_prices")
    .select("wine_id, price")
    .eq("price_list_id", priceListId)
    .in("wine_id", wines.map((w) => w.id));
  if (pricesErr) {
    return json({ error: "Errore lettura prezzi", detail: pricesErr.message }, 500);
  }
  const priceByWineId = new Map<string, number>();
  for (const r of (pricesRaw ?? []) as { wine_id: string; price: string | number }[]) {
    priceByWineId.set(r.wine_id, Number(r.price));
  }

  // Map keyed by both id e legacy_id così la lookup funziona con qualsiasi forma
  const wineByAnyId = new Map<string, WinePricedRow>();
  for (const w of wines) {
    const p = priceByWineId.get(w.id) ?? 0;
    const priced: WinePricedRow = { ...w, price: p };
    wineByAnyId.set(w.id, priced);
    if (w.legacy_id) wineByAnyId.set(w.legacy_id, priced);
  }
  for (const wid of wineIds) {
    if (!wineByAnyId.has(wid)) {
      return json({ error: `Vino non in catalogo: ${wid}` }, 404);
    }
  }
  const wineById = wineByAnyId; // alias per minimizzare cambi sotto

  // Calcola totali (snapshot)
  let total = 0;
  let itemsCount = 0;
  for (const line of body.lines) {
    const w = wineById.get(line.wineId);
    if (!w) return json({ error: `Vino non trovato: ${line.wineId}` }, 404);
    if (line.qty <= 0) return json({ error: `Quantità non valida per ${w.name}` }, 400);
    if (!(w.price > 0)) {
      return json({ error: `Vino ${w.name} senza prezzo configurato nel listino "${priceListRow.name}"` }, 409);
    }
    total += w.price * line.qty;
    itemsCount += line.qty;
  }

  // 4. INSERT orders { status: 'creating' } — early commit per idempotency.
  const customerSnapshot = {
    user_id: user.id,
    email: user.email,
    restaurant_name: profile.restaurant_name,
    full_name: profile.full_name,
    address: profile.address,
    vat: profile.vat,
    phone: profile.phone,
    city: profile.city,
    district: profile.district,
  };
  const deliveryAddress = body.deliveryAddress ?? profile.address ?? null;

  const { data: orderInserted, error: insertErr } = await supabase
    .from("orders")
    .insert({
      user_id: user.id,
      client_idempotency_key: body.idempotencyKey,
      status: "creating",
      total,
      items_count: itemsCount,
      delivery_address: deliveryAddress,
      notes: body.notes ?? null,
      customer_snapshot: customerSnapshot,
    })
    .select("id")
    .single();
  if (insertErr || !orderInserted) {
    // Race condition: un'altra invocazione concorrente ha già inserito → torna l'esistente
    if (insertErr?.code === "23505") {
      const { data: dup } = await supabase
        .from("orders")
        .select("id, status")
        .eq("client_idempotency_key", body.idempotencyKey)
        .maybeSingle();
      if (dup) return json({ ok: true, duplicate: true, orderId: dup.id, status: dup.status }, 200);
    }
    return json({ error: "Insert ordine fallito", detail: insertErr?.message }, 500);
  }
  const orderId = orderInserted.id as string;

  // INSERT order_lines (snapshot)
  const linesPayload = body.lines.map((l) => {
    const w = wineById.get(l.wineId)!;
    return {
      order_id: orderId,
      wine_id: w.id,
      qty: l.qty,
      unit_price: w.price,
      wine_name_snapshot: w.name,
      wine_producer_snapshot: w.producer,
      wine_vintage_snapshot: w.vintage,
    };
  });
  const { error: linesErr } = await supabase.from("order_lines").insert(linesPayload);
  if (linesErr) {
    await supabase.from("orders").update({ status: "failed_internal" }).eq("id", orderId);
    return json({ error: "Insert righe ordine fallito", detail: linesErr.message }, 500);
  }

  // 5-7. Saga Starty (skippata in BYPASS_STARTY)
  let startyOrderId: number | null = null;
  let startyDocNumber: string | null = null;

  if (!BYPASS_STARTY) {
    // 5. Check strutturale: ogni vino deve avere uno starty_product_id mappato.
    // La verifica stock preliminare via /v3/stock e' stata rimossa: rate-limit
    // Starty su quell'endpoint (429 ricorrenti) + e' ridondante perche' lo step
    // confirmIt (7) gia' ritorna 409 in caso di stock insufficiente, mappato
    // a status 'failed_no_stock' con messaggio appropriato.
    for (const line of body.lines) {
      const w = wineById.get(line.wineId)!;
      if (!w.starty_product_id) {
        await supabase.from("orders").update({ status: "failed_internal" }).eq("id", orderId);
        return json({ error: `Vino ${w.name} non sincronizzato con Starty` }, 409);
      }
    }

    // 6. POST /v3/orders (draft)
    // Starty richiede un payload COMPLETO con tutti i default (paymentRule,
    // priorityRule, deliveryViaRule, isHandled, fob, etc): se mancano, l'API
    // risponde 500 con messaggi criptici ("Lo stato dell'evasione non puo'
    // essere valorizzato manualmente", "data ordine mancante", ...).
    // Il flow corretto e': GET /v3/orders/default per ottenere il template
    // precompilato con i default per (bp, warehouse, docType), poi sovrascrivere
    // SOLO i campi business (BP, righe, riferimento, data). Stessa logica per
    // le righe via /v3/orders/lines/default. Le righe richiedono almeno
    // rowType="I" (Item) per non scattare "Non e' stato specificato un tipo riga".
    const defaultQuery = new URLSearchParams({
      businessPartnerId: String(profile.starty_bp_id!),
      warehouseId: String(WAREHOUSE_ID),
      docTypeId: String(DOC_TYPE_ID),
    });
    let orderTemplate: Record<string, unknown>;
    let lineTemplate: Record<string, unknown>;
    try {
      [orderTemplate, lineTemplate] = await Promise.all([
        startyFetch<Record<string, unknown>>(`/v3/orders/default?${defaultQuery}`),
        startyFetch<Record<string, unknown>>(`/v3/orders/lines/default`),
      ]);
    } catch (e) {
      const detail = (e as Error).message;
      console.error(`[place-order] fetch defaults failed for orderId=${orderId}: ${detail}`);
      await supabase.from("orders").update({ status: "failed_internal" }).eq("id", orderId);
      return json({ error: "Inizializzazione ordine Starty fallita", detail }, 502);
    }

    const orderIn = {
      ...orderTemplate,
      businessPartnerId: profile.starty_bp_id!,
      warehouseId: WAREHOUSE_ID,
      docTypeId: DOC_TYPE_ID,
      dateOrdered: new Date().toISOString().slice(0, 19), // 'YYYY-MM-DDTHH:MM:SS' come da template
      // Mostrato come "Riferimento ordine" su Starty. Allineato con gli ordini
      // creati manualmente, che hanno il nome del ristorante (insegna).
      // Fallback su idempotencyKey se per qualche motivo restaurant_name e' null.
      poReference: profile.restaurant_name ?? body.idempotencyKey,
      // Business defaults (vedi STARTY_*_DEFAULT in cima al file).
      fob: STARTY_FOB_DEFAULT,
      shipmentReason: STARTY_SHIPMENT_REASON_DEFAULT,
      deliveryViaRule: STARTY_DELIVERY_VIA_RULE_DEFAULT,
      // priceListId: solo se mappato; se null lasciamo che Starty lo deduca
      // dal BP. Se mappato, garantisce che il prezzo di listino mostrato
      // su Starty UI corrisponda al listino usato dall'app.
      ...(startyPriceListId ? { priceListId: startyPriceListId } : {}),
      orderLines: body.lines.map((l, i) => {
        const w = wineById.get(l.wineId)!;
        return {
          ...lineTemplate,
          line: (i + 1) * 10, // 10, 20, 30, ... come convenzione iDempiere
          productId: w.starty_product_id!,
          quantity: l.qty,
          uomId: w.uom_id ?? lineTemplate.uomId ?? 5111,
          price: w.price,
        };
      }),
    } as StartyOrderIn;

    let starty: StartyOrderOut;
    try {
      starty = await startyFetch<StartyOrderOut>("/v3/orders", {
        method: "POST", body: JSON.stringify(orderIn),
      });
    } catch (e) {
      const detail = (e as Error).message;
      console.error(
        `[place-order] POST /v3/orders failed for orderId=${orderId} bpId=${profile.starty_bp_id} warehouseId=${WAREHOUSE_ID} docTypeId=${DOC_TYPE_ID}: ${detail}`,
      );
      await supabase.from("orders").update({ status: "failed_internal" }).eq("id", orderId);
      return json(
        { error: "Creazione ordine Starty fallita", detail },
        502,
      );
    }
    startyOrderId = starty.orderId;
    startyDocNumber = starty.documentNumber;

    await supabase.from("orders").update({
      starty_order_id: starty.orderId,
      starty_document_number: starty.documentNumber,
    }).eq("id", orderId);

    // 7. confirmIt
    try {
      await startyFetch(`/v3/orders/${starty.orderId}/confirmIt`, { method: "POST" });
    } catch (e) {
      const detail = (e as Error).message;
      console.error(
        `[place-order] confirmIt failed for startyOrderId=${starty.orderId} (supabase orderId=${orderId}): ${detail}`,
      );
      // Compensazione: rimuovi il draft Starty
      try { await startyFetch(`/v3/orders/${starty.orderId}`, { method: "DELETE" }); } catch (_) {}
      const status = e instanceof StartyHttpError && e.status === 409 ? "failed_no_stock" : "failed_confirm";
      await supabase.from("orders").update({ status }).eq("id", orderId);
      const httpStatus = e instanceof StartyHttpError && e.status === 409 ? 409 : 502;
      return json(
        { error: "Conferma ordine fallita (stock cambiato?). Riprova.", detail },
        httpStatus,
      );
    }
  }

  // 8. Mark confirmed
  await supabase.from("orders").update({
    status: "confirmed",
    confirmed_at: new Date().toISOString(),
  }).eq("id", orderId);

  return json({
    ok: true,
    orderId,
    orderNumber: shortId(orderId),
    status: "confirmed",
    total,
    itemsCount,
    startyOrderId,
    documentNumber: startyDocNumber,
    bypassStarty: BYPASS_STARTY,
  }, 201);
});
