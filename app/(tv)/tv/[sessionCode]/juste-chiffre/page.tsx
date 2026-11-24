"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Clock,
  Crown,
  Gamepad2,
  PauseCircle,
  Sparkles,
  Target,
  Trophy,
  Tv,
  Users,
} from "lucide-react";
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
  finished?: boolean;
}

type ExtendedSession = GameSession & {
  game_state?: JusteChiffreStatePayload | null;
};

type ExtendedPlayer = SessionPlayer & {
  avatar_id?: string | null;
};

interface Particle {
  type: "spark" | "confetti" | "smoke";
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  alpha: number;
  size: number;
  w?: number;
  h?: number;
  angle?: number;
  spin?: number;
  grow?: number;
  color?: string;
}

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

  // Question affichée en haut dès le clic sur "question suivante",
  // puis disparaît en fondu à 0s avant le délai de 2s puis révélation
  const [showTopQuestion, setShowTopQuestion] = useState<boolean>(false);
  const [isQuestionFadingOut, setIsQuestionFadingOut] = useState<boolean>(false);
  const [canStartRevealSequence, setCanStartRevealSequence] =
    useState<boolean>(false);

  // États d'animation des barres, ligne cible, compteurs et effets (1, 6, 4, 2+15, 12, 8)
  const [barsExpanded, setBarsExpanded] = useState<boolean>(false);
  const [targetLineExpanded, setTargetLineExpanded] = useState<boolean>(false);
  const [displayCounters, setDisplayCounters] = useState<
    Record<string, number>
  >({});
  const [phase, setPhase] = useState<"idle" | "playing" | "revealed">("idle");
  const [roundPointsByPlayer, setRoundPointsByPlayer] = useState<
    Record<string, number>
  >({});
  const [launchFlyBadges, setLaunchFlyBadges] = useState<boolean>(false);
  const [laserImpactFlash, setLaserImpactFlash] = useState<boolean>(false);
  const [screenShake, setScreenShake] = useState<boolean>(false);

  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const barRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const targetTrackRef = useRef<HTMLDivElement | null>(null);

  const scoredRoundsRef = useRef<Set<string>>(new Set());
  const isScoringRef = useRef<boolean>(false);
  const lastRoundKeyRef = useRef<string>("");
  const zeroSequenceStartedRef = useRef<boolean>(false);
  const revealAnimStartedRoundRef = useRef<string>("");
  const fxStartedRoundRef = useRef<string>("");

  // --- Moteur de particules (étincelles 2, fumée 12, confettis 8) ---
  useEffect(() => {
    const canvas = fxCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    handleResize();
    window.addEventListener("resize", handleResize);

    let rafId = 0;
    const renderLoop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particlesRef.current = particlesRef.current.filter(
        (p) => p.alpha > 0.015 && p.y < canvas.height + 60
      );

      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.type === "smoke") {
          p.size += p.grow ?? 0.35;
          p.alpha *= 0.965;
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = "#a1a1aa";
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.type === "confetti") {
          p.vy += p.gravity;
          p.angle = (p.angle ?? 0) + (p.spin ?? 0.1);
          if (p.y > canvas.height * 0.78) p.alpha *= 0.94;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color ?? "#fde047";
          ctx.fillRect(
            -(p.w ?? 8) / 2,
            -(p.h ?? 5) / 2,
            p.w ?? 8,
            p.h ?? 5
          );
          ctx.restore();
        } else {
          p.vy += p.gravity;
          p.alpha *= 0.96;
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color ?? "#fde047";
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      rafId = window.requestAnimationFrame(renderLoop);
    };

    rafId = window.requestAnimationFrame(renderLoop);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  const spawnSparks = (x: number, y: number, colors: string[], count = 36) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      particlesRef.current.push({
        type: "spark",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        gravity: 0.16,
        alpha: 1,
        size: 3 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)] ?? "#fde047",
      });
    }
  };

  const spawnSmoke = (x: number, y: number, count = 20) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        type: "smoke",
        x: x + (Math.random() - 0.5) * 140,
        y: y + (Math.random() - 0.5) * 18,
        vx: (Math.random() - 0.5) * 1.4,
        vy: -0.7 - Math.random() * 1.6,
        gravity: 0,
        alpha: 0.5,
        size: 9 + Math.random() * 14,
        grow: 0.35,
      });
    }
  };

  const spawnConfetti = (count = 110) => {
    const colors = [
      "#fde047",
      "#34d399",
      "#38bdf8",
      "#f472b6",
      "#a78bfa",
      "#fb923c",
    ];
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        type: "confetti",
        x: Math.random() * window.innerWidth,
        y: -20 - Math.random() * 140,
        vx: (Math.random() - 0.5) * 4,
        vy: 3 + Math.random() * 4.5,
        gravity: 0.06,
        alpha: 1,
        size: 5,
        w: 7 + Math.random() * 6,
        h: 4 + Math.random() * 4,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.22,
        color: colors[Math.floor(Math.random() * colors.length)] ?? "#fde047",
      });
    }
  };

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

  const isSeriesCompleted =
    Boolean(statePayload.finished) ||
    (activeQuestionIndex !== null &&
      questions.length > 0 &&
      activeQuestionIndex >= questions.length);

  const currentQuestion = useMemo<JusteChiffreQuestion | null>(() => {
    if (activeQuestionIndex === null || isSeriesCompleted) return null;
    if (statePayload.currentQuestion) return statePayload.currentQuestion;
    if (questions.length > 0) {
      return (
        questions[Math.min(activeQuestionIndex, questions.length - 1)] ?? null
      );
    }
    return null;
  }, [
    activeQuestionIndex,
    isSeriesCompleted,
    statePayload.currentQuestion,
    questions,
  ]);

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

  // À chaque clic sur "question suivante" :
  // - La question apparaît immédiatement en haut
  // - On réinitialise les barres, compteurs et effets de la manche précédente
  useEffect(() => {
    if (activeQuestionIndex === null || !currentQuestion) {
      setLocalStartMs(null);
      setFrozenRemaining(null);
      setShowTopQuestion(false);
      setIsQuestionFadingOut(false);
      setCanStartRevealSequence(false);
      setPhase("idle");
      setBarsExpanded(false);
      setTargetLineExpanded(false);
      setDisplayCounters({});
      setRoundPointsByPlayer({});
      setLaunchFlyBadges(false);
      setLaserImpactFlash(false);
      setScreenShake(false);
      zeroSequenceStartedRef.current = false;
      revealAnimStartedRoundRef.current = "";
      fxStartedRoundRef.current = "";
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
    setShowTopQuestion(true);
    setIsQuestionFadingOut(false);
    setCanStartRevealSequence(false);
    setPhase("playing");
    setBarsExpanded(false);
    setTargetLineExpanded(false);
    setDisplayCounters({});
    setRoundPointsByPlayer({});
    setLaunchFlyBadges(false);
    setLaserImpactFlash(false);
    setScreenShake(false);
    zeroSequenceStartedRef.current = false;
    revealAnimStartedRoundRef.current = "";
    fxStartedRoundRef.current = "";
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

  const isQuestionEnded = Boolean(isTimerZero || statePayload.revealed);

  // Dès que le chrono atteint 0 :
  // 1) Disparition en fondu de la question en haut (550 ms)
  // 2) Attente stricte de 2000 ms (2 secondes)
  // 3) Lancement de la révélation
  useEffect(() => {
    if (!isQuestionEnded || activeQuestionIndex === null) return;
    if (zeroSequenceStartedRef.current) return;
    zeroSequenceStartedRef.current = true;

    setIsQuestionFadingOut(true);

    const hideQuestionTimer = window.setTimeout(() => {
      setShowTopQuestion(false);
    }, POST_ZERO_FADE_MS);

    const revealWaitTimer = window.setTimeout(() => {
      setCanStartRevealSequence(true);
    }, POST_ZERO_FADE_MS + POST_FADE_DELAY_MS);

    return () => {
      window.clearTimeout(hideQuestionTimer);
      window.clearTimeout(revealWaitTimer);
    };
  }, [isQuestionEnded, activeQuestionIndex]);

  const shouldReveal = canStartRevealSequence;

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

  const answeredPlayersCount = useMemo(() => {
    return players.filter(
      (p) => estimatesByPlayerId[String(p.id)] !== undefined
    ).length;
  }, [players, estimatesByPlayerId]);

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

  const targetPercent =
    targetNumber !== null
      ? Math.max(0, Math.min(100, (targetNumber / MAX_VALUE) * 100))
      : null;

  const targetDurationMs =
    targetNumber !== null
      ? Math.max(
          400,
          Math.round((targetNumber / MAX_VALUE) * FULL_SCALE_BAR_MS)
        )
      : FULL_SCALE_BAR_MS;

  // Déploiement des barres + ligne cible + compteurs figés dès l'arrivée de chaque barre
  useEffect(() => {
    if (!shouldReveal || activeQuestionIndex === null || !currentQuestion) {
      return;
    }

    const animKey = `${session?.id ?? ""}-q${activeQuestionIndex}`;
    if (revealAnimStartedRoundRef.current === animKey) return;
    revealAnimStartedRoundRef.current = animKey;

    const snapshotGuesses: Record<string, number> = { ...estimatesByPlayerId };
    const playerIds = players.map((p) => String(p.id));

    const startFrameId = window.requestAnimationFrame(() => {
      setBarsExpanded(true);
      setTargetLineExpanded(true);
    });

    const flashTimer = window.setTimeout(() => {
      setLaserImpactFlash(true);
      if (targetTrackRef.current && targetPercent !== null) {
        const rect = targetTrackRef.current.getBoundingClientRect();
        const impactX = rect.left + (rect.width * targetPercent) / 100;
        const impactY = rect.top + rect.height / 2;
        spawnSparks(
          impactX,
          impactY,
          ["#34d399", "#a7f3d0", "#ffffff"],
          28
        );
      }
    }, targetDurationMs);

    const maxGuess = Math.max(
      1,
      ...Object.values(snapshotGuesses),
      targetNumber ?? 0
    );
    const maxAnimDurationMs = Math.max(
      400,
      Math.round((maxGuess / MAX_VALUE) * FULL_SCALE_BAR_MS)
    );
    const animStart = performance.now();
    let rafId = 0;
    let isCancelled = false;

    const tickCounter = (now: number) => {
      if (isCancelled) return;
      const elapsed = now - animStart;
      let anyStillRunning = false;
      const nextCounters: Record<string, number> = {};

      for (const idStr of playerIds) {
        const guess = snapshotGuesses[idStr];
        if (guess === undefined) continue;

        const ownDurationMs = Math.max(
          400,
          Math.round((guess / MAX_VALUE) * FULL_SCALE_BAR_MS)
        );
        const progress = Math.min(1, elapsed / ownDurationMs);

        if (progress >= 1) {
          nextCounters[idStr] = guess;
        } else {
          anyStillRunning = true;
          const eased = 1 - Math.pow(1 - progress, 3);
          nextCounters[idStr] = Math.round(guess * eased);
        }
      }

      setDisplayCounters(nextCounters);

      if (anyStillRunning) {
        rafId = window.requestAnimationFrame(tickCounter);
      }
    };

    rafId = window.requestAnimationFrame(tickCounter);

    const revealDelay = Math.max(maxAnimDurationMs, REVEAL_DELAY_AFTER_BARS_MS);

    const revealTimer = window.setTimeout(() => {
      if (isCancelled) return;
      setDisplayCounters(snapshotGuesses);
      setPhase("revealed");
    }, revealDelay);

    return () => {
      isCancelled = true;
      window.clearTimeout(flashTimer);
      window.cancelAnimationFrame(startFrameId);
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(revealTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldReveal, activeQuestionIndex]);

  // Effets de verdict (2: onde néon + étincelles, 15: badge volant, 12: fumée perdants, 8: confettis + secousse exact)
  useEffect(() => {
    if (phase !== "revealed" || activeQuestionIndex === null) return;
    const fxKey = `${session?.id ?? ""}-fx-q${activeQuestionIndex}`;
    if (fxStartedRoundRef.current === fxKey) return;
    fxStartedRoundRef.current = fxKey;

    const ptsMap: Record<string, number> = {};
    let hasExact = false;

    for (const item of rankedPlayers) {
      if (item.isWinner && item.guess !== null) {
        ptsMap[String(item.player.id)] = item.isExact ? 5 : 3;
        if (item.isExact) hasExact = true;

        const barEl = barRefs.current[String(item.player.id)];
        if (barEl) {
          const rect = barEl.getBoundingClientRect();
          spawnSparks(
            rect.right - 16,
            rect.top + rect.height / 2,
            ["#fde047", "#34d399", "#ffffff"],
            38
          );
        }
      } else if (item.guess !== null) {
        const barEl = barRefs.current[String(item.player.id)];
        if (barEl) {
          const rect = barEl.getBoundingClientRect();
          spawnSmoke(rect.left + rect.width * 0.5, rect.top + rect.height / 2, 16);
        }
      }
    }

    setRoundPointsByPlayer(ptsMap);
    setLaunchFlyBadges(true);

    if (hasExact) {
      spawnConfetti(110);
      setScreenShake(true);
      window.setTimeout(() => setScreenShake(false), 500);
    }

    const flyResetTimer = window.setTimeout(() => {
      setLaunchFlyBadges(false);
    }, 1300);

    return () => {
      window.clearTimeout(flyResetTimer);
    };
  }, [phase, activeQuestionIndex, rankedPlayers, session?.id]);

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

  return (
    <div
      className={`relative h-[100dvh] w-screen overflow-hidden bg-neutral-950 text-white px-6 py-4 flex flex-col justify-between select-none ${
        screenShake ? "jc-screen-shake" : ""
      }`}
    >
      <canvas
        ref={fxCanvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-50"
      />

      <style jsx>{`
        @keyframes jcScreenShake {
          10%, 90% { transform: translate3d(-2px, 1px, 0); }
          20%, 80% { transform: translate3d(3px, -1px, 0); }
          30%, 50%, 70% { transform: translate3d(-4px, 2px, 0); }
          40%, 60% { transform: translate3d(4px, -2px, 0); }
        }

        @keyframes jcGlassShine {
          0% { left: -60%; }
          60%, 100% { left: 130%; }
        }

        @keyframes jcWinnerNeon {
          0%, 100% { transform: scaleY(1); filter: brightness(1); }
          50% { transform: scaleY(1.08); filter: brightness(1.22); }
        }

        @keyframes jcLoserSmoke {
          0% { opacity: 1; filter: blur(0px); transform: translateY(0) scaleY(1); }
          100% { opacity: 0.2; filter: blur(4px); transform: translateY(8px) scaleY(0.78); }
        }

        @keyframes jcFlyPoints {
          0% { opacity: 0; transform: translate(0, 8px) scale(0.65); }
          20% { opacity: 1; transform: translate(-12px, -14px) scale(1.15); }
          75% { opacity: 1; transform: translate(-160px, -26px) scale(1); }
          100% { opacity: 0; transform: translate(-220px, -34px) scale(0.75); }
        }

        .jc-screen-shake {
          animation: jcScreenShake 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        }

        .jc-glass-shine::after {
          content: "";
          position: absolute;
          top: 0;
          left: -60%;
          width: 45%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.45), transparent);
          transform: skewX(-25deg);
          animation: jcGlassShine 2.3s ease-in-out infinite;
        }

        .jc-winner-neon {
          animation: jcWinnerNeon 1.05s ease-in-out infinite;
        }

        .jc-loser-smoke {
          animation: jcLoserSmoke 0.85s ease-out forwards;
        }

        .jc-fly-points {
          animation: jcFlyPoints 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>

      {/* ================= EN-TÊTE ================= */}
      <header className="flex items-center justify-between border-b border-white/15 pb-3 shrink-0 gap-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-13 h-13 rounded-2xl bg-amber-400/15 border border-amber-400/35 flex items-center justify-center shrink-0 p-2.5">
            <Tv className="w-7 h-7 text-amber-400" />
          </div>
          <div className="min-w-0">
            {activeQuestionIndex !== null &&
              !isSeriesCompleted &&
              questions.length > 0 && (
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
          {shouldReveal && targetNumber !== null && !isSeriesCompleted && (
            <div className="flex items-center gap-2.5 px-5 py-2 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400 text-emerald-200 font-mono text-2xl xl:text-3xl font-black">
              <Target className="w-7 h-7 text-emerald-300" />
              <span>
                Cible : {targetNumber}
                {currentQuestion?.unit ? ` ${currentQuestion.unit}` : ""}
              </span>
            </div>
          )}

          {activeQuestionIndex !== null &&
            !isSeriesCompleted &&
            !isQuestionEnded &&
            players.length > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/[0.06] border border-white/15 text-neutral-200 font-mono text-xl xl:text-2xl font-bold">
                <Users className="w-5 h-5 text-amber-300" />
                <span>
                  {answeredPlayersCount}/{players.length}
                </span>
              </div>
            )}

          {remainingSeconds !== null &&
            !isQuestionEnded &&
            !isSeriesCompleted && (
              <div
                className={`flex items-center gap-2.5 px-5 py-2 rounded-2xl border-2 font-mono text-2xl xl:text-3xl font-black ${
                  isPaused
                    ? "bg-amber-500/20 border-amber-400/60 text-amber-200"
                    : remainingSeconds <= 4
                    ? "bg-rose-500/25 border-rose-400 text-rose-200 animate-pulse"
                    : "bg-sky-500/15 border-sky-400/45 text-sky-200"
                }`}
              >
                {isPaused ? (
                  <PauseCircle className="w-6 h-6 shrink-0" />
                ) : (
                  <Clock className="w-6 h-6 shrink-0" />
                )}
                <span>{isPaused ? "Pause" : `${remainingSeconds}s`}</span>
              </div>
            )}

          <div className="px-5 py-2 rounded-2xl bg-amber-400/15 border-2 border-amber-400/45 text-amber-300 font-mono text-2xl xl:text-3xl font-black tracking-[0.2em]">
            {sessionCode || "----"}
          </div>
        </div>
      </header>

      {/* ================= ZONE PRINCIPALE ================= */}
      <main className="flex-1 min-h-0 flex items-stretch gap-0 mt-3 overflow-hidden">
        {/* CLASSEMENT COMPACT À GAUCHE (RANG + PSEUDO + SCORE) */}
        <aside className="w-[250px] xl:w-[280px] shrink-0 bg-white/[0.05] border border-white/15 rounded-l-3xl p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 pb-1.5 border-b border-white/10 shrink-0">
            <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
            <span className="text-lg xl:text-xl font-black truncate">
              Classement
            </span>
          </div>

          <div className="flex-1 min-h-0 flex flex-col justify-center gap-1.5">
            {rankedPlayers.length === 0 ? (
              <div className="text-center text-neutral-400 text-sm py-6">
                En attente des joueurs...
              </div>
            ) : (
              rankedPlayers.map(({ player, score, isWinner }, idx) => {
                const pColor = getUniquePlayerColor(player.id, players);

                return (
                  <div
                    key={player.id}
                    style={{
                      backgroundColor: pColor.bgHex,
                      color: pColor.textHex,
                    }}
                    className="h-12 rounded-xl border border-white/25 px-2.5 flex items-center justify-between gap-2 shadow-md transition"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        style={{ backgroundColor: pColor.badgeBgHex }}
                        className="w-6 h-6 rounded-lg flex items-center justify-center font-mono font-black text-xs shrink-0"
                      >
                        {idx + 1}
                      </span>
                      <span className="font-black text-base xl:text-lg truncate flex items-center gap-1 min-w-0">
                        {isWinner && (
                          <Crown className="w-4 h-4 text-amber-300 shrink-0" />
                        )}
                        <span className="truncate">{player.nickname}</span>
                      </span>
                    </div>

                    <span className="font-mono font-black text-base xl:text-lg shrink-0">
                      {score}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* COLONNE DROITE : ÉCRAN D'ATTENTE / FIN DE SÉRIE OU QUESTION + PISTE DES JAUGES */}
        <div className="flex-1 min-w-0 flex flex-col gap-2.5">
          {isSeriesCompleted ? (
            /* ÉCRAN FIN DE PARTIE (PODIUM) */
            <section className="flex-1 min-h-0 bg-white/[0.03] border border-white/15 rounded-r-3xl p-8 flex flex-col items-center justify-center text-center gap-6">
              <div className="w-20 h-20 rounded-3xl bg-amber-400/20 border-2 border-amber-400 flex items-center justify-center">
                <Trophy className="w-11 h-11 text-amber-300" />
              </div>
              <div>
                <div className="text-sm uppercase tracking-[0.22em] text-amber-300 font-extrabold">
                  Fin des {questions.length} questions
                </div>
                <h2 className="text-3xl xl:text-5xl font-black mt-1">
                  {rankedPlayers[0]
                    ? `Victoire de ${rankedPlayers[0].player.nickname} !`
                    : "Partie terminée !"}
                </h2>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-4 max-w-3xl">
                {rankedPlayers.slice(0, 3).map((item, idx) => {
                  const pColor = getUniquePlayerColor(item.player.id, players);
                  return (
                    <div
                      key={item.player.id}
                      style={{
                        backgroundColor: pColor.bgHex,
                        color: pColor.textHex,
                      }}
                      className="px-6 py-4 rounded-2xl border border-white/30 flex items-center gap-3 shadow-xl"
                    >
                      <span className="font-mono font-black text-2xl">
                        #{idx + 1}
                      </span>
                      <span className="font-black text-xl xl:text-2xl">
                        {item.player.nickname}
                      </span>
                      <span className="font-mono font-black text-xl xl:text-2xl px-3 py-1 rounded-xl bg-black/30">
                        {item.score} pts
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : activeQuestionIndex === null || !currentQuestion ? (
            /* ÉCRAN D'ATTENTE DU LANCEMENT DE LA QUESTION */
            <section className="flex-1 min-h-0 bg-white/[0.03] border border-white/15 rounded-r-3xl p-8 flex flex-col items-center justify-center text-center gap-5">
              <div className="w-20 h-20 rounded-3xl bg-amber-400/15 border border-amber-400/35 flex items-center justify-center">
                <Sparkles className="w-10 h-10 text-amber-300" />
              </div>
              <h2 className="text-3xl xl:text-4xl font-black">
                Prêts pour Le Juste Chiffre ?
              </h2>
              <p className="text-lg xl:text-2xl text-neutral-300 max-w-2xl">
                Estimez un nombre entre{" "}
                <span className="text-amber-300 font-black">1</span> et{" "}
                <span className="text-amber-300 font-black">1000</span>. L’animateur
                va lancer la première question !
              </p>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.06] border border-white/15 text-neutral-300 text-base">
                <Gamepad2 className="w-5 h-5 text-amber-300" />
                <span>
                  {players.length} joueur{players.length > 1 ? "s" : ""}{" "}
                  connecté{players.length > 1 ? "s" : ""}
                </span>
              </div>
            </section>
          ) : (
            /* JEU EN COURS : QUESTION EN HAUT + PISTE DES JAUGES */
            <>
              {showTopQuestion && currentQuestion.question && (
                <div
                  aria-live="polite"
                  style={{
                    transition: `opacity ${POST_ZERO_FADE_MS}ms ease-out, transform ${POST_ZERO_FADE_MS}ms ease-out`,
                  }}
                  className={`shrink-0 rounded-2xl bg-white/[0.06] border border-amber-400/40 px-5 py-3 shadow-lg ${
                    isQuestionFadingOut
                      ? "opacity-0 -translate-y-2"
                      : "opacity-100 translate-y-0"
                  }`}
                >
                  <p className="text-xl xl:text-3xl font-black text-white leading-snug">
                    {currentQuestion.question}
                  </p>
                </div>
              )}

              <section
                ref={targetTrackRef}
                className="relative flex-1 min-h-0 bg-white/[0.03] border border-white/15 rounded-r-3xl flex flex-col justify-between py-3 px-5"
              >
                {/* Bande d'échelle 1 / 500 / 1000 + chiffre cible aligné sur la même ligne */}
                <div className="relative h-9 shrink-0 font-mono font-black text-2xl xl:text-3xl leading-none border-b border-white/15">
                  <span className="absolute left-0 top-0 text-white">1</span>
                  <span className="absolute left-1/2 -translate-x-1/2 top-0 text-amber-300">
                    500
                  </span>
                  <span className="absolute right-0 top-0 text-white">
                    1000
                  </span>

                  {shouldReveal && targetPercent !== null && (
                    <div
                      style={{
                        left: `${targetLineExpanded ? targetPercent : 0}%`,
                        transition: `left ${targetDurationMs}ms cubic-bezier(0.16, 1, 0.3, 1)`,
                      }}
                      className="pointer-events-none absolute top-0 z-40 -translate-x-1/2 px-2 py-0 rounded-md bg-emerald-400 text-black font-mono text-2xl xl:text-3xl font-black leading-none shadow-lg whitespace-nowrap"
                    >
                      {targetNumber}
                    </div>
                  )}
                </div>

                {/* Ligne verticale milieu (500) */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-12 bottom-3 left-1/2 border-l-2 border-dashed border-white/25 z-0"
                />

                {/* Effet 4 : Faisceau laser cible partant de 0 avec la même vitesse que les barres */}
                {shouldReveal && targetPercent !== null && (
                  <div
                    style={{
                      left: `${targetLineExpanded ? targetPercent : 0}%`,
                      transition: `left ${targetDurationMs}ms cubic-bezier(0.16, 1, 0.3, 1)`,
                    }}
                    className="pointer-events-none absolute top-12 bottom-3 z-30 -translate-x-1/2 flex flex-col items-center"
                  >
                    <div
                      className={`w-1.5 flex-1 bg-emerald-400 ${
                        laserImpactFlash
                          ? "shadow-[0_0_26px_#34d399,0_0_44px_#ffffff]"
                          : "shadow-[0_0_16px_rgba(52,211,153,0.95)]"
                      }`}
                    />
                  </div>
                )}

                {/* Pastilles & barres centrées verticalement avec peu d'espace entre elles */}
                <div className="relative z-10 flex-1 min-h-0 flex flex-col justify-center gap-1.5">
                  {rankedPlayers.map(({ player, guess, isWinner }) => {
                    const idStr = String(player.id);
                    const pColor = getUniquePlayerColor(player.id, players);
                    const hasAnswered = guess !== null;
                    const widthPercent =
                      barsExpanded && hasAnswered
                        ? Math.max(2, Math.min(100, (guess / MAX_VALUE) * 100))
                        : 0;
                    const barDurationMs = hasAnswered
                      ? Math.max(
                          400,
                          Math.round((guess / MAX_VALUE) * FULL_SCALE_BAR_MS)
                        )
                      : FULL_SCALE_BAR_MS;

                    const isBarAnimatingNow =
                      phase === "revealed" && hasAnswered;

                    const counterValue = !hasAnswered
                      ? 0
                      : phase === "revealed" || displayCounters[idStr] === guess
                      ? guess
                      : displayCounters[idStr] ?? 0;

                    const isLoser = isBarAnimatingNow && !isWinner;
                    const wonPts = roundPointsByPlayer[idStr];

                    // Effet 6 : rebond élastique en butée lors du déploiement
                    const transitionStyle = `width ${barDurationMs}ms cubic-bezier(0.34, 1.42, 0.64, 1)`;

                    return (
                      <div
                        key={player.id}
                        className="relative h-12 flex items-center"
                      >
                        {/* Pastille de départ du joueur à gauche de la piste */}
                        <div
                          style={{
                            backgroundColor: pColor.bgHex,
                            color: pColor.textHex,
                          }}
                          className="relative z-20 h-10 px-3 rounded-l-2xl border border-white/25 flex items-center gap-2 shrink-0 shadow-md"
                        >
                          <span className="font-black text-sm xl:text-base truncate max-w-[110px]">
                            {player.nickname}
                          </span>
                          {!shouldReveal && (
                            <span
                              className={`w-2.5 h-2.5 rounded-full ${
                                hasAnswered
                                  ? "bg-emerald-300 shadow-[0_0_8px_#6ee7b7]"
                                  : "bg-black/35"
                              }`}
                            />
                          )}
                        </div>

                        {/* Barre colorée avec effet 1 (verre poli + reflet) */}
                        <div className="relative flex-1 h-10 flex items-center">
                          <div
                            ref={(el) => {
                              barRefs.current[idStr] = el;
                            }}
                            style={{
                              width: `${widthPercent}%`,
                              backgroundColor: pColor.bgHex,
                              transition: transitionStyle,
                              boxShadow:
                                isWinner && phase === "revealed"
                                  ? `0 0 26px ${pColor.bgHex}, inset 0 1px 1px rgba(255,255,255,0.65)`
                                  : "inset 0 1px 1px rgba(255,255,255,0.45)",
                            }}
                            className={`relative h-10 rounded-r-2xl border border-l-0 border-white/25 flex items-center justify-end pr-3 overflow-hidden jc-glass-shine ${
                              isWinner && phase === "revealed"
                                ? "jc-winner-neon"
                                : isLoser
                                ? "jc-loser-smoke"
                                : ""
                            }`}
                          >
                            {/* Chiffre qui monte avec la barre puis reste figé sur l'estimation */}
                            {shouldReveal && hasAnswered && (
                              <span
                                className={`relative z-10 ml-2 px-2.5 py-0.5 rounded-lg font-mono text-xl xl:text-2xl font-black leading-none shadow-md shrink-0 ${
                                  isWinner
                                    ? "bg-amber-300 text-black"
                                    : "bg-neutral-900/95 text-white border border-white/25"
                                }`}
                              >
                                {counterValue}
                              </span>
                            )}
                          </div>

                          {/* Effet 15 : Badge +3 / +5 volant vers le classement */}
                          {launchFlyBadges && wonPts !== undefined && (
                            <span
                              style={{
                                left: `${Math.min(92, Math.max(8, (guess ?? 0) / 10))}%`,
                              }}
                              className="pointer-events-none absolute -top-2 z-40 px-2.5 py-0.5 rounded-full bg-amber-300 text-black font-mono text-sm xl:text-base font-black shadow-lg jc-fly-points"
                            >
                              +{wonPts} pts
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
