import { useEffect, useState } from "react";
import { Library } from "@/components/Library";
import { Providers } from "@/components/Providers";
import { Splash } from "@/components/Splash";
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
