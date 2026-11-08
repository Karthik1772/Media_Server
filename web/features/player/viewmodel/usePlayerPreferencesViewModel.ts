import { useCallback, useEffect, useRef, type SetStateAction } from "react";
import { usePlayerPreferencesStore } from "@/features/player/model/playerPreferencesStore";
import type { PlayerPreferences } from "@/features/player/model/player.types";

/**
 * ViewModel for player preferences. The ref is updated synchronously so media
 * event handlers and gesture callbacks always read the latest preference values.
 */
export function usePlayerPreferencesViewModel() {
  const preferences = usePlayerPreferencesStore((state) => state.preferences);
  const updateStore = usePlayerPreferencesStore((state) => state.setPreferences);
  const preferencesRef = useRef(preferences);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  const setPreferences = useCallback((update: SetStateAction<PlayerPreferences>) => {
    const next = typeof update === "function" ? update(preferencesRef.current) : update;
    preferencesRef.current = next;
    updateStore(next);
  }, [updateStore]);

  return [preferences, setPreferences, preferencesRef] as const;
}
