"use client";

import React, { useState, useEffect } from "react";
import {
  Folder,
  Play,
  Image as ImageIcon,
  Music,
  FileText,
  Clock,
  Sparkles,
  Download,
  ExternalLink,
} from "lucide-react";
import { MediaItem } from "@/lib/types";
import {
  formatBytes,
  formatDate,
  getCleanTitle,
  getFileExtension,
  getFolderColor,
  cn,
} from "@/lib/utils";
import { getPlaybackPosition } from "@/lib/storage";

interface MediaCardProps {
  item: MediaItem;
  currentPath: string;
  onOpen: (item: MediaItem) => void;
  onChangePoster?: (item: MediaItem) => void;
}

export function MediaCard({
  item,
  currentPath,
  onOpen,
  onChangePoster,
}: MediaCardProps) {
  const [resumeProgress, setResumeProgress] = useState<number | null>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (item.kind === "video" && item.key) {
      const pos = getPlaybackPosition(item.key);
      if (pos && pos.percentage > 2 && pos.percentage < 95) {
        setResumeProgress(pos.percentage);
      } else {
        setResumeProgress(null);
      }
    }
  }, [item]);

  const cleanTitle = getCleanTitle(item);
  const ext = getFileExtension(item.name);
  const isVideo = item.kind === "video";
  const isFolder = item.dir || item.kind === "folder";
  const isImage = item.kind === "image";
  const isAudio = item.kind === "audio";

  // Build stream URL for VLC or Direct Download
  const fileUrl = `${currentPath.endsWith("/") ? currentPath : currentPath + "/"}${item.url}`;

  // Poster / Image source resolution
  let imageUrl: string | undefined = undefined;
  if (isVideo) {
    imageUrl = item.poster;
  } else if (isImage) {
    imageUrl = item.thumb || item.preview || fileUrl;
  }

  return (
    <div
      onClick={() => onOpen(item)}
      className="group relative flex flex-col rounded-xl overflow-hidden bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-indigo-500/50 shadow-md hover:shadow-indigo-500/10 transition-all duration-300 cursor-pointer select-none"
    >
      {/* Visual Header / Media Preview Area */}
      <div className="relative w-full aspect-[2/3] sm:aspect-[16/10] bg-black/40 overflow-hidden flex items-center justify-center">
        {/* Poster / Thumbnail image */}
        {imageUrl && !imageError ? (
          <img
            src={imageUrl}
            alt={cleanTitle}
            loading="lazy"
            onError={() => setImageError(true)}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          />
        ) : isFolder ? (
          <div
            className={cn(
              "w-full h-full bg-gradient-to-br flex flex-col items-center justify-center p-4 transition-transform duration-500 group-hover:scale-105",
              getFolderColor(item.name)
            )}
          >
            <Folder className="w-16 h-16 text-white/90 drop-shadow-md group-hover:scale-110 transition-transform" />
          </div>
        ) : isVideo ? (
          <div className="w-full h-full bg-gradient-to-br from-indigo-950 via-slate-900 to-black flex items-center justify-center">
            <Play className="w-12 h-12 text-indigo-400/60 group-hover:text-indigo-400 group-hover:scale-110 transition-all" />
          </div>
        ) : isImage ? (
          <div className="w-full h-full bg-gradient-to-br from-purple-950 via-slate-900 to-black flex items-center justify-center">
            <ImageIcon className="w-12 h-12 text-purple-400/60" />
          </div>
        ) : isAudio ? (
          <div className="w-full h-full bg-gradient-to-br from-emerald-950 via-slate-900 to-black flex items-center justify-center">
            <Music className="w-12 h-12 text-emerald-400/60 group-hover:scale-110 transition-all" />
          </div>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-black flex items-center justify-center">
            <FileText className="w-12 h-12 text-slate-400/60" />
          </div>
        )}

        {/* Badges Overlay */}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1.5 z-10">
          {ext && (
            <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider rounded bg-black/60 text-white/90 backdrop-blur-md border border-white/10 uppercase">
              {ext}
            </span>
          )}
          {item.year && (
            <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-indigo-950/80 text-indigo-200 backdrop-blur-md border border-indigo-500/20">
              {item.year}
            </span>
          )}
        </div>

        {/* Folder items count badge */}
        {isFolder && typeof item.count === "number" && (
          <div className="absolute top-2 right-2 px-2 py-0.5 text-[11px] font-medium rounded-full bg-black/60 text-white/90 backdrop-blur-md border border-white/10">
            {item.count} {item.count === 1 ? "item" : "items"}
          </div>
        )}

        {/* Hover Action Overlay */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-2 p-3">
          {isVideo && (
            <div className="w-14 h-14 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-xl shadow-indigo-600/40 hover:scale-110 transition-transform">
              <Play className="w-7 h-7 fill-white translate-x-0.5" />
            </div>
          )}
          {isImage && (
            <div className="w-12 h-12 rounded-full bg-purple-600/90 text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
              <ImageIcon className="w-6 h-6" />
            </div>
          )}
          {isFolder && (
            <span className="text-sm font-semibold text-white px-3 py-1.5 rounded-lg bg-white/20 border border-white/20">
              Browse Folder
            </span>
          )}

          {/* Secondary Actions on Video Cards: Change Poster & VLC & Download */}
          {isVideo && (
            <div
              className="absolute bottom-2 inset-x-2 flex items-center justify-between"
              onClick={(e) => e.stopPropagation()}
            >
              {onChangePoster && (
                <button
                  type="button"
                  onClick={() => onChangePoster(item)}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white backdrop-blur-sm border border-white/10 transition-colors"
                  title="Change poster (TMDB / Wikipedia)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                </button>
              )}
              <div className="flex items-center gap-1.5 ml-auto">
                <a
                  href={`vlc://${window?.location?.origin || ""}${fileUrl}`}
                  className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-slate-200 hover:text-white backdrop-blur-sm border border-white/10"
                  title="Stream directly in VLC player"
                >
                  VLC
                </a>
                <a
                  href={fileUrl}
                  download
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white backdrop-blur-sm border border-white/10 transition-colors"
                  title="Download media file"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Video Resume Progress Bar */}
        {resumeProgress !== null && (
          <div className="absolute bottom-0 inset-x-0 h-1 bg-black/60 overflow-hidden">
            <div
              className="h-full bg-indigo-500 shadow-sm"
              style={{ width: `${resumeProgress}%` }}
            />
          </div>
        )}
      </div>

      {/* Card Info Area */}
      <div className="p-3 flex flex-col flex-1 justify-between gap-1">
        <h3
          className="font-medium text-sm text-slate-200 group-hover:text-white line-clamp-2 transition-colors"
          title={item.name}
        >
          {cleanTitle}
        </h3>

        <div className="flex items-center justify-between text-xs text-slate-400 font-normal pt-1">
          <span>{isFolder ? `${item.count || 0} items` : formatBytes(item.size)}</span>
          {item.mtime > 0 && <span>{formatDate(item.mtime)}</span>}
        </div>
      </div>
    </div>
  );
}

