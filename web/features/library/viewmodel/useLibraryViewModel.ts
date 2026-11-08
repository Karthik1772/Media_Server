import { useMemo } from "react";
import { useLibraryStore } from "@/features/library/model/libraryStore";
import { nat } from "@/lib/format";
import type { Item } from "@/lib/types";

/** ViewModel for library filtering, sorting and presentation preferences. */
export function useLibraryViewModel(sourceItems: Item[]) {
  const query = useLibraryStore((state) => state.query);
  const sort = useLibraryStore((state) => state.sort);
  const view = useLibraryStore((state) => state.view);
  const setQuery = useLibraryStore((state) => state.setQuery);
  const setSort = useLibraryStore((state) => state.setSort);
  const setView = useLibraryStore((state) => state.setView);

  const items = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const result = sourceItems.filter((item) => !normalized || item.name.toLocaleLowerCase().includes(normalized));
    result.sort((a, b) => {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      if (sort === "size") return b.size - a.size || nat.compare(a.name, b.name);
      if (sort === "date") return b.mtime - a.mtime;
      return nat.compare(a.name, b.name);
    });
    return result;
  }, [sourceItems, query, sort]);

  return { query, sort, view, items, setQuery, setSort, setView };
}
