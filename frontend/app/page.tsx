import type { Metadata } from "next";

import { SmoothScrollProvider } from "@/components/providers/smooth-scroll-provider";
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { CommodityMarquee } from "@/components/landing/commodity-marquee";
import { RoiGrid } from "@/components/landing/roi-grid";
import { HowItWorks } from "@/components/landing/how-it-works";
import { BentoGrid } from "@/components/landing/bento-grid";
import { DataFoundation } from "@/components/landing/data-foundation";
import { Pricing } from "@/components/landing/pricing";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";
import { StructuredData } from "@/components/landing/structured-data";
import { APP_NAME, SITE_DESCRIPTION, SITE_TAGLINE, SITE_URL, TWITTER_HANDLE } from "@/constants/config";

const PAGE_TITLE = `${APP_NAME} — ${SITE_TAGLINE}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: PAGE_TITLE,
  description: SITE_DESCRIPTION,
  keywords: [
    "EUDR compliance software",
    "EU Deforestation Regulation",
    "EUDR due diligence statement",
    "supply chain due diligence software",
    "satellite deforestation verification",
    "Global Forest Watch compliance",
    "TRACES NT XML generation",
    "AI document extraction compliance",
    "deforestation-free supply chain",
  ],
  authors: [{ name: APP_NAME }],
  applicationName: APP_NAME,
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: APP_NAME,
    title: PAGE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} — ${SITE_TAGLINE}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: TWITTER_HANDLE,
    creator: TWITTER_HANDLE,
    title: PAGE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
    other: [{ rel: "mask-icon", url: "/mask-icon.svg", color: "#0b6e4f" }],
  },
  manifest: "/site.webmanifest",
};

/**
 * CanoryAI's public marketing homepage — a Server Component shell (no
 * "use client" here) around client sections that each own their specific
 * interactivity (GSAP timelines, Framer Motion reveals, the pricing
 * toggle, the FAQ accordion). `SmoothScrollProvider` is the one wrapper
 * that has to sit above everything, since Lenis needs to own the page's
 * scroll container. `StructuredData` renders JSON-LD (Organization,
 * WebSite, SoftwareApplication, FAQPage) — see that component for why
 * its FAQ entries can never drift from what `<Faq />` actually displays.
 *
 * `.marketing` (see app/globals.css) scopes this page's entire design
 * token set — canvas, ink, forest accent — away from the authenticated
 * dashboard's own tokens, which live at `:root` and power every route
 * under /dashboard, /shipments, /upload, etc. The two surfaces are
 * different products with different jobs and were deliberately kept free
 * to diverge.
 */
export default function LandingPage() {
  return (
    <div className="marketing font-sans">
      <StructuredData />
      <SmoothScrollProvider>
        <Navbar />
        <main>
          <Hero />
          <CommodityMarquee />
          <RoiGrid />
          <HowItWorks />
          <BentoGrid />
          <DataFoundation />
          <Pricing />
          <Faq />
          <FinalCta />
        </main>
        <Footer />
      </SmoothScrollProvider>
    </div>
  );
}
