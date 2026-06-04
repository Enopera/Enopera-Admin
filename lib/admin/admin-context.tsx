// lib/admin/admin-context.tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";

/// Solo lo username viaggia nei client component — l'email sintetica
/// non ha valore lato UI ed è solo un dettaglio implementativo.
const AdminContext = createContext<{ username: string } | null>(null);

export function AdminContextProvider({
  username,
  children,
}: {
  username: string;
  children: ReactNode;
}) {
  return (
    <AdminContext.Provider value={{ username }}>{children}</AdminContext.Provider>
  );
}

/// Hook per i client component che vogliono mostrare username loggato.
/// Fallisce loud se chiamato fuori dal layout admin (errore di programmazione).
export function useAdminContext(): { username: string } {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error("useAdminContext must be used inside AdminContextProvider");
  }
  return ctx;
}
