"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Clock,
  Crown,
  Gamepad2,
  PauseCircle,
  Sparkles,
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
const FULL_SCALE_TARGET_MS = 8000;
const TARGET_START_DELAY_AFTER_BARS_MS = 1500;
const POST_ZERO_FADE_MS = 550;
const POST_FADE_DELAY_MS = 2000;
const DEFAULT_DURATION_SECONDS = 20;
const QUESTIONS_PER_GAME = 15;
const REVEAL_DELAY_AFTER_BARS_MS = 900;
const FLY_BADGE_ANIMATION_MS = 1200;
const PODIUM_DELAY_AFTER_LAST_QUESTION_MS = 2500;

type BotLevel = "cool" | "normal" | "expert";

interface JcBotConfig {
  id: string;
  nickname: string;
  avatar?: string;
  botLevel?: BotLevel;
  score?: number;
}

interface JusteChiffreStatePayload {
  mode?: string;
  bots?: JcBotConfig[];
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
  scores?: Record<string, unknown>;
  points?: Record<string, unknown>;
  revealed?: boolean;
  finished?: boolean;
}

type ExtendedSession = GameSession & {
  game_state?: JusteChiffreStatePayload | null;
};

type ExtendedPlayer = SessionPlayer & {
  avatar_id?: string | null;
  isBot?: boolean;
  botLevel?: BotLevel;
  score?: number | null;
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

const BOT_JC_CONFIG: Record<
  BotLevel,
  { maxSpread: number; exactChance: number; minDelayMs: number; maxDelayMs: number }
> = {
  cool: { maxSpread: 340, exactChance: 0.02, minDelayMs: 2500, maxDelayMs: 8500 },
  normal: { maxSpread: 150, exactChance: 0.06, minDelayMs: 1800, maxDelayMs: 7000 },
  expert: { maxSpread: 55, exactChance: 0.14, minDelayMs: 1400, maxDelayMs: 5500 },
};

function pickBotEstimate(
  level: BotLevel | undefined,
  target: number | null
): number {
  const cfg = BOT_JC_CONFIG[level ?? "normal"];
  if (target !== null && Math.random() < cfg.exactChance) {
    return Math.max(MIN_VALUE, Math.min(MAX_VALUE, Math.round(target)));
  }

  if (target !== null) {
    const offset = Math.round((Math.random() * 2 - 1) * cfg.maxSpread);
    return Math.max(MIN_VALUE, Math.min(MAX_VALUE, Math.round(target + offset)));
  }

  return (
    MIN_VALUE + Math.floor(Math.random() * (MAX_VALUE - MIN_VALUE + 1))
  );
}

function getBotEstimateDelayMs(level: BotLevel | undefined): number {
  const cfg = BOT_JC_CONFIG[level ?? "normal"];
  return (
    cfg.minDelayMs +
    Math.floor(Math.random() * Math.max(400, cfg.maxDelayMs - cfg.minDelayMs))
  );
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
  const [humanPlayers, setHumanPlayers] = useState<ExtendedPlayer[]>([]);
  const [scoresRows, setScoresRows] = useState<PlayerScore[]>([]);
  const [localScoresByPlayer, setLocalScoresByPlayer] = useState<
    Record<string, number>
  >({});
  const gameTitle = "Le Juste Chiffre";

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [localStartMs, setLocalStartMs] = useState<number | null>(null);
  const [frozenRemaining, setFrozenRemaining] = useState<number | null>(null);

  const [showTopQuestion, setShowTopQuestion] = useState<boolean>(false);
  const [isQuestionFadingOut, setIsQuestionFadingOut] = useState<boolean>(false);
  const [canStartRevealSequence, setCanStartRevealSequence] =
    useState<boolean>(false);

  const [barsExpanded, setBarsExpanded] = useState<boolean>(false);
  const [targetLineVisible, setTargetLineVisible] = useState<boolean>(false);
  const [targetLineExpanded, setTargetLineExpanded] = useState<boolean>(false);
  const [targetMoveDurationMs, setTargetMoveDurationMs] =
    useState<number>(FULL_SCALE_TARGET_MS);
  const [targetCounterValue, setTargetCounterValue] = useState<number>(0);
  const [displayCounters, setDisplayCounters] = useState<
    Record<string, number>
  >({});
  const [phase, setPhase] = useState<"idle" | "playing" | "revealed">("idle");
  const [roundPointsByPlayer, setRoundPointsByPlayer] = useState<
    Record<string, number>
  >({});
  const [exactPlayersByRound, setExactPlayersByRound] = useState<
    Record<string, boolean>
  >({});
  const [launchFlyBadges, setLaunchFlyBadges] = useState<boolean>(false);
  const [badgeAnimationDone, setBadgeAnimationDone] = useState<boolean>(false);
  const [showAutoPodium, setShowAutoPodium] = useState<boolean>(false);
  const [laserImpactFlash, setLaserImpactFlash] = useState<boolean>(false);
  const [screenShake, setScreenShake] = useState<boolean>(false);

  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafLoopRef = useRef<number>(0);
  const barRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const targetTrackRef = useRef<HTMLDivElement | null>(null);

  const scoredRoundsRef = useRef<Set<string>>(new Set());
  const isScoringRef = useRef<boolean>(false);
  const lastResetSignatureRef = useRef<string>("");
  const isResettingScoresRef = useRef<boolean>(false);
  const activeRoundSignatureRef = useRef<string>("");
  const zeroSequenceRoundRef = useRef<string>("");
  const revealAnimRoundRef = useRef<string>("");
  const fxRoundSignatureRef = useRef<string>("");
  const podiumLockedSeriesRef = useRef<string>("");
  const podiumConfettiRoundRef = useRef<string>("");
  const botTimersRef = useRef(new Map<string, number>());
  const botContextRef = useRef<{
    sessionId: string;
    target: number | null;
  }>({ sessionId: "", target: null });

  const startParticlesLoop = () => {
    if (rafLoopRef.current) return;
    const canvas = fxCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const step = () => {
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

      if (particlesRef.current.length > 0) {
        rafLoopRef.current = window.requestAnimationFrame(step);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        rafLoopRef.current = 0;
      }
    };

    rafLoopRef.current = window.requestAnimationFrame(step);
  };

  useEffect(() => {
    const canvas = fxCanvasRef.current;
    if (!canvas) return;
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (rafLoopRef.current) {
        window.cancelAnimationFrame(rafLoopRef.current);
        rafLoopRef.current = 0;
      }
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
    startParticlesLoop();
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
    startParticlesLoop();
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
    startParticlesLoop();
  };

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
      setHumanPlayers((pData as ExtendedPlayer[] | null) ?? []);
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

  const players = useMemo<ExtendedPlayer[]>(() => {
    const stateBots = Array.isArray(statePayload.bots) ? statePayload.bots : [];
    const botPlayers: ExtendedPlayer[] = stateBots
      .filter((b) => Boolean(b?.id && b?.nickname))
      .map(
        (b) =>
          ({
            id: String(b.id),
            session_id: session?.id ?? sessionCode,
            nickname: String(b.nickname),
            avatar: b.avatar ?? "🤖",
            is_host: false,
            is_connected: true,
            isBot: true,
            botLevel: b.botLevel ?? "normal",
            score: toFiniteNumber(b.score),
          }) as ExtendedPlayer
      );

    const existingIds = new Set(humanPlayers.map((p) => String(p.id)));
    const uniqueBots = botPlayers.filter((bp) => !existingIds.has(String(bp.id)));
    return [...humanPlayers, ...uniqueBots];
  }, [humanPlayers, statePayload.bots, session?.id, sessionCode]);

  const statusLower = String(session?.status ?? "").toLowerCase();
  const isLobbyOrFinished =
    statusLower === "lobby" ||
    statusLower === "finished" ||
    statusLower === "ended" ||
    statusLower === "completed";

  const seriesNumber = Math.max(
    1,
    toFiniteNumber(statePayload.seriesNumber) ?? 1
  );
  const seriesSeed =
    typeof statePayload.seriesSeed === "string" && statePayload.seriesSeed.trim()
      ? statePayload.seriesSeed.trim()
      : `${session?.id ?? ""}-${sessionCode}-jc-${seriesNumber}`;

  const seriesKey = `${session?.id ?? sessionCode}-s${seriesNumber}-${seriesSeed}`;

  useEffect(() => {
    if (!session?.id) return;

    const resetTrigger = isLobbyOrFinished
      ? `${session.id}-status:${statusLower}`
      : `${session.id}-series:${seriesNumber}:${seriesSeed}`;

    const shouldReset =
      isLobbyOrFinished ||
      (lastResetSignatureRef.current !== "" &&
        !lastResetSignatureRef.current.includes(
          `series:${seriesNumber}:${seriesSeed}`
        ) &&
        resetTrigger.includes("series:"));

    if (lastResetSignatureRef.current === "") {
      lastResetSignatureRef.current = resetTrigger;
      if (!isLobbyOrFinished) return;
    }

    if (!shouldReset && lastResetSignatureRef.current === resetTrigger) {
      return;
    }

    if (isResettingScoresRef.current) return;

    lastResetSignatureRef.current = resetTrigger;
    isResettingScoresRef.current = true;
    scoredRoundsRef.current = new Set();
    podiumLockedSeriesRef.current = "";
    podiumConfettiRoundRef.current = "";
    setShowAutoPodium(false);
    botTimersRef.current.forEach((timerId: number) => {
      window.clearTimeout(timerId);
    });
    botTimersRef.current.clear();
    setLocalScoresByPlayer({});
    setScoresRows((prev) =>
      prev.map(
        (row) =>
          ({
            ...row,
            total_score: 0,
            score: 0,
          }) as PlayerScore
      )
    );

    if (!supabase) {
      isResettingScoresRef.current = false;
      return;
    }

    void (async () => {
      try {
        await supabase
          .from("player_scores")
          .update({ total_score: 0 })
          .eq("session_id", session.id);

        const { data: latestRow } = await supabase
          .from("game_sessions")
          .select("game_state")
          .eq("id", session.id)
          .maybeSingle<{ game_state?: Record<string, unknown> | null }>();

        if (latestRow) {
          const baseState = (latestRow.game_state ?? {}) as JusteChiffreStatePayload;
          const resetBots = Array.isArray(baseState.bots)
            ? baseState.bots.map((b) => ({ ...b, score: 0 }))
            : undefined;
          await supabase
            .from("game_sessions")
            .update({
              game_state: {
                ...baseState,
                scores: {},
                points: {},
                ...(resetBots ? { bots: resetBots } : {}),
              },
            })
            .eq("id", session.id);
        }
      } finally {
        isResettingScoresRef.current = false;
      }
    })();
  }, [
    supabase,
    session?.id,
    isLobbyOrFinished,
    statusLower,
    seriesNumber,
    seriesSeed,
  ]);

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

  const isLastQuestionOfSeries =
    activeQuestionIndex !== null &&
    questions.length > 0 &&
    activeQuestionIndex >= questions.length - 1;

  const isSeriesCompleted =
    Boolean(statePayload.finished) ||
    showAutoPodium ||
    podiumLockedSeriesRef.current === seriesKey ||
    (activeQuestionIndex !== null &&
      questions.length > 0 &&
      activeQuestionIndex >= questions.length);

  const currentQuestion = useMemo<JusteChiffreQuestion | null>(() => {
    if (activeQuestionIndex === null || isSeriesCompleted) return null;
    if (statePayload.currentQuestion && statePayload.currentQuestion.question) {
      return statePayload.currentQuestion;
    }
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

  const roundSignature = useMemo(() => {
    if (activeQuestionIndex === null || isSeriesCompleted) return "";
    return `${session?.id ?? ""}-s${seriesNumber}-${seriesSeed}-q${activeQuestionIndex}-${remoteStartMs ?? 0}`;
  }, [
    activeQuestionIndex,
    isSeriesCompleted,
    session?.id,
    seriesNumber,
    seriesSeed,
    remoteStartMs,
  ]);

  useEffect(() => {
    if (!roundSignature) {
      if (isSeriesCompleted) {
        return;
      }
      activeRoundSignatureRef.current = "";
      zeroSequenceRoundRef.current = "";
      revealAnimRoundRef.current = "";
      fxRoundSignatureRef.current = "";
      setLocalStartMs(null);
      setFrozenRemaining(null);
      setShowTopQuestion(false);
      setIsQuestionFadingOut(false);
      setCanStartRevealSequence(false);
      setPhase("idle");
      setBarsExpanded(false);
      setTargetLineVisible(false);
      setTargetLineExpanded(false);
      setTargetMoveDurationMs(FULL_SCALE_TARGET_MS);
      setTargetCounterValue(0);
      setDisplayCounters({});
      setRoundPointsByPlayer({});
      setExactPlayersByRound({});
      setLaunchFlyBadges(false);
      setBadgeAnimationDone(false);
      setShowAutoPodium(false);
      setLaserImpactFlash(false);
      setScreenShake(false);
      return;
    }

    if (activeRoundSignatureRef.current === roundSignature) return;
    activeRoundSignatureRef.current = roundSignature;
    zeroSequenceRoundRef.current = "";
    revealAnimRoundRef.current = "";
    fxRoundSignatureRef.current = "";

    const start = remoteStartMs ?? Date.now();
    setLocalStartMs(start);
    setFrozenRemaining(null);
    setNowMs(Date.now());
    setShowTopQuestion(true);
    setIsQuestionFadingOut(false);
    setCanStartRevealSequence(false);
    setPhase("playing");
    setBarsExpanded(false);
    setTargetLineVisible(false);
    setTargetLineExpanded(false);
    setTargetMoveDurationMs(FULL_SCALE_TARGET_MS);
    setTargetCounterValue(0);
    setDisplayCounters({});
    setRoundPointsByPlayer({});
    setExactPlayersByRound({});
    setLaunchFlyBadges(false);
    setBadgeAnimationDone(false);
    setShowAutoPodium(false);
    setLaserImpactFlash(false);
    setScreenShake(false);
  }, [roundSignature, remoteStartMs, isSeriesCompleted]);

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
    if (
      activeQuestionIndex === null ||
      !currentQuestion ||
      isPaused ||
      isSeriesCompleted
    ) {
      return;
    }
    const timer = window.setInterval(() => setNowMs(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [activeQuestionIndex, currentQuestion, isPaused, isSeriesCompleted]);

  const remainingSeconds = useMemo<number | null>(() => {
    if (activeQuestionIndex === null || !currentQuestion || isSeriesCompleted) {
      return null;
    }
    if (isPaused && frozenRemaining !== null) return frozenRemaining;
    const effStart = remoteStartMs ?? localStartMs ?? nowMs;
    const elapsed = Math.max(0, (nowMs - effStart) / 1000);
    return Math.max(0, Math.ceil(durationSeconds - elapsed));
  }, [
    activeQuestionIndex,
    currentQuestion,
    isSeriesCompleted,
    isPaused,
    frozenRemaining,
    remoteStartMs,
    localStartMs,
    nowMs,
    durationSeconds,
  ]);

  const isTimerZero =
    !isPaused &&
    !isSeriesCompleted &&
    activeQuestionIndex !== null &&
    currentQuestion !== null &&
    remainingSeconds !== null &&
    remainingSeconds <= 0;

  const isQuestionEnded = Boolean(isTimerZero || statePayload.revealed);

  useEffect(() => {
    if (!isQuestionEnded || !roundSignature || isSeriesCompleted) return;
    if (zeroSequenceRoundRef.current === roundSignature) return;
    zeroSequenceRoundRef.current = roundSignature;

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
  }, [isQuestionEnded, roundSignature, isSeriesCompleted]);

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

  useEffect(() => {
    botContextRef.current = {
      sessionId: session?.id ?? "",
      target: targetNumber,
    };
  }, [session?.id, targetNumber]);

  useEffect(() => {
    const canBotsPlay =
      Boolean(supabase) &&
      Boolean(session?.id) &&
      !isLobbyOrFinished &&
      !isSeriesCompleted &&
      !isPaused &&
      !isQuestionEnded &&
      activeQuestionIndex !== null &&
      Boolean(currentQuestion);

    if (!canBotsPlay) {
      botTimersRef.current.forEach((timerId: number) => {
        window.clearTimeout(timerId);
      });
      botTimersRef.current.clear();
      return;
    }

    const activeBots = players.filter((p) => Boolean(p.isBot));
    const activeBotIds = new Set(activeBots.map((b) => String(b.id)));
    const roundPrefix = `s${seriesNumber}-${seriesSeed}-q${activeQuestionIndex}::`;

    for (const [key, timerId] of botTimersRef.current.entries()) {
      const botPart = key.split("::")[1] ?? "";
      if (!key.startsWith(roundPrefix) || !activeBotIds.has(botPart)) {
        window.clearTimeout(timerId);
        botTimersRef.current.delete(key);
      }
    }

    for (const bot of activeBots) {
      const botIdStr = String(bot.id);
      if (estimatesByPlayerId[botIdStr] !== undefined) continue;

      const timerKey = `${roundPrefix}${botIdStr}`;
      if (botTimersRef.current.has(timerKey)) continue;

      const delayMs = getBotEstimateDelayMs(bot.botLevel);
      const timerId = window.setTimeout(() => {
        botTimersRef.current.delete(timerKey);
        const { sessionId: targetId, target: targetVal } =
          botContextRef.current;
        if (!supabase || !targetId) return;

        const chosenEstimate = pickBotEstimate(bot.botLevel, targetVal);
        void (async () => {
          const { data: latestRow } = await supabase
            .from("game_sessions")
            .select("game_state")
            .eq("id", targetId)
            .maybeSingle<{ game_state?: Record<string, unknown> | null }>();

          const baseState = (latestRow?.game_state ??
            {}) as JusteChiffreStatePayload;
          const nextEstimates = {
            ...(baseState.estimates ?? {}),
            [botIdStr]: chosenEstimate,
          };
          const nextGameState: JusteChiffreStatePayload = {
            ...baseState,
            estimates: nextEstimates,
          };

          const { error } = await supabase
            .from("game_sessions")
            .update({ game_state: nextGameState })
            .eq("id", targetId);

          if (!error) {
            setSession((prev) =>
              prev && prev.id === targetId
                ? { ...prev, game_state: nextGameState }
                : prev
            );
          }
        })();
      }, delayMs);

      botTimersRef.current.set(timerKey, timerId);
    }
  }, [
    supabase,
    session?.id,
    isLobbyOrFinished,
    isSeriesCompleted,
    isPaused,
    isQuestionEnded,
    activeQuestionIndex,
    currentQuestion,
    players,
    estimatesByPlayerId,
    seriesNumber,
    seriesSeed,
  ]);

  const estimatesKey = useMemo(
    () =>
      Object.entries(estimatesByPlayerId)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join("|"),
    [estimatesByPlayerId]
  );

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

    for (const bot of players) {
      if (bot.isBot && typeof bot.score === "number") {
        scoreById.set(String(bot.id), bot.score);
      }
    }

    const stateScores = (statePayload.scores ?? statePayload.points ?? {}) as Record<
      string,
      unknown
    >;
    for (const [pid, rawVal] of Object.entries(stateScores)) {
      const num = toFiniteNumber(rawVal);
      if (num !== null) {
        scoreById.set(String(pid), num);
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
      const baseScore = scoreById.get(idStr) ?? 0;
      const localBonus = localScoresByPlayer[idStr] ?? 0;
      return {
        player,
        score: Math.max(baseScore, localBonus),
        guess,
        diff,
        isExact,
      };
    });

    const validDiffs = withMeta
      .map((item) => item.diff)
      .filter((d): d is number => d !== null);
    const minDiff = validDiffs.length > 0 ? Math.min(...validDiffs) : null;

    const sorted = [...withMeta].sort((a, b) => b.score - a.score);

    let currentRank = 1;
    return sorted.map((item, idx) => {
      if (idx > 0 && item.score < sorted[idx - 1]!.score) {
        currentRank = idx + 1;
      }
      return {
        ...item,
        rank: currentRank,
        isWinner:
          phase === "revealed" &&
          minDiff !== null &&
          item.diff !== null &&
          item.diff === minDiff,
      };
    });
  }, [
    players,
    scoresRows,
    statePayload.scores,
    statePayload.points,
    localScoresByPlayer,
    estimatesByPlayerId,
    targetNumber,
    phase,
  ]);

  const topRank = rankedPlayers[0]?.rank ?? 1;
  const topWinners = useMemo(
    () => rankedPlayers.filter((item) => item.rank === topRank),
    [rankedPlayers, topRank]
  );

  // Regroupement par marche de podium (1er, 2e, 3e) avec gestion des ex æquo
  const podiumSteps = useMemo(() => {
    const rank1 = rankedPlayers.filter((p) => p.rank === 1);
    const rank2 = rankedPlayers.filter((p) => p.rank === 2);
    const rank3 = rankedPlayers.filter((p) => p.rank === 3);

    const steps: Array<{
      rank: 1 | 2 | 3;
      label: string;
      heightClass: string;
      entries: typeof rankedPlayers;
    }> = [];

    if (rank2.length > 0) {
      steps.push({
        rank: 2,
        label: "2e",
        heightClass: "h-36 xl:h-44",
        entries: rank2,
      });
    }
    if (rank1.length > 0) {
      steps.push({
        rank: 1,
        label: "1er",
        heightClass: "h-48 xl:h-56",
        entries: rank1,
      });
    }
    if (rank3.length > 0) {
      steps.push({
        rank: 3,
        label: "3e",
        heightClass: "h-28 xl:h-36",
        entries: rank3,
      });
    }

    return steps;
  }, [rankedPlayers]);

  const rankedPlayersRef = useRef(rankedPlayers);
  rankedPlayersRef.current = rankedPlayers;
  const scoresRowsRef = useRef(scoresRows);
  scoresRowsRef.current = scoresRows;
  const estimatesRef = useRef(estimatesByPlayerId);
  estimatesRef.current = estimatesByPlayerId;
  const playersRef = useRef(players);
  playersRef.current = players;
  const targetNumberRef = useRef(targetNumber);
  targetNumberRef.current = targetNumber;

  useEffect(() => {
    if (!shouldReveal || !roundSignature) return;
    if (revealAnimRoundRef.current === roundSignature) return;
    revealAnimRoundRef.current = roundSignature;

    const snapshotGuesses: Record<string, number> = { ...estimatesRef.current };
    const playerIds = playersRef.current.map((p) => String(p.id));
    const snapshotTarget = targetNumberRef.current;
    const snapshotTargetPercent =
      snapshotTarget !== null
        ? Math.max(0, Math.min(100, (snapshotTarget / MAX_VALUE) * 100))
        : null;

    setBarsExpanded(false);
    setTargetLineVisible(false);
    setTargetLineExpanded(false);
    setTargetMoveDurationMs(FULL_SCALE_TARGET_MS);
    setTargetCounterValue(0);

    let innerRaf = 0;
    const outerRaf = window.requestAnimationFrame(() => {
      innerRaf = window.requestAnimationFrame(() => {
        setBarsExpanded(true);
      });
    });

    const guessValues = Object.values(snapshotGuesses);
    const maxGuessValue = guessValues.length > 0 ? Math.max(...guessValues) : 0;
    const allPlayerBarsDurationMs =
      maxGuessValue > 0
        ? Math.max(
            400,
            Math.round((maxGuessValue / MAX_VALUE) * FULL_SCALE_BAR_MS)
          )
        : 400;

    const animStart = performance.now();
    let counterRaf = 0;
    let targetCounterRaf = 0;
    let targetExpandRaf1 = 0;
    let targetExpandRaf2 = 0;
    let isCancelled = false;

    const tickPlayerCounters = (now: number) => {
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
        counterRaf = window.requestAnimationFrame(tickPlayerCounters);
      }
    };

    counterRaf = window.requestAnimationFrame(tickPlayerCounters);

    let flashTimer = 0;
    let revealTimer = 0;

    const totalDelayBeforeTargetStart =
      allPlayerBarsDurationMs + TARGET_START_DELAY_AFTER_BARS_MS;

    const startTargetLineTimer = window.setTimeout(() => {
      if (isCancelled) return;
      setDisplayCounters(snapshotGuesses);

      if (snapshotTarget !== null && snapshotTargetPercent !== null) {
        const clampedTarget = Math.max(0, Math.min(MAX_VALUE, snapshotTarget));
        const computedTargetDurationMs = Math.max(
          250,
          Math.round((clampedTarget / MAX_VALUE) * FULL_SCALE_TARGET_MS)
        );

        setTargetMoveDurationMs(computedTargetDurationMs);
        setTargetLineVisible(true);
        setTargetLineExpanded(false);
        setTargetCounterValue(0);

        targetExpandRaf1 = window.requestAnimationFrame(() => {
          targetExpandRaf2 = window.requestAnimationFrame(() => {
            if (isCancelled) return;
            setTargetLineExpanded(true);
          });
        });

        const targetStart = performance.now();
        const tickTargetCounter = (now: number) => {
          if (isCancelled) return;
          const elapsed = now - targetStart;
          const progress = Math.min(1, elapsed / computedTargetDurationMs);
          setTargetCounterValue(Math.round(snapshotTarget * progress));

          if (progress < 1) {
            targetCounterRaf = window.requestAnimationFrame(tickTargetCounter);
          } else {
            setTargetCounterValue(snapshotTarget);
          }
        };
        targetCounterRaf = window.requestAnimationFrame(tickTargetCounter);

        flashTimer = window.setTimeout(() => {
          if (isCancelled) return;
          setLaserImpactFlash(true);
          if (targetTrackRef.current) {
            const rect = targetTrackRef.current.getBoundingClientRect();
            const impactX =
              rect.left + (rect.width * snapshotTargetPercent) / 100;
            const impactY = rect.top + rect.height / 2;
            spawnSparks(
              impactX,
              impactY,
              ["#34d399", "#a7f3d0", "#ffffff"],
              28
            );
          }
        }, computedTargetDurationMs);

        revealTimer = window.setTimeout(() => {
          if (isCancelled) return;
          setPhase("revealed");
        }, computedTargetDurationMs + REVEAL_DELAY_AFTER_BARS_MS);
      } else {
        revealTimer = window.setTimeout(() => {
          if (isCancelled) return;
          setPhase("revealed");
        }, REVEAL_DELAY_AFTER_BARS_MS);
      }
    }, totalDelayBeforeTargetStart);

    return () => {
      isCancelled = true;
      window.clearTimeout(startTargetLineTimer);
      if (flashTimer) window.clearTimeout(flashTimer);
      if (revealTimer) window.clearTimeout(revealTimer);
      window.cancelAnimationFrame(outerRaf);
      window.cancelAnimationFrame(innerRaf);
      window.cancelAnimationFrame(counterRaf);
      if (targetCounterRaf) window.cancelAnimationFrame(targetCounterRaf);
      if (targetExpandRaf1) window.cancelAnimationFrame(targetExpandRaf1);
      if (targetExpandRaf2) window.cancelAnimationFrame(targetExpandRaf2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldReveal, roundSignature]);

  useEffect(() => {
    if (phase !== "revealed" || !roundSignature) return;
    if (fxRoundSignatureRef.current === roundSignature) return;
    fxRoundSignatureRef.current = roundSignature;

    const currentPlayers = playersRef.current;
    const currentEstimates = estimatesRef.current;
    const snapshotTarget = targetNumberRef.current;

    const candidates = currentPlayers
      .map((player) => {
        const pid = String(player.id);
        const guess = currentEstimates[pid] ?? null;
        const diff =
          guess !== null && snapshotTarget !== null
            ? Math.abs(guess - snapshotTarget)
            : null;
        const isExact =
          guess !== null && snapshotTarget !== null && guess === snapshotTarget;
        return { player, pid, guess, diff, isExact };
      })
      .filter((c) => c.guess !== null && c.diff !== null);

    const minDiff =
      candidates.length > 0
        ? Math.min(...candidates.map((c) => c.diff as number))
        : null;

    const ptsMap: Record<string, number> = {};
    const exactMap: Record<string, boolean> = {};
    let hasExact = false;

    for (const item of candidates) {
      const pid = item.pid;
      const isItemWinner = minDiff !== null && item.diff === minDiff;
      if (item.isExact && item.guess !== null) {
        exactMap[pid] = true;
        hasExact = true;
      }
      if (isItemWinner && item.guess !== null) {
        ptsMap[pid] = item.isExact ? 5 : 3;

        const barEl = barRefs.current[pid];
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
        const barEl = barRefs.current[pid];
        if (barEl) {
          const rect = barEl.getBoundingClientRect();
          spawnSmoke(
            rect.left + rect.width * 0.5,
            rect.top + rect.height / 2,
            16
          );
        }
      }
    }

    setRoundPointsByPlayer(ptsMap);
    setExactPlayersByRound(exactMap);
    setBadgeAnimationDone(false);
    setLaunchFlyBadges(true);

    if (hasExact) {
      spawnConfetti(120);
      setScreenShake(false);
      window.requestAnimationFrame(() => {
        setScreenShake(true);
      });
      window.setTimeout(() => setScreenShake(false), 520);
    }

    const badgeFinishTimer = window.setTimeout(() => {
      setBadgeAnimationDone(true);
    }, FLY_BADGE_ANIMATION_MS);

    const flyResetTimer = window.setTimeout(() => {
      setLaunchFlyBadges(false);
    }, FLY_BADGE_ANIMATION_MS + 200);

    return () => {
      window.clearTimeout(badgeFinishTimer);
      window.clearTimeout(flyResetTimer);
    };
  }, [phase, roundSignature]);

  // Addition cumulative des points APRÈS l'animation de la pastille (+3 ou +5 si exact)
  useEffect(() => {
    if (
      phase !== "revealed" ||
      !badgeAnimationDone ||
      activeQuestionIndex === null ||
      targetNumber === null
    ) {
      return;
    }

    const currentPlayers = playersRef.current;
    const currentEstimates = estimatesRef.current;

    const candidates = currentPlayers
      .map((player) => {
        const pid = String(player.id);
        const guess = currentEstimates[pid] ?? null;
        const diff = guess !== null ? Math.abs(guess - targetNumber) : null;
        const isExact = guess !== null && guess === targetNumber;
        return { player, pid, guess, diff, isExact };
      })
      .filter((c) => c.guess !== null && c.diff !== null);

    if (candidates.length === 0) return;

    const minDiff = Math.min(...candidates.map((c) => c.diff as number));
    const winners = candidates.filter((c) => c.diff === minDiff);
    if (winners.length === 0) return;

    const roundKey = `${session?.id ?? sessionCode}-jc-s${seriesNumber}-q${activeQuestionIndex}`;
    if (scoredRoundsRef.current.has(roundKey) || isScoringRef.current) return;

    isScoringRef.current = true;
    scoredRoundsRef.current.add(roundKey);

    const awardedByPid: Record<string, number> = {};
    for (const w of winners) {
      awardedByPid[w.pid] = w.isExact ? 5 : 3;
    }

    setLocalScoresByPlayer((prev) => {
      const next = { ...prev };
      for (const [pid, pts] of Object.entries(awardedByPid)) {
        next[pid] = (next[pid] ?? 0) + pts;
      }
      return next;
    });

    if (!supabase || !session?.id) {
      isScoringRef.current = false;
      return;
    }

    void (async () => {
      try {
        const humanWinners = winners.filter((w) => !w.player.isBot);
        const botWinners = winners.filter((w) => Boolean(w.player.isBot));

        const { data: latestScores } = await supabase
          .from("player_scores")
          .select("*")
          .eq("session_id", session.id);

        const baseRows =
          (latestScores as PlayerScore[] | null) ?? scoresRowsRef.current;

        const currentMap = new Map<string, number>();
        const existingIdSet = new Set<string>();
        for (const row of baseRows) {
          const rec = row as unknown as {
            player_id?: string | null;
            total_score?: number | null;
            score?: number | null;
          };
          if (rec.player_id) {
            const pid = String(rec.player_id);
            existingIdSet.add(pid);
            currentMap.set(pid, rec.total_score ?? rec.score ?? 0);
          }
        }

        for (const w of humanWinners) {
          const pts = awardedByPid[w.pid] ?? 3;
          const nextScore = (currentMap.get(w.pid) ?? 0) + pts;
          currentMap.set(w.pid, nextScore);

          if (existingIdSet.has(w.pid)) {
            await supabase
              .from("player_scores")
              .update({
                total_score: nextScore,
                nickname: w.player.nickname,
              })
              .eq("session_id", session.id)
              .eq("player_id", w.pid);
          } else {
            await supabase.from("player_scores").insert({
              session_id: session.id,
              player_id: w.pid,
              nickname: w.player.nickname,
              avatar_id: w.player.avatar_id ?? "gamepad",
              total_score: nextScore,
            });
          }
        }

        const { data: latestSessionRow } = await supabase
          .from("game_sessions")
          .select("game_state")
          .eq("id", session.id)
          .maybeSingle<{ game_state?: Record<string, unknown> | null }>();

        const baseState = (latestSessionRow?.game_state ??
          {}) as JusteChiffreStatePayload;
        const prevScoresObj = (baseState.scores ?? {}) as Record<string, unknown>;
        const prevPointsObj = (baseState.points ?? {}) as Record<string, unknown>;
        const nextScoresObj: Record<string, number> = {};

        for (const [k, v] of Object.entries(prevScoresObj)) {
          const num = toFiniteNumber(v);
          if (num !== null) nextScoresObj[k] = num;
        }
        for (const [pid, val] of currentMap.entries()) {
          nextScoresObj[pid] = val;
        }

        const botScoreUpdates = new Map<string, number>();
        for (const bw of botWinners) {
          const pts = awardedByPid[bw.pid] ?? 3;
          const prevBotScore =
            toFiniteNumber(nextScoresObj[bw.pid]) ??
            toFiniteNumber(bw.player.score) ??
            0;
          const nextBotScore = prevBotScore + pts;
          botScoreUpdates.set(bw.pid, nextBotScore);
          nextScoresObj[bw.pid] = nextBotScore;
        }

        const nextBots = Array.isArray(baseState.bots)
          ? baseState.bots.map((b) => {
              const bId = String(b.id);
              const updatedScore = botScoreUpdates.get(bId);
              return updatedScore !== undefined ? { ...b, score: updatedScore } : b;
            })
          : undefined;

        const nextGameState: JusteChiffreStatePayload = {
          ...baseState,
          scores: nextScoresObj,
          points: {
            ...prevPointsObj,
            ...nextScoresObj,
          },
          ...(nextBots ? { bots: nextBots } : {}),
        };

        const { error: stateErr } = await supabase
          .from("game_sessions")
          .update({ game_state: nextGameState })
          .eq("id", session.id);

        if (!stateErr) {
          setSession((prev) =>
            prev && prev.id === session.id
              ? { ...prev, game_state: nextGameState }
              : prev
          );
        }

        const { data: refreshed } = await supabase
          .from("player_scores")
          .select("*")
          .eq("session_id", session.id);
        if (refreshed && refreshed.length > 0) {
          setScoresRows(refreshed as PlayerScore[]);
        }
      } finally {
        isScoringRef.current = false;
      }
    })();
  }, [
    supabase,
    session?.id,
    sessionCode,
    phase,
    badgeAnimationDone,
    activeQuestionIndex,
    targetNumber,
    seriesNumber,
    estimatesKey,
  ]);

  // Affichage automatique du podium après la fin de la 15e question
  useEffect(() => {
    if (!isLastQuestionOfSeries || phase !== "revealed" || !badgeAnimationDone) {
      return;
    }

    const podiumTimer = window.setTimeout(() => {
      podiumLockedSeriesRef.current = seriesKey;
      setShowAutoPodium(true);
    }, PODIUM_DELAY_AFTER_LAST_QUESTION_MS);

    return () => {
      window.clearTimeout(podiumTimer);
    };
  }, [isLastQuestionOfSeries, phase, badgeAnimationDone, seriesKey]);

  useEffect(() => {
    if (!isSeriesCompleted) return;
    if (podiumConfettiRoundRef.current === seriesKey) return;
    podiumConfettiRoundRef.current = seriesKey;
    spawnConfetti(140);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSeriesCompleted, seriesKey]);

  const targetPercent =
    targetNumber !== null
      ? Math.max(0, Math.min(100, (targetNumber / MAX_VALUE) * 100))
      : null;

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

        @keyframes jcPodiumRise {
          0% { opacity: 0; transform: translateY(48px) scale(0.92); }
          70% { opacity: 1; transform: translateY(-6px) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
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

        .jc-podium-rise {
          animation: jcPodiumRise 0.65s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>

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

      <main className="flex-1 min-h-0 flex items-stretch gap-0 mt-3 overflow-hidden">
        <aside className="relative z-30 w-[280px] xl:w-[340px] shrink-0 bg-neutral-900 border border-white/15 rounded-l-3xl p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 pb-1.5 border-b border-white/10 shrink-0">
            <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
            <span className="text-xl xl:text-2xl font-black truncate">
              Classement
            </span>
          </div>

          <div className="flex-1 min-h-0 flex flex-col justify-center gap-1.5">
            {rankedPlayers.length === 0 ? (
              <div className="text-center text-neutral-400 text-base py-6">
                En attente des joueurs...
              </div>
            ) : (
              rankedPlayers.map(({ player, score, rank, isWinner }) => {
                const pColor = getUniquePlayerColor(player.id, players);

                return (
                  <div
                    key={player.id}
                    style={{
                      backgroundColor: pColor.bgHex,
                      color: pColor.textHex,
                    }}
                    className="h-12 rounded-xl border border-white/25 px-3 flex items-center justify-between gap-2 shadow-md transition"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        style={{ backgroundColor: pColor.badgeBgHex }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-sm shrink-0"
                      >
                        {rank}
                      </span>
                      <span className="font-black text-2xl xl:text-3xl truncate flex items-center gap-1.5 min-w-0">
                        {isWinner && (
                          <Crown className="w-5 h-5 text-amber-300 shrink-0" />
                        )}
                        <span className="truncate">{player.nickname}</span>
                      </span>
                    </div>

                    <span className="font-mono font-black text-xl xl:text-2xl shrink-0">
                      {score}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        <div className="relative flex-1 min-w-0 flex flex-col">
          {isSeriesCompleted ? (
            <section className="flex-1 min-h-0 bg-white/[0.03] border border-white/15 rounded-r-3xl p-8 flex flex-col items-center justify-between text-center gap-6 overflow-hidden">
              <div className="flex flex-col items-center gap-2 pt-2">
                <div className="w-16 h-16 rounded-2xl bg-amber-400/20 border-2 border-amber-400 flex items-center justify-center shadow-lg">
                  <Trophy className="w-9 h-9 text-amber-300" />
                </div>
                <div className="text-sm uppercase tracking-[0.22em] text-amber-300 font-extrabold">
                  Podium Final • {questions.length} questions
                </div>
                <h2 className="text-3xl xl:text-5xl font-black">
                  {topWinners.length > 0
                    ? `Victoire de ${topWinners
                        .map((w) => w.player.nickname)
                        .join(" et ")} !`
                    : "Partie terminée !"}
                </h2>
              </div>

              <div className="flex-1 w-full max-w-5xl flex items-end justify-center gap-4 xl:gap-8 pb-2">
                {podiumSteps.map((step, stepIdx) => {
                  const isTie = step.entries.length > 1;
                  const stepGlow =
                    step.rank === 1
                      ? "border-amber-300 bg-gradient-to-t from-amber-500/35 to-amber-300/15 shadow-[0_0_40px_rgba(251,191,36,0.28)]"
                      : step.rank === 2
                      ? "border-slate-300/70 bg-gradient-to-t from-slate-400/25 to-slate-200/10"
                      : "border-amber-700/80 bg-gradient-to-t from-amber-800/30 to-amber-600/10";

                  return (
                    <div
                      key={step.rank}
                      style={{ animationDelay: `${stepIdx * 140}ms` }}
                      className="flex-1 max-w-[300px] flex flex-col items-center justify-end gap-3 jc-podium-rise"
                    >
                      <div className="w-full flex flex-col items-center gap-2">
                        {step.entries.map((entry) => {
                          const pColor = getUniquePlayerColor(
                            entry.player.id,
                            players
                          );
                          return (
                            <div
                              key={entry.player.id}
                              style={{
                                backgroundColor: pColor.bgHex,
                                color: pColor.textHex,
                              }}
                              className="w-full px-4 py-2.5 rounded-2xl border-2 border-white/35 shadow-xl flex flex-col items-center gap-1"
                            >
                              <div className="flex items-center justify-center gap-1.5 max-w-full">
                                {step.rank === 1 && (
                                  <Crown className="w-5 h-5 text-amber-300 shrink-0" />
                                )}
                                <span className="font-black text-xl xl:text-2xl truncate">
                                  {entry.player.nickname}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-base xl:text-lg px-2.5 py-0.5 rounded-lg bg-black/35">
                                  {entry.score} pts
                                </span>
                                {isTie && (
                                  <span className="text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/40">
                                    Ex æquo
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div
                        className={`w-full ${step.heightClass} rounded-t-3xl border-2 border-b-0 ${stepGlow} flex flex-col items-center justify-center gap-1`}
                      >
                        <span className="font-mono font-black text-4xl xl:text-5xl text-white">
                          {step.label}
                        </span>
                        {isTie && (
                          <span className="text-xs uppercase tracking-widest font-bold text-white/80">
                            {step.entries.length} ex æquo
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : activeQuestionIndex === null || !currentQuestion ? (
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
            <section className="relative flex-1 min-h-0 bg-white/[0.03] border border-white/15 rounded-r-3xl flex flex-col justify-between py-3 px-0 overflow-hidden">
              {showTopQuestion && currentQuestion.question && (
                <div
                  aria-live="polite"
                  style={{
                    transition: `opacity ${POST_ZERO_FADE_MS}ms ease-out, transform ${POST_ZERO_FADE_MS}ms ease-out`,
                  }}
                  className={`pointer-events-none absolute top-12 left-4 right-4 z-40 rounded-2xl bg-neutral-900/95 border border-amber-400/50 px-5 py-3 shadow-2xl ${
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

              <div
                ref={targetTrackRef}
                className="relative flex-1 min-h-0 w-full flex flex-col justify-between"
              >
                <div className="relative h-10 shrink-0 mx-4 font-mono font-black text-2xl xl:text-3xl leading-none border-b border-white/15">
                  <span className="absolute left-0 top-1 text-white">1</span>
                  <span className="absolute left-1/2 -translate-x-1/2 top-1 text-amber-300">
                    500
                  </span>
                  <span className="absolute right-0 top-1 text-white">1000</span>
                </div>

                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-10 bottom-0 left-1/2 border-l-2 border-dashed border-white/25 z-0"
                />

                {targetLineVisible && targetPercent !== null && (
                  <div
                    style={{
                      left: `${targetLineExpanded ? targetPercent : 0}%`,
                      transition: `left ${targetMoveDurationMs}ms linear`,
                    }}
                    className="pointer-events-none absolute top-0 bottom-0 z-30 -translate-x-1/2 flex flex-col items-center"
                  >
                    <div className="h-10 flex items-center justify-center shrink-0">
                      <span className="px-3 py-0.5 rounded-lg bg-emerald-400 text-black font-mono text-3xl xl:text-4xl font-black leading-none shadow-lg whitespace-nowrap">
                        {targetCounterValue}
                      </span>
                    </div>
                    <div
                      className={`w-1.5 flex-1 bg-emerald-400 ${
                        laserImpactFlash
                          ? "shadow-[0_0_26px_#34d399,0_0_44px_#ffffff]"
                          : "shadow-[0_0_16px_rgba(52,211,153,0.95)]"
                      }`}
                    />
                  </div>
                )}

                <div className="relative z-10 flex-1 min-h-0 flex flex-col justify-center gap-1.5">
                  {rankedPlayers.map(({ player, guess, isWinner }) => {
                    const idStr = String(player.id);
                    const pColor = getUniquePlayerColor(player.id, players);
                    const hasAnswered = guess !== null;
                    const widthPercent =
                      barsExpanded && hasAnswered
                        ? Math.max(0, Math.min(100, (guess / MAX_VALUE) * 100))
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
                    const isExactBadge =
                      phase === "revealed" && Boolean(exactPlayersByRound[idStr]);

                    const transitionStyle = `width ${barDurationMs}ms cubic-bezier(0.34, 1.42, 0.64, 1)`;

                    return (
                      <div
                        key={player.id}
                        className="relative h-12 flex items-center"
                      >
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
                          className={`relative h-10 rounded-r-2xl border border-l-0 border-white/25 flex items-center justify-end pr-2.5 overflow-hidden jc-glass-shine ${
                            isWinner && phase === "revealed"
                              ? "jc-winner-neon"
                              : isLoser
                              ? "jc-loser-smoke"
                              : ""
                          }`}
                        >
                          {shouldReveal && hasAnswered && (
                            <span
                              className={`relative z-10 px-2 py-0.5 rounded-lg font-mono text-lg xl:text-xl font-black leading-none shadow-md shrink-0 ${
                                isWinner && phase === "revealed"
                                  ? "bg-amber-300 text-black"
                                  : "bg-neutral-900/95 text-white border border-white/25"
                              }`}
                            >
                              {counterValue}
                            </span>
                          )}
                        </div>

                        {isExactBadge && (
                          <span
                            style={{
                              left: `${Math.min(88, Math.max(4, (guess ?? 0) / 10))}%`,
                            }}
                            className="pointer-events-none absolute -top-3 z-40 px-2.5 py-0.5 rounded-full bg-emerald-400 text-black font-mono text-xs xl:text-sm font-black uppercase tracking-wider shadow-lg border border-white/50 animate-bounce"
                          >
                            Exact !
                          </span>
                        )}

                        {launchFlyBadges && wonPts !== undefined && (
                          <span
                            style={{
                              left: `${Math.min(92, Math.max(6, (guess ?? 0) / 10))}%`,
                            }}
                            className="pointer-events-none absolute -top-2 z-40 px-2.5 py-0.5 rounded-full bg-amber-300 text-black font-mono text-sm xl:text-base font-black shadow-lg jc-fly-points"
                          >
                            +{wonPts} pts
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
