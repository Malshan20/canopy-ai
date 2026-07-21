import Link from "next/link";
import { Leaf } from "lucide-react";

// Anchors are root-relative ("/#platform", not "#platform") because this
// footer also renders on /contact and /contact/track — a bare "#platform"
// only scrolls correctly when already on the homepage; anywhere else it's
// a silent no-op click.
const FOOTER_COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Platform", href: "/#platform" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Security", href: "/#security" },
      { label: "Sign in", href: "/login" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "FAQ", href: "/#faq" },
      { label: "EUDR guide", href: "/eudr-guide" },
      { label: "API docs", href: "/api-docs" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy policy", href: "/privacy" },
      { label: "Terms of service", href: "/terms" },
      { label: "Data processing", href: "/data-processing" },
      { label: "Security", href: "/security" },
    ],
  },
];

/** Server Component — no client-side JS needed for a static footer. */
export function Footer() {
  return (
    <footer className="bg-[var(--mkt-forest-deep)]">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-white">
                <Leaf className="size-4 text-[var(--mkt-forest-deep)]" aria-hidden="true" />
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-white">
                CanoryAI
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">
              AI-powered EUDR compliance for enterprise commodity importers — document
              intelligence, satellite verification, and immutable audit trails in one platform.
            </p>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <div key={column.heading}>
              <h3 className="text-sm font-semibold text-white">{column.heading}</h3>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/70 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-white/15 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-white/60">
            © {new Date().getFullYear()} CanoryAI. All rights reserved.
          </p>
          <p className="text-xs text-white/60">
            Built for EU Regulation 2023/1115 compliance.
          </p>
        </div>
      </div>
    </footer>
  );
}
