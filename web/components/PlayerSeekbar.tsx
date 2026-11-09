import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { clamp, safeTime } from "@/lib/format";

interface Props {
  video: RefObject<HTMLVideoElement | null>;
  scrubbing: MutableRefObject<boolean>;
  onSeek: (t: number) => void;
  /** called when dragging starts/stops so the controls don't auto-hide mid-drag */
  onScrub: (on: boolean) => void;
}

const tm = "min-w-11 text-[12.5px] text-[#e6e6ef] tabular-nums";

/**
 * Time + seek bar + duration. It listens to the <video> itself, so only this small
 * component re-renders while the time ticks.
 */
export function Seekbar({ video, scrubbing, onSeek, onScrub }: Props) {
  const [t, setT] = useState(0);
  const [d, setD] = useState(NaN);
  const [buf, setBuf] = useState(0);
  const [drag, setDrag] = useState(false);
  const [tip, setTip] = useState<{ f: number; text: string } | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const dragT = useRef(0);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const readBuf = () => {
      const dur = v.duration;
      let end = 0;
      if (isFinite(dur) && dur > 0) {
        for (let i = 0; i < v.buffered.length; i++) {
          if (v.buffered.start(i) <= v.currentTime + 0.5 && v.buffered.end(i) > end) end = v.buffered.end(i);
        }
        end = clamp(end / dur, 0, 1);
      }
      setBuf(end);
    };
    const onTime = () => {
      if (!scrubbing.current) setT(v.currentTime);
      readBuf();
    };
    const onDur = () => setD(v.duration);
    const evs: [string, () => void][] = [
      ["timeupdate", onTime],
      ["seeking", onTime],
      ["seeked", onTime],
      ["progress", readBuf],
      ["durationchange", onDur],
      ["loadedmetadata", onDur],
    ];
    evs.forEach(([n, f]) => v.addEventListener(n, f));
    onDur();
    onTime();
    return () => evs.forEach(([n, f]) => v.removeEventListener(n, f));
  }, [video, scrubbing]);

  const frac = (e: React.PointerEvent) => {
    const r = bar.current!.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width, 0, 1);
  };
  const ok = isFinite(d) && d > 0;
  const shownT = drag ? dragT.current : t;
  const p = ok ? clamp(shownT / d, 0, 1) * 100 : 0;

  return (
    <div className="flex items-center gap-2.5">
      <span className={`${tm} text-right`}>{safeTime(shownT)}</span>
      <div
        ref={bar}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={ok ? Math.round(d) : 0}
        aria-valuenow={Math.round(shownT)}
        tabIndex={0}
        className="group/seek relative h-[30px] flex-1 cursor-pointer touch-none"
        onPointerDown={(e) => {
          if (!ok) return;
          scrubbing.current = true;
          onScrub(true);
          setDrag(true);
          e.currentTarget.setPointerCapture(e.pointerId);
          dragT.current = frac(e) * d;
          setTip({ f: frac(e), text: safeTime(dragT.current) });
        }}
        onPointerMove={(e) => {
          if (!ok) return;
          const f = frac(e);
          setTip({ f, text: safeTime(f * d) });
          if (scrubbing.current) {
            dragT.current = f * d;
            setT(f * d);
          }
        }}
        onPointerUp={(e) => {
          if (!scrubbing.current) return;
          scrubbing.current = false;
          onScrub(false);
          setDrag(false);
          onSeek(frac(e) * d);
          setT(frac(e) * d);
          if (e.pointerType !== "mouse") setTip(null);
        }}
        onPointerCancel={() => {
          scrubbing.current = false;
          onScrub(false);
          setDrag(false);
          setTip(null);
        }}
        onPointerLeave={() => {
          if (!scrubbing.current) setTip(null);
        }}
      >
        <div
          className={`absolute inset-x-0 top-1/2 overflow-hidden rounded bg-white/28 transition-[height,margin-top] duration-100 ${
            drag
              ? "-mt-[3px] h-1.5 [@media(pointer:coarse)]:-mt-1 [@media(pointer:coarse)]:h-2"
              : "-mt-0.5 h-1 group-hover/seek:-mt-[3px] group-hover/seek:h-1.5"
          }`}
        >
          <i className="absolute inset-y-0 left-0 block bg-white/38" style={{ width: buf * 100 + "%" }} />
          <i
            className="absolute inset-y-0 left-0 block bg-linear-90 from-accent to-accent2"
            style={{ width: p + "%" }}
          />
        </div>
        <i
          className={`absolute top-1/2 -mt-[7px] -ml-[7px] size-3.5 rounded-full bg-white shadow-[0_1px_4px_#0009] transition-transform duration-150 group-hover/seek:scale-100 group-focus-visible/seek:scale-100 [@media(pointer:coarse)]:scale-100 ${
            drag ? "scale-100" : "scale-0"
          }`}
          style={{ left: p + "%" }}
        />
        {tip && (
          <span
            className="pointer-events-none absolute bottom-7 -translate-x-1/2 rounded-md bg-black/90 px-2 py-[3px] text-xs whitespace-nowrap"
            style={{ left: tip.f * 100 + "%" }}
          >
            {tip.text}
          </span>
        )}
      </div>
      <span className={tm}>{safeTime(d)}</span>
    </div>
  );
}
