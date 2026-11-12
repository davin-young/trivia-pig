import type { MetadataRoute } from "next";
import { siteUrl } from "@/shared/site";

export const dynamic = "force-dynamic";

/** Public pages are the homepage, the gallery, join/display entry and the no-account builder. */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl().origin;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard", "/admin", "/boards/", "/host/", "/play/", "/display/", "/watch/", "/overlay/", "/results/", "/r/", "/share/", "/invite/", "/login", "/try/claim", "/pair-expired"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
