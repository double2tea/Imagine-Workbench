import type {NextConfig} from 'next';
import path from 'node:path';
import packageJson from './package.json';

const projectRoot = path.resolve(process.cwd());
const isCloudflarePagesBuild = process.env.IMAGINE_CLOUDFLARE_PAGES_BUILD === '1';

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_IMAGINE_BROWSER_BYOK:
      process.env.NEXT_PUBLIC_IMAGINE_BROWSER_BYOK === "1" ||
      process.env.IMAGINE_BROWSER_BYOK === "1" ||
      process.env.IMAGINE_CLOUDFLARE_PAGES_BUILD === "1"
        ? "1"
        : "",
  },
  reactStrictMode: true,
  devIndicators: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    serverMinification: false,
    ...(isCloudflarePagesBuild ? { cpus: 1 } : {}),
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
