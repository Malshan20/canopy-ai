import { APP_NAME, SITE_DESCRIPTION, SITE_URL } from "@/constants/config";
import { FAQS } from "@/constants/faq";

/**
 * JSON-LD structured data for the marketing homepage — Organization,
 * WebSite, SoftwareApplication, and FAQPage. Rendered as a Server
 * Component (no client JS needed for a static <script> tag) directly
 * into app/page.tsx.
 *
 * Kept deliberately factual and unembellished per this build's own
 * quality bar: no `aggregateRating` (there are no real reviews to cite —
 * a fabricated rating is exactly the kind of unverifiable claim that
 * damages trust with both human readers and the AI systems this markup
 * is meant to help), no invented customer counts, no download/install
 * numbers. `FAQPage` entries are pulled directly from `constants/faq.ts`
 * — the same array the visible accordion renders — so this can never
 * drift from what a visitor actually sees on the page, which matters
 * for how much a search engine or AI answer engine trusts the markup.
 */
export function StructuredData() {
  const organization = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: APP_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description: SITE_DESCRIPTION,
    // Placeholders — fill in once real accounts/addresses exist. An
    // Organization schema with fabricated social profiles or a fake
    // address is worse than one with fewer fields filled in.
    sameAs: [] as string[],
  };

  const website = {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: APP_NAME,
    description: SITE_DESCRIPTION,
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: "en-US",
  };

  const softwareApplication = {
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#software`,
    name: APP_NAME,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Regulatory Compliance Software",
    operatingSystem: "Web",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    publisher: { "@id": `${SITE_URL}/#organization` },
    // Real, current pricing — matches components/landing/pricing.tsx
    // exactly. Update both together if pricing ever changes.
    offers: [
      {
        "@type": "Offer",
        name: "Growth",
        price: "12000",
        priceCurrency: "USD",
        description:
          "250 shipments per year, AI OCR extraction, satellite deforestation checks, TRACES NT XML generation, immutable audit logs.",
      },
      {
        "@type": "Offer",
        name: "Enterprise",
        price: "38000",
        priceCurrency: "USD",
        description:
          "1,000 shipments per year, API access, dedicated Customer Success Manager, webhooks for custom integrations, priority processing.",
      },
      {
        "@type": "Offer",
        name: "Custom",
        price: "80000",
        priceCurrency: "USD",
        description: "Unlimited shipment volume, dedicated infrastructure, custom SLAs, white-glove supplier onboarding.",
      },
    ],
    featureList: [
      "AI document extraction (OCR + vision AI) for handwritten and non-templated supplier documents",
      "Satellite deforestation verification via Global Forest Watch tree-cover-loss data",
      "GPS coordinate validation against the EUDR December 31, 2020 cutoff date",
      "Mass balance reconciliation between declared and extracted shipment weights",
      "EU TRACES NT-compatible Due Diligence Statement (DDS) XML generation",
      "Immutable, append-only audit logging enforced at the database level",
      "Multi-tenant Row Level Security data isolation",
      "API access and signed webhooks for ERP and procurement system integration",
    ],
    keywords:
      "EUDR compliance software, EU Deforestation Regulation, supply chain due diligence, satellite verification, Global Forest Watch, TRACES NT, Due Diligence Statement, AI document extraction, deforestation-free supply chain",
  };

  const faqPage = {
    "@type": "FAQPage",
    "@id": `${SITE_URL}/#faq`,
    mainEntity: FAQS.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  const graph = {
    "@context": "https://schema.org",
    "@graph": [organization, website, softwareApplication, faqPage],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
