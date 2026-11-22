export interface PlayerColorTheme {
  id: string;
  name: string;
  bgHex: string;
  borderHex: string;
  textHex: string;
  badgeBgHex: string;
  scoreHex: string;
}

const FALLBACK_COLOR: PlayerColorTheme = {
  id: "crimson",
  name: "Rouge vif",
  bgHex: "#e11d48",
  borderHex: "#fda4af",
  textHex: "#ffffff",
  badgeBgHex: "rgba(0, 0, 0, 0.24)",
  scoreHex: "#fef08a",
};

export const PLAYER_COLORS: readonly PlayerColorTheme[] = [
  FALLBACK_COLOR,
  {
    id: "cobalt",
    name: "Bleu cobalt",
    bgHex: "#2563eb",
    borderHex: "#93c5fd",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fde047",
  },
  {
    id: "emerald",
    name: "Vert émeraude",
    bgHex: "#059669",
    borderHex: "#6ee7b7",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fef08a",
  },
  {
    id: "amber",
    name: "Ambre doré",
    bgHex: "#d97706",
    borderHex: "#fde68a",
    textHex: "#09090b",
    badgeBgHex: "rgba(255, 255, 255, 0.28)",
    scoreHex: "#09090b",
  },
  {
    id: "violet",
    name: "Violet intense",
    bgHex: "#7c3aed",
    borderHex: "#c4b5fd",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fde047",
  },
  {
    id: "orange",
    name: "Orange mandarine",
    bgHex: "#ea580c",
    borderHex: "#fdba74",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fef08a",
  },
  {
    id: "cyan",
    name: "Cyan électrique",
    bgHex: "#0891b2",
    borderHex: "#67e8f9",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fef08a",
  },
  {
    id: "fuchsia",
    name: "Fuchsia néon",
    bgHex: "#c026d3",
    borderHex: "#f0abfc",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fef08a",
  },
  {
    id: "lime",
    name: "Citron vert",
    bgHex: "#65a30d",
    borderHex: "#bef264",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fef08a",
  },
  {
    id: "indigo",
    name: "Indigo profond",
    bgHex: "#4f46e5",
    borderHex: "#a5b4fc",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fde047",
  },
  {
    id: "rose",
    name: "Rose corail",
    bgHex: "#db2777",
    borderHex: "#f9a8d4",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fef08a",
  },
  {
    id: "teal",
    name: "Bleu canard",
    bgHex: "#0d9488",
    borderHex: "#5eead4",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fef08a",
  },
  {
    id: "yellow",
    name: "Jaune soleil",
    bgHex: "#eab308",
    borderHex: "#fef08a",
    textHex: "#09090b",
    badgeBgHex: "rgba(0, 0, 0, 0.14)",
    scoreHex: "#09090b",
  },
  {
    id: "sky",
    name: "Bleu ciel vif",
    bgHex: "#0284c7",
    borderHex: "#7dd3fc",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fef08a",
  },
  {
    id: "red",
    name: "Écarlate",
    bgHex: "#dc2626",
    borderHex: "#fca5a5",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fef08a",
  },
  {
    id: "purple",
    name: "Pourpre royal",
    bgHex: "#9333ea",
    borderHex: "#d8b4fe",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fde047",
  },
  {
    id: "green",
    name: "Vert pelouse",
    bgHex: "#16a34a",
    borderHex: "#86efac",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fef08a",
  },
  {
    id: "bronze",
    name: "Cuivre chaud",
    bgHex: "#b45309",
    borderHex: "#fcd34d",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fef08a",
  },
  {
    id: "cerulean",
    name: "Azur franc",
    bgHex: "#1d4ed8",
    borderHex: "#60a5fa",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fde047",
  },
  {
    id: "magenta",
    name: "Framboise",
    bgHex: "#be185d",
    borderHex: "#f472b6",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fef08a",
  },
] as const;

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getPlayerColorBySlot(slotIndex: number): PlayerColorTheme {
  const count = PLAYER_COLORS.length;
  const safeIndex = ((slotIndex % count) + count) % count;
  return PLAYER_COLORS.at(safeIndex) ?? FALLBACK_COLOR;
}

export function getNextAvailableColorIndex(
  existingPlayers: ReadonlyArray<{ color_index?: number | null }>
): number {
  const used = new Set<number>();
  for (const p of existingPlayers) {
    if (typeof p.color_index === "number" && Number.isFinite(p.color_index)) {
      used.add(((p.color_index % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length);
    }
  }
  for (let i = 0; i < PLAYER_COLORS.length; i++) {
    if (!used.has(i)) return i;
  }
  return existingPlayers.length % PLAYER_COLORS.length;
}

export function resolvePlayerColor(
  player?: { id?: string | null; color_index?: number | null } | null,
  fallbackId?: string | null
): PlayerColorTheme {
  if (
    typeof player?.color_index === "number" &&
    Number.isFinite(player.color_index)
  ) {
    return getPlayerColorBySlot(player.color_index);
  }

  const effectiveId = player?.id ?? fallbackId;
  if (effectiveId && effectiveId.trim().length > 0) {
    const index = hashString(effectiveId.trim()) % PLAYER_COLORS.length;
    return PLAYER_COLORS.at(index) ?? FALLBACK_COLOR;
  }

  return FALLBACK_COLOR;
}

export function getUniquePlayerColor(
  playerId?: string | null,
  roster: ReadonlyArray<{ id: string; color_index?: number | null }> = []
): PlayerColorTheme {
  const matched = playerId ? roster.find((p) => p.id === playerId) : undefined;
  return resolvePlayerColor(matched, playerId);
}

export function getPlayerColor(
  playerId?: string | null,
  fallbackIndex = 0
): PlayerColorTheme {
  if (playerId && playerId.trim().length > 0) {
    return resolvePlayerColor({ id: playerId }, playerId);
  }
  return getPlayerColorBySlot(fallbackIndex);
}
