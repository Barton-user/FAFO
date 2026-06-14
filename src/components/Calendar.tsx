"use client";

import { useFafoStore } from "@/lib/store";
import { useResolvedContext } from "@/lib/context";
import type { Task, Routine, Person, Weekday, ViewMode, Priority } from "@/lib/types";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  parseISO,
  startOfWeek,
  addDays,
  todayISO,
  formatDateLong,
  monthGridDays,
  isSameMonth,
  WEEKDAYS_SHORT,
} from "@/lib/dateUtils";
import { placeFlexTasksInDay } from "@/lib/flexPlacement";
import { isTaskDoneForDay, toggleDonePatch, taskAppliesOnDay } from "@/lib/taskState";
import clsx from "clsx";

const HOUR_START = 5;
const HOUR_END = 24;
const HOUR_HEIGHT = 52;
const TOTAL_HEIGHT = (HOUR_END - HOUR_START) * HOUR_HEIGHT;
const SNAP_MIN = 15;
const MIN_DURATION = 0.25;
const ALLDAY_BAND_HEIGHT = 56;

export interface DragPayload {
  startHour: number;
  endHour: number;
  personId: string;
  weekday: Weekday;
  /** Si la creacion ocurrio dentro del area visual de una rutina, dejamos
   * pre-seleccionado el id de esa rutina en el modal. */
  routineId?: string;
  /** "task" (default) abre el TaskModal. "routine" crea una rutina nueva
   * con esos horarios y abre su editor. Se setea cuando el usuario tenia
   * Shift presionado al soltar el drag. */
  kind?: "task" | "routine";
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
  1: "bg-[#F4A695] text-[#5C2D22]",
  2: "bg-[#F5CBA0] text-[#5E3920]",
  3: "bg-[#B8DBE8] text-[#22455E]",
  4: "bg-[#CFC6E0] text-[#382F50]",
  5: "bg-[#D4CFC9] text-[#4A453F]",
};

const PRIORITY_DOT: Record<number, string> = {
  0: "bg-[#DD7493]",
  1: "bg-[#D88677]",
  2: "bg-[#E89E5C]",
  3: "bg-[#5BACC4]",
  4: "bg-[#9B8FBC]",
  5: "bg-[#8A847C]",
};

const PRIORITY_LABEL: Record<number, string> = {
  0: "VITAL",
  1: "URGENTE",
  2: "IMPORTANTE",
  3: "NORMAL",
  4: "CUANDO PUEDAS",
  5: "ALGUN DIA",
};

export function Calendar(props: Props) {
  if (props.viewMode === "month") return <MonthView {...props} />;
  if (props.viewMode === "week") return <WeekView {...props} />;
  return <MiDiaView {...props} />;
}

/* ---------- PlacedFlexBlock — flex task ubicada automaticamente en la timeline ---------- */

interface PlacedFlexBlockProps {
  task: Task;
  top: number;
  height: number;
  dayISO: string;
  compact?: boolean;
  isOverdue?: boolean;
  onOpen: () => void;
}

function PlacedFlexBlock({
  task,
  top,
  height,
  dayISO,
  compact,
  isOverdue,
  onOpen,
}: PlacedFlexBlockProps) {
  const updateTask = useFafoStore((s) => s.updateTask);
  const isVital = task.isVital || task.priority === 0;
  const isDone = isTaskDoneForDay(task, dayISO);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        updateTask(task.id, toggleDonePatch(task, dayISO));
      }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ top, height }}
      className={clsx(
        "absolute text-left rounded-md shadow-sm overflow-hidden",
        "focus:outline-none focus:ring-2 focus:ring-fafo-accent",
        "border border-dashed",
        compact ? "left-1 right-1 p-1.5 text-[11px]" : "left-1.5 right-1.5 p-2 text-[12px]",
        // Estado: done → verde, overdue → rojo, default → pastel por prioridad
        isDone
          ? "bg-emerald-100 text-emerald-900 border-emerald-400 line-through"
          : isOverdue
            ? "bg-red-100 text-red-900 border-red-400 ring-1 ring-red-300"
            : clsx(
                "text-fafo-text",
                task.priority === 0 && "bg-[#FFE0E6] border-[#DD7493]/60",
                task.priority === 1 && "bg-[#FFE9D5] border-[#E89E5C]/60",
                task.priority === 2 && "bg-[#DFEEF5] border-[#5BACC4]/60",
                task.priority === 3 && "bg-[#EBE6F2] border-[#9B8FBC]/60"
              ),
        isVital && !isDone && !isOverdue && "vital-task",
        "hover:shadow-md transition-shadow cursor-pointer"
      )}
      title={`${task.name} · sin horario fijo`}
    >
      <div className="flex items-center gap-1 pointer-events-none">
        <span className="text-[8px] opacity-60">⋯</span>
        <span
          className={clsx(
            "w-1 h-1 rounded-full shrink-0",
            PRIORITY_DOT[task.priority]
          )}
        />
        <span className="font-semibold truncate leading-tight">
          {task.name}
        </span>
      </div>
    </button>
  );
}

/* ---------- FlexibleTaskChip ---------- */

interface FlexibleChipProps {
  task: Task;
  routines: Routine[];
  onOpen: () => void;
}

function FlexibleChip({ task, routines, onOpen }: FlexibleChipProps) {
  const toggleTask = useFafoStore((s) => s.toggleTask);
  const isVital = task.isVital || task.priority === 0;
  const parentRoutine = task.routineId
    ? routines.find((r) => r.id === task.routineId)
    : null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        toggleTask(task.id);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={clsx(
        "h-7 px-2 rounded-full text-[11px] font-medium shrink-0 cursor-pointer flex items-center gap-1.5 shadow-sm hover:shadow transition-shadow max-w-[200px]",
        PRIORITY_BG[task.priority],
        isVital && "vital-task ring-1 ring-white/70",
        task.done && "opacity-40 line-through grayscale"
      )}
      title={
        parentRoutine
          ? `${task.name} · en ${parentRoutine.name}`
          : task.name
      }
    >
      <span className="truncate">{task.name}</span>
      {parentRoutine && (
        <span className="text-[9px] opacity-75 truncate">
          ↳ {parentRoutine.name.slice(0, 10)}
        </span>
      )}
    </button>
  );
}

/* ---------- TaskBlock ---------- */

interface TaskBlockProps {
  task: Task;
  top: number;
  height: number;
  compact?: boolean;
  routinesInScope: Routine[];
  showOwnerEmoji?: boolean;
  isOverdue?: boolean;
  onOpen: () => void;
}

function TaskBlock({
  task,
  top,
  height,
  compact,
  routinesInScope,
  showOwnerEmoji,
  isOverdue,
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
        // Color: done → verde, overdue → rojo, default → prioridad
        task.done
          ? "bg-emerald-200 text-emerald-900 line-through"
          : isOverdue
            ? "bg-red-200 text-red-900 ring-2 ring-red-400"
            : PRIORITY_BG[task.priority],
        isVital && !task.done && !isOverdue && "vital-task ring-2 ring-white/80",
        drag
          ? "shadow-2xl ring-2 ring-fafo-text/40 z-40 cursor-grabbing scale-[1.02]"
          : "cursor-grab hover:shadow-xl transition-all z-20",
        nested && "border-l-[3px] border-fafo-text/30"
      )}
      style={{ top: displayTop, height: displayHeight }}
      title="Click checkbox: marcar hecha · arrastra para mover · borde para redimensionar"
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
      <div className="font-semibold truncate leading-tight flex items-center gap-1.5">
        {/* Checkbox para marcar hecha. Stop propagation en pointerDown para
         * que no se inicie el drag del bloque entero. */}
        <span
          role="checkbox"
          aria-checked={task.done}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            toggleTask(task.id);
          }}
          className={clsx(
            "rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer transition-colors",
            compact ? "w-4 h-4 text-[10px]" : "w-5 h-5 text-xs",
            task.done
              ? "bg-fafo-accent2 border-fafo-accent2 text-white"
              : "border-current/50 hover:bg-white/30"
          )}
          title={task.done ? "Marcar pendiente" : "Marcar hecha"}
        >
          {task.done && <span className="leading-none">✓</span>}
        </span>
        {compact && nested && (
          <span className="opacity-70 pointer-events-none">↳</span>
        )}
        {compact && owner && (
          <span
            className="text-[10px] leading-none pointer-events-none"
            title={owner.name}
          >
            {owner.emoji}
          </span>
        )}
        <span className="truncate pointer-events-none">{task.name}</span>
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
  /** Chips flex que el usuario quiere ANTES (arriba) del bloque de timed. */
  flexBefore?: Task[];
  /** Chips flex que el usuario quiere DESPUES (abajo) del bloque de timed. */
  flexAfter?: Task[];
  /** Id de la primera tarea con horario de la rutina (en orden de array).
   * Lo usamos como anchor cuando se suelta un chip en la zona "before". */
  firstTimedId?: string;
  /** Id de la ultima tarea con horario de la rutina (en orden de array).
   * Anchor para la zona "after". */
  lastTimedId?: string;
  /** Rangos verticales (px, relativos al top del bloque de rutina) ocupados por
   * tareas con horario que estan dentro de esta rutina. Sirve para que las flex
   * tasks no se posicionen "abajo" o "encima" de ellas. */
  scheduledRanges?: Array<{ top: number; height: number }>;
  /** Si esta seteado, se usa como hora "ahora" para marcar las flex internas como vencidas
   * (typicamente ctx.hour si dayISO == today, sino null). */
  routineOverdueRef?: number | null;
  /** ISO date del dia que renderiza este bloque. Necesario para soportar drag
   * cross-day de chips: si soltas una tarea de otro dia en esta rutina, sus
   * weekdays se reemplazan por el weekday de dayISO. */
  dayISO?: string;
  onEdit?: () => void;
  onFlexTaskOpen?: (taskId: string) => void;
}

function RoutineBlock({
  routine,
  top,
  height,
  compact,
  flexBefore,
  flexAfter,
  firstTimedId,
  lastTimedId,
  scheduledRanges,
  routineOverdueRef,
  dayISO,
  onEdit,
  onFlexTaskOpen,
}: RoutineBlockProps) {
  const updateRoutine = useFafoStore((s) => s.updateRoutine);
  const shiftRoutine = useFafoStore((s) => s.shiftRoutine);
  const deleteRoutine = useFafoStore((s) => s.deleteRoutine);
  const reorderTask = useFafoStore((s) => s.reorderTask);
  const moveTaskAfter = useFafoStore((s) => s.moveTaskAfter);
  const updateTask = useFafoStore((s) => s.updateTask);
  const tasks = useFafoStore((s) => s.tasks);

  // Estado de drag reorder de chips internos
  const [chipDraggingId, setChipDraggingId] = useState<string | null>(null);
  const [chipDragOverId, setChipDragOverId] = useState<string | null>(null);
  // Hover en una de las zonas vacias (arriba/abajo del bloque de timed),
  // para drop "mover a este lado".
  const [zoneHover, setZoneHover] = useState<"before" | "after" | null>(null);

  // Estado para drop cross-rutina: cuando hay un drag de tarea activo
  // EN CUALQUIER LADO del documento, activamos un drop zone que cubre el
  // bloque de rutina para que se pueda soltar adentro. Usamos eventos
  // globales de dragstart/dragend para no acoplar componentes.
  const [anyTaskDragging, setAnyTaskDragging] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  useEffect(() => {
    const onStart = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("text/task-id")) {
        setAnyTaskDragging(true);
      }
    };
    const onEnd = () => {
      setAnyTaskDragging(false);
      setIsDropTarget(false);
    };
    document.addEventListener("dragstart", onStart);
    document.addEventListener("dragend", onEnd);
    document.addEventListener("drop", onEnd);
    return () => {
      document.removeEventListener("dragstart", onStart);
      document.removeEventListener("dragend", onEnd);
      document.removeEventListener("drop", onEnd);
    };
  }, []);

  // Lanza la mutacion correspondiente cuando se suelta una tarea sobre
  // este bloque (en area vacia) o sobre un chip de este bloque
  // (cross-rutina o cross-day). Anchor opcional: si se solto sobre un
  // chip especifico, lo usamos para reorder relativo a el.
  const handleTaskDrop = (srcId: string, anchorTaskId?: string) => {
    if (!srcId) return;
    const srcTask = tasks.find((x) => x.id === srcId);
    if (!srcTask) return;
    const patch: Partial<Task> = {};
    if (srcTask.routineId !== routine.id) {
      patch.routineId = routine.id;
    }
    if (dayISO) {
      const targetWeekday = parseISO(dayISO).getDay() as Weekday;
      if (!srcTask.weekdays.includes(targetWeekday)) {
        // Mismo patron que TodoPanel cross-day: replaza weekdays con el dia
        // destino. Si la tarea era recurrente en varios dias, queda solo en
        // el dia donde la soltaste.
        patch.weekdays = [targetWeekday];
      }
    }
    if (Object.keys(patch).length > 0) {
      updateTask(srcId, patch);
    }
    if (anchorTaskId && anchorTaskId !== srcId) {
      reorderTask(srcId, anchorTaskId);
    }
  };

  // Anclar / desanclar una tarea de la rutina.
  // - Anclada (recurringInRoutine): se repite SIEMPRE que aparece la rutina
  //   (toma los weekdays de la rutina) y se rehace cada iteracion.
  // - No anclada: tarea de ese dia puntual (specificDate), no se repite.
  const toggleAnchor = (t: Task) => {
    const iso = dayISO ?? todayISO();
    if (t.recurringInRoutine) {
      // desanclar -> tarea unica de este dia puntual
      updateTask(t.id, {
        recurringInRoutine: false,
        specificDate: iso,
        weekdays: [parseISO(iso).getDay() as Weekday],
        done: false,
        completedAt: undefined,
      });
    } else {
      // anclar -> se repite siempre en la rutina
      updateTask(t.id, {
        recurringInRoutine: true,
        specificDate: undefined,
        weekdays: routine.weekdays,
        done: false,
        completedAt: undefined,
      });
    }
  };

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
      className={clsx(
        "absolute left-1 right-1 rounded-lg group/r z-0 transition-shadow",
        // Cuando hay un drag de tarea activo, volvemos el bloque pointer-events-auto
        // asi onDrop puede dispararse en el (incluyendo en areas vacias y en
        // el background fill). Cuando no hay drag, el bloque sigue siendo
        // transparente a clicks/dblclicks para que el day column de atras
        // reciba "doble click crea tarea" en el area vacia de la rutina.
        anyTaskDragging ? "pointer-events-auto" : "pointer-events-none",
        isDropTarget &&
          anyTaskDragging &&
          "ring-2 ring-fafo-accent ring-offset-1 ring-offset-fafo-bg shadow-lg"
      )}
      style={{ top: displayTop, height: displayHeight }}
      onDragOver={
        anyTaskDragging
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setIsDropTarget(true);
            }
          : undefined
      }
      onDragLeave={
        anyTaskDragging ? () => setIsDropTarget(false) : undefined
      }
      onDrop={
        anyTaskDragging
          ? (e) => {
              e.preventDefault();
              const srcId = e.dataTransfer.getData("text/task-id");
              handleTaskDrop(srcId);
              setIsDropTarget(false);
            }
          : undefined
      }
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

      {/* Dos zonas de flex chips dentro de la rutina:
       * - "before": arriba del bloque de timed (entre el header y la primera timed)
       * - "after":  abajo del bloque de timed (entre la ultima timed y el footer)
       * Las timed mantienen su posicion por hora. El usuario puede arrastrar
       * un chip de una zona a la otra para elegir el lado. */}
      {(() => {
        const HEADER_PAD = 36; // espacio del chip del nombre
        const FOOTER_PAD = 8;
        const ranges = scheduledRanges ?? [];
        const scheduledTop = ranges.length
          ? ranges.reduce((min, r) => Math.min(min, r.top), Infinity)
          : null;
        const scheduledBottom = ranges.length
          ? ranges.reduce((max, r) => Math.max(max, r.top + r.height), 0)
          : null;

        const hasTimed = ranges.length > 0;

        // Bounds zona "before" (arriba del bloque de timed). Solo existe si
        // hay timed; si no hay, esta zona se colapsa.
        const beforeTop = HEADER_PAD;
        const beforeBottomLimit = hasTimed
          ? (scheduledTop ?? HEADER_PAD) - 4
          : HEADER_PAD; // colapsa a 0 cuando no hay timed
        const beforeHeight = Math.max(0, beforeBottomLimit - beforeTop);

        // Bounds zona "after" (abajo del bloque de timed). Si NO hay timed,
        // esta zona ocupa todo el bloque util.
        const afterTop = hasTimed
          ? (scheduledBottom ?? HEADER_PAD) + 4
          : HEADER_PAD;
        const afterHeight = Math.max(0, displayHeight - afterTop - FOOTER_PAD);

        // Cuando NO hay timed, ponemos todos los chips en la zona "after"
        // (que en ese caso ocupa todo). Asi nunca quedan pisados.
        const beforeList = hasTimed ? flexBefore ?? [] : [];
        const afterList = hasTimed
          ? flexAfter ?? []
          : [...(flexBefore ?? []), ...(flexAfter ?? [])];

        const renderChip = (t: Task) => {
          const isDone = isTaskDoneForDay(t, dayISO ?? todayISO());
          const isOverdue =
            !isDone && routineOverdueRef && routine.endHour <= routineOverdueRef;
          const isDragging = chipDraggingId === t.id;
          const isDragOver =
            chipDragOverId === t.id && chipDraggingId !== t.id;
          return (
            <button
              key={t.id}
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData("text/task-id", t.id);
                e.dataTransfer.effectAllowed = "move";
                setChipDraggingId(t.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "move";
                setChipDragOverId(t.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const srcId = e.dataTransfer.getData("text/task-id");
                if (srcId && srcId !== t.id) handleTaskDrop(srcId, t.id);
                setChipDraggingId(null);
                setChipDragOverId(null);
                setZoneHover(null);
              }}
              onDragEnd={() => {
                setChipDraggingId(null);
                setChipDragOverId(null);
                setZoneHover(null);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => {
                e.stopPropagation();
                updateTask(t.id, toggleDonePatch(t, dayISO ?? todayISO()));
              }}
              onClick={(e) => {
                e.stopPropagation();
                onFlexTaskOpen?.(t.id);
              }}
              className={clsx(
                "pointer-events-auto rounded-lg flex items-center gap-3 shadow-md hover:shadow-lg transition-all shrink-0 max-w-full text-left cursor-move",
                "ring-1 ring-fafo-text/5",
                compact
                  ? "px-2 py-1.5 text-[11px] gap-1.5"
                  : "px-3 py-3 text-[15px] md:px-2.5 md:py-2 md:text-[13px] md:gap-1.5",
                isDone
                  ? "bg-emerald-200 text-emerald-900 line-through"
                  : isOverdue
                    ? "bg-red-200 text-red-900 ring-1 ring-red-400"
                    : "bg-fafo-panel/95 text-fafo-text",
                isDragging && "opacity-30",
                isDragOver &&
                  "ring-2 ring-fafo-accent border-t-2 border-fafo-accent"
              )}
              title={`${t.name}${isDone ? " (hecha)" : isOverdue ? " (vencida)" : ""} · click: editar · doble click: marcar · arrastra para reordenar`}
            >
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  updateTask(t.id, toggleDonePatch(t, dayISO ?? todayISO()));
                }}
                className={clsx(
                  "rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer",
                  compact
                    ? "w-4 h-4 text-[10px]"
                    : "w-5 h-5 text-xs md:w-4 md:h-4 md:text-[10px]",
                  isDone
                    ? "bg-fafo-accent2 border-fafo-accent2 text-white"
                    : "border-fafo-muted/60 hover:border-fafo-accent"
                )}
              >
                {isDone && <span className="leading-none">✓</span>}
              </span>
              <span
                className={clsx(
                  "rounded-full shrink-0",
                  PRIORITY_DOT[t.priority],
                  compact ? "w-1.5 h-1.5" : "w-2 h-2 md:w-1.5 md:h-1.5"
                )}
              />
              <span className="truncate font-medium flex-1">{t.name}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleAnchor(t);
                }}
                className={clsx(
                  "shrink-0 w-4 text-center text-sm leading-none rounded cursor-pointer select-none transition-colors",
                  t.recurringInRoutine
                    ? "text-fafo-accent hover:text-fafo-accent/70"
                    : "text-fafo-muted/35 hover:text-fafo-muted"
                )}
                title={
                  t.recurringInRoutine
                    ? "Anclada: se repite siempre en esta rutina. Click para desanclar (solo este dia)."
                    : "No anclada: solo este dia, no se repite. Click para anclar."
                }
              >
                ⚓
              </span>
            </button>
          );
        };

        // Handler para drop en una zona "vacia" (no sobre un chip).
        // Mueve el chip al lado correspondiente respecto del bloque de timed
        // (o al final de la lista flex si no hay timed adentro).
        const handleZoneDrop = (zone: "before" | "after") =>
          (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const srcId = e.dataTransfer.getData("text/task-id");
            setChipDraggingId(null);
            setChipDragOverId(null);
            setZoneHover(null);
            if (!srcId) return;
            // Aseguro que el chip pertenezca a esta rutina y a este dia
            handleTaskDrop(srcId);
            // Reordeno en el array para que quede al final del lado pedido.
            // Excluyo el propio src del calculo del ancla para evitar
            // self-anchor que dejaria la tarea en el mismo lugar.
            if (zone === "before") {
              const beforeNoSrc = beforeList.filter((x) => x.id !== srcId);
              const beforeAnchor = beforeNoSrc.length
                ? beforeNoSrc[beforeNoSrc.length - 1].id
                : null;
              if (beforeAnchor) {
                moveTaskAfter(srcId, beforeAnchor);
              } else if (firstTimedId && srcId !== firstTimedId) {
                reorderTask(srcId, firstTimedId);
              }
            } else {
              const afterNoSrc = afterList.filter((x) => x.id !== srcId);
              const afterAnchor = afterNoSrc.length
                ? afterNoSrc[afterNoSrc.length - 1].id
                : lastTimedId ?? null;
              if (afterAnchor && srcId !== afterAnchor) {
                moveTaskAfter(srcId, afterAnchor);
              }
            }
          };

        const zoneDragOver = (zone: "before" | "after") =>
          (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            setZoneHover(zone);
          };

        // Activamos las zonas de drop siempre que haya un drag en curso.
        // Antes solo se activaban si la rutina tenia tareas con horario
        // adentro (hasTimed), lo cual dejaba imposible arrastrar un chip al
        // final cuando la rutina solo tenia chips flex.
        const showZones = anyTaskDragging;

        return (
          <>
            {/* Zona "before" — arriba del bloque de timed */}
            {(beforeList.length > 0 || (showZones && beforeHeight >= 24)) && (
              <div
                className={clsx(
                  "absolute left-2 right-2 flex flex-col gap-1.5 overflow-y-auto md:left-1.5 md:right-1.5 md:gap-1 transition-colors rounded",
                  showZones && "pointer-events-auto",
                  !showZones && "pointer-events-none",
                  zoneHover === "before" &&
                    "bg-fafo-accent/10 outline outline-2 outline-dashed outline-fafo-accent"
                )}
                style={{ top: beforeTop, height: beforeHeight }}
                onDragOver={showZones ? zoneDragOver("before") : undefined}
                onDragLeave={
                  showZones ? () => setZoneHover(null) : undefined
                }
                onDrop={showZones ? handleZoneDrop("before") : undefined}
              >
                {beforeList.map(renderChip)}
              </div>
            )}

            {/* Zona "after" — abajo del bloque de timed (o todo el bloque si no hay timed) */}
            {(afterList.length > 0 || (showZones && afterHeight >= 24)) && (
              <div
                className={clsx(
                  "absolute left-2 right-2 flex flex-col gap-1.5 overflow-y-auto md:left-1.5 md:right-1.5 md:gap-1 transition-colors rounded",
                  showZones && "pointer-events-auto",
                  !showZones && "pointer-events-none",
                  zoneHover === "after" &&
                    "bg-fafo-accent/10 outline outline-2 outline-dashed outline-fafo-accent"
                )}
                style={{ top: afterTop, height: afterHeight }}
                onDragOver={showZones ? zoneDragOver("after") : undefined}
                onDragLeave={
                  showZones ? () => setZoneHover(null) : undefined
                }
                onDrop={showZones ? handleZoneDrop("after") : undefined}
              >
                {afterList.map(renderChip)}
              </div>
            )}
          </>
        );
      })()}

      {/* Live label while dragging */}
      {drag && (
        <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 text-[10px] font-mono bg-fafo-panel/95 text-fafo-text px-2 py-1 rounded shadow pointer-events-none">
          {liveLabel}
        </div>
      )}
    </div>
  );
}

/* ---------- MI DIA VIEW — lista vertical por rutina (un dia) ---------- */

function MiDiaView({
  selectedDate,
  viewingPersonId,
  onTaskClick,
  onRoutineEdit,
}: Props) {
  const ctx = useResolvedContext();
  const tasks = useFafoStore((s) => s.tasks);
  const routines = useFafoStore((s) => s.routines);
  const people = useFafoStore((s) => s.people);
  const updateTask = useFafoStore((s) => s.updateTask);
  const addTask = useFafoStore((s) => s.addTask);
  const reorderTask = useFafoStore((s) => s.reorderTask);

  const weekday = parseISO(selectedDate).getDay() as Weekday;
  const isToday = selectedDate === todayISO();

  const isAll = viewingPersonId === "__all__";
  const self = people.find((p) => p.isSelf) ?? people[0];
  const selfDefaultId = self?.id ?? "person-self";
  const personId =
    !isAll && viewingPersonId && people.find((p) => p.id === viewingPersonId)
      ? viewingPersonId
      : selfDefaultId;
  const viewingPerson = people.find((p) => p.id === personId) ?? self;

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Tareas que aplican este dia para la persona enfocada
  const visibleTasks = useMemo(() => {
    const result: Task[] = [];
    for (const t of tasks) {
      const ownerId = t.personId ?? selfDefaultId;
      if (ownerId !== personId) continue;
      if (!taskAppliesOnDay(t, selectedDate, weekday)) continue;
      if (
        !t.isVital &&
        t.locationId &&
        t.locationId !== ctx.activeLocation?.id
      )
        continue;
      result.push(t);
    }
    return result;
  }, [
    tasks,
    weekday,
    personId,
    selfDefaultId,
    selectedDate,
    ctx.activeLocation,
  ]);

  const activeRoutines = useMemo(() => {
    return routines
      .filter((r) => {
        if (!r.weekdays.includes(weekday)) return false;
        const ownerId = r.personId ?? selfDefaultId;
        return ownerId === personId;
      })
      .sort((a, b) => a.startHour - b.startHour);
  }, [routines, weekday, personId, selfDefaultId]);

  const groups = useMemo(() => {
    const out: Array<{
      key: string;
      routine: Routine | null;
      tasks: Task[];
    }> = [];
    const accounted = new Set<string>();
    for (const r of activeRoutines) {
      const items = visibleTasks.filter((t) => t.routineId === r.id);
      items.forEach((t) => accounted.add(t.id));
      out.push({ key: r.id, routine: r, tasks: items });
    }
    const orphans = visibleTasks.filter((t) => !accounted.has(t.id));
    out.push({ key: "__orphans__", routine: null, tasks: orphans });
    return out;
  }, [visibleTasks, activeRoutines]);

  const totalToday = visibleTasks.length;
  const doneToday = visibleTasks.filter((t) =>
    isTaskDoneForDay(t, selectedDate)
  ).length;
  const nowRef = isToday ? ctx.hour : null;

  const nothing =
    activeRoutines.length === 0 && groups.every((g) => g.tasks.length === 0);

  return (
    <div className="flex-1 overflow-auto bg-fafo-bg">
      <div className="max-w-3xl mx-auto px-4 py-5 space-y-3">
        {/* Encabezado */}
        <div className="flex items-baseline justify-between gap-3 pb-1">
          <div className="min-w-0">
            <div
              className={clsx(
                "text-2xl font-black tracking-tight capitalize leading-none truncate",
                isToday ? "text-fafo-accent" : "text-fafo-text"
              )}
            >
              {isToday ? "Mi dia" : formatDateLong(selectedDate)}
            </div>
            <div className="text-xs text-fafo-muted capitalize mt-1 truncate">
              {formatDateLong(selectedDate)}
              {!isAll && viewingPerson && !viewingPerson.isSelf
                ? ` · ${viewingPerson.emoji} ${viewingPerson.name}`
                : ""}
              {ctx.activeLocation
                ? ` · ${ctx.activeLocation.emoji} ${ctx.activeLocation.name}`
                : ""}
            </div>
          </div>
          {totalToday > 0 && (
            <div className="text-sm text-fafo-muted tabular-nums shrink-0">
              <span className="text-fafo-accent2 font-bold">{doneToday}</span>/
              {totalToday}
            </div>
          )}
        </div>

        {nothing ? (
          <div className="text-center py-20 text-fafo-muted">
            <div className="text-5xl mb-3 opacity-40">{"\u{1F331}"}</div>
            <div className="text-sm">No hay nada para este dia.</div>
            <div className="text-xs mt-1 opacity-70">
              Agregá una tarea abajo con el +
            </div>
          </div>
        ) : (
          groups.map((g) => (
            <MiDiaSection
              key={g.key}
              routine={g.routine}
              tasks={g.tasks}
              dayISO={selectedDate}
              nowRef={nowRef}
              draggingId={draggingId}
              dragOverId={dragOverId}
              onAdd={(name, anchored) => {
                if (g.routine) {
                  addTask({
                    name,
                    priority: 2 as Priority,
                    weekdays: anchored ? g.routine.weekdays : [weekday],
                    startHour: g.routine.startHour,
                    endHour: g.routine.endHour,
                    personId: g.routine.personId ?? personId,
                    routineId: g.routine.id,
                    flexible: true,
                    recurringInRoutine: anchored,
                    specificDate: anchored ? undefined : selectedDate,
                  });
                } else {
                  addTask({
                    name,
                    priority: 2 as Priority,
                    weekdays: [weekday],
                    startHour: 9,
                    endHour: 10,
                    personId,
                    flexible: true,
                  });
                }
              }}
              onToggle={(t) =>
                updateTask(t.id, toggleDonePatch(t, selectedDate))
              }
              onOpen={(t) => onTaskClick(t.id)}
              onToggleAnchor={(t) => {
                const r = g.routine;
                if (!r) return;
                if (t.recurringInRoutine) {
                  updateTask(t.id, {
                    recurringInRoutine: false,
                    specificDate: selectedDate,
                    weekdays: [weekday],
                    done: false,
                    completedAt: undefined,
                  });
                } else {
                  updateTask(t.id, {
                    recurringInRoutine: true,
                    specificDate: undefined,
                    weekdays: r.weekdays,
                    done: false,
                    completedAt: undefined,
                  });
                }
              }}
              onEditRoutine={
                g.routine && onRoutineEdit
                  ? () => onRoutineEdit(g.routine!.id)
                  : undefined
              }
              onDragStart={(id) => setDraggingId(id)}
              onDragOverItem={(id) => setDragOverId(id)}
              onDropItem={(targetId) => {
                if (draggingId && draggingId !== targetId)
                  reorderTask(draggingId, targetId);
                setDraggingId(null);
                setDragOverId(null);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setDragOverId(null);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function MiDiaSection({
  routine,
  tasks,
  dayISO,
  nowRef,
  draggingId,
  dragOverId,
  onAdd,
  onToggle,
  onOpen,
  onToggleAnchor,
  onEditRoutine,
  onDragStart,
  onDragOverItem,
  onDropItem,
  onDragEnd,
}: {
  routine: Routine | null;
  tasks: Task[];
  dayISO: string;
  nowRef: number | null;
  draggingId: string | null;
  dragOverId: string | null;
  onAdd: (name: string, anchored: boolean) => void;
  onToggle: (t: Task) => void;
  onOpen: (t: Task) => void;
  onToggleAnchor: (t: Task) => void;
  onEditRoutine?: () => void;
  onDragStart: (id: string) => void;
  onDragOverItem: (id: string) => void;
  onDropItem: (targetId: string) => void;
  onDragEnd: () => void;
}) {
  const [name, setName] = useState("");
  const [anchored, setAnchored] = useState(false);
  const overdue =
    routine != null && nowRef != null && routine.endHour <= nowRef;
  const done = tasks.filter((t) => isTaskDoneForDay(t, dayISO)).length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    onAdd(n, anchored);
    setName("");
  }

  return (
    <section
      className="border rounded-2xl overflow-hidden shadow-sm bg-fafo-panel border-fafo-border"
      style={
        routine
          ? {
              backgroundColor: `${routine.color}12`,
              borderColor: `${routine.color}40`,
            }
          : undefined
      }
    >
      <div
        className="px-4 py-2.5 flex items-center gap-2"
        style={{
          backgroundColor: routine
            ? `${routine.color}26`
            : "rgb(var(--panel2) / 0.4)",
        }}
      >
        <span
          className="w-1.5 h-5 rounded-full shrink-0"
          style={{ background: routine?.color ?? "#9B8FBC" }}
        />
        <button
          onClick={onEditRoutine}
          disabled={!onEditRoutine}
          className={clsx(
            "text-sm font-bold uppercase tracking-wider text-fafo-text text-left truncate",
            onEditRoutine && "hover:text-fafo-accent cursor-pointer"
          )}
          title={routine ? "Editar rutina" : undefined}
        >
          {routine ? routine.name : "Otras tareas"}
        </button>
        {routine && (
          <span className="text-[10px] text-fafo-muted tabular-nums shrink-0">
            {fmtTime(routine.startHour)}–{fmtTime(routine.endHour)}
          </span>
        )}
        {overdue && (
          <span className="text-[9px] uppercase tracking-wider text-red-500 font-bold shrink-0">
            vencida
          </span>
        )}
        <span className="ml-auto text-[11px] text-fafo-muted tabular-nums shrink-0">
          {done}/{tasks.length}
        </span>
      </div>

      {tasks.length > 0 && (
        <ul>
          {tasks.map((t) => (
            <MiDiaRow
              key={t.id}
              task={t}
              routine={routine}
              dayISO={dayISO}
              isDragging={draggingId === t.id}
              isDragOver={dragOverId === t.id && draggingId !== t.id}
              onToggle={() => onToggle(t)}
              onOpen={() => onOpen(t)}
              onToggleAnchor={() => onToggleAnchor(t)}
              onDragStart={() => onDragStart(t.id)}
              onDragOver={() => onDragOverItem(t.id)}
              onDrop={() => onDropItem(t.id)}
              onDragEnd={onDragEnd}
            />
          ))}
        </ul>
      )}

      <form
        onSubmit={submit}
        className="flex items-center gap-2 px-4 py-2.5 border-t border-fafo-border/30"
      >
        <span
          className={clsx(
            "w-5 h-5 rounded-full border-2 flex items-center justify-center text-sm shrink-0",
            name.trim()
              ? "border-fafo-accent text-fafo-accent"
              : "border-fafo-muted/40 text-fafo-muted/40"
          )}
        >
          +
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={routine ? "Agregar a esta rutina" : "Agregar una tarea"}
          className="flex-1 bg-transparent outline-none text-sm py-1 placeholder:text-fafo-muted/60"
        />
        {routine && (
          <label
            className="flex items-center gap-1 text-[10px] text-fafo-muted cursor-pointer select-none shrink-0"
            title="Anclada: se repite siempre en esta rutina. Sin anclar: solo este dia."
          >
            <input
              type="checkbox"
              checked={anchored}
              onChange={(e) => setAnchored(e.target.checked)}
              className="accent-fafo-accent w-3 h-3"
            />
            <span className={anchored ? "text-fafo-accent font-semibold" : ""}>
              {"⚓"} anclar
            </span>
          </label>
        )}
        {name.trim() && (
          <button
            type="submit"
            className="text-xs px-3 py-1 rounded-md bg-fafo-accent text-white font-semibold shrink-0"
          >
            Add
          </button>
        )}
      </form>
    </section>
  );
}

function MiDiaRow({
  task,
  routine,
  dayISO,
  isDragging,
  isDragOver,
  onToggle,
  onOpen,
  onToggleAnchor,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  task: Task;
  routine: Routine | null;
  dayISO: string;
  isDragging: boolean;
  isDragOver: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onToggleAnchor: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const isDone = isTaskDoneForDay(task, dayISO);
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
        onDrop();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={clsx(
        "px-4 py-2.5 flex items-center gap-3 border-t border-fafo-border/30 cursor-pointer hover:bg-fafo-panel2/30 transition-colors",
        isDragging && "opacity-30",
        isDragOver && "border-t-2 border-t-fafo-accent"
      )}
    >
      <span className="text-fafo-muted/30 text-xs select-none shrink-0 hidden sm:inline">
        {"⋮⋮"}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={clsx(
          "shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs transition-all",
          isDone
            ? "bg-fafo-accent2 border-fafo-accent2 text-white"
            : "border-fafo-muted/60 hover:border-fafo-accent"
        )}
        aria-label="Toggle"
      >
        {isDone && <span className="leading-none">{"✓"}</span>}
      </button>
      <span
        className={clsx(
          "w-2 h-2 rounded-full shrink-0",
          PRIORITY_DOT[task.priority]
        )}
      />
      <span
        className={clsx(
          "flex-1 min-w-0 truncate text-[15px] font-medium",
          isDone && "line-through text-fafo-muted"
        )}
      >
        {task.name}
      </span>

      {routine && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onToggleAnchor();
          }}
          className={clsx(
            "shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded cursor-pointer select-none transition-colors",
            task.recurringInRoutine
              ? "bg-fafo-accent/15 text-fafo-accent hover:bg-fafo-accent/25"
              : "text-fafo-muted/70 border border-fafo-border/70 hover:text-fafo-text hover:border-fafo-text/40"
          )}
          title={
            task.recurringInRoutine
              ? "Anclada: se repite siempre en esta rutina. Click para desanclar (solo este dia)."
              : "No anclada: solo este dia, no se repite. Click para anclar."
          }
        >
          {task.recurringInRoutine ? "⚓ Anclada" : "⚲ No anclada"}
        </span>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className={clsx(
          "shrink-0 text-xl leading-none w-7 h-7 flex items-center justify-center",
          isVital ? "text-fafo-accent" : "text-fafo-muted/25"
        )}
        aria-label="Vital"
        title={isVital ? "Vital" : "Abrir"}
      >
        {isVital ? "★" : "☆"}
      </button>
    </li>
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

  // Auto-scroll a la hora actual
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const didScrollRef = useRef(false);
  useEffect(() => {
    didScrollRef.current = false;
  }, [selectedDate]);
  useEffect(() => {
    if (!scrollRef.current || didScrollRef.current) return;
    const hasToday = days.includes(today);
    const targetHour = hasToday ? Math.max(HOUR_START, ctx.hour - 1) : 8;
    scrollRef.current.scrollTop = (targetHour - HOUR_START) * HOUR_HEIGHT;
    didScrollRef.current = true;
  }, [days, today, ctx.hour]);

  // Tareas con horario SIN rutina -> bloques en la grilla. Las tareas con
  // rutina ya NO van como bloque: van como chip simple dentro de la rutina.
  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const d of days) map.set(d, []);
    for (const t of tasks) {
      if (t.flexible) continue;
      if (t.routineId) continue;
      const ownerId = t.personId ?? selfDefaultId;
      if (!isAll && ownerId !== selfId) continue;
      for (const d of days) {
        const w = parseISO(d).getDay() as Weekday;
        if (!taskAppliesOnDay(t, d, w)) continue;
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

  // Banda superior: solo flexibles SIN routineId
  const flexibleByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const d of days) map.set(d, []);
    for (const t of tasks) {
      if (!t.flexible) continue;
      if (t.routineId) continue;
      const ownerId = t.personId ?? selfDefaultId;
      if (!isAll && ownerId !== selfId) continue;
      for (const d of days) {
        const w = parseISO(d).getDay() as Weekday;
        if (!taskAppliesOnDay(t, d, w)) continue;
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

  // TODAS las tareas con routineId (flex o con horario): se muestran como
  // chips simples uniformes dentro del bloque de la rutina. Agrupadas por
  // dia + routine.
  const tasksByDayRoutine = useMemo(() => {
    const map = new Map<string, Map<string, Task[]>>();
    for (const d of days) map.set(d, new Map());
    for (const t of tasks) {
      if (!t.routineId) continue;
      const ownerId = t.personId ?? selfDefaultId;
      if (!isAll && ownerId !== selfId) continue;
      for (const d of days) {
        const w = parseISO(d).getDay() as Weekday;
        if (!taskAppliesOnDay(t, d, w)) continue;
        if (
          !t.isVital &&
          t.locationId &&
          t.locationId !== ctx.activeLocation?.id
        )
          continue;
        const perDay = map.get(d)!;
        if (!perDay.has(t.routineId)) perDay.set(t.routineId, []);
        perDay.get(t.routineId)!.push(t);
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
        const wantsRoutine = e.shiftKey;
        const dragRoutines = routinesByDay.get(drag.dayISO) ?? [];
        const container = findContainingRoutine(dragRoutines, a, b);
        onDragComplete({
          startHour: a,
          endHour: b,
          personId: selfId,
          weekday,
          routineId: wantsRoutine ? undefined : container?.id,
          kind: wantsRoutine ? "routine" : "task",
        });
      }
    },
    [drag, onDragComplete, selfId, routinesByDay]
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
    <div ref={scrollRef} className="flex flex-1 overflow-auto bg-fafo-bg">
      {/* Time gutter: sticky-left dentro del scroll, scrollea verticalmente con el contenido */}
      <div className="hidden md:block w-16 shrink-0 border-r border-fafo-border bg-fafo-bg sticky left-0 z-30">
        <div className="h-14 border-b border-fafo-border flex flex-col items-center justify-center bg-fafo-bg sticky top-0 z-10">
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

      <div className="flex-1 min-w-0">
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
                  "h-14 border-b border-r border-fafo-border flex flex-col items-center justify-center sticky top-0 bg-fafo-panel/95 backdrop-blur z-30 transition-colors hover:bg-fafo-panel",
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
                  const container = findContainingRoutine(
                    droutines,
                    startHour,
                    endHour
                  );
                  onDragComplete({
                    startHour,
                    endHour,
                    personId: selfId,
                    weekday: wd,
                    routineId: container?.id,
                  });
                }}
              >
                {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 grid-hour hidden md:block"
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
                  // Todas las tareas de la rutina como chips simples uniformes.
                  const routineChips =
                    tasksByDayRoutine.get(d)?.get(r.id) ?? [];
                  return (
                    <RoutineBlock
                      key={`${d}-${r.id}`}
                      routine={r}
                      top={rtop}
                      height={rh}
                      compact
                      flexAfter={routineChips}
                      scheduledRanges={[]}
                      routineOverdueRef={d === today ? ctx.hour : null}
                      dayISO={d}
                      onEdit={
                        onRoutineEdit ? () => onRoutineEdit(r.id) : undefined
                      }
                      onFlexTaskOpen={onTaskClick}
                    />
                  );
                })}

                {dtasks.map((t) => {
                  const top = (t.startHour - HOUR_START) * HOUR_HEIGHT;
                  const height = Math.max(
                    22,
                    (t.endHour - t.startHour) * HOUR_HEIGHT - 4
                  );
                  const isOverdueT =
                    isToday && !t.done && t.endHour <= ctx.hour;
                  return (
                    <TaskBlock
                      key={`${d}-${t.id}`}
                      task={t}
                      top={top}
                      height={height}
                      compact
                      routinesInScope={droutines}
                      showOwnerEmoji={isAll}
                      isOverdue={isOverdueT}
                      onOpen={() => onTaskClick(t.id)}
                    />
                  );
                })}

                {/* Flex sin rutina ubicadas en los huecos */}
                {placeFlexTasksInDay({
                  flexTasks: flexibleByDay.get(d) ?? [],
                  scheduledTasks: dtasks,
                  routines: droutines,
                  dayStart: HOUR_START,
                  dayEnd: HOUR_END,
                  itemDuration: 0.75,
                }).map(({ task, startHour, endHour }) => {
                  const top = (startHour - HOUR_START) * HOUR_HEIGHT;
                  const height = (endHour - startHour) * HOUR_HEIGHT - 2;
                  const isOverdueFlex =
                    isToday &&
                    !isTaskDoneForDay(task, d) &&
                    endHour <= ctx.hour;
                  return (
                    <PlacedFlexBlock
                      key={`${d}-${task.id}`}
                      task={task}
                      top={top}
                      height={height}
                      dayISO={d}
                      compact
                      isOverdue={isOverdueFlex}
                      onOpen={() => onTaskClick(task.id)}
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

  // Auto-scroll a la hora actual
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const didScrollRef = useRef(false);
  useEffect(() => {
    didScrollRef.current = false;
  }, [selectedDate]);
  useEffect(() => {
    if (!scrollRef.current || didScrollRef.current) return;
    const hasToday = days.includes(today);
    const targetHour = hasToday ? Math.max(HOUR_START, ctx.hour - 1) : 8;
    scrollRef.current.scrollTop = (targetHour - HOUR_START) * HOUR_HEIGHT;
    didScrollRef.current = true;
  }, [days, today, ctx.hour]);

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
        const wantsRoutine = e.shiftKey;
        const colRoutines = routines.filter((r) => {
          const owner = r.personId ?? selfDefaultId;
          return owner === sc.person.id && r.weekdays.includes(sc.weekday);
        });
        const container = findContainingRoutine(colRoutines, a, b);
        onDragComplete({
          startHour: a,
          endHour: b,
          personId: sc.person.id,
          weekday: sc.weekday,
          routineId: wantsRoutine ? undefined : container?.id,
          kind: wantsRoutine ? "routine" : "task",
        });
      }
    },
    [drag, subCols, onDragComplete, routines, selfDefaultId]
  );

  return (
    <div ref={scrollRef} className="flex flex-1 overflow-auto bg-fafo-bg">
      {/* Time gutter: sticky-left dentro del scroll, scrollea verticalmente con el contenido */}
      <div className="hidden md:block w-16 shrink-0 border-r border-fafo-border bg-fafo-bg sticky left-0 z-30">
        <div className="h-14 border-b border-fafo-border flex flex-col items-center justify-center bg-fafo-bg sticky top-0 z-10">
          <span className="text-sm">👥</span>
          <span className="text-[8px] uppercase tracking-wider text-fafo-accent2 font-semibold">
            Todos
          </span>
        </div>
        <div className="h-6 border-b border-fafo-border bg-fafo-bg sticky z-10" style={{ top: 56 }} />
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

      <div className="flex-1 min-w-0">
        {/* Sticky header con dia + sub-headers de personas */}
        <div className="sticky top-0 z-30 bg-fafo-panel/95 backdrop-blur">
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
              if (t.flexible) return false;
              if (t.routineId) return false;
              const owner = t.personId ?? selfDefaultId;
              if (owner !== person.id) return false;
              if (!taskAppliesOnDay(t, day, weekday)) return false;
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
                  const container = findContainingRoutine(proutines, sh, eh);
                  onDragComplete({
                    startHour: sh,
                    endHour: eh,
                    personId: person.id,
                    weekday,
                    routineId: container?.id,
                  });
                }}
              >
                {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 grid-hour hidden md:block"
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
                  // Todas las tareas de la rutina como chips simples uniformes.
                  const routineChips = tasks.filter((t) => {
                    if (t.routineId !== r.id) return false;
                    const owner = t.personId ?? selfDefaultId;
                    if (owner !== person.id) return false;
                    if (!taskAppliesOnDay(t, day, weekday)) return false;
                    return true;
                  });
                  return (
                    <RoutineBlock
                      key={`${day}-${r.id}`}
                      routine={r}
                      top={rtop}
                      height={rh}
                      compact
                      flexAfter={routineChips}
                      scheduledRanges={[]}
                      routineOverdueRef={day === today ? ctx.hour : null}
                      dayISO={day}
                      onEdit={
                        onRoutineEdit ? () => onRoutineEdit(r.id) : undefined
                      }
                      onFlexTaskOpen={onTaskClick}
                    />
                  );
                })}

                {ptasks.map((t) => {
                  const top = (t.startHour - HOUR_START) * HOUR_HEIGHT;
                  const height = Math.max(
                    22,
                    (t.endHour - t.startHour) * HOUR_HEIGHT - 4
                  );
                  const isOverdueT =
                    isToday && !t.done && t.endHour <= ctx.hour;
                  return (
                    <TaskBlock
                      key={`${day}-${t.id}`}
                      task={t}
                      top={top}
                      height={height}
                      compact
                      routinesInScope={proutines}
                      isOverdue={isOverdueT}
                      onOpen={() => onTaskClick(t.id)}
                    />
                  );
                })}

                {/* Flex sin rutina ubicadas en los huecos */}
                {(() => {
                  const flexInThisSub = tasks.filter((t) => {
                    if (!t.flexible || t.routineId) return false;
                    const owner = t.personId ?? selfDefaultId;
                    if (owner !== person.id) return false;
                    if (!taskAppliesOnDay(t, day, weekday)) return false;
                    if (
                      !t.isVital &&
                      t.locationId &&
                      t.locationId !== ctx.activeLocation?.id
                    )
                      return false;
                    return true;
                  });
                  return placeFlexTasksInDay({
                    flexTasks: flexInThisSub,
                    scheduledTasks: ptasks,
                    routines: proutines,
                    dayStart: HOUR_START,
                    dayEnd: HOUR_END,
                    itemDuration: 0.75,
                  }).map(({ task, startHour, endHour }) => {
                    const top = (startHour - HOUR_START) * HOUR_HEIGHT;
                    const height = (endHour - startHour) * HOUR_HEIGHT - 2;
                    const isOverdueFlex =
                      isToday &&
                      !isTaskDoneForDay(task, day) &&
                      endHour <= ctx.hour;
                    return (
                      <PlacedFlexBlock
                        key={`${day}-${task.id}`}
                        task={task}
                        top={top}
                        height={height}
                        dayISO={day}
                        compact
                        isOverdue={isOverdueFlex}
                        onOpen={() => onTaskClick(task.id)}
                      />
                    );
                  });
                })()}

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
  const ctx = useResolvedContext();
  const cells = monthGridDays(selectedDate);
  const today = todayISO();

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const c of cells) map.set(c, []);
    for (const t of tasks) {
      for (const c of cells) {
        const w = parseISO(c).getDay() as Weekday;
        if (taskAppliesOnDay(t, c, w)) {
          map.get(c)!.push(t);
        }
      }
    }
    return map;
  }, [tasks, cells]);

  // Calcular metricas por dia
  const dayStats = useMemo(() => {
    const map = new Map<
      string,
      { total: number; done: number; overdue: number }
    >();
    for (const c of cells) {
      const list = tasksByDay.get(c) ?? [];
      const done = list.filter((t) => isTaskDoneForDay(t, c)).length;
      let overdue = 0;
      if (c < today) {
        // dias pasados: no hechas = vencidas
        overdue = list.filter((t) => !isTaskDoneForDay(t, c)).length;
      } else if (c === today) {
        // hoy: las con horario ya vencido
        overdue = list.filter(
          (t) =>
            !isTaskDoneForDay(t, c) &&
            !t.flexible &&
            t.endHour <= ctx.hour
        ).length;
      }
      map.set(c, { total: list.length, done, overdue });
    }
    return map;
  }, [tasksByDay, cells, today, ctx.hour]);

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
          const stats = dayStats.get(iso) ?? { total: 0, done: 0, overdue: 0 };
          const ts = tasksByDay.get(iso) ?? [];
          const undone = ts.filter((t) => !isTaskDoneForDay(t, iso));
          // Orden: timed por hora ascendente, despues flex por prioridad.
          // Antes era el orden global del store, lo que escondia las flex
          // si habia muchas timed primero — ahora ambas son visibles.
          const sortedUndone = [...undone].sort((a, b) => {
            const aFlex = a.flexible ? 1 : 0;
            const bFlex = b.flexible ? 1 : 0;
            if (aFlex !== bFlex) return aFlex - bFlex;
            if (!a.flexible && !b.flexible) return a.startHour - b.startHour;
            return a.priority - b.priority;
          });
          const top3 = sortedUndone.slice(0, 3);
          const completionPct =
            stats.total > 0 ? (stats.done / stats.total) * 100 : 0;
          const overduePct =
            stats.total > 0 ? (stats.overdue / stats.total) * 100 : 0;

          return (
            <button
              key={iso}
              onClick={() => onSelectDate(iso)}
              className={clsx(
                "min-h-[100px] bg-fafo-bg text-left p-2 flex flex-col gap-1 transition-colors hover:bg-fafo-panel/60",
                !inMonth && "opacity-35",
                isSelected && "ring-2 ring-inset ring-fafo-accent",
                isToday && "bg-fafo-accent/5",
                stats.overdue > 0 && !isToday && iso < today && "bg-red-50"
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
                {stats.total > 0 && (
                  <span
                    className={clsx(
                      "text-[9px] tabular-nums font-semibold",
                      stats.overdue > 0
                        ? "text-red-500"
                        : stats.done === stats.total
                          ? "text-fafo-accent2"
                          : "text-fafo-muted"
                    )}
                  >
                    {stats.done}/{stats.total}
                  </span>
                )}
              </div>

              {/* Barra dual progreso */}
              {stats.total > 0 && (
                <div className="h-1 bg-fafo-border/40 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-fafo-accent2"
                    style={{ width: `${completionPct}%` }}
                  />
                  <div
                    className="h-full bg-red-400"
                    style={{ width: `${overduePct}%` }}
                  />
                </div>
              )}

              <div className="flex flex-col gap-0.5 mt-0.5">
                {top3.map((t) => (
                  <div
                    key={t.id}
                    className={clsx(
                      "flex items-center gap-1 text-[10px] truncate",
                      t.flexible && "italic text-fafo-muted"
                    )}
                    title={
                      t.flexible
                        ? `${t.name} (flex)`
                        : `${Math.floor(t.startHour).toString().padStart(2, "0")}h ${t.name}`
                    }
                  >
                    <span
                      className={clsx(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        PRIORITY_DOT[t.priority]
                      )}
                    />
                    {!t.flexible && (
                      <span className="text-[9px] tabular-nums text-fafo-muted shrink-0">
                        {Math.floor(t.startHour).toString().padStart(2, "0")}h
                      </span>
                    )}
                    {t.flexible && (
                      <span
                        className="text-[9px] text-fafo-muted shrink-0"
                        aria-label="flex"
                      >
                        ·
                      </span>
                    )}
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
