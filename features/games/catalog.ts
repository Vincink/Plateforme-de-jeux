import type { GameCategory, GameDefinition } from "@/types/game.types";

export type CatalogGame = Omit<GameDefinition, "rules"> & {
  categoryId?: string | null;
  rules?: string[] | Record<string, unknown> | null;
  minPlayers?: number;
  maxPlayers?: number | null;
  estimatedMinutes?: number;
  coverUrl?: string;
  isActive?: boolean;
};

export const GAME_CATEGORIES: GameCategory[] = [
  { id: "cat-all", slug: "multijoueur", name: "Tous les jeux", sort_order: 0 },
  { id: "cat-quiz", slug: "quiz", name: "Quiz", sort_order: 1 },
  { id: "cat-blind", slug: "blind-test", name: "Blind Test", sort_order: 2 },
  { id: "cat-speed", slug: "rapidite", name: "Jeux de rapidité", sort_order: 3 },
  { id: "cat-culture", slug: "culture-generale", name: "Culture générale", sort_order: 4 },
  { id: "cat-draw", slug: "dessin-devinettes", name: "Dessin et devinettes", sort_order: 5 },
  { id: "cat-est", slug: "estimation", name: "Jeux d'estimation", sort_order: 6 },
  { id: "cat-skill", slug: "adresse", name: "Jeux d'adresse", sort_order: 7 },
  { id: "cat-party", slug: "ambiance", name: "Jeux d'ambiance", sort_order: 8 },
];

export const INITIAL_GAMES: CatalogGame[] = [
  {
    id: "game-quiz",
    category_id: "cat-quiz",
    categoryId: "cat-quiz",
    categorySlug: "quiz",
    slug: "quiz",
    title: "Grand Quiz tvOS",
    tagline: "Répondez vite et juste depuis votre téléphone",
    description:
      "Affrontez vos amis sur une série de questions rythmées. Plus votre réponse est rapide et exacte, plus vous empochez de points.",
    rules: [
      "Chaque joueur choisit l'une des 4 propositions depuis son smartphone.",
      "Les bonnes réponses accordent des points de base plus un bonus de rapidité.",
      "Le classement complet est dévoilé après chaque manche.",
    ],
    coverUrl:
      "https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1200&q=80",
    accentColor: "#0A84FF",
    min_players: 1,
    max_players: 16,
    minPlayers: 1,
    maxPlayers: 16,
    estimatedMinutes: 10,
    is_active: true,
    isActive: true,
  },
  {
    id: "game-blind-test",
    category_id: "cat-blind",
    categoryId: "cat-blind",
    categorySlug: "blind-test",
    slug: "blind-test",
    title: "Blind Test Buzzer",
    tagline: "Le premier buzzer verrouille la manche",
    description:
      "Écoutez l'extrait diffusé sur le téléviseur et appuyez sur votre buzzer géant avant tout le monde pour tenter de marquer gros.",
    rules: [
      "Appuyez sur le buzzer de votre téléphone dès que vous reconnaissez le titre ou l'artiste.",
      "Le premier buzzer bloque la manche et alerte le téléviseur en temps réel.",
      "L'animateur valide ou refuse la réponse pour attribuer ou retirer des points.",
    ],
    coverUrl:
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80",
    accentColor: "#FF375F",
    min_players: 2,
    max_players: 16,
    minPlayers: 2,
    maxPlayers: 16,
    estimatedMinutes: 12,
    is_active: true,
    isActive: true,
  },
  {
    id: "game-speed-rush",
    category_id: "cat-speed",
    categoryId: "cat-speed",
    categorySlug: "rapidite",
    slug: "speed-rush",
    title: "Speed Rush",
    tagline: "Réflexes éclairs et sang-froid sous pression",
    description:
      "Un duel de vitesse pur : des questions courtes, un compte à rebours tendu et des séries de bonnes réponses qui font exploser le score.",
    rules: [
      "Répondez avant la fin du chronomètre ultra-court sur chaque défi.",
      "Enchaînez les bonnes réponses pour activer votre multiplicateur de série.",
      "Toute erreur remet le multiplicateur à zéro.",
    ],
    coverUrl:
      "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80",
    accentColor: "#30D158",
    min_players: 1,
    max_players: 16,
    minPlayers: 1,
    maxPlayers: 16,
    estimatedMinutes: 8,
    is_active: true,
    isActive: true,
  },
];
