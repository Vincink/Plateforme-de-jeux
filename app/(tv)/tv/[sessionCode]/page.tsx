"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Tv, Users, Play } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getUniquePlayerColor } from "@/lib/colorsplayer";
import type { GameSession, SessionPlayer } from "@/types/game.types";

const GRAND_QUIZ_GAME_ID = "6e6d7179-3a56-4d94-9c1d-19ac06a34aaa";

export default function TvLobbyPage() {
  const params = useParams<{ sessionCode: string }>();
  const router = useRouter();
  const sessionCode = (params?.sessionCode ?? "").toUpperCase();
  const supabase = getSupabaseBrowserClient();

  const [session, setSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [gameTitle, setGameTitle] = useState<string>("En attente d'un jeu");
  const [joinUrl, setJoinUrl] = useState<string>("");

  useEffect(() => {
    if (!sessionCode || typeof window === "undefined") return;
    setJoinUrl(`${window.location.origin}/play/${sessionCode}`);
  }, [sessionCode]);

  useEffect(() => {
    if (!supabase || !sessionCode) return;

    let isMounted = true;
    let playersChannel: ReturnType<typeof supabase.channel> | null = null;

    const loadGameTitle = async (gameId: string | null | undefined) => {
      if (!gameId) {
        if (isMounted) setGameTitle("En attente d'un jeu");
        return;
      }
      const { data } = await supabase
        .from("games")
        .select("title")
        .eq("id", gameId)
        .maybeSingle<{ title?: string | null }>();

      if (!isMounted) return;
      setGameTitle(data?.title || "Jeu sélectionné");
    };

    const loadPlayers = async (targetSessionId: string) => {
      const { data } = await supabase
        .from("session_players")
        .select("*")
        .eq("session_id", targetSessionId)
        .order("id", { ascending: true });

      if (!isMounted) return;
      setPlayers((data as SessionPlayer[] | null) ?? []);
    };

    const bindSession = (targetSession: GameSession) => {
      if (playersChannel) {
        void supabase.removeChannel(playersChannel);
      }

      void loadPlayers(targetSession.id);
      void loadGameTitle(targetSession.game_id);

      playersChannel = supabase
        .channel(`tv-lobby-players-${targetSession.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "session_players",
            filter: `session_id=eq.${targetSession.id}`,
          },
          () => {
            void loadPlayers(targetSession.id);
          }
        )
        .subscribe();
    };

    const fetchInitial = async () => {
      const { data } = await supabase
        .from("game_sessions")
        .select("*")
        .eq("code", sessionCode)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<GameSession>();

      if (!isMounted) return;
      if (data) {
        setSession(data);
        bindSession(data);
      }
    };

    void fetchInitial();

    const sessionChannel = supabase
      .channel(`tv-lobby-session-${sessionCode}`)
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
          const nextRow = payload.new as GameSession | null;
          if (!nextRow) return;
          setSession(nextRow);
          bindSession(nextRow);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(sessionChannel);
      if (playersChannel) {
        void supabase.removeChannel(playersChannel);
      }
    };
  }, [supabase, sessionCode]);

  useEffect(() => {
    if (!session || !sessionCode) return;

    const isQuizPlaying =
      session.game_id === GRAND_QUIZ_GAME_ID && session.status === "playing";

    if (isQuizPlaying) {
      router.replace(`/tv/${sessionCode}/quiz`);
    }
  }, [session, sessionCode, router]);

  const showQr =
    (session as (GameSession & { show_qr?: boolean }) | null)?.show_qr ??
    true;
  const roundStatus = session?.status ?? "lobby";
  const currentRound = session?.current_round ?? 1;
  const qrImageUrl = joinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(
        joinUrl
      )}`
    : "";

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-tvos-bg text-white px-10 py-8 flex flex-col justify-between select-none">
      {/* En-tête grand format */}
      <header className="flex items-center justify-between border-b border-white/15 pb-6 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-amber-400/15 border border-amber-400/35 flex items-center justify-center shrink-0">
            <Tv className="w-8 h-8 text-amber-400" />
          </div>
          <div className="min-w-0">
            <div className="text-sm uppercase tracking-[0.22em] text-neutral-400 font-bold">
              Écran TV • Manche {currentRound}
            </div>
            <h1 className="text-3xl xl:text-4xl font-black tracking-tight truncate">
              {gameTitle}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-5 shrink-0">
          <span className="px-5 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-base font-extrabold uppercase tracking-wider">
            {roundStatus}
          </span>
          <div className="px-6 py-3 rounded-2xl bg-amber-400/15 border-2 border-amber-400/40 text-amber-300 font-mono text-4xl font-black tracking-[0.2em]">
            {sessionCode || "----"}
          </div>
        </div>
      </header>

      {/* Corps principal sur 100dvh */}
      <main className="flex-1 min-h-0 grid grid-cols-12 gap-8 py-7">
        {/* Joueurs connectés */}
        <section className="col-span-7 bg-white/[0.06] border border-white/15 rounded-[2rem] p-7 flex flex-col gap-5 min-h-0">
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 text-2xl xl:text-3xl font-black">
              <Users className="w-7 h-7 text-amber-400" />
              <span>Joueurs connectés ({players.length})</span>
            </div>
            <span className="text-lg text-neutral-300">
              Code :{" "}
              <strong className="font-mono text-2xl text-amber-300 font-black">
                {sessionCode}
              </strong>
            </span>
          </div>

          {players.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center text-2xl text-neutral-400 font-medium px-6">
              En attente des joueurs sur leur téléphone...
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto pr-1 content-start">
              {players.map((player) => {
                const pColor = getUniquePlayerColor(player.id, players);
                const playerExtra = player as SessionPlayer & {
                  avatarId?: string;
                  avatar_id?: string;
                };
                const avatarDisplay =
                  playerExtra.avatarId || playerExtra.avatar_id || "🎮";

                return (
                  <div
                    key={player.id}
                    style={{
                      backgroundColor: pColor.bgHex,
                      borderColor: pColor.borderHex,
                      color: pColor.textHex,
                    }}
                    className="rounded-3xl border-2 p-4 flex items-center gap-4 shadow-lg"
                  >
                    <span
                      style={{ backgroundColor: pColor.badgeBgHex }}
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0"
                    >
                      {avatarDisplay}
                    </span>
                    <span className="font-black text-2xl truncate">
                      {player.nickname}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* QR code ou état prêt */}
        <section className="col-span-5 bg-white/[0.06] border border-white/15 rounded-[2rem] p-7 flex flex-col items-center justify-center text-center gap-5 min-h-0">
          {showQr && qrImageUrl ? (
            <>
              <div className="p-4 rounded-[2rem] bg-white shadow-2xl shrink-0">
                <img
                  src={qrImageUrl}
                  alt={`QR Code salle ${sessionCode}`}
                  className="w-52 h-52 xl:w-60 xl:h-60 rounded-2xl block"
                />
              </div>
              <div className="text-3xl font-black">Rejoindre la partie</div>
              <p className="text-xl text-neutral-300 max-w-md leading-snug">
                Scanne le QR code ou entre le code{" "}
                <span className="font-mono font-black text-2xl text-amber-300">
                  {sessionCode}
                </span>
              </p>
            </>
          ) : (
            <>
              <Play className="w-16 h-16 text-amber-400" />
              <div className="text-3xl font-black">Prêt à démarrer</div>
              <p className="text-xl text-neutral-300 max-w-sm">
                L&apos;animateur contrôle le lancement de la partie.
              </p>
            </>
          )}
        </section>
      </main>

      {/* Pied de page sobre */}
      <footer className="text-base text-neutral-400 flex items-center justify-between pt-4 border-t border-white/10 shrink-0">
        <span className="font-semibold">tvOS Party</span>
        <span className="font-mono font-bold text-neutral-300">
          Salle {sessionCode || "----"}
        </span>
      </footer>
    </div>
  );
}
