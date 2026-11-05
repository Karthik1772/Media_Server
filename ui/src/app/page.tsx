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
} from "../components/Icons";

export default function Home() {
  const [currentPath, setCurrentPath] = useState<string>("");
  const [data, setData] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
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
      const hash = window.location.hash.replace(/^#\/?/, "");
      const params = new URLSearchParams(window.location.search);
      const queryPath = params.get("p");
      const resolved = queryPath !== null ? queryPath : hash;
      setCurrentPath(resolved ? decodeURIComponent(resolved).replace(/^\/+/, "") : "");
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
      const apiEndpoint = `/api/files?path=${encodeURIComponent(path ? "/" + path : "/")}`;
      const res = await fetch(apiEndpoint);
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

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0f] text-zinc-100">
      {/* Top Sticky Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 sm:px-8 py-3.5 bg-[#0a0a0f]/80 backdrop-blur-2xl border-b border-white/[0.08]">
        <div
          onClick={() => navigateTo("")}
          className="flex items-center gap-2 cursor-pointer select-none group"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#ff2d78] to-[#7c3aed] flex items-center justify-center shadow-lg shadow-pink-500/20 group-hover:scale-105 transition-transform">
            <span className="text-white text-xs font-black">▶</span>
          </div>
          <span className="text-lg font-bold tracking-tight">
            <span className="gradient-text">Media</span> Server
          </span>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-md relative flex items-center">
          <SearchIcon className="w-4 h-4 text-zinc-400 absolute left-3 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this folder..."
            className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-full bg-white/[0.05] border border-white/[0.08] focus:border-[#7c3aed] focus:bg-white/[0.08] focus:outline-none transition-all placeholder:text-zinc-500 text-zinc-100"
          />
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6">
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 text-xs sm:text-sm overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => navigateTo("")}
            className={`px-3 py-1.5 rounded-full border transition-all ${
              pathParts.length === 0
                ? "bg-white/10 text-white border-white/20 font-semibold"
                : "bg-white/[0.03] text-zinc-400 border-white/[0.06] hover:text-white hover:border-white/20"
            }`}
          >
            Home
          </button>
          {pathParts.map((part, index) => {
            const sub = pathParts.slice(0, index + 1).join("/");
            const isLast = index === pathParts.length - 1;
            return (
              <React.Fragment key={sub}>
                <span className="text-zinc-600">/</span>
                <button
                  onClick={() => navigateTo(sub)}
                  className={`px-3 py-1.5 rounded-full border truncate max-w-[160px] transition-all ${
                    isLast
                      ? "bg-white/10 text-white border-white/20 font-semibold"
                      : "bg-white/[0.03] text-zinc-400 border-white/[0.06] hover:text-white hover:border-white/20"
                  }`}
                >
                  {part}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Section Header & Toolbar */}
        <div className="flex flex-wrap items-end justify-between gap-4 mt-4 mb-6">
          <div>
            <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight">
              {pathParts.length > 0 ? pathParts[pathParts.length - 1] : "Media Library"}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 font-medium">{stats}</p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Sort Selector */}
            <select
              value={sortOption}
              onChange={(e) => {
                const val = e.target.value as "name" | "date" | "size";
                setSortOption(val);
                localStorage.setItem("media_sort", val);
              }}
              className="px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-xs sm:text-sm text-zinc-200 focus:outline-none cursor-pointer hover:bg-white/[0.08] transition-colors"
            >
              <option value="name" className="bg-[#151520]">Name</option>
              <option value="date" className="bg-[#151520]">Newest</option>
              <option value="size" className="bg-[#151520]">Largest</option>
            </select>

            {/* Video Previews Toggle */}
            <button
              onClick={() => {
                const next = !videoPreviews;
                setVideoPreviews(next);
                localStorage.setItem("media_previews", String(next));
                showToast(`Video previews ${next ? "enabled" : "disabled"}`);
              }}
              className={`p-2 rounded-xl border transition-all ${
                videoPreviews
                  ? "bg-[#ff2d78]/20 border-[#ff2d78]/40 text-[#ff2d78]"
                  : "bg-white/[0.05] border-white/[0.08] text-zinc-400 hover:text-white"
              }`}
              title="Toggle video previews"
            >
              <VideoIcon className="w-4 h-4" />
            </button>

            {/* View Mode Toggle */}
            <div className="flex rounded-xl bg-white/[0.05] border border-white/[0.08] p-0.5">
              <button
                onClick={() => {
                  setViewMode("grid");
                  localStorage.setItem("media_view", "grid");
                }}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === "grid"
                    ? "bg-gradient-to-r from-[#ff2d78] to-[#7c3aed] text-white shadow-md"
                    : "text-zinc-400 hover:text-white"
                }`}
                title="Grid view"
              >
                <GridIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setViewMode("list");
                  localStorage.setItem("media_view", "list");
                }}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === "list"
                    ? "bg-gradient-to-r from-[#ff2d78] to-[#7c3aed] text-white shadow-md"
                    : "text-zinc-400 hover:text-white"
                }`}
                title="List view"
              >
                <ListIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content Listing */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-zinc-500">
            <div className="w-8 h-8 border-2 border-[#ff2d78] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Scanning media...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-24 text-center text-zinc-500">
            <p className="text-base font-medium">
              {search ? `No items found matching "${search}"` : "This folder is empty."}
            </p>
          </div>
        ) : (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5"
                : "flex flex-col gap-2"
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
