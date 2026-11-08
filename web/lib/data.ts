import type { LibraryData } from "@/lib/types";

declare global {
  interface Window {
    __LIBRARY__?: LibraryData;
  }
}

const EMPTY: LibraryData = { path: "/", items: [] };

/** The folder listing server.py puts into the page (see app/layout.tsx). */
export function readLibraryData(): LibraryData {
  if (window.__LIBRARY__) return window.__LIBRARY__;
  try {
    return JSON.parse(document.getElementById("data")?.textContent || "") as LibraryData;
  } catch {
    return EMPTY;
  }
}
