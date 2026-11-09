import * as React from "react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** id of the element that titles the dialog (for screen readers) */
  labelledBy?: string;
  /** classes for the dialog panel (e.g. an entrance animation) */
  className?: string;
  children: React.ReactNode;
}

/** Centered modal: closes on Escape or a click on the dim background. */
function Dialog({ open, onOpenChange, labelledBy, className, children }: DialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onMouseDown={(e) => e.target === e.currentTarget && onOpenChange(false)}
      className="fixed inset-0 z-80 grid animate-fade-in place-items-center bg-black/70 p-[18px] backdrop-blur-[6px]"
    >
      <div
        className={cn(
          "max-h-[min(88vh,900px)] w-[min(760px,100%)] overflow-auto rounded-[18px] border border-line bg-bg p-[15px] text-fg shadow-[0_24px_80px_rgba(0,0,0,.4)] min-[601px]:p-5",
          className,
        )}
      >
        {children}
      </div>
    </section>
  );
}

export { Dialog };
