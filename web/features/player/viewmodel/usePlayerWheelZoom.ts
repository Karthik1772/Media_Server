import { useEffect, type RefObject } from "react";

/** Handles trackpad pinch zoom and wheel-volume gestures over the player stage. */
export function usePlayerWheelZoom(
  stageRef: RefObject<HTMLDivElement>,
  stepZoom: (direction: number) => void,
  bumpVolume: (delta: number) => void,
) {
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    let lastWheelAt = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey) {
        const now = performance.now();
        if (now - lastWheelAt > 140) {
          lastWheelAt = now;
          stepZoom(event.deltaY < 0 ? 1 : -1);
        }
      } else {
        bumpVolume(event.deltaY < 0 ? 0.05 : -0.05);
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
    // The player stage is mounted once for the lifetime of this player session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
