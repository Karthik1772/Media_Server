import type { Cue } from "@/lib/types";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

function toSeconds(s: string): number {
  const m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
  return m ? Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, "0")) / 1000 : NaN;
}

/** Parses WebVTT *and* SRT (the comma in 00:00:01,000 is accepted). */
export function parseCues(text: string): Cue[] {
  const out: Cue[] = [];
  text
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .forEach((block) => {
      const lines = block.split("\n");
      const k = lines.findIndex((l) => l.includes("-->"));
      if (k < 0) return;
      const [a, b] = lines[k].split("-->");
      const s = toSeconds(a);
      const e = toSeconds(b);
      if (isNaN(s) || isNaN(e)) return;
      const h = escapeHtml(lines.slice(k + 1).join("\n"))
        .replace(/&lt;(\/?)(i|b|u)&gt;/gi, "<$1$2>") // keep only simple styling
        .replace(/&lt;[^&]*?&gt;/g, "")
        .replace(/\{\\[^}]*\}/g, "")
        .trim()
        .replace(/\n/g, "<br>");
      if (h) out.push({ s, e, h });
    });
  return out.sort((x, y) => x.s - y.s);
}

/** .srt files are often not UTF-8 (Windows-1252, UTF-16): try them in turn. */
export function decodeSubtitleBytes(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf);
  if (u[0] === 0xff && u[1] === 0xfe) return new TextDecoder("utf-16le").decode(u);
  if (u[0] === 0xfe && u[1] === 0xff) return new TextDecoder("utf-16be").decode(u);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(u);
  } catch {
    return new TextDecoder("windows-1252").decode(u);
  }
}
