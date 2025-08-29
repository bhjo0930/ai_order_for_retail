import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for containerized deployments
  output: 'standalone',
  
  // Optimize for production deployment
  poweredByHeader: false,
  generateEtags: false,
  compress: true,
  
  // Skip ESLint during build for production
  eslint: {
    ignoreDuringBuilds: process.env.NODE_ENV === 'production',
  },
  
  // Skip TypeScript type checking during build for production
  typescript: {
    ignoreBuildErrors: process.env.NODE_ENV === 'production',
  },
  
  // External packages that should not be bundled
  serverExternalPackages: [
    '@google-cloud/speech',
    '@google/generative-ai',
    'ws'
  ],
  
  // Environment variables to expose to the client
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  
  // Webpack configuration for external dependencies
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        '@google-cloud/speech': 'commonjs @google-cloud/speech',
        '@google/generative-ai': 'commonjs @google/generative-ai',
        'ws': 'commonjs ws'
      });
    }
    
    // Optimize bundle size
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    
    return config;
  },
  
  // Headers for security and performance
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      {
        source: '/api/health',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ];
  },
  
  // Experimental features for better performance
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js'],
  },
};

export default nextConfig;
