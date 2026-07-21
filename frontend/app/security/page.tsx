import type { Metadata } from "next";
import Link from "next/link";
import { ContentPageLayout } from "@/components/marketing/content-page-layout";
import { APP_NAME } from "@/constants/config";

export const metadata: Metadata = {
  title: "Security",
  description: `How ${APP_NAME} protects your data — tenant isolation, audit trail integrity, and access control, explained plainly.`,
  alternates: { canonical: "/security" },
};

export default function SecurityPage() {
  return (
    <ContentPageLayout eyebrow="Security" title={`Security at ${APP_NAME}`} lastUpdated="July 17, 2026">
      <p>
        This page describes what we actually do, in plain language — not a compliance badge wall.
        Compliance software handles sensitive supply-chain and legal data, so we&apos;d rather you
        understand the real architecture than take a claim at face value. If anything here raises a
        question, <Link href="/contact">ask us directly</Link> — including your own security team, if
        you have one.
      </p>

      <h2>Every organization&apos;s data is isolated at the database level</h2>
      <p>
        Your data isn&apos;t separated by an application-layer filter that a bug could bypass —
        it&apos;s enforced by PostgreSQL&apos;s own Row Level Security, forced on every table that
        holds customer data, regardless of which part of the application is making the query. The
        database itself refuses to return another organization&apos;s rows, not just the interface
        that happens to ask for yours.
      </p>
      <p>
        This is checked automatically, every time the application starts: if its database connection
        were ever misconfigured with a role that could bypass that isolation, the application refuses
        to start at all, rather than run in a state where that protection might be silently disabled.
      </p>

      <h2>The audit trail can&apos;t be edited — by anyone, including us</h2>
      <p>
        Every action on a shipment, document, or compliance decision is logged to an audit trail that
        is enforced immutable at the database level: a modification or deletion attempt is rejected by
        the database itself, not merely disallowed by an application permission someone could change
        later. A compliance record that could be quietly edited after the fact wouldn&apos;t hold up in
        a real inspection, so it isn&apos;t editable at all.
      </p>

      <h2>Access control</h2>
      <ul>
        <li>
          <strong>Invite-only accounts.</strong> There is no public self-serve signup. Every workspace
          and every user is provisioned deliberately, which meaningfully reduces the exposure a fully
          open registration flow would create.
        </li>
        <li>
          <strong>Role-based permissions.</strong> Owner, admin, compliance manager, and viewer roles
          determine what a person can see and do — not everyone in your organization needs, or gets,
          the same level of access.
        </li>
        <li>
          <strong>API keys are hashed, never stored in plaintext.</strong> A database compromise would
          not expose usable API credentials.
        </li>
        <li>
          <strong>Authentication is handled by Supabase Auth</strong>, not a custom-built login system —
          industry-standard, independently maintained authentication infrastructure rather than
          something we rolled ourselves.
        </li>
      </ul>

      <h2>What we honestly haven&apos;t done yet</h2>
      <p>
        We&apos;d rather tell you this than have you assume it: {APP_NAME} has not yet completed a
        third-party security audit or penetration test, and does not currently hold SOC 2 or ISO 27001
        certification. Both are on our roadmap as the company grows. If a formal audit or certification
        is a requirement for your organization today, tell us — we&apos;d rather know that upfront than
        have it surface later.
      </p>

      <h2>Questions, or a security review to complete?</h2>
      <p>
        If your organization has a security questionnaire, a vendor review process, or you&apos;d just
        like to talk through the architecture in more depth, <Link href="/contact">reach out</Link> —
        you&apos;ll hear back from the people who actually built this, not a support queue.
      </p>
    </ContentPageLayout>
  );
}
