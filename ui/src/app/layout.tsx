import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Streamify",
  description: "Modern private media browser & streaming center",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="min-h-full flex flex-col relative z-10 selection:bg-blue-600/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
