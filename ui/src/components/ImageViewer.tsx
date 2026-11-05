"use client";

import React, { useEffect, useRef } from "react";
import { FileItem } from "../types/api";
import { CloseIcon, ArrowLeftIcon, ArrowRightIcon } from "./Icons";

interface ImageViewerProps {
  items: FileItem[];
  currentIndex: number;
  onClose: () => void;
  onSelectIndex: (index: number) => void;
}

export function ImageViewer({ items, currentIndex, onClose, onSelectIndex }: ImageViewerProps) {
  const current = items[currentIndex];
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    // Preload adjacent images
    [currentIndex - 1, currentIndex + 1].forEach((idx) => {
      if (items[idx]) {
        const img = new Image();
        img.src = items[idx].view || items[idx].url;
      }
    });
  }, [currentIndex, items]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && currentIndex > 0) onSelectIndex(currentIndex - 1);
      else if (e.key === "ArrowRight" && currentIndex < items.length - 1) onSelectIndex(currentIndex + 1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, items.length, onClose, onSelectIndex]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && currentIndex < items.length - 1) {
        onSelectIndex(currentIndex + 1);
      } else if (dx > 0 && currentIndex > 0) {
        onSelectIndex(currentIndex - 1);
      }
    }
    touchStart.current = null;
  };

  if (!current) return null;
  const imageSource = current.view || current.url;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center glass-overlay select-none animate-fadeIn"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top action bar */}
      <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between z-10 bg-gradient-to-b from-black/80 to-transparent">
        <div className="text-xs sm:text-sm font-medium text-zinc-300 truncate pr-4">
          {current.name}
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-white transition-all"
          title="Close (Esc)"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Prev arrow */}
      {currentIndex > 0 && (
        <button
          onClick={() => onSelectIndex(currentIndex - 1)}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 hover:bg-black/80 border border-white/10 text-white transition-all z-10 hidden sm:block"
          title="Previous"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
      )}

      {/* Main Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageSource}
        alt={current.name}
        className="max-h-[85vh] max-w-[92vw] object-contain rounded-lg shadow-2xl transition-transform"
      />

      {/* Next arrow */}
      {currentIndex < items.length - 1 && (
        <button
          onClick={() => onSelectIndex(currentIndex + 1)}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 hover:bg-black/80 border border-white/10 text-white transition-all z-10 hidden sm:block"
          title="Next"
        >
          <ArrowRightIcon className="w-5 h-5" />
        </button>
      )}

      {/* Counter */}
      <div className="absolute bottom-4 inset-x-0 text-center text-xs text-zinc-400 font-medium tracking-wider">
        {currentIndex + 1} / {items.length}
      </div>
    </div>
  );
}
