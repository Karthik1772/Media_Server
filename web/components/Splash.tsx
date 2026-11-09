import { useEffect, useState } from "react";
import { asset, reducedMotion } from "@/lib/motion";

/* The splash plays only on a fresh browser session, and only when it opens on the home
   screen. Worked out once at load (not in a component) so React's double render can't
   consume the "seen" flag. */
export const showSplash: boolean = (() => {
  let seen = false;
  try {
    seen = !!sessionStorage.getItem("splashSeen");
    sessionStorage.setItem("splashSeen", "1");
  } catch {
    /* ignore */
  }
  return !seen && location.pathname === "/";
})();

export function Splash() {
  const [phase, setPhase] = useState<"show" | "out" | "gone">(showSplash ? "show" : "gone");

  // fade out, then remove - both timers are set once so the first one can't cancel the second
  useEffect(() => {
    if (!showSplash) return;
    const wait = reducedMotion() ? 500 : 1900;
    const t1 = setTimeout(() => setPhase("out"), wait);
    const t2 = setTimeout(() => setPhase("gone"), wait + 600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-200 grid place-items-center bg-[#080620] transition-[opacity,transform,visibility] duration-500 ${
        phase === "out" ? "pointer-events-none invisible scale-[1.04] opacity-0" : ""
      }`}
    >
      <div className="flex w-[min(820px,96vw)] flex-col items-center gap-1.5">
        <img
          src={asset("logo.webp")}
          alt=""
          className="block h-auto max-h-[70vh] w-full animate-splash-logo object-contain [mask-image:radial-gradient(ellipse_closest-side_at_center,#000_60%,transparent_100%)]"
        />
        <div className="h-[3px] w-[min(260px,55vw)] animate-fade-in overflow-hidden rounded-[3px] bg-white/10 [animation-delay:.5s]">
          <i className="block h-full w-2/5 animate-slide rounded-[3px] bg-linear-90 from-accent to-accent2" />
        </div>
      </div>
    </div>
  );
}
