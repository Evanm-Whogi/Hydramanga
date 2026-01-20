import type { NextConfig } from "next";

const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:4000';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_INTERNAL_URL}/:path*`,
      },
      {
        source: '/admin/queues/:path*',
        destination: `${BACKEND_INTERNAL_URL}/admin/queues/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.chit.sh',
        pathname: '/**',
        search: '',
      },
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
        pathname: '/**',
        search: '',
      }
    ],
    // In Docker/production, skip optimization to avoid permission/server overhead
    unoptimized: process.env.NODE_ENV === 'production',
  },
};
export default nextConfig;