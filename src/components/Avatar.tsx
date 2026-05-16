"use client";

import { useFafoStore } from "@/lib/store";
import type { AvatarTier } from "@/lib/types";
import { useMemo } from "react";

function tierFromStreakXp(streak: number, xp: number): AvatarTier {
  if (streak >= 30 || xp >= 5000) return "legend";
  if (streak >= 14 || xp >= 2000) return "super";
  if (streak >= 7 || xp >= 800) return "savant";
  if (streak >= 3 || xp >= 250) return "nerd";
  if (xp >= 50) return "grinder";
  return "rookie";
}

const TIER_INFO: Record<
  AvatarTier,
  { label: string; emoji: string; glow: string; sub: string }
> = {
  rookie: {
    label: "Rookie",
    emoji: "\u{1F636}",
    glow: "from-stone-200 to-stone-300",
    sub: "Recien empezas. FAFO.",
  },
  grinder: {
    label: "Grinder",
    emoji: "\u{1F9D0}",
    glow: "from-amber-100 to-amber-200",
    sub: "Trackeando todo.",
  },
  nerd: {
    label: "Nerd",
    emoji: "\u{1F913}",
    glow: "from-sky-100 to-cyan-200",
    sub: "Bloques bajo control.",
  },
  savant: {
    label: "Savant",
    emoji: "\u{1F9D9}",
    glow: "from-violet-100 to-fuchsia-200",
    sub: "Routines optimizadas.",
  },
  super: {
    label: "Super",
    emoji: "\u{1F9B8}",
    glow: "from-pink-200 to-rose-300",
    sub: "Imparable.",
  },
  legend: {
    label: "Legend",
    emoji: "\u{1F47D}",
    glow: "from-amber-200 to-rose-300",
    sub: "Outlier.",
  },
};

export function Avatar({ compact = false }: { compact?: boolean }) {
  const xp = useFafoStore((s) => s.xp);
  const longestStreak = useFafoStore((s) => s.longestStreak);
  const dailyLogs = useFafoStore((s) => s.dailyLogs);

  const currentStreak = useMemo(() => {
    const sorted = [...dailyLogs].sort((a, b) => (a.date < b.date ? 1 : -1));
    let s = 0;
    for (const l of sorted) {
      if (l.hitGoal) s++;
      else break;
    }
    return s;
  }, [dailyLogs]);

  const tier = tierFromStreakXp(Math.max(currentStreak, longestStreak), xp);
  const info = TIER_INFO[tier];

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div
          className={`w-9 h-9 rounded-full bg-gradient-to-br ${info.glow} flex items-center justify-center text-lg shadow-md ring-1 ring-fafo-border`}
        >
          {info.emoji}
        </div>
        <div className="text-xs leading-tight">
          <div className="font-semibold text-fafo-text">{info.label}</div>
          <div className="text-fafo-muted">
            {xp} XP · {currentStreak}d
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-fafo-border bg-fafo-panel p-4 flex items-center gap-3 shadow-sm">
      <div
        className={`w-14 h-14 rounded-full bg-gradient-to-br ${info.glow} flex items-center justify-center text-2xl shadow-md ring-1 ring-fafo-border`}
      >
        {info.emoji}
      </div>
      <div>
        <div className="text-lg font-semibold text-fafo-text">{info.label}</div>
        <div className="text-xs text-fafo-muted">{info.sub}</div>
        <div className="text-xs mt-1">
          <span className="text-fafo-accent2 font-semibold">{xp} XP</span>
          <span className="mx-2 text-fafo-muted">·</span>
          <span className="text-fafo-gold font-semibold">{currentStreak}d streak</span>
        </div>
      </div>
    </div>
  );
}

export { tierFromStreakXp, TIER_INFO };
