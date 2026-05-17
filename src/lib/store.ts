"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AppState,
  Task,
  Routine,
  Person,
  SavedLocation,
  Priority,
  Weekday,
  DailyLog,
  Theme,
} from "./types";
import { SEED_STATE } from "./seed";
import * as api from "./api";
import { useSyncStore } from "./syncStore";

const uid = () => Math.random().toString(36).slice(2, 10);

// Helper para invocar APIs en background sin bloquear UI.
function bg(label: string, fn: () => Promise<unknown> | null | undefined) {
  const sync = useSyncStore.getState();
  sync.inc();
  Promise.resolve()
    .then(() => fn())
    .catch((err) => {
      console.error(`[FAFO bg:${label}]`, err);
      const msg = err?.message ?? String(err);
      useSyncStore.getState().setError(`${label}: ${msg}`);
    })
    .finally(() => useSyncStore.getState().dec());
}

interface Actions {
  // tasks
  addTask: (t: Omit<Task, "id" | "createdAt" | "done">) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  reorderTask: (srcId: string, targetId: string) => void;
  // routines
  addRoutine: (r: Omit<Routine, "id" | "createdAt">) => Routine;
  updateRoutine: (id: string, patch: Partial<Routine>) => void;
  shiftRoutine: (id: string, deltaHours: number) => void;
  deleteRoutine: (id: string) => void;
  // people
  addPerson: (p: Omit<Person, "id" | "createdAt">) => Person;
  updatePerson: (id: string, patch: Partial<Person>) => void;
  deletePerson: (id: string) => void;
  // locations
  addLocation: (l: Omit<SavedLocation, "id">) => SavedLocation;
  deleteLocation: (id: string) => void;
  setCurrentLocation: (id: string | null) => void;
  setUseRealGps: (v: boolean) => void;
  setDailyGoal: (n: number) => void;
  // metrics
  recordTodayLog: () => void;
  resetAll: () => void;
  // UI
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  // Sync
  hydrate: (snapshot: api.RemoteSnapshot) => void;
}

export const useFafoStore = create<AppState & Actions>()(
  persist(
    (set, get) => ({
      ...SEED_STATE,

      addTask: (t) => {
        const task: Task = {
          id: "t-" + uid(),
          createdAt: Date.now(),
          done: false,
          ...t,
        };
        set((s) => ({ tasks: [task, ...s.tasks] }));
        bg("addTask", () => api.upsertTask(task, 0));
        return task;
      },
      updateTask: (id, patch) => {
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }));
        bg("updateTask", () => api.updateTaskApi(id, patch));
      },
      toggleTask: (id) => {
        const t = get().tasks.find((x) => x.id === id);
        if (!t) return;
        const now = Date.now();
        const becomesDone = !t.done;
        set((s) => ({
          tasks: s.tasks.map((x) =>
            x.id === id
              ? {
                  ...x,
                  done: becomesDone,
                  completedAt: becomesDone ? now : undefined,
                }
              : x
          ),
          xp:
            s.xp +
            (becomesDone
              ? xpForPriority(t.priority)
              : -xpForPriority(t.priority)),
        }));
        bg("toggleTask", () =>
          api.updateTaskApi(id, {
            done: becomesDone,
            completedAt: becomesDone ? now : undefined,
          })
        );
      },
      deleteTask: (id) => {
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
        bg("deleteTask", () => api.deleteTaskApi(id));
      },

      reorderTask: (srcId, targetId) => {
        set((s) => {
          if (srcId === targetId) return s;
          const tasks = [...s.tasks];
          const srcIdx = tasks.findIndex((t) => t.id === srcId);
          if (srcIdx === -1) return s;
          const [moved] = tasks.splice(srcIdx, 1);
          const newTargetIdx = tasks.findIndex((t) => t.id === targetId);
          if (newTargetIdx === -1) {
            tasks.push(moved);
          } else {
            tasks.splice(newTargetIdx, 0, moved);
          }
          return { tasks };
        });
        bg("reorderTask", () =>
          api.reorderTasksApi(get().tasks.map((t) => t.id))
        );
      },

      addRoutine: (r) => {
        const routine: Routine = {
          id: "rt-" + uid(),
          createdAt: Date.now(),
          ...r,
        };
        set((s) => ({ routines: [routine, ...s.routines] }));
        bg("addRoutine", () => api.upsertRoutine(routine));
        return routine;
      },
      updateRoutine: (id, patch) => {
        set((s) => ({
          routines: s.routines.map((r) =>
            r.id === id ? { ...r, ...patch } : r
          ),
        }));
        bg("updateRoutine", () => api.updateRoutineApi(id, patch));
      },
      shiftRoutine: (id, deltaHours) => {
        // capturamos para sync despues del set
        const fireSyncAfter = () => {
          const s = get();
          const r = s.routines.find((x) => x.id === id);
          if (r)
            bg("shiftRoutine.routine", () =>
              api.updateRoutineApi(id, {
                startHour: r.startHour,
                endHour: r.endHour,
              })
            );
          for (const t of s.tasks.filter((x) => x.routineId === id)) {
            bg("shiftRoutine.task", () =>
              api.updateTaskApi(t.id, {
                startHour: t.startHour,
                endHour: t.endHour,
              })
            );
          }
        };
        set((s) => {
          const routine = s.routines.find((r) => r.id === id);
          if (!routine) return s;
          const dur = routine.endHour - routine.startHour;
          const clampedStart = Math.max(
            0,
            Math.min(24 - dur, routine.startHour + deltaHours)
          );
          const actualDelta = clampedStart - routine.startHour;
          if (Math.abs(actualDelta) < 0.0001) return s;
          const newEnd = clampedStart + dur;
          return {
            routines: s.routines.map((r) =>
              r.id === id
                ? { ...r, startHour: clampedStart, endHour: newEnd }
                : r
            ),
            tasks: s.tasks.map((t) => {
              if (t.routineId !== id) return t;
              const tDur = t.endHour - t.startHour;
              const newTaskStart = Math.max(
                0,
                Math.min(24 - tDur, t.startHour + actualDelta)
              );
              return {
                ...t,
                startHour: newTaskStart,
                endHour: newTaskStart + tDur,
              };
            }),
          };
        });
        fireSyncAfter();
      },
      deleteRoutine: (id) => {
        set((s) => ({
          routines: s.routines.filter((r) => r.id !== id),
          tasks: s.tasks.map((t) =>
            t.routineId === id ? { ...t, routineId: undefined } : t
          ),
        }));
        bg("deleteRoutine", () => api.deleteRoutineApi(id));
      },

      addPerson: (p) => {
        const person: Person = {
          id: "person-" + uid(),
          createdAt: Date.now(),
          ...p,
        };
        set((s) => ({ people: [...s.people, person] }));
        bg("addPerson", () => api.upsertPerson(person));
        return person;
      },
      updatePerson: (id, patch) => {
        set((s) => ({
          people: s.people.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        }));
        bg("updatePerson", () => api.updatePersonApi(id, patch));
      },
      deletePerson: (id) => {
        const target = get().people.find((p) => p.id === id);
        if (!target || target.isSelf) return;
        set((s) => ({
          people: s.people.filter((p) => p.id !== id),
          tasks: s.tasks.map((t) =>
            t.personId === id ? { ...t, personId: undefined } : t
          ),
          routines: s.routines.map((r) =>
            r.personId === id ? { ...r, personId: undefined } : r
          ),
        }));
        bg("deletePerson", () => api.deletePersonApi(id));
      },

      addLocation: (l) => {
        const loc: SavedLocation = { id: "loc-" + uid(), ...l };
        set((s) => ({ locations: [...s.locations, loc] }));
        bg("addLocation", () => api.upsertLocation(loc));
        return loc;
      },
      deleteLocation: (id) => {
        set((s) => ({ locations: s.locations.filter((l) => l.id !== id) }));
        bg("deleteLocation", () => api.deleteLocationApi(id));
      },
      setCurrentLocation: (id) => {
        set({ currentLocationId: id });
        bg("setCurrentLocation", () =>
          api.upsertUserSettings({ current_location_id: id })
        );
      },
      setUseRealGps: (v) => {
        set({ useRealGps: v });
        bg("setUseRealGps", () =>
          api.upsertUserSettings({ use_real_gps: v })
        );
      },
      setDailyGoal: (n) => {
        const goal = Math.max(1, n);
        set({ dailyGoal: goal });
        bg("setDailyGoal", () => api.upsertUserSettings({ daily_goal: goal }));
      },

      recordTodayLog: () => {
        const today = new Date().toISOString().slice(0, 10);
        const { tasks, dailyGoal, dailyLogs, longestStreak } = get();
        const todayTasks = tasks.filter(
          (t) =>
            t.completedAt &&
            new Date(t.completedAt).toISOString().slice(0, 10) === today
        );
        const completed = todayTasks.length;
        const total = tasks.length;
        const hitGoal = completed >= dailyGoal;
        const existing = dailyLogs.find((l) => l.date === today);
        const newLog: DailyLog = { date: today, completed, total, hitGoal };
        const next = existing
          ? dailyLogs.map((l) => (l.date === today ? newLog : l))
          : [...dailyLogs, newLog];
        // recompute streak
        const sorted = [...next].sort((a, b) => (a.date < b.date ? 1 : -1));
        let streak = 0;
        for (const log of sorted) {
          if (log.hitGoal) streak++;
          else break;
        }
        set({
          dailyLogs: next,
          longestStreak: Math.max(longestStreak, streak),
        });
      },

      resetAll: () => set(() => ({ ...SEED_STATE })),

      setTheme: (t) => {
        set({ theme: t });
        bg("setTheme", () => api.upsertUserSettings({ theme: t }));
      },
      toggleTheme: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        set({ theme: next });
        bg("toggleTheme", () => api.upsertUserSettings({ theme: next }));
      },

      hydrate: (snap) => {
        const settings = snap.settings;
        set((s) => ({
          ...s,
          people: snap.people.length > 0 ? snap.people : s.people,
          locations: snap.locations,
          routines: snap.routines,
          tasks: snap.tasks,
          dailyLogs: snap.dailyLogs,
          dailyGoal: settings?.daily_goal ?? s.dailyGoal,
          currentLocationId:
            settings?.current_location_id ?? s.currentLocationId,
          useRealGps: settings?.use_real_gps ?? s.useRealGps,
          theme: settings?.theme ?? s.theme,
          xp: settings?.xp ?? s.xp,
          longestStreak: settings?.longest_streak ?? s.longestStreak,
        }));
      },
    }),
    {
      name: "fafo-state-v1",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return window.localStorage;
      }),
      // After hydration, ensure self person exists
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!state.people.some((p) => p.isSelf)) {
          state.people.unshift({
            id: "person-self",
            name: "Yo",
            emoji: "\u{1F913}",
            color: "#7BC4A8",
            isSelf: true,
            createdAt: Date.now(),
          });
        }
      },
    }
  )
);

export function xpForPriority(p: Priority): number {
  switch (p) {
    case 0:
      return 50; // vital
    case 1:
      return 35; // urgente
    case 2:
      return 20; // importante
    case 3:
      return 12; // normal
    case 4:
      return 6; // cuando puedas
    case 5:
      return 3; // algun dia
  }
}

// Helpful selectors
export function selectVisibleTasksFor(opts: {
  state: AppState;
  weekday: Weekday;
  hour: number; // 0..24
  locationId: string | null;
  personId?: string;
}): Task[] {
  const { state, weekday, hour, locationId, personId } = opts;
  return state.tasks.filter((t) => {
    // Vital tasks bypass everything except already-done
    if (t.isVital || t.priority === 0) return true;
    if (personId && (t.personId ?? "person-self") !== personId) return false;
    if (!t.weekdays.includes(weekday)) return false;
    if (hour < t.startHour || hour >= t.endHour) return false;
    if (t.locationId && t.locationId !== locationId) return false;
    return true;
  });
}
