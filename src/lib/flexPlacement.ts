import type { Task, Routine } from "./types";

export interface PlacedFlex {
  task: Task;
  startHour: number;
  endHour: number;
}

/**
 * Distribuye tareas flex (sin horario) en los espacios libres del dia.
 * Las tareas con horario y las rutinas tienen prioridad — los flex llenan
 * los huecos de arriba hacia abajo.
 */
export function placeFlexTasksInDay(opts: {
  flexTasks: Task[];
  scheduledTasks: Task[];
  routines: Routine[];
  dayStart: number;
  dayEnd: number;
  itemDuration: number; // horas por slot (ej 0.5 = 30 min)
}): PlacedFlex[] {
  const { flexTasks, scheduledTasks, routines, dayStart, dayEnd, itemDuration } =
    opts;

  // 1. Recolectar intervalos ocupados (scheduled + routines)
  const occupied: Array<{ start: number; end: number }> = [];
  for (const t of scheduledTasks) {
    if (t.endHour > t.startHour) {
      occupied.push({
        start: Math.max(dayStart, t.startHour),
        end: Math.min(dayEnd, t.endHour),
      });
    }
  }
  for (const r of routines) {
    if (r.endHour > r.startHour) {
      occupied.push({
        start: Math.max(dayStart, r.startHour),
        end: Math.min(dayEnd, r.endHour),
      });
    }
  }

  // 2. Mergear intervalos solapados
  occupied.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const occ of occupied) {
    const last = merged[merged.length - 1];
    if (last && occ.start <= last.end) {
      last.end = Math.max(last.end, occ.end);
    } else {
      merged.push({ ...occ });
    }
  }

  // 3. Calcular intervalos libres
  const free: Array<{ start: number; end: number }> = [];
  let cursor = dayStart;
  for (const occ of merged) {
    if (occ.start > cursor) {
      free.push({ start: cursor, end: occ.start });
    }
    cursor = Math.max(cursor, occ.end);
  }
  if (cursor < dayEnd) {
    free.push({ start: cursor, end: dayEnd });
  }

  // 4. Distribuir flex tasks en los huecos, de arriba hacia abajo
  const placed: PlacedFlex[] = [];
  let freeIdx = 0;
  let pos = free.length > 0 ? free[0].start : dayEnd;

  for (const task of flexTasks) {
    while (freeIdx < free.length) {
      const interval = free[freeIdx];
      if (pos < interval.start) pos = interval.start;
      if (pos + itemDuration <= interval.end) {
        placed.push({
          task,
          startHour: pos,
          endHour: pos + itemDuration,
        });
        pos += itemDuration;
        break;
      }
      freeIdx++;
      if (freeIdx < free.length) {
        pos = free[freeIdx].start;
      }
    }
    if (freeIdx >= free.length) break;
  }

  return placed;
}
