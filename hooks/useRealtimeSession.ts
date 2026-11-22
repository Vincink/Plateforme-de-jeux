"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  GameSession,
  PlayerAction,
  PlayerScore,
  PlayerSession,
} from "@/types/game.types";

interface RealtimeSessionState {
  session: GameSession | null;
  players: PlayerSession[];
  scores: PlayerScore[];
  actions: PlayerAction[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useRealtimeSession(sessionCode: string): RealtimeSessionState {
  const normalizedCode = sessionCode.trim().toUpperCase();

  const [session, setSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<PlayerSession[]>([]);
  const [scores, setScores] = useState<PlayerScore[]>([]);
  const [actions, setActions] = useState<PlayerAction[]>([]);
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

      const mappedSession: GameSession = {
        id: sessionRow.id,
        code: sessionRow.code,
        gameId: sessionRow.game_id,
        hostUserId: sessionRow.host_user_id,
        status: sessionRow.status,
        currentRound: sessionRow.current_round,
        totalRounds: sessionRow.total_rounds,
        roundStartedAt: sessionRow.round_started_at,
        roundDurationSec: sessionRow.round_duration_sec,
        showQr: sessionRow.show_qr,
        activeContentId: sessionRow.active_content_id,
        buzzedPlayerId: sessionRow.buzzed_player_id,
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
            sessionId: p.session_id,
            nickname: p.nickname,
            avatarId: p.avatar_id,
            playerToken: p.player_token,
            isConnected: p.is_connected,
            joinedAt: p.joined_at,
            lastSeenAt: p.last_seen_at,
          }))
        );
      }

      if (scoresRes.data) {
        setScores(
          scoresRes.data.map((s) => ({
            sessionId: s.session_id,
            playerId: s.player_id,
            nickname: s.nickname,
            avatarId: s.avatar_id,
            totalScore: s.total_score,
            streak: s.streak,
            updatedAt: s.updated_at,
          }))
        );
      }

      if (actionsRes.data) {
        setActions(
          actionsRes.data.map((a) => ({
            id: a.id,
            sessionId: a.session_id,
            playerId: a.player_id,
            roundNumber: a.round_number,
            actionType: a.action_type,
            payload: a.payload ?? {},
            responseTimeMs: a.response_time_ms,
            isCorrect: a.is_correct,
            pointsAwarded: a.points_awarded,
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
