"use client";

import { Calendar, type DragPayload } from "@/components/Calendar";
import { StatusBar } from "@/components/StatusBar";
import { TaskModal } from "@/components/TaskModal";
import { SettingsDrawer, type SettingsTab } from "@/components/SettingsDrawer";
import { NotificationToaster } from "@/components/NotificationToaster";
import { Fab } from "@/components/Fab";
import { TodoPanel } from "@/components/TodoPanel";
import { AuthGate } from "@/components/AuthGate";
import { useFafoStore } from "@/lib/store";
import { useResolvedContext } from "@/lib/context";
import { useMounted } from "@/lib/useNow";
import { parseISO, todayISO } from "@/lib/dateUtils";
import type { ViewMode, Weekday } from "@/lib/types";
import { useState, useEffect } from "react";

export default function Home() {
  return (
    <AuthGate>
      <HomeInner />
    </AuthGate>
  );
}

function HomeInner() {
  const mounted = useMounted();
  const [draft, setDraft] = useState<DragPayload | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | undefined>();
  const [editingRoutineId, setEditingRoutineId] = useState<string | undefined>();

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedDate, setSelectedDate] = useState<string>(() => todayISO());
  const [viewingPersonId, setViewingPersonId] = useState<string | null>(null);
  const [todoOpen, setTodoOpen] = useState(false);

  const recordTodayLog = useFafoStore((s) => s.recordTodayLog);
  const theme = useFafoStore((s) => s.theme);

  useEffect(() => {
    if (!mounted) return;
    recordTodayLog();
    const id = setInterval(recordTodayLog, 60_000);
    return () => clearInterval(id);
  }, [mounted, recordTodayLog]);

  // Aplica el theme al <html data-theme="...">
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  if (!mounted) {
    return (
      <main className="h-screen bg-fafo-bg flex items-center justify-center">
        <div className="text-fafo-accent font-black text-4xl tracking-tighter animate-pulse">
          FAFO
        </div>
      </main>
    );
  }

  const handleSelectDate = (iso: string) => {
    setSelectedDate(iso);
    if (viewMode === "month") setViewMode("day");
  };

  // Quick task creation desde el FAB
  const handleNewTask = () => {
    const now = new Date();
    const selfId =
      useFafoStore.getState().people.find((p) => p.isSelf)?.id ??
      "person-self";
    const targetPersonId = viewingPersonId ?? selfId;
    const baseDate = parseISO(selectedDate);
    const isToday = selectedDate === todayISO();
    let startHour = isToday
      ? Math.max(6, Math.min(22, now.getHours() + 1))
      : 9;
    if (startHour >= 23) startHour = 22;
    setDraft({
      startHour,
      endHour: Math.min(24, startHour + 1),
      personId: targetPersonId,
      weekday: baseDate.getDay() as Weekday,
    });
  };

  // Abrir SettingsDrawer en tab rutinas (creacion)
  const handleNewRoutine = () => {
    setEditingRoutineId(undefined);
    setSettingsTab("rutinas");
    setSettingsOpen(true);
  };

  // Click en el chip de una rutina -> editar
  const handleEditRoutine = (id: string) => {
    setEditingRoutineId(id);
    setSettingsTab("rutinas");
    setSettingsOpen(true);
  };

  return (
    <main className="h-screen flex flex-col bg-fafo-bg text-fafo-text overflow-hidden">
      <StatusBar
        viewMode={viewMode}
        selectedDate={selectedDate}
        viewingPersonId={viewingPersonId}
        todoOpen={todoOpen}
        onChangeViewMode={setViewMode}
        onChangeDate={setSelectedDate}
        onChangeViewingPerson={setViewingPersonId}
        onToggleTodo={() => setTodoOpen((o) => !o)}
        onOpenSettings={() => {
          setSettingsTab(undefined);
          setSettingsOpen(true);
        }}
      />
      <ContextHint />
      <div className="flex flex-1 overflow-hidden">
        <Calendar
          viewMode={viewMode}
          selectedDate={selectedDate}
          viewingPersonId={viewingPersonId}
          onSelectDate={handleSelectDate}
          onDragComplete={(p) => setDraft(p)}
          onTaskClick={(id) => setEditing(id)}
          onRoutineEdit={handleEditRoutine}
        />
        <TodoPanel
          open={todoOpen}
          viewMode={viewMode}
          selectedDate={selectedDate}
          viewingPersonId={viewingPersonId}
          onClose={() => setTodoOpen(false)}
          onEditTask={(id) => setEditing(id)}
        />
      </div>
      <FooterLegend viewMode={viewMode} />
      <TaskModal
        open={!!draft}
        onClose={() => setDraft(null)}
        newDraft={draft ?? undefined}
      />
      <TaskModal
        open={!!editing}
        onClose={() => setEditing(null)}
        editingTaskId={editing ?? undefined}
      />
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          setEditingRoutineId(undefined);
        }}
        initialTab={settingsTab}
        editingRoutineId={editingRoutineId}
      />
      <NotificationToaster />
      <Fab onNewTask={handleNewTask} onNewRoutine={handleNewRoutine} />
    </main>
  );
}

function ContextHint() {
  const ctx = useResolvedContext();
  const useRealGps = useFafoStore((s) => s.useRealGps);

  let msg = "";
  if (useRealGps) {
    if (ctx.gpsPermission === "denied")
      msg = "Permiso de GPS denegado. Cambia a una ubicacion simulada.";
    else if (!ctx.activeLocation && ctx.gpsPermission === "granted")
      msg = "GPS activo pero no estas dentro de ningun geofence guardado.";
    else if (!ctx.activeLocation) msg = "Buscando ubicacion...";
  } else if (!ctx.activeLocation) {
    msg = "Sin ubicacion activa. Las tareas con geofence permanecen ocultas.";
  }

  if (!msg) return null;
  return (
    <div className="text-[11px] text-fafo-muted bg-fafo-panel/40 border-b border-fafo-border px-4 py-1.5">
      {msg}
    </div>
  );
}

function FooterLegend({ viewMode }: { viewMode: ViewMode }) {
  return (
    <div className="border-t border-fafo-border bg-fafo-panel/60 px-4 py-2 text-[10px] text-fafo-muted flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="text-fafo-text font-semibold tracking-wider">TIP</span>
      {viewMode === "month" ? (
        <>
          <span>tap un dia para abrirlo</span>
          <span className="opacity-40">·</span>
          <span>los dots muestran la prioridad de cada tarea</span>
        </>
      ) : (
        <>
          <span>doble click en cualquier zona crea una tarea de 1h</span>
          <span className="opacity-40">·</span>
          <span>arrastra para dibujar la duracion</span>
          <span className="opacity-40">·</span>
          <span>click en una tarea para editarla</span>
          <span className="opacity-40">·</span>
          <span>doble click sobre una tarea para marcarla hecha</span>
        </>
      )}
      <span className="ml-auto opacity-50 hidden sm:inline">FAFO v0.3</span>
    </div>
  );
}
