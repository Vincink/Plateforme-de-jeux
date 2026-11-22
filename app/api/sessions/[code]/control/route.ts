import { NextResponse } from "next/server";
import { resolveBlindTestValidation } from "@/features/games/engine";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { SessionStatus } from "@/types/game.types";

type ControlCommand =
  | "set_status"
  | "next_round"
  | "reset_session"
  | "toggle_qr"
  | "release_buzz"
  | "validate_buzz";

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
      command?: ControlCommand;
      status?: SessionStatus;
      showQr?: boolean;
      isApproved?: boolean;
      buzzPoints?: number;
    };

    const command = body.command;
    if (!command) {
      return NextResponse.json(
        { message: "Commande de pilotage manquante." },
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

    if (command === "set_status") {
      if (!body.status) {
        return NextResponse.json(
          { message: "État cible (status) manquant." },
          { status: 400 }
        );
      }

      const updatePayload: Record<string, unknown> = {
        status: body.status,
      };

      if (body.status === "playing") {
        updatePayload.round_started_at = new Date().toISOString();
      }

      const { data: updated, error } = await supabase
        .from("game_sessions")
        .update(updatePayload)
        .eq("id", sessionRow.id)
        .select("*")
        .single();

      if (error || !updated) {
        return NextResponse.json(
          { message: error?.message ?? "Mise à jour impossible." },
          { status: 500 }
        );
      }

      return NextResponse.json({ session: updated }, { status: 200 });
    }

    if (command === "toggle_qr") {
      const nextShowQr =
        typeof body.showQr === "boolean" ? body.showQr : !sessionRow.show_qr;

      const { data: updated, error } = await supabase
        .from("game_sessions")
        .update({ show_qr: nextShowQr })
        .eq("id", sessionRow.id)
        .select("*")
        .single();

      if (error || !updated) {
        return NextResponse.json(
          { message: error?.message ?? "Mise à jour du QR impossible." },
          { status: 500 }
        );
      }

      return NextResponse.json({ session: updated }, { status: 200 });
    }

    if (command === "release_buzz") {
      const { data: updated, error } = await supabase
        .from("game_sessions")
        .update({ buzzed_player_id: null })
        .eq("id", sessionRow.id)
        .select("*")
        .single();

      if (error || !updated) {
        return NextResponse.json(
          { message: error?.message ?? "Déverrouillage du buzzer impossible." },
          { status: 500 }
        );
      }

      return NextResponse.json({ session: updated }, { status: 200 });
    }

    if (command === "validate_buzz") {
      if (!sessionRow.buzzed_player_id) {
        return NextResponse.json(
          { message: "Aucun joueur n'a buzzé pour le moment." },
          { status: 400 }
        );
      }

      const isApproved = Boolean(body.isApproved);
      const basePoints =
        typeof body.buzzPoints === "number" && body.buzzPoints > 0
          ? body.buzzPoints
          : 1000;

      const { data: scoreRow } = await supabase
        .from("player_scores")
        .select("nickname, avatar_id, total_score, streak")
        .eq("session_id", sessionRow.id)
        .eq("player_id", sessionRow.buzzed_player_id)
        .maybeSingle();

      const currentScore = scoreRow?.total_score ?? 0;
      const currentStreak = scoreRow?.streak ?? 0;

      const result = resolveBlindTestValidation({
        basePoints,
        isApproved,
        currentStreak,
      });

      const nextTotalScore = Math.max(0, currentScore + result.pointsAwarded);

      await supabase.from("player_scores").upsert(
        {
          session_id: sessionRow.id,
          player_id: sessionRow.buzzed_player_id,
          nickname: scoreRow?.nickname ?? "Joueur",
          avatar_id: scoreRow?.avatar_id ?? "fox",
          total_score: nextTotalScore,
          streak: result.nextStreak,
        },
        {
          onConflict: "session_id,player_id",
        }
      );

      const { data: updatedSession, error } = await supabase
        .from("game_sessions")
        .update({
          buzzed_player_id: null,
          status: isApproved ? "round_result" : "playing",
        })
        .eq("id", sessionRow.id)
        .select("*")
        .single();

      if (error || !updatedSession) {
        return NextResponse.json(
          { message: error?.message ?? "Validation du buzzer impossible." },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          session: updatedSession,
          pointsAwarded: result.pointsAwarded,
          nextStreak: result.nextStreak,
        },
        { status: 200 }
      );
    }

    if (command === "next_round") {
      const nextRoundNumber = (sessionRow.current_round ?? 0) + 1;

      if (nextRoundNumber > (sessionRow.total_rounds ?? 5)) {
        const { data: finishedSession, error } = await supabase
          .from("game_sessions")
          .update({
            status: "finished",
            buzzed_player_id: null,
          })
          .eq("id", sessionRow.id)
          .select("*")
          .single();

        if (error || !finishedSession) {
          return NextResponse.json(
            { message: error?.message ?? "Clôture impossible." },
            { status: 500 }
          );
        }

        return NextResponse.json({ session: finishedSession }, { status: 200 });
      }

      const { data: contents } = await supabase
        .from("game_contents")
        .select("id, time_limit_sec")
        .eq("game_id", sessionRow.game_id)
        .order("sort_order", { ascending: true });

      const pickedContent =
        contents && contents.length > 0
          ? contents[(nextRoundNumber - 1) % contents.length]
          : null;

      const { data: updatedSession, error } = await supabase
        .from("game_sessions")
        .update({
          current_round: nextRoundNumber,
          status: "playing",
          active_content_id: pickedContent?.id ?? null,
          round_duration_sec:
            pickedContent?.time_limit_sec ?? sessionRow.round_duration_sec,
          round_started_at: new Date().toISOString(),
          buzzed_player_id: null,
        })
        .eq("id", sessionRow.id)
        .select("*")
        .single();

      if (error || !updatedSession) {
        return NextResponse.json(
          {
            message:
              error?.message ?? "Impossible de passer à la manche suivante.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({ session: updatedSession }, { status: 200 });
    }

    if (command === "reset_session") {
      await supabase
        .from("player_actions")
        .delete()
        .eq("session_id", sessionRow.id);

      await supabase
        .from("player_scores")
        .update({ total_score: 0, streak: 0 })
        .eq("session_id", sessionRow.id);

      const { data: resetSession, error } = await supabase
        .from("game_sessions")
        .update({
          status: "lobby",
          current_round: 0,
          active_content_id: null,
          round_started_at: null,
          buzzed_player_id: null,
        })
        .eq("id", sessionRow.id)
        .select("*")
        .single();

      if (error || !resetSession) {
        return NextResponse.json(
          {
            message:
              error?.message ?? "Impossible de réinitialiser la partie.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({ session: resetSession }, { status: 200 });
    }

    return NextResponse.json(
      { message: `Commande non reconnue : ${command}` },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        message:
          err instanceof Error
            ? err.message
            : "Erreur interne lors du pilotage de la partie.",
      },
      { status: 500 }
    );
  }
}
