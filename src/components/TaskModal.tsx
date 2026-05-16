"use client";

import { useFafoStore } from "@/lib/store";
import type { Priority, Weekday } from "@/lib/types";
import { useEffect, useState } from "react";

const PRIORITY_OPTIONS: { value: Priority; label: string; color: string }[] = [
  { value: 0, label: "Vital", color: "bg-fafo-accent" },
  { value: 1, label: "High", color: "bg-orange-500" },
  { value: 2, label: "Normal", color: "bg-cyan-600" },
  { value: 3, label: "Low", color: "bg-zinc-600" },
];

const WEEKDAY_SHORT = ["D", "L", "M", "X", "J", "V", "S"];

export interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  // For new task
  newDraft?: {
    startHour: number;
    endHour: number;
    personId: string;
    weekday: Weekday;
  };
  // For editing existing
  editingTaskId?: string;
}

function hourToStr(h: number) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

export function TaskModal({
  open,
  onClose,
  newDraft,
  editingTaskId,
}: TaskModalProps) {
  const addTask = useFafoStore((s) => s.addTask);
  const updateTask = useFafoStore((s) => s.updateTask);
  const deleteTask = useFafoStore((s) => s.deleteTask);
  const routines = useFafoStore((s) => s.routines);
  const locations = useFafoStore((s) => s.locations);
  const people = useFafoStore((s) => s.people);
  const task = useFafoStore((s) =>
    editingTaskId ? s.tasks.find((t) => t.id === editingTaskId) : undefined
  );

  const [name, setName] = useState("");
  const [priority, setPriority] = useState<Priority>(2);
  const [routineId, setRoutineId] = useState<string | undefined>(undefined);
  const [locationId, setLocationId] = useState<string | undefined>(undefined);
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(10);
  const [personId, setPersonId] = useState<string | undefined>(undefined);
  const [isVital, setIsVital] = useState(false);
  const [flexible, setFlexible] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (task) {
      setName(task.name);
      setPriority(task.priority);
      setRoutineId(task.routineId);
      setLocationId(task.locationId);
      setWeekdays(task.weekdays);
      setStartHour(task.startHour);
      setEndHour(task.endHour);
      setPersonId(task.personId);
      setIsVital(!!task.isVital);
      setFlexible(!!task.flexible);
    } else if (newDraft) {
      setName("");
      setPriority(2);
      setRoutineId(undefined);
      setLocationId(undefined);
      setWeekdays([newDraft.weekday]);
      setStartHour(newDraft.startHour);
      setEndHour(newDraft.endHour);
      setPersonId(newDraft.personId);
      setIsVital(false);
      setFlexible(false);
    }
  }, [open, task, newDraft]);

  if (!open) return null;

  function toggleDay(d: Weekday) {
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  }

  function save() {
    const cleanName = name.trim();
    if (!cleanName) return;
    const payload = {
      name: cleanName,
      priority,
      routineId,
      locationId,
      weekdays: weekdays.length ? weekdays : ([0, 1, 2, 3, 4, 5, 6] as Weekday[]),
      startHour,
      endHour: Math.max(startHour + 0.25, endHour),
      personId,
      isVital: priority === 0 ? true : isVital,
      flexible,
    };
    if (editingTaskId) {
      updateTask(editingTaskId, payload);
    } else {
      addTask(payload);
    }
    onClose();
  }

  function remove() {
    if (editingTaskId) deleteTask(editingTaskId);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-fafo-panel border border-fafo-border rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-fafo-border flex items-center justify-between">
          <div className="text-sm font-semibold tracking-wide">
            {editingTaskId ? "Editar tarea" : "Nueva tarea"}
          </div>
          <button
            onClick={onClose}
            className="text-fafo-muted hover:text-fafo-text text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          <input
            autoFocus
            placeholder="Que hay que hacer?"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") onClose();
            }}
            className="w-full bg-fafo-bg border border-fafo-border rounded-md px-3 py-2.5 text-base outline-none focus:border-fafo-accent placeholder:text-fafo-muted"
          />

          {/* Priority */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-fafo-muted">
              Prioridad
            </label>
            <div className="flex gap-1.5 mt-1.5">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 text-xs py-2 rounded-md transition-all ${
                    priority === p.value
                      ? `${p.color} text-white shadow-md scale-[1.02]`
                      : "bg-fafo-bg text-fafo-muted hover:text-fafo-text border border-fafo-border"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {priority === 0 && (
              <div className="text-[10px] text-fafo-accent mt-1">
                Las vitales se superponen a cualquier rutina/ubicacion.
              </div>
            )}
          </div>

          {/* Flexible (sin horario fijo) */}
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={flexible}
              onChange={(e) => setFlexible(e.target.checked)}
              className="accent-fafo-accent w-4 h-4"
            />
            <span className={flexible ? "text-fafo-text font-semibold" : "text-fafo-muted"}>
              Sin horario fijo (todo el dia / orden libre)
            </span>
          </label>

          {/* Time */}
          {!flexible && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-fafo-muted">
                  Desde
                </label>
                <input
                  type="time"
                  value={hourToStr(startHour)}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(":").map(Number);
                    setStartHour(h + m / 60);
                  }}
                  className="w-full bg-fafo-bg border border-fafo-border rounded-md px-2 py-1.5 text-sm mt-1.5 outline-none focus:border-fafo-accent"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-fafo-muted">
                  Hasta
                </label>
                <input
                  type="time"
                  value={hourToStr(endHour)}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(":").map(Number);
                    setEndHour(h + m / 60);
                  }}
                  className="w-full bg-fafo-bg border border-fafo-border rounded-md px-2 py-1.5 text-sm mt-1.5 outline-none focus:border-fafo-accent"
                />
              </div>
            </div>
          )}

          {/* Weekdays */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-fafo-muted">
              Dias
            </label>
            <div className="flex gap-1 mt-1.5">
              {WEEKDAY_SHORT.map((lbl, i) => {
                const d = i as Weekday;
                const on = weekdays.includes(d);
                return (
                  <button
                    key={i}
                    onClick={() => toggleDay(d)}
                    className={`flex-1 text-xs py-1.5 rounded-md transition-all ${
                      on
                        ? "bg-fafo-accent2 text-fafo-bg font-bold"
                        : "bg-fafo-bg text-fafo-muted border border-fafo-border"
                    }`}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Routine / Location / Person */}
          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-fafo-muted">
                Rutina (opcional)
              </label>
              <select
                value={routineId ?? ""}
                onChange={(e) =>
                  setRoutineId(e.target.value || undefined)
                }
                className="w-full bg-fafo-bg border border-fafo-border rounded-md px-2 py-1.5 text-sm mt-1 outline-none focus:border-fafo-accent"
              >
                <option value="">Huerfana</option>
                {routines.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-fafo-muted">
                Ubicacion requerida (opcional)
              </label>
              <select
                value={locationId ?? ""}
                onChange={(e) =>
                  setLocationId(e.target.value || undefined)
                }
                className="w-full bg-fafo-bg border border-fafo-border rounded-md px-2 py-1.5 text-sm mt-1 outline-none focus:border-fafo-accent"
              >
                <option value="">Cualquier lugar</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.emoji} {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-fafo-muted">
                Asignado a
              </label>
              <select
                value={personId ?? ""}
                onChange={(e) => setPersonId(e.target.value || undefined)}
                className="w-full bg-fafo-bg border border-fafo-border rounded-md px-2 py-1.5 text-sm mt-1 outline-none focus:border-fafo-accent"
              >
                <option value="">Yo</option>
                {people
                  .filter((p) => !p.isSelf)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.emoji} {p.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-fafo-border flex items-center gap-2">
          {editingTaskId && (
            <button
              onClick={remove}
              className="text-xs px-3 py-2 rounded-md border border-fafo-border text-fafo-muted hover:text-fafo-accent hover:border-fafo-accent"
            >
              Eliminar
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="text-xs px-3 py-2 rounded-md border border-fafo-border"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={!name.trim()}
            className="text-xs px-4 py-2 rounded-md bg-fafo-accent text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {editingTaskId ? "Guardar" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}
