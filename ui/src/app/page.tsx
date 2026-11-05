"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { DirectoryListing, FileItem } from "../types/api";
import { MediaCard } from "../components/MediaCard";
import { VideoPlayer } from "../components/VideoPlayer";
import { ImageViewer } from "../components/ImageViewer";
import { Toast } from "../components/Toast";
import {
  SearchIcon,
  GridIcon,
  ListIcon,
  VideoIcon,
  ChevronRightIcon,
} from "../components/Icons";

function safeDecode(part: string) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

export default function Home() {
  const [currentPath, setCurrentPath] = useState<string>("");
  const [data, setData] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [filterType, setFilterType] = useState<"all" | "video" | "image" | "audio" | "folder">("all");
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

  // Fetch directory listing
  const fetchListing = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const endpoint = `/api/files?path=${encodeURIComponent(path ? "/" + path : "/")}`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("Failed to load directory");
      const json: DirectoryListing = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListing(currentPath);
  }, [currentPath, fetchListing]);

  // Navigate to folder
  const navigateTo = (newPath: string) => {
    const clean = newPath.replace(/^\/+/, "").replace(/\/+$/, "");
    window.location.hash = clean ? `/${clean}` : "";
    setCurrentPath(clean);
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

    // Category filter
    if (filterType !== "all") {
      if (filterType === "folder") {
        list = list.filter((it) => it.dir);
      } else {
        list = list.filter((it) => !it.dir && it.kind === filterType);
      }
    }

    // Search query
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
  }, [data, filterType, search, sortOption]);

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

  // Handle Item Click
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

  const pathParts = currentPath.split("/").filter(Boolean);

  return (
    <div className="min-h-screen flex flex-col bg-[#090a0f] text-zinc-100">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 sm:px-8 py-3.5 glass-header">
        {/* Brand */}
        <div
          onClick={() => navigateTo("")}
          className="flex items-center gap-2.5 cursor-pointer select-none group"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-600/30 group-hover:bg-blue-500 transition-colors">
            <span className="text-xs font-black ml-0.5">▶</span>
          </div>
          <span className="text-base font-semibold tracking-tight text-white">
            {data?.app || "Streamify"}
          </span>
        </div>

        {/* Search */}
        <div className="flex-1 max-w-sm relative flex items-center">
          <SearchIcon className="w-3.5 h-3.5 text-zinc-500 absolute left-3.5 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search in this folder..."
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-full bg-white/[0.04] border border-white/[0.07] focus:border-blue-500/50 focus:bg-white/[0.07] focus:outline-none transition-all placeholder:text-zinc-500 text-zinc-200"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 text-xs text-zinc-500 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6">
        {/* Breadcrumb Path Bar */}
        <nav className="flex items-center gap-1.5 text-xs overflow-x-auto pb-2 scrollbar-none text-zinc-400">
          <button
            onClick={() => navigateTo("")}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              pathParts.length === 0
                ? "bg-white/[0.08] text-white font-medium"
                : "hover:text-white"
            }`}
          >
            Root
          </button>
          {pathParts.map((part, index) => {
            const sub = pathParts.slice(0, index + 1).join("/");
            const isLast = index === pathParts.length - 1;
            return (
              <React.Fragment key={sub}>
                <ChevronRightIcon className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                <button
                  onClick={() => navigateTo(sub)}
                  className={`px-2.5 py-1 rounded-md truncate max-w-[180px] transition-colors ${
                    isLast
                      ? "bg-white/[0.08] text-white font-medium"
                      : "hover:text-white"
                  }`}
                >
                  {part}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Header Title + Stats & Controls */}
        <div className="flex flex-wrap items-end justify-between gap-4 mt-3 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              {pathParts.length > 0 ? pathParts[pathParts.length - 1] : "Media Library"}
            </h1>
            <p className="text-xs text-zinc-500 mt-1 font-medium">{stats}</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Category Filter Pills */}
            <div className="hidden md:flex items-center gap-1 bg-white/[0.03] p-1 rounded-lg border border-white/[0.06] text-xs">
              {(["all", "video", "image", "audio", "folder"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-2.5 py-1 rounded-md capitalize transition-all ${
                    filterType === t
                      ? "bg-white/[0.1] text-white font-medium shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {t === "all" ? "All" : t === "video" ? "Videos" : t === "image" ? "Photos" : t === "audio" ? "Audio" : "Folders"}
                </button>
              ))}
            </div>

            {/* Sort Selector */}
            <select
              value={sortOption}
              onChange={(e) => {
                const val = e.target.value as "name" | "date" | "size";
                setSortOption(val);
                localStorage.setItem("media_sort", val);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07] text-xs text-zinc-300 focus:outline-none cursor-pointer hover:bg-white/[0.07] transition-colors"
            >
              <option value="name" className="bg-[#12131a]">Name</option>
              <option value="date" className="bg-[#12131a]">Newest</option>
              <option value="size" className="bg-[#12131a]">Largest</option>
            </select>

            {/* Video Previews Toggle */}
            <button
              onClick={() => {
                const next = !videoPreviews;
                setVideoPreviews(next);
                localStorage.setItem("media_previews", String(next));
                showToast(`Video previews ${next ? "on" : "off"}`);
              }}
              className={`p-1.5 rounded-lg border transition-all ${
                videoPreviews
                  ? "bg-blue-600/20 border-blue-500/30 text-blue-400"
                  : "bg-white/[0.04] border-white/[0.07] text-zinc-400 hover:text-white"
              }`}
              title="Toggle video preview frames"
            >
              <VideoIcon className="w-4 h-4" />
            </button>

            {/* View Mode Toggle */}
            <div className="flex rounded-lg bg-white/[0.03] border border-white/[0.06] p-0.5">
              <button
                onClick={() => {
                  setViewMode("grid");
                  localStorage.setItem("media_view", "grid");
                }}
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === "grid"
                    ? "bg-white/[0.1] text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
                title="Grid view"
              >
                <GridIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setViewMode("list");
                  localStorage.setItem("media_view", "list");
                }}
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === "list"
                    ? "bg-white/[0.1] text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
                title="List view"
              >
                <ListIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Items Listing */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-zinc-500">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-medium tracking-wide">Loading media...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-24 text-center text-zinc-500">
            <p className="text-sm font-medium">
              {search ? `No items found matching "${search}"` : "This folder is empty."}
            </p>
          </div>
        ) : (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4"
                : "flex flex-col gap-1.5"
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
          onSelectIndex={(idx) => setActiveVideoIndex(idx)}
          onShowToast={showToast}
        />
      )}

      {/* Image Overlay Viewer */}
      {activeImageIndex !== null && (
        <ImageViewer
          items={imageItems}
          currentIndex={activeImageIndex}
          onClose={() => setActiveImageIndex(null)}
          onSelectIndex={(idx) => setActiveImageIndex(idx)}
        />
      )}

      {/* Toast Notification */}
      <Toast message={toastMessage} />
    </div>
  );
}
