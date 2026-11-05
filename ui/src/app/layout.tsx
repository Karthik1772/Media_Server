import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Media Server",
  description: "Browse and stream your media files",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {/* Colour field that the glass panels blur and refract */}
        <div className="bg-scene" aria-hidden="true">
          <span className="blob blob-1" />
          <span className="blob blob-2" />
          <span className="blob blob-3" />
          <span className="blob blob-4" />
        </div>
        {children}
      </body>
    </html>
  );
}
