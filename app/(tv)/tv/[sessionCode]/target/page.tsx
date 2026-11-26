"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Timer, Trophy } from "lucide-react";
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
  questionStartedAt?: string | number | null;
  durationSeconds?: number | null;
  isPaused?: boolean;
  pausedRemainingSeconds?: number | null;
  [key: string]: unknown;
}

type ExtendedGameSession = GameSession & {
  game_state?: BlitzGameState | null;
};

const DEFAULT_DURATION_SECONDS = 45;
const TARGET_COLORS = ["#22d3ee", "#4ade80", "#fb923c", "#f472b6", "#a78bfa"];

function createRandomTarget(index: number): BlitzTarget {
  const roll = Math.random();
  const baseId = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`;

  if (roll < 0.24) {
    return {
      id: `bomb-${baseId}`,
      x: 14 + Math.random() * 72,
      y: 20 + Math.random() * 62,
      radiusPct: 4.3,
      kind: "bomb",
      points: -5,
      vx: (Math.random() - 0.5) * 15,
      vy: (Math.random() - 0.5) * 11,
      hueColor: "#f43f5e",
      fusePhase: Math.random() * Math.PI * 2,
    };
  }

  if (roll < 0.44) {
    return {
      id: `bonus-${baseId}`,
      x: 14 + Math.random() * 72,
      y: 20 + Math.random() * 62,
      radiusPct: 4.1,
      kind: "bonus",
      points: 10,
      vx: (Math.random() - 0.5) * 22,
      vy: (Math.random() - 0.5) * 16,
      hueColor: "#fbbf24",
      fusePhase: Math.random() * Math.PI * 2,
    };
  }

  const paletteColor =
    TARGET_COLORS[Math.floor(Math.random() * TARGET_COLORS.length)] ?? "#4ade80";

  return {
    id: `target-${baseId}`,
    x: 14 + Math.random() * 72,
    y: 20 + Math.random() * 62,
    radiusPct: 4.9,
    kind: "target",
    points: 5,
    vx: (Math.random() - 0.5) * 17,
    vy: (Math.random() - 0.5) * 13,
    hueColor: paletteColor,
    fusePhase: Math.random() * Math.PI * 2,
  };
}

function extractScoreValue(row: PlayerScore | undefined): number {
  if (!row) return 0;
  const rec = row as unknown as { total_score?: number; score?: number };
  const val = rec.total_score ?? rec.score ?? 0;
  return typeof val === "number" && Number.isFinite(val) ? val : 0;
}

function formatClock(seconds: number): string {
  const clamped = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function TargetBlitzGamePage() {
  const params = useParams<{ sessionCode?: string; code?: string }>();
  const rawCode = params?.sessionCode ?? params?.code ?? "";
  const sessionCode = String(rawCode).toUpperCase();
  const supabase = getSupabaseBrowserClient();

  const [session, setSession] = useState<ExtendedGameSession | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number>(
    DEFAULT_DURATION_SECONDS
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<ReturnType<
    NonNullable<typeof supabase>["channel"]
  > | null>(null);

  const targetsRef = useRef<BlitzTarget[]>(
    Array.from({ length: 7 }, (_, i) => createRandomTarget(i))
  );
  const cursorsRef = useRef<Record<string, BlitzCursorPayload>>({});
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingScoreText[]>([]);
  const starsRef = useRef<BackgroundStar[]>(
    Array.from({ length: 65 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 2.4,
      speed: 1.5 + Math.random() * 4.5,
      alpha: 0.35 + Math.random() * 0.65,
    }))
  );

  const scoresRef = useRef<Record<string, number>>(scores);
  scoresRef.current = scores;
  const sessionRef = useRef<ExtendedGameSession | null>(session);
  sessionRef.current = session;
  const playersRef = useRef<SessionPlayer[]>(players);
  playersRef.current = players;

  const roundStatus = session?.status ?? "lobby";
  const blitzState = session?.game_state ?? {};
  const roundStatusRef = useRef<string>(roundStatus);
  roundStatusRef.current = roundStatus;
  const isPausedRef = useRef<boolean>(Boolean(blitzState.isPaused));
  isPausedRef.current = Boolean(blitzState.isPaused);

  const durationSeconds = useMemo(() => {
    const d = Number(blitzState.durationSeconds);
    return Number.isFinite(d) && d > 0 ? d : DEFAULT_DURATION_SECONDS;
  }, [blitzState.durationSeconds]);

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
      if (roundStatusRef.current !== "playing" || isPausedRef.current) return;

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
      nextTargets[hitIndex] = createRandomTarget(hitIndex);
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

  // Boucle de rendu HTML5 Canvas à 60 FPS
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

    const drawConcenticTarget = (
      cx: number,
      cy: number,
      radiusPx: number,
      color: string
    ) => {
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

      // Mèche et étincelle
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
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;

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
      const dirs = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ];
      for (const [dx, dy] of dirs) {
        ctx.beginPath();
        ctx.moveTo(cx + dx * (r - 4), cy + dy * (r - 4));
        ctx.lineTo(cx + dx * (r + tickLen), cy + dy * (r + tickLen));
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.stroke();
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

      // 1. Fond spatial néon
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

      // Étoiles animées
      for (const star of starsRef.current) {
        star.y += star.speed * dt;
        if (star.y > 102) {
          star.y = -2;
          star.x = Math.random() * 100;
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

      const canMove =
        roundStatusRef.current === "playing" && !isPausedRef.current;

      // 2. Mise à jour et dessin des cibles / bonus / bombes
      for (const t of targetsRef.current) {
        if (canMove) {
          t.x += t.vx * dt;
          t.y += t.vy * dt;
          if (t.x < 9 || t.x > 91) {
            t.vx = -t.vx;
            t.x = Math.max(9, Math.min(91, t.x));
          }
          if (t.y < 14 || t.y > 86) {
            t.vy = -t.vy;
            t.y = Math.max(14, Math.min(86, t.y));
          }
        }

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

      // 3. Particules d'impact
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

      // 4. Scores flottants (+10 / -5)
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

      // 5. Viseurs des joueurs
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

  // Synchronisation du chrono de la manche
  useEffect(() => {
    if (blitzState.isPaused && typeof blitzState.pausedRemainingSeconds === "number") {
      setRemainingSeconds(Math.max(0, blitzState.pausedRemainingSeconds));
      return;
    }

    if (roundStatus !== "playing" || !blitzState.questionStartedAt) {
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
    roundStatus,
    blitzState.isPaused,
    blitzState.pausedRemainingSeconds,
    blitzState.questionStartedAt,
    durationSeconds,
  ]);

  // Connexion Supabase (session, joueurs, scores, canal broadcast Target Blitz)
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
        const map: Record<string, number> = { ...scoresRef.current };
        for (const row of scoreRows as PlayerScore[]) {
          map[row.player_id] = Math.max(
            map[row.player_id] ?? 0,
            extractScoreValue(row)
          );
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

  const leaderboard = useMemo(() => {
    const entries = players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar ?? "🎮",
      score: scores[p.id] ?? 0,
    }));
    return entries.sort((a, b) => b.score - a.score);
  }, [players, scores]);

  return (
    <div
      ref={containerRef}
      className="relative w-screen h-screen overflow-hidden select-none bg-[#090516] text-white"
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* HUD supérieur : Classement + Chrono + Salle */}
      <div className="relative z-10 pointer-events-none flex items-start justify-between gap-4 p-4 md:p-6">
        {/* Classement en direct */}
        <div className="w-64 sm:w-72 rounded-2xl border border-cyan-400/40 bg-slate-950/75 backdrop-blur-md p-3 shadow-[0_0_25px_rgba(34,211,238,0.2)]">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-2">
            <span className="text-[11px] font-black uppercase tracking-widest text-cyan-300 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              Live Leaderboard
            </span>
            <span className="font-mono text-[11px] text-amber-300 font-bold">
              {sessionCode || "----"}
            </span>
          </div>

          {leaderboard.length === 0 ? (
            <p className="text-xs text-neutral-400 py-2 text-center">
              En attente des joueurs...
            </p>
          ) : (
            <div className="space-y-1">
              {leaderboard.slice(0, 5).map((entry, idx) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-bold text-amber-400 w-4">
                      #{idx + 1}
                    </span>
                    <span className="truncate font-bold">{entry.nickname}</span>
                  </div>
                  <span className="font-mono font-black text-cyan-200">
                    {entry.score}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chrono central */}
        <div className="flex flex-col items-center">
          <div className="rounded-2xl border-2 border-fuchsia-400/60 bg-slate-950/80 backdrop-blur-md px-6 py-2.5 shadow-[0_0_30px_rgba(217,70,239,0.3)] flex items-center gap-3">
            <Timer className="w-6 h-6 text-amber-400" />
            <span className="font-mono text-3xl sm:text-4xl font-black tracking-wider text-amber-300">
              {formatClock(remainingSeconds)}
            </span>
          </div>
          <span className="mt-1.5 px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-widest bg-fuchsia-500/25 border border-fuchsia-400/40 text-fuchsia-200">
            Target Blitz • {roundStatus}
          </span>
        </div>

        {/* Badge titre / légende */}
        <div className="hidden md:block rounded-2xl border border-amber-400/35 bg-slate-950/75 backdrop-blur-md px-4 py-3 text-right shadow-[0_0_25px_rgba(251,191,36,0.18)]">
          <div className="text-xs font-black uppercase tracking-widest text-amber-300">
            Multiplayer Target Blitz
          </div>
          <div className="text-[11px] text-neutral-300 mt-1 space-y-0.5">
            <div>Cible : <span className="text-emerald-300 font-bold">+5</span> • Bonus : <span className="text-amber-300 font-bold">+10</span></div>
            <div>Bombe : <span className="text-rose-400 font-bold">-5</span></div>
          </div>
        </div>
      </div>

      {/* Overlay d'état si pas en cours */}
      {roundStatus !== "playing" && (
        <div className="absolute inset-0 z-20 bg-black/55 backdrop-blur-xs flex flex-col items-center justify-center text-center p-6">
          <div className="rounded-3xl border border-white/15 bg-slate-950/85 px-8 py-6 shadow-2xl space-y-2">
            <p className="text-3xl font-black tracking-tight text-amber-300">
              {roundStatus === "paused"
                ? "PAUSE"
                : roundStatus === "finished"
                ? "MANCHE TERMINÉE"
                : "PRÊT POUR TARGET BLITZ"}
            </p>
            <p className="text-sm text-neutral-300">
              Vise avec le trackpad de ton téléphone et appuie sur TIRER.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
