import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SortKey, ViewMode } from "@/lib/types";

interface Props {
  title: string;
  stats: string;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
}

/** Folder title and counts, plus the sort and grid / list controls. */
export function LibraryHead({ title, stats, sort, onSort, view, onView }: Props) {
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
    <div className="mt-1.5 mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="m-0 text-[clamp(22px,4vw,34px)] font-bold break-words">{title}</h1>
        <div className="mt-1 text-[13px] text-mute">{stats}</div>
      </div>
      <div className="flex w-full items-center justify-end gap-2 min-[601px]:w-auto">
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
          title="Sort"
          className="cursor-pointer rounded-[10px] border border-line bg-panel px-[11px] py-2 text-sm text-fg"
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
