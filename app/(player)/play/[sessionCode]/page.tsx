"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Gamepad2,
  Trophy,
  Wifi,
  WifiOff,
  Send,
  Sparkles,
} from "lucide-react";
import type {
  GameContent,
  GameSession,
  PlayerScore,
  SessionPlayer,
} from "@/types/game.types";

interface PlayerIdentity {
  playerId: string;
  nickname: string;
  avatar?: string | null;
}

export default function PlayerControllerPage() {
  const params = useParams<{ sessionCode: string }>();
  const sessionCode = (params?.sessionCode ?? "").toUpperCase();

  const [identity, setIdentity] = useState<PlayerIdentity | null>(null);
  const [nicknameInput, setNicknameInput] = useState<string>("");
  const [session, setSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [scores, setScores] = useState<PlayerScore[]>([]);
  const [currentContent, setCurrentContent] = useState<GameContent | null>(null);
  const [answerInput, setAnswerInput] = useState<string>("");
  const [submittedRound, setSubmittedRound] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string>("");

  useEffect(() => {
    if (!sessionCode) return;
    try {
      const saved = localStorage.getItem(`player_identity_${sessionCode}`);
      if (saved) {
        const parsed = JSON.parse(saved) as PlayerIdentity;
        if (parsed?.playerId && parsed?.nickname) {
          setIdentity(parsed);
          setNicknameInput(parsed.nickname);
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, [sessionCode]);

  useEffect(() => {
    if (!sessionCode) return;

    const handleOnline = () => setIsConnected(true);
    const handleOffline = () => setIsConnected(false);

    setIsConnected(typeof navigator !== "undefined" ? navigator.onLine : true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [sessionCode]);

  const myScore = useMemo(() => {
    if (!identity) return 0;
    return (
      scores.find((s) => s.player_id === identity.playerId)?.score ?? 0
    );
  }, [identity, scores]);

  const handleJoinGame = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = nicknameInput.trim();
    if (!cleanName) return;

    const newIdentity: PlayerIdentity = {
      playerId:
        identity?.playerId ??
        `player-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      nickname: cleanName,
      avatar: identity?.avatar ?? "🎮",
    };

    setIdentity(newIdentity);

    try {
      localStorage.setItem(
        `player_identity_${sessionCode}`,
        JSON.stringify(newIdentity)
      );
    } catch {
      // Ignore storage errors
    }

    setPlayers((prev) => {
      const exists = prev.some((p) => p.id === newIdentity.playerId);
      if (exists) {
        return prev.map((p) =>
          p.id === newIdentity.playerId
            ? { ...p, nickname: newIdentity.nickname, is_connected: true }
            : p
        );
      }
      return [
        ...prev,
        {
          id: newIdentity.playerId,
          session_id: session?.id ?? sessionCode,
          nickname: newIdentity.nickname,
          avatar: newIdentity.avatar ?? "🎮",
          is_host: false,
          is_connected: true,
        },
      ];
    });

    setScores((prev) => {
      const exists = prev.some((s) => s.player_id === newIdentity.playerId);
      if (exists) return prev;
      return [
        ...prev,
        {
          id: `score-${newIdentity.playerId}`,
          session_id: session?.id ?? sessionCode,
          player_id: newIdentity.playerId,
          score: 0,
        },
      ];
    });

    setStatusMessage("Connecté à la partie !");
  };

  const handleSubmitAnswer = (
    e?: React.FormEvent,
    directOption?: string
  ) => {
    if (e) e.preventDefault();
    if (!identity) return;

    const valueToSend = (directOption ?? answerInput).trim();
    if (!valueToSend) return;

    const round = session?.current_round ?? 1;
    setSubmittedRound(round);
    setStatusMessage(`Réponse envoyée : "${valueToSend}"`);
    if (!directOption) {
      setAnswerInput("");
    }
  };

  const roundStatus = session?.status ?? "lobby";
  const currentRound = session?.current_round ?? 1;
  const alreadySubmittedThisRound = submittedRound === currentRound;

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col justify-between p-5 select-none">
      <div className="max-w-md w-full mx-auto space-y-6">
        {/* Top Bar */}
        <header className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-neutral-400">
              Salle
            </div>
            <div className="font-mono text-xl font-bold tracking-widest text-amber-400">
              {sessionCode || "----"}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="font-mono font-bold text-sm">{myScore} pts</span>
            </div>

            <div
              className={`p-2 rounded-xl border ${
                isConnected
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-300"
              }`}
              title={isConnected ? "Connecté" : "Hors ligne"}
            >
              {isConnected ? (
                <Wifi className="w-4 h-4" />
              ) : (
                <WifiOff className="w-4 h-4" />
              )}
            </div>
          </div>
        </header>

        {/* Join Form or Controller */}
        {!identity ? (
          <form
            onSubmit={handleJoinGame}
            className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4"
          >
            <div className="flex items-center gap-2 text-amber-400 text-xs uppercase tracking-wider font-semibold">
              <Sparkles className="w-4 h-4" />
              <span>Rejoindre la partie</span>
            </div>

            <h1 className="text-2xl font-bold">Choisis ton pseudo</h1>

            <input
              type="text"
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              placeholder="Ton pseudo..."
              maxLength={24}
              className="w-full rounded-2xl bg-black/40 border border-white/15 px-4 py-3 text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-400"
            />

            <button
              type="submit"
              disabled={!nicknameInput.trim()}
              className="w-full py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-black font-bold transition"
            >
              Entrer dans la salle
            </button>
          </form>
        ) : (
          <main className="space-y-5">
            {/* Player Status Card */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{identity.avatar ?? "🎮"}</span>
                <div>
                  <div className="font-bold text-lg">{identity.nickname}</div>
                  <div className="text-xs text-neutral-400">
                    Manche {currentRound} • État :{" "}
                    <span className="text-white uppercase">{roundStatus}</span>
                  </div>
                </div>
              </div>
              <Gamepad2 className="w-6 h-6 text-neutral-400" />
            </div>

            {/* Active Question / Action Zone */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
              {currentContent?.question && (
                <p className="text-base font-semibold leading-snug">
                  {currentContent.question}
                </p>
              )}

              {currentContent?.options && currentContent.options.length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {currentContent.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={alreadySubmittedThisRound}
                      onClick={() => handleSubmitAnswer(undefined, opt)}
                      className="w-full text-left py-3.5 px-4 rounded-2xl bg-white/10 hover:bg-white/20 disabled:opacity-40 font-medium transition"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <form onSubmit={handleSubmitAnswer} className="space-y-3">
                  <input
                    type="text"
                    value={answerInput}
                    onChange={(e) => setAnswerInput(e.target.value)}
                    disabled={alreadySubmittedThisRound}
                    placeholder="Entre ta réponse..."
                    className="w-full rounded-2xl bg-black/40 border border-white/15 px-4 py-3 text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-400 disabled:opacity-40"
                  />
                  <button
                    type="submit"
                    disabled={
                      alreadySubmittedThisRound || !answerInput.trim()
                    }
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-bold transition"
                  >
                    <Send className="w-4 h-4" />
                    <span>
                      {alreadySubmittedThisRound
                        ? "Réponse envoyée"
                        : "Envoyer"}
                    </span>
                  </button>
                </form>
              )}

              {statusMessage && (
                <p className="text-xs text-emerald-300 text-center pt-1">
                  {statusMessage}
                </p>
              )}
            </div>

            {/* Connected Players Preview */}
            {players.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-3xl p-4">
                <div className="text-xs uppercase tracking-wider text-neutral-400 mb-2">
                  Joueurs ({players.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {players.map((p) => (
                    <span
                      key={p.id}
                      className="text-xs bg-white/10 px-3 py-1.5 rounded-full"
                    >
                      {p.avatar ?? "🎮"} {p.nickname}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </main>
        )}
      </div>

      <footer className="text-center text-[11px] text-neutral-500 pt-6">
        Manette Joueur • {sessionCode || "—"}
      </footer>
    </div>
  );
}
