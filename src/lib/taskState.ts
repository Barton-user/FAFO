import type { Task } from "./types";

/**
 * Determina si una tarea esta hecha "para el dia dayISO".
 *
 * - Tareas "repetitivas" (recurringInRoutine + flexible + routineId): se evaluan
 *   por iteracion. Estan hechas para el dia X solo si completedAt cae en X.
 * - Resto: el boolean `done` es la verdad permanente.
 */
export function isTaskDoneForDay(task: Task, dayISO: string): boolean {
  if (task.recurringInRoutine && task.flexible && task.routineId) {
    if (!task.completedAt) return false;
    const completedDay = new Date(task.completedAt).toISOString().slice(0, 10);
    return completedDay === dayISO;
  }
  return !!task.done;
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
  const todayISO = new Date().toISOString().slice(0, 10);
  if (task.recurringInRoutine && task.flexible && task.routineId) {
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
