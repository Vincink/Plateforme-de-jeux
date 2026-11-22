"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  ExternalLink,
  Gamepad2,
  History,
  Pause,
  Play,
  QrCode,
  RotateCcw,
  Square,
  Trash2,
  Tv,
  Users,
} from "lucide-react";
import { GlassPanel } from "@/components/tvos/GlassPanel";
import { LiveLeaderboard } from "@/components/shared/LiveLeaderboard";
import { INITIAL_GAMES } from "@/features/games/catalog";
import type {
  GameDefinition,
  PlayerScore,
  PlayerSession,
  SessionStatus,
} from "@/types/game.types";

interface SessionSummary {
  id: string;
  code: string;
  gameTitle: string;
  status: SessionStatus;
  playerCount: number;
  createdAtLabel: string;
}

export default function AdminDashboardPage() {
  const router = useRouter();

  const [selectedGameId, setSelectedGameId] = useState<string>(
    INITIAL_GAMES[0]?.id ?? "game-quiz"
  );
  const [sessionCode, setSessionCode] = useState<string>("TVOS01");
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("lobby");
  const [showQrOnTv, setShowQrOnTv] = useState<boolean>(true);
  const [games, setGames] = useState<GameDefinition[]>(INITIAL_GAMES);
  const [players, setPlayers] = useState<PlayerSession[]>([]);
  const [scores] = useState<PlayerScore[]>([]);
  const [history, setHistory] = useState<SessionSummary[]>([
    {
      id: "demo-1",
      code: "QUIZ88",
      gameTitle: "Grand Quiz tvOS",
      status: "finished",
      playerCount: 4,
      createdAtLabel: "Session de démonstration",
    },
  ]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const selectedGame = useMemo(
    () => games.find((g) => g.id === selectedGameId) ?? games[0],
    [games, selectedGameId]
  );

  const generateCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < 6; i += 1) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleCreateSession = () => {
    const newCode = generateCode();
    setSessionCode(newCode);
    setSessionStatus("lobby");
    setShowQrOnTv(true);
    setFeedback(
      `Nouvelle partie ${newCode} préparée pour ${selectedGame?.title ?? "le jeu"}.`
    );
  };

  const handleStatusChange = (nextStatus: SessionStatus) => {
    setSessionStatus(nextStatus);
    setFeedback(`État de la partie mis à jour : ${nextStatus}.`);

    if (nextStatus === "finished") {
      setHistory((prev) => [
        {
          id: `hist-${Date.now()}`,
          code: sessionCode,
          gameTitle: selectedGame?.title ?? "Partie",
          status: "finished",
          playerCount: players.length,
          createdAtLabel: "À l'instant",
        },
        ...prev,
      ]);
    }
  };

  const handleResetSession = () => {
    setSessionStatus("lobby");
    setFeedback("La partie a été réinitialisée en salle d'attente.");
  };

  const handleKickPlayer = (playerId: string) => {
    setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    setFeedback("Joueur retiré de la partie.");
  };

  const handleToggleGameActive = (gameId: string) => {
    setGames((prev) =>
      prev.map((g) => (g.id === gameId ? { ...g, isActive: !g.isActive } : g))
    );
  };

  return (
    <main className="min-h-screen bg-tvos-bg px-5 py-7 text-white lg:px-10 lg:py-9">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(circle at 80% 10%, rgba(10, 132, 255, 0.16) 0%, transparent 50%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 mx-auto max-w-7xl space-y-7"
      >
        {/* En-tête Régie */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
              Console Animateur & Administrateur
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              Pilotage des Parties
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/tv")}
              className="tvos-glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white/85 hover:bg-white/15"
            >
              <Tv className="h-4 w-4 text-tvos-accent" />
              Catalogue TV
            </button>
            <button
              type="button"
              onClick={() => router.push(`/tv/${sessionCode}`)}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-black hover:bg-white/90"
            >
              <ExternalLink className="h-4 w-4" />
              Ouvrir l&apos;écran TV ({sessionCode})
            </button>
          </div>
        </header>

        {feedback ? (
          <div className="flex items-center gap-2.5 rounded-2xl border border-tvos-accent/35 bg-tvos-accent/10 px-4 py-3 text-xs font-medium text-white">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-tvos-accent" />
            <span>{feedback}</span>
          </div>
        ) : null}

        {/* Contrôle de session & Jeu */}
        <div className="grid gap-6 lg:grid-cols-12">
          <GlassPanel className="space-y-6 p-6 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-white/55">
                  Session active
                </span>
                <div className="mt-1 flex items-center gap-3">
                  <span className="font-mono text-3xl font-black tracking-[0.2em] text-tvos-accent">
                    {sessionCode}
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase text-white/80">
                    {sessionStatus}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreateSession}
                className="rounded-2xl bg-white/15 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/25"
              >
                Générer une nouvelle partie
              </button>
            </div>

            <div>
              <label
                htmlFor="admin-game-select"
                className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/65"
              >
                Jeu sélectionné
              </label>
              <select
                id="admin-game-select"
                value={selectedGameId}
                onChange={(e) => setSelectedGameId(e.target.value)}
                className="w-full rounded-2xl border border-white/15 bg-tvos-surface px-4 py-3 text-sm font-semibold text-white focus:border-tvos-accent focus:outline-none"
              >
                {games.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.title} {game.isActive ? "" : "(Masqué)"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-white/65">
                Commandes de la partie
              </span>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => handleStatusChange("playing")}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-black hover:bg-emerald-400"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Démarrer / Reprendre
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange("paused")}
                  className="inline-flex items-center gap-2 rounded-2xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-black hover:bg-amber-300"
                >
                  <Pause className="h-4 w-4" />
                  Pause
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange("round_result")}
                  className="tvos-glass inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold text-white hover:bg-white/15"
                >
                  Résultats manche
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange("finished")}
                  className="inline-flex items-center gap-2 rounded-2xl bg-rose-500/80 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-500"
                >
                  <Square className="h-4 w-4" />
                  Terminer
                </button>
                <button
                  type="button"
                  onClick={handleResetSession}
                  className="tvos-glass inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold text-white/80 hover:bg-white/15"
                >
                  <RotateCcw className="h-4 w-4" />
                  Réinitialiser
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-white/10 pt-4">
              <div className="flex items-center gap-2.5 text-xs text-white/75">
                <QrCode className="h-4 w-4 text-tvos-accent" />
                <span>QR code visible sur l&apos;écran TV</span>
              </div>
              <button
                type="button"
                onClick={() => setShowQrOnTv((prev) => !prev)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                  showQrOnTv
                    ? "bg-white text-black"
                    : "bg-white/10 text-white/70"
                }`}
              >
                {showQrOnTv ? "Affiché" : "Masqué"}
              </button>
            </div>
          </GlassPanel>

          {/* Joueurs & Scores */}
          <div className="space-y-6 lg:col-span-5">
            <GlassPanel className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-tvos-accent" />
                  <h2 className="text-lg font-bold">Joueurs connectés</h2>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-0.5 text-xs font-bold">
                  {players.length}
                </span>
              </div>

              {players.length === 0 ? (
                <p className="py-4 text-xs text-white/55">
                  Aucun joueur connecté pour l&apos;instant. La liste se
                  synchronisera automatiquement à l&apos;Étape 6.
                </p>
              ) : (
                <ul className="space-y-2">
                  {players.map((player) => (
                    <li
                      key={player.id}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm"
                    >
                      <span className="font-semibold">{player.nickname}</span>
                      <button
                        type="button"
                        onClick={() => handleKickPlayer(player.id)}
                        aria-label={`Exclure ${player.nickname}`}
                        className="rounded-lg p-1.5 text-rose-300 hover:bg-rose-500/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </GlassPanel>

            <LiveLeaderboard scores={scores} title="Suivi des scores" />
          </div>
        </div>

        {/* Catalogue des jeux & Historique */}
        <div className="grid gap-6 lg:grid-cols-12">
          <GlassPanel className="p-6 lg:col-span-6">
            <div className="mb-4 flex items-center gap-2">
              <Gamepad2 className="h-5 w-5 text-tvos-accent" />
              <h2 className="text-lg font-bold">Catalogue des jeux</h2>
            </div>

            <div className="space-y-3">
              {games.map((game) => (
                <div
                  key={game.id}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-bold">{game.title}</p>
                    <p className="text-xs text-white/55">{game.tagline}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleGameActive(game.id)}
                    className={`rounded-full px-3.5 py-1 text-xs font-bold ${
                      game.isActive
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-white/10 text-white/55"
                    }`}
                  >
                    {game.isActive ? "Actif" : "Masqué"}
                  </button>
                </div>
              ))}
            </div>
          </GlassPanel>

          <GlassPanel className="p-6 lg:col-span-6">
            <div className="mb-4 flex items-center gap-2">
              <History className="h-5 w-5 text-tvos-accent" />
              <h2 className="text-lg font-bold">Historique des parties</h2>
            </div>

            <div className="space-y-3">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-bold">
                      {item.gameTitle}{" "}
                      <span className="ml-2 font-mono text-xs text-tvos-accent">
                        {item.code}
                      </span>
                    </p>
                    <p className="text-xs text-white/55">
                      {item.createdAtLabel} • {item.playerCount} joueur(s)
                    </p>
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/75">
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </GlassPanel>
        </div>
      </motion.div>
    </main>
  );
}
