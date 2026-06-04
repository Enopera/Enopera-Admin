"use server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const Schema = z.object({
  grape:  z.string().trim().max(200).nullable().optional(),
  region: z.string().trim().max(200).nullable().optional(),
  abv:    z.number().min(0).max(20).nullable().optional(),
});

export async function updateWineMetadata(
  wineId: string,
  fields: unknown,
): Promise<void> {
  await requireAdmin();
  const parsed = Schema.parse(fields);

  // Normalizza empty string → null (cella svuotata = "non popolato")
  const update: Record<string, string | number | null> = {};
  if ("grape"  in parsed) update.grape  = (parsed.grape  ?? "") || null;
  if ("region" in parsed) update.region = (parsed.region ?? "") || null;
  if ("abv"    in parsed) update.abv    = parsed.abv ?? null;

  const supa = createAdminClient();
  const { error } = await supa.from("wines").update(update).eq("id", wineId);
  if (error) throw error;
}
