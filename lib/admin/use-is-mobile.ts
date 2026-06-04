"use client";

import { useEffect, useState } from "react";

/// Hook responsive: ritorna `true` sotto la breakpoint specificata.
///
/// SSR-safe: di default ritorna `false` (desktop-first), poi al mount sul
/// client legge `matchMedia` e si aggiorna. C'è una breve "flash" di layout
/// desktop sui dispositivi mobile in fase di hydration — accettabile per
/// un admin tool dove il path mobile non è il caso primario.
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [breakpoint]);
  return isMobile;
}
