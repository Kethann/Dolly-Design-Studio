import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
// On Cloudflare there is no image optimiser (sharp), so pictures are served as they are (the portal shrinks uploads).
const onCloudflare = process.env.DEPLOY_TARGET === "cloudflare" || !!process.env.WORKERS_CI || !!process.env.CF_PAGES;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  images: {
    // While editing locally, show images straight from public/images, so an added or replaced
    // file appears as soon as the page is refreshed. The live site serves optimised AVIF/WebP.
    unoptimized: isDev || onCloudflare,
    formats: ["image/avif", "image/webp"],
    deviceSizes: [480, 640, 828, 1080, 1280, 1600, 1920, 2560, 3840],
    imageSizes: [96, 160, 256, 384],
    qualities: [75, 90, 95],
    // Safe to cache for a long time: every image address carries a fingerprint of the file's
    // contents (?v=…, see lib/images.ts), so a replaced image always gets a fresh address.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    localPatterns: [{ pathname: "/images/**" }],
  },
  async headers() {
    // Safe defaults for every response: no MIME sniffing, no framing by other sites (the portal's own preview is the
    // same site, so it still works), a careful referrer, and no camera / microphone / location for any page.
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ];
    const always = [
      { source: "/:path*", headers: security },
      // The portal and its API are private and always fresh: never stored by a browser or a shared cache.
      { source: "/portal", headers: [{ key: "Cache-Control", value: "no-store" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
    if (isDev) return always; // never cache aggressively in dev — a replaced file must show up on refresh, every time
    return [
      ...always,
      { source: "/:path*", headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] },
      {
        // Safe to cache the raw files for a long time too: see the versionedSrc comment above.
        source: "/images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
