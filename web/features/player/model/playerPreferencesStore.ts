import { create } from "zustand";
import { clamp } from "@/lib/format";
import { store } from "@/lib/store";
import type { PlayerPreferences } from "@/features/player/model/player.types";

interface PlayerPreferencesState {
  preferences: PlayerPreferences;
  setPreferences: (preferences: PlayerPreferences) => void;
}

function readPreferences(): PlayerPreferences {
  return {
    volume: clamp(Number(store.get("vol", 1)), 0, 2),
    muted: !!store.get("muted", false),
    speed: Number(store.get("speed", 1)) || 1,
    subSize: Number(store.get("subSize", 100)) || 100,
    subColor: store.get("subColor", "#ffffff"),
  };
}

/** Shared player preferences, persisted using Streamly's existing storage keys. */
export const usePlayerPreferencesStore = create<PlayerPreferencesState>((set) => ({
  preferences: typeof window === "undefined" ? {
    volume: 1,
    muted: false,
    speed: 1,
    subSize: 100,
    subColor: "#ffffff",
  } : readPreferences(),
  setPreferences: (preferences) => {
    store.set("vol", preferences.volume);
    store.set("muted", preferences.muted);
    store.set("speed", preferences.speed);
    store.set("subSize", preferences.subSize);
    store.set("subColor", preferences.subColor);
    set({ preferences });
  },
}));
