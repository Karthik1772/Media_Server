import { useCallback, useEffect, useState } from "react";
import { store } from "@/lib/store";
import { reducedMotion } from "@/lib/motion";

export type Theme = "dark" | "light";

const current = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

function apply(next: Theme, persist: boolean) {
  document.documentElement.dataset.theme = next;
  if (persist) store.set("theme", next);
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = next === "dark" ? "#0d1014" : "#f3f5f8";
}

/** Light / dark theme with a short, low-key color transition. */
export function useThemeViewModel() {
  const [theme, setTheme] = useState<Theme>(current);

  // keep the browser's theme-color in step on first load, and follow the system until the user picks
  useEffect(() => {
    apply(current(), false);
    const mq = matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (store.get<string | null>("theme", null)) return;
      const next: Theme = mq.matches ? "light" : "dark";
      apply(next, false);
      setTheme(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback((button: HTMLElement | null) => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    const commit = () => {
      apply(next, true);
      setTheme(next);
    };
    if (reducedMotion()) return commit();
    const root = document.documentElement;
    root.classList.add("theme-anim");
    commit();
    window.setTimeout(() => root.classList.remove("theme-anim"), 260);
  }, []);

  return { theme, toggle };
}
