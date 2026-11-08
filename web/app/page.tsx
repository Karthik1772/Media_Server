"use client";

import dynamic from "next/dynamic";

// The app uses browser-only things (localStorage, the <video> element, the folder listing
// the server puts in the page), so it renders in the browser, not at build time.
const AppRoot = dynamic(() => import("@/components/AppRoot"), { ssr: false });

export default function Page() {
  return <AppRoot />;
}
