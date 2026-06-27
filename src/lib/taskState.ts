import type { Task, Weekday } from "./types";
import { timestampToISO, todayISO as todayLocalISO } from "./dateUtils";

/**
 * Determina si una tarea APLICA en un dia dado.
 *
 * - Si tiene `specificDate` (tarea "no anclada"): solo aplica ese dia exacto.
 *   Esto manda sobre cualquier otra regla (ni siquiera las vitales la muestran
 *   en otros dias).
 * - Las vitales (priority 0) aplican todos los dias.
 * - El resto aplica si el weekday del dia esta en `weekdays`.
 *
 * NO chequea ubicacion ni persona: eso queda en cada call-site.
 */
export function taskAppliesOnDay(
  task: Task,
  iso: string,
  weekday: number
): boolean {
  if (task.specificDate) return task.specificDate === iso;
  if (task.isVital || task.priority === 0) return true;
  return task.weekdays.includes(weekday as Weekday);
}

/**
 * Determina si una tarea esta hecha "para el dia dayISO".
 *
 * - Tareas ancladas (recurringInRoutine + routineId): se evaluan por iteracion.
 *   Estan hechas para el dia X solo si completedAt cae en X.
 * - Resto (incluidas las "no ancladas" con specificDate): el boolean `done` es
 *   la verdad permanente.
 */
export function isTaskDoneForDay(task: Task, dayISO: string): boolean {
  if (task.recurringInRoutine && task.routineId) {
    if (!task.completedAt) return false;
    const completedDay = timestampToISO(task.completedAt);
    return completedDay === dayISO;
  }
  return !!task.done;
}

/**
 * Reordena una lista de tareas flotando las HECHAS (para el dia dado) hacia
 * arriba, manteniendo el orden relativo dentro de cada grupo (estable).
 * Es puramente visual: no toca el array guardado, asi el drag-reorder sigue
 * funcionando. Pasar doneFirst=false para mandarlas abajo en su lugar.
 */
export function sortTasksByDone(
  tasks: Task[],
  dayISO: string,
  doneFirst = true
): Task[] {
  const done: Task[] = [];
  const pending: Task[] = [];
  for (const t of tasks) {
    (isTaskDoneForDay(t, dayISO) ? done : pending).push(t);
  }
  return doneFirst ? [...done, ...pending] : [...pending, ...done];
}

/**
 * Calcula el patch para togglear el estado "hecha" en el dia dayISO.
 * Para tareas repetitivas, setea completedAt al timestamp del dia.
 */
export function toggleDonePatch(
  task: Task,
  dayISO: string
): Partial<Task> {
  const currentlyDone = isTaskDoneForDay(task, dayISO);
  const todayISO = todayLocalISO();
  if (task.recurringInRoutine && task.routineId) {
    if (currentlyDone) {
      return { done: false, completedAt: undefined };
    }
    const ts =
      dayISO === todayISO
        ? Date.now()
        : new Date(`${dayISO}T12:00:00`).getTime();
    return { done: true, completedAt: ts };
  }
  // Default toggle
  return currentlyDone
    ? { done: false, completedAt: undefined }
    : { done: true, completedAt: Date.now() };
}
