import { createContext, forwardRef, useContext, type AnchorHTMLAttributes } from "react";

/** Opening a folder: the cards fade out, placeholders show, then the next page loads. */
const NavContext = createContext<(href: string) => void>((href) => {
  location.href = href;
});

export const NavProvider = NavContext.Provider;

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export const NavLink = forwardRef<HTMLAnchorElement, Props>(function NavLink({ href, onClick, ...rest }, ref) {
  const go = useContext(NavContext);
  return (
    <a
      ref={ref}
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        const u = new URL(href, location.href);
        if (u.origin !== location.origin) return;
        if (u.pathname === location.pathname && u.search === location.search) return;
        e.preventDefault();
        go(u.href);
      }}
      {...rest}
    />
  );
});
