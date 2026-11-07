import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Telegram loads the Mini App inside an iframe on web.telegram.org.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
