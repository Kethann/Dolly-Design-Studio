import type { MetadataRoute } from "next";
import { getContent } from "@/lib/content/store";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { projects } = await getContent();
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const staticRoutes = ["", "/work", "/breakdowns"].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
  }));
  const projectRoutes = projects.map((p) => ({
    url: `${base}/work/${p.slug}`,
    lastModified: new Date(),
  }));
  return [...staticRoutes, ...projectRoutes];
}
