"use client";

import { useCallback, useEffect, useState } from "react";

interface UseSpatialNavigationOptions {
  itemCount: number;
  columns?: number;
  onSelect?: (index: number) => void;
  enabled?: boolean;
}

export function useSpatialNavigation({
  itemCount,
  columns = 3,
  onSelect,
  enabled = true,
}: UseSpatialNavigationOptions) {
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  const safeIndex =
    itemCount <= 0 ? 0 : Math.min(Math.max(focusedIndex, 0), itemCount - 1);

  const moveFocus = useCallback(
    (delta: number) => {
      if (itemCount <= 0) return;
      setFocusedIndex((prev) => {
        const current = Math.min(Math.max(prev, 0), itemCount - 1);
        const next = current + delta;
        if (next < 0) return 0;
        if (next >= itemCount) return itemCount - 1;
        return next;
      });
    },
    [itemCount]
  );

  useEffect(() => {
    if (!enabled || itemCount <= 0) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          moveFocus(1);
          break;
        case "ArrowLeft":
          event.preventDefault();
          moveFocus(-1);
          break;
        case "ArrowDown":
          event.preventDefault();
          moveFocus(columns);
          break;
        case "ArrowUp":
          event.preventDefault();
          moveFocus(-columns);
          break;
        case "Enter":
          if (onSelect) {
            event.preventDefault();
            onSelect(safeIndex);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, itemCount, columns, moveFocus, onSelect, safeIndex]);

  return {
    focusedIndex: safeIndex,
    setFocusedIndex,
  };
}
