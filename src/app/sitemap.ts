import type { MetadataRoute } from "next";
import { siteUrl } from "@/shared/site";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl().origin;
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/gallery`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/try`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/ai`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/join`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/display`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
