import Link from "next/link";
import type { Metadata } from "next";
import { ContentPageLayout } from "@/components/marketing/content-page-layout";
import { APP_NAME } from "@/constants/config";

export const metadata: Metadata = {
  title: "Data Processing",
  description: `How ${APP_NAME} processes personal data as a data processor on behalf of enterprise customers, including sub-processors and security measures.`,
  alternates: { canonical: "/data-processing" },
};

export default function DataProcessingPage() {
  return (
    <ContentPageLayout eyebrow="Legal" title="Data Processing" lastUpdated="July 11, 2026">
      <p className="callout">
        <strong>Before you rely on this:</strong> this page describes the data-processing relationship
        and technical measures as they actually exist in {APP_NAME}&apos;s infrastructure today. It is
        not a substitute for a signed Data Processing Agreement (DPA) — enterprise customers requiring
        one under GDPR Article 28 should contact us to execute a formal DPA reflecting your specific
        processing instructions; this page is background, not the contract itself.
      </p>

      <h2>1. Roles: controller and processor</h2>
      <p>
        Where your organization uploads personal data to {APP_NAME} — most commonly, names of suppliers
        or farmers appearing on source documents, as part of EUDR due diligence — your organization is
        the <strong>data controller</strong> for that data: you decide what to collect and why.{" "}
        {APP_NAME} acts as a <strong>data processor</strong>, processing that data only on your
        instructions and only for the purpose of providing the Service.
      </p>
      <p>{APP_NAME} does not:</p>
      <ul>
        <li>Use Customer Data for any purpose beyond providing and improving the Service to that Customer</li>
        <li>Sell Customer Data or personal data within it</li>
        <li>Use Customer Data to train AI models shared across customers</li>
        <li>Combine one customer&apos;s data with another&apos;s</li>
      </ul>

      <h2>2. Categories of data subjects and data</h2>
      <table>
        <thead>
          <tr>
            <th>Data subject</th>
            <th>Typical data processed</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Customer&apos;s own users (your team)</td>
            <td>Name, email, role, login activity</td>
          </tr>
          <tr>
            <td>Suppliers / farmers named in uploaded documents</td>
            <td>Name, GPS coordinates of plot of origin, transaction details</td>
          </tr>
        </tbody>
      </table>

      <h2>3. Sub-processors</h2>
      <p>
        The following sub-processors handle data on {APP_NAME}&apos;s behalf, each limited to the
        specific function described. This list matches the one in our{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
      <table>
        <thead>
          <tr>
            <th>Sub-processor</th>
            <th>Function</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Supabase</td>
            <td>Database, authentication, file storage</td>
          </tr>
          <tr>
            <td>Google (Gemini API)</td>
            <td>AI document data extraction</td>
          </tr>
          <tr>
            <td>Groq</td>
            <td>AI document classification</td>
          </tr>
          <tr>
            <td>Global Forest Watch (World Resources Institute)</td>
            <td>Satellite deforestation verification (coordinates only)</td>
          </tr>
          <tr>
            <td>Resend</td>
            <td>Transactional email delivery</td>
          </tr>
          <tr>
            <td>Render / Vercel (or Customer&apos;s contracted hosting equivalent)</td>
            <td>Application hosting</td>
          </tr>
        </tbody>
      </table>
      <p>
        We will notify enterprise customers of any new sub-processor in advance where required by a
        signed DPA, and provide a reasonable opportunity to object on data-protection grounds.
      </p>

      <h2>4. Technical and organizational measures</h2>
      <h3>4.1 Tenant isolation</h3>
      <p>
        Every organization&apos;s data is isolated using PostgreSQL Row Level Security policies enforced
        directly at the database level — a query missing an organization filter still cannot return
        another tenant&apos;s rows, regardless of which part of the application issued it. This has been
        directly tested by attempting exactly that kind of cross-tenant query and confirming it returns
        nothing.
      </p>
      <h3>4.2 Immutable audit logging</h3>
      <p>
        Every action affecting Customer Data — document processing, XML export, sign-off approvals,
        team changes — is written to an append-only audit log enforced by a database-level constraint.
        No user, including {APP_NAME} administrators, can edit or delete a historical entry.
      </p>
      <h3>4.3 Encryption</h3>
      <p>Data is encrypted in transit via TLS. Database-level encryption at rest is provided by our infrastructure sub-processor (Supabase).</p>
      <h3>4.4 Access control</h3>
      <p>
        Access within a customer organization is role-based (owner, admin, compliance manager, viewer),
        with sensitive actions — team management, plan changes, XML export sign-off — restricted to
        appropriate roles and enforced server-side, not just hidden in the interface.
      </p>
      <h3>4.5 Authentication</h3>
      <p>
        Authentication is handled by Supabase Auth. Enterprise customers may configure Single Sign-On
        (SAML) so their users authenticate through their own identity provider — contact your account
        team to set this up.
      </p>

      <h2>5. Data retention and deletion</h2>
      <p>
        See our <Link href="/privacy">Privacy Policy</Link>&apos;s retention section for full detail,
        including the specific interaction between deletion requests and the immutable audit log.
      </p>

      <h2>6. International transfers</h2>
      <p>
        Where a sub-processor is located outside the EU/EEA, transfers rely on that provider&apos;s own
        appropriate safeguards (such as Standard Contractual Clauses). Enterprise customers with
        specific data-residency requirements should discuss these with their account team before
        onboarding.
      </p>

      <h2>7. Requesting a signed DPA</h2>
      <p>
        Enterprise and Custom-tier customers requiring a formal, signed Data Processing Agreement under
        GDPR Article 28 can request one at{" "}
        <a href="mailto:legal@canoryai.example">legal@canoryai.example</a>.
      </p>
    </ContentPageLayout>
  );
}
