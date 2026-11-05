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

function getHue(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) % 360;
  }
  return hash;
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
    if (item.kind !== "video" || !videoPreviews || !videoRef.current) return;

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

  const hue = getHue(item.name);

  // RENDER THUMBNAIL
  const renderThumbnail = () => {
    if (item.dir) {
      return (
        <div
          className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, hsla(${hue}, 85%, 62%, 0.55), hsla(${
              (hue + 45) % 360
            }, 80%, 45%, 0.18))`,
          }}
        >
          <FolderIcon className="w-10 h-10 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]" />
          <span className="absolute bottom-2 right-2 glass-subtle px-2 py-0.5 rounded-full text-[10px] font-semibold text-white">
            {item.count} {item.count === 1 ? "item" : "items"}
          </span>
        </div>
      );
    }

    if (item.kind === "video") {
      return (
        <div className="w-full h-full relative flex items-center justify-center bg-black/40 overflow-hidden">
          {item.poster && !videoLoaded && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.poster} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          {videoPreviews && (
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

          {/* Fallback & Play Icon */}
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/45 via-transparent to-transparent">
            <div className="glass w-11 h-11 rounded-full flex items-center justify-center text-white group-hover:scale-110 transition-transform">
              <PlayIcon className="w-4 h-4 ml-0.5" />
            </div>
          </div>

          {/* Extension Badge */}
          <span className="absolute bottom-2 right-2 glass-subtle px-2 py-0.5 rounded-full text-[10px] font-bold text-white">
            {ext}
          </span>

          {/* Progress Bar */}
          {progress > 0 && (
            <div className="absolute bottom-0 inset-x-0 h-1 bg-white/25">
              <div
                className="h-full bg-gradient-to-r from-[#ff2d78] to-[#7c3aed]"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      );
    }

    if (item.kind === "image") {
      return (
        <div className="w-full h-full relative flex items-center justify-center bg-black/40 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.thumb || item.view || item.url}
            alt={item.name}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <span className="absolute bottom-2 right-2 glass-subtle px-2 py-0.5 rounded-full text-[10px] font-bold text-white">
            {ext}
          </span>
        </div>
      );
    }

    if (item.kind === "audio") {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center relative bg-gradient-to-br from-teal-400/35 to-indigo-500/20">
          <AudioIcon className="w-10 h-10 text-teal-300 drop-shadow-md" />
          <span className="absolute bottom-2 right-2 glass-subtle px-2 py-0.5 rounded-full text-[10px] font-bold text-white">
            {ext}
          </span>
        </div>
      );
    }

    return (
      <div className="w-full h-full flex flex-col items-center justify-center relative bg-white/[0.06]">
        <FileIcon className="w-10 h-10 text-zinc-400" />
        <span className="absolute bottom-2 right-2 glass-subtle px-2 py-0.5 rounded-full text-[10px] font-bold text-white">
          {ext || "FILE"}
        </span>
      </div>
    );
  };

  const displayName = item.dir
    ? item.name
    : item.name.replace(/\.[^.]+$/, "").replace(/[._]+/g, " ");

  const subText = item.dir
    ? "Folder"
    : `${formatBytes(item.size)} · ${formatDate(item.mtime)}`;

  const activate = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(item);
    }
  };

  // LIST VIEW
  if (viewMode === "list") {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(item)}
        onKeyDown={activate}
        className="group glass glass-card flex items-center gap-4 p-2.5 rounded-2xl cursor-pointer"
      >
        <div className="w-16 h-11 rounded-xl overflow-hidden flex-shrink-0 ring-1 ring-white/15">
          {renderThumbnail()}
        </div>
        <div className="flex-1 min-w-0 pr-2">
          <div className="text-sm font-semibold text-zinc-50 truncate">{item.name}</div>
          <div className="text-xs text-zinc-300/80 mt-0.5 truncate">{subText}</div>
        </div>
      </div>
    );
  }

  // GRID VIEW
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={activate}
      className="group glass glass-card flex flex-col rounded-3xl overflow-hidden cursor-pointer"
    >
      <div className="p-2 pb-0">
        <div className="w-full aspect-video rounded-2xl overflow-hidden ring-1 ring-white/15">
          {renderThumbnail()}
        </div>
      </div>
      <div className="px-3.5 pt-3 pb-3.5 flex flex-col justify-between flex-1">
        <div
          className="text-xs sm:text-sm font-semibold text-zinc-50 line-clamp-2 leading-snug"
          title={item.name}
        >
          {displayName}
        </div>
        <div className="text-[11px] text-zinc-300/75 mt-2 truncate font-medium">
          {subText}
        </div>
      </div>
    </div>
  );
}
