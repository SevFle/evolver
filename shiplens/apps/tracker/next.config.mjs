/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@shiplens/types", "@shiplens/config"],
};

export default nextConfig;
