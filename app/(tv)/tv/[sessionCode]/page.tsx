"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Tv, Users, QrCode, Play } from "lucide-react";
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
        .select("title, name")
        .eq("id", gameId)
        .maybeSingle<{ title?: string | null; name?: string | null }>();

      if (!isMounted) return;
      setGameTitle(data?.title || data?.name || "Jeu sélectionné");
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

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-8 flex flex-col justify-between select-none">
      <header className="flex items-center justify-between border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <Tv className="w-7 h-7 text-amber-400" />
          <div>
            <div className="text-xs uppercase tracking-widest text-neutral-400">
              Écran TV
            </div>
            <div className="text-xl font-bold">
              {gameTitle} • Manche {currentRound}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="px-3.5 py-1.5 rounded-full bg-white/10 text-xs font-bold uppercase tracking-wider">
            {roundStatus}
          </span>
          <div className="px-4 py-2 rounded-2xl bg-amber-400/15 border border-amber-400/30 text-amber-300 font-mono text-2xl font-black tracking-widest">
            {sessionCode || "----"}
          </div>
        </div>
      </header>

      <main className="my-auto grid grid-cols-1 lg:grid-cols-12 gap-8 py-8">
        <section className="lg:col-span-7 bg-white/5 border border-white/10 rounded-3xl p-7 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-lg font-bold">
              <Users className="w-5 h-5 text-amber-400" />
              <span>Joueurs connectés ({players.length})</span>
            </div>
            <span className="text-xs text-neutral-400">
              Code : <strong className="font-mono text-white">{sessionCode}</strong>
            </span>
          </div>

          {players.length === 0 ? (
            <div className="py-12 text-center text-neutral-400">
              En attente des joueurs sur leur téléphone...
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
                    className="rounded-3xl border-2 p-4 flex items-center gap-3 shadow-lg"
                  >
                    <span
                      style={{ backgroundColor: pColor.badgeBgHex }}
                      className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                    >
                      {avatarDisplay}
                    </span>
                    <span className="font-black text-base truncate">
                      {player.nickname}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="lg:col-span-5 bg-white/5 border border-white/10 rounded-3xl p-7 flex flex-col items-center justify-center text-center gap-4">
          {showQr ? (
            <>
              <div className="w-20 h-20 rounded-3xl bg-white/10 border border-white/15 flex items-center justify-center">
                <QrCode className="w-11 h-11 text-amber-400" />
              </div>
              <div className="text-xl font-bold">Rejoindre la partie</div>
              <p className="text-sm text-neutral-400 max-w-xs">
                Ouvre la manette sur ton téléphone et entre le code{" "}
                <span className="font-mono font-bold text-amber-300">
                  {sessionCode}
                </span>
              </p>
            </>
          ) : (
            <>
              <Play className="w-12 h-12 text-amber-400" />
              <div className="text-xl font-bold">Prêt à démarrer</div>
              <p className="text-sm text-neutral-400">
                L&apos;animateur contrôle le lancement de la partie.
              </p>
            </>
          )}
        </section>
      </main>

      <footer className="text-xs text-neutral-500 flex items-center justify-between pt-4 border-t border-white/10">
        <span>Plateforme de jeux</span>
        <span>Salle {sessionCode || "----"}</span>
      </footer>
    </div>
  );
}
