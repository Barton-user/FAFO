"use client";

import { useMemo } from "react";
import { useFafoStore } from "./store";
import { useGeolocation } from "./useGeolocation";
import { resolveActiveLocation } from "./geo";
import type { SavedLocation, Weekday } from "./types";
import { useNow } from "./useNow";

export interface ResolvedContext {
  now: Date;
  weekday: Weekday;
  hour: number; // fractional 0..24
  activeLocation: SavedLocation | null;
  source: "gps" | "mock" | "none";
  gpsError: string | null;
  gpsPermission: "unknown" | "granted" | "denied" | "prompt";
}

export function useResolvedContext(): ResolvedContext {
  const now = useNow(30_000);
  const useRealGps = useFafoStore((s) => s.useRealGps);
  const currentLocationId = useFafoStore((s) => s.currentLocationId);
  const locations = useFafoStore((s) => s.locations);

  const gps = useGeolocation(useRealGps);

  return useMemo(() => {
    const weekday = now.getDay() as Weekday;
    const hour = now.getHours() + now.getMinutes() / 60;

    let activeLocation: SavedLocation | null = null;
    let source: "gps" | "mock" | "none" = "none";

    if (useRealGps && gps.coords) {
      activeLocation = resolveActiveLocation(gps.coords, locations);
      source = "gps";
    } else if (currentLocationId) {
      activeLocation =
        locations.find((l) => l.id === currentLocationId) ?? null;
      source = activeLocation ? "mock" : "none";
    }

    return {
      now,
      weekday,
      hour,
      activeLocation,
      source,
      gpsError: gps.error,
      gpsPermission: gps.permission,
    };
  }, [
    now,
    useRealGps,
    gps.coords,
    gps.error,
    gps.permission,
    currentLocationId,
    locations,
  ]);
}
