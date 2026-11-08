import { create } from "zustand";
import { store } from "@/lib/store";
import type { SortKey, ViewMode } from "@/lib/types";

interface LibraryState {
  query: string;
  sort: SortKey;
  view: ViewMode;
  setQuery: (query: string) => void;
  setSort: (sort: SortKey) => void;
  setView: (view: ViewMode) => void;
  resetSearch: () => void;
}

/**
 * Library UI state. Keep the existing localStorage keys (`sort` and `view`)
 * so this migration does not invalidate the user's current preferences.
 */
export const useLibraryStore = create<LibraryState>((set) => ({
  query: "",
  sort: typeof window === "undefined" ? "name" : store.get<SortKey>("sort", "name"),
  view: typeof window === "undefined" ? "grid" : store.get<ViewMode>("view", "grid"),
  setQuery: (query) => set({ query }),
  setSort: (sort) => {
    store.set("sort", sort);
    set({ sort });
  },
  setView: (view) => {
    store.set("view", view);
    set({ view });
  },
  resetSearch: () => set({ query: "" }),
}));
