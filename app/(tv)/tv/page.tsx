"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Sparkles, Users, Clock, Tv, X } from "lucide-react";
import { FocusCard } from "@/components/tvos/FocusCard";
import { GlassPanel } from "@/components/tvos/GlassPanel";
import { GAME_CATEGORIES, INITIAL_GAMES } from "@/features/games/catalog";
import { useSpatialNavigation } from "@/hooks/useSpatialNavigation";
import type { GameCategorySlug, GameDefinition } from "@/types/game.types";

export default function TvCatalogPage() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] =
    useState<GameCategorySlug>("multijoueur");
  const [selectedGame, setSelectedGame] = useState<GameDefinition | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredGames = useMemo(() => {
    if (selectedCategory === "multijoueur") {
      return INITIAL_GAMES;
    }
    return INITIAL_GAMES.filter(
      (game) => game.categorySlug === selectedCategory
    );
  }, [selectedCategory]);

  const { focusedIndex, setFocusedIndex } = useSpatialNavigation({
    itemCount: filteredGames.length,
    columns: 3,
    enabled: selectedGame === null,
    onSelect: (index) => {
      const target = filteredGames[index];
      if (target) {
        setSelectedGame(target);
      }
    },
  });

  const activeGame =
    selectedGame ?? filteredGames[focusedIndex] ?? INITIAL_GAMES[0];

  const handleCreateSession = async (game: GameDefinition) => {
    setIsCreating(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id, gameSlug: game.slug }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          payload?.message ??
            "L'API de création de partie sera disponible à l'Étape 6."
        );
      }

      const data = (await response.json()) as { code?: string };
      if (data.code) {
        router.push(`/tv/${data.code}`);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Impossible de démarrer la partie pour le moment."
      );
    } finally {
      setIsCreating(false);
    }
  };

  const rulesList = Array.isArray(selectedGame?.rules)
    ? (selectedGame.rules as string[])
    : [];

  return (
    <main className="relative min-h-screen overflow-hidden bg-tvos-bg text-white">
      <div
        className="pointer-events-none fixed inset-0 transition-all duration-700"
        style={{
          background: activeGame
            ? `radial-gradient(circle at 75% 15%, ${activeGame.accentColor}30 0%, transparent 50%), radial-gradient(circle at 15% 85%, rgba(10, 132, 255, 0.14) 0%, transparent 55%)`
            : undefined,
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1680px] flex-col justify-between px-8 py-8 lg:px-14 lg:py-10">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="tvos-glass flex h-12 w-12 items-center justify-center rounded-2xl">
              <Tv className="h-6 w-6 text-tvos-accent" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/55">
                tvOS Party Lounge
              </p>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Catalogue de Jeux
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/play")}
              className="tvos-glass rounded-full px-5 py-2.5 text-sm font-medium text-white/85 transition hover:bg-white/15"
            >
              Rejoindre via code
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="tvos-glass rounded-full px-5 py-2.5 text-sm font-medium text-white/85 transition hover:bg-white/15"
            >
              Console animateur
            </button>
          </div>
        </header>

        <section aria-label="Catégories" className="my-8">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {GAME_CATEGORIES.map((category) => {
              const isSelected = category.slug === selectedCategory;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(category.slug);
                    setFocusedIndex(0);
                  }}
                  className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
                    isSelected
                      ? "bg-white text-black shadow-lg"
                      : "tvos-glass text-white/75 hover:bg-white/15 hover:text-white"
                  }`}
                >
                  {category.name}
                </button>
              );
            })}
          </div>
        </section>

        <section aria-label="Jeux disponibles" className="flex-1">
          {filteredGames.length === 0 ? (
            <GlassPanel className="flex flex-col items-center justify-center p-14 text-center">
              <Sparkles className="mb-4 h-10 w-10 text-tvos-accent" />
              <h2 className="text-xl font-semibold">
                Bientôt disponible dans cette catégorie
              </h2>
              <p className="mt-2 max-w-md text-sm text-white/65">
                Les trois premiers jeux complets (Grand Quiz tvOS, Blind Test
                Buzzer et Speed Rush) sont prêts dans le catalogue principal.
              </p>
              <button
                type="button"
                onClick={() => setSelectedCategory("multijoueur")}
                className="mt-6 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black"
              >
                Voir tous les jeux
              </button>
            </GlassPanel>
          ) : (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
              {filteredGames.map((game, index) => (
                <FocusCard
                  key={game.id}
                  title={game.title}
                  subtitle={game.tagline ?? ""}
                  badge={
                    GAME_CATEGORIES.find((c) => c.slug === game.categorySlug)
                      ?.name
                  }
                  meta={`${game.minPlayers}-${game.maxPlayers} joueurs • ~${game.estimatedMinutes} min`}
                  imageUrl={game.coverUrl}
                  accentColor={game.accentColor}
                  isFocused={focusedIndex === index}
                  onFocus={() => setFocusedIndex(index)}
                  onSelect={() => setSelectedGame(game)}
                >
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Voir la fiche & lancer
                  </span>
                </FocusCard>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-8 flex items-center justify-between text-xs text-white/50">
          <span>
            Navigation : Flèches directionnelles + Entrée, souris ou écran
            tactile
          </span>
          <span>Écran TV optimisé plein écran</span>
        </footer>
      </div>

      <AnimatePresence>
        {selectedGame ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-xl"
          >
            <GlassPanel className="relative w-full max-w-4xl overflow-hidden p-8 lg:p-10">
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => {
                  setSelectedGame(null);
                  setErrorMessage(null);
                }}
                className="tvos-glass absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-full text-white/80 hover:bg-white/20 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="grid gap-8 lg:grid-cols-12">
                <div className="lg:col-span-5">
                  <div className="overflow-hidden rounded-2xl border border-white/15">
                    <img
                      src={selectedGame.coverUrl}
                      alt={selectedGame.title}
                      className="aspect-video w-full object-cover"
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/75">
                    <span className="tvos-glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5">
                      <Users className="h-3.5 w-3.5" />
                      {selectedGame.minPlayers} à {selectedGame.maxPlayers}{" "}
                      joueurs
                    </span>
                    <span className="tvos-glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5">
                      <Clock className="h-3.5 w-3.5" />~
                      {selectedGame.estimatedMinutes} min
                    </span>
                  </div>
                </div>

                <div className="flex flex-col justify-between lg:col-span-7">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tvos-accent">
                      {
                        GAME_CATEGORIES.find(
                          (c) => c.slug === selectedGame.categorySlug
                        )?.name
                      }
                    </p>
                    <h2 className="mt-2 text-3xl font-bold tracking-tight lg:text-4xl">
                      {selectedGame.title}
                    </h2>
                    <p className="mt-3 text-base leading-relaxed text-white/80">
                      {selectedGame.description}
                    </p>

                    {rulesList.length > 0 ? (
                      <div className="mt-6">
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/60">
                          Règles du jeu
                        </h3>
                        <ul className="mt-3 space-y-2 text-sm text-white/85">
                          {rulesList.map((rule, i) => (
                            <li key={i} className="flex items-start gap-2.5">
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-tvos-accent" />
                              <span>{rule}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>

                  {errorMessage ? (
                    <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
                      {errorMessage}
                    </p>
                  ) : null}

                  <div className="mt-8 flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      disabled={isCreating}
                      onClick={() => handleCreateSession(selectedGame)}
                      className="inline-flex items-center gap-2.5 rounded-full bg-white px-7 py-3.5 text-sm font-bold text-black shadow-lg transition hover:scale-[1.02] disabled:opacity-50"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      {isCreating
                        ? "Création de la partie..."
                        : "Créer une nouvelle partie"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGame(null);
                        setErrorMessage(null);
                      }}
                      className="tvos-glass rounded-full px-6 py-3.5 text-sm font-semibold text-white/85 hover:bg-white/15"
                    >
                      Retour au catalogue
                    </button>
                  </div>
                </div>
              </div>
            </GlassPanel>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
