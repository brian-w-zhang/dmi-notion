import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* Phaser is loaded via next/dynamic(ssr: false), so we don't need 
     complex webpack externals in most cases with Next 16/Turbopack. */
  devIndicators: false,
  turbopack: {
    root: __dirname,
  }, 
};

export default nextConfig;
