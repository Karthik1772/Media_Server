import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { store } from "@/lib/store";
import { reducedMotion } from "@/lib/motion";

export type Theme = "dark" | "light";

const current = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

function apply(next: Theme, persist: boolean) {
  document.documentElement.dataset.theme = next;
  if (persist) store.set("theme", next);
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = next === "dark" ? "#0b0b10" : "#f4f4f8";
}

/** Light / dark theme. The toggle wipes across the screen from the button (View Transitions API). */
export function useTheme() {
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
    if (!document.startViewTransition) {
      // older browsers: colours fade instead of the wipe
      const root = document.documentElement;
      root.classList.add("theme-anim");
      commit();
      setTimeout(() => root.classList.remove("theme-anim"), 500);
      return;
    }
    const r = (button || document.body).getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = document.startViewTransition(() => flushSync(commit));
    vt.ready
      .then(() =>
        document.documentElement.animate(
          {
            clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`],
          },
          {
            duration: 600,
            easing: "ease-in-out",
            pseudoElement: "::view-transition-new(root)",
          },
        ),
      )
      .catch(() => {});
  }, []);

  return { theme, toggle };
}
