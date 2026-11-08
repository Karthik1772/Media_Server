import { useCallback, useEffect, useState } from "react";
import type { Item } from "@/lib/types";

/** Image viewer navigation state and keyboard actions. */
export function useImageViewerViewModel(list: Item[], start: number, onClose: () => void) {
  const [index, setIndex] = useState(start);
  const step = useCallback((direction: number) => {
    setIndex((current) => Math.max(0, Math.min(list.length - 1, current + direction)));
  }, [list.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose, step]);

  return { index, step };
}
