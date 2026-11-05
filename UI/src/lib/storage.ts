import { PlaybackState } from "./types";

const POSITION_PREFIX = "streamly_pos:";

export function savePlaybackPosition(itemKey: string, time: number, duration: number) {
  if (typeof window === "undefined" || !itemKey || !duration) return;
  const percentage = Math.min(100, Math.round((time / duration) * 100));
  const state: PlaybackState = {
    time,
    duration,
    percentage,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(POSITION_PREFIX + itemKey, JSON.stringify(state));
  } catch (err) {
    console.error("Failed to save playback position", err);
  }
}

export function getPlaybackPosition(itemKey: string): PlaybackState | null {
  if (typeof window === "undefined" || !itemKey) return null;
  try {
    const raw = localStorage.getItem(POSITION_PREFIX + itemKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearPlaybackPosition(itemKey: string) {
  if (typeof window === "undefined" || !itemKey) return;
  try {
    localStorage.removeItem(POSITION_PREFIX + itemKey);
  } catch {}
}

export function getStorageItem<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;
  try {
    const val = localStorage.getItem(key);
    return val !== null ? JSON.parse(val) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setStorageItem<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error("Storage error:", err);
  }
}

