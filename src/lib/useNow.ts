"use client";

import { useEffect, useState } from "react";

/** Returns a Date that ticks every `intervalMs` ms (default 30s). */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Hydration-safe mount flag — avoid SSR/CSR mismatches on time-dependent UI. */
export function useMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
