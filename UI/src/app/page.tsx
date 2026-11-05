"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Navbar } from "@/components/Navbar";
import { MediaGrid } from "@/components/MediaGrid";
import { MediaList } from "@/components/MediaList";
import { VideoPlayer } from "@/components/VideoPlayer";
import { PhotoViewer } from "@/components/PhotoViewer";
import { PosterPickerModal } from "@/components/PosterPickerModal";
import { AudioPlayerModal } from "@/components/AudioPlayerModal";
import { MediaItem, DirectoryResponse } from "@/lib/types";
import { fetchDirectory } from "@/lib/api";
import { getStorageItem, setStorageItem } from "@/lib/storage";
import { formatBytes } from "@/lib/utils";
import { AlertCircle, Film, Folder, RefreshCw } from "lucide-react";

export default function Home() {
  const [currentPath, setCurrentPath] = useState<string>("/");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [appName, setAppName] = useState<string>("Streamly");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Layout preferences
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"name" | "date" | "size">("name");
  const [isDark, setIsDark] = useState<boolean>(true);

  // Active Viewers & Overlays
  const [activeVideo, setActiveVideo] = useState<MediaItem | null>(null);
  const [activePhoto, setActivePhoto] = useState<MediaItem | null>(null);
  const [activeAudio, setActiveAudio] = useState<MediaItem | null>(null);
  const [posterModalItem, setPosterModalItem] = useState<MediaItem | null>(null);

  // Initialize stored settings on mount
  useEffect(() => {
    setViewMode(getStorageItem<"grid" | "list">("streamly_view", "grid"));
    setSortBy(getStorageItem<"name" | "date" | "size">("streamly_sort", "name"));
    const storedTheme = getStorageItem<"dark" | "light">("streamly_theme", "dark");
    setIsDark(storedTheme === "dark");
    document.documentElement.classList.toggle("dark", storedTheme === "dark");
    document.documentElement.classList.toggle("light", storedTheme === "light");

    // Read initial path from URL hash or query if available
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const initialPath = urlParams.get("path") || "/";
      setCurrentPath(initialPath);
    }
  }, []);

  // Update URL and browser history on navigation
  const navigateTo = useCallback((path: string) => {
    setCurrentPath(path);
    setSearchQuery("");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("path", path);
      window.history.pushState({ path }, "", url.toString());
    }
  }, []);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.path) {
        setCurrentPath(e.state.path);
      } else {
        const urlParams = new URLSearchParams(window.location.search);
        setCurrentPath(urlParams.get("path") || "/");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Fetch Directory Data
  const loadDirectory = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data: DirectoryResponse = await fetchDirectory(path);
      setItems(data.items || []);
      if (data.app) setAppName(data.app);
    } catch (err: any) {
      console.error("Failed to load directory", err);
      setError(
        err.message || "Could not connect to media server. Ensure the python backend is running."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDirectory(currentPath);
  }, [currentPath, loadDirectory]);

  // Handle View Mode toggle
  const handleViewModeChange = (mode: "grid" | "list") => {
    setViewMode(mode);
    setStorageItem("streamly_view", mode);
  };

  // Handle Sort toggle
  const handleSortChange = (sort: "name" | "date" | "size") => {
    setSortBy(sort);
    setStorageItem("streamly_sort", sort);
  };

  // Handle Theme toggle
  const handleThemeToggle = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    setStorageItem("streamly_theme", nextDark ? "dark" : "light");
    document.documentElement.classList.toggle("dark", nextDark);
    document.documentElement.classList.toggle("light", !nextDark);
  };

  // Process and sort items
  const processedItems = useMemo(() => {
    let result = [...items];

    // Filter by query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (it) =>
          it.name.toLowerCase().includes(q) ||
          (it.title && it.title.toLowerCase().includes(q))
      );
    }

    // Natural sort
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    result.sort((a, b) => {
      // Folders always at top
      if (a.dir !== b.dir) return a.dir ? -1 : 1;

      if (sortBy === "date") {
        return (b.mtime || 0) - (a.mtime || 0);
      }
      if (sortBy === "size") {
        return (b.size || 0) - (a.size || 0);
      }
      return collator.compare(a.name, b.name);
    });

    return result;
  }, [items, searchQuery, sortBy]);

  // Photos list for photo viewer navigation
  const photosList = useMemo(() => {
    return items.filter((it) => it.kind === "image");
  }, [items]);

  // Handle opening an item
  const handleOpenItem = (item: MediaItem) => {
    if (item.dir || item.kind === "folder") {
      const nextPath = currentPath.endsWith("/")
        ? `${currentPath}${item.url}`
        : `${currentPath}/${item.url}`;
      navigateTo(nextPath);
      return;
    }

    if (item.kind === "video") {
      setActiveVideo(item);
      return;
    }

    if (item.kind === "image") {
      setActivePhoto(item);
      return;
    }

    if (item.kind === "audio") {
      setActiveAudio(item);
      return;
    }

    // Generic file fallback: open or trigger download
    const fileUrl = `${currentPath.endsWith("/") ? currentPath : currentPath + "/"}${item.url}`;
    window.open(fileUrl, "_blank");
  };

  // Update poster dynamically in item list
  const handlePosterUpdated = (newPosterUrl: string) => {
    if (!posterModalItem) return;
    setItems((prev) =>
      prev.map((it) =>
        it.key === posterModalItem.key ? { ...it, poster: newPosterUrl } : it
      )
    );
  };

  // Stats calculation
  const stats = useMemo(() => {
    const foldersCount = items.filter((it) => it.dir).length;
    const videosCount = items.filter((it) => it.kind === "video").length;
    const photosCount = items.filter((it) => it.kind === "image").length;
    const totalBytes = items.reduce((acc, it) => acc + (it.size || 0), 0);

    const parts: string[] = [];
    if (foldersCount > 0) parts.push(`${foldersCount} folders`);
    if (videosCount > 0) parts.push(`${videosCount} videos`);
    if (photosCount > 0) parts.push(`${photosCount} photos`);
    if (totalBytes > 0) parts.push(formatBytes(totalBytes));

    return parts.join(" · ") || `${items.length} items`;
  }, [items]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)]">
      {/* Top Navigation Bar */}
      <Navbar
        appName={appName}
        currentPath={currentPath}
        onNavigate={navigateTo}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        sortBy={sortBy}
        onSortChange={handleSortChange}
        isDark={isDark}
        onThemeToggle={handleThemeToggle}
        onRefresh={() => loadDirectory(currentPath)}
        isLoading={isLoading}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6">
        {/* Folder Title & Stats Bar */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 pb-6 border-b border-white/5 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white capitalize">
              {currentPath === "/"
                ? "Library"
                : decodeURIComponent(currentPath.split("/").filter(Boolean).pop() || "")}
            </h1>
            <p className="text-xs text-slate-400 mt-1">{stats}</p>
          </div>
          {searchQuery && (
            <span className="text-xs text-indigo-400 font-medium">
              Showing matches for &quot;{searchQuery}&quot; ({processedItems.length})
            </span>
          )}
        </div>

        {/* Error Notification */}
        {error ? (
          <div className="p-6 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-rose-400 shrink-0" />
              <div>
                <p className="font-semibold text-sm">Connection Issue</p>
                <p className="text-xs text-rose-300">{error}</p>
              </div>
            </div>
            <button
              onClick={() => loadDirectory(currentPath)}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md flex items-center gap-2 transition-colors shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        ) : isLoading ? (
          /* Shimmer Skeleton */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-xl overflow-hidden bg-white/[0.03] border border-white/5 animate-pulse"
              >
                <div className="aspect-[2/3] bg-white/5" />
                <div className="p-3 flex flex-col gap-2">
                  <div className="h-4 bg-white/10 rounded w-3/4" />
                  <div className="h-3 bg-white/5 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : viewMode === "grid" ? (
          <MediaGrid
            items={processedItems}
            currentPath={currentPath}
            onOpen={handleOpenItem}
            onChangePoster={(item) => setPosterModalItem(item)}
          />
        ) : (
          <MediaList
            items={processedItems}
            currentPath={currentPath}
            onOpen={handleOpenItem}
            onChangePoster={(item) => setPosterModalItem(item)}
          />
        )}
      </main>

      {/* Video Streaming Player Modal */}
      {activeVideo && (
        <VideoPlayer
          item={activeVideo}
          currentPath={currentPath}
          onClose={() => setActiveVideo(null)}
        />
      )}

      {/* Photo / Image Lightbox Viewer */}
      {activePhoto && (
        <PhotoViewer
          item={activePhoto}
          photoList={photosList}
          currentPath={currentPath}
          onClose={() => setActivePhoto(null)}
          onNavigate={(nextPhoto) => setActivePhoto(nextPhoto)}
        />
      )}

      {/* Poster Search & Picker Modal */}
      {posterModalItem && (
        <PosterPickerModal
          item={posterModalItem}
          onClose={() => setPosterModalItem(null)}
          onPosterUpdated={handlePosterUpdated}
        />
      )}

      {/* Audio Player Popup */}
      {activeAudio && (
        <AudioPlayerModal
          item={activeAudio}
          currentPath={currentPath}
          onClose={() => setActiveAudio(null)}
        />
      )}
    </div>
  );
}

