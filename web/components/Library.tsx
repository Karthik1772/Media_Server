import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { Crumbs, type Crumb } from "@/components/Crumbs";
import { LibraryHead } from "@/components/LibraryHead";
import { Grid } from "@/components/Grid";
import { Empty } from "@/components/Empty";
import { NavProvider } from "@/components/NavLink";
import { PosterModal } from "@/components/PosterModal";
import { ImageViewer } from "@/components/ImageViewer";
import { Player } from "@/components/Player";
import { toast } from "@/hooks/use-toast";
import type { Item, LibraryData, SortKey, ViewMode } from "@/lib/types";
import { store } from "@/lib/store";
import { fmtSize, nat } from "@/lib/format";
import { queueCapture } from "@/lib/capture";

interface Overlay {
  kind: "video" | "image";
  list: Item[];
  start: number;
}

/** The folder view: breadcrumbs, title, search / sort / layout, and the grid of cards. */
export function Library({ data: initialData }: { data: LibraryData }) {
  // the folder being shown; opening another folder swaps this in place (no page reload)
  const [data, setData] = useState<LibraryData>(initialData);
  const curPath = useRef(location.pathname); // URL path of the folder currently shown
  const navId = useRef(0); // lets a newer navigation cancel an older one
  const searchRef = useRef<HTMLInputElement>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>(() => store.get("sort", "name"));
  const [view, setView] = useState<ViewMode>(() => store.get("view", "grid"));
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [posterTarget, setPosterTarget] = useState<Item | null>(null);
  const [skeleton, setSkeleton] = useState(false);

  const appName = data.app || "Streamly";
  const parts = useMemo(() => data.path.split("/").filter(Boolean), [data.path]);
  const title = parts.length ? parts[parts.length - 1] : "Media Library";

  useEffect(() => {
    document.title = parts.length ? `${title} · ${appName}` : appName;
  }, [parts.length, title, appName]);

  /* ---------- listing ---------- */
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = data.items.filter((i) => !q || i.name.toLowerCase().includes(q));
    out.sort((x, y) => {
      if (x.dir !== y.dir) return x.dir ? -1 : 1;
      if (sort === "size") return y.size - x.size || nat.compare(x.name, y.name);
      if (sort === "date") return y.mtime - x.mtime;
      return nat.compare(x.name, y.name);
    });
    return out;
  }, [data.items, query, sort]);

  const hasPosters = useMemo(() => data.items.some((i) => i.kind === "video" && i.scope === "poster"), [data.items]);

  const crumbs = useMemo<Crumb[]>(() => {
    let acc = "/";
    const out: Crumb[] = [{ name: "Home", href: "/" }];
    parts.forEach((p) => {
      acc += encodeURIComponent(p) + "/";
      out.push({ name: p, href: acc });
    });
    return out;
  }, [parts]);

  const stats = useMemo(() => {
    const n = { dir: 0, video: 0, image: 0, audio: 0, file: 0 };
    let size = 0;
    data.items.forEach((i) => {
      n[i.dir ? "dir" : ((i.kind as keyof typeof n) ?? "file")]++;
      size += i.size;
    });
    const out: string[] = [];
    if (n.dir) out.push(n.dir + (n.dir > 1 ? " folders" : " folder"));
    if (n.video) out.push(n.video + (n.video > 1 ? " videos" : " video"));
    if (n.image) out.push(n.image + (n.image > 1 ? " images" : " image"));
    if (n.audio) out.push(n.audio + " audio");
    if (n.file) out.push(n.file + (n.file > 1 ? " files" : " file"));
    if (size) out.push(fmtSize(size));
    return out.join("  ·  ") || "Empty folder";
  }, [data.items]);

  /* ---------- preview frames (browser grabs them when the server can't) ---------- */
  useEffect(() => {
    const onPoster = (it: Item, url: string) => {
      it.poster = url;
      bump();
    };
    items.forEach((it) => queueCapture(it, onPoster));
  }, [items]);

  /* ---------- opening a folder: the listing is fetched and swapped in, no page reload ---------- */
  const fetchFolder = useCallback(async (pathname: string): Promise<LibraryData> => {
    const r = await fetch("/__api/library?path=" + encodeURIComponent(pathname), { cache: "no-store" });
    if (!r.ok) throw new Error("folder not found");
    const j = (await r.json()) as LibraryData;
    if (!j || !Array.isArray(j.items)) throw new Error("bad listing");
    return j;
  }, []);

  const showFolder = useCallback((next: LibraryData, pathname: string) => {
    curPath.current = pathname;
    setData(next);
    setQuery("");
    setSkeleton(false);
    scrollTo(0, 0);
  }, []);

  const openFolder = useCallback(
    async (href: string, push: boolean) => {
      const u = new URL(href, location.href);
      const id = ++navId.current;
      // placeholders only if the listing is slow to arrive
      const slow = setTimeout(() => id === navId.current && setSkeleton(true), 200);
      try {
        const next = await fetchFolder(u.pathname);
        if (id !== navId.current) return; // a newer navigation took over
        if (push) history.pushState({ folder: 1 }, "", u.pathname + u.search + u.hash);
        showFolder(next, u.pathname);
      } catch {
        if (id !== navId.current) return;
        location.href = href; // fall back to a normal page load
      } finally {
        clearTimeout(slow);
      }
    },
    [fetchFolder, showFolder],
  );

  const go = useCallback((href: string) => void openFolder(href, true), [openFolder]);

  /* ---------- player / viewer overlay (Back closes it) ---------- */
  const overlayOpen = useRef(false);

  const hideOverlay = useCallback(() => setOverlay(null), []);

  const closeOverlay = useCallback(() => {
    if (overlayOpen.current) history.back();
    else hideOverlay();
  }, [hideOverlay]);

  useEffect(() => {
    const onPop = () => {
      overlayOpen.current = false;
      hideOverlay();
      // Back / Forward between folders: show that folder without reloading the page
      if (location.pathname !== curPath.current) void openFolder(location.href, false);
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [hideOverlay, openFolder]);

  const openMedia = useCallback(
    (it: Item) => {
      const list = data.items.filter((x) => !x.dir && x.kind === it.kind).sort((a, b) => nat.compare(a.name, b.name));
      if (!overlayOpen.current) {
        history.pushState({ ov: 1 }, "");
        overlayOpen.current = true;
      }
      setOverlay({
        kind: it.kind === "image" ? "image" : "video",
        list,
        start: Math.max(
          0,
          list.findIndex((x) => x.url === it.url),
        ),
      });
    },
    [data.items],
  );

  useEffect(() => {
    document.body.classList.toggle("lock", !!overlay || !!posterTarget);
  }, [overlay, posterTarget]);

  /* ---------- poster picker ---------- */
  const onPosterSaved = useCallback(
    (it: Item, poster: string, wasShow: boolean) => {
      it.poster = poster;
      setPosterTarget(null);
      // every episode of the show got the new poster - refresh the listing to show them all
      if (wasShow) {
        const pathname = location.pathname;
        setTimeout(() => {
          fetchFolder(pathname)
            .then((next) => {
              if (location.pathname === pathname) setData(next);
            })
            .catch(() => location.reload());
        }, 700);
      }
      toast(poster ? "Poster saved" : "Poster reset to default");
    },
    [fetchFolder],
  );

  /* ---------- "/" focuses the search ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (overlay || posterTarget) return;
      if (e.key === "/" && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [overlay, posterTarget]);

  const changeSort = (s: SortKey) => {
    setSort(s);
    store.set("sort", s);
  };
  const changeView = (v: ViewMode) => {
    setView(v);
    store.set("view", v);
  };

  return (
    <NavProvider value={go}>
      <Header ref={searchRef} appName={appName} query={query} onQuery={setQuery} />
      <main className="mx-auto max-w-[1500px] pt-3 pr-[calc(10px+env(safe-area-inset-right))] pb-10 pl-[calc(10px+env(safe-area-inset-left))] min-[601px]:pt-3.5 min-[601px]:pr-[calc(16px+env(safe-area-inset-right))] min-[601px]:pb-[60px] min-[601px]:pl-[calc(16px+env(safe-area-inset-left))] min-[1600px]:max-w-[1900px] min-[2200px]:max-w-[2400px]">
        <Crumbs crumbs={crumbs} />
        <LibraryHead title={title} stats={stats} sort={sort} onSort={changeSort} view={view} onView={changeView} />
        {items.length === 0 && !skeleton ? (
          <Empty query={query.trim() ? query : ""} />
        ) : (
          <Grid
            key={data.path}
            items={items}
            view={view}
            hasPosters={hasPosters}
            skeleton={skeleton}
            onOpen={openMedia}
            onEditPoster={setPosterTarget}
          />
        )}
      </main>

      {overlay?.kind === "video" && <Player list={overlay.list} start={overlay.start} onClose={closeOverlay} />}
      {overlay?.kind === "image" && <ImageViewer list={overlay.list} start={overlay.start} onClose={closeOverlay} />}

      <PosterModal item={posterTarget} path={data.path} onClose={() => setPosterTarget(null)} onSaved={onPosterSaved} />
    </NavProvider>
  );
}