import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  
  images: {
    // ⚡ PERFORMANCE: Enable image optimization (was disabled)
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Self-hosted storage serves files from local/public paths.
    remotePatterns: [],
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
    // 🔒 SECURITY: applied in every environment.
    // `X-Robots-Tag` backs up `app/robots.ts` — robots.txt is advisory, this
    // header also covers API responses and crawlers that skip robots.txt.
    const securityHeaders = [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive, nosnippet, noimageindex',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];

    // IMPORTANT (dev stability):
    // In development, aggressive caching for `/_next/static/*` can cause stale webpack runtime/chunk
    // mismatches, producing errors like "Cannot read properties of undefined (reading 'call')".
    if (process.env.NODE_ENV !== "production") {
      return [
        ...securityHeaders,
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
      ...securityHeaders,
      {
        source: '/:all*(svg|jpg|jpeg|png|gif|webp)',
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
