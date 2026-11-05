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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md select-none animate-fadeIn"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top action bar */}
      <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between z-10 bg-gradient-to-b from-black/80 to-transparent">
        <div className="text-sm font-medium text-white/80 truncate pr-4">
          {current.name}
        </div>
        <button
          onClick={onClose}
          className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Close (Esc)"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Prev button */}
      {currentIndex > 0 && (
        <button
          onClick={() => onSelectIndex(currentIndex - 1)}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10 hidden sm:block"
          title="Previous"
        >
          <ArrowLeftIcon className="w-6 h-6" />
        </button>
      )}

      {/* Main Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current.view || current.url}
        alt={current.name}
        className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl transition-transform"
      />

      {/* Next button */}
      {currentIndex < items.length - 1 && (
        <button
          onClick={() => onSelectIndex(currentIndex + 1)}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10 hidden sm:block"
          title="Next"
        >
          <ArrowRightIcon className="w-6 h-6" />
        </button>
      )}

      {/* Caption & Counter */}
      <div className="absolute bottom-4 inset-x-0 text-center text-xs sm:text-sm text-zinc-400 font-medium">
        {currentIndex + 1} / {items.length}
      </div>
    </div>
  );
}

