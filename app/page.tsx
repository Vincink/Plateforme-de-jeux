import Link from "next/link";
import { Tv, Smartphone, ShieldCheck, Sparkles } from "lucide-react";

export default function HomePage() {
  return (
    <main className="relative flex h-[100dvh] w-screen flex-col justify-between overflow-hidden bg-tvos-bg px-6 py-8 text-white md:px-12 md:py-10">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 75% 20%, rgba(10, 132, 255, 0.22) 0%, transparent 55%), radial-gradient(circle at 20% 85%, rgba(251, 191, 36, 0.14) 0%, transparent 55%)",
        }}
      />

      <header className="relative z-10 flex items-center justify-between border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
            <Sparkles className="h-5 w-5 text-amber-400" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
            tvOS Party Platform
          </span>
        </div>
      </header>

      <section className="relative z-10 my-auto mx-auto w-full max-w-5xl space-y-8">
        <div className="space-y-2 text-center md:text-left">
          <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
            Plateforme de Jeux Interactifs
          </h1>
          <p className="text-sm text-neutral-400 md:text-base">
            Choisis ton écran pour lancer ou rejoindre une partie.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <Link
            href="/tv"
            className="tvos-glass group flex flex-col justify-between rounded-tvos-lg p-6 transition hover:border-white/30"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-400">
              <Tv className="h-6 w-6" />
            </div>
            <div className="mt-8 space-y-1">
              <h2 className="text-xl font-bold group-hover:text-amber-300">
                Écran TV
              </h2>
              <p className="text-xs text-neutral-400">
                Afficher la salle, le QR code et les scores.
              </p>
            </div>
          </Link>

          <Link
            href="/play"
            className="tvos-glass group flex flex-col justify-between rounded-tvos-lg p-6 transition hover:border-white/30"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-400/15 text-sky-400">
              <Smartphone className="h-6 w-6" />
            </div>
            <div className="mt-8 space-y-1">
              <h2 className="text-xl font-bold group-hover:text-sky-300">
                Joueur
              </h2>
              <p className="text-xs text-neutral-400">
                Rejoindre une partie avec un code salle.
              </p>
            </div>
          </Link>

          <Link
            href="/admin"
            className="tvos-glass group flex flex-col justify-between rounded-tvos-lg p-6 transition hover:border-white/30"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div className="mt-8 space-y-1">
              <h2 className="text-xl font-bold group-hover:text-emerald-300">
                Admin
              </h2>
              <p className="text-xs text-neutral-400">
                Créer une salle, gérer les manches et les scores.
              </p>
            </div>
          </Link>
        </div>
      </section>

      <footer className="relative z-10 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-neutral-500">
        <span>tvOS Party</span>
        <span>/tv • /play • /admin</span>
      </footer>
    </main>
  );
}
