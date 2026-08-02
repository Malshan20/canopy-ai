import Link from "next/link";
import type { Metadata } from "next";
import { ContentPageLayout } from "@/components/marketing/content-page-layout";
import { APP_NAME } from "@/constants/config";

export const metadata: Metadata = {
  title: "The Complete Guide to EUDR Compliance",
  description:
    "What the EU Deforestation Regulation requires, who it applies to, and how organizations are actually building compliance programs around it.",
  alternates: { canonical: "/eudr-guide" },
  keywords: [
    "EUDR compliance guide",
    "EU Deforestation Regulation",
    "due diligence statement",
    "EUDR deadline",
    "TRACES NT",
  ],
};

export default function EudrGuidePage() {
  return (
    <ContentPageLayout eyebrow="Resources" title="The Complete Guide to EUDR Compliance" lastUpdated="July 11, 2026">
      <p>
        The European Union Deforestation Regulation is the most significant change to EU import
        requirements for commodity supply chains in over a decade. This guide covers what it requires,
        who it applies to, and how organizations are actually building compliance programs around it.
      </p>

      <h2>What EUDR actually requires</h2>
      <p>
        The EU Deforestation Regulation — Regulation (EU) 2023/1115 — requires that seven commodities,
        and products derived from them, placed on or exported from the EU market are:
      </p>
      <ol>
        <li>
          <strong>Deforestation-free</strong> — not produced on land that was deforested after December
          31, 2020
        </li>
        <li>
          <strong>Legally produced</strong> — compliant with the relevant laws of the country of
          production
        </li>
        <li>
          <strong>Covered by a due diligence statement</strong> — a formal declaration, submitted per
          shipment, proving the above two points with plot-level geolocation data
        </li>
      </ol>
      <p>
        It replaces the earlier EU Timber Regulation and extended similar obligations across a much
        wider set of commodities, entering into force on June 29, 2023.
      </p>

      <h2>The seven covered commodities</h2>
      <p>
        Cattle, cocoa, coffee, oil palm, rubber, soy, and wood — along with derived products identified
        by Combined Nomenclature (CN) customs codes in the regulation&apos;s Annex I: items like
        chocolate, leather, furniture, tires, and palm oil derivatives. A product not listed in Annex I
        falls outside EUDR&apos;s scope even if it technically contains a covered commodity, which is
        why CN-code classification of an actual product catalog is the right first step for any
        compliance program.
      </p>

      <h2>Who must comply, and by when</h2>
      <p>
        Any operator or trader placing, making available, or exporting a covered commodity on the EU
        market — regardless of company size or headquarters location. Following the regulation&apos;s
        second postponement (Regulation (EU) 2025/2650, confirmed December 2025):
      </p>
      <ul>
        <li>
          <strong>Large and medium operators</strong>: compliance required from{" "}
          <strong>December 30, 2026</strong>
        </li>
        <li>
          <strong>Micro and small enterprises</strong>: compliance required from{" "}
          <strong>June 30, 2027</strong>
        </li>
      </ul>
      <p>
        Due diligence statements are required <strong>per shipment</strong>, not filed once annually —
        a detail that fundamentally shapes what kind of process (manual, spreadsheet, or software) can
        realistically keep up once real shipment volume begins.
      </p>

      <h2>What a Due Diligence Statement actually contains</h2>
      <p>
        A Due Diligence Statement is the formal declaration confirming a specific shipment is
        deforestation-free, legally produced, and traceable to its plot of origin — submitted through{" "}
        <strong>EU TRACES NT</strong>, the European Commission&apos;s official information system for
        this purpose. At minimum, it includes:
      </p>
      <ul>
        <li>Operator identification</li>
        <li>Commodity and quantity</li>
        <li>Geolocation data for every plot of origin</li>
        <li>Country of production</li>
        <li>A risk assessment based on that geolocation and country-level risk data</li>
        <li>Risk mitigation measures, if the assessment identified any concerns</li>
      </ul>

      <h2>The three pillars of a due diligence program</h2>
      <h3>1. Traceability to the plot of origin</h3>
      <p>
        Every shipment needs GPS coordinates tracing back to the specific plot(s) of land the commodity
        was produced on. In practice, this data usually starts as handwritten or loosely structured
        supplier paperwork — weighbridge tickets, farm receipts, GPS slips — that needs to be extracted
        and structured before anything else can happen.
      </p>
      <h3>2. Deforestation-free verification</h3>
      <p>
        Once you have plot coordinates, they need to be checked against deforestation data using the
        regulation&apos;s December 31, 2020 cutoff date.{" "}
        <strong>Global Forest Watch</strong>, maintained by the World Resources Institute, is the most
        widely used independent satellite data source for this check.
      </p>
      <h3>3. The due diligence statement itself</h3>
      <p>
        Bringing the above two pieces together into a complete record, along with a risk assessment
        and any mitigation measures applied — the actual document filed through TRACES NT.
      </p>

      <h2>Manual process, spreadsheets, or software?</h2>
      <p>
        At very low shipment volume, a manual process can work. It breaks down quickly once real volume
        begins, precisely because of the per-shipment requirement — a process that took two days once a
        year now needs to happen weekly or daily. Spreadsheets extend that runway somewhat but still
        lack a genuine audit trail, automated satellite checking, or a structured record you can carry
        into TRACES NT without starting from scratch.
      </p>

      <h2>What to evaluate in compliance software</h2>
      <p>Whatever you use — {APP_NAME} or otherwise — the criteria that actually matter:</p>
      <ul>
        <li>
          <strong>Document intelligence that handles real supplier paperwork</strong> — handwritten,
          non-templated, low-quality scans, not just clean digital PDFs
        </li>
        <li>
          <strong>An independently verifiable satellite data source</strong> — a named provider like
          Global Forest Watch, not an undisclosed black-box risk score
        </li>
        <li>
          <strong>A genuinely immutable audit trail</strong> — enforced at the database level, not just
          displayed as read-only in the interface
        </li>
        <li>
          <strong>Submission-ready TRACES NT output</strong> — structured XML matching the required
          schema, not a report you still have to manually re-key
        </li>
      </ul>

      <hr />

      <p>
        <strong>How {APP_NAME} approaches this:</strong> AI document extraction built for the realistic
        condition of upstream supplier paperwork, satellite verification against Global Forest Watch
        with the specific flagged location surfaced (not a black-box score), a database-enforced
        immutable audit trail, sanity checks that catch a confidently-wrong AI extraction before it
        reaches a compliance officer, and a mandatory sign-off step before any XML leaves the platform.
        See our <Link href="/#pricing">pricing</Link> or <Link href="/signup">get started</Link>.
      </p>
    </ContentPageLayout>
  );
}
