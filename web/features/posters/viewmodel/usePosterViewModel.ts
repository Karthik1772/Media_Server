import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Item } from "@/lib/types";
import { pretty } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import { savePoster, searchPosters } from "@/features/posters/model/posterRepository";
import type { PosterCandidate, PosterSearchResults } from "@/features/posters/model/poster.types";

interface Options {
  item: Item | null;
  path: string;
  onSaved: (item: Item, poster: string, wasShow: boolean) => void;
}

/** Poster picker ViewModel: form state, validation, search and save actions. */
export function usePosterViewModel({ item, path, onSaved }: Options) {
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [link, setLink] = useState("");
  const [results, setResults] = useState<PosterSearchResults>({ state: "idle" });
  const [busyId, setBusyId] = useState("");
  const [busyLink, setBusyLink] = useState(false);
  const [shaking, setShaking] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!item) return;
    setTitle(item.q_title || pretty(item));
    setYear(item.q_year ? String(item.q_year) : "");
    setLink("");
    setResults({ state: "idle" });
    setBusyId("");
    setBusyLink(false);
    const focusTimer = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [item]);

  const shake = useCallback(() => {
    setShaking(false);
    requestAnimationFrame(() => {
      setShaking(true);
      window.setTimeout(() => setShaking(false), 220);
    });
  }, []);

  const posterKey = useCallback((target: Item) =>
    ((path || "/").replace(/^\/+|\/+$/g, "") + (path && path !== "/" ? "/" : "") + target.name).replace(/\\/g, "/"), [path]);

  const post = useCallback(async (payload: Record<string, unknown>) => {
    if (!item) return;
    const request = { ...payload, video_key: item.key || posterKey(item), title: title.trim(), year: year.trim() };
    try {
      const result = await savePoster(request);
      onSaved(item, result.poster || "", item.hint === "tv");
    } catch (error) {
      toast((error as Error).message || "Poster update failed");
      shake();
    }
  }, [item, onSaved, posterKey, title, year, shake]);

  const search = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    const query = title.trim();
    if (!query) return toast("Enter a movie title first");
    setResults({ state: "loading" });
    try {
      const items = await searchPosters(query, year.trim(), item?.hint || "movie");
      setResults({ state: "done", items });
    } catch (error) {
      setResults({ state: "error", message: (error as Error).message });
    }
  }, [title, year, item]);

  const submitLink = useCallback((event: FormEvent) => {
    event.preventDefault();
    const value = link.trim();
    if (!value) return toast("Paste a TMDB or Wikipedia link first");
    let host = "";
    try { host = new URL(value).hostname.toLowerCase(); }
    catch { shake(); return toast("That doesn't look like a link - paste the full address"); }
    if (!/(^|\.)(themoviedb\.org|tmdb\.org|wikipedia\.org|wikimedia\.org)$/.test(host)) {
      shake();
      return toast("Only TMDB and Wikipedia links are accepted");
    }
    toast("Fetching the image…");
    setBusyLink(true);
    void post({ action: "url", link: value }).finally(() => setBusyLink(false));
  }, [link, post, shake]);

  const pick = useCallback((candidate: PosterCandidate) => {
    setBusyId(candidate.id);
    void post({ action: "select", candidate_id: candidate.id }).finally(() => setBusyId(""));
  }, [post]);

  return { title, setTitle, year, setYear, link, setLink, results, busyId, busyLink, shaking, titleRef, search, submitLink, pick };
}
