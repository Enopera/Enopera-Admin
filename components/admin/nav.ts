// Navigazione admin.

export type PageId = "ordini" | "cantine" | "ristoranti" | "listini" | "utenti" | "vini";

export const PAGE_LABELS: Record<PageId, [string, string]> = {
  ordini:     ["Ordini",     "Consegne"],
  cantine:    ["Cantine",    "Stock clienti"],
  ristoranti: ["Ristoranti", "Anagrafiche B2B"],
  listini:    ["Listini",    "Prezzi per cliente"],
  utenti:     ["Utenti",     "Account"],
  vini:       ["Vini",       "Anagrafica catalogo"],
};

export const VALID_PAGES: readonly PageId[] = ["ordini", "cantine", "ristoranti", "listini", "utenti", "vini"];
