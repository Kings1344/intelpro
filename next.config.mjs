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
  // The pm-AMM SDK and Anchor are CommonJS-heavy; let the server require them natively.
  serverExternalPackages: ["@pm-amm/sdk", "@anchor-lang/core", "pdfjs-dist"],
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
