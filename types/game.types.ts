export type GameSlug =
  | "quiz"
  | "blind-test"
  | "petit-bac"
  | "zero-a-1000"
  | "manille"
  | (string & {});

export interface GameCategory {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  created_at?: string;
}

export interface Game {
  id: string;
  category_id: string | null;
  slug: GameSlug;
  title: string;
  tagline: string | null;
  description: string | null;
  min_players: number;
  max_players: number | null;
  rules: Record<string, unknown> | null;
  is_active: boolean;
  created_at?: string;
}

export type GameDefinition = Game;

export interface GameContent {
  id: string;
  game_id: string;
  category: string | null;
  question: string;
  options: string[] | null;
  answer: string;
  media_url: string | null;
  difficulty: "easy" | "medium" | "hard" | string | null;
  metadata: Record<string, unknown> | null;
  created_at?: string;
}

export type SessionStatus =
  | "lobby"
  | "starting"
  | "playing"
  | "paused"
  | "round_result"
  | "finished";

export interface GameSession {
  id: string;
  game_id: string;
  code: string;
  status: SessionStatus;
  current_round: number;
  state: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface SessionPlayer {
  id: string;
  session_id: string;
  nickname: string;
  avatar: string | null;
  is_host: boolean;
  is_connected: boolean;
  joined_at?: string;
}

export type PlayerSession = SessionPlayer;

export interface PlayerScore {
  id: string;
  session_id: string;
  player_id: string;
  score: number;
  updated_at?: string;
}

export interface PlayerAction {
  id: string;
  session_id: string;
  player_id: string;
  action_type: string;
  payload: Record<string, unknown> | null;
  created_at?: string;
}

export interface PlayerChoice {
  playerId: string;
  value: string;
  timestamp?: number;
}
