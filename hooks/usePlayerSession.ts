"use client";

import { useCallback, useEffect, useState } from "react";

export interface StoredPlayerIdentity {
  sessionCode: string;
  playerId: string;
  playerToken: string;
  nickname: string;
  avatarId: string;
}

const STORAGE_PREFIX = "tvos_party_player_";

export function usePlayerSession(sessionCode: string) {
  const normalizedCode = sessionCode.trim().toUpperCase();
  const [identity, setIdentity] = useState<StoredPlayerIdentity | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (!normalizedCode) {
      setIsHydrated(true);
      return;
    }

    try {
      const raw = window.localStorage.getItem(
        `${STORAGE_PREFIX}${normalizedCode}`
      );
      if (raw) {
        const parsed = JSON.parse(raw) as StoredPlayerIdentity;
        if (parsed.playerToken && parsed.nickname) {
          setIdentity(parsed);
        }
      }
    } catch {
      setIdentity(null);
    } finally {
      setIsHydrated(true);
    }
  }, [normalizedCode]);

  const saveIdentity = useCallback(
    (data: Omit<StoredPlayerIdentity, "sessionCode">) => {
      if (!normalizedCode) return;
      const full: StoredPlayerIdentity = {
        ...data,
        sessionCode: normalizedCode,
      };
      setIdentity(full);
      try {
        window.localStorage.setItem(
          `${STORAGE_PREFIX}${normalizedCode}`,
          JSON.stringify(full)
        );
      } catch {
        // Ignore storage quota / private mode errors
      }
    },
    [normalizedCode]
  );

  const clearIdentity = useCallback(() => {
    setIdentity(null);
    if (!normalizedCode) return;
    try {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${normalizedCode}`);
    } catch {
      // Ignore storage errors
    }
  }, [normalizedCode]);

  return {
    identity,
    isHydrated,
    saveIdentity,
    clearIdentity,
  };
}
