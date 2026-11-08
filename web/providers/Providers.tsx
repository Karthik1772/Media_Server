import type { ReactNode } from "react";
import { Toaster } from "@/shared/components/ui/toaster";

/** App-wide things that live outside any one page. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
