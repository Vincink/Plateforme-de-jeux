"use client";

import React from "react";
import { motion } from "framer-motion";
import { Trophy, Flame } from "lucide-react";
import type { PlayerScore } from "@/types/game.types";

interface LiveLeaderboardProps {
  scores: PlayerScore[];
  title?: string;
  isFinalPodium?: boolean;
}

const AVATAR_EMOJIS: Record<string, string> = {
  fox: "🦊",
  rocket: "🚀",
  crown: "👑",
  ghost: "👻",
  alien: "👾",
  unicorn: "🦄",
  flame: "🔥",
  star: "⭐",
};

export function LiveLeaderboard({
  scores,
  title = "Classement en direct",
  isFinalPodium = false,
}: LiveLeaderboardProps) {
  const sorted = [...scores].sort((a, b) => b.totalScore - a.totalScore);

  return (
    <div className="tvos-glass rounded-tvos-lg p-7">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trophy
            className={`h-6 w-6 ${
              isFinalPodium ? "text-amber-400" : "text-tvos-accent"
            }`}
          />
          <h2 className="text-2xl font-bold tracking-tight text-white">
            {title}
          </h2>
        </div>
        <span className="rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold text-white/75">
          {sorted.length} {sorted.length > 1 ? "joueurs" : "joueur"}
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-white/60">
          Aucun score enregistré pour le moment.
        </p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((entry, index) => {
            const rank = index + 1;
            const medal =
              rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
            const avatar = AVATAR_EMOJIS[entry.avatarId] ?? "🎮";

            return (
              <motion.li
                key={entry.playerId}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
                className={`flex items-center justify-between rounded-2xl border px-5 py-3.5 ${
                  rank === 1 && isFinalPodium
                    ? "border-amber-400/50 bg-amber-400/15"
                    : "border-white/10 bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className="w-9 text-center text-lg font-extrabold text-white/90">
                    {medal}
                  </span>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-2xl">
                    {avatar}
                  </span>
                  <div>
                    <p className="text-lg font-bold text-white">
                      {entry.nickname}
                    </p>
                    {entry.streak > 1 ? (
                      <p className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300">
                        <Flame className="h-3.5 w-3.5 fill-current" />
                        Série de {entry.streak}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-mono text-2xl font-black text-white">
                    {entry.totalScore}
                  </span>
                  <span className="ml-1.5 text-xs font-semibold uppercase tracking-wider text-white/55">
                    pts
                  </span>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
