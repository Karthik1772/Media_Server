import type { AudioTrack } from "@/lib/types";

const NO_NATIVE = new Set(["dts", "truehd", "mlp", "dca"]);

/** True when this browser can't decode the track itself (AC3 / DTS …): the server converts it once. */
export function needsConv(a?: AudioTrack): boolean {
  if (!a) return false;
  if (a.codec && NO_NATIVE.has(a.codec)) return true;
  const mime = (
    {
      ac3: 'audio/mp4; codecs="ac-3"',
      eac3: 'audio/mp4; codecs="ec-3"',
    } as Record<string, string>
  )[a.codec || ""];
  return !!mime && !document.createElement("audio").canPlayType(mime);
}

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
export const SUB_COLORS = ["#ffffff", "#ffe066", "#7be0ff", "#9dff8a"];
export const FITS = [
  ["contain", "Fit", "Whole picture, bars if the shape differs"],
  ["cover", "Fill", "Fills the screen, crops the edges"],
  ["fill", "Stretch", "Fills the screen, picture is stretched"],
  ["none", "100%", "Original pixel size"],
] as const;

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 5;
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5]; // for the + / - keys and trackpad pinch
