import Link from "next/link";
import type { Metadata } from "next";
import { ContentPageLayout } from "@/components/marketing/content-page-layout";
import { APP_NAME } from "@/constants/config";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms governing use of ${APP_NAME}'s EUDR compliance platform.`,
  alternates: { canonical: "/terms" },
};

export default function TermsOfServicePage() {
  return (
    <ContentPageLayout eyebrow="Legal" title="Terms of Service" lastUpdated="July 11, 2026">
      <p className="callout">
        <strong>Before you rely on this:</strong> this is a genuine, complete draft written to reflect how{" "}
        {APP_NAME} actually operates — but it has not been reviewed by a qualified commercial lawyer.
        Enterprise contracts in particular should be reviewed against your specific customer agreements,
        liability caps, and jurisdiction before being relied upon as binding terms.
      </p>

      <p>
        These Terms of Service (&quot;Terms&quot;) govern access to and use of {APP_NAME}&apos;s
        software platform (the &quot;Service&quot;). By creating an account or using the Service, your
        organization (&quot;Customer&quot;, &quot;you&quot;) agrees to these Terms. Where Customer has a
        separately signed enterprise agreement or order form with {APP_NAME}, that document controls
        over these Terms in the event of a conflict.
      </p>

      <h2>1. The Service</h2>
      <p>
        {APP_NAME} provides AI-powered EU Deforestation Regulation (EUDR) compliance software, including
        document extraction, satellite-based deforestation verification, mass balance reconciliation,
        and Due Diligence Statement (DDS) generation. The Service is provided on a subscription basis
        under the plan Customer has selected or contracted for.
      </p>

      <h2>2. Accounts and access</h2>
      <ul>
        <li>Customer is responsible for all activity under its organization&apos;s account</li>
        <li>
          Customer is responsible for assigning appropriate roles (owner, admin, compliance manager,
          viewer) to its own users, and for promptly removing access for users who leave the
          organization
        </li>
        <li>Login credentials must not be shared between individuals</li>
        <li>
          Customer must notify {APP_NAME} promptly of any known or suspected unauthorized access to its
          account
        </li>
      </ul>

      <h2>3. Subscription plans, fees, and payment</h2>
      <ul>
        <li>
          Plans (Growth, Enterprise, Custom) and their associated shipment-volume limits are as
          described on our pricing page or in Customer&apos;s signed order form, whichever applies
        </li>
        <li>Fees are invoiced in advance for the applicable term unless otherwise agreed in writing</li>
        <li>
          Enterprise agreements are typically settled by wire transfer or ACH under the payment terms
          specified in the applicable order form
        </li>
        <li>
          Exceeding a plan&apos;s shipment volume may require an upgrade to continue processing
          additional shipments, as communicated in advance
        </li>
      </ul>

      <h2>4. Customer data and responsibilities</h2>
      <p>
        Customer retains all rights to the data it uploads to the Service (&quot;Customer Data&quot;),
        including supplier documents, extracted supply-chain data, and generated compliance records.
        Customer represents that it has the right to upload this data and, where it includes personal
        data of third parties (such as named suppliers or farmers), that it has a lawful basis to
        provide that data to {APP_NAME} for processing as described in our{" "}
        <Link href="/privacy">Privacy Policy</Link> and <Link href="/data-processing">Data Processing page</Link>.
      </p>
      <p>
        <strong>
          Customer is responsible for the accuracy of information it supplies directly (such as
          operator name, EORI number, and HS code entered at export time) and for reviewing generated
          Due Diligence Statements before submission to EU TRACES NT.
        </strong>{" "}
        {APP_NAME} is a tool to support Customer&apos;s compliance program; it does not replace
        Customer&apos;s own regulatory obligations or judgment.
      </p>

      <h2>5. Acceptable use</h2>
      <p>Customer agrees not to:</p>
      <ul>
        <li>Use the Service to violate any applicable law or regulation</li>
        <li>Attempt to circumvent rate limits, quotas, or access controls</li>
        <li>Reverse-engineer, decompile, or attempt to extract the Service&apos;s underlying models or source code</li>
        <li>Resell or provide the Service to third parties without {APP_NAME}&apos;s written consent</li>
        <li>Upload data Customer does not have the legal right to process</li>
      </ul>

      <h2>6. AI-generated output and the sign-off requirement</h2>
      <p>
        The Service uses AI models to extract and classify information from supplier documents.
        While the platform includes confidence scoring, automated sanity checks, satellite
        verification, and — by default — a requirement that a compliance officer explicitly approve a
        shipment before its XML can be exported, AI extraction can still be inaccurate. Customer is
        responsible for reviewing flagged items and for the ultimate accuracy of any Due Diligence
        Statement it submits to EU authorities. {APP_NAME} disclaims liability for consequences arising
        from Customer&apos;s submission of a Due Diligence Statement without adequate review, to the
        extent permitted by law and Customer&apos;s applicable order form.
      </p>

      <h2>7. Availability and support</h2>
      <p>
        {APP_NAME} will use commercially reasonable efforts to maintain Service availability.
        Enterprise and Custom-tier customers receive the support response times and any uptime
        commitments specified in their order form or a separate Service Level Agreement, where
        applicable.
      </p>

      <h2>8. Intellectual property</h2>
      <p>
        {APP_NAME} retains all rights to the Service itself, including its software, models, and
        underlying technology. These Terms grant Customer a right to use the Service, not ownership of
        it. Customer retains all rights to Customer Data.
      </p>

      <h2>9. Confidentiality</h2>
      <p>
        Each party will protect the other&apos;s confidential information with the same degree of care
        it uses for its own confidential information of similar nature, and not less than reasonable
        care, and will use it only as necessary to perform under these Terms.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, {APP_NAME}&apos;s aggregate liability arising out of or
        related to these Terms will not exceed the fees paid by Customer for the Service in the twelve
        (12) months preceding the claim. Neither party will be liable for indirect, incidental,
        special, or consequential damages. This section does not limit liability for gross negligence,
        willful misconduct, or breaches of confidentiality, where such limitation is not permitted by
        applicable law.
      </p>

      <h2>11. Termination</h2>
      <ul>
        <li>Either party may terminate for the other&apos;s uncured material breach after 30 days&apos; written notice</li>
        <li>
          Customer may cancel by providing written notice per the cancellation and notice terms
          specified in its order form or enterprise agreement; where no such term is specified, 30
          days&apos; written notice applies, effective at the end of the current billing period
        </li>
        <li>Upon termination, Customer may request export of its Customer Data for 30 days, after which it may be deleted, subject to the audit-trail retention described in our Privacy Policy</li>
      </ul>

      <h2>12. Changes to these Terms</h2>
      <p>
        We&apos;ll update the &quot;Last updated&quot; date above when these Terms change and notify
        active customers of material changes by email in advance of them taking effect.
      </p>

      <h2>13. Governing law</h2>
      <p>
        These Terms are governed by the laws specified in Customer&apos;s signed order form or
        enterprise agreement where one exists. Absent such an agreement, these Terms are governed by
        the laws of the jurisdiction in which {APP_NAME} is incorporated, without regard to conflict of
        law principles.
      </p>

      <h2>14. Contact</h2>
      <p>
        Questions about these Terms:{" "}
        <a href="mailto:legal@canoryai.example">legal@canoryai.example</a>
      </p>
    </ContentPageLayout>
  );
}
