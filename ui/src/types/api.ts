export interface FileItem {
  name: string;
  dir: boolean;
  kind: 'folder' | 'video' | 'image' | 'audio' | 'file';
  size: number;
  mtime: number;
  count: number;
  url: string;
}

export interface DirectoryListing {
  path: string;
  items: FileItem[];
}

