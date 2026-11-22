import { NextResponse } from "next/server";
import { INITIAL_GAMES } from "@/features/games/catalog";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function generateSessionCode(length = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return code;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      gameId?: string;
      gameSlug?: string;
      totalRounds?: number;
      roundDurationSec?: number;
    };

    const fallbackGame =
      INITIAL_GAMES.find(
        (g) => g.id === body.gameId || g.slug === body.gameSlug
      ) ?? INITIAL_GAMES[0];

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

    let gameId = fallbackGame?.id ?? "";

    if (fallbackGame?.slug) {
      const { data: dbGame } = await supabase
        .from("games")
        .select("id")
        .eq("slug", fallbackGame.slug)
        .maybeSingle();

      if (dbGame?.id) {
        gameId = dbGame.id;
      }
    }

    if (!gameId) {
      const { data: anyGame } = await supabase
        .from("games")
        .select("id")
        .limit(1)
        .maybeSingle();
      if (!anyGame?.id) {
        return NextResponse.json(
          {
            message:
              "Aucun jeu trouvé en base Supabase. Vérifiez que la migration et le seed ont bien été exécutés.",
          },
          { status: 400 }
        );
      }
      gameId = anyGame.id;
    }

    const code = generateSessionCode(6);
    const totalRounds =
      typeof body.totalRounds === "number" && body.totalRounds > 0
        ? Math.min(body.totalRounds, 30)
        : 5;
    const roundDurationSec =
      typeof body.roundDurationSec === "number" && body.roundDurationSec >= 5
        ? Math.min(body.roundDurationSec, 120)
        : 15;

    const { data: created, error } = await supabase
      .from("game_sessions")
      .insert({
        code,
        game_id: gameId,
        status: "lobby",
        current_round: 0,
        total_rounds: totalRounds,
        round_duration_sec: roundDurationSec,
        show_qr: true,
      })
      .select("*")
      .single();

    if (error || !created) {
      return NextResponse.json(
        {
          message:
            error?.message ?? "Impossible de créer la session de jeu.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        id: created.id,
        code: created.code,
        status: created.status,
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        message:
          err instanceof Error
            ? err.message
            : "Erreur interne lors de la création de la partie.",
      },
      { status: 500 }
    );
  }
}
