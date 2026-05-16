"use client";

import { useFafoStore } from "@/lib/store";
import { useSyncStore } from "@/lib/syncStore";
import { useEffect, useRef, useState } from "react";

interface Toast {
  id: string;
  kind: "win" | "warn" | "info";
  text: string;
}

export function NotificationToaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const tasks = useFafoStore((s) => s.tasks);
  const dailyGoal = useFafoStore((s) => s.dailyGoal);
  const lastCheckedRef = useRef<number>(Date.now());
  const lastCountRef = useRef<number>(-1);

  // Push toast helper
  function push(kind: Toast["kind"], text: string) {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4500);
    // Browser notifications
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      try {
        new Notification("FAFO", { body: text });
      } catch (_) {
        // ignore
      }
    }
  }

  // Detect task completions
  useEffect(() => {
    const done = tasks.filter((t) => t.done).length;
    if (lastCountRef.current >= 0 && done > lastCountRef.current) {
      const today = new Date().toISOString().slice(0, 10);
      const todayDone = tasks.filter(
        (t) =>
          t.completedAt &&
          new Date(t.completedAt).toISOString().slice(0, 10) === today
      ).length;
      if (todayDone === dailyGoal) {
        push("win", `Meta diaria desbloqueada (${dailyGoal}/${dailyGoal}). FAFO++`);
      } else if (todayDone > dailyGoal) {
        push("win", `Outperform: ${todayDone}/${dailyGoal} tareas hoy.`);
      }
    } else if (lastCountRef.current >= 0 && done < lastCountRef.current) {
      // task got undone, no toast
    }
    lastCountRef.current = done;
  }, [tasks, dailyGoal]);

  // Periodic productivity check
  useEffect(() => {
    function check() {
      const today = new Date().toISOString().slice(0, 10);
      const todayDone = tasks.filter(
        (t) =>
          t.completedAt &&
          new Date(t.completedAt).toISOString().slice(0, 10) === today
      ).length;
      const hour = new Date().getHours();
      if (hour >= 18 && todayDone < dailyGoal) {
        push(
          "warn",
          `Vas ${todayDone}/${dailyGoal} y son las ${hour}h. The more you fuck around, the more you find out.`
        );
      }
      lastCheckedRef.current = Date.now();
    }
    const id = setInterval(check, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [tasks, dailyGoal]);

  // Sync errors → toast
  const syncError = useSyncStore((s) => s.lastError);
  const setSyncError = useSyncStore((s) => s.setError);
  const lastErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (syncError && syncError !== lastErrorRef.current) {
      lastErrorRef.current = syncError;
      push("warn", `Sync: ${syncError}`);
      // Auto-clear despues de 6s para que pueda volver a alertar
      const id = setTimeout(() => setSyncError(null), 6000);
      return () => clearTimeout(id);
    }
  }, [syncError, setSyncError]);

  // Request notification permission on first mount
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      // Ask on first interaction would be ideal — but for demo we ask quickly
      const timeout = setTimeout(() => {
        Notification.requestPermission().catch(() => {});
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-xl px-4 py-3 text-sm shadow-xl border min-w-[260px] max-w-[360px] backdrop-blur ${
            t.kind === "win"
              ? "bg-fafo-accent2 text-white border-fafo-accent2"
              : t.kind === "warn"
                ? "bg-fafo-accent text-white border-fafo-accent"
                : "bg-fafo-panel text-fafo-text border-fafo-border"
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
