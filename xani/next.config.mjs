/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tauri serves a static export from the built frontend.
  output: 'export',
  images: { unoptimized: true },
  // Tauri expects a trailing-slash-friendly static site.
  trailingSlash: true,
};

export default nextConfig;
