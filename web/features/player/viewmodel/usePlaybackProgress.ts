import type { MutableRefObject, RefObject } from "react";
import type { Item } from "@/lib/types";
import { posKey, type SavedPos } from "@/lib/format";
import { store } from "@/lib/store";

interface RuntimeProgressState { ext: boolean; lastSave: number }

interface Options<T extends RuntimeProgressState> {
  videoRef: RefObject<HTMLVideoElement>;
  audioRef: RefObject<HTMLAudioElement>;
  runtimeRef: MutableRefObject<T>;
  getCurrentItem: () => Item | undefined;
  hasNext: () => boolean;
  setNextUp: (next: boolean) => void;
}

/** Keeps extracted audio synchronized and persists playback position at a low frequency. */
export function usePlaybackProgress<T extends RuntimeProgressState>({ videoRef, audioRef, runtimeRef, getCurrentItem, hasNext, setNextUp }: Options<T>) {
  function onTimeUpdate() {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;
    if (runtimeRef.current.ext && !video.paused && !video.seeking && audio.readyState >= 2 && Math.abs(audio.currentTime - video.currentTime) > 0.3) {
      audio.currentTime = video.currentTime;
    }
    const now = Date.now();
    if (now - runtimeRef.current.lastSave < 4000 || !video.duration) return;
    runtimeRef.current.lastSave = now;
    const item = getCurrentItem();
    if (item) store.set(posKey(item), { t: video.currentTime, d: video.duration } satisfies SavedPos);
  }

  function onEnded() {
    const item = getCurrentItem();
    const video = videoRef.current;
    if (item && video) store.set(posKey(item), { t: 0, d: video.duration } satisfies SavedPos);
    audioRef.current?.pause();
    if (hasNext()) setNextUp(true);
  }

  return { onTimeUpdate, onEnded };
}
