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
  kind: "target" | "bonus" | "bomb";
  points: number;
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

interface BackgroundStar {
  x: number;
  y: number;
  size: number;
  speed: number;
  alpha: number;
}

interface BlitzGameState {
  mode?: string;
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
  crosshairSvgText: string | null;
  tintedCrosshairCache: Record<string, HTMLImageElement>;
}

const ROUND_DURATION_SECONDS = 60;
const COUNTDOWN_SECONDS = 3;
const ROUND_WINNER_DELAY_MS = 2000;
const DEFAULT_TOTAL_ROUNDS = 5;
const MAX_SPAWNED_TARGETS = 11;
const TARGET_COLORS = ["#22d3ee", "#4ade80", "#fb923c", "#f472b6", "#a78bfa"];

function getAudioContext(soundEnabled: boolean): AudioContext | null {
  if (!soundEnabled || typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    return ctx;
  } catch {
    return null;
  }
}

function playCountdownBeep(soundEnabled: boolean, isFinalGo: boolean): void {
  const ctx = getAudioContext(soundEnabled);
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
    window.setTimeout(() => {
      if (ctx.state !== "closed") void ctx.close().catch(() => {});
    }, 350);
  } catch {
    // Ignore audio errors
  }
}

function playShotSound(soundEnabled: boolean): void {
  const ctx = getAudioContext(soundEnabled);
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.065);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);
    window.setTimeout(() => {
      if (ctx.state !== "closed") void ctx.close().catch(() => {});
    }, 150);
  } catch {
    // Ignore audio errors
  }
}

function playTargetHitSound(soundEnabled: boolean, didSplit: boolean): void {
  const ctx = getAudioContext(soundEnabled);
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

    window.setTimeout(() => {
      if (ctx.state !== "closed") void ctx.close().catch(() => {});
    }, 250);
  } catch {
    // Ignore audio errors
  }
}

function playBonusHitSound(soundEnabled: boolean): void {
  const ctx = getAudioContext(soundEnabled);
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
    window.setTimeout(() => {
      if (ctx.state !== "closed") void ctx.close().catch(() => {});
    }, 350);
  } catch {
    // Ignore audio errors
  }
}

function playBombExplosionSound(soundEnabled: boolean): void {
  const ctx = getAudioContext(soundEnabled);
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

    window.setTimeout(() => {
      if (ctx.state !== "closed") void ctx.close().catch(() => {});
    }, 450);
  } catch {
    // Ignore audio errors
  }
}

function playRoundEndSound(soundEnabled: boolean): void {
  const ctx = getAudioContext(soundEnabled);
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
    window.setTimeout(() => {
      if (ctx.state !== "closed") void ctx.close().catch(() => {});
    }, 550);
  } catch {
    // Ignore audio errors
  }
}

function playApplauseSound(soundEnabled: boolean): () => void {
  const ctx = getAudioContext(soundEnabled);
  if (!ctx) return () => {};
  const timeouts: number[] = [];

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

    const closeId = window.setTimeout(() => {
      if (ctx.state !== "closed") {
        void ctx.close().catch(() => {});
      }
    }, (totalDuration + 0.2) * 1000);
    timeouts.push(closeId);
  } catch {
    // Ignore audio errors
  }

  return () => {
    timeouts.forEach((id) => window.clearTimeout(id));
    if (ctx.state !== "closed") {
      void ctx.close().catch(() => {});
    }
  };
}

function isBotPlayer(player: SessionPlayer): boolean {
  const rec = player as unknown as {
    is_bot?: boolean;
    player_token?: string | null;
  };
  if (rec.is_bot === true) return true;
  const token = String(rec.player_token ?? "").toLowerCase();
  if (token.startsWith("bot-") || token.startsWith("bot_")) return true;
  return String(player.nickname ?? "").trim().toUpperCase().startsWith("[BOT]");
}

function createTopDownTarget(index: number): BlitzTarget {
  const roll = Math.random();
  const baseId = `${Date.now()}-top-${index}-${Math.random().toString(36).slice(2, 6)}`;
  const startX = 12 + Math.random() * 76;
  const startY = -6 - Math.random() * 10;
  const horizontalSpeed =
    (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 14);

  if (roll < 0.24) {
    return {
      id: `bomb-${baseId}`,
      x: startX,
      y: startY,
      radiusPct: 4.3,
      kind: "bomb",
      points: -5,
      vx: horizontalSpeed,
      vy: 12 + Math.random() * 9,
      gravity: 0,
      canSplit: false,
      hueColor: "#f43f5e",
      fusePhase: Math.random() * Math.PI * 2,
    };
  }

  if (roll < 0.44) {
    return {
      id: `bonus-${baseId}`,
      x: startX,
      y: startY,
      radiusPct: 4.0,
      kind: "bonus",
      points: 10,
      vx: horizontalSpeed * 1.25,
      vy: 23 + Math.random() * 13,
      gravity: 0,
      canSplit: false,
      hueColor: "#fbbf24",
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

  if (roll < 0.22) {
    return {
      id: `bomb-${baseId}`,
      x: startX,
      y: startY,
      radiusPct: 4.3,
      kind: "bomb",
      points: -5,
      vx: horizontalSpeed,
      vy: upwardImpulse,
      gravity,
      canSplit: false,
      hueColor: "#f43f5e",
      fusePhase: Math.random() * Math.PI * 2,
    };
  }

  if (roll < 0.42) {
    return {
      id: `bonus-${baseId}`,
      x: startX,
      y: startY,
      radiusPct: 4.0,
      kind: "bonus",
      points: 10,
      vx: horizontalSpeed * 1.2,
      vy: upwardImpulse * 1.12,
      gravity,
      canSplit: false,
      hueColor: "#fbbf24",
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

export default function TargetBlitzGamePage() {
  const params = useParams<{ sessionCode?: string; code?: string }>();
  const router = useRouter();
  const rawCode = params?.sessionCode ?? params?.code ?? "";
  const sessionCode = String(rawCode).toUpperCase();
  const supabase = getSupabaseBrowserClient();

  const [session, setSession] = useState<ExtendedGameSession | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
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

  const soundEnabledRef = useRef<boolean>(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<ReturnType<
    NonNullable<typeof supabase>["channel"]
  > | null>(null);

  const spritesRef = useRef<SvgSpriteAssets>({
    targetImg: null,
    bonusImg: null,
    bombImg: null,
    crosshairSvgText: null,
    tintedCrosshairCache: {},
  });

  const targetsRef = useRef<BlitzTarget[]>([]);
  const spawnAccumulatorRef = useRef<number>(0);
  const cursorsRef = useRef<Record<string, BlitzCursorPayload>>({});
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
  const playersRef = useRef<SessionPlayer[]>(players);
  playersRef.current = players;
  const roundWinsRef = useRef<Record<string, number>>(roundWins);
  roundWinsRef.current = roundWins;
  const suddenDeathIdsRef = useRef<string[]>(suddenDeathPlayerIds);
  suddenDeathIdsRef.current = suddenDeathPlayerIds;
  const roundNumberRef = useRef<number>(roundNumber);
  roundNumberRef.current = roundNumber;
  const hasPlayedApplauseRef = useRef<boolean>(false);

  const roundStatus = session?.status ?? "lobby";
  const statusLower = String(roundStatus).toLowerCase();
  const blitzState = session?.game_state ?? {};
  const isPaused = statusLower === "paused" || Boolean(blitzState.isPaused);
  const isCountingDown = countdownValue !== null && countdownValue > 0;
  const isActivePlay =
    isRoundRunning && !isCountingDown && !roundEnded && !isPaused;

  const isRoundRunningRef = useRef<boolean>(isRoundRunning);
  isRoundRunningRef.current = isRoundRunning;
  const roundEndedRef = useRef<boolean>(roundEnded);
  roundEndedRef.current = roundEnded;
  const isPausedRef = useRef<boolean>(isPaused);
  isPausedRef.current = isPaused;
  const isActivePlayRef = useRef<boolean>(isActivePlay);
  isActivePlayRef.current = isActivePlay;

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
        playCountdownBeep(true, false);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;

    const loadAllAssets = async () => {
      const [targetImg, bonusImg, bombImg, crosshairRes] = await Promise.all([
        loadSvgImage("/cible.svg"),
        loadSvgImage("/cible_Bonus.svg"),
        loadSvgImage("/Bombes.svg"),
        fetch("/viseur.svg")
          .then((r) => (r.ok ? r.text() : null))
          .catch(() => null),
      ]);

      if (!active) return;

      spritesRef.current.targetImg = targetImg;
      spritesRef.current.bonusImg = bonusImg;
      spritesRef.current.bombImg = bombImg;
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

    const currentSession = sessionRef.current;
    if (!supabase || !currentSession?.id || playersRef.current.length === 0) {
      return;
    }

    const rows = playersRef.current.map((p) => ({
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

      await resetRoundScores();
    },
    [resetRoundScores]
  );

  useEffect(() => {
    if (countdownValue === null) return;

    if (countdownValue <= 0) {
      playCountdownBeep(soundEnabledRef.current, true);
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

    playCountdownBeep(soundEnabledRef.current, false);
    const timer = window.setTimeout(() => {
      setCountdownValue((prev) => (prev === null ? null : prev - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdownValue]);

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
          playApplauseSound(soundEnabledRef.current);
        }
      }
    }, ROUND_WINNER_DELAY_MS);

    return () => window.clearTimeout(timerId);
  }, [roundEnded, roundNumber, totalRounds, isSuddenDeath]);

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

      playShotSound(soundEnabledRef.current);
      spawnBurst(shot.x, shot.y, resolvedColor, 10);

      const hitIndex = targetsRef.current.findIndex((t) => {
        const dx = t.x - shot.x;
        const dy = (t.y - shot.y) * 0.72;
        return Math.hypot(dx, dy) <= t.radiusPct + 2.4;
      });

      if (hitIndex === -1) return;

      const hitTarget = targetsRef.current[hitIndex];
      if (!hitTarget) return;

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

      if (hitTarget.kind === "bomb") {
        playBombExplosionSound(soundEnabledRef.current);
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

      if (hitTarget.kind === "bonus") {
        playBonusHitSound(soundEnabledRef.current);
      } else {
        playTargetHitSound(soundEnabledRef.current, didSplit);
      }

      const deltaPts = hitTarget.kind === "bonus" ? 10 : 5;
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
        hitTarget.kind === "bonus" ? "#fbbf24" : hitTarget.hueColor,
        24
      );
      spawnFloatingLabel(
        hitTarget.x,
        hitTarget.y,
        `+${deltaPts}`,
        hitTarget.kind === "bonus" ? "#fde047" : "#ffffff"
      );
    },
    [persistScoreToDb, spawnBurst, spawnFloatingLabel]
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
      label: string
    ) => {
      const r = 24;
      const tintedImg = getTintedCrosshair(color);

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;

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
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        const tickLen = 9;
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
      const textWidth = ctx.measureText(label).width;
      const pillW = textWidth + 16;
      const pillH = 22;
      const pillX = cx - pillW / 2;
      const pillY = cy + r + 10;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 11);
      ctx.fill();

      ctx.fillStyle = "#09090b";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, cx, pillY + pillH / 2 + 0.5);
      ctx.restore();
    };

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const timeSec = now / 1000;

      const rect = container.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      const bgGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.45,
        40,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.78
      );
      bgGrad.addColorStop(0, "#2e1065");
      bgGrad.addColorStop(0.55, "#14082b");
      bgGrad.addColorStop(1, "#070412");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      const canMove = isActivePlayRef.current;

      for (const star of starsRef.current) {
        if (canMove) {
          star.y += star.speed * dt;
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
        ctx.fillStyle = `rgba(224, 231, 255, ${star.alpha})`;
        ctx.fill();
      }

      if (isRoundRunningRef.current && !roundEndedRef.current) {
        if (canMove) {
          spawnAccumulatorRef.current += dt;
          if (
            spawnAccumulatorRef.current >= 1.0 &&
            targetsRef.current.length < MAX_SPAWNED_TARGETS
          ) {
            spawnAccumulatorRef.current = 0;
            const burstCount = Math.random() < 0.35 ? 2 : 1;
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
          } else {
            drawConcenticTarget(cx, cy, radiusPx, t.hueColor);
          }
        }
        targetsRef.current = survivingTargets;
      }

      if (canMove) {
        const nowMs = Date.now();
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

          const colorStyle = getUniquePlayerColor(bot.id, playersRef.current);
          let state = botRuntimeRef.current[bot.id];
          if (!state) {
            state = {
              x: 20 + ((idx * 23) % 60),
              y: 45 + ((idx * 13) % 30),
              targetId: null,
              cooldownSec: 0.4 + Math.random() * 0.6,
              stunnedUntilMs: 0,
            };
            botRuntimeRef.current[bot.id] = state;
          }

          if (state.stunnedUntilMs > nowMs) {
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
          const maxStep = 36 * dt;

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
            state.cooldownSec = 0.7 + Math.random() * 0.7;
            state.targetId = null;
            const aimJitterX = (Math.random() - 0.5) * 3.0;
            const aimJitterY = (Math.random() - 0.5) * 3.0;
            handleShootPayloadRef.current({
              playerId: bot.id,
              playerName: bot.nickname,
              color: colorStyle.bgHex,
              x: Math.max(2, Math.min(98, state.x + aimJitterX)),
              y: Math.max(4, Math.min(95, state.y + aimJitterY)),
              timestamp: nowMs,
            });
          }
        }
      }

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
        drawPlayerCrosshair(
          (c.x / 100) * width,
          (c.y / 100) * height,
          color,
          c.playerName || playerObj?.nickname || "Joueur"
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

    playRoundEndSound(soundEnabledRef.current);
    setIsRoundRunning(false);
    setRoundEnded(true);
    targetsRef.current = [];
    particlesRef.current = [];
    floatingTextsRef.current = [];

    const candidatePlayers =
      suddenDeathIdsRef.current.length > 0
        ? playersRef.current.filter((p) =>
            suddenDeathIdsRef.current.includes(p.id)
          )
        : playersRef.current;

    let bestScore = -1;
    let winners: SessionPlayer[] = [];
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
        setPlayers(playersRows as SessionPlayer[]);
      }
      if (scoreRows && !ignoreNextScoreFetchRef.current) {
        const map: Record<string, number> = {};
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
    const sorted = [...players].sort((a, b) => {
      const winsDiff = (roundWins[b.id] ?? 0) - (roundWins[a.id] ?? 0);
      if (winsDiff !== 0) return winsDiff;
      return (scores[b.id] ?? 0) - (scores[a.id] ?? 0);
    });
    return sorted.slice(0, 6).map((p) => {
      const colorStyle = getUniquePlayerColor(p.id, players);
      return {
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar ?? "🎮",
        score: scores[p.id] ?? 0,
        wins: roundWins[p.id] ?? 0,
        colorStyle,
      };
    });
  }, [players, scores, roundWins]);

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
    let leaders: SessionPlayer[] = [];
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
      className="relative w-screen h-screen overflow-hidden select-none bg-[#090516] text-white flex flex-col justify-between"
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

            <div className="rounded-2xl border-2 border-fuchsia-400/60 bg-slate-950/80 backdrop-blur-md px-6 py-2.5 shadow-[0_0_30px_rgba(217,70,239,0.3)] flex items-center gap-3">
              <Timer className="w-6 h-6 text-amber-400" />
              <span className="font-mono text-3xl sm:text-4xl font-black tracking-wider text-amber-300">
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
                className="h-14 rounded-2xl border-2 px-2.5 py-1.5 shadow-lg flex items-center justify-between gap-1.5 min-w-0"
              >
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
