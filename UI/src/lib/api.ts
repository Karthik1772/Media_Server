import { DirectoryResponse, TracksResponse, PosterSearchResponse } from "./types";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:2904";

export function resolveServerUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/")) {
    return `${BACKEND_URL}${path}`;
  }
  return `${BACKEND_URL}/${path}`;
}

export async function fetchDirectory(path: string = "/"): Promise<DirectoryResponse> {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${BACKEND_URL}/__api/browse?path=${encodeURIComponent(cleanPath)}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to browse directory (${res.status} ${res.statusText})`);
  }

  return res.json();
}

export async function fetchTracks(videoKey: string): Promise<TracksResponse> {
  const url = `${BACKEND_URL}/__api/tracks?key=${encodeURIComponent(videoKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Failed to load tracks");
  }
  return res.json();
}

export function getSubtitleUrl(videoKey: string, subtitleId: string): string {
  return `${BACKEND_URL}/__api/subtitle?key=${encodeURIComponent(videoKey)}&id=${encodeURIComponent(subtitleId)}`;
}

export async function prepareAudioTrack(videoKey: string, trackIndex: number): Promise<{ ready: boolean; url?: string }> {
  const url = `${BACKEND_URL}/__api/audio-prepare?key=${encodeURIComponent(videoKey)}&a=${trackIndex}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Failed to prepare audio track");
  }
  return res.json();
}

export async function searchPosters(query: string, year?: string, kind?: string): Promise<PosterSearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (year) params.append("year", year);
  if (kind) params.append("kind", kind);

  const url = `${BACKEND_URL}/__api/poster-search?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to search posters");
  }
  return res.json();
}

export async function applyPoster(payload: {
  action: "select" | "link" | "reset";
  video_key: string;
  candidate_id?: string;
  link?: string;
  title?: string;
}): Promise<{ ok: boolean; poster: string }> {
  const url = `${BACKEND_URL}/__api/poster-select`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to apply poster");
  }
  return res.json();
}

