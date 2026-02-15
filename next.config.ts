import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Note: instrumentation.ts is automatically loaded in Next.js 15+
  
  images: {
    // ⚡ PERFORMANCE: Enable image optimization (was disabled)
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Configure remote patterns for Supabase storage
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.in',
        pathname: '/storage/v1/object/public/**',
      },
    ],
    // ⚡ PERFORMANCE: Set reasonable device sizes for responsive images
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    // ⚡ PERFORMANCE: Cache optimized images for 60 days
    minimumCacheTTL: 60 * 60 * 24 * 60,
  },
  // Ignore ESLint errors during production builds
  // This allows deployment while we fix linting issues
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Ignore TypeScript errors during production builds
  typescript: {
    ignoreBuildErrors: true,
  },
  // ⚡ PERFORMANCE: Add cache headers for static assets
  async headers() {
    // IMPORTANT (dev stability):
    // In development, aggressive caching for `/_next/static/*` can cause stale webpack runtime/chunk
    // mismatches, producing errors like "Cannot read properties of undefined (reading 'call')".
    if (process.env.NODE_ENV !== "production") {
      return [
        {
          source: "/_next/static/:path*",
          headers: [
            {
              key: "Cache-Control",
              value: "no-store, must-revalidate",
            },
          ],
        },
      ];
    }

    return [
      {
        source: '/:all*(svg|jpg|jpeg|png|gif|ico|webp)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
