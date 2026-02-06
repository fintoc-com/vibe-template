import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Empty turbopack config to silence warning
  // Turbopack automatically ignores common patterns like node_modules
  // and handles large files better than webpack by default
  turbopack: {},
};

export default nextConfig;
