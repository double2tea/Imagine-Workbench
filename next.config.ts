import type {NextConfig} from 'next';
import path from 'node:path';
import packageJson from './package.json';

const projectRoot = path.resolve(process.cwd());

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    serverMinification: false,
  },
  // Allow access to remote image placeholder.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', // This allows any path under the hostname
      },
    ],
  },
  output: 'standalone',
  outputFileTracingRoot: projectRoot,
  transpilePackages: ['motion'],
  webpack: (config, {dev}) => {
    // Opt-in no-watch mode for non-interactive agent sessions that rewrite files rapidly.
    // Normal local development should use `pnpm run dev`, which keeps HMR enabled.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
