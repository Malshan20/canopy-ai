import type { MetadataRoute } from "next";
import { SITE_URL } from "@/constants/config";

/**
 * Next.js App Router's native robots.txt generation — this file itself
 * becomes the response at /robots.txt, no separate static file needed.
 * Public marketing content is crawlable; every authenticated route is
 * blocked, since there's nothing there a search engine or AI crawler
 * should be indexing (private shipment data, not public content) and
 * crawling it would just waste crawl budget that should go to the
 * marketing/resource pages instead.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/shipments",
          "/upload",
          "/compliance",
          "/audit-trail",
          "/settings",
          "/onboarding",
          "/api/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
