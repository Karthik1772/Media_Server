import { reducedMotion } from "@/lib/motion";

/* The browser-tab icon spins while anything is loading (opening a folder, audio, subtitles…). */

const keys = new Set<string>();
const fav = {
  link: document.querySelector<HTMLLinkElement>('link[rel~="icon"]'),
  img: null as HTMLImageElement | null,
  orig: "",
  timer: 0,
  a: 0,
};

// load the icon up front so the first pulse is instant
if (fav.link) {
  fav.orig = fav.link.href;
  fav.img = new Image();
  fav.img.src = fav.orig;
}

export function setBusy(key: string, on: boolean): void {
  if (on) keys.add(key);
  else keys.delete(key);
  if (keys.size) start();
  else stop();
}

function start() {
  if (fav.timer || !fav.link || !fav.img || reducedMotion()) return;
  const img = fav.img;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const cx = cv.getContext("2d");
  if (!cx) return;
  fav.timer = window.setInterval(() => {
    if (!img.complete || !img.naturalWidth || !fav.link) return;
    fav.a += 0.32;
    const size = 38 + Math.sin(fav.a * 1.4) * 3;
    cx.clearRect(0, 0, 64, 64);
    cx.drawImage(img, 32 - size / 2, 32 - size / 2, size, size);
    cx.lineWidth = 5;
    cx.lineCap = "round";
    cx.strokeStyle = "#a78bfa";
    cx.beginPath();
    cx.arc(32, 32, 28, fav.a, fav.a + Math.PI * 1.2);
    cx.stroke();
    try {
      fav.link.href = cv.toDataURL("image/png");
    } catch {
      /* ignore */
    }
  }, 90);
}

function stop() {
  clearInterval(fav.timer);
  fav.timer = 0;
  if (fav.link && fav.orig) fav.link.href = fav.orig;
}
