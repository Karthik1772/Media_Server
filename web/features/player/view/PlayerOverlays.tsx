import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/features/player/view/PlayerIcons";
import { clamp } from "@/lib/format";

/** Centre pop-up for gestures and shortcuts ("+10 s", "Volume 40%"…). */
export function Hud({ big, small, bar }: { big: string; small?: string; bar?: number }) {
  return (
    <div className="pointer-events-none absolute top-[40%] left-1/2 z-[4] min-w-32 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-black/75 px-[22px] py-3.5 text-center">
      <b className="block text-[22px] tabular-nums">{big}</b>
      {small && <span className="mt-0.5 block text-[13px] text-[#c9c9d6] tabular-nums">{small}</span>}
      {bar !== undefined && (
        <em className="mt-2.5 block h-1 overflow-hidden rounded bg-white/25">
          <i
            className="block h-full bg-linear-90 from-accent to-accent2"
            style={{ width: clamp(bar, 0, 1) * 100 + "%" }}
          />
        </em>
      )}
    </div>
  );
}

/** Play / pause icon that pops in the middle of the picture. */
export function PopIcon({ kind }: { kind: "play" | "pause" }) {
  return (
    <div className="pointer-events-none absolute top-[45%] left-1/2 z-[4] -mt-[43px] -ml-[43px] grid size-[86px] animate-pfx place-items-center rounded-full bg-black/55 text-white">
      <Icon name={kind} className="size-10" />
    </div>
  );
}

/** Double-tap skip: a ripple on that side with the seconds adding up. */
export function SkipFx({ dir, acc }: { dir: -1 | 1; acc: number }) {
  return (
    <div
      className={`pointer-events-none absolute inset-y-0 z-[3] grid w-[36%] animate-skip place-items-center bg-black/40 text-center text-white [text-shadow:0_1px_4px_#000] ${
        dir < 0 ? "left-0 rounded-r-[60%_50%]" : "right-0 rounded-l-[60%_50%]"
      }`}
    >
      <span className="flex flex-col items-center gap-1.5 text-sm">
        <i className="animate-chev text-base tracking-[-1px] not-italic">{dir < 0 ? "◀◀" : "▶▶"}</i>
        <b>{acc} seconds</b>
      </span>
    </div>
  );
}

/** "Resumed from 42:10" with a Start over button. */
export function ResumeCard({ text, out, onStartOver }: { text: string; out: boolean; onStartOver: () => void }) {
  return (
    <div
      className={`absolute left-1/2 z-[6] flex max-w-[calc(100%-24px)] items-center gap-3 rounded-full border border-white/15 bg-black/85 py-[7px] pr-2 pl-4 text-[13px] whitespace-nowrap max-[520px]:max-w-[calc(100%-24px)] ${
        out ? "animate-slide-up" : "animate-slide-down"
      }`}
      style={{ top: "calc(108px + env(safe-area-inset-top))", translate: "-50% 0" }}
    >
      <span>{text}</span>
      <button
        type="button"
        data-ripple
        onClick={onStartOver}
        className="cursor-pointer rounded-full border-0 bg-linear-135 from-accent to-accent2 px-[13px] py-1.5 font-semibold text-white"
      >
        Start over
      </button>
    </div>
  );
}

/** Next episode: a 5-second countdown ring with Play now / Cancel. */
export function NextUp({ title, onGo, onCancel }: { title: string; onGo: () => void; onCancel: () => void }) {
  const [n, setN] = useState(5);

  useEffect(() => {
    const id = setInterval(() => setN((v) => v - 1), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (n <= 0) onGo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  return (
    <div
      className="absolute right-4 left-3 z-[7] flex animate-nu-in items-center gap-3 rounded-2xl border border-white/15 bg-[rgba(12,10,28,.92)] px-3.5 py-3 shadow-[0_12px_40px_rgba(0,0,0,.55)] min-[521px]:left-auto min-[521px]:max-w-[min(420px,calc(100%-32px))]"
      style={{ bottom: "calc(150px + env(safe-area-inset-bottom))" }}
    >
      <div className="relative size-11 flex-none">
        <svg viewBox="0 0 44 44" className="size-full -rotate-90">
          <circle cx="22" cy="22" r="18" fill="none" strokeWidth="4" className="stroke-white/15" />
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="113.1"
            strokeDashoffset="0"
            className="animate-nu-ring stroke-accent2"
          />
        </svg>
        <b className="absolute inset-0 grid place-items-center text-[15px]">{Math.max(n, 0)}</b>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <small className="text-[11px] tracking-[.08em] uppercase opacity-65">Up next</small>
        <span className="truncate text-sm font-semibold">{title}</span>
      </div>
      <button
        type="button"
        data-ripple
        onClick={onGo}
        className="flex-none cursor-pointer rounded-full border-0 bg-linear-135 from-accent to-accent2 px-3.5 py-2 font-semibold text-white"
      >
        Play now
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel"
        className="size-[30px] flex-none cursor-pointer rounded-full border-0 bg-white/12 text-white"
      >
        &#10005;
      </button>
    </div>
  );
}

/** Spinner shown while a movie loads or buffers. */
export function Spinner({ text }: { text: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[3] flex animate-fade-in flex-col items-center justify-center gap-3.5 bg-[radial-gradient(circle_at_center,rgba(0,0,0,.35),transparent_60%)]">
      <i className="size-[54px] animate-spin-fast rounded-full border-4 border-white/18 border-t-accent border-r-accent2 shadow-[0_0_22px_rgba(124,92,255,.45)]" />
      {text && (
        <span className="animate-pulse-soft text-sm tracking-[.02em] text-white [text-shadow:0_1px_4px_#000]">
          {text}
        </span>
      )}
    </div>
  );
}

/** Status chip (subtitles / audio): spinner + progress bar. */
export function StatusChip({ text, pct }: { text: string; pct: number | null }) {
  return (
    <div
      className="absolute left-1/2 z-[6] flex max-w-[90vw] animate-chip-in items-center gap-[9px] overflow-hidden rounded-full bg-black/80 px-[15px] py-[7px] text-center text-[13px]"
      style={{ top: "calc(62px + env(safe-area-inset-top))", transform: "translateX(-50%)" }}
    >
      <i className="inline-block size-3.5 flex-none animate-spin-mid rounded-full border-2 border-white/25 border-t-accent" />
      <span>{text}</span>
      <em className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden bg-white/12">
        <i
          className={`block h-full bg-linear-90 from-accent to-accent2 ${
            pct === null ? "w-2/5 animate-slide" : "transition-[width] duration-200"
          }`}
          style={pct === null ? undefined : { width: pct + "%" }}
        />
      </em>
    </div>
  );
}

export function PlayerButton({
  children,
  big,
  txt,
  on,
  className = "",
  ...rest
}: {
  children: ReactNode;
  big?: boolean;
  txt?: boolean;
  on?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      data-ripple
      {...rest}
      className={`inline-grid flex-none cursor-pointer place-items-center border-0 p-0 font-[inherit] text-white transition-transform duration-150 active:scale-90 disabled:cursor-default disabled:bg-none disabled:opacity-30 ${
        big
          ? "mx-1.5 size-[52px] rounded-full bg-linear-135 from-accent to-accent2 hover:brightness-110"
          : txt
            ? "h-[42px] w-auto min-w-12 rounded-[21px] px-[11px] text-sm font-semibold hover:bg-white/16"
            : "size-11 rounded-full hover:bg-white/16 min-[641px]:size-[42px]"
      } ${on ? "bg-accent2/55" : !big ? "bg-transparent" : ""} ${className}`}
    >
      {children}
    </button>
  );
}
