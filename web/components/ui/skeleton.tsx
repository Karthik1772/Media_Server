import * as React from "react";
import { cn } from "@/lib/utils";

/** Grey placeholder with a moving highlight, shown while something loads. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("shimmer-bg rounded-md", className)} {...props} />;
}

export { Skeleton };
