/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'standalone',
  images: {
    domains: ['localhost'],
    unoptimized: true,
  },
  experimental: {
    outputFileTracingRoot: require('path').join(__dirname, '../'),
  },
};

module.exports = nextConfig;