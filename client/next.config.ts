import type { NextConfig } from "next";

const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:4000';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['mangadev.chit.sh'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
  async redirects() {
    const canonicalHost = (process.env.NEXT_PUBLIC_URL || 'https://hydramanga.com')
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .replace(/^www\./i, '');

    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: `www.${canonicalHost}` }],
        destination: `https://${canonicalHost}/:path*`,
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      // OAuth provider redirects land here; proxy to Better Auth on the backend
      {
        source: '/auth/callback/:path*',
        destination: `${BACKEND_INTERNAL_URL}/auth/callback/:path*`,
      },
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
      },
      {
        protocol: 'https',
        hostname: 'images.mangabaka.dev',
        pathname: '/**',
        search: '',
      },
      {
        protocol: 'https',
        hostname: 'cdn.mangabaka.dev',
        pathname: '/**',
        search: '',
      },
    ],
    // In Docker/production, skip optimization to avoid permission/server overhead
    unoptimized: process.env.NODE_ENV === 'production',
  },
};
export default nextConfig;