export interface SessionPlayer {
  id: string;
  session_id: string;
  nickname: string;
  avatar: string | null;
  avatarId?: string;
  is_host: boolean;
  is_connected: boolean;
  joined_at?: string;
}
