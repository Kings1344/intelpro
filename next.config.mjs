/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(process.env.NODE_ENV === "production" && (process.env.APP_URL ?? "").startsWith("https://")
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for Docker / any Node host (see Dockerfile).
  output: "standalone",
  poweredByHeader: false,
  // pdfjs-dist stays external. The pm-AMM SDK is ESM that does `import { BN } from "@anchor-lang/core"`
  // (CommonJS); Node's native ESM loader rejects that named import (seen in CI), so bundle both and
  // let webpack handle the interop.
  transpilePackages: ["@pm-amm/sdk", "@anchor-lang/core"],
  serverExternalPackages: ["pdfjs-dist"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Browser polyfills required by @solana/web3.js / pm-AMM SDK.
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false, crypto: false };
    }
    return config;
  },
};

export default nextConfig;
