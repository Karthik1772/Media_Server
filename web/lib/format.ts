import type { Item } from "@/lib/types";
import { store } from "@/lib/store";

export const nat = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function fmtSize(n: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < 4) {
    n /= 1024;
    i++;
  }
  return (i ? n.toFixed(1) : String(n)) + " " + units[i];
}

export const fmtDate = (t: number): string =>
  new Date(t * 1000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export function fmtTime(s: number): string {
  s = Math.floor(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0");
}

/** "0:00" for anything that isn't a finite time (e.g. a video that hasn't loaded). */
export const safeTime = (t: number): string => (isFinite(t) ? fmtTime(Math.max(0, t)) : "0:00");

export function hue(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export const pretty = (it: Item): string => (it.dir ? it.name : it.name.replace(/\.[^.]+$/, "").replace(/[._]+/g, " "));

export const ext = (it: Item): string =>
  it.name.includes(".") ? (it.name.split(".").pop() as string).toUpperCase().slice(0, 5) : "";

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ---- saved watch position ---- */
export const posKey = (it: Item): string => "pos:" + location.pathname + it.url;

export interface SavedPos {
  t: number;
  d: number;
}

export function progress(it: Item): number {
  const s = store.get<SavedPos | null>(posKey(it), null);
  return s && s.d ? Math.min(100, Math.round((s.t * 100) / s.d)) : 0;
}
