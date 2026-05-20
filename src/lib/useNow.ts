"use client";

import { useEffect, useState } from "react";

/**
 * Returns a Date that ticks every `intervalMs` ms (default 30s).
 *
 * Ademas del tick periodico, refresca al volver al foreground (tab visible
 * de nuevo) y al redimensionar la ventana (debounced). Esto soluciona dos
 * casos donde el now-indicator del calendario quedaba atrasado:
 *   - Background tab throttling: el setInterval se pausa, al volver al tab
 *     el indicador estaba congelado donde quedo.
 *   - Resize del viewport: el componente se redibuja pero ctx.hour no
 *     cambia, asi que la posicion del indicador no se recomputa hasta el
 *     proximo tick.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tick = () => setNow(new Date());

    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      // Debounce: solo refresca cuando el usuario termino de redimensionar.
      // Evita 60Hz de re-renders mientras arrastra el borde de la ventana.
      resizeTimer = setTimeout(tick, 200);
    };

    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, []);

  return now;
}

/** Hydration-safe mount flag — avoid SSR/CSR mismatches on time-dependent UI. */
export function useMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
