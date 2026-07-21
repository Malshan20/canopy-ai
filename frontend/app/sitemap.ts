import type { MetadataRoute } from "next";
import { SITE_URL } from "@/constants/config";

/**
 * Next.js App Router's native sitemap.xml generation — becomes the
 * response at /sitemap.xml automatically.
 *
 * Only two real, public, indexable routes exist on this domain today:
 * the marketing homepage and /login (worth indexing on its own — it's
 * where an existing customer's "canoryai login" search should land).
 * Every other route requires authentication and is excluded via
 * robots.ts, so it has no place in a sitemap either — a sitemap listing
 * URLs that robots.txt then blocks is a real, common technical-SEO
 * inconsistency worth avoiding deliberately, not an oversight.
 *
 * FUTURE GROWTH: as resource-center content ships (see the content
 * strategy doc), add each new public URL here with an appropriate
 * `changeFrequency`/`priority` — e.g. pillar guides as `monthly`/0.8,
 * news-style compliance-update posts as `weekly`/0.6. Not scaffolded
 * with placeholder entries now because a sitemap entry for a page that
 * doesn't exist yet is worse than no entry at all (a 404 a crawler
 * finds via the sitemap actively wastes crawl budget and can be treated
 * as a quality signal against the whole domain).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/login`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
