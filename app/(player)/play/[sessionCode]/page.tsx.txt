"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Gamepad2, Trophy, Wifi, WifiOff, Sparkles } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getNextAvailableColorIndex,
  getUniquePlayerColor,
} from "@/lib/colorsplayer";
import { QUESTIONS, type QuizQuestion } from "@/lib/questions";
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
  points?: number;
}

interface QuizGameState {
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
  answers?: Record<string, string>;
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

const LETTERS = ["A", "B", "C", "D"] as const;
const DEFAULT_QUESTION_DURATION_SECONDS = 12;

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

function computeRemainingSeconds(
  state: QuizGameState,
  nowMs: number
): number {
  const duration =
    typeof state.durationSeconds === "number" &&
    Number.isFinite(state.durationSeconds) &&
    state.durationSeconds > 0
      ? state.durationSeconds
      : DEFAULT_QUESTION_DURATION_SECONDS;

  if (
    state.isPaused &&
    typeof state.pausedRemainingSeconds === "number" &&
    Number.isFinite(state.pausedRemainingSeconds)
  ) {
    return Math.max(0, state.pausedRemainingSeconds);
  }

  const rawStart = state.questionStartedAt;
  if (rawStart === null || rawStart === undefined || rawStart === "") {
    return duration;
  }

  const startMs =
    typeof rawStart === "number" ? rawStart : Date.parse(String(rawStart));
  if (Number.isNaN(startMs)) {
    return duration;
  }

  const elapsedSeconds = Math.max(0, (nowMs - startMs) / 1000);
  return Math.max(0, duration - elapsedSeconds);
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
  const snapshotRef = useRef<QuestionSnapshot | null>(null);
  const prevQuestionKeyRef = useRef<string | null>(null);

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

    const requestWakeLock = async () => {
      if (isDisposed || document.visibilityState !== "visible") return;
      try {
        const navWithLock = navigator as Navigator & {
          wakeLock?: {
            request: (type: "screen") => Promise<WakeLockSentinelLike>;
          };
        };
        if (wakeLockRef.current) return;
        const sentinel = await navWithLock.wakeLock?.request("screen");
        if (isDisposed) {
          await sentinel?.release?.();
          return;
        }
        wakeLockRef.current = sentinel ?? null;
      } catch {
        // Ignore if unsupported or blocked by device
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      } else {
        wakeLockRef.current = null;
      }
    };

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isDisposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockRef.current) {
        void wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
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
    const seriesNumber = Math.max(1, Number(quizState.seriesNumber ?? 1) || 1);
    const seriesSeed =
      typeof quizState.seriesSeed === "string" ? quizState.seriesSeed : "";
    return `${session?.id ?? sessionCode}-s${seriesNumber}-${seriesSeed}-q${activeQuestionIndex}`;
  }, [
    activeQuestionIndex,
    quizState.seriesNumber,
    quizState.seriesSeed,
    session?.id,
    sessionCode,
  ]);

  const activeQuestion = useMemo<QuizQuestionPayload | null>(() => {
    const idx = activeQuestionIndex ?? 0;
    const rawList =
      Array.isArray(quizState.questions) && quizState.questions.length > 0
        ? quizState.questions
        : (QUESTIONS as QuizQuestion[]);

    if (rawList.length > 0) {
      const seriesNumber = Math.max(1, Number(quizState.seriesNumber ?? 1) || 1);
      const seriesSeed =
        typeof quizState.seriesSeed === "string" && quizState.seriesSeed.trim()
          ? quizState.seriesSeed.trim()
          : `${session?.id ?? ""}-${sessionCode}-s${seriesNumber}`;
      const ordered = shuffleWithSeed(
        rawList,
        `${session?.id ?? ""}-${sessionCode}-${seriesNumber}-${seriesSeed}`
      ).slice(0, Math.min(15, rawList.length));
      const safeIdx = Math.min(idx, ordered.length - 1);
      return ordered[safeIdx] ?? null;
    }

    return quizState.currentQuestion ?? null;
  }, [
    activeQuestionIndex,
    quizState.questions,
    quizState.currentQuestion,
    quizState.seriesNumber,
    quizState.seriesSeed,
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

  const settleSnapshot = (snapshot: QuestionSnapshot | null) => {
    if (!identity || !snapshot) return;

    const settlementKey = `${identity.playerId}::${snapshot.key}`;
    if (settledQuestionsRef.current.has(settlementKey)) return;

    const chosenLetter =
      snapshot.chosenLetter ??
      normalizeAnswerLetter(
        quizState.answers?.[String(identity.playerId)],
        snapshot.options
      );

    settledQuestionsRef.current.add(settlementKey);

    if (!chosenLetter) {
      setStatusMessage("Temps écoulé • 0 pt");
      return;
    }

    const correctLetter = resolveCorrectLetter(
      snapshot.question,
      snapshot.options
    );
    const isCorrect = Boolean(correctLetter) && chosenLetter === correctLetter;
    const delta = isCorrect ? 3 : -1;

    const baseScore = Math.max(
      currentScoreRef.current,
      extractScoreValue(scores.find((s) => s.player_id === identity.playerId))
    );
    const nextScore = Math.max(0, baseScore + delta);
    currentScoreRef.current = nextScore;
    setLocalScore(nextScore);

    setScores((prev) => {
      const exists = prev.some((s) => s.player_id === identity.playerId);
      if (exists) {
        return prev.map((s) =>
          s.player_id === identity.playerId
            ? ({
                ...s,
                total_score: nextScore,
                score: nextScore,
              } as PlayerScore)
            : s
        );
      }
      return [
        ...prev,
        {
          id: `score-${identity.playerId}`,
          session_id: session?.id ?? sessionCode,
          player_id: identity.playerId,
          total_score: nextScore,
          score: nextScore,
        } as unknown as PlayerScore,
      ];
    });

    if (session?.id) {
      void persistPlayerScore(session.id, identity, nextScore);
    }

    setStatusMessage(
      isCorrect
        ? "Temps écoulé • Bonne réponse (+3 pts)"
        : "Temps écoulé • Mauvaise réponse (-1 pt)"
    );
  };

  useEffect(() => {
    if (!currentQuestionKey || !activeQuestion) return;

    const chosenLetter =
      submittedQuestionKey === currentQuestionKey
        ? submittedChoiceLetter
        : normalizeAnswerLetter(
            quizState.answers?.[String(identity?.playerId ?? "")],
            parsedOptions
          );

    if (snapshotRef.current && snapshotRef.current.key === currentQuestionKey) {
      snapshotRef.current = {
        ...snapshotRef.current,
        question: activeQuestion,
        options: parsedOptions,
        chosenLetter: chosenLetter ?? snapshotRef.current.chosenLetter,
      };
    } else {
      snapshotRef.current = {
        key: currentQuestionKey,
        question: activeQuestion,
        options: parsedOptions,
        chosenLetter,
      };
    }
  }, [
    currentQuestionKey,
    activeQuestion,
    parsedOptions,
    submittedQuestionKey,
    submittedChoiceLetter,
    quizState.answers,
    identity?.playerId,
  ]);

  useEffect(() => {
    const previousKey = prevQuestionKeyRef.current;
    if (
      previousKey &&
      previousKey !== currentQuestionKey &&
      snapshotRef.current &&
      snapshotRef.current.key === previousKey
    ) {
      settleSnapshot(snapshotRef.current);
    }

    prevQuestionKeyRef.current = currentQuestionKey;
    clearHighlightTimer();
    setSubmittedQuestionKey(null);
    setSubmittedChoiceLetter(null);
    setHighlightedChoiceLetter(null);
    setRemainingSeconds(
      typeof quizState.durationSeconds === "number" &&
        quizState.durationSeconds > 0
        ? quizState.durationSeconds
        : DEFAULT_QUESTION_DURATION_SECONDS
    );
    setStatusMessage("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGameId, currentQuestionKey]);

  useEffect(() => {
    if (
      activeQuestionIndex === null ||
      roundStatus !== "playing" ||
      quizState.revealed
    ) {
      return;
    }

    const updateTimer = () => {
      setRemainingSeconds(computeRemainingSeconds(quizState, Date.now()));
    };

    updateTimer();
    const intervalId = window.setInterval(updateTimer, 200);
    return () => window.clearInterval(intervalId);
  }, [
    activeQuestionIndex,
    roundStatus,
    quizState.revealed,
    quizState.questionStartedAt,
    quizState.durationSeconds,
    quizState.isPaused,
    quizState.pausedRemainingSeconds,
    quizState,
  ]);

  const alreadySubmittedThisQuestion =
    currentQuestionKey !== null &&
    submittedQuestionKey === currentQuestionKey;
  const isTimerExpired =
    activeQuestionIndex !== null &&
    roundStatus === "playing" &&
    (remainingSeconds <= 0 || Boolean(quizState.revealed));
  const isPlaying = roundStatus === "playing" && !isTimerExpired;

  useEffect(() => {
    if (!isTimerExpired || !snapshotRef.current) return;
    settleSnapshot(snapshotRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTimerExpired, identity?.playerId, currentQuestionKey]);

  useEffect(() => {
    if (!supabase || !sessionCode) return;

    let isMounted = true;
    let childrenChannel: ReturnType<typeof supabase.channel> | null = null;

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
        try {
          const saved = localStorage.getItem(`player_identity_${sessionCode}`);
          const parsed = saved
            ? (JSON.parse(saved) as Partial<PlayerIdentity>)
            : null;
          if (parsed?.playerId) {
            const match = rows.find((r) => r.player_id === parsed.playerId);
            if (match) {
              const dbScore = extractScoreValue(match);
              const syncedScore = Math.max(currentScoreRef.current, dbScore);
              currentScoreRef.current = syncedScore;
              setLocalScore(syncedScore);
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
        if (scoresData) setScores(scoresData as PlayerScore[]);
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
    if (!identity || alreadySubmittedThisQuestion || !isPlaying) return;

    const round = (activeQuestionIndex ?? 0) + 1;
    const chosenLetter = choice.letter;

    if (currentQuestionKey && activeQuestion) {
      snapshotRef.current = {
        key: currentQuestionKey,
        question: activeQuestion,
        options: parsedOptions,
        chosenLetter,
      };
    }

    if (supabase && session?.id) {
      const currentAnswers =
        quizState.answers && typeof quizState.answers === "object"
          ? { ...quizState.answers }
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

      setSession((prev) =>
        prev ? { ...prev, game_state: nextGameState } : prev
      );
    }

    clearHighlightTimer();
    setSubmittedQuestionKey(currentQuestionKey);
    setSubmittedChoiceLetter(chosenLetter);
    setHighlightedChoiceLetter(chosenLetter);
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedChoiceLetter(null);
      highlightTimeoutRef.current = null;
    }, 1000);

    setStatusMessage(`Choix ${chosenLetter} enregistré (points à la fin du chrono)`);
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
              ) : (
                <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-4 min-h-[300px]">
                  {qcmChoices.map((choice) => {
                    const isHighlighted =
                      highlightedChoiceLetter === choice.letter;
                    return (
                      <button
                        key={choice.letter}
                        type="button"
                        disabled={alreadySubmittedThisQuestion || isTimerExpired}
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
