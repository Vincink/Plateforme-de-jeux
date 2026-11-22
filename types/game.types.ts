export type GameSlug = "quiz" | "blind-test" | "speed-rush";

export type QuestionType = "mcq" | "audio_buzzer" | "speed_mcq";

export type SessionStatus =
  | "lobby"
  | "starting"
  | "playing"
  | "paused"
  | "round_result"
  | "finished";

export type GameCategorySlug =
  | "blind-test"
  | "quiz"
  | "culture-generale"
  | "dessin-devinettes"
  | "rapidite"
  | "estimation"
  | "adresse"
  | "multijoueur"
  | "ambiance";

export interface GameCategory {
  id: string;
  slug: GameCategorySlug;
  name: string;
  sortOrder: number;
}

export interface GameDefinition {
  id: string;
  categoryId: string;
  categorySlug: GameCategorySlug;
  slug: GameSlug;
  title: string;
  tagline: string;
  description: string;
  rules: string[];
  coverUrl: string;
  accentColor: string;
  minPlayers: number;
  maxPlayers: number;
  estimatedMinutes: number;
  isActive: boolean;
}

export interface PlayerSession {
  id: string;
  sessionId: string;
  nickname: string;
  avatarId: string;
  playerToken: string;
  isConnected: boolean;
  isKicked: boolean;
  joinedAt: string;
}

export interface PlayerScore {
  sessionId: string;
  playerId: string;
  nickname: string;
  avatarId: string;
  totalScore: number;
  streak: number;
}

export interface SessionSettings {
  sessionId: string;
  questionDurationSec: number;
  totalQuestions: number;
  allowLateJoin: boolean;
  soundEffects: boolean;
}

export interface GameSession {
  id: string;
  code: string;
  gameId: string;
  gameSlug: GameSlug;
  hostId: string | null;
  status: SessionStatus;
  currentQuestionIndex: number;
  questionStartedAt: string | null;
  buzzerLockedByPlayerId: string | null;
  showQr: boolean;
  createdAt: string;
}

export interface PublicQuestion {
  id: string;
  gameId: string;
  type: QuestionType;
  prompt: string;
  mediaUrl: string | null;
  options: string[];
  pointsBase: number;
  timeLimitSec: number;
}
