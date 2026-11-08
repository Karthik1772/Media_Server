import { forwardRef } from "react";
import { NavLink } from "@/shared/components/NavLink";
import { ThemeToggle } from "@/features/theme/view/ThemeToggle";
import { Input } from "@/shared/components/ui/input";
import { asset } from "@/lib/motion";

interface Props {
  appName: string;
  query: string;
  onQuery: (q: string) => void;
}

export const Header = forwardRef<HTMLInputElement, Props>(function Header({ appName, query, onQuery }, searchRef) {
  return (
    <header className="surface-glass sticky top-0 z-20 flex items-center gap-2 border-x-0 border-t-0 px-3 pt-[calc(11px+env(safe-area-inset-top))] pb-3 min-[601px]:gap-4 min-[601px]:px-6">
      <NavLink
        href="/"
        className="inline-flex min-w-0 flex-none items-center gap-3 text-lg tracking-[-0.03em] whitespace-nowrap text-fg no-underline min-[601px]:text-xl"
      >
        <img
          src={asset("favicon.png")}
          alt=""
          className="block size-9 shrink-0 rounded-xl border border-line object-cover"
        />
        <b className="hidden overflow-hidden text-ellipsis font-semibold text-fg min-[421px]:block">
          {appName}
        </b>
      </NavLink>

      <label className="ml-auto flex max-w-[520px] min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-panel/80 px-3 focus-within:border-accent2 focus-within:ring-2 focus-within:ring-accent/10 min-[601px]:px-4">
        <span aria-hidden="true" className="text-mute">⌕</span>
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search this folder   ( / )"
          autoComplete="off"
          className="flex-1 border-0 bg-transparent px-0 py-3 text-sm outline-0 placeholder:text-mute/80 min-[601px]:text-[14px]"
        />
      </label>

      <ThemeToggle />
    </header>
  );
});
