"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Smartphone } from "lucide-react";
import { GlassPanel } from "@/components/tvos/GlassPanel";

export default function PlayCodeEntryPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const cleaned = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (cleaned.length < 4) {
      setError("Veuillez saisir un code de partie valide.");
      return;
    }
    setError(null);
    router.push(`/play/${cleaned}`);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-tvos-bg px-5 py-10 text-white">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 15%, rgba(10, 132, 255, 0.22) 0%, transparent 55%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        <GlassPanel className="p-7">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="tvos-glass mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
              <Smartphone className="h-7 w-7 text-tvos-accent" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
              Manette Joueur
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              Rejoindre une partie
            </h1>
            <p className="mt-2 text-sm text-white/65">
              Entrez le code affiché sur le téléviseur ou scannez le QR code.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="session-code" className="sr-only">
                Code de partie
              </label>
              <input
                id="session-code"
                type="text"
                maxLength={8}
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="EX: ABCD12"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-4 text-center font-mono text-2xl font-black tracking-[0.25em] text-white placeholder:text-white/25 focus:border-tvos-accent focus:outline-none"
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
              <span>Continuer</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </GlassPanel>
      </motion.div>
    </main>
  );
}
