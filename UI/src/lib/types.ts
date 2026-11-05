export type MediaKind = "folder" | "video" | "image" | "audio" | "file";

export interface MediaItem {
  name: string;
  dir: boolean;
  kind: MediaKind;
  size: number;
  mtime: number;
  count?: number;
  url: string;
  key?: string;
  poster?: string;
  backdrop?: string;
  thumb?: string;
  preview?: string;
  title?: string;
  year?: string;
}

export interface DirectoryResponse {
  path: string;
  items: MediaItem[];
  app: string;
}

export interface AudioTrack {
  index: number;
  lang: string;
  codec: string;
  channels: number;
  channels_label?: string;
  label: string;
  default?: boolean;
  ready?: boolean;
  url?: string;
}

export interface SubtitleTrack {
  id: string;
  lang: string;
  label: string;
  default?: boolean;
  external?: boolean;
  codec?: string;
}

export interface TracksResponse {
  audio: AudioTrack[];
  subtitles: SubtitleTrack[];
}

export interface PosterCandidate {
  id: string;
  title: string;
  year: string;
  url: string;
  source: "tmdb" | "wikipedia";
  kind?: "movie" | "tv";
}

export interface PosterSearchResponse {
  results?: PosterCandidate[];
  error?: string;
}

export interface PlaybackState {
  time: number;
  duration: number;
  percentage: number;
  updatedAt: number;
}

