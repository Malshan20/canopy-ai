import { Suspense } from "react";
import type { Metadata } from "next";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { ContactForm } from "@/components/landing/contact-form";
import { APP_NAME } from "@/constants/config";

export const metadata: Metadata = {
  title: "Contact",
  description: `Get in touch with the ${APP_NAME} team — sales, support, or general questions.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="marketing font-sans">
      <Navbar />
      <main className="mx-auto max-w-xl px-5 py-20 sm:px-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--mkt-forest)]">Get in touch</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--mkt-ink)] sm:text-4xl">
            Contact us
          </h1>
          <p className="mt-3 text-sm text-[var(--mkt-muted)]">
            Questions about pricing, a demo, or how {APP_NAME} fits your supply chain — we usually
            reply within one business day.
          </p>
        </div>

        <div className="mt-10">
          <Suspense fallback={null}>
            <ContactForm />
          </Suspense>
        </div>
      </main>
      <Footer />
    </div>
  );
}
