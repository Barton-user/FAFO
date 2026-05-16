"use client";

import { useFafoStore } from "@/lib/store";
import type { Task, Weekday, ViewMode, Priority } from "@/lib/types";
import {
  addDays,
  formatDateLong,
  parseISO,
  startOfWeek,
  todayISO,
  WEEKDAYS_SHORT,
} from "@/lib/dateUtils";
import { isTaskDoneForDay, toggleDonePatch } from "@/lib/taskState";
import { useMemo, useState } from "react";
import clsx from "clsx";

interface Props {
  open: boolean;
  viewMode: ViewMode;
  selectedDate: string;
  viewingPersonId: string | null;
  onClose: () => void;
  onEditTask: (id: string) => void;
}

const PRIORITY_DOT: Record<number, string> = {
  0: "bg-[#DD7493]",
  1: "bg-[#E89E5C]",
  2: "bg-[#5BACC4]",
  3: "bg-[#9B8FBC]",
};

export function TodoPanel({
  open,
  viewMode,
  selectedDate,
  viewingPersonId,
  onClose,
  onEditTask,
}: Props) {
  const tasks = useFafoStore((s) => s.tasks);
  const routines = useFafoStore((s) => s.routines);
  const people = useFafoStore((s) => s.people);
  const updateTask = useFafoStore((s) => s.updateTask);
  const addTask = useFafoStore((s) => s.addTask);
  const reorderTask = useFafoStore((s) => s.reorderTask);

  // Drop target dia para drag cross-day
  const [dayDragOver, setDayDragOver] = useState<string | null>(null);

  const self = people.find((p) => p.isSelf) ?? people[0];
  const selfDefaultId = self?.id ?? "person-self";
  const isAll = viewingPersonId === "__all__";

  // Estado UI del quick add
  const [newName, setNewName] = useState("");
  const [newRoutineId, setNewRoutineId] = useState<string | "">("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Rango de dias visibles segun la vista
  const days = useMemo(() => {
    if (viewMode === "day") return [selectedDate];
    if (viewMode === "week") {
      const ws = startOfWeek(selectedDate);
      return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    }
    return [selectedDate];
  }, [viewMode, selectedDate]);

  // Mapa dia -> tareas flexibles que aplican
  const todosByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const d of days) map.set(d, []);
    for (const t of tasks) {
      if (!t.flexible) continue;
      const owner = t.personId ?? selfDefaultId;
      if (!isAll && viewingPersonId && owner !== viewingPersonId) {
        if (viewingPersonId !== selfDefaultId || owner !== selfDefaultId)
          continue;
      }
      for (const d of days) {
        const w = parseISO(d).getDay() as Weekday;
        if (!t.weekdays.includes(w) && !t.isVital) continue;
        map.get(d)!.push(t);
      }
    }
    return map;
  }, [tasks, days, isAll, viewingPersonId, selfDefaultId]);

  const totalCount = useMemo(() => {
    let n = 0;
    for (const arr of todosByDay.values()) n += arr.length;
    return n;
  }, [todosByDay]);
  const undoneCount = useMemo(() => {
    let n = 0;
    for (const arr of todosByDay.values()) n += arr.filter((t) => !t.done).length;
    return n;
  }, [todosByDay]);

  if (!open) return null;
  const today = todayISO();

  function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const targetPersonId =
      isAll || !viewingPersonId ? selfDefaultId : viewingPersonId;
    const baseDate = parseISO(selectedDate);
    const wd = baseDate.getDay() as Weekday;
    // Si esta asignada a una rutina, usar los weekdays de la rutina (asi aparece en cada iteracion)
    let taskWeekdays: Weekday[] = [wd];
    if (newRoutineId) {
      const r = routines.find((x) => x.id === newRoutineId);
      if (r && r.weekdays.length) taskWeekdays = r.weekdays;
    }
    addTask({
      name,
      priority: 2 as Priority,
      weekdays: taskWeekdays,
      startHour: 9,
      endHour: 10,
      personId: targetPersonId,
      flexible: true,
      routineId: newRoutineId || undefined,
    });
    setNewName("");
    // No reseteamos newRoutineId — el usuario probablemente quiera agregar mas tareas a la misma rutina
  }

  return (
    <aside className="w-80 shrink-0 border-l border-fafo-border bg-fafo-panel/95 backdrop-blur-sm overflow-hidden flex flex-col">
      <header className="border-b border-fafo-border px-4 py-3 bg-fafo-panel/95 flex items-center gap-2 shrink-0">
        <div className="flex-1">
          <div className="text-sm font-bold flex items-center gap-2">
            <span>☑️</span>
            <span>Pendientes</span>
          </div>
          <div className="text-[10px] text-fafo-muted">
            {undoneCount} sin hacer · {totalCount} total
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-fafo-muted hover:text-fafo-text text-lg leading-none w-6 h-6 flex items-center justify-center"
          title="Cerrar"
        >
          ×
        </button>
      </header>

      {/* Quick-add */}
      <form
        onSubmit={handleQuickAdd}
        className="border-b border-fafo-border bg-fafo-panel2/40 shrink-0"
      >
        <div className="px-3 py-2 flex items-center gap-2">
          <span
            className={clsx(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center text-sm",
              newName.trim()
                ? "border-fafo-accent text-fafo-accent"
                : "border-fafo-muted/60 text-fafo-muted/60"
            )}
          >
            +
          </span>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Agregar una tarea"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-fafo-muted/70 text-fafo-text"
          />
          {newName.trim() && (
            <button
              type="submit"
              className="text-xs px-2 py-1 rounded bg-fafo-accent text-white font-semibold hover:brightness-110"
            >
              Agregar
            </button>
          )}
        </div>
        <div className="px-3 pb-2 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-fafo-muted">
            Rutina
          </span>
          <select
            value={newRoutineId}
            onChange={(e) => setNewRoutineId(e.target.value)}
            className="flex-1 bg-fafo-bg border border-fafo-border rounded text-xs px-2 py-1 outline-none focus:border-fafo-accent"
          >
            <option value="">— Sin rutina —</option>
            {routines.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </form>

      <div className="flex-1 overflow-y-auto">
        {totalCount === 0 && (
          <div className="p-6 text-center text-xs text-fafo-muted">
            <div className="text-3xl mb-2 opacity-50">📭</div>
            <div className="mb-1">No hay tareas sin horario</div>
            <div className="text-[10px] opacity-70">
              Escribi arriba y presiona Enter, o usá el "+" del calendario.
            </div>
          </div>
        )}

        {days.map((d) => {
          const dayTasks = todosByDay.get(d) ?? [];
          if (dayTasks.length === 0 && viewMode === "week") return null;
          const dateObj = parseISO(d);
          const isToday = d === today;
          const undone = dayTasks.filter((t) => !isTaskDoneForDay(t, d));
          const done = dayTasks.filter((t) => isTaskDoneForDay(t, d));

          return (
            <section
              key={d}
              className={clsx(
                "border-b border-fafo-border/60 transition-colors",
                dayDragOver === d && "bg-fafo-accent/5"
              )}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDayDragOver(d);
              }}
              onDragLeave={() => {
                setDayDragOver((cur) => (cur === d ? null : cur));
              }}
              onDrop={(e) => {
                const srcId = e.dataTransfer.getData("text/task-id");
                if (srcId) {
                  const w = parseISO(d).getDay() as Weekday;
                  const t = tasks.find((x) => x.id === srcId);
                  if (t && !t.weekdays.includes(w)) {
                    e.preventDefault();
                    updateTask(srcId, { weekdays: [w] });
                  }
                }
                setDayDragOver(null);
                setDraggingId(null);
                setDragOverId(null);
              }}
            >
              <div
                className={clsx(
                  "px-4 py-2 flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold sticky top-0 backdrop-blur z-[5]",
                  isToday
                    ? "text-fafo-accent bg-fafo-accent/5"
                    : "text-fafo-muted bg-fafo-panel2/40"
                )}
              >
                <span>{WEEKDAYS_SHORT[dateObj.getDay()]}</span>
                <span className="font-bold text-fafo-text tabular-nums">
                  {dateObj.getDate()}
                </span>
                <span className="opacity-60 normal-case">
                  {viewMode === "day"
                    ? formatDateLong(d).split(" ").slice(-2).join(" ")
                    : ""}
                </span>
                <span className="ml-auto text-[10px] text-fafo-muted">
                  {undone.length > 0
                    ? `${undone.length} pendiente${undone.length > 1 ? "s" : ""}`
                    : "todo hecho"}
                </span>
              </div>

              {dayTasks.length === 0 ? (
                <div className="px-4 py-3 text-[11px] text-fafo-muted/60 italic">
                  Sin tareas sin horario para hoy.
                </div>
              ) : (
                <RoutineGroupedTodos
                  undone={undone}
                  done={done}
                  routines={routines}
                  people={people}
                  isAll={isAll}
                  dayISO={d}
                  draggingId={draggingId}
                  dragOverId={dragOverId}
                  onToggle={(id) => {
                    const t = tasks.find((x) => x.id === id);
                    if (t) updateTask(id, toggleDonePatch(t, d));
                  }}
                  onEdit={onEditTask}
                  onDragStart={(id) => setDraggingId(id)}
                  onDragOver={(id) => setDragOverId(id)}
                  onDrop={(srcId, tId) => {
                    if (srcId && srcId !== tId) reorderTask(srcId, tId);
                    setDraggingId(null);
                    setDragOverId(null);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDragOverId(null);
                  }}
                />
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

function RoutineGroupedTodos({
  undone,
  done,
  routines,
  people,
  isAll,
  dayISO,
  draggingId,
  dragOverId,
  onToggle,
  onEdit,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  undone: Task[];
  done: Task[];
  routines: { id: string; name: string }[];
  people: { id: string; name: string; emoji: string; color: string; isSelf?: boolean }[];
  isAll: boolean;
  dayISO: string;
  draggingId: string | null;
  dragOverId: string | null;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: (srcId: string, targetId: string) => void;
  onDragEnd: () => void;
}) {
  // Agrupar undone por rutina. "__orphan__" = sin rutina.
  const groups = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of undone) {
      const k = t.routineId ?? "__orphan__";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return map;
  }, [undone]);

  const renderItem = (t: Task) => (
    <TodoItem
      key={t.id}
      task={t}
      routines={routines}
      people={people}
      isAll={isAll}
      doneForDay={isTaskDoneForDay(t, dayISO)}
      isDragging={draggingId === t.id}
      isDragOver={dragOverId === t.id && draggingId !== t.id}
      onToggle={() => onToggle(t.id)}
      onEdit={() => onEdit(t.id)}
      onDragStart={() => onDragStart(t.id)}
      onDragOver={() => onDragOver(t.id)}
      onDrop={(srcId) => onDrop(srcId, t.id)}
      onDragEnd={onDragEnd}
    />
  );

  // Orden de los grupos: rutinas en el orden del store, orphan al final.
  const groupKeys: string[] = [];
  for (const r of routines) {
    if (groups.has(r.id)) groupKeys.push(r.id);
  }
  if (groups.has("__orphan__")) groupKeys.push("__orphan__");

  return (
    <div>
      {groupKeys.map((key) => {
        const items = groups.get(key) ?? [];
        const routine =
          key === "__orphan__" ? null : routines.find((r) => r.id === key);
        return (
          <div key={key} className="border-t border-fafo-border/30 first:border-t-0">
            <div className="px-4 py-1.5 text-[9px] uppercase tracking-widest text-fafo-muted bg-fafo-panel2/30 flex items-center gap-2">
              {routine ? (
                <>
                  <span className="text-fafo-text font-semibold">
                    ↳ {routine.name}
                  </span>
                  <span className="opacity-60">
                    {items.length} pendiente{items.length !== 1 ? "s" : ""}
                  </span>
                </>
              ) : (
                <span>Sin rutina · {items.length}</span>
              )}
            </div>
            <ul className="divide-y divide-fafo-border/30">
              {items.map(renderItem)}
            </ul>
          </div>
        );
      })}

      {done.length > 0 && (
        <div className="border-t border-fafo-border/30 mt-2">
          <div className="px-4 py-1.5 text-[9px] uppercase tracking-widest text-fafo-muted/70">
            Hechas
          </div>
          <ul className="divide-y divide-fafo-border/30 opacity-80">
            {done.map(renderItem)}
          </ul>
        </div>
      )}
    </div>
  );
}

function TodoItem({
  task,
  routines,
  people,
  isAll,
  doneForDay,
  isDragging,
  isDragOver,
  onToggle,
  onEdit,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  task: Task;
  routines: { id: string; name: string }[];
  people: { id: string; name: string; emoji: string; color: string; isSelf?: boolean }[];
  isAll: boolean;
  doneForDay: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: (srcId: string) => void;
  onDragEnd: () => void;
}) {
  const parentRoutine = task.routineId
    ? routines.find((r) => r.id === task.routineId)
    : null;
  const owner = isAll
    ? people.find((p) => p.id === (task.personId ?? "")) ??
      people.find((p) => p.isSelf)
    : null;
  const isVital = task.isVital || task.priority === 0;

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
        const srcId = e.dataTransfer.getData("text/task-id");
        onDrop(srcId);
      }}
      onDragEnd={onDragEnd}
      className={clsx(
        "flex items-start gap-2 px-3 py-2 hover:bg-fafo-panel2/50 transition-all cursor-move",
        isDragging && "opacity-30",
        isDragOver && "border-t-2 border-fafo-accent"
      )}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={clsx(
          "shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs transition-all mt-0.5",
          doneForDay
            ? "bg-fafo-accent2 border-fafo-accent2 text-white"
            : "border-fafo-muted/60 hover:border-fafo-accent hover:bg-fafo-accent/10"
        )}
        title={doneForDay ? "Marcar pendiente" : "Marcar hecha"}
      >
        {doneForDay && <span className="leading-none">✓</span>}
      </button>

      <button onClick={onEdit} className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={clsx(
              "w-1.5 h-1.5 rounded-full shrink-0",
              PRIORITY_DOT[task.priority]
            )}
          />
          <span
            className={clsx(
              "text-sm font-medium leading-tight truncate",
              doneForDay && "line-through text-fafo-muted"
            )}
          >
            {task.name}
          </span>
          {isVital && (
            <span className="text-[9px] font-bold tracking-wider text-fafo-accent ml-1">
              VITAL
            </span>
          )}
        </div>
        {(owner || parentRoutine) && (
          <div className="flex items-center gap-1.5 text-[10px] text-fafo-muted mt-0.5">
            {owner && (
              <span title={owner.name}>
                {owner.emoji} {owner.name}
              </span>
            )}
            {parentRoutine && (
              <span title={`En rutina: ${parentRoutine.name}`}>
                ↳ {parentRoutine.name}
              </span>
            )}
          </div>
        )}
      </button>

      {/* Drag handle visual */}
      <span
        className="shrink-0 text-fafo-muted/40 text-xs select-none mt-1"
        title="Arrastra para reordenar"
      >
        ⋮⋮
      </span>
    </li>
  );
}
