import { useSyncExternalStore } from "react";

/* One toast at a time: `toast("Saved")` slides in, then out after ~3 s.
   It's a tiny store, so it works from components, hooks and plain functions alike. */

export interface ToastState {
  id: number;
  message: string;
  leaving: boolean;
}

let current: ToastState | null = null;
let seq = 0;
let timer = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string): void {
  clearTimeout(timer);
  current = { id: ++seq, message, leaving: false };
  emit();
  timer = window.setTimeout(() => {
    if (current) current = { ...current, leaving: true };
    emit();
    timer = window.setTimeout(() => {
      current = null;
      emit();
    }, 260);
  }, 3200);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useToast() {
  const state = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  return { toast, current: state };
}
