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

const uid = () => Math.random().toString(36).slice(2, 10);

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
}

export const useFafoStore = create<AppState & Actions>()(
  persist(
    (set, get) => ({
      ...SEED_STATE,

      addTask: (t) => {
        const task: Task = {
          id: uid(),
          createdAt: Date.now(),
          done: false,
          ...t,
        };
        set((s) => ({ tasks: [task, ...s.tasks] }));
        return task;
      },
      updateTask: (id, patch) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      toggleTask: (id) => {
        const t = get().tasks.find((x) => x.id === id);
        if (!t) return;
        const now = Date.now();
        set((s) => ({
          tasks: s.tasks.map((x) =>
            x.id === id
              ? { ...x, done: !x.done, completedAt: !x.done ? now : undefined }
              : x
          ),
          xp: s.xp + (!t.done ? xpForPriority(t.priority) : -xpForPriority(t.priority)),
        }));
      },
      deleteTask: (id) =>
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

      reorderTask: (srcId, targetId) =>
        set((s) => {
          if (srcId === targetId) return s;
          const tasks = [...s.tasks];
          const srcIdx = tasks.findIndex((t) => t.id === srcId);
          if (srcIdx === -1) return s;
          const [moved] = tasks.splice(srcIdx, 1);
          const newTargetIdx = tasks.findIndex((t) => t.id === targetId);
          if (newTargetIdx === -1) {
            // Target desaparecio: pusheamos al final
            tasks.push(moved);
          } else {
            tasks.splice(newTargetIdx, 0, moved);
          }
          return { tasks };
        }),

      addRoutine: (r) => {
        const routine: Routine = { id: uid(), createdAt: Date.now(), ...r };
        set((s) => ({ routines: [routine, ...s.routines] }));
        return routine;
      },
      updateRoutine: (id, patch) =>
        set((s) => ({
          routines: s.routines.map((r) =>
            r.id === id ? { ...r, ...patch } : r
          ),
        })),
      shiftRoutine: (id, deltaHours) =>
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
        }),
      deleteRoutine: (id) =>
        set((s) => ({
          routines: s.routines.filter((r) => r.id !== id),
          tasks: s.tasks.map((t) =>
            t.routineId === id ? { ...t, routineId: undefined } : t
          ),
        })),

      addPerson: (p) => {
        const person: Person = { id: uid(), createdAt: Date.now(), ...p };
        set((s) => ({ people: [...s.people, person] }));
        return person;
      },
      updatePerson: (id, patch) =>
        set((s) => ({
          people: s.people.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      deletePerson: (id) =>
        set((s) => {
          const target = s.people.find((p) => p.id === id);
          if (!target || target.isSelf) return s;
          return {
            people: s.people.filter((p) => p.id !== id),
            // unassign tasks/routines that pointed to this person
            tasks: s.tasks.map((t) =>
              t.personId === id ? { ...t, personId: undefined } : t
            ),
            routines: s.routines.map((r) =>
              r.personId === id ? { ...r, personId: undefined } : r
            ),
          };
        }),

      addLocation: (l) => {
        const loc: SavedLocation = { id: uid(), ...l };
        set((s) => ({ locations: [...s.locations, loc] }));
        return loc;
      },
      deleteLocation: (id) =>
        set((s) => ({ locations: s.locations.filter((l) => l.id !== id) })),
      setCurrentLocation: (id) => set({ currentLocationId: id }),
      setUseRealGps: (v) => set({ useRealGps: v }),
      setDailyGoal: (n) => set({ dailyGoal: Math.max(1, n) }),

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

      setTheme: (t) => set({ theme: t }),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
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
      return 25;
    case 2:
      return 12;
    case 3:
      return 5;
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
