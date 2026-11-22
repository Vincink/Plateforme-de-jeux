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
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getNextAvailableColorIndex,
  getUniquePlayerColor,
} from "@/lib/colorsplayer";
import type {
  GameContent,
  GameSession,
  PlayerScore,
  SessionPlayer,
} from "@/types/game.types";

interface PlayerIdentity {
  playerId: string;
  playerToken: string;
  nickname: string;
  avatarId: string;
  avatar: string;
}

type QuizContentRow = GameContent & {
  prompt?: string | null;
  question?: string | null;
  points?: number | null;
  round_type?: string | null;
};

export default function PlayerControllerPage() {
  const params = useParams<{ sessionCode: string }>();
  const sessionCode = (params?.sessionCode ?? "").toUpperCase();
  const supabase = getSupabaseBrowserClient();

  const [identity, setIdentity] = useState<PlayerIdentity | null>(null);
  const [nicknameInput, setNicknameInput] = useState<string>("");
  const [session, setSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [scores, setScores] = useState<PlayerScore[]>([]);
  const [currentContent, setCurrentContent] = useState<QuizContentRow | null>(
    null
  );
  const [answerInput, setAnswerInput] = useState<string>("");
  const [submittedRound, setSubmittedRound] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  useEffect(() => {
    if (!sessionCode) return;
    try {
      const saved = localStorage.getItem(`player_identity_${sessionCode}`);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<PlayerIdentity>;
        if (parsed?.playerId && parsed?.nickname) {
          const restored: PlayerIdentity = {
            playerId: parsed.playerId,
            playerToken:
              parsed.playerToken ??
              `tok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            nickname: parsed.nickname,
            avatarId: parsed.avatarId ?? "gamepad",
            avatar: parsed.avatar ?? "🎮",
          };
          setIdentity(restored);
          setNicknameInput(restored.nickname);
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

  useEffect(() => {
    if (!supabase || !sessionCode) return;

    let isMounted = true;
    let childrenChannel: ReturnType<typeof supabase.channel> | null = null;
    let contentChannel: ReturnType<typeof supabase.channel> | null = null;

    const loadPlayersAndScores = async (targetSessionId: string) => {
      const [{ data: playersData }, { data: scoresData }] = await Promise.all([
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

      if (!isMounted) return;
      const nextPlayers = (playersData as SessionPlayer[] | null) ?? [];
      setPlayers(nextPlayers);

      if (scoresData) {
        setScores(scoresData as PlayerScore[]);
      }

      try {
        const saved = localStorage.getItem(`player_identity_${sessionCode}`);
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<PlayerIdentity>;
          if (
            parsed?.playerId &&
            !nextPlayers.some((p) => p.id === parsed.playerId)
          ) {
            localStorage.removeItem(`player_identity_${sessionCode}`);
            setIdentity(null);
            setStatusMessage("Tu as été exclu de la partie.");
          }
        }
      } catch {
        // Ignore storage errors
      }
    };

    const loadActiveContent = async (
      targetGameId: string | null | undefined,
      roundNumber: number
    ) => {
      if (!targetGameId) {
        if (isMounted) setCurrentContent(null);
        return;
      }
      const { data } = await supabase
        .from("game_contents")
        .select("*")
        .eq("game_id", targetGameId)
        .order("sort_order", { ascending: true });

      if (!isMounted) return;
      const items = Array.isArray(data) ? (data as QuizContentRow[]) : [];
      const idx = Math.max(0, roundNumber - 1);
      setCurrentContent(items[idx] ?? null);
    };

    const bindSessionData = (targetSession: GameSession) => {
      if (childrenChannel) {
        void supabase.removeChannel(childrenChannel);
      }
      if (contentChannel) {
        void supabase.removeChannel(contentChannel);
      }

      void loadPlayersAndScores(targetSession.id);
      void loadActiveContent(
        targetSession.game_id,
        targetSession.current_round ?? 1
      );

      childrenChannel = supabase
        .channel(`play-children-${targetSession.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "session_players",
            filter: `session_id=eq.${targetSession.id}`,
          },
          () => {
            void loadPlayersAndScores(targetSession.id);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "player_scores",
            filter: `session_id=eq.${targetSession.id}`,
          },
          () => {
            void loadPlayersAndScores(targetSession.id);
          }
        )
        .subscribe();

      if (targetSession.game_id) {
        contentChannel = supabase
          .channel(`play-content-${targetSession.game_id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "game_contents",
              filter: `game_id=eq.${targetSession.game_id}`,
            },
            () => {
              void loadActiveContent(
                targetSession.game_id,
                targetSession.current_round ?? 1
              );
            }
          )
          .subscribe();
      }
    };

    const fetchInitialSession = async () => {
      const { data } = await supabase
        .from("game_sessions")
        .select("*")
        .eq("code", sessionCode)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<GameSession>();

      if (!isMounted) return;
      if (data) {
        setSession(data);
        bindSessionData(data);
      }
    };

    void fetchInitialSession();

    const sessionChannel = supabase
      .channel(`play-session-${sessionCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_sessions",
          filter: `code=eq.${sessionCode}`,
        },
        (payload) => {
          if (!isMounted) return;
          const nextRow = payload.new as GameSession | null;
          if (!nextRow) return;
          setSession(nextRow);
          bindSessionData(nextRow);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(sessionChannel);
      if (childrenChannel) {
        void supabase.removeChannel(childrenChannel);
      }
      if (contentChannel) {
        void supabase.removeChannel(contentChannel);
      }
    };
  }, [supabase, sessionCode]);

  const roundStatus = session?.status ?? "lobby";
  const currentRound = session?.current_round ?? 1;
  const alreadySubmittedThisRound = submittedRound === currentRound;
  const isPlaying = roundStatus === "playing";
  const questionText =
    currentContent?.prompt ?? currentContent?.question ?? null;
  const parsedOptions = useMemo<string[]>(() => {
    const raw = currentContent?.options as unknown;
    if (Array.isArray(raw)) {
      return raw.map((item) => String(item));
    }
    if (typeof raw === "string") {
      try {
        const decoded = JSON.parse(raw) as unknown;
        if (Array.isArray(decoded)) {
          return decoded.map((item) => String(item));
        }
      } catch {
        // Ignore invalid JSON string
      }
    }
    return [];
  }, [currentContent?.options]);

  const myScore = useMemo(() => {
    if (!identity) return 0;
    const match = scores.find((s) => s.player_id === identity.playerId);
    if (!match) return 0;
    const scoreRecord = match as unknown as {
      total_score?: number;
      score?: number;
    };
    return scoreRecord.total_score ?? scoreRecord.score ?? 0;
  }, [identity, scores]);

  const currentPlayerRecord = useMemo(() => {
    if (!identity) return undefined;
    return players.find(
      (p) =>
        p.id === identity.playerId ||
        (Boolean(identity.playerToken) &&
          (p as unknown as { player_token?: string }).player_token ===
            identity.playerToken)
    );
  }, [identity, players]);

  const myColor = useMemo(
    () =>
      getUniquePlayerColor(
        currentPlayerRecord?.id ?? identity?.playerId,
        players
      ),
    [currentPlayerRecord?.id, identity?.playerId, players]
  );

  const handleJoinGame = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = nicknameInput.trim();
    if (!cleanName || !sessionCode) return;

    setIsJoining(true);
    setStatusMessage("");

    try {
      let targetSession = session;

      if (!targetSession && supabase) {
        const { data } = await supabase
          .from("game_sessions")
          .select("*")
          .eq("code", sessionCode)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle<GameSession>();
        targetSession = data ?? null;
        if (data) {
          setSession(data);
        }
      }

      const generatedId =
        identity?.playerId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          identity.playerId
        )
          ? identity.playerId
          : crypto.randomUUID();

      const newIdentity: PlayerIdentity = {
        playerId: generatedId,
        playerToken:
          identity?.playerToken ??
          `tok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        nickname: cleanName,
        avatarId: identity?.avatarId ?? "gamepad",
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

      if (supabase && targetSession?.id) {
        const { data: currentSessionPlayers } = await supabase
          .from("session_players")
          .select("id, player_token, color_index")
          .eq("session_id", targetSession.id);

        const existingRows =
          (currentSessionPlayers as Array<{
            id: string;
            player_token?: string;
            color_index?: number | null;
          }> | null) ?? [];

        const existingSelf = existingRows.find(
          (row) =>
            row.id === newIdentity.playerId ||
            row.player_token === newIdentity.playerToken
        );

        const assignedColorIndex =
          typeof existingSelf?.color_index === "number"
            ? existingSelf.color_index
            : getNextAvailableColorIndex(existingRows);

        const { error: playerError } = await supabase
          .from("session_players")
          .upsert(
            {
              id: newIdentity.playerId,
              session_id: targetSession.id,
              nickname: newIdentity.nickname,
              avatar_id: newIdentity.avatarId,
              player_token: newIdentity.playerToken,
              color_index: assignedColorIndex,
              is_connected: true,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: "session_id,player_token" }
          );

        if (playerError) {
          setStatusMessage(`Connexion impossible : ${playerError.message}`);
          return;
        }

        await supabase.from("player_scores").upsert(
          {
            session_id: targetSession.id,
            player_id: newIdentity.playerId,
            nickname: newIdentity.nickname,
            avatar_id: newIdentity.avatarId,
            total_score: 0,
            streak: 0,
          },
          { onConflict: "session_id,player_id", ignoreDuplicates: true }
        );

        const [{ data: playersData }, { data: scoresData }] =
          await Promise.all([
            supabase
              .from("session_players")
              .select("*")
              .eq("session_id", targetSession.id)
              .order("id", { ascending: true }),
            supabase
              .from("player_scores")
              .select("*")
              .eq("session_id", targetSession.id),
          ]);

        if (playersData) setPlayers(playersData as SessionPlayer[]);
        if (scoresData) setScores(scoresData as PlayerScore[]);
      }

      setStatusMessage("Connecté à la partie !");
    } finally {
      setIsJoining(false);
    }
  };

  const handleSubmitAnswer = async (
    e?: React.FormEvent,
    directOption?: string
  ) => {
    if (e) e.preventDefault();
    if (!identity) return;

    const valueToSend = (directOption ?? answerInput).trim();
    if (!valueToSend) return;

    const round = session?.current_round ?? 1;

    if (supabase && session?.id) {
      const { error } = await supabase.from("player_actions").insert({
        session_id: session.id,
        player_id: identity.playerId,
        round_number: round,
        action_type: "answer",
        payload: { answer: valueToSend },
      });

      if (error) {
        setStatusMessage(`Envoi impossible : ${error.message}`);
        return;
      }
    }

    setSubmittedRound(round);
    setStatusMessage(`Réponse envoyée : "${valueToSend}"`);
    if (!directOption) {
      setAnswerInput("");
    }
  };

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
              disabled={!nicknameInput.trim() || isJoining}
              className="w-full py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-black font-bold transition"
            >
              {isJoining ? "Connexion..." : "Entrer dans la salle"}
            </button>
          </form>
        ) : (
          <main className="space-y-5">
            {/* Player Status Card */}
            <div
              style={{
                backgroundColor: myColor.bgHex,
                borderColor: myColor.borderHex,
                color: myColor.textHex,
              }}
              className="border-2 rounded-3xl p-5 flex items-center justify-between shadow-lg"
            >
              <div className="flex items-center gap-3">
                <span
                  style={{ backgroundColor: myColor.badgeBgHex }}
                  className="text-3xl flex h-12 w-12 items-center justify-center rounded-2xl"
                >
                  {identity.avatar ?? "🎮"}
                </span>
                <div>
                  <div className="font-black text-lg">{identity.nickname}</div>
                  <div className="text-xs opacity-90 font-semibold">
                    Manche {currentRound} • État :{" "}
                    <span className="uppercase">{roundStatus}</span>
                  </div>
                </div>
              </div>
              <Gamepad2 className="w-6 h-6 opacity-90" />
            </div>

            {/* Active Question / Action Zone */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
              {!isPlaying ? (
                <div className="py-4 text-center space-y-1">
                  <p className="text-base font-bold text-amber-300">
                    {roundStatus === "paused"
                      ? "Partie en pause"
                      : roundStatus === "finished"
                      ? "Partie terminée"
                      : "En attente du lancement par l'animateur..."}
                  </p>
                  <p className="text-xs text-neutral-400">
                    Manche {currentRound}
                  </p>
                </div>
              ) : (
                <>
                  {questionText && (
                    <p className="text-base font-semibold leading-snug">
                      {questionText}
                    </p>
                  )}

                  {parsedOptions.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3">
                      {parsedOptions.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          disabled={alreadySubmittedThisRound}
                          onClick={() => void handleSubmitAnswer(undefined, opt)}
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
                </>
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
                  {players.map((p) => {
                    const pColor = getUniquePlayerColor(p.id, players);
                    return (
                      <span
                        key={p.id}
                        style={{
                          backgroundColor: pColor.bgHex,
                          borderColor: pColor.borderHex,
                          color: pColor.textHex,
                        }}
                        className="text-xs font-bold border px-3 py-1.5 rounded-full"
                      >
                        {p.avatar ?? "🎮"} {p.nickname}
                      </span>
                    );
                  })}
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
