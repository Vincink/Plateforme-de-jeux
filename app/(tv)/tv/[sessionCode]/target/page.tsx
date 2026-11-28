"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Award,
  Crown,
  Flame,
  Medal,
  Swords,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getUniquePlayerColor } from "@/lib/colorsplayer";
import type { GameSession, PlayerScore, SessionPlayer } from "@/types/game.types";

interface BlitzCursorPayload {
  playerId: string;
  playerName: string;
  color: string;
  x: number;
  y: number;
}

interface BlitzShootPayload extends BlitzCursorPayload {
  timestamp?: number;
}

interface BlitzTarget {
  id: string;
  x: number;
  y: number;
  radiusPct: number;
  kind: "target" | "bonus" | "bomb" | "heavy" | "rapid";
  points: number;
  hp: number;
  maxHp: number;
  vx: number;
  vy: number;
  gravity: number;
  canSplit: boolean;
  hueColor: string;
  fusePhase: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

interface FloatingScoreText {
  x: number;
  y: number;
  vy: number;
  label: string;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

interface ShotTrail {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

interface ShockwaveRing {
  x: number;
  y: number;
  radiusPct: number;
  maxRadiusPct: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

interface BackgroundStar {
  x: number;
  y: number;
  size: number;
  speed: number;
  alpha: number;
}

type BlitzBotLevel = "cool" | "normal" | "expert";

interface BlitzBotConfig {
  id: string;
  nickname: string;
  avatar?: string;
  botLevel?: BlitzBotLevel;
  score?: number;
}

type BlitzSessionPlayer = SessionPlayer & {
  isBot?: boolean;
  botLevel?: BlitzBotLevel;
};

interface BlitzGameState {
  mode?: string;
  bots?: BlitzBotConfig[];
  roundNumber?: number;
  totalRounds?: number;
  roundTriggered?: boolean;
  questionStarted?: boolean;
  isSuddenDeath?: boolean;
  suddenDeathPlayerIds?: string[];
  roundWins?: Record<string, number>;
  questionStartedAt?: string | number | null;
  durationSeconds?: number | null;
  isPaused?: boolean;
  pausedRemainingSeconds?: number | null;
  [key: string]: unknown;
}

type ExtendedGameSession = GameSession & {
  game_state?: BlitzGameState | null;
};

interface SvgSpriteAssets {
  targetImg: HTMLImageElement | null;
  bonusImg: HTMLImageElement | null;
  bombImg: HTMLImageElement | null;
  rapidImg: HTMLImageElement | null;
  heavyImg: HTMLImageElement | null;
  heavySvgText: string | null;
  heavyStageCache: Record<number, HTMLImageElement>;
  crosshairSvgText: string | null;
  tintedCrosshairCache: Record<string, HTMLImageElement>;
}

const ROUND_DURATION_SECONDS = 60;
const COUNTDOWN_SECONDS = 3;
const ROUND_WINNER_DELAY_MS = 2000;
const DEFAULT_TOTAL_ROUNDS = 5;
const MAX_SPAWNED_TARGETS = 11;
const RAPID_FIRE_DURATION_MS = 7000;
const RUSH_THRESHOLD_SECONDS = 10;
const TARGET_COLORS = ["#22d3ee", "#4ade80", "#fb923c", "#f472b6", "#a78bfa"];

const BOT_BLITZ_CONFIG: Record<
  BlitzBotLevel,
  { speedPctPerSec: number; minCooldownSec: number; maxCooldownSec: number; jitterPct: number }
> = {
  cool: { speedPctPerSec: 26, minCooldownSec: 1.0, maxCooldownSec: 1.8, jitterPct: 4.2 },
  normal: { speedPctPerSec: 36, minCooldownSec: 0.7, maxCooldownSec: 1.4, jitterPct: 3.0 },
  expert: { speedPctPerSec: 48, minCooldownSec: 0.45, maxCooldownSec: 0.95, jitterPct: 1.8 },
};

function isBotPlayer(player: BlitzSessionPlayer): boolean {
  if (player.isBot === true) return true;
  const rec = player as unknown as {
    is_bot?: boolean;
    player_token?: string | null;
  };
  if (rec.is_bot === true) return true;
  const token = String(rec.player_token ?? "").toLowerCase();
  if (token.startsWith("bot-") || token.startsWith("bot_")) return true;
  return String(player.nickname ?? "").trim().toUpperCase().startsWith("[BOT]");
}

function getComboMultiplier(streak: number): number {
  if (streak >= 10) return 4;
  if (streak >= 6) return 3;
  if (streak >= 3) return 2;
  return 1;
}

function createTopDownTarget(index: number): BlitzTarget {
  const roll = Math.random();
  const baseId = `${Date.now()}-top-${index}-${Math.random().toString(36).slice(2, 6)}`;
  const startX = 12 + Math.random() * 76;
  const startY = -6 - Math.random() * 10;
  const horizontalSpeed =
    (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 14);

  if (roll < 0.2) {
    return {
      id: `bomb-${baseId}`,
      x: startX,
      y: startY,
      radiusPct: 4.3,
      kind: "bomb",
      points: -5,
      hp: 1,
      maxHp: 1,
      vx: horizontalSpeed,
      vy: 12 + Math.random() * 9,
      gravity: 0,
      canSplit: false,
      hueColor: "#f43f5e",
      fusePhase: Math.random() * Math.PI * 2,
    };
  }

  if (roll < 0.34) {
    return {
      id: `bonus-${baseId}`,
      x: startX,
      y: startY,
      radiusPct: 4.0,
      kind: "bonus",
      points: 10,
      hp: 1,
      maxHp: 1,
      vx: horizontalSpeed * 1.25,
      vy: 23 + Math.random() * 13,
      gravity: 0,
      canSplit: false,
      hueColor: "#fbbf24",
      fusePhase: Math.random() * Math.PI * 2,
    };
  }

  if (roll < 0.44) {
    return {
      id: `rapid-${baseId}`,
      x: startX,
      y: startY,
      radiusPct: 4.1,
      kind: "rapid",
      points: 5,
      hp: 1,
      maxHp: 1,
      vx: horizontalSpeed * 1.15,
      vy: 20 + Math.random() * 11,
      gravity: 0,
      canSplit: false,
      hueColor: "#fde047",
      fusePhase: Math.random() * Math.PI * 2,
    };
  }

  if (roll < 0.55) {
    return {
      id: `heavy-${baseId}`,
      x: startX,
      y: startY,
      radiusPct: 6.0,
      kind: "heavy",
      points: 1,
      hp: 10,
      maxHp: 10,
      vx: horizontalSpeed * 0.65,
      vy: 7.5 + Math.random() * 5,
      gravity: 0,
      canSplit: false,
      hueColor: "#38bdf8",
      fusePhase: Math.random() * Math.PI * 2,
    };
  }

  const paletteColor =
    TARGET_COLORS[Math.floor(Math.random() * TARGET_COLORS.length)] ?? "#4ade80";

  return {
    id: `target-${baseId}`,
    x: startX,
    y: startY,
    radiusPct: 5.0,
    kind: "target",
    points: 5,
    hp: 1,
    maxHp: 1,
    vx: horizontalSpeed,
    vy: 11 + Math.random() * 11,
    gravity: 0,
    canSplit: true,
    hueColor: paletteColor,
    fusePhase: Math.random() * Math.PI * 2,
  };
}

function createFruitNinjaLaunchTarget(index: number): BlitzTarget {
  const roll = Math.random();
  const baseId = `${Date.now()}-fn-${index}-${Math.random().toString(36).slice(2, 6)}`;
  const startX = 18 + Math.random() * 64;
  const startY = 104 + Math.random() * 6;
  const centerBias = startX < 50 ? 1 : -1;
  const horizontalSpeed =
    centerBias * (6 + Math.random() * 14) + (Math.random() - 0.5) * 8;
  const upwardImpulse = -(66 + Math.random() * 24);
  const gravity = 46 + Math.random() * 10;

  if (roll < 0.19) {
    return {
      id: `bomb-${baseId}`,
      x: startX,
      y: startY,
      radiusPct: 4.3,
      kind: "bomb",
      points: -5,
      hp: 1,
      maxHp: 1,
      vx: horizontalSpeed,
      vy: upwardImpulse,
      gravity,
      canSplit: false,
      hueColor: "#f43f5e",
      fusePhase: Math.random() * Math.PI * 2,
    };
  }

  if (roll < 0.33) {
    return {
      id: `bonus-${baseId}`,
      x: startX,
      y: startY,
      radiusPct: 4.0,
      kind: "bonus",
      points: 10,
      hp: 1,
      maxHp: 1,
      vx: horizontalSpeed * 1.2,
      vy: upwardImpulse * 1.12,
      gravity,
      canSplit: false,
      hueColor: "#fbbf24",
      fusePhase: Math.random() * Math.PI * 2,
    };
  }

  if (roll < 0.43) {
    return {
      id: `rapid-${baseId}`,
      x: startX,
      y: startY,
      radiusPct: 4.1,
      kind: "rapid",
      points: 5,
      hp: 1,
      maxHp: 1,
      vx: horizontalSpeed * 1.15,
      vy: upwardImpulse * 1.08,
      gravity,
      canSplit: false,
      hueColor: "#fde047",
      fusePhase: Math.random() * Math.PI * 2,
    };
  }

  if (roll < 0.53) {
    return {
      id: `heavy-${baseId}`,
      x: startX,
      y: startY,
      radiusPct: 6.0,
      kind: "heavy",
      points: 1,
      hp: 10,
      maxHp: 10,
      vx: horizontalSpeed * 0.85,
      vy: upwardImpulse * 0.96,
      gravity: gravity * 0.85,
      canSplit: false,
      hueColor: "#38bdf8",
      fusePhase: Math.random() * Math.PI * 2,
    };
  }

  const paletteColor =
    TARGET_COLORS[Math.floor(Math.random() * TARGET_COLORS.length)] ?? "#4ade80";

  return {
    id: `target-${baseId}`,
    x: startX,
    y: startY,
    radiusPct: 5.0,
    kind: "target",
    points: 5,
    hp: 1,
    maxHp: 1,
    vx: horizontalSpeed,
    vy: upwardImpulse,
    gravity,
    canSplit: true,
    hueColor: paletteColor,
    fusePhase: Math.random() * Math.PI * 2,
  };
}

function createSpawnTarget(index: number): BlitzTarget {
  return Math.random() < 0.5
    ? createTopDownTarget(index)
    : createFruitNinjaLaunchTarget(index);
}

function createSplitMiniTarget(
  parent: BlitzTarget,
  sideSign: -1 | 1,
  subIndex: number
): BlitzTarget {
  const miniId = `${Date.now()}-mini-${subIndex}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const hasGravity = parent.gravity > 0;
  return {
    id: `mini-${miniId}`,
    x: Math.max(10, Math.min(90, parent.x + sideSign * 2.2)),
    y: parent.y,
    radiusPct: Math.max(2.6, parent.radiusPct * 0.62),
    kind: "target",
    points: 5,
    hp: 1,
    maxHp: 1,
    vx: sideSign * (14 + Math.random() * 14),
    vy: hasGravity ? -(28 + Math.random() * 18) : 14 + Math.random() * 10,
    gravity: parent.gravity,
    canSplit: false,
    hueColor: parent.hueColor,
    fusePhase: Math.random() * Math.PI * 2,
  };
}

function extractScoreValue(row: PlayerScore | undefined): number {
  if (!row) return 0;
  const rec = row as unknown as { total_score?: number; score?: number };
  const val = rec.total_score ?? rec.score ?? 0;
  return typeof val === "number" && Number.isFinite(val) ? Math.max(0, val) : 0;
}

function formatClock(seconds: number): string {
  const clamped = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function loadSvgImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function colorizeSvgWhite(svgText: string, hexColor: string): string {
  return svgText
    .replace(/fill\s*=\s*["']#fff(?:fff)?["']/gi, `fill="${hexColor}"`)
    .replace(/fill\s*=\s*["']white["']/gi, `fill="${hexColor}"`)
    .replace(/stroke\s*=\s*["']#fff(?:fff)?["']/gi, `stroke="${hexColor}"`)
    .replace(/stroke\s*=\s*["']white["']/gi, `stroke="${hexColor}"`)
    .replace(/fill\s*:\s*#fff(?:fff)?/gi, `fill:${hexColor}`)
    .replace(/fill\s*:\s*white/gi, `fill:${hexColor}`)
    .replace(/stroke\s*:\s*#fff(?:fff)?/gi, `stroke:${hexColor}`)
    .replace(/stroke\s*:\s*white/gi, `stroke:${hexColor}`);
}

function buildHeavyTargetSvgWithLitSegments(
  svgText: string,
  hitsDone: number
): string {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return svgText;
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const svgEl = doc.documentElement;
    if (!svgEl || svgEl.nodeName.toLowerCase() === "parsererror") {
      return svgText;
    }

    const candidates = Array.from(
      svgEl.querySelectorAll("[id*='segment' i], [id*='seg' i]")
    );

    const ordered =
      candidates.length >= 10
        ? candidates
            .slice(0, 10)
            .sort((a, b) => {
              const numA = parseInt(a.id.replace(/\D+/g, ""), 10);
              const numB = parseInt(b.id.replace(/\D+/g, ""), 10);
              if (Number.isFinite(numA) && Number.isFinite(numB)) {
                return numA - numB;
              }
              return a.id.localeCompare(b.id);
            })
        : Array.from(
            svgEl.querySelectorAll(
              "[fill='#fff'], [fill='#ffffff'], [fill='#FFF'], [fill='#FFFFFF'], [fill='white'], [style*='#fff'], [style*='#ffffff'], [style*='white']"
            )
          ).slice(0, 10);

    ordered.forEach((el, idx) => {
      if (idx < hitsDone) {
        el.setAttribute("fill", "#22c55e");
        const styleAttr = el.getAttribute("style");
        if (styleAttr) {
          el.setAttribute(
            "style",
            styleAttr.replace(/fill\s*:[^;]+/gi, "fill:#22c55e")
          );
        }
      }
    });

    return new XMLSerializer().serializeToString(svgEl);
  } catch {
    return svgText;
  }
}

export default function TargetBlitzGamePage() {
  const params = useParams<{ sessionCode?: string; code?: string }>();
  const router = useRouter();
  const rawCode = params?.sessionCode ?? params?.code ?? "";
  const sessionCode = String(rawCode).toUpperCase();
  const supabase = getSupabaseBrowserClient();

  const [session, setSession] = useState<ExtendedGameSession | null>(null);
  const [humanPlayers, setHumanPlayers] = useState<BlitzSessionPlayer[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [roundWins, setRoundWins] = useState<Record<string, number>>({});
  const [suddenDeathPlayerIds, setSuddenDeathPlayerIds] = useState<string[]>([]);
  const [roundNumber, setRoundNumber] = useState<number>(1);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [isRoundRunning, setIsRoundRunning] = useState<boolean>(false);
  const [roundEnded, setRoundEnded] = useState<boolean>(false);
  const [isWinnerBannerVisible, setIsWinnerBannerVisible] =
    useState<boolean>(false);
  const [isMatchPodiumVisible, setIsMatchPodiumVisible] =
    useState<boolean>(false);
  const [lastRoundWinnerLabel, setLastRoundWinnerLabel] = useState<string | null>(
    null
  );
  const [remainingSeconds, setRemainingSeconds] = useState<number>(
    ROUND_DURATION_SECONDS
  );
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [rapidFireUntilByPlayer, setRapidFireUntilByPlayer] = useState<
    Record<string, number>
  >({});
  const [comboByPlayer, setComboByPlayer] = useState<Record<string, number>>(
    {}
  );

  const blitzState = session?.game_state ?? {};

  const players = useMemo<BlitzSessionPlayer[]>(() => {
    const stateBots = Array.isArray(blitzState.bots) ? blitzState.bots : [];
    const botPlayers: BlitzSessionPlayer[] = stateBots
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
          }) as BlitzSessionPlayer
      );

    const existingIds = new Set(humanPlayers.map((p) => String(p.id)));
    const uniqueBots = botPlayers.filter((bp) => !existingIds.has(String(bp.id)));
    return [...humanPlayers, ...uniqueBots];
  }, [humanPlayers, blitzState.bots, session?.id, sessionCode]);

  const soundEnabledRef = useRef<boolean>(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const audioCtxRef = useRef<AudioContext | null>(null);

  const ensureAudioContext = useCallback((): AudioContext | null => {
    if (!soundEnabledRef.current || typeof window === "undefined") return null;

    let ctx = audioCtxRef.current;
    if (!ctx || ctx.state === "closed") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        ctx = new AudioCtx();
        audioCtxRef.current = ctx;
      } catch {
        return null;
      }
    }

    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }

    return ctx;
  }, []);

  useEffect(() => {
    return () => {
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx && ctx.state !== "closed") {
        void ctx.close().catch(() => {});
      }
    };
  }, []);

  const playCountdownBeep = useCallback(
    (isFinalGo: boolean) => {
      const ctx = ensureAudioContext();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = isFinalGo ? "triangle" : "sine";
        osc.frequency.setValueAtTime(isFinalGo ? 880 : 520, now);
        if (isFinalGo) {
          osc.frequency.exponentialRampToValueAtTime(1174, now + 0.18);
        }
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(isFinalGo ? 0.28 : 0.18, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          now + (isFinalGo ? 0.24 : 0.14)
        );
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + (isFinalGo ? 0.25 : 0.15));
      } catch {
        // Ignore audio errors
      }
    },
    [ensureAudioContext]
  );

  const playShotSound = useCallback(() => {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.065);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.075);
    } catch {
      // Ignore audio errors
    }
  }, [ensureAudioContext]);

  const playTargetHitSound = useCallback(
    (didSplit: boolean) => {
      const ctx = ensureAudioContext();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(
          didSplit ? 920 : 720,
          now + 0.11
        );
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);

        if (didSplit) {
          const pop = ctx.createOscillator();
          const popGain = ctx.createGain();
          pop.type = "sine";
          pop.frequency.setValueAtTime(640, now + 0.05);
          pop.frequency.exponentialRampToValueAtTime(1040, now + 0.14);
          popGain.gain.setValueAtTime(0.14, now + 0.05);
          popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
          pop.connect(popGain);
          popGain.connect(ctx.destination);
          pop.start(now + 0.05);
          pop.stop(now + 0.16);
        }
      } catch {
        // Ignore audio errors
      }
    },
    [ensureAudioContext]
  );

  const playArmorHitSound = useCallback(
    (hitsDone: number) => {
      const ctx = ensureAudioContext();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(280 + hitsDone * 55, now);
        osc.frequency.exponentialRampToValueAtTime(
          420 + hitsDone * 70,
          now + 0.08
        );
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
      } catch {
        // Ignore audio errors
      }
    },
    [ensureAudioContext]
  );

  const playBonusHitSound = useCallback(() => {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const notes = [587.33, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const start = now + idx * 0.045;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.2, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.15);
      });
    } catch {
      // Ignore audio errors
    }
  }, [ensureAudioContext]);

  const playBombExplosionSound = useCallback(() => {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const duration = 0.34;
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const t = i / bufferSize;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.8);
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(420, now);
      filter.frequency.exponentialRampToValueAtTime(75, now + duration);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.36, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
    } catch {
      // Ignore audio errors
    }
  }, [ensureAudioContext]);

  const playRoundEndSound = useCallback(() => {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const freqs = [523.25, 392.0];
      freqs.forEach((f, idx) => {
        const t0 = now + idx * 0.16;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(f, t0);
        gain.gain.setValueAtTime(0.2, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.24);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.25);
      });
    } catch {
      // Ignore audio errors
    }
  }, [ensureAudioContext]);

  const playApplauseSound = useCallback(() => {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    try {
      const totalDuration = 2.6;
      const sampleRate = ctx.sampleRate;
      const bufferSize = Math.floor(sampleRate * totalDuration);
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        const t = i / sampleRate;
        const env =
          Math.sin(Math.min(1, t / 0.25) * (Math.PI / 2)) *
          Math.pow(Math.max(0, 1 - t / totalDuration), 1.35);
        const clapBurst = Math.pow(
          0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 11),
          3
        );
        const white = Math.random() * 2 - 1;
        data[i] = white * env * (0.35 + 0.65 * clapBurst);
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.value = 1650;
      bandpass.Q.value = 0.7;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.01, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.45, ctx.currentTime + 0.2);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + totalDuration
      );

      source.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    } catch {
      // Ignore audio errors
    }
  }, [ensureAudioContext]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<ReturnType<
    NonNullable<typeof supabase>["channel"]
  > | null>(null);

  const spritesRef = useRef<SvgSpriteAssets>({
    targetImg: null,
    bonusImg: null,
    bombImg: null,
    rapidImg: null,
    heavyImg: null,
    heavySvgText: null,
    heavyStageCache: {},
    crosshairSvgText: null,
    tintedCrosshairCache: {},
  });

  const targetsRef = useRef<BlitzTarget[]>([]);
  const spawnAccumulatorRef = useRef<number>(0);
  const cursorsRef = useRef<Record<string, BlitzCursorPayload>>({});
  const rapidFireUntilRef = useRef<Record<string, number>>({});
  const comboStreakRef = useRef<Record<string, number>>({});
  const shotTrailsRef = useRef<ShotTrail[]>([]);
  const shockwavesRef = useRef<ShockwaveRing[]>([]);
  const botRuntimeRef = useRef<
    Record<
      string,
      {
        x: number;
        y: number;
        targetId: string | null;
        cooldownSec: number;
        stunnedUntilMs: number;
      }
    >
  >({});
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingScoreText[]>([]);
  const starsRef = useRef<BackgroundStar[]>(
    Array.from({ length: 65 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 2.4,
      speed: 3 + Math.random() * 6,
      alpha: 0.35 + Math.random() * 0.65,
    }))
  );

  const scoresRef = useRef<Record<string, number>>(scores);
  scoresRef.current = scores;
  const sessionRef = useRef<ExtendedGameSession | null>(session);
  sessionRef.current = session;
  const playersRef = useRef<BlitzSessionPlayer[]>(players);
  playersRef.current = players;
  const roundWinsRef = useRef<Record<string, number>>(roundWins);
  roundWinsRef.current = roundWins;
  const suddenDeathIdsRef = useRef<string[]>(suddenDeathPlayerIds);
  suddenDeathIdsRef.current = suddenDeathPlayerIds;
  const roundNumberRef = useRef<number>(roundNumber);
  roundNumberRef.current = roundNumber;
  const remainingSecondsRef = useRef<number>(remainingSeconds);
  remainingSecondsRef.current = remainingSeconds;
  const hasPlayedApplauseRef = useRef<boolean>(false);

  const roundStatus = session?.status ?? "lobby";
  const statusLower = String(roundStatus).toLowerCase();
  const isPaused = statusLower === "paused" || Boolean(blitzState.isPaused);
  const isCountingDown = countdownValue !== null && countdownValue > 0;
  const isActivePlay =
    isRoundRunning && !isCountingDown && !roundEnded && !isPaused;
  const isFinalRush =
    isActivePlay &&
    remainingSeconds > 0 &&
    remainingSeconds <= RUSH_THRESHOLD_SECONDS;

  const isRoundRunningRef = useRef<boolean>(isRoundRunning);
  isRoundRunningRef.current = isRoundRunning;
  const roundEndedRef = useRef<boolean>(roundEnded);
  roundEndedRef.current = roundEnded;
  const isPausedRef = useRef<boolean>(isPaused);
  isPausedRef.current = isPaused;
  const isActivePlayRef = useRef<boolean>(isActivePlay);
  isActivePlayRef.current = isActivePlay;
  const isFinalRushRef = useRef<boolean>(isFinalRush);
  isFinalRushRef.current = isFinalRush;

  const totalRounds = useMemo(() => {
    const raw = Number(blitzState.totalRounds);
    return Number.isFinite(raw) && raw > 0
      ? Math.round(raw)
      : DEFAULT_TOTAL_ROUNDS;
  }, [blitzState.totalRounds]);

  const isSuddenDeath = useMemo(() => {
    return Boolean(blitzState.isSuddenDeath) || suddenDeathPlayerIds.length > 0;
  }, [blitzState.isSuddenDeath, suddenDeathPlayerIds]);

  const roundStartMsRef = useRef<number | null>(null);
  const seenTriggerTokenRef = useRef<string | null>(null);
  const finalizedRoundNumberRef = useRef<number | null>(null);
  const ignoreNextScoreFetchRef = useRef<boolean>(false);

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (next) {
        soundEnabledRef.current = true;
        playCountdownBeep(false);
      }
      return next;
    });
  }, [playCountdownBeep]);

  useEffect(() => {
    let active = true;

    const loadAllAssets = async () => {
      const [
        targetImg,
        bonusImg,
        bombImg,
        rapidImg,
        heavyImg,
        heavySvgRes,
        crosshairRes,
      ] = await Promise.all([
        loadSvgImage("/cible.svg"),
        loadSvgImage("/cible_Bonus.svg"),
        loadSvgImage("/Bombes.svg"),
        loadSvgImage("/bonus_tir.svg"),
        loadSvgImage("/cible_10.svg"),
        fetch("/cible_10.svg")
          .then((r) => (r.ok ? r.text() : null))
          .catch(() => null),
        fetch("/viseur.svg")
          .then((r) => (r.ok ? r.text() : null))
          .catch(() => null),
      ]);

      if (!active) return;

      spritesRef.current.targetImg = targetImg;
      spritesRef.current.bonusImg = bonusImg;
      spritesRef.current.bombImg = bombImg;
      spritesRef.current.rapidImg = rapidImg;
      spritesRef.current.heavyImg = heavyImg;
      spritesRef.current.heavySvgText = heavySvgRes;
      spritesRef.current.heavyStageCache = {};
      spritesRef.current.crosshairSvgText = crosshairRes;
      spritesRef.current.tintedCrosshairCache = {};
    };

    void loadAllAssets();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    if (
      statusLower === "finished" ||
      statusLower === "ended" ||
      statusLower === "completed"
    ) {
      const targetCode = (session.code || sessionCode || "").toUpperCase();
      router.replace(targetCode ? `/tv/${targetCode}` : "/tv");
    }
  }, [session, sessionCode, statusLower, router]);

  const resetRoundScores = useCallback(async () => {
    ignoreNextScoreFetchRef.current = true;
    const zeroMap: Record<string, number> = {};
    for (const p of playersRef.current) {
      zeroMap[p.id] = 0;
    }
    setScores(zeroMap);
    scoresRef.current = zeroMap;

    const humanOnly = playersRef.current.filter((p) => !isBotPlayer(p));
    const currentSession = sessionRef.current;
    if (!supabase || !currentSession?.id || humanOnly.length === 0) {
      return;
    }

    const rows = humanOnly.map((p) => ({
      session_id: currentSession.id,
      player_id: p.id,
      total_score: 0,
    }));

    await supabase
      .from("player_scores")
      .upsert(rows, { onConflict: "session_id,player_id" });
  }, [supabase]);

  const startCountdownAndRound = useCallback(
    async (targetRoundNum: number) => {
      setRoundNumber(targetRoundNum);
      roundNumberRef.current = targetRoundNum;
      finalizedRoundNumberRef.current = null;
      hasPlayedApplauseRef.current = false;
      roundStartMsRef.current = null;
      setRemainingSeconds(ROUND_DURATION_SECONDS);
      setIsRoundRunning(true);
      setRoundEnded(false);
      setIsWinnerBannerVisible(false);
      setIsMatchPodiumVisible(false);
      setLastRoundWinnerLabel(null);
      setCountdownValue(COUNTDOWN_SECONDS);
      targetsRef.current = [];
      spawnAccumulatorRef.current = 0;
      particlesRef.current = [];
      floatingTextsRef.current = [];
      shotTrailsRef.current = [];
      shockwavesRef.current = [];
      botRuntimeRef.current = {};
      rapidFireUntilRef.current = {};
      comboStreakRef.current = {};
      setRapidFireUntilByPlayer({});
      setComboByPlayer({});

      await resetRoundScores();
    },
    [resetRoundScores]
  );

  useEffect(() => {
    if (countdownValue === null) return;

    if (countdownValue <= 0) {
      playCountdownBeep(true);
      setCountdownValue(null);
      roundStartMsRef.current = Date.now();
      setRemainingSeconds(ROUND_DURATION_SECONDS);
      targetsRef.current = [
        createTopDownTarget(0),
        createTopDownTarget(1),
        createFruitNinjaLaunchTarget(2),
        createFruitNinjaLaunchTarget(3),
      ];
      return;
    }

    playCountdownBeep(false);
    const timer = window.setTimeout(() => {
      setCountdownValue((prev) => (prev === null ? null : prev - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdownValue, playCountdownBeep]);

  useEffect(() => {
    if (!session?.id) return;

    const explicitTrigger =
      blitzState.roundTriggered === true || blitzState.questionStarted === true;
    const startedAtStr = blitzState.questionStartedAt
      ? String(blitzState.questionStartedAt)
      : "";

    const stateWins = blitzState.roundWins;
    if (stateWins && typeof stateWins === "object") {
      const cleaned: Record<string, number> = {};
      for (const [k, v] of Object.entries(stateWins)) {
        if (typeof v === "number" && Number.isFinite(v)) {
          cleaned[k] = Math.max(0, Math.round(v));
        }
      }
      setRoundWins(cleaned);
      roundWinsRef.current = cleaned;
    }

    if (Array.isArray(blitzState.suddenDeathPlayerIds)) {
      const ids = blitzState.suddenDeathPlayerIds.map(String);
      setSuddenDeathPlayerIds(ids);
      suddenDeathIdsRef.current = ids;
    }

    const triggerToken =
      explicitTrigger || startedAtStr
        ? `${startedAtStr}|${blitzState.roundTriggered ? "1" : "0"}|${
            blitzState.questionStarted ? "1" : "0"
          }`
        : "";

    if (seenTriggerTokenRef.current === null) {
      seenTriggerTokenRef.current = triggerToken;
      if (explicitTrigger) {
        void startCountdownAndRound(roundNumberRef.current);
      } else {
        setIsRoundRunning(false);
        setRoundEnded(false);
        setIsWinnerBannerVisible(false);
        setIsMatchPodiumVisible(false);
        setCountdownValue(null);
        setRemainingSeconds(ROUND_DURATION_SECONDS);
        targetsRef.current = [];
      }
      return;
    }

    if (triggerToken && triggerToken !== seenTriggerTokenRef.current) {
      seenTriggerTokenRef.current = triggerToken;
      const nextRound = roundEndedRef.current
        ? roundNumberRef.current + 1
        : roundNumberRef.current;
      void startCountdownAndRound(nextRound);
    }
  }, [
    session?.id,
    blitzState.roundTriggered,
    blitzState.questionStarted,
    blitzState.questionStartedAt,
    blitzState.roundWins,
    blitzState.suddenDeathPlayerIds,
    startCountdownAndRound,
  ]);

  useEffect(() => {
    if (!roundEnded) {
      setIsWinnerBannerVisible(false);
      setIsMatchPodiumVisible(false);
      return;
    }

    const isMatchOver = roundNumber >= totalRounds && !isSuddenDeath;
    const timerId = window.setTimeout(() => {
      setIsWinnerBannerVisible(true);
      if (isMatchOver) {
        setIsMatchPodiumVisible(true);
        if (!hasPlayedApplauseRef.current) {
          hasPlayedApplauseRef.current = true;
          playApplauseSound();
        }
      }
    }, ROUND_WINNER_DELAY_MS);

    return () => window.clearTimeout(timerId);
  }, [roundEnded, roundNumber, totalRounds, isSuddenDeath, playApplauseSound]);

  const spawnBurst = useCallback(
    (xPct: number, yPct: number, color: string, count = 22) => {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
        const speed = 40 + Math.random() * 170;
        particlesRef.current.push({
          x: xPct,
          y: yPct,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 2 + Math.random() * 3.8,
          color,
          alpha: 1,
          life: 0,
          maxLife: 0.45 + Math.random() * 0.35,
        });
      }
    },
    []
  );

  const spawnFloatingLabel = useCallback(
    (xPct: number, yPct: number, label: string, color: string) => {
      floatingTextsRef.current.push({
        x: xPct,
        y: yPct,
        vy: -22,
        label,
        color,
        alpha: 1,
        life: 0,
        maxLife: 0.9,
      });
    },
    []
  );

  const persistScoreToDb = useCallback(
    async (playerId: string, nextScore: number) => {
      const playerObj = playersRef.current.find((p) => p.id === playerId);
      if (playerObj && isBotPlayer(playerObj)) return;

      const currentSession = sessionRef.current;
      if (!supabase || !currentSession?.id) return;

      await supabase.from("player_scores").upsert(
        {
          session_id: currentSession.id,
          player_id: playerId,
          total_score: nextScore,
        },
        { onConflict: "session_id,player_id" }
      );
    },
    [supabase]
  );

  const handleShootPayload = useCallback(
    (shot: BlitzShootPayload) => {
      if (!isActivePlayRef.current) return;

      if (
        suddenDeathIdsRef.current.length > 0 &&
        !suddenDeathIdsRef.current.includes(shot.playerId)
      ) {
        return;
      }

      const resolvedColor =
        shot.color ||
        getUniquePlayerColor(shot.playerId, playersRef.current).borderHex ||
        "#22d3ee";

      const playerIdx = Math.max(
        0,
        playersRef.current.findIndex((p) => p.id === shot.playerId)
      );
      const totalPlayers = Math.max(1, playersRef.current.length);
      const originX = 16 + ((playerIdx + 0.5) / totalPlayers) * 68;
      shotTrailsRef.current.push({
        startX: originX,
        startY: 94,
        endX: shot.x,
        endY: shot.y,
        color: resolvedColor,
        alpha: 0.95,
        life: 0,
        maxLife: 0.22,
      });

      playShotSound();
      spawnBurst(shot.x, shot.y, resolvedColor, 10);

      const hitIndex = targetsRef.current.findIndex((t) => {
        const dx = t.x - shot.x;
        const dy = (t.y - shot.y) * 0.72;
        return Math.hypot(dx, dy) <= t.radiusPct + 2.4;
      });

      if (hitIndex === -1) {
        if ((comboStreakRef.current[shot.playerId] ?? 0) > 0) {
          comboStreakRef.current[shot.playerId] = 0;
          setComboByPlayer((prev) =>
            prev[shot.playerId] ? { ...prev, [shot.playerId]: 0 } : prev
          );
        }
        return;
      }

      const hitTarget = targetsRef.current[hitIndex];
      if (!hitTarget) return;

      if (hitTarget.kind === "bomb") {
        const nextTargets = [...targetsRef.current];
        nextTargets.splice(hitIndex, 1);

        // Onde de choc qui repousse les cibles voisines
        for (const other of nextTargets) {
          const dx = other.x - hitTarget.x;
          const dy = other.y - hitTarget.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0.1 && dist < 34) {
            const push = ((34 - dist) / 34) * 28;
            other.vx += (dx / dist) * push;
            other.vy += (dy / dist) * push;
          }
        }
        targetsRef.current = nextTargets;

        shockwavesRef.current.push(
          {
            x: hitTarget.x,
            y: hitTarget.y,
            radiusPct: 2,
            maxRadiusPct: 30,
            color: "#f43f5e",
            alpha: 0.95,
            life: 0,
            maxLife: 0.55,
          },
          {
            x: hitTarget.x,
            y: hitTarget.y,
            radiusPct: 1,
            maxRadiusPct: 20,
            color: "#fbbf24",
            alpha: 0.85,
            life: 0,
            maxLife: 0.42,
          }
        );

        comboStreakRef.current[shot.playerId] = 0;
        setComboByPlayer((prev) =>
          prev[shot.playerId] ? { ...prev, [shot.playerId]: 0 } : prev
        );

        playBombExplosionSound();
        const currentScore = scoresRef.current[shot.playerId] ?? 0;
        const nextScore = Math.max(0, currentScore - 5);
        setScores((prev) => {
          const updated = { ...prev, [shot.playerId]: nextScore };
          scoresRef.current = updated;
          return updated;
        });
        void persistScoreToDb(shot.playerId, nextScore);
        spawnBurst(hitTarget.x, hitTarget.y, "#f43f5e", 30);
        spawnBurst(hitTarget.x, hitTarget.y, "#fbbf24", 16);
        spawnFloatingLabel(hitTarget.x, hitTarget.y, "-5", "#fb7185");

        const botEntry = botRuntimeRef.current[shot.playerId];
        if (botEntry) {
          botEntry.stunnedUntilMs = Date.now() + 2000;
        }

        void channelRef.current?.send({
          type: "broadcast",
          event: "player_stunned",
          payload: {
            playerId: shot.playerId,
            durationMs: 2000,
          },
        });
        return;
      }

      const nextStreak = (comboStreakRef.current[shot.playerId] ?? 0) + 1;
      comboStreakRef.current[shot.playerId] = nextStreak;
      setComboByPlayer((prev) => ({ ...prev, [shot.playerId]: nextStreak }));

      const comboMult = getComboMultiplier(nextStreak);
      const rushMult = isFinalRushRef.current ? 2 : 1;
      const totalMult = comboMult * rushMult;

      if (hitTarget.kind === "heavy") {
        const nextHp = Math.max(0, hitTarget.hp - 1);
        const hitsDone = hitTarget.maxHp - nextHp;
        const nextTargets = [...targetsRef.current];

        if (nextHp > 0) {
          nextTargets[hitIndex] = { ...hitTarget, hp: nextHp };
          targetsRef.current = nextTargets;
          playArmorHitSound(hitsDone);
        } else {
          nextTargets.splice(hitIndex, 1);
          targetsRef.current = nextTargets;
          playBonusHitSound();
          spawnBurst(hitTarget.x, hitTarget.y, "#22c55e", 34);
          spawnBurst(hitTarget.x, hitTarget.y, "#38bdf8", 22);
        }

        const deltaPts = 1 * totalMult;
        const currentScore = scoresRef.current[shot.playerId] ?? 0;
        const nextScore = currentScore + deltaPts;
        setScores((prev) => {
          const updated = { ...prev, [shot.playerId]: nextScore };
          scoresRef.current = updated;
          return updated;
        });
        void persistScoreToDb(shot.playerId, nextScore);
        spawnBurst(
          shot.x,
          shot.y,
          nextHp > 0 ? "#22c55e" : "#fde047",
          nextHp > 0 ? 12 : 28
        );
        const badgeLabel =
          nextHp === 0
            ? `+${deltaPts} 💥`
            : totalMult > 1
            ? `+${deltaPts} (x${totalMult})`
            : `+${deltaPts}`;
        spawnFloatingLabel(
          hitTarget.x,
          hitTarget.y - 2,
          badgeLabel,
          nextHp === 0 ? "#4ade80" : "#7dd3fc"
        );
        return;
      }

      const nextTargets = [...targetsRef.current];
      nextTargets.splice(hitIndex, 1);

      const didSplit = Boolean(hitTarget.kind === "target" && hitTarget.canSplit);
      if (didSplit) {
        nextTargets.push(
          createSplitMiniTarget(hitTarget, -1, 0),
          createSplitMiniTarget(hitTarget, 1, 1)
        );
      }

      targetsRef.current = nextTargets.slice(0, MAX_SPAWNED_TARGETS + 2);

      if (hitTarget.kind === "rapid") {
        playBonusHitSound();
        const expiresAt = Date.now() + RAPID_FIRE_DURATION_MS;
        rapidFireUntilRef.current[shot.playerId] = expiresAt;
        setRapidFireUntilByPlayer((prev) => ({
          ...prev,
          [shot.playerId]: expiresAt,
        }));

        void channelRef.current?.send({
          type: "broadcast",
          event: "rapid_fire",
          payload: {
            playerId: shot.playerId,
            durationMs: RAPID_FIRE_DURATION_MS,
            expiresAt,
          },
        });
      } else if (hitTarget.kind === "bonus") {
        playBonusHitSound();
      } else {
        playTargetHitSound(didSplit);
      }

      const basePts = hitTarget.kind === "bonus" ? 10 : 5;
      const deltaPts = basePts * totalMult;
      const currentScore = scoresRef.current[shot.playerId] ?? 0;
      const nextScore = currentScore + deltaPts;
      setScores((prev) => {
        const updated = { ...prev, [shot.playerId]: nextScore };
        scoresRef.current = updated;
        return updated;
      });
      void persistScoreToDb(shot.playerId, nextScore);
      spawnBurst(
        hitTarget.x,
        hitTarget.y,
        hitTarget.kind === "bonus" || hitTarget.kind === "rapid"
          ? "#fbbf24"
          : hitTarget.hueColor,
        24
      );
      const floatText =
        hitTarget.kind === "rapid"
          ? `+${deltaPts} ⚡ RAFALE 7s`
          : totalMult > 1
          ? `+${deltaPts} (x${totalMult})`
          : `+${deltaPts}`;
      spawnFloatingLabel(
        hitTarget.x,
        hitTarget.y,
        floatText,
        hitTarget.kind === "bonus" || hitTarget.kind === "rapid"
          ? "#fde047"
          : "#ffffff"
      );
    },
    [
      persistScoreToDb,
      spawnBurst,
      spawnFloatingLabel,
      playShotSound,
      playBombExplosionSound,
      playBonusHitSound,
      playTargetHitSound,
      playArmorHitSound,
    ]
  );

  const handleShootPayloadRef = useRef(handleShootPayload);
  handleShootPayloadRef.current = handleShootPayload;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let lastTime = performance.now();

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);

    const getTintedCrosshair = (color: string): HTMLImageElement | null => {
      const rawSvg = spritesRef.current.crosshairSvgText;
      if (!rawSvg) return null;
      const cached = spritesRef.current.tintedCrosshairCache[color];
      if (cached) return cached;

      const coloredSvg = colorizeSvgWhite(rawSvg, color);
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        coloredSvg
      )}`;
      spritesRef.current.tintedCrosshairCache[color] = img;
      return img;
    };

    const getHeavyTargetStageImage = (
      hitsDone: number
    ): HTMLImageElement | null => {
      const clampedHits = Math.max(0, Math.min(10, hitsDone));
      if (clampedHits === 0) return spritesRef.current.heavyImg;
      const cached = spritesRef.current.heavyStageCache[clampedHits];
      if (cached) return cached;

      const rawSvg = spritesRef.current.heavySvgText;
      if (!rawSvg) return spritesRef.current.heavyImg;

      const litSvg = buildHeavyTargetSvgWithLitSegments(rawSvg, clampedHits);
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        litSvg
      )}`;
      spritesRef.current.heavyStageCache[clampedHits] = img;
      return img;
    };

    const drawConcenticTarget = (
      cx: number,
      cy: number,
      radiusPx: number,
      color: string
    ) => {
      const customImg = spritesRef.current.targetImg;
      if (customImg && customImg.complete && customImg.naturalWidth > 0) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
        const size = radiusPx * 2.2;
        ctx.drawImage(customImg, cx - size / 2, cy - size / 2, size, size);
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 22;

      const rings = [1, 0.72, 0.44, 0.18];
      rings.forEach((ratio, idx) => {
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(2, radiusPx * ratio), 0, Math.PI * 2);
        ctx.fillStyle =
          idx % 2 === 0 ? `${color}dd` : "rgba(15, 10, 38, 0.92)";
        ctx.fill();
        ctx.lineWidth = idx === 0 ? 3 : 2;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      });

      ctx.restore();
    };

    const drawBonusCoin = (cx: number, cy: number, radiusPx: number) => {
      const customImg = spritesRef.current.bonusImg;
      if (customImg && customImg.complete && customImg.naturalWidth > 0) {
        ctx.save();
        ctx.shadowColor = "#fbbf24";
        ctx.shadowBlur = 20;
        const size = radiusPx * 2.2;
        ctx.drawImage(customImg, cx - size / 2, cy - size / 2, size, size);
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.shadowColor = "#fbbf24";
      ctx.shadowBlur = 24;

      const grad = ctx.createRadialGradient(
        cx - radiusPx * 0.28,
        cy - radiusPx * 0.28,
        radiusPx * 0.1,
        cx,
        cy,
        radiusPx
      );
      grad.addColorStop(0, "#fef08a");
      grad.addColorStop(0.55, "#f59e0b");
      grad.addColorStop(1, "#b45309");

      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#fde68a";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx * 0.72, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = "#451a03";
      ctx.font = `900 ${Math.max(12, Math.round(radiusPx * 0.65))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("★", cx, cy + 1);
      ctx.restore();
    };

    const drawRapidFireBonus = (
      cx: number,
      cy: number,
      radiusPx: number,
      timeSec: number
    ) => {
      const pulse = 1 + Math.sin(timeSec * 10) * 0.06;
      const customImg = spritesRef.current.rapidImg;
      if (customImg && customImg.complete && customImg.naturalWidth > 0) {
        ctx.save();
        ctx.shadowColor = "#fde047";
        ctx.shadowBlur = 24;
        const size = radiusPx * 2.3 * pulse;
        ctx.drawImage(customImg, cx - size / 2, cy - size / 2, size, size);
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.shadowColor = "#fde047";
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx * pulse, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(250, 204, 21, 0.25)";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#fde047";
      ctx.stroke();
      ctx.fillStyle = "#fef08a";
      ctx.font = `900 ${Math.max(14, Math.round(radiusPx * 0.9))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⚡", cx, cy + 1);
      ctx.restore();
    };

    const drawHeavyTarget = (
      cx: number,
      cy: number,
      radiusPx: number,
      hp: number,
      maxHp: number
    ) => {
      const hitsDone = Math.max(0, Math.min(maxHp, maxHp - hp));
      const stageImg =
        getHeavyTargetStageImage(hitsDone) ?? spritesRef.current.heavyImg;

      ctx.save();
      ctx.shadowColor = hitsDone >= 7 ? "#22c55e" : "#38bdf8";
      ctx.shadowBlur = 22;

      if (stageImg && stageImg.complete && stageImg.naturalWidth > 0) {
        const size = radiusPx * 2.25;
        ctx.drawImage(stageImg, cx - size / 2, cy - size / 2, size, size);
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
        ctx.fillStyle = "#0f172a";
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#38bdf8";
        ctx.stroke();
      }

      // 10 segments lumineux superposés pour garantir l'allumage visible à chaque impact
      for (let s = 0; s < maxHp; s++) {
        const startAngle = -Math.PI / 2 + (s * Math.PI * 2) / maxHp + 0.05;
        const endAngle =
          -Math.PI / 2 + ((s + 1) * Math.PI * 2) / maxHp - 0.05;
        ctx.beginPath();
        ctx.arc(cx, cy, radiusPx * 0.72, startAngle, endAngle);
        ctx.lineWidth = Math.max(3, radiusPx * 0.14);
        ctx.strokeStyle =
          s < hitsDone ? "#22c55e" : "rgba(255, 255, 255, 0.25)";
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      ctx.font = `900 ${Math.max(15, Math.round(radiusPx * 0.62))}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(9, 9, 11, 0.9)";
      const label = String(hp);
      ctx.strokeText(label, cx, cy + 1);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, cx, cy + 1);
      ctx.restore();
    };

    const drawSpikedBomb = (
      cx: number,
      cy: number,
      radiusPx: number,
      timeSec: number,
      phase: number
    ) => {
      const customImg = spritesRef.current.bombImg;
      if (customImg && customImg.complete && customImg.naturalWidth > 0) {
        ctx.save();
        ctx.shadowColor = "#ef4444";
        ctx.shadowBlur = 18;
        const size = radiusPx * 2.25;
        ctx.drawImage(customImg, cx - size / 2, cy - size / 2, size, size);
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.shadowColor = "#ef4444";
      ctx.shadowBlur = 18;

      const spikeCount = 8;
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 3;
      for (let i = 0; i < spikeCount; i++) {
        const angle = (Math.PI * 2 * i) / spikeCount + timeSec * 0.5;
        ctx.beginPath();
        ctx.moveTo(
          cx + Math.cos(angle) * (radiusPx * 0.75),
          cy + Math.sin(angle) * (radiusPx * 0.75)
        );
        ctx.lineTo(
          cx + Math.cos(angle) * (radiusPx * 1.24),
          cy + Math.sin(angle) * (radiusPx * 1.24)
        );
        ctx.stroke();
      }

      const bodyGrad = ctx.createRadialGradient(
        cx - radiusPx * 0.3,
        cy - radiusPx * 0.3,
        radiusPx * 0.1,
        cx,
        cy,
        radiusPx
      );
      bodyGrad.addColorStop(0, "#475569");
      bodyGrad.addColorStop(0.65, "#1e1b4b");
      bodyGrad.addColorStop(1, "#09090b");

      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
      ctx.fillStyle = bodyGrad;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#f43f5e";
      ctx.stroke();

      const fuseX = cx + radiusPx * 0.55;
      const fuseY = cy - radiusPx * 0.75;
      ctx.beginPath();
      ctx.moveTo(cx + radiusPx * 0.25, cy - radiusPx * 0.65);
      ctx.quadraticCurveTo(fuseX, fuseY - 10, fuseX + 8, fuseY - 6);
      ctx.strokeStyle = "#fcd34d";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      const sparkPulse = 4 + Math.sin(timeSec * 18 + phase) * 2.5;
      ctx.beginPath();
      ctx.arc(fuseX + 9, fuseY - 6, Math.max(2, sparkPulse), 0, Math.PI * 2);
      ctx.fillStyle = "#fde047";
      ctx.fill();

      ctx.restore();
    };

    const drawPlayerCrosshair = (
      cx: number,
      cy: number,
      color: string,
      label: string,
      isRapidActive: boolean,
      comboMult: number,
      timeSec: number
    ) => {
      // Agrandi de 10 % (24 * 1.1 = 26.4)
      const r = 26.4;
      const tintedImg = getTintedCrosshair(color);

      ctx.save();
      ctx.shadowColor = isRapidActive ? "#fde047" : color;
      ctx.shadowBlur = isRapidActive ? 22 : 16;

      if (isRapidActive) {
        ctx.beginPath();
        ctx.arc(
          cx,
          cy,
          r * (1.28 + Math.sin(timeSec * 16) * 0.08),
          0,
          Math.PI * 2
        );
        ctx.strokeStyle = "#fde047";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (tintedImg && tintedImg.complete && tintedImg.naturalWidth > 0) {
        const size = r * 2.3;
        ctx.drawImage(tintedImg, cx - size / 2, cy - size / 2, size, size);
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        const tickLen = 10;
        const dirs: Array<[number, number]> = [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ];
        for (const dir of dirs) {
          const dx = dir[0];
          const dy = dir[1];
          ctx.beginPath();
          ctx.moveTo(cx + dx * (r - 4), cy + dy * (r - 4));
          ctx.lineTo(cx + dx * (r + tickLen), cy + dy * (r + tickLen));
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      }

      ctx.shadowBlur = 0;
      ctx.font = "800 13px sans-serif";
      const displayLabel = isRapidActive ? `⚡ ${label}` : label;
      const textWidth = ctx.measureText(displayLabel).width;
      const pillW = textWidth + 16;
      const pillH = 22;
      const pillX = cx - pillW / 2;
      const pillY = cy + r + 10;

      ctx.fillStyle = isRapidActive ? "#fde047" : color;
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 11);
      ctx.fill();

      ctx.fillStyle = "#09090b";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(displayLabel, cx, pillY + pillH / 2 + 0.5);

      if (comboMult > 1) {
        const comboText = `x${comboMult}`;
        ctx.font = "900 12px monospace";
        const cw = ctx.measureText(comboText).width + 12;
        const ch = 20;
        const bx = cx + r + 6;
        const by = cy - r - 4;
        ctx.fillStyle = "#f97316";
        ctx.beginPath();
        ctx.roundRect(bx, by, cw, ch, 10);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(comboText, bx + cw / 2, by + ch / 2 + 0.5);
      }

      ctx.restore();
    };

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const timeSec = now / 1000;
      const nowEpoch = Date.now();

      const rect = container.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      const isRushNow = isFinalRushRef.current;

      const bgGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.45,
        40,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.78
      );
      if (isRushNow) {
        bgGrad.addColorStop(0, "#4c0519");
        bgGrad.addColorStop(0.55, "#23071e");
        bgGrad.addColorStop(1, "#09030f");
      } else {
        bgGrad.addColorStop(0, "#2e1065");
        bgGrad.addColorStop(0.55, "#14082b");
        bgGrad.addColorStop(1, "#070412");
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      const canMove = isActivePlayRef.current;

      for (const star of starsRef.current) {
        if (canMove) {
          star.y += star.speed * (isRushNow ? 2.1 : 1) * dt;
          if (star.y > 102) {
            star.y = -2;
            star.x = Math.random() * 100;
          }
        }
        ctx.beginPath();
        ctx.arc(
          (star.x / 100) * width,
          (star.y / 100) * height,
          star.size,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = isRushNow
          ? `rgba(253, 186, 116, ${star.alpha})`
          : `rgba(224, 231, 255, ${star.alpha})`;
        ctx.fill();
      }

      if (isRoundRunningRef.current && !roundEndedRef.current) {
        if (canMove) {
          spawnAccumulatorRef.current += dt;
          const spawnInterval = isRushNow ? 0.58 : 1.0;
          const maxTargets = isRushNow
            ? MAX_SPAWNED_TARGETS + 4
            : MAX_SPAWNED_TARGETS;
          if (
            spawnAccumulatorRef.current >= spawnInterval &&
            targetsRef.current.length < maxTargets
          ) {
            spawnAccumulatorRef.current = 0;
            const burstCount = isRushNow
              ? 2
              : Math.random() < 0.35
              ? 2
              : 1;
            for (let b = 0; b < burstCount; b++) {
              targetsRef.current.push(
                createSpawnTarget(targetsRef.current.length + b)
              );
            }
          }
        }

        const survivingTargets: BlitzTarget[] = [];
        for (const t of targetsRef.current) {
          if (canMove) {
            t.x += t.vx * dt;
            if (t.gravity > 0) {
              t.vy += t.gravity * dt;
            }
            t.y += t.vy * dt;

            if (t.x < 7) {
              t.x = 7;
              t.vx = Math.abs(t.vx);
            } else if (t.x > 93) {
              t.x = 93;
              t.vx = -Math.abs(t.vx);
            }

            if (t.vy > 0 && t.y > 108) {
              continue;
            }
          }

          survivingTargets.push(t);

          const cx = (t.x / 100) * width;
          const cy = (t.y / 100) * height;
          const radiusPx = Math.max(
            16,
            (t.radiusPct / 100) * Math.min(width, height)
          );

          if (t.kind === "bomb") {
            drawSpikedBomb(cx, cy, radiusPx, timeSec, t.fusePhase);
          } else if (t.kind === "bonus") {
            drawBonusCoin(cx, cy, radiusPx);
          } else if (t.kind === "rapid") {
            drawRapidFireBonus(cx, cy, radiusPx, timeSec);
          } else if (t.kind === "heavy") {
            drawHeavyTarget(cx, cy, radiusPx, t.hp, t.maxHp);
          } else {
            drawConcenticTarget(cx, cy, radiusPx, t.hueColor);
          }
        }
        targetsRef.current = survivingTargets;
      }

      if (canMove) {
        const bots = playersRef.current.filter(isBotPlayer);
        const validTargets = targetsRef.current.filter(
          (t) => t.kind !== "bomb" && t.y >= 6 && t.y <= 92
        );

        for (let idx = 0; idx < bots.length; idx++) {
          const bot = bots[idx];
          if (!bot) continue;
          if (
            suddenDeathIdsRef.current.length > 0 &&
            !suddenDeathIdsRef.current.includes(bot.id)
          ) {
            continue;
          }

          const botCfg = BOT_BLITZ_CONFIG[bot.botLevel ?? "normal"];
          const isBotRapid =
            (rapidFireUntilRef.current[bot.id] ?? 0) > nowEpoch;
          const cooldownFactor = isBotRapid ? 0.35 : 1;
          const colorStyle = getUniquePlayerColor(bot.id, playersRef.current);
          let state = botRuntimeRef.current[bot.id];
          if (!state) {
            state = {
              x: 20 + ((idx * 23) % 60),
              y: 45 + ((idx * 13) % 30),
              targetId: null,
              cooldownSec:
                (botCfg.minCooldownSec +
                  Math.random() *
                    (botCfg.maxCooldownSec - botCfg.minCooldownSec)) *
                cooldownFactor,
              stunnedUntilMs: 0,
            };
            botRuntimeRef.current[bot.id] = state;
          }

          if (state.stunnedUntilMs > nowEpoch) {
            continue;
          }

          state.cooldownSec = Math.max(0, state.cooldownSec - dt);

          let chosen =
            validTargets.find((t) => t.id === state.targetId) ?? null;
          if (!chosen && validTargets.length > 0) {
            chosen =
              validTargets[Math.floor(Math.random() * validTargets.length)] ??
              null;
            state.targetId = chosen?.id ?? null;
          }

          const goalX = chosen ? chosen.x : 50 + Math.sin(timeSec + idx) * 28;
          const goalY = chosen
            ? Math.min(88, Math.max(12, chosen.y + chosen.vy * 0.12))
            : 50 + Math.cos(timeSec * 0.8 + idx) * 20;

          const dx = goalX - state.x;
          const dy = goalY - state.y;
          const dist = Math.hypot(dx, dy);
          const maxStep = botCfg.speedPctPerSec * dt;

          if (dist > 0.1) {
            const step = Math.min(dist, maxStep);
            state.x += (dx / dist) * step;
            state.y += (dy / dist) * step;
          }

          cursorsRef.current[bot.id] = {
            playerId: bot.id,
            playerName: bot.nickname,
            color: colorStyle.bgHex,
            x: state.x,
            y: state.y,
          };

          if (chosen && dist < 4.5 && state.cooldownSec <= 0) {
            state.cooldownSec =
              (botCfg.minCooldownSec +
                Math.random() *
                  (botCfg.maxCooldownSec - botCfg.minCooldownSec)) *
              cooldownFactor;
            if (chosen.kind !== "heavy" || chosen.hp <= 1) {
              state.targetId = null;
            }
            const aimJitterX = (Math.random() - 0.5) * botCfg.jitterPct;
            const aimJitterY = (Math.random() - 0.5) * botCfg.jitterPct;
            handleShootPayloadRef.current({
              playerId: bot.id,
              playerName: bot.nickname,
              color: colorStyle.bgHex,
              x: Math.max(2, Math.min(98, state.x + aimJitterX)),
              y: Math.max(4, Math.min(95, state.y + aimJitterY)),
              timestamp: nowEpoch,
            });
          }
        }
      }

      // Ondes de choc des bombes
      const aliveWaves: ShockwaveRing[] = [];
      for (const wave of shockwavesRef.current) {
        wave.life += dt;
        if (wave.life < wave.maxLife) {
          const progress = wave.life / wave.maxLife;
          const eased = 1 - Math.pow(1 - progress, 2.2);
          wave.radiusPct = 2 + (wave.maxRadiusPct - 2) * eased;
          wave.alpha = Math.max(0, 1 - progress);

          ctx.save();
          ctx.globalAlpha = wave.alpha;
          ctx.beginPath();
          ctx.arc(
            (wave.x / 100) * width,
            (wave.y / 100) * height,
            (wave.radiusPct / 100) * Math.min(width, height),
            0,
            Math.PI * 2
          );
          ctx.strokeStyle = wave.color;
          ctx.lineWidth = Math.max(2, 8 * (1 - progress));
          ctx.shadowColor = wave.color;
          ctx.shadowBlur = 18;
          ctx.stroke();
          ctx.restore();

          aliveWaves.push(wave);
        }
      }
      shockwavesRef.current = aliveWaves;

      // Traînées de tir
      const aliveTrails: ShotTrail[] = [];
      for (const tr of shotTrailsRef.current) {
        tr.life += dt;
        if (tr.life < tr.maxLife) {
          tr.alpha = Math.max(0, 1 - tr.life / tr.maxLife);
          const sx = (tr.startX / 100) * width;
          const sy = (tr.startY / 100) * height;
          const ex = (tr.endX / 100) * width;
          const ey = (tr.endY / 100) * height;

          ctx.save();
          ctx.globalAlpha = tr.alpha * 0.75;
          const grad = ctx.createLinearGradient(sx, sy, ex, ey);
          grad.addColorStop(0, "rgba(255, 255, 255, 0)");
          grad.addColorStop(0.55, tr.color);
          grad.addColorStop(1, "#ffffff");
          ctx.strokeStyle = grad;
          ctx.lineWidth = 3.5 * tr.alpha + 1;
          ctx.lineCap = "round";
          ctx.shadowColor = tr.color;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          ctx.restore();

          aliveTrails.push(tr);
        }
      }
      shotTrailsRef.current = aliveTrails;

      const aliveParticles: Particle[] = [];
      for (const p of particlesRef.current) {
        p.life += dt;
        if (p.life < p.maxLife) {
          p.x += ((p.vx * dt) / Math.max(1, width)) * 100;
          p.y += ((p.vy * dt) / Math.max(1, height)) * 100;
          p.alpha = Math.max(0, 1 - p.life / p.maxLife);

          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.beginPath();
          ctx.arc(
            (p.x / 100) * width,
            (p.y / 100) * height,
            p.radius,
            0,
            Math.PI * 2
          );
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.restore();

          aliveParticles.push(p);
        }
      }
      particlesRef.current = aliveParticles;

      const aliveTexts: FloatingScoreText[] = [];
      for (const ft of floatingTextsRef.current) {
        ft.life += dt;
        if (ft.life < ft.maxLife) {
          ft.y += ft.vy * dt;
          ft.alpha = Math.max(0, 1 - ft.life / ft.maxLife);

          ctx.save();
          ctx.globalAlpha = ft.alpha;
          ctx.font = "900 24px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.lineWidth = 5;
          ctx.strokeStyle = "rgba(9, 9, 11, 0.9)";
          const tx = (ft.x / 100) * width;
          const ty = (ft.y / 100) * height;
          ctx.strokeText(ft.label, tx, ty);
          ctx.fillStyle = ft.color;
          ctx.fillText(ft.label, tx, ty);
          ctx.restore();

          aliveTexts.push(ft);
        }
      }
      floatingTextsRef.current = aliveTexts;

      for (const c of Object.values(cursorsRef.current)) {
        const playerObj = playersRef.current.find((p) => p.id === c.playerId);
        const color =
          c.color ||
          (playerObj
            ? getUniquePlayerColor(playerObj.id, playersRef.current).borderHex
            : "#22d3ee");
        const isRapidActive =
          (rapidFireUntilRef.current[c.playerId] ?? 0) > nowEpoch;
        const comboMult = getComboMultiplier(
          comboStreakRef.current[c.playerId] ?? 0
        );
        drawPlayerCrosshair(
          (c.x / 100) * width,
          (c.y / 100) * height,
          color,
          c.playerName || playerObj?.nickname || "Joueur",
          isRapidActive,
          comboMult,
          timeSec
        );
      }

      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isActivePlay) {
      if (!isRoundRunning && !roundEnded) {
        setRemainingSeconds(ROUND_DURATION_SECONDS);
      }
      return;
    }

    const startMs = roundStartMsRef.current ?? Date.now();
    roundStartMsRef.current = startMs;

    const updateTimer = () => {
      const elapsed = Math.max(0, (Date.now() - startMs) / 1000);
      setRemainingSeconds(Math.max(0, ROUND_DURATION_SECONDS - elapsed));
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 200);
    return () => window.clearInterval(interval);
  }, [isActivePlay, isRoundRunning, roundEnded]);

  useEffect(() => {
    if (!isActivePlay || remainingSeconds > 0) return;

    const currentRound = roundNumberRef.current;
    if (finalizedRoundNumberRef.current === currentRound) return;
    finalizedRoundNumberRef.current = currentRound;

    playRoundEndSound();
    setIsRoundRunning(false);
    setRoundEnded(true);
    targetsRef.current = [];
    particlesRef.current = [];
    floatingTextsRef.current = [];
    shotTrailsRef.current = [];
    shockwavesRef.current = [];
    rapidFireUntilRef.current = {};
    comboStreakRef.current = {};
    setRapidFireUntilByPlayer({});
    setComboByPlayer({});

    const candidatePlayers =
      suddenDeathIdsRef.current.length > 0
        ? playersRef.current.filter((p) =>
            suddenDeathIdsRef.current.includes(p.id)
          )
        : playersRef.current;

    let bestScore = -1;
    let winners: BlitzSessionPlayer[] = [];
    for (const p of candidatePlayers) {
      const sc = scoresRef.current[p.id] ?? 0;
      if (sc > bestScore) {
        bestScore = sc;
        winners = [p];
      } else if (sc === bestScore) {
        winners.push(p);
      }
    }

    const nextWins = { ...roundWinsRef.current };
    if (bestScore > 0 && winners.length > 0) {
      for (const w of winners) {
        nextWins[w.id] = (nextWins[w.id] ?? 0) + 1;
      }
      setRoundWins(nextWins);
      roundWinsRef.current = nextWins;
    }

    const winnerNames =
      bestScore > 0 && winners.length > 0
        ? winners.map((w) => w.nickname).join(" & ")
        : "Aucun point marqué";
    setLastRoundWinnerLabel(winnerNames);

    let nextSuddenDeathIds: string[] = [];
    if (currentRound >= totalRounds || isSuddenDeath) {
      let maxWins = -1;
      let tiedIds: string[] = [];
      for (const p of playersRef.current) {
        const w = nextWins[p.id] ?? 0;
        if (w > maxWins) {
          maxWins = w;
          tiedIds = [p.id];
        } else if (w === maxWins) {
          tiedIds.push(p.id);
        }
      }
      if (tiedIds.length > 1) {
        nextSuddenDeathIds = tiedIds;
      }
    }

    setSuddenDeathPlayerIds(nextSuddenDeathIds);
    suddenDeathIdsRef.current = nextSuddenDeathIds;

    const currentSession = sessionRef.current;
    if (supabase && currentSession?.id) {
      const nextState: BlitzGameState = {
        ...blitzState,
        roundTriggered: false,
        questionStarted: false,
        roundNumber: currentRound,
        roundWins: nextWins,
        isSuddenDeath: nextSuddenDeathIds.length > 1,
        suddenDeathPlayerIds: nextSuddenDeathIds,
      };
      void supabase
        .from("game_sessions")
        .update({ game_state: nextState })
        .eq("id", currentSession.id);
    }
  }, [
    isActivePlay,
    remainingSeconds,
    totalRounds,
    isSuddenDeath,
    blitzState,
    supabase,
    playRoundEndSound,
  ]);

  useEffect(() => {
    if (!supabase || !sessionCode) return;

    let active = true;

    const loadPlayersAndScores = async (targetSessionId: string) => {
      const [{ data: playersRows }, { data: scoreRows }] = await Promise.all([
        supabase
          .from("session_players")
          .select("*")
          .eq("session_id", targetSessionId),
        supabase
          .from("player_scores")
          .select("*")
          .eq("session_id", targetSessionId),
      ]);

      if (!active) return;
      if (playersRows) {
        setHumanPlayers(playersRows as BlitzSessionPlayer[]);
      }
      if (scoreRows && !ignoreNextScoreFetchRef.current) {
        const map: Record<string, number> = { ...scoresRef.current };
        for (const row of scoreRows as PlayerScore[]) {
          map[row.player_id] = extractScoreValue(row);
        }
        setScores(map);
        scoresRef.current = map;
      }
      ignoreNextScoreFetchRef.current = false;
    };

    const initSession = async () => {
      const { data } = await supabase
        .from("game_sessions")
        .select("*")
        .eq("code", sessionCode)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<ExtendedGameSession>();

      if (!active || !data) return;
      setSession(data);
      sessionRef.current = data;
      void loadPlayersAndScores(data.id);
    };

    void initSession();

    const sessionSub = supabase
      .channel(`blitz-session-${sessionCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_sessions",
          filter: `code=eq.${sessionCode}`,
        },
        (payload) => {
          if (!active) return;
          const nextRow = payload.new as ExtendedGameSession | null;
          if (!nextRow) return;
          setSession(nextRow);
          sessionRef.current = nextRow;
          void loadPlayersAndScores(nextRow.id);
        }
      )
      .subscribe();

    const blitzChannel = supabase.channel(`target-blitz-${sessionCode}`, {
      config: {
        broadcast: { self: false },
      },
    });

    blitzChannel
      .on("broadcast", { event: "cursor_move" }, (msg) => {
        if (!active) return;
        const payload = msg.payload as BlitzCursorPayload | undefined;
        if (!payload?.playerId) return;
        cursorsRef.current = {
          ...cursorsRef.current,
          [payload.playerId]: payload,
        };
      })
      .on("broadcast", { event: "shoot" }, (msg) => {
        if (!active) return;
        const payload = msg.payload as BlitzShootPayload | undefined;
        if (!payload?.playerId) return;
        cursorsRef.current = {
          ...cursorsRef.current,
          [payload.playerId]: payload,
        };
        handleShootPayload(payload);
      })
      .subscribe();

    channelRef.current = blitzChannel;

    return () => {
      active = false;
      void supabase.removeChannel(sessionSub);
      void supabase.removeChannel(blitzChannel);
      channelRef.current = null;
    };
  }, [supabase, sessionCode, handleShootPayload]);

  const sixPlayersRow = useMemo(() => {
    const nowEpoch = Date.now();
    const sorted = [...players].sort((a, b) => {
      const winsDiff = (roundWins[b.id] ?? 0) - (roundWins[a.id] ?? 0);
      if (winsDiff !== 0) return winsDiff;
      return (scores[b.id] ?? 0) - (scores[a.id] ?? 0);
    });
    return sorted.slice(0, 6).map((p) => {
      const colorStyle = getUniquePlayerColor(p.id, players);
      const comboMult = getComboMultiplier(comboByPlayer[p.id] ?? 0);
      const hasRapid = (rapidFireUntilByPlayer[p.id] ?? 0) > nowEpoch;
      return {
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar ?? "🎮",
        score: scores[p.id] ?? 0,
        wins: roundWins[p.id] ?? 0,
        comboMult,
        hasRapid,
        colorStyle,
      };
    });
  }, [players, scores, roundWins, comboByPlayer, rapidFireUntilByPlayer]);

  const rankedForPodium = useMemo(() => {
    return [...players]
      .map((p) => ({
        player: p,
        wins: roundWins[p.id] ?? 0,
        score: scores[p.id] ?? 0,
      }))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return b.score - a.score;
      });
  }, [players, roundWins, scores]);

  const podiumSlots = useMemo(() => {
    return {
      first: rankedForPodium[0],
      second: rankedForPodium[1],
      third: rankedForPodium[2],
    };
  }, [rankedForPodium]);

  const overallLeader = useMemo(() => {
    if (players.length === 0)
      return { winnerName: null, tiedNames: [] as string[] };
    let maxWins = -1;
    let leaders: BlitzSessionPlayer[] = [];
    for (const p of players) {
      const w = roundWins[p.id] ?? 0;
      if (w > maxWins) {
        maxWins = w;
        leaders = [p];
      } else if (w === maxWins) {
        leaders.push(p);
      }
    }
    if (maxWins <= 0) return { winnerName: null, tiedNames: [] as string[] };
    if (leaders.length > 1) {
      return {
        winnerName: null,
        tiedNames: leaders.map((l) => l.nickname),
      };
    }
    return {
      winnerName: leaders[0]?.nickname ?? null,
      tiedNames: [] as string[],
    };
  }, [players, roundWins]);

  return (
    <div
      ref={containerRef}
      className={`relative w-screen h-screen overflow-hidden select-none bg-[#090516] text-white flex flex-col justify-between ${
        isFinalRush ? "ring-4 ring-inset ring-rose-500/80" : ""
      }`}
    >
      <style jsx>{`
        @keyframes podiumJump {
          0%,
          100% {
            transform: translateY(0) scale(1);
          }
          25% {
            transform: translateY(-16px) scale(1.03);
          }
          50% {
            transform: translateY(0) scale(0.98);
          }
          75% {
            transform: translateY(-9px) scale(1.015);
          }
        }
        .podium-jump-1 {
          animation: podiumJump 1.15s ease-in-out infinite;
        }
        .podium-jump-2 {
          animation: podiumJump 1.15s ease-in-out 0.18s infinite;
        }
        .podium-jump-3 {
          animation: podiumJump 1.15s ease-in-out 0.36s infinite;
        }
      `}</style>

      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* Haut de l'écran : manche + chrono + bouton son discret */}
      <div className="relative z-20 flex items-start justify-between gap-4 p-4 md:p-6 pointer-events-none">
        <div className="rounded-2xl border border-cyan-400/40 bg-slate-950/80 backdrop-blur-md px-4 py-2.5 shadow-[0_0_25px_rgba(34,211,238,0.2)]">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-cyan-300">
            {isSuddenDeath ? (
              <>
                <Swords className="w-4 h-4 text-rose-400" />
                <span className="text-rose-300">Mort Subite</span>
              </>
            ) : (
              <>
                <Flame className="w-4 h-4 text-amber-400" />
                <span>
                  Manche {Math.min(roundNumber, totalRounds)} / {totalRounds}
                </span>
              </>
            )}
          </div>
          <div className="font-mono text-[11px] text-neutral-400 mt-0.5">
            Salle {sessionCode || "----"} •{" "}
            {isCountingDown
              ? "DÉCOMPTE"
              : isActivePlay
              ? "EN COURS"
              : roundEnded
              ? "MANCHE FINIE"
              : "PRÊT"}
          </div>
        </div>

        {isFinalRush && (
          <div className="px-5 py-2 rounded-2xl bg-rose-600/90 border-2 border-amber-300 shadow-[0_0_30px_rgba(244,63,94,0.75)] flex items-center gap-2 animate-pulse">
            <Flame className="w-5 h-5 text-amber-300" />
            <span className="font-mono text-sm sm:text-base font-black uppercase tracking-widest text-white">
              RUSH FINAL • POINTS x2
            </span>
          </div>
        )}

        <div className="flex flex-col items-end">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleToggleSound}
              title={soundEnabled ? "Couper le son" : "Activer le son"}
              className={`pointer-events-auto h-12 px-3.5 rounded-2xl border backdrop-blur-md flex items-center gap-1.5 text-xs font-black uppercase tracking-wider transition ${
                soundEnabled
                  ? "bg-slate-950/75 border-white/15 text-cyan-200 hover:border-cyan-400/50"
                  : "bg-slate-950/75 border-rose-400/35 text-rose-300 hover:border-rose-400/60"
              }`}
            >
              {soundEnabled ? (
                <>
                  <Volume2 className="w-4 h-4 text-cyan-300" />
                  <span>Son ON</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-4 h-4 text-rose-400" />
                  <span>Son OFF</span>
                </>
              )}
            </button>

            <div
              className={`rounded-2xl border-2 backdrop-blur-md px-6 py-2.5 flex items-center gap-3 ${
                isFinalRush
                  ? "border-rose-400 bg-rose-950/85 shadow-[0_0_35px_rgba(244,63,94,0.65)] animate-pulse"
                  : "border-fuchsia-400/60 bg-slate-950/80 shadow-[0_0_30px_rgba(217,70,239,0.3)]"
              }`}
            >
              <Timer
                className={`w-6 h-6 ${
                  isFinalRush ? "text-rose-300" : "text-amber-400"
                }`}
              />
              <span
                className={`font-mono text-3xl sm:text-4xl font-black tracking-wider ${
                  isFinalRush ? "text-rose-200" : "text-amber-300"
                }`}
              >
                {formatClock(remainingSeconds)}
              </span>
            </div>
          </div>

          {overallLeader.winnerName && (
            <span className="mt-1.5 px-3 py-0.5 rounded-full text-xs font-black bg-amber-400/20 border border-amber-300/50 text-amber-200 flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-amber-300" />
              En tête : {overallLeader.winnerName}
            </span>
          )}
          {overallLeader.tiedNames.length > 1 && (
            <span className="mt-1.5 px-3 py-0.5 rounded-full text-xs font-black bg-rose-500/25 border border-rose-400/50 text-rose-200">
              Égalité : {overallLeader.tiedNames.join(" vs ")}
            </span>
          )}
        </div>
      </div>

      {/* Compte à rebours 3 secondes plein écran */}
      {isCountingDown && (
        <div className="absolute inset-0 z-30 bg-slate-950/75 backdrop-blur-xs flex flex-col items-center justify-center text-center pointer-events-none">
          <div className="text-sm font-black uppercase tracking-[0.35em] text-cyan-300 mb-2">
            Manche {Math.min(roundNumber, totalRounds)}
          </div>
          <div className="text-8xl sm:text-9xl font-black font-mono text-amber-300 drop-shadow-[0_0_40px_rgba(251,191,36,0.65)] animate-pulse">
            {countdownValue}
          </div>
        </div>
      )}

      {/* Overlay avant lancement ou gagnant de la manche après 2 secondes */}
      {!isCountingDown && !isActivePlay && !isMatchPodiumVisible && (
        <div className="absolute inset-0 z-20 bg-black/55 backdrop-blur-xs flex flex-col items-center justify-center text-center p-6 pointer-events-none">
          {roundEnded && isWinnerBannerVisible ? (
            <div className="rounded-3xl border border-white/15 bg-slate-950/90 px-8 py-6 shadow-2xl space-y-2.5 max-w-lg">
              <div className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-amber-300">
                <Trophy className="w-4 h-4" />
                <span>Fin de la manche {roundNumber}</span>
              </div>
              <p className="text-3xl font-black tracking-tight text-white">
                Gagnant :{" "}
                <span className="text-amber-300">
                  {lastRoundWinnerLabel ?? "—"}
                </span>
              </p>
              {isSuddenDeath ? (
                <p className="text-sm font-bold text-rose-300">
                  Égalité ! Clique sur « Lancer la manche » pour la mort subite.
                </p>
              ) : (
                <p className="text-sm text-neutral-300">
                  Clique sur « Lancer la manche » dans l&apos;admin pour la
                  manche suivante.
                </p>
              )}
            </div>
          ) : !roundEnded ? (
            <div className="rounded-3xl border border-white/15 bg-slate-950/90 px-8 py-6 shadow-2xl space-y-2 max-w-lg">
              <p className="text-3xl font-black tracking-tight text-amber-300">
                {isPaused
                  ? "PAUSE"
                  : isSuddenDeath
                  ? "MORT SUBITE"
                  : "TARGET BLITZ PRÊT"}
              </p>
              <p className="text-sm text-neutral-300">
                {isPaused
                  ? "La manche est mise en pause."
                  : "Clique sur « Lancer la manche » dans le panneau admin pour démarrer."}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* Podium final après les 5 manches */}
      {isMatchPodiumVisible && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 md:p-8 pointer-events-none">
          <div className="w-full max-w-5xl h-[82vh] bg-neutral-900/95 border-2 border-amber-400/50 rounded-[2.5rem] p-6 md:p-8 flex flex-col justify-between shadow-2xl">
            <div className="text-center shrink-0 border-b border-white/15 pb-4">
              <div className="inline-flex items-center gap-2 px-5 py-1.5 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-300 text-sm font-extrabold uppercase tracking-[0.22em] mb-2">
                <Crown className="w-5 h-5 text-amber-400" />
                <span>Fin des {totalRounds} manches</span>
              </div>
              <h2 className="text-4xl xl:text-6xl font-black uppercase tracking-[0.18em] text-amber-300">
                PODIUM
              </h2>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-3 items-end gap-4 md:gap-6 pt-8">
              <div className="flex flex-col items-center gap-3 h-[78%]">
                {podiumSlots.second ? (
                  <>
                    <div className="podium-jump-2 flex items-center gap-2.5 w-full">
                      <div
                        style={{
                          backgroundColor: getUniquePlayerColor(
                            podiumSlots.second.player.id,
                            players
                          ).bgHex,
                          borderColor: getUniquePlayerColor(
                            podiumSlots.second.player.id,
                            players
                          ).borderHex,
                          color: getUniquePlayerColor(
                            podiumSlots.second.player.id,
                            players
                          ).textHex,
                        }}
                        className="flex-1 min-w-0 rounded-2xl border-2 px-4 py-2.5 font-black text-xl xl:text-3xl truncate shadow-lg"
                      >
                        {podiumSlots.second.player.nickname}
                      </div>
                      <div className="w-12 h-12 rounded-2xl bg-slate-300/20 border-2 border-slate-300 flex items-center justify-center text-slate-200 shrink-0 shadow-md">
                        <Medal className="w-7 h-7 text-slate-200" />
                      </div>
                    </div>
                    <div className="w-full flex-1 rounded-t-3xl bg-slate-400/20 border-2 border-slate-300/50 flex flex-col items-center justify-center gap-1.5 p-4">
                      <span className="text-3xl xl:text-4xl font-black text-slate-200">
                        2e
                      </span>
                      <span className="font-mono text-xl xl:text-2xl font-black text-white">
                        {podiumSlots.second.wins}{" "}
                        {podiumSlots.second.wins > 1 ? "manches" : "manche"}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full rounded-t-3xl bg-white/5 border border-white/10 flex items-center justify-center text-neutral-500 font-bold">
                    —
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center gap-3 h-full">
                {podiumSlots.first ? (
                  <>
                    <div className="podium-jump-1 flex items-center gap-2.5 w-full">
                      <div
                        style={{
                          backgroundColor: getUniquePlayerColor(
                            podiumSlots.first.player.id,
                            players
                          ).bgHex,
                          borderColor: getUniquePlayerColor(
                            podiumSlots.first.player.id,
                            players
                          ).borderHex,
                          color: getUniquePlayerColor(
                            podiumSlots.first.player.id,
                            players
                          ).textHex,
                        }}
                        className="flex-1 min-w-0 rounded-2xl border-2 px-4 py-3 font-black text-2xl xl:text-4xl truncate shadow-xl"
                      >
                        {podiumSlots.first.player.nickname}
                      </div>
                      <div className="w-14 h-14 rounded-2xl bg-amber-400/25 border-2 border-amber-300 flex items-center justify-center text-amber-300 shrink-0 shadow-lg">
                        <Trophy className="w-8 h-8 text-amber-300" />
                      </div>
                    </div>
                    <div className="w-full flex-1 rounded-t-3xl bg-amber-400/20 border-2 border-amber-300/70 flex flex-col items-center justify-center gap-1.5 p-4 shadow-2xl">
                      <span className="text-4xl xl:text-5xl font-black text-amber-300">
                        1er
                      </span>
                      <span className="font-mono text-2xl xl:text-3xl font-black text-white">
                        {podiumSlots.first.wins}{" "}
                        {podiumSlots.first.wins > 1 ? "manches" : "manche"}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full rounded-t-3xl bg-white/5 border border-white/10 flex items-center justify-center text-neutral-500 font-bold">
                    —
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center gap-3 h-[64%]">
                {podiumSlots.third ? (
                  <>
                    <div className="podium-jump-3 flex items-center gap-2.5 w-full">
                      <div
                        style={{
                          backgroundColor: getUniquePlayerColor(
                            podiumSlots.third.player.id,
                            players
                          ).bgHex,
                          borderColor: getUniquePlayerColor(
                            podiumSlots.third.player.id,
                            players
                          ).borderHex,
                          color: getUniquePlayerColor(
                            podiumSlots.third.player.id,
                            players
                          ).textHex,
                        }}
                        className="flex-1 min-w-0 rounded-2xl border-2 px-4 py-2.5 font-black text-xl xl:text-3xl truncate shadow-lg"
                      >
                        {podiumSlots.third.player.nickname}
                      </div>
                      <div className="w-12 h-12 rounded-2xl bg-orange-500/20 border-2 border-orange-400 flex items-center justify-center text-orange-300 shrink-0 shadow-md">
                        <Award className="w-7 h-7 text-orange-300" />
                      </div>
                    </div>
                    <div className="w-full flex-1 rounded-t-3xl bg-orange-500/15 border-2 border-orange-400/50 flex flex-col items-center justify-center gap-1.5 p-4">
                      <span className="text-3xl xl:text-4xl font-black text-orange-300">
                        3e
                      </span>
                      <span className="font-mono text-xl xl:text-2xl font-black text-white">
                        {podiumSlots.third.wins}{" "}
                        {podiumSlots.third.wins > 1 ? "manches" : "manche"}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full rounded-t-3xl bg-white/5 border border-white/10 flex items-center justify-center text-neutral-500 font-bold">
                    —
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bas de l'écran : pastilles des 6 joueurs sur une seule ligne */}
      <div className="relative z-10 pointer-events-none px-3 pb-3 pt-2">
        <div className="grid grid-cols-6 gap-2 max-w-6xl mx-auto">
          {Array.from({ length: 6 }, (_, idx) => {
            const p = sixPlayersRow[idx];
            if (!p) {
              return (
                <div
                  key={`empty-slot-${idx}`}
                  className="h-14 rounded-2xl border border-white/10 bg-slate-950/45 flex items-center justify-center text-[11px] font-bold text-neutral-500"
                >
                  J{idx + 1}
                </div>
              );
            }

            return (
              <div
                key={p.id}
                style={{
                  backgroundColor: p.colorStyle.bgHex,
                  borderColor: p.colorStyle.borderHex,
                  color: p.colorStyle.textHex,
                }}
                className="relative h-14 rounded-2xl border-2 px-2.5 py-1.5 shadow-lg flex items-center justify-between gap-1.5 min-w-0"
              >
                {(p.comboMult > 1 || p.hasRapid) && (
                  <div className="absolute -top-2.5 right-2 flex items-center gap-1">
                    {p.hasRapid && (
                      <span className="px-1.5 py-0.2 rounded-full bg-amber-300 text-black font-mono font-black text-[10px] shadow">
                        ⚡7s
                      </span>
                    )}
                    {p.comboMult > 1 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-orange-500 text-white font-mono font-black text-[10px] shadow">
                        x{p.comboMult}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-lg shrink-0">{p.avatar}</span>
                  <div className="min-w-0 leading-tight">
                    <div className="font-black text-xs truncate">
                      {p.nickname}
                    </div>
                    <div className="text-[10px] font-extrabold opacity-90">
                      {p.wins} {p.wins > 1 ? "manches" : "manche"}
                    </div>
                  </div>
                </div>
                <span className="font-mono font-black text-base shrink-0 bg-black/25 px-2 py-0.5 rounded-lg">
                  {p.score}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
