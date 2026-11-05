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
            background: `linear-gradient(135deg, hsl(${hue}, 65%, 28%), hsl(${
              (hue + 45) % 360
            }, 70%, 14%))`,
          }}
        >
          <FolderIcon className="w-10 h-10 text-white/90 drop-shadow-md" />
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/50 text-white/90 backdrop-blur-md border border-white/10">
            {item.count} {item.count === 1 ? "item" : "items"}
          </span>
        </div>
      );
    }

    if (item.kind === "video") {
      return (
        <div className="w-full h-full relative flex items-center justify-center bg-black/60 overflow-hidden">
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
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/60 via-transparent to-transparent">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
              <PlayIcon className="w-4 h-4 ml-0.5" />
            </div>
          </div>

          {/* Extension Badge */}
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/60 text-white/90 backdrop-blur-md border border-white/10">
            {ext}
          </span>

          {/* Progress Bar */}
          {progress > 0 && (
            <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
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
            src={item.url}
            alt={item.name}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/60 text-white/90 backdrop-blur-md border border-white/10">
            {ext}
          </span>
        </div>
      );
    }

    if (item.kind === "audio") {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center relative bg-gradient-to-br from-teal-900/60 to-indigo-950/80">
          <AudioIcon className="w-10 h-10 text-teal-300 drop-shadow-md" />
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/60 text-white/90 backdrop-blur-md border border-white/10">
            {ext}
          </span>
        </div>
      );
    }

    return (
      <div className="w-full h-full flex flex-col items-center justify-center relative bg-zinc-900/60">
        <FileIcon className="w-10 h-10 text-zinc-400" />
        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/60 text-white/90 backdrop-blur-md border border-white/10">
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

  // LIST VIEW
  if (viewMode === "list") {
    return (
      <div
        onClick={() => onOpen(item)}
        className="group flex items-center gap-4 p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-white/20 transition-all cursor-pointer backdrop-blur-xl"
      >
        <div className="w-14 h-11 rounded-lg overflow-hidden flex-shrink-0">
          {renderThumbnail()}
        </div>
        <div className="flex-1 min-w-0 pr-2">
          <div className="text-sm font-semibold text-zinc-100 truncate group-hover:text-white transition-colors">
            {item.name}
          </div>
          <div className="text-xs text-zinc-400 mt-0.5 truncate">{subText}</div>
        </div>
      </div>
    );
  }

  // GRID VIEW
  return (
    <div
      onClick={() => onOpen(item)}
      className="group flex flex-col rounded-2xl overflow-hidden bg-[#13131c]/60 hover:bg-[#1c1c28]/80 border border-white/[0.07] hover:border-[#7c3aed]/50 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-2xl hover:shadow-[#7c3aed]/10 hover:-translate-y-1 backdrop-blur-xl"
    >
      <div className="w-full aspect-video overflow-hidden">
        {renderThumbnail()}
      </div>
      <div className="p-3 flex flex-col justify-between flex-1">
        <div
          className="text-xs sm:text-sm font-semibold text-zinc-100 line-clamp-2 leading-snug group-hover:text-white transition-colors"
          title={item.name}
        >
          {displayName}
        </div>
        <div className="text-[11px] text-zinc-400 mt-2 truncate font-medium">
          {subText}
        </div>
      </div>
    </div>
  );
}

