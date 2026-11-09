import { useRef } from "react";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";

/** Light / dark switch: the new theme wipes across the screen from this button. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const ref = useRef<HTMLButtonElement>(null);
  const dark = theme === "dark";

  return (
    <Button
      ref={ref}
      key={theme} // replays the little spin each time
      variant="outline"
      size="icon"
      onClick={() => toggle(ref.current)}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      className="flex-none animate-tspin"
    >
      {dark ? "☀️" : "🌙"}
    </Button>
  );
}
