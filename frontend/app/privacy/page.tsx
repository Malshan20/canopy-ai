import Link from "next/link";
import type { Metadata } from "next";
import { ContentPageLayout } from "@/components/marketing/content-page-layout";
import { APP_NAME } from "@/constants/config";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${APP_NAME} collects, uses, and protects data, including supply-chain and personal data processed for EUDR compliance.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPolicyPage() {
  return (
    <ContentPageLayout eyebrow="Legal" title="Privacy Policy" lastUpdated="July 11, 2026">
      <p className="callout">
        <strong>Before you rely on this:</strong> this policy was drafted to accurately describe how{" "}
        {APP_NAME} actually handles data, based on its real infrastructure and processing — but it has
        not been reviewed by a qualified privacy lawyer. Have one review it against your specific
        jurisdictions and customer contracts before treating it as your operative legal document,
        particularly the GDPR and sub-processor sections below.
      </p>

      <p>
        {APP_NAME} (&quot;{APP_NAME}&quot;, &quot;we&quot;, &quot;us&quot;) provides AI-powered EU
        Deforestation Regulation (EUDR) compliance software for enterprise commodity importers. This
        policy explains what data we collect, why, how it&apos;s processed, and the rights you and your
        organization&apos;s data subjects have over it.
      </p>

      <h2>1. What data we collect</h2>
      <h3>1.1 Account and organization data</h3>
      <ul>
        <li>Name and email address of each user with an account</li>
        <li>Organization name and subscription plan</li>
        <li>Role within your organization (owner, admin, compliance manager, viewer)</li>
        <li>Authentication data, handled entirely by Supabase Auth (see Section 4)</li>
      </ul>

      <h3>1.2 Supply-chain document data</h3>
      <p>
        When you upload supplier documents (weighbridge receipts, invoices, land deeds, delivery
        notes) for processing, we extract and store the data needed for EUDR due diligence,
        including:
      </p>
      <ul>
        <li>Supplier and farmer names as they appear on source documents</li>
        <li>GPS coordinates of plots of origin</li>
        <li>Commodity types, quantities, and transaction dates</li>
        <li>The original uploaded document files themselves</li>
      </ul>
      <p>
        This category can include personal data of individuals in your supply chain — most commonly,
        smallholder farmers or suppliers named on source documents — even though they are not{" "}
        {APP_NAME} account holders. We process this data as necessary to perform the due diligence
        and documentation your organization is legally required to produce under EUDR.
      </p>

      <h3>1.3 Usage and system data</h3>
      <ul>
        <li>Shipment processing history, extraction confidence scores, and compliance check results</li>
        <li>API request logs, for security and rate-limiting purposes</li>
        <li>
          Immutable audit log entries recording who took which action and when — this log is
          append-only by design (see Section 6) and cannot be edited or deleted, including by us
        </li>
      </ul>

      <h2>2. Why we process this data</h2>
      <ul>
        <li>
          <strong>To provide the service</strong> — extracting, verifying, and compiling supply-chain
          data into EUDR-compliant due diligence statements is the core function you&apos;re paying for
        </li>
        <li>
          <strong>To maintain a defensible audit trail</strong> — regulatory compliance software is only
          useful if its record of what happened is trustworthy, which is why audit entries are
          immutable rather than editable
        </li>
        <li>
          <strong>To operate and secure the platform</strong> — authentication, abuse prevention, rate
          limiting, and debugging production issues
        </li>
        <li>
          <strong>To communicate with you</strong> — service notifications (shipment processing
          complete, team changes) and, only where you&apos;ve opted in, related emails
        </li>
      </ul>
      <p>
        We do not sell your data, your supply chain&apos;s data, or your suppliers&apos; data to third
        parties. We do not use it to train AI models beyond the immediate processing of your own
        request.
      </p>

      <h2>3. Legal basis for processing (GDPR)</h2>
      <p>
        For organizations and data subjects in the EU/EEA, we process personal data under the
        following legal bases:
      </p>
      <ul>
        <li>
          <strong>Contract</strong> — processing your organization&apos;s account and document data is
          necessary to perform the service you&apos;ve subscribed to
        </li>
        <li>
          <strong>Legal obligation</strong> — EUDR itself requires the due diligence documentation this
          platform helps produce
        </li>
        <li>
          <strong>Legitimate interest</strong> — for security, fraud prevention, and service
          improvement, balanced against your rights and freedoms
        </li>
      </ul>
      <p>
        Where your organization uploads personal data of third parties (e.g. named farmers or
        suppliers) for EUDR due diligence, your organization is the data controller for that data and{" "}
        {APP_NAME} acts as a data processor. See our{" "}
        <Link href="/data-processing">Data Processing page</Link> for the specifics of that relationship.
      </p>

      <h2>4. Sub-processors and infrastructure</h2>
      <p>
        We use a small number of specialized infrastructure and AI providers to deliver the service.
        Each is used only for the specific purpose below, and none receive more data than that purpose
        requires.
      </p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Purpose</th>
            <th>Data involved</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Supabase</td>
            <td>Database, authentication, and file storage</td>
            <td>All account, organization, and document data</td>
          </tr>
          <tr>
            <td>Google (Gemini)</td>
            <td>AI-powered document data extraction</td>
            <td>Supplier document content, processed per request</td>
          </tr>
          <tr>
            <td>Groq</td>
            <td>AI-powered document classification</td>
            <td>Document type signals, processed per request</td>
          </tr>
          <tr>
            <td>Global Forest Watch (World Resources Institute)</td>
            <td>Satellite deforestation verification</td>
            <td>GPS coordinates only, for the plot-level check</td>
          </tr>
          <tr>
            <td>Resend</td>
            <td>Transactional email delivery</td>
            <td>Recipient email address, notification content</td>
          </tr>
        </tbody>
      </table>

      <h2>5. Data retention</h2>
      <ul>
        <li>
          <strong>Audit log entries</strong> are retained indefinitely by default, consistent with
          EUDR&apos;s requirement to retain due diligence documentation for at least five years from a
          shipment&apos;s placement on the EU market
        </li>
        <li>
          <strong>Uploaded documents and extracted data</strong> are retained for the lifetime of your
          organization&apos;s account, unless you request deletion (subject to the audit-trail
          exception in Section 6)
        </li>
        <li>
          <strong>Account data</strong> is deleted or anonymized within 30 days of a confirmed account
          closure request, except where retention is required by law
        </li>
      </ul>

      <h2>6. The immutable audit trail, and what it means for deletion requests</h2>
      <p>
        {APP_NAME}&apos;s audit log is enforced as append-only at the database level — no user,
        including {APP_NAME} staff, can edit or delete a historical entry. This is a deliberate design
        choice: a compliance record that could be quietly altered would be worthless as evidence in a
        real regulatory inspection.
      </p>
      <p>
        This means a request to delete personal data may be satisfiable for source documents and
        extracted profile data, but audit log entries that reference that data (e.g. &quot;shipment X
        was processed on date Y by user Z&quot;) will persist as an immutable historical record, in
        the same way a bank&apos;s transaction ledger doesn&apos;t delete historical entries when an
        account closes. Where full erasure isn&apos;t possible for this reason, we will anonymize
        what we can and explain specifically what remains and why.
      </p>

      <h2>7. Your rights</h2>
      <p>Subject to applicable law (including GDPR for EU/EEA data subjects), you have the right to:</p>
      <ul>
        <li>Access the personal data we hold about you</li>
        <li>Correct inaccurate data</li>
        <li>Request deletion, subject to Section 6&apos;s audit-trail exception</li>
        <li>Receive a copy of your data in a portable format</li>
        <li>Object to or restrict certain processing</li>
        <li>Lodge a complaint with your local data protection authority</li>
      </ul>
      <p>
        To exercise any of these rights, contact{" "}
        <a href="mailto:privacy@canoryai.example">privacy@canoryai.example</a>. If you&apos;re an
        individual named in a document uploaded by one of our customers (e.g. a supplier or farmer)
        rather than a {APP_NAME} account holder, we&apos;ll direct your request to the relevant
        customer, since they control that data as described in Section 3.
      </p>

      <h2>8. Security</h2>
      <p>
        Every organization&apos;s data is isolated at the database level using PostgreSQL Row Level
        Security, enforced on every query regardless of which part of the application is running —
        not just filtered at the application layer. Data in transit is encrypted via TLS. See our{" "}
        <Link href="/data-processing">Data Processing page</Link> for further technical and organizational
        measures.
      </p>

      <h2>9. International data transfers</h2>
      <p>
        Where personal data is transferred outside the EU/EEA (for example, to sub-processors located
        elsewhere), we rely on appropriate safeguards such as Standard Contractual Clauses, consistent
        with each sub-processor&apos;s own compliance posture.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        We&apos;ll update the &quot;Last updated&quot; date above when this policy changes, and notify
        active customers of material changes by email.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about this policy or your data:{" "}
        <a href="mailto:privacy@canoryai.example">privacy@canoryai.example</a>
      </p>
    </ContentPageLayout>
  );
}
