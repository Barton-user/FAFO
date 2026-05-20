"use client";

import { useFafoStore } from "@/lib/store";
import type { Task, Weekday } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "./Avatar";
import { todayISO, timestampToISO } from "@/lib/dateUtils";
import clsx from "clsx";

const WEEKDAY_SHORT = ["D", "L", "M", "X", "J", "V", "S"];

const TABS = ["resumen", "rutinas", "personas", "lugares", "ajustes"] as const;
export type SettingsTab = (typeof TABS)[number];

export function SettingsDrawer({
  open,
  onClose,
  initialTab,
  editingRoutineId,
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
  editingRoutineId?: string;
}) {
  const [tab, setTab] = useState<SettingsTab>("resumen");

  useEffect(() => {
    if (open && editingRoutineId) setTab("rutinas");
    else if (open && initialTab) setTab(initialTab);
  }, [open, initialTab, editingRoutineId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full bg-fafo-panel border-l border-fafo-border overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-fafo-border flex items-center">
          <div className="text-sm font-semibold">FAFO · Gestionar</div>
          <button
            onClick={onClose}
            className="ml-auto text-fafo-muted hover:text-fafo-text text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex border-b border-fafo-border text-xs">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 capitalize ${
                tab === t
                  ? "text-fafo-accent border-b-2 border-fafo-accent"
                  : "text-fafo-muted hover:text-fafo-text"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === "resumen" && <ResumenTab />}
          {tab === "rutinas" && <RutinasTab initialEditId={editingRoutineId} />}
          {tab === "personas" && <PersonasTab />}
          {tab === "lugares" && <LugaresTab />}
          {tab === "ajustes" && <AjustesTab />}
        </div>
      </div>
    </div>
  );
}

function ResumenTab() {
  const tasks = useFafoStore((s) => s.tasks);
  const dailyGoal = useFafoStore((s) => s.dailyGoal);
  const today = todayISO();

  const periods = [
    { label: "Hoy", days: 1 },
    { label: "Semana", days: 7 },
    { label: "Mes", days: 30 },
    { label: "Ano", days: 365 },
  ];

  const stats = periods.map((p) => {
    const since = Date.now() - p.days * 24 * 3600 * 1000;
    const completed = tasks.filter(
      (t) => t.completedAt && t.completedAt >= since
    ).length;
    return { ...p, completed };
  });

  const todayDone = tasks.filter(
    (t) => t.completedAt && timestampToISO(t.completedAt) === today
  ).length;

  return (
    <div className="space-y-4">
      <Avatar />
      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="border border-fafo-border rounded-lg p-3 bg-fafo-bg"
          >
            <div className="text-[10px] uppercase tracking-wider text-fafo-muted">
              {s.label}
            </div>
            <div className="text-2xl font-bold">{s.completed}</div>
            <div className="text-[10px] text-fafo-muted">tareas hechas</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-fafo-border p-3 bg-fafo-bg">
        <div className="text-[10px] uppercase tracking-wider text-fafo-muted mb-1">
          Meta diaria
        </div>
        <div className="flex items-center gap-3">
          <div className="text-3xl font-bold">
            {todayDone}
            <span className="text-base text-fafo-muted">/{dailyGoal}</span>
          </div>
          <div className="flex-1">
            <div className="h-2 bg-fafo-border rounded-full overflow-hidden">
              <div
                className="h-full bg-fafo-accent2"
                style={{
                  width: `${Math.min(100, (todayDone / Math.max(1, dailyGoal)) * 100)}%`,
                }}
              />
            </div>
            <div className="text-[10px] mt-1 text-fafo-muted">
              {todayDone >= dailyGoal
                ? "Hoy fafosteaste menos. Recompensa desbloqueada."
                : "Si te quedas corto, va a haber consecuencias."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RutinasTab({ initialEditId }: { initialEditId?: string }) {
  const routines = useFafoStore((s) => s.routines);
  const locations = useFafoStore((s) => s.locations);
  const people = useFafoStore((s) => s.people);
  const tasks = useFafoStore((s) => s.tasks);
  const addRoutine = useFafoStore((s) => s.addRoutine);
  const updateRoutine = useFafoStore((s) => s.updateRoutine);
  const deleteRoutine = useFafoStore((s) => s.deleteRoutine);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#90CDE0");
  const [days, setDays] = useState<Weekday[]>([0, 1, 2, 3, 4, 5, 6]);
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(17);
  const [allDay, setAllDay] = useState(false);
  const [locId, setLocId] = useState<string | undefined>(undefined);
  const [personId, setPersonId] = useState<string | undefined>(undefined);

  function resetForm() {
    setEditingId(null);
    setName("");
    setColor("#90CDE0");
    setDays([0, 1, 2, 3, 4, 5, 6]);
    setStartHour(9);
    setEndHour(17);
    setAllDay(false);
    setLocId(undefined);
    setPersonId(undefined);
  }

  function loadRoutine(id: string) {
    const r = routines.find((x) => x.id === id);
    if (!r) return;
    setEditingId(r.id);
    setName(r.name);
    setColor(r.color);
    setDays(r.weekdays);
    setStartHour(r.startHour);
    setEndHour(r.endHour);
    setAllDay(r.startHour === 0 && r.endHour >= 24);
    setLocId(r.locationId);
    setPersonId(r.personId);
  }

  // Cargar la rutina si vino editingRoutineId desde page.tsx
  useEffect(() => {
    if (initialEditId) loadRoutine(initialEditId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditId]);

  // Validacion: las horas deben ser coherentes y los dias no vacios.
  const effStart = allDay ? 0 : startHour;
  const effEnd = allDay ? 24 : endHour;
  const hoursInvalid = !allDay && effEnd <= effStart;
  const daysInvalid = days.length === 0;
  const canSave = name.trim().length > 0 && !hoursInvalid && !daysInvalid;

  // Preview: que dias y horario va a aplicar la rutina (para que el usuario
  // entienda por que no la ve en el calendario si elige dias/horas que no
  // matchean con el dia visible).
  const previewDays = days.length === 7
    ? "todos los dias"
    : days
        .slice()
        .sort()
        .map((d) => WEEKDAY_SHORT[d])
        .join(" ");
  const previewHours = allDay
    ? "todo el dia"
    : `${Math.floor(effStart)}h-${Math.floor(effEnd)}h`;
  const previewLocation = locId
    ? locations.find((l) => l.id === locId)?.name ?? "ubicacion"
    : "cualquier ubicacion";

  function save() {
    if (!canSave) return;
    const payload = {
      name: name.trim(),
      color,
      weekdays: days,
      startHour: effStart,
      endHour: effEnd,
      locationId: locId,
      personId,
    };
    if (editingId) {
      updateRoutine(editingId, payload);
    } else {
      addRoutine(payload);
    }
    resetForm();
  }

  return (
    <div className="space-y-3">
      <div
        className={`rounded-lg border p-3 bg-fafo-bg space-y-2 transition-colors ${
          editingId
            ? "border-fafo-accent ring-1 ring-fafo-accent/40"
            : "border-fafo-border"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-fafo-muted font-semibold">
            {editingId ? "Editando rutina" : "Nueva rutina"}
          </div>
          {editingId && (
            <button
              onClick={resetForm}
              className="text-[10px] text-fafo-muted hover:text-fafo-text"
            >
              cancelar
            </button>
          )}
        </div>
        <input
          placeholder="Nombre (ej. Deep work)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-fafo-bg border border-fafo-border rounded-md px-2 py-1.5 text-sm outline-none focus:border-fafo-accent"
        />
        <div className="flex gap-1">
          {WEEKDAY_SHORT.map((lbl, i) => {
            const d = i as Weekday;
            const on = days.includes(d);
            return (
              <button
                key={i}
                onClick={() =>
                  setDays((prev) =>
                    prev.includes(d)
                      ? prev.filter((x) => x !== d)
                      : [...prev, d]
                  )
                }
                className={`flex-1 text-[11px] py-1 rounded ${
                  on
                    ? "bg-fafo-accent2 text-fafo-bg font-bold"
                    : "bg-fafo-panel text-fafo-muted border border-fafo-border"
                }`}
              >
                {lbl}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-[11px] text-fafo-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="accent-fafo-accent w-4 h-4"
          />
          <span className={allDay ? "text-fafo-text font-semibold" : ""}>
            Dia completo (00:00 → 24:00)
          </span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <input
            type="time"
            disabled={allDay}
            value={
              allDay
                ? "00:00"
                : `${Math.floor(startHour).toString().padStart(2, "0")}:00`
            }
            onChange={(e) => setStartHour(parseInt(e.target.value.split(":")[0]))}
            className="bg-fafo-bg border border-fafo-border rounded-md px-2 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <input
            type="time"
            disabled={allDay}
            value={
              allDay
                ? "23:59"
                : `${Math.floor(endHour).toString().padStart(2, "0")}:00`
            }
            onChange={(e) => setEndHour(parseInt(e.target.value.split(":")[0]))}
            className="bg-fafo-bg border border-fafo-border rounded-md px-2 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-full rounded-md border border-fafo-border bg-fafo-bg"
          />
        </div>
        <select
          value={locId ?? ""}
          onChange={(e) => setLocId(e.target.value || undefined)}
          className="w-full bg-fafo-bg border border-fafo-border rounded-md px-2 py-1.5 text-xs"
        >
          <option value="">Cualquier ubicacion</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.emoji} {l.name}
            </option>
          ))}
        </select>
        <select
          value={personId ?? ""}
          onChange={(e) => setPersonId(e.target.value || undefined)}
          className="w-full bg-fafo-bg border border-fafo-border rounded-md px-2 py-1.5 text-xs"
        >
          <option value="">Asignado a Yo</option>
          {people
            .filter((p) => !p.isSelf)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.emoji} {p.name}
              </option>
            ))}
        </select>
        {/* Cartel de error: horas o dias invalidos */}
        {(hoursInvalid || daysInvalid) && name.trim().length > 0 && (
          <div className="text-[11px] text-red-500 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
            {daysInvalid && "Elegi al menos un dia. "}
            {hoursInvalid &&
              `La hora de fin (${Math.floor(effEnd)}h) debe ser mayor a la de inicio (${Math.floor(effStart)}h).`}
          </div>
        )}
        {/* Preview de cuando va a aparecer la rutina */}
        {canSave && (
          <div className="text-[11px] text-fafo-muted bg-fafo-panel/60 border border-fafo-border/60 rounded px-2 py-1.5">
            Aparecera: <span className="text-fafo-text font-semibold">{previewDays}</span>
            {" · "}
            <span className="text-fafo-text font-semibold">{previewHours}</span>
            {" · "}
            <span className="text-fafo-text">{previewLocation}</span>
          </div>
        )}
        <button
          onClick={save}
          disabled={!canSave}
          className="w-full bg-fafo-accent text-white text-xs py-2 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {editingId ? "Guardar cambios" : "Agregar rutina"}
        </button>
      </div>

      {/* Tareas dentro de esta rutina — solo en modo edicion */}
      {editingId && <RoutineTasksEditor routineId={editingId} />}
      <div className="space-y-2">
        {routines.map((r) => {
          const isEditing = r.id === editingId;
          const isAllDay = r.startHour === 0 && r.endHour >= 24;
          return (
            <div
              key={r.id}
              className={`border rounded-lg p-2 bg-fafo-bg flex items-center gap-2 transition-colors ${
                isEditing
                  ? "border-fafo-accent ring-1 ring-fafo-accent/40"
                  : "border-fafo-border"
              }`}
            >
              <div
                className="w-3 h-8 rounded-sm"
                style={{ background: r.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-1.5">
                  {r.name}
                  {(() => {
                    const taskCount = tasks.filter(
                      (t) => t.routineId === r.id
                    ).length;
                    const doneCount = tasks.filter(
                      (t) => t.routineId === r.id && t.done
                    ).length;
                    return taskCount > 0 ? (
                      <span
                        className="text-[10px] bg-fafo-accent/15 text-fafo-accent font-semibold px-1.5 py-0.5 rounded tabular-nums"
                        title={`${doneCount} hechas de ${taskCount} tareas`}
                      >
                        {doneCount}/{taskCount}
                      </span>
                    ) : (
                      <span className="text-[10px] text-fafo-muted/60 italic">
                        sin tareas
                      </span>
                    );
                  })()}
                  {r.personId && (
                    <span className="text-[10px] bg-fafo-panel2 text-fafo-muted px-1.5 py-0.5 rounded">
                      {people.find((p) => p.id === r.personId)?.emoji}{" "}
                      {people.find((p) => p.id === r.personId)?.name}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-fafo-muted">
                  {r.weekdays.map((d) => WEEKDAY_SHORT[d]).join("")} ·{" "}
                  {isAllDay
                    ? "todo el dia"
                    : `${Math.floor(r.startHour)}h–${Math.floor(r.endHour)}h`}
                  {r.locationId
                    ? ` · ${locations.find((l) => l.id === r.locationId)?.name}`
                    : ""}
                </div>
              </div>
              <button
                onClick={() =>
                  isEditing ? resetForm() : loadRoutine(r.id)
                }
                className={`text-[10px] px-2 py-1 rounded ${
                  isEditing
                    ? "bg-fafo-accent text-white"
                    : "text-fafo-muted hover:text-fafo-text border border-fafo-border"
                }`}
              >
                {isEditing ? "editando" : "editar"}
              </button>
              <button
                onClick={() => {
                  if (confirm(`Eliminar rutina "${r.name}"?`)) {
                    deleteRoutine(r.id);
                    if (editingId === r.id) resetForm();
                  }
                }}
                className="text-[10px] text-fafo-muted hover:text-fafo-accent px-2 py-1"
              >
                eliminar
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoutineTasksEditor({ routineId }: { routineId: string }) {
  const tasks = useFafoStore((s) => s.tasks);
  const addTask = useFafoStore((s) => s.addTask);
  const updateTask = useFafoStore((s) => s.updateTask);
  const deleteTask = useFafoStore((s) => s.deleteTask);
  const reorderTask = useFafoStore((s) => s.reorderTask);
  const routines = useFafoStore((s) => s.routines);
  const routine = routines.find((r) => r.id === routineId);

  const [newName, setNewName] = useState("");
  const [newRecurring, setNewRecurring] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const routineTasks = useMemo(
    () => tasks.filter((t) => t.routineId === routineId),
    [tasks, routineId]
  );

  function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !routine) return;
    addTask({
      name,
      priority: 2,
      weekdays: routine.weekdays,
      startHour: routine.startHour,
      endHour: routine.endHour,
      personId: routine.personId,
      routineId,
      flexible: true,
      recurringInRoutine: newRecurring,
    });
    setNewName("");
  }

  return (
    <div className="rounded-lg border border-fafo-border p-3 bg-fafo-bg space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-fafo-muted font-semibold flex items-center justify-between">
        <span>Tareas en esta rutina ({routineTasks.length})</span>
      </div>

      <form onSubmit={quickAdd} className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
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
            placeholder="Nueva tarea en esta rutina"
            className="flex-1 bg-fafo-bg border border-fafo-border rounded-md px-2 py-1.5 text-sm outline-none focus:border-fafo-accent"
          />
          {newName.trim() && (
            <button
              type="submit"
              className="text-xs px-2 py-1.5 rounded bg-fafo-accent text-white font-semibold"
            >
              +
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-[10px] text-fafo-muted cursor-pointer pl-7">
          <input
            type="checkbox"
            checked={newRecurring}
            onChange={(e) => setNewRecurring(e.target.checked)}
            className="accent-fafo-accent w-3 h-3"
          />
          <span className={newRecurring ? "text-fafo-text font-semibold" : ""}>
            Repetitiva (se rehace cada iteracion)
          </span>
        </label>
      </form>

      {routineTasks.length === 0 ? (
        <div className="text-[10px] text-fafo-muted/60 italic py-2 text-center">
          Sin tareas todavia. Agregá una arriba.
        </div>
      ) : (
        <ul className="space-y-1">
          {routineTasks.map((t) => (
            <RoutineTaskRow
              key={t.id}
              task={t}
              isDragging={draggingId === t.id}
              isDragOver={dragOverId === t.id && draggingId !== t.id}
              onUpdate={(patch) => updateTask(t.id, patch)}
              onDelete={() => {
                if (confirm(`Eliminar "${t.name}"?`)) deleteTask(t.id);
              }}
              onUnlink={() =>
                updateTask(t.id, { routineId: undefined })
              }
              onDragStart={() => setDraggingId(t.id)}
              onDragOver={() => setDragOverId(t.id)}
              onDrop={(srcId) => {
                if (srcId && srcId !== t.id) reorderTask(srcId, t.id);
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
      <div className="text-[10px] text-fafo-muted/70 leading-relaxed">
        <strong>Repetitiva</strong>: se rehace cada vez que aparece la rutina
        (habit). <strong>Unica</strong>: una vez marcada hecha, queda hecha
        para siempre.
      </div>
    </div>
  );
}

function RoutineTaskRow({
  task,
  isDragging,
  isDragOver,
  onUpdate,
  onDelete,
  onUnlink,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  task: Task;
  isDragging: boolean;
  isDragOver: boolean;
  onUpdate: (patch: Partial<Task>) => void;
  onDelete: () => void;
  onUnlink: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: (srcId: string) => void;
  onDragEnd: () => void;
}) {
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
        "flex items-center gap-2 px-2 py-1.5 rounded-md border bg-fafo-panel/70 cursor-move transition-all",
        isDragging && "opacity-30",
        isDragOver
          ? "border-fafo-accent ring-1 ring-fafo-accent"
          : "border-fafo-border"
      )}
    >
      <span className="text-fafo-muted/50 text-xs select-none">⋮⋮</span>
      <span className="flex-1 text-sm text-fafo-text truncate">
        {task.name}
      </span>
      <label
        className="flex items-center gap-1 text-[9px] text-fafo-muted cursor-pointer select-none"
        title="Repetitiva (rehacer cada iteracion)"
      >
        <input
          type="checkbox"
          checked={!!task.recurringInRoutine}
          onChange={(e) =>
            onUpdate({ recurringInRoutine: e.target.checked })
          }
          className="accent-fafo-accent w-3 h-3"
        />
        <span
          className={clsx(
            "px-1 rounded uppercase tracking-wider",
            task.recurringInRoutine
              ? "bg-fafo-accent/15 text-fafo-accent font-bold"
              : "text-fafo-muted"
          )}
        >
          {task.recurringInRoutine ? "Repet" : "Unica"}
        </span>
      </label>
      <button
        onClick={onUnlink}
        className="text-[9px] text-fafo-muted hover:text-fafo-text px-1"
        title="Sacar de esta rutina (queda huerfana)"
      >
        ↗
      </button>
      <button
        onClick={onDelete}
        className="text-[9px] text-fafo-muted hover:text-fafo-accent px-1"
        title="Eliminar tarea"
      >
        ×
      </button>
    </li>
  );
}

function PersonasTab() {
  const people = useFafoStore((s) => s.people);
  const addPerson = useFafoStore((s) => s.addPerson);
  const deletePerson = useFafoStore((s) => s.deletePerson);

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("\u{1F642}");
  const [color, setColor] = useState("#ffd700");

  function add() {
    if (!name.trim()) return;
    addPerson({ name: name.trim(), emoji, color });
    setName("");
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-fafo-border p-3 bg-fafo-bg space-y-2">
        <div className="text-[10px] text-fafo-muted">
          Las personas son perfiles fantasma — no necesitan cuenta. Sirven para
          ver el contexto de los demas en tu calendario.
        </div>
        <div className="flex gap-2">
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value.slice(0, 2))}
            className="w-12 text-center bg-fafo-bg border border-fafo-border rounded-md py-1.5 text-base"
          />
          <input
            placeholder="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 bg-fafo-bg border border-fafo-border rounded-md px-2 py-1.5 text-sm"
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-10 h-8 rounded-md border border-fafo-border bg-fafo-bg"
          />
        </div>
        <button
          onClick={add}
          disabled={!name.trim()}
          className="w-full bg-fafo-accent text-white text-xs py-2 rounded-md disabled:opacity-40"
        >
          Agregar persona
        </button>
      </div>
      <div className="space-y-2">
        {people.map((p) => (
          <div
            key={p.id}
            className="border border-fafo-border rounded-lg p-2 bg-fafo-bg flex items-center gap-2"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
              style={{ background: p.color }}
            >
              {p.emoji}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">{p.name}</div>
              <div className="text-[10px] text-fafo-muted">
                {p.isSelf ? "Tu" : "Shadow profile"}
              </div>
            </div>
            {!p.isSelf && (
              <button
                onClick={() => deletePerson(p.id)}
                className="text-[10px] text-fafo-muted hover:text-fafo-accent px-2 py-1"
              >
                eliminar
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function LugaresTab() {
  const locations = useFafoStore((s) => s.locations);
  const addLocation = useFafoStore((s) => s.addLocation);
  const deleteLocation = useFafoStore((s) => s.deleteLocation);

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("\u{1F4CD}");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState(100);

  function add() {
    if (!name.trim()) return;
    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);
    if (isNaN(latN) || isNaN(lngN)) return;
    addLocation({
      name: name.trim(),
      emoji,
      coords: { lat: latN, lng: lngN },
      radiusMeters: radius,
      isMock: true,
    });
    setName("");
    setLat("");
    setLng("");
  }

  function captureHere() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
      },
      undefined,
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-fafo-border p-3 bg-fafo-bg space-y-2">
        <div className="flex gap-2">
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value.slice(0, 2))}
            className="w-12 text-center bg-fafo-bg border border-fafo-border rounded-md py-1.5 text-base"
          />
          <input
            placeholder="Nombre (ej. Casa)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 bg-fafo-bg border border-fafo-border rounded-md px-2 py-1.5 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            placeholder="Latitud"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            className="bg-fafo-bg border border-fafo-border rounded-md px-2 py-1.5 text-xs"
          />
          <input
            placeholder="Longitud"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            className="bg-fafo-bg border border-fafo-border rounded-md px-2 py-1.5 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-fafo-muted">Radio:</label>
          <input
            type="range"
            min={20}
            max={500}
            value={radius}
            onChange={(e) => setRadius(parseInt(e.target.value))}
            className="flex-1"
          />
          <span className="text-[10px] text-fafo-muted">{radius}m</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={captureHere}
            className="flex-1 text-xs py-2 rounded-md border border-fafo-border hover:border-fafo-accent2"
          >
            📍 Usar GPS actual
          </button>
          <button
            onClick={add}
            disabled={!name.trim() || !lat || !lng}
            className="flex-1 bg-fafo-accent text-white text-xs py-2 rounded-md disabled:opacity-40"
          >
            Agregar
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {locations.map((l) => (
          <div
            key={l.id}
            className="border border-fafo-border rounded-lg p-2 bg-fafo-bg flex items-center gap-2"
          >
            <div className="w-8 h-8 rounded-md bg-fafo-panel flex items-center justify-center text-lg">
              {l.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{l.name}</div>
              <div className="text-[10px] text-fafo-muted">
                {l.coords.lat.toFixed(4)}, {l.coords.lng.toFixed(4)} · {l.radiusMeters}m
              </div>
            </div>
            <button
              onClick={() => deleteLocation(l.id)}
              className="text-[10px] text-fafo-muted hover:text-fafo-accent px-2 py-1"
            >
              eliminar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AjustesTab() {
  const dailyGoal = useFafoStore((s) => s.dailyGoal);
  const setDailyGoal = useFafoStore((s) => s.setDailyGoal);
  const useRealGps = useFafoStore((s) => s.useRealGps);
  const setUseRealGps = useFafoStore((s) => s.setUseRealGps);
  const resetAll = useFafoStore((s) => s.resetAll);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-fafo-border p-3 bg-fafo-bg">
        <label className="text-[10px] uppercase tracking-wider text-fafo-muted">
          Meta de tareas diaria
        </label>
        <input
          type="number"
          min={1}
          max={50}
          value={dailyGoal}
          onChange={(e) => setDailyGoal(parseInt(e.target.value) || 1)}
          className="w-full bg-fafo-bg border border-fafo-border rounded-md px-2 py-1.5 text-sm mt-1"
        />
      </div>
      <div className="rounded-lg border border-fafo-border p-3 bg-fafo-bg flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">GPS real</div>
          <div className="text-[10px] text-fafo-muted">
            Usar tu ubicacion real para resolver geofences.
          </div>
        </div>
        <button
          onClick={() => setUseRealGps(!useRealGps)}
          className={`w-10 h-6 rounded-full relative transition-colors ${
            useRealGps ? "bg-fafo-accent2" : "bg-fafo-border"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              useRealGps ? "translate-x-4" : ""
            }`}
          />
        </button>
      </div>
      <button
        onClick={() => {
          if (confirm("Esto resetea todo a los valores iniciales. Seguro?")) {
            resetAll();
          }
        }}
        className="w-full text-xs py-2 rounded-md border border-fafo-border text-fafo-accent hover:bg-fafo-accent hover:text-white transition-colors"
      >
        Resetear toda la data
      </button>
      <div className="text-[10px] text-fafo-muted text-center">
        FAFO v0.1 — All data is local (localStorage). No accounts, no tracking.
      </div>
    </div>
  );
}
