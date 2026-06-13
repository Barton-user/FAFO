"use client";

import { useFafoStore } from "@/lib/store";
import { useResolvedContext } from "@/lib/context";
import { useAuth } from "@/lib/auth";
import { useSyncStore } from "@/lib/syncStore";
import { Avatar } from "./Avatar";
import { useMemo } from "react";
import type { ViewMode, Weekday } from "@/lib/types";
import { isTaskDoneForDay, taskAppliesOnDay } from "@/lib/taskState";
import {
  addDays,
  addMonths,
  formatDateLong,
  formatMonth,
  formatWeekRange,
  timestampToISO,
  todayISO,
} from "@/lib/dateUtils";
import clsx from "clsx";

interface Props {
  viewMode: ViewMode;
  selectedDate: string;
  viewingPersonId: string | null;
  todoOpen: boolean;
  onChangeViewMode: (m: ViewMode) => void;
  onChangeDate: (iso: string) => void;
  onChangeViewingPerson: (personId: string | null) => void;
  onToggleTodo: () => void;
  onOpenSettings: () => void;
}

const VIEW_TABS: { key: ViewMode; label: string }[] = [
  { key: "day", label: "Mi dia" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
];

export function StatusBar({
  viewMode,
  selectedDate,
  viewingPersonId,
  todoOpen,
  onChangeViewMode,
  onChangeDate,
  onChangeViewingPerson,
  onToggleTodo,
  onOpenSettings,
}: Props) {
  const ctx = useResolvedContext();
  const locations = useFafoStore((s) => s.locations);
  const currentLocationId = useFafoStore((s) => s.currentLocationId);
  const setCurrentLocation = useFafoStore((s) => s.setCurrentLocation);
  const useRealGps = useFafoStore((s) => s.useRealGps);
  const setUseRealGps = useFafoStore((s) => s.setUseRealGps);

  const people = useFafoStore((s) => s.people);
  const selfPerson = people.find((p) => p.isSelf);
  const others = people.filter((p) => !p.isSelf);
  const isAll = viewingPersonId === "__all__";
  const theme = useFafoStore((s) => s.theme);
  const toggleTheme = useFafoStore((s) => s.toggleTheme);
  const { user, signOut } = useAuth();
  const syncPending = useSyncStore((s) => s.pending);
  const syncError = useSyncStore((s) => s.lastError);
  const viewing =
    !isAll && viewingPersonId && people.find((p) => p.id === viewingPersonId)
      ? people.find((p) => p.id === viewingPersonId)!
      : selfPerson;

  const tasks = useFafoStore((s) => s.tasks);
  const routines = useFafoStore((s) => s.routines);
  const dailyGoal = useFafoStore((s) => s.dailyGoal);

  const { todayDone, hitGoal } = useMemo(() => {
    const today = todayISO();
    const todayDone = tasks.filter(
      (t) => t.completedAt && timestampToISO(t.completedAt) === today
    ).length;
    return { todayDone, hitGoal: todayDone >= dailyGoal };
  }, [tasks, dailyGoal]);

  // Status del dia: total / hechas / vencidas — para mostrar "como vas trasando"
  const dayStatus = useMemo(() => {
    const today = todayISO();
    const weekday = ctx.now.getDay() as Weekday;
    const nowHour = ctx.hour;
    const ownerFilter = (id: string | undefined) => {
      if (isAll) return true;
      const owner = id ?? selfPerson?.id ?? "person-self";
      const target = viewingPersonId ?? selfPerson?.id ?? "person-self";
      return owner === target;
    };
    // Tareas que aplican hoy para la persona enfocada
    const todayTasks = tasks.filter((t) => {
      if (!ownerFilter(t.personId)) return false;
      if (!taskAppliesOnDay(t, today, weekday)) return false;
      if (
        !t.isVital &&
        t.locationId &&
        t.locationId !== ctx.activeLocation?.id
      )
        return false;
      return true;
    });
    let done = 0;
    let overdue = 0;
    for (const t of todayTasks) {
      const isDone = isTaskDoneForDay(t, today);
      if (isDone) {
        done++;
        continue;
      }
      // Calcular si esta vencida
      if (t.flexible) {
        if (t.routineId) {
          const r = routines.find((x) => x.id === t.routineId);
          if (r && r.endHour <= nowHour) overdue++;
        }
        // flex sin rutina: no contamos vencido (su posicion es arbitraria)
      } else if (t.endHour <= nowHour) {
        overdue++;
      }
    }
    return {
      total: todayTasks.length,
      done,
      overdue,
      pending: todayTasks.length - done,
    };
  }, [
    tasks,
    routines,
    ctx.now,
    ctx.hour,
    ctx.activeLocation,
    isAll,
    viewingPersonId,
    selfPerson?.id,
  ]);

  const timeStr = ctx.now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isToday = selectedDate === todayISO();

  const dateLabel =
    viewMode === "month"
      ? formatMonth(selectedDate)
      : viewMode === "week"
        ? formatWeekRange(selectedDate)
        : formatDateLong(selectedDate);

  function shift(direction: -1 | 1) {
    if (viewMode === "day") onChangeDate(addDays(selectedDate, direction));
    else if (viewMode === "week") onChangeDate(addDays(selectedDate, direction * 7));
    else onChangeDate(addMonths(selectedDate, direction));
  }

  return (
    <div className="border-b border-fafo-border bg-fafo-panel/85 backdrop-blur-md sticky top-0 z-20">
      {/* Row 1: brand + status */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <div className="flex items-center gap-3">
          <div className="text-fafo-accent font-black text-2xl tracking-tighter leading-none">
            FAFO
          </div>
          <div className="text-[10px] text-fafo-muted hidden sm:block leading-tight">
            <div className="uppercase tracking-widest">{timeStr}</div>
            <div>the more you f.a., the more you f.o.</div>
          </div>
        </div>

        <div className="flex-1" />

        {/* Productivity progress + status del dia */}
        <div className="hidden md:flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-fafo-muted uppercase tracking-widest text-[9px]">
              Hoy
            </span>
            <span
              className={clsx(
                "tabular-nums font-semibold",
                dayStatus.total > 0 && dayStatus.done === dayStatus.total
                  ? "text-fafo-accent2"
                  : "text-fafo-text"
              )}
              title={`${dayStatus.done} hechas de ${dayStatus.total} tareas hoy`}
            >
              {dayStatus.done}/{dayStatus.total}
            </span>
            {dayStatus.overdue > 0 && (
              <span
                className="tabular-nums font-bold text-red-500"
                title={`${dayStatus.overdue} vencidas`}
              >
                · {dayStatus.overdue}⚠
              </span>
            )}
          </div>
          {/* Barra dual: verde (done) + rojo (vencidas) + gris (pendientes ok) */}
          <div className="w-32 h-1.5 bg-fafo-border rounded-full overflow-hidden flex">
            <div
              className="h-full bg-fafo-accent2 transition-all duration-300"
              style={{
                width: `${
                  dayStatus.total > 0
                    ? (dayStatus.done / dayStatus.total) * 100
                    : 0
                }%`,
              }}
              title={`${dayStatus.done} hechas`}
            />
            <div
              className="h-full bg-red-400 transition-all duration-300"
              style={{
                width: `${
                  dayStatus.total > 0
                    ? (dayStatus.overdue / dayStatus.total) * 100
                    : 0
                }%`,
              }}
              title={`${dayStatus.overdue} vencidas`}
            />
          </div>
          {/* Goal personal */}
          <div className="flex items-center gap-1 opacity-70">
            <span className="text-[9px] uppercase tracking-widest text-fafo-muted">
              Goal
            </span>
            <span
              className={clsx(
                "tabular-nums text-[10px]",
                hitGoal ? "text-fafo-accent2 font-bold" : "text-fafo-muted"
              )}
            >
              {todayDone}/{dailyGoal}
            </span>
          </div>
        </div>

        {/* Location selector */}
        <select
          value={useRealGps ? "__gps__" : currentLocationId ?? "__none__"}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__gps__") {
              setUseRealGps(true);
            } else if (v === "__none__") {
              setUseRealGps(false);
              setCurrentLocation(null);
            } else {
              setUseRealGps(false);
              setCurrentLocation(v);
            }
          }}
          className="bg-fafo-bg border border-fafo-border rounded-md text-xs px-2 py-1.5 text-fafo-text outline-none focus:border-fafo-accent"
        >
          <option value="__gps__">GPS real</option>
          <option value="__none__">Sin ubicacion</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.emoji} {l.name}
            </option>
          ))}
        </select>

        {/* Sync status — puntito que pulsa cuando hay mutaciones en vuelo */}
        <div className="flex items-center gap-1.5">
          {syncPending > 0 ? (
            <span
              title={`${syncPending} cambio${syncPending !== 1 ? "s" : ""} sincronizando...`}
              className="w-2 h-2 rounded-full bg-fafo-accent2 animate-pulse"
            />
          ) : syncError ? (
            <span
              title={`Error de sync: ${syncError}`}
              className="w-2 h-2 rounded-full bg-red-500"
            />
          ) : (
            <span
              title="Todo sincronizado"
              className="w-2 h-2 rounded-full bg-fafo-muted/30"
            />
          )}
        </div>

        <Avatar compact />

        <button
          onClick={onToggleTodo}
          className={clsx(
            "w-8 h-8 rounded-md border transition-colors flex items-center justify-center text-sm",
            todoOpen
              ? "bg-fafo-accent2 text-white border-fafo-accent2"
              : "border-fafo-border hover:border-fafo-accent text-fafo-text"
          )}
          title={todoOpen ? "Cerrar pendientes" : "Ver pendientes (To-Do)"}
          aria-label="Toggle To-Do"
        >
          ☑
        </button>

        <button
          onClick={toggleTheme}
          className="w-8 h-8 rounded-md border border-fafo-border hover:border-fafo-accent transition-colors text-fafo-text flex items-center justify-center text-sm"
          title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>

        <button
          onClick={onOpenSettings}
          className="text-xs px-3 py-1.5 rounded-md border border-fafo-border hover:border-fafo-accent transition-colors"
        >
          Gestionar
        </button>

        {user && (
          <button
            onClick={async () => {
              if (confirm("Cerrar sesion?")) await signOut();
            }}
            className="w-8 h-8 rounded-md border border-fafo-border hover:border-fafo-accent text-fafo-text flex items-center justify-center text-sm"
            title={`Cerrar sesion (${user.email ?? "yo"})`}
            aria-label="Logout"
          >
            ⎋
          </button>
        )}
      </div>

      {/* Row 2: view switcher + date nav */}
      <div className="flex items-center gap-3 px-4 pb-3 pt-1">
        {/* View toggle */}
        <div className="inline-flex bg-fafo-bg rounded-lg border border-fafo-border p-0.5">
          {VIEW_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => onChangeViewMode(t.key)}
              className={clsx(
                "text-xs px-3 py-1.5 rounded-md font-medium transition-all",
                viewMode === t.key
                  ? "bg-fafo-accent text-white shadow"
                  : "text-fafo-muted hover:text-fafo-text"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => shift(-1)}
            className="w-8 h-8 rounded-md border border-fafo-border text-fafo-muted hover:text-fafo-text hover:border-fafo-text transition-colors flex items-center justify-center"
            aria-label="Anterior"
          >
            ‹
          </button>
          <button
            onClick={() => onChangeDate(todayISO())}
            disabled={isToday && viewMode === "day"}
            className={clsx(
              "text-xs px-3 h-8 rounded-md border transition-colors",
              isToday && viewMode === "day"
                ? "border-fafo-border text-fafo-muted opacity-50 cursor-default"
                : "border-fafo-border text-fafo-text hover:border-fafo-accent2 hover:text-fafo-accent2"
            )}
          >
            Hoy
          </button>
          <button
            onClick={() => shift(1)}
            className="w-8 h-8 rounded-md border border-fafo-border text-fafo-muted hover:text-fafo-text hover:border-fafo-text transition-colors flex items-center justify-center"
            aria-label="Siguiente"
          >
            ›
          </button>
          <div className="ml-2 text-sm font-semibold capitalize">{dateLabel}</div>
        </div>

        <div className="flex-1" />

        {/* Person picker — solo si hay otras personas */}
        {others.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-widest text-fafo-muted">
              Viendo
            </span>
            <select
              value={
                isAll ? "__all__" : viewingPersonId ?? selfPerson?.id ?? ""
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__all__") {
                  onChangeViewingPerson("__all__");
                } else if (v === selfPerson?.id || v === "") {
                  onChangeViewingPerson(null);
                } else {
                  onChangeViewingPerson(v);
                }
              }}
              className={clsx(
                "bg-fafo-bg border rounded-md text-xs px-2 py-1 text-fafo-text outline-none focus:border-fafo-accent",
                isAll ? "border-fafo-accent2" : "border-fafo-border"
              )}
              style={{
                color: isAll ? undefined : viewing?.color,
              }}
            >
              <option value="__all__">👥 Todos</option>
              {selfPerson && (
                <option value={selfPerson.id}>
                  {selfPerson.emoji} {selfPerson.name}
                </option>
              )}
              {others.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji} {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {ctx.activeLocation ? (
          <div className="text-xs text-fafo-accent2 flex items-center gap-1.5">
            <span className="text-base leading-none">{ctx.activeLocation.emoji}</span>
            <span className="hidden sm:inline">en {ctx.activeLocation.name}</span>
          </div>
        ) : useRealGps ? (
          <span className="text-[11px] text-fafo-muted">
            {ctx.gpsError ? "GPS err" : "buscando GPS..."}
          </span>
        ) : (
          <span className="text-[11px] text-fafo-muted">sin ubicacion</span>
        )}
      </div>
    </div>
  );
}
