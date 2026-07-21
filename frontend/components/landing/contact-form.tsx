"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, Copy, Check } from "lucide-react";

import { createContactTicket } from "@/services/api";
import { cn } from "@/lib/utils";

const fieldClasses =
  "w-full rounded-lg border border-[var(--mkt-border)] bg-white px-4 py-2.5 text-sm text-[var(--mkt-ink)] placeholder:text-[var(--mkt-muted)] transition-colors focus:border-[var(--mkt-forest)] focus:outline-none focus:ring-2 focus:ring-[var(--mkt-forest)]/20";

/**
 * The marketing site's contact form — deliberately self-contained rather
 * than built on the dashboard's Input/Textarea, which use the
 * authenticated app's own color tokens (--input, --card) that the
 * ".marketing" scope doesn't override. This is currently the only form
 * on the public site, so a shared marketing-form-primitive system would
 * be premature abstraction for one use case.
 */
export function ContactForm() {
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  // Every "Book a Demo" / "Talk to Sales" CTA on the marketing site
  // routes here with a pre-filled subject (e.g.
  // /contact?subject=Enterprise+Demo+Request) instead of a mailto: link —
  // this form creates a real, tracked ticket regardless of whether
  // transactional email is configured yet, unlike a mailto address that
  // silently goes nowhere if it's ever wrong or unmonitored. Read as the
  // initial state directly (not via a useEffect + setState, which would
  // cause an extra render for a value already known on first render).
  const [subject, setSubject] = useState(() => searchParams.get("subject") ?? "");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await createContactTicket({
      name: name.trim(),
      email: email.trim(),
      company: company.trim() || undefined,
      subject: subject.trim(),
      message: message.trim(),
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setTicketNumber(result.data.ticket_number);
  }

  function handleCopy() {
    if (!ticketNumber) return;
    navigator.clipboard.writeText(ticketNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (ticketNumber) {
    return (
      <div className="rounded-xl border border-[var(--mkt-border)] bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-[var(--mkt-forest)]/10">
          <CheckCircle2 className="size-6 text-[var(--mkt-forest)]" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-semibold text-[var(--mkt-ink)]">Message received</h3>
        <p className="mt-2 text-sm text-[var(--mkt-muted)]">
          We&apos;ll get back to you shortly. Your ticket number is:
        </p>
        <div className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-lg border border-[var(--mkt-border)] bg-[var(--mkt-canvas)] px-4 py-2">
          <span className="font-mono text-base font-semibold text-[var(--mkt-ink)]">{ticketNumber}</span>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy ticket number"
            className="text-[var(--mkt-muted)] transition-colors hover:text-[var(--mkt-forest)]"
          >
            {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          </button>
        </div>
        <p className="mt-4 text-xs text-[var(--mkt-muted)]">
          We also emailed this to you. Save it to check your ticket&apos;s status or add a reply anytime —
          no account needed.
        </p>
        <Link
          href={`/contact/track?ticket=${encodeURIComponent(ticketNumber)}&email=${encodeURIComponent(email.trim())}`}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-[var(--mkt-forest)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--mkt-forest-deep)]"
        >
          Track this ticket
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-[var(--mkt-border)] bg-white p-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-xs font-medium text-[var(--mkt-body)]">
            Name
          </label>
          <input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldClasses}
            placeholder="Jane Smith"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-[var(--mkt-body)]">
            Work email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClasses}
            placeholder="jane@company.com"
          />
        </div>
      </div>

      <div>
        <label htmlFor="company" className="mb-1.5 block text-xs font-medium text-[var(--mkt-body)]">
          Company <span className="text-[var(--mkt-muted)]">(optional)</span>
        </label>
        <input
          id="company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className={fieldClasses}
          placeholder="Acme Imports Ltd."
        />
      </div>

      <div>
        <label htmlFor="subject" className="mb-1.5 block text-xs font-medium text-[var(--mkt-body)]">
          Subject
        </label>
        <input
          id="subject"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className={fieldClasses}
          placeholder="Question about Enterprise pricing"
        />
      </div>

      <div>
        <label htmlFor="message" className="mb-1.5 block text-xs font-medium text-[var(--mkt-body)]">
          Message
        </label>
        <textarea
          id="message"
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={cn(fieldClasses, "resize-none")}
          placeholder="Tell us a bit about what you're looking for..."
        />
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--mkt-forest)] px-5 py-3 text-sm font-medium text-white shadow-[0_18px_40px_-14px_rgba(11,110,79,0.55)] transition-colors hover:bg-[var(--mkt-forest-deep)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Sending...
          </>
        ) : (
          "Send message"
        )}
      </button>

      <p className="text-center text-xs text-[var(--mkt-muted)]">
        Already have a ticket?{" "}
        <Link href="/contact/track" className="font-medium text-[var(--mkt-forest)] hover:underline">
          Track it here
        </Link>
      </p>
    </form>
  );
}
