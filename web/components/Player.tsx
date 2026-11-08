import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Cue, Item, LocalSub, Tracks } from "@/lib/types";
import { Icon } from "@/components/PlayerIcons";
import { Seekbar } from "@/components/PlayerSeekbar";
import { PlayerMenu } from "@/components/PlayerMenu";
import {
  Hud,
  NextUp,
  PlayerButton,
  PopIcon,
  ResumeCard,
  SkipFx,
  Spinner,
  StatusChip,
} from "@/components/PlayerOverlays";
import { FITS, needsConv, SPEEDS, ZOOM_MAX, ZOOM_MIN, ZOOM_STEPS } from "@/lib/player";
import { useStateRef } from "@/hooks/use-state-ref";
import { toast } from "@/hooks/use-toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { store } from "@/lib/store";
import { clamp, fmtTime, posKey, pretty, safeTime, wait, type SavedPos } from "@/lib/format";
import { decodeSubtitleBytes, parseCues } from "@/lib/srt";
import { setBusy } from "@/lib/busy";

/* The browser still decodes the video; everything you see and tap is ours - seek bar, touch
   gestures, speed, fit, lock, picture-in-picture, fullscreen and an Audio / Subtitles menu.
   Subtitles are drawn by us (so size, colour and delay can change). The default audio plays from
   the video itself; any other language is extracted once by the server and played from a hidden
   <audio> kept in sync with the muted video. */

const HIDE_MS = 10000; // controls stay 10 s after a tap, or until you tap the picture again
const PREF_KEY = "trkpref2"; // {a: audio language, s: subtitle language | "off" | null = never chosen}
const LSUB_INDEX = "lsubIdx"; // videos that have saved device subtitles, oldest first
const LSUB_VIDEOS = 15; // keep the newest 15 so localStorage never fills up
const LSUB_MAX = 400000; // characters per file that get remembered

const trkKey = (it: Item) => "trk2:" + location.pathname + it.url;
const lsubKey = (it: Item) => "lsub:" + it.url;
const getPref = () => store.get<{ a: string; s: string | null }>(PREF_KEY, { a: "", s: null });

interface Prefs {
  volume: number;
  muted: boolean;
  speed: number;
  subSize: number;
  subColor: string;
}
interface HudState {
  big: string;
  small?: string;
  bar?: number;
  n: number;
}
interface Gesture {
  id: number;
  x: number;
  y: number;
  touch: boolean;
  mode: "" | "pan" | "seek" | "bright" | "vol";
  zx: number;
  zy: number;
  t0: number;
  v0: number;
  b0: number;
  target?: number;
}
interface Pinch {
  d0: number;
  s0: number;
  mx0: number;
  my0: number;
  x0: number;
  y0: number;
}

const fsEl = () =>
  document.fullscreenElement || (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement;

function copyText(t: string): boolean {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(t);
      return true;
    }
    const a = document.createElement("textarea");
    a.value = t;
    a.style.position = "fixed";
    a.style.opacity = "0";
    document.body.appendChild(a);
    a.select();
    const ok = document.execCommand("copy");
    a.remove();
    return ok;
  } catch {
    return false;
  }
}

interface Props {
  list: Item[];
  start: number;
  onClose: () => void;
}

export function Player({ list, start, onClose }: Props) {
  /* ----- elements ----- */
  const vid = useRef<HTMLVideoElement>(null);
  const aud = useRef<HTMLAudioElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const ctrl = useRef<HTMLDivElement>(null);
  const subFile = useRef<HTMLInputElement>(null);

  /* ----- state (the *Ref twin is always current - used by timers, async code and media events) ----- */
  const [i, setI, iRef] = useStateRef(start);
  const item = list[i];
  const [prefs, setPrefs, prefsRef] = useStateRef<Prefs>(() => ({
    volume: clamp(Number(store.get("vol", 1)), 0, 1),
    muted: !!store.get("muted", false),
    speed: Number(store.get("speed", 1)) || 1,
    subSize: Number(store.get("subSize", 100)) || 100,
    subColor: store.get("subColor", "#ffffff"),
  }));
  const [paused, setPaused] = useState(true);
  const [rate, setRate] = useState(prefs.speed);
  const [fs, setFs] = useState(false);
  const [tracks, setTracks, tracksRef] = useStateRef<Tracks | null>(null);
  const [aIdx, setAIdx, aIdxRef] = useStateRef(0);
  const [sId, setSId, sIdRef] = useStateRef("");
  const [localSubs, setLocalSubs, localSubsRef] = useStateRef<LocalSub[]>([]);
  const [delay, setDelay, delayRef] = useStateRef(0);
  const [msgA, setMsgA, msgARef] = useStateRef("");
  const [msgS, setMsgS, msgSRef] = useStateRef("");
  const [menu, setMenu, menuRef] = useStateRef<"" | "tracks" | "speed">("");
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [idle, setIdle, idleRef] = useStateRef(false);
  const [locked, setLocked, lockedRef] = useStateRef(false);
  const [unlockShown, setUnlockShown] = useState(false);
  const [spin, setSpin] = useState<string | null>("Loading movie…");
  const [err, setErr] = useState("");
  const [subHtml, setSubHtml] = useState("");
  const [hud, setHudState] = useState<HudState | null>(null);
  const [pop, setPop] = useState<{ kind: "play" | "pause"; n: number } | null>(null);
  const [skip, setSkip] = useState<{ dir: -1 | 1; acc: number; n: number } | null>(null);
  const [resume, setResume] = useState<{ t: number; out: boolean } | null>(null);
  const [nextUp, setNextUp] = useState(false);

  /* ----- plain mutable bits that don't need to re-render ----- */
  const cues = useRef<Cue[]>([]);
  const scrubbing = useRef(false);
  const P = useRef({
    token: 0, // changes with every video, so late answers for an old video are ignored
    prepId: 0,
    ext: false, // true while an extracted audio track plays from the <audio> element
    extIdx: 0,
    fit: 0,
    bright: 1,
    zoom: { s: 1, x: 0, y: 0 }, // pinch zoom: scale and pan in px
    openedAt: 0,
    lastSave: 0,
    lastTap: 0,
    n: 0,
    skipAcc: 0,
    skipLast: 0,
    skipDir: 0,
    pinch: null as Pinch | null,
    gest: null as Gesture | null,
    wheelT: 0,
    t: {
      idle: 0,
      hud: 0,
      fx: 0,
      skip: 0,
      resume: 0,
      unlock: 0,
      tap: 0,
    },
  });
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const itemNow = () => list[iRef.current];
  const uid = () => ++P.current.n;

  /* ===================== HUD, pop-ups ===================== */
  const showHud = useCallback((big: string, small?: string, bar?: number) => {
    setHudState({ big, small, bar, n: ++P.current.n });
    clearTimeout(P.current.t.hud);
    P.current.t.hud = window.setTimeout(() => setHudState(null), 900);
  }, []);

  function popIcon(kind: "play" | "pause") {
    const v = vid.current;
    if (!v || v.ended || v.seeking || performance.now() - P.current.openedAt < 1500) return;
    setPop({ kind, n: uid() });
    clearTimeout(P.current.t.fx);
    P.current.t.fx = window.setTimeout(() => setPop(null), 650);
  }

  function skipFx(dir: -1 | 1) {
    const p = P.current;
    const now = performance.now();
    p.skipAcc = now - p.skipLast < 800 && dir === p.skipDir ? p.skipAcc + 10 : 10;
    p.skipLast = now;
    p.skipDir = dir;
    setSkip({ dir, acc: p.skipAcc, n: uid() });
    clearTimeout(p.t.skip);
    p.t.skip = window.setTimeout(() => setSkip(null), 780);
  }

  /* ----- resume card ----- */
  function killResume() {
    clearTimeout(P.current.t.resume);
    setResume(null);
  }
  function hideResume() {
    clearTimeout(P.current.t.resume);
    setResume((r) => (r ? { ...r, out: true } : r));
    P.current.t.resume = window.setTimeout(() => setResume(null), 320);
  }
  function resumeCard(t: number) {
    setResume({ t, out: false });
    clearTimeout(P.current.t.resume);
    P.current.t.resume = window.setTimeout(hideResume, 6500);
  }

  /* ===================== controls: idle, lock ===================== */
  function wake(ms = HIDE_MS) {
    setIdle(false);
    clearTimeout(P.current.t.idle);
    const v = vid.current;
    if (v && !v.paused && !menuRef.current && !scrubbing.current) {
      P.current.t.idle = window.setTimeout(() => setIdle(true), ms);
    }
  }

  function toggleControls() {
    if (idleRef.current || vid.current?.paused) wake();
    else {
      clearTimeout(P.current.t.idle);
      setIdle(true);
    }
  }

  function showUnlock() {
    setUnlockShown(true);
    clearTimeout(P.current.t.unlock);
    P.current.t.unlock = window.setTimeout(() => setUnlockShown(false), 3000);
  }

  function setLock(on: boolean) {
    setLocked(on);
    setUnlockShown(false);
    if (on) {
      closeMenu();
      toast("Controls locked - tap the screen, then the lock button to unlock");
    }
  }

  /* ===================== playback basics ===================== */
  function togglePlay() {
    const v = vid.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  function seekTo(t: number) {
    const v = vid.current;
    if (!v || !isFinite(v.duration)) return;
    v.currentTime = clamp(t, 0, v.duration);
  }

  function seekBy(d: number) {
    const v = vid.current;
    if (!v) return;
    seekTo(v.currentTime + d);
    showHud((d > 0 ? "+" : "−") + Math.abs(d) + " s", safeTime(v.currentTime));
  }

  /* ----- volume, speed ----- */
  function applyVolume() {
    const v = vid.current;
    const a = aud.current;
    if (!v || !a) return;
    const pr = prefsRef.current;
    const m = pr.muted || pr.volume === 0;
    if (P.current.ext) {
      v.muted = true;
      a.muted = m;
      a.volume = pr.volume;
    } else {
      v.muted = m;
      v.volume = pr.volume;
    }
  }

  useEffect(applyVolume, [prefs.volume, prefs.muted]); // eslint-disable-line react-hooks/exhaustive-deps

  function saveVol() {
    store.set("vol", prefsRef.current.volume);
    store.set("muted", prefsRef.current.muted);
  }

  function setVolume(volume: number, muted: boolean) {
    setPrefs((p) => ({ ...p, volume, muted }));
    prefsRef.current = { ...prefsRef.current, volume, muted };
    applyVolume();
    saveVol();
  }

  function toggleMute() {
    const pr = prefsRef.current;
    if (pr.muted || pr.volume === 0) setVolume(pr.volume === 0 ? 0.5 : pr.volume, false);
    else setVolume(pr.volume, true);
    const n = prefsRef.current;
    showHud(n.muted ? "Muted" : "Volume", Math.round(n.volume * 100) + "%");
  }

  function bumpVolume(d: number) {
    const volume = clamp(Math.round((prefsRef.current.volume + d) * 100) / 100, 0, 1);
    setVolume(volume, false);
    showHud("Volume", Math.round(volume * 100) + "%", volume);
  }

  function setSpeed(v: number) {
    setPrefs((p) => ({ ...p, speed: v }));
    store.set("speed", v);
    const el = vid.current;
    if (el) {
      el.defaultPlaybackRate = v;
      el.playbackRate = v;
    }
    showHud(v + "×", "Speed");
  }

  /* ----- picture fit, zoom, brightness ----- */
  function screenMatchesVideo() {
    const v = vid.current;
    const r = stage.current?.getBoundingClientRect();
    if (!v || !r || !v.videoWidth || !r.height) return false;
    return Math.abs(v.videoWidth / v.videoHeight / (r.width / r.height) - 1) < 0.04;
  }

  function setZoom(sc: number, x: number, y: number) {
    const z = P.current.zoom;
    const v = vid.current;
    z.s = clamp(sc, ZOOM_MIN, ZOOM_MAX);
    if (z.s <= 1) {
      z.x = z.y = 0; // zoomed out: nothing to pan, the picture stays centred
    } else {
      const r = stage.current!.getBoundingClientRect();
      z.x = clamp(x, (-(z.s - 1) * r.width) / 2, ((z.s - 1) * r.width) / 2);
      z.y = clamp(y, (-(z.s - 1) * r.height) / 2, ((z.s - 1) * r.height) / 2);
    }
    if (v) v.style.transform = z.s === 1 ? "" : `translate(${z.x}px, ${z.y}px) scale(${z.s})`;
  }

  const zoomHud = () =>
    showHud(
      "Zoom " + Math.round(P.current.zoom.s * 100) + "%",
      "25% – 500%  ·  Picture button resets",
      (P.current.zoom.s - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN),
    );

  // one step along 25 · 50 · 75 · 100 · 125 · 150 · 200 · 300 · 400 · 500 %
  function stepZoom(dir: number) {
    const z = P.current.zoom;
    const cur = z.s;
    const next =
      dir > 0 ? ZOOM_STEPS.find((v) => v > cur + 0.001) : [...ZOOM_STEPS].reverse().find((v) => v < cur - 0.001);
    if (next === undefined) return zoomHud();
    setZoom(next, (z.x * next) / cur, (z.y * next) / cur);
    zoomHud();
  }

  function cycleFit() {
    const p = P.current;
    p.fit = (p.fit + 1) % FITS.length;
    if (vid.current) vid.current.style.objectFit = FITS[p.fit][0];
    setZoom(1, 0, 0); // the button also undoes any pinch zoom
    const [, name, note] = FITS[p.fit];
    const same = (p.fit === 1 || p.fit === 2) && screenMatchesVideo();
    showHud(name, same ? "Video and screen have the same shape, so little changes. Pinch to zoom." : note);
  }

  /* ----- fullscreen, picture-in-picture ----- */
  const canFs = useMemo(() => {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    return !!(el.requestFullscreen || el.webkitRequestFullscreen);
  }, []);
  const canPip = useMemo(() => {
    return !!(document.pictureInPictureEnabled && HTMLVideoElement.prototype.requestPictureInPicture);
  }, []);

  function toggleFs() {
    const el = root.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> }) | null;
    const d = document as Document & { webkitExitFullscreen?: () => Promise<void> };
    let p: Promise<void> | void | undefined;
    if (fsEl()) p = (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
    else if (canFs && el) p = (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    if (p && "catch" in p) p.catch(() => {});
  }

  useEffect(() => {
    const onFs = () => {
      const on = !!fsEl();
      setFs(on);
      try {
        if (on && vid.current && vid.current.videoWidth > vid.current.videoHeight) {
          (screen.orientation as ScreenOrientation & { lock: (o: string) => Promise<void> })
            .lock("landscape")
            .catch(() => {});
        } else if (!on) screen.orientation.unlock();
      } catch {
        /* ignore */
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  }, []);

  function togglePip() {
    const v = vid.current;
    if (!v) return;
    const p = document.pictureInPictureElement ? document.exitPictureInPicture() : v.requestPictureInPicture();
    p.catch(() => toast("Picture-in-picture isn't available for this video"));
  }

  /* ===================== subtitles (drawn by us) ===================== */
  const tickSubs = useCallback(() => {
    const v = vid.current;
    let html = "";
    if (v && cues.current.length) {
      const t = v.currentTime - delayRef.current;
      html = cues.current
        .filter((c) => t >= c.s && t < c.e)
        .map((c) => c.h)
        .join("<br>");
    }
    setSubHtml(html);
  }, [delayRef]);

  useEffect(() => {
    const id = setInterval(tickSubs, 120);
    return () => clearInterval(id);
  }, [tickSubs]);

  function setMsg(which: "A" | "S", text: string) {
    (which === "A" ? setMsgA : setMsgS)(text);
  }

  useEffect(() => setBusy("msg", !!(msgA || msgS)), [msgA, msgS]);
  useEffect(() => setBusy("spin", spin !== null), [spin]);

  // only choices the user makes are saved; automatic picks are worked out again each time
  function saveTrk(what: "a" | "s") {
    const it = itemNow();
    const T = tracksRef.current;
    if (!it || !T) return;
    store.set(trkKey(it), { a: aIdxRef.current, s: sIdRef.current });
    const pref = getPref();
    if (what === "a") {
      const a = T.audio.find((x) => x.i === aIdxRef.current);
      pref.a = (a && a.lang) || "";
    } else {
      const s = T.subs.find((x) => x.id === sIdRef.current);
      pref.s = sIdRef.current ? (s && s.lang) || null : "off";
    }
    store.set(PREF_KEY, pref);
  }

  async function chooseSub(id: string, auto?: boolean) {
    const it = itemNow();
    const token = P.current.token;
    setSId(id);
    cues.current = [];
    tickSubs();
    setMsg("S", "");
    if (!auto) saveTrk("s");
    if (!id || !it) return;
    const local = localSubsRef.current.find((x) => x.id === id);
    if (local) {
      cues.current = local.cues;
      if (!auto) toast("Subtitles on");
      tickSubs();
      return;
    }
    setMsg("S", "Loading subtitles…");
    try {
      const r = await fetch(`/__api/subtitle?key=${encodeURIComponent(it.key || "")}&id=${encodeURIComponent(id)}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "Couldn't load that subtitle");
      }
      const text = await r.text();
      if (token !== P.current.token || sIdRef.current !== id) return;
      cues.current = parseCues(text);
      setMsg("S", "");
      if (!cues.current.length) toast("That subtitle file has no readable lines");
      else if (!auto) toast("Subtitles on");
      tickSubs();
    } catch (e) {
      if (token !== P.current.token || sIdRef.current !== id) return;
      setSId("");
      setMsg("S", "");
      toast((e as Error).message);
    }
  }

  /* ----- subtitle files picked on this device (.srt / .vtt) ----- */
  function addLocalSub(name: string, text: string): LocalSub | null {
    const parsed = parseCues(text);
    if (!parsed.length) return null;
    const id = "L:" + name;
    const sub: LocalSub = { id, name, text, cues: parsed };
    setLocalSubs((l) => [...l.filter((x) => x.id !== id), sub]);
    return sub;
  }

  function saveLocalSubs(it: Item) {
    const listNow = localSubsRef.current
      .filter((x) => x.text.length <= LSUB_MAX)
      .map((x) => ({ n: x.name, t: x.text }));
    const idx = store.get<string[]>(LSUB_INDEX, []).filter((k) => k !== it.url);
    if (listNow.length) {
      store.set(lsubKey(it), listNow);
      idx.push(it.url);
    } else store.remove(lsubKey(it));
    while (idx.length > LSUB_VIDEOS) store.remove("lsub:" + idx.shift());
    store.set(LSUB_INDEX, idx);
  }

  function restoreLocalSubs(it: Item) {
    const restored: LocalSub[] = [];
    (store.get<{ n: string; t: string }[]>(lsubKey(it), []) || []).forEach((x) => {
      if (!x || typeof x.t !== "string") return;
      const parsed = parseCues(x.t);
      if (parsed.length) restored.push({ id: "L:" + x.n, name: x.n, text: x.t, cues: parsed });
    });
    setLocalSubs(restored);
  }

  async function loadSubFile(file: File | undefined) {
    const it = itemNow();
    if (!file || !it) return;
    if (!/\.(srt|vtt|txt)$/i.test(file.name)) return toast("Pick an .srt or .vtt subtitle file");
    if (file.size > 3e6) return toast("That file is too big to be a subtitle");
    const token = P.current.token;
    setMsg("S", "Reading subtitle file…");
    try {
      const text = decodeSubtitleBytes(await file.arrayBuffer());
      if (token !== P.current.token) return;
      setMsg("S", "");
      const sub = addLocalSub(file.name, text);
      if (!sub) return toast("No readable subtitle lines in that file");
      saveLocalSubs(it);
      chooseSub(sub.id);
    } catch {
      if (token === P.current.token) setMsg("S", "");
      toast("Couldn't read that file");
    }
  }

  function removeLocalSub() {
    const it = itemNow();
    const cur = localSubsRef.current.find((x) => x.id === sIdRef.current);
    if (!cur || !it) return;
    setLocalSubs((l) => l.filter((x) => x !== cur));
    saveLocalSubs(it);
    chooseSub("");
    toast("Removed " + cur.name);
  }

  function cycleSub() {
    const T = tracksRef.current;
    if (!T) return;
    const ids = [""].concat(T.subs.filter((s) => s.ok).map((s) => s.id)).concat(localSubsRef.current.map((s) => s.id));
    const next = ids[(ids.indexOf(sIdRef.current) + 1) % ids.length];
    chooseSub(next);
    const s = T.subs.find((x) => x.id === next);
    const l = localSubsRef.current.find((x) => x.id === next);
    showHud(s ? s.label : l ? l.name : "Subtitles off", "Subtitles");
  }

  /* ===================== audio tracks ===================== */
  function enterExt(url: string, idx: number) {
    const a = aud.current!;
    const v = vid.current!;
    P.current.ext = true;
    P.current.extIdx = idx;
    a.src = url;
    a.playbackRate = v.playbackRate;
    a.addEventListener(
      "loadedmetadata",
      () => {
        a.currentTime = v.currentTime;
        if (!v.paused) a.play().catch(() => {});
      },
      { once: true },
    );
    a.load();
    applyVolume();
  }

  function leaveExt() {
    const a = aud.current;
    if (!P.current.ext || !a) return;
    P.current.ext = false;
    P.current.extIdx = 0;
    a.pause();
    a.removeAttribute("src");
    a.load();
    applyVolume();
  }

  async function chooseAudio(idx: number, auto?: boolean) {
    const T = tracksRef.current;
    const it = itemNow();
    const v = vid.current!;
    const tr = T && T.audio.find((a) => a.i === idx);
    if (!tr || !it) return;
    const p = P.current;
    const token = p.token;
    const my = ++p.prepId;
    setAIdx(idx);
    if (!auto) saveTrk("a");
    // track 1 is what the video plays by itself - unless this browser can't decode it
    if (idx === 0 && !needsConv(tr)) {
      setMsg("A", "");
      leaveExt();
      return;
    }
    const hold = idx === 0; // silent otherwise, so wait for the converted track
    const wasPlaying = !v.paused;
    if (hold) v.pause();
    setMsg("A", "Preparing audio…");
    const stop = (msg?: string) => {
      setMsg("A", "");
      setAIdx(p.extIdx);
      if (msg) toast(msg);
      if (hold && wasPlaying) v.play().catch(() => {});
    };
    try {
      let url = "";
      for (;;) {
        const r = await fetch(`/__api/audio-prepare?key=${encodeURIComponent(it.key || "")}&a=${idx}`);
        const j = await r.json();
        if (my !== p.prepId || token !== p.token) return;
        if (!r.ok || j.status === "error") throw new Error(j.error || "Couldn't prepare that audio track");
        if (j.status === "done") {
          url = j.url;
          break;
        }
        setMsg("A", "Preparing audio… " + Math.round((j.progress || 0) * 100) + "%");
        await wait(1200);
        if (my !== p.prepId || token !== p.token) return;
      }
      setMsg("A", "");
      enterExt(url, idx);
      if (hold && wasPlaying) v.play().catch(() => {});
      if (!auto) toast("Audio: " + tr.label);
    } catch (e) {
      if (my !== p.prepId || token !== p.token) return;
      stop((e as Error).message);
    }
  }

  function cycleAudio() {
    const T = tracksRef.current;
    if (!T || T.audio.length < 2) return;
    const k = T.audio.findIndex((a) => a.i === aIdxRef.current);
    const next = T.audio[(k + 1) % T.audio.length];
    chooseAudio(next.i);
    showHud(next.label, "Audio");
  }

  function autoPick(it: Item, T: Tracks) {
    const saved = store.get<{ a: number; s: string } | null>(trkKey(it), null);
    const pref = getPref();
    let ai = 0;
    if (saved && T.audio.some((a) => a.i === saved.a)) ai = saved.a;
    else if (pref.a) {
      const m = T.audio.find((a) => a.lang === pref.a);
      if (m) ai = m.i;
    }
    let sid = "";
    const chosenHere = !!saved && typeof saved.s === "string"; // you picked (or turned off) subtitles for this video
    if (chosenHere) {
      sid =
        T.subs.some((s) => s.id === saved!.s && s.ok) || localSubsRef.current.some((s) => s.id === saved!.s)
          ? saved!.s
          : "";
    } else if (pref.s !== "off") {
      // your usual subtitle language, else the track the file itself marks as default / forced
      const lang = pref.s ? T.subs.find((s) => s.ok && s.lang === pref.s) : null;
      const flagged = T.subs.find((s) => s.ok && s.default) || T.subs.find((s) => s.ok && s.forced);
      const m = lang || flagged;
      if (m) sid = m.id;
    }
    if (T.audio.length && (ai !== 0 || needsConv(T.audio[0]))) chooseAudio(ai, true);
    if (sid) chooseSub(sid, true);
  }

  async function loadTracks(it: Item, token: number) {
    setTracks(null);
    if (!it.key) return;
    try {
      const r = await fetch("/__api/tracks?key=" + encodeURIComponent(it.key));
      const T: Tracks = await r.json();
      if (!r.ok) throw new Error((T as unknown as { error?: string }).error || "");
      if (token !== P.current.token) return;
      setTracks(T);
      autoPick(it, T);
    } catch {
      if (token !== P.current.token) return;
      setTracks({ ffmpeg: false, audio: [], subs: [] });
      const saved = store.get<{ s: string } | null>(trkKey(it), null);
      if (saved && localSubsRef.current.some((x) => x.id === saved.s)) chooseSub(saved.s, true);
    }
  }

  /* ===================== menus ===================== */
  function openMenu(kind: "tracks" | "speed") {
    if (menuRef.current === kind) return closeMenu();
    setMenu(kind);
    const ctrlH = (ctrl.current?.offsetHeight || 120) + 6;
    setMenuStyle({
      bottom: ctrlH + "px",
      // never taller than the space between the top bar and the controls
      maxHeight: Math.max(140, (root.current?.clientHeight || 600) - ctrlH - 64) + "px",
    });
    menuRef.current = kind;
    wake();
  }

  function closeMenu() {
    setMenu("");
    menuRef.current = "";
    wake();
  }

  /* ===================== next episode ===================== */
  function cancelNextUp() {
    setNextUp(false);
  }
  function nextUpGo() {
    setNextUp(false);
    if (iRef.current < list.length - 1) setI(iRef.current + 1);
  }
  function stepVid(d: number) {
    const n = iRef.current + d;
    if (n >= 0 && n < list.length) setI(n);
  }

  /* ===================== opening a video ===================== */
  function resetEngine() {
    const p = P.current;
    const v = vid.current!;
    cancelNextUp();
    killResume();
    p.token++;
    p.prepId++;
    setTracks(null);
    setAIdx(0);
    setSId("");
    cues.current = [];
    setLocalSubs([]);
    setDelay(0);
    p.fit = 0;
    p.bright = 1;
    setZoom(1, 0, 0);
    pts.current.clear();
    p.pinch = null;
    p.gest = null;
    v.style.objectFit = "";
    v.style.filter = "";
    leaveExt();
    setMsgA("");
    setMsgS("");
    setMenu("");
    menuRef.current = "";
    setSubHtml("");
    clearTimeout(p.t.tap);
    if (lockedRef.current) setLock(false);
    setIdle(false);
    setHudState(null);
  }

  useEffect(() => {
    const v = vid.current!;
    const it = list[i];
    resetEngine();
    P.current.openedAt = performance.now();
    setErr("");
    const saved = store.get<SavedPos | null>(posKey(it), null);

    v.src = it.url;
    v.defaultPlaybackRate = prefsRef.current.speed;
    v.playbackRate = prefsRef.current.speed;
    applyVolume();
    setPaused(v.paused);
    setSpin("Loading movie…");
    restoreLocalSubs(it);
    wake();

    v.onloadedmetadata = () => {
      if (saved && saved.t > 5 && v.duration && saved.t < v.duration - 10) {
        v.currentTime = saved.t;
        resumeCard(saved.t);
      }
    };
    v.play().catch(() => {});
    loadTracks(it, P.current.token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  // leaving the player: stop everything
  useEffect(() => {
    return () => {
      const v = vid.current;
      const a = aud.current;
      const t = P.current.t;
      Object.values(t).forEach((x) => clearTimeout(x));
      P.current.token++;
      P.current.prepId++;
      setBusy("spin", false);
      setBusy("msg", false);
      if (v) {
        v.onloadedmetadata = null;
        v.pause();
        v.removeAttribute("src");
        v.load();
      }
      if (a) {
        a.pause();
        a.removeAttribute("src");
        a.load();
      }
      try {
        const d = document as Document & { webkitExitFullscreen?: () => void };
        if (fsEl()) (document.exitFullscreen || d.webkitExitFullscreen)?.call(document);
        if (document.pictureInPictureElement) document.exitPictureInPicture();
      } catch {
        /* ignore */
      }
    };
  }, []);

  /* ===================== media events ===================== */
  const audPlay = () => {
    const a = aud.current;
    if (P.current.ext && a && a.paused && a.readyState >= 2) a.play().catch(() => {});
  };

  function onTimeUpdate() {
    const v = vid.current!;
    const a = aud.current!;
    // keep the extra audio within 0.3 s of the picture
    if (
      P.current.ext &&
      !v.paused &&
      !v.seeking &&
      a.readyState >= 2 &&
      Math.abs(a.currentTime - v.currentTime) > 0.3
    ) {
      a.currentTime = v.currentTime;
    }
    const now = Date.now();
    if (now - P.current.lastSave < 4000 || !v.duration) return;
    P.current.lastSave = now;
    const it = itemNow();
    if (it) store.set(posKey(it), { t: v.currentTime, d: v.duration } satisfies SavedPos);
  }

  function onEnded() {
    const it = itemNow();
    const v = vid.current!;
    if (it) store.set(posKey(it), { t: 0, d: v.duration } satisfies SavedPos);
    aud.current?.pause();
    if (iRef.current < list.length - 1) setNextUp(true);
  }

  /* ===================== taps and touch gestures on the picture ===================== */
  function onTap(e: React.PointerEvent, touch: boolean) {
    const p = P.current;
    if (menuRef.current) return closeMenu();
    const now = performance.now();
    const r = stage.current!.getBoundingClientRect();
    const rel = (e.clientX - r.left) / r.width;
    if (now - p.lastTap < 300) {
      clearTimeout(p.t.tap);
      p.lastTap = now; // keep tapping to keep skipping
      if (!touch) return toggleFs();
      if (rel < 0.33) {
        seekBy(-10);
        skipFx(-1);
      } else if (rel > 0.67) {
        seekBy(10);
        skipFx(1);
      } else togglePlay();
      return;
    }
    p.lastTap = now;
    p.t.tap = window.setTimeout(() => (touch ? toggleControls() : togglePlay()), 280);
  }

  // fingers on the picture (for pinch zoom). The picture itself must NOT wake the controls
  // on touch-down: the tap handler decides (show if hidden, hide if shown).
  function onStageDown(e: React.PointerEvent) {
    const p = P.current;
    if (lockedRef.current) return showUnlock();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.pointerType !== "mouse") {
      pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.current.size === 2) {
        const [a, b] = [...pts.current.values()];
        p.pinch = {
          d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          s0: p.zoom.s,
          mx0: (a.x + b.x) / 2,
          my0: (a.y + b.y) / 2,
          x0: p.zoom.x,
          y0: p.zoom.y,
        };
        p.gest = null;
        p.lastTap = 0;
        clearTimeout(p.t.tap);
        closeMenu();
        return;
      }
      if (pts.current.size > 2) return;
    }
    p.gest = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      touch: e.pointerType !== "mouse",
      mode: "",
      zx: 0,
      zy: 0,
      t0: 0,
      v0: 0,
      b0: 0,
    };
  }

  function onStageMove(e: React.PointerEvent) {
    const p = P.current;
    const v = vid.current!;
    if (e.pointerType === "mouse") return wake(4000);
    if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (p.pinch && pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const sc = p.pinch.s0 * (d / p.pinch.d0);
      setZoom(
        Math.abs(sc - 1) < 0.04 ? 1 : sc, // snaps to exactly 100% when you pass through it
        p.pinch.x0 + (a.x + b.x) / 2 - p.pinch.mx0,
        p.pinch.y0 + (a.y + b.y) / 2 - p.pinch.my0,
      );
      zoomHud();
      return;
    }
    const g = p.gest;
    if (!g || e.pointerId !== g.id || lockedRef.current) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const r = stage.current!.getBoundingClientRect();
    if (!g.mode) {
      if (Math.hypot(dx, dy) < 16) return;
      g.mode =
        p.zoom.s > 1 // zoomed in: one finger moves the picture
          ? "pan"
          : Math.abs(dx) > Math.abs(dy)
            ? "seek"
            : g.x - r.left < r.width / 2
              ? "bright"
              : "vol";
      g.zx = p.zoom.x;
      g.zy = p.zoom.y;
      g.t0 = v.currentTime;
      g.v0 = prefsRef.current.volume;
      g.b0 = p.bright;
      closeMenu();
    }
    if (g.mode === "pan") {
      setZoom(p.zoom.s, g.zx + dx, g.zy + dy);
    } else if (g.mode === "seek") {
      if (!isFinite(v.duration)) return;
      g.target = clamp(g.t0 + (dx / r.width) * 150, 0, v.duration);
      const diff = Math.round(g.target - g.t0);
      showHud((diff >= 0 ? "+" : "−") + Math.abs(diff) + " s", safeTime(g.target));
    } else if (g.mode === "vol") {
      const volume = clamp(g.v0 - dy / (r.height * 0.7), 0, 1);
      setVolume(volume, false);
      showHud("Volume", Math.round(volume * 100) + "%", volume);
    } else {
      p.bright = clamp(g.b0 - dy / (r.height * 0.7), 0.25, 1.75);
      v.style.filter = p.bright === 1 ? "" : `brightness(${p.bright})`;
      showHud("Brightness", Math.round(p.bright * 100) + "%", (p.bright - 0.25) / 1.5);
    }
  }

  function endGesture(e: React.PointerEvent, cancelled: boolean) {
    const p = P.current;
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) p.pinch = null;
    const g = p.gest;
    p.gest = null;
    if (!g || e.pointerId !== g.id) return;
    if (g.mode === "seek" && !cancelled && g.target !== undefined) seekTo(g.target);
    if (g.mode === "vol") saveVol();
    if (g.mode || cancelled || lockedRef.current) return;
    onTap(e, g.touch);
  }

  // trackpad pinch / Ctrl+wheel zooms (throttled so one pinch is a few steps); plain wheel changes volume
  useEffect(() => {
    const el = stage.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        const now = performance.now();
        if (now - P.current.wheelT > 140) {
          P.current.wheelT = now;
          stepZoom(e.deltaY < 0 ? 1 : -1);
        }
      } else bumpVolume(e.deltaY < 0 ? 0.05 : -0.05);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ===================== keyboard ===================== */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      let handled = true;
      wake();
      if (lockedRef.current) {
        if (k === "Escape") showUnlock();
        return;
      }
      const v = vid.current!;
      if (k === "Escape") {
        if (menuRef.current) closeMenu();
        else onClose();
      } else if (k === "ArrowRight") seekBy(10);
      else if (k === "ArrowLeft") seekBy(-10);
      else if (k === "ArrowUp") bumpVolume(0.05);
      else if (k === "ArrowDown") bumpVolume(-0.05);
      else if (k === " " || k === "k" || k === "K") togglePlay();
      else if (k === "n" || k === "N") stepVid(1);
      else if (k === "p" || k === "P") stepVid(-1);
      else if (k === "f" || k === "F") toggleFs();
      else if (k === "m" || k === "M") toggleMute();
      else if (k === "+" || k === "=") stepZoom(1);
      else if (k === "-" || k === "_") stepZoom(-1);
      else if (k === "0") {
        setZoom(1, 0, 0);
        zoomHud();
      } else if (k === "c" || k === "C") cycleSub();
      else if (k === "a" || k === "A") cycleAudio();
      else if (k === "<" || k === ",") {
        const n = SPEEDS.indexOf(v.playbackRate);
        setSpeed(SPEEDS[Math.max(0, (n < 0 ? 2 : n) - 1)]);
      } else if (k === ">" || k === ".") {
        const n = SPEEDS.indexOf(v.playbackRate);
        setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, (n < 0 ? 2 : n) + 1)]);
      } else handled = false;
      if (handled) e.preventDefault();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  /* ===================== VLC ===================== */
  function openInVlc() {
    const u = new URL(item.url, location.href);
    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) {
      location.href =
        "intent://" + u.host + u.pathname + "#Intent;scheme=http;package=org.videolan.vlc;type=video/*;end";
    } else if (/iPhone|iPad/i.test(ua)) {
      location.href = "vlc-x-callback://x-callback-url/stream?url=" + encodeURIComponent(u.href);
    } else {
      toast(copyText(u.href) ? "Link copied - in VLC: Media > Open Network Stream" : u.href);
    }
  }

  /* ===================== view ===================== */
  const muted = prefs.muted || prefs.volume === 0;
  const pct = /(\d+)%/.exec(msgA || "");
  const chipText = [msgA, msgS].filter(Boolean).join("   ·   ");
  const nextItem = list[i + 1];
  const controlsHidden = idle && !locked;

  return (
    <div
      ref={root}
      className={`fixed inset-0 z-50 flex flex-col bg-black text-white ${controlsHidden ? "cursor-none" : ""}`}
      onPointerMove={(e) => e.pointerType === "mouse" && wake(4000)}
      onPointerDown={(e) => {
        // touching a control keeps the controls up for 10 s
        if (!stage.current?.contains(e.target as Node)) wake();
      }}
      onClick={(e) => (e.target as Element).closest("button")?.blur()} // so Space / Enter keep controlling the video
    >
      <div
        ref={stage}
        className="absolute inset-0 touch-none overflow-hidden bg-black select-none"
        onPointerDown={onStageDown}
        onPointerMove={onStageMove}
        onPointerUp={(e) => endGesture(e, false)}
        onPointerCancel={(e) => endGesture(e, true)}
      >
        <video
          ref={vid}
          playsInline
          className="absolute inset-0 size-full bg-black object-contain [transform-origin:50%_50%]"
          onPlay={() => {
            setPaused(false);
            wake();
            audPlay();
            cancelNextUp();
            popIcon("play");
          }}
          onPause={() => {
            setPaused(true);
            wake();
            if (P.current.ext) aud.current?.pause();
            popIcon("pause");
          }}
          onWaiting={() => {
            setSpin("Buffering…");
            if (P.current.ext) aud.current?.pause();
          }}
          onPlaying={() => {
            setSpin(null);
            if (P.current.ext && aud.current && vid.current) {
              aud.current.currentTime = vid.current.currentTime;
              audPlay();
            }
          }}
          onCanPlay={() => setSpin(null)}
          onSeeking={() => {
            if (P.current.ext && aud.current && vid.current) aud.current.currentTime = vid.current.currentTime;
          }}
          onSeeked={() => {
            if (P.current.ext && aud.current && vid.current) {
              aud.current.currentTime = vid.current.currentTime;
              if (!vid.current.paused) audPlay();
            }
          }}
          onRateChange={() => {
            if (aud.current && vid.current) aud.current.playbackRate = vid.current.playbackRate;
            if (vid.current) setRate(vid.current.playbackRate);
          }}
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
          onError={() => {
            if (!vid.current?.getAttribute("src")) return;
            setSpin(null);
            setErr(
              "This browser can't play this file (usually HEVC video inside the MKV). Try the VLC button or download it.",
            );
          }}
        />
        <audio
          ref={aud}
          preload="auto"
          className="hidden"
          onCanPlay={() => {
            const v = vid.current;
            if (P.current.ext && v && !v.paused && !v.seeking) audPlay();
          }}
        />

        {/* subtitles */}
        <div
          className="pointer-events-none absolute inset-x-0 z-[2] px-[6%] text-center leading-[1.4] transition-[bottom] duration-200"
          style={{
            bottom: controlsHidden || locked ? "7%" : "calc(118px + env(safe-area-inset-bottom))",
            fontSize: `calc(clamp(15px, 2.4vw, 30px) * ${prefs.subSize / 100})`,
            color: prefs.subColor,
          }}
        >
          {subHtml && (
            <span
              key={subHtml}
              className="animate-sub-in rounded-md bg-black/60 px-[.45em] py-[.06em] [text-shadow:0_1px_2px_#000] [box-decoration-break:clone]"
              dangerouslySetInnerHTML={{ __html: subHtml }}
            />
          )}
        </div>

        {spin !== null && <Spinner text={spin} />}
        {hud && <Hud key={hud.n} big={hud.big} small={hud.small} bar={hud.bar} />}
        {pop && <PopIcon key={pop.n} kind={pop.kind} />}
        {skip && <SkipFx key={skip.n} dir={skip.dir} acc={skip.acc} />}
      </div>

      {/* top bar */}
      <div
        className={`absolute inset-x-0 top-0 z-[5] flex items-center gap-2 bg-linear-to-b from-[#000c] to-[#0000] px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-[26px] transition-[opacity,transform] duration-[350ms] ease-[cubic-bezier(.2,.8,.2,1)] ${
          locked ? "hidden" : ""
        } ${controlsHidden ? "pointer-events-none -translate-y-3.5 opacity-0" : ""}`}
      >
        <Button variant="overlay" size="sm" onClick={onClose}>
          &#10005; Close
        </Button>
        <div className="min-w-0 flex-1 truncate font-semibold">{pretty(item)}</div>
        <Button variant="overlay" size="sm" title="Open in VLC" onClick={openInVlc}>
          VLC
        </Button>
        <a data-ripple className={cn(buttonVariants({ variant: "overlay", size: "sm" }))} href={item.url} download>
          &#11015;
        </a>
      </div>

      {chipText && <StatusChip text={chipText} pct={pct ? Number(pct[1]) : null} />}

      <input
        ref={subFile}
        type="file"
        accept=".srt,.vtt,.txt,text/plain,text/vtt,application/x-subrip,application/octet-stream"
        hidden
        onChange={(e) => {
          loadSubFile(e.target.files?.[0]);
          e.target.value = ""; // so the same file can be picked again
        }}
      />

      {resume && (
        <ResumeCard
          text={"Resumed from " + fmtTime(resume.t)}
          out={resume.out}
          onStartOver={() => {
            if (vid.current) vid.current.currentTime = 0;
            hideResume();
          }}
        />
      )}
      {nextUp && nextItem && <NextUp title={pretty(nextItem)} onGo={nextUpGo} onCancel={cancelNextUp} />}

      {err && (
        <div
          className="absolute right-3.5 left-3.5 z-[6] rounded-[10px] bg-[#5b1220] px-3.5 py-2.5 text-sm leading-[1.4] text-[#ffd5dc]"
          style={{ top: "calc(64px + env(safe-area-inset-top))" }}
        >
          {err}
        </div>
      )}

      {/* bottom controls */}
      <div
        ref={ctrl}
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-[5] bg-linear-to-b from-[#0000] to-[#000d] px-2 pt-[34px] pb-[calc(8px+env(safe-area-inset-bottom))] transition-[opacity,transform] duration-[350ms] ease-[cubic-bezier(.2,.8,.2,1)] min-[641px]:px-3.5 ${
          locked ? "hidden" : ""
        } ${controlsHidden ? "translate-y-4 opacity-0" : ""}`}
      >
        <div className={controlsHidden ? "pointer-events-none" : "pointer-events-auto"}>
          <Seekbar
            key={i}
            video={vid}
            scrubbing={scrubbing}
            onSeek={seekTo}
            onScrub={(on) => (on ? (clearTimeout(P.current.t.idle), setIdle(false)) : wake())}
          />
          <div className="flex items-center justify-between gap-1.5 max-[640px]:flex-col max-[640px]:gap-0">
            <div className="flex min-w-0 items-center gap-0.5">
              <PlayerButton title="Previous (P)" aria-label="Previous" disabled={i <= 0} onClick={() => stepVid(-1)}>
                <Icon name="prev" />
              </PlayerButton>
              <PlayerButton title="Back 10 s (←)" aria-label="Back 10 seconds" onClick={() => seekBy(-10)}>
                <Icon name="back" />
              </PlayerButton>
              <PlayerButton
                big
                title="Play / pause (Space)"
                aria-label={paused ? "Play" : "Pause"}
                onClick={togglePlay}
              >
                <Icon name={paused ? "play" : "pause"} className="size-[30px]" />
              </PlayerButton>
              <PlayerButton title="Forward 10 s (→)" aria-label="Forward 10 seconds" onClick={() => seekBy(10)}>
                <Icon name="fwd" />
              </PlayerButton>
              <PlayerButton
                title="Next (N)"
                aria-label="Next"
                disabled={i >= list.length - 1}
                onClick={() => stepVid(1)}
              >
                <Icon name="next" />
              </PlayerButton>
              <span className="px-2 text-xs whitespace-nowrap text-[#c4c4d2]">
                {i + 1} / {list.length}
              </span>
              <PlayerButton
                title="Mute (M)"
                aria-label="Mute"
                className="[@media(pointer:coarse)]:hidden"
                onClick={toggleMute}
              >
                <Icon name={muted ? "mute" : "vol"} />
              </PlayerButton>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : prefs.volume}
                aria-label="Volume"
                className="w-[86px] accent-accent2 [@media(pointer:coarse)]:hidden"
                onChange={(e) => {
                  const volume = Number(e.target.value);
                  setVolume(volume, volume === 0);
                }}
              />
            </div>
            <div className="flex min-w-0 items-center gap-0.5">
              <PlayerButton txt title="Playback speed ( < / > )" onClick={() => openMenu("speed")}>
                {rate}×
              </PlayerButton>
              <PlayerButton
                title="Audio & subtitles (C)"
                aria-label="Audio and subtitles"
                on={!!sId || aIdx !== 0}
                onClick={() => openMenu("tracks")}
              >
                <Icon name="cc" />
              </PlayerButton>
              <PlayerButton title="Picture: fit / fill / stretch" aria-label="Picture fit" onClick={cycleFit}>
                <Icon name="fit" />
              </PlayerButton>
              {canPip && (
                <PlayerButton title="Picture in picture" aria-label="Picture in picture" onClick={togglePip}>
                  <Icon name="pip" />
                </PlayerButton>
              )}
              <PlayerButton title="Lock controls" aria-label="Lock controls" onClick={() => setLock(true)}>
                <Icon name="lock" />
              </PlayerButton>
              {canFs && (
                <PlayerButton title="Fullscreen (F)" aria-label="Fullscreen" onClick={toggleFs}>
                  <Icon name={fs ? "fsx" : "fs"} />
                </PlayerButton>
              )}
            </div>
          </div>
        </div>
      </div>

      {menu && !locked && (
        <PlayerMenu
          kind={menu}
          style={menuStyle}
          tracks={tracks}
          aIdx={aIdx}
          sId={sId}
          localSubs={localSubs}
          msgA={msgA}
          msgS={msgS}
          delay={delay}
          subSize={prefs.subSize}
          subColor={prefs.subColor}
          rate={rate}
          onAudio={(n) => chooseAudio(n)}
          onSub={(id) => chooseSub(id)}
          onAddSub={() => subFile.current?.click()}
          onRemoveSub={removeLocalSub}
          onSpeed={(v) => {
            setSpeed(v);
            closeMenu();
          }}
          onSize={(dir) => {
            const subSize = clamp(prefsRef.current.subSize + dir * 10, 50, 250);
            setPrefs((p) => ({ ...p, subSize }));
            store.set("subSize", subSize);
          }}
          onColor={(c) => {
            setPrefs((p) => ({ ...p, subColor: c }));
            store.set("subColor", c);
          }}
          onDelay={(dir) => {
            setDelay(Math.round((delayRef.current + dir * 0.5) * 10) / 10);
            tickSubs();
          }}
        />
      )}

      {locked && unlockShown && (
        <PlayerButton
          aria-label="Unlock controls"
          className="absolute top-1/2 right-4 z-[9] -mt-[26px] !size-[52px] border border-white/35 !bg-black/75"
          onClick={() => setLock(false)}
        >
          <Icon name="lock" />
        </PlayerButton>
      )}
    </div>
  );
}
