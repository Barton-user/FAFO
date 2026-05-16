"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

export default function ResetPasswordPage() {
  const { user, updatePassword, loading } = useAuth();
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Cuando termina el reset, redirigir al home
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => {
      window.location.href = "/";
    }, 1800);
    return () => clearTimeout(id);
  }, [done]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pwd.length < 6) {
      setError("El password debe tener al menos 6 caracteres.");
      return;
    }
    if (pwd !== pwd2) {
      setError("Los passwords no coinciden.");
      return;
    }
    setBusy(true);
    const { error: err } = await updatePassword(pwd);
    setBusy(false);
    if (err) {
      setError(err);
    } else {
      setDone(true);
    }
  }

  if (loading) {
    return (
      <main className="h-screen bg-fafo-bg flex items-center justify-center">
        <div className="text-fafo-accent font-black text-4xl tracking-tighter animate-pulse">
          FAFO
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen bg-fafo-bg text-fafo-text flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-fafo-panel border border-fafo-border rounded-2xl shadow-xl p-6 space-y-4">
        <div className="text-center">
          <div className="text-fafo-accent font-black text-3xl tracking-tighter">
            FAFO
          </div>
          <div className="text-xs text-fafo-muted mt-1">
            Recuperar password
          </div>
        </div>

        {!user ? (
          <div className="text-xs text-fafo-muted bg-fafo-accent/10 border border-fafo-accent/30 rounded-md px-3 py-2 space-y-2">
            <div>
              No detectamos una sesion de recuperacion activa. Esto puede pasar
              si:
            </div>
            <ul className="list-disc pl-5 space-y-1">
              <li>El link del email expiro.</li>
              <li>Ya lo usaste una vez.</li>
              <li>No entraste desde el link del email.</li>
            </ul>
            <a
              href="/"
              className="block text-center bg-fafo-accent text-white text-xs py-2 rounded-md mt-2"
            >
              Volver al login
            </a>
          </div>
        ) : done ? (
          <div className="text-xs text-fafo-accent2 bg-fafo-accent2/10 border border-fafo-accent2/30 rounded-md px-3 py-3 text-center">
            ✓ Password actualizado. Redirigiendo a tu agenda...
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="text-xs text-fafo-muted">
              Ingresá tu nuevo password ({user.email}):
            </div>
            <input
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="Nuevo password"
              autoComplete="new-password"
              minLength={6}
              required
              className="w-full bg-fafo-bg border border-fafo-border rounded-md px-3 py-2 text-sm outline-none focus:border-fafo-accent"
            />
            <input
              type="password"
              value={pwd2}
              onChange={(e) => setPwd2(e.target.value)}
              placeholder="Repetir password"
              autoComplete="new-password"
              minLength={6}
              required
              className="w-full bg-fafo-bg border border-fafo-border rounded-md px-3 py-2 text-sm outline-none focus:border-fafo-accent"
            />
            {error && (
              <div className="text-xs text-fafo-accent bg-fafo-accent/10 border border-fafo-accent/30 rounded-md px-3 py-2">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy || pwd.length < 6 || pwd !== pwd2}
              className="w-full bg-fafo-accent text-white text-sm py-2.5 rounded-md font-semibold disabled:opacity-40 hover:brightness-110"
            >
              {busy ? "..." : "Guardar nuevo password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
