import { NavLink } from "@/components/NavLink";

export interface Crumb {
  name: string;
  href: string;
}

/** Home › Movies › Kannada - every step is a link. */
export function Crumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="scrollbar-none flex items-center gap-1.5 overflow-x-auto pt-1 pb-2.5 text-sm whitespace-nowrap">
      {crumbs.map((c, i) => {
        const cur = i === crumbs.length - 1;
        return (
          <span key={c.href} className="contents">
            {i > 0 && <i className="text-mute not-italic">&#8250;</i>}
            <NavLink
              href={c.href}
              className={`rounded-full border bg-panel px-2.5 py-[5px] no-underline hover:border-accent2 hover:text-fg ${
                cur ? "border-accent2 text-fg" : "border-line text-mute"
              }`}
            >
              {c.name}
            </NavLink>
          </span>
        );
      })}
    </nav>
  );
}
