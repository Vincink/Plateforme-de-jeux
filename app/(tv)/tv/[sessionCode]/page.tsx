"use client";

import React, { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { QrCode, Users, Tv, Sparkles } from "lucide-react";
import { clientEnv } from "@/lib/env";
import { INITIAL_GAMES } from "@/features/games/catalog";
import type {
  Game,
  GameSession,
  PlayerScore,
  SessionPlayer,
  SessionStatus,
} from "@/types/game.types";

const AVATAR_EMOJIS: Record<string, string> = {
  gamepad: "🎮",
  fox: "🦊",
  cat: "🐱",
  dog: "🐶",
  robot: "🤖",
  alien: "👽",
  crown: "👑",
  flame: "🔥",
  star: "⭐",
  rocket: "🚀",
};

export default function TvSessionPage() {
  const params = useParams<{ sessionCode: string }>();
  const sessionCode = (params?.sessionCode ?? "").toUpperCase();

  const [session, setSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([
    {
      id: "demo-1",
      session_id: "demo",
      nickname: "Vincent",
      avatar: "🎮",
      avatarId: "gamepad",
      is_host: true,
      is_connected: true,
    },
  ]);
  const [scores, setScores] = useState<PlayerScore[]>([
    {
      id: "score-1",
      session_id: "demo",
      player_id: "demo-1",
      score: 0,
    },
  ]);

  const currentGame: Game | undefined = useMemo(() => {
    const slug = (session?.state?.gameSlug as string | undefined) ?? "quiz";
    return INITIAL_GAMES.find((g) => g.slug === slug) ?? INITIAL_GAMES[0];
  }, [session]);

  const joinUrl = `${clientEnv.appUrl}/play/${sessionCode}`;

  const cycleDemoStatus = () => {
    const order: SessionStatus[] = [
      "lobby",
      "starting",
      "playing",
      "paused",
      "round_result",
      "finished",
    ];
    const currentStatus = session?.status ?? "lobby";
    const currentIndex = order.indexOf(currentStatus);
    const nextStatus: SessionStatus =
      order[(currentIndex + 1) % order.length] ?? "lobby";
    setSession((prev) => ({
      id: prev?.id ?? "demo-session",
      game_id: prev?.game_id ?? currentGame?.id ?? "quiz",
      code: sessionCode || "DEMO",
      status: nextStatus,
      current_round: prev?.current_round ?? 1,
      state: prev?.state ?? { gameSlug: currentGame?.slug ?? "quiz" },
    }));
  };

  const getPlayerScore = (playerId: string): number => {
    return scores.find((s) => s.player_id === playerId)?.score ?? 0;
  };

  const status = session?.status ?? "lobby";
  const round = session?.current_round ?? 1;

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-950 text-white p-8 md:p-14 flex flex-col justify-between">
      {/* Ambient background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: currentGame
            ? `radial-gradient(circle at 80% 20%, ${currentGame.accentColor}2E 0%, transparent 55%), radial-gradient(circle at 15% 85%, rgba(10, 132, 255, 0.14) 0%, transparent 55%)`
            : undefined,
        }}
      />

      {/* Top TV Bar */}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-6 border-b border-white/10 pb-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 border border-white/15">
            <Tv className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-neutral-400">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Écran Principal TV</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {currentGame?.title ?? "Plateforme de Jeux"}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={cycleDemoStatus}
            className="px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider bg-white/10 hover:bg-white/15 border border-white/15 transition"
          >
            État : {status} • Manche {round}
          </button>

          <div className="bg-white/5 border border-white/15 rounded-2xl px-5 py-2.5 text-right">
            <div className="text-[11px] uppercase tracking-widest text-neutral-400">
              Code Salle
            </div>
            <div className="font-mono text-2xl md:text-3xl font-extrabold tracking-widest text-amber-400">
              {sessionCode || "----"}
            </div>
          </div>
        </div>
      </header>

      {/* Main TV Stage */}
      <main className="relative z-10 my-auto py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left: Join / QR / Status */}
        <section className="lg:col-span-5 bg-white/5 border border-white/10 rounded-3xl p-8 space-y-6">
          <div className="flex items-center gap-3">
            <QrCode className="w-6 h-6 text-sky-400" />
            <h2 className="text-xl font-bold">Rejoindre avec son téléphone</h2>
          </div>

          <p className="text-sm text-neutral-300 leading-relaxed">
            Ouvre l&apos;appareil photo ou le navigateur sur ton téléphone et
            entre le code{" "}
            <span className="font-mono font-bold text-amber-400">
              {sessionCode || "----"}
            </span>
            .
          </p>

          <div className="rounded-2xl bg-black/40 border border-white/10 p-4 font-mono text-xs text-neutral-300 break-all">
            {joinUrl}
          </div>

          {currentGame?.tagline && (
            <p className="text-sm text-neutral-400 border-t border-white/10 pt-4">
              {currentGame.tagline}
            </p>
          )}
        </section>

        {/* Right: Players & Leaderboard */}
        <section className="lg:col-span-7 bg-white/5 border border-white/10 rounded-3xl p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-emerald-400" />
              <h2 className="text-xl font-bold">
                Joueurs ({players.length})
              </h2>
            </div>
            <span className="text-xs uppercase tracking-wider text-neutral-400">
              Classement en direct
            </span>
          </div>

          {players.length === 0 ? (
            <div className="py-12 text-center text-neutral-400">
              En attente des joueurs...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {players.map((player) => {
                const avatarKey = player.avatarId ?? "";
                const avatarSymbol =
                  (avatarKey ? AVATAR_EMOJIS[avatarKey] : undefined) ??
                  player.avatar ??
                  "🎮";

                return (
                  <div
                    key={player.id}
                    className="flex items-center justify-between gap-4 rounded-2xl bg-black/35 border border-white/10 p-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-2xl">
                        {avatarSymbol}
                      </span>
                      <span className="truncate text-base font-bold">
                        {player.nickname}
                      </span>
                    </div>

                    <span className="font-mono text-lg font-bold text-amber-400 shrink-0">
                      {getPlayerScore(player.id)} pts
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 flex items-center justify-between text-xs text-neutral-500 border-t border-white/10 pt-4">
        <span>TVOS Party Platform</span>
        <span>Salle {sessionCode || "—"}</span>
      </footer>
    </div>
  );
}
