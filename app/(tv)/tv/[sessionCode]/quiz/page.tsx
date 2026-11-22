"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Check, HelpCircle, Trophy } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getUniquePlayerColor } from "@/lib/colorsplayer";
import type {
  GameContent,
  GameSession,
  PlayerScore,
  SessionPlayer,
} from "@/types/game.types";

type QuizContentRow = GameContent & {
  prompt?: string | null;
  question?: string | null;
  points?: number | null;
  round_type?: string | null;
};

interface PlayerActionRow {
  id: string;
  session_id: string;
  player_id: string;
  round_number: number;
  action_type: string;
  payload: {
    answer?: string;
    choice_letter?: string | null;
  } | null;
  created_at?: string;
}

const CHOICE_META = [
  {
    letter: "A",
    bgHex: "#ef4444",
    borderHex: "#fca5a5",
    textHex: "#ffffff",
  },
  {
    letter: "B",
    bgHex: "#2563eb",
    borderHex: "#93c5fd",
    textHex: "#ffffff",
  },
  {
    letter: "C",
    bgHex: "#eab308",
    borderHex: "#fef08a",
    textHex: "#111827",
  },
  {
    letter: "D",
    bgHex: "#16a34a",
    borderHex: "#86efac",
    textHex: "#ffffff",
  },
] as const;

export default function TvQuizScreenPage() {
  const params = useParams<{ sessionCode: string }>();
  const sessionCode = (params?.sessionCode ?? "").toUpperCase();
  const supabase = getSupabaseBrowserClient();

  const [session, setSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [scores, setScores] = useState<PlayerScore[]>([]);
  const [currentContent, setCurrentContent] = useState<QuizContentRow | null>(
    null
  );
  const [actions, setActions] = useState<PlayerActionRow[]>([]);

  const currentRound = session?.current_round ?? 1;
  const roundStatus = session?.status ?? "lobby";

  useEffect(() => {
    if (!supabase || !sessionCode) return;

    let isMounted = true;
    let childrenChannel: ReturnType<typeof supabase.channel> | null = null;
    let contentChannel: ReturnType<typeof supabase.channel> | null = null;

    const loadSessionChildren = async (
      targetSessionId: string,
      targetGameId: string | null | undefined,
      roundNumber: number
    ) => {
      const [
        { data: playersData },
        { data: scoresData },
        { data: actionsData },
        { data: contentsData },
      ] = await Promise.all([
        supabase
          .from("session_players")
          .select("*")
          .eq("session_id", targetSessionId)
          .order("id", { ascending: true }),
        supabase
          .from("player_scores")
          .select("*")
          .eq("session_id", targetSessionId),
        supabase
          .from("player_actions")
          .select("*")
          .eq("session_id", targetSessionId)
          .eq("round_number", roundNumber)
          .eq("action_type", "answer")
          .order("created_at", { ascending: true }),
        targetGameId
          ? supabase
              .from("game_contents")
              .select("*")
              .eq("game_id", targetGameId)
              .order("sort_order", { ascending: true })
          : Promise.resolve({ data: [] }),
      ]);

      if (!isMounted) return;

      setPlayers((playersData as SessionPlayer[] | null) ?? []);
      setScores((scoresData as PlayerScore[] | null) ?? []);
      setActions((actionsData as PlayerActionRow[] | null) ?? []);

      const items = Array.isArray(contentsData)
        ? (contentsData as QuizContentRow[])
        : [];
      const idx = Math.max(0, roundNumber - 1);
      setCurrentContent(items[idx] ?? null);
    };

    const bindSession = (targetSession: GameSession) => {
      if (childrenChannel) {
        void supabase.removeChannel(childrenChannel);
      }
      if (contentChannel) {
        void supabase.removeChannel(contentChannel);
      }

      void loadSessionChildren(
        targetSession.id,
        targetSession.game_id,
        targetSession.current_round ?? 1
      );

      childrenChannel = supabase
        .channel(`tv-quiz-children-${targetSession.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "session_players",
            filter: `session_id=eq.${targetSession.id}`,
          },
          () => {
            void loadSessionChildren(
              targetSession.id,
              targetSession.game_id,
              targetSession.current_round ?? 1
            );
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
            void loadSessionChildren(
              targetSession.id,
              targetSession.game_id,
              targetSession.current_round ?? 1
            );
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "player_actions",
            filter: `session_id=eq.${targetSession.id}`,
          },
          () => {
            void loadSessionChildren(
              targetSession.id,
              targetSession.game_id,
              targetSession.current_round ?? 1
            );
          }
        )
        .subscribe();

      if (targetSession.game_id) {
        contentChannel = supabase
          .channel(`tv-quiz-content-${targetSession.game_id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "game_contents",
              filter: `game_id=eq.${targetSession.game_id}`,
            },
            () => {
              void loadSessionChildren(
                targetSession.id,
                targetSession.game_id,
                targetSession.current_round ?? 1
              );
            }
          )
          .subscribe();
      }
    };

    const fetchInitial = async () => {
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
        bindSession(data);
      }
    };

    void fetchInitial();

    const sessionChannel = supabase
      .channel(`tv-quiz-session-${sessionCode}`)
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
          bindSession(nextRow);
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
        // Ignore invalid JSON
      }
    }
    return [];
  }, [currentContent?.options]);

  const questionText =
    currentContent?.prompt ??
    currentContent?.question ??
    "En attente de la question...";

  const choicesWithLabels = useMemo(() => {
    return CHOICE_META.map((meta, idx) => {
      const label = parsedOptions[idx] ?? "";
      return {
        ...meta,
        label,
      };
    }).filter((item) => item.label.length > 0 || parsedOptions.length === 0);
  }, [parsedOptions]);

  const latestAnswerByPlayer = useMemo(() => {
    const map = new Map<string, { letter: string | null; answer: string }>();
    for (const act of actions) {
      if (act.round_number !== currentRound) continue;
      const answerVal = String(act.payload?.answer ?? "").trim();
      let letter = act.payload?.choice_letter
        ? String(act.payload.choice_letter).toUpperCase()
        : null;

      if (!letter && answerVal && parsedOptions.length > 0) {
        const matchIdx = parsedOptions.findIndex(
          (opt) => opt.trim().toLowerCase() === answerVal.toLowerCase()
        );
        if (matchIdx >= 0 && CHOICE_META[matchIdx]) {
          letter = CHOICE_META[matchIdx].letter;
        }
      }

      map.set(act.player_id, { letter, answer: answerVal });
    }
    return map;
  }, [actions, currentRound, parsedOptions]);

  const rankedPlayers = useMemo(() => {
    const withScore = players.map((p) => {
      const scoreRow = scores.find((s) => s.player_id === p.id) as
        | (PlayerScore & { total_score?: number; score?: number })
        | undefined;
      const pts = scoreRow?.total_score ?? scoreRow?.score ?? 0;
      const ans = latestAnswerByPlayer.get(p.id) ?? null;
      return {
        player: p,
        points: pts,
        answerData: ans,
      };
    });

    withScore.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.player.nickname.localeCompare(b.player.nickname, "fr");
    });

    return withScore.map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
  }, [players, scores, latestAnswerByPlayer]);

  const allPlayersAnswered = useMemo(() => {
    if (rankedPlayers.length === 0) return false;
    return rankedPlayers.every((entry) => entry.answerData !== null);
  }, [rankedPlayers]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6 flex flex-col gap-6 select-none">
      {/* Barre supérieure */}
      <header className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-4">
          <span className="px-3 py-1 rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-300 font-mono text-sm font-bold tracking-widest">
            SALLE {sessionCode || "----"}
          </span>
          <span className="text-sm font-semibold text-neutral-300">
            Grand Quiz • Manche {currentRound}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-wider px-3 py-1 rounded-full bg-white/10 text-neutral-200 font-semibold">
            {roundStatus}
          </span>
          <span className="text-xs text-neutral-400 font-mono">
            {rankedPlayers.filter((r) => r.answerData !== null).length}/
            {rankedPlayers.length} réponses
          </span>
        </div>
      </header>

      {/* Zone principale : Classement à gauche, Question & 4 Réponses à droite */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        {/* Classement des joueurs */}
        <section className="lg:col-span-4 bg-white/5 border border-white/10 rounded-3xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-bold tracking-wide">Classement</h2>
            </div>
            {allPlayersAnswered && (
              <span className="text-xs font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-full">
                Tous ont répondu
              </span>
            )}
          </div>

          {rankedPlayers.length === 0 ? (
            <div className="my-auto text-center text-neutral-400 text-sm py-8">
              En attente des joueurs...
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto pr-1">
              {rankedPlayers.map(({ player, points, answerData, rank }) => {
                const pColor = getUniquePlayerColor(player.id, players);
                const playerExtra = player as SessionPlayer & {
                  avatarId?: string;
                  avatar_id?: string;
                };
                const avatarDisplay =
                  playerExtra.avatarId || playerExtra.avatar_id || "🎮";
                const choiceStyle = answerData?.letter
                  ? CHOICE_META.find((c) => c.letter === answerData.letter)
                  : undefined;

                return (
                  <div
                    key={player.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-black/40 border border-white/10 p-3.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center font-mono font-black text-sm text-amber-300 shrink-0">
                        #{rank}
                      </span>

                      <span
                        style={{
                          backgroundColor: pColor.bgHex,
                          borderColor: pColor.borderHex,
                          color: pColor.textHex,
                        }}
                        className="w-10 h-10 rounded-2xl border-2 flex items-center justify-center text-xl shrink-0"
                      >
                        {avatarDisplay}
                      </span>

                      <div className="min-w-0">
                        <div className="font-bold text-base truncate">
                          {player.nickname}
                        </div>
                        <div className="text-xs font-mono text-neutral-300">
                          {points} pts
                        </div>
                      </div>
                    </div>

                    {/* Pastille de validation ou lettre de réponse quand tout le monde a répondu */}
                    <div className="shrink-0">
                      {allPlayersAnswered && choiceStyle ? (
                        <div
                          style={{
                            backgroundColor: choiceStyle.bgHex,
                            borderColor: choiceStyle.borderHex,
                            color: choiceStyle.textHex,
                          }}
                          className="w-11 h-11 rounded-full border-2 flex items-center justify-center font-black text-lg shadow-md"
                          title={`Réponse ${choiceStyle.letter}`}
                        >
                          {choiceStyle.letter}
                        </div>
                      ) : answerData !== null ? (
                        <div
                          className="w-10 h-10 rounded-full bg-emerald-200 border-2 border-emerald-400 flex items-center justify-center text-emerald-700 shadow-sm"
                          title="A répondu"
                        >
                          <Check className="w-5 h-5 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full border border-dashed border-white/20" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Colonne droite : Question au-dessus, 4 Réponses en dessous */}
        <section className="lg:col-span-8 flex flex-col gap-6">
          {/* Case Question */}
          <div className="bg-white/5 border border-white/10 rounded-3xl p-7 flex flex-col justify-center min-h-[190px]">
            <div className="flex items-center gap-2 text-amber-400 text-xs uppercase tracking-widest font-bold mb-3">
              <HelpCircle className="w-4 h-4" />
              <span>Question {currentRound}</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold leading-tight text-white">
              {roundStatus === "playing"
                ? questionText
                : roundStatus === "paused"
                ? "Partie en pause"
                : roundStatus === "finished"
                ? "Partie terminée !"
                : "Préparez-vous, le quiz va démarrer..."}
            </h1>
          </div>

          {/* Case 4 Réponses */}
          <div className="flex-1 bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col justify-center">
            {roundStatus === "playing" && choicesWithLabels.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-full">
                {choicesWithLabels.map((choice) => (
                  <div
                    key={choice.letter}
                    style={{
                      backgroundColor: choice.bgHex,
                      borderColor: choice.borderHex,
                      color: choice.textHex,
                    }}
                    className="rounded-3xl border-4 p-5 flex items-center gap-4 shadow-xl min-h-[115px]"
                  >
                    <span className="w-12 h-12 rounded-2xl bg-black/25 flex items-center justify-center text-2xl font-black shrink-0">
                      {choice.letter}
                    </span>
                    <span className="text-xl sm:text-2xl font-bold leading-snug">
                      {choice.label || `Choix ${choice.letter}`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-neutral-400 text-base py-8">
                Les propositions de réponse s&apos;afficheront dès le lancement de
                la manche.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
