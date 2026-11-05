export interface FileItem {
  name: string;
  dir: boolean;
  kind: 'folder' | 'video' | 'image' | 'audio' | 'file';
  size: number;
  mtime: number;
  count: number;
  url: string;
  // Optional metadata supplied by the Python poster/thumbnail service.
  key?: string;
  scope?: "poster" | "preview" | "none";
  poster?: string;
  capture?: boolean;
  big?: boolean;
  hint?: string;
  q_title?: string;
  q_year?: string;
  thumb?: string;
  view?: string;
  heic?: boolean;
}

export interface DirectoryListing {
  path: string;
  items: FileItem[];
  app?: string;
  /** Label of the shared root, e.g. "E:" */
  root?: string;
}
