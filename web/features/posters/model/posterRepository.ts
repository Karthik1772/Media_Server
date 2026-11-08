import type { PosterCandidate } from "@/features/posters/model/poster.types";

export async function searchPosters(query: string, year: string, kind: string): Promise<PosterCandidate[]> {
  const url = "/__api/poster-search?" + new URLSearchParams({ q: query, year, kind });
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Poster search failed");
  return data.results || [];
}

export async function savePoster(payload: Record<string, unknown>): Promise<{ poster?: string }> {
  const response = await fetch("/__api/poster-select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "Could not save poster.");
  return result;
}

/** Poster editing is limited to videos smaller than this (the server enforces the same limit). */
export const POSTER_EDIT_MAX_BYTES = 200 * 1024 * 1024;
export const POSTER_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/** Send a picture from the user's device as the poster. */
export async function uploadPoster(videoKey: string, file: Blob, title: string): Promise<{ poster?: string }> {
  const query = new URLSearchParams({ key: videoKey, title });
  const response = await fetch("/__api/poster-upload?" + query, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "Could not upload the picture.");
  return result;
}
