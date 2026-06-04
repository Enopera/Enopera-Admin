import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminPriceList, PriceListOption } from "./types";

export async function listPriceLists(): Promise<AdminPriceList[]> {
  const supabase = createAdminClient();

  const [listsRes, countsRes] = await Promise.all([
    supabase.from("price_lists").select("*").order("is_default", { ascending: false }).order("name"),
    supabase.from("restaurants").select("price_list_id"),
  ]);
  if (listsRes.error) throw listsRes.error;
  if (countsRes.error) throw countsRes.error;

  const countByList = new Map<string, number>();
  for (const r of countsRes.data ?? []) {
    const id = r.price_list_id as string | null;
    if (!id) continue;
    countByList.set(id, (countByList.get(id) ?? 0) + 1);
  }

  return (listsRes.data ?? []).map((r): AdminPriceList => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? null,
    startyId: (r.starty_id as number) ?? null,
    isDefault: Boolean(r.is_default),
    active: Boolean(r.active),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    restaurantsCount: countByList.get(r.id as string) ?? 0,
  }));
}

/// Sottoinsieme usato dai select (id+nome+isDefault).
export async function listPriceListOptions(): Promise<PriceListOption[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("price_lists")
    .select("id, name, is_default")
    .eq("active", true)
    .order("is_default", { ascending: false })
    .order("name");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    isDefault: Boolean(r.is_default),
  }));
}
