"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Clock, Crown, Target, Trophy, Tv } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getUniquePlayerColor } from "@/lib/colorsplayer";
import {
  JUSTE_CHIFFRE_QUESTIONS,
  type JusteChiffreQuestion,
} from "@/lib/juste-chiffre-questions";
import type { GameSession, PlayerScore, SessionPlayer } from "@/types/game.types";

const MIN_VALUE = 1;
const MAX_VALUE = 1000;
const FULL_SCALE_BAR_MS = 4000;
const POST_ZERO_FADE_MS = 550;
const POST_FADE_DELAY_MS = 2000;
const DEFAULT_DURATION_SECONDS = 20;
const QUESTIONS_PER_GAME = 15;
const REVEAL_DELAY_AFTER_BARS_MS = 900;
const RETRACT_DELAY_MS = 3200;

interface JusteChiffreStatePayload {
  mode?: string;
  minValue?: number;
  maxValue?: number;
  questions?: JusteChiffreQuestion[];
  currentQuestion?: JusteChiffreQuestion | null;
  targetNumber?: number | null;
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
  durationSeconds?: number;
  duration_seconds?: number;
  isPaused?: boolean;
  pausedRemainingSeconds?: number | null;
  seriesNumber?: number;
  seriesSeed?: string;
  nextSessionCode?: string;
  replacedByCode?: string;
  estimates?: Record<string, unknown>;
  guesses?: Record<string, unknown>;
  answers?: Record<string, unknown>;
  revealed?: boolean;
}

type ExtendedSession = GameSession & {
  game_state?: JusteChiffreStatePayload | null;
};

type ExtendedPlayer = SessionPlayer & {
  avatar_id?: string | null;
};

function toFiniteNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseEstimate(raw: unknown): number | null {
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
  const num = toFiniteNumber(candidate);
  if (num === null) return null;
  const rounded = Math.round(num);
  if (rounded < MIN_VALUE || rounded > MAX_VALUE) return null;
  return rounded;
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
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
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

function pickSeriesQuestions(
  source: JusteChiffreQuestion[],
  count: number,
  seedKey: string
): JusteChiffreQuestion[] {
  if (!Array.isArray(source) || source.length === 0) return [];
  return shuffleWithSeed(source, seedKey).slice(
    0,
    Math.min(count, source.length)
  );
}

export default function TvJusteChiffrePage() {
  const params = useParams<{ sessionCode: string }>();
  const router = useRouter();
  const sessionCode = (params?.sessionCode ?? "").toUpperCase();
  const supabase = getSupabaseBrowserClient();

  const [session, setSession] = useState<ExtendedSession | null>(null);
  const [players, setPlayers] = useState<ExtendedPlayer[]>([]);
  const [scoresRows, setScoresRows] = useState<PlayerScore[]>([]);
  const gameTitle = "Le Juste Chiffre";

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [localStartMs, setLocalStartMs] = useState<number | null>(null);
  const [frozenRemaining, setFrozenRemaining] = useState<number | null>(null);

  // États de la carte centrale de question + séquence après chrono à 0
  const [showCenterCard, setShowCenterCard] = useState<boolean>(false);
  const [isQuestionFadingOut, setIsQuestionFadingOut] = useState<boolean>(false);
  const [canStartRevealSequence, setCanStartRevealSequence] =
    useState<boolean>(false);

  // États d'animation des barres et des compteurs figés
  const [barsExpanded, setBarsExpanded] = useState<boolean>(false);
  const [displayCounters, setDisplayCounters] = useState<
    Record<string, number>
  >({});
  const [frozenCounters, setFrozenCounters] = useState<Record<string, number>>(
    {}
  );
  const [phase, setPhase] = useState<
    "idle" | "playing" | "revealed" | "retracting"
  >("idle");

  const scoredRoundsRef = useRef<Set<string>>(new Set());
  const isScoringRef = useRef<boolean>(false);
  const lastRoundKeyRef = useRef<string>("");
  const zeroReachedAtRef = useRef<number | null>(null);
  const countersRef = useRef<Record<string, number>>({});
  const countersFrozenRef = useRef<boolean>(false);

  // --- Synchronisation temps réel Supabase ---
  useEffect(() => {
    if (!supabase || !sessionCode) return;

    let isMounted = true;
    let activeSessionId: string | null = null;
    let childrenChannel: ReturnType<typeof supabase.channel> | null = null;

    const loadPlayersAndScores = async (targetSessionId: string | null) => {
      if (!targetSessionId) return;
      const [{ data: pData }, { data: sData }] = await Promise.all([
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
      setPlayers((pData as ExtendedPlayer[] | null) ?? []);
      setScoresRows((sData as PlayerScore[] | null) ?? []);
    };

    const refreshSession = async () => {
      const { data } = await supabase
        .from("game_sessions")
        .select("*")
        .eq("code", sessionCode)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<ExtendedSession>();

      if (!isMounted || !data) return;
      setSession((prev) => {
        if (
          prev &&
          prev.id === data.id &&
          prev.status === data.status &&
          prev.updated_at === data.updated_at &&
          JSON.stringify(prev.game_state ?? null) ===
            JSON.stringify(data.game_state ?? null)
        ) {
          return prev;
        }
        return data;
      });
      if (data.id) {
        activeSessionId = data.id;
        void loadPlayersAndScores(data.id);
      }
    };

    const bindChildren = (target: ExtendedSession) => {
      void loadPlayersAndScores(target.id);
      if (!target.id || (activeSessionId === target.id && childrenChannel)) {
        return;
      }
      activeSessionId = target.id;
      if (childrenChannel) {
        void supabase.removeChannel(childrenChannel);
      }
      childrenChannel = supabase
        .channel(`tv-jc-children-${target.id}-${Date.now()}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "session_players",
            filter: `session_id=eq.${target.id}`,
          },
          () => {
            if (isMounted) {
              void loadPlayersAndScores(target.id);
              void refreshSession();
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "player_scores",
            filter: `session_id=eq.${target.id}`,
          },
          () => {
            if (isMounted) void loadPlayersAndScores(target.id);
          }
        )
        .subscribe();
    };

    void (async () => {
      const { data } = await supabase
        .from("game_sessions")
        .select("*")
        .eq("code", sessionCode)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<ExtendedSession>();
      if (isMounted && data) {
        setSession(data);
        bindChildren(data);
      }
    })();

    const sessionChannel = supabase
      .channel(`tv-jc-session-${sessionCode}-${Date.now()}`)
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
            void refreshSession();
            return;
          }
          setSession(nextRow);
          bindChildren(nextRow);
        }
      )
      .subscribe();

    const interval = window.setInterval(() => {
      if (!isMounted) return;
      void refreshSession();
      if (activeSessionId) void loadPlayersAndScores(activeSessionId);
    }, 1500);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
      void supabase.removeChannel(sessionChannel);
      if (childrenChannel) void supabase.removeChannel(childrenChannel);
    };
  }, [supabase, sessionCode]);

  const statePayload = useMemo<JusteChiffreStatePayload>(
    () => session?.game_state ?? {},
    [session]
  );

  const statusLower = String(session?.status ?? "").toLowerCase();
  const isLobbyOrFinished =
    statusLower === "lobby" ||
    statusLower === "finished" ||
    statusLower === "ended" ||
    statusLower === "completed";

  useEffect(() => {
    if (!session || !sessionCode) return;
    const replacement = (
      statePayload.nextSessionCode ||
      statePayload.replacedByCode ||
      ""
    )
      .trim()
      .toUpperCase();
    if (replacement && replacement !== sessionCode) {
      router.replace(`/tv/${replacement}/juste-chiffre`);
      return;
    }
    if (isLobbyOrFinished) {
      router.replace(`/tv/${sessionCode}`);
    }
  }, [session, sessionCode, statePayload, isLobbyOrFinished, router]);

  const seriesNumber = Math.max(
    1,
    toFiniteNumber(statePayload.seriesNumber) ?? 1
  );
  const seriesSeed =
    typeof statePayload.seriesSeed === "string" && statePayload.seriesSeed.trim()
      ? statePayload.seriesSeed.trim()
      : `${session?.id ?? ""}-${sessionCode}-jc-${seriesNumber}`;

  const questions = useMemo<JusteChiffreQuestion[]>(() => {
    if (
      Array.isArray(statePayload.questions) &&
      statePayload.questions.length > 0
    ) {
      return statePayload.questions;
    }
    return pickSeriesQuestions(
      JUSTE_CHIFFRE_QUESTIONS,
      QUESTIONS_PER_GAME,
      seriesSeed
    );
  }, [statePayload.questions, seriesSeed]);

  const activeQuestionIndex = useMemo<number | null>(() => {
    const rawIdx =
      statePayload.questionIndex ??
      statePayload.question_index ??
      statePayload.currentQuestionIndex ??
      statePayload.current_question_index;
    const startedFlag = Boolean(
      statePayload.questionStarted ||
        statePayload.question_started ||
        statePayload.roundTriggered ||
        statePayload.round_triggered
    );
    if (typeof rawIdx === "number" && Number.isFinite(rawIdx)) {
      if (rawIdx < 0) return null;
      return Math.floor(rawIdx);
    }
    return startedFlag ? 0 : null;
  }, [statePayload]);

  const currentQuestion = useMemo<JusteChiffreQuestion | null>(() => {
    if (activeQuestionIndex === null) return null;
    if (statePayload.currentQuestion) return statePayload.currentQuestion;
    if (questions.length > 0) {
      return (
        questions[Math.min(activeQuestionIndex, questions.length - 1)] ?? null
      );
    }
    return null;
  }, [activeQuestionIndex, statePayload.currentQuestion, questions]);

  const targetNumber = useMemo<number | null>(() => {
    const fromPayload = toFiniteNumber(statePayload.targetNumber);
    if (fromPayload !== null) return Math.round(fromPayload);
    if (currentQuestion && typeof currentQuestion.answer === "number") {
      return Math.round(currentQuestion.answer);
    }
    return null;
  }, [statePayload.targetNumber, currentQuestion]);

  const isPaused = statusLower === "paused" || Boolean(statePayload.isPaused);

  const durationSeconds = Math.max(
    1,
    Math.round(
      toFiniteNumber(statePayload.durationSeconds) ??
        toFiniteNumber(statePayload.duration_seconds) ??
        DEFAULT_DURATION_SECONDS
    )
  );

  const remoteStartMs =
    parseTimestampMs(statePayload.questionStartedAt) ??
    parseTimestampMs(statePayload.question_started_at);

  // Réinitialisation complète à chaque nouvelle question
  useEffect(() => {
    if (activeQuestionIndex === null || !currentQuestion) {
      setLocalStartMs(null);
      setFrozenRemaining(null);
      setShowCenterCard(false);
      setIsQuestionFadingOut(false);
      setCanStartRevealSequence(false);
      setPhase("idle");
      setBarsExpanded(false);
      setDisplayCounters({});
      setFrozenCounters({});
      countersRef.current = {};
      countersFrozenRef.current = false;
      zeroReachedAtRef.current = null;
      lastRoundKeyRef.current = "";
      return;
    }

    const roundKey = `${session?.id ?? ""}-s${seriesNumber}-${seriesSeed}-q${activeQuestionIndex}-${remoteStartMs ?? ""}`;
    if (lastRoundKeyRef.current === roundKey) return;
    lastRoundKeyRef.current = roundKey;

    const start = remoteStartMs ?? Date.now();
    setLocalStartMs(start);
    setFrozenRemaining(null);
    setNowMs(Date.now());
    setShowCenterCard(true);
    setIsQuestionFadingOut(false);
    setCanStartRevealSequence(false);
    setPhase("playing");
    setBarsExpanded(false);
    setDisplayCounters({});
    setFrozenCounters({});
    countersRef.current = {};
    countersFrozenRef.current = false;
    zeroReachedAtRef.current = null;
  }, [
    activeQuestionIndex,
    currentQuestion,
    remoteStartMs,
    session?.id,
    seriesNumber,
    seriesSeed,
  ]);

  useEffect(() => {
    if (!isPaused || activeQuestionIndex === null) {
      if (!isPaused) setFrozenRemaining(null);
      return;
    }
    const fromPayload = toFiniteNumber(statePayload.pausedRemainingSeconds);
    if (fromPayload !== null) {
      setFrozenRemaining(Math.max(0, Math.ceil(fromPayload)));
      return;
    }
    setFrozenRemaining((prev) => {
      if (prev !== null) return prev;
      const effStart = remoteStartMs ?? localStartMs ?? nowMs;
      return Math.max(
        0,
        Math.ceil(durationSeconds - Math.max(0, (nowMs - effStart) / 1000))
      );
    });
  }, [
    isPaused,
    activeQuestionIndex,
    statePayload.pausedRemainingSeconds,
    remoteStartMs,
    localStartMs,
    nowMs,
    durationSeconds,
  ]);

  useEffect(() => {
    if (activeQuestionIndex === null || !currentQuestion || isPaused) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [activeQuestionIndex, currentQuestion, isPaused]);

  const remainingSeconds = useMemo<number | null>(() => {
    if (activeQuestionIndex === null || !currentQuestion) return null;
    if (isPaused && frozenRemaining !== null) return frozenRemaining;
    const effStart = remoteStartMs ?? localStartMs ?? nowMs;
    const elapsed = Math.max(0, (nowMs - effStart) / 1000);
    return Math.max(0, Math.ceil(durationSeconds - elapsed));
  }, [
    activeQuestionIndex,
    currentQuestion,
    isPaused,
    frozenRemaining,
    remoteStartMs,
    localStartMs,
    nowMs,
    durationSeconds,
  ]);

  const isTimerZero =
    !isPaused &&
    activeQuestionIndex !== null &&
    currentQuestion !== null &&
    remainingSeconds !== null &&
    remainingSeconds <= 0;

  // Quand le chrono arrive à 0 : fondu de la question puis 2 secondes d'attente avant révélation
  useEffect(() => {
    if (activeQuestionIndex === null || !currentQuestion) return;

    if (!isTimerZero && !statePayload.revealed) {
      return;
    }

    if (zeroReachedAtRef.current === null) {
      zeroReachedAtRef.current = Date.now();
    }

    setIsQuestionFadingOut(true);

    const hideCardTimer = window.setTimeout(() => {
      setShowCenterCard(false);
    }, POST_ZERO_FADE_MS);

    const revealWaitTimer = window.setTimeout(() => {
      setCanStartRevealSequence(true);
    }, POST_ZERO_FADE_MS + POST_FADE_DELAY_MS);

    return () => {
      window.clearTimeout(hideCardTimer);
      window.clearTimeout(revealWaitTimer);
    };
  }, [
    activeQuestionIndex,
    currentQuestion,
    isTimerZero,
    statePayload.revealed,
  ]);

  const shouldReveal = canStartRevealSequence;

  // Estimations des joueurs
  const estimatesByPlayerId = useMemo<Record<string, number>>(() => {
    const rawMap =
      statePayload.estimates ?? statePayload.guesses ?? statePayload.answers ?? {};
    const result: Record<string, number> = {};
    for (const [pid, val] of Object.entries(rawMap)) {
      const parsed = parseEstimate(val);
      if (parsed !== null) {
        result[String(pid)] = parsed;
      }
    }
    return result;
  }, [statePayload.estimates, statePayload.guesses, statePayload.answers]);

  // Classement et calcul du / des vainqueur(s) (le plus proche de targetNumber)
  const rankedPlayers = useMemo(() => {
    const scoreById = new Map<string, number>();
    for (const row of scoresRows) {
      const rec = row as unknown as {
        player_id?: string | null;
        total_score?: number | null;
        score?: number | null;
      };
      if (rec.player_id) {
        scoreById.set(String(rec.player_id), rec.total_score ?? rec.score ?? 0);
      }
    }

    const withMeta = players.map((player) => {
      const idStr = String(player.id);
      const guess = estimatesByPlayerId[idStr] ?? null;
      const diff =
        guess !== null && targetNumber !== null
          ? Math.abs(guess - targetNumber)
          : null;
      const isExact =
        guess !== null && targetNumber !== null && guess === targetNumber;
      return {
        player,
        score: scoreById.get(idStr) ?? 0,
        guess,
        diff,
        isExact,
      };
    });

    const validDiffs = withMeta
      .map((item) => item.diff)
      .filter((d): d is number => d !== null);
    const minDiff = validDiffs.length > 0 ? Math.min(...validDiffs) : null;

    return withMeta
      .map((item) => ({
        ...item,
        isWinner:
          shouldReveal &&
          minDiff !== null &&
          item.diff !== null &&
          item.diff === minDiff,
      }))
      .sort((a, b) => b.score - a.score);
  }, [players, scoresRows, estimatesByPlayerId, targetNumber, shouldReveal]);

  // Déploiement des barres (4s pour 0 -> 1000) + compteur qui fige dès l'ondulation / cassure
  useEffect(() => {
    if (!shouldReveal || activeQuestionIndex === null || !currentQuestion) {
      return;
    }

    countersFrozenRef.current = false;
    setFrozenCounters({});
    setBarsExpanded(true);

    const maxGuess = Math.max(
      1,
      ...players.map((p) => estimatesByPlayerId[String(p.id)] ?? 0)
    );
    const animDurationMs = Math.max(
      400,
      Math.round((maxGuess / MAX_VALUE) * FULL_SCALE_BAR_MS)
    );
    const animStart = performance.now();
    let rafId = 0;

    const freezeNow = () => {
      if (countersFrozenRef.current) return;
      countersFrozenRef.current = true;
      const snapshot: Record<string, number> = {};
      for (const player of players) {
        const idStr = String(player.id);
        const guess = estimatesByPlayerId[idStr];
        if (guess !== undefined) {
          snapshot[idStr] = countersRef.current[idStr] ?? guess;
        }
      }
      setFrozenCounters(snapshot);
    };

    const tickCounter = (now: number) => {
      if (countersFrozenRef.current) return;
      const progress = Math.min(1, (now - animStart) / animDurationMs);
      const eased = 1 - Math.pow(1 - progress, 3);

      const nextCounters: Record<string, number> = {};
      for (const player of players) {
        const idStr = String(player.id);
        const guess = estimatesByPlayerId[idStr];
        if (guess !== undefined) {
          nextCounters[idStr] = Math.round(guess * eased);
        }
      }
      countersRef.current = nextCounters;
      setDisplayCounters(nextCounters);

      if (progress < 1) {
        rafId = window.requestAnimationFrame(tickCounter);
      } else {
        freezeNow();
      }
    };

    rafId = window.requestAnimationFrame(tickCounter);

    const revealTimer = window.setTimeout(() => {
      freezeNow();
      setPhase("revealed");
    }, Math.max(animDurationMs, REVEAL_DELAY_AFTER_BARS_MS));

    const retractTimer = window.setTimeout(() => {
      freezeNow();
      setPhase("retracting");
      setBarsExpanded(false);
    }, Math.max(animDurationMs, REVEAL_DELAY_AFTER_BARS_MS) + RETRACT_DELAY_MS);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(revealTimer);
      window.clearTimeout(retractTimer);
    };
  }, [
    shouldReveal,
    activeQuestionIndex,
    currentQuestion,
    players,
    estimatesByPlayerId,
  ]);

  // Attribution des points (+5 si exact, +3 pour le plus proche)
  useEffect(() => {
    if (
      !supabase ||
      !session?.id ||
      !shouldReveal ||
      activeQuestionIndex === null ||
      targetNumber === null
    ) {
      return;
    }

    const roundKey = `${session.id}-jc-s${seriesNumber}-${seriesSeed}-q${activeQuestionIndex}`;
    if (scoredRoundsRef.current.has(roundKey) || isScoringRef.current) return;

    isScoringRef.current = true;
    scoredRoundsRef.current.add(roundKey);

    void (async () => {
      try {
        const winners = rankedPlayers.filter(
          (r) => r.isWinner && r.guess !== null
        );
        if (winners.length === 0) return;

        const currentMap = new Map<string, number>();
        for (const row of scoresRows) {
          const rec = row as unknown as {
            player_id?: string | null;
            total_score?: number | null;
            score?: number | null;
          };
          if (rec.player_id) {
            currentMap.set(
              String(rec.player_id),
              rec.total_score ?? rec.score ?? 0
            );
          }
        }

        for (const w of winners) {
          const pid = String(w.player.id);
          const pts = w.isExact ? 5 : 3;
          const nextScore = (currentMap.get(pid) ?? 0) + pts;

          await supabase.from("player_scores").upsert(
            {
              session_id: session.id,
              player_id: pid,
              nickname: w.player.nickname,
              avatar_id: w.player.avatar_id ?? "gamepad",
              total_score: nextScore,
            },
            { onConflict: "session_id,player_id" }
          );
        }

        const { data: refreshed } = await supabase
          .from("player_scores")
          .select("*")
          .eq("session_id", session.id);
        if (refreshed) {
          setScoresRows(refreshed as PlayerScore[]);
        }
      } finally {
        isScoringRef.current = false;
      }
    })();
  }, [
    supabase,
    session?.id,
    shouldReveal,
    activeQuestionIndex,
    targetNumber,
    seriesNumber,
    seriesSeed,
    rankedPlayers,
    scoresRows,
  ]);

  const targetPercent =
    targetNumber !== null
      ? Math.max(0, Math.min(100, (targetNumber / MAX_VALUE) * 100))
      : null;

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-neutral-950 text-white px-6 py-4 flex flex-col justify-between select-none">
      <style jsx>{`
        @keyframes winnerWave {
          0%,
          100% {
            transform: translateY(0px) scaleY(1);
            filter: brightness(1);
          }
          25% {
            transform: translateY(-4px) scaleY(1.08);
            filter: brightness(1.18);
          }
          50% {
            transform: translateY(2px) scaleY(0.95);
            filter: brightness(1.08);
          }
          75% {
            transform: translateY(-3px) scaleY(1.06);
            filter: brightness(1.15);
          }
        }

        @keyframes loserCrack {
          0% {
            transform: translateX(0) rotate(0deg);
            opacity: 1;
          }
          25% {
            transform: translateX(-5px) rotate(-1.5deg);
          }
          50% {
            transform: translateX(5px) rotate(1.5deg);
          }
          100% {
            transform: translateY(10px) rotate(-3deg);
            opacity: 0.25;
          }
        }

        .winner-bar-wave {
          animation: winnerWave 0.75s ease-in-out infinite;
        }

        .loser-bar-crack {
          animation: loserCrack 0.65s ease-out forwards;
        }
      `}</style>

      {/* ================= EN-TÊTE ================= */}
      <header className="flex items-center justify-between border-b border-white/15 pb-3 shrink-0 gap-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-13 h-13 rounded-2xl bg-amber-400/15 border border-amber-400/35 flex items-center justify-center shrink-0 p-2.5">
            <Tv className="w-7 h-7 text-amber-400" />
          </div>
          <div className="min-w-0">
            {activeQuestionIndex !== null && questions.length > 0 && (
              <div className="text-sm xl:text-base uppercase tracking-[0.18em] text-amber-300 font-extrabold">
                Question{" "}
                {Math.min(activeQuestionIndex, questions.length - 1) + 1} /{" "}
                {questions.length} • 1 à 1000
              </div>
            )}
            <h1 className="text-2xl xl:text-4xl font-black tracking-tight truncate">
              {gameTitle}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {shouldReveal && targetNumber !== null && (
            <div className="flex items-center gap-2.5 px-5 py-2 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400 text-emerald-200 font-mono text-2xl xl:text-3xl font-black">
              <Target className="w-7 h-7 text-emerald-300" />
              <span>
                Cible : {targetNumber}
                {currentQuestion?.unit ? ` ${currentQuestion.unit}` : ""}
              </span>
            </div>
          )}

          {remainingSeconds !== null && !shouldReveal && (
            <div
              className={`flex items-center gap-2.5 px-5 py-2 rounded-2xl border-2 font-mono text-2xl xl:text-3xl font-black ${
                isPaused
                  ? "bg-amber-500/20 border-amber-400/60 text-amber-200"
                  : remainingSeconds <= 4
                  ? "bg-rose-500/25 border-rose-400 text-rose-200 animate-pulse"
                  : "bg-sky-500/15 border-sky-400/45 text-sky-200"
              }`}
            >
              <Clock className="w-6 h-6 shrink-0" />
              <span>{remainingSeconds}s</span>
            </div>
          )}

          <div className="px-5 py-2 rounded-2xl bg-amber-400/15 border-2 border-amber-400/45 text-amber-300 font-mono text-2xl xl:text-3xl font-black tracking-[0.2em]">
            {sessionCode || "----"}
          </div>
        </div>
      </header>

      {/* ================= ZONE PRINCIPALE : CLASSEMENT COMPACT À GAUCHE + JAUGES 1-1000 À DROITE ================= */}
      <main className="flex-1 min-h-0 flex items-stretch gap-0 mt-3 overflow-hidden">
        {/* CLASSEMENT COMPACT À GAUCHE (PSEUDO + SCORE UNIQUEMENT) */}
        <aside className="w-[220px] xl:w-[250px] shrink-0 bg-white/[0.05] border border-white/15 rounded-l-3xl p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 pb-1.5 border-b border-white/10 shrink-0">
            <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
            <span className="text-lg xl:text-xl font-black truncate">
              Classement
            </span>
          </div>

          <div className="flex-1 min-h-0 flex flex-col justify-center gap-1.5">
            {rankedPlayers.map(({ player, score, isWinner }) => {
              const pColor = getUniquePlayerColor(player.id, players);

              return (
                <div
                  key={player.id}
                  style={{
                    backgroundColor: pColor.bgHex,
                    borderColor: isWinner ? "#FDE047" : pColor.borderHex,
                    color: pColor.textHex,
                  }}
                  className={`h-12 rounded-xl border-2 px-3 flex items-center justify-between gap-2 shadow-md transition ${
                    isWinner ? "ring-4 ring-amber-300" : ""
                  }`}
                >
                  <span className="font-black text-base xl:text-lg truncate flex items-center gap-1 min-w-0">
                    {isWinner && (
                      <Crown className="w-4 h-4 text-amber-300 shrink-0" />
                    )}
                    <span className="truncate">{player.nickname}</span>
                  </span>

                  <span className="font-mono font-black text-base xl:text-lg shrink-0">
                    {score}
                  </span>
                </div>
              );
            })}
          </div>
        </aside>

        {/* PISTE DES JAUGES (1 À 1000) SUR TOUT L'ESPACE DROIT */}
        <section className="relative flex-1 min-w-0 bg-white/[0.03] border-y border-r border-white/15 rounded-r-3xl flex flex-col justify-between py-3 px-5">
          {/* Repères d'échelle 1 / 500 / 1000 lisibles depuis le canapé */}
          <div className="relative h-9 shrink-0 font-mono font-black text-2xl xl:text-3xl border-b border-white/15">
            <span className="absolute left-0 top-0 text-white">1</span>
            <span className="absolute left-1/2 -translate-x-1/2 top-0 text-amber-300">
              500
            </span>
            <span className="absolute right-0 top-0 text-white">1000</span>
          </div>

          {/* Ligne verticale milieu (500) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-12 bottom-3 left-1/2 border-l-2 border-dashed border-white/25 z-0"
          />

          {/* Ligne cible révélée */}
          {shouldReveal && targetPercent !== null && (
            <div
              style={{ left: `${targetPercent}%` }}
              className="pointer-events-none absolute top-11 bottom-3 z-30 -translate-x-1/2 flex flex-col items-center"
            >
              <div className="px-3 py-0.5 rounded-lg bg-emerald-400 text-black font-mono text-lg xl:text-xl font-black shadow-lg">
                {targetNumber}
              </div>
              <div className="w-1.5 flex-1 bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.95)]" />
            </div>
          )}

          {/* Pastilles & barres centrées verticalement avec peu d'espace entre elles */}
          <div className="relative z-10 flex-1 min-h-0 flex flex-col justify-center gap-1.5">
            {rankedPlayers.map(({ player, guess, isWinner }) => {
              const idStr = String(player.id);
              const pColor = getUniquePlayerColor(player.id, players);
              const widthPercent =
                barsExpanded && guess !== null
                  ? Math.max(2, Math.min(100, (guess / MAX_VALUE) * 100))
                  : 0;
              const barDurationMs =
                guess !== null
                  ? Math.max(
                      400,
                      Math.round((guess / MAX_VALUE) * FULL_SCALE_BAR_MS)
                    )
                  : FULL_SCALE_BAR_MS;

              const isBarAnimatingNow =
                (phase === "revealed" || phase === "retracting") &&
                guess !== null;

              const counterValue =
                isBarAnimatingNow || countersFrozenRef.current
                  ? frozenCounters[idStr] ??
                    countersRef.current[idStr] ??
                    guess ??
                    0
                  : displayCounters[idStr] ?? 0;

              const isLoser = isBarAnimatingNow && !isWinner;

              const transitionStyle =
                phase === "retracting"
                  ? "width 900ms cubic-bezier(0.22, 1, 0.36, 1)"
                  : `width ${barDurationMs}ms cubic-bezier(0.16, 1, 0.3, 1)`;

              return (
                <div
                  key={player.id}
                  className="relative h-12 flex items-center"
                >
                  {/* Barre colorée partant du bord gauche */}
                  <div
                    style={{
                      width: `${widthPercent}%`,
                      backgroundColor: pColor.bgHex,
                      borderColor: isWinner ? "#FDE047" : pColor.borderHex,
                      transition: transitionStyle,
                    }}
                    className={`h-10 rounded-r-2xl border-2 shadow-lg flex items-center justify-end pr-3 overflow-visible ${
                      isWinner && phase === "revealed"
                        ? "winner-bar-wave"
                        : isLoser
                        ? "loser-bar-crack"
                        : ""
                    }`}
                  >
                    {/* Chiffre grand et lisible qui monte avec la barre et se fige dès l'ondulation / cassure */}
                    {barsExpanded && guess !== null && (
                      <span
                        className={`ml-2 px-2.5 py-0.5 rounded-lg font-mono text-xl xl:text-2xl font-black leading-none shadow-md shrink-0 ${
                          isWinner
                            ? "bg-amber-300 text-black"
                            : "bg-neutral-900/95 text-white border border-white/25"
                        }`}
                      >
                        {counterValue}
                      </span>
                    )}

                    {/* Trait de fissure visuel pour les perdants */}
                    {isLoser && (
                      <span className="w-1 h-full bg-black/80 rotate-12 ml-1 shrink-0" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* ================= CARTE CENTRALE DE QUESTION (APPARAÎT AU LANCEMENT, DISPARAÎT EN FONDU À 0s) ================= */}
      {showCenterCard && currentQuestion?.question && (
        <div
          aria-live="polite"
          style={{
            transition: `opacity ${POST_ZERO_FADE_MS}ms ease-out, transform ${POST_ZERO_FADE_MS}ms ease-out`,
          }}
          className={`pointer-events-none fixed inset-0 z-40 flex items-center justify-center px-8 ${
            isQuestionFadingOut
              ? "opacity-0 scale-95"
              : "opacity-100 scale-100"
          }`}
        >
          <div className="max-w-4xl w-full rounded-[2rem] bg-neutral-900/95 border-2 border-amber-400/60 px-10 py-8 shadow-2xl text-center backdrop-blur-md">
            <div className="text-sm uppercase tracking-[0.22em] text-amber-300 font-extrabold mb-3">
              Question{" "}
              {activeQuestionIndex !== null && questions.length > 0
                ? `${Math.min(activeQuestionIndex, questions.length - 1) + 1} / ${questions.length}`
                : ""}
            </div>
            <h2 className="text-3xl xl:text-5xl font-black text-white leading-tight">
              {currentQuestion.question}
            </h2>
          </div>
        </div>
      )}
    </div>
  );
}
