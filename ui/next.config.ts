import type { NextConfig } from "next";

// The Python server (server.py) runs this app with `npm run dev` on 127.0.0.1 and proxies it,
// so people open the Python port. Browsers on other devices therefore load /_next/* (and the
// hot-reload socket) from a LAN address, which the dev server only accepts when it is listed.
const lanIp = process.env.STREAMIFY_LAN_IP;

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  allowedDevOrigins: [
    ...(lanIp ? [lanIp] : []),
    "192.168.*.*",
    "10.*.*.*",
    "172.*.*.*",
  ],
  devIndicators: false,
};

export default nextConfig;
