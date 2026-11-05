"use client";

import React, { useRef, useEffect } from "react";
import {
  Film,
  Search,
  Grid,
  List,
  Sun,
  Moon,
  Folder,
  ChevronRight,
  ArrowUpDown,
  RefreshCw,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavbarProps {
  appName: string;
  currentPath: string;
  onNavigate: (path: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  sortBy: "name" | "date" | "size";
  onSortChange: (sort: "name" | "date" | "size") => void;
  isDark: boolean;
  onThemeToggle: () => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export function Navbar({
  appName,
  currentPath,
  onNavigate,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  sortBy,
  onSortChange,
  isDark,
  onThemeToggle,
  onRefresh,
  isLoading,
}: NavbarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut '/' to search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Split path into breadcrumbs
  const pathParts = currentPath
    .split("/")
    .filter(Boolean)
    .map((part, index, array) => ({
      name: decodeURIComponent(part),
      path: "/" + array.slice(0, index + 1).join("/"),
    }));

  return (
    <header className="sticky top-0 z-40 w-full glass border-b border-white/10 px-4 lg:px-8 py-3 transition-all duration-200">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Brand & Breadcrumbs */}
        <div className="flex items-center gap-3 overflow-x-auto py-1 scrollbar-none">
          <button
            onClick={() => onNavigate("/")}
            className="flex items-center gap-2 group text-left shrink-0"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <Film className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-200 bg-clip-text text-transparent">
              {appName || "Streamly"}
            </span>
          </button>

          {/* Breadcrumb Separator */}
          <div className="flex items-center gap-1.5 text-sm font-medium text-slate-400 overflow-x-auto whitespace-nowrap pl-2">
            <button
              onClick={() => onNavigate("/")}
              className={cn(
                "hover:text-white transition-colors flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/5",
                currentPath === "/" && "text-indigo-400 font-semibold"
              )}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Home</span>
            </button>

            {pathParts.map((item, index) => {
              const isLast = index === pathParts.length - 1;
              return (
                <React.Fragment key={item.path}>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <button
                    onClick={() => onNavigate(item.path)}
                    className={cn(
                      "hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-white/5",
                      isLast
                        ? "text-indigo-400 font-semibold cursor-default"
                        : "text-slate-400"
                    )}
                  >
                    {item.name}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Right side controls: Search, Sort, View, Theme */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Search Input */}
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search files... (/)"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-sm bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/10 focus:border-indigo-500 rounded-lg outline-none text-slate-200 placeholder:text-slate-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div className="relative flex items-center">
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as any)}
              className="appearance-none bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 font-medium py-2 pl-7 pr-6 rounded-lg outline-none cursor-pointer focus:border-indigo-500 transition-colors"
            >
              <option value="name" className="bg-[#13131c] text-white">Name</option>
              <option value="date" className="bg-[#13131c] text-white">Newest</option>
              <option value="size" className="bg-[#13131c] text-white">Largest</option>
            </select>
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-0.5">
            <button
              onClick={() => onViewModeChange("grid")}
              className={cn(
                "p-1.5 rounded-md text-slate-400 hover:text-white transition-all",
                viewMode === "grid" && "bg-indigo-600 text-white shadow-sm"
              )}
              title="Grid View"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => onViewModeChange("list")}
              className={cn(
                "p-1.5 rounded-md text-slate-400 hover:text-white transition-all",
                viewMode === "list" && "bg-indigo-600 text-white shadow-sm"
              )}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors"
            title="Refresh library"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin text-indigo-400")} />
          </button>

          {/* Theme Toggle */}
          <button
            onClick={onThemeToggle}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors"
            title={isDark ? "Switch to light theme" : "Switch to dark theme"}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
          </button>
        </div>
      </div>
    </header>
  );
}

