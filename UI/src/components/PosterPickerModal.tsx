"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Search,
  Sparkles,
  Link as LinkIcon,
  RotateCcw,
  Loader2,
  Check,
} from "lucide-react";
import { MediaItem, PosterCandidate } from "@/lib/types";
import { searchPosters, applyPoster, resolveServerUrl } from "@/lib/api";
import { getCleanTitle, cn } from "@/lib/utils";

interface PosterPickerModalProps {
  item: MediaItem;
  onClose: () => void;
  onPosterUpdated: (newPosterUrl: string) => void;
}

export function PosterPickerModal({
  item,
  onClose,
  onPosterUpdated,
}: PosterPickerModalProps) {
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("");
  const [customLink, setCustomLink] = useState("");
  const [candidates, setCandidates] = useState<PosterCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const title = getCleanTitle(item);
    setQuery(title);
    if (item.year) setYear(item.year);
    performSearch(title, item.year);
  }, [item]);

  const performSearch = async (q: string, y?: string) => {
    if (!q.trim()) return;
    setIsLoading(true);
    setErrorMessage("");
    try {
      const data = await searchPosters(q, y);
      setCandidates(data.results || []);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to search posters");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query, year);
  };

  const handleSelectCandidate = async (candidate: PosterCandidate) => {
    if (!item.key) return;
    setIsApplying(true);
    try {
      const res = await applyPoster({
        action: "select",
        video_key: item.key,
        candidate_id: candidate.id,
        title: candidate.title,
      });
      if (res.ok) {
        onPosterUpdated(res.poster);
        onClose();
      }
    } catch (err: any) {
      alert("Failed to apply poster: " + err.message);
    } finally {
      setIsApplying(false);
    }
  };

  const handleApplyLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item.key || !customLink.trim()) return;
    setIsApplying(true);
    try {
      const res = await applyPoster({
        action: "link",
        video_key: item.key,
        link: customLink.trim(),
      });
      if (res.ok) {
        onPosterUpdated(res.poster);
        onClose();
      }
    } catch (err: any) {
      alert("Failed to apply poster from link: " + err.message);
    } finally {
      setIsApplying(false);
    }
  };

  const handleResetPoster = async () => {
    if (!item.key) return;
    setIsApplying(true);
    try {
      const res = await applyPoster({
        action: "reset",
        video_key: item.key,
      });
      if (res.ok) {
        onPosterUpdated(res.poster);
        onClose();
      }
    } catch (err: any) {
      alert("Failed to reset poster: " + err.message);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-2xl bg-[#14141f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Change Film Poster</h3>
              <p className="text-xs text-slate-400 truncate max-w-sm">{item.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar Form */}
        <div className="p-5 pb-3">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search movie title..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <input
              type="text"
              placeholder="Year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-20 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 text-center focus:border-indigo-500 outline-none"
            />
            <button
              type="submit"
              disabled={isLoading || isApplying}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
            </button>
          </form>
          {errorMessage && (
            <p className="text-xs text-rose-400 mt-2">{errorMessage}</p>
          )}
        </div>

        {/* Candidate Poster Results Grid */}
        <div className="p-5 pt-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
              <span className="text-xs">Searching TMDB & Wikipedia...</span>
            </div>
          ) : candidates.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 py-2">
              {candidates.map((cand) => (
                <div
                  key={cand.id}
                  onClick={() => handleSelectCandidate(cand)}
                  className="group relative flex flex-col rounded-xl overflow-hidden bg-white/5 border border-white/10 hover:border-indigo-500 cursor-pointer transition-all duration-200"
                >
                  <div className="aspect-[2/3] bg-black/40 overflow-hidden relative">
                    <img
                      src={cand.url}
                      alt={cand.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-black/70 backdrop-blur-sm text-indigo-300 border border-white/10">
                      {cand.source}
                    </div>
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium text-white truncate">
                      {cand.title}
                    </p>
                    {cand.year && (
                      <span className="text-[11px] text-slate-400">
                        {cand.year}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-slate-500">
              No posters found. Try adjusting your search query or paste a direct link below.
            </div>
          )}
        </div>

        {/* Custom Link & Reset Bar */}
        <div className="p-5 border-t border-white/10 bg-white/[0.02] flex flex-col gap-3">
          <form onSubmit={handleApplyLink} className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="url"
                placeholder="Paste TMDB or Wikipedia poster link..."
                value={customLink}
                onChange={(e) => setCustomLink(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={!customLink.trim() || isApplying}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-40"
            >
              Use Link
            </button>
          </form>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleResetPoster}
              disabled={isApplying}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to default poster</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

