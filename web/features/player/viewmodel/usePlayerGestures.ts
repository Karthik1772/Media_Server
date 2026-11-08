import type { MutableRefObject, PointerEvent as ReactPointerEvent, RefObject } from "react";
import { clamp, safeTime } from "@/lib/format";
import type { PlayerGestureState, PlayerPinchState, PlayerPreferences } from "@/features/player/model/player.types";

interface RuntimeGestureState {
  lastTap: number;
  bright: number;
  zoom: { s: number; x: number; y: number };
  pinch: PlayerPinchState | null;
  gest: PlayerGestureState | null;
  t: { tap: number };
}

interface Options<T extends RuntimeGestureState> {
  runtimeRef: MutableRefObject<T>;
  pointsRef: MutableRefObject<Map<number, { x: number; y: number }>>;
  stageRef: RefObject<HTMLDivElement>;
  videoRef: RefObject<HTMLVideoElement>;
  lockedRef: MutableRefObject<boolean>;
  menuRef: MutableRefObject<"" | "tracks" | "speed">;
  preferencesRef: MutableRefObject<PlayerPreferences>;
  showUnlock: () => void;
  closeMenu: () => void;
  toggleFullscreen: () => void;
  seekBy: (seconds: number) => void;
  togglePlay: () => void;
  toggleControls: () => void;
  skipFx: (direction: -1 | 1) => void;
  setZoom: (scale: number, x: number, y: number) => void;
  zoomHud: () => void;
  showHud: (big: string, small?: string, bar?: number) => void;
  setVolume: (volume: number, muted: boolean) => void;
  saveVolume: () => void;
  seekTo: (time: number) => void;
  wake: (duration?: number) => void;
}

/** Touch/pointer interaction ViewModel for taps, seeking, brightness, volume and pinch zoom. */
export function usePlayerGestures<T extends RuntimeGestureState>(options: Options<T>) {
  const onTap = (event: ReactPointerEvent, touch: boolean) => {
    const runtime = options.runtimeRef.current;
    // Opening a player menu takes precedence over stage taps.
    if (options.menuRef.current) return options.closeMenu();
    const now = performance.now();
    const rect = options.stageRef.current!.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / rect.width;
    if (now - runtime.lastTap < 300) {
      clearTimeout(runtime.t.tap);
      runtime.lastTap = now;
      if (!touch) return options.toggleFullscreen();
      if (relativeX < 0.33) {
        options.seekBy(-10);
        options.skipFx(-1);
      } else if (relativeX > 0.67) {
        options.seekBy(10);
        options.skipFx(1);
      } else options.togglePlay();
      return;
    }
    runtime.lastTap = now;
    runtime.t.tap = window.setTimeout(() => (touch ? options.toggleControls() : options.togglePlay()), 280);
  };

  function onStageDown(event: ReactPointerEvent) {
    const runtime = options.runtimeRef.current;
    if (options.lockedRef.current) return options.showUnlock();
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.pointerType !== "mouse") {
      options.pointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (options.pointsRef.current.size === 2) {
        const [first, second] = [...options.pointsRef.current.values()];
        runtime.pinch = {
          d0: Math.hypot(first.x - second.x, first.y - second.y) || 1,
          s0: runtime.zoom.s,
          mx0: (first.x + second.x) / 2,
          my0: (first.y + second.y) / 2,
          x0: runtime.zoom.x,
          y0: runtime.zoom.y,
        };
        runtime.gest = null;
        runtime.lastTap = 0;
        clearTimeout(runtime.t.tap);
        options.closeMenu();
        return;
      }
      if (options.pointsRef.current.size > 2) return;
    }
    runtime.gest = {
      id: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType !== "mouse",
      mode: "", zx: 0, zy: 0, t0: 0, v0: 0, b0: 0,
    };
  }

  function onStageMove(event: ReactPointerEvent) {
    const runtime = options.runtimeRef.current;
    const video = options.videoRef.current!;
    if (event.pointerType === "mouse") return options.wake(4000);
    if (options.pointsRef.current.has(event.pointerId)) {
      options.pointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (runtime.pinch && options.pointsRef.current.size >= 2) {
      const [first, second] = [...options.pointsRef.current.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y) || 1;
      const scale = runtime.pinch.s0 * (distance / runtime.pinch.d0);
      options.setZoom(
        Math.abs(scale - 1) < 0.04 ? 1 : scale,
        runtime.pinch.x0 + (first.x + second.x) / 2 - runtime.pinch.mx0,
        runtime.pinch.y0 + (first.y + second.y) / 2 - runtime.pinch.my0,
      );
      options.zoomHud();
      return;
    }
    const gesture = runtime.gest;
    if (!gesture || event.pointerId !== gesture.id || options.lockedRef.current) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const rect = options.stageRef.current!.getBoundingClientRect();
    if (!gesture.mode) {
      if (Math.hypot(dx, dy) < 16) return;
      gesture.mode = runtime.zoom.s > 1 ? "pan" : Math.abs(dx) > Math.abs(dy) ? "seek" : gesture.x - rect.left < rect.width / 2 ? "bright" : "vol";
      gesture.zx = runtime.zoom.x;
      gesture.zy = runtime.zoom.y;
      gesture.t0 = video.currentTime;
      gesture.v0 = options.preferencesRef.current.volume;
      gesture.b0 = runtime.bright;
      options.closeMenu();
    }
    if (gesture.mode === "pan") {
      options.setZoom(runtime.zoom.s, gesture.zx + dx, gesture.zy + dy);
    } else if (gesture.mode === "seek") {
      if (!Number.isFinite(video.duration)) return;
      gesture.target = clamp(gesture.t0 + (dx / rect.width) * 150, 0, video.duration);
      const difference = Math.round(gesture.target - gesture.t0);
      options.showHud((difference >= 0 ? "+" : "−") + Math.abs(difference) + " s", safeTime(gesture.target));
    } else if (gesture.mode === "vol") {
      const volume = clamp(gesture.v0 - dy / (rect.height * 0.7), 0, 1);
      options.setVolume(volume, false);
      options.showHud("Volume", Math.round(volume * 100) + "%", volume);
    } else {
      runtime.bright = clamp(gesture.b0 - dy / (rect.height * 0.7), 0.25, 1.75);
      video.style.filter = runtime.bright === 1 ? "" : `brightness(${runtime.bright})`;
      options.showHud("Brightness", Math.round(runtime.bright * 100) + "%", (runtime.bright - 0.25) / 1.5);
    }
  }

  function endGesture(event: ReactPointerEvent, cancelled: boolean) {
    const runtime = options.runtimeRef.current;
    options.pointsRef.current.delete(event.pointerId);
    if (options.pointsRef.current.size < 2) runtime.pinch = null;
    const gesture = runtime.gest;
    runtime.gest = null;
    if (!gesture || event.pointerId !== gesture.id) return;
    if (gesture.mode === "seek" && !cancelled && gesture.target !== undefined) options.seekTo(gesture.target);
    if (gesture.mode === "vol") options.saveVolume();
    if (gesture.mode || cancelled || options.lockedRef.current) return;
    onTap(event, gesture.touch);
  }

  return { onStageDown, onStageMove, endGesture };
}
