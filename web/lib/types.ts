export type Kind = "video" | "image" | "audio" | "file";

/** One entry of the folder listing the server embeds in the page. */
export interface Item {
  name: string;
  url: string;
  dir: boolean;
  size: number;
  mtime: number;
  kind?: Kind;
  key?: string;
  count?: number; // folders: number of entries
  poster?: string; // video poster / preview frame
  thumb?: string; // image thumbnail
  view?: string; // lighter 1600px copy of a photo
  heic?: boolean;
  capture?: boolean; // the browser should grab a preview frame
  scope?: string; // "poster" for movie folders
  hint?: string; // "tv" | "movie"
  mediaMode?: "video" | "photo" | "mixed" | "collections";
  mediaCounts?: { photos: number; videos: number };
  nestedFolders?: number;
  folderPreview?: string;
  scanTruncated?: boolean;
  q_year?: string | number;
  q_title?: string;
}

export interface LibraryData {
  path: string;
  items: Item[];
  app?: string;
  mediaMode?: "video" | "photo" | "mixed" | "collections";
  mediaCounts?: { photos: number; videos: number; audio?: number; other?: number; subfolders?: number; directPhotos?: number; directVideos?: number; directAudio?: number; directOther?: number };
  scanTruncated?: boolean;
}

export type SortKey = "name" | "date" | "size";
export type ViewMode = "grid" | "list";

export interface AudioTrack {
  i: number;
  label: string;
  lang?: string;
  codec?: string;
}

export interface SubTrack {
  id: string;
  label: string;
  lang?: string;
  ok: boolean;
  default?: boolean;
  forced?: boolean;
}

export interface Tracks {
  ffmpeg: boolean;
  audio: AudioTrack[];
  subs: SubTrack[];
}

export interface Cue {
  s: number;
  e: number;
  h: string; // already-escaped HTML (only <i>, <b>, <u> and <br> survive)
}

export interface LocalSub {
  id: string;
  name: string;
  text: string;
  cues: Cue[];
}
