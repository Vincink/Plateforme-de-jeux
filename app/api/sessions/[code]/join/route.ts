import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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
      nickname?: string;
      avatarId?: string;
      playerToken?: string;
    };

    const nickname = (body.nickname ?? "").trim();
    const avatarId = (body.avatarId ?? "fox").trim() || "fox";
    const playerToken = (body.playerToken ?? "").trim();

    if (nickname.length < 2 || nickname.length > 24) {
      return NextResponse.json(
        { message: "Le pseudo doit contenir entre 2 et 24 caractères." },
        { status: 400 }
      );
    }

    if (!playerToken) {
      return NextResponse.json(
        { message: "Jeton joueur (playerToken) manquant." },
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

    const { data: sessionRow, error: sessionErr } = await supabase
      .from("game_sessions")
      .select("id, code, status")
      .eq("code", sessionCode)
      .maybeSingle();

    if (sessionErr) {
      return NextResponse.json(
        { message: sessionErr.message },
        { status: 500 }
      );
    }

    if (!sessionRow) {
      return NextResponse.json(
        { message: `Aucune partie trouvée avec le code ${sessionCode}.` },
        { status: 404 }
      );
    }

    if (sessionRow.status === "finished") {
      return NextResponse.json(
        { message: "Cette partie est déjà terminée." },
        { status: 409 }
      );
    }

    const { data: playerRow, error: playerErr } = await supabase
      .from("session_players")
      .upsert(
        {
          session_id: sessionRow.id,
          nickname,
          avatar_id: avatarId,
          player_token: playerToken,
          is_connected: true,
          last_seen_at: new Date().toISOString(),
        },
        {
          onConflict: "session_id,player_token",
        }
      )
      .select("*")
      .single();

    if (playerErr || !playerRow) {
      return NextResponse.json(
        {
          message:
            playerErr?.message ??
            "Impossible d'enregistrer le joueur dans la partie.",
        },
        { status: 500 }
      );
    }

    const { data: existingScore } = await supabase
      .from("player_scores")
      .select("total_score, streak")
      .eq("session_id", sessionRow.id)
      .eq("player_id", playerRow.id)
      .maybeSingle();

    await supabase.from("player_scores").upsert(
      {
        session_id: sessionRow.id,
        player_id: playerRow.id,
        nickname: playerRow.nickname,
        avatar_id: playerRow.avatar_id,
        total_score: existingScore?.total_score ?? 0,
        streak: existingScore?.streak ?? 0,
      },
      {
        onConflict: "session_id,player_id",
      }
    );

    return NextResponse.json(
      {
        player: {
          id: playerRow.id,
          sessionId: playerRow.session_id,
          nickname: playerRow.nickname,
          avatarId: playerRow.avatar_id,
          playerToken: playerRow.player_token,
          isConnected: playerRow.is_connected,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        message:
          err instanceof Error
            ? err.message
            : "Erreur interne lors de la connexion à la partie.",
      },
      { status: 500 }
    );
  }
}
