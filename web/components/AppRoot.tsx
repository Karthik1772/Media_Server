import { useEffect, useState } from "react";
import { Library } from "@/features/library/view/Library";
import { Providers } from "@/providers/Providers";
import { Splash } from "@/shared/components/Splash";
import { readLibraryData } from "@/lib/data";
import { installRipple } from "@/lib/ripple";

/** Everything the browser draws: providers, the splash, and the folder view. */
export default function AppRoot() {
  const [data] = useState(readLibraryData);
  useEffect(() => installRipple(), []);

  return (
    <Providers>
      <Splash />
      <Library data={data} />
    </Providers>
  );
}
