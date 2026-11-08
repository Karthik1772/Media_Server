import type { ReactNode } from "react";
import type { Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d1014",
  colorScheme: "dark light",
};

// set the theme before the first paint so light-theme users never see a dark flash
const THEME_SCRIPT = `(function(){try{var t=JSON.parse(localStorage.getItem("theme")||"null");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t}catch(e){}})()`;
const PAINT_STYLE = `html{background:#0d1014}html[data-theme="light"]{background:#f3f5f8}`;
// read the listing the moment the browser parses it, before React starts
const DATA_SCRIPT = `try{window.__LIBRARY__=JSON.parse(document.getElementById("data").textContent)}catch(e){}`;

/**
 * The page around every folder. server.py fills in two things per request:
 *  - __DATA__  becomes this folder's listing (JSON)
 *  - a <title> with the folder's name is added to <head>
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: PAINT_STYLE }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="icon" type="image/png" href="/__ui/img/favicon.png" />
        <link rel="apple-touch-icon" href="/__ui/img/favicon.png" />
      </head>
      <body>
        <script id="data" type="application/json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: "__DATA__" }} />
        <script dangerouslySetInnerHTML={{ __html: DATA_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
