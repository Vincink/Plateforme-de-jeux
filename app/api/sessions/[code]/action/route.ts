import { NextResponse } from "next/server";
import { canAcceptBuzz, evaluatePlayerChoice } from "@/features/games/engine";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  GameContent,
  GameSession,
  GameSlug,
  PlayerAction,
} from "@/types/game.types";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await context.params;
    const sessionCode = (code ?? "").trim().toUpperCase();

    if (!sessionCode) {
      return NextResponse.json(
        { message: "Code de partie manquant." },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      playerId?: string;
      playerToken?: string;
      actionType?: "answer" | "buzz" | "speed_tap";
      payload?: Record<string, unknown>;
      responseTimeMs?: number | null;
    };

    const playerToken = (body.playerToken ?? "").trim();
    const actionType = body.actionType;

    if (!playerToken || !actionType) {
      return NextResponse.json(
        { message: "Paramètres d'action incomplets." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json(
        {
          message:
            "Supabase n'est pas encore configuré sur Vercel (variables d'environnement manquantes).",
        },
        { status: 503 }
      );
    }

    const { data: sessionRow } = await supabase
      .from("game_sessions")
      .select("*")
      .eq("code", sessionCode)
      .maybeSingle();

    if (!sessionRow) {
      return NextResponse.json(
        { message: `Partie ${sessionCode} introuvable.` },
        { status: 404 }
      );
    }

    const { data: playerRow } = await supabase
      .from("session_players")
      .select("id, nickname, avatar_id")
      .eq("session_id", sessionRow.id)
      .eq("player_token", playerToken)
      .maybeSingle();

    if (!playerRow) {
      return NextResponse.json(
        { message: "Joueur non reconnu dans cette partie." },
        { status: 403 }
      );
    }

    const { data: gameRow } = await supabase
      .from("games")
      .select("slug")
      .eq("id", sessionRow.game_id)
      .maybeSingle();

    const gameSlug = (gameRow?.slug ?? "quiz") as GameSlug;

    const mappedSession = {
      id: sessionRow.id,
      code: sessionRow.code,
      game_id: sessionRow.game_id,
      host_user_id: sessionRow.host_user_id,
      status: sessionRow.status,
      current_round: sessionRow.current_round,
      total_rounds: sessionRow.total_rounds,
      round_started_at: sessionRow.round_started_at,
      round_duration_sec: sessionRow.round_duration_sec,
      show_qr: sessionRow.show_qr,
      active_content_id: sessionRow.active_content_id,
      buzzed_player_id: sessionRow.buzzed_player_id,
      state: sessionRow.state ?? null,
      created_at: sessionRow.created_at,
      updated_at: sessionRow.updated_at,
    } as GameSession;

    const { data: existingScoreRow } = await supabase
      .from("player_scores")
      .select("total_score, streak")
      .eq("session_id", sessionRow.id)
      .eq("player_id", playerRow.id)
      .maybeSingle();

    const currentTotalScore = existingScoreRow?.total_score ?? 0;
    const currentStreak = existingScoreRow?.streak ?? 0;

    let isCorrect: boolean | null = null;
    let pointsAwarded = 0;
    let nextStreak = currentStreak;

    if (actionType === "buzz") {
      const { data: roundActionsRows } = await supabase
        .from("player_actions")
        .select("*")
        .eq("session_id", sessionRow.id)
        .eq("round_number", sessionRow.current_round)
        .eq("action_type", "buzz");

      const mappedBuzzActions: PlayerAction[] = (roundActionsRows ?? []).map(
        (a) => ({
          id: a.id,
          session_id: a.session_id,
          player_id: a.player_id,
          action_type: a.action_type,
          payload: a.payload ?? {},
          created_at: a.created_at,
        })
      );

      if (!canAcceptBuzz(mappedSession, mappedBuzzActions)) {
        return NextResponse.json(
          {
            message:
              "Le buzzer est déjà verrouillé ou la manche n'est pas active.",
          },
          { status: 409 }
        );
      }

      await supabase
        .from("game_sessions")
        .update({ buzzed_player_id: playerRow.id })
        .eq("id", sessionRow.id);
    } else if (actionType === "answer" || actionType === "speed_tap") {
      const selectedOption =
        typeof body.payload?.selectedOption === "string"
          ? body.payload.selectedOption
          : "";

      if (sessionRow.active_content_id) {
        const { data: contentRow } = await supabase
          .from("game_contents")
          .select("*")
          .eq("id", sessionRow.active_content_id)
          .maybeSingle();

        if (contentRow) {
          const content = {
            id: contentRow.id,
            game_id: contentRow.game_id,
            category: contentRow.category ?? contentRow.round_type ?? null,
            question: contentRow.question ?? contentRow.prompt ?? "",
            options: Array.isArray(contentRow.options)
              ? contentRow.options
              : [],
            answer: contentRow.answer ?? contentRow.correct_answer ?? "",
            media_url: contentRow.media_url ?? null,
            difficulty: contentRow.difficulty ?? null,
            metadata: contentRow.metadata ?? null,
            created_at: contentRow.created_at,
          } as GameContent;

          const evaluated = evaluatePlayerChoice({
            gameSlug,
            content,
            selectedOption,
            responseTimeMs: body.responseTimeMs ?? null,
            currentStreak,
          });

          isCorrect = evaluated.isCorrect;
          pointsAwarded = evaluated.pointsAwarded;
          nextStreak = evaluated.nextStreak;
        }
      }
    }

    const { data: insertedAction, error: actionErr } = await supabase
      .from("player_actions")
      .insert({
        session_id: sessionRow.id,
        player_id: playerRow.id,
        round_number: sessionRow.current_round,
        action_type: actionType,
        payload: body.payload ?? {},
        response_time_ms: body.responseTimeMs ?? null,
        is_correct: isCorrect,
        points_awarded: pointsAwarded,
      })
      .select("*")
      .single();

    if (actionErr || !insertedAction) {
      return NextResponse.json(
        {
          message:
            actionErr?.message ??
            "Impossible d'enregistrer l'action du joueur.",
        },
        { status: 500 }
      );
    }

    if (pointsAwarded !== 0 || nextStreak !== currentStreak) {
      const updatedScore = Math.max(0, currentTotalScore + pointsAwarded);
      await supabase.from("player_scores").upsert(
        {
          session_id: sessionRow.id,
          player_id: playerRow.id,
          nickname: playerRow.nickname,
          avatar_id: playerRow.avatar_id,
          total_score: updatedScore,
          streak: nextStreak,
        },
        {
          onConflict: "session_id,player_id",
        }
      );
    }

    return NextResponse.json(
      {
        actionId: insertedAction.id,
        isCorrect,
        pointsAwarded,
        nextStreak,
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        message:
          err instanceof Error
            ? err.message
            : "Erreur interne lors du traitement de l'action.",
      },
      { status: 500 }
    );
  }
}
