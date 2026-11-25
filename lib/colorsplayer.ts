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
  FALLBACK_COLOR, // 0: Rouge vif
  {
    id: "cobalt",
    name: "Bleu cobalt",
    bgHex: "#2563eb",
    borderHex: "#93c5fd",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fde047",
  }, // 1: Bleu cobalt
  {
    id: "emerald",
    name: "Vert émeraude",
    bgHex: "#059669",
    borderHex: "#6ee7b7",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fef08a",
  }, // 2: Vert émeraude
  {
    id: "yellow",
    name: "Jaune soleil",
    bgHex: "#eab308",
    borderHex: "#fef08a",
    textHex: "#09090b",
    badgeBgHex: "rgba(0, 0, 0, 0.14)",
    scoreHex: "#09090b",
  }, // 3: Jaune soleil
  {
    id: "violet",
    name: "Violet intense",
    bgHex: "#7c3aed",
    borderHex: "#c4b5fd",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fde047",
  }, // 4: Violet intense
  {
    id: "orange",
    name: "Orange mandarine",
    bgHex: "#ea580c",
    borderHex: "#fdba74",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fef08a",
  }, // 5: Orange mandarine
  {
    id: "cyan",
    name: "Cyan électrique",
    bgHex: "#0891b2",
    borderHex: "#67e8f9",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fef08a",
  }, // 6: Cyan électrique
  {
    id: "fuchsia",
    name: "Fuchsia néon",
    bgHex: "#c026d3",
    borderHex: "#f0abfc",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fef08a",
  }, // 7: Fuchsia néon
  {
    id: "lime",
    name: "Citron vert",
    bgHex: "#65a30d",
    borderHex: "#bef264",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fef08a",
  }, // 8: Citron vert
  {
    id: "indigo",
    name: "Indigo profond",
    bgHex: "#3730a3",
    borderHex: "#a5b4fc",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.28)",
    scoreHex: "#fde047",
  }, // 9: Indigo profond
  {
    id: "rose",
    name: "Rose bonbon",
    bgHex: "#f43f5e",
    borderHex: "#fecdd3",
    textHex: "#09090b",
    badgeBgHex: "rgba(0, 0, 0, 0.14)",
    scoreHex: "#09090b",
  }, // 10: Rose bonbon
  {
    id: "teal",
    name: "Bleu canard",
    bgHex: "#0f766e",
    borderHex: "#5eead4",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fef08a",
  }, // 11: Bleu canard
  {
    id: "amber",
    name: "Ambre clair",
    bgHex: "#f59e0b",
    borderHex: "#fef3c7",
    textHex: "#09090b",
    badgeBgHex: "rgba(0, 0, 0, 0.14)",
    scoreHex: "#09090b",
  }, // 12: Ambre clair
  {
    id: "sky",
    name: "Bleu ciel vif",
    bgHex: "#0284c7",
    borderHex: "#7dd3fc",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fef08a",
  }, // 13: Bleu ciel vif
  {
    id: "purple",
    name: "Pourpre royal",
    bgHex: "#9333ea",
    borderHex: "#d8b4fe",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.24)",
    scoreHex: "#fde047",
  }, // 14: Pourpre royal
  {
    id: "bronze",
    name: "Cuivre foncé",
    bgHex: "#92400e",
    borderHex: "#fcd34d",
    textHex: "#ffffff",
    badgeBgHex: "rgba(0, 0, 0, 0.28)",
    scoreHex: "#fef08a",
  }, // 15: Cuivre foncé
] as const;

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeSlotIndex(index: number): number {
  const count = PLAYER_COLORS.length;
  return ((index % count) + count) % count;
}

export function getPlayerColorBySlot(slotIndex: number): PlayerColorTheme {
  const safeIndex = normalizeSlotIndex(slotIndex);
  return PLAYER_COLORS.at(safeIndex) ?? FALLBACK_COLOR;
}

export function getNextAvailableColorIndex(
  existingPlayers: ReadonlyArray<{ color_index?: number | null }>
): number {
  const used = new Set<number>();
  for (const p of existingPlayers) {
    if (typeof p.color_index === "number" && Number.isFinite(p.color_index)) {
      used.add(normalizeSlotIndex(p.color_index));
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

  if (
    typeof matched?.color_index === "number" &&
    Number.isFinite(matched.color_index)
  ) {
    return getPlayerColorBySlot(matched.color_index);
  }

  if (!playerId || roster.length === 0) {
    return resolvePlayerColor(matched, playerId);
  }

  const usedIndices = new Set<number>();
  for (const member of roster) {
    if (
      typeof member.color_index === "number" &&
      Number.isFinite(member.color_index)
    ) {
      usedIndices.add(normalizeSlotIndex(member.color_index));
    }
  }

  const assignedById = new Map<string, number>();
  for (const member of roster) {
    if (
      typeof member.color_index === "number" &&
      Number.isFinite(member.color_index)
    ) {
      assignedById.set(String(member.id), normalizeSlotIndex(member.color_index));
      continue;
    }

    const preferred =
      member.id && member.id.trim().length > 0
        ? hashString(member.id.trim()) % PLAYER_COLORS.length
        : 0;

    if (!usedIndices.has(preferred)) {
      usedIndices.add(preferred);
      assignedById.set(String(member.id), preferred);
    } else {
      let chosen = preferred;
      for (let offset = 1; offset < PLAYER_COLORS.length; offset++) {
        const candidate = (preferred + offset) % PLAYER_COLORS.length;
        if (!usedIndices.has(candidate)) {
          chosen = candidate;
          break;
        }
      }
      usedIndices.add(chosen);
      assignedById.set(String(member.id), chosen);
    }
  }

  const finalIndex = assignedById.get(String(playerId));
  if (finalIndex !== undefined) {
    return getPlayerColorBySlot(finalIndex);
  }

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
