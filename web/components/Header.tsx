import { forwardRef } from "react";
import { NavLink } from "@/components/NavLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Input } from "@/components/ui/input";
import { asset } from "@/lib/motion";

interface Props {
  appName: string;
  query: string;
  onQuery: (q: string) => void;
}

export const Header = forwardRef<HTMLInputElement, Props>(function Header({ appName, query, onQuery }, searchRef) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg/80 px-2.5 pt-[calc(10px+env(safe-area-inset-top))] pb-2.5 backdrop-blur-[14px] min-[601px]:gap-3.5 min-[601px]:px-4">
      <NavLink
        href="/"
        className="inline-flex min-w-0 flex-none items-center gap-2.5 text-lg whitespace-nowrap text-fg no-underline min-[601px]:text-xl"
      >
        <img
          src={asset("favicon.png")}
          alt=""
            className="block size-8 shrink-0 rounded-lg"
        />
        <b className="hidden overflow-hidden bg-linear-90 from-accent to-accent2 bg-clip-text text-ellipsis text-transparent min-[421px]:block">
          {appName}
        </b>
      </NavLink>

      <label className="ml-auto flex max-w-[460px] min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-panel px-2.5 focus-within:border-accent2 min-[601px]:px-3.5">
        <span aria-hidden="true">&#128269;</span>
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search this folder   ( / )"
          autoComplete="off"
          className="flex-1 border-0 bg-transparent px-0 py-2.5 text-sm outline-0 min-[601px]:text-[15px]"
        />
      </label>

      <ThemeToggle />
    </header>
  );
});
