import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { SHIPPING_FALLBACK, type ShippingConfig } from "./types";

/// Legge la riga singleton di public.shipping_config. Se assente/illeggibile
/// torna i fallback storici (10 / 300) cosi' la UI ha sempre valori sensati.
export async function getShippingConfig(): Promise<ShippingConfig> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("shipping_config")
    .select("fee_net, free_threshold_gross, updated_at")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return SHIPPING_FALLBACK;
  return {
    feeNet: Number(data.fee_net),
    freeThresholdGross: Number(data.free_threshold_gross),
    updatedAt: (data.updated_at as string) ?? "",
  };
}
