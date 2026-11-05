"use client";

import React from "react";
import { MediaItem } from "@/lib/types";
import { MediaCard } from "./MediaCard";
import { FolderOpen } from "lucide-react";

interface MediaGridProps {
  items: MediaItem[];
  currentPath: string;
  onOpen: (item: MediaItem) => void;
  onChangePoster?: (item: MediaItem) => void;
}

export function MediaGrid({
  items,
  currentPath,
  onOpen,
  onChangePoster,
}: MediaGridProps) {
  if (items.length === 0) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-slate-500">
          <FolderOpen className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-semibold text-slate-300">Nothing here</h3>
        <p className="text-sm text-slate-500 max-w-sm mt-1">
          No matching media files or folders found in this location.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
      {items.map((item) => (
        <MediaCard
          key={item.name + (item.key || "")}
          item={item}
          currentPath={currentPath}
          onOpen={onOpen}
          onChangePoster={onChangePoster}
        />
      ))}
    </div>
  );
}

