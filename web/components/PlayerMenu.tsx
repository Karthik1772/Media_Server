import type { CSSProperties, ReactNode } from "react";
import type { LocalSub, Tracks } from "@/lib/types";
import { needsConv, SPEEDS, SUB_COLORS } from "@/lib/player";

const Heading = ({ children }: { children: ReactNode }) => (
  <div className="px-2.5 pt-2.5 pb-1 text-[12.5px] font-semibold text-[#a3a3b8]">{children}</div>
);
const Note = ({ children }: { children: ReactNode }) => (
  <div className="px-2.5 py-2 text-[13px] leading-[1.4] text-[#a3a3b8]">{children}</div>
);

function Row({
  label,
  on,
  note,
  disabled,
  busy,
  onClick,
}: {
  label: string;
  on?: boolean;
  note?: string;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-ripple
      disabled={disabled}
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2 rounded-[9px] border-0 bg-transparent px-2.5 py-[9px] text-left text-inherit enabled:hover:bg-white/10 disabled:cursor-default disabled:opacity-45"
    >
      <span className="w-[18px] flex-none font-bold text-accent">
        {busy ? (
          <i className="inline-block size-[13px] animate-spin-mid rounded-full border-2 border-white/25 border-t-accent" />
        ) : on ? (
          "✓"
        ) : (
          ""
        )}
      </span>
      <span>{label}</span>
      {note && <small className="ml-auto pl-2 text-right text-xs whitespace-nowrap text-[#a3a3b8]">{note}</small>}
    </button>
  );
}

function Step({
  label,
  value,
  onLess,
  onMore,
}: {
  label: string;
  value: string;
  onLess: () => void;
  onMore: () => void;
}) {
  const btn = "size-[34px] cursor-pointer rounded-[9px] border-0 bg-white/12 text-lg text-white hover:bg-white/22";
  return (
    <div className="flex items-center justify-between px-2.5 py-1">
      <span>{label}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} onClick={onLess} aria-label="less">
          −
        </button>
        <output className="min-w-16 text-center tabular-nums">{value}</output>
        <button type="button" className={btn} onClick={onMore} aria-label="more">
          +
        </button>
      </div>
    </div>
  );
}

export interface MenuProps {
  kind: "tracks" | "speed";
  style: CSSProperties;
  tracks: Tracks | null;
  aIdx: number;
  sId: string;
  localSubs: LocalSub[];
  msgA: string;
  msgS: string;
  delay: number;
  subSize: number;
  subColor: string;
  rate: number;
  onAudio: (i: number) => void;
  onSub: (id: string) => void;
  onAddSub: () => void;
  onRemoveSub: () => void;
  onSpeed: (v: number) => void;
  onSize: (dir: 1 | -1) => void;
  onColor: (c: string) => void;
  onDelay: (dir: 1 | -1) => void;
}

/** The "Audio / Subtitles" and "Speed" pop-up menus. */
export function PlayerMenu(p: MenuProps) {
  const T = p.tracks;
  return (
    <div
      id="pmenu"
      style={p.style}
      className="absolute right-3 z-[7] w-[min(340px,calc(100vw-24px))] overflow-auto rounded-[14px] border border-white/12 bg-[rgba(18,18,26,.96)] p-2 text-sm text-white shadow-[0_16px_50px_rgba(0,0,0,.6)] backdrop-blur-[14px]"
    >
      {p.kind === "speed" ? (
        <>
          <Heading>Playback speed</Heading>
          {SPEEDS.map((v) => (
            <Row
              key={v}
              label={v + "×" + (v === 1 ? " (normal)" : "")}
              on={p.rate === v}
              onClick={() => p.onSpeed(v)}
            />
          ))}
        </>
      ) : (
        <>
          <Heading>Audio</Heading>
          {!T ? (
            <Note>Looking for tracks…</Note>
          ) : !T.audio.length ? (
            <Note>
              {T.ffmpeg
                ? "No separate audio tracks found."
                : "Switching audio needs ffmpeg and ffprobe installed on the PC running the server."}
            </Note>
          ) : (
            T.audio.map((a) => {
              const conv = a.i !== 0 || needsConv(a);
              return (
                <Row
                  key={a.i}
                  label={a.label}
                  on={p.aIdx === a.i}
                  note={conv && p.aIdx !== a.i ? "converts once" : ""}
                  busy={p.aIdx === a.i && !!p.msgA}
                  onClick={() => p.onAudio(a.i)}
                />
              );
            })
          )}

          <Heading>Subtitles</Heading>
          <Row label="Off" on={p.sId === ""} onClick={() => p.onSub("")} />
          {(T?.subs || []).map((s) => (
            <Row
              key={s.id}
              label={s.label}
              on={p.sId === s.id}
              note={s.ok ? (s.default ? "default" : "") : "image-based"}
              disabled={!s.ok}
              busy={p.sId === s.id && !!p.msgS}
              onClick={() => p.onSub(s.id)}
            />
          ))}
          {p.localSubs.map((s) => (
            <Row key={s.id} label={s.name} on={p.sId === s.id} note="this device" onClick={() => p.onSub(s.id)} />
          ))}
          {T && !T.subs.length && !p.localSubs.length && (
            <Note>No subtitles found next to the video. Add one from this device below.</Note>
          )}
          <Row label="Add subtitle file (.srt / .vtt)…" busy={!!p.msgS && !p.sId} onClick={p.onAddSub} />
          {p.localSubs.some((x) => x.id === p.sId) && <Row label="Remove this subtitle file" onClick={p.onRemoveSub} />}

          <Heading>Subtitle style</Heading>
          <Step label="Size" value={p.subSize + "%"} onLess={() => p.onSize(-1)} onMore={() => p.onSize(1)} />
          <Step
            label="Delay"
            value={(p.delay > 0 ? "+" : "") + p.delay.toFixed(1) + " s"}
            onLess={() => p.onDelay(-1)}
            onMore={() => p.onDelay(1)}
          />
          <div className="flex gap-2.5 px-2.5 pt-1.5 pb-2">
            {SUB_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={"Subtitle colour " + c}
                onClick={() => p.onColor(c)}
                className={`size-7 cursor-pointer rounded-full border-2 ${
                  c === p.subColor ? "border-white shadow-[0_0_0_2px_var(--accent2)]" : "border-white/30"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
