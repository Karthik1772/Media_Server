import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn("w-full min-w-0 rounded-[10px] border border-line bg-panel px-3 py-2.5 text-fg", className)}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
