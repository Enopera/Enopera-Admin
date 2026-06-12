"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

/// Aggiorna la config globale di spedizione (riga singleton id=true).
export async function updateShippingConfig(
  feeNet: number,
  freeThresholdGross: number,
): Promise<ActionResult> {
  if (!Number.isFinite(feeNet) || feeNet < 0) {
    return { ok: false, error: "Costo spedizione non valido" };
  }
  if (!Number.isFinite(freeThresholdGross) || freeThresholdGross < 0) {
    return { ok: false, error: "Soglia gratuita non valida" };
  }
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("shipping_config")
    .update({
      fee_net: feeNet,
      free_threshold_gross: freeThresholdGross,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ristoranti");
  return { ok: true, message: "Configurazione spedizione salvata" };
}
