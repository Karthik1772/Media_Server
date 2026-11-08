/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export", // `next build` writes plain files to ./out, which server.py serves
  basePath: "/__ui", // server.py serves the app under /__ui/
  trailingSlash: true,
  images: { unoptimized: true },
  devIndicators: false,
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
