-- Catégories
insert into public.game_categories (slug, name, sort_order) values
  ('multijoueur', 'Tous les jeux', 0),
  ('quiz', 'Quiz', 1),
  ('blind-test', 'Blind Test', 2),
  ('rapidite', 'Jeux de rapidité', 3),
  ('culture-generale', 'Culture générale', 4),
  ('dessin-devinettes', 'Dessin et devinettes', 5),
  ('estimation', 'Jeux d''estimation', 6),
  ('adresse', 'Jeux d''adresse', 7),
  ('ambiance', 'Jeux d''ambiance', 8)
on conflict (slug) do nothing;

-- Jeux initiaux
insert into public.games (
  category_id,
  category_slug,
  slug,
  title,
  tagline,
  description,
  rules,
  cover_url,
  accent_color,
  min_players,
  max_players,
  estimated_minutes,
  is_active
)
select
  c.id,
  'quiz',
  'quiz',
  'Grand Quiz tvOS',
  'Répondez vite et juste depuis votre téléphone',
  'Affrontez vos amis sur une série de questions rythmées. Plus votre réponse est rapide et exacte, plus vous empochez de points.',
  '["Chaque joueur choisit l''une des 4 propositions depuis son smartphone.", "Les bonnes réponses accordent des points de base plus un bonus de rapidité.", "Le classement complet est dévoilé après chaque manche."]'::jsonb,
  'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1200&q=80',
  '#0A84FF',
  1,
  16,
  10,
  true
from public.game_categories c
where c.slug = 'quiz'
on conflict (slug) do nothing;

insert into public.games (
  category_id,
  category_slug,
  slug,
  title,
  tagline,
  description,
  rules,
  cover_url,
  accent_color,
  min_players,
  max_players,
  estimated_minutes,
  is_active
)
select
  c.id,
  'blind-test',
  'blind-test',
  'Blind Test Buzzer',
  'Le premier buzzer verrouille la manche',
  'Écoutez l''extrait diffusé sur le téléviseur et appuyez sur votre buzzer géant avant tout le monde pour tenter de marquer gros.',
  '["Appuyez sur le buzzer de votre téléphone dès que vous reconnaissez le titre ou l''artiste.", "Le premier buzzer bloque la manche et alerte le téléviseur en temps réel.", "L''animateur valide ou refuse la réponse pour attribuer ou retirer des points."]'::jsonb,
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80',
  '#FF375F',
  2,
  16,
  12,
  true
from public.game_categories c
where c.slug = 'blind-test'
on conflict (slug) do nothing;

insert into public.games (
  category_id,
  category_slug,
  slug,
  title,
  tagline,
  description,
  rules,
  cover_url,
  accent_color,
  min_players,
  max_players,
  estimated_minutes,
  is_active
)
select
  c.id,
  'rapidite',
  'speed-rush',
  'Speed Rush',
  'Réflexes éclairs et sang-froid sous pression',
  'Un duel de vitesse pur : des questions courtes, un compte à rebours tendu et des séries de bonnes réponses qui font exploser le score.',
  '["Répondez avant la fin du chronomètre ultra-court sur chaque défi.", "Enchaînez les bonnes réponses pour activer votre multiplicateur de série.", "Toute erreur remet le multiplicateur à zéro."]'::jsonb,
  'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80',
  '#30D158',
  1,
  16,
  8,
  true
from public.game_categories c
where c.slug = 'rapidite'
on conflict (slug) do nothing;

-- Contenus d'exemple pour Grand Quiz tvOS
insert into public.game_contents (
  game_id,
  round_type,
  prompt,
  options,
  correct_answer,
  time_limit_sec,
  points,
  sort_order
)
select
  g.id,
  'quiz',
  'Quelle planète est surnommée la planète rouge ?',
  '["Vénus", "Mars", "Jupiter", "Saturne"]'::jsonb,
  'Mars',
  15,
  1000,
  1
from public.games g
where g.slug = 'quiz'
  and not exists (
    select 1 from public.game_contents gc where gc.game_id = g.id and gc.sort_order = 1
  );

insert into public.game_contents (
  game_id,
  round_type,
  prompt,
  options,
  correct_answer,
  time_limit_sec,
  points,
  sort_order
)
select
  g.id,
  'quiz',
  'En quelle année l''homme a-t-il marché sur la Lune pour la première fois ?',
  '["1965", "1969", "1972", "1979"]'::jsonb,
  '1969',
  15,
  1000,
  2
from public.games g
where g.slug = 'quiz'
  and not exists (
    select 1 from public.game_contents gc where gc.game_id = g.id and gc.sort_order = 2
  );
