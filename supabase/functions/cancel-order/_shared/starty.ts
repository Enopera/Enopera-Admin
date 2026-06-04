// Allineato con supabase/functions/_shared/starty.ts: stesse env
// (STARTY_BASE_URL + STARTY_INITIAL_TOKEN). Esponiamo qui un fetcher
// 'raw' che ritorna sempre uno StartyAttempt (status + body + location)
// per loggare i tentativi della saga draftIt+DELETE.

const BASE = Deno.env.get("STARTY_BASE_URL") ?? "https://api.startyerp.cloud/four";
const SESSION_TOKEN = Deno.env.get("STARTY_INITIAL_TOKEN") ?? "";

export interface StartyAttempt {
  method: string;
  path: string;
  status: number;
  body: string;
  location: string | null;
  ok: boolean;
}

export async function startyFetchRaw(method: string, path: string, body?: unknown): Promise<StartyAttempt> {
  if (!SESSION_TOKEN) {
    return { method, path, status: 0, body: "STARTY_INITIAL_TOKEN non configurato", location: null, ok: false };
  }
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${SESSION_TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text().catch(() => "");
  const location = res.headers.get("location");
  const attempt: StartyAttempt = {
    method, path, status: res.status, body: text.slice(0, 600), location,
    ok: res.ok && res.status < 300,
  };
  console.log(`[starty] ${method} ${path} -> ${res.status} location=${location ?? "-"} body=${text.slice(0, 300)}`);
  return attempt;
}
