/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    domains: ['localhost'],
    unoptimized: true,
  },
  // Completely disable source maps
  productionBrowserSourceMaps: false,
};

module.exports = nextConfig;