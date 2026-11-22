"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { QrCode, Users, Tv, Sparkles } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { clientEnv } from "@/lib/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getUniquePlayerColor } from "@/lib/colorsplayer";
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
          .eq("session_id", targetSessionId)
          .order("id", { ascending: true }),
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

  const activeCode = (
    session?.code || (!isFixedTvScreen ? requestedCode : "")
  ).toUpperCase();

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
    const match = scores.find((s) => s.player_id === playerId);
    if (!match) return 0;
    const scoreRecord = match as unknown as {
      total_score?: number;
      score?: number;
    };
    return scoreRecord.total_score ?? scoreRecord.score ?? 0;
  };

  const sortedPlayers = useMemo(() => {
    return [...players].sort(
      (a, b) => getPlayerScore(b.id) - getPlayerScore(a.id)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, scores]);

  const status = session?.status ?? "lobby";
  const round = session?.current_round ?? 1;

  return (
    <div className="relative flex h-[100dvh] w-screen flex-col justify-between overflow-hidden bg-neutral-950 p-7 text-white md:p-11">
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
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-5 border-b border-white/15 pb-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
            <Tv className="h-9 w-9 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-base font-bold uppercase tracking-widest text-neutral-300">
              <Sparkles className="h-5 w-5 text-amber-400" />
              <span>Écran Principal TV</span>
            </div>
            <h1 className="text-4xl font-black tracking-tight md:text-6xl">
              {currentGame?.title ?? "Plateforme de Jeux"}
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <button
            type="button"
            onClick={cycleDemoStatus}
            className="whitespace-nowrap rounded-full border border-white/20 bg-white/10 px-6 py-3.5 text-base font-extrabold uppercase tracking-wider transition hover:bg-white/15 md:text-lg"
          >
            État : {status} • Manche {round}
          </button>

          <div className="shrink-0 rounded-2xl border border-amber-400/35 bg-white/10 px-7 py-3 text-right">
            <div className="text-sm font-extrabold uppercase tracking-widest text-neutral-300">
              Code Salle
            </div>
            <div className="font-mono text-4xl font-black tracking-widest text-amber-400 md:text-6xl">
              {activeCode || "----"}
            </div>
          </div>
        </div>
      </header>

      {/* Main TV Stage */}
      <main className="relative z-10 my-auto grid flex-1 grid-cols-1 items-stretch gap-8 py-6 lg:grid-cols-12">
        {/* Left: Join / QR / Status */}
        <section className="flex h-full flex-col justify-between space-y-6 rounded-3xl border border-white/15 bg-white/5 p-7 lg:col-span-5 md:p-9">
          <div className="flex items-center gap-3">
            <QrCode className="h-9 w-9 shrink-0 text-sky-400" />
            <h2 className="text-3xl font-black md:text-4xl">
              Rejoindre avec son téléphone
            </h2>
          </div>

          {showQrOnTv ? (
            <div className="my-auto flex flex-col items-center gap-6 sm:flex-row">
              <div className="shrink-0 rounded-3xl bg-white p-4 shadow-xl">
                <QRCodeCanvas
                  value={joinUrl}
                  size={208}
                  bgColor="#ffffff"
                  fgColor="#07080c"
                  level="M"
                  marginSize={2}
                />
              </div>

              <div className="space-y-4 text-center sm:text-left">
                <p className="text-xl font-semibold leading-relaxed text-neutral-100 md:text-2xl">
                  Scanne le QR code ou entre le code{" "}
                  <span className="font-mono text-3xl font-black text-amber-400 md:text-4xl">
                    {activeCode || "----"}
                  </span>{" "}
                  sur ton téléphone.
                </p>

                <div className="break-all rounded-2xl border border-white/15 bg-black/50 px-4 py-3 font-mono text-base font-bold text-neutral-200 md:text-lg">
                  {joinUrl}
                </div>
              </div>
            </div>
          ) : (
            <div className="my-auto rounded-2xl border border-white/15 bg-black/40 p-8 text-center text-2xl font-semibold text-neutral-300 md:text-3xl">
              QR code masqué par l&apos;animateur • Code salle :{" "}
              <span className="font-mono text-3xl font-black text-amber-400 md:text-4xl">
                {activeCode || "----"}
              </span>
            </div>
          )}

          {currentGame?.tagline && (
            <p className="border-t border-white/15 pt-5 text-lg font-semibold text-neutral-200 md:text-2xl">
              {currentGame.tagline}
            </p>
          )}
        </section>

        {/* Right: Players & Leaderboard */}
        <section className="flex h-full flex-col justify-between space-y-6 rounded-3xl border border-white/15 bg-white/5 p-7 lg:col-span-7 md:p-9">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Users className="h-9 w-9 shrink-0 text-emerald-400" />
              <h2 className="text-3xl font-black md:text-4xl">
                Joueurs ({sortedPlayers.length})
              </h2>
            </div>
            <span className="text-base font-extrabold uppercase tracking-wider text-neutral-300 md:text-lg">
              Classement en direct
            </span>
          </div>

          {sortedPlayers.length === 0 ? (
            <div className="my-auto flex flex-1 items-center justify-center py-12 text-center text-2xl font-bold text-neutral-200 md:text-4xl">
              En attente des joueurs...
            </div>
          ) : (
            <div className="my-auto grid grid-cols-1 gap-4 sm:grid-cols-2">
              {sortedPlayers.map((player) => {
                const color = getUniquePlayerColor(player.id, players);
                const avatarKey = player.avatarId ?? "";
                const avatarSymbol =
                  (avatarKey ? AVATAR_EMOJIS[avatarKey] : undefined) ??
                  player.avatar ??
                  "🎮";

                return (
                  <div
                    key={player.id}
                    style={{
                      backgroundColor: color.bgHex,
                      borderColor: color.borderHex,
                      color: color.textHex,
                    }}
                    className="flex items-center justify-between gap-4 rounded-2xl border-2 p-5 shadow-lg transition"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <span
                        style={{ backgroundColor: color.badgeBgHex }}
                        className="flex h-16 w-16 items-center justify-center rounded-2xl text-4xl"
                      >
                        {avatarSymbol}
                      </span>
                      <span className="truncate text-2xl font-black md:text-3xl">
                        {player.nickname}
                      </span>
                    </div>

                    <span
                      style={{ color: color.scoreHex }}
                      className="shrink-0 font-mono text-3xl font-black md:text-4xl"
                    >
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
      <footer className="relative z-10 flex items-center justify-between border-t border-white/15 pt-4 text-base font-semibold text-neutral-300 md:text-lg">
        <span>TVOS Party Platform</span>
        <span>Salle {activeCode || requestedCode || "—"}</span>
      </footer>
    </div>
  );
}
