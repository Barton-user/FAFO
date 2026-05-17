"use client";

import { useFafoStore } from "@/lib/store";
import type { Task } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectTask: (id: string) => void;
}

const PRIORITY_DOT: Record<number, string> = {
  0: "bg-[#DD7493]",
  1: "bg-[#D88677]",
  2: "bg-[#E89E5C]",
  3: "bg-[#5BACC4]",
  4: "bg-[#9B8FBC]",
  5: "bg-[#8A847C]",
};

export function SearchModal({ open, onClose, onSelectTask }: Props) {
  const tasks = useFafoStore((s) => s.tasks);
  const routines = useFafoStore((s) => s.routines);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!open) {
      setQ("");
      setIdx(0);
    }
  }, [open]);

  const results = useMemo<Task[]>(() => {
    const query = q.trim().toLowerCase();
    if (!query) return tasks.slice(0, 50);
    return tasks
      .filter((t) => t.name.toLowerCase().includes(query))
      .slice(0, 50);
  }, [tasks, q]);

  useEffect(() => {
    if (idx >= results.length) setIdx(Math.max(0, results.length - 1));
  }, [results.length, idx]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setIdx((i) => Math.min(results.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const t = results[idx];
        if (t) {
          onSelectTask(t.id);
          onClose();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, results, idx, onClose, onSelectTask]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-fafo-panel border border-fafo-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-fafo-border px-4 py-3 flex items-center gap-2">
          <span className="text-fafo-muted">🔍</span>
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            placeholder="Buscar tareas..."
            className="flex-1 bg-transparent outline-none text-sm text-fafo-text"
          />
          <kbd className="text-[10px] text-fafo-muted bg-fafo-bg border border-fafo-border rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-fafo-muted">
              {q.trim() ? "Sin resultados" : "Empezá a escribir..."}
            </div>
          ) : (
            <ul>
              {results.map((t, i) => {
                const isActive = i === idx;
                const routine = t.routineId
                  ? routines.find((r) => r.id === t.routineId)
                  : null;
                return (
                  <li
                    key={t.id}
                    onMouseEnter={() => setIdx(i)}
                    onClick={() => {
                      onSelectTask(t.id);
                      onClose();
                    }}
                    className={clsx(
                      "px-4 py-2 flex items-center gap-2 cursor-pointer text-sm",
                      isActive ? "bg-fafo-accent/10" : "hover:bg-fafo-panel2/50",
                      t.done && "opacity-50 line-through"
                    )}
                  >
                    <span
                      className={clsx(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        PRIORITY_DOT[t.priority]
                      )}
                    />
                    <span className="flex-1 truncate text-fafo-text">
                      {t.name}
                    </span>
                    {routine && (
                      <span className="text-[10px] text-fafo-muted">
                        ↳ {routine.name}
                      </span>
                    )}
                    {t.flexible && (
                      <span className="text-[9px] uppercase tracking-wider text-fafo-muted">
                        flex
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-fafo-border px-4 py-2 flex items-center gap-3 text-[10px] text-fafo-muted">
          <span>
            <kbd className="bg-fafo-bg border border-fafo-border rounded px-1">↑</kbd>{" "}
            <kbd className="bg-fafo-bg border border-fafo-border rounded px-1">↓</kbd>{" "}
            navegar
          </span>
          <span>
            <kbd className="bg-fafo-bg border border-fafo-border rounded px-1">
              Enter
            </kbd>{" "}
            abrir
          </span>
        </div>
      </div>
    </div>
  );
}
