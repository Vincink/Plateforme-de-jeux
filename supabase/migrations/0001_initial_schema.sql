-- Extension UUID
create extension if not exists "pgcrypto";

-- Catégories de jeux
create table if not exists public.game_categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Catalogue des jeux
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.game_categories(id) on delete set null,
  category_slug text not null default 'multijoueur',
  slug text unique not null,
  title text not null,
  tagline text not null default '',
  description text not null default '',
  rules jsonb not null default '[]'::jsonb,
  cover_url text not null default '',
  accent_color text not null default '#0A84FF',
  min_players int not null default 1,
  max_players int not null default 16,
  estimated_minutes int not null default 10,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Contenus / questions / manches par jeu
create table if not exists public.game_contents (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  round_type text not null default 'quiz',
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answer text not null default '',
  media_url text,
  time_limit_sec int not null default 15,
  points int not null default 1000,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Sessions de partie
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  game_id uuid not null references public.games(id) on delete restrict,
  host_user_id uuid,
  status text not null default 'lobby' check (
    status in ('lobby', 'starting', 'playing', 'paused', 'round_result', 'finished')
  ),
  current_round int not null default 0,
  total_rounds int not null default 5,
  round_started_at timestamptz,
  round_duration_sec int not null default 15,
  show_qr boolean not null default true,
  active_content_id uuid references public.game_contents(id) on delete set null,
  buzzed_player_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Joueurs connectés à une session
create table if not exists public.session_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  nickname text not null,
  avatar_id text not null default 'fox',
  player_token text not null,
  is_connected boolean not null default true,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (session_id, player_token)
);

-- Réponses et buzzers des joueurs
create table if not exists public.player_actions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null references public.session_players(id) on delete cascade,
  round_number int not null,
  action_type text not null check (action_type in ('answer', 'buzz', 'speed_tap')),
  payload jsonb not null default '{}'::jsonb,
  response_time_ms int,
  is_correct boolean,
  points_awarded int not null default 0,
  created_at timestamptz not null default now()
);

-- Scores cumulés par joueur et session
create table if not exists public.player_scores (
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null references public.session_players(id) on delete cascade,
  nickname text not null,
  avatar_id text not null default 'fox',
  total_score int not null default 0,
  streak int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (session_id, player_id)
);

-- Index utiles
create index if not exists idx_game_sessions_code on public.game_sessions(code);
create index if not exists idx_session_players_session on public.session_players(session_id);
create index if not exists idx_player_actions_session_round on public.player_actions(session_id, round_number);
create index if not exists idx_player_scores_session_score on public.player_scores(session_id, total_score desc);

-- Mise à jour automatique de updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_game_sessions_updated_at on public.game_sessions;
create trigger trg_game_sessions_updated_at
before update on public.game_sessions
for each row execute function public.set_updated_at();

drop trigger if exists trg_player_scores_updated_at on public.player_scores;
create trigger trg_player_scores_updated_at
before update on public.player_scores
for each row execute function public.set_updated_at();

-- Activation Row Level Security (RLS)
alter table public.game_categories enable row level security;
alter table public.games enable row level security;
alter table public.game_contents enable row level security;
alter table public.game_sessions enable row level security;
alter table public.session_players enable row level security;
alter table public.player_actions enable row level security;
alter table public.player_scores enable row level security;

-- Lecture publique du catalogue et des parties
create policy "Public read game_categories"
on public.game_categories for select using (true);

create policy "Public read games"
on public.games for select using (true);

create policy "Public read game_contents"
on public.game_contents for select using (true);

create policy "Public read game_sessions"
on public.game_sessions for select using (true);

create policy "Public read session_players"
on public.session_players for select using (true);

create policy "Public read player_actions"
on public.player_actions for select using (true);

create policy "Public read player_scores"
on public.player_scores for select using (true);

-- Insertion / mise à jour contrôlée (affiner avec auth / service role en production)
create policy "Public insert session_players"
on public.session_players for insert with check (true);

create policy "Public update session_players"
on public.session_players for update using (true);

create policy "Public insert player_actions"
on public.player_actions for insert with check (true);

create policy "Public upsert player_scores"
on public.player_scores for insert with check (true);

create policy "Public update player_scores"
on public.player_scores for update using (true);

create policy "Public insert game_sessions"
on public.game_sessions for insert with check (true);

create policy "Public update game_sessions"
on public.game_sessions for update using (true);

-- Publication Realtime
alter publication supabase_realtime add table public.game_sessions;
alter publication supabase_realtime add table public.session_players;
alter publication supabase_realtime add table public.player_actions;
alter publication supabase_realtime add table public.player_scores;
