import { Fragment, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Card } from "@/components/Card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Item, ViewMode } from "@/lib/types";
import { reducedMotion } from "@/lib/motion";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const COLS = {
  grid: "grid-cols-2 max-[360px]:grid-cols-1 min-[601px]:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] min-[1025px]:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] min-[1600px]:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] min-[2200px]:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]",
  posters:
    "grid-cols-2 max-[360px]:grid-cols-1 min-[601px]:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] min-[1600px]:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] min-[2200px]:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]",
  list: "grid-cols-1",
};

interface Props {
  items: Item[];
  view: ViewMode;
  hasPosters: boolean;
  leaving: boolean;
  skeleton: boolean;
  flashUrl: string;
  onOpen: (it: Item) => void;
  onEditPoster: (it: Item) => void;
}

/**
 * The card grid. Cards glide to their new place when the search, sort or layout changes,
 * new ones pop in, and the ones that left shrink away where they were.
 */
export function Grid({ items, view, hasPosters, leaving, skeleton, flashUrl, onOpen, onEditPoster }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const last = useRef(new Map<string, Rect>()); // where every card was after the previous render (page coordinates)
  const removed = useRef<{ el: HTMLElement; r?: Rect }[]>([]);
  const rendered = useRef(false); // false until the first render has been laid out

  const onMount = useCallback((key: string, el: HTMLElement) => {
    nodes.current.set(key, el);
  }, []);
  const onUnmount = useCallback((key: string, el: HTMLElement) => {
    removed.current.push({ el, r: last.current.get(key) });
    nodes.current.delete(key);
    last.current.delete(key);
  }, []);

  const measure = useCallback(() => {
    const map = new Map<string, Rect>();
    nodes.current.forEach((el, key) => {
      const r = el.getBoundingClientRect();
      map.set(key, { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
    });
    return map;
  }, []);

  // runs after every render, before the browser paints
  useLayoutEffect(() => {
    const motion = !reducedMotion() && rendered.current;
    const next = measure();

    if (motion) {
      next.forEach((cur, key) => {
        const p = last.current.get(key);
        const el = nodes.current.get(key);
        if (!p || !el) return;
        const dx = p.x - cur.x;
        const dy = p.y - cur.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          el.animate(
            [
              { transform: `translate(${dx}px, ${dy}px)`, opacity: 0.75 },
              { transform: "none", opacity: 1 },
            ],
            { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" },
          );
        }
      });

      // cards that left: shrink and fade where they were
      let ghosts = 0;
      removed.current.forEach(({ el, r }) => {
        if (!r || ghosts >= 40) return;
        const top = r.y - scrollY;
        const left = r.x - scrollX;
        if (top + r.h < 0 || top > innerHeight) return;
        ghosts++;
        const gh = el.cloneNode(true) as HTMLElement;
        gh.className = "rounded-card border border-line bg-panel overflow-hidden";
        gh.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${r.w}px;height:${r.h}px;margin:0;pointer-events:none;z-index:5`;
        document.body.appendChild(gh);
        gh.animate(
          [
            { opacity: 1, transform: "scale(1)" },
            { opacity: 0, transform: "scale(.86)" },
          ],
          { duration: 260, easing: "ease-in", fill: "forwards" },
        ).onfinish = () => gh.remove();
      });
    }

    removed.current = [];
    last.current = next;
    rendered.current = true;
  });

  // layout shifts that are not renders (window resized, a poster finished loading) must not look like moves
  useEffect(() => {
    const el = gridRef.current;
    if (!el || !("ResizeObserver" in window)) return;
    const ro = new ResizeObserver(() => {
      last.current = measure();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const cols = view === "list" ? COLS.list : hasPosters ? COLS.posters : COLS.grid;
  const wrapper = `group/grid grid gap-2.5 min-[601px]:gap-3.5 min-[700px]:gap-[18px] ${view === "list" ? "!gap-2" : ""} ${cols}`;

  if (skeleton) {
    return (
      <div className={wrapper}>
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            className="pointer-events-none animate-fade-in overflow-hidden rounded-card border border-line bg-panel"
          >
            <Skeleton className="aspect-video rounded-none" />
            <div className="space-y-2 p-3">
              <Skeleton className="h-[11px]" />
              <Skeleton className="h-[11px] w-[55%]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={gridRef} data-leaving={leaving} className={wrapper}>
      {items.map((it, n) => (
        <Fragment key={it.url}>
          {/* folders and files never share a row: poster cards are much taller than folder cards */}
          {n > 0 && !it.dir && items[n - 1].dir && view !== "list" && <div className="col-span-full h-0" />}
          <Card
            item={it}
            view={view}
            reveal={rendered.current ? "now" : "observe"}
            flash={flashUrl === it.url}
            onOpen={onOpen}
            onEditPoster={onEditPoster}
            onMount={onMount}
            onUnmount={onUnmount}
          />
        </Fragment>
      ))}
    </div>
  );
}
