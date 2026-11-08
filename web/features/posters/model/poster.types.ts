export interface PosterCandidate {
  id: string;
  image_url: string;
  title: string;
  year?: string | number;
  source?: string;
  note?: string;
}

export type PosterSearchResults =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "done"; items: PosterCandidate[] };
