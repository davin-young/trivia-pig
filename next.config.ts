import type { NextConfig } from "next";

// Content-Security-Policy. Scripts, styles, fonts and sockets come only from this site; clue
// images, audio and video may be any https URL (hosts paste links); the only frame is YouTube.
// Next.js needs inline scripts and React needs inline styles, so those stay allowed: the policy
// still stops injected markup from loading outside scripts, posting forms elsewhere, changing
// the base URL, or framing the site.
const dev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "frame-src https://www.youtube-nocookie.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
      // Signed-in and per-game pages have nothing for a search engine.
      ...["/dashboard/:path*", "/admin/:path*", "/boards/:path*", "/host/:path*", "/play/:path*", "/display/:code", "/watch/:path*", "/overlay/:path*", "/results/:path*", "/r/:path*", "/share/:path*", "/invite/:path*", "/login", "/try/claim", "/pair-expired", "/api/:path*"].map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })),
    ];
  },
  serverExternalPackages: ["@prisma/client", "bcryptjs", "nodemailer"],
};

export default nextConfig;
