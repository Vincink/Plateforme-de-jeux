"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Check, Clock, Trophy, Tv } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getUniquePlayerColor } from "@/lib/colorsplayer";
import { QUESTIONS, type QuizQuestion } from "@/lib/questions";
import type { GameSession, SessionPlayer } from "@/types/game.types";

type AnswerLetter = "A" | "B" | "C" | "D";

interface QuizQuestionItem {
  id?: string | number;
  question?: string;
  prompt?: string;
  title?: string;
  text?: string;
  options?: string[] | Partial<Record<AnswerLetter, string>>;
  choices?: string[] | Partial<Record<AnswerLetter, string>>;
  answers?: string[] | Partial<Record<AnswerLetter, string>>;
  correct?: AnswerLetter | string;
  correctIndex?: number;
  correct_index?: number;
  correctAnswer?: AnswerLetter | string;
  correct_answer?: AnswerLetter | string;
}

interface QuizStatePayload {
  questions?: QuizQuestionItem[];
  quizQuestions?: QuizQuestionItem[];
  items?: QuizQuestionItem[];
  currentQuestion?: QuizQuestionItem | null;
  activeQuestion?: QuizQuestionItem | null;
  questionStarted?: boolean;
  question_started?: boolean;
  roundTriggered?: boolean;
  round_triggered?: boolean;
  questionIndex?: number | null;
  question_index?: number | null;
  currentQuestionIndex?: number | null;
  current_question_index?: number | null;
  questionStartedAt?: string | number | null;
  question_started_at?: string | number | null;
  roundStartedAt?: string | number | null;
  round_started_at?: string | number | null;
  durationSeconds?: number;
  duration_seconds?: number;
  answers?: Record<string, AnswerLetter | string>;
  revealed?: boolean;
  showAnswers?: boolean;
  show_answers?: boolean;
  scores?: Record<string, number | string>;
  points?: Record<string, number | string>;
  pointsMap?: Record<string, number | string>;
  playerScores?: Record<string, number | string>;
  player_scores?: Record<string, number | string>;
}

type ExtendedSession = GameSession & {
  game_state?: QuizStatePayload | null;
  state?: QuizStatePayload | null;
  quiz_state?: QuizStatePayload | null;
  questions?: QuizQuestionItem[] | null;
  question_index?: number | null;
  currentQuestionIndex?: number | null;
  current_question_index?: number | null;
  question_started_at?: string | number | null;
  round_started_at?: string | number | null;
  scores?: Record<string, number | string> | null;
  points?: Record<string, number | string> | null;
  playerScores?: Record<string, number | string> | null;
  player_scores?: Record<string, number | string> | null;
};

type ExtendedPlayer = SessionPlayer & {
  score?: number | string | null;
  points?: number | string | null;
  total_score?: number | string | null;
  totalPoints?: number | string | null;
  player_id?: string | number | null;
  user_id?: string | number | null;
};

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
const QUESTION_DURATION_SECONDS = 12;
const QUESTIONS_PER_GAME = 15;

function hashStringToSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickRandomQuestionsSeries(
  source: QuizQuestionItem[],
  count: number,
  seedKey: string
): QuizQuestionItem[] {
  if (!Array.isArray(source) || source.length === 0) return [];
  const copy = [...source];
  let seed = hashStringToSeed(seedKey) || 1;
  const nextRand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    const itemI = copy[i];
    const itemJ = copy[j];
    if (itemI !== undefined && itemJ !== undefined) {
      copy[i] = itemJ;
      copy[j] = itemI;
    }
  }
  return copy.slice(0, Math.min(count, copy.length));
}

function toFiniteNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseTimestampMs(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const asNum = Number(raw);
    if (Number.isFinite(asNum)) {
      return asNum < 1e12 ? asNum * 1000 : asNum;
    }
    const parsedDate = Date.parse(raw);
    if (!Number.isNaN(parsedDate)) {
      return parsedDate;
    }
  }
  return null;
}

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

function extractOptionsList(
  rawOptions: QuizQuestionItem["options"]
): string[] {
  if (!rawOptions) return ["", "", "", ""];
  if (Array.isArray(rawOptions)) {
    return [
      String(rawOptions[0] ?? ""),
      String(rawOptions[1] ?? ""),
      String(rawOptions[2] ?? ""),
      String(rawOptions[3] ?? ""),
    ];
  }
  return LETTERS.map((letter) => String(rawOptions[letter] ?? ""));
}

function getOptionFontSize(text: string): string {
  const trimmed = text.trim();
  const longestWordLen = trimmed
    .split(/\s+/)
    .reduce((max, word) => Math.max(max, word.length), 0);
  const len = trimmed.length;

  if (longestWordLen >= 16) return "text-xl xl:text-2xl leading-snug";
  if (longestWordLen >= 12) return "text-2xl xl:text-3xl leading-snug";
  if (len <= 12) return "text-4xl xl:text-5xl leading-tight";
  if (len <= 24) return "text-3xl xl:text-4xl leading-snug";
  if (len <= 44) return "text-2xl xl:text-3xl leading-snug";
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

  const [session, setSession] = useState<ExtendedSession | null>(null);
  const [players, setPlayers] = useState<ExtendedPlayer[]>([]);
  const [gameTitle, setGameTitle] = useState<string>("Le Grand Quiz");
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [localQuestionStartMs, setLocalQuestionStartMs] = useState<
    number | null
  >(null);

  useEffect(() => {
    if (!supabase || !sessionCode) return;

    let isMounted = true;
    let activeSessionId: string | null = null;
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

    const loadPlayers = async (targetSessionId: string | null) => {
      if (!targetSessionId) return;
      const { data } = await supabase
        .from("session_players")
        .select("*")
        .eq("session_id", targetSessionId)
        .order("id", { ascending: true });

      if (!isMounted) return;
      setPlayers((data as ExtendedPlayer[] | null) ?? []);
    };

    const refreshSessionRow = async () => {
      const { data } = await supabase
        .from("game_sessions")
        .select("*")
        .eq("code", sessionCode)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<ExtendedSession>();

      if (!isMounted || !data) return;
      setSession(data);
      if (data.id) {
        activeSessionId = data.id;
        void loadPlayers(data.id);
      }
      if (data.game_id) {
        void loadGameTitle(data.game_id);
      }
    };

    const bindSession = (targetSession: ExtendedSession) => {
      void loadPlayers(targetSession.id);
      void loadGameTitle(targetSession.game_id);

      if (activeSessionId === targetSession.id && playersChannel) {
        return;
      }

      activeSessionId = targetSession.id;

      if (playersChannel) {
        void supabase.removeChannel(playersChannel);
      }

      playersChannel = supabase
        .channel(`tv-quiz-players-${targetSession.id}-${Date.now()}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "session_players",
          },
          () => {
            if (!isMounted) return;
            void loadPlayers(targetSession.id);
            void refreshSessionRow();
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
        .maybeSingle<ExtendedSession>();

      if (!isMounted) return;
      if (data) {
        setSession(data);
        bindSession(data);
      }
    };

    void fetchInitial();

    const sessionChannel = supabase
      .channel(`tv-quiz-session-${sessionCode}-${Date.now()}`)
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
          const nextRow = payload.new as ExtendedSession | null;
          if (!nextRow) {
            void refreshSessionRow();
            return;
          }
          setSession(nextRow);
          bindSession(nextRow);
        }
      )
      .subscribe();

    const syncInterval = window.setInterval(() => {
      if (!isMounted) return;
      void refreshSessionRow();
      if (activeSessionId) {
        void loadPlayers(activeSessionId);
      }
    }, 1000);

    return () => {
      isMounted = false;
      window.clearInterval(syncInterval);
      void supabase.removeChannel(sessionChannel);
      if (playersChannel) {
        void supabase.removeChannel(playersChannel);
      }
    };
  }, [supabase, sessionCode]);

  useEffect(() => {
    if (!session || !sessionCode) return;
    const status = String(session.status ?? "").toLowerCase();
    if (
      status === "lobby" ||
      status === "finished" ||
      status === "ended" ||
      status === "completed"
    ) {
      router.replace(`/tv/${sessionCode}`);
    }
  }, [session, sessionCode, router]);

  const quizState = useMemo<QuizStatePayload>(() => {
    return (
      session?.game_state ||
      session?.quiz_state ||
      session?.state ||
      {}
    );
  }, [session]);

  const questions = useMemo<QuizQuestionItem[]>(() => {
    const seedKey = `${session?.id ?? ""}-${sessionCode}`;
    if (Array.isArray(quizState.questions) && quizState.questions.length > 0) {
      return pickRandomQuestionsSeries(
        quizState.questions,
        QUESTIONS_PER_GAME,
        seedKey
      );
    }
    if (
      Array.isArray(quizState.quizQuestions) &&
      quizState.quizQuestions.length > 0
    ) {
      return pickRandomQuestionsSeries(
        quizState.quizQuestions,
        QUESTIONS_PER_GAME,
        seedKey
      );
    }
    if (Array.isArray(quizState.items) && quizState.items.length > 0) {
      return pickRandomQuestionsSeries(
        quizState.items,
        QUESTIONS_PER_GAME,
        seedKey
      );
    }
    if (Array.isArray(session?.questions) && session.questions.length > 0) {
      return pickRandomQuestionsSeries(
        session.questions,
        QUESTIONS_PER_GAME,
        seedKey
      );
    }
    return pickRandomQuestionsSeries(
      QUESTIONS as QuizQuestion[],
      QUESTIONS_PER_GAME,
      seedKey
    );
  }, [quizState, session, sessionCode]);

  // Démarrage de l'index à 0 uniquement lorsque "Manche +1" a été déclenché au moins une fois
  const activeQuestionIndex = useMemo<number | null>(() => {
    const explicitIndex =
      quizState.questionIndex ??
      quizState.question_index ??
      quizState.currentQuestionIndex ??
      quizState.current_question_index ??
      session?.question_index ??
      session?.currentQuestionIndex ??
      session?.current_question_index;

    const hasExplicitFlag = Boolean(
      quizState.questionStarted ||
        quizState.question_started ||
        quizState.roundTriggered ||
        quizState.round_triggered
    );

    if (typeof explicitIndex === "number" && Number.isFinite(explicitIndex)) {
      if (explicitIndex < 0) return null;
      if (explicitIndex === 0 && !hasExplicitFlag) {
        const roundVal = session?.current_round ?? 1;
        return roundVal > 1 ? 0 : null;
      }
      return Math.max(0, Math.floor(explicitIndex));
    }

    if (hasExplicitFlag) {
      const roundVal = Math.max(1, Number(session?.current_round ?? 1) || 1);
      return roundVal - 1;
    }

    return null;
  }, [quizState, session]);

  const currentQuestion = useMemo<QuizQuestionItem | null>(() => {
    if (activeQuestionIndex === null) return null;
    if (questions.length > 0) {
      const safeIndex = Math.min(activeQuestionIndex, questions.length - 1);
      return questions[safeIndex] ?? null;
    }
    return quizState.currentQuestion ?? quizState.activeQuestion ?? null;
  }, [activeQuestionIndex, questions, quizState]);

  const remoteStartMs = useMemo<number | null>(() => {
    return (
      parseTimestampMs(quizState.questionStartedAt) ??
      parseTimestampMs(quizState.question_started_at) ??
      parseTimestampMs(quizState.roundStartedAt) ??
      parseTimestampMs(quizState.round_started_at) ??
      parseTimestampMs(session?.question_started_at) ??
      parseTimestampMs(session?.round_started_at)
    );
  }, [quizState, session]);

  useEffect(() => {
    if (activeQuestionIndex === null || !currentQuestion) {
      setLocalQuestionStartMs(null);
      return;
    }
    const startStamp = remoteStartMs ?? Date.now();
    setLocalQuestionStartMs(startStamp);
    setNowMs(Date.now());
  }, [activeQuestionIndex, currentQuestion, remoteStartMs]);

  useEffect(() => {
    if (activeQuestionIndex === null || !currentQuestion) return;
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 200);
    return () => {
      window.clearInterval(interval);
    };
  }, [activeQuestionIndex, currentQuestion]);

  const durationSeconds = useMemo<number>(() => {
    const rawDuration =
      toFiniteNumber(quizState.durationSeconds) ??
      toFiniteNumber(quizState.duration_seconds) ??
      QUESTION_DURATION_SECONDS;
    return Math.max(1, Math.round(rawDuration));
  }, [quizState]);

  const remainingSeconds = useMemo<number | null>(() => {
    if (activeQuestionIndex === null || !currentQuestion) return null;
    const effectiveStart = remoteStartMs ?? localQuestionStartMs ?? nowMs;
    const elapsedSeconds = Math.max(0, (nowMs - effectiveStart) / 1000);
    return Math.max(0, Math.ceil(durationSeconds - elapsedSeconds));
  }, [
    activeQuestionIndex,
    currentQuestion,
    remoteStartMs,
    localQuestionStartMs,
    nowMs,
    durationSeconds,
  ]);

  const isTimerExpired =
    activeQuestionIndex !== null &&
    currentQuestion !== null &&
    remainingSeconds !== null &&
    remainingSeconds <= 0;

  const questionLabel = useMemo<string>(() => {
    if (!currentQuestion) return "";
    return (
      currentQuestion.question ||
      currentQuestion.prompt ||
      currentQuestion.title ||
      currentQuestion.text ||
      ""
    );
  }, [currentQuestion]);

  const options = useMemo<string[]>(() => {
    const rawOptions =
      currentQuestion?.options ||
      currentQuestion?.choices ||
      currentQuestion?.answers;
    return extractOptionsList(rawOptions);
  }, [currentQuestion]);

  const answersMap = quizState.answers ?? {};
  const scoresMap = useMemo<Record<string, number | string>>(() => {
    const merged: Record<string, number | string> = {
      ...(session?.player_scores ?? {}),
      ...(session?.playerScores ?? {}),
      ...(session?.points ?? {}),
      ...(session?.scores ?? {}),
      ...(quizState.player_scores ?? {}),
      ...(quizState.playerScores ?? {}),
      ...(quizState.pointsMap ?? {}),
      ...(quizState.points ?? {}),
      ...(quizState.scores ?? {}),
    };

    const normalized: Record<string, number | string> = {};
    for (const [k, v] of Object.entries(merged)) {
      normalized[k] = v;
      normalized[k.trim().toLowerCase()] = v;
    }
    return normalized;
  }, [session, quizState]);

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
      allPlayersAnswered ||
      isTimerExpired
  );

  const correctLetter = useMemo<AnswerLetter | null>(() => {
    if (!currentQuestion) return null;
    const rawIdx =
      typeof currentQuestion.correctIndex === "number"
        ? currentQuestion.correctIndex
        : typeof currentQuestion.correct_index === "number"
        ? currentQuestion.correct_index
        : null;
    if (rawIdx !== null) {
      return LETTERS[rawIdx] ?? null;
    }
    return normalizeAnswerLetter(
      currentQuestion.correct ??
        currentQuestion.correctAnswer ??
        currentQuestion.correct_answer
    );
  }, [currentQuestion]);

  const rankedPlayers = useMemo(() => {
    return [...players]
      .map((player) => {
        const candidateKeys = [
          player.id !== undefined && player.id !== null ? String(player.id) : "",
          player.player_id !== undefined && player.player_id !== null
            ? String(player.player_id)
            : "",
          player.user_id !== undefined && player.user_id !== null
            ? String(player.user_id)
            : "",
          player.nickname ? String(player.nickname) : "",
          player.nickname ? String(player.nickname).trim().toLowerCase() : "",
        ].filter(Boolean);

        let mappedValue: number | null = null;
        for (const key of candidateKeys) {
          if (key in scoresMap) {
            const num = toFiniteNumber(scoresMap[key]);
            if (num !== null) {
              mappedValue = num;
              break;
            }
          }
        }

        const directPlayerScore =
          toFiniteNumber(player.score) ??
          toFiniteNumber(player.points) ??
          toFiniteNumber(player.total_score) ??
          toFiniteNumber(player.totalPoints);

        const score = mappedValue ?? directPlayerScore ?? 0;
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
              {activeQuestionIndex !== null && totalQuestions > 0
                ? ` • Question ${
                    Math.min(activeQuestionIndex, totalQuestions - 1) + 1
                  } / ${totalQuestions}`
                : ""}
            </div>
            <h1 className="text-3xl xl:text-4xl font-black tracking-tight truncate">
              {gameTitle}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {remainingSeconds !== null && (
            <div
              className={`flex items-center gap-2.5 px-5 py-2.5 rounded-2xl border-2 font-mono text-3xl xl:text-4xl font-black transition ${
                remainingSeconds <= 3
                  ? "bg-rose-500/25 border-rose-400 text-rose-200 animate-pulse"
                  : "bg-sky-500/15 border-sky-400/45 text-sky-200"
              }`}
            >
              <Clock className="w-7 h-7 shrink-0" />
              <span>{remainingSeconds}s</span>
            </div>
          )}

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
            {questionLabel ? (
              <h2
                className={`font-black text-white text-center break-words [word-break:normal] hyphens-none ${getQuestionFontSize(
                  questionLabel
                )}`}
              >
                {questionLabel}
              </h2>
            ) : (
              <p className="text-3xl font-bold text-neutral-400 text-center">
                En attente du lancement des questions...
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
                  className={`relative w-full h-full rounded-3xl border-2 px-4 py-3 flex items-center justify-center transition-all duration-300 overflow-hidden ${
                    style.bg
                  } ${style.border} ${
                    isCorrect
                      ? "ring-4 ring-emerald-300 scale-[1.01] shadow-2xl"
                      : isDimmed
                      ? "opacity-45"
                      : "shadow-lg"
                  }`}
                >
                  {/* Lettre placée dans le coin supérieur gauche */}
                  <div
                    className={`absolute top-3 left-3 w-10 h-10 xl:w-11 xl:h-11 rounded-xl border-2 flex items-center justify-center font-black text-xl xl:text-2xl z-10 ${style.badgeBg}`}
                  >
                    {letter}
                  </div>

                  {/* Texte de réponse centré verticalement et horizontalement sans couper les mots */}
                  <div className="w-full h-full flex items-center justify-center text-center px-10">
                    <span
                      className={`font-black text-white text-center whitespace-normal break-normal [word-break:normal] hyphens-none line-clamp-3 ${getOptionFontSize(
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
