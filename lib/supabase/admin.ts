// Service-role Supabase client. Server-only.
// Bypassa la RLS — usalo solo da Server Actions / Route Handlers / RSC,
// MAI da componenti client. Tutto il portale admin è già protetto da basic auth
// (middleware.ts) quindi è sicuro usarlo a piacere qui dentro.

import "server-only";
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. " +
      "Recuperala da Supabase Dashboard → Project Settings → API → 'service_role' key.",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
