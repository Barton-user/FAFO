// Geo helpers — haversine distance + geofence resolver

import type { GeoCoords, SavedLocation } from "./types";

export function haversineMeters(a: GeoCoords, b: GeoCoords): number {
  const R = 6371000; // meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function resolveActiveLocation(
  coords: GeoCoords | null,
  locations: SavedLocation[]
): SavedLocation | null {
  if (!coords) return null;
  let best: { loc: SavedLocation; d: number } | null = null;
  for (const loc of locations) {
    const d = haversineMeters(coords, loc.coords);
    if (d <= loc.radiusMeters && (!best || d < best.d)) {
      best = { loc, d };
    }
  }
  return best?.loc ?? null;
}
