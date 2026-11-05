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
  const url = current?.url;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [errorUrl, setErrorUrl] = useState<string | null>(null);
  const lastSaveRef = useRef<number>(0);
  const hasError = errorUrl !== null && errorUrl === url;

  // Always-current copies of the props. The effects below read these instead of depending on
  // the callbacks, so a parent re-render (e.g. a toast appearing) never reloads the video.
  const latest = useRef({ onClose, onSelectIndex, onShowToast, currentIndex, count: items.length });
  useEffect(() => {
    latest.current = { onClose, onSelectIndex, onShowToast, currentIndex, count: items.length };
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const vid = videoRef.current;
      if (!vid) return;
      const { onClose, onSelectIndex, currentIndex, count } = latest.current;

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
      } else if ((e.key === "n" || e.key === "N") && currentIndex < count - 1) {
        onSelectIndex(currentIndex + 1);
      } else if ((e.key === "p" || e.key === "P") && currentIndex > 0) {
        onSelectIndex(currentIndex - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Load the file and resume where the viewer stopped - runs only when the file changes
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !url) return;

    const storageKey = `pos:${url}`;
    vid.src = url;

    const onLoadedMetadata = () => {
      try {
        const savedRaw = localStorage.getItem(storageKey);
        if (savedRaw) {
          const saved = JSON.parse(savedRaw);
          if (saved && saved.t > 5 && vid.duration && saved.t < vid.duration - 10) {
            vid.currentTime = saved.t;
            const mins = Math.floor(saved.t / 60);
            const secs = Math.floor(saved.t % 60).toString().padStart(2, "0");
            latest.current.onShowToast(`Resumed from ${mins}:${secs}`);
          }
        }
      } catch {}
      vid.play().catch(() => {});
    };

    const onError = () => setErrorUrl(url);

    const onEnded = () => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ t: 0, d: vid.duration }));
      } catch {}
      const { currentIndex, count, onSelectIndex } = latest.current;
      if (currentIndex < count - 1) onSelectIndex(currentIndex + 1);
    };

    vid.addEventListener("loadedmetadata", onLoadedMetadata);
    vid.addEventListener("error", onError);
    vid.addEventListener("ended", onEnded);

    return () => {
      vid.removeEventListener("loadedmetadata", onLoadedMetadata);
      vid.removeEventListener("error", onError);
      vid.removeEventListener("ended", onEnded);
      // remember the position when closing or switching files
      try {
        if (vid.duration && !vid.ended) {
          localStorage.setItem(storageKey, JSON.stringify({ t: vid.currentTime, d: vid.duration }));
        }
      } catch {}
      vid.pause();
    };
  }, [url]);

  const handleTimeUpdate = () => {
    const vid = videoRef.current;
    if (!vid || !url || !vid.duration) return;

    const now = Date.now();
    if (now - lastSaveRef.current > 3000) {
      lastSaveRef.current = now;
      try {
        localStorage.setItem(`pos:${url}`, JSON.stringify({ t: vid.currentTime, d: vid.duration }));
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
    <div className="fixed inset-0 z-50 flex flex-col overlay-scrim animate-fadeIn">
      {/* Top glass bar */}
      <div className="glass-strong rounded-2xl mx-3 sm:mx-5 mt-3 sm:mt-4 px-3 py-2.5 flex items-center justify-between gap-2 z-10">
        <button
          onClick={onClose}
          className="glass-btn flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium"
        >
          <CloseIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Close</span>
        </button>

        <div className="text-sm font-semibold text-white truncate max-w-md text-center px-2">
          {current.name}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenVLC}
            className="glass-btn is-active px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold"
            title="Open in VLC Player"
          >
            VLC
          </button>
          <a
            href={current.url}
            download
            className="glass-btn p-2.5 rounded-xl"
            title="Download file"
          >
            <DownloadIcon className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Player */}
      <div className="flex-1 min-h-0 p-3 sm:p-5">
        <div className="relative w-full h-full rounded-3xl overflow-hidden bg-black ring-1 ring-white/20 shadow-[0_30px_80px_rgba(0,0,0,0.6)] flex items-center justify-center">
          <video
            ref={videoRef}
            controls
            playsInline
            onTimeUpdate={handleTimeUpdate}
            className="w-full h-full object-contain"
          />

          {/* Codec / Playback Error Banner */}
          {hasError && (
            <div className="glass-strong absolute inset-x-4 max-w-lg mx-auto p-5 rounded-3xl text-white flex flex-col items-center text-center gap-3 animate-slideUp">
              <AlertCircleIcon className="w-10 h-10 text-[#ff6fa5]" />
              <div>
                <h3 className="font-semibold text-base mb-1">Playback not supported by browser</h3>
                <p className="text-xs text-zinc-200 leading-relaxed">
                  Most web browsers cannot play MKV containers or HEVC/AC3 codecs directly. You can stream it in VLC with one click.
                </p>
              </div>
              <div className="flex gap-2.5 mt-1">
                <button
                  onClick={handleOpenVLC}
                  className="glass-btn is-active px-4 py-2 rounded-xl text-xs font-semibold"
                >
                  Open with VLC
                </button>
                <a
                  href={current.url}
                  download
                  className="glass-btn px-4 py-2 rounded-xl text-xs font-semibold"
                >
                  Download File
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom glass bar */}
      <div className="glass-strong rounded-2xl mx-3 sm:mx-5 mb-3 sm:mb-4 px-3 py-2.5 flex items-center justify-between text-xs sm:text-sm text-zinc-200">
        <button
          onClick={() => onSelectIndex(currentIndex - 1)}
          disabled={currentIndex <= 0}
          className="glass-btn flex items-center gap-1 px-3.5 py-2 rounded-xl disabled:opacity-25 disabled:pointer-events-none"
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
          className="glass-btn flex items-center gap-1 px-3.5 py-2 rounded-xl disabled:opacity-25 disabled:pointer-events-none"
        >
          <span>Next</span>
          <ArrowRightIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
