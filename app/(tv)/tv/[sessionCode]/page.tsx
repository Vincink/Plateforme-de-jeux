"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Tv, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getUniquePlayerColor } from "@/lib/colorsplayer";
import type { GameSession, SessionPlayer } from "@/types/game.types";

type BotLevel = "cool" | "normal" | "expert";

interface SalonBotConfig {
  id: string;
  nickname?: string;
  name?: string;
  pseudo?: string;
  avatar?: string;
  score?: number;
  botLevel?: BotLevel;
}

interface SalonGameState {
  mode?: string;
  bots?: SalonBotConfig[];
  nextSessionCode?: string;
  replacedByCode?: string;
}

interface GameMeta {
  title?: string | null;
  slug?: string | null;
}

type ExtendedSession = GameSession & {
  game_state?: SalonGameState | null;
  show_qr?: boolean | null;
};

type ExtendedPlayer = SessionPlayer & {
  avatar?: string | null;
  is_bot?: boolean | null;
  isBot?: boolean;
  botLevel?: BotLevel;
};

function normalizeGameState(rawState: unknown): SalonGameState {
  if (!rawState) return {};
  if (typeof rawState === "string") {
    try {
      const parsed = JSON.parse(rawState);
      return parsed && typeof parsed === "object"
        ? (parsed as SalonGameState)
        : {};
    } catch {
      return {};
    }
  }
  return typeof rawState === "object" ? (rawState as SalonGameState) : {};
}

function isJusteChiffreTarget(
  state: SalonGameState | null | undefined,
  meta: GameMeta | null | undefined
): boolean {
  const mode = String(state?.mode ?? "").toLowerCase();
  const title = String(meta?.title ?? "").toLowerCase();
  const slug = String(meta?.slug ?? "").toLowerCase();
  return (
    mode.includes("juste-chiffre") ||
    mode.includes("juste_chiffre") ||
    mode.includes("estimation") ||
    mode.includes("juste-prix") ||
    mode.includes("proche") ||
    slug.includes("juste-chiffre") ||
    slug.includes("juste_chiffre") ||
    slug.includes("estimation") ||
    slug.includes("juste-prix") ||
    slug.includes("proche") ||
    title.includes("juste chiffre") ||
    title.includes("estimation") ||
    title.includes("juste prix") ||
    title.includes("proche")
  );
}

export default function TvSalonPage() {
  const params = useParams<{ sessionCode?: string }>();
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const routeCode = (params?.sessionCode ?? "").trim().toUpperCase();
  const hasExplicitCode =
    Boolean(routeCode) && routeCode !== "SALON" && routeCode !== "TV";

  const [session, setSession] = useState<ExtendedSession | null>(null);
  const [dbPlayers, setDbPlayers] = useState<ExtendedPlayer[]>([]);
  const [gameMeta, setGameMeta] = useState<GameMeta | null>(null);
  const [joinUrl, setJoinUrl] = useState<string>("");

  const parsedState = useMemo(
    () => normalizeGameState(session?.game_state),
    [session?.game_state]
  );

  const activeCode = useMemo(() => {
    const replacement = (
      parsedState.nextSessionCode ||
      parsedState.replacedByCode ||
      ""
    )
      .trim()
      .toUpperCase();
    return replacement || (session?.code ?? routeCode).toUpperCase();
  }, [parsedState, session?.code, routeCode]);

  const gameTitle = useMemo(
    () => gameMeta?.title || "Grand Quiz tvOS",
    [gameMeta?.title]
  );

  const players = useMemo<ExtendedPlayer[]>(() => {
    const humanRows = dbPlayers.filter(
      (p) => !p.isBot && !p.is_bot && !String(p.id).startsWith("bot-")
    );
    const dbBotRows = dbPlayers.filter(
      (p) =>
        Boolean(p.isBot) ||
        Boolean(p.is_bot) ||
        String(p.id).startsWith("bot-")
    );

    const hasBotsKeyInState =
      parsedState !== null &&
      typeof parsedState === "object" &&
      Object.prototype.hasOwnProperty.call(parsedState, "bots") &&
      Array.isArray(parsedState.bots);

    const stateBotRows: ExtendedPlayer[] = hasBotsKeyInState
      ? (parsedState.bots ?? [])
          .filter((b) => Boolean(b?.id))
          .map((b, index) => ({
            id: String(b.id),
            session_id: session?.id ?? activeCode,
            nickname:
              String(b.nickname ?? b.name ?? b.pseudo ?? "").trim() ||
              `Bot ${index + 1}`,
            avatar: b.avatar || "🤖",
            is_host: false,
            is_connected: true,
            isBot: true,
            botLevel: b.botLevel ?? "normal",
          })) as ExtendedPlayer[]
      : dbBotRows;

    const mapById = new Map<string, ExtendedPlayer>();
    for (const p of humanRows) {
      mapById.set(String(p.id), p);
    }
    for (const b of stateBotRows) {
      mapById.set(String(b.id), b);
    }
    return Array.from(mapById.values());
  }, [dbPlayers, parsedState, session?.id, activeCode]);

  useEffect(() => {
    if (typeof window === "undefined" || !activeCode) return;
    setJoinUrl(`${window.location.origin}/play/${activeCode}`);
  }, [activeCode]);

  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;
    let currentSessionId: string | null = null;
    let playersChannel: ReturnType<typeof supabase.channel> | null = null;

    const loadGameMeta = async (gameId: string | null | undefined) => {
      if (!gameId) return;
      const { data } = await supabase
        .from("games")
        .select("title, slug")
        .eq("id", gameId)
        .maybeSingle<GameMeta>();

      if (!isMounted) return;
      if (data) setGameMeta(data);
    };

    const loadPlayers = async (targetSessionId: string | null) => {
      if (!targetSessionId) return;
      const { data } = await supabase
        .from("session_players")
        .select("*")
        .eq("session_id", targetSessionId)
        .order("id", { ascending: true });

      if (!isMounted) return;
      setDbPlayers((data as ExtendedPlayer[] | null) ?? []);
    };

    const bindSession = (targetSession: ExtendedSession) => {
      void loadPlayers(targetSession.id);
      void loadGameMeta(targetSession.game_id);

      if (currentSessionId === targetSession.id && playersChannel) {
        return;
      }

      currentSessionId = targetSession.id;

      if (playersChannel) {
        void supabase.removeChannel(playersChannel);
      }

      playersChannel = supabase
        .channel(`tv-salon-players-${targetSession.id}-${Date.now()}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "session_players",
            filter: `session_id=eq.${targetSession.id}`,
          },
          () => {
            if (!isMounted) return;
            void loadPlayers(targetSession.id);
          }
        )
        .subscribe();
    };

    const refreshSession = async () => {
      let currentRow: ExtendedSession | null = null;

      if (hasExplicitCode) {
        const { data } = await supabase
          .from("game_sessions")
          .select("*")
          .eq("code", routeCode)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle<ExtendedSession>();
        currentRow = data ?? null;
      }

      if (!currentRow) {
        const { data } = await supabase
          .from("game_sessions")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle<ExtendedSession>();
        currentRow = data ?? null;
      }

      if (!isMounted || !currentRow) return;

      const cleanState = normalizeGameState(currentRow.game_state);
      const replacementCode = (
        cleanState.nextSessionCode ||
        cleanState.replacedByCode ||
        ""
      )
        .trim()
        .toUpperCase();

      if (
        replacementCode &&
        replacementCode !== (currentRow.code ?? "").toUpperCase()
      ) {
        const { data: replacementSession } = await supabase
          .from("game_sessions")
          .select("*")
          .eq("code", replacementCode)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle<ExtendedSession>();

        if (!isMounted) return;
        if (replacementSession) {
          const appliedReplacement: ExtendedSession = {
            ...replacementSession,
            game_state: normalizeGameState(replacementSession.game_state),
          };
          setSession(appliedReplacement);
          bindSession(appliedReplacement);
          return;
        }
      }

      const applied: ExtendedSession = {
        ...currentRow,
        game_state: cleanState,
      };
      setSession(applied);
      bindSession(applied);
    };

    void refreshSession();

    const sessionsChannel = supabase
      .channel(`tv-salon-sessions-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_sessions",
        },
        () => {
          if (!isMounted) return;
          void refreshSession();
        }
      )
      .subscribe();

    const syncInterval = window.setInterval(() => {
      if (!isMounted) return;
      void refreshSession();
      if (currentSessionId) {
        void loadPlayers(currentSessionId);
      }
    }, 600);

    return () => {
      isMounted = false;
      window.clearInterval(syncInterval);
      void supabase.removeChannel(sessionsChannel);
      if (playersChannel) {
        void supabase.removeChannel(playersChannel);
      }
    };
  }, [supabase, routeCode, hasExplicitCode]);

  useEffect(() => {
    if (!session || !activeCode) return;
    const status = String(session.status ?? "").toLowerCase();
    if (status === "playing" || status === "paused") {
      const targetRoute = isJusteChiffreTarget(parsedState, gameMeta)
        ? `/tv/${activeCode}/juste-chiffre`
        : `/tv/${activeCode}/quiz`;
      router.replace(targetRoute);
    }
  }, [session, activeCode, parsedState, gameMeta, router]);

  const displayStatus = useMemo(() => {
    const raw = String(session?.status ?? "lobby").toLowerCase();
    if (!raw || raw === "finished" || raw === "ended" || raw === "completed") {
      return "LOBBY";
    }
    return raw.toUpperCase();
  }, [session?.status]);

  const showQr = session?.show_qr !== false;

  return (
    <div className="min-h-[100dvh] w-screen overflow-hidden bg-neutral-950 text-white px-8 py-6 flex flex-col justify-between select-none">
      <header className="flex items-center justify-between border-b border-white/15 pb-4 shrink-0 gap-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-amber-400/15 border border-amber-400/35 flex items-center justify-center shrink-0">
            <Tv className="w-8 h-8 text-amber-400" />
          </div>
          <div className="min-w-0">
            <div className="text-xs xl:text-sm uppercase tracking-[0.2em] text-amber-300 font-extrabold">
              Écran TV
            </div>
            <h1 className="text-3xl xl:text-4xl font-black tracking-tight truncate">
              {gameTitle}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <span className="px-4 py-1.5 rounded-xl bg-white/10 border border-white/15 text-sm font-black uppercase tracking-widest text-neutral-200">
            {displayStatus}
          </span>
          <div className="px-6 py-2.5 rounded-2xl bg-amber-400/15 border-2 border-amber-400/45 text-amber-300 font-mono text-3xl xl:text-4xl font-black tracking-[0.2em]">
            {activeCode || "----"}
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 grid grid-cols-12 gap-7 py-6">
        <section className="col-span-7 bg-white/[0.05] border border-white/15 rounded-[2rem] p-7 flex flex-col gap-5 min-h-0">
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 text-2xl xl:text-3xl font-black">
              <Users className="w-8 h-8 text-amber-400" />
              <span>Joueurs connectés ({players.length})</span>
            </div>
            <span className="text-lg font-mono font-bold text-neutral-400">
              Code : {activeCode || "----"}
            </span>
          </div>

          {players.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-2xl text-neutral-400 font-semibold text-center px-6">
              En attente des joueurs sur leur téléphone...
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 overflow-y-auto pr-1">
              {players.map((player) => {
                const pColor = getUniquePlayerColor(player.id, players);
                return (
                  <div
                    key={player.id}
                    style={{
                      backgroundColor: pColor.bgHex,
                      borderColor: pColor.borderHex,
                      color: pColor.textHex,
                    }}
                    className="rounded-3xl border-2 px-5 py-4 flex items-center gap-4 shadow-lg"
                  >
                    <span
                      style={{ backgroundColor: pColor.badgeBgHex }}
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                    >
                      {player.avatar ?? "🎮"}
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

        <aside className="col-span-5 bg-white/[0.05] border border-white/15 rounded-[2rem] p-7 flex flex-col items-center justify-center text-center gap-5 min-h-0">
          {showQr && joinUrl && activeCode ? (
            <>
              <div className="bg-white p-5 rounded-3xl shadow-2xl">
                <QRCodeSVG value={joinUrl} size={210} />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-2xl xl:text-3xl font-black">
                  Rejoindre la partie
                </h2>
                <p className="text-base xl:text-lg text-neutral-300">
                  Scanne le QR code ou entre le code{" "}
                  <span className="font-mono font-black text-amber-300">
                    {activeCode}
                  </span>
                </p>
              </div>
            </>
          ) : (
            <p className="text-xl text-neutral-400 font-semibold">
              QR code masqué par l&apos;animateur
            </p>
          )}
        </aside>
      </main>

      <footer className="flex items-center justify-between text-sm text-neutral-400 border-t border-white/10 pt-3 shrink-0">
        <span>tvOS Party</span>
        <span className="font-mono">Salle {activeCode || "----"}</span>
      </footer>
    </div>
  );
}
