import { reducedMotion } from "@/lib/motion";

/** Soft press-ripple for any element with a `data-ripple` attribute. Installed once. */
export function installRipple(): () => void {
  const onDown = (e: PointerEvent) => {
    if (reducedMotion() || !(e.target instanceof Element)) return;
    const b = e.target.closest<HTMLElement>("[data-ripple]");
    if (!b || (b as HTMLButtonElement).disabled) return;
    const r = b.getBoundingClientRect();
    if (getComputedStyle(b).position === "static") b.style.position = "relative";
    b.style.overflow = "hidden";
    const d = Math.max(r.width, r.height) * 2;
    const rip = document.createElement("span");
    rip.className = "rip";
    rip.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    b.appendChild(rip);
    setTimeout(() => rip.remove(), 600);
  };
  addEventListener("pointerdown", onDown);
  return () => removeEventListener("pointerdown", onDown);
}
