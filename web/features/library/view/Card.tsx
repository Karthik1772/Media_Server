import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { NavLink } from "@/shared/components/NavLink";
import { Badge } from "@/shared/components/ui/badge";
import type { Item, ViewMode } from "@/lib/types";
import { asset } from "@/lib/motion";
import { ext, fmtDate, fmtSize, hue, pretty, progress } from "@/lib/format";

/* ---------- scroll reveal: one shared observer, cards fade up as they come into view ---------- */
const revealers = new Map<Element, () => void>();
let observer: IntersectionObserver | null = null;

function observe(el: Element, reveal: () => void) {
  if (!("IntersectionObserver" in window)) return reveal();
  observer ??= new IntersectionObserver(
    (entries) => {
      let n = 0;
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const fn = revealers.get(en.target);
        observer!.unobserve(en.target);
        revealers.delete(en.target);
        (en.target as HTMLElement).style.setProperty("--d", Math.min(n++, 8) * 18 + "ms");
        fn?.();
      });
    },
    { rootMargin: "0px 0px -4% 0px", threshold: 0.04 },
  );
  revealers.set(el, reveal);
  observer.observe(el);
}

function unobserve(el: Element) {
  revealers.delete(el);
  observer?.unobserve(el);
}

/* ---------- small pieces ---------- */
const badgePos = "absolute right-2 bottom-2 z-[2]";
const ico = "relative z-[1] text-[34px] drop-shadow-[0_2px_6px_rgba(0,0,0,.5)]";

/** An <img> that fades in once loaded; `fallback` is tried once if the first source fails. */
function FadeImg({
  src,
  fallback,
  onLoaded,
  className = "",
}: {
  src: string;
  fallback?: string;
  onLoaded: () => void;
  className?: string;
}) {
  const [current, setCurrent] = useState(src);
  const [ld, setLd] = useState(false);
  const [failed, setFailed] = useState(false);
  const tried = useRef(false);

  useEffect(() => {
    setCurrent(src);
    setLd(false);
    setFailed(false);
    tried.current = false;
  }, [src]);

  if (failed) return null;
  return (
    <img
      src={current}
      alt=""
      loading="lazy"
      decoding="async"
      onLoad={() => {
        setLd(true);
        onLoaded();
      }}
      onError={() => {
        if (fallback && !tried.current) {
          tried.current = true;
          setCurrent(fallback);
        } else setFailed(true);
      }}
      className={`absolute inset-0 size-full object-cover transition-[opacity,transform] duration-200 group-hover:scale-[1.015] ${
        ld ? "opacity-100" : "opacity-0"
      } ${className}`}
    />
  );
}

/** Movie poster: when it changes the old one stays underneath until the new one has faded in. */
function PosterImg({ src, onLoaded }: { src: string; onLoaded: () => void }) {
  const [layers, setLayers] = useState({ cur: src, prev: "", ld: false });
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setLayers((l) => (l.cur === src ? l : { cur: src, prev: l.ld ? l.cur : l.prev, ld: false }));
  }, [src]);

  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) return null;

  return (
    <>
      {layers.prev && <img src={layers.prev} alt="" className="absolute inset-0 size-full object-cover" />}
      <img
        src={layers.cur}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => {
          setLayers((l) => ({ ...l, ld: true }));
          onLoaded();
          setTimeout(() => setLayers((l) => ({ ...l, prev: "" })), 450);
        }}
        onError={() => setFailed(true)}
        className={`absolute inset-0 z-[1] size-full object-cover transition-[opacity,transform] duration-200 group-hover:scale-[1.015] ${
          layers.ld ? "opacity-100" : "opacity-0"
        }`}
      />
    </>
  );
}

/** Play button that fades in over a video/audio card on hover (hidden on touch screens). */
function PlayBadge() {
  return (
    <i className="pointer-events-none absolute inset-0 z-[2] bg-[radial-gradient(circle,rgba(0,0,0,.38),transparent_68%)] opacity-0 transition-opacity duration-[180ms] group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:hidden">
      <span className="absolute top-1/2 left-1/2 -mt-7 -ml-7 size-12 scale-[.96] rounded-full bg-accent2 shadow-[0_4px_16px_rgba(0,0,0,.28)] transition-transform duration-150 ease-out group-hover:scale-100 group-focus-visible:scale-100" />
      <span className="absolute top-1/2 left-1/2 -mt-2.5 -ml-1.5 border-y-[10px] border-l-[17px] border-y-transparent border-l-white" />
    </i>
  );
}

/* ---------- the card ---------- */
interface Props {
  item: Item;
  view: ViewMode;
  /** "observe" = fade in when scrolled into view; "now" = it appeared because of a search/sort/view change */
  reveal: "observe" | "now";
  flash: boolean;
  onOpen: (it: Item) => void;
  onEditPoster: (it: Item) => void;
  onMount: (key: string, el: HTMLElement) => void;
  onUnmount: (key: string, el: HTMLElement) => void;
}

export function Card({ item: it, view, reveal, flash, onOpen, onEditPoster, onMount, onUnmount }: Props) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [shown, setShown] = useState(reveal === "now");
  const [loaded, setLoaded] = useState(false);
  const list = view === "list";

  useLayoutEffect(() => {
    const el = ref.current!;
    onMount(it.url, el);
    return () => onUnmount(it.url, el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [it.url]);

  useEffect(() => {
    const el = ref.current!;
    if (shown) return;
    observe(el, () => setShown(true));
    return () => unobserve(el);
  }, [shown]);

  const isMedia = !it.dir && (it.kind === "video" || it.kind === "audio" || it.kind === "image");
  const sub = it.dir ? "Folder" : `${fmtSize(it.size)} · ${fmtDate(it.mtime)}`;
  const scope = it.scope || "other";
  const posterScope = it.kind === "video" && scope === "poster";
  const p = it.kind === "video" ? progress(it) : 0;

  let thumb;
  const base = `relative grid place-items-center overflow-hidden bg-panel2 ${
    posterScope ? "aspect-[2/3]" : "aspect-video"
  } ${list ? (posterScope ? "w-[84px]" : "w-[100px] min-[601px]:w-[120px]") + " flex-none" : ""}`;

  if (it.dir) {
    thumb = (
      <div
        className={base}
        style={{
          background: `linear-gradient(135deg, hsl(${hue(it.name)} 70% 40%), hsl(${hue(it.name) + 50} 70% 22%))`,
        }}
      >
        <span className={ico}>&#128193;</span>
        <Badge className={badgePos}>
          {it.count} item{it.count === 1 ? "" : "s"}
        </Badge>
      </div>
    );
  } else if (it.kind === "image" && it.heic && !it.thumb) {
    // .heic that this server can't convert: no broken image
    thumb = (
      <div className={base} title="Run: pip install pillow-heif   (on the PC running the server)">
        <span className={ico}>&#128444;&#65039;</span>
        <Badge className={badgePos}>{ext(it)}</Badge>
      </div>
    );
  } else if (it.kind === "image") {
    thumb = (
      <div className={base}>
        <FadeImg src={it.thumb || it.url} fallback={it.thumb ? it.url : undefined} onLoaded={() => setLoaded(true)} />
        {!loaded && <Shimmer />}
        <Badge className={badgePos}>{ext(it)}</Badge>
      </div>
    );
  } else if (it.kind === "video") {
    thumb = (
      <div className={`${base} bg-white dark:bg-black`}>
        {/* default picture for videos without a poster / preview */}
        <div
          className="absolute inset-0 bg-contain bg-center bg-no-repeat dark:invert"
          style={{ backgroundImage: `url(${asset("video.jpg")})` }}
        />
        {it.poster && <PosterImg src={it.poster} onLoaded={() => setLoaded(true)} />}
        {it.poster && !loaded && <Shimmer />}
        <PlayBadge />
        <Badge className={badgePos}>{ext(it)}</Badge>
        {p > 0 && (
          <div className="absolute inset-x-0 bottom-0 z-[2] h-1 bg-white/25">
            <i className="block h-full bg-accent" style={{ width: p + "%" }} />
          </div>
        )}
        {posterScope && (
          <button
            type="button"
            title="Change poster"
            aria-label={`Change poster for ${pretty(it)}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEditPoster(it);
            }}
            className="absolute top-[7px] left-[7px] z-[4] size-[30px] cursor-pointer rounded-[9px] border border-white/35 bg-black/70 text-[17px] text-white opacity-90 hover:bg-accent2 hover:opacity-100 focus-visible:bg-accent2 focus-visible:opacity-100"
          >
            ✎
          </button>
        )}
      </div>
    );
  } else if (it.kind === "audio") {
    thumb = (
      <div className={`${base} bg-linear-135 from-[#0f766e] to-[#1e3a8a]`}>
        <PlayBadge />
        <span className={ico}>&#127925;</span>
        <Badge className={badgePos}>{ext(it)}</Badge>
      </div>
    );
  } else {
    thumb = (
      <div className={base}>
        <span className={ico}>&#128196;</span>
        <Badge className={badgePos}>{ext(it) || "FILE"}</Badge>
      </div>
    );
  }

  const style: CSSProperties = {};
  const cls = `group/card group rounded-2xl border border-line bg-panel text-inherit no-underline overflow-hidden transition-[transform,border-color,background-color,box-shadow] duration-[180ms] ease-out hover:-translate-y-px hover:border-line-strong hover:shadow-[0_12px_30px_rgba(0,0,0,.18)] active:scale-[.995] group-data-[leaving=true]/grid:-translate-y-1.5 group-data-[leaving=true]/grid:opacity-0 ${
    list ? "flex items-center" : "block"
  } ${!shown ? "translate-y-1.5 opacity-0" : reveal === "observe" || reveal === "now" ? "animate-card-in" : ""} ${
    flash ? "animate-flash" : ""
  }`;

  const body = (
    <>
      {thumb}
      <div className={`min-w-0 p-[9px] min-[601px]:px-3 min-[601px]:pt-2.5 min-[601px]:pb-3 ${list ? "flex-1" : ""}`}>
        <div className="line-clamp-2 text-[13px] leading-[1.3] font-semibold break-words min-[601px]:text-sm">
          {pretty(it)}
        </div>
        <div className="mt-1 text-xs text-mute">{sub}</div>
      </div>
    </>
  );

  if (it.dir) {
    return (
      <NavLink ref={ref} href={it.url} title={it.name} className={cls} style={style}>
        {body}
      </NavLink>
    );
  }

  return (
    <a
      ref={ref}
      href={it.url}
      title={it.name}
      className={cls}
      style={style}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
        if (isMedia) {
          e.preventDefault();
          onOpen(it);
        }
      }}
    >
      {body}
    </a>
  );
}

function Shimmer() {
  return (
    <i className="pointer-events-none absolute inset-0 z-[3] animate-shimmer bg-[linear-gradient(100deg,transparent_30%,rgba(255,255,255,.16)_50%,transparent_70%)] bg-[length:220%_100%]" />
  );
}
