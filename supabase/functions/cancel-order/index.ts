// cancel-order v5 - strategia draftIt + DELETE.
//
// Starty NON espone voidIt/processIt. Gli unici endpoint orders sono:
//   POST /v3/orders/{id}/draftIt   -> riporta CO -> DR (libera riservazioni)
//   DELETE /v3/orders/{id}         -> elimina solo se DR
//
// Quindi per annullare un ordine confermato:
//   1) POST /draftIt  (se 2xx -> ordine ora in DR)
//   2) DELETE /{id}   (se 2xx -> sparito da Starty)
//   3) DELETE riga Supabase
//
// Failure modes:
//   - draftIt fallisce -> ordine intoccato in Starty, non cancelliamo Supabase
//   - DELETE Starty fallisce dopo draftIt OK -> ordine resta in DR (potra'
//     essere cancellato a mano), non cancelliamo Supabase
//   - DELETE Supabase fallisce -> stato incoerente: Starty cancellato ma
//     Supabase resta. Caso raro, log + 500.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { startyFetchRaw, type StartyAttempt } from "./_shared/starty.ts";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BYPASS_STARTY = (Deno.env.get("BYPASS_STARTY") ?? "false").toLowerCase() === "true";
// Default: write enabled. La saga draftIt+DELETE e' testata e funzionante;
// il flag esiste per emergenze (es. Starty down, posso temporaneamente
// settare STARTY_WRITE_ORDERS=false per non bloccare le cancellazioni app).
const STARTY_WRITE_ORDERS_FLAG = Deno.env.get("STARTY_WRITE_ORDERS");
const WRITE_ENABLED = !BYPASS_STARTY && (STARTY_WRITE_ORDERS_FLAG ?? "true").toLowerCase() !== "false";

const CANCEL_WINDOW_MINUTES = 15;

interface CancelRequest { orderId: string; }

interface OrderRow {
  id: string;
  user_id: string;
  status: string;
  starty_order_id: number | null;
  starty_document_number: string | null;
  created_at: string;
  confirmed_at: string | null;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const userJwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!userJwt) return json({ error: "Missing Authorization" }, 401);

  const supabase = createClient(SUPA_URL, SERVICE_ROLE);
  const { data: { user }, error: userErr } = await supabase.auth.getUser(userJwt);
  if (userErr || !user) return json({ error: "Invalid token" }, 401);

  let body: CancelRequest;
  try { body = await req.json() as CancelRequest; }
  catch { return json({ error: "Body non e' JSON valido" }, 400); }
  if (!body.orderId) return json({ error: "orderId richiesto" }, 400);

  const { data: orderRaw, error: orderErr } = await supabase
    .from("orders")
    .select("id, user_id, status, starty_order_id, starty_document_number, created_at, confirmed_at")
    .eq("id", body.orderId)
    .maybeSingle();
  if (orderErr) return json({ error: "Errore lettura ordine", detail: orderErr.message }, 500);
  const order = orderRaw as OrderRow | null;
  if (!order) return json({ error: "Ordine non trovato" }, 404);

  if (order.user_id !== user.id) return json({ error: "Ordine non autorizzato" }, 403);
  if (order.status !== "confirmed") {
    return json({ error: `Ordine in stato "${order.status}" non annullabile` }, 409);
  }

  const createdAt = new Date(order.created_at).getTime();
  const ageMin = (Date.now() - createdAt) / 60000;
  if (ageMin > CANCEL_WINDOW_MINUTES) {
    return json({
      error: `Finestra di annullamento scaduta (${Math.floor(ageMin)} min, limite ${CANCEL_WINDOW_MINUTES})`,
    }, 409);
  }

  if (WRITE_ENABLED && order.starty_order_id) {
    const attempts: StartyAttempt[] = [];

    // Step 1: draftIt (CO -> DR)
    const draft = await startyFetchRaw("POST", `/v3/orders/${order.starty_order_id}/draftIt`);
    attempts.push(draft);
    if (!draft.ok) {
      console.error(`[cancel-order] draftIt failed for starty_order_id=${order.starty_order_id}: ${draft.status} ${draft.body.slice(0, 200)}`);
      return json({
        error: "Impossibile riportare l'ordine in bozza su Starty (potrebbe essere gia' evaso)",
        startyOrderId: order.starty_order_id,
        attempts,
      }, draft.status >= 500 ? 502 : 409);
    }

    // Step 2: DELETE (solo se DR)
    const del = await startyFetchRaw("DELETE", `/v3/orders/${order.starty_order_id}`);
    attempts.push(del);
    if (!del.ok) {
      // L'ordine e' ora in DR ma DELETE e' fallito. Stato Starty: bozza pendente.
      // L'ufficio puo' cancellarla a mano. Non eliminiamo Supabase per coerenza.
      console.error(`[cancel-order] DELETE failed for starty_order_id=${order.starty_order_id} (now DR): ${del.status} ${del.body.slice(0, 200)}`);
      return json({
        error: "Ordine riportato in bozza su Starty ma cancellazione fallita. Contatta Enopera.",
        startyOrderId: order.starty_order_id,
        attempts,
      }, del.status >= 500 ? 502 : 409);
    }

    console.log(`[cancel-order] Starty void OK starty_order_id=${order.starty_order_id} doc=${order.starty_document_number}`);
  } else if (order.starty_order_id) {
    console.warn(`[cancel-order] WRITE_ENABLED=false: skip Starty cancel per starty_order_id=${order.starty_order_id} (BYPASS_STARTY=${BYPASS_STARTY}, STARTY_WRITE_ORDERS=${STARTY_WRITE_ORDERS_FLAG ?? 'unset'}). L'ordine resta su Starty.`);
  }

  const { error: delErr } = await supabase.from("orders").delete().eq("id", body.orderId);
  if (delErr) {
    console.error(`[cancel-order] DELETE Supabase fallito dopo void Starty: ${delErr.message}`);
    return json({ error: "Cancellazione Supabase fallita", detail: delErr.message }, 500);
  }

  return json({
    ok: true,
    orderId: body.orderId,
    startyOrderId: order.starty_order_id,
    documentNumber: order.starty_document_number,
    voidedOnStarty: !!(WRITE_ENABLED && order.starty_order_id),
  });
});
