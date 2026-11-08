import type { Item, LocalSub, Tracks } from "@/lib/types";
import { readError, readJson } from "@/shared/api/client";
import { store } from "@/lib/store";
import { LOCAL_SUBTITLE_INDEX_KEY, LOCAL_SUBTITLE_MAX_CHARS, LOCAL_SUBTITLE_VIDEO_LIMIT } from "@/features/player/model/player.constants";
import { localSubtitleStorageKey } from "@/features/player/model/player.utils";
import { parseCues } from "@/lib/srt";

/** Data access for the existing Python media API. Endpoint paths and payloads are unchanged. */
export async function fetchSubtitle(key: string, id: string): Promise<string> {
  const response = await fetch(`/__api/subtitle?key=${encodeURIComponent(key)}&id=${encodeURIComponent(id)}`);
  if (!response.ok) throw await readError(response, "Couldn't load that subtitle");
  return response.text();
}

export async function prepareAudio(key: string, index: number): Promise<{ status: string; url?: string; progress?: number; error?: string }> {
  const response = await fetch(`/__api/audio-prepare?key=${encodeURIComponent(key)}&a=${index}`);
  const result = await readJson<{ status: string; url?: string; progress?: number; error?: string }>(response);
  if (!response.ok) throw new Error(result.error || "Couldn't prepare that audio track");
  return result;
}

export async function fetchTracks(key: string): Promise<Tracks> {
  const response = await fetch("/__api/tracks?key=" + encodeURIComponent(key));
  const result = await readJson<Tracks & { error?: string }>(response);
  if (!response.ok) throw new Error(result.error || "Couldn't load media tracks");
  return result;
}


/** Persists device-selected subtitle files using Streamly's existing localStorage format. */
export function saveLocalSubtitles(item: Item, subtitles: LocalSub[]): void {
  const stored = subtitles
    .filter((subtitle) => subtitle.text.length <= LOCAL_SUBTITLE_MAX_CHARS)
    .map((subtitle) => ({ n: subtitle.name, t: subtitle.text }));
  const index = store.get<string[]>(LOCAL_SUBTITLE_INDEX_KEY, []).filter((key) => key !== item.url);
  if (stored.length) {
    store.set(localSubtitleStorageKey(item), stored);
    index.push(item.url);
  } else {
    store.remove(localSubtitleStorageKey(item));
  }
  while (index.length > LOCAL_SUBTITLE_VIDEO_LIMIT) store.remove("lsub:" + index.shift());
  store.set(LOCAL_SUBTITLE_INDEX_KEY, index);
}

/** Restores device-selected subtitle files without changing their stored representation. */
export function loadLocalSubtitles(item: Item): LocalSub[] {
  const restored: LocalSub[] = [];
  const saved = store.get<{ n: string; t: string }[]>(localSubtitleStorageKey(item), []) || [];
  saved.forEach((entry) => {
    if (!entry || typeof entry.t !== "string") return;
    const cues = parseCues(entry.t);
    if (cues.length) restored.push({ id: "L:" + entry.n, name: entry.n, text: entry.t, cues });
  });
  return restored;
}
