import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Media Server",
  description: "Browse and stream your media files",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col relative z-10">
        {children}
      </body>
    </html>
  );
}
