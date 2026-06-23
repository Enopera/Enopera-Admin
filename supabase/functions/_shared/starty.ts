// Client HTTP per StartyERP.
//
// Auth: STARTY_INITIAL_TOKEN e' un session JWT gia' completo
// (contiene userId/roleId/clientId/orgId) da usare direttamente come
// Authorization: Bearer. L'endpoint /v3/handshake che il codice precedente
// chiamava per "rinnovo sessione" in realta' non esiste (308 redirect alla
// swagger UI) e portava a usare HTML come Bearer, con errori 4xx/5xx random.
//
// Le altre env (STARTY_ROLE_ID, STARTY_ORG_ID) restano disponibili per usi
// futuri (es. cambio ruolo runtime) ma non sono piu' necessarie qui.

const BASE = Deno.env.get("STARTY_BASE_URL") ?? "https://api.startyerp.cloud/four";
const SESSION_TOKEN = Deno.env.get("STARTY_INITIAL_TOKEN") ?? "";

/** Fetch wrapper: aggiunge Authorization e parsing JSON. */
export async function startyFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  _retryCount = 0,
): Promise<T> {
  if (!SESSION_TOKEN) {
    throw new Error("STARTY_INITIAL_TOKEN non configurato. Setta le secrets.");
  }
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
      Authorization: `Bearer ${SESSION_TOKEN}`,
    },
  });

  // 429 -> rate limit Starty: backoff e retry (max 2 tentativi).
  // Honor Retry-After se presente (in secondi), altrimenti backoff esponenziale
  // 2s, 4s. Coperto solo per GET/HEAD per evitare doppie scritture su POST/DELETE.
  if (res.status === 429 && _retryCount < 2) {
    const method = (init.method ?? "GET").toUpperCase();
    if (method === "GET" || method === "HEAD") {
      const retryAfterHdr = res.headers.get("retry-after");
      const retryAfterSec = retryAfterHdr ? Number(retryAfterHdr) : NaN;
      const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? Math.min(retryAfterSec * 1000, 10_000)
        : 2000 * Math.pow(2, _retryCount);
      await new Promise((r) => setTimeout(r, waitMs));
      return startyFetch(path, init, _retryCount + 1);
    }
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new StartyHttpError(res.status, `${res.status} ${path} :: ${body.slice(0, 300)}`);
  }
  // Alcuni endpoint Starty (es. confirmIt) rispondono 200 con Content-Length: 0
  // invece di 204: trattiamo body vuoto come success "void" senza chiamare json().
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text.trim()) return undefined as T;
  return JSON.parse(text) as T;
}

export class StartyHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "StartyHttpError";
  }
}

// ─── Tipi minimi (sottoinsieme dello schema OpenAPI) ────────────
export interface StartyProduct {
  productId: number;
  name: string;
  description?: string;
  code?: string;
  sku?: string;
  upc?: string;
  classification?: string;
  productType?: string;
  uomId?: number;
  unitsPerPackage?: number;
  isStocked?: boolean;
  lotManaged?: boolean;
  sold?: boolean;
}

export interface StartyStockRow {
  productId: number;
  productName: string;
  productCode?: string;
  warehouseId: number;
  warehouseName?: string;
  lotId?: number;
  lotName?: string;
  lotExpiryDate?: string;
  qtyOnHand: number;
  qtyReserved: number;
  qtyOrdered: number;
  qtyAvailable: number;
}

export interface StartyOrderLineIn {
  productId: number;
  quantity: number;
  uomId?: number;
  price?: number;
  taxId?: number;
}

export interface StartyOrderIn {
  businessPartnerId: number;
  warehouseId: number;
  docTypeId: number;
  priceListId?: number;
  paymentTermId?: number;
  currencyId?: number;
  dateOrdered: string;        // YYYY-MM-DD
  poReference?: string;       // <- visualizzato come "Riferimento ordine" su Starty (nome ristorante)
  description?: string;       // <- "Descrizione" header ordine: usato per la nota cliente (orders.notes)
  orderLines: StartyOrderLineIn[];
}

export interface StartyOrderOut extends StartyOrderIn {
  orderId: number;
  documentNumber: string;
  documentStatus: string;
  isHandled: string;
}
