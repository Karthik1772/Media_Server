"use client";

import React from "react";
import { MediaItem } from "@/lib/types";
import {
  Folder,
  Play,
  Image as ImageIcon,
  Music,
  FileText,
  Download,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import {
  formatBytes,
  formatDate,
  getCleanTitle,
  getFileExtension,
  cn,
} from "@/lib/utils";

interface MediaListProps {
  items: MediaItem[];
  currentPath: string;
  onOpen: (item: MediaItem) => void;
  onChangePoster?: (item: MediaItem) => void;
}

export function MediaList({
  items,
  currentPath,
  onOpen,
  onChangePoster,
}: MediaListProps) {
  if (items.length === 0) {
    return (
      <div className="py-20 text-center text-slate-500">
        No media files or folders found.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/5 border-b border-white/10 text-xs text-slate-400 uppercase tracking-wider font-semibold">
          <tr>
            <th className="py-3 px-4">Name</th>
            <th className="py-3 px-4 hidden sm:table-cell">Type</th>
            <th className="py-3 px-4">Size</th>
            <th className="py-3 px-4 hidden md:table-cell">Modified</th>
            <th className="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-slate-300">
          {items.map((item) => {
            const cleanTitle = getCleanTitle(item);
            const ext = getFileExtension(item.name);
            const isVideo = item.kind === "video";
            const isFolder = item.dir || item.kind === "folder";
            const isImage = item.kind === "image";
            const isAudio = item.kind === "audio";
            const fileUrl = `${currentPath.endsWith("/") ? currentPath : currentPath + "/"}${item.url}`;

            return (
              <tr
                key={item.name + (item.key || "")}
                onClick={() => onOpen(item)}
                className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
              >
                {/* Name & Icon */}
                <td className="py-3 px-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    {isFolder ? (
                      <Folder className="w-4 h-4 text-indigo-400" />
                    ) : isVideo ? (
                      <Play className="w-4 h-4 text-rose-400 fill-rose-400/20" />
                    ) : isImage ? (
                      <ImageIcon className="w-4 h-4 text-purple-400" />
                    ) : isAudio ? (
                      <Music className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <FileText className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-200 group-hover:text-white truncate">
                      {cleanTitle}
                    </p>
                    {item.year && (
                      <span className="text-xs text-slate-500 font-normal">
                        Year: {item.year}
                      </span>
                    )}
                  </div>
                </td>

                {/* Type */}
                <td className="py-3 px-4 hidden sm:table-cell text-slate-400">
                  {isFolder ? (
                    <span className="text-indigo-300">Folder</span>
                  ) : ext ? (
                    <span className="font-mono text-xs uppercase px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                      {ext}
                    </span>
                  ) : (
                    item.kind
                  )}
                </td>

                {/* Size */}
                <td className="py-3 px-4 text-slate-400 text-xs">
                  {isFolder ? `${item.count || 0} items` : formatBytes(item.size)}
                </td>

                {/* Modified */}
                <td className="py-3 px-4 hidden md:table-cell text-slate-400 text-xs">
                  {item.mtime ? formatDate(item.mtime) : "—"}
                </td>

                {/* Actions */}
                <td
                  className="py-3 px-4 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    {isVideo && onChangePoster && (
                      <button
                        type="button"
                        onClick={() => onChangePoster(item)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                        title="Change poster"
                      >
                        <Sparkles className="w-4 h-4 text-amber-300" />
                      </button>
                    )}
                    {isVideo && (
                      <a
                        href={`vlc://${window?.location?.origin || ""}${fileUrl}`}
                        className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 hover:text-white border border-white/10"
                        title="Open in VLC"
                      >
                        VLC
                      </a>
                    )}
                    {!isFolder && (
                      <a
                        href={fileUrl}
                        download
                        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                        title="Download file"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

