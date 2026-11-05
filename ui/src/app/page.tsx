"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { DirectoryListing, FileItem } from "../types/api";
import { MediaCard } from "../components/MediaCard";
import { VideoPlayer } from "../components/VideoPlayer";
import { ImageViewer } from "../components/ImageViewer";
import { Toast } from "../components/Toast";
import { SearchIcon, GridIcon, ListIcon, VideoIcon } from "../components/Icons";

function safeDecode(part: string) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part; // a folder name such as "100%" is not valid percent-encoding
  }
}

export default function Home() {
  const [currentPath, setCurrentPath] = useState<string>("");
  const [data, setData] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);
  const [search, setSearch] = useState<string>("");
  const [sortOption, setSortOption] = useState<"name" | "date" | "size">("name");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [videoPreviews, setVideoPreviews] = useState<boolean>(true);

  // Active viewers
  const [activeVideoIndex, setActiveVideoIndex] = useState<number | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  // Sync path from URL hash or query param
  useEffect(() => {
    const updatePathFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const queryPath = params.get("p");
      const raw =
        queryPath !== null
          ? queryPath
          : window.location.hash.replace(/^#\/?/, "");
      const resolved = raw
        .split("/")
        .filter(Boolean)
        .map(safeDecode)
        .join("/");
      setCurrentPath(resolved);
      setSearch("");
    };

    updatePathFromLocation();
    window.addEventListener("popstate", updatePathFromLocation);
    window.addEventListener("hashchange", updatePathFromLocation);
    return () => {
      window.removeEventListener("popstate", updatePathFromLocation);
      window.removeEventListener("hashchange", updatePathFromLocation);
    };
  }, []);

  // Load preferences from localStorage
  useEffect(() => {
    try {
      const savedSort = localStorage.getItem("media_sort") as "name" | "date" | "size";
      if (savedSort) setSortOption(savedSort);

      const savedView = localStorage.getItem("media_view") as "grid" | "list";
      if (savedView) setViewMode(savedView);

      const savedPreviews = localStorage.getItem("media_previews");
      if (savedPreviews !== null) setVideoPreviews(savedPreviews === "true");
    } catch {}
  }, []);

  const savePref = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  };

  // Fetch directory listing (a newer navigation cancels the older request)
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const endpoint = `/api/files?path=${encodeURIComponent(
      currentPath ? "/" + currentPath : "/"
    )}`;

    fetch(endpoint, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || "Failed to load this folder");
        }
        return res.json() as Promise<DirectoryListing>;
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        console.error(err);
        setData(null);
        setError(err.message || "Failed to load this folder");
        setLoading(false);
      });

    return () => controller.abort();
  }, [currentPath, reloadKey]);

  // Navigate to folder
  const navigateTo = (newPath: string) => {
    const clean = newPath.replace(/^\/+/, "").replace(/\/+$/, "");
    window.location.hash = clean
      ? "/" + clean.split("/").map(encodeURIComponent).join("/")
      : "";
    setCurrentPath(clean);
    setSearch("");
  };

  // Video and Image lists for overlay cycling
  const videoItems = useMemo(
    () => (data ? data.items.filter((x) => !x.dir && x.kind === "video") : []),
    [data]
  );

  const imageItems = useMemo(
    () => (data ? data.items.filter((x) => !x.dir && x.kind === "image") : []),
    [data]
  );

  // Filter and Sort items
  const filteredItems = useMemo(() => {
    if (!data) return [];
    let list = [...data.items];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((it) => it.name.toLowerCase().includes(q));
    }

    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

    list.sort((a, b) => {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      if (sortOption === "size") return b.size - a.size || collator.compare(a.name, b.name);
      if (sortOption === "date") return b.mtime - a.mtime;
      return collator.compare(a.name, b.name);
    });

    return list;
  }, [data, search, sortOption]);

  // Stats calculation
  const stats = useMemo(() => {
    if (!data) return "";
    let folders = 0;
    let videos = 0;
    let images = 0;
    let audio = 0;
    let files = 0;
    let totalBytes = 0;

    data.items.forEach((it) => {
      if (it.dir) folders++;
      else {
        totalBytes += it.size;
        if (it.kind === "video") videos++;
        else if (it.kind === "image") images++;
        else if (it.kind === "audio") audio++;
        else files++;
      }
    });

    const parts = [];
    if (folders) parts.push(`${folders} folder${folders > 1 ? "s" : ""}`);
    if (videos) parts.push(`${videos} video${videos > 1 ? "s" : ""}`);
    if (images) parts.push(`${images} image${images > 1 ? "s" : ""}`);
    if (audio) parts.push(`${audio} audio`);
    if (files) parts.push(`${files} file${files > 1 ? "s" : ""}`);

    if (totalBytes > 0) {
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB", "TB"];
      const i = Math.floor(Math.log(totalBytes) / Math.log(k));
      parts.push(`${parseFloat((totalBytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`);
    }

    return parts.join("  ·  ") || "Empty folder";
  }, [data]);

  // Handle Card Click
  const handleOpenItem = (item: FileItem) => {
    if (item.dir) {
      const sub = currentPath ? `${currentPath}/${item.name}` : item.name;
      navigateTo(sub);
      return;
    }

    if (item.kind === "video") {
      const idx = videoItems.findIndex((x) => x.url === item.url);
      if (idx !== -1) setActiveVideoIndex(idx);
    } else if (item.kind === "image") {
      const idx = imageItems.findIndex((x) => x.url === item.url);
      if (idx !== -1) setActiveImageIndex(idx);
    } else {
      window.open(item.url, "_blank");
    }
  };

  // Breadcrumbs builder
  const pathParts = currentPath.split("/").filter(Boolean);
  const rootLabel = data?.root || "Home";
  const rootTitle = data?.root
    ? data.root.endsWith(":")
      ? `${data.root} Drive`
      : data.root
    : "Media Library";

  const crumbBase =
    "px-3.5 py-1.5 rounded-full text-xs sm:text-sm whitespace-nowrap transition-all";
  const crumbActive = "glass-subtle text-white font-semibold";
  const crumbIdle = "glass-btn";

  return (
    <div className="min-h-screen flex flex-col text-zinc-100">
      {/* Floating glass header */}
      <header className="sticky top-3 z-30 mx-3 sm:mx-6 mt-3 glass-strong rounded-2xl flex items-center justify-between gap-4 px-4 sm:px-6 py-3">
        <div
          onClick={() => navigateTo("")}
          className="flex items-center gap-2.5 cursor-pointer select-none group"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#ff2d78] to-[#7c3aed] flex items-center justify-center shadow-lg shadow-pink-500/30 ring-1 ring-white/30 group-hover:scale-105 transition-transform">
            <span className="text-white text-xs font-black">▶</span>
          </div>
          <span className="text-lg font-bold tracking-tight">
            <span className="gradient-text">Media</span> Server
          </span>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-md relative flex items-center">
          <SearchIcon className="w-4 h-4 text-zinc-300 absolute left-3.5 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this folder..."
            className="glass-input w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-full placeholder:text-zinc-400 text-zinc-50"
          />
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6">
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => navigateTo("")}
            className={`${crumbBase} ${pathParts.length === 0 ? crumbActive : crumbIdle}`}
          >
            {rootLabel}
          </button>
          {pathParts.map((part, index) => {
            const sub = pathParts.slice(0, index + 1).join("/");
            const isLast = index === pathParts.length - 1;
            return (
              <React.Fragment key={sub}>
                <span className="text-zinc-400">/</span>
                <button
                  onClick={() => navigateTo(sub)}
                  className={`${crumbBase} truncate max-w-[180px] ${isLast ? crumbActive : crumbIdle}`}
                >
                  {part}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Section Header & Toolbar */}
        <div className="flex flex-wrap items-end justify-between gap-4 mt-5 mb-6">
          <div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
              {pathParts.length > 0 ? pathParts[pathParts.length - 1] : rootTitle}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-300/80 mt-1.5 font-medium">{stats}</p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Sort Selector */}
            <select
              value={sortOption}
              onChange={(e) => {
                const val = e.target.value as "name" | "date" | "size";
                setSortOption(val);
                savePref("media_sort", val);
              }}
              className="glass-btn px-3.5 py-2 rounded-xl text-xs sm:text-sm cursor-pointer focus:outline-none"
            >
              <option value="name">Name</option>
              <option value="date">Newest</option>
              <option value="size">Largest</option>
            </select>

            {/* Video Previews Toggle */}
            <button
              onClick={() => {
                const next = !videoPreviews;
                setVideoPreviews(next);
                savePref("media_previews", String(next));
                showToast(`Video previews ${next ? "enabled" : "disabled"}`);
              }}
              className={`glass-btn p-2.5 rounded-xl ${videoPreviews ? "is-active" : ""}`}
              title="Toggle video previews"
            >
              <VideoIcon className="w-4 h-4" />
            </button>

            {/* View Mode Toggle */}
            <div className="glass-subtle flex rounded-xl p-1 gap-1">
              <button
                onClick={() => {
                  setViewMode("grid");
                  savePref("media_view", "grid");
                }}
                className={`glass-btn p-2 rounded-lg border-transparent ${viewMode === "grid" ? "is-active" : "bg-transparent"}`}
                title="Grid view"
              >
                <GridIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setViewMode("list");
                  savePref("media_view", "list");
                }}
                className={`glass-btn p-2 rounded-lg border-transparent ${viewMode === "list" ? "is-active" : "bg-transparent"}`}
                title="List view"
              >
                <ListIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content Listing */}
        {loading ? (
          <div className="glass rounded-3xl py-24 flex flex-col items-center justify-center gap-3 text-zinc-300">
            <div className="w-9 h-9 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Scanning media...</span>
          </div>
        ) : error ? (
          <div className="glass rounded-3xl py-20 px-6 flex flex-col items-center gap-4 text-center animate-fadeIn">
            <p className="text-base font-semibold text-white">Couldn&apos;t open this folder</p>
            <p className="text-sm text-zinc-300 max-w-md">{error}</p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setReloadKey((k) => k + 1)}
                className="glass-btn is-active px-5 py-2 rounded-xl text-sm font-semibold"
              >
                Try again
              </button>
              {currentPath && (
                <button
                  onClick={() => navigateTo("")}
                  className="glass-btn px-5 py-2 rounded-xl text-sm font-semibold"
                >
                  Go to {rootLabel}
                </button>
              )}
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="glass rounded-3xl py-24 text-center text-zinc-300 animate-fadeIn">
            <p className="text-base font-medium">
              {search ? `No items found matching "${search}"` : "This folder is empty."}
            </p>
          </div>
        ) : (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5"
                : "flex flex-col gap-2.5"
            }
          >
            {filteredItems.map((item) => (
              <MediaCard
                key={item.url}
                item={item}
                viewMode={viewMode}
                videoPreviews={videoPreviews}
                onOpen={handleOpenItem}
              />
            ))}
          </div>
        )}
      </main>

      {/* Video Overlay Player */}
      {activeVideoIndex !== null && (
        <VideoPlayer
          items={videoItems}
          currentIndex={activeVideoIndex}
          onClose={() => setActiveVideoIndex(null)}
          onSelectIndex={setActiveVideoIndex}
          onShowToast={showToast}
        />
      )}

      {/* Image Overlay Viewer */}
      {activeImageIndex !== null && (
        <ImageViewer
          items={imageItems}
          currentIndex={activeImageIndex}
          onClose={() => setActiveImageIndex(null)}
          onSelectIndex={setActiveImageIndex}
        />
      )}

      {/* Toast Notification */}
      <Toast message={toastMessage} />
    </div>
  );
}
