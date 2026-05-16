"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoCoords } from "./types";

interface GeoState {
  coords: GeoCoords | null;
  error: string | null;
  permission: "unknown" | "granted" | "denied" | "prompt";
  loading: boolean;
}

export function useGeolocation(enabled: boolean): GeoState {
  const [state, setState] = useState<GeoState>({
    coords: null,
    error: null,
    permission: "unknown",
    loading: enabled,
  });
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (watchId.current !== null && typeof navigator !== "undefined") {
        navigator.geolocation?.clearWatch(watchId.current);
        watchId.current = null;
      }
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({
        coords: null,
        error: "Geolocation API no soportada",
        permission: "denied",
        loading: false,
      });
      return;
    }

    setState((s) => ({ ...s, loading: true }));

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          error: null,
          permission: "granted",
          loading: false,
        });
      },
      (err) => {
        setState({
          coords: null,
          error: err.message,
          permission: err.code === 1 ? "denied" : "prompt",
          loading: false,
        });
      },
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 }
    );

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [enabled]);

  return state;
}
