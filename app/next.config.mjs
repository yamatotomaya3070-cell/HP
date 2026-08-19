/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prisma を server 側で正しく扱う。
  serverExternalPackages: ["@prisma/client", "prisma"],
  // ESM 流儀の `.js` 付き import（例: "@/lib/db.js"）を .ts/.tsx へ解決する。
  // tsx/Node と Next(webpack) の両方で同じ import を使えるようにするため。
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
