import type { Metadata, Viewport } from "next";
import { MotionConfig } from "framer-motion";
import "./globals.css";

export const metadata: Metadata = {
  title: "tvOS Party — Plateforme de Jeux Interactifs",
  description:
    "Plateforme multijoueur en temps réel inspirée d'Apple tvOS avec téléviseur interactif et smartphones en manettes.",
};

export const viewport: Viewport = {
  themeColor: "#07080C",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <body className="h-[100dvh] w-screen overflow-hidden overscroll-none select-none bg-tvos-bg text-white antialiased selection:bg-tvos-accent/40 selection:text-white">
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </body>
    </html>
  );
}
