export interface FileItem {
  name: string;
  dir: boolean;
  kind: "folder" | "video" | "image" | "audio" | "file";
  size: number;
  mtime: number;
  count: number;
  url: string;
  poster?: string;
  thumb?: string;
  view?: string;
  year?: string;
  title?: string;
  scope?: string;
  q_title?: string;
  q_year?: string;
  hint?: string;
}

export interface DirectoryListing {
  path: string;
  items: FileItem[];
  app?: string;
}
