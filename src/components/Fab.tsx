"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  onNewTask: () => void;
  onNewRoutine: () => void;
}

export function Fab({ onNewTask, onNewRoutine }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Cerrar al clickear afuera
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={ref} className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-2">
      {open && (
        <div className="bg-fafo-panel border border-fafo-border rounded-xl shadow-xl p-1.5 flex flex-col gap-0.5 min-w-[200px] animate-in fade-in slide-in-from-bottom-2">
          <button
            onClick={() => {
              setOpen(false);
              onNewTask();
            }}
            className="text-left px-3 py-2.5 rounded-lg hover:bg-fafo-panel2 text-sm flex items-center gap-3 transition-colors"
          >
            <span className="text-lg">📌</span>
            <div>
              <div className="font-semibold text-fafo-text">Nueva tarea</div>
              <div className="text-[10px] text-fafo-muted">
                Asignala a una hora y dia
              </div>
            </div>
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onNewRoutine();
            }}
            className="text-left px-3 py-2.5 rounded-lg hover:bg-fafo-panel2 text-sm flex items-center gap-3 transition-colors"
          >
            <span className="text-lg">🗂️</span>
            <div>
              <div className="font-semibold text-fafo-text">Nueva rutina</div>
              <div className="text-[10px] text-fafo-muted">
                Bloque de tiempo recurrente
              </div>
            </div>
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-14 h-14 rounded-full bg-fafo-accent text-white text-3xl leading-none shadow-lg hover:scale-105 hover:shadow-xl transition-all flex items-center justify-center font-light ${open ? "rotate-45" : ""}`}
        title="Crear"
        aria-label="Crear"
      >
        +
      </button>
    </div>
  );
}
