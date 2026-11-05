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
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-xl animate-fadeIn">
      {/* Top action header */}
      <div className="flex items-center justify-between p-3 sm:p-4 bg-gradient-to-b from-black/80 to-transparent z-10 gap-2">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
        >
          <CloseIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Close</span>
        </button>

        <div className="text-sm font-semibold text-white/90 truncate max-w-md text-center px-2">
          {current.name}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenVLC}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#ff2d78]/80 to-[#7c3aed]/80 hover:from-[#ff2d78] hover:to-[#7c3aed] text-white text-xs sm:text-sm font-semibold transition-all shadow-lg shadow-purple-900/30"
            title="Open in VLC Player"
          >
            VLC
          </button>
          <a
            href={current.url}
            download
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Download file"
          >
            <DownloadIcon className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Main player area */}
      <div className="flex-1 relative flex items-center justify-center min-h-0 bg-black">
        <video
          ref={videoRef}
          controls
          playsInline
          onTimeUpdate={handleTimeUpdate}
          className="w-full h-full object-contain"
        />

        {/* Codec / Playback Error Banner */}
        {hasError && (
          <div className="absolute inset-x-4 max-w-lg mx-auto p-5 rounded-2xl bg-[#241017]/95 border border-[#ff2d78]/30 text-white backdrop-blur-xl shadow-2xl flex flex-col items-center text-center gap-3 animate-slideUp">
            <AlertCircleIcon className="w-10 h-10 text-[#ff2d78]" />
            <div>
              <h3 className="font-semibold text-base mb-1">Playback not supported by browser</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Most web browsers cannot play MKV containers or HEVC/AC3 codecs directly. You can stream it in VLC with one click.
              </p>
            </div>
            <div className="flex gap-2.5 mt-1">
              <button
                onClick={handleOpenVLC}
                className="px-4 py-2 rounded-xl bg-[#ff2d78] hover:bg-[#e0266a] text-white text-xs font-semibold shadow-lg"
              >
                Open with VLC
              </button>
              <a
                href={current.url}
                download
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold"
              >
                Download File
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Bottom navigation bar */}
      <div className="p-3 sm:p-4 flex items-center justify-between text-xs sm:text-sm text-zinc-400 bg-gradient-to-t from-black/80 to-transparent">
        <button
          onClick={() => onSelectIndex(currentIndex - 1)}
          disabled={currentIndex <= 0}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white disabled:opacity-20 disabled:pointer-events-none transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          <span>Prev</span>
        </button>

        <span className="font-medium">
          {currentIndex + 1} / {items.length}
        </span>

        <button
          onClick={() => onSelectIndex(currentIndex + 1)}
          disabled={currentIndex >= items.length - 1}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white disabled:opacity-20 disabled:pointer-events-none transition-colors"
        >
          <span>Next</span>
          <ArrowRightIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

