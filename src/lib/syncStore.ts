"use client";

import { create } from "zustand";

interface SyncState {
  pending: number;
  lastError: string | null;
  lastSyncedAt: number | null;
  inc: () => void;
  dec: () => void;
  setError: (msg: string | null) => void;
}

/**
 * Track de mutaciones en vuelo contra Supabase. La UI lo usa para mostrar
 * un puntito de actividad y un toast de error si algo falla.
 */
export const useSyncStore = create<SyncState>((set) => ({
  pending: 0,
  lastError: null,
  lastSyncedAt: null,
  inc: () => set((s) => ({ pending: s.pending + 1 })),
  dec: () =>
    set((s) => ({
      pending: Math.max(0, s.pending - 1),
      lastSyncedAt: Date.now(),
    })),
  setError: (msg) => set({ lastError: msg }),
}));
