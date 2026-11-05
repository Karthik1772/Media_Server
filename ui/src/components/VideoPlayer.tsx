"use client";

import React, { useEffect, useRef, useState } from "react";
import { FileItem } from "../types/api";
import {
  CloseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  DownloadIcon,
  AlertCircleIcon,
} from "./Icons";

interface VideoPlayerProps {
  items: FileItem[];
  currentIndex: number;
  onClose: () => void;
  onSelectIndex: (index: number) => void;
  onShowToast: (msg: string) => void;
}

export function VideoPlayer({
  items,
  currentIndex,
  onClose,
  onSelectIndex,
  onShowToast,
}: VideoPlayerProps) {
  const current = items[currentIndex];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasError, setHasError] = useState(false);
  const lastSaveRef = useRef<number>(0);

  const getStorageKey = (item: FileItem) => `pos:${item.url}`;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const vid = videoRef.current;
      if (!vid) return;

      if (e.key === "Escape") {
        onClose();
      } else if (e.key === " ") {
        e.preventDefault();
        if (vid.paused) vid.play().catch(() => {});
        else vid.pause();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        vid.currentTime = Math.max(0, vid.currentTime - 10);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        vid.currentTime = Math.min(vid.duration || 0, vid.currentTime + 10);
      } else if ((e.key === "n" || e.key === "N") && currentIndex < items.length - 1) {
        onSelectIndex(currentIndex + 1);
      } else if ((e.key === "p" || e.key === "P") && currentIndex > 0) {
        onSelectIndex(currentIndex - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, items.length, onClose, onSelectIndex]);

  // Load and resume position
  useEffect(() => {
    setHasError(false);
    const vid = videoRef.current;
    if (!vid || !current) return;

    vid.src = current.url;

    const onLoadedMetadata = () => {
      try {
        const savedRaw = localStorage.getItem(getStorageKey(current));
        if (savedRaw) {
          const saved = JSON.parse(savedRaw);
          if (saved && saved.t > 5 && vid.duration && saved.t < vid.duration - 10) {
            vid.currentTime = saved.t;
            const mins = Math.floor(saved.t / 60);
            const secs = Math.floor(saved.t % 60).toString().padStart(2, "0");
            onShowToast(`Resumed from ${mins}:${secs}`);
          }
        }
      } catch {}
      vid.play().catch(() => {});
    };

    const onError = () => {
      setHasError(true);
    };

    const onEnded = () => {
      try {
        localStorage.setItem(getStorageKey(current), JSON.stringify({ t: 0, d: vid.duration }));
      } catch {}
      if (currentIndex < items.length - 1) {
        onSelectIndex(currentIndex + 1);
      }
    };

    vid.addEventListener("loadedmetadata", onLoadedMetadata);
    vid.addEventListener("error", onError);
    vid.addEventListener("ended", onEnded);

    return () => {
      vid.removeEventListener("loadedmetadata", onLoadedMetadata);
      vid.removeEventListener("error", onError);
      vid.removeEventListener("ended", onEnded);
    };
  }, [current, currentIndex, items.length, onSelectIndex, onShowToast]);

  const handleTimeUpdate = () => {
    const vid = videoRef.current;
    if (!vid || !current || !vid.duration) return;

    const now = Date.now();
    if (now - lastSaveRef.current > 3000) {
      lastSaveRef.current = now;
      try {
        localStorage.setItem(
          getStorageKey(current),
          JSON.stringify({ t: vid.currentTime, d: vid.duration })
        );
      } catch {}
    }
  };

  const handleOpenVLC = () => {
    if (!current) return;
    const absUrl = new URL(current.url, window.location.href).href;
    const ua = navigator.userAgent;

    if (/Android/i.test(ua)) {
      const u = new URL(current.url, window.location.href);
      window.location.href = `intent://${u.host}${u.pathname}#Intent;scheme=http;package=org.videolan.vlc;type=video/*;end`;
    } else if (/iPhone|iPad/i.test(ua)) {
      window.location.href = `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(absUrl)}`;
    } else {
      navigator.clipboard?.writeText(absUrl).then(
        () => onShowToast("Stream URL copied! Open VLC > Media > Open Network Stream"),
        () => onShowToast(`Stream URL: ${absUrl}`)
      );
    }
  };

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col glass-overlay animate-fadeIn select-none">
      {/* Top Floating Control Bar */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent z-10 gap-3">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.08] text-white text-xs sm:text-sm font-medium transition-all"
        >
          <CloseIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Close</span>
        </button>

        <div className="flex-1 min-w-0 text-center px-2">
          <div className="text-xs sm:text-sm font-semibold text-zinc-100 truncate">
            {current.name}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenVLC}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold transition-all shadow-lg shadow-blue-600/20"
            title="Open stream in VLC"
          >
            VLC
          </button>
          <a
            href={current.url}
            download
            className="p-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.08] text-white transition-all"
            title="Download file"
          >
            <DownloadIcon className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Main Video Viewport */}
      <div className="flex-1 relative flex items-center justify-center min-h-0 bg-black">
        <video
          ref={videoRef}
          controls
          playsInline
          onTimeUpdate={handleTimeUpdate}
          className="w-full h-full object-contain"
        />

        {/* Codec / Format Playback Prompt */}
        {hasError && (
          <div className="absolute inset-x-4 max-w-md mx-auto p-6 rounded-2xl bg-[#12131a] border border-white/10 text-white shadow-2xl flex flex-col items-center text-center gap-3 animate-fadeIn">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <AlertCircleIcon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-sm sm:text-base">Codec Not Supported by Browser</h3>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                Mobile browsers cannot play MKV containers or AC3/DTS audio directly. Tap below to stream directly in VLC without downloading.
              </p>
            </div>
            <div className="flex items-center gap-2.5 mt-2 w-full justify-center">
              <button
                onClick={handleOpenVLC}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/25 transition-all"
              >
                Stream in VLC Player
              </button>
              <a
                href={current.url}
                download
                className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-white text-xs font-semibold transition-all"
              >
                Download
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Floating Bar */}
      <div className="p-3 sm:p-4 flex items-center justify-between text-xs text-zinc-400 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <button
          onClick={() => onSelectIndex(currentIndex - 1)}
          disabled={currentIndex <= 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 disabled:opacity-20 disabled:pointer-events-none transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          <span>Previous</span>
        </button>

        <span className="font-medium text-zinc-500">
          {currentIndex + 1} of {items.length}
        </span>

        <button
          onClick={() => onSelectIndex(currentIndex + 1)}
          disabled={currentIndex >= items.length - 1}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 disabled:opacity-20 disabled:pointer-events-none transition-colors"
        >
          <span>Next</span>
          <ArrowRightIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
