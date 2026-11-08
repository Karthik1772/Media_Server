import { useCallback, useRef, useState } from "react";

/**
 * useState + a ref that is always current. The ref lets timers, async code and media-event
 * handlers read the latest value without being re-created on every render.
 */
export function useStateRef<T>(initial: T | (() => T)) {
  const [value, setValue] = useState<T>(initial);
  const ref = useRef<T>(value);
  const set = useCallback((next: T | ((prev: T) => T)) => {
    const nv = typeof next === "function" ? (next as (p: T) => T)(ref.current) : next;
    ref.current = nv;
    setValue(nv);
  }, []);
  return [value, set, ref] as const;
}
