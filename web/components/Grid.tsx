import { Fragment } from "react";
import { Card } from "@/components/Card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Item, ViewMode } from "@/lib/types";

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
  skeleton: boolean;
  onOpen: (it: Item) => void;
  onEditPoster: (it: Item) => void;
}

/** The card grid. */
export function Grid({ items, view, hasPosters, skeleton, onOpen, onEditPoster }: Props) {
  const cols = view === "list" ? COLS.list : hasPosters ? COLS.posters : COLS.grid;
  const wrapper = `grid gap-2.5 min-[601px]:gap-3.5 min-[700px]:gap-[18px] ${view === "list" ? "!gap-2" : ""} ${cols}`;

  if (skeleton) {
    return (
      <div className={wrapper}>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="pointer-events-none overflow-hidden rounded-card border border-line bg-panel">
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
    <div className={wrapper}>
      {items.map((it, n) => (
        <Fragment key={it.url}>
          {/* folders and files never share a row: poster cards are much taller than folder cards */}
          {n > 0 && !it.dir && items[n - 1].dir && view !== "list" && <div className="col-span-full h-0" />}
          <Card item={it} view={view} onOpen={onOpen} onEditPoster={onEditPoster} />
        </Fragment>
      ))}
    </div>
  );
}