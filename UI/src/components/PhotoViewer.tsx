"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
} from "lucide-react";
import { MediaItem } from "@/lib/types";
import { resolveServerUrl } from "@/lib/api";
import { formatBytes, formatDate, getCleanTitle, cn } from "@/lib/utils";

interface PhotoViewerProps {
  item: MediaItem;
  photoList: MediaItem[];
  currentPath: string;
  onClose: () => void;
  onNavigate: (item: MediaItem) => void;
}

export function PhotoViewer({
  item,
  photoList,
  currentPath,
  onClose,
  onNavigate,
}: PhotoViewerProps) {
  const [useOriginal, setUseOriginal] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  const currentIndex = photoList.findIndex((p) => p.name === item.name);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photoList.length - 1;

  const handlePrev = () => {
    if (hasPrev) {
      setZoomLevel(1);
      setUseOriginal(false);
      onNavigate(photoList[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      setZoomLevel(1);
      setUseOriginal(false);
      onNavigate(photoList[currentIndex + 1]);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, photoList]);

  const fileUrl = `${currentPath.endsWith("/") ? currentPath : currentPath + "/"}${item.url}`;
  // If original is clicked or no preview, load raw fileUrl
  const imageSrc = useOriginal || !item.preview
    ? resolveServerUrl(fileUrl)
    : resolveServerUrl(item.preview);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between select-none">
      {/* Top Header */}
      <div className="p-4 sm:p-6 flex items-center justify-between gap-4 z-10 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white transition-colors"
            title="Close viewer (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-white truncate">
              {getCleanTitle(item)}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>{formatBytes(item.size)}</span>
              {item.mtime > 0 && (
                <>
                  <span>•</span>
                  <span>{formatDate(item.mtime)}</span>
                </>
              )}
              {photoList.length > 1 && (
                <>
                  <span>•</span>
                  <span>
                    {currentIndex + 1} of {photoList.length}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Tools */}
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="hidden sm:flex items-center bg-white/10 border border-white/10 rounded-xl p-1">
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
              className="p-1.5 text-slate-300 hover:text-white rounded-lg transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoomLevel(1)}
              className="px-2 text-xs font-mono font-medium text-slate-300 hover:text-white"
              title="Reset zoom"
            >
              {Math.round(zoomLevel * 100)}%
            </button>
            <button
              onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
              className="p-1.5 text-slate-300 hover:text-white rounded-lg transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Original Quality Switcher */}
          {item.preview && (
            <button
              onClick={() => setUseOriginal(!useOriginal)}
              className={cn(
                "px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1.5",
                useOriginal
                  ? "bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-600/30"
                  : "bg-white/10 hover:bg-white/20 border-white/10 text-slate-300"
              )}
              title="Load original uncompressed photo"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Original</span>
            </button>
          )}

          {/* Download */}
          <a
            href={resolveServerUrl(fileUrl)}
            download
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white transition-colors"
            title="Download full quality photo"
          >
            <Download className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Main Image Stage */}
      <div className="relative flex-1 flex items-center justify-center p-4 overflow-hidden">
        {/* Navigation Arrows */}
        {hasPrev && (
          <button
            onClick={handlePrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/50 hover:bg-black/80 border border-white/10 text-white transition-all hover:scale-110"
            title="Previous photo (Left arrow)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {hasNext && (
          <button
            onClick={handleNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/50 hover:bg-black/80 border border-white/10 text-white transition-all hover:scale-110"
            title="Next photo (Right arrow)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* Display Image */}
        <img
          src={imageSrc}
          alt={item.name}
          style={{
            transform: `scale(${zoomLevel})`,
            transition: "transform 0.2s ease-out",
          }}
          className="max-h-[82vh] max-w-[92vw] object-contain rounded-lg shadow-2xl pointer-events-auto cursor-grab active:cursor-grabbing"
        />
      </div>

      {/* Footer info bar */}
      <div className="p-3 text-center text-xs text-slate-500 bg-gradient-to-t from-black/80 to-transparent">
        Use left/right arrow keys to navigate · Double click or zoom controls to inspect
      </div>
    </div>
  );
}

