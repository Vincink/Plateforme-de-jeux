"use client";

import React, { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Pause,
  Play,
  QrCode,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  Zap,
} from "lucide-react";
import { GlassPanel } from "@/components/tvos/GlassPanel";
import { LiveLeaderboard } from "@/components/shared/LiveLeaderboard";
import { QRCodeDisplay } from "@/components/shared/QRCodeDisplay";
import { INITIAL_GAMES } from "@/features/games/catalog";
import { clientEnv } from "@/lib/env";
import type {
  PlayerScore,
  PlayerSession,
  SessionStatus,
} from "@/types/game.types";

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

export default function TvSessionPage() {
  const params = useParams<{ sessionCode: string }>();
  const router = useRouter();

  const sessionCode = (params.sessionCode ?? "DEMO01").toUpperCase();

  // États locaux de démonstration visuelle avant branchement Realtime (Étape 6)
  const [status, setStatus] = useState<SessionStatus>("lobby");
  const [showQr, setShowQr] = useState<boolean>(true);
  const [players] = useState<PlayerSession[]>([]);
  const [scores] = useState<PlayerScore[]>([]);

  const currentGame = useMemo(() => {
    if (sessionCode.includes("BLIND")) {
      return INITIAL_GAMES[1] ?? INITIAL_GAMES[0];
    }
    if (sessionCode.includes("SPEED")) {
      return INITIAL_GAMES[2] ?? INITIAL_GAMES[0];
    }
    return INITIAL_GAMES[0];
  }, [sessionCode]);

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
    const currentIdx = order.indexOf(status);
    const nextStatus = order[(currentIdx + 1) % order.length] ?? "lobby";
    setStatus(nextStatus);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-tvos-bg text-white">
      <div
        className="pointer-events-none fixed inset-0 transition-all duration-700"
        style={{
          background: currentGame
            ? `radial-gradient(circle at 80% 20%, ${currentGame.accentColor}2E 0%, transparent 55%), radial-gradient(circle at 15% 85%, rgba(10, 132, 255, 0.14) 0%, transparent 55%)`
            : undefined,
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1680px] flex-col justify-between px-8 py-8 lg:px-14 lg:py-10">
        {/* Barre supérieure TV */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => router.push("/tv")}
              className="tvos-glass flex h-12 w-12 items-center justify-center rounded-2xl text-white/85 transition hover:bg-white/15 hover:text-white"
              aria-label="Retour au catalogue"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/55">
                {currentGame?.title ?? "Partie en cours"}
              </p>
              <div className="mt-0.5 flex items-center gap-3">
                <span className="font-mono text-xl font-black tracking-[0.2em] text-tvos-accent">
                  {sessionCode}
                </span>
                <span className="rounded-full bg-white/10 px-3 py-0.5 text-xs font-semibold uppercase tracking-wider text-white/80">
                  {status === "lobby" && "Salle d'attente"}
                  {status === "starting" && "Lancement"}
                  {status === "playing" && "En direct"}
                  {status === "paused" && "En pause"}
                  {status === "round_result" && "Résultats de la manche"}
                  {status === "finished" && "Partie terminée"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowQr((prev) => !prev)}
              className="tvos-glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white/85 hover:bg-white/15"
            >
              <QrCode className="h-4 w-4 text-tvos-accent" />
              {showQr ? "Masquer QR" : "Afficher QR"}
            </button>
            <button
              type="button"
              onClick={cycleDemoStatus}
              className="rounded-full bg-white/15 px-4 py-2 text-xs font-semibold text-white hover:bg-white/25"
            >
              Aperçu état suivant
            </button>
          </div>
        </header>

        {/* Zone principale selon l'état */}
        <section className="my-8 flex flex-1 items-center">
          <AnimatePresence mode="wait">
            {status === "lobby" && (
              <motion.div
                key="lobby"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="grid w-full gap-8 lg:grid-cols-12"
              >
                <div className="flex flex-col justify-between lg:col-span-7">
                  <GlassPanel className="flex-1 p-8">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Users className="h-6 w-6 text-tvos-accent" />
                        <h1 className="text-3xl font-bold tracking-tight">
                          Participants connectés
                        </h1>
                      </div>
                      <span className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-bold">
                        {players.length}
                      </span>
                    </div>

                    {players.length === 0 ? (
                      <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 py-16 text-center">
                        <Sparkles className="mb-3 h-9 w-9 text-tvos-accent" />
                        <p className="text-lg font-semibold text-white/90">
                          En attente des joueurs...
                        </p>
                        <p className="mt-1 max-w-md text-sm text-white/60">
                          Scannez le QR code avec votre smartphone pour choisir
                          votre pseudo et votre avatar sans installer
                          d&apos;application.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                        {players.map((player) => (
                          <div
                            key={player.id}
                            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-3.5"
                          >
                            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-2xl">
                              {AVATAR_EMOJIS[player.avatarId] ?? "🎮"}
                            </span>
                            <span className="truncate text-base font-bold">
                              {player.nickname}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </GlassPanel>
                </div>

                {showQr ? (
                  <div className="flex items-center justify-center lg:col-span-5">
                    <QRCodeDisplay sessionCode={sessionCode} joinUrl={joinUrl} />
                  </div>
                ) : null}
              </motion.div>
            )}

            {status === "starting" && (
              <motion.div
                key="starting"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="mx-auto w-full max-w-3xl text-center"
              >
                <GlassPanel className="p-14">
                  <Zap className="mx-auto mb-4 h-14 w-14 text-tvos-accent" />
                  <p className="text-sm font-semibold uppercase tracking-[0.25em] text-white/60">
                    Préparez vos téléphones
                  </p>
                  <h1 className="mt-3 text-5xl font-black tracking-tight sm:text-6xl">
                    La partie démarre !
                  </h1>
                  <p className="mt-4 text-lg text-white/75">
                    {currentGame?.title} • {currentGame?.tagline}
                  </p>
                </GlassPanel>
              </motion.div>
            )}

            {status === "playing" && (
              <motion.div
                key="playing"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="grid w-full gap-8 lg:grid-cols-12"
              >
                <GlassPanel className="flex flex-col justify-between p-8 lg:col-span-8 lg:p-10">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-tvos-accent/20 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-tvos-accent">
                      {currentGame?.slug === "blind-test" ? (
                        <>
                          <Volume2 className="h-4 w-4" />
                          Extrait audio en cours
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4" />
                          Manche active
                        </>
                      )}
                    </div>

                    <h1 className="mt-6 text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
                      {currentGame?.slug === "blind-test"
                        ? "Écoutez et appuyez sur votre buzzer !"
                        : "Les questions et moteurs de jeu seront activés à l'Étape 7."}
                    </h1>
                    <p className="mt-4 text-base text-white/70">
                      Les réponses et buzzers envoyés depuis les smartphones
                      apparaîtront ici en temps réel dès la connexion Supabase
                      Realtime.
                    </p>
                  </div>

                  <div className="mt-10 flex items-center justify-between border-t border-white/10 pt-5 text-sm text-white/60">
                    <span>Code : {sessionCode}</span>
                    <span>Synchronisation temps réel (Étape 6)</span>
                  </div>
                </GlassPanel>

                <div className="lg:col-span-4">
                  <LiveLeaderboard scores={scores} title="Scores en direct" />
                </div>
              </motion.div>
            )}

            {status === "paused" && (
              <motion.div
                key="paused"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="mx-auto w-full max-w-2xl text-center"
              >
                <GlassPanel className="p-14">
                  <Pause className="mx-auto mb-4 h-14 w-14 text-amber-400" />
                  <h1 className="text-4xl font-black tracking-tight">
                    Partie en pause
                  </h1>
                  <p className="mt-3 text-base text-white/70">
                    L&apos;animateur a temporairement mis la partie en pause.
                  </p>
                </GlassPanel>
              </motion.div>
            )}

            {status === "round_result" && (
              <motion.div
                key="round_result"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="mx-auto w-full max-w-4xl"
              >
                <LiveLeaderboard
                  scores={scores}
                  title="Classement après la manche"
                />
              </motion.div>
            )}

            {status === "finished" && (
              <motion.div
                key="finished"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="mx-auto w-full max-w-4xl space-y-6"
              >
                <div className="text-center">
                  <Trophy className="mx-auto mb-3 h-12 w-12 text-amber-400" />
                  <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
                    Podium Final
                  </h1>
                </div>
                <LiveLeaderboard
                  scores={scores}
                  title="Classement général"
                  isFinalPodium
                />
                <div className="flex justify-center gap-4 pt-2">
                  <button
                    type="button"
                    onClick={() => router.push("/tv")}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-bold text-black"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Retour au catalogue
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <footer className="flex items-center justify-between text-xs text-white/50">
          <span>Interface TV Apple tvOS</span>
          <span>Rejoindre sur : {joinUrl}</span>
        </footer>
      </div>
    </main>
  );
}
