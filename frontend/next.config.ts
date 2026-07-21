import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Produces a minimal, self-contained server bundle (.next/standalone) —
  // used by frontend/Dockerfile so the production image doesn't need to
  // ship node_modules or the full source tree. Not required for Vercel
  // (which has its own build pipeline and ignores this), but keeps the
  // option open to containerize the frontend later without config changes.
  output: "standalone",

  experimental: {
    // lucide-react ships every icon from one barrel file; without this,
    // a bundler can end up pulling more of that file into a route's
    // chunk than the handful of icons it actually imports. This rewrites
    // `import { X } from "lucide-react"` to import directly from each
    // icon's own module at build time — same code, smaller chunks. Every
    // page in this app imports from lucide-react (it's the only icon
    // library used throughout), so this is a broad, low-risk win rather
    // than a micro-optimization for one page.
    optimizePackageImports: ["lucide-react"],
  },

  images: {
    // Allows next/image to optimize images served from Supabase Storage
    // (e.g. uploaded document thumbnails) without hardcoding a specific
    // project ref — only the host *pattern* and path prefix are
    // restricted, which is what actually matters for security here
    // (arbitrary third-party image hosts are never allowed).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  // Security headers applied to every response. Set here (rather than in
  // a platform-specific vercel.json) so they apply identically whether
  // this is deployed on Vercel, self-hosted, or containerized — see
  // DEPLOYMENT.md for why this project doesn't use vercel.json.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Prevents this site from being embedded in an <iframe> on
          // another origin (clickjacking protection).
          { key: "X-Frame-Options", value: "DENY" },
          // Stops browsers from MIME-sniffing a response away from its
          // declared Content-Type.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Limits how much referrer information is sent to other origins.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Disables browser features this app never uses, reducing the
          // attack surface if a dependency is ever compromised via XSS.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
