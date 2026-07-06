/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The API base the server-side proxy forwards to (see src/app/api/backend/[...path]/route.ts).
  env: {
    ONESTACK_API_BASE: process.env.ONESTACK_API_BASE ?? 'http://localhost:3001/api/v1',
  },
};

export default nextConfig;
