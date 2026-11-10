import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap no-underline disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-0 bg-linear-135 from-accent to-accent2 font-semibold text-white",
        secondary: "border-0 bg-panel2 text-fg hover:bg-line",
        outline: "border border-line bg-panel text-fg",
        /** sits on top of a video or photo */
        overlay: "border-0 bg-white/14 text-white hover:bg-white/26",
        link: "border-0 bg-transparent text-mute underline",
      },
      size: {
        default: "rounded-[10px] px-3.5 py-2.5",
        sm: "rounded-[10px] px-[13px] py-[9px] text-sm",
        icon: "size-10 rounded-full p-0 text-lg min-[361px]:size-[42px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** shows a spinner in place of the label and ignores clicks */
  busy?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, busy, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      data-ripple
      disabled={disabled || busy}
      className={cn(buttonVariants({ variant, size }), busy && "pointer-events-none opacity-75", className)}
      {...props}
    >
      <span className={cn("contents", busy && "invisible")}>{children}</span>
      {busy && (
        <span className="absolute top-1/2 left-1/2 -mt-[13px] -ml-[13px] size-[26px] animate-spin-mid rounded-full border-[3px] border-white/30 border-t-white" />
      )}
    </button>
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
