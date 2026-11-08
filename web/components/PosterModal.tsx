import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { pretty } from "@/lib/format";
import type { Item } from "@/lib/types";

interface Candidate {
  id: string;
  image_url: string;
  title: string;
  year?: string | number;
  source?: string;
  note?: string;
}

type Results =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "done"; items: Candidate[] };

interface Props {
  item: Item | null;
  path: string;
  onClose: () => void;
  onSaved: (it: Item, poster: string, wasShow: boolean) => void;
}

/** "Change poster": search TMDB / Wikipedia, or paste a link (TMDB page, Wikipedia page, or an image address). */
export function PosterModal({ item, path, onClose, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [link, setLink] = useState("");
  const [results, setResults] = useState<Results>({ state: "idle" });
  const [busyId, setBusyId] = useState("");
  const [busyLink, setBusyLink] = useState(false);
  const [shaking, setShaking] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // fill the form each time the dialog opens
  useEffect(() => {
    if (!item) return;
    setTitle(item.q_title || pretty(item));
    setYear(item.q_year ? String(item.q_year) : "");
    setLink("");
    setResults({ state: "idle" });
    setBusyId("");
    setBusyLink(false);
    setTimeout(() => titleRef.current?.focus(), 0);
  }, [item]);

  const shake = useCallback(() => {
    setShaking(false);
    requestAnimationFrame(() => {
      setShaking(true);
      setTimeout(() => setShaking(false), 480);
    });
  }, []);

  const posterKey = (it: Item) =>
    ((path || "/").replace(/^\/+|\/+$/g, "") + (path && path !== "/" ? "/" : "") + it.name).replace(/\\/g, "/");

  async function post(payload: Record<string, unknown>) {
    if (!item) return;
    payload.video_key = item.key || posterKey(item);
    payload.title = title.trim();
    payload.year = year.trim();
    try {
      const response = await fetch("/__api/poster-select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not save poster.");
      onSaved(item, result.poster || "", item.hint === "tv");
    } catch (error) {
      toast((error as Error).message || "Poster update failed");
      shake();
    }
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    const q = title.trim();
    if (!q) return toast("Enter a movie title first");
    setResults({ state: "loading" });
    try {
      const url = "/__api/poster-search?" + new URLSearchParams({ q, year: year.trim(), kind: item?.hint || "movie" });
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Poster search failed");
      setResults({ state: "done", items: data.results || [] });
    } catch (error) {
      setResults({ state: "error", message: (error as Error).message });
    }
  }

  function submitLink(e: FormEvent) {
    e.preventDefault();
    const value = link.trim();
    if (!value) return toast("Paste a TMDB or Wikipedia link first");
    let host = "";
    try {
      host = new URL(value).hostname.toLowerCase();
    } catch {
      shake();
      return toast("That doesn't look like a link - paste the full address");
    }
    if (!/(^|\.)(themoviedb\.org|tmdb\.org|wikipedia\.org|wikimedia\.org)$/.test(host)) {
      shake();
      return toast("Only TMDB and Wikipedia links are accepted");
    }
    toast("Fetching the image…");
    setBusyLink(true);
    post({ action: "url", link: value }).finally(() => setBusyLink(false));
  }

  function pick(c: Candidate) {
    setBusyId(c.id);
    post({ action: "select", candidate_id: c.id }).finally(() => setBusyId(""));
  }

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
