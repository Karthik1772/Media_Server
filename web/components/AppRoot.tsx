import { useEffect, useState } from "react";
import { Library } from "@/components/Library";
import { Providers } from "@/components/Providers";
import { readLibraryData } from "@/lib/data";

/** Everything the browser draws: providers, the splash, and the folder view. */
export default function AppRoot() {
  const [data] = useState(readLibraryData);

  return (
    <Providers>
      <Library data={data} />
    </Providers>
  );
}
