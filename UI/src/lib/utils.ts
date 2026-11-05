import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { MediaItem } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i < 0) return `${bytes} B`;
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatDate(timestamp: number): string {
  if (!timestamp) return "";
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${rem.toString().padStart(2, "0")}`;
  }
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

export function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()?.toUpperCase() || "" : "";
}

export function getCleanTitle(item: MediaItem): string {
  if (item.title) return item.title;
  if (item.dir) return item.name;
  return item.name
    .replace(/\.[^/.]+$/, "")
    .replace(/[._\-]+/g, " ")
    .trim();
}

export function getFolderColor(name: string): string {
  const colors = [
    "from-indigo-600 to-violet-800",
    "from-blue-600 to-cyan-800",
    "from-emerald-600 to-teal-800",
    "from-amber-600 to-orange-800",
    "from-rose-600 to-pink-800",
    "from-purple-600 to-fuchsia-800",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % colors.length;
  }
  return colors[Math.abs(hash)];
}

