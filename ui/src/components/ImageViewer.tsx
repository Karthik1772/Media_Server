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
      className="fixed inset-0 z-50 flex items-center justify-center overlay-scrim select-none animate-fadeIn"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top action bar */}
      <div className="glass-strong absolute top-3 sm:top-4 inset-x-3 sm:inset-x-5 rounded-2xl px-4 py-2.5 flex items-center justify-between z-10">
        <div className="text-sm font-semibold text-white truncate pr-4">
          {current.name}
        </div>
        <button
          onClick={onClose}
          className="glass-btn p-2.5 rounded-full"
          title="Close (Esc)"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Prev button */}
      {currentIndex > 0 && (
        <button
          onClick={() => onSelectIndex(currentIndex - 1)}
          className="glass-btn absolute left-4 top-1/2 -translate-y-1/2 p-3.5 rounded-full z-10 hidden sm:block"
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
        className="max-h-[78vh] max-w-[90vw] object-contain rounded-3xl ring-1 ring-white/25 shadow-[0_30px_80px_rgba(0,0,0,0.6)] transition-transform"
      />

      {/* Next button */}
      {currentIndex < items.length - 1 && (
        <button
          onClick={() => onSelectIndex(currentIndex + 1)}
          className="glass-btn absolute right-4 top-1/2 -translate-y-1/2 p-3.5 rounded-full z-10 hidden sm:block"
          title="Next"
        >
          <ArrowRightIcon className="w-6 h-6" />
        </button>
      )}

      {/* Caption & Counter */}
      <div className="glass-strong absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-xs sm:text-sm text-zinc-100 font-medium">
        {currentIndex + 1} / {items.length}
      </div>
    </div>
  );
}

