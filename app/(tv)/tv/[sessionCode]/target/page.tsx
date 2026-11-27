"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Flame, Swords, Timer, Trophy } from "lucide-react";
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

const DEFAULT_DURATION_SECONDS = 60;
const DEFAULT_TOTAL_ROUNDS = 5;
const MAX_SPAWNED_TARGETS = 8;
const TARGET_COLORS = ["#22d3ee", "#4ade80", "#fb923c", "#f472b6", "#a78bfa"];

function createTopSpawnTarget(index: number): BlitzTarget {
  const roll = Math.random();
  const baseId = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`;
  const startX = 12 + Math.random() * 76;
  const startY = -6 - Math.random() * 14;
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
      hueColor: "#f43f5e",
      fusePhase: Math.random() * Math.PI * 2,
    };
  }

  if (roll < 0.44) {
    return {
      id: `bonus-${baseId}`,
      x: startX,
      y: startY,
      radiusPct: 4.1,
      kind: "bonus",
      points: 10,
      vx: horizontalSpeed * 1.25,
      vy: 23 + Math.random() * 13,
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
    radiusPct: 4.9,
    kind: "target",
    points: 5,
    vx: horizontalSpeed,
    vy: 11 + Math.random() * 11,
    hueColor: paletteColor,
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
  const [remainingSeconds, setRemainingSeconds] = useState<number>(
    DEFAULT_DURATION_SECONDS
  );

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
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingScoreText[]>([]);
  const starsRef = useRef<BackgroundStar[]>(
    Array.from({ length: 65 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 2.4,
      speed: -3 - Math.random() * 6,
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

  const roundStatus = session?.status ?? "lobby";
  const statusLower = String(roundStatus).toLowerCase();
  const blitzState = session?.game_state ?? {};
  const isRoundLaunched = statusLower === "playing" || statusLower === "paused";
  const isPlaying = statusLower === "playing";
  const isPaused = statusLower === "paused" || Boolean(blitzState.isPaused);

  const isRoundLaunchedRef = useRef<boolean>(isRoundLaunched);
  isRoundLaunchedRef.current = isRoundLaunched;
  const isPlayingRef = useRef<boolean>(isPlaying);
  isPlayingRef.current = isPlaying;
  const isPausedRef = useRef<boolean>(isPaused);
  isPausedRef.current = isPaused;

  const totalRounds = useMemo(() => {
    const raw = Number(blitzState.totalRounds);
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : DEFAULT_TOTAL_ROUNDS;
  }, [blitzState.totalRounds]);

  const roundNumber = useMemo(() => {
    const raw = Number(blitzState.roundNumber);
    return Number.isFinite(raw) && raw >= 1 ? Math.round(raw) : 1;
  }, [blitzState.roundNumber]);

  const isSuddenDeath = useMemo(() => {
    return Boolean(blitzState.isSuddenDeath) || suddenDeathPlayerIds.length > 0;
  }, [blitzState.isSuddenDeath, suddenDeathPlayerIds]);

  const durationSeconds = useMemo(() => {
    const d = Number(blitzState.durationSeconds);
    return Number.isFinite(d) && d > 0 ? d : DEFAULT_DURATION_SECONDS;
  }, [blitzState.durationSeconds]);

  const lastRoundKeyRef = useRef<string>("");
  const finalizedRoundKeyRef = useRef<string>("");

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

  useEffect(() => {
    if (!isRoundLaunched) {
      targetsRef.current = [];
      spawnAccumulatorRef.current = 0;
      particlesRef.current = [];
      floatingTextsRef.current = [];
    } else if (targetsRef.current.length === 0) {
      targetsRef.current = Array.from({ length: 5 }, (_, i) =>
        createTopSpawnTarget(i)
      );
    }
  }, [isRoundLaunched]);

  const resetRoundScores = useCallback(async () => {
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

  useEffect(() => {
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
  }, [blitzState.roundWins, blitzState.suddenDeathPlayerIds]);

  useEffect(() => {
    if (!session?.id) return;
    const roundTrigger = `${session.id}-r${roundNumber}-sd${
      blitzState.isSuddenDeath ? 1 : 0
    }`;
    if (lastRoundKeyRef.current === "") {
      lastRoundKeyRef.current = roundTrigger;
      return;
    }
    if (lastRoundKeyRef.current !== roundTrigger) {
      lastRoundKeyRef.current = roundTrigger;
      targetsRef.current = [];
      spawnAccumulatorRef.current = 0;
      particlesRef.current = [];
      floatingTextsRef.current = [];
      void resetRoundScores();
    }
  }, [session?.id, roundNumber, blitzState.isSuddenDeath, resetRoundScores]);

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
      if (!isRoundLaunchedRef.current || !isPlayingRef.current || isPausedRef.current) {
        return;
      }

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
      targetsRef.current = nextTargets;

      if (hitTarget.kind === "bomb") {
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

      const canMove = isRoundLaunchedRef.current && isPlayingRef.current && !isPausedRef.current;

      for (const star of starsRef.current) {
        if (canMove) {
          star.y += star.speed * dt;
          if (star.y < -2) {
            star.y = 102;
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

      if (isRoundLaunchedRef.current) {
        if (canMove) {
          spawnAccumulatorRef.current += dt;
          if (
            spawnAccumulatorRef.current >= 1.15 &&
            targetsRef.current.length < MAX_SPAWNED_TARGETS
          ) {
            spawnAccumulatorRef.current = 0;
            targetsRef.current.push(
              createTopSpawnTarget(targetsRef.current.length)
            );
          }
        }

        const survivingTargets: BlitzTarget[] = [];
        for (const t of targetsRef.current) {
          if (canMove) {
            t.x += t.vx * dt;
            t.y += t.vy * dt;

            if (t.x < 7) {
              t.x = 7;
              t.vx = Math.abs(t.vx);
            } else if (t.x > 93) {
              t.x = 93;
              t.vx = -Math.abs(t.vx);
            }

            if (t.y > 108) {
              continue;
            }
          }

          survivingTargets.push(t);

          const cx = (t.x / 100) * width;
          const cy = (t.y / 100) * height;
          const radiusPx = Math.max(
            24,
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
    if (isPaused && typeof blitzState.pausedRemainingSeconds === "number") {
      setRemainingSeconds(Math.max(0, blitzState.pausedRemainingSeconds));
      return;
    }

    if (!isPlaying || !blitzState.questionStartedAt) {
      setRemainingSeconds(durationSeconds);
      return;
    }

    const startMs =
      typeof blitzState.questionStartedAt === "number"
        ? blitzState.questionStartedAt
        : Date.parse(String(blitzState.questionStartedAt));

    if (Number.isNaN(startMs)) {
      setRemainingSeconds(durationSeconds);
      return;
    }

    const updateTimer = () => {
      const elapsed = Math.max(0, (Date.now() - startMs) / 1000);
      setRemainingSeconds(Math.max(0, durationSeconds - elapsed));
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 200);
    return () => window.clearInterval(interval);
  }, [
    isPlaying,
    isPaused,
    blitzState.pausedRemainingSeconds,
    blitzState.questionStartedAt,
    durationSeconds,
  ]);

  useEffect(() => {
    if (!isPlaying || remainingSeconds > 0 || !session?.id) return;
    const roundKey = `${session.id}-r${roundNumber}-sd${isSuddenDeath ? 1 : 0}`;
    if (finalizedRoundKeyRef.current === roundKey) return;
    finalizedRoundKeyRef.current = roundKey;

    const candidatePlayers =
      suddenDeathIdsRef.current.length > 0
        ? playersRef.current.filter((p) =>
            suddenDeathIdsRef.current.includes(p.id)
          )
        : playersRef.current;

    if (candidatePlayers.length === 0) return;

    let bestScore = -1;
    let winners: string[] = [];
    for (const p of candidatePlayers) {
      const sc = scoresRef.current[p.id] ?? 0;
      if (sc > bestScore) {
        bestScore = sc;
        winners = [p.id];
      } else if (sc === bestScore) {
        winners.push(p.id);
      }
    }

    if (bestScore <= 0 || winners.length === 0) return;

    const nextWins = { ...roundWinsRef.current };
    for (const wId of winners) {
      nextWins[wId] = (nextWins[wId] ?? 0) + 1;
    }
    setRoundWins(nextWins);
    roundWinsRef.current = nextWins;

    if (roundNumber >= totalRounds || isSuddenDeath) {
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
        setSuddenDeathPlayerIds(tiedIds);
        suddenDeathIdsRef.current = tiedIds;
        const nextState: BlitzGameState = {
          ...blitzState,
          roundNumber: roundNumber + 1,
          isSuddenDeath: true,
          suddenDeathPlayerIds: tiedIds,
          roundWins: nextWins,
          questionStartedAt: Date.now(),
        };
        if (supabase) {
          void supabase
            .from("game_sessions")
            .update({ game_state: nextState })
            .eq("id", session.id);
        }
        return;
      }
    }

    const nextState: BlitzGameState = {
      ...blitzState,
      roundWins: nextWins,
    };
    if (supabase) {
      void supabase
        .from("game_sessions")
        .update({ game_state: nextState })
        .eq("id", session.id);
    }
  }, [
    isPlaying,
    remainingSeconds,
    session?.id,
    roundNumber,
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
      if (scoreRows) {
        const map: Record<string, number> = {};
        for (const row of scoreRows as PlayerScore[]) {
          map[row.player_id] = extractScoreValue(row);
        }
        setScores(map);
        scoresRef.current = map;
      }
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

  const matchSummary = useMemo(() => {
    if (players.length === 0) return { winnerName: null, tiedNames: [] as string[] };
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
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* Haut de l'écran : manche + chrono */}
      <div className="relative z-10 pointer-events-none flex items-start justify-between gap-4 p-4 md:p-6">
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
            Salle {sessionCode || "----"} • {roundStatus.toUpperCase()}
          </div>
        </div>

        <div className="flex flex-col items-end">
          <div className="rounded-2xl border-2 border-fuchsia-400/60 bg-slate-950/80 backdrop-blur-md px-6 py-2.5 shadow-[0_0_30px_rgba(217,70,239,0.3)] flex items-center gap-3">
            <Timer className="w-6 h-6 text-amber-400" />
            <span className="font-mono text-3xl sm:text-4xl font-black tracking-wider text-amber-300">
              {formatClock(remainingSeconds)}
            </span>
          </div>
          {matchSummary.winnerName && (
            <span className="mt-1.5 px-3 py-0.5 rounded-full text-xs font-black bg-amber-400/20 border border-amber-300/50 text-amber-200 flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-amber-300" />
              En tête : {matchSummary.winnerName}
            </span>
          )}
          {matchSummary.tiedNames.length > 1 && (
            <span className="mt-1.5 px-3 py-0.5 rounded-full text-xs font-black bg-rose-500/25 border border-rose-400/50 text-rose-200">
              Égalité : {matchSummary.tiedNames.join(" vs ")}
            </span>
          )}
        </div>
      </div>

      {/* Overlay quand la manche n'est pas en cours de jeu */}
      {!isPlaying && (
        <div className="absolute inset-0 z-20 bg-black/55 backdrop-blur-xs flex flex-col items-center justify-center text-center p-6 pointer-events-none">
          <div className="rounded-3xl border border-white/15 bg-slate-950/90 px-8 py-6 shadow-2xl space-y-2 max-w-md">
            <p className="text-3xl font-black tracking-tight text-amber-300">
              {isPaused
                ? "PAUSE"
                : matchSummary.winnerName && roundNumber >= totalRounds
                ? `VICTOIRE : ${matchSummary.winnerName}`
                : isSuddenDeath
                ? "MORT SUBITE"
                : "EN ATTENTE DU LANCEMENT"}
            </p>
            <p className="text-sm text-neutral-300">
              {isPaused
                ? "La manche est mise en pause."
                : "Clique sur Lancer la manche dans l'admin pour faire apparaître les cibles."}
            </p>
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
                    <div className="font-black text-xs truncate">{p.nickname}</div>
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
