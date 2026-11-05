import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Streamly · Private Media Hub",
  description: "High-performance private streaming for movies, videos, photos, and media.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)] transition-colors duration-200">
        {children}
      </body>
    </html>
  );
}
