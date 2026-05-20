/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  experimental: {
    /**
     * Tells Next.js to apply named-import tree-shaking to these packages so
     * each `import { x } from 'y'` only pulls in the modules that actually
     * back `x`. Big wins for the editor (DOMPurify is large) and admin pages
     * that only use one or two `framer-motion` primitives.
     */
    optimizePackageImports: [
      'framer-motion',
      'isomorphic-dompurify',
      'marked',
      'turndown',
      '@supabase/supabase-js',
    ],
  },
  /** Turbopack (`next dev --turbo`) rejects `compiler.*` if present—omit in development. */
  ...(process.env.NODE_ENV === 'production'
    ? {
        compiler: {
          removeConsole: { exclude: ['error'] },
        },
      }
    : {}),
  onDemandEntries: {
    maxInactiveAge: 120 * 1000,
    pagesBufferLength: 8,
  },
  transpilePackages: ['@supabase/supabase-js'],
  async headers() {
    return [
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' }],
      },
    ];
  },
  images: {
    unoptimized: false,
    deviceSizes: [640, 828, 1080, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
    ],
  },
};

export default nextConfig;
