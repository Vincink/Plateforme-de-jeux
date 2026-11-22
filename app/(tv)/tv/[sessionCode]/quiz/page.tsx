"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Check, Trophy, Tv } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getUniquePlayerColor } from "@/lib/colorsplayer";
import type { GameSession, SessionPlayer } from "@/types/game.types";

type AnswerLetter = "A" | "B" | "C" | "D";

interface QuizQuestionItem {
  id?: string | number;
  question: string;
  options: [string, string, string, string] | string[];
  correctIndex?: number;
  correctAnswer?: AnswerLetter | string;
}

interface QuizStatePayload {
  questions?: QuizQuestionItem[];
  currentQuestionIndex?: number;
  current_question_index?: number;
  answers?: Record<string, AnswerLetter | string>;
  revealed?: boolean;
  showAnswers?: boolean;
  show_answers?: boolean;
  scores?: Record<string, number>;
}

const ANSWER_STYLES: Record<
  AnswerLetter,
  {
    bg: string;
    border: string;
    badgeBg: string;
    circleBg: string;
    circleText: string;
  }
> = {
  A: {
    bg: "bg-rose-600/90",
    border: "border-rose-300/70",
    badgeBg: "bg-rose-950/55 text-rose-100 border-rose-200/40",
    circleBg: "#E11D48",
    circleText: "#FFFFFF",
  },
  B: {
    bg: "bg-sky-600/90",
    border: "border-sky-300/70",
    badgeBg: "bg-sky-950/55 text-sky-100 border-sky-200/40",
    circleBg: "#0284C7",
    circleText: "#FFFFFF",
  },
  C: {
    bg: "bg-amber-500/90",
    border: "border-amber-200/80",
    badgeBg: "bg-amber-950/55 text-amber-100 border-amber-200/40",
    circleBg: "#D97706",
    circleText: "#FFFFFF",
  },
  D: {
    bg: "bg-emerald-600/90",
    border: "border-emerald-300/70",
    badgeBg: "bg-emerald-950/55 text-emerald-100 border-emerald-200/40",
    circleBg: "#059669",
    circleText: "#FFFFFF",
  },
};

const LETTERS: readonly AnswerLetter[] = ["A", "B", "C", "D"];

function normalizeAnswerLetter(raw: unknown): AnswerLetter | null {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 3) {
    return LETTERS[raw] ?? null;
  }
  if (typeof raw === "string") {
    const upper = raw.trim().toUpperCase();
    if (upper === "A" || upper === "B" || upper === "C" || upper === "D") {
      return upper;
    }
    if (upper === "0" || upper === "1" || upper === "2" || upper === "3") {
      return LETTERS[Number(upper)] ?? null;
    }
  }
  return null;
}

function getOptionFontSize(text: string): string {
  const len = text.trim().length;
  if (len <= 22) return "text-3xl xl:text-4xl leading-snug";
  if (len <= 48) return "text-2xl xl:text-3xl leading-snug";
  return "text-xl xl:text-2xl leading-snug";
}

function getQuestionFontSize(text: string): string {
  const len = text.trim().length;
  if (len <= 65) return "text-3xl xl:text-5xl leading-tight";
  if (len <= 120) return "text-2xl xl:text-4xl leading-snug";
  return "text-xl xl:text-3xl leading-snug";
}

export default function TvQuizPage() {
  const params = useParams<{ sessionCode: string }>();
  const router = useRouter();
  const sessionCode = (params?.sessionCode ?? "").toUpperCase();
  const supabase = getSupabaseBrowserClient();

  const [session, setSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [gameTitle, setGameTitle] = useState<string>("Le Grand Quiz");

  useEffect(() => {
    if (!supabase || !sessionCode) return;

    let isMounted = true;
    let playersChannel: ReturnType<typeof supabase.channel> | null = null;

    const loadGameTitle = async (gameId: string | null | undefined) => {
      if (!gameId) return;
      const { data } = await supabase
        .from("games")
        .select("title")
        .eq("id", gameId)
        .maybeSingle<{ title?: string | null }>();

      if (!isMounted) return;
      if (data?.title) setGameTitle(data.title);
    };

    const loadPlayers = async (targetSessionId: string) => {
      const { data } = await supabase
        .from("session_players")
        .select("*")
        .eq("session_id", targetSessionId)
        .order("id", { ascending: true });

      if (!isMounted) return;
      setPlayers((data as SessionPlayer[] | null) ?? []);
    };

    const bindSession = (targetSession: GameSession) => {
      if (playersChannel) {
        void supabase.removeChannel(playersChannel);
      }

      void loadPlayers(targetSession.id);
      void loadGameTitle(targetSession.game_id);

      playersChannel = supabase
        .channel(`tv-quiz-players-${targetSession.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "session_players",
            filter: `session_id=eq.${targetSession.id}`,
          },
          () => {
            void loadPlayers(targetSession.id);
          }
        )
        .subscribe();
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
      if (playersChannel) {
        void supabase.removeChannel(playersChannel);
      }
    };
  }, [supabase, sessionCode]);

  useEffect(() => {
    if (!session || !sessionCode) return;
    if (session.status === "lobby") {
      router.replace(`/tv/${sessionCode}`);
    }
  }, [session, sessionCode, router]);

  const quizState = useMemo<QuizStatePayload>(() => {
    const raw = session as (GameSession & {
      game_state?: QuizStatePayload | null;
      state?: QuizStatePayload | null;
      quiz_state?: QuizStatePayload | null;
    }) | null;
    return raw?.game_state || raw?.quiz_state || raw?.state || {};
  }, [session]);

  const questions = useMemo<QuizQuestionItem[]>(() => {
    return Array.isArray(quizState.questions) ? quizState.questions : [];
  }, [quizState]);

  const currentQuestionIndex = useMemo(() => {
    const idx =
      quizState.currentQuestionIndex ??
      quizState.current_question_index ??
      0;
    return Math.max(0, Number(idx) || 0);
  }, [quizState]);

  const currentQuestion = questions[currentQuestionIndex] ?? null;
  const options = useMemo<string[]>(() => {
    if (!currentQuestion?.options) return ["", "", "", ""];
    return [
      currentQuestion.options[0] ?? "",
      currentQuestion.options[1] ?? "",
      currentQuestion.options[2] ?? "",
      currentQuestion.options[3] ?? "",
    ];
  }, [currentQuestion]);

  const answersMap = quizState.answers ?? {};
  const scoresMap = quizState.scores ?? {};

  const allPlayersAnswered = useMemo(() => {
    if (players.length === 0) return false;
    return players.every((p) => {
      const val = answersMap[String(p.id)];
      return normalizeAnswerLetter(val) !== null;
    });
  }, [players, answersMap]);

  const isRevealed = Boolean(
    quizState.revealed ||
      quizState.showAnswers ||
      quizState.show_answers ||
      allPlayersAnswered
  );

  const correctLetter = useMemo<AnswerLetter | null>(() => {
    if (!currentQuestion) return null;
    if (typeof currentQuestion.correctIndex === "number") {
      return LETTERS[currentQuestion.correctIndex] ?? null;
    }
    return normalizeAnswerLetter(currentQuestion.correctAnswer);
  }, [currentQuestion]);

  const rankedPlayers = useMemo(() => {
    return [...players]
      .map((player) => {
        const extra = player as SessionPlayer & { score?: number | null };
        const playerScore =
          typeof extra.score === "number"
            ? extra.score
            : typeof scoresMap[String(player.id)] === "number"
            ? scoresMap[String(player.id)]
            : 0;
        const score = Number(playerScore ?? 0);
        const chosenLetter = normalizeAnswerLetter(
          answersMap[String(player.id)]
        );
        return {
          player,
          score,
          chosenLetter,
        };
      })
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [players, scoresMap, answersMap]);

  const currentRound = session?.current_round ?? 1;
  const totalQuestions = questions.length;

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-tvos-bg text-white px-8 py-6 flex flex-col justify-between select-none">
      {/* En-tête grand format lisible depuis le canapé */}
      <header className="flex items-center justify-between border-b border-white/15 pb-4 shrink-0 gap-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-amber-400/15 border border-amber-400/35 flex items-center justify-center shrink-0">
            <Tv className="w-8 h-8 text-amber-400" />
          </div>
          <div className="min-w-0">
            <div className="text-base xl:text-lg uppercase tracking-[0.18em] text-amber-300 font-extrabold">
              Manche {currentRound}
              {totalQuestions > 0
                ? ` • Question ${Math.min(
                    currentQuestionIndex + 1,
                    totalQuestions
                  )} / ${totalQuestions}`
                : ""}
            </div>
            <h1 className="text-3xl xl:text-4xl font-black tracking-tight truncate">
              {gameTitle}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <span className="text-lg xl:text-xl font-bold uppercase tracking-wider text-neutral-300">
            Salle
          </span>
          <div className="px-6 py-2.5 rounded-2xl bg-amber-400/15 border-2 border-amber-400/45 text-amber-300 font-mono text-3xl xl:text-4xl font-black tracking-[0.2em]">
            {sessionCode || "----"}
          </div>
        </div>
      </header>

      {/* Corps principal : Question/Réponses à gauche (7 cols), Classement à droite (5 cols) */}
      <main className="flex-1 min-h-0 grid grid-cols-12 gap-7 pt-5">
        {/* COLONNE GAUCHE : Grande case Question + 4 cases Réponses sur toute la largeur */}
        <section className="col-span-7 bg-white/[0.06] border border-white/15 rounded-[2rem] p-7 flex flex-col justify-between gap-5 min-h-0">
          {/* Bloc Question centré en haut */}
          <div className="shrink-0 min-h-[22%] flex items-center justify-center text-center px-4">
            {currentQuestion ? (
              <h2
                className={`font-black text-white text-center break-words [word-break:normal] hyphens-none ${getQuestionFontSize(
                  currentQuestion.question
                )}`}
              >
                {currentQuestion.question}
              </h2>
            ) : (
              <p className="text-3xl font-bold text-neutral-400 text-center">
                En attente de la première question...
              </p>
            )}
          </div>

          {/* 4 cases de réponses réparties sur toute la largeur en grille 2x2 avec hauteur réduite */}
          <div className="w-full flex-1 max-h-[420px] grid grid-cols-2 grid-rows-2 gap-4 self-center">
            {LETTERS.map((letter, index) => {
              const style = ANSWER_STYLES[letter];
              const optionText = options[index] || `Réponse ${letter}`;
              const isCorrect =
                isRevealed &&
                correctLetter !== null &&
                correctLetter === letter;
              const isDimmed =
                isRevealed &&
                correctLetter !== null &&
                correctLetter !== letter;

              return (
                <div
                  key={letter}
                  className={`relative w-full h-full rounded-3xl border-2 p-4 flex items-center transition-all duration-300 overflow-hidden ${
                    style.bg
                  } ${style.border} ${
                    isCorrect
                      ? "ring-4 ring-emerald-300 scale-[1.01] shadow-2xl"
                      : isDimmed
                      ? "opacity-45"
                      : "shadow-lg"
                  }`}
                >
                  {/* Lettre fixe sur la gauche de la case */}
                  <div
                    className={`w-12 h-12 xl:w-14 xl:h-14 rounded-2xl border-2 flex items-center justify-center font-black text-2xl xl:text-3xl shrink-0 ${style.badgeBg}`}
                  >
                    {letter}
                  </div>

                  {/* Texte de réponse centré verticalement et horizontalement sans jamais couper un mot */}
                  <div className="flex-1 h-full flex items-center justify-center text-center px-3 overflow-hidden">
                    <span
                      className={`font-black text-white text-center whitespace-normal break-words [word-break:normal] hyphens-none line-clamp-3 ${getOptionFontSize(
                        optionText
                      )}`}
                    >
                      {optionText}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* COLONNE DROITE : Classement des joueurs */}
        <aside className="col-span-5 bg-white/[0.06] border border-white/15 rounded-[2rem] p-6 flex flex-col gap-4 min-h-0">
          <div className="flex items-center justify-between shrink-0 pb-1">
            <div className="flex items-center gap-3 text-2xl xl:text-3xl font-black">
              <Trophy className="w-8 h-8 text-amber-400" />
              <span>Classement</span>
            </div>
            <span className="text-lg font-bold text-neutral-300">
              {players.length} joueur{players.length > 1 ? "s" : ""}
            </span>
          </div>

          {rankedPlayers.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-2xl text-neutral-400 font-semibold text-center px-4">
              Aucun joueur dans la partie
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col gap-3.5 overflow-hidden">
              {rankedPlayers.map(({ player, score, chosenLetter }, idx) => {
                const pColor = getUniquePlayerColor(player.id, players);
                const rank = idx + 1;
                const hasAnswered = chosenLetter !== null;
                const answerStyle = chosenLetter
                  ? ANSWER_STYLES[chosenLetter]
                  : null;

                return (
                  <div
                    key={player.id}
                    style={{
                      backgroundColor: pColor.bgHex,
                      borderColor: pColor.borderHex,
                      color: pColor.textHex,
                    }}
                    className="rounded-3xl border-2 px-5 py-3.5 flex items-center gap-4 shadow-lg shrink-0"
                  >
                    {/* 1. Numéro de rang fixe à gauche */}
                    <div
                      style={{ backgroundColor: pColor.badgeBgHex }}
                      className="w-12 h-12 xl:w-14 xl:h-14 rounded-2xl flex items-center justify-center font-black text-2xl xl:text-3xl shrink-0"
                    >
                      {rank}
                    </div>

                    {/* 2. Pseudo à droite du numéro */}
                    <div className="flex-1 min-w-0 font-black text-2xl xl:text-3xl truncate">
                      {player.nickname}
                    </div>

                    {/* 3. Points fixes du joueur */}
                    <div className="w-24 text-right font-mono font-black text-2xl xl:text-3xl shrink-0">
                      {score} <span className="text-lg font-bold">pts</span>
                    </div>

                    {/* 4. Pastille état réponse à droite des points */}
                    <div className="w-14 h-14 flex items-center justify-center shrink-0">
                      {hasAnswered && !isRevealed && (
                        <div
                          title="A répondu"
                          className="w-12 h-12 xl:w-14 xl:h-14 rounded-full bg-emerald-200 border-2 border-emerald-500 flex items-center justify-center shadow-md"
                        >
                          <Check
                            className="w-8 h-8 text-emerald-700 stroke-[3.5]"
                            aria-label="V"
                          />
                        </div>
                      )}

                      {hasAnswered && isRevealed && answerStyle && (
                        <div
                          style={{
                            backgroundColor: answerStyle.circleBg,
                            color: answerStyle.circleText,
                          }}
                          className="w-12 h-12 xl:w-14 xl:h-14 rounded-full border-2 border-white flex items-center justify-center font-black text-2xl xl:text-3xl shadow-md"
                        >
                          {chosenLetter}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
