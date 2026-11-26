"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  Bomb,
  Crosshair,
  Flame,
  Sparkles,
  Timer,
  Trophy,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
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
  radius: number;
  kind: "target" | "bonus" | "bomb";
  points: number;
  vx: number;
  vy: number;
}

interface HitEffect {
  id: string;
  x: number;
  y: number;
  label: string;
  color: string;
}

interface BlitzGameState {
  mode?: string;
  questionStartedAt?: string | number | null;
  durationSeconds?: number | null;
  isPaused?: boolean;
  pausedRemainingSeconds?: number | null;
  stunnedUntil?: Record<string, number>;
  [key: string]: unknown;
}

type ExtendedGameSession = GameSession & {
  game_state?: BlitzGameState | null;
};

const DEFAULT_DURATION_SECONDS = 45;

function createRandomTarget(index: number): BlitzTarget {
  const roll = Math.random();
  if (roll < 0.22) {
    return {
      id: `bomb-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      x: 12 + Math.random() * 76,
      y: 16 + Math.random() * 68,
      radius: 4.5,
      kind: "bomb",
      points: 0,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.5) * 10,
    };
  }
  if (roll < 0.42) {
    return {
      id: `bonus-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      x: 12 + Math.random() * 76,
      y: 16 + Math.random() * 68,
      radius: 4.2,
      kind: "bonus",
      points: 3,
      vx: (Math.random() - 0.5) * 22,
      vy: (Math.random() - 0.5) * 16,
    };
  }
  return {
    id: `target-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    x: 12 + Math.random() * 76,
    y: 16 + Math.random() * 68,
    radius: 5.2,
    kind: "target",
    points: 1,
    vx: (Math.random() - 0.5) * 16,
    vy: (Math.random() - 0.5) * 12,
  };
}

function extractScoreValue(row: PlayerScore | undefined): number {
  if (!row) return 0;
  const rec = row as unknown as { total_score?: number; score?: number };
  const val = rec.total_score ?? rec.score ?? 0;
  return typeof val === "number" && Number.isFinite(val) ? val : 0;
}

export default function TargetBlitzGamePage() {
  const params = useParams<{ sessionCode?: string; code?: string }>();
  const rawCode = params?.sessionCode ?? params?.code ?? "";
  const sessionCode = String(rawCode).toUpperCase();
  const supabase = getSupabaseBrowserClient();

  const [session, setSession] = useState<ExtendedGameSession | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [cursors, setCursors] = useState<Record<string, BlitzCursorPayload>>({});
  const [targets, setTargets] = useState<BlitzTarget[]>(() =>
    Array.from({ length: 7 }, (_, i) => createRandomTarget(i))
  );
  const [effects, setEffects] = useState<HitEffect[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(
    DEFAULT_DURATION_SECONDS
  );

  const channelRef = useRef<ReturnType<
    NonNullable<typeof supabase>["channel"]
  > | null>(null);
  const targetsRef = useRef<BlitzTarget[]>(targets);
  targetsRef.current = targets;
  const scoresRef = useRef<Record<string, number>>(scores);
  scoresRef.current = scores;
  const sessionRef = useRef<ExtendedGameSession | null>(session);
  sessionRef.current = session;

  const roundStatus = session?.status ?? "lobby";
  const blitzState = session?.game_state ?? {};
  const durationSeconds = useMemo(() => {
    const d = Number(blitzState.durationSeconds);
    return Number.isFinite(d) && d > 0 ? d : DEFAULT_DURATION_SECONDS;
  }, [blitzState.durationSeconds]);

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

  const addHitEffect = useCallback(
    (x: number, y: number, label: string, color: string) => {
      const id = `fx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setEffects((prev) => [...prev.slice(-14), { id, x, y, label, color }]);
      window.setTimeout(() => {
        setEffects((prev) => prev.filter((item) => item.id !== id));
      }, 650);
    },
    []
  );

  const handleShootPayload = useCallback(
    (shot: BlitzShootPayload) => {
      if (roundStatus !== "playing" || blitzState.isPaused) return;

      const hitIndex = targetsRef.current.findIndex((t) => {
        const dx = t.x - shot.x;
        const dy = (t.y - shot.y) * 0.75;
        const dist = Math.hypot(dx, dy);
        return dist <= t.radius + 2.2;
      });

      if (hitIndex === -1) {
        addHitEffect(shot.x, shot.y, "RATÉ", shot.color);
        return;
      }

      const hitTarget = targetsRef.current[hitIndex];
      if (!hitTarget) return;

      const nextTargets = [...targetsRef.current];
      nextTargets[hitIndex] = createRandomTarget(hitIndex);
      setTargets(nextTargets);
      targetsRef.current = nextTargets;

      if (hitTarget.kind === "bomb") {
        const currentScore = scoresRef.current[shot.playerId] ?? 0;
        const nextScore = Math.max(0, currentScore - 2);
        setScores((prev) => {
          const updated = { ...prev, [shot.playerId]: nextScore };
          scoresRef.current = updated;
          return updated;
        });
        void persistScoreToDb(shot.playerId, nextScore);
        addHitEffect(hitTarget.x, hitTarget.y, "BOMBE -2", "#f43f5e");

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

      const currentScore = scoresRef.current[shot.playerId] ?? 0;
      const nextScore = currentScore + hitTarget.points;
      setScores((prev) => {
        const updated = { ...prev, [shot.playerId]: nextScore };
        scoresRef.current = updated;
        return updated;
      });
      void persistScoreToDb(shot.playerId, nextScore);
      addHitEffect(
        hitTarget.x,
        hitTarget.y,
        `+${hitTarget.points}`,
        hitTarget.kind === "bonus" ? "#fbbf24" : shot.color
      );
    },
    [roundStatus, blitzState.isPaused, addHitEffect, persistScoreToDb]
  );

  // Déplacement fluide des cibles pendant la manche
  useEffect(() => {
    if (roundStatus !== "playing" || blitzState.isPaused) return;

    let lastTime = performance.now();
    let rafId = 0;

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      setTargets((prev) =>
        prev.map((t) => {
          let nx = t.x + t.vx * dt;
          let ny = t.y + t.vy * dt;
          let nvx = t.vx;
          let nvy = t.vy;

          if (nx < 8 || nx > 92) {
            nvx = -nvx;
            nx = Math.max(8, Math.min(92, nx));
          }
          if (ny < 12 || ny > 88) {
            nvy = -nvy;
            ny = Math.max(12, Math.min(88, ny));
          }
          return { ...t, x: nx, y: ny, vx: nvx, vy: nvy };
        })
      );

      rafId = window.requestAnimationFrame(step);
    };

    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [roundStatus, blitzState.isPaused]);

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
        setCursors((prev) => ({
          ...prev,
          [payload.playerId]: payload,
        }));
      })
      .on("broadcast", { event: "shoot" }, (msg) => {
        if (!active) return;
        const payload = msg.payload as BlitzShootPayload | undefined;
        if (!payload?.playerId) return;
        setCursors((prev) => ({
          ...prev,
          [payload.playerId]: payload,
        }));
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
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col p-4 md:p-6 select-none overflow-hidden">
      {/* En-tête */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-amber-400 font-bold">
              Salle {sessionCode || "----"}
            </div>
            <h1 className="text-2xl font-black tracking-tight">
              Target Blitz
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-2">
            <Timer className="w-5 h-5 text-cyan-300" />
            <span className="font-mono text-2xl font-black text-cyan-200">
              {Math.ceil(remainingSeconds)}s
            </span>
          </div>

          <span
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
              roundStatus === "playing"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : roundStatus === "paused"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "bg-sky-500/20 text-sky-300 border border-sky-500/40"
            }`}
          >
            {roundStatus}
          </span>
        </div>
      </header>

      {/* Zone de jeu + Classement */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 pt-5 min-h-0">
        {/* Arène de tir */}
        <div className="lg:col-span-9 relative rounded-3xl border border-white/15 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.12),rgba(10,10,10,0.96))] overflow-hidden min-h-[420px]">
          {roundStatus !== "playing" && (
            <div className="absolute inset-0 z-20 bg-black/65 backdrop-blur-xs flex flex-col items-center justify-center text-center p-6 space-y-2">
              <Sparkles className="w-8 h-8 text-amber-400" />
              <p className="text-2xl font-black">
                {roundStatus === "paused"
                  ? "Partie en pause"
                  : roundStatus === "finished"
                  ? "Manche terminée !"
                  : "En attente du lancement..."}
              </p>
              <p className="text-sm text-neutral-300">
                Utilise le trackpad sur ton téléphone pour viser et TIRER.
              </p>
            </div>
          )}

          {/* Cibles, bonus et bombes */}
          {targets.map((t) => (
            <div
              key={t.id}
              style={{
                left: `${t.x}%`,
                top: `${t.y}%`,
                width: `${t.radius * 2.2}%`,
                aspectRatio: "1 / 1",
              }}
              className={`-translate-x-1/2 -translate-y-1/2 absolute rounded-full flex items-center justify-center shadow-lg transition-transform ${
                t.kind === "bomb"
                  ? "bg-rose-600/90 border-2 border-rose-300 text-white"
                  : t.kind === "bonus"
                  ? "bg-amber-400 text-black border-2 border-amber-100"
                  : "bg-cyan-400/90 text-slate-950 border-2 border-cyan-100"
              }`}
            >
              {t.kind === "bomb" ? (
                <Bomb className="w-5 h-5" />
              ) : (
                <span className="font-mono font-black text-xs sm:text-sm">
                  +{t.points}
                </span>
              )}
            </div>
          ))}

          {/* Viseurs des joueurs */}
          {Object.values(cursors).map((c) => (
            <div
              key={c.playerId}
              style={{
                left: `${c.x}%`,
                top: `${c.y}%`,
                borderColor: c.color || "#22d3ee",
              }}
              className="pointer-events-none -translate-x-1/2 -translate-y-1/2 absolute z-10 flex flex-col items-center transition-all duration-75"
            >
              <div
                style={{ borderColor: c.color || "#22d3ee" }}
                className="w-9 h-9 rounded-full border-2 flex items-center justify-center bg-black/30"
              >
                <Crosshair
                  className="w-5 h-5"
                  style={{ color: c.color || "#22d3ee" }}
                />
              </div>
              <span
                style={{ backgroundColor: c.color || "#22d3ee" }}
                className="mt-1 px-2 py-0.5 rounded-full text-[10px] font-black text-black shadow"
              >
                {c.playerName}
              </span>
            </div>
          ))}

          {/* Effets de tir */}
          {effects.map((fx) => (
            <div
              key={fx.id}
              style={{
                left: `${fx.x}%`,
                top: `${fx.y}%`,
                color: fx.color,
              }}
              className="pointer-events-none -translate-x-1/2 -translate-y-1/2 absolute z-30 font-mono font-black text-base drop-shadow"
            >
              {fx.label}
            </div>
          ))}
        </div>

        {/* Classement en direct */}
        <aside className="lg:col-span-3 rounded-3xl bg-white/5 border border-white/10 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 font-bold text-base border-b border-white/10 pb-2.5">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span>Scores</span>
          </div>

          {leaderboard.length === 0 ? (
            <p className="text-xs text-neutral-400 my-auto text-center">
              Aucun joueur connecté.
            </p>
          ) : (
            <div className="space-y-2 overflow-y-auto flex-1">
              {leaderboard.map((entry, idx) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-2xl bg-black/35 border border-white/10 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs font-bold text-neutral-400 w-4">
                      #{idx + 1}
                    </span>
                    <span className="text-lg">{entry.avatar}</span>
                    <span className="font-bold text-sm truncate">
                      {entry.nickname}
                    </span>
                  </div>
                  <span className="font-mono font-black text-amber-300 text-sm">
                    {entry.score} pts
                  </span>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
