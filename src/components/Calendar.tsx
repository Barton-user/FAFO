"use client";

import { useFafoStore } from "@/lib/store";
import { useResolvedContext } from "@/lib/context";
import type { Task, Routine, Person, Weekday, ViewMode } from "@/lib/types";
import { useMemo, useRef, useState, useCallback } from "react";
import {
  parseISO,
  startOfWeek,
  addDays,
  todayISO,
  monthGridDays,
  isSameMonth,
  WEEKDAYS_SHORT,
} from "@/lib/dateUtils";
import clsx from "clsx";

const HOUR_START = 5;
const HOUR_END = 24;
const HOUR_HEIGHT = 52;
const TOTAL_HEIGHT = (HOUR_END - HOUR_START) * HOUR_HEIGHT;
const SNAP_MIN = 15;
const MIN_DURATION = 0.25;

export interface DragPayload {
  startHour: number;
  endHour: number;
  personId: string;
  weekday: Weekday;
}

interface Props {
  viewMode: ViewMode;
  selectedDate: string;
  viewingPersonId: string | null;
  onSelectDate: (iso: string) => void;
  onDragComplete: (payload: DragPayload) => void;
  onTaskClick: (taskId: string) => void;
  onRoutineEdit?: (routineId: string) => void;
}

function hourLabel(h: number) {
  const hh = Math.floor(h);
  return `${hh.toString().padStart(2, "0")}:00`;
}

function fmtTime(h: number) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

function snapHour(y: number): number {
  const totalMinutes = (y / HOUR_HEIGHT) * 60;
  const snapped = Math.round(totalMinutes / SNAP_MIN) * SNAP_MIN;
  const hours = HOUR_START + snapped / 60;
  return Math.max(HOUR_START, Math.min(HOUR_END, hours));
}

function snapDeltaHours(deltaPx: number): number {
  const deltaMin = (deltaPx / HOUR_HEIGHT) * 60;
  const snappedMin = Math.round(deltaMin / SNAP_MIN) * SNAP_MIN;
  return snappedMin / 60;
}

function findContainingRoutine(
  routines: Routine[],
  startHour: number,
  endHour: number
): Routine | null {
  // Permite anidar si el "centro" de la tarea cae dentro de la rutina.
  // Mas indulgente: alcanza con que la tarea se solape al menos la mitad con la rutina.
  const center = (startHour + endHour) / 2;
  // Preferimos la rutina que contiene el centro
  const byCenter = routines.find(
    (r) => center >= r.startHour && center < r.endHour
  );
  if (byCenter) return byCenter;
  // Fallback: cualquier rutina que se solape al menos 50% con la tarea
  const taskDur = endHour - startHour;
  return (
    routines.find((r) => {
      const overlap =
        Math.min(endHour, r.endHour) - Math.max(startHour, r.startHour);
      return overlap > 0 && overlap >= taskDur * 0.5;
    }) ?? null
  );
}

const PRIORITY_BG: Record<number, string> = {
  0: "bg-[#F4B5C3] text-[#5C2839]",
  1: "bg-[#F5CBA0] text-[#5E3920]",
  2: "bg-[#B8DBE8] text-[#22455E]",
  3: "bg-[#CFC6E0] text-[#382F50]",
};

const PRIORITY_DOT: Record<number, string> = {
  0: "bg-[#DD7493]",
  1: "bg-[#E89E5C]",
  2: "bg-[#5BACC4]",
  3: "bg-[#9B8FBC]",
};

const PRIORITY_LABEL: Record<number, string> = {
  0: "VITAL",
  1: "HIGH",
  2: "NORMAL",
  3: "LOW",
};

export function Calendar(props: Props) {
  if (props.viewMode === "month") return <MonthView {...props} />;
  if (props.viewMode === "week") return <WeekView {...props} />;
  return <DayView {...props} />;
}

/* ---------- TaskBlock ---------- */

interface TaskBlockProps {
  task: Task;
  top: number;
  height: number;
  compact?: boolean;
  routinesInScope: Routine[];
  showOwnerEmoji?: boolean;
  onOpen: () => void;
}

function TaskBlock({
  task,
  top,
  height,
  compact,
  routinesInScope,
  showOwnerEmoji,
  onOpen,
}: TaskBlockProps) {
  const updateTask = useFafoStore((s) => s.updateTask);
  const toggleTask = useFafoStore((s) => s.toggleTask);
  const people = useFafoStore((s) => s.people);
  const owner = showOwnerEmoji
    ? people.find((p) => p.id === (task.personId ?? "")) ??
      people.find((p) => p.isSelf)
    : null;

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const didMoveRef = useRef(false);
  const [drag, setDrag] = useState<{
    mode: "move" | "resize-top" | "resize-bottom";
    startY: number;
    currentY: number;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.stopPropagation();
    const target = e.target as HTMLElement;
    const handle = target.dataset.handle;
    const mode: "move" | "resize-top" | "resize-bottom" =
      handle === "resize-top"
        ? "resize-top"
        : handle === "resize-bottom"
          ? "resize-bottom"
          : "move";
    try {
      buttonRef.current?.setPointerCapture(e.pointerId);
    } catch {}
    didMoveRef.current = false;
    setDrag({ mode, startY: e.clientY, currentY: e.clientY });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dy) > 3) didMoveRef.current = true;
    setDrag((d) => (d ? { ...d, currentY: e.clientY } : null));
  };

  const computeNewTimes = (mode: typeof drag extends null ? never : "move" | "resize-top" | "resize-bottom", deltaHours: number) => {
    if (mode === "move") {
      const dur = task.endHour - task.startHour;
      const newStart = Math.max(
        HOUR_START,
        Math.min(HOUR_END - dur, task.startHour + deltaHours)
      );
      return { startHour: newStart, endHour: newStart + dur };
    } else if (mode === "resize-top") {
      const newStart = Math.max(
        HOUR_START,
        Math.min(task.endHour - MIN_DURATION, task.startHour + deltaHours)
      );
      return { startHour: newStart, endHour: task.endHour };
    } else {
      const newEnd = Math.max(
        task.startHour + MIN_DURATION,
        Math.min(HOUR_END, task.endHour + deltaHours)
      );
      return { startHour: task.startHour, endHour: newEnd };
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const deltaHours = snapDeltaHours(dy);
    const localDrag = drag;
    setDrag(null);
    if (Math.abs(deltaHours) < 0.001) return;
    const { startHour, endHour } = computeNewTimes(localDrag.mode, deltaHours);
    const container = findContainingRoutine(routinesInScope, startHour, endHour);
    const newRoutineId = container ? container.id : undefined;
    updateTask(task.id, { startHour, endHour, routineId: newRoutineId });
  };

  const dragDeltaPx = drag ? drag.currentY - drag.startY : 0;
  const snappedHours = snapDeltaHours(dragDeltaPx);
  const snappedPx = snappedHours * HOUR_HEIGHT;
  let displayTop = top;
  let displayHeight = height;
  if (drag?.mode === "move") {
    displayTop = top + snappedPx;
  } else if (drag?.mode === "resize-top") {
    const clampedPx = Math.min(snappedPx, height - 28);
    displayTop = top + clampedPx;
    displayHeight = Math.max(28, height - clampedPx);
  } else if (drag?.mode === "resize-bottom") {
    displayHeight = Math.max(28, height + snappedPx);
  }

  // Determine "would-be-nested" — either committed or while dragging
  const previewTimes = drag ? computeNewTimes(drag.mode, snappedHours) : {
    startHour: task.startHour,
    endHour: task.endHour,
  };
  const previewParent = findContainingRoutine(
    routinesInScope,
    previewTimes.startHour,
    previewTimes.endHour
  );
  const nested = !!previewParent;

  let liveLabel = "";
  if (drag) {
    liveLabel = `${fmtTime(previewTimes.startHour)} – ${fmtTime(previewTimes.endHour)}`;
  }

  const isVital = task.isVital || task.priority === 0;

  // Inset (horizontal) — nested tasks live INSIDE the routine block.
  // Diferencia mas marcada para que se note la anidacion.
  const insetClass = nested
    ? compact
      ? "left-4 right-2"
      : "left-8 right-3"
    : compact
      ? "left-1 right-1"
      : "left-1.5 right-1.5";

  return (
    <button
      ref={buttonRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onClick={(e) => {
        e.stopPropagation();
        if (didMoveRef.current) {
          didMoveRef.current = false;
          return;
        }
        onOpen();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        toggleTask(task.id);
      }}
      className={clsx(
        "absolute text-left rounded-md shadow-md touch-none select-none overflow-hidden",
        "focus:outline-none focus:ring-2 focus:ring-fafo-accent",
        insetClass,
        compact ? "p-1.5 text-[11px]" : "p-2 text-xs",
        PRIORITY_BG[task.priority],
        isVital && "vital-task ring-2 ring-white/80",
        task.done && "opacity-40 line-through grayscale",
        drag
          ? "shadow-2xl ring-2 ring-fafo-text/40 z-30 cursor-grabbing scale-[1.02]"
          : "cursor-grab hover:shadow-xl transition-all z-20",
        nested && "border-l-[3px] border-fafo-text/30"
      )}
      style={{ top: displayTop, height: displayHeight }}
      title="Arrastra para mover · borde para redimensionar · doble click: marcar hecha"
    >
      {!compact && (
        <div className="flex items-center gap-1.5 pointer-events-none">
          <span className="text-[9px] font-bold tracking-wider opacity-75">
            {PRIORITY_LABEL[task.priority]}
          </span>
          {task.locationId && (
            <span className="text-[9px] opacity-70">· 📍</span>
          )}
          {owner && (
            <span
              className="text-[10px] leading-none ml-1"
              title={owner.name}
            >
              {owner.emoji}
            </span>
          )}
          {nested && previewParent && (
            <span className="text-[9px] opacity-80 ml-auto font-semibold">
              ↳ {previewParent.name.slice(0, 14)}
            </span>
          )}
        </div>
      )}
      <div className="font-semibold truncate leading-tight pointer-events-none flex items-center gap-1">
        {compact && nested && <span className="opacity-70">↳</span>}
        {compact && owner && (
          <span className="text-[10px] leading-none" title={owner.name}>
            {owner.emoji}
          </span>
        )}
        <span className="truncate">{task.name}</span>
      </div>

      {drag && (
        <div className="absolute inset-x-0 bottom-1 text-center text-[9px] font-mono bg-fafo-panel/85 text-fafo-text mx-1 rounded px-1 pointer-events-none shadow-sm">
          {liveLabel}
        </div>
      )}

      <div
        data-handle="resize-top"
        className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-fafo-text/15 rounded-t-lg group/top"
      >
        <div className="absolute left-1/2 -translate-x-1/2 top-0.5 w-6 h-0.5 rounded-full bg-transparent group-hover/top:bg-fafo-text/60 transition-colors" />
      </div>
      <div
        data-handle="resize-bottom"
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-fafo-text/15 rounded-b-lg group/bot"
      >
        <div className="absolute left-1/2 -translate-x-1/2 bottom-0.5 w-6 h-0.5 rounded-full bg-transparent group-hover/bot:bg-fafo-text/60 transition-colors" />
      </div>
    </button>
  );
}

/* ---------- RoutineBlock ---------- */

interface RoutineBlockProps {
  routine: Routine;
  top: number;
  height: number;
  compact?: boolean;
  onEdit?: () => void;
}

function RoutineBlock({ routine, top, height, compact, onEdit }: RoutineBlockProps) {
  const updateRoutine = useFafoStore((s) => s.updateRoutine);
  const shiftRoutine = useFafoStore((s) => s.shiftRoutine);
  const deleteRoutine = useFafoStore((s) => s.deleteRoutine);

  const didMoveRef = useRef(false);
  const [drag, setDrag] = useState<{
    mode: "move" | "resize-top" | "resize-bottom";
    startY: number;
    currentY: number;
  } | null>(null);

  const startDrag =
    (mode: "move" | "resize-top" | "resize-bottom") =>
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      didMoveRef.current = false;
      setDrag({ mode, startY: e.clientY, currentY: e.clientY });
    };

  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dy) > 3) didMoveRef.current = true;
    setDrag((d) => (d ? { ...d, currentY: e.clientY } : null));
  };

  const onUp = (_e: React.PointerEvent<HTMLElement>) => {
    if (!drag) return;
    const dy = drag.currentY - drag.startY;
    const deltaHours = snapDeltaHours(dy);
    const localDrag = drag;
    setDrag(null);
    if (Math.abs(deltaHours) < 0.001) return;
    if (localDrag.mode === "move") {
      // Mueve la rutina y arrastra todas sus tareas hijas con ella.
      shiftRoutine(routine.id, deltaHours);
    } else if (localDrag.mode === "resize-top") {
      const newStart = Math.max(
        HOUR_START,
        Math.min(routine.endHour - MIN_DURATION, routine.startHour + deltaHours)
      );
      updateRoutine(routine.id, { startHour: newStart });
    } else {
      const newEnd = Math.max(
        routine.startHour + MIN_DURATION,
        Math.min(HOUR_END, routine.endHour + deltaHours)
      );
      updateRoutine(routine.id, { endHour: newEnd });
    }
  };

  const dragHandlers = {
    onPointerMove: onMove,
    onPointerUp: onUp,
    onPointerCancel: () => setDrag(null),
  };

  const dragDeltaPx = drag ? drag.currentY - drag.startY : 0;
  const snappedHours = snapDeltaHours(dragDeltaPx);
  const snappedPx = snappedHours * HOUR_HEIGHT;
  let displayTop = top;
  let displayHeight = height;
  if (drag?.mode === "move") {
    displayTop = top + snappedPx;
  } else if (drag?.mode === "resize-top") {
    const clampedPx = Math.min(snappedPx, height - 28);
    displayTop = top + clampedPx;
    displayHeight = Math.max(28, height - clampedPx);
  } else if (drag?.mode === "resize-bottom") {
    displayHeight = Math.max(28, height + snappedPx);
  }

  let liveLabel = "";
  if (drag) {
    if (drag.mode === "move") {
      const dur = routine.endHour - routine.startHour;
      const ns = Math.max(
        HOUR_START,
        Math.min(HOUR_END - dur, routine.startHour + snappedHours)
      );
      liveLabel = `${fmtTime(ns)} – ${fmtTime(ns + dur)}`;
    } else if (drag.mode === "resize-top") {
      const ns = Math.max(
        HOUR_START,
        Math.min(routine.endHour - MIN_DURATION, routine.startHour + snappedHours)
      );
      liveLabel = `${fmtTime(ns)} – ${fmtTime(routine.endHour)}`;
    } else {
      const ne = Math.max(
        routine.startHour + MIN_DURATION,
        Math.min(HOUR_END, routine.endHour + snappedHours)
      );
      liveLabel = `${fmtTime(routine.startHour)} – ${fmtTime(ne)}`;
    }
  }

  return (
    <div
      className="absolute left-1 right-1 rounded-lg pointer-events-none group/r z-0"
      style={{ top: displayTop, height: displayHeight }}
    >
      {/* Background fill + hatched overlay */}
      <div
        className="absolute inset-0 rounded-lg routine-block"
        style={{ backgroundColor: routine.color }}
      />

      {/* Move handle = name chip */}
      <button
        onPointerDown={startDrag("move")}
        {...dragHandlers}
        onClick={(e) => {
          e.stopPropagation();
          if (didMoveRef.current) {
            didMoveRef.current = false;
            return;
          }
          onEdit?.();
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        className={clsx(
          "absolute left-1.5 top-1.5 text-[10px] uppercase tracking-wider font-bold bg-fafo-panel/90 text-fafo-text px-1.5 py-0.5 rounded backdrop-blur-sm pointer-events-auto select-none shadow-sm z-10",
          drag ? "cursor-grabbing" : "cursor-grab hover:bg-white"
        )}
        title="Click: editar · arrastrar: mover la rutina"
      >
        {routine.name}
      </button>

      {/* Delete button — visible on hover */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Eliminar rutina "${routine.name}"?`)) {
            deleteRoutine(routine.id);
          }
        }}
        className="absolute right-1.5 top-1.5 w-5 h-5 flex items-center justify-center text-xs leading-none bg-fafo-panel/90 text-fafo-text rounded pointer-events-auto shadow-sm opacity-0 group-hover/r:opacity-100 focus:opacity-100 hover:bg-fafo-accent hover:text-white transition-all z-10"
        title="Eliminar rutina"
      >
        ×
      </button>

      {/* Top resize */}
      <div
        onPointerDown={startDrag("resize-top")}
        onDoubleClick={(e) => e.stopPropagation()}
        {...dragHandlers}
        className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize pointer-events-auto hover:bg-fafo-text/20 rounded-t-lg group/top z-10"
      >
        <div className="absolute left-1/2 -translate-x-1/2 top-0.5 w-8 h-0.5 rounded-full bg-transparent group-hover/top:bg-fafo-text/60 transition-colors" />
      </div>

      {/* Bottom resize */}
      <div
        onPointerDown={startDrag("resize-bottom")}
        onDoubleClick={(e) => e.stopPropagation()}
        {...dragHandlers}
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize pointer-events-auto hover:bg-fafo-text/20 rounded-b-lg group/bot z-10"
      >
        <div className="absolute left-1/2 -translate-x-1/2 bottom-0.5 w-8 h-0.5 rounded-full bg-transparent group-hover/bot:bg-fafo-text/60 transition-colors" />
      </div>

      {/* Live label while dragging */}
      {drag && (
        <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 text-[10px] font-mono bg-fafo-panel/95 text-fafo-text px-2 py-1 rounded shadow pointer-events-none">
          {liveLabel}
        </div>
      )}
    </div>
  );
}

/* ---------- DAY VIEW ---------- */

function DayView({
  selectedDate,
  viewingPersonId,
  onDragComplete,
  onTaskClick,
  onRoutineEdit,
}: Props) {
  const ctx = useResolvedContext();
  const tasks = useFafoStore((s) => s.tasks);
  const routines = useFafoStore((s) => s.routines);
  const people = useFafoStore((s) => s.people);

  const weekday = parseISO(selectedDate).getDay() as Weekday;
  const isToday = selectedDate === todayISO();

  const isAll = viewingPersonId === "__all__";
  const visiblePeople = useMemo(() => {
    if (isAll) {
      // Mostrar todas las personas siempre.
      return people;
    }
    const self = people.find((p) => p.isSelf) ?? people[0];
    const required = new Set<string>();
    if (self) required.add(self.id);
    if (viewingPersonId) required.add(viewingPersonId);
    for (const p of people) {
      if (p.isSelf) continue;
      const hasRoutine = routines.some(
        (r) => r.personId === p.id && r.weekdays.includes(weekday)
      );
      const hasTask = tasks.some(
        (t) => t.personId === p.id && t.weekdays.includes(weekday)
      );
      if (hasRoutine || hasTask) required.add(p.id);
    }
    return people.filter((p) => required.has(p.id));
  }, [isAll, people, routines, tasks, weekday, viewingPersonId]);

  const tasksByPerson = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const p of visiblePeople) map.set(p.id, []);
    for (const t of tasks) {
      if (!t.weekdays.includes(weekday) && !t.isVital) continue;
      if (
        !t.isVital &&
        t.locationId &&
        t.locationId !== ctx.activeLocation?.id
      )
        continue;
      const owner = t.personId ?? visiblePeople[0]?.id;
      if (owner && map.has(owner)) map.get(owner)!.push(t);
    }
    return map;
  }, [tasks, visiblePeople, weekday, ctx.activeLocation]);

  const routinesByPerson = useMemo(() => {
    const map = new Map<string, Routine[]>();
    for (const p of visiblePeople) map.set(p.id, []);
    for (const r of routines) {
      if (!r.weekdays.includes(weekday)) continue;
      const owner = r.personId ?? visiblePeople[0]?.id;
      if (owner && map.has(owner)) map.get(owner)!.push(r);
    }
    return map;
  }, [routines, visiblePeople, weekday]);

  const [drag, setDrag] = useState<{
    personId: string;
    startY: number;
    currentY: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, personId: string) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const target = e.currentTarget;
      const rect = target.getBoundingClientRect();
      const y = e.clientY - rect.top;
      target.setPointerCapture(e.pointerId);
      setDrag({ personId, startY: y, currentY: y });
    },
    []
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const y = Math.max(0, Math.min(TOTAL_HEIGHT, e.clientY - rect.top));
      setDrag((d) => (d ? { ...d, currentY: y } : null));
    },
    [drag]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const y = Math.max(0, Math.min(TOTAL_HEIGHT, e.clientY - rect.top));
      const a = snapHour(Math.min(drag.startY, y));
      const b = snapHour(Math.max(drag.startY, y));
      setDrag(null);
      if (b - a >= MIN_DURATION) {
        onDragComplete({
          startHour: a,
          endHour: b,
          personId: drag.personId,
          weekday,
        });
      }
    },
    [drag, weekday, onDragComplete]
  );

  const nowMarkerY =
    isToday && ctx.hour > HOUR_START && ctx.hour < HOUR_END
      ? (ctx.hour - HOUR_START) * HOUR_HEIGHT
      : null;

  return (
    <div className="flex flex-1 overflow-hidden bg-fafo-bg">
      <div className="w-16 shrink-0 border-r border-fafo-border bg-fafo-bg sticky left-0 z-10">
        <div className="h-12 border-b border-fafo-border" />
        <div className="relative" style={{ height: TOTAL_HEIGHT }}>
          {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => {
            const h = HOUR_START + i;
            return (
              <div
                key={h}
                className="absolute right-2 text-[10px] text-fafo-muted tabular-nums"
                style={{ top: i * HOUR_HEIGHT - 6 }}
              >
                {hourLabel(h)}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${visiblePeople.length}, minmax(240px, 1fr))`,
          }}
        >
          {visiblePeople.map((p) => (
            <div
              key={`h-${p.id}`}
              className="h-12 border-b border-r border-fafo-border flex items-center gap-2 px-3 sticky top-0 bg-fafo-panel/95 backdrop-blur z-20"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-base shadow-inner"
                style={{ background: p.color + "33", color: p.color }}
              >
                {p.emoji}
              </div>
              <span className="text-sm font-medium truncate">{p.name}</span>
              {p.isSelf && (
                <span className="ml-auto text-[9px] tracking-widest text-fafo-muted">
                  YO
                </span>
              )}
            </div>
          ))}

          {visiblePeople.map((p) => {
            const ptasks = tasksByPerson.get(p.id) ?? [];
            const proutines = routinesByPerson.get(p.id) ?? [];
            return (
              <div
                key={`col-${p.id}`}
                className="relative border-r border-fafo-border select-none"
                style={{ height: TOTAL_HEIGHT }}
                onPointerDown={(e) => onPointerDown(e, p.id)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
                onDoubleClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const y = Math.max(
                    0,
                    Math.min(TOTAL_HEIGHT, e.clientY - rect.top)
                  );
                  const startHour = snapHour(y);
                  const endHour = Math.min(HOUR_END, startHour + 1);
                  onDragComplete({
                    startHour,
                    endHour,
                    personId: p.id,
                    weekday,
                  });
                }}
              >
                {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 grid-hour"
                    style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                  >
                    <div
                      className="absolute left-0 right-0 grid-hour-half"
                      style={{ top: HOUR_HEIGHT / 2 }}
                    />
                  </div>
                ))}

                {proutines.map((r) => {
                  const rtop = (r.startHour - HOUR_START) * HOUR_HEIGHT;
                  const rh = (r.endHour - r.startHour) * HOUR_HEIGHT;
                  return (
                    <RoutineBlock
                      key={r.id}
                      routine={r}
                      top={rtop}
                      height={rh}
                      onEdit={
                        onRoutineEdit ? () => onRoutineEdit(r.id) : undefined
                      }
                    />
                  );
                })}

                {ptasks.map((t) => {
                  const top = (t.startHour - HOUR_START) * HOUR_HEIGHT;
                  const height = Math.max(
                    28,
                    (t.endHour - t.startHour) * HOUR_HEIGHT - 4
                  );
                  return (
                    <TaskBlock
                      key={t.id}
                      task={t}
                      top={top}
                      height={height}
                      routinesInScope={proutines}
                      onOpen={() => onTaskClick(t.id)}
                    />
                  );
                })}

                {drag && drag.personId === p.id && (
                  <div
                    className="absolute left-1 right-1 drag-selection flex items-center justify-center"
                    style={{
                      top: Math.min(drag.startY, drag.currentY),
                      height: Math.abs(drag.currentY - drag.startY),
                    }}
                  >
                    <span className="text-[10px] text-fafo-text font-mono bg-fafo-panel/85 px-1.5 py-0.5 rounded">
                      {hourLabel(snapHour(Math.min(drag.startY, drag.currentY)))} →{" "}
                      {hourLabel(snapHour(Math.max(drag.startY, drag.currentY)))}
                    </span>
                  </div>
                )}

                {p.isSelf && nowMarkerY !== null && (
                  <div
                    className="absolute left-0 right-0 pointer-events-none z-30"
                    style={{ top: nowMarkerY }}
                  >
                    <div className="h-px bg-fafo-accent shadow-[0_0_8px_rgba(221,116,147,0.6)]" />
                    <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-fafo-accent shadow-[0_0_6px_rgba(221,116,147,0.8)]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- WEEK VIEW ---------- */

function WeekView({
  selectedDate,
  viewingPersonId,
  onSelectDate,
  onDragComplete,
  onTaskClick,
  onRoutineEdit,
}: Props) {
  const ctx = useResolvedContext();
  const tasks = useFafoStore((s) => s.tasks);
  const routines = useFafoStore((s) => s.routines);
  const people = useFafoStore((s) => s.people);

  const self = people.find((p) => p.isSelf) ?? people[0];
  const isAll = viewingPersonId === "__all__";
  const selfDefaultId = self?.id ?? "person-self";
  const selfId =
    !isAll && viewingPersonId && people.find((p) => p.id === viewingPersonId)
      ? viewingPersonId
      : selfDefaultId;
  const viewingPerson = isAll ? null : people.find((p) => p.id === selfId);

  const weekStart = startOfWeek(selectedDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = todayISO();

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const d of days) map.set(d, []);
    for (const t of tasks) {
      const ownerId = t.personId ?? selfDefaultId;
      if (!isAll && ownerId !== selfId) continue;
      for (const d of days) {
        const w = parseISO(d).getDay() as Weekday;
        if (!t.weekdays.includes(w) && !t.isVital) continue;
        if (
          !t.isVital &&
          t.locationId &&
          t.locationId !== ctx.activeLocation?.id
        )
          continue;
        map.get(d)!.push(t);
      }
    }
    return map;
  }, [tasks, days, selfId, selfDefaultId, isAll, ctx.activeLocation]);

  const routinesByDay = useMemo(() => {
    const map = new Map<string, Routine[]>();
    for (const d of days) map.set(d, []);
    for (const r of routines) {
      const ownerId = r.personId ?? selfDefaultId;
      if (!isAll && ownerId !== selfId) continue;
      for (const d of days) {
        const w = parseISO(d).getDay() as Weekday;
        if (!r.weekdays.includes(w)) continue;
        map.get(d)!.push(r);
      }
    }
    return map;
  }, [routines, days, selfId, selfDefaultId, isAll]);

  const [drag, setDrag] = useState<{
    dayISO: string;
    startY: number;
    currentY: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, dayISO: string) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const target = e.currentTarget;
      const rect = target.getBoundingClientRect();
      const y = e.clientY - rect.top;
      target.setPointerCapture(e.pointerId);
      setDrag({ dayISO, startY: y, currentY: y });
    },
    []
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const y = Math.max(0, Math.min(TOTAL_HEIGHT, e.clientY - rect.top));
      setDrag((d) => (d ? { ...d, currentY: y } : null));
    },
    [drag]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const y = Math.max(0, Math.min(TOTAL_HEIGHT, e.clientY - rect.top));
      const a = snapHour(Math.min(drag.startY, y));
      const b = snapHour(Math.max(drag.startY, y));
      const weekday = parseISO(drag.dayISO).getDay() as Weekday;
      setDrag(null);
      if (b - a >= MIN_DURATION) {
        onDragComplete({
          startHour: a,
          endHour: b,
          personId: selfId,
          weekday,
        });
      }
    },
    [drag, onDragComplete, selfId]
  );

  // Despues de todos los hooks: si estamos en modo Todos, delega al render con sub-columnas.
  if (isAll) {
    return (
      <WeekViewAll
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
        onDragComplete={onDragComplete}
        onTaskClick={onTaskClick}
        onRoutineEdit={onRoutineEdit}
      />
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden bg-fafo-bg">
      <div className="w-16 shrink-0 border-r border-fafo-border bg-fafo-bg sticky left-0 z-10">
        <div className="h-14 border-b border-fafo-border flex flex-col items-center justify-center">
          {viewingPerson ? (
            <div
              className="text-[10px] leading-none flex flex-col items-center gap-0.5"
              title={`Viendo: ${viewingPerson.name}`}
            >
              <span className="text-sm">{viewingPerson.emoji}</span>
              <span
                className="text-[8px] uppercase tracking-wider truncate max-w-[3rem]"
                style={{ color: viewingPerson.color }}
              >
                {viewingPerson.name}
              </span>
            </div>
          ) : null}
        </div>
        <div className="relative" style={{ height: TOTAL_HEIGHT }}>
          {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => {
            const h = HOUR_START + i;
            return (
              <div
                key={h}
                className="absolute right-2 text-[10px] text-fafo-muted tabular-nums"
                style={{ top: i * HOUR_HEIGHT - 6 }}
              >
                {hourLabel(h)}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(7, minmax(140px, 1fr))` }}
        >
          {days.map((d) => {
            const isToday = d === today;
            const isSelected = d === selectedDate;
            const date = parseISO(d);
            return (
              <button
                key={`h-${d}`}
                onClick={() => onSelectDate(d)}
                className={clsx(
                  "h-14 border-b border-r border-fafo-border flex flex-col items-center justify-center sticky top-0 bg-fafo-panel/95 backdrop-blur z-20 transition-colors hover:bg-fafo-panel",
                  isSelected && "ring-1 ring-inset ring-fafo-accent/60"
                )}
              >
                <span className="text-[10px] uppercase tracking-wider text-fafo-muted">
                  {WEEKDAYS_SHORT[date.getDay()]}
                </span>
                <span
                  className={clsx(
                    "text-lg font-bold leading-none mt-0.5",
                    isToday ? "text-fafo-accent" : "text-fafo-text"
                  )}
                >
                  {date.getDate()}
                </span>
              </button>
            );
          })}

          {days.map((d) => {
            const dtasks = tasksByDay.get(d) ?? [];
            const droutines = routinesByDay.get(d) ?? [];
            const isToday = d === today;
            const nowMarkerY =
              isToday && ctx.hour > HOUR_START && ctx.hour < HOUR_END
                ? (ctx.hour - HOUR_START) * HOUR_HEIGHT
                : null;

            return (
              <div
                key={`col-${d}`}
                className="relative border-r border-fafo-border select-none"
                style={{ height: TOTAL_HEIGHT }}
                onPointerDown={(e) => onPointerDown(e, d)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
                onDoubleClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const y = Math.max(
                    0,
                    Math.min(TOTAL_HEIGHT, e.clientY - rect.top)
                  );
                  const startHour = snapHour(y);
                  const endHour = Math.min(HOUR_END, startHour + 1);
                  const wd = parseISO(d).getDay() as Weekday;
                  onDragComplete({
                    startHour,
                    endHour,
                    personId: selfId,
                    weekday: wd,
                  });
                }}
              >
                {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 grid-hour"
                    style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                  >
                    <div
                      className="absolute left-0 right-0 grid-hour-half"
                      style={{ top: HOUR_HEIGHT / 2 }}
                    />
                  </div>
                ))}

                {droutines.map((r) => {
                  const rtop = (r.startHour - HOUR_START) * HOUR_HEIGHT;
                  const rh = (r.endHour - r.startHour) * HOUR_HEIGHT;
                  return (
                    <RoutineBlock
                      key={`${d}-${r.id}`}
                      routine={r}
                      top={rtop}
                      height={rh}
                      compact
                      onEdit={
                        onRoutineEdit ? () => onRoutineEdit(r.id) : undefined
                      }
                    />
                  );
                })}

                {dtasks.map((t) => {
                  const top = (t.startHour - HOUR_START) * HOUR_HEIGHT;
                  const height = Math.max(
                    22,
                    (t.endHour - t.startHour) * HOUR_HEIGHT - 4
                  );
                  return (
                    <TaskBlock
                      key={`${d}-${t.id}`}
                      task={t}
                      top={top}
                      height={height}
                      compact
                      routinesInScope={droutines}
                      showOwnerEmoji={isAll}
                      onOpen={() => onTaskClick(t.id)}
                    />
                  );
                })}

                {drag && drag.dayISO === d && (
                  <div
                    className="absolute left-1 right-1 drag-selection flex items-center justify-center"
                    style={{
                      top: Math.min(drag.startY, drag.currentY),
                      height: Math.abs(drag.currentY - drag.startY),
                    }}
                  >
                    <span className="text-[10px] text-fafo-text font-mono bg-fafo-panel/85 px-1.5 py-0.5 rounded">
                      {hourLabel(snapHour(Math.min(drag.startY, drag.currentY)))}
                    </span>
                  </div>
                )}

                {nowMarkerY !== null && (
                  <div
                    className="absolute left-0 right-0 pointer-events-none z-30"
                    style={{ top: nowMarkerY }}
                  >
                    <div className="h-px bg-fafo-accent shadow-[0_0_6px_rgba(221,116,147,0.55)]" />
                    <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-fafo-accent" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- WEEK VIEW (ALL) — sub-columnas por persona ---------- */

interface WeekViewAllProps {
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  onDragComplete: (payload: DragPayload) => void;
  onTaskClick: (taskId: string) => void;
  onRoutineEdit?: (routineId: string) => void;
}

function WeekViewAll({
  selectedDate,
  onSelectDate,
  onDragComplete,
  onTaskClick,
  onRoutineEdit,
}: WeekViewAllProps) {
  const ctx = useResolvedContext();
  const tasks = useFafoStore((s) => s.tasks);
  const routines = useFafoStore((s) => s.routines);
  const people = useFafoStore((s) => s.people);

  const self = people.find((p) => p.isSelf) ?? people[0];
  const selfDefaultId = self?.id ?? "person-self";

  const weekStart = startOfWeek(selectedDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = todayISO();

  const colsPerDay = Math.max(1, people.length);
  const totalCols = 7 * colsPerDay;
  const gridTemplate = `repeat(${totalCols}, minmax(80px, 1fr))`;

  // Construir la lista de sub-columnas
  const subCols = useMemo(() => {
    const list: Array<{ day: string; person: Person; weekday: Weekday }> = [];
    for (const d of days) {
      const wd = parseISO(d).getDay() as Weekday;
      for (const p of people) {
        list.push({ day: d, person: p, weekday: wd });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, weekStart]);

  const [drag, setDrag] = useState<{
    subIndex: number;
    startY: number;
    currentY: number;
  } | null>(null);

  const onDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, idx: number) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const target = e.currentTarget;
      const rect = target.getBoundingClientRect();
      const y = e.clientY - rect.top;
      target.setPointerCapture(e.pointerId);
      setDrag({ subIndex: idx, startY: y, currentY: y });
    },
    []
  );

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const y = Math.max(0, Math.min(TOTAL_HEIGHT, e.clientY - rect.top));
      setDrag((d) => (d ? { ...d, currentY: y } : null));
    },
    [drag]
  );

  const onUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, idx: number) => {
      if (!drag) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const y = Math.max(0, Math.min(TOTAL_HEIGHT, e.clientY - rect.top));
      const a = snapHour(Math.min(drag.startY, y));
      const b = snapHour(Math.max(drag.startY, y));
      const sc = subCols[idx];
      setDrag(null);
      if (sc && b - a >= MIN_DURATION) {
        onDragComplete({
          startHour: a,
          endHour: b,
          personId: sc.person.id,
          weekday: sc.weekday,
        });
      }
    },
    [drag, subCols, onDragComplete]
  );

  return (
    <div className="flex flex-1 overflow-hidden bg-fafo-bg">
      {/* Time gutter */}
      <div className="w-16 shrink-0 border-r border-fafo-border bg-fafo-bg sticky left-0 z-20">
        <div className="h-14 border-b border-fafo-border flex flex-col items-center justify-center">
          <span className="text-sm">👥</span>
          <span className="text-[8px] uppercase tracking-wider text-fafo-accent2 font-semibold">
            Todos
          </span>
        </div>
        <div className="h-6 border-b border-fafo-border" />
        <div className="relative" style={{ height: TOTAL_HEIGHT }}>
          {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => {
            const h = HOUR_START + i;
            return (
              <div
                key={h}
                className="absolute right-2 text-[10px] text-fafo-muted tabular-nums"
                style={{ top: i * HOUR_HEIGHT - 6 }}
              >
                {hourLabel(h)}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-auto">
        {/* Sticky header con dia + sub-headers de personas */}
        <div className="sticky top-0 z-20 bg-fafo-panel/95 backdrop-blur">
          <div
            className="grid border-b border-fafo-border"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {days.map((d) => {
              const isToday = d === today;
              const isSelected = d === selectedDate;
              const date = parseISO(d);
              return (
                <button
                  key={`h-${d}`}
                  onClick={() => onSelectDate(d)}
                  className={clsx(
                    "h-14 border-r border-fafo-border flex flex-col items-center justify-center transition-colors hover:bg-fafo-panel",
                    isSelected && "ring-1 ring-inset ring-fafo-accent/60"
                  )}
                  style={{ gridColumn: `span ${colsPerDay}` }}
                >
                  <span className="text-[10px] uppercase tracking-wider text-fafo-muted">
                    {WEEKDAYS_SHORT[date.getDay()]}
                  </span>
                  <span
                    className={clsx(
                      "text-lg font-bold leading-none mt-0.5",
                      isToday ? "text-fafo-accent" : "text-fafo-text"
                    )}
                  >
                    {date.getDate()}
                  </span>
                </button>
              );
            })}
          </div>
          <div
            className="grid border-b border-fafo-border"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {subCols.map(({ day, person }) => (
              <div
                key={`sh-${day}-${person.id}`}
                className="h-6 border-r border-fafo-border flex items-center justify-center gap-1 text-[10px] truncate px-1"
                style={{ background: person.color + "22" }}
                title={person.name}
              >
                <span className="leading-none">{person.emoji}</span>
                <span
                  className="truncate font-semibold"
                  style={{ color: person.color }}
                >
                  {person.name.slice(0, 6)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Cuerpo: sub-columnas */}
        <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
          {subCols.map(({ day, person, weekday }, idx) => {
            const ptasks = tasks.filter((t) => {
              const owner = t.personId ?? selfDefaultId;
              if (owner !== person.id) return false;
              if (!t.weekdays.includes(weekday) && !t.isVital) return false;
              if (
                !t.isVital &&
                t.locationId &&
                t.locationId !== ctx.activeLocation?.id
              )
                return false;
              return true;
            });
            const proutines = routines.filter((r) => {
              const owner = r.personId ?? selfDefaultId;
              if (owner !== person.id) return false;
              if (!r.weekdays.includes(weekday)) return false;
              return true;
            });
            const isToday = day === today;
            const nowMarkerY =
              isToday && ctx.hour > HOUR_START && ctx.hour < HOUR_END
                ? (ctx.hour - HOUR_START) * HOUR_HEIGHT
                : null;
            const isFirstInDay = idx % colsPerDay === 0;

            return (
              <div
                key={`col-${day}-${person.id}`}
                className={clsx(
                  "relative border-r select-none",
                  isFirstInDay
                    ? "border-l-2 border-l-fafo-border/70 border-r-fafo-border"
                    : "border-r-fafo-border"
                )}
                style={{ height: TOTAL_HEIGHT }}
                onPointerDown={(e) => onDown(e, idx)}
                onPointerMove={onMove}
                onPointerUp={(e) => onUp(e, idx)}
                onPointerCancel={() => setDrag(null)}
                onDoubleClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const y = Math.max(
                    0,
                    Math.min(TOTAL_HEIGHT, e.clientY - rect.top)
                  );
                  const sh = snapHour(y);
                  const eh = Math.min(HOUR_END, sh + 1);
                  onDragComplete({
                    startHour: sh,
                    endHour: eh,
                    personId: person.id,
                    weekday,
                  });
                }}
              >
                {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 grid-hour"
                    style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                  >
                    <div
                      className="absolute left-0 right-0 grid-hour-half"
                      style={{ top: HOUR_HEIGHT / 2 }}
                    />
                  </div>
                ))}

                {proutines.map((r) => {
                  const rtop = (r.startHour - HOUR_START) * HOUR_HEIGHT;
                  const rh = (r.endHour - r.startHour) * HOUR_HEIGHT;
                  return (
                    <RoutineBlock
                      key={`${day}-${r.id}`}
                      routine={r}
                      top={rtop}
                      height={rh}
                      compact
                      onEdit={
                        onRoutineEdit ? () => onRoutineEdit(r.id) : undefined
                      }
                    />
                  );
                })}

                {ptasks.map((t) => {
                  const top = (t.startHour - HOUR_START) * HOUR_HEIGHT;
                  const height = Math.max(
                    22,
                    (t.endHour - t.startHour) * HOUR_HEIGHT - 4
                  );
                  return (
                    <TaskBlock
                      key={`${day}-${t.id}`}
                      task={t}
                      top={top}
                      height={height}
                      compact
                      routinesInScope={proutines}
                      onOpen={() => onTaskClick(t.id)}
                    />
                  );
                })}

                {drag && drag.subIndex === idx && (
                  <div
                    className="absolute left-1 right-1 drag-selection flex items-center justify-center"
                    style={{
                      top: Math.min(drag.startY, drag.currentY),
                      height: Math.abs(drag.currentY - drag.startY),
                    }}
                  >
                    <span className="text-[10px] text-fafo-text font-mono bg-fafo-panel/85 px-1.5 py-0.5 rounded">
                      {hourLabel(snapHour(Math.min(drag.startY, drag.currentY)))}
                    </span>
                  </div>
                )}

                {nowMarkerY !== null && (
                  <div
                    className="absolute left-0 right-0 pointer-events-none z-30"
                    style={{ top: nowMarkerY }}
                  >
                    <div className="h-px bg-fafo-accent shadow-[0_0_6px_rgba(221,116,147,0.55)]" />
                    <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-fafo-accent" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- MONTH VIEW ---------- */

function MonthView({ selectedDate, onSelectDate }: Props) {
  const tasks = useFafoStore((s) => s.tasks);
  const cells = monthGridDays(selectedDate);
  const today = todayISO();

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const c of cells) map.set(c, []);
    for (const t of tasks) {
      for (const c of cells) {
        const w = parseISO(c).getDay() as Weekday;
        if (t.isVital || t.weekdays.includes(w)) {
          map.get(c)!.push(t);
        }
      }
    }
    return map;
  }, [tasks, cells]);

  return (
    <div className="flex-1 overflow-auto bg-fafo-bg p-4">
      <div className="grid grid-cols-7 gap-px bg-fafo-border rounded-xl overflow-hidden border border-fafo-border max-w-6xl mx-auto">
        {["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"].map((d) => (
          <div
            key={d}
            className="bg-fafo-panel py-2.5 text-center text-[10px] uppercase tracking-widest text-fafo-muted font-semibold"
          >
            {d}
          </div>
        ))}

        {cells.map((iso) => {
          const date = parseISO(iso);
          const inMonth = isSameMonth(iso, selectedDate);
          const isToday = iso === today;
          const isSelected = iso === selectedDate;
          const ts = tasksByDay.get(iso) ?? [];
          const undone = ts.filter((t) => !t.done);
          const top3 = undone.slice(0, 3);

          return (
            <button
              key={iso}
              onClick={() => onSelectDate(iso)}
              className={clsx(
                "min-h-[90px] bg-fafo-bg text-left p-2 flex flex-col gap-1 transition-colors hover:bg-fafo-panel/60",
                !inMonth && "opacity-35",
                isSelected && "ring-2 ring-inset ring-fafo-accent",
                isToday && "bg-fafo-accent/5"
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={clsx(
                    "text-sm tabular-nums",
                    isToday
                      ? "text-fafo-accent font-bold"
                      : inMonth
                        ? "text-fafo-text"
                        : "text-fafo-muted"
                  )}
                >
                  {date.getDate()}
                </span>
                {undone.length > 0 && (
                  <span className="text-[9px] text-fafo-muted tabular-nums">
                    {undone.length}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                {top3.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-1 text-[10px] truncate"
                  >
                    <span
                      className={clsx(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        PRIORITY_DOT[t.priority]
                      )}
                    />
                    <span className="truncate">{t.name}</span>
                  </div>
                ))}
                {undone.length > 3 && (
                  <span className="text-[9px] text-fafo-muted">
                    +{undone.length - 3} mas
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <div className="text-center text-[11px] text-fafo-muted mt-4">
        Tap un dia para abrirlo en vista diaria.
      </div>
    </div>
  );
}
