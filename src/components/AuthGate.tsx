"use client";

import { useAuth } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useFafoStore } from "@/lib/store";
import { loadAll } from "@/lib/api";
import {
  migrateLocalToSupabaseIfEmpty,
  readLocalStateRaw,
} from "@/lib/migration";
import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const hydrate = useFafoStore((s) => s.hydrate);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Cuando el user queda autenticado, sincronizamos: migracion (si aplica) + hydrate.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setSyncing(true);
    setSyncError(null);
    (async () => {
      try {
        // Leer DIRECTO de localStorage para evitar race con persist hidratacion.
        const localSnapshot = readLocalStateRaw();
        const result = await migrateLocalToSupabaseIfEmpty(localSnapshot);
        console.log("[FAFO sync] migration:", result);
        const snap = await loadAll();
        if (cancelled) return;
        hydrate(snap);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "sync error";
        console.error("[FAFO sync]", err);
        if (!cancelled) setSyncError(msg);
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, hydrate]);

  if (!isSupabaseConfigured) {
    return (
      <main className="h-screen bg-fafo-bg text-fafo-text flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="text-fafo-accent font-black text-3xl tracking-tighter mb-2">
            FAFO
          </div>
          <div className="text-sm text-fafo-muted">
            Supabase no esta configurado. Agrega <code>NEXT_PUBLIC_SUPABASE_URL</code>
            y <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> a <code>.env.local</code> y
            recarga.
          </div>
        </div>
      </main>
    );
  }

  if (loading || (user && syncing)) {
    return (
      <main className="h-screen bg-fafo-bg flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="text-fafo-accent font-black text-4xl tracking-tighter animate-pulse">
            FAFO
          </div>
          {syncing && (
            <div className="text-[11px] text-fafo-muted">
              sincronizando tu data...
            </div>
          )}
        </div>
      </main>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (syncError) {
    return (
      <main className="h-screen bg-fafo-bg flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <div className="text-fafo-accent font-black text-2xl">FAFO</div>
          <div className="text-sm text-red-500">
            Error sincronizando con Supabase: {syncError}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="text-xs px-3 py-2 rounded-md bg-fafo-accent text-white"
          >
            Reintentar
          </button>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}

function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const fn = mode === "login" ? signIn : signUp;
      const { error } = await fn(email.trim(), password);
      if (error) {
        setError(error);
      } else if (mode === "signup") {
        setInfo(
          "Cuenta creada. Si Supabase pide verificacion por email, revisa tu casilla."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="h-screen bg-fafo-bg text-fafo-text flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-fafo-panel border border-fafo-border rounded-2xl shadow-xl p-6 space-y-5">
        <div className="text-center">
          <div className="text-fafo-accent font-black text-4xl tracking-tighter">
            FAFO
          </div>
          <div className="text-[11px] text-fafo-muted mt-1">
            the more you fuck around, the more you find out
          </div>
        </div>

        <div className="flex bg-fafo-bg rounded-lg border border-fafo-border p-0.5">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
                setInfo(null);
              }}
              className={clsx(
                "flex-1 text-xs py-1.5 rounded-md font-medium transition-all",
                mode === m
                  ? "bg-fafo-accent text-white shadow"
                  : "text-fafo-muted hover:text-fafo-text"
              )}
            >
              {m === "login" ? "Entrar" : "Crear cuenta"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            autoComplete="email"
            required
            className="w-full bg-fafo-bg border border-fafo-border rounded-md px-3 py-2 text-sm outline-none focus:border-fafo-accent"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={6}
            className="w-full bg-fafo-bg border border-fafo-border rounded-md px-3 py-2 text-sm outline-none focus:border-fafo-accent"
          />
          {error && (
            <div className="text-xs text-fafo-accent bg-fafo-accent/10 border border-fafo-accent/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          {info && (
            <div className="text-xs text-fafo-accent2 bg-fafo-accent2/10 border border-fafo-accent2/30 rounded-md px-3 py-2">
              {info}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !email.trim() || password.length < 6}
            className="w-full bg-fafo-accent text-white text-sm py-2.5 rounded-md font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
          >
            {busy
              ? "..."
              : mode === "login"
                ? "Entrar"
                : "Crear cuenta"}
          </button>
        </form>

        <div className="text-[10px] text-fafo-muted text-center leading-relaxed">
          Tu data se sincroniza con Supabase. RLS activado: solo vos ves tus
          tareas y rutinas.
        </div>
      </div>
    </main>
  );
}
