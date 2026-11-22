import { calculateRoundScore } from "@/features/games/scoring";
import type {
  GameContent,
  GameSession,
  GameSlug,
  PlayerAction,
} from "@/types/game.types";

type EngineContent = GameContent & {
  correctAnswer?: string;
  points?: number;
  timeLimitSec?: number;
};

type EngineSession = GameSession & {
  buzzedPlayerId?: string | null;
  buzzed_player_id?: string | null;
  currentRound?: number;
};

type EngineAction = PlayerAction & {
  roundNumber?: number;
  round_number?: number;
  actionType?: string;
};

export interface EvaluateAnswerResult {
  isCorrect: boolean;
  pointsAwarded: number;
  nextStreak: number;
}

export function evaluatePlayerChoice(params: {
  gameSlug: GameSlug;
  content: EngineContent;
  selectedOption: string;
  responseTimeMs: number | null;
  currentStreak: number;
}): EvaluateAnswerResult {
  const expected = params.content.answer ?? params.content.correctAnswer ?? "";
  const normalizedSelected = params.selectedOption.trim().toLowerCase();
  const normalizedExpected = expected.trim().toLowerCase();
  const isCorrect =
    normalizedSelected.length > 0 && normalizedSelected === normalizedExpected;

  const mode = params.gameSlug === "speed-rush" ? "speed_rush" : "quiz";

  const { pointsAwarded, nextStreak } = calculateRoundScore({
    basePoints: params.content.points ?? 1000,
    isCorrect,
    responseTimeMs: params.responseTimeMs,
    timeLimitSec: params.content.timeLimitSec ?? 15,
    currentStreak: params.currentStreak,
    mode,
  });

  return {
    isCorrect,
    pointsAwarded,
    nextStreak,
  };
}

export function canAcceptBuzz(
  session: EngineSession,
  roundActions: EngineAction[]
): boolean {
  if (session.status !== "playing") {
    return false;
  }

  if (session.buzzedPlayerId || session.buzzed_player_id) {
    return false;
  }

  const activeRound = session.currentRound ?? session.current_round;

  const alreadyBuzzed = roundActions.some((action) => {
    const actionRound = action.roundNumber ?? action.round_number;
    const type = action.actionType ?? action.action_type;
    return actionRound === activeRound && type === "buzz";
  });

  return !alreadyBuzzed;
}

export function resolveBlindTestValidation(params: {
  basePoints: number;
  isApproved: boolean;
  currentStreak: number;
}): EvaluateAnswerResult {
  const { pointsAwarded, nextStreak } = calculateRoundScore({
    basePoints: params.basePoints,
    isCorrect: params.isApproved,
    currentStreak: params.currentStreak,
    mode: "blind_test",
  });

  return {
    isCorrect: params.isApproved,
    pointsAwarded,
    nextStreak,
  };
}
