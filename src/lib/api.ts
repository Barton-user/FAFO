"use client";

import { supabase } from "./supabase";
import type {
  Task,
  Routine,
  Person,
  SavedLocation,
  Priority,
  Weekday,
  DailyLog,
  Theme,
} from "./types";

// =====================================================
// Helpers
// =====================================================

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function withUser<T>(fn: (uid: string) => Promise<T>): Promise<T | null> {
  const uid = await currentUserId();
  if (!uid) {
    console.warn("[FAFO API] No hay sesion activa");
    return null;
  }
  return fn(uid);
}

// =====================================================
// PEOPLE
// =====================================================

interface PersonRow {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  color: string;
  is_self: boolean;
  created_at: string;
}

function rowToPerson(r: PersonRow): Person {
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    color: r.color,
    isSelf: r.is_self,
    createdAt: new Date(r.created_at).getTime(),
  };
}

function personToRow(p: Partial<Person>, userId: string) {
  const row: Record<string, unknown> = { user_id: userId };
  if (p.id !== undefined) row.id = p.id;
  if (p.name !== undefined) row.name = p.name;
  if (p.emoji !== undefined) row.emoji = p.emoji;
  if (p.color !== undefined) row.color = p.color;
  if (p.isSelf !== undefined) row.is_self = p.isSelf;
  return row;
}

export async function listPeople(): Promise<Person[]> {
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToPerson);
}

export async function upsertPerson(p: Person) {
  return withUser(async (uid) => {
    const { error } = await supabase.from("people").upsert(personToRow(p, uid));
    if (error) throw error;
  });
}

export async function updatePersonApi(id: string, patch: Partial<Person>) {
  return withUser(async (uid) => {
    const row = personToRow(patch, uid);
    delete row.user_id;
    const { error } = await supabase.from("people").update(row).eq("id", id);
    if (error) throw error;
  });
}

export async function deletePersonApi(id: string) {
  const { error } = await supabase.from("people").delete().eq("id", id);
  if (error) throw error;
}

// =====================================================
// LOCATIONS
// =====================================================

interface LocationRow {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  lat: number;
  lng: number;
  radius_meters: number;
  is_mock: boolean;
}

function rowToLocation(r: LocationRow): SavedLocation {
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    coords: { lat: Number(r.lat), lng: Number(r.lng) },
    radiusMeters: r.radius_meters,
    isMock: r.is_mock,
  };
}

function locationToRow(l: Partial<SavedLocation>, userId: string) {
  const row: Record<string, unknown> = { user_id: userId };
  if (l.id !== undefined) row.id = l.id;
  if (l.name !== undefined) row.name = l.name;
  if (l.emoji !== undefined) row.emoji = l.emoji;
  if (l.coords !== undefined) {
    row.lat = l.coords.lat;
    row.lng = l.coords.lng;
  }
  if (l.radiusMeters !== undefined) row.radius_meters = l.radiusMeters;
  if (l.isMock !== undefined) row.is_mock = l.isMock;
  return row;
}

export async function listLocations(): Promise<SavedLocation[]> {
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToLocation);
}

export async function upsertLocation(l: SavedLocation) {
  return withUser(async (uid) => {
    const { error } = await supabase
      .from("locations")
      .upsert(locationToRow(l, uid));
    if (error) throw error;
  });
}

export async function deleteLocationApi(id: string) {
  const { error } = await supabase.from("locations").delete().eq("id", id);
  if (error) throw error;
}

// =====================================================
// ROUTINES
// =====================================================

interface RoutineRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
  weekdays: number[];
  start_hour: number;
  end_hour: number;
  location_id: string | null;
  person_id: string | null;
  created_at: string;
}

function rowToRoutine(r: RoutineRow): Routine {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    weekdays: r.weekdays as Weekday[],
    startHour: Number(r.start_hour),
    endHour: Number(r.end_hour),
    locationId: r.location_id ?? undefined,
    personId: r.person_id ?? undefined,
    createdAt: new Date(r.created_at).getTime(),
  };
}

function routineToRow(r: Partial<Routine>, userId: string) {
  const row: Record<string, unknown> = { user_id: userId };
  if (r.id !== undefined) row.id = r.id;
  if (r.name !== undefined) row.name = r.name;
  if (r.color !== undefined) row.color = r.color;
  if (r.weekdays !== undefined) row.weekdays = r.weekdays;
  if (r.startHour !== undefined) row.start_hour = r.startHour;
  if (r.endHour !== undefined) row.end_hour = r.endHour;
  if (r.locationId !== undefined) row.location_id = r.locationId ?? null;
  if (r.personId !== undefined) row.person_id = r.personId ?? null;
  return row;
}

export async function listRoutines(): Promise<Routine[]> {
  const { data, error } = await supabase
    .from("routines")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToRoutine);
}

export async function upsertRoutine(r: Routine) {
  return withUser(async (uid) => {
    const { error } = await supabase
      .from("routines")
      .upsert(routineToRow(r, uid));
    if (error) throw error;
  });
}

export async function updateRoutineApi(id: string, patch: Partial<Routine>) {
  return withUser(async (uid) => {
    const row = routineToRow(patch, uid);
    delete row.user_id;
    const { error } = await supabase.from("routines").update(row).eq("id", id);
    if (error) throw error;
  });
}

export async function deleteRoutineApi(id: string) {
  const { error } = await supabase.from("routines").delete().eq("id", id);
  if (error) throw error;
}

// =====================================================
// TASKS
// =====================================================

interface TaskRow {
  id: string;
  user_id: string;
  name: string;
  notes: string | null;
  priority: number;
  done: boolean;
  weekdays: number[];
  start_hour: number;
  end_hour: number;
  routine_id: string | null;
  location_id: string | null;
  person_id: string | null;
  is_vital: boolean;
  flexible: boolean;
  recurring_in_routine: boolean;
  sort_index: number;
  completed_at: string | null;
  created_at: string;
}

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    name: r.name,
    notes: r.notes ?? undefined,
    priority: r.priority as Priority,
    done: r.done,
    weekdays: r.weekdays as Weekday[],
    startHour: Number(r.start_hour),
    endHour: Number(r.end_hour),
    routineId: r.routine_id ?? undefined,
    locationId: r.location_id ?? undefined,
    personId: r.person_id ?? undefined,
    isVital: r.is_vital,
    flexible: r.flexible,
    recurringInRoutine: r.recurring_in_routine,
    createdAt: new Date(r.created_at).getTime(),
    completedAt: r.completed_at ? new Date(r.completed_at).getTime() : undefined,
  };
}

function taskToRow(t: Partial<Task>, userId: string, sortIndex?: number) {
  const row: Record<string, unknown> = { user_id: userId };
  if (t.id !== undefined) row.id = t.id;
  if (t.name !== undefined) row.name = t.name;
  if (t.notes !== undefined) row.notes = t.notes ?? null;
  if (t.priority !== undefined) row.priority = t.priority;
  if (t.done !== undefined) row.done = t.done;
  if (t.weekdays !== undefined) row.weekdays = t.weekdays;
  if (t.startHour !== undefined) row.start_hour = t.startHour;
  if (t.endHour !== undefined) row.end_hour = t.endHour;
  if (t.routineId !== undefined) row.routine_id = t.routineId ?? null;
  if (t.locationId !== undefined) row.location_id = t.locationId ?? null;
  if (t.personId !== undefined) row.person_id = t.personId ?? null;
  if (t.isVital !== undefined) row.is_vital = t.isVital;
  if (t.flexible !== undefined) row.flexible = t.flexible;
  if (t.recurringInRoutine !== undefined)
    row.recurring_in_routine = t.recurringInRoutine;
  if (sortIndex !== undefined) row.sort_index = sortIndex;
  if (t.completedAt !== undefined) {
    row.completed_at = t.completedAt
      ? new Date(t.completedAt).toISOString()
      : null;
  }
  return row;
}

export async function listTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToTask);
}

export async function upsertTask(t: Task, sortIndex?: number) {
  return withUser(async (uid) => {
    const { error } = await supabase
      .from("tasks")
      .upsert(taskToRow(t, uid, sortIndex));
    if (error) throw error;
  });
}

export async function updateTaskApi(id: string, patch: Partial<Task>) {
  return withUser(async (uid) => {
    const row = taskToRow(patch, uid);
    delete row.user_id;
    const { error } = await supabase.from("tasks").update(row).eq("id", id);
    if (error) throw error;
  });
}

export async function deleteTaskApi(id: string) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderTasksApi(orderedIds: string[]) {
  return withUser(async (_uid) => {
    // Setear sort_index segun el orden recibido
    const updates = orderedIds.map((id, idx) => ({
      id,
      sort_index: idx,
    }));
    // upsert por batches no preserva user_id requerido — usar updates por id
    for (const u of updates) {
      const { error } = await supabase
        .from("tasks")
        .update({ sort_index: u.sort_index })
        .eq("id", u.id);
      if (error) throw error;
    }
  });
}

// =====================================================
// USER SETTINGS
// =====================================================

interface SettingsRow {
  user_id: string;
  daily_goal: number;
  current_location_id: string | null;
  use_real_gps: boolean;
  theme: Theme;
  xp: number;
  longest_streak: number;
}

export async function getUserSettings(): Promise<SettingsRow | null> {
  return withUser(async (uid) => {
    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", uid)
      .maybeSingle();
    if (error) throw error;
    return (data as SettingsRow) ?? null;
  });
}

export async function upsertUserSettings(patch: Partial<SettingsRow>) {
  return withUser(async (uid) => {
    const row: Record<string, unknown> = { user_id: uid };
    if (patch.daily_goal !== undefined) row.daily_goal = patch.daily_goal;
    if (patch.current_location_id !== undefined)
      row.current_location_id = patch.current_location_id;
    if (patch.use_real_gps !== undefined) row.use_real_gps = patch.use_real_gps;
    if (patch.theme !== undefined) row.theme = patch.theme;
    if (patch.xp !== undefined) row.xp = patch.xp;
    if (patch.longest_streak !== undefined)
      row.longest_streak = patch.longest_streak;
    const { error } = await supabase.from("user_settings").upsert(row);
    if (error) throw error;
  });
}

// =====================================================
// DAILY LOGS
// =====================================================

interface DailyLogRow {
  date: string;
  completed: number;
  total: number;
  hit_goal: boolean;
}

function rowToDailyLog(r: DailyLogRow): DailyLog {
  return {
    date: r.date,
    completed: r.completed,
    total: r.total,
    hitGoal: r.hit_goal,
  };
}

export async function listDailyLogs(): Promise<DailyLog[]> {
  const { data, error } = await supabase
    .from("daily_logs")
    .select("*")
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToDailyLog);
}

export async function upsertDailyLog(log: DailyLog) {
  return withUser(async (uid) => {
    const { error } = await supabase.from("daily_logs").upsert({
      user_id: uid,
      date: log.date,
      completed: log.completed,
      total: log.total,
      hit_goal: log.hitGoal,
    });
    if (error) throw error;
  });
}

// =====================================================
// BULK LOAD
// =====================================================

export interface RemoteSnapshot {
  people: Person[];
  locations: SavedLocation[];
  routines: Routine[];
  tasks: Task[];
  dailyLogs: DailyLog[];
  settings: SettingsRow | null;
}

export async function loadAll(): Promise<RemoteSnapshot> {
  const [people, locations, routines, tasks, dailyLogs, settings] =
    await Promise.all([
      listPeople(),
      listLocations(),
      listRoutines(),
      listTasks(),
      listDailyLogs(),
      getUserSettings(),
    ]);
  return { people, locations, routines, tasks, dailyLogs, settings };
}
