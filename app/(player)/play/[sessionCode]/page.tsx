      if (supabase && targetSession?.id) {
        const { data: currentSessionPlayers } = await supabase
          .from("session_players")
          .select("id, player_token, color_index")
          .eq("session_id", targetSession.id);

        const existingRows =
          (currentSessionPlayers as Array<{
            id: string;
            player_token?: string;
            color_index?: number | null;
          }> | null) ?? [];

        const existingSelf = existingRows.find(
          (row) =>
            row.id === newIdentity.playerId ||
            row.player_token === newIdentity.playerToken
        );

        const assignedColorIndex =
          typeof existingSelf?.color_index === "number"
            ? existingSelf.color_index
            : getNextAvailableColorIndex(existingRows);

        const { error: playerError } = await supabase
          .from("session_players")
          .upsert(
            {
              id: newIdentity.playerId,
              session_id: targetSession.id,
              nickname: newIdentity.nickname,
              avatar_id: newIdentity.avatarId,
              player_token: newIdentity.playerToken,
              color_index: assignedColorIndex,
              is_connected: true,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: "session_id,player_token" }
          );
