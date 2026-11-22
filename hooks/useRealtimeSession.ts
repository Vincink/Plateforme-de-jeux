"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  GameSession,
  PlayerAction,
  PlayerScore,
  PlayerSession,
} from "@/types/game.types";

type RealtimeSession = GameSession & {
  gameId?: string;
  hostUserId?: string | null;
  currentRound?: number;
  totalRounds?: number;
  roundStartedAt?: string | null;
  roundDurationSec?: number;
  showQr?: boolean;
  activeContentId?: string | null;
  buzzedPlayerId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type RealtimePlayer = PlayerSession & {
  sessionId?: string;
  avatarId?: string;
  playerToken?: string;
  isConnected?: boolean;
  joinedAt?: string;
  lastSeenAt?: string | null;
};

type RealtimeScore = PlayerScore & {
  sessionId?: string;
  playerId?: string;
  nickname?: string;
  avatarId?: string;
  totalScore?: number;
  streak?: number;
  updatedAt?: string;
};

type RealtimeAction = PlayerAction & {
  sessionId?: string;
  playerId?: string;
  roundNumber?: number;
  actionType?: string;
  responseTimeMs?: number | null;
  isCorrect?: boolean | null;
  pointsAwarded?: number;
  createdAt?: string;
};

interface RealtimeSessionState {
  session: RealtimeSession | null;
  players: RealtimePlayer[];
  scores: RealtimeScore[];
  actions: RealtimeAction[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useRealtimeSession(sessionCode: string): RealtimeSessionState {
  const normalizedCode = sessionCode.trim().toUpperCase();

  const [session, setSession] = useState<RealtimeSession | null>(null);
  const [players, setPlayers] = useState<RealtimePlayer[]>([]);
  const [scores, setScores] = useState<RealtimeScore[]>([]);
  const [actions, setActions] = useState<RealtimeAction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    if (!normalizedCode) {
      setIsLoading(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    try {
      setError(null);

      const { data: sessionRow, error: sessionErr } = await supabase
        .from("game_sessions")
        .select("*")
        .eq("code", normalizedCode)
        .maybeSingle();

      if (sessionErr) {
        throw new Error(sessionErr.message);
      }

      if (!sessionRow) {
        setSession(null);
        setPlayers([]);
        setScores([]);
        setActions([]);
        setIsLoading(false);
        return;
      }

      const mappedSession: RealtimeSession = {
        id: sessionRow.id,
        code: sessionRow.code,
        game_id: sessionRow.game_id,
        gameId: sessionRow.game_id,
        hostUserId: sessionRow.host_user_id,
        status: sessionRow.status,
        current_round: sessionRow.current_round,
        currentRound: sessionRow.current_round,
        totalRounds: sessionRow.total_rounds,
        roundStartedAt: sessionRow.round_started_at,
        roundDurationSec: sessionRow.round_duration_sec,
        showQr: sessionRow.show_qr,
        activeContentId: sessionRow.active_content_id,
        buzzedPlayerId: sessionRow.buzzed_player_id,
        state: sessionRow.state ?? {},
        createdAt: sessionRow.created_at,
        updatedAt: sessionRow.updated_at,
      };

      setSession(mappedSession);

      const [playersRes, scoresRes, actionsRes] = await Promise.all([
        supabase
          .from("session_players")
          .select("*")
          .eq("session_id", mappedSession.id)
          .order("joined_at", { ascending: true }),
        supabase
          .from("player_scores")
          .select("*")
          .eq("session_id", mappedSession.id)
          .order("total_score", { ascending: false }),
        supabase
          .from("player_actions")
          .select("*")
          .eq("session_id", mappedSession.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (playersRes.data) {
        setPlayers(
          playersRes.data.map((p) => ({
            id: p.id,
            session_id: p.session_id,
            sessionId: p.session_id,
            nickname: p.nickname,
            avatar: p.avatar ?? "🎮",
            avatarId: p.avatar_id,
            playerToken: p.player_token,
            is_host: Boolean(p.is_host),
            is_connected: Boolean(p.is_connected),
            isConnected: Boolean(p.is_connected),
            joinedAt: p.joined_at,
            lastSeenAt: p.last_seen_at,
          }))
        );
      }

      if (scoresRes.data) {
        setScores(
          scoresRes.data.map((s) => ({
            id: s.id ?? `${s.session_id}-${s.player_id}`,
            session_id: s.session_id,
            sessionId: s.session_id,
            player_id: s.player_id,
            playerId: s.player_id,
            nickname: s.nickname,
            avatarId: s.avatar_id,
            score: s.total_score ?? s.score ?? 0,
            totalScore: s.total_score ?? s.score ?? 0,
            streak: s.streak ?? 0,
            updatedAt: s.updated_at,
          }))
        );
      }

      if (actionsRes.data) {
        setActions(
          actionsRes.data.map((a) => ({
            id: a.id,
            session_id: a.session_id,
            sessionId: a.session_id,
            player_id: a.player_id,
            playerId: a.player_id,
            round_number: a.round_number,
            roundNumber: a.round_number,
            action_type: a.action_type,
            actionType: a.action_type,
            payload: a.payload ?? {},
            responseTimeMs: a.response_time_ms,
            isCorrect: a.is_correct,
            pointsAwarded: a.points_awarded ?? 0,
            createdAt: a.created_at,
          }))
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur de synchronisation temps réel."
      );
    } finally {
      setIsLoading(false);
    }
  }, [normalizedCode]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (!session?.id) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`session-${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_sessions",
          filter: `id=eq.${session.id}`,
        },
        () => {
          void loadSnapshot();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_players",
          filter: `session_id=eq.${session.id}`,
        },
        () => {
          void loadSnapshot();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_scores",
          filter: `session_id=eq.${session.id}`,
        },
        () => {
          void loadSnapshot();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_actions",
          filter: `session_id=eq.${session.id}`,
        },
        () => {
          void loadSnapshot();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session?.id, loadSnapshot]);

  return {
    session,
    players,
    scores,
    actions,
    isLoading,
    error,
    refresh: loadSnapshot,
  };
}
