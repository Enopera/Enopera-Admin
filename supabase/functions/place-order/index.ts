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
  type StartyBusinessPartner, type StartyBpLocation,
} from "../_shared/starty.ts";

// ────────────── env ──────────────
const SUPA_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WAREHOUSE_ID  = Number(Deno.env.get("STARTY_WAREHOUSE_ID") ?? "0");
const DOC_TYPE_ID   = Number(Deno.env.get("STARTY_DOC_TYPE_ID")  ?? "0");

const BYPASS_STARTY = (Deno.env.get("BYPASS_STARTY") ?? "false").toLowerCase() === "true";

// Notifica email su nuovo ordine (best-effort, non blocca l'ordine).
// Default destinatario = fb@enopera.com (produzione); per cambiarlo settare il
// secret ORDER_NOTIFICATION_EMAIL. RESEND_FROM riusa il mittente gia'
// configurato per le altre mail (default onboarding@resend.dev, che con Resend
// consegna SOLO all'owner dell'account: per recapitare a fb@enopera.com serve
// un dominio verificato in Resend).
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const ORDER_NOTIFICATION_EMAIL = Deno.env.get("ORDER_NOTIFICATION_EMAIL") ?? "fb@enopera.com";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Enopera <onboarding@resend.dev>";

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

// Escape minimale per interpolare testo nell'HTML della mail.
function escHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Seleziona l'ID indirizzo del BP per un ruolo. Ritorna il C_Location id
// (location.locationId): è QUELLO il valore atteso da Order.indSpedizioneId /
// indFatturazioneId (verificato sulla UI nativa di Starty). NON usare
// businessPartnerLocationId: cade su record C_Location estranei (indirizzi esteri).
// Preferenza: flag esplicito (billTo|shipTo) -> indirizzo 'default' -> primo
// con C_Location id valido. Ritorna null se nessuna sede ha un locationId: in
// quel caso il chiamante NON valorizza il campo e lascia il default del template.
function pickBpLocation(
  locations: StartyBpLocation[] | null | undefined,
  flag: "billTo" | "shipTo",
): number | null {
  if (!locations?.length) return null;
  const locId = (l: StartyBpLocation) => l.location?.locationId ?? null;
  const byFlag = locations.find((l) => l[flag] === true && locId(l));
  if (byFlag) return locId(byFlag);
  const byDefault = locations.find((l) => l.default === true && locId(l));
  if (byDefault) return locId(byDefault);
  const first = locations.find((l) => locId(l));
  return first ? locId(first) : null;
}

// deno-lint-ignore no-explicit-any
type Supa = any;

// Invia la mail di notifica nuovo ordine via Resend. Best-effort: ogni errore
// viene loggato e salvato in orders.notification_email_error senza propagare.
async function sendOrderNotificationEmail(
  supabase: Supa,
  o: { orderId: string; restaurantName: string; total: number; itemsCount: number; documentNumber: string | null },
): Promise<void> {
  const totalFmt = `€${o.total.toFixed(2)}`;
  const subject = `Nuovo ordine - ${o.restaurantName} (${totalFmt})`;
  const bottiglie = `${o.itemsCount} ${o.itemsCount === 1 ? "bottiglia" : "bottiglie"}`;
  const docLine = o.documentNumber ? ` · doc ${o.documentNumber}` : "";
  const text =
    `${o.restaurantName} ha eseguito un ordine di ${totalFmt} (netto vini).\n` +
    `${bottiglie}${docLine}.\nID ordine: ${o.orderId}`;
  // Stile brandizzato Vendemmia, coerente con la mail di partner-request:
  // sfondo avorio, card con header carminio, tabella dettagli.
  const rowHtml = (label: string, value: string) => `
    <tr>
      <td style="padding:7px 16px 7px 0;color:#a59a94;font:600 11px/1.4 'Helvetica Neue',Arial,sans-serif;text-transform:uppercase;letter-spacing:1px;vertical-align:top;white-space:nowrap;">${label}</td>
      <td style="padding:7px 0;color:#2a1a1d;font:400 14px/1.5 'Helvetica Neue',Arial,sans-serif;">${value}</td>
    </tr>`;
  const html = `
  <div style="background:#f6efe4;padding:28px;">
    <div style="max-width:520px;margin:0 auto;background:#fbf7ee;border:1px solid #e2d5c0;border-radius:16px;overflow:hidden;">
      <div style="background:#7a1a2c;padding:20px 24px;">
        <div style="color:#e9c9a0;font:600 10px/1 'Helvetica Neue',Arial,sans-serif;text-transform:uppercase;letter-spacing:2px;">Nuovo ordine</div>
        <div style="color:#fff1df;font:500 22px/1.25 Georgia,serif;margin-top:6px;">${escHtml(o.restaurantName)}</div>
      </div>
      <div style="padding:22px 24px;">
        <div style="font:400 12px/1 'Helvetica Neue',Arial,sans-serif;color:#a59a94;text-transform:uppercase;letter-spacing:1.4px;">Totale (netto vini)</div>
        <div style="font:600 34px/1.1 Georgia,serif;color:#7a1a2c;margin:6px 0 18px;">${totalFmt}</div>
        <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2d5c0;">
          ${rowHtml("Bottiglie", escHtml(bottiglie))}
          ${o.documentNumber ? rowHtml("Documento", escHtml(o.documentNumber)) : ""}
          ${rowHtml("ID ordine", escHtml(o.orderId))}
        </table>
      </div>
      <div style="padding:14px 24px;border-top:1px solid #e2d5c0;color:#a59a94;font:400 11px/1.4 'Helvetica Neue',Arial,sans-serif;">
        Notifica automatica generata dall'app Enopera Portal.
      </div>
    </div>
  </div>`;

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY non configurata");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [ORDER_NOTIFICATION_EMAIL],
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`Resend ${res.status}: ${detail}`);
    }
    await supabase.from("orders").update({
      notification_email_to: ORDER_NOTIFICATION_EMAIL,
      notification_email_sent_at: new Date().toISOString(),
      notification_email_error: null,
    }).eq("id", o.orderId);
  } catch (e) {
    const detail = (e as Error).message;
    console.error(`[place-order] invio email notifica fallito per orderId=${o.orderId}: ${detail}`);
    await supabase.from("orders").update({
      notification_email_to: ORDER_NOTIFICATION_EMAIL,
      notification_email_error: detail.slice(0, 500),
    }).eq("id", o.orderId);
  }
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
  // NB: il guard sul businessPartner è dopo il fetch del ristorante (il bp_id può
  // venire dal ristorante, che è la fonte di verità — vedi effectiveBpId sotto).

  // Risolvi il listino prezzi del cliente: custom del ristorante o, in
  // mancanza, il default globale. Replica la stessa logica della RPC
  // catalog_for_current_user. Ci serve sia l'UUID Supabase (per leggere
  // wine_prices) sia lo starty_id (da passare a Starty come priceListId).
  let restaurantPriceListId: string | null = null;
  // Dati anagrafici/fiscali del ristorante per ordine: ragione sociale (=>
  // poReference Starty) e indirizzo di fatturazione (=> snapshot ordine).
  let restRagioneSociale: string | null = null;
  let restBillingAddress: string | null = null;
  let restBillingCity: string | null = null;
  let restBillingDistrict: string | null = null;
  // Collegamento Starty: il RISTORANTE è la fonte di verità (bp_id + ID location
  // spedizione/fatturazione da mandare come indSpedizioneId/indFatturazioneId).
  let restStartyBpId: number | null = null;
  let restShipLocationId: number | null = null;
  let restBillLocationId: number | null = null;
  if (profile.restaurant_id) {
    const { data: rest } = await supabase
      .from("restaurants")
      .select("price_list_id, ragione_sociale, billing_address, billing_city, billing_district, starty_bp_id, starty_ship_location_id, starty_bill_location_id")
      .eq("id", profile.restaurant_id)
      .maybeSingle();
    restaurantPriceListId = (rest?.price_list_id as string | null) ?? null;
    restRagioneSociale = (rest?.ragione_sociale as string | null) ?? null;
    restBillingAddress = (rest?.billing_address as string | null) ?? null;
    restBillingCity = (rest?.billing_city as string | null) ?? null;
    restBillingDistrict = (rest?.billing_district as string | null) ?? null;
    restStartyBpId = (rest?.starty_bp_id as number | null) ?? null;
    restShipLocationId = (rest?.starty_ship_location_id as number | null) ?? null;
    restBillLocationId = (rest?.starty_bill_location_id as number | null) ?? null;
  }

  // Fonte UNICA per bp_id + location (mai mescolare): ristorante se collegato,
  // altrimenti il profilo (con la vecchia euristica pickBpLocation).
  const useRestaurantBp = !!(profile.restaurant_id && restStartyBpId);
  const effectiveBpId = useRestaurantBp ? restStartyBpId : profile.starty_bp_id;
  const shipLocOverride = useRestaurantBp ? restShipLocationId : null;
  const billLocOverride = useRestaurantBp ? restBillLocationId : null;
  if (!BYPASS_STARTY && !effectiveBpId) {
    return json({ error: "Account non collegato a un businessPartner Starty" }, 403);
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

  // Calcola totali (snapshot).
  // NOTA (Feature 3 - spedizione configurabile, parte server DA FARE): qui
  // `total` e' SOLO il netto vini (price*qty). La spedizione (shipping_config
  // globale + override per ristorante) e' per ora calcolata e mostrata solo
  // lato app (order_pricing.dart + shipping_config_service): NON viene
  // addebitata in questo total ne' aggiunta come riga all'ordine Starty.
  // Per fatturarla davvero: leggere shipping_config + gli override del
  // ristorante, applicare la stessa logica (soglia sul lordo vini) e
  // sommarla a `total` + aggiungere una riga spedizione all'orderIn Starty.
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
  // Indirizzo di fatturazione: se non valorizzato sul ristorante, coincide con
  // quello di spedizione (profile.address/city/district, sincronizzati da restaurants).
  const billingAddress = restBillingAddress ?? profile.address;
  const billingCity = restBillingCity ?? profile.city;
  const billingDistrict = restBillingDistrict ?? profile.district;
  const customerSnapshot = {
    user_id: user.id,
    email: user.email,
    restaurant_name: profile.restaurant_name,
    ragione_sociale: restRagioneSociale,
    full_name: profile.full_name,
    // address resta per retrocompatibilita' (= spedizione); shipping_* esplicito.
    address: profile.address,
    shipping_address: profile.address,
    shipping_city: profile.city,
    shipping_district: profile.district,
    billing_address: billingAddress,
    billing_city: billingCity,
    billing_district: billingDistrict,
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
      businessPartnerId: String(effectiveBpId!),
      warehouseId: String(WAREHOUSE_ID),
      docTypeId: String(DOC_TYPE_ID),
    });
    let orderTemplate: Record<string, unknown>;
    let lineTemplate: Record<string, unknown>;
    // Indirizzi BP (fatturazione/spedizione): fetch best-effort in parallelo ai
    // template. NON deve mai far fallire l'ordine -> .catch lo degrada a null,
    // cosi' un errore sul BP non rigetta la Promise.all (che invece e' critica
    // per i template). Se null, gli indirizzi restano quelli del template.
    let bpLocations: StartyBpLocation[] | null = null;
    try {
      let bp: StartyBusinessPartner | null;
      [orderTemplate, lineTemplate, bp] = await Promise.all([
        startyFetch<Record<string, unknown>>(`/v3/orders/default?${defaultQuery}`),
        startyFetch<Record<string, unknown>>(`/v3/orders/lines/default`),
        startyFetch<StartyBusinessPartner>(`/v3/business-partners/${effectiveBpId!}`)
          .catch((e) => {
            console.error(
              `[place-order] fetch indirizzi BP fallito (non bloccante) per orderId=${orderId} bpId=${effectiveBpId}: ${(e as Error).message}`,
            );
            return null;
          }),
      ]);
      bpLocations = bp?.locations ?? null;
    } catch (e) {
      const detail = (e as Error).message;
      console.error(`[place-order] fetch defaults failed for orderId=${orderId}: ${detail}`);
      await supabase.from("orders").update({ status: "failed_internal" }).eq("id", orderId);
      return json({ error: "Inizializzazione ordine Starty fallita", detail }, 502);
    }

    // ID indirizzo fatturazione/spedizione: PRIMA l'override esplicito del ristorante
    // (fonte di verità, scelto nel form admin); altrimenti l'euristica pickBpLocation
    // sul BP (fallback per ristoranti non ancora collegati / profili senza ristorante).
    const billLocationId = billLocOverride ?? pickBpLocation(bpLocations, "billTo");
    const shipLocationId = shipLocOverride ?? pickBpLocation(bpLocations, "shipTo");

    // poReference = "Riferimento ordine" su Starty. Limite DURO di 20 caratteri
    // (dichiarato dallo spec: il valore viene propagato sulla fattura
    // elettronica). E' solo un'etichetta leggibile per identificare il ristorante
    // a magazzino; NON e' una chiave di idempotenza/lookup (quella e'
    // orders.client_idempotency_key, separata e salvata a lunghezza piena),
    // quindi troncare e' collision-safe. Tutte le sorgenti possono superare i 20
    // char (ragione sociale/insegna sono free-text non limitati; idempotencyKey
    // e' sempre 32 hex) -> troncamento SEMPRE sul valore finale. Pre-trim + `||`
    // saltano sorgenti vuote/whitespace; ultimo fallback shortId(orderId)
    // (= orderNumber mostrato all'utente), piu' utile del vecchio idempotencyKey
    // opaco. Il nome legale completo resta comunque sull'ordine tramite
    // businessPartnerId -> BusinessPartner.name.
    // Array.from taglia sui CODE POINT (non sui code unit UTF-16): per "20
    // caratteri" e' la lettura corretta ed evita di spezzare un eventuale
    // surrogate pair (es. emoji nell'insegna) lasciando un surrogate spaiato
    // non valido nell'XML della fattura elettronica. Per i nomi legali latini
    // e' equivalente a slice(0,20).
    const poReference = Array.from(
      restRagioneSociale?.trim() || profile.restaurant_name?.trim() || shortId(orderId),
    ).slice(0, 20).join("").trimEnd();

    const orderIn = {
      ...orderTemplate,
      businessPartnerId: effectiveBpId!,
      warehouseId: WAREHOUSE_ID,
      docTypeId: DOC_TYPE_ID,
      dateOrdered: new Date().toISOString().slice(0, 19), // 'YYYY-MM-DDTHH:MM:SS' come da template
      // Vedi calcolo + cap a 20 char sopra (const poReference).
      poReference,
      // Nota del cliente (orders.notes) -> campo `description` dell'header
      // ordine Starty. CONFERMATO sullo spec OpenAPI (_starty-spec.json):
      // Order.description = "Nota cliente" (mentre Order.notaInterna = "Nota
      // interna", che NON usiamo qui). La valorizziamo SOLO se la nota esiste,
      // cosi' gli ordini senza nota restano byte-identici a prima.
      ...(body.notes ? { description: body.notes } : {}),
      // ── Indirizzi fatturazione/spedizione su Starty ──
      // Order.indFatturazioneId / indSpedizioneId sono riferimenti numerici a un
      // C_Location (location.locationId), NON al businessPartnerLocationId: usare
      // quest'ultimo faceva risolvere l'indirizzo su record C_Location estranei
      // (bug indirizzi esteri, es. ALCI SNC -> Helsinki/Nagykanizsa). Valori
      // dall'override del ristorante (form admin) oppure da pickBpLocation, che
      // ora ritorna location.locationId. Li valorizziamo SOLO se risolti;
      // altrimenti lasciamo il default del template (...orderTemplate).
      ...(billLocationId ? { indFatturazioneId: billLocationId } : {}),
      ...(shipLocationId ? { indSpedizioneId: shipLocationId } : {}),
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
        `[place-order] POST /v3/orders failed for orderId=${orderId} bpId=${effectiveBpId} warehouseId=${WAREHOUSE_ID} docTypeId=${DOC_TYPE_ID}: ${detail}`,
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

    // 7b. Read-back: conferma che Starty abbia DAVVERO persistito e completato
    // l'ordine. confirmIt puo' rispondere 2xx mentre il documento viene
    // rollback-ato / non committato lato Starty: in quel caso il numero di
    // sequenza resta "bruciato" (buco) e l'ordine sparisce, ma noi avremmo
    // marcato 'confirmed' lasciando il cliente convinto che l'ordine esista.
    // (Visto 2026-06-18: doc 26/0651 di PESMA sparito nonostante confirmIt 2xx.)
    // Accettiamo SOLO se l'ordine e' rileggibile con documentStatus 'CO'.
    try {
      const check = await startyFetch<StartyOrderOut>(`/v3/orders/${starty.orderId}`);
      if (check?.documentStatus !== "CO") {
        console.error(
          `[place-order] read-back inatteso per startyOrderId=${starty.orderId} docStatus=${check?.documentStatus ?? "n/d"} (supabase orderId=${orderId})`,
        );
        // Possibile draft orfano rimasto in DR: best-effort cleanup.
        try { await startyFetch(`/v3/orders/${starty.orderId}`, { method: "DELETE" }); } catch (_) {}
        await supabase.from("orders").update({ status: "failed_confirm" }).eq("id", orderId);
        return json(
          {
            error: "Ordine non confermato su Starty (verifica fallita). Riprova.",
            detail: `read-back docStatus=${check?.documentStatus ?? "assente"}`,
          },
          502,
        );
      }
    } catch (e) {
      // 404 = ordine non persistito su Starty; altri errori = stato incerto.
      // In entrambi i casi NON marchiamo 'confirmed': meglio un errore
      // ritentabile che un falso "confermato".
      const detail = (e as Error).message;
      console.error(
        `[place-order] read-back GET /v3/orders/${starty.orderId} fallito (supabase orderId=${orderId}): ${detail}`,
      );
      await supabase.from("orders").update({ status: "failed_confirm" }).eq("id", orderId);
      return json(
        { error: "Ordine non confermato su Starty (verifica fallita). Riprova.", detail },
        502,
      );
    }
  }

  // 8. Mark confirmed
  await supabase.from("orders").update({
    status: "confirmed",
    confirmed_at: new Date().toISOString(),
  }).eq("id", orderId);

  // 9. Notifica email (best-effort): l'ordine e' gia' confermato, un errore
  // di invio NON deve far fallire la chiamata. Registriamo esito/errore su orders.
  await sendOrderNotificationEmail(supabase, {
    orderId,
    restaurantName: profile.restaurant_name ?? restRagioneSociale ?? user.email ?? "Cliente",
    total,
    itemsCount,
    documentNumber: startyDocNumber,
  });

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
