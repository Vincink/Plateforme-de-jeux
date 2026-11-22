export interface ScoreCalculationInput {
  basePoints: number;
  isCorrect: boolean;
  responseTimeMs?: number | null;
  timeLimitSec?: number;
  currentStreak: number;
  mode: "quiz" | "blind_test" | "speed_rush";
}

export interface ScoreCalculationResult {
  pointsAwarded: number;
  nextStreak: number;
}

export function calculateRoundScore({
  basePoints,
  isCorrect,
  responseTimeMs,
  timeLimitSec = 15,
  currentStreak,
  mode,
}: ScoreCalculationInput): ScoreCalculationResult {
  if (!isCorrect) {
    return {
      pointsAwarded: mode === "blind_test" ? -Math.round(basePoints * 0.25) : 0,
      nextStreak: 0,
    };
  }

  const nextStreak = currentStreak + 1;
  const safeBase = Math.max(100, basePoints);

  if (mode === "blind_test") {
    const streakBonus = Math.min(nextStreak - 1, 5) * 100;
    return {
      pointsAwarded: safeBase + streakBonus,
      nextStreak,
    };
  }

  const limitMs = Math.max(1000, timeLimitSec * 1000);
  const clampedTimeMs = Math.max(
    0,
    Math.min(responseTimeMs ?? limitMs / 2, limitMs)
  );
  const speedRatio = 1 - clampedTimeMs / limitMs;
  const speedBonus = Math.round(safeBase * 0.5 * speedRatio);

  if (mode === "speed_rush") {
    const multiplier = 1 + Math.min(nextStreak - 1, 6) * 0.25;
    return {
      pointsAwarded: Math.round((safeBase + speedBonus) * multiplier),
      nextStreak,
    };
  }

  const quizStreakBonus = Math.min(nextStreak - 1, 4) * 75;
  return {
    pointsAwarded: safeBase + speedBonus + quizStreakBonus,
    nextStreak,
  };
}
