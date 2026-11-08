import { useMemo } from "react";
import { Card } from "@/features/library/view/Card";
import type { Item, ViewMode } from "@/lib/types";
import { fmtSize } from "@/lib/format";
import { Skeleton } from "@/shared/components/ui/skeleton";

interface Props {
  items: Item[];
  view: ViewMode;
  hasPosters: boolean;
  mediaMode?: "video" | "photo" | "mixed" | "collections";
  leaving: boolean;
  skeleton: boolean;
  flashUrl: string;
  onOpen: (it: Item) => void;
  onEditPoster: (it: Item) => void;
}

const noop = () => {};
const folderCols = "grid grid-cols-2 gap-3 min-[601px]:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] min-[1025px]:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] min-[1600px]:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]";

function FolderSection({ items, view, mediaMode, flashUrl, onOpen, onEditPoster }: Pick<Props, "view" | "mediaMode" | "flashUrl" | "onOpen" | "onEditPoster"> & { items: Item[] }) {
  if (!items.length) return null;
  return <section className="mb-8">
    <h2 className="mb-3 text-sm font-semibold tracking-wide text-fg">Folders <span className="ml-1 text-xs font-normal text-mute">{items.length}</span></h2>
    <div className={view === "list" ? "grid grid-cols-1 gap-2" : folderCols}>
      {items.map((item) => <Card key={item.url} item={item} mediaMode={mediaMode} view={view} reveal="now" flash={flashUrl === item.url} onOpen={onOpen} onEditPoster={onEditPoster} onMount={noop} onUnmount={noop} />)}
    </div>
  </section>;
}

function VideoTile({ item, onOpen, featured = false }: { item: Item; onOpen: (it: Item) => void; featured?: boolean }) {
  const image = item.poster || "";
  return <button type="button" onClick={() => onOpen(item)} className={`group relative block shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#171717] text-left text-white ${featured ? "min-h-[230px] w-full" : "w-[142px] min-[700px]:w-[174px]"}`}>
    <div className={featured ? "absolute inset-0" : "aspect-[2/3] w-full"}>
      {image ? <img src={image} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="grid size-full place-items-center bg-gradient-to-br from-zinc-700 to-black text-3xl">▶</div>}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
    </div>
    <div className={featured ? "absolute inset-x-0 bottom-0 p-5" : "p-2.5"}>
      {featured && <div className="mb-1 text-[10px] uppercase tracking-[.2em] text-white/70">Featured</div>}
      <div className="line-clamp-2 text-sm font-semibold">{item.name}</div>
      <div className="mt-1 text-[10px] text-white/65">{fmtSize(item.size)}</div>
    </div>
    {featured && <span className="absolute right-5 bottom-5 grid size-12 place-items-center rounded-full border border-white/40 bg-black/40 text-xl">▶</span>}
  </button>;
}

function VideoExperience({ items, onOpen }: { items: Item[]; onOpen: (it: Item) => void }) {
  if (!items.length) return null;
  const [featured, ...rest] = items;
  const recent = rest.slice(0, 5);
  return <div className="stream-video-ui space-y-8 text-white">
    <section className="grid gap-4 min-[850px]:grid-cols-[minmax(0,1.7fr)_minmax(230px,.7fr)]">
      <VideoTile item={featured} onOpen={onOpen} featured />
      <div className="min-w-0 rounded-xl border border-white/10 bg-[#111] p-4">
        <h2 className="mb-3 text-sm font-semibold">Now watching</h2>
        <div className="space-y-3">{(recent.length ? recent : [featured]).slice(0, 4).map((item) => <button key={item.url} onClick={() => onOpen(item)} className="flex w-full items-center gap-3 text-left">
          <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-800">{item.poster && <img src={item.poster} alt="" className="size-full object-cover" />}<span className="absolute inset-0 grid place-items-center bg-black/20">▶</span></span>
          <span className="min-w-0"><span className="block line-clamp-2 text-xs font-medium">{item.name}</span><span className="mt-1 block text-[10px] text-white/50">{fmtSize(item.size)}</span></span>
        </button>)}</div>
      </div>
    </section>
    <section>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Videos</h2><span className="text-xs text-white/45">{items.length} titles</span></div>
      <div className="flex gap-3 overflow-x-auto pb-3">{items.map((item) => <VideoTile key={item.url} item={item} onOpen={onOpen} />)}</div>
    </section>
  </div>;
}

function PhotoExperience({ items, onOpen }: { items: Item[]; onOpen: (it: Item) => void }) {
  return <div className="stream-photo-ui">
    <div className="mb-4 flex items-center justify-between"><div><div className="text-xs uppercase tracking-[.2em] text-mute">Photo collection</div><h2 className="mt-1 text-xl font-semibold">Your moments</h2></div><span className="text-xs text-mute">{items.length} photos</span></div>
    <div className="columns-2 gap-3 min-[600px]:columns-3 min-[900px]:columns-4 min-[1200px]:columns-5">
      {items.map((item, index) => <button key={item.url} type="button" onClick={() => onOpen(item)} className="group mb-3 block w-full break-inside-avoid overflow-hidden rounded-xl border border-line bg-panel text-left">
        <div className="relative overflow-hidden bg-panel2" style={{ aspectRatio: index % 5 === 0 ? "4 / 5" : index % 3 === 0 ? "5 / 4" : "4 / 3" }}>
          <img src={item.thumb || item.view || item.url} alt={item.name} loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" />
        </div>
        <div className="truncate px-2.5 py-2 text-xs text-fg">{item.name}</div>
      </button>)}
    </div>
  </div>;
}

export function Grid({ items, view, mediaMode, leaving, skeleton, flashUrl, onOpen, onEditPoster }: Props) {
  const folders = useMemo(() => items.filter((item) => item.dir), [items]);
  const videos = useMemo(() => items.filter((item) => !item.dir && item.kind === "video"), [items]);
  const photos = useMemo(() => items.filter((item) => !item.dir && item.kind === "image"), [items]);
  const other = useMemo(() => items.filter((item) => !item.dir), [items]);

  if (skeleton) return <div className={folderCols}>{Array.from({ length: 8 }, (_, i) => <div key={i} className="overflow-hidden rounded-xl border border-line bg-panel"><Skeleton className="aspect-video rounded-none" /><div className="space-y-2 p-3"><Skeleton className="h-3" /><Skeleton className="h-3 w-1/2" /></div></div>)}</div>;

  const videoMode = mediaMode === "video";
  const photoMode = mediaMode === "photo";
  const mixedMode = mediaMode === "mixed";
  return <div data-leaving={leaving} className="space-y-7">
    <FolderSection items={folders} view={view} mediaMode={mediaMode} flashUrl={flashUrl} onOpen={onOpen} onEditPoster={onEditPoster} />
    {videoMode && <VideoExperience items={videos} onOpen={onOpen} />}
    {photoMode && <PhotoExperience items={photos} onOpen={onOpen} />}
    {mixedMode && <>
      {videos.length > 0 && <VideoExperience items={videos} onOpen={onOpen} />}
      {photos.length > 0 && <PhotoExperience items={photos} onOpen={onOpen} />}
    </>}
    {!videoMode && !photoMode && !mixedMode && <div className={folderCols}>{other.map((item) => <Card key={item.url} item={item} view={view} reveal="now" flash={flashUrl === item.url} onOpen={onOpen} onEditPoster={onEditPoster} onMount={noop} onUnmount={noop} />)}</div>}
  </div>;
}
