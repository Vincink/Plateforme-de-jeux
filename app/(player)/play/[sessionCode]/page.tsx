"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  Delete,
  Gamepad2,
  Lock,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  Wifi,
  WifiOff,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getNextAvailableColorIndex,
  getUniquePlayerColor,
} from "@/lib/colorsplayer";
import { QUESTIONS, type QuizQuestion } from "@/lib/questions";
import {
  JUSTE_CHIFFRE_QUESTIONS,
  type JusteChiffreQuestion,
} from "@/lib/juste-chiffre-questions";
import type {
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

interface QuizQuestionPayload {
  id?: string | number;
  question?: string;
  prompt?: string;
  title?: string;
  text?: string;
  options?: string[] | Record<string, string>;
  choices?: string[] | Record<string, string>;
  answers?: string[] | Record<string, string>;
  correct?: string | number;
  correctIndex?: number;
  correct_index?: number;
  correctAnswer?: string | number;
  correct_answer?: string | number;
  answer?: string | number;
  unit?: string;
  points?: number;
}

interface QuizGameState {
  mode?: string;
  minValue?: number;
  maxValue?: number;
  questionStarted?: boolean;
  roundTriggered?: boolean;
  questionIndex?: number | null;
  currentQuestionIndex?: number | null;
  questionStartedAt?: string | number | null;
  durationSeconds?: number | null;
  isPaused?: boolean;
  pausedRemainingSeconds?: number | null;
  seriesNumber?: number;
  seriesSeed?: string;
  questions?: QuizQuestionPayload[];
  currentQuestion?: QuizQuestionPayload | null;
  targetNumber?: number | null;
  estimates?: Record<string, unknown>;
  guesses?: Record<string, unknown>;
  answers?: Record<string, unknown>;
  revealed?: boolean;
  [key: string]: unknown;
}

type ExtendedGameSession = GameSession & {
  game_state?: QuizGameState | null;
};

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

interface QuestionSnapshot {
  key: string;
  question: QuizQuestionPayload;
  options: string[];
  chosenLetter: string | null;
}

const CHOICE_STYLES = [
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

const KEYPAD_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const LETTERS = ["A", "B", "C", "D"] as const;
const DEFAULT_QUESTION_DURATION_SECONDS = 12;
const DEFAULT_JUSTE_CHIFFRE_DURATION_SECONDS = 20;
const JUSTE_CHIFFRE_MIN = 1;
const JUSTE_CHIFFRE_MAX = 1000;

function isJusteChiffreGameState(
  state: QuizGameState | null | undefined,
  gameTitle?: string | null,
  gameSlug?: string | null
): boolean {
  const mode = String(state?.mode ?? "").toLowerCase();
  const title = String(gameTitle ?? "").toLowerCase();
  const slug = String(gameSlug ?? "").toLowerCase();
  return (
    mode.includes("juste-chiffre") ||
    mode.includes("juste_chiffre") ||
    mode.includes("estimation") ||
    slug.includes("juste-chiffre") ||
    slug.includes("juste_chiffre") ||
    slug.includes("estimation") ||
    title.includes("juste chiffre") ||
    title.includes("estimation")
  );
}

function parseNumericEstimate(
  raw: unknown,
  minVal: number,
  maxVal: number
): number | null {
  if (raw === null || raw === undefined) return null;
  const candidate =
    typeof raw === "object"
      ? (raw as { guess?: unknown; value?: unknown; answer?: unknown })
          .guess ??
        (raw as { guess?: unknown; value?: unknown; answer?: unknown })
          .value ??
        (raw as { guess?: unknown; value?: unknown; answer?: unknown })
          .answer
      : raw;
  const num =
    typeof candidate === "number"
      ? candidate
      : typeof candidate === "string" && candidate.trim() !== ""
      ? Number(candidate.trim())
      : NaN;
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  if (rounded < minVal || rounded > maxVal) return null;
  return rounded;
}

function hashStringToSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffleWithSeed<T>(items: T[], seedKey: string): T[] {
  const copy = [...items];
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
  return copy;
}

function extractOptions(
  rawOptions: QuizQuestionPayload["options"]
): string[] {
  if (!rawOptions) return [];
  if (Array.isArray(rawOptions)) {
    return rawOptions.map((item) => String(item));
  }
  if (typeof rawOptions === "string") {
    try {
      const decoded = JSON.parse(rawOptions) as unknown;
      if (Array.isArray(decoded)) {
        return decoded.map((item) => String(item));
      }
    } catch {
      return [];
    }
  }
  return LETTERS.map((letter) => String(rawOptions[letter] ?? "")).filter(
    Boolean
  );
}

function normalizeAnswerLetter(
  raw: unknown,
  options: string[] = []
): string | null {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 3) {
    return LETTERS[raw] ?? null;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    const upper = trimmed.toUpperCase();
    if (upper === "A" || upper === "B" || upper === "C" || upper === "D") {
      return upper;
    }
    if (upper === "0" || upper === "1" || upper === "2" || upper === "3") {
      return LETTERS[Number(upper)] ?? null;
    }
    const matchedIdx = options.findIndex(
      (opt) => opt.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (matchedIdx >= 0 && matchedIdx <= 3) {
      return LETTERS[matchedIdx] ?? null;
    }
  }
  return null;
}

function resolveCorrectLetter(
  question: QuizQuestionPayload | null,
  options: string[] = []
): string | null {
  if (!question) return null;
  const rawIdx =
    typeof question.correctIndex === "number"
      ? question.correctIndex
      : typeof question.correct_index === "number"
      ? question.correct_index
      : null;
  if (rawIdx !== null && rawIdx >= 0 && rawIdx <= 3) {
    return LETTERS[rawIdx] ?? null;
  }
  return normalizeAnswerLetter(
    question.correct ??
      question.correctAnswer ??
      question.correct_answer ??
      question.answer,
    options
  );
}

function extractScoreValue(row: PlayerScore | undefined): number {
  if (!row) return 0;
  const rec = row as unknown as { total_score?: number; score?: number };
  const val = rec.total_score ?? rec.score ?? 0;
  return typeof val === "number" && Number.isFinite(val) ? Math.max(0, val) : 0;
}

export default function PlayerControllerPage() {
  const params = useParams<{ sessionCode: string }>();
  const sessionCode = (params?.sessionCode ?? "").toUpperCase();
  const supabase = getSupabaseBrowserClient();

  const [identity, setIdentity] = useState<PlayerIdentity | null>(null);
  const [nicknameInput, setNicknameInput] = useState<string>("");
  const [session, setSession] = useState<ExtendedGameSession | null>(null);
  const [gameMeta, setGameMeta] = useState<{
    title?: string | null;
    slug?: string | null;
  } | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [scores, setScores] = useState<PlayerScore[]>([]);
  const [localScore, setLocalScore] = useState<number>(0);
  const [submittedQuestionKey, setSubmittedQuestionKey] = useState<
    string | null
  >(null);
  const [submittedChoiceLetter, setSubmittedChoiceLetter] = useState<
    string | null
  >(null);
  const [highlightedChoiceLetter, setHighlightedChoiceLetter] = useState<
    string | null
  >(null);

  // États dédiés au pavé numérique Le Juste Chiffre
  const [digitsInput, setDigitsInput] = useState<string>("");
  const [submittedEstimate, setSubmittedEstimate] = useState<number | null>(
    null
  );
  const [estimateFeedback, setEstimateFeedback] = useState<string | null>(null);
  const [isSubmittingEstimate, setIsSubmittingEstimate] =
    useState<boolean>(false);

  const [remainingSeconds, setRemainingSeconds] = useState<number>(
    DEFAULT_QUESTION_DURATION_SECONDS
  );
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const highlightTimeoutRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const settledQuestionsRef = useRef<Set<string>>(new Set());
  const currentScoreRef = useRef<number>(0);
  const snapshotByKeyRef = useRef<Record<string, QuestionSnapshot>>({});
  const prevQuestionKeyRef = useRef<string | null>(null);
  const questionStartMsRef = useRef<number>(Date.now());
  const identityRef = useRef<PlayerIdentity | null>(null);
  const sessionRef = useRef<ExtendedGameSession | null>(null);
  const scoresRef = useRef<PlayerScore[]>([]);
  const lastResetKeyRef = useRef<string>("");

  identityRef.current = identity;
  sessionRef.current = session;
  scoresRef.current = scores;

  const persistPlayerScore = async (
    targetSessionId: string,
    targetIdentity: PlayerIdentity,
    nextScore: number
  ) => {
    if (!supabase || !targetSessionId) return;

    const clampedScore = Math.max(0, nextScore);

    const { data: existingRows } = await supabase
      .from("player_scores")
      .select("id, total_score")
      .eq("session_id", targetSessionId)
      .eq("player_id", targetIdentity.playerId);

    if (Array.isArray(existingRows) && existingRows.length > 0) {
      const targetId = (existingRows[0] as { id: string }).id;
      await supabase
        .from("player_scores")
        .update({
          nickname: targetIdentity.nickname,
          avatar_id: targetIdentity.avatarId,
          total_score: clampedScore,
        })
        .eq("id", targetId);
      return;
    }

    await supabase.from("player_scores").upsert(
      {
        session_id: targetSessionId,
        player_id: targetIdentity.playerId,
        nickname: targetIdentity.nickname,
        avatar_id: targetIdentity.avatarId,
        total_score: clampedScore,
      },
      { onConflict: "session_id,player_id" }
    );
  };

  const clearHighlightTimer = () => {
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearHighlightTimer();
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return;
    }

    let isDisposed = false;

    const navWithWakeLock = navigator as Navigator & {
      wakeLock?: {
        request: (type: "screen") => Promise<WakeLockSentinelLike>;
      };
    };

    const releaseWakeLock = async () => {
      const current = wakeLockRef.current;
      wakeLockRef.current = null;
      if (current) {
        await current.release().catch(() => {});
      }
    };

    const requestWakeLock = async () => {
      if (isDisposed || document.visibilityState !== "visible") return;
      if (wakeLockRef.current) return;

      try {
        const sentinel = await navWithWakeLock.wakeLock?.request("screen");
        if (!sentinel) return;

        if (isDisposed) {
          await sentinel.release().catch(() => {});
          return;
        }

        wakeLockRef.current = sentinel;
      } catch {
        wakeLockRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      } else {
        void releaseWakeLock();
      }
    };

    const handleResume = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      }
    };

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handleResume);
    window.addEventListener("focus", handleResume);

    return () => {
      isDisposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handleResume);
      window.removeEventListener("focus", handleResume);
      void releaseWakeLock();
    };
  }, []);

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
          identityRef.current = restored;
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

  const quizState = session?.game_state ?? {};
  const activeGameId = session?.game_id ?? null;
  const roundStatus = session?.status ?? "lobby";
  const statusLower = String(roundStatus).toLowerCase();
  const seriesNumber = Math.max(1, Number(quizState.seriesNumber ?? 1) || 1);
  const seriesSeed =
    typeof quizState.seriesSeed === "string" ? quizState.seriesSeed : "";

  const isJusteChiffreMode = useMemo(
    () =>
      isJusteChiffreGameState(quizState, gameMeta?.title, gameMeta?.slug),
    [quizState, gameMeta?.title, gameMeta?.slug]
  );

  const minEstimate = useMemo(() => {
    const raw = Number(quizState.minValue);
    return Number.isFinite(raw) && raw >= 1
      ? Math.round(raw)
      : JUSTE_CHIFFRE_MIN;
  }, [quizState.minValue]);

  const maxEstimate = useMemo(() => {
    const raw = Number(quizState.maxValue);
    return Number.isFinite(raw) && raw > minEstimate
      ? Math.round(raw)
      : JUSTE_CHIFFRE_MAX;
  }, [quizState.maxValue, minEstimate]);

  useEffect(() => {
    if (!session?.id) return;

    const isResetStatus =
      statusLower === "lobby" ||
      statusLower === "finished" ||
      statusLower === "ended" ||
      statusLower === "completed";

    const resetTrigger = isResetStatus
      ? `${session.id}-status:${statusLower}`
      : `${session.id}-series:${seriesNumber}:${seriesSeed}`;

    const isNewSeries =
      lastResetKeyRef.current !== "" &&
      !lastResetKeyRef.current.includes(`series:${seriesNumber}:${seriesSeed}`) &&
      resetTrigger.includes("series:");

    if (lastResetKeyRef.current === "") {
      lastResetKeyRef.current = resetTrigger;
      if (!isResetStatus) return;
    }

    if (!isResetStatus && !isNewSeries) {
      return;
    }

    if (lastResetKeyRef.current === resetTrigger) {
      return;
    }

    lastResetKeyRef.current = resetTrigger;
    currentScoreRef.current = 0;
    setLocalScore(0);
    settledQuestionsRef.current = new Set();
    snapshotByKeyRef.current = {};
    setSubmittedQuestionKey(null);
    setSubmittedChoiceLetter(null);
    setHighlightedChoiceLetter(null);
    setDigitsInput("");
    setSubmittedEstimate(null);
    setEstimateFeedback(null);
    setScores((prev) => {
      const updated = prev.map((row) => ({
        ...row,
        total_score: 0,
      }));
      scoresRef.current = updated;
      return updated;
    });
  }, [session?.id, statusLower, seriesNumber, seriesSeed]);

  const activeQuestionIndex = useMemo<number | null>(() => {
    const rawIdx =
      quizState.questionIndex ?? quizState.currentQuestionIndex ?? null;
    if (typeof rawIdx === "number" && Number.isFinite(rawIdx) && rawIdx >= 0) {
      return Math.floor(rawIdx);
    }
    return null;
  }, [quizState.questionIndex, quizState.currentQuestionIndex]);

  const currentQuestionKey = useMemo<string | null>(() => {
    if (activeQuestionIndex === null) return null;
    return `${session?.id ?? sessionCode}-s${seriesNumber}-${seriesSeed}-q${activeQuestionIndex}`;
  }, [
    activeQuestionIndex,
    seriesNumber,
    seriesSeed,
    session?.id,
    sessionCode,
  ]);

  const activeQuestion = useMemo<QuizQuestionPayload | null>(() => {
    if (quizState.currentQuestion) {
      return quizState.currentQuestion;
    }
    const idx = activeQuestionIndex ?? 0;
    const fallbackPool: QuizQuestionPayload[] = isJusteChiffreMode
      ? (JUSTE_CHIFFRE_QUESTIONS as JusteChiffreQuestion[])
      : (QUESTIONS as QuizQuestion[]);

    const rawList: QuizQuestionPayload[] =
      Array.isArray(quizState.questions) && quizState.questions.length > 0
        ? quizState.questions
        : fallbackPool;

    if (rawList.length > 0) {
      const ordered = shuffleWithSeed<QuizQuestionPayload>(
        rawList,
        `${session?.id ?? ""}-${sessionCode}-${seriesNumber}-${seriesSeed}`
      ).slice(0, Math.min(15, rawList.length));
      const safeIdx = Math.min(idx, ordered.length - 1);
      return ordered[safeIdx] ?? null;
    }

    return null;
  }, [
    quizState.currentQuestion,
    quizState.questions,
    activeQuestionIndex,
    isJusteChiffreMode,
    seriesNumber,
    seriesSeed,
    session?.id,
    sessionCode,
  ]);

  const parsedOptions = useMemo<string[]>(() => {
    const raw =
      activeQuestion?.options ??
      activeQuestion?.choices ??
      activeQuestion?.answers;
    return extractOptions(raw);
  }, [activeQuestion]);

  const questionDuration = useMemo<number>(() => {
    if (
      typeof quizState.durationSeconds === "number" &&
      Number.isFinite(quizState.durationSeconds) &&
      quizState.durationSeconds > 0
    ) {
      return quizState.durationSeconds;
    }
    return isJusteChiffreMode
      ? DEFAULT_JUSTE_CHIFFRE_DURATION_SECONDS
      : DEFAULT_QUESTION_DURATION_SECONDS;
  }, [quizState.durationSeconds, isJusteChiffreMode]);

  const settleSnapshot = (
    snapshot: QuestionSnapshot | null,
    updateMessage: boolean
  ) => {
    const activeIdentity = identityRef.current;
    const activeSession = sessionRef.current;
    if (!activeIdentity || !snapshot) return;

    const settlementKey = `${activeIdentity.playerId}::${snapshot.key}`;
    if (settledQuestionsRef.current.has(settlementKey)) return;

    const chosenLetter = snapshot.chosenLetter;
    settledQuestionsRef.current.add(settlementKey);

    if (!chosenLetter) {
      if (updateMessage) {
        setStatusMessage("Temps écoulé • 0 pt");
      }
      return;
    }

    const correctLetter = resolveCorrectLetter(
      snapshot.question,
      snapshot.options
    );
    const isCorrect = Boolean(correctLetter) && chosenLetter === correctLetter;
    const delta = isCorrect ? 3 : -1;

    const dbRowScore = extractScoreValue(
      scoresRef.current.find((s) => s.player_id === activeIdentity.playerId)
    );
    const baseScore = Math.max(currentScoreRef.current, dbRowScore);
    const nextScore = Math.max(0, baseScore + delta);
    currentScoreRef.current = nextScore;
    setLocalScore(nextScore);

    setScores((prev) => {
      const exists = prev.some((s) => s.player_id === activeIdentity.playerId);
      const updated = exists
        ? prev.map((s) =>
            s.player_id === activeIdentity.playerId
              ? ({
                  ...s,
                  total_score: nextScore,
                  score: nextScore,
                } as PlayerScore)
              : s
          )
        : [
            ...prev,
            {
              id: `score-${activeIdentity.playerId}`,
              session_id: activeSession?.id ?? sessionCode,
              player_id: activeIdentity.playerId,
              total_score: nextScore,
              score: nextScore,
            } as unknown as PlayerScore,
          ];
      scoresRef.current = updated;
      return updated;
    });

    if (activeSession?.id) {
      void persistPlayerScore(activeSession.id, activeIdentity, nextScore);
    }

    if (updateMessage) {
      setStatusMessage(
        isCorrect
          ? "Temps écoulé • Bonne réponse (+3 pts)"
          : "Temps écoulé • Mauvaise réponse (-1 pt)"
      );
    }
  };

  useEffect(() => {
    if (isJusteChiffreMode || !currentQuestionKey || !activeQuestion) return;

    const existing = snapshotByKeyRef.current[currentQuestionKey];
    const chosen =
      submittedQuestionKey === currentQuestionKey && submittedChoiceLetter
        ? submittedChoiceLetter
        : existing?.chosenLetter ?? null;

    snapshotByKeyRef.current[currentQuestionKey] = {
      key: currentQuestionKey,
      question: activeQuestion,
      options: parsedOptions,
      chosenLetter: chosen,
    };
  }, [
    isJusteChiffreMode,
    currentQuestionKey,
    activeQuestion,
    parsedOptions,
    submittedQuestionKey,
    submittedChoiceLetter,
  ]);

  useEffect(() => {
    const previousKey = prevQuestionKeyRef.current;
    if (!isJusteChiffreMode && previousKey && previousKey !== currentQuestionKey) {
      const prevSnap = snapshotByKeyRef.current[previousKey] ?? null;
      settleSnapshot(prevSnap, false);
    }

    prevQuestionKeyRef.current = currentQuestionKey;
    questionStartMsRef.current = Date.now();
    clearHighlightTimer();
    setSubmittedQuestionKey(null);
    setSubmittedChoiceLetter(null);
    setHighlightedChoiceLetter(null);
    setDigitsInput("");
    setSubmittedEstimate(null);
    setEstimateFeedback(null);
    setRemainingSeconds(questionDuration);
    setStatusMessage("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isJusteChiffreMode,
    activeGameId,
    currentQuestionKey,
    questionDuration,
  ]);

  // Restauration de l'estimation existante si le joueur recharge ou se synchronise
  useEffect(() => {
    if (!isJusteChiffreMode || !identity?.playerId) return;
    const rawMap =
      quizState.estimates ?? quizState.guesses ?? quizState.answers ?? {};
    const existingEst = parseNumericEstimate(
      rawMap[String(identity.playerId)],
      minEstimate,
      maxEstimate
    );
    if (existingEst !== null && submittedEstimate === null) {
      setSubmittedEstimate(existingEst);
      setDigitsInput(String(existingEst));
    }
  }, [
    isJusteChiffreMode,
    identity?.playerId,
    quizState.estimates,
    quizState.guesses,
    quizState.answers,
    minEstimate,
    maxEstimate,
    submittedEstimate,
  ]);

  useEffect(() => {
    if (
      currentQuestionKey === null ||
      roundStatus !== "playing" ||
      quizState.revealed ||
      quizState.isPaused
    ) {
      return;
    }

    const tick = () => {
      const elapsed = Math.max(
        0,
        (Date.now() - questionStartMsRef.current) / 1000
      );
      setRemainingSeconds(Math.max(0, questionDuration - elapsed));
    };

    tick();
    const intervalId = window.setInterval(tick, 200);
    return () => window.clearInterval(intervalId);
  }, [
    currentQuestionKey,
    roundStatus,
    quizState.revealed,
    quizState.isPaused,
    questionDuration,
  ]);

  const alreadySubmittedThisQuestion =
    currentQuestionKey !== null &&
    submittedQuestionKey === currentQuestionKey;
  const isTimerExpired =
    currentQuestionKey !== null &&
    roundStatus === "playing" &&
    !quizState.isPaused &&
    (remainingSeconds <= 0 || Boolean(quizState.revealed));
  const isPlaying = roundStatus === "playing" && !isTimerExpired;

  useEffect(() => {
    if (isJusteChiffreMode || !isTimerExpired || !currentQuestionKey) return;
    const snap = snapshotByKeyRef.current[currentQuestionKey] ?? null;
    settleSnapshot(snap, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJusteChiffreMode, isTimerExpired, currentQuestionKey, identity?.playerId]);

  useEffect(() => {
    if (!supabase || !sessionCode) return;

    let isMounted = true;
    let childrenChannel: ReturnType<typeof supabase.channel> | null = null;

    const loadGameMeta = async (gameId: string | null | undefined) => {
      if (!gameId) return;
      const { data } = await supabase
        .from("games")
        .select("title, slug")
        .eq("id", gameId)
        .maybeSingle<{ title?: string | null; slug?: string | null }>();
      if (isMounted && data) {
        setGameMeta(data);
      }
    };

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
        const rows = scoresData as PlayerScore[];
        setScores(rows);
        scoresRef.current = rows;
        try {
          const saved = localStorage.getItem(`player_identity_${sessionCode}`);
          const parsed = saved
            ? (JSON.parse(saved) as Partial<PlayerIdentity>)
            : null;
          if (parsed?.playerId) {
            const match = rows.find((r) => r.player_id === parsed.playerId);
            if (match) {
              const dbScore = extractScoreValue(match);
              currentScoreRef.current = dbScore;
              setLocalScore(dbScore);
            }
          }
        } catch {
          // Ignore storage errors
        }
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
            identityRef.current = null;
            setLocalScore(0);
            currentScoreRef.current = 0;
            setStatusMessage("Tu as été exclu de la partie.");
          }
        }
      } catch {
        // Ignore storage errors
      }
    };

    const bindSessionData = (targetSession: ExtendedGameSession) => {
      if (childrenChannel) {
        void supabase.removeChannel(childrenChannel);
      }

      void loadPlayersAndScores(targetSession.id);
      void loadGameMeta(targetSession.game_id);

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
    };

    const fetchInitialSession = async () => {
      const { data } = await supabase
        .from("game_sessions")
        .select("*")
        .eq("code", sessionCode)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<ExtendedGameSession>();

      if (!isMounted) return;
      if (data) {
        setSession(data);
        sessionRef.current = data;
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
          const nextRow = payload.new as ExtendedGameSession | null;
          if (!nextRow) return;
          setSession(nextRow);
          sessionRef.current = nextRow;
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
    };
  }, [supabase, sessionCode]);

  const qcmChoices = useMemo(() => {
    return CHOICE_STYLES.map((style, idx) => ({
      ...style,
      optionValue: parsedOptions[idx] ?? style.letter,
    }));
  }, [parsedOptions]);

  const myScore = useMemo(() => {
    if (!identity) return 0;
    const match = scores.find((s) => s.player_id === identity.playerId);
    const dbScore = extractScoreValue(match);
    const effective = Math.max(localScore, dbScore, currentScoreRef.current);
    currentScoreRef.current = effective;
    return effective;
  }, [identity, scores, localScore]);

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
          .maybeSingle<ExtendedGameSession>();
        targetSession = data ?? null;
        if (data) {
          setSession(data);
          sessionRef.current = data;
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
      identityRef.current = newIdentity;

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

        await persistPlayerScore(targetSession.id, newIdentity, 0);

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
        if (scoresData) {
          setScores(scoresData as PlayerScore[]);
          scoresRef.current = scoresData as PlayerScore[];
        }
      }

      setStatusMessage("Connecté à la partie !");
    } finally {
      setIsJoining(false);
    }
  };

  const handleSubmitChoice = async (choice: {
    letter: string;
    optionValue: string;
  }) => {
    if (
      !identity ||
      alreadySubmittedThisQuestion ||
      !isPlaying ||
      !currentQuestionKey
    ) {
      return;
    }

    const round = (activeQuestionIndex ?? 0) + 1;
    const chosenLetter = choice.letter;

    snapshotByKeyRef.current[currentQuestionKey] = {
      key: currentQuestionKey,
      question: activeQuestion ?? {},
      options: parsedOptions,
      chosenLetter,
    };

    if (supabase && session?.id) {
      const currentAnswers =
        quizState.answers && typeof quizState.answers === "object"
          ? ({ ...quizState.answers } as Record<string, string>)
          : {};
      currentAnswers[String(identity.playerId)] = chosenLetter;

      const nextGameState: QuizGameState = {
        ...quizState,
        answers: currentAnswers,
      };

      const [{ error: actionError }, { error: sessionUpdateError }] =
        await Promise.all([
          supabase.from("player_actions").insert({
            session_id: session.id,
            player_id: identity.playerId,
            round_number: round,
            action_type: "answer",
            payload: {
              answer: choice.optionValue,
              choice_letter: chosenLetter,
              question_index: activeQuestionIndex ?? 0,
            },
          }),
          supabase
            .from("game_sessions")
            .update({ game_state: nextGameState })
            .eq("id", session.id),
        ]);

      if (actionError || sessionUpdateError) {
        setStatusMessage(
          `Envoi impossible : ${
            actionError?.message ?? sessionUpdateError?.message ?? ""
          }`
        );
        return;
      }

      setSession((prev) => {
        const updated = prev ? { ...prev, game_state: nextGameState } : prev;
        sessionRef.current = updated;
        return updated;
      });
    }

    clearHighlightTimer();
    setSubmittedQuestionKey(currentQuestionKey);
    setSubmittedChoiceLetter(chosenLetter);
    setHighlightedChoiceLetter(chosenLetter);
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedChoiceLetter(null);
      highlightTimeoutRef.current = null;
    }, 1000);

    setStatusMessage(
      `Choix ${chosenLetter} enregistré (points à la fin du chrono)`
    );
  };

  // --- Handlers pavé numérique Le Juste Chiffre ---
  const isKeypadLocked =
    submittedEstimate !== null || !isPlaying || isSubmittingEstimate;

  const handleDigitPress = (digit: string) => {
    if (isKeypadLocked) return;
    setEstimateFeedback(null);
    setDigitsInput((prev) => {
      if (prev === "0") {
        return digit === "0" ? "0" : digit;
      }
      const next = `${prev}${digit}`;
      if (next.length > 4) return prev;
      const parsed = Number(next);
      if (parsed > maxEstimate) {
        setEstimateFeedback(
          `Maximum ${maxEstimate} (entre ${minEstimate} et ${maxEstimate})`
        );
        return prev;
      }
      return next;
    });
  };

  const handleBackspaceDigit = () => {
    if (isKeypadLocked) return;
    setEstimateFeedback(null);
    setDigitsInput((prev) => prev.slice(0, -1));
  };

  const handleClearDigits = () => {
    if (isKeypadLocked) return;
    setEstimateFeedback(null);
    setDigitsInput("");
  };

  const handleSubmitEstimate = async () => {
    if (isKeypadLocked || !identity) return;

    const trimmed = digitsInput.trim();
    if (!trimmed) {
      setEstimateFeedback(
        `Entre un nombre entre ${minEstimate} et ${maxEstimate}.`
      );
      return;
    }

    const numericValue = Number(trimmed);
    if (
      !Number.isInteger(numericValue) ||
      numericValue < minEstimate ||
      numericValue > maxEstimate
    ) {
      setEstimateFeedback(
        `La réponse doit être entre ${minEstimate} et ${maxEstimate}.`
      );
      return;
    }

    setIsSubmittingEstimate(true);
    setEstimateFeedback(null);

    try {
      const round = (activeQuestionIndex ?? 0) + 1;
      const playerIdStr = String(identity.playerId);

      const currentEstimates =
        quizState.estimates && typeof quizState.estimates === "object"
          ? { ...quizState.estimates }
          : {};
      const currentAnswers =
        quizState.answers && typeof quizState.answers === "object"
          ? { ...quizState.answers }
          : {};

      currentEstimates[playerIdStr] = numericValue;
      currentAnswers[playerIdStr] = String(numericValue);

      const nextGameState: QuizGameState = {
        ...quizState,
        estimates: currentEstimates,
        answers: currentAnswers,
      };

      if (supabase && session?.id) {
        const [{ error: actionError }, { error: updateError }] =
          await Promise.all([
            supabase.from("player_actions").insert({
              session_id: session.id,
              player_id: identity.playerId,
              round_number: round,
              action_type: "answer",
              payload: {
                answer: String(numericValue),
                guess: numericValue,
                question_index: activeQuestionIndex ?? 0,
              },
            }),
            supabase
              .from("game_sessions")
              .update({ game_state: nextGameState })
              .eq("id", session.id),
          ]);

        if (actionError || updateError) {
          setEstimateFeedback(
            `Envoi impossible : ${
              actionError?.message ?? updateError?.message ?? ""
            }`
          );
          return;
        }
      }

      setSubmittedEstimate(numericValue);
      setSession((prev) => {
        const updated = prev ? { ...prev, game_state: nextGameState } : prev;
        sessionRef.current = updated;
        return updated;
      });
      setStatusMessage(`Estimation ${numericValue} validée !`);
    } finally {
      setIsSubmittingEstimate(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col justify-between p-4 sm:p-5 select-none">
      <div className="max-w-md w-full mx-auto flex-1 flex flex-col space-y-4">
        {/* Top Bar */}
        <header className="flex items-center justify-between border-b border-white/10 pb-3.5 shrink-0">
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
            className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4 my-auto"
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
          <main className="flex-1 flex flex-col space-y-4">
            {/* Player Status Card */}
            <div
              style={{
                backgroundColor: myColor.bgHex,
                borderColor: myColor.borderHex,
                color: myColor.textHex,
              }}
              className="border-2 rounded-3xl p-4 flex items-center justify-between shadow-lg shrink-0"
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
                    {activeQuestionIndex !== null
                      ? `Question ${activeQuestionIndex + 1}`
                      : isJusteChiffreMode
                      ? "Le Juste Chiffre"
                      : "Quiz"}{" "}
                    • État : <span className="uppercase">{roundStatus}</span>
                  </div>
                </div>
              </div>
              <Gamepad2 className="w-6 h-6 opacity-90" />
            </div>

            {/* Active Question / Action Zone */}
            <div className="flex-1 flex flex-col justify-between bg-white/5 border border-white/10 rounded-3xl p-4 sm:p-5 space-y-4">
              {roundStatus !== "playing" ? (
                <div className="my-auto py-8 text-center space-y-1">
                  <p className="text-base font-bold text-amber-300">
                    {roundStatus === "paused"
                      ? "Partie en pause"
                      : roundStatus === "finished"
                      ? "Partie terminée"
                      : "Regarde la télé pour la suite..."}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {activeQuestionIndex !== null
                      ? `Question ${activeQuestionIndex + 1}`
                      : "En attente"}
                  </p>
                </div>
              ) : isJusteChiffreMode ? (
                /* ================= PAVÉ NUMÉRIQUE LE JUSTE CHIFFRE (1 - 1000) ================= */
                <div className="flex-1 flex flex-col justify-between gap-3">
                  <div className="rounded-2xl bg-black/40 border border-white/10 p-3 flex flex-col items-center gap-1.5">
                    <div className="w-full flex items-center justify-between text-[11px] font-bold text-neutral-400">
                      <span className="inline-flex items-center gap-1 text-amber-300">
                        <Target className="w-3.5 h-3.5" />
                        {minEstimate} à {maxEstimate}
                      </span>
                      {submittedEstimate !== null ? (
                        <span className="inline-flex items-center gap-1 text-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Validé
                        </span>
                      ) : isKeypadLocked ? (
                        <span className="inline-flex items-center gap-1 text-amber-300">
                          <Lock className="w-3.5 h-3.5" />
                          Verrouillé
                        </span>
                      ) : (
                        <span>Tape ton chiffre</span>
                      )}
                    </div>

                    <div className="w-full py-2.5 px-3 rounded-xl bg-neutral-900 border border-white/10 text-center font-mono text-4xl font-black tracking-wider text-amber-300">
                      {submittedEstimate !== null
                        ? submittedEstimate
                        : digitsInput || "—"}
                      {activeQuestion?.unit &&
                      (submittedEstimate !== null || digitsInput) ? (
                        <span className="text-sm font-sans font-bold text-neutral-300 ml-1.5">
                          {activeQuestion.unit}
                        </span>
                      ) : null}
                    </div>

                    {estimateFeedback && (
                      <p className="text-xs font-bold text-rose-300 text-center">
                        {estimateFeedback}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {KEYPAD_DIGITS.map((digit) => (
                      <button
                        key={digit}
                        type="button"
                        disabled={isKeypadLocked}
                        onClick={() => handleDigitPress(digit)}
                        className="h-12 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 disabled:opacity-35 disabled:pointer-events-none border border-white/15 font-mono text-xl font-black text-white transition"
                      >
                        {digit}
                      </button>
                    ))}

                    <button
                      type="button"
                      disabled={isKeypadLocked || !digitsInput}
                      onClick={handleClearDigits}
                      aria-label="Effacer"
                      className="h-12 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 active:scale-95 disabled:opacity-35 disabled:pointer-events-none border border-rose-400/35 flex items-center justify-center text-rose-200 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      disabled={isKeypadLocked}
                      onClick={() => handleDigitPress("0")}
                      className="h-12 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 disabled:opacity-35 disabled:pointer-events-none border border-white/15 font-mono text-xl font-black text-white transition"
                    >
                      0
                    </button>

                    <button
                      type="button"
                      disabled={isKeypadLocked || !digitsInput}
                      onClick={handleBackspaceDigit}
                      aria-label="Corriger"
                      className="h-12 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 active:scale-95 disabled:opacity-35 disabled:pointer-events-none border border-amber-400/35 flex items-center justify-center text-amber-200 transition"
                    >
                      <Delete className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isKeypadLocked || !digitsInput}
                    onClick={() => void handleSubmitEstimate()}
                    className="w-full h-12 rounded-2xl bg-emerald-400 hover:bg-emerald-300 active:scale-[0.99] disabled:bg-white/10 disabled:text-neutral-500 disabled:pointer-events-none text-black font-black text-sm uppercase tracking-wider transition"
                  >
                    {submittedEstimate !== null
                      ? `Estimation validée (${submittedEstimate})`
                      : isSubmittingEstimate
                      ? "Validation..."
                      : "Valider"}
                  </button>
                </div>
              ) : (
                /* ================= 4 BOUTONS QUIZ (A / B / C / D) ================= */
                <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-4 min-h-[300px]">
                  {qcmChoices.map((choice) => {
                    const isHighlighted =
                      highlightedChoiceLetter === choice.letter;
                    return (
                      <button
                        key={choice.letter}
                        type="button"
                        disabled={
                          alreadySubmittedThisQuestion || isTimerExpired
                        }
                        onClick={() =>
                          void handleSubmitChoice({
                            letter: choice.letter,
                            optionValue: choice.optionValue,
                          })
                        }
                        style={{
                          backgroundColor: choice.bgHex,
                          borderColor: isHighlighted
                            ? "#ffffff"
                            : choice.borderHex,
                          color: choice.textHex,
                        }}
                        className={`h-full min-h-[140px] rounded-3xl border-4 flex items-center justify-center text-6xl font-black tracking-tight shadow-xl active:scale-95 transition-all duration-300 ${
                          isHighlighted ? "scale-105" : "scale-100"
                        }`}
                      >
                        {choice.letter}
                      </button>
                    );
                  })}
                </div>
              )}

              {statusMessage && (
                <p className="text-xs text-emerald-300 text-center pt-1 font-semibold shrink-0">
                  {statusMessage}
                </p>
              )}
            </div>
          </main>
        )}
      </div>

      <footer className="text-center text-[11px] text-neutral-500 pt-4 shrink-0">
        Manette Joueur • {sessionCode || "—"}
      </footer>
    </div>
  );
}
