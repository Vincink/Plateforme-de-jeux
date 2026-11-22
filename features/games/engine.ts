import { calculateRoundScore } from "@/features/games/scoring";
import type {
  GameContent,
  GameSession,
  GameSlug,
  PlayerAction,
} from "@/types/game.types";

export interface EvaluateAnswerResult {
  isCorrect: boolean;
  pointsAwarded: number;
  nextStreak: number;
}

export function evaluatePlayerChoice(params: {
  gameSlug: GameSlug;
  content: GameContent;
  selectedOption: string;
  responseTimeMs: number | null;
  currentStreak: number;
}): EvaluateAnswerResult {
  const normalizedSelected = params.selectedOption.trim().toLowerCase();
  const normalizedExpected = params.content.correctAnswer.trim().toLowerCase();
  const isCorrect =
    normalizedSelected.length > 0 && normalizedSelected === normalizedExpected;

  const mode = params.gameSlug === "speed-rush" ? "speed_rush" : "quiz";

  const { pointsAwarded, nextStreak } = calculateRoundScore({
    basePoints: params.content.points,
    isCorrect,
    responseTimeMs: params.responseTimeMs,
    timeLimitSec: params.content.timeLimitSec,
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
  session: GameSession,
  roundActions: PlayerAction[]
): boolean {
  if (session.status !== "playing") {
    return false;
  }

  if (session.buzzedPlayerId) {
    return false;
  }

  const alreadyBuzzed = roundActions.some(
    (action) =>
      action.roundNumber === session.currentRound &&
      action.actionType === "buzz"
  );

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
