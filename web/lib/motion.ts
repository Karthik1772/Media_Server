export const reducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** next.config.js serves the app (and everything in public/) under this path. */
export const BASE_PATH = "/__ui";

/** URL of a file in public/img. */
export const asset = (name: string): string => `${BASE_PATH}/img/${name}`;
