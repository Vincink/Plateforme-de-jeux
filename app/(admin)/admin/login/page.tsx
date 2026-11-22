"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { KeyRound, ShieldCheck } from "lucide-react";
import { GlassPanel } from "@/components/tvos/GlassPanel";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || password.length < 4) {
      setError("Veuillez saisir un identifiant et un mot de passe.");
      return;
    }
    setError(null);
    // L'authentification réelle via Supabase Auth sera branchée à l'Étape 6
    router.push("/admin");
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-tvos-bg px-5 py-10 text-white">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 15%, rgba(10, 132, 255, 0.2) 0%, transparent 55%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        <GlassPanel className="p-7">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="tvos-glass mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
              <ShieldCheck className="h-7 w-7 text-tvos-accent" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
              Espace Animateur
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              Connexion Régie
            </h1>
            <p className="mt-1.5 text-xs text-white/60">
              Pilotez les parties, le QR code TV et les scores en direct.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="admin-email"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/65"
              >
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                autoComplete="email"
                placeholder="animateur@exemple.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-tvos-accent focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="admin-password"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/65"
              >
                Mot de passe
              </label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-tvos-accent focus:outline-none"
              />
            </div>

            {error ? (
              <p className="text-center text-xs font-medium text-rose-400">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-sm font-bold text-black shadow-lg transition active:scale-[0.98]"
            >
              <KeyRound className="h-4 w-4" />
              <span>Accéder à la régie</span>
            </button>
          </form>

          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="mt-4 w-full rounded-xl py-2 text-xs font-semibold text-white/60 hover:text-white"
          >
            Continuer vers la régie (aperçu avant Auth)
          </button>
        </GlassPanel>
      </motion.div>
    </main>
  );
}
