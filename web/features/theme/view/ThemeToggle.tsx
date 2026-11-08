import { useRef } from "react";
import { useThemeViewModel } from "@/features/theme/viewmodel/useThemeViewModel";
import { Button } from "@/shared/components/ui/button";

/** Light / dark switch with a restrained theme transition. */
export function ThemeToggle() {
  const { theme, toggle } = useThemeViewModel();
  const ref = useRef<HTMLButtonElement>(null);
  const dark = theme === "dark";

  return (
    <Button
      ref={ref}
      variant="outline"
      size="icon"
      onClick={() => toggle(ref.current)}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      className="flex-none"
    >
      {dark ? "☀️" : "🌙"}
    </Button>
  );
}
