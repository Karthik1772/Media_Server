import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { pretty } from "@/lib/format";
import type { Item } from "@/lib/types";
import { usePosterViewModel } from "@/features/posters/viewmodel/usePosterViewModel";

interface Props {
  item: Item | null;
  path: string;
  onClose: () => void;
  onSaved: (it: Item, poster: string, wasShow: boolean) => void;
}

/** "Change poster": search TMDB / Wikipedia, or paste a supported source link. */
export function PosterModal({ item, path, onClose, onSaved }: Props) {
  const { title, setTitle, year, setYear, link, setLink, results, busyId, busyLink, shaking, titleRef, search, submitLink, pick } =
    usePosterViewModel({ item, path, onSaved });

  if (!item) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      labelledBy="posterHeading"
      className={shaking ? "animate-shake" : "animate-dialog-in"}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="posterHeading" className="m-0 text-[22px] font-bold">
            Change poster
          </h2>
          <p className="mt-[5px] mb-0 text-[13px] text-mute">{pretty(item)}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose} aria-label="Close poster picker" className="flex-none">
          ✕
        </Button>
      </div>

      <form
        onSubmit={search}
        className="mt-[18px] mb-2.5 grid grid-cols-[minmax(0,1fr)_84px] gap-2 min-[601px]:grid-cols-[minmax(0,1fr)_100px_auto]"
      >
        <Input
          ref={titleRef}
          type="search"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Search movie title"
          autoComplete="off"
        />
        <Input
          type="number"
          min={1900}
          max={2100}
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="Year"
          aria-label="Release year (optional)"
        />
        <Button type="submit" busy={results.state === "loading"} className="col-span-full min-[601px]:col-auto">
          Search posters
        </Button>
      </form>

      <p className="text-[13px] leading-[1.45] text-mute">
        Searches TMDB (posters come from media.themoviedb.org) and Wikipedia. Pick the right poster, or paste a link
        below. Your choice is saved permanently and the automatic scan will never change it.
      </p>

      <div className="my-3.5 grid grid-cols-2 gap-2.5 min-[601px]:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
        {results.state === "loading" &&
          Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-2">
              <Skeleton className="aspect-[2/3] rounded-[7px]" />
              <Skeleton className="h-[11px] rounded-[7px]" />
              <Skeleton className="h-[11px] w-[60%] rounded-[7px]" />
            </div>
          ))}
        {results.state === "done" &&
          results.items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c)}
              className={`relative flex min-w-0 cursor-pointer flex-col gap-2 rounded-xl border border-line bg-panel p-2 text-left text-fg hover:-translate-y-px hover:border-accent2 ${
                busyId === c.id ? "pointer-events-none opacity-75" : ""
              }`}
            >
              <img
                src={c.image_url}
                alt=""
                referrerPolicy="no-referrer"
                className="block aspect-[2/3] w-full rounded-[7px] bg-panel2 object-cover"
              />
              <span className="flex flex-col gap-[3px]">
                <b className="text-[13px] leading-[1.3]">{c.title}</b>
                <small className="text-mute">{[c.year, c.source, c.note].filter(Boolean).join(" · ")}</small>
              </span>
              {busyId === c.id && (
                <span className="absolute top-1/2 left-1/2 -mt-[13px] -ml-[13px] size-[26px] animate-spin-mid rounded-full border-[3px] border-white/30 border-t-white" />
              )}
            </button>
          ))}
      </div>
      {results.state === "done" && results.items.length === 0 && (
        <p className="text-[13px] leading-[1.45] text-mute">
          No posters found. Try another title or paste a link below.
        </p>
      )}
      {results.state === "error" && (
        <p className="text-[13px] leading-[1.45] text-mute">
          {results.message}. You can paste a TMDB or Wikipedia link instead.
        </p>
      )}

      <form onSubmit={submitLink} className="mt-4 grid gap-[9px] border-t border-line pt-4">
        <label htmlFor="posterLink" className="text-[13px] text-mute">
          Or paste a link: a TMDB movie / TV page, a Wikipedia page, or an image link from media.themoviedb.org /
          image.tmdb.org / upload.wikimedia.org
        </label>
        <Input
          id="posterLink"
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://www.themoviedb.org/movie/…"
          autoComplete="off"
        />
        <Button type="submit" busy={busyLink}>
          Use this link
        </Button>
      </form>

      <Button variant="link" onClick={() => post({ action: "reset" })} className="mt-3 px-0 py-2">
        Reset to default poster
      </Button>
    </Dialog>
  );
}
