"use client";

import { useFafoStore } from "@/lib/store";
import { useResolvedContext } from "@/lib/context";
import { useAuth } from "@/lib/auth";
import { useSyncStore } from "@/lib/syncStore";
import { isTaskDoneForDay, toggleDonePatch } from "@/lib/taskState";
import { todayISO, formatDateLong, addDays, parseISO } from "@/lib/dateUtils";
import type { Task, Weekday, Priority, Routine } from "@/lib/types";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { TaskModal } from "./TaskModal";
import {
  SettingsDrawer,
  type SettingsTab,
} from "./SettingsDrawer";

const PRIORITY_DOT: Record<number, string> = {
  0: "bg-[#DD7493]",
  1: "bg-[#D88677]",
  2: "bg-[#E89E5C]",
  3: "bg-[#5BACC4]",
  4: "bg-[#9B8FBC]",
  5: "bg-[#8A847C]",
};

interface DragPayload {
  startHour: number;
  endHour: number;
  personId: string;
  weekday: Weekday;
}

export function MobileApp() {
  const tasks = useFafoStore((s) => s.tasks);
  const routines = useFafoStore((s) => s.routines);
  const people = useFafoStore((s) => s.people);
  const updateTask = useFafoStore((s) => s.updateTask);
  const addTask = useFafoStore((s) => s.addTask);
  const reorderTask = useFafoStore((s) => s.reorderTask);
  const theme = useFafoStore((s) => s.theme);
  const toggleTheme = useFafoStore((s) => s.toggleTheme);
  const ctx = useResolvedContext();
  const { user, signOut } = useAuth();
  const syncPending = useSyncStore((s) => s.pending);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | undefined>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newDraft, setNewDraft] = useState<DragPayload | null>(null);
  const [quickName, setQuickName] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => todayISO());

  const today = todayISO();
  const isToday = selectedDate === today;
  const weekday = parseISO(selectedDate).getDay() as Weekday;
  const self = people.find((p) => p.isSelf) ?? people[0];
  const selfId = self?.id ?? "person-self";

  // Label friendly de la fecha: "Mi dia" (hoy), "Manana", "Ayer", o fecha
  // larga para cualquier otro dia. Le da contexto sin abrumar.
  const headerLabel = (() => {
    if (isToday) return "Mi dia";
    if (selectedDate === addDays(today, 1)) return "Manana";
    if (selectedDate === addDays(today, -1)) return "Ayer";
    return formatDateLong(selectedDate);
  })();

  // Filtrado inteligente: tareas que aplican hoy para mi, respetando GPS/rutina
  const visibleTasks = useMemo(() => {
    const result: Task[] = [];
    for (const t of tasks) {
      const ownerId = t.personId ?? selfId;
      if (ownerId !== selfId) continue;
      if (!t.weekdays.includes(weekday) && !t.isVital) continue;
      if (
        !t.isVital &&
        t.locationId &&
        t.locationId !== ctx.activeLocation?.id
      )
        continue;
      result.push(t);
    }
    return result;
  }, [tasks, weekday, selfId, ctx.activeLocation]);

  // Rutinas activas hoy. Solo filtramos por weekday y persona — NO por
  // locationId, para mantener consistencia con la vista de PC
  // (Calendar.tsx routinesByDay). El "plan del dia" se muestra siempre,
  // aunque el GPS no matchee con un geofence guardado.
  const activeRoutines = useMemo(() => {
    return routines.filter((r) => {
      if (!r.weekdays.includes(weekday)) return false;
      const ownerId = r.personId ?? selfId;
      return ownerId === selfId;
    });
  }, [routines, weekday, selfId]);

  // Agrupar: por rutina (ordenadas por startHour) + huerfanas al final
  const groups = useMemo(() => {
    const out: Array<{
      key: string;
      title: string;
      routine: Routine | null;
      tasks: Task[];
    }> = [];
    const sortedRoutines = [...activeRoutines].sort(
      (a, b) => a.startHour - b.startHour
    );
    const accountedIds = new Set<string>();
    for (const r of sortedRoutines) {
      const items = visibleTasks.filter((t) => t.routineId === r.id);
      items.forEach((t) => accountedIds.add(t.id));
      out.push({
        key: r.id,
        title: r.name,
        routine: r,
        tasks: items,
      });
    }
    const orphans = visibleTasks.filter((t) => !accountedIds.has(t.id));
    if (orphans.length > 0) {
      out.push({
        key: "__orphans__",
        title: "Otras tareas",
        routine: null,
        tasks: orphans,
      });
    }
    return out;
  }, [visibleTasks, activeRoutines]);

  function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = quickName.trim();
    if (!name) return;
    addTask({
      name,
      priority: 2 as Priority,
      weekdays: [weekday],
      startHour: 9,
      endHour: 10,
      personId: selfId,
      flexible: true,
    });
    setQuickName("");
  }

  function handleNewTaskFab() {
    // En el dia de hoy: arranca a la hora siguiente real. En otros dias:
    // sugerencia neutral a las 9hs.
    let sh: number;
    if (isToday) {
      const now = new Date();
      sh = Math.max(6, Math.min(22, now.getHours() + 1));
    } else {
      sh = 9;
    }
    setNewDraft({
      startHour: sh,
      endHour: Math.min(24, sh + 1),
      personId: selfId,
      weekday,
    });
  }

  const totalToday = visibleTasks.length;
  const doneToday = visibleTasks.filter((t) => isTaskDoneForDay(t, selectedDate))
    .length;

  return (
    <main className="min-h-screen bg-fafo-bg text-fafo-text flex flex-col pb-32">
      {/* Top bar compacto: menu + fecha inline + theme */}
      <header className="sticky top-0 z-30 bg-fafo-bg/90 backdrop-blur px-2 py-2 flex items-center gap-1 border-b border-fafo-border/40">
        <button
          onClick={() => {
            setSettingsTab(undefined);
            setSettingsOpen(true);
          }}
          className="w-9 h-9 rounded-md flex items-center justify-center text-2xl text-fafo-text shrink-0"
          aria-label="Menu"
        >
          ☰
        </button>
        <div className="flex-1 min-w-0 leading-tight">
          <div
            className={clsx(
              "font-black text-base tracking-tighter capitalize truncate",
              isToday ? "text-fafo-accent" : "text-fafo-text"
            )}
          >
            {headerLabel}
          </div>
          <div className="text-[10px] text-fafo-muted capitalize truncate">
            {formatDateLong(selectedDate)}
            {totalToday > 0 ? ` · ${doneToday}/${totalToday}` : ""}
            {ctx.activeLocation
              ? ` · ${ctx.activeLocation.emoji} ${ctx.activeLocation.name}`
              : ""}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {syncPending > 0 && (
            <span
              title="sincronizando"
              className="w-2 h-2 rounded-full bg-fafo-accent2 animate-pulse mr-1"
            />
          )}
          <button
            onClick={toggleTheme}
            className="w-9 h-9 rounded-md flex items-center justify-center text-base"
            aria-label="Theme"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      {/* Nav de fecha: prev / Hoy (visible solo si no estas en hoy) / next */}
      <div className="px-3 pt-2 flex items-center gap-1.5">
        <button
          onClick={() => setSelectedDate(addDays(selectedDate, -1))}
          className="w-9 h-9 rounded-md border border-fafo-border text-fafo-muted active:bg-fafo-panel2/40 flex items-center justify-center text-lg shrink-0"
          aria-label="Dia anterior"
        >
          ‹
        </button>
        {!isToday && (
          <button
            onClick={() => setSelectedDate(today)}
            className="px-3 h-9 rounded-md border border-fafo-accent2 text-fafo-accent2 text-xs font-semibold active:bg-fafo-accent2/10 flex items-center gap-1 shrink-0"
          >
            <span className="text-sm leading-none">⊙</span> Hoy
          </button>
        )}
        <button
          onClick={() => setSelectedDate(addDays(selectedDate, 1))}
          className="w-9 h-9 rounded-md border border-fafo-border text-fafo-muted active:bg-fafo-panel2/40 flex items-center justify-center text-lg shrink-0"
          aria-label="Dia siguiente"
        >
          ›
        </button>
        <div className="flex-1" />
      </div>

      {/* Quick add */}
      <form
        onSubmit={handleQuickAdd}
        className="mx-3 mt-2 mb-2 flex items-center gap-2 bg-fafo-panel border border-fafo-border rounded-xl shadow-sm px-3"
      >
        <span
          className={clsx(
            "w-6 h-6 rounded-full border-2 flex items-center justify-center text-base shrink-0",
            quickName.trim()
              ? "border-fafo-accent text-fafo-accent"
              : "border-fafo-muted/40 text-fafo-muted/40"
          )}
        >
          +
        </span>
        <input
          value={quickName}
          onChange={(e) => setQuickName(e.target.value)}
          placeholder="Agregar una tarea"
          className="flex-1 bg-transparent outline-none text-base py-3 placeholder:text-fafo-muted/60"
        />
        {quickName.trim() && (
          <button
            type="submit"
            className="text-xs px-3 py-1.5 rounded-md bg-fafo-accent text-white font-semibold"
          >
            Add
          </button>
        )}
      </form>

      {/* Lista de tareas agrupadas */}
      <div className="flex-1 px-3 space-y-3">
        {groups.length === 0 ? (
          <div className="text-center py-16 text-fafo-muted text-sm">
            <div className="text-5xl mb-3 opacity-40">🌱</div>
            <div>
              No hay tareas para {isToday ? "hoy" : headerLabel.toLowerCase()}.
            </div>
            <div className="text-xs mt-1 opacity-70">
              Agregá una arriba con el botón +
            </div>
          </div>
        ) : (
          groups.map((g) => (
            <section
              key={g.key}
              className={clsx(
                "border rounded-2xl overflow-hidden shadow-sm",
                !g.routine && "bg-fafo-panel border-fafo-border"
              )}
              style={
                g.routine
                  ? {
                      backgroundColor: `${g.routine.color}14`, // ~8% opacity
                      borderColor: `${g.routine.color}40`,
                    }
                  : undefined
              }
            >
              <div
                className="px-4 py-2.5 flex items-center gap-2"
                style={{
                  backgroundColor: g.routine
                    ? `${g.routine.color}26` // ~15%
                    : "rgb(var(--panel2) / 0.4)",
                }}
              >
                <span
                  className="w-1.5 h-5 rounded-full"
                  style={{ background: g.routine?.color ?? "#9B8FBC" }}
                />
                <span className="text-sm font-bold uppercase tracking-wider text-fafo-text">
                  {g.title}
                </span>
                {g.routine && (
                  <span className="text-[9px] text-fafo-muted">
                    {Math.floor(g.routine.startHour)}h–
                    {Math.floor(g.routine.endHour)}h
                  </span>
                )}
                <span className="ml-auto text-[10px] text-fafo-muted tabular-nums">
                  {g.tasks.filter((t) => isTaskDoneForDay(t, selectedDate)).length}/
                  {g.tasks.length}
                </span>
              </div>
              {g.tasks.length === 0 ? (
                <div className="px-4 py-3 text-xs italic text-fafo-muted/60">
                  Sin tareas. Agregá con +.
                </div>
              ) : (
                <ul>
                  {g.tasks.map((t) => (
                    <MobileTaskRow
                      key={t.id}
                      task={t}
                      routines={routines}
                      todayISO={selectedDate}
                      isDragging={draggingId === t.id}
                      isDragOver={dragOverId === t.id && draggingId !== t.id}
                      onToggle={() =>
                        updateTask(t.id, toggleDonePatch(t, selectedDate))
                      }
                      onOpen={() => setEditingId(t.id)}
                      onDragStart={() => setDraggingId(t.id)}
                      onDragOver={() => setDragOverId(t.id)}
                      onDrop={() => {
                        // Usamos draggingId del state en vez de dataTransfer
                        // porque en mobile (Chrome/Safari Android) dataTransfer
                        // no se preserva confiablemente entre dragstart y drop.
                        if (draggingId && draggingId !== t.id)
                          reorderTask(draggingId, t.id);
                        setDraggingId(null);
                        setDragOverId(null);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverId(null);
                      }}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))
        )}
      </div>

      {/* FAB */}
      <button
        onClick={handleNewTaskFab}
        className="fixed bottom-6 right-6 z-30 w-16 h-16 rounded-full bg-fafo-accent text-white text-3xl shadow-2xl flex items-center justify-center font-light active:scale-95 transition-transform"
        aria-label="Nueva tarea"
      >
        +
      </button>

      {/* Drawers / Modals */}
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab={settingsTab}
      />
      <TaskModal
        open={!!editingId}
        editingTaskId={editingId ?? undefined}
        onClose={() => setEditingId(null)}
      />
      <TaskModal
        open={!!newDraft}
        newDraft={newDraft ?? undefined}
        onClose={() => setNewDraft(null)}
      />
    </main>
  );
}

function MobileTaskRow({
  task,
  routines,
  todayISO: todayISOStr,
  isDragging,
  isDragOver,
  onToggle,
  onOpen,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  task: Task;
  routines: Routine[];
  todayISO: string;
  isDragging: boolean;
  isDragOver: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const isDone = isTaskDoneForDay(task, todayISOStr);
  const isVital = task.isVital || task.priority === 0;
  const parentRoutine = task.routineId
    ? routines.find((r) => r.id === task.routineId)
    : null;
  const subtitle = parentRoutine ? parentRoutine.name : "Tareas";

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={clsx(
        "px-4 py-3 flex items-center gap-3 border-t border-fafo-border/30 active:bg-fafo-panel2/40 transition-all",
        isDragging && "opacity-30",
        isDragOver && "border-t-2 border-t-fafo-accent"
      )}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={clsx(
          "shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm transition-all",
          isDone
            ? "bg-fafo-accent2 border-fafo-accent2 text-white"
            : "border-fafo-muted/60"
        )}
        aria-label="Toggle"
      >
        {isDone && <span className="leading-none">✓</span>}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "w-2 h-2 rounded-full shrink-0",
              PRIORITY_DOT[task.priority]
            )}
          />
          <span
            className={clsx(
              "text-[15px] font-medium leading-tight truncate",
              isDone && "line-through text-fafo-muted"
            )}
          >
            {task.name}
          </span>
        </div>
        <div className="text-[11px] text-fafo-muted mt-0.5 truncate">
          {subtitle}
          {task.recurringInRoutine && " · ↻ Repet"}
          {!task.flexible && (
            <>
              {" · "}
              {Math.floor(task.startHour).toString().padStart(2, "0")}:00 –{" "}
              {Math.floor(task.endHour).toString().padStart(2, "0")}:00
            </>
          )}
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className={clsx(
          "shrink-0 text-2xl leading-none w-8 h-8 flex items-center justify-center",
          isVital ? "text-fafo-accent" : "text-fafo-muted/30"
        )}
        aria-label="Vital"
      >
        {isVital ? "★" : "☆"}
      </button>
    </li>
  );
}
