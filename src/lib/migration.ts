"use client";

import {
  upsertPerson,
  upsertLocation,
  upsertRoutine,
  upsertTask,
  upsertUserSettings,
  upsertDailyLog,
  loadAll,
} from "./api";
import type { AppState, Person, SavedLocation, Routine, Task } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Lee el estado persistido en localStorage DIRECTAMENTE, sin pasar por Zustand.
 * Esto evita la condicion de carrera donde la auth termina antes que persist
 * hidrate el store.
 */
export function readLocalStateRaw(): AppState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("fafo-state-v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Zustand persist envuelve en { state: ..., version: ... }
    return (parsed?.state as AppState) ?? null;
  } catch (err) {
    console.warn("[FAFO] localStorage read failed", err);
    return null;
  }
}

/**
 * Migra el estado local (localStorage de Zustand persist) al usuario actual
 * de Supabase. Solo corre si Supabase esta vacio para este usuario (excepto
 * el "self" auto-creado por el trigger fafo_on_signup).
 *
 * Regenera ids para evitar conflictos con otros usuarios (la PK es global)
 * y remapea las referencias (personId, locationId, routineId).
 */
export async function migrateLocalToSupabaseIfEmpty(local: AppState | null) {
  // Si recibimos null o local vacio, leemos directo de localStorage como fallback
  const source = local ?? readLocalStateRaw();
  if (!source) {
    return { migrated: false, reason: "no local source" };
  }
  const remote = await loadAll();
  // Si el usuario ya tiene tareas/rutinas/locations o personas no-self, no migramos.
  const remoteHasUserData =
    remote.tasks.length > 0 ||
    remote.routines.length > 0 ||
    remote.locations.length > 0 ||
    remote.people.some((p) => !p.isSelf);
  if (remoteHasUserData) {
    return { migrated: false, reason: "remote already has data" };
  }
  // Si el local esta vacio (solo seed), no vale la pena migrar nada manual.
  if (
    source.tasks.length === 0 &&
    source.routines.length === 0 &&
    source.locations.length === 0 &&
    source.people.filter((p) => !p.isSelf).length === 0
  ) {
    return { migrated: false, reason: "local empty" };
  }
  const localData = source;
  console.log("[FAFO migrate] starting:", {
    tasks: localData.tasks.length,
    routines: localData.routines.length,
    locations: localData.locations.length,
    people: localData.people.filter((p) => !p.isSelf).length,
  });

  // Mapeos vieja → nueva id
  const remoteSelf = remote.people.find((p) => p.isSelf);
  const newSelfId = remoteSelf?.id ?? "self-unknown";

  const personIdMap = new Map<string, string>();
  for (const p of localData.people) {
    if (p.isSelf) {
      personIdMap.set(p.id, newSelfId);
    } else {
      personIdMap.set(p.id, "person-" + uid());
    }
  }

  const locationIdMap = new Map<string, string>();
  for (const l of localData.locations) {
    locationIdMap.set(l.id, "loc-" + uid());
  }

  const routineIdMap = new Map<string, string>();
  for (const r of localData.routines) {
    routineIdMap.set(r.id, "rt-" + uid());
  }

  const taskIdMap = new Map<string, string>();
  for (const t of localData.tasks) {
    taskIdMap.set(t.id, "t-" + uid());
  }

  // 1) Personas (skip self — ya existe)
  for (const p of localData.people) {
    if (p.isSelf) continue;
    const newP: Person = { ...p, id: personIdMap.get(p.id)! };
    await upsertPerson(newP);
  }

  // 2) Locations
  for (const l of localData.locations) {
    const newL: SavedLocation = { ...l, id: locationIdMap.get(l.id)! };
    await upsertLocation(newL);
  }

  // 3) Rutinas (con referencias remapeadas)
  for (const r of localData.routines) {
    const newR: Routine = {
      ...r,
      id: routineIdMap.get(r.id)!,
      personId: r.personId ? personIdMap.get(r.personId) : undefined,
      locationId: r.locationId ? locationIdMap.get(r.locationId) : undefined,
    };
    await upsertRoutine(newR);
  }

  // 4) Tareas (con referencias remapeadas)
  let sortIdx = 0;
  for (const t of localData.tasks) {
    const newT: Task = {
      ...t,
      id: taskIdMap.get(t.id)!,
      personId: t.personId ? personIdMap.get(t.personId) : undefined,
      locationId: t.locationId ? locationIdMap.get(t.locationId) : undefined,
      routineId: t.routineId ? routineIdMap.get(t.routineId) : undefined,
    };
    await upsertTask(newT, sortIdx++);
  }

  // 5) Settings
  await upsertUserSettings({
    daily_goal: localData.dailyGoal,
    current_location_id: localData.currentLocationId
      ? (locationIdMap.get(localData.currentLocationId) ?? null)
      : null,
    use_real_gps: localData.useRealGps,
    theme: localData.theme,
    xp: localData.xp,
    longest_streak: localData.longestStreak,
  });

  // 6) Daily logs
  for (const log of localData.dailyLogs) {
    await upsertDailyLog(log);
  }

  return { migrated: true, reason: "ok" };
}
