/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:2904';

const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/__api/:path*',
        destination: `${BACKEND_URL}/__api/:path*`,
      },
      {
        source: '/__film/:path*',
        destination: `${BACKEND_URL}/__film/:path*`,
      },
      {
        source: '/__photo/:path*',
        destination: `${BACKEND_URL}/__photo/:path*`,
      },
      {
        source: '/__short/:path*',
        destination: `${BACKEND_URL}/__short/:path*`,
      },
      {
        source: '/__audio/:path*',
        destination: `${BACKEND_URL}/__audio/:path*`,
      },
      {
        source: '/__ui/assets/:path*',
        destination: `${BACKEND_URL}/__ui/assets/:path*`,
      },
    ];
  },
};

export default nextConfig;

