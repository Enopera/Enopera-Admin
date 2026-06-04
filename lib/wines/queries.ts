import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type WineRow = {
  id: string;
  name: string;
  producer: string | null;
  type: string;
  vintage: number | null;
  grape: string | null;
  region: string | null;
  abv: number | null;
  starty_product_id: number | null;
};

export type AutocompleteOptions = {
  grapes: string[];
  regions: string[];
};

export async function listWinesForAdmin(): Promise<WineRow[]> {
  const supa = createAdminClient();
  const { data, error } = await supa
    .from("wines")
    .select("id, name, producer, type, vintage, grape, region, abv, starty_product_id")
    .eq("active", true)
    .order("producer", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WineRow[];
}

export async function listGrapeRegionOptions(): Promise<AutocompleteOptions> {
  const supa = createAdminClient();
  const { data, error } = await supa
    .from("wines")
    .select("grape, region")
    .or("grape.not.is.null,region.not.is.null");
  if (error) throw error;
  const grapes = new Set<string>();
  const regions = new Set<string>();
  for (const row of data ?? []) {
    if (row.grape) grapes.add(row.grape);
    if (row.region) regions.add(row.region);
  }
  return {
    grapes:  [...grapes].sort((a, b) => a.localeCompare(b, "it")),
    regions: [...regions].sort((a, b) => a.localeCompare(b, "it")),
  };
}
