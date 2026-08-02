import type { Metadata } from "next";
import Link from "next/link";
import { ContentPageLayout } from "@/components/marketing/content-page-layout";
import { APP_NAME } from "@/constants/config";

export const metadata: Metadata = {
  title: "About",
  description: `Why ${APP_NAME} exists, and how we think about building compliance software you can actually trust.`,
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <ContentPageLayout eyebrow="About" title={`About ${APP_NAME}`} lastUpdated="July 11, 2026">
      <p>
        The EU Deforestation Regulation gives commodity importers a hard requirement: prove, per
        shipment, that what you&apos;re bringing into the EU didn&apos;t come from deforested land —
        with real geolocation data, not a general attestation. For most organizations, that&apos;s a
        genuinely new kind of operational problem. The paperwork it depends on was never built for
        this: handwritten weighbridge receipts, inconsistent formats, supply chains with real people
        several steps removed from any spreadsheet.
      </p>
      <p>
        {APP_NAME} exists to make that problem tractable — AI that can actually read a smallholder
        farmer&apos;s handwritten receipt, satellite verification against an independent, named data
        source, and an audit trail that holds up because it&apos;s enforced by the database, not just
        displayed as read-only in an interface.
      </p>

      <h2>What we actually believe about AI and compliance</h2>
      <p>
        A compliance product built on AI has to earn trust differently than most software, because the
        cost of being confidently wrong is a regulatory problem, not just a bad user experience. A few
        things we hold to because of that, not despite it:
      </p>
      <ul>
        <li>
          <strong>AI extracts; it doesn&apos;t decide.</strong> Every extraction below a confidence
          threshold routes to a human, not an automatic pass. The fields with the most legal weight —
          your operator identity, EORI number, HS code — are never AI-guessed at all; they&apos;re
          entered by a person, every time.
        </li>
        <li>
          <strong>Sanity checks exist because confidence scores aren&apos;t enough.</strong> An AI can
          be confidently wrong — a misread digit that still looks clean. We built plausibility checks
          specifically to catch that class of error before it reaches a compliance officer, not just
          the class of error an AI already knows it&apos;s unsure about.
        </li>
        <li>
          <strong>A human signs off before anything leaves the platform.</strong> By default, every
          organization requires an explicit approval — not because the automation isn&apos;t trusted,
          but because a person catching an edge case once matters more than saving five minutes.
        </li>
        <li>
          <strong>The audit trail is immutable because it has to be.</strong> A compliance record that
          could be quietly edited later would be worthless as evidence in an actual inspection, so
          it isn&apos;t editable — enforced by the database itself, not a permission setting anyone
          could change.
        </li>
      </ul>

      <h2>Where we are today</h2>
      <p>
        {APP_NAME} is an independently built platform, not a large team with a long history — which
        means the people you talk to when you reach out are the people actually building this, not a
        layer removed from it. That&apos;s a genuine trade-off: it means moving fast and being direct
        about what&apos;s built, tested, and verified versus what&apos;s still in progress, rather than
        smoothing that distinction over. If you&apos;d rather see exactly what&apos;s real today than
        take a claim at face value, that&apos;s a completely reasonable thing to ask for — see our{" "}
        <Link href="/api-docs">API documentation</Link> for what&apos;s actually built, or{" "}
        <Link href="/contact">get in touch</Link> with specific questions.
      </p>

      <h2>Get in touch</h2>
      <p>
        Questions about the product, a specific compliance scenario, or anything else —{" "}
        <Link href="/contact">contact us</Link> and we&apos;ll reply directly, not through a support
        queue.
      </p>
    </ContentPageLayout>
  );
}
