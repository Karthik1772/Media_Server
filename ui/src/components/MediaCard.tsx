"use client";

import React, { useEffect, useRef, useState } from "react";
import { FileItem } from "../types/api";
import {
  FolderIcon,
  VideoIcon,
  ImageIcon,
  AudioIcon,
  FileIcon,
  PlayIcon,
} from "./Icons";

interface MediaCardProps {
  item: FileItem;
  viewMode: "grid" | "list";
  videoPreviews: boolean;
  onOpen: (item: FileItem) => void;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function MediaCard({
  item,
  viewMode,
  videoPreviews,
  onOpen,
}: MediaCardProps) {
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Read saved video progress
  useEffect(() => {
    if (item.kind === "video") {
      try {
        const raw = localStorage.getItem(`pos:${item.url}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.d && parsed.t) {
            setProgress(Math.min(100, Math.round((parsed.t * 100) / parsed.d)));
          }
        }
      } catch {}
    }
  }, [item]);

  // Video preview intersection observer
  useEffect(() => {
    if (item.kind !== "video" || !videoPreviews || !videoRef.current || item.poster) return;

    const el = videoRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          el.src = `${item.url}#t=1`;
          el.load();
          observer.unobserve(el);
        }
      },
      { rootMargin: "150px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [item, videoPreviews]);

  const ext = item.name.includes(".")
    ? item.name.split(".").pop()?.toUpperCase().slice(0, 5)
    : "";

  const displayName = item.dir
    ? item.name
    : item.name.replace(/\.[^.]+$/, "").replace(/[._]+/g, " ");

  const subText = item.dir
    ? `${item.count} ${item.count === 1 ? "item" : "items"}`
    : `${formatBytes(item.size)} · ${formatDate(item.mtime)}`;

  // THUMBNAIL RENDERER
  const renderThumbnail = () => {
    if (item.dir) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900/90 to-zinc-950/80 group-hover:from-slate-800/90 group-hover:to-zinc-900/90 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-300 group-hover:scale-110 group-hover:text-blue-400 group-hover:border-blue-500/30 transition-all">
            <FolderIcon className="w-6 h-6" />
          </div>
        </div>
      );
    }

    if (item.kind === "video") {
      const displayPoster = item.poster;

      return (
        <div className="w-full h-full relative flex items-center justify-center bg-zinc-950 overflow-hidden">
          {displayPoster && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayPoster}
              alt=""
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          )}

          {!displayPoster && videoPreviews && (
            <video
              ref={videoRef}
              muted
              playsInline
              preload="none"
              onLoadedData={() => setVideoLoaded(true)}
              onError={() => setVideoLoaded(false)}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                videoLoaded ? "opacity-100" : "opacity-0"
              }`}
            />
          )}

          {/* Dark overlay for text contrast and hover play trigger */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent group-hover:via-black/30 transition-all flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-200 shadow-xl">
              <PlayIcon className="w-4 h-4 ml-0.5" />
            </div>
          </div>

          {/* Extension / Format Badge */}
          {ext && (
            <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-black/70 text-zinc-300 backdrop-blur-sm border border-white/10">
              {ext}
            </span>
          )}

          {/* Sleek Progress Bar */}
          {progress > 0 && (
            <div className="absolute bottom-0 inset-x-0 h-[3px] bg-white/20">
              <div
                className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      );
    }

    if (item.kind === "image") {
      const imgSrc = item.thumb || item.url;
      return (
        <div className="w-full h-full relative flex items-center justify-center bg-zinc-950 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgSrc}
            alt={item.name}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-black/70 text-zinc-300 backdrop-blur-sm border border-white/10">
            {ext}
          </span>
        </div>
      );
    }

    if (item.kind === "audio") {
      return (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-950/40 to-slate-950/90 group-hover:from-indigo-900/40 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
            <AudioIcon className="w-6 h-6" />
          </div>
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-black/70 text-zinc-300 backdrop-blur-sm border border-white/10">
            {ext}
          </span>
        </div>
      );
    }

    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-950">
        <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-zinc-500">
          <FileIcon className="w-6 h-6" />
        </div>
        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-black/70 text-zinc-400 backdrop-blur-sm border border-white/10">
          {ext || "FILE"}
        </span>
      </div>
    );
  };

  // LIST VIEW ITEM
  if (viewMode === "list") {
    return (
      <div
        onClick={() => onOpen(item)}
        className="group flex items-center gap-4 px-4 py-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.05] hover:border-white/[0.12] transition-all cursor-pointer"
      >
        <div className="w-14 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-black/40 relative">
          {renderThumbnail()}
        </div>
        <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
          <div className="truncate">
            <div className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors truncate">
              {displayName}
            </div>
            {item.year && (
              <span className="text-xs text-zinc-500">{item.year}</span>
            )}
          </div>
          <div className="text-xs text-zinc-500 flex-shrink-0 font-medium">
            {subText}
          </div>
        </div>
      </div>
    );
  }

  // GRID VIEW ITEM
  return (
    <div
      onClick={() => onOpen(item)}
      className="group flex flex-col rounded-xl overflow-hidden glass-card cursor-pointer select-none"
    >
      <div className="w-full aspect-video relative overflow-hidden bg-zinc-950">
        {renderThumbnail()}
      </div>
      <div className="p-3.5 flex flex-col justify-between flex-1 gap-1.5">
        <div
          className="text-xs sm:text-sm font-semibold text-zinc-200 group-hover:text-white line-clamp-1 leading-snug transition-colors"
          title={item.name}
        >
          {displayName}
        </div>
        <div className="flex items-center justify-between text-[11px] text-zinc-500 font-medium">
          <span className="truncate">{subText}</span>
          {item.year && (
            <span className="px-1.5 py-0.2 rounded bg-white/[0.05] text-zinc-400 border border-white/[0.05]">
              {item.year}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
