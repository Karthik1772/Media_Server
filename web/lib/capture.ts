import type { Item } from "@/lib/types";

/* Preview frames for videos the server couldn't make one for (no ffmpeg).
   The browser grabs one frame per small video, once, and uploads it - after that
   the server serves it as a cached image. */

const queue: Item[] = [];
const seen = new Set<string>();
let active = 0;
let onPoster: (it: Item, url: string) => void = () => {};

export function queueCapture(it: Item, cb: (it: Item, url: string) => void): void {
  if (!it.capture || !it.key || seen.has(it.key)) return;
  onPoster = cb;
  seen.add(it.key);
  queue.push(it);
  pump();
}

function pump() {
  while (active < 2 && queue.length) {
    const it = queue.shift() as Item;
    active++;
    captureFrame(it).finally(() => {
      active--;
      pump();
    });
  }
}

function captureFrame(it: Item): Promise<void> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "metadata";
    let finished = false;
    let timer = 0;

    const finish = async (blob: Blob | null, report = true) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      v.removeAttribute("src");
      v.load();
      try {
        if (blob) {
          const r = await fetch("/__api/thumb?key=" + encodeURIComponent(it.key!), {
            method: "POST",
            headers: { "Content-Type": "image/jpeg" },
            body: blob,
          });
          const j = await r.json();
          if (j.ok && j.poster) onPoster(it, j.poster);
        } else if (report) {
          // this browser can't decode it: remember that so we don't try again
          await fetch("/__api/thumb?failed=1&key=" + encodeURIComponent(it.key!), {
            method: "POST",
          });
        }
      } catch {
        /* ignore */
      }
      resolve();
    };

    timer = window.setTimeout(() => finish(null, false), 25000);
    v.addEventListener("error", () => finish(null));
    v.addEventListener("loadedmetadata", () => {
      try {
        v.currentTime = Math.min(1, (v.duration || 2) / 2);
      } catch {
        finish(null);
      }
    });
    v.addEventListener("seeked", () => {
      try {
        const w = 360;
        const h = Math.max(1, Math.round((w * (v.videoHeight || 9)) / (v.videoWidth || 16)));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d")!.drawImage(v, 0, 0, w, h);
        c.toBlob((b) => finish(b), "image/jpeg", 0.72);
      } catch {
        finish(null);
      }
    });
    v.src = it.url;
  });
}
