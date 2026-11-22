"use client";

import React, { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  BellRing,
  CheckCircle2,
  LogOut,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { GlassPanel } from "@/components/tvos/GlassPanel";
import { LiveLeaderboard } from "@/components/shared/LiveLeaderboard";
import { INITIAL_GAMES } from "@/features/games/catalog";
import { usePlayerSession } from "@/hooks/usePlayerSession";
import type {
  GameSlug,
  PlayerScore,
  PlayerSession,
  SessionStatus,
} from "@/types/game.types";

const AVATARS = [
  { id: "fox", emoji: "🦊", label: "Renard" },
  { id: "rocket", emoji: "🚀", label: "Fusée" },
  { id: "crown", emoji: "👑", label: "Couronne" },
  { id: "ghost", emoji: "👻", label: "Fantôme" },
  { id: "alien", emoji: "👾", label: "Pixel" },
  { id: "unicorn", emoji: "🦄", label: "Licorne" },
  { id: "flame", emoji: "🔥", label: "Flamme" },
  { id: "star", emoji: "⭐", label: "Étoile" },
];

export default function PlayerControllerPage() {
  const params = useParams<{ sessionCode: string }>();
  const router = useRouter();
  const sessionCode = (params.sessionCode ?? "DEMO01").toUpperCase();

  const { identity, isHydrated, saveIdentity, clearIdentity } =
    usePlayerSession(sessionCode);

  const [nicknameInput, setNicknameInput] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("fox");
  const [formError, setFormError] = useState<string | null>(null);

  // États locaux d'aperçu avant connexion temps réel (Étape 6)
  const [status] = useState<SessionStatus>("lobby");
  const [gameSlug] = useState<GameSlug>("quiz");
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasBuzzed, setHasBuzzed] = useState(false);
  const [players] = useState<PlayerSession[]>([]);
  const [scores] = useState<PlayerScore[]>([]);
  const [activeTab, setActiveTab] = useState<"controller" | "ranking">(
    "controller"
  );

  const activeGame = useMemo(
    () => INITIAL_GAMES.find((g) => g.slug === gameSlug) ?? INITIAL_GAMES[0],
    [gameSlug]
  );

  const myScore = useMemo(() => {
    if (!identity) return 0;
    return (
      scores.find((s) => s.playerId === identity.playerId)?.totalScore ?? 0
    );
  }, [identity, scores]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = nicknameInput.trim();
    if (cleanName.length < 2) {
      setFormError("Choisissez un pseudo d'au moins 2 caractères.");
      return;
    }
    setFormError(null);

    const localId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `player-${Date.now()}`;

    saveIdentity({
      playerId: localId,
      playerToken: localId,
      nickname: cleanName,
      avatarId: selectedAvatar,
    });
  };

  const handleBuzz = () => {
    if (hasBuzzed) return;
    setHasBuzzed(true);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate([40, 20, 60]);
      } catch {
        // Ignore vibration unsupported error
      }
    }
  };

  if (!isHydrated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-tvos-bg text-white">
        <p className="text-sm text-white/60">Chargement de la manette...</p>
      </main>
    );
  }

  if (!identity) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-tvos-bg px-5 py-8 text-white">
        <div
          className="pointer-events-none fixed inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 10%, rgba(10, 132, 255, 0.22) 0%, transparent 55%)",
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-full max-w-md"
        >
          <GlassPanel className="p-6">
            <div className="mb-5 text-center">
              <span className="inline-block rounded-full bg-white/10 px-3.5 py-1 font-mono text-xs font-bold tracking-[0.2em] text-tvos-accent">
                PARTIE {sessionCode}
              </span>
              <h1 className="mt-2 text-2xl font-bold tracking-tight">
                Choisissez votre profil
              </h1>
              <p className="mt-1 text-xs text-white/60">
                Votre avatar et votre pseudo apparaîtront sur le téléviseur.
              </p>
            </div>

            <form onSubmit={handleJoin} className="space-y-5">
              <div>
                <label
                  htmlFor="player-nickname"
                  className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/65"
                >
                  Pseudo
                </label>
                <input
                  id="player-nickname"
                  type="text"
                  maxLength={18}
                  placeholder="Ex: Alex"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  className="w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3.5 text-base font-semibold text-white placeholder:text-white/30 focus:border-tvos-accent focus:outline-none"
                />
              </div>

              <div>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/65">
                  Avatar
                </span>
                <div className="grid grid-cols-4 gap-2.5">
                  {AVATARS.map((avatar) => {
                    const active = selectedAvatar === avatar.id;
                    return (
                      <button
                        key={avatar.id}
                        type="button"
                        onClick={() => setSelectedAvatar(avatar.id)}
                        className={`flex flex-col items-center justify-center rounded-2xl border py-3 transition ${
                          active
                            ? "border-white bg-white/20 shadow-lg"
                            : "border-white/10 bg-white/[0.04] hover:bg-white/10"
                        }`}
                      >
                        <span className="text-2xl">{avatar.emoji}</span>
                        <span className="mt-1 text-[11px] font-medium text-white/80">
                          {avatar.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {formError ? (
                <p className="text-center text-xs font-medium text-rose-400">
                  {formError}
                </p>
              ) : null}

              <button
                type="submit"
                className="w-full rounded-2xl bg-white py-3.5 text-sm font-bold text-black shadow-lg transition active:scale-[0.98]"
              >
                Rejoindre la partie
              </button>
            </form>
          </GlassPanel>
        </motion.div>
      </main>
    );
  }

  const currentAvatarEmoji =
    AVATARS.find((a) => a.id === identity.avatarId)?.emoji ?? "🎮";

  return (
    <main className="flex min-h-screen flex-col justify-between bg-tvos-bg px-4 py-5 text-white">
      <div className="mx-auto w-full max-w-md flex-1 space-y-5">
        {/* En-tête joueur */}
        <GlassPanel className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-2xl">
              {currentAvatarEmoji}
            </span>
            <div>
              <p className="text-sm font-bold leading-tight">
                {identity.nickname}
              </p>
              <p className="font-mono text-xs text-tvos-accent">
                {sessionCode} • {myScore} pts
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              clearIdentity();
              router.push("/play");
            }}
            aria-label="Quitter la partie"
            className="rounded-xl bg-white/10 p-2.5 text-white/75 hover:bg-white/20 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </GlassPanel>

        {/* Onglets Manette / Classement */}
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.05] p-1">
          <button
            type="button"
            onClick={() => setActiveTab("controller")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition ${
              activeTab === "controller"
                ? "bg-white text-black"
                : "text-white/70 hover:text-white"
            }`}
          >
            <Zap className="h-4 w-4" />
            Manette
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ranking")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition ${
              activeTab === "ranking"
                ? "bg-white text-black"
                : "text-white/70 hover:text-white"
            }`}
          >
            <Trophy className="h-4 w-4" />
            Classement
          </button>
        </div>

        {activeTab === "ranking" ? (
          <LiveLeaderboard scores={scores} title="Classement" />
        ) : (
          <GlassPanel className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/55">
                {activeGame?.title}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80">
                {status === "lobby" && "En attente"}
                {status === "starting" && "Démarrage"}
                {status === "playing" && "En jeu"}
                {status === "paused" && "Pause"}
                {status === "round_result" && "Résultat"}
                {status === "finished" && "Terminé"}
              </span>
            </div>

            {status === "lobby" && (
              <div className="py-6 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-11 w-11 text-emerald-400" />
                <h2 className="text-xl font-bold">Vous êtes prêt !</h2>
                <p className="mt-1.5 text-sm text-white/65">
                  Regardez le téléviseur. L&apos;animateur va lancer la partie.
                </p>

                <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/70">
                    <Users className="h-4 w-4 text-tvos-accent" />
                    <span>Joueurs connectés ({players.length})</span>
                  </div>
                  {players.length === 0 ? (
                    <p className="text-xs text-white/50">
                      Synchronisation en direct active dès l&apos;Étape 6.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {players.map((p) => (
                        <span
                          key={p.id}
                          className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold"
                        >
                          {p.nickname}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {status === "playing" && gameSlug === "blind-test" && (
              <div className="flex flex-col items-center py-6 text-center">
                <button
                  type="button"
                  disabled={hasBuzzed}
                  onClick={handleBuzz}
                  className={`flex h-48 w-48 flex-col items-center justify-center rounded-full border-4 transition active:scale-95 ${
                    hasBuzzed
                      ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-200"
                      : "border-rose-300 bg-gradient-to-b from-rose-500 to-rose-700 text-white shadow-[0_0_50px_rgba(244,63,94,0.55)]"
                  }`}
                >
                  <BellRing className="mb-2 h-12 w-12" />
                  <span className="text-xl font-black tracking-wider">
                    {hasBuzzed ? "BUZZÉ !" : "BUZZER"}
                  </span>
                </button>
                <p className="mt-5 text-xs text-white/65">
                  {hasBuzzed
                    ? "Réponse transmise à l'animateur..."
                    : "Appuyez dès que vous trouvez !"}
                </p>
              </div>
            )}

            {status === "playing" && gameSlug !== "blind-test" && (
              <div className="space-y-3 py-2">
                <p className="mb-3 text-center text-xs text-white/65">
                  Choisissez votre réponse sur l&apos;écran TV
                </p>
                {[0, 1, 2, 3].map((idx) => {
                  const labels = ["A", "B", "C", "D"];
                  const isPicked = selectedOption === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedOption(idx)}
                      className={`flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left font-bold transition active:scale-[0.98] ${
                        isPicked
                          ? "border-white bg-tvos-accent text-white shadow-lg"
                          : "border-white/15 bg-white/[0.06] text-white hover:bg-white/10"
                      }`}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/30 font-mono text-sm">
                        {labels[idx]}
                      </span>
                      <span className="text-base">Choix {labels[idx]}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {status !== "lobby" && status !== "playing" && (
              <div className="py-10 text-center text-sm text-white/70">
                Suivez l&apos;action sur l&apos;écran principal du téléviseur.
              </div>
            )}
          </GlassPanel>
        )}
      </div>

      <footer className="mt-6 text-center text-[11px] text-white/40">
        tvOS Party • Manette tactile
      </footer>
    </main>
  );
}
