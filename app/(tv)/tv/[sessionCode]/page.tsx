"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { QrCode, Users, Tv, Sparkles } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { clientEnv } from "@/lib/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { INITIAL_GAMES, type CatalogGame } from "@/features/games/catalog";
import type {
  GameSession,
  PlayerScore,
  SessionPlayer,
  SessionStatus,
} from "@/types/game.types";

const AVATAR_EMOJIS: Record<string, string> = {
  gamepad: "🎮",
  fox: "🦊",
  cat: "🐱",
  dog: "🐶",
  robot: "🤖",
  alien: "👽",
  crown: "👑",
  flame: "🔥",
  star: "⭐",
  rocket: "🚀",
};

const FIXED_TV_ALIASES = new Set(["SALON", "TV", "MAIN", "HOME"]);

export default function TvSessionPage() {
  const params = useParams<{ sessionCode: string }>();
  const requestedCode = (params?.sessionCode ?? "").toUpperCase();
  const isFixedTvScreen = FIXED_TV_ALIASES.has(requestedCode);

  const [origin, setOrigin] = useState<string>("");
  const [session, setSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [scores, setScores] = useState<PlayerScore[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !requestedCode) return;

    let isMounted = true;
    let playersChannel: ReturnType<typeof supabase.channel> | null = null;
    let scoresChannel: ReturnType<typeof supabase.channel> | null = null;

    const loadPlayersAndScores = async (targetSessionId: string) => {
      const [{ data: playersData }, { data: scoresData }] = await Promise.all([
        supabase
          .from("session_players")
          .select("*")
          .eq("session_id", targetSessionId),
        supabase
          .from("player_scores")
          .select("*")
          .eq("session_id", targetSessionId),
      ]);

      if (!isMounted) return;
      if (playersData) {
        setPlayers(playersData as SessionPlayer[]);
      }
      if (scoresData) {
        setScores(scoresData as PlayerScore[]);
      }
    };

    const bindSessionChildren = (targetSessionId: string) => {
      if (playersChannel) {
        void supabase.removeChannel(playersChannel);
      }
      if (scoresChannel) {
        void supabase.removeChannel(scoresChannel);
      }

      void loadPlayersAndScores(targetSessionId);

      playersChannel = supabase
        .channel(`tv-players-${targetSessionId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "session_players",
            filter: `session_id=eq.${targetSessionId}`,
          },
          () => {
            void loadPlayersAndScores(targetSessionId);
          }
        )
        .subscribe();

      scoresChannel = supabase
        .channel(`tv-scores-${targetSessionId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "player_scores",
            filter: `session_id=eq.${targetSessionId}`,
          },
          () => {
            void loadPlayersAndScores(targetSessionId);
          }
        )
        .subscribe();
    };

    const fetchSession = async () => {
      if (isFixedTvScreen) {
        const { data } = await supabase
          .from("game_sessions")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle<GameSession>();

        if (!isMounted || !data) return;
        setSession(data);
        bindSessionChildren(data.id);
      } else {
        const { data } = await supabase
          .from("game_sessions")
          .select("*")
          .eq("code", requestedCode)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle<GameSession>();

        if (!isMounted) return;
        if (data) {
          setSession(data);
          bindSessionChildren(data.id);
        } else {
          setSession((prev) => ({
            id: prev?.id ?? "pending-session",
            game_id: prev?.game_id ?? "quiz",
            code: requestedCode,
            status: prev?.status ?? "lobby",
            current_round: prev?.current_round ?? 1,
            state: prev?.state ?? { gameSlug: "quiz", showQrOnTv: true },
          }));
        }
      }
    };

    void fetchSession();

    const sessionChannel = supabase
      .channel(`tv-session-${requestedCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_sessions",
        },
        (payload) => {
          if (!isMounted) return;
          const nextRow = payload.new as GameSession | null;
          if (!nextRow) return;

          if (isFixedTvScreen) {
            setSession(nextRow);
            bindSessionChildren(nextRow.id);
          } else if (nextRow.code?.toUpperCase() === requestedCode) {
            setSession(nextRow);
            bindSessionChildren(nextRow.id);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(sessionChannel);
      if (playersChannel) {
        void supabase.removeChannel(playersChannel);
      }
      if (scoresChannel) {
        void supabase.removeChannel(scoresChannel);
      }
    };
  }, [requestedCode, isFixedTvScreen]);

  const activeCode = (session?.code || (!isFixedTvScreen ? requestedCode : "")).toUpperCase();

  const currentGame: CatalogGame | undefined = useMemo(() => {
    const slug =
      (session?.state?.gameSlug as string | undefined) ??
      session?.game_id ??
      "quiz";
    return INITIAL_GAMES.find((g) => g.slug === slug) ?? INITIAL_GAMES[0];
  }, [session]);

  const showQrOnTv =
    session?.state?.showQrOnTv !== undefined
      ? Boolean(session.state.showQrOnTv)
      : true;

  const baseUrl = clientEnv.appUrl?.trim() || origin;
  const joinUrl = baseUrl
    ? `${baseUrl.replace(/\/$/, "")}/play/${activeCode}`
    : `/play/${activeCode}`;

  const cycleDemoStatus = () => {
    const order: SessionStatus[] = [
      "lobby",
      "starting",
      "playing",
      "paused",
      "round_result",
      "finished",
    ];
    const currentStatus = session?.status ?? "lobby";
    const currentIndex = order.indexOf(currentStatus);
    const nextStatus: SessionStatus =
      order[(currentIndex + 1) % order.length] ?? "lobby";
    setSession((prev) => ({
      id: prev?.id ?? "demo-session",
      game_id: prev?.game_id ?? currentGame?.id ?? "quiz",
      code: activeCode || "DEMO",
      status: nextStatus,
      current_round: prev?.current_round ?? 1,
      state: prev?.state ?? { gameSlug: currentGame?.slug ?? "quiz" },
    }));
  };

  const getPlayerScore = (playerId: string): number => {
    return scores.find((s) => s.player_id === playerId)?.score ?? 0;
  };

  const status = session?.status ?? "lobby";
  const round = session?.current_round ?? 1;

  return (
    <div className="relative flex h-[100dvh] w-screen flex-col justify-between overflow-hidden bg-neutral-950 p-6 text-white md:p-10">
      {/* Ambient background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: currentGame
            ? `radial-gradient(circle at 80% 20%, ${currentGame.accentColor}2E 0%, transparent 55%), radial-gradient(circle at 15% 85%, rgba(10, 132, 255, 0.14) 0%, transparent 55%)`
            : undefined,
        }}
      />

      {/* Top TV Bar */}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
            <Tv className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-neutral-400">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span>Écran Principal TV</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-4xl">
              {currentGame?.title ?? "Plateforme de Jeux"}
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={cycleDemoStatus}
            className="whitespace-nowrap rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition hover:bg-white/15"
          >
            État : {status} • Manche {round}
          </button>

          <div className="shrink-0 rounded-2xl border border-white/15 bg-white/5 px-5 py-2.5 text-right">
            <div className="text-[11px] uppercase tracking-widest text-neutral-400">
              Code Salle
            </div>
            <div className="font-mono text-2xl font-extrabold tracking-widest text-amber-400 md:text-3xl">
              {activeCode || "----"}
            </div>
          </div>
        </div>
      </header>

      {/* Main TV Stage */}
      <main className="relative z-10 my-auto grid grid-cols-1 items-center gap-8 py-6 lg:grid-cols-12">
        {/* Left: Join / QR / Status */}
        <section className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-6 lg:col-span-5 md:p-7">
          <div className="flex items-center gap-3">
            <QrCode className="h-6 w-6 text-sky-400" />
            <h2 className="text-xl font-bold">Rejoindre avec son téléphone</h2>
          </div>

          {showQrOnTv ? (
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <div className="shrink-0 rounded-2xl bg-white p-3 shadow-lg">
                <QRCodeCanvas
                  value={joinUrl}
                  size={152}
                  bgColor="#ffffff"
                  fgColor="#07080c"
                  level="M"
                  marginSize={2}
                />
              </div>

              <div className="space-y-3 text-center sm:text-left">
                <p className="text-sm leading-relaxed text-neutral-300">
                  Scanne le QR code ou entre le code{" "}
                  <span className="font-mono font-bold text-amber-400">
                    {activeCode || "----"}
                  </span>{" "}
                  sur ton téléphone.
                </p>

                <div className="break-all rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-xs text-neutral-300">
                  {joinUrl}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-center text-sm text-neutral-400">
              QR code masqué par l&apos;animateur • Code salle :{" "}
              <span className="font-mono font-bold text-amber-400">
                {activeCode || "----"}
              </span>
            </div>
          )}

          {currentGame?.tagline && (
            <p className="border-t border-white/10 pt-4 text-sm text-neutral-400">
              {currentGame.tagline}
            </p>
          )}
        </section>

        {/* Right: Players & Leaderboard */}
        <section className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-6 lg:col-span-7 md:p-7">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="h-6 w-6 text-emerald-400" />
              <h2 className="text-xl font-bold">
                Joueurs ({players.length})
              </h2>
            </div>
            <span className="text-xs uppercase tracking-wider text-neutral-400">
              Classement en direct
            </span>
          </div>

          {players.length === 0 ? (
            <div className="py-12 text-center text-neutral-400">
              En attente des joueurs...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {players.map((player) => {
                const avatarKey = player.avatarId ?? "";
                const avatarSymbol =
                  (avatarKey ? AVATAR_EMOJIS[avatarKey] : undefined) ??
                  player.avatar ??
                  "🎮";

                return (
                  <div
                    key={player.id}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/35 p-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-2xl">
                        {avatarSymbol}
                      </span>
                      <span className="truncate text-base font-bold">
                        {player.nickname}
                      </span>
                    </div>

                    <span className="shrink-0 font-mono text-lg font-bold text-amber-400">
                      {getPlayerScore(player.id)} pts
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-neutral-500">
        <span>TVOS Party Platform</span>
        <span>Salle {activeCode || requestedCode || "—"}</span>
      </footer>
    </div>
  );
}
