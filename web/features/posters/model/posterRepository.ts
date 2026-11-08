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
