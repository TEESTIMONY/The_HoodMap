/** @type {import('next').NextConfig} */
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3001";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // Proxy the analytics API so the browser talks same-origin (no CORS).
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
    ];
  },
};

export default nextConfig;
