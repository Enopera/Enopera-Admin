// starty-bp-search — ricerca Business Partner su Starty per il form ristorante admin.
// Solo READ su Starty. Due modalità:
//   ?q=<P.IVA (11 cifre) o testo>  -> lista BP (id, nome, P.IVA, città) SENZA location
//                                     (l'endpoint-lista di Starty non include le entità interne)
//   ?bpId=<id>                     -> singolo BP CON location (per popolare i selettori spedizione/fatturazione)
//
// Auth: verify_jwt=true. Chiamata server-side dall'admin con la service-role key
// (è un JWT valido). NON usa auth.getUser: le serve solo STARTY_TOKEN/STARTY_TENANT dall'env.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function startyGet(path: string): Promise<any> {
  const tenant = Deno.env.get("STARTY_TENANT");
  const token = Deno.env.get("STARTY_TOKEN");
  if (!tenant || !token) throw new Error("STARTY_TENANT / STARTY_TOKEN mancanti nei secret");
  const r = await fetch(`https://api.startyerp.cloud/${tenant}/v3/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Starty ${r.status}: ${body.slice(0, 200)}`);
  }
  return r.json();
}

const onlyDigits = (s: string | null | undefined): string => (s ?? "").replace(/\D/g, "");

// deno-lint-ignore no-explicit-any
function compactLocations(bp: any) {
  // `id` = location.locationId (C_Location id). È QUESTO il valore atteso da
  // Order.indSpedizioneId / indFatturazioneId su Starty (verificato: la UI
  // nativa di Starty popola quei campi con il C_Location id, NON con il
  // businessPartnerLocationId — usare quest'ultimo fa risolvere l'indirizzo su
  // record C_Location estranei, es. esteri). bpLocationId resta esposto solo a
  // scopo diagnostico.
  // deno-lint-ignore no-explicit-any
  return ((bp.locations ?? []) as any[]).map((l) => ({
    id: l.location?.locationId ?? null,
    bpLocationId: l.businessPartnerLocationId ?? null,
    name: (l.name ?? "").trim(),
    address: l.location?.address1 ?? "",
    city: l.location?.city ?? "",
    postalCode: l.location?.postalCode ?? "",
    countryId: l.location?.countryId ?? null,
    billTo: l.billTo === true,
    shipTo: l.shipTo === true,
  }));
}

// deno-lint-ignore no-explicit-any
const compactBp = (bp: any) => ({
  businessPartnerId: bp.businessPartnerId,
  name: bp.name ?? "",
  taxId: onlyDigits(bp.taxId) || (bp.taxId ?? null),
  city: bp.city ?? "",
  locations: compactLocations(bp),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const u = new URL(req.url);
  const bpId = u.searchParams.get("bpId");
  const q = (u.searchParams.get("q") ?? "").trim();
  try {
    // Modalità byId: BP singolo con location (l'admin la chiama alla scelta del BP).
    if (bpId) {
      const bp = await startyGet(`business-partners/${encodeURIComponent(bpId)}`);
      return json({ ok: true, results: [compactBp(bp)] });
    }
    // Modalità ricerca: P.IVA (11 cifre) o nome. La lista NON porta le location.
    if (!q) return json({ ok: true, results: [] });
    const norm = onlyDigits(q);
    const filter = norm.length === 11
      ? `taxId=${encodeURIComponent(norm)}`
      : `businessName=${encodeURIComponent(q)}`;
    const res = await startyGet(`business-partners?${filter}&pagesize=25`);
    // deno-lint-ignore no-explicit-any
    const list = (res?.businessPartners ?? []) as any[];
    return json({
      ok: true,
      results: list.map((bp) => ({
        businessPartnerId: bp.businessPartnerId,
        name: bp.name ?? "",
        taxId: onlyDigits(bp.taxId) || (bp.taxId ?? null),
        city: bp.city ?? "",
        locations: [], // popolate via ?bpId alla scelta
      })),
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 502);
  }
});
