/**
 * Single source of truth for the marketing FAQ — both the visible
 * accordion (components/landing/faq.tsx) and the FAQPage JSON-LD
 * structured data (components/landing/structured-data.tsx) render from
 * this exact same array. Structured data that doesn't match what a
 * visitor actually sees on the page is a real, documented issue for how
 * search engines and AI answer engines trust a site's markup — keeping
 * one array as the source for both surfaces makes that drift structurally
 * impossible rather than something to remember to keep in sync by hand.
 *
 * The first 7 entries are CanoryAI-specific (how the product works); the
 * remaining entries are foundational EUDR questions a compliance officer
 * or procurement lead would search for on their own, independent of any
 * vendor — covering these accurately, even where the direct answer isn't
 * "and that's what CanoryAI does," is what actually earns topical
 * authority and AI-answer citations, as opposed to only ever talking
 * about the product.
 */
export interface FaqEntry {
  question: string;
  answer: string;
}

export const FAQS: FaqEntry[] = [
  {
    question: "How does CanoryAI process handwritten supplier documents from remote regions?",
    answer:
      "CanoryAI's vision model is trained specifically on the messy reality of upstream supply-chain paperwork — handwritten weighbridge tickets, faded carbon-copy receipts, and GPS slips photographed on a phone in variable light. It doesn't require a fixed template: it reads the document, classifies its type, and extracts farmer names, crop weights, and coordinates directly. Every extraction carries a confidence score, so anything below your organization's threshold is routed to a compliance officer rather than approved silently.",
  },
  {
    question: "How does CanoryAI protect supply-chain data from competitors?",
    answer:
      "Every organization on CanoryAI is isolated at the database level, not just the application level. We enforce PostgreSQL Row Level Security policies directly on every table — shipments, documents, and audit records — so a query with no tenant filter at all still cannot return another organization's rows. This was built and verified specifically for this reason: two organizations' data has been tested to confirm neither can read, modify, or even detect the existence of the other's shipments, independent of any application-layer permission check.",
  },
  {
    question: "How does CanoryAI help organizations prepare for the EUDR compliance deadline?",
    answer:
      "Following the EU's second postponement in December 2025, large and medium operators must comply by December 30, 2026, with micro and small enterprises following by June 30, 2027 — and due diligence statements are required per shipment, not once per year, so the operational burden compounds immediately once enforcement begins. CanoryAI's onboarding is built to get a first real declaration generated in days, not months: connect your existing supplier document flow, run a backlog of historical shipments through the pipeline to validate coverage, and scale up well ahead of your deadline, rather than discovering gaps at the border.",
  },
  {
    question: "Does a human ever review the AI's decisions?",
    answer:
      "Yes, by design. CanoryAI auto-approves the documents it's most confident about, but every extraction below your configured confidence threshold — and every satellite check that flags possible deforestation — is queued for a compliance officer's review before it can proceed. The 94.2% auto-approval figure describes how much manual work disappears, not how much oversight does.",
  },
  {
    question: "How does satellite verification actually work?",
    answer:
      "Every GPS coordinate extracted from a supplier document is checked against Global Forest Watch tree-cover-loss data, using the regulation's own deforestation-free cutoff date of December 31, 2020. A plot with no detected loss since that date is marked clean; any detected loss surfaces as a flagged risk with the specific year and location, so your team can investigate before a declaration is filed rather than after a shipment is challenged.",
  },
  {
    question: "How long is audit trail data retained, and can it be exported?",
    answer:
      "Audit records are retained indefinitely by default and are append-only — no user, including an administrator, can edit or delete a historical entry, enforced by the database itself rather than by application permissions. The full trail for any shipment is available in the platform and exportable on request, which matters directly for EUDR: due diligence documentation must be retained for at least five years from the date a shipment was placed on the EU market.",
  },
  {
    question: "What enterprise integrations does CanoryAI support?",
    answer:
      "The Enterprise and Custom tiers include API access for connecting CanoryAI directly to existing ERP and procurement systems, so shipment data can flow in without manual re-entry, and compliance status can flow back out to the systems your operations team already uses. Webhooks notify your own systems the moment a shipment's compliance status changes, and Custom-tier organizations also get dedicated infrastructure and a named integration engineer for non-standard connections.",
  },
  {
    question: "What is the EU Deforestation Regulation (EUDR)?",
    answer:
      "The EUDR (Regulation (EU) 2023/1115) is EU law requiring that cattle, cocoa, coffee, oil palm, rubber, soy, and wood — and products derived from them, such as chocolate, leather, furniture, and tires — placed on or exported from the EU market are deforestation-free, legally produced, and covered by a due diligence statement. It replaces the earlier EU Timber Regulation and extends similar obligations across all seven commodities, entering into force on June 29, 2023.",
  },
  {
    question: "Who is legally required to comply with EUDR?",
    answer:
      "Any operator or trader placing, making available, or exporting a covered commodity or derived product on the EU market — regardless of company size or whether it's headquartered inside or outside the EU. Large and medium operators must comply from December 30, 2026; micro and small enterprises have until June 30, 2027, following the regulation's second postponement (Regulation (EU) 2025/2650, confirmed December 2025).",
  },
  {
    question: "Which commodities and products does EUDR actually cover?",
    answer:
      "Seven commodities: cattle, cocoa, coffee, oil palm, rubber, soy, and wood — plus a defined list of derived products in the regulation's Annex I, identified by Combined Nomenclature (CN) customs codes, including items like chocolate, leather, furniture, tires, and palm oil derivatives. A product not listed in Annex I is out of scope even if it contains a covered commodity, so the first step in any compliance program is CN-code classification of your actual catalog, not just checking whether 'cocoa' or 'rubber' appears in an ingredient list.",
  },
  {
    question: "What is a Due Diligence Statement (DDS), and when is one required?",
    answer:
      "A Due Diligence Statement is the formal declaration an operator submits confirming a specific shipment of a covered commodity is deforestation-free, legally produced, and traceable to its plot of origin — submitted per shipment through the EU's TRACES NT information system, not filed once annually. It must include the product's geolocation data, a risk assessment, and any mitigation measures applied, and it's the artifact a customs or market authority actually checks during an inspection.",
  },
  {
    question: "What is EU TRACES NT, and how does a DDS get submitted to it?",
    answer:
      "TRACES NT (TRAde Control and Expert System New Technology) is the European Commission's information system for submitting and managing Due Diligence Statements — the EU's official channel, not a third-party portal. A DDS submission requires structured XML matching TRACES NT's schema: operator identity, commodity and quantity, geolocation coordinates for every plot of origin, and the risk assessment outcome. CanoryAI generates this XML directly from a processed shipment's data rather than requiring manual re-entry into the TRACES NT interface.",
  },
  {
    question: "What is Global Forest Watch, and why does EUDR compliance depend on it?",
    answer:
      "Global Forest Watch (GFW) is a satellite-based forest-monitoring platform, maintained by the World Resources Institute, that publishes near-real-time tree-cover-loss data for the entire globe. It's the most widely used independent data source for checking whether a specific plot of land has been deforested since a given date — exactly the check EUDR's December 31, 2020 cutoff requires. CanoryAI checks every extracted GPS coordinate against GFW data as part of its automated pipeline, rather than requiring a compliance officer to look up each plot manually.",
  },
  {
    question: "What is mass balance reconciliation, and why does it matter for EUDR compliance?",
    answer:
      "Mass balance reconciliation is the check that a shipment's declared total weight matches the sum of the weights extracted from its individual supplier documents, within a defined tolerance. A mismatch is a genuine red flag under due diligence obligations — it can indicate an unrecorded or unverified source blended into the shipment, which undermines the plot-level traceability EUDR requires even if every individual document that was submitted looks clean on its own.",
  },
  {
    question: "What should a compliance team evaluate when choosing EUDR compliance software?",
    answer:
      "At minimum: whether document extraction handles real-world supplier paperwork (handwritten, non-templated, low-quality scans) rather than only clean digital PDFs; whether satellite verification uses an independent, named data source rather than a black-box risk score; whether the audit trail is genuinely immutable at the database level, not just displayed as read-only in the UI; and whether DDS/TRACES NT generation produces submission-ready output rather than a report you still have to re-key. See our full evaluation guide for a detailed comparison framework.",
  },
];
