import type { Item } from "@/lib/types";
import { store } from "@/lib/store";
import { PLAYER_TRACK_PREFERENCE_KEY } from "@/features/player/model/player.constants";

export interface TrackLanguagePreferences {
  a: string;
  s: string | null;
}

export const trackStorageKey = (item: Item, pathname = location.pathname) => "trk2:" + pathname + item.url;
export const localSubtitleStorageKey = (item: Item) => "lsub:" + item.url;
export const readTrackLanguagePreferences = () =>
  store.get<TrackLanguagePreferences>(PLAYER_TRACK_PREFERENCE_KEY, { a: "", s: null });

export function getFullscreenElement() {
  return document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
}

export function copyText(text: string): boolean {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      void navigator.clipboard.writeText(text);
      return true;
    }
    const element = document.createElement("textarea");
    element.value = text;
    element.style.position = "fixed";
    element.style.opacity = "0";
    document.body.appendChild(element);
    element.select();
    const copied = document.execCommand("copy");
    element.remove();
    return copied;
  } catch {
    return false;
  }
}
