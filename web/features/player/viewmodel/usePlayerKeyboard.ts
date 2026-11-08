import { useEffect, type MutableRefObject, type RefObject } from "react";
import { SPEEDS } from "@/lib/player";

interface PlayerKeyboardOptions {
  wake: () => void;
  lockedRef: MutableRefObject<boolean>;
  showUnlock: () => void;
  menuRef: MutableRefObject<"" | "tracks" | "speed">;
  closeMenu: () => void;
  onClose: () => void;
  seekBy: (seconds: number) => void;
  bumpVolume: (delta: number) => void;
  togglePlay: () => void;
  stepVid: (direction: number) => void;
  toggleFs: () => void;
  toggleMute: () => void;
  stepZoom: (direction: number) => void;
  setZoom: (scale: number, x: number, y: number) => void;
  zoomHud: () => void;
  cycleSub: () => void;
  cycleAudio: () => void;
  setSpeed: (speed: number) => void;
  videoRef: RefObject<HTMLVideoElement>;
}

/** Keyboard shortcuts for the media player, kept separate from the player View. */
export function usePlayerKeyboard(options: PlayerKeyboardOptions) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key;
      let handled = true;
      options.wake();
      if (options.lockedRef.current) {
        if (key === "Escape") options.showUnlock();
        return;
      }
      const video = options.videoRef.current;
      if (key === "Escape") {
        if (options.menuRef.current) options.closeMenu();
        else options.onClose();
      } else if (key === "ArrowRight") options.seekBy(10);
      else if (key === "ArrowLeft") options.seekBy(-10);
      else if (key === "ArrowUp") options.bumpVolume(0.05);
      else if (key === "ArrowDown") options.bumpVolume(-0.05);
      else if (key === " " || key === "k" || key === "K") options.togglePlay();
      else if (key === "n" || key === "N") options.stepVid(1);
      else if (key === "p" || key === "P") options.stepVid(-1);
      else if (key === "f" || key === "F") options.toggleFs();
      else if (key === "m" || key === "M") options.toggleMute();
      else if (key === "+" || key === "=") options.stepZoom(1);
      else if (key === "-" || key === "_") options.stepZoom(-1);
      else if (key === "0") {
        options.setZoom(1, 0, 0);
        options.zoomHud();
      } else if (key === "c" || key === "C") options.cycleSub();
      else if (key === "a" || key === "A") options.cycleAudio();
      else if (key === "<" || key === ",") {
        const index = video ? SPEEDS.indexOf(video.playbackRate) : -1;
        options.setSpeed(SPEEDS[Math.max(0, (index < 0 ? 2 : index) - 1)]);
      } else if (key === ">" || key === ".") {
        const index = video ? SPEEDS.indexOf(video.playbackRate) : -1;
        options.setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, (index < 0 ? 2 : index) + 1)]);
      } else handled = false;
      if (handled) event.preventDefault();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });
}
