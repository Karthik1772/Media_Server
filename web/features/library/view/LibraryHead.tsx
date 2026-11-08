import { Button } from "@/shared/components/ui/button";
import { cn } from "@/lib/utils";
import type { SortKey, ViewMode } from "@/lib/types";

interface Props {
  title: string;
  stats: string;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  view: ViewMode;
  backdrop?: string;
  onView: (v: ViewMode) => void;
}

/** Folder title and counts, plus the sort and grid / list controls. */
export function LibraryHead({ title, stats, sort, onSort, view, onView, backdrop }: Props) {
  const seg = (mode: ViewMode, label: string, icon: string, round: string) => (
    <Button
      title={label}
      onClick={() => onView(mode)}
      variant={view === mode ? "default" : "outline"}
      size="sm"
      className={cn(
        round,
        "px-[11px] font-normal",
        view === mode && "border-transparent",
        mode === "list" && "border-l-0",
      )}
    >
      {icon}
    </Button>
  );

  return (
    <div className="library-hero relative mt-5 mb-5 flex min-h-[150px] flex-wrap items-end justify-between gap-4 overflow-hidden rounded-2xl border border-line px-4 py-5 min-[601px]:mt-6 min-[601px]:mb-6 min-[601px]:min-h-[190px] min-[601px]:px-7 min-[601px]:py-7">
      {backdrop && <img src={backdrop} alt="" aria-hidden="true" className="library-hero-art pointer-events-none absolute inset-0 size-full object-cover" />}
      <div className="relative z-[1] min-w-0">
        <span className="mb-2 block text-[10px] font-semibold tracking-[0.18em] text-accent/90">YOUR COLLECTION</span>
        <h1 className="m-0 text-[clamp(24px,4vw,38px)] font-semibold tracking-[-0.045em] break-words">{title}</h1>
        <div className="mt-1.5 text-[13px] tracking-[0.01em] text-mute">{stats}</div>
      </div>
      <div className="relative z-[1] flex w-full items-center justify-end gap-2 min-[601px]:w-auto">
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
          title="Sort"
          className="interactive-surface cursor-pointer rounded-xl border border-line bg-panel/90 px-3 py-2.5 text-sm text-fg hover:border-line-strong"
        >
          <option value="name">Name</option>
          <option value="date">Newest</option>
          <option value="size">Largest</option>
        </select>
        <div className="flex">
          {seg("grid", "Grid", "\u25A6", "rounded-r-none")}
          {seg("list", "List", "\u2630", "rounded-l-none")}
        </div>
      </div>
    </div>
  );
}
