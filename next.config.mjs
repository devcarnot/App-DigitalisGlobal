/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['framer-motion'],
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
