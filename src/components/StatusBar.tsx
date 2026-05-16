"use client";

import { useFafoStore } from "@/lib/store";
import { useResolvedContext } from "@/lib/context";
import { Avatar } from "./Avatar";
import { useMemo } from "react";
import type { ViewMode } from "@/lib/types";
import {
  addDays,
  addMonths,
  formatDateLong,
  formatMonth,
  formatWeekRange,
  todayISO,
} from "@/lib/dateUtils";
import clsx from "clsx";

interface Props {
  viewMode: ViewMode;
  selectedDate: string;
  viewingPersonId: string | null;
  onChangeViewMode: (m: ViewMode) => void;
  onChangeDate: (iso: string) => void;
  onChangeViewingPerson: (personId: string | null) => void;
  onOpenSettings: () => void;
}

const VIEW_TABS: { key: ViewMode; label: string }[] = [
  { key: "day", label: "Dia" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
];

export function StatusBar({
  viewMode,
  selectedDate,
  viewingPersonId,
  onChangeViewMode,
  onChangeDate,
  onChangeViewingPerson,
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
  const viewing =
    !isAll && viewingPersonId && people.find((p) => p.id === viewingPersonId)
      ? people.find((p) => p.id === viewingPersonId)!
      : selfPerson;

  const tasks = useFafoStore((s) => s.tasks);
  const dailyGoal = useFafoStore((s) => s.dailyGoal);

  const { todayDone, hitGoal } = useMemo(() => {
    const today = todayISO();
    const todayDone = tasks.filter(
      (t) =>
        t.completedAt &&
        new Date(t.completedAt).toISOString().slice(0, 10) === today
    ).length;
    return { todayDone, hitGoal: todayDone >= dailyGoal };
  }, [tasks, dailyGoal]);

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

        {/* Productivity progress */}
        <div className="hidden md:flex items-center gap-2 text-xs">
          <span className="text-fafo-muted uppercase tracking-widest text-[9px]">
            Hoy
          </span>
          <span
            className={clsx(
              "tabular-nums font-semibold",
              hitGoal ? "text-fafo-accent2" : "text-fafo-text"
            )}
          >
            {todayDone} / {dailyGoal}
          </span>
          <div className="w-28 h-1.5 bg-fafo-border rounded-full overflow-hidden">
            <div
              className={clsx(
                "h-full transition-all duration-300",
                hitGoal ? "bg-fafo-accent2" : "bg-gradient-to-r from-fafo-accent to-orange-400"
              )}
              style={{
                width: `${Math.min(100, (todayDone / Math.max(1, dailyGoal)) * 100)}%`,
              }}
            />
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

        <Avatar compact />

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
