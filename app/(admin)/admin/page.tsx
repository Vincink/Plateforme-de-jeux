"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Play,
  Pause,
  RotateCcw,
  Square,
  Users,
  Trophy,
  QrCode,
  Eye,
  EyeOff,
  Gamepad2,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { INITIAL_GAMES, type CatalogGame } from "@/features/games/catalog";
import type {
  PlayerScore,
  PlayerSession,
  SessionStatus,
} from "@/types/game.types";

function generateSessionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function AdminConsolePage() {
  const [games, setGames] = useState<CatalogGame[]>(INITIAL_GAMES);
  const [selectedGameSlug, setSelectedGameSlug] = useState<string>(
    INITIAL_GAMES[0]?.slug ?? "quiz"
  );
  const [sessionCode, setSessionCode] = useState<string>(() =>
    generateSessionCode()
  );
  const [status, setStatus] = useState<SessionStatus>("lobby");
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [showQrOnTv, setShowQrOnTv] = useState<boolean>(true);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  const [players, setPlayers] = useState<PlayerSession[]>([
    {
      id: "p-1",
      session_id: "demo",
      nickname: "Vincent",
      avatar: "🎮",
      is_host: true,
      is_connected: true,
    },
  ]);

  const [scores, setScores] = useState<PlayerScore[]>([
    {
      id: "s-1",
      session_id: "demo",
      player_id: "p-1",
      score: 0,
    },
  ]);

  const selectedGame =
    games.find((g) => g.slug === selectedGameSlug) ?? games[0];

  const handleCreateNewSession = () => {
    setSessionCode(generateSessionCode());
    setStatus("lobby");
    setCurrentRound(1);
    setScores((prev) => prev.map((s) => ({ ...s, score: 0 })));
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(sessionCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Ignore clipboard errors on restricted contexts
    }
  };

  const handleToggleGameActive = (gameId: string) => {
    setGames((prev) =>
      prev.map((g) =>
        g.id === gameId ? { ...g, is_active: !g.is_active } : g
      )
    );
  };

  const handleKickPlayer = (playerId: string) => {
    setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    setScores((prev) => prev.filter((s) => s.player_id !== playerId));
  };

  const handleAdjustScore = (playerId: string, delta: number) => {
    setScores((prev) =>
      prev.map((s) =>
        s.player_id === playerId
          ? { ...s, score: Math.max(0, s.score + delta) }
          : s
      )
    );
  };

  const getPlayerScore = (playerId: string): number => {
    return scores.find((s) => s.player_id === playerId)?.score ?? 0;
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-neutral-400">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Console Animateur</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight mt-1">
              Contrôle de Partie
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5">
              <span className="text-xs text-neutral-400 uppercase tracking-wider">
                Code Salle
              </span>
              <span className="font-mono text-2xl font-bold tracking-widest text-amber-400">
                {sessionCode}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 transition"
                title="Copier le code"
              >
                {copiedCode ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4 text-neutral-300" />
                )}
              </button>
            </div>

            <Link
              href={`/tv/${sessionCode}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 font-semibold text-sm transition"
            >
              <span>Ouvrir TV</span>
              <ExternalLink className="w-4 h-4" />
            </Link>

            <button
              type="button"
              onClick={handleCreateNewSession}
              className="px-4 py-2.5 rounded-2xl bg-white text-black font-semibold text-sm hover:bg-neutral-200 transition"
            >
              Nouvelle Salle
            </button>
          </div>
        </header>

        {/* Contrôles de session & Affichage TV */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-3xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">État de la partie</h2>
                <p className="text-sm text-neutral-400">
                  Jeu actif :{" "}
                  <span className="text-white font-medium">
                    {selectedGame?.title ?? "Aucun"}
                  </span>{" "}
                  • Manche {currentRound}
                </p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                  status === "playing"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : status === "paused"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : status === "finished"
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                    : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                }`}
              >
                {status}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => setStatus("playing")}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold transition"
              >
                <Play className="w-4 h-4" />
                <span>Lancer</span>
              </button>

              <button
                type="button"
                onClick={() => setStatus("paused")}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-semibold transition"
              >
                <Pause className="w-4 h-4" />
                <span>Pause</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentRound((r) => r + 1)}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-semibold transition"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Manche +1</span>
              </button>

              <button
                type="button"
                onClick={() => setStatus("finished")}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-semibold transition"
              >
                <Square className="w-4 h-4" />
                <span>Terminer</span>
              </button>
            </div>
          </div>

          {/* Options écran TV */}
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col justify-between space-y-4">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <QrCode className="w-5 h-5 text-sky-400" />
                <span>Écran TV</span>
              </h2>
              <p className="text-sm text-neutral-400 mt-1">
                Affiche ou masque le QR code de connexion sur la télévision.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowQrOnTv((prev) => !prev)}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/20 font-medium transition"
            >
              {showQrOnTv ? (
                <>
                  <EyeOff className="w-4 h-4 text-amber-400" />
                  <span>Masquer le QR Code</span>
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 text-emerald-400" />
                  <span>Afficher le QR Code</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Catalogue des jeux */}
        <section className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Gamepad2 className="w-5 h-5 text-purple-400" />
              <span>Catalogue des jeux</span>
            </h2>
            <span className="text-xs text-neutral-400">
              {games.filter((g) => g.is_active).length} / {games.length} actifs
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {games.map((game) => {
              const isSelected = game.slug === selectedGameSlug;
              return (
                <div
                  key={game.id}
                  onClick={() => setSelectedGameSlug(game.slug)}
                  className={`cursor-pointer rounded-2xl p-4 border transition flex flex-col justify-between gap-4 ${
                    isSelected
                      ? "bg-white/15 border-white/40"
                      : "bg-black/30 border-white/10 hover:border-white/25"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-base">{game.title}</h3>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleGameActive(game.id);
                        }}
                        className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15"
                      >
                        {game.is_active ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-300">Actif</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-neutral-500" />
                            <span className="text-neutral-400">Inactif</span>
                          </>
                        )}
                      </button>
                    </div>
                    {game.tagline && (
                      <p className="text-xs text-neutral-400 mt-1">
                        {game.tagline}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-neutral-400 pt-2 border-t border-white/5">
                    <span>
                      {game.min_players}–{game.max_players ?? "∞"} joueurs
                    </span>
                    {isSelected && (
                      <span className="text-amber-400 font-medium">
                        Sélectionné
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Joueurs & Scores */}
        <section className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-400" />
              <span>Joueurs connectés ({players.length})</span>
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-neutral-400">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Modération & Scores</span>
            </div>
          </div>

          {players.length === 0 ? (
            <p className="text-sm text-neutral-400 py-6 text-center">
              Aucun joueur connecté pour le moment.
            </p>
          ) : (
            <div className="divide-y divide-white/10">
              {players.map((player) => (
                <div
                  key={player.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{player.avatar ?? "👤"}</span>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        <span>{player.nickname}</span>
                        {player.is_host && (
                          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                            Hôte
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-neutral-400">
                        {player.is_connected ? "Connecté" : "Déconnecté"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => handleAdjustScore(player.id, -1)}
                        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-sm font-bold"
                      >
                        -1
                      </button>
                      <span className="font-mono font-bold min-w-[3ch] text-center">
                        {getPlayerScore(player.id)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAdjustScore(player.id, 1)}
                        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-sm font-bold"
                      >
                        +1
                      </button>
                    </div>

                    {!player.is_host && (
                      <button
                        type="button"
                        onClick={() => handleKickPlayer(player.id)}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-medium transition"
                      >
                        Exclure
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
