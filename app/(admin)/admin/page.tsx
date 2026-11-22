"use client";

import React, { useEffect, useState } from "react";
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
  AlertTriangle,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getUniquePlayerColor } from "@/lib/colorsplayer";
import { INITIAL_GAMES, type CatalogGame } from "@/features/games/catalog";
import type {
  GameSession,
  PlayerScore,
  PlayerSession,
  SessionStatus,
} from "@/types/game.types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | undefined | null): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function generateSessionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function AdminConsolePage() {
  const supabase = getSupabaseBrowserClient();

  const [games, setGames] = useState<CatalogGame[]>(INITIAL_GAMES);
  const [selectedGameId, setSelectedGameId] = useState<string>(
    INITIAL_GAMES[0]?.id ?? ""
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionCode, setSessionCode] = useState<string>(() =>
    generateSessionCode()
  );
  const [status, setStatus] = useState<SessionStatus>("lobby");
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [showQrOnTv, setShowQrOnTv] = useState<boolean>(true);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [isSavingSession, setIsSavingSession] = useState<boolean>(false);
  const [dbError, setDbError] = useState<string | null>(null);

  const [players, setPlayers] = useState<PlayerSession[]>([]);
  const [scores, setScores] = useState<PlayerScore[]>([]);

  const selectedGame =
    games.find((g) => g.id === selectedGameId) ?? games[0];

  const resolveValidGameUuid = (
    candidateGame?: CatalogGame | null
  ): string | null => {
    if (isUuid(candidateGame?.id)) {
      return candidateGame.id;
    }
    const matchedBySlug = candidateGame?.slug
      ? games.find((g) => g.slug === candidateGame.slug && isUuid(g.id))
      : undefined;
    if (matchedBySlug?.id) {
      return matchedBySlug.id;
    }
    const firstDbUuidGame = games.find((g) => isUuid(g.id));
    return firstDbUuidGame?.id ?? null;
  };

  const loadPlayersAndScoresForSession = async (targetSessionId: string) => {
    if (!supabase || !isUuid(targetSessionId)) return;

    const [{ data: playersData, error: pErr }, { data: scoresData, error: sErr }] =
      await Promise.all([
        supabase
          .from("session_players")
          .select("*")
          .eq("session_id", targetSessionId)
          .order("id", { ascending: true }),
        supabase
          .from("player_scores")
          .select("*")
          .eq("session_id", targetSessionId),
      ]);

    if (pErr) {
      setDbError(`Lecture joueurs impossible : ${pErr.message}`);
    } else if (playersData) {
      setPlayers(playersData as PlayerSession[]);
    }

    if (sErr) {
      setDbError(`Lecture scores impossible : ${sErr.message}`);
    } else if (scoresData) {
      setScores(scoresData as PlayerScore[]);
    }
  };

  useEffect(() => {
    if (!supabase || !sessionId || !isUuid(sessionId)) return;

    let active = true;

    const refresh = async () => {
      if (!active) return;
      await loadPlayersAndScoresForSession(sessionId);
    };

    void refresh();

    const channel = supabase
      .channel(`admin-session-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_players",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_scores",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, sessionId]);

  const syncSessionToDb = async (params: {
    id?: string | null;
    code: string;
    game?: CatalogGame | null;
    nextStatus: SessionStatus;
    round: number;
    qrVisible: boolean;
  }) => {
    if (!supabase) {
      setDbError(
        "Client Supabase non initialisé (vérifier NEXT_PUBLIC_SUPABASE_URL / ANON_KEY)."
      );
      return;
    }

    const validGameUuid = resolveValidGameUuid(params.game ?? selectedGame);
    if (!validGameUuid) {
      setDbError(
        "Aucun UUID de jeu trouvé dans la table 'games' Supabase. Vérifie les permissions SELECT sur 'games'."
      );
      return;
    }

    setIsSavingSession(true);
    setDbError(null);
    try {
      const payload = {
        code: params.code,
        game_id: validGameUuid,
        status: params.nextStatus,
        current_round: params.round,
        show_qr: params.qrVisible,
      };

      if (params.id) {
        const { error } = await supabase
          .from("game_sessions")
          .update(payload)
          .eq("id", params.id);
        if (error) {
          setDbError(`Mise à jour session impossible : ${error.message}`);
        }
      } else {
        const { data, error } = await supabase
          .from("game_sessions")
          .insert(payload)
          .select()
          .single<GameSession>();
        if (error) {
          setDbError(`Création session impossible : ${error.message}`);
        } else if (data?.id) {
          setSessionId(data.id);
          setPlayers([]);
          setScores([]);
          await loadPlayersAndScoresForSession(data.id);
        }
      }
    } finally {
      setIsSavingSession(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (!supabase) {
        if (!cancelled) {
          setDbError("Client Supabase non initialisé.");
        }
        return;
      }

      const { data: dbGames, error: gamesError } = await supabase
        .from("games")
        .select("id, slug, title, tagline, min_players, max_players, is_active")
        .order("title", { ascending: true });

      if (gamesError && !cancelled) {
        setDbError(`Lecture table 'games' impossible : ${gamesError.message}`);
      }

      const rows = Array.isArray(dbGames) ? (dbGames as CatalogGame[]) : [];
      const validRows = rows.filter((g) => isUuid(g.id));

      if (!cancelled && validRows.length > 0) {
        setGames(validRows);
        const firstUuidGame = validRows[0];
        if (firstUuidGame) {
          setSelectedGameId(firstUuidGame.id);
          await syncSessionToDb({
            id: null,
            code: sessionCode,
            game: firstUuidGame,
            nextStatus: status,
            round: currentRound,
            qrVisible: showQrOnTv,
          });
        }
      } else if (!cancelled) {
        setDbError(
          "Impossible de récupérer les UUID des jeux depuis Supabase ('public.games')."
        );
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateNewSession = async () => {
    const newCode = generateSessionCode();
    setSessionId(null);
    setSessionCode(newCode);
    setStatus("lobby");
    setCurrentRound(1);
    setPlayers([]);
    setScores([]);

    await syncSessionToDb({
      id: null,
      code: newCode,
      game: selectedGame,
      nextStatus: "lobby",
      round: 1,
      qrVisible: showQrOnTv,
    });
  };

  const handleStatusChange = async (nextStatus: SessionStatus) => {
    setStatus(nextStatus);
    await syncSessionToDb({
      id: sessionId,
      code: sessionCode,
      game: selectedGame,
      nextStatus,
      round: currentRound,
      qrVisible: showQrOnTv,
    });
  };

  const handleNextRound = async () => {
    const nextRound = currentRound + 1;
    setCurrentRound(nextRound);
    await syncSessionToDb({
      id: sessionId,
      code: sessionCode,
      game: selectedGame,
      nextStatus: status,
      round: nextRound,
      qrVisible: showQrOnTv,
    });
  };

  const handleToggleQr = async () => {
    const nextQr = !showQrOnTv;
    setShowQrOnTv(nextQr);
    await syncSessionToDb({
      id: sessionId,
      code: sessionCode,
      game: selectedGame,
      nextStatus: status,
      round: currentRound,
      qrVisible: nextQr,
    });
  };

  const handleSelectGame = async (gameId: string) => {
    const targetGame = games.find((g) => g.id === gameId) ?? null;
    setSelectedGameId(gameId);
    await syncSessionToDb({
      id: sessionId,
      code: sessionCode,
      game: targetGame,
      nextStatus: status,
      round: currentRound,
      qrVisible: showQrOnTv,
    });
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

  const getPlayerScoreValue = (playerId: string): number => {
    const match = scores.find((s) => s.player_id === playerId);
    if (!match) return 0;
    const record = match as unknown as {
      total_score?: number;
      score?: number;
    };
    return record.total_score ?? record.score ?? 0;
  };

  const handleKickPlayer = async (playerId: string) => {
    setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    setScores((prev) => prev.filter((s) => s.player_id !== playerId));

    if (!supabase || !sessionId || !isUuid(sessionId)) return;

    const [{ error: sErr }, { error: pErr }] = await Promise.all([
      supabase
        .from("player_scores")
        .delete()
        .eq("session_id", sessionId)
        .eq("player_id", playerId),
      supabase
        .from("session_players")
        .delete()
        .eq("session_id", sessionId)
        .eq("id", playerId),
    ]);

    if (sErr || pErr) {
      setDbError(
        `Exclusion joueur impossible : ${sErr?.message ?? pErr?.message}`
      );
    }
  };

  const handleAdjustScore = async (playerId: string, delta: number) => {
    const current = getPlayerScoreValue(playerId);
    const nextScore = Math.max(0, current + delta);

    setScores((prev) => {
      const exists = prev.some((s) => s.player_id === playerId);
      if (exists) {
        return prev.map((s) =>
          s.player_id === playerId
            ? ({ ...s, total_score: nextScore, score: nextScore } as PlayerScore)
            : s
        );
      }
      return [
        ...prev,
        {
          id: `score-${playerId}`,
          session_id: sessionId ?? sessionCode,
          player_id: playerId,
          total_score: nextScore,
          score: nextScore,
        } as unknown as PlayerScore,
      ];
    });

    if (!supabase || !sessionId || !isUuid(sessionId)) return;

    const targetPlayer = players.find((p) => p.id === playerId);
    const { error } = await supabase.from("player_scores").upsert(
      {
        session_id: sessionId,
        player_id: playerId,
        nickname: targetPlayer?.nickname ?? "Joueur",
        avatar_id:
          (targetPlayer as unknown as { avatar_id?: string })?.avatar_id ??
          "gamepad",
        total_score: nextScore,
      },
      { onConflict: "session_id,player_id" }
    );

    if (error) {
      setDbError(`Mise à jour score impossible : ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-5 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/10 pb-5">
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
              disabled={isSavingSession}
              className="px-4 py-2.5 rounded-2xl bg-white text-black font-semibold text-sm hover:bg-neutral-200 disabled:opacity-60 transition"
            >
              {isSavingSession ? "Enregistrement..." : "Nouvelle Salle"}
            </button>
          </div>
        </header>

        {dbError ? (
          <div className="flex items-center gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-200">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{dbError}</span>
          </div>
        ) : null}

        {/* Layout 2 colonnes : Contrôles & Jeux à gauche, Joueurs à droite */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Colonne gauche : État de partie, Écran TV et Catalogue */}
          <main className="lg:col-span-7 xl:col-span-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* État de la partie */}
              <section className="md:col-span-2 bg-white/5 border border-white/10 rounded-3xl p-6 space-y-6">
                <div className="flex items-center justify-between gap-2">
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
                    className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider shrink-0 ${
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

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => void handleStatusChange("playing")}
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold transition"
                  >
                    <Play className="w-4 h-4" />
                    <span>Lancer</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleStatusChange("paused")}
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-semibold transition"
                  >
                    <Pause className="w-4 h-4" />
                    <span>Pause</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleNextRound()}
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-semibold transition"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Manche +1</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleStatusChange("finished")}
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-semibold transition"
                  >
                    <Square className="w-4 h-4" />
                    <span>Terminer</span>
                  </button>
                </div>
              </section>

              {/* Options écran TV */}
              <section className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col justify-between space-y-4">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <QrCode className="w-5 h-5 text-sky-400" />
                    <span>Écran TV</span>
                  </h2>
                  <p className="text-sm text-neutral-400 mt-1">
                    QR code de connexion sur la télévision.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleToggleQr()}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/20 font-medium transition"
                >
                  {showQrOnTv ? (
                    <>
                      <EyeOff className="w-4 h-4 text-amber-400" />
                      <span>Masquer QR</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 text-emerald-400" />
                      <span>Afficher QR</span>
                    </>
                  )}
                </button>
              </section>
            </div>

            {/* Catalogue des jeux */}
            <section className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Gamepad2 className="w-5 h-5 text-purple-400" />
                  <span>Catalogue des jeux</span>
                </h2>
                <span className="text-xs text-neutral-400">
                  {games.filter((g) => g.is_active).length} / {games.length}{" "}
                  actifs
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {games.map((game) => {
                  const isSelected = game.id === selectedGame?.id;
                  return (
                    <div
                      key={game.id}
                      onClick={() => void handleSelectGame(game.id)}
                      className={`cursor-pointer rounded-2xl p-4 border transition flex flex-col justify-between gap-4 ${
                        isSelected
                          ? "bg-white/15 border-white/40"
                          : "bg-black/30 border-white/10 hover:border-white/25"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-semibold text-base">
                            {game.title}
                          </h3>
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
                                <span className="text-neutral-400">
                                  Inactif
                                </span>
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
          </main>

          {/* Colonne droite : Joueurs connectés & Modération */}
          <aside className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-6 bg-white/5 border border-white/10 rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                <span>Joueurs ({players.length})</span>
              </h2>
              <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Scores</span>
              </div>
            </div>

            {players.length === 0 ? (
              <p className="text-sm text-neutral-400 py-8 text-center">
                Aucun joueur connecté pour le moment.
              </p>
            ) : (
              <div className="space-y-3 max-h-[calc(100vh-14rem)] overflow-y-auto pr-1">
                {players.map((player) => {
                  const color = getUniquePlayerColor(player.id, players);

                  return (
                    <div
                      key={player.id}
                      style={{
                        backgroundColor: color.bgHex,
                        borderColor: color.borderHex,
                        color: color.textHex,
                      }}
                      className="p-3.5 rounded-2xl border-2 space-y-3 shadow-md"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            style={{ backgroundColor: color.badgeBgHex }}
                            className="text-xl flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                          >
                            {player.avatar ?? "🎮"}
                          </span>
                          <div className="min-w-0">
                            <div className="font-bold truncate flex items-center gap-1.5">
                              <span className="truncate">{player.nickname}</span>
                              {player.is_host && (
                                <span
                                  style={{ backgroundColor: color.badgeBgHex }}
                                  className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0"
                                >
                                  Hôte
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] opacity-90 block">
                              {player.is_connected ? "Connecté" : "Déconnecté"}
                            </span>
                          </div>
                        </div>

                        {!player.is_host && (
                          <button
                            type="button"
                            onClick={() => void handleKickPlayer(player.id)}
                            className="px-2.5 py-1.5 rounded-xl bg-black/35 hover:bg-black/55 text-xs font-bold transition shrink-0"
                          >
                            Exclure
                          </button>
                        )}
                      </div>

                      {/* Contrôles score -1 / +1 */}
                      <div
                        style={{ backgroundColor: color.badgeBgHex }}
                        className="flex items-center justify-between rounded-xl px-3 py-1.5"
                      >
                        <button
                          type="button"
                          onClick={() => void handleAdjustScore(player.id, -1)}
                          className="px-3 py-1 rounded-lg bg-black/30 hover:bg-black/50 text-sm font-black transition"
                        >
                          -1
                        </button>
                        <span
                          style={{ color: color.scoreHex }}
                          className="font-mono text-lg font-black text-center"
                        >
                          {getPlayerScoreValue(player.id)} pts
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleAdjustScore(player.id, 1)}
                          className="px-3 py-1 rounded-lg bg-black/30 hover:bg-black/50 text-sm font-black transition"
                        >
                          +1
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
