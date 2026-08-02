import type { Metadata } from "next";
import { Suspense } from "react";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { TicketTracker } from "@/components/landing/ticket-tracker";
import { APP_NAME } from "@/constants/config";

export const metadata: Metadata = {
  title: "Track your ticket",
  description: `Check the status of a support ticket with ${APP_NAME}, or reply to an existing one.`,
  alternates: { canonical: "/contact/track" },
  robots: { index: false, follow: false },
};

export default function TrackTicketPage() {
  return (
    <div className="marketing font-sans">
      <Navbar />
      <main className="mx-auto max-w-xl px-5 py-20 sm:px-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--mkt-forest)]">Support</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--mkt-ink)] sm:text-4xl">
            Track your ticket
          </h1>
          <p className="mt-3 text-sm text-[var(--mkt-muted)]">
            Enter your ticket number and the email you used to submit it.
          </p>
        </div>

        <div className="mt-10">
          <Suspense fallback={null}>
            <TicketTracker />
          </Suspense>
        </div>
      </main>
      <Footer />
    </div>
  );
}
